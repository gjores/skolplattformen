import { currentSchoolYear, isValidDate } from './pupil-register-model.ts';
import { gymRowKey } from './gym-timplan.ts';
import { nationalTimplan } from './timplan-model.ts';
import { PLANNING_YEAR_LIMITS, planningYearRange, projectGrYear, projectGymYear } from './planning-year-model.ts';
import type { GrColumnMap, PlanningDiagnosis, PlanningRelation, StartEvidence } from './planning-year-model.ts';
import type { TimplanKind, TimplanStatus } from './protected-timplan.ts';

export type PlanningSetup = {
  customerId: string; serverDate: string; currentYear: number; minimumYear: 2000; maximumYear: 2100;
  units: { unitId: string; schoolName: string; canRead: Record<'programplan' | TimplanKind, boolean> }[];
};
export type PlanningSelection = {
  schoolYear: number; unitId: string | null; view: 'programplan' | 'timplan'; schoolform: TimplanKind;
  query: string; status: TimplanStatus | 'all'; cohortRelation: PlanningRelation | 'relevant' | 'all'; archive: 'active' | 'archived' | 'all';
  grade: number | null; sort: 'name' | 'school' | 'cohort' | 'version' | 'status' | 'grade' | 'points' | 'hours';
  direction: 'asc' | 'desc'; page: number; selectionRevision: string | null;
};
export type PlanningPlanReference = { id: string; version: number; revision: number; status: TimplanStatus };
export type PlanningSourceReference = { planId: string; offeringId: string; version: number; revision: number };
export type PlanningClassReference = { id: string; customerId: string; unitId: string; offeringId: string };
export type PlanningCell = { rowKey: string; points: number | null; pointTerms: number[] | null; hourValues: (number | null)[] | null };
/** Search/presentation details from the row's own education and verified pinned catalogue. */
export type PlanningSearchDetails = {
  localCode: string | null; programCode: string | null; orientationCode: string | null;
  programName: string | null; orientationName: string | null;
};
export type PlanningRow = {
  customerId: string; unitId: string; offeringId: string; schoolName: string; educationName: string; cohort: string;
  schoolform: TimplanKind; plan: PlanningPlanReference | null; source: PlanningSourceReference | null;
  start: StartEvidence & { legacyYear: number | null }; relativeYear: 1 | 2 | 3 | null; relation: PlanningRelation;
  underlag: 'class-bound' | 'planning' | 'forecast' | 'missing'; archived: boolean; columnMap: GrColumnMap | null;
  application: { schoolYear: number; planId: string; version: number; columnId: string | null } | null;
  classes: PlanningClassReference[]; cells: PlanningCell[]; diagnostics: PlanningDiagnosis[];
  searchDetails?: PlanningSearchDetails;
};
/** known is a partial sum; value is null unless the entire requested frame is known. */
export type PlanningMeasure = { value: number | null; known: number; complete: boolean };
// IM's weekly quantity includes the planned frame (including praktik/mentor),
// not a proof of teaching time, a statutory minimum, or staff workload.
export type PlanningAnnualMetrics = { points: PlanningMeasure | null; hours: PlanningMeasure; measure: 'hours-per-year' | 'hours-per-week'; classCount: PlanningMeasure };
/** Frame hours are not staff hours; no calendar or pupil/staff inference is performed. */
export type PlanningOverviewTotals = { points: PlanningMeasure | null; annualHours: PlanningMeasure; weeklyHours: PlanningMeasure; classCount: PlanningMeasure; hasForecast: boolean };
export type PlanningList = { selection: PlanningSelection; selectionRevision: string; count: number; pageSize: 50; rows: PlanningRow[] };
export type PlanningOverview = { selection: PlanningSelection; selectionRevision: string; count: number; rows: PlanningRow[]; totals: PlanningOverviewTotals };

const schoolforms = ['gymnasium', 'grundskola', 'introduktionsprogram'] as const;
const statuses = ['utkast', 'forslag', 'atersand', 'faststalld', 'ersatt'] as const;
const relations = ['new', 'continuing', 'future', 'finished', 'unknown'] as const;
const diagnoses: PlanningDiagnosis[] = ['missing-start', 'invalid-start', 'unverified-start', 'conflicting-start', 'outside-three-years',
  'allocation-before-start', 'missing-binding', 'binding-year-mismatch', 'unverified-column-map', 'missing-column', 'missing-hours',
  'missing-points', 'missing-plan', 'missing-source', 'missing-class', 'ambiguous-class', 'unknown-row', 'inactive-hours', 'forecast'];
