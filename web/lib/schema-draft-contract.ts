/** Sparade interna schemautkast. Inga elevlistor, sessioner eller körningstillstånd i lagringskontraktet. */
import { SCHEMA_LIMITS, SchemaContractError, parseSchemaForslag, parseSchemaKontroll, parseSchemaVillkor, type SchemaForslag,
  type SchemaKontroll, type SchemaPeriod, type SchemaPlacement, type SchemaVillkor } from './schema-contract.ts';
import type { SchemaMedveten } from './schema-utkast.ts';
import type { SchemaAktivitetsTyp } from './schema-aktiviteter.ts';
import { parseSchemaDatumAndringar, type SchemaDatumAndring } from './schema-datum.ts';

export const SCHEMA_DRAFT_VERSION = 1 as const;
export const SCHEMA_DRAFT_BYTES = 8 * 1024 * 1024;
export const SCHEMA_DRAFT_REASONS = ['schema_draft_invalid', 'schema_draft_too_large', 'schema_draft_version', 'schema_draft_conflict',
  'schema_draft_command_conflict', 'schema_draft_source_changed', 'schema_preview_outdated', 'schema_draft_not_found'] as const;
export type SchemaDraftReason = typeof SCHEMA_DRAFT_REASONS[number];
export class SchemaDraftError extends TypeError {
  public reason: SchemaDraftReason;
  constructor(reason: SchemaDraftReason = 'schema_draft_invalid') { super(reason); this.name = 'SchemaDraftError'; this.reason = reason; }
}
export type SchemaDraftScope = { contractVersion: typeof SCHEMA_DRAFT_VERSION; unitId: string; schoolYear: number; period: SchemaPeriod };
/** Datumdelen sparas som explicit undantag; en läsare måste dessutom använda datummodellens kontroll. */
export type SchemaDraftDatedOverride = SchemaDatumAndring;
export type SchemaDraftSave = SchemaDraftScope & { commandId: string; draftId: string | null; expectedRevision: number; name: string;
  basisVillkor: SchemaVillkor | null; workingVillkor: SchemaVillkor; grundFingerprint: string | null; placements: SchemaPlacement[]; locks: SchemaPlacement[];
  /** Förslagets fulla underlagsfingeravtryck vid ett uttryckligt val av ett beräknat schema. */
  forslagFingerprint?: string;
  /** Kalenderprojektionen som visades tillsammans med förslaget. */
  forslagKalenderHash?: string;
  intentional: SchemaMedveten[]; datedOverrides: SchemaDraftDatedOverride[]; activityTypes: SchemaAktivitetsTyp[] };
export type SchemaDraftStatusRequest = SchemaDraftScope & { commandId: string; draftId: string | null };
export type SchemaDraftResetRequest = SchemaDraftScope & { commandId: string; draftId: string; expectedRevision: number; action: 'clear' | 'undo' };
export type SchemaDraftLessonSource = { lesson: string; ref: string; term: 'ht' | 'vt' | null; ordinal: number };
export type SchemaDraftSource = { planId: string | null; planRevision: number; calendarVersionId: string | null; calendarVersion: number | null;
  lessonSources: SchemaDraftLessonSource[]; digest: string };
export type SchemaDraftDocument = { documentVersion: 1; base: SchemaForslag | null; basisVillkor: SchemaVillkor | null; workingVillkor: SchemaVillkor;
  placements: SchemaPlacement[]; locks: SchemaPlacement[]; intentional: SchemaMedveten[]; datedOverrides: SchemaDraftDatedOverride[];
  activityTypes: SchemaAktivitetsTyp[]; control: SchemaKontroll | null; requiresRecalculation: boolean; source: SchemaDraftSource };
