import { ProgramplanContractError, verifyProgramplanCatalog } from '../programplan-catalog.ts';
import { parseProgramplanOfferingList, parseProgramplanWorkspace, parseRawProgramplanWorkspace,
  type ProgramplanListRequest, type ProgramplanWorkspaceRequest, type ProgramplanWorkspaceCatalog } from '../programplan-workspace-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await mandateOperation(fn); }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable(); throw error; }
}
function row(rows: { result: unknown }[]) { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }
export async function listProgramplanOfferings(tx: Tx, input: ProgramplanListRequest) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.phase5_list_programplan_offerings(${input.page}) as result`);
  try {
    const body = parseProgramplanOfferingList(row(rows), input.page);
    return { body, event: { action: 'programplan_offerings_listed', objectType: 'education_collection', objectId: null } };
  } catch { throw new AuditUnavailable(); }
}
export async function readProgramplanWorkspace(tx: Tx, input: ProgramplanWorkspaceRequest) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.phase5_programplan_workspace(
    ${input.offeringId},${input.versionPage},${input.catalogId}) as result`);
  try {
    const raw = parseRawProgramplanWorkspace(row(rows), input);
    let catalog: ProgramplanWorkspaceCatalog = { status: raw.catalog.status, catalogId: input.catalogId,
      diagnostic: raw.catalog.diagnostic, source: null, program: null, subjects: [] };
    if (raw.catalog.status === 'selected') {
      const payload = raw.catalog.payload as Record<string, unknown>;
      if (Object.keys(payload).length !== 4 || ['schemaVersion','source','subjects','programs'].some(k => !Object.hasOwn(payload, k))) throw new ProgramplanContractError('invalid_catalog');
      // Verify the exact stored whole catalog, never the current repo artifact
      // or the smaller projection sent to the UI. No session/context cache.
      const verified = await verifyProgramplanCatalog({ ...payload, catalogId: input.catalogId });
      const program = verified.programs.find(p => p.code === raw.education.programCode), orientation = raw.education.orientationCode;
      const diagnostic = !program ? 'program_not_found' : orientation === null && program.orientations.length > 0 ? 'orientation_required'
        : orientation !== null && !program.orientations.some(o => o.code === orientation) ? 'orientation_not_found' : null;
      if (diagnostic !== null) catalog = { ...catalog, status: 'blocked', diagnostic };
      else {
        const p = program!;
        const codes = new Set([...p.foundation,...p.programmeSpecific,...p.orientations.flatMap(o => o.subjects),...p.specialization]
          .filter(s => s.subjectVersion !== null).map(s => s.code));
        catalog = { status: 'selected', catalogId: verified.catalogId, diagnostic: null, source: verified.source,
          program: p, subjects: verified.subjects.filter(s => codes.has(s.code)) };
      }
    }
    const { catalog: _rawCatalog, ...metadata } = raw;
    const body = parseProgramplanWorkspace({ ...metadata, catalog }, input);
    return { body, event: { action: 'programplan_workspace_read', objectType: 'education', objectId: input.offeringId } };
  } catch { throw new AuditUnavailable(); }
}
