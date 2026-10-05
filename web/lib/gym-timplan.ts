import { ProgramplanContractError, catalogDate } from './programplan-catalog.ts';
import { parseProgramplanTermDistribution } from './programplan-terms-contract.ts';
import type { ProgramplanTermPoints, ProgramplanTermRow } from './programplan-terms.ts';
import type { TimplanStatus } from './protected-timplan.ts';

export type GymTimplanHours = [number | null, number | null, number | null, number | null, number | null, number | null];
export type GymTimplanEducation = { name: string; cohort: string; programCode: string; orientationCode: string | null };
export type GymTimplanSource = {
  planId: string; offeringId: string; version: number; revision: number; status: 'utkast' | 'faststalld' | 'ersatt';
  catalogId: string | null; startedOn: string | null; educationRevision: number; education: GymTimplanEducation;
};
export type GymTimplanRow = ProgramplanTermRow & {
  pointTerms: ProgramplanTermPoints; rowKind: 'fixed' | 'alternative' | 'block' | 'diplomaWork';
};
export type GymTimplanSummary = {
  id: string; version: number; revision: number; status: TimplanStatus;
  sourcePlanId: string | null; sourceRevision: number | null; sourceVersion: number | null;
};
export type GymTimplanUnit = { unitId: string; schoolName: string; canPlan: boolean; plans: GymTimplanSummary[] };
export type GymTimplanUnderlag = {
  source: GymTimplanSource; units: GymTimplanUnit[]; rows: GymTimplanRow[]; readiness: { ready: boolean; missing: string[] };
};
export type GymTimplanCurrentSource = Pick<GymTimplanSource, 'planId' | 'version' | 'revision' | 'status'>;
export type GymTimplan = {
  id: string; offeringId: string; unitId: string; schoolName: string; version: number; revision: number; status: TimplanStatus;
  source: GymTimplanSource; currentSource: GymTimplanCurrentSource | null; rows: GymTimplanRow[];
  hours: Record<string, GymTimplanHours>; canPlan: boolean; archived: boolean; sourceChanged: boolean;
};
export type GymTimplanUnderlagRequest = { sourcePlanId: string };
export type GymTimplanReadRequest = { planId: string };
export type GymTimplanCreateRequest = {
  commandId: string; sourcePlanId: string; expectedSourceRevision: number; expectedEducationRevision: number;
  unitId: string; predecessorPlanId: string | null; expectedPredecessorRevision: number | null;
};
export type GymTimplanCreateReply = {
  id: string; offeringId: string; unitId: string; version: number; revision: number; sourcePlanId: string; sourceRevision: number;
  replayed: boolean; carriedRows: number; resetRows: number;
};
export type GymTimplanRowRequest = { planId: string; expectedRevision: number; rowKey: string; hours: GymTimplanHours };
export type GymTimplanRowReply = { id: string; revision: number; rowKey: string; hours: GymTimplanHours };

