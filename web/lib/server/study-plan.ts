import { stockholmToday } from '../programplan-lifecycle.ts';
import {
  parseStudyPlanCommandReply, parseStudyPlanReadReply, parseStudyPlanStatusReply,
  type StudyPlanCommand, type StudyPlanReadRequest, type StudyPlanScope, type StudyPlanStatusRequest,
} from '../study-plan-contract.ts';
import { parseStudyPlanContent, parseStudyPlanSnapshot, StudyPlanContractError, studyPlanFields, studyPlanUuid } from '../study-plan-model.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { requireSyntheticMandates } from './mandate-route.ts';
import { mandateSqlFailure } from './mandates.ts';
import { parseStudyPlanBasis, prepareStudyPlanDraft, projectStudyPlanBasis } from './study-plan-basis.ts';
import { tjanstRequest } from './tjanst.ts';

type StudyPlanAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction' | 'scopeKind'>;
type StudyPlanDbRow = { result: unknown };

export const studyPlanRequest = <T>(request: Request, parse: (value: unknown) => T): Promise<T> =>
  tjanstRequest(request, parse, 512_000);

function authorize(ctx: StudyPlanAuthority) {
  if (!ctx.assignmentId || ctx.scopeKind !== 'school' || ctx.accessFunction !== 'rektor' && ctx.accessFunction !== 'administrator') {
    throw new Deny('forbidden', 403);
  }
  requireSyntheticMandates();
}

async function query(run: () => Promise<StudyPlanDbRow[]>) {
  try { return await run(); }
  catch (error) {
    const mapped = mandateSqlFailure(error);
    if (mapped) throw new Deny(mapped.code, mapped.status);
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (typeof code === 'string' && ['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(code)) {
      throw new Deny('db_unreachable', 503);
    }
    throw new AuditUnavailable();
  }
}

function requireEnvelope(rows: StudyPlanDbRow[], ctx: StudyPlanAuthority, read: boolean) {
  if (rows.length !== 1) throw new AuditUnavailable();
  const fields = ['contractVersion', 'actor', 'result'];
  const envelope = studyPlanFields(rows[0].result, read ? [...fields, 'basis', 'latest'] : fields);
  const actor = studyPlanFields(envelope.actor, ['identityId', 'assignmentId']);
  if (envelope.contractVersion !== 'individual_study_plan_sql_v1'
    || studyPlanUuid(actor.identityId) !== ctx.identityId || studyPlanUuid(actor.assignmentId) !== ctx.assignmentId) {
    throw new AuditUnavailable();
  }
  return envelope;
}

function event(action: string, scope: StudyPlanScope) {
  return { action, objectType: 'pupil_placement', objectId: scope.placementId, details: { unitId: scope.unitId } };
}

async function read(tx: Tx, ctx: StudyPlanAuthority, request: StudyPlanReadRequest) {
  const rows = await query(() => tx<StudyPlanDbRow[]>`select public.individual_study_plan_read(${tx.json(request)}) as result`);
  try {
    const { result, basis, latest } = requireEnvelope(rows, ctx, true);
    const body = parseStudyPlanReadReply(result, request);
    if (body.view !== 'current') {
      if (basis !== null || latest !== null) throw new AuditUnavailable();
      return { body, basis: null, latest: null };
    }
    const source = parseStudyPlanBasis(basis);
    const version = latest === null ? null : parseStudyPlanSnapshot(latest);
    const metadata = body.history.find(row => row.revision === body.latestRevision);
    if ((ctx.accessFunction !== 'rektor' && body.canMakeCurrent)
      || source.token !== body.sourceToken || JSON.stringify(source.calendar) !== JSON.stringify(body.calendar ?? [])
      || (version?.revision ?? 0) !== body.latestRevision
      || version && (!metadata || version.planId !== metadata.planId || version.recordedAt !== metadata.recordedAt
        || version.effectiveOn !== metadata.effectiveOn || version.state !== metadata.state
        || version.content.source.offeringId !== source.source.offeringId)
      || body.draft && JSON.stringify(body.draft) !== JSON.stringify(version)) {
      throw new AuditUnavailable();
    }
    return { body, basis: source, latest: version };
  } catch { throw new AuditUnavailable(); }
}

export async function readStudyPlan(tx: Tx, ctx: StudyPlanAuthority, request: StudyPlanReadRequest) {
  authorize(ctx);
  const { body, basis } = await read(tx, ctx, request);
  if (body.view !== 'current' || !basis) return { body, event: event('individual_study_plan_read', request) };
  try {
    const projection = await projectStudyPlanBasis(basis);
    const scoped = parseStudyPlanReadReply({ ...body, ...projection }, request);
    return { body: scoped, event: event('individual_study_plan_read', request) };
  } catch { throw new AuditUnavailable(); }
}

export async function commandStudyPlan(tx: Tx, ctx: StudyPlanAuthority, command: StudyPlanCommand) {
  authorize(ctx);
  if ((command.action === 'make_current' || command.action === 'record_decision') && ctx.accessFunction !== 'rektor') {
    throw new Deny('forbidden', 403);
  }
  let content = null;
  if (command.action === 'prepare_draft') {
    const { contractVersion, unitId, pupilId, placementId } = command;
    const { body, basis, latest } = await read(tx, ctx, { contractVersion, unitId, pupilId, placementId, view: 'current', on: stockholmToday() });
    if (!basis || body.view !== 'current') throw new AuditUnavailable();
    // SQL prövar kvittot före käll- och revisionskontrollen även efter ett förlorat svar.
    if (body.latestRevision === command.expectedRevision && body.sourceToken === command.expectedSourceToken
      && basis.path.regime === 'national_gy25') {
      try { content = parseStudyPlanContent(await prepareStudyPlanDraft(basis, latest, command.payload)); }
      catch (error) {
        if (error instanceof StudyPlanContractError) throw new Deny('bad_request', 400);
        throw new AuditUnavailable();
      }
    }
  }
  const rows = await query(() => tx<StudyPlanDbRow[]>`select public.individual_study_plan_command(${tx.json({ command, content })}) as result`);
  try {
    const body = parseStudyPlanCommandReply(requireEnvelope(rows, ctx, false).result, command);
    if (body.status === 'saved' && content && JSON.stringify(body.receipt.snapshot.content) !== JSON.stringify(content)) {
      throw new AuditUnavailable();
    }
    return { body, event: event('individual_study_plan_command', command) };
  } catch { throw new AuditUnavailable(); }
}

export async function statusStudyPlan(tx: Tx, ctx: StudyPlanAuthority, request: StudyPlanStatusRequest) {
  authorize(ctx);
  const rows = await query(() => tx<StudyPlanDbRow[]>`select public.individual_study_plan_status(${tx.json(request)}) as result`);
  try {
    const body = parseStudyPlanStatusReply(requireEnvelope(rows, ctx, false).result, request);
    return { body, event: event('individual_study_plan_status', request) };
  } catch { throw new AuditUnavailable(); }
}
