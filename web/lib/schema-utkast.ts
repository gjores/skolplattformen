// Utkastet för arbetsytan i Schema (05.2-SM-YTA): var passen ligger just nu, markerat pass, verktyg, synliga lager och ångra/gör om.
// Ren reducer utan React och utan sidoeffekter. Tillståndet är vanlig JSON (krävs för att flera fönster ska kunna dela utkastet, SM-FONSTER).
// Inget sparas: utkastet lever i webbläsaren tills sidan lämnas eller ett nytt förslag tas fram.
import type { SchemaForslag, SchemaForslagLesson, SchemaPlacement, SchemaRegel, SchemaRegelSlag } from './schema-contract.ts';

/** Var ett pass ligger. `day` och `startMin` är null när passet ligger på viloytan. */
export type SchemaUtkastPlats = { day: number | null; startMin: number | null; room: string | null };
export type SchemaUtkastPlatser = Record<string, SchemaUtkastPlats>;
/** Verktygen i veckan (Main). Markera, Spärra, Tillåt bara och Viloyta används (05.2-SM-MENY); Lås och Byt kopplas in av SM-BYT. */
export type SchemaVerktyg = 'markera' | 'sparra' | 'tillat' | 'las' | 'viloyta' | 'byt';
/** En flytt i ångra eller gör om: placeringarna före ändringen och vilket pass den gällde. */
export type SchemaFlyttSteg = { lesson: string; placements: SchemaUtkastPlatser };
/**
 * Ett eget villkor som lades till i veckan (05.2-SM-MENY): de egna villkoren före och efter, och en text för ångra.
 * Villkoren hålls i arbetsytans villkorsformulär; steget bär båda listorna så att ångra och gör om kan sätta tillbaka rätt lista.
 */
export type SchemaVillkorSteg = { villkor: SchemaRegel[]; efter: SchemaRegel[]; text: string };
export type SchemaUtkastSteg = SchemaFlyttSteg | SchemaVillkorSteg;
export const villkorSteg = (step: SchemaUtkastSteg | undefined): step is SchemaVillkorSteg => step !== undefined && 'villkor' in step;
export type SchemaUtkast = {
  placements: SchemaUtkastPlatser;
  picked: string | null;
  tool: SchemaVerktyg;
  /** Lager som användaren har stängt av eller slagit på. Saknad nyckel betyder lagrets förval. */
  layers: Record<string, boolean>;
  undo: SchemaUtkastSteg[];
  redo: SchemaUtkastSteg[];
};
/** Salar som kontrollen har valt, per pass. Används efter en kontroll så att utkastet bär samma sal som servern räknat med. */
export type SchemaUtkastSalar = Record<string, string | null>;
export type SchemaUtkastAtgard =
  | { type: 'move'; lesson: string; day: number; startMin: number; room?: string | null; rooms?: SchemaUtkastSalar }
  | { type: 'park'; lesson: string; rooms?: SchemaUtkastSalar }
  | { type: 'pick'; lesson: string | null }
  | { type: 'undo'; rooms?: SchemaUtkastSalar }
  | { type: 'redo'; rooms?: SchemaUtkastSalar }
  | { type: 'reset'; forslag: { lessons: Pick<SchemaForslagLesson, 'id' | 'day' | 'startMin' | 'roomId'>[] } }
  | { type: 'villkor'; fore: SchemaRegel[]; efter: SchemaRegel[]; text: string }
  /** Salarna efter en kontroll som kördes om för ändrade villkor (05.2-SM-VILLKOR-DIREKT): inget pass flyttas och inget ångra-steg läggs till. */
  | { type: 'salar'; rooms: SchemaUtkastSalar }
  | { type: 'tool'; tool: SchemaVerktyg }
  | { type: 'layer'; layer: string; on: boolean };

/**
 * Lager i veckorutnätet. Ritas av `app/schema/vecka.tsx`; tas fram av senare planer (SM-VILLKOR-SYNS, SM-LAGEN, SM-AKTIVITETER).
 * Fälttyper för villkor (`sparrad`, `tillaten-ute`, `lunch`, `marginal`, `aktivitet`, `installt`) och för möjlighetskartan (`fri`, `onskemal`, `byte`, `brott`).
 */
