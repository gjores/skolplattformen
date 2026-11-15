/** Grundmönstrets faktiska undervisningstillfällen. Läsande projektion; flyttar gäller fortfarande grundschemats pass. */
import type { SchemaDatedCalendar, SchemaDatedDay, SchemaForslag, SchemaForslagLesson, SchemaTerm, SchemaTrim } from './schema-contract.ts';

const MS = 86400000;
export type SchemaVeckaVal = { mode: 'grundschema' | 'vecka' | 'intervall'; monday: string; from: string; to: string };
export const grundschemaVal = (): SchemaVeckaVal => ({ mode: 'grundschema', monday: '', from: '', to: '' });
export const addSchemaDays = (date: string, count: number) => new Date(Date.parse(`${date}T00:00:00Z`) + count * MS).toISOString().slice(0, 10);
export const schemaWeekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
export const schemaMonday = (date: string) => addSchemaDays(date, -schemaWeekday(date));
const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const short = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const schemaDateText = (date: string) => short.format(new Date(`${date}T00:00:00Z`));
export const schemaDayHeading = (date: string) => `${WEEKDAYS[schemaWeekday(date)]} ${schemaDateText(date)}`;
export function schemaWeekNumber(date: string): number {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 3 - schemaWeekday(date));
  const jan4 = `${d.getUTCFullYear()}-01-04`, first = Date.parse(`${schemaMonday(jan4)}T00:00:00Z`);
  return Math.round((Date.parse(`${schemaMonday(date)}T00:00:00Z`) - first) / (MS * 7)) + 1;
}

/** Även helt undervisningsfria veckor finns i listan, till skillnad från summeringens veckolistor. */
export function schemaVeckor(calendar: SchemaDatedCalendar | null | undefined, term?: SchemaTerm): { monday: string; label: string }[] {
  if (!calendar) return [];
  const days = calendar.days.filter(d => term === undefined || d.term === term);
  const weeks = [...new Set(days.map(d => schemaMonday(d.date)))];
  return weeks.map(monday => {
    const mine = days.filter(d => schemaMonday(d.date) === monday && schemaWeekday(d.date) < 5);
    const reasons = [...new Set(mine.flatMap(d => !d.schoolDay && d.reason ? [d.reason] : []))];
    return { monday, label: `v. ${schemaWeekNumber(monday)} · ${schemaDateText(monday)}–${schemaDateText(addSchemaDays(monday, 4))}${term ? ` (${term.toUpperCase()})` : ''}${mine.length > 0 && mine.every(d => !d.schoolDay) && reasons.length ? ` · ${reasons.join(', ')}` : ''}` };
  });
}

export function schemaVeckaVal(f: Pick<SchemaForslag, 'time' | 'period'>, term: SchemaTerm, val: SchemaVeckaVal): SchemaVeckaVal {
  const calendar = f.time.calendar;
  if (!calendar) return grundschemaVal();
  const weeks = schemaVeckor(calendar, f.period === 'lasar' ? term : f.period), first = weeks[0]?.monday ?? schemaMonday(calendar.start);
  const monday = weeks.some(w => w.monday === val.monday) ? val.monday : first;
  const from = val.from >= calendar.start && val.from <= calendar.end ? val.from : calendar.days.find(d => d.term === term)?.date ?? calendar.start;
  const end = addSchemaDays(from, 27), max = end < calendar.end ? end : calendar.end;
  const to = val.to >= from && val.to <= max ? val.to : addSchemaDays(from, Math.min(4, Math.round((Date.parse(max) - Date.parse(from)) / MS)));
  return { mode: val.mode, monday, from, to };
}

export type SchemaVisningsDag = SchemaDatedDay & { weekday: number; heading: string };
/** Datumintervallet omfattar högst 28 kalenderdagar. Dagar utanför kalenderns spann visas aldrig som undervisning. */
export function schemaVisningsDagar(calendar: SchemaDatedCalendar | null | undefined, val: SchemaVeckaVal): SchemaVisningsDag[] {
  if (!calendar || val.mode === 'grundschema') return [];
  const from = val.mode === 'vecka' ? val.monday : val.from, to = val.mode === 'vecka' ? addSchemaDays(from, 4) : val.to;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to) || from > to || Date.parse(to) - Date.parse(from) >= 28 * MS) return [];
  const lookup = new Map(calendar.days.map(d => [d.date, d])), result: SchemaVisningsDag[] = [];
  for (let date = from; date <= to; date = addSchemaDays(date, 1)) {
    const d = lookup.get(date) ?? { date, term: null, schoolDay: false, reason: 'Utanför terminen', classes: {} };
    result.push({ ...d, weekday: schemaWeekday(date), heading: schemaDayHeading(date) });
  }
  return result;
}

/** Status för en vald klass; utan klass gäller skolans dag. */
export function schemaDagStatus(day: SchemaDatedDay, classId: string | null): { schoolDay: boolean; reason: string | null } {
  return classId && day.classes[classId] ? day.classes[classId] : { schoolDay: day.schoolDay, reason: day.reason };
}

export function schemaTillfallesLangd(l: SchemaForslagLesson, day: Pick<SchemaDatedDay, 'date' | 'term'>, trims: SchemaTrim[]): number {
  const trim = trims.find(t => t.lesson === l.id && t.term === (l.term ?? day.term));
  if (!trim) return l.durationMin;
  // En summering kan inte tala om vilka extra veckor som kortats. Utan daterat bevis visas bara den gemensamma kortningen.
  const cut = trim.occasions ? trim.occasions.find(o => o.date === day.date)?.minutes ?? 0 : trim.fixedMin;
  return Math.max(0, l.durationMin - cut);
}

export type SchemaTillfalle = { key: string; date: string; term: SchemaTerm | null; lesson: SchemaForslagLesson; length: number };
/** Samma pass-ID behålls för menyer och flytt. `key` skiljer tillfällena i en längre datumvy. */
export function schemaTillfallen(f: Pick<SchemaForslag, 'lessons' | 'trims'> & { time: Pick<SchemaForslag['time'], 'calendar'> }, val: SchemaVeckaVal): SchemaTillfalle[] {
  const days = schemaVisningsDagar(f.time.calendar, val), out: SchemaTillfalle[] = [];
  for (const day of days) for (const l of f.lessons) {
    if (l.day !== day.weekday || l.startMin === null || l.term !== null && l.term !== day.term) continue;
    // Egna aktiviteter hör ännu till grundschemat (T1 kommer senare); de märks som grundschemaaktiviteter i datumvyn.
    const own = 'egenAktivitet' in l && l.egenAktivitet;
    if (!own && (!day.schoolDay || l.classIds.some(id => !schemaDagStatus(day, id).schoolDay))) continue;
    const length = own ? l.durationMin : schemaTillfallesLangd(l, day, f.trims);
    if (length > 0) out.push({ key: `${l.id}@${day.date}`, date: day.date, term: day.term, lesson: l, length });
  }
  return out;
}
