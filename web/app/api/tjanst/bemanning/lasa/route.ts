import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseStaffingReadRequest, staffingRead, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** Huvudmannens bemanningsuppföljning: bara läsning. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_staffing_read', { mutating: false, audit: 'required', functions: ['huvudman'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return staffingRead(tx, await tjanstRequest(request, parseStaffingReadRequest), ctx);
  });
}
