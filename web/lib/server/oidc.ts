import * as client from 'openid-client';
import { localTrustProfile } from './identity-provider.ts';
import { serverEnv } from './env.ts';

let configPromise: Promise<client.Configuration> | null = null;

export function oidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const env = serverEnv();
    configPromise = client
      .discovery(
        new URL(env.OIDC_ISSUER),
        env.OIDC_CLIENT_ID,
        undefined,
        client.ClientSecretPost(env.OIDC_CLIENT_SECRET),
        env.OIDC_ISSUER.startsWith('http://')
          ? {
              // oxlint-disable-next-line typescript/no-deprecated -- endast den låsta lokala testutfärdaren använder HTTP
              execute: [client.allowInsecureRequests],
            }
          : undefined,
      )
      .catch((error: unknown) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

export type StepUpBinding = {
  sessionId: string;
  identityId: string;
  issuer: string;
  subject: string;
  customerId: string | null;
  membershipId: string | null;
  assignmentId: string | null;
  epoch: number;
};

export type LoginState = {
  codeVerifier: string;
  state: string;
  nonce: string;
  stepUp: boolean;
  binding: StepUpBinding | null;
  returnTo: string;
  createdAt: number;
};

export async function beginAuthorization(opts: {
  stepUp: boolean;
  binding: StepUpBinding | null;
  returnTo: string;
}): Promise<{ url: URL; state: LoginState }> {
  const env = serverEnv();
  const config = await oidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: env.OIDC_REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    // Varje inloggning begär nivå 2 (frivilligt acr-anspråk). Test-IdP:ns flöde frågar
    // då efter engångskod endast om kontot har en registrerad kod; övriga loggar in
    // med lösenord och får nivå 1. Servern prövar beviset oförändrat (hasMfaProof).
    acr_values: env.MFA_ACR_VALUES,
    // Step-up kräver ny autentisering även om IdP-sessionen redan har nivå 2.
    ...(opts.stepUp ? { prompt: 'login', max_age: '0' } : {}),
  });
  return {
    url,
    state: {
      codeVerifier,
      state,
      nonce,
      stepUp: opts.stepUp,
      binding: opts.binding,
      returnTo: opts.returnTo,
      createdAt: Date.now(),
    },
  };
}

export type IdentityClaims = {
  issuer: string;
  subject: string;
  clientId: string;
  audience: string[];
  profileId: string;
  profileVersion: number;
  checkedAt: Date;
  acr: string | null;
  amr: string[];
  authTime: Date | null;
  email: string | null;
  displayName: string | null;
  idToken: string;
};

function stringArray(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Ogiltigt ${name}-anspråk`);
  }
  return value;
}

function audience(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return stringArray(value, 'aud');
}

export async function completeAuthorization(
  currentUrl: URL,
  state: LoginState,
): Promise<IdentityClaims> {
  const env = serverEnv();
  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: state.codeVerifier,
    expectedState: state.state,
    expectedNonce: state.nonce,
  });
  const claims = tokens.claims();
  if (!claims || !tokens.id_token || typeof claims.iss !== 'string' || typeof claims.sub !== 'string') {
    throw new Error('ID-token saknar nödvändiga anspråk');
  }
  const profile = localTrustProfile(env);
  const tokenAudience = audience(claims.aud);
  if (
    claims.iss !== profile.issuer ||
    tokenAudience.length !== 1 ||
    tokenAudience[0] !== profile.clientId
  ) {
    throw new Error('ID-token matchar inte lokal tillitsprofil');
  }
  const tokenClientId = typeof claims.azp === 'string' ? claims.azp : tokenAudience[0];
  if (tokenClientId !== profile.clientId) throw new Error('ID-token har fel klient');
  const tokenAmr = stringArray(claims.amr, 'amr');
  return {
    issuer: claims.iss,
    subject: claims.sub,
    clientId: tokenClientId,
    audience: tokenAudience,
    profileId: profile.id,
    profileVersion: profile.version,
    checkedAt: new Date(),
    acr: typeof claims.acr === 'string' ? claims.acr : null,
    amr: tokenAmr,
    authTime: typeof claims.auth_time === 'number' ? new Date(claims.auth_time * 1000) : null,
    email: typeof claims.email === 'string' ? claims.email : null,
    displayName:
      typeof claims.name === 'string'
        ? claims.name
        : typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : null,
    idToken: tokens.id_token,
  };
}

export async function endSessionUrl(idTokenHint: string | null): Promise<URL> {
  const env = serverEnv();
  const config = await oidcConfig();
  return client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: env.OIDC_POST_LOGOUT_REDIRECT_URI,
    ...(idTokenHint ? { id_token_hint: idTokenHint } : { client_id: env.OIDC_CLIENT_ID }),
  });
}
