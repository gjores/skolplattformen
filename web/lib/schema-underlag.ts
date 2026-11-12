/**
 * Schemaunderlag ur tjänstefördelningen (05.2-SM-KOPPLING). Ren funktion: samma läsning ger samma underlag.
 * Motorn får bara löpnummer, tider och kopplingar (K3); namn och appens ID stannar i `labels` på servern.
 * Förvalen K4–K7 står i planen och är antaganden tills skolans egna uppgifter finns.
 */
import type { TjanstPlanRead, TjanstRow } from './tjanst-contract.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaForslagRequest, type SchemaOmission, type SchemaProblem, type SchemaSolution,
  type SchemaTerm } from './schema-contract.ts';

export const SCHEMA_DEFAULTS = { dayStartMin: 8 * 60, dayEndMin: 16 * 60 + 30, days: 5, stepMin: 5, startGridMin: 10, breakMin: 10,
  lunch: { window_start_min: 10 * 60 + 30, window_end_min: 13 * 60 + 30, length_min: 40, teachers: true }, lateAfterMin: 15 * 60 + 30,
  maxLessonMin: 80, minLessonMin: 20, maxLessonsPerWeek: 10, classSize: 25, solveTimeMs: 10_000, weeks: { ht: 18, vt: 20 } } as const;

type Teaching = { title: string; classIds: string[]; ownGroup: string | null; termMinutes: number;
  teachers: { personId: string; minutes: number }[]; together: boolean; vacant: boolean };
export type SchemaLabels = {
  classes: { id: string; name: string }[]; teachers: { id: string; name: string }[];
  lessons: { id: string; activity: string; title: string; classIds: string[]; teacherIds: string[]; durationMin: number; vacant: boolean }[];
};
export type SchemaUnderlag = { problem: SchemaProblem; labels: SchemaLabels; omitted: SchemaOmission[] };

const round5 = (minutes: number) => Math.round(minutes / 5) * 5;
const unique = <T,>(values: T[]) => [...new Set(values)];

/** Veckans pass: lika långa, högst `maxLessonMin`, avrundade till 5 min. Tom lista: för lite tid för ett pass i veckan. */
export function weeklyLessons(termMinutes: number, weeks: number): number[] {
  const d = SCHEMA_DEFAULTS, weekly = round5(termMinutes / weeks);
  if (weekly < d.minLessonMin) return [];
  const count = Math.min(d.maxLessonsPerWeek, Math.ceil(weekly / d.maxLessonMin));
  return Array.from({ length: count }, () => Math.max(d.minLessonMin, round5(weekly / count)));
}

