'use client';
// Vyväljaren i arbetsytan (05.2-SM-PASSTABELL, research Q131): Vecka, Pass i tabell och Villkor i tabell. Vyerna visar samma utkast:
// markering, flytt, ångra och kontroll gäller alla. Valet minns i webbläsaren. Villkor i tabell (05.2-SM-VILLKORSTABELL) kopplas in med propen `villkor`;
// utan den visas inte valet.
import type { ReactNode } from 'react';
import { CalendarDaysIcon, ListIcon, Rows3Icon, TableIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type SchemaVy = 'vecka' | 'pass' | 'villkor' | 'samling';
const VY_KEY = 'schema-vy';
const VYER: { id: SchemaVy; namn: string; ikon: ReactNode }[] = [
  { id: 'vecka', namn: 'Vecka', ikon: <CalendarDaysIcon aria-hidden="true"/> },
  { id: 'pass', namn: 'Pass i tabell', ikon: <ListIcon aria-hidden="true"/> },
  { id: 'villkor', namn: 'Villkor i tabell', ikon: <TableIcon aria-hidden="true"/> },
  // Samlingsvyn (05.2-SM-SAMLINGSVY): flera scheman samtidigt. Kopplas in med propen `samling`; utan den visas inte valet.
  { id: 'samling', namn: 'Samlingsvy', ikon: <Rows3Icon aria-hidden="true"/> },
];

/** Vyn som valdes senast i den här webbläsaren. Utan lagring, eller med ett okänt värde, visas veckan. */
export function storedVy(): SchemaVy {
  try {
    const value = window.localStorage.getItem(VY_KEY);
    return value === 'pass' || value === 'villkor' || value === 'samling' ? value : 'vecka';
  } catch { return 'vecka'; }
}
export function rememberVy(vy: SchemaVy): void {
  try { window.localStorage.setItem(VY_KEY, vy); } catch { /* utan lagring gäller valet tills sidan lämnas */ }
}

/** Vyn som visas: ett minnet val av Villkor i tabell visar veckan när den vyn inte finns. */
export const visadVy = (vy: SchemaVy, harVillkor: boolean): SchemaVy => vy === 'villkor' && !harVillkor ? 'vecka' : vy;

/**
 * Väljaren och den valda vyn under den. `villkor` är vyn Villkor i tabell; saknas den visas inte valet, och ett minnet val av den visar veckan.
 * Vyn som inte visas ritas inte, så att veckans och tabellens pass inte finns två gånger på sidan.
 */
export function Vyval({ vy, onVy, vecka, veckaVal, pass, villkor, samling }: {
  vy: SchemaVy; onVy: (vy: SchemaVy) => void; vecka: ReactNode;
  /** Veckans val (Klass eller Lärare) står i samma rad som väljaren, så att veckan inte flyttas ned. */
  veckaVal?: ReactNode;
  pass: ReactNode; villkor?: ReactNode; samling?: ReactNode;
}) {
  const vyer = VYER.filter(v => (v.id !== 'villkor' || villkor !== undefined) && (v.id !== 'samling' || samling !== undefined));
  const visad = vy === 'samling' && samling === undefined ? 'vecka' : visadVy(vy, villkor !== undefined);
  return <>
    <div className="schema-filter schema-vyval">
      <ToggleGroup aria-label="Visa schemat som" variant="outline" spacing={0} className="schema-verktyg-grupp" value={[visad]}
        onValueChange={next => { const valt = next.find(x => x !== visad); if (valt) { onVy(valt as SchemaVy); rememberVy(valt as SchemaVy); } }}>
        {vyer.map(v => <ToggleGroupItem key={v.id} value={v.id} className="schema-verktyg-knapp">{v.ikon}{v.namn}</ToggleGroupItem>)}
      </ToggleGroup>
      {visad === 'vecka' && veckaVal}
    </div>
    {visad === 'vecka' ? vecka : visad === 'pass' ? pass : visad === 'samling' ? samling : villkor}
  </>;
}
