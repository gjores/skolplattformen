import { test } from 'node:test';
import assert from 'node:assert/strict';
// RED före modellens första implementation ger saknad funktion, inte importfel.
const model = await import('./pupil-register-model.ts').catch((error) => {
  if (
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    error.url?.endsWith('/pupil-register-model.ts')
  )
    return {};
  throw error;
});
const unitId = '10000000-0000-4000-8000-000000000001';
const defaults = {
  schoolYear: 2026,
  unitId,
  classId: null,
  educationId: null,
  grade: null,
  status: null,
  page: 1,
};
const call = (name, ...args) => {
  assert.equal(
    typeof model[name],
    'function',
    `Modellfunktionen ${name} måste finnas`,
  );
  return model[name](...args);
};

test('Läsåret byter den 1 juli och etiketten klarar sekelgräns', () => {
  assert.equal(call('currentSchoolYear', '2026-06-30'), 2025);
  assert.equal(call('currentSchoolYear', '2026-07-01'), 2026);
  assert.equal(call('schoolYearLabel', 2026), '26/27');
  assert.equal(call('schoolYearLabel', 2099), '99/00');
  assert.deepEqual(call('schoolYearRange', 2026), {
    startsOn: '2026-07-01',
    endsBefore: '2027-07-01',
  });
});

test('Datum är verkliga kalenderdatum, utan tidszon eller normalisering', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-12-31'])
    assert.equal(call('isValidDate', value), true);
  for (const value of [
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    '',
    null,
    2026,
    '0000-01-01',
  ])
    assert.equal(call('isValidDate', value), false);
  assert.throws(() => call('currentSchoolYear', '2026-02-31'));
  assert.throws(() => call('schoolYearRange', 2026.5));
});

test('Periodens slutdag ingår; läsårets nästa 1 juli ingår inte', () => {
  const overlaps = (startsOn, endsOn) =>
    call('periodOverlapsSchoolYear', { startsOn, endsOn }, 2026);
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
  const selection = {
    ...defaults,
    schoolYear: 2025,
    grade: 3,
    status: 'avslutad',
    page: 2,
  };
  const query = call('selectionToQuery', {
    ...selection,
    search: 'Hemlig söktext',
    personnummer: 'hemligt',
  });
  assert.equal(query.includes('Hemlig'), false);
  assert.equal(query.includes('hemligt'), false);
  assert.deepEqual(call('selectionFromQuery', query, defaults), selection);
  assert.deepEqual(call('selectionFromQuery', '', defaults), defaults);
  assert.equal(new URLSearchParams(query).get('vy'), 'elever');
});

test('URL avvisar okända och upprepade nycklar samt godtyckliga id-värden', () => {
  for (const query of [
    '?sok=hemligt',
    '?lasar=2026&lasar=2025',
    '?skola=namn',
    '?ak=3.5',
    '?sida=0',
    '?sida=Infinity',
    '?status=hemligt',
    '?vy=annat',
    '?lasar=9999',
    '?ak=',
    '?klass=',
  ]) {
    assert.equal(call('selectionFromQuery', query, defaults), null);
  }
  assert.throws(() =>
    call('selectionToQuery', { ...defaults, unitId: 'hemligt' }),
  );
});

test('Endast uttryckliga kända capability-flaggor ger rättigheter', () => {
  assert.deepEqual(
    call('readCapabilities', {
      canEdit: true,
      canExport: 'true',
      canRevealPersonalNumber: 1,
      admin: true,
    }),
    {
      canEdit: true,
      canExport: false,
      canRevealPersonalNumber: false,
      canReadHistory: false,
      canReadProtected: false,
    },
  );
  assert.equal(call('readCapabilities', null).canEdit, false);
});

