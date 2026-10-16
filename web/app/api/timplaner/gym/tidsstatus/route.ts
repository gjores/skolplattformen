import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parseTimplanTimeStatusRequest } from '../../../../../lib/timplan-time-command.ts';
import { aplRequest } from '../../../../../lib/server/apl-plan.ts';
import { readTimplanTimeStatus } from '../../../../../lib/server/timplan-time.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_time_status_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) =>
    readTimplanTimeStatus(tx, await aplRequest(request, parseTimplanTimeStatusRequest)));
}
