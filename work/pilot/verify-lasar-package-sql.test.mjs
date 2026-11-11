import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LASAR_SQL_SUITES, assertSqlSuiteReport, assertLasarActualProof, assertLasarSqlManifest,
  parseLasarSqlArgs, runSqlSuiteSequence } from './verify-lasar-package-sql.mjs';
import { LASAR_ACTUAL_CASES } from './lasar-oidc-fixtures.mjs';

const cleanup = { status: 'complete', tempDirectoryEmpty: true, remainingEntries: 0,
  method: 'original ephemeral end() plus owned TMPDIR emptiness' };
const outcome = { code: 0, signal: null, cleanup };
const sqlReport = suite => ({ kind: suite.kind, status: 'PASS', mode: 'ephemeral',
  database: { kind: 'ephemeral-migrated-postgresql' }, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  cases: [{ name: 'synthetic refusal case', status: 'PASS' }], passed: 1, failed: 0 });
const clone = x => structuredClone(x);
const current = { revision: 'a'.repeat(40), binding: { matched: true, manifestSha256: 'bound' },
  migrations: { 'supabase/migrations/old.sql': 'bound-old' }, suiteSources: { original: 'bound-original' } };
const tmp = () => mkdtempSync('/private/tmp/lasar-package-unit-');
const reader = file => ({ file, sha256: 'unchanged-report', value: JSON.parse(readFileSync(file, 'utf8')) });

function actualFixture() {
  const same = { sha256: 'unchanged' }, revision = 'a'.repeat(40);
  const a = { kind: 'lasar-actual-api-browser', status: 'PASS', fullSuite: true, candidate: { revision },
    build: { mode: 'protected', revision }, sourceRevision: revision, executionCheckoutRevision: revision,
    requiredCases: LASAR_ACTUAL_CASES, projects: Object.keys(LASAR_ACTUAL_CASES), notExecuted: [],
    casesPerProject: Object.fromEntries(Object.entries(LASAR_ACTUAL_CASES).map(([p, c]) => [p, { required: c.length, passed: c.length }])),
    checks: Object.entries(LASAR_ACTUAL_CASES).flatMap(([project, cases]) => cases.map(name => ({ name: `${project}: ${name}`, ok: true }))),
    playwright: { code: 0 }, playwrightOutcome: { stats: { unexpected: 0, flaky: 0, skipped: 0 },
      tests: Array.from({ length: 4 }, () => ({ status: 'passed', retries: 0 })) },
    oidcCleanup: { cleanup: 'complete', expectedFixtures: 4, verifiedCallbacks: 36 },
    runtimeCleanup: { cleanup: 'complete' }, snapshotCleanup: { cleanup: 'complete' },
    targetUnchanged: true, buildCopyRemoved: true, originalArtifactPreserved: true };
  for (const [b, f] of [['sources', 'finalSources'], ['migrationSources', 'finalMigrationSources'],
    ['verificationSources', 'finalVerificationSources'], ['originalArtifact', 'finalOriginalArtifact'],
    ['targetJournal', 'finalTargetJournal'], ['targetFingerprint', 'finalTargetFingerprint']]) a[b] = a[f] = same;
  a.candidateSourceBinding = a.finalCandidateSourceBinding = { matched: true };
  return a;
}

async function fakeSequence({ mutate = () => {}, execute = null } = {}) {
  const directory = tmp(); const state = clone(current), history = [];
  const run = execute ?? (async ({ suite, reportFile }) => {
    history.push(suite.name); writeFileSync(reportFile, JSON.stringify(sqlReport(suite)), { mode: 0o600 });
    mutate(state, history.length); return { ...outcome, args: [suite.file, '--ephemeral', '--out', reportFile] };
  });
  let latest = [];
  try {
    const rows = await runSqlSuiteSequence({ candidate: '/private/tmp/lasar-candidate', directory, before: clone(current),
      capture: async () => clone(state), assertIdle: () => {}, run, read: reader, persist: r => { latest = clone(r); } });
    return { directory, rows, history };
  } catch (error) { return { directory, error, history, rows: latest }; }
}

function validationFixture(rows, directory) {
  const actualProof = { file: '/private/tmp/actual-unit.json', sha256: 'actual-sha' }, tool = { toolRevision: 'b'.repeat(40), sources: { tool: 'hash' } };
  const manifest = { kind: 'lasar-package-sql', schemaVersion: 1, status: 'PASS', candidate: '/private/tmp/lasar-candidate',
    candidateRevision: current.revision, actual: actualProof, tool, finalTool: tool,
    before: current, after: current, suites: rows, directory, startedAt: rows[0].startedAt, finishedAt: rows.at(-1).finishedAt };
  const options = { candidate: manifest.candidate, current, actualProof, tool, read: reader, cleanup: () => cleanup, evidenceSha256: 'manifest-sha' };
  return { manifest, options };
}

