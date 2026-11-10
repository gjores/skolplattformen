// Kontraktet lasar_sql_v1 för läsårskalendern i skyddad drift (planerna
// 05.1.1-03 och 04). Hela fasens gränssnitt: läsning, svarskuvert,
// kommandon, beslut, status, överblick, sammanfattning och felorsaker.
// Senare SQL (plan 06–11) och serverlager följer det här kontraktet.
// Strikta tolkar: uttryckliga nyckellistor, extra eller saknade fält nekas,
// samma mönster som tjanst-contract.ts.
//
// Status skickas i databasens ascii-form (forslag, atersand, faststalld) och
// mappas här till modellens namn. Klienten får aldrig roll ur sessionen:
// knappar och redigering styrs bara av serverns förmågor (A-01).
//
// SS 12000 (SIS OpenAPI 2.1.0, SS12000:2020, avsedd kompatibilitet, inget
// verifierat utbyte): bara stabila ID:n är nycklar. `unitId` ↔ Organisation
// (organisationType=Skolenhet), `classId` ↔ Group (groupType=Klass),
// `offeringId` är en lokal studieväg per elevkull. Namn är etiketter och
// nekas som ID. Läsår, terminer, lovdagar, studiedagar, ramen och
// kalenderns versioner saknar objekt i standarden och exporteras inte.
import { gymArray, gymBoolean, gymInteger, gymObject, gymShape, gymUuid } from './gym-timplan.ts';
import { isValidDate } from './pupil-register-model.ts';
import { tjanstHashCanonical, type TjanstCanonicalValue } from './tjanst-contract.ts';
import { COPY_REVIEW_REASONS, type CopyReviewItem, type CopyReviewKind, type TermEdgeKey } from './lasar-copy.ts';
import type { FrameYear } from './lasar-frame.ts';
import type { LasarGroupRef } from './lasar-groups.ts';
import { LASAR_RULE_CODES, type LasarRuleCode } from './lasar-rule-codes.ts';
import { formatDate, type Cause, type Entry, type Exception, type GroupException, type ISODate, type Planned, type SchoolYear, type SchoolYearStatus, type ShortWeek } from './lasar-model.ts';
import type { LasarOp } from './lasar-ops.ts';

export const LASAR_CONTRACT_VERSION = 'lasar_sql_v1' as const;
export const LASAR_PAYLOAD_PREFIX = 'lasar_payload_v1' as const;
export const LASAR_LIMITS = {
  note: 200, action: 200, comment: 4000, name: 200, exceptions: 400, history: 500, ops: 50, dates: 400,
  versions: 100, groups: 2000, groupDays: 400, review: 400, classes: 2000, rows: 50, schools: 1000, accepted: 400, itemId: 200,
} as const;

export type LasarDbStatus = 'utkast' | 'forslag' | 'atersand' | 'faststalld';
const DB_STATUSES = ['utkast', 'forslag', 'atersand', 'faststalld'] as const;
const toModel: Record<LasarDbStatus, SchoolYearStatus> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };
const toDb: Record<SchoolYearStatus, LasarDbStatus> = { utkast: 'utkast', förslag: 'forslag', återsänd: 'atersand', fastställd: 'faststalld' };
export const lasarModelStatus = (status: LasarDbStatus): SchoolYearStatus => toModel[status];
export const lasarDbStatus = (status: SchoolYearStatus): LasarDbStatus => toDb[status];

// ---------------------------------------------------------------- typer

export type LasarTarget = { kind: 'school'; unitId: string } | { kind: 'frame' };
export type LasarMode = 'ram' | 'eget';
export type LasarActorRole = 'rektor' | 'skoladministrator' | 'huvudman';
export const lasarRoleLabel: Record<LasarActorRole, string> = { rektor: 'Rektor', skoladministrator: 'Skoladministratör', huvudman: 'Huvudman' };
export type LasarTerms = { ht: { start: ISODate; end: ISODate }; vt: { start: ISODate; end: ISODate } };
export type LasarHistoryEntry = { id: string; role: LasarActorRole; actorName: string; at: string; action: string; comment: string; version: number };
export type LasarVersionRef = { versionId: string; version: number; status: LasarDbStatus; decidedOn: ISODate | null; current: boolean };
export type LasarCalendar = {
  versionId: string;
  version: number;
  status: LasarDbStatus;
  revision: number;
  terms: LasarTerms;
  exceptions: Record<ISODate, Exception>;
  /** Gruppdagar per grupp-ID ur lasar-groups.ts. */
  groupDays: Record<string, Record<ISODate, GroupException>>;
  shortWeeks: Record<string, ShortWeek>;
  frameVersionId: string | null;
  contentHash: string;
  decidedOn: ISODate | null;
  history: LasarHistoryEntry[];
};
export const LASAR_CREATE_SOURCES = ['proposal', 'frame', 'copy'] as const;
export type LasarCreateSource = typeof LASAR_CREATE_SOURCES[number];
export type LasarCapabilities = {
  canEdit: boolean; canSubmit: boolean; canWithdraw: boolean; canRequestChange: boolean; canWithdrawRequest: boolean;
  canReturn: boolean; canApprove: boolean; canReopen: boolean; canDecline: boolean; canComment: boolean;
  canCreate: LasarCreateSource[]; canPublishFrame: boolean; canSetMode: boolean;
};
const CAPABILITY_FLAGS = ['canEdit', 'canSubmit', 'canWithdraw', 'canRequestChange', 'canWithdrawRequest', 'canReturn', 'canApprove',
  'canReopen', 'canDecline', 'canComment', 'canPublishFrame', 'canSetMode'] as const;
