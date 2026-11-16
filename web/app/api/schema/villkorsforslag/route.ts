import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError } from '../../../../lib/server/schemamotor.ts';
import { schemaVillkorsforslag } from '../../../../lib/server/schema-villkorsforslag.ts';
import { SchemaContractError } from '../../../../lib/schema-contract.ts';
import { SchemaPlaceringError } from '../../../../lib/schema-placering.ts';
import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { SchemaVillkorsforslagError, parseSchemaVillkorsforslagRequest, type SchemaVillkorsforslagRequest } from '../../../../lib/schema-villkorsforslag.ts';
import type { SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/** Samma aktuella skolmandat, MFA, ursprung, serverkällor och obligatoriska audit som placering. Ingen regel sparas eller tillämpas. */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaVillkorsforslagRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaVillkorsforslagRequest), result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try { return json(await schemaVillkorsforslag(read.plan, read.input, read.basis), init); }
  catch (error) {
    if (error instanceof SchemaVillkorsforslagError || error instanceof SchemaPlaceringError) return json({ code: error.reason === 'schema_underlag_changed' ? 'schema_underlag_changed' : 'schema_villkorsforslag_unavailable',
      correlationId, details: { reason: error.reason } }, { ...init, status: 409 });
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    const placement = error.reason.startsWith('schema_placement_');
    return json({ code: placement ? 'schema_villkorsforslag_unavailable' : 'schema_engine_unavailable', correlationId,
      details: { reason: error.reason } }, { ...init, status: placement ? 409 : 503 });
  }
}
