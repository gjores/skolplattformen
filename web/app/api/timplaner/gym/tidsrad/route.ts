import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseTimplanTimeCommand } from '../../../../../lib/timplan-time-command.ts';
import { aplRequest } from '../../../../../lib/server/apl-plan.ts';
import { commandTimplanTime } from '../../../../../lib/server/timplan-time.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_time_changed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) => {
    const input = await aplRequest(request, parseTimplanTimeCommand);
    if (input.action !== 'save_row' && input.action !== 'resolve_copy_review') throw new Deny('bad_request', 400);
    return commandTimplanTime(tx, input);
  });
}