export type LasarChangeRequest = {
  id: string; status: 'open' | 'declined' | 'withdrawn' | 'accepted'; reason: string; answer: string | null; requestedAt: string; answeredAt: string | null;
};
export type LasarReviewItem = CopyReviewItem & { resolved: boolean };
export type LasarFrameRef = FrameYear & { publishedOn: ISODate };
export type LasarFrameState = { current: LasarFrameRef | null; latest: LasarFrameRef | null; acknowledgedVersionId: string | null };
export type LasarTeachingClass = {
  classId: string; name: string; offeringId: string; columnId: string | null; timplanId: string; timplanVersion: number;
  rows: { columnId: string; hours: number }[];
};
export type LasarTeaching = { classes: LasarTeachingClass[]; imClassIds: string[] };
export type LasarReadRequest = { target: LasarTarget; schoolYear: number; versionId: string | null };
export type LasarReadReply = {
  contractVersion: typeof LASAR_CONTRACT_VERSION;
  target: LasarTarget;
  schoolYear: number;
  schoolName: string;
  schoolTypes: string[];
  mode: LasarMode;
  modeLocked: boolean;
  versions: LasarVersionRef[];
  calendar: LasarCalendar | null;
  capabilities: LasarCapabilities;
  /** Första dag som går att ändra när läsåret har börjat (D-12), annars null. */
  editableFrom: ISODate | null;
  changeRequest: LasarChangeRequest | null;
  review: LasarReviewItem[];
  frame: LasarFrameState | null;
  groups: LasarGroupRef[];
  teaching: LasarTeaching;
  previousYearAvailable: boolean;
};

/** Kommandon som står ensamma i ett anrop (inte en skillnad mellan två lägen). */
export type LasarCommandOp =
  | { op: 'create'; source: LasarCreateSource }
  | { op: 'reset_to_proposal' }
  | { op: 'resolve_review'; itemId: string; resolution: 'inserted' | 'changed' | 'dismissed' }
  | { op: 'take_frame_changes'; frameVersionId: string; accepted: string[] }
  | { op: 'keep_school_calendar'; frameVersionId: string }
  | { op: 'comment'; text: string };
export type LasarAnyOp = LasarOp | LasarCommandOp;
export type LasarCommandRequest = {
  commandId: string;
  target: LasarTarget;
  schoolYear: number;
  /** Null bara vid `create`. */
  versionId: string | null;
  expectedRevision: number | null;
  ops: LasarAnyOp[];
  payloadHash: string;
};
export type LasarReceipt = { commandId: string; revision: number; replayed: boolean };
export type LasarCommandReply = { receipt: LasarReceipt; detail: LasarReadReply };

export const LASAR_DECISIONS = ['submit', 'withdraw', 'return', 'approve', 'reopen', 'request_change', 'withdraw_request',
  'decline_request', 'publish_frame', 'preview_mode_change', 'set_mode'] as const;
export type LasarDecision = typeof LASAR_DECISIONS[number];
/** Obligatorisk text per beslut, med modellens och UI-SPEC:s valideringstext; null = frivillig. */
export const LASAR_TEXT_REQUIRED: Record<LasarDecision, string | null> = {
  submit: 'Beskriv förslaget för huvudmannen.',
  withdraw: null,
  return: 'Ange vad rektorn behöver ändra.',
  approve: 'Dokumentera beslutet.',
  reopen: 'Ange skälet.',
  request_change: 'Ange orsaken till ändringen.',
  withdraw_request: null,
  decline_request: 'Ange skälet till avslaget.',
  publish_frame: null,
  preview_mode_change: null,
  set_mode: null,
};
const MODE_DECISIONS: readonly LasarDecision[] = ['preview_mode_change', 'set_mode'];
const FRAME_DECISIONS: readonly LasarDecision[] = ['publish_frame', 'preview_mode_change', 'set_mode'];
export type LasarDecisionRequest = {
  commandId: string;
  target: LasarTarget;
  schoolYear: number;
  versionId: string | null;
  expectedRevision: number | null;
  action: LasarDecision;
  text: string;
  mode: LasarMode | null;
  /** Skolenheter som huvudmannen har sett i förhandsvisningen (D-15); bara vid set_mode. */
  confirmAffected: string[];
};
export type LasarDecisionReply = LasarCommandReply;
export type LasarModePreview = { contractVersion: typeof LASAR_CONTRACT_VERSION; schoolYear: number; mode: LasarMode; affected: { unitId: string; schoolName: string; status: LasarDbStatus }[] };

export type LasarStatusRequest = { target: LasarTarget; schoolYear: number };
export type LasarStatusReply = {
  contractVersion: typeof LASAR_CONTRACT_VERSION; target: LasarTarget; schoolYear: number;
  calendar: { versionId: string; version: number; status: LasarDbStatus; revision: number; contentHash: string } | null;
  current: { versionId: string; version: number; decidedOn: ISODate } | null;
};
export type LasarOverviewRequest = { schoolYear: number };
export type LasarOverviewSchool = {
  unitId: string; schoolName: string; status: LasarDbStatus | null; versions: LasarVersionRef[];
  frameChanged: boolean; changeRequested: boolean; waitingFor: 'rektor' | 'huvudman' | null;
};
export type LasarOverviewReply = {
  contractVersion: typeof LASAR_CONTRACT_VERSION; schoolYear: number; mode: LasarMode;
  frame: { status: 'utkast' | 'utgiven'; version: number } | null; schools: LasarOverviewSchool[];
};
export type LasarSummaryRequest = { unitId: string; schoolYear: number };
export type LasarSummaryStat = { version: number; decidedOn: ISODate; htSchoolDays: number; vtSchoolDays: number; contentHash: string };
export type LasarSummaryReply = { contractVersion: typeof LASAR_CONTRACT_VERSION; unitId: string; schoolYear: number; current: LasarSummaryStat | null; previous: LasarSummaryStat | null };

// ---------------------------------------------------------------- felorsaker

export const LASAR_REASONS = ['lasar_forbidden', 'lasar_locked_status', 'lasar_past_day', 'lasar_revision_conflict', 'lasar_rules_failed',
  'lasar_review_open', 'lasar_frame_missing', 'lasar_frame_stale', 'lasar_mode_locked', 'lasar_command_conflict', 'lasar_text_required',
  'lasar_not_found'] as const;
