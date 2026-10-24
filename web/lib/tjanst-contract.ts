import { gymArray, gymBoolean, gymInteger, gymObject, gymShape, gymUuid } from './gym-timplan.ts';
import { isValidDate } from './pupil-register-model.ts';
import type { TjanstYearAction } from './tjanst-year-contract.ts';

/**
 * Tjänstefördelningens kontrakt (fas 05.1, etapp 1). Planerad lärartid per HT/VT i hela minuter, aldrig arbetstid
 * i avtalsmening, bedömning eller personnummer. Behov (elevtid ur timplanen) och lärartid hålls i skilda fält.
 * SS 12000 (avsedd kompatibilitet, inget verifierat utbyte): person ↔ Person, skoluppdrag ↔ Duty (dutyAt, dutyPercent
 * heltal), tjänsterad/samläsning ↔ Activity med teachers[].minutesPlanned, mentor med klass ↔ Duty.assignmentRole.
 */
export const TJANST_CONTRACT_VERSION = 'tjanst_v1' as const;
export const TJANST_LIMITS = { minutes: 200000, percent: 100, comment: 2000, name: 200, draftNote: 500, externalId: 200,
  externalIdSource: 100, rowKey: 160, teachers: 2000, classes: 2000, needs: 20000, rows: 20000, specials: 5000, joints: 2000,
  jointRows: 200, people: 5000, employments: 100, duties: 200, versions: 1000, feedback: 5000, blockers: 200, units: 1000 } as const;
export const TJANST_SOURCE_KINDS = ['class_timplan'] as const;
export const TJANST_NEED_BASES = ['terms', 'even_split', 'weekly_calendar'] as const;
export const TJANST_SPECIAL_KINDS = ['mentor', 'programansvar', 'speciallarare', 'annat'] as const;
export const TJANST_PLAN_ACTIONS = ['create_draft', 'add_teacher', 'save_row', 'delete_row', 'save_special', 'delete_special',
  'save_joint', 'dissolve_joint', 'discard_draft', 'publish'] as const;
export const TJANST_PERSONAL_ACTIONS = ['create_person', 'update_person', 'create_draft_teacher', 'save_employment', 'save_duties'] as const;
export const TJANST_SELF_ACTIONS = ['ack', 'comment'] as const;
export const TJANST_FAMILIES = ['personal', 'plan', 'self'] as const;

export type TjanstSourceKind = typeof TJANST_SOURCE_KINDS[number];
export type TjanstNeedBasis = typeof TJANST_NEED_BASES[number];
export type TjanstSpecialKind = typeof TJANST_SPECIAL_KINDS[number];
export type TjanstPlanAction = typeof TJANST_PLAN_ACTIONS[number];
export type TjanstPersonalAction = typeof TJANST_PERSONAL_ACTIONS[number];
export type TjanstSelfAction = typeof TJANST_SELF_ACTIONS[number];
export type TjanstFamily = typeof TJANST_FAMILIES[number];
export type TjanstSchoolform = 'gymnasium' | 'grundskola' | 'introduktionsprogram';
export type TjanstTermMinutes = { ht: number; vt: number };
export type TjanstBlocker = { code: string; message: string };

/** First source variant (D-17). The server builds sourceKey; nothing else anchors a row. */
export type TjanstClassTimplanRef = { classId: string; schoolYear: number; linkRevision: number; timplanId: string; seriesId: string;
  timplanVersion: number; timplanRowKey: string; column: string };
export type TjanstNeed = { sourceKind: TjanstSourceKind; sourceKey: string; rowKey: string; label: string;
  needHt: number | null; needVt: number | null; needBasis: TjanstNeedBasis };
export type TjanstClassLink = { linkRevision: number; timplanId: string; seriesId: string; seriesName: string; timplanVersion: number;
  column: string; schoolform: TjanstSchoolform };
/** link null = "koppling saknas"; needs are then always empty, never zero. */
export type TjanstClass = { classId: string; name: string; link: TjanstClassLink | null; needs: TjanstNeed[] };
export type TjanstTeacher = { personId: string; displayName: string; draft: boolean; shareHere: number | null };
export type TjanstVersionStatus = 'draft' | 'published' | 'superseded' | 'discarded';
export type TjanstVersion = { id: string; versionNo: number; status: TjanstVersionStatus; contentHash: string;
  basedOnVersionId: string | null; publishedByName: string | null; publishedAt: string | null };
/** personId null = vakant. teacherHt/teacherVt are stored teacher time, never derived from the timetable. */
export type TjanstRow = { id: string; lineageId: string; sourceKind: TjanstSourceKind; sourceKey: string; classId: string; rowKey: string;
  personId: string | null; teacherHt: number; teacherVt: number; needHt: number | null; needVt: number | null; needBasis: TjanstNeedBasis;
  stale: boolean; jointGroupId: string | null; comment: string };
/** classId only for mentor; other special assignments get no invented group. */
export type TjanstSpecial = { id: string; lineageId: string; kind: TjanstSpecialKind; label: string; personId: string | null;
  classId: string | null; ht: number; vt: number; comment: string };
export type TjanstJointTeacher = { personId: string; ht: number; vt: number };
export type TjanstJoint = { id: string; lineageId: string; name: string; rowIds: string[]; teachers: TjanstJointTeacher[] };
export type TjanstPlanCapabilities = { canEdit: boolean; canPublish: boolean; canReadHistory: boolean };
/** Lärarnas kvittenser och kommentarer för den publicerade versionen; bara i rektors och administratörens läsning (05.1-08). */
export type TjanstFeedback = { versionNo: number; teachers: { personId: string; name: string; acknowledgedAt: string | null }[];
  comments: { id: string; personId: string; name: string; at: string; body: string }[] };

export type TjanstPlanReadRequest = { unitId: string; schoolYear: number; versionId?: string };
export type TjanstPlanRead = { contractVersion: typeof TJANST_CONTRACT_VERSION; unitId: string; schoolName: string; schoolYear: number;
  /** Distribution revision; every plan command expects it and the receipt returns it + 1. */
  revision: number; version: TjanstVersion | null; versions: TjanstVersion[]; teachers: TjanstTeacher[]; classes: TjanstClass[];
  rows: TjanstRow[]; specials: TjanstSpecial[]; joints: TjanstJoint[]; actions: TjanstPlanAction[]; blockers: TjanstBlocker[];
  capabilities: TjanstPlanCapabilities; feedback?: TjanstFeedback };
/** Explicit continuous-planning decoder; legacy ingress stays separate until API integration. */
export type TjanstYearPlanRead = Omit<TjanstPlanRead, 'actions'> & { actions: TjanstYearAction[] };

