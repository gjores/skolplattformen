/**
 * Lägesbild i tre delar (05.2-SM-UXF-12): tid, sal och kapacitet har var sin betydelse och slås aldrig ihop till en klarstatus.
 * Ett pass som ska ha sal har tillåtna salar (`roomIds`). Ett undervisningspass utan tillåtna salar saknar besvarat salbehov,
 * om det inte uttryckligen är märkt att sal inte behövs (`sal.lage === 'ingen'`, 05.2-SM-UXF-21). Egna aktiviteter utan sal räknas inte som lucka.
 */
import type { SchemaForslagLesson } from './schema-contract.ts';

export type SchemaLage = {
  tid: { lagda: number; alla: number };
  sal: { skaHaSal: number; medSal: number; utanSalbehov: number; hinder: number };
  kapacitet: { kontrollerad: number; forLiten: number; ejKontrollerad: number };
};
export type SchemaLagesBricka = { omrade: 'tid' | 'sal' | 'kapacitet'; ton: 'success' | 'warning' | ''; text: string };
type Pass = Pick<SchemaForslagLesson, 'day' | 'roomIds' | 'roomId' | 'egenAktivitet'> & { sal?: { lage: 'allman' | 'sarskild' | 'ingen' | 'aldre' | 'obesvarat'; hinder?: string | boolean; kapacitet?: Record<string, 'racker' | 'for_liten' | 'okand'> } };

export function schemaLage(lessons: Pass[]): SchemaLage {
  const lage: SchemaLage = { tid: { lagda: 0, alla: lessons.length }, sal: { skaHaSal: 0, medSal: 0, utanSalbehov: 0, hinder: 0 }, kapacitet: { kontrollerad: 0, forLiten: 0, ejKontrollerad: 0 } };
  for (const l of lessons) {
    const lagd = l.day !== null;
    if (lagd) lage.tid.lagda++;
    if (l.sal?.hinder) lage.sal.hinder++;
    if (l.roomIds.length === 0) { if (!l.egenAktivitet && l.sal?.lage !== 'ingen' && !l.sal?.hinder) lage.sal.utanSalbehov++; continue; }
    lage.sal.skaHaSal++;
    if (!lagd || l.roomId === null) continue;
    lage.sal.medSal++;
    const k = l.sal?.kapacitet?.[l.roomId] ?? 'okand';
    if (k === 'racker') lage.kapacitet.kontrollerad++; else if (k === 'for_liten') { lage.kapacitet.kontrollerad++; lage.kapacitet.forLiten++; } else lage.kapacitet.ejKontrollerad++;
  }
  return lage;
}

const pass = (n: number) => `${n} pass`;
/** Tre besked med text. Färgen bär aldrig betydelsen ensam; neutral ton betyder att ingenting är kontrollerat. */
export function schemaLagesBrickor(lage: SchemaLage): SchemaLagesBricka[] {
  const { tid, sal, kapacitet: k } = lage, delar: string[] = [];
  if (sal.skaHaSal > 0) delar.push(sal.medSal === sal.skaHaSal ? `Alla ${pass(sal.skaHaSal)} som ska ha sal har sal` : `${sal.medSal} av ${pass(sal.skaHaSal)} som ska ha sal har sal`);
  if (sal.hinder > 0) delar.push(`ingen lämplig sal finns för ${pass(sal.hinder)}`);
  if (sal.utanSalbehov > 0) delar.push(`salbehov saknas för ${pass(sal.utanSalbehov)}`);
  const salText = delar.length ? delar.join(', ') : 'Inga pass ska ha sal';
  return [
    { omrade: 'tid', ton: tid.alla > 0 && tid.lagda === tid.alla ? 'success' : 'warning', text: tid.alla === 0 ? 'Tid · Inga pass i underlaget' : tid.lagda === tid.alla ? 'Tid · Alla pass har tid' : `Tid · ${tid.lagda} av ${pass(tid.alla)} har tid` },
    { omrade: 'sal', ton: sal.skaHaSal > 0 && sal.medSal === sal.skaHaSal && !sal.utanSalbehov && !sal.hinder ? 'success' : sal.skaHaSal === 0 && !sal.utanSalbehov && !sal.hinder ? '' : 'warning',
      text: `Sal · ${salText.charAt(0).toUpperCase()}${salText.slice(1)}` },
    { omrade: 'kapacitet', ton: k.forLiten > 0 ? 'warning' : k.kontrollerad > 0 && k.ejKontrollerad === 0 ? 'success' : '',
      text: k.forLiten > 0 ? `Kapacitet · För få platser för ${pass(k.forLiten)}${k.ejKontrollerad ? `, ${k.ejKontrollerad} inte kontrollerade` : ''}`
        : k.kontrollerad + k.ejKontrollerad === 0 ? 'Kapacitet · Inga pass har sal att kontrollera'
        : k.ejKontrollerad === 0 ? `Kapacitet · Platserna räcker för ${pass(k.kontrollerad)}`
        : k.kontrollerad === 0 ? `Kapacitet · Inte kontrollerad för ${pass(k.ejKontrollerad)}` : `Kapacitet · Platserna räcker för ${pass(k.kontrollerad)}, ${k.ejKontrollerad} inte kontrollerade` },
  ];
}
