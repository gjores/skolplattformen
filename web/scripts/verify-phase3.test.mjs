import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateStatus, requirementResults, validateEvidence, validateApiReport, validateSourceReport,
  validateBrowserReport, validateSqlReport, validateAccessReport, REQUIREMENTS, MANDATE_BROWSER,
  WORKSPACE_BROWSER, REQUIRED_SQL_FILES, REQUIRED_ACCESS_CASES,
} from './verify-phase3.mjs';
import { REQUIRED_CASES, overallStatus } from '../../work/pilot/verify-mandates.mjs';

const START = Date.parse('2026-09-26T13:00:00.000Z');
const evidence = { producedAt: '2026-09-26T13:01:00.000Z', gitRevision: 'abc', sourceTreeFingerprint: 'sha256:123' };
const pass = (name) => ({ name, required: true, status: 'PASS', exit: 0, evidence });
const summary = (steps) => ({
  kind: 'phase3-summary', startedAt: '2026-09-26T13:00:00.000Z', completedAt: '2026-09-26T13:02:00.000Z',
  gitRevision: 'abc', sourceTreeFingerprint: 'sha256:123', steps,
});
const validate = (value, names) => validateEvidence(value, {
  requiredStepNames: names, revision: 'abc', fingerprint: 'sha256:123', startedAt: value.startedAt, completedAt: value.completedAt,
});
const greenCase = (name) => ({ name, status: 'PASS', checks: [{ check: 'a', ok: true, detail: '' }, { check: 'b', ok: true, detail: '' }] });
const apiReport = (over = {}) => ({
  kind: 'phase3-api', startedAt: '2026-09-26T13:00:05.000Z', revision: 'abc', status: 'PASS', complete: true,
  requiredCases: REQUIRED_CASES, cases: REQUIRED_CASES.map(greenCase), ...over,
});
const sourceReport = (over = {}) => ({
  scope: 'local-synthetic-only', checkedAt: '2026-09-26T13:00:10.000Z', status: 'PASS', blockers: [],
  probes: ['direct-rest', 'direct-rpc', 'direct-storage', 'direct-sql'].map((id) => ({ id, status: 'PASS' })),
  outages: ['kong', 'storage', 'postgres'].map((source) => ({ source, status: 'PASS' })),
  events: [{ source: 'kong', sourceEventId: 'x', status: 401 }], ...over,
});
const browser = ({ titles, projects, builtProject = null, file = 'e2e/x.spec.ts', drop = null, skipped = 0 }) => {
  const tests = [];
  for (const title of titles) {
    const runs = projects.filter((project) => !(drop && drop.project === project && drop.title === title))
      .map((projectName) => ({ projectName, status: 'expected', results: [{ status: 'passed' }] }));
    if (builtProject && title === titles[0]) runs.push({ projectName: builtProject, status: 'expected', results: [{ status: 'passed' }] });
    tests.push({ title, file, tests: runs });
  }
  return { stats: { expected: tests.length, unexpected: 0, skipped, flaky: 0 }, suites: [{ file, specs: tests, suites: [] }] };
};

test('PASS kräver att alla obligatoriska steg är färska och gröna', () => {
  const value = summary([pass('a'), pass('b')]);
  assert.equal(aggregateStatus(value.steps), 'PASS');
  assert.deepEqual(validate(value, ['a', 'b']), { ok: true, errors: [] });
});

test('saknat steg, icke-noll exit och tom steglista blir aldrig PASS', () => {
  assert.equal(aggregateStatus([]), 'FAIL');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), exit: 2 }]), 'FAIL');
  assert.match(validate(summary([pass('a')]), ['a', 'b']).errors.join(' '), /saknat steg: b/u);
});

test('SKIPPED, PARTIAL och BLOCKED ger inte PASS', () => {
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'SKIPPED', exit: null }]), 'FAIL');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'PARTIAL' }]), 'FAIL');
  assert.equal(aggregateStatus([pass('a'), { ...pass('b'), status: 'BLOCKED', exit: null }]), 'BLOCKED');
  assert.equal(aggregateStatus([{ ...pass('a'), status: 'FAIL', exit: 1 }, { ...pass('b'), status: 'BLOCKED', exit: null }]), 'FAIL');
});

