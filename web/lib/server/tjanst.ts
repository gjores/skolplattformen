import {
  TJANST_PERSONAL_ACTIONS, TJANST_PLAN_ACTIONS, TJANST_SELF_ACTIONS, TjanstContractError, parsePersonalCommand, parsePersonalCommandReply,
  parsePersonalReadReply, parsePersonalReadRequest, parsePlanCommand, parsePlanCommandReply, parsePlanReadReply, parsePlanReadRequest,
  parseSelfCommand, parseSelfCommandReply, parseSelfReadReply, parseSelfReadRequest, parseStaffingReadReply, parseStaffingReadRequest,
  parseStatusReply, parseStatusRequest, verifyPlanCommandHash,
  type TjanstCommandRef, type TjanstFamily, type TjanstPersonalAction, type TjanstPersonalCommand, type TjanstPersonalRead,
  type TjanstPersonalReadRequest, type TjanstPlanAction, type TjanstPlanCommand, type TjanstPlanRead, type TjanstPlanReadRequest,
  type TjanstSelfCommand, type TjanstStatusRequest,
} from '../tjanst-contract.ts';
import { gymBoolean, gymInteger, gymShape, gymUuid } from '../gym-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

/**
 * Serveradapter för tjänstefördelningen (05.1-04). Rutt → denna adapter → `public.tjanst_*(jsonb)`.
 * Begäran tolkas strikt mot kontraktet innan SQL anropas; svaret tolkas mot kontraktet och mot sessionens
 * aktör innan det lämnar servern. Fel i den kontrollen ger AuditUnavailable utan innehåll.
 */
export type TjanstAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'organizerId' | 'accessFunction'>;
export const TJANST_REQUEST_BYTES = 64 * 1024;
/**
 * Kuvert för kommando- och statussvar från SQL. Kontraktssvaren bär ingen aktör, så SQL anger vem som skrev
 * (identitet och uppdrag ur den låsta sessionen) och servern jämför med protectedRoutes färska session.
 */
export const TJANST_SQL_ENVELOPE = 'tjanst_sql_v1' as const;

function invalid(): never { throw new AuditUnavailable(); }

// Felvokabulär enligt 05.1-02 §Gemensamt gränssnitt. Bara vitlistade hints når klienten.
const conflictReasons = new Set(['tjanst_revision_conflict', 'tjanst_command_conflict', 'tjanst_published_meanwhile', 'tjanst_content_changed',
  'tjanst_publish_blocked']);
const inputReasons = new Set(['tjanst_invalid', 'tjanst_payload_hash', 'tjanst_duplicate_row', 'tjanst_joint_too_few', 'tjanst_joint_already',
  'tjanst_comment_too_long', 'tjanst_capacity_exceeded', 'tjanst_employment_overlap', 'tjanst_person_not_at_school', 'tjanst_unknown_source']);
const unreachable = new Set(['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT']);
function sqlState(error: unknown): { code?: unknown; hint?: unknown } { return error && typeof error === 'object' ? error as { code?: unknown; hint?: unknown } : {}; }

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  return mandateOperation(async () => {
    try { return await fn(); }
    catch (error) {
      const { code, hint } = sqlState(error);
      if (code === undefined) throw error;
      if (code === '55000') throw new AuditUnavailable();
      if (code === '42501') throw new Deny('forbidden', 403);
      if (code === '40001' && typeof hint === 'string' && conflictReasons.has(hint)) throw new Deny('conflict', 409, { reason: hint });
      if (code === '22023' && typeof hint === 'string' && inputReasons.has(hint)) throw new Deny('bad_request', 400, { reason: hint });
      if (typeof code === 'string' && unreachable.has(code)) throw new Deny('db_unreachable', 503);
      // Okänd SQLSTATE eller hint: inget av felet (kod, hint, meddelande) lämnar servern; svaret blir 500.
      throw new Error('tjanst_sql_unmapped');
    }
  });
}
function one(rows: { result: unknown }[]): unknown { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }

/** Kommando- och statussvar: aktören i SQL-kuvertet ska vara exakt sessionens identitet och uppdrag. */
function envelope(raw: unknown, authority: TjanstAuthority): unknown {
  const e = gymShape(raw, ['contractVersion', 'actor', 'result']), actor = gymShape(e.actor, ['identityId', 'assignmentId']);
  if (e.contractVersion !== TJANST_SQL_ENVELOPE || !authority.identityId || !authority.assignmentId
    || gymUuid(actor.identityId) !== authority.identityId.toLowerCase() || gymUuid(actor.assignmentId) !== authority.assignmentId.toLowerCase()) invalid();
  return e.result;
}

