// Kanoniskt innehåll och kontrollsumma för en kalenderversion (LASAR-05).
// Formen delas med SQL-funktionen lasar_content_hash (plan 06 och 08) och
// provas mot supabase/tests/lasar_content_hash_vectors.json:
//   [prefix, version, ramversion|null, [ht.start, ht.end, vt.start, vt.end],
//    [[datum, slag, anteckning|null]…],
//    [[grupp-id, datum, orsak, anteckning|null]…],
//    [[grupp-id, kolumn, veckodag, skäl]…]]
// Listorna sorteras på UTF-8-byte (som collate "C" i SQL), så nyckelordningen
// i indata saknar betydelse. Anteckning som saknas är null och skiljs från tom text.
// Kalenderinnehållet har inget objekt i SS 12000 och ligger utanför standarden.
import type { Exception, GroupException, ISODate, ShortWeek, Term } from './lasar-model.ts';
import { tjanstHashCanonical, type TjanstCanonicalValue } from './tjanst-contract.ts';

export const LASAR_CONTENT_PREFIX = 'lasar_content_v1' as const;
export type LasarContent = {
  terms: { ht: Term; vt: Term };
  exceptions: Record<ISODate, Exception>;
  /** Gruppdagar per grupp-ID ur lasar-groups.ts. */
  groupDays: Record<string, Record<ISODate, GroupException>>;
  shortWeeks: Record<string, ShortWeek>;
  frameVersionId: string | null;
  version: number;
};

const encoder = new TextEncoder();
function ordinal(a: string, b: string): number {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
const sortedEntries = <T>(record: Record<string, T>) => Object.entries(record).sort(([a], [b]) => ordinal(a, b));

export function lasarContentCanonical(content: LasarContent): TjanstCanonicalValue[] {
  if (!Number.isSafeInteger(content.version) || content.version < 1) throw new Error('Versionsnumret ska vara ett positivt heltal.');
  const { ht, vt } = content.terms;
  return [
    LASAR_CONTENT_PREFIX,
    content.version,
    content.frameVersionId ?? null,
    [ht.start, ht.end, vt.start, vt.end],
    sortedEntries(content.exceptions).map(([date, e]) => [date, e.kind, e.note ?? null]),
    sortedEntries(content.groupDays).flatMap(([groupId, days]) => sortedEntries(days).map(([date, e]) => [groupId, date, e.cause, e.note ?? null])),
    sortedEntries(content.shortWeeks).map(([groupId, s]) => [groupId, s.columnId, s.weekday, s.reason]),
  ];
}

export async function lasarContentHash(content: LasarContent): Promise<string> {
  return tjanstHashCanonical(lasarContentCanonical(content));
}
