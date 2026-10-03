import { parseProgramplanTermWrite } from '../../../../lib/programplan-terms-contract.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../lib/server/programplan-planning.ts';
import { writeProgramplanTerms } from '../../../../lib/server/programplan-terms.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_terms_changed', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman', 'rektor'] }, async (_ctx, tx) => {
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return writeProgramplanTerms(tx, programplanRequest(parseProgramplanTermWrite, body));
  });
}
