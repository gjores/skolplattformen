/** Exakt salsökning i nuvarande schema eller en uttrycklig datumförekomst. Inga flyttar, villkor eller salar skrivs. */
import { SCHEMA_CONTRACT_VERSION, checkSchemaPlacements, type SchemaCheck, type SchemaPlacement, type SchemaProblem, type SchemaViolation } from '../schema-contract.ts';
import { SchemaPlaceringError, sammaSchemaPlaceringar } from '../schema-placering.ts';
import { SchemaDatumError, schemaDatumErsatt, schemaDatumOriginal } from '../schema-datum.ts';
import { buildSchemaUnderlag, schemaKontroll, type SchemaUnderlag } from '../schema-underlag.ts';
import { SchemaSalError, parseSchemaSalSvar, schemaSalInputFingerprint, schemaSalPlaceringar, type SchemaSalRad, type SchemaSalRequest, type SchemaSalSvar } from '../schema-salar.ts';
import { schemaDatumGrund, valideraSchemaDatum, type SchemaDatumRead } from './schema-datum.ts';
import { validateSchema } from './schemamotor.ts';
import { salIfyllning } from '../schema-utan-sal.ts';

type Validator = (problem: SchemaProblem, placements: SchemaPlacement[]) => Promise<SchemaCheck>;
export type SchemaSalRead = Pick<SchemaDatumRead, 'plan' | 'basis'> & Partial<Pick<SchemaDatumRead, 'datedBasis'>>;
class TimeLimit extends Error {}
function named(underlag: SchemaUnderlag, message: string): string {
  const names = new Map([...underlag.labels.teachers, ...underlag.labels.rooms, ...underlag.labels.classes].map(r => [r.id, r.name]));
  for (const l of underlag.labels.lessons) names.set(l.id, l.title);
  return message.replace(/\b(?:larare|sal|grupp|pass|kluster)-\d+\b/gu, id => names.get(id) ?? underlag.labels.names[id] ?? 'berörd resurs');
}
const unavailable = (room: { id: string; name: string }, status: SchemaSalRad['status'], code: string, message: string, lesson: string): SchemaSalRad => ({ ...room, status, reasons: [{ code, message, lessons: [lesson] }], total: 1 });

