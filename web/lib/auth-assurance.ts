export type MfaClaims = {
  issuer: string | null;
  clientId: string | null;
  audience: string[];
  profileId: string | null;
  profileVersion: number | null;
  acr: string | null;
  amr: string[];
  authTime: Date | null;
  checkedAt: Date | null;
};

export type MfaPolicy = {
  id: 'local-keycloak-admin';
  version: number;
  issuer: string;
  clientId: string;
  audience: string[];
  acceptedClaims: { acr: string | null; amr: string[] }[];
  maxAgeSeconds: number;
};

function exactStringSet(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length || expectedSet.size !== expected.length) return false;
  return expected.every((value) => actualSet.has(value));
}

function validDate(value: Date | null): value is Date {
  return value !== null && Number.isFinite(value.getTime());
}

export function hasMfaProof(claims: MfaClaims, policy: MfaPolicy, now: Date): boolean {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(policy.maxAgeSeconds) || policy.maxAgeSeconds < 0) {
    return false;
  }
  if (
    claims.issuer !== policy.issuer ||
    claims.clientId !== policy.clientId ||
    claims.profileId !== policy.id ||
    claims.profileVersion !== policy.version ||
    !exactStringSet(claims.audience, policy.audience) ||
    !validDate(claims.authTime) ||
    !validDate(claims.checkedAt)
  ) {
    return false;
  }

  const authTimeMs = claims.authTime.getTime();
  const checkedAtMs = claims.checkedAt.getTime();
  const ageMs = nowMs - authTimeMs;
  if (
    ageMs < 0 ||
    ageMs > policy.maxAgeSeconds * 1000 ||
    checkedAtMs < authTimeMs ||
    checkedAtMs > nowMs
  ) {
    return false;
  }

  return policy.acceptedClaims.some(
    (accepted) =>
      claims.acr === accepted.acr && exactStringSet(claims.amr, accepted.amr),
  );
}

export type ProofAssessment = {
  policyId: string;
  policyVersion: number;
  profileId: string | null;
  profileVersion: number | null;
  issuer: string | null;
  method: 'local-totp' | 'unknown';
  authTime: string | null;
  checkedAt: string;
  result: 'accepted' | 'denied';
  identityAssurance: 'unknown';
  signature: 'unknown';
};

export function assessAdminProof(
  claims: MfaClaims,
  policy: MfaPolicy,
  now: Date,
): ProofAssessment {
  const accepted = hasMfaProof(claims, policy, now);
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    profileId: claims.profileId,
    profileVersion: claims.profileVersion,
    issuer: claims.issuer,
    method: accepted ? 'local-totp' : 'unknown',
    authTime: validDate(claims.authTime) ? claims.authTime.toISOString() : null,
    checkedAt: Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString(),
    result: accepted ? 'accepted' : 'denied',
    identityAssurance: 'unknown',
    signature: 'unknown',
  };
}
