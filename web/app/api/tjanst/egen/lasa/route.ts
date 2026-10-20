import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseSelfReadRequest, selfRead, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** Egen tjänst: inget person-ID i begäran (D-03); personen härleds ur sessionens bindning i SQL. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_self_read', { mutating: false, audit: 'required', functions: ['larare'], selfAllowed: true }, async (ctx, tx) => {
    requireSameOrigin(request);
    return selfRead(tx, await tjanstRequest(request, parseSelfReadRequest), ctx);
  });
}
