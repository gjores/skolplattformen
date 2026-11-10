// Regelkoder för paritet mellan SQL och modell (LASAR-03). En kod per fel- och
// varningsregel som summarize och gruppreglerna i lasar-model.ts har i dag.
// SQL-funktionen för reglerna (plan 06) ger samma koder; koderna kopplas till
// summarize i plan 07, efter grinden, eftersom lasar-model.ts är en bunden
// provkälla för 05.1. Ordningen följer modellens ordning.
export type LasarRuleLevel = 'error' | 'warning';
export type LasarRuleScope = 'läsår' | 'grupp';
export type LasarRule = { levels: readonly LasarRuleLevel[]; scope: LasarRuleScope; text: string };

export const LASAR_RULE_CODES = {
  school_days_min: { levels: ['error'], scope: 'läsår', text: 'Minst 178 skoldagar (Skolförordningen 3 kap. 2 §).' },
  holidays_min: { levels: ['error'], scope: 'läsår', text: 'Minst 12 lovdagar (Skolförordningen 3 kap. 2 §).' },
  study_days_max: { levels: ['error'], scope: 'läsår', text: 'Högst fem studiedagar (Skolförordningen 3 kap. 2 §).' },
  term_start_august: { levels: ['error'], scope: 'läsår', text: 'Läsåret börjar i augusti (Skolförordningen 3 kap. 3 §).' },
  term_end_june: { levels: ['error'], scope: 'läsår', text: 'Läsåret slutar i juni, gymnasieskolan senast i juni.' },
  term_order: { levels: ['error'], scope: 'läsår', text: 'Höstterminen slutar före vårterminen börjar, och ingen termin är omvänd.' },
  gy_weeks: { levels: ['error', 'warning'], scope: 'läsår', text: 'Gymnasieskolans läsår omfattar 40 veckor (Gymnasieförordningen 3 kap. 1 §). Fel när skolan bara har gymnasieskola, varning när den också har grundskola.' },
  term_edge_holiday: { levels: ['warning'], scope: 'läsår', text: 'En terminskant ligger på en helg eller allmän helgdag.' },
  weekday_balance: { levels: ['warning'], scope: 'läsår', text: 'Skoldagarna är ojämnt fördelade över veckodagarna (skillnad på fyra eller fler).' },
  long_run: { levels: ['warning'], scope: 'läsår', text: 'Fler än 60 skoldagar i följd utan lov.' },
  study_day_note: { levels: ['warning'], scope: 'läsår', text: 'En studiedag saknar anteckning om vad personalen gör.' },
  short_week_column: { levels: ['error'], scope: 'grupp', text: 'Fyra skoldagar i veckan bara för årskurs 1 eller 2 (Skolförordningen 3 kap. 4 § andra stycket).' },
  short_week_reason: { levels: ['error'], scope: 'grupp', text: 'Fyra skoldagar i veckan kräver angivna särskilda skäl.' },
  group_other_note: { levels: ['error'], scope: 'grupp', text: 'En gruppdag med orsaken annat kräver en anteckning.' },
  group_days_min: { levels: ['warning'], scope: 'grupp', text: 'Gruppen har färre än 178 undervisningsdagar medan skolan har minst 178.' },
} as const satisfies Record<string, LasarRule>;

export type LasarRuleCode = keyof typeof LASAR_RULE_CODES;
