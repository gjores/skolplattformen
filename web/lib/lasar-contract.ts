// Kontraktet lasar_sql_v1 för läsårskalendern i skyddad drift (plan 05.1.1-03,
// minsta del för tracern). Strikta tolkar: uttryckliga nyckellistor, extra
// eller saknade fält nekas, samma mönster som tjanst-contract.ts. Plan 04
// bygger ut kontraktet (svarskuvert, versioner, förmågor, beslut, felorsaker).
//
// Status skickas i databasens ascii-form (forslag, atersand, faststalld) och
// mappas här till modellens namn. Klienten får aldrig roll ur sessionen:
// bara serverns `capabilities.canEdit` avgör redigering (A-01).
//
// SS 12000: `unitId` är skolenhetens interna stabila ID och motsvarar
// Organisation med organisationType=Skolenhet i SIS OpenAPI 2.1.0
// (SS12000:2020). Läsår, terminer, lovdagar och studiedagar saknar objekt i
// standarden och är intern modell. Ingen standardefterlevnad påstås.
import { gymArray, gymBoolean, gymInteger, gymObject, gymShape, gymUuid } from './gym-timplan.ts';
import { isValidDate } from './pupil-register-model.ts';
import { tjanstHashCanonical, type TjanstCanonicalValue } from './tjanst-contract.ts';
import type { Entry, Exception, ISODate, Planned, Role, SchoolYear, SchoolYearStatus } from './lasar-model.ts';
import type { LasarOp } from './lasar-ops.ts';

export const LASAR_CONTRACT_VERSION = 'lasar_sql_v1' as const;
export const LASAR_PAYLOAD_PREFIX = 'lasar_payload_v1' as const;
export const LASAR_LIMITS = { note: 200, action: 200, comment: 4000, exceptions: 400, history: 500, ops: 50, dates: 400 } as const;

export type LasarDbStatus = 'utkast' | 'forslag' | 'atersand' | 'faststalld';
const DB_STATUSES = ['utkast', 'forslag', 'atersand', 'faststalld'] as const;
const toModel: Record<LasarDbStatus, SchoolYearStatus> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };
const toDb: Record<SchoolYearStatus, LasarDbStatus> = { utkast: 'utkast', förslag: 'forslag', återsänd: 'atersand', fastställd: 'faststalld' };
export const lasarModelStatus = (status: LasarDbStatus): SchoolYearStatus => toModel[status];
export const lasarDbStatus = (status: SchoolYearStatus): LasarDbStatus => toDb[status];

export type LasarTerms = { ht: { start: ISODate; end: ISODate }; vt: { start: ISODate; end: ISODate } };
export type LasarHistoryEntry = { id: string; role: Role; at: string; action: string; comment: string };
export type LasarCalendar = {
  versionId: string;
  version: number;
  status: LasarDbStatus;
  revision: number;
  terms: LasarTerms;
  exceptions: Record<ISODate, Exception>;
  history: LasarHistoryEntry[];
};
export type LasarReadRequest = { unitId: string; schoolYear: number };
export type LasarReadReply = {
  contractVersion: typeof LASAR_CONTRACT_VERSION;
  unitId: string;
  schoolYear: number;
  calendar: LasarCalendar | null;
  capabilities: { canEdit: boolean };
};
export type LasarCommandRequest = {
  commandId: string;
  unitId: string;
  schoolYear: number;
  versionId: string;
  expectedRevision: number;
  ops: LasarOp[];
  payloadHash: string;
};
export type LasarCommandReply = { receipt: { commandId: string; revision: number; replayed: boolean }; detail: LasarReadReply };

export class LasarContractError extends TypeError {
  readonly code = 'invalid_lasar';
  readonly reason: string;
  constructor(reason = 'lasar_invalid', message = 'Läsårskalenderns underlag kunde inte kontrolleras.') {
    super(message);
    this.name = 'LasarContractError';
    this.reason = reason;
  }
}
function bad(reason?: string): never { throw new LasarContractError(reason); }
function guarded<T>(fn: () => T): T {
  try { return fn(); } catch (error) { if (error instanceof LasarContractError) throw error; return bad(); }
}
const shape = gymShape, uuid = gymUuid;
function has(value: unknown, key: string): boolean { return value !== null && typeof value === 'object' && Object.hasOwn(value, key); }
function optionalShape(value: unknown, keys: string[], optional: string[]): Record<string, unknown> {
  return shape(value, [...keys, ...optional.filter((key) => has(value, key))]);
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) bad(); return value as T;
}
/** Kodpunkter som PostgreSQL char_length; styrtecken och ensamma surrogat nekas. */
function text(value: unknown, maximum: number, allowEmpty = true): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) || value !== value.trim() || (!allowEmpty && value.length === 0)) bad();
  if (Array.from(value).length > maximum) bad();
  return value;
}
function date(value: unknown): ISODate { if (!isValidDate(value)) bad(); return value as ISODate; }
function schoolYear(value: unknown): number { return gymInteger(value, 2100, 2000); }
function revision(value: unknown): number { return gymInteger(value); }
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) bad();
  return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }

