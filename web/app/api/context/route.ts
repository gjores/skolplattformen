import { legacyAppRole } from '../../../lib/access-rules.ts';
import { assignmentState, contextLabel, todayInStockholm } from '../../../lib/access-rules.ts';
import type { AccessFunction } from '../../../lib/access-rules.ts';
import { denyResponse, requireSameOrigin } from '../../../lib/server/authz.ts';
import { Deny, type SessionContext, withLoginPhase } from '../../../lib/server/db.ts';
import { logEvent } from '../../../lib/server/events.ts';
import { correlationId, json } from '../../../lib/server/http.ts';
import { readSession } from '../../../lib/server/session.ts';

type AssignmentRow = {
  id: string;
  membership_id: string;
  customer_id: string;
  customer_name: string;
  organizer_id: string | null;
  organizer_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  function: AccessFunction;
  valid_from: string;
  valid_to: string | null;
  ended_at: Date | null;
  status: 'active' | 'blocked';
  closed_at: Date | null;
  valid: boolean;
  auth_user_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;


export async function POST(request: Request): Promise<Response> {
  const corr = correlationId();
  let hint: Partial<SessionContext> | undefined;
  try {
    requireSameOrigin(request);
    const current = await readSession(request, corr);
    if (!current) throw new Deny('no_session', 401);
    if (current.session.revokedAt) throw new Deny('session_revoked', 401);
    const now = Date.now();
    if (
      new Date(current.session.expiresAt).getTime() <= now ||
      new Date(current.session.absoluteExpiresAt).getTime() <= now
    ) {
      throw new Deny('session_expired', 401);
    }
    hint = {
      sessionId: current.session.id,
      identityId: current.session.identityId,
      identity: {
        issuer: current.session.issuer,
        subject: current.session.subject,
        authUserId: null,
      },
      membershipId: current.session.membershipId,
      customerId: current.session.customerId,
      assignmentId: current.session.assignmentId,
      correlationId: corr,
    };
    const body = (await request.json().catch(() => null)) as { assignmentId?: unknown } | null;
    if (!body || typeof body.assignmentId !== 'string' || !UUID.test(body.assignmentId)) {
      throw new Deny('bad_request', 400);
    }
    const result = await withLoginPhase(corr, async (tx) => {
      await tx`select set_config('app.identity_id', ${current.session.identityId}, true)`;
      const sessions = await tx<{ context_epoch: number; assignment_id: string | null }[]>`select
          context_epoch, assignment_id
        from public.app_sessions
        where id = ${current.session.id}
          and identity_id = ${current.session.identityId}
          and revoked_at is null
          and expires_at > now()
          and absolute_expires_at > now()
        for update`;
      const liveSession = sessions[0];
      if (!liveSession) throw new Deny('session_revoked', 401);
      const requestedEpoch = request.headers.get('X-Context-Epoch');
      if (
        requestedEpoch !== null &&
        (!Number.isInteger(Number(requestedEpoch)) || Number(requestedEpoch) !== liveSession.context_epoch)
      ) {
        throw new Deny('context_changed', 409);
      }
      const candidates = await tx<{ customer_id: string }[]>`select a.customer_id
        from public.access_assignments a
        join public.memberships m on m.id = a.membership_id
        where a.id = ${body.assignmentId}
          and m.identity_id = public.current_identity_id()`;
      const candidate = candidates[0];
      if (!candidate) throw new Deny('not_found', 404);
      // The lock policy is customer scoped. Set it only from the identity-owned
      // candidate, then lock and re-read the exact same assignment authoritatively.
      await tx`select set_config('app.customer_id', ${candidate.customer_id}, true)`;
      const rows = await tx<AssignmentRow[]>`select
          a.id, a.membership_id, a.customer_id, c.name as customer_name,
          a.organizer_id, o.name as organizer_name, a.unit_id, u.name as unit_name,
          a.function, a.valid_from::text, a.valid_to::text, a.ended_at,
          m.status, c.closed_at, public.assignment_is_valid(a) as valid,
          i.auth_user_id
        from public.access_assignments a
        join public.memberships m on m.id = a.membership_id
        join public.identities i on i.id = m.identity_id
        join public.customers c on c.id = a.customer_id
        left join public.organizers o on o.id = a.organizer_id
        left join public.school_units u on u.id = a.unit_id
        where a.id = ${body.assignmentId}
          and m.identity_id = public.current_identity_id()
          and a.customer_id = ${candidate.customer_id}
        for update of a, m`;
      const selected = rows[0];
      if (!selected) throw new Deny('not_found', 404);
      hint = {
        ...hint,
        identity: {
          issuer: current.session.issuer,
          subject: current.session.subject,
          authUserId: selected.auth_user_id,
        },
        membershipId: selected.membership_id,
        customerId: selected.customer_id,
        assignmentId: selected.id,
        accessFunction: selected.function,
        organizerId: selected.organizer_id,
        unitId: selected.unit_id,
        appRole: legacyAppRole(selected.function),
      };
      if (selected.status !== 'active') throw new Deny('membership_blocked', 403);
      if (selected.closed_at !== null) throw new Deny('customer_closed', 403);
      if (!selected.valid) {
        const state = assignmentState(
          {
            validFrom: selected.valid_from,
            validTo: selected.valid_to,
            endedAt: selected.ended_at ? new Date(selected.ended_at).toISOString() : null,
          },
          todayInStockholm(),
        );
        if (selected.ended_at !== null) throw new Deny('assignment_ended', 403);
        if (state === 'kommande') throw new Deny('assignment_upcoming', 403);
        throw new Deny('assignment_expired', 403);
      }
      const role = legacyAppRole(selected.function);
      await tx`select
        set_config('app.phase', '', true),
        set_config('app.customer_id', ${selected.customer_id}, true),
        set_config('app.membership_id', ${selected.membership_id}, true),
        set_config('app.assignment_id', ${selected.id}, true),
        set_config('app.access_function', ${selected.function}, true),
        set_config('app.organizer_id', ${selected.organizer_id ?? ''}, true),
        set_config('app.app_role', ${role ?? ''}, true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: selected.auth_user_id ?? '', role: 'authenticated' })}, true),
        set_config('request.jwt.claim.sub', ${selected.auth_user_id ?? ''}, true)`;
      const updated = await tx<{ context_epoch: number }[]>`update public.app_sessions
        set membership_id = ${selected.membership_id},
            assignment_id = ${selected.id},
            context_epoch = context_epoch + 1
        where id = ${current.session.id}
        returning context_epoch`;
      const ctx: SessionContext = {
        sessionId: current.session.id,
        identityId: current.session.identityId,
        identity: {
          issuer: current.session.issuer,
          subject: current.session.subject,
          authUserId: selected.auth_user_id,
        },
        membershipId: selected.membership_id,
        customerId: selected.customer_id,
        assignmentId: selected.id,
        accessFunction: selected.function,
        organizerId: selected.organizer_id,
        unitId: selected.unit_id,
        appRole: role,
        correlationId: corr,
      };
      await logEvent(tx, { ...ctx, request }, {
        action: 'context_changed',
        objectType: 'access_assignment',
        objectId: selected.id,
        outcome: 'ok',
        details: { from: liveSession.assignment_id },
      });
      const assignment = {
        customerName: selected.customer_name,
        organizerName: selected.organizer_name,
        unitName: selected.unit_name,
        function: selected.function,
      };
      return {
        epoch: updated[0].context_epoch,
        context: {
          assignmentId: selected.id,
          membershipId: selected.membership_id,
          customerId: selected.customer_id,
          customerName: selected.customer_name,
          organizerId: selected.organizer_id,
          organizerName: selected.organizer_name,
          unitId: selected.unit_id,
          unitName: selected.unit_name,
          function: selected.function,
          label: contextLabel({
            ...assignment,
          }),
          blocked: false,
          valid: true,
        },
      };
    });
    return json(result, { correlationId: corr, epoch: result.epoch });
  } catch (error) {
    return denyResponse(error, request, corr, 'context', hint);
  }
}
