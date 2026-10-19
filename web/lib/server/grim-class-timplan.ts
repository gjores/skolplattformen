import { parseGrimClassCreateReply, parseGrimClassLinkReply, parseGrimClassUnderlag, type GrimClassCreateRequest, type GrimClassLinkRequest, type GrimClassUnderlagRequest } from '../grim-class-timplan.ts';
import { ProgramplanContractError } from '../programplan-catalog.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';
import type { ErrorCode } from './http.ts';

const conflicts = new Set(['class_plan_not_ready', 'class_plan_limit', 'class_name_year_conflict', 'grim_class_link_revision', 'grim_class_plan_revision', 'grim_class_command_conflict']);
function sqlState(error: unknown): { code?: unknown; hint?: unknown } { return error && typeof error === 'object' ? error as { code?: unknown; hint?: unknown } : {}; }
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await mandateOperation(async () => {
      try { return await fn(); } catch (error) {
        const { code, hint } = sqlState(error);
        if (code === '40001' && typeof hint === 'string' && conflicts.has(hint)) throw new Deny(hint as ErrorCode, 409);
        if (code === '22023' && hint === 'grim_class_duplicate') throw new Deny('grim_class_duplicate', 400);
        throw error;
      }
    });
  } catch (error) { if (sqlState(error).code === '55000') throw new AuditUnavailable(); throw error; }
}
function one(rows: { result: unknown }[]) { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }
export function grimClassRequest<T>(parse: (v: unknown) => T, v: unknown): T {
  try { return parse(v); } catch (error) { if (error instanceof ProgramplanContractError) throw new Deny('bad_request', 400); throw error; }
}
export async function readGrimClasses(tx: Tx, input: GrimClassUnderlagRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase51_grim_class_underlag(${tx.json(input)}) result`));
  try { return { body: parseGrimClassUnderlag(raw, input), event: { action: 'grim_class_read', objectType: 'timplan', objectId: input.planId } }; }
  catch { throw new AuditUnavailable(); }
}
export async function createGrimClass(tx: Tx, input: GrimClassCreateRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase51_grim_class_command(${tx.json({ action: 'create', ...input })}) result`));
  try { const body = parseGrimClassCreateReply(raw, input); return { body, event: { action: 'grim_class_created', objectType: 'class', objectId: body.id } }; }
  catch { throw new AuditUnavailable(); }
}
export async function linkGrimClass(tx: Tx, input: GrimClassLinkRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase51_grim_class_command(${tx.json({ action: 'link', ...input })}) result`));
  try {
    const body = parseGrimClassLinkReply(raw, input);
    return { body, event: { action: 'grim_class_linked', objectType: 'class', objectId: input.classId,
      details: { from: input.previousPlanId, to: input.planId, schoolYear: body.schoolYear, columnId: body.columnId, adopted: body.adopted } } };
  } catch { throw new AuditUnavailable(); }
}
