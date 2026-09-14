import type { Tx } from './db.ts';
import { Deny, withLoginPhase } from './db.ts';
import { isHttps, serverEnv } from './env.ts';
import type { IdentityClaims, LoginState, StepUpBinding } from './oidc.ts';

export const SESSION_COOKIE = 'sp_session';
export const LOGIN_COOKIE = 'sp_login';

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try {
      cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // En felkodad cookie behandlas som saknad.
    }
  }
  return cookies;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; path: string; secure: boolean; sameSite: 'Lax' },
): string {
  // Alla fas 2-cookies använder SameSite=Lax; OIDC-callbacken kräver det.
  return `${name}=${encodeURIComponent(value)}; Path=${options.path}; Max-Age=${Math.max(0, Math.floor(options.maxAge))}; HttpOnly; SameSite=${options.sameSite}${options.secure ? '; Secure' : ''}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function newSessionToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function tokenHash(token: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return new Uint8Array(digest);
}

async function loginKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serverEnv().SESSION_SECRET),
  );
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealLoginState(state: LoginState): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await loginKey(),
    new TextEncoder().encode(JSON.stringify(state)),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return base64Url(combined);
}

export async function openLoginState(sealed: string): Promise<LoginState | null> {
  try {
    const combined = fromBase64Url(sealed);
    if (combined.length <= 12) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12) },
      await loginKey(),
      combined.slice(12),
    );
    const state = JSON.parse(new TextDecoder().decode(plain)) as LoginState;
    if (!Number.isFinite(state.createdAt) || Date.now() - state.createdAt > 600_000) return null;
    return state;
  } catch {
    return null;
  }
}

export type SessionRow = {
  id: string;
  identityId: string;
  issuer: string;
  subject: string;
  membershipId: string | null;
  customerId: string | null;
  assignmentId: string | null;
  epoch: number;
  acr: string | null;
  amr: string[];
  authTime: Date | null;
  proofIssuer: string | null;
  proofClientId: string | null;
  proofAudience: string[];
  proofProfileId: string | null;
  proofProfileVersion: number | null;
  proofCheckedAt: Date | null;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  idTokenHint: string | null;
};

type RawSession = {
  id: string;
  identity_id: string;
  issuer: string;
  subject: string;
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
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  id_token_hint: string | null;
};

export async function readSession(
  request: Request,
  corr: string,
): Promise<{ token: string; session: SessionRow } | null> {
  const token = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE];
  if (!token) return null;
  const hash = await tokenHash(token);
  const session = await withLoginPhase(corr, async (tx) => {
    const rows = await tx<RawSession[]>`select s.*, i.issuer, i.subject
      from public.app_sessions s
      join public.identities i on i.id = s.identity_id
      where s.token_hash = ${hash}
      limit 1`;
    const row = rows[0];
    if (!row) return null;
    await tx`select set_config('app.identity_id', ${row.identity_id}, true)`;
    let customerId: string | null = null;
    if (row.membership_id) {
      const memberships = await tx<{ customer_id: string }[]>`select customer_id
        from public.memberships
        where id = ${row.membership_id} and identity_id = ${row.identity_id}`;
      if (!memberships[0]) return null;
      customerId = memberships[0].customer_id;
    }
    return {
      id: row.id,
      identityId: row.identity_id,
      issuer: row.issuer,
      subject: row.subject,
      membershipId: row.membership_id,
      customerId,
      assignmentId: row.assignment_id,
      epoch: row.context_epoch,
      acr: row.acr,
      amr: row.amr,
      authTime: row.auth_time,
      proofIssuer: row.proof_issuer,
      proofClientId: row.proof_client_id,
      proofAudience: row.proof_audience,
      proofProfileId: row.proof_profile_id,
      proofProfileVersion: row.proof_profile_version,
      proofCheckedAt: row.proof_checked_at,
      expiresAt: row.expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at,
      idTokenHint: row.id_token_hint,
    } satisfies SessionRow;
  });
  return session ? { token, session } : null;
}

export async function createSession(
  tx: Tx,
  input: {
    identityId: string;
    membershipId: string | null;
    claims: IdentityClaims;
    idleSeconds: number;
    absoluteSeconds: number;
  },
): Promise<{ token: string; id: string }> {
  const token = newSessionToken();
  const hash = await tokenHash(token);
  const rows = await tx<{ id: string }[]>`insert into public.app_sessions
    (token_hash, identity_id, membership_id, acr, amr, auth_time,
     proof_issuer, proof_client_id, proof_audience, proof_profile_id,
     proof_profile_version, proof_checked_at, id_token_hint, expires_at, absolute_expires_at)
    values (${hash}, ${input.identityId}, ${input.membershipId}, ${input.claims.acr},
      ${input.claims.amr}, ${input.claims.authTime}, ${input.claims.issuer},
      ${input.claims.clientId}, ${input.claims.audience}, ${input.claims.profileId},
      ${input.claims.profileVersion}, ${input.claims.checkedAt}, ${input.claims.idToken},
      now() + make_interval(secs => ${input.idleSeconds}),
      now() + make_interval(secs => ${input.absoluteSeconds}))
    returning id`;
  return { token, id: rows[0].id };
}

export async function refreshMfa(
  tx: Tx,
  binding: StepUpBinding,
  claims: IdentityClaims,
): Promise<void> {
  const rows = await tx<{
    id: string;
    identity_id: string;
    issuer: string;
    subject: string;
    membership_id: string | null;
    assignment_id: string | null;
    customer_id: string | null;
    context_epoch: number;
    status: 'active' | 'blocked' | null;
    closed_at: Date | null;
    expires_at: Date;
    absolute_expires_at: Date;
    revoked_at: Date | null;
  }[]>`select s.id, s.identity_id, i.issuer, i.subject, s.membership_id,
      s.assignment_id, m.customer_id, s.context_epoch, m.status, c.closed_at,
      s.expires_at, s.absolute_expires_at, s.revoked_at
    from public.app_sessions s
    join public.identities i on i.id = s.identity_id
    left join public.memberships m on m.id = s.membership_id
    left join public.customers c on c.id = m.customer_id
    where s.id = ${binding.sessionId}
    for update of s`;
  const row = rows[0];
  const now = Date.now();
  if (
    !row ||
    row.revoked_at ||
    new Date(row.expires_at).getTime() <= now ||
    new Date(row.absolute_expires_at).getTime() <= now ||
    row.status === 'blocked' ||
    row.closed_at ||
    row.id !== binding.sessionId ||
    row.identity_id !== binding.identityId ||
    row.issuer !== binding.issuer ||
    row.subject !== binding.subject ||
    claims.issuer !== binding.issuer ||
    claims.subject !== binding.subject ||
    row.membership_id !== binding.membershipId ||
    row.customer_id !== binding.customerId ||
    row.assignment_id !== binding.assignmentId ||
    row.context_epoch !== binding.epoch
  ) {
    throw new Deny('session_revoked', 401);
  }
  await tx`update public.app_sessions set
      acr = ${claims.acr}, amr = ${claims.amr}, auth_time = ${claims.authTime},
      proof_issuer = ${claims.issuer}, proof_client_id = ${claims.clientId},
      proof_audience = ${claims.audience}, proof_profile_id = ${claims.profileId},
      proof_profile_version = ${claims.profileVersion}, proof_checked_at = ${claims.checkedAt},
      id_token_hint = ${claims.idToken}
    where id = ${binding.sessionId}`;
}

export async function revokeSession(corr: string, sessionId: string): Promise<void> {
  await withLoginPhase(corr, async (tx) => {
    await tx`update public.app_sessions set revoked_at = now()
      where id = ${sessionId} and revoked_at is null`;
  });
}

export function sessionCookie(request: Request, token: string, absoluteExpiresAt?: Date): string {
  const configured = Number(serverEnv().SESSION_ABSOLUTE_SECONDS);
  const remaining = absoluteExpiresAt
    ? Math.max(0, Math.floor((new Date(absoluteExpiresAt).getTime() - Date.now()) / 1000))
    : configured;
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: Math.min(configured, remaining),
    path: '/',
    secure: isHttps(request),
    sameSite: 'Lax',
  });
}

export function clearSessionCookie(request: Request): string {
  // Radering behåller samma sökväg och attribut men använder Max-Age=0.
  return serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    secure: isHttps(request),
    sameSite: 'Lax',
  });
}

export function loginCookie(request: Request, value: string, maxAge = 600): string {
  return serializeCookie(LOGIN_COOKIE, value, {
    maxAge,
    path: '/api/auth',
    secure: isHttps(request),
    sameSite: 'Lax',
  });
}
