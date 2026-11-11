import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { lasarOverview, lasarRequest, parseLasarOverviewInput } from '../../../../lib/server/lasar.ts';

/** Kalenderstatus per skola för Läsårsöverblick (D-09); SQL väljer skolorna ur aktörens aktuella uppdrag. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_overview', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return lasarOverview(tx, await lasarRequest(request, parseLasarOverviewInput), ctx);
  });
}
