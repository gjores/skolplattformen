import type { LasarSummaryReply, LasarSummaryStat } from './lasar-contract.ts';
import { formatDate, type ISODate } from './lasar-model.ts';

/**
 * Texter och skillnad ur kalenderns sammanfattning (05.1.1-13, D-11, LASAR-05). Rena funktioner utan sidoeffekter, så att Timplaner
 * och Tjänstefördelning visar samma texter ur samma sammanfattning (POST /api/lasar/sammanfattning). Skoldagarna kommer från servern,
 * som räknar dem med samma funktion som tjänstefördelningens IM-behov; här räknas inga skoldagar själva. Texterna är ordagrant
 * UI-SPEC avsnitt 15. SS 12000: kalenderns versioner saknar objekt i standarden; texterna nämner inga ID:n.
 */

/** Läsåret som ”2027/28”. */
export const lasarYearLabel = (startYear: number): string => `${startYear}/${String(startYear + 1).slice(2)}`;
const total = (s: LasarSummaryStat) => s.htSchoolDays + s.vtSchoolDays;

/** IM-texten i Timplaner. En sammanfattning för ett annat läsår räknas som att kalendern inte är fastställd. */
export function lasarImWeeklyText(summary: LasarSummaryReply | null, schoolYear: number): string {
  const label = lasarYearLabel(schoolYear);
  const current = summary && summary.schoolYear === schoolYear ? summary.current : null;
  return current
    ? `Veckoram. Läsårskalendern ${label} är fastställd (version ${current.version}, ${total(current)} skoldagar). Individuell fördelning visas inte här.`
    : `Veckoram. Läsårskalendern för ${label} är inte fastställd. Inga årstimmar beräknas.`;
}

/** Den del av en underlagsrad som skillnaden behöver: tjänstefördelningens needBasis och stale. Övriga fält följer med oförändrade. */
export type LasarBasisRow = { needBasis: string; stale: boolean };
export type LasarBasisSide = { version: number; decidedOn: ISODate; htSchoolDays: number; vtSchoolDays: number; schoolDays: number };
export type LasarBasisChange<R extends LasarBasisRow> = { before: LasarBasisSide; after: LasarBasisSide; rows: R[] };

const side = (s: LasarSummaryStat): LasarBasisSide =>
  ({ version: s.version, decidedOn: s.decidedOn, htSchoolDays: s.htSchoolDays, vtSchoolDays: s.vtSchoolDays, schoolDays: total(s) });

/**
 * Skillnaden för markeringen (D-11): version före och efter och skoldagar per termin, för de rader som räknar med en äldre version.
 * En sådan rad räknar sitt behov ur veckoramen och kalendern (needBasis weekly_calendar) och är markerad stale, det vill säga dess
 * sparade ögonblicksbild skiljer sig från det levande behovet. Null utan föregående eller gällande version och utan berörda rader.
 * Ingen omräkning sker här; den ansvarige tar in den nya versionen uttryckligen.
 */
export function lasarBasisChange<R extends LasarBasisRow>(summary: LasarSummaryReply | null, rows: readonly R[]): LasarBasisChange<R> | null {
  if (!summary?.current || !summary.previous) return null;
  const affected = rows.filter((r) => r.stale && r.needBasis === 'weekly_calendar');
  if (!affected.length) return null;
  return { before: side(summary.previous), after: side(summary.current), rows: affected };
}

/** Markeringens rad, ordagrant UI-SPEC avsnitt 15. */
export function lasarBasisText(change: LasarBasisChange<LasarBasisRow>): string {
  const { before, after } = change;
  return `Läsårskalendern har en ny fastställd version (${after.version}, ${formatDate(after.decidedOn, true)}). `
    + `Underlaget räknar med version ${before.version}: ${before.schoolDays} → ${after.schoolDays} skoldagar.`;
}
