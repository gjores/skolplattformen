import {
  invitationIsRedeemable,
  parseGrants,
} from '../../../../lib/invitation-rules.ts';
import { denyResponse, requireMfa, requireSameOrigin, type Context } from '../../../../lib/server/authz.ts';
import { Deny, type SessionContext, withLoginPhase } from '../../../../lib/server/db.ts';
import { logEvent } from '../../../../lib/server/events.ts';
import { correlationId, json } from '../../../../lib/server/http.ts';
import { readSession, tokenHash } from '../../../../lib/server/session.ts';

type LockedSession = {
  id: string;
  identity_id: string;
  issuer: string;
  subject: string;
  auth_user_id: string | null;
  email: string | null;
  membership_id: string | null;
  assignment_id: string | null;
  context_epoch: number;
  acr: string | null;
  amr: string[];
  auth_time: Date | null;
  proof_issuer: string | null;
  proof_client_id: string | null;
  proof_audience: string[];
  proof_profile_id: string | null;
  proof_profile_version: number | null;
  proof_checked_at: Date | null;
};

type InvitationRow = {
  id: string;
  customer_id: string;
  invited_person_name: string;
  expected_issuer: string;
  expected_subject: string;
  expected_email: string | null;
  grants: unknown;
  expires_at: Date;
  used_at: Date | null;
};

function textArray(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    if (value === '{}') return [];
    return value.slice(1, -1).split(',').map((item) => item.replace(/^"|"$/gu, ''));
  }
  throw new Error('Ogiltigt sessionsbevis');
}

function eventContext(ctx: Context): SessionContext & { request: Request; proofAssessment: NonNullable<Context['proofAssessment']> } {
  if (!ctx.proofAssessment) throw new Error('MFA-bedömning saknas');
  return { ...ctx, proofAssessment: ctx.proofAssessment };
}

export async function POST(request: Request): Promise<Response> {
  const corr = correlationId();
  let auditContext: Context | undefined;
  try {
    requireSameOrigin(request);
    const current = await readSession(request, corr);
    if (!current) throw new Deny('no_session', 401);
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    if (!body || typeof body.token !== 'string' || body.token.length !== 43) {
      throw new Deny('bad_request', 400);
    }
    const hash = await tokenHash(body.token);
    const result = await withLoginPhase(corr, async (tx) => {
      await tx`select set_config('app.identity_id', ${current.session.identityId}, true)`;
      const sessions = await tx<LockedSession[]>`select
          s.id, s.identity_id, i.issuer, i.subject, i.auth_user_id, i.email,
          s.membership_id, s.assignment_id, s.context_epoch,
          s.acr, s.amr, s.auth_time, s.proof_issuer, s.proof_client_id,
          s.proof_audience, s.proof_profile_id, s.proof_profile_version, s.proof_checked_at
        from public.app_sessions s
        join public.identities i on i.id = s.identity_id
        where s.id = ${current.session.id}
          and s.identity_id = ${current.session.identityId}
          and s.revoked_at is null
          and s.expires_at > now()
          and s.absolute_expires_at > now()
        for update of s`;
      const session = sessions[0];
      if (!session) throw new Deny('session_revoked', 401);
      auditContext = {
        sessionId: session.id,
        identityId: session.identity_id,
        identity: { issuer: session.issuer, subject: session.subject, authUserId: session.auth_user_id },
        membershipId: session.membership_id,
        customerId: null,
        assignmentId: session.assignment_id,
        accessFunction: null,
        organizerId: null,
        unitId: null,
        appRole: null,
        correlationId: corr,
        epoch: session.context_epoch,
        mfa: {
          issuer: session.proof_issuer,
          clientId: session.proof_client_id,
          audience: textArray(session.proof_audience),
          profileId: session.proof_profile_id,
          profileVersion: session.proof_profile_version,
          acr: session.acr,
          amr: textArray(session.amr),
          authTime: session.auth_time,
          checkedAt: session.proof_checked_at,
        },
        request,
      };
      requireMfa(auditContext);
      const invitations = await tx<InvitationRow[]>`select
          id, customer_id, invited_person_name, expected_issuer, expected_subject,
          expected_email, grants, expires_at, used_at
        from public.invitations
        where token_hash = ${hash}
        for update`;
      const invitation = invitations[0];
      if (!invitation) throw new Deny('invitation_invalid', 404);
      auditContext.customerId = invitation.customer_id;
      if (
        invitationIsRedeemable(
          {
            expiresAt: invitation.expires_at,
            usedAt: invitation.used_at,
            expectedIssuer: invitation.expected_issuer,
            expectedSubject: invitation.expected_subject,
          },
          { now: new Date(), issuer: session.issuer, subject: session.subject },
        ) !== 'ok'
      ) {
        throw new Deny('invitation_invalid', 404);
      }
      await tx`select set_config('app.customer_id', ${invitation.customer_id}, true)`;
      const customers = await tx<{ id: string; name: string }[]>`select id, name
        from public.customers
        where id = ${invitation.customer_id} and closed_at is null`;
      const customer = customers[0];
      if (!customer) throw new Deny('invitation_invalid', 404);
      if (!Array.isArray(invitation.grants)) throw new Error('Ogiltiga grants i inbjudan');
      const grantNames = invitation.grants.map((grant) => {
        if (!grant || typeof grant !== 'object' || typeof (grant as { function?: unknown }).function !== 'string') {
          throw new Error('Ogiltiga grants i inbjudan');
        }
        return (grant as { function: string }).function;
      });
      const grants = parseGrants(grantNames.join(','));
      const memberships = await tx<{ id: string; status: 'active' | 'blocked' }[]>`insert into public.memberships
          (identity_id, customer_id)
        values (${session.identity_id}, ${invitation.customer_id})
        on conflict (identity_id, customer_id) do update set status = public.memberships.status
        returning id, status`;
      const membership = memberships[0];
      if (membership.status === 'blocked') throw new Deny('membership_blocked', 403);
      auditContext.membershipId = membership.id;
      const assignments: { id: string; function: 'kundadmin' | 'granskare' }[] = [];
      for (const grant of grants) {
        const rows = await tx<{ id: string; function: 'kundadmin' | 'granskare' }[]>`insert into public.access_assignments
            (membership_id, customer_id, function, created_by)
          values (${membership.id}, ${invitation.customer_id}, ${grant.function}, null)
          returning id, function`;
        assignments.push(rows[0]);
      }
      await tx`update public.invitations
        set used_at = now(), used_by_identity_id = ${session.identity_id}
        where id = ${invitation.id} and used_at is null`;
      let epoch = session.context_epoch;
      if (session.membership_id === null && session.assignment_id === null) {
        const updated = await tx<{ context_epoch: number }[]>`update public.app_sessions
          set membership_id = ${membership.id},
              assignment_id = ${assignments[0].id},
              context_epoch = context_epoch + 1
          where id = ${session.id}
          returning context_epoch`;
        epoch = updated[0].context_epoch;
      }
      const emailMismatch =
        invitation.expected_email !== null && invitation.expected_email !== session.email;
      await logEvent(tx, eventContext(auditContext), {
        action: 'invitation_redeemed',
        objectType: 'invitation',
        objectId: invitation.id,
        outcome: 'ok',
        details: { grants: grants.map((grant) => grant.function), emailMismatch },
      });
      return {
        membershipId: membership.id,
        assignments,
        customer,
        epoch,
      };
    });
    return json(result, { status: 201, correlationId: corr, epoch: result.epoch });
  } catch (error) {
    return denyResponse(error, request, corr, 'invitation_redeem', auditContext);
  }
}
