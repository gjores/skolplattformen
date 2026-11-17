/**
 * Sammanhängande lägesfält (05.2-SM-UXF-42). Motorn prövar varje möjlig starttid för sig. I veckan slås starttider i följd med samma läge
 * ihop till ett fält, så att fältet får plats för sin text och tidsaxeln förblir rättvis. Fältet påstår bara läget; orsaker och lediga salar
 * kan skilja sig inom fältet och läses för den exakta starten i panelen för valt pass.
 */
export type Lagesposition<S extends string> = { day: number; startMin: number; state: S };
export type Lagesfalt<S extends string> = { day: number; startMin: number; endMin: number; state: S; starter: number };

/** `step`: startrutnätet i minuter. Ett fält täcker från första starttiden till sista starttiden plus ett steg. */
export function lagesfalt<S extends string>(positions: Lagesposition<S>[], step: number): Lagesfalt<S>[] {
  const sorted = [...positions].sort((a, b) => a.day - b.day || a.startMin - b.startMin), result: Lagesfalt<S>[] = [];
  for (const p of sorted) {
    const last = result.at(-1);
    if (last && last.day === p.day && last.state === p.state && last.endMin === p.startMin) { last.endMin = p.startMin + step; last.starter++; continue; }
    result.push({ day: p.day, startMin: p.startMin, endMin: p.startMin + step, state: p.state, starter: 1 });
  }
  return result;
}
/** Närmaste möjliga starttid före eller efter `fran` samma dag, för stegning med knapparna − och +. `null` när ingen finns åt det hållet. */
export function stegaStart(starter: number[], fran: number, riktning: -1 | 1): number | null {
  const kandidater = riktning === 1 ? starter.filter(m => m > fran) : starter.filter(m => m < fran);
  return kandidater.length ? (riktning === 1 ? Math.min(...kandidater) : Math.max(...kandidater)) : null;
}
