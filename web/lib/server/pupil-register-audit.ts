import { parseConflictDetails, type ConflictDetails } from '../pupil-register-model.ts';
import { AuditUnavailable } from './authz.ts';
import { PUPIL_REGISTER_ACTIONS, sanitizeAuditDetails, type PupilRegisterAction, type PupilRegisterField } from './audit-details.ts';
import type { Tx } from './db.ts';
import { logEvent, type EventInput } from './events.ts';

/** SQL alone supplies these references after current mandate/projection checks.
 * Never derive them from the request or from counts of filtered-out pupils. */
export type PupilAuditRef =
  | { kind: 'protected'; pupilId: string }
  | { kind: 'personal-number'; pupilId: string }
  | { kind: 'personal-number-export'; pupilId: string };
export type PupilAuditedResult<T> =
  | { kind: 'success'; body: T; auditRefs: PupilAuditRef[] }
  | { kind: 'conflict'; details: ConflictDetails; auditRefs: PupilAuditRef[] };
type ExtraAction = 'pupil_protected_read' | 'pupil_personal_number_exported' | 'pupil_conflict_read';
export type PupilAuditOperation = {
  action: Exclude<PupilRegisterAction, ExtraAction>;
  pupilId?: string;
  schoolYear: number;
  count?: number;
  fields?: PupilRegisterField[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MUTATIONS = new Set<PupilRegisterAction>([
  'pupil_created', 'pupil_updated', 'pupil_municipality_changed', 'pupil_transferred',
  'pupil_education_changed', 'pupil_placement_ended', 'pupil_class_changed', 'pupil_source_resolved',
]);
const EXTRA_ACTIONS = new Set<PupilRegisterAction>(['pupil_protected_read', 'pupil_personal_number_exported', 'pupil_conflict_read']);
const REF_ACTION: Record<PupilAuditRef['kind'], PupilRegisterAction> = {
  protected: 'pupil_protected_read',
  'personal-number': 'pupil_personal_number_read',
  'personal-number-export': 'pupil_personal_number_exported',
};

/** Defense in depth for JSON payloads; internal auditRefs never reach a client. */
function publicBody<T>(value: T): T {
  if (Array.isArray(value)) return value.map(publicBody) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'auditRefs')
      .map(([key, entry]) => [key, publicBody(entry)])) as T;
  }
  return value;
}

/** Call inside protectedRoute's transaction. This returns its main event for
 * protectedRoute to log with outcome=ok; it never commits or constructs a response.
 * A typed conflict is returned (not thrown), so its denied write and allowed read
 * can commit together. AuditUnavailable must propagate to protectedRoute. */
export async function auditPupilRegisterResult<T>(
  tx: Tx,
  ctx: Parameters<typeof logEvent>[1],
  result: PupilAuditedResult<T>,
  operation: PupilAuditOperation,
): Promise<{ body: T | { code: 'conflict'; details: ConflictDetails }; status?: number; event: EventInput }> {
  try {
    const { action, pupilId, schoolYear, count, fields } = operation;
    if (!PUPIL_REGISTER_ACTIONS.includes(action) || EXTRA_ACTIONS.has(action)
      || (pupilId !== undefined && (typeof pupilId !== 'string' || !UUID.test(pupilId)))) throw new AuditUnavailable();
    const metadata = { schoolYear, ...(count === undefined ? {} : { count }), ...(fields === undefined ? {} : { fields }) };
    const details = sanitizeAuditDetails(metadata);
    // Sanitization must never silently erase required register metadata.
    if (Object.keys(metadata).length !== Object.keys(details).length) throw new AuditUnavailable();
    if (!Array.isArray(result.auditRefs)) throw new AuditUnavailable();
    const refs = new Map<string, PupilAuditRef>();
    for (const ref of result.auditRefs) {
      if (!ref || Object.keys(ref).length !== 2 || !Object.hasOwn(REF_ACTION, ref.kind)
        || typeof ref.pupilId !== 'string' || !UUID.test(ref.pupilId)) throw new AuditUnavailable();
      if ((ref.kind === 'personal-number' && action !== 'pupil_personal_number_read')
        || (ref.kind === 'personal-number-export' && action !== 'pupil_exported')) throw new AuditUnavailable();
      refs.set(`${ref.kind}:${ref.pupilId.toLowerCase()}`, ref);
    }
    if (action === 'pupil_personal_number_read' && (!pupilId
      || ![...refs.values()].some(ref => ref.kind === 'personal-number' && ref.pupilId.toLowerCase() === pupilId.toLowerCase()))) throw new AuditUnavailable();
    let conflict: ConflictDetails | null = null;
    if (result.kind === 'conflict') {
      conflict = parseConflictDetails(result.details);
      if (!conflict || !MUTATIONS.has(action) || !pupilId
        || [...refs.values()].some(ref => ref.kind !== 'protected')) throw new AuditUnavailable();
      await logEvent(tx, ctx, { action, objectType: 'pupil', objectId: pupilId, outcome: 'denied', details: { ...details, code: 'conflict' } });
    } else if (result.kind !== 'success') throw new AuditUnavailable();
    for (const ref of refs.values()) {
      await logEvent(tx, ctx, { action: REF_ACTION[ref.kind], objectType: 'pupil', objectId: ref.pupilId, outcome: 'ok', details: { schoolYear } });
    }
    const event: EventInput = {
      action: conflict ? 'pupil_conflict_read' : action,
      objectType: pupilId ? 'pupil' : 'pupil_register',
      objectId: pupilId ?? null,
      details,
    };
    if (conflict) return { body: { code: 'conflict', details: conflict }, status: 409, event };
    if (result.kind !== 'success') throw new AuditUnavailable();
    return { body: publicBody(result.body), event };
  } catch {
    // No raw database details, partial public body, or fallback event escape.
    throw new AuditUnavailable();
  }
}