function parseTerm(value: unknown) {
  const t = shape(value, ['start', 'end']), start = date(t.start), end = date(t.end);
  if (end < start) bad();
  return { start, end };
}
function parseTerms(value: unknown): LasarTerms {
  const t = shape(value, ['ht', 'vt']), ht = parseTerm(t.ht), vt = parseTerm(t.vt);
  if (vt.start <= ht.end) bad();
  return { ht, vt };
}
function parseException(value: unknown): Exception {
  const e = optionalShape(value, ['kind'], ['note']), kind = choice(e.kind, ['lovdag', 'studiedag'] as const);
  return has(e, 'note') ? { kind, note: text(e.note, LASAR_LIMITS.note, false) } : { kind };
}
function parseExceptions(value: unknown): Record<ISODate, Exception> {
  const object = gymObject(value), keys = Object.getOwnPropertyNames(object);
  if (keys.length > LASAR_LIMITS.exceptions) bad();
  const out: Record<ISODate, Exception> = {};
  for (const key of [...keys].sort()) out[date(key)] = parseException(object[key]);
  return out;
}
function parseHistory(value: unknown): LasarHistoryEntry {
  const h = shape(value, ['id', 'role', 'at', 'action', 'comment']);
  return { id: uuid(h.id), role: choice(h.role, ['rektor', 'huvudman'] as const), at: instant(h.at), action: text(h.action, LASAR_LIMITS.action, false), comment: text(h.comment, LASAR_LIMITS.comment) };
}
function parseCalendar(value: unknown): LasarCalendar {
  const c = shape(value, ['versionId', 'version', 'status', 'revision', 'terms', 'exceptions', 'history']);
  return {
    versionId: uuid(c.versionId),
    version: gymInteger(c.version, 10000, 1),
    status: choice(c.status, DB_STATUSES),
    revision: revision(c.revision),
    terms: parseTerms(c.terms),
    exceptions: parseExceptions(c.exceptions),
    history: gymArray(c.history, LASAR_LIMITS.history).map(parseHistory),
  };
}

export function parseLasarReadRequest(value: unknown): LasarReadRequest {
  return guarded(() => {
    const r = shape(value, ['unitId', 'schoolYear']);
    return { unitId: uuid(r.unitId), schoolYear: schoolYear(r.schoolYear) };
  });
}

/** Läsningens svar. Med `request` måste skolenhet och läsår vara de begärda. */
export function parseLasarReadReply(value: unknown, request?: LasarReadRequest): LasarReadReply {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'unitId', 'schoolYear', 'calendar', 'capabilities']);
    const caps = shape(r.capabilities, ['canEdit']);
    const reply: LasarReadReply = {
      contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]),
      unitId: uuid(r.unitId),
      schoolYear: schoolYear(r.schoolYear),
      calendar: r.calendar === null ? null : parseCalendar(r.calendar),
      capabilities: { canEdit: gymBoolean(caps.canEdit) },
    };
    if (request && (reply.unitId !== uuid(request.unitId) || reply.schoolYear !== request.schoolYear)) bad('lasar_scope_mismatch');
    return reply;
  });
}

function parseOp(value: unknown): LasarOp {
  const o = optionalShape(value, ['op', 'dates', 'kind'], ['note']);
  choice(o.op, ['set_days'] as const);
  const kind = choice(o.kind, ['skoldag', 'lovdag', 'studiedag'] as const) as Planned;
  const dates = gymArray(o.dates, LASAR_LIMITS.dates).map(date);
  if (!dates.length || dates.some((d, i) => i > 0 && d <= dates[i - 1])) bad();
  if (!has(o, 'note')) return { op: 'set_days', dates, kind };
  if (kind === 'skoldag') bad();
  return { op: 'set_days', dates, kind, note: text(o.note, LASAR_LIMITS.note, false) };
}
function parseOps(value: unknown): LasarOp[] {
  const ops = gymArray(value, LASAR_LIMITS.ops).map(parseOp);
  if (!ops.length) bad();
  return ops;
}

