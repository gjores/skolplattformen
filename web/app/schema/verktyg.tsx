'use client';
// Verktygsfältet i veckan (05.2-SM-MENY, Main och Sparra): ett verktyg i taget. Verktyget ligger i utkastets `tool`.
// Lås och Byt byggs i SM-BYT och visas inaktiverade med förklaring tills dess. Telefonen får inga verktyg (schema.css).
import type { ReactNode } from 'react';
import { ArrowLeftRightIcon, BanIcon, CircleCheckIcon, InboxIcon, LockIcon, MousePointer2Icon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SchemaVerktyg } from '@/lib/schema-utkast.ts';

export const VERKTYG: { id: SchemaVerktyg; namn: string; ikon: ReactNode; senare?: boolean }[] = [
  { id: 'markera', namn: 'Markera', ikon: <MousePointer2Icon aria-hidden="true"/> },
  { id: 'sparra', namn: 'Spärra', ikon: <BanIcon aria-hidden="true"/> },
  { id: 'tillat', namn: 'Tillåt bara', ikon: <CircleCheckIcon aria-hidden="true"/> },
  { id: 'las', namn: 'Lås', ikon: <LockIcon aria-hidden="true"/>, senare: true },
  { id: 'viloyta', namn: 'Viloyta', ikon: <InboxIcon aria-hidden="true"/> },
  { id: 'byt', namn: 'Byt', ikon: <ArrowLeftRightIcon aria-hidden="true"/>, senare: true },
];

/** Vad verktyget gör, under verktygsfältet. */
const HJALP: Record<SchemaVerktyg, string> = {
  markera: 'Välj ett pass för att flytta det. Högerklick eller Skift+F10 öppnar menyn för ett pass, en tid eller ett villkor.',
  sparra: 'Dra över tid i en dag för att spärra den, eller välj en tid med piltangenterna och utöka med Skift+pil. Enter fortsätter.',
  tillat: 'Dra över tid i en dag där passen bara får ligga, eller välj en tid med piltangenterna och utöka med Skift+pil. Enter fortsätter.',
  las: '', byt: '',
  viloyta: 'Välj ett pass för att lägga det på viloytan.',
};
export const HJALP_ID = 'schema-verktyg-hjalp';

export function Verktygsfalt({ tool, disabled, onTool }: { tool: SchemaVerktyg; disabled: boolean; onTool: (tool: SchemaVerktyg) => void }) {
  return <div className="schema-verktyg">
    <ToggleGroup aria-label="Verktyg i schemat" variant="outline" spacing={0} className="schema-verktyg-grupp" value={[tool]} disabled={disabled}
      onValueChange={next => { const valt = next.find(x => x !== tool) ?? tool; onTool(valt as SchemaVerktyg); }}>
      {VERKTYG.map(v => <ToggleGroupItem key={v.id} value={v.id} disabled={v.senare} className="schema-verktyg-knapp"
        aria-describedby={v.senare ? 'schema-verktyg-senare' : undefined}>{v.ikon}{v.namn}</ToggleGroupItem>)}
    </ToggleGroup>
    <p id={HJALP_ID} className="schema-note">{HJALP[tool]} <span id="schema-verktyg-senare">Lås och Byt kommer i en senare version.</span></p>
  </div>;
}
