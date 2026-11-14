import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis } from '../../../../lib/server/schema-read.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { checkSchemaPlacements, SchemaContractError } from '../../../../lib/schema-contract.ts';
import { schemaFolj } from '../../../../lib/schema-folj.ts';
import { parseSchemaLagenRequest, type SchemaLagenRequest } from '../../../../lib/schema-lagen.ts';
import { buildSchemaUnderlag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Följ passet (05.2-SM-FOLJ): grupperna på ett pass, grupper som delar elever med det och, för den som får se elever, elevlistan och en vald elevs pass.
 * Samma begäran, behörighet, MFA, läsning, granskningshändelser och 409 vid ändrat underlag som lägesrutten (05.2-SM-LAGEN). Ingen motor; inget sparas.
 * Elevnivå bara för den som får se eleven: eleven ska finnas bland eleverna som läsningarna gav med användarens egen behörighet.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaLagenRequest; basis?: SchemaBasis; names?: Map<string, string> } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, parseSchemaLagenRequest);
    const result = await readSchemaBasis(request, tx, ctx, input);
    if (input.pupilId !== null && (!result.basis.members?.pupils.some(p => p.id === input.pupilId) || !result.pupilNames.has(input.pupilId))) throw new Deny('forbidden', 403);
    read.plan = result.plan; read.input = input; read.basis = result.basis; read.names = result.pupilNames;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis || !read.names) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  const input = read.input, underlag = buildSchemaUnderlag(read.plan, input, read.basis);
  if (underlag.fingerprint !== input.fingerprint) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
  try {
    checkSchemaPlacements(input.placements, underlag.problem);
    if (!underlag.problem.lessons.some(l => l.id === input.lesson)) throw new SchemaContractError();
    try {
      return json(schemaFolj(read.plan, underlag, read.basis.members, read.names, input.lesson, input.pupilId), init);
    } catch (error) {
      if (input.pupilId !== null && error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId, details: { reason: 'schema_pupil_not_in_lesson' } }, { ...init, status: 400 });
      throw error;
    }
  } catch (error) {
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    throw error;
  }
}