test('CLI admits only explicit candidate, actual, and new output arguments', () => {
  assert.deepEqual(parseLasarSqlArgs(['--candidate', 'c', '--actual', 'a', '--out', 'o']), { candidate: 'c', actual: 'a', out: 'o' });
  for (const args of [[], ['--candidate', 'c', '--out', 'o'], ['--candidate', 'c', '--actual', 'a', '--apply', 'o']])
    assert.throws(() => parseLasarSqlArgs(args));
});
test('incomplete actual proof, retry, duplicate cases and missing cleanup cannot select the product candidate', () => {
  const valid = actualFixture(); assert.equal(assertLasarActualProof(valid), 'a'.repeat(40));
  const mutations = [a => { a.fullSuite = false; }, a => { a.playwrightOutcome.tests[0].retries = 1; },
    a => { a.runtimeCleanup.cleanup = 'failed'; }, a => { a.checks[0] = clone(a.checks[1]); },
    a => { a.candidate.revision = 'c'.repeat(40); }, a => { a.finalSources = { changed: true }; }];
  for (const mutate of mutations) { const a = clone(valid); mutate(a); assert.throws(() => assertLasarActualProof(a)); }
});
test('a PASS string cannot hide wrong kind, skipped assertions, crash, source change, or abandoned database', () => {
  const suite = LASAR_SQL_SUITES[0], report = sqlReport(suite);
  assert.equal(assertSqlSuiteReport(suite, report, outcome).count, 1);
  for (const mutate of [r => { r.kind = 'other'; }, r => { r.cases[0].status = 'SKIP'; },
    r => { r.mode = 'schema-snapshot'; }, r => { r.sourceFailure = {}; }, r => { r.cleanupFailure = {}; }]) {
    const r = clone(report); mutate(r); assert.throws(() => assertSqlSuiteReport(suite, r, outcome));
  }
  assert.throws(() => assertSqlSuiteReport(suite, report, { ...outcome, code: 130, signal: 'SIGINT' }));
  assert.throws(() => assertSqlSuiteReport(suite, report, { ...outcome, cleanup: { status: 'incomplete', tempDirectoryEmpty: false } }));
});
test('all eight original suites run sequentially with distinct private reports and fixed ephemeral arguments', async () => {
  let active = 0, peak = 0, count = 0;
  const r = await fakeSequence({ execute: async ({ suite, reportFile, tempDirectory }) => {
    active++; peak = Math.max(peak, active); count++;
    assert.equal(statSync(tempDirectory).mode & 0o077, 0); await Promise.resolve();
    writeFileSync(reportFile, JSON.stringify(sqlReport(suite)), { mode: 0o600 }); active--;
    return { ...outcome, args: [suite.file, '--ephemeral', '--out', reportFile] };
  } });
  try {
    assert.ifError(r.error); assert.equal(count, 8); assert.equal(peak, 1);
    assert.deepEqual(r.rows.map(row => row.name), LASAR_SQL_SUITES.map(s => s.name));
    assert.equal(new Set(r.rows.map(row => row.reportFile)).size, 8);
    for (const row of r.rows) { assert.equal(row.status, 'PASS'); assert.equal(statSync(row.reportFile).mode & 0o077, 0); }
  } finally { rmSync(r.directory, { recursive: true }); }
});
test('changed source or pre-phase migration after a suite stops execution before the next suite', async () => {
  for (const mutate of [s => { s.revision = 'c'.repeat(40); }, s => { s.migrations['supabase/migrations/old.sql'] = 'changed'; },
    s => { s.suiteSources.original = 'changed'; }]) {
    const r = await fakeSequence({ mutate });
    try { assert.ok(r.error); assert.equal(r.history.length, 1); assert.equal(r.rows[0].status, 'FAIL'); }
    finally { rmSync(r.directory, { recursive: true }); }
  }
});
test('crash with no report and interruption never consume an earlier report or run the next suite', async () => {
  let calls = 0;
  const r = await fakeSequence({ execute: async ({ suite, reportFile }) => {
    calls++; return { ...outcome, code: 130, signal: 'SIGINT', args: [suite.file, '--ephemeral', '--out', reportFile] };
  } });
  try { assert.ok(r.error); assert.equal(calls, 1); assert.equal(r.rows[0].status, 'FAIL'); assert.equal(r.rows[0].exitCode, 130); }
  finally { rmSync(r.directory, { recursive: true }); }
});
test('installer validation refuses replaced report bytes, another candidate, changed tools and incomplete cleanup', async () => {
  const r = await fakeSequence();
  try {
    assert.ifError(r.error); const { manifest, options } = validationFixture(r.rows, r.directory);
    assert.equal(assertLasarSqlManifest(manifest, options).candidateRevision, current.revision);
    assert.throws(() => assertLasarSqlManifest(manifest, { ...options, read: f => ({ ...reader(f), sha256: 'tampered' }) }));
    assert.throws(() => assertLasarSqlManifest(manifest, { ...options, current: { ...current, revision: 'c'.repeat(40) } }));
    assert.throws(() => assertLasarSqlManifest(manifest, { ...options, tool: { changed: true } }));
    assert.throws(() => assertLasarSqlManifest(manifest, { ...options, cleanup: () => ({ status: 'incomplete', tempDirectoryEmpty: false }) }));
    const missing = clone(manifest); missing.suites.pop(); assert.throws(() => assertLasarSqlManifest(missing, options));
    const aborted = clone(manifest); aborted.status = 'FAIL'; assert.throws(() => assertLasarSqlManifest(aborted, options));
    const retro = clone(manifest); retro.suites[0].startedAt = '2099-01-01T00:00:00.000Z'; assert.throws(() => assertLasarSqlManifest(retro, options));
    assert.throws(() => assertLasarSqlManifest(manifest, { ...options, read: f => { const r = reader(f); r.value.startedAt = '2000-01-01T00:00:00.000Z'; return r; } }));
  } finally { rmSync(r.directory, { recursive: true }); }
});
