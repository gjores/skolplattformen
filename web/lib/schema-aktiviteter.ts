/** Egna återkommande aktiviteter (05.2-SM-AKTIVITETER). Inga elev-ID och ingen timplanetid. */
import type { SchemaForslag, SchemaForslagLesson, SchemaMarginal, SchemaPlacement, SchemaVillkor } from './schema-contract.ts';

export type SchemaAktivitetsVeckor = { typ: 'alla' | 'udda' | 'jamna' } | { typ: 'valda'; veckor: number[] };
export type SchemaAktivitetsTyp = { id: string; name: string; group: string; participants: 'personal' | 'elever' | 'sal'; visibleFor: 'personal' | 'alla'; margin: SchemaMarginal | null };
export type SchemaAktivitet = {
  id: string; typId: string; typ: string; name: string; classRefs: string[]; groupRefs: string[]; teacherRefs: string[]; rooms: string[];
  durationMin: number; veckor: SchemaAktivitetsVeckor; visibleFor: 'personal' | 'alla'; margin: SchemaMarginal | null;
  tid: { typ: 'fast'; day: number; startMin: number } | { typ: 'motor'; days: number[]; startMin: number; endMin: number };
  /** Serien som aktiviteten skapades i, en per klass (05.2-SM-UXF-52). Saknas för en ensam aktivitet. */
  serie?: string;
};
export type SchemaAktivitetsMeta = Pick<SchemaAktivitet, 'id' | 'typId' | 'typ' | 'veckor' | 'visibleFor'>;
export const AKTIVITET_LIMIT = 100;
const DEFAULT_GROUPS: [string, string, SchemaAktivitetsTyp['participants']][] = [
  ['Möten', 'Arbetslagsmöte,Ämneslagsmöte,APT,Elevhälsoteam', 'personal'], ['Prov', 'Provvecka,Omprov', 'elever'],
  ['Schemabrytande', 'Temadag,Friluftsdag,Studiebesök', 'elever'], ['Tillsyn', 'Rastvakt,Lunchvärd', 'personal'], ['Övrigt', 'Mentorstid,Stödundervisning,Salsbokning', 'elever'],
];
export function aktivitetsTyper(): SchemaAktivitetsTyp[] {
  return DEFAULT_GROUPS.flatMap(([group, names, participants], i) => names.split(',').map((name, n) => ({ id: `typ-${i}-${n}`, name, group,
    participants: name === 'Salsbokning' ? 'sal' as const : participants, visibleFor: participants === 'elever' ? 'alla' as const : 'personal' as const, margin: null })));
}
export const aktivitetsPassId = (id: string) => `pass-${900000 + Number(id.slice(10))}`;
export function nyAktivitetId(activities: SchemaAktivitet[]): string {
  return `aktivitet-${Math.max(0, ...activities.map(a => Number(a.id.slice(10)))) + 1}`;
}
export function aktivitetsVeckorText(v: SchemaAktivitetsVeckor): string {
  return v.typ === 'alla' ? 'Varje vecka' : v.typ === 'udda' ? 'Udda veckor (A)' : v.typ === 'jamna' ? 'Jämna veckor (B)' : `v. ${'veckor' in v ? v.veckor.join(', ') : ''}`;
}
export function aktivitetsTidText(a: SchemaAktivitet): string {
  const time = (m: number) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
  const days = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'];
  return a.tid.typ === 'fast' ? `${aktivitetsVeckorText(a.veckor)}, ${days[a.tid.day]} ${time(a.tid.startMin)}–${time(a.tid.startMin + a.durationMin)}`
    : `${aktivitetsVeckorText(a.veckor)}, ${a.durationMin} min. Motorn placerar ${a.tid.days.map(d => days[d]).join(', ')} ${time(a.tid.startMin)}–${time(a.tid.endMin)}`;
}
export function aktiviteternasFel(activities: SchemaAktivitet[]): string[] {
  const errors: string[] = [], ids = new Set<string>();
  const text = (s: unknown, max: number) => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= max;
  const list = (x: unknown, max: number, len: number) => Array.isArray(x) && x.length <= max && new Set(x).size === x.length && x.every(s => text(s, len));
  const min = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= lo && n <= hi && n % 5 === 0;
  if (!Array.isArray(activities) || activities.length > AKTIVITET_LIMIT) return [`Högst ${AKTIVITET_LIMIT} egna aktiviteter kan läggas in.`];
  for (const a of activities) {
    if (!a || typeof a !== 'object' || !/^aktivitet-[1-9]\d{0,4}$/u.test(a.id) || ids.has(a.id)) { errors.push('Aktiviteten måste ha en egen giltig identitet.'); continue; }
    ids.add(a.id);
    if (!text(a.typId, 64) || !text(a.typ, 80) || !text(a.name, 120)) errors.push('Aktiviteten ska ha typ och namn.');
    if (!list(a.classRefs, 500, 100) || !list(a.groupRefs, 500, 100) || !list(a.teacherRefs, 500, 100) || !list(a.rooms, 1, 60)) errors.push(`${a.name}: välj giltiga deltagare och högst en sal.`);
    else if (!a.classRefs.length && !a.groupRefs.length && !a.teacherRefs.length && !a.rooms.length) errors.push(`${a.name}: välj minst en deltagare eller sal.`);
    if (!min(a.durationMin, 5, 600)) errors.push(`${a.name}: längden ska vara 5–600 minuter i steg om fem.`);
    const tid = a.tid;
    if (!tid || !min(tid.startMin, 0, 1435) || (tid.typ !== 'fast' && tid.typ !== 'motor')) errors.push(`${a.name}: välj giltig tid.`);
    else if (tid.typ === 'fast') { if (!Number.isSafeInteger(tid.day) || tid.day < 0 || tid.day > 4 || tid.startMin + a.durationMin > 1440) errors.push(`${a.name}: välj vardag och en tid inom dygnet.`); }
    else if (!Array.isArray(tid.days) || !tid.days.length || tid.days.length > 5 || new Set(tid.days).size !== tid.days.length || tid.days.some(d => !Number.isSafeInteger(d) || d < 0 || d > 4)
      || !min(tid.endMin, 5, 1440) || tid.endMin - tid.startMin < a.durationMin) errors.push(`${a.name}: tidsfönstret ska rymma aktiviteten.`);
    const v = a.veckor;
    if (!v || !['alla', 'udda', 'jamna', 'valda'].includes(v.typ) || v.typ === 'valda' && (!Array.isArray(v.veckor) || !v.veckor.length || v.veckor.length > 53 || new Set(v.veckor).size !== v.veckor.length || v.veckor.some(n => !Number.isSafeInteger(n) || n < 1 || n > 53))) errors.push(`${a.name}: välj giltiga veckor (1–53).`);
    if (a.visibleFor !== 'personal' && a.visibleFor !== 'alla') errors.push(`${a.name}: välj vilka som ser aktiviteten.`);
    if (a.serie !== undefined && (typeof a.serie !== 'string' || !/^serie-[1-9]\d{0,4}$/u.test(a.serie))) errors.push(`${a.name}: serien är ogiltig.`);
    if (a.margin !== null) {
      const m = a.margin;
      if (!m || m.typ !== 'marginal' || !min(m.beforeMin, 0, 60) || !min(m.afterMin, 0, 60) || !Array.isArray(m.occupies) || m.occupies.some(x => !['elever', 'larare', 'sal'].includes(x))
        || !text(m.label, 40) || !Array.isArray(m.visibleFor) || m.visibleFor.some(x => !['elever', 'larare'].includes(x)) || m.when !== 'alltid') errors.push(`${a.name}: marginalen är ogiltig.`);
    }
  }
  return errors;
}
/** Strikt form för klientens aktiviteter. Underlagets resurser prövas separat på servern. */
export function parseAktiviteter(value: unknown): SchemaAktivitet[] {
  const list = value as SchemaAktivitet[];
  if (aktiviteternasFel(list).length) throw new TypeError('Aktiviteterna kunde inte kontrolleras.');
  const keys = ['id', 'typId', 'typ', 'name', 'classRefs', 'groupRefs', 'teacherRefs', 'rooms', 'durationMin', 'veckor', 'visibleFor', 'margin', 'tid'];
  for (const a of list) {
    if (Object.keys(a).length !== keys.length + (Object.hasOwn(a, 'serie') ? 1 : 0) || keys.some(k => !Object.hasOwn(a, k))) throw new TypeError('Okända aktivitetsfält.');
    const tid = Object.keys(a.tid).sort().join(), veckor = Object.keys(a.veckor).sort().join();
    if (tid !== (a.tid.typ === 'fast' ? 'day,startMin,typ' : 'days,endMin,startMin,typ') || veckor !== (a.veckor.typ === 'valda' ? 'typ,veckor' : 'typ')) throw new TypeError('Okända tidsfält.');
  }
  return structuredClone(list);
}
export function readAktivitetsTyper(storage: Pick<Storage, 'getItem'> | null, unitId: string): SchemaAktivitetsTyp[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(`schema-aktivitetstyper:${unitId}`) ?? 'null');
    if (Array.isArray(raw) && raw.length <= 100 && raw.every(t => t && typeof t.id === 'string' && typeof t.name === 'string' && t.name.length <= 80 && t.name.trim().length && typeof t.group === 'string' && t.group.length <= 60
      && ['personal', 'elever', 'sal'].includes(t.participants) && ['personal', 'alla'].includes(t.visibleFor)) && new Set(raw.map(t => t.id)).size === raw.length) return raw.map(t => ({ id: t.id, name: t.name.trim(), group: t.group.trim(), participants: t.participants, visibleFor: t.visibleFor, margin: t.margin ?? null })) as SchemaAktivitetsTyp[];
  } catch { /* privat läge eller gammalt format */ }
  return aktivitetsTyper();
}
export function writeAktivitetsTyper(storage: Pick<Storage, 'setItem'> | null, unitId: string, types: SchemaAktivitetsTyp[]): void {
  try { storage?.setItem(`schema-aktivitetstyper:${unitId}`, JSON.stringify(types.map(({ id, name, group, participants, visibleFor, margin }) => ({ id, name, group, participants, visibleFor, margin })))); } catch { /* vyn fungerar utan lagring */ }
}
export function aktivitetTypAndra(types: SchemaAktivitetsTyp[], next: SchemaAktivitetsTyp): SchemaAktivitetsTyp[] {
  if (!types.some(t => t.id === next.id) && types.length >= 100) throw new TypeError('Typlistan får innehålla högst 100 typer.');
  if (!next.id.trim() || !next.name.trim() || next.name.trim().length > 80 || !next.group.trim() || next.group.trim().length > 60) throw new TypeError('Typen ska ha namn och grupp.');
  const clean = { ...next, name: next.name.trim(), group: next.group.trim() };
  const errors = aktiviteternasFel([{ id: 'aktivitet-1', typId: clean.id, typ: clean.name, name: clean.name, classRefs: [], groupRefs: [], teacherRefs: ['personal'], rooms: [], durationMin: 20, veckor: { typ: 'alla' }, visibleFor: clean.visibleFor, margin: clean.margin, tid: { typ: 'fast', day: 0, startMin: 480 } }]);
  if (errors.length || !['personal', 'elever', 'sal'].includes(clean.participants)) throw new TypeError(errors.join(' ') || 'Välj ett giltigt deltagarförval.');
  return types.some(t => t.id === next.id) ? types.map(t => t.id === next.id ? clean : t) : [...types, clean];
}
/** Bevarade undervisningsplaceringar och aktiviteternas stabila pass-ID vid ny aktivitetslista. */
export function aktivitetPlaceringar(f: SchemaForslag, next: SchemaAktivitet[]): SchemaPlacement[] {
  const kept = new Set(next.map(a => a.id));
  return f.lessons.flatMap(l => l.day === null || l.startMin === null || l.egenAktivitet && !kept.has(l.egenAktivitet.id) ? []
    : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
}
export type SchemaAktivitetsSnapshot = { forslag: SchemaForslag; villkor: SchemaVillkor };
export function aktivitetsSnapshot(f: SchemaForslag, placements: Record<string, { day: number | null; startMin: number | null; room: string | null }>, villkor: SchemaVillkor): SchemaAktivitetsSnapshot {
  return { forslag: { ...f, lessons: f.lessons.map(l => { const p = placements[l.id]; return p ? { ...l, day: p.day, startMin: p.startMin, roomId: p.room } : l; }) }, villkor };
}
export const fastAktivitet = (l: SchemaForslagLesson, villkor: SchemaVillkor): boolean => !!l.egenAktivitet && villkor.aktiviteter?.find(a => a.id === l.egenAktivitet!.id)?.tid.typ === 'fast';
/** Liten ren hjälpare för listan och för samma metadata i varje schemavy. */
export const aktivitetPass = (lessons: SchemaForslagLesson[], id: string) => lessons.find(l => l.egenAktivitet?.id === id);


/** Ett användarlås måste tas bort uttryckligt före ändring eller borttagning av aktiviteten. Då bevaras också låsens egen ångraordning. */
export function lastAktivitetAndras(before: SchemaAktivitet[], after: SchemaAktivitet[], lockedPasses: string[]): boolean {
  const locked = new Set(lockedPasses), next = new Map(after.map(a => [a.id, a]));
  const key = (a: SchemaAktivitet) => JSON.stringify(a, (_name, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  return before.some(a => locked.has(aktivitetsPassId(a.id)) && (!next.has(a.id) || key(a) !== key(next.get(a.id)!)));
}
