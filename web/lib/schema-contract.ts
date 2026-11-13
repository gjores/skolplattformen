/**
 * Schemamotorns kontrakt v1 sett från appen (05.2-SM-KOPPLING, -ELEVER-KALENDER). Typerna speglar `schemamotor/crates/model`;
 * motorns svar tolkas strikt mot det skickade underlaget innan något av det används.
 */
export const SCHEMA_CONTRACT_VERSION = 1 as const;
export const SCHEMA_TERMS = ['ht', 'vt'] as const;
export type SchemaTerm = typeof SCHEMA_TERMS[number];
/** Det schemat gäller: hela läsåret eller en termin (05.2-SM-LASAR-VILLKOR, L1). */
export const SCHEMA_PERIODS = ['lasar', 'ht', 'vt'] as const;
export type SchemaPeriod = typeof SCHEMA_PERIODS[number];
export const schemaTerms = (period: SchemaPeriod): SchemaTerm[] => period === 'lasar' ? [...SCHEMA_TERMS] : [period];
export const SCHEMA_LIMITS = { lessons: 20000, diagnoses: 500, message: 2000, violations: 20000, shownViolations: 200 } as const;
export const SCHEMA_STATUSES = ['complete', 'time_limit', 'infeasible', 'input_missing', 'cancelled'] as const;
export type SchemaStatus = typeof SCHEMA_STATUSES[number];

export type SchemaInterval = { day: number; start_min: number; end_min: number };
export type SchemaProblem = {
  version: typeof SCHEMA_CONTRACT_VERSION; id: string;
  time: { step_min: number; start_grid_min: number; days: { start_min: number; end_min: number }[] };
  periods?: { id: string }[];
  teachers: { id: string; max_min_per_day?: number }[];
  rooms?: { id: string; unavailable?: SchemaInterval[] }[];
  clusters: { id: string; size: number }[];
  groups: { id: string; clusters: string[] }[];
  /** `time`: undervisningens tid per termin ska ligga inom timplanens minuter och avrundningen uppåt (05.2-SM-TIMPLAN-EXAKT, E2–E3). */
  activities: { id: string; time?: { period?: string; weekday_days: number[]; min_min: number; max_min: number }[] }[];
  /** `counted_min`: minuter som räknas som undervisning när passet upptar mer tid (marginal). */
  lessons: { id: string; activity: string; duration_min: number; counted_min?: number; teachers: string[]; groups: string[]; periods?: string[];
    /** Tillåtna fönster: passet ska ligga helt inom ett av dem. Saknas fältet gäller hela skoldagen. */
    allowed?: SchemaInterval[]; rooms?: { count: 1; allowed: string[] } }[];
  rules: { student_max_min_per_day?: number; break_min: number; lunch: { window_start_min: number; window_end_min: number; length_min: number; teachers: boolean } | null; same_day: 'forbid' | 'avoid' | 'allow' };
  weights: { late_after_min: number | null };
};
/** `room`: salens löpnummer när passet ska ha en sal (05.2-SM-VILLKOR-PER-RESURS, R6). */
export type SchemaPlacement = { lesson: string; day: number; startMin: number; room: string | null };
export type SchemaDiagnosis = { code: string; message: string; proof: boolean };
export type SchemaSolution = { status: SchemaStatus; placements: SchemaPlacement[]; unplaced: string[]; diagnoses: SchemaDiagnosis[];
  metrics: { studentGapMin: number; teacherGapMin: number }; elapsedMs: number };

/**
 * Villkoren för schemat, satta av den som tar fram förslaget (05.2-SM-LASAR-VILLKOR, V1–V2). Alla tider är minuter efter midnatt
 * på 5-minutersrutnätet. `null` betyder att villkoret inte används.
 */
