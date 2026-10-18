import { protectedRoute } from '../../../../../../lib/server/authz.ts';
import { parseAplCommand } from '../../../../../../lib/apl-plan.ts';
import { aplRequest, commandAplPlan } from '../../../../../../lib/server/apl-plan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'apl_plan_command', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    return commandAplPlan(tx, await aplRequest(request, parseAplCommand), ctx);
  });
}
