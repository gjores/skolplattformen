import type { JSONValue } from 'postgres';
import { STUDY_PLAN_CONTRACT_VERSION, type StudyPlanCommand } from '../study-plan-contract.ts';
import { parseStudyPlanIntakeDraftReceipt, parseStudyPlanIntakePreview, parseStudyPlanIntakeRead, parseStudyPlanIntakeRow,
  parseStudyPlanIntakeSwedishReceipt, type StudyPlanIntakePreviewRow, type StudyPlanIntakePupil, type StudyPlanIntakeRequest } from '../study-plan-intake-contract.ts';
import { STUDY_PLAN_CLASS_LIMIT } from '../study-plan-class-contract.ts';
import { invalidStudyPlan, studyPlanFields, studyPlanList } from '../study-plan-model.ts';
import { tjanstHashCanonical } from '../tjanst-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { requireSyntheticMandates } from './mandate-route.ts';
import { mandateSqlFailure } from './mandates.ts';
import { assessStudyPlanClassBasis, parseStudyPlanBasis, prepareStudyPlanDraft } from './study-plan-basis.ts';

type Authority = Pick<SessionContext, 'assignmentId' | 'identityId' | 'accessFunction' | 'scopeKind'>;
type Selection = { unitId: string; on: string; pupils: StudyPlanIntakePupil[] };
type Foundation = ReturnType<typeof parseStudyPlanBasis>;

async function query(tx: Tx, input: Record<string, JSONValue>) {
  try {
    const rows = await tx<{ result: unknown }[]>`select public.individual_study_plan_intake(${tx.json(input)}) as result`;
    if (rows.length !== 1) throw new AuditUnavailable();
    return rows[0].result;
  } catch (error) {
    const mapped = mandateSqlFailure(error);
    if (mapped) {
      const hint = (error as { hint?: unknown }).hint;
      const reason = ['study_plan_swedish_changed', 'study_plan_swedish_later_change'].find(value => value === hint);
      throw new Deny(mapped.code, mapped.status, reason ? { reason } : undefined);
    }
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && ['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(code)) {
      throw new Deny('db_unreachable', 503);
    }
    throw new AuditUnavailable();
  }
}

function ensureSameRows(rows: StudyPlanIntakePupil[], requested: StudyPlanIntakePupil[]) {
  const placements = new Map(requested.map(row => [row.placementId, row.pupilId]));
  if (rows.length !== placements.size || rows.some(row => placements.get(row.placementId) !== row.pupilId)) invalidStudyPlan();
}

async function preview(tx: Tx, ctx: Authority, { unitId, on, pupils }: Selection) {
  const answer = await query(tx, { action: 'preview_drafts', unitId, on, pupils });
  try {
    const result = studyPlanFields(answer, ['rows', 'canConfirmAssessment']);
    if (result.canConfirmAssessment !== (ctx.accessFunction === 'rektor')) invalidStudyPlan();
    const indexes = new Map();
    const rows = await Promise.all(studyPlanList(result.rows, async value => {
      const { displayName, educationName, closed, basis, ...row } = studyPlanFields(value,
        ['pupilId', 'placementId', 'swedish', 'groupSubjects', 'plan', 'displayName', 'educationName', 'closed', 'basis'],
        ['canSaveSwedish', 'currentPlanSubject']);
      const publicRow = parseStudyPlanIntakeRow(row);
      if (typeof closed !== 'boolean') invalidStudyPlan();
      const source = basis === null ? null : parseStudyPlanBasis(basis);
      const existing = publicRow.plan.status !== 'none';
      if ((source !== null) !== (!existing && !closed)) invalidStudyPlan();
      const reason = source && await assessStudyPlanClassBasis(source, indexes);
      const draftStatus: StudyPlanIntakePreviewRow['draftStatus'] = existing ? 'existing'
        : closed || reason === 'catalog' || reason === 'unsupported' ? 'blocked' : reason ? 'needs_completion' : 'ready';
      return { row: { ...publicRow, displayName, educationName, draftStatus }, source };
    }, STUDY_PLAN_CLASS_LIMIT));
    ensureSameRows(rows.map(item => item.row), pupils);
    const signature = rows.map(({ row, source }) => [row, source?.token ?? null, source?.programTerms ?? null]);
    const previewToken = await tjanstHashCanonical(['individual_study_plan_intake_preview_v1', ctx.identityId, ctx.assignmentId, unitId, on, signature]);
    return { body: parseStudyPlanIntakePreview({ rows: rows.map(value => value.row), previewToken }), rows: rows.map(item => item.source) };
  } catch { throw new AuditUnavailable(); }
}

