/** Placeringsförslag (05.2-SM-PLACERING). Alla ändringar jämförs med just den begärda utgångspunkten. Inget sparas. */
import { SCHEMA_CONTRACT_VERSION, SCHEMA_LIMITS, SchemaContractError, checkSchemaPlacements, parseSchemaKontrollRequest,
  type SchemaKontrollRequest, type SchemaPlacement, type SchemaProblem } from './schema-contract.ts';

export type SchemaPlaceringVal = { mode: 'lesson' | 'target' | 'rest'; lesson: string | null; target: Omit<SchemaPlacement, 'lesson'> | null; depth: 1 | 2 | 3 };
export type SchemaPlaceringRequest = SchemaKontrollRequest & SchemaPlaceringVal;
export type SchemaPlaceringMetrics = { studentGapMin: number; teacherGapMin: number; cost: number };
export type SchemaPlaceringsforslag = { placements: SchemaPlacement[]; changes: { lesson: string; from: SchemaPlacement | null; to: SchemaPlacement }[];
  metricsBefore: SchemaPlaceringMetrics; metricsAfter: SchemaPlaceringMetrics; cost: number };
export type SchemaPlacering = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; grundFingerprint: string; depth: 1 | 2 | 3; timedOut: boolean; elapsedMs: number; suggestions: SchemaPlaceringsforslag[] };
export type SchemaPlaceringFailure = 'schema_placement_invalid_baseline' | 'schema_placement_locked_lesson' | 'schema_placement_bad_target' | 'schema_placement_rooms_changed' | 'schema_placement_rest_empty';
export class SchemaPlaceringError extends SchemaContractError {
  public reason: SchemaPlaceringFailure;
  constructor(reason: SchemaPlaceringFailure) { super(); this.reason = reason; this.name = 'SchemaPlaceringError'; }
}

function bad(): never { throw new SchemaContractError(); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) bad(); return value as Record<string, unknown>; }
function int(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad(); return value; }
function list(value: unknown, max: number = SCHEMA_LIMITS.lessons): unknown[] { if (!Array.isArray(value) || value.length > max) bad(); return value; }
function id(value: unknown): string { if (typeof value !== 'string' || !/^pass-\d{1,10}$/u.test(value)) bad(); return value; }
function room(value: unknown): string | null { if (value !== null && (typeof value !== 'string' || !/^sal-\d{1,3}$/u.test(value))) bad(); return value as string | null; }
function keys(r: Record<string, unknown>, expected: string[]) { if (Object.keys(r).length !== expected.length || expected.some(k => !Object.hasOwn(r, k))) bad(); }
const same = (a: SchemaPlacement | null | undefined, b: SchemaPlacement | null | undefined) => !a || !b ? a == null && b == null : a.lesson === b.lesson && a.day === b.day && a.startMin === b.startMin && a.room === b.room;
const sorted = (at: SchemaPlacement[]) => [...at].sort((a, b) => a.lesson.localeCompare(b.lesson));
export function sammaSchemaPlaceringar(a: SchemaPlacement[], b: SchemaPlacement[]): boolean {
  if (a.length !== b.length) return false;
  const other = sorted(b); return sorted(a).every((p, i) => same(p, other[i]));
}

function appAt(value: unknown): SchemaPlacement {
  const p = record(value); keys(p, ['lesson', 'day', 'startMin', 'room']);
  return { lesson: id(p.lesson), day: int(p.day, 0, 6), startMin: int(p.startMin, 0, 1440), room: room(p.room) };
}
function targetAt(value: unknown): SchemaPlaceringVal['target'] {
  if (value === null) return null;
  const p = record(value); keys(p, ['day', 'startMin', 'room']);
  return { day: int(p.day, 0, 6), startMin: int(p.startMin, 0, 1440), room: room(p.room) };
}
export function parseSchemaPlaceringRequest(value: unknown): SchemaPlaceringRequest {
  const r = record(value), { mode, lesson, target, depth, ...control } = r;
  const base = parseSchemaKontrollRequest(control);
  if (mode !== 'lesson' && mode !== 'target' && mode !== 'rest' || depth !== 1 && depth !== 2 && depth !== 3) bad();
  const selected = lesson === null ? null : id(lesson), wanted = targetAt(target);
  if (mode === 'rest' ? selected !== null || wanted !== null : selected === null || (mode === 'target' ? wanted === null : wanted !== null)) bad();
  const seen = new Set<string>();
  for (const p of base.placements) { id(p.lesson); if (seen.has(p.lesson)) bad(); seen.add(p.lesson); }
  return { ...base, mode, lesson: selected, target: wanted, depth };
}

