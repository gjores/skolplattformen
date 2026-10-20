import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMandatePayload,
  isLocalMandateTarget,
  currentMandateDecision,
} from './mandates.ts';
const id = '33000000-0000-4000-8000-000000000001';
const payload = () => ({
  membershipId: id,
  function: 'larare',
  unitIds: [id],
  scopeKind: 'group',
  groups: [{ id, kind: 'teaching' }],
  validFrom: '2026-09-24',
});
test('mandat tar explicit mottagare och scope, ger inga klientstyrda actorfält', () => {
  assert.equal(parseMandatePayload(payload()).groups[0].kind, 'teaching');
  for (const key of [
    'customerId',
    'parentAssignmentId',
    'approvedByAssignmentId',
    'issuedByAssignmentId',
    'profileId',
  ])
    assert.throws(() => parseMandatePayload({ ...payload(), [key]: id }));
});
test('felaktiga eller dubbla scope-ID:n och okända roller nekas', () => {
  for (const change of [
    { unitIds: [id, id] },
    { unitIds: ['bad'] },
    { groups: [{ id, kind: 'all' }] },
    { function: 'huvudman' },
    { function: 'it' },
    { membershipId: null },
    { groups: [{ id, kind: 'teaching', actor: id }] },
  ])
    assert.throws(() => parseMandatePayload({ ...payload(), ...change }));
});
test('syntetisk profil kräver båda lokala protected-portarna', () => {
  assert.equal(
    isLocalMandateTarget(
      'postgres://x@127.0.0.1:56322/postgres',
      'http://127.0.0.1:56321',
    ),
    true,
  );
  for (const [db, api] of [
    ['postgres://x@remote:56322/postgres', 'http://127.0.0.1:56321'],
    ['postgres://x@127.0.0.1:54322/postgres', 'http://127.0.0.1:56321'],
    ['postgres://x@127.0.0.1:56322/postgres', 'https://remote'],
    ['bad', 'bad'],
  ])
    assert.equal(isLocalMandateTarget(db, api), false);
});
test('separat lokal auth kräver exakt tillfälligt databasnamn och loopback', () => {
  const db = 'postgres://x@127.0.0.1:56322/named_timplan_' + 'a'.repeat(32);
  assert.equal(isLocalMandateTarget(db, 'http://127.0.0.1:56331'), true);
  for (const [target, api] of [
    [db.replace('a'.repeat(32), 'a'.repeat(31)), 'http://127.0.0.1:56331'],
    [db.replace(/named_timplan_.+$/u, 'postgres'), 'http://127.0.0.1:56331'],
    [db, 'http://localhost:56331'],
    [db.replace('127.0.0.1', 'remote'), 'http://127.0.0.1:56331'],
    [db, 'http://127.0.0.1:56332'],
  ]) assert.equal(isLocalMandateTarget(target, api), false);
});
test('serveradapter nekar när transaktionens mandatkontext saknas', async () => {
  assert.equal(
    (
      await currentMandateDecision(
        async () => [],
        { action: 'pupil.read' },
        true,
      )
    ).allowed,
    false,
  );
});

test('SQL-fel översätts utan att databasdetaljer röjs', async () => {
  const { mandateSqlFailure } = await import('./mandates.ts');
  assert.deepEqual(mandateSqlFailure({ code: '42501', message: 'private' }), {
    code: 'forbidden',
    status: 403,
  });
  assert.equal(mandateSqlFailure({ code: '23503' }).status, 404);
  assert.equal(mandateSqlFailure({ code: '23505' }).status, 409);
  assert.equal(mandateSqlFailure({ code: '22P02' }).status, 400);
  assert.equal(mandateSqlFailure({ code: '08006' }), null);
});


test('period- och samtidighetsfel minimeras även med elevvärden i SQL-felet', async () => {
  const { mandateSqlFailure } = await import('./mandates.ts');
  for (const [code, expected] of [
    ['23P01', { code: 'bad_request', status: 400 }],
    ['40001', { code: 'conflict', status: 409 }],
    ['23505', { code: 'conflict', status: 409 }],
  ]) {
    assert.deepEqual(mandateSqlFailure({
      code, message: 'Syntetisk elev', detail: 'TEST-20100101-0010',
      query: 'private values', constraint: 'private constraint',
    }), expected);
  }
});

// 05.1 D-03: staffPersonId krävs för och bara för scopeKind self.
test('Egen tjänst: self kräver larare och staffPersonId; andra scope nekar staffPersonId', () => {
  const self = { membershipId: id, function: 'larare', unitIds: [id], scopeKind: 'self', staffPersonId: id, validFrom: '2026-09-24' };
  const parsed = parseMandatePayload(self);
  assert.equal(parsed.scopeKind, 'self'); assert.equal(parsed.staffPersonId, id); assert.deepEqual(parsed.groups, []);
  for (const change of [{ staffPersonId: undefined }, { staffPersonId: 'bad' }, { function: 'rektor' }, { groups: [{ id, kind: 'teaching' }] }, { pupilIds: [id] }, { caseIds: [id] }])
    assert.throws(() => parseMandatePayload({ ...self, ...change }), JSON.stringify(change));
  assert.throws(() => parseMandatePayload({ ...payload(), staffPersonId: id }));
  assert.equal(parseMandatePayload(payload()).staffPersonId, null);
});
