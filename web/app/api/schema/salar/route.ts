import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { json } from '../../../../lib/server/http.ts';
import { logEvent } from '../../../../lib/server/events.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { readSchemaDatedBasis } from '../../../../lib/server/schema-datum-read.ts';
import { schemaSalSok, type SchemaSalRead } from '../../../../lib/server/schema-salar.ts';
import { SchemaEngineError } from '../../../../lib/server/schemamotor.ts';
import { SchemaContractError } from '../../../../lib/schema-contract.ts';
import { SchemaDatumError } from '../../../../lib/schema-datum.ts';
import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { SchemaPlaceringError } from '../../../../lib/schema-placering.ts';
import { SchemaSalError, parseSchemaSalRequest, type SchemaSalRequest } from '../../../../lib/schema-salar.ts';

/** Befintliga salar ur serveråterbyggd grund; eget aktuellt skolmandat, MFA, ursprung och obligatorisk audit före kontroll. */
export async function POST(request: Request): Promise<Response> {
  const captured: { read?: SchemaSalRead; input?: SchemaSalRequest } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaSalRequest), read = await readSchemaBasis(request, tx, ctx, input);
    captured.read = { plan: read.plan, basis: read.basis }; captured.input = input;
    if (input.datedTarget) {
      const dated = await readSchemaDatedBasis(tx, ctx, input);
      await logEvent(tx, { ...ctx, request }, { ...dated.event, outcome: 'ok' }); captured.read.datedBasis = dated.body;
    }
    return { body: null, event: read.event };
  });
  if (!response.ok || !captured.read || !captured.input) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try { return json(await schemaSalSok(captured.read, captured.input), init); }
  catch (error) {
    if (error instanceof Deny) return json({ code: error.code, correlationId, details: error.details }, { ...init, status: error.status });
    if (error instanceof SchemaSalError || error instanceof SchemaPlaceringError) return json({ code: error.reason === 'schema_underlag_changed' ? 'schema_underlag_changed' : 'schema_sal_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 409 });
    if (error instanceof SchemaDatumError) return json({ code: 'schema_datum_invalid', correlationId, details: { reason: error.reason } }, { ...init, status: error.reason === 'schema_datum_participants_unavailable' ? 409 : 400 });
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