export const SCHEMA_FALT = ['sparrad', 'tillaten-ute', 'lunch', 'marginal', 'aktivitet', 'installt', 'fri', 'onskemal', 'byte', 'brott'] as const;
export type SchemaFaltTyp = typeof SCHEMA_FALT[number];
/** Ett fält över hela dagens bredd, under passen. `label` är den synliga texten; `sourceId` pekar på villkoret fältet kommer från. */
export type SchemaOverlay = { day: number; startMin: number; endMin: number; kind: SchemaFaltTyp; label: string; sourceId?: string };
/** Ett band intill ett pass, före eller efter det. Förval är marginal (prickad kant); restid är streckad. */
export type SchemaBand = { lesson: string; side: 'fore' | 'efter'; minutes: number; label: string; kind?: 'marginal' | 'restid' };
/** Nedtonad tid, till exempel utanför tillåten tid. */
export type SchemaDimmed = { day: number; startMin: number; endMin: number };

/** Högsta antal steg som går att ångra. Äldre steg släpps. */
export const SCHEMA_UTKAST_STEG = 200;

export function tomtUtkast(): SchemaUtkast {
  return { placements: {}, picked: null, tool: 'markera', layers: {}, undo: [], redo: [] };
}

const withRooms = (placements: SchemaUtkastPlatser, rooms?: SchemaUtkastSalar): SchemaUtkastPlatser => {
  if (!rooms) return placements;
  // Samma regel som kontrollen: ett pass utan tid har ingen sal, ett lagt pass har den sal kontrollen gav (eller ingen).
  return Object.fromEntries(Object.entries(placements).map(([id, p]) => [id, { ...p, room: p.day === null ? null : rooms[id] ?? null }]));
};
const push = (list: SchemaUtkastSteg[], step: SchemaUtkastSteg) => [...list, step].slice(-SCHEMA_UTKAST_STEG);
const flyttSteg = (step: SchemaUtkastSteg | undefined) => step && !villkorSteg(step) ? step : null;

/**
 * Placeringarna som en flytt, parkering, ångra eller gör om skulle ge, utan att ändra utkastet. Används för att låta kontrollen pröva ändringen först.
 * Ett villkorssteg flyttar inget pass och ger `null`.
 */
export function utkastEfter(state: SchemaUtkast, action: SchemaUtkastAtgard): SchemaUtkastPlatser | null {
  if (action.type === 'undo') return flyttSteg(state.undo.at(-1))?.placements ?? null;
  if (action.type === 'redo') return flyttSteg(state.redo.at(-1))?.placements ?? null;
  if (action.type !== 'move' && action.type !== 'park') return null;
  const before = state.placements[action.lesson];
  if (!before) return null;
  const next: SchemaUtkastPlats = action.type === 'park' ? { day: null, startMin: null, room: null }
    : { day: action.day, startMin: action.startMin, room: action.room === undefined ? before.room : action.room };
  return { ...state.placements, [action.lesson]: next };
}

/** Vilket pass nästa ångra eller gör om gäller (null för ett villkorssteg). */
export const utkastSteg = (state: SchemaUtkast, which: 'undo' | 'redo') => flyttSteg(state[which].at(-1))?.lesson ?? null;

export function schemaUtkast(state: SchemaUtkast, action: SchemaUtkastAtgard): SchemaUtkast {
  switch (action.type) {
    case 'reset': {
      const placements = Object.fromEntries(action.forslag.lessons.map(l => [l.id, { day: l.day, startMin: l.startMin, room: l.roomId }]));
      // Ett nytt förslag tömmer historiken. Verktyg och lager är användarens val och står kvar.
      return { ...state, placements, picked: null, undo: [], redo: [] };
    }
    case 'move': case 'park': {
      const next = utkastEfter(state, action);
      if (!next) return state;
      return { ...state, placements: withRooms(next, action.rooms), picked: null, undo: push(state.undo, { lesson: action.lesson, placements: state.placements }), redo: [] };
    }
    case 'undo': case 'redo': {
      const from = action.type === 'undo' ? state.undo : state.redo, to = action.type === 'undo' ? state.redo : state.undo;
      const step = from.at(-1);
      if (!step) return state;
      // Ett villkorssteg bär villkoren före och efter och flyttar inget pass; arbetsytan sätter tillbaka villkoren.
      if (villkorSteg(step)) return { ...state, undo: action.type === 'undo' ? from.slice(0, -1) : push(to, step), redo: action.type === 'undo' ? push(to, step) : from.slice(0, -1) };
      const moved = { lesson: step.lesson, placements: state.placements };
      return { ...state, placements: withRooms(step.placements, action.rooms), picked: null,
        undo: action.type === 'undo' ? from.slice(0, -1) : push(to, moved), redo: action.type === 'undo' ? push(to, moved) : from.slice(0, -1) };
    }
    case 'pick':
      return action.lesson === null || action.lesson in state.placements ? { ...state, picked: action.lesson } : state;
    case 'salar':
      return { ...state, placements: withRooms(state.placements, action.rooms) };
    case 'villkor':
      return { ...state, undo: push(state.undo, { villkor: action.fore, efter: action.efter, text: action.text }), redo: [] };
    case 'tool':
      return { ...state, tool: action.tool };
    case 'layer':
      return { ...state, layers: { ...state.layers, [action.layer]: action.on } };
  }
}

