import { ProgramplanContractError, type ProgramplanCatalog } from './programplan-catalog.ts';
import { PROGRAMPLAN_LANGUAGES } from './programplan-languages.ts';

/** A school's offering of elective courses for one school year, shared by the timplan rows it fills.
 * Local planning information; groups and memberships are mapped to SS 12000 in study-group-model.ts. */
export const VALPLAN_KINDS = ['modernLanguage', 'individualChoice', 'specialization'] as const;
export type ValplanKind = typeof VALPLAN_KINDS[number];
export type ValplanCourse = {
  id: string; subjectCode: string; subjectVersion: number; itemCode: string; points: number; languageCode: string | null;
  name: string; minutesHt: number; minutesVt: number; classIds: string[] | null;
};
export type ValplanRowLink = { timplanId: string; timplanVersion: number; rowKey: string; year: 1 | 2 | 3 };
export type Valplan = { id: string; unitId: string; schoolYear: number; kind: ValplanKind; name: string; revision: number; courses: ValplanCourse[]; rows: ValplanRowLink[] };
/** Server-resolved facts about a linked timplan row for the plan's school year. */
export type ValplanRowContext = ValplanRowLink & {
  rowKind: 'fixed' | 'alternative' | 'block' | 'diplomaWork'; points: number; minutesHt: number | null; minutesVt: number | null;
  classIds: string[]; allowedLevelKeys: string[] | null; linkedValplanId: string | null; blockKind?: ValplanKind;
};
export type ValplanDiagnostic = { code: string; severity: 'error' | 'notice'; courseId?: string; rowKey?: string; classId?: string };
export type ValplanOffer = { row: ValplanRowContext; points: number; courseIds: string[] };
export type ValplanChoiceResult = { errors: string[]; points: number; minutesHt: number; minutesVt: number; deviationHt: number | null; deviationVt: number | null };

const MODERN_LANGUAGE_SUBJECTS = new Set(['MODY', 'MODG', 'MODO', 'MODF']);
const LANGUAGE_CODES = new Set(PROGRAMPLAN_LANGUAGES.map(l => l.code));

function bad(): never { throw new ProgramplanContractError('invalid_valplan'); }
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  const row = value as Record<string, unknown>;
  if (keys.some(k => !Object.hasOwn(row, k)) || Object.getOwnPropertyNames(row).some(k => !keys.includes(k))) bad();
  return row;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) bad();
  return value;
}
function code(value: unknown): string {
  if (typeof value !== 'string' || value.length > 96 || !/^\p{L}[\p{L}\p{N}_-]*$/u.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) bad();
  return value;
}
function uuids(value: unknown): string[] {
  const ids = array(value, 500).map(uuid);
  if (!ids.length || new Set(ids).size !== ids.length) bad();
  return ids;
}

export function valplanRowKey(row: Pick<ValplanRowLink, 'timplanId' | 'rowKey' | 'year'>): string { return `${row.timplanId}:${row.rowKey}:${row.year}`; }
export function valplanLevelKey(course: Pick<ValplanCourse, 'subjectCode' | 'subjectVersion' | 'itemCode'>): string { return `${course.subjectCode}:${course.subjectVersion}:${course.itemCode}`; }
const courseKey = (c: ValplanCourse) => `${valplanLevelKey(c)}:${c.languageCode ?? '-'}`;

export function parseValplan(value: unknown): Valplan {
  const r = shape(value, ['id', 'unitId', 'schoolYear', 'kind', 'name', 'revision', 'courses', 'rows']);
  if (typeof r.kind !== 'string' || !(VALPLAN_KINDS as readonly string[]).includes(r.kind)) bad();
  const courses = array(r.courses, 200).map(v => {
    const c = shape(v, ['id', 'subjectCode', 'subjectVersion', 'itemCode', 'points', 'languageCode', 'name', 'minutesHt', 'minutesVt', 'classIds']);
    if (c.languageCode !== null && (typeof c.languageCode !== 'string' || !LANGUAGE_CODES.has(c.languageCode))) bad();
    return { id: uuid(c.id), subjectCode: code(c.subjectCode), subjectVersion: integer(c.subjectVersion, 1, 100000), itemCode: code(c.itemCode),
      points: integer(c.points, 1, 10000), languageCode: c.languageCode as string | null, name: text(c.name, 200),
      minutesHt: integer(c.minutesHt, 0, 100000), minutesVt: integer(c.minutesVt, 0, 100000), classIds: c.classIds === null ? null : uuids(c.classIds) };
  });
  const rows = array(r.rows, 200).map(v => {
    const l = shape(v, ['timplanId', 'timplanVersion', 'rowKey', 'year']);
    if (typeof l.rowKey !== 'string' || !/^[a-z]+:[A-Za-z0-9_:-]{1,120}$/u.test(l.rowKey)) bad();
    return { timplanId: uuid(l.timplanId), timplanVersion: integer(l.timplanVersion, 1, 100000), rowKey: l.rowKey, year: integer(l.year, 1, 3) as 1 | 2 | 3 };
  });
  if (new Set(courses.map(c => c.id)).size !== courses.length || new Set(rows.map(valplanRowKey)).size !== rows.length) bad();
  return { id: uuid(r.id), unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 2000, 2100), kind: r.kind as ValplanKind,
    name: text(r.name, 200), revision: integer(r.revision, 1, 2147483646), courses, rows };
}

