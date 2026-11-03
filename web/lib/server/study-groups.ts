import { ProgramplanContractError } from '../programplan-catalog.ts';
import { parseStudyGroupRead, parseStudyGroupReply, type StudyGroupCommand, type StudyGroupScope } from '../study-group-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';

export type StudyGroupAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
const conflicts = new Set(['study_group_command_conflict', 'study_group_revision_conflict', 'study_group_member_overlap']);
const inputs = new Set(['study_group_invalid', 'study_group_period', 'study_group_class', 'study_group_valplan_course', 'study_group_identity_fixed', 'study_group_parallel_set',
  'study_group_inactive', 'study_group_member_period', 'study_group_pupil_not_placed', 'study_group_in_use', 'study_group_member_closed', 'study_group_move']);
const MAX_BYTES = 512000;

async function operation<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    const e = error as { code?: unknown; hint?: unknown };
    if (e?.code === '42501') throw new Deny('forbidden', 403);
    if (e?.code === '40001' && conflicts.has(String(e.hint))) throw new Deny('conflict', 409, { reason: String(e.hint) });
    if (e?.code === '22023') throw new Deny('bad_request', 400, inputs.has(String(e.hint)) ? { reason: String(e.hint) } : undefined);
    if (['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(String(e?.code))) throw new Deny('db_unreachable', 503);
    throw new AuditUnavailable();
  }
}
function authority(ctx: StudyGroupAuthority): void {
  if (!ctx.identityId || !ctx.assignmentId || !['rektor', 'administrator'].includes(ctx.accessFunction ?? '')) throw new Deny('forbidden', 403);
}
function result(rows: { result: unknown }[], ctx: StudyGroupAuthority): unknown {
  const r = rows.length === 1 ? rows[0].result as { contractVersion?: unknown; actor?: { identityId?: unknown; assignmentId?: unknown }; result?: unknown } : null;
  if (!r || r.contractVersion !== 'study_group_sql_v1' || String(r.actor?.identityId).toLowerCase() !== ctx.identityId.toLowerCase()
    || String(r.actor?.assignmentId).toLowerCase() !== ctx.assignmentId!.toLowerCase()) throw new AuditUnavailable();
  return r.result;
}

export async function studyGroupRequest<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const text = await request.text().catch(() => { throw new Deny('bad_request', 400); });
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Deny('bad_request', 400); }
  try { return parse(value); } catch (error) { if (error instanceof ProgramplanContractError) throw new Deny('bad_request', 400); throw error; }
}

export async function readStudyGroups(tx: Tx, ctx: StudyGroupAuthority, scope: StudyGroupScope) {
  authority(ctx);
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.study_group_read(${tx.json(scope)}) as result`);
  let body;
  try { body = parseStudyGroupRead(result(rows, ctx), scope); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'study_group_read', objectType: 'school', objectId: scope.unitId, details: { unitId: scope.unitId } } };
}

export async function commandStudyGroup(tx: Tx, ctx: StudyGroupAuthority, command: StudyGroupCommand) {
  authority(ctx);
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.study_group_command(${tx.json(command)}) as result`);
  let body;
  try { body = parseStudyGroupReply(result(rows, ctx), command); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'study_group_command', objectType: 'study_group_command', objectId: command.commandId, details: { unitId: command.unitId } } };
}
