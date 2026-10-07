import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePlanningSetup, parsePlanningSelection, parsePlanningList, parsePlanningOverview, planningAnnualMetrics,
} from './planning-year-contract.ts';

const id = n => `55403600-0000-4000-8000-${String(n).padStart(12, '0')}`;
const revision = `sha256:${'a'.repeat(64)}`;
const setup = () => ({ customerId: id(1), serverDate: '2026-10-06', currentYear: 2026, minimumYear: 2000, maximumYear: 2100,
  units: [2, 3].map(n => ({ unitId: id(n), schoolName: `Skola ${n}`, canRead: { programplan: true, gymnasium: true, grundskola: true, introduktionsprogram: true } })) });
const selection = changes => ({ schoolYear: 2027, unitId: null, view: 'timplan', schoolform: 'gymnasium', query: '', status: 'all',
  cohortRelation: 'all', archive: 'active', grade: null, sort: 'name', direction: 'asc', page: 1, selectionRevision: null, ...changes });
const cell = (rowKey = 'alternative:foundation:REL:1:REL1000X+FIL:1:FIL1000X') => ({ rowKey, points: 200,
  pointTerms: [0, 0, 60, 40, 50, 50], hourValues: [null, null, 45, 35, 40, 40] });
const row = (unit = 2, changes = {}) => ({ customerId: id(1), unitId: id(unit), offeringId: id(4), schoolName: `Skola ${unit}`,
  educationName: 'Syntetisk utbildning', cohort: 'Börjar inte enligt denna fritext 2099', schoolform: 'gymnasium',
  plan: { id: id(10 + unit), version: 2, revision: 7, status: 'utkast' },
  source: { planId: id(5), offeringId: id(4), version: 1, revision: 3 },
  start: { provenance: 'timplan-source', startedOn: '2026-08-15', academicYear: 2026, legacyYear: 2026 },
  relativeYear: 2, relation: 'continuing', underlag: 'planning', archived: false, columnMap: null, application: null,
  classes: [], cells: [cell()], diagnostics: [], ...changes });
const list = (rows, selected = selection(), count = rows.length) => ({ selection: selected, selectionRevision: revision, count, pageSize: 50, rows });
const measure = (known, complete = true) => ({ value: complete ? known : null, known, complete });
const totals = changes => ({ points: measure(100), annualHours: measure(160), weeklyHours: measure(0), classCount: measure(0), hasForecast: false, ...changes });
const overview = (rows, selected = selection(), total = totals()) => ({ selection: selected, selectionRevision: revision, count: rows.length, rows, totals: total });
const parseList = (rows, selected = selection(), count = rows.length) => parsePlanningList(list(rows, selected, count), selected, setup());
const grRow = changes => row(2, { schoolform: 'grundskola', source: null,
  start: { provenance: 'legacy', startedOn: null, academicYear: null, legacyYear: 2020 }, relativeYear: null, relation: 'unknown',
  underlag: 'class-bound', application: { schoolYear: 2027, planId: id(12), version: 2, columnId: 'ak8' },
  columnMap: { kind: 'verified', planId: id(12), version: 2, provenance: 'verified-original', columnIds: ['ak7', 'ak8', 'ak9'] },
  classes: [{ id: id(40), customerId: id(1), unitId: id(2), offeringId: id(4) }],
  cells: [{ rowKey: 'svenska', points: null, pointTerms: null, hourValues: [100, 110, 120] }], ...changes });

