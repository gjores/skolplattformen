import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parseSelfCommand, selfCommand, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** Kvittens och kommentar utan engångskod (D-23) och utan person-ID (D-03). */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_self_command', { mutating: true, audit: 'required', functions: ['larare'] }, async (ctx, tx) => {
    return selfCommand(tx, await tjanstRequest(request, parseSelfCommand), ctx);
  });
}
