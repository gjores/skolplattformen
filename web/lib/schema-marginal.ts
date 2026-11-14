// Marginal före och efter pass (05.2-SM-MARGINAL, N95–N104). Rena funktioner som underlaget, lagren i veckan och formuläret delar,
// så att motorn, veckan och förhandsvisningen räknar samma marginal för ett pass. Inget lagras.
import { SCHEMA_MARGINAL_DELAR, type SchemaMarginal, type SchemaMarginalDel, type SchemaRegel } from './schema-contract.ts';

/** Etiketterna i formuläret (Regler). "Omklädning före, dusch efter" ger olika text före och efter passet. */
export const SCHEMA_MARGINAL_ETIKETTER = ['Omklädning före, dusch efter', 'Restid', 'Städning', 'Övergång'] as const;
export const MARGINAL_DEL_NAMN: Record<SchemaMarginalDel, string> = { elever: 'Eleverna', larare: 'Läraren', sal: 'Salen' };

/** Texten före och efter passet. En etikett på formen "A före, B efter" delas; annars gäller samma text åt båda hållen. */
export function marginalEtiketter(label: string): { fore: string; efter: string } {
  const parts = /^(.+?) före, (.+?) efter$/iu.exec(label.trim());
  const cap = (x: string) => x.charAt(0).toLocaleUpperCase('sv-SE') + x.slice(1);
  return parts ? { fore: cap(parts[1]), efter: cap(parts[2]) } : { fore: label, efter: label };
}

/**
 * Ett eget villkor sparat i webbläsaren före 05.2-SM-MARGINAL: `{ typ: 'marginal', minutes }` (R4, marginal till nästa lektion) blir en marginal
 * efter passet som upptar alla och heter Övergång. Övriga villkor lämnas som de är.
 */
export function lasGammalMarginal(r: unknown): unknown {
  if (r === null || typeof r !== 'object' || (r as { typ?: unknown }).typ !== 'marginal' || !('minutes' in r)) return r;
  const { minutes, ...rest } = r as Record<string, unknown>;
  return { ...rest, beforeMin: 0, afterMin: minutes, occupies: [...SCHEMA_MARGINAL_DELAR], label: 'Övergång', visibleFor: [], when: 'alltid' };
}

/** Ett passs marginal för en part: minuter och text åt varje håll. */
export type PassMarginalSida = { fore: number; efter: number; foreLabel: string; efterLabel: string };
export type PassMarginal = Record<SchemaMarginalDel, PassMarginalSida>;

/**
 * Flera marginaler på samma pass läggs ihop per sida och part: den största gäller (N102). Texten kommer från den marginal som ger den största tiden
 * (den första vid lika). Villkor som inte är marginaler hoppas över.
 */
export function passMarginal(rules: SchemaRegel[]): PassMarginal {
  const out = Object.fromEntries(SCHEMA_MARGINAL_DELAR.map(del => [del, { fore: 0, efter: 0, foreLabel: '', efterLabel: '' }])) as PassMarginal;
  for (const r of rules) {
    if (r.typ !== 'marginal') continue;
    const text = marginalEtiketter(r.label);
    for (const del of r.occupies) {
      const x = out[del];
      if (r.beforeMin > x.fore) { x.fore = r.beforeMin; x.foreLabel = text.fore; }
      if (r.afterMin > x.efter) { x.efter = r.afterMin; x.efterLabel = text.efter; }
    }
  }
  return out;
}

/** Den största marginalen åt varje håll för de parter passet har. */
export function yttreMarginal(m: PassMarginal, delar: SchemaMarginalDel[]): { fore: number; efter: number } {
  return { fore: Math.max(0, ...delar.map(d => m[d].fore)), efter: Math.max(0, ...delar.map(d => m[d].efter)) };
}

/** Marginalens tider i klartext: "10 · 15 min", "– · 10 min". */
export function marginalTider(r: Pick<SchemaMarginal, 'beforeMin' | 'afterMin'>): string {
  return `${r.beforeMin || '–'} · ${r.afterMin || '–'} min`;
}
export function upptarText(occupies: SchemaMarginalDel[]): string {
  const ord: Record<SchemaMarginalDel, string> = { elever: 'elever', larare: 'lärare', sal: 'sal' };
  const text = SCHEMA_MARGINAL_DELAR.filter(d => occupies.includes(d)).map(d => ord[d]).join(', ');
  return text.charAt(0).toLocaleUpperCase('sv-SE') + text.slice(1);
}
