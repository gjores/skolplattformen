import { ElectiveBlockError, electiveShape, electiveUuid } from '../elective-block-contract.ts';
import { ELECTIVE_PREPARATION_LIMITS, createElectivePreparationRef, assertElectivePreparationReplyCommand, assertElectivePreparationReplyHash, hashElectivePreparationSource,
  parseElectivePreparationRead, parseElectivePreparationReply, parseElectivePreparationStatus,
  type ElectivePreparationScope, type ElectivePreparationCommand, type ElectivePreparationRef, type ElectivePreparationRead } from '../elective-preparation.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
export type ElectivePreparationAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
const conflicts = new Set(['elective_preparation_command_conflict','elective_preparation_revision_conflict','elective_preparation_source_conflict','elective_preparation_in_use','elective_preparation_frame_in_use','elective_preparation_time_in_use','elective_time_parent_conflict','elective_time_revision_conflict','elective_stale_source','elective_block_in_use','elective_frame_conflict','elective_revision_conflict']);
const inputs = new Set(['elective_preparation_invalid','elective_preparation_time_missing','elective_preparation_total','elective_preparation_classes_missing','elective_preparation_options_missing','elective_preparation_groups_missing','elective_option_not_allowed']);
async function operation<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    const e = error as { code?: unknown; hint?: unknown };
    if (e?.code === '42501') throw new Deny('forbidden',403);
    if (e?.code === '40001' && conflicts.has(String(e.hint))) throw new Deny('conflict',409,{reason:String(e.hint)});
    if (e?.code === '22023') throw new Deny('bad_request',400,inputs.has(String(e.hint)) ? {reason:String(e.hint)} : undefined);
    if (['08001','08003','08006','57P01','57P02','57P03','ECONNREFUSED','CONNECTION_CLOSED','CONNECT_TIMEOUT'].includes(String(e?.code))) throw new Deny('db_unreachable',503);
    throw new AuditUnavailable();
  }
}
function authority(ctx: ElectivePreparationAuthority): void {
  if (!ctx.identityId || !ctx.assignmentId || !['rektor','administrator'].includes(ctx.accessFunction ?? '')) throw new Deny('forbidden',403);
}
function result(rows: {result:unknown}[], ctx: ElectivePreparationAuthority): unknown {
  try {
    if (rows.length !== 1) throw new Error();
    const r = electiveShape(rows[0].result,['contractVersion','actor','result']), actor = electiveShape(r.actor,['identityId','assignmentId']);
    if (r.contractVersion !== 'elective_preparation_sql_v1' || electiveUuid(actor.identityId) !== ctx.identityId.toLowerCase() || electiveUuid(actor.assignmentId) !== ctx.assignmentId!.toLowerCase()) throw new Error();
    return r.result;
  } catch { throw new AuditUnavailable(); }
}
async function trustedRead(read: ElectivePreparationRead): Promise<void> {
  if (await hashElectivePreparationSource(read) !== read.sourceHash) throw new AuditUnavailable();
}
/** Larger bounded package than a single old block command; read incrementally before JSON parsing. */
export async function electivePreparationRequest<T>(request: Request, parse: (value:unknown) => T): Promise<T> {
  const maximum = ELECTIVE_PREPARATION_LIMITS.bytes, length = request.headers.get('Content-Length');
  if (length !== null && Number(length) > maximum || !request.body) throw new Deny('bad_request',400,{reason:'payload_too_large'});
  const reader = request.body!.getReader(), chunks: Uint8Array[] = []; let size = 0, value: unknown;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Deny('bad_request',400,{reason:'payload_too_large'}); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    try { value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new Deny('bad_request',400); }
  } finally { reader.releaseLock(); }
  try { return parse(value); } catch (error) { if (error instanceof ElectiveBlockError) throw new Deny('bad_request',400); throw error; }
}
export async function readElectivePreparation(tx: Tx, ctx: ElectivePreparationAuthority, scope: ElectivePreparationScope) {
  authority(ctx);
  const rows = await operation(() => tx<{result:unknown}[]>`select public.elective_preparation_read(${tx.json(scope)}) as result`);
  try { const body = parseElectivePreparationRead(result(rows,ctx),scope); await trustedRead(body); return {body,event:{action:'elective_read',objectType:'school',objectId:scope.unitId,details:{unitId:scope.unitId}}}; }
  catch { throw new AuditUnavailable(); }
}
export async function commandElectivePreparation(tx: Tx, ctx: ElectivePreparationAuthority, command: ElectivePreparationCommand) {
  authority(ctx); const ref = await createElectivePreparationRef(command);
  const rows = await operation(() => tx<{result:unknown}[]>`select public.elective_preparation_command(${tx.json(command)}) as result`);
  try { const body = parseElectivePreparationReply(result(rows,ctx),ref); assertElectivePreparationReplyCommand(body,command); await assertElectivePreparationReplyHash(body); await trustedRead(body.read); return {body,event:{action:'elective_command',objectType:'elective_command',objectId:command.commandId,details:{unitId:command.unitId}}}; }
  catch { throw new AuditUnavailable(); }
}
export async function statusElectivePreparation(tx: Tx, ctx: ElectivePreparationAuthority, ref: ElectivePreparationRef) {
  authority(ctx);
  const rows = await operation(() => tx<{result:unknown}[]>`select public.elective_preparation_status(${tx.json(ref)}) as result`);
  try { const body = parseElectivePreparationStatus(result(rows,ctx),ref); if (body.state === 'found') { await assertElectivePreparationReplyHash(body.result); await trustedRead(body.result.read); } return {body,event:{action:'elective_status',objectType:'elective_command',objectId:ref.commandId,details:{unitId:ref.unitId}}}; }
  catch { throw new AuditUnavailable(); }
}
