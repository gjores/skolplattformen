import {
  invalidStudyPlan, parsePlannedStudyDate, parseStudyFactSource, parseStudyPlanCompulsorySubjects,
  parseStudyPlanDecision, parseStudyPlanDistanceTeaching, parseStudyPlanIssue, parseStudyPlanLevelRef,
  parseStudyPlanRevision, parseStudyPlanSnapshot, studyPlanDate, studyPlanEnum, studyPlanFields,
  studyPlanAt, studyPlanInt, studyPlanLabel, studyPlanLevelKey, studyPlanList, studyPlanNullable, studyPlanUnique,
  studyPlanUuid, studyPlanCode, validPlannedStudyPeriod, type PlannedStudyDate, type StudyFact,
  type StudyPlanCatalogLevel, type StudyPlanContent, type StudyPlanDecision, type StudyPlanDistanceTeaching,
  type StudyPlanIssue, type StudyPlanLevelRef, type StudyPlanRevision, type StudyPlanSnapshot,
} from './study-plan-model.ts';

export { StudyPlanContractError } from './study-plan-model.ts';
export const STUDY_PLAN_CONTRACT_VERSION = 'individual_study_plan_v1' as const;
export const STUDY_PLAN_ACTIONS = ['prepare_draft', 'update_planned_dates', 'record_actual', 'record_decision', 'record_dialogue', 'make_current'] as const;
export type StudyPlanAction = typeof STUDY_PLAN_ACTIONS[number];
export type StudyPlanScope = { contractVersion: typeof STUDY_PLAN_CONTRACT_VERSION; unitId: string; pupilId: string; placementId: string };

export type StudyPlanDateEdit = { levelId: string; attemptId: string; plannedStart: PlannedStudyDate; plannedEnd: PlannedStudyDate };
export type StudyPlanDraftEdit = {
  dates: StudyPlanDateEdit[];
  selections?: { choiceId: string; level: StudyPlanLevelRef }[];
  confirmedChoiceIds?: string[];
  apprenticeship?: boolean;
  compulsorySchoolSubjects?: StudyPlanContent['compulsorySchoolSubjects'];
  distanceTeaching?: StudyPlanDistanceTeaching;
};
export type StudyPlanEvent = { kind: 'started' | 'completed' | 'interrupted' } & StudyFact;
export type StudyPlanCommand = StudyPlanScope & {
  commandId: string;
  expectedRevision: number;
  expectedSourceToken: string;
} & (
  | { action: 'prepare_draft'; payload: StudyPlanDraftEdit }
  | { action: 'update_planned_dates'; payload: { dates: StudyPlanDateEdit[] } }
  | { action: 'record_actual'; payload: { levelId: string; attemptId: string; event: StudyPlanEvent } }
  | { action: 'record_decision'; payload: { decision: StudyPlanDecision } }
  | { action: 'record_dialogue'; payload: { on: string } }
  | { action: 'make_current'; payload: { effectiveOn: string } }
);

export type StudyPlanImpactTarget =
  | { kind: 'class_move'; classId: string }
  | { kind: 'group_add'; groupId: string; startsOn: string; endsOn: string }
  | { kind: 'group_move'; membershipId: string; toGroupId: string }
  | { kind: 'group_end'; membershipId: string };
