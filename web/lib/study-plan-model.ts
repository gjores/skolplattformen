import { catalogDate } from './programplan-catalog.ts';
import { PROGRAMPLAN_LANGUAGES } from './programplan-languages.ts';

/**
 * SS 12000:2024 / SIS OpenAPI 2.1.0. The scope identifies Person, Organisation
 * and Placement. StudyPlan has a separate ID, and a level can be mapped from
 * StudyPlanSyllabus to Syllabus. Source pins, revision history, attempts, term
 * precision, separate date pairs and decision references are local fields.
 */
export const STUDY_PLAN_REGIMES = ['national_gy25', 'gy11', 'unsupported'] as const;
export const STUDY_PLAN_LEVEL_KINDS = ['gy25_level', 'gy11_course', 'diploma_work'] as const;
export const STUDY_PLAN_DECISION_KINDS = ['extended', 'adapted', 'reduced', 'eligibility_opt_out', 'replaced'] as const;
export const STUDY_PLAN_CHOICE_KINDS = ['orientation', 'specialization', 'individual', 'language', 'optional'] as const;
export type StudyPlanIssue = { code: string; field: string };

export type PlannedStudyDate =
  | { kind: 'day'; date: string }
  | { kind: 'term'; schoolYear: number; term: 'HT' | 'VT' }
  | null;

export type StudyPlanPath = {
  regime: typeof STUDY_PLAN_REGIMES[number];
  programCode: string;
  orientationCode: string | null;
  apprenticeship: boolean | null;
  specialVariantCode: string | null;
};
export type StudyPlanSource = {
  offeringId: string;
  placementStartsOn: string;
  placementEndsOn: string | null;
  catalogId: string | null;
  programVersion: number | null;
  choices: { id: string; revision: number }[];
};
export type StudyPlanLevelRef = {
  subjectCode: string;
  subjectVersion: number;
  itemCode: string;
  languageCode: string | null;
};
export type StudyPlanCatalogLevel = StudyPlanLevelRef & { label: string; points: number };

export type StudyFactSource = { kind: 'school_record' | 'previous_school'; id: string };
export type StudyFact = { on: string; source: StudyFactSource };
export type StudyEnd = StudyFact & { kind: 'completed' | 'interrupted' };
export type StudyPlanAttempt = {
  id: string;
  plannedStart: PlannedStudyDate;
  plannedEnd: PlannedStudyDate;
  actual: { certainty: 'recorded' | 'unknown'; start: StudyFact | null; end: StudyEnd | null };
};
export type StudyPlanLevel = {
  id: string;
  kind: typeof STUDY_PLAN_LEVEL_KINDS[number];
  subjectCode: string | null;
  subjectVersion: number | null;
  itemCode: string;
  languageCode: string | null;
  label: string;
  points: number;
  attempts: StudyPlanAttempt[];
};
export type StudyPlanChoice = {
  id: string;
  kind: typeof STUDY_PLAN_CHOICE_KINDS[number];
  label: string;
  state: 'unresolved' | 'confirmed' | 'not_applicable';
  levelIds: string[];
};
export type StudyPlanDecision = {
  id: string;
  kind: typeof STUDY_PLAN_DECISION_KINDS[number];
  reference: { kind: 'action_programme_decision' | 'school_decision'; id: string };
  decidedOn: string;
  effectiveOn: string;
  endsOn: string | null;
  scopePoints: number | null;
  levelIds: string[];
  replacementLevelIds: string[];
};
export type StudyPlanCompulsorySubject = { code: string; label: string };
export type StudyPlanDistanceTeaching = { kind: 'unknown' | 'none' | 'applies'; minutes: number | null };
export type StudyPlanContent = {
  path: StudyPlanPath;
  source: StudyPlanSource;
  levels: StudyPlanLevel[];
  choices: StudyPlanChoice[];
  decisions: StudyPlanDecision[];
  compulsorySchoolSubjects: StudyPlanCompulsorySubject[] | null;
  distanceTeaching: StudyPlanDistanceTeaching;
  dialogue: { on: string; reviewedRevision: number } | null;
  sourceIssues: StudyPlanIssue[];
};
export type StudyPlanRevision = {
  planId: string;
  revision: number;
  state: 'draft' | 'current';
  effectiveOn: string | null;
  recordedAt: string;
};
export type StudyPlanSnapshot = StudyPlanRevision & { content: StudyPlanContent };

