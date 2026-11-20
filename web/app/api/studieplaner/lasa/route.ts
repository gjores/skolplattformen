import { protectedRoute } from '../../../../lib/server/authz.ts';
import { readStudyPlan, studyPlanRequest } from '../../../../lib/server/study-plan.ts';
import { parseStudyPlanReadRequest } from '../../../../lib/study-plan-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'individual_study_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] },
    async (ctx, tx) => readStudyPlan(tx, ctx, await studyPlanRequest(request, parseStudyPlanReadRequest)));
}