export type StudyPlanReadRequest = StudyPlanScope & { on: string } & (
  | { view: 'current'; includeTermDateSuggestions?: true }
  | { view: 'history'; revision?: number }
  | { view: 'options' }
  | { view: 'impact'; target: StudyPlanImpactTarget }
);
export type StudyPlanStatusRequest = StudyPlanScope & { commandId: string };
export type StudyPlanReceipt = { commandId: string; action: StudyPlanAction; snapshot: StudyPlanSnapshot };
export type StudyPlanCommandReply = StudyPlanScope & { commandId: string } & (
  | { status: 'saved'; receipt: StudyPlanReceipt }
  | { status: 'conflict'; latestRevision: number; reason: 'revision' | 'source' | 'command' }
  | { status: 'incomplete'; issues: StudyPlanIssue[] }
);
export type StudyPlanStatusReply = StudyPlanStatusRequest & { receipt: StudyPlanReceipt | null };
export type StudyPlanReadBase = StudyPlanScope & { on: string };
export type StudyPlanCalendarYear = { schoolYear: number; htStart: string; htEnd: string; vtStart: string; vtEnd: string };
export type StudyPlanScheduleRow = { revision: number; levelId: string; attemptId: string; firstPassOn: string; scheduledNow: boolean };
export type StudyPlanCurrentReply = StudyPlanReadBase & {
  view: 'current'; current: StudyPlanSnapshot | null; draft: StudyPlanSnapshot | null;
  latestRevision: number; history: StudyPlanRevision[]; canMakeCurrent: boolean;
  sourceToken: string; basisStatus: 'ready' | 'incomplete' | 'unsupported';
  basisIssues: StudyPlanIssue[]; availableLevels: StudyPlanCatalogLevel[];
  calendar?: StudyPlanCalendarYear[];
  dateSuggestions?: StudyPlanDateEdit[];
  schedule?: StudyPlanScheduleRow[];
};
export type StudyPlanHistoryReply = StudyPlanReadBase & { view: 'history'; version: StudyPlanSnapshot | null; history: StudyPlanRevision[] };
type DatedGroup = {
  groupId: string; name: string; revision: number;
  startsOn: string; endsOn: string; course: StudyPlanLevelRef | null;
};
export type StudyPlanImpactOption =
  | { kind: 'class'; classId: string; name: string }
  | ({ kind: 'group'; parallelSetId: string } & DatedGroup)
  | ({ kind: 'membership'; parallelSetId: string; membershipId: string; groupStartsOn: string; groupEndsOn: string } & DatedGroup);
export type StudyPlanOptionsReply = StudyPlanReadBase & {
  view: 'options'; status: 'available' | 'unavailable'; options: StudyPlanImpactOption[];
};
type ImpactSourceGroup = { groupId: string; revision: number; membershipId: string | null; startsOn: string; endsOn: string };
type ImpactParticipation = { groupId: string; name: string; startsOn: string; endsOn: string };
type ImpactLevel = {
  levelId: string | null; ref: StudyPlanLevelRef; label: string;
  change: 'same_level' | 'new_level' | 'missing_group' | 'needs_review';
  before: ImpactParticipation | null; after: ImpactParticipation | null;
};
export type StudyPlanImpact = {
  comparedOn: string; plan: { planId: string; revision: number } | null;
  result: 'same_level' | 'follow_up' | 'review_education' | 'unknown';
  issues: StudyPlanIssue[];
  sourceRemainder?: ImpactParticipation | null;
  sources: {
    classId: string | null; classMembershipId: string | null; offeringId: string;
    targetOfferingId: string | null; groups: ImpactSourceGroup[];
    className?: string | null; targetClassName?: string | null;
    classStartsOn?: string | null; classEndsOn?: string | null;
    pupilVersion?: number; offeringRevision?: number; targetOfferingRevision?: number | null;
  };
  levels: ImpactLevel[];
};
export type StudyPlanImpactReply = StudyPlanReadBase & { view: 'impact'; target: StudyPlanImpactTarget } & (
  | { status: 'unavailable'; impact: null }
  | { status: 'compared'; impact: StudyPlanImpact }
);
export type StudyPlanReadReply = StudyPlanCurrentReply | StudyPlanHistoryReply | StudyPlanOptionsReply | StudyPlanImpactReply;

const scopeFields = ['contractVersion', 'unitId', 'pupilId', 'placementId'] as const;
function scope(r: Record<string, unknown>): StudyPlanScope {
  if (r.contractVersion !== STUDY_PLAN_CONTRACT_VERSION) invalidStudyPlan();
  return { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId: studyPlanUuid(r.unitId), pupilId: studyPlanUuid(r.pupilId), placementId: studyPlanUuid(r.placementId) };
}
function expectScope(r: Record<string, unknown>, expected: StudyPlanScope): StudyPlanScope {
  const parsed = scope(r);
  if (parsed.unitId !== expected.unitId || parsed.pupilId !== expected.pupilId || parsed.placementId !== expected.placementId) invalidStudyPlan();
  return parsed;
}
function sourceToken(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) invalidStudyPlan();
  return value;
}
function period(startsOnRaw: unknown, endsOnRaw: unknown): { startsOn: string; endsOn: string } {
  const startsOn = studyPlanDate(startsOnRaw), endsOn = studyPlanDate(endsOnRaw);
  if (endsOn < startsOn) invalidStudyPlan();
  return { startsOn, endsOn };
}

