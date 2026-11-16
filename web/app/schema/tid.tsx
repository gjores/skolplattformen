'use client';
// Tid över läsåret och vecka för vecka (05.2-SM-TIMPLAN-EXAKT, 05.2-SM-TIMPLAN-VECKA). Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import { useId, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaTimplanDeviation } from '@/lib/schema-contract.ts';
import { OppnaFonster } from './fonster';
import { hoursText } from './delat.ts';

/** Små skillnader i minuter, större i timmar. */
const diffText = (minutes: number) => Math.abs(minutes) < 60 ? `${Math.abs(minutes)} min` : hoursText(Math.abs(minutes));
/** Justeringen per tillfälle (05.2-SM-TIMPLAN-VECKA, W3) i klartext. */
const trimText = (t: SchemaForslag['teachings'][number]) => {
  const count = t.terms.reduce((n, x) => n + x.trimmedCount, 0), minutes = t.terms.reduce((n, x) => n + x.trimmedMin, 0);
  return count ? `${count} ${count === 1 ? 'tillfälle' : 'tillfällen'} kortare, ${minutes} min` : '–';
};
const TIMPLAN: Record<SchemaTimplanDeviation, string> = { unplaced: 'Pass utan tid', weekly: 'Passen kan inte ge timplanens tid', calendar: 'Passens veckodagar ger annan tid' };

/** Undervisningen med avvikelser först, och hur många som avviker från timplanen. */
export function tidAvvikelser(forslag: SchemaForslag | null) {
  const order = (t: SchemaForslag['teachings'][number]) => t.deviation === null ? 3 : t.deviation === 'calendar' ? 2 : t.deviation === 'weekly' ? 1 : 0;
  const deviating = forslag ? [...forslag.teachings].sort((a, b) => order(a) - order(b) || Math.abs(b.plannedMin - b.needMin) - Math.abs(a.plannedMin - a.needMin)) : [];
  // Timplanen är ram (T1): tid under timplanen eller över avrundningen uppåt, pass utan tid och utelämnad undervisning är avvikelser (05.2-SM-TIMPLAN-EXAKT).
  const off = forslag ? forslag.teachings.filter(t => t.deviation !== null).length + forslag.omitted.filter(o => o.reason !== 'no_time').length : 0;
  return { deviating, off };
}