function bad(): never { throw new TypeError('Planeringens läsunderlag kunde inte kontrolleras.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const r = object(value);
  if (Object.getOwnPropertyNames(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function integer(value: unknown, minimum = 0, maximum = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) bad();
  return value;
}
function text(value: unknown, maximum = 1000): string {
  if (typeof value !== 'string' || value.length > maximum) bad();
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 32 || value.charCodeAt(i) === 127) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') bad(); return value; }
function choice<T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== 'string' || !values.includes(value as T)) bad(); return value as T; }
function year(value: unknown): number { const result = integer(value, 2000, 2100); planningYearRange(result); return result; }
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function unique<T>(values: T[], key: (v: T) => string): T[] { if (new Set(values.map(key)).size !== values.length) bad(); return values; }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function measure(known: number, complete: boolean): PlanningMeasure { return { value: complete ? known : null, known, complete }; }

export function parsePlanningSetup(value: unknown): PlanningSetup {
  const r = shape(value, ['customerId', 'serverDate', 'currentYear', 'minimumYear', 'maximumYear', 'units']);
  if (!isValidDate(r.serverDate) || r.minimumYear !== PLANNING_YEAR_LIMITS.minimum || r.maximumYear !== PLANNING_YEAR_LIMITS.maximum
    || r.currentYear !== currentSchoolYear(r.serverDate)) bad();
  const units = unique(array(r.units, 1000).map(value => {
    const u = shape(value, ['unitId', 'schoolName', 'canRead']), c = shape(u.canRead, ['programplan', ...schoolforms]);
    const canRead = { programplan: boolean(c.programplan), gymnasium: boolean(c.gymnasium), grundskola: boolean(c.grundskola), introduktionsprogram: boolean(c.introduktionsprogram) };
    if (!Object.values(canRead).some(Boolean)) bad();
    return { unitId: uuid(u.unitId), schoolName: text(u.schoolName), canRead };
  }), u => u.unitId);
  return { customerId: uuid(r.customerId), serverDate: r.serverDate, currentYear: year(r.currentYear), minimumYear: 2000, maximumYear: 2100, units };
}
const selectionKeys = ['schoolYear', 'unitId', 'view', 'schoolform', 'query', 'status', 'cohortRelation', 'archive', 'grade', 'sort', 'direction', 'page', 'selectionRevision'] as const;
export function parsePlanningSelection(value: unknown, setup?: PlanningSetup): PlanningSelection {
  const r = shape(value, selectionKeys), view = choice(r.view, ['programplan', 'timplan']), schoolform = choice(r.schoolform, schoolforms);
  const status = choice(r.status, ['all', ...statuses]), grade = r.grade === null ? null : integer(r.grade, 1, 9), query = text(r.query, 200);
  const sort = choice(r.sort, ['name', 'school', 'cohort', 'version', 'status', 'grade', 'points', 'hours']);
  if (query !== query.trim() || (view === 'programplan' && (schoolform !== 'gymnasium' || ['forslag', 'atersand'].includes(status) || sort === 'hours'))
    || (schoolform === 'gymnasium' && grade !== null && grade > 3) || (schoolform === 'introduktionsprogram' && grade !== null)
    || (schoolform !== 'gymnasium' && sort === 'points')) bad();
  const selectionRevision = r.selectionRevision === null ? null : fingerprint(r.selectionRevision), page = integer(r.page, 1, 100000);
  if (page > 1 && selectionRevision === null) bad();
  const result: PlanningSelection = { schoolYear: year(r.schoolYear), unitId: r.unitId === null ? null : uuid(r.unitId), view, schoolform, query, status,
    cohortRelation: choice(r.cohortRelation, ['all', 'relevant', ...relations]), archive: choice(r.archive, ['active', 'archived', 'all']), grade, sort,
    direction: choice(r.direction, ['asc', 'desc']), page, selectionRevision };
  // This checks a supplied server scope. It does not establish a mandate by itself.
  if (setup) {
    const scope = parsePlanningSetup(setup), readable = scope.units.filter(u => view === 'programplan' ? u.canRead.programplan : u.canRead[schoolform]);
    if (result.unitId !== null && !readable.some(u => u.unitId === result.unitId)) bad();
  }
  return result;
}
function parsePlan(value: unknown): PlanningPlanReference | null {
  if (value === null) return null;
  const r = shape(value, ['id', 'version', 'revision', 'status']);
  return { id: uuid(r.id), version: integer(r.version, 1), revision: integer(r.revision), status: choice(r.status, statuses) };
}
function parseSource(value: unknown): PlanningSourceReference | null {
  if (value === null) return null;
  const r = shape(value, ['planId', 'offeringId', 'version', 'revision']);
  return { planId: uuid(r.planId), offeringId: uuid(r.offeringId), version: integer(r.version, 1), revision: integer(r.revision) };
}
function parseStart(value: unknown): PlanningRow['start'] {
  const r = shape(value, ['provenance', 'startedOn', 'academicYear', 'legacyYear']);
  if (r.startedOn !== null && !isValidDate(r.startedOn)) bad();
  return { provenance: choice(r.provenance, ['program-version', 'timplan-source', 'verified-academic-year', 'legacy']), startedOn: r.startedOn,
    academicYear: r.academicYear === null ? null : integer(r.academicYear, 1, 9996), legacyYear: r.legacyYear === null ? null : integer(r.legacyYear, 1, 9998) };
}
function parseColumnMap(value: unknown, plan: PlanningPlanReference | null): GrColumnMap {
  const r = object(value);
  if (r.kind === 'unknown') { shape(r, ['kind']); return { kind: 'unknown' }; }
  shape(r, ['kind', 'planId', 'version', 'provenance', 'columnIds']);
  if (r.kind !== 'verified' || !plan || uuid(r.planId) !== plan.id || integer(r.version, 1) !== plan.version) bad();
  const columnIds = unique(array(r.columnIds, 9).map(v => { const id = text(v, 3); if (!/^ak[1-9]$/u.test(id)) bad(); return id; }), v => v);
  if (!columnIds.length) bad();
  return { kind: 'verified', planId: plan.id, version: plan.version, provenance: choice(r.provenance, ['frozen-plan', 'verified-original']), columnIds };
}
function parseCell(value: unknown, schoolform: TimplanKind, map: GrColumnMap | null): PlanningCell {
  const r = shape(value, ['rowKey', 'points', 'pointTerms', 'hourValues']);
  const rowKey = text(r.rowKey, 320);
  const pointTerms = r.pointTerms === null ? null : array(r.pointTerms, 6).map(v => integer(v, 0, 10000));
  const points = r.points === null ? null : integer(r.points, 0, 10000);
  const hourValues = r.hourValues === null ? null : array(r.hourValues, schoolform === 'gymnasium' ? 6 : schoolform === 'grundskola' ? 9 : 1)
    .map(v => v === null ? null : integer(v, 0, 2000));
  if (schoolform === 'gymnasium') {
    try { gymRowKey(rowKey); } catch { bad(); }
    if (points === null || (pointTerms !== null && (pointTerms.length !== 6 || pointTerms.reduce((a, b) => a + b, 0) > points))
      || (hourValues !== null && (hourValues.length !== 6 || pointTerms === null || hourValues.some((v, i) => pointTerms[i] === 0 && v !== null)))) bad();
  } else {
    if (!/^[a-z0-9][a-z0-9_-]{0,95}$/iu.test(rowKey) || ['constructor', 'prototype', '__proto__'].includes(rowKey) || points !== null || pointTerms !== null
      || (hourValues !== null && (hourValues.length === 0 || (schoolform === 'introduktionsprogram' && hourValues.length !== 1)
        || (map?.kind === 'verified' && hourValues.length !== map.columnIds.length)))) bad();
  }
  return { rowKey, points, pointTerms, hourValues };
}
function requireCanonicalGymRows(cells: PlanningCell[]): void {
  const seen = new Set<string>();
  for (const cell of cells) {
    const parts = cell.rowKey.split(':'), alternative = parts[0] === 'alternative';
    if (parts[0] === 'block' || parts[0] === 'meta') continue;
    const part = parts[alternative ? 1 : 0], members = parts.slice(alternative ? 2 : 1).join(':').split('+');
    for (const member of members) {
      const key = `${part}:${member}`;
      if (seen.has(key)) bad();
      seen.add(key);
    }
  }
}
function grProjection(row: PlanningRow, schoolYear: number) {
  const a = row.application;
  return projectGrYear(schoolYear, a && a.columnId !== null ? { planId: a.planId, version: a.version, applicationYear: a.schoolYear, columnId: a.columnId } : null,
    row.columnMap ?? { kind: 'unknown' });
}
function indices(row: PlanningRow, schoolYear: number): number[] | null {
  if (row.schoolform === 'gymnasium') return projectGymYear(schoolYear, row.start).termIndices;
  if (row.schoolform === 'introduktionsprogram') return [0];
  const index = grProjection(row, schoolYear).annualIndex;
  return index === null ? null : [index];
}
const grSubjects = new Map(nationalTimplan.map(s => [s.id, s]));
/** Uses existing grid row applicability, without declaring national-rule compliance. */
function canonicalCells(row: PlanningRow, schoolYear: number): { cells: PlanningCell[]; diagnostics: PlanningDiagnosis[] } {
  if (row.schoolform !== 'grundskola') return { cells: row.cells, diagnostics: [] };
  const { grade, annualIndex } = grProjection(row, schoolYear), diagnostics: PlanningDiagnosis[] = [];
  if (grade === null) return { cells: [], diagnostics };
  const cells = row.cells.filter(cell => {
    if (cell.rowKey === 'skolansval') return true;
    const subject = grSubjects.get(cell.rowKey);
    if (!subject) { diagnostics.push('unknown-row'); return false; }
    const active = subject.group ? grade > 3 : subject.code === undefined ? grade <= 3 : true;
    if (!active && annualIndex !== null && (cell.hourValues?.[annualIndex] ?? 0) > 0) diagnostics.push('inactive-hours');
    return active;
  });
  return { cells, diagnostics };
}
function searchCode(value: unknown): string {
  const result = text(value, 96);
  if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(result) || ['constructor', 'prototype', '__proto__'].includes(result)) bad();
  return result;
}
function parseSearchDetails(value: unknown, schoolform: TimplanKind): PlanningSearchDetails {
  const r = shape(value, ['localCode', 'programCode', 'orientationCode', 'programName', 'orientationName']);
  const parsed = { localCode: r.localCode === null ? null : text(r.localCode),
    programCode: r.programCode === null ? null : searchCode(r.programCode),
    orientationCode: r.orientationCode === null ? null : searchCode(r.orientationCode),
    programName: r.programName === null ? null : text(r.programName),
    orientationName: r.orientationName === null ? null : text(r.orientationName) };
  if (schoolform !== 'gymnasium' && (parsed.programCode !== null || parsed.orientationCode !== null
    || parsed.programName !== null || parsed.orientationName !== null)) bad();
  if (parsed.programCode === null && (parsed.orientationCode !== null || parsed.programName !== null)
    || parsed.orientationCode === null && parsed.orientationName !== null) bad();
  return parsed;
}
const legacyRowKeys = ['customerId', 'unitId', 'offeringId', 'schoolName', 'educationName', 'cohort', 'schoolform', 'plan', 'source', 'start',
  'relativeYear', 'relation', 'underlag', 'archived', 'columnMap', 'application', 'classes', 'cells', 'diagnostics'] as const;
