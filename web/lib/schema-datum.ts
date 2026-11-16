/** Ett undantag för ett faktiskt tillfälle. Originalnyckeln ändras aldrig när tillfället flyttas. */
import { SCHEMA_CONTRACT_VERSION, SCHEMA_LIMITS, SchemaContractError, parseSchemaKontrollRequest, type SchemaForslag, type SchemaKontrollRequest, type SchemaTerm } from './schema-contract.ts';
import { schemaDagStatus, schemaTillfallen, schemaTillfallesLangd, schemaVisningsDagar, schemaWeekday, type SchemaTillfalle, type SchemaVeckaVal } from './schema-vecka.ts';

export const SCHEMA_DATUM_LIMIT = 20_000;
export type SchemaDatumAndring = { lesson: string; originalDate: string; date: string; startMin: number; room: string | null; durationMin: number };
export type SchemaDatumNyckel = Pick<SchemaDatumAndring, 'lesson' | 'originalDate'>;
export type SchemaDatumTillfalle = SchemaTillfalle & { originalDate: string; changed: boolean };
export type SchemaDatumRequest = SchemaKontrollRequest & { datedOverrides: SchemaDatumAndring[]; dates: string[] };
export type SchemaDatumAvvikelse = { date: string; code: string; message: string; lessons: string[]; occurrences: string[] };
export type SchemaDatumTid = { ref: string; term: SchemaTerm; deltaMin: number; plannedMin: number; needMin: number; maxMin: number; deviation: boolean };
export type SchemaDatumSvar = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; grundFingerprint: string; fingerprint: string;
  datedOverrides: SchemaDatumAndring[]; checkedDates: string[]; violations: SchemaDatumAvvikelse[]; total: number; timeChanges: SchemaDatumTid[] };
export type SchemaDatumReason = 'schema_datum_invalid' | 'schema_datum_calendar_missing' | 'schema_datum_original_missing' | 'schema_datum_date_invalid'
  | 'schema_datum_duration_changed' | 'schema_datum_participants_unavailable' | 'schema_datum_source_unknown';
export class SchemaDatumError extends SchemaContractError {
  readonly reason: SchemaDatumReason;
  constructor(reason: SchemaDatumReason = 'schema_datum_invalid') { super(); this.name = 'SchemaDatumError'; this.reason = reason; }
}
const bad = (reason?: SchemaDatumReason): never => { throw new SchemaDatumError(reason); };
/** En terminsgrund innehåller inte den andra terminens pass. Bara Hela läsåret kan kontrollera flytt mellan terminer. */
export const schemaDatumTermTillaten = (period: SchemaForslag['period'] | undefined, term: SchemaTerm | null): boolean =>
  term !== null && (period === undefined || period === 'lasar' || period === term);
type DatumPeriod = Partial<Pick<SchemaForslag, 'period'>>;
export const schemaDatumNyckel = (key: SchemaDatumNyckel): string => `${key.lesson}@${key.originalDate}`;
export function schemaDatumDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return bad();
  return value;
}
const record = (raw: unknown): Record<string, unknown> => raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : bad();
const int = (raw: unknown, low: number, high: number): number => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= low && raw <= high ? raw : bad();
/** Denna parser är även avsedd för draft-kontraktet. Ingen klientskickad undervisningsetikett accepteras. */
export function parseSchemaDatumAndringar(raw: unknown): SchemaDatumAndring[] {
  if (!Array.isArray(raw) || raw.length > SCHEMA_DATUM_LIMIT) return bad();
  const seen = new Set<string>();
  return raw.map(value => {
    const r = record(value);
    if (Object.keys(r).sort().join() !== 'date,durationMin,lesson,originalDate,room,startMin' || typeof r.lesson !== 'string' || !/^pass-\d{1,8}$/u.test(r.lesson)
      || r.room !== null && (typeof r.room !== 'string' || !/^sal-\d{1,3}$/u.test(r.room))) return bad();
    const a = { lesson: r.lesson, originalDate: schemaDatumDate(r.originalDate), date: schemaDatumDate(r.date), startMin: int(r.startMin, 0, 1435),
      room: r.room as string | null, durationMin: int(r.durationMin, 5, 600) };
    if (a.startMin % 5 || a.durationMin % 5 || a.startMin + a.durationMin > 1440 || seen.has(schemaDatumNyckel(a))) return bad();
    seen.add(schemaDatumNyckel(a)); return a;
  }).sort((a, b) => schemaDatumNyckel(a).localeCompare(schemaDatumNyckel(b)));
}
export function parseSchemaDatumRequest(raw: unknown): SchemaDatumRequest {
  const { datedOverrides, dates, ...request } = record(raw);
  if (!Array.isArray(dates) || dates.length > 366 || new Set(dates).size !== dates.length) return bad();
  return { ...parseSchemaKontrollRequest(request), datedOverrides: parseSchemaDatumAndringar(datedOverrides), dates: dates.map(schemaDatumDate).sort() };
}

