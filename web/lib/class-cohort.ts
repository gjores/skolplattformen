import { catalogDate, ProgramplanContractError } from './programplan-catalog.ts';
import { gymArray, gymBoolean, gymInteger, gymShape, gymText, gymUuid } from './gym-timplan.ts';

// Internal GY class contract. Class identity/validity stays separate from pupil
// memberships and explicit timplan links; this is not an SS 12000 export.
export type ClassCohortUnderlagRequest = { offeringId: string; unitId: string };
export type ClassCohortClass = {
  id: string;
  name: string;
  cohortStartYear: number;
} & ({ startsOn: null; endsOn: null; validitySource: 'legacy_unknown' }
  | { startsOn: string; endsOn: string | null; validitySource: 'education_start' });
export type ClassCohortUnderlag = ClassCohortUnderlagRequest & {
  educationName: string;
  schoolName: string;
  educationRevision: number;
  sourceToken: string | null;
  educationStartsOn: string | null;
  firstSchoolYear: number | null;
  canManage: boolean;
  blockers: string[];
  classes: ClassCohortClass[];
};
export type ClassCohortCreateRequest = ClassCohortUnderlagRequest & {
  commandId: string;
  expectedEducationRevision: number;
  expectedSourceToken: string;
  startsOn: string;
  names: string[];
};
type CreatedClass = Extract<ClassCohortClass, { validitySource: 'education_start' }> & { endsOn: null };
export type ClassCohortCreateReply = ClassCohortUnderlagRequest & {
  commandId: string;
  startsOn: string;
  classes: CreatedClass[];
  replayed: boolean;
};
export type ClassCohortStatusReply = ClassCohortUnderlagRequest & { commandId: string } & (
  { status: 'not_found'; receipt: null }
  | { status: 'found'; receipt: ClassCohortCreateReply & { replayed: true } }
);

function bad(): never { throw new ProgramplanContractError('invalid_class_cohort'); }
function date(value: unknown): string {
  const result = catalogDate(value);
  if (result.startsWith('0000-')) bad();
  return result;
}
function firstSchoolYear(startsOn: string): number {
  return Number(startsOn.slice(0, 4)) - (startsOn.slice(5, 7) < '07' ? 1 : 0);
}
function token(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) bad();
  return value;
}
function nonemptyText(value: unknown): string {
  const result = gymText(value);
  if (!result) bad();
  return result;
}
function reviewedName(value: unknown): string {
  const result = gymText(value, 60);
  if (!result || result !== result.trim().toUpperCase() || /[\p{Cc}\p{Cf}]/u.test(result)) bad();
  // JSON can carry lone UTF-16 surrogates, while PostgreSQL text cannot.
  // Validate scalar pairs without requiring String.isWellFormed in browsers.
  for (let index = 0; index < result.length; index++) {
    const unit = result.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = result.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) bad();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) bad();
  }
  return result;
}
function storedName(value: unknown): string {
  // Older class creation uses PostgreSQL's 60-codepoint length rule. Preserve
  // those names verbatim; only a newly confirmed batch uses reviewedName.
  const result = gymText(value, 120);
  if (!result || Array.from(result).length > 60) bad();
  return result;
}
function uniqueIds(classes: ClassCohortClass[]): void {
  if (new Set(classes.map(row => row.id)).size !== classes.length) bad();
}
function parseClass(value: unknown): ClassCohortClass {
  const row = gymShape(value, ['id', 'name', 'cohortStartYear', 'startsOn', 'endsOn', 'validitySource']);
  const common = { id: gymUuid(row.id), name: storedName(row.name), cohortStartYear: gymInteger(row.cohortStartYear, 9998, 1) };
  if (row.validitySource === 'legacy_unknown') {
    if (row.startsOn !== null || row.endsOn !== null) bad();
    return { ...common, startsOn: null, endsOn: null, validitySource: 'legacy_unknown' };
  }
  if (row.validitySource !== 'education_start') bad();
  const startsOn = date(row.startsOn), endsOn = row.endsOn === null ? null : date(row.endsOn);
  if (firstSchoolYear(startsOn) !== common.cohortStartYear || (endsOn !== null && endsOn < startsOn)) bad();
  return { ...common, startsOn, endsOn, validitySource: 'education_start' };
}

