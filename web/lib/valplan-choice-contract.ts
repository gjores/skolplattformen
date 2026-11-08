import { selfBool, selfDate, selfInt, selfObject, selfText, selfTime, selfUuid, type ParticipantScope } from './elective-self-contract.ts';

/** VP-04. Local process per valplan. Only confirmed choices reach groups, and then through Undervisningsgrupper. */
export const VALPLAN_CHOICE_VERSION = 'valplan_choice_v1' as const;
export const VALPLAN_SELF_VERSION = 'valplan_self_v1' as const;
export const VALPLAN_CHOICE_STATES = ['awaiting_guardian', 'guardian_declined', 'guardian_bindings_missing', 'ready_for_confirmation', 'confirmed', 'course_changed', 'course_held'] as const;
export type ValplanChoiceState = typeof VALPLAN_CHOICE_STATES[number];
export type ValplanChoiceScope = { unitId: string; schoolYear: number; valplanId: string };
export type ValplanRound = { id: string; status: 'open' | 'closed'; closesOn: string; guardianConfirmation: boolean; revision: number; accepting: boolean };
export type ValplanChoice = { id: string; roundId: string; pupilId: string; revision: number; courseIds: string[]; state: ValplanChoiceState;
  submittedBy: 'school' | 'participant'; submittedAt: string; confirmedAt: string | null };
/** A course the pupil already has, from the timplan or from a choice in another block (F-08). */
export type ValplanBlockedCourse = { courseId: string; reason: 'timplan' | 'val' };
export type ValplanChoicePupil = { id: string; name: string; classIds: string[]; targetPoints: number | null; offeredCourseIds: string[]; blockedCourses: ValplanBlockedCourse[]; choice: ValplanChoice | null };
export type ValplanChoiceCourse = { id: string; name: string; points: number };
export type ValplanChoiceRead = ValplanChoiceScope & { contractVersion: typeof VALPLAN_CHOICE_VERSION; valplanName: string; valplanRevision: number;
  guardianConfirmation: boolean | null; round: ValplanRound | null; courses: ValplanChoiceCourse[]; classes: { id: string; name: string }[]; groupCourseIds: string[]; pupils: ValplanChoicePupil[] };
type Base = ValplanChoiceScope & { contractVersion: typeof VALPLAN_CHOICE_VERSION; commandId: string };
export type ValplanChoiceCommand = Base & (
  { action: 'set_policy'; payload: { guardianConfirmation: boolean } }
  | { action: 'open_round'; payload: { expectedRevision: number; closesOn: string } }
  | { action: 'close_round'; payload: { expectedRevision: number } }
  | { action: 'record_choice'; payload: { pupilId: string; expectedChoiceRevision: number; courseIds: string[] } }
  | { action: 'confirm_choice'; payload: { pupilId: string; expectedChoiceRevision: number } }
  | { action: 'create_groups'; payload: Record<string, never> });
export type ValplanGroupResult = { created: number; added: number; notConfirmed: number };
export type ValplanChoiceReply = { receipt: { commandId: string; action: ValplanChoiceCommand['action']; replayed: boolean; groups: ValplanGroupResult | null }; read: ValplanChoiceRead };

export type ValplanSelfOffer = { round: ValplanRound; valplanId: string; valplanName: string; kind: string; schoolYear: number; targetPoints: number | null;
  courses: ValplanChoiceCourse[]; blockedCourses: ValplanBlockedCourse[]; choice: ValplanChoice | null; decision: 'approve' | 'decline' | null };
export type ValplanSelfRead = { contractVersion: typeof VALPLAN_SELF_VERSION; epoch: number; offers: ValplanSelfOffer[] };
type SelfBase = ParticipantScope & { expectedBindingRevision: number; commandId: string };
export type ValplanSelfCommand = SelfBase & (
  { action: 'submit_choice'; payload: { roundId: string; expectedChoiceRevision: number; courseIds: string[] } }
  | { action: 'confirm_guardian'; payload: { choiceId: string; expectedChoiceRevision: number; decision: 'approve' | 'decline' } });
export type ValplanSelfReceipt = { commandId: string; action: ValplanSelfCommand['action']; bindingId: string; choiceId: string; choiceRevision: number; replayed: boolean };

export class ValplanChoiceContractError extends Error { constructor() { super('Ogiltigt underlag för elevval.'); this.name = 'ValplanChoiceContractError'; } }
function bad(): never { throw new ValplanChoiceContractError(); }
function list<T>(value: unknown, max: number, parse: (v: unknown) => T): T[] { if (!Array.isArray(value) || value.length > max) bad(); return value.map(parse); }
function ids(value: unknown, max = 50): string[] { const r = list(value, max, selfUuid); if (new Set(r).size !== r.length) bad(); return r; }
function year(value: unknown): number { return selfInt(value, 2000, 2100); }
function blocked(value: unknown): ValplanBlockedCourse[] {
  return list(value, 500, v => { const r = selfObject(v, ['courseId', 'reason']); if (r.reason !== 'timplan' && r.reason !== 'val') bad(); return { courseId: selfUuid(r.courseId), reason: r.reason }; });
}
/** The highest sum at or under the target. Each course counts once, as in a pupil's choice. */
export function valplanClosestPoints(points: readonly number[], target: number): number {
  const reach = new Set([0]);
  // The new sums are collected first, so one course is not added on top of itself.
  for (const p of points) { const next = [...reach].map(sum => sum + p).filter(sum => sum <= target); for (const sum of next) reach.add(sum); }
  return Math.max(...reach);
}

