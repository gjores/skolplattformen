import { studyPlanClassLabel, studyPlanClassToken, STUDY_PLAN_CLASS_LIMIT } from './study-plan-class-contract.ts';
import { invalidStudyPlan, parseStudyPlanSwedish, studyPlanDate, studyPlanEnum, studyPlanFields, studyPlanInt,
  studyPlanList, studyPlanNullable, studyPlanUnique, studyPlanUuid, type StudyPlanSwedish } from './study-plan-model.ts';

type Target = { unitId: string };
export type StudyPlanIntakePupil = { pupilId: string; placementId: string };
export type StudyPlanIntakeRow = StudyPlanIntakePupil & {
  swedish: StudyPlanSwedish;
  groupSubjects: ('SVEN' | 'SVEA')[];
  canSaveSwedish?: boolean;
  currentPlanSubject?: 'SVEN' | 'SVEA' | null;
  plan: { planId: string | null; revision: number; status: 'none' | 'needs_completion' | 'ready' | 'current' };
};
export type StudyPlanIntakePreviewRow = StudyPlanIntakeRow & {
  displayName: string;
  educationName: string;
  draftStatus: 'ready' | 'needs_completion' | 'existing' | 'blocked';
};
export type StudyPlanIntakeDraftReceipt = { commandId: string; rows: (StudyPlanIntakePupil & {
  outcome: 'saved' | 'existing' | 'changed' | 'blocked'; planId: string | null; revision: number;
})[] };
export type StudyPlanIntakeSwedishReceipt = StudyPlanIntakePupil & { commandId: string; swedish: StudyPlanSwedish };
export type StudyPlanIntakeRequest = Target & (
  | { action: 'read' | 'preview_drafts'; on: string; pupils: StudyPlanIntakePupil[] }
  | ({ action: 'save_swedish'; commandId: string; expectedRevision: number; subject: StudyPlanSwedish['subject'];
      assessment: StudyPlanSwedish['assessment']; effectiveOn: string } & StudyPlanIntakePupil)
  | ({ action: 'swedish_status'; commandId: string } & StudyPlanIntakePupil)
  | { action: 'save_drafts'; on: string; pupils: StudyPlanIntakePupil[]; previewToken: string; commandId: string }
  | { action: 'drafts_status'; commandId: string }
);

export function studyPlanIntakePupil(row: Record<string, unknown>): StudyPlanIntakePupil {
  return { pupilId: studyPlanUuid(row.pupilId), placementId: studyPlanUuid(row.placementId) };
}

function pupils<T extends StudyPlanIntakePupil>(value: unknown, parse: (item: unknown) => T): T[] {
  return studyPlanUnique(studyPlanList(value, parse, STUDY_PLAN_CLASS_LIMIT), row => row.placementId);
}

function selection(row: Record<string, unknown>, allowEmpty: boolean): StudyPlanIntakePupil[] {
  const rows = pupils(row.pupils, item => studyPlanIntakePupil(studyPlanFields(item, ['pupilId', 'placementId'])));
  if (!allowEmpty && rows.length === 0) invalidStudyPlan();
  return rows.sort((left, right) => left.placementId.localeCompare(right.placementId));
}

export function parseStudyPlanIntakeRequest(value: unknown): StudyPlanIntakeRequest {
  const { action, unitId: rawUnitId } = studyPlanFields(value, ['action', 'unitId'],
    ['pupils', 'pupilId', 'placementId', 'commandId', 'expectedRevision', 'subject', 'assessment', 'effectiveOn', 'previewToken', 'on']);
  const unitId = studyPlanUuid(rawUnitId);
  if (action === 'read' || action === 'preview_drafts') {
    const row = studyPlanFields(value, ['action', 'unitId', 'pupils', 'on']);
    return { action, unitId, on: studyPlanDate(row.on), pupils: selection(row, action === 'read') };
  }
  if (action === 'save_swedish') {
    const row = studyPlanFields(value, ['action', 'unitId', 'pupilId', 'placementId', 'commandId', 'expectedRevision', 'subject', 'assessment', 'effectiveOn']);
    const { subject, assessment } = parseStudyPlanSwedish({ revision: 1, subject: row.subject, assessment: row.assessment, effectiveOn: row.effectiveOn });
    return { action, unitId, ...studyPlanIntakePupil(row), commandId: studyPlanUuid(row.commandId), expectedRevision: studyPlanInt(row.expectedRevision, 0),
      subject, assessment, effectiveOn: studyPlanDate(row.effectiveOn) };
  }
  if (action === 'swedish_status') {
    const row = studyPlanFields(value, ['action', 'unitId', 'pupilId', 'placementId', 'commandId']);
    return { action, unitId, ...studyPlanIntakePupil(row), commandId: studyPlanUuid(row.commandId) };
  }
  if (action === 'save_drafts') {
    const row = studyPlanFields(value, ['action', 'unitId', 'pupils', 'previewToken', 'commandId', 'on']);
    return { action, unitId, on: studyPlanDate(row.on), pupils: selection(row, false), previewToken: studyPlanClassToken(row.previewToken), commandId: studyPlanUuid(row.commandId) };
  }
  if (action === 'drafts_status') {
    const row = studyPlanFields(value, ['action', 'unitId', 'commandId']);
    return { action, unitId, commandId: studyPlanUuid(row.commandId) };
  }
  return invalidStudyPlan();
}