/** Normalisering får inte byta en sal bakom före/efter-listan. Olåsta saknade pass får ligga kvar på viloytan. */
export function checkSchemaPlaceringRequest(input: SchemaPlaceringRequest, problem: SchemaProblem): SchemaPlacement[] {
  const known = new Map(problem.lessons.map(l => [l.id, l])), placed = new Set(input.placements.map(p => p.lesson));
  if (input.lesson !== null) {
    const lesson = known.get(input.lesson); if (!lesson) bad();
    if (lesson.locked) throw new SchemaPlaceringError('schema_placement_locked_lesson');
    const target = input.target;
    if (target) {
      const day = problem.time.days[target.day], before = Math.max(0, ...Object.values(lesson.margin ?? {}).map(m => m.before_min)), after = Math.max(0, ...Object.values(lesson.margin ?? {}).map(m => m.after_min));
      if (!day || target.startMin < day.start_min + before || target.startMin + lesson.duration_min + after > day.end_min
        || (target.startMin - day.start_min) % problem.time.start_grid_min !== 0 || target.room !== null && !lesson.rooms?.allowed.includes(target.room)) throw new SchemaPlaceringError('schema_placement_bad_target');
    }
  } else if (problem.lessons.every(l => placed.has(l.id))) throw new SchemaPlaceringError('schema_placement_rest_empty');
  // En parkerad fast aktivitet får läggas på sin fasta tid av rest-sökningen. Bara redan lagda lås krävs i utgångspunkten.
  const baselineProblem = { ...problem, lessons: problem.lessons.map(l => placed.has(l.id) ? l : { ...l, locked: undefined }) };
  const at = checkSchemaPlacements(input.placements, baselineProblem);
  for (const p of at) {
    const lock = known.get(p.lesson)?.locked;
    if (lock?.rooms?.length && (lock.rooms.length !== 1 || lock.rooms[0] !== p.room)) bad();
  }
  if (!sammaSchemaPlaceringar(at, input.placements)) throw new SchemaPlaceringError('schema_placement_rooms_changed');
  return at;
}

function metrics(value: unknown, motor = false): SchemaPlaceringMetrics {
  const m = record(value);
  return { studentGapMin: int(m[motor ? 'student_gap_min' : 'studentGapMin']), teacherGapMin: int(m[motor ? 'teacher_gap_min' : 'teacherGapMin']), cost: int(m.cost, -Number.MAX_SAFE_INTEGER) };
}
function motorAt(value: unknown, problem: SchemaProblem, lessons: ReadonlyMap<string, SchemaProblem['lessons'][number]>): SchemaPlacement {
  const p = record(value), lesson = id(p.lesson), l = lessons.get(lesson);
  if (!l || Object.keys(p).some(k => !['lesson', 'day', 'start_min', 'rooms'].includes(k))) bad();
  const day = int(p.day, 0, problem.time.days.length - 1), frame = problem.time.days[day], startMin = int(p.start_min, frame.start_min, frame.end_min - l.duration_min);
  const rooms = list(p.rooms ?? [], 1).map(room);
  if (rooms.some(r => r === null) || (l.rooms ? rooms.length !== 1 || !l.rooms.allowed.includes(rooms[0]!) : rooms.length !== 0)) bad();
  const selectedRoom = rooms[0] ?? null;
  if (l.locked && (day !== l.locked.day || startMin !== l.locked.start_min || l.locked.rooms?.length && !l.locked.rooms.includes(selectedRoom!))) bad();
  return { lesson, day, startMin, room: selectedRoom };
}

