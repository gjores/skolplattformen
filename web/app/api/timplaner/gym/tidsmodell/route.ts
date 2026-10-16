import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseGymTimplanReadRequest } from '../../../../../lib/gym-timplan.ts';
import { parseTimplanTimeCommand } from '../../../../../lib/timplan-time-command.ts';
import { aplRequest } from '../../../../../lib/server/apl-plan.ts';
import { commandTimplanTime, readTimplanTimeBasis } from '../../../../../lib/server/timplan-time.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_time_basis_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) =>
    readTimplanTimeBasis(tx, await aplRequest(request, parseGymTimplanReadRequest), ctx));
}
export async function PUT(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_time_changed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) => {
    const input = await aplRequest(request, parseTimplanTimeCommand);
    if (input.action !== 'transition') throw new Deny('bad_request', 400);
    return commandTimplanTime(tx, input);
  });
}
