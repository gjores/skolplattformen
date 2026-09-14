import { withLoginPhase } from '../../../../lib/server/db.ts';
import { serverEnv } from '../../../../lib/server/env.ts';
import { correlationId, fail } from '../../../../lib/server/http.ts';
import { registerVerifiedIdentity } from '../../../../lib/server/identity-provider.ts';
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

function redirectWithCookies(
  location: string,
  corr: string,
  cookies: string[],
): Response {
  const headers = new Headers({ Location: location, 'X-Correlation-Id': corr, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request): Promise<Response> {
  const corr = correlationId();
  const clearLogin = loginCookie(request, '', 0);
  const sealed = parseCookies(request.headers.get('Cookie'))[LOGIN_COOKIE];
  const state = sealed ? await openLoginState(sealed) : null;
  if (!state) {
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
  let claims;
  try {
    claims = await completeAuthorization(new URL(request.url), state);
  } catch (error) {
    console.error('auth/callback', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
  let registration: { authUserId: string };
  try {
    registration = await registerVerifiedIdentity(claims);
  } catch (error) {
    console.error('auth/callback registration', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
    return redirectWithCookies('/?inloggning=nekad&kod=idp_registration_failed', corr, [clearLogin]);
  }
  try {
    const current = state.stepUp ? await readSession(request, corr) : null;
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
        await refreshMfa(tx, state.binding, claims);
        return { token: current.token, absoluteExpiresAt: current.session.absoluteExpiresAt };
      }
      const active = await tx<{ id: string; customer_id: string }[]>`select m.id, m.customer_id
        from public.memberships m
        join public.customers c on c.id = m.customer_id
        where m.identity_id = ${identityId}
          and m.status = 'active'
          and c.closed_at is null`;
      const membershipId = active.length === 1 ? active[0].id : null;
      const session = await createSession(tx, {
        identityId,
        membershipId,
        claims,
        idleSeconds: Number(serverEnv().SESSION_IDLE_SECONDS),
        absoluteSeconds: Number(serverEnv().SESSION_ABSOLUTE_SECONDS),
      });
      return { token: session.token, absoluteExpiresAt: undefined };
    });
    return redirectWithCookies(state.returnTo, corr, [
      sessionCookie(request, created.token, created.absoluteExpiresAt),
      clearLogin,
    ]);
  } catch (error) {
    console.error('auth/callback session', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
    const response = fail('login_state_invalid', 400, corr);
    response.headers.append('Set-Cookie', clearLogin);
    return response;
  }
}
