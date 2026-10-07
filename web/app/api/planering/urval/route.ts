import { Deny } from '../../../../lib/server/db.ts';
import { planningProtectedRoute, readPlanningSetup } from '../../../../lib/server/planning-year.ts';

export async function GET(request: Request): Promise<Response> {
  return planningProtectedRoute(request, 'planning_year_selection_read', async (ctx, tx) => {
    if (new URL(request.url).search) throw new Deny('bad_request', 400);
    return readPlanningSetup(tx, ctx);
  });
}
