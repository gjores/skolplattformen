import { parseProgramplanTermReply, type ProgramplanTermRead, type ProgramplanTermWrite } from '../programplan-terms-contract.ts';
import { AuditUnavailable } from './authz.ts';
import type { Tx } from './db.ts';
import { lifecycleOperation } from './programplan-lifecycle.ts';
async function operation<T>(fn: () => Promise<T>): Promise<T> { return lifecycleOperation(fn); }
function result(rows: { result: unknown }[], input: ProgramplanTermRead, write?: ProgramplanTermWrite) {
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    const body = parseProgramplanTermReply(rows[0].result);
    if (body.planId !== input.planId || (write && (body.revision !== write.expectedRevision + 1 || body.status !== 'utkast'
      || JSON.stringify(body.distribution) !== JSON.stringify(write.distribution)))) throw new AuditUnavailable();
    return { body, event: { action: write ? 'programplan_terms_changed' : 'programplan_terms_read', objectType: 'programplan', objectId: body.planId } };
  } catch { throw new AuditUnavailable(); }
}
export async function readProgramplanTerms(tx: Tx, input: ProgramplanTermRead) {
  return result(await operation(() => tx<{ result: unknown }[]>`select public.phase5_read_programplan_terms(${input.planId}) as result`), input);
}
export async function writeProgramplanTerms(tx: Tx, input: ProgramplanTermWrite) {
  return result(await operation(() => tx<{ result: unknown }[]>`select public.phase5_write_programplan_terms(${input.planId},${input.expectedRevision},${tx.json(input.distribution)}::jsonb) as result`), input, input);
}