export type SchemaVillkor = {
  /** Skoldagen måndag–fredag. */
  days: { startMin: number; endMin: number }[];
  breakMin: number; startGridMin: number;
  lunch: { startMin: number; endMin: number; lengthMin: number; teachers: boolean } | null;
  maxLessonMin: number; minLessonMin: number; sameDay: 'forbid' | 'avoid' | 'allow';
  lateAfterMin: number | null; studentMaxMinPerDay: number | null; teacherMaxMinPerDay: number | null;
  /** Skolans salar, som namn. Motorn får dem som löpnummer i listans ordning. */
  salar: string[];
  /** Egna villkor för en klass, en grupp, ett ämne, en lärare eller en sal. */
  egna: SchemaRegel[];
};
/**
 * Ett eget villkor (05.2-SM-VILLKOR-PER-RESURS, R2–R6). `ref` är appens ID för klass, grupp och lärare, undervisningens namn för ämne och salens namn för sal.
 * Villkoren styr när och var passen läggs och hur veckotiden delas i pass, aldrig hur mycket tid som läggs (T1).
 */
export const SCHEMA_REGEL_SLAG = ['klass', 'grupp', 'amne', 'larare', 'sal'] as const;
export type SchemaRegelSlag = typeof SCHEMA_REGEL_SLAG[number];
export type SchemaRegel = { slag: SchemaRegelSlag; ref: string } & (
  | { typ: 'sparrad' | 'tillaten'; days: number[]; startMin: number; endMin: number }
  | { typ: 'marginal'; minutes: number }
  | { typ: 'langd'; maxMin: number }
  | { typ: 'antal'; count: number }
  | { typ: 'sal'; rooms: string[] });
export type SchemaRegelTyp = SchemaRegel['typ'];
/** Vilka villkor som kan ställas för vad. */
export const SCHEMA_REGEL_TYPER: Record<SchemaRegelSlag, SchemaRegelTyp[]> = {
  klass: ['sparrad', 'tillaten', 'marginal', 'langd', 'antal', 'sal'], grupp: ['sparrad', 'tillaten', 'marginal', 'langd', 'antal', 'sal'],
  amne: ['sparrad', 'tillaten', 'marginal', 'langd', 'antal', 'sal'], larare: ['sparrad', 'tillaten', 'marginal', 'sal'], sal: ['sparrad', 'tillaten'] };
export const SCHEMA_VILLKOR_LIMITS = { dayFrom: 6 * 60, dayTo: 20 * 60, daySpan: [60, 600], breakMin: [0, 30], startGrid: [5, 10, 15, 20, 30], lunchLength: [20, 90],
  maxLesson: [30, 180], minLesson: 10, perDay: [120, 600],
  salar: 100, salNamn: 60, egna: 200, ref: 2000, marginal: [5, 60], antal: [1, 10] } as const;