/** Ett grundtillfälle kan vara kortat eller helt borttaget av timplansjusteringen. */
export function schemaDatumOriginal(f: Pick<SchemaForslag, 'lessons' | 'time' | 'trims'> & DatumPeriod, key: SchemaDatumNyckel): SchemaDatumTillfalle | null {
  const l = f.lessons.find(x => x.id === key.lesson), day = f.time.calendar?.days.find(d => d.date === key.originalDate);
  if (!l || !day || !schemaDatumTermTillaten(f.period, day.term) || l.day !== schemaWeekday(day.date) || l.startMin === null || l.term !== null && l.term !== day.term) return null;
  if (!l.egenAktivitet && (!day.schoolDay || l.classIds.some(id => !schemaDagStatus(day, id).schoolDay))) return null;
  const length = l.egenAktivitet ? l.durationMin : schemaTillfallesLangd(l, day, f.trims);
  return length > 0 ? { key: schemaDatumNyckel(key), originalDate: key.originalDate, date: key.originalDate, term: day.term, lesson: l, length, changed: false } : null;
}
/** Fysiska datum och originalets längd prövas innan ett undantag används. Regelavvikelser i tid/sal prövas därefter av motorn. */
export function kontrolleraSchemaDatum(f: Pick<SchemaForslag, 'lessons' | 'time' | 'trims' | 'rooms'> & DatumPeriod, raw: SchemaDatumAndring[]): SchemaDatumAndring[] {
  const changes = parseSchemaDatumAndringar(raw);
  if (changes.length && !f.time.calendar) return bad('schema_datum_calendar_missing');
  for (const a of changes) {
    const original = schemaDatumOriginal(f, a), day = f.time.calendar!.days.find(d => d.date === a.date);
    if (!original) return bad('schema_datum_original_missing');
    if (a.durationMin !== original.length) return bad('schema_datum_duration_changed');
    if (!day || !day.schoolDay || !schemaDatumTermTillaten(f.period, day.term) || schemaWeekday(day.date) > 4 || original.lesson.classIds.some(id => !schemaDagStatus(day, id).schoolDay)) return bad('schema_datum_date_invalid');
    if (a.room !== null && !f.rooms.some(r => r.id === a.room)) return bad();
  }
  return changes;
}
/** Även en inflyttning från ett originaldatum utanför intervallet visas exakt en gång. */
export function schemaDatumTillfallen(f: Pick<SchemaForslag, 'lessons' | 'time' | 'trims' | 'rooms'> & DatumPeriod, val: SchemaVeckaVal, overrides: SchemaDatumAndring[] = []): SchemaDatumTillfalle[] {
  if (val.mode === 'grundschema') return [];
  const visibleDays = new Set(schemaVisningsDagar(f.time.calendar, val).map(d => d.date));
  if (!visibleDays.size) return [];
  const changes = kontrolleraSchemaDatum(f, overrides), replaced = new Set(changes.map(schemaDatumNyckel));
  const out = schemaTillfallen(f, val).filter(o => schemaDatumTermTillaten(f.period, o.term) && !replaced.has(o.key)).map(o => ({ ...o, originalDate: o.date, changed: false }));
  for (const a of changes) {
    if (!visibleDays.has(a.date)) continue;
    const original = schemaDatumOriginal(f, a)!, day = f.time.calendar!.days.find(d => d.date === a.date)!;
    out.push({ ...original, date: a.date, term: day.term, length: a.durationMin, changed: true,
      lesson: { ...original.lesson, day: schemaWeekday(a.date), startMin: a.startMin, roomId: a.room } });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.lesson.startMin ?? 0) - (b.lesson.startMin ?? 0) || a.key.localeCompare(b.key));
}
/** Återställning tar bort undantaget. Ingen förändring av f.lessons eller återkommande placeringar sker här. */
export function schemaDatumErsatt(overrides: SchemaDatumAndring[], key: SchemaDatumNyckel, change: SchemaDatumAndring | null): SchemaDatumAndring[] {
  if (change && schemaDatumNyckel(change) !== schemaDatumNyckel(key)) return bad();
  return parseSchemaDatumAndringar([...overrides.filter(a => schemaDatumNyckel(a) !== schemaDatumNyckel(key)), ...(change ? [change] : [])]);
}
/** Undervisningsreferenser kommer från serverns källkoppling, aldrig från namn eller klasslöpnummer. */
export function schemaDatumTidsandringar(f: Pick<SchemaForslag, 'lessons' | 'time' | 'trims' | 'rooms' | 'teachings'>, overrides: SchemaDatumAndring[], sources: { lesson: string; ref: string }[]): SchemaDatumTid[] {
  const byLesson = new Map(sources.map(s => [s.lesson, s.ref])), delta = new Map<string, number>();
  for (const a of kontrolleraSchemaDatum(f, overrides)) {
    if (f.lessons.find(l => l.id === a.lesson)?.egenAktivitet) continue;
    const ref = byLesson.get(a.lesson), original = schemaDatumOriginal(f, a), target = f.time.calendar!.days.find(d => d.date === a.date);
    if (!ref || !original?.term || !target?.term) return bad('schema_datum_source_unknown');
    for (const [term, minutes] of [[original.term, -a.durationMin], [target.term, a.durationMin]] as const) {
      const key = JSON.stringify([ref, term]); delta.set(key, (delta.get(key) ?? 0) + minutes);
    }
  }
  return [...delta].filter(([, minutes]) => minutes !== 0).map(([key, deltaMin]) => {
    const [ref, term] = JSON.parse(key) as [string, SchemaTerm], teaching = f.teachings.find(t => t.ref === ref), range = teaching?.terms.find(t => t.term === term);
    if (!teaching) return bad('schema_datum_source_unknown');
    const needMin = range?.needMin ?? 0, maxMin = range?.maxMin ?? 0, plannedMin = (range?.plannedMin ?? 0) + deltaMin;
    return { ref, term, deltaMin, plannedMin, needMin, maxMin, deviation: plannedMin < needMin || plannedMin > maxMin };
  }).sort((a, b) => a.ref.localeCompare(b.ref) || a.term.localeCompare(b.term));
}

