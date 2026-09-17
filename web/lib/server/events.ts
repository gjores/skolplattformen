import type { ProofAssessment } from '../auth-assurance.ts';
import type { SessionContext, Tx } from './db.ts';
import { withLoginPhase } from './db.ts';
import { clientIpHash } from './http.ts';

export type EventInput = {
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  details?: Record<string, unknown>;
};

type EventContext = SessionContext & {
  request?: Request;
  proofAssessment?: ProofAssessment;
};

const SAFE_DETAIL_KEYS = new Set([
  'action',
  'assignmentId',
  'authTime',
  'checkedAt',
  'code',
  'count',
  'emailMismatch',
  'format',
  'from',
  'grants',
  'identityAssurance',
  'issuer',
  'key',
  'method',
  'organizerId',
  'path',
  'policyId',
  'policyVersion',
  'principalNamed',
  'profileId',
  'profileVersion',
  'proof',
  'reason',
  'result',
  'revokedSessions',
  'signature',
  'sourceCorrelationId',
  'status',
  'stepUp',
  'to',
]);

const FORBIDDEN_DETAIL_KEYS = new Set(['token', 'cookie', 'password', 'id_token', 'email']);

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeValue);
  if (typeof value !== 'object') return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key.toLowerCase()) || !SAFE_DETAIL_KEYS.has(key)) continue;
    const safe = sanitizeValue(nested);
    if (safe !== undefined) clean[key] = safe;
  }
  return clean;
}

function proofDetails(proof: ProofAssessment, corr: string): Record<string, unknown> {
  return {
    policyId: proof.policyId,
    policyVersion: proof.policyVersion,
    profileId: proof.profileId,
    profileVersion: proof.profileVersion,
    issuer: proof.issuer,
    method: proof.method,
    authTime: proof.authTime,
    checkedAt: proof.checkedAt,
    result: proof.result,
    identityAssurance: proof.identityAssurance,
    signature: proof.signature,
    sourceCorrelationId: corr,
  };
}

function eventDetails(
  details: Record<string, unknown> | undefined,
  proof: ProofAssessment | undefined,
  corr: string,
): Record<string, unknown> {
  const source = { ...details };
  delete source.proof;
  const clean = (sanitizeValue(source) ?? {}) as Record<string, unknown>;
  if (proof) clean.proof = proofDetails(proof, corr);
  return clean;
}

async function insertEvent(
  tx: Tx,
  ctx: Partial<SessionContext> & { request?: Request; proofAssessment?: ProofAssessment },
  event: EventInput & { outcome: 'ok' | 'denied' | 'error' },
  ipHash?: Uint8Array | null,
): Promise<void> {
  const details = eventDetails(event.details, ctx.proofAssessment, ctx.correlationId ?? '');
  const hash = ipHash === undefined && ctx.request ? await clientIpHash(ctx.request) : (ipHash ?? null);
  await tx`insert into public.security_events
    (correlation_id, source, actor_identity_id, actor_issuer, actor_subject,
     session_id, membership_id, assignment_id, customer_id, action,
     object_type, object_id, outcome, details, ip_hash)
    values (${ctx.correlationId}, 'worker', ${ctx.identityId ?? null}, ${ctx.identity?.issuer ?? null},
      ${ctx.identity?.subject ?? null}, ${ctx.sessionId ?? null}, ${ctx.membershipId ?? null},
      ${ctx.assignmentId ?? null}, ${ctx.customerId ?? null}, ${event.action},
      ${event.objectType ?? null}, ${event.objectId ?? null}, ${event.outcome},
      ${JSON.stringify(details)}::jsonb, ${hash})`;
}

export async function logEvent(
  tx: Tx,
  ctx: EventContext,
  event: EventInput & { outcome: 'ok' | 'denied' | 'error' },
): Promise<void> {
  await insertEvent(tx, ctx, event);
}

export const DENIAL_LIMIT_PER_MINUTE = 20;

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function denialKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

export async function logDenied(input: {
  code: string;
  action: string;
  corr: string;
  request: Request;
  ctx?: Partial<SessionContext> & { proofAssessment?: ProofAssessment };
}): Promise<void> {
  const ipHash = await clientIpHash(input.request);
  const routeClass = new URL(input.request.url).pathname.split('/').slice(0, 4).join('/');
  const key = await denialKey(
    `${input.ctx?.identityId ?? 'anon'}|${ipHash ? hex(ipHash) : 'none'}|${routeClass}`,
  );
  await withLoginPhase(input.corr, async (tx) => {
    const buckets = await tx<{ count: number; bucket_start: Date }[]>`insert into public.denial_buckets
      (bucket_start, key, count)
      values (date_trunc('minute', now()), ${key}, 1)
      on conflict (bucket_start, key) do update
      set count = public.denial_buckets.count + 1
      returning count, bucket_start`;
    const bucket = buckets[0];
    const ctx = { ...input.ctx, correlationId: input.corr, request: input.request };
    if (bucket.count <= DENIAL_LIMIT_PER_MINUTE) {
      await insertEvent(
        tx,
        ctx,
        {
          action: input.action,
          outcome: 'denied',
          details: { code: input.code, path: routeClass },
        },
        ipHash,
      );
    } else if (bucket.count === DENIAL_LIMIT_PER_MINUTE + 1) {
      await insertEvent(
        tx,
        ctx,
        {
          action: 'denied_suppressed',
          outcome: 'denied',
          details: { key, from: new Date(bucket.bucket_start).toISOString() },
        },
        ipHash,
      );
    }
  });
}