export function defaultSchemaVillkor(): SchemaVillkor {
  return { days: Array.from({ length: 5 }, () => ({ startMin: 8 * 60, endMin: 16 * 60 + 30 })), breakMin: 10, startGridMin: 10,
    lunch: { startMin: 10 * 60 + 30, endMin: 13 * 60 + 30, lengthMin: 40, teachers: true }, maxLessonMin: 80, minLessonMin: 20, sameDay: 'avoid',
    lateAfterMin: 15 * 60 + 30, studentMaxMinPerDay: null, teacherMaxMinPerDay: null, salar: [], egna: [] };
}
const WEEKDAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
/** Villkorens gränser i klartext. Tom lista: villkoren kan användas. Samma prövning görs i vyn och på servern. */
export function checkSchemaVillkor(v: SchemaVillkor): string[] {
  const L = SCHEMA_VILLKOR_LIMITS, issues: string[] = [];
  const whole = (n: unknown, low: number, high: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= low && n <= high && n % 5 === 0;
  if (!Array.isArray(v.days) || v.days.length !== 5) return ['Skoldagen ska anges för måndag–fredag.'];
  v.days.forEach((day, i) => {
    if (!whole(day?.startMin, L.dayFrom, L.dayTo) || !whole(day?.endMin, L.dayFrom, L.dayTo)) issues.push(`${WEEKDAY_NAMES[i]}: skoldagen ska ligga mellan 06:00 och 20:00, på hela fem minuter.`);
    else if (day.endMin - day.startMin < L.daySpan[0] || day.endMin - day.startMin > L.daySpan[1]) issues.push(`${WEEKDAY_NAMES[i]}: skoldagen ska vara mellan 1 och 10 timmar lång.`);
  });
  if (!whole(v.breakMin, L.breakMin[0], L.breakMin[1])) issues.push('Rasten ska vara 0–30 minuter, i steg om fem.');
  if (!L.startGrid.some(n => n === v.startGridMin)) issues.push('Starttider ska vara var 5:e, 10:e, 15:e, 20:e eller 30:e minut.');
  if (v.lunch !== null) {
    if (typeof v.lunch !== 'object' || typeof v.lunch.teachers !== 'boolean' || !whole(v.lunch.startMin, L.dayFrom, L.dayTo) || !whole(v.lunch.endMin, L.dayFrom, L.dayTo) || !whole(v.lunch.lengthMin, L.lunchLength[0], L.lunchLength[1]))
      issues.push('Lunchen ska vara 20–90 minuter inom ett fönster mellan 06:00 och 20:00, på hela fem minuter.');
    else if (v.lunch.startMin + v.lunch.lengthMin > v.lunch.endMin) issues.push('Lunchen ryms inte i lunchfönstret.');
  }
  if (!whole(v.maxLessonMin, L.maxLesson[0], L.maxLesson[1])) issues.push('Längsta pass ska vara 30–180 minuter, i steg om fem.');
  else if (!whole(v.minLessonMin, L.minLesson, Math.floor(v.maxLessonMin / 10) * 5)) issues.push('Kortaste pass ska vara minst 10 minuter och högst hälften av längsta pass, i steg om fem.');
  if (v.sameDay !== 'forbid' && v.sameDay !== 'avoid' && v.sameDay !== 'allow') issues.push('Välj hur samma ämne samma dag ska hanteras.');
  if (v.lateAfterMin !== null && !whole(v.lateAfterMin, L.dayFrom, L.dayTo)) issues.push('Klockslaget för sen dag ska ligga mellan 06:00 och 20:00, på hela fem minuter.');
  for (const [value, who] of [[v.studentMaxMinPerDay, 'elever'], [v.teacherMaxMinPerDay, 'lärare']] as const)
    if (value !== null && !whole(value, L.perDay[0], L.perDay[1])) issues.push(`Högsta undervisningstid per dag för ${who} ska vara 2–10 timmar, i steg om fem minuter.`);
  const names = (value: unknown, limit: number): value is string[] => Array.isArray(value) && value.length <= limit
    && value.every(x => typeof x === 'string' && x.length > 0 && x.length <= L.salNamn && x === x.trim()) && new Set(value.map(x => (x as string).toLowerCase())).size === value.length;
  if (!names(v.salar, L.salar)) return [...issues, `Salar ska ha olika namn om högst ${L.salNamn} tecken, och vara högst ${L.salar}.`];
  if (!Array.isArray(v.egna) || v.egna.length > L.egna) return [...issues, `Egna villkor får vara högst ${L.egna}.`];
  v.egna.forEach((r, i) => {
    const issue = (text: string) => issues.push(`Eget villkor ${i + 1}: ${text}`);
    if (r === null || typeof r !== 'object' || !SCHEMA_REGEL_SLAG.includes(r.slag) || typeof r.ref !== 'string' || !r.ref || r.ref.length > L.ref) return issue('välj vad villkoret gäller.');
    if (!SCHEMA_REGEL_TYPER[r.slag].includes(r.typ)) return issue('villkoret kan inte ställas för det valda.');
    if (r.slag === 'sal' && !v.salar.includes(r.ref)) return issue('salen finns inte bland salarna.');
    if (r.typ === 'sparrad' || r.typ === 'tillaten') {
      if (!Array.isArray(r.days) || !r.days.length || new Set(r.days).size !== r.days.length || r.days.some(d => !Number.isSafeInteger(d) || d < 0 || d > 4)) return issue('välj minst en veckodag.');
      if (!whole(r.startMin, 0, 1435) || !whole(r.endMin, 5, 1440) || r.startMin >= r.endMin) return issue('tiden ska sluta efter att den börjar, på hela fem minuter.');
    } else if (r.typ === 'marginal') { if (!whole(r.minutes, L.marginal[0], L.marginal[1])) return issue('marginalen ska vara 5–60 minuter, i steg om fem.'); }
    else if (r.typ === 'langd') { if (!whole(r.maxMin, L.maxLesson[0], L.maxLesson[1])) return issue('längsta pass ska vara 30–180 minuter, i steg om fem.'); }
    else if (r.typ === 'antal') { if (!Number.isSafeInteger(r.count) || r.count < L.antal[0] || r.count > L.antal[1]) return issue('antalet pass per vecka ska vara 1–10.'); }
    else if (r.typ === 'sal') { if (!names(r.rooms, L.salar) || !r.rooms.length || r.rooms.some(x => !v.salar.includes(x))) return issue('välj minst en av skolans salar.'); }
  });
  return issues;
}
export type SchemaForslagRequest = { unitId: string; schoolYear: number; period: SchemaPeriod; villkor: SchemaVillkor };
/** Elever och gruppmedlemskap som underlag för elevkluster. Stannar på servern; motorn får bara klustrens storlek. */
export type SchemaMembers = { pupils: { id: string; classIds: string[] }[]; memberships: { groupId: string; pupilId: string; startsOn: string; endsOn: string | null }[] };
/**
 * Läsårets tid per termin: skoldagar per veckodag (måndag–fredag) för skolan och per klass med egna lärotider.
 * `forval` betyder att läsårskalender saknas och att ett fast antal veckor har antagits.
 */
export type SchemaTermTime = { span: { start: string; end: string } | null; perWeekday: number[]; classes: Record<string, number[]> };
export type SchemaTime = { source: 'kalender' | 'forval'; version: number | null; status: string | null; current: boolean; terms: Record<SchemaTerm, SchemaTermTime> };
export type SchemaForslagLesson = { id: string; title: string; classIds: string[]; teacherIds: string[]; durationMin: number; vacant: boolean;
  /** Tid efter passet som lärare och elever är upptagna, utöver rasten (marginal till nästa lektion, R4). */
  marginMin: number;
  /** Salar passet får ligga i (tom: passet har ingen sal) och salen det ligger i. */
  roomIds: string[]; roomId: string | null;
  /** Terminen passet går, när det inte går hela den valda perioden. */
  term: SchemaTerm | null; day: number | null; startMin: number | null };
/** Kontroll av ett för hand ändrat förslag (05.2-SM-FLYTT, F1–F3): alla lagda pass skickas, tillsammans med förslagets fingeravtryck. */
export type SchemaKontrollRequest = SchemaForslagRequest & { fingerprint: string; placements: SchemaPlacement[] };
export type SchemaRawViolation = { code: string; message: string; lessons: string[]; resources: string[] };
export type SchemaViolation = { code: string; message: string; lessons: string[] };
/** Regelbrott i hela schemat efter en flytt. `total` kan vara större än antalet som visas. */
export type SchemaCheck = { violations: SchemaRawViolation[]; metrics: SchemaSolution['metrics'] };
export type SchemaKontroll = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; fingerprint: string; violations: SchemaViolation[]; total: number;
  teachings: SchemaForslagTeaching[]; metrics: SchemaForslag['metrics'];
  /** Salen för varje lagt pass som ska ha en sal. */
  rooms: Record<string, string> };
