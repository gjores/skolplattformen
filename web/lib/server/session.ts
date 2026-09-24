import { legacyAppRole } from '../access-rules.ts';
import type { SessionContext, Tx } from './db.ts';
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
  amr: unknown;
  auth_time: Date | null;
  proof_issuer: string | null;
  proof_client_id: string | null;
  proof_audience: unknown;
  proof_profile_id: string | null;
  proof_profile_version: number | null;
  proof_checked_at: Date | null;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  id_token_hint: string | null;
};

function textArray(value: unknown, column: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) {
    throw new Error(`Ogiltig textarray i ${column}`);
  }
  if (value === '{}') return [];
  const items: string[] = [];
  let item = '';
  let quoted = false;
  let escaped = false;
  for (const char of value.slice(1, -1)) {
    if (escaped) {
      item += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      items.push(item);
      item = '';
    } else {
      item += char;
    }
  }
  if (quoted || escaped) throw new Error(`Ogiltig textarray i ${column}`);
  items.push(item);
  return items;
}

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
      amr: textArray(row.amr, 'app_sessions.amr'),
      authTime: row.auth_time,
      proofIssuer: row.proof_issuer,
      proofClientId: row.proof_client_id,
      proofAudience: textArray(row.proof_audience, 'app_sessions.proof_audience'),
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
    assignmentId: string | null;
    claims: IdentityClaims;
    idleSeconds: number;
    absoluteSeconds: number;
  },
): Promise<{ token: string; id: string }> {
  const token = newSessionToken();
  const hash = await tokenHash(token);
  const rows = await tx<{ id: string }[]>`insert into public.app_sessions
    (token_hash, identity_id, membership_id, assignment_id, acr, amr, auth_time,
     proof_issuer, proof_client_id, proof_audience, proof_profile_id,
     proof_profile_version, proof_checked_at, id_token_hint, expires_at, absolute_expires_at)
    values (${hash}, ${input.identityId}, ${input.membershipId}, ${input.assignmentId}, ${input.claims.acr},
      array(select jsonb_array_elements_text(${tx.json(input.claims.amr)})), ${input.claims.authTime}, ${input.claims.issuer},
      ${input.claims.clientId}, array(select jsonb_array_elements_text(${tx.json(input.claims.audience)})), ${input.claims.profileId},
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
  type LockedContext = {
    membership_id: string;
    customer_id: string;
    status: 'active' | 'blocked';
    closed_at: Date | null;
    assignment_id: string;
    assignment_membership_id: string;
    assignment_customer_id: string;
    assignment_valid: boolean;
  };
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
    assignment_membership_id: string | null;
    assignment_customer_id: string | null;
    assignment_valid: boolean | null;
    expires_at: Date;
    absolute_expires_at: Date;
    revoked_at: Date | null;
  }[]>`select s.id, s.identity_id, i.issuer, i.subject, s.membership_id,
      s.assignment_id, m.customer_id, s.context_epoch, m.status, c.closed_at,
      a.membership_id as assignment_membership_id,
      a.customer_id as assignment_customer_id,
      case when a.id is null then null else public.assignment_is_valid(a) end as assignment_valid,
      s.expires_at, s.absolute_expires_at, s.revoked_at
    from public.app_sessions s
    join public.identities i on i.id = s.identity_id
    left join public.memberships m on m.id = s.membership_id
    left join public.customers c on c.id = m.customer_id
    left join public.access_assignments a on a.id = s.assignment_id
    where s.id = ${binding.sessionId}
    for update of s`;
  const row = rows[0];
  const now = Date.now();
  let lockedContext: LockedContext | null = null;
  if (row?.membership_id && row.assignment_id && row.customer_id) {
    // The session row is already locked. Its identity-owned membership supplies
    // the customer RLS scope; the second statement locks and revalidates both rows.
    await tx`select set_config('app.customer_id', ${row.customer_id}, true)`;
    await tx`select public.phase3_lock_customer(${row.customer_id})`;
    const contexts = await tx<LockedContext[]>`select
        m.id as membership_id, m.customer_id, m.status, c.closed_at,
        a.id as assignment_id, a.membership_id as assignment_membership_id,
        a.customer_id as assignment_customer_id,
        public.assignment_is_valid(a) as assignment_valid
      from public.memberships m
      join public.customers c on c.id = m.customer_id
      join public.access_assignments a on a.id = ${row.assignment_id}
      where m.id = ${row.membership_id}
        and m.identity_id = ${row.identity_id}
        and m.customer_id = ${row.customer_id}
        and a.membership_id = m.id
        and a.customer_id = m.customer_id
      for update of m`;
    lockedContext = contexts[0] ?? null;
  }
  const nullContext =
    row?.membership_id === null &&
    row.assignment_id === null &&
    row.customer_id === null &&
    binding.membershipId === null &&
    binding.assignmentId === null &&
    binding.customerId === null;
  const validContext =
    lockedContext !== null &&
    lockedContext.status === 'active' &&
    lockedContext.closed_at === null &&
    lockedContext.assignment_valid === true &&
    lockedContext.membership_id === row?.membership_id &&
    lockedContext.customer_id === row.customer_id &&
    lockedContext.assignment_id === row.assignment_id &&
    lockedContext.assignment_membership_id === row.membership_id &&
    lockedContext.assignment_customer_id === row.customer_id;
  if (
    !row ||
    row.revoked_at ||
    new Date(row.expires_at).getTime() <= now ||
    new Date(row.absolute_expires_at).getTime() <= now ||
    (!nullContext && !validContext) ||
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
      acr = ${claims.acr}, amr = array(select jsonb_array_elements_text(${tx.json(claims.amr)})), auth_time = ${claims.authTime},
      proof_issuer = ${claims.issuer}, proof_client_id = ${claims.clientId},
      proof_audience = array(select jsonb_array_elements_text(${tx.json(claims.audience)})), proof_profile_id = ${claims.profileId},
      proof_profile_version = ${claims.profileVersion}, proof_checked_at = ${claims.checkedAt},
      id_token_hint = ${claims.idToken}
    where id = ${binding.sessionId}`;
}

