import { protectedRoute } from '../../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../../lib/server/db.ts';
import { parseNamedTimplanRenameRequest } from '../../../../../../lib/named-timplan.ts';
import { gymTimplanRequest } from '../../../../../../lib/server/gym-timplan.ts';
import { renameTimplan } from '../../../../../../lib/server/named-timplan.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'timplan_renamed', { mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return renameTimplan(tx, gymTimplanRequest(parseNamedTimplanRenameRequest, body));
  });
}
