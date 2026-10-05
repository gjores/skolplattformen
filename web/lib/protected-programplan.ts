import { defaultProgramplanChoiceBlocks } from './programplan-choice-blocks.ts';
import { parseProgramplanBasisReference, type ProgramplanBasisReference, type ProgramplanLevelRef } from './programplan-catalog.ts';
import { parseProgramplanCloneReply, parseProgramplan, type Programplan } from './programplan-contract.ts';
import type { ProgramplanWorkspace, ProgramplanVersionSummary } from './programplan-workspace-contract.ts';

// A missing historical page is different from an education without a plan.
export function programplanSelectedId(workspace: ProgramplanWorkspace, explicitId: string | null, summaries = workspace.versions): string | null {
  if (explicitId) return explicitId;
  const { latestVersion, draftId } = workspace.education;
  if (latestVersion === 0) {
    if (draftId || workspace.versionCount !== 0) throw new Error('Planernas underlag är inaktuellt.');
    return null;
  }
  if (draftId) return draftId;
  const latest = summaries.filter(v => v.version === latestVersion);
  if (latest.length !== 1) throw new Error('Den senaste planens exakta identitet saknas.');
  return latest[0].id;
}
export function assertProgramplanSummary(summary: ProgramplanVersionSummary | null, plan: Programplan): void {
  if (!summary || summary.id !== plan.id || summary.revision !== plan.revision || summary.version !== plan.version
    || summary.status !== plan.status || summary.catalogId !== plan.catalogId || summary.decidedOn !== plan.decidedOn
    || (summary.basisReference === null) !== (plan.basisReference === null)
    || (plan.basisReference && (!sameProgramplanPin(summary.basisReference, plan.basisReference)
      || !sameProgramplanLevels(summary.basisReference!.specializationRefs, plan.basisReference.specializationRefs)))) {
    throw new Error('Versionsunderlaget ändrades under läsningen.');
  }
}
export function programplanLevelName(ref: ProgramplanLevelRef, options: ProgramplanOption[]): string {
  const matches = options.filter(o => o.subjectCode === ref.subjectCode && o.subjectVersion === ref.subjectVersion && o.itemCode === ref.itemCode && o.points === ref.points);
  return matches.length === 1 ? `${matches[0].subjectName} · ${matches[0].name}` : ref.itemCode;
}

