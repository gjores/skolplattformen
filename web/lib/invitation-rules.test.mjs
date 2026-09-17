import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  invitationIsRedeemable,
  newInvitationToken,
  parseGrants,
  tokenHashHex,
  ttlToExpiry,
} from './invitation-rules.ts';

test('32 slumpbytes blir 43 tecken base64url utan utfyllnad', () => {
  const token = newInvitationToken(Uint8Array.from({ length: 32 }, (_, index) => index));
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(token, /=/u);
});

test('annan längd än 32 bytes vägras', () => {
  assert.throws(() => newInvitationToken(new Uint8Array(31)), /32 bytes/u);
});

test('tokenhash är sha256 av tokenens UTF-8-bytes', async () => {
  assert.equal(
    await tokenHashHex('räksmörgås'),
    'a91ea42775fa7f3be25f8fc344f9eecb2d745a79f942f1641664728b61dd35b6',
  );
});

test('giltig oanvänd inbjudan med exakt issuer och subject kan lösas in', () => {
  assert.equal(
    invitationIsRedeemable(
      { expiresAt: new Date('2026-09-18T00:00:00Z'), usedAt: null, expectedIssuer: 'issuer', expectedSubject: 'subject' },
      { now: new Date('2026-09-17T00:00:00Z'), issuer: 'issuer', subject: 'subject' },
    ),
    'ok',
  );
});

test('använd inbjudan klassas använd även om den också har gått ut', () => {
  assert.equal(
    invitationIsRedeemable(
      { expiresAt: new Date('2026-09-16T00:00:00Z'), usedAt: new Date('2026-09-15T00:00:00Z'), expectedIssuer: 'issuer', expectedSubject: 'subject' },
      { now: new Date('2026-09-17T00:00:00Z'), issuer: 'issuer', subject: 'subject' },
    ),
    'used',
  );
});

test('inbjudan är utgången exakt vid expiresAt', () => {
  assert.equal(
    invitationIsRedeemable(
      { expiresAt: new Date('2026-09-17T00:00:00Z'), usedAt: null, expectedIssuer: 'issuer', expectedSubject: 'subject' },
      { now: new Date('2026-09-17T00:00:00Z'), issuer: 'issuer', subject: 'subject' },
    ),
    'expired',
  );
});

test('fel issuer nekas', () => {
  assert.equal(
    invitationIsRedeemable(
      { expiresAt: new Date('2026-09-18T00:00:00Z'), usedAt: null, expectedIssuer: 'issuer', expectedSubject: 'subject' },
      { now: new Date('2026-09-17T00:00:00Z'), issuer: 'other', subject: 'subject' },
    ),
    'issuer_mismatch',
  );
});

test('fel subject nekas även med samma issuer', () => {
  assert.equal(
    invitationIsRedeemable(
      { expiresAt: new Date('2026-09-18T00:00:00Z'), usedAt: null, expectedIssuer: 'issuer', expectedSubject: 'subject' },
      { now: new Date('2026-09-17T00:00:00Z'), issuer: 'issuer', subject: 'other' },
    ),
    'subject_mismatch',
  );
});

test('kundadmin kan delas ut ensam', () => {
  assert.deepEqual(parseGrants('kundadmin'), [{ function: 'kundadmin' }]);
});

test('kundadmin och granskare kan delas ut tillsammans', () => {
  assert.deepEqual(parseGrants('kundadmin,granskare'), [{ function: 'kundadmin' }, { function: 'granskare' }]);
});

test('tom eller otillåten grant vägras', () => {
  assert.throws(() => parseGrants(''), /kundadmin eller granskare/u);
  assert.throws(() => parseGrants('larare'), /kundadmin eller granskare/u);
});

test('ttl stöder minuter, timmar och dagar', () => {
  const now = new Date('2026-09-17T00:00:00Z');
  assert.equal(ttlToExpiry('30m', now).toISOString(), '2026-09-17T00:30:00.000Z');
  assert.equal(ttlToExpiry('72h', now).toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(ttlToExpiry('3d', now).toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(ttlToExpiry('0s', now).toISOString(), now.toISOString());
});

test('ttl vägrar okänd enhet, negativ tid och mer än 30 dagar', () => {
  const now = new Date('2026-09-17T00:00:00Z');
  assert.throws(() => ttlToExpiry('x', now), /giltighetstid/u);
  assert.throws(() => ttlToExpiry('-1h', now), /giltighetstid/u);
  assert.throws(() => ttlToExpiry('31d', now), /30 dagar/u);
});
