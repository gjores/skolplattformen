import {
  LASAR_REASONS, LasarContractError, parseLasarCommandReply, parseLasarDecisionReply, parseLasarDecisionRequest, parseLasarEnvelope,
  parseLasarReadReply, parseLasarReadRequest, verifyLasarCommandHash,
  type LasarCommandRequest, type LasarDecisionRequest, type LasarReadReply, type LasarReadRequest, type LasarReason,
} from '../lasar-contract.ts';
import { proposeSchoolYear } from '../lasar-model.ts';
import { LASAR_RULE_CODES } from '../lasar-rule-codes.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

/**
 * Serveradapter för läsårskalendern (05.1.1-06). Rutt → denna adapter → `public.lasar_read(jsonb)` eller
 * `public.lasar_command(jsonb)`. Begäran tolkas strikt mot kontraktet (lasar-contract.ts) innan SQL anropas.
 * Svaret ska bära exakt sessionens identitet och uppdrag i kuvertet och tolkas mot kontraktet innan det lämnar
 * servern; avvikelser ger AuditUnavailable (500) utan innehåll. Bara vitlistade orsaker i LASAR_REASONS når klienten.
 *
 * SS 12000: läsår, terminer och kalenderns versioner saknar objekt i standarden. Skolenheten (Organisation,
 * organisationType=Skolenhet) anges bara med stabilt ID. Klientens rollval är inget behörighetsbevis; SQL prövar
 * mandatet mot den låsta sessionen.
 */
export type LasarAuthority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
export const LASAR_REQUEST_BYTES = 64 * 1024;
export const LASAR_FUNCTIONS = ['huvudman', 'rektor', 'administrator'] as const;

function invalid(): never { throw new AuditUnavailable(); }
const reasons: ReadonlySet<string> = new Set(LASAR_REASONS);
/** 40001 med dessa orsaker blir 409; 22023 ger bara lasar_text_required som orsak, övriga indatafel 400 utan orsak. */
const conflictReasons: ReadonlySet<string> = new Set(['lasar_locked_status', 'lasar_past_day', 'lasar_revision_conflict', 'lasar_rules_failed',
  'lasar_review_open', 'lasar_frame_missing', 'lasar_frame_stale', 'lasar_mode_locked', 'lasar_command_conflict', 'lasar_not_found']);
const inputReasons: ReadonlySet<string> = new Set(['lasar_text_required']);
const ruleCodes: ReadonlySet<string> = new Set(Object.keys(LASAR_RULE_CODES));
const unreachable = new Set(['08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT']);

/** Regelkoder ur SQL-felets detail; okända koder eller fel form ger ingen lista. */
function ruleList(detail: unknown): string[] | null {
  if (typeof detail !== 'string') return null;
  try {
    const value: unknown = JSON.parse(detail);
    if (!Array.isArray(value) || !value.length || value.length > 50 || !value.every((c) => typeof c === 'string' && ruleCodes.has(c))) return null;
    return [...new Set(value as string[])];
  } catch { return null; }
}
function reason(value: unknown, allowed: ReadonlySet<string>): LasarReason | null {
  return typeof value === 'string' && allowed.has(value) && reasons.has(value) ? value as LasarReason : null;
}

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  return mandateOperation(async () => {
    try { return await fn(); }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error)) throw error;
      const { code, hint, detail } = error as { code?: unknown; hint?: unknown; detail?: unknown };
      if (code === '55000') throw new AuditUnavailable();
      if (code === '42501') throw new Deny('forbidden', 403, { reason: 'lasar_forbidden' });
      const conflict = code === '40001' ? reason(hint, conflictReasons) : null;
      if (conflict) {
        const rules = conflict === 'lasar_rules_failed' ? ruleList(detail) : null;
        throw new Deny('conflict', 409, rules ? { reason: conflict, rules } : { reason: conflict });
      }
      if (code === '22023') {
        const input = reason(hint, inputReasons);
        throw new Deny('bad_request', 400, input ? { reason: input } : undefined);
      }
      if (typeof code === 'string' && unreachable.has(code)) throw new Deny('db_unreachable', 503);
      // Okänd SQLSTATE eller orsak: inget av felet (kod, orsak, meddelande) lämnar servern; svaret blir 500.
      throw new Error('lasar_sql_unmapped');
    }
  });
}
function one(rows: { result: unknown }[]): unknown { if (rows.length !== 1) invalid(); return rows[0].result; }
function role(authority: LasarAuthority, allowed: readonly string[]): void {
  if (!allowed.includes(authority.accessFunction ?? '')) throw new Deny('forbidden', 403, { reason: 'lasar_forbidden' });
}
/** Svarskuvertets aktör ska vara exakt sessionens identitet och uppdrag (T-05.1.1-14). */
function envelope(raw: unknown, authority: LasarAuthority): unknown {
  if (!authority.identityId || !authority.assignmentId) invalid();
  return parseLasarEnvelope(raw, { identityId: authority.identityId, assignmentId: authority.assignmentId });
}
/** Förmågorna ska stämma med sessionens funktion: huvudmannen arbetar inte i skolans utkast, skolan beslutar inte. */
function readActor(body: LasarReadReply, authority: LasarAuthority): LasarReadReply {
  const c = body.capabilities, fn = authority.accessFunction;
  if (fn === 'huvudman') {
    if (body.target.kind === 'school' && (c.canEdit || c.canSubmit || c.canWithdraw || c.canRequestChange || c.canWithdrawRequest || c.canCreate.length)) invalid();
  } else if (fn === 'rektor' || fn === 'administrator') {
    if (c.canApprove || c.canReturn || c.canReopen || c.canDecline || c.canPublishFrame || c.canSetMode || body.target.kind === 'frame') invalid();
  } else invalid();
  return body;
}
const json = (tx: Tx, value: unknown) => tx.json(value as Parameters<Tx['json']>[0]);
const unitOf = (request: { target: LasarCommandRequest['target'] }) => (request.target.kind === 'school' ? request.target.unitId : null);