const synthetic = 'TEST-20100101-0014';
test('Syntetiskt personnummer kräver TEST-prefix, datum, Luhn och explicit allowlist', () => {
  const allow = new Set([synthetic, 'TEST-20100230-0014']);
  assert.deepEqual(call('validateSyntheticPersonalNumber', synthetic, allow), {
    ok: true,
    value: synthetic,
    birthDate: '2010-01-01',
  });
  for (const value of [
    '201001010014',
    '20100101-0014',
    'TEST-20100101-0015',
    'TEST-20100230-0014',
    'test-20100101-0014',
    ` ${synthetic}`,
  ]) {
    assert.equal(
      call('validateSyntheticPersonalNumber', value, allow).ok,
      false,
    );
  }
  assert.deepEqual(
    call('validateSyntheticPersonalNumber', synthetic, new Set()),
    { ok: false, reason: 'not_synthetic' },
  );
});

test('Konflikt innehåller endast tillåtna aktuella fält och aktör/tid', () => {
  const value = {
    kind: 'fields',
    currentVersion: 2,
    changedBy: 'Administratör',
    changedAt: '2026-09-28T10:00:00Z',
    fields: [{ field: 'displayName', submitted: 'Lokalt', current: 'Nyare' }],
  };
  assert.deepEqual(call('parseConflictDetails', value), value);
  assert.equal(
    call('parseConflictDetails', {
      ...value,
      fields: [
        { field: 'personalNumber', submitted: synthetic, current: synthetic },
      ],
    }),
    null,
  );
  assert.equal(
    call('parseConflictDetails', { ...value, oldPersonalNumber: synthetic }),
    null,
  );
  assert.equal(
    call('parseConflictDetails', {
      ...value,
      fields: [{ ...value.fields[0], old: 'Äldre' }],
    }),
    null,
  );
  assert.equal(
    call('parseConflictDetails', { ...value, changedAt: 'fel' }),
    null,
  );
});

test('Periodkonflikt har inga historiska elevvärden eller personnummer', () => {
  const value = {
    kind: 'period',
    currentVersion: 3,
    changedBy: 'Administratör',
    changedAt: '2026-09-28T10:00:00Z',
    period: 'placement',
    reason: 'overlap',
  };
  assert.deepEqual(call('parseConflictDetails', value), value);
  assert.equal(
    call('parseConflictDetails', { ...value, reason: 'hemlig elevuppgift' }),
    null,
  );
});

test('Sidstorlek och sekundär sortering är bestämda', () => {
  assert.equal(model.PUPIL_PAGE_SIZE, 50);
  assert.equal(model.HISTORY_PAGE_SIZE, 20);
  assert.deepEqual(model.PUPIL_SORT, ['displayName', 'id']);
});

test('CSV återanvänder skydd mot kalkylbladsformler', () => {
  assert.equal(
    call(
      'registerCsv',
      ['displayName'],
      [{ displayName: '=1+1', personalNumber: synthetic }],
    ),
    "\uFEFFnamn\r\n'=1+1\r\n",
  );
  assert.throws(() => call('registerCsv', ['unknown'], []));
});

test('Borttagna filter återkommer inte från tidigare urval', () => {
  const previous = {
    ...defaults,
    grade: 3,
    status: 'aktuell',
    classId: unitId,
  };
  assert.deepEqual(
    call('selectionFromQuery', call('selectionToQuery', defaults), previous),
    defaults,
  );
});

test('Identitetskonflikt signaleras utan något nummer', () => {
  const value = {
    kind: 'identity',
    currentVersion: 2,
    changedBy: 'Administratör',
    changedAt: '2026-09-28T10:00:00Z',
    field: 'personalNumber',
  };
  assert.deepEqual(call('parseConflictDetails', value), value);
  assert.equal(
    call('parseConflictDetails', { ...value, current: synthetic }),
    null,
  );
});

test('Konfliktfält validerar datatyp och avvisar dubbla fält', () => {
  const base = {
    kind: 'fields',
    currentVersion: 2,
    changedBy: 'Administratör',
    changedAt: '2026-09-28T10:00:00Z',
  };
  const item = {
    field: 'startsOn',
    submitted: '2026-08-01',
    current: '2026-09-01',
  };
  assert.notEqual(
    call('parseConflictDetails', { ...base, fields: [item] }),
    null,
  );
  assert.equal(
    call('parseConflictDetails', { ...base, fields: [item, item] }),
    null,
  );
  assert.equal(
    call('parseConflictDetails', {
      ...base,
      fields: [{ ...item, current: '2026-02-30' }],
    }),
    null,
  );
  assert.equal(call('parseConflictDetails', { ...base, fields: [] }), null);
});

