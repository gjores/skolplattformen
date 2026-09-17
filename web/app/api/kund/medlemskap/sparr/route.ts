import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type BlockBody = { membershipId?: unknown; reason?: unknown; action?: unknown };

function parseBody(body: BlockBody | null, unblock = false): { membershipId: string; reason: string | null } {
  if (
    !body ||
    typeof body.membershipId !== 'string' ||
    !UUID.test(body.membershipId) ||
    (!unblock && body.reason !== undefined && typeof body.reason !== 'string') ||
    (!unblock && typeof body.reason === 'string' && body.reason.length > 200) ||
    (unblock && body.action !== 'unblock')
  ) {
    throw new Deny('bad_request', 400);
  }
  return { membershipId: body.membershipId, reason: typeof body.reason === 'string' ? body.reason.trim() || null : null };
}

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'membership_block',
    { mutating: true, mfa: true, functions: ['kundadmin'] },
    async (ctx, tx) => {
      const values = parseBody((await request.json().catch(() => null)) as BlockBody | null);
      if (values.membershipId === ctx.membershipId) throw new Deny('conflict', 409);
      const rows = await tx<{ id: string; identity_id: string }[]>`update public.memberships
        set status = 'blocked', blocked_at = now(), blocked_by = ${ctx.membershipId},
            block_reason = ${values.reason}
        where id = ${values.membershipId}
          and customer_id = current_customer_id()
          and status = 'active'
        returning id, identity_id`;
      const blocked = rows[0];
      if (!blocked) {
        const existing = await tx<{ status: 'active' | 'blocked' }[]>`select status
          from public.memberships
          where id = ${values.membershipId} and customer_id = current_customer_id()`;
        if (existing[0]?.status === 'blocked') throw new Deny('conflict', 409);
        throw new Deny('not_found', 404);
      }
      const revoked = await tx<{ id: string }[]>`update public.app_sessions
        set revoked_at = now()
        where identity_id = ${blocked.identity_id}
          and membership_id = ${blocked.id}
          and revoked_at is null
        returning id`;
      return {
        body: { membershipId: blocked.id, status: 'blocked', revokedSessions: revoked.length },
        event: {
          action: 'membership_blocked',
          objectType: 'membership',
          objectId: blocked.id,
          details: { reason: values.reason, revokedSessions: revoked.length },
        },
      };
    },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'membership_unblock',
    { mutating: true, mfa: true, functions: ['kundadmin'] },
    async (_ctx, tx) => {
      const values = parseBody((await request.json().catch(() => null)) as BlockBody | null, true);
      const rows = await tx<{ id: string }[]>`update public.memberships
        set status = 'active', blocked_at = null, blocked_by = null, block_reason = null
        where id = ${values.membershipId}
          and customer_id = current_customer_id()
          and status = 'blocked'
        returning id`;
      const unblocked = rows[0];
      if (!unblocked) {
        const existing = await tx<{ status: 'active' | 'blocked' }[]>`select status
          from public.memberships
          where id = ${values.membershipId} and customer_id = current_customer_id()`;
        if (existing[0]?.status === 'active') throw new Deny('conflict', 409);
        throw new Deny('not_found', 404);
      }
      return {
        body: { membershipId: unblocked.id, status: 'active' },
        event: {
          action: 'membership_unblocked',
          objectType: 'membership',
          objectId: unblocked.id,
          details: { status: 'active' },
        },
      };
    },
  );
}