const rowFields = ['pupilId', 'placementId', 'swedish', 'groupSubjects', 'plan'];
const rowOptions = ['canSaveSwedish', 'currentPlanSubject'];
export function parseStudyPlanIntakeRow(value: unknown): StudyPlanIntakeRow {
  const row = studyPlanFields(value, rowFields, rowOptions);
  const plan = studyPlanFields(row.plan, ['planId', 'revision', 'status']);
  const status = studyPlanEnum(plan.status, ['none', 'needs_completion', 'ready', 'current']);
  const planId = studyPlanNullable(plan.planId, studyPlanUuid), revision = studyPlanInt(plan.revision, 0);
  if ((status === 'none') !== (planId === null) || (planId === null) !== (revision === 0)) invalidStudyPlan();
  const swedish = parseStudyPlanSwedish(row.swedish);
  const canSaveSwedish = row.canSaveSwedish;
  if (canSaveSwedish !== undefined && typeof canSaveSwedish !== 'boolean') invalidStudyPlan();
  const currentPlanSubject = Object.hasOwn(row, 'currentPlanSubject')
    ? studyPlanNullable(row.currentPlanSubject, item => studyPlanEnum(item, ['SVEN', 'SVEA'])) : undefined;
  if (currentPlanSubject && (swedish.revision !== 0 || canSaveSwedish !== false || planId === null)) invalidStudyPlan();
  return { ...studyPlanIntakePupil(row), swedish, plan: { planId, revision, status },
    ...(canSaveSwedish !== undefined ? { canSaveSwedish } : {}), ...(currentPlanSubject !== undefined ? { currentPlanSubject } : {}),
    groupSubjects: studyPlanUnique(studyPlanList(row.groupSubjects, item => studyPlanEnum(item, ['SVEN', 'SVEA']), 2), item => item) };
}

export function parseStudyPlanIntakeRead(value: unknown) {
  const row = studyPlanFields(value, ['rows', 'canConfirmAssessment']);
  if (typeof row.canConfirmAssessment !== 'boolean') invalidStudyPlan();
  return { rows: pupils(row.rows, parseStudyPlanIntakeRow), canConfirmAssessment: row.canConfirmAssessment };
}

export function parseStudyPlanIntakePreview(value: unknown) {
  const { rows, previewToken } = studyPlanFields(value, ['rows', 'previewToken']);
  return { previewToken: studyPlanClassToken(previewToken), rows: pupils(rows, (value): StudyPlanIntakePreviewRow => {
    const { displayName, educationName, draftStatus, ...row } = studyPlanFields(value, [...rowFields, 'displayName', 'educationName', 'draftStatus'], rowOptions);
    return { ...parseStudyPlanIntakeRow(row), displayName: studyPlanClassLabel(displayName), educationName: studyPlanClassLabel(educationName),
      draftStatus: studyPlanEnum(draftStatus, ['ready', 'needs_completion', 'existing', 'blocked']) };
  }) };
}

export function parseStudyPlanIntakeDraftReceipt(value: unknown): StudyPlanIntakeDraftReceipt {
  const { rows, commandId } = studyPlanFields(value, ['commandId', 'rows']);
  return { commandId: studyPlanUuid(commandId), rows: pupils(rows, item => {
    const row = studyPlanFields(item, ['pupilId', 'placementId', 'outcome', 'planId', 'revision']);
    const outcome = studyPlanEnum(row.outcome, ['saved', 'existing', 'changed', 'blocked']);
    const planId = studyPlanNullable(row.planId, studyPlanUuid), revision = studyPlanInt(row.revision, 0);
    if ((planId === null) !== (revision === 0) || outcome === 'saved' && revision !== 1 || outcome === 'existing' && !planId) invalidStudyPlan();
    return { ...studyPlanIntakePupil(row), outcome, planId, revision };
  }) };
}

export function parseStudyPlanIntakeSwedishReceipt(value: unknown): StudyPlanIntakeSwedishReceipt {
  const row = studyPlanFields(value, ['commandId', 'pupilId', 'placementId', 'swedish']);
  const swedish = parseStudyPlanSwedish(row.swedish);
  if (!swedish.revision) invalidStudyPlan();
  return { ...studyPlanIntakePupil(row), commandId: studyPlanUuid(row.commandId), swedish };
}
