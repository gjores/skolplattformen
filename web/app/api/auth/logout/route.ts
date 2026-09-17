import { serverEnv } from '../../../../lib/server/env.ts';
import { assertSameOrigin, correlationId, fail, json } from '../../../../lib/server/http.ts';
import { endSessionUrl } from '../../../../lib/server/oidc.ts';
import { logEvent } from '../../../../lib/server/events.ts';
import { clearSessionCookie, readSession, revokeSession } from '../../../../lib/server/session.ts';

export async function GET(_request: Request): Promise<Response> {
  const corr = correlationId();
  return fail('bad_request', 405, corr);
}

export async function POST(request: Request): Promise<Response> {
  const corr = correlationId();
  if (!assertSameOrigin(request)) return fail('csrf', 403, corr);
  const current = await readSession(request, corr);
  if (current) {
    await revokeSession(corr, current.session.id, async (tx, ctx) => {
      await logEvent(tx, { ...ctx, request }, { action: 'logout', outcome: 'ok' });
    });
  }
  let redirect = serverEnv().OIDC_POST_LOGOUT_REDIRECT_URI;
  try {
    redirect = (await endSessionUrl(current?.session.idTokenHint ?? null)).href;
  } catch (error) {
    console.error('auth/logout idp', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
  }
  const response = json({ redirect, correlationId: corr }, { correlationId: corr });
  response.headers.append('Set-Cookie', clearSessionCookie(request));
  return response;
}
