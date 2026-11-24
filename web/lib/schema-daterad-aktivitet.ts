import type { SchemaForslag } from './schema-contract.ts';
import { schemaWeekNumber, type SchemaVeckaVal } from './schema-vecka.ts';
import { parseSchemaDatumAndringar, schemaDatumDate, schemaDatumNyckel, schemaDatumOriginal, schemaDatumTillfallen, type SchemaDatumAndring, type SchemaDatumNyckel } from './schema-datum.ts';

export type SchemaAktivitetsresurser = { roomId: string | null; teacherRef: string | null };
export type SchemaDateradAktivitetInput = {
  id: string;
  name: string;
  date: string;
  startMin: number;
  endMin: number;
  classRefs: string[];
  credit: { ref: string; minutes: number } | null;
  resourceLocks?: SchemaAktivitetsresurser;
};
export type SchemaDateradAktivitet = SchemaDateradAktivitetInput & { cancelled: SchemaDatumNyckel[]; moves: SchemaDatumAndring[]; credits: string[]; resources?: SchemaAktivitetsresurser };
export type SchemaAktivitetsEffekt = SchemaDatumNyckel & {
  title: string;
  classes: string[];
  minutes: number;
  status: 'moved' | 'credited' | 'uncovered';
  target: SchemaDatumAndring | null;
};
export type SchemaAktivitetsTid = {
  ref: string;
  title: string;
  classes: string[];
  lost: number;
  moved: number;
  credited: number;
  remaining: number;
  net: number;
};
export type SchemaAktivitetsForslag = {
  activity: SchemaDateradAktivitet;
  effects: SchemaAktivitetsEffekt[];
  totals: SchemaAktivitetsTid[];
  uncreditedClasses: string[];
  blockers: string[];
};