function parseTarget(value: unknown, on: string): StudyPlanImpactTarget {
  const r = studyPlanFields(value, ['kind'], ['classId', 'groupId', 'membershipId', 'toGroupId', 'startsOn', 'endsOn']);
  switch (r.kind) {
    case 'class_move':
      studyPlanFields(value, ['kind', 'classId']);
      return { kind: r.kind, classId: studyPlanUuid(r.classId) };
    case 'group_add': {
      studyPlanFields(value, ['kind', 'groupId', 'startsOn', 'endsOn']);
      const dates = period(r.startsOn, r.endsOn);
      if (dates.startsOn !== on) invalidStudyPlan();
      return { kind: r.kind, groupId: studyPlanUuid(r.groupId), ...dates };
    }
    case 'group_move':
      studyPlanFields(value, ['kind', 'membershipId', 'toGroupId']);
      return { kind: r.kind, membershipId: studyPlanUuid(r.membershipId), toGroupId: studyPlanUuid(r.toGroupId) };
    case 'group_end':
      studyPlanFields(value, ['kind', 'membershipId']);
      return { kind: r.kind, membershipId: studyPlanUuid(r.membershipId) };
    default: return invalidStudyPlan();
  }
}
export function parseStudyPlanReadRequest(value: unknown): StudyPlanReadRequest {
  const keys = [...scopeFields, 'view', 'on'];
  const r = studyPlanFields(value, keys, ['target', 'revision', 'includeTermDateSuggestions']);
  const view = studyPlanEnum(r.view, ['current', 'history', 'options', 'impact']);
  const base = { ...scope(r), on: studyPlanDate(r.on) };
  if (view === 'impact') {
    studyPlanFields(value, [...keys, 'target']);
    return { ...base, view, target: parseTarget(r.target, base.on) };
  }
  if (view === 'history') {
    studyPlanFields(value, keys, ['revision']);
    return Object.hasOwn(r, 'revision') ? { ...base, view, revision: studyPlanInt(r.revision) } : { ...base, view };
  }
  if (view === 'current' && Object.hasOwn(r, 'includeTermDateSuggestions')) {
    studyPlanFields(value, [...keys, 'includeTermDateSuggestions']);
    if (r.includeTermDateSuggestions !== true) invalidStudyPlan();
    return { ...base, view, includeTermDateSuggestions: true };
  }
  studyPlanFields(value, keys);
  return { ...base, view };
}
export function parseStudyPlanStatusRequest(value: unknown): StudyPlanStatusRequest {
  const r = studyPlanFields(value, [...scopeFields, 'commandId']);
  return { ...scope(r), commandId: studyPlanUuid(r.commandId) };
}