export class StudyPlanContractError extends Error {
  constructor() { super('invalid_study_plan'); this.name = 'StudyPlanContractError'; }
}
export function invalidStudyPlan(): never { throw new StudyPlanContractError(); }
export function studyPlanFields(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) invalidStudyPlan();
  if (required.some(key => !Object.hasOwn(value, key)) || Object.getOwnPropertyNames(value).some(key => !required.includes(key) && !optional.includes(key))) invalidStudyPlan();
  return value as Record<string, unknown>;
}
export function studyPlanList<T>(value: unknown, parse: (item: unknown) => T, max = 150): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) invalidStudyPlan();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) invalidStudyPlan();
  return value.map(parse);
}
export function studyPlanUnique<T>(values: T[], key: (value: T) => string): T[] {
  if (new Set(values.map(key)).size !== values.length) invalidStudyPlan();
  return values;
}
export function studyPlanUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) invalidStudyPlan();
  return value.toLowerCase();
}
export function studyPlanInt(value: unknown, min = 1, max = 2147483646): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalidStudyPlan();
  return value;
}
export function studyPlanEnum<const T extends readonly string[]>(value: unknown, items: T): T[number] {
  if (typeof value !== 'string' || !items.includes(value)) invalidStudyPlan();
  return value;
}
export function studyPlanLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\p{Cc}\p{Cf}]/u.test(value)) invalidStudyPlan();
  return value;
}
export function studyPlanCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,95}$/u.test(value)) invalidStudyPlan();
  return value;
}
export function studyPlanDate(value: unknown): string {
  try {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-/u.test(value)) invalidStudyPlan();
    return catalogDate(value);
  } catch { return invalidStudyPlan(); }
}
export function studyPlanNullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null ? null : parse(value);
}
function ordered(start: string, end: string | null): void {
  if (end !== null && start > end) invalidStudyPlan();
}
function ids(value: unknown): string[] {
  return studyPlanUnique(studyPlanList(value, studyPlanUuid), id => id);
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidStudyPlan();
  return value;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) invalidStudyPlan();
  studyPlanDate(value.slice(0, 10));
  return value;
}
function catalogId(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) invalidStudyPlan();
  return value;
}

export function parsePlannedStudyDate(value: unknown): PlannedStudyDate {
  if (value === null) return null;
  const r = studyPlanFields(value, ['kind'], ['date', 'schoolYear', 'term']);
  if (r.kind === 'day') {
    studyPlanFields(value, ['kind', 'date']);
    return { kind: 'day', date: studyPlanDate(r.date) };
  }
  if (r.kind === 'term') {
    studyPlanFields(value, ['kind', 'schoolYear', 'term']);
    return { kind: 'term', schoolYear: studyPlanInt(r.schoolYear, 1900, 9998), term: studyPlanEnum(r.term, ['HT', 'VT']) };
  }
  return invalidStudyPlan();
}

/** The app's July–June school year bounds comparisons. Within the year, local term dates are needed for a day/term comparison. */
export function validPlannedStudyPeriod(start: PlannedStudyDate, end: PlannedStudyDate): boolean {
  if (!start || !end) return true;
  if (start.kind === 'day' && end.kind === 'day') return start.date <= end.date;
  if (start.kind === 'term' && end.kind === 'term') {
    return start.schoolYear < end.schoolYear || (start.schoolYear === end.schoolYear && (start.term === 'HT' || end.term === 'VT'));
  }
  if (start.kind === 'term' && end.kind === 'day') return end.date >= `${start.schoolYear}-07-01`;
  if (start.kind === 'day' && end.kind === 'term') return start.date <= `${end.schoolYear + 1}-06-30`;
  return false;
}