test('gammalt bevis, fel revision och fel fingeravtryck nekas', () => {
  const stale = summary([pass('a'), { ...pass('b'), evidence: { ...evidence, producedAt: '2026-09-25T13:00:00.000Z' } }]);
  assert.match(validate(stale, ['a', 'b']).errors.join(' '), /gammalt/u);
  assert.match(validate({ ...summary([pass('a')]), gitRevision: 'def' }, ['a']).errors.join(' '), /fel revision/u);
  assert.match(validate({ ...summary([pass('a')]), sourceTreeFingerprint: 'sha256:9' }, ['a']).errors.join(' '), /fel källfingeravtryck/u);
});

test('API-rapporten måste vara färsk, komplett och helt grön', () => {
  assert.deepEqual(validateApiReport(apiReport(), { startedMs: START, revision: 'abc' }).cases, REQUIRED_CASES.length);
  assert.throws(() => validateApiReport(apiReport({ startedAt: '2026-09-25T10:00:00.000Z' }), { startedMs: START, revision: 'abc' }), /gammalt/u);
  assert.throws(() => validateApiReport(apiReport({ revision: 'old' }), { startedMs: START, revision: 'abc' }), /fel revision/u);
  assert.throws(() => validateApiReport(apiReport({ status: 'PARTIAL', complete: false }), { startedMs: START, revision: 'abc' }), /PARTIAL/u);
  assert.throws(() => validateApiReport(null, { startedMs: START, revision: 'abc' }), /saknad/u);
});

test('falskt grön API-rapport med saknat, tomt eller rött fall nekas', () => {
  const opts = { startedMs: START, revision: 'abc' };
  assert.throws(() => validateApiReport(apiReport({ cases: REQUIRED_CASES.slice(1).map(greenCase) }), opts), /principal-chain/u);
  const empty = REQUIRED_CASES.map((name) => (name === 'audit-flood' ? { name, status: 'PASS', checks: [] } : greenCase(name)));
  assert.throws(() => validateApiReport(apiReport({ cases: empty }), opts), /audit-flood/u);
  const redCheck = REQUIRED_CASES.map((name) => (name === 'direct-sql' ? { ...greenCase(name), checks: [{ check: 'a', ok: true }, { check: 'b', ok: false }] } : greenCase(name)));
  assert.throws(() => validateApiReport(apiReport({ cases: redCheck }), opts), /direct-sql/u);
  assert.throws(() => validateApiReport(apiReport({ requiredCases: REQUIRED_CASES.slice(0, 3) }), opts), /falluppsättning/u);
  assert.throws(() => validateApiReport(apiReport({ leak: 'Syntetisk elev 11' }), opts), /elevnamn/u);
});

test('verify-mandates: delurval ger PARTIAL och saknat fall FAIL, aldrig PASS', () => {
  const all = REQUIRED_CASES.map(greenCase);
  assert.equal(overallStatus(all), 'PASS');
  assert.equal(overallStatus(all.slice(0, 2), { subset: true }), 'PARTIAL');
  assert.equal(overallStatus(all.slice(1)), 'FAIL');
  assert.equal(overallStatus([...all.slice(1), { name: REQUIRED_CASES[0], status: 'BLOCKED', checks: [] }]), 'BLOCKED');
  assert.equal(overallStatus([...all.slice(1), { name: REQUIRED_CASES[0], status: 'PASS', checks: [{ ok: true }] }]), 'FAIL');
});