function parseRow(value: unknown, selection: PlanningSelection, setup: PlanningSetup): PlanningRow {
  // Validate descriptors/prototype before testing or reading the optional form discriminator.
  const raw = object(value), extended = Object.hasOwn(raw, 'searchDetails');
  const r = shape(raw, extended ? [...legacyRowKeys, 'searchDetails'] : legacyRowKeys);
  const schoolform = choice(r.schoolform, schoolforms), plan = parsePlan(r.plan), source = parseSource(r.source), unitId = uuid(r.unitId), offeringId = uuid(r.offeringId);
  const unit = setup.units.find(u => u.unitId === unitId);
  if (uuid(r.customerId) !== setup.customerId || !unit || r.schoolName !== unit.schoolName || schoolform !== selection.schoolform
    || (selection.unitId !== null && unitId !== selection.unitId) || !(selection.view === 'programplan' ? unit.canRead.programplan : unit.canRead[schoolform])
    || (source && (source.offeringId !== offeringId || schoolform !== 'gymnasium'))) bad();
  const start = parseStart(r.start), relativeYear = r.relativeYear === null ? null : integer(r.relativeYear, 1, 3) as 1 | 2 | 3;
  const relation = choice(r.relation, relations), underlag = choice(r.underlag, ['class-bound', 'planning', 'forecast', 'missing']), archived = boolean(r.archived);
  const columnMap = schoolform === 'grundskola' ? parseColumnMap(r.columnMap, plan) : null;
  if (schoolform !== 'grundskola' && r.columnMap !== null) bad();
  let application: PlanningRow['application'] = null;
  if (r.application !== null) {
    const a = shape(r.application, ['schoolYear', 'planId', 'version', 'columnId']);
    application = { schoolYear: year(a.schoolYear), planId: uuid(a.planId), version: integer(a.version, 1), columnId: a.columnId === null ? null : text(a.columnId, 5) };
    if (!plan || application.schoolYear !== selection.schoolYear || application.planId !== plan.id || application.version !== plan.version
      || (schoolform === 'grundskola' ? application.columnId === null || !/^ak[1-9]$/u.test(application.columnId) : application.columnId !== null)) bad();
  }
  const classes = unique(array(r.classes, 1000).map(value => {
    const c = shape(value, ['id', 'customerId', 'unitId', 'offeringId']);
    const parsed = { id: uuid(c.id), customerId: uuid(c.customerId), unitId: uuid(c.unitId), offeringId: uuid(c.offeringId) };
    if (parsed.customerId !== setup.customerId || parsed.unitId !== unitId || parsed.offeringId !== offeringId) bad();
    return parsed;
  }), c => c.id);
  if ((underlag === 'class-bound') !== (application !== null)
    || (plan === null) !== (underlag === 'missing')) bad();
  const cells = unique(array(r.cells, 2000).map(v => parseCell(v, schoolform, columnMap)), c => c.rowKey);
  const diagnostics = unique(array(r.diagnostics, diagnoses.length).map(v => choice(v, diagnoses)), v => v);
  if (underlag === 'class-bound' && classes.length === 0 && !diagnostics.some(d => d === 'missing-class' || d === 'ambiguous-class')) bad();
  const row: PlanningRow = { customerId: setup.customerId, unitId, offeringId, schoolName: unit.schoolName, educationName: text(r.educationName), cohort: text(r.cohort),
    schoolform, plan, source, start, relativeYear, relation, underlag, archived, columnMap, application, classes, cells, diagnostics,
    ...(extended ? { searchDetails: parseSearchDetails(r.searchDetails, schoolform) } : {}) };
  const required: PlanningDiagnosis[] = [];
  if (plan === null) { if (source !== null || cells.length || classes.length) bad(); required.push('missing-plan'); }
  if (underlag === 'forecast') required.push('forecast');
  if (schoolform === 'gymnasium') {
    requireCanonicalGymRows(cells);
    const projected = projectGymYear(selection.schoolYear, start);
    if (relativeYear !== projected.relativeYear || relation !== projected.relation) bad();
    required.push(...projected.diagnostics);
    if (plan && source === null) required.push('missing-source');
    if (source === null && cells.length) bad();
    if (plan && source && selection.view === 'programplan' && (plan.id !== source.planId || plan.version !== source.version || plan.revision !== source.revision
      || !['utkast', 'faststalld', 'ersatt'].includes(plan.status) || start.provenance === 'timplan-source' || cells.some(c => c.hourValues !== null))) bad();
    if (selection.view === 'timplan' && start.provenance === 'program-version') bad();
    if (start.startedOn !== null) {
      const terms = Array.from({ length: 6 }, (_, i) => cells.reduce((sum, c) => sum + (c.pointTerms?.[i] ?? 0) + (c.hourValues?.[i] ?? 0), 0));
      required.push(...projectGymYear(selection.schoolYear, start, terms).diagnostics);
    }
  } else {
    if (relativeYear !== null || relation !== 'unknown' || source !== null) bad();
    if (schoolform === 'grundskola') required.push(...grProjection(row, selection.schoolYear).diagnostics);
  }
  required.push(...canonicalCells(row, selection.schoolYear).diagnostics);
  const metrics = planningAnnualMetrics(row, selection.schoolYear);
  if (metrics.points && !metrics.points.complete) required.push('missing-points');
  if (selection.view === 'timplan' && !metrics.hours.complete) required.push('missing-hours');
  if (required.some(d => !diagnostics.includes(d))) bad();
  const actualGrade = schoolform === 'gymnasium' ? relativeYear : schoolform === 'grundskola' ? grProjection(row, selection.schoolYear).grade : null;
  if ((selection.grade !== null && actualGrade !== selection.grade) || (selection.status !== 'all' && plan?.status !== selection.status)
    || (selection.cohortRelation === 'relevant' && ['future', 'finished'].includes(relation))
    || (!['all', 'relevant'].includes(selection.cohortRelation) && relation !== selection.cohortRelation)
    || (selection.archive !== 'all' && archived !== (selection.archive === 'archived'))) bad();
  return row;
}

