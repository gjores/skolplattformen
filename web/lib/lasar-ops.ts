// Skillnaden mellan två lägen av samma kalenderversion som kommandon till
// /api/lasar/kommando (plan 05.1.1-03). Den skyddade vyn kör modellens
// funktion lokalt och skickar bara skillnaden; servern prövar varje kommando.
// Planen 05.1.1-04 lägger till terminer, anteckningar, gruppdagar, korta
// veckor och filtret för passerade dagar (editableFrom).
// Kalenderinnehållet har inget objekt i SS 12000 och ligger utanför standarden.
import type { ISODate, Planned, SchoolYear } from './lasar-model.ts';

/** Dagar som får samma slag och anteckning. `skoldag` tar bort undantaget. */
export type LasarSetDaysOp = { op: 'set_days'; dates: ISODate[]; kind: Planned; note?: string };
export type LasarOp = LasarSetDaysOp;

const kindOrder: Planned[] = ['skoldag', 'lovdag', 'studiedag'];

/** Ändrade undantag blir set_days grupperade per slag och anteckning, i datumordning. */
export function lasarOps(before: SchoolYear, after: SchoolYear): LasarOp[] {
  if (before.id !== after.id) throw new Error('Skillnaden kan bara räknas inom samma kalenderversion.');
  const dates = [...new Set([...Object.keys(before.exceptions), ...Object.keys(after.exceptions)])].sort();
  const groups = new Map<string, LasarSetDaysOp>();
  for (const date of dates) {
    const was = before.exceptions[date], now = after.exceptions[date];
    if (was?.kind === now?.kind && (was?.note || undefined) === (now?.note || undefined)) continue;
    const kind: Planned = now?.kind ?? 'skoldag';
    const note = now?.note?.trim() ? now.note : undefined;
    const key = JSON.stringify([kind, note ?? null]);
    const op = groups.get(key);
    if (op) op.dates.push(date);
    else groups.set(key, note === undefined ? { op: 'set_days', dates: [date], kind } : { op: 'set_days', dates: [date], kind, note });
  }
  return [...groups.values()].sort((a, b) =>
    kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
    || Number(a.note !== undefined) - Number(b.note !== undefined)
    || ((a.note ?? '') < (b.note ?? '') ? -1 : (a.note ?? '') > (b.note ?? '') ? 1 : 0));
}
