import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, diagnoseSchema } from '../../../../lib/server/schemamotor.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { SCHEMA_CONTRACT_VERSION, parseSchemaForslagRequest, SchemaContractError, type SchemaForslagRequest } from '../../../../lib/schema-contract.ts';
import { buildSchemaUnderlag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import { schemaDiagnos } from '../../../../lib/schema-diagnos.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/** Samma aktuella skolmandat, MFA, ursprung och obligatoriska läshändelse som förslaget. Ingen sökning eller skrivning. */
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
  try {
    const underlag = buildSchemaUnderlag(read.plan, read.input, read.basis);
    const diagnoses = underlag.problem.lessons.length ? await diagnoseSchema(underlag.problem) : [];
    return json({ version: SCHEMA_CONTRACT_VERSION, findings: schemaDiagnos(underlag, diagnoses) }, init);
  } catch (error) {
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