export type SchemaOmission = { title: string; classes: string[]; reason: 'no_time' | 'too_short' | 'no_days' };
/**
 * Timplanen är ram (T1): `deviation` säger om och varför utlagd tid inte är timplanens. Tillåten tid per termin är `needMin` till och med `maxMin`:
 * timplanens minuter och avrundning uppåt under 5 minuter per vecka (05.2-SM-TIMPLAN-EXAKT, E2). `unplaced`: pass utan tid. `weekly`: passlängderna
 * kan inte ge den tiden på några veckodagar. `calendar`: passen ligger så att tiden blir under timplanen eller över avrundningen.
 */
export type SchemaTimplanDeviation = 'unplaced' | 'weekly' | 'calendar';
export type SchemaForslagTeaching = { title: string; classes: string[]; needMin: number; weeklyMin: number; plannedMin: number; unplaced: number;
  terms: { term: SchemaTerm; needMin: number; maxMin: number; plannedMin: number }[]; deviation: SchemaTimplanDeviation | null };
/** Det egna villkor kan ställas för. `ref` är det villkoret bär; namnet visas. */
export type SchemaResurs = { ref: string; name: string };
export type SchemaForslag = {
  contractVersion: typeof SCHEMA_CONTRACT_VERSION; unitId: string; schoolYear: number; period: SchemaPeriod; schoolName: string;
  /** Villkoren förslaget räknades med. */
  villkor: SchemaVillkor;
  /** Klasser, grupper, ämnen och lärare i underlaget, för egna villkor. Bara här bär svaret appens ID; pass, klasser och lärare i schemat har löpnummer för körningen. */
  resurser: Record<Exclude<SchemaRegelSlag, 'sal'>, SchemaResurs[]>;
  /** Salarnas löpnummer och namn. */
  rooms: { id: string; name: string }[];
  /** Egna villkor (plats i `villkor.egna`) som inte träffade något i underlaget och därför inte användes. */
  egnaUtanTraff: number[];
  /** Underlagets fingeravtryck: ändras underlaget gäller inte förslaget längre för flytt. Ingen säkerhetsfunktion; servern bygger alltid underlaget själv. */
  fingerprint: string; startGridMin: number;
  time: { source: SchemaTime['source']; version: number | null; status: string | null; current: boolean; schoolDays: number; weeks: number;
    terms: { term: SchemaTerm; schoolDays: number }[] };
  members: { pupils: number; groupsWithoutMembers: string[]; classesWithoutPupils: string[]; withoutChoice: { title: string; count: number }[] };
  teachings: SchemaForslagTeaching[];
  basis: { versionNo: number; status: string } | null;
  status: SchemaStatus; days: { startMin: number; endMin: number }[];
  classes: { id: string; name: string }[]; teachers: { id: string; name: string }[];
  lessons: SchemaForslagLesson[]; omitted: SchemaOmission[]; diagnoses: { message: string; proof: boolean }[];
  metrics: { lessons: number; placed: number; unplaced: number; studentGapMin: number; teacherGapMin: number }; elapsedMs: number;
};