/** Läser hela kroppen med en övre gräns, också när Content-Length saknas eller inte stämmer. */
export async function lasarRequest<T>(request: Request, parse: (value: unknown) => T | Promise<T>): Promise<T> {
  const length = request.headers.get('Content-Length');
  if (length !== null && Number(length) > LASAR_REQUEST_BYTES) throw new Deny('bad_request', 400, { reason: 'payload_too_large' });
  if (!request.body) throw new Deny('bad_request', 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0, value: unknown;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > LASAR_REQUEST_BYTES) {
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
    if (error instanceof LasarContractError && inputReasons.has(error.reason)) throw new Deny('bad_request', 400, { reason: error.reason });
    throw new Deny('bad_request', 400);
  }
}
export const parseLasarReadInput = (value: unknown): LasarReadRequest => parseLasarReadRequest(value);
/** Kommandot med kontrollerad payloadHash. Beslut har en egen rutt med engångskod. */
export const parseLasarCommandInput = (value: unknown): Promise<LasarCommandRequest> => verifyLasarCommandHash(value);
export const parseLasarDecisionInput = (value: unknown): LasarDecisionRequest => parseLasarDecisionRequest(value);

async function readRaw(tx: Tx, input: LasarReadRequest, authority: LasarAuthority): Promise<LasarReadReply> {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_read(${json(tx, input)}) as result`));
  try { return readActor(parseLasarReadReply(envelope(raw, authority), input), authority); } catch { throw new AuditUnavailable(); }
}

export async function lasarRead(tx: Tx, input: LasarReadRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const body = await readRaw(tx, input, authority);
  return { body, event: { action: 'lasar_read', objectType: 'school_year', objectId: body.calendar?.versionId ?? null,
    details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
}

/**
 * Utkastarbete. Vid create med källan proposal räknar servern fram innehållet med proposeSchoolYear (D-03) för
 * skolformerna i serverns egen läsning; klienten kan inte skicka innehållet. SQL prövar det igen.
 */
export async function lasarCommand(tx: Tx, input: LasarCommandRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  let sent: LasarCommandRequest & { proposal?: unknown } = input;
  const first = input.ops[0];
  if (first?.op === 'create' && first.source === 'proposal' && input.target.kind === 'school') {
    const current = await readRaw(tx, { target: input.target, schoolYear: input.schoolYear, versionId: null }, authority);
    const proposal = proposeSchoolYear(input.schoolYear, input.target.unitId, current.schoolTypes);
    sent = { ...input, proposal: { terms: { ht: proposal.ht, vt: proposal.vt }, exceptions: proposal.exceptions } };
  }
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_command(${json(tx, sent)}) as result`));
  try {
    const body = parseLasarCommandReply(envelope(raw, authority), input);
    readActor(body.detail, authority);
    return { body, event: { action: 'lasar_command', objectType: 'school_year', objectId: body.detail.calendar?.versionId ?? null,
      details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}

/** Beslut (skicka, fastställa m.fl.). Rutten kräver engångskod; SQL prövar vem som får fatta vilket beslut. */
export async function lasarDecision(tx: Tx, input: LasarDecisionRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_command(${json(tx, input)}) as result`));
  try {
    const body = parseLasarDecisionReply(envelope(raw, authority), input);
    readActor(body.detail, authority);
    return { body, event: { action: 'lasar_decision', objectType: 'school_year', objectId: body.detail.calendar?.versionId ?? null,
      details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}
