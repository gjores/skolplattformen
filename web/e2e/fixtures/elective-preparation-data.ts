import artifact from '../../lib/programplan-catalog.generated.json' with { type: 'json' };
import { ELECTIVE_PREPARATION_VERSION, type ElectivePreparationRead } from '../../lib/elective-preparation';
export const pid = (n: number) => `75301700-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const scope = { unitId: pid(1), planId: pid(2), schoolYear: 2027, columnId: 'ar1' };
export const identity = 'synthetic-preparation';
export const read = (): ElectivePreparationRead => ({ ...scope, contractVersion: ELECTIVE_PREPARATION_VERSION, planName: 'SA27 – grundfördelning', planVersion: 1, planRevision: 4, catalogId: artifact.catalogId, schoolform: 'gymnasium', sourceHash: 'a'.repeat(64),
  frames: [{ rowKey: 'block:mosp', label: 'Moderna språk', kind: 'modernLanguage', pointsHt: 100, pointsVt: 100, needHt: 5400, needVt: 5400, needBasis: 'terms', allowedCodesByPoints: { '100': ['MODO1000X'] }, detailId: null, detailRevision: 0, appliedDetailRevision: null, existingBlocks: [] },
    { rowKey: 'block:iv1', label: 'Individuellt val', kind: 'individualChoice', pointsHt: 50, pointsVt: 50, needHt: 2700, needVt: 2700, needBasis: 'terms', allowedCodesByPoints: { '100': ['ENGE3000X'] }, detailId: null, detailRevision: 0, appliedDetailRevision: null, existingBlocks: [] }],
  classes: [{ classId: pid(3), className: 'SA27A', linkRevision: 1 }, { classId: pid(4), className: 'SA27B', linkRevision: 1 }], preparation: null, blockers: [] });
export const grScope = { ...scope, columnId: 'ak7' };
export const grRead = (): ElectivePreparationRead => ({ ...read(), ...grScope, schoolform: 'grundskola', catalogId: null, planName: 'Årskurs 7 – språkval', frames: [{ rowKey: 'sprakval', label: 'Språkval', kind: 'languageChoice', pointsHt: null, pointsVt: null, needHt: 1800, needVt: 1800, needBasis: 'even_split', allowedCodesByPoints: { null: ['GRGRMSP01'] }, detailId: null, detailRevision: 0, appliedDetailRevision: null, existingBlocks: [] }] });
export const journal = (s = scope) => `sp:elective-preparation:${identity}:${s.unitId}:${s.planId}:${s.schoolYear}:${s.columnId}`;