export class SchemaContractError extends TypeError {
  constructor() { super('Schemaunderlaget kunde inte kontrolleras.'); this.name = 'SchemaContractError'; }
}
function bad(): never { throw new SchemaContractError(); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) bad();
  return value as Record<string, unknown>;
}
function int(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) bad();
  return value;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) bad();
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) bad();
  return value;
}

const FINGERPRINT = /^[0-9a-f]{28}$/u;
/** Ett eget villkor i fast form: exakt fälten för sin typ. Värdena prövas av `checkSchemaVillkor`. */
function regel(value: unknown): SchemaRegel {
  const r = record(value), base = { slag: r.slag as SchemaRegelSlag, ref: text(r.ref, SCHEMA_VILLKOR_LIMITS.ref) };
  const keys = (n: number) => { if (Object.keys(r).length !== n) bad(); };
  if (r.typ === 'sparrad' || r.typ === 'tillaten') { keys(6); return { ...base, typ: r.typ, days: list(r.days, 5).map(d => int(d, 0, 4)), startMin: int(r.startMin, 0, 1440), endMin: int(r.endMin, 0, 1440) }; }
  if (r.typ === 'marginal') { keys(4); return { ...base, typ: 'marginal', minutes: int(r.minutes, 0, 1440) }; }
  if (r.typ === 'langd') { keys(4); return { ...base, typ: 'langd', maxMin: int(r.maxMin, 0, 1440) }; }
  if (r.typ === 'antal') { keys(4); return { ...base, typ: 'antal', count: int(r.count, 0, 1000) }; }
  if (r.typ === 'sal') { keys(4); return { ...base, typ: 'sal', rooms: list(r.rooms, SCHEMA_VILLKOR_LIMITS.salar).map(x => text(x, SCHEMA_VILLKOR_LIMITS.salNamn)) }; }
  return bad();
}
/** Villkoren i fast form: okända eller saknade fält och värden utanför gränserna nekas. */
export function parseSchemaVillkor(value: unknown): SchemaVillkor {
  const r = record(value), keys = Object.keys(defaultSchemaVillkor());
  if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) bad();
  const minutes = (n: unknown) => n === null ? null : int(n, 0, 1440);
  const days = list(r.days, 5).map(raw => { const day = record(raw); if (Object.keys(day).length !== 2) bad(); return { startMin: int(day.startMin, 0, 1440), endMin: int(day.endMin, 0, 1440) }; });
  let lunch: SchemaVillkor['lunch'] = null;
  if (r.lunch !== null) {
    const l = record(r.lunch);
    if (Object.keys(l).length !== 4 || typeof l.teachers !== 'boolean') bad();
    lunch = { startMin: int(l.startMin, 0, 1440), endMin: int(l.endMin, 0, 1440), lengthMin: int(l.lengthMin, 0, 1440), teachers: l.teachers };
  }
  const villkor: SchemaVillkor = { days, breakMin: int(r.breakMin, 0, 1440), startGridMin: int(r.startGridMin, 1, 1440), lunch, maxLessonMin: int(r.maxLessonMin, 0, 1440), minLessonMin: int(r.minLessonMin, 0, 1440),
    sameDay: r.sameDay as SchemaVillkor['sameDay'], lateAfterMin: minutes(r.lateAfterMin), studentMaxMinPerDay: minutes(r.studentMaxMinPerDay), teacherMaxMinPerDay: minutes(r.teacherMaxMinPerDay),
    salar: list(r.salar, SCHEMA_VILLKOR_LIMITS.salar).map(x => text(x, SCHEMA_VILLKOR_LIMITS.salNamn)), egna: list(r.egna, SCHEMA_VILLKOR_LIMITS.egna).map(regel) };
  if (checkSchemaVillkor(villkor).length) bad();
  return villkor;
}
export function parseSchemaForslagRequest(value: unknown, keys = 4): SchemaForslagRequest {
  const r = record(value);
  if (Object.keys(r).length !== keys) bad();
  const unitId = text(r.unitId, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(unitId)) bad();
  const period = SCHEMA_PERIODS.find(p => p === r.period) ?? bad();
  return { unitId, schoolYear: int(r.schoolYear, 2000, 2100), period, villkor: parseSchemaVillkor(r.villkor) };
}

