import { legacyAppRole } from '../../../../lib/access-rules.ts';
import type { AccessFunction } from '../../../../lib/access-rules.ts';
import { assessAdminProof } from '../../../../lib/auth-assurance.ts';
import type { SessionContext } from '../../../../lib/server/db.ts';
import { withLoginPhase } from '../../../../lib/server/db.ts';
import { serverEnv } from '../../../../lib/server/env.ts';
import { logDenied, logEvent } from '../../../../lib/server/events.ts';
import { correlationId, fail } from '../../../../lib/server/http.ts';
import {
  localTrustProfile,
  registerVerifiedIdentity,
} from '../../../../lib/server/identity-provider.ts';
import { completeAuthorization } from '../../../../lib/server/oidc.ts';
import {
  createSession,
  LOGIN_COOKIE,
  loginCookie,
  openLoginState,
  parseCookies,
  readSession,
  refreshMfa,
  sessionCookie,
} from '../../../../lib/server/session.ts';

/** Step-up gav inget bevis med engångskod: kontot saknar registrerad kod hos IdP:n. */
class StepUpWithoutOtp extends Error {}

function withNotice(returnTo: string, notice: string): string {
  const url = new URL(returnTo, 'http://app.invalid');
  url.searchParams.set('verifiering', notice);
  return url.pathname + url.search + url.hash;
}

