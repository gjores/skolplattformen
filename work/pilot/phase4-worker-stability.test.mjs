// 04-25: klassningen i phase4-worker-stability.mjs får aldrig göra ett avbrott,
// en blockerad eller ofullständig körning, ett saknat nekandeflöde eller en baslinje till PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { abortInTrace, classifyRun, parseArgs, summarize } from './phase4-worker-stability.mjs';

const script = new URL('./phase4-worker-stability.mjs', import.meta.url);
const out = path.join(os.tmpdir(), 'phase4-25-stability-test.json');
const base = ['--target', 'protected', '--runs', '2', '--flood-runs', '1', '--flood-calls', '10', '--out', out];

test('argumenten tolkas stängt', () => {
  assert.deepEqual(
    { ...parseArgs(base), out: null },
    { target: 'protected', runs: 2, floodRuns: 1, floodCalls: 10, baseline: false, out: null, portBase: 3040, variant: 'standard', floodKind: 'denied', wranglerDebug: false },
  );
  assert.equal(parseArgs([...base, '--baseline']).baseline, true);
  for (const args of [
    [],
    ['--target', 'baseline', ...base.slice(2)],
    [...base, '--okand'],
    [...base, '--runs'],
    ['--target', 'protected', '--runs', '0', '--flood-runs', '0', '--flood-calls', '10', '--out', out],
    ['--target', 'protected', '--runs', '1.5', '--flood-runs', '1', '--flood-calls', '10', '--out', out],
    ['--target', 'protected', '--runs', '2', '--flood-runs', '1', '--flood-calls', '0', '--out', out],
    ['--target', 'protected', '--runs', '2', '--flood-runs', '1', '--flood-calls', '10', '--out', '/Users/x/rapport.json'],
    [...base, '--flood-kind', 'annat'],
    [...base, '--port-base', '80'],
    [...base, '--variant', 'fri text med mellanslag'],
  ]) {
    assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
  }
});

test('okända argument avvisas av körskriptet innan något körs', () => {
  const p = spawnSync(process.execPath, [script.pathname, '--target', 'protected', '--linked'], { encoding: 'utf8' });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /^REFUSED/u);
  assert.equal(p.stdout, '');
});

const ok = (n, extra = {}) => ({ n, caseId: 'no-mfa', route: '/api/elever/personnummer', expect: 'deny', gapMs: 0, status: 403, code: 'mfa_required', hasCorr: true, ms: 30, ...extra });
const trace = (calls, extra = {}) => ({ workerReady: true, complete: true, exitCode: 0, calls, ...extra });
const cases = () => ['worker-role', 'admin-change', 'admin-reveal', 'admin-export', 'no-mfa', 'other-role', 'outside-mandate', 'direct-client-roles', 'persistent-audit'].map((caseId) => ({ caseId, status: 'PASS' }));
const report = (extra = {}) => ({ status: 'PASS', complete: true, cases: cases(), ...extra });
const flood = (completed, extra = {}) => ({ kind: 'denied', requested: 10, completed, ok: completed === 10, failure: null, audit: { expected: completed, logged: completed }, ...extra });

test('avbrottssignaturer: 500 utan kod eller korrelation, och fetch-fel efter att Workern svarat', () => {
  assert.equal(abortInTrace(trace([ok(1), ok(2)])), null);
  assert.equal(abortInTrace(trace([ok(1), ok(2, { status: 500, code: 'audit_unavailable', hasCorr: true })])), null, 'serverns eget 500 med kod och korrelation är inget avbrott');
  assert.equal(abortInTrace(trace([ok(1), ok(2, { status: 500, code: null, hasCorr: false })])).signature, '500-utan-kod-eller-korrelation');
  assert.equal(abortInTrace(trace([ok(1), ok(2, { status: 500, code: 'x', hasCorr: false })])).signature, '500-utan-kod-eller-korrelation');
  assert.equal(abortInTrace(trace([ok(1), { n: 2, route: '/x', expect: 'deny', error: 'TypeError', cause: 'UND_ERR_SOCKET' }])).signature, 'fetch-fel-efter-svar');
  assert.equal(abortInTrace(trace([{ n: 1, route: '/x', error: 'TypeError' }])).signature, 'fetch-fel-efter-svar', 'Workern svarade redan på hälsokontrollen');
  assert.equal(abortInTrace(trace([{ n: 1, route: '/x', error: 'TypeError' }], { workerReady: false })), null);
});

test('ett avbrott blir aldrig PASS, även om rapporten säger PASS', () => {
  const run = classifyRun({ exitCode: 0, report: report(), trace: trace([ok(1), ok(2, { status: 500, code: null, hasCorr: false })]), floodCalls: 0 });
  assert.equal(run.status, 'AVBROTT');
  assert.equal(run.abort.n, 2);
  assert.equal(run.abort.expect, 'deny');
});

