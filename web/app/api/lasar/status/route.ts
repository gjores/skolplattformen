import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { lasarRequest, lasarStatus, parseLasarStatusInput } from '../../../../lib/server/lasar.ts';

/** Utfallet för ett kommando-id efter ett uteblivet svar (T-05.1.1-21); SQL prövar att kommandot är sessionens eget. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_status', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return lasarStatus(tx, await lasarRequest(request, parseLasarStatusInput), ctx);
  });
}
