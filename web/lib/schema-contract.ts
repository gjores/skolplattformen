/**
 * Schemamotorns kontrakt v1 sett från appen (05.2-SM-KOPPLING, -ELEVER-KALENDER). Typerna speglar `schemamotor/crates/model`;
 * motorns svar tolkas strikt mot det skickade underlaget innan något av det används.
 */
export const SCHEMA_CONTRACT_VERSION = 1 as const;
export const SCHEMA_TERMS = ['ht', 'vt'] as const;
export type SchemaTerm = typeof SCHEMA_TERMS[number];
export const SCHEMA_LIMITS = { lessons: 20000, diagnoses: 500, message: 2000 } as const;
export const SCHEMA_STATUSES = ['complete', 'time_limit', 'infeasible', 'input_missing', 'cancelled'] as const;
export type SchemaStatus = typeof SCHEMA_STATUSES[number];

export type SchemaInterval = { day: number; start_min: number; end_min: number };
export type SchemaProblem = {
  version: typeof SCHEMA_CONTRACT_VERSION; id: string;
  time: { step_min: number; start_grid_min: number; days: { start_min: number; end_min: number }[] };
  teachers: { id: string }[];
  clusters: { id: string; size: number }[];
  groups: { id: string; clusters: string[] }[];
  activities: { id: string }[];
  lessons: { id: string; activity: string; duration_min: number; teachers: string[]; groups: string[] }[];
  rules: { break_min: number; lunch: { window_start_min: number; window_end_min: number; length_min: number; teachers: boolean } | null; same_day: 'forbid' | 'avoid' | 'allow' };
  weights: { late_after_min: number | null };
};
export type SchemaPlacement = { lesson: string; day: number; startMin: number };
export type SchemaDiagnosis = { code: string; message: string; proof: boolean };
export type SchemaSolution = { status: SchemaStatus; placements: SchemaPlacement[]; unplaced: string[]; diagnoses: SchemaDiagnosis[];
  metrics: { studentGapMin: number; teacherGapMin: number }; elapsedMs: number };

export type SchemaForslagRequest = { unitId: string; schoolYear: number; term: SchemaTerm };
/** Elever och gruppmedlemskap som underlag för elevkluster. Stannar på servern; motorn får bara klustrens storlek. */
export type SchemaMembers = { pupils: { id: string; classIds: string[] }[]; memberships: { groupId: string; pupilId: string; startsOn: string; endsOn: string | null }[] };
/**
 * Terminens tid: skoldagar per veckodag (måndag–fredag) för skolan och per klass med egna lärotider.
 * `forval` betyder att läsårskalender saknas och att ett fast antal veckor har antagits.
 */
export type SchemaTime = { source: 'kalender' | 'forval'; version: number | null; status: string | null; current: boolean;
  term: { start: string; end: string } | null; perWeekday: number[]; classes: Record<string, number[]> };
export type SchemaForslagLesson = { id: string; title: string; classIds: string[]; teacherIds: string[]; durationMin: number; vacant: boolean;
  day: number | null; startMin: number | null };
export type SchemaOmission = { title: string; classes: string[]; reason: 'no_time' | 'too_short' | 'no_days' };
/** Namnsatt förslag till klienten. Id:n är löpnummer för den här körningen, aldrig appens eller en källas ID. */
export type SchemaForslagTeaching = { title: string; classes: string[]; needMin: number; weeklyMin: number; plannedMin: number; unplaced: number };
export type SchemaForslag = {
  contractVersion: typeof SCHEMA_CONTRACT_VERSION; unitId: string; schoolYear: number; term: SchemaTerm; schoolName: string;
  time: { source: SchemaTime['source']; version: number | null; status: string | null; current: boolean; schoolDays: number; weeks: number };
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

export function parseSchemaForslagRequest(value: unknown): SchemaForslagRequest {
  const r = record(value);
  if (Object.keys(r).length !== 3) bad();
  const unitId = text(r.unitId, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(unitId)) bad();
  if (r.term !== 'ht' && r.term !== 'vt') bad();
  return { unitId, schoolYear: int(r.schoolYear, 2000, 2100), term: r.term };
}

/**
 * Motorns svar. Varje pass ska vara känt i underlaget, lagt högst en gång och ligga helt inom sin skoldag;
 * lagda och olagda pass ska tillsammans vara underlagets alla pass. Om reglerna i övrigt hålls prövas av motorns kontrollant.
 */
export function parseSchemaSolution(value: unknown, problem: SchemaProblem): SchemaSolution {
  const s = record(value);
  if (s.version !== SCHEMA_CONTRACT_VERSION || s.problem_id !== problem.id) bad();
  const status = SCHEMA_STATUSES.find(x => x === s.status) ?? bad();
  const duration = new Map(problem.lessons.map(l => [l.id, l.duration_min])), seen = new Set<string>();
  const placements = list(s.placements, SCHEMA_LIMITS.lessons).map(raw => {
    const p = record(raw), lesson = text(p.lesson, 100), length = duration.get(lesson);
    if (length === undefined || seen.has(lesson)) bad();
    seen.add(lesson);
    const day = int(p.day, 0, problem.time.days.length - 1), frame = problem.time.days[day];
    const startMin = int(p.start_min, frame.start_min, frame.end_min - length);
    return { lesson, day, startMin };
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
    || f.term !== expected.term || !SCHEMA_STATUSES.includes(f.status)) bad();
  for (const key of ['days', 'classes', 'teachers', 'lessons', 'omitted', 'diagnoses', 'teachings'] as const) list(f[key], SCHEMA_LIMITS.lessons);
  record(f.metrics); text(f.schoolName, 500);
  const time = record(f.time), members = record(f.members);
  if (time.source !== 'kalender' && time.source !== 'forval' || typeof time.weeks !== 'number' || !(time.weeks > 0)) bad();
  int(time.schoolDays, 0, 366); int(members.pupils, 0, 1_000_000);
  for (const key of ['groupsWithoutMembers', 'classesWithoutPupils', 'withoutChoice'] as const) list(members[key], SCHEMA_LIMITS.lessons);
  for (const t of f.teachings) { text(t.title, 2000); list(t.classes, 2000); int(t.needMin, 0, 10_000_000); int(t.plannedMin, 0, 10_000_000); int(t.weeklyMin, 0, 10_080); int(t.unplaced, 0, 1000); }
  for (const l of f.lessons) {
    text(l.id, 100); text(l.title, 2000); list(l.classIds, 2000); list(l.teacherIds, 2000); int(l.durationMin, 1, 1440);
    if (l.day !== null) { int(l.day, 0, f.days.length - 1); int(l.startMin, 0, 1440); }
  }
  return f;
}
