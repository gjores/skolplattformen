import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { lasarRead, lasarRequest, parseLasarReadInput } from '../../../../lib/server/lasar.ts';

/** Läsårskalenderns läsning för huvudman, rektor och skoladministratör; SQL prövar skolenheten mot mandatet. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return lasarRead(tx, await lasarRequest(request, parseLasarReadInput), ctx);
  });
}