export type LasarReason = typeof LASAR_REASONS[number];
export type LasarErrorContext = {
  status?: SchoolYearStatus;
  editableFrom?: ISODate | null;
  action?: LasarDecision;
  reviewOpen?: number;
  schoolYear?: number;
};
const yearText = (y?: number) => (y ? `${y}/${String(y + 1).slice(2)}` : 'läsåret');
/** Texterna ur UI-SPEC avsnitt 9–13. Bara vitlistade orsaker ger egen text (T-05.1.1-08). */
export const LASAR_ERROR_TEXT: Record<LasarReason, (ctx: LasarErrorContext) => string> = {
  lasar_forbidden: () => 'Du har inte behörighet att ändra den här kalendern. Kalendern har lästs om.',
  lasar_locked_status: ({ status }) => (status === 'fastställd'
    ? 'Kalendern är fastställd och kan inte ändras. Begär ändring för att få en ny version.'
    : 'Kalendern är skickad och kan inte ändras. Ta tillbaka förslaget för att ändra.'),
  lasar_past_day: ({ editableFrom }) => (editableFrom
    ? `Passerade dagar kan inte ändras. Dagar från och med ${formatDate(editableFrom, true)} kan ändras i den nya versionen.`
    : 'Passerade dagar kan inte ändras. Kommande dagar kan ändras i den nya versionen.'),
  lasar_revision_conflict: () => 'Kalendern ändrades av någon annan. Den har lästs om och din senaste ändring sparades inte. Gör om ändringen om den fortfarande behövs.',
  lasar_rules_failed: ({ action }) => (action === 'approve' ? 'Kalendern kunde inte fastställas:' : action === 'submit' ? 'Förslaget kunde inte skickas:' : 'Kalendern uppfyller inte förordningarna:'),
  lasar_review_open: ({ reviewOpen }) => `${reviewOpen ?? 'Några'} kopierade dagar är inte granskade. Granska dem innan du skickar förslaget.`,
  lasar_frame_missing: ({ schoolYear }) => `Huvudmannen har inte gett ut ramen för ${yearText(schoolYear)}. Du kan börja när ramen finns.`,
  lasar_frame_stale: () => 'Ramen har ändrats sedan jämförelsen. Kalendern har lästs om. Granska skillnaderna igen.',
  lasar_mode_locked: ({ schoolYear }) => `Läsåret ${yearText(schoolYear)} har börjat. Arbetssättet kan inte ändras.`,
  lasar_command_conflict: () => 'Ändringen har redan skickats med andra uppgifter. Kalendern har lästs om. Gör om ändringen om den fortfarande behövs.',
  lasar_text_required: ({ action }) => (action && LASAR_TEXT_REQUIRED[action]) || 'Skriv en text innan du fortsätter.',
  lasar_not_found: () => 'Kalendern finns inte längre i den här versionen. Den har lästs om.',
};
export const LASAR_UNCERTAIN_TEXT = 'Det gick inte att bekräfta att ändringen sparades. Kalendern har lästs om. Kontrollera dagen.';
export const LASAR_GENERIC_TEXT = 'Ändringen sparades inte. Kalendern har lästs om.';
export const isLasarReason = (value: unknown): value is LasarReason => typeof value === 'string' && (LASAR_REASONS as readonly string[]).includes(value);
export function lasarErrorText(reason: LasarReason, ctx: LasarErrorContext): string { return LASAR_ERROR_TEXT[reason](ctx); }

// ---------------------------------------------------------------- tolkhjälp

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
/** Fri text från användaren (kommentar, beslut): radbrytningar tillåts. */
function longText(value: unknown, maximum: number, allowEmpty = true): string {
  if (typeof value !== 'string' || /[\p{Cf}\p{Cs}]|(?!\n)\p{Cc}/u.test(value) || value !== value.trim() || (!allowEmpty && value.length === 0)) bad();
  if (Array.from(value).length > maximum) bad();
  return value;
}
function nullable<T>(value: unknown, parse: (v: unknown) => T): T | null { return value === null ? null : parse(value); }
function date(value: unknown): ISODate { if (!isValidDate(value)) bad(); return value as ISODate; }
function schoolYear(value: unknown): number { return gymInteger(value, 2100, 2000); }
function revision(value: unknown): number { return gymInteger(value); }
function version(value: unknown): number { return gymInteger(value, 10000, 1); }
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) bad();
  return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function sortedDates(value: unknown): ISODate[] {
  const dates = gymArray(value, LASAR_LIMITS.dates).map(date);
  if (!dates.length || dates.some((d, i) => i > 0 && d <= dates[i - 1])) bad();
  return dates;
}
function unique<T>(values: T[]): T[] { if (new Set(values).size !== values.length) bad(); return values; }
function record<T>(value: unknown, limit: number, key: (k: string) => string, parse: (v: unknown) => T): Record<string, T> {
  const object = gymObject(value), keys = Object.getOwnPropertyNames(object);
  if (keys.length > limit) bad();
  const out: Record<string, T> = {};
  for (const k of [...keys].sort()) out[key(k)] = parse(object[k]);
  return out;
}

/** Samma kolumner som tjanst_rows.link_column och lasar-groups.ts. */
const COLUMN = /^(ar[1-3]|ak[1-9]|vecka)$/u;
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const GROUP_ID = new RegExp(`^(arskurs:${UUID_PART}:(ar[1-3]|ak[1-9]|vecka)|klass:${UUID_PART})$`, 'u');
function column(value: unknown): string { if (typeof value !== 'string' || !COLUMN.test(value)) bad(); return value; }
/** Grupp-ID ur lasar-groups.ts; ett klassnamn eller programprefix nekas (SS 12000). */
function groupId(value: unknown): string { if (typeof value !== 'string' || !GROUP_ID.test(value)) bad(); return value; }
const CAUSES = ['nationellt prov', 'apl', 'friluftsdag', 'annat'] as const satisfies readonly Cause[];
const SCHOOL_TYPE = /^[A-Z]{2,6}$/u;

// ---------------------------------------------------------------- delar