/** Strikt klientkontroll: svaret måste avse samma grund och exakt samma datumändringar som begäran. */
export function parseSchemaDatumSvar(raw: unknown, expected: SchemaDatumRequest): SchemaDatumSvar {
  const r = record(raw);
  if (Object.keys(r).sort().join() !== 'checkedDates,contractVersion,datedOverrides,fingerprint,grundFingerprint,timeChanges,total,violations'
    || r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.grundFingerprint !== expected.grundFingerprint || typeof r.fingerprint !== 'string' || !/^[0-9a-f]{28}$/u.test(r.fingerprint)) return bad();
  const datedOverrides = parseSchemaDatumAndringar(r.datedOverrides);
  if (JSON.stringify(datedOverrides) !== JSON.stringify(parseSchemaDatumAndringar(expected.datedOverrides)) || !Array.isArray(r.checkedDates) || r.checkedDates.length > 366) return bad();
  const checkedDates = r.checkedDates.map(schemaDatumDate), required = new Set([...expected.dates, ...datedOverrides.flatMap(a => [a.originalDate, a.date])]);
  if (new Set(checkedDates).size !== checkedDates.length || checkedDates.length !== required.size || [...required].some(d => !checkedDates.includes(d))) return bad();
  if (!Array.isArray(r.violations) || r.violations.length > SCHEMA_LIMITS.shownViolations || !Array.isArray(r.timeChanges) || r.timeChanges.length > SCHEMA_DATUM_LIMIT * 2) return bad();
  const knownLessons = new Set(expected.placements.map(p => p.lesson));
  const violations = r.violations.map(rawV => {
    const v = record(rawV);
    if (Object.keys(v).sort().join() !== 'code,date,lessons,message,occurrences' || !checkedDates.includes(schemaDatumDate(v.date)) || typeof v.code !== 'string' || v.code.length > 100
      || typeof v.message !== 'string' || v.message.length > SCHEMA_LIMITS.message || !Array.isArray(v.lessons) || v.lessons.length > SCHEMA_LIMITS.lessons || !Array.isArray(v.occurrences) || v.occurrences.length > SCHEMA_LIMITS.lessons
      || v.lessons.some(id => typeof id !== 'string' || !knownLessons.has(id)) || v.occurrences.some(id => typeof id !== 'string' || !/^pass-\d{1,8}@\d{4}-\d{2}-\d{2}$/u.test(id))) return bad();
    for (const key of v.occurrences as string[]) { const [lesson, date] = key.split('@'); schemaDatumDate(date); if (!(v.lessons as string[]).includes(lesson)) return bad(); }
    return { date: v.date as string, code: v.code, message: v.message, lessons: v.lessons as string[], occurrences: v.occurrences as string[] };
  });
  const times = new Set<string>(), timeChanges = r.timeChanges.map(rawT => {
    const t = record(rawT);
    if (Object.keys(t).sort().join() !== 'deltaMin,deviation,maxMin,needMin,plannedMin,ref,term' || typeof t.ref !== 'string' || t.ref.length > 2000 || !/^(?:undervisning|samlasning|valbart-block):[^\p{Cc}]+$/u.test(t.ref)
      || !['ht', 'vt'].includes(t.term as string) || typeof t.deviation !== 'boolean') return bad();
    const key = JSON.stringify([t.ref, t.term]); if (times.has(key)) return bad(); times.add(key);
    const result = { ref: t.ref, term: t.term as SchemaTerm, deltaMin: int(t.deltaMin, -12_000_000, 12_000_000), plannedMin: int(t.plannedMin, 0, Number.MAX_SAFE_INTEGER), needMin: int(t.needMin, 0, Number.MAX_SAFE_INTEGER), maxMin: int(t.maxMin, 0, Number.MAX_SAFE_INTEGER), deviation: t.deviation };
    if (result.maxMin < result.needMin || result.deviation !== (result.plannedMin < result.needMin || result.plannedMin > result.maxMin)) return bad();
    return result;
  });
  const total = int(r.total, violations.length, Number.MAX_SAFE_INTEGER);
  if (total > 0 && !violations.length) return bad();
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: expected.grundFingerprint, fingerprint: r.fingerprint, datedOverrides, checkedDates, violations, total, timeChanges };
}
