import type { CatalogBlockSubject, CatalogProgram, ProgramplanBasisReference } from './programplan-catalog.ts';
import { ProgramplanContractError } from './programplan-catalog.ts';

export type ProgramplanTermPoints = [number, number, number, number, number, number];
export type ProgramplanTermDistribution = { rowKey: string; points: ProgramplanTermPoints }[];
export type ProgramplanTermPart = 'foundation' | 'programmeSpecific' | 'orientation' | 'specialization' | 'individualChoice' | 'diplomaWork';
export type ProgramplanTermRow = { key: string; name: string; levelName: string; points: number; part: ProgramplanTermPart };
export const PROGRAMPLAN_TERMS = ['Åk 1 HT', 'Åk 1 VT', 'Åk 2 HT', 'Åk 2 VT', 'Åk 3 HT', 'Åk 3 VT'] as const;

/** Explicit national levels only. Alternatives and absent levels still require a separate subject choice. */
export function programplanTermRows(program: CatalogProgram, basis: ProgramplanBasisReference): ProgramplanTermRow[] {
  if (program.code !== basis.programRef.code || program.version !== basis.programRef.version) throw new ProgramplanContractError('invalid_programplan_terms');
  const orientation = basis.orientationCode === null ? null : program.orientations.find(o => o.code === basis.orientationCode);
  if ((!orientation && basis.orientationCode !== null) || (basis.orientationCode === null && program.orientations.length)) throw new ProgramplanContractError('invalid_programplan_terms');
  function fixed(subjects: CatalogBlockSubject[], part: ProgramplanTermPart): ProgramplanTermRow[] {
    return subjects.filter(s => !s.optional && s.subjectVersion !== null).flatMap(s => s.levels.map(l => ({
      key: `${part}:${s.code}:${s.subjectVersion}:${l.code}`, name: s.name, levelName: l.name, points: l.points, part,
    })));
  }
  const chosen = basis.specializationRefs.map(ref => {
    const s = program.specialization.find(s => s.code === ref.subjectCode && s.subjectVersion === ref.subjectVersion);
    const l = s?.levels.find(l => l.code === ref.itemCode && l.points === ref.points);
    if (!s || !l) throw new ProgramplanContractError('invalid_programplan_terms');
    return { key: `specialization:${s.code}:${s.subjectVersion}:${l.code}`, name: s.name, levelName: l.name, points: l.points, part: 'specialization' as const };
  });
  const rows = [...fixed(program.foundation, 'foundation'), ...fixed(program.programmeSpecific, 'programmeSpecific'),
    ...fixed(orientation?.subjects ?? [], 'orientation'), ...chosen,
    { key: 'meta:individualChoice', name: 'Individuellt val', levelName: 'Ram för individuellt val', points: 200, part: 'individualChoice' as const },
    { key: 'meta:diplomaWork', name: 'Gymnasiearbete', levelName: 'Gymnasiearbete', points: 100, part: 'diplomaWork' as const }];
  if (new Set(rows.map(r => r.key)).size !== rows.length) throw new ProgramplanContractError('invalid_programplan_terms');
  return rows;
}
export function validateProgramplanTermDistribution(rows: ProgramplanTermRow[], distribution: ProgramplanTermDistribution): void {
  const byKey = new Map(rows.map(r => [r.key, r]));
  const seen = new Set<string>();
  for (const d of distribution) {
    const row = byKey.get(d.rowKey);
    if (!row || seen.has(d.rowKey) || d.points.length !== 6 || d.points.some(p => !Number.isSafeInteger(p) || p < 0)
      || d.points.reduce((a, b) => a + b, 0) > row.points) throw new ProgramplanContractError('invalid_programplan_terms');
    seen.add(d.rowKey);
  }
}
export function programplanTermTotals(rows: ProgramplanTermRow[], distribution: ProgramplanTermDistribution) {
  validateProgramplanTermDistribution(rows, distribution);
  const terms: ProgramplanTermPoints = [0, 0, 0, 0, 0, 0];
  distribution.forEach(d => d.points.forEach((p, i) => { terms[i] += p; }));
  const total = rows.reduce((sum, r) => sum + r.points, 0), allocated = terms.reduce((a, b) => a + b, 0);
  return { terms, total, allocated, remaining: total - allocated };
}
