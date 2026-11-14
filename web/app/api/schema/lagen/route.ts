import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, positionsSchema } from '../../../../lib/server/schemamotor.ts';
import { checkSchemaPlacements, SchemaContractError } from '../../../../lib/schema-contract.ts';
import { parseSchemaLagenRequest, schemaElevKluster, schemaLagen, schemaPassKluster, type SchemaLagenRequest } from '../../../../lib/schema-lagen.ts';
import { schemaProvUnderlag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Möjliga starttider för ett pass (05.2-SM-LAGEN). Samma behörighet, MFA, läsning och granskningshändelser som kontrollen; nuvarande tidsvillkor prövas direkt och ändrad grund ger 409 (05.2-SM-VILLKOR-DIREKT).
 * Klienten skickar placeringarna och passet; motorns kontrollant prövar varje starttid mot serverns eget underlag. Inget sparas.
 * Elevnivå bara för den som får se eleven: eleven ska finnas bland eleverna som läsningarna gav med sin egen behörighet. Motorn får elevens
 * kluster, aldrig elevens ID.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaLagenRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaLagenRequest);
    const result = await readSchemaBasis(request, tx, ctx, input);
    if (input.pupilId !== null && !result.basis.members?.pupils.some(p => p.id === input.pupilId)) throw new Deny('forbidden', 403);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  const input = read.input, underlag = schemaProvUnderlag(read.plan, input, read.basis);
  if (!underlag) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
  try {
    const placements = checkSchemaPlacements(input.placements, underlag.problem);
    if (!underlag.problem.lessons.some(l => l.id === input.lesson)) throw new SchemaContractError();
    let pupil: string | null = null;
    if (input.pupilId !== null) {
      pupil = schemaElevKluster(read.plan, input, read.basis, underlag, input.pupilId);
      if (pupil === null || !schemaPassKluster(underlag.problem, input.lesson).includes(pupil))
        return json({ code: 'bad_request', correlationId, details: { reason: 'schema_pupil_not_in_lesson' } }, { ...init, status: 400 });
    }
    return json(schemaLagen(underlag, await positionsSchema(underlag.problem, placements, input.lesson, pupil), pupil !== null), init);
  } catch (error) {
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
