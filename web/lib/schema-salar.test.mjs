import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION, SchemaVersionError, defaultSchemaVillkor } from './schema-contract.ts';
import { parseSchemaSalRequest, parseSchemaSalSvar, schemaSalInputFingerprint, schemaSalPlaceringar } from './schema-salar.ts';
const grund = 'a'.repeat(28), known = [{ id: 'sal-1', name: 'A101' }, { id: 'sal-2', name: 'A102' }];
const at = (lesson, startMin, room = 'sal-1') => ({ lesson, day: 0, startMin, room });
const request = (extra = {}) => ({ contractVersion: SCHEMA_CONTRACT_VERSION, unitId: '73111500-0000-4000-8000-000000000001', schoolYear: 2026, period: 'ht',
  villkor: { ...defaultSchemaVillkor(), salar: ['A101', 'A102'] }, grundFingerprint: grund, placements: [at('pass-1', 600), at('pass-2', 700)],
  lesson: 'pass-1', target: { day: 0, startMin: 480 }, datedTarget: null, datedOverrides: [], ...extra });
function reply(input = request()) {
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: grund, fingerprint: 'b'.repeat(28), inputFingerprint: schemaSalInputFingerprint(input), lesson: input.lesson,
    target: input.target, datedTarget: input.datedTarget, durationMin: 70, marginBeforeMin: 10, marginAfterMin: 15, timedOut: false, checkedRooms: 2, explanation: 'Hela kandidaten är kontrollerad.',
    rooms: [{ ...known[0], status: 'upptagen', reasons: [{ code: 'room_clash', message: 'A101 är upptagen av Matematik.', lessons: ['pass-1', 'pass-2'] }], total: 1 },
      { ...known[1], status: 'ledig', reasons: [], total: 0 }] };
}
const parse = (value = reply(), input = request()) => parseSchemaSalSvar(value, input, known);

test('salsökning kräver kontrakt8, exakt mål och inga klientangivna salar eller längder', () => {
  assert.deepEqual(parseSchemaSalRequest(request()), request());
  for (const extra of [{ unknown: true }, { durationMin: 10 }, { target: { day: 0, startMin: 480, room: 'sal-2' } }, { target: { day: 5, startMin: 480 } },
    { target: { day: 0, startMin: 481 } }, { lesson: 'främmande' }, { placements: [at('pass-1', 480), at('pass-1', 600)] }, { datedOverrides: undefined }]) assert.throws(() => parseSchemaSalRequest(request(extra)));
  assert.throws(() => parseSchemaSalRequest(request({ contractVersion: 7 })), SchemaVersionError);
});
test('datummål har giltiga datum och samma veckodag som flyttmålet', () => {
  const input = request({ datedTarget: { originalDate: '2026-11-09', date: '2026-11-16' } }); assert.deepEqual(parseSchemaSalRequest(input), input);
  for (const datedTarget of [{ originalDate: '2026-11-09', date: '2026-11-17' }, { originalDate: '2026-02-30', date: '2026-11-16' }, { originalDate: '2026-11-09' }, '2026-11-16'])
    assert.throws(() => parseSchemaSalRequest(request({ datedTarget })));
});
test('fingeravtrycket binder exakt mål, källa, lås, arbetsvillkor och datumundantag', () => {
  const input = request(), key = schemaSalInputFingerprint(input);
  assert.equal(schemaSalInputFingerprint({ ...input, placements: [...input.placements].reverse() }), key);
  for (const extra of [{ target: { day: 0, startMin: 490 } }, { lesson: 'pass-2' }, { schoolYear: 2027 }, { locks: { grundFingerprint: grund, placements: [input.placements[0]] } },
    { datedTarget: { originalDate: '2026-11-09', date: '2026-11-16' } }, { villkor: { ...input.villkor, breakMin: 15 } }]) assert.notEqual(schemaSalInputFingerprint({ ...input, ...extra }), key);
});
test('salkandidaten ersätter bara valt pass och bevarar alla övriga pass', () => {
  const input = request(), before = structuredClone(input), candidate = schemaSalPlaceringar(input, 'sal-2');
  assert.deepEqual(candidate, [input.placements[1], at('pass-1', 480, 'sal-2')]); assert.deepEqual(input, before);
  assert.equal(schemaSalPlaceringar({ ...input, placements: [input.placements[1]] }, 'sal-2').length, 2);
});
test('svar skiljer ledig, upptagen och otillåten sal utan att kalla otestad sal ledig', () => {
  const result = parse(); assert.equal(result.rooms[1].status, 'ledig'); assert.equal(result.marginBeforeMin, 10);
  const r = reply(); r.rooms[0] = { ...r.rooms[0], status: 'otillaten' }; r.checkedRooms = 1; assert.equal(parse(r).rooms[0].status, 'otillaten');
  r.rooms[0].status = 'ej_kontrollerad'; r.timedOut = true; assert.equal(parse(r).timedOut, true);
});
test('inaktuellt svar, påhittad sal, utelämnad sal, saknade orsaker och fel kontrollantal nekas', () => {
  const mutations = [r => r.contractVersion = 7, r => r.inputFingerprint = 'c'.repeat(28), r => r.target.startMin = 490, r => r.lesson = 'pass-2',
    r => r.rooms.pop(), r => r.rooms[0].id = 'sal-99', r => r.rooms[0].name = 'Påhittat namn', r => r.rooms[1] = r.rooms[0], r => r.rooms[0].reasons = [],
    r => r.rooms[0].status = 'ledig', r => r.checkedRooms = 1, r => r.rooms[0].status = 'ej_kontrollerad', r => r.durationMin = 0, r => r.marginAfterMin = 61,
    r => r.fingerprint = 'x', r => r.extra = true];
  for (const mutate of mutations) { const r = structuredClone(reply()); mutate(r); assert.throws(() => parse(r), mutate.toString()); }
  assert.throws(() => parse(reply(), request({ target: { day: 0, startMin: 490 } })));
});
