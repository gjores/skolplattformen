import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTimplanMinutes, timplanBudgetMinimum } from './timplan-budget.ts';

const plan = (code = 'BA25', points = 2800) => ({ source: { catalogId: 'frozen', startedOn: '2027-08-01', education: { programCode: code } }, rows: [{ points }] });
test('APL is checked to the minute independently from the total GUT budget', () => {
  const minimum = timplanBudgetMinimum(plan());
  assert.deepEqual(minimum, { totalMinutes: 2720 * 60, aplMinutes: 20700 });
  assert.equal(compareTimplanMinutes(2720 * 60, minimum.totalMinutes).sufficient, true);
  assert.deepEqual(compareTimplanMinutes(20699, minimum.aplMinutes), { planned: 20699, minimum: 20700, missing: 1, sufficient: false });
  for (const amount of [20700, 20701]) assert.equal(compareTimplanMinutes(amount, minimum.aplMinutes).sufficient, true);
  assert.equal(compareTimplanMinutes(null, minimum.aplMinutes).sufficient, false);
  assert.equal(compareTimplanMinutes(0, minimum.aplMinutes).missing, 20700);
});
test('known programme profiles use their own total; preparatory programmes have no APL requirement', () => {
  assert.deepEqual(timplanBudgetMinimum(plan('BF25', 2700)), { totalMinutes: 2625 * 60, aplMinutes: 20700 });
  assert.deepEqual(timplanBudgetMinimum(plan('SA25', 2500)), { totalMinutes: 2180 * 60, aplMinutes: null });
  assert.equal(compareTimplanMinutes(2180 * 60 - 1, 2180 * 60).missing, 1);
});
test('unknown, mismatched, old and unsupported future scopes never produce an attained minimum', () => {
  for (const mutate of [p => p.source.catalogId = null, p => p.source.startedOn = null, p => p.source.startedOn = '2024-08-01', p => p.source.startedOn = '2028-07-02', p => p.source.education.programCode = 'UNKNOWN', p => p.rows[0].points++]) {
    const p = plan(); mutate(p); assert.equal(timplanBudgetMinimum(p), null);
  }
  assert.equal(timplanBudgetMinimum({ ...plan('SA25', 2500), source: { ...plan('SA25', 2500).source, startedOn: '2028-08-01' } }).totalMinutes, 2180 * 60);
});
