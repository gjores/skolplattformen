import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { readElectiveBlocks } from '../../../../lib/server/elective-block.ts';
import { logEvent } from '../../../../lib/server/events.ts';
import { json } from '../../../../lib/server/http.ts';
import { lasarRead } from '../../../../lib/server/lasar.ts';
import { readStudyGroups } from '../../../../lib/server/study-groups.ts';
import { SchemaEngineError, solveSchema } from '../../../../lib/server/schemamotor.ts';
import { planRead, tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { parseSchemaForslagRequest, type SchemaForslagRequest, type SchemaSolution } from '../../../../lib/schema-contract.ts';
import { schemaTime } from '../../../../lib/schema-kalender.ts';
import { buildSchemaUnderlag, mergeSchemaMembers, schemaForslag, type SchemaBasis } from '../../../../lib/schema-underlag.ts';
import type { TjanstPlanRead } from '../../../../lib/tjanst-contract.ts';

/**
 * Schemaförslag ur tjänstefördelningen. Läsningen sker med tjänstefördelningens behörighet och granskningshändelse (K2).
 * Elevernas gruppmedlemskap och läsårskalendern läses i samma transaktion med sina egna läsfunktioner, behörigheter och
 * granskningshändelser (E1, E4); eftersom elevuppgifter läses krävs stark inloggning som i de vyerna.
 * Motorn anropas först när databastransaktionen är klar, så att räknetiden inte håller en anslutning. Inget sparas.
 */
export async function POST(request: Request): Promise<Response> {
  const read: { plan?: TjanstPlanRead; input?: SchemaForslagRequest; basis?: SchemaBasis } = {};
  const response = await protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, parseSchemaForslagRequest);
    const scope = { unitId: input.unitId, schoolYear: input.schoolYear }, target = { kind: 'school' as const, unitId: input.unitId };
    const result = await planRead(tx, scope, ctx);
    const elective = await readElectiveBlocks(tx, ctx, scope), study = await readStudyGroups(tx, ctx, scope);
    // Den gällande fastställda kalendern går före ett senare utkast.
    let lasar = await lasarRead(tx, { target, schoolYear: input.schoolYear, versionId: null }, ctx);
    const current = lasar.body.versions.find(v => v.current);
    if (current && lasar.body.calendar?.versionId !== current.versionId) lasar = await lasarRead(tx, { target, schoolYear: input.schoolYear, versionId: current.versionId }, ctx);
    for (const extra of [elective.event, study.event, lasar.event]) await logEvent(tx, { ...ctx, request }, { ...extra, outcome: 'ok' });
    read.plan = result.body;
    read.input = input;
    read.basis = { members: mergeSchemaMembers([{ pupils: elective.body.pupils, memberships: elective.body.placements }, { pupils: study.body.pupils, memberships: study.body.memberships }]),
      time: schemaTime(lasar.body, input.term, result.body.classes.map(c => c.classId)) };
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
