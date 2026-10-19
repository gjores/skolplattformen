import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parsePlanPublishRequest, planPublish, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** Fastställ och publicera: bara rektor, med engångskod (D-01, D-23). */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_plan_published', { mutating: true, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    return planPublish(tx, await tjanstRequest(request, parsePlanPublishRequest), ctx);
  });
}
