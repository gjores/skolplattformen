// Villkoren som lager i veckan (05.2-SM-VILLKOR-SYNS): det som styr var pass får ligga ritas för den klass eller lärare som visas.
// Ren funktion utan React. Ger fält, band och nedtoning i formen som veckorutnätet (app/schema/vecka.tsx) ritar, och för varje fält
// varifrån det kommer (`sourceId` → `kallor`). Inget lagras.
import type { SchemaForslag, SchemaForslagLesson, SchemaMarginalDel, SchemaRegel, SchemaVillkor } from './schema-contract.ts';
import { passMarginal } from './schema-marginal.ts';
import type { SchemaBand, SchemaDimmed, SchemaOverlay } from './schema-utkast.ts';

/** Lagren som kan visas eller döljas i veckan (chipsraden i Main). Förval: alla på utom Salar. */
export const SCHEMA_LAGER = [
  { id: 'sparrad', namn: 'Spärrad tid', forval: true },
  { id: 'tillaten', namn: 'Tillåten tid', forval: true },
  { id: 'lunch', namn: 'Lunch', forval: true },
  { id: 'marginal', namn: 'Marginaler', forval: true },
  { id: 'salar', namn: 'Salar', forval: false },
  { id: 'sena', namn: 'Sena pass', forval: true },
] as const;
export type SchemaLagerTyp = typeof SCHEMA_LAGER[number]['id'];
/** Om ett lager visas. Saknad nyckel i utkastets `layers` betyder lagrets förval. */
export const lagerPa = (layers: Record<string, boolean>, id: SchemaLagerTyp): boolean => layers[id] ?? SCHEMA_LAGER.find(x => x.id === id)!.forval;

/** Det som visas i veckan: en klass (eller grupp) eller en lärare, med förslagets löpnummer (`grupp-1`, `larare-3`). */
export type SchemaVisad = { slag: 'klass' | 'larare'; ref: string };
/**
 * Varifrån ett fält kommer. `egen`: plats `index` i `villkor.egna`. Grundvillkoren: skoldagen, lunchfönstret och sena pass.
 * `beror`: antal pass som ligger på villkoret nu (på spärrad tid, utanför tillåten tid eller skoldagen, efter sen tid); `null` när det inte går att säga.
 */
export type SchemaKalla = { id: string; lager: SchemaLagerTyp } & (
  | { typ: 'egen'; index: number; namn: string; beror: number }
  | { typ: 'skoldag' | 'lunch' | 'sena'; beror: number | null });
export type SchemaLager = { overlays: SchemaOverlay[]; bands: SchemaBand[]; dimmed: SchemaDimmed[]; kallor: Record<string, SchemaKalla> };
export type SchemaLagerUnderlag = Pick<SchemaForslag, 'days' | 'classes' | 'teachers' | 'rooms' | 'resurser' | 'lessons'>;
export type SchemaLagerVal = {
  /** Passen som visas (termin och utkastets placeringar). Utan värde: förslagets lagda pass för den som visas. */
  lessons?: SchemaForslagLesson[];
  /** Alla pass som räknas när ett villkor säger hur många pass som ligger på det, till exempel terminen som visas. Utan värde: förslagets alla pass. */
  alla?: SchemaForslagLesson[];
  /** Synliga lager (utkastets `layers`). */
  layers?: Record<string, boolean>;
  /** Veckodagar utan skoldag för den som visas. Förslaget bär inte klassens skoldagar per veckodag än; funktionen klarar dem när de finns. */
  utanSkoldag?: number[];
};

