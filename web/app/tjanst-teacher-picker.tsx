'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TjanstYearCandidate, TjanstYearChoice, TjanstYearRowReply } from '@/lib/tjanst-year-contract.ts';
import { yearCandidatePeriod, sortYearSuggestions, yearEvidenceLabel, yearRecommendationMessage, YEAR_QUALIFICATION_LABEL } from '@/lib/tjanst-year-model.ts';

export type TjanstTeacherSelection = { kind: 'manual'; personId: string } | { kind: 'suggestion'; suggestionId: string } | { kind: 'unassigned' };
type Props = { candidates: TjanstYearCandidate[]; schoolYear: number; choice: TjanstYearChoice | null;
  support?: TjanstYearRowReply; disabled?: boolean; allowVacant?: boolean; error?: string;
  onSelect: (choice: TjanstTeacherSelection) => void };
/** Sökningen filtrerar bara den auditerade katalogen. Endast en namngiven knapp väljer en person. */
export default function TjanstTeacherPicker({ candidates, schoolYear, choice, support, disabled = false, allowVacant = true, error, onSelect }: Props) {
  const id = useId(), [query, setQuery] = useState('');
  const matches = candidates.filter(p => p.displayName.toLocaleLowerCase('sv-SE').includes(query.trim().toLocaleLowerCase('sv-SE')));
  const selected = choice?.personId ? candidates.find(p => p.personId === choice.personId)?.displayName ?? 'Tidigare vald lärare' : null;
  const details = (p: TjanstYearCandidate) => <><p>{p.draft ? 'Ny lärare – uppgifter kompletteras' : `Egen andel på skolan: ${p.shareHere ?? 'okänd'} %`}{yearCandidatePeriod(p, schoolYear) === 'part_year' ? ' · Gäller en del av läsåret' : ''}</p>
    {p.duties.map(d => <small key={d.dutyId}>{d.startsOn} – {d.endsOn ?? 'tills vidare'} · {d.percent ?? 'okänd'} %</small>)}<small>{YEAR_QUALIFICATION_LABEL}</small></>;
  return <fieldset className="tjanst-teacher-picker" disabled={disabled}><legend>Lärare</legend>
    <p className="tjanst-selected-teacher" aria-live="polite">{choice === null ? 'Ingen lärare vald' : choice.kind === 'unassigned' ? 'Valt: Vakant' : `Vald lärare: ${selected}`}</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {support && <section aria-label="Planeringsförslag"><h3>{yearRecommendationMessage(support.recommendationStatus)}</h3>
      {support.recommendationStatus === 'unavailable' && <p>Du kan fortfarande söka och välja en lärare manuellt.</p>}
      {sortYearSuggestions(support).map(s => { const p = candidates.find(x => x.personId === s.personId); return p && <article className="tjanst-teacher-choice" key={s.suggestionId}>
        <strong>{p.displayName}</strong>{s.references.map((e, i) => <p key={i}>{yearEvidenceLabel(e)}</p>)}{details(p)}
        <Button type="button" variant="outline" onClick={() => onSelect({ kind: 'suggestion', suggestionId: s.suggestionId })}>Välj förslaget: {p.displayName}</Button>
      </article>; })}
    </section>}
    <label htmlFor={id}>Sök lärare</label><input id={id} type="search" value={query} autoComplete="off" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}/>
    <div className="tjanst-teacher-results" aria-label="Lärare att välja manuellt">{matches.length === 0 && <p>Inga lärare matchar sökningen.</p>}
      {matches.length > 50 && <p>Visar 50 av {matches.length} lärare. Förfina sökningen för att hitta fler.</p>}{matches.slice(0, 50).map(p => <article key={p.personId} className="tjanst-teacher-choice"><strong>{p.displayName}</strong>{details(p)}
        <Button type="button" variant="outline" onClick={() => onSelect({ kind: 'manual', personId: p.personId })}>Välj {p.displayName}</Button></article>)}</div>
    {allowVacant && <Button type="button" variant="outline" onClick={() => onSelect({ kind: 'unassigned' })}>Välj Vakant</Button>}
  </fieldset>;
}
