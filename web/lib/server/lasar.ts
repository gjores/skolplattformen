import { gymBoolean, gymInteger, gymShape, gymUuid } from '../gym-timplan.ts';
import {
  LASAR_REASONS, LasarContractError, parseLasarCommandReply, parseLasarDecisionReply, parseLasarDecisionRequest, parseLasarEnvelope,
  lasarSchoolYear, parseLasarModePreviewReply, parseLasarOverviewReply, parseLasarOverviewRequest, parseLasarReadReply, parseLasarReadRequest,
  parseLasarStatusRequest, parseLasarSummaryReply, parseLasarSummaryRequest, verifyLasarCommandHash,
  type LasarCommandReply, type LasarCommandRequest, type LasarDecisionRequest, type LasarModePreview, type LasarOverviewReply, type LasarOverviewRequest,
  type LasarReadReply, type LasarReadRequest, type LasarReason, type LasarStatusRequest, type LasarSummaryReply, type LasarSummaryRequest, type LasarTarget,
} from '../lasar-contract.ts';
import { copySchoolYear, type CopyReviewItem } from '../lasar-copy.ts';
import { groupsFromRefs } from '../lasar-groups.ts';
import { allIssues, proposeSchoolYear } from '../lasar-model.ts';
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
 *
 * Huvudmannens ram (05.1.1-10, D-08): målet { kind: 'frame' } går oförändrat till samma ingångar. SQL ger ramen bara till
 * huvudmannen, och ett svar för ramen till rektor eller skoladministratör lämnar aldrig servern (readActor). Ramen nycklas i
 * SQL på huvudmannens ID ur uppdraget (Organisation, organisationType=Huvudman), aldrig på namn.
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
const unitOf = (request: { target: LasarTarget }) => (request.target.kind === 'school' ? request.target.unitId : null);
/** Händelsens objekt: skolans kalenderversion eller huvudmannens ramversion. */
const objectTypeOf = (target: LasarTarget) => (target.kind === 'frame' ? 'school_year_frame' : 'school_year');

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
/** Kommandot med kontrollerad payloadHash. Beslut har en egen rutt med engångskod. En tom kommentar ger lasar_text_required. */
export const parseLasarCommandInput = (value: unknown): Promise<LasarCommandRequest> => {
  const ops: unknown = value !== null && typeof value === 'object' ? (value as { ops?: unknown }).ops : undefined;
  const first: unknown = Array.isArray(ops) && ops.length === 1 ? ops[0] : undefined;
  if (first !== null && typeof first === 'object' && (first as { op?: unknown }).op === 'comment' && (first as { text?: unknown }).text === '')
    throw new LasarContractError('lasar_text_required');
  return verifyLasarCommandHash(value);
};
export const parseLasarDecisionInput = (value: unknown): LasarDecisionRequest => parseLasarDecisionRequest(value);

