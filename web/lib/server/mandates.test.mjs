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
