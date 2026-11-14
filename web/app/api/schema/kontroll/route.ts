import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, validateSchema } from '../../../../lib/server/schemamotor.ts';
import { checkSchemaPlacements, parseSchemaKontrollRequest, SchemaContractError, type SchemaKontrollRequest } from '../../../../lib/schema-contract.ts';
import { schemaProvUnderlag, schemaKontroll, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Kontroll av ett för hand ändrat schemaförslag (05.2-SM-FLYTT, F1–F3). Inget sparas: underlaget byggs om ur samma läsning,
 * behörighet och granskningshändelser som förslaget, med nuvarande villkor, och grunden jämförs med förslagets (05.2-SM-VILLKOR-DIREKT).
 * Har grunden ändrats avvisas kontrollen; tidsvillkor prövas direkt. Reglerna prövas av motorns kontrollant mot serverns eget underlag.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaKontrollRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaKontrollRequest);
    const result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  const underlag = schemaProvUnderlag(read.plan, read.input, read.basis);
  if (!underlag) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
  try {
    const placements = checkSchemaPlacements(read.input.placements, underlag.problem);
    return json(schemaKontroll(underlag, placements, await validateSchema(underlag.problem, placements)), init);
  } catch (error) {
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