function teaching(t: SchemaForslagTeaching): void {
  text(t.title, 2000); list(t.classes, 2000); int(t.needMin, 0, 10_000_000); int(t.plannedMin, 0, 10_000_000); int(t.weeklyMin, 0, 10_080); int(t.unplaced, 0, 1000);
  if (t.deviation !== null && t.deviation !== 'unplaced' && t.deviation !== 'weekly' && t.deviation !== 'calendar') bad();
  for (const x of list(t.terms, 2) as SchemaForslagTeaching['terms']) { if (!SCHEMA_TERMS.includes(record(x).term as SchemaTerm)) bad(); int(x.needMin, 0, 10_000_000); int(x.maxMin, 0, 10_000_000); int(x.plannedMin, 0, 10_000_000); }
}
const ROOM = /^sal-\d{1,3}$/u;
/** Placeringarnas form. Att passen finns, ligger en gång och inom skoldagen prövas mot underlaget med `checkSchemaPlacements`. */
export function parseSchemaKontrollRequest(value: unknown): SchemaKontrollRequest {
  const r = record(value), base = parseSchemaForslagRequest(value, 6);
  if (typeof r.fingerprint !== 'string' || !FINGERPRINT.test(r.fingerprint)) bad();
  const placements = list(r.placements, SCHEMA_LIMITS.lessons).map(raw => {
    const p = record(raw);
    if (Object.keys(p).length !== 4 || p.room !== null && !ROOM.test(text(p.room, 10))) bad();
    return { lesson: text(p.lesson, 100), day: int(p.day, 0, 6), startMin: int(p.startMin, 0, 1440), room: p.room as string | null };
  });
  return { ...base, fingerprint: r.fingerprint, placements };
}
/**
 * Passet ska finnas, ligga en gång och inom skoldagen, och en sal ska vara en av passets tillåtna. Ett pass som ska ha en sal men saknar en
 * får den första tillåtna som är ledig, annars den första tillåtna (R6); en upptagen sal redovisas då av kontrollanten.
 */
