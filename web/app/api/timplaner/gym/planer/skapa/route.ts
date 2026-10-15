import { protectedRoute } from '../../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../../lib/server/db.ts';
import { parseNamedTimplanCreateRequest } from '../../../../../../lib/named-timplan.ts';
import { gymTimplanRequest } from '../../../../../../lib/server/gym-timplan.ts';
import { createNamedTimplan } from '../../../../../../lib/server/named-timplan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'named_timplan_created', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return createNamedTimplan(tx, gymTimplanRequest(parseNamedTimplanCreateRequest, body));
  });
}