function parseTarget(value: unknown): LasarTarget {
  const kind = choice(gymObject(value).kind, ['school', 'frame'] as const);
  if (kind === 'frame') { shape(value, ['kind']); return { kind }; }
  const t = shape(value, ['kind', 'unitId']);
  return { kind, unitId: uuid(t.unitId) };
}
const sameTarget = (a: LasarTarget, b: LasarTarget) => a.kind === b.kind && (a.kind === 'frame' || (b.kind === 'school' && a.unitId === b.unitId.toLowerCase()));
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
const parseExceptions = (value: unknown) => record(value, LASAR_LIMITS.exceptions, date, parseException);
function parseGroupException(value: unknown): GroupException {
  const e = optionalShape(value, ['cause'], ['note']), cause = choice(e.cause, CAUSES);
  return has(e, 'note') ? { cause, note: text(e.note, LASAR_LIMITS.note, false) } : { cause };
}
function parseShortWeek(value: unknown): ShortWeek {
  const s = shape(value, ['weekday', 'reason', 'columnId']);
  return { weekday: gymInteger(s.weekday, 4, 0), reason: text(s.reason, LASAR_LIMITS.note, false), columnId: column(s.columnId) };
}
function parseHistory(value: unknown): LasarHistoryEntry {
  const h = shape(value, ['id', 'role', 'actorName', 'at', 'action', 'comment', 'version']);
  return {
    id: uuid(h.id), role: choice(h.role, ['rektor', 'skoladministrator', 'huvudman'] as const), actorName: text(h.actorName, LASAR_LIMITS.name, false),
    at: instant(h.at), action: text(h.action, LASAR_LIMITS.action, false), comment: longText(h.comment, LASAR_LIMITS.comment), version: version(h.version),
  };
}
function parseDecided(status: LasarDbStatus, value: unknown): ISODate | null {
  const decided = nullable(value, date);
  if ((status === 'faststalld') !== (decided !== null)) bad();
  return decided;
}
function parseCalendar(value: unknown): LasarCalendar {
  const c = shape(value, ['versionId', 'version', 'status', 'revision', 'terms', 'exceptions', 'groupDays', 'shortWeeks', 'frameVersionId', 'contentHash', 'decidedOn', 'history']);
  const status = choice(c.status, DB_STATUSES);
  return {
    versionId: uuid(c.versionId),
    version: version(c.version),
    status,
    revision: revision(c.revision),
    terms: parseTerms(c.terms),
    exceptions: parseExceptions(c.exceptions),
    groupDays: record(c.groupDays, LASAR_LIMITS.groups, groupId, (v) => record(v, LASAR_LIMITS.groupDays, date, parseGroupException)),
    shortWeeks: record(c.shortWeeks, LASAR_LIMITS.groups, groupId, parseShortWeek),
    frameVersionId: nullable(c.frameVersionId, uuid),
    contentHash: hash(c.contentHash),
    decidedOn: parseDecided(status, c.decidedOn),
    history: gymArray(c.history, LASAR_LIMITS.history).map(parseHistory),
  };
}
function parseVersionRef(value: unknown): LasarVersionRef {
  const v = shape(value, ['versionId', 'version', 'status', 'decidedOn', 'current']);
  const status = choice(v.status, DB_STATUSES), current = gymBoolean(v.current);
  if (current && status !== 'faststalld') bad();
  return { versionId: uuid(v.versionId), version: version(v.version), status, decidedOn: parseDecided(status, v.decidedOn), current };
}
function parseVersions(value: unknown): LasarVersionRef[] {
  const versions = gymArray(value, LASAR_LIMITS.versions).map(parseVersionRef);
  if (versions.some((v, i) => i > 0 && v.version <= versions[i - 1].version) || versions.filter((v) => v.current).length > 1) bad();
  unique(versions.map((v) => v.versionId));
  return versions;
}
function parseCapabilities(value: unknown): LasarCapabilities {
  const c = shape(value, [...CAPABILITY_FLAGS, 'canCreate']);
  const flags = Object.fromEntries(CAPABILITY_FLAGS.map((k) => [k, gymBoolean(c[k])])) as Record<typeof CAPABILITY_FLAGS[number], boolean>;
  return { ...flags, canCreate: unique(gymArray(c.canCreate, 3).map((s) => choice(s, LASAR_CREATE_SOURCES))) };
}
function parseChangeRequest(value: unknown): LasarChangeRequest {
  const r = shape(value, ['id', 'status', 'reason', 'answer', 'requestedAt', 'answeredAt']);
  const status = choice(r.status, ['open', 'declined', 'withdrawn', 'accepted'] as const);
  const answeredAt = nullable(r.answeredAt, instant);
  if ((status === 'open') !== (answeredAt === null)) bad();
  const answer = nullable(r.answer, (v) => longText(v, LASAR_LIMITS.comment, false));
  if (status === 'declined' && answer === null) bad();
  return { id: uuid(r.id), status, reason: longText(r.reason, LASAR_LIMITS.comment, false), answer, requestedAt: instant(r.requestedAt), answeredAt };
}
const REVIEW_KINDS = ['lovdag', 'studiedag', 'termin', 'gruppdag', 'kort vecka'] as const satisfies readonly CopyReviewKind[];
const EDGE_KEYS = ['ht:start', 'ht:end', 'vt:start', 'vt:end'] as const satisfies readonly TermEdgeKey[];
function parseReview(value: unknown): LasarReviewItem {
  const r = optionalShape(value, ['id', 'sourceDate', 'kind', 'reason', 'resolved'], ['note', 'suggestedDate', 'targetDate', 'groupId', 'edge', 'shortWeek']);
  const item: LasarReviewItem = {
    id: text(r.id, LASAR_LIMITS.itemId, false), sourceDate: nullable(r.sourceDate, date), kind: choice(r.kind, REVIEW_KINDS),
    reason: choice(r.reason, COPY_REVIEW_REASONS), resolved: gymBoolean(r.resolved),
  };
  if (has(r, 'note')) item.note = text(r.note, LASAR_LIMITS.note, false);
  if (has(r, 'suggestedDate')) item.suggestedDate = date(r.suggestedDate);
  if (has(r, 'targetDate')) item.targetDate = date(r.targetDate);
  if (has(r, 'groupId')) item.groupId = groupId(r.groupId);
  if (has(r, 'edge')) item.edge = choice(r.edge, EDGE_KEYS);
  if (has(r, 'shortWeek')) item.shortWeek = parseShortWeek(r.shortWeek);
  return item;
}
function parseFrameRef(value: unknown): LasarFrameRef {
  const f = shape(value, ['versionId', 'version', 'publishedOn', 'terms', 'exceptions']);
  return { versionId: uuid(f.versionId), version: version(f.version), publishedOn: date(f.publishedOn), terms: parseTerms(f.terms), exceptions: parseExceptions(f.exceptions) };
}
function parseFrame(value: unknown): LasarFrameState {
  const f = shape(value, ['current', 'latest', 'acknowledgedVersionId']);
  return { current: nullable(f.current, parseFrameRef), latest: nullable(f.latest, parseFrameRef), acknowledgedVersionId: nullable(f.acknowledgedVersionId, uuid) };
}
const GROUP_KINDS = ['grundskola', 'gymnasium', 'introduktionsprogram'] as const;
function parseGroupRef(value: unknown): LasarGroupRef {
  const scope = choice(gymObject(value).scope, ['arskurs', 'klass'] as const);
  if (scope === 'arskurs') {
    const g = shape(value, ['scope', 'offeringId', 'columnId', 'label', 'educationName', 'kind']);
    return { scope, offeringId: uuid(g.offeringId), columnId: column(g.columnId), label: text(g.label, LASAR_LIMITS.name, false), educationName: text(g.educationName, LASAR_LIMITS.name, false), kind: choice(g.kind, GROUP_KINDS) };
  }
  const g = shape(value, ['scope', 'classId', 'offeringId', 'columnId', 'label', 'educationName', 'kind']);
  return { scope, classId: uuid(g.classId), offeringId: uuid(g.offeringId), columnId: nullable(g.columnId, column), label: text(g.label, LASAR_LIMITS.name, false), educationName: text(g.educationName, LASAR_LIMITS.name, false), kind: choice(g.kind, GROUP_KINDS) };
}
function parseTeaching(value: unknown): LasarTeaching {
  const t = shape(value, ['classes', 'imClassIds']);
  const classes = gymArray(t.classes, LASAR_LIMITS.classes).map((v): LasarTeachingClass => {
    const c = shape(v, ['classId', 'name', 'offeringId', 'columnId', 'timplanId', 'timplanVersion', 'rows']);
    return {
      classId: uuid(c.classId), name: text(c.name, LASAR_LIMITS.name, false), offeringId: uuid(c.offeringId), columnId: nullable(c.columnId, column),
      timplanId: uuid(c.timplanId), timplanVersion: version(c.timplanVersion),
      rows: gymArray(c.rows, LASAR_LIMITS.rows).map((r) => { const row = shape(r, ['columnId', 'hours']); return { columnId: column(row.columnId), hours: gymInteger(row.hours, 100000) }; }),
    };
  });
  unique(classes.map((c) => c.classId));
  return { classes, imClassIds: unique(gymArray(t.imClassIds, LASAR_LIMITS.classes).map(uuid)) };
}