export function Tid({ forslag, deviating, off, onOpen, onOpenWeeks, mode = 'all' }: { forslag: SchemaForslag; deviating: SchemaForslag['teachings']; off: number; onOpen?: () => void; onOpenWeeks?: () => void; mode?: 'all' | 'tid' | 'veckor' }) {
  if (deviating.length === 0) return null;
  const annual = forslag.villkor.timeBasis === 'lasar', partial = annual && forslag.period !== 'lasar';
  return <>
    {mode !== 'veckor' && <details className="schema-list" open={mode === 'tid'}><summary><h2>Tid över {forslag.period === 'lasar' ? 'läsåret' : 'terminen'} ({deviating.length})</h2>
        <span className="schema-note">{partial ? 'Visar den valda terminens del av årsbehovet.' : off === 0 ? 'All undervisning följer timplanen.' : `${off} av ${deviating.length} skiljer sig från timplanen.`}</span><OppnaFonster onOpen={onOpen} label="Tid över läsåret"/></summary>
        <p className="schema-note">Timplanen bestämmer hur mycket undervisning som läggs; villkor och flytt ändrar bara när och var. Utlagd tid räknas på faktiska lektionstillfällen: varje skoldag i läsårskalendern på passets veckodag, för de klasser passet gäller. {annual ? 'Årsbehovet räknas samman och avrundas uppåt till hela 5 minuter en gång. Kortningar fördelas över hela årets tillfällen, så att höst och vår behåller samma veckomönster.' : 'Grundschemat ger minst timplanens tid; det som blir över tas bort genom att enskilda tillfällen slutar tidigare, jämnt spritt över veckorna.'} {partial ? 'Återstående tid hör till läsåret utanför denna terminsvy och är inte verifierad som utlagd här.' : 'Avvikelser står först.'}</p>
        <Table><TableHeader><TableRow><TableHead>Undervisning</TableHead><TableHead>Klass</TableHead><TableHead>{annual ? 'Timplan för läsåret' : 'Timplan'}</TableHead><TableHead>{partial ? 'Utlagt i vald termin' : 'Utlagt'}</TableHead><TableHead>{partial ? 'Kvar för läsåret' : 'Skillnad'}</TableHead><TableHead>Justering</TableHead><TableHead>{partial ? 'Avstämning' : 'Följer timplanen'}</TableHead></TableRow></TableHeader>
          <TableBody>{deviating.map((t, i) => <TableRow key={i}><TableCell>{t.title}</TableCell><TableCell>{t.classes.join(', ') || '–'}</TableCell><TableCell>{hoursText(t.needMin)}</TableCell>
            <TableCell>{hoursText(t.plannedMin)}{t.unplaced > 0 && ` (${t.unplaced} pass utan tid)`}</TableCell>
            <TableCell>{partial ? diffText(Math.max(0, t.needMin - t.plannedMin)) : <>{t.plannedMin > t.needMin ? '+' : t.plannedMin < t.needMin ? '−' : ''}{diffText(t.plannedMin - t.needMin)}</>}</TableCell>
            <TableCell>{trimText(t)}</TableCell>
            <TableCell>{t.deviation ? `Nej: ${TIMPLAN[t.deviation].toLowerCase()}` : partial ? 'Del av läsåret' : 'Ja'}</TableCell></TableRow>)}</TableBody></Table></details>}
    {mode !== 'tid' && <Veckor teachings={deviating} labels={forslag.time.weekLabels} onOpen={onOpenWeeks} open={mode === 'veckor'}/>}
  </>;
}

/** Tid vecka för vecka för en undervisning (05.2-SM-TIMPLAN-VECKA, W4): kalenderns faktiska tillfällen, med justerade veckor utmärkta. */
function Veckor({ teachings, labels, onOpen, open }: { teachings: SchemaForslag['teachings']; labels: string[]; onOpen?: () => void; open?: boolean }) {
  const [pick, setPick] = useState(0), id = useId();
  const t = teachings[Math.min(pick, teachings.length - 1)];
  const name = (x: SchemaForslag['teachings'][number]) => x.classes.length ? `${x.title} (${x.classes.join(', ')})` : x.title;
  return <details className="schema-list" open={open}><summary><h2>Vecka för vecka</h2><span className="schema-note">Tid per vecka för en undervisning, räknad på läsårskalenderns skoldagar.</span><OppnaFonster onOpen={onOpen} label="Vecka för vecka"/></summary>
    <div className="schema-filter"><label>Undervisning<select value={pick} onChange={e => setPick(Number(e.target.value))}>
      {teachings.map((x, i) => <option key={i} value={i}>{name(x)}</option>)}</select></label></div>
    <ol className="schema-weeks" aria-labelledby={id}>{labels.map((label, w) => <li key={w} className={t.trimPerWeek[w] ? 'trimmed' : undefined}>
      <span>{label}</span><span>{t.perWeek[w] ? `${t.perWeek[w]} min` : '–'}</span><span>{t.trimPerWeek[w] > 0 ? `${t.trimPerWeek[w]} min kortare` : ''}</span></li>)}</ol>
    <p className="schema-note" id={id}>{name(t)}: {t.timeBasis === 'lasar' && `årsbehov ${t.needMin} min. `}{t.terms.map(x => `${x.term.toUpperCase()} ${x.plannedMin} min${t.timeBasis === 'lasar' ? ' utlagt' : ` av timplanens ${x.needMin}`}${x.trimmedCount ? `, ${x.trimmedCount} ${x.trimmedCount === 1 ? 'tillfälle' : 'tillfällen'} kortare` : ''}`).join('; ')}.</p>
  </details>;
}
