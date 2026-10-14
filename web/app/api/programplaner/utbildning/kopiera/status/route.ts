import { protectedRoute } from '../../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../../../lib/server/programplan-planning.ts';
import { copyProgramplanEducation } from '../../../../../../lib/server/programplan-copy.ts';
import { parseProgramplanCopyRequest } from '../../../../../../lib/programplan-copy.ts';

export async function POST(request: Request): Promise<Response> {
  // Apply the same MFA/CSRF assurance to receipt recovery. SQL status_only=true
  // still guarantees that this endpoint never creates a copy.
  return protectedRoute(request, 'programplan_copy_status_read', { mutating: true, mfa: true,
    audit: 'required', functions: ['huvudman'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return copyProgramplanEducation(tx, programplanRequest(parseProgramplanCopyRequest, body), true);
  });
}