test('setup uses the server date and current mandate capabilities without register calendars', () => {
  assert.deepEqual(parsePlanningSetup(setup()), setup());
  for (const changes of [{ serverDate: '2026-02-30' }, { currentYear: 2027 }, { maximumYear: 2099 }, { school_years: [] }, { units: [setup().units[0], setup().units[0]] }])
    assert.throws(() => parsePlanningSetup({ ...setup(), ...changes }));
  const gymOnly = setup(); gymOnly.units[0].canRead.grundskola = false;
  assert.throws(() => parsePlanningSelection(selection({ schoolform: 'grundskola', unitId: id(2) }), gymOnly));
});
test('selection rejects unknown filters, wrong schoolform combinations and unstamped later pages', () => {
  assert.deepEqual(parsePlanningSelection(selection(), setup()), selection());
  assert.equal(parsePlanningSelection(selection({ page: 2, selectionRevision: revision }), setup()).page, 2);
  for (const changes of [{ schoolYear: 2101 }, { unitId: id(99) }, { sort: 'sql' }, { direction: 'sideways' }, { query: 'x'.repeat(201) },
    { query: 'bad\nquery' }, { query: ' padded ' }, { page: 2 }, { page: 1.2 }, { selectionRevision: 'forged' }, { actorId: id(1) },
    { view: 'programplan', schoolform: 'grundskola' }, { schoolform: 'introduktionsprogram', grade: 1 }, { grade: 4 }, { status: 'klar' }])
    assert.throws(() => parsePlanningSelection(selection(changes), setup()));
});
test('list strictly echoes the full selection and result revision with exact page sizes', () => {
  assert.equal(parseList([row()]).count, 1);
  const expected = selection({ page: 2, selectionRevision: revision });
  assert.equal(parsePlanningList(list([row()], expected, 51), expected, setup()).rows.length, 1);
  assert.throws(() => parsePlanningList(list([row()], expected, 52), expected, setup()));
  assert.throws(() => parsePlanningList({ ...list([row()], expected, 51), selectionRevision: `sha256:${'b'.repeat(64)}` }, expected, setup()));
  assert.throws(() => parsePlanningList(list([row()], selection({ schoolYear: 2028 })), selection(), setup()));
});
test('wire shapes reject custom prototypes, hidden fields, accessors and sparse arrays', () => {
  const withGetter = selection(); Object.defineProperty(withGetter, 'query', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => parsePlanningSelection(withGetter));
  const hidden = selection(); Object.defineProperty(hidden, 'extra', { value: true });
  assert.throws(() => parsePlanningSelection(hidden));
  assert.throws(() => parsePlanningSelection(Object.assign(Object.create({}), selection())));
  const symbol = selection(); symbol[Symbol('secret')] = 1; assert.throws(() => parsePlanningSelection(symbol));
  const sparse = [row(), row(), row(3)]; Reflect.deleteProperty(sparse, '1'); assert.throws(() => parseList(sparse));
  const extra = [row()]; extra.extra = 1; assert.throws(() => parseList(extra));
  const nullPrototype = Object.assign(Object.create(null), selection()); assert.deepEqual(parsePlanningSelection(nullPrototype), selection());
});
test('rows reject forged plan, source, class and selection references', () => {
  for (const changes of [{ customerId: id(99) }, { unitId: id(99) }, { source: { ...row().source, offeringId: id(99) } },
    { relativeYear: 1 }, { relation: 'new' }, { schoolName: 'Fel skola' }, { cells: [cell(), cell()] }, { plan: { ...row().plan, version: 0 } },
    { classes: [{ id: '8A', customerId: id(1), unitId: id(2), offeringId: id(4) }] },
    { classes: [{ id: id(40), customerId: id(1), unitId: id(3), offeringId: id(4) }] }]) assert.throws(() => parseList([row(2, changes)]));
  assert.throws(() => parseList([row(), row()]));
  assert.throws(() => parseList([row()], selection({ unitId: id(3) })));
  assert.throws(() => parseList([row()], selection({ grade: 1 })));
  const program = row(2, { start: { ...row().start, provenance: 'program-version' } });
  assert.throws(() => parseList([program], selection({ view: 'programplan' })));
});
test('two schools deduplicate one program alternative but keep each school frame and unique classes', () => {
  const bound = unit => row(unit, { underlag: 'class-bound', application: { schoolYear: 2027, planId: id(10 + unit), version: 2, columnId: null },
    classes: [40 + unit, 50 + unit].map(n => ({ id: id(n), customerId: id(1), unitId: id(unit), offeringId: id(4) })) });
  const first = bound(2), second = bound(3); second.cells[0].hourValues = [null, null, 55, 45, 40, 40];
  const parsed = parsePlanningOverview(overview([first, second], selection(), totals({ annualHours: measure(180), classCount: measure(4) })), selection(), setup());
  assert.equal(parsed.totals.points.value, 100); assert.equal(parsed.totals.annualHours.value, 180); assert.equal(parsed.totals.classCount.value, 4);
  assert.deepEqual(planningAnnualMetrics(parsed.rows[0], 2027).hours, measure(80));
  assert.throws(() => parsePlanningOverview(overview([first, second], selection(), totals({ points: measure(200), annualHours: measure(360), classCount: measure(4) })), selection(), setup()));
});
test('null means unallocated, explicit zero stays complete, and points incompleteness is visible', () => {
  const zero = row(); zero.cells[0].hourValues[2] = 0; zero.cells[0].hourValues[3] = 0;
  assert.deepEqual(planningAnnualMetrics(parseList([zero]).rows[0], 2027).hours, measure(0));
  const missing = row(); missing.cells[0].hourValues[3] = null; missing.diagnostics = ['missing-hours'];
  const parsed = parsePlanningOverview(overview([missing], selection(), totals({ annualHours: measure(45, false) })), selection(), setup());
  assert.deepEqual(parsed.totals.annualHours, measure(45, false));
  assert.throws(() => parseList([row(2, { cells: missing.cells })]));
  const points = row(); points.cells[0].points = 300; points.diagnostics = ['missing-points', 'missing-hours'];
  const incomplete = planningAnnualMetrics(parseList([points]).rows[0], 2027);
  assert.deepEqual(incomplete.points, measure(100, false));
  assert.deepEqual(incomplete.hours, measure(80, false));
});
test('legacy missing metadata survives with a named gap and never borrows the cohort text', () => {
  const legacy = row(2, { start: { provenance: 'legacy', startedOn: null, academicYear: null, legacyYear: 2027 }, relativeYear: null,
    relation: 'unknown', diagnostics: ['unverified-start', 'missing-hours', 'missing-points'] });
  const parsed = parseList([legacy]).rows[0];
  assert.equal(parsed.relativeYear, null); assert.equal(parsed.start.legacyYear, 2027);
  assert.deepEqual(planningAnnualMetrics(parsed, 2027).hours, measure(0, false));
});
test('GR grade binding survives an unknown original map with same-width mutable reordering', () => {
  const selected = selection({ schoolform: 'grundskola', grade: 8 });
  const known = parseList([grRow()], selected).rows[0];
  assert.deepEqual(planningAnnualMetrics(known, 2027).hours, measure(110));
  const unknown = grRow({ columnMap: { kind: 'unknown' }, diagnostics: ['unverified-column-map', 'missing-hours'] });
  assert.deepEqual(planningAnnualMetrics(parseList([unknown], selected).rows[0], 2027).hours, measure(0, false));
  assert.throws(() => parseList([grRow({ columnMap: { ...grRow().columnMap, provenance: 'current-offering', columnIds: ['ak8', 'ak7', 'ak9'] } })], selected));
  assert.throws(() => parseList([grRow({ columnMap: { ...grRow().columnMap, version: 3 } })], selected));
  assert.throws(() => parseList([grRow({ application: { ...grRow().application, schoolYear: 2028 } })], selected));
});
test('two GR grades in one plan count the same class once and the exact columns separately', () => {
  const a = grRow(), b = grRow({ application: { ...grRow().application, columnId: 'ak9' } });
  const selected = selection({ schoolform: 'grundskola' });
  const parsed = parsePlanningOverview(overview([a, b], selected, totals({ points: null, annualHours: measure(230), classCount: measure(1) })), selected, setup());
  assert.equal(parsed.totals.annualHours.value, 230); assert.equal(parsed.totals.classCount.value, 1);
});
test('IM weekly hours remain separate and forecasts require an explicit diagnosis', () => {
  const selected = selection({ schoolform: 'introduktionsprogram' });
  const im = row(2, { schoolform: 'introduktionsprogram', source: null, start: { provenance: 'legacy', startedOn: null, academicYear: null, legacyYear: null },
    relativeYear: null, relation: 'unknown', underlag: 'forecast', cells: [{ rowKey: 'im-sv', points: null, pointTerms: null, hourValues: [4] }], diagnostics: ['forecast'] });
  const parsed = parsePlanningOverview(overview([im], selected, totals({ points: null, annualHours: measure(0), weeklyHours: measure(4), hasForecast: true })), selected, setup());
  assert.equal(parsed.totals.weeklyHours.value, 4); assert.equal(parsed.totals.annualHours.value, 0);
  assert.equal(planningAnnualMetrics(parsed.rows[0], 2027).measure, 'hours-per-week');
  assert.throws(() => parseList([{ ...im, diagnostics: [] }], selected));
});
test('missing plans carry no fabricated version, source, cells or class application', () => {
  const missing = row(2, { plan: null, source: null, cells: [], underlag: 'missing', diagnostics: ['missing-plan', 'missing-hours', 'missing-points'] });
  assert.equal(parseList([missing]).rows[0].plan, null);
  assert.throws(() => parseList([{ ...missing, source: row().source }]));
});
test('conflicting duplicate source versions and oversized cell payloads fail closed', () => {
  const a = row(), b = row(3); b.cells[0].pointTerms = [0, 0, 50, 50, 50, 50];
  assert.throws(() => parsePlanningOverview(overview([a, b]), selection(), setup()));
  assert.throws(() => parseList([row(2, { cells: Array(2001).fill(cell()) })]));
  const classes = row(2, { classes: Array(1001).fill({ id: id(40), customerId: id(1), unitId: id(2), offeringId: id(4) }) });
  assert.throws(() => parseList([classes]));
});
test('a single source or school plan cannot carry inconsistent canonical rows or column maps', () => {
  const a = row(), b = row(3); b.cells[0].rowKey = 'block:individual';
  assert.throws(() => parseList([a, b]));
  const grA = grRow(), grB = grRow({ application: { ...grRow().application, columnId: 'ak9' },
    columnMap: { ...grRow().columnMap, columnIds: ['ak9', 'ak8', 'ak7'] } });
  assert.throws(() => parseList([grA, grB], selection({ schoolform: 'grundskola' })));
  const grC = grRow({ application: { ...grRow().application, columnId: 'ak9' } }); grC.cells[0].hourValues[2] = 121;
  assert.throws(() => parseList([grA, grC], selection({ schoolform: 'grundskola' })));
});
test('an empty gym selection has zero frames while incomplete points also block a complete hour total', () => {
  const emptyTotals = totals({ points: measure(0), annualHours: measure(0) });
  assert.deepEqual(parsePlanningOverview(overview([], selection(), emptyTotals), selection(), setup()).totals, emptyTotals);
  const incomplete = row(); incomplete.cells[0].points = 300; incomplete.diagnostics = ['missing-points', 'missing-hours'];
  const parsed = parsePlanningOverview(overview([incomplete], selection(), totals({ points: measure(100, false), annualHours: measure(80, false) })), selection(), setup());
  assert.equal(parsed.totals.annualHours.complete, false);
});
test('GR group summaries never double-count member hours and unknown rows stay incomplete', () => {
  const selected = selection({ schoolform: 'grundskola' });
  const cells = ['no', 'biologi', 'fysik', 'kemi'].map(rowKey => ({ rowKey, points: null, pointTerms: null, hourValues: [0, rowKey === 'no' ? 90 : 30, 0] }));
  const conflict = grRow({ cells, diagnostics: ['inactive-hours', 'missing-hours'] });
  const parsed = parsePlanningOverview(overview([conflict], selected, totals({ points: null, annualHours: measure(90, false), classCount: measure(1) })), selected, setup());
  assert.deepEqual(planningAnnualMetrics(parsed.rows[0], 2027).hours, measure(90, false));
  const clean = structuredClone(conflict); clean.cells[0].hourValues[1] = 0; clean.diagnostics = [];
  assert.deepEqual(planningAnnualMetrics(parseList([clean], selected).rows[0], 2027).hours, measure(90));
  const unknown = grRow({ cells: [{ rowKey: 'legacy-unknown', points: null, pointTerms: null, hourValues: [10, 20, 30] }], diagnostics: ['unknown-row', 'missing-hours'] });
  assert.deepEqual(planningAnnualMetrics(parseList([unknown], selected).rows[0], 2027).hours, measure(0, false));
});
test('unresolved legacy class identity preserves its verified year binding with an unknown class count', () => {
  const selected = selection({ schoolform: 'grundskola', grade: 8 });
  const unresolved = grRow({ classes: [], diagnostics: ['ambiguous-class'] });
  const parsed = parsePlanningOverview(overview([unresolved], selected, totals({ points: null, annualHours: measure(110), classCount: measure(0, false) })), selected, setup());
  assert.equal(parsed.rows[0].application.columnId, 'ak8');
  assert.deepEqual(parsed.totals.classCount, measure(0, false));
  assert.throws(() => parseList([{ ...unresolved, diagnostics: [] }], selected));
});
test('alternative member order or a constituent row cannot count the same programme item twice', () => {
  for (const extra of ['alternative:foundation:FIL:1:FIL1000X+REL:1:REL1000X', 'foundation:REL:1:REL1000X'])
    assert.throws(() => parseList([row(2, { cells: [cell(), cell(extra)] })]));
  assert.throws(() => parseList([row(2, { cells: [cell('alternative:foundation:REL:1:REL1000X+REL:1:REL1000X')] })]));
});
test('relevant cohorts combine new, continuing and unknown without including finished frames', () => {
  const selected = selection({ cohortRelation: 'relevant' });
  assert.equal(parseList([row()], selected).rows.length, 1);
  const finished = row(2, { start: { ...row().start, startedOn: '2024-08-15', academicYear: 2024 }, relativeYear: null,
    relation: 'finished', diagnostics: ['outside-three-years', 'missing-points', 'missing-hours'] });
  assert.throws(() => parseList([finished], selected));
  assert.equal(parseList([finished], selection({ cohortRelation: 'finished' })).rows.length, 1);
});
test('overview bounds total class references even when each individual row is within bounds', () => {
  const classes = Array.from({ length: 1000 }, (_, n) => ({ id: id(2000 + n), customerId: id(1), unitId: id(2), offeringId: id(4) }));
  const rows = Array.from({ length: 51 }, (_, n) => row(2, { plan: { ...row().plan, id: id(6000 + n) }, classes }));
  const allowed = rows.slice(0, 50);
  assert.equal(parsePlanningOverview(overview(allowed, selection(), totals({ annualHours: measure(4000), classCount: measure(1000) })), selection(), setup()).count, 50);
  assert.throws(() => parsePlanningOverview(overview(rows, selection(), totals({ annualHours: measure(4080), classCount: measure(1000) })), selection(), setup()));
});


