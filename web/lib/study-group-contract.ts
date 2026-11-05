import { ProgramplanContractError } from './programplan-catalog.ts';
import { STUDY_GROUP_MEMBER_SOURCES, parseStudyGroup, parseStudyGroupMembership, type StudyGroup, type StudyGroupMembership, type StudyGroupMemberSource } from './study-group-model.ts';

/** Wire contract for /api/undervisningsgrupper. Memberships and pupils only include what the actor may see. */
export const STUDY_GROUP_CONTRACT_VERSION = 'study_group_v1' as const;
export const STUDY_GROUP_ACTIONS = ['save_group', 'retire_group', 'add_members', 'move_member', 'end_member', 'cancel_member'] as const;
export type StudyGroupAction = typeof STUDY_GROUP_ACTIONS[number];
export type StudyGroupScope = { unitId: string; schoolYear: number };
export type StudyGroupPupil = { id: string; name: string; classIds: string[] };
export type StudyGroupRead = StudyGroupScope & { contractVersion: typeof STUDY_GROUP_CONTRACT_VERSION; groups: StudyGroup[]; memberships: StudyGroupMembership[]; pupils: StudyGroupPupil[]; classes: { id: string; name: string }[] };
export type StudyGroupSave = Omit<StudyGroup, 'unitId' | 'schoolYear' | 'revision' | 'active'> & { expectedRevision: number };
export type StudyGroupMemberInput = { pupilId: string; startsOn: string; endsOn: string; source: StudyGroupMemberSource; sourceRef: string | null };
export type StudyGroupPayload =
  | { action: 'save_group'; payload: StudyGroupSave }
  | { action: 'retire_group'; payload: { groupId: string; expectedRevision: number } }
  | { action: 'add_members'; payload: { groupId: string; members: StudyGroupMemberInput[] } }
  | { action: 'move_member'; payload: { membershipId: string; toGroupId: string; on: string } }
  | { action: 'end_member'; payload: { membershipId: string; endsOn: string } }
  | { action: 'cancel_member'; payload: { membershipId: string } };
export type StudyGroupCommand = StudyGroupScope & { contractVersion: typeof STUDY_GROUP_CONTRACT_VERSION; commandId: string } & StudyGroupPayload;
export type StudyGroupReply = { receipt: { commandId: string; action: StudyGroupAction; replayed: boolean; groupId?: string; revision?: number; membershipId?: string; membershipIds?: string[] }; read: StudyGroupRead };

function bad(): never { throw new ProgramplanContractError('invalid_study_group'); }
function shape(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  const row = value as Record<string, unknown>;
  if (keys.some(k => !Object.hasOwn(row, k)) || Object.getOwnPropertyNames(row).some(k => !keys.includes(k) && !optional.includes(k))) bad();
  return row;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function integer(value: unknown, min: number, max: number): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad(); return value; }
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) bad();
  return value;
}

