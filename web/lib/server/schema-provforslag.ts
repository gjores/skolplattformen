import { SCHEMA_CONTRACT_VERSION, SchemaContractError, type SchemaKontrollRequest } from '../schema-contract.ts';
import { SchemaDatumError, parseSchemaDatumAndringar, parseSchemaDatumRequest } from '../schema-datum.ts';
import { SCHEMA_DRAFT_VERSION, SchemaDraftError, parseSchemaDraftSave, schemaDraftHash, type SchemaDraft } from '../schema-draft-contract.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { NATIONELLA_PROV_VERSION, parseNationellaProvSave } from '../nationella-prov.ts';
import { schemaProvBerakning, type SchemaProvBerakningIndata } from '../schema-provberakning.ts';
import { parseSchemaProvApplyRequest, schemaProvResultHash, type SchemaProvApplyReply, type SchemaProvApplyRequest, type SchemaProvforslagSvar } from '../schema-provforslag.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { logEvent } from './events.ts';
import { json } from './http.ts';
import { readNationellaProv, sparaNationellaProv } from './nationella-prov.ts';
import { schemaDatumGrund, valideraSchemaDatum } from './schema-datum.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { commitSchemaDraft, prepareSchemaDraft, readDraftBasis, readSchemaDraftReceipt, readSchemaDraftSnapshot, schemaDraftSourceHash } from './schema-draft.ts';
import { readSchemaBasis, schemaBegaran } from './schema-read.ts';
import { SchemaEngineError, validateSchema } from './schemamotor.ts';

const idag = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

export async function schemaProvforslagRoute(request: Request): Promise<Response> {
  const captured: { scope?: Omit<SchemaProvforslagSvar, 'bokningar' | 'bortfall' | 'ersattningar'>; calculation?: SchemaProvBerakningIndata } = {};
  const first = await protectedRoute(request, 'schema_provforslag', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaDatumRequest);
    if (input.dates.length) throw new Deny('bad_request', 400);
    const { unitId, schoolYear, period, grundFingerprint } = input;
    const register = await readNationellaProv(tx, ctx, unitId, schoolYear);
    await logEvent(tx, { ...ctx, request }, { action: 'nationella_prov_read', objectType: 'nationella_prov', objectId: unitId, details: { unitId, schoolYear }, outcome: 'ok' });
    const bokningar = register?.document.bokningar ?? [];
    const event = { action: 'schema_provforslag', objectType: 'school', objectId: unitId, details: { unitId, schoolYear } };
    captured.scope = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, provrevision: register?.revision ?? null };
    if (!bokningar.length) return { body: null, event };

    const source = await readSchemaBasis(request, tx, ctx, input);
    const dated = await readSchemaDatedBasis(tx, ctx, input);
    try { await logEvent(tx, { ...ctx, request }, { ...source.event, outcome: 'ok' }); await logEvent(tx, { ...ctx, request }, { ...dated.event, outcome: 'ok' }); }
    catch { throw new AuditUnavailable(); }
    try {
      const { underlag, forslag } = schemaDatumGrund(source, input);
      if (!forslag.time.current || !forslag.time.calendar) throw new SchemaDatumError('schema_datum_calendar_missing');
      captured.calculation = { plan: source.plan, underlag, forslag, datedBasis: dated.body, datedOverrides: input.datedOverrides,
        bokningar, salar: source.basis.skolsalar?.salar ?? [], vakter: source.schoolDuties, validate: validateSchema,
        lastaPass: input.locks?.placements.map(p => p.lesson), tidigasteErsattning: idag() };
    } catch (error) {
      if (error instanceof SchemaDatumError) throw new Deny('conflict', 409, { reason: error.reason });
      if (error instanceof SchemaFordelningError) throw new Deny('bad_request', 400, { issues: error.issues.slice(0, 20) });
      if (error instanceof SchemaContractError) throw new Deny('bad_request', 400);
      throw error;
    }
    return { body: null, event };
  });
  if (!first.ok || !captured.scope) return first;
  const init = { correlationId: first.headers.get('X-Correlation-Id') ?? '', epoch: Number(first.headers.get('X-Context-Epoch')) };
  try {
    const result = captured.calculation ? await schemaProvBerakning(captured.calculation) : { bokningar: [], bortfall: [], ersattningar: [] };
    return json({ ...captured.scope, ...result } satisfies SchemaProvforslagSvar, init);
  } catch (error) {
    if (error instanceof SchemaDatumError) return json({ code: 'schema_datum_invalid', details: { reason: error.reason }, correlationId: init.correlationId }, { ...init, status: 409 });
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', details: { reason: error.reason }, correlationId: init.correlationId }, { ...init, status: 503 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId: init.correlationId }, { ...init, status: 400 });
    throw error;
  }
}

