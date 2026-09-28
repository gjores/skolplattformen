import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { changeProtectedPermission, listProtectedPermissions, parseProtectedPermission } from '../../../../lib/server/protected-permission.ts';

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(request, 'protected_permission_list',
    { mutating: false, audit: 'required', functions: ['huvudman'] },
    async (_ctx, tx) => listProtectedPermissions(tx));
}
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'protected_permission_change',
    { mutating: true, mfa: true, functions: ['huvudman'] },
    async (_ctx, tx) => {
      let body: unknown;
      try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
      return changeProtectedPermission(tx, parseProtectedPermission(body));
    });
}
