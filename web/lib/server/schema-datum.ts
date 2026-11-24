/** Datumkontroll använder aktuell skyddad källa. Motorn arbetar efter att lästransaktionen avslutats. */
import type { TjanstPlanRead } from '../tjanst-contract.ts';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_LIMITS, SchemaContractError, checkSchemaPlacements, type SchemaCheck, type SchemaForslag, type SchemaKontrollRequest, type SchemaPlacement, type SchemaProblem } from '../schema-contract.ts';
import { schemaForslag, schemaProvUnderlag, type SchemaBasis, type SchemaUnderlag } from '../schema-underlag.ts';
import { SchemaDatumError, parseSchemaDatumRequest, schemaDatumTidsandringar, type SchemaDatumAndring, type SchemaDatumAvvikelse, type SchemaDatumRequest, type SchemaDatumSvar } from '../schema-datum.ts';
import { schemaDatumUnderlag, type SchemaDatedBasis } from '../schema-datum-underlag.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { Deny } from './db.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin } from './authz.ts';
import { json } from './http.ts';
import { logEvent } from './events.ts';
import { readSchemaBasis } from './schema-read.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { SchemaEngineError, validateSchema } from './schemamotor.ts';
import { salIfyllning } from '../schema-utan-sal.ts';

export type SchemaDatumRead = { plan: TjanstPlanRead; basis: SchemaBasis; datedBasis: SchemaDatedBasis; schoolDuties?: { ref: string; startsOn: string; endsOn: string | null }[] };
type Validator = (problem: SchemaProblem, placements: SchemaPlacement[]) => Promise<SchemaCheck>;
/** Återanvänds av salssökningen; faktisk kortning och längd härleds på servern före varje salskandidat. */
export function schemaDatumGrund(read: Pick<SchemaDatumRead, 'plan' | 'basis'>, input: SchemaKontrollRequest) {
  const underlag = schemaProvUnderlag(read.plan, input, read.basis);
  if (!underlag) throw new Deny('conflict', 409, { reason: 'schema_underlag_changed' });
  const placements = checkSchemaPlacements(input.placements, underlag.problem, salIfyllning(underlag.villkor)), placed = new Set(placements.map(p => p.lesson));
  const forslag = schemaForslag(read.plan, input, underlag, { status: placed.size === underlag.problem.lessons.length ? 'complete' : 'time_limit', placements,
    unplaced: underlag.problem.lessons.filter(l => !placed.has(l.id)).map(l => l.id), diagnoses: [], elapsedMs: 0, metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  return { underlag, forslag };
}
/** Ingen DB-läsning eller skrivning. Draft/save återanvänder detta innan sitt nya mandat-/käll-/CAS-lås. */
export async function valideraSchemaDatum(read: Pick<SchemaDatumRead, 'plan' | 'datedBasis'>, underlag: SchemaUnderlag, forslag: SchemaForslag,
  overrides: SchemaDatumAndring[], dates: string[] = [], validate: Validator = validateSchema): Promise<SchemaDatumSvar> {
  const prepared = schemaDatumUnderlag(read.plan, underlag, forslag, read.datedBasis, overrides, dates), violations: SchemaDatumAvvikelse[] = [...prepared.violations];
  let total = violations.length;
  for (const day of prepared.days) {
    if (!day.problem.lessons.length) continue;
    const result = await validate(day.problem, day.placements); total += result.violations.length;
    for (const violation of result.violations) {
      const actual = violation.lessons.map(id => day.occurrences.get(id));
      if (actual.some(o => !o)) throw new SchemaContractError();
      const message = violation.message.replace(/\btillfalle-\d+\b/gu, id => day.occurrences.get(id)?.lesson.title ?? id)
        .replace(/\bkluster-\d+\b/gu, 'berörda elever');
      violations.push({ date: day.date, code: violation.code, message, lessons: [...new Set(actual.map(o => o!.lesson.id))], occurrences: [...new Set(actual.map(o => o!.key))] });
    }
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: forslag.grundFingerprint, fingerprint: underlag.fingerprint,
    datedOverrides: prepared.datedOverrides, checkedDates: prepared.days.map(d => d.date), violations: violations.slice(0, SCHEMA_LIMITS.shownViolations), total,
    timeChanges: schemaDatumTidsandringar(forslag, prepared.datedOverrides, prepared.sources) };
}
export async function kontrolleraSchemaDatumServer(read: SchemaDatumRead, input: SchemaDatumRequest): Promise<SchemaDatumSvar> {
  const { underlag, forslag } = schemaDatumGrund(read, input);
  return valideraSchemaDatum(read, underlag, forslag, input.datedOverrides, input.dates);
}

/** Samma hårda bytegräns som sparandet, innan dyr JSON-/domänkontroll. Inga payloads loggas. */
async function datumRequest(request: Request): Promise<SchemaDatumRequest> {
  const max = 8 * 1024 * 1024, length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > max)) throw new Deny('bad_request', 400, { reason: 'schema_datum_invalid' });
  const reader = request.body?.getReader(); if (!reader) throw new Deny('bad_request', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > max) { await reader.cancel(); throw new SchemaDatumError(); } chunks.push(item.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parseSchemaDatumRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch (error) { throw new Deny('bad_request', 400, { reason: error instanceof SchemaDatumError ? error.reason : 'schema_datum_invalid' }); }
  finally { reader.releaseLock(); }
}
export async function schemaDatumRoute(request: Request): Promise<Response> {
  const captured: { read?: SchemaDatumRead; input?: SchemaDatumRequest } = {};
  const first = await protectedRoute(request, 'schema_dated_control', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request); const input = await datumRequest(request), read = await readSchemaBasis(request, tx, ctx, input), dated = await readSchemaDatedBasis(tx, ctx, input);
    try { await logEvent(tx, { ...ctx, request }, { ...dated.event, outcome: 'ok' }); } catch { throw new AuditUnavailable(); }
    captured.read = { plan: read.plan, basis: read.basis, datedBasis: dated.body }; captured.input = input;
    return { body: null, event: read.event };
  });
  if (!first.ok || !captured.read || !captured.input) return first;
  const init = { correlationId: first.headers.get('X-Correlation-Id') ?? '', epoch: Number(first.headers.get('X-Context-Epoch')) };
  try { return json(await kontrolleraSchemaDatumServer(captured.read, captured.input), init); }
  catch (error) {
    if (error instanceof Deny) return json({ code: error.code, details: error.details, correlationId: init.correlationId }, { ...init, status: error.status });
    if (error instanceof SchemaDatumError) return json({ code: 'schema_datum_invalid', details: { reason: error.reason }, correlationId: init.correlationId }, { ...init, status: error.reason === 'schema_datum_participants_unavailable' ? 409 : 400 });
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', details: { issues: error.issues.slice(0, 20) }, correlationId: init.correlationId }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId: init.correlationId }, { ...init, status: 400 });
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', details: { reason: error.reason }, correlationId: init.correlationId }, { ...init, status: 503 });
    throw error;
  }
}