type Span = [number, number];
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const overlaps = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1];
function union(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
/** Det som återstår av `whole` utanför `open`. */
function minus(whole: Span, open: Span[]): Span[] {
  const out: Span[] = [];
  let at = whole[0];
  for (const [a, b] of union(open)) {
    if (b <= at || a >= whole[1]) continue;
    if (a > at) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < whole[1]) out.push([at, whole[1]]);
  return out;
}
const span = (l: SchemaForslagLesson): Span => [l.startMin!, l.startMin! + l.durationMin];
type Tid = Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>;
type Ref = { slag: 'klass' | 'grupp' | 'larare'; ref: string; name: string };

/**
 * Appens ID för en klass, grupp eller lärare i förslaget. Förslaget numrerar klasser och lärare i underlagets ordning (`grupp-n` är
 * `resurser.klass[n-1]`, `larare-n` är `resurser.larare[n-1]`); namnet måste stämma. En grupp som visas som klass känns igen på namnet.
 */
function refs(f: SchemaLagerUnderlag): Map<string, Ref> {
  const out = new Map<string, Ref>();
  const at = (id: string) => Number(/-(\d+)$/u.exec(id)?.[1] ?? 0) - 1;
  for (const c of f.classes) {
    const klass = f.resurser.klass[at(c.id)], grupper = f.resurser.grupp.filter(g => g.name === c.name);
    if (klass?.name === c.name) out.set(c.id, { slag: 'klass', ref: klass.ref, name: c.name });
    else if (grupper.length === 1) out.set(c.id, { slag: 'grupp', ref: grupper[0].ref, name: c.name });
  }
  for (const t of f.teachers) { const larare = f.resurser.larare[at(t.id)]; if (larare?.name === t.name) out.set(t.id, { slag: 'larare', ref: larare.ref, name: t.name }); }
  return out;
}

/** Namnet på det ett eget villkor gäller. */
export function regelNamn(r: SchemaRegel, resurser: SchemaLagerUnderlag['resurser']): string {
  return r.slag === 'amne' || r.slag === 'sal' ? r.ref : resurser[r.slag].find(x => x.ref === r.ref)?.name ?? r.ref;
}

/** Fält, band och nedtoning för den som visas, och varifrån varje fält kommer. */
export function schemaLager(villkor: SchemaVillkor, f: SchemaLagerUnderlag, visad: SchemaVisad, val: SchemaLagerVal = {}): SchemaLager {
  const on = (id: SchemaLagerTyp) => lagerPa(val.layers ?? {}, id);
  const placed = (val.alla ?? f.lessons).filter(l => l.day !== null && l.startMin !== null);
  const lessons = (val.lessons ?? f.lessons.filter(l => (visad.slag === 'klass' ? l.classIds : l.teacherIds).includes(visad.ref))).filter(l => l.day !== null && l.startMin !== null);
  const days = f.days.length, start = Math.min(...f.days.map(d => d.startMin)), end = Math.max(...f.days.map(d => d.endMin)), whole: Span = [start, end];
  const ids = refs(f), me = ids.get(visad.ref) ?? null;
  const roomName = (id: string | null) => f.rooms.find(r => r.id === id)?.name ?? null;
  const titles = new Set(lessons.map(l => l.title)), rooms = new Set(lessons.flatMap(l => [l.roomId, ...l.roomIds]).map(roomName));
  // Passen ett eget villkor gäller: klassens, gruppens och lärarens pass, ämnets pass och passen som ligger i salen.
  const galler = (r: SchemaRegel) => (l: SchemaForslagLesson) => r.slag === 'amne' ? l.title === r.ref : r.slag === 'sal' ? roomName(l.roomId) === r.ref
    : (r.slag === 'larare' ? l.teacherIds : l.classIds).some(id => { const x = ids.get(id); return x?.slag === r.slag && x.ref === r.ref; });
  const overlays: SchemaOverlay[] = [], bands: SchemaBand[] = [], kallor: Record<string, SchemaKalla> = {};
  const field = (day: number, [a, b]: Span, kind: SchemaOverlay['kind'], label: string, sourceId: string) => { if (a < b) overlays.push({ day, startMin: a, endMin: b, kind, label, sourceId }); };

  // Egna villkor för tid: den som visas, ämnena i veckan och salarna passen använder eller får använda.
  const tider = villkor.egna.flatMap((r, index): { r: Tid; index: number }[] => (r.typ === 'sparrad' || r.typ === 'tillaten') && (
    r.slag === 'amne' ? titles.has(r.ref) : r.slag === 'sal' ? rooms.has(r.ref) : me !== null && r.slag === me.slag && r.ref === me.ref) ? [{ r, index }] : []);
  for (const { r, index } of tider) {
    const lager: SchemaLagerTyp = r.slag === 'sal' ? 'salar' : r.typ, name = regelNamn(r, f.resurser), id = `egna:${index}`;
    if (!on(lager)) continue;
    if (r.typ === 'sparrad') {
      const own: Span = [r.startMin, r.endMin], helDag = r.startMin <= start && r.endMin >= end;
      for (const day of r.days) if (day < days) field(day, own, 'sparrad', `Spärrad · ${name} · ${helDag ? 'hela dagen' : `${clock(r.startMin)}–${clock(r.endMin)}`}`, id);
      kallor[id] = { id, lager, typ: 'egen', index, namn: name, beror: placed.filter(galler(r)).filter(l => r.days.includes(l.day!) && overlaps(span(l), own)).length };
      continue;
    }
    // Tillåten tid: villkor för samma klass, ämne, lärare eller sal läggs ihop; en dag utan något av dem är helt utanför (som i underlaget).
    const key = `${r.slag}|${r.ref}`, same = tider.filter(x => x.r.typ === 'tillaten' && `${x.r.slag}|${x.r.ref}` === key);
    if (same[0].index !== index) continue;
    const open = (day: number) => union(same.flatMap(x => x.r.days.includes(day) ? [[x.r.startMin, x.r.endMin] as Span] : []));
    for (let day = 0; day < days; day++) for (const out of minus(whole, open(day))) field(day, out, 'tillaten-ute', `Utanför tillåten tid · ${name}`, id);
    kallor[id] = { id, lager, typ: 'egen', index, namn: name,
      beror: placed.filter(galler(r)).filter(l => !open(l.day!).some(([a, b]) => l.startMin! >= a && l.startMin! + l.durationMin <= b)).length };
  }

  // Skoldagens ramar per veckodag, och dagar utan skoldag.
  if (on('tillaten')) {
    const frame = (day: number): Span => [villkor.days[day]?.startMin ?? f.days[day].startMin, villkor.days[day]?.endMin ?? f.days[day].endMin];
    let any = false;
    for (let day = 0; day < days; day++) {
      const outside = val.utanSkoldag?.includes(day) ? [whole] : minus(whole, [frame(day)]);
      for (const out of outside) { field(day, out, 'tillaten-ute', val.utanSkoldag?.includes(day) ? 'Ingen skoldag' : 'Utanför skoldagen', 'skoldag'); any = true; }
    }
    if (any) kallor.skoldag = { id: 'skoldag', lager: 'tillaten', typ: 'skoldag',
      beror: lessons.filter(l => val.utanSkoldag?.includes(l.day!) || l.startMin! < frame(l.day!)[0] || l.startMin! + l.durationMin > frame(l.day!)[1]).length };
  }
  // Lunchfönstret: för klasser, och för lärare när lärare också ska få lunch.
  if (on('lunch') && villkor.lunch && (visad.slag === 'klass' || villkor.lunch.teachers)) {
    for (let day = 0; day < days; day++) field(day, [villkor.lunch.startMin, villkor.lunch.endMin], 'lunch', 'Lunch', 'lunch');
    kallor.lunch = { id: 'lunch', lager: 'lunch', typ: 'lunch', beror: null };
  }
  // Sena pass: tiden efter klockslaget fram till dagens slut. Ett önskemål, inget förbud.
  if (on('sena') && villkor.lateAfterMin !== null) {
    const late = villkor.lateAfterMin;
    let any = false;
    for (let day = 0; day < days; day++) { const to = Math.min(end, villkor.days[day]?.endMin ?? f.days[day].endMin); if (late < to) { field(day, [late, to], 'onskemal', `Sena pass · efter ${clock(late)}`, 'sena'); any = true; } }
    if (any) kallor.sena = { id: 'sena', lager: 'sena', typ: 'sena', beror: lessons.filter(l => l.startMin! + l.durationMin > late).length };
  }
  // Marginal före och efter passet (05.2-SM-MARGINAL) för den part vyn visar: klassens vy visar elevernas marginal, lärarens vy lärarens.
  if (on('marginal')) for (const l of lessons) bands.push(...marginalBand(villkor, f, l, visad.slag === 'klass' ? 'elever' : 'larare'));

  return { overlays, bands, dimmed: [], kallor };
}

/**
 * Banden före och efter ett pass för en part (05.2-SM-MARGINAL, N102): alla marginaler som gäller passet – klassens, gruppens, lärarens, ämnets,
 * salens (pass som får ligga i salen) och passets eget – sammanslagna per sida, den största gäller. Samma regel som underlaget skickar till motorn.
 * Bandets text är etiketten och tiden, till exempel "Omklädning 10 min".
 */
export function marginalBand(villkor: SchemaVillkor, f: SchemaLagerUnderlag, l: SchemaForslagLesson, del: SchemaMarginalDel): SchemaBand[] {
  const ids = refs(f), roomName = (id: string | null) => f.rooms.find(r => r.id === id)?.name ?? null;
  const galler = (r: SchemaRegel) => r.slag === 'pass' ? r.ref === l.id : r.slag === 'amne' ? r.ref === l.title : r.slag === 'sal' ? l.roomIds.some(id => roomName(id) === r.ref)
    : (r.slag === 'larare' ? l.teacherIds : l.classIds).some(id => { const x = ids.get(id); return x?.slag === r.slag && x.ref === r.ref; });
  const m = passMarginal(villkor.egna.filter(r => r.typ === 'marginal' && galler(r)))[del];
  // Salens marginal gäller bara pass som har en sal; lärarens bara pass med lärare.
  if (del === 'sal' && !l.roomIds.length || del === 'larare' && !l.teacherIds.length) return [];
  return [
    ...m.fore ? [{ lesson: l.id, side: 'fore' as const, minutes: m.fore, label: `${m.foreLabel} ${m.fore} min`, kind: 'marginal' as const }] : [],
    ...m.efter ? [{ lesson: l.id, side: 'efter' as const, minutes: m.efter, label: `${m.efterLabel} ${m.efter} min`, kind: 'marginal' as const }] : [],
  ];
}
