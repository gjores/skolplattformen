import { parseProgramplanClone } from '../../../../lib/programplan-contract.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { cloneProgramplan, programplanRequest } from '../../../../lib/server/programplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_draft_cloned', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return cloneProgramplan(tx, programplanRequest(parseProgramplanClone,body));
  });
}
