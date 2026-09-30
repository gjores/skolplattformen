import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { listTimplans, parseTimplanList } from '../../../../lib/server/timplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_list_read', { mutating: false, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return listTimplans(tx, parseTimplanList(body));
  });
}
