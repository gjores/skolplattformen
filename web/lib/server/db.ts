import postgres, { type Sql, type TransactionSql } from 'postgres';
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
  correlationId: string;
};

export type LiveSession = {
  epoch: number;
  membershipStatus: 'active' | 'blocked' | null;
};

export class Deny extends Error {
  constructor(
    public code:
      | 'session_expired'
      | 'session_revoked'
      | 'membership_blocked'
      | 'customer_closed'
      | 'no_context',
    public status: 401 | 403,
  ) {
    super(code);
  }
}

type LiveRow = {
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
  context_epoch: number;
  membership_status: 'active' | 'blocked' | null;
  closed_at: Date | null;
};

export async function withSessionContext<T>(
  ctx: SessionContext,
  fn: (tx: Tx, live: LiveSession) => Promise<T>,
): Promise<T> {
  const db = sql();
  try {
    return (await db.begin(async (rawTx) => {
      const tx = rawTx as Tx;
      await tx`select
      set_config('app.identity_id', ${ctx.identityId}, true),
      set_config('app.customer_id', ${ctx.customerId ?? ''}, true),
      set_config('app.membership_id', ${ctx.membershipId ?? ''}, true),
      set_config('app.correlation_id', ${ctx.correlationId}, true)`;
      const rows = await tx<LiveRow[]>`select
        s.expires_at,
        s.absolute_expires_at,
        s.revoked_at,
        s.last_seen_at,
        s.context_epoch,
        m.status as membership_status,
        c.closed_at
      from public.app_sessions s
      left join public.memberships m on m.id = s.membership_id
      left join public.customers c on c.id = m.customer_id
      where s.id = ${ctx.sessionId}
        and s.identity_id = ${ctx.identityId}
        and s.membership_id is not distinct from ${ctx.membershipId}
        and m.customer_id is not distinct from ${ctx.customerId}
      for update of s`;
      const row = rows[0];
      if (!row || row.revoked_at !== null) throw new Deny('session_revoked', 401);
      const now = Date.now();
      if (new Date(row.expires_at).getTime() <= now || new Date(row.absolute_expires_at).getTime() <= now) {
        throw new Deny('session_expired', 401);
      }
      if (row.membership_status === 'blocked') throw new Deny('membership_blocked', 403);
      if (row.closed_at !== null) throw new Deny('customer_closed', 403);
      if (now - new Date(row.last_seen_at).getTime() >= 60_000) {
        const idleSeconds = Number(serverEnv().SESSION_IDLE_SECONDS);
        await tx`update public.app_sessions
          set last_seen_at = now(),
              expires_at = least(now() + make_interval(secs => ${idleSeconds}), absolute_expires_at)
          where id = ${ctx.sessionId}`;
      }
      return fn(tx, { epoch: row.context_epoch, membershipStatus: row.membership_status });
    })) as T;
  } finally {
    await db.end({ timeout: 1 });
  }
}
