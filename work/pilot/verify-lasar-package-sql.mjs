#!/usr/bin/env node
// Plan16: run original SQL suites on the immutable plan15 candidate, never against a connected target.
// Wrapper/tool sources may be newer; product and original-suite sources must remain candidate bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { verificationSources, bindCandidateSources } from './verify-lasar-actual.mjs';
import { TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START, classifyTjanstMigrations } from './tjanst-migration-state.mjs';
import { LASAR_ACTUAL_CASES } from './lasar-oidc-fixtures.mjs';
import { artifactManifest } from './verify-programplan-copy-api.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SELF = 'work/pilot/verify-lasar-package-sql.mjs';
export const LASAR_SQL_CANDIDATE = '/private/tmp/lasar-candidate';
export const LASAR_SQL_SUITES = Object.freeze([
  ['lasar', 'lasar-sql'], ['lasar-groups', 'lasar-groups-sql'], ['lasar-frames', 'lasar-frames-sql'],
  ['tjanst-personal', 'tjanst-personal-owned-database'], ['tjanst-plan', 'tjanst-plan-owned-database'],
  ['tjanst-year-preview', 'tjanst-year-preview'], ['tjanst-year-commands', 'tjanst-year-commands'],
  ['tjanst-sharing', 'tjanst-need-sharing'],
].map(([name, kind]) => Object.freeze({ name, file: `work/pilot/verify-${name}.mjs`, kind })));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
const equal = (a, b, reason) => assert.deepEqual(a, b, reason);
const stamp = () => new Date().toISOString();
const ts = createRequire(path.join(ROOT, 'web/package.json'))('typescript');

function privateFile(file) {
  assert.equal(typeof file, 'string'); assert.ok(file.startsWith('/private/tmp/') && file.endsWith('.json'));
  assert.equal(realpathSync(file), file, 'Evidence path must be canonical, not a link');
  const stat = lstatSync(file); assert.ok(stat.isFile() && (stat.mode & 0o077) === 0, 'Evidence must be a private regular file');
  const bytes = readFileSync(file); return { file, sha256: sha(bytes), value: JSON.parse(bytes.toString('utf8')) };
}

/** Strict source evidence, not a substitute for the installer's full actual/visual evidence checks. */
export function assertLasarActualProof(actual) {
  assert.equal(actual.kind, 'lasar-actual-api-browser'); assert.equal(actual.status, 'PASS'); assert.equal(actual.fullSuite, true);
  assert.match(actual.candidate?.revision, /^[a-f0-9]{40}$/u);
  assert.equal(actual.build?.mode, 'protected'); assert.equal(actual.build.revision, actual.candidate.revision);
  assert.equal(actual.sourceRevision, actual.candidate.revision); assert.equal(actual.executionCheckoutRevision, actual.candidate.revision);
  equal(actual.requiredCases, LASAR_ACTUAL_CASES, 'Incomplete actual case inventory');
  equal(actual.projects, Object.keys(LASAR_ACTUAL_CASES)); equal(actual.notExecuted, []);
  for (const [project, cases] of Object.entries(LASAR_ACTUAL_CASES))
    equal(actual.casesPerProject?.[project], { required: cases.length, passed: cases.length });
  assert.equal(actual.checks?.length, Object.values(LASAR_ACTUAL_CASES).flat().length);
  assert.ok(actual.checks.every(c => c.ok === true));
  equal(actual.checks.map(c => c.name).sort(), Object.entries(LASAR_ACTUAL_CASES).flatMap(([project, cases]) => cases.map(name => `${project}: ${name}`)).sort());
  assert.equal(actual.playwright?.code, 0); assert.equal(actual.playwrightOutcome?.tests?.length, 4);
  assert.ok(actual.playwrightOutcome.tests.every(t => t.status === 'passed' && t.retries === 0));
  for (const k of ['unexpected', 'flaky', 'skipped']) assert.equal(actual.playwrightOutcome.stats[k], 0);
  for (const key of ['oidcCleanup', 'runtimeCleanup', 'snapshotCleanup']) assert.equal(actual[key]?.cleanup, 'complete');
  assert.equal(actual.oidcCleanup.expectedFixtures, 4); assert.ok(actual.oidcCleanup.verifiedCallbacks >= 4);
  for (const key of ['targetUnchanged', 'buildCopyRemoved', 'originalArtifactPreserved']) assert.equal(actual[key], true);
  for (const [before, after] of [['sources', 'finalSources'], ['migrationSources', 'finalMigrationSources'],
    ['verificationSources', 'finalVerificationSources'], ['originalArtifact', 'finalOriginalArtifact'],
    ['targetJournal', 'finalTargetJournal'], ['targetFingerprint', 'finalTargetFingerprint'], ['candidateSourceBinding', 'finalCandidateSourceBinding']]) {
    assert.ok(actual[before]); equal(actual[before], actual[after]);
  }
  assert.equal(actual.candidateSourceBinding.matched, true);
  return actual.candidate.revision;
}

