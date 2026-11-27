import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { parseElevmottagandeRead, readElevmottagande } from '../../../../lib/server/elevmottagande.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'elevmottagande_read', {
    mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'],
  }, async (ctx, tx) => {
    requireSameOrigin(request);
    return readElevmottagande(tx, ctx, await tjanstRequest(request, parseElevmottagandeRead, 2_000));
  });
}
