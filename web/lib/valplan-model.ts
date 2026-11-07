import { ProgramplanContractError, type ProgramplanCatalog } from './programplan-catalog.ts';
import { PROGRAMPLAN_LANGUAGES } from './programplan-languages.ts';
import { programplanValpaketSubjectAllowed } from './programplan-packages.ts';

/** A school's offering of elective courses for one school year, shared by the timplan rows it fills.
 * Local planning information; groups and memberships are mapped to SS 12000 in study-group-model.ts. */
export const VALPLAN_KINDS = ['modernLanguage', 'languageSubject', 'naturalScience', 'individualChoice', 'specialization'] as const;
export type ValplanKind = typeof VALPLAN_KINDS[number];
export type ValplanCourse = {
  id: string; subjectCode: string; subjectVersion: number; itemCode: string; points: number; languageCode: string | null;
  name: string; minutesHt: number; minutesVt: number; classIds: string[] | null;
};
/** The block stores the classes unticked on the row, so a class linked later counts until someone unticks it. */
export type ValplanRowLink = { timplanId: string; timplanVersion: number; rowKey: string; year: 1 | 2 | 3; excludedClassIds: string[] };
/** A block on a row with the classes that belong to it right now. */
export type ValplanRowBlock = { valplanId: string; classIds: string[] };
export type Valplan = { id: string; unitId: string; schoolYear: number; kind: ValplanKind; name: string; revision: number; courses: ValplanCourse[]; rows: ValplanRowLink[] };
/** Server-resolved facts about a linked timplan row for the plan's school year. */
export type ValplanRowContext = Omit<ValplanRowLink, 'excludedClassIds'> & {
  rowKind: 'fixed' | 'alternative' | 'block' | 'diplomaWork'; points: number; minutesHt: number | null; minutesVt: number | null;
  classIds: string[]; allowedLevelKeys: string[] | null; blocks: ValplanRowBlock[]; blockKind?: ValplanKind;
};
export type ValplanDiagnostic = { code: string; severity: 'error' | 'notice'; courseId?: string; rowKey?: string; classId?: string };
export type ValplanOffer = { row: ValplanRowContext; points: number; courseIds: string[] };
/** One line in Kontroll: done, still open (stops the opening) or worth knowing. */
export type ValplanCheckItem = { area: 'classes' | 'courses' | 'time' | 'points'; state: 'done' | 'open' | 'notice';
  code: 'classes_ok' | 'no_classes' | 'row_missing' | 'class_doubled' | 'class_in_several_rows' | 'classes_waiting' | 'courses_ok' | 'no_courses' | 'time_ok' | 'time_missing' | 'time_deviates' | 'points_ok' | 'points_waiting' | 'class_without_courses' | 'points_unreachable';
  classIds: string[]; courseIds: string[]; valplanIds: string[]; points?: number; closest?: number };
export type ValplanCheck = { ready: boolean; items: ValplanCheckItem[] };
export type ValplanChoiceResult = { errors: string[]; points: number; minutesHt: number; minutesVt: number; deviationHt: number | null; deviationVt: number | null };

const MODERN_LANGUAGE_SUBJECTS = new Set(['MODY', 'MODG', 'MODO', 'MODF']);
const LANGUAGE_CODES = new Set(PROGRAMPLAN_LANGUAGES.map(l => l.code));