export type TjanstPlanPayload = {
  create_draft: { basedOnVersionId: string | null };
  add_teacher: { personId: string };
  save_row: { rowId: string | null; sourceKind: TjanstSourceKind; sourceKey: string; personId: string | null; teacherHt: number; teacherVt: number; comment: string };
  delete_row: { rowId: string };
  save_special: { specialId: string | null; kind: TjanstSpecialKind; label: string; personId: string | null; classId: string | null; ht: number; vt: number; comment: string };
  delete_special: { specialId: string };
  save_joint: { jointId: string | null; name: string; rowIds: string[]; teachers: TjanstJointTeacher[] };
  dissolve_joint: { jointId: string };
  discard_draft: Record<string, never>;
  publish: Record<string, never>;
};
type PlanCommandOf<A extends TjanstPlanAction> = { commandId: string; unitId: string; schoolYear: number; action: A; expectedRevision: number;
  payloadHash: string; payload: TjanstPlanPayload[A] } & (A extends 'publish' ? { expectedContentHash: string } : unknown);
export type TjanstPlanCommand = { [A in TjanstPlanAction]: PlanCommandOf<A> }[TjanstPlanAction];
export type TjanstPlanReceipt = { commandId: string; action: TjanstPlanAction; versionId: string | null; revision: number; contentHash: string;
  replayed: boolean; changed: boolean };
export type TjanstPlanCommandReply = { receipt: TjanstPlanReceipt; detail: TjanstPlanRead };

export type TjanstDuty = { id: string; unitId: string; schoolName: string; percent: number; startsOn: string; endsOn: string | null };
export type TjanstEmployment = { id: string; percent: number; startsOn: string; endsOn: string | null; duties: TjanstDuty[] };
export type TjanstPerson = { id: string; givenName: string; familyName: string; externalId: string | null; externalIdSource: string | null;
  status: 'active' | 'draft'; proposedForUnitId: string | null; draftNote: string | null; revision: number;
  /** Organizer scope only; always empty for a principal (D-11). */
  employments: TjanstEmployment[];
  /** Organizer scope: every duty. Unit scope: only the requested school's share. */
  duties: TjanstDuty[];
  /** Organizer scope only: an active binding to an account exists. Never present for a principal (D-11). */
  account?: boolean };
export type TjanstPersonalReadRequest = { personId?: string; unitId?: string };
export type TjanstPersonalRead = { contractVersion: typeof TJANST_CONTRACT_VERSION; scope: 'organizer' | 'unit'; unitId: string | null;
  people: TjanstPerson[]; actions: TjanstPersonalAction[]; blockers: TjanstBlocker[]; capabilities: { canManage: boolean; canCreateDraft: boolean } };
export type TjanstDutyInput = { dutyId: string | null; unitId: string; percent: number; startsOn: string; endsOn: string | null };
export type TjanstPersonalPayload = {
  create_person: { givenName: string; familyName: string; externalId: string | null; externalIdSource: string | null };
  update_person: { personId: string; givenName: string; familyName: string; externalId: string | null; externalIdSource: string | null };
  create_draft_teacher: { unitId: string; givenName: string; familyName: string; draftNote: string };
  save_employment: { personId: string; employmentId: string | null; percent: number; startsOn: string; endsOn: string | null };
  save_duties: { personId: string; employmentId: string; duties: TjanstDutyInput[] };
};
export type TjanstPersonalCommand = { [A in TjanstPersonalAction]: { commandId: string; action: A; expectedRevision: number; payload: TjanstPersonalPayload[A] } }[TjanstPersonalAction];
export type TjanstPersonalReceipt = { commandId: string; action: TjanstPersonalAction; personId: string; revision: number; replayed: boolean };
export type TjanstPersonalCommandReply = { receipt: TjanstPersonalReceipt; detail: TjanstPersonalRead };

export type TjanstSelfRow = { id: string; className: string; rowKey: string; label: string; ht: number; vt: number;
  /** ht/vt is the teacher's time in the joint group, counted once per group (D-16). */
  joint: null | { jointId: string; name: string; colleagues: string[]; ht: number; vt: number } };
export type TjanstSelfSpecial = { id: string; kind: TjanstSpecialKind; label: string; className: string | null; ht: number; vt: number };
export type TjanstSelfComment = { id: string; body: string; at: string };
export type TjanstSelfPublication = { versionId: string; versionNo: number; unitId: string; schoolName: string; schoolYear: number;
  publishedAt: string; contentHash: string; rows: TjanstSelfRow[]; specials: TjanstSelfSpecial[];
  acknowledgedAt: string | null; comments: TjanstSelfComment[] };
/** Only the bound person's published service. No drafts, no pupils, no colleague data beyond names in own joint groups. */
export type TjanstSelfRead = { contractVersion: typeof TJANST_CONTRACT_VERSION; person: { id: string; displayName: string };
  publications: TjanstSelfPublication[]; capabilities: { canAck: boolean; canComment: boolean } };
export type TjanstSelfCommand = { commandId: string; versionId: string; action: 'ack' } | { commandId: string; versionId: string; action: 'comment'; body: string };
export type TjanstSelfReceipt = { commandId: string; action: TjanstSelfAction; versionId: string; feedbackId: string; replayed: boolean };
export type TjanstSelfCommandReply = { receipt: TjanstSelfReceipt; detail: TjanstSelfRead };

export type TjanstSums = { teaching: TjanstTermMinutes; special: TjanstTermMinutes; vacant: TjanstTermMinutes;
  /** Known need minus coverage on linked classes only; never includes unlinked classes or unknown need. */
  unallocated: TjanstTermMinutes; unlinkedClasses: number };
export type TjanstStaffingUnit = { unitId: string; schoolName: string; published: null | { versionId: string; versionNo: number; publishedAt: string };
  sums: TjanstSums | null };
export type TjanstVacancy = { unitId: string; kind: 'row' | 'special'; id: string; label: string; ht: number; vt: number };
/** Organizer follow-up only: no decision actions. */
export type TjanstStaffingRead = { contractVersion: typeof TJANST_CONTRACT_VERSION; schoolYear: number; units: TjanstStaffingUnit[]; vacancies: TjanstVacancy[] };

/** Minimal reference for an uncertain write: never comment text, names or payload. */
export type TjanstCommandTarget = { unitId: string | null; schoolYear: number | null; versionId: string | null; personId: string | null };
export type TjanstCommandRef = { family: TjanstFamily; commandId: string; action: TjanstPlanAction | TjanstPersonalAction | TjanstSelfAction; target: TjanstCommandTarget };
export type TjanstStatusRequest = { command: TjanstCommandRef };
export type TjanstStatusReply<T> = { state: 'not_found'; result: null } | { state: 'completed'; result: T };

