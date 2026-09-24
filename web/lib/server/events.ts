import type { ProofAssessment } from '../auth-assurance.ts';
import type { SessionContext, Tx } from './db.ts';
import { withLoginPhase } from './db.ts';
import { clientIpHash } from './http.ts';
import { auditRoute, sanitizeAuditDetails, type AuditJson as SafeJson } from './audit-details.ts';

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

function proofDetails(proof: ProofAssessment, corr: string): Record<string, SafeJson | undefined> {
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
  accessFunction?: SessionContext['accessFunction'],
): Record<string, SafeJson | undefined> {
  const source = { ...details };
  delete source.proof;
  const clean = sanitizeAuditDetails(source) as Record<string, SafeJson | undefined>;
  if (accessFunction) clean.accessFunction = accessFunction;
  if (proof) clean.proof = proofDetails(proof, corr);
  return clean;
}

async function insertEvent(
  tx: Tx,
  ctx: Partial<SessionContext> & { request?: Request; proofAssessment?: ProofAssessment },
  event: EventInput & { outcome: 'ok' | 'denied' | 'error' },
  ipHash?: Uint8Array | null,
): Promise<void> {
  const details = eventDetails(
    event.details,
    ctx.proofAssessment,
    ctx.correlationId ?? '',
    ctx.accessFunction,
  );
  const hash = ipHash === undefined && ctx.request ? await clientIpHash(ctx.request) : (ipHash ?? null);
  await tx`insert into public.security_events
    (correlation_id, source, actor_identity_id, actor_issuer, actor_subject,
     session_id, membership_id, assignment_id, customer_id, action,
     object_type, object_id, outcome, details, ip_hash)
    values (${ctx.correlationId}, 'worker', ${ctx.identityId ?? null}, ${ctx.identity?.issuer ?? null},
      ${ctx.identity?.subject ?? null}, ${ctx.sessionId ?? null}, ${ctx.membershipId ?? null},
      ${ctx.assignmentId ?? null}, ${ctx.customerId ?? null}, ${event.action},
      ${event.objectType ?? null}, ${event.objectId ?? null}, ${event.outcome},
      ${tx.json(details)}, ${hash})`;
}

export async function logEvent(
  tx: Tx,
  ctx: EventContext,
  event: EventInput & { outcome: 'ok' | 'denied' | 'error' },
): Promise<void> {
  await insertEvent(tx, ctx, event);
}

export async function logError(input: {
  code: string;
  action: string;
  corr: string;
  request: Request;
  ctx?: Partial<SessionContext> & { proofAssessment?: ProofAssessment };
}): Promise<void> {
  const routeClass = auditRoute(input.request.url);
  await withLoginPhase(input.corr, async (tx) => {
    await insertEvent(tx, { ...input.ctx, correlationId: input.corr, request: input.request }, {
      action: input.action,
      outcome: 'error',
      details: { code: input.code, path: routeClass },
    });
  });
}

export async function logDenied(input: {
  code: string;
  action: string;
  corr: string;
  request: Request;
  ctx?: Partial<SessionContext> & { proofAssessment?: ProofAssessment };
}): Promise<void> {
  const ipHash = await clientIpHash(input.request);
  const routeClass = auditRoute(input.request.url);
  await withLoginPhase(input.corr, async (tx) => {
    await insertEvent(tx, { ...input.ctx, correlationId: input.corr, request: input.request }, {
      action: input.action,
      outcome: 'denied',
      details: { code: input.code, path: routeClass },
    }, ipHash);
  });
}
