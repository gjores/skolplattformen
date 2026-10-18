import { parseTimplanTimeCells, timplanTimeTotals, type TimplanTimeRows } from './timplan-time.ts';
import { gymArray, gymRowKey, gymInteger, gymObject, gymShape, gymUuid, gymTimplanTotals, type GymTimplan, type GymTimplanLegacy, type GymTimplanV2, type GymTimplanHours, type GymTimplanRow } from './gym-timplan.ts';
import { programplanProfile, VOCATIONAL_GY25_CODES } from './programplan-profile.ts';
import type { AplPlan } from './apl-plan.ts';

export type GymTimplanDistributionMode = 'fill-empty' | 'replace';
export type GymTimplanAplDistribution = { totalHours: number; rowKeys: string[] };
export type GymTimplanDistributionRequest = { planId: string; expectedRevision: number; totalHours: number; mode: GymTimplanDistributionMode; commandId?: string; apl?: GymTimplanAplDistribution };
export function parseGymTimplanAplDistribution(value: unknown): GymTimplanAplDistribution {
  const r = gymShape(value, ['totalHours', 'rowKeys']);
  const rowKeys = gymArray(r.rowKeys, 2000).map(gymRowKey);
  if (!rowKeys.length || new Set(rowKeys).size !== rowKeys.length) throw new TypeError('Choose distinct APL rows');
  return { totalHours: gymInteger(r.totalHours, 24_000_000, 345), rowKeys };
}
/** Conservative suggestions only. The school reviews subject suitability; other rows remain manually plannable. */
export function gymTimplanAplSuggestionRows(plan: Pick<GymTimplan, 'rows'>): GymTimplanRow[] {
  return plan.rows.filter(row => row.rowKind === 'fixed' && ['programmeSpecific', 'orientation', 'specialization'].includes(row.part) && row.pointTerms.some(n => n > 0));
}
export function parseGymTimplanDistributionRequest(value: unknown): GymTimplanDistributionRequest {
  const hasCommand = Object.hasOwn(gymObject(value), 'commandId');
  const hasApl = Object.hasOwn(gymObject(value), 'apl');
  const r = gymShape(value, ['planId', 'expectedRevision', 'totalHours', 'mode', ...(hasCommand ? ['commandId'] : []), ...(hasApl ? ['apl'] : [])]);
  if (r.mode !== 'fill-empty' && r.mode !== 'replace') throw new TypeError('Invalid distribution mode');
  return { planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision), totalHours: gymInteger(r.totalHours, 24_000_000, 1), mode: r.mode, ...(hasCommand ? { commandId: gymUuid(r.commandId) } : {}), ...(hasApl ? { apl: parseGymTimplanAplDistribution(r.apl) } : {}) };
}

