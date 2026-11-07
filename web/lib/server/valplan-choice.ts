import { parseParticipantScope } from '../elective-self-contract.ts';
import { parseValplanChoiceRead, parseValplanChoiceReply, parseValplanSelfCommand, parseValplanSelfRead, parseValplanSelfReceipt, ValplanChoiceContractError, type ValplanChoiceCommand, type ValplanChoiceScope, type ValplanSelfCommand } from '../valplan-choice-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { electiveAuthorityOperation, participantRoute } from './elective-participant-route.ts';
import { tjanstRequest } from './tjanst.ts';

export type ValplanChoiceAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
const conflicts = new Set(['valplan_choice_command_conflict', 'valplan_round_conflict', 'elective_choice_conflict', 'elective_confirmation_required', 'elective_policy_missing']);
const inputs = new Set(['valplan_choice_invalid', 'valplan_choice_points', 'valplan_choice_course', 'valplan_choice_course_held', 'valplan_choice_course_twice', 'valplan_round_date', 'valplan_round_empty', 'valplan_round_row', 'valplan_round_no_classes', 'valplan_round_doubled', 'valplan_round_rows', 'valplan_round_time', 'valplan_round_points', 'study_group_pupil_not_placed', 'study_group_member_period']);

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
function authority(ctx: ValplanChoiceAuthority): void {
  if (!ctx.identityId || !ctx.assignmentId || !['rektor', 'administrator'].includes(ctx.accessFunction ?? '')) throw new Deny('forbidden', 403);
}
function result(rows: { result: unknown }[], ctx: ValplanChoiceAuthority): unknown {
  const r = rows.length === 1 ? rows[0].result as { contractVersion?: unknown; actor?: { identityId?: unknown; assignmentId?: unknown }; result?: unknown } : null;
  if (!r || r.contractVersion !== 'valplan_choice_sql_v1' || String(r.actor?.identityId).toLowerCase() !== ctx.identityId.toLowerCase()
    || String(r.actor?.assignmentId).toLowerCase() !== ctx.assignmentId!.toLowerCase()) throw new AuditUnavailable();
  return r.result;
}
export async function valplanChoiceRequest<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new Deny('bad_request', 400); }
  try { return parse(value); } catch (error) { if (error instanceof ValplanChoiceContractError || (error as Error)?.name === 'ElectiveSelfContractError') throw new Deny('bad_request', 400); throw error; }
}
export async function readValplanChoices(tx: Tx, ctx: ValplanChoiceAuthority, scope: ValplanChoiceScope) {
  authority(ctx);
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.valplan_choice_read(${tx.json(scope)}) as result`);
  let body;
  try { body = parseValplanChoiceRead(result(rows, ctx), scope); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'valplan_choice_read', objectType: 'valplan', objectId: scope.valplanId, details: { unitId: scope.unitId } } };
}
export async function commandValplanChoice(tx: Tx, ctx: ValplanChoiceAuthority, command: ValplanChoiceCommand) {
  authority(ctx);
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.valplan_choice_command(${tx.json(command)}) as result`);
  let body;
  try { body = parseValplanChoiceReply(result(rows, ctx), command); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'valplan_choice_command', objectType: 'valplan', objectId: command.valplanId, details: { unitId: command.unitId, action: command.action } } };
}

function one(rows: { result: unknown }[]): unknown { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }
export async function valplanSelfReadRoute(request: Request): Promise<Response> {
  return participantRoute(request, 'valplan_self_read', { mutating: false, scope: async () => tjanstRequest(request, parseParticipantScope) }, async (ctx, tx) => {
    const raw = one(await electiveAuthorityOperation(() => tx<{ result: unknown }[]>`select public.valplan_self_read() result`));
    try { return { body: parseValplanSelfRead(raw, ctx.epoch), event: { action: 'valplan_self_read', objectType: 'elective_participant', objectId: ctx.authority.bindingId } }; } catch { throw new AuditUnavailable(); }
  });
}
export async function valplanSelfCommandRoute(request: Request): Promise<Response> {
  let input: ValplanSelfCommand;
  return participantRoute(request, 'valplan_self_command', { mutating: true, scope: async () => { input = await tjanstRequest(request, parseValplanSelfCommand); return { unitId: input.unitId, pupilId: input.pupilId, participant: input.participant }; } }, async (ctx, tx) => {
    if (input.expectedBindingRevision !== ctx.authority.bindingRevision) throw new Deny('conflict', 409);
    const raw = one(await electiveAuthorityOperation(() => tx<{ result: unknown }[]>`select public.valplan_self_command(${tx.json(input)}) result`));
    try { const body = parseValplanSelfReceipt(raw, input, ctx.authority.bindingId); return { body, event: { action: input.action === 'confirm_guardian' ? 'elective_guardian_confirmed' : 'elective_choice_submitted', objectType: 'valplan_choice', objectId: body.choiceId } }; } catch { throw new AuditUnavailable(); }
  });
}
