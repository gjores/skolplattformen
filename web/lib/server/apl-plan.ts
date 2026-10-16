import {
  AplContractError, parseAplContext, parseAplFrozenBasis, parseAplReadReply, parseAplCommandReply,
  parseAplSqlEnvelope, parseAplStatusReply, projectAplPlan, verifyAplReadReply, aplSourceProfileSupported,
  type AplCommand, type AplCommandReply, type AplContext, type AplFrozenBasis, type AplProgram,
  type AplReadReply, type AplReadRequest, type AplStatusRequest,
} from '../apl-plan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { projectGymTimplan, projectSource } from './gym-timplan.ts';
import { mandateOperation } from './mandate-route.ts';

export type AplProjectionAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'organizerId' | 'accessFunction'>;
/** The wire limit is deliberately smaller than the model's combined theoretical maxima. */
export const APL_REQUEST_BYTES = 2 * 1024 * 1024;

function invalid(): never { throw new AplContractError('invalid_read_snapshot'); }

/** Independently verify the full frozen catalogue and time matrix; never substitute live data. */
export async function projectAplFrozenBasis(value: unknown, expectedPlanId: string): Promise<{ basis: AplFrozenBasis; context: AplContext }> {
  const basis = parseAplFrozenBasis(value), gym = basis.gymTimplan;
  const { body: plan } = await projectGymTimplan(gym, expectedPlanId);
  // Administrative lifecycle changes do not change the content being confirmed.
  const source = await projectSource({ ...(gym.source as Record<string, unknown>), status: 'utkast', archived: false }, gym.catalog);
  const ref = source.source.basis?.programRef;
  if (!ref) invalid();
  // projectSource has already verified the entire exact catalogue, including this program.
  const program = (gym.catalog as { programs: AplProgram[] }).programs.find(p => p.code === ref.code && p.version === ref.version);
  if (!program) invalid();
  const verifiedProgram: AplProgram = {
    code: program.code, version: program.version, category: program.category, startDate: program.startDate,
    endDate: program.endDate, canceledDate: program.canceledDate, sourceSupported: source.readiness.ready,
  };
  verifiedProgram.sourceSupported = source.readiness.ready && aplSourceProfileSupported(verifiedProgram, plan.source.startedOn);
  const context = parseAplContext({ organizerId: basis.organizerId, plan, copyReview: basis.copyReview, program: verifiedProgram });
  return { basis, context };
}

/** Authority comes from protectedRoute's freshly checked session, never from a request or receipt. */
export async function projectAplFrozenRead(value: unknown, basisValue: unknown, expectedPlanId: string, authority: AplProjectionAuthority, historicalReplay = false):
  Promise<{ body: AplReadReply; basis: AplFrozenBasis; context: AplContext }> {
  const projected = await projectAplFrozenBasis(basisValue, expectedPlanId);
  const { context } = projected, body = await verifyAplReadReply(value, context);
  if (!authority.assignmentId || !authority.identityId || authority.organizerId !== context.organizerId
    || !['huvudman', 'rektor', 'administrator'].includes(authority.accessFunction ?? '')) invalid();
  const editable = !context.plan.archived && ['utkast', 'atersand'].includes(context.plan.status);
  const canPlan = editable && ['rektor', 'administrator'].includes(authority.accessFunction ?? '');
  const applicable = context.program.category === 'VOCATIONAL_PROGRAM' || historicalReplay;
  const canSave = applicable && canPlan, canConfirm = applicable && editable && authority.accessFunction === 'rektor';
  if (body.capabilities.canSave !== canSave || body.capabilities.canConfirm !== canConfirm || context.plan.canPlan !== canPlan) invalid();
  return { ...projected, body };
}

function commandActor(reply: AplCommandReply, input: AplCommand, authority: AplProjectionAuthority, context: AplContext): void {
  // APL commands never change plan status: their frozen result must still be editable,
  // even when replaying that receipt after the live plan has subsequently been approved.
  if (!reply.detail.capabilities.canSave || input.action === 'confirm' && !reply.detail.capabilities.canConfirm) invalid();
  if (input.action === 'confirm') {
    const event = reply.detail.confirmations.at(-1);
    if (!event || event.actorId !== authority.identityId || event.assignmentId !== authority.assignmentId
      || authority.accessFunction !== 'rektor' || !projectAplPlan(context, reply.detail.plan).readyForConfirmation) invalid();
  } else for (const resolution of input.copyReviewResolutions) {
    const saved = reply.detail.copyReview.find(review => review.id === resolution.id)?.resolution;
    if (!saved || saved.actorId !== authority.identityId || saved.assignmentId !== authority.assignmentId) invalid();
  }
}