function verifyDraftReceipt(value: unknown, commandId: string, pupils?: StudyPlanIntakePupil[]) {
  const body = parseStudyPlanIntakeDraftReceipt(value);
  if (body.commandId !== commandId) invalidStudyPlan();
  if (pupils) ensureSameRows(body.rows, pupils);
  return body;
}

async function saveDrafts(tx: Tx, ctx: Authority, request: Extract<StudyPlanIntakeRequest, { action: 'save_drafts' }>) {
  const { unitId, on, pupils, commandId, previewToken } = request;
  const requestHash = await tjanstHashCanonical(['individual_study_plan_intake_command_v1', unitId, on, pupils, previewToken]);
  const replay = await query(tx, { action: 'replay_drafts', unitId, commandId, requestHash });
  if (replay !== null) return verifyDraftReceipt(replay, commandId, pupils);
  const reviewed = await preview(tx, ctx, request);
  if (reviewed.body.previewToken !== previewToken) throw new Deny('conflict', 409, { reason: 'study_plan_intake_changed' });

  const indexes = new Map();
  const commands = await Promise.all(reviewed.body.rows.flatMap((row, i) => {
    const source: Foundation | null = reviewed.rows[i];
    if (row.draftStatus !== 'ready' && row.draftStatus !== 'needs_completion') return [];
    if (!source) invalidStudyPlan();
    const { pupilId, placementId } = row;
    const command = { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId, pupilId, placementId, action: 'prepare_draft',
      expectedRevision: 0, expectedSourceToken: source.token, commandId: crypto.randomUUID(), payload: { dates: [], requireSharedSwedish: true } } satisfies StudyPlanCommand;
    return [prepareStudyPlanDraft(source, null, command.payload, indexes).then(content => ({ command, content }))];
  }));
  if (!commands.length) throw new Deny('bad_request', 400);
  const result = await query(tx, { action: 'save_drafts', unitId, on, pupils, commandId, requestHash, commands });
  return verifyDraftReceipt(result, commandId, pupils);
}

async function handle(tx: Tx, ctx: Authority, request: StudyPlanIntakeRequest) {
  switch (request.action) {
    case 'read': {
      const result = parseStudyPlanIntakeRead(await query(tx, request));
      ensureSameRows(result.rows, request.pupils);
      if (result.canConfirmAssessment !== (ctx.accessFunction === 'rektor')) invalidStudyPlan();
      return result;
    }
    case 'preview_drafts': return (await preview(tx, ctx, request)).body;
    case 'save_drafts': return saveDrafts(tx, ctx, request);
    case 'drafts_status': {
      const result = await query(tx, request);
      return result === null ? null : verifyDraftReceipt(result, request.commandId);
    }
    case 'save_swedish':
    case 'swedish_status': {
      if (request.action === 'save_swedish' && request.assessment === 'confirmed' && ctx.accessFunction !== 'rektor') throw new Deny('forbidden', 403);
      const raw = await query(tx, request);
      if (raw === null && request.action === 'swedish_status') return null;
      const result = request.action === 'save_swedish' ? studyPlanFields(raw, ['row', 'receipt']) : null;
      const receipt = parseStudyPlanIntakeSwedishReceipt(result ? result.receipt : raw);
      if (receipt.commandId !== request.commandId || receipt.pupilId !== request.pupilId || receipt.placementId !== request.placementId) invalidStudyPlan();
      if (request.action === 'swedish_status') return receipt;
      const row = parseStudyPlanIntakeRow(result?.row);
      if (row.pupilId !== request.pupilId || row.placementId !== request.placementId || row.swedish.revision < receipt.swedish.revision
        || receipt.swedish.revision !== request.expectedRevision + 1 || receipt.swedish.subject !== request.subject
        || receipt.swedish.assessment !== request.assessment || receipt.swedish.effectiveOn !== request.effectiveOn) invalidStudyPlan();
      return { row, receipt };
    }
  }
}

export async function studyPlanIntake(tx: Tx, ctx: Authority, request: StudyPlanIntakeRequest) {
  if (!ctx.assignmentId || ctx.scopeKind !== 'school' || ctx.accessFunction !== 'rektor' && ctx.accessFunction !== 'administrator') throw new Deny('forbidden', 403);
  requireSyntheticMandates();
  try {
    const body = await handle(tx, ctx, request);
    const event = { action: `individual_study_plan_intake_${request.action}`, objectType: 'school_unit', objectId: request.unitId,
      details: { unitId: request.unitId, ...('pupils' in request ? { count: request.pupils.length } : {}) } };
    return { body, event };
  } catch (error) {
    if (error instanceof Deny) throw error;
    throw new AuditUnavailable();
  }
}