export function parseStudyPlanLevelRef(value: unknown): StudyPlanLevelRef {
  const r = studyPlanFields(value, ['subjectCode', 'subjectVersion', 'itemCode', 'languageCode']);
  return {
    subjectCode: studyPlanCode(r.subjectCode), subjectVersion: studyPlanInt(r.subjectVersion),
    itemCode: studyPlanCode(r.itemCode), languageCode: studyPlanNullable(r.languageCode, language),
  };
}
function language(value: unknown): string {
  if (typeof value !== 'string' || !PROGRAMPLAN_LANGUAGES.some(item => item.code === value)) invalidStudyPlan();
  return value;
}
export function studyPlanLevelKey(level: {
  kind?: StudyPlanLevel['kind']; subjectCode: string | null; subjectVersion: number | null; itemCode: string; languageCode: string | null;
}): string {
  return JSON.stringify([level.kind ?? 'gy25_level', level.subjectCode, level.subjectVersion, level.itemCode, level.languageCode]);
}
export function parseStudyFactSource(value: unknown): StudyFactSource {
  const r = studyPlanFields(value, ['kind', 'id']);
  return { kind: studyPlanEnum(r.kind, ['school_record', 'previous_school']), id: studyPlanUuid(r.id) };
}
function parseFact(value: unknown): StudyFact {
  const r = studyPlanFields(value, ['on', 'source']);
  return { on: studyPlanDate(r.on), source: parseStudyFactSource(r.source) };
}
function parseEnd(value: unknown): StudyEnd {
  const r = studyPlanFields(value, ['kind', 'on', 'source']);
  return { kind: studyPlanEnum(r.kind, ['completed', 'interrupted']), ...parseFact({ on: r.on, source: r.source }) };
}
function parseStudyAttempt(value: unknown): StudyPlanAttempt {
  const r = studyPlanFields(value, ['id', 'plannedStart', 'plannedEnd', 'actual']);
  const plannedStart = parsePlannedStudyDate(r.plannedStart), plannedEnd = parsePlannedStudyDate(r.plannedEnd);
  if (!validPlannedStudyPeriod(plannedStart, plannedEnd)) invalidStudyPlan();
  const actual = studyPlanFields(r.actual, ['certainty', 'start', 'end']);
  const certainty = studyPlanEnum(actual.certainty, ['recorded', 'unknown']);
  const start = studyPlanNullable(actual.start, parseFact), end = studyPlanNullable(actual.end, parseEnd);
  if ((start && end && end.on < start.on) || (!start && end && certainty === 'recorded')) invalidStudyPlan();
  return { id: studyPlanUuid(r.id), plannedStart, plannedEnd, actual: { certainty, start, end } };
}
export function parseStudyPlanLevel(value: unknown): StudyPlanLevel {
  const r = studyPlanFields(value, ['id', 'kind', 'subjectCode', 'subjectVersion', 'itemCode', 'languageCode', 'label', 'points', 'attempts']);
  const kind = studyPlanEnum(r.kind, STUDY_PLAN_LEVEL_KINDS);
  const subjectCode = studyPlanNullable(r.subjectCode, studyPlanCode), subjectVersion = studyPlanNullable(r.subjectVersion, studyPlanInt);
  if (kind === 'gy25_level' && (subjectCode === null || subjectVersion === null)) invalidStudyPlan();
  const attempts = studyPlanUnique(studyPlanList(r.attempts, parseStudyAttempt, 20), item => item.id);
  if (attempts.length === 0) invalidStudyPlan();
  return {
    id: studyPlanUuid(r.id), kind, subjectCode, subjectVersion, itemCode: studyPlanCode(r.itemCode),
    languageCode: studyPlanNullable(r.languageCode, language), label: studyPlanLabel(r.label),
    points: studyPlanInt(r.points, 1, 10000), attempts,
  };
}
export function parseStudyPlanDecision(value: unknown): StudyPlanDecision {
  const r = studyPlanFields(value, ['id', 'kind', 'reference', 'decidedOn', 'effectiveOn', 'endsOn', 'scopePoints', 'levelIds', 'replacementLevelIds']);
  const kind = studyPlanEnum(r.kind, STUDY_PLAN_DECISION_KINDS);
  const reference = studyPlanFields(r.reference, ['kind', 'id']);
  const referenceKind = studyPlanEnum(reference.kind, ['action_programme_decision', 'school_decision']);
  if ((kind === 'reduced') !== (referenceKind === 'action_programme_decision')) invalidStudyPlan();
  const decidedOn = studyPlanDate(r.decidedOn), effectiveOn = studyPlanDate(r.effectiveOn), endsOn = studyPlanNullable(r.endsOn, studyPlanDate);
  const scopePoints = studyPlanNullable(r.scopePoints, item => studyPlanInt(item, 1, 10000));
  const levelIds = ids(r.levelIds), replacementLevelIds = ids(r.replacementLevelIds);
  ordered(decidedOn, effectiveOn);
  ordered(effectiveOn, endsOn);
  if (kind === 'reduced' ? scopePoints === null : levelIds.length === 0 || scopePoints !== null) invalidStudyPlan();
  if (kind === 'replaced' ? replacementLevelIds.length === 0 : kind !== 'adapted' && replacementLevelIds.length > 0) invalidStudyPlan();
  if (replacementLevelIds.some(id => levelIds.includes(id))) invalidStudyPlan();
  return { id: studyPlanUuid(r.id), kind, reference: { kind: referenceKind, id: studyPlanUuid(reference.id) },
    decidedOn, effectiveOn, endsOn, scopePoints, levelIds, replacementLevelIds };
}
function parseChoice(value: unknown): StudyPlanChoice {
  const r = studyPlanFields(value, ['id', 'kind', 'label', 'state', 'levelIds']);
  const state = studyPlanEnum(r.state, ['unresolved', 'confirmed', 'not_applicable']);
  const levelIds = ids(r.levelIds);
  if (state === 'not_applicable' && levelIds.length > 0) invalidStudyPlan();
  return { id: studyPlanCode(r.id), kind: studyPlanEnum(r.kind, STUDY_PLAN_CHOICE_KINDS), label: studyPlanLabel(r.label), state, levelIds };
}
export function parseStudyPlanSource(value: unknown): StudyPlanSource {
  const r = studyPlanFields(value, ['offeringId', 'placementStartsOn', 'placementEndsOn', 'catalogId', 'programVersion', 'choices']);
  const placementStartsOn = studyPlanDate(r.placementStartsOn), placementEndsOn = studyPlanNullable(r.placementEndsOn, studyPlanDate);
  ordered(placementStartsOn, placementEndsOn);
  const choices = studyPlanUnique(studyPlanList(r.choices, value => {
    const item = studyPlanFields(value, ['id', 'revision']);
    return { id: studyPlanUuid(item.id), revision: studyPlanInt(item.revision) };
  }), item => item.id);
  return {
    offeringId: studyPlanUuid(r.offeringId), placementStartsOn, placementEndsOn,
    catalogId: studyPlanNullable(r.catalogId, catalogId), programVersion: studyPlanNullable(r.programVersion, studyPlanInt), choices,
  };
}
function parsePath(value: unknown): StudyPlanPath {
  const r = studyPlanFields(value, ['regime', 'programCode', 'orientationCode', 'apprenticeship', 'specialVariantCode']);
  return { regime: studyPlanEnum(r.regime, STUDY_PLAN_REGIMES), programCode: studyPlanCode(r.programCode),
    orientationCode: studyPlanNullable(r.orientationCode, studyPlanCode), apprenticeship: studyPlanNullable(r.apprenticeship, boolean),
    specialVariantCode: studyPlanNullable(r.specialVariantCode, studyPlanCode) };
}
export function parseStudyPlanCompulsorySubjects(value: unknown): StudyPlanContent['compulsorySchoolSubjects'] {
  return studyPlanNullable(value, items => studyPlanUnique(studyPlanList(items, value => {
    const r = studyPlanFields(value, ['code', 'label']);
    return { code: studyPlanCode(r.code), label: studyPlanLabel(r.label) };
  }, 50), item => item.code));
}
export function parseStudyPlanDistanceTeaching(value: unknown): StudyPlanDistanceTeaching {
  const r = studyPlanFields(value, ['kind', 'minutes']);
  const kind = studyPlanEnum(r.kind, ['unknown', 'none', 'applies']);
  const minutes = studyPlanNullable(r.minutes, minutes => studyPlanInt(minutes, 1, 1000000));
  if (kind !== 'applies' && minutes !== null) invalidStudyPlan();
  return { kind, minutes };
}
export function parseStudyPlanIssue(value: unknown): StudyPlanIssue {
  const r = studyPlanFields(value, ['code', 'field']);
  return { code: studyPlanCode(r.code), field: studyPlanCode(r.field) };
}
export function parseStudyPlanContent(value: unknown): StudyPlanContent {
  const r = studyPlanFields(value, ['path', 'source', 'levels', 'choices', 'decisions', 'compulsorySchoolSubjects', 'distanceTeaching', 'dialogue', 'sourceIssues']);
  const levels = studyPlanUnique(studyPlanList(r.levels, parseStudyPlanLevel), row => row.id);
  studyPlanUnique(levels, studyPlanLevelKey);
  studyPlanUnique(levels.flatMap(level => level.attempts), attempt => attempt.id);
  const choices = studyPlanUnique(studyPlanList(r.choices, parseChoice), row => row.id);
  const decisions = studyPlanUnique(studyPlanList(r.decisions, parseStudyPlanDecision), row => row.id);
  const levelIds = new Set(levels.map(row => row.id));
  if (choices.some(choice => choice.levelIds.some(id => !levelIds.has(id)))
    || decisions.some(decision => [...decision.levelIds, ...decision.replacementLevelIds].some(id => !levelIds.has(id)))) invalidStudyPlan();
  const dialogue = studyPlanNullable(r.dialogue, value => {
    const entry = studyPlanFields(value, ['on', 'reviewedRevision']);
    return { on: studyPlanDate(entry.on), reviewedRevision: studyPlanInt(entry.reviewedRevision) };
  });
  return { path: parsePath(r.path), source: parseStudyPlanSource(r.source), levels, choices, decisions,
    compulsorySchoolSubjects: parseStudyPlanCompulsorySubjects(r.compulsorySchoolSubjects),
    distanceTeaching: parseStudyPlanDistanceTeaching(r.distanceTeaching), dialogue, sourceIssues: studyPlanList(r.sourceIssues, parseStudyPlanIssue) };
}
export function parseStudyPlanRevision(value: unknown): StudyPlanRevision {
  const r = studyPlanFields(value, ['planId', 'revision', 'state', 'effectiveOn', 'recordedAt']);
  const state = studyPlanEnum(r.state, ['draft', 'current']), effectiveOn = studyPlanNullable(r.effectiveOn, studyPlanDate);
  if ((state === 'current') !== (effectiveOn !== null)) invalidStudyPlan();
  return { planId: studyPlanUuid(r.planId), revision: studyPlanInt(r.revision), state, effectiveOn, recordedAt: instant(r.recordedAt) };
}
export function parseStudyPlanSnapshot(value: unknown): StudyPlanSnapshot {
  const { content, ...rest } = studyPlanFields(value, ['planId', 'revision', 'state', 'effectiveOn', 'recordedAt', 'content']);
  const revision = parseStudyPlanRevision(rest), parsed = parseStudyPlanContent(content);
  if (parsed.dialogue && parsed.dialogue.reviewedRevision >= revision.revision) invalidStudyPlan();
  if (revision.effectiveOn && (revision.effectiveOn < parsed.source.placementStartsOn ||
    parsed.source.placementEndsOn && revision.effectiveOn > parsed.source.placementEndsOn)) invalidStudyPlan();
  return { ...revision, content: parsed };
}