export async function revokeSession(
  corr: string,
  sessionId: string,
  onRevoked?: (tx: Tx, ctx: SessionContext) => Promise<void>,
): Promise<void> {
  await withLoginPhase(corr, async (tx) => {
    const rows = await tx<{
      id: string;
      identity_id: string;
      issuer: string;
      subject: string;
      auth_user_id: string | null;
      membership_id: string | null;
      assignment_id: string | null;
    }[]>`select s.id, s.identity_id, i.issuer, i.subject, i.auth_user_id,
        s.membership_id, s.assignment_id
      from public.app_sessions s
      join public.identities i on i.id = s.identity_id
      where s.id = ${sessionId}
      for update of s`;
    const row = rows[0];
    if (!row) return;
    await tx`select set_config('app.identity_id', ${row.identity_id}, true)`;
    let customerId: string | null = null;
    let assignment: {
      function: SessionContext['accessFunction'];
      organizer_id: string | null;
      unit_id: string | null;
    } | null = null;
    if (row.membership_id) {
      const visible = await tx<{ customer_id: string }[]>`select customer_id
        from public.memberships
        where id = ${row.membership_id} and identity_id = ${row.identity_id}`;
      customerId = visible[0]?.customer_id ?? null;
      if (customerId) {
        await tx`select set_config('app.customer_id', ${customerId}, true)`;
        const contexts = await tx<{
          function: SessionContext['accessFunction'];
          organizer_id: string | null;
          unit_id: string | null;
        }[]>`select a.function, a.organizer_id, a.unit_id
          from public.memberships m
          join public.access_assignments a on a.id = ${row.assignment_id}
          where m.id = ${row.membership_id}
            and m.identity_id = ${row.identity_id}
            and m.customer_id = ${customerId}
            and a.membership_id = m.id
            and a.customer_id = m.customer_id
          for update of m`;
        assignment = contexts[0] ?? null;
      }
    }
    await tx`update public.app_sessions set revoked_at = now()
      where id = ${sessionId} and revoked_at is null`;
    const appRole = legacyAppRole(assignment?.function ?? null);
    if (onRevoked) {
      await onRevoked(tx, {
        sessionId: row.id,
        identityId: row.identity_id,
        identity: {
          issuer: row.issuer,
          subject: row.subject,
          authUserId: row.auth_user_id,
        },
        membershipId: row.membership_id,
        customerId,
        assignmentId: row.assignment_id,
        accessFunction: assignment?.function ?? null,
        organizerId: assignment?.organizer_id ?? null,
        unitId: assignment?.unit_id ?? null,
        appRole,
        correlationId: corr,
      });
    }
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
