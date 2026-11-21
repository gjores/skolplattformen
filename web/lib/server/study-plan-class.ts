import type { JSONValue } from 'postgres';
import {
  parseStudyPlanClassPreview, parseStudyPlanClassRun, STUDY_PLAN_CLASS_LIMIT, studyPlanClassLabel, studyPlanClassToken,
  type StudyPlanClassPreview, type StudyPlanClassPreviewRow, type StudyPlanClassRequest, type StudyPlanClassRun, type StudyPlanClassScope,
} from '../study-plan-class-contract.ts';
import { STUDY_PLAN_CONTRACT_VERSION } from '../study-plan-contract.ts';
import {
  invalidStudyPlan, studyPlanDate, studyPlanFields, studyPlanInt, studyPlanList, studyPlanNullable, studyPlanUnique, studyPlanUuid,
} from '../study-plan-model.ts';
import { tjanstHashCanonical } from '../tjanst-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { requireSyntheticMandates } from './mandate-route.ts';
import { commandStudyPlan } from './study-plan.ts';
import { assessStudyPlanClassBasis, parseStudyPlanBasis } from './study-plan-basis.ts';
import { mandateSqlFailure } from './mandates.ts';

type Authority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'scopeKind'> & Pick<SessionContext, 'accessFunction'>;
type PreviewRow = StudyPlanClassPreviewRow & {
  placementId: string;
  membershipId: string;
  memberStartsOn: string;
  memberEndsOn: string | null;
  sourceToken: string | null;
  latestRevision: number;
};
type ClassKey = Pick<StudyPlanClassScope, 'unitId' | 'classId'>;

async function query(tx: Tx, input: Record<string, JSONValue>): Promise<unknown> {
  try {
    const rows = await tx<{ result: unknown }[]>`select public.individual_study_plan_class(${tx.json(input)}) as result`;
    if (rows.length !== 1) throw new AuditUnavailable();
    return rows[0].result;
  } catch (error) {
    const mapped = mandateSqlFailure(error);
    if (mapped) {
      const hint = (error as { hint?: unknown }).hint;
      const reason = ['study_plan_class_in_progress', 'study_plan_class_changed', 'study_plan_class_too_large'].find(code => code === hint);
      throw new Deny(mapped.code, mapped.status, reason ? { reason } : undefined);
    }
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && ['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(code)) {
      throw new Deny('db_unreachable', 503);
    }
    throw new AuditUnavailable();
  }
}

async function previewRow(value: unknown, indexes: Parameters<typeof assessStudyPlanClassBasis>[1]): Promise<PreviewRow> {
  const row = studyPlanFields(value, ['pupilId', 'placementId', 'displayName', 'educationName', 'membershipId',
    'memberStartsOn', 'memberEndsOn', 'latestRevision', 'basis', 'closed']);
  if (typeof row.closed !== 'boolean') invalidStudyPlan();
  const latestRevision = studyPlanInt(row.latestRevision, 0);
  const basis = row.basis === null ? null : parseStudyPlanBasis(row.basis);
  if (!basis && latestRevision === 0 && !row.closed) invalidStudyPlan();
  const reason = basis && !latestRevision && !row.closed ? await assessStudyPlanClassBasis(basis, indexes) : null;
  const blocked = reason === 'catalog' || reason === 'unsupported';
  const state: Pick<StudyPlanClassPreviewRow, 'status' | 'reason'> = latestRevision > 0 ? { status: 'existing', reason: null }
    : row.closed ? { status: 'blocked', reason: 'closed' }
    : blocked ? { status: 'blocked', reason }
    : reason ? { status: 'needs_completion', reason } : { status: 'ready', reason: null };
  return { pupilId: studyPlanUuid(row.pupilId), placementId: studyPlanUuid(row.placementId), displayName: studyPlanClassLabel(row.displayName),
    educationName: studyPlanClassLabel(row.educationName), membershipId: studyPlanUuid(row.membershipId), memberStartsOn: studyPlanDate(row.memberStartsOn),
    memberEndsOn: studyPlanNullable(row.memberEndsOn, studyPlanDate), latestRevision, sourceToken: basis?.token ?? null, ...state };
}

