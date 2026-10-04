/** Closed value schemas: an allowed key never permits arbitrary free text. */
export type AuditJson = null | boolean | number | string | AuditJson[] | { [key: string]: AuditJson | undefined };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FUNCTIONS = new Set(['kundadmin','granskare','huvudman','rektor','administrator','larare','elevhalsa','elevhalsoansvarig','it','support']);
const CODES = new Set(['no_session','session_expired','session_revoked','no_context','membership_blocked','customer_closed','mfa_required','forbidden','assignment_expired','assignment_ended','assignment_upcoming','invitation_invalid','conflict','context_changed','registry_unavailable','db_unreachable','csrf','idp_registration_failed','login_state_invalid','not_found','bad_request','internal_error','audit_unavailable','programplan_locked','programplan_in_use','programplan_start_passed']);
const ROUTES = new Set(['/api/auth','/api/context','/api/session','/api/inbjudan','/api/kund','/api/logg','/api/prov','/api/elever','/api/timplaner','/api/programplaner','/api/other']);
// Event names and field names describe operations, never the values involved.
export const PUPIL_REGISTER_ACTIONS = [
  'pupil_list_read', 'pupil_read', 'pupil_history_read', 'pupil_conflict_read',
  'pupil_created', 'pupil_updated', 'pupil_municipality_changed', 'pupil_transferred',
  'pupil_education_changed', 'pupil_placement_ended', 'pupil_class_changed',
  'pupil_source_resolved', 'pupil_protected_read', 'pupil_personal_number_read',
  'pupil_export_preview', 'pupil_exported', 'pupil_personal_number_exported',
] as const;
export type PupilRegisterAction = (typeof PUPIL_REGISTER_ACTIONS)[number];
export const PUPIL_REGISTER_FIELDS = [
  'id', 'displayName', 'birthDate', 'personalNumber', 'protectedIdentity',
  'municipality', 'placement', 'education', 'class', 'municipalityCode',
  'unitId', 'educationId', 'classId', 'startsOn', 'endsOn',
  'unitName', 'className', 'educationName', 'grade', 'status',
] as const;
export type PupilRegisterField = (typeof PUPIL_REGISTER_FIELDS)[number];
const REGISTER_ACTIONS: ReadonlySet<string> = new Set(PUPIL_REGISTER_ACTIONS);
const REGISTER_FIELDS: ReadonlySet<string> = new Set(PUPIL_REGISTER_FIELDS);
function isoTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function auditRoute(url: string): string {
  const group = new URL(url).pathname.split('/')[2];
  const route = `/api/${group}`;
  return ROUTES.has(route) ? route : '/api/other';
}
export function sanitizeAuditDetails(input: Record<string, unknown> | undefined): Record<string, AuditJson> {
  const clean: Record<string, AuditJson> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (['emailMismatch','principalNamed','stepUp'].includes(key) && typeof value === 'boolean') clean[key] = value;
    else if (['count','revokedSessions'].includes(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) clean[key] = value;
    else if (['assignmentId','organizerId','from','to'].includes(key) && (value === null || (typeof value === 'string' && UUID.test(value)))) clean[key] = value;
    else if (['from','to'].includes(key) && isoTime(value)) clean[key] = value;
    else if (key === 'code' && typeof value === 'string' && (CODES.has(value) || /^\d{8}$/.test(value))) clean[key] = value;
    else if (key === 'accessFunction' && typeof value === 'string' && FUNCTIONS.has(value)) clean[key] = value;
    else if (key === 'status' && (value === 'active' || value === 'blocked')) clean[key] = value;
    else if (key === 'format' && value === 'csv') clean[key] = value;
    else if (key === 'readForm' && typeof value === 'string' && ['list','pupil','case','history','conflict','personal-number','export-preview','export'].includes(value)) clean[key] = value;
    else if (key === 'schoolYear' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9998) clean[key] = value;
    else if (key === 'action' && typeof value === 'string' && REGISTER_ACTIONS.has(value)) clean[key] = value;
    else if (key === 'field' && typeof value === 'string' && REGISTER_FIELDS.has(value)) clean[key] = value;
    else if (key === 'fields' && Array.isArray(value) && value.length <= PUPIL_REGISTER_FIELDS.length && value.every(v => typeof v === 'string' && REGISTER_FIELDS.has(v))) clean[key] = [...new Set(value)];
    else if (key === 'path' && typeof value === 'string' && ROUTES.has(value)) clean[key] = value;
    else if (key === 'grants' && Array.isArray(value) && value.length <= 10 && value.every(v => typeof v === 'string' && FUNCTIONS.has(v))) clean[key] = [...value];
  }
  return clean;
}
export function requiresAudit(mutating: boolean, audit?: 'required'): boolean {
  return mutating || audit === 'required';
}
