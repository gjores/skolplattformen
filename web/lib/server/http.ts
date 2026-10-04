export type ErrorCode =
  | 'no_session'
  | 'session_expired'
  | 'session_revoked'
  | 'no_context'
  | 'membership_blocked'
  | 'customer_closed'
  | 'mfa_required'
  | 'forbidden'
  | 'assignment_expired'
  | 'assignment_ended'
  | 'assignment_upcoming'
  | 'invitation_invalid'
  | 'conflict'
  | 'context_changed'
  | 'registry_unavailable'
  | 'db_unreachable'
  | 'csrf'
  | 'idp_registration_failed'
  | 'login_state_invalid'
  | 'not_found'
  | 'bad_request'
  | 'audit_unavailable'
  | 'programplan_locked'
  | 'programplan_in_use'
  | 'programplan_start_passed';

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

export function fail(
  code: ErrorCode,
  status: number,
  corr: string,
  details?: Record<string, unknown>,
): Response {
  return json(
    { code, correlationId: corr, ...(details ? { details } : {}) },
    { status, correlationId: corr },
  );
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

export async function clientIpHash(request: Request): Promise<Uint8Array | null> {
  // CF-Connecting-IP är bara betrodd när Cloudflare också har märkt begäran.
  // Godtyckligt X-Forwarded-For från klienten får aldrig påverka spärrnyckeln.
  const cloudflareIp = request.headers.get('CF-Ray')
    ? request.headers.get('CF-Connecting-IP')
    : null;
  const source = cloudflareIp?.trim() || 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return new Uint8Array(digest);
}
