import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parsePersonalStatusRequest, personalStatus, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_personal_status_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return personalStatus(tx, await tjanstRequest(request, parsePersonalStatusRequest), ctx);
  });
}