/** payloadHash binder exakt de kommandon som skickas; servern räknar om den. */
export function lasarPayloadHash(ops: LasarOp[]): Promise<string> {
  return tjanstHashCanonical([LASAR_PAYLOAD_PREFIX, ops as unknown as TjanstCanonicalValue]);
}

export async function lasarCommandRequest(input: { unitId: string; schoolYear: number; versionId: string; expectedRevision: number; ops: LasarOp[] }): Promise<LasarCommandRequest> {
  const ops = guarded(() => parseOps(structuredClone(input.ops)));
  const base = guarded(() => ({ unitId: uuid(input.unitId), schoolYear: schoolYear(input.schoolYear), versionId: uuid(input.versionId), expectedRevision: revision(input.expectedRevision) }));
  return { commandId: crypto.randomUUID(), ...base, ops, payloadHash: await lasarPayloadHash(ops) };
}

/** Strikt tolkning av kommandot, utan kontroll av payloadHash. */
export function parseLasarCommandRequest(value: unknown): LasarCommandRequest {
  return guarded(() => {
    const r = shape(value, ['commandId', 'unitId', 'schoolYear', 'versionId', 'expectedRevision', 'ops', 'payloadHash']);
    return {
      commandId: uuid(r.commandId),
      unitId: uuid(r.unitId),
      schoolYear: schoolYear(r.schoolYear),
      versionId: uuid(r.versionId),
      expectedRevision: revision(r.expectedRevision),
      ops: parseOps(r.ops),
      payloadHash: hash(r.payloadHash),
    };
  });
}

/** Som parseLasarCommandRequest och dessutom att payloadHash stämmer med kommandona. */
export async function verifyLasarCommandHash(value: unknown): Promise<LasarCommandRequest> {
  const request = parseLasarCommandRequest(value);
  if ((await lasarPayloadHash(request.ops)) !== request.payloadHash) bad('lasar_payload_hash');
  return request;
}

/** Kommandots svar måste gälla samma kommando, skolenhet, läsår och version, med en senare revision. */
export function parseLasarCommandReply(value: unknown, request: LasarCommandRequest): LasarCommandReply {
  return guarded(() => {
    const r = shape(value, ['receipt', 'detail']);
    const receipt = shape(r.receipt, ['commandId', 'revision', 'replayed']);
    const reply: LasarCommandReply = {
      receipt: { commandId: uuid(receipt.commandId), revision: revision(receipt.revision), replayed: gymBoolean(receipt.replayed) },
      detail: parseLasarReadReply(r.detail, { unitId: request.unitId, schoolYear: request.schoolYear }),
    };
    const calendar = reply.detail.calendar;
    if (reply.receipt.commandId !== request.commandId) bad('lasar_command_mismatch');
    if (!calendar || calendar.versionId !== request.versionId || calendar.revision !== reply.receipt.revision) bad('lasar_command_mismatch');
    if (reply.receipt.revision <= request.expectedRevision) bad('lasar_command_mismatch');
    return reply;
  });
}

function historyTime(at: string): string {
  const d = new Date(at);
  return `${d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} ${d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}`;
}

/** Modellens SchoolYear för den lästa kalendern. Id:t är versionens; gruppdagar och korta veckor kommer i plan 04 och 08. */
export function lasarSchoolYear(read: LasarReadReply): SchoolYear | null {
  const c = read.calendar;
  if (!c) return null;
  const next = read.schoolYear + 1;
  const history: Entry[] = c.history.map((h) => ({ id: h.id, time: historyTime(h.at), role: h.role, action: h.action, comment: h.comment }));
  return {
    id: c.versionId,
    unitId: read.unitId,
    startYear: read.schoolYear,
    label: `Läsåret ${read.schoolYear}/${String(next).slice(2)}`,
    ht: { ...c.terms.ht },
    vt: { ...c.terms.vt },
    exceptions: structuredClone(c.exceptions),
    groupExceptions: {},
    shortWeeks: {},
    status: lasarModelStatus(c.status),
    history,
  };
}