function parseDateEdit(value: unknown): StudyPlanDateEdit {
  const r = studyPlanFields(value, ['levelId', 'attemptId', 'plannedStart', 'plannedEnd']);
  const plannedStart = parsePlannedStudyDate(r.plannedStart), plannedEnd = parsePlannedStudyDate(r.plannedEnd);
  if (!validPlannedStudyPeriod(plannedStart, plannedEnd)) invalidStudyPlan();
  return { levelId: studyPlanUuid(r.levelId), attemptId: studyPlanUuid(r.attemptId), plannedStart, plannedEnd };
}
function parseDateEdits(value: unknown): StudyPlanDateEdit[] {
  return studyPlanUnique(studyPlanList(value, parseDateEdit, 1500), item => item.attemptId);
}
function parseDraft(value: unknown): StudyPlanDraftEdit {
  const r = studyPlanFields(value, ['dates'], ['selections', 'confirmedChoiceIds', 'apprenticeship', 'compulsorySchoolSubjects', 'distanceTeaching']);
  const edit: StudyPlanDraftEdit = { dates: parseDateEdits(r.dates) };
  if (Object.hasOwn(r, 'selections')) edit.selections = studyPlanUnique(studyPlanList(r.selections, value => {
    const selection = studyPlanFields(value, ['choiceId', 'level']);
    return { choiceId: studyPlanCode(selection.choiceId), level: parseStudyPlanLevelRef(selection.level) };
  }), item => studyPlanLevelKey(item.level));
  if (Object.hasOwn(r, 'confirmedChoiceIds')) edit.confirmedChoiceIds = studyPlanUnique(studyPlanList(r.confirmedChoiceIds, studyPlanCode), id => id);
  if (Object.hasOwn(r, 'apprenticeship')) {
    if (typeof r.apprenticeship !== 'boolean') invalidStudyPlan();
    edit.apprenticeship = r.apprenticeship;
  }
  if (Object.hasOwn(r, 'compulsorySchoolSubjects')) edit.compulsorySchoolSubjects = parseStudyPlanCompulsorySubjects(r.compulsorySchoolSubjects);
  if (Object.hasOwn(r, 'distanceTeaching')) edit.distanceTeaching = parseStudyPlanDistanceTeaching(r.distanceTeaching);
  return edit;
}
export function parseStudyPlanCommand(value: unknown): StudyPlanCommand {
  const r = studyPlanFields(value, [...scopeFields, 'commandId', 'expectedRevision', 'expectedSourceToken', 'action', 'payload']);
  const base = {
    ...scope(r), commandId: studyPlanUuid(r.commandId), expectedRevision: studyPlanInt(r.expectedRevision, 0, 2147483645),
    expectedSourceToken: sourceToken(r.expectedSourceToken),
  };
  const action = studyPlanEnum(r.action, STUDY_PLAN_ACTIONS);
  switch (action) {
    case 'prepare_draft': return { ...base, action, payload: parseDraft(r.payload) };
    case 'update_planned_dates': {
      const p = studyPlanFields(r.payload, ['dates']);
      const dates = parseDateEdits(p.dates);
      if (!dates.length) invalidStudyPlan();
      return { ...base, action, payload: { dates } };
    }
    case 'record_actual': {
      const p = studyPlanFields(r.payload, ['levelId', 'attemptId', 'event']);
      const e = studyPlanFields(p.event, ['kind', 'on', 'source']);
      const event = { kind: studyPlanEnum(e.kind, ['started', 'completed', 'interrupted']), on: studyPlanDate(e.on), source: parseStudyFactSource(e.source) };
      return { ...base, action, payload: { levelId: studyPlanUuid(p.levelId), attemptId: studyPlanUuid(p.attemptId), event } };
    }
    case 'record_decision': {
      const p = studyPlanFields(r.payload, ['decision']);
      return { ...base, action, payload: { decision: parseStudyPlanDecision(p.decision) } };
    }
    case 'record_dialogue': {
      const p = studyPlanFields(r.payload, ['on']);
      return { ...base, action, payload: { on: studyPlanDate(p.on) } };
    }
    case 'make_current': {
      const p = studyPlanFields(r.payload, ['effectiveOn']);
      return { ...base, action, payload: { effectiveOn: studyPlanDate(p.effectiveOn) } };
    }
  }
}

