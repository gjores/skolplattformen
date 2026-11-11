import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { lasarRequest, lasarSummary, parseLasarSummaryInput } from '../../../../lib/server/lasar.ts';

/** Kalenderns sammanfattning för beroende underlag (D-11, LASAR-05): gällande och föregående fastställda version för en skola och ett läsår. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_summary', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return lasarSummary(tx, await lasarRequest(request, parseLasarSummaryInput), ctx);
  });
}
