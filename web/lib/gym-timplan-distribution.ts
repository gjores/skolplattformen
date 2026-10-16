import { gymInteger, gymShape, gymUuid, gymTimplanTotals, type GymTimplan, type GymTimplanHours } from './gym-timplan.ts';
import { programplanProfile, VOCATIONAL_GY25_CODES } from './programplan-profile.ts';
import type { AplPlan } from './apl-plan.ts';

export type GymTimplanDistributionMode = 'fill-empty' | 'replace';
export type GymTimplanDistributionRequest = { planId: string; expectedRevision: number; totalHours: number; mode: GymTimplanDistributionMode };
export function parseGymTimplanDistributionRequest(value: unknown): GymTimplanDistributionRequest {
  const r = gymShape(value, ['planId', 'expectedRevision', 'totalHours', 'mode']);
  if (r.mode !== 'fill-empty' && r.mode !== 'replace') throw new TypeError('Invalid distribution mode');
  return { planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision), totalHours: gymInteger(r.totalHours, 24_000_000, 1), mode: r.mode };
}

/** National programme reference only; never a claim about an individual student's entitlement. */
export function gymTimplanGut(plan: GymTimplan): { hours: number; vocational: boolean } | null {
  if (!plan.source.catalogId || !plan.source.startedOn || plan.source.startedOn < '2025-07-01') return null;
  const code = plan.source.education.programCode;
  const profile = programplanProfile({ code, category: VOCATIONAL_GY25_CODES.some(c => c === code) ? 'VOCATIONAL_PROGRAM' : 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION' });
  return profile && plan.rows.reduce((sum, row) => sum + row.points, 0) === profile.points ? { hours: profile.hours, vocational: profile.vocational } : null;
}

/** Proportional proposal, not a legal subject-hour rule. APL stays within total teaching time. */
export function suggestGymTimplanHours(plan: GymTimplan, totalHours: number, mode: GymTimplanDistributionMode, apl: AplPlan | null = null) {
  if (!Number.isSafeInteger(totalHours) || totalHours < 1 || totalHours > 24_000_000) throw new Error('Ange ett positivt heltal för hela timplanens timmar.');
  if (mode !== 'fill-empty' && mode !== 'replace') throw new Error('Välj hur timmarna ska fördelas.');
  const hours: Record<string, GymTimplanHours> = {}, minutes = new Map<string, number>();
  for (const period of apl?.periods ?? []) for (const a of period.allocations) {
    const row = plan.rows.find(row => row.key === a.rowKey);
    if (!row || !row.pointTerms[a.termIndex]) throw new Error('APL-underlaget behöver granskas innan timmar kan autofördelas.');
    const key = `${a.rowKey}:${a.termIndex}`;
    minutes.set(key, (minutes.get(key) ?? 0) + a.gutMinutes);
  }
  const cells: { key: string; term: number; weight: number; value: number; order: number }[] = [];
  let keptHours = 0, minimum = 0;
  for (const row of [...plan.rows].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) {
    hours[row.key] = [null, null, null, null, null, null];
    for (let term = 0; term < 6; term++) {
      if (row.pointTerms[term] <= 0) continue;
      const floor = Math.ceil((minutes.get(`${row.key}:${term}`) ?? 0) / 60), saved = plan.hours[row.key][term];
      if (floor > 2000) throw new Error('APL-tiden ryms inte inom cellens högsta antal timmar.');
      if (mode === 'fill-empty' && saved !== null) {
        if (saved < floor) throw new Error('Sparad undervisningstid är lägre än APL-tiden. Välj att fördela om hela planen eller rätta underlaget.');
        hours[row.key][term] = saved; keptHours += saved; minimum += saved;
      } else { cells.push({ key: row.key, term, weight: row.pointTerms[term], value: floor, order: cells.length }); minimum += floor; }
    }
  }
  if (!plan.rows.length) throw new Error('Timplanen saknar rader att fördela timmar på.');
  if (totalHours < minimum) throw new Error(`Totalen behöver vara minst ${minimum.toLocaleString('sv-SE')} timmar för att bevara ${mode === 'fill-empty' ? 'angivna timmar och APL-tid' : 'sparad APL-tid'}.`);
  if (totalHours > keptHours + cells.length * 2000) throw new Error(cells.length ? 'Totalen är för stor. Högst 2 000 timmar kan fördelas per terminscell.' : 'Alla celler är ifyllda. Välj att fördela om hela planen för att ändra totalen.');
  let remaining = totalHours - minimum, active = cells.filter(c => c.value < 2000);
  // Capped largest remainder: distribute around APL floors, then round once without losing hours.
  while (remaining > 0) {
    const weight = active.reduce((sum, c) => sum + c.weight, 0);
    const capped = active.filter(c => remaining * c.weight >= (2000 - c.value) * weight);
    if (capped.length) {
      for (const c of capped) { remaining -= 2000 - c.value; c.value = 2000; }
      active = active.filter(c => c.value < 2000); continue;
    }
    const shares = active.map(c => ({ c, extra: Math.floor(remaining * c.weight / weight), remainder: remaining * c.weight % weight }));
    let leftover = remaining;
    for (const { c, extra } of shares) { c.value += extra; leftover -= extra; }
    shares.sort((a, b) => b.remainder - a.remainder || a.c.order - b.c.order);
    for (let i = 0; i < leftover; i++) shares[i].c.value++;
    remaining = 0;
  }
  for (const c of cells) hours[c.key][c.term] = c.value;
  const totals = gymTimplanTotals({ rows: plan.rows, hours });
  const changedRows = plan.rows.filter(row => hours[row.key].some((v, i) => v !== plan.hours[row.key][i])).map(row => row.key);
  return { hours, changedRows, keptHours, terms: totals.terms, total: totals.total };
}
