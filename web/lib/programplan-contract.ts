import { parseProgramplanChoiceBlocks, requireCurrentProgramplanBasis, type ProgramplanChoiceBlock } from './programplan-choice-blocks.ts';
import { catalogDate, parseProgramplanBasisReference, ProgramplanContractError,
  type ProgramplanBasisReference, type ProgramplanLevelRef, type ProgramplanDiagnostic, type ProgramplanUnresolvedChoice } from './programplan-catalog.ts';

function bad(): never { throw new ProgramplanContractError('invalid_programplan_contract'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: string[], optional: string[] = []) {
  const row = object(value);
  if (keys.some(key => !Object.hasOwn(row, key)) || Object.getOwnPropertyNames(row).some(key => !keys.includes(key) && !optional.includes(key))) bad();
  return row;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) bad();
  return value;
}
function code(value: unknown): string {
  const result = text(value, 96);
  if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(result) || ['constructor','prototype','__proto__'].includes(result)) bad();
  return result;
}
function integer(value: unknown, max = 2147483646, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function catalogId(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad();
  return value;
}
export function parseProgramplanLevels(value: unknown): ProgramplanLevelRef[] {
  return array(value, 200).map(value => {
    const r = shape(value, ['subjectCode','subjectVersion','itemCode','points']);
    return { subjectCode: code(r.subjectCode), subjectVersion: integer(r.subjectVersion, 100000, 1), itemCode: code(r.itemCode), points: integer(r.points, 10000) };
  });
}
export type ProgramplanReadRequest = { planId: string };
export type ProgramplanBindRequest = ProgramplanReadRequest & { expectedRevision: number; basisReference: ProgramplanBasisReference };
export type ProgramplanReplaceRequest = ProgramplanReadRequest & { expectedRevision: number; specializationRefs: ProgramplanLevelRef[] };
export type ProgramplanCreateRequest = { offeringId: string; expectedLatestVersion: number; basisReference: ProgramplanBasisReference };
export type ProgramplanCloneRequest = { sourcePlanId: string; expectedSourceRevision: number; expectedLatestVersion: number; explicitLegacyBasis: ProgramplanBasisReference | null };
export function parseProgramplanRead(value: unknown): ProgramplanReadRequest {
  const r = shape(value, ['planId']); return { planId: uuid(r.planId) };
}
export function parseProgramplanBind(value: unknown): ProgramplanBindRequest {
  const r = shape(value, ['planId','expectedRevision','basisReference']);
  return { planId: uuid(r.planId), expectedRevision: integer(r.expectedRevision), basisReference: requireCurrentProgramplanBasis(r.basisReference) };
}
export function parseProgramplanReplace(value: unknown): ProgramplanReplaceRequest {
  const r = shape(value, ['planId','expectedRevision','specializationRefs']);
  return { planId: uuid(r.planId), expectedRevision: integer(r.expectedRevision), specializationRefs: parseProgramplanLevels(r.specializationRefs) };
}
export function parseProgramplanCreate(value: unknown): ProgramplanCreateRequest {
  const r = shape(value, ['offeringId','expectedLatestVersion','basisReference']);
  return { offeringId: uuid(r.offeringId), expectedLatestVersion: integer(r.expectedLatestVersion), basisReference: requireCurrentProgramplanBasis(r.basisReference) };
}
export function parseProgramplanClone(value: unknown): ProgramplanCloneRequest {
  const r = shape(value, ['sourcePlanId','expectedSourceRevision','expectedLatestVersion','explicitLegacyBasis']);
  return { sourcePlanId: uuid(r.sourcePlanId), expectedSourceRevision: integer(r.expectedSourceRevision), expectedLatestVersion: integer(r.expectedLatestVersion),
    explicitLegacyBasis: r.explicitLegacyBasis === null ? null : requireCurrentProgramplanBasis(r.explicitLegacyBasis) };
}
export type ProgramplanBlocksRequest = ProgramplanReadRequest & { expectedRevision: number; choiceBlocks: ProgramplanChoiceBlock[] };
export function parseProgramplanBlocks(value: unknown): ProgramplanBlocksRequest {
  const r = shape(value, ['planId','expectedRevision','choiceBlocks']);
  return { planId: uuid(r.planId), expectedRevision: integer(r.expectedRevision), choiceBlocks: parseProgramplanChoiceBlocks(r.choiceBlocks) };
}
const DIAGNOSTICS = new Set(['invalid_choice_blocks','duplicate_choice_block','missing_slot_block','unexpected_slot_block','slot_block_mismatch','individual_choice_points_mismatch','unpinned_basis','unknown_education_start','invalid_basis_reference','invalid_catalog_id','unverified_catalog','catalog_mismatch','catalog_integrity_failed','program_not_found','orientation_not_found','orientation_required','historical_version_missing','validity_metadata_missing','version_not_applicable_at_start','version_canceled_before_start','unsupported_regime','unsupported_school_type','subject_not_found','wrong_subject','item_not_found','points_mismatch','duplicate_selected_level','fixed_level_duplicate','not_specialization_option','invalid_catalog','duplicate_catalog_code','catalog_reference_missing','catalog_reference_mismatch','catalog_unavailable']);
const BLOCKS = new Set(['foundation','programmeSpecific','orientation','specialization','program']);
function block(value: unknown): string { if (typeof value !== 'string' || !BLOCKS.has(value)) bad(); return value; }
export type ProgramplanResolution = { status: 'resolved' | 'blocked'; diagnostics: ProgramplanDiagnostic[]; unresolvedChoices: ProgramplanUnresolvedChoice[]; decisionReady: false };
export function parseProgramplanResolution(value: unknown): ProgramplanResolution {
  const r = shape(value, ['status','diagnostics','unresolvedChoices','decisionReady']);
  if ((r.status !== 'resolved' && r.status !== 'blocked') || r.decisionReady !== false) bad();
  const diagnostics = array(r.diagnostics, 20000).map(value => {
    const d = shape(value, ['code'], ['subjectCode','itemCode','blockId']);
    if (typeof d.code !== 'string' || !DIAGNOSTICS.has(d.code)) bad();
    return { code: d.code, ...(Object.hasOwn(d,'subjectCode') ? { subjectCode: code(d.subjectCode) } : {}),
      ...(Object.hasOwn(d,'itemCode') ? { itemCode: code(d.itemCode) } : {}), ...(Object.hasOwn(d,'blockId') ? { blockId: block(d.blockId) } : {}) };
  });
  const unresolvedChoices = array(r.unresolvedChoices, 20000).map((value): ProgramplanUnresolvedChoice => {
    const d = object(value);
    if (d.kind === 'program_rules_unverified') {
      shape(d, ['kind','blockId','category']); if (d.blockId !== 'program') bad();
      return { kind: d.kind, blockId: 'program', category: text(d.category) };
    }
    shape(d, ['kind','blockId','subjectCode','points']);
    if (d.kind !== 'optional_subject' && d.kind !== 'subject_levels_unresolved') bad();
    const blockId = block(d.blockId);
    if (blockId === 'program' || (d.kind === 'optional_subject' && blockId === 'specialization')) bad();
    return { kind: d.kind, blockId, subjectCode: code(d.subjectCode), points: integer(d.points, 10000) };
  });
  if ((r.status === 'resolved') !== (diagnostics.length === 0)) bad();
  return { status: r.status, diagnostics, unresolvedChoices, decisionReady: false };
}
export type Programplan = {
  id: string; offeringId: string; unitId: string; schoolName: string;
  education: { name: string; cohort: string; programCode: string; orientationCode: string | null };
  version: number; revision: number; status: 'utkast' | 'faststalld' | 'ersatt'; decidedOn: string | null;
  catalogId: string | null; basisReference: ProgramplanBasisReference | null; resolution: ProgramplanResolution;
};
export function parseProgramplan(value: unknown): Programplan {
  const r = shape(value, ['id','offeringId','unitId','schoolName','education','version','revision','status','decidedOn','catalogId','basisReference','resolution']);
  const e = shape(r.education, ['name','cohort','programCode','orientationCode']);
  const education = { name: text(e.name), cohort: text(e.cohort), programCode: code(e.programCode), orientationCode: e.orientationCode === null ? null : code(e.orientationCode) };
  if (r.status !== 'utkast' && r.status !== 'faststalld' && r.status !== 'ersatt') bad();
  const basisReference = r.basisReference === null ? null : parseProgramplanBasisReference(r.basisReference);
  const pin = r.catalogId === null ? null : catalogId(r.catalogId);
  const resolution = parseProgramplanResolution(r.resolution);
  if ((pin === null) !== (basisReference === null) || (basisReference && (basisReference.catalogId !== pin
    || basisReference.programRef.code !== education.programCode || basisReference.orientationCode !== education.orientationCode))) bad();
  if (!basisReference && (resolution.status !== 'blocked' || resolution.diagnostics.length !== 1 || resolution.diagnostics[0].code !== 'unpinned_basis' || resolution.unresolvedChoices.length)) bad();
  return { id: uuid(r.id), offeringId: uuid(r.offeringId), unitId: uuid(r.unitId), schoolName: text(r.schoolName), education,
    version: integer(r.version,2147483647,1), revision: integer(r.revision,2147483647), status: r.status,
    decidedOn: r.decidedOn === null ? null : catalogDate(r.decidedOn), catalogId: pin, basisReference, resolution };
}