// ---------------------------------------------------------------- kuvert

/** SQL-svarets kuvert. Med `actor` ska aktören vara exakt sessionens identitet och uppdrag. */
export function parseLasarEnvelope(value: unknown, actor?: { identityId: string; assignmentId: string }): unknown {
  return guarded(() => {
    const e = shape(value, ['contractVersion', 'actor', 'result']), a = shape(e.actor, ['identityId', 'assignmentId']);
    choice(e.contractVersion, [LASAR_CONTRACT_VERSION]);
    const identityId = uuid(a.identityId), assignmentId = uuid(a.assignmentId);
    if (actor && (identityId !== actor.identityId.toLowerCase() || assignmentId !== actor.assignmentId.toLowerCase())) bad('lasar_actor_mismatch');
    return e.result;
  });
}

// ---------------------------------------------------------------- läsning

export function parseLasarReadRequest(value: unknown): LasarReadRequest {
  return guarded(() => {
    const r = shape(value, ['target', 'schoolYear', 'versionId']);
    return { target: parseTarget(r.target), schoolYear: schoolYear(r.schoolYear), versionId: nullable(r.versionId, uuid) };
  });
}

/** Läsningens svar. Med `request` måste mål, läsår och vald version vara de begärda. */
export function parseLasarReadReply(value: unknown, request?: Pick<LasarReadRequest, 'target' | 'schoolYear'> & { versionId?: string | null }): LasarReadReply {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'target', 'schoolYear', 'schoolName', 'schoolTypes', 'mode', 'modeLocked', 'versions', 'calendar',
      'capabilities', 'editableFrom', 'changeRequest', 'review', 'frame', 'groups', 'teaching', 'previousYearAvailable']);
    const reply: LasarReadReply = {
      contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]),
      target: parseTarget(r.target),
      schoolYear: schoolYear(r.schoolYear),
      schoolName: text(r.schoolName, LASAR_LIMITS.name, false),
      schoolTypes: unique(gymArray(r.schoolTypes, 10).map((t) => { if (typeof t !== 'string' || !SCHOOL_TYPE.test(t)) bad(); return t; })),
      mode: choice(r.mode, ['ram', 'eget'] as const),
      modeLocked: gymBoolean(r.modeLocked),
      versions: parseVersions(r.versions),
      calendar: nullable(r.calendar, parseCalendar),
      capabilities: parseCapabilities(r.capabilities),
      editableFrom: nullable(r.editableFrom, date),
      changeRequest: nullable(r.changeRequest, parseChangeRequest),
      review: gymArray(r.review, LASAR_LIMITS.review).map(parseReview),
      frame: nullable(r.frame, parseFrame),
      groups: gymArray(r.groups, LASAR_LIMITS.groups).map(parseGroupRef),
      teaching: parseTeaching(r.teaching),
      previousYearAvailable: gymBoolean(r.previousYearAvailable),
    };
    unique(reply.review.map((i) => i.id));
    const c = reply.calendar;
    if (c) {
      const ref = reply.versions.find((v) => v.versionId === c.versionId);
      if (!ref || ref.version !== c.version || ref.status !== c.status || ref.decidedOn !== c.decidedOn) bad();
    }
    if (request) {
      if (!sameTarget(reply.target, parseTarget(request.target)) || reply.schoolYear !== request.schoolYear) bad('lasar_scope_mismatch');
      if (request.versionId && c && c.versionId !== request.versionId.toLowerCase()) bad('lasar_scope_mismatch');
    }
    return reply;
  });
}

