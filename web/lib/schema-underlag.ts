/**
 * Schemaunderlag ur tjänstefördelningen (05.2-SM-KOPPLING). Ren funktion: samma läsning ger samma underlag.
 * Motorn får bara löpnummer, tider och kopplingar (K3); namn och appens ID stannar i `labels` på servern.
 * Elevernas gruppmedlemskap avgör vilka pass som inte får gå samtidigt, och terminens tid räknas ur läsårskalenderns
 * skoldagar (05.2-SM-ELEVER-KALENDER, E1–E6). Skoldagens ramar (K7) är antaganden tills skolans egna uppgifter finns.
 */
import type { TjanstPlanRead, TjanstRow } from './tjanst-contract.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaForslagRequest, type SchemaMembers, type SchemaOmission, type SchemaProblem, type SchemaSolution,
  type SchemaTerm, type SchemaTime } from './schema-contract.ts';

export const SCHEMA_DEFAULTS = { dayStartMin: 8 * 60, dayEndMin: 16 * 60 + 30, days: 5, stepMin: 5, startGridMin: 10, breakMin: 10,
  lunch: { window_start_min: 10 * 60 + 30, window_end_min: 13 * 60 + 30, length_min: 40, teachers: true }, lateAfterMin: 15 * 60 + 30,
  maxLessonMin: 80, minLessonMin: 20, maxLessonsPerWeek: 10, classSize: 25, solveTimeMs: 10_000, weeks: { ht: 18, vt: 20 } } as const;

/** En del av ett pass: en klass, eller en grupp vars elever avgör vilka som är upptagna. */
type Part = { classIds: string[]; groupId: string | null; alone: boolean };
type Teaching = { title: string; parts: Part[]; termMinutes: number;
  teachers: { personId: string; minutes: number }[]; together: boolean; vacant: boolean };
export type SchemaLabels = {
  classes: { id: string; name: string }[]; teachers: { id: string; name: string }[];
  /** Namn på elevkluster och elevgrupper, för motorns klartext. */
  names: Record<string, string>;
  activities: { id: string; title: string; classes: string[]; needMin: number; weeklyMin: number; perWeekday: number[] }[];
  lessons: { id: string; activity: string; title: string; classIds: string[]; teacherIds: string[]; durationMin: number; vacant: boolean }[];
};
export type SchemaBasis = { members: SchemaMembers | null; time: SchemaTime };
export type SchemaUnderlag = { problem: SchemaProblem; labels: SchemaLabels; omitted: SchemaOmission[]; time: SchemaTime; members: SchemaForslag['members'] };

/** Utan läsårskalender: ett fast antal lika veckor (förval). */
export function defaultSchemaTime(term: SchemaTerm): SchemaTime {
  return { source: 'forval', version: null, status: null, current: false, term: null, perWeekday: Array.from({ length: SCHEMA_DEFAULTS.days }, () => SCHEMA_DEFAULTS.weeks[term]), classes: {} };
}
/** Elever och medlemskap ur valbara block och undervisningsgrupper som ett underlag. Namn tas inte med. */
export function mergeSchemaMembers(sources: { pupils: { id: string; classIds: string[] }[] | null; memberships: SchemaMembers['memberships'] | null }[]): SchemaMembers | null {
  const pupils = new Map<string, Set<string>>(), memberships: SchemaMembers['memberships'] = [];
  let known = false;
  for (const source of sources) {
    if (source.pupils === null || source.memberships === null) continue;
    known = true;
    for (const p of source.pupils) pupils.set(p.id, new Set([...pupils.get(p.id) ?? [], ...p.classIds]));
    for (const m of source.memberships) memberships.push({ groupId: m.groupId, pupilId: m.pupilId, startsOn: m.startsOn, endsOn: m.endsOn });
  }
  return known ? { pupils: [...pupils].map(([id, classIds]) => ({ id, classIds: [...classIds] })), memberships } : null;
}

const round5 = (minutes: number) => Math.round(minutes / 5) * 5;
const unique = <T,>(values: T[]) => [...new Set(values)];

/**
 * Veckans pass: högst `maxLessonMin` långa och så lika som 5-minutersrutnätet tillåter; summan är veckotiden avrundad till 5 min.
 * Tom lista: för lite tid för ett pass i veckan.
 */
