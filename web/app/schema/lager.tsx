'use client';
// Lagren i veckan (05.2-SM-VILLKOR-SYNS): chipsraden "Visa i veckan" och rutan som visar varifrån ett fält kommer (Main).
import { useState, type ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SchemaVillkor } from '@/lib/schema-contract.ts';
import { SCHEMA_LAGER, lagerPa, type SchemaKalla, type SchemaLagerTyp } from '@/lib/schema-lager.ts';
import { REGEL, clock, daysText, ruleText, type Resurser } from './delat.ts';

/** Vilka lager som visas, i den här webbläsaren. Bara lagrens på/av, inget om skolan. */
const LAGER_KEY = 'schema-lager';
export function storedLager(): Record<string, boolean> {
  try {
    const value = JSON.parse(window.localStorage.getItem(LAGER_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(SCHEMA_LAGER.flatMap(x => typeof value[x.id] === 'boolean' ? [[x.id, value[x.id] as boolean]] : []));
  } catch { return {}; }
}
export function rememberLager(layers: Record<string, boolean>): void {
  try { window.localStorage.setItem(LAGER_KEY, JSON.stringify(Object.fromEntries(SCHEMA_LAGER.map(x => [x.id, lagerPa(layers, x.id)])))); } catch { /* utan lagring gäller valet tills sidan lämnas */ }
}

/** Chipsraden: varje lager kan visas eller döljas. */
export function Lagerval({ layers, onChange }: { layers: Record<string, boolean>; onChange: (layer: SchemaLagerTyp, on: boolean) => void }) {
  const value = SCHEMA_LAGER.filter(x => lagerPa(layers, x.id)).map(x => x.id);
  return <div className="schema-lagerval">
    <span id="schema-lagerval" className="schema-note">Visa i veckan:</span>
    <ToggleGroup multiple aria-labelledby="schema-lagerval" variant="outline" className="flex-wrap" value={value}
      onValueChange={next => { for (const x of SCHEMA_LAGER) { const on = next.includes(x.id); if (on !== value.includes(x.id)) onChange(x.id, on); } }}>
      {SCHEMA_LAGER.map(x => <ToggleGroupItem key={x.id} value={x.id} className="schema-chip">
        {value.includes(x.id) && <CheckIcon aria-hidden="true"/>}{x.namn}</ToggleGroupItem>)}
    </ToggleGroup>
  </div>;
}

/** Rubrik och text för ett fälts villkor: samma text som i villkorsformuläret, vem det gäller och hur många pass som ligger på det nu. */
export function kallaText(k: SchemaKalla, villkor: SchemaVillkor, resurser: Resurser): { title: string; lines: string[] } {
  const pass = (n: number) => `${n} pass`;
  if (k.typ === 'egen') {
    const r = villkor.egna[k.index];
    if (!r) return { title: 'Villkoret finns inte längre', lines: [] };
    return { title: `${REGEL[r.typ]} för ${k.namn}`, lines: [`${ruleText(r, resurser)}.`, `Eget villkor ${k.index + 1}. Berör ${pass(k.beror)} just nu.`] };
  }
  if (k.typ === 'skoldag') return { title: 'Skoldagen', lines: [`Skoldag ${daysText(villkor.days)}.`, `Villkor för schemat. ${k.beror ? `${pass(k.beror)} i veckan ligger utanför.` : 'Inga pass i veckan ligger utanför.'}`] };
  if (k.typ === 'lunch') {
    const l = villkor.lunch;
    return { title: 'Lunchfönster', lines: [l ? `Lunch ${l.lengthMin} min mellan ${clock(l.startMin)} och ${clock(l.endMin)}${l.teachers ? ', även för lärare' : ''}.` : 'Ingen lunch.', 'Villkor för schemat.'] };
  }
  const late = villkor.lateAfterMin;
  return { title: 'Sena pass', lines: [late === null ? 'Sena pass undviks inte.' : `Pass efter ${clock(late)} undviks.`, `Villkor för schemat. ${k.beror ? `${pass(k.beror)} i veckan slutar senare.` : 'Inga pass i veckan slutar senare.'}`] };
}

/** Ett fält som visar sitt villkor när man pekar på det eller väljer det (Enter). Esc stänger och lämnar fokus på fältet. */
export function FaltKalla({ label, kalla, villkor, resurser, children, onAndra, onTaBort }: {
  label: string; kalla: SchemaKalla; villkor: SchemaVillkor; resurser: Resurser; children: ReactNode;
  onAndra: (k: SchemaKalla) => void; onTaBort: (k: Extract<SchemaKalla, { typ: 'egen' }>) => void;
}) {
  const { title, lines } = kallaText(kalla, villkor, resurser), [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger openOnHover delay={250} closeDelay={150} className="schema-falt-knapp" aria-label={`${label}. Visa villkoret`}>{children}</PopoverTrigger>
    <PopoverContent side="right" align="start" className="schema-kalla">
      <PopoverHeader><PopoverTitle>{title}</PopoverTitle>
        {lines.map(x => <PopoverDescription key={x}>{x}</PopoverDescription>)}</PopoverHeader>
      <div className="schema-kalla-knappar">
        <Button type="button" variant="link" size="sm" onClick={() => { setOpen(false); onAndra(kalla); }}>Ändra</Button>
        {kalla.typ === 'egen' && <Button type="button" variant="link" size="sm" onClick={() => { setOpen(false); onTaBort(kalla); }}>Ta bort</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}

/**
 * Öppnar villkoret i villkorsformuläret: rutan "Villkor för schemat" fälls ut och fokus läggs på villkoret i listan över egna villkor,
 * eller på skoldagens, lunchens eller sena passens fält.
 */
export function visaVillkor(k: SchemaKalla): void {
  const box = document.querySelector<HTMLDetailsElement>('details.schema-villkor');
  if (!box) return;
  box.open = true;
  const field = (legend: string) => [...box.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === legend);
  const target: HTMLElement | null | undefined = k.typ === 'egen' ? box.querySelector<HTMLElement>(`ul[aria-label="Egna villkor"] > li:nth-child(${k.index + 1})`)
    : k.typ === 'skoldag' ? field('Skoldag')?.querySelector('input')
    : field(k.typ === 'lunch' ? 'Lunch' : 'Dagens längd')?.querySelector('input');
  if (!target) return;
  if (!target.matches('input, button, select')) target.tabIndex = -1;
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
}
