import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { SchemaEngineError, solveSchema } from '../../../../lib/server/schemamotor.ts';
import { planRead, tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { parseSchemaForslagRequest, type SchemaForslagRequest, type SchemaSolution } from '../../../../lib/schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Schemaförslag ur tjänstefördelningen. Läsningen sker med tjänstefördelningens behörighet och granskningshändelse (K2).
 * Motorn anropas först när databastransaktionen är klar, så att räknetiden inte håller en anslutning. Inget sparas.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaForslagRequest } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, parseSchemaForslagRequest);
    const result = await planRead(tx, { unitId: input.unitId, schoolYear: input.schoolYear }, ctx);
    read.plan = result.body;
    read.input = input;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  const underlag = buildSchemaUnderlag(read.plan, read.input);
  try {
    const empty: SchemaSolution = { status: 'input_missing', placements: [], unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 };
    const solution = underlag.problem.lessons.length === 0 ? empty : await solveSchema(underlag.problem);
    return json(schemaForslag(read.plan, read.input, underlag, solution), init);
  } catch (error) {
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