export function studyPlanContentIssues(content: StudyPlanContent): StudyPlanIssue[] {
  const issues = [...content.sourceIssues];
  if (content.path.regime !== 'national_gy25') issues.push({ code: 'unsupported_path', field: 'path' });
  if (content.source.catalogId === null || content.source.programVersion === null) issues.push({ code: 'catalog_missing', field: 'path' });
  if (content.path.apprenticeship === null) issues.push({ code: 'apprenticeship_unknown', field: 'path' });
  if (!content.levels.some(row => row.kind === 'gy25_level') || !content.levels.some(row => row.kind === 'diploma_work')
    || content.levels.some(row => row.kind === 'gy11_course')) issues.push({ code: 'levels_incomplete', field: 'levels' });
  if (content.compulsorySchoolSubjects === null) issues.push({ code: 'compulsory_school_subjects_unknown', field: 'compulsorySchoolSubjects' });
  if (content.distanceTeaching.kind === 'unknown' || content.distanceTeaching.kind === 'applies' && content.distanceTeaching.minutes === null) {
    issues.push({ code: 'distance_teaching_incomplete', field: 'distanceTeaching' });
  }
  for (const choice of content.choices) {
    if (choice.state === 'unresolved') issues.push({ code: 'choice_unresolved', field: choice.id });
  }
  return issues;
}

