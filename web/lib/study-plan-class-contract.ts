import {
  invalidStudyPlan, studyPlanDate, studyPlanEnum, studyPlanFields, studyPlanInt, studyPlanList,
  studyPlanNullable, studyPlanUnique, studyPlanUuid,
} from './study-plan-model.ts';

export const STUDY_PLAN_CLASS_LIMIT = 100;
const previewStates = ['ready', 'needs_completion', 'existing', 'blocked'] as const;
const previewReasons = ['choice', 'details', 'catalog', 'unsupported', 'closed'] as const;
const outcomes = ['pending', 'saved', 'existing', 'changed'] as const;

type ClassTarget = { unitId: string; classId: string };
export type StudyPlanClassScope = ClassTarget & { on: string };
type PupilLabel = { pupilId: string; displayName: string; educationName: string };
export type StudyPlanClassPreviewRow = PupilLabel & {
  status: typeof previewStates[number];
  reason: typeof previewReasons[number] | null;
};
export type StudyPlanClassPreview = {
  scope: StudyPlanClassScope;
  schoolName: string;
  className: string;
  classStartsOn: string | null;
  rows: StudyPlanClassPreviewRow[];
  previewToken: string;
};
export type StudyPlanClassRun = StudyPlanClassScope & {
  runId: string;
  rows: (PupilLabel & { outcome: typeof outcomes[number] })[];
  hasPending: boolean;
};
export type StudyPlanClassRequest =
  | ({ action: 'preview' } & StudyPlanClassScope)
  | { action: 'start'; scope: StudyPlanClassScope; previewToken: string; pupilIds: string[]; runId: string }
  | ({ action: 'status'; runId?: string; schoolYear?: number } & ClassTarget)
  | ({ action: 'advance'; runId: string } & ClassTarget);

function target(row: Record<string, unknown>): ClassTarget {
  return { unitId: studyPlanUuid(row.unitId), classId: studyPlanUuid(row.classId) };
}

function scope(row: Record<string, unknown>): StudyPlanClassScope {
  return { ...target(row), on: studyPlanDate(row.on) };
}

export function studyPlanClassToken(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) invalidStudyPlan();
  return value;
}

export function studyPlanClassLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 10000) invalidStudyPlan();
  return value;
}

function pupils<T>(value: unknown, parse: (entry: unknown) => T & { pupilId: string }): (T & { pupilId: string })[] {
  return studyPlanUnique(studyPlanList(value, parse, STUDY_PLAN_CLASS_LIMIT), row => row.pupilId);
}

function label(row: Record<string, unknown>): PupilLabel {
  return { pupilId: studyPlanUuid(row.pupilId), displayName: studyPlanClassLabel(row.displayName), educationName: studyPlanClassLabel(row.educationName) };
}

export function parseStudyPlanClassRequest(value: unknown): StudyPlanClassRequest {
  const { action } = studyPlanFields(value, ['action'], ['unitId', 'classId', 'on', 'scope', 'previewToken', 'pupilIds', 'runId', 'schoolYear']);
  switch (action) {
    case 'preview': {
      return { action, ...scope(studyPlanFields(value, ['action', 'unitId', 'classId', 'on'])) };
    }
    case 'start': {
      const row = studyPlanFields(value, ['action', 'scope', 'previewToken', 'pupilIds', 'runId']);
      const pupilIds = studyPlanUnique(studyPlanList(row.pupilIds, studyPlanUuid, STUDY_PLAN_CLASS_LIMIT), id => id);
      if (!pupilIds.length) invalidStudyPlan();
      return { action, scope: scope(studyPlanFields(row.scope, ['unitId', 'classId', 'on'])),
        previewToken: studyPlanClassToken(row.previewToken), pupilIds: pupilIds.sort(), runId: studyPlanUuid(row.runId) };
    }
    case 'status': {
      const row = studyPlanFields(value, ['action', 'unitId', 'classId'], ['runId', 'schoolYear']);
      if (Object.hasOwn(row, 'runId') && Object.hasOwn(row, 'schoolYear')) invalidStudyPlan();
      return { action, ...target(row),
        ...(Object.hasOwn(row, 'runId') ? { runId: studyPlanUuid(row.runId) } : {}),
        ...(Object.hasOwn(row, 'schoolYear') ? { schoolYear: studyPlanInt(row.schoolYear, 1000, 9998) } : {}) };
    }
    case 'advance': {
      const row = studyPlanFields(value, ['action', 'unitId', 'classId', 'runId']);
      return { action, ...target(row), runId: studyPlanUuid(row.runId) };
    }
    default: return invalidStudyPlan();
  }
}

export function parseStudyPlanClassPreview(value: unknown): StudyPlanClassPreview {
  const row = studyPlanFields(value, ['scope', 'schoolName', 'className', 'classStartsOn', 'rows', 'previewToken']);
  const rows = pupils(row.rows, item => {
    const entry = studyPlanFields(item, ['pupilId', 'displayName', 'educationName', 'status', 'reason']);
    const status = studyPlanEnum(entry.status, previewStates);
    const reason = studyPlanNullable(entry.reason, value => studyPlanEnum(value, previewReasons));
    if (status === 'needs_completion' ? reason !== 'choice' && reason !== 'details'
      : status === 'blocked' ? reason !== 'catalog' && reason !== 'unsupported' && reason !== 'closed'
      : reason !== null) invalidStudyPlan();
    return { ...label(entry), status, reason };
  });
  return { scope: scope(studyPlanFields(row.scope, ['unitId', 'classId', 'on'])), schoolName: studyPlanClassLabel(row.schoolName),
    className: studyPlanClassLabel(row.className), classStartsOn: studyPlanNullable(row.classStartsOn, studyPlanDate),
    rows, previewToken: studyPlanClassToken(row.previewToken) };
}

export function parseStudyPlanClassRun(value: unknown): StudyPlanClassRun {
  const row = studyPlanFields(value, ['runId', 'unitId', 'classId', 'on', 'rows', 'hasPending']);
  const rows = pupils(row.rows, item => {
    const entry = studyPlanFields(item, ['pupilId', 'displayName', 'educationName', 'outcome']);
    return { ...label(entry), outcome: studyPlanEnum(entry.outcome, outcomes) };
  });
  const hasPending = rows.some(pupil => pupil.outcome === 'pending');
  if (row.hasPending !== hasPending) invalidStudyPlan();
  return { ...scope(row), runId: studyPlanUuid(row.runId), rows, hasPending };
}