test('loggkälla utan bevis, saknat avbrottsprov eller gammal källrapport ger inte PASS', () => {
  assert.equal(validateSourceReport(sourceReport(), { startedMs: START }).events, 1);
  assert.throws(() => validateSourceReport(sourceReport({ status: 'BLOCKED', blockers: ['storage-outage-recovery-untested'] }), { startedMs: START }), /BLOCKED/u);
  assert.throws(() => validateSourceReport(sourceReport({ probes: sourceReport().probes.slice(0, 3) }), { startedMs: START }), /direct-sql/u);
  assert.throws(() => validateSourceReport(sourceReport({ outages: [] }), { startedMs: START }), /kong/u);
  assert.throws(() => validateSourceReport(sourceReport({ events: [] }), { startedMs: START }), /inga källhändelser/u);
  assert.throws(() => validateSourceReport(sourceReport({ checkedAt: '2026-09-24T10:00:00.000Z' }), { startedMs: START }), /gammalt/u);
});

test('browser: varje titel i varje projekt krävs; hoppade eller saknade fall nekas', () => {
  assert.equal(validateBrowserReport(browser(WORKSPACE_BROWSER), WORKSPACE_BROWSER).titles, WORKSPACE_BROWSER.titles.length);
  const drop = { project: 'phase3-phone', title: WORKSPACE_BROWSER.titles[3] };
  assert.throws(() => validateBrowserReport(browser({ ...WORKSPACE_BROWSER, drop }), WORKSPACE_BROWSER), /phase3-phone/u);
  assert.throws(() => validateBrowserReport(browser({ ...WORKSPACE_BROWSER, skipped: 1 }), WORKSPACE_BROWSER), /skipped=1/u);
  assert.throws(() => validateBrowserReport(null, WORKSPACE_BROWSER), /saknad/u);
  const red = browser(WORKSPACE_BROWSER);
  red.suites[0].specs[0].tests[0] = { projectName: 'phase3-desktop', status: 'unexpected', results: [{ status: 'failed' }] };
  assert.throws(() => validateBrowserReport(red, WORKSPACE_BROWSER), /passerade inte|saknade/u);
});

test('mandatbrowsern kräver dator, telefon och byggd Worker i fas 3-specen', () => {
  const ok = browser({ ...MANDATE_BROWSER, file: MANDATE_BROWSER.spec });
  assert.equal(validateBrowserReport(ok, { ...MANDATE_BROWSER, file: MANDATE_BROWSER.spec }).titles, MANDATE_BROWSER.titles.length);
  const noBuilt = browser({ ...MANDATE_BROWSER, builtProject: null, file: MANDATE_BROWSER.spec });
  assert.throws(() => validateBrowserReport(noBuilt, { ...MANDATE_BROWSER, file: MANDATE_BROWSER.spec }), /protected-built/u);
  // Gröna fas 2-fall i en annan fil kan inte ersätta fas 3-specen.
  const otherFile = browser({ ...MANDATE_BROWSER, file: 'phase2-access.spec.ts' });
  assert.throws(() => validateBrowserReport(otherFile, { ...MANDATE_BROWSER, file: MANDATE_BROWSER.spec }), /saknade fall/u);
});

test('SQL och access kräver alla obligatoriska filer och fall', () => {
  assert.equal(validateSqlReport({ status: 'PASS', exitCode: 0, files: REQUIRED_SQL_FILES }).files, 10);
  assert.throws(() => validateSqlReport({ status: 'PASS', exitCode: 0, files: REQUIRED_SQL_FILES.slice(1) }), /phase1_isolation/u);
  assert.throws(() => validateSqlReport({ status: 'FAIL', exitCode: 1, files: REQUIRED_SQL_FILES }), /FAIL/u);
  const access = { status: 'PASS', checkedAt: '2026-09-26T13:00:30.000Z', revision: 'abc', cases: REQUIRED_ACCESS_CASES.map((name) => ({ name, status: 'PASS' })) };
  assert.equal(validateAccessReport(access, { startedMs: START, revision: 'abc' }).cases, REQUIRED_ACCESS_CASES.length);
  assert.throws(() => validateAccessReport({ ...access, cases: access.cases.slice(0, -1) }, { startedMs: START, revision: 'abc' }), /phase3-pupils/u);
  assert.throws(() => validateAccessReport({ ...access, checkedAt: '2026-09-20T00:00:00.000Z' }, { startedMs: START, revision: 'abc' }), /gammalt/u);
});

