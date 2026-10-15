import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimplanName, parseTimplanName, parseTimplanSeries,
  parseNamedTimplanCreateRequest, parseNamedTimplanRenameRequest } from './named-timplan.ts';

const id = n => `55101510-0000-4000-8000-${String(n).padStart(12, '0')}`;
const create = () => ({ commandId: id(1), sourcePlanId: id(2), expectedSourceRevision: 3,
  expectedEducationRevision: 2, unitId: id(3), name: 'SAM 2028 – utökad matematik',
  copyFromPlanId: null, expectedCopyFromRevision: null });
const rename = () => ({ commandId: id(1), planId: id(4), seriesId: id(5),
  expectedSeriesRevision: 2, name: 'SAM 2028 – grundfördelning' });
const series = () => ({ id: id(5), name: 'SAM 2028 – grundfördelning', revision: 2 });

test('names preserve reviewed spelling; only ordinary edge spaces are normalized before review', () => {
  assert.equal(normalizeTimplanName('  SAM 2028 – matematik  '), 'SAM 2028 – matematik');
  for (const name of ['Åk 1', 'A  B', 'A\u030a', 'Å', '𐐀'.repeat(80), 'A\u00a0B']) {
    assert.equal(normalizeTimplanName(name), name);
    assert.equal(parseTimplanName(name), name);
  }
  for (const name of [' A', 'A ']) assert.throws(() => parseTimplanName(name));
  assert.notEqual(parseTimplanName('A\u030a'), parseTimplanName('Å'));
  // Name uniqueness is enforced by the database within education and school.
  assert.equal(parseTimplanName('Grundfördelning'), 'Grundfördelning');
  assert.equal(parseTimplanName('grundfördelning'), 'grundfördelning');
});

test('name limits count code points and reject controls, invisible formatting and invalid UTF-16', () => {
  for (const name of ['', '   ', 'a'.repeat(81), '𐐀'.repeat(81), 'A\nB', '\tA',
    'A\u0000B', 'A\u007fB', 'A\u0085B', 'A\u200dB', 'A\u202eB', 'A\u2066B',
    'A\ufeffB', '\ud800', '\udc00', 'A\ud800B']) assert.throws(() => normalizeTimplanName(name));
  for (const value of [null, undefined, 123, {}, ['A']]) assert.throws(() => parseTimplanName(value));
});

test('new separate plan binds source, school and optional copy revision without granting authority', () => {
  assert.deepEqual(parseNamedTimplanCreateRequest(create()), create());
  const copy = { ...create(), copyFromPlanId: id(4), expectedCopyFromRevision: 0 };
  assert.deepEqual(parseNamedTimplanCreateRequest(copy), copy);
  for (const patch of [{ copyFromPlanId: id(4) }, { expectedCopyFromRevision: 0 },
    { predecessorPlanId: id(4) }, { seriesId: id(5) }, { mode: 'new-version' },
    { actorId: id(6) }, { customerId: id(7) }, { canPlan: true }, { status: 'faststalld' }])
    assert.throws(() => parseNamedTimplanCreateRequest({ ...create(), ...patch }));
});

test('rename uses stable series identity and its own revision, without replacing any version', () => {
  assert.deepEqual(parseNamedTimplanRenameRequest(rename()), rename());
  assert.deepEqual(parseTimplanSeries(series()), series());
  for (const patch of [{ seriesId: null }, { expectedSeriesRevision: null }, { version: 3 },
    { classIds: [id(9)] }, { schoolYear: 2027 }, { sourcePlanId: id(2) }])
    assert.throws(() => parseNamedTimplanRenameRequest({ ...rename(), ...patch }));
  for (const patch of [{ id: null }, { revision: -1 }, { name: ' A' }, { status: 'faststalld' }])
    assert.throws(() => parseTimplanSeries({ ...series(), ...patch }));
});

test('requests reject malformed identities, coerced revisions and missing keys', () => {
  for (const [make, parse, ids, revisions] of [
    [create, parseNamedTimplanCreateRequest, ['commandId', 'sourcePlanId', 'unitId'], ['expectedSourceRevision', 'expectedEducationRevision']],
    [rename, parseNamedTimplanRenameRequest, ['commandId', 'planId', 'seriesId'], ['expectedSeriesRevision']],
  ]) {
    for (const field of ids) for (const value of [null, '', 'not-an-id', 10]) assert.throws(() => parse({ ...make(), [field]: value }));
    for (const field of revisions) {
      for (const value of [null, '2', -1, 0.5, Infinity, NaN, 2147483648]) assert.throws(() => parse({ ...make(), [field]: value }));
      assert.equal(parse({ ...make(), [field]: 0 })[field], 0);
    }
    for (const key of Object.keys(make())) { const value = make(); delete value[key]; assert.throws(() => parse(value)); }
  }
});

test('closed contracts reject accessors and exotic objects without executing getters', () => {
  for (const [make, parse] of [[create, parseNamedTimplanCreateRequest], [rename, parseNamedTimplanRenameRequest], [series, parseTimplanSeries]]) {
    let called = false;
    const getter = make(); Object.defineProperty(getter, 'name', { get() { called = true; return 'A'; }, enumerable: true });
    assert.throws(() => parse(getter)); assert.equal(called, false);
    const symbol = make(); symbol[Symbol('extra')] = 'unexpected'; assert.throws(() => parse(symbol));
    assert.throws(() => parse(Object.assign(Object.create({ inherited: true }), make())));
    assert.throws(() => parse({ ...make(), extra: 'unexpected' }));
  }
});