export function checkSchemaPlacements(placements: SchemaPlacement[], problem: SchemaProblem): SchemaPlacement[] {
  const lesson = new Map(problem.lessons.map(l => [l.id, l])), seen = new Set<string>();
  for (const p of placements) {
    const l = lesson.get(p.lesson), frame = problem.time.days[p.day];
    if (l === undefined || seen.has(p.lesson) || !frame || p.startMin < frame.start_min || p.startMin > frame.end_min - l.duration_min) bad();
    if (p.room !== null && !l.rooms?.allowed.includes(p.room)) bad();
    seen.add(p.lesson);
  }
  const meets = (a: SchemaPlacement, b: SchemaPlacement) => a.day === b.day && a.startMin < b.startMin + lesson.get(b.lesson)!.duration_min && b.startMin < a.startMin + lesson.get(a.lesson)!.duration_min;
  const result = placements.map(p => ({ ...p }));
  for (const p of result) {
    const allowed = lesson.get(p.lesson)!.rooms?.allowed;
    if (p.room === null && allowed) p.room = allowed.find(room => !result.some(o => o !== p && o.room === room && meets(o, p))) ?? allowed[0];
  }
  return result;
}
/** Kontrollantens svar från motorn: bara pass som finns i underlaget får pekas ut. */
export function parseSchemaCheck(value: unknown, problem: SchemaProblem): SchemaCheck {
  const s = record(value), known = new Set(problem.lessons.map(l => l.id)), m = record(s.metrics);
  if (s.version !== SCHEMA_CONTRACT_VERSION || s.problem_id !== problem.id) bad();
  const violations = list(s.violations, SCHEMA_LIMITS.violations).map(raw => {
    const v = record(raw), lessons = list(v.lessons, SCHEMA_LIMITS.lessons).map(id => text(id, 100));
    if (lessons.some(id => !known.has(id))) bad();
    return { code: text(v.code, 100), message: text(v.message, SCHEMA_LIMITS.message), lessons, resources: list(v.resources, SCHEMA_LIMITS.lessons).map(id => text(id, 100)) };
  });
  return { violations, metrics: { studentGapMin: int(m.student_gap_min, 0, Number.MAX_SAFE_INTEGER), teacherGapMin: int(m.teacher_gap_min, 0, Number.MAX_SAFE_INTEGER) } };
}
/** Klientens tolkning av kontrollruttens svar. */
export function parseSchemaKontroll(value: unknown, fingerprint: string): SchemaKontroll {
  const k = record(value);
  if (k.contractVersion !== SCHEMA_CONTRACT_VERSION || k.fingerprint !== fingerprint) bad();
  const violations = list(k.violations, SCHEMA_LIMITS.shownViolations).map(raw => {
    const v = record(raw);
    return { code: text(v.code, 100), message: text(v.message, SCHEMA_LIMITS.message), lessons: list(v.lessons, SCHEMA_LIMITS.lessons).map(id => text(id, 100)) };
  });
  const teachings = list(k.teachings, SCHEMA_LIMITS.lessons) as SchemaForslagTeaching[], m = record(k.metrics) as SchemaForslag['metrics'], rooms = record(k.rooms) as Record<string, string>;
  for (const room of Object.values(rooms)) if (!ROOM.test(text(room, 10))) bad();
  for (const t of teachings) teaching(record(t) as SchemaForslagTeaching);
  for (const key of ['lessons', 'placed', 'unplaced', 'studentGapMin', 'teacherGapMin'] as const) int(m[key], 0, Number.MAX_SAFE_INTEGER);
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint, violations, total: int(k.total, violations.length, SCHEMA_LIMITS.violations), teachings, metrics: m, rooms };
}

/**
 * Motorns svar. Varje pass ska vara känt i underlaget, lagt högst en gång och ligga helt inom sin skoldag;
 * lagda och olagda pass ska tillsammans vara underlagets alla pass. Om reglerna i övrigt hålls prövas av motorns kontrollant.
 */
