import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { checkSchemaPlacements, parseSchemaKontrollRequest, SchemaContractError, type SchemaKontrollRequest } from '../../../../lib/schema-contract.ts';
import { schemaProvUnderlag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import { schemaSamlingData } from '../../../../lib/schema-samling.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';
import { salIfyllning } from '../../../../lib/schema-utan-sal.ts';

/** Behörighetsprövad, läsande resurslista för samlingsvyn. Samma mandat, MFA, ursprung, underlag och granskningshändelser som Följ passet. */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaKontrollRequest; basis?: SchemaBasis; names?: Map<string, string> } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaKontrollRequest), result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis; read.names = result.pupilNames;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis || !read.names) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try {
    const u = schemaProvUnderlag(read.plan, read.input, read.basis);
    if (!u) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
    checkSchemaPlacements(read.input.placements, u.problem, salIfyllning(u.villkor)); return json(schemaSamlingData(read.plan, u, read.basis.members, read.names), init);
  }
  catch (error) { if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 }); throw error; }
}
