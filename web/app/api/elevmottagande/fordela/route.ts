import { protectedRoute } from '../../../../lib/server/authz.ts';
import { allocateElevmottagande, parseElevmottagandeAllocation } from '../../../../lib/server/elevmottagande.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'elevmottagande_allocate', {
    mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'],
  }, async (ctx, tx) => allocateElevmottagande(tx, ctx, await tjanstRequest(request, parseElevmottagandeAllocation, 45_000)));
}
