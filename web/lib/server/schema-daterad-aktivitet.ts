import { SchemaDatumError, schemaDatumNyckel, type SchemaDatumAndring, type SchemaDatumTillfalle } from '../schema-datum.ts';
import { schemaDatumUnderlag, type SchemaDatumDagUnderlag } from '../schema-datum-underlag.ts';
import {
  parseSchemaDateradeAktiviteter, parseSchemaDateradAktivitetInput,
  type SchemaAktivitetsForslag, type SchemaAktivitetsTid, type SchemaDateradAktivitet, type SchemaDateradAktivitetInput,
} from '../schema-daterad-aktivitet.ts';
import { checkSchemaPlacements, type SchemaForslag, type SchemaPlacement } from '../schema-contract.ts';
import type { SchemaUnderlag } from '../schema-underlag.ts';
import type { TjanstPlanRead } from '../tjanst-contract.ts';
import type { NationellProvbokning } from '../nationella-prov.ts';
import { schemaDagStatus, schemaWeekday } from '../schema-vecka.ts';
import { Deny } from './db.ts';
import { validateSchema } from './schemamotor.ts';
import type { SchemaDatumRead } from './schema-datum.ts';

type Read = Pick<SchemaDatumRead, 'plan' | 'datedBasis'>;
type Validator = typeof validateSchema;
type ActivityPass = { occurrence: SchemaDatumTillfalle; ref: string; pupils: ReadonlySet<string>; partial: boolean };
const fail = (reason = 'schema_daterad_aktivitet_changed'): never => { throw new Deny('conflict', 409, { reason }); };
const overlaps = (start: number, end: number, first: number, last: number) => start < last && first < end;

function pupilsFor(day: SchemaDatumDagUnderlag, refs: readonly string[]) {
  return new Set(refs.flatMap(ref => [...day.pupilsByGroup.get(day.groupIdsByRef.get(ref) ?? '') ?? []]));
}
function pupilsOfPass(day: SchemaDatumDagUnderlag, id: string) {
  const model = day.problem.lessons.find(p => p.id === id);
  return new Set((model?.groups ?? []).flatMap(group => [...day.pupilsByGroup.get(group) ?? []]));
}
function samePupils(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every(id => b.has(id));
}

function timplanRows(plan: TjanstPlanRead) {
  const rows = new Map<string, { classId: string; key: string }[]>(plan.classes.flatMap(c => c.needs.map(need =>
    [`undervisning:${need.sourceKey}`, [{ classId: c.classId, key: need.rowKey }]])));
  const assignments = new Map(plan.rows.map(r => [r.id, rows.get(`undervisning:${r.sourceKey}`)]));
  for (const joint of plan.joints) {
    const members = joint.rowIds.map(id => assignments.get(id));
    if (members.every(member => member !== undefined)) rows.set(`samlasning:${joint.lineageId ?? joint.id}`, members.flatMap(member => member ?? []));
  }
  return rows;
}