/** Språkämne and naturvetenskapligt ämne follow programplanens package rule (4 kap. 1 a §), with modern languages as courses. */
export function valplanSubjectAllowed(kind: ValplanKind, subjectCode: string): boolean {
  if (kind === 'modernLanguage') return MODERN_LANGUAGE_SUBJECTS.has(subjectCode);
  if (kind === 'languageSubject') return MODERN_LANGUAGE_SUBJECTS.has(subjectCode) || programplanValpaketSubjectAllowed(kind, subjectCode);
  return kind === 'naturalScience' ? programplanValpaketSubjectAllowed(kind, subjectCode) : true;
}

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
    const l = shape(v, ['timplanId', 'timplanVersion', 'rowKey', 'year', 'excludedClassIds']);
    if (typeof l.rowKey !== 'string' || !/^[a-z]+:[A-Za-z0-9_:-]{1,120}$/u.test(l.rowKey)) bad();
    const excludedClassIds = array(l.excludedClassIds, 500).map(uuid);
    if (new Set(excludedClassIds).size !== excludedClassIds.length) bad();
    return { timplanId: uuid(l.timplanId), timplanVersion: integer(l.timplanVersion, 1, 100000), rowKey: l.rowKey, year: integer(l.year, 1, 3) as 1 | 2 | 3, excludedClassIds };
  });
  if (new Set(courses.map(c => c.id)).size !== courses.length || new Set(rows.map(valplanRowKey)).size !== rows.length) bad();
  return { id: uuid(r.id), unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 2000, 2100), kind: r.kind as ValplanKind,
    name: text(r.name, 200), revision: integer(r.revision, 1, 2147483646), courses, rows };
}

