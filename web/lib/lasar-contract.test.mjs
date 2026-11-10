import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LASAR_CONTRACT_VERSION,
  LasarContractError,
  lasarCommandRequest,
  lasarDbStatus,
  lasarModelStatus,
  lasarPayloadHash,
  lasarSchoolYear,
  parseLasarCommandReply,
  parseLasarCommandRequest,
  parseLasarReadReply,
  parseLasarReadRequest,
  verifyLasarCommandHash,
} from './lasar-contract.ts';

// Syntetisk skolenhet och version; inga personuppgifter.
const UNIT = '51a50000-0000-4000-8000-000000000003';
const VERSION = '51a50000-0000-4000-8000-000000000101';
const read = () => ({
  contractVersion: 'lasar_sql_v1',
  unitId: UNIT,
  schoolYear: 2026,
  calendar: {
    versionId: VERSION,
    version: 1,
    status: 'utkast',
    revision: 3,
    terms: { ht: { start: '2026-08-17', end: '2026-12-18' }, vt: { start: '2027-01-11', end: '2027-06-11' } },
    exceptions: { '2026-10-26': { kind: 'lovdag', note: 'Höstlov' }, '2026-11-11': { kind: 'studiedag' } },
    history: [{ id: '51a50000-0000-4000-8000-000000000201', role: 'rektor', at: '2026-09-04T08:00:00.000Z', action: 'Förslag skapat', comment: '' }],
  },
  capabilities: { canEdit: true },
});
const rejects = (fn) => assert.throws(fn, (e) => e instanceof LasarContractError);

test('kontraktsversionen är lasar_sql_v1', () => {
  assert.equal(LASAR_CONTRACT_VERSION, 'lasar_sql_v1');
  assert.equal(parseLasarReadReply(read()).contractVersion, 'lasar_sql_v1');
  rejects(() => parseLasarReadReply({ ...read(), contractVersion: 'lasar_sql_v2' }));
});

test('läsningen tolkas och mappas till modellens SchoolYear', () => {
  const reply = parseLasarReadReply(read(), { unitId: UNIT, schoolYear: 2026 });
  const sy = lasarSchoolYear(reply);
  assert.equal(sy.id, VERSION);
  assert.equal(sy.status, 'utkast');
  assert.equal(sy.label, 'Läsåret 2026/27');
  assert.deepEqual(sy.exceptions['2026-10-26'], { kind: 'lovdag', note: 'Höstlov' });
  assert.equal(lasarSchoolYear({ ...reply, calendar: null }), null);
  assert.deepEqual(parseLasarReadRequest({ unitId: UNIT, schoolYear: 2026 }), { unitId: UNIT, schoolYear: 2026 });
});

test('extra fält nekas på alla nivåer', () => {
  rejects(() => parseLasarReadRequest({ unitId: UNIT, schoolYear: 2026, role: 'rektor' }));
  rejects(() => parseLasarReadReply({ ...read(), role: 'rektor' }));
  const r1 = read(); r1.calendar.extra = 1; rejects(() => parseLasarReadReply(r1));
  const r2 = read(); r2.capabilities.canApprove = true; rejects(() => parseLasarReadReply(r2));
  const r3 = read(); r3.calendar.exceptions['2026-11-11'].cause = 'x'; rejects(() => parseLasarReadReply(r3));
  const r4 = read(); r4.calendar.history[0].actorName = 'Någon'; rejects(() => parseLasarReadReply(r4));
});

test('saknade fält, fel skolenhet och ogiltiga datum nekas', () => {
  const r1 = read(); delete r1.capabilities.canEdit; rejects(() => parseLasarReadReply(r1));
  rejects(() => parseLasarReadReply(read(), { unitId: '51a50000-0000-4000-8000-000000000004', schoolYear: 2026 }));
  rejects(() => parseLasarReadReply(read(), { unitId: UNIT, schoolYear: 2027 }));
  const r2 = read(); r2.calendar.exceptions['2026-02-30'] = { kind: 'lovdag' }; rejects(() => parseLasarReadReply(r2));
  const r3 = read(); r3.calendar.exceptions['2026-10-27'] = { kind: 'skoldag' }; rejects(() => parseLasarReadReply(r3));
  const r4 = read(); r4.calendar.exceptions['2026-10-27'] = { kind: 'lovdag', note: '' }; rejects(() => parseLasarReadReply(r4));
});

