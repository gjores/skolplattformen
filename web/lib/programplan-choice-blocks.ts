import { ProgramplanContractError, type CatalogBlockSubject, type CatalogProgram, type ProgramplanBasisReference, type ProgramplanDiagnostic } from './programplan-catalog.ts';

export type ProgramplanChoiceBlockKind = 'modernLanguage' | 'languageSubject' | 'naturalScience' | 'specialization' | 'individualChoice';
export type ProgramplanChoiceBlock = { id: string; kind: ProgramplanChoiceBlockKind; points: number; name: string };
export type ResolvedProgramplanChoiceBlock = ProgramplanChoiceBlock & { part: 'programmeSpecific' | 'orientation' | 'specialization' | 'individualChoice'; rowKey: string };
const parts = { modernLanguage: 'programmeSpecific', languageSubject: 'orientation', naturalScience: 'orientation', specialization: 'specialization', individualChoice: 'individualChoice' } as const;
const slots = { MOSP: { id: 'mosp', kind: 'modernLanguage' }, SPRK: { id: 'sprk', kind: 'languageSubject' }, NAVE: { id: 'nave', kind: 'naturalScience' } } as const;
export function parseProgramplanChoiceBlocks(value: unknown): ProgramplanChoiceBlock[] {
  const bad = (): never => { throw new ProgramplanContractError('invalid_choice_blocks'); };
  const plain = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))
      || Object.getOwnPropertySymbols(v).length || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) bad();
    return v as Record<string, unknown>;
  };
  if (!Array.isArray(value) || value.length > 200 || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return (value as unknown[]).map((v, i) => {
    if (!Object.hasOwn(value as object, i)) bad();
    const r = plain(v), keys = ['id', 'kind', 'points', 'name'];
    if (Object.getOwnPropertyNames(r).length !== 4 || keys.some(k => !Object.hasOwn(r, k))
      || typeof r.id !== 'string' || !/^[a-z][a-z0-9]{0,15}$/u.test(r.id)
      || typeof r.kind !== 'string' || !Object.hasOwn(parts, r.kind)
      || typeof r.points !== 'number' || !Number.isSafeInteger(r.points) || r.points < 1 || r.points > 10000
      || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 1000) bad();
    return { id: r.id as string, kind: r.kind as ProgramplanChoiceBlockKind, points: r.points as number, name: r.name as string };
  });
}
export function defaultProgramplanChoiceBlocks(program: CatalogProgram, orientationCode: string | null): ProgramplanChoiceBlock[] {
  const orientation = program.orientations.find(o => o.code === orientationCode);
  const collect = (subjects: CatalogBlockSubject[]) => subjects.flatMap(s => {
    const slot = slots[s.code as keyof typeof slots];
    return slot && !s.levels.length ? [{ ...slot, points: s.points, name: s.name }] : [];
  });
  return [...collect(program.programmeSpecific), ...collect(orientation?.subjects ?? []), { id: 'iv1', kind: 'individualChoice', points: 200, name: 'Individuellt val' }];
}
export function programplanChoiceBlockDiagnostics(program: CatalogProgram, basis: ProgramplanBasisReference): ProgramplanDiagnostic[] {
  if (basis.choiceBlocks === undefined) return [];
  let blocks: ProgramplanChoiceBlock[];
  try { blocks = parseProgramplanChoiceBlocks(basis.choiceBlocks); } catch { return [{ code: 'invalid_choice_blocks' }]; }
  const diagnostics: ProgramplanDiagnostic[] = [];
  const required = defaultProgramplanChoiceBlocks(program, basis.orientationCode).filter(b => b.kind !== 'individualChoice');
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) diagnostics.push({ code: 'duplicate_choice_block' });
    seen.add(block.id);
    const slot = required.find(b => b.id === block.id);
    if (slot && (slot.kind !== block.kind || slot.points !== block.points || slot.name !== block.name)) diagnostics.push({ code: 'slot_block_mismatch' });
    if (!slot && (['mosp', 'sprk', 'nave'].includes(block.id) || !['specialization', 'individualChoice'].includes(block.kind))) diagnostics.push({ code: 'unexpected_slot_block' });
  }
  for (const slot of required) if (!blocks.some(b => b.id === slot.id)) diagnostics.push({ code: 'missing_slot_block' });
  if (blocks.filter(b => b.kind === 'individualChoice').reduce((sum, b) => sum + b.points, 0) !== 200) diagnostics.push({ code: 'individual_choice_points_mismatch' });
  return diagnostics;
}
export function programplanChoiceBlocks(program: CatalogProgram, basis: ProgramplanBasisReference): ResolvedProgramplanChoiceBlock[] {
  const diagnostics = programplanChoiceBlockDiagnostics(program, basis);
  if (diagnostics.length) throw new ProgramplanContractError(diagnostics[0].code);
  return (basis.choiceBlocks ?? []).map(b => ({ ...b, part: parts[b.kind], rowKey: `block:${b.id}` }));
}
/** Optional subjects represent alternatives when each position has the same points. */
export function programplanAlternativeGroups(subjects: CatalogBlockSubject[]): CatalogBlockSubject[][] {
  const groups: CatalogBlockSubject[][] = [];
  for (const subject of subjects.filter(s => s.optional && s.subjectVersion !== null && s.levels.length)) {
    const group = groups.find(g => g[0].levels.length === subject.levels.length && g[0].levels.every((l, i) => l.points === subject.levels[i].points));
    if (group) group.push(subject); else groups.push([subject]);
  }
  return groups.filter(g => g.length > 1);
}
