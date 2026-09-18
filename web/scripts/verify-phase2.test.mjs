import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateStatus, validateEvidence } from './verify-phase2.mjs';

const pass = (name) => ({ name, required: true, status: 'PASS', exit: 0, evidence: { producedAt: '2026-09-18T08:01:00.000Z', gitRevision: 'abc', sourceTreeFingerprint: 'sha256:123' } });
const report = (steps = [pass('a'), pass('b')]) => ({
  kind: 'phase2-summary', startedAt: '2026-09-18T08:00:00.000Z', completedAt: '2026-09-18T08:02:00.000Z',
  gitRevision: 'abc', sourceTreeFingerprint: 'sha256:123', steps,
});
const validate = (value) => validateEvidence(value, {
  requiredStepNames: ['a', 'b'], revision: 'abc', fingerprint: 'sha256:123',
  startedAt: value.startedAt, completedAt: value.completedAt,
});

test('PASS kräver att alla obligatoriska steg är färska och gröna', () => {
  const value = report();
  assert.equal(aggregateStatus(value.steps), 'PASS');
  assert.deepEqual(validate(value), { ok: true, errors: [] });
});

test('icke-noll exit kan inte döljas bakom PASS', () => {
  const steps = [pass('a'), { ...pass('b'), exit: 2 }];
  assert.equal(aggregateStatus(steps), 'FAIL');
  assert.equal(validate(report(steps)).ok, false);
});

test('krasch, saknad rapport och saknat obligatoriskt steg ger FAIL', () => {
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'FAIL', exit: null }]), 'FAIL');
  assert.equal(validateEvidence(null, { requiredStepNames: ['a'], revision: 'abc', fingerprint: 'sha256:123' }).ok, false);
  assert.match(validate(report([pass('a')])).errors.join(' '), /saknat steg: b/u);
});

test('fel revision eller fingeravtryck och gammalt bevis nekas', () => {
  const wrongRevision = { ...report(), gitRevision: 'def' };
  assert.match(validate(wrongRevision).errors.join(' '), /fel revision/u);
  const wrongFingerprint = { ...report(), sourceTreeFingerprint: 'sha256:999' };
  assert.match(validate(wrongFingerprint).errors.join(' '), /fel källfingeravtryck/u);
  const stale = report([pass('a'), { ...pass('b'), evidence: { ...pass('b').evidence, producedAt: '2026-09-17T08:00:00.000Z' } }]);
  assert.match(validate(stale).errors.join(' '), /gammalt/u);
});

test('SKIPPED, BLOCKED och obligatorisk KNOWN-ISSUE blir aldrig PASS', () => {
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'SKIPPED', exit: null }]), 'FAIL');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'BLOCKED', exit: null }]), 'BLOCKED');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'KNOWN-ISSUE', exit: 1 }]), 'FAIL');
});

test('--skip-browser ger högst PASS-PARTIAL och inga andra skips tillåts', () => {
  const browserSkip = [pass('a'), { ...pass('b'), name: 'protected-browser', status: 'SKIPPED', exit: null }];
  assert.equal(aggregateStatus(browserSkip, { skipBrowser: true }), 'PASS-PARTIAL');
  assert.equal(aggregateStatus(browserSkip), 'FAIL');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), name: 'sql', status: 'SKIPPED', exit: null }], { skipBrowser: true }), 'FAIL');
});

test('en delrapport märkt PASS-PARTIAL accepteras inte som PASS', () => {
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'PASS-PARTIAL' }]), 'FAIL');
});