/** Passen fördelas mellan lärare som undervisar en i taget, efter deras tid (största rest). */
function shareLessons(count: number, teachers: Teaching['teachers']): string[] {
  const total = teachers.reduce((sum, t) => sum + t.minutes, 0);
  const parts = teachers.map((t, index) => { const exact = total > 0 ? count * t.minutes / total : count / teachers.length; return { id: t.personId, index, n: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = count - parts.reduce((sum, p) => sum + p.n, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.index - b.index)) { if (left <= 0) break; p.n += 1; left -= 1; }
  return parts.flatMap(p => Array.from({ length: p.n }, () => p.id));
}

function teachings(plan: TjanstPlanRead, term: SchemaTerm): Teaching[] {
  const pick = (ht: number | null, vt: number | null) => term === 'ht' ? ht : vt;
  const sources = [
    ...plan.classes.flatMap(c => c.needs.map(n => ({ sourceKey: n.sourceKey, title: n.label, classIds: [c.classId], ownGroup: null as string | null,
      need: pick(n.needHt, n.needVt), blockId: null as string | null }))),
    ...(plan.groups ?? []).map(g => ({ sourceKey: g.sourceKey, title: g.name, classIds: g.classIds, ownGroup: g.classIds.length ? null : g.groupId,
      need: pick(g.needHt, g.needVt), blockId: g.blockId })),
  ];
  const rowsOf = new Map<string, TjanstRow[]>();
  for (const row of plan.rows) rowsOf.set(row.sourceKey, [...rowsOf.get(row.sourceKey) ?? [], row]);
  const rowById = new Map(plan.rows.map(row => [row.id, row])), sourceOf = new Map(sources.map(s => [s.sourceKey, s]));
  const result: Teaching[] = [], used = new Set<string>();

  // Samläsning: ett pass för radernas klasser och samläsningens lärare.
  for (const joint of plan.joints) {
    const members = unique(joint.rowIds.map(id => rowById.get(id)?.sourceKey).filter((key): key is string => key !== undefined))
      .map(key => sourceOf.get(key)).filter(s => s !== undefined);
    if (!members.length) continue;
    for (const s of members) used.add(s.sourceKey);
    const teachers = joint.teachers.map(t => ({ personId: t.personId, minutes: pick(t.ht, t.vt) ?? 0 }));
    result.push({ title: joint.name, classIds: unique(members.flatMap(s => s.classIds)), ownGroup: members.find(s => s.ownGroup)?.ownGroup ?? null,
      termMinutes: Math.max(...members.map(s => s.need ?? 0), ...(members.every(s => s.need === null) ? teachers.map(t => t.minutes) : [0])),
      teachers, together: true, vacant: teachers.length === 0 });
  }
  const own = (sourceKey: string) => {
    const rows = (rowsOf.get(sourceKey) ?? []).filter(r => r.jointGroupId === null);
    const byPerson = new Map<string, number>();
    for (const r of rows) if (r.personId !== null) byPerson.set(r.personId, (byPerson.get(r.personId) ?? 0) + (pick(r.teacherHt, r.teacherVt) ?? 0));
    return { teachers: [...byPerson].map(([personId, minutes]) => ({ personId, minutes })), vacantMinutes: rows.filter(r => r.personId === null).reduce((sum, r) => sum + (pick(r.teacherHt, r.teacherVt) ?? 0), 0) };
  };
  // Valbart block: alternativen går samtidigt, som ett pass för blockets klasser och lärare (K5).
  const blocks = new Map<string, typeof sources>();
  for (const s of sources) if (s.blockId !== null && !used.has(s.sourceKey)) blocks.set(s.blockId, [...blocks.get(s.blockId) ?? [], s]);
  for (const options of blocks.values()) {
    for (const s of options) used.add(s.sourceKey);
    const staffed = options.map(s => own(s.sourceKey));
    const teachers = unique(staffed.flatMap(x => x.teachers.map(t => t.personId))).map(personId => ({ personId, minutes: 0 }));
    result.push({ title: options.length > 1 ? `Valbart block: ${options.map(s => s.title).join(', ')}` : options[0].title,
      classIds: unique(options.flatMap(s => s.classIds)), ownGroup: null,
      termMinutes: Math.max(...options.map((s, i) => s.need ?? Math.max(0, ...staffed[i].teachers.map(t => t.minutes), staffed[i].vacantMinutes))),
      teachers, together: true, vacant: staffed.some(x => x.teachers.length === 0) });
  }
  for (const s of sources) {
    if (used.has(s.sourceKey)) continue;
    const { teachers, vacantMinutes } = own(s.sourceKey);
    const together = plan.sharing.some(x => x.sourceKey === s.sourceKey && x.mode === 'concurrent');
    // Okänt behov: lärarnas lagda tid får stå för undervisningstiden.
    const staffedMinutes = together ? Math.max(0, ...teachers.map(t => t.minutes)) : teachers.reduce((sum, t) => sum + t.minutes, 0);
    result.push({ title: s.title, classIds: s.classIds, ownGroup: s.ownGroup, termMinutes: s.need ?? staffedMinutes + vacantMinutes,
      teachers, together, vacant: teachers.length === 0 });
  }
  return result;
}

export function buildSchemaUnderlag(plan: TjanstPlanRead, request: Pick<SchemaForslagRequest, 'term' | 'weeks'>): SchemaUnderlag {
  const d = SCHEMA_DEFAULTS;
  const classNo = new Map(plan.classes.map((c, i) => [c.classId, `grupp-${i + 1}`])), className = new Map(plan.classes.map(c => [c.classId, c.name]));
  const teacherNo = new Map(plan.teachers.map((t, i) => [t.personId, `larare-${i + 1}`]));
  const labels: SchemaLabels = {
    classes: plan.classes.map(c => ({ id: classNo.get(c.classId)!, name: c.name })),
    teachers: plan.teachers.map(t => ({ id: teacherNo.get(t.personId)!, name: t.displayName })), lessons: [] };
  const problem: SchemaProblem = {
    version: SCHEMA_CONTRACT_VERSION, id: `forslag-${request.term}-${request.weeks}`,
    time: { step_min: d.stepMin, start_grid_min: d.startGridMin, days: Array.from({ length: d.days }, () => ({ start_min: d.dayStartMin, end_min: d.dayEndMin })) },
    teachers: labels.teachers.map(t => ({ id: t.id })),
    clusters: labels.classes.map(c => ({ id: c.id.replace('grupp', 'kluster'), size: d.classSize })),
    groups: labels.classes.map(c => ({ id: c.id, clusters: [c.id.replace('grupp', 'kluster')] })),
    activities: [], lessons: [],
    rules: { break_min: d.breakMin, lunch: { ...d.lunch }, same_day: 'avoid' }, weights: { late_after_min: d.lateAfterMin },
  };
  const omitted: SchemaOmission[] = [], ownGroups = new Map<string, string>();
  for (const t of teachings(plan, request.term)) {
    const classes = t.classIds.filter(id => classNo.has(id)), names = classes.map(id => className.get(id)!);
    if (t.termMinutes <= 0) { omitted.push({ title: t.title, classes: names, reason: 'no_time' }); continue; }
    const lengths = weeklyLessons(t.termMinutes, request.weeks);
    if (!lengths.length) { omitted.push({ title: t.title, classes: names, reason: 'too_short' }); continue; }
    const groups = classes.map(id => classNo.get(id)!);
    if (!groups.length) {
      // Grupp utan klasser: eget elevkluster, så att den inte krockar med någon klass.
      const key = t.ownGroup ?? `egen-${problem.activities.length}`;
      if (!ownGroups.has(key)) {
        const id = `grupp-${problem.groups.length + 1}`;
        ownGroups.set(key, id); labels.classes.push({ id, name: t.title });
        problem.clusters.push({ id: id.replace('grupp', 'kluster'), size: d.classSize }); problem.groups.push({ id, clusters: [id.replace('grupp', 'kluster')] });
      }
      groups.push(ownGroups.get(key)!);
    }
    const known = t.teachers.filter(x => teacherNo.has(x.personId));
    const turn = !t.together && known.length > 1 ? shareLessons(lengths.length, known) : null;
    const activity = `behov-${problem.activities.length + 1}`;
    problem.activities.push({ id: activity });
    lengths.forEach((durationMin, i) => {
      const id = `pass-${problem.lessons.length + 1}`;
      const teacherIds = (turn ? [turn[i]] : known.map(x => x.personId)).map(personId => teacherNo.get(personId)!);
      problem.lessons.push({ id, activity, duration_min: durationMin, teachers: teacherIds, groups });
      labels.lessons.push({ id, activity, title: t.title, classIds: groups, teacherIds, durationMin, vacant: t.vacant });
    });
  }
  return { problem, labels, omitted };
}

/** Motorns klartext bär löpnummer; här byts de mot namn innan texten visas. */
function named(message: string, labels: SchemaLabels): string {
  const name = new Map<string, string>([...labels.classes.map(c => [c.id, c.name] as const), ...labels.classes.map(c => [c.id.replace('grupp', 'kluster'), c.name] as const),
    ...labels.teachers.map(t => [t.id, t.name] as const), ...labels.lessons.map(l => [l.id, l.title] as const), ...labels.lessons.map(l => [l.activity, l.title] as const)]);
  return message.replace(/\b(?:grupp|kluster|larare|pass|behov)-\d+\b/giu, id => name.get(id.toLowerCase()) ?? id);
}

export function schemaForslag(plan: TjanstPlanRead, request: SchemaForslagRequest, underlag: SchemaUnderlag, solution: SchemaSolution): SchemaForslag {
  const at = new Map(solution.placements.map(p => [p.lesson, p]));
  const lessons = underlag.labels.lessons.map(({ activity: _activity, ...l }) => ({ ...l, day: at.get(l.id)?.day ?? null, startMin: at.get(l.id)?.startMin ?? null }));
  const usedTeachers = new Set(lessons.flatMap(l => l.teacherIds)), usedClasses = new Set(lessons.flatMap(l => l.classIds));
  return {
    contractVersion: SCHEMA_CONTRACT_VERSION, unitId: request.unitId, schoolYear: request.schoolYear, term: request.term, weeks: request.weeks, schoolName: plan.schoolName,
    basis: plan.version ? { versionNo: plan.version.versionNo, status: plan.version.status } : null,
    status: solution.status, days: underlag.problem.time.days.map(day => ({ startMin: day.start_min, endMin: day.end_min })),
    classes: underlag.labels.classes.filter(c => usedClasses.has(c.id)), teachers: underlag.labels.teachers.filter(t => usedTeachers.has(t.id)),
    lessons, omitted: underlag.omitted, diagnoses: solution.diagnoses.map(x => ({ message: named(x.message, underlag.labels), proof: x.proof })),
    metrics: { lessons: lessons.length, placed: solution.placements.length, unplaced: solution.unplaced.length,
      studentGapMin: solution.metrics.studentGapMin, teacherGapMin: solution.metrics.teacherGapMin },
    elapsedMs: solution.elapsedMs,
  };
}
