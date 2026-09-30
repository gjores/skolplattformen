import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { changeTimplanCell, parseTimplanCell } from '../../../../lib/server/timplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_cell_changed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return changeTimplanCell(tx, parseTimplanCell(body));
  });
}
