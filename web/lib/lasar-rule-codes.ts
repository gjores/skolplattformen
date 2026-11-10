// Regelkoder för paritet mellan SQL och modell (LASAR-03). Gränssnitt; koderna läggs in i nästa steg.
export type LasarRuleLevel = 'error' | 'warning';
export type LasarRuleScope = 'läsår' | 'grupp';
export type LasarRule = { levels: readonly LasarRuleLevel[]; scope: LasarRuleScope; text: string };
export const LASAR_RULE_CODES: Record<string, LasarRule> = {};
export type LasarRuleCode = keyof typeof LASAR_RULE_CODES;