export class TjanstContractError extends TypeError {
  readonly code = 'invalid_tjanst';
  readonly reason: string;
  constructor(reason = 'tjanst_invalid', message = 'Tjänstefördelningens underlag kunde inte kontrolleras.') {
    super(message); this.name = 'TjanstContractError'; this.reason = reason;
  }
}
function bad(reason?: string): never { throw new TjanstContractError(reason); }
function guarded<T>(fn: () => T): T {
  try { return fn(); } catch (error) { if (error instanceof TjanstContractError) throw error; return bad(); }
}
const shape = gymShape, uuid = gymUuid, bool = gymBoolean;
function has(value: unknown, key: string): boolean { return value !== null && typeof value === 'object' && Object.hasOwn(value, key); }
function optionalShape(value: unknown, keys: string[], optional: string[]): Record<string, unknown> {
  return shape(value, [...keys, ...optional.filter(key => has(value, key))]);
}
function choice<T extends string>(value: unknown, values: readonly T[], reason?: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) bad(reason); return value as T;
}
/** Code points match PostgreSQL char_length; controls and lone surrogates are rejected before hashing. */
function text(value: unknown, maximum: number, allowEmpty = true, reason?: string): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) || value !== value.trim() || !allowEmpty && value.length === 0) bad();
  if (Array.from(value).length > maximum) bad(reason);
  return value;
}
function name(value: unknown): string { return text(value, TJANST_LIMITS.name, false); }
function nullableUuid(value: unknown): string | null { return value === null ? null : uuid(value); }
function minutes(value: unknown): number { return gymInteger(value, TJANST_LIMITS.minutes); }
function nullableMinutes(value: unknown): number | null { return value === null ? null : minutes(value); }
function percent(value: unknown): number { return gymInteger(value, TJANST_LIMITS.percent, 1); }
function revision(value: unknown): number { return gymInteger(value); }
function schoolYear(value: unknown): number { return gymInteger(value, 2100, 2000); }
function date(value: unknown): string { if (!isValidDate(value)) bad(); return value as string; }
function nullableDate(value: unknown): string | null { return value === null ? null : date(value); }
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) bad();
  return value;
}
function nullableInstant(value: unknown): string | null { return value === null ? null : instant(value); }
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function contract(value: unknown): typeof TJANST_CONTRACT_VERSION { return choice(value, [TJANST_CONTRACT_VERSION]); }
function list<T>(value: unknown, maximum: number, parse: (value: unknown) => T): T[] { return gymArray(value, maximum).map(parse); }
function unique<T>(values: T[], key: (value: T) => string, reason = 'tjanst_invalid'): T[] {
  if (new Set(values.map(key)).size !== values.length) bad(reason); return values;
}
function terms(ht: number, vt: number): void { if (ht === 0 && vt === 0) bad('tjanst_invalid'); }
function rowKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,159}$/u.test(value) || /^(?:constructor|prototype|__proto__)$/u.test(value)) bad();
  return value;
}
function column(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:ar[1-3]|ak[1-9]|vecka)$/u.test(value)) bad(); return value;
}
function blockers(value: unknown): TjanstBlocker[] {
  return list(value, TJANST_LIMITS.blockers, v => { const b = shape(v, ['code', 'message']);
    if (typeof b.code !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(b.code)) bad();
    return { code: b.code, message: text(b.message, 1000, false) }; });
}
function actions<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  return unique(list(value, allowed.length, v => choice(v, allowed)), v => v);
}

/** sourceKey for the class–timetable variant: class_timplan:{classId}:{schoolYear}:{timplanRowKey}. */
export function tjanstSourceKey(ref: Pick<TjanstClassTimplanRef, 'classId' | 'schoolYear' | 'timplanRowKey'>): string {
  return guarded(() => `class_timplan:${uuid(ref.classId)}:${schoolYear(ref.schoolYear)}:${rowKey(ref.timplanRowKey)}`);
}
export function parseTjanstSourceKey(kind: unknown, value: unknown): { sourceKind: TjanstSourceKind; classId: string; schoolYear: number; rowKey: string } {
  return guarded(() => {
    const sourceKind = choice(kind, TJANST_SOURCE_KINDS, 'tjanst_unknown_source');
    if (typeof value !== 'string' || value.length > 240) bad('tjanst_unknown_source');
    const m = /^class_timplan:([0-9a-f-]{36}):(\d{4}):(.+)$/u.exec(value);
    if (!m) bad('tjanst_unknown_source');
    const parsed = { sourceKind, classId: uuid(m[1]), schoolYear: schoolYear(Number(m[2])), rowKey: rowKey(m[3]) };
    if (tjanstSourceKey({ classId: parsed.classId, schoolYear: parsed.schoolYear, timplanRowKey: parsed.rowKey }) !== value) bad('tjanst_unknown_source');
    return parsed;
  });
}