function candidate(value: unknown, expected: Pick<SchemaPlaceringRequest, 'placements' | 'mode' | 'lesson' | 'target' | 'depth'>, at: (value: unknown) => SchemaPlacement,
  known: ReadonlySet<string> | null, roots: ReadonlySet<string>, motor = false): SchemaPlaceringsforslag {
  const s = record(value), placements = list(s.placements).map(at), before = new Map(expected.placements.map(p => [p.lesson, p])), after = new Map<string, SchemaPlacement>();
  for (const p of placements) { if (after.has(p.lesson) || known && !known.has(p.lesson)) bad(); after.set(p.lesson, p); }
  if ([...before.keys()].some(id => !after.has(id))) bad();
  if (expected.mode === 'rest') { if (known && known.size !== after.size || placements.length <= before.size) bad(); }
  else {
    if (placements.some(p => !before.has(p.lesson) && !roots.has(p.lesson))) bad();
    const selected = after.get(expected.lesson!); if (!selected) bad();
    if (expected.target && (selected.day !== expected.target.day || selected.startMin !== expected.target.startMin || expected.target.room !== null && selected.room !== expected.target.room)) bad();
  }
  const changes = list(s.changes).map(raw => {
    const c = record(raw); keys(c, ['lesson', 'from', 'to']);
    return { lesson: id(c.lesson), from: c.from === null ? null : at(c.from), to: at(c.to) };
  });
  const changed = new Set<string>(), actual = placements.filter(p => !same(before.get(p.lesson), p));
  for (const c of changes) {
    if (changed.has(c.lesson) || c.lesson !== c.to.lesson || !same(c.from, before.get(c.lesson)) || !same(c.to, after.get(c.lesson)) || same(c.from, c.to)) bad();
    changed.add(c.lesson);
  }
  if (!changes.length || changes.length !== actual.length || actual.some(p => !changed.has(p.lesson)) || expected.mode !== 'rest' && !changed.has(expected.lesson!)) bad();
  if (changes.filter(c => c.from !== null && c.lesson !== expected.lesson).length > expected.depth) bad();
  const metricsBefore = metrics(s[motor ? 'metrics_before' : 'metricsBefore'], motor), metricsAfter = metrics(s[motor ? 'metrics_after' : 'metricsAfter'], motor), cost = int(s.cost, -Number.MAX_SAFE_INTEGER);
  if (cost !== metricsAfter.cost) bad();
  return { placements, changes, metricsBefore, metricsAfter, cost };
}
function readResult(value: unknown, expected: Pick<SchemaPlaceringRequest, 'depth' | 'placements' | 'mode' | 'lesson' | 'target'>,
  at: (value: unknown) => SchemaPlacement, known: ReadonlySet<string> | null, roots: ReadonlySet<string>, motor = false) {
  const r = record(value); if (r.depth !== expected.depth || typeof r[motor ? 'timed_out' : 'timedOut'] !== 'boolean') bad();
  const suggestions = list(r.suggestions, 5).map(raw => candidate(raw, expected, at, known, roots, motor)), unique = new Set<string>();
  for (const s of suggestions) { const key = JSON.stringify(sorted(s.placements)); if (unique.has(key)) bad(); unique.add(key); }
  return { depth: expected.depth, timedOut: r[motor ? 'timed_out' : 'timedOut'] as boolean, elapsedMs: int(r[motor ? 'elapsed_ms' : 'elapsedMs'], 0, 60_000), suggestions };
}
function rootsFor(lesson: string | null, links: SchemaProblem['links']): Set<string> {
  const roots = new Set(lesson ? [lesson] : []);
  let changed = true;
  while (changed) { changed = false; for (const link of links ?? []) if (link.kind === 'simultaneous' && link.lessons.some(id => roots.has(id))) {
    for (const id of link.lessons) if (!roots.has(id)) { roots.add(id); changed = true; }
  } }
  return roots;
}
/** Motorresultatet prövas mot serverns eget underlag. Oberoende regelkontroll körs därefter på hela varje kandidat. */
export function parseSchemaMotorPlacering(value: unknown, problem: SchemaProblem, expected: SchemaPlaceringVal & { placements: SchemaPlacement[] }) {
  const r = record(value); if (r.version !== problem.version || r.problem_id !== problem.id) bad();
  const lessons = new Map(problem.lessons.map(l => [l.id, l]));
  // Samplacerade pass bildar en uttrycklig rot; orelaterade parkerade pass får aldrig läggas som en gömd sidoeffekt.
  return readResult(r, expected, raw => motorAt(raw, problem, lessons), new Set(lessons.keys()), rootsFor(expected.lesson, problem.links), true);
}
/** Klienten jämför före/efter, målpunkt, lås och version även om svaret kom från en gammal flik eller körning. */
export function parseSchemaPlacering(value: unknown, expected: SchemaPlaceringRequest, lessonIds?: readonly string[], links?: SchemaProblem['links']): SchemaPlacering {
  const r = record(value); if (r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.grundFingerprint !== expected.grundFingerprint) bad();
  const result = readResult(r, expected, appAt, lessonIds ? new Set(lessonIds) : null, rootsFor(expected.lesson, links));
  for (const s of result.suggestions) for (const lock of expected.locks?.placements ?? []) {
    const actual = s.placements.find(p => p.lesson === lock.lesson);
    if (actual && !same(lock, actual) || expected.placements.some(p => p.lesson === lock.lesson) && !actual) bad();
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: expected.grundFingerprint, ...result };
}
