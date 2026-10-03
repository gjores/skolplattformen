// Analys av en programplan: fel mot regelverket, risker, sådant som måste kontrolleras manuellt
// och det som är uppfyllt. Fel hindrar inte att ett utkast sparas, men ska vara synliga och stoppar
// ett framtida fastställande. Bara regler som går att belägga med Skolverkets underlag tas med;
// övrigt redovisas som "Att kontrollera" i stället för att gissas.

import type { CatalogProgram, ProgramplanLevelRef } from './programplan-catalog.ts';
import { DIPLOMA_WORK_POINTS, INDIVIDUAL_CHOICE_POINTS, frameStatus, programFrame, type ProgramFrame } from './programplan-table.ts';

export type IssueCategory = 'fel' | 'risk' | 'info' | 'ok';
export type PlanPart = 'foundation' | 'programmeSpecific' | 'orientation' | 'specialization' | 'other' | 'meta';
export type PlanIssue = { id: string; category: IssueCategory; title: string; detail: string; part: PlanPart; rule: string; action: string | null };

export const categoryLabel: Record<IssueCategory, string> = { fel: 'Fel mot regelverk', risk: 'Risk', info: 'Att kontrollera', ok: 'Uppfyllt' };
export const categoryDescription: Record<IssueCategory, string> = {
  fel: 'Måste åtgärdas innan planen kan fastställas', risk: 'Kan ge problem för elever eller beslut',
  info: 'Kan inte kontrolleras automatiskt', ok: 'Kontroller utan anmärkning',
};
export const partLabel: Record<PlanPart, string> = {
  foundation: 'Gymnasiegemensamt', programmeSpecific: 'Programgemensamt', orientation: 'Inriktning',
  specialization: 'Programfördjupning', other: 'Individuellt val och gymnasiearbete', meta: 'Uppgifter',
};
export const categoryOrder: IssueCategory[] = ['fel', 'risk', 'info', 'ok'];

export type AnalysisInput = {
  program: CatalogProgram; orientationCode: string | null; refs: ProgramplanLevelRef[];
  startedOn: string | null; sourceFetched: string | null;
  /** Diagnoser från serverns kontroll av den sparade planen, redan formulerade som text. */
  serverNotes?: string[];
};
export type Analysis = { frame: ProgramFrame; issues: PlanIssue[]; counts: Record<IssueCategory, number> };

const fmt = (n: number) => n.toLocaleString('sv-SE');
const RULE_TOTAL = 'Skollagen bilaga 2 · programstruktur';
const RULE_STRUCTURE = 'Skolverkets programstruktur';

export function analyseProgramplan(input: AnalysisInput): Analysis {
  const { program, orientationCode, refs } = input;
  const frame = programFrame(program, orientationCode);
  const status = frameStatus(frame, refs);
  const issues: PlanIssue[] = [];
  const add = (issue: PlanIssue) => issues.push(issue);

  if (frame.unresolved === 'orientation') {
    add({ id: 'orientation-missing', category: 'fel', title: 'Inriktning saknas', detail: 'Programmet har inriktningar men ingen är vald. Poängramen för programfördjupning kan inte räknas ut.', part: 'orientation', rule: RULE_STRUCTURE, action: 'Välj inriktning' });
  } else if (frame.unresolved === 'total') {
    add({ id: 'total-unverified', category: 'info', title: 'Poängramen kan inte kontrolleras', detail: `Yrkesprogram omfattar 2 700 eller 2 800 poäng och underlaget anger inte vilket. Programfördjupningen (${fmt(status.chosen)} poäng) jämförs därför inte mot en gräns.`, part: 'specialization', rule: RULE_TOTAL, action: null });
  } else if (status.over) {
    add({ id: 'specialization-over', category: 'fel', title: 'Programfördjupningen ryms inte i ramen', detail: `${fmt(status.chosen)} poäng valda, högst ${fmt(status.room!)} får väljas. Ta bort ${fmt(status.chosen - status.room!)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: 'Ta bort nivåer' });
  } else if (status.remaining! > 0) {
    add({ id: 'specialization-under', category: 'risk', title: 'Outnyttjat utrymme', detail: `${fmt(status.remaining!)} poäng programfördjupning är inte fördelade. Eleverna når inte programmets ${fmt(frame.total!)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: 'Lägg till nivå' });
  }

  for (const section of frame.sections) {
    const optional = section.rows.filter(r => r.note === 'Alternativ — en av dem läses');
    if (optional.length > 1) {
      add({ id: `alternatives-${section.id}`, category: 'info', title: `Alternativ: ${optional.map(r => r.subjectName).join(' eller ')}`, detail: 'Programstrukturen anger alternativa ämnen. Kontrollera att skolan erbjuder det alternativ eleverna behöver.', part: section.id, rule: RULE_STRUCTURE, action: null });
    }
    for (const row of section.rows.filter(r => r.note === 'Nivåer saknas i underlaget')) {
      add({ id: `levels-${section.id}-${row.key}`, category: 'risk', title: `${row.subjectName}: nivåer saknas`, detail: `Underlaget anger ${fmt(row.points)} poäng men inga nivåer. Skolan behöver bestämma vilka nivåer som erbjuds.`, part: section.id, rule: RULE_STRUCTURE, action: null });
    }
  }

  if (!input.startedOn) {
    add({ id: 'start-missing', category: 'risk', title: 'Utbildningens startdatum saknas', detail: 'Utkastet kan sparas, men planen kan inte kopplas till rätt underlag eller fastställas utan startdatum.', part: 'meta', rule: 'Krav för fastställande', action: 'Ange datum' });
  }
  for (const [index, note] of (input.serverNotes ?? []).entries()) {
    add({ id: `server-${index}`, category: 'info', title: 'Kontroll från servern', detail: note, part: 'meta', rule: RULE_STRUCTURE, action: null });
  }
  add({ id: 'points-not-time', category: 'info', title: 'Poäng är inte undervisningstid', detail: 'Kontrollera att timplanen ger eleverna garanterad undervisningstid.', part: 'meta', rule: 'Gymnasieförordningen 4 kap. 22 §', action: null });
  if (input.sourceFetched) {
    add({ id: 'source', category: 'info', title: 'Underlag från Skolverket', detail: `Ämnen och nivåer hämtade ${input.sourceFetched}. Kontrollera att underlaget gäller utbildningens elevkull.`, part: 'meta', rule: 'Skolverkets API', action: null });
  }

  if (frame.specializationRoom !== null && !status.over && status.chosen > 0) {
    add({ id: 'specialization-ok', category: 'ok', title: 'Programfördjupning inom ramen', detail: `${fmt(status.chosen)} av ${fmt(frame.specializationRoom)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: null });
  }
  const orientation = frame.sections.find(s => s.id === 'orientation');
  if (orientation) add({ id: 'orientation-ok', category: 'ok', title: 'Inriktningens ämnen följer programstrukturen', detail: `${fmt(orientation.points)} poäng enligt underlaget.`, part: 'orientation', rule: RULE_STRUCTURE, action: null });
  add({ id: 'other-ok', category: 'ok', title: 'Individuellt val och gymnasiearbete avsatta', detail: `${INDIVIDUAL_CHOICE_POINTS} + ${DIPLOMA_WORK_POINTS} poäng.`, part: 'other', rule: RULE_STRUCTURE, action: null });

  issues.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
  const counts = { fel: 0, risk: 0, info: 0, ok: 0 } as Record<IssueCategory, number>;
  for (const issue of issues) counts[issue.category]++;
  return { frame, issues, counts };
}
