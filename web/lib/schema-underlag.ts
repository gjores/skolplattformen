/**
 * Schemaunderlag ur tjänstefördelningen (05.2-SM-KOPPLING). Ren funktion: samma läsning ger samma underlag.
 * Motorn får bara löpnummer, tider och kopplingar (K3); namn och appens ID stannar i `labels` på servern.
 * Elevernas gruppmedlemskap avgör vilka pass som inte får gå samtidigt, och terminens tid räknas ur läsårskalenderns
 * skoldagar (05.2-SM-ELEVER-KALENDER, E1–E6). Schemat gäller läsåret eller en termin och räknas med de villkor som begäran bär;
 * hur mycket tid och vilken termin kommer ur timplanen via tjänstefördelningens behov (05.2-SM-LASAR-VILLKOR).
 */
import type { TjanstPlanRead, TjanstRow } from './tjanst-contract.ts';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_LIMITS, defaultSchemaVillkor, schemaTerms, type SchemaInterval, type SchemaRegel, type SchemaVillkor, type SchemaForslag, type SchemaForslagRequest, type SchemaCheck, type SchemaKontroll, type SchemaMembers, type SchemaOmission, type SchemaPlacement, type SchemaProblem,
  type SchemaSolution, type SchemaTerm, type SchemaTime } from './schema-contract.ts';

/** Fasta ramar som inte är villkor: motorns tidssteg, flest pass per vecka, antagen klasstorlek, räknetid och veckor utan läsårskalender. */
export const SCHEMA_DEFAULTS = { days: 5, stepMin: 5, maxLessonsPerWeek: 20, classSize: 25, solveTimeMs: 10_000, weeks: { ht: 18, vt: 20 } } as const;

/** En del av ett pass: en klass, eller en grupp vars elever avgör vilka som är upptagna. */
type Part = { classIds: string[]; groupId: string | null; alone: boolean };
type Teaching = { title: string; parts: Part[]; termMinutes: number;
  teachers: { personId: string; minutes: number }[]; together: boolean; vacant: boolean };
export type SchemaLabels = {
  classes: { id: string; name: string }[]; teachers: { id: string; name: string }[];
  /** Salarnas löpnummer och namn (R6). */
  rooms: { id: string; name: string }[];
  /** Namn på elevkluster och elevgrupper, för motorns klartext. */
  names: Record<string, string>;
  /** `days`: skoldagar per veckodag för undervisningens klasser, per termin i perioden. */
  /** `weeks`: skoldagar per vecka och veckodag för undervisningens klasser (05.2-SM-TIMPLAN-VECKA, W1). */
  /** `terms`: timplanens tid per termin och den tiden avrundad uppåt till hela 5 minuter (W3). `weeklyOff`: passen kan inte ge timplanens tid någon termin (E4). */
  activities: { id: string; title: string; classes: string[]; needMin: number; weeklyMin: number; days: Partial<Record<SchemaTerm, number[]>>;
    weeks: Partial<Record<SchemaTerm, number[][]>>; terms: { term: SchemaTerm; needMin: number; maxMin: number }[]; weeklyOff: boolean }[];
  /** `durationMin` är undervisningstiden; motorns pass är `marginMin` längre (R4). */
  lessons: { id: string; activity: string; title: string; classIds: string[]; teacherIds: string[]; durationMin: number; marginMin: number; roomIds: string[]; vacant: boolean; term: SchemaTerm | null }[];
};
export type SchemaBasis = { members: SchemaMembers | null; time: SchemaTime };
export type SchemaUnderlag = { period: SchemaForslagRequest['period']; terms: SchemaTerm[]; villkor: SchemaVillkor; problem: SchemaProblem; labels: SchemaLabels; omitted: SchemaOmission[]; time: SchemaTime; members: SchemaForslag['members']; fingerprint: string;
  resurser: SchemaForslag['resurser']; egnaUtanTraff: number[] };

