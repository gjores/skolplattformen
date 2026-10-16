import { protectedRoute, requireSameOrigin } from '../../../../../../lib/server/authz.ts';
import { parseAplReadRequest } from '../../../../../../lib/apl-plan.ts';
import { aplRequest, readAplPlan } from '../../../../../../lib/server/apl-plan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'apl_plan_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return readAplPlan(tx, await aplRequest(request, parseAplReadRequest), ctx);
  });
}