function redirectWithCookies(location: string, corr: string, cookies: string[]): Response {
  const headers = new Headers({
    Location: location,
    'X-Correlation-Id': corr,
    'Cache-Control': 'no-store',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}


export async function GET(request: Request): Promise<Response> {
  const corr = correlationId();
  const clearLogin = loginCookie(request, '', 0);
  const sealed = parseCookies(request.headers.get('Cookie'))[LOGIN_COOKIE];
  const state = sealed ? await openLoginState(sealed) : null;
  if (!state) {
    await logDenied({ code: 'login_state_invalid', action: 'login', corr, request });
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
  let claims;
  try {
    claims = await completeAuthorization(new URL(request.url), state);
  } catch (error) {
    console.error(
      'auth/callback',
      corr,
      error instanceof Error ? error.constructor.name : 'UnknownError',
    );
    await logDenied({ code: 'login_state_invalid', action: 'login', corr, request });
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
  let registration: { authUserId: string };
  try {
    registration = await registerVerifiedIdentity(claims);
  } catch (error) {
    console.error(
      'auth/callback registration',
      corr,
      error instanceof Error ? error.constructor.name : 'UnknownError',
    );
    await logDenied({ code: 'idp_registration_failed', action: 'login', corr, request });
    return redirectWithCookies('/?inloggning=nekad&kod=idp_registration_failed', corr, [clearLogin]);
  }

  let current: Awaited<ReturnType<typeof readSession>> = null;
  const proofAssessment = assessAdminProof(claims, localTrustProfile(serverEnv()), new Date());
  try {
    current = state.stepUp ? await readSession(request, corr) : null;
    const created = await withLoginPhase(corr, async (tx) => {
      const identities = await tx<{ id: string }[]>`insert into public.identities
          (issuer, subject, auth_user_id, display_name, email, last_login_at)
        values (${claims.issuer}, ${claims.subject}, ${registration.authUserId},
          ${claims.displayName}, ${claims.email}, now())
        on conflict (issuer, subject) do update set
          auth_user_id = excluded.auth_user_id,
          display_name = excluded.display_name,
          email = excluded.email,
          last_login_at = now()
        returning id`;
      const identityId = identities[0].id;
      await tx`select set_config('app.identity_id', ${identityId}, true)`;

      if (state.stepUp) {
        if (
          !state.binding ||
          !current ||
          current.session.id !== state.binding.sessionId ||
          current.session.identityId !== state.binding.identityId
        ) {
          throw new Error('Step-up-sessionen har ändrats');
        }
        if (proofAssessment.result !== 'accepted') {
          // Konton utan registrerad engångskod loggar in med lösenord även vid
          // step-up (IdP:n tvingar inte fram registrering). Beviset godtas inte.
          if (!claims.amr.includes('otp')) throw new StepUpWithoutOtp('Step-up utan engångskod');
          throw new Error('Step-up saknar godkänt MFA-bevis');
        }
        const active = current;
        await refreshMfa(tx, state.binding, claims);
        const ctx: SessionContext = {
          sessionId: active.session.id,
          identityId: active.session.identityId,
          identity: {
            issuer: active.session.issuer,
            subject: active.session.subject,
            authUserId: registration.authUserId,
          },
          membershipId: active.session.membershipId,
          customerId: active.session.customerId,
          assignmentId: active.session.assignmentId,
          accessFunction: null,
          organizerId: null,
          unitId: null,
          appRole: null,
          correlationId: corr,
        };
        await logEvent(tx, { ...ctx, request, proofAssessment }, {
          action: 'login',
          outcome: 'ok',
          details: { stepUp: true },
        });
        return { token: active.token, absoluteExpiresAt: active.session.absoluteExpiresAt };
      }

      const active = await tx<{
        id: string;
        membership_id: string;
        customer_id: string;
        function: AccessFunction;
        organizer_id: string | null;
        unit_id: string | null;
      }[]>`select a.id, a.membership_id, a.customer_id, a.function, a.organizer_id, a.unit_id
        from public.access_assignments a
        join public.memberships m on m.id = a.membership_id
        join public.customers c on c.id = m.customer_id
        where m.identity_id = ${identityId}
          and m.status = 'active'
          and c.closed_at is null
          and public.assignment_is_valid(a)`;
      const selected = active.length === 1 ? active[0] : null;
      const session = await createSession(tx, {
        identityId,
        membershipId: selected?.membership_id ?? null,
        assignmentId: selected?.id ?? null,
        claims,
        idleSeconds: Number(serverEnv().SESSION_IDLE_SECONDS),
        absoluteSeconds: Number(serverEnv().SESSION_ABSOLUTE_SECONDS),
      });
      const ctx: SessionContext = {
        sessionId: session.id,
        identityId,
        identity: {
          issuer: claims.issuer,
          subject: claims.subject,
          authUserId: registration.authUserId,
        },
        membershipId: selected?.membership_id ?? null,
        customerId: selected?.customer_id ?? null,
        assignmentId: selected?.id ?? null,
        accessFunction: selected?.function ?? null,
        organizerId: selected?.organizer_id ?? null,
        unitId: selected?.unit_id ?? null,
        appRole: legacyAppRole(selected?.function ?? null),
        correlationId: corr,
      };
      await logEvent(tx, { ...ctx, request, proofAssessment }, {
        action: 'login',
        outcome: 'ok',
        details: { stepUp: false },
      });
      return { token: session.token, absoluteExpiresAt: undefined };
    });
    return redirectWithCookies(state.returnTo, corr, [
      sessionCookie(request, created.token, created.absoluteExpiresAt),
      clearLogin,
    ]);
  } catch (error) {
    console.error(
      'auth/callback session',
      corr,
      error instanceof Error ? error.constructor.name : 'UnknownError',
    );
    const deniedProof = { ...proofAssessment, result: 'denied' as const, method: 'unknown' as const };
    await logDenied({
      code: state.stepUp ? 'step_up_failed' : 'login_state_invalid',
      action: 'login',
      corr,
      request,
      ctx: current
        ? {
            sessionId: current.session.id,
            identityId: current.session.identityId,
            identity: {
              issuer: current.session.issuer,
              subject: current.session.subject,
              authUserId: registration.authUserId,
            },
            membershipId: current.session.membershipId,
            customerId: current.session.customerId,
            assignmentId: current.session.assignmentId,
            proofAssessment: deniedProof,
          }
        : { proofAssessment: deniedProof },
    });
    if (error instanceof StepUpWithoutOtp) {
      // Sessionen är oförändrad (inget nytt bevis); användaren får ett begripligt besked.
      return redirectWithCookies(withNotice(state.returnTo, 'saknar-engangskod'), corr, [clearLogin]);
    }
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
}
