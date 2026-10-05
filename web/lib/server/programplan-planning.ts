import { ProgramplanContractError } from '../programplan-catalog.ts';
import { parseProgramplan, type ProgramplanReadRequest, type ProgramplanBindRequest, type ProgramplanReplaceRequest,
  type ProgramplanCreateRequest, type ProgramplanCloneRequest } from '../programplan-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { lifecycleOperation } from './programplan-lifecycle.ts';
export function programplanRequest<T>(parse: (value: unknown) => T, value: unknown): T {
  try { return parse(value); } catch (error) { if (error instanceof ProgramplanContractError) throw new Deny('bad_request',400); throw error; }
}
async function operation<T>(fn: () => Promise<T>): Promise<T> { return lifecycleOperation(fn); }
function result(rows: {result: unknown}[], action: string, valid: (body: ReturnType<typeof parseProgramplan>) => boolean) {
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    const body = parseProgramplan(rows[0].result);
    if (!valid(body)) throw new AuditUnavailable();
    return { body, event: { action, objectType: 'programplan', objectId: body.id } };
  } catch { throw new AuditUnavailable(); }
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
export async function readProgramplan(tx: Tx, input: ProgramplanReadRequest) {
  return result(await operation(() => tx<{result: unknown}[]>`select public.phase5_read_programplan(${input.planId}) as result`),
    'programplan_read', body => body.id === input.planId);
}
export async function bindProgramplan(tx: Tx, input: ProgramplanBindRequest) {
  return result(await operation(() => tx<{result: unknown}[]>`select public.phase5_bind_programplan_draft(${input.planId},${input.expectedRevision},${tx.json(input.basisReference)}::jsonb) as result`),
    'programplan_basis_bound', body => body.id === input.planId && body.revision === input.expectedRevision+1 && body.status === 'utkast' && body.decidedOn === null && same(body.basisReference,input.basisReference));
}
export async function replaceProgramplan(tx: Tx, input: ProgramplanReplaceRequest) {
  return result(await operation(() => tx<{result: unknown}[]>`select public.phase5_replace_programplan_specialization(${input.planId},${input.expectedRevision},${tx.json(input.specializationRefs)}::jsonb) as result`),
    'programplan_specialization_changed', body => body.id === input.planId && body.revision === input.expectedRevision+1 && body.status === 'utkast' && body.decidedOn === null && same(body.basisReference?.specializationRefs,input.specializationRefs));
}
export async function createProgramplan(tx: Tx, input: ProgramplanCreateRequest) {
  return result(await operation(() => tx<{result: unknown}[]>`select public.phase5_create_programplan_draft(${input.offeringId},${input.expectedLatestVersion},${tx.json(input.basisReference)}::jsonb) as result`),
    'programplan_draft_created', body => body.offeringId === input.offeringId && body.version === input.expectedLatestVersion+1 && body.revision === 0 && body.status === 'utkast' && body.decidedOn === null && same(body.basisReference,input.basisReference));
}
export async function cloneProgramplan(tx: Tx, input: ProgramplanCloneRequest) {
  return result(await operation(() => tx<{result: unknown}[]>`select public.phase5_clone_programplan_draft(${input.sourcePlanId},${input.expectedSourceRevision},${input.expectedLatestVersion},${tx.json(input.explicitLegacyBasis)}::jsonb) as result`),
    'programplan_draft_cloned', body => body.id !== input.sourcePlanId && body.version === input.expectedLatestVersion+1 && body.revision === 0 && body.status === 'utkast' && body.decidedOn === null && body.basisReference !== null && (input.explicitLegacyBasis === null || same(body.basisReference,input.explicitLegacyBasis)));
}
