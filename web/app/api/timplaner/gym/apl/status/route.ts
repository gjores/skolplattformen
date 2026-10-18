import { protectedRoute, requireSameOrigin } from '../../../../../../lib/server/authz.ts';
import { parseAplStatusRequest } from '../../../../../../lib/apl-plan.ts';
import { aplRequest, readAplStatus } from '../../../../../../lib/server/apl-plan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'apl_plan_status_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return readAplStatus(tx, await aplRequest(request, parseAplStatusRequest), ctx);
  });
}