function activityBasis(read: Read, underlag: SchemaUnderlag, base: SchemaForslag, overrides: SchemaDatumAndring[],
  input: SchemaDateradAktivitetInput, locks: SchemaPlacement[]) {
  const selected = new Set(input.classRefs), known = new Map(read.plan.classes.map((c, index) => [c.classId, `grupp-${index + 1}`]));
  const calendarDay = base.time.calendar?.days.find(day => day.date === input.date);
  const weekday = schemaWeekday(input.date), bounds = underlag.problem.time.days[weekday];
  if (!calendarDay?.schoolDay || !calendarDay.term || !bounds || weekday > 4 ||
    input.startMin < bounds.start_min || input.endMin > bounds.end_min ||
    (base.period !== 'lasar' && base.period !== calendarDay.term) ||
    input.classRefs.some(ref => !known.has(ref) || !schemaDagStatus(calendarDay, known.get(ref) ?? null).schoolDay)) {
    return fail('schema_daterad_aktivitet_date');
  }
  const prepared = schemaDatumUnderlag(read.plan, underlag, base, read.datedBasis, overrides, [input.date], true, 'valdaDatum');
  const day = prepared.days[0], pupils = pupilsFor(day, input.classRefs);
  if (input.classRefs.some(ref => !pupilsFor(day, [ref]).size)) return fail('schema_daterad_aktivitet_deltagare');
  const source = new Map(prepared.sources.map(item => [item.lesson, item.ref]));
  const locked = new Set([...locks.map(lock => lock.lesson), ...(underlag.problem.links ?? [])
    .filter(link => link.kind === 'simultaneous').flatMap(link => link.lessons)]);
  const classes = new Map(read.plan.classes.map(c => [c.classId, c.name]));
  const colliding: ActivityPass[] = [], blockers: string[] = [];
  for (const [id, occurrence] of day.occurrences) {
    const students = pupilsOfPass(day, id), model = day.problem.lessons.find(p => p.id === id);
    const start = occurrence.lesson.startMin!, margin = model?.margin?.students;
    if (!overlaps(start - (margin?.before_min ?? 0), start + occurrence.length + (margin?.after_min ?? 0), input.startMin, input.endMin) ||
      ![...students].some(student => pupils.has(student))) continue;
    if (occurrence.lesson.egenAktivitet || occurrence.changed || locked.has(occurrence.lesson.id)) {
      const why = occurrence.changed ? 'ett tidigare ändrat tillfälle' : locked.has(occurrence.lesson.id) ? 'ett låst eller samplacerat pass' : 'en annan aktivitet';
      blockers.push(`${occurrence.lesson.title} krockar med friluftsdagen och är ${why}.`);
      continue;
    }
    colliding.push({ occurrence, ref: source.get(occurrence.lesson.id) ?? fail(), pupils: students, partial: [...students].some(student => !pupils.has(student)) });
  }
  if (colliding.some(pass => pass.partial)) blockers.push('En undervisningsgrupp har också elever från klasser utanför aktiviteten. Lägg till deras klasser eller ändra tiden.');

  const rows = timplanRows(read.plan), credited = new Set<string>(), creditClasses = new Set<string>();
  if (input.credit) {
    const target = rows.get(input.credit.ref), key = target?.[0]?.key;
    if (!key || !target?.every(row => row.key === key)) return fail('schema_daterad_aktivitet_subject');
    for (const teaching of base.teachings) {
      const members = rows.get(teaching.ref);
      if (!members?.length || !members.every(row => row.key === key && selected.has(row.classId)) ||
        !teaching.terms.some(term => term.term === calendarDay.term && term.needMin > 0)) continue;
      if (members.some(row => creditClasses.has(row.classId))) return fail('schema_daterad_aktivitet_subject');
      credited.add(teaching.ref);
      for (const row of members) creditClasses.add(row.classId);
    }
    if (!credited.size) return fail('schema_daterad_aktivitet_subject');
  }
  return { colliding, blockers, credited, day, calendarDay, pupils, uncreditedClasses: input.credit
    ? input.classRefs.filter(ref => !creditClasses.has(ref)).map(ref => classes.get(ref)!) : [] };
}

function compareProspectiveDay(read: Read, underlag: SchemaUnderlag, base: SchemaForslag, overrides: SchemaDatumAndring[],
  visit: SchemaDatumAndring, suppressed: ReadonlySet<string>) {
  const result = schemaDatumUnderlag(read.plan, underlag, base, read.datedBasis, [...overrides, visit], [visit.date], true, 'valdaDatum');
  if (result.violations.length) return null;
  const day = result.days[0], key = schemaDatumNyckel(visit);
  const id = [...day.occurrences].find(([, o]) => o.key === key)?.[0];
  if (!id) return null;
  const omitted = new Set([...day.occurrences].filter(([candidate, o]) => candidate !== id && suppressed.has(o.key)).map(([candidate]) => candidate));
  return { day, id, pupils: pupilsOfPass(day, id), problem: { ...day.problem,
    lessons: day.problem.lessons.filter(lesson => !omitted.has(lesson.id)),
    ...(day.problem.links && { links: day.problem.links.map(link => ({ ...link, lessons: link.lessons.filter(lesson => !omitted.has(lesson)) }))
      .filter(link => link.lessons.length > 1) }),
  }, placements: day.placements.filter(p => !omitted.has(p.lesson)) };
}

function activityExamConflicts(read: Read, input: SchemaDateradAktivitetInput,
  bookings: readonly NationellProvbokning[]) {
  return bookings.filter(booking => booking.datum === input.date && overlaps(booking.startMin, booking.slutMin, input.startMin, input.endMin) && examAffectsClasses(read.plan, input, booking));
}