// ---------------------------------------------------------------- kommandon

const EDIT_OPS = ['set_days', 'set_notes', 'set_term', 'set_group_days', 'clear_group_days', 'set_short_week', 'clear_short_week'] as const;
const COMMAND_OPS = ['create', 'reset_to_proposal', 'resolve_review', 'take_frame_changes', 'keep_school_calendar', 'comment'] as const;
const FRAME_KEY = /^(term:(ht|vt):(start|end)|day:\d{4}-\d{2}-\d{2})$/u;
function withNote<T extends object>(o: Record<string, unknown>, op: T): T & { note?: string } {
  return has(o, 'note') ? { ...op, note: text(o.note, LASAR_LIMITS.note, false) } : op;
}
function parseOp(value: unknown): LasarAnyOp {
  const name = choice(gymObject(value).op, [...EDIT_OPS, ...COMMAND_OPS]);
  switch (name) {
    case 'set_days': {
      const o = optionalShape(value, ['op', 'dates', 'kind'], ['note']);
      const kind = choice(o.kind, ['skoldag', 'lovdag', 'studiedag'] as const) as Planned;
      if (kind === 'skoldag' && has(o, 'note')) bad();
      return withNote(o, { op: name, dates: sortedDates(o.dates), kind });
    }
    case 'set_notes': {
      const o = optionalShape(value, ['op', 'dates'], ['note']);
      return withNote(o, { op: name, dates: sortedDates(o.dates) });
    }
    case 'set_term': {
      const o = shape(value, ['op', 'term', 'edge', 'date']);
      return { op: name, term: choice(o.term, ['ht', 'vt'] as const), edge: choice(o.edge, ['start', 'end'] as const), date: date(o.date) };
    }
    case 'set_group_days': {
      const o = optionalShape(value, ['op', 'groupId', 'dates', 'cause'], ['note']);
      return withNote(o, { op: name, groupId: groupId(o.groupId), dates: sortedDates(o.dates), cause: choice(o.cause, CAUSES) });
    }
    case 'clear_group_days': {
      const o = shape(value, ['op', 'groupId', 'dates']);
      return { op: name, groupId: groupId(o.groupId), dates: sortedDates(o.dates) };
    }
    case 'set_short_week': {
      const o = shape(value, ['op', 'groupId', 'columnId', 'weekday', 'reason']);
      return { op: name, groupId: groupId(o.groupId), columnId: column(o.columnId), weekday: gymInteger(o.weekday, 4, 0), reason: text(o.reason, LASAR_LIMITS.note, false) };
    }
    case 'clear_short_week': {
      const o = shape(value, ['op', 'groupId']);
      return { op: name, groupId: groupId(o.groupId) };
    }
    case 'create': {
      const o = shape(value, ['op', 'source']);
      return { op: name, source: choice(o.source, LASAR_CREATE_SOURCES) };
    }
    case 'reset_to_proposal': shape(value, ['op']); return { op: name };
    case 'resolve_review': {
      const o = shape(value, ['op', 'itemId', 'resolution']);
      return { op: name, itemId: text(o.itemId, LASAR_LIMITS.itemId, false), resolution: choice(o.resolution, ['inserted', 'changed', 'dismissed'] as const) };
    }
    case 'take_frame_changes': {
      const o = shape(value, ['op', 'frameVersionId', 'accepted']);
      const accepted = unique(gymArray(o.accepted, LASAR_LIMITS.accepted).map((k) => { if (typeof k !== 'string' || !FRAME_KEY.test(k)) bad(); return k; }));
      if (!accepted.length) bad();
      return { op: name, frameVersionId: uuid(o.frameVersionId), accepted };
    }
    case 'keep_school_calendar': {
      const o = shape(value, ['op', 'frameVersionId']);
      return { op: name, frameVersionId: uuid(o.frameVersionId) };
    }
    case 'comment': {
      const o = shape(value, ['op', 'text']);
      return { op: name, text: longText(o.text, LASAR_LIMITS.comment, false) };
    }
  }
}
const isCommandOp = (op: LasarAnyOp): op is LasarCommandOp => (COMMAND_OPS as readonly string[]).includes(op.op);
/** Kommandolistan och dess förutsättningar: uttryckliga kommandon står ensamma, och bara `create` saknar version. */
function parseOps(value: unknown, versionId: string | null, expectedRevision: number | null): LasarAnyOp[] {
  const ops = gymArray(value, LASAR_LIMITS.ops).map(parseOp);
  if (!ops.length || (ops.some(isCommandOp) && ops.length !== 1)) bad();
  const creating = ops[0].op === 'create';
  if (creating !== (versionId === null) || creating !== (expectedRevision === null)) bad();
  return ops;
}

/** payloadHash binder exakt de kommandon som skickas; servern räknar om den. */
export function lasarPayloadHash(ops: LasarAnyOp[]): Promise<string> {
  return tjanstHashCanonical([LASAR_PAYLOAD_PREFIX, ops as unknown as TjanstCanonicalValue]);
}

export async function lasarCommandRequest(input: { target: LasarTarget; schoolYear: number; versionId: string | null; expectedRevision: number | null; ops: LasarAnyOp[] }): Promise<LasarCommandRequest> {
  const base = guarded(() => ({
    target: parseTarget(structuredClone(input.target)), schoolYear: schoolYear(input.schoolYear),
    versionId: nullable(input.versionId, uuid), expectedRevision: nullable(input.expectedRevision, revision),
  }));
  const ops = guarded(() => parseOps(structuredClone(input.ops), base.versionId, base.expectedRevision));
  return { commandId: crypto.randomUUID(), ...base, ops, payloadHash: await lasarPayloadHash(ops) };
}