/** Bound actual streamed bytes even when Content-Length is absent or dishonest. */
export async function tjanstRequest<T>(request: Request, parse: (value: unknown) => T | Promise<T>): Promise<T> {
  const length = request.headers.get('Content-Length');
  if (length !== null && Number(length) > TJANST_REQUEST_BYTES) throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
  if (!request.body) throw new Deny('bad_request', 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0, value: unknown;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > TJANST_REQUEST_BYTES) {
        await reader.cancel();
        throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof Deny) throw error;
    throw new Deny('bad_request', 400);
  } finally { reader.releaseLock(); }
  try { return await parse(value); } catch (error) {
    if (error instanceof TjanstContractError && inputReasons.has(error.reason)) throw new Deny('bad_request', 400, { reason: error.reason });
    throw new Deny('bad_request', 400);
  }
}

// Begäransparsers per rutt (kontraktets parsers plus ruttens egna spärrar).
function family(request: TjanstStatusRequest, expected: TjanstFamily): TjanstStatusRequest {
  if (request.command.family !== expected) throw new TjanstContractError();
  return request;
}
/** kommando-rutten: publicering har en egen rutt med engångskod (D-23); publish nekas före hash och SQL. */
export async function parsePlanCommandRequest(value: unknown): Promise<TjanstPlanCommand> {
  const command = parsePlanCommand(value);
  if (command.action === 'publish') throw new TjanstContractError();
  return verifyPlanCommandHash(command);
}
export async function parsePlanPublishRequest(value: unknown): Promise<TjanstPlanCommand> {
  const command = parsePlanCommand(value);
  if (command.action !== 'publish') throw new TjanstContractError();
  return verifyPlanCommandHash(command);
}
export const parsePlanStatusRequest = (value: unknown) => family(parseStatusRequest(value), 'plan');
export const parsePersonalStatusRequest = (value: unknown) => family(parseStatusRequest(value), 'personal');
export const parseSelfStatusRequest = (value: unknown) => family(parseStatusRequest(value), 'self');
export { parsePersonalCommand, parsePersonalReadRequest, parsePlanReadRequest, parseSelfCommand, parseSelfReadRequest, parseStaffingReadRequest };

// Tidiga rollspärrar (D-01): inget SQL-anrop när rollen aldrig kan få utföra åtgärden.
function role(authority: TjanstAuthority, allowed: string[]): void {
  if (!allowed.includes(authority.accessFunction ?? '')) throw new Deny('forbidden', 403);
}
function planAuthority(action: TjanstPlanAction, authority: TjanstAuthority): void {
  role(authority, action === 'publish' ? ['rektor'] : ['rektor', 'administrator']);
}
function personalAuthority(action: TjanstPersonalAction, authority: TjanstAuthority): void {
  role(authority, action === 'create_draft_teacher' ? ['huvudman', 'rektor'] : ['huvudman']);
}

/** Läsningens actions och capabilities ska stämma med sessionens roll: bara rektor publicerar, huvudmannen bara läser. */
function planReadActor(body: TjanstPlanRead, authority: TjanstAuthority): TjanstPlanRead {
  const fn = authority.accessFunction;
  if (fn !== 'rektor' && fn !== 'administrator' && fn !== 'huvudman') invalid();
  if (fn !== 'rektor' && (body.capabilities.canPublish || body.actions.includes('publish'))) invalid();
  if (fn === 'huvudman' && (body.capabilities.canEdit || body.actions.length)) invalid();
  return body;
}
/** Rektor ser bara sin skolas andel och kan bara lägga upp utkastlärare (D-11). */
function personalReadActor(body: TjanstPersonalRead, authority: TjanstAuthority): TjanstPersonalRead {
  if (authority.accessFunction === 'rektor' && (body.scope !== 'unit' || body.capabilities.canManage
    || body.actions.some(action => action !== 'create_draft_teacher'))) invalid();
  else if (authority.accessFunction !== 'rektor' && authority.accessFunction !== 'huvudman') invalid();
  return body;
}
/** Kommandots detaljläsning: rektor läser skolans vy för utkastet, huvudmannen hela huvudmannen. */
function personalDetailRequest(command: Pick<TjanstPersonalCommand, 'action' | 'payload'>, authority: TjanstAuthority): TjanstPersonalReadRequest {
  if (authority.accessFunction !== 'rektor') return {};
  const unitId = (command.payload as { unitId?: string }).unitId;
  if (!unitId) invalid();
  return { unitId };
}

const json = (tx: Tx, value: unknown) => tx.json(value as Parameters<Tx['json']>[0]);

