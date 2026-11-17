/**
 * Pass utan sal i utkast med salregister (05.2-SM-UXF-43). Kontrollen fyller aldrig i en sal där; bara människan eller Tilldela salar väljer.
 * Ett lagt pass utan sal upptar ingen sal. Motorn får därför inte passets salkrav, så det blir varken `room_count` eller ett regelbrott som stoppar
 * placeringsförslagen. Utan register fyller kontrollen alltid i en sal, och då påverkas inget här.
 * SS 12000: internt planeringsbegrepp; salregistrets `sal-N` är interna ID:n.
 */
import type { SchemaPlacement, SchemaProblem, SchemaVillkor } from './schema-contract.ts';

/** Fyller kontrollen i en sal som saknas? Bara för utkast utan salregister (äldre beteende R6). */
export const salIfyllning = (villkor: Pick<SchemaVillkor, 'salregister'>): boolean => !villkor.salregister;

/**
 * Problemet som motorn får: lagda pass med salkrav men utan sal, och passen i `ocksa`, skickas utan salkrav. Övriga pass och problemet självt
 * ändras inte. `ocksa` används för passet vars lägen prövas med register: tiden prövas utan sal, och den egna salen prövas för sig (`salLedig`).
 */
export function motorProblem(problem: SchemaProblem, placements: SchemaPlacement[], ocksa: string[] = []): SchemaProblem {
  const utan = new Set([...placements.filter(p => p.room === null).map(p => p.lesson), ...ocksa]);
  if (!problem.lessons.some(l => l.rooms && utan.has(l.id))) return problem;
  return { ...problem, lessons: problem.lessons.map(l => {
    if (!l.rooms || !utan.has(l.id)) return l;
    const { rooms: _rooms, ...rest } = l;
    return { ...rest, ...(l.locked ? { locked: { day: l.locked.day, start_min: l.locked.start_min } } : {}) };
  }) };
}

const salSpann = (l: SchemaProblem['lessons'][number], start: number): [number, number] => {
  const m = l.rooms ? l.margin?.rooms : undefined;
  return [Math.max(0, start - (m?.before_min ?? 0)), start + l.duration_min + (m?.after_min ?? 0)];
};
const sammaPeriod = (a: SchemaProblem['lessons'][number], b: SchemaProblem['lessons'][number]) =>
  !a.periods?.length || !b.periods?.length || a.periods.some(p => b.periods!.includes(p));

/**
 * Är salen ledig för passet vid starten? Samma regel som motorns val av sal: salens marginal ryms i skoldagen, salen är inte spärrad under passet
 * med marginal, och inget annat pass i salen under samma period ligger i vägen (undervisning mot undervisning eller marginal mot undervisning).
 * `problem` är underlaget med salkraven, `placements` övriga pass som de ligger.
 */
export function salLedig(problem: SchemaProblem, placements: SchemaPlacement[], lesson: string, room: string, day: number, start: number): boolean {
  const lessons = new Map(problem.lessons.map(l => [l.id, l])), l = lessons.get(lesson), frame = problem.time.days[day];
  const sal = problem.rooms?.find(r => r.id === room);
  if (!l?.rooms || !frame || !sal) return false;
  const m = l.margin?.rooms, end = start + l.duration_min, [fran, till] = salSpann(l, start);
  if (start - (m?.before_min ?? 0) < frame.start_min || end + (m?.after_min ?? 0) > frame.end_min) return false;
  if ((sal.unavailable ?? []).some(iv => iv.day === day && iv.start_min < till && fran < iv.end_min)) return false;
  return !placements.some(p => {
    if (p.lesson === lesson || p.room !== room || p.day !== day) return false;
    const o = lessons.get(p.lesson);
    if (!o || !sammaPeriod(o, l)) return false;
    const oEnd = p.startMin + o.duration_min, [ofran, otill] = salSpann(o, p.startMin);
    return start < oEnd && p.startMin < end || fran < oEnd && p.startMin < till || start < otill && ofran < end;
  });
}

/**
 * Salen efter en flytt med salregister: passet behåller sin egen sal bara där lägena säger att den är ledig (`position.room`), annars blir det utan sal.
 * Ett uttryckligt annat salval behålls. Finns inget läge för tiden (lägena är inte lästa) behålls salen, och kontrollen redovisar en eventuell krock.
 * `undefined`: reducern behåller passets sal.
 */
export function flyttSal(egen: string | null, valt: string | null | undefined, position: { room: string | null } | undefined): string | null | undefined {
  if (valt !== undefined && valt !== egen) return valt;
  if (egen === null || !position) return valt;
  return position.room === egen ? egen : null;
}
