/** Skyddad serverlagring av schemautkast. Browserns färdiga base-snapshot accepteras aldrig som källa. */
import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { json } from './http.ts';
import { readSchemaBasis } from './schema-read.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { valideraSchemaDatum } from './schema-datum.ts';
import type { SchemaDatedBasis } from '../schema-datum-underlag.ts';
import { SchemaDatumError, schemaDatumTermTillaten } from '../schema-datum.ts';
import { SchemaEngineError, validateSchema } from './schemamotor.ts';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll } from '../schema-underlag.ts';
import { SchemaContractError, checkSchemaPlacements, sammaGrund, villkorNyckel, type SchemaForslagRequest, type SchemaSolution, type SchemaVillkor } from '../schema-contract.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { avvikelseNyckel, medvetenKrock, medvetenMarkering, medvetnaAvvikelser } from '../schema-utkast.ts';
import { SCHEMA_DRAFT_BYTES, SCHEMA_DRAFT_VERSION, SchemaDraftError, parseSchemaDraft, parseSchemaDraftDocument, parseSchemaDraftReceipt, parseSchemaDraftSaveReply,
  parseSchemaDraftScope, parseSchemaDraftSave, parseSchemaDraftStatusRequest, parseSchemaDraftResetRequest, schemaDraftDocument, schemaDraftHash, schemaDraftResetHash,
  type SchemaDraft, type SchemaDraftDocument, type SchemaDraftLessonSource, type SchemaDraftReadReply, type SchemaDraftSave, type SchemaDraftSaveReply, type SchemaDraftScope,
  type SchemaDraftResetRequest, type SchemaDraftStatusRequest, type SchemaDraftStatusReply } from '../schema-draft-contract.ts';
import { logEvent, type EventInput } from './events.ts';
import { salIfyllning } from '../schema-utan-sal.ts';
import { NATIONELLA_PROV_VERSION, parseNationellaProvSave, provRensaMotorval } from '../nationella-prov.ts';
import { readNationellaProv, readNationellaProvMedMotorhistorik, sparaNationellaProv } from './nationella-prov.ts';

type ReadBasis = Awaited<ReturnType<typeof readSchemaBasis>> & { datedBasis: SchemaDatedBasis };
type RawEnvelope = { contractVersion: 'schema_draft_sql_v1'; actor: { identityId: string; assignmentId: string }; result: Record<string, unknown> };
const FUNCTIONS = ['rektor', 'administrator'] as const;
const scopeKeys = (scope: SchemaDraftScope) => ({ contractVersion: SCHEMA_DRAFT_VERSION, unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period });
const event = (action: string, input: SchemaDraftScope, id?: string | null): EventInput => ({ action, objectType: 'schema_draft', objectId: id ?? null,
  details: { unitId: input.unitId, schoolYear: input.schoolYear } });

