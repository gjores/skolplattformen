import { ProgramplanContractError } from './programplan-catalog.ts';
import { PROGRAMPLAN_LANGUAGES } from './programplan-languages.ts';

/** App-wide teaching groups. Intended SS 12000 meaning: Group with type Undervisning and GroupMembership
 * with inclusive dates. Administrative classes are never changed here. No export is claimed. */
export type StudyGroupCourse = { subjectCode: string; subjectVersion: number; itemCode: string; points: number; languageCode: string | null };
export type StudyGroupOrigin = { kind: 'valplan'; valplanId: string; courseId: string } | { kind: 'classes' } | { kind: 'manual' };
export type StudyGroup = {
  id: string; unitId: string; schoolYear: number; name: string; startsOn: string; endsOn: string; course: StudyGroupCourse | null;
  minutesHt: number; minutesVt: number; parallelSetId: string; classIds: string[]; origin: StudyGroupOrigin; revision: number; active: boolean;
};
export const STUDY_GROUP_MEMBER_SOURCES = ['class', 'choice', 'manual'] as const;
export type StudyGroupMemberSource = typeof STUDY_GROUP_MEMBER_SOURCES[number];
export type StudyGroupMembership = { id: string; groupId: string; pupilId: string; startsOn: string; endsOn: string; source: StudyGroupMemberSource; sourceRef: string | null };
export type StudyGroupMembershipDraft = Omit<StudyGroupMembership, 'id'>;
export type StudyGroupError = { code: 'unknown_group' | 'group_inactive' | 'membership_outside_group' | 'membership_overlap' | 'parallel_overlap'; membershipId: string };
export type StudyGroupNeed = { groupId: string; minutesHt: number; minutesVt: number; classIds: string[] };

const LANGUAGE_CODES = new Set(PROGRAMPLAN_LANGUAGES.map(l => l.code));
function bad(): never { throw new ProgramplanContractError('invalid_study_group'); }
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  const row = value as Record<string, unknown>;
  if (keys.some(k => !Object.hasOwn(row, k)) || Object.getOwnPropertyNames(row).some(k => !keys.includes(k))) bad();
  return row;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) bad();
  return value;
}
function code(value: unknown): string {
  if (typeof value !== 'string' || value.length > 96 || !/^\p{L}[\p{L}\p{N}_-]*$/u.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) bad();
  return value;
}
function uuids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500 || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  const ids = Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i) ? uuid(value[i]) : bad());
  if (new Set(ids).size !== ids.length) bad();
  return ids;
}
function dayBefore(iso: string): string { return new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10); }
const overlaps = (a: { startsOn: string; endsOn: string }, b: { startsOn: string; endsOn: string }) => a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;

export function parseStudyGroup(value: unknown): StudyGroup {
  const r = shape(value, ['id', 'unitId', 'schoolYear', 'name', 'startsOn', 'endsOn', 'course', 'minutesHt', 'minutesVt', 'parallelSetId', 'classIds', 'origin', 'revision', 'active']);
  let course: StudyGroupCourse | null = null;
  if (r.course !== null) {
    const c = shape(r.course, ['subjectCode', 'subjectVersion', 'itemCode', 'points', 'languageCode']);
    if (c.languageCode !== null && (typeof c.languageCode !== 'string' || !LANGUAGE_CODES.has(c.languageCode))) bad();
    course = { subjectCode: code(c.subjectCode), subjectVersion: integer(c.subjectVersion, 1, 100000), itemCode: code(c.itemCode), points: integer(c.points, 1, 10000), languageCode: c.languageCode as string | null };
  }
  const kind = r.origin && typeof r.origin === 'object' ? Object.getOwnPropertyDescriptor(r.origin, 'kind')?.value : undefined;
  let origin: StudyGroupOrigin;
  if (kind === 'valplan') { const o = shape(r.origin, ['kind', 'valplanId', 'courseId']); origin = { kind, valplanId: uuid(o.valplanId), courseId: uuid(o.courseId) }; }
  else if (kind === 'classes' || kind === 'manual') { shape(r.origin, ['kind']); origin = { kind }; }
  else bad();
  const classIds = uuids(r.classIds);
  if (origin.kind === 'classes' && !classIds.length) bad();
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200 || typeof r.active !== 'boolean') bad();
  const startsOn = date(r.startsOn), endsOn = date(r.endsOn);
  if (endsOn < startsOn) bad();
  return { id: uuid(r.id), unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 2000, 2100), name: r.name, startsOn, endsOn, course,
    minutesHt: integer(r.minutesHt, 0, 100000), minutesVt: integer(r.minutesVt, 0, 100000), parallelSetId: uuid(r.parallelSetId), classIds, origin,
    revision: integer(r.revision, 1, 2147483646), active: r.active };
}

