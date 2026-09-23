import { todayInStockholm, type AccessFunction } from './access-rules.ts';

export type MandateFunction =
  | AccessFunction
  | 'elevhalsa'
  | 'elevhalsoansvarig'
  | 'it'
  | 'support';
export type MandateScope = 'school' | 'group' | 'pupil' | 'case';
type Relation = { id: string; unitId: string };
export type MandateAssignment = {
  id: string;
  identityId: string;
  customerId: string;
  organizerId: string;
  function: MandateFunction;
  profileId: string;
  membershipActive: boolean;
  unitIds: string[];
  scopeKind: MandateScope;
  groups: (Relation & { kind: 'teaching' | 'mentor' })[];
  pupils: Relation[];
  cases: (Relation & { pupilId: string })[];
  validFrom: string;
  validTo: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  parentAssignmentId: string | null;
  approvedByAssignmentId?: string | null;
  purposeCode?: string | null;
};
export type MandateRequest = {
  action: string;
  customerId: string;
  organizerId: string;
  fields: string[];
  resource: {
    unitId: string;
    pupilId?: string;
    groupIds?: string[];
    caseId?: string | null;
  } | null;
  target?: MandateAssignment;
};
export type MandateReason =
  | 'allowed'
  | 'profile_unconfigured'
  | 'no_assignment'
  | 'invalid_time'
  | 'invalid_assignment'
  | 'invalid_chain'
  | 'foreign_context'
  | 'action_denied'
  | 'scope_denied'
  | 'fields_denied'
  | 'delegation_denied';
export type MandateDecision = {
  allowed: boolean;
  reasonCode: MandateReason;
  assignmentId: string | null;
  allowedFields: string[];
};
const BASE_FIELDS = ['id', 'display_name', 'unit_id', 'group_ids'];
const DELEGATES: Partial<Record<MandateFunction, MandateFunction[]>> = {
  huvudman: ['rektor'],
  rektor: ['larare', 'administrator', 'elevhalsa', 'support'],
  elevhalsoansvarig: ['elevhalsa'],
  kundadmin: ['kundadmin', 'granskare'],
};
const ACTIONS: Record<MandateFunction, string[]> = {
  huvudman: ['organization.read'],
  rektor: ['pupil.read'],
  administrator: ['pupil.read', 'pupil.export'],
  larare: ['pupil.read'],
  elevhalsa: ['pupil.read'],
  elevhalsoansvarig: [],
  it: [
    'connection.read',
    'connection.enable',
    'connection.pause',
    'connection.test',
  ],
  support: ['pupil.read'],
  kundadmin: [],
  granskare: ['audit.read'],
};

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function timestamp(value: string | null, fallback: number): number {
  // Explicit offset required: local process timezone must never decide access.
  return value === null
    ? fallback
    : /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? Date.parse(value)
      : NaN;
}
function shape(a: MandateAssignment): boolean {
  if (
    !a.id ||
    !a.identityId ||
    !a.customerId ||
    !a.organizerId ||
    a.profileId !== 'synthetic-v1' ||
    !Object.hasOwn(ACTIONS, a.function) ||
    !['school', 'group', 'pupil', 'case'].includes(a.scopeKind) ||
    !validDate(a.validFrom) ||
    (a.validTo !== null && (!validDate(a.validTo) || a.validTo < a.validFrom))
  )
    return false;
  const start = timestamp(a.startsAt, -Infinity);
  const end = timestamp(a.endsAt, Infinity);
  if (!(start < end)) return false;
  const relations = [...a.groups, ...a.pupils, ...a.cases];
  if (
    relations.some((r) => !r.id || !a.unitIds.includes(r.unitId)) ||
    a.unitIds.some((id) => !id)
  )
    return false;
  if (a.function === 'larare')
    return (
      a.scopeKind === 'group' &&
      a.groups.length > 0 &&
      a.groups.every((r) => ['teaching', 'mentor'].includes(r.kind))
    );
  if (a.function === 'elevhalsa')
    return a.scopeKind === 'school'
      ? a.unitIds.length > 0
      : a.scopeKind === 'pupil'
        ? a.pupils.length > 0
        : a.scopeKind === 'case' &&
          a.cases.length > 0 &&
          a.cases.every((r) => !!r.pupilId);
  if (a.function === 'support')
    return (
      a.scopeKind === 'pupil' &&
      a.unitIds.length === 1 &&
      a.pupils.length === 1 &&
      a.startsAt !== null &&
      a.endsAt !== null &&
      end - start <= 60 * 60 * 1000 &&
      a.purposeCode === 'synthetic-troubleshooting' &&
      !!a.parentAssignmentId &&
      a.approvedByAssignmentId === a.parentAssignmentId
    );
  return a.scopeKind === 'school';
}
function current(a: MandateAssignment, now: number, today: string): boolean {
  return (
    shape(a) &&
    a.membershipActive &&
    a.endedAt === null &&
    a.validFrom <= today &&
    (a.validTo === null || today <= a.validTo) &&
    timestamp(a.startsAt, -Infinity) <= now &&
    now < timestamp(a.endsAt, Infinity)
  );
}
function delegable(
  parent: MandateAssignment,
  child: MandateAssignment,
): boolean {
  return (
    shape(child) &&
    child.membershipActive &&
    child.endedAt === null &&
    parent.identityId !== child.identityId &&
    child.parentAssignmentId === parent.id &&
    child.customerId === parent.customerId &&
    child.organizerId === parent.organizerId &&
    (DELEGATES[parent.function]?.includes(child.function) ?? false) &&
    // Account administration may have no school scope; business mandates never may.
    (['kundadmin', 'granskare'].includes(child.function) ||
      child.unitIds.length > 0) &&
    child.unitIds.every((id) => parent.unitIds.includes(id)) &&
    child.validFrom >= parent.validFrom &&
    (parent.validTo === null ||
      (child.validTo !== null && child.validTo <= parent.validTo)) &&
    timestamp(child.startsAt, -Infinity) >=
      timestamp(parent.startsAt, -Infinity) &&
    timestamp(child.endsAt, Infinity) <= timestamp(parent.endsAt, Infinity) &&
    (child.function !== 'support' || parent.function === 'rektor')
  );
}
function inScope(
  a: MandateAssignment,
  resource: MandateRequest['resource'],
): boolean {
  if (!resource || !a.unitIds.includes(resource.unitId)) return false;
  if (a.scopeKind === 'school') return true;
  if (!resource.pupilId) return false;
  if (a.scopeKind === 'group')
    return a.groups.some(
      (g) => g.unitId === resource.unitId && resource.groupIds?.includes(g.id),
    );
  if (a.scopeKind === 'pupil')
    return a.pupils.some(
      (p) => p.unitId === resource.unitId && p.id === resource.pupilId,
    );
  return a.cases.some(
    (c) =>
      c.unitId === resource.unitId &&
      c.id === resource.caseId &&
      c.pupilId === resource.pupilId,
  );
}

