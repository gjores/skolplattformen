import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseGymTimplanDistributionRequest } from '../../../../../lib/gym-timplan-distribution.ts';
import { distributeGymTimplan } from '../../../../../lib/server/gym-timplan-distribution.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'gym_timplan_hours_distributed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    let input;
    try { input = parseGymTimplanDistributionRequest(await request.json()); } catch { throw new Deny('bad_request', 400); }
    return distributeGymTimplan(tx, input, ctx);
  });
}