export function parseStudyGroupMembership(value: unknown): StudyGroupMembership {
  const r = shape(value, ['id', 'groupId', 'pupilId', 'startsOn', 'endsOn', 'source', 'sourceRef']);
  if (typeof r.source !== 'string' || !(STUDY_GROUP_MEMBER_SOURCES as readonly string[]).includes(r.source)) bad();
  const startsOn = date(r.startsOn), endsOn = date(r.endsOn);
  if (endsOn < startsOn) bad();
  return { id: uuid(r.id), groupId: uuid(r.groupId), pupilId: uuid(r.pupilId), startsOn, endsOn, source: r.source as StudyGroupMemberSource, sourceRef: r.sourceRef === null ? null : uuid(r.sourceRef) };
}

export function studyGroupMembershipErrors(groups: readonly StudyGroup[], memberships: readonly StudyGroupMembership[]): StudyGroupError[] {
  const out: StudyGroupError[] = [];
  const byId = new Map(groups.map(g => [g.id, g]));
  memberships.forEach((m, i) => {
    const g = byId.get(m.groupId);
    if (!g) { out.push({ code: 'unknown_group', membershipId: m.id }); return; }
    if (!g.active) out.push({ code: 'group_inactive', membershipId: m.id });
    if (m.startsOn < g.startsOn || m.endsOn > g.endsOn) out.push({ code: 'membership_outside_group', membershipId: m.id });
    for (const earlier of memberships.slice(0, i)) {
      const other = byId.get(earlier.groupId);
      if (earlier.pupilId !== m.pupilId || !other || !overlaps(earlier, m)) continue;
      if (earlier.groupId === m.groupId) out.push({ code: 'membership_overlap', membershipId: m.id });
      else if (other.parallelSetId === g.parallelSetId) out.push({ code: 'parallel_overlap', membershipId: m.id });
    }
  });
  return out;
}

/** Places pupils who have no membership in the set on `on`, in the given order, into the currently smallest group. */
export function distributeStudyGroupMembers(groups: readonly StudyGroup[], memberships: readonly StudyGroupMembership[], pupilIds: readonly string[], on: string,
  source: StudyGroupMemberSource = 'manual', sourceRef: string | null = null): StudyGroupMembershipDraft[] {
  date(on);
  if (!groups.length || groups.some(g => g.parallelSetId !== groups[0].parallelSetId || !g.active || on < g.startsOn || on > g.endsOn)) bad();
  const ids = new Set(groups.map(g => g.id));
  const active = memberships.filter(m => ids.has(m.groupId) && m.startsOn <= on && on <= m.endsOn);
  const counts = new Map(groups.map(g => [g.id, active.filter(m => m.groupId === g.id).length]));
  const placed = new Set(active.map(m => m.pupilId));
  const drafts: StudyGroupMembershipDraft[] = [];
  for (const pupilId of pupilIds) {
    if (placed.has(pupilId)) continue;
    placed.add(pupilId);
    const target = groups.reduce((best, g) => counts.get(g.id)! < counts.get(best.id)! ? g : best);
    counts.set(target.id, counts.get(target.id)! + 1);
    drafts.push({ groupId: target.id, pupilId, startsOn: on, endsOn: target.endsOn, source, sourceRef });
  }
  return drafts;
}

/** A move within a parallel set: the old membership ends the day before, or is cancelled if it has not started. */
export function moveStudyGroupMembership(from: StudyGroup, to: StudyGroup, membership: StudyGroupMembership, on: string):
  { end: StudyGroupMembership | null; cancel: boolean; create: StudyGroupMembershipDraft } {
  date(on);
  if (membership.groupId !== from.id || from.id === to.id || from.parallelSetId !== to.parallelSetId || !to.active || on > membership.endsOn || on < to.startsOn || on > to.endsOn) bad();
  const cancel = on <= membership.startsOn;
  const startsOn = cancel ? membership.startsOn : on;
  return { end: cancel ? null : { ...membership, endsOn: dayBefore(on) }, cancel,
    create: { groupId: to.id, pupilId: membership.pupilId, startsOn, endsOn: membership.endsOn < to.endsOn ? membership.endsOn : to.endsOn, source: membership.source, sourceRef: membership.sourceRef } };
}

export function renameStudyGroup(group: StudyGroup, name: string): StudyGroup {
  return parseStudyGroup({ ...group, name, revision: group.revision + 1 });
}

/** Each active group is one need, however many classes it draws from. */
export function studyGroupNeeds(groups: readonly StudyGroup[]): StudyGroupNeed[] {
  return groups.filter(g => g.active).map(g => ({ groupId: g.id, minutesHt: g.minutesHt, minutesVt: g.minutesVt, classIds: [...g.classIds] }));
}

/** How a timplan row is counted in tjänstefördelning. A row filled by a valplan is never also a class need. */
export function timplanRowNeedMode(linkedValplanId: string | null, groups: readonly StudyGroup[]): 'class' | 'groups' | 'unorganized' {
  if (linkedValplanId === null) return 'class';
  return groups.some(g => g.active && g.origin.kind === 'valplan' && g.origin.valplanId === linkedValplanId) ? 'groups' : 'unorganized';
}