export function studyDecisionEffective(decision: StudyPlanDecision, on: string): boolean {
  return decision.effectiveOn <= on && (decision.endsOn === null || on <= decision.endsOn);
}
export function studyAttemptStatus(attempt: StudyPlanAttempt, on: string, decisions: readonly StudyPlanDecision[], levelId: string): {
  progress: 'unknown' | 'upcoming' | 'started' | 'completed' | 'interrupted';
  reduced: boolean;
  needsFollowUp: boolean;
} {
  const { actual, plannedEnd } = attempt;
  let progress: ReturnType<typeof studyAttemptStatus>['progress'] = actual.certainty === 'unknown' ? 'unknown' : 'upcoming';
  if (actual.start && actual.start.on <= on) progress = 'started';
  if (actual.end && actual.end.on <= on) progress = actual.end.kind;
  const reduced = decisions.some(decision => decision.kind === 'reduced' && decision.levelIds.includes(levelId) && studyDecisionEffective(decision, on));
  return { progress, reduced, needsFollowUp: !reduced && progress !== 'completed' && progress !== 'interrupted' && plannedEnd?.kind === 'day' && plannedEnd.date < on };
}

/** A same-day correction wins by revision, and later effective dates remain independent. */
export function studyPlanAt<T extends StudyPlanRevision>(revisions: readonly T[], on: string): T | null {
  let selected: T | null = null;
  for (const revision of revisions) {
    const effective = revision.effectiveOn;
    if (revision.state !== 'current' || effective === null || effective > on) continue;
    if (!selected || effective > selected.effectiveOn! || (effective === selected.effectiveOn && revision.revision > selected.revision)) selected = revision;
  }
  return selected;
}
