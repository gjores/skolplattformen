import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
// Only Worker bindings are replaced; the production logEvent and transaction callback run.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url === new URL('./db.ts', import.meta.url).href) return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }), shortCircuit: true };
  return next(url, context);
} });
const { auditPupilRegisterResult } = await import('./pupil-register-audit.ts');
const { AuditUnavailable } = await import('./authz.ts');
const { logEvent } = await import('./events.ts');
const pupil = '33000000-0000-4000-8000-000000000001';
const second = '33000000-0000-4000-8000-000000000002';
const ctx = { correlationId: pupil, identityId: pupil, identity: { issuer: 'synthetic', subject: 'synthetic' }, accessFunction: 'administrator' };
const operation = { action: 'pupil_list_read', schoolYear: 2026, count: 2 };
const ref = (pupilId = pupil, kind = 'protected') => ({ pupilId, kind });
function transaction(failAt = 0) {
  const committed = [];
  return { committed, async run(fn) {
    const pending = [];
    let attempts = 0;
    const tx = async (_strings, ...values) => {
      attempts++;
      if (attempts === failAt) throw new Error('raw database secret');
      pending.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] });
      return [];
    };
    tx.json = v => v;
    const value = await fn(tx);
    committed.push(...pending);
    return value;
  } };
}
const success = (auditRefs, body = { rows: [{ id: pupil }] }) => ({ kind: 'success', body, auditRefs });
const conflict = { kind: 'fields', currentVersion: 2, changedBy: second, changedAt: '2026-09-28T10:00:00.000Z', fields: [{ field: 'displayName', submitted: 'Old Synthetic', current: 'New Synthetic' }] };

test('en skyddad visning per elev och svar, huvudlogg lämnas till routen och interna referenser tas bort', async () => {
  const db = transaction();
  const input = success([ref(), ref(), ref(second)], { rows: [{ id: pupil, auditRefs: [ref()] }] });
  const result = await db.run(tx => auditPupilRegisterResult(tx, ctx, input, operation));
  assert.deepEqual(result.body, { rows: [{ id: pupil }] });
  assert.equal(JSON.stringify(result).includes('auditRefs'), false);
  assert.equal(input.body.rows[0].auditRefs.length, 1);
  assert.equal(result.event.action, 'pupil_list_read');
  assert.equal(db.committed.length, 2);
  assert.deepEqual(db.committed.map(e => e.objectId), [pupil, second]);
  assert.ok(db.committed.every(e => e.action === 'pupil_protected_read' && e.outcome === 'ok'));
});

test('lista, kort och historik loggar skyddad visning; anonymiserad läsning fabricerar ingen objekthändelse', async () => {
  for (const action of ['pupil_list_read', 'pupil_read', 'pupil_history_read']) {
    const db = transaction();
    await db.run(tx => auditPupilRegisterResult(tx, ctx, success([ref()]), { ...operation, action }));
    assert.equal(db.committed[0].objectId, pupil);
  }
  const db = transaction();
  await db.run(tx => auditPupilRegisterResult(tx, ctx, success([]), operation));
  assert.deepEqual(db.committed, []);
});

test('personnummervisning och personnummerexport ger skilda objekthändelser utan värden', async () => {
  for (const [kind, action, expected] of [['personal-number', 'pupil_personal_number_read', 'pupil_personal_number_read'], ['personal-number-export', 'pupil_exported', 'pupil_personal_number_exported']]) {
    const db = transaction();
    await db.run(tx => auditPupilRegisterResult(tx, ctx, success([ref(pupil, kind)], { personalNumber: 'TEST-20100101-1234' }), { ...operation, action, pupilId: pupil }));
    assert.equal(db.committed[0].action, expected);
    assert.equal(JSON.stringify(db.committed).includes('TEST-'), false);
  }
});

test('konflikt loggar nekad skrivning och skyddad visning, huvud-event är endast konfliktläsning', async () => {
  const db = transaction();
  const result = await db.run(tx => auditPupilRegisterResult(tx, ctx, { kind: 'conflict', details: conflict, auditRefs: [ref()] }, { action: 'pupil_updated', schoolYear: 2026, pupilId: pupil, fields: ['displayName'] }));
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { code: 'conflict', details: conflict });
  assert.equal(result.event.action, 'pupil_conflict_read');
  assert.deepEqual(db.committed.map(e => [e.action, e.outcome]), [['pupil_updated', 'denied'], ['pupil_protected_read', 'ok']]);
  assert.equal(JSON.stringify(db.committed).includes('Synthetic'), false);
});

