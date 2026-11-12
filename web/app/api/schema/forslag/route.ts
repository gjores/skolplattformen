import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, solveSchema } from '../../../../lib/server/schemamotor.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { parseSchemaForslagRequest, type SchemaForslagRequest, type SchemaSolution } from '../../../../lib/schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Schemaförslag ur tjänstefördelningen. Läsningen (`readSchemaBasis`) sker med tjänstefördelningens behörighet och granskningshändelse (K2);
 * eftersom elevuppgifter läses krävs stark inloggning som i de vyerna.
 * Motorn anropas först när databastransaktionen är klar, så att räknetiden inte håller en anslutning. Inget sparas.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaForslagRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, value => parseSchemaForslagRequest(value));
    const result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  const underlag = buildSchemaUnderlag(read.plan, read.input, read.basis);
  try {
    const empty: SchemaSolution = { status: 'input_missing', placements: [], unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 };
    const solution = underlag.problem.lessons.length === 0 ? empty : await solveSchema(underlag.problem);
    return json(schemaForslag(read.plan, read.input, underlag, solution), init);
  } catch (error) {
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