function parseReceipt(value: unknown, commandId: string): StudyPlanReceipt {
  const r = studyPlanFields(value, ['commandId', 'action', 'snapshot']);
  if (studyPlanUuid(r.commandId) !== commandId) invalidStudyPlan();
  const action = studyPlanEnum(r.action, STUDY_PLAN_ACTIONS), snapshot = parseStudyPlanSnapshot(r.snapshot);
  const requiresCurrent = action === 'make_current' || action === 'update_planned_dates';
  if (action !== 'record_actual' && requiresCurrent !== (snapshot.state === 'current')) invalidStudyPlan();
  return { commandId, action, snapshot };
}
export function parseStudyPlanCommandReply(value: unknown, request: StudyPlanCommand): StudyPlanCommandReply {
  const keys = [...scopeFields, 'commandId', 'status'];
  const r = studyPlanFields(value, keys, ['receipt', 'latestRevision', 'reason', 'issues']);
  const base = { ...expectScope(r, request), commandId: studyPlanUuid(r.commandId) };
  if (base.commandId !== request.commandId) invalidStudyPlan();
  const status = studyPlanEnum(r.status, ['saved', 'conflict', 'incomplete']);
  if (status === 'saved') {
    studyPlanFields(value, [...keys, 'receipt']);
    const receipt = parseReceipt(r.receipt, request.commandId);
    if (receipt.action !== request.action || receipt.snapshot.revision !== request.expectedRevision + 1) invalidStudyPlan();
    if (request.action === 'make_current' && receipt.snapshot.effectiveOn !== request.payload.effectiveOn) invalidStudyPlan();
    if (request.action === 'update_planned_dates') {
      for (const edit of request.payload.dates) {
        const level = receipt.snapshot.content.levels.find(level => level.id === edit.levelId);
        const attempt = level?.attempts.find(attempt => attempt.id === edit.attemptId);
        if (!attempt || JSON.stringify(attempt.plannedStart) !== JSON.stringify(edit.plannedStart)
          || JSON.stringify(attempt.plannedEnd) !== JSON.stringify(edit.plannedEnd)) invalidStudyPlan();
      }
    }
    return { ...base, status, receipt };
  }
  if (status === 'conflict') {
    studyPlanFields(value, [...keys, 'latestRevision', 'reason']);
    return { ...base, status, latestRevision: studyPlanInt(r.latestRevision, 0), reason: studyPlanEnum(r.reason, ['revision', 'source', 'command']) };
  }
  studyPlanFields(value, [...keys, 'issues']);
  const issues = studyPlanList(r.issues, parseStudyPlanIssue);
  if (!issues.length) invalidStudyPlan();
  return { ...base, status, issues };
}
export function parseStudyPlanStatusReply(value: unknown, request: StudyPlanStatusRequest): StudyPlanStatusReply {
  const r = studyPlanFields(value, [...scopeFields, 'commandId', 'receipt']);
  if (studyPlanUuid(r.commandId) !== request.commandId) invalidStudyPlan();
  return { ...expectScope(r, request), commandId: request.commandId, receipt: studyPlanNullable(r.receipt, item => parseReceipt(item, request.commandId)) };
}

