import { protectedRoute } from '../../../../lib/server/authz.ts';
import { studyPlanClass } from '../../../../lib/server/study-plan-class.ts';
import { tjanstRequest } from '../../../../lib/server/tjanst.ts';
import { parseStudyPlanClassRequest } from '../../../../lib/study-plan-class-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'individual_study_plan_class', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] },
    async (ctx, tx) => studyPlanClass(tx, ctx, await tjanstRequest(request, parseStudyPlanClassRequest, 12_000)));
}
