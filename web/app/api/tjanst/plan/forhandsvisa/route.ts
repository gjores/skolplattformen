import { protectedRoute, requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseYearRequest, planPreview, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_year_preview_read', { mutating: false, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    return planPreview(tx, await tjanstRequest(request, parseYearRequest), ctx);
  });
}