// Canonical serialisation shared with SQL (tjanst_canonical/tjanst_hash): n=null, t/f=boolean, i<decimal>;,
// s<UTF-8-byte-count>:<raw>, a<length>:<values>, o<count>:<key value>… with keys sorted by UTF-8 bytes.
export type TjanstCanonicalValue = null | boolean | number | string | TjanstCanonicalValue[] | { [key: string]: TjanstCanonicalValue };
const encoder = new TextEncoder();
function ordinal(a: string, b: string): number {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
function serializeString(value: string): string { if (/[\p{Cs}]/u.test(value)) bad(); return `s${encoder.encode(value).length}:${value}`; }
export function tjanstCanonicalSerialize(value: unknown, depth = 0): string {
  return guarded(() => {
    if (depth > 32) bad();
    if (value === null) return 'n';
    if (typeof value === 'boolean') return value ? 't' : 'f';
    if (typeof value === 'number') { if (!Number.isSafeInteger(value)) bad(); return `i${value};`; }
    if (typeof value === 'string') return serializeString(value);
    if (Array.isArray(value)) return `a${value.length}:${gymArray(value, 200000).map(v => tjanstCanonicalSerialize(v, depth + 1)).join('')}`;
    const object = gymObject(value), keys = Object.getOwnPropertyNames(object).sort(ordinal);
    return `o${keys.length}:${keys.map(key => serializeString(key) + tjanstCanonicalSerialize(object[key], depth + 1)).join('')}`;
  });
}
export async function tjanstHashCanonical(value: unknown): Promise<string> {
  const bytes = encoder.encode(tjanstCanonicalSerialize(value)), digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}
/** payloadHash binds action and exact payload; the server recomputes it (tjanst_payload_hash). */
export function tjanstPayloadHash(action: TjanstPlanAction, payload: unknown): Promise<string> {
  return tjanstHashCanonical(['tjanst_payload_v1', action, payload as TjanstCanonicalValue]);
}

function parseTeacherTime(value: unknown): TjanstJointTeacher {
  const t = shape(value, ['personId', 'ht', 'vt']), ht = minutes(t.ht), vt = minutes(t.vt); terms(ht, vt);
  return { personId: uuid(t.personId), ht, vt };
}
function parseSaveRow(value: unknown): TjanstPlanPayload['save_row'] {
  const p = shape(value, ['rowId', 'sourceKind', 'sourceKey', 'personId', 'teacherHt', 'teacherVt', 'comment']);
  const source = parseTjanstSourceKey(p.sourceKind, p.sourceKey), teacherHt = minutes(p.teacherHt), teacherVt = minutes(p.teacherVt);
  terms(teacherHt, teacherVt);
  return { rowId: nullableUuid(p.rowId), sourceKind: source.sourceKind, sourceKey: p.sourceKey as string, personId: nullableUuid(p.personId),
    teacherHt, teacherVt, comment: text(p.comment, TJANST_LIMITS.comment, true, 'tjanst_comment_too_long') };
}
function parseSaveSpecial(value: unknown): TjanstPlanPayload['save_special'] {
  const p = shape(value, ['specialId', 'kind', 'label', 'personId', 'classId', 'ht', 'vt', 'comment']);
  const kind = choice(p.kind, TJANST_SPECIAL_KINDS), classId = nullableUuid(p.classId), ht = minutes(p.ht), vt = minutes(p.vt);
  if (classId !== null && kind !== 'mentor') bad(); terms(ht, vt);
  return { specialId: nullableUuid(p.specialId), kind, label: name(p.label), personId: nullableUuid(p.personId), classId, ht, vt,
    comment: text(p.comment, TJANST_LIMITS.comment, true, 'tjanst_comment_too_long') };
}
function parseSaveJoint(value: unknown): TjanstPlanPayload['save_joint'] {
  const p = shape(value, ['jointId', 'name', 'rowIds', 'teachers']);
  const rowIds = unique(list(p.rowIds, TJANST_LIMITS.jointRows, uuid), v => v, 'tjanst_duplicate_row');
  if (rowIds.length < 2) bad('tjanst_joint_too_few');
  const teachers = unique(list(p.teachers, TJANST_LIMITS.teachers, parseTeacherTime), t => t.personId, 'tjanst_duplicate_row');
  return { jointId: nullableUuid(p.jointId), name: name(p.name), rowIds, teachers };
}
const empty = (value: unknown): Record<string, never> => { shape(value, []); return {}; };
const planPayloads: { [A in TjanstPlanAction]: (value: unknown) => TjanstPlanPayload[A] } = {
  create_draft: v => ({ basedOnVersionId: nullableUuid(shape(v, ['basedOnVersionId']).basedOnVersionId) }),
  add_teacher: v => ({ personId: uuid(shape(v, ['personId']).personId) }),
  save_row: parseSaveRow,
  delete_row: v => ({ rowId: uuid(shape(v, ['rowId']).rowId) }),
  save_special: parseSaveSpecial,
  delete_special: v => ({ specialId: uuid(shape(v, ['specialId']).specialId) }),
  save_joint: parseSaveJoint,
  dissolve_joint: v => ({ jointId: uuid(shape(v, ['jointId']).jointId) }),
  discard_draft: empty,
  publish: empty,
};
export function parsePlanReadRequest(value: unknown): TjanstPlanReadRequest {
  return guarded(() => {
    const r = optionalShape(value, ['unitId', 'schoolYear'], ['versionId']);
    return { unitId: uuid(r.unitId), schoolYear: schoolYear(r.schoolYear), ...(has(r, 'versionId') ? { versionId: uuid(r.versionId) } : {}) };
  });
}
/** Strict shape only; the caller awaits tjanstPayloadHash to compare payloadHash before sending. */
export function parsePlanCommand(value: unknown): TjanstPlanCommand {
  return guarded(() => {
    const action = choice(gymObject(value).action, TJANST_PLAN_ACTIONS);
    const r = shape(value, ['commandId', 'unitId', 'schoolYear', 'action', 'expectedRevision', 'payloadHash', 'payload',
      ...(action === 'publish' ? ['expectedContentHash'] : [])]);
    return { commandId: uuid(r.commandId), unitId: uuid(r.unitId), schoolYear: schoolYear(r.schoolYear), action,
      expectedRevision: revision(r.expectedRevision), payloadHash: hash(r.payloadHash), payload: planPayloads[action](r.payload),
      ...(action === 'publish' ? { expectedContentHash: hash(r.expectedContentHash) } : {}) } as TjanstPlanCommand;
  });
}
/** Builds a command with the canonical payloadHash; payload is parsed first so the hash covers exactly what is sent. */
export async function createPlanCommand<A extends TjanstPlanAction>(input: Omit<PlanCommandOf<A>, 'payloadHash'>): Promise<TjanstPlanCommand> {
  const payload = guarded(() => planPayloads[input.action](input.payload));
  return parsePlanCommand({ ...input, payload, payloadHash: await tjanstPayloadHash(input.action, payload) });
}
export async function verifyPlanCommandHash(command: TjanstPlanCommand): Promise<TjanstPlanCommand> {
  const parsed = parsePlanCommand(command);
  if (await tjanstPayloadHash(parsed.action, parsed.payload) !== parsed.payloadHash) bad('tjanst_payload_hash');
  return parsed;
}

function parseVersion(value: unknown): TjanstVersion {
  const v = shape(value, ['id', 'versionNo', 'status', 'contentHash', 'basedOnVersionId', 'publishedByName', 'publishedAt']);
  const status = choice(v.status, ['draft', 'published', 'superseded', 'discarded'] as const);
  const publishedByName = v.publishedByName === null ? null : name(v.publishedByName), publishedAt = nullableInstant(v.publishedAt);
  if ((publishedAt === null) !== (publishedByName === null) || (status === 'published' || status === 'superseded') !== (publishedAt !== null)) bad();
  return { id: uuid(v.id), versionNo: gymInteger(v.versionNo, 2147483647, 1), status, contentHash: hash(v.contentHash),
    basedOnVersionId: nullableUuid(v.basedOnVersionId), publishedByName, publishedAt };
}
function parseTeacher(value: unknown): TjanstTeacher {
  const t = shape(value, ['personId', 'displayName', 'draft', 'shareHere']);
  return { personId: uuid(t.personId), displayName: name(t.displayName), draft: bool(t.draft), shareHere: t.shareHere === null ? null : percent(t.shareHere) };
}
function parseNeed(value: unknown, classId: string): TjanstNeed {
  const n = shape(value, ['sourceKind', 'sourceKey', 'rowKey', 'label', 'needHt', 'needVt', 'needBasis']);
  const source = parseTjanstSourceKey(n.sourceKind, n.sourceKey);
  if (source.classId !== classId || source.rowKey !== n.rowKey) bad('tjanst_unknown_source');
  return { sourceKind: source.sourceKind, sourceKey: n.sourceKey as string, rowKey: source.rowKey, label: text(n.label, 300, false),
    needHt: nullableMinutes(n.needHt), needVt: nullableMinutes(n.needVt), needBasis: choice(n.needBasis, TJANST_NEED_BASES) };
}
function parseClass(value: unknown): TjanstClass {
  const c = shape(value, ['classId', 'name', 'link', 'needs']), classId = uuid(c.classId);
  let link: TjanstClassLink | null = null;
  if (c.link !== null) {
    const l = shape(c.link, ['linkRevision', 'timplanId', 'seriesId', 'seriesName', 'timplanVersion', 'column', 'schoolform']);
    const schoolform = choice(l.schoolform, ['gymnasium', 'grundskola', 'introduktionsprogram'] as const), col = column(l.column);
    const prefix = { gymnasium: 'ar', grundskola: 'ak', introduktionsprogram: 'vecka' }[schoolform];
    if (!col.startsWith(prefix)) bad();
    link = { linkRevision: revision(l.linkRevision), timplanId: uuid(l.timplanId), seriesId: uuid(l.seriesId), seriesName: name(l.seriesName),
      timplanVersion: gymInteger(l.timplanVersion, 2147483647, 1), column: col, schoolform };
  }
  const needs = unique(list(c.needs, TJANST_LIMITS.needs, v => parseNeed(v, classId)), n => n.sourceKey);
  if (link === null && needs.length) bad();
  return { classId, name: text(c.name, 60, false), link, needs };
}
function parseRow(value: unknown): TjanstRow {
  const r = shape(value, ['id', 'lineageId', 'sourceKind', 'sourceKey', 'classId', 'rowKey', 'personId', 'teacherHt', 'teacherVt',
    'needHt', 'needVt', 'needBasis', 'stale', 'jointGroupId', 'comment']);
  const source = parseTjanstSourceKey(r.sourceKind, r.sourceKey), classId = uuid(r.classId);
  if (source.classId !== classId || source.rowKey !== r.rowKey) bad('tjanst_unknown_source');
  return { id: uuid(r.id), lineageId: uuid(r.lineageId), sourceKind: source.sourceKind, sourceKey: r.sourceKey as string, classId, rowKey: source.rowKey,
    personId: nullableUuid(r.personId), teacherHt: minutes(r.teacherHt), teacherVt: minutes(r.teacherVt), needHt: nullableMinutes(r.needHt),
    needVt: nullableMinutes(r.needVt), needBasis: choice(r.needBasis, TJANST_NEED_BASES), stale: bool(r.stale),
    jointGroupId: nullableUuid(r.jointGroupId), comment: text(r.comment, TJANST_LIMITS.comment) };
}
function parseSpecial(value: unknown): TjanstSpecial {
  const s = shape(value, ['id', 'lineageId', 'kind', 'label', 'personId', 'classId', 'ht', 'vt', 'comment']);
  const kind = choice(s.kind, TJANST_SPECIAL_KINDS), classId = nullableUuid(s.classId);
  if (classId !== null && kind !== 'mentor') bad();
  return { id: uuid(s.id), lineageId: uuid(s.lineageId), kind, label: name(s.label), personId: nullableUuid(s.personId), classId,
    ht: minutes(s.ht), vt: minutes(s.vt), comment: text(s.comment, TJANST_LIMITS.comment) };
}
function parseJoint(value: unknown): TjanstJoint {
  const j = shape(value, ['id', 'lineageId', 'name', 'rowIds', 'teachers']);
  const rowIds = unique(list(j.rowIds, TJANST_LIMITS.jointRows, uuid), v => v);
  if (rowIds.length < 2) bad('tjanst_joint_too_few');
  return { id: uuid(j.id), lineageId: uuid(j.lineageId), name: name(j.name), rowIds,
    teachers: unique(list(j.teachers, TJANST_LIMITS.teachers, parseTeacherTime), t => t.personId) };
}
function parseFeedback(value: unknown): TjanstFeedback {
  const f = shape(value, ['versionNo', 'teachers', 'comments']);
  const teachers = unique(list(f.teachers, TJANST_LIMITS.teachers, v => { const t = shape(v, ['personId', 'name', 'acknowledgedAt']);
    return { personId: uuid(t.personId), name: name(t.name), acknowledgedAt: nullableInstant(t.acknowledgedAt) }; }), t => t.personId);
  const comments = unique(list(f.comments, TJANST_LIMITS.feedback, v => { const c = shape(v, ['id', 'personId', 'name', 'at', 'body']);
    return { id: uuid(c.id), personId: uuid(c.personId), name: name(c.name), at: instant(c.at), body: text(c.body, TJANST_LIMITS.comment, false, 'tjanst_comment_too_long') }; }), c => c.id);
  return { versionNo: gymInteger(f.versionNo, 2147483647, 1), teachers, comments };
}
export function parsePlanReadReply(value: unknown, expected: TjanstPlanReadRequest): TjanstPlanRead {
  return parsePlanReadProjection(value, expected, TJANST_PLAN_ACTIONS, false);
}
/** No legacy fallback: current projections expose only contextual commands; explicit history is read-only. */
export function parseYearPlanReadReply(value: unknown, expected: TjanstPlanReadRequest): TjanstYearPlanRead {
  return parsePlanReadProjection(value, expected, ['add_teacher', 'remove_teacher', 'save_row', 'delete_row', 'save_special',
    'delete_special', 'save_joint', 'dissolve_joint', 'discard_draft', 'publish', 'move', 'bulk'] satisfies TjanstYearAction[], true);
}
function parsePlanReadProjection<A extends string>(value: unknown, expected: TjanstPlanReadRequest,
  allowedActions: readonly A[], continuous: boolean): Omit<TjanstPlanRead, 'actions'> & { actions: A[] } {
  return guarded(() => {
    const request = parsePlanReadRequest(expected);
    const r = optionalShape(value, ['contractVersion', 'unitId', 'schoolName', 'schoolYear', 'revision', 'version', 'versions', 'teachers', 'classes',
      'rows', 'specials', 'joints', 'actions', 'blockers', 'capabilities'], ['feedback']);
    const unitId = uuid(r.unitId), year = schoolYear(r.schoolYear);
    if (unitId !== request.unitId || year !== request.schoolYear) bad('wrong_scope');
    const version = r.version === null ? null : parseVersion(r.version);
    if (request.versionId !== undefined && version?.id !== request.versionId) bad('wrong_scope');
    const versions = unique(list(r.versions, TJANST_LIMITS.versions, parseVersion), v => v.id);
    if (versions.filter(v => v.status === 'draft').length > 1 || versions.filter(v => v.status === 'published').length > 1) bad();
    const teachers = unique(list(r.teachers, TJANST_LIMITS.teachers, parseTeacher), t => t.personId);
    const classes = unique(list(r.classes, TJANST_LIMITS.classes, parseClass), c => c.classId);
    const rows = unique(list(r.rows, TJANST_LIMITS.rows, parseRow), row => row.id), specials = unique(list(r.specials, TJANST_LIMITS.specials, parseSpecial), s => s.id);
    const joints = unique(list(r.joints, TJANST_LIMITS.joints, parseJoint), j => j.id);
    const rowIds = new Set(rows.map(row => row.id)), jointIds = new Set(joints.map(j => j.id)), classIds = new Set(classes.map(c => c.classId));
    const people = new Set(teachers.map(t => t.personId));
    const known = (personId: string | null) => personId === null || people.has(personId);
    if (rows.some(row => !classIds.has(row.classId) || !known(row.personId) || row.jointGroupId !== null && !jointIds.has(row.jointGroupId))
      || specials.some(s => !known(s.personId) || s.classId !== null && !classIds.has(s.classId))) bad();
    unique(rows.filter(row => row.personId !== null), row => `${row.personId}:${row.sourceKey}`, 'tjanst_duplicate_row');
    for (const joint of joints) if (joint.rowIds.some(id => !rowIds.has(id) || rows.find(row => row.id === id)!.jointGroupId !== joint.id)
      || joint.teachers.some(t => !people.has(t.personId))) bad();
    if (rows.some(row => row.jointGroupId !== null && !joints.find(j => j.id === row.jointGroupId)!.rowIds.includes(row.id))) bad();
    const caps = shape(r.capabilities, ['canEdit', 'canPublish', 'canReadHistory']);
    const capabilities = { canEdit: bool(caps.canEdit), canPublish: bool(caps.canPublish), canReadHistory: bool(caps.canReadHistory) };
    const parsedActions = actions(r.actions, allowedActions);
    if (continuous) {
      const historical = request.versionId !== undefined || version !== null && !['draft', 'published'].includes(version.status);
      if (historical && (capabilities.canEdit || capabilities.canPublish || parsedActions.length)) bad();
      if (!capabilities.canEdit && (capabilities.canPublish || parsedActions.length)) bad();
      if (capabilities.canPublish && version?.status !== 'draft') bad();
      if (parsedActions.includes('publish' as A) !== capabilities.canPublish) bad();
      if (parsedActions.includes('discard_draft' as A) && version?.status !== 'draft') bad();
    } else if ((capabilities.canEdit || capabilities.canPublish) && version?.status !== 'draft' && version !== null) bad();
    const feedback = has(r, 'feedback') ? parseFeedback(r.feedback) : undefined;
    if (feedback && !versions.some(v => v.status === 'published' && v.versionNo === feedback.versionNo)) bad();
    return { contractVersion: contract(r.contractVersion), unitId, schoolName: name(r.schoolName), schoolYear: year, revision: revision(r.revision),
      version, versions, teachers, classes, rows, specials, joints, actions: parsedActions, blockers: blockers(r.blockers), capabilities,
      ...(feedback ? { feedback } : {}) };
  });
}
export function parsePlanCommandReply(value: unknown, command: TjanstPlanCommand): TjanstPlanCommandReply {
  return guarded(() => {
    const q = parsePlanCommand(command), r = shape(value, ['receipt', 'detail']);
    const t = shape(r.receipt, ['commandId', 'action', 'versionId', 'revision', 'contentHash', 'replayed', 'changed']);
    const receipt = { commandId: uuid(t.commandId), action: choice(t.action, TJANST_PLAN_ACTIONS), versionId: nullableUuid(t.versionId),
      revision: revision(t.revision), contentHash: hash(t.contentHash), replayed: bool(t.replayed), changed: bool(t.changed) };
    if (receipt.commandId !== q.commandId || receipt.action !== q.action || receipt.revision !== q.expectedRevision + 1) bad('tjanst_revision_conflict');
    const detail = parsePlanReadReply(r.detail, { unitId: q.unitId, schoolYear: q.schoolYear });
    if (detail.revision < receipt.revision) bad('tjanst_revision_conflict');
    if (detail.revision === receipt.revision && q.action !== 'discard_draft' && detail.version?.id !== receipt.versionId) bad();
    if (q.action === 'publish' && (detail.version?.status === 'draft' || detail.revision === receipt.revision && detail.version?.status !== 'published')) bad();
    return { receipt, detail };
  });
}

function parseDuty(value: unknown): TjanstDuty {
  const d = shape(value, ['id', 'unitId', 'schoolName', 'percent', 'startsOn', 'endsOn']);
  const startsOn = date(d.startsOn), endsOn = nullableDate(d.endsOn); if (endsOn !== null && endsOn < startsOn) bad();
  return { id: uuid(d.id), unitId: uuid(d.unitId), schoolName: name(d.schoolName), percent: percent(d.percent), startsOn, endsOn };
}
function parseEmployment(value: unknown): TjanstEmployment {
  const e = shape(value, ['id', 'percent', 'startsOn', 'endsOn', 'duties']);
  const startsOn = date(e.startsOn), endsOn = nullableDate(e.endsOn); if (endsOn !== null && endsOn < startsOn) bad();
  return { id: uuid(e.id), percent: percent(e.percent), startsOn, endsOn, duties: unique(list(e.duties, TJANST_LIMITS.duties, parseDuty), d => d.id) };
}
function externalId(value: unknown, source: unknown): { externalId: string | null; externalIdSource: string | null } {
  if ((value === null) !== (source === null)) bad();
  return value === null ? { externalId: null, externalIdSource: null }
    : { externalId: text(value, TJANST_LIMITS.externalId, false), externalIdSource: text(source, TJANST_LIMITS.externalIdSource, false) };
}
function parsePerson(value: unknown): TjanstPerson {
  const p = optionalShape(value, ['id', 'givenName', 'familyName', 'externalId', 'externalIdSource', 'status', 'proposedForUnitId', 'draftNote', 'revision', 'employments', 'duties'], ['account']);
  const status = choice(p.status, ['active', 'draft'] as const), proposedForUnitId = nullableUuid(p.proposedForUnitId);
  const draftNote = p.draftNote === null ? null : text(p.draftNote, TJANST_LIMITS.draftNote);
  if (status === 'draft' && proposedForUnitId === null) bad();
  return { id: uuid(p.id), givenName: name(p.givenName), familyName: name(p.familyName), ...externalId(p.externalId, p.externalIdSource), status,
    proposedForUnitId, draftNote, revision: revision(p.revision), employments: unique(list(p.employments, TJANST_LIMITS.employments, parseEmployment), e => e.id),
    duties: unique(list(p.duties, TJANST_LIMITS.duties, parseDuty), d => d.id), ...(has(p, 'account') ? { account: bool(p.account) } : {}) };
}
export function parsePersonalReadRequest(value: unknown): TjanstPersonalReadRequest {
  return guarded(() => {
    const r = optionalShape(value, [], ['personId', 'unitId']);
    return { ...(has(r, 'personId') ? { personId: uuid(r.personId) } : {}), ...(has(r, 'unitId') ? { unitId: uuid(r.unitId) } : {}) };
  });
}
/** A unit-scoped read may never carry employments or another school's share (D-11). */
export function parsePersonalReadReply(value: unknown, expected: TjanstPersonalReadRequest): TjanstPersonalRead {
  return guarded(() => {
    const request = parsePersonalReadRequest(expected);
    const r = shape(value, ['contractVersion', 'scope', 'unitId', 'people', 'actions', 'blockers', 'capabilities']);
    const scope = choice(r.scope, ['organizer', 'unit'] as const), unitId = nullableUuid(r.unitId);
    if ((scope === 'unit') !== (unitId !== null) || request.unitId !== undefined && unitId !== request.unitId || scope === 'unit' && request.unitId === undefined) bad('wrong_scope');
    const people = unique(list(r.people, TJANST_LIMITS.people, parsePerson), p => p.id);
    if (request.personId !== undefined && people.some(p => p.id !== request.personId)) bad('wrong_scope');
    if (scope === 'organizer' && people.some(p => p.account === undefined)) bad();
    if (scope === 'unit' && people.some(p => p.account !== undefined || p.employments.length || p.duties.some(d => d.unitId !== unitId) || p.status === 'draft' && p.proposedForUnitId !== unitId)) bad('wrong_scope');
    if (scope === 'organizer') for (const p of people) {
      const nested = p.employments.flatMap(e => e.duties).map(d => d.id).sort();
      if (JSON.stringify(nested) !== JSON.stringify(p.duties.map(d => d.id).sort())) bad();
    }
    const caps = shape(r.capabilities, ['canManage', 'canCreateDraft']), canManage = bool(caps.canManage), canCreateDraft = bool(caps.canCreateDraft);
    if (scope === 'unit' && canManage) bad();
    return { contractVersion: contract(r.contractVersion), scope, unitId, people, actions: actions(r.actions, TJANST_PERSONAL_ACTIONS),
      blockers: blockers(r.blockers), capabilities: { canManage, canCreateDraft } };
  });
}
function parseDutyInput(value: unknown): TjanstDutyInput {
  const d = shape(value, ['dutyId', 'unitId', 'percent', 'startsOn', 'endsOn']);
  const startsOn = date(d.startsOn), endsOn = nullableDate(d.endsOn); if (endsOn !== null && endsOn < startsOn) bad();
  return { dutyId: nullableUuid(d.dutyId), unitId: uuid(d.unitId), percent: percent(d.percent), startsOn, endsOn };
}
const personalPayloads: { [A in TjanstPersonalAction]: (value: unknown) => TjanstPersonalPayload[A] } = {
  create_person: v => { const p = shape(v, ['givenName', 'familyName', 'externalId', 'externalIdSource']);
    return { givenName: name(p.givenName), familyName: name(p.familyName), ...externalId(p.externalId, p.externalIdSource) }; },
  update_person: v => { const p = shape(v, ['personId', 'givenName', 'familyName', 'externalId', 'externalIdSource']);
    return { personId: uuid(p.personId), givenName: name(p.givenName), familyName: name(p.familyName), ...externalId(p.externalId, p.externalIdSource) }; },
  create_draft_teacher: v => { const p = shape(v, ['unitId', 'givenName', 'familyName', 'draftNote']);
    return { unitId: uuid(p.unitId), givenName: name(p.givenName), familyName: name(p.familyName), draftNote: text(p.draftNote, TJANST_LIMITS.draftNote) }; },
  save_employment: v => { const p = shape(v, ['personId', 'employmentId', 'percent', 'startsOn', 'endsOn']);
    const startsOn = date(p.startsOn), endsOn = nullableDate(p.endsOn); if (endsOn !== null && endsOn < startsOn) bad();
    return { personId: uuid(p.personId), employmentId: nullableUuid(p.employmentId), percent: percent(p.percent), startsOn, endsOn }; },
  save_duties: v => { const p = shape(v, ['personId', 'employmentId', 'duties']);
    return { personId: uuid(p.personId), employmentId: uuid(p.employmentId), duties: unique(list(p.duties, TJANST_LIMITS.duties, parseDutyInput),
      d => d.dutyId ?? JSON.stringify([d.unitId, d.startsOn])) }; },
};
export function parsePersonalCommand(value: unknown): TjanstPersonalCommand {
  return guarded(() => {
    const action = choice(gymObject(value).action, TJANST_PERSONAL_ACTIONS), r = shape(value, ['commandId', 'action', 'expectedRevision', 'payload']);
    const expectedRevision = revision(r.expectedRevision);
    if ((action === 'create_person' || action === 'create_draft_teacher') && expectedRevision !== 0) bad('tjanst_revision_conflict');
    return { commandId: uuid(r.commandId), action, expectedRevision, payload: personalPayloads[action](r.payload) } as TjanstPersonalCommand;
  });
}
export function parsePersonalCommandReply(value: unknown, command: TjanstPersonalCommand, expectedRead: TjanstPersonalReadRequest): TjanstPersonalCommandReply {
  return guarded(() => {
    const q = parsePersonalCommand(command), r = shape(value, ['receipt', 'detail']);
    const t = shape(r.receipt, ['commandId', 'action', 'personId', 'revision', 'replayed']);
    const receipt = { commandId: uuid(t.commandId), action: choice(t.action, TJANST_PERSONAL_ACTIONS), personId: uuid(t.personId),
      revision: revision(t.revision), replayed: bool(t.replayed) };
    const target = 'personId' in q.payload ? q.payload.personId : null;
    if (receipt.commandId !== q.commandId || receipt.action !== q.action || receipt.revision !== q.expectedRevision + 1
      || target !== null && receipt.personId !== target) bad('tjanst_revision_conflict');
    return { receipt, detail: parsePersonalReadReply(r.detail, expectedRead) };
  });
}

function parseSelfPublication(value: unknown): TjanstSelfPublication {
  const p = shape(value, ['versionId', 'versionNo', 'unitId', 'schoolName', 'schoolYear', 'publishedAt', 'contentHash', 'rows', 'specials', 'acknowledgedAt', 'comments']);
  const rows = unique(list(p.rows, TJANST_LIMITS.rows, v => { const r = shape(v, ['id', 'className', 'rowKey', 'label', 'ht', 'vt', 'joint']);
    let joint: TjanstSelfRow['joint'] = null;
    if (r.joint !== null) { const j = shape(r.joint, ['jointId', 'name', 'colleagues', 'ht', 'vt']);
      joint = { jointId: uuid(j.jointId), name: name(j.name), colleagues: list(j.colleagues, 50, name), ht: minutes(j.ht), vt: minutes(j.vt) }; }
    return { id: uuid(r.id), className: text(r.className, 60, false), rowKey: rowKey(r.rowKey), label: text(r.label, 300, false), ht: minutes(r.ht), vt: minutes(r.vt), joint }; }), r => r.id);
  const specials = unique(list(p.specials, TJANST_LIMITS.specials, v => { const s = shape(v, ['id', 'kind', 'label', 'className', 'ht', 'vt']);
    const kind = choice(s.kind, TJANST_SPECIAL_KINDS), className = s.className === null ? null : text(s.className, 60, false);
    if (className !== null && kind !== 'mentor') bad();
    return { id: uuid(s.id), kind, label: name(s.label), className, ht: minutes(s.ht), vt: minutes(s.vt) }; }), s => s.id);
  const comments = unique(list(p.comments, TJANST_LIMITS.feedback, v => { const c = shape(v, ['id', 'body', 'at']);
    return { id: uuid(c.id), body: text(c.body, TJANST_LIMITS.comment, false, 'tjanst_comment_too_long'), at: instant(c.at) }; }), c => c.id);
  return { versionId: uuid(p.versionId), versionNo: gymInteger(p.versionNo, 2147483647, 1), unitId: uuid(p.unitId), schoolName: name(p.schoolName),
    schoolYear: schoolYear(p.schoolYear), publishedAt: instant(p.publishedAt), contentHash: hash(p.contentHash), rows, specials,
    acknowledgedAt: nullableInstant(p.acknowledgedAt), comments };
}
export function parseSelfReadRequest(value: unknown): Record<string, never> { return guarded(() => empty(value)); }
export function parseSelfReadReply(value: unknown): TjanstSelfRead {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'person', 'publications', 'capabilities']), person = shape(r.person, ['id', 'displayName']);
    const caps = shape(r.capabilities, ['canAck', 'canComment']);
    return { contractVersion: contract(r.contractVersion), person: { id: uuid(person.id), displayName: name(person.displayName) },
      publications: unique(list(r.publications, TJANST_LIMITS.units, parseSelfPublication), p => p.versionId),
      capabilities: { canAck: bool(caps.canAck), canComment: bool(caps.canComment) } };
  });
}
/** No person ID is ever accepted from the client; the server derives the person from the locked session binding. */
export function parseSelfCommand(value: unknown): TjanstSelfCommand {
  return guarded(() => {
    const action = choice(gymObject(value).action, TJANST_SELF_ACTIONS);
    const r = shape(value, ['commandId', 'versionId', 'action', ...(action === 'comment' ? ['body'] : [])]);
    const base = { commandId: uuid(r.commandId), versionId: uuid(r.versionId) };
    return action === 'ack' ? { ...base, action } : { ...base, action, body: text(r.body, TJANST_LIMITS.comment, false, 'tjanst_comment_too_long') };
  });
}
export function parseSelfCommandReply(value: unknown, command: TjanstSelfCommand): TjanstSelfCommandReply {
  return guarded(() => {
    const q = parseSelfCommand(command), r = shape(value, ['receipt', 'detail']);
    const t = shape(r.receipt, ['commandId', 'action', 'versionId', 'feedbackId', 'replayed']);
    const receipt = { commandId: uuid(t.commandId), action: choice(t.action, TJANST_SELF_ACTIONS), versionId: uuid(t.versionId), feedbackId: uuid(t.feedbackId), replayed: bool(t.replayed) };
    if (receipt.commandId !== q.commandId || receipt.action !== q.action || receipt.versionId !== q.versionId) bad('tjanst_command_conflict');
    const detail = parseSelfReadReply(r.detail), publication = detail.publications.find(p => p.versionId === q.versionId);
    if (q.action === 'ack' && !publication?.acknowledgedAt || q.action === 'comment' && !publication?.comments.some(c => c.id === receipt.feedbackId)) bad();
    return { receipt, detail };
  });
}

