import { commandTimplanTime } from './timplan-time.ts';
import { isGymTimplanV2, gymTimplanCanEdit } from '../gym-timplan.ts';
import { suggestGymTimplanTimeV2, suggestGymTimplanHours, type GymTimplanDistributionRequest } from '../gym-timplan-distribution.ts';
import { VOCATIONAL_GY25_CODES } from '../programplan-profile.ts';
import { readGymTimplan, writeGymTimplanRow } from './gym-timplan.ts';
import { readAplPlan, type AplProjectionAuthority } from './apl-plan.ts';
import { Deny, type Tx } from './db.ts';
import { AuditUnavailable } from './authz.ts';

/** Runs inside protectedRoute's one transaction: a row, concurrency or audit failure rolls back all rows. */
export async function distributeGymTimplan(tx: Tx, input: GymTimplanDistributionRequest, authority: AplProjectionAuthority) {
  const { body: before } = await readGymTimplan(tx, { planId: input.planId });
  if (!gymTimplanCanEdit(before)) throw new Deny('forbidden', 403);
  if (before.revision !== input.expectedRevision) throw new Deny('conflict', 409);
  if (isGymTimplanV2(before)) {
    if (!input.commandId) throw new Deny('bad_request', 400);
    let proposal;
    try { proposal = suggestGymTimplanTimeV2(before, input.totalHours, input.mode, input.apl); } catch { throw new Deny('bad_request', 400); }
    const saved = await commandTimplanTime(tx, { contractVersion: 'timplan_time_v2', action: 'save_rows', commandId: input.commandId,
      planId: input.planId, expectedRevision: input.expectedRevision, rows: proposal.timeRows });
    const { body } = await readGymTimplan(tx, { planId: input.planId });
    if (!isGymTimplanV2(body) || body.revision !== saved.body.receipt.revision || body.rows.some(row =>
      body.timeRows[row.key].schoolMinutes.some((n, i) => n !== proposal.timeRows[row.key]?.schoolMinutes[i])
      || body.timeRows[row.key].annualAplMinutes.some((n, i) => n !== proposal.timeRows[row.key]?.annualAplMinutes[i]))) throw new AuditUnavailable();
    return { body, event: { action: 'gym_timplan_hours_distributed', objectType: 'timplan', objectId: input.planId, details: { count: proposal.changedRows.length } } };
  }
  if (input.apl) throw new Deny('bad_request', 400);
  const apl = VOCATIONAL_GY25_CODES.some(code => code === before.source.education.programCode)
    ? (await readAplPlan(tx, { planId: input.planId }, authority)).body : null;
  if (apl && (apl.timplanRevision ?? apl.revision) !== before.revision) throw new Deny('conflict', 409);
  let proposal;
  try { proposal = suggestGymTimplanHours(before, input.totalHours, input.mode, apl?.plan); }
  catch { throw new Deny('bad_request', 400); }
  let revision = before.revision;
  for (const rowKey of proposal.changedRows) {
    const { body } = await writeGymTimplanRow(tx, { planId: input.planId, expectedRevision: revision, rowKey, hours: proposal.hours[rowKey] });
    revision = body.revision;
  }
  const { body } = await readGymTimplan(tx, { planId: input.planId });
  if (isGymTimplanV2(body) || body.revision !== revision || body.rows.some(row => body.hours[row.key].some((h, i) => h !== proposal.hours[row.key]?.[i]))) throw new AuditUnavailable();
  return { body, event: { action: 'gym_timplan_hours_distributed', objectType: 'timplan', objectId: input.planId, details: { count: proposal.changedRows.length } } };
}