export function parseClassCohortUnderlagRequest(value: unknown): ClassCohortUnderlagRequest {
  const row = gymShape(value, ['offeringId', 'unitId']);
  return { offeringId: gymUuid(row.offeringId), unitId: gymUuid(row.unitId) };
}
export function parseClassCohortCreateRequest(value: unknown): ClassCohortCreateRequest {
  const row = gymShape(value, ['commandId', 'offeringId', 'unitId', 'expectedEducationRevision', 'expectedSourceToken', 'startsOn', 'names']);
  const startsOn = date(row.startsOn);
  gymInteger(firstSchoolYear(startsOn), 2100, 2000);
  const names = gymArray(row.names, 20).map(reviewedName);
  if (!names.length || new Set(names).size !== names.length) bad();
  return { commandId: gymUuid(row.commandId), offeringId: gymUuid(row.offeringId), unitId: gymUuid(row.unitId),
    expectedEducationRevision: gymInteger(row.expectedEducationRevision), expectedSourceToken: token(row.expectedSourceToken), startsOn, names };
}
export function parseClassCohortStatusRequest(value: unknown): ClassCohortCreateRequest {
  return parseClassCohortCreateRequest(value);
}
export function parseClassCohortUnderlag(value: unknown, input: ClassCohortUnderlagRequest): ClassCohortUnderlag {
  const expected = parseClassCohortUnderlagRequest(input);
  const row = gymShape(value, ['offeringId', 'unitId', 'educationName', 'schoolName', 'educationRevision', 'sourceToken',
    'educationStartsOn', 'firstSchoolYear', 'canManage', 'blockers', 'classes']);
  const result: ClassCohortUnderlag = {
    offeringId: gymUuid(row.offeringId), unitId: gymUuid(row.unitId), educationName: nonemptyText(row.educationName), schoolName: nonemptyText(row.schoolName),
    educationRevision: gymInteger(row.educationRevision), sourceToken: row.sourceToken === null ? null : token(row.sourceToken),
    educationStartsOn: row.educationStartsOn === null ? null : date(row.educationStartsOn),
    firstSchoolYear: row.firstSchoolYear === null ? null : gymInteger(row.firstSchoolYear, 9998, 1),
    canManage: gymBoolean(row.canManage), blockers: gymArray(row.blockers, 20).map(nonemptyText), classes: gymArray(row.classes, 2000).map(parseClass),
  };
  if (result.offeringId !== expected.offeringId || result.unitId !== expected.unitId) bad();
  uniqueIds(result.classes);
  const unknown = result.educationStartsOn === null;
  if (unknown !== (result.sourceToken === null) || unknown !== (result.firstSchoolYear === null)) bad();
  if (result.educationStartsOn !== null && firstSchoolYear(result.educationStartsOn) !== result.firstSchoolYear) bad();
  const outsideWriteYears = result.firstSchoolYear !== null && (result.firstSchoolYear < 2000 || result.firstSchoolYear > 2100);
  if ((unknown || outsideWriteYears) && (!result.blockers.length || result.canManage)) bad();
  if (result.canManage && (result.blockers.length || result.classes.length >= 2000)) bad();
  return result;
}
export function parseClassCohortCreateReply(value: unknown, input: ClassCohortCreateRequest): ClassCohortCreateReply {
  const expected = parseClassCohortCreateRequest(input);
  const row = gymShape(value, ['commandId', 'offeringId', 'unitId', 'startsOn', 'classes', 'replayed']);
  const classes = gymArray(row.classes, 20).map((value, index): CreatedClass => {
    const item = parseClass(value);
    reviewedName(item.name);
    if (item.validitySource !== 'education_start' || item.endsOn !== null || item.startsOn !== expected.startsOn || item.name !== expected.names[index]) bad();
    return { ...item, endsOn: null };
  });
  uniqueIds(classes);
  const result = { commandId: gymUuid(row.commandId), offeringId: gymUuid(row.offeringId), unitId: gymUuid(row.unitId),
    startsOn: date(row.startsOn), classes, replayed: gymBoolean(row.replayed) };
  if (result.commandId !== expected.commandId || result.offeringId !== expected.offeringId || result.unitId !== expected.unitId
    || result.startsOn !== expected.startsOn || classes.length !== expected.names.length) bad();
  return result;
}
export function parseClassCohortStatusReply(value: unknown, input: ClassCohortCreateRequest): ClassCohortStatusReply {
  const expected = parseClassCohortStatusRequest(input);
  const row = gymShape(value, ['commandId', 'offeringId', 'unitId', 'status', 'receipt']);
  const common = { commandId: gymUuid(row.commandId), offeringId: gymUuid(row.offeringId), unitId: gymUuid(row.unitId) };
  if (common.commandId !== expected.commandId || common.offeringId !== expected.offeringId || common.unitId !== expected.unitId) bad();
  if (row.status === 'not_found') {
    if (row.receipt !== null) bad();
    return { ...common, status: 'not_found', receipt: null };
  }
  if (row.status !== 'found') bad();
  const receipt = parseClassCohortCreateReply(row.receipt, expected);
  if (receipt.replayed !== true) bad();
  return { ...common, status: 'found', receipt: { ...receipt, replayed: true } };
}
