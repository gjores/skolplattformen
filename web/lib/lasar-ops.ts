// Skillnaden mellan två lägen av samma kalenderversion som kommandon till
// /api/lasar/kommando (planerna 05.1.1-03 och 04). Den skyddade vyn kör
// modellens funktion lokalt och skickar bara skillnaden; servern prövar
// varje kommando. Med `editableFrom` (D-12) hoppas passerade dagar och
// passerade terminskanter över; vyn jämför med den ofiltrerade listan och
// nekar ändringen lokalt om något föll bort.
//
// Ordning: dagar, anteckningar, gruppdagar och korta veckor före
// terminerna, så att en dag som faller utanför en kortare termin tas bort
// uttryckligen innan terminen ändras.
//
// SS 12000: grupp-ID är lasar-groups.ts stabila ID:n (klass ↔ Group med
// groupType=Klass). Kalenderinnehållet har inget objekt i standarden.
import type { Cause, GroupException, ISODate, Planned, SchoolYear, ShortWeek } from './lasar-model.ts';

/** Dagar som får samma slag och anteckning. `skoldag` tar bort undantaget. */
export type LasarSetDaysOp = { op: 'set_days'; dates: ISODate[]; kind: Planned; note?: string };
/** Ny anteckning på lov- eller studiedagar med oförändrat slag. Utan `note` tas anteckningen bort. */
export type LasarSetNotesOp = { op: 'set_notes'; dates: ISODate[]; note?: string };
export type LasarSetTermOp = { op: 'set_term'; term: 'ht' | 'vt'; edge: 'start' | 'end'; date: ISODate };
export type LasarSetGroupDaysOp = { op: 'set_group_days'; groupId: string; dates: ISODate[]; cause: Cause; note?: string };
export type LasarClearGroupDaysOp = { op: 'clear_group_days'; groupId: string; dates: ISODate[] };
export type LasarSetShortWeekOp = { op: 'set_short_week'; groupId: string; columnId: string; weekday: number; reason: string };
export type LasarClearShortWeekOp = { op: 'clear_short_week'; groupId: string };
export type LasarOp = LasarSetDaysOp | LasarSetNotesOp | LasarSetTermOp | LasarSetGroupDaysOp | LasarClearGroupDaysOp | LasarSetShortWeekOp | LasarClearShortWeekOp;
export type LasarOpsOptions = { editableFrom?: ISODate | null };

const kindOrder: Planned[] = ['skoldag', 'lovdag', 'studiedag'];
const encoder = new TextEncoder();
/** Byteordning, som collate "C" i SQL. */
function ordinal(a: string, b: string): number {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
const noteOrder = (a?: string, b?: string) => Number(a !== undefined) - Number(b !== undefined) || ordinal(a ?? '', b ?? '');
const cleanNote = (note?: string) => (note?.trim() ? note : undefined);
const keys = (...records: Record<string, unknown>[]) => [...new Set(records.flatMap((r) => Object.keys(r)))].sort(ordinal);
function grouped<T extends { dates: ISODate[] }>(map: Map<string, T>, key: unknown[], date: ISODate, make: () => T) {
  const k = JSON.stringify(key);
  const op = map.get(k);
  if (op) op.dates.push(date);
  else map.set(k, { ...make(), dates: [date] });
}
const withNote = <T extends object>(op: T, note?: string): T & { note?: string } => (note === undefined ? op : { ...op, note });

/** Kommandon som gör `before` till `after`, i serverns ordning. */
export function lasarOps(before: SchoolYear, after: SchoolYear, options: LasarOpsOptions = {}): LasarOp[] {
  if (before.id !== after.id) throw new Error('Skillnaden kan bara räknas inom samma kalenderversion.');
  const from = options.editableFrom ?? null;
  const open = (date: ISODate) => from === null || date >= from;

  const days = new Map<string, LasarSetDaysOp>();
  const notes = new Map<string, LasarSetNotesOp>();
  for (const date of keys(before.exceptions, after.exceptions)) {
    if (!open(date)) continue;
    const was = before.exceptions[date], now = after.exceptions[date];
    const wasNote = cleanNote(was?.note), nowNote = cleanNote(now?.note);
    if (was?.kind === now?.kind && wasNote === nowNote) continue;
    if (was && now && was.kind === now.kind) {
      grouped(notes, [nowNote ?? null], date, () => withNote({ op: 'set_notes' as const, dates: [] }, nowNote));
      continue;
    }
    const kind: Planned = now?.kind ?? 'skoldag';
    grouped(days, [kind, nowNote ?? null], date, () => withNote({ op: 'set_days' as const, dates: [], kind }, nowNote));
  }

  const clears: LasarClearGroupDaysOp[] = [];
  const sets = new Map<string, LasarSetGroupDaysOp>();
  for (const groupId of keys(before.groupExceptions, after.groupExceptions)) {
    const was: Record<ISODate, GroupException> = before.groupExceptions[groupId] ?? {};
    const now: Record<ISODate, GroupException> = after.groupExceptions[groupId] ?? {};
    const cleared: ISODate[] = [];
    for (const date of keys(was, now)) {
      if (!open(date)) continue;
      const a = was[date], b = now[date];
      if (a?.cause === b?.cause && cleanNote(a?.note) === cleanNote(b?.note)) continue;
      if (!b) { cleared.push(date); continue; }
      const note = cleanNote(b.note);
      grouped(sets, [groupId, b.cause, note ?? null], date, () => withNote({ op: 'set_group_days' as const, groupId, dates: [], cause: b.cause }, note));
    }
    if (cleared.length) clears.push({ op: 'clear_group_days', groupId, dates: cleared });
  }

  const weeks: LasarOp[] = [];
  const sameWeek = (a?: ShortWeek, b?: ShortWeek) => a?.weekday === b?.weekday && a?.reason === b?.reason && a?.columnId === b?.columnId;
  for (const groupId of keys(before.shortWeeks, after.shortWeeks)) {
    const a = before.shortWeeks[groupId], b = after.shortWeeks[groupId];
    if (!a && !b || sameWeek(a, b)) continue;
    if (!b) weeks.push({ op: 'clear_short_week', groupId });
  }
  for (const groupId of keys(before.shortWeeks, after.shortWeeks)) {
    const a = before.shortWeeks[groupId], b = after.shortWeeks[groupId];
    if (b && !sameWeek(a, b)) weeks.push({ op: 'set_short_week', groupId, columnId: b.columnId, weekday: b.weekday, reason: b.reason });
  }

  const terms: LasarSetTermOp[] = [];
  for (const term of ['ht', 'vt'] as const)
    for (const edge of ['start', 'end'] as const) {
      const was = before[term][edge], now = after[term][edge];
      if (was !== now && open(was) && open(now)) terms.push({ op: 'set_term', term, edge, date: now });
    }

  const dayOps = [...days.values()].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || noteOrder(a.note, b.note));
  const noteOps = [...notes.values()].sort((a, b) => noteOrder(a.note, b.note));
  const setOps = [...sets.values()].sort((a, b) => ordinal(a.groupId, b.groupId) || ordinal(a.cause, b.cause) || noteOrder(a.note, b.note));
  return [...dayOps, ...noteOps, ...clears, ...setOps, ...weeks, ...terms];
}
