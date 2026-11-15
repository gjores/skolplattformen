'use client';
import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { SAMLING_NAMN, SAMLING_SLAG, type SamlingResurs } from '@/lib/schema-samling.ts';

export function SamlingSok({ resources, selected, onAdd }: { resources: SamlingResurs[]; selected: string[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><PlusIcon aria-hidden="true"/>Lägg till resurs</Button>
    <CommandDialog open={open} onOpenChange={setOpen} title="Lägg till klass, grupp, lärare, sal eller elev" description="Sök efter namn. Välj med piltangenter och Enter. Elever visas bara med din behörighet." className="samling-resurssok" showCloseButton>
      <Command><CommandInput placeholder="Sök klass, grupp, lärare eller sal" aria-label="Sök resurs"/>
        <CommandList><CommandEmpty>Inga resurser hittades.</CommandEmpty>
          {SAMLING_SLAG.filter(s => resources.some(r => r.slag === s && !selected.includes(r.key))).map(s => <CommandGroup key={s} heading={SAMLING_NAMN[s]}>
            {resources.filter(r => r.slag === s && !selected.includes(r.key)).map(r => <CommandItem key={r.key} value={`${SAMLING_NAMN[s]} ${r.name} ${r.key}`} onSelect={() => { onAdd(r.key); setOpen(false); }}>{r.name}<span className="schema-note">{SAMLING_NAMN[s].toLocaleLowerCase('sv-SE')}</span></CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </CommandDialog>
  </>;
}
