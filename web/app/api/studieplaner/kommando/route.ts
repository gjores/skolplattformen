import { protectedRoute } from '../../../../lib/server/authz.ts';
import { commandStudyPlan, studyPlanRequest } from '../../../../lib/server/study-plan.ts';
import { parseStudyPlanCommand } from '../../../../lib/study-plan-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'individual_study_plan_command', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] },
    async (ctx, tx) => commandStudyPlan(tx, ctx, await studyPlanRequest(request, parseStudyPlanCommand)));
}
