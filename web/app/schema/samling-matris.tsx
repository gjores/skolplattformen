'use client';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaTerm, SchemaVillkor } from '@/lib/schema-contract.ts';
import { SAMLING_NAMN, samlingUpptagen, type SamlingResurs, type SamlingSlag } from '@/lib/schema-samling.ts';
import { clock, dayName } from './delat.ts';

/** Kompakt beläggningsmatris: samma folj-rad och tidsaxel, full beläggning oavsett passfilter. */
export function SamlingMatris({ resources, forslag, villkor, term, kind, day, selected, onKind, onDay, onAdd }: {
  resources: SamlingResurs[]; forslag: SchemaForslag; villkor: SchemaVillkor; term: SchemaTerm; kind: SamlingSlag; day: number | null;
  selected: string[]; onKind: (kind: SamlingSlag) => void; onDay: (day: number | null) => void; onAdd: (key: string) => void;
}) {
  const start = Math.min(...forslag.days.map(d => d.startMin)), end = Math.max(...forslag.days.map(d => d.endMin)), days = day === null ? forslag.days.map((_, i) => i) : [day];
  const all = resources.filter(r => r.slag === kind);
  return <section className="samling-matris" aria-label="Resursmatris">
    <div className="schema-filter"><h3 className="section-heading">Resursmatris</h3>
      <label>Resurstyp<select value={kind} onChange={e => onKind(e.target.value as SamlingSlag)}>{(['larare', 'sal', 'klass'] as const).map(k => <option key={k} value={k}>{k === 'larare' ? 'Alla lärare' : k === 'sal' ? 'Alla salar' : 'Alla klasser'}</option>)}</select></label>
      <label>Visa dag<select value={day ?? ''} onChange={e => onDay(e.target.value === '' ? null : Number(e.target.value))}><option value="">Alla dagar</option>{forslag.days.map((_, i) => <option key={i} value={i}>{dayName(i)}</option>)}</select></label>
    </div>
    <p className="schema-note">{all.length} {kind === 'larare' ? 'lärare' : kind === 'sal' ? 'salar' : 'klasser'}. Välj en rad för att lägga den i samlingsvyn. Fyllda rutor är upptagen tid, inklusive marginaler och spärrar. Filtren för pass påverkar inte beläggningen.</p>
    <div className="samling-matris-ram"><div className="folj-rutnat" style={{ '--days': days.length, '--span': end - start, '--first-hour': Math.ceil(start / 60) * 60 - start } as CSSProperties}>
      <div className="folj-rad folj-dagar"><div/>{days.map(d => <div key={d}>{dayName(d)}<small>{clock(start)}–{clock(end)}</small></div>)}</div>
      {all.map(r => <div key={r.key} className="folj-rad samling-matris-rad"><div className="folj-namn"><Button type="button" variant={selected.includes(r.key) ? 'secondary' : 'outline'} aria-label={`Lägg till ${r.name} från resursmatrisen`} aria-pressed={selected.includes(r.key)} onClick={() => onAdd(r.key)}>{r.name}{selected.includes(r.key) ? ' · Visas' : ''}</Button><small>{SAMLING_NAMN[r.slag]}</small></div>
        {days.map(d => <div key={d} className="folj-dag" aria-label={`${r.name}, ${dayName(d)}`}>{samlingUpptagen(r, forslag, villkor, term, d).map(([a, b], i) => <span key={i} className="folj-lage samling-upptagen" style={{ '--at': a - start, '--length': b - a } as CSSProperties} title={`Upptagen ${clock(a)}–${clock(b)}`}><span className="sr-only">Upptagen {clock(a)}–{clock(b)}</span></span>)}</div>)}
      </div>)}
      {!all.length && <div className="empty-state">Inga resurser av den här typen finns i förslaget.</div>}
    </div></div>
  </section>;
}
