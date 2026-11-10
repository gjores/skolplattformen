// Kopiera förra läsåret (D-04). Ren funktion som används av både klient och
// server. Varje dag flyttas till samma ISO-vecka och veckodag i målåret. En dag
// som inte kan flyttas entydigt läggs aldrig in; den står i granskningslistan
// med skäl, och servern sparar listan och kräver att varje post är löst.
import { addDays, daysBetween, dayInfo, easterSunday, holidayName, isWeekend, isoWeek, mondayOfWeek, weekday } from './lasar-model.ts';
import type { Exception, GroupException, ISODate, SchoolYear, ShortWeek, StudentGroup, Term } from './lasar-model.ts';

export const COPY_REVIEW_REASONS = ['missing_week', 'easter', 'holiday', 'weekend', 'outside_terms', 'jullov', 'term_edge', 'group_offering_missing', 'group_class', 'short_week'] as const;
export type CopyReviewReason = typeof COPY_REVIEW_REASONS[number];
export type CopyReviewKind = 'lovdag' | 'studiedag' | 'termin' | 'gruppdag' | 'kort vecka';
export type TermEdgeKey = 'ht:start' | 'ht:end' | 'vt:start' | 'vt:end';
export type CopyReviewItem = {
  /** Deterministiskt: skäl, källdatum och grupp eller terminskant. */
  id: string;
  /** Källans datum; saknas för korta veckor, som gäller hela läsåret. */
  sourceDate: ISODate | null;
  kind: CopyReviewKind;
  note?: string;
  reason: CopyReviewReason;
  /** Förslag att pröva: påskens avstånd eller den flyttade terminskanten. */
  suggestedDate?: ISODate;
  /** Den dag ISO-veckan och veckodagen ger i målåret, när den finns. */
  targetDate?: ISODate;
  groupId?: string;
  edge?: TermEdgeKey;
  /** Källans korta vecka, så att den kan prövas och läggas in igen. */
  shortWeek?: ShortWeek;
};

const EDGES: { key: TermEdgeKey; term: 'ht' | 'vt'; edge: 'start' | 'end' }[] = [
  { key: 'ht:start', term: 'ht', edge: 'start' },
  { key: 'ht:end', term: 'ht', edge: 'end' },
  { key: 'vt:start', term: 'vt', edge: 'start' },
  { key: 'vt:end', term: 'vt', edge: 'end' },
];

/** Samma ISO-vecka och veckodag, med ISO-året räknat relativt läsårets startår. Null när veckan saknas i målåret. */
function shift(date: ISODate, sourceStart: number, targetStart: number): ISODate | null {
  const { year, week } = isoWeek(date);
  const targetYear = targetStart + (year - sourceStart);
  const target = addDays(mondayOfWeek(targetYear, week), weekday(date));
  const check = isoWeek(target);
  return check.year === targetYear && check.week === week ? target : null;
}

/**
 * Påsken flyttar upp till fyra veckor mellan år, så dagar kring påsk kan inte
 * flyttas med ISO-veckan. Planerarens val (RESEARCH A6): påskdagen −8…+8 dagar
 * och klämdagen efter Kristi himmelsfärdsdag (påskdagen +40). Förslaget är
 * samma avstånd från målårets påskdag.
 */
function easterSuggestion(date: ISODate, yearOffset: number): ISODate | undefined {
  const year = Number(date.slice(0, 4));
  const distance = daysBetween(easterSunday(year), date);
  if (Math.abs(distance) > 8 && distance !== 40) return undefined;
  return addDays(easterSunday(year + yearOffset), distance);
}

const reviewId = (reason: CopyReviewReason, sourceDate: ISODate | null, ref?: string) => `copy|${reason}|${sourceDate ?? '-'}|${ref ?? '-'}`;

