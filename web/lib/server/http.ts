export type ErrorCode =
  | 'no_session'
  | 'session_expired'
  | 'session_revoked'
  | 'no_context'
  | 'membership_blocked'
  | 'customer_closed'
  | 'db_unreachable'
  | 'csrf'
  | 'idp_registration_failed'
  | 'login_state_invalid'
  | 'not_found'
  | 'bad_request';

export function correlationId(): string {
  return crypto.randomUUID();
}

export function json(
  body: unknown,
  init: { status?: number; correlationId: string; epoch?: number },
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Correlation-Id': init.correlationId,
    'Cache-Control': 'no-store',
  });
  if (init.epoch !== undefined) headers.set('X-Context-Epoch', String(init.epoch));
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function fail(code: ErrorCode, status: number, corr: string): Response {
  return json({ code, correlationId: corr }, { status, correlationId: corr });
}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (origin !== null) {
    if (origin !== new URL(request.url).origin) return false;
    return fetchSite !== 'cross-site' && fetchSite !== 'same-site' && fetchSite !== 'none';
  }
  return fetchSite === 'same-origin';
}