/** Blocking errors stop saving or opening the choice; notices are shown at the field. */
export function valplanDiagnostics(plan: Valplan, rows: readonly ValplanRowContext[], catalog: ProgramplanCatalog): ValplanDiagnostic[] {
  const out: ValplanDiagnostic[] = [];
  const startsOn = `${plan.schoolYear}-07-01`;
  const contexts = new Map(rows.map(r => [valplanRowKey(r), r]));
  const linked: ValplanRowContext[] = [];
  const classRow = new Map<string, string>();
  for (const link of plan.rows) {
    const key = valplanRowKey(link), row = contexts.get(key);
    if (!row) { out.push({ code: 'row_missing', severity: 'error', rowKey: key }); continue; }
    if (row.timplanVersion !== link.timplanVersion) out.push({ code: 'row_version_changed', severity: 'error', rowKey: key });
    if (row.rowKind !== 'block') out.push({ code: 'row_not_choice_block', severity: 'error', rowKey: key });
    if (row.blockKind !== undefined && row.blockKind !== plan.kind) out.push({ code: 'row_kind_mismatch', severity: 'error', rowKey: key });
    if (row.linkedValplanId !== null && row.linkedValplanId !== plan.id) out.push({ code: 'row_linked_elsewhere', severity: 'error', rowKey: key });
    if (row.points < 1) out.push({ code: 'row_without_points', severity: 'error', rowKey: key });
    for (const classId of row.classIds) {
      if (classRow.has(classId) && classRow.get(classId) !== key) out.push({ code: 'class_in_several_rows', severity: 'error', rowKey: key, classId });
      classRow.set(classId, key);
    }
    linked.push(row);
  }
  const seen = new Set<string>();
  for (const course of plan.courses) {
    const at = { courseId: course.id };
    if (seen.has(courseKey(course))) out.push({ code: 'duplicate_course', severity: 'error', ...at });
    seen.add(courseKey(course));
    const subject = catalog.subjects.find(s => s.code === course.subjectCode && s.version === course.subjectVersion && s.schoolTypes.includes('GY') && s.typeOfSyllabus === 'GRADE_SUBJECT_SYLLABUS');
    const item = subject?.items.find(i => i.code === course.itemCode);
    if (!subject || !item || item.points !== course.points) out.push({ code: 'course_not_in_catalog', severity: 'error', ...at });
    else if (!subject.startDate || startsOn < subject.startDate || subject.endDate && startsOn > subject.endDate || subject.canceledDate && startsOn >= subject.canceledDate)
      out.push({ code: 'course_not_valid', severity: 'error', ...at });
    const language = MODERN_LANGUAGE_SUBJECTS.has(course.subjectCode);
    if (language && course.languageCode === null) out.push({ code: 'language_required', severity: 'error', ...at });
    if (!language && course.languageCode !== null) out.push({ code: 'language_not_applicable', severity: 'error', ...at });
    if (plan.kind === 'modernLanguage' && !language) out.push({ code: 'course_kind_mismatch', severity: 'error', ...at });
    if (course.minutesHt + course.minutesVt === 0) out.push({ code: 'course_time_missing', severity: 'error', ...at });
    if (course.classIds?.some(id => !classRow.has(id))) out.push({ code: 'course_class_not_linked', severity: 'error', ...at });
    let fits = false;
    for (const row of linked) {
      if (course.points > row.points || course.classIds && !course.classIds.some(id => row.classIds.includes(id))) continue;
      if (row.allowedLevelKeys && !row.allowedLevelKeys.includes(valplanLevelKey(course))) { out.push({ code: 'course_not_allowed_in_row', severity: 'notice', ...at, rowKey: valplanRowKey(row) }); continue; }
      fits = true;
    }
    if (linked.length && !fits) out.push({ code: 'course_fits_no_row', severity: 'error', ...at });
  }
  return out;
}

/** What a pupil in the class may choose: the linked row decides the points for this year. */
export function valplanOffer(plan: Valplan, rows: readonly ValplanRowContext[], classId: string): ValplanOffer | null {
  const keys = new Set(plan.rows.map(valplanRowKey));
  const row = rows.find(r => keys.has(valplanRowKey(r)) && r.classIds.includes(classId));
  if (!row) return null;
  const courseIds = plan.courses.filter(c => c.points <= row.points && (!c.classIds || c.classIds.includes(classId))
    && (!row.allowedLevelKeys || row.allowedLevelKeys.includes(valplanLevelKey(c)))).map(c => c.id);
  return { row, points: row.points, courseIds };
}

export function validateValplanChoice(plan: Valplan, offer: ValplanOffer, courseIds: readonly string[]): ValplanChoiceResult {
  const errors = new Set<string>();
  if (new Set(courseIds).size !== courseIds.length) errors.add('duplicate_course');
  const chosen = [...new Set(courseIds)].map(id => plan.courses.find(c => c.id === id));
  if (chosen.some((c, i) => !c || !offer.courseIds.includes([...new Set(courseIds)][i]))) errors.add('course_not_offered');
  const valid = chosen.filter((c): c is ValplanCourse => !!c);
  const points = valid.reduce((n, c) => n + c.points, 0), minutesHt = valid.reduce((n, c) => n + c.minutesHt, 0), minutesVt = valid.reduce((n, c) => n + c.minutesVt, 0);
  if (!errors.size && points !== offer.points) errors.add('choice_points_mismatch');
  return { errors: [...errors], points, minutesHt, minutesVt,
    deviationHt: offer.row.minutesHt === null ? null : minutesHt - offer.row.minutesHt, deviationVt: offer.row.minutesVt === null ? null : minutesVt - offer.row.minutesVt };
}
