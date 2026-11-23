import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { freshSchemaSolveSeed, SchemaEngineError, solveSchema, validateSchema } from '../../../../lib/server/schemamotor.ts';
import { checkSchemaPlacements, SchemaContractError } from '../../../../lib/schema-contract.ts';
import { parseSchemaFortsattRequest, schemaFortsattProblem, type SchemaFortsattRequest } from '../../../../lib/schema-fortsatt.ts';
import { schemaProvUnderlag, schemaKontroll, schemaForslag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import { salIfyllning } from '../../../../lib/schema-utan-sal.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/** Ny beräkningsomgång från det aktuella utkastet. Behörighet/underlag läses klart före CPU-arbetet. Ingen revision eller placering sparas här. */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaFortsattRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaFortsattRequest);
    const result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try {
    const underlag = schemaProvUnderlag(read.plan, read.input, read.basis);
    if (!underlag) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
    const placements = checkSchemaPlacements(read.input.placements, underlag.problem, salIfyllning(underlag.villkor));
    const problem = schemaFortsattProblem(underlag.problem, placements, !!underlag.villkor.salregister);
    const before = schemaKontroll(underlag, placements, await validateSchema(underlag.problem, placements));
    const solution = await solveSchema(problem, read.input.solveTimeMs, freshSchemaSolveSeed());
    const after = schemaKontroll(underlag, solution.placements, await validateSchema(underlag.problem, solution.placements));
    const forslag = schemaForslag(read.plan, read.input, underlag, solution, false);
    // Samma kontrollmått i båda svarsdelarna; referensen påverkar motorns flyttkostnad men inte undervisningens tid.
    return json({ forslag: { ...forslag, metrics: after.metrics, teachings: after.teachings, trims: after.trims }, before, after }, init);
  } catch (error) {
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
