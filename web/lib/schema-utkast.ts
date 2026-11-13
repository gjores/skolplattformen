// Utkastet för arbetsytan i Schema (05.2-SM-YTA): var passen ligger just nu, markerat pass, verktyg, synliga lager och ångra/gör om.
// Ren reducer utan React och utan sidoeffekter. Tillståndet är vanlig JSON (krävs för att flera fönster ska kunna dela utkastet, SM-FONSTER).
// Inget sparas: utkastet lever i webbläsaren tills sidan lämnas eller ett nytt förslag tas fram.
import type { SchemaForslagLesson, SchemaPlacement } from './schema-contract.ts';

/** Var ett pass ligger. `day` och `startMin` är null när passet ligger på viloytan. */
export type SchemaUtkastPlats = { day: number | null; startMin: number | null; room: string | null };
export type SchemaUtkastPlatser = Record<string, SchemaUtkastPlats>;
/** Verktygen i veckan (Main). Bara Markera används än; de övriga kopplas in av SM-MENY och SM-BYT. */
export type SchemaVerktyg = 'markera' | 'sparra' | 'tillat' | 'las' | 'viloyta' | 'byt';
/** En post i ångra eller gör om: placeringarna före ändringen och vilket pass ändringen gällde. */
export type SchemaUtkastSteg = { lesson: string; placements: SchemaUtkastPlatser };
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

/** Placeringarna som en flytt, parkering, ångra eller gör om skulle ge, utan att ändra utkastet. Används för att låta kontrollen pröva ändringen först. */
export function utkastEfter(state: SchemaUtkast, action: SchemaUtkastAtgard): SchemaUtkastPlatser | null {
  if (action.type === 'undo') return state.undo.at(-1)?.placements ?? null;
  if (action.type === 'redo') return state.redo.at(-1)?.placements ?? null;
  if (action.type !== 'move' && action.type !== 'park') return null;
  const before = state.placements[action.lesson];
  if (!before) return null;
  const next: SchemaUtkastPlats = action.type === 'park' ? { day: null, startMin: null, room: null }
    : { day: action.day, startMin: action.startMin, room: action.room === undefined ? before.room : action.room };
  return { ...state.placements, [action.lesson]: next };
}

/** Vilket pass nästa ångra eller gör om gäller. */
export const utkastSteg = (state: SchemaUtkast, which: 'undo' | 'redo') => state[which].at(-1)?.lesson ?? null;

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
      const moved = { lesson: step.lesson, placements: state.placements };
      return { ...state, placements: withRooms(step.placements, action.rooms), picked: null,
        undo: action.type === 'undo' ? from.slice(0, -1) : push(to, moved), redo: action.type === 'undo' ? push(to, moved) : from.slice(0, -1) };
    }
    case 'pick':
      return action.lesson === null || action.lesson in state.placements ? { ...state, picked: action.lesson } : state;
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
