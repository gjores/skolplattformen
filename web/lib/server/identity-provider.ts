import type { ServerEnv } from './env.ts';
import type { IdentityClaims } from './oidc.ts';

type IdentityProviderEnv = Pick<
  ServerEnv,
  | 'OIDC_ISSUER'
  | 'OIDC_CLIENT_ID'
  | 'SUPABASE_URL'
  | 'SUPABASE_ANON_KEY'
  | 'MFA_MAX_AGE_SECONDS'
>;

export type LocalTrustProfile = {
  id: 'local-keycloak-admin';
  version: number;
  issuer: string;
  clientId: string;
  audience: string[];
  acceptedClaims: { acr: string | null; amr: string[] }[];
  maxAgeSeconds: number;
};

type AdapterDependencies = {
  env: IdentityProviderEnv;
  fetch: typeof fetch;
};

const LOCAL_ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
const LOCAL_CLIENT_ID = 'skolplattform-worker';

export function localTrustProfile(env: IdentityProviderEnv): LocalTrustProfile {
  if (
    env.OIDC_ISSUER !== LOCAL_ISSUER ||
    env.OIDC_CLIENT_ID !== LOCAL_CLIENT_ID ||
    Number(env.MFA_MAX_AGE_SECONDS) !== 28_800
  ) {
    throw new Error('Okänd lokal identitetsprofil');
  }
  return {
    id: 'local-keycloak-admin',
    version: 1,
    issuer: LOCAL_ISSUER,
    clientId: LOCAL_CLIENT_ID,
    audience: [LOCAL_CLIENT_ID],
    acceptedClaims: [{ acr: '2', amr: ['pwd', 'otp'] }],
    maxAgeSeconds: 28_800,
  };
}

export function validateIdentityClaims(claims: IdentityClaims, profile: LocalTrustProfile): void {
  if (
    claims.issuer !== profile.issuer ||
    claims.clientId !== profile.clientId ||
    claims.profileId !== profile.id ||
    claims.profileVersion !== profile.version ||
    claims.audience.length !== profile.audience.length ||
    !claims.audience.every((audience, index) => audience === profile.audience[index]) ||
    !Array.isArray(claims.amr) ||
    !claims.amr.every((method) => typeof method === 'string')
  ) {
    throw new Error('Identitetsbeviset matchar inte den lokala profilen');
  }
}

async function dependencies(input?: AdapterDependencies): Promise<AdapterDependencies> {
  if (input) return input;
  const { serverEnv } = await import('./env.ts');
  return { env: serverEnv(), fetch };
}

export async function registerVerifiedIdentity(
  claims: IdentityClaims,
  input?: AdapterDependencies,
): Promise<{ authUserId: string }> {
  const deps = await dependencies(input);
  validateIdentityClaims(claims, localTrustProfile(deps.env));
  const response = await deps.fetch(
    `${deps.env.SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
    {
      method: 'POST',
      headers: {
        apikey: deps.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: 'keycloak', id_token: claims.idToken }),
    },
  );
  if (!response.ok) throw new Error('Identitetsregistreringen nekades');
  const payload = (await response.json()) as { user?: { id?: unknown } };
  if (typeof payload.user?.id !== 'string' || payload.user.id.length === 0) {
    throw new Error('Identitetsregistreringen saknar användar-ID');
  }
  return { authUserId: payload.user.id };
}
