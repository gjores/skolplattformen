'use client';
// Panelen "Ny spärr" (05.2-SM-MENY, Sparra): en markerad tid blir ett eget villkor, spärrad tid eller tillåten tid, för något som syns där.
// Villkoret läggs till i villkorsformuläret via utkastet, så att det kan ångras, och skickas med nästa förslag. Inget sparas.
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslagLesson } from '@/lib/schema-contract.ts';
import type { SchemaMarkering, SchemaSparrResurs } from '@/lib/schema-utkast.ts';
import { clock, dayName } from './delat.ts';

export type SparrTyp = 'sparrad' | 'tillaten';
export const tidText = (m: SchemaMarkering) => `${dayName(m.day)} ${clock(m.startMin)}–${clock(m.endMin)}`;
/** Ett pass i text, med den längd som visas i passrutan (justerad längd, 05.2-SM-TIMPLAN-VECKA). */
export const passText = (l: SchemaForslagLesson, length = l.durationMin) => l.day === null || l.startMin === null ? l.title : `${l.title} ${dayName(l.day).toLowerCase()} ${clock(l.startMin)}–${clock(l.startMin + length)}`;
/** Högst så många pass räknas upp; resten sägs som antal. */
const UPPRAKNADE = 5;

export function SparrPanel({ typ, markering, resurser, vald, berorda, beskriv = passText, nummer, period, full, onVald, onLagg, onAvbryt }: {
  typ: SparrTyp; markering: SchemaMarkering; resurser: SchemaSparrResurs[]; vald: number;
  /** Passen som ligger på spärren, eller utanför den tillåtna tiden, med villkoret tillagt. */
  berorda: SchemaForslagLesson[];
  /** Passet i text, som i passrutan. */
  beskriv?: (l: SchemaForslagLesson) => string;
  /** Villkorets nummer bland de egna villkoren. */
  nummer: number;
  period: string;
  /** Högsta antal egna villkor är nått. */
  full: boolean;
  onVald: (index: number) => void; onLagg: () => void; onAvbryt: () => void;
}) {
  const id = useId(), select = useRef<HTMLSelectElement | null>(null), section = useRef<HTMLElement | null>(null), sparr = typ === 'sparrad';
  useEffect(() => { select.current?.focus(); }, []);
  // Esc i panelen avbryter, som Avbryt.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onAvbryt(); } };
    el.addEventListener('keydown', key);
    return () => el.removeEventListener('keydown', key);
  }, [onAvbryt]);
  const namn = resurser[vald]?.namn ?? '';
  const lista = berorda.slice(0, UPPRAKNADE).map(l => beskriv(l)).join(', ') + (berorda.length > UPPRAKNADE ? ` och ${berorda.length - UPPRAKNADE} till` : '');
  return <section ref={section} className="schema-sparr" aria-labelledby={`${id}-rubrik`}>
    <h2 id={`${id}-rubrik`}>{sparr ? 'Ny spärr' : 'Ny tillåten tid'}</h2>
    <dl>
      <dt><label htmlFor={`${id}-galler`}>Gäller</label></dt>
      <dd><select id={`${id}-galler`} ref={select} value={vald} onChange={e => onVald(Number(e.target.value))}>
        {resurser.map((r, i) => <option key={`${r.slag}|${r.ref}`} value={i}>{r.namn}</option>)}</select></dd>
      <dt>Tid</dt><dd>{tidText(markering)}</dd>
      <dt>Termin</dt><dd>{period}</dd>
    </dl>
    {berorda.length > 0
      ? <p className="schema-sparr-berorda"><strong>Berör {berorda.length} pass som ligger {sparr ? 'där' : 'utanför'} nu:</strong> {lista}. {berorda.length === 1 ? 'Det' : 'De'} märks som regelavvikelse tills du flyttar {berorda.length === 1 ? 'det' : 'dem'} eller räknar om förslaget.</p>
      : <p className="schema-note">{sparr ? `Inga pass för ${namn} ligger där nu.` : `Alla pass för ${namn} ligger redan inom tiden.`}</p>}
    <p className="schema-note">{sparr ? 'Spärren' : 'Den tillåtna tiden'} blir eget villkor {nummer} och syns i Villkor för schemat. Den skickas med nästa förslag och kan ångras.{!sparr && ` Passen för ${namn} får då bara ligga på tillåten tid; en dag utan tillåten tid är stängd för dem.`}</p>
    {full && <p className="schema-note" role="alert">Det finns redan så många egna villkor som får finnas. Ta bort ett villkor först.</p>}
    <div className="schema-sparr-knappar">
      <Button type="button" disabled={full || resurser.length === 0} onClick={onLagg}>{sparr ? 'Lägg till spärr' : 'Lägg till tillåten tid'}</Button>
      <Button type="button" variant="outline" onClick={onAvbryt}>Avbryt</Button>
    </div>
    <hr/>
    <h3>Med tangentbord</h3>
    <p className="schema-note">Välj en tid med piltangenterna, Skift+pil utökar markeringen, Skift+F10 eller menytangenten öppnar samma meny. Esc stänger.</p>
  </section>;
}
