// 05.1-30: fördelningsläge (behovsförst). Ren logik för kön med ofördelade behov och kandidaternas summor.
// Kön följer linsen (05.1-34): Ofördelat ger samma regel som matrisens lins; okänt behov ingår då inte. Summorna är fördelad tid,
// inte ledig kapacitet (D-10). Inget väljs automatiskt (D-25–D-27); ett namngivet val sparar direkt (D-29).
import type { TjanstJoint, TjanstRow, TjanstSpecial, TjanstTermMinutes } from './tjanst-contract.ts';
import { teacherSums } from './tjanst-model.ts';
import { surplusVacant, unallocated, type TjanstLensEntry, type TjanstLensId, type TjanstLensTerm } from './tjanst-lens.ts';

export type TjanstQueueGroupBy = 'klass' | 'amne';
export type TjanstQueueEntry = TjanstLensEntry & { need: TjanstLensEntry['need'] & { sourceKey: string; label: string } };
export type TjanstQueueGroupInput = { cls: { classId: string; name: string; link: unknown }; entries: TjanstQueueEntry[] };
/** open: ofördelat enligt linsregeln; allocated: täckt; unknown: behovet är okänt (bara under Alla behov och Samläsningar). */
export type TjanstQueueStatus = 'open' | 'allocated' | 'unknown';
export type TjanstQueueItem = { sourceKey: string; classId: string; className: string; label: string; subject: string; group: string; status: TjanstQueueStatus; surplusVacant: boolean };

/** Ämnet i en behovsrad, samma regel som matrisens ämnesfilter. */
export const queueSubject = (label: string) => label.includes(' – ') ? label.slice(0, label.indexOf(' – ')) : /^(.*?)(?:\s+\d.*)?$/u.exec(label)?.[1] || label;

/**
 * Behov i klassordning (eller ämnesordning), filtrerade på sökord i kurs, ämne eller klass. 05.1-34: kön följer linsen.
 * Ofördelat ger bara ofördelade behov; Alla behov och Samläsningar ger alla behov i grupperna, med status per behov.
 */
export function allocationQueue(groups: TjanstQueueGroupInput[], term: TjanstLensTerm, { groupBy = 'klass', search = '', lens = 'ofordelat' }: { groupBy?: TjanstQueueGroupBy; search?: string; lens?: TjanstLensId } = {}): TjanstQueueItem[] {
  const q = search.trim().toLocaleLowerCase('sv');
  const items: TjanstQueueItem[] = [];
  for (const g of groups) {
    if (!g.cls.link) continue;
    for (const e of g.entries) {
      const open = unallocated(e, term);
      if (lens === 'ofordelat' && !open) continue;
      const subject = queueSubject(e.need.label);
      if (q && ![e.need.label, subject, g.cls.name].some(v => v.toLocaleLowerCase('sv').includes(q))) continue;
      const known = e.need.needHt !== null || e.need.needVt !== null;
      items.push({ sourceKey: e.need.sourceKey, classId: g.cls.classId, className: g.cls.name, label: e.need.label, subject, group: groupBy === 'klass' ? g.cls.name : subject,
        status: open ? 'open' : known ? 'allocated' : 'unknown', surplusVacant: surplusVacant(e) });
    }
  }
  if (groupBy === 'amne') items.sort((a, b) => a.subject.localeCompare(b.subject, 'sv') || a.className.localeCompare(b.className, 'sv') || a.label.localeCompare(b.label, 'sv'));
  return items;
}
/**
 * Nästa behov efter ett val. previous är kön före valet, current kön efter omläsningen. Går framåt från det valda behovet
 * och tar första behov som fortfarande är ofördelat; börjar om från början vid slutet. null när kön är tom.
 */
export function nextAfter(previous: TjanstQueueItem[], current: TjanstQueueItem[], sourceKey: string): TjanstQueueItem | null {
  const open = new Map(current.map(i => [i.sourceKey, i]));
  const start = previous.findIndex(i => i.sourceKey === sourceKey);
  const order = start < 0 ? previous : [...previous.slice(start + 1), ...previous.slice(0, start)];
  // Under Alla behov ligger fördelade behov kvar i kön; nästa val är ändå första ofördelade behov, annars nästa behov.
  for (const wanted of [(i: TjanstQueueItem) => i.status === 'open', () => true])
    for (const item of order) { const hit = open.get(item.sourceKey); if (hit && hit.sourceKey !== sourceKey && wanted(hit)) return hit; }
  return current.find(i => i.sourceKey !== sourceKey && i.status === 'open') ?? current.find(i => i.sourceKey !== sourceKey) ?? null;
}
export type TjanstCandidateTotals = { before: TjanstTermMinutes & { year: number }; after: TjanstTermMinutes & { year: number } };
/** Lärarens undervisning före och efter ett val med tiden added. Ingen jämförelse med andel eller riktvärde (D-10). */
export function candidateTotals(personId: string, rows: TjanstRow[], specials: TjanstSpecial[], joints: TjanstJoint[], added: TjanstTermMinutes): TjanstCandidateTotals {
  const before = teacherSums(personId, rows, specials, joints).teaching;
  const after = { ht: before.ht + added.ht, vt: before.vt + added.vt, year: before.year + added.ht + added.vt };
  return { before, after };
}
