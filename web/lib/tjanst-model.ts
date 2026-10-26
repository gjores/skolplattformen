import type { GymTimplanHours } from './gym-timplan.ts';
import type { SchoolMinutes } from './timplan-time.ts';
import { nationalTimplan } from './timplan-model.ts';
import { TjanstContractError, type TjanstClass, type TjanstJoint, type TjanstNeedBasis, type TjanstRow, type TjanstSpecial,
  type TjanstSums, type TjanstTermMinutes } from './tjanst-contract.ts';

export { tjanstCanonicalSerialize, tjanstHashCanonical, tjanstPayloadHash } from './tjanst-contract.ts';

/**
 * Behov är elevtid ur timplanen och aldrig lärartid (D-04, D-06). Okänt behov är null och ingår aldrig som 0.
 * En timme är 60 minuter. Ingen kapacitetsjämförelse mot timmar görs (D-10, D-12).
 */
export type TjanstTerm = 'ht' | 'vt';
export type TjanstCalendar = { status: 'faststalld' | 'utkast'; htSchoolDays: number; vtSchoolDays: number };
export type TjanstNeedSource =
  /** Gy25 v2: läsår N i kullen (1–3) läser HT ur index 2(N-1) och VT ur 2(N-1)+1. */
  | { kind: 'gy_v2'; schoolMinutes: SchoolMinutes; yearInCohort: number }
  /** Gy-plan utan v2-tid (kontrollpunktsbeslut A): årets timmar delas 50/50 som GR och märks even_split. */
  | { kind: 'gy_legacy'; hours: GymTimplanHours; yearInCohort: number }
  /** GR: årstimmar för kopplingens ak{n}, 50/50 (D-22). */
  | { kind: 'gr'; annualHours: number | null }
  /** IM: timmar per vecka × skolveckor (skoldagar/5) ur fastställd läsårskalender, annars null (D-22). */
  | { kind: 'im'; weeklyHours: number | null; calendar: TjanstCalendar | null };
export type TjanstNeedValue = { needHt: number | null; needVt: number | null; needBasis: TjanstNeedBasis };
export type TjanstTeacherSums = { teaching: TjanstTermMinutes & { year: number }; special: TjanstTermMinutes & { year: number }; total: TjanstTermMinutes & { year: number } };
export type TjanstCoverage = { sourceKey: string; need: TjanstTermMinutes | null; covered: TjanstTermMinutes; vacant: TjanstTermMinutes; teachers: number };
export type TjanstCapacityViolation = { from: string; to: string | null; sum: number; percent: number } | { from: string; to: string | null; outside: true };

function bad(reason = 'tjanst_invalid'): never { throw new TjanstContractError(reason); }
function safe(n: number): number { if (!Number.isSafeInteger(n) || n < 0) bad(); return n; }
function year(n: number): number { if (!Number.isInteger(n) || n < 1 || n > 3) bad(); return n; }
const add = (a: TjanstTermMinutes, b: TjanstTermMinutes): TjanstTermMinutes => ({ ht: safe(a.ht + b.ht), vt: safe(a.vt + b.vt) });
const zero = (): TjanstTermMinutes => ({ ht: 0, vt: 0 });
const withYear = (t: TjanstTermMinutes) => ({ ...t, year: safe(t.ht + t.vt) });

export function tjanstNeed(source: TjanstNeedSource): TjanstNeedValue {
  if (source.kind === 'gy_v2') {
    const i = 2 * (year(source.yearInCohort) - 1);
    return { needHt: source.schoolMinutes[i] ?? null, needVt: source.schoolMinutes[i + 1] ?? null, needBasis: 'terms' };
  }
  if (source.kind === 'gy_legacy') {
    const i = 2 * (year(source.yearInCohort) - 1), ht = source.hours[i], vt = source.hours[i + 1];
    if (ht === null && vt === null) return { needHt: null, needVt: null, needBasis: 'even_split' };
    const half = ((ht ?? 0) + (vt ?? 0)) * 30;
    return { needHt: safe(half), needVt: safe(half), needBasis: 'even_split' };
  }
  if (source.kind === 'gr') {
    if (source.annualHours === null) return { needHt: null, needVt: null, needBasis: 'even_split' };
    return { needHt: safe(source.annualHours * 30), needVt: safe(source.annualHours * 30), needBasis: 'even_split' };
  }
  const c = source.calendar;
  if (source.weeklyHours === null || c === null || c.status !== 'faststalld') return { needHt: null, needVt: null, needBasis: 'weekly_calendar' };
  // h/vecka × 60 min × skoldagar / 5 = h × 12 × skoldagar: exakt i hela minuter.
  return { needHt: safe(source.weeklyHours * 12 * safe(c.htSchoolDays)), needVt: safe(source.weeklyHours * 12 * safe(c.vtSchoolDays)), needBasis: 'weekly_calendar' };
}
export function needForTerm(source: TjanstNeedSource, term: TjanstTerm): number | null {
  const need = tjanstNeed(source); return term === 'ht' ? need.needHt : need.needVt;
}
/** GR: grade 1–3 carries NO/SO as group rows, grade 4–9 as member rows; never both (no double counting). */
export function grNeedRowIds(grade: number): string[] {
  if (!Number.isInteger(grade) || grade < 1 || grade > 9) bad();
  const block = new Set(nationalTimplan.filter(s => !s.code).map(s => s.id));
  return [...nationalTimplan.filter(s => grade <= 3 ? !s.group : !block.has(s.id)).map(s => s.id), 'skolansval'];
}
/** Gy rows: subject levels and choice blocks are needs; meta rows and APL minutes are not. */
export function gyNeedRowKey(rowKey: string): boolean { return !rowKey.startsWith('meta:'); }

