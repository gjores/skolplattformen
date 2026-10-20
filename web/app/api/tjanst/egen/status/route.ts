import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseSelfStatusRequest, selfStatus, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_self_status_read', { mutating: false, audit: 'required', functions: ['larare'], selfAllowed: true }, async (ctx, tx) => {
    requireSameOrigin(request);
    return selfStatus(tx, await tjanstRequest(request, parseSelfStatusRequest), ctx);
  });
}