function bad(): never { throw new ProgramplanContractError('invalid_gym_timplan'); }
export function gymObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return value as Record<string, unknown>;
}
export function gymShape(value: unknown, keys: string[]): Record<string, unknown> {
  const row = gymObject(value);
  if (Object.getOwnPropertyNames(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) bad();
  return row;
}
export function gymArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
export function gymUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
export function gymInteger(value: unknown, maximum = 2147483647, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) bad();
  return value;
}
export function gymText(value: unknown, maximum = 1000): string {
  if (typeof value !== 'string' || value.length > maximum) bad();
  return value;
}
export function gymBoolean(value: unknown): boolean { if (typeof value !== 'boolean') bad(); return value; }
export function gymStatus(value: unknown): TimplanStatus {
  if (typeof value !== 'string' || !['utkast', 'forslag', 'atersand', 'faststalld', 'ersatt'].includes(value)) bad();
  return value as TimplanStatus;
}
export function gymSourceStatus(value: unknown): GymTimplanSource['status'] {
  if (value !== 'utkast' && value !== 'faststalld' && value !== 'ersatt') bad();
  return value;
}
export function gymRowKey(value: unknown): string {
  return parseProgramplanTermDistribution([{ rowKey: value, points: [0, 0, 0, 0, 0, 0] }])[0].rowKey;
}
export function parseGymTimplanHours(value: unknown): GymTimplanHours {
  const values = gymArray(value, 6); if (values.length !== 6) bad();
  return values.map(value => value === null ? null : gymInteger(value, 2000)) as GymTimplanHours;
}
export function parseGymTimplanHourInput(value: string): number | null | undefined {
  if (value === '') return null;
  if (!/^\d{1,4}$/u.test(value)) return undefined;
  const hours = Number(value); return hours <= 2000 ? hours : undefined;
}
export function parseGymTimplanEducation(value: unknown): GymTimplanEducation {
  const e = gymShape(value, ['name', 'cohort', 'programCode', 'orientationCode']);
  const code = (v: unknown) => { const result = gymText(v, 96); if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(result)
    || ['constructor', 'prototype', '__proto__'].includes(result)) bad(); return result; };
  return { name: gymText(e.name), cohort: gymText(e.cohort), programCode: code(e.programCode), orientationCode: e.orientationCode === null ? null : code(e.orientationCode) };
}
export function parseGymTimplanSource(value: unknown): GymTimplanSource {
  const s = gymShape(value, ['planId', 'offeringId', 'version', 'revision', 'status', 'catalogId', 'startedOn', 'educationRevision', 'education']);
  if (s.catalogId !== null && (typeof s.catalogId !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(s.catalogId))) bad();
  const startedOn = s.startedOn === null ? null : catalogDate(s.startedOn);
  if ((s.catalogId === null) !== (startedOn === null)) bad();
  return { planId: gymUuid(s.planId), offeringId: gymUuid(s.offeringId), version: gymInteger(s.version, 2147483647, 1), revision: gymInteger(s.revision),
    status: gymSourceStatus(s.status), catalogId: s.catalogId, startedOn, educationRevision: gymInteger(s.educationRevision), education: parseGymTimplanEducation(s.education) };
}
export function parseGymTimplanCurrentSource(value: unknown): GymTimplanCurrentSource | null {
  if (value === null) return null;
  const r = gymShape(value, ['planId', 'version', 'revision', 'status']);
  return { planId: gymUuid(r.planId), version: gymInteger(r.version, 2147483647, 1), revision: gymInteger(r.revision), status: gymSourceStatus(r.status) };
}
export function parseGymTimplanRows(value: unknown): GymTimplanRow[] {
  const rows = gymArray(value, 2000).map(value => {
    const r = gymShape(value, ['key', 'name', 'levelName', 'points', 'part', 'pointTerms', 'rowKind']);
    const key = gymRowKey(r.key), points = gymInteger(r.points, 10000);
    const pointTerms = parseProgramplanTermDistribution([{ rowKey: key, points: r.pointTerms }])[0].points;
    if (pointTerms.reduce((n, p) => n + p, 0) > points || typeof r.part !== 'string'
      || !['foundation', 'programmeSpecific', 'orientation', 'specialization', 'individualChoice', 'diplomaWork'].includes(r.part)) bad();
    const rowKind: GymTimplanRow['rowKind'] = key.startsWith('block:') ? 'block' : key.startsWith('alternative:') ? 'alternative' : key === 'meta:diplomaWork' ? 'diplomaWork' : 'fixed';
    if (r.rowKind !== rowKind) bad();
    return { key, name: gymText(r.name), levelName: gymText(r.levelName), points, part: r.part as ProgramplanTermRow['part'], pointTerms, rowKind };
  });
  if (new Set(rows.map(row => row.key)).size !== rows.length) bad();
  return rows;
}
export function parseGymTimplanUnits(value: unknown): GymTimplanUnit[] {
  const units = gymArray(value, 1000).map(value => {
    const u = gymShape(value, ['unitId', 'schoolName', 'canPlan', 'plans']);
    const plans = gymArray(u.plans, 10000).map(value => {
      const p = gymShape(value, ['id', 'version', 'revision', 'status', 'sourcePlanId', 'sourceRevision', 'sourceVersion']);
      const sourcePlanId = p.sourcePlanId === null ? null : gymUuid(p.sourcePlanId), sourceRevision = p.sourceRevision === null ? null : gymInteger(p.sourceRevision),
        sourceVersion = p.sourceVersion === null ? null : gymInteger(p.sourceVersion, 2147483647, 1);
      if ((sourcePlanId === null) !== (sourceRevision === null) || (sourcePlanId === null) !== (sourceVersion === null)) bad();
      return { id: gymUuid(p.id), version: gymInteger(p.version, 2147483647, 1), revision: gymInteger(p.revision), status: gymStatus(p.status), sourcePlanId, sourceRevision, sourceVersion };
    });
    if (new Set(plans.map(p => p.id)).size !== plans.length || new Set(plans.map(p => p.version)).size !== plans.length) bad();
    return { unitId: gymUuid(u.unitId), schoolName: gymText(u.schoolName), canPlan: gymBoolean(u.canPlan), plans };
  });
  if (new Set(units.map(u => u.unitId)).size !== units.length) bad();
  return units;
}
export function parseGymTimplanUnderlag(value: unknown, sourcePlanId: string): GymTimplanUnderlag {
  const r = gymShape(value, ['source', 'units', 'rows', 'readiness']), source = parseGymTimplanSource(r.source), readiness = gymShape(r.readiness, ['ready', 'missing']);
  if (source.planId !== gymUuid(sourcePlanId)) bad();
  const missing = gymArray(readiness.missing, 2000).map(v => gymText(v)), ready = gymBoolean(readiness.ready);
  if (ready !== (missing.length === 0)) bad();
  return { source, units: parseGymTimplanUnits(r.units), rows: parseGymTimplanRows(r.rows), readiness: { ready, missing } };
}
export function parseGymTimplan(value: unknown, planId: string): GymTimplan {
  const r = gymShape(value, ['id', 'offeringId', 'unitId', 'schoolName', 'version', 'revision', 'status', 'source', 'currentSource', 'rows', 'hours', 'canPlan', 'archived', 'sourceChanged']);
  const id = gymUuid(r.id), source = parseGymTimplanSource(r.source), rows = parseGymTimplanRows(r.rows), currentSource = parseGymTimplanCurrentSource(r.currentSource);
  if (id !== gymUuid(planId) || gymUuid(r.offeringId) !== source.offeringId || source.catalogId === null || !rows.length
    || rows.some(row => row.pointTerms.reduce((n, p) => n + p, 0) !== row.points)) bad();
  const rawHours = gymObject(r.hours);
  if (Object.getOwnPropertyNames(rawHours).length !== rows.length || rows.some(row => !Object.hasOwn(rawHours, row.key))) bad();
  const hours = Object.fromEntries(rows.map(row => {
    const values = parseGymTimplanHours(rawHours[row.key]);
    if (values.some((value, index) => row.pointTerms[index] === 0 && value !== null)) bad();
    return [row.key, values];
  }));
  const sourceChanged = currentSource === null || currentSource.planId !== source.planId || currentSource.revision !== source.revision || currentSource.version !== source.version;
  if (r.sourceChanged !== sourceChanged) bad();
  return { id, offeringId: source.offeringId, unitId: gymUuid(r.unitId), schoolName: gymText(r.schoolName), version: gymInteger(r.version, 2147483647, 1),
    revision: gymInteger(r.revision), status: gymStatus(r.status), source, currentSource, rows, hours,
    canPlan: gymBoolean(r.canPlan), archived: gymBoolean(r.archived), sourceChanged };
}
export function parseGymTimplanUnderlagRequest(value: unknown): GymTimplanUnderlagRequest {
  return { sourcePlanId: gymUuid(gymShape(value, ['sourcePlanId']).sourcePlanId) };
}
export function parseGymTimplanReadRequest(value: unknown): GymTimplanReadRequest {
  return { planId: gymUuid(gymShape(value, ['planId']).planId) };
}
export function parseGymTimplanCreateRequest(value: unknown): GymTimplanCreateRequest {
  const r = gymShape(value, ['commandId', 'sourcePlanId', 'expectedSourceRevision', 'expectedEducationRevision', 'unitId', 'predecessorPlanId', 'expectedPredecessorRevision']);
  const predecessorPlanId = r.predecessorPlanId === null ? null : gymUuid(r.predecessorPlanId), expectedPredecessorRevision = r.expectedPredecessorRevision === null ? null : gymInteger(r.expectedPredecessorRevision, 2147483646);
  if ((predecessorPlanId === null) !== (expectedPredecessorRevision === null)) bad();
  return { commandId: gymUuid(r.commandId), sourcePlanId: gymUuid(r.sourcePlanId), expectedSourceRevision: gymInteger(r.expectedSourceRevision, 2147483646),
    expectedEducationRevision: gymInteger(r.expectedEducationRevision, 2147483646), unitId: gymUuid(r.unitId), predecessorPlanId, expectedPredecessorRevision };
}
export function parseGymTimplanRowRequest(value: unknown): GymTimplanRowRequest {
  const r = gymShape(value, ['planId', 'expectedRevision', 'rowKey', 'hours']);
  return { planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision, 2147483646), rowKey: gymRowKey(r.rowKey), hours: parseGymTimplanHours(r.hours) };
}
export function parseGymTimplanCreateReply(value: unknown, expected: GymTimplanCreateRequest): GymTimplanCreateReply {
  const r = gymShape(value, ['id', 'offeringId', 'unitId', 'version', 'revision', 'sourcePlanId', 'sourceRevision', 'replayed', 'carriedRows', 'resetRows']);
  if (gymUuid(r.unitId) !== expected.unitId || gymUuid(r.sourcePlanId) !== expected.sourcePlanId || gymInteger(r.sourceRevision) !== expected.expectedSourceRevision) bad();
  const revision = gymInteger(r.revision), replayed = gymBoolean(r.replayed);
  if (!replayed && revision !== 0) bad();
  return { id: gymUuid(r.id), offeringId: gymUuid(r.offeringId), unitId: expected.unitId, version: gymInteger(r.version, 2147483647, 1), revision,
    sourcePlanId: expected.sourcePlanId, sourceRevision: expected.expectedSourceRevision, replayed, carriedRows: gymInteger(r.carriedRows, 2000), resetRows: gymInteger(r.resetRows, 2000) };
}
export function parseGymTimplanRowReply(value: unknown, expected: GymTimplanRowRequest): GymTimplanRowReply {
  const r = gymShape(value, ['id', 'revision', 'rowKey', 'hours']), hours = parseGymTimplanHours(r.hours);
  if (gymUuid(r.id) !== expected.planId || r.rowKey !== expected.rowKey || gymInteger(r.revision) !== expected.expectedRevision + 1
    || hours.some((hours, index) => hours !== expected.hours[index])) bad();
  return { id: expected.planId, revision: expected.expectedRevision + 1, rowKey: expected.rowKey, hours };
}
export function gymTimplanCanEdit(plan: GymTimplan): boolean { return plan.canPlan && !plan.archived && plan.status === 'utkast'; }
export function gymTimplanTotals(plan: Pick<GymTimplan, 'rows' | 'hours'>) {
  const terms = [0, 0, 0, 0, 0, 0], missingRows: string[] = [];
  for (const row of plan.rows) {
    const values = plan.hours[row.key];
    if (!values || values.length !== 6) bad();
    if (values.some((value, index) => row.pointTerms[index] > 0 && value === null)) missingRows.push(row.key);
    values.forEach((hours, index) => terms[index] += hours ?? 0);
  }
  return { terms, total: terms.reduce((n, hours) => n + hours, 0), missingRows };
}
