'use client';
// Vyväljaren i arbetsytan (05.2-SM-PASSTABELL, research Q131): Vecka, Pass i tabell och Villkor i tabell. Vyerna visar samma utkast:
// markering, flytt, ångra och kontroll gäller alla. Valet minns i webbläsaren. Villkor i tabell (05.2-SM-VILLKORSTABELL) kopplas in med propen `villkor`;
// utan den visas inte valet.
import type { ReactNode } from 'react';
import { CalendarDaysIcon, ListIcon, Rows3Icon, ScanEyeIcon, TableIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type SchemaVy = 'vecka' | 'folj' | 'samling' | 'pass' | 'villkor';
const VY_KEY = 'schema-vy';
const VYER: { id: SchemaVy; namn: string; ikon: ReactNode }[] = [
  { id: 'vecka', namn: 'Vecka', ikon: <CalendarDaysIcon aria-hidden="true"/> },
  { id: 'folj', namn: 'Följ passet', ikon: <ScanEyeIcon aria-hidden="true"/> },
  { id: 'samling', namn: 'Samlingsvy', ikon: <Rows3Icon aria-hidden="true"/> },
  { id: 'pass', namn: 'Pass i tabell', ikon: <ListIcon aria-hidden="true"/> },
  { id: 'villkor', namn: 'Villkor i tabell', ikon: <TableIcon aria-hidden="true"/> },
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
export const visadVy = (vy: SchemaVy, harVillkor: boolean, harSamling = false, harFolj = false): SchemaVy =>
  vy === 'villkor' && !harVillkor || vy === 'samling' && !harSamling || vy === 'folj' && !harFolj ? 'vecka' : vy;

/**
 * Väljaren och den valda vyn under den. `villkor` är vyn Villkor i tabell; saknas den visas inte valet, och ett minnet val av den visar veckan.
 * Vyn som inte visas ritas inte, så att veckans och tabellens pass inte finns två gånger på sidan.
 */
export function Vyval({ utlyft = false, vy, onVy, vecka, veckaVal, veckaVerktyg, folj, samling, pass, villkor, valtPass }: {
  utlyft?: boolean; vy: SchemaVy; onVy: (vy: SchemaVy) => void; vecka: ReactNode;
  /** Veckans resursval står intill vyknapparna när bredden räcker. */
  veckaVal?: ReactNode;
  veckaVerktyg?: ReactNode;
  valtPass?: ReactNode;
  pass: ReactNode; villkor?: ReactNode; samling?: ReactNode; folj?: ReactNode;
}) {
  const vyer = VYER.filter(v => (v.id !== 'villkor' || villkor !== undefined) && (v.id !== 'samling' || samling !== undefined) && (v.id !== 'folj' || folj !== undefined));
  const visad = visadVy(vy, villkor !== undefined, samling !== undefined, folj !== undefined);
  const innehall = visad === 'vecka' ? vecka : visad === 'folj' ? folj : visad === 'samling' ? samling : visad === 'pass' ? pass : villkor;
  return <>
    {!utlyft && <div className="schema-filter schema-vyval">
      <ToggleGroup aria-label="Visa schemat som" variant="outline" spacing={0} className="schema-verktyg-grupp" value={[visad]}
        onValueChange={next => { const valt = next.find(x => x !== visad); if (valt) { onVy(valt as SchemaVy); rememberVy(valt as SchemaVy); } }}>
        {vyer.map(v => <ToggleGroupItem key={v.id} value={v.id} aria-label={v.id === 'folj' ? 'Visa Följ passet' : undefined} className="schema-verktyg-knapp">{v.ikon}{v.namn}</ToggleGroupItem>)}
      </ToggleGroup>
      {visad === 'vecka' && veckaVal}
    </div>}
    {utlyft && visad === 'vecka' && <div className="schema-filter">{veckaVal}</div>}
    {visad === 'vecka' && veckaVerktyg}
    <div className={valtPass && (visad === 'vecka' || visad === 'pass') ? 'schema-arbetsvy med-pass' : 'schema-arbetsvy'}>
      <div className="schema-arbetsvy-innehall">{innehall}</div>
      {valtPass && <aside className="schema-passpanel" aria-label="Valt pass">{valtPass}</aside>}
    </div>
  </>;
}