export function copySchoolYear(source: SchoolYear, targetStartYear: number, targetGroups: StudentGroup[]): { draft: SchoolYear; review: CopyReviewItem[] } {
  const offset = targetStartYear - source.startYear;
  const review: CopyReviewItem[] = [];
  const add = (item: Omit<CopyReviewItem, 'id'>) => {
    const defined = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as Omit<CopyReviewItem, 'id'>;
    review.push({ id: reviewId(item.reason, item.sourceDate, item.groupId ?? item.edge), ...defined });
  };

  // Terminskanter flyttas alltid; en kant på helg eller helgdag granskas, och
  // modellens varning i summarize visar den.
  const terms: { ht: Term; vt: Term } = { ht: { ...source.ht }, vt: { ...source.vt } };
  for (const e of EDGES) {
    const from = source[e.term][e.edge];
    const target = shift(from, source.startYear, targetStartYear);
    if (!target) {
      // Vecka 53 utan motsvarighet: kanten läggs på samma veckodag i veckan före.
      const fallback = addDays(mondayOfWeek(targetStartYear + isoWeek(from).year - source.startYear, isoWeek(from).week - 1), weekday(from));
      terms[e.term][e.edge] = fallback;
      add({ sourceDate: from, kind: 'termin', reason: 'missing_week', suggestedDate: fallback, edge: e.key });
      continue;
    }
    terms[e.term][e.edge] = target;
    if (isWeekend(target) || holidayName(target)) add({ sourceDate: from, kind: 'termin', reason: 'term_edge', suggestedDate: target, targetDate: target, edge: e.key });
  }

  const next = targetStartYear + 1;
  const name = `${targetStartYear}/${String(next).slice(2)}`;
  const draft: SchoolYear = { id: name, unitId: source.unitId, startYear: targetStartYear, label: `Läsåret ${name}`, ht: terms.ht, vt: terms.vt, exceptions: {}, groupExceptions: {}, shortWeeks: {}, status: 'utkast', history: [] };

  /** Måldagen, eller skälet till att dagen inte kan flyttas entydigt. */
  const place = (date: ISODate): { target?: ISODate; reason?: CopyReviewReason; suggestedDate?: ISODate } => {
    const target = shift(date, source.startYear, targetStartYear) ?? undefined;
    if (!target) return { reason: 'missing_week' };
    const suggestedDate = easterSuggestion(date, offset);
    if (suggestedDate) return { target, reason: 'easter', suggestedDate };
    if (isWeekend(target)) return { target, reason: 'weekend' };
    if (holidayName(target)) return { target, reason: 'holiday' };
    const part = dayInfo(draft, target).part;
    if (!part) return { target, reason: 'outside_terms' };
    if (part === 'jullov') return { target, reason: 'jullov' };
    return { target };
  };

  for (const [date, e] of Object.entries(source.exceptions).sort(([a], [b]) => a.localeCompare(b)) as [ISODate, Exception][]) {
    const p = place(date);
    if (p.reason) add({ sourceDate: date, kind: e.kind, note: e.note, reason: p.reason, suggestedDate: p.suggestedDate, targetDate: p.target });
    else draft.exceptions[p.target!] = { ...e };
  }

  for (const [groupId, days] of Object.entries(source.groupExceptions).sort(([a], [b]) => a.localeCompare(b))) {
    const isClass = groupId.startsWith('klass:');
    const continued = !isClass && targetGroups.some((g) => g.id === groupId && g.scope === 'årskurs');
    for (const [date, e] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b)) as [ISODate, GroupException][]) {
      const p = place(date);
      // Klassen byter årskurs eller finns inte nästa år; årskursen kopieras
      // bara när samma utbildning och kolumn finns i målåret.
      const reason: CopyReviewReason | undefined = isClass ? 'group_class' : !continued ? 'group_offering_missing' : p.reason;
      if (reason) add({ sourceDate: date, kind: 'gruppdag', note: e.note, reason, suggestedDate: p.suggestedDate, targetDate: p.target, groupId });
      else (draft.groupExceptions[groupId] ??= {})[p.target!] = { ...e };
    }
  }

  // Korta veckor kräver särskilda skäl som prövas för det nya året.
  for (const [groupId, short] of Object.entries(source.shortWeeks).sort(([a], [b]) => a.localeCompare(b)))
    add({ sourceDate: null, kind: 'kort vecka', note: short.reason, reason: 'short_week', groupId, shortWeek: { ...short } });

  return { draft, review };
}
