import { gymArray, gymBoolean, gymInteger, gymObject, gymRowKey, gymShape, gymUuid, isGymTimplanV2, parseGymTimplan, type GymTimplanV2 } from './gym-timplan.ts';
import { parseTimplanTimeRow, type TimeRowV2, type TimplanTimeRows } from './timplan-time.ts';
export const TIMPLAN_TIME_COMMAND_VERSION = 'timplan_time_v2' as const;
type Identity = { contractVersion: typeof TIMPLAN_TIME_COMMAND_VERSION; commandId: string; planId: string; expectedRevision: number };
export type TimplanTimeTransitionCommand = Identity & { action: 'transition'; expectedBasisHash: string; reviewed: true };
export type TimplanTimeRowCommand = Identity & { action: 'save_row'; rowKey: string; row: TimeRowV2 };
export type TimplanTimeRowsCommand = Identity & { action: 'save_rows'; rows: TimplanTimeRows };
export type TimplanTimeReviewCommand = Identity & { action: 'resolve_copy_review'; reviewId: string; note: string };
export type TimplanTimeCommand = TimplanTimeTransitionCommand | TimplanTimeRowCommand | TimplanTimeRowsCommand | TimplanTimeReviewCommand;
export type TimplanTimeBasis = { planId: string; revision: number; basisHash: string; rows: TimplanTimeRows };
export type TimplanTimeReply = { contractVersion: typeof TIMPLAN_TIME_COMMAND_VERSION; plan: GymTimplanV2; receipt: {
  commandId: string; planId: string; action: TimplanTimeCommand['action']; revision: number; changed: boolean; replayed: boolean } };
export type TimplanTimeStatus = { state: 'not_found'; result: null } | { state: 'completed'; result: TimplanTimeReply };
function bad(): never { throw new TypeError('Ogiltigt underlag för timplanens tidsmodell.'); }
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function rows(value: unknown): TimplanTimeRows {
  const raw = gymObject(value), entries = Object.entries(raw);
  gymArray(entries, 2000); if (!entries.length) bad();
  return Object.fromEntries(entries.map(([key, value]) => [gymRowKey(key), parseTimplanTimeRow(value)]));
}
export function parseTimplanTimeCommand(value: unknown): TimplanTimeCommand {
  const raw = gymObject(value), action = raw.action;
  if (!['transition', 'save_row', 'save_rows', 'resolve_copy_review'].includes(String(action))) bad();
  const r = gymShape(value, ['contractVersion', 'action', 'commandId', 'planId', 'expectedRevision',
    ...(action === 'transition' ? ['expectedBasisHash', 'reviewed'] : action === 'save_row' ? ['rowKey', 'row'] : action === 'resolve_copy_review' ? ['reviewId', 'note'] : ['rows'])]);
  if (r.contractVersion !== TIMPLAN_TIME_COMMAND_VERSION) bad();
  const identity: Identity = { contractVersion: TIMPLAN_TIME_COMMAND_VERSION, commandId: gymUuid(r.commandId), planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision, 2147483646) };
  if (action === 'transition') { if (r.reviewed !== true) bad(); return { ...identity, action, expectedBasisHash: hash(r.expectedBasisHash), reviewed: true }; }
  if (action === 'save_row') return { ...identity, action, rowKey: gymRowKey(r.rowKey), row: parseTimplanTimeRow(r.row) };
  if (action === 'resolve_copy_review') {
    if (typeof r.note !== 'string' || !r.note.trim() || r.note !== r.note.trim() || Array.from(r.note).length > 2000 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(r.note)) bad();
    return { ...identity, action, reviewId: gymUuid(r.reviewId), note: r.note };
  }
  return { ...identity, action: 'save_rows', rows: rows(r.rows) };
}
export function parseTimplanTimeBasis(value: unknown, planId: string): TimplanTimeBasis {
  const r = gymShape(value, ['planId', 'revision', 'basisHash', 'rows']);
  if (gymUuid(r.planId) !== gymUuid(planId)) bad();
  return { planId: gymUuid(r.planId), revision: gymInteger(r.revision), basisHash: hash(r.basisHash), rows: rows(r.rows) };
}
export function parseTimplanTimeReply(value: unknown, expected: TimplanTimeCommand): TimplanTimeReply {
  const q = parseTimplanTimeCommand(expected), r = gymShape(value, ['contractVersion', 'plan', 'receipt']);
  if (r.contractVersion !== TIMPLAN_TIME_COMMAND_VERSION) bad();
  const plan = parseGymTimplan(r.plan, q.planId), receipt = gymShape(r.receipt, ['commandId', 'planId', 'action', 'revision', 'changed', 'replayed']);
  if (!isGymTimplanV2(plan) || gymUuid(receipt.commandId) !== q.commandId || gymUuid(receipt.planId) !== q.planId || receipt.action !== q.action) bad();
  const changed = gymBoolean(receipt.changed), replayed = gymBoolean(receipt.replayed), revision = gymInteger(receipt.revision);
  if (revision !== q.expectedRevision + (changed ? 1 : 0) || plan.revision !== revision || q.action === 'transition' && !changed) bad();
  const same = (a: TimeRowV2, b: TimeRowV2) => a.schoolMinutes.every((n, i) => n === b.schoolMinutes[i]) && a.annualAplMinutes.every((n, i) => n === b.annualAplMinutes[i]);
  if (q.action === 'save_row' && (!plan.timeRows[q.rowKey] || !same(plan.timeRows[q.rowKey], q.row))) bad();
  if (q.action === 'save_rows' && (Object.keys(q.rows).length !== plan.rows.length || plan.rows.some(row => !q.rows[row.key] || !same(plan.timeRows[row.key], q.rows[row.key])))) bad();
  if (q.action === 'resolve_copy_review' && plan.timeCopyReview.find(r => r.id === q.reviewId)?.resolution?.note !== q.note) bad();
  return { contractVersion: TIMPLAN_TIME_COMMAND_VERSION, plan, receipt: { commandId: q.commandId, planId: q.planId, action: q.action, revision, changed, replayed } };
}
export function parseTimplanTimeStatusRequest(value: unknown): { command: TimplanTimeCommand } {
  return { command: parseTimplanTimeCommand(gymShape(value, ['command']).command) };
}
export function parseTimplanTimeStatus(value: unknown, expected: { command: TimplanTimeCommand }): TimplanTimeStatus {
  const r = gymShape(value, ['state', 'result']);
  if (r.state === 'not_found') { if (r.result !== null) bad(); return { state: 'not_found', result: null }; }
  if (r.state !== 'completed') bad();
  const result = parseTimplanTimeReply(r.result, expected.command); if (!result.receipt.replayed) bad();
  return { state: 'completed', result };
}
export const parseTimplanTimeCommandReply = parseTimplanTimeReply;
export const parseTimplanTimeStatusReply = parseTimplanTimeStatus;
export const parseTimplanTimeTransitionBasis = parseTimplanTimeBasis;
