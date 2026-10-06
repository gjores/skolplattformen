import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planningYearRange, planningYearLabel, stockholmDate, planningYearAt,
  projectGymYear, projectGymTimplanYear, projectGrYear, projectImYear,
} from './planning-year-model.ts';

const start = startedOn => ({ provenance: 'program-version', startedOn, academicYear: null });
const planId = '55403600-0000-4000-8000-000000000001';
const binding = { planId, version: 2, applicationYear: 2027, columnId: 'ak8' };
const originalMap = { kind: 'verified', planId, version: 2, provenance: 'frozen-plan', columnIds: ['ak7', 'ak8', 'ak9'] };

test('planning years have a bounded July interval including 2100/01', () => {
  assert.deepEqual(planningYearRange(2000), { startsOn: '2000-07-01', endsBefore: '2001-07-01' });
  assert.deepEqual(planningYearRange(2100), { startsOn: '2100-07-01', endsBefore: '2101-07-01' });
  assert.equal(planningYearLabel(2100), '2100/01');
  for (const year of [1999, 2101, NaN, Infinity, 2027.5, '2027']) assert.throws(() => planningYearRange(year));
});
test('server instants use Stockholm midnight and the shared July boundary', () => {
  assert.equal(stockholmDate('2027-06-30T21:59:59Z'), '2027-06-30');
  assert.equal(stockholmDate('2027-06-30T22:00:00Z'), '2027-07-01');
  assert.equal(planningYearAt('2027-06-30T21:59:59Z'), 2026);
  assert.equal(planningYearAt('2027-06-30T22:00:00Z'), 2027);
  assert.equal(stockholmDate('2027-01-14T23:00:00Z'), '2027-01-15');
  for (const instant of ['2027-07-01', '2027-07-01T00:00:00', '2027-02-30T00:00:00Z', '2027-07-01T24:00:00Z', 'bad', Infinity]) assert.throws(() => stockholmDate(instant));
});
test('three verified autumn cohorts project to the original six-term indices', () => {
  for (const [date, grade, indices, relation] of [
    ['2027-08-15', 1, [0, 1], 'new'], ['2026-08-15', 2, [2, 3], 'continuing'], ['2025-08-15', 3, [4, 5], 'continuing'],
  ]) {
    const result = projectGymYear(2027, start(date));
    assert.equal(result.relativeYear, grade);
    assert.deepEqual(result.termIndices, indices);
    assert.equal(result.relation, relation);
    assert.deepEqual(indices.map(i => result.terms[i].label), ['HT 2027', 'VT 2028']);
  }
});
test('January and April keep the actual date and never shift term allocations', () => {
  const values = [45, 55, 100, 0, 0, 0];
  const snapshot = [...values];
  const january = projectGymYear(2027, start('2027-01-15'), values);
  assert.equal(january.startAcademicYear, 2026);
  assert.equal(january.startedOn, '2027-01-15');
  assert.deepEqual(january.termIndices, [2, 3]);
  assert.deepEqual(january.terms.map(t => t.label), ['HT 2026', 'VT 2027', 'HT 2027', 'VT 2028', 'HT 2028', 'VT 2029']);
  assert.ok(january.diagnostics.includes('allocation-before-start'));
  assert.deepEqual(projectGymYear(2026, start('2027-04-01'), [0, 100, 0, 0, 0, 0]).reviewTermIndices, [1]);
  assert.deepEqual(values, snapshot);
  assert.equal(projectGymYear(2027, start('2027-06-30')).relativeYear, 2);
  assert.equal(projectGymYear(2027, start('2027-07-01')).relativeYear, 1);
});
test('missing, malformed, unverified and conflicting start evidence stay unknown', () => {
  for (const [evidence, diagnosis] of [
    [start(null), 'missing-start'], [start('2027-02-29'), 'invalid-start'], [start('0001-01-01'), 'invalid-start'], [start(Infinity), 'invalid-start'],
    [{ provenance: 'legacy', startedOn: null, academicYear: 2027 }, 'unverified-start'],
    [{ ...start('2027-01-15'), academicYear: 2027 }, 'conflicting-start'],
  ]) {
    const result = projectGymYear(2027, evidence);
    assert.equal(result.relativeYear, null); assert.equal(result.termIndices, null);
    assert.equal(result.relation, 'unknown'); assert.ok(result.diagnostics.includes(diagnosis));
  }
  assert.equal(projectGymYear(2027, { provenance: 'verified-academic-year', startedOn: null, academicYear: 2026 }).relativeYear, 2);
  assert.equal(projectGymYear(2027, start('2028-08-01')).relation, 'future');
  assert.equal(projectGymYear(2027, start('2024-08-01')).relation, 'finished');
  assert.equal(projectGymYear(2027, start('2024-08-01')).termIndices, null);
});
test('frozen timplan source wins over renamed cohort and changed current education', () => {
  const plan = { source: { startedOn: '2026-08-15' }, education: { cohort: 'start 2099', startedOn: '2028-08-01' } };
  assert.equal(projectGymTimplanYear(2027, plan).relativeYear, 2);
  plan.source.startedOn = null;
  assert.equal(projectGymTimplanYear(2027, plan).relativeYear, null);
});
test('GR uses the binding year and exact original plan column map', () => {
  const result = projectGrYear(2027, binding, originalMap);
  assert.equal(result.grade, 8); assert.equal(result.annualIndex, 1); assert.equal(result.canTargetYearCell, true);
  assert.equal(projectGrYear(2028, binding, originalMap).grade, null);
  assert.ok(projectGrYear(2028, binding, originalMap).diagnostics.includes('binding-year-mismatch'));
  assert.ok(projectGrYear(2027, null, originalMap).diagnostics.includes('missing-binding'));
});
test('same-width GR reorder and a different plan version cannot prove old cell positions', () => {
  const unknown = projectGrYear(2027, binding, { kind: 'unknown' });
  assert.equal(unknown.grade, 8); assert.equal(unknown.annualIndex, null); assert.equal(unknown.canTargetYearCell, false);
  assert.ok(unknown.diagnostics.includes('unverified-column-map'));
  // A mutable current offering [8,7,9] is deliberately not an accepted map provenance.
  const reordered = { ...originalMap, provenance: 'current-offering', columnIds: ['ak8', 'ak7', 'ak9'] };
  assert.equal(projectGrYear(2027, binding, reordered).annualIndex, null);
  assert.equal(projectGrYear(2027, binding, { ...originalMap, version: 3 }).annualIndex, null);
  assert.equal(projectGrYear(2027, binding, { ...originalMap, columnIds: ['ak7', 'ak9'] }).annualIndex, null);
});
test('IM keeps weekly hours without an assumed three-year projection', () => {
  assert.deepEqual(projectImYear(2027), { schoolYear: 2027, relativeYear: null, termIndices: null, measure: 'hours-per-week' });
});