export type SchemaDraft = SchemaDraftDocument & { id: string; name: string; revision: number; savedAt: string; contentHash: string; sourceHash: string; stale: boolean; resetUndoRevision?: number };
export type SchemaDraftReceipt = { commandId: string; draftId: string; revision: number; requestHash: string; contentHash: string; savedAt: string; replayed: boolean };
export type SchemaDraftReadReply = SchemaDraftScope & { draft: SchemaDraft | null };
export type SchemaDraftSaveReply = SchemaDraftScope & { draft: SchemaDraft; receipt: SchemaDraftReceipt };
export type SchemaDraftStatusReply = SchemaDraftScope & { state: 'not_found' | 'completed'; found: boolean; receipt: SchemaDraftReceipt | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u, FP = /^[0-9a-f]{28}$/u;
const invalid = (): never => { throw new SchemaDraftError(); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const keys = (r: Record<string, unknown>, allowed: string[], required = allowed): void => {
  if (Object.keys(r).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(r, k))) invalid();
};
const uuid = (value: unknown): string => typeof value === 'string' && UUID.test(value) ? value : invalid();
const hash = (value: unknown): string => typeof value === 'string' && HASH.test(value) ? value : invalid();
const fingerprint = (value: unknown): string => typeof value === 'string' && FP.test(value) ? value : invalid();
const integer = (value: unknown, min: number, max: number): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid();
const text = (value: unknown, max: number): string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value ? value : invalid();
const array = (value: unknown, max: number): unknown[] => Array.isArray(value) && value.length <= max ? value : invalid();
const bool = (value: unknown): boolean => typeof value === 'boolean' ? value : invalid();
const instant = (value: unknown): string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : invalid();
const villkor = (value: unknown): SchemaVillkor => { try { return parseSchemaVillkor(value); } catch { return invalid(); } };

export function parseSchemaDraftScope(value: unknown, extra: string[] = []): SchemaDraftScope {
  const r = record(value); keys(r, ['contractVersion', 'unitId', 'schoolYear', 'period', ...extra]);
  if (r.contractVersion !== SCHEMA_DRAFT_VERSION) throw new SchemaDraftError('schema_draft_version');
  if (!['lasar', 'ht', 'vt'].includes(r.period as string)) invalid();
  return { contractVersion: SCHEMA_DRAFT_VERSION, unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 1900, 2200), period: r.period as SchemaPeriod };
}
function placements(value: unknown): SchemaPlacement[] {
  const found = new Set<string>();
  return array(value, SCHEMA_LIMITS.lessons).map(raw => {
    const p = record(raw); keys(p, ['lesson', 'day', 'startMin', 'room']);
    const lesson = text(p.lesson, 100); if (!/^pass-\d{1,8}$/u.test(lesson) || found.has(lesson)) invalid(); found.add(lesson);
    if (p.room !== null && (typeof p.room !== 'string' || !/^sal-\d{1,3}$/u.test(p.room))) invalid();
    return { lesson, day: integer(p.day, 0, 6), startMin: integer(p.startMin, 0, 1439), room: p.room as string | null };
  });
}
function intentional(value: unknown): SchemaMedveten[] {
  return array(value, SCHEMA_LIMITS.shownViolations).map(raw => {
    const r = record(raw); keys(r, ['key', 'villkor', 'grundFingerprint', 'placements']);
    if (typeof r.grundFingerprint !== 'string' || !FP.test(r.grundFingerprint)) invalid();
    const at = record(r.placements), clean: SchemaMedveten['placements'] = {};
    if (Object.keys(at).length > SCHEMA_LIMITS.lessons) invalid();
    for (const [id, rawAt] of Object.entries(at)) {
      if (!/^pass-\d{1,8}$/u.test(id)) invalid();
      const p = record(rawAt); keys(p, ['day', 'startMin', 'room']);
      if ((p.day === null) !== (p.startMin === null) || p.room !== null && (typeof p.room !== 'string' || !/^sal-\d{1,3}$/u.test(p.room))) invalid();
      clean[id] = { day: p.day === null ? null : integer(p.day, 0, 6), startMin: p.startMin === null ? null : integer(p.startMin, 0, 1439), room: p.room as string | null };
    }
    return { key: text(r.key, 10000), villkor: text(r.villkor, SCHEMA_DRAFT_BYTES), grundFingerprint: r.grundFingerprint as string, placements: clean };
  });
}
function dated(value: unknown): SchemaDraftDatedOverride[] {
  try { return parseSchemaDatumAndringar(value); } catch { return invalid(); }
}
function lessonSources(value: unknown): SchemaDraftLessonSource[] {
  const found = new Set<string>(), sources = new Set<string>();
  return array(value, SCHEMA_LIMITS.lessons).map(raw => {
    const r = record(raw); keys(r, ['lesson', 'ref', 'term', 'ordinal']);
    const lesson = text(r.lesson, 100), ref = text(r.ref, 2000), ordinal = integer(r.ordinal, 1, SCHEMA_LIMITS.lessons);
    if (!/^pass-\d{1,8}$/u.test(lesson) || !/^(?:undervisning|samlasning|valbart-block|aktivitet):[^\p{Cc}]+$/u.test(ref)
      || r.term !== null && r.term !== 'ht' && r.term !== 'vt' || found.has(lesson)) invalid();
    const source = JSON.stringify([ref, r.term, ordinal]); if (sources.has(source)) invalid();
    found.add(lesson); sources.add(source);
    return { lesson, ref, term: r.term as SchemaDraftLessonSource['term'], ordinal };
  });
}
function activityTypes(value: unknown): SchemaAktivitetsTyp[] {
  const found = new Set<string>();
  return array(value, 100).map(raw => {
    const r = record(raw); keys(r, ['id', 'name', 'group', 'participants', 'visibleFor', 'margin']);
    const id = text(r.id, 64); if (found.has(id)) invalid(); found.add(id);
    if (!['personal', 'elever', 'sal'].includes(r.participants as string) || !['personal', 'alla'].includes(r.visibleFor as string)) invalid();
    let margin: SchemaAktivitetsTyp['margin'] = null;
    if (r.margin !== null) {
      const m = record(r.margin); keys(m, ['typ', 'beforeMin', 'afterMin', 'occupies', 'label', 'visibleFor', 'when']);
      if (m.typ !== 'marginal' || m.when !== 'alltid') invalid();
      const occupies = array(m.occupies, 3), visible = array(m.visibleFor, 2);
      if (occupies.some(x => !['elever', 'larare', 'sal'].includes(x as string)) || visible.some(x => !['elever', 'larare'].includes(x as string))) invalid();
      margin = { typ: 'marginal', beforeMin: integer(m.beforeMin, 0, 60), afterMin: integer(m.afterMin, 0, 60), occupies: occupies as NonNullable<typeof margin>['occupies'],
        label: text(m.label, 40), visibleFor: visible as NonNullable<typeof margin>['visibleFor'], when: 'alltid' };
    }
    return { id, name: text(r.name, 80), group: text(r.group, 60), participants: r.participants as SchemaAktivitetsTyp['participants'], visibleFor: r.visibleFor as SchemaAktivitetsTyp['visibleFor'], margin };
  });
}
export function parseSchemaDraftSave(value: unknown): SchemaDraftSave {
  const r = record(value), required = ['commandId', 'draftId', 'expectedRevision', 'name', 'basisVillkor', 'workingVillkor', 'grundFingerprint', 'placements', 'locks'];
  const optional = ['intentional', 'datedOverrides', 'activityTypes', 'forslagFingerprint', 'forslagKalenderHash'];
  keys(r, ['contractVersion', 'unitId', 'schoolYear', 'period', ...required, ...optional], ['contractVersion', 'unitId', 'schoolYear', 'period', ...required]);
  const scope = parseSchemaDraftScope(Object.fromEntries(['contractVersion', 'unitId', 'schoolYear', 'period'].map(k => [k, r[k]])));
  const basisVillkor = r.basisVillkor === null ? null : villkor(r.basisVillkor), at = placements(r.placements), locks = placements(r.locks);
  const grundFingerprint = r.grundFingerprint === null ? null : fingerprint(r.grundFingerprint);
  if ((grundFingerprint === null) !== (basisVillkor === null)) invalid();
  const forslagFingerprint = Object.hasOwn(r, 'forslagFingerprint') ? fingerprint(r.forslagFingerprint) : undefined;
  const forslagKalenderHash = Object.hasOwn(r, 'forslagKalenderHash') ? hash(r.forslagKalenderHash) : undefined;
  if (forslagKalenderHash !== undefined && forslagFingerprint === undefined) invalid();
  if (!basisVillkor && (forslagFingerprint !== undefined || at.length || locks.length || array(r.datedOverrides ?? [], SCHEMA_LIMITS.lessons).length || array(r.intentional ?? [], SCHEMA_LIMITS.shownViolations).length)) invalid();
  const draftId = r.draftId === null ? null : uuid(r.draftId), expectedRevision = integer(r.expectedRevision, 0, 2147483646);
  if ((draftId === null) !== (expectedRevision === 0)) invalid();
  return { ...scope, commandId: uuid(r.commandId), draftId, expectedRevision, name: text(r.name, 120), basisVillkor, workingVillkor: villkor(r.workingVillkor), grundFingerprint,
    ...(forslagFingerprint !== undefined && { forslagFingerprint }),
    ...(forslagKalenderHash !== undefined && { forslagKalenderHash }),
    placements: at, locks, intentional: intentional(r.intentional ?? []), datedOverrides: dated(r.datedOverrides ?? []), activityTypes: activityTypes(r.activityTypes ?? []) };
}
export function parseSchemaDraftStatusRequest(value: unknown): SchemaDraftStatusRequest {
  const r = record(value), scope = parseSchemaDraftScope(value, ['commandId', 'draftId']);
  return { ...scope, commandId: uuid(r.commandId), draftId: r.draftId === null ? null : uuid(r.draftId) };
}
export function parseSchemaDraftResetRequest(value: unknown): SchemaDraftResetRequest {
  const r = record(value), scope = parseSchemaDraftScope(value, ['commandId', 'draftId', 'expectedRevision', 'action']);
  const action = r.action;
  if (action !== 'clear' && action !== 'undo') return invalid();
  return { ...scope, commandId: uuid(r.commandId), draftId: uuid(r.draftId), expectedRevision: integer(r.expectedRevision, 1, 2147483646), action };
}
const encoder = new TextEncoder();
const compareUtf8 = (a: string, b: string): number => {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
};
function decimal(value: number): string {
  const raw = String(Math.abs(value)), [digits, power] = raw.split('e');
  if (power === undefined) return String(value);
  const dot = digits.indexOf('.'), numbers = digits.replace('.', ''), at = (dot < 0 ? digits.length : dot) + Number(power);
  const result = at <= 0 ? `0.${'0'.repeat(-at)}${numbers}` : at >= numbers.length ? numbers + '0'.repeat(at - numbers.length) : `${numbers.slice(0, at)}.${numbers.slice(at)}`;
  return value < 0 ? `-${result}` : result;
}
/** Delar tjanst-formens grundtyper, men d<decimal>; bevarar schemats bråkveckor och beräknade veckominuter. */
export function schemaDraftCanonicalSerialize(value: unknown, depth = 0): string {
  if (depth > 32) invalid();
  if (value === null) return 'n';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid();
    return Number.isSafeInteger(value) ? `i${value};` : `d${decimal(value)};`;
  }
  if (typeof value === 'string') {
    if (/[\p{Cs}]/u.test(value)) invalid();
    return `s${encoder.encode(value).length}:${value}`;
  }
  if (Array.isArray(value)) return `a${value.length}:${array(value, 200000).map(v => schemaDraftCanonicalSerialize(v, depth + 1)).join('')}`;
  const object = record(value);
  if (Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null) invalid();
  const names = Object.keys(object).sort(compareUtf8);
  return `o${names.length}:${names.map(key => schemaDraftCanonicalSerialize(key, depth + 1) + schemaDraftCanonicalSerialize(object[key], depth + 1)).join('')}`;
}
export async function schemaDraftHash(value: unknown): Promise<string> {
  const bytes = encoder.encode(schemaDraftCanonicalSerialize(['schema_draft_v1', value])), digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}
