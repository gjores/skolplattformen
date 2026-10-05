import { parseProgramplanTermRead } from '../../../../../lib/programplan-terms-contract.ts';
import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../../lib/server/programplan-planning.ts';
import { readProgramplanTerms } from '../../../../../lib/server/programplan-terms.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_terms_read', { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (_ctx, tx) => {
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return readProgramplanTerms(tx, programplanRequest(parseProgramplanTermRead, body));
  });
}