export async function planeraDateradAktivitet(read: Read, underlag: SchemaUnderlag, base: SchemaForslag, overrides: SchemaDatumAndring[],
  input: SchemaDateradAktivitetInput, locks: SchemaPlacement[], bookings: readonly NationellProvbokning[],
  validate: Validator = validateSchema): Promise<SchemaAktivitetsForslag> {
  const info = activityBasis(read, underlag, base, overrides, input, locks);
  const { colliding, credited, uncreditedClasses, blockers } = info;
  if (activityExamConflicts(read, input, bookings).length) blockers.push('Ett bokat nationellt prov krockar med aktiviteten. Välj en annan tid.');
  const cover = new Map([...credited].map(ref => [ref, input.credit!.minutes]));
  const moves: SchemaDatumAndring[] = [], cancelled: SchemaDateradAktivitet['cancelled'] = [];
  const totals = new Map<string, SchemaAktivitetsTid>();
  const byRef = new Map(base.teachings.map(row => [row.ref, row]));
  const totalFor = (ref: string) => {
    const row = totals.get(ref);
    if (row) return row;
    const teaching = byRef.get(ref);
    if (!teaching) return fail();
    const total = { ref, title: teaching.title, classes: teaching.classes, lost: 0, moved: 0, credited: credited.has(ref) ? input.credit!.minutes : 0, remaining: 0, net: 0 };
    totals.set(ref, total);
    return total;
  };
  for (const ref of credited) totalFor(ref);
  const suppressed = new Set(colliding.map(row => row.occurrence.key));
  const effects: SchemaAktivitetsForslag['effects'] = [];
  const started = Date.now(), maxChecks = 120;
  let checks = 0;
  const dates = base.time.calendar!.days.filter(day => day.date >= input.date && day.schoolDay && day.term === info.calendarDay.term && schemaWeekday(day.date) < 5).slice(0, 15);
  for (const pass of colliding) {
    const { occurrence, ref } = pass, { lesson, originalDate, length } = occurrence;
    const balance = totalFor(ref);
    balance.lost += length;
    const key = { lesson: lesson.id, originalDate };
    let target: SchemaDatumAndring | null = null;
    let status: SchemaAktivitetsForslag['effects'][number]['status'] = 'uncovered';
    if (!pass.partial && (cover.get(ref) ?? 0) >= length) {
      cover.set(ref, cover.get(ref)! - length);
      status = 'credited';
    } else if (!blockers.length) {
      search: for (const day of dates) {
        const weekday = schemaWeekday(day.date), bounds = underlag.problem.time.days[weekday];
        if (!bounds) continue;
        const roomCandidates = [...new Set([lesson.roomId, ...lesson.roomIds])].filter(room => room !== null || lesson.roomIds.length === 0);
        const first = Math.max(bounds.start_min, day.date === input.date ? input.endMin + underlag.problem.rules.break_min : bounds.start_min);
        // Prova starttider i det befintliga rutnätet. Validera varje vald kandidat mot motorns fulla regler.
        const step = Math.max(5, base.startGridMin);
        for (let start = Math.ceil(first / step) * step; start + length <= bounds.end_min; start += step) {
          if (checks >= maxChecks || Date.now() - started > 12_000) break search;
          if (bookings.some(booking => booking.datum === day.date && overlaps(booking.startMin, booking.slutMin, start, start + length))) continue;
          for (const room of roomCandidates) {
            const visit = { ...key, date: day.date, startMin: start, room, durationMin: length };
            try {
              const candidate = compareProspectiveDay(read, underlag, base, [...overrides, ...moves], visit, suppressed);
              if (!candidate || !samePupils(pass.pupils, candidate.pupils)) break;
              const placed = candidate.placements.find(p => p.lesson === candidate.id)!;
              if (candidate.placements.some(other => {
                if (other.lesson === candidate.id) return false;
                const model = candidate.problem.lessons.find(l => l.id === other.lesson)!;
                const thisModel = candidate.problem.lessons.find(l => l.id === placed.lesson)!;
                const sameResource = placed.room !== null && placed.room === other.room || model.teachers.some(id => thisModel.teachers.includes(id)) ||
                  [...pupilsOfPass(candidate.day, other.lesson)].some(pupil => candidate.pupils.has(pupil));
                return sameResource && overlaps(other.startMin, other.startMin + model.duration_min, start, start + length);
              })) continue;
              checks++;
              const checked = await validate(candidate.problem, candidate.placements);
              if (checked.violations.some(v => v.lessons.includes(candidate.id))) continue;
              target = visit;
              moves.push(visit);
              suppressed.delete(occurrence.key);
              status = 'moved';
              balance.moved += length;
              break search;
            } catch (error) {
              if (error instanceof SchemaDatumError && error.reason === 'schema_datum_date_invalid') continue;
              throw error;
            }
          }
        }
      }
    }
    if (!target) cancelled.push(key);
    effects.push({ ...key, title: lesson.title, classes: balance.classes, minutes: length, status, target });
  }
  for (const total of totals.values()) {
    total.net = total.credited + total.moved - total.lost;
    total.remaining = Math.max(0, -total.net);
  }
  const [activity] = parseSchemaDateradeAktiviteter([{ ...input, cancelled, moves, credits: [...credited] }]);
  return { activity, effects, totals: [...totals.values()].sort((a, b) => a.title.localeCompare(b.title, 'sv') || a.ref.localeCompare(b.ref)), uncreditedClasses, blockers };
}

