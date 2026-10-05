import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseGymTimplanUnderlagRequest } from '../../../../../lib/gym-timplan.ts';
import { gymTimplanRequest, readGymTimplanUnderlag } from '../../../../../lib/server/gym-timplan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'gym_timplan_basis_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return readGymTimplanUnderlag(tx, gymTimplanRequest(parseGymTimplanUnderlagRequest, body));
  });
}