test('fel på varje extra händelse ger AuditUnavailable och simulerad rollback utan delsvaret', async () => {
  for (const failAt of [1, 2]) {
    const db = transaction(failAt);
    await assert.rejects(db.run(tx => auditPupilRegisterResult(tx, ctx, success([ref(), ref(second)]), operation)), AuditUnavailable);
    assert.deepEqual(db.committed, []);
    const conflictDb = transaction(failAt);
    await assert.rejects(conflictDb.run(tx => auditPupilRegisterResult(tx, ctx, { kind: 'conflict', details: conflict, auditRefs: [ref()] }, { action: 'pupil_updated', schoolYear: 2026, pupilId: pupil })), AuditUnavailable);
    assert.deepEqual(conflictDb.committed, []);
  }
});

test('saknade/ogiltiga referenser och felaktiga operationsmetadata stoppas utan tyst count-only-reserv', async () => {
  const badRefs = [undefined, null, {}, [{ kind: 'protected', pupilId: 'secret' }], [{ ...ref(), secret: 'name' }], [{ kind: 'unknown', pupilId: pupil }]];
  for (const refs of badRefs) {
    const db = transaction();
    await assert.rejects(db.run(tx => auditPupilRegisterResult(tx, ctx, success(refs), operation)), AuditUnavailable);
    assert.deepEqual(db.committed, []);
  }
  for (const op of [{ ...operation, action: 'secret' }, { ...operation, schoolYear: 2026.5 }, { ...operation, fields: ['secret'] }]) {
    await assert.rejects(transaction().run(tx => auditPupilRegisterResult(tx, ctx, success([]), op)), AuditUnavailable);
  }
});


test('huvudhändelsens fel efter extraskrivning rullar tillbaka hela simulerade transaktionen', async () => {
  const db = transaction(3);
  let returned = false;
  await assert.rejects(db.run(async tx => {
    const result = await auditPupilRegisterResult(tx, ctx, success([ref(), ref(second)]), operation);
    // protectedRoute owns this last event and catches its failure as AuditUnavailable.
    try { await logEvent(tx, ctx, { ...result.event, outcome: 'ok' }); }
    catch { throw new AuditUnavailable(); }
    returned = true;
    return result;
  }), AuditUnavailable);
  assert.equal(returned, false);
  assert.deepEqual(db.committed, []);
});

test('felaktiga konflikter och fel händelsetyp kan inte bli lyckad skrivning', async () => {
  for (const [result, op] of [
    [{ kind: 'conflict', details: { ...conflict, secret: 'name' }, auditRefs: [ref()] }, { ...operation, action: 'pupil_updated', pupilId: pupil }],
    [{ kind: 'conflict', details: conflict, auditRefs: [ref()] }, operation],
    [success([ref(pupil, 'personal-number-export')]), operation],
    [success([ref(pupil, 'personal-number')]), { ...operation, action: 'pupil_exported' }],
    [success([]), { ...operation, action: 'pupil_personal_number_read', pupilId: pupil }],
  ]) {
    const db = transaction();
    await assert.rejects(db.run(tx => auditPupilRegisterResult(tx, ctx, result, op)), AuditUnavailable);
    assert.deepEqual(db.committed, []);
  }
});

test('konfliktsvaret bevarar code och typade details hela vägen till registerklienten', async t => {
  const { api, ApiError, setKnownEpoch } = await import('../server-client.ts');
  setKnownEpoch(null);
  const result = await transaction().run(tx => auditPupilRegisterResult(tx, ctx,
    { kind: 'conflict', details: conflict, auditRefs: [ref()] },
    { action: 'pupil_updated', schoolYear: 2026, pupilId: pupil }));
  t.mock.method(globalThis, 'fetch', async () => Response.json(result.body, { status: result.status }));
  await assert.rejects(api.patch('/api/elever/elev', {}), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'conflict');
    assert.equal(error.status, 409);
    assert.deepEqual(error.details, conflict);
    return true;
  });
});
