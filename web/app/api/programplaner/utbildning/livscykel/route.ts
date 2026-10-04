import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../../lib/server/programplan-planning.ts';
import { changeProgramplanEducation } from '../../../../../lib/server/programplan-lifecycle.ts';
import { parseProgramplanLifecycleCommand } from '../../../../../lib/programplan-lifecycle.ts';
// Huvudmannens livscykel för utbildningen. Händelsens namn följer kommandot.
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_education_lifecycle', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman'] }, async (_ctx, tx) => {
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return changeProgramplanEducation(tx, programplanRequest(parseProgramplanLifecycleCommand, body));
  });
}