/** Lagda pass i kontrollens format. */
export function utkastPlaceringar(placements: SchemaUtkastPlatser): SchemaPlacement[] {
  return Object.entries(placements).flatMap(([lesson, p]) => p.day === null || p.startMin === null ? [] : [{ lesson, day: p.day, startMin: p.startMin, room: p.room }]);
}

/** Förslagets pass med utkastets placeringar. Pass som inte finns i utkastet behåller förslagets plats. */
export function medUtkast<T extends Pick<SchemaForslagLesson, 'id' | 'day' | 'startMin' | 'roomId'>>(lessons: T[], placements: SchemaUtkastPlatser): T[] {
  return lessons.map(l => { const p = placements[l.id]; return p ? { ...l, day: p.day, startMin: p.startMin, roomId: p.room } : l; });
}

// Spärrar och flytt med tangentbord i veckan (05.2-SM-MENY). Spärrar är vanliga egna villkor (`sparrad`, `tillaten`); ingen egen regelmekanism.

/** En markerad tid i veckan: en dag, på 5-minutersrutnätet. */
export type SchemaMarkering = { day: number; startMin: number; endMin: number };
/** Markeringens rutnät i minuter, och hur långt piltangenterna flyttar eller utökar den. */
export const MARKERING_RUTA = 5, MARKERING_STEG = 15;
type Dagar = SchemaForslag['days'];
const snap = (minutes: number) => Math.round(minutes / MARKERING_RUTA) * MARKERING_RUTA;
const inom = (days: Dagar, day: number, m: number) => Math.min(days[day].endMin, Math.max(days[day].startMin, m));

/** Markering mellan två punkter i en dag (dra med musen), på 5-minutersrutnätet inom skoldagen och minst 5 minuter lång. */
export function markeringMellan(days: Dagar, day: number, a: number, b: number): SchemaMarkering {
  let start = inom(days, day, snap(Math.min(a, b))), end = inom(days, day, snap(Math.max(a, b)));
  if (end - start < MARKERING_RUTA) { if (end + MARKERING_RUTA <= days[day].endMin) end = start + MARKERING_RUTA; else start = end - MARKERING_RUTA; }
  return { day, startMin: start, endMin: end };
}

/** Markering från en punkt (högerklick på tom tid): en timme framåt, eller det som ryms före dagens slut. */
export function markeringVid(days: Dagar, day: number, minute: number, length = 60): SchemaMarkering {
  const start = Math.min(inom(days, day, Math.floor(minute / MARKERING_RUTA) * MARKERING_RUTA), days[day].endMin - MARKERING_RUTA);
  return { day, startMin: start, endMin: Math.min(days[day].endMin, start + length) };
}

export type SchemaPil = 'upp' | 'ner' | 'vanster' | 'hoger';
/**
 * Piltangenterna på en markerad tid: upp och ned flyttar markeringen 15 minuter, vänster och höger en dag. Med `utoka` (Skift) ändras
 * bara slutet: ned utökar, upp minskar. Markeringen stannar inom skoldagen och behåller sin längd när den flyttas.
 */
export function flyttaMarkering(days: Dagar, m: SchemaMarkering, pil: SchemaPil, utoka = false): SchemaMarkering {
  const length = m.endMin - m.startMin;
  if (pil === 'vanster' || pil === 'hoger') {
    const day = Math.min(days.length - 1, Math.max(0, m.day + (pil === 'hoger' ? 1 : -1)));
    const start = Math.max(days[day].startMin, Math.min(m.startMin, days[day].endMin - length));
    return { day, startMin: start, endMin: Math.min(days[day].endMin, start + length) };
  }
  const delta = pil === 'ner' ? MARKERING_STEG : -MARKERING_STEG;
  if (utoka) return { ...m, endMin: Math.max(m.startMin + MARKERING_RUTA, inom(days, m.day, m.endMin + delta)) };
  const start = Math.max(days[m.day].startMin, Math.min(m.startMin + delta, days[m.day].endMin - length));
  return { ...m, startMin: start, endMin: start + length };
}

