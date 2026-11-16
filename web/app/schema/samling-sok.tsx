'use client';
import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { SAMLING_NAMN, SAMLING_SLAG, type SamlingResurs } from '@/lib/schema-samling.ts';

const GRUPPRUBRIK = { klass: 'Klasser', grupp: 'Grupper', larare: 'Lärare', sal: 'Salar', elev: 'Elever' };

export function SamlingSok({ resources, selected, onAdd }: { resources: SamlingResurs[]; selected: string[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><PlusIcon aria-hidden="true"/>Lägg till resurs</Button>
    <CommandDialog open={open} onOpenChange={setOpen} title="Lägg till klass, grupp, lärare, sal eller elev" description="Sök efter namn. Välj med piltangenter och Enter. Elever visas bara med din behörighet." className="samling-resurssok top-1/2 -translate-y-1/2" showCloseButton>
      <Command><CommandInput placeholder="Sök klass, grupp, lärare, sal eller elev" aria-label="Sök resurs"/>
        <CommandList><CommandEmpty>Inga resurser hittades.</CommandEmpty>
          {SAMLING_SLAG.filter(s => resources.some(r => r.slag === s && !selected.includes(r.key))).map(s => <CommandGroup key={s} heading={GRUPPRUBRIK[s]}>
            {resources.filter(r => r.slag === s && !selected.includes(r.key)).map(r => <CommandItem key={r.key} className="samling-resursval" value={`${SAMLING_NAMN[s]} ${r.name} ${r.key}`} onSelect={() => { onAdd(r.key); setOpen(false); }}><span className="samling-resursnamn">{r.name}</span><span className="sr-only"> {SAMLING_NAMN[s].toLocaleLowerCase('sv-SE')}</span></CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </CommandDialog>
  </>;
}