/** National programme reference only; never a claim about an individual student's entitlement. */
export function gymTimplanGut(plan: GymTimplan): { hours: number; vocational: boolean } | null {
  if (!plan.source.catalogId || !plan.source.startedOn || plan.source.startedOn < '2025-07-01') return null;
  const code = plan.source.education.programCode;
  const profile = programplanProfile({ code, category: VOCATIONAL_GY25_CODES.some(c => c === code) ? 'VOCATIONAL_PROGRAM' : 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION' });
  return profile && plan.rows.reduce((sum, row) => sum + row.points, 0) === profile.points ? { hours: profile.hours, vocational: profile.vocational } : null;
}

/** Proportional proposal, not a legal subject-hour rule. APL stays within total teaching time. */
export function suggestGymTimplanHours(plan: GymTimplanLegacy, totalHours: number, mode: GymTimplanDistributionMode, apl: AplPlan | null = null) {
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

/** Add to explicitly selected subject/year budgets; never reduce saved APL or infer periods. */
function suggestAnnualApl(plan: GymTimplanV2, timeRows: TimplanTimeRows, totalHours: number, input: GymTimplanAplDistribution) {
  const apl = parseGymTimplanAplDistribution(input), gut = gymTimplanGut(plan);
  if (!gut?.vocational || plan.source.startedOn! >= '2028-07-02') throw new Error('APL-förslag kräver en stödd yrkesutbildning med fullständig programram.');
  if (totalHours < gut.hours) throw new Error(`Ange minst ${gut.hours} timmar totalt för att nå programmets GUT.`);
  const eligible = new Set(gymTimplanAplSuggestionRows(plan).map(row => row.key));
  if (apl.rowKeys.some(key => !eligible.has(key))) throw new Error('Välj specificerade yrkesämnen från den aktuella timplanen.');
  const saved = timplanTimeTotals(plan).aplMinutes;
  if (apl.totalHours * 60 < saved) throw new Error('APL-totalen får inte vara lägre än redan planerad APL.');
  const selected = new Set(apl.rowKeys), cells: { key: string; year: number; weight: number; value: number; order: number }[] = [];
  for (const row of [...plan.rows].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) for (let year = 0; year < 3; year++) {
    const weight = row.pointTerms[year * 2] + row.pointTerms[year * 2 + 1];
    if (!weight) continue;
    timeRows[row.key].annualAplMinutes[year] ??= 0;
    if (selected.has(row.key)) cells.push({ key: row.key, year, weight, value: timeRows[row.key].annualAplMinutes[year]!, order: cells.length });
  }
  let remaining = apl.totalHours * 60 - saved, active = cells.filter(cell => cell.value < 240000);
  if (remaining > active.reduce((sum, cell) => sum + 240000 - cell.value, 0)) throw new Error('APL-tiden ryms inte i de valda ämnenas årskurser. Välj fler ämnen eller en lägre APL-total.');
  while (remaining > 0) {
    const weight = active.reduce((sum, cell) => sum + cell.weight, 0);
    const capped = active.filter(cell => remaining * cell.weight >= (240000 - cell.value) * weight);
    if (capped.length) {
      for (const cell of capped) { remaining -= 240000 - cell.value; cell.value = 240000; }
      active = active.filter(cell => cell.value < 240000); continue;
    }
    const shares = active.map(cell => ({ cell, extra: Math.floor(remaining * cell.weight / weight), remainder: remaining * cell.weight % weight }));
    let leftover = remaining;
    for (const { cell, extra } of shares) { cell.value += extra; leftover -= extra; }
    shares.sort((a, b) => b.remainder - a.remainder || a.cell.order - b.cell.order);
    for (let i = 0; i < leftover; i++) shares[i].cell.value++;
    remaining = 0;
  }
  for (const cell of cells) timeRows[cell.key].annualAplMinutes[cell.year] = cell.value;
}

/** Reserve APL within the total, then distribute school minutes. Optional explicit APL proposal fills the annual frame. */
export function suggestGymTimplanTimeV2(plan: GymTimplanV2, totalHours: number, mode: GymTimplanDistributionMode, apl?: GymTimplanAplDistribution) {
  if (!Number.isSafeInteger(totalHours) || totalHours < 1 || totalHours > 24_000_000) throw new Error('Ange ett positivt heltal för hela timplanens timmar.');
  if (mode !== 'fill-empty' && mode !== 'replace') throw new Error('Välj hur timmarna ska fördelas.');
  const timeRows: TimplanTimeRows = parseTimplanTimeCells(plan.timeRows, plan.rows);
  if (apl) suggestAnnualApl(plan, timeRows, totalHours, apl);
  const reservedApl = timplanTimeTotals({ rows: plan.rows, timeRows }).aplMinutes;
  const cells: { key: string; term: number; weight: number; value: number; order: number }[] = [];
  let keptMinutes = 0;
  for (const row of [...plan.rows].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) for (let term = 0; term < 6; term++) {
    if (row.pointTerms[term] <= 0) continue;
    const saved = timeRows[row.key].schoolMinutes[term];
    if (mode === 'fill-empty' && saved !== null) keptMinutes += saved;
    else cells.push({ key: row.key, term, weight: row.pointTerms[term], value: 0, order: cells.length });
  }
  const target = totalHours * 60;
  if (!plan.rows.length || target < reservedApl + keptMinutes) throw new Error('Totalen är lägre än APL och den skoltid som ska bevaras. Höj totalen eller välj att fördela om skoltimmarna.');
  if (target > reservedApl + keptMinutes + cells.length * 120000) throw new Error(cells.length ? 'Totalen ryms inte inom högst 2 000 skoltimmar per terminscell.' : 'Alla skolceller är ifyllda. Välj att fördela om skoltimmarna.');
  let remaining = target - reservedApl - keptMinutes, active = cells;
  while (remaining > 0) {
    const weight = active.reduce((sum, c) => sum + c.weight, 0);
    const capped = active.filter(c => remaining * c.weight >= (120000 - c.value) * weight);
    if (capped.length) {
      for (const c of capped) { remaining -= 120000 - c.value; c.value = 120000; }
      active = active.filter(c => c.value < 120000); continue;
    }
    const shares = active.map(c => ({ c, extra: Math.floor(remaining * c.weight / weight), remainder: remaining * c.weight % weight }));
    let leftover = remaining;
    for (const { c, extra } of shares) { c.value += extra; leftover -= extra; }
    shares.sort((a, b) => b.remainder - a.remainder || a.c.order - b.c.order);
    for (let i = 0; i < leftover; i++) shares[i].c.value++;
    remaining = 0;
  }
  for (const c of cells) timeRows[c.key].schoolMinutes[c.term] = c.value;
  const totals = timplanTimeTotals({ rows: plan.rows, timeRows });
  if (apl && plan.rows.some(row => [...timeRows[row.key].schoolMinutes, ...timeRows[row.key].annualAplMinutes].every(n => (n ?? 0) === 0))) throw new Error('Minst en rad saknar undervisningstid. Fördela om skoltimmarna eller justera APL-totalen.');
  const changedRows = plan.rows.filter(row => timeRows[row.key].schoolMinutes.some((v, i) => v !== plan.timeRows[row.key].schoolMinutes[i])
    || timeRows[row.key].annualAplMinutes.some((v, i) => v !== plan.timeRows[row.key].annualAplMinutes[i])).map(row => row.key);
  return { timeRows, changedRows, keptMinutes, ...totals };
}