/** Förifyllning = behov minus redan fördelat, minst 0. Okänt behov ger ingen förifyllning (null). */
export function prefill(need: number | null, allocated: number): number | null {
  return need === null ? null : Math.max(0, need - safe(allocated));
}
/** Avvikelse = lärartid minus behov; null when need is unknown. */
export function deviation(teacher: number, need: number | null): number | null {
  return need === null ? null : safe(teacher) - need;
}
function jointMap(joints: TjanstJoint[]): Map<string, TjanstJoint> {
  const map = new Map<string, TjanstJoint>();
  for (const joint of joints) for (const id of joint.rowIds) { if (map.has(id)) bad('tjanst_joint_already'); map.set(id, joint); }
  return map;
}
/** Samläst tid räknas en gång per grupp och lärare; kopplade raders egen tid ingår inte medan raden är kopplad. */
/** D-28: en samläsning har samma lärare för alla rader, eller bara vakanta rader. Äldre blandade grupper visas, men skapas inte. */
export function mixedTeachers(rows: TjanstRow[]): boolean { return new Set(rows.map(r => r.personId ?? 'vakant')).size > 1; }
export function jointHasMixedTeachers(joint: TjanstJoint, rows: TjanstRow[]): boolean {
  return joint.teachers.length > 1 || mixedTeachers(rows.filter(r => r.jointGroupId === joint.id));
}
/** 05.1-27: varningar för en samläsning med samma lärare. De stoppar inte sparning; rektor beslutar medvetet. */
export type TjanstJointWarnings = {
  time: { classId: string; ht: number; vt: number }[] | null;
  apl: { withApl: string[]; withoutApl: string[]; unknown: string[] } | null;
};
export function jointWarnings(rows: TjanstRow[], classes: { classId: string; aplMinutes: number | null }[]): TjanstJointWarnings {
  const known = rows.filter(r => r.needHt !== null && r.needVt !== null);
  const distinct = new Set(known.map(r => `${r.needHt}:${r.needVt}`));
  const time = distinct.size > 1 ? [...new Map(known.map(r => [r.classId, { classId: r.classId, ht: r.needHt!, vt: r.needVt! }])).values()] : null;
  const ids = [...new Set(rows.map(r => r.classId))], apl = (id: string) => classes.find(c => c.classId === id)?.aplMinutes ?? null;
  const withApl = ids.filter(id => (apl(id) ?? 0) > 0), withoutApl = ids.filter(id => apl(id) === 0), unknown = ids.filter(id => apl(id) === null);
  return { time, apl: withApl.length > 0 && (withoutApl.length > 0 || unknown.length > 0) ? { withApl, withoutApl, unknown } : null };
}
export function teacherSums(personId: string, rows: TjanstRow[], specials: TjanstSpecial[], joints: TjanstJoint[]): TjanstTeacherSums {
  const joined = jointMap(joints);
  let teaching = zero(), special = zero();
  for (const row of rows) if (row.personId === personId && !joined.has(row.id)) teaching = add(teaching, { ht: row.teacherHt, vt: row.teacherVt });
  for (const joint of joints) for (const t of joint.teachers) if (t.personId === personId) teaching = add(teaching, t);
  for (const s of specials) if (s.personId === personId) special = add(special, s);
  return { teaching: withYear(teaching), special: withYear(special), total: withYear(add(teaching, special)) };
}
/** Täckning per behov: egna rader plus, för samläsning, gruppens hela lärartid en gång per grupp. Vakanta rader täcker inte. */
export function coverage(sourceKey: string, need: TjanstTermMinutes | null, rows: TjanstRow[], joints: TjanstJoint[]): TjanstCoverage {
  const joined = jointMap(joints), seen = new Set<string>(), teachers = new Set<string>();
  let covered = zero(), vacant = zero();
  for (const row of rows) {
    if (row.sourceKey !== sourceKey) continue;
    const joint = joined.get(row.id);
    if (joint) {
      if (seen.has(joint.id)) continue; seen.add(joint.id);
      for (const t of joint.teachers) { covered = add(covered, t); teachers.add(t.personId); }
    } else if (row.personId === null) vacant = add(vacant, { ht: row.teacherHt, vt: row.teacherVt });
    else { covered = add(covered, { ht: row.teacherHt, vt: row.teacherVt }); teachers.add(row.personId); }
  }
  return { sourceKey, need, covered, vacant, teachers: teachers.size };
}
function knownNeed(ht: number | null, vt: number | null): TjanstTermMinutes | null {
  return ht === null && vt === null ? null : { ht: ht ?? 0, vt: vt ?? 0 };
}
export function formatHours(minutes: number): string {
  const h = Math.floor(safe(minutes) / 60), m = minutes % 60;
  if (m === 0) return `${h.toLocaleString('sv-SE')} h`;
  return `${(minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} h`;
}
/** "100 av 100 h · 2 lärare"; okänt behov visas aldrig som 0. */
export function coverageLabel(c: TjanstCoverage): string {
  const covered = formatHours(c.covered.ht + c.covered.vt).replace(/ h$/u, ''), teachers = `${c.teachers} lärare`;
  return c.need === null ? `${covered} h · behov okänt · ${teachers}` : `${covered} av ${formatHours(c.need.ht + c.need.vt)} · ${teachers}`;
}
/** Skolans summor. Ej fördelad tid räknas bara på kopplade klasser med känt behov; okopplade klasser räknas separat. */
export function schoolSums(classes: TjanstClass[], rows: TjanstRow[], specials: TjanstSpecial[], joints: TjanstJoint[]): TjanstSums {
  const joined = jointMap(joints);
  const unallocated = zero();
  let teaching = zero(), special = zero(), vacant = zero();
  for (const row of rows) if (!joined.has(row.id)) {
    if (row.personId === null) vacant = add(vacant, { ht: row.teacherHt, vt: row.teacherVt });
    else teaching = add(teaching, { ht: row.teacherHt, vt: row.teacherVt });
  }
  for (const joint of joints) for (const t of joint.teachers) teaching = add(teaching, t);
  for (const s of specials) if (s.personId === null) vacant = add(vacant, s); else special = add(special, s);
  for (const c of classes) if (c.link) for (const n of c.needs) {
    const cov = coverage(n.sourceKey, knownNeed(n.needHt, n.needVt), rows, joints);
    if (n.needHt !== null) unallocated.ht = safe(unallocated.ht + Math.max(0, n.needHt - cov.covered.ht));
    if (n.needVt !== null) unallocated.vt = safe(unallocated.vt + Math.max(0, n.needVt - cov.covered.vt));
  }
  return { teaching, special, vacant, unallocated, unlinkedClasses: classes.filter(c => c.link === null).length };
}

