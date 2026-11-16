/** Fördelning av timplanens tid på lektioner per faktisk undervisning. Referenser stannar i appen; motorn får bara körningens löpnummer. */
import { SchemaContractError, type SchemaFordelningVal, type SchemaRegel } from './schema-contract.ts';

/** Ett verksamhetsfel som rutterna kan redovisa före den generiska kontraktsgrinden. */
export class SchemaFordelningError extends SchemaContractError {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(); this.name = 'SchemaFordelningError'; this.issues = issues;
    this.message = issues.join(' ');
  }
}

export const FORDELNING_REF = /^(?:undervisning|samlasning|valbart-block):[^\p{Cc}]+$/u;

/** En uttrycklig undervisning går före grupp, därefter klass och sist ämne. Olikheter inom samma högsta nivå är en konflikt, aldrig arrayordning. */
export function undervisningensAntal(ref: string, title: string, classes: string[], values: SchemaFordelningVal[], rules: SchemaRegel[], names: ReadonlyMap<string, string> = new Map()): number | undefined {
  const own = values.find(value => value.ref === ref);
  if (own) return own.antal;
  for (const slag of ['grupp', 'klass', 'amne'] as const) {
    const matches = rules.filter((rule): rule is Extract<SchemaRegel, { typ: 'antal' }> => rule.slag === slag && rule.typ === 'antal');
    if (!matches.length) continue;
    const counts = [...new Set(matches.map(rule => rule.count))].sort((a, b) => a - b);
    if (counts.length > 1) {
      const rows = [...new Set(matches.map(rule => `${names.get(rule.ref) ?? rule.ref}: ${rule.count} lektioner`))].sort((a, b) => a.localeCompare(b));
      throw new SchemaFordelningError([
        `${title}${classes.length ? ` (${classes.join(', ')})` : ''}: motstridiga antal lektioner på nivån ${slag === 'grupp' ? 'grupp' : slag === 'klass' ? 'klass' : 'ämne'} (${rows.join('; ')} per vecka). Välj ett gemensamt antal för undervisningen eller rätta de övergripande villkoren.`,
      ]);
    }
    return counts[0];
  }
  return undefined;
}
