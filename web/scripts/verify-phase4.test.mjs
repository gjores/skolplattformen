import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_TITLES, BASELINE_FLOWS, LOCK_CASES, PHASE4_SQL, REQUIREMENT_STEPS,
  summarize, validateBaseline, validateLocks, validatePhase4Browser, validateRegister, validateSql } from './verify-phase4.mjs';
import { REQUIRED_SQL_FILES as PHASE3_SQL } from './verify-phase3.mjs';
import { REQUIRED_CASES as REGISTER_CASES } from '../../work/pilot/verify-register.mjs';

const head = 'a'.repeat(40);
const start = Date.parse('2026-09-29T10:00:00.000Z');
const copy = value => structuredClone(value);
const register = () => ({ target: 'protected', revision: head, status: 'PASS', cases: REGISTER_CASES.map(name => ({ name, status: 'PASS', checks: [
  { kind: 'response', ok: true }, { kind: 'persistent', ok: true },
] })) });

test('hela registeruppsättningen krävs; delurval, duplicering och läckage nekas', () => {
  assert.equal(validateRegister(register(), { start, head }).cases, 18);
  for (const mutate of [
    report => report.cases.pop(),
    report => { report.cases[0] = report.cases[1]; },
    report => { report.status = 'PARTIAL'; },
    report => { report.revision = 'b'.repeat(40); },
    report => { report.cases[0].checks[0].ok = false; },
    report => { report.cases[0].checks[0].name = 'TEST-20100101-0022'; },
  ]) { const report = register(); mutate(report); assert.throws(() => validateRegister(report, { start, head })); }
});

test('SQL kräver varje faktiskt prov, även de sju fas 4-filerna', () => {
  const report = { target: 'protected', status: 'PASS', exitCode: 0, files: [...PHASE3_SQL, ...PHASE4_SQL] };
  assert.equal(validateSql(report).files, 17);
  report.files.pop(); assert.throws(() => validateSql(report));
});

test('två anslutningar och observerade lås krävs för alla konflikter', () => {
  const report = { target: 'protected', status: 'PASS', cases: LOCK_CASES.map(name => ({ name, waitingObserved: true,
    lockType: 'advisory', outcome: name === 'membership-block' ? '42501' : name === 'protection-revoked' ? 'P0002' : 'conflict',
    committedVersionObserved: !['membership-block', 'protection-revoked'].includes(name) })) };
  assert.equal(validateLocks(report).cases, 6);
  for (const mutate of [r => r.cases.pop(), r => { r.cases[0].waitingObserved = false; }, r => { r.cases[3].committedVersionObserved = true; }]) {
    const bad = copy(report); mutate(bad); assert.throws(() => validateLocks(bad));
  }
});

test('baslinje kräver rätt mål, färsk revision och alla utbildningsflöden', () => {
  const target = { projectId: 'local-baseline' };
  const report = { kind: 'baseline-db', status: 'PASS', date: new Date(start + 5000).toISOString(), target,
    revision: head.slice(0, 7), flows: BASELINE_FLOWS.map(flow => ({ flow, status: 'PASS' })) };
  assert.equal(validateBaseline(report, target, head, start).flows.length, 4);
  for (const mutate of [r => r.flows.pop(), r => { r.date = new Date(start - 5000).toISOString(); },
    r => { r.target.projectId = 'wrong'; }, r => { r.flows[0].status = 'FAIL'; }]) {
    const bad = copy(report); mutate(bad); assert.throws(() => validateBaseline(bad, target, head, start));
  }
});

test('browser kräver 13 fall i alla tre projekt utan skip eller extra fall', () => {
  const projects = ['protected-desktop', 'protected-phone', 'protected-built'];
  const report = { stats: { unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ file: 'phase4-register.spec.ts', specs: BROWSER_TITLES.map(title => ({
    title, file: 'phase4-register.spec.ts', tests: projects.map(projectName => ({ projectName, status: 'expected', results: [{ status: 'passed' }] })),
  })) }] };
  assert.equal(validatePhase4Browser(report).passed, 39);
  for (const mutate of [r => r.suites[0].specs[0].tests.pop(), r => { r.stats.skipped = 1; },
    r => { r.suites[0].specs[0].tests[0].projectName = 'wrong'; }, r => { r.suites[0].specs.push(copy(r.suites[0].specs[0])); }]) {
    const bad = copy(report); mutate(bad); assert.throws(() => validatePhase4Browser(bad));
  }
});

test('kravgrinden accepterar bara fulla färska bevis med samma källfingeravtryck', () => {
  const startedAt = new Date(start).toISOString(), completedAt = new Date(start + 10_000).toISOString();
  const fingerprint = 'sha256:' + 'b'.repeat(64);
  const names = new Set(Object.values(REQUIREMENT_STEPS).flat());
  const steps = [...names].map(name => ({ name, status: 'PASS', exit: 0, revision: head, fingerprint, producedAt: new Date(start + 1000).toISOString() }));
  assert.equal(summarize(steps, head, fingerprint, startedAt, completedAt).status, 'PASS');
  const missing = steps.filter(item => item.name !== 'register-browser');
  assert.equal(summarize(missing, head, fingerprint, startedAt, completedAt).status, 'BLOCKED');
  const stale = copy(steps); stale[0].fingerprint = 'wrong';
  assert.equal(summarize(stale, head, fingerprint, startedAt, completedAt).status, 'FAIL');
  const partial = copy(steps); partial[0].status = 'PARTIAL';
  assert.notEqual(summarize(partial, head, fingerprint, startedAt, completedAt).status, 'PASS');
});
