import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parsePersonalReadRequest, personalRead, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_personal_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return personalRead(tx, await tjanstRequest(request, parsePersonalReadRequest), ctx);
  });
}
