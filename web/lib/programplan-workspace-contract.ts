import { catalogDate, parseProgramplanBasisReference, parseProgramplanCatalog, ProgramplanContractError,
  type CatalogPayload, type CatalogProgram, type CatalogSubject, type ProgramplanBasisReference } from './programplan-catalog.ts';
import { parseProgramplanLifecycle, type ProgramplanLifecycle } from './programplan-lifecycle.ts';

function bad(): never { throw new ProgramplanContractError('invalid_programplan_workspace'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const descriptors = Object.getOwnPropertyDescriptors(value), prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length
    || Object.values(descriptors).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: string[]) {
  const row = object(value);
  if (Object.getOwnPropertyNames(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) bad();
  return row;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function text(value: unknown, maximum = 1000): string { if (typeof value !== 'string' || value.length > maximum) bad(); return value; }
function code(value: unknown): string {
  const result = text(value, 96);
  if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(result) || ['constructor','prototype','__proto__'].includes(result)) bad();
  return result;
}
function integer(value: unknown, min = 0, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function page(value: unknown) { return integer(value, 1, 100000); }
function source(value: unknown): CatalogPayload['source'] {
  const r = shape(value, ['url','apiVersion','fetched']);
  const url = text(r.url, 2000), apiVersion = text(r.apiVersion, 100);
  let parsed: URL; try { parsed = new URL(url); } catch { bad(); }
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || !apiVersion) bad();
  return { url, apiVersion, fetched: catalogDate(r.fetched) };
}
export type ProgramplanListRequest = { page: number };
export type ProgramplanWorkspaceRequest = { offeringId: string; versionPage: number; catalogId: string | null };
export function parseProgramplanListRequest(value: unknown): ProgramplanListRequest {
  const r = shape(value, ['page']); return { page: page(r.page) };
}
export function parseProgramplanWorkspaceRequest(value: unknown): ProgramplanWorkspaceRequest {
  const r = shape(value, ['offeringId','versionPage','catalogId']);
  return { offeringId: uuid(r.offeringId), versionPage: page(r.versionPage), catalogId: r.catalogId === null ? null : hash(r.catalogId) };
}
export type ProgramplanEducationSummary = {
  id: string; unitId: string; schoolName: string; kind: 'gymnasium'; name: string; localCode: string | null;
  cohort: string; startYear: number | null; status: 'planerad' | 'aktiv' | 'avvecklas';
  programCode: string; orientationCode: string | null; latestVersion: number; draftId: string | null;
};
function education(value: unknown): ProgramplanEducationSummary {
  const r = shape(value, ['id','unitId','schoolName','kind','name','localCode','cohort','startYear','status','programCode','orientationCode','latestVersion','draftId']);
  if (r.kind !== 'gymnasium' || typeof r.status !== 'string' || !['planerad','aktiv','avvecklas'].includes(r.status)) bad();
  const latestVersion = integer(r.latestVersion), draftId = r.draftId === null ? null : uuid(r.draftId);
  if (latestVersion === 0 && draftId !== null) bad();
  return { id: uuid(r.id), unitId: uuid(r.unitId), schoolName: text(r.schoolName), kind: 'gymnasium', name: text(r.name),
    localCode: r.localCode === null ? null : text(r.localCode), cohort: text(r.cohort), startYear: r.startYear === null ? null : integer(r.startYear, 1, 9998),
    status: r.status as ProgramplanEducationSummary['status'], programCode: code(r.programCode),
    orientationCode: r.orientationCode === null ? null : code(r.orientationCode), latestVersion, draftId };
}
/** Utbildning utan lifecycle, som i skapandets kvitto. */
export function parseProgramplanEducationSummary(value: unknown): ProgramplanEducationSummary { return education(value); }
export type ProgramplanOfferingRow = ProgramplanEducationSummary & { lifecycle: ProgramplanLifecycle };
function offeringRow(value: unknown): ProgramplanOfferingRow {
  const row = object(value);
  if (!Object.hasOwn(row, 'lifecycle')) bad();
  const { lifecycle, ...rest } = row;
  const edu = education(rest), parsed = parseProgramplanLifecycle(lifecycle);
  if (parsed.units.find(u => u.primary)?.id !== edu.unitId) bad();
  return { ...edu, lifecycle: parsed };
}
export type ProgramplanOfferingList = { offerings: ProgramplanOfferingRow[]; count: number; page: number; pageSize: 50 };
function pagination(rows: unknown[], count: number, currentPage: number, pageSize: unknown) {
  if (pageSize !== 50 || rows.length !== Math.min(50, Math.max(0, count - (currentPage - 1) * 50))) bad();
}
export function parseProgramplanOfferingList(value: unknown, expectedPage: number): ProgramplanOfferingList {
  const r = shape(value, ['offerings','count','page','pageSize']);
  const currentPage = page(r.page), count = integer(r.count, 0, Number.MAX_SAFE_INTEGER), offerings = array(r.offerings, 50).map(offeringRow);
  if (currentPage !== page(expectedPage) || new Set(offerings.map(o => o.id)).size !== offerings.length) bad();
  pagination(offerings, count, currentPage, r.pageSize);
  return { offerings, count, page: currentPage, pageSize: 50 };
}
export type ProgramplanVersionSummary = {
  id: string; version: number; revision: number; status: 'utkast' | 'faststalld' | 'ersatt'; decidedOn: string | null;
  catalogId: string | null; basisReference: ProgramplanBasisReference | null; legacySpecialization: string[] | null;
};
function version(value: unknown, edu: ProgramplanEducationSummary): ProgramplanVersionSummary {
  const r = shape(value, ['id','version','revision','status','decidedOn','catalogId','basisReference','legacySpecialization']);
  if (typeof r.status !== 'string' || !['utkast','faststalld','ersatt'].includes(r.status)) bad();
  const catalogId = r.catalogId === null ? null : hash(r.catalogId), basisReference = r.basisReference === null ? null : parseProgramplanBasisReference(r.basisReference);
  if ((catalogId === null) !== (basisReference === null) || (basisReference && (basisReference.catalogId !== catalogId
    || basisReference.programRef.code !== edu.programCode || basisReference.orientationCode !== edu.orientationCode))) bad();
  // Legacy display is deliberately broader than the write reference's 200-level limit.
  // Unknown/duplicate stored values must remain visible rather than silently repaired.
  const legacySpecialization = r.legacySpecialization === null ? null : array(r.legacySpecialization, 10000).map(v => text(v));
  if ((catalogId === null) !== (legacySpecialization !== null)) bad();
  const id = uuid(r.id), number = integer(r.version, 1);
  if (number > edu.latestVersion || (r.status === 'utkast' && edu.draftId !== id) || (edu.draftId === id && r.status !== 'utkast')) bad();
  const decidedOn = r.decidedOn === null ? null : catalogDate(r.decidedOn);
  if (r.status === 'utkast' && decidedOn !== null) bad();
  return { id, version: number, revision: integer(r.revision), status: r.status as ProgramplanVersionSummary['status'],
    decidedOn, catalogId, basisReference, legacySpecialization };
}
export type ProgramplanCatalogChoice = { catalogId: string; source: CatalogPayload['source'] };
export type ProgramplanWorkspaceMetadata = {
  education: ProgramplanEducationSummary; lifecycle: ProgramplanLifecycle; versions: ProgramplanVersionSummary[]; versionCount: number;
  versionPage: number; pageSize: 50; catalogs: ProgramplanCatalogChoice[]; decisionReady: false;
};
function metadata(r: Record<string, unknown>, expected: ProgramplanWorkspaceRequest): ProgramplanWorkspaceMetadata {
  const edu = education(r.education), lifecycle = parseProgramplanLifecycle(r.lifecycle), currentPage = page(r.versionPage), versionCount = integer(r.versionCount, 0, Number.MAX_SAFE_INTEGER);
  if (lifecycle.units.find(u => u.primary)?.id !== edu.unitId) bad();
  if (edu.id !== expected.offeringId || currentPage !== expected.versionPage || r.decisionReady !== false
    || ((versionCount === 0) !== (edu.latestVersion === 0))) bad();
  const versions = array(r.versions, 50).map(v => version(v, edu));
  if (new Set(versions.map(v => v.id)).size !== versions.length || new Set(versions.map(v => v.version)).size !== versions.length
    || versions.some((v, i) => i > 0 && versions[i - 1].version <= v.version)) bad();
  pagination(versions, versionCount, currentPage, r.pageSize);
  const catalogs = array(r.catalogs, 1000).map(value => {
    const c = shape(value, ['catalogId','source']); return { catalogId: hash(c.catalogId), source: source(c.source) };
  });
  if (new Set(catalogs.map(c => c.catalogId)).size !== catalogs.length
    || catalogs.some((c, i) => i > 0 && catalogs[i - 1].catalogId >= c.catalogId)) bad();
  return { education: edu, lifecycle, versions, versionCount, versionPage: currentPage, pageSize: 50, catalogs, decisionReady: false };
}
export type ProgramplanWorkspaceCatalog = {
  status: 'unselected' | 'selected' | 'blocked'; catalogId: string | null;
  diagnostic: null | 'catalog_unavailable' | 'program_not_found' | 'orientation_not_found' | 'orientation_required';
  source: CatalogPayload['source'] | null; program: CatalogProgram | null; subjects: CatalogSubject[];
};
export type ProgramplanWorkspace = ProgramplanWorkspaceMetadata & { catalog: ProgramplanWorkspaceCatalog };
const TOP = ['education','lifecycle','versions','versionCount','versionPage','pageSize','catalogs','catalog','decisionReady'];
const DIAGNOSTICS = ['catalog_unavailable','program_not_found','orientation_not_found','orientation_required'];
export function parseProgramplanWorkspace(value: unknown, expectedValue: ProgramplanWorkspaceRequest): ProgramplanWorkspace {
  const expected = parseProgramplanWorkspaceRequest(expectedValue), r = shape(value, TOP), data = metadata(r, expected);
  const c = shape(r.catalog, ['status','catalogId','diagnostic','source','program','subjects']);
  if (c.catalogId !== expected.catalogId || typeof c.status !== 'string' || !['unselected','selected','blocked'].includes(c.status)) bad();
  if (c.status !== 'selected') {
    if (c.source !== null || c.program !== null || array(c.subjects, 0).length !== 0) bad();
    if (c.status === 'unselected' ? expected.catalogId !== null || c.diagnostic !== null
      : expected.catalogId === null || typeof c.diagnostic !== 'string' || !DIAGNOSTICS.includes(c.diagnostic)) bad();
    return { ...data, catalog: { status: c.status as 'unselected' | 'blocked', catalogId: expected.catalogId,
      diagnostic: c.diagnostic as ProgramplanWorkspaceCatalog['diagnostic'], source: null, program: null, subjects: [] } };
  }
  if (expected.catalogId === null || c.diagnostic !== null) bad();
  // Structural validation of the projected source only. This is not the complete
  // parent catalog and must never acquire verifyProgramplanCatalog capability.
  const projection = parseProgramplanCatalog({ schemaVersion: 1, catalogId: expected.catalogId, source: c.source, programs: [c.program], subjects: c.subjects });
  const program = projection.programs[0], orientation = data.education.orientationCode;
  if (program.code !== data.education.programCode || (orientation === null ? program.orientations.length > 0 : !program.orientations.some(o => o.code === orientation))) bad();
  const blocks = [...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o => o.subjects),...program.specialization];
  const references = new Set(blocks.filter(b => b.subjectVersion !== null).map(b => b.code));
  if (projection.subjects.length !== references.size || projection.subjects.some(s => !references.has(s.code))) bad();
  const listed = data.catalogs.find(s => s.catalogId === expected.catalogId);
  if (!listed || JSON.stringify(listed.source) !== JSON.stringify(projection.source)) bad();
  return { ...data, catalog: { status: 'selected', catalogId: expected.catalogId, diagnostic: null,
    source: projection.source, program, subjects: projection.subjects } };
}
export type RawProgramplanWorkspace = ProgramplanWorkspaceMetadata & {
  catalog: { status: 'unselected' | 'selected' | 'blocked'; catalogId: string | null; diagnostic: null | 'catalog_unavailable'; payload: unknown };
};
/** Server-only raw SQL boundary; caller must verify selected whole payload before projection. */
export function parseRawProgramplanWorkspace(value: unknown, expectedValue: ProgramplanWorkspaceRequest): RawProgramplanWorkspace {
  const expected = parseProgramplanWorkspaceRequest(expectedValue), r = shape(value, TOP), data = metadata(r, expected);
  const c = shape(r.catalog, ['status','catalogId','diagnostic','payload']);
  if (c.catalogId !== expected.catalogId || typeof c.status !== 'string' || !['unselected','selected','blocked'].includes(c.status)) bad();
  if (c.status === 'unselected' ? expected.catalogId !== null || c.diagnostic !== null || c.payload !== null
    : c.status === 'blocked' ? expected.catalogId === null || c.diagnostic !== 'catalog_unavailable' || c.payload !== null
      : expected.catalogId === null || c.diagnostic !== null || c.payload === null) bad();
  if (c.status === 'selected') object(c.payload);
  return { ...data, catalog: { status: c.status as RawProgramplanWorkspace['catalog']['status'], catalogId: expected.catalogId,
    diagnostic: c.diagnostic as null | 'catalog_unavailable', payload: c.payload } };
}