/** Hård gräns innan JSON-tolkning. Innehållet skrivs aldrig till loggen. */
export async function schemaDraftRequest<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > SCHEMA_DRAFT_BYTES)) throw new Deny('bad_request', 400, { reason: 'schema_draft_too_large' });
  const reader = request.body?.getReader();
  if (!reader) throw new Deny('bad_request', 400);
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > SCHEMA_DRAFT_BYTES) { await reader.cancel(); throw new SchemaDraftError('schema_draft_too_large'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch (error) {
    throw new Deny('bad_request', 400, error instanceof SchemaDraftError ? { reason: error.reason } : undefined);
  } finally { reader.releaseLock(); }
}
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (error instanceof Deny || error instanceof AuditUnavailable) throw error;
    const e = error as { code?: string; hint?: string };
    if (e.code === '42501') throw new Deny('forbidden', 403);
    if (e.code === '55000') throw new AuditUnavailable();
    if (e.code === '40001') throw new Deny('conflict', 409, { reason: e.hint === 'schema_draft_command_conflict' ? e.hint : 'schema_draft_conflict' });
    if (e.code === '22023') throw new Deny('bad_request', 400, { reason: 'schema_draft_invalid' });
    if (['42P01', '42883', '08001', '08003', '08006', '57P01', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(e.code ?? '')) throw new Deny('db_unreachable', 503);
    throw error;
  }
}
function envelope(value: unknown, ctx: Context): RawEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditUnavailable();
  const e = value as RawEnvelope;
  if (Object.keys(e).sort().join() !== 'actor,contractVersion,result' || e.contractVersion !== 'schema_draft_sql_v1'
    || !e.actor || Object.keys(e.actor).sort().join() !== 'assignmentId,identityId'
    || e.actor.identityId !== ctx.identityId || e.actor.assignmentId !== ctx.assignmentId || !e.result || typeof e.result !== 'object') throw new AuditUnavailable();
  return e;
}
async function sqlRead(tx: Tx, ctx: Context, input: SchemaDraftScope) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.schema_read(${tx.json(scopeKeys(input))}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable(); return envelope(rows[0].result, ctx).result;
}
async function sqlStatus(tx: Tx, ctx: Context, input: SchemaDraftStatusRequest) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.schema_status(${tx.json(input)}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable(); return envelope(rows[0].result, ctx).result;
}
async function resetPrevious(tx: Tx, ctx: Context, scope: SchemaDraftScope, head: SchemaDraft, includeDraft: boolean) {
  const input = { ...scopeKeys(scope), draftId: head.id, expectedRevision: head.revision, includeDraft };
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.schema_reset_previous(${tx.json(input)}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable();
  const { previousRevision, draft } = envelope(rows[0].result, ctx).result;
  if (previousRevision === null && draft === null) return null;
  if (head.revision <= 1 || previousRevision !== head.revision - 1 || (draft !== null) !== includeDraft) throw new AuditUnavailable();
  const previous = includeDraft ? await rawDraft(draft, scope, false) : null;
  if (previous && (previous.id !== head.id || previous.revision !== previousRevision || previous.name !== head.name || !previous.placements.length)) throw new AuditUnavailable();
  return { revision: previousRevision, draft: previous };
}

async function resetProvPrevious(tx: Tx, input: SchemaDraftResetRequest) {
  const keys = { ...scopeKeys(input), draftId: input.draftId, expectedRevision: input.expectedRevision, includeDraft: false };
  const rows = await operation(() => tx<{ result: { clearedRevision: number; previousRevision: number } | null }[]>`
    select public.schema_prov_reset_previous(${tx.json(keys)}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable();
  const { result } = rows[0];
  if (result === null) return null;
  if (!result || Object.keys(result).sort().join() !== 'clearedRevision,previousRevision'
    || !Number.isSafeInteger(result.clearedRevision) || !Number.isSafeInteger(result.previousRevision)
    || result.previousRevision < 1 || result.clearedRevision !== result.previousRevision + 1) throw new AuditUnavailable();
  return result;
}

async function resetProv(tx: Tx, ctx: Context, input: SchemaDraftResetRequest, read: ReadBasis) {
  const { unitId, schoolYear, period, commandId, draftId } = input;
  if (schoolYear < 2000 || schoolYear > 2100) return;
  const dates = new Set(read.basis.time?.dates?.filter(day => schemaDatumTermTillaten(period, day.term)).map(day => day.date));
  if (input.action === 'clear' && !dates.size) return;

  // Samma ordning som provtillämpningen. Utkastets kommandolås är redan taget genom schema_status.
  await tx`select pg_advisory_xact_lock(hashtextextended(${commandId}, 2026111901))`;
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${unitId}/${schoolYear}`}, 2026111902))`;

  const previous = input.action === 'undo' ? await resetProvPrevious(tx, input) : null;
  if (input.action === 'undo' && !previous) return;
  const register = await readNationellaProv(tx, ctx, unitId, schoolYear);
  if (previous && register?.revision !== previous.clearedRevision) throw new Deny('conflict', 409, { reason: 'schema_reset_prov_changed' });
  if (!register) return;

  const original = await readNationellaProvMedMotorhistorik(tx, ctx, unitId, schoolYear, previous?.previousRevision ?? register.revision);
  if (!original) throw new AuditUnavailable();
  let bokningar = register.document.bokningar;
  if (!previous) {
    const selected = { ...original, bokningar: original.bokningar.filter(booking => dates.has(booking.datum)) };
    const cleared = provRensaMotorval(selected, draftId);
    if (selected === cleared) return;
    const changes = new Map(cleared.bokningar.flatMap((booking, index) => booking === selected.bokningar[index] ? [] : [[booking.id, booking] as const]));
    bokningar = bokningar.map(booking => changes.get(booking.id) ?? booking);
  } else {
    const beforeClear = new Map(original.bokningar.map(booking => [booking.id, booking]));
    bokningar = bokningar.map(booking => {
      const before = beforeClear.get(booking.id);
      return before && (before.salId !== booking.salId || JSON.stringify(before.vakter) !== JSON.stringify(booking.vakter)) ? before : booking;
    });
  }

  const request = parseNationellaProvSave({ contractVersion: NATIONELLA_PROV_VERSION, unitId, schoolYear, commandId,
    expectedRevision: register.revision, document: { ...register.document, bokningar } });
  const saved = await sparaNationellaProv(tx, ctx, request, { onlyResources: true });
  if (saved.replayed) throw new Deny('conflict', 409, { reason: 'schema_draft_command_conflict' });
  try {
    await logEvent(tx, ctx, { ...event('nationella_prov_saved', input, unitId), objectType: 'nationella_prov', outcome: 'ok' });
  } catch { throw new AuditUnavailable(); }
}

const currentInput = (input: SchemaDraftScope, villkor: SchemaForslagRequest['villkor']): SchemaForslagRequest => ({ unitId: input.unitId, schoolYear: input.schoolYear, period: input.period, villkor });
const sourceConflict = (input: SchemaDraftSave) => input.forslagFingerprint === undefined ? 'schema_draft_source_changed' : 'schema_preview_outdated';
/** Digest räknas på faktisk källa. Rollens capabilities, actions och historik är inga källförändringar. */
export const schemaDraftSourceHash = (read: ReadBasis, conditions: (SchemaVillkor | null)[] = []): Promise<string> => {
  const p = read.plan;
  const used = new Set(conditions.flatMap(v => v ? [...v.egna.flatMap(r => r.slag === 'larare' ? [r.ref] : []), ...(v.aktiviteter ?? []).flatMap(a => a.teacherRefs)] : []));
  return schemaDraftHash({ plan: { contractVersion: p.contractVersion, unitId: p.unitId, schoolYear: p.schoolYear, schoolName: p.schoolName,
    revision: p.revision, version: p.version, teachers: p.teachers, classes: p.classes, rows: p.rows, groups: p.groups ?? [], specials: p.specials,
    joints: p.joints, sharing: p.sharing }, members: read.basis.members, time: read.basis.time, sourceRefs: read.sourceRefs, datedBasis: read.datedBasis ?? null,
    usedPersonal: (read.basis.personer ?? []).filter(t => used.has(t.ref) && !p.teachers.some(p => p.personId === t.ref)) });
};
export async function readDraftBasis(request: Request, tx: Tx, ctx: Context, input: SchemaForslagRequest): Promise<ReadBasis> {
  const read = await readSchemaBasis(request, tx, ctx, input);
  const dated = await readSchemaDatedBasis(tx, ctx, { unitId: input.unitId, schoolYear: input.schoolYear });
  // De övriga källäsningarna loggas inne i läsaren; planhändelsen lämnas åt anroparen.
  try { for (const entry of [read.event, dated.event]) await logEvent(tx, ctx, { ...entry, outcome: 'ok' }); } catch { throw new AuditUnavailable(); }
  return { ...read, datedBasis: dated.body };
}

async function rawDraft(value: unknown, scope: SchemaDraftScope, stale: boolean) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaDraftError();
    const r = value as Record<string, unknown>, document = parseSchemaDraftDocument(r.document, scope);
    const draft = parseSchemaDraft({ id: r.id, name: r.name, revision: r.revision, savedAt: r.savedAt, contentHash: r.contentHash, sourceHash: r.sourceHash, stale, ...document }, scope);
    if (draft.contentHash !== await schemaDraftHash(document) || draft.sourceHash !== document.source.digest) throw new SchemaDraftError();
    return draft;
  } catch { throw new AuditUnavailable(); }
}
export async function readSchemaDraftSnapshot(tx: Tx, ctx: Context, scope: SchemaDraftScope) {
  const result = await sqlRead(tx, ctx, scope);
  return result.draft === null ? null : rawDraft(result.draft, scope, false);
}

export async function readSchemaDraftReceipt(tx: Tx, ctx: Context, scope: SchemaDraftScope, commandId: string) {
  const result = await sqlStatus(tx, ctx, { ...scopeKeys(scope), commandId, draftId: null });
  try {
    if (result.state === 'not_found' && result.receipt === null) return null;
    if (result.state !== 'completed') throw new SchemaDraftError();
    const receipt = parseSchemaDraftReceipt(result.receipt);
    if (receipt.commandId !== commandId) throw new SchemaDraftError();
    return receipt;
  } catch { throw new AuditUnavailable(); }
}

function draftUnderlag(read: ReadBasis, input: SchemaDraftSave, basisVillkor: SchemaVillkor) {
  try {
    const originalRequest = currentInput(input, basisVillkor), original = buildSchemaUnderlag(read.plan, originalRequest, read.basis);
    if (original.grundFingerprint !== input.grundFingerprint) throw new SchemaDraftError(sourceConflict(input));
    let request = originalRequest, underlag = original, requiresRecalculation = !sammaGrund(basisVillkor, input.workingVillkor);
    if (!requiresRecalculation) {
      const candidate = buildSchemaUnderlag(read.plan, currentInput(input, input.workingVillkor), read.basis);
      if (candidate.grundFingerprint === original.grundFingerprint) { underlag = candidate; request = currentInput(input, input.workingVillkor); }
      else requiresRecalculation = true;
    }
    if (input.locks.length) {
      request = { ...request, locks: { grundFingerprint: original.grundFingerprint, placements: input.locks } };
      underlag = buildSchemaUnderlag(read.plan, request, read.basis);
    }
    // Kontrollera också den speglade salinformationen. Hela salregistret ingår inte i motorns problem.
    if (input.forslagFingerprint !== undefined && (requiresRecalculation || underlag.fingerprint !== input.forslagFingerprint
      || villkorNyckel(underlag.villkor) !== villkorNyckel(basisVillkor) || villkorNyckel(underlag.villkor) !== villkorNyckel(input.workingVillkor))) {
      throw new SchemaDraftError('schema_preview_outdated');
    }
    return { request, underlag, requiresRecalculation };
  } catch (error) {
    if (input.forslagFingerprint !== undefined && (error instanceof SchemaFordelningError || error instanceof SchemaContractError)) {
      throw new SchemaDraftError('schema_preview_outdated');
    }
    throw error;
  }
}

/** Förbereder bara servergenererade värden; detta är inte en DB-skrivning. */
export async function prepareSchemaDraft(read: ReadBasis, input: SchemaDraftSave): Promise<SchemaDraftDocument> {
  const digest = await schemaDraftSourceHash(read, [input.basisVillkor, input.workingVillkor]), source = { planId: read.plan.version?.id ?? null, planRevision: read.plan.revision,
    calendarVersionId: read.sourceRefs.calendarVersionId, calendarVersion: read.basis.time.version, lessonSources: [] as SchemaDraftLessonSource[], digest };
  const classes = new Set(read.plan.classes.map(c => c.classId)), groups = new Set((read.plan.groups ?? []).map(g => g.groupId));
  const teachers = new Set([...read.plan.teachers.map(t => t.personId), ...(read.basis.personer ?? []).map(t => t.ref)]);
  for (const v of [input.basisVillkor, input.workingVillkor]) if (v) {
    if (v.egna.some(r => r.slag === 'larare' && !teachers.has(r.ref)) || (v.aktiviteter ?? []).some(a =>
      a.teacherRefs.some(ref => !teachers.has(ref)) || a.classRefs.some(ref => !classes.has(ref)) || a.groupRefs.some(ref => !groups.has(ref)) || a.rooms.some(room => !v.salar.includes(room)))) {
      throw new SchemaDraftError(input.forslagFingerprint === undefined ? 'schema_draft_invalid' : 'schema_preview_outdated');
    }
  }
  if (!input.basisVillkor) return { documentVersion: 1, base: null, basisVillkor: null, workingVillkor: input.workingVillkor, placements: [], locks: [],
    intentional: [], datedOverrides: [], activityTypes: input.activityTypes, control: null, requiresRecalculation: true, source };
  const { request, underlag, requiresRecalculation } = draftUnderlag(read, input, input.basisVillkor);
  const lessons = new Map(underlag.problem.lessons.map(lesson => [lesson.id, lesson]));
  if (input.placements.some(p => p.room !== null && !lessons.get(p.lesson)?.rooms?.allowed.includes(p.room))) throw new SchemaDraftError();
  const placements = checkSchemaPlacements(input.placements, underlag.problem, salIfyllning(underlag.villkor));
  if (input.forslagFingerprint !== undefined) {
    const positions = new Map(placements.map(p => [p.lesson, p]));
    if (placements.some((p, i) => p.room !== input.placements[i].room) || input.locks.some(lock => positions.get(lock.lesson)?.room !== lock.room)) {
      throw new SchemaDraftError();
    }
  }
  const check = underlag.problem.lessons.length
    ? await validateSchema(underlag.problem, placements) : { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };
  const ids = new Set(placements.map(p => p.lesson)), unplaced = underlag.problem.lessons.filter(l => !ids.has(l.id)).map(l => l.id);
  const solution: SchemaSolution = { status: underlag.problem.lessons.length === 0 ? 'input_missing' : unplaced.length ? 'time_limit' : 'complete', placements, unplaced, diagnoses: [], metrics: check.metrics, elapsedMs: 0 };
  // Kvalitetsmåtten är granskningsdata. Lämna det hashade utkastskontraktet kompatibelt med äldre klienter.
  const base = schemaForslag(read.plan, request, underlag, solution, false), control = schemaKontroll(underlag, placements, check, false);
  if (input.forslagKalenderHash !== undefined && await schemaDraftHash(base.time) !== input.forslagKalenderHash) {
    throw new SchemaDraftError('schema_preview_outdated');
  }
  // Valbara men oanvända personalnamn följer inte med in i ett delat skolutkast.
  const usedTeachers = new Set([...read.plan.teachers.map(t => t.personId), ...[underlag.villkor, input.workingVillkor].flatMap(v => [
    ...v.egna.flatMap(r => r.slag === 'larare' ? [r.ref] : []), ...(v.aktiviteter ?? []).flatMap(a => a.teacherRefs) ])]);
  base.resurser = { ...base.resurser, larare: base.resurser.larare.filter(t => usedTeachers.has(t.ref)) };
  const ordinals = new Map<string, number>();
  source.lessonSources = underlag.labels.lessons.map(lesson => {
    const ref = lesson.egenAktivitet ? `aktivitet:${lesson.egenAktivitet.id}` : underlag.labels.activities.find(a => a.id === lesson.activity)?.ref;
    if (!ref) throw new SchemaDraftError();
    const term = lesson.term ?? (underlag.terms.length === 1 ? underlag.terms[0] : null);
    const key = JSON.stringify([ref, term]), ordinal = (ordinals.get(key) ?? 0) + 1; ordinals.set(key, ordinal);
    return { lesson: lesson.id, ref, term, ordinal };
  });
  const at = Object.fromEntries(base.lessons.map(l => [l.id, { day: l.day, startMin: l.startMin, room: l.roomId }])), key = villkorNyckel(underlag.villkor);
  const intentionalKeys = medvetnaAvvikelser({ placements: at, intentional: input.intentional }, control.violations, key, underlag.grundFingerprint);
  const intentional = control.violations.filter(v => medvetenKrock(v) && intentionalKeys.has(avvikelseNyckel(v))).map(v => medvetenMarkering(v, at, key, underlag.grundFingerprint));
  const document: SchemaDraftDocument = { documentVersion: 1, base, basisVillkor: underlag.villkor, workingVillkor: input.workingVillkor, placements,
    locks: input.locks, intentional, datedOverrides: input.datedOverrides, activityTypes: input.activityTypes, control, requiresRecalculation, source };
  document.source.digest = await schemaDraftSourceHash(read, [document.basisVillkor, document.workingVillkor]);
  if (input.datedOverrides.length) document.datedOverrides = (await valideraSchemaDatum(read, underlag, base, input.datedOverrides)).datedOverrides;
  return parseSchemaDraftDocument(document, input);
}

/** Minsta läsrätt får inte förstoras av ett tidigare rektorssnapshot. Inga elevnamn sparas alls. */
function checkProjection(draft: SchemaDraftDocument, read: ReadBasis, ctx: Context): void {
  if (ctx.accessFunction !== 'administrator') return;
  const visible = new Set(read.plan.teachers.map(t => t.personId));
  const refs = [...draft.base?.resurser.larare.map(t => t.ref) ?? [], ...[draft.basisVillkor, draft.workingVillkor].flatMap(v => v ? [
    ...v.egna.flatMap(r => r.slag === 'larare' ? [r.ref] : []), ...(v.aktiviteter ?? []).flatMap(a => a.teacherRefs) ] : [])];
  if (refs.some(ref => !visible.has(ref))) throw new Deny('forbidden', 403);
}

/** Den anropande transaktionen kan samordna utkastets revisionskontroll med ytterligare skolsparning. */
export async function commitSchemaDraft(tx: Tx, ctx: Context, input: SchemaDraftSave, document: SchemaDraftDocument, current: ReadBasis, requestHash: string, prepared?: ReadBasis) {
  if (await schemaDraftSourceHash(current, [document.basisVillkor, document.workingVillkor]) !== document.source.digest
    || input.forslagFingerprint !== undefined && (!prepared || villkorNyckel(current.basis.skolsalar ?? null) !== villkorNyckel(prepared.basis.skolsalar ?? null))) {
    throw new Deny('conflict', 409, { reason: sourceConflict(input) });
  }
  checkProjection(document, current, ctx);
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.schema_command(${tx.json({ ...scopeKeys(input), commandId: input.commandId, draftId: input.draftId,
    expectedRevision: input.expectedRevision, name: input.name, requestHash, document, sourceHash: document.source.digest })}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable();
  const result = envelope(rows[0].result, ctx).result;
  let draft, receipt;
  try { draft = await rawDraft(result.draft, input, false); receipt = parseSchemaDraftReceipt(result.receipt); }
  catch { throw new AuditUnavailable(); }
  if (receipt.commandId !== input.commandId || receipt.requestHash !== requestHash || receipt.draftId !== draft.id || input.draftId !== null && input.draftId !== draft.id || draft.revision !== receipt.revision
    || receipt.revision !== input.expectedRevision + 1 || draft.contentHash !== receipt.contentHash || draft.savedAt !== receipt.savedAt) throw new AuditUnavailable();
  return { ...scopeKeys(input), draft, receipt } satisfies SchemaDraftSaveReply;
}

export async function schemaDraftReadRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'schema_draft_read', { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request); const input = await schemaDraftRequest(request, parseSchemaDraftScope), saved = await readSchemaDraftSnapshot(tx, ctx, input);
    if (!saved) return { body: { ...input, draft: null } satisfies SchemaDraftReadReply, event: event('schema_draft_read', input) };
    const read = await readDraftBasis(request, tx, ctx, currentInput(input, saved.basisVillkor ?? saved.workingVillkor));
    saved.stale = saved.sourceHash !== await schemaDraftSourceHash(read, [saved.basisVillkor, saved.workingVillkor]); checkProjection(saved, read, ctx);
    if (!saved.stale && !saved.base && saved.revision > 1) {
      const previous = await resetPrevious(tx, ctx, input, saved, false);
      if (previous) saved.resetUndoRevision = previous.revision;
    }
    return { body: { ...input, draft: saved } satisfies SchemaDraftReadReply, event: event('schema_draft_read', input, saved.id) };
  });
}

/** En tömning och dess ångring lägger till var sin revision. Den föregående versionen hämtas bara för ett oförändrat, tömt utkast. */
export async function schemaDraftResetRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'schema_draft_reset', { mutating: true, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaDraftRequest(request, parseSchemaDraftResetRequest), requestHash = await schemaDraftResetHash(input);
    const action = input.action === 'clear' ? 'schema_draft_cleared' : 'schema_draft_reset_undone';
    const status = await sqlStatus(tx, ctx, { ...scopeKeys(input), commandId: input.commandId, draftId: input.draftId });
    if (status.state === 'completed') {
      let receipt;
      try { receipt = parseSchemaDraftReceipt(status.receipt); } catch { throw new AuditUnavailable(); }
      if (receipt.requestHash !== requestHash) throw new Deny('conflict', 409, { reason: 'schema_draft_command_conflict' });
      const draft = await rawDraft(status.draft, input, false);
      const read = await readDraftBasis(request, tx, ctx, currentInput(input, draft.basisVillkor ?? draft.workingVillkor));
      draft.stale = draft.sourceHash !== await schemaDraftSourceHash(read, [draft.basisVillkor, draft.workingVillkor]);
      checkProjection(draft, read, ctx);
      try { return { body: parseSchemaDraftSaveReply({ ...scopeKeys(input), draft, receipt }, input), event: event(action, input, input.draftId) }; }
      catch { throw new AuditUnavailable(); }
    }
    if (status.state !== 'not_found') throw new AuditUnavailable();
    const head = await readSchemaDraftSnapshot(tx, ctx, input);
    if (!head || head.id !== input.draftId || head.revision !== input.expectedRevision) throw new Deny('conflict', 409, { reason: 'schema_draft_conflict' });
    if (input.action === 'clear' && !head.placements.length) throw new Deny('conflict', 409, { reason: 'schema_draft_conflict' });
    const previous = input.action === 'undo' ? (await resetPrevious(tx, ctx, input, head, true))?.draft : null;
    if (input.action === 'undo' && !previous) throw new Deny('conflict', 409, { reason: 'schema_draft_conflict' });

    const restored = previous ?? head;
    const read = await readDraftBasis(request, tx, ctx, currentInput(input, restored.basisVillkor ?? restored.workingVillkor));
    checkProjection(head, read, ctx);
    if (previous) checkProjection(previous, read, ctx);
    const sourceChanged = () => new Deny('conflict', 409, { reason: 'schema_draft_source_changed' });
    if (head.sourceHash !== await schemaDraftSourceHash(read, [head.basisVillkor, head.workingVillkor])) throw sourceChanged();
    // Ett nytt förslag får nya pass-ID:n. Villkor för enskilda gamla pass ligger kvar i versionen som kan återställas.
    const workingVillkor = previous?.workingVillkor ?? { ...head.workingVillkor, egna: head.workingVillkor.egna.filter(r => r.slag !== 'pass') };
    const save = parseSchemaDraftSave({ ...scopeKeys(input), commandId: input.commandId, draftId: head.id, expectedRevision: head.revision, name: head.name,
      basisVillkor: previous?.basisVillkor ?? null, workingVillkor, grundFingerprint: previous?.base?.grundFingerprint ?? null,
      placements: previous?.placements ?? [], locks: previous?.locks ?? [], intentional: previous?.intentional ?? [],
      datedOverrides: previous?.datedOverrides ?? [], activityTypes: head.activityTypes });
    let document: SchemaDraftDocument;
    try {
      if (previous?.basisVillkor && previous.base) {
        const underlag = buildSchemaUnderlag(read.plan, currentInput(input, previous.basisVillkor), read.basis);
        const rooms = new Map(underlag.problem.lessons.map(l => [l.id, l.rooms?.allowed]));
        if (underlag.grundFingerprint !== previous.base.grundFingerprint || previous.placements.some(p => p.room !== null
          && !rooms.get(p.lesson)?.includes(p.room))) throw sourceChanged();
        document = schemaDraftDocument(previous);
      } else {
        document = await prepareSchemaDraft(read, save);
      }
    } catch (error) {
      if (error instanceof SchemaDraftError || error instanceof SchemaContractError) throw sourceChanged();
      throw error;
    }
    await resetProv(tx, ctx, input, read);
    const body = await commitSchemaDraft(tx, ctx, save, document, read, requestHash);
    return { body, event: event(action, input, input.draftId) };
  });
}
export async function schemaDraftStatusRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'schema_draft_status', { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request); const input = await schemaDraftRequest(request, parseSchemaDraftStatusRequest), result = await sqlStatus(tx, ctx, input);
    let receipt = null;
    try { if (result.state === 'completed') receipt = parseSchemaDraftReceipt(result.receipt); else if (result.state !== 'not_found' || result.receipt !== null) throw new SchemaDraftError(); }
    catch { throw new AuditUnavailable(); }
    if (receipt && (receipt.commandId !== input.commandId || input.draftId !== null && receipt.draftId !== input.draftId)) throw new AuditUnavailable();
    return { body: { ...scopeKeys(input), state: receipt ? 'completed' : 'not_found', found: receipt !== null, receipt } satisfies SchemaDraftStatusReply,
      event: event('schema_draft_status', input, receipt?.draftId) };
  });
}
export async function schemaDraftSaveRoute(request: Request): Promise<Response> {
  const capture: { input?: SchemaDraftSave; read?: ReadBasis; replay?: SchemaDraftSaveReply; requestHash?: string } = {};
  const first = await protectedRoute(request, 'schema_draft_prepare', { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request); const input = await schemaDraftRequest(request, parseSchemaDraftSave), requestHash = await schemaDraftHash(input);
    capture.input = input; capture.requestHash = requestHash;
    const status = await sqlStatus(tx, ctx, { ...scopeKeys(input), commandId: input.commandId, draftId: input.draftId });
    if (status.state === 'completed') {
      let receipt;
      try { receipt = parseSchemaDraftReceipt(status.receipt); } catch { throw new AuditUnavailable(); }
      if (receipt.requestHash !== requestHash) throw new Deny('conflict', 409, { reason: 'schema_draft_command_conflict' });
      const draft = await rawDraft(status.draft, input, false), read = await readDraftBasis(request, tx, ctx, currentInput(input, draft.basisVillkor ?? draft.workingVillkor));
      draft.stale = draft.sourceHash !== await schemaDraftSourceHash(read, [draft.basisVillkor, draft.workingVillkor]); checkProjection(draft, read, ctx);
      try { capture.replay = parseSchemaDraftSaveReply({ ...scopeKeys(input), draft, receipt }, input); } catch { throw new AuditUnavailable(); }
    } else {
      if (status.state !== 'not_found') throw new AuditUnavailable();
      capture.read = await readDraftBasis(request, tx, ctx, currentInput(input, input.basisVillkor ?? input.workingVillkor));
    }
    return { body: null, event: event('schema_draft_prepare', input, input.draftId) };
  });
  if (!first.ok || !capture.input || !capture.requestHash) return first;
  const headers = { correlationId: first.headers.get('X-Correlation-Id') ?? '', epoch: Number(first.headers.get('X-Context-Epoch')) };
  if (capture.replay) return json(capture.replay, headers);
  if (!capture.read) throw new AuditUnavailable();
  let document: SchemaDraftDocument;
  try { document = await prepareSchemaDraft(capture.read, capture.input); }
  catch (error) {
    if (error instanceof SchemaDraftError) {
      const conflict = error.reason === 'schema_draft_source_changed' || error.reason === 'schema_preview_outdated';
      return json({ code: conflict ? 'conflict' : 'bad_request', details: { reason: error.reason }, correlationId: headers.correlationId }, { ...headers, status: conflict ? 409 : 400 });
    }
    if (error instanceof SchemaDatumError) return json({ code: 'schema_datum_invalid', details: { reason: error.reason }, correlationId: headers.correlationId }, { ...headers, status: error.reason === 'schema_datum_participants_unavailable' ? 409 : 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', details: { reason: 'schema_draft_invalid' }, correlationId: headers.correlationId }, { ...headers, status: 400 });
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', details: { reason: error.reason }, correlationId: headers.correlationId }, { ...headers, status: 503 });
    throw error;
  }
  const input = capture.input, requestHash = capture.requestHash, prepared = capture.read;
  return protectedRoute(request, 'schema_draft_saved', { mutating: true, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    const current = await readDraftBasis(request, tx, ctx, currentInput(input, input.basisVillkor ?? input.workingVillkor));
    const body = await commitSchemaDraft(tx, ctx, input, document, current, requestHash, prepared);
    return { body, event: event('schema_draft_saved', input, body.draft.id) };
  });
}