test('krav blir PASS först när deras bevis och hela grinden är PASS', () => {
  const names = [...new Set(REQUIREMENTS.flatMap((r) => r.evidence))];
  const green = names.map(pass);
  assert.ok(requirementResults(green, 'PASS').every((r) => r.status === 'PASS'));
  assert.ok(requirementResults(green, 'BLOCKED').every((r) => r.status === 'BLOCKED'));
  // Ingen fas 3-mandatbrowser ännu (före 03-07): varje krav är BLOCKED, inget PASS.
  const noBrowser = [...green.filter((s) => s.name !== 'fas3-mandat-browser'), { name: 'fas3-mandat-browser', status: 'BLOCKED', exit: null }];
  assert.equal(aggregateStatus(noBrowser), 'BLOCKED');
  assert.ok(requirementResults(noBrowser, aggregateStatus(noBrowser)).every((r) => r.status === 'BLOCKED'));
  // Saknat bevissteg räknas aldrig som grönt.
  const missing = green.filter((s) => s.name !== 'källbevis');
  const audit = requirementResults(missing, 'PASS').find((r) => r.id === 'AUDIT-02');
  assert.equal(audit.status, 'BLOCKED');
  const failed = [...green.filter((s) => s.name !== 'mandat-api'), { name: 'mandat-api', status: 'FAIL', exit: 1 }];
  assert.ok(requirementResults(failed, 'FAIL').every((r) => r.status === 'FAIL'));
});

test('regressionsbrowsern godtar bara redovisade hopp', async () => {
  const { validateRegressionReport, DESIGNED_SKIPS } = await import('./verify-phase3.mjs');
  const run = (status, reason) => ({ projectName: 'p', status, annotations: reason ? [{ type: 'skip', description: reason }] : [{ type: 'serial' }], results: [] });
  const report = (runs, stats) => ({ stats, suites: [{ specs: runs.map((r, i) => ({ title: `t${i}`, tests: [r] })), suites: [] }] });
  const ok = report([run('expected'), run('skipped', 'Provas i devprojekten.')], { expected: 30, unexpected: 0, skipped: 1, flaky: 0 });
  assert.deepEqual(validateRegressionReport(ok, { minExpected: 30, allowedSkips: DESIGNED_SKIPS.fas2, label: 'fas 2' }), { expected: 30, designedSkips: 1 });
  // Seriellt fall som inte kördes efter ett fel har inget redovisat skäl.
  const didNotRun = report([run('skipped', null)], { expected: 30, unexpected: 0, skipped: 1, flaky: 0 });
  assert.throws(() => validateRegressionReport(didNotRun, { minExpected: 30, allowedSkips: DESIGNED_SKIPS.fas2, label: 'fas 2' }), /utan redovisat skäl/u);
  const otherReason = report([run('skipped', 'hoppar tillfälligt')], { expected: 30, unexpected: 0, skipped: 1, flaky: 0 });
  assert.throws(() => validateRegressionReport(otherReason, { minExpected: 30, allowedSkips: DESIGNED_SKIPS.fas2, label: 'fas 2' }), /utan redovisat skäl/u);
  const hidden = report([], { expected: 30, unexpected: 0, skipped: 2, flaky: 0 });
  assert.throws(() => validateRegressionReport(hidden, { minExpected: 30, allowedSkips: DESIGNED_SKIPS.fas2, label: 'fas 2' }), /stämmas av/u);
  assert.throws(() => validateRegressionReport(report([], { expected: 29, unexpected: 0, skipped: 0 }), { minExpected: 30, allowedSkips: [], label: 'fas 2' }), /expected=29/u);
  assert.throws(() => validateRegressionReport(report([], { expected: 40, unexpected: 1, skipped: 0 }), { minExpected: 30, allowedSkips: [], label: 'fas 2' }), /unexpected=1/u);
});
