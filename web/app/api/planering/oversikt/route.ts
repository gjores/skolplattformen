import { planningJsonRequest, planningProtectedRoute, readPlanningOverview } from '../../../../lib/server/planning-year.ts';

export async function POST(request: Request): Promise<Response> {
  return planningProtectedRoute(request, 'planning_year_overview_read', async (ctx, tx) => {
    return readPlanningOverview(tx, ctx, await planningJsonRequest(request, true));
  });
}