export function parseStudyGroupScope(value: unknown): StudyGroupScope {
  const r = shape(value, ['unitId', 'schoolYear']);
  return { unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 2000, 2100) };
}
export function parseStudyGroupRead(value: unknown, scope: StudyGroupScope): StudyGroupRead {
  const r = shape(value, ['contractVersion', 'unitId', 'schoolYear', 'groups', 'memberships', 'pupils', 'classes']);
  if (r.contractVersion !== STUDY_GROUP_CONTRACT_VERSION || uuid(r.unitId) !== scope.unitId || r.schoolYear !== scope.schoolYear) bad();
  const groups = list(r.groups, 5000).map(parseStudyGroup), memberships = list(r.memberships, 100000).map(parseStudyGroupMembership);
  const ids = new Set(groups.map(g => g.id));
  if (ids.size !== groups.length || groups.some(g => g.unitId !== scope.unitId || g.schoolYear !== scope.schoolYear) || memberships.some(m => !ids.has(m.groupId))) bad();
  const pupils = list(r.pupils, 100000).map(p => {
    const x = shape(p, ['id', 'name', 'classIds']);
    if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 240) bad();
    return { id: uuid(x.id), name: x.name, classIds: list(x.classIds, 100).map(uuid) };
  });
  const classes = list(r.classes, 5000).map(c => {
    const x = shape(c, ['id', 'name']);
    if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 240) bad();
    return { id: uuid(x.id), name: x.name };
  });
  return { contractVersion: STUDY_GROUP_CONTRACT_VERSION, ...scope, groups, memberships, pupils, classes };
}
function parseSave(value: unknown): StudyGroupSave {
  const r = shape(value, ['id', 'expectedRevision', 'name', 'startsOn', 'endsOn', 'course', 'minutesHt', 'minutesVt', 'parallelSetId', 'classIds', 'origin']);
  // Reuse the group parser for every shared field; unit and year come from the command scope.
  const g = parseStudyGroup({ id: r.id, unitId: '00000000-0000-4000-8000-000000000000', schoolYear: 2000, name: r.name, startsOn: r.startsOn, endsOn: r.endsOn, course: r.course,
    minutesHt: r.minutesHt, minutesVt: r.minutesVt, parallelSetId: r.parallelSetId, classIds: r.classIds, origin: r.origin, revision: 1, active: true });
  return { id: g.id, expectedRevision: integer(r.expectedRevision, 0, 2147483645), name: g.name, startsOn: g.startsOn, endsOn: g.endsOn, course: g.course,
    minutesHt: g.minutesHt, minutesVt: g.minutesVt, parallelSetId: g.parallelSetId, classIds: g.classIds, origin: g.origin };
}
function parseMember(value: unknown): StudyGroupMemberInput {
  const r = shape(value, ['pupilId', 'startsOn', 'endsOn', 'source', 'sourceRef']);
  if (typeof r.source !== 'string' || !(STUDY_GROUP_MEMBER_SOURCES as readonly string[]).includes(r.source)) bad();
  const startsOn = date(r.startsOn), endsOn = date(r.endsOn);
  if (endsOn < startsOn) bad();
  return { pupilId: uuid(r.pupilId), startsOn, endsOn, source: r.source as StudyGroupMemberSource, sourceRef: r.sourceRef === null ? null : uuid(r.sourceRef) };
}
function parsePayload(action: StudyGroupAction, value: unknown): StudyGroupPayload {
  if (action === 'save_group') return { action, payload: parseSave(value) };
  if (action === 'retire_group') { const r = shape(value, ['groupId', 'expectedRevision']); return { action, payload: { groupId: uuid(r.groupId), expectedRevision: integer(r.expectedRevision, 1, 2147483645) } }; }
  if (action === 'add_members') { const r = shape(value, ['groupId', 'members']), members = list(r.members, 1000).map(parseMember); if (!members.length) bad(); return { action, payload: { groupId: uuid(r.groupId), members } }; }
  if (action === 'move_member') { const r = shape(value, ['membershipId', 'toGroupId', 'on']); return { action, payload: { membershipId: uuid(r.membershipId), toGroupId: uuid(r.toGroupId), on: date(r.on) } }; }
  if (action === 'end_member') { const r = shape(value, ['membershipId', 'endsOn']); return { action, payload: { membershipId: uuid(r.membershipId), endsOn: date(r.endsOn) } }; }
  const r = shape(value, ['membershipId']); return { action, payload: { membershipId: uuid(r.membershipId) } };
}
export function parseStudyGroupCommand(value: unknown): StudyGroupCommand {
  const r = shape(value, ['contractVersion', 'commandId', 'action', 'unitId', 'schoolYear', 'payload']);
  if (r.contractVersion !== STUDY_GROUP_CONTRACT_VERSION || typeof r.action !== 'string' || !(STUDY_GROUP_ACTIONS as readonly string[]).includes(r.action)) bad();
  return { contractVersion: STUDY_GROUP_CONTRACT_VERSION, commandId: uuid(r.commandId), ...parseStudyGroupScope({ unitId: r.unitId, schoolYear: r.schoolYear }), ...parsePayload(r.action as StudyGroupAction, r.payload) };
}
export function parseStudyGroupReply(value: unknown, command: StudyGroupCommand): StudyGroupReply {
  const r = shape(value, ['receipt', 'read']), x = shape(r.receipt, ['commandId', 'action', 'replayed'], ['groupId', 'revision', 'membershipId', 'membershipIds']);
  if (uuid(x.commandId) !== command.commandId || x.action !== command.action || typeof x.replayed !== 'boolean') bad();
  const receipt: StudyGroupReply['receipt'] = { commandId: command.commandId, action: command.action, replayed: x.replayed };
  if (x.groupId !== undefined) receipt.groupId = uuid(x.groupId);
  if (x.revision !== undefined) receipt.revision = integer(x.revision, 1, 2147483646);
  if (x.membershipId !== undefined) receipt.membershipId = uuid(x.membershipId);
  if (x.membershipIds !== undefined) receipt.membershipIds = list(x.membershipIds, 1000).map(uuid);
  const expectedGroup = command.action === 'save_group' ? command.payload.id : command.action === 'retire_group' || command.action === 'add_members' ? command.payload.groupId : null;
  if (expectedGroup && receipt.groupId !== expectedGroup || 'membershipId' in command.payload && receipt.membershipId !== command.payload.membershipId) bad();
  return { receipt, read: parseStudyGroupRead(r.read, command) };
}