async function readRaw(tx: Tx, input: LasarReadRequest, authority: LasarAuthority): Promise<LasarReadReply> {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_read(${json(tx, input)}) as result`));
  try { return readActor(parseLasarReadReply(envelope(raw, authority), input), authority); } catch { throw new AuditUnavailable(); }
}

export async function lasarRead(tx: Tx, input: LasarReadRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const body = await readRaw(tx, input, authority);
  return { body, event: { action: 'lasar_read', objectType: objectTypeOf(input.target), objectId: body.calendar?.versionId ?? null,
    details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
}

/**
 * Utkastarbete. Vid create med källan proposal och vid reset_to_proposal räknar servern fram innehållet med
 * proposeSchoolYear (D-03) för skolformerna i serverns egen läsning; klienten kan inte skicka innehållet. SQL prövar det igen.
 * För huvudmannens ram är skolformerna alla huvudmannens skolenheters (ramens läsning). Skolans start ur ramen och en ny
 * ramversion (källan frame) har inget förslagsinnehåll; SQL tar ramens innehåll.
 *
 * Kopiera förra läsåret (05.1.1-11, D-04, T-05.1.1-35): klienten anger bara källan copy. Servern läser själv målåret (skolans grupper)
 * och föregående läsår, och där den gällande fastställda versionen eller den senast utgivna ramen (versionen med current). Kopian
 * räknas med copySchoolYear och skickas med källversionen och granskningsposterna; SQL prövar källan och innehållet igen.
 */
export async function lasarCommand(tx: Tx, input: LasarCommandRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  let sent: LasarCommandRequest & { proposal?: unknown; copy?: unknown } = input;
  const first = input.ops[0];
  const creating = first?.op === 'create' && first.source === 'proposal';
  if (creating || first?.op === 'reset_to_proposal') {
    const current = await readRaw(tx, { target: input.target, schoolYear: input.schoolYear, versionId: creating ? null : input.versionId }, authority);
    const proposal = proposeSchoolYear(input.schoolYear, input.target.kind === 'school' ? input.target.unitId : 'ram', current.schoolTypes);
    sent = { ...input, proposal: { terms: { ht: proposal.ht, vt: proposal.vt }, exceptions: proposal.exceptions } };
  } else if (first?.op === 'create' && first.source === 'copy') {
    sent = { ...input, copy: await copyContent(tx, input, authority) };
  }
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_command(${json(tx, sent)}) as result`));
  try {
    const body = parseLasarCommandReply(envelope(raw, authority), input);
    readActor(body.detail, authority);
    return { body, event: { action: 'lasar_command', objectType: objectTypeOf(input.target), objectId: body.detail.calendar?.versionId ?? null,
      details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}

/** Kopians innehåll ur serverns egen läsning av källan och målåret; inget tas ur klientens begäran. */
async function copyContent(tx: Tx, input: LasarCommandRequest, authority: LasarAuthority): Promise<{ sourceVersionId: string;
  terms: { ht: { start: string; end: string }; vt: { start: string; end: string } }; exceptions: unknown; groupDays: unknown; review: CopyReviewItem[] }> {
  const target = await readRaw(tx, { target: input.target, schoolYear: input.schoolYear, versionId: null }, authority);
  const previousYear = input.schoolYear - 1;
  let source = await readRaw(tx, { target: input.target, schoolYear: previousYear, versionId: null }, authority);
  const current = source.versions.find((v) => v.current);
  if (!current) throw new Deny('conflict', 409, { reason: 'lasar_not_found' });
  if (source.calendar?.versionId !== current.versionId) source = await readRaw(tx, { target: input.target, schoolYear: previousYear, versionId: current.versionId }, authority);
  const sy = lasarSchoolYear(source);
  if (!sy || source.calendar?.versionId !== current.versionId || source.calendar.status !== 'faststalld') invalid();
  const groups = (() => { try { return groupsFromRefs(target.groups); } catch { return invalid(); } })();
  const { draft, review } = copySchoolYear(sy, input.schoolYear, groups);
  return { sourceVersionId: current.versionId, terms: { ht: draft.ht, vt: draft.vt }, exceptions: draft.exceptions, groupDays: draft.groupExceptions, review };
}

/**
 * Dubbel regelkontroll (RESEARCH A8): SQL är auktoritativ, och efter ett godkänt förslag eller fastställande prövar
 * servern dessutom det sparade innehållet med allIssues i lasar-model.ts. Hittar modellen ett fel som SQL missat nekas
 * beslutet med lasar_rules_failed (409) och modellens regelkoder, och transaktionen rullas tillbaka utan delresultat.
 * Gruppreglerna (05.1.1-08) prövas för skolans grupper ur läsningen: servern bygger inga grupper själv, utan
 * groupsFromRefs gör dem ur serverns stabila referenser (utbildning, kolumn och klass), aldrig ur klassnamn.
 */
function modelRules(detail: LasarReadReply): void {
  const sy = lasarSchoolYear(detail);
  if (!sy) invalid();
  const groups = (() => { try { return groupsFromRefs(detail.groups); } catch { return invalid(); } })();
  const codes = [...new Set(allIssues(sy, detail.schoolTypes, groups).filter((i) => i.level === 'error').map((i) => i.code))];
  if (codes.length) throw new Deny('conflict', 409, { reason: 'lasar_rules_failed', rules: codes });
}

/**
 * Ändringsflödet (05.1.1-09, D-10, D-16): svaret ska visa beslutets utfall. Efter en begäran är den senaste begäran öppen med
 * samma orsak på den fastställda versionen; efter återtagande och avslag är den återtagen respektive avslagen med samma
 * motivering; efter öppning är svaret en senare version som utkast medan den tidigare fortfarande gäller, och ingen begäran
 * står öppen. Annars lämnar inget svar servern (500).
 */
function decisionOutcome(input: LasarDecisionRequest, detail: LasarReadReply): void {
  const request = detail.changeRequest, calendar = detail.calendar;
  if (input.action === 'request_change') {
    if (request?.status !== 'open' || request.reason !== input.text || calendar?.status !== 'faststalld' || calendar.versionId !== input.versionId) invalid();
  } else if (input.action === 'withdraw_request') {
    if (request?.status !== 'withdrawn') invalid();
  } else if (input.action === 'decline_request') {
    if (request?.status !== 'declined' || request.answer !== input.text) invalid();
  } else if (input.action === 'publish_frame') {
    // Ramen (D-13): samma version är nu utgiven (status faststalld i kontraktet) och gäller för skolorna.
    const ref = detail.versions.find((v) => v.versionId === input.versionId);
    if (detail.target.kind !== 'frame' || calendar?.versionId !== input.versionId || calendar.status !== 'faststalld' || !ref?.current) invalid();
  } else if (input.action === 'set_mode') {
    if (detail.target.kind !== 'frame' || detail.mode !== input.mode) invalid();
  } else if (input.action === 'reopen') {
    const previous = detail.versions.find((v) => v.versionId === input.versionId);
    const opened = calendar ? detail.versions.find((v) => v.versionId === calendar.versionId) : undefined;
    if (calendar?.status !== 'utkast' || !previous?.current || !opened || opened.version <= previous.version || request?.status === 'open') invalid();
  }
}

/** Beslut (skicka, fastställa, ändringsflödet m.fl.). Rutten kräver engångskod; SQL prövar vem som får fatta vilket beslut. */
export async function lasarDecision(tx: Tx, input: LasarDecisionRequest, authority: LasarAuthority): Promise<{ body: LasarCommandReply | LasarModePreview;
  event: { action: string; objectType: string; objectId: string | null; details: { unitId: string | null; schoolYear: number } } }> {
  role(authority, LASAR_FUNCTIONS);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_command(${json(tx, input)}) as result`));
  if (input.action === 'preview_mode_change') {
    // D-15: förhandsvisningen sparar inget och ger skolorna med påbörjade kalendrar för samma läsår och arbetssätt.
    let preview: LasarModePreview;
    try {
      preview = parseLasarModePreviewReply(envelope(raw, authority));
      if (preview.schoolYear !== input.schoolYear || preview.mode !== input.mode) invalid();
    } catch { throw new AuditUnavailable(); }
    return { body: preview, event: { action: 'lasar_decision', objectType: 'school_year_frame', objectId: null, details: { unitId: null, schoolYear: input.schoolYear } } };
  }
  let body: LasarCommandReply;
  try {
    body = parseLasarDecisionReply(envelope(raw, authority), input);
    readActor(body.detail, authority);
    decisionOutcome(input, body.detail);
  } catch { throw new AuditUnavailable(); }
  if (input.action === 'submit' || input.action === 'approve' || input.action === 'publish_frame') modelRules(body.detail);
  return { body, event: { action: 'lasar_decision', objectType: objectTypeOf(input.target), objectId: body.detail.calendar?.versionId ?? null,
    details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
}

/** Statusbegäran: kontraktets mål och läsår samt kommando-id:t vars svar uteblev (05.1.1-07). */
export type LasarCommandStatusRequest = LasarStatusRequest & { commandId: string };
export type LasarCommandStatusReply = { state: 'completed'; result: LasarCommandReply } | { state: 'not_found'; result: null };
export function parseLasarStatusInput(value: unknown): LasarCommandStatusRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'commandId')) throw new LasarContractError();
  const { commandId, ...rest } = value as Record<string, unknown>;
  let id: string;
  try { id = gymUuid(commandId); } catch { throw new LasarContractError(); }
  return { commandId: id, ...parseLasarStatusRequest(rest) };
}
/** Utfallet ur journalen: samma kommando, mål och läsår, återspelat kvitto och kalenderns revision lika med kvittots. */
function parseStatusReply(value: unknown, request: LasarCommandStatusRequest): LasarCommandStatusReply {
  const r = gymShape(value, ['state', 'result']);
  if (r.state === 'not_found') { if (r.result !== null) invalid(); return { state: 'not_found', result: null }; }
  if (r.state !== 'completed') invalid();
  const c = gymShape(r.result, ['receipt', 'detail']), k = gymShape(c.receipt, ['commandId', 'revision', 'replayed']);
  const receipt = { commandId: gymUuid(k.commandId), revision: gymInteger(k.revision), replayed: gymBoolean(k.replayed) };
  const detail = parseLasarReadReply(c.detail, { target: request.target, schoolYear: request.schoolYear });
  if (receipt.commandId !== request.commandId.toLowerCase() || !receipt.replayed || !detail.calendar || detail.calendar.revision !== receipt.revision) invalid();
  return { state: 'completed', result: { receipt, detail } };
}

/** Statusvägen efter ett uteblivet svar: läser journalens utfall för sessionens eget kommando-id och utför inget igen. */
export async function lasarStatus(tx: Tx, input: LasarCommandStatusRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_status(${json(tx, input)}) as result`));
  try {
    const body = parseStatusReply(envelope(raw, authority), input);
    if (body.result) readActor(body.result.detail, authority);
    return { body, event: { action: 'lasar_status', objectType: objectTypeOf(input.target), objectId: body.result?.detail.calendar?.versionId ?? null,
      details: { unitId: unitOf(input), schoolYear: input.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}

/**
 * Kalenderstatus per skola (05.1.1-11, D-09): rutt → lasarOverview → public.lasar_overview(jsonb). Begäran har bara läsåret; SQL väljer
 * skolorna ur aktörens aktuella uppdrag hos samma huvudman (T-05.1.1-36). Svaret tolkas av kontraktets overview-tolk utan extra fält,
 * med exakt sessionens aktör i kuvertet. Ramens utkast når aldrig rektor eller skoladministratör (T-05.1.1-34). SS 12000: skolorna anges
 * med school_units.id (Organisation, organisationType=Skolenhet); kalenderstatusen saknar objekt i standarden.
 */
export const parseLasarOverviewInput = (value: unknown): LasarOverviewRequest => parseLasarOverviewRequest(value);
export async function lasarOverview(tx: Tx, input: LasarOverviewRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_overview(${json(tx, input)}) as result`));
  let body: LasarOverviewReply;
  try {
    body = parseLasarOverviewReply(envelope(raw, authority), input);
    if (authority.accessFunction !== 'huvudman' && body.frame?.status === 'utkast') invalid();
  } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'lasar_overview', objectType: 'school_year', objectId: null, details: { unitId: null, schoolYear: input.schoolYear } } };
}

/**
 * Kalenderns sammanfattning för beroende underlag (05.1.1-13, D-11, LASAR-05): rutt → lasarSummary → public.lasar_summary(jsonb).
 * Begäran har skolan och läsåret; SQL prövar mandatet som för kalendern (T-05.1.1-40) och ger den gällande och den föregående
 * fastställda versionen med skoldagar per termin ur lasar_school_days, samma som tjanst_school_weeks (T-05.1.1-54). Svaret tolkas av
 * kontraktets summary-tolk utan extra fält, för exakt samma skola och läsår och med sessionens aktör i kuvertet. Tjänstefördelningens
 * tolkar ändras inte (Pitfall 7). SS 12000: skolan anges med school_units.id (Organisation, organisationType=Skolenhet).
 */
export const parseLasarSummaryInput = (value: unknown): LasarSummaryRequest => parseLasarSummaryRequest(value);
export async function lasarSummary(tx: Tx, input: LasarSummaryRequest, authority: LasarAuthority) {
  role(authority, LASAR_FUNCTIONS);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.lasar_summary(${json(tx, input)}) as result`));
  let body: LasarSummaryReply;
  try { body = parseLasarSummaryReply(envelope(raw, authority), input); } catch { throw new AuditUnavailable(); }
  return { body, event: { action: 'lasar_summary', objectType: 'school_year', objectId: null, details: { unitId: input.unitId, schoolYear: input.schoolYear } } };
}
