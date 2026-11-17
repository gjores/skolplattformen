/**
 * Skolans salregister på servern (05.2-SM-UXF-23). Läsning och sparning går bara genom `public.school_rooms_read` och `public.school_rooms_save`,
 * som själva prövar aktören (huvudman, rektor eller administratör med mandat för skolenheten), skriver granskningsrader och ger optimistisk revision.
 */
import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import type { EventInput } from './events.ts';
import { tjanstRequest } from './tjanst.ts';
import { SKOLSALAR_VERSION, SkolsalarError, parseSkolsalarRegister, parseSkolsalarScope, parseSkolsalarSpara, type SchemaSkolsalar,
  type SkolsalarLasning, type SkolsalarRegister, type SkolsalarScope, type SkolsalarSvar } from '../skolsalar.ts';

const FUNCTIONS = ['huvudman', 'rektor', 'administrator'] as const;
type RawEnvelope = { contractVersion: 'school_rooms_sql_v1'; actor: { identityId: string; assignmentId: string }; result: Record<string, unknown> };
const event = (action: string, unitId: string): EventInput => ({ action, objectType: 'school_rooms', objectId: unitId, details: { unitId } });

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (error instanceof Deny || error instanceof AuditUnavailable) throw error;
    const e = error as { code?: string; hint?: string };
    if (e.code === '42501') throw new Deny('forbidden', 403);
    if (e.code === '55000') throw new AuditUnavailable();
    if (e.code === '40001') throw new Deny('conflict', 409, { reason: e.hint === 'school_rooms_command_conflict' ? e.hint : 'school_rooms_conflict' });
    if (e.code === '22023') throw new Deny('bad_request', 400, { reason: 'school_rooms_invalid' });
    if (['42P01', '42883', '08001', '08003', '08006', '57P01', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(e.code ?? '')) throw new Deny('db_unreachable', 503);
    throw error;
  }
}
function envelope(value: unknown, ctx: Context): RawEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditUnavailable();
  const e = value as RawEnvelope;
  if (Object.keys(e).sort().join() !== 'actor,contractVersion,result' || e.contractVersion !== 'school_rooms_sql_v1'
    || !e.actor || Object.keys(e.actor).sort().join() !== 'assignmentId,identityId'
    || e.actor.identityId !== ctx.identityId || e.actor.assignmentId !== ctx.assignmentId || !e.result || typeof e.result !== 'object') throw new AuditUnavailable();
  return e;
}
function register(value: unknown): SkolsalarRegister | null {
  try { return parseSkolsalarRegister(value); } catch (error) { if (error instanceof SkolsalarError) throw new AuditUnavailable(); throw error; }
}

/** Skolans register, eller `null` när skolan inte har något ännu. Används också av schemats läsning av underlaget. */
export async function readSkolsalar(tx: Tx, ctx: Context, unitId: string): Promise<SkolsalarRegister | null> {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.school_rooms_read(${tx.json({ contractVersion: SKOLSALAR_VERSION, unitId })}) as result`);
  if (rows.length !== 1) throw new AuditUnavailable();
  const result = envelope(rows[0].result, ctx).result;
  if (Object.keys(result).join() !== 'register') throw new AuditUnavailable();
  return register(result.register);
}
export const skolsalarDokument = (r: SkolsalarRegister | null): SchemaSkolsalar | null => r?.document ?? null;

/** Hård gräns innan tolkning: ett register är högst 100 salar. */
async function begaran<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const value = await tjanstRequest(request, raw => raw, 262144);
  try { return parse(value); } catch (error) { if (error instanceof SkolsalarError) throw new Deny('bad_request', 400, { reason: 'school_rooms_invalid' }); throw error; }
}

export async function skolsalarLasRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'school_rooms_read', { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request); const input: SkolsalarScope = await begaran(request, parseSkolsalarScope);
    const body: SkolsalarLasning = { ...input, register: await readSkolsalar(tx, ctx, input.unitId) };
    return { body, event: event('school_rooms_read', input.unitId) };
  });
}
export async function skolsalarSparaRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'school_rooms_saved', { mutating: true, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request); const input = await begaran(request, parseSkolsalarSpara);
    const rows = await operation(() => tx<{ result: unknown }[]>`select public.school_rooms_save(${tx.json(input)}) as result`);
    if (rows.length !== 1) throw new AuditUnavailable();
    const result = envelope(rows[0].result, ctx).result, saved = register(result.register);
    if (Object.keys(result).sort().join() !== 'register,replayed' || !saved || typeof result.replayed !== 'boolean'
      || JSON.stringify(saved.document) !== JSON.stringify(input.document)) throw new AuditUnavailable();
    const body: SkolsalarSvar = { contractVersion: input.contractVersion, unitId: input.unitId, register: saved, replayed: result.replayed };
    return { body, event: event('school_rooms_saved', input.unitId) };
  });
}
