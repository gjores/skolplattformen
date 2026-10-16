import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../../lib/server/programplan-planning.ts';
import { copyProgramplanEducation } from '../../../../../lib/server/programplan-copy.ts';
import { parseProgramplanCopyRequest } from '../../../../../lib/programplan-copy.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'programplan_education_copied', { mutating: true, mfa: true,
    audit: 'required', functions: ['huvudman', 'rektor'] }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return copyProgramplanEducation(tx, programplanRequest(parseProgramplanCopyRequest, body));
  });
}