export async function planRead(tx: Tx, input: TjanstPlanReadRequest, authority: TjanstAuthority) {
  role(authority, ['rektor', 'administrator', 'huvudman']);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_plan_read(${json(tx, input)}) as result`));
  try {
    const body = planReadActor(parsePlanReadReply(raw, input), authority);
    return { body, event: { action: 'tjanst_plan_read', objectType: 'tjanst_distribution', objectId: body.version?.id ?? null,
      details: { unitId: input.unitId, schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}

async function planWrite(tx: Tx, input: TjanstPlanCommand, authority: TjanstAuthority, action: string) {
  planAuthority(input.action, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_plan_command(${json(tx, input)}) as result`));
  try {
    const body = parsePlanCommandReply(envelope(raw, authority), input);
    planReadActor(body.detail, authority);
    return { body, event: { action, objectType: 'tjanst_version', objectId: body.receipt.versionId,
      details: { unitId: input.unitId, schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}
export function planCommand(tx: Tx, input: TjanstPlanCommand, authority: TjanstAuthority) {
  if (input.action === 'publish') throw new Deny('bad_request', 400);
  return planWrite(tx, input, authority, 'tjanst_plan_command');
}
/** Samma SQL-entrypoint som kommando, men bara action publish med expectedContentHash (rutten kräver mfa och rektor). */
export function planPublish(tx: Tx, input: TjanstPlanCommand, authority: TjanstAuthority) {
  if (input.action !== 'publish') throw new Deny('bad_request', 400);
  return planWrite(tx, input, authority, 'tjanst_plan_published');
}

// Statuskvitton kontrolleras mot den minimala referensen, eftersom statusbegäran inte bär hela kommandot.
const hashPattern = /^sha256:[0-9a-f]{64}$/u;
function planStatusResult(value: unknown, ref: TjanstCommandRef, authority: TjanstAuthority) {
  const r = gymShape(value, ['receipt', 'detail']);
  const t = gymShape(r.receipt, ['commandId', 'action', 'versionId', 'revision', 'contentHash', 'replayed', 'changed']);
  if (gymUuid(t.commandId) !== ref.commandId || t.action !== ref.action || !(TJANST_PLAN_ACTIONS as readonly unknown[]).includes(t.action)
    || typeof t.contentHash !== 'string' || !hashPattern.test(t.contentHash)) invalid();
  const receipt = { commandId: ref.commandId, action: ref.action as TjanstPlanAction, versionId: t.versionId === null ? null : gymUuid(t.versionId),
    revision: gymInteger(t.revision, 2147483647, 1), contentHash: t.contentHash, replayed: gymBoolean(t.replayed), changed: gymBoolean(t.changed) };
  const detail = planReadActor(parsePlanReadReply(r.detail, { unitId: ref.target.unitId!, schoolYear: ref.target.schoolYear! }), authority);
  if (detail.revision < receipt.revision) invalid();
  return { receipt, detail };
}
function personalStatusResult(value: unknown, ref: TjanstCommandRef, authority: TjanstAuthority) {
  const r = gymShape(value, ['receipt', 'detail']), t = gymShape(r.receipt, ['commandId', 'action', 'personId', 'revision', 'replayed']);
  const personId = gymUuid(t.personId);
  if (gymUuid(t.commandId) !== ref.commandId || t.action !== ref.action || !(TJANST_PERSONAL_ACTIONS as readonly unknown[]).includes(t.action)
    || ref.target.personId !== null && personId !== ref.target.personId) invalid();
  const receipt = { commandId: ref.commandId, action: ref.action as TjanstPersonalAction, personId, revision: gymInteger(t.revision, 2147483647, 1),
    replayed: gymBoolean(t.replayed) };
  const expected = authority.accessFunction === 'rektor' ? (ref.target.unitId ? { unitId: ref.target.unitId } : invalid()) : {};
  return { receipt, detail: personalReadActor(parsePersonalReadReply(r.detail, expected), authority) };
}
function selfStatusResult(value: unknown, ref: TjanstCommandRef) {
  const r = gymShape(value, ['receipt', 'detail']), t = gymShape(r.receipt, ['commandId', 'action', 'versionId', 'feedbackId', 'replayed']);
  if (gymUuid(t.commandId) !== ref.commandId || t.action !== ref.action || !(TJANST_SELF_ACTIONS as readonly unknown[]).includes(t.action)
    || gymUuid(t.versionId) !== ref.target.versionId) invalid();
  const receipt = { commandId: ref.commandId, action: ref.action as TjanstSelfCommand['action'], versionId: ref.target.versionId!,
    feedbackId: gymUuid(t.feedbackId), replayed: gymBoolean(t.replayed) };
  const detail = parseSelfReadReply(r.detail), publication = detail.publications.find(p => p.versionId === receipt.versionId);
  if (receipt.action === 'ack' && !publication?.acknowledgedAt || receipt.action === 'comment' && !publication?.comments.some(c => c.id === receipt.feedbackId)) invalid();
  return { receipt, detail };
}

export async function planStatus(tx: Tx, input: TjanstStatusRequest, authority: TjanstAuthority) {
  // Status är en uppslagning av sessionens eget kommando, också när inget kvitto finns ännu.
  if (input.command.family !== 'plan') throw new Deny('bad_request', 400);
  planAuthority(input.command.action as TjanstPlanAction, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_plan_status(${json(tx, input)}) as result`));
  try {
    const body = parseStatusReply(envelope(raw, authority), input.command, value => planStatusResult(value, input.command, authority));
    return { body, event: { action: 'tjanst_plan_status_read', objectType: 'tjanst_version', objectId: body.result?.receipt.versionId ?? null,
      details: { unitId: input.command.target.unitId, schoolYear: input.command.target.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}

export async function personalRead(tx: Tx, input: TjanstPersonalReadRequest, authority: TjanstAuthority) {
  role(authority, ['huvudman', 'rektor']);
  if (authority.accessFunction === 'rektor' && input.unitId === undefined) throw new Deny('bad_request', 400);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_personal_read(${json(tx, input)}) as result`));
  try {
    const body = personalReadActor(parsePersonalReadReply(raw, input), authority);
    return { body, event: { action: 'tjanst_personal_read', objectType: 'staff_person', objectId: input.personId ?? null,
      details: { unitId: input.unitId ?? null } } };
  } catch { throw new AuditUnavailable(); }
}
/** Rutten kräver engångskod för huvudmannen före denna adapter (D-23); rektor får bara create_draft_teacher. */
export async function personalCommand(tx: Tx, input: TjanstPersonalCommand, authority: TjanstAuthority) {
  personalAuthority(input.action, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_personal_command(${json(tx, input)}) as result`));
  try {
    const body = parsePersonalCommandReply(envelope(raw, authority), input, personalDetailRequest(input, authority));
    personalReadActor(body.detail, authority);
    return { body, event: { action: 'tjanst_personal_command', objectType: 'staff_person', objectId: body.receipt.personId,
      details: { unitId: (input.payload as { unitId?: string }).unitId ?? null } } };
  } catch { throw new AuditUnavailable(); }
}
export async function personalStatus(tx: Tx, input: TjanstStatusRequest, authority: TjanstAuthority) {
  if (input.command.family !== 'personal') throw new Deny('bad_request', 400);
  personalAuthority(input.command.action as TjanstPersonalAction, authority);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_personal_status(${json(tx, input)}) as result`));
  try {
    const body = parseStatusReply(envelope(raw, authority), input.command, value => personalStatusResult(value, input.command, authority));
    return { body, event: { action: 'tjanst_personal_status_read', objectType: 'staff_person', objectId: body.result?.receipt.personId ?? null,
      details: { unitId: input.command.target.unitId } } };
  } catch { throw new AuditUnavailable(); }
}

// Egen väg (D-03): inget person-ID från klienten. Personen härleds i SQL ur sessionens bindning.
export async function selfRead(tx: Tx, input: Record<string, never>, authority: TjanstAuthority) {
  role(authority, ['larare']);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_self_read(${json(tx, input)}) as result`));
  try {
    const body = parseSelfReadReply(raw);
    return { body, event: { action: 'tjanst_self_read', objectType: 'staff_person', objectId: body.person.id } };
  } catch { throw new AuditUnavailable(); }
}
/** Händelsen bär bara versionens referens; kommentarstexten skrivs aldrig i säkerhetshändelsen (TJANST-05). */
export async function selfCommand(tx: Tx, input: TjanstSelfCommand, authority: TjanstAuthority) {
  role(authority, ['larare']);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_self_command(${json(tx, input)}) as result`));
  try {
    const body = parseSelfCommandReply(envelope(raw, authority), input);
    return { body, event: { action: 'tjanst_self_command', objectType: 'tjanst_version', objectId: input.versionId } };
  } catch { throw new AuditUnavailable(); }
}
export async function selfStatus(tx: Tx, input: TjanstStatusRequest, authority: TjanstAuthority) {
  if (input.command.family !== 'self') throw new Deny('bad_request', 400);
  role(authority, ['larare']);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_self_status(${json(tx, input)}) as result`));
  try {
    const body = parseStatusReply(envelope(raw, authority), input.command, value => selfStatusResult(value, input.command));
    return { body, event: { action: 'tjanst_self_status_read', objectType: 'tjanst_version', objectId: input.command.target.versionId } };
  } catch { throw new AuditUnavailable(); }
}

/** Huvudmannens uppföljning: bara läsning, inga beslutsåtgärder. */
export async function staffingRead(tx: Tx, input: { schoolYear: number }, authority: TjanstAuthority) {
  role(authority, ['huvudman']);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.tjanst_staffing_read(${json(tx, input)}) as result`));
  try {
    const body = parseStaffingReadReply(raw, input);
    return { body, event: { action: 'tjanst_staffing_read', objectType: 'organizer', objectId: authority.organizerId,
      details: { schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}