export function parseValplanChoiceScope(value: unknown): ValplanChoiceScope {
  const r = selfObject(value, ['unitId', 'schoolYear', 'valplanId']);
  return { unitId: selfUuid(r.unitId), schoolYear: year(r.schoolYear), valplanId: selfUuid(r.valplanId) };
}
function round(value: unknown): ValplanRound {
  const r = selfObject(value, ['id', 'status', 'closesOn', 'guardianConfirmation', 'revision', 'accepting']);
  if (r.status !== 'open' && r.status !== 'closed') bad();
  return { id: selfUuid(r.id), status: r.status, closesOn: selfDate(r.closesOn), guardianConfirmation: selfBool(r.guardianConfirmation), revision: selfInt(r.revision), accepting: selfBool(r.accepting) };
}
function choice(value: unknown): ValplanChoice {
  const r = selfObject(value, ['id', 'roundId', 'pupilId', 'revision', 'courseIds', 'state', 'submittedBy', 'submittedAt', 'confirmedAt']);
  if (!VALPLAN_CHOICE_STATES.includes(r.state as ValplanChoiceState) || (r.submittedBy !== 'school' && r.submittedBy !== 'participant')) bad();
  return { id: selfUuid(r.id), roundId: selfUuid(r.roundId), pupilId: selfUuid(r.pupilId), revision: selfInt(r.revision), courseIds: ids(r.courseIds), state: r.state as ValplanChoiceState,
    submittedBy: r.submittedBy, submittedAt: selfTime(r.submittedAt), confirmedAt: r.confirmedAt === null ? null : selfTime(r.confirmedAt) };
}
function course(value: unknown): ValplanChoiceCourse {
  const r = selfObject(value, ['id', 'name', 'points']);
  return { id: selfUuid(r.id), name: selfText(r.name, 200), points: selfInt(r.points, 1, 10000) };
}
function pupil(value: unknown): ValplanChoicePupil {
  const r = selfObject(value, ['id', 'name', 'classIds', 'targetPoints', 'offeredCourseIds', 'blockedCourses', 'choice']);
  return { id: selfUuid(r.id), name: selfText(r.name, 300), classIds: ids(r.classIds, 200), targetPoints: r.targetPoints === null ? null : selfInt(r.targetPoints, 0, 10000),
    offeredCourseIds: ids(r.offeredCourseIds, 500), blockedCourses: blocked(r.blockedCourses), choice: r.choice === null ? null : choice(r.choice) };
}
export function parseValplanChoiceRead(value: unknown, scope: ValplanChoiceScope): ValplanChoiceRead {
  const r = selfObject(value, ['contractVersion', 'unitId', 'schoolYear', 'valplanId', 'valplanName', 'valplanRevision', 'guardianConfirmation', 'round', 'courses', 'classes', 'groupCourseIds', 'pupils']);
  if (r.contractVersion !== VALPLAN_CHOICE_VERSION || r.unitId !== scope.unitId || r.schoolYear !== scope.schoolYear || r.valplanId !== scope.valplanId) bad();
  // Only the scope fields: a reply passes its command as scope, and the client parses the result again.
  return { unitId: scope.unitId, schoolYear: scope.schoolYear, valplanId: scope.valplanId, contractVersion: VALPLAN_CHOICE_VERSION, valplanName: selfText(r.valplanName, 200), valplanRevision: selfInt(r.valplanRevision),
    guardianConfirmation: r.guardianConfirmation === null ? null : selfBool(r.guardianConfirmation), round: r.round === null ? null : round(r.round),
    courses: list(r.courses, 500, course), classes: list(r.classes, 2000, v => { const c = selfObject(v, ['id', 'name']); return { id: selfUuid(c.id), name: selfText(c.name, 200) }; }),
    groupCourseIds: ids(r.groupCourseIds, 500), pupils: list(r.pupils, 10000, pupil) };
}
export function parseValplanChoiceCommand(value: unknown): ValplanChoiceCommand {
  const r = selfObject(value, ['contractVersion', 'commandId', 'action', 'unitId', 'schoolYear', 'valplanId', 'payload']);
  if (r.contractVersion !== VALPLAN_CHOICE_VERSION) bad();
  const base = { ...parseValplanChoiceScope({ unitId: r.unitId, schoolYear: r.schoolYear, valplanId: r.valplanId }), contractVersion: VALPLAN_CHOICE_VERSION, commandId: selfUuid(r.commandId) };
  switch (r.action) {
    case 'set_policy': { const p = selfObject(r.payload, ['guardianConfirmation']); return { ...base, action: r.action, payload: { guardianConfirmation: selfBool(p.guardianConfirmation) } }; }
    case 'open_round': { const p = selfObject(r.payload, ['expectedRevision', 'closesOn']); return { ...base, action: r.action, payload: { expectedRevision: selfInt(p.expectedRevision, 0), closesOn: selfDate(p.closesOn) } }; }
    case 'close_round': { const p = selfObject(r.payload, ['expectedRevision']); return { ...base, action: r.action, payload: { expectedRevision: selfInt(p.expectedRevision) } }; }
    case 'record_choice': { const p = selfObject(r.payload, ['pupilId', 'expectedChoiceRevision', 'courseIds']); const courseIds = ids(p.courseIds); if (!courseIds.length) bad();
      return { ...base, action: r.action, payload: { pupilId: selfUuid(p.pupilId), expectedChoiceRevision: selfInt(p.expectedChoiceRevision, 0), courseIds } }; }
    case 'confirm_choice': { const p = selfObject(r.payload, ['pupilId', 'expectedChoiceRevision']); return { ...base, action: r.action, payload: { pupilId: selfUuid(p.pupilId), expectedChoiceRevision: selfInt(p.expectedChoiceRevision) } }; }
    case 'create_groups': selfObject(r.payload, []); return { ...base, action: r.action, payload: {} };
    default: return bad();
  }
}
export function parseValplanChoiceReply(value: unknown, command: ValplanChoiceCommand): ValplanChoiceReply {
  const r = selfObject(value, ['receipt', 'read']), raw = r.receipt as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || raw.commandId !== command.commandId || raw.action !== command.action || typeof raw.replayed !== 'boolean') bad();
  const groups = command.action === 'create_groups' ? { created: selfInt(raw.created, 0), added: selfInt(raw.added, 0), notConfirmed: selfInt(raw.notConfirmed, 0) } : null;
  return { receipt: { commandId: command.commandId, action: command.action, replayed: raw.replayed, groups }, read: parseValplanChoiceRead(r.read, command) };
}

