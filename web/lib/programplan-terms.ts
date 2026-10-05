import { programTotal } from './programplan-table.ts';
import { programplanChoiceBlocks, programplanAlternativeGroups } from './programplan-choice-blocks.ts';
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
  function alternatives(subjects: CatalogBlockSubject[], part: ProgramplanTermPart): ProgramplanTermRow[] {
    return basis.choiceBlocks === undefined ? [] : programplanAlternativeGroups(subjects).flatMap(group => group[0].levels.map((level, i) => ({
      key: `alternative:${part}:${group.map(s => `${s.code}:${s.subjectVersion}:${s.levels[i].code}`).join('+')}`,
      name: group.map(s => s.name.toLocaleLowerCase('sv')).join('/').replace(/^./u, c => c.toLocaleUpperCase('sv')),
      levelName: level.name, points: level.points, part,
    })));
  }
  const chosen = basis.specializationRefs.map(ref => {
    const s = program.specialization.find(s => s.code === ref.subjectCode && s.subjectVersion === ref.subjectVersion);
    const l = s?.levels.find(l => l.code === ref.itemCode && l.points === ref.points);
    if (!s || !l) throw new ProgramplanContractError('invalid_programplan_terms');
    return { key: `specialization:${s.code}:${s.subjectVersion}:${l.code}`, name: s.name, levelName: l.name, points: l.points, part: 'specialization' as const };
  });
  const rows = [...fixed(program.foundation, 'foundation'), ...alternatives(program.foundation, 'foundation'),
    ...fixed(program.programmeSpecific, 'programmeSpecific'), ...alternatives(program.programmeSpecific, 'programmeSpecific'),
    ...fixed(orientation?.subjects ?? [], 'orientation'), ...alternatives(orientation?.subjects ?? [], 'orientation'), ...chosen,
    ...programplanChoiceBlocks(program, basis).map(b => ({key: b.rowKey, name: b.name, levelName: 'Valbart block', points: b.points, part: b.part})),
    ...(basis.choiceBlocks === undefined ? [{ key: 'meta:individualChoice', name: 'Individuellt val', levelName: 'Ram för individuellt val', points: 200, part: 'individualChoice' as const }] : []),
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
/** Hela programmets poäng är målet även medan fördjupning ännu saknas i ett v2-utkast. */
export function programplanTermTarget(program: CatalogProgram, rows: ProgramplanTermRow[]): number {
  const rowTotal = rows.reduce((sum, row) => sum + row.points, 0);
  return rows.some(row => row.key.startsWith('block:')) ? programTotal(program) ?? rowTotal : rowTotal;
}
export function programplanTermTotals(rows: ProgramplanTermRow[], distribution: ProgramplanTermDistribution) {
  validateProgramplanTermDistribution(rows, distribution);
  const terms: ProgramplanTermPoints = [0, 0, 0, 0, 0, 0];
  distribution.forEach(d => d.points.forEach((p, i) => { terms[i] += p; }));
  const total = rows.reduce((sum, r) => sum + r.points, 0), allocated = terms.reduce((a, b) => a + b, 0);
  return { terms, total, allocated, remaining: total - allocated };
}

/** Nivåernas ordning inom varje ämne enligt underlaget, till exempel ENGE1000X före ENGE2000X. */
export function programplanLevelRanks(program: CatalogProgram): Map<string, number> {
  const ranks = new Map<string, number>();
  const blocks = [program.foundation, program.programmeSpecific, ...program.orientations.map(o => o.subjects), program.specialization];
  const counts = new Map<string, number>();
  for (const subjects of blocks) for (const s of subjects) for (const l of s.levels) {
    if (ranks.has(`${s.code}:${l.code}`)) continue;
    const next = counts.get(s.code) ?? 0; ranks.set(`${s.code}:${l.code}`, next); counts.set(s.code, next + 1);
  }
  for (const subjects of blocks) for (const group of programplanAlternativeGroups(subjects)) group[0].levels.forEach((level, i) => {
    ranks.set(`alternative:${group.map(s => `${s.code}:${s.subjectVersion}:${s.levels[i].code}`).join('+')}`, i);
  });
  return ranks;
}
export const programplanRowSubject = (row: ProgramplanTermRow) => row.key.startsWith('alternative:') ? `alternative:${row.key.split(':')[2]}` : row.key.startsWith('block:') ? row.key : row.key.split(':')[1];
const subjectOf = programplanRowSubject;
export const programplanRowRank = (row: ProgramplanTermRow, ranks: Map<string, number>) => row.key.startsWith('alternative:') ? ranks.get(`alternative:${row.key.split(':').slice(2).join(':')}`) ?? 0 : ranks.get(`${subjectOf(row)}:${row.key.split(':')[3]}`) ?? 0;
const halves = (points: number, year: number): ProgramplanTermPoints => {
  const p: ProgramplanTermPoints = [0, 0, 0, 0, 0, 0]; p[year * 2] = Math.floor(points / 2); p[year * 2 + 1] = points - Math.floor(points / 2); return p;
};
/** Första årskurs (0–2) som har poäng på raden, eller null. */
export function firstYear(points: ProgramplanTermPoints | undefined): number | null {
  if (!points) return null; const i = points.findIndex(p => p > 0); return i < 0 ? null : Math.floor(i / 2);
}
export function lastYear(points: ProgramplanTermPoints | undefined): number | null {
  if (!points) return null; for (let i = 5; i >= 0; i--) if (points[i] > 0) return Math.floor(i / 2); return null;
}

/**
 * Föreslår fördelning för rader som ännu saknar poäng. Redan fördelade rader rörs inte.
 * Nivåer läses i ordning, gymnasiegemensamt och programgemensamt från åk 1, inriktning och fördjupning från åk 2,
 * individuellt val i åk 2–3 och gymnasiearbete i åk 3. Ämnen med en enda nivå läggs där läsåret har minst poäng.
 */
export function suggestProgramplanTerms(rows: ProgramplanTermRow[], distribution: ProgramplanTermDistribution, ranks: Map<string, number>): ProgramplanTermDistribution {
  const result = new Map(distribution.map(d => [d.rowKey, [...d.points] as ProgramplanTermPoints]));
  const load = [0, 1, 2].map(y => distribution.reduce((s, d) => s + d.points[y * 2] + d.points[y * 2 + 1], 0));
  const put = (key: string, points: ProgramplanTermPoints) => { result.set(key, points); points.forEach((p, i) => { load[Math.floor(i / 2)] += p; }); };
  const empty = (row: ProgramplanTermRow) => !(result.get(row.key)?.some(p => p > 0));
  const base: Record<ProgramplanTermPart, number> = { foundation: 0, programmeSpecific: 0, orientation: 1, specialization: 1, individualChoice: 1, diplomaWork: 2 };
  for (const row of rows.filter(r => r.part === 'diplomaWork' && empty(r))) put(row.key, halves(row.points, 2));
  for (const row of rows.filter(r => r.part === 'individualChoice' && empty(r))) {
    const first = Math.floor(row.points / 2), p: ProgramplanTermPoints = [0, 0, 0, 0, 0, 0];
    p[2] = Math.floor(first / 2); p[3] = first - p[2]; const second = row.points - first; p[4] = Math.floor(second / 2); p[5] = second - p[4]; put(row.key, p);
  }
  const subjects = new Map<string, ProgramplanTermRow[]>();
  for (const row of rows.filter(r => r.part !== 'diplomaWork' && r.part !== 'individualChoice')) subjects.set(subjectOf(row), [...(subjects.get(subjectOf(row)) ?? []), row]);
  const single: ProgramplanTermRow[] = [];
  for (const levels of subjects.values()) {
    levels.sort((a, b) => programplanRowRank(a, ranks) - programplanRowRank(b, ranks));
    if (levels.length === 1 && (levels[0].part === 'foundation' || levels[0].part === 'programmeSpecific')) { if (empty(levels[0])) single.push(levels[0]); continue; }
    let previous = -1;
    for (const row of levels) {
      if (!empty(row)) { previous = lastYear(result.get(row.key)) ?? previous; continue; }
      const year = Math.min(2, Math.max(base[row.part], previous + 1)); put(row.key, halves(row.points, year)); previous = year;
    }
  }
  for (const row of single.sort((a, b) => b.points - a.points)) {
    const year = [0, 1, 2].reduce((best, y) => load[y] < load[best] ? y : best, base[row.part]);
    put(row.key, halves(row.points, year));
  }
  return rows.flatMap(row => { const p = result.get(row.key); return p && p.some(n => n > 0) ? [{ rowKey: row.key, points: p }] : []; });
}
