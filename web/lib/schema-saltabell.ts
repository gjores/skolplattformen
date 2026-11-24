/**
 * Salbehov som tabell med massändring (05.2-SM-UXF-22). Samma salbehov som formuläret: tabellen läser och skriver `villkor.salbehov`.
 * En massändring gäller befintliga undervisningar och skrivs som egna undantag; ämnets grundvärde ändras inte. Ändringen förhandsgranskas
 * med antal och undantag innan den används, och blir ett steg i Ångra.
 */
import { allmantSalbehov, gallandeSalbehov, lampligaSalar, type SchemaSalbehov, type SchemaSalbehovLage, type SchemaSalregister } from './schema-salregister.ts';

type Varde = Omit<SchemaSalbehov, 'slag' | 'ref'>;
type Villkor = { salregister?: SchemaSalregister; salbehov?: SchemaSalbehov[] };
export type SaltabellKalla = { fordelning: { ref: string; title: string; classes: string[] }[]; lessons: { sal?: { undervisning: string; elever: number | null; kalla?: 'eget' | 'amne' | 'standard' | null } }[] };
export type SaltabellRad = { ref: string; title: string; grupp: string; elever: number | null; behov: Varde | null; kalla: 'eget' | 'amne' | 'standard' | null;
  /** Antal lämpliga salar; `null` när salbehovet är obesvarat eller sal inte behövs. */ lampliga: number | null; kapacitetOkand: boolean; hinder: string | null };
export type SaltabellFilter = { sok: string; lage: 'alla' | 'obesvarat' | SchemaSalbehovLage | 'hinder' };
export type SalAndring = { typ: 'satt'; behov: Varde } | { typ: 'lagg_till' | 'ersatt' | 'ta_bort'; salar: string[] } | { typ: 'rensa' };
export type SalForhandsvisning = { andras: { ref: string; title: string; grupp: string; fore: Varde | null; efter: Varde | null; arvBryts: boolean }[];
  oforandrade: string[]; hoppasOver: { ref: string; title: string; grupp: string; skal: string }[] };

const varde = ({ lage, typ, utrustning, salar, onskad, form }: Varde): Varde => ({ lage, typ, utrustning, salar, onskad, form });
const nyckel = (b: Varde | null) => b === null ? '' : JSON.stringify({ ...varde(b), utrustning: [...b.utrustning].map(x => x.toLocaleLowerCase('sv')).sort(), salar: [...b.salar].sort(), onskad: [...b.onskad].sort() });

export function saltabellRader(kalla: SaltabellKalla, v: Villkor): SaltabellRad[] {
  const elever = new Map<string, number | null>();
  const standard = new Set<string>();
  for (const l of kalla.lessons) if (l.sal) {
    if (!elever.has(l.sal.undervisning)) elever.set(l.sal.undervisning, l.sal.elever);
    if (l.sal.kalla === 'standard') standard.add(l.sal.undervisning);
  }
  return kalla.fordelning.map(row => {
    const g = gallandeSalbehov(v.salbehov, row.ref, row.title) ?? (standard.has(row.ref) ? { behov: allmantSalbehov(row.ref), kalla: 'standard' as const } : null);
    const antal = elever.get(row.ref) ?? null;
    const urval = g && v.salregister && g.behov.lage !== 'ingen' ? lampligaSalar(v.salregister, g.behov, antal) : null;
    return { ref: row.ref, title: row.title, grupp: row.classes.join(', '), elever: antal, behov: g ? varde(g.behov) : null, kalla: g?.kalla ?? null,
      lampliga: urval ? urval.tillatna.length : null, kapacitetOkand: urval ? Object.values(urval.kapacitet).some(k => k === 'okand') : false, hinder: urval?.hinder ?? null };
  });
}
export function saltabellFiltrera(rader: SaltabellRad[], filter: SaltabellFilter): SaltabellRad[] {
  const sok = filter.sok.trim().toLocaleLowerCase('sv');
  return rader.filter(r => (!sok || `${r.title} ${r.grupp}`.toLocaleLowerCase('sv').includes(sok))
    && (filter.lage === 'alla' || (filter.lage === 'obesvarat' ? r.behov === null : filter.lage === 'hinder' ? r.hinder !== null : r.behov?.lage === filter.lage)));
}
/** Nuvarande värden bland de valda, för beskedet om blandade värden. */
export function saltabellVarden(rader: SaltabellRad[]): Record<'obesvarat' | SchemaSalbehovLage, number> {
  const antal = { obesvarat: 0, allman: 0, sarskild: 0, ingen: 0 };
  for (const r of rader) antal[r.behov?.lage ?? 'obesvarat']++;
  return antal;
}

