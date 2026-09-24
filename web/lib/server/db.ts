import { legacyAppRole } from '../access-rules.ts';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import type { AccessFunction } from '../access-rules.ts';
import { invalidAssignmentCode } from '../access-rules.ts';
import type { MfaClaims } from '../auth-assurance.ts';
import type { ErrorCode } from './http.ts';
import { serverEnv } from './env.ts';

export function sql(): Sql {
  // Workerd binder nät-I/O till en begäran. En klient får därför inte återanvändas
  // från modulscope av en senare begäran.
  return postgres(serverEnv().DATABASE_URL, {
    max: 2,
    fetch_types: false,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export type Tx = TransactionSql<Record<string, unknown>>;

export async function withLoginPhase<T>(corr: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = sql();
  try {
    return (await db.begin(async (tx) => {
      await tx`select set_config('app.phase', 'login', true), set_config('app.correlation_id', ${corr}, true)`;
      return fn(tx as Tx);
    })) as T;
  } finally {
    await db.end({ timeout: 1 });
  }
}

export type SessionContext = {
  sessionId: string;
  identityId: string;
  membershipId: string | null;
  customerId: string | null;
  assignmentId: string | null;
  identity: { issuer: string; subject: string; authUserId: string | null };
  accessFunction: AccessFunction | null;
  organizerId: string | null;
  unitId: string | null;
  appRole: 'huvudman' | 'rektor' | 'administrator' | 'larare' | null;
  correlationId: string;
};

export type LiveSession = SessionContext & {
  epoch: number;
  membershipStatus: 'active' | 'blocked' | null;
  assignmentValid: boolean | null;
  mfa: MfaClaims;
};

export type SessionContextHint = Pick<
  SessionContext,
  'sessionId' | 'identityId' | 'membershipId' | 'customerId' | 'correlationId'
> &
  Partial<Omit<SessionContext, 'sessionId' | 'identityId' | 'membershipId' | 'customerId' | 'correlationId'>>;

export class Deny extends Error {
  constructor(
    public code: ErrorCode,
    public status: 400 | 401 | 403 | 404 | 409 | 503,
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

type SessionRow = {
  id: string;
  identity_id: string;
  issuer: string;
  subject: string;
  auth_user_id: string | null;
  membership_id: string | null;
  assignment_id: string | null;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
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
};

type MembershipRow = {
  id: string;
  customer_id: string;
  status: 'active' | 'blocked';
  closed_at: Date | null;
};

type AssignmentRow = {
  id: string;
  membership_id: string;
  customer_id: string;
  organizer_id: string | null;
  unit_id: string | null;
  function: AccessFunction;
  assignment_valid: boolean;
  valid_from: string;
  valid_to: string | null;
  ended_at: Date | null;
};

function textArray(value: unknown, column: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) {
    throw new Error(`Ogiltig textarray i ${column}`);
  }
  if (value === '{}') return [];
  return value.slice(1, -1).split(',').map((item) => item.replace(/^"|"$/gu, ''));
}


export async function withSessionContext<T>(
  ctx: SessionContextHint,
  fn: (tx: Tx, live: LiveSession) => Promise<T>,
): Promise<T> {
  const db = sql();
  try {
    return (await db.begin(async (rawTx) => {
      const tx = rawTx as Tx;
      await tx`select
      set_config('app.phase', 'login', true),
      set_config('app.identity_id', ${ctx.identityId}, true),
      set_config('app.correlation_id', ${ctx.correlationId}, true)`;
      const rows = await tx<SessionRow[]>`select
        s.id,
        s.identity_id,
        i.issuer,
        i.subject,
        i.auth_user_id,
        s.membership_id,
        s.assignment_id,
        s.expires_at,
        s.absolute_expires_at,
        s.revoked_at,
        s.last_seen_at,
        s.context_epoch,
        s.acr,
        s.amr,
        s.auth_time,
        s.proof_issuer,
        s.proof_client_id,
        s.proof_audience,
        s.proof_profile_id,
        s.proof_profile_version,
        s.proof_checked_at
      from public.app_sessions s
      join public.identities i on i.id = s.identity_id
      where s.id = ${ctx.sessionId}
        and s.identity_id = ${ctx.identityId}
      for update of s`;
      const row = rows[0];
      if (!row || row.revoked_at !== null) throw new Deny('session_revoked', 401);
      const now = Date.now();
      if (new Date(row.expires_at).getTime() <= now || new Date(row.absolute_expires_at).getTime() <= now) {
        throw new Deny('session_expired', 401);
      }
      let membership: MembershipRow | null = null;
      if (row.membership_id) {
        const visibleMemberships = await tx<MembershipRow[]>`select m.id, m.customer_id, m.status, c.closed_at
          from public.memberships m
          join public.customers c on c.id = m.customer_id
          where m.id = ${row.membership_id} and m.identity_id = ${row.identity_id}`;
        const visibleMembership = visibleMemberships[0];
        if (!visibleMembership) throw new Deny('session_revoked', 401);
        // UPDATE-RLS for the lock is customer scoped. Derive the customer only from
        // the identity-owned membership before taking the common session -> membership lock.
        await tx`select set_config('app.customer_id', ${visibleMembership.customer_id}, true)`;
        await tx`select public.phase3_lock_customer(${visibleMembership.customer_id})`;
        const memberships = await tx<MembershipRow[]>`select m.id, m.customer_id, m.status, c.closed_at
          from public.memberships m
          join public.customers c on c.id = m.customer_id
          where m.id = ${row.membership_id}
            and m.identity_id = ${row.identity_id}
            and m.customer_id = ${visibleMembership.customer_id}
          for update of m`;
        membership = memberships[0] ?? null;
        if (!membership) throw new Deny('session_revoked', 401);
        if (membership.status === 'blocked') throw new Deny('membership_blocked', 403);
        if (membership.closed_at !== null) throw new Deny('customer_closed', 403);
      }

      let assignment: AssignmentRow | null = null;
      if (row.assignment_id) {
        const assignments = await tx<AssignmentRow[]>`select
            a.id, a.membership_id, a.customer_id, a.organizer_id, a.unit_id, a.function,
            public.assignment_is_valid(a) as assignment_valid,
            a.valid_from::text, a.valid_to::text, a.ended_at
          from public.access_assignments a
          where a.id = ${row.assignment_id}
          `;
        assignment = assignments[0] ?? null;
        if (
          !assignment ||
          !membership ||
          assignment.membership_id !== membership.id ||
          assignment.customer_id !== membership.customer_id
        ) {
          throw new Deny('session_revoked', 401);
        }
        if (!assignment.assignment_valid) {
          const todayRows = await tx<{ today: string }[]>`select public.app_today()::text as today`;
          const today = todayRows[0].today;
          throw new Deny(invalidAssignmentCode({
            validFrom: assignment.valid_from,
            endedAt: assignment.ended_at,
          }, today), 403);
        }
      }

      const accessFunction = assignment?.function ?? null;
      const appRole = legacyAppRole(accessFunction);
      await tx`select
        set_config('app.phase', '', true),
        set_config('app.identity_id', ${row.identity_id}, true),
        set_config('app.customer_id', ${membership?.customer_id ?? ''}, true),
        set_config('app.membership_id', ${membership?.id ?? ''}, true),
        set_config('app.assignment_id', ${assignment?.id ?? ''}, true),
        set_config('app.access_function', ${accessFunction ?? ''}, true),
        set_config('app.organizer_id', ${assignment?.organizer_id ?? ''}, true),
        set_config('app.app_role', ${appRole ?? ''}, true),
        set_config('app.correlation_id', ${ctx.correlationId}, true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: row.auth_user_id ?? '', role: 'authenticated' })}, true),
        set_config('request.jwt.claim.sub', ${row.auth_user_id ?? ''}, true)`;
      if (now - new Date(row.last_seen_at).getTime() >= 60_000) {
        const idleSeconds = Number(serverEnv().SESSION_IDLE_SECONDS);
        await tx`update public.app_sessions
          set last_seen_at = now(),
              expires_at = least(now() + make_interval(secs => ${idleSeconds}), absolute_expires_at)
          where id = ${ctx.sessionId}`;
      }
      return fn(tx, {
        sessionId: row.id,
        identityId: row.identity_id,
        identity: { issuer: row.issuer, subject: row.subject, authUserId: row.auth_user_id },
        membershipId: membership?.id ?? null,
        customerId: membership?.customer_id ?? null,
        assignmentId: assignment?.id ?? null,
        accessFunction,
        organizerId: assignment?.organizer_id ?? null,
        unitId: assignment?.unit_id ?? null,
        appRole,
        correlationId: ctx.correlationId,
        epoch: row.context_epoch,
        membershipStatus: membership?.status ?? null,
        assignmentValid: assignment?.assignment_valid ?? null,
        mfa: {
          issuer: row.proof_issuer,
          clientId: row.proof_client_id,
          audience: textArray(row.proof_audience, 'app_sessions.proof_audience'),
          profileId: row.proof_profile_id,
          profileVersion: row.proof_profile_version,
          acr: row.acr,
          amr: textArray(row.amr, 'app_sessions.amr'),
          authTime: row.auth_time,
          checkedAt: row.proof_checked_at,
        },
      });
    })) as T;
  } finally {
    await db.end({ timeout: 1 });
  }
}