export async function valideraDateradAktivitetsplan(read: Read, underlag: SchemaUnderlag, base: SchemaForslag,
  overrides: SchemaDatumAndring[], activities: SchemaDateradAktivitet[], locks: SchemaPlacement[] = [], validate: Validator = validateSchema) {
  for (const activity of activities) {
    const { cancelled, moves, credits, ...raw } = activity;
    const input = parseSchemaDateradAktivitetInput(raw);
    const info = activityBasis(read, underlag, base, overrides, input, locks);
    if (info.blockers.length || credits.length !== info.credited.size || credits.some(ref => !info.credited.has(ref))) return fail();
    const byKey = new Map(info.colliding.map(pass => [pass.occurrence.key, pass]));
    const expected = [...cancelled, ...moves].map(schemaDatumNyckel);
    if (expected.length !== byKey.size || expected.some(key => !byKey.has(key))) return fail();
    const suppressed = new Set(cancelled.map(schemaDatumNyckel));
    const destinations = new Set(base.time.calendar!.days.filter(day =>
      day.date >= input.date && day.schoolDay && day.term === info.calendarDay.term && schemaWeekday(day.date) < 5).slice(0, 15).map(day => day.date));
    for (const visit of moves) {
      if (!destinations.has(visit.date) || byKey.get(schemaDatumNyckel(visit))?.occurrence.length !== visit.durationMin) return fail();
      if (visit.date === input.date && overlaps(visit.startMin, visit.startMin + visit.durationMin, input.startMin, input.endMin)) return fail();
      const key = schemaDatumNyckel(visit), candidate = compareProspectiveDay(read, underlag, base,
        [...overrides, ...moves.filter(move => schemaDatumNyckel(move) !== key)], visit, suppressed);
      if (!candidate || !samePupils(candidate.pupils, byKey.get(key)!.pupils)) return fail();
      checkSchemaPlacements(candidate.placements, candidate.problem, true);
      const checked = await validate(candidate.problem, candidate.placements);
      if (checked.violations.some(v => v.lessons.includes(candidate.id))) return fail();
    }
  }
}

/** En ny provbokning mellan förhandsgranskning och sparande kräver ny granskning. */
function examAffectsClasses(plan: TjanstPlanRead, activity: SchemaDateradAktivitetInput, exam: NationellProvbokning) {
  if (exam.mal.slag === 'klass') return activity.classRefs.includes(exam.mal.ref);
  const group = (plan.groups ?? []).find(g => g.groupId === exam.mal.ref);
  return !group?.classIds.length || group.classIds.some(ref => activity.classRefs.includes(ref));
}

export function kontrolleraAktivitetensProv(activities: SchemaDateradAktivitet[], bookings: readonly NationellProvbokning[], plan: TjanstPlanRead) {
  for (const activity of activities) for (const exam of bookings) {
    if (examAffectsClasses(plan, activity, exam) && exam.datum === activity.date && overlaps(exam.startMin, exam.slutMin, activity.startMin, activity.endMin) ||
      activity.moves.some(move => move.date === exam.datum && overlaps(exam.startMin, exam.slutMin, move.startMin, move.startMin + move.durationMin))) {
      return fail('schema_daterad_aktivitet_prov');
    }
  }
}