test('Konfliktnamn följer databasens gräns på 240 tecken', () => {
  const value = {kind:'fields',currentVersion:2,changedBy:'Administratör',changedAt:'2026-09-28T10:00:00Z',fields:[{field:'displayName',submitted:'A'.repeat(240),current:'B'.repeat(240)}]};
  assert.deepEqual(call('parseConflictDetails', value),value);
  assert.equal(call('parseConflictDetails',{...value,fields:[{...value.fields[0],current:'B'.repeat(241)}]}),null);
});

test('Exportkroppen speglar serverns {mode, export} och sidan skickas inte vidare', () => {
  const ids = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'];
  const marked = call('exportPost', 'preview', {
    schoolYear: 2026, caseId: null, fields: ['displayName', 'id'], includePersonalNumber: false,
    protectedIds: [], target: { kind: 'marked', ids },
  });
  assert.deepEqual(marked, { ok: true, post: { mode: 'preview', export: {
    schoolYear: 2026, caseId: null, fields: ['id', 'displayName'], protectedIds: [],
    includePersonalNumber: false, mode: 'ids', ids: [ids[0]],
  } } });
  const filtered = call('exportPost', 'download', {
    schoolYear: 2026, caseId: null, fields: ['id'], includePersonalNumber: true,
    protectedIds: [], target: { kind: 'selection', selection: { ...defaults, page: 4 }, search: 'Test' },
  });
  assert.equal(filtered.ok, true);
  assert.equal(filtered.post.mode, 'download');
  assert.equal(filtered.post.export.mode, 'filter');
  assert.equal(filtered.post.export.selection.page, 1);
  assert.equal(filtered.post.export.includePersonalNumber, true);
  assert.deepEqual(Object.keys(filtered.post).sort(), ['export', 'mode']);
});

test('Tomt exporturval stoppas före anrop och förval är bara Elev-ID och Namn', () => {
  const base = { schoolYear: 2026, caseId: null, includePersonalNumber: false, protectedIds: [] };
  assert.deepEqual(call('exportPost', 'preview', { ...base, fields: [], target: { kind: 'marked', ids: ['20000000-0000-4000-8000-000000000001'] } }), { ok: false, reason: 'fields' });
  assert.deepEqual(call('exportPost', 'preview', { ...base, fields: ['id'], target: { kind: 'marked', ids: [] } }), { ok: false, reason: 'pupils' });
  assert.deepEqual(model.DEFAULT_EXPORT_FIELDS, ['id', 'displayName']);
  assert.throws(() => call('exportPost', 'preview', { ...base, fields: ['id'], target: { kind: 'selection', selection: { ...defaults, schoolYear: 2025 }, search: '' } }));
});

test('Placeringar grupperas som aktuell, framtida och avslutad mot referensdatum', () => {
  const groups = call('groupPlacements', [
    { id: 'c', startsOn: '2027-08-15', endsOn: null },
    { id: 'a', startsOn: '2024-08-15', endsOn: '2025-06-30' },
    { id: 'b', startsOn: '2025-07-01', endsOn: '2027-08-14' },
    { id: 'z', startsOn: '2022-08-15', endsOn: '2024-06-30' },
  ], '2026-09-28');
  assert.deepEqual(groups.aktuell.map((p) => p.id), ['b']);
  assert.deepEqual(groups.framtida.map((p) => p.id), ['c']);
  assert.deepEqual(groups.avslutad.map((p) => p.id), ['a', 'z']);
});

test('Maskerat personnummer visar bara födelsedatum', () => {
  assert.equal(call('maskedPersonalNumber', '2012-03-04'), '20120304-••••');
  assert.throws(() => call('maskedPersonalNumber', '2012-02-30'));
});

