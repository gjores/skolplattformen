import { test } from 'node:test';
import assert from 'node:assert/strict';
// RED före modellens första implementation ger saknad funktion, inte importfel.
const model = await import('./pupil-register-model.ts').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url?.endsWith('/pupil-register-model.ts')) return {};
  throw error;
});
const unitId = '10000000-0000-4000-8000-000000000001';
const defaults = { schoolYear: 2026, unitId, classId: null, educationId: null, grade: null, status: null, page: 1 };
const call = (name, ...args) => {
  assert.equal(typeof model[name], 'function', `Modellfunktionen ${name} måste finnas`);
  return model[name](...args);
};

test('Läsåret byter den 1 juli och etiketten klarar sekelgräns', () => {
  assert.equal(call('currentSchoolYear', '2026-06-30'), 2025);
  assert.equal(call('currentSchoolYear', '2026-07-01'), 2026);
  assert.equal(call('schoolYearLabel', 2026), '26/27');
  assert.equal(call('schoolYearLabel', 2099), '99/00');
  assert.deepEqual(call('schoolYearRange', 2026), { startsOn: '2026-07-01', endsBefore: '2027-07-01' });
});

test('Datum är verkliga kalenderdatum, utan tidszon eller normalisering', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-12-31']) assert.equal(call('isValidDate', value), true);
  for (const value of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-1-01', '2026-01-01T00:00:00Z', '', null, 2026, '0000-01-01']) assert.equal(call('isValidDate', value), false);
  assert.throws(() => call('currentSchoolYear', '2026-02-31'));
  assert.throws(() => call('schoolYearRange', 2026.5));
});

test('Periodens slutdag ingår; läsårets nästa 1 juli ingår inte', () => {
  const overlaps = (startsOn, endsOn) => call('periodOverlapsSchoolYear', { startsOn, endsOn }, 2026);
  assert.equal(overlaps('2025-07-01', '2026-06-30'), false);
  assert.equal(overlaps('2025-07-01', '2026-07-01'), true);
  assert.equal(overlaps('2027-06-30', '2027-06-30'), true);
  assert.equal(overlaps('2027-07-01', null), false);
  assert.equal(overlaps('2020-01-01', null), true);
  assert.throws(() => overlaps('2026-09-02', '2026-09-01'));
});

test('Referensdatum är idag inom läsåret, annars läsårets första dag', () => {
  assert.equal(call('referenceDate', 2026, '2026-09-28'), '2026-09-28');
  assert.equal(call('referenceDate', 2026, '2027-06-30'), '2027-06-30');
  assert.equal(call('referenceDate', 2026, '2026-06-30'), '2026-07-01');
  assert.equal(call('referenceDate', 2026, '2027-07-01'), '2026-07-01');
});

test('Placeringsstatus prövas mot uttryckligt referensdatum inklusive slutdagen', () => {
  const period = { startsOn: '2026-08-01', endsOn: '2026-09-28' };
  assert.equal(call('placementStatus', period, '2026-07-01'), 'framtida');
  assert.equal(call('placementStatus', period, '2026-09-28'), 'aktuell');
  assert.equal(call('placementStatus', period, '2026-09-29'), 'avslutad');
});

test('Årskurs härleds ur startår, saknat startår blir null', () => {
  assert.equal(call('gradeForSchoolYear', 2026, 2024), 3);
  assert.equal(call('gradeForSchoolYear', 2026, null), null);
  assert.equal(call('gradeForSchoolYear', 2026, 2027), 0);
  assert.throws(() => call('gradeForSchoolYear', 2026, 2024.5));
});

test('URL återställer endast stängt, typat urval och aldrig fritext', () => {
  const selection = { ...defaults, schoolYear: 2025, grade: 3, status: 'avslutad', page: 2 };
  const query = call('selectionToQuery', { ...selection, search: 'Hemlig söktext', personnummer: 'hemligt' });
  assert.equal(query.includes('Hemlig'), false);
  assert.equal(query.includes('hemligt'), false);
  assert.deepEqual(call('selectionFromQuery', query, defaults), selection);
  assert.deepEqual(call('selectionFromQuery', '', defaults), defaults);
  assert.equal(new URLSearchParams(query).get('vy'), 'elever');
});