/** What a timplan row says about its valbart block, and so which single next step it offers. */
export type ValplanRowStage = 'notApproved' | 'noClasses' | 'missing' | 'partial' | 'doubled' | 'done';
export function valplanRowStage(row: { approved: boolean; classCount: number; blockCount: number; missingCount: number; doubledCount: number }): ValplanRowStage {
  if (!row.approved) return 'notApproved';
  if (!row.blockCount) return row.classCount ? 'missing' : 'noClasses';
  if (row.doubledCount) return 'doubled';
  return row.missingCount ? 'partial' : 'done';
}
/** The classes a link gives its block: the row's classes except the unticked ones. */
export function valplanLinkClasses(link: Pick<ValplanRowLink, 'excludedClassIds'>, row: Pick<ValplanRowContext, 'classIds'>): string[] {
  return row.classIds.filter(id => !link.excludedClassIds.includes(id));
}
/** Classes on the row without a block (F-05). They show on the row until they are placed. */
export function valplanRowMissing(row: Pick<ValplanRowContext, 'classIds' | 'blocks'>): string[] {
  return row.classIds.filter(id => !row.blocks.some(b => b.classIds.includes(id)));
}
/** A class linked later joins every block on a shared row that has not unticked it, until someone chooses. */
export function valplanRowDoubled(row: Pick<ValplanRowContext, 'classIds' | 'blocks'>): string[] {
  return row.classIds.filter(id => row.blocks.filter(b => b.classIds.includes(id)).length > 1);
}
/** A new link leaves out the classes other blocks already hold, so it only takes what is free. */
export function valplanRowLink(row: ValplanRowContext, planId: string): ValplanRowLink {
  const held = new Set(row.blocks.filter(b => b.valplanId !== planId).flatMap(b => b.classIds));
  return { timplanId: row.timplanId, timplanVersion: row.timplanVersion, rowKey: row.rowKey, year: row.year, excludedClassIds: row.classIds.filter(id => held.has(id)).sort() };
}
/** A block can take the row's free classes when none of them already choose in it through another row. */
export function valplanTakesRow(plan: Valplan, rows: readonly ValplanRowContext[], row: ValplanRowContext): boolean {
  const free = valplanRowMissing(row);
  if (plan.kind !== row.blockKind || !free.length && row.blocks.length) return false;
  return !plan.rows.some(link => {
    const context = rows.find(r => valplanRowKey(r) === valplanRowKey(link));
    return !!context && valplanLinkClasses(link, context).some(id => free.includes(id));
  });
}
/** Gives the block the row's free classes, on a row it already has or as a new link. */
export function valplanWithRow(plan: Valplan, row: ValplanRowContext): Valplan {
  const key = valplanRowKey(row), free = valplanRowMissing(row);
  if (!plan.rows.some(l => valplanRowKey(l) === key)) return { ...plan, rows: [...plan.rows, valplanRowLink(row, plan.id)] };
  return { ...plan, rows: plan.rows.map(l => valplanRowKey(l) === key ? { ...l, excludedClassIds: l.excludedClassIds.filter(id => !free.includes(id)) } : l) };
}
/** The name in the button: two classes by name, more as a number. */
export function valplanClassLabel(names: readonly string[]): string {
  return names.length > 2 ? `${names.length} klasser` : names.join(' och ');
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
    if (row.points < 1) out.push({ code: 'row_without_points', severity: 'error', rowKey: key });
    const classIds = valplanLinkClasses(link, row);
    if (row.classIds.length && !classIds.length) out.push({ code: 'row_without_classes', severity: 'error', rowKey: key });
    const held = new Set(row.blocks.filter(b => b.valplanId !== plan.id).flatMap(b => b.classIds));
    for (const classId of classIds) {
      if (held.has(classId)) out.push({ code: 'class_in_other_block', severity: 'error', rowKey: key, classId });
      if (classRow.has(classId) && classRow.get(classId) !== key) out.push({ code: 'class_in_several_rows', severity: 'error', rowKey: key, classId });
      classRow.set(classId, key);
    }
    linked.push({ ...row, classIds });
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
    if (!valplanSubjectAllowed(plan.kind, course.subjectCode)) out.push({ code: 'course_kind_mismatch', severity: 'error', ...at });
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

/** Suggested course time, pro rata from a linked row. Zero when the row has no time; the school adjusts it. */
export function valplanTimeShare(points: number, row: Pick<ValplanRowContext, 'points' | 'minutesHt' | 'minutesVt'> | undefined) {
  const share = (minutes: number | null | undefined) => row?.points && minutes != null ? Math.round(minutes * points / row.points) : 0;
  return { minutesHt: share(row?.minutesHt), minutesVt: share(row?.minutesVt) };
}

const rowCourses = (plan: Valplan, row: ValplanRowContext, classId: string) => plan.courses.filter(c => c.points <= row.points && (!c.classIds || c.classIds.includes(classId))
  && (!row.allowedLevelKeys || row.allowedLevelKeys.includes(valplanLevelKey(c))));
/** What a pupil in the class may choose: the linked row decides the points for this year. */
export function valplanOffer(plan: Valplan, rows: readonly ValplanRowContext[], classId: string): ValplanOffer | null {
  const row = rows.find(r => plan.rows.some(l => valplanRowKey(l) === valplanRowKey(r) && valplanLinkClasses(l, r).includes(classId)));
  return row ? { row, points: row.points, courseIds: rowCourses(plan, row, classId).map(c => c.id) } : null;
}

const nameList = (names: readonly string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : names[0];
/** Who may read a course in plain words, by naming the shorter group. */
export function valplanCourseReaders(classes: readonly { id: string; name: string }[], classIds: readonly string[] | null): string {
  if (!classes.length) return 'Inga klasser ännu';
  const may = classes.filter(c => !classIds || classIds.includes(c.id)).map(c => c.name), others = classes.filter(c => classIds && !classIds.includes(c.id)).map(c => c.name);
  if (!may.length) return 'Ingen klass';
  if (!others.length) return 'Alla klasser';
  return others.length <= may.length ? `Alla klasser utom ${nameList(others)}` : `Bara ${nameList(may)}`;
}
/** The highest sum at or under the target. Each course counts once, as in a pupil's choice. */
export function valplanClosestPoints(points: readonly number[], target: number): number {
  const reach = new Set([0]);
  // The new sums are collected first, so one course is not added on top of itself.
  for (const p of points) { const next = [...reach].map(sum => sum + p).filter(sum => sum <= target); for (const sum of next) reach.add(sum); }
  return Math.max(...reach);
}
/** Kontroll (G5). Open lines stop the opening, and valplan_round_problem refuses the same things in the database.
 * A class counts against the row it reads through this block, so an unticked class counts in its own block. */
export function valplanCheck(plan: Valplan, rows: readonly ValplanRowContext[]): ValplanCheck {
  const items: ValplanCheckItem[] = [];
  const add = (area: ValplanCheckItem['area'], code: ValplanCheckItem['code'], state: ValplanCheckItem['state'], extra: Partial<ValplanCheckItem> = {}) =>
    items.push({ area, code, state, classIds: [], courseIds: [], valplanIds: [], ...extra });
  const contexts = new Map(rows.map(r => [valplanRowKey(r), r]));
  const linked = plan.rows.flatMap(link => { const row = contexts.get(valplanRowKey(link)); return row ? [{ row, classIds: valplanLinkClasses(link, row) }] : []; });
  const all = [...new Set(linked.flatMap(l => l.classIds))];
  if (linked.length < plan.rows.length) add('classes', 'row_missing', 'open');
  if (!all.length) add('classes', 'no_classes', 'open');
  for (const { row, classIds } of linked) {
    const others = row.blocks.filter(b => b.valplanId !== plan.id && b.classIds.some(id => classIds.includes(id)));
    if (others.length) add('classes', 'class_doubled', 'open', { classIds: classIds.filter(id => others.some(b => b.classIds.includes(id))), valplanIds: others.map(b => b.valplanId) });
  }
  const several = all.filter(id => linked.filter(l => l.classIds.includes(id)).length > 1);
  if (several.length) add('classes', 'class_in_several_rows', 'open', { classIds: several });
  if (!items.length) add('classes', 'classes_ok', 'done', { classIds: all });
  const waiting = linked.flatMap(l => l.row.classIds.filter(id => !l.classIds.includes(id) && !l.row.blocks.some(b => b.valplanId !== plan.id && b.classIds.includes(id))));
  if (waiting.length) add('classes', 'classes_waiting', 'notice', { classIds: [...new Set(waiting)] });

  add('courses', plan.courses.length ? 'courses_ok' : 'no_courses', plan.courses.length ? 'done' : 'open', { courseIds: plan.courses.map(c => c.id) });

  const noTime = plan.courses.filter(c => c.minutesHt + c.minutesVt === 0).map(c => c.id);
  if (noTime.length) add('time', 'time_missing', 'open', { courseIds: noTime });
  else if (plan.courses.length) add('time', 'time_ok', 'done');
  const deviates = plan.courses.filter(c => linked.some(({ row, classIds }) => {
    const { minutesHt, minutesVt } = valplanTimeShare(c.points, row);
    return minutesHt + minutesVt > 0 && c.minutesHt + c.minutesVt > 0 && c.minutesHt + c.minutesVt !== minutesHt + minutesVt && classIds.some(id => rowCourses(plan, row, id).includes(c));
  })).map(c => c.id);
  if (deviates.length) add('time', 'time_deviates', 'notice', { courseIds: deviates });

  const missed = new Map<string, ValplanCheckItem>();
  for (const { row, classIds } of linked) for (const classId of classIds) {
    const offered = rowCourses(plan, row, classId), closest = valplanClosestPoints(offered.map(c => c.points), row.points);
    if (closest === row.points) continue;
    const code = offered.length ? 'points_unreachable' : 'class_without_courses', key = `${code}:${row.points}:${closest}`, seen = missed.get(key);
    if (seen) { if (!seen.classIds.includes(classId)) seen.classIds.push(classId); }
    else missed.set(key, { area: 'points', code, state: 'open', classIds: [classId], courseIds: [], valplanIds: [], points: row.points, closest });
  }
  items.push(...missed.values());
  if (!all.length) add('points', 'points_waiting', 'open');
  else if (!missed.size) add('points', 'points_ok', 'done', { classIds: all });
  return { ready: !items.some(i => i.state === 'open'), items };
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