test('Konfliktval: sparat värde skickas inte, eget värde bara vid uttryckligt val', () => {
  const submitted = { displayName: 'Test Ny', personalNumber: 'TEST-20120304-0000', protectedIdentity: true };
  assert.deepEqual(call('resolvedBasics', submitted, ['displayName'], {}), { personalNumber: 'TEST-20120304-0000', protectedIdentity: true });
  assert.deepEqual(call('resolvedBasics', submitted, ['displayName'], { displayName: 'mine' }), submitted);
  assert.deepEqual(call('resolvedBasics', { displayName: 'Test Ny' }, ['displayName'], { displayName: 'saved' }), {});
  assert.deepEqual(call('resolvedBasics', submitted, ['personalNumber', 'displayName'], { personalNumber: 'mine', displayName: 'saved' }), { personalNumber: 'TEST-20120304-0000', protectedIdentity: true });
});

test('CSV-radräkning ignorerar rubrik, BOM och radbrytning i citerad cell', () => {
  const csv = call('registerCsv', ['id', 'displayName'], [
    { id: '20000000-0000-4000-8000-000000000001', displayName: 'Test\r\nElev' },
    { id: '20000000-0000-4000-8000-000000000002', displayName: '=Test' },
  ]);
  assert.equal(call('csvDataRowCount', csv), 2);
  assert.equal(call('csvDataRowCount', '﻿elev_id\r\n'), 0);
  assert.equal(call('csvDataRowCount', 'a\r\nb'), 1);
});

// 04-24: skyddsval i exporten ur serverns lista, aldrig förvalt.
const p1 = '20000000-0000-4000-8000-000000000001';
const p2 = '20000000-0000-4000-8000-000000000002';
const p3 = '20000000-0000-4000-8000-000000000003';
const caps = (canReadProtected) => ({ canEdit: true, canExport: true, canRevealPersonalNumber: true, canReadHistory: true, canReadProtected });
test('Skyddsvalet i exporten kommer ur serverns protectedIds och är tomt för obehörig', () => {
  const entitled = { capabilities: caps(true), protectedIds: [p1, p2, p1] };
  assert.deepEqual(call('protectedExportChoice', entitled, { kind: 'selection' }), { count: 2, ids: [p1, p2] });
  assert.deepEqual(call('protectedExportChoice', entitled, { kind: 'marked', ids: [p3, p2, p2] }), { count: 1, ids: [p2] });
  assert.deepEqual(call('protectedExportChoice', entitled, { kind: 'marked', ids: [p3] }), { count: 0, ids: [] });
  // Obehörig får alltid tomt, även om ett avvikande svar skulle innehålla ID.
  assert.deepEqual(call('protectedExportChoice', { capabilities: caps(false), protectedIds: [p1] }, { kind: 'selection' }), { count: 0, ids: [] });
  assert.deepEqual(call('protectedExportChoice', { capabilities: caps(false) }, { kind: 'marked', ids: [p1] }), { count: 0, ids: [] });
  assert.deepEqual(call('protectedExportChoice', { capabilities: caps(true) }, { kind: 'selection' }), { count: 0, ids: [] });
});
test('Exportkroppen tar med skyddade ID bara efter uttryckligt val', () => {
  const base = { schoolYear: 2026, caseId: null, fields: ['id'], includePersonalNumber: false, protectedIds: [p1, p1, p2], target: { kind: 'marked', ids: [p1, p2, p3] } };
  assert.deepEqual(call('exportPost', 'preview', base).post.export.protectedIds, []);
  assert.deepEqual(call('exportPost', 'preview', { ...base, includeProtected: false }).post.export.protectedIds, []);
  assert.deepEqual(call('exportPost', 'download', { ...base, includeProtected: true }).post.export.protectedIds, [p1, p2]);
  assert.deepEqual(call('exportPost', 'download', { ...base, includeProtected: 'true' }).post.export.protectedIds, []);
});