export type TjanstEmploymentPeriod = { percent: number; startsOn: string; endsOn: string | null };
const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const covers = (p: { startsOn: string; endsOn: string | null }, d: string) => p.startsOn <= d && (p.endsOn === null || d <= p.endsOn);
/**
 * D-12: för varje datum får summan av överlappande skolandelar inte överstiga anställningens grad, och en andel får
 * inte ligga utanför anställningen. Prövas vid varje gränsdatum, så att intervall utan ändring inte behöver räknas dag för dag.
 */
export function capacityViolations(employment: TjanstEmploymentPeriod, duties: TjanstEmploymentPeriod[]): TjanstCapacityViolation[] {
  const all = [employment, ...duties];
  if (all.some(p => !Number.isInteger(p.percent) || p.percent < 1 || p.percent > 100 || p.endsOn !== null && p.endsOn < p.startsOn)) bad();
  const points = [...new Set(all.flatMap(p => [p.startsOn, ...(p.endsOn ? [nextDay(p.endsOn)] : [])]))].sort();
  const result: TjanstCapacityViolation[] = [];
  for (let i = 0; i < points.length; i++) {
    const from = points[i], to = i + 1 < points.length ? new Date(Date.parse(points[i + 1] + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : null;
    const active = duties.filter(d => covers(d, from));
    if (!active.length) continue;
    if (!covers(employment, from)) { result.push({ from, to, outside: true }); continue; }
    const sum = active.reduce((n, d) => n + d.percent, 0);
    if (sum > employment.percent) result.push({ from, to, sum, percent: employment.percent });
  }
  return result;
}