/**
 * Vad ändringen gör med de valda raderna, utan att ändra något. Tillägg, ersättning och borttagning av salalternativ gäller bestämda salar i
 * Särskilda salskrav; en rad med annat salbehov hoppas över med skäl i stället för att byta läge i tysthet.
 */
export function forhandsgranskaSalandring(valda: SaltabellRad[], andring: SalAndring): SalForhandsvisning {
  const result: SalForhandsvisning = { andras: [], oforandrade: [], hoppasOver: [] };
  for (const r of valda) {
    const skip = (skal: string) => { result.hoppasOver.push({ ref: r.ref, title: r.title, grupp: r.grupp, skal }); };
    let efter: Varde | null;
    if (andring.typ === 'satt') efter = varde(andring.behov);
    else if (andring.typ === 'rensa') { if (r.kalla !== 'eget') { result.oforandrade.push(r.ref); continue; } efter = null; }
    else {
      if (r.behov && r.behov.lage !== 'sarskild') { skip(r.behov.lage === 'allman' ? 'Har Lämplig allmän sal. Använd Sätt salbehov för att byta till särskilda krav.' : 'Sal behövs inte. Använd Sätt salbehov för att byta.'); continue; }
      const nu = r.behov?.salar ?? [];
      const salar = andring.typ === 'ersatt' ? [...andring.salar] : andring.typ === 'lagg_till' ? [...nu, ...andring.salar.filter(id => !nu.includes(id))] : nu.filter(id => !andring.salar.includes(id));
      if (!r.behov && andring.typ === 'ta_bort') { result.oforandrade.push(r.ref); continue; }
      const next: Varde = r.behov ? { ...varde(r.behov), salar, onskad: r.behov.onskad } : { lage: 'sarskild', typ: null, utrustning: [], salar, onskad: [], form: null };
      if (next.typ === null && !next.utrustning.length && !next.salar.length) { skip('Skulle bli utan krav. Sätt ett annat salbehov i stället.'); continue; }
      efter = next;
    }
    // Ett ärvt värde som får samma eget värde räknas som ändrat bara om värdet skiljer sig; att bara byta källa är ingen ändring för användaren.
    if (nyckel(efter) === nyckel(r.behov) && !(andring.typ === 'rensa')) { result.oforandrade.push(r.ref); continue; }
    result.andras.push({ ref: r.ref, title: r.title, grupp: r.grupp, fore: r.behov, efter, arvBryts: r.kalla === 'amne' && efter !== null });
  }
  return result;
}
/** Skriver förhandsvisningens ändringar som egna undantag per undervisning. `rensa` tar bort undantaget, så att ämnets värde gäller igen. */
export function tillampaSalandring<V extends Villkor>(v: V, visning: SalForhandsvisning): V {
  const andrade = new Map(visning.andras.map(a => [a.ref, a.efter]));
  const kvar = (v.salbehov ?? []).filter(b => !(b.slag === 'undervisning' && andrade.has(b.ref)));
  const nya = visning.andras.flatMap((a): SchemaSalbehov[] => a.efter ? [{ slag: 'undervisning', ref: a.ref, ...a.efter }] : []);
  return { ...v, salbehov: [...kvar, ...nya] };
}

const LAGE_NAMN: Record<SchemaSalbehovLage, string> = { allman: 'Lämplig allmän sal', sarskild: 'Särskilda salskrav', ingen: 'Sal behövs inte' };
const FORM_NAMN: Record<string, string> = { utomhus: 'utomhus', annan_plats: 'annan plats', arbetsplats: 'arbetsplats', distans: 'distans', annat: 'annan form' };
/** Salbehovet i klartext, samma ord i formulär, tabell och förhandsgranskning. */
export function salbehovText(b: Varde | null, register?: SchemaSalregister): string {
  if (!b) return 'Obesvarat';
  if (b.lage === 'ingen') return `${LAGE_NAMN.ingen} · ${FORM_NAMN[b.form ?? 'annat']}`;
  const krav = [...(b.typ ? [b.typ.toLocaleLowerCase('sv')] : []), ...b.utrustning.map(u => u.toLocaleLowerCase('sv')), ...b.salar.map(id => register?.salar.find(s => s.id === id)?.name ?? id)];
  return krav.length ? `${LAGE_NAMN[b.lage]} · ${krav.join(', ')}` : LAGE_NAMN[b.lage];
}
export const salbehovLageNamn = LAGE_NAMN;
export function lampligaText(r: SaltabellRad): string {
  if (r.behov === null) return 'Inte bedömt';
  if (r.behov.lage === 'ingen') return '–';
  if (r.hinder) return 'Ingen lämplig sal';
  return r.lampliga === null ? 'Inte bedömt' : `${r.lampliga}${r.kapacitetOkand ? ' · kapacitet inte kontrollerad' : ''}`;
}