/** Strikt tolkning av kommandot, utan kontroll av payloadHash. */
export function parseLasarCommandRequest(value: unknown): LasarCommandRequest {
  return guarded(() => {
    const r = shape(value, ['commandId', 'target', 'schoolYear', 'versionId', 'expectedRevision', 'ops', 'payloadHash']);
    const versionId = nullable(r.versionId, uuid), expectedRevision = nullable(r.expectedRevision, revision);
    return {
      commandId: uuid(r.commandId),
      target: parseTarget(r.target),
      schoolYear: schoolYear(r.schoolYear),
      versionId,
      expectedRevision,
      ops: parseOps(r.ops, versionId, expectedRevision),
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

function parseReceipt(value: unknown): LasarReceipt {
  const r = shape(value, ['commandId', 'revision', 'replayed']);
  return { commandId: uuid(r.commandId), revision: revision(r.revision), replayed: gymBoolean(r.replayed) };
}
/** Svar på kommando och beslut: samma kommando, mål och läsår; samma version med senare revision (utom när en ny version skapas). */
function parseReply(value: unknown, request: { commandId: string; target: LasarTarget; schoolYear: number; versionId: string | null; expectedRevision: number | null }, newVersion: boolean): LasarCommandReply {
  const r = shape(value, ['receipt', 'detail']);
  const reply: LasarCommandReply = { receipt: parseReceipt(r.receipt), detail: parseLasarReadReply(r.detail, { target: request.target, schoolYear: request.schoolYear }) };
  const calendar = reply.detail.calendar;
  if (reply.receipt.commandId !== request.commandId) bad('lasar_command_mismatch');
  if (newVersion) {
    if (!calendar || calendar.revision !== reply.receipt.revision || (request.versionId !== null && calendar.versionId === request.versionId)) bad('lasar_command_mismatch');
    return reply;
  }
  if (request.versionId === null) return reply;
  if (!calendar || calendar.versionId !== request.versionId || calendar.revision !== reply.receipt.revision) bad('lasar_command_mismatch');
  if (request.expectedRevision !== null && reply.receipt.revision <= request.expectedRevision) bad('lasar_command_mismatch');
  return reply;
}
export function parseLasarCommandReply(value: unknown, request: LasarCommandRequest): LasarCommandReply {
  return guarded(() => parseReply(value, request, request.ops[0]?.op === 'create'));
}

// ---------------------------------------------------------------- beslut

function checkDecision(d: Omit<LasarDecisionRequest, 'commandId'>) {
  const modeAction = MODE_DECISIONS.includes(d.action), frameAction = FRAME_DECISIONS.includes(d.action);
  if (frameAction !== (d.target.kind === 'frame')) bad();
  if (modeAction !== (d.mode !== null) || (modeAction && (d.versionId !== null || d.expectedRevision !== null))) bad();
  if (!modeAction && (d.versionId === null || d.expectedRevision === null)) bad();
  if (d.action !== 'set_mode' && d.confirmAffected.length) bad();
  if (LASAR_TEXT_REQUIRED[d.action] && !d.text) bad('lasar_text_required');
}
/** Bygger ett beslut. Texten trimmas; saknad obligatorisk text ger orsaken lasar_text_required. */
export function lasarDecisionRequest(input: {
  target: LasarTarget; schoolYear: number; versionId: string | null; expectedRevision: number | null;
  action: LasarDecision; text: string; mode?: LasarMode | null; confirmAffected?: string[];
}): LasarDecisionRequest {
  return guarded(() => {
    const d = {
      target: parseTarget(structuredClone(input.target)), schoolYear: schoolYear(input.schoolYear),
      versionId: nullable(input.versionId, uuid), expectedRevision: nullable(input.expectedRevision, revision),
      action: choice(input.action, LASAR_DECISIONS), text: longText(typeof input.text === 'string' ? input.text.trim() : input.text, LASAR_LIMITS.comment),
      mode: nullable(input.mode ?? null, (m) => choice(m, ['ram', 'eget'] as const)),
      confirmAffected: unique(gymArray(structuredClone(input.confirmAffected ?? []), LASAR_LIMITS.schools).map(uuid)),
    };
    checkDecision(d);
    return { commandId: crypto.randomUUID(), ...d };
  });
}
export function parseLasarDecisionRequest(value: unknown): LasarDecisionRequest {
  return guarded(() => {
    const r = shape(value, ['commandId', 'target', 'schoolYear', 'versionId', 'expectedRevision', 'action', 'text', 'mode', 'confirmAffected']);
    const d = {
      target: parseTarget(r.target), schoolYear: schoolYear(r.schoolYear), versionId: nullable(r.versionId, uuid),
      expectedRevision: nullable(r.expectedRevision, revision), action: choice(r.action, LASAR_DECISIONS),
      text: longText(r.text, LASAR_LIMITS.comment), mode: nullable(r.mode, (m) => choice(m, ['ram', 'eget'] as const)),
      confirmAffected: unique(gymArray(r.confirmAffected, LASAR_LIMITS.schools).map(uuid)),
    };
    checkDecision(d);
    return { commandId: uuid(r.commandId), ...d };
  });
}
/** Beslutets svar. `reopen` ger en ny version; `set_mode` kan sakna kalender. */
export function parseLasarDecisionReply(value: unknown, request: LasarDecisionRequest): LasarDecisionReply {
  return guarded(() => parseReply(value, request, request.action === 'reopen'));
}
export function parseLasarModePreviewReply(value: unknown): LasarModePreview {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'schoolYear', 'mode', 'affected']);
    const affected = gymArray(r.affected, LASAR_LIMITS.schools).map((v) => {
      const a = shape(v, ['unitId', 'schoolName', 'status']);
      return { unitId: uuid(a.unitId), schoolName: text(a.schoolName, LASAR_LIMITS.name, false), status: choice(a.status, DB_STATUSES) };
    });
    unique(affected.map((a) => a.unitId));
    return { contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]), schoolYear: schoolYear(r.schoolYear), mode: choice(r.mode, ['ram', 'eget'] as const), affected };
  });
}

// ---------------------------------------------------------------- status, överblick och sammanfattning

