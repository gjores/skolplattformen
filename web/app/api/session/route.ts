import { Deny, type Tx, withLoginPhase, withSessionContext } from '../../../lib/server/db.ts';
import { correlationId, fail, json } from '../../../lib/server/http.ts';
import { readSession, sessionCookie, type SessionRow } from '../../../lib/server/session.ts';

type IdentityRow = {
  issuer: string;
  subject: string;
  display_name: string | null;
  email: string | null;
};

type MembershipRow = {
  id: string;
  customer_id: string;
  name: string;
  status: 'active' | 'blocked';
  closed_at: Date | null;
};

async function loadView(tx: Tx): Promise<{ identity: IdentityRow; memberships: MembershipRow[] }> {
  const identities = await tx<IdentityRow[]>`select issuer, subject, display_name, email
    from public.identities where id = public.current_identity_id()`;
  const memberships = await tx<MembershipRow[]>`select m.id, m.customer_id, c.name, m.status, c.closed_at
    from public.memberships m
    join public.customers c on c.id = m.customer_id
    where m.identity_id = public.current_identity_id()
    order by c.name`;
  if (!identities[0]) throw new Deny('session_revoked', 401);
  return { identity: identities[0], memberships };
}

function sessionError(session: SessionRow): 'session_expired' | 'session_revoked' | null {
  if (session.revokedAt) return 'session_revoked';
  const now = Date.now();
  if (
    new Date(session.expiresAt).getTime() <= now ||
    new Date(session.absoluteExpiresAt).getTime() <= now
  ) {
    return 'session_expired';
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const corr = correlationId();
  const current = await readSession(request, corr);
  if (!current) return fail('no_session', 401, corr);
  const invalid = sessionError(current.session);
  if (invalid) return fail(invalid, 401, corr);
  const ctx = {
    sessionId: current.session.id,
    identityId: current.session.identityId,
    membershipId: current.session.membershipId,
    customerId: current.session.customerId,
    correlationId: corr,
  };
  let blocked = false;
  let view: Awaited<ReturnType<typeof loadView>>;
  try {
    view = await withSessionContext(ctx, async (tx) => loadView(tx));
  } catch (error) {
    if (!(error instanceof Deny) || error.status !== 403) {
      if (error instanceof Deny) return fail(error.code, error.status, corr);
      throw error;
    }
    blocked = true;
    view = await withLoginPhase(corr, async (tx) => {
      await tx`select set_config('app.identity_id', ${current.session.identityId}, true)`;
      return loadView(tx);
    });
  }
  const selected = current.session.membershipId
    ? view.memberships.find((membership) => membership.id === current.session.membershipId)
    : undefined;
  const response = json(
    {
      identity: {
        issuer: view.identity.issuer,
        subject: view.identity.subject,
        displayName: view.identity.display_name,
        email: view.identity.email,
      },
      mfa: {
        acr: current.session.acr,
        amr: current.session.amr,
        authTime: current.session.authTime ? new Date(current.session.authTime).toISOString() : null,
      },
      context: selected
        ? {
            membershipId: selected.id,
            customerId: selected.customer_id,
            customerName: selected.name,
            blocked: blocked || selected.status === 'blocked' || selected.closed_at !== null,
          }
        : null,
      memberships: view.memberships.map((membership) => ({
        id: membership.id,
        customerId: membership.customer_id,
        customerName: membership.name,
        status: membership.status,
      })),
      epoch: current.session.epoch,
      expiresAt: new Date(current.session.expiresAt).toISOString(),
      correlationId: corr,
    },
    { correlationId: corr, epoch: current.session.epoch },
  );
  response.headers.append(
    'Set-Cookie',
    sessionCookie(request, current.token, current.session.absoluteExpiresAt),
  );
  return response;
}
