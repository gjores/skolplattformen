import type { Tx } from './db.ts';
import { Deny } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

export type ProtectedPermissionOption = {
  assignmentId: string; membershipId: string; displayName: string;
  unitId: string; schoolName: string; permissionId: string | null;
};
export type ProtectedPermissionChange =
  | { action: 'grant'; assignmentId: string; unitId: string }
  | { action: 'revoke'; permissionId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function parseProtectedPermission(value: unknown): ProtectedPermissionChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Deny('bad_request', 400);
  const row = value as Record<string, unknown>;
  const keys = row.action === 'grant' ? ['action', 'assignmentId', 'unitId'] : row.action === 'revoke' ? ['action', 'permissionId'] : [];
  if (!keys.length || Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))
    || keys.filter(key => key !== 'action').some(key => typeof row[key] !== 'string' || !uuid.test(row[key] as string))) throw new Deny('bad_request', 400);
  return row.action === 'grant' ? { action: 'grant', assignmentId: row.assignmentId as string, unitId: row.unitId as string }
    : { action: 'revoke', permissionId: row.permissionId as string };
}
export async function listProtectedPermissions(tx: Tx) {
  const rows = await mandateOperation(() => tx<{ permissions: ProtectedPermissionOption[] }[]>`select public.phase4_list_protected_permissions() as permissions`);
  return { body: { permissions: rows[0].permissions }, event: { action: 'protected_permission_listed', objectType: 'protected_identity_permission', details: {} } };
}
export async function changeProtectedPermission(tx: Tx, change: ProtectedPermissionChange) {
  // The caller/organisation come exclusively from the live transaction context in SQL.
  const rows = await mandateOperation(() => change.action === 'grant'
    ? tx<{ id: string }[]>`select public.phase4_grant_protected_permission(${change.assignmentId}, ${change.unitId}) as id`
    : tx<{ id: string }[]>`select public.phase4_revoke_protected_permission(${change.permissionId}) as id`);
  return { status: change.action === 'grant' ? 201 : 200, body: { permissionId: rows[0].id }, event: {
    action: change.action === 'grant' ? 'protected_permission_granted' : 'protected_permission_revoked',
    objectType: 'protected_identity_permission', objectId: rows[0].id, details: {},
  } };
}
