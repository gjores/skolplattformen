import { ProgramplanContractError } from '../programplan-catalog.ts';
import catalog from '../programplan-catalog.generated.json' with { type: 'json' };
import type { ProgramplanCatalog } from '../programplan-catalog.ts';
import { valplanDiagnostics } from '../valplan-model.ts';
import { parseValplanRead, parseValplanReply, type ValplanCommand, type ValplanScope } from '../valplan-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';

export type ValplanAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
const conflicts = new Set(['valplan_command_conflict', 'valplan_revision_conflict', 'valplan_row_conflict']);
const inputs = new Set(['valplan_invalid', 'valplan_row_kind', 'valplan_course_not_in_catalog', 'valplan_course_class', 'valplan_course_identity', 'valplan_duplicate_course', 'valplan_kind_fixed']);
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
function authority(ctx: ValplanAuthority): void {
  if (!ctx.identityId || !ctx.assignmentId || !['rektor', 'administrator'].includes(ctx.accessFunction ?? '')) throw new Deny('forbidden', 403);
}
function result(rows: { result: unknown }[], ctx: ValplanAuthority): unknown {
  const r = rows.length === 1 ? rows[0].result as { contractVersion?: unknown; actor?: { identityId?: unknown; assignmentId?: unknown }; result?: unknown } : null;
  if (!r || r.contractVersion !== 'valplan_sql_v1' || String(r.actor?.identityId).toLowerCase() !== ctx.identityId.toLowerCase()
    || String(r.actor?.assignmentId).toLowerCase() !== ctx.assignmentId!.toLowerCase()) throw new AuditUnavailable();
  return r.result;
}

export async function valplanRequest<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const text = await request.text().catch(() => { throw new Deny('bad_request', 400); });
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Deny('bad_request', 400); }
  try { return parse(value); } catch (error) { if (error instanceof ProgramplanContractError) throw new Deny('bad_request', 400); throw error; }
}

async function read(tx: Tx, ctx: ValplanAuthority, scope: ValplanScope) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.valplan_read(${tx.json(scope)}) as result`);
  try { return parseValplanRead(result(rows, ctx), scope); } catch { throw new AuditUnavailable(); }
}

export async function readValplaner(tx: Tx, ctx: ValplanAuthority, scope: ValplanScope) {
  authority(ctx);
  const body = await read(tx, ctx, scope);
  return { body, event: { action: 'valplan_read', objectType: 'school', objectId: scope.unitId, details: { unitId: scope.unitId } } };
}

/** Model rules are checked against the rows read in the same transaction before the database applies its own guards. */
export async function commandValplan(tx: Tx, ctx: ValplanAuthority, command: ValplanCommand) {
  authority(ctx);
  if (command.catalogId !== (catalog as ProgramplanCatalog).catalogId) throw new Deny('bad_request', 400, { reason: 'valplan_catalog' });
  const current = await read(tx, ctx, command);
  const errors = valplanDiagnostics(command.valplan, current.rows, catalog as ProgramplanCatalog).filter(d => d.severity === 'error');
  if (errors.length) throw new Deny('bad_request', 400, { reason: errors[0].code });
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.valplan_command(${tx.json(command)}) as result`);
  let body;
  try { body = parseValplanReply(result(rows, ctx), command); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'valplan_command', objectType: 'valplan', objectId: command.valplan.id, details: { unitId: command.unitId } } };
}