export function parseSchemaSolution(value: unknown, problem: SchemaProblem): SchemaSolution {
  const s = record(value);
  if (s.version !== SCHEMA_CONTRACT_VERSION || s.problem_id !== problem.id) bad();
  const status = SCHEMA_STATUSES.find(x => x === s.status) ?? bad();
  const duration = new Map(problem.lessons.map(l => [l.id, l.duration_min])), wanted = new Map(problem.lessons.map(l => [l.id, l.rooms?.allowed])), seen = new Set<string>();
  const placements = list(s.placements, SCHEMA_LIMITS.lessons).map(raw => {
    const p = record(raw), lesson = text(p.lesson, 100), length = duration.get(lesson);
    if (length === undefined || seen.has(lesson)) bad();
    seen.add(lesson);
    const day = int(p.day, 0, problem.time.days.length - 1), frame = problem.time.days[day];
    const startMin = int(p.start_min, frame.start_min, frame.end_min - length);
    // Sal: precis en av de tillåtna när passet ska ha en sal, annars ingen.
    const rooms = list(p.rooms ?? [], 1).map(id => text(id, 10)), allowed = wanted.get(lesson);
    if (allowed ? rooms.length !== 1 || !allowed.includes(rooms[0]) : rooms.length !== 0) bad();
    return { lesson, day, startMin, room: rooms[0] ?? null };
  });
  const unplaced = list(s.unplaced, SCHEMA_LIMITS.lessons).map(raw => {
    const lesson = text(raw, 100);
    if (!duration.has(lesson) || seen.has(lesson)) bad();
    seen.add(lesson);
    return lesson;
  });
  if (seen.size !== duration.size) bad();
  const diagnoses = list(s.diagnoses, SCHEMA_LIMITS.diagnoses).map(raw => {
    const d = record(raw);
    return { code: text(d.code, 100), message: text(d.message, SCHEMA_LIMITS.message), proof: d.proof === true };
  });
  const m = record(s.metrics), stats = record(s.stats);
  return { status, placements, unplaced, diagnoses,
    metrics: { studentGapMin: int(m.student_gap_min, 0, Number.MAX_SAFE_INTEGER), teacherGapMin: int(m.teacher_gap_min, 0, Number.MAX_SAFE_INTEGER) },
    elapsedMs: int(stats.elapsed_ms, 0, Number.MAX_SAFE_INTEGER) };
}

/** Klientens tolkning av ruttens svar: formen prövas så att vyn aldrig ritar ett halvt förslag. */
export function parseSchemaForslag(value: unknown, expected: SchemaForslagRequest): SchemaForslag {
  const f = record(value) as SchemaForslag;
  if (f.contractVersion !== SCHEMA_CONTRACT_VERSION || f.unitId !== expected.unitId || f.schoolYear !== expected.schoolYear
    || f.period !== expected.period || JSON.stringify(parseSchemaVillkor(f.villkor)) !== JSON.stringify(parseSchemaVillkor(expected.villkor)) || !SCHEMA_STATUSES.includes(f.status)) bad();
  for (const key of ['days', 'classes', 'teachers', 'lessons', 'omitted', 'diagnoses', 'teachings', 'rooms', 'egnaUtanTraff'] as const) list(f[key], SCHEMA_LIMITS.lessons);
  const resurser = record(f.resurser);
  for (const slag of ['klass', 'grupp', 'amne', 'larare'] as const) for (const x of list(resurser[slag], SCHEMA_LIMITS.lessons)) { text(record(x).ref, SCHEMA_VILLKOR_LIMITS.ref); text(record(x).name, 2000); }
  for (const x of f.rooms) { if (!ROOM.test(text(record(x).id, 10))) bad(); text(x.name, SCHEMA_VILLKOR_LIMITS.salNamn); }
  for (const i of f.egnaUtanTraff) int(i, 0, SCHEMA_VILLKOR_LIMITS.egna);
  record(f.metrics); text(f.schoolName, 500); int(f.startGridMin, 1, 1440);
  if (typeof f.fingerprint !== 'string' || !FINGERPRINT.test(f.fingerprint)) bad();
  const time = record(f.time), members = record(f.members);
  if (time.source !== 'kalender' && time.source !== 'forval' || typeof time.weeks !== 'number' || !(time.weeks > 0)) bad();
  int(time.schoolDays, 0, 366); list(time.terms, 2); int(members.pupils, 0, 1_000_000);
  for (const key of ['groupsWithoutMembers', 'classesWithoutPupils', 'withoutChoice'] as const) list(members[key], SCHEMA_LIMITS.lessons);
  for (const t of f.teachings) teaching(t);
  for (const l of f.lessons) {
    text(l.id, 100); text(l.title, 2000); list(l.classIds, 2000); list(l.teacherIds, 2000); int(l.durationMin, 1, 1440); int(l.marginMin, 0, 60);
    const rooms = list(l.roomIds, SCHEMA_VILLKOR_LIMITS.salar);
    if (l.roomId !== null && !rooms.includes(l.roomId)) bad();
    if (l.term !== null && !SCHEMA_TERMS.includes(l.term)) bad();
    if (l.day !== null) { int(l.day, 0, f.days.length - 1); int(l.startMin, 0, 1440); }
  }
  return f;
}