/** Starttider på startrutnätet där ett pass med längden ryms i dagen (samma regel som flyttpanelen). */
function starttider(f: Pick<SchemaForslag, 'days' | 'startGridMin'>, day: number, length: number): number[] {
  const frame = f.days[day], out: number[] = [];
  if (frame) for (let m = frame.startMin; m + length <= frame.endMin; m += f.startGridMin) out.push(m);
  return out;
}
/**
 * Var ett lagt pass hamnar med en piltangent (D27): upp och ned ett steg på startrutnätet samma dag, vänster och höger samma tid en annan dag.
 * Null när passet redan ligger vid dagens eller veckans gräns, eller när tiden inte ryms den andra dagen. Flytten prövas sedan av kontrollen som vanligt.
 */
export function stegMal(f: Pick<SchemaForslag, 'days' | 'startGridMin'>, l: Pick<SchemaForslagLesson, 'day' | 'startMin' | 'durationMin' | 'marginMin'>, pil: SchemaPil): { day: number; startMin: number } | null {
  if (l.day === null || l.startMin === null) return null;
  const length = l.durationMin + l.marginMin, cur = l.startMin;
  if (pil === 'upp' || pil === 'ner') {
    const starts = starttider(f, l.day, length), next = pil === 'ner' ? starts.find(m => m > cur) : starts.filter(m => m < cur).at(-1);
    return next === undefined ? null : { day: l.day, startMin: next };
  }
  const day = l.day + (pil === 'hoger' ? 1 : -1);
  return day >= 0 && day < f.days.length && starttider(f, day, length).includes(cur) ? { day, startMin: cur } : null;
}

/** Det ett eget villkor kan gälla, med appens referens (som i villkorsformuläret) och namnet som visas. */
export type SchemaSparrResurs = { slag: SchemaRegelSlag; ref: string; namn: string };
type Underlag = Pick<SchemaForslag, 'classes' | 'teachers' | 'rooms' | 'resurser'>;
/**
 * Appens referens för förslagets klasser och lärare. Förslaget numrerar dem i underlagets ordning (`grupp-n` är `resurser.klass[n-1]`,
 * `larare-n` är `resurser.larare[n-1]`) och namnet måste stämma; en grupp som visas som klass känns igen på namnet. Samma koppling som lagren.
 */
export function resursRefs(f: Underlag): Map<string, SchemaSparrResurs> {
  const out = new Map<string, SchemaSparrResurs>(), at = (id: string) => Number(/-(\d+)$/u.exec(id)?.[1] ?? 0) - 1;
  for (const c of f.classes) {
    const klass = f.resurser.klass[at(c.id)], grupper = f.resurser.grupp.filter(g => g.name === c.name);
    if (klass?.name === c.name) out.set(c.id, { slag: 'klass', ref: klass.ref, namn: c.name });
    else if (grupper.length === 1) out.set(c.id, { slag: 'grupp', ref: grupper[0].ref, namn: c.name });
  }
  for (const t of f.teachers) { const larare = f.resurser.larare[at(t.id)]; if (larare?.name === t.name) out.set(t.id, { slag: 'larare', ref: larare.ref, namn: t.name }); }
  return out;
}

type Lagt = Pick<SchemaForslagLesson, 'id' | 'title' | 'day' | 'startMin' | 'durationMin' | 'classIds' | 'teacherIds' | 'roomId'>;
const overlap = (l: Lagt, m: SchemaMarkering) => l.day === m.day && l.startMin !== null && l.startMin < m.endMin && m.startMin < l.startMin + l.durationMin;

/**
 * Det en spärr på den markerade tiden kan gälla: den som visas (klass, grupp eller lärare), och för passen som ligger där lärarna,
 * salen, ämnet och övriga klasser och grupper. Bara det som har en referens i underlaget tas med.
 */
export function sparrResurser(f: Underlag, visad: string, lessons: Lagt[], m: SchemaMarkering): SchemaSparrResurs[] {
  const refs = resursRefs(f), out: SchemaSparrResurs[] = [], seen = new Set<string>();
  const add = (r: SchemaSparrResurs | undefined) => { if (r && !seen.has(`${r.slag}|${r.ref}`)) { seen.add(`${r.slag}|${r.ref}`); out.push(r); } };
  add(refs.get(visad));
  const dar = lessons.filter(l => overlap(l, m));
  for (const l of dar) for (const id of l.teacherIds) { const r = refs.get(id); if (r) add({ ...r, namn: `${r.namn} (${l.title})` }); }
  for (const l of dar) { const room = f.rooms.find(x => x.id === l.roomId)?.name; if (room) add({ slag: 'sal', ref: room, namn: room }); }
  for (const l of dar) add({ slag: 'amne', ref: l.title, namn: `Ämnet ${l.title}` });
  for (const l of dar) for (const id of l.classIds) add(refs.get(id));
  return out;
}