/** Utan läsårskalender: ett fast antal lika veckor (förval). */
export function defaultSchemaTime(): SchemaTime {
  const term = (t: SchemaTerm) => ({ span: null, perWeekday: Array.from({ length: SCHEMA_DEFAULTS.days }, () => SCHEMA_DEFAULTS.weeks[t]), classes: {},
    weeks: Array.from({ length: SCHEMA_DEFAULTS.weeks[t] }, (_, i) => ({ monday: null, label: `Vecka ${i + 1}`, perWeekday: Array.from({ length: SCHEMA_DEFAULTS.days }, () => 1), classes: {} })) });
  return { source: 'forval', version: null, status: null, current: false, terms: { ht: term('ht'), vt: term('vt') } };
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

/**
 * Fingeravtryck av underlaget (05.2-SM-FLYTT, F2): samma underlag ger samma värde, och en ändring av pass, lärare, grupper, tider eller namn ger ett annat.
 * Det upptäcker ändringar och skyddar ingenting; servern bygger alltid underlaget själv ur sin egen läsning.
 */
export function schemaFingerprint(problem: SchemaProblem, labels: SchemaLabels): string {
  const text = JSON.stringify([problem, labels]);
  const part = (seed: number) => {
    let a = 0xdeadbeef ^ seed, b = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
    b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, '0');
  };
  return part(1) + part(2);
}

/** Avrundning uppåt till hela 5 minuter (E1); små flyttalsfel avrundas inte upp. */
const ceil5 = (minutes: number) => Math.ceil(minutes / 5 - 1e-9) * 5;
const unique = <T,>(values: T[]) => [...new Set(values)];

/**
 * Veckans pass: högst `maxLessonMin` långa och så lika som 5-minutersrutnätet tillåter; summan är veckotiden avrundad uppåt till 5 min (E1).
 * Tom lista: för lite tid för ett pass i veckan.
 */
export function weeklyLessons(termMinutes: number, weeks: number, d: Pick<SchemaVillkor, 'maxLessonMin' | 'minLessonMin'> = defaultSchemaVillkor(), fixed?: number): number[] {
  const weekly = weeks > 0 ? ceil5(termMinutes / weeks) : 0;
  if (weekly < d.minLessonMin) return [];
  if (fixed !== undefined) {
    // Bestämt antal pass (R5): samma veckotid, så lika pass som rutnätet tillåter. Antalet hålls inom 10–180 minuter per pass.
    const n = Math.max(Math.ceil(weekly / 180), Math.min(fixed, Math.max(1, Math.floor(weekly / 10)))), short = Math.floor(weekly / n / 5) * 5;
    return Array.from({ length: n }, (_, i) => short + (i < (weekly - short * n) / 5 ? 5 : 0));
  }
  const count = Math.min(SCHEMA_DEFAULTS.maxLessonsPerWeek, Math.ceil(weekly / d.maxLessonMin));
  const base = Math.min(d.maxLessonMin, Math.floor(weekly / count / 5) * 5), longer = Math.min(count, Math.max(0, (weekly - base * count) / 5));
  return Array.from({ length: count }, (_, i) => Math.max(d.minLessonMin, base + (i < longer ? 5 : 0)));
}

/** Tillåten tid för en undervisning en termin (E2): timplanens minuter till och med avrundningen uppåt, under 5 minuter per vecka. */
type TimeRange = { perWeekday: number[]; min: number; max: number };

/** Finns veckodagar för passen som ger varje termin tid inom sitt intervall (E4)? Övriga regler räknas inte. */
export function reachable(lengths: number[], ranges: TimeRange[]): boolean {
  if (!lengths.length || !ranges.length) return false;
  let sums = new Map([[ranges.map(() => 0).join(), ranges.map(() => 0)]]);
  for (const len of lengths) {
    const next = new Map<string, number[]>();
    for (const now of sums.values()) for (let day = 0; day < ranges[0].perWeekday.length; day++) {
      // En veckodag utan skoldagar ger passet ingen tid; där läggs inget.
      if (ranges.every(r => !r.perWeekday[day])) continue;
      const s = now.map((n, i) => n + len * (ranges[i].perWeekday[day] ?? 0));
      if (s.every((n, i) => n <= ranges[i].max)) next.set(s.join(), s);
    }
    sums = next;
  }
  return [...sums.values()].some(s => s.every((n, i) => n >= ranges[i].min));
}

