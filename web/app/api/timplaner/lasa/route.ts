import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parseTimplanRead, readTimplan } from '../../../../lib/server/timplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_read', { mutating: false, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return readTimplan(tx, parseTimplanRead(body));
  });
}
