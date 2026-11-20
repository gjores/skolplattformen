import { protectedRoute } from '../../../../lib/server/authz.ts';
import { statusStudyPlan, studyPlanRequest } from '../../../../lib/server/study-plan.ts';
import { parseStudyPlanStatusRequest } from '../../../../lib/study-plan-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'individual_study_plan_status', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] },
    async (ctx, tx) => statusStudyPlan(tx, ctx, await studyPlanRequest(request, parseStudyPlanStatusRequest)));
}