export class SchemaDateradAktivitetError extends TypeError {
  constructor() { super('schema_daterad_aktivitet_invalid'); this.name = 'SchemaDateradAktivitetError'; }
}
const invalid = (): never => { throw new SchemaDateradAktivitetError(); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
function keys(r: Record<string, unknown>, expected: string) {
  if (Object.keys(r).sort().join(',') !== expected) invalid();
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/\p{Cc}/u.test(value) ? value : invalid();
}
function minutes(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value % 5 === 0 && value >= min && value <= max ? value : invalid();
}
function range(value: unknown, max: number): unknown[] {
  return Array.isArray(value) && value.length <= max ? value : invalid();
}
function id(value: unknown): string {
  return typeof value === 'string' && uuid.test(value) ? value : invalid();
}
function date(value: unknown): string {
  try { return schemaDatumDate(value); } catch { return invalid(); }
}
function lessonKey(value: unknown): SchemaDatumNyckel {
  const row = object(value);
  keys(row, 'lesson,originalDate');
  if (typeof row.lesson !== 'string' || !/^pass-\d{1,8}$/u.test(row.lesson)) return invalid();
  return { lesson: row.lesson, originalDate: date(row.originalDate) };
}

function resurser(value: unknown, locks = false): SchemaAktivitetsresurser {
  const r = object(value);
  keys(r, 'roomId,teacherRef');
  const roomId = r.roomId;
  if (roomId !== null && (typeof roomId !== 'string' || !(locks && roomId === 'ingen') && !/^sal-[1-9]\d{0,2}$/u.test(roomId))) return invalid();
  return { roomId, teacherRef: r.teacherRef === null ? null : id(r.teacherRef) };
}

export function parseSchemaDateradAktivitetInput(value: unknown): SchemaDateradAktivitetInput {
  const r = object(value);
  const withLocks = Object.hasOwn(r, 'resourceLocks');
  keys(r, withLocks ? 'classRefs,credit,date,endMin,id,name,resourceLocks,startMin' : 'classRefs,credit,date,endMin,id,name,startMin');
  const startMin = minutes(r.startMin, 0, 1435), endMin = minutes(r.endMin, startMin + 5, 1440);
  const classRefs = range(r.classRefs, 2000).map(id);
  if (!classRefs.length || classRefs.length !== new Set(classRefs).size) return invalid();
  let credit: SchemaDateradAktivitetInput['credit'] = null;
  if (r.credit !== null) {
    const x = object(r.credit);
    keys(x, 'minutes,ref');
    credit = { ref: text(x.ref, 2000), minutes: minutes(x.minutes, 5, endMin - startMin) };
  }
  return { id: id(r.id), name: text(r.name, 120), date: date(r.date), startMin, endMin, classRefs: classRefs.sort(), credit, ...(withLocks && { resourceLocks: resurser(r.resourceLocks, true) }) };
}

export function parseSchemaDateradeAktiviteter(value: unknown): SchemaDateradAktivitet[] {
  return range(value, 1).map(raw => {
    const r = object(raw);
    const { cancelled: cancellation, moves: rawMoves, credits: rawCredits, resources, ...rawInput } = r;
    const input = parseSchemaDateradAktivitetInput(rawInput);
    const cancelled = range(cancellation, 20000).map(lessonKey).sort((a, b) => schemaDatumNyckel(a).localeCompare(schemaDatumNyckel(b)));
    let moves;
    try { moves = parseSchemaDatumAndringar(rawMoves); } catch { return invalid(); }
    const affected = [...cancelled, ...moves];
    if (affected.some(pass => pass.originalDate !== input.date) || new Set(affected.map(schemaDatumNyckel)).size !== affected.length) return invalid();
    const credits = range(rawCredits, 20000).map(ref => text(ref, 2000)).sort();
    if (new Set(credits).size !== credits.length || (credits.length > 0) !== (input.credit !== null)) return invalid();
    return { ...input, cancelled, moves, credits, ...(Object.hasOwn(r, 'resources') && { resources: resurser(resources) }) };
  });
}

export function schemaDateradAktivitetsdefinition({ cancelled: _cancelled, moves: _moves, credits: _credits, resources: _resources,
  ...definition }: SchemaDateradAktivitet): SchemaDateradAktivitetInput {
  return definition;
}

export function schemaAktivitetsdatum(activities: readonly SchemaDateradAktivitet[]) {
  return activities.flatMap(activity => [activity.date, ...activity.moves.map(move => move.date)]);
}

export function schemaDateradeAktivitetsflyttar(overrides: SchemaDatumAndring[], activities: readonly SchemaDateradAktivitet[]) {
  return activities.length ? [...overrides, ...activities.flatMap(activity => activity.moves)] : overrides;
}

export function schemaDateradeAktivitetsbortfall(activities: readonly SchemaDateradAktivitet[]) {
  return new Set(activities.flatMap(activity => activity.cancelled.map(schemaDatumNyckel)));
}

export function schemaDateradAktivitetsvecka(base: SchemaForslag, visning: SchemaVeckaVal, overrides: SchemaDatumAndring[],
  activities: readonly SchemaDateradAktivitet[]) {
  const cancelled = schemaDateradeAktivitetsbortfall(activities);
  return schemaDatumTillfallen(base, visning, schemaDateradeAktivitetsflyttar(overrides, activities)).filter(occasion => !cancelled.has(occasion.key));
}

/** Ämneskopplingen är serverkontrollerad. Bara schemats utlagda minuter ändras. */
export function schemaAktivitetTimplan(f: SchemaForslag, activities: readonly SchemaDateradAktivitet[]): SchemaForslag {
  if (!activities.length || !f.time.calendar) return f;
  const { calendar } = f.time;
  const changes = new Map<string, { terms: Map<string, number>; weeks: Map<number, number> }>();
  const weekIndex = (date: string) => f.time.weekLabels.indexOf(`v. ${schemaWeekNumber(date)}`);
  const add = (ref: string, day: string, minutes: number) => {
    const term = calendar.days.find(row => row.date === day)?.term;
    if (!term) return;
    const item = changes.get(ref) ?? { terms: new Map<string, number>(), weeks: new Map<number, number>() };
    item.terms.set(term, (item.terms.get(term) ?? 0) + minutes);
    const index = weekIndex(day);
    if (index >= 0) item.weeks.set(index, (item.weeks.get(index) ?? 0) + minutes);
    changes.set(ref, item);
  };
  for (const activity of activities) {
    for (const ref of activity.credits) add(ref, activity.date, activity.credit!.minutes);
    for (const key of activity.cancelled) {
      const pass = schemaDatumOriginal(f, key);
      if (pass?.lesson.undervisning) add(pass.lesson.undervisning, activity.date, -pass.length);
    }
    for (const move of activity.moves) {
      const pass = schemaDatumOriginal(f, move);
      if (!pass?.lesson.undervisning) continue;
      add(pass.lesson.undervisning, move.originalDate, -move.durationMin);
      add(pass.lesson.undervisning, move.date, move.durationMin);
    }
  }
  const teachings = f.teachings.map(teaching => {
    const change = changes.get(teaching.ref);
    if (!change) return teaching;
    const plannedMin = teaching.plannedMin + [...change.terms.values()].reduce((sum, delta) => sum + delta, 0);
    const terms = teaching.terms.map(term => ({ ...term, plannedMin: term.plannedMin + (change.terms.get(term.term) ?? 0) }));
    const deviation = teaching.unplaced ? teaching.deviation
      : (teaching.timeBasis === 'lasar' ? plannedMin < teaching.needMin || plannedMin > (teaching.maxMin ?? teaching.needMin)
        : terms.some(term => term.plannedMin < term.needMin || term.plannedMin > term.maxMin)) ? 'calendar' as const : null;
    return { ...teaching, plannedMin, terms, deviation, perWeek: teaching.perWeek.map((min, week) => min + (change.weeks.get(week) ?? 0)) };
  });
  return { ...f, teachings };
}

export function parseSchemaAktivitetsForslag(value: unknown, input: SchemaDateradAktivitetInput): SchemaAktivitetsForslag {
  const r = object(value);
  keys(r, 'activity,blockers,effects,totals,uncreditedClasses');
  const [activity] = parseSchemaDateradeAktiviteter([r.activity]);
  const { cancelled: _cancelled, moves: _moves, credits: _credits, resources: _resources, ...request } = activity;
  if (JSON.stringify(request) !== JSON.stringify(parseSchemaDateradAktivitetInput(input))) return invalid();
  const list = (value: unknown, max: number) => range(value, max).map(item => text(item, 500));
  const effects = range(r.effects, 20000).map(item => {
    const x = object(item);
    keys(x, 'classes,lesson,minutes,originalDate,status,target,title');
    const key = lessonKey({ lesson: x.lesson, originalDate: x.originalDate });
    const status = x.status;
    if (status !== 'moved' && status !== 'credited' && status !== 'uncovered') return invalid();
    const target = x.target === null ? null : parseSchemaDatumAndringar([x.target])[0];
    if ((status === 'moved') !== Boolean(target) || target && schemaDatumNyckel(key) !== schemaDatumNyckel(target)) return invalid();
    return { ...key, title: text(x.title, 500), classes: list(x.classes, 2000), minutes: minutes(x.minutes, 5, 600), status: status as SchemaAktivitetsEffekt['status'], target };
  });
  const totals = range(r.totals, 20000).map(item => {
    const x = object(item);
    keys(x, 'classes,credited,lost,moved,net,ref,remaining,title');
    const credited = minutes(x.credited, 0, 1440), lost = minutes(x.lost, 0, 200000), moved = minutes(x.moved, 0, lost);
    const net = moved + credited - lost, remaining = Math.max(0, -net);
    if (x.net !== net || x.remaining !== remaining) return invalid();
    return { ref: text(x.ref, 2000), title: text(x.title, 500), classes: list(x.classes, 2000), credited, lost, moved, net, remaining };
  });
  return { activity, effects, totals, blockers: list(r.blockers, 20000), uncreditedClasses: list(r.uncreditedClasses, 2000) };
}