function parseHistory(value: unknown): StudyPlanRevision[] {
  const history = studyPlanUnique(studyPlanList(value, parseStudyPlanRevision, 5000), item => String(item.revision));
  if (history.some(item => item.planId !== history[0].planId)) invalidStudyPlan();
  return history;
}
function matchesVersion(snapshot: StudyPlanSnapshot | null, revision: StudyPlanRevision | null): boolean {
  if (!snapshot || !revision) return snapshot === revision;
  return snapshot.planId === revision.planId && snapshot.revision === revision.revision && snapshot.state === revision.state
    && snapshot.effectiveOn === revision.effectiveOn && snapshot.recordedAt === revision.recordedAt;
}
function parseCalendarYear(value: unknown): StudyPlanCalendarYear {
  const r = studyPlanFields(value, ['schoolYear', 'htStart', 'htEnd', 'vtStart', 'vtEnd']);
  const schoolYear = studyPlanInt(r.schoolYear, 1900, 9998);
  const ht = period(r.htStart, r.htEnd), vt = period(r.vtStart, r.vtEnd);
  if (ht.endsOn >= vt.startsOn || ht.startsOn < `${schoolYear}-07-01` || vt.endsOn > `${schoolYear + 1}-06-30`) invalidStudyPlan();
  return { schoolYear, htStart: ht.startsOn, htEnd: ht.endsOn, vtStart: vt.startsOn, vtEnd: vt.endsOn };
}
function parseCatalogLevel(value: unknown): StudyPlanCatalogLevel {
  const { label, points, choiceIds, ...rest } = studyPlanFields(value, ['subjectCode', 'subjectVersion', 'itemCode', 'languageCode', 'label', 'points'], ['choiceIds']);
  return {
    ...parseStudyPlanLevelRef(rest), label: studyPlanLabel(label), points: studyPlanInt(points, 1, 10000),
    ...(Object.hasOwn(value as object, 'choiceIds') ? { choiceIds: studyPlanUnique(studyPlanList(choiceIds, studyPlanCode, 20), id => id) } : {}),
  };
}
function parseOption(value: unknown): StudyPlanImpactOption {
  const groupKeys = ['kind', 'groupId', 'name', 'revision', 'startsOn', 'endsOn', 'course', 'parallelSetId'];
  const membershipKeys = ['membershipId', 'groupStartsOn', 'groupEndsOn'];
  const r = studyPlanFields(value, ['kind', 'name'], ['classId', ...groupKeys.filter(key => key !== 'kind' && key !== 'name'), ...membershipKeys]);
  const kind = studyPlanEnum(r.kind, ['class', 'group', 'membership']), name = studyPlanLabel(r.name);
  if (kind === 'class') {
    studyPlanFields(value, ['kind', 'classId', 'name']);
    return { kind, classId: studyPlanUuid(r.classId), name };
  }
  const group = {
    groupId: studyPlanUuid(r.groupId), name, revision: studyPlanInt(r.revision), ...period(r.startsOn, r.endsOn),
    course: studyPlanNullable(r.course, parseStudyPlanLevelRef), parallelSetId: studyPlanUuid(r.parallelSetId),
  };
  if (kind === 'group') {
    studyPlanFields(value, groupKeys);
    return { kind, ...group };
  }
  studyPlanFields(value, [...groupKeys, ...membershipKeys]);
  const dates = period(r.groupStartsOn, r.groupEndsOn);
  if (group.startsOn < dates.startsOn || group.endsOn > dates.endsOn) invalidStudyPlan();
  return { kind, ...group, membershipId: studyPlanUuid(r.membershipId), groupStartsOn: dates.startsOn, groupEndsOn: dates.endsOn };
}
function parseParticipation(value: unknown): ImpactParticipation {
  const r = studyPlanFields(value, ['groupId', 'name', 'startsOn', 'endsOn']);
  return { groupId: studyPlanUuid(r.groupId), name: studyPlanLabel(r.name), ...period(r.startsOn, r.endsOn) };
}
function parseImpactLevel(value: unknown): ImpactLevel {
  const r = studyPlanFields(value, ['levelId', 'ref', 'label', 'change', 'before', 'after']);
  return { levelId: studyPlanNullable(r.levelId, studyPlanUuid), ref: parseStudyPlanLevelRef(r.ref), label: studyPlanLabel(r.label),
    change: studyPlanEnum(r.change, ['same_level', 'new_level', 'missing_group', 'needs_review']),
    before: studyPlanNullable(r.before, parseParticipation), after: studyPlanNullable(r.after, parseParticipation) };
}
function parseImpact(value: unknown, on: string, target: StudyPlanImpactTarget): StudyPlanImpact {
  const r = studyPlanFields(value, ['comparedOn', 'plan', 'result', 'issues', 'sources', 'levels'], ['sourceRemainder']);
  const comparedOn = studyPlanDate(r.comparedOn);
  if (target.kind === 'group_move' ? comparedOn < on : comparedOn !== on) invalidStudyPlan();
  const plan = studyPlanNullable(r.plan, value => {
    const p = studyPlanFields(value, ['planId', 'revision']);
    return { planId: studyPlanUuid(p.planId), revision: studyPlanInt(p.revision) };
  });
  const s = studyPlanFields(r.sources, ['classId', 'classMembershipId', 'offeringId', 'targetOfferingId', 'groups'],
    ['className', 'targetClassName', 'classStartsOn', 'classEndsOn', 'pupilVersion', 'offeringRevision', 'targetOfferingRevision']);
  const groups = studyPlanList(s.groups, value => {
    const g = studyPlanFields(value, ['groupId', 'revision', 'membershipId', 'startsOn', 'endsOn']);
    return { groupId: studyPlanUuid(g.groupId), revision: studyPlanInt(g.revision), membershipId: studyPlanNullable(g.membershipId, studyPlanUuid), ...period(g.startsOn, g.endsOn) };
  });
  const sourceMembership = target.kind === 'group_end' || target.kind === 'group_move'
    ? groups.find(item => item.membershipId === target.membershipId) : undefined;
  if (comparedOn !== on && sourceMembership?.startsOn !== comparedOn) invalidStudyPlan();
  const remainder = Object.hasOwn(r, 'sourceRemainder') ? studyPlanNullable(r.sourceRemainder, parseParticipation) : undefined;
  if (remainder !== undefined && (target.kind !== 'group_move' || !sourceMembership ||
    (remainder === null ? comparedOn !== sourceMembership.startsOn
      : remainder.groupId !== sourceMembership.groupId || remainder.startsOn !== sourceMembership.startsOn
        || Date.parse(comparedOn + 'T00:00:00Z') - Date.parse(remainder.endsOn + 'T00:00:00Z') !== 86400000))) invalidStudyPlan();
  const classStartsOn = Object.hasOwn(s, 'classStartsOn') ? studyPlanNullable(s.classStartsOn, studyPlanDate) : undefined;
  const classEndsOn = Object.hasOwn(s, 'classEndsOn') ? studyPlanNullable(s.classEndsOn, studyPlanDate) : undefined;
  if (classStartsOn && classEndsOn && classStartsOn > classEndsOn) invalidStudyPlan();
  return {
    comparedOn, plan, result: studyPlanEnum(r.result, ['same_level', 'follow_up', 'review_education', 'unknown']),
    issues: studyPlanList(r.issues, parseStudyPlanIssue),
    ...(remainder !== undefined ? { sourceRemainder: remainder } : {}),
    sources: { classId: studyPlanNullable(s.classId, studyPlanUuid), classMembershipId: studyPlanNullable(s.classMembershipId, studyPlanUuid),
      offeringId: studyPlanUuid(s.offeringId), targetOfferingId: studyPlanNullable(s.targetOfferingId, studyPlanUuid), groups,
      ...(Object.hasOwn(s, 'className') ? { className: studyPlanNullable(s.className, studyPlanLabel) } : {}),
      ...(Object.hasOwn(s, 'targetClassName') ? { targetClassName: studyPlanNullable(s.targetClassName, studyPlanLabel) } : {}),
      ...(classStartsOn !== undefined ? { classStartsOn } : {}),
      ...(classEndsOn !== undefined ? { classEndsOn } : {}),
      ...(Object.hasOwn(s, 'pupilVersion') ? { pupilVersion: studyPlanInt(s.pupilVersion) } : {}),
      ...(Object.hasOwn(s, 'offeringRevision') ? { offeringRevision: studyPlanInt(s.offeringRevision, 0) } : {}),
      ...(Object.hasOwn(s, 'targetOfferingRevision') ? { targetOfferingRevision: studyPlanNullable(s.targetOfferingRevision, x => studyPlanInt(x, 0)) } : {}) },
    levels: studyPlanList(r.levels, parseImpactLevel),
  };
}