/** Consume parsed rows only. The original arrays and indices are never modified. */
export function planningAnnualMetrics(row: PlanningRow, schoolYear: number): PlanningAnnualMetrics {
  const selected = indices(row, schoolYear), gym = row.schoolform === 'gymnasium';
  const canonical = canonicalCells(row, schoolYear);
  let points = 0, hours = 0, pointsComplete = row.plan !== null && selected !== null && row.cells.length > 0,
    hoursComplete = row.plan !== null && selected !== null && canonical.cells.length > 0 && canonical.diagnostics.length === 0;
  for (const cell of canonical.cells) {
    if (gym && (!cell.pointTerms || cell.pointTerms.reduce((a, b) => a + b, 0) !== cell.points)) { pointsComplete = false; hoursComplete = false; }
    if (selected === null) continue;
    for (const index of selected) {
      if (gym) points += cell.pointTerms?.[index] ?? 0;
      if (gym && cell.pointTerms?.[index] === 0) continue;
      const value = cell.hourValues?.[index];
      if (value === null || value === undefined) hoursComplete = false; else hours += value;
    }
  }
  return { points: gym ? measure(points, pointsComplete) : null, hours: measure(hours, hoursComplete),
    measure: row.schoolform === 'introduktionsprogram' ? 'hours-per-week' : 'hours-per-year',
    classCount: measure(row.classes.length, !row.diagnostics.some(d => d === 'missing-class' || d === 'ambiguous-class')) };
}
function rows(value: unknown, maximum: number, selected: PlanningSelection, setup: PlanningSetup): PlanningRow[] {
  let cellCount = 0, classReferenceCount = 0;
  const result = unique(array(value, maximum).map(v => {
    const row = parseRow(v, selected, setup); cellCount += row.cells.length; classReferenceCount += row.classes.length;
    if (cellCount > 50000 || classReferenceCount > 50000) bad(); return row;
  }), r => JSON.stringify([r.unitId, r.offeringId, r.plan?.id ?? null, r.application?.columnId ?? null]));
  // An ID cannot silently refer to different versions, educations or class scopes in one result.
  const references = new Map<string, string>();
  const remember = (key: string, value: unknown) => { const encoded = JSON.stringify(value); if (references.has(key) && references.get(key) !== encoded) bad(); references.set(key, encoded); };
  for (const row of result) {
    const canonicalCells = [...row.cells].sort((a, b) => a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0);
    if (row.plan) remember(`plan:${row.plan.id}`, [row.plan, row.offeringId, selected.view === 'timplan' ? row.unitId : null,
      row.columnMap, row.source, canonicalCells]);
    // Same program frame across schools must retain its entire point-cell inventory.
    // The schools' independently allocated hours are intentionally excluded here.
    if (row.source) remember(`source:${row.source.planId}`, [row.source, row.start, canonicalCells.map(c => [c.rowKey, c.points, c.pointTerms])]);
    row.classes.forEach(c => remember(`class:${c.id}`, c));
  }
  return result;
}
function envelope(value: unknown, keys: string[], expected: PlanningSelection, suppliedScope: PlanningSetup) {
  const r = shape(value, keys), setup = parsePlanningSetup(suppliedScope), wanted = parsePlanningSelection(expected, setup), selected = parsePlanningSelection(r.selection, setup);
  const selectionRevision = fingerprint(r.selectionRevision);
  if (!same(selected, wanted) || (wanted.selectionRevision !== null && selectionRevision !== wanted.selectionRevision)) bad();
  return { r, setup, selected, selectionRevision, count: integer(r.count, 0, 5000000) };
}
export function parsePlanningList(value: unknown, expected: PlanningSelection, setup: PlanningSetup): PlanningList {
  const e = envelope(value, ['selection', 'selectionRevision', 'count', 'pageSize', 'rows'], expected, setup);
  const parsed = rows(e.r.rows, 50, e.selected, e.setup);
  if (e.r.pageSize !== 50 || parsed.length !== Math.min(50, Math.max(0, e.count - (e.selected.page - 1) * 50))) bad();
  return { selection: e.selected, selectionRevision: e.selectionRevision, count: e.count, pageSize: 50, rows: parsed };
}