export function parseLasarStatusRequest(value: unknown): LasarStatusRequest {
  return guarded(() => { const r = shape(value, ['target', 'schoolYear']); return { target: parseTarget(r.target), schoolYear: schoolYear(r.schoolYear) }; });
}
export function parseLasarStatusReply(value: unknown, request?: LasarStatusRequest): LasarStatusReply {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'target', 'schoolYear', 'calendar', 'current']);
    const reply: LasarStatusReply = {
      contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]),
      target: parseTarget(r.target),
      schoolYear: schoolYear(r.schoolYear),
      calendar: nullable(r.calendar, (v) => {
        const c = shape(v, ['versionId', 'version', 'status', 'revision', 'contentHash']);
        return { versionId: uuid(c.versionId), version: version(c.version), status: choice(c.status, DB_STATUSES), revision: revision(c.revision), contentHash: hash(c.contentHash) };
      }),
      current: nullable(r.current, (v) => { const c = shape(v, ['versionId', 'version', 'decidedOn']); return { versionId: uuid(c.versionId), version: version(c.version), decidedOn: date(c.decidedOn) }; }),
    };
    if (request && (!sameTarget(reply.target, parseTarget(request.target)) || reply.schoolYear !== request.schoolYear)) bad('lasar_scope_mismatch');
    return reply;
  });
}
export function parseLasarOverviewRequest(value: unknown): LasarOverviewRequest {
  return guarded(() => ({ schoolYear: schoolYear(shape(value, ['schoolYear']).schoolYear) }));
}
export function parseLasarOverviewReply(value: unknown, request?: LasarOverviewRequest): LasarOverviewReply {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'schoolYear', 'mode', 'frame', 'schools']);
    const schools = gymArray(r.schools, LASAR_LIMITS.schools).map((v): LasarOverviewSchool => {
      const s = shape(v, ['unitId', 'schoolName', 'status', 'versions', 'frameChanged', 'changeRequested', 'waitingFor']);
      return {
        unitId: uuid(s.unitId), schoolName: text(s.schoolName, LASAR_LIMITS.name, false), status: nullable(s.status, (x) => choice(x, DB_STATUSES)),
        versions: parseVersions(s.versions), frameChanged: gymBoolean(s.frameChanged), changeRequested: gymBoolean(s.changeRequested),
        waitingFor: nullable(s.waitingFor, (x) => choice(x, ['rektor', 'huvudman'] as const)),
      };
    });
    unique(schools.map((s) => s.unitId));
    const reply: LasarOverviewReply = {
      contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]), schoolYear: schoolYear(r.schoolYear), mode: choice(r.mode, ['ram', 'eget'] as const),
      frame: nullable(r.frame, (v) => { const f = shape(v, ['status', 'version']); return { status: choice(f.status, ['utkast', 'utgiven'] as const), version: version(f.version) }; }),
      schools,
    };
    if (request && reply.schoolYear !== request.schoolYear) bad('lasar_scope_mismatch');
    return reply;
  });
}
export function parseLasarSummaryRequest(value: unknown): LasarSummaryRequest {
  return guarded(() => { const r = shape(value, ['unitId', 'schoolYear']); return { unitId: uuid(r.unitId), schoolYear: schoolYear(r.schoolYear) }; });
}
function parseStat(value: unknown): LasarSummaryStat {
  const s = shape(value, ['version', 'decidedOn', 'htSchoolDays', 'vtSchoolDays', 'contentHash']);
  return { version: version(s.version), decidedOn: date(s.decidedOn), htSchoolDays: gymInteger(s.htSchoolDays, 200), vtSchoolDays: gymInteger(s.vtSchoolDays, 200), contentHash: hash(s.contentHash) };
}
export function parseLasarSummaryReply(value: unknown, request?: LasarSummaryRequest): LasarSummaryReply {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'unitId', 'schoolYear', 'current', 'previous']);
    const reply: LasarSummaryReply = {
      contractVersion: choice(r.contractVersion, [LASAR_CONTRACT_VERSION]), unitId: uuid(r.unitId), schoolYear: schoolYear(r.schoolYear),
      current: nullable(r.current, parseStat), previous: nullable(r.previous, parseStat),
    };
    if (reply.current && reply.previous && reply.previous.version >= reply.current.version) bad();
    if (request && (reply.unitId !== request.unitId.toLowerCase() || reply.schoolYear !== request.schoolYear)) bad('lasar_scope_mismatch');
    return reply;
  });
}

/** Felets detaljer från servern: en vitlistad orsak och, vid regelnekande, kända regelkoder. */
export function parseLasarErrorDetails(value: unknown): { reason: LasarReason; rules?: LasarRuleCode[] } {
  return guarded(() => {
    const d = optionalShape(value, ['reason'], ['rules']);
    const reason = choice(d.reason, LASAR_REASONS);
    if (!has(d, 'rules')) return { reason };
    if (reason !== 'lasar_rules_failed') bad();
    const rules = unique(gymArray(d.rules, 50).map((c) => choice(c, Object.keys(LASAR_RULE_CODES) as LasarRuleCode[])));
    if (!rules.length) bad();
    return { reason, rules };
  });
}

// ---------------------------------------------------------------- modellen

function historyTime(at: string): string {
  const d = new Date(at);
  return `${d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} ${d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}`;
}
/** Historikradens tid som ”{datum} {hh:mm}” i svensk tid. */
export const lasarHistoryTime = historyTime;

/** Modellens SchoolYear för den lästa kalendern. Id:t är versionens. */
export function lasarSchoolYear(read: LasarReadReply): SchoolYear | null {
  const c = read.calendar;
  if (!c) return null;
  const next = read.schoolYear + 1;
  // Modellens Entry har bara rektor och huvudman; skoladministratören agerar som rektor (D-18).
  // Vyn visar rollen ur kontraktet (A-16), inte ur Entry.
  const history: Entry[] = c.history.map((h) => ({ id: h.id, time: historyTime(h.at), role: h.role === 'huvudman' ? 'huvudman' : 'rektor', action: h.action, comment: h.comment }));
  const sy: SchoolYear = {
    id: c.versionId,
    unitId: read.target.kind === 'school' ? read.target.unitId : 'ram',
    startYear: read.schoolYear,
    label: `Läsåret ${read.schoolYear}/${String(next).slice(2)}`,
    ht: { ...c.terms.ht },
    vt: { ...c.terms.vt },
    exceptions: structuredClone(c.exceptions),
    groupExceptions: structuredClone(c.groupDays),
    shortWeeks: structuredClone(c.shortWeeks),
    status: lasarModelStatus(c.status),
    history,
  };
  if (c.decidedOn) sy.decidedOn = c.decidedOn;
  return sy;
}
