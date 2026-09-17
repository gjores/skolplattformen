import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAdminProof, hasMfaProof } from './auth-assurance.ts';

const now = new Date('2026-09-13T12:00:00Z');
const policy = {
  id: 'local-keycloak-admin',
  version: 1,
  issuer: 'http://host.docker.internal:8180/realms/skolplattform-test',
  clientId: 'skolplattform-worker',
  audience: ['skolplattform-worker'],
  acceptedClaims: [{ acr: '2', amr: ['pwd', 'otp'] }],
  maxAgeSeconds: 28_800,
};

function claims(overrides = {}) {
  return {
    issuer: policy.issuer,
    clientId: policy.clientId,
    audience: [...policy.audience],
    profileId: policy.id,
    profileVersion: policy.version,
    acr: '2',
    amr: ['pwd', 'otp'],
    authTime: new Date('2026-09-13T11:59:00Z'),
    checkedAt: new Date('2026-09-13T11:59:01Z'),
    ...overrides,
  };
}

test('exakt lokal profil med färsk TOTP godkänns', () => {
  assert.equal(hasMfaProof(claims(), policy, now), true);
});

test('vanlig lösenordsinloggning räknas aldrig som administrativ MFA', () => {
  assert.equal(hasMfaProof(claims({ acr: '1', amr: ['pwd'] }), policy, now), false);
});

test('samma TOTP-anspråk från annan utfärdare nekas', () => {
  assert.equal(hasMfaProof(claims({ issuer: 'https://annan.example' }), policy, now), false);
});

test('fel klient nekas', () => {
  assert.equal(hasMfaProof(claims({ clientId: 'annan-klient' }), policy, now), false);
});

test('fel audience nekas även med acr 2 och otp', () => {
  assert.equal(hasMfaProof(claims({ audience: ['annan-klient'] }), policy, now), false);
});

test('okänd profil och profilversion nekas', () => {
  assert.equal(hasMfaProof(claims({ profileId: 'annan-profil' }), policy, now), false);
  assert.equal(hasMfaProof(claims({ profileVersion: 2 }), policy, now), false);
});

test('okänd eller extra autentiseringsmetod nekas', () => {
  assert.equal(hasMfaProof(claims({ amr: ['pwd', 'otp', 'sms'] }), policy, now), false);
  assert.equal(hasMfaProof(claims({ amr: ['otp'] }), policy, now), false);
});

test('saknad autentiseringstid eller proveniens nekas', () => {
  assert.equal(hasMfaProof(claims({ authTime: null }), policy, now), false);
  assert.equal(hasMfaProof(claims({ checkedAt: null }), policy, now), false);
});

test('framtida och ogiltig autentiseringstid nekas', () => {
  assert.equal(hasMfaProof(claims({ authTime: new Date('2026-09-13T12:00:01Z') }), policy, now), false);
  assert.equal(hasMfaProof(claims({ authTime: new Date(Number.NaN) }), policy, now), false);
});

test('för gammal autentiseringstid nekas och gränsvärdet godkänns', () => {
  assert.equal(hasMfaProof(claims({ authTime: new Date('2026-09-13T03:59:59Z') }), policy, now), false);
  assert.equal(hasMfaProof(claims({ authTime: new Date('2026-09-13T04:00:00Z') }), policy, now), true);
});

test('framtida eller ogiltig kontrolltid nekas', () => {
  assert.equal(hasMfaProof(claims({ checkedAt: new Date('2026-09-13T12:00:01Z') }), policy, now), false);
  assert.equal(hasMfaProof(claims({ checkedAt: new Date(Number.NaN) }), policy, now), false);
});

test('bedömningen minimerar proveniens och håller identitet och underskrift okända', () => {
  assert.deepEqual(assessAdminProof(claims(), policy, now), {
    policyId: 'local-keycloak-admin',
    policyVersion: 1,
    profileId: 'local-keycloak-admin',
    profileVersion: 1,
    issuer: policy.issuer,
    method: 'local-totp',
    authTime: '2026-09-13T11:59:00.000Z',
    checkedAt: '2026-09-13T12:00:00.000Z',
    result: 'accepted',
    identityAssurance: 'unknown',
    signature: 'unknown',
  });
});

test('nekad bedömning markerar okänd metod utan att upphöja identiteten', () => {
  const result = assessAdminProof(claims({ acr: '1', amr: ['pwd'] }), policy, now);
  assert.equal(result.result, 'denied');
  assert.equal(result.method, 'unknown');
  assert.equal(result.identityAssurance, 'unknown');
  assert.equal(result.signature, 'unknown');
});
