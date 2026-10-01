import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { assertSameOrigin } from '../../../../lib/server/http.ts';
import { programplanRequest } from '../../../../lib/server/programplan-planning.ts';
import { readProgramplanWorkspace } from '../../../../lib/server/programplan-workspace.ts';
import { parseProgramplanWorkspaceRequest } from '../../../../lib/programplan-workspace-contract.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_workspace_read', { mutating: false, audit: 'required', functions: ['huvudman','rektor'] }, async (_ctx, tx) => {
    if (!assertSameOrigin(request)) throw new Deny('csrf', 403);
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return readProgramplanWorkspace(tx, programplanRequest(parseProgramplanWorkspaceRequest, body));
  });
}
