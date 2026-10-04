import { parseProgramplanLifecycleReply, programplanLifecycleEvent, type ProgramplanLifecycleCommand } from '../programplan-lifecycle.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

/** SQL:s livscykelhints blir begripliga svar; mandatfel förblir 403 via mandateOperation. */
export function lifecycleSqlFailure(error: unknown): Deny | null {
  if (!error || typeof error !== 'object' || !('hint' in error)) return null;
  const hint = (error as { hint?: unknown }).hint, code = 'code' in error ? (error as { code?: unknown }).code : null;
  if (code === '42501' && (hint === 'programplan_started' || hint === 'programplan_archived')) return new Deny('programplan_locked', 409);
  if (code === '55006' && hint === 'programplan_in_use') return new Deny('programplan_in_use', 409);
  if (code === '22023' && hint === 'programplan_start_passed') return new Deny('programplan_start_passed', 400);
  return null;
}
export async function lifecycleOperation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await mandateOperation(async () => { try { return await fn(); } catch (error) { throw lifecycleSqlFailure(error) ?? error; } }); }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable(); throw error; }
}
export async function changeProgramplanEducation(tx: Tx, input: ProgramplanLifecycleCommand) {
  const rows = await lifecycleOperation(() => tx<{ result: unknown }[]>`select public.phase5_change_programplan_education(
    ${input.offeringId},${input.expectedRevision},${input.command},${tx.json(input.details)}::jsonb) as result`);
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    // Id, kommando och ny revision ska motsvara exakt det som begärdes.
    const body = parseProgramplanLifecycleReply(rows[0].result, input);
    return { body, event: { action: programplanLifecycleEvent[input.command], objectType: 'education', objectId: input.offeringId } };
  } catch { throw new AuditUnavailable(); }
}
