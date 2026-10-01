import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { assertSameOrigin } from '../../../../lib/server/http.ts';
import { programplanRequest } from '../../../../lib/server/programplan-planning.ts';
import { listProgramplanOfferings } from '../../../../lib/server/programplan-workspace.ts';
import { parseProgramplanListRequest } from '../../../../lib/programplan-workspace-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_offerings_listed', { mutating: false, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    if (!assertSameOrigin(request)) throw new Deny('csrf', 403);
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return listProgramplanOfferings(tx, programplanRequest(parseProgramplanListRequest, body));
  });
}
