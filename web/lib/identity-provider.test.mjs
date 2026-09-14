import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  localTrustProfile,
  registerVerifiedIdentity,
  validateIdentityClaims,
} from './server/identity-provider.ts';

const env = {
  OIDC_ISSUER: 'http://host.docker.internal:8180/realms/skolplattform-test',
  OIDC_CLIENT_ID: 'skolplattform-worker',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'syntetisk-testnyckel',
  MFA_MAX_AGE_SECONDS: '28800',
};

const claims = (subject = 'subject-a', email = 'samma@example.test') => ({
  issuer: env.OIDC_ISSUER,
  subject,
  clientId: env.OIDC_CLIENT_ID,
  audience: [env.OIDC_CLIENT_ID],
  profileId: 'local-keycloak-admin',
  profileVersion: 1,
  checkedAt: new Date('2026-09-14T12:00:00Z'),
  acr: '2',
  amr: ['pwd', 'otp'],
  authTime: new Date('2026-09-14T11:59:00Z'),
  email,
  displayName: 'Testperson',
  idToken: `syntetisk-token-${subject}`,
});

test('den lokala tillitsprofilen har ett stabilt versionsbundet kontrakt', () => {
  assert.deepEqual(localTrustProfile(env), {
    id: 'local-keycloak-admin',
    version: 1,
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    audience: [env.OIDC_CLIENT_ID],
    acceptedClaims: [{ acr: '2', amr: ['pwd', 'otp'] }],
    maxAgeSeconds: 28800,
  });
});

test('fel issuer, audience, klient, profil och malformed AMR avvisas', () => {
  const profile = localTrustProfile(env);
  for (const changed of [
    { ...claims(), issuer: 'https://annan.example' },
    { ...claims(), audience: ['annan-klient'] },
    { ...claims(), clientId: 'annan-klient' },
    { ...claims(), profileVersion: 2 },
    { ...claims(), amr: ['pwd', 7] },
  ]) {
    assert.throws(() => validateIdentityClaims(changed, profile));
  }
});

test('registreringsfel stänger inloggningen', async () => {
  await assert.rejects(
    registerVerifiedIdentity(claims(), {
      env,
      fetch: async () => new Response('{"error":"nekad"}', { status: 400 }),
    }),
  );
});

test('samma e-post ger fortsatt två issuer+subject-bundna registreringar', async () => {
  const requests = [];
  const transport = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json({ user: { id: `auth-user-${requests.length}` } });
  };
  const first = await registerVerifiedIdentity(claims('subject-a'), { env, fetch: transport });
  const second = await registerVerifiedIdentity(claims('subject-b'), { env, fetch: transport });
  assert.notEqual(first.authUserId, second.authUserId);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /grant_type=id_token/u);
  assert.equal(requests[0].body.provider, 'keycloak');
  assert.notEqual(requests[0].body.id_token, requests[1].body.id_token);
});
