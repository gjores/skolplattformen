import {
  decideMandate,
  type MandateAssignment,
  type MandateRequest,
  type MandateDecision,
} from '../mandate-policy.ts';
import type { Tx } from './db.ts';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FUNCTIONS = ['rektor', 'larare', 'administrator', 'elevhalsa', 'support'];
const KEYS = [
  'membershipId',
  'function',
  'unitIds',
  'scopeKind',
  'groups',
  'pupilIds',
  'caseIds',
  'validFrom',
  'validTo',
  'startsAt',
  'endsAt',
  'profession',
  'purposeCode',
  'staffAssignmentId',
];
export type MandatePayload = {
  membershipId: string;
  function: string;
  unitIds: string[];
  scopeKind: string;
  groups: { id: string; kind: 'teaching' | 'mentor' }[];
  pupilIds: string[];
  caseIds: string[];
  validFrom: string;
  validTo: string | null;
  startsAt: string | null;
  endsAt: string | null;
  profession: string | null;
  purposeCode: string | null;
  staffAssignmentId: string | null;
};
function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((v) => typeof v !== 'string' || !UUID.test(v)) ||
    new Set(value).size !== value.length
  )
    throw new TypeError('Invalid scope');
  return [...value];
}
export function parseMandatePayload(input: unknown): MandatePayload {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Invalid mandate');
  const p = input as Record<string, unknown>;
  if (
    Object.keys(p).some((key) => !KEYS.includes(key)) ||
    typeof p.membershipId !== 'string' ||
    !UUID.test(p.membershipId) ||
    typeof p.function !== 'string' ||
    !FUNCTIONS.includes(p.function) ||
    typeof p.scopeKind !== 'string' ||
    !['school', 'group', 'pupil', 'case'].includes(p.scopeKind)
  )
    throw new TypeError('Invalid mandate');
  if (
    typeof p.validFrom !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.validFrom)
  )
    throw new TypeError('Invalid date');
  for (const key of [
    'validTo',
    'startsAt',
    'endsAt',
    'profession',
    'purposeCode',
    'staffAssignmentId',
  ])
    if (p[key] != null && typeof p[key] !== 'string')
      throw new TypeError('Invalid field');
  if (
    p.staffAssignmentId &&
    (typeof p.staffAssignmentId !== 'string' || !UUID.test(p.staffAssignmentId))
  )
    throw new TypeError('Invalid staff');
  const groups = p.groups ?? [];
  if (
    !Array.isArray(groups) ||
    groups.length > 200 ||
    groups.some(
      (g) =>
        !g ||
        typeof g !== 'object' ||
        Object.keys(g).some((k) => !['id', 'kind'].includes(k)) ||
        typeof g.id !== 'string' ||
        !UUID.test(g.id) ||
        !['teaching', 'mentor'].includes(g.kind),
    ) ||
    new Set(groups.map((g) => g.id)).size !== groups.length
  )
    throw new TypeError('Invalid groups');
  return {
    membershipId: p.membershipId,
    function: p.function,
    unitIds: ids(p.unitIds),
    scopeKind: p.scopeKind as string,
    groups: groups.map((g) => ({ id: g.id, kind: g.kind })),
    pupilIds: ids(p.pupilIds ?? []),
    caseIds: ids(p.caseIds ?? []),
    validFrom: p.validFrom,
    validTo: (p.validTo as string) ?? null,
    startsAt: (p.startsAt as string) ?? null,
    endsAt: (p.endsAt as string) ?? null,
    profession: (p.profession as string) ?? null,
    purposeCode: (p.purposeCode as string) ?? null,
    staffAssignmentId: (p.staffAssignmentId as string) ?? null,
  };
}

/** Only trusted server configuration may select the isolated synthetic profile. */
export function isLocalMandateTarget(
  databaseUrl: string,
  apiUrl: string,
): boolean {
  try {
    const db = new URL(databaseUrl),
      api = new URL(apiUrl);
    const local = (host: string) =>
      ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(host);
    return (
      ['postgres:', 'postgresql:'].includes(db.protocol) &&
      local(db.hostname) &&
      db.port === '56322' &&
      api.protocol === 'http:' &&
      local(api.hostname) &&
      api.port === '56321'
    );
  } catch {
    return false;
  }
}
export type MandateContext = {
  assignment: MandateAssignment | null;
  ancestors: MandateAssignment[];
  serverNow: string;
};
export async function currentMandateDecision(
  tx: Tx,
  request: MandateRequest,
  verifiedLocalTarget: boolean,
): Promise<MandateDecision> {
  const rows = await tx<
    { context: MandateContext }[]
  >`select public.phase3_mandate_context() as context`;
  const context = rows[0]?.context;
  if (!context)
    return {
      allowed: false,
      reasonCode: 'no_assignment',
      assignmentId: null,
      allowedFields: [],
    };
  return decideMandate({
    ...context,
    request,
    profileId: 'synthetic-v1',
    verifiedLocalTarget,
  });
}

export function mandateSqlFailure(
  error: unknown,
): {
  code: 'forbidden' | 'not_found' | 'conflict' | 'bad_request';
  status: 403 | 404 | 409 | 400;
} | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  if (code === '42501') return { code: 'forbidden', status: 403 };
  if (code === 'P0002') return { code: 'not_found', status: 404 };
  if (code === '23505' || code === '40001')
    return { code: 'conflict', status: 409 };
  if (
    typeof code === 'string' &&
    (code.startsWith('22') || code === '23514' || code === '23502')
  )
    return { code: 'bad_request', status: 400 };
  if (code === '23503') return { code: 'not_found', status: 404 };
  return null;
}
