'use client';

import { useId, useMemo } from 'react';
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from '@/components/ui/combobox';
import { VECKORESURSER, type Veckoresurs } from '@/lib/schema-veckoresurser.ts';

type Alternativ = Veckoresurs & { label: string };
type Grupp = { label: string; items: Alternativ[] };

export function VeckoResursval({ resources, selected, onSelect }: {
  resources: Veckoresurs[]; selected?: Veckoresurs; onSelect: (resource: Veckoresurs) => void;
}) {
  const id = useId();
  const grupper = useMemo<Grupp[]>(() => Object.entries(VECKORESURSER).flatMap(([slag, info]) => {
    const items = resources.filter(r => r.slag === slag).sort((a, b) => a.name.localeCompare(b.name, 'sv', { numeric: true }));
    const counts = new Map<string, number>(), seen = new Map<string, number>();
    for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    return items.length ? [{ label: info.grupp, items: items.map(r => {
      const ordinal = (seen.get(r.name) ?? 0) + 1;
      seen.set(r.name, ordinal);
      return { ...r, label: counts.get(r.name)! > 1 ? `${r.name} · ${ordinal}` : r.name };
    }) }] : [];
  }), [resources]);
  const value = grupper.flatMap(g => g.items).find(r => r.key === selected?.key) ?? null;
  return <div className="samling-resurssok schema-vecko-resursval">
    <label htmlFor={id}>Visa schema för</label>
    <Combobox<Alternativ> items={grupper} value={value} autoHighlight
      itemToStringLabel={r => `${r.label} · ${VECKORESURSER[r.slag].namn}`}
      itemToStringValue={r => r.key} isItemEqualToValue={(a, b) => a.key === b.key}
      onValueChange={r => { if (r) onSelect(r); }}>
      <ComboboxInput id={id} aria-describedby={`${id}-hint`} placeholder="Sök klass, grupp, lärare, sal eller ämne" className="samling-resursfalt"/>
      <ComboboxContent className="samling-resurslista">
        <ComboboxEmpty>Inga resurser matchar sökningen.</ComboboxEmpty>
        <ComboboxList>{(g: Grupp) => <ComboboxGroup key={g.label} items={g.items}>
          <ComboboxLabel>{g.label}</ComboboxLabel>
          <ComboboxCollection>{(r: Alternativ) => <ComboboxItem key={r.key} value={r} className="samling-resursval">
            <span className="samling-resursnamn">{r.label}</span><span className="sr-only"> {VECKORESURSER[r.slag].namn.toLocaleLowerCase('sv-SE')}</span>
          </ComboboxItem>}</ComboboxCollection>
        </ComboboxGroup>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    <p id={`${id}-hint`} className="sr-only">Sök efter namn eller resurstyp. Välj i listan med piltangenter och Enter.</p>
  </div>;
}