/** Pure internal policy. Server loads every assignment/relation and the clock in its transaction. */
export function decideMandate(input: {
  assignment: MandateAssignment | null;
  ancestors: MandateAssignment[];
  profileId: string | null;
  verifiedLocalTarget: boolean;
  serverNow: string;
  request: MandateRequest;
}): MandateDecision {
  const a = input.assignment;
  const result = (
    reasonCode: MandateReason,
    allowedFields: string[] = [],
  ): MandateDecision => ({
    allowed: reasonCode === 'allowed',
    reasonCode,
    assignmentId: a?.id ?? null,
    allowedFields,
  });
  if (input.profileId !== 'synthetic-v1' || input.verifiedLocalTarget !== true)
    return result('profile_unconfigured');
  if (!a) return result('no_assignment');
  const now = timestamp(input.serverNow, NaN);
  if (!Number.isFinite(now)) return result('invalid_time');
  const today = todayInStockholm(new Date(now));
  if (!current(a, now, today)) return result('invalid_assignment');
  const visited = new Set([a.id]);
  let node = a;
  while (node.parentAssignmentId !== null) {
    const matches = input.ancestors.filter(
      (p) => p.id === node.parentAssignmentId,
    );
    const parent = matches[0];
    if (
      matches.length !== 1 ||
      !parent ||
      visited.has(parent.id) ||
      !current(parent, now, today) ||
      !delegable(parent, node)
    )
      return result('invalid_chain');
    visited.add(parent.id);
    node = parent;
  }
  const r = input.request;
  if (r.customerId !== a.customerId || r.organizerId !== a.organizerId)
    return result('foreign_context');
  if (r.action === 'mandate.grant' || r.action === 'mandate.revoke') {
    if (r.fields.length !== 0) return result('fields_denied');
    return result(
      r.target && delegable(a, r.target) ? 'allowed' : 'delegation_denied',
    );
  }
  if (!ACTIONS[a.function].includes(r.action)) return result('action_denied');
  if (r.action !== 'audit.read' && !inScope(a, r.resource))
    return result('scope_denied');
  if (r.action.startsWith('pupil.') && !r.resource?.pupilId)
    return result('scope_denied');
  const fields = r.action.startsWith('pupil.')
    ? BASE_FIELDS
    : r.action.startsWith('connection.')
      ? ['enabled', 'version']
      : r.action === 'organization.read'
        ? ['id', 'display_name']
        : ['event_id', 'action', 'occurred_at', 'outcome', 'assignment_id'];
  if (r.fields.length === 0 || r.fields.some((f) => !fields.includes(f)))
    return result('fields_denied');
  return result('allowed', [...new Set(r.fields)]);
}