test('status tolkas i databasens ascii-form; modellens namn och okända statusar nekas', () => {
  for (const [db, model] of [['utkast', 'utkast'], ['forslag', 'förslag'], ['atersand', 'återsänd'], ['faststalld', 'fastställd']]) {
    const r = read(); r.calendar.status = db;
    assert.equal(lasarSchoolYear(parseLasarReadReply(r)).status, model);
    assert.equal(lasarModelStatus(db), model);
    assert.equal(lasarDbStatus(model), db);
  }
  for (const status of ['förslag', 'fastställd', 'ersatt', 'FORSLAG', '']) {
    const r = read(); r.calendar.status = status; rejects(() => parseLasarReadReply(r));
  }
});

test('payloadHash är stabil och oberoende av nyckelordning', async () => {
  const ops = [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }];
  // Handskriven kanonisk form: [prefix, ops] med nycklarna dates, kind, op i byteordning.
  const canonical = 'a2:s16:lasar_payload_v1a1:o3:s5:datesa1:s10:2026-10-07s4:kinds6:lovdags2:ops8:set_days';
  const expected = 'sha256:' + createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
  assert.equal(await lasarPayloadHash(ops), expected);
  assert.equal(await lasarPayloadHash([{ kind: 'lovdag', dates: ['2026-10-07'], op: 'set_days' }]), expected);
  assert.notEqual(await lasarPayloadHash([{ op: 'set_days', dates: ['2026-10-08'], kind: 'lovdag' }]), expected);
});

test('kommandot byggs med kommando-id, förväntad revision och payloadHash och tolkas strikt', async () => {
  const ops = [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }];
  const request = await lasarCommandRequest({ unitId: UNIT, schoolYear: 2026, versionId: VERSION, expectedRevision: 3, ops });
  assert.match(request.commandId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(request.expectedRevision, 3);
  assert.equal(request.payloadHash, await lasarPayloadHash(ops));
  assert.deepEqual(await verifyLasarCommandHash(JSON.parse(JSON.stringify(request))), request);
  rejects(() => parseLasarCommandRequest({ ...request, role: 'rektor' }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], dates: ['2026-10-08', '2026-10-07'] }] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], kind: 'helgdag' }] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], kind: 'skoldag', note: 'x' }] }));
  await assert.rejects(verifyLasarCommandHash({ ...request, ops: [{ ...ops[0], kind: 'studiedag' }] }), LasarContractError);
});

test('kommandots svar måste gälla samma kommando och version med ny revision', async () => {
  const request = await lasarCommandRequest({ unitId: UNIT, schoolYear: 2026, versionId: VERSION, expectedRevision: 3, ops: [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }] });
  const detail = read(); detail.calendar.revision = 4;
  const ok = { receipt: { commandId: request.commandId, revision: 4, replayed: false }, detail };
  assert.equal(parseLasarCommandReply(ok, request).receipt.revision, 4);
  rejects(() => parseLasarCommandReply({ ...ok, extra: true }, request));
  rejects(() => parseLasarCommandReply({ ...ok, receipt: { ...ok.receipt, commandId: '51a50000-0000-4000-8000-000000000999' } }, request));
  rejects(() => parseLasarCommandReply({ ...ok, receipt: { ...ok.receipt, revision: 3 } }, { ...request, expectedRevision: 3 }));
  const stale = read(); stale.calendar.revision = 3;
  rejects(() => parseLasarCommandReply({ receipt: { ...ok.receipt, revision: 3 }, detail: stale }, request));
});