const conflictReasons = new Set(['apl_command_conflict', 'apl_revision_conflict', 'apl_content_conflict', 'apl_confirmation_limit']);
const inputReasons = new Set(['invalid_apl_plan', 'duplicate', 'unknown_content', 'allocation_without_content',
  'apl_not_vocational', 'inactive_term', 'allocation_without_total', 'allocation_exceeds_total', 'invalid_copy_review_resolution']);
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  return mandateOperation(async () => {
    try { return await fn(); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
        if (error.code === '55000') throw new AuditUnavailable();
        if (error.code === '40001' && conflictReasons.has(hint)) throw new Deny('conflict', 409, { reason: hint });
        if (error.code === '40001' && hint === 'apl_confirmation_blocked') throw new Deny('plan_decision_blocked', 409, { reason: hint });
        if (error.code === '22023' && inputReasons.has(hint)) throw new Deny('bad_request', 400, { reason: hint });
        if (['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(String(error.code))) {
          throw new Deny('db_unreachable', 503);
        }
      }
      throw error;
    }
  });
}
function one(rows: { result: unknown }[]): unknown { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }

export async function readAplPlan(tx: Tx, input: AplReadRequest, authority: AplProjectionAuthority) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_apl_plan_read(${input.planId}) as result`));
  try {
    const envelope = parseAplSqlEnvelope(raw, value => parseAplReadReply(value, input));
    const { body } = await projectAplFrozenRead(envelope.result, envelope.basis, input.planId, authority);
    return { body, event: { action: 'apl_plan_read', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}

function commandAuthority(input: AplCommand, authority: AplProjectionAuthority): void {
  if (!['rektor', 'administrator'].includes(authority.accessFunction ?? '') || input.action === 'confirm' && authority.accessFunction !== 'rektor') {
    throw new Deny('forbidden', 403);
  }
}

export async function commandAplPlan(tx: Tx, input: AplCommand, authority: AplProjectionAuthority) {
  commandAuthority(input, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_apl_plan_command(${tx.json(input)}) as result`));
  try {
    const envelope = parseAplSqlEnvelope(raw, value => parseAplCommandReply(value, input));
    const { context } = await projectAplFrozenRead(envelope.result.detail, envelope.basis, input.planId, authority, envelope.result.receipt.replayed);
    if (!envelope.result.receipt.replayed && context.program.category !== 'VOCATIONAL_PROGRAM') invalid();
    commandActor(envelope.result, input, authority, context);
    return { body: envelope.result, event: { action: 'apl_plan_command', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}

export async function readAplStatus(tx: Tx, input: AplStatusRequest, authority: AplProjectionAuthority) {
  // Status is a lookup of this actor's command, including when no receipt exists yet.
  commandAuthority(input.command, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_apl_plan_status(${tx.json(input)}) as result`));
  try {
    const envelope = parseAplSqlEnvelope(raw, value => parseAplStatusReply(value, input));
    if (envelope.result.state === 'completed') {
      const { context } = await projectAplFrozenRead(envelope.result.result.detail, envelope.basis, input.command.planId, authority, true);
      commandActor(envelope.result.result, input.command, authority, context);
    }
    return { body: envelope.result, event: { action: 'apl_plan_status_read', objectType: 'timplan', objectId: input.command.planId } };
  } catch { throw new AuditUnavailable(); }
}

/** Bound actual streamed bytes even when Content-Length is absent or dishonest. */
export async function aplRequest<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const length = request.headers.get('Content-Length');
  if (length !== null && Number(length) > APL_REQUEST_BYTES) throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
  if (!request.body) throw new Deny('bad_request', 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > APL_REQUEST_BYTES) {
        await reader.cancel();
        throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof Deny) throw error;
    throw new Deny('bad_request', 400);
  } finally { reader.releaseLock(); }
}
