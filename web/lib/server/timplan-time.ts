import { gymShape, isGymTimplanV2, type GymTimplanReadRequest } from '../gym-timplan.ts';
import { parseTimplanTimeBasis, parseTimplanTimeReply, parseTimplanTimeStatus, type TimplanTimeCommand } from '../timplan-time-command.ts';
import { projectTimplanTimeTransition } from '../timplan-time.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { gymTimplanOperation, projectGymTimplan, readGymTimplan } from './gym-timplan.ts';
import { readAplPlan, type AplProjectionAuthority } from './apl-plan.ts';
function one(rows: { result: unknown }[]) { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  return gymTimplanOperation(async () => {
    try { return await fn(); } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && 'hint' in error && typeof error.hint === 'string') {
        if (error.code === '40001' && ['time_model_conflict', 'time_command_conflict', 'time_revision_conflict', 'time_basis_conflict'].includes(error.hint)) throw new Deny('conflict', 409, { reason: error.hint });
        if (error.code === '22023' && ['invalid_time_row', 'invalid_time_command', 'invalid_time_transition', 'allocation_exceeds_annual', 'apl_not_vocational', 'invalid_time_review'].includes(error.hint)) throw new Deny('bad_request', 400, { reason: error.hint });
      }
      throw error;
    }
  });
}
async function projectReply(value: unknown, command: TimplanTimeCommand) {
  const r = gymShape(value, ['contractVersion', 'plan', 'receipt']);
  if (r.contractVersion !== 'timplan_time_sql_v2') throw new TypeError('Invalid time envelope');
  const { body } = await projectGymTimplan(r.plan, command.planId);
  return parseTimplanTimeReply({ contractVersion: 'timplan_time_v2', plan: body, receipt: r.receipt }, command);
}
export async function readTimplanTimeBasis(tx: Tx, input: GymTimplanReadRequest, authority: AplProjectionAuthority) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_timplan_time_transition_basis(${input.planId}) as result`));
  const { body: plan } = await readGymTimplan(tx, input);
  const { body: apl } = await readAplPlan(tx, input, authority);
  try {
    if (isGymTimplanV2(plan) || (apl.timplanRevision ?? apl.revision) !== plan.revision) throw new TypeError('Stale transition');
    const body = parseTimplanTimeBasis(raw, input.planId), proposal = projectTimplanTimeTransition(plan, apl.plan);
    if (body.revision !== plan.revision || JSON.stringify(body.rows) !== JSON.stringify(proposal.timeRows)) {
      // JSON objects have no semantic key ordering; compare each exact row independently.
      if (body.revision !== plan.revision || Object.keys(body.rows).length !== plan.rows.length || plan.rows.some(row => JSON.stringify(body.rows[row.key]) !== JSON.stringify(proposal.timeRows[row.key]))) throw new TypeError('Invalid transition proposal');
    }
    return { body, event: { action: 'timplan_time_basis_read', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}
export async function commandTimplanTime(tx: Tx, input: TimplanTimeCommand) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_timplan_time_command(${tx.json(input)}::jsonb) as result`));
  try {
    const body = await projectReply(raw, input);
    return { body, event: { action: 'timplan_time_changed', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}
export async function readTimplanTimeStatus(tx: Tx, input: { command: TimplanTimeCommand }) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_timplan_time_status(${tx.json(input)}::jsonb) as result`));
  try {
    const r = gymShape(raw, ['state', 'result']);
    const body = parseTimplanTimeStatus({ state: r.state, result: r.state === 'completed' ? await projectReply(r.result, input.command) : r.result }, input);
    return { body, event: { action: 'timplan_time_status_read', objectType: 'timplan', objectId: input.command.planId } };
  } catch { throw new AuditUnavailable(); }
}
