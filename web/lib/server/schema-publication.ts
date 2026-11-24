import { PROGRAMPLAN_LANGUAGE_LADDERS } from '../programplan-languages.ts';
import { SCHEMA_TERMS, SchemaContractError, type SchemaForslagRequest, type SchemaTerm } from '../schema-contract.ts';
import { schemaDateradeAktivitetsbortfall, schemaDateradeAktivitetsflyttar } from '../schema-daterad-aktivitet.ts';
import { schemaDatumUnderlag } from '../schema-datum-underlag.ts';
import { schemaDatumTermTillaten } from '../schema-datum.ts';
import { SCHEMA_DRAFT_VERSION, SchemaDraftError, schemaDraftHash, type SchemaDraft, type SchemaDraftDocument } from '../schema-draft-contract.ts';
import {
  parseSchemaPublicationReply, parseSchemaPublicationRequest, type SchemaPublicationReply, type SchemaPublicationRequest, type SchemaPublicationTrack,
} from '../schema-publication-contract.ts';
import { buildSchemaUnderlag } from '../schema-underlag.ts';
import type { StudyGroup, StudyGroupCourse } from '../study-group-model.ts';
import type { TjanstPlanRead } from '../tjanst-contract.ts';
import { AuditUnavailable, denyResponse, protectedRoute, requireFunction, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { logEvent, type EventInput } from './events.ts';
import { json } from './http.ts';
import { requireSyntheticMandates } from './mandate-route.ts';
import { prepareSchemaDraft, readDraftBasis, readSchemaDraftSnapshot, schemaDraftSourceHash } from './schema-draft.ts';
import { SchemaEngineError, validateSchema } from './schemamotor.ts';
import { readStudyGroups } from './study-groups.ts';
import { tjanstRequest } from './tjanst.ts';

type Publish = Extract<SchemaPublicationRequest, { action: 'publish' }>;
type ReadBasis = Awaited<ReturnType<typeof readDraftBasis>>;
type Level = Omit<StudyGroupCourse, 'points'>;
type Target = Pick<SchemaPublicationTrack, 'kind' | 'targetId'> & Level;
type SqlInput = SchemaPublicationRequest | (Omit<Publish, 'action'> & { action: 'receipt' }) | (Publish & { sourceHash: string; tracks: SchemaPublicationTrack[] });
const FUNCTIONS = ['rektor', 'administrator'] as const;
const FIXED_GY25_ROW = /^(?:foundation|programmeSpecific|orientation|specialization):(\p{L}[\p{L}\p{N}_-]*):([1-9]\d{0,5}):(\p{L}[\p{L}\p{N}_-]*)$/u;
const LANGUAGE_LEVELS = new Set(PROGRAMPLAN_LANGUAGE_LADDERS.filter(ladder => ladder.languageRequired)
  .flatMap(ladder => ladder.steps.map(level => `${level.subjectCode}:${level.itemCode}`)));
const CONFLICTS = new Set(['schema_publication_draft_changed', 'schema_publication_not_ready', 'schema_publication_command_conflict', 'schema_publication_already_published']);
const DATABASE_UNAVAILABLE = new Set(['42P01', '42883', '08001', '08003', '08006', '57P01', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT']);

const draftChanged = () => new Deny('conflict', 409, { reason: 'schema_publication_draft_changed' });
const notReady = () => new Deny('conflict', 409, { reason: 'schema_publication_not_ready' });
const event = (action: string, input: SchemaPublicationRequest, id?: string) => ({
  action, objectType: 'schema_publication', objectId: id ?? null, details: { unitId: input.unitId, schoolYear: input.schoolYear },
} satisfies EventInput);

async function publicationSql(tx: Tx, input: SqlInput, expected: SchemaPublicationRequest): Promise<SchemaPublicationReply> {
  let rows: { result: unknown }[];
  try { rows = await tx<{ result: unknown }[]>`select public.schema_publication(${tx.json(input)}) as result`; }
  catch (error) {
    const { code, hint } = error as { code?: string; hint?: string };
    if (code === '42501') throw new Deny('forbidden', 403);
    if (code === '55000') throw new AuditUnavailable();
    if (code === '40001' && hint && CONFLICTS.has(hint)) throw new Deny('conflict', 409, { reason: hint });
    if (code === '22023') throw new Deny('bad_request', 400, { reason: 'schema_publication_invalid' });
    if (code && DATABASE_UNAVAILABLE.has(code)) throw new Deny('db_unreachable', 503);
    throw error;
  }
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    const reply = parseSchemaPublicationReply(rows[0].result, expected);
    if (input.action === 'publish' && reply.publication === null) throw new AuditUnavailable();
    return reply;
  } catch { throw new AuditUnavailable(); }
}

function readRequest(input: Publish, draft: SchemaDraft): SchemaForslagRequest {
  return { unitId: input.unitId, schoolYear: input.schoolYear, period: input.period, villkor: draft.basisVillkor ?? draft.workingVillkor };
}

function placedDraft(draft: SchemaDraftDocument) {
  const { base, control } = draft;
  if (!base?.time.calendar || !draft.basisVillkor || !control || base.status !== 'complete' || !base.lessons.length
    || control.metrics.unplaced || draft.placements.length !== base.lessons.length || control.total || draft.intentional.length
    || draft.requiresRecalculation) throw notReady();
  return { base, calendar: base.time.calendar };
}

async function checkSource(read: ReadBasis, draft: SchemaDraft) {
  const hash = await schemaDraftSourceHash(read, [draft.basisVillkor, draft.workingVillkor]);
  if (hash !== draft.sourceHash) throw draftChanged();
  if (read.plan.version?.status !== 'published' || !read.basis.time.current || read.basis.time.status !== 'faststalld'
    || !read.sourceRefs.calendarVersionId || !read.datedBasis.complete) throw notReady();
}

/** Ämnesnivå hämtas ur den frusna Gy25-radnyckeln eller gruppens kurs, aldrig ur passets visningsnamn. */
function publicationTargets(plan: TjanstPlanRead, groups: StudyGroup[]): Map<string, Target[]> {
  const bySource = new Map<string, Target>();
  for (const c of plan.classes) {
    if (c.link?.schoolform !== 'gymnasium') continue;
    for (const need of c.needs) {
      const match = FIXED_GY25_ROW.exec(need.rowKey);
      if (!match) continue;
      const [, subjectCode, version, itemCode] = match;
      if (LANGUAGE_LEVELS.has(`${subjectCode}:${itemCode}`)) continue;
      bySource.set(need.sourceKey, { kind: 'class', targetId: c.classId, subjectCode, subjectVersion: Number(version), itemCode, languageCode: null });
    }
  }
  const byGroup = new Map(groups.map(group => [group.id, group]));
  for (const g of plan.groups ?? []) {
    if (g.sourceKind !== 'study_group' || g.stale) continue;
    const group = byGroup.get(g.groupId);
    if (!group?.active || g.groupRevision !== group.revision || !group.course) continue;
    const { subjectCode, subjectVersion, itemCode, languageCode } = group.course;
    if (languageCode === null && LANGUAGE_LEVELS.has(`${subjectCode}:${itemCode}`)) continue;
    bySource.set(g.sourceKey, { kind: 'group', targetId: g.groupId, subjectCode, subjectVersion, itemCode, languageCode });
  }
  const result = new Map([...bySource].map(([sourceKey, target]) => [`undervisning:${sourceKey}`, [target]]));
  const rowSources = new Map(plan.rows.map(row => [row.id, row.sourceKey]));
  for (const joint of plan.joints) {
    const targets = joint.rowIds.flatMap(rowId => {
      const source = rowSources.get(rowId);
      const target = source ? bySource.get(source) : undefined;
      return target ? [target] : [];
    });
    if (targets.length) result.set(`samlasning:${joint.lineageId ?? joint.id}`, targets);
  }
  return result;
}

async function publicationTracks(input: Publish, draft: SchemaDraft, read: ReadBasis, groups: StudyGroup[]): Promise<SchemaPublicationTrack[]> {
  if (draft.datedActivityDefinitions?.length) throw notReady();
  const ready = placedDraft(draft);
  const rebuilt = await prepareSchemaDraft(read, {
    contractVersion: SCHEMA_DRAFT_VERSION, unitId: input.unitId, schoolYear: input.schoolYear, period: input.period,
    commandId: input.commandId, draftId: draft.id, expectedRevision: draft.revision, name: draft.name,
    basisVillkor: draft.basisVillkor, workingVillkor: draft.workingVillkor, grundFingerprint: ready.base.grundFingerprint,
    placements: draft.placements, locks: draft.locks, intentional: draft.intentional, datedOverrides: draft.datedOverrides, activityTypes: draft.activityTypes, datedActivities: draft.datedActivities,
  });
  const { base, calendar } = placedDraft(rebuilt);
  if (await schemaDraftHash(rebuilt) !== draft.contentHash) throw draftChanged();
  const request = readRequest(input, draft);
  const underlag = buildSchemaUnderlag(read.plan, {
    ...request, villkor: rebuilt.basisVillkor ?? request.villkor,
    ...(rebuilt.locks.length ? { locks: { grundFingerprint: base.grundFingerprint, placements: rebuilt.locks } } : {}),
  }, read.basis);
  if (underlag.omitted.some(o => o.reason === 'stale')) throw notReady();
  const dates = calendar.days.filter(day => day.schoolDay && schemaDatumTermTillaten(base.period, day.term));
  const terms = base.period === 'lasar' ? SCHEMA_TERMS : [base.period];
  if (terms.some(term => !dates.some(day => day.term === term))) throw notReady();
  const activities = rebuilt.datedActivities ?? [];
  const dated = schemaDatumUnderlag(read.plan, underlag, base, read.datedBasis,
    schemaDateradeAktivitetsflyttar(rebuilt.datedOverrides, activities), dates.map(day => day.date), false, 'allaAndringar', schemaDateradeAktivitetsbortfall(activities));
  if (dated.violations.length || !dated.days.some(day => day.occurrences.size)) throw notReady();

  const targets = publicationTargets(read.plan, groups);
  const refs = new Map(rebuilt.source.lessonSources.map(source => [source.lesson, source.ref]));
  const tracks = new Map<string, SchemaPublicationTrack>();
  const validatedDays = new Set<string>();
  const addTeachingDate = (ref: string, term: SchemaTerm, date: string) => {
    for (const target of targets.get(ref) ?? []) {
      const key = JSON.stringify([target.kind, target.targetId, target.subjectCode, target.subjectVersion, target.itemCode, target.languageCode, term]);
      const track: SchemaPublicationTrack = tracks.get(key) ?? { ...target, term, days: [] };
      if (track.days.at(-1) !== date) track.days.push(date);
      tracks.set(key, track);
    }
  };
  for (const day of dated.days) {
    const term = calendar.days.find(item => item.date === day.date)?.term;
    if (term) for (const activity of activities.filter(item => item.date === day.date)) {
      for (const ref of activity.credits) addTeachingDate(ref, term, day.date);
    }
    if (!day.problem.lessons.length) continue;
    // Kalenderdagens ID styr presentationen. Samma regler, deltagarkluster och placeringar ger samma kontrollresultat.
    const { id: _id, ...problem } = day.problem;
    const key = JSON.stringify([problem, day.placements]);
    if (!validatedDays.has(key)) {
      if ((await validateSchema(day.problem, day.placements)).violations.length) throw notReady();
      validatedDays.add(key);
    }
    for (const occurrence of day.occurrences.values()) {
      const ref = refs.get(occurrence.lesson.id);
      if (!ref || !occurrence.term) throw new AuditUnavailable();
      addTeachingDate(ref, occurrence.term, occurrence.date);
    }
  }
  return [...tracks.values()];
}

export async function schemaPublicationRoute(request: Request): Promise<Response> {
  const prepared: { input?: Publish; draft?: SchemaDraft; read?: ReadBasis; groups?: StudyGroup[]; ctx?: Context } = {};
  const first = await protectedRoute(request, 'schema_publication_read', { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request);
    requireSyntheticMandates();
    const input = await tjanstRequest(request, parseSchemaPublicationRequest, 4096);
    if (input.action === 'status') {
      const body = await publicationSql(tx, input, input);
      return { body, event: event('schema_publication_status', input, body.publication?.id) };
    }
    requireFunction(ctx, ['rektor']);
    const receipt = await publicationSql(tx, { ...input, action: 'receipt' }, input);
    if (receipt.publication) return { body: receipt, event: event('schema_publication_receipt', input, receipt.publication.id) };

    const draft = await readSchemaDraftSnapshot(tx, ctx, { contractVersion: SCHEMA_DRAFT_VERSION, unitId: input.unitId, schoolYear: input.schoolYear, period: input.period });
    if (!draft || draft.id !== input.draftId || draft.revision !== input.revision || draft.contentHash !== input.contentHash) throw draftChanged();
    placedDraft(draft);
    const read = await readDraftBasis(request, tx, ctx, readRequest(input, draft));
    await checkSource(read, draft);
    const study = await readStudyGroups(tx, ctx, { unitId: input.unitId, schoolYear: input.schoolYear });
    try { await logEvent(tx, ctx, { ...study.event, outcome: 'ok' }); } catch { throw new AuditUnavailable(); }
    Object.assign(prepared, { input, draft, read, groups: study.body.groups, ctx });
    return { body: null, event: event('schema_publication_prepare', input, draft.id) };
  });
  if (!first.ok || !prepared.input || !prepared.draft || !prepared.read || !prepared.groups) return first;
  const { input, draft, read, groups, ctx } = prepared;
  const correlationId = first.headers.get('X-Correlation-Id') ?? '';
  let tracks: SchemaPublicationTrack[];
  try { tracks = await publicationTracks(input, draft, read, groups); }
  catch (error) {
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', details: { reason: error.reason }, correlationId },
      { correlationId, epoch: Number(first.headers.get('X-Context-Epoch')), status: 503 });
    const failure = error instanceof SchemaDraftError && error.reason === 'schema_draft_source_changed' ? draftChanged()
      : error instanceof SchemaContractError || error instanceof SchemaDraftError ? notReady() : error;
    return denyResponse(failure, request, correlationId, 'schema_publication_prepare', ctx);
  }
  return protectedRoute(request, 'schema_publication_published', { mutating: true, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    requireSyntheticMandates();
    const current = await readDraftBasis(request, tx, ctx, readRequest(input, draft));
    await checkSource(current, draft);
    const body = await publicationSql(tx, { ...input, sourceHash: draft.sourceHash, tracks }, input);
    return { body, event: event('schema_publication_published', input, body.publication?.id) };
  });
}