const conflict = (reason = 'schema_provforslag_changed') => new Deny('conflict', 409, { reason });
const draftScope = ({ unitId, schoolYear, period }: SchemaProvApplyRequest) => ({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period });
const applyEvent = (input: SchemaProvApplyRequest, action: string) => ({ action, objectType: 'school', objectId: input.unitId, details: { unitId: input.unitId, schoolYear: input.schoolYear } });

async function applyReceipt(tx: Tx, ctx: Context, input: SchemaProvApplyRequest, requestHash: string): Promise<SchemaProvApplyReply | null> {
  const receipt = await readSchemaDraftReceipt(tx, ctx, draftScope(input), input.commandId);
  if (!receipt) return null;
  if (receipt.requestHash !== requestHash || receipt.revision !== input.expectedRevision + 1) throw conflict('schema_draft_command_conflict');
  return { ...applyScope(input), draftId: receipt.draftId, revision: receipt.revision, provrevision: input.provrevision + 1 };
}

function applyScope({ contractVersion, unitId, schoolYear, period, commandId }: SchemaProvApplyRequest) {
  return { contractVersion, unitId, schoolYear, period, commandId };
}

function applyBase(draft: SchemaDraft, input: SchemaProvApplyRequest): SchemaKontrollRequest {
  if (!draft.base || draft.requiresRecalculation || !draft.placements.length || draft.base.grundFingerprint !== input.grundFingerprint) throw conflict('schema_draft_source_changed');
  const { unitId, schoolYear, period, grundFingerprint } = input;
  return { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, villkor: draft.base.villkor, placements: draft.placements,
    ...(draft.locks.length > 0 && { locks: { grundFingerprint, placements: draft.locks } }) };
}

async function readApplyBasis(request: Request, tx: Tx, ctx: Context, input: SchemaProvApplyRequest) {
  const draft = await readSchemaDraftSnapshot(tx, ctx, draftScope(input));
  if (!draft || draft.revision !== input.expectedRevision) throw conflict('schema_draft_conflict');
  const base = applyBase(draft, input);
  const source = await readDraftBasis(request, tx, ctx, base);
  if (draft.sourceHash !== await schemaDraftSourceHash(source, [draft.basisVillkor, draft.workingVillkor])) throw conflict('schema_draft_source_changed');
  const register = await readNationellaProv(tx, ctx, input.unitId, input.schoolYear);
  if (!register || register.revision !== input.provrevision) throw conflict();
  const hash = await schemaDraftHash({ draft: draft.contentHash, source: draft.sourceHash, salar: source.basis.skolsalar ?? null,
    schoolDuties: [...source.schoolDuties].sort((a, b) => a.ref.localeCompare(b.ref) || a.startsOn.localeCompare(b.startsOn) || (a.endsOn ?? '').localeCompare(b.endsOn ?? '')), register });
  return { draft, base, source, register, hash };
}

