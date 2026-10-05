import { parseProgramplanRead } from '../../../../lib/programplan-contract.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { readProgramplan, programplanRequest } from '../../../../lib/server/programplan-planning.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_read', { mutating: false, audit: 'required', functions: ['huvudman','rektor','administrator'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return readProgramplan(tx, programplanRequest(parseProgramplanRead,body));
  });
}
