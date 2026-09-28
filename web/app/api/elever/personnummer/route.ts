import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parsePupilCardRequest, revealPupilPersonalNumber } from '../../../../lib/server/pupil-register.ts';

/** Uttrycklig personnummervisning. Varje anrop kräver same-origin och MFA och
 * skriver en egen visningshändelse innan numret lämnar servern. Elevkortet
 * hämtar aldrig numret automatiskt. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'pupil_personal_number_read', { mutating: false, mfa: true, audit: 'required', functions: ['administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return revealPupilPersonalNumber(tx, ctx, parsePupilCardRequest(body));
  });
}
