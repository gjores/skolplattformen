// Kanoniskt innehåll och kontrollsumma (LASAR-05). Gränssnitt; genomförandet kommer i nästa steg.
import type { Exception, GroupException, ISODate, ShortWeek, Term } from './lasar-model.ts';
import type { TjanstCanonicalValue } from './tjanst-contract.ts';

export const LASAR_CONTENT_PREFIX = 'lasar_content_v1' as const;
export type LasarContent = {
  terms: { ht: Term; vt: Term };
  exceptions: Record<ISODate, Exception>;
  groupDays: Record<string, Record<ISODate, GroupException>>;
  shortWeeks: Record<string, ShortWeek>;
  frameVersionId: string | null;
  version: number;
};
export function lasarContentCanonical(_content: LasarContent): TjanstCanonicalValue[] { return [LASAR_CONTENT_PREFIX]; }
export async function lasarContentHash(_content: LasarContent): Promise<string> { return `sha256:${'0'.repeat(64)}`; }