function toolProof(toolRevision = git(['rev-parse', 'HEAD'])) {
  const sources = verificationSources({ entrypoints: [SELF, SELF.replace('.mjs', '.test.mjs')] });
  return { toolRevision, sources, binding: bindCandidateSources(toolRevision, sources), node: process.version };
}

/** Non-module inputs from the reviewed original-suite import closure. Historical result reports and
 * private target configuration are outputs/environment, never candidate source inputs. Migration
 * bytes and JSON imports are already bound independently by sourceProof. */
export function sqlInputResources(candidate, suiteSources) {
  const resources = new Set(['work/pilot/ephemeral-supabase-stubs.sql', 'web/package.json', 'web/package-lock.json', 'package.json']);
  for (const file of Object.keys(suiteSources)) {
    if (!/\.(?:mjs|js|ts|tsx)$/u.test(file)) continue;
    const absolute = path.join(candidate, file);
    const syntax = ts.createSourceFile(file, readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const value = node.text;
        let input = null;
        if (value.startsWith('supabase/tests/') && /\.(?:sql|json)$/u.test(value)) input = value;
        else if (value.startsWith('.') && value.includes('supabase/tests/') && /\.(?:sql|json)$/u.test(value))
          input = path.relative(candidate, path.resolve(path.dirname(absolute), value));
        // verify-class-cohort selects its fixture from literal basenames and resolves it in supabase/tests.
        else if (/^[a-zA-Z0-9_.-]+\.(?:sql|json)$/u.test(value) && existsSync(path.join(candidate, 'supabase/tests', value)))
          input = 'supabase/tests/' + value;
        if (input !== null) {
          assert.ok(!path.isAbsolute(input) && !input.split('/').includes('..') && input.startsWith('supabase/tests/'), 'Fixture input escaped candidate');
          resources.add(input);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(syntax);
  }
  return Object.fromEntries([...resources].sort().map(file => {
    const absolute = path.join(candidate, file);
    assert.equal(realpathSync(absolute), absolute, 'Fixture resource symlinks refused');
    assert.ok(lstatSync(absolute).isFile(), 'Fixture resource must be a regular file');
    return [file, sha(readFileSync(absolute))];
  }));
}

/** All migration bytes, including pre-phase files, plus resources read by the original suites. */
async function sourceProof(candidate, actual) {
  assert.equal(path.resolve(candidate), LASAR_SQL_CANDIDATE, 'Only the isolated candidate directory is accepted');
  assert.equal(realpathSync(candidate), candidate); assert.ok(lstatSync(candidate).isDirectory());
  const revision = assertLasarActualProof(actual);
  assert.equal(git(['rev-parse', 'HEAD'], candidate), revision, 'Candidate changed');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no'], candidate), '', 'Candidate checkout is not clean');
  const candidateVerifier = await import(pathToFileURL(path.join(candidate, 'work/pilot/verify-lasar-actual.mjs')).href);
  const { productSources } = await import(pathToFileURL(path.join(candidate, 'work/pilot/apply-apl-plan.mjs')).href);
  const migrations = Object.fromEntries(readdirSync(path.join(candidate, 'supabase/migrations')).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/u.test(f)).sort()
    .map(f => [`supabase/migrations/${f}`, sha(readFileSync(path.join(candidate, 'supabase/migrations', f)))]));
  const phaseHashes = Object.fromEntries(Object.entries(migrations).filter(([f]) => path.basename(f).slice(0, 14) >= TJANST_PHASE_START));
  classifyTjanstMigrations({ sourceHashes: phaseHashes, journal: TJANST_MIGRATION_REGISTRY.map(m => m.version) });
  equal(phaseHashes, actual.migrationSources, 'Actual report migration bytes differ');
  const suiteSources = candidateVerifier.verificationSources({ entrypoints: LASAR_SQL_SUITES.map(s => s.file) });
  const resourceSources = sqlInputResources(candidate, suiteSources);
  const sources = productSources(); equal(sources, actual.sources, 'Actual report product bytes differ');
  const binding = candidateVerifier.bindCandidateSources(revision, sources, suiteSources, resourceSources, migrations);
  const artifact = artifactManifest(path.join(candidate, 'web/dist-protected'));
  equal(artifact, actual.originalArtifact, 'Candidate artifact differs from the actual one');
  const mark = JSON.parse(readFileSync(path.join(candidate, 'web/dist-protected/build-mode.json'), 'utf8'));
  equal(mark, actual.build, 'Candidate build mark differs');
  return { revision, binding, sources, suiteSources, resourceSources, migrations, artifact, mark };
}

export function assertSqlSuiteReport(suite, report, { code, signal, cleanup }) {
  assert.equal(code, 0, 'Original SQL suite did not exit successfully'); assert.equal(signal, null);
  assert.equal(report.kind, suite.kind); assert.equal(report.status, 'PASS'); assert.equal(report.mode, 'ephemeral');
  assert.equal(report.database?.kind, 'ephemeral-migrated-postgresql');
  for (const key of ['failure', 'sourceFailure', 'cleanupFailure']) assert.equal(report[key], undefined, key);
  assert.ok(Date.parse(report.startedAt) <= Date.parse(report.finishedAt));
  const cases = report.cases ?? report.checks; assert.ok(Array.isArray(cases) && cases.length > 0);
  assert.ok(cases.every(c => c.status === 'PASS' || c.ok === true));
  if (report.failed !== undefined) assert.equal(report.failed, 0);
  if (report.passed !== undefined) assert.equal(report.passed, cases.length);
  if (report.cleanup !== undefined) assert.ok(report.cleanup === 'complete' || report.cleanup?.cleanup === 'complete');
  assert.equal(cleanup.status, 'complete'); assert.equal(cleanup.tempDirectoryEmpty, true);
  return { kind: report.kind, status: report.status, count: cases.length, cleanup: 'complete' };
}

function noBrowserTests() {
  const rows = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  assert.ok(!rows.split('\n').some(line => /(?:node|npm).*?(?:node_modules\/(?:\.bin\/playwright|playwright(?:-core)?\/cli\.js)|verify-(?:lasar|tjanst)-actual\.mjs)(?:\s|$)/u.test(line)), 'Browser verification is running; SQL must run separately');
}

function cleanupTemp(tmp) {
  assert.equal(realpathSync(tmp), tmp);
  const remaining = readdirSync(tmp);
  // A successful original suite removes its own cluster. Never attest an abandoned cluster as cleaned.
  return { status: remaining.length ? 'incomplete' : 'complete', tempDirectoryEmpty: remaining.length === 0,
    remainingEntries: remaining.length, method: 'original ephemeral end() plus owned TMPDIR emptiness' };
}

async function defaultRunner({ candidate, suite, reportFile, logFile, tempDirectory, interrupted }) {
  const args = [suite.file, '--ephemeral', '--out', reportFile];
  const fd = openSync(logFile, 'wx', 0o600);
  let child;
  const stop = () => { interrupted.value = true; child?.kill('SIGINT'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const outcome = await new Promise((resolve, reject) => {
      const oldMask = process.umask(0o077);
      try { child = spawn(process.execPath, args, { cwd: candidate, env: { ...process.env, TMPDIR: tempDirectory, TMP: tempDirectory, TEMP: tempDirectory }, stdio: ['ignore', fd, fd] }); }
      finally { process.umask(oldMask); }
      child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    return { ...outcome, args, cleanup: cleanupTemp(tempDirectory) };
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); closeSync(fd); }
}

/** Dependency injection is used only by pure tests; the CLI always uses the original process runner. */
export async function runSqlSuiteSequence({ candidate, directory, before, capture, persist, run = defaultRunner,
  read = privateFile, assertIdle = noBrowserTests, interrupted = { value: false } }) {
  const results = [];
  for (const suite of LASAR_SQL_SUITES) {
    assertIdle(); equal(await capture(), before, 'Bound sources or candidate changed before SQL suite');
    const suiteDir = path.join(directory, suite.name); mkdirSync(suiteDir, { mode: 0o700 });
    const tempDirectory = path.join(suiteDir, 'pg-temp'); mkdirSync(tempDirectory, { mode: 0o700 });
    const reportFile = path.join(suiteDir, 'report.json'), logFile = path.join(suiteDir, 'process.log');
    const row = { name: suite.name, file: suite.file, kind: suite.kind, startedAt: stamp(), status: 'FAIL', beforeBinding: before.binding, reportFile, logFile, tempDirectory };
    results.push(row); persist(results);
    try {
      const outcome = await run({ candidate, suite, reportFile, logFile, tempDirectory, interrupted });
      row.exitCode = outcome.code; row.signal = outcome.signal; row.args = outcome.args; row.cleanup = outcome.cleanup;
      row.reportPresent = existsSync(reportFile);
      if (row.reportPresent) row.reportSha256 = read(reportFile).sha256;
      assert.ok(!interrupted.value, 'Interrupted SQL package attempt');
      equal(row.args, [suite.file, '--ephemeral', '--out', reportFile], 'Unapproved SQL arguments');
      const proof = read(reportFile); row.reportSha256 = proof.sha256;
      row.summary = assertSqlSuiteReport(suite, proof.value, outcome);
      const final = await capture(); equal(final, before, 'Bound sources or candidate changed after SQL suite');
      row.afterBinding = final.binding; row.status = 'PASS';
    } catch (error) {
      row.incomplete = true; row.failure = interrupted.value ? 'interrupted' : row.reportPresent === false ? 'missing-report' : 'suite-or-binding-refused';
      throw error;
    } finally { row.finishedAt = stamp(); persist(results); }
  }
  return results;
}

export async function verifyLasarPackageSql({ candidate, actual, out }, dependencies = {}) {
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json')); assert.equal(path.resolve(out), out);
  assert.equal(realpathSync(path.dirname(out)), path.dirname(out), 'Output parent must be canonical');
  assert.ok(!existsSync(out), 'Choose a new SQL package output');
  const directory = `${out.slice(0, -5)}-evidence`;
  const fd = openSync(out, 'wx', 0o600), interrupted = { value: false };
  const report = { kind: 'lasar-package-sql', schemaVersion: 1, status: 'FAIL', startedAt: stamp(), candidate,
    stage: 'preflight', suites: [], directory, limits: ['Original SQL suites run sequentially in their own ephemeral PostgreSQL',
      'Only synthetic data; no target writes, Worker, OIDC, installation or municipality connection',
      'Cleanup is verified by original exit/report and emptiness of a separate private TMPDIR per suite'] };
  const save = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  try {
    save();
    assert.equal(path.resolve(candidate), LASAR_SQL_CANDIDATE);
    assert.ok(!existsSync(directory)); mkdirSync(directory, { mode: 0o700 });
    const actualProof = privateFile(actual); assertLasarActualProof(actualProof.value);
    report.actual = { file: actualProof.file, sha256: actualProof.sha256 }; save();
    const capture = () => (dependencies.sourceProof ?? sourceProof)(candidate, actualProof.value);
    const before = await capture(), tool = (dependencies.toolProof ?? toolProof)();
    (dependencies.assertIdle ?? noBrowserTests)();
    Object.assign(report, { candidateRevision: before.revision, tool, before, stage: 'suites' }); save();
    await (dependencies.runSequence ?? runSqlSuiteSequence)({ candidate, directory, before, capture,
      interrupted, persist: rows => { report.suites = rows; save(); } });
    report.after = await capture(); equal(report.after, before);
    report.finalTool = (dependencies.toolProof ?? toolProof)(); equal(report.finalTool, tool);
    equal(privateFile(actual).sha256, actualProof.sha256, 'Actual report bytes changed');
    for (const row of report.suites) equal(privateFile(row.reportFile).sha256, row.reportSha256, 'SQL report bytes changed');
    assert.ok(!interrupted.value); report.status = 'PASS'; report.stage = 'verified';
  } catch (error) { report.failure = { code: interrupted.value ? 'INTERRUPTED' : report.stage === 'preflight' ? 'SQL_PACKAGE_PREFLIGHT_REFUSED' : 'SQL_PACKAGE_REFUSED',
    detailCode: /^[A-Z0-9_]{1,40}$/u.test(error.code ?? '') ? error.code : null, incomplete: true }; }
  finally { report.finishedAt = stamp(); save(); closeSync(fd); }
  return report;
}

/** Installer entry point: re-read every report and current candidate/tool byte before accepting evidence. */
export async function validateLasarSqlEvidence({ file, actual, candidate }) {
  const evidence = privateFile(file), manifest = evidence.value, actualProof = privateFile(actual);
  return assertLasarSqlManifest(manifest, { candidate, actualProof, current: await sourceProof(candidate, actualProof.value),
    tool: toolProof(manifest.tool.toolRevision), evidenceSha256: evidence.sha256 });
}

/** Pure verification core, allowing refusal tests without executing SQL or a connected service. */
export function assertLasarSqlManifest(manifest, { candidate, actualProof, current, tool, read = privateFile, cleanup = cleanupTemp, evidenceSha256 }) {
  assert.equal(manifest.kind, 'lasar-package-sql'); assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.status, 'PASS');
  assert.equal(manifest.failure, undefined); assert.equal(manifest.candidate, candidate);
  equal(manifest.actual, { file: actualProof.file, sha256: actualProof.sha256 });
  assert.equal(manifest.candidateRevision, current.revision); equal(manifest.before, current); equal(manifest.after, current);
  equal(manifest.tool, manifest.finalTool); equal(tool, manifest.tool, 'SQL tool bytes differ from its committed revision');
  equal(manifest.suites.map(s => s.name), LASAR_SQL_SUITES.map(s => s.name));
  assert.ok(Date.parse(manifest.startedAt) <= Date.parse(manifest.finishedAt));
  for (const [index, row] of manifest.suites.entries()) {
    const suite = LASAR_SQL_SUITES[index]; assert.equal(row.status, 'PASS'); assert.equal(row.file, suite.file); assert.equal(row.kind, suite.kind);
    equal(row.args, [suite.file, '--ephemeral', '--out', row.reportFile]);
    assert.equal(path.dirname(row.reportFile), path.join(manifest.directory, suite.name));
    equal(row.beforeBinding, current.binding); equal(row.afterBinding, current.binding);
    const start = Date.parse(row.startedAt), end = Date.parse(row.finishedAt);
    assert.ok(Date.parse(manifest.startedAt) <= start && start <= end && end <= Date.parse(manifest.finishedAt));
    if (index) assert.ok(Date.parse(manifest.suites[index - 1].finishedAt) <= start, 'SQL suites overlapped');
    assert.equal(row.incomplete, undefined); assert.equal(row.reportPresent, true);
    const report = read(row.reportFile); assert.equal(report.sha256, row.reportSha256, 'SQL report changed');
    assert.ok(start <= Date.parse(report.value.startedAt) && Date.parse(report.value.finishedAt) <= end, 'SQL report predates this actual suite execution');
    equal(assertSqlSuiteReport(suite, report.value, { code: row.exitCode, signal: row.signal, cleanup: cleanup(row.tempDirectory) }), row.summary);
    equal(row.cleanup, cleanup(row.tempDirectory));
  }
  return { manifest, sha256: evidenceSha256, actualSha256: actualProof.sha256, binding: current.binding, candidateRevision: current.revision };
}

export function parseLasarSqlArgs(args) {
  assert.equal(args.length, 6, 'Use --candidate <dir> --actual <plan15-final.json> --out <new-private.json>');
  equal([args[0], args[2], args[4]], ['--candidate', '--actual', '--out']);
  return { candidate: args[1], actual: args[3], out: args[5] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await verifyLasarPackageSql(parseLasarSqlArgs(process.argv.slice(2)));
    console.log(`${report.status}: ${report.suites.filter(s => s.status === 'PASS').length}/${LASAR_SQL_SUITES.length} kandidatbundna SQL-sviter`);
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch { console.error('FAIL: SQL package precondition refused; no SQL suite started'); process.exitCode = 1; }
}
