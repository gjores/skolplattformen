import { parseSchemaDatumRequest, SchemaDatumError, type SchemaDatumRequest } from '../schema-datum.ts';
import { parseSchemaDateradAktivitetInput, SchemaDateradAktivitetError, type SchemaDateradAktivitetInput } from '../schema-daterad-aktivitet.ts';
import { SchemaContractError } from '../schema-contract.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin } from './authz.ts';
import { Deny } from './db.ts';
import { logEvent } from './events.ts';
import { json } from './http.ts';
import { readNationellaProv } from './nationella-prov.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { schemaDatumGrund, type SchemaDatumRead } from './schema-datum.ts';
import { planeraDateradAktivitet } from './schema-daterad-aktivitet.ts';
import { readSchemaBasis } from './schema-read.ts';
import { SchemaEngineError } from './schemamotor.ts';
import { tjanstRequest } from './tjanst.ts';
import type { NationellProvbokning } from '../nationella-prov.ts';

type Input = { activity: SchemaDateradAktivitetInput; schedule: SchemaDatumRequest };
const action = 'schema_dated_control';

export async function schemaDateradAktivitetRoute(request: Request): Promise<Response> {
  const state: { input?: Input; read?: SchemaDatumRead; bookings?: NationellProvbokning[] } = {};
  const first = await protectedRoute(request, action, { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, value => {
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaDateradAktivitetError();
        const { activity, ...rest } = value as Record<string, unknown>;
        return { activity: parseSchemaDateradAktivitetInput(activity), schedule: parseSchemaDatumRequest(rest) };
      } catch { throw new Deny('bad_request', 400, { reason: 'schema_daterad_aktivitet_invalid' }); }
    }, 8 * 1024 * 1024);
    const { schedule } = input;
    const basis = await readSchemaBasis(request, tx, ctx, schedule), dated = await readSchemaDatedBasis(tx, ctx, schedule);
    try { await logEvent(tx, { ...ctx, request }, { ...dated.event, outcome: 'ok' }); } catch { throw new AuditUnavailable(); }
    state.input = input;
    state.read = { plan: basis.plan, basis: basis.basis, datedBasis: dated.body };
    state.bookings = schedule.schoolYear >= 2000 && schedule.schoolYear <= 2100
      ? (await readNationellaProv(tx, ctx, schedule.unitId, schedule.schoolYear))?.document.bokningar ?? [] : [];
    return { body: null, event: basis.event };
  });
  if (!first.ok || !state.input || !state.read) return first;
  const init = { correlationId: first.headers.get('X-Correlation-Id') ?? '', epoch: Number(first.headers.get('X-Context-Epoch')) };
  const { activity, schedule } = state.input;
  try {
    const { underlag, forslag } = schemaDatumGrund(state.read, schedule);
    const result = await planeraDateradAktivitet(state.read, underlag, forslag, schedule.datedOverrides, activity, schedule.locks?.placements ?? [], state.bookings ?? []);
    return json(result, init);
  } catch (error) {
    if (error instanceof Deny) return json({ code: error.code, details: error.details, correlationId: init.correlationId }, { ...init, status: error.status });
    if (error instanceof SchemaEngineError) return json({ code: 'schema_engine_unavailable', correlationId: init.correlationId }, { ...init, status: 503 });
    if (error instanceof SchemaDatumError || error instanceof SchemaDateradAktivitetError || error instanceof SchemaContractError || error instanceof SchemaFordelningError) {
      return json({ code: 'conflict', details: { reason: 'schema_daterad_aktivitet_changed' }, correlationId: init.correlationId }, { ...init, status: 409 });
    }
    throw error;
  }
}