test('URL avvisar okända och upprepade nycklar samt godtyckliga id-värden', () => {
  for (const query of ['?sok=hemligt', '?lasar=2026&lasar=2025', '?skola=namn', '?ak=3.5', '?sida=0', '?sida=Infinity', '?status=hemligt', '?vy=annat', '?lasar=9999', '?ak=', '?klass=']) {
    assert.equal(call('selectionFromQuery', query, defaults), null);
  }
  assert.throws(() => call('selectionToQuery', { ...defaults, unitId: 'hemligt' }));
});

test('Endast uttryckliga kända capability-flaggor ger rättigheter', () => {
  assert.deepEqual(call('readCapabilities', { canEdit: true, canExport: 'true', canRevealPersonalNumber: 1, admin: true }), {
    canEdit: true, canExport: false, canRevealPersonalNumber: false, canReadHistory: false, canReadProtected: false,
  });
  assert.equal(call('readCapabilities', null).canEdit, false);
});

const synthetic = 'TEST-20100101-0014';
test('Syntetiskt personnummer kräver TEST-prefix, datum, Luhn och explicit allowlist', () => {
  const allow = new Set([synthetic, 'TEST-20100230-0014']);
  assert.deepEqual(call('validateSyntheticPersonalNumber', synthetic, allow), { ok: true, value: synthetic, birthDate: '2010-01-01' });
  for (const value of ['201001010014', '20100101-0014', 'TEST-20100101-0015', 'TEST-20100230-0014', 'test-20100101-0014', ` ${synthetic}`]) {
    assert.equal(call('validateSyntheticPersonalNumber', value, allow).ok, false);
  }
  assert.deepEqual(call('validateSyntheticPersonalNumber', synthetic, new Set()), { ok: false, reason: 'not_synthetic' });
});

test('Konflikt innehåller endast tillåtna aktuella fält och aktör/tid', () => {
  const value = { kind: 'fields', currentVersion: 2, changedBy: 'Administratör', changedAt: '2026-09-28T10:00:00Z', fields: [{ field: 'displayName', submitted: 'Lokalt', current: 'Nyare' }] };
  assert.deepEqual(call('parseConflictDetails', value), value);
  assert.equal(call('parseConflictDetails', { ...value, fields: [{ field: 'personalNumber', submitted: synthetic, current: synthetic }] }), null);
  assert.equal(call('parseConflictDetails', { ...value, oldPersonalNumber: synthetic }), null);
  assert.equal(call('parseConflictDetails', { ...value, fields: [{ ...value.fields[0], old: 'Äldre' }] }), null);
  assert.equal(call('parseConflictDetails', { ...value, changedAt: 'fel' }), null);
});

test('Periodkonflikt har inga historiska elevvärden eller personnummer', () => {
  const value = { kind: 'period', currentVersion: 3, changedBy: 'Administratör', changedAt: '2026-09-28T10:00:00Z', period: 'placement', reason: 'overlap' };
  assert.deepEqual(call('parseConflictDetails', value), value);
  assert.equal(call('parseConflictDetails', { ...value, reason: 'hemlig elevuppgift' }), null);
});

test('Sidstorlek och sekundär sortering är bestämda', () => {
  assert.equal(model.PUPIL_PAGE_SIZE, 50);
  assert.equal(model.HISTORY_PAGE_SIZE, 20);
  assert.deepEqual(model.PUPIL_SORT, ['displayName', 'id']);
});

test('CSV återanvänder skydd mot kalkylbladsformler', () => {
  assert.equal(call('registerCsv', ['displayName'], [{ displayName: '=1+1', personalNumber: synthetic }]), '\uFEFFnamn\r\n\'=1+1\r\n');
  assert.throws(() => call('registerCsv', ['unknown'], []));
});
