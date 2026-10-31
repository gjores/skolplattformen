'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Valformuläret visar ett erbjudande. Skolans server avgör vilka alternativ eleven får välja. */
export type ElectiveChoiceOption = { id: string; name: string; description?: string; unavailableReason?: string | null };
type Props = {
  title: string;
  options: ElectiveChoiceOption[];
  selected: string[];
  minChoices: number;
  maxChoices: number;
  disabled?: boolean;
  onChange: (selected: string[]) => void;
};

export default function ElectiveChoiceForm({ title, options, selected, minChoices, maxChoices, disabled = false, onChange }: Props) {
  const id = useId(), [search, setSearch] = useState('');
  const shown = useMemo(() => options.filter(option => `${option.name} ${option.description ?? ''}`.toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv'))), [options, search]);
  const single = maxChoices === 1;
  function choose(option: ElectiveChoiceOption, checked: boolean) {
    if (disabled || option.unavailableReason) return;
    if (single) onChange([option.id]);
    else if (!checked) onChange(selected.filter(value => value !== option.id));
    else if (selected.length < maxChoices) onChange([...selected, option.id]);
  }
  return <fieldset disabled={disabled} aria-describedby={`${id}-rule`}>
    <legend>{title}</legend>
    <p id={`${id}-rule`} className="elective-muted">{single ? 'Välj ett alternativ.' : minChoices === maxChoices ? `Välj ${maxChoices} alternativ.` : `Välj mellan ${minChoices} och ${maxChoices} alternativ.`}</p>
    {options.length > 6 && <label htmlFor={`${id}-search`}>Sök alternativ<input id={`${id}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>}
    <div className="elective-list">
      {shown.map(option => <label key={option.id} className="elective-choice">
        <input type={single ? 'radio' : 'checkbox'} name={`${id}-option`} value={option.id} checked={selected.includes(option.id)}
          disabled={disabled || !!option.unavailableReason || !single && !selected.includes(option.id) && selected.length >= maxChoices}
          onChange={event => choose(option, event.target.checked)}/>
        <span>{option.name}{option.description && <small>{option.description}</small>}{option.unavailableReason && <small>{option.unavailableReason}</small>}</span>
      </label>)}
      {shown.length === 0 && <p className="elective-muted">Inga alternativ matchar sökningen.</p>}
    </div>
    <div className="elective-toolbar"><output className="elective-muted">{selected.length} valda{!single && ` av högst ${maxChoices}`}</output>
      {selected.length > 0 && <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange([])}>Rensa val</Button>}
    </div>
  </fieldset>;
}