// Separate new-contract coverage; the historical legacy-row tests above remain unchanged.
const searchDetails = changes => ({ localCode: "SA-local %_ O'Neil", programCode: 'SA25', orientationCode: 'SABEP',
  programName: 'Samhällsvetenskapsprogrammet', orientationName: 'Beteendevetenskap', ...changes });
const nullSearchDetails = changes => searchDetails({ localCode: null, programCode: null, orientationCode: null,
  programName: null, orientationName: null, ...changes });
const imSearchRow = changes => row(2, { schoolform: 'introduktionsprogram', source: null,
  start: { provenance: 'legacy', startedOn: null, academicYear: null, legacyYear: null }, relativeYear: null, relation: 'unknown',
  cells: [{ rowKey: 'im-sv', points: null, pointTerms: null, hourValues: [4] }], ...changes });
const programSearchRow = changes => row(2, { plan: { id: id(5), version: 1, revision: 3, status: 'utkast' },
  start: { ...row().start, provenance: 'program-version' }, cells: [{ ...cell(), hourValues: null }], ...changes });
const searchForms = () => [
  { input: row(), selected: selection(), total: totals({ annualHours: measure(80) }) },
  { input: programSearchRow(), selected: selection({ view: 'programplan' }), total: totals({ annualHours: measure(0) }) },
  { input: grRow(), selected: selection({ schoolform: 'grundskola' }), total: totals({ points: null, annualHours: measure(110), classCount: measure(1) }) },
  { input: imSearchRow(), selected: selection({ schoolform: 'introduktionsprogram' }), total: totals({ points: null, annualHours: measure(0), weeklyHours: measure(4) }) },
];
test('legacy19 stays byte-shape equivalent and does not gain searchDetails in list or overview', () => {
  for (const { input, selected, total } of searchForms()) {
    assert.equal(Object.keys(input).length, 19);
    for (const parsed of [parseList([input], selected), parsePlanningOverview(overview([input], selected, total), selected, setup())]) {
      assert.deepEqual(parsed.rows[0], input);
      assert.equal(JSON.stringify(parsed.rows[0]), JSON.stringify(input));
      assert.equal(Object.hasOwn(parsed.rows[0], 'searchDetails'), false);
    }
  }
});
test('extended20 retains exactly five parsed education details without changing plan/source/metrics', () => {
  for (const { input, selected, total } of searchForms()) {
    input.searchDetails = input.schoolform === 'gymnasium' ? searchDetails() : nullSearchDetails({ localCode: 'Lokal GR/IM %_ Å' });
    for (const parsed of [parseList([input], selected), parsePlanningOverview(overview([input], selected, total), selected, setup())]) {
      assert.deepEqual(parsed.rows[0], input); assert.equal(Object.keys(parsed.rows[0]).length, 20);
      assert.equal(Object.keys(parsed.rows[0].searchDetails).length, 5);
      assert.notEqual(parsed.rows[0].searchDetails, input.searchDetails);
      const legacy = { ...input }; delete legacy.searchDetails;
      assert.deepEqual(planningAnnualMetrics(parsed.rows[0], selected.schoolYear), planningAnnualMetrics(parseList([legacy], selected).rows[0], selected.schoolYear));
    }
  }
});
test('GY null metadata, absent orientation and own codes without a verified name remain explicit', () => {
  for (const details of [nullSearchDetails(), searchDetails({ orientationCode: null, orientationName: null }),
    searchDetails({ programCode: 'Äldre_25-X', orientationCode: 'EGEN', programName: null, orientationName: null }),
    searchDetails({ orientationName: null })]) {
    const parsed = parseList([row(2, { searchDetails: details })]).rows[0];
    assert.deepEqual(parsed.searchDetails, details);
    assert.deepEqual(parsed.source, row().source); assert.deepEqual(parsed.start, row().start);
  }
});
test('local code and names preserve ordinary text with max1000; national codes use the existing max96 grammar', () => {
  const valid = searchDetails({ localCode: " %_ O'Neil Å / code " });
  assert.deepEqual(parseList([row(2, { searchDetails: valid })]).rows[0].searchDetails, valid);
  for (const key of ['localCode', 'programName', 'orientationName']) {
    const value = searchDetails({ [key]: 'Å'.repeat(1000) });
    assert.equal(parseList([row(2, { searchDetails: value })]).rows[0].searchDetails[key].length, 1000);
    for (const bad of ['x'.repeat(1001), 'bad\ntext', 'bad\u0000text', 'bad\u007ftext', 7, false, [], {}])
      assert.throws(() => parseList([row(2, { searchDetails: searchDetails({ [key]: bad }) })]));
  }
  for (const key of ['programCode', 'orientationCode']) {
    assert.equal(parseList([row(2, { searchDetails: searchDetails({ [key]: 'Å' + '1'.repeat(95) }) })]).rows[0].searchDetails[key].length, 96);
    for (const bad of ['', '1SA', 'SA 25', 'SA/25', 'SA%25', 'SA.25', "SA'25", 'x'.repeat(97), 'constructor', 'prototype', '__proto__', 25, [], {}])
      assert.throws(() => parseList([row(2, { searchDetails: searchDetails({ [key]: bad }) })]));
  }
});
test('present undefined, partial metadata, extra keys and incomplete legacy rows never select a loose shape', () => {
  for (const details of [undefined, null, [], 'raw', 1]) assert.throws(() => parseList([row(2, { searchDetails: details })]));
  for (const key of Object.keys(searchDetails())) {
    const missing = searchDetails(); delete missing[key];
    assert.throws(() => parseList([row(2, { searchDetails: missing })]));
    assert.throws(() => parseList([row(2, { searchDetails: searchDetails({ [key]: undefined }) })]));
  }
  for (const extra of ['catalog', 'programRef', 'sourcePlanId', 'role', 'local_code'])
    assert.throws(() => parseList([row(2, { searchDetails: searchDetails({ [extra]: true }) })]));
  for (const extended of [false, true]) {
    const value = row(); if (extended) value.searchDetails = searchDetails();
    const extra = { ...value, private: true }; assert.throws(() => parseList([extra]));
    const hidden = { ...value }; Object.defineProperty(hidden, 'private', { value: true }); assert.throws(() => parseList([hidden]));
    const missing = { ...value }; delete missing.cohort; assert.throws(() => parseList([missing]));
  }
});
test('searchDetails and row descriptors reject getters/setters/symbols/custom prototypes without executing accessors', () => {
  let invoked = 0;
  for (const key of Object.keys(searchDetails())) {
    for (const accessor of ['get', 'set']) {
      const details = searchDetails(); Object.defineProperty(details, key, { enumerable: true, [accessor]() { invoked++; return 'unexpected'; } });
      assert.throws(() => parseList([row(2, { searchDetails: details })]));
    }
  }
  const raw = row(); Object.defineProperty(raw, 'searchDetails', { enumerable: true, get() { invoked++; return searchDetails(); } });
  assert.throws(() => parseList([raw])); assert.equal(invoked, 0);
  for (const decorate of [v => Object.assign(Object.create({}), v), v => { v[Symbol('private')] = 1; return v; },
    v => { Object.defineProperty(v, 'private', { value: true }); return v; }]) {
    assert.throws(() => parseList([row(2, { searchDetails: decorate(searchDetails()) })]));
    assert.throws(() => parseList([decorate(row(2, { searchDetails: searchDetails() }))]));
  }
  const plain = Object.assign(Object.create(null), searchDetails());
  assert.deepEqual(parseList([Object.assign(Object.create(null), row(2, { searchDetails: plain }))]).rows[0].searchDetails, searchDetails());
});
test('names require their own code and an orientation cannot invent a missing program', () => {
  for (const details of [searchDetails({ programCode: null }), searchDetails({ orientationCode: null }),
    nullSearchDetails({ programName: 'Invented' }), nullSearchDetails({ orientationCode: 'SABEP' }), nullSearchDetails({ orientationName: 'Invented' })])
    assert.throws(() => parseList([row(2, { searchDetails: details })]));
});
test('GR and IM retain local text but reject every nonnull national code or catalogue name', () => {
  for (const { input, selected } of searchForms().filter(f => f.input.schoolform !== 'gymnasium')) {
    input.searchDetails = nullSearchDetails({ localCode: 'GR/IM %_ 8-9' });
    assert.deepEqual(parseList([input], selected).rows[0].searchDetails, input.searchDetails);
    for (const key of ['programCode', 'orientationCode', 'programName', 'orientationName'])
      assert.throws(() => parseList([{ ...input, searchDetails: nullSearchDetails({ [key]: key.includes('Code') ? 'SA25' : 'Samhällsvetenskap' }) }], selected));
  }
});
test('extended metadata cannot bypass year/source/class/canonical inventory or total checks', () => {
  const a = row(2, { searchDetails: searchDetails() }), b = row(3, { searchDetails: searchDetails() });
  const parsed = parsePlanningOverview(overview([a, b]), selection(), setup());
  assert.equal(parsed.totals.points.value, 100); assert.equal(parsed.totals.annualHours.value, 160);
  const mixed = parsePlanningOverview(overview([a, row(3)]), selection(), setup());
  assert.equal(Object.hasOwn(mixed.rows[0], 'searchDetails'), true); assert.equal(Object.hasOwn(mixed.rows[1], 'searchDetails'), false);
  for (const changes of [{ relativeYear: 1 }, { source: { ...a.source, offeringId: id(99) } },
    { classes: [{ id: id(40), customerId: id(99), unitId: a.unitId, offeringId: a.offeringId }] }])
    assert.throws(() => parseList([{ ...a, ...changes }]));
  const inconsistent = structuredClone(b); inconsistent.cells[0].pointTerms = [0, 0, 50, 50, 50, 50];
  assert.throws(() => parsePlanningOverview(overview([a, inconsistent]), selection(), setup()));
  assert.throws(() => parsePlanningOverview(overview([a, b], selection(), totals({ points: measure(200) })), selection(), setup()));
  const gr = grRow({ searchDetails: nullSearchDetails() }), selected = selection({ schoolform: 'grundskola' });
  assert.throws(() => parseList([{ ...gr, application: { ...gr.application, schoolYear: 2028 } }], selected));
  assert.throws(() => parseList([{ ...gr, columnMap: { ...gr.columnMap, version: 3 } }], selected));
});
test('missing plans retain actual education details without fabricating source/cells or verified names', () => {
  const missing = row(2, { plan: null, source: null, cells: [], underlag: 'missing', diagnostics: ['missing-plan', 'missing-hours', 'missing-points'],
    searchDetails: searchDetails({ programName: null, orientationName: null }) });
  const parsed = parseList([missing]).rows[0];
  assert.deepEqual(parsed, missing); assert.equal(parsed.plan, null); assert.equal(parsed.source, null);
  assert.deepEqual(parsed.cells, []); assert.equal(parsed.searchDetails.programName, null);
});
test('extended list pagination still requires exact 50 plus2 and a verified revision', () => {
  const rows = Array.from({ length: 52 }, (_, n) => row(2, { plan: { ...row().plan, id: id(200 + n) }, searchDetails: searchDetails() }));
  assert.equal(parseList(rows.slice(0, 50), selection(), 52).rows.length, 50);
  const second = selection({ page: 2, selectionRevision: revision });
  assert.equal(parseList(rows.slice(50), second, 52).rows.length, 2);
  assert.throws(() => parseList(rows.slice(50, 51), second, 52));
  assert.throws(() => parsePlanningList({ ...list(rows.slice(50), second, 52), selectionRevision: 'sha256:' + 'b'.repeat(64) }, second, setup()));
});
