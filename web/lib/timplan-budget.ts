import { validProgramplanExamination } from './programplan-examination.ts';
import type { GymTimplan } from './gym-timplan.ts';
import { gymTimplanGut } from './gym-timplan-distribution.ts';

/** A planning floor in GUT minutes, not workplace attendance or completed APL weeks. */
export const MINIMUM_VOCATIONAL_APL_MINUTES = 15 * 23 * 60;
export function timplanBudgetMinimum(plan: GymTimplan) {
  const profile = gymTimplanGut(plan);
  // New vocational cohorts need a dated review of their completion component.
  if (!profile || profile.vocational && plan.source.startedOn! >= '2028-07-02' && !validProgramplanExamination(plan.source.examination, plan.source.education.programCode, plan.source.startedOn)) return null;
  return { totalMinutes: profile.hours * 60, aplMinutes: profile.vocational ? MINIMUM_VOCATIONAL_APL_MINUTES : null };
}
export function compareTimplanMinutes(planned: number | null, minimum: number) {
  if (planned === null) return { planned, minimum, missing: null, sufficient: false };
  if (!Number.isSafeInteger(planned) || planned < 0 || !Number.isSafeInteger(minimum) || minimum < 0) throw new TypeError('Invalid time budget');
  return { planned, minimum, missing: Math.max(0, minimum - planned), sufficient: planned >= minimum };
}
