import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, solveSchema, validateSchema } from '../../../../lib/server/schemamotor.ts';
import { SchemaContractError } from '../../../../lib/schema-contract.ts';
import { parseSchemaAktiviteterRequest, schemaAktivitetsAndring, schemaAktivitetsPlaceringar, schemaAktivitetsSvar, type SchemaAktiviteterRequest } from '../../../../lib/schema-aktiviteter-underlag.ts';
import type { SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/** Ändrar bara utkastet, med samma aktuella skolmandat, MFA och auditerade källäsning som övriga schemarutter. */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaAktiviteterRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaAktiviteterRequest), result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try {
    const change = schemaAktivitetsAndring(read.plan, read.input, read.basis);
    if (!change) return json({ code: 'schema_underlag_changed', correlationId }, { ...init, status: 409 });
    const added = new Set(change.added), needsMotor = change.efter.problem.lessons.some(l => added.has(l.id) && !l.locked);
    const solution = needsMotor ? await solveSchema(change.solver) : null;
    const placements = schemaAktivitetsPlaceringar(change, solution), check = await validateSchema(change.efter.problem, placements);
    return json(schemaAktivitetsSvar(read.plan, read.input, change, placements, check, solution), init);
  } catch (error) {
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
