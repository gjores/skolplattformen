import { protectedRoute } from '../../../../lib/server/authz.ts';
import { studyPlanIntake } from '../../../../lib/server/study-plan-intake.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { parseStudyPlanIntakeRequest } from '../../../../lib/study-plan-intake-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'individual_study_plan_intake', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] },
    async (ctx, tx) => studyPlanIntake(tx, ctx, await tjanstRequest(request, parseStudyPlanIntakeRequest, 16_000)));
}