export function parseStudyPlanReadReply(value: unknown, request: StudyPlanReadRequest): StudyPlanReadReply {
  const keys = [...scopeFields, 'on', 'view'];
  const r = studyPlanFields(value, keys, ['current', 'draft', 'latestRevision', 'history', 'version', 'canMakeCurrent',
    'sourceToken', 'basisStatus', 'basisIssues', 'availableLevels', 'calendar', 'dateSuggestions', 'schedule', 'status', 'options', 'target', 'impact']);
  const base = { ...expectScope(r, request), on: studyPlanDate(r.on) };
  if (base.on !== request.on || r.view !== request.view) invalidStudyPlan();
  switch (request.view) {
    case 'current': {
      studyPlanFields(value, [...keys, 'current', 'draft', 'latestRevision', 'history', 'canMakeCurrent', 'sourceToken', 'basisStatus', 'basisIssues', 'availableLevels'], ['calendar', 'dateSuggestions', 'schedule']);
      const latestRevision = studyPlanInt(r.latestRevision, 0), history = parseHistory(r.history);
      const current = studyPlanNullable(r.current, parseStudyPlanSnapshot), draft = studyPlanNullable(r.draft, parseStudyPlanSnapshot);
      const latest = history.find(item => item.revision === latestRevision);
      if (!matchesVersion(current, studyPlanAt(history, base.on))
        || !matchesVersion(draft, latest?.state === 'draft' ? latest : null)
        || latestRevision !== history.reduce((max, item) => Math.max(max, item.revision), 0)
        || typeof r.canMakeCurrent !== 'boolean') invalidStudyPlan();
      const calendar = Object.hasOwn(r, 'calendar') ? { calendar: studyPlanUnique(studyPlanList(r.calendar, parseCalendarYear, 30), item => String(item.schoolYear)) } : {};
      const dateSuggestions = Object.hasOwn(r, 'dateSuggestions') ? parseDateEdits(r.dateSuggestions) : undefined;
      const snapshot = draft ?? current;
      if (dateSuggestions?.some(edit => {
        const level = snapshot?.content.levels.find(level => level.id === edit.levelId);
        const attempt = level?.attempts.find(attempt => attempt.id === edit.attemptId);
        const empty = attempt?.plannedStart === null && attempt.plannedEnd === null;
        const terms = request.includeTermDateSuggestions === true
          && attempt?.plannedStart?.kind === 'term' && attempt.plannedEnd?.kind === 'term';
        return snapshot?.revision !== latestRevision || (!empty && !terms)
          || edit.plannedStart?.kind !== 'day' || edit.plannedEnd?.kind !== 'day';
      })) invalidStudyPlan();
      const schedule = Object.hasOwn(r, 'schedule') ? studyPlanUnique(studyPlanList(r.schedule, value => {
        const row = studyPlanFields(value, ['revision', 'levelId', 'attemptId', 'firstPassOn', 'scheduledNow']);
        const revision = studyPlanInt(row.revision), levelId = studyPlanUuid(row.levelId), attemptId = studyPlanUuid(row.attemptId);
        const firstPassOn = studyPlanDate(row.firstPassOn);
        const level = [current, draft].find(item => item?.revision === revision)?.content.levels.find(item => item.id === levelId);
        if (level?.kind !== 'gy25_level' || level.attempts.length !== 1 || level.attempts[0]?.id !== attemptId
          || typeof row.scheduledNow !== 'boolean' || (row.scheduledNow && firstPassOn > base.on)) invalidStudyPlan();
        return { revision, levelId, attemptId, firstPassOn, scheduledNow: row.scheduledNow };
      }, 1000), row => row.revision + '/' + row.attemptId) : undefined;
      return { ...base, view: request.view, current, draft, latestRevision, history, canMakeCurrent: r.canMakeCurrent, sourceToken: sourceToken(r.sourceToken),
        basisStatus: studyPlanEnum(r.basisStatus, ['ready', 'incomplete', 'unsupported']), basisIssues: studyPlanList(r.basisIssues, parseStudyPlanIssue),
        availableLevels: studyPlanUnique(studyPlanList(r.availableLevels, parseCatalogLevel, 3000), studyPlanLevelKey), ...calendar,
        ...(dateSuggestions !== undefined ? { dateSuggestions } : {}), ...(schedule !== undefined ? { schedule } : {}) };
    }
    case 'history': {
      studyPlanFields(value, [...keys, 'version', 'history']);
      const version = studyPlanNullable(r.version, parseStudyPlanSnapshot), history = parseHistory(r.history);
      const expected = request.revision === undefined ? studyPlanAt(history, base.on) : history.find(item => item.revision === request.revision) ?? null;
      if (!matchesVersion(version, expected)) invalidStudyPlan();
      return { ...base, view: request.view, version, history };
    }
    case 'options': {
      studyPlanFields(value, [...keys, 'status', 'options']);
      const status = studyPlanEnum(r.status, ['available', 'unavailable']), options = studyPlanList(r.options, parseOption, 5000);
      if (status === 'unavailable' && options.length) invalidStudyPlan();
      return { ...base, view: request.view, status, options };
    }
    case 'impact': {
      studyPlanFields(value, [...keys, 'target', 'status', 'impact']);
      const target = parseTarget(r.target, base.on);
      if (JSON.stringify(target) !== JSON.stringify(request.target)) invalidStudyPlan();
      const status = studyPlanEnum(r.status, ['unavailable', 'compared']);
      if (status === 'unavailable') {
        if (r.impact !== null) invalidStudyPlan();
        return { ...base, view: request.view, target, status, impact: null };
      }
      return { ...base, view: request.view, target, status, impact: parseImpact(r.impact, base.on, target) };
    }
  }
}