export const schemaDraftResetHash = (input: SchemaDraftResetRequest): Promise<string> => schemaDraftHash({ operation: 'schema_draft_reset_v1', ...input });

export function parseSchemaDraftDocument(value: unknown, scope: Pick<SchemaDraftScope, 'unitId' | 'schoolYear' | 'period'>): SchemaDraftDocument {
  try {
    const r = record(value); keys(r, ['documentVersion', 'base', 'basisVillkor', 'workingVillkor', 'placements', 'locks', 'intentional', 'datedOverrides', 'activityTypes', 'control', 'requiresRecalculation', 'source']);
    if (r.documentVersion !== 1) throw new SchemaDraftError('schema_draft_version');
    const basisVillkor = r.basisVillkor === null ? null : villkor(r.basisVillkor), workingVillkor = villkor(r.workingVillkor), source = record(r.source);
    keys(source, ['planId', 'planRevision', 'calendarVersionId', 'calendarVersion', 'lessonSources', 'digest']);
    const parsedSource: SchemaDraftSource = { planId: source.planId === null ? null : uuid(source.planId), planRevision: integer(source.planRevision, 0, 2147483647),
      calendarVersionId: source.calendarVersionId === null ? null : uuid(source.calendarVersionId), calendarVersion: source.calendarVersion === null ? null : integer(source.calendarVersion, 1, 10000),
      lessonSources: lessonSources(source.lessonSources), digest: hash(source.digest) };
    const at = placements(r.placements), locks = placements(r.locks), dates = dated(r.datedOverrides), accepted = intentional(r.intentional);
    let base: SchemaForslag | null = null;
    if (r.base !== null) {
      if (!basisVillkor) invalid();
      const fp = record(r.base).grundFingerprint; if (typeof fp !== 'string' || !FP.test(fp)) invalid();
      base = parseSchemaForslag(r.base, { unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: basisVillkor!,
        ...(locks.length ? { locks: { grundFingerprint: fp as string, placements: locks } } : {}) });
    }
    if ((base === null) !== (basisVillkor === null) || (base === null) !== (r.control === null)) invalid();
    if (!base && (at.length || locks.length || dates.length || accepted.length || parsedSource.lessonSources.length || r.requiresRecalculation !== true)) invalid();
    if (base) {
      const byId = new Map(at.map(p => [p.lesson, p])), linked = new Set(parsedSource.lessonSources.map(p => p.lesson));
      if (base.lessons.filter(l => l.day !== null).length !== at.length || base.lessons.length !== linked.size
        || base.lessons.some(l => !linked.has(l.id) || l.day !== null && (byId.get(l.id)?.day !== l.day || byId.get(l.id)?.startMin !== l.startMin || byId.get(l.id)?.room !== l.roomId))
        || locks.some(p => { const value = byId.get(p.lesson); return !value || value.day !== p.day || value.startMin !== p.startMin || value.room !== p.room; })) invalid();
    }
    return { documentVersion: 1, base, basisVillkor, workingVillkor, placements: at, locks, intentional: accepted,
      datedOverrides: dates, activityTypes: activityTypes(r.activityTypes), control: r.control === null ? null : parseSchemaKontroll(r.control, base!.grundFingerprint),
      requiresRecalculation: bool(r.requiresRecalculation), source: parsedSource };
  } catch (error) {
    if (error instanceof SchemaDraftError) throw error;
    if (error instanceof SchemaContractError) throw new SchemaDraftError('schema_draft_version');
    const wrapped = new SchemaDraftError(); wrapped.cause = error; throw wrapped;
  }
}
export function parseSchemaDraft(value: unknown, scope: SchemaDraftScope): SchemaDraft {
  const r = record(value), documentKeys = ['documentVersion', 'base', 'basisVillkor', 'workingVillkor', 'placements', 'locks', 'intentional', 'datedOverrides', 'activityTypes', 'control', 'requiresRecalculation', 'source'];
  const required = ['id', 'name', 'revision', 'savedAt', 'contentHash', 'sourceHash', 'stale', ...documentKeys];
  keys(r, [...required, 'resetUndoRevision'], required);
  const document = parseSchemaDraftDocument(Object.fromEntries(documentKeys.map(k => [k, r[k]])), scope), revision = integer(r.revision, 1, 2147483647), stale = bool(r.stale);
  const resetUndoRevision = Object.hasOwn(r, 'resetUndoRevision') ? integer(r.resetUndoRevision, 1, revision - 1) : undefined;
  if (resetUndoRevision !== undefined && (stale || document.base !== null || resetUndoRevision !== revision - 1)) invalid();
  return { ...document, id: uuid(r.id), name: text(r.name, 120), revision,
    savedAt: instant(r.savedAt), contentHash: hash(r.contentHash), sourceHash: hash(r.sourceHash), stale, ...(resetUndoRevision !== undefined && { resetUndoRevision }) };
}
export function parseSchemaDraftReceipt(value: unknown): SchemaDraftReceipt {
  const r = record(value); keys(r, ['commandId', 'draftId', 'revision', 'requestHash', 'contentHash', 'savedAt', 'replayed']);
  return { commandId: uuid(r.commandId), draftId: uuid(r.draftId), revision: integer(r.revision, 1, 2147483647), requestHash: hash(r.requestHash), contentHash: hash(r.contentHash), savedAt: instant(r.savedAt), replayed: bool(r.replayed) };
}
/** Klientens svar är platt; SQL-kuvertets aktör prövas separat av serveradaptern. */
export function parseSchemaDraftReadReply(value: unknown, expected: SchemaDraftScope): SchemaDraftReadReply {
  const r = record(value), scope = parseSchemaDraftScope(value, ['draft']);
  if (scope.unitId !== expected.unitId || scope.schoolYear !== expected.schoolYear || scope.period !== expected.period) invalid();
  return { ...scope, draft: r.draft === null ? null : parseSchemaDraft(r.draft, scope) };
}
export function parseSchemaDraftSaveReply(value: unknown, expected: Pick<SchemaDraftSave, keyof SchemaDraftScope | 'commandId' | 'draftId' | 'expectedRevision'>): SchemaDraftSaveReply {
  const r = record(value), scope = parseSchemaDraftScope(value, ['draft', 'receipt']);
  if (scope.unitId !== expected.unitId || scope.schoolYear !== expected.schoolYear || scope.period !== expected.period) invalid();
  const draft = parseSchemaDraft(r.draft, scope), receipt = parseSchemaDraftReceipt(r.receipt);
  if (receipt.commandId !== expected.commandId || receipt.draftId !== draft.id || expected.draftId !== null && expected.draftId !== draft.id
    || draft.revision !== receipt.revision || receipt.revision !== expected.expectedRevision + 1 || draft.contentHash !== receipt.contentHash || draft.savedAt !== receipt.savedAt) invalid();
  return { ...scope, draft, receipt };
}
export function parseSchemaDraftStatusReply(value: unknown, expected: SchemaDraftStatusRequest): SchemaDraftStatusReply {
  const r = record(value), scope = parseSchemaDraftScope(value, ['state', 'found', 'receipt']);
  if (scope.unitId !== expected.unitId || scope.schoolYear !== expected.schoolYear || scope.period !== expected.period || !['not_found', 'completed'].includes(r.state as string)) invalid();
  const receipt = r.receipt === null ? null : parseSchemaDraftReceipt(r.receipt);
  if ((r.state === 'not_found') !== (receipt === null) || bool(r.found) !== (receipt !== null) || receipt && (receipt.commandId !== expected.commandId || expected.draftId !== null && receipt.draftId !== expected.draftId)) invalid();
  return { ...scope, state: r.state as SchemaDraftStatusReply['state'], found: r.found as boolean, receipt };
}
export function schemaDraftDocument(draft: SchemaDraftDocument): SchemaDraftDocument {
  return { documentVersion: 1, base: draft.base, basisVillkor: draft.basisVillkor, workingVillkor: draft.workingVillkor, placements: draft.placements,
    locks: draft.locks, intentional: draft.intentional, datedOverrides: draft.datedOverrides, activityTypes: draft.activityTypes, control: draft.control,
    requiresRecalculation: draft.requiresRecalculation, source: draft.source };
}
export async function verifySchemaDraftReadReply(value: unknown, expected: SchemaDraftScope): Promise<SchemaDraftReadReply> {
  const reply = parseSchemaDraftReadReply(value, expected);
  if (reply.draft && (reply.draft.sourceHash !== reply.draft.source.digest || await schemaDraftHash(schemaDraftDocument(reply.draft)) !== reply.draft.contentHash)) invalid();
  return reply;
}
export async function verifySchemaDraftSaveReply(value: unknown, expected: SchemaDraftSave): Promise<SchemaDraftSaveReply> {
  const reply = parseSchemaDraftSaveReply(value, expected);
  if (reply.receipt.requestHash !== await schemaDraftHash(expected) || reply.draft.sourceHash !== reply.draft.source.digest
    || await schemaDraftHash(schemaDraftDocument(reply.draft)) !== reply.draft.contentHash) invalid();
  return reply;
}
export async function verifySchemaDraftResetReply(value: unknown, expected: SchemaDraftResetRequest): Promise<SchemaDraftSaveReply> {
  const reply = parseSchemaDraftSaveReply(value, expected);
  if (reply.receipt.requestHash !== await schemaDraftResetHash(expected) || reply.draft.sourceHash !== reply.draft.source.digest
    || await schemaDraftHash(schemaDraftDocument(reply.draft)) !== reply.draft.contentHash
    || (expected.action === 'clear' ? reply.draft.base !== null : !reply.draft.placements.length)) invalid();
  return reply;
}