function parseSums(value: unknown): TjanstSums {
  const s = shape(value, ['teaching', 'special', 'vacant', 'unallocated', 'unlinkedClasses']);
  const term = (v: unknown) => { const t = shape(v, ['ht', 'vt']); return { ht: gymInteger(t.ht), vt: gymInteger(t.vt) }; };
  return { teaching: term(s.teaching), special: term(s.special), vacant: term(s.vacant), unallocated: term(s.unallocated), unlinkedClasses: gymInteger(s.unlinkedClasses) };
}
export function parseStaffingReadRequest(value: unknown): { schoolYear: number } {
  return guarded(() => ({ schoolYear: schoolYear(shape(value, ['schoolYear']).schoolYear) }));
}
export function parseStaffingReadReply(value: unknown, expected: { schoolYear: number }): TjanstStaffingRead {
  return guarded(() => {
    const r = shape(value, ['contractVersion', 'schoolYear', 'units', 'vacancies']), year = schoolYear(r.schoolYear);
    if (year !== parseStaffingReadRequest(expected).schoolYear) bad('wrong_scope');
    const units = unique(list(r.units, TJANST_LIMITS.units, v => { const u = shape(v, ['unitId', 'schoolName', 'published', 'sums']);
      let published: TjanstStaffingUnit['published'] = null;
      if (u.published !== null) { const p = shape(u.published, ['versionId', 'versionNo', 'publishedAt']);
        published = { versionId: uuid(p.versionId), versionNo: gymInteger(p.versionNo, 2147483647, 1), publishedAt: instant(p.publishedAt) }; }
      const sums = u.sums === null ? null : parseSums(u.sums);
      if ((published === null) !== (sums === null)) bad();
      return { unitId: uuid(u.unitId), schoolName: name(u.schoolName), published, sums }; }), u => u.unitId);
    const unitIds = new Set(units.filter(u => u.published).map(u => u.unitId));
    const vacancies = unique(list(r.vacancies, TJANST_LIMITS.rows, v => { const x = shape(v, ['unitId', 'kind', 'id', 'label', 'ht', 'vt']);
      return { unitId: uuid(x.unitId), kind: choice(x.kind, ['row', 'special'] as const), id: uuid(x.id), label: text(x.label, 300, false), ht: minutes(x.ht), vt: minutes(x.vt) }; }), v => v.id);
    if (vacancies.some(v => !unitIds.has(v.unitId))) bad();
    return { contractVersion: contract(r.contractVersion), schoolYear: year, units, vacancies };
  });
}

