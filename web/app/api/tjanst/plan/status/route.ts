import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parsePlanStatusRequest, planStatus, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_plan_status_read', { mutating: false, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return planStatus(tx, await tjanstRequest(request, parsePlanStatusRequest), ctx);
  });
}
