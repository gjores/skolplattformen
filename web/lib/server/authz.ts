import { requiresAudit } from './audit-details.ts';
import { legacyAppRole } from '../access-rules.ts';
import type { AccessFunction } from '../access-rules.ts';
import { epochChanged } from '../access-rules.ts';
import type { MfaClaims, ProofAssessment } from '../auth-assurance.ts';
import { assessAdminProof, hasMfaProof } from '../auth-assurance.ts';
import {
  Deny,
  type LiveSession,
  type SessionContext,
  type Tx,
  withLoginPhase,
  withSessionContext,
} from './db.ts';
import { serverEnv } from './env.ts';
import type { EventInput } from './events.ts';
import { logDenied, logError, logEvent } from './events.ts';
import { assertSameOrigin, correlationId, fail, json } from './http.ts';
import { localTrustProfile } from './identity-provider.ts';
import { readSession } from './session.ts';

export type Context = SessionContext & {
  epoch: number;
  mfa: MfaClaims;
  proofAssessment?: ProofAssessment;
  request: Request;
};

type HintRow = {
  auth_user_id: string | null;
  function: AccessFunction | null;
  organizer_id: string | null;
  unit_id: string | null;
};

function sessionInvalid(session: {
  revokedAt: Date | null;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}): Deny | null {
  if (session.revokedAt) return new Deny('session_revoked', 401);
  const now = Date.now();
  if (
    new Date(session.expiresAt).getTime() <= now ||
    new Date(session.absoluteExpiresAt).getTime() <= now
  ) {
    return new Deny('session_expired', 401);
  }
  return null;
}

export async function requireContext(request: Request, corr: string): Promise<Context> {
  const current = await readSession(request, corr);
  if (!current) throw new Deny('no_session', 401);
  const invalid = sessionInvalid(current.session);
  if (invalid) throw invalid;
  if (!current.session.membershipId || !current.session.assignmentId) {
    throw new Deny('no_context', 403);
  }
  const hint = await withLoginPhase(corr, async (tx) => {
    const rows = await tx<HintRow[]>`select i.auth_user_id, a.function, a.organizer_id, a.unit_id
      from public.app_sessions s
      join public.identities i on i.id = s.identity_id
      left join public.access_assignments a on a.id = s.assignment_id
      where s.id = ${current.session.id} and s.identity_id = ${current.session.identityId}`;
    return rows[0] ?? null;
  });
  if (!hint) throw new Deny('session_revoked', 401);
  const accessFunction = hint.function;
  const appRole = legacyAppRole(accessFunction);
  return {
    sessionId: current.session.id,
    identityId: current.session.identityId,
    membershipId: current.session.membershipId,
    customerId: current.session.customerId,
    assignmentId: current.session.assignmentId,
    identity: {
      issuer: current.session.issuer,
      subject: current.session.subject,
      authUserId: hint.auth_user_id,
    },
    accessFunction,
    organizerId: hint.organizer_id,
    unitId: hint.unit_id,
    appRole,
    correlationId: corr,
    epoch: current.session.epoch,
    mfa: {
      issuer: current.session.proofIssuer,
      clientId: current.session.proofClientId,
      audience: current.session.proofAudience,
      profileId: current.session.proofProfileId,
      profileVersion: current.session.proofProfileVersion,
      acr: current.session.acr,
      amr: current.session.amr,
      authTime: current.session.authTime,
      checkedAt: current.session.proofCheckedAt,
    },
    request,
  };
}

export function requireMfa(ctx: Context): void {
  const policy = localTrustProfile(serverEnv());
  const now = new Date();
  ctx.proofAssessment = assessAdminProof(ctx.mfa, policy, now);
  if (!hasMfaProof(ctx.mfa, policy, now)) throw new Deny('mfa_required', 403);
}

export function requireFunction(ctx: Context, allowed: AccessFunction[]): void {
  if (!ctx.accessFunction || !allowed.includes(ctx.accessFunction)) {
    throw new Deny('forbidden', 403);
  }
}

export function requireSameOrigin(request: Request): void {
  if (!assertSameOrigin(request)) throw new Deny('csrf', 403);
}

export async function denyResponse(
  error: unknown,
  request: Request,
  corr: string,
  action: string,
  ctxHint?: Partial<SessionContext> & { proofAssessment?: ProofAssessment },
): Promise<Response> {
  if (error instanceof Deny) {
    try {
      await logDenied({ code: error.code, action, corr, request, ctx: ctxHint });
      return fail(error.code, error.status, corr, error.details);
    } catch (logError) {
      console.error(
        'deny audit',
        corr,
        logError instanceof Error ? logError.constructor.name : 'UnknownError',
      );
      return fail('bad_request', 500, corr);
    }
  }
  console.error('protected route', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
  try {
    await logError({ code: 'internal_error', action, corr, request, ctx: ctxHint });
  } catch (logError) {
    console.error(
      'error audit',
      corr,
      logError instanceof Error ? logError.constructor.name : 'UnknownError',
    );
  }
  return fail('bad_request', 500, corr);
}

type ProtectedResult = {
  status?: number;
  body?: unknown;
  response?: Response;
  event?: EventInput | null;
};

function contextFromLive(live: LiveSession, request: Request): Context {
  return { ...live, request };
}

function responseFromResult(result: ProtectedResult, corr: string, epoch: number): Response {
  if (!result.response) {
    return json(result.body ?? null, {
      status: result.status ?? 200,
      correlationId: corr,
      epoch,
    });
  }
  const headers = new Headers(result.response.headers);
  headers.set('X-Correlation-Id', corr);
  headers.set('X-Context-Epoch', String(epoch));
  headers.set('Cache-Control', 'no-store');
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
}

export async function protectedRoute(
  request: Request,
  action: string,
  opts: { mutating: boolean; mfa?: boolean; functions?: AccessFunction[]; audit?: 'required' },
  handler: (ctx: Context, tx: Tx, live: LiveSession) => Promise<ProtectedResult>,
): Promise<Response> {
  const corr = correlationId();
  let ctx: Context | undefined;
  try {
    if (opts.mutating) requireSameOrigin(request);
    ctx = await requireContext(request, corr);
    const result = await withSessionContext(ctx, async (tx, live) => {
      ctx = contextFromLive(live, request);
      const epochHeader = request.headers.get('X-Context-Epoch');
      const requestedEpoch = epochHeader === null ? null : Number(epochHeader);
      if (
        (epochHeader !== null && !Number.isInteger(requestedEpoch)) ||
        epochChanged(requestedEpoch, live.epoch)
      ) {
        throw new Deny('context_changed', 409);
      }
      if (opts.functions) requireFunction(ctx, opts.functions);
      if (opts.mfa) requireMfa(ctx);
      const handled = await handler(ctx, tx, live);
      if (requiresAudit(opts.mutating, opts.audit) && !handled.event) {
        throw new Error('Skyddad route saknar obligatorisk säkerhetshändelse');
      }
      if (handled.event) {
        await logEvent(tx, ctx, { ...handled.event, outcome: 'ok' });
      }
      return { handled, epoch: live.epoch };
    });
    return responseFromResult(result.handled, corr, result.epoch);
  } catch (error) {
    return denyResponse(error, request, corr, action, ctx);
  }
}