/** Passen fördelas mellan lärare som undervisar en i taget, efter deras tid (största rest). */
function shareLessons(count: number, teachers: Teaching['teachers']): string[] {
  const total = teachers.reduce((sum, t) => sum + t.minutes, 0);
  const parts = teachers.map((t, index) => { const exact = total > 0 ? count * t.minutes / total : count / teachers.length; return { id: t.personId, index, n: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = count - parts.reduce((sum, p) => sum + p.n, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.index - b.index)) { if (left <= 0) break; p.n += 1; left -= 1; }
  return parts.flatMap(p => Array.from({ length: p.n }, () => p.id));
}

type Span = [number, number];
const cut = (spans: Span[], [from, to]: Span): Span[] => spans.flatMap(([a, b]): Span[] => [[a, Math.min(b, from)], [Math.max(a, to), b]]).filter(([a, b]) => a < b);
const within = (spans: Span[], others: Span[]): Span[] => spans.flatMap(([a, b]) => others.map(([c, e]): Span => [Math.max(a, c), Math.min(b, e)])).filter(([a, b]) => a < b);
type Tid = Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>;
/**
 * Tiderna som blir kvar en dag (R3): varje resurs med tillåten tid begränsar till sina tillåtna tider (flera läggs ihop),
 * och all spärrad tid tas bort.
 */
function openSpans(rules: Tid[], day: number, whole: Span): Span[] {
  let spans: Span[] = [whole];
  for (const key of unique(rules.filter(r => r.typ === 'tillaten').map(r => `${r.slag}|${r.ref}`)))
    spans = within(spans, rules.filter(r => r.typ === 'tillaten' && `${r.slag}|${r.ref}` === key && r.days.includes(day)).map(r => [r.startMin, r.endMin]));
  for (const r of rules) if (r.typ === 'sparrad' && r.days.includes(day)) spans = cut(spans, [r.startMin, r.endMin]);
  return spans;
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

export function buildSchemaUnderlag(plan: TjanstPlanRead, request: Pick<SchemaForslagRequest, 'period'> & { villkor?: SchemaVillkor }, basis?: SchemaBasis): SchemaUnderlag {
  const d = SCHEMA_DEFAULTS, v = request.villkor ?? defaultSchemaVillkor(), terms = schemaTerms(request.period);
  const time = basis?.time ?? defaultSchemaTime(), members = basis?.members ?? null;
  const classNo = new Map(plan.classes.map((c, i) => [c.classId, `grupp-${i + 1}`])), className = new Map(plan.classes.map(c => [c.classId, c.name]));
  const teacherNo = new Map(plan.teachers.map((t, i) => [t.personId, `larare-${i + 1}`]));
  const planGroups = plan.groups ?? [], groupIndex = new Map(planGroups.map((g, i) => [g.groupId, i]));
  const labels: SchemaLabels = {
    classes: plan.classes.map(c => ({ id: classNo.get(c.classId)!, name: c.name })),
    teachers: plan.teachers.map(t => ({ id: teacherNo.get(t.personId)!, name: t.displayName })), rooms: v.salar.map((name, i) => ({ id: `sal-${i + 1}`, name })), names: {}, activities: [], lessons: [] };
  const tid = (r: SchemaRegel): r is Tid => r.typ === 'sparrad' || r.typ === 'tillaten';
  // Egna villkor som träffar något i underlaget. Villkor för en sal träffar alltid: salen finns bland salarna.
  const hit = new Set<number>(v.egna.flatMap((r, i) => r.slag === 'sal' ? [i] : []));
  const problem: SchemaProblem = {
    version: SCHEMA_CONTRACT_VERSION, id: `forslag-${request.period}`,
    time: { step_min: d.stepMin, start_grid_min: v.startGridMin, days: v.days.map(day => ({ start_min: day.startMin, end_min: day.endMin })) },
    // Läsår: terminerna är motorns perioder, så att pass i olika terminer kan dela tid (L2).
    ...(terms.length > 1 ? { periods: terms.map(id => ({ id })) } : {}),
    teachers: labels.teachers.map(t => ({ id: t.id, ...(v.teacherMaxMinPerDay === null ? {} : { max_min_per_day: v.teacherMaxMinPerDay }) })),
    // Salens spärrade tid, och all tid utanför dess tillåtna, är tid då salen inte kan användas (R3).
    ...(labels.rooms.length ? { rooms: labels.rooms.map(room => {
      const rules = v.egna.filter((r): r is Tid => r.slag === 'sal' && r.ref === room.name && tid(r));
      const unavailable = v.days.flatMap((_, day) => {
        let closed: Span[] = [[0, 1440]];
        for (const open of openSpans(rules, day, [0, 1440])) closed = cut(closed, open);
        return closed.map(([a, b]): SchemaInterval => ({ day, start_min: a, end_min: b }));
      });
      return { id: room.id, ...(unavailable.length ? { unavailable } : {}) };
    }) } : {}),
    clusters: [], groups: [], activities: [], lessons: [],
    rules: { ...(v.studentMaxMinPerDay === null ? {} : { student_max_min_per_day: v.studentMaxMinPerDay }), break_min: v.breakMin,
      lunch: v.lunch && { window_start_min: v.lunch.startMin, window_end_min: v.lunch.endMin, length_min: v.lunch.lengthMin, teachers: v.lunch.teachers }, same_day: v.sameDay },
    weights: { late_after_min: v.lateAfterMin },
  };

  // Elevkluster: elever med exakt samma klasser och grupper under perioden (L5). Två pass krockar bara om de delar ett kluster.
  const from = time.terms[terms[0]].span?.start, to = time.terms[terms.at(-1)!].span?.end;
  const registered = new Set(members?.pupils.map(p => p.id)), groupsOf = new Map<string, Set<string>>();
  for (const m of members?.memberships ?? []) {
    if (!groupIndex.has(m.groupId) || !registered.has(m.pupilId)) continue;
    if (from !== undefined && to !== undefined && (m.startsOn > to || m.endsOn !== null && m.endsOn < from)) continue;
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
  const total = (values: number[]) => values.reduce((sum, n) => sum + n, 0);
  // Samma undervisningar i samma ordning för varje termin; bara tiden skiljer.
  const perTerm = terms.map(term => teachings(plan, term, id => groupClusters.has(id)));
  perTerm[0].forEach((t, index) => {
    // Klasserna som berörs: passet visas i deras scheman och deras skoldagar avgör terminens tid.
    const classes = unique(t.parts.flatMap(p => p.groupId !== null && groupClusters.has(p.groupId) ? [...groupClasses.get(p.groupId)!] : p.alone ? [] : p.classIds).filter(id => classNo.has(id)));
    const names = classes.map(id => className.get(id)!);
    // Egna villkor för undervisningen: klassens, gruppens och ämnets gäller alla dess pass, lärarens de pass läraren har.
    const egna = (persons: string[]) => v.egna.flatMap((r, i) => {
      const own = r.slag === 'klass' ? classes.includes(r.ref) : r.slag === 'grupp' ? t.parts.some(p => p.groupId === r.ref) : r.slag === 'amne' ? r.ref === t.title : r.slag === 'larare' && persons.includes(r.ref);
      if (own) hit.add(i);
      return own ? [r] : [];
    });
    const shared = egna([]);
    const info = terms.map((term, i) => {
      const own = time.terms[term], variant = perTerm[i][index];
      // Skoldagar då alla undervisningens klasser har undervisning, totalt och vecka för vecka (W1).
      const least = (all: number[], of: Record<string, number[]>) => classes.reduce<number[]>((row, id) => row.map((n, day) => Math.min(n, (of[id] ?? all)[day] ?? 0)), [...all]);
      const perWeekday = least(own.perWeekday, own.classes), weeks = own.weeks.map(w => least(w.perWeekday, w.classes));
      return { term, minutes: variant.termMinutes, teachers: variant.teachers, perWeekday, weeks, days: total(perWeekday) };
    });
    const suffix = (term: SchemaTerm) => terms.length > 1 ? ` (${term.toUpperCase()})` : '';
    if (info.every(x => x.minutes <= 0)) { omitted.push({ title: t.title, classes: names, reason: 'no_time' }); return; }
    const active = info.filter(x => x.minutes > 0 && x.days > 0);
    if (!active.length) { omitted.push({ title: t.title, classes: names, reason: 'no_days' }); return; }
    for (const x of info) if (x.minutes > 0 && x.days <= 0) omitted.push({ title: t.title + suffix(x.term), classes: names, reason: 'no_days' });
    // Samma veckoschema hela läsåret när timplanens veckotid avrundad uppåt är lika och samma lärare har undervisningen båda terminerna; annars egna pass per termin (E5).
    const known = t.teachers.filter(x => teacherNo.has(x.personId)), takesTurns = !t.together && known.length > 1;
    const staff = (x: typeof info[number]) => takesTurns ? x.teachers.filter(p => p.minutes > 0).map(p => p.personId).join() : '';
    // Veckor: skoldagarna delade på de veckodagar som har skoldagar, så att en klass utan fredagar får sin veckotid på fyra dagar.
    const weeksOf = (x: typeof info[number]) => x.days / Math.max(1, x.perWeekday.filter(n => n > 0).length);
    const weekly = (x: typeof info[number]) => x.minutes / weeksOf(x);
    const even = active.length > 1 && staff(active[0]) === staff(active[1]) && ceil5(weekly(active[0])) === ceil5(weekly(active[1]));
    // Uppdelning (R5): antal pass går före längsta pass; det kortaste längsta passet gäller. Veckotiden är alltid timplanens.
    const antal = shared.find(r => r.typ === 'antal')?.count, langd = Math.min(...shared.flatMap(r => r.typ === 'langd' ? [r.maxMin] : []));
    const split = Number.isFinite(langd) ? { maxLessonMin: langd, minLessonMin: Math.min(v.minLessonMin, langd) } : v;
    // Möjliga lektionstillfällen (W1): veckodagar där passen kan ligga enligt de egna villkoren för tid och sal. Lärarnas villkor räknas för alla
    // undervisningens lärare. Övriga dagar ger inga tillfällen i beräkningen.
    const known0 = t.teachers.filter(x => teacherNo.has(x.personId)).map(x => x.personId), dayRules = egna(known0);
    const dayWanted = (['amne', 'grupp', 'larare', 'klass'] as const).map(slag => dayRules.flatMap(r => r.slag === slag && r.typ === 'sal' ? r.rooms : [])).find(rooms => rooms.length) ?? [];
    const dayOk = v.days.map((frame, day) => openSpans(dayRules.filter(tid), day, [frame.startMin, frame.endMin]).some(([a, b]) => b - a >= split.minLessonMin)
      && (!dayWanted.length || dayWanted.some(name => openSpans(v.egna.filter((r): r is Tid => r.slag === 'sal' && r.ref === name && tid(r)), day, [frame.startMin, frame.endMin])
        .some(([a, b]) => b - a >= split.minLessonMin))));
    // Grundmönstret ska ge minst timplanens tid (W2) och helst oavsett vilken möjlig veckodag motorn väljer; överskottet justeras per tillfälle (W3).
    // Passlängderna prövas från de vanliga och uppåt i steg om 5 minuter i veckan, med fler pass som alternativ.
    const range = (x: typeof info[number]): TimeRange => ({ perWeekday: x.perWeekday.map((n, day) => dayOk[day] ? n : 0), min: Math.ceil(x.minutes - 1e-9), max: Number.MAX_SAFE_INTEGER });
    const robust = (lengths: number[], ranges: TimeRange[]) => lengths.length > 0 && ranges.every(r => {
      const open = r.perWeekday.filter(n => n > 0);
      return open.length > 0 && total(lengths) * Math.min(...open) >= r.min;
    });
    const segments = (even ? [active] : active.map(x => [x])).map(parts => {
      const minutes = total(parts.map(x => x.minutes)), weeks = total(parts.map(weeksOf)), ranges = parts.map(range);
      const first = weeklyLessons(minutes, weeks, split, antal);
      // För lite tid för ett pass i veckan förblir för lite: tiden höjs inte för att få fram ett pass.
      const tries = !first.length ? [] : [0, 5, 10, 15, 20, 25, 30].flatMap(extra => [undefined, ...(antal === undefined && first.length ? [first.length + 1, first.length + 2] : [])]
        .map(count => weeklyLessons(minutes + extra * weeks, weeks, split, count ?? antal)));
      const lengths = tries.find(l => robust(l, ranges)) ?? tries.find(l => reachable(l, ranges)) ?? first;
      return { parts, days: total(parts.map(x => x.days)), ranges, lengths, ok: reachable(lengths, ranges) };
    });
    if (segments.every(s => !s.lengths.length)) { omitted.push({ title: t.title, classes: names, reason: 'too_short' }); return; }
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
    const laid = segments.filter(s => s.lengths.length);
    problem.activities.push({ id: activity, time: laid.flatMap(s => s.parts.map((x, i) => ({ ...(terms.length > 1 ? { period: x.term } : {}),
      // Övre gränsen är det mesta passen kan ge, så den hindrar aldrig (W2).
      weekday_days: x.perWeekday, min_min: s.ranges[i].min, max_min: Math.max(s.ranges[i].min, total(s.lengths) * Math.max(...x.perWeekday)) }))) });
    // En veckodag utan skoldagar för undervisningens klasser ger inga tillfällen: där läggs inget pass.
    const noDays = v.days.flatMap((_, day) => laid.every(s => s.parts.every(x => !x.perWeekday[day])) ? [day] : []);
    labels.activities.push({ id: activity, title: t.title, classes: names, needMin: Math.round(total(info.map(x => Math.max(0, x.minutes)))),
      weeklyMin: Math.round(total(laid.map(s => total(s.lengths) * s.days)) / total(laid.map(s => s.days))), days: Object.fromEntries(info.map(x => [x.term, x.perWeekday])),
      weeks: Object.fromEntries(info.map(x => [x.term, x.weeks])),
      terms: info.map(x => ({ term: x.term, needMin: Math.ceil(Math.max(0, x.minutes) - 1e-9), maxMin: x.minutes > 0 && x.days > 0 ? ceil5(Math.ceil(x.minutes - 1e-9)) : 0 })),
      // Timplanen är ram (T1): passen ska kunna ge terminens tid (E4).
      weeklyOff: info.some(x => x.minutes > 0 && (x.days <= 0 || !segments.find(s => s.parts.includes(x))?.ok)) });
    for (const s of segments) {
      const term = s.parts.length === terms.length ? null : s.parts[0].term;
      if (!s.lengths.length) { omitted.push({ title: t.title + suffix(s.parts[0].term), classes: names, reason: 'too_short' }); continue; }
      const turn = takesTurns ? shareLessons(s.lengths.length, known.map(k => ({ personId: k.personId, minutes: total(s.parts.map(x => x.teachers.find(p => p.personId === k.personId)?.minutes ?? 0)) }))) : null;
      s.lengths.forEach((durationMin, i) => {
        const id = `pass-${problem.lessons.length + 1}`;
        const persons = turn ? [turn[i]] : known.map(x => x.personId), teacherIds = persons.map(personId => teacherNo.get(personId)!);
        const rules = egna(persons);
        // Marginal till nästa lektion (R4): passet upptar lärare och elever den del av marginalen som rasten inte täcker.
        const marginMin = Math.max(0, Math.max(0, ...rules.flatMap(r => r.typ === 'marginal' ? [r.minutes] : [])) - v.breakMin), length = durationMin + marginMin;
        // Tillåtna fönster (R3), utan veckodagar som saknar skoldagar (W1). Marginalen får gå utanför fönstret. Utan något fönster där passet får plats:
        // ett fönster för kort för passet, så att motorn redovisar det som utan tid.
        const times = rules.filter(tid);
        const allowed = !times.length && !noDays.length ? null : problem.time.days.flatMap((frame, day) => noDays.includes(day) ? [] : openSpans(times, day, [frame.start_min, frame.end_min])
          .map(([a, b]): SchemaInterval => ({ day, start_min: a, end_min: Math.min(frame.end_min, b + marginMin) })).filter(w => w.end_min - w.start_min >= length));
        // Sal (R6): ämnets salar går före gruppens, lärarens och klassens.
        const wanted = (['amne', 'grupp', 'larare', 'klass'] as const).map(slag => rules.flatMap(r => r.slag === slag && r.typ === 'sal' ? r.rooms : [])).find(rooms => rooms.length) ?? [];
        const roomIds = labels.rooms.filter(room => wanted.includes(room.name)).map(room => room.id);
        // Marginalen räknas inte som undervisningstid (E3).
        problem.lessons.push({ id, activity, duration_min: length, ...(marginMin ? { counted_min: durationMin } : {}), teachers: teacherIds, groups, ...(term === null ? {} : { periods: [term] }),
          ...(allowed === null ? {} : { allowed: allowed.length ? allowed : [{ day: 0, start_min: problem.time.days[0].start_min, end_min: problem.time.days[0].start_min + d.stepMin }] }),
          ...(roomIds.length ? { rooms: { count: 1 as const, allowed: roomIds } } : {}) });
        labels.lessons.push({ id, activity, title: t.title, classIds: shown, teacherIds, durationMin, marginMin, roomIds, vacant: t.vacant, term });
      });
    }
  });
  const groupsWithoutMembers = planGroups.filter(g => !groupClusters.has(g.groupId)).map(g => g.name);
  const resurser = { klass: plan.classes.map(c => ({ ref: c.classId, name: c.name })), grupp: planGroups.map(g => ({ ref: g.groupId, name: g.name })),
    amne: unique(perTerm[0].map(t => t.title)).map(title => ({ ref: title, name: title })), larare: plan.teachers.map(t => ({ ref: t.personId, name: t.displayName })) };
  return { period: request.period, terms, villkor: v, problem, labels, omitted, time, members: { pupils, groupsWithoutMembers, classesWithoutPupils, withoutChoice }, fingerprint: schemaFingerprint(problem, labels),
    resurser, egnaUtanTraff: v.egna.flatMap((_, i) => hit.has(i) ? [] : [i]) };
}

/** Motorns klartext bär löpnummer; här byts de mot namn innan texten visas. */
function named(message: string, labels: SchemaLabels, withClasses = false): string {
  const className = new Map(labels.classes.map(c => [c.id, c.name]));
  const lesson = (l: SchemaLabels['lessons'][number]) => withClasses && l.classIds.length ? `${l.title} (${l.classIds.map(id => className.get(id) ?? id).join(', ')})` : l.title;
  const name = new Map<string, string>([...Object.entries(labels.names), ...labels.classes.map(c => [c.id, c.name] as const),
    ...labels.teachers.map(t => [t.id, t.name] as const), ...labels.rooms.map(r => [r.id, r.name] as const), ...labels.lessons.map(l => [l.id, lesson(l)] as const), ...labels.lessons.map(l => [l.activity, l.title] as const)]);
  return message.replace(/\b(?:grupp|kluster|larare|pass|behov|sal)-\d+\b/giu, id => name.get(id.toLowerCase()) ?? id);
}

/** Periodens veckor i ordning, terminerna efter varandra. */
export function schemaWeekLabels(underlag: SchemaUnderlag): string[] {
  return underlag.terms.flatMap(term => underlag.time.terms[term].weeks.map(w => w.label));
}

/**
 * Utlagd tid per undervisning räknad på faktiska tillfällen (05.2-SM-TIMPLAN-VECKA, W1): ett pass ger ett tillfälle varje skoldag på sin veckodag
 * i de terminer det går. Det grundmönstret ger utöver timplanens tid avrundad uppåt till 5 minuter tas bort genom att tillfällen slutar tidigare,
 * aldrig under kortaste passlängd (W3): först kortas hela pass i steg om 5 minuter varje vecka i terminen, så att veckorna blir lika, och det som
 * återstår, mindre än ett pass i alla veckor, sprids jämnt över veckorna. Räknas om efter varje flytt (W5).
 */
function plannedTeachings(underlag: SchemaUnderlag, at: Map<string, SchemaPlacement>): SchemaForslag['teachings'] {
  const floor = underlag.villkor.minLessonMin, size = schemaWeekLabels(underlag).length;
  const offset = Object.fromEntries(underlag.terms.map((term, i) => [term, underlag.terms.slice(0, i).reduce((n, t) => n + underlag.time.terms[t].weeks.length, 0)]));
  return underlag.labels.activities.map(a => {
    const own = underlag.labels.lessons.filter(l => l.activity === a.id).map(l => ({ durationMin: l.durationMin, day: at.get(l.id)?.day ?? null, terms: l.term ? [l.term] : underlag.terms }));
    const unplaced = own.filter(l => l.day === null).length;
    const perWeek = Array.from({ length: size }, () => 0), trimPerWeek = Array.from({ length: size }, () => 0);
    const terms = a.terms.map(x => {
      const occasions = (a.weeks[x.term] ?? []).flatMap((row, week) => own.flatMap((l, lesson) => l.day === null || !l.terms.includes(x.term) ? []
        : Array.from({ length: row[l.day] ?? 0 }, () => ({ week, day: l.day!, lesson, durationMin: l.durationMin })))).sort((p, q) => p.week - q.week || p.day - q.day);
      const baseMin = occasions.reduce((sum, o) => sum + o.durationMin, 0), cut = occasions.map(() => 0);
      let left = x.needMin > 0 ? Math.max(0, Math.floor((baseMin - x.maxMin) / 5)) : 0;
      // Hela pass först, ett i taget och turvis, så länge hela terminens tillfällen ryms i det som återstår.
      for (let changed = true; changed && left > 0;) {
        changed = false;
        for (const lesson of own.map((_, i) => i)) {
          const mine = occasions.flatMap((o, i) => o.lesson === lesson ? [i] : []);
          if (!mine.length || mine.length > left || mine.some(i => occasions[i].durationMin - cut[i] - 5 < Math.min(floor, occasions[i].durationMin))) continue;
          for (const i of mine) cut[i] += 5;
          left -= mine.length;
          changed = true;
        }
      }
      while (left > 0) {
        const open = occasions.flatMap((o, i) => o.durationMin - cut[i] - 5 >= Math.min(floor, o.durationMin) ? [i] : []);
        if (!open.length) break;
        const take = Math.min(left, open.length);
        for (let k = 0; k < take; k++) cut[open[Math.floor((k + 0.5) * open.length / take)]] += 5;
        left -= take;
      }
      occasions.forEach((o, i) => { perWeek[offset[x.term] + o.week] += o.durationMin - cut[i]; trimPerWeek[offset[x.term] + o.week] += cut[i]; });
      const trimmedMin = cut.reduce((sum, n) => sum + n, 0);
      return { ...x, baseMin, plannedMin: baseMin - trimmedMin, trimmedMin, trimmedCount: cut.filter(n => n > 0).length };
    });
    // Under timplanen, eller över timplanen avrundad uppåt när justeringen inte räcker.
    const calendar = terms.some(x => x.needMin > 0 && (x.plannedMin < x.needMin || x.plannedMin > x.maxMin));
    return { title: a.title, classes: a.classes, needMin: a.needMin, weeklyMin: a.weeklyMin, unplaced, plannedMin: terms.reduce((sum, x) => sum + x.plannedMin, 0),
      terms, perWeek, trimPerWeek, deviation: unplaced > 0 ? 'unplaced' as const : a.weeklyOff ? 'weekly' as const : calendar ? 'calendar' as const : null };
  });
}

/** Motorn summerar håltid över perioderna; här redovisas snittet per vecka. */
function weeklyGaps(metrics: SchemaSolution['metrics'], underlag: SchemaUnderlag): SchemaSolution['metrics'] {
  return { studentGapMin: Math.round(metrics.studentGapMin / underlag.terms.length), teacherGapMin: Math.round(metrics.teacherGapMin / underlag.terms.length) };
}
const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
/** Kontrollantens regelbrott med namn i stället för löpnummer och veckodag i stället för dagnummer. Lika rader slås ihop. */
export function schemaKontroll(underlag: SchemaUnderlag, placements: SchemaPlacement[], check: SchemaCheck): SchemaKontroll {
  const seen = new Set<string>(), violations: SchemaKontroll['violations'] = [], total = underlag.labels.lessons.length;
  for (const v of check.violations) {
    const message = named(v.message, underlag.labels, true).replace(/\bdag (\d+)\b/gu, (all, n: string) => WEEKDAYS[Number(n)] ?? all);
    const key = `${v.code}|${message}|${v.lessons.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key); violations.push({ code: v.code, message, lessons: v.lessons });
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint: underlag.fingerprint, violations: violations.slice(0, SCHEMA_LIMITS.shownViolations), total: violations.length,
    teachings: plannedTeachings(underlag, new Map(placements.map(p => [p.lesson, p]))),
    metrics: { lessons: total, placed: placements.length, unplaced: total - placements.length, ...weeklyGaps(check.metrics, underlag) },
    rooms: Object.fromEntries(placements.flatMap(p => p.room ? [[p.lesson, p.room]] : [])) };
}

export function schemaForslag(plan: TjanstPlanRead, request: SchemaForslagRequest, underlag: SchemaUnderlag, solution: SchemaSolution): SchemaForslag {
  const at = new Map(solution.placements.map(p => [p.lesson, p]));
  const lessons = underlag.labels.lessons.map(({ activity: _activity, ...l }) => ({ ...l, day: at.get(l.id)?.day ?? null, startMin: at.get(l.id)?.startMin ?? null, roomId: at.get(l.id)?.room ?? null }));
  const termDays = underlag.terms.map(term => ({ term, schoolDays: underlag.time.terms[term].perWeekday.reduce((sum, n) => sum + n, 0) }));
  const days = termDays.reduce((sum, t) => sum + t.schoolDays, 0);
  const teachings = plannedTeachings(underlag, at);
  const usedTeachers = new Set(lessons.flatMap(l => l.teacherIds)), usedClasses = new Set(lessons.flatMap(l => l.classIds));
  return {
    contractVersion: SCHEMA_CONTRACT_VERSION, unitId: request.unitId, schoolYear: request.schoolYear, period: underlag.period, schoolName: plan.schoolName, villkor: underlag.villkor,
    fingerprint: underlag.fingerprint, startGridMin: underlag.problem.time.start_grid_min,
    time: { source: underlag.time.source, version: underlag.time.version, status: underlag.time.status, current: underlag.time.current, schoolDays: days, weeks: days / 5, terms: termDays, weekLabels: schemaWeekLabels(underlag) },
    members: underlag.members, teachings, resurser: underlag.resurser, rooms: underlag.labels.rooms, egnaUtanTraff: underlag.egnaUtanTraff,
    basis: plan.version ? { versionNo: plan.version.versionNo, status: plan.version.status } : null,
    status: solution.status, days: underlag.problem.time.days.map(day => ({ startMin: day.start_min, endMin: day.end_min })),
    classes: underlag.labels.classes.filter(c => usedClasses.has(c.id)), teachers: underlag.labels.teachers.filter(t => usedTeachers.has(t.id)),
    lessons, omitted: underlag.omitted, diagnoses: solution.diagnoses.map(x => ({ message: named(x.message, underlag.labels), proof: x.proof })),
    metrics: { lessons: lessons.length, placed: solution.placements.length, unplaced: solution.unplaced.length,
      ...weeklyGaps(solution.metrics, underlag) },
    elapsedMs: solution.elapsedMs,
  };
}
