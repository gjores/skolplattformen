import { currentSchoolYear, isValidDate, schoolYearRange } from './pupil-register-model.ts';
import type { GymTimplan } from './gym-timplan.ts';

/** Product bounds, independent of calendars and pupil-register selection. */
export const PLANNING_YEAR_LIMITS = { minimum: 2000, maximum: 2100 } as const;
export type PlanningDiagnosis = 'missing-start' | 'invalid-start' | 'unverified-start' | 'conflicting-start'
  | 'outside-three-years' | 'allocation-before-start' | 'missing-binding' | 'binding-year-mismatch'
  | 'unverified-column-map' | 'missing-column' | 'missing-hours' | 'missing-points' | 'missing-plan' | 'missing-source'
  | 'missing-class' | 'ambiguous-class' | 'unknown-row' | 'inactive-hours' | 'forecast';
export type StartEvidence = {
  provenance: 'program-version' | 'timplan-source' | 'verified-academic-year' | 'legacy';
  startedOn: string | null;
  academicYear: number | null;
};
export type PlanningRelation = 'new' | 'continuing' | 'future' | 'finished' | 'unknown';
export type PlanningTerm = { index: number; label: string; startsOn: string; endsBefore: string };
export type GymYearProjection = {
  schoolYear: number; startedOn: string | null; startAcademicYear: number | null;
  relativeYear: 1 | 2 | 3 | null; termIndices: [number, number] | null;
  relation: PlanningRelation; terms: PlanningTerm[]; reviewTermIndices: number[]; diagnostics: PlanningDiagnosis[];
};
export type GrColumnMap = { kind: 'unknown' } | {
  kind: 'verified'; planId: string; version: number;
  provenance: 'frozen-plan' | 'verified-original'; columnIds: string[];
};
export type GrYearBinding = { planId: string; version: number; applicationYear: number; columnId: string };
export type GrYearProjection = {
  grade: number | null; annualIndex: number | null; canTargetYearCell: boolean; diagnostics: PlanningDiagnosis[];
};

export function planningYearRange(year: number): { startsOn: string; endsBefore: string } {
  if (!Number.isSafeInteger(year) || year < PLANNING_YEAR_LIMITS.minimum || year > PLANNING_YEAR_LIMITS.maximum)
    throw new TypeError('Planeringsläsåret måste ligga mellan 2000 och 2100.');
  return schoolYearRange(year);
}
export function planningYearLabel(year: number): string {
  planningYearRange(year);
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}
/** Explicit timezone on input prevents dependence on the browser/host timezone. */
export function stockholmDate(instant: string): string {
  if (typeof instant !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(instant)
    || !isValidDate(instant.slice(0, 10)) || Number(instant.slice(11, 13)) > 23
    || Number(instant.slice(14, 16)) > 59 || Number(instant.slice(17, 19)) > 59
    || !Number.isFinite(Date.parse(instant))) throw new TypeError('Ogiltig servertid.');
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instant));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (!isValidDate(date)) throw new TypeError('Ogiltig servertid.');
  return date;
}
export function planningYearAt(instant: string): number {
  const year = currentSchoolYear(stockholmDate(instant));
  planningYearRange(year);
  return year;
}

