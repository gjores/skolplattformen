import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_CASES, parseArgs, overallStatus } from './verify-register.mjs';

const passed = (name) => ({ name, status: 'PASS', checks: [
  { kind: 'response', ok: true }, { kind: 'persistent', ok: true },
] });

test('full PASS requires every named case and two independent forms of evidence', () => {
  assert.equal(REQUIRED_CASES.length, 18);
  assert.equal(overallStatus(REQUIRED_CASES.map(passed)), 'PASS');
  assert.equal(overallStatus(REQUIRED_CASES.slice(1).map(passed)), 'FAIL');
  assert.equal(overallStatus([...REQUIRED_CASES.slice(1).map(passed), passed(REQUIRED_CASES[1])]), 'FAIL');
  assert.equal(overallStatus(REQUIRED_CASES.map(name => name === REQUIRED_CASES[0]
    ? { name, status: 'PASS', checks: [{ kind: 'response', ok: true }, { kind: 'response', ok: true }] }
    : passed(name))), 'FAIL');
});

test('partial selection and missing evidence cannot become PASS', () => {
  assert.equal(overallStatus([passed(REQUIRED_CASES[0])], { subset: true }), 'PARTIAL');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), checks: [{ kind: 'response', ok: true }] }], { subset: true }), 'FAIL');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), status: 'BLOCKED' }], { subset: true }), 'BLOCKED');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), status: 'FAIL' }], { subset: true }), 'FAIL');
});

test('CLI rejects unknown cases, unsafe paths and invalid ports', () => {
  assert.throws(() => parseArgs(['--case', 'missing']), /okänt fall/u);
  assert.throws(() => parseArgs(['--out', 'somewhere/report.json']), /--out/u);
  assert.throws(() => parseArgs(['--port', '80']), /port/u);
  assert.throws(() => parseArgs(['--linked']), /okänt argument/u);
  const opts = parseArgs(['--case', REQUIRED_CASES[0], '--case', REQUIRED_CASES[1]]);
  assert.equal(opts.subset, true);
  assert.deepEqual(opts.cases, REQUIRED_CASES.slice(0, 2));
});
