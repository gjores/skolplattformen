import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parsePlanCommandRequest, planCommand, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** Utkastarbete utan engångskod (D-23). Parsern nekar publish; publicering går bara via /api/tjanst/plan/publicera. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_plan_command', { mutating: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    return planCommand(tx, await tjanstRequest(request, parsePlanCommandRequest), ctx);
  });
}
