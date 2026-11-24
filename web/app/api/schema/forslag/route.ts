import { SchemaFordelningError } from '../../../../lib/schema-fordelning.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { json } from '../../../../lib/server/http.ts';
import { readSchemaBasis, schemaBegaran } from '../../../../lib/server/schema-read.ts';
import { SchemaEngineError, solveSchema } from '../../../../lib/server/schemamotor.ts';
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, type SchemaSolution } from '../../../../lib/schema-contract.ts';
import { parseSchemaSolveRequest, type SchemaSolveRequest } from '../../../../lib/schema-fortsatt.ts';
import { buildSchemaUnderlag, schemaForslag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { logEvent } from '../../../../lib/server/events.ts';
import { readNationellaProv } from '../../../../lib/server/nationella-prov.ts';
import { readSchemaDatedBasis } from '../../../../lib/server/schema-datum-read.ts';
import { readSchemaDraftSnapshot } from '../../../../lib/server/schema-draft.ts';
import { SCHEMA_DRAFT_VERSION } from '../../../../lib/schema-draft-contract.ts';
import { nyttSchemaProvKomplett, nyttSchemaProvResultHash, planeraNyttSchemaProv, provForPeriod } from '../../../../lib/server/schema-nytt-prov-plan.ts';
import { schemaNyttProvKallHash } from '../../../../lib/server/schema-nytt-prov-kalla.ts';
import { SchemaDatumError } from '../../../../lib/schema-datum.ts';
import type { SchemaNyttProvPlanering } from '../../../../lib/schema-nytt-prov.ts';
import type { NationellaProvRegister } from '../../../../lib/nationella-prov.ts';

type NyttProvUnderlag = {
  source: Awaited<ReturnType<typeof readSchemaBasis>> & { datedBasis: Awaited<ReturnType<typeof readSchemaDatedBasis>>['body'] };
  draft: Awaited<ReturnType<typeof readSchemaDraftSnapshot>>;
  register: NationellaProvRegister;
  bookings: number;
};

function parseGeneration(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaContractError();
  const { planeraProv, ...solve } = value as Record<string, unknown>;
  if (planeraProv !== undefined && planeraProv !== true) throw new SchemaContractError();
  return { input: parseSchemaSolveRequest(solve), planeraProv: planeraProv === true };
}

/**
 * Schemaförslag ur tjänstefördelningen. Läsningen (`readSchemaBasis`) sker med tjänstefördelningens behörighet och granskningshändelse (K2);
 * eftersom elevuppgifter läses krävs stark inloggning som i de vyerna.
 * Motorn anropas först när databastransaktionen är klar, så att räknetiden inte håller en anslutning. Inget sparas.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaSolveRequest; basis?: SchemaBasis; prov?: NyttProvUnderlag } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const { input, planeraProv } = await schemaBegaran(request, parseGeneration);
    const result = await readSchemaBasis(request, tx, ctx, input);
    read.plan = result.plan; read.input = input; read.basis = result.basis;
    if (planeraProv) {
      const { unitId, schoolYear, period } = input;
      const register = await readNationellaProv(tx, ctx, unitId, schoolYear);
      try { await logEvent(tx, { ...ctx, request }, { action: 'nationella_prov_read', objectType: 'nationella_prov', objectId: unitId, details: { unitId, schoolYear }, outcome: 'ok' }); }
      catch { throw new AuditUnavailable(); }
      const bookings = register ? provForPeriod(register.document.bokningar, result.basis.time?.dates ?? [], period).length : 0;
      if (register && bookings) {
        if (ctx.accessFunction !== 'rektor') throw new Deny('forbidden', 403, { reason: 'schema_nytt_prov_rektor' });
        if (!result.basis.time?.current || !result.basis.time.dates?.length) throw new Deny('conflict', 409, { reason: 'schema_nytt_prov_calendar' });
        const draft = await readSchemaDraftSnapshot(tx, ctx, { contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period });
        const dated = await readSchemaDatedBasis(tx, ctx, input);
        try { await logEvent(tx, { ...ctx, request }, { ...dated.event, outcome: 'ok' }); }
        catch { throw new AuditUnavailable(); }
        read.prov = { source: { ...result, datedBasis: dated.body }, draft, register, bookings };
      }
    }
    return { body: null, event: result.event };
  });
  if (!response.ok || !read.plan || !read.input || !read.basis) return response;
  const correlationId = response.headers.get('X-Correlation-Id') ?? '', epochHeader = response.headers.get('X-Context-Epoch');
  const init = { correlationId, ...(epochHeader === null ? {} : { epoch: Number(epochHeader) }) };
  try {
    const underlag = buildSchemaUnderlag(read.plan, read.input, read.basis);
    const empty: SchemaSolution = { status: 'input_missing', placements: [], unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 };
    const solution = underlag.problem.lessons.length === 0 ? empty : await solveSchema(underlag.problem, read.input.solveTimeMs);
    const forslag = schemaForslag(read.plan, read.input, underlag, solution);
    if (!read.prov) return json(forslag, init);
    const { source, draft, register, bookings } = read.prov;
    if (!forslag.metrics.placed || forslag.metrics.unplaced) return json({ code: 'conflict', correlationId,
      details: { reason: 'schema_nytt_prov_unresolved', bookings, resourceIssues: 0, remainingMinutes: 0, dateIssues: 0, unplaced: forslag.metrics.unplaced } }, { ...init, status: 409 });
    const plan = await planeraNyttSchemaProv(source, { ...read.input, villkor: forslag.villkor, contractVersion: SCHEMA_CONTRACT_VERSION,
      grundFingerprint: forslag.grundFingerprint, placements: solution.placements }, register, { draft });
    if (!nyttSchemaProvKomplett(plan)) return json({ code: 'conflict', correlationId, details: { reason: 'schema_nytt_prov_unresolved', bookings,
      resourceIssues: plan.result.bokningar.filter(b => !b.sal || !b.vakter.length || b.problem.length > 0).length,
      remainingMinutes: plan.result.bortfall.reduce((sum, b) => sum + b.kvarMin, 0), dateIssues: plan.dateIssues,
      bokningarMedHinder: plan.bokningarMedHinder } }, { ...init, status: 409 });
    const provplanering: SchemaNyttProvPlanering = { draftId: draft?.id ?? null, expectedRevision: draft?.revision ?? 0, provrevision: register.revision,
      sourceHash: await schemaNyttProvKallHash(source, draft, register, forslag.villkor), resultHash: await nyttSchemaProvResultHash(plan),
      bookings: plan.result.bokningar.length, moveCount: plan.result.ersattningar.length,
      replacedMinutes: plan.result.ersattningar.reduce((sum, flytt) => sum + flytt.durationMin, 0),
      undervisning: plan.result.bortfall, bevaradeDatum: plan.bevaradeDatum,
      ...(plan.dateradAktivitet && { dateradAktivitet: plan.dateradAktivitet }) };
    return json({ ...forslag, provplanering }, init);
  } catch (error) {
    if (error instanceof Deny) return json({ code: error.code, correlationId, details: error.details }, { ...init, status: error.status });
    if (error instanceof SchemaDatumError) return json({ code: 'conflict', correlationId, details: { reason: error.reason } }, { ...init, status: 409 });
    if (error instanceof SchemaFordelningError) return json({ code: 'schema_fordelning_invalid', correlationId, details: { issues: error.issues.slice(0, 20) } }, { ...init, status: 400 });
    if (error instanceof SchemaContractError) return json({ code: 'bad_request', correlationId }, { ...init, status: 400 });
    if (!(error instanceof SchemaEngineError)) throw error;
    return json({ code: 'schema_engine_unavailable', correlationId, details: { reason: error.reason } }, { ...init, status: 503 });
  }
}