/** Beräkningen sker utanför DB-lås. Båda revisionsskrivningarna sker eller rullas tillbaka tillsammans. */
export async function schemaProvTillampaRoute(request: Request): Promise<Response> {
  const captured: { input?: SchemaProvApplyRequest; hash?: string; basis?: Awaited<ReturnType<typeof readApplyBasis>>; replay?: SchemaProvApplyReply } = {};
  const first = await protectedRoute(request, 'schema_prov_prepare_apply', { mutating: false, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaProvApplyRequest);
    const hash = await schemaDraftHash({ action: 'schema_prov_apply_v1', input });
    captured.input = input; captured.hash = hash;
    const replay = await applyReceipt(tx, ctx, input, hash);
    if (replay) captured.replay = replay;
    else captured.basis = await readApplyBasis(request, tx, ctx, input);
    return { body: null, event: applyEvent(input, 'schema_prov_prepare_apply') };
  });
  if (!first.ok || !captured.input || !captured.hash) return first;
  const response = { correlationId: first.headers.get('X-Correlation-Id') ?? '', epoch: Number(first.headers.get('X-Context-Epoch')) };
  if (captured.replay) return json(captured.replay, response);
  if (!captured.basis) throw new AuditUnavailable();
  const { input, hash, basis } = captured, { base, draft, source, register } = basis;
  let prepared: { draft: Awaited<ReturnType<typeof prepareSchemaDraft>>; input: ReturnType<typeof parseSchemaDraftSave>; prov: ReturnType<typeof parseNationellaProvSave> };
  try {
    const { underlag, forslag } = schemaDatumGrund(source, base);
    if (!forslag.time.current || !forslag.time.calendar) throw new SchemaDatumError('schema_datum_calendar_missing');
    const berakning = { plan: source.plan, underlag, forslag, datedBasis: source.datedBasis, datedOverrides: draft.datedOverrides,
      bokningar: register.document.bokningar, salar: source.basis.skolsalar?.salar ?? [], vakter: source.schoolDuties, validate: validateSchema,
      lastaPass: draft.locks.map(p => p.lesson), tidigasteErsattning: idag() };
    const result = await schemaProvBerakning(berakning);
    if (await schemaProvResultHash(result) !== input.resultHash) throw conflict();
    if (!result.bokningar.length || result.bokningar.some(b => b.problem.length || !b.sal || !b.vakter.length)
      || result.bortfall.some(b => b.kvarMin > 0)) throw conflict('schema_provforslag_unresolved');

    const tilldelade = new Map(result.bokningar.map(b => [b.id, b]));
    const bokningar = register.document.bokningar.map(b => {
      const tilldelning = tilldelade.get(b.id);
      return tilldelning ? { ...b, salId: tilldelning.sal!.id, vakter: tilldelning.vakter.map(v => v.ref) } : b;
    });
    const datedOverrides = parseSchemaDatumAndringar([...draft.datedOverrides, ...result.ersattningar]);
    const kontroll = await schemaProvBerakning({ ...berakning, bokningar, datedOverrides, tidigasteErsattning: `${input.schoolYear + 1}-07-01` });
    if (kontroll.bortfall.length || kontroll.bokningar.some(b => b.problem.length)) throw conflict('schema_provforslag_unresolved');
    if (result.ersattningar.length) {
      const changed = new Set(result.ersattningar.flatMap(d => [d.originalDate, d.date]));
      const dates = await valideraSchemaDatum(source, underlag, forslag, datedOverrides);
      if (dates.violations.some(v => changed.has(v.date)) || dates.total > dates.violations.length) throw conflict('schema_provforslag_unresolved');
    }

    const next = parseSchemaDraftSave({ ...draftScope(input), commandId: input.commandId, draftId: draft.id, expectedRevision: draft.revision,
      name: draft.name, basisVillkor: draft.basisVillkor, workingVillkor: draft.workingVillkor, grundFingerprint: base.grundFingerprint,
      placements: draft.placements, locks: draft.locks, intentional: draft.intentional, datedOverrides, activityTypes: draft.activityTypes });
    prepared = { input: next, draft: await prepareSchemaDraft(source, next), prov: parseNationellaProvSave({ contractVersion: NATIONELLA_PROV_VERSION,
      unitId: input.unitId, schoolYear: input.schoolYear, commandId: input.commandId, expectedRevision: input.provrevision,
      document: { ...register.document, bokningar } }) };
  } catch (error) {
    if (error instanceof Deny) return json({ code: error.code, details: error.details, correlationId: response.correlationId }, { ...response, status: error.status });
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', details: { reason: error.reason }, correlationId: response.correlationId }, { ...response, status: 503 });
    if (error instanceof SchemaDatumError || error instanceof SchemaDraftError || error instanceof SchemaContractError || error instanceof SchemaFordelningError) {
      return json({ code: 'conflict', details: { reason: 'schema_provforslag_changed' }, correlationId: response.correlationId }, { ...response, status: 409 });
    }
    throw error;
  }
  return protectedRoute(request, 'schema_prov_applied', { mutating: true, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    const replay = await applyReceipt(tx, ctx, input, hash);
    if (replay) return { body: replay, event: applyEvent(input, 'schema_prov_applied') };
    // Samma lås och ordning som kalenderns skrivkommando. Ny provrevision kan inte komma emellan jämförelse och skrivning.
    await tx`select pg_advisory_xact_lock(hashtextextended(${input.commandId}, 2026111901))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${input.unitId}/${input.schoolYear}`}, 2026111902))`;
    const current = await readApplyBasis(request, tx, ctx, input);
    if (current.hash !== basis.hash) throw conflict();
    const prov = await sparaNationellaProv(tx, ctx, prepared.prov);
    if (prov.replayed) throw conflict('schema_draft_command_conflict');
    const { receipt } = await commitSchemaDraft(tx, ctx, prepared.input, prepared.draft, current.source, hash);
    await logEvent(tx, ctx, { ...applyEvent(input, 'nationella_prov_saved'), outcome: 'ok' });
    await logEvent(tx, ctx, { ...applyEvent(input, 'schema_draft_saved'), outcome: 'ok' });
    const body: SchemaProvApplyReply = { ...applyScope(input), draftId: receipt.draftId, revision: receipt.revision, provrevision: prov.register.revision };
    return { body, event: applyEvent(input, 'schema_prov_applied') };
  });
}