/** Ett eget villkor för den markerade tiden: spärrad tid eller tillåten tid för resursen, den dagen. */
export const sparrRegel = (typ: 'sparrad' | 'tillaten', r: Pick<SchemaSparrResurs, 'slag' | 'ref'>, m: SchemaMarkering): SchemaRegel =>
  ({ slag: r.slag, ref: r.ref, typ, days: [m.day], startMin: m.startMin, endMin: m.endMin });

/** Lägg aldrig här: spärrad tid för passets undervisning (ämnet, med undervisningens namn) på passets dag och tid. */
export function laggAldrigHar(l: Pick<SchemaForslagLesson, 'title' | 'day' | 'startMin' | 'durationMin'>): SchemaRegel | null {
  return l.day === null || l.startMin === null ? null : { slag: 'amne', ref: l.title, typ: 'sparrad', days: [l.day], startMin: l.startMin, endMin: l.startMin + l.durationMin };
}

type Tid = Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>;
const tid = (r: SchemaRegel): r is Tid => r.typ === 'sparrad' || r.typ === 'tillaten';
/** Om ett eget villkor gäller passet: klassens, gruppens eller lärarens pass, ämnets pass eller passen i salen. */
function galler(f: Underlag, refs: Map<string, SchemaSparrResurs>, r: SchemaRegel, l: Lagt): boolean {
  if (r.slag === 'amne') return l.title === r.ref;
  if (r.slag === 'sal') return f.rooms.find(x => x.id === l.roomId)?.name === r.ref;
  return (r.slag === 'larare' ? l.teacherIds : l.classIds).some(id => { const x = refs.get(id); return x?.slag === r.slag && x.ref === r.ref; });
}

/**
 * Passen som ligger på ett eget villkor för tid: på spärrad tid, eller utanför tillåten tid. Tillåtna tider för samma klass, grupp,
 * ämne, lärare eller sal läggs ihop, och en dag utan någon av dem är helt utanför (som i underlaget).
 */
export function passPaVillkor<T extends Lagt>(f: Underlag, egna: SchemaRegel[], index: number, lessons: T[]): T[] {
  const r = egna[index];
  if (!r || !tid(r)) return [];
  const refs = resursRefs(f), placed = lessons.filter(l => l.day !== null && l.startMin !== null && galler(f, refs, r, l));
  if (r.typ === 'sparrad') return placed.filter(l => r.days.includes(l.day!) && overlap(l, { day: l.day!, startMin: r.startMin, endMin: r.endMin }));
  const same = egna.filter((x): x is Tid => tid(x) && x.typ === 'tillaten' && x.slag === r.slag && x.ref === r.ref);
  return placed.filter(l => !same.some(x => x.days.includes(l.day!) && l.startMin! >= x.startMin && l.startMin! + l.durationMin <= x.endMin));
}

/**
 * Varför ett pass avviker, i passrutan (05.2-SM-VILLKOR-DIREKT). Vilka pass som avviker avgörs bara av kontrollens svar (`koder`: kontrollens koder för
 * passet); villkoren används för att säga om ett pass utanför sina tillåtna fönster ligger på spärrad tid eller utanför tillåten tid.
 * Null: ingen rad för koden (avvikelsen står i listan Regelavvikelser).
 */
export function avvikelseRad<T extends Lagt>(f: Underlag, egna: SchemaRegel[], koder: string[], l: T): string | null {
  if (koder.includes('outside_allowed')) {
    const typer = egna.flatMap((r, i) => tid(r) && r.slag !== 'sal' && passPaVillkor(f, egna, i, [l]).length ? [r.typ] : []);
    return typer.includes('sparrad') ? 'Ligger på spärrad tid' : 'Utanför tillåten tid';
  }
  if (koder.includes('room_unavailable')) return 'Salen är spärrad då';
  if (koder.includes('room_unfit')) return 'Salen följer inte salvillkoret';
  if (koder.includes('outside_day')) return 'Utanför skoldagen';
  return null;
}
