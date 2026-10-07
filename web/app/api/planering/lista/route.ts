import { planningJsonRequest, planningProtectedRoute, readPlanningList } from '../../../../lib/server/planning-year.ts';

export async function POST(request: Request): Promise<Response> {
  return planningProtectedRoute(request, 'planning_year_list_read', async (ctx, tx) => {
    return readPlanningList(tx, ctx, await planningJsonRequest(request));
  });
}
