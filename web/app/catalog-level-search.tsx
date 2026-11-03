'use client';

import { useId, useState } from 'react';
import { catalogLevelKey, searchCatalogLevels, type CatalogLevel } from '@/lib/catalog-levels.ts';

type Props<T extends CatalogLevel> = { levels: readonly T[]; searchLabel: string; listLabel: string; disabled?: boolean; unavailable?: (level: T) => boolean;
  label: (level: T) => string; onPick: (level: T) => void };
/** Search and pick one catalog level; the same list as programplanens valpaket. */
export default function CatalogLevelSearch<T extends CatalogLevel>({ levels, searchLabel, listLabel, disabled = false, unavailable = () => false, label, onPick }: Props<T>) {
  const [query, setQuery] = useState(''), id = useId(), matches = searchCatalogLevels(levels, query);
  return <div className="catalog-level-search">
    <label htmlFor={id}>{searchLabel}</label>
    <input id={id} aria-label={searchLabel} value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} placeholder="Ämne, kurs eller kod"/>
    <ul className="ppk-level-choices" aria-label={listLabel}>{matches.map(level => <li key={catalogLevelKey(level)}>
      <button type="button" disabled={disabled || unavailable(level)} onClick={() => onPick(level)}>{label(level)}</button></li>)}</ul>
    {!matches.length && <p className="catalog-level-empty">Inga kurser matchar sökningen.</p>}
  </div>;
}