/** Samma skyddade källäsning återanvänds för alla salar; varje tillåten sal får en egen helkontroll. */
export async function schemaSalSok(read: SchemaSalRead, input: SchemaSalRequest, validate: Validator = validateSchema,
  options: { timeMs?: number } = {}): Promise<SchemaSalSvar> {
  const underlag = buildSchemaUnderlag(read.plan, input, read.basis), lesson = underlag.problem.lessons.find(l => l.id === input.lesson);
  if (underlag.grundFingerprint !== input.grundFingerprint) throw new SchemaSalError('schema_underlag_changed');
  if (!lesson) throw new SchemaSalError('schema_sal_lesson_unknown');
  if (!input.datedTarget && lesson.locked) throw new SchemaSalError('schema_placement_locked_lesson');
  const placed = new Set(input.placements.map(p => p.lesson));
  const baseline = checkSchemaPlacements(input.placements, { ...underlag.problem, lessons: underlag.problem.lessons.map(l => placed.has(l.id) ? l : { ...l, locked: undefined }) }, salIfyllning(underlag.villkor));
  if (!sammaSchemaPlaceringar(baseline, input.placements)) throw new SchemaPlaceringError('schema_placement_rooms_changed');
  const dated = input.datedTarget ? schemaDatumGrund(read, input) : null;
  const original = input.datedTarget && dated ? schemaDatumOriginal(dated.forslag, { lesson: input.lesson, originalDate: input.datedTarget.originalDate }) : null;
  if (input.datedTarget && (!read.datedBasis || !original)) throw new SchemaDatumError(!read.datedBasis ? 'schema_datum_source_unknown' : 'schema_datum_original_missing');
  const durationMin = original?.length ?? lesson.duration_min, marginBeforeMin = Math.max(0, ...Object.values(lesson.margin ?? {}).map(m => m.before_min)),
    marginAfterMin = Math.max(0, ...Object.values(lesson.margin ?? {}).map(m => m.after_min));
  const rooms: SchemaSalRad[] = []; let checkedRooms = 0, timedOut = false;
  const deadline = Date.now() + Math.min(8_000, Math.max(1, options.timeMs ?? 8_000));
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    const remaining = deadline - Date.now(); if (remaining <= 0) throw new TimeLimit();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeLimit()), remaining); })]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  };
  for (const room of underlag.labels.rooms) {
    if (!lesson.rooms?.allowed.includes(room.id)) {
      rooms.push(unavailable(room, 'otillaten', 'room_unwanted', lesson.rooms ? 'Salen ingår inte bland passets tillåtna salar. Ändra passets salsvillkor om den ska kunna användas.'
        : 'Passet saknar tillåtna salar. Välj salar för undervisningen under Villkor för schemat.', input.lesson)); continue;
    }
    if (timedOut) { rooms.push(unavailable(room, 'ej_kontrollerad', 'schema_sal_time_limit', 'Salen hann inte kontrolleras. Sök igen.', input.lesson)); continue; }
    try {
      let reasons: SchemaViolation[], total: number;
      if (input.datedTarget && dated && original && read.datedBasis) {
        const datedOverrides = schemaDatumErsatt(input.datedOverrides, { lesson: input.lesson, originalDate: input.datedTarget.originalDate },
          { lesson: input.lesson, ...input.datedTarget, startMin: input.target.startMin, room: room.id, durationMin });
        const result = await bounded(() => valideraSchemaDatum({ plan: read.plan, datedBasis: read.datedBasis! }, dated.underlag, dated.forslag,
          datedOverrides, [input.datedTarget!.originalDate, input.datedTarget!.date], (problem, placements) => bounded(() => validate(problem, placements))));
        reasons = result.violations.map(v => ({ code: v.code, message: named(underlag, v.message), lessons: v.lessons })); total = result.total;
        for (const time of result.timeChanges.filter(t => t.deviation)) {
          reasons.push({ code: 'activity_time', message: `Flytten ger ${time.plannedMin} min under ${time.term === 'lasar' ? 'hela läsåret' : time.term.toUpperCase()}, utanför timplanens ${time.needMin}–${time.maxMin} min. Granska datumändringen.`, lessons: [input.lesson] }); total++;
        }
      } else {
        const candidate = schemaSalPlaceringar(input, room.id);
        const problem = { ...underlag.problem, reference: baseline.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room === null ? [] : [p.room] })) };
        const result = await bounded(() => validate(problem, candidate)), kontroll = schemaKontroll(underlag, candidate, result);
        reasons = kontroll.violations; total = kontroll.total;
      }
      checkedRooms++;
      const occupied = reasons.some(v => ['room_clash', 'room_unavailable'].includes(v.code) && v.lessons.includes(input.lesson));
      rooms.push({ ...room, status: total === 0 ? 'ledig' : occupied ? 'upptagen' : 'hindrad', reasons: reasons.slice(0, 20), total });
    } catch (error) {
      if (!(error instanceof TimeLimit)) throw error;
      timedOut = true; rooms.push(unavailable(room, 'ej_kontrollerad', 'schema_sal_time_limit', 'Salen hann inte kontrolleras. Sök igen.', input.lesson));
    }
  }
  return parseSchemaSalSvar({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, fingerprint: underlag.fingerprint,
    inputFingerprint: schemaSalInputFingerprint(input), lesson: input.lesson, target: input.target, datedTarget: input.datedTarget, durationMin, marginBeforeMin, marginAfterMin,
    rooms, timedOut, checkedRooms, explanation: timedOut ? 'Tidsgränsen nåddes. En sal som inte har kontrollerats kan inte väljas. Sök igen.'
      : input.datedTarget ? 'Salarna är prövade för detta undervisningstillfälle och hela det berörda datumschemat. Ändringen måste kontrolleras igen när den genomförs.'
        : 'Salarna är prövade vid den valda tiden mot hela grundschemat. Flytta hit kontrollerar flytten igen.' }, input, underlag.labels.rooms);
}
