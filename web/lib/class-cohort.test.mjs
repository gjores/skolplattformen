import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClassCohortUnderlagRequest, parseClassCohortUnderlag,
  parseClassCohortCreateRequest, parseClassCohortCreateReply,
  parseClassCohortStatusRequest, parseClassCohortStatusReply,
} from './class-cohort.ts';

const id = n => `55101500-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = { offeringId: id(1), unitId: id(2) };
const sourceToken = 'a'.repeat(64);
const request = () => ({ commandId: id(3), ...read, expectedEducationRevision: 4,
  expectedSourceToken: sourceToken, startsOn: '2027-08-17', names: ['SA27A', 'SA27B'] });
const firstYear = date => Number(date.slice(0, 4)) - (date.slice(5, 7) < '07' ? 1 : 0);
const classes = q => q.names.map((name, index) => ({ id: id(10 + index), name,
  cohortStartYear: firstYear(q.startsOn), startsOn: q.startsOn, endsOn: null, validitySource: 'education_start' }));
const reply = (q = request()) => ({ commandId: q.commandId, offeringId: q.offeringId,
  unitId: q.unitId, startsOn: q.startsOn, classes: classes(q), replayed: false });
const underlag = () => ({ ...read, educationName: 'Samhällsvetenskap', schoolName: 'Syntetisk skola',
  educationRevision: 4, sourceToken, educationStartsOn: '2027-08-17', firstSchoolYear: 2027,
  canManage: true, blockers: [], classes: classes(request()) });
const status = (q = request()) => ({ commandId: q.commandId, offeringId: q.offeringId,
  unitId: q.unitId, status: 'found', receipt: { ...reply(q), replayed: true } });
const bad = run => assert.throws(run, error => error?.name === 'ProgramplanContractError');

test('read and create bind exact education/school without authority or pupil fields', () => {
  assert.deepEqual(parseClassCohortUnderlagRequest(read), read);
  assert.deepEqual(parseClassCohortCreateRequest(request()), request());
  assert.deepEqual(parseClassCohortStatusRequest(request()), request());
  for (const key of ['customerId', 'actorId', 'assignmentId', 'classId', 'pupils', 'endsOn', 'kind']) {
    bad(() => parseClassCohortCreateRequest({ ...request(), [key]: null }));
    bad(() => parseClassCohortUnderlagRequest({ ...read, [key]: null }));
  }
  bad(() => parseClassCohortStatusRequest({ commandId: request().commandId }));
});

test('UUIDs, source tokens and revisions reject coercion and malformed identities', () => {
  for (const field of ['commandId', 'offeringId', 'unitId']) {
    for (const value of ['', 'missing', id(1).replace('-4000-', '-0000-'), null, 123])
      bad(() => parseClassCohortCreateRequest({ ...request(), [field]: value }));
  }
  for (const value of [-1, 1.5, '4', null, NaN, Infinity, 2147483648])
    bad(() => parseClassCohortCreateRequest({ ...request(), expectedEducationRevision: value }));
  for (const value of [null, '', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), `sha256:${sourceToken}`])
    bad(() => parseClassCohortCreateRequest({ ...request(), expectedSourceToken: value }));
  assert.equal(parseClassCohortCreateRequest({ ...request(), expectedEducationRevision: 2147483647 }).expectedEducationRevision, 2147483647);
});

test('canonical names preserve reviewed Unicode and order; maximum is UTF-16 units', () => {
  const accepted = ['SA27A', 'ÅÄÖ 27', 'A B', '😀'.repeat(30), '𐐀27'];
  for (const name of accepted) assert.deepEqual(parseClassCohortCreateRequest({ ...request(), names: [name] }).names, [name]);
  const rejected = ['', ' A', 'A ', 'a', 'å', 'A\nB', 'A\u200dB', 'A\ufeffB', '\u00a0A', 'A\u00a0', '😀'.repeat(31), '𐐨27', 'ß27', '\ud800', '\udc00', 'A\ud800B', '\udc00\ud800'];
  for (const name of rejected) bad(() => parseClassCohortCreateRequest({ ...request(), names: [name] }));
  for (const names of [[], ['A', 'A'], ['A', ' a '], ['Å', 'å'], Array.from({ length: 21 }, (_, i) => `A${i}`), [null], 'A'])
    bad(() => parseClassCohortCreateRequest({ ...request(), names }));
  assert.equal(parseClassCohortCreateRequest({ ...request(), names: Array.from({ length: 20 }, (_, i) => `A${i}`) }).names.length, 20);
});

test('only real dates in supported create school years are accepted, including spring and July boundary', () => {
  for (const date of ['2028-02-29', '2027-01-15', '2027-06-30', '2027-07-01', '2000-07-01', '2101-06-30']) {
    const q = { ...request(), startsOn: date };
    assert.equal(parseClassCohortCreateRequest(q).startsOn, date);
    assert.deepEqual(parseClassCohortCreateReply(reply(q), q), reply(q));
  }
  for (const startsOn of ['2027-02-29', '2027-04-31', '0000-01-01', '0001-01-01', '2000-06-30', '2101-07-01', '2027-1-15', '2027-08-17T00:00:00Z', 'infinity', null])
    bad(() => parseClassCohortCreateRequest({ ...request(), startsOn }));
});

test('objects and arrays reject accessors, hidden fields, custom prototypes and holes without invoking getters', () => {
  const accessor = { ...request() };
  Object.defineProperty(accessor, 'names', { get() { throw Error('getter executed'); } });
  bad(() => parseClassCohortCreateRequest(accessor));
  const hidden = { ...request() }; Object.defineProperty(hidden, 'hidden', { value: true });
  const symbolic = { ...request(), [Symbol('authority')]: true };
  for (const value of [hidden, symbolic, Object.assign(Object.create({}), request())]) bad(() => parseClassCohortCreateRequest(value));
  const accessorArray = ['A']; Object.defineProperty(accessorArray, '0', { get() { throw Error('getter executed'); } });
  for (const names of [new Array(1), Object.assign(['A'], { extra: true }), accessorArray]) bad(() => parseClassCohortCreateRequest({ ...request(), names }));
  const q = Object.assign(Object.create(null), request());
  assert.deepEqual(parseClassCohortCreateRequest(q), request());
});

test('create receipt must match command, education, school, exact ordered batch and source date', () => {
  const q = request(); assert.deepEqual(parseClassCohortCreateReply(reply(q), q), reply(q));
  assert.equal(parseClassCohortCreateReply({ ...reply(q), replayed: true }, q).replayed, true);
  const mutations = [r => r.commandId = id(99), r => r.offeringId = id(99), r => r.unitId = id(99),
    r => r.startsOn = '2027-08-18', r => r.classes.reverse(), r => r.classes.pop(),
    r => r.classes.push({ ...r.classes[0], id: id(99) }), r => r.classes[1].id = r.classes[0].id,
    r => r.classes[0].name = 'OTHER', r => r.classes[0].startsOn = '2027-08-18',
    r => r.classes[0].cohortStartYear = 2026, r => r.classes[0].endsOn = '2028-08-17',
    r => delete r.classes[0].endsOn, r => r.classes[0].validitySource = 'legacy_unknown',
    r => r.classes[0].pupils = [], r => r.replayed = 'false'];
  for (const mutate of mutations) { const r = reply(q); mutate(r); bad(() => parseClassCohortCreateReply(r, q)); }
  bad(() => parseClassCohortCreateReply(reply(q), { ...q, names: ['OTHER'] }));
});

test('status found needs full request-bound replay receipt; not_found cannot contain classes', () => {
  const q = request(); assert.deepEqual(parseClassCohortStatusReply(status(q), q), status(q));
  const missing = { commandId: q.commandId, ...read, status: 'not_found', receipt: null };
  assert.deepEqual(parseClassCohortStatusReply(missing, q), missing);
  for (const result of [{ ...missing, receipt: reply(q) }, { ...missing, classes: [] }, { ...missing, commandId: id(99) },
    { ...missing, offeringId: id(99) }, { ...missing, unitId: id(99) }, { ...missing, receipt: undefined },
    { ...status(q), receipt: null }, { ...status(q), status: 'created' },
    { ...status(q), receipt: reply(q) }, { ...status(q), receipt: { ...reply(q), replayed: true, unitId: id(99) } }])
    bad(() => parseClassCohortStatusReply(result, q));
  const accessor = { ...status(q) }; Object.defineProperty(accessor, 'status', { get() { throw Error('getter executed'); } });
  bad(() => parseClassCohortStatusReply(accessor, q));
});

test('read binds exact scope and source/calendar relation while preserving read-only head authority', () => {
  const value = underlag(); assert.deepEqual(parseClassCohortUnderlag(value, read), value);
  assert.equal(parseClassCohortUnderlag({ ...value, canManage: false }, read).canManage, false);
  for (const patch of [{ offeringId: id(99) }, { unitId: id(99) }, { firstSchoolYear: 2026 },
    { blockers: ['Utbildningen är arkiverad.'] }, { educationRevision: -1 }, { sourceToken: 'bad' }, { pupils: [] }])
    bad(() => parseClassCohortUnderlag({ ...value, ...patch }, read));
  const spring = { ...value, educationStartsOn: '2027-01-15', firstSchoolYear: 2026 };
  assert.equal(parseClassCohortUnderlag(spring, read).firstSchoolYear, 2026);
});

test('unknown source is all-null, blocked and read-only; it does not hide historic classes', () => {
  const value = { ...underlag(), sourceToken: null, educationStartsOn: null, firstSchoolYear: null,
    canManage: false, blockers: ['Utbildningsstarten kan inte verifieras.'],
    classes: [{ id: id(20), name: 'ÄLDRE', cohortStartYear: 1990, startsOn: null, endsOn: null, validitySource: 'legacy_unknown' }] };
  assert.deepEqual(parseClassCohortUnderlag(value, read), value);
  for (const patch of [{ sourceToken }, { educationStartsOn: '2027-08-17' }, { firstSchoolYear: 2027 }, { canManage: true }, { blockers: [] }])
    bad(() => parseClassCohortUnderlag({ ...value, ...patch }, read));
});

test('known source outside create years is readable but never writable, year zero is always invalid', () => {
  for (const [date, year] of [['0001-07-01', 1], ['1990-01-01', 1989], ['9999-06-30', 9998]]) {
    const value = { ...underlag(), educationStartsOn: date, firstSchoolYear: year, canManage: false, blockers: ['Starten ligger utanför aktuellt skrivstöd.'] };
    assert.equal(parseClassCohortUnderlag(value, read).firstSchoolYear, year);
    bad(() => parseClassCohortUnderlag({ ...value, blockers: [], canManage: true }, read));
  }
  bad(() => parseClassCohortUnderlag({ ...underlag(), educationStartsOn: '0000-08-17', firstSchoolYear: 0 }, read));
});

test('read class identity, validity provenance and inclusive end are strict without inventing legacy dates', () => {
  const value = underlag(); value.classes[0].endsOn = value.classes[0].startsOn;
  assert.deepEqual(parseClassCohortUnderlag(value, read), value);
  for (const mutate of [r => r.classes[1].id = r.classes[0].id, r => r.classes[0].endsOn = '2027-08-16',
    r => r.classes[0].startsOn = null, r => r.classes[0].validitySource = 'unknown',
    r => r.classes[0].cohortStartYear = 2026, r => r.classes[0].extra = true,
    r => r.classes[0].validitySource = 'legacy_unknown']) {
    const invalid = underlag(); mutate(invalid); bad(() => parseClassCohortUnderlag(invalid, read));
  }
  const legacy = { id: id(21), name: 'ÄLDRE', cohortStartYear: 1, startsOn: null, endsOn: null, validitySource: 'legacy_unknown' };
  assert.deepEqual(parseClassCohortUnderlag({ ...underlag(), classes: [legacy] }, read).classes, [legacy]);
  bad(() => parseClassCohortUnderlag({ ...underlag(), classes: [{ ...legacy, endsOn: '2027-08-17' }] }, read));
  bad(() => parseClassCohortUnderlag({ ...underlag(), classes: Array.from({ length: 2001 }, (_, i) => ({ ...legacy, id: id(100 + i) })) }, read));
});

test('read preserves older PostgreSQL names for both provenance types; new batch receipts remain strict', () => {
  for (const name of ['😀'.repeat(60), 'A\u200dB', '\u00a0A', 'A\u00a0']) {
    for (const provenance of ['legacy_unknown', 'education_start']) {
      const row = { ...classes(request())[0], name, validitySource: provenance,
        ...(provenance === 'legacy_unknown' ? { startsOn: null } : {}) };
      assert.equal(parseClassCohortUnderlag({ ...underlag(), classes: [row] }, read).classes[0].name, name);
    }
    bad(() => parseClassCohortCreateRequest({ ...request(), names: [name] }));
    const r = reply(); r.classes[0].name = name;
    bad(() => parseClassCohortCreateReply(r, request()));
  }
  for (const name of ['', 'A'.repeat(61), '😀'.repeat(61)])
    bad(() => parseClassCohortUnderlag({ ...underlag(), classes: [{ ...classes(request())[0], name }] }, read));
});

test('a complete 2000-class school education remains readable but cannot claim room for another batch', () => {
  const value = { ...underlag(), canManage: false, blockers: ['Utbildningen har nått klassgränsen.'],
    classes: Array.from({ length: 2000 }, (_, i) => ({ ...classes(request())[0], id: id(100 + i), name: `A${i}` })) };
  assert.equal(parseClassCohortUnderlag(value, read).classes.length, 2000);
  bad(() => parseClassCohortUnderlag({ ...value, blockers: [], canManage: true }, read));
});