export function weeklyLessons(termMinutes: number, weeks: number): number[] {
  const d = SCHEMA_DEFAULTS, weekly = weeks > 0 ? round5(termMinutes / weeks) : 0;
  if (weekly < d.minLessonMin) return [];
  const count = Math.min(d.maxLessonsPerWeek, Math.ceil(weekly / d.maxLessonMin));
  const base = Math.min(d.maxLessonMin, Math.floor(weekly / count / 5) * 5), longer = Math.min(count, Math.max(0, (weekly - base * count) / 5));
  return Array.from({ length: count }, (_, i) => Math.max(d.minLessonMin, base + (i < longer ? 5 : 0)));
}

/** Passen fördelas mellan lärare som undervisar en i taget, efter deras tid (största rest). */
function shareLessons(count: number, teachers: Teaching['teachers']): string[] {
  const total = teachers.reduce((sum, t) => sum + t.minutes, 0);
  const parts = teachers.map((t, index) => { const exact = total > 0 ? count * t.minutes / total : count / teachers.length; return { id: t.personId, index, n: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = count - parts.reduce((sum, p) => sum + p.n, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.index - b.index)) { if (left <= 0) break; p.n += 1; left -= 1; }
  return parts.flatMap(p => Array.from({ length: p.n }, () => p.id));
}

function teachings(plan: TjanstPlanRead, term: SchemaTerm, hasMembers: (groupId: string) => boolean): Teaching[] {
  const pick = (ht: number | null, vt: number | null) => term === 'ht' ? ht : vt;
  const groups = plan.groups ?? [];
  // Block där minst ett alternativ har elever: alternativen läggs var för sig och ett alternativ utan elever krockar inte med någon.
  const chosen = new Set(groups.filter(g => g.blockId !== null && hasMembers(g.groupId)).map(g => g.blockId));
  const sources = [
    ...plan.classes.flatMap(c => c.needs.map(n => ({ sourceKey: n.sourceKey, title: n.label, part: { classIds: [c.classId], groupId: null, alone: false } as Part,
      need: pick(n.needHt, n.needVt), blockId: null as string | null }))),
    ...groups.map(g => ({ sourceKey: g.sourceKey, title: g.name, part: { classIds: g.classIds, groupId: g.groupId, alone: chosen.has(g.blockId) } as Part,
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
    result.push({ title: joint.name, parts: members.map(s => s.part),
      termMinutes: Math.max(...members.map(s => s.need ?? 0), ...(members.every(s => s.need === null) ? teachers.map(t => t.minutes) : [0])),
      teachers, together: true, vacant: teachers.length === 0 });
  }
  const own = (sourceKey: string) => {
    const rows = (rowsOf.get(sourceKey) ?? []).filter(r => r.jointGroupId === null);
    const byPerson = new Map<string, number>();
    for (const r of rows) if (r.personId !== null) byPerson.set(r.personId, (byPerson.get(r.personId) ?? 0) + (pick(r.teacherHt, r.teacherVt) ?? 0));
    return { teachers: [...byPerson].map(([personId, minutes]) => ({ personId, minutes })), vacantMinutes: rows.filter(r => r.personId === null).reduce((sum, r) => sum + (pick(r.teacherHt, r.teacherVt) ?? 0), 0) };
  };
  // Valbart block utan kända elever i något alternativ: alternativen går samtidigt, som ett pass för blockets klasser och lärare (E2).
  const blocks = new Map<string, typeof sources>();
  for (const s of sources) if (s.blockId !== null && !chosen.has(s.blockId) && !used.has(s.sourceKey)) blocks.set(s.blockId, [...blocks.get(s.blockId) ?? [], s]);
  for (const options of blocks.values()) {
    for (const s of options) used.add(s.sourceKey);
    const staffed = options.map(s => own(s.sourceKey));
    const teachers = unique(staffed.flatMap(x => x.teachers.map(t => t.personId))).map(personId => ({ personId, minutes: 0 }));
    result.push({ title: options.length > 1 ? `Valbart block: ${options.map(s => s.title).join(', ')}` : options[0].title,
      parts: options.map(s => s.part),
      termMinutes: Math.max(...options.map((s, i) => s.need ?? Math.max(0, ...staffed[i].teachers.map(t => t.minutes), staffed[i].vacantMinutes))),
      teachers, together: true, vacant: staffed.some(x => x.teachers.length === 0) });
  }
  for (const s of sources) {
    if (used.has(s.sourceKey)) continue;
    const { teachers, vacantMinutes } = own(s.sourceKey);
    const together = plan.sharing.some(x => x.sourceKey === s.sourceKey && x.mode === 'concurrent');
    // Okänt behov: lärarnas lagda tid får stå för undervisningstiden.
    const staffedMinutes = together ? Math.max(0, ...teachers.map(t => t.minutes)) : teachers.reduce((sum, t) => sum + t.minutes, 0);
    result.push({ title: s.title, parts: [s.part], termMinutes: s.need ?? staffedMinutes + vacantMinutes,
      teachers, together, vacant: teachers.length === 0 });
  }
  return result;
}

export function buildSchemaUnderlag(plan: TjanstPlanRead, request: Pick<SchemaForslagRequest, 'term'>, basis?: SchemaBasis): SchemaUnderlag {
  const d = SCHEMA_DEFAULTS, time = basis?.time ?? defaultSchemaTime(request.term), members = basis?.members ?? null;
  const classNo = new Map(plan.classes.map((c, i) => [c.classId, `grupp-${i + 1}`])), className = new Map(plan.classes.map(c => [c.classId, c.name]));
  const teacherNo = new Map(plan.teachers.map((t, i) => [t.personId, `larare-${i + 1}`]));
  const planGroups = plan.groups ?? [], groupIndex = new Map(planGroups.map((g, i) => [g.groupId, i]));
  const labels: SchemaLabels = {
    classes: plan.classes.map(c => ({ id: classNo.get(c.classId)!, name: c.name })),
    teachers: plan.teachers.map(t => ({ id: teacherNo.get(t.personId)!, name: t.displayName })), names: {}, activities: [], lessons: [] };
  const problem: SchemaProblem = {
    version: SCHEMA_CONTRACT_VERSION, id: `forslag-${request.term}`,
    time: { step_min: d.stepMin, start_grid_min: d.startGridMin, days: Array.from({ length: d.days }, () => ({ start_min: d.dayStartMin, end_min: d.dayEndMin })) },
    teachers: labels.teachers.map(t => ({ id: t.id })), clusters: [], groups: [], activities: [], lessons: [],
    rules: { break_min: d.breakMin, lunch: { ...d.lunch }, same_day: 'avoid' }, weights: { late_after_min: d.lateAfterMin },
  };

  // Elevkluster: elever med exakt samma klasser och grupper under terminen. Två pass krockar bara om de delar ett kluster.
  const registered = new Set(members?.pupils.map(p => p.id)), groupsOf = new Map<string, Set<string>>();
  for (const m of members?.memberships ?? []) {
    if (!groupIndex.has(m.groupId) || !registered.has(m.pupilId)) continue;
    if (time.term && (m.startsOn > time.term.end || m.endsOn !== null && m.endsOn < time.term.start)) continue;
    groupsOf.set(m.pupilId, (groupsOf.get(m.pupilId) ?? new Set()).add(m.groupId));
  }
  const pad = (n: number) => String(n).padStart(6, '0');
  const signatures = new Map<string, { classIds: string[]; groupIds: string[]; size: number }>();
  let pupils = 0;
  for (const p of members?.pupils ?? []) {
    const classIds = unique(p.classIds.filter(id => classNo.has(id))).sort((a, b) => plan.classes.findIndex(c => c.classId === a) - plan.classes.findIndex(c => c.classId === b));
    const groupIds = [...groupsOf.get(p.id) ?? []].sort((a, b) => groupIndex.get(a)! - groupIndex.get(b)!);
    if (!classIds.length && !groupIds.length) continue;
    pupils += 1;
    const key = `${classIds.map(id => pad(Number(classNo.get(id)!.slice(6)))).join('.')}|${groupIds.map(id => pad(groupIndex.get(id)!)).join('.')}`;
    const entry = signatures.get(key) ?? { classIds, groupIds, size: 0 };
    entry.size += 1; signatures.set(key, entry);
  }
  const classClusters = new Map<string, string[]>(plan.classes.map(c => [c.classId, []])), groupClusters = new Map<string, string[]>(), groupClasses = new Map<string, Set<string>>();
  const cluster = (size: number, name: string) => { const id = `kluster-${problem.clusters.length + 1}`; problem.clusters.push({ id, size }); labels.names[id] = name; return id; };
  for (const key of [...signatures.keys()].sort()) {
    const s = signatures.get(key)!;
    const id = cluster(s.size, [s.classIds.map(c => className.get(c)!).join(' + '), s.groupIds.map(g => planGroups[groupIndex.get(g)!].name).join(', ')].filter(Boolean).join(': '));
    for (const c of s.classIds) classClusters.get(c)!.push(id);
    for (const g of s.groupIds) {
      groupClusters.set(g, [...groupClusters.get(g) ?? [], id]);
      groupClasses.set(g, new Set([...groupClasses.get(g) ?? [], ...s.classIds]));
    }
  }
  const classesWithoutPupils: string[] = [];
  for (const c of plan.classes) {
    // Klass utan elever i registret: ett antaget kluster, så att klassens pass ändå inte läggs samtidigt.
    if (!classClusters.get(c.classId)!.length) { classClusters.get(c.classId)!.push(cluster(d.classSize, c.name)); classesWithoutPupils.push(c.name); }
    problem.groups.push({ id: classNo.get(c.classId)!, clusters: classClusters.get(c.classId)! });
  }
  const withoutChoice: { title: string; count: number }[] = [];
  for (const blockId of unique(planGroups.filter(g => g.blockId !== null && groupClusters.has(g.groupId)).map(g => g.blockId!))) {
    const options = planGroups.filter(g => g.blockId === blockId), inBlock = new Set(options.flatMap(g => g.classIds)), ids = new Set(options.map(g => g.groupId));
    const count = (members?.pupils ?? []).filter(p => p.classIds.some(c => inBlock.has(c) && classNo.has(c)) && ![...groupsOf.get(p.id) ?? []].some(g => ids.has(g))).length;
    if (count > 0) withoutChoice.push({ title: options.map(g => g.name).join(', '), count });
  }

  const omitted: SchemaOmission[] = [], nodes = new Map<string, string>();
  const node = (key: string, name: string, clusters: () => string[]) => {
    if (!nodes.has(key)) { const id = `grupp-${problem.groups.length + 1}`; nodes.set(key, id); labels.names[id] = name; problem.groups.push({ id, clusters: clusters() }); }
    return nodes.get(key)!;
  };
  for (const t of teachings(plan, request.term, id => groupClusters.has(id))) {
    // Klasserna som berörs: passet visas i deras scheman och deras skoldagar avgör terminens tid.
    const classes = unique(t.parts.flatMap(p => p.groupId !== null && groupClusters.has(p.groupId) ? [...groupClasses.get(p.groupId)!] : p.alone ? [] : p.classIds).filter(id => classNo.has(id)));
    const names = classes.map(id => className.get(id)!);
    if (t.termMinutes <= 0) { omitted.push({ title: t.title, classes: names, reason: 'no_time' }); continue; }
    const perWeekday = classes.reduce<number[]>((least, id) => least.map((n, day) => Math.min(n, (time.classes[id] ?? time.perWeekday)[day] ?? 0)), [...time.perWeekday]);
    const days = perWeekday.reduce((sum, n) => sum + n, 0);
    if (days <= 0) { omitted.push({ title: t.title, classes: names, reason: 'no_days' }); continue; }
    const lengths = weeklyLessons(t.termMinutes, days / 5);
    if (!lengths.length) { omitted.push({ title: t.title, classes: names, reason: 'too_short' }); continue; }
    const activity = `behov-${problem.activities.length + 1}`;
    const groups = unique(t.parts.flatMap(p => {
      if (p.groupId !== null && groupClusters.has(p.groupId)) return [node(p.groupId, planGroups[groupIndex.get(p.groupId)!].name, () => groupClusters.get(p.groupId!)!)];
      const whole = p.classIds.filter(id => classNo.has(id)).map(id => classNo.get(id)!);
      if (whole.length && !p.alone) return whole;
      // Grupp utan klasser eller utan elever i ett block med val: eget kluster, så att den inte krockar med någon klass.
      const key = p.groupId ?? activity;
      if (!nodes.has(key)) {
        const separate = cluster(p.alone ? 1 : d.classSize, t.title);
        node(key, t.title, () => [separate]);
      }
      return [nodes.get(key)!];
    }));
    const shown = classes.length ? classes.map(id => classNo.get(id)!) : groups;
    for (const id of shown) if (!labels.classes.some(c => c.id === id)) labels.classes.push({ id, name: labels.names[id] ?? t.title });
    const known = t.teachers.filter(x => teacherNo.has(x.personId));
    const turn = !t.together && known.length > 1 ? shareLessons(lengths.length, known) : null;
    problem.activities.push({ id: activity });
    labels.activities.push({ id: activity, title: t.title, classes: names, needMin: Math.round(t.termMinutes), weeklyMin: lengths.reduce((sum, n) => sum + n, 0), perWeekday });
    lengths.forEach((durationMin, i) => {
      const id = `pass-${problem.lessons.length + 1}`;
      const teacherIds = (turn ? [turn[i]] : known.map(x => x.personId)).map(personId => teacherNo.get(personId)!);
      problem.lessons.push({ id, activity, duration_min: durationMin, teachers: teacherIds, groups });
      labels.lessons.push({ id, activity, title: t.title, classIds: shown, teacherIds, durationMin, vacant: t.vacant });
    });
  }
  const groupsWithoutMembers = planGroups.filter(g => !groupClusters.has(g.groupId)).map(g => g.name);
  return { problem, labels, omitted, time, members: { pupils, groupsWithoutMembers, classesWithoutPupils, withoutChoice } };
}

/** Motorns klartext bär löpnummer; här byts de mot namn innan texten visas. */
function named(message: string, labels: SchemaLabels): string {
  const name = new Map<string, string>([...Object.entries(labels.names), ...labels.classes.map(c => [c.id, c.name] as const),
    ...labels.teachers.map(t => [t.id, t.name] as const), ...labels.lessons.map(l => [l.id, l.title] as const), ...labels.lessons.map(l => [l.activity, l.title] as const)]);
  return message.replace(/\b(?:grupp|kluster|larare|pass|behov)-\d+\b/giu, id => name.get(id.toLowerCase()) ?? id);
}

export function schemaForslag(plan: TjanstPlanRead, request: SchemaForslagRequest, underlag: SchemaUnderlag, solution: SchemaSolution): SchemaForslag {
  const at = new Map(solution.placements.map(p => [p.lesson, p]));
  const lessons = underlag.labels.lessons.map(({ activity: _activity, ...l }) => ({ ...l, day: at.get(l.id)?.day ?? null, startMin: at.get(l.id)?.startMin ?? null }));
  const days = underlag.time.perWeekday.reduce((sum, n) => sum + n, 0);
  const teachings = underlag.labels.activities.map(a => {
    const own = lessons.filter(l => underlag.labels.lessons.find(x => x.id === l.id)!.activity === a.id);
    return { title: a.title, classes: a.classes, needMin: a.needMin, weeklyMin: a.weeklyMin, unplaced: own.filter(l => l.day === null).length,
      plannedMin: own.reduce((sum, l) => sum + (l.day === null ? 0 : l.durationMin * (a.perWeekday[l.day] ?? 0)), 0) };
  });
  const usedTeachers = new Set(lessons.flatMap(l => l.teacherIds)), usedClasses = new Set(lessons.flatMap(l => l.classIds));
  return {
    contractVersion: SCHEMA_CONTRACT_VERSION, unitId: request.unitId, schoolYear: request.schoolYear, term: request.term, schoolName: plan.schoolName,
    time: { source: underlag.time.source, version: underlag.time.version, status: underlag.time.status, current: underlag.time.current, schoolDays: days, weeks: days / 5 },
    members: underlag.members, teachings,
    basis: plan.version ? { versionNo: plan.version.versionNo, status: plan.version.status } : null,
    status: solution.status, days: underlag.problem.time.days.map(day => ({ startMin: day.start_min, endMin: day.end_min })),
    classes: underlag.labels.classes.filter(c => usedClasses.has(c.id)), teachers: underlag.labels.teachers.filter(t => usedTeachers.has(t.id)),
    lessons, omitted: underlag.omitted, diagnoses: solution.diagnoses.map(x => ({ message: named(x.message, underlag.labels), proof: x.proof })),
    metrics: { lessons: lessons.length, placed: solution.placements.length, unplaced: solution.unplaced.length,
      studentGapMin: solution.metrics.studentGapMin, teacherGapMin: solution.metrics.teacherGapMin },
    elapsedMs: solution.elapsedMs,
  };
}
