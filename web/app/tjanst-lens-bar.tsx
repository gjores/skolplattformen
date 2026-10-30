'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { TjanstTeacher } from '@/lib/tjanst-contract.ts';
import { TJANST_LENSES, type TjanstLensId, type TjanstSavedLens } from '@/lib/tjanst-lens.ts';

/**
 * 05.1-29: linsrad ovanför matrisen. Lins, antal synliga lärare, Visa alla, Fäst lärare, Kompakta kolumner och sparade linser.
 * På telefon (läsläge, D-15) visas bara linsväljaren. Inställningarna sparas bara i den egna webbläsaren.
 */
type Props = { extra?: ReactNode; lens: TjanstLensId; onLens: (lens: TjanstLensId) => void; phone: boolean; matrix: boolean;
  shown: number; total: number; showAll: boolean; onShowAll: (all: boolean) => void; filteredByTeacher: boolean;
  teachers: TjanstTeacher[]; pinned: string[]; onPin: (personId: string, pin: boolean) => void;
  compact: boolean; onCompact: (compact: boolean) => void;
  saved: TjanstSavedLens[]; onApplySaved: (lens: TjanstSavedLens) => void; onSave: (name: string) => string | null; onDeleteSaved: (name: string) => void };

export default function TjanstLensBar(p: Props) {
  const id = useId();
  const [search, setSearch] = useState(''), [name, setName] = useState(''), [chosen, setChosen] = useState(''), [message, setMessage] = useState<string | null>(null);
  const lensSelect = <div className="tjanst-field"><label htmlFor={`${id}-lins`}>Lins</label>
    <select id={`${id}-lins`} value={p.lens} onChange={e => p.onLens(e.target.value as TjanstLensId)}>{TJANST_LENSES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>;
  if (p.phone || !p.matrix) return <div className="tjanst-lens-bar">{lensSelect}{p.extra}</div>;
  const q = search.trim().toLocaleLowerCase('sv');
  const matches = q ? p.teachers.filter(t => t.displayName.toLocaleLowerCase('sv').includes(q)) : p.teachers;
  const current = p.saved.find(s => s.name === chosen) ?? null;
  return <div className="tjanst-lens-bar">
    {lensSelect}
    <output className="tjanst-lens-count">{p.filteredByTeacher ? 'Visar läraren i lärarfiltret' : `Visar ${p.shown} av ${p.total} lärare`}</output>
    {p.extra}
    <details className="tjanst-view-options"><summary>Visning</summary><div className="tjanst-display-controls">
    {!p.filteredByTeacher && p.lens !== 'ofordelat' && <Button type="button" variant="outline" onClick={() => p.onShowAll(!p.showAll)}>{p.showAll ? 'Visa relevanta lärare' : `Visa alla lärare (${p.total})`}</Button>}
    <label className="mandate-check"><input type="checkbox" checked={p.compact} onChange={e => p.onCompact(e.target.checked)}/>Kompakta kolumner</label>
    <details className="tjanst-lens-pins">
      <summary>Fäst lärare{p.pinned.length ? ` (${p.pinned.length})` : ''}</summary>
      <div className="tjanst-lens-panel">
        <p>Fästa lärare visas alltid i matrisen. Valet sparas bara i den här webbläsaren.</p>
        <div className="tjanst-field"><label htmlFor={`${id}-sok`}>Sök lärare</label><input id={`${id}-sok`} type="search" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <fieldset><legend className="sr-only">Lärare</legend>
          {matches.length ? matches.map(t => <label key={t.personId} className="mandate-check"><input type="checkbox" checked={p.pinned.includes(t.personId)} onChange={e => p.onPin(t.personId, e.target.checked)}/>{t.displayName}</label>)
            : <p>Ingen lärare matchar sökningen.</p>}
        </fieldset>
      </div>
    </details>
    <details className="tjanst-lens-saved">
      <summary>Sparade linser{p.saved.length ? ` (${p.saved.length})` : ''}</summary>
      <div className="tjanst-lens-panel">
        <p>En sparad lins minns lins, filter och om alla lärare visas. Den sparas bara i den här webbläsaren.</p>
        {p.saved.length > 0 && <div className="tjanst-lens-row">
          <div className="tjanst-field"><label htmlFor={`${id}-sparad`}>Sparad lins</label>
            <select id={`${id}-sparad`} value={chosen} onChange={e => { setChosen(e.target.value); setMessage(null); }}><option value="">Välj sparad lins</option>{p.saved.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
          <Button type="button" variant="outline" disabled={!current} onClick={() => { if (current) { p.onApplySaved(current); setMessage(`Linsen ${current.name} används.`); } }}>Använd</Button>
          <Button type="button" variant="outline" disabled={!current} onClick={() => { if (current) { p.onDeleteSaved(current.name); setMessage(`Linsen ${current.name} är borttagen.`); setChosen(''); } }}>Ta bort lins</Button>
        </div>}
        <form className="tjanst-lens-row" onSubmit={e => { e.preventDefault(); const error = p.onSave(name); setMessage(error ?? `Linsen ${name.trim()} är sparad.`); if (!error) setName(''); }}>
          <div className="tjanst-field"><label htmlFor={`${id}-namn`}>Namn på linsen</label><input id={`${id}-namn`} value={name} maxLength={60} onChange={e => setName(e.target.value)}/></div>
          <Button type="submit" variant="outline">Spara lins</Button>
        </form>
        {message && <output>{message}</output>}
      </div>
    </details>
    </div></details>
  </div>;
}