async function loadPreview(tx: Tx, ctx: Authority, scope: StudyPlanClassScope) {
  const raw = await query(tx, { action: 'preview', ...scope });
  try {
    const row = studyPlanFields(raw, ['schoolName', 'className', 'classStartsOn', 'rows']);
    const indexes = new Map();
    const rows = studyPlanUnique(await Promise.all(studyPlanList(row.rows, item => previewRow(item, indexes), STUDY_PLAN_CLASS_LIMIT)), item => item.pupilId);
    const publicRows = rows.map(({ pupilId, displayName, educationName, status, reason }) => ({ pupilId, displayName, educationName, status, reason }));
    const signature = rows.map(item => [item.pupilId, item.placementId, item.membershipId, item.memberStartsOn, item.memberEndsOn,
      item.latestRevision, item.sourceToken, item.status, item.reason]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const previewToken = await tjanstHashCanonical(['individual_study_plan_class_preview_v1', ctx.identityId, ctx.assignmentId, scope, signature]);
    const preview: StudyPlanClassPreview = parseStudyPlanClassPreview({
      scope, schoolName: row.schoolName, className: row.className, classStartsOn: row.classStartsOn, rows: publicRows, previewToken,
    });
    return { preview, rows };
  } catch { throw new AuditUnavailable(); }
}

function readRun(value: unknown, target: ClassKey & { runId?: string; on?: string; schoolYear?: number }): StudyPlanClassRun {
  try {
    const run = parseStudyPlanClassRun(value);
    if (run.unitId !== target.unitId || run.classId !== target.classId || target.runId && run.runId !== target.runId
      || target.on && run.on !== target.on) invalidStudyPlan();
    const year = target.schoolYear;
    if (year !== undefined && (run.on < `${year}-07-01` || run.on >= `${year + 1}-07-01`)) invalidStudyPlan();
    return run;
  } catch { throw new AuditUnavailable(); }
}

async function start(tx: Tx, ctx: Authority, request: Extract<StudyPlanClassRequest, { action: 'start' }>) {
  const { scope, runId, pupilIds, previewToken } = request;
  const target = { unitId: scope.unitId, classId: scope.classId, runId };
  const startToken = await tjanstHashCanonical(['individual_study_plan_class_start_v1', scope, previewToken, pupilIds]);
  const replay = await query(tx, { action: 'status', ...target, startToken });
  if (replay !== null) return readRun(replay, { ...scope, runId });

  const { preview, rows } = await loadPreview(tx, ctx, scope);
  if (preview.previewToken !== previewToken) throw new Deny('conflict', 409, { reason: 'study_plan_class_changed' });
  const selected = new Set(pupilIds);
  const candidates = rows.filter(item => selected.has(item.pupilId) && (item.status === 'ready' || item.status === 'needs_completion'));
  if (candidates.length !== selected.size || candidates.some(item => item.sourceToken === null)) throw new Deny('bad_request', 400);
  const reviewed = candidates.map(({ pupilId, placementId, membershipId, memberStartsOn, memberEndsOn, sourceToken }) => ({
    pupilId, placementId, membershipId, memberStartsOn, memberEndsOn, sourceToken,
  }));
  return readRun(await query(tx, { action: 'start', ...scope, runId, previewToken, startToken, rows: reviewed }), { ...scope, runId });
}

async function advance(tx: Tx, ctx: Authority, request: Extract<StudyPlanClassRequest, { action: 'advance' }>) {
  const { unitId, classId, runId } = request;
  const target = { unitId, classId, runId };
  const raw = await query(tx, { action: 'advance', ...target });
  let run: StudyPlanClassRun, next: { pupilId: string; placementId: string; sourceToken: string; commandId: string } | null;
  try {
    const row = studyPlanFields(raw, ['run', 'next']);
    run = readRun(row.run, target);
    next = studyPlanNullable(row.next, item => {
      const task = studyPlanFields(item, ['pupilId', 'placementId', 'sourceToken', 'commandId']);
      return { pupilId: studyPlanUuid(task.pupilId), placementId: studyPlanUuid(task.placementId),
        sourceToken: studyPlanClassToken(task.sourceToken), commandId: studyPlanUuid(task.commandId) };
    });
    if (next && !run.rows.some(item => item.pupilId === next?.pupilId && item.outcome === 'pending')) invalidStudyPlan();
  } catch { throw new AuditUnavailable(); }
  if (!next) return run;

  // Den valda raden och elevens ordinarie kommando kvitteras i samma skyddade transaktion.
  const { body } = await commandStudyPlan(tx, ctx, {
    contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId, pupilId: next.pupilId, placementId: next.placementId,
    commandId: next.commandId, action: 'prepare_draft', expectedRevision: 0, expectedSourceToken: next.sourceToken, payload: { dates: [] },
  });
  const outcome = body.status === 'saved' ? 'saved' : body.status === 'conflict' && body.latestRevision > 0 ? 'existing' : 'changed';
  return readRun(await query(tx, { action: 'finish', ...target, commandId: next.commandId, outcome }), target);
}

export async function studyPlanClass(tx: Tx, ctx: Authority, request: StudyPlanClassRequest) {
  if (!ctx.assignmentId || ctx.scopeKind !== 'school' || ctx.accessFunction !== 'rektor' && ctx.accessFunction !== 'administrator') {
    throw new Deny('forbidden', 403);
  }
  requireSyntheticMandates();

  let body: StudyPlanClassPreview | StudyPlanClassRun | null;
  switch (request.action) {
    case 'preview': {
      const { unitId, classId, on } = request;
      body = (await loadPreview(tx, ctx, { unitId, classId, on })).preview;
      break;
    }
    case 'start': body = await start(tx, ctx, request); break;
    case 'advance': body = await advance(tx, ctx, request); break;
    case 'status': {
      const result = await query(tx, request);
      body = result === null ? null : readRun(result, request);
      break;
    }
  }
  const scope = request.action === 'start' ? request.scope : request;
  return { body, event: { action: 'individual_study_plan_class_' + request.action, objectType: 'school_class', objectId: scope.classId,
    details: { unitId: scope.unitId, count: body?.rows.length ?? 0 } } };
}
