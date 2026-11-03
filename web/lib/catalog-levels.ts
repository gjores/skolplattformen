import type { ProgramplanCatalog, ProgramplanLevelRef } from './programplan-catalog.ts';

/** GY grade-subject levels that are valid on a start date. Shared by programplanens valpaket and valplaner. */
export type CatalogLevel = ProgramplanLevelRef & { subjectName: string; itemName: string };
export function gyGradeLevels(catalog: ProgramplanCatalog, startedOn: string, subjectAllowed: (subjectCode: string) => boolean = () => true): CatalogLevel[] {
  return catalog.subjects.filter(s => s.schoolTypes.includes('GY') && s.typeOfSyllabus === 'GRADE_SUBJECT_SYLLABUS' && subjectAllowed(s.code)
    && s.startDate && startedOn >= s.startDate && (!s.endDate || startedOn <= s.endDate) && (!s.canceledDate || startedOn < s.canceledDate))
    .flatMap(s => s.items.map(i => ({ subjectCode: s.code, subjectVersion: s.version, itemCode: i.code, points: i.points, subjectName: s.name, itemName: i.name })));
}
export const catalogLevelKey = (level: Pick<ProgramplanLevelRef, 'subjectCode' | 'subjectVersion' | 'itemCode'>) => `${level.subjectCode}:${level.subjectVersion}:${level.itemCode}`;
/** Case-insensitive Swedish match on subject name, level name and code. */
export function searchCatalogLevels<T extends CatalogLevel>(levels: readonly T[], query: string, limit = 80): T[] {
  const q = query.trim().toLocaleLowerCase('sv');
  return levels.filter(l => !q || `${l.subjectName} ${l.itemName} ${l.itemCode}`.toLocaleLowerCase('sv').includes(q)).slice(0, limit);
}
