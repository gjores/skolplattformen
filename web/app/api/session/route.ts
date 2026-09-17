import type { AssignmentView } from '../../../lib/access-rules.ts';
import {
  assignmentState,
  contextLabel,
  selectableAssignments,
  todayInStockholm,
} from '../../../lib/access-rules.ts';
import { hasMfaProof } from '../../../lib/auth-assurance.ts';
import { denyResponse } from '../../../lib/server/authz.ts';
import { Deny, type Tx, withLoginPhase } from '../../../lib/server/db.ts';
import { serverEnv } from '../../../lib/server/env.ts';
import { correlationId, json } from '../../../lib/server/http.ts';
import { localTrustProfile } from '../../../lib/server/identity-provider.ts';
import { readSession, sessionCookie } from '../../../lib/server/session.ts';

type IdentityRow = {
  issuer: string;
  subject: string;
  display_name: string | null;
  email: string | null;
};

type AssignmentRow = {
  id: string;
  membership_id: string;
  customer_id: string;
  customer_name: string;
  organizer_id: string | null;
  organizer_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  function: AssignmentView['function'];
  valid_from: string;
  valid_to: string | null;
  ended_at: Date | null;
  membership_status: AssignmentView['membershipStatus'];
};

type SessionAssignment = AssignmentView & {
  organizerId: string | null;
  unitId: string | null;
};

function view(row: AssignmentRow): SessionAssignment {
  return {
    id: row.id,
    membershipId: row.membership_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    organizerId: row.organizer_id,
    organizerName: row.organizer_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    function: row.function,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    membershipStatus: row.membership_status,
  };
}

async function loadSessionView(
  tx: Tx,
  sessionId: string,
  identityId: string,
): Promise<{ identity: IdentityRow; assignments: AssignmentRow[] } | null> {
  const live = await tx<{ id: string }[]>`select id from public.app_sessions
    where id = ${sessionId}
      and identity_id = ${identityId}
      and revoked_at is null
      and expires_at > now()
      and absolute_expires_at > now()
    for update`;
  if (!live[0]) return null;
  await tx`select set_config('app.identity_id', ${identityId}, true)`;
  const identities = await tx<IdentityRow[]>`select issuer, subject, display_name, email
    from public.identities where id = public.current_identity_id()`;
  const assignments = await tx<AssignmentRow[]>`select
      a.id, a.membership_id, a.customer_id, c.name as customer_name,
      a.organizer_id, o.name as organizer_name, a.unit_id, u.name as unit_name,
      a.function, a.valid_from::text, a.valid_to::text, a.ended_at,
      m.status as membership_status
    from public.access_assignments a
    join public.memberships m on m.id = a.membership_id
    join public.customers c on c.id = a.customer_id
    left join public.organizers o on o.id = a.organizer_id
    left join public.school_units u on u.id = a.unit_id
    where m.identity_id = public.current_identity_id()
    order by c.name, o.name, a.function, a.id`;
  if (!identities[0]) return null;
  return { identity: identities[0], assignments };
}

export async function GET(request: Request): Promise<Response> {
  const corr = correlationId();
  try {
    const current = await readSession(request, corr);
    if (!current) throw new Deny('no_session', 401);
    if (current.session.revokedAt) throw new Deny('session_revoked', 401);
    const now = new Date();
    if (
      new Date(current.session.expiresAt).getTime() <= now.getTime() ||
      new Date(current.session.absoluteExpiresAt).getTime() <= now.getTime()
    ) {
      throw new Deny('session_expired', 401);
    }
    const loaded = await withLoginPhase(corr, async (tx) =>
      loadSessionView(tx, current.session.id, current.session.identityId),
    );
    if (!loaded) throw new Deny('session_revoked', 401);
    const today = todayInStockholm(now);
    const assignments = loaded.assignments.map(view);
    const grouped = selectableAssignments(assignments, today);
    const selected = current.session.assignmentId
      ? assignments.find((item) => item.id === current.session.assignmentId)
      : undefined;
    const selectedState = selected ? assignmentState(selected, today) : null;
    const proof = hasMfaProof(
      {
        issuer: current.session.proofIssuer,
        clientId: current.session.proofClientId,
        audience: current.session.proofAudience,
        profileId: current.session.proofProfileId,
        profileVersion: current.session.proofProfileVersion,
        acr: current.session.acr,
        amr: current.session.amr,
        authTime: current.session.authTime,
        checkedAt: current.session.proofCheckedAt,
      },
      localTrustProfile(serverEnv()),
      now,
    );
    const response = json(
      {
        identity: {
          issuer: loaded.identity.issuer,
          subject: loaded.identity.subject,
          displayName: loaded.identity.display_name,
          email: loaded.identity.email,
        },
        assignments: assignments.map((item) => ({
          ...item,
          state: assignmentState(item, today),
          label: contextLabel(item),
          blocked: item.membershipStatus === 'blocked',
        })),
        assignmentGroups: grouped,
        context: selected
          ? {
              assignmentId: selected.id,
              membershipId: selected.membershipId,
              customerId: selected.customerId,
              customerName: selected.customerName,
              organizerId: selected.organizerId,
              organizerName: selected.organizerName,
              unitId: selected.unitId,
              unitName: selected.unitName,
              function: selected.function,
              label: contextLabel(selected),
              blocked: selected.membershipStatus === 'blocked',
              valid: selected.membershipStatus === 'active' && selectedState === 'giltigt',
            }
          : null,
        memberships: Array.from(
          new Map(
            assignments.map((item) => [
              item.membershipId,
              {
                id: item.membershipId,
                customerId: item.customerId,
                customerName: item.customerName,
                status: item.membershipStatus,
              },
            ]),
          ).values(),
        ),
        today,
        mfa: {
          acr: current.session.acr,
          amr: current.session.amr,
          authTime: current.session.authTime
            ? new Date(current.session.authTime).toISOString()
            : null,
          proof,
        },
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
  } catch (error) {
    return denyResponse(error, request, corr, 'session');
  }
}