function selfOffer(value: unknown): ValplanSelfOffer {
  const r = selfObject(value, ['round', 'valplanId', 'valplanName', 'kind', 'schoolYear', 'targetPoints', 'courses', 'blockedCourses', 'choice', 'decision']);
  if (r.decision !== null && r.decision !== 'approve' && r.decision !== 'decline') bad();
  return { round: round(r.round), valplanId: selfUuid(r.valplanId), valplanName: selfText(r.valplanName, 200), kind: selfText(r.kind, 40), schoolYear: year(r.schoolYear),
    targetPoints: r.targetPoints === null ? null : selfInt(r.targetPoints, 0, 10000), courses: list(r.courses, 500, course), blockedCourses: blocked(r.blockedCourses), choice: r.choice === null ? null : choice(r.choice), decision: r.decision };
}
export function parseValplanSelfRead(value: unknown, epoch: number): ValplanSelfRead {
  const r = selfObject(value, ['contractVersion', 'epoch', 'offers']);
  if (r.contractVersion !== VALPLAN_SELF_VERSION || r.epoch !== epoch) bad();
  return { contractVersion: VALPLAN_SELF_VERSION, epoch, offers: list(r.offers, 200, selfOffer) };
}
export function parseValplanSelfCommand(value: unknown): ValplanSelfCommand {
  const r = selfObject(value, ['unitId', 'pupilId', 'participant', 'expectedBindingRevision', 'commandId', 'action', 'payload']);
  if (r.participant !== 'pupil' && r.participant !== 'guardian') bad();
  const participant: ParticipantScope['participant'] = r.participant;
  const base = { unitId: selfUuid(r.unitId), pupilId: selfUuid(r.pupilId), participant, expectedBindingRevision: selfInt(r.expectedBindingRevision), commandId: selfUuid(r.commandId) };
  if (r.action === 'submit_choice' && r.participant === 'pupil') {
    const p = selfObject(r.payload, ['roundId', 'expectedChoiceRevision', 'courseIds']), courseIds = ids(p.courseIds);
    if (!courseIds.length) bad();
    return { ...base, action: r.action, payload: { roundId: selfUuid(p.roundId), expectedChoiceRevision: selfInt(p.expectedChoiceRevision, 0), courseIds } };
  }
  if (r.action === 'confirm_guardian' && r.participant === 'guardian') {
    const p = selfObject(r.payload, ['choiceId', 'expectedChoiceRevision', 'decision']);
    if (p.decision !== 'approve' && p.decision !== 'decline') bad();
    return { ...base, action: r.action, payload: { choiceId: selfUuid(p.choiceId), expectedChoiceRevision: selfInt(p.expectedChoiceRevision), decision: p.decision } };
  }
  return bad();
}
export function parseValplanSelfReceipt(value: unknown, command: ValplanSelfCommand, bindingId: string): ValplanSelfReceipt {
  const r = selfObject(value, ['commandId', 'action', 'bindingId', 'choiceId', 'choiceRevision', 'replayed']);
  if (r.commandId !== command.commandId || r.action !== command.action || r.bindingId !== bindingId) bad();
  return { commandId: command.commandId, action: command.action, bindingId, choiceId: selfUuid(r.choiceId), choiceRevision: selfInt(r.choiceRevision), replayed: selfBool(r.replayed) };
}