test('BLOCKED, ofullständig körning och saknat nekandeflöde ger aldrig PASS', () => {
  assert.equal(classifyRun({ exitCode: 3, report: { status: 'BLOCKED', complete: false, cases: [] }, trace: null, floodCalls: 0 }).status, 'BLOCKED');
  assert.equal(classifyRun({ exitCode: 0, report: null, trace: trace([ok(1)]), floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 0, report: report(), trace: null, floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 0, report: report(), trace: trace([ok(1)], { complete: false }), floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 0, report: report({ complete: false }), trace: trace([ok(1)]), floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 0, report: report({ cases: cases().slice(0, 8) }), trace: trace([ok(1)]), floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 1, report: report(), trace: trace([ok(1)]), floodCalls: 0 }).status, 'FAIL');
  assert.equal(classifyRun({ exitCode: 0, report: report(), trace: trace([ok(1)]), floodCalls: 10 }).status, 'FAIL', 'nekandeflöde saknas');
  assert.equal(classifyRun({ exitCode: 0, report: report({ flood: flood(9) }), trace: trace([ok(1)]), floodCalls: 10 }).status, 'FAIL', 'ofullständigt flöde');
  assert.equal(classifyRun({ exitCode: 0, report: report({ flood: flood(10, { audit: { expected: 10, logged: 9 } }) }), trace: trace([ok(1)]), floodCalls: 10 }).status, 'FAIL', 'nekande utan logg');
  assert.equal(classifyRun({ exitCode: 0, report: report({ flood: flood(10) }), trace: trace([ok(1)]), floodCalls: 10 }).status, 'PASS');
  assert.equal(classifyRun({ exitCode: 0, report: report(), trace: trace([ok(1)]), floodCalls: 0 }).status, 'PASS');
});

const pass = { status: 'PASS' };
test('sammanställningen: baslinjen ger aldrig PASS och avbrott eller för få körningar ger aldrig PASS', () => {
  const expected = { runs: 2, floodRuns: 1 };
  assert.equal(summarize([pass, pass, pass], { ...expected, baseline: false }).status, 'PASS');
  assert.equal(summarize([pass, pass, pass], { ...expected, baseline: true }).status, 'MEASURED');
  assert.equal(summarize([pass, { status: 'AVBROTT' }, pass], { ...expected, baseline: true }).status, 'MEASURED');
  assert.equal(summarize([pass, { status: 'AVBROTT' }, pass], { ...expected, baseline: false }).status, 'FAIL');
  assert.equal(summarize([pass, { status: 'BLOCKED' }, pass], { ...expected, baseline: false }).status, 'BLOCKED');
  assert.equal(summarize([pass, pass], { ...expected, baseline: false }).status, 'FAIL', 'för få körningar');
  assert.equal(summarize([pass, pass], { ...expected, baseline: true }).status, 'FAIL', 'baslinjen kräver att alla körningar är klassade');
  assert.equal(summarize([pass, { status: 'okänd' }, pass], { ...expected, baseline: true }).status, 'FAIL');
  const s = summarize([pass, { status: 'AVBROTT' }, { status: 'FAIL' }], { ...expected, baseline: true });
  assert.deepEqual(s.counts, { PASS: 1, FAIL: 1, AVBROTT: 1, BLOCKED: 0 });
  assert.equal(s.aborts, 1);
  assert.equal(summarize([pass, pass, pass], { ...expected, baseline: false }).exitCode, 0);
  assert.equal(summarize([pass, { status: 'AVBROTT' }, pass], { ...expected, baseline: false }).exitCode, 1);
  assert.equal(summarize([pass, { status: 'AVBROTT' }, pass], { ...expected, baseline: true }).exitCode, 0);
});

test('proben: nekandeflöde och spår är avstängda som standard och loggar hamnar bara i tmp', async () => {
  const { parseArgs: probeArgs } = await import('./phase4-worker-execute-probe.mjs');
  const standard = probeArgs(['--target', 'protected', '--out', out]);
  assert.equal(standard.denyFlood, 0);
  assert.equal(standard.floodKind, 'denied');
  assert.equal(standard.trace, null);
  assert.equal(standard.workerLog, null);
  assert.equal(probeArgs(['--target', 'protected', '--out', out, '--deny-flood', '200']).denyFlood, 200);
  for (const args of [['--deny-flood', '-1'], ['--deny-flood', '1.5'], ['--flood-kind', 'annat'], ['--trace', '/Users/x/spår.json'], ['--worker-log', 'work/pilot/results/worker.log']]) {
    assert.throws(() => probeArgs(['--target', 'protected', '--out', out, ...args]), undefined, JSON.stringify(args));
  }
});