const familyActions: Record<TjanstFamily, readonly string[]> = { personal: TJANST_PERSONAL_ACTIONS, plan: TJANST_PLAN_ACTIONS, self: TJANST_SELF_ACTIONS };
export function parseCommandRef(value: unknown): TjanstCommandRef {
  return guarded(() => {
    const r = shape(value, ['family', 'commandId', 'action', 'target']), family = choice(r.family, TJANST_FAMILIES);
    const action = choice(r.action, familyActions[family]) as TjanstCommandRef['action'];
    const t = shape(r.target, ['unitId', 'schoolYear', 'versionId', 'personId']);
    const target = { unitId: nullableUuid(t.unitId), schoolYear: t.schoolYear === null ? null : schoolYear(t.schoolYear),
      versionId: nullableUuid(t.versionId), personId: nullableUuid(t.personId) };
    if (family === 'plan' && (target.unitId === null || target.schoolYear === null) || family === 'self' && (target.versionId === null || target.personId !== null)) bad();
    return { family, commandId: uuid(r.commandId), action, target };
  });
}
export function planCommandRef(command: TjanstPlanCommand): TjanstCommandRef {
  const q = parsePlanCommand(command);
  return { family: 'plan', commandId: q.commandId, action: q.action, target: { unitId: q.unitId, schoolYear: q.schoolYear, versionId: null, personId: null } };
}
export function personalCommandRef(command: TjanstPersonalCommand): TjanstCommandRef {
  const q = parsePersonalCommand(command), p = q.payload as { personId?: string; unitId?: string };
  return { family: 'personal', commandId: q.commandId, action: q.action, target: { unitId: p.unitId ?? null, schoolYear: null, versionId: null, personId: p.personId ?? null } };
}
export function selfCommandRef(command: TjanstSelfCommand): TjanstCommandRef {
  const q = parseSelfCommand(command);
  return { family: 'self', commandId: q.commandId, action: q.action, target: { unitId: null, schoolYear: null, versionId: q.versionId, personId: null } };
}
export function parseStatusRequest(value: unknown): TjanstStatusRequest {
  return guarded(() => ({ command: parseCommandRef(shape(value, ['command']).command) }));
}
/** The completed result is checked with the family's reply parser against the same reference. */
export function parseStatusReply<T>(value: unknown, ref: TjanstCommandRef, result: (value: unknown) => T & { receipt: { commandId: string } }): TjanstStatusReply<T> {
  return guarded(() => {
    const command = parseCommandRef(ref), r = shape(value, ['state', 'result']), state = choice(r.state, ['not_found', 'completed'] as const);
    if (state === 'not_found') { if (r.result !== null) bad(); return { state, result: null }; }
    const parsed = result(r.result);
    if (parsed.receipt.commandId !== command.commandId) bad('tjanst_command_conflict');
    return { state, result: parsed };
  });
}
