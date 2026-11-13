'use client';
// Tid över läsåret och vecka för vecka (05.2-SM-TIMPLAN-EXAKT, 05.2-SM-TIMPLAN-VECKA). Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import { useId, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaTimplanDeviation } from '@/lib/schema-contract.ts';
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

export function Tid({ forslag, deviating, off }: { forslag: SchemaForslag; deviating: SchemaForslag['teachings']; off: number }) {
  if (deviating.length === 0) return null;
  return <>
    <details className="schema-list"><summary><h2>Tid över {forslag.period === 'lasar' ? 'läsåret' : 'terminen'} ({deviating.length})</h2>
        <span className="schema-note">{off === 0 ? 'All undervisning följer timplanen.' : `${off} av ${deviating.length} skiljer sig från timplanen.`}</span></summary>
        <p className="schema-note">Timplanen bestämmer hur mycket undervisning som läggs; villkor och flytt ändrar bara när och var. Utlagd tid räknas på faktiska lektionstillfällen: varje skoldag i läsårskalendern på passets veckodag, för de klasser passet gäller. Grundschemat ger minst timplanens tid; det som blir över tas bort genom att enskilda tillfällen slutar 5 minuter tidigare, jämnt spritt över veckorna, så att tiden blir timplanens avrundad uppåt till hela 5 minuter. Avvikelser står först.</p>
        <Table><TableHeader><TableRow><TableHead>Undervisning</TableHead><TableHead>Klass</TableHead><TableHead>Timplan</TableHead><TableHead>Utlagt</TableHead><TableHead>Skillnad</TableHead><TableHead>Justering</TableHead><TableHead>Följer timplanen</TableHead></TableRow></TableHeader>
          <TableBody>{deviating.map((t, i) => <TableRow key={i}><TableCell>{t.title}</TableCell><TableCell>{t.classes.join(', ') || '–'}</TableCell><TableCell>{hoursText(t.needMin)}</TableCell>
            <TableCell>{hoursText(t.plannedMin)}{t.unplaced > 0 && ` (${t.unplaced} pass utan tid)`}</TableCell>
            <TableCell>{t.plannedMin > t.needMin ? '+' : t.plannedMin < t.needMin ? '−' : ''}{diffText(t.plannedMin - t.needMin)}</TableCell>
            <TableCell>{trimText(t)}</TableCell>
            <TableCell>{t.deviation ? `Nej: ${TIMPLAN[t.deviation].toLowerCase()}` : 'Ja'}</TableCell></TableRow>)}</TableBody></Table></details>
    <Veckor teachings={deviating} labels={forslag.time.weekLabels}/>
  </>;
}

/** Tid vecka för vecka för en undervisning (05.2-SM-TIMPLAN-VECKA, W4): kalenderns faktiska tillfällen, med justerade veckor utmärkta. */
function Veckor({ teachings, labels }: { teachings: SchemaForslag['teachings']; labels: string[] }) {
  const [pick, setPick] = useState(0), id = useId();
  const t = teachings[Math.min(pick, teachings.length - 1)];
  const name = (x: SchemaForslag['teachings'][number]) => x.classes.length ? `${x.title} (${x.classes.join(', ')})` : x.title;
  return <details className="schema-list"><summary><h2>Vecka för vecka</h2><span className="schema-note">Tid per vecka för en undervisning, räknad på läsårskalenderns skoldagar.</span></summary>
    <div className="schema-filter"><label>Undervisning<select value={pick} onChange={e => setPick(Number(e.target.value))}>
      {teachings.map((x, i) => <option key={i} value={i}>{name(x)}</option>)}</select></label></div>
    <ol className="schema-weeks" aria-labelledby={id}>{labels.map((label, w) => <li key={w} className={t.trimPerWeek[w] ? 'trimmed' : undefined}>
      <span>{label}</span><span>{t.perWeek[w] ? `${t.perWeek[w]} min` : '–'}</span><span>{t.trimPerWeek[w] > 0 ? `${t.trimPerWeek[w]} min kortare` : ''}</span></li>)}</ol>
    <p className="schema-note" id={id}>{name(t)}: {t.terms.map(x => `${x.term.toUpperCase()} ${x.plannedMin} min av timplanens ${x.needMin}${x.trimmedCount ? `, ${x.trimmedCount} ${x.trimmedCount === 1 ? 'tillfälle' : 'tillfällen'} 5 min kortare` : ''}`).join('; ')}.</p>
  </details>;
}