/** Never consults cohort text, today's education metadata, or an implicit current date. */
export function projectGymYear(schoolYear: number, start: StartEvidence, termValues?: readonly (number | null)[]): GymYearProjection {
  planningYearRange(schoolYear);
  if (termValues && (termValues.length !== 6 || termValues.some(v => v !== null && (!Number.isFinite(v) || v < 0))))
    throw new TypeError('Ogiltig terminsfördelning.');
  const result: GymYearProjection = { schoolYear, startedOn: null, startAcademicYear: null, relativeYear: null,
    termIndices: null, relation: 'unknown', terms: [], reviewTermIndices: [], diagnostics: [] };
  const unknown = (diagnosis: PlanningDiagnosis) => { result.diagnostics.push(diagnosis); return result; };
  if (start.provenance === 'legacy') return unknown('unverified-start');
  if (!['program-version', 'timplan-source', 'verified-academic-year'].includes(start.provenance)) return unknown('unverified-start');
  if (start.startedOn !== null && !isValidDate(start.startedOn)) return unknown('invalid-start');
  result.startedOn = start.startedOn;
  if (start.academicYear !== null && (!Number.isSafeInteger(start.academicYear) || start.academicYear < 1 || start.academicYear > 9996))
    return unknown('invalid-start');
  // Date provenance requires a date. A separate explicitly verified academic year can be used without one.
  if (start.startedOn === null && (start.provenance !== 'verified-academic-year' || start.academicYear === null)) return unknown('missing-start');
  let datedYear: number | null = null;
  if (start.startedOn !== null) {
    try { datedYear = currentSchoolYear(start.startedOn); } catch { return unknown('invalid-start'); }
  }
  if (datedYear !== null && start.academicYear !== null && datedYear !== start.academicYear) return unknown('conflicting-start');
  const academicYear = datedYear ?? start.academicYear;
  if (academicYear === null || academicYear < 1 || academicYear > 9996) return unknown('invalid-start');
  result.startAcademicYear = academicYear;
  result.terms = Array.from({ length: 6 }, (_, index) => {
    const year = academicYear + Math.floor(index / 2), autumn = index % 2 === 0;
    return { index, label: `${autumn ? 'HT' : 'VT'} ${autumn ? year : year + 1}`,
      startsOn: `${String(autumn ? year : year + 1).padStart(4, '0')}-${autumn ? '07' : '01'}-01`,
      endsBefore: `${String(year + 1).padStart(4, '0')}-${autumn ? '01' : '07'}-01` };
  });
  const relative = schoolYear - academicYear + 1;
  result.relation = relative < 1 ? 'future' : relative > 3 ? 'finished' : relative === 1 ? 'new' : 'continuing';
  if (relative >= 1 && relative <= 3) {
    result.relativeYear = relative as 1 | 2 | 3;
    result.termIndices = [(relative - 1) * 2, (relative - 1) * 2 + 1];
  } else result.diagnostics.push('outside-three-years');
  // Winter/spring starts can have allocations wholly or partly before the actual start.
  // These require review, rather than silently moving a saved cell to another term.
  if (termValues && start.startedOn !== null && start.startedOn.slice(5, 7) < '07') {
    result.reviewTermIndices = result.terms.filter(t => t.startsOn < start.startedOn! && (termValues[t.index] ?? 0) > 0).map(t => t.index);
    if (result.reviewTermIndices.length) result.diagnostics.push('allocation-before-start');
  }
  return result;
}
export function projectGymTimplanYear(schoolYear: number, plan: Pick<GymTimplan, 'source'>, termValues?: readonly (number | null)[]): GymYearProjection {
  return projectGymYear(schoolYear, { provenance: 'timplan-source', startedOn: plan.source.startedOn, academicYear: null }, termValues);
}

export function projectGrYear(schoolYear: number, binding: GrYearBinding | null, map: GrColumnMap): GrYearProjection {
  planningYearRange(schoolYear);
  const unknown = (diagnosis: PlanningDiagnosis, grade: number | null = null): GrYearProjection =>
    ({ grade, annualIndex: null, canTargetYearCell: false, diagnostics: [diagnosis] });
  if (!binding) return unknown('missing-binding');
  if (binding.applicationYear !== schoolYear) return unknown('binding-year-mismatch');
  if (!/^ak[1-9]$/u.test(binding.columnId)) return unknown('missing-column');
  const grade = Number(binding.columnId.slice(2));
  if (map.kind !== 'verified' || !['frozen-plan', 'verified-original'].includes(map.provenance)
    || map.planId !== binding.planId || map.version !== binding.version || map.columnIds.length === 0 || map.columnIds.length > 9
    || map.columnIds.some(id => !/^ak[1-9]$/u.test(id)) || new Set(map.columnIds).size !== map.columnIds.length)
    return unknown('unverified-column-map', grade);
  const annualIndex = map.columnIds.indexOf(binding.columnId);
  if (annualIndex < 0) return unknown('missing-column', grade);
  return { grade, annualIndex, canTargetYearCell: true, diagnostics: [] };
}
export function projectImYear(schoolYear: number): { schoolYear: number; relativeYear: null; termIndices: null; measure: 'hours-per-week' } {
  planningYearRange(schoolYear);
  return { schoolYear, relativeYear: null, termIndices: null, measure: 'hours-per-week' };
}
