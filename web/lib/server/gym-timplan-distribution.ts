import { gymTimplanCanEdit } from '../gym-timplan.ts';
import { suggestGymTimplanHours, type GymTimplanDistributionRequest } from '../gym-timplan-distribution.ts';
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
  const apl = VOCATIONAL_GY25_CODES.some(code => code === before.source.education.programCode)
    ? (await readAplPlan(tx, { planId: input.planId }, authority)).body : null;
  if (apl && apl.revision !== before.revision) throw new Deny('conflict', 409);
  let proposal;
  try { proposal = suggestGymTimplanHours(before, input.totalHours, input.mode, apl?.plan); }
  catch { throw new Deny('bad_request', 400); }
  let revision = before.revision;
  for (const rowKey of proposal.changedRows) {
    const { body } = await writeGymTimplanRow(tx, { planId: input.planId, expectedRevision: revision, rowKey, hours: proposal.hours[rowKey] });
    revision = body.revision;
  }
  const { body } = await readGymTimplan(tx, { planId: input.planId });
  if (body.revision !== revision || body.rows.some(row => body.hours[row.key].some((h, i) => h !== proposal.hours[row.key]?.[i]))) throw new AuditUnavailable();
  return { body, event: { action: 'gym_timplan_hours_distributed', objectType: 'timplan', objectId: input.planId, details: { count: proposal.changedRows.length } } };
}
