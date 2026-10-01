import { parseProgramplanCreate } from '../../../../lib/programplan-contract.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { createProgramplan, programplanRequest } from '../../../../lib/server/programplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_draft_created', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return createProgramplan(tx, programplanRequest(parseProgramplanCreate,body));
  });
}
