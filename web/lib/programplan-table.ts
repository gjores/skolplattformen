// Tabell över ett programs ämnen och nivåer samt Skolverkets poängram för programfördjupning.
//
// Ramen följer Skolverkets programstruktur (Gy25): alla nationella program innehåller 200 poäng
// individuellt val och 100 poäng gymnasiearbete. Det som blir över när totalsumman minus de delarna
// och minus gymnasiegemensamma, programgemensamma och inriktningens ämnen är avräknade är utrymmet
// för programfördjupning. Skolverkets API anger inte detta utrymme, så det räknas här och visas öppet.
// Totalsumman är 2 500 poäng för högskoleförberedande program (skollagen bilaga 2, enligt Skolverkets
// rapport om garanterad undervisningstid). Yrkesprogram omfattar 2 700 eller 2 800 poäng, men
// underlaget anger inte vilket för varje program; där kan ramen inte kontrolleras och säger det.
// Ämnespoängen är kontrollerade mot programstrukturen för humanistiska programmet (bilaga 4, HU25).

import type { CatalogBlockSubject, CatalogProgram } from './programplan-catalog.ts';
import type { ProgramplanLevelRef } from './programplan-catalog.ts';

export const HIGHER_EDUCATION_TOTAL_POINTS = 2500;
export const INDIVIDUAL_CHOICE_POINTS = 200;
export const DIPLOMA_WORK_POINTS = 100;

export type TableRow = { key: string; subjectName: string; levelName: string | null; code: string | null; points: number; note: string | null };
export type TableSection = { id: 'foundation' | 'programmeSpecific' | 'orientation'; title: string; rows: TableRow[]; points: number };
export type ProgramFrame = {
  sections: TableSection[];
  fixedPoints: number;
  /** Programmets totala poäng enligt Skolverket, eller null när den inte är verifierad. */
  total: number | null;
  /** Poäng som får användas till programfördjupning, eller null när ramen inte kan räknas. */
  specializationRoom: number | null;
  /** Varför ramen saknas: inriktning ej vald, eller programmets totalsumma ej verifierad. */
  unresolved: 'orientation' | 'total' | null;
};

export function programTotal(program: CatalogProgram): number | null {
  return program.category === 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION' ? HIGHER_EDUCATION_TOTAL_POINTS : null;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Ett ämnes poäng: summan av dess nivåer, eller ämnets egen poäng när nivåer saknas i underlaget. */
export function subjectPoints(subject: CatalogBlockSubject): number {
  return subject.levels.length ? sum(subject.levels.map(l => l.points)) : subject.points;
}

/** Alternativa ämnen (till exempel Svenska eller Svenska som andraspråk) räknas en gång, med det största. */
export function blockPoints(subjects: CatalogBlockSubject[]): number {
  const alternatives = subjects.filter(s => s.optional).map(subjectPoints);
  return sum(subjects.filter(s => !s.optional).map(subjectPoints)) + (alternatives.length ? Math.max(...alternatives) : 0);
}

function rowsOf(subjects: CatalogBlockSubject[]): TableRow[] {
  return subjects.flatMap((subject): TableRow[] => {
    const note = subject.optional ? 'Alternativ — en av dem läses' : null;
    if (!subject.levels.length) {
      return [{ key: `${subject.code}`, subjectName: subject.name, levelName: null, code: null, points: subject.points, note: note ?? 'Nivåer saknas i underlaget' }];
    }
    return subject.levels.map(level => ({ key: level.code, subjectName: subject.name, levelName: level.name, code: level.code, points: level.points, note }));
  });
}

export function programFrame(program: CatalogProgram, orientationCode: string | null): ProgramFrame {
  const orientation = program.orientations.find(o => o.code === orientationCode) ?? null;
  const sections: TableSection[] = [
    { id: 'foundation', title: 'Gymnasiegemensamma ämnen', rows: rowsOf(program.foundation), points: blockPoints(program.foundation) },
    { id: 'programmeSpecific', title: 'Programgemensamma ämnen', rows: rowsOf(program.programmeSpecific), points: blockPoints(program.programmeSpecific) },
  ];
  if (orientation) sections.push({ id: 'orientation', title: `Inriktning: ${orientation.name}`, rows: rowsOf(orientation.subjects), points: blockPoints(orientation.subjects) });
  const fixedPoints = sum(sections.map(s => s.points));
  const needsOrientation = program.orientations.length > 0 && !orientation;
  const total = programTotal(program);
  const unresolved = needsOrientation ? 'orientation' : total === null ? 'total' : null;
  const room = total === null ? null : Math.max(total - INDIVIDUAL_CHOICE_POINTS - DIPLOMA_WORK_POINTS - fixedPoints, 0);
  return { sections, fixedPoints, total, specializationRoom: unresolved ? null : room, unresolved };
}

export type FrameStatus = { chosen: number; room: number | null; remaining: number | null; over: boolean };
export function frameStatus(frame: ProgramFrame, refs: ProgramplanLevelRef[]): FrameStatus {
  const chosen = sum(refs.map(r => r.points));
  const room = frame.specializationRoom;
  return { chosen, room, remaining: room === null ? null : room - chosen, over: room !== null && chosen > room };
}

/**
 * Kan nivån läggas till utan att gå utanför Skolverkets ram? Redan valda nivåer kan alltid tas bort.
 * Utan vald inriktning kan inget väljas; när bara totalsumman saknas begränsas valet av Skolverkets lista.
 */
export function canAddLevel(frame: ProgramFrame, refs: ProgramplanLevelRef[], points: number): boolean {
  if (frame.unresolved === 'orientation') return false;
  const room = frame.specializationRoom;
  return room === null || sum(refs.map(r => r.points)) + points <= room;
}
