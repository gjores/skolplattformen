import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, suggestSchema, validateSchema } from '../../../../lib/server/schemamotor.ts';
import { SCHEMA_CONTRACT_VERSION, SchemaContractError } from '../../../../lib/schema-contract.ts';
import { checkSchemaPlaceringRequest, parseSchemaPlaceringRequest, SchemaPlaceringError, type SchemaPlaceringRequest } from '../../../../lib/schema-placering.ts';
import { schemaProvUnderlag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/** Eget aktuellt skolmandat, MFA, ursprung och lyckad audit före beräkning. Klientens underlag godtas aldrig som motorproblem. */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaPlaceringRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaPlaceringRequest), result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try {
    const input = read.input, underlag = schemaProvUnderlag(read.plan, input, read.basis);
    if (!underlag) return json({ code: 'schema_underlag_changed', correlationId, details: { reason: 'schema_underlag_changed' } }, { ...init, status: 409 });
    const placements = checkSchemaPlaceringRequest(input, underlag.problem);
    const referenced = { ...underlag.problem, reference: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) };
    const before = await validateSchema(referenced, placements);
    if (before.violations.length) throw new SchemaPlaceringError('schema_placement_invalid_baseline');
    const result = await suggestSchema(underlag.problem, placements, input);
    // Pröva varje HEL kandidat med den oberoende kontrollanten. Inga kandidater lämnas ut om någon kontroll är ofullständig eller underkänd.
    for (const suggestion of result.suggestions) {
      const check = await validateSchema(referenced, suggestion.placements);
      if (check.violations.length) throw new SchemaEngineError('schema_engine_bad_reply');
      const matches = (reported: typeof suggestion.metricsBefore, checked: typeof before.metrics) => reported.studentGapMin === checked.studentGapMin && reported.teacherGapMin === checked.teacherGapMin && reported.cost === checked.cost;
      if (!matches(suggestion.metricsBefore, before.metrics) || !matches(suggestion.metricsAfter, check.metrics)) throw new SchemaEngineError('schema_engine_bad_reply');
    }
    return json({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, ...result }, init);
  } catch (error) {
    if (error instanceof SchemaPlaceringError) return json({ code: 'schema_placement_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 409 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    const placement = error.reason.startsWith('schema_placement_');
    return json({ code: placement ? 'schema_placement_unavailable' : 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: placement ? 409 : 503 });
  }
}
