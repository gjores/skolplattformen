import { Deny, withSessionContext } from '../../../../lib/server/db.ts';
import { correlationId, fail, json } from '../../../../lib/server/http.ts';
import { readSession, sessionCookie } from '../../../../lib/server/session.ts';

export async function GET(request: Request): Promise<Response> {
  const corr = correlationId();
  const current = await readSession(request, corr);
  if (!current) return fail('no_session', 401, corr);
  const { session } = current;
  if (session.revokedAt) return fail('session_revoked', 401, corr);
  const now = Date.now();
  if (
    new Date(session.expiresAt).getTime() <= now ||
    new Date(session.absoluteExpiresAt).getTime() <= now
  ) {
    return fail('session_expired', 401, corr);
  }
  if (!session.membershipId) return fail('no_context', 403, corr);
  try {
    const result = await withSessionContext(
      {
        sessionId: session.id,
        identityId: session.identityId,
        membershipId: session.membershipId,
        customerId: session.customerId,
        correlationId: corr,
      },
      async (tx, live) => {
        const customers = await tx<{ id: string; name: string }[]>`select id, name
          from public.customers where id = public.current_customer_id()`;
        if (!customers[0]) return null;
        return {
          customer: customers[0],
          membership: { id: session.membershipId, status: live.membershipStatus },
        };
      },
    );
    if (!result) return fail('not_found', 404, corr);
    const response = json(result, { correlationId: corr, epoch: session.epoch });
    response.headers.append(
      'Set-Cookie',
      sessionCookie(request, current.token, session.absoluteExpiresAt),
    );
    return response;
  } catch (error) {
    // Deny bevarar bland annat medlemskapets medlemskapsspärr som membership_blocked.
    if (error instanceof Deny) return fail(error.code, error.status, corr);
    throw error;
  }
}
