import { gymArray, gymInteger, gymObject, gymShape, gymUuid, parseGymTimplan, parseGymTimplanRows, type GymTimplanRow } from './gym-timplan.ts';
import { parseAplPlan, type AplPlan, type AplCanonicalValue } from './apl-plan.ts';

/** Internal teaching-time budgets. Neither these minutes nor a period balance prove attendance or workplace placement. */
export const TIMPLAN_TIME_MODEL_V2 = 'school_terms_annual_apl_v2' as const;
export const TIMPLAN_TIME_LIMITS = { schoolMinutes: 120000, annualAplMinutes: 240000 } as const;
export type SchoolMinutes = [number | null, number | null, number | null, number | null, number | null, number | null];
export type AnnualAplMinutes = [number | null, number | null, number | null];
export type TimeRowV2 = { schoolMinutes: SchoolMinutes; annualAplMinutes: AnnualAplMinutes };
export type TimplanTimeRows = Record<string, TimeRowV2>;
export type TimplanTimeV2 = { timeModel: typeof TIMPLAN_TIME_MODEL_V2; timeRows: TimplanTimeRows };
export type TimplanTimeSource = { rows: GymTimplanRow[]; timeRows: TimplanTimeRows };
export class TimplanTimeContractError extends TypeError {
  readonly code = 'invalid_timplan_time';
  readonly reason: string;
  constructor(reason = 'invalid_contract') { super('Timplanens skoltid och års-APL kunde inte kontrolleras.'); this.name = 'TimplanTimeContractError'; this.reason = reason; }
}
function bad(reason?: string): never { throw new TimplanTimeContractError(reason); }
function guarded<T>(fn: () => T): T {
  try { return fn(); } catch (error) { if (error instanceof TimplanTimeContractError) throw error; return bad(); }
}
function minutes(value: unknown, maximum: number): number | null { return value === null ? null : gymInteger(value, maximum); }
function activeYear(points: readonly number[], year: number): boolean { return points[year * 2] > 0 || points[year * 2 + 1] > 0; }
function sum(values: readonly (number | null)[]): number {
  let total = 0;
  for (const value of values) { total += value ?? 0; if (!Number.isSafeInteger(total)) bad('unsafe_sum'); }
  return total;
}
/** Pure shape parser; pass the frozen row's point terms when validating activity. */
export function parseTimplanTimeRow(value: unknown, pointTerms?: readonly number[], aplAllowed = true): TimeRowV2 {
  return guarded(() => {
    if (typeof aplAllowed !== 'boolean') bad();
    const row = gymShape(value, ['schoolMinutes', 'annualAplMinutes']);
    const school = gymArray(row.schoolMinutes, 6), annual = gymArray(row.annualAplMinutes, 3);
    if (school.length !== 6 || annual.length !== 3) bad();
    const schoolMinutes = school.map(n => minutes(n, TIMPLAN_TIME_LIMITS.schoolMinutes)) as SchoolMinutes;
    const annualAplMinutes = annual.map(n => minutes(n, TIMPLAN_TIME_LIMITS.annualAplMinutes)) as AnnualAplMinutes;
    if (!aplAllowed && annualAplMinutes.some(n => n !== null)) bad('apl_not_allowed');
    if (pointTerms !== undefined) {
      const terms = gymArray(pointTerms, 6).map(n => gymInteger(n, 10000));
      if (terms.length !== 6) bad();
      if (schoolMinutes.some((n, index) => terms[index] === 0 && n !== null)
        || annualAplMinutes.some((n, year) => !activeYear(terms, year) && n !== null)) bad('inactive_time_cell');
    }
    return { schoolMinutes, annualAplMinutes };
  });
}
export function parseTimplanTimeCells(value: unknown, sourceRows: GymTimplanRow[], aplAllowed = true): TimplanTimeRows {
  return guarded(() => {
    const rows = parseGymTimplanRows(sourceRows), raw = gymObject(value);
    if (Object.getOwnPropertyNames(raw).length !== rows.length || rows.some(row => !Object.hasOwn(raw, row.key))) bad('row_mismatch');
    return Object.fromEntries(rows.map(row => [row.key, parseTimplanTimeRow(raw[row.key], row.pointTerms, aplAllowed)]));
  });
}
/** Closed V2 envelope: an hours property is always rejected rather than reinterpreted. */
export function parseTimplanTime(value: unknown, rows: GymTimplanRow[], aplAllowed = true): TimplanTimeV2 {
  return guarded(() => {
    const input = gymShape(value, ['timeModel', 'timeRows']);
    if (input.timeModel !== TIMPLAN_TIME_MODEL_V2) bad('unsupported_time_model');
    return { timeModel: TIMPLAN_TIME_MODEL_V2, timeRows: parseTimplanTimeCells(input.timeRows, rows, aplAllowed) };
  });
}
/** Known sums are not completeness. Inactive cells and explicitly forbidden APL are not missing input. */
export function timplanTimeTotals(plan: TimplanTimeSource, aplAllowed = true) {
  const rows = parseGymTimplanRows(plan.rows), timeRows = parseTimplanTimeCells(plan.timeRows, rows, aplAllowed);
  const termMinutes = [0, 0, 0, 0, 0, 0], annualAplMinutes = [0, 0, 0], missingRows: string[] = [];
  let missingSchoolCells = 0, missingAplCells = 0;
  for (const row of rows) {
    const time = timeRows[row.key]; let missing = false;
    time.schoolMinutes.forEach((value, term) => {
      termMinutes[term] += value ?? 0;
      if (row.pointTerms[term] > 0 && value === null) { missingSchoolCells++; missing = true; }
    });
    time.annualAplMinutes.forEach((value, year) => {
      annualAplMinutes[year] += value ?? 0;
      if (aplAllowed && activeYear(row.pointTerms, year) && value === null) { missingAplCells++; missing = true; }
    });
    if (missing) missingRows.push(row.key);
  }
  const schoolMinutes = sum(termMinutes), aplMinutes = sum(annualAplMinutes), totalMinutes = sum([schoolMinutes, aplMinutes]);
  const yearMinutes = annualAplMinutes.map((apl, year) => sum([termMinutes[year * 2], termMinutes[year * 2 + 1], apl]));
  return { termMinutes, annualAplMinutes, yearMinutes, schoolMinutes, aplMinutes, totalMinutes,
    aplPercent: totalMinutes === 0 ? null : aplMinutes * 100 / totalMinutes,
    complete: missingRows.length === 0, missingRows, missingSchoolCells, missingAplCells };
}
export type AnnualAplBalance = { budgetMinutes: number | null; allocatedMinutes: number; remainingMinutes: number | null };
/** Allocations consume an annual budget; they never increase total teaching time or use up school-only cells. */
export function timplanTimePeriodBalance(plan: TimplanTimeSource, value: AplPlan | null, aplAllowed = true) {
  const sourceRows = parseGymTimplanRows(plan.rows), timeRows = parseTimplanTimeCells(plan.timeRows, sourceRows, aplAllowed);
  const apl = value === null ? null : parseAplPlan(value);
  if (!aplAllowed && apl !== null) bad('apl_not_allowed');
  const rows = Object.fromEntries(sourceRows.map(row => [row.key, [0, 1, 2].map(year => activeYear(row.pointTerms, year) && aplAllowed
    ? { budgetMinutes: timeRows[row.key].annualAplMinutes[year], allocatedMinutes: 0, remainingMinutes: timeRows[row.key].annualAplMinutes[year] } : null)])) as Record<string, (AnnualAplBalance | null)[]>;
  const rowMap = new Map(sourceRows.map(row => [row.key, row]));
  for (const period of apl?.periods ?? []) for (const allocation of period.allocations) {
    const sourceRow = rowMap.get(allocation.rowKey);
    if (!sourceRow) bad('unknown_row');
    if (sourceRow.pointTerms[allocation.termIndex] === 0) bad('inactive_term');
    const balance = rows[allocation.rowKey][Math.floor(allocation.termIndex / 2)];
    if (!balance || balance.budgetMinutes === null) bad('allocation_without_budget');
    balance.allocatedMinutes = sum([balance.allocatedMinutes, allocation.gutMinutes]);
    if (balance.allocatedMinutes > balance.budgetMinutes) bad('allocation_exceeds_budget');
    balance.remainingMinutes = balance.budgetMinutes - balance.allocatedMinutes;
  }
  const balances = Object.values(rows).flat().filter((b): b is AnnualAplBalance => b !== null);
  return { rows, allocatedMinutes: sum(balances.map(b => b.allocatedMinutes)), remainingMinutes: sum(balances.map(b => b.remainingMinutes)),
    complete: balances.every(b => b.budgetMinutes !== null), fullyAllocated: balances.every(b => b.remainingMinutes === 0) };
}
/** Proposal only. The caller must obtain an explicit whole-plan review and a server-verified basis before writing it. */
export function projectTimplanTimeTransition(value: unknown, aplValue: AplPlan | null, aplAllowed = true) {
  return guarded(() => {
    const raw = gymObject(value);
    if (Object.hasOwn(raw, 'timeModel') || !Object.hasOwn(raw, 'hours')) bad('not_legacy');
    const plan = parseGymTimplan(value, gymUuid(raw.id));
    if (!('hours' in plan) || !plan.hours) bad('not_legacy');
    if (plan.status !== 'utkast' && plan.status !== 'atersand') bad('locked_plan');
    const apl = aplValue === null ? null : parseAplPlan(aplValue);
    if (!aplAllowed && apl !== null) bad('apl_not_allowed');
    const allocated = Object.fromEntries(plan.rows.map(row => [row.key, [0, 0, 0, 0, 0, 0]]));
    const rowMap = new Map(plan.rows.map(row => [row.key, row]));
    for (const period of apl?.periods ?? []) for (const allocation of period.allocations) {
      const row = rowMap.get(allocation.rowKey);
      if (!row) bad('unknown_row');
      if (row.pointTerms[allocation.termIndex] === 0) bad('inactive_term');
      const total = plan.hours[allocation.rowKey][allocation.termIndex];
      if (total === null) bad('allocation_without_total');
      const minutes = sum([allocated[allocation.rowKey][allocation.termIndex], allocation.gutMinutes]);
      if (minutes > total * 60) bad('allocation_exceeds_total');
      allocated[allocation.rowKey][allocation.termIndex] = minutes;
    }
    const timeRows = Object.fromEntries(plan.rows.map(row => [row.key, {
      schoolMinutes: plan.hours[row.key].map((hours, term) => hours === null ? null : hours * 60 - allocated[row.key][term]),
      annualAplMinutes: [0, 1, 2].map(year => activeYear(row.pointTerms, year) && aplAllowed
        ? allocated[row.key][year * 2] + allocated[row.key][year * 2 + 1] : null),
    }])) as TimplanTimeRows;
    const totals = timplanTimeTotals({ rows: plan.rows, timeRows }, aplAllowed);
    const beforeMinutes = sum(Object.values(plan.hours).flat().map(hours => hours === null ? null : hours * 60));
    if (beforeMinutes !== totals.totalMinutes) bad('transition_total_changed');
    return { timeModel: TIMPLAN_TIME_MODEL_V2, timeRows, beforeMinutes, afterMinutes: totals.totalMinutes, totalPreserved: true as const,
      complete: totals.complete, requiresReview: true as const,
      reviewPoints: [
        ...(aplAllowed && (apl === null || apl.classification !== 'complete') ? ['unclassified_apl'] : []),
        ...(aplAllowed ? ['verify_unrecorded_apl'] : []),
        ...(!totals.complete ? ['incomplete_school_time'] : []),
      ] };
  });
}
/** UI uses whole hours or h:mm. Empty means unplanned, and no rounding is performed. */
export function parseTimplanMinuteInput(value: string, maximum: number = TIMPLAN_TIME_LIMITS.schoolMinutes): number | null | undefined {
  if (typeof value !== 'string' || !Number.isSafeInteger(maximum) || maximum < 0) return undefined;
  if (value === '') return null;
  if (!/^\d{1,6}(?::[0-5]\d)?$/u.test(value)) return undefined;
  const [hours, minutes = '0'] = value.split(':');
  const result = Number(hours) * 60 + Number(minutes);
  return Number.isSafeInteger(result) && result <= maximum ? result : undefined;
}
export function formatTimplanMinutes(value: number | null): string {
  if (value === null) return '';
  if (!Number.isSafeInteger(value) || value < 0) bad();
  return value % 60 === 0 ? String(value / 60) : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
const encoder = new TextEncoder();
function ordinal(a: string, b: string): number {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
/** Content fragment only, not an authorization/basis proof. Commands must additionally bind plan, source, revision and APL snapshot. */
export function timplanTimeHashPayload(plan: TimplanTimeSource, aplAllowed = true): AplCanonicalValue {
  const rows = parseGymTimplanRows(plan.rows), timeRows = parseTimplanTimeCells(plan.timeRows, rows, aplAllowed);
  return ['timplan_time_v2', [...rows].sort((a, b) => ordinal(a.key, b.key)).map(row => [row.key, [...row.pointTerms],
    [...timeRows[row.key].schoolMinutes], [...timeRows[row.key].annualAplMinutes]])];
}
