import { gymShape } from '../gym-timplan.ts';
import { parseNamedTimplanCreateReply, parseNamedTimplanRenameReply, type NamedTimplanCreateRequest, type NamedTimplanRenameRequest } from '../named-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { gymTimplanOperation, projectGymTimplan } from './gym-timplan.ts';

function one(rows: { result: unknown }[]): unknown {
  if (rows.length !== 1) throw new AuditUnavailable();
  return rows[0].result;
}

export async function createNamedTimplan(tx: Tx, input: NamedTimplanCreateRequest) {
  const raw = one(await gymTimplanOperation(() => tx<{ result: unknown }[]>`select public.phase5_named_timplan_create(${tx.json(input)}::jsonb) as result`));
  let reply, projected;
  try {
    const r = gymShape(raw, ['reply', 'plan']);
    reply = parseNamedTimplanCreateReply(r.reply, input);
    projected = await projectGymTimplan(r.plan, reply.id);
    const plan = projected.body;
    if (plan.offeringId !== reply.offeringId || plan.unitId !== reply.unitId || plan.version !== reply.version
      || plan.series?.id !== reply.series.id || plan.nameAtCreation !== input.name
      || plan.source.planId !== input.sourcePlanId || plan.source.revision !== input.expectedSourceRevision
      || plan.source.educationRevision !== input.expectedEducationRevision
      || reply.carriedRows + reply.resetRows !== plan.rows.length
      || !reply.replayed && (plan.revision !== reply.revision || plan.series.name !== reply.series.name || plan.series.revision !== reply.series.revision)) throw new TypeError();
  } catch { throw new AuditUnavailable(); }
  if (!projected.readiness.ready) throw new Deny('gym_timplan_source_not_ready', 409);
  return { body: reply, event: { action: 'named_timplan_created', objectType: 'timplan', objectId: reply.id } };
}

export async function renameTimplan(tx: Tx, input: NamedTimplanRenameRequest) {
  const raw = one(await gymTimplanOperation(() => tx<{ result: unknown }[]>`select public.phase5_named_timplan_rename(${tx.json(input)}::jsonb) as result`));
  try {
    const body = parseNamedTimplanRenameReply(raw, input);
    return { body, event: { action: 'timplan_renamed', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}
