import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parsePlanReadRequest, planRead, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_plan_read', { mutating: false, audit: 'required', functions: ['rektor', 'administrator', 'huvudman'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return planRead(tx, await tjanstRequest(request, parsePlanReadRequest), ctx);
  });
}
