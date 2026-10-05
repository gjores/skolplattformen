import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseGymTimplanRowRequest } from '../../../../../lib/gym-timplan.ts';
import { gymTimplanRequest, writeGymTimplanRow } from '../../../../../lib/server/gym-timplan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'gym_timplan_row_changed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return writeGymTimplanRow(tx, gymTimplanRequest(parseGymTimplanRowRequest, body));
  });
}
