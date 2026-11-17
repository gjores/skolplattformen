'use client';
// Resursväljare i samlingsvyns rad "Visas:": ett sökfält med förslag direkt i raden, i stället för en dialog. Samma combobox som lärarväljaren i tjänstefördelningen.
import { useId, useMemo, useState } from 'react';
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from '@/components/ui/combobox';
import { SAMLING_NAMN, SAMLING_SLAG, type SamlingResurs } from '@/lib/schema-samling.ts';

const GRUPPRUBRIK = { klass: 'Klasser', grupp: 'Grupper', larare: 'Lärare', sal: 'Salar', elev: 'Elever' };
type Grupp = { value: string; items: SamlingResurs[] };

/** Sökningen ändrar bara listan. Ett val lägger till resursen och tömmer fältet, så att nästa kan sökas direkt. */
export function SamlingSok({ resources, selected, onAdd }: { resources: SamlingResurs[]; selected: string[]; onAdd: (key: string) => void }) {
  const id = useId(), [text, setText] = useState('');
  const grupper = useMemo<Grupp[]>(() => SAMLING_SLAG.map(s => ({ value: GRUPPRUBRIK[s], items: resources.filter(r => r.slag === s && !selected.includes(r.key)) }))
    .filter(g => g.items.length > 0), [resources, selected]);
  return <div className="samling-resurssok">
    <label htmlFor={id} className="sr-only">Lägg till resurs</label>
    <Combobox<SamlingResurs> items={grupper} value={null} autoHighlight inputValue={text} onInputValueChange={setText}
      itemToStringLabel={r => r.name} itemToStringValue={r => r.key} isItemEqualToValue={(a, b) => a.key === b.key}
      onValueChange={r => { if (r) { onAdd(r.key); setText(''); } }}>
      <ComboboxInput id={id} aria-describedby={`${id}-hint`} placeholder="Lägg till klass, grupp, lärare, sal eller elev" className="samling-resursfalt"/>
      <ComboboxContent className="samling-resurslista">
        <ComboboxEmpty>Inga resurser hittades.</ComboboxEmpty>
        <ComboboxList>{(g: Grupp) => <ComboboxGroup key={g.value} items={g.items}>
          <ComboboxLabel>{g.value}</ComboboxLabel>
          <ComboboxCollection>{(r: SamlingResurs) => <ComboboxItem key={r.key} value={r} className="samling-resursval">
            <span className="samling-resursnamn">{r.name}</span><span className="sr-only"> {SAMLING_NAMN[r.slag].toLocaleLowerCase('sv-SE')}</span></ComboboxItem>}</ComboboxCollection>
        </ComboboxGroup>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    <p id={`${id}-hint`} className="sr-only">Sök efter namn. Välj med piltangenter och Enter. Elever visas bara med din behörighet.</p>
  </div>;
}
