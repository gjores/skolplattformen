import { SCHEMA_CONTRACT_VERSION, SchemaContractError } from '../schema-contract.ts';
import { SchemaDatumError, parseSchemaDatumRequest } from '../schema-datum.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { schemaProvBerakning, type SchemaProvBerakningIndata } from '../schema-provberakning.ts';
import type { SchemaProvforslagSvar } from '../schema-provforslag.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin } from './authz.ts';
import { Deny } from './db.ts';
import { logEvent } from './events.ts';
import { json } from './http.ts';
import { readNationellaProv } from './nationella-prov.ts';
import { schemaDatumGrund } from './schema-datum.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { readSchemaBasis, schemaBegaran } from './schema-read.ts';
import { SchemaEngineError, validateSchema } from './schemamotor.ts';

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
        lastaPass: input.locks?.placements.map(p => p.lesson), tidigasteErsattning: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()) };
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