export type ProgramplanOption = ProgramplanLevelRef & { name: string; subjectName: string };
export const programplanStatus = { utkast: 'Utkast', faststalld: 'Fastställd', ersatt: 'Ersatt' } as const;
export function sameProgramplanLevels(a: ProgramplanLevelRef[], b: ProgramplanLevelRef[]): boolean {
  return a.length === b.length && a.every((r, i) => r.subjectCode === b[i].subjectCode && r.subjectVersion === b[i].subjectVersion
    && r.itemCode === b[i].itemCode && r.points === b[i].points);
}
export function sameProgramplanPin(a: ProgramplanBasisReference | null, b: ProgramplanBasisReference | null): boolean {
  return !!a && !!b && a.catalogId === b.catalogId && a.programRef.code === b.programRef.code && a.programRef.version === b.programRef.version
    && a.orientationCode === b.orientationCode && a.startedOn === b.startedOn
    && (a.choiceBlocks === undefined && b.choiceBlocks === undefined || !!a.choiceBlocks && !!b.choiceBlocks && a.choiceBlocks.length === b.choiceBlocks.length
      && a.choiceBlocks.every((block, i) => block.id === b.choiceBlocks![i].id && block.kind === b.choiceBlocks![i].kind && block.points === b.choiceBlocks![i].points && block.name === b.choiceBlocks![i].name));
}
export function programplanOptions(workspace: ProgramplanWorkspace): ProgramplanOption[] {
  const { catalog, education } = workspace;
  if (catalog.status !== 'selected' || !catalog.program) return [];
  const program = catalog.program;
  const orientation = program.orientations.find(o => o.code === education.orientationCode);
  const fixed = new Set([...program.foundation, ...program.programmeSpecific, ...(orientation?.subjects ?? [])].flatMap(s => s.levels.map(l => l.code)));
  return program.specialization.flatMap(block => {
    const subject = catalog.subjects.find(s => s.code === block.code && s.version === block.subjectVersion);
    return subject ? block.levels.filter(l => !fixed.has(l.code)).map(l => ({ subjectCode: subject.code, subjectVersion: subject.version,
      itemCode: l.code, points: l.points, name: l.name, subjectName: subject.name })) : [];
  });
}
export function programplanReference(option: ProgramplanLevelRef): ProgramplanLevelRef {
  return { subjectCode: option.subjectCode, subjectVersion: option.subjectVersion, itemCode: option.itemCode, points: option.points };
}
export function toggleProgramplanLevel(refs: ProgramplanLevelRef[], option: ProgramplanOption): ProgramplanLevelRef[] {
  const matches = (ref: ProgramplanLevelRef) => sameProgramplanLevels([ref], [option]);
  if (refs.some(matches)) return refs.filter(ref => !matches(ref));
  if (refs.length >= 200) return refs;
  return [...refs, programplanReference(option)];
}
export function groupProgramplanOptions(options: ProgramplanOption[], search = '') {
  const query = search.trim().toLocaleLowerCase('sv');
  const groups = new Map<string, { subjectCode: string; subjectVersion: number; subjectName: string; levels: ProgramplanOption[] }>();
  for (const option of options) {
    if (query && !`${option.subjectName} ${option.name} ${option.itemCode}`.toLocaleLowerCase('sv').includes(query)) continue;
    const key = `${option.subjectCode}:${option.subjectVersion}`;
    const group = groups.get(key) ?? { subjectCode: option.subjectCode, subjectVersion: option.subjectVersion, subjectName: option.subjectName, levels: [] };
    group.levels.push(option); groups.set(key, group);
  }
  return [...groups.values()];
}
export function resolveLegacyProgramplan(legacy: string[], options: ProgramplanOption[]) {
  const problems: string[] = [], refs: ProgramplanLevelRef[] = [], seen = new Set<string>();
  for (const code of legacy) {
    const matches = options.filter(o => o.itemCode === code);
    if (seen.has(code) || matches.length !== 1) problems.push(code);
    else refs.push(programplanReference(matches[0]));
    seen.add(code);
  }
  if (legacy.length > 200) problems.push('Fler än 200 äldre val');
  return { refs, problems };
}
export function newProgramplanBasis(workspace: ProgramplanWorkspace, startedOn: string, refs: ProgramplanLevelRef[]): ProgramplanBasisReference {
  const { catalog, education } = workspace;
  if (catalog.status !== 'selected' || !catalog.catalogId || !catalog.program) throw new Error('Välj ett tillgängligt katalogunderlag.');
  return parseProgramplanBasisReference({ catalogId: catalog.catalogId, programRef: { code: catalog.program.code, version: catalog.program.version },
    orientationCode: education.orientationCode, startedOn, specializationRefs: refs.map(programplanReference), choiceBlocks: defaultProgramplanChoiceBlocks(catalog.program, education.orientationCode) });
}
export type ProgramplanCommandKind = 'create' | 'bind' | 'replace' | 'clone';
export type ProgramplanDraft = {
  kind: ProgramplanCommandKind; offeringId: string; educationName: string; schoolName: string; planId: string | null; expectedRevision: number;
  expectedLatestVersion: number; pin: Omit<ProgramplanBasisReference, 'specializationRefs'>;
  startedOn: string; originalStart: string; refs: ProgramplanLevelRef[]; originalRefs: ProgramplanLevelRef[];
  sourceBound: boolean; legacyConfirmed: boolean; options: ProgramplanOption[];
  mode: 'edit' | 'refreshing' | 'refresh-failed' | 'compare' | 'applied'; error: string | null; mfa: boolean; uncertain: boolean;
};
export function programplanCommand(draft: ProgramplanDraft) {
  const basis = parseProgramplanBasisReference({ ...draft.pin, startedOn: draft.startedOn, specializationRefs: draft.refs.map(programplanReference) });
  if ((draft.kind === 'bind' || draft.kind === 'clone' && !draft.sourceBound) && !draft.legacyConfirmed) throw new Error('Bekräfta att de äldre valen bevaras i samma ordning.');
  if (draft.kind === 'create') return { route: '/api/programplaner/skapa', body: { offeringId: draft.offeringId, expectedLatestVersion: draft.expectedLatestVersion, basisReference: basis } };
  if (!draft.planId) throw new Error('Planens identitet saknas.');
  if (draft.kind === 'bind') return { route: '/api/programplaner/binda', body: { planId: draft.planId, expectedRevision: draft.expectedRevision, basisReference: basis } };
  if (draft.kind === 'replace') return { route: '/api/programplaner/fordjupning', body: { planId: draft.planId, expectedRevision: draft.expectedRevision, specializationRefs: basis.specializationRefs } };
  return { route: '/api/programplaner/klona', body: { sourcePlanId: draft.planId, expectedSourceRevision: draft.expectedRevision,
    expectedLatestVersion: draft.expectedLatestVersion, explicitLegacyBasis: draft.sourceBound ? null : basis } };
}
export function programplanCommandReply(value: unknown, draft: ProgramplanDraft): Programplan {
  const plan = draft.kind==='clone'?parseProgramplanCloneReply(value):parseProgramplan(value);
  if (plan.offeringId !== draft.offeringId || plan.status !== 'utkast' || plan.decidedOn !== null || !plan.basisReference) throw new Error('Sparandet kunde inte bekräftas.');
  const reference = { ...draft.pin, startedOn: draft.startedOn, specializationRefs: draft.refs };
  if (!sameProgramplanPin(plan.basisReference, reference) || !sameProgramplanLevels(plan.basisReference.specializationRefs, draft.refs)) throw new Error('Sparandet kunde inte bekräftas.');
  if (draft.kind === 'bind' || draft.kind === 'replace') {
    if (plan.id !== draft.planId || plan.revision !== draft.expectedRevision + 1) throw new Error('Sparandet kunde inte bekräftas.');
  } else if (plan.id === draft.planId || plan.version !== draft.expectedLatestVersion + 1 || plan.revision !== 0) throw new Error('Sparandet kunde inte bekräftas.');
  return plan;
}
export function programplanDiagnostic(code: string): string {
  const messages: Record<string, string> = {
    unpinned_basis: 'Planen saknar versionsbundet underlag. Äldre val visas separat.', unknown_education_start: 'Utbildningens exakta startdatum saknas.',
    catalog_unavailable: 'Den exakta katalogen är inte tillgänglig.', program_not_found: 'Programmet finns inte i den valda katalogen.',
    orientation_not_found: 'Utbildningens inriktning finns inte i den valda katalogen.', orientation_required: 'Underlaget kräver en inriktning som utbildningen saknar.',
    historical_version_missing: 'Den efterfrågade historiska versionen saknas.', version_not_applicable_at_start: 'Underlagsversionen gäller inte vid den angivna utbildningsstarten.',
    program_rules_unverified: 'Fullständiga nationella regler, ramar och nivåföljd är ännu inte verifierade.',
    optional_subject: 'Källan innehåller ett alternativ som inte har valts automatiskt.', subject_levels_unresolved: 'Källan saknar fullständiga nivåreferenser för detta ämne.',
  };
  return messages[code] ?? `Underlaget behöver kontrolleras (${code}).`;
}
