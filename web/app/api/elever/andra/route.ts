import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { changePupil, parsePupilChangeRequest } from '../../../../lib/server/pupil-register.ts';

/** Sparar en elevändring ur den stängda unionen. Kräver same-origin, MFA och
 * administratörsuppdrag; SQL omprövar levande mandat, spärr, skydd och version.
 * Svaret innehåller bara elev-ID, ny version och varningar – klienten läser om
 * elevkortet efter commit. En versionskonflikt blir 409 {code:'conflict',details}. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'pupil_change', { mutating: true, mfa: true, audit: 'required', functions: ['administrator'] }, async (ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return changePupil(tx, ctx, parsePupilChangeRequest(body));
  });
}