function overviewTotals(rows: PlanningRow[], schoolYear: number, view: PlanningSelection['view'], schoolform: TimplanKind): PlanningOverviewTotals {
  const pointCells = new Map<string, string>(), hourCells = new Map<string, string>(), classes = new Set<string>();
  let points = 0, annual = 0, weekly = 0, pointsComplete = true, annualComplete = true, weeklyComplete = true, classesComplete = true;
  const hasPoints = schoolform === 'gymnasium';
  const add = (seen: Map<string, string>, key: unknown[], payload: unknown): boolean => {
    const k = JSON.stringify(key), p = JSON.stringify(payload);
    if (seen.has(k)) { if (seen.get(k) !== p) bad(); return false; }
    seen.set(k, p); return true;
  };
  for (const row of rows) {
    const selected = indices(row, schoolYear), metrics = planningAnnualMetrics(row, schoolYear);
    row.classes.forEach(c => classes.add(c.id));
    if (!metrics.classCount.complete) classesComplete = false;
    if (row.schoolform === 'gymnasium' && !metrics.points?.complete) pointsComplete = false;
    if (view === 'timplan' && !metrics.hours.complete) { if (row.schoolform === 'introduktionsprogram') weeklyComplete = false; else annualComplete = false; }
    if (!selected || !row.plan) continue;
    for (const cell of canonicalCells(row, schoolYear).cells) {
      const yearIndex = row.schoolform === 'gymnasium' ? Math.floor(selected[0] / 2) : row.application?.columnId ?? 'vecka';
      const pointValue = selected.reduce((sum, i) => sum + (cell.pointTerms?.[i] ?? 0), 0);
      if (row.source && add(pointCells, [row.source.planId, row.source.version, yearIndex, cell.rowKey], [row.source.revision, cell.points, cell.pointTerms])) points += pointValue;
      if (view === 'timplan' && add(hourCells, [row.plan.id, row.plan.version, row.unitId, yearIndex, cell.rowKey], [row.plan.revision, cell.hourValues])) {
        const amount = selected.reduce((sum, i) => sum + (row.schoolform === 'gymnasium' && cell.pointTerms?.[i] === 0 ? 0 : cell.hourValues?.[i] ?? 0), 0);
        if (row.schoolform === 'introduktionsprogram') weekly += amount; else annual += amount;
      }
    }
  }
  return { points: hasPoints ? measure(points, pointsComplete) : null, annualHours: measure(annual, annualComplete), weeklyHours: measure(weekly, weeklyComplete),
    classCount: measure(classes.size, classesComplete), hasForecast: rows.some(r => r.underlag === 'forecast') };
}
function parseMeasure(value: unknown): PlanningMeasure {
  const r = shape(value, ['value', 'known', 'complete']), known = integer(r.known, 0, Number.MAX_SAFE_INTEGER), complete = boolean(r.complete);
  if (r.value !== (complete ? known : null)) bad();
  return measure(known, complete);
}
export function parsePlanningOverview(value: unknown, expected: PlanningSelection, setup: PlanningSetup): PlanningOverview {
  const e = envelope(value, ['selection', 'selectionRevision', 'count', 'rows', 'totals'], expected, setup);
  if (e.selected.page !== 1) bad();
  const parsed = rows(e.r.rows, 10000, e.selected, e.setup);
  if (parsed.length !== e.count) bad();
  const t = shape(e.r.totals, ['points', 'annualHours', 'weeklyHours', 'classCount', 'hasForecast']);
  const totals = { points: t.points === null ? null : parseMeasure(t.points), annualHours: parseMeasure(t.annualHours), weeklyHours: parseMeasure(t.weeklyHours),
    classCount: parseMeasure(t.classCount), hasForecast: boolean(t.hasForecast) };
  if (!same(totals, overviewTotals(parsed, e.selected.schoolYear, e.selected.view, e.selected.schoolform))) bad();
  return { selection: e.selected, selectionRevision: e.selectionRevision, count: e.count, rows: parsed, totals };
}
