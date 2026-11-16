#!/usr/bin/env node
// Explicit godkänd lokal installation693d. Inga valfria mål, anslutningar eller migrationslistor.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySchemaUatRelease, releaseSha } from './prepare-uat-release.mjs';
import { preflightSchemaUatTargetReadOnly } from './preflight-uat-target-readonly.mjs';
import { assertTarget } from '../pilot/verify-target.mjs';
import { connect, classCohortTargetIdentity } from '../pilot/verify-class-cohort.mjs';
import { preservedRows, readMigrationJournal, runElectiveTransactions } from '../pilot/apply-elective-blocks.mjs';
import { schemaFingerprint } from '../pilot/named-timplan-snapshot.mjs';
import { SCHEMA_UAT_MIGRATIONS, schemaUatSources, schemaUatSqlMetadata, captureSchemaUatBaseline, installSchemaUatPackage } from '../pilot/schema-uat-install-core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const revision = '693d63138e9b5a96c5e25c0130385d5e31ff7d5f';
const release = '/private/tmp/schema-uat-release-20261116-693d6313';
const manifestHash = '23410c8cd33f60d6c03edb691abd268330940642a4c015711abf622942f2daba';
const reviewed = JSON.parse(readFileSync(path.join(root, 'work/schema/results/schema-uat-target-readonly-final-20261116.json'), 'utf8'));
const runtime = path.join(root, 'work/pilot/targets/protected/runtime');
const previous = path.join(runtime, 'schema-4267daf75b');
const stage = path.join(runtime, 'schema-693d63138e');
const appDir = path.join(stage, 'runtime/web'), motorDir = path.join(stage, 'runtime/motor');
const targetFile = path.join(root, 'work/pilot/targets/protected/manifest.json');
const node = '/opt/homebrew/opt/node@25/bin/node';
const out = path.join(root, 'work/schema/results/uat-693d63138e-install.json');
const runId = randomUUID(), privateDir = '/private/tmp/schema-uat-install-' + runId;
const report = { kind: 'schema-uat-approved-installation', revision, approval: 'ja installera där nu', startedAt: new Date().toISOString(),
  status: 'FAIL', stage: path.relative(root, stage), previousStage: path.relative(root, previous), phase: 'preflight', checks: [],
  migrationsCommitted: false, rollback: { performed: false }, limits: ['No account/password/OTP login on the active target', 'Denied HTTP probes use normal security audit', 'Not human acceptance or external integration'] };
const pass = (name, values = {}) => { report.checks.push({ name, status: 'PASS', ...values }); console.log(JSON.stringify({ stage: name, status: 'PASS' })); };
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
const request = (url, options = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), ...options });
function listener(port) {
  try { const ids = [...new Set(execute('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean))]; assert.ok(ids.length <= 1); return ids[0] ? Number(ids[0]) : null; }
  catch (error) { if (error.status === 1 && !String(error.stdout ?? '').trim()) return null; throw error; }
}
function cwd(pid) {
  try { return execute('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).split('\n').find(s => s.startsWith('n'))?.slice(1) ?? null; } catch { return null; }
}
function processIdentity(pid) { return releaseSha({ pid, cwd: cwd(pid), start: execute('/bin/ps', ['-p', String(pid), '-o', 'lstart=']), command: execute('/bin/ps', ['-p', String(pid), '-o', 'command=']) }); }
function appRoot(pid, directory) {
  assert.equal(cwd(pid), directory);
  for (let n = 0; n < 8; n++) { const parent = Number(execute('/bin/ps', ['-p', String(pid), '-o', 'ppid='])); if (parent <= 1 || cwd(parent) !== directory) return pid; pid = parent; }
  assert.fail('unexpected_app_ancestry');
}
async function stop(pid, directory, port, expectedIdentity) {
  assert.equal(cwd(pid), directory); assert.equal(processIdentity(pid), expectedIdentity); process.kill(pid, 'SIGTERM');
  for (let n = 0; n < 150; n++) { if (!listener(port) && cwd(pid) === null) return; await delay(100); }
  assert.fail('owned_process_did_not_stop');
}
async function ready(port, directory, url) {
  for (let n = 0; n < 180; n++) {
    const owner = listener(port); if (owner) { assert.equal(cwd(owner), directory); try { if ((await request(url)).status === 200) return owner; } catch { /* bounded startup */ } }
    await delay(150);
  }
  assert.fail('runtime_not_ready');
}
function envMap(file) { return new Map(readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])); }
function launch(base, role, token, label) {
  const directory = path.join(base, role), fd = openSync(path.join(base, `${role}-301x-${label}.log`), 'ax', 0o600);
  try {
    const env = { PATH: '/opt/homebrew/opt/node@25/bin:' + process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      SCHEMAMOTOR_ADDR: '127.0.0.1:3013', SCHEMAMOTOR_URL: 'http://127.0.0.1:3013', SCHEMAMOTOR_TOKEN: token, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };
    const child = spawn(role === 'motor' ? path.join(directory, 'schemamotor-tjanst') : node,
      role === 'motor' ? [] : ['scripts/run-mode.mjs', 'preview', '--mode', 'protected', '--port', '3012'], { cwd: directory, env, detached: true, stdio: ['ignore', fd, fd] });
    child.on('error', () => {}); assert.ok(Number.isInteger(child.pid)); child.unref(); return child.pid;
  } finally { closeSync(fd); }
}
const privateFiles = new Set(['runtime/web/dist-protected/server/.dev.vars', 'runtime/web/dist-protected/server/.dev.vars.lock', 'runtime/motor/token']);
function stageInventory(manifest, live = false) {
  assert.equal(releaseSha(readFileSync(path.join(stage, 'artifact.json'))), manifestHash);
  const found = [];
  const visit = rel => { for (const d of readdirSync(path.join(stage, rel), { withFileTypes: true })) { const name = rel + '/' + d.name;
    if (d.isDirectory()) visit(name); else { assert.ok(d.isFile()); if (live && privateFiles.has(name)) { assert.equal(lstatSync(path.join(stage, name)).mode & 0o777, 0o600); continue; } found.push(name); } } };
  for (const rel of ['runtime/web/dist-protected', 'runtime/web/scripts', 'runtime/motor', 'sql']) visit(rel);
  found.push('runtime/web/package.json', 'runtime/web/package-lock.json'); assert.deepEqual(found.sort(), manifest.artifact.files.map(f => f.path).sort());
  for (const f of manifest.artifact.files) { const file = path.join(stage, f.path), s = lstatSync(file); assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.size, f.bytes); assert.equal(releaseSha(readFileSync(file)), f.sha256); assert.equal(Boolean(s.mode & 0o111), f.executable); }
}
export async function installApprovedSchema() {
  assert.deepEqual(process.argv.slice(2), ['--install-approved-693d6313']); assert.ok(!existsSync(out) && !existsSync(stage));
  mkdirSync(privateDir, { mode: 0o700 }); let db, target, manifest, oldApp, oldMotor, oldAppId, oldMotorId, token, tokenBytes, oldAppStopped = false, oldMotorStopped = false, oldAppStopConfirmed = false, oldMotorStopConfirmed = false, newApp, newMotor;
  try {
    assert.equal(realpathSync(release), release);
    assert.equal(releaseSha(readFileSync(path.join(release, 'artifact.json'))), manifestHash);
    manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') }); assert.equal(manifest.source.revision, revision);
    report.manifestSha256 = manifestHash; report.inventorySha256 = manifest.artifact.sha256; report.sql = manifest.sql;
    pass('approved frozen artifact and installed dependencies', { files: manifest.artifact.fileCount });
    const preflight = await preflightSchemaUatTargetReadOnly(path.join('/private/tmp', 'schema-uat-target-readonly-install-' + runId + '.json'));
    assert.equal(preflight.failure, undefined); assert.equal(preflight.checks.length, 10); assert.equal(preflight.checks.filter(c => c.ok).length, 9);
    assert.deepEqual(preflight.journal, reviewed.journal); assert.deepEqual(preflight.database, reviewed.database); assert.deepEqual(preflight.runtime.artifact, reviewed.runtime.artifact);
    assert.deepEqual(preflight.target, reviewed.target); report.preflight = { journal: preflight.journal.journalSha256, schema: preflight.database.schemaFingerprint, legacyStrictFlagPreserved: true };
    pass('same reviewed local target, old pair and exact legacy journal');
    target = await assertTarget('protected', { requireRunning: false, requireIdp: false }); db = connect(target);
    const currentTarget = json(targetFile), discovery = await request(currentTarget.idp.issuer.replace(/\/$/u, '') + '/.well-known/openid-configuration');
    assert.equal(discovery.status, 200); assert.equal((await discovery.json()).issuer, currentTarget.idp.issuer);
    oldApp = appRoot(listener(3012), path.join(previous, 'web')); oldMotor = listener(3013); assert.equal(cwd(oldMotor), path.join(previous, 'motor'));
    oldAppId = processIdentity(oldApp); oldMotorId = processIdentity(oldMotor);
    tokenBytes = readFileSync(path.join(previous, 'motor/token')); token = tokenBytes.toString('utf8').trim(); assert.match(token, /^[a-f0-9]{32,128}$/u);
    const oldVars = path.join(previous, 'web/dist-protected/server/.dev.vars'); assert.equal(envMap(oldVars).get('SCHEMAMOTOR_TOKEN'), token);
    copyFileSync(oldVars, path.join(privateDir, 'rollback.dev-vars')); chmodSync(path.join(privateDir, 'rollback.dev-vars'), 0o600);
    cpSync(path.join(release, 'runtime'), path.join(stage, 'runtime'), { recursive: true }); cpSync(path.join(release, 'sql'), path.join(stage, 'sql'), { recursive: true });
    for (const f of ['artifact.json', 'dependencies.json']) copyFileSync(path.join(release, f), path.join(stage, f)); chmodSync(stage, 0o700);
    symlinkSync(path.join(root, 'web/node_modules'), path.join(appDir, 'node_modules'), 'dir');
    const privateManifest = path.join(stage, 'runtime/work/pilot/targets/protected'); mkdirSync(privateManifest, { recursive: true }); symlinkSync(targetFile, path.join(privateManifest, 'manifest.json'));
    stageInventory(manifest); writeFileSync(path.join(motorDir, 'token'), tokenBytes, { flag: 'wx', mode: 0o600 });
    pass('new stage and private rollback configuration prepared');
    report.phase = 'stop-app'; oldAppStopped = true; await stop(oldApp, path.join(previous, 'web'), 3012, oldAppId); oldAppStopConfirmed = true; pass('old app stopped with identity verified');
    report.phase = 'sql';
    const baseline = await db.begin('isolation level repeatable read read only', tx => captureSchemaUatBaseline(tx));
    assert.equal(baseline.fingerprint, reviewed.database.schemaFingerprint); assert.equal(baseline.priorJournal.sha256, reviewed.journal.journalSha256);
    const proof = json(path.join(root, 'work/schema/results/schema-uat-install-owned-20261116-target-shape.json'));
    assert.equal(proof.status, 'PASS'); assert.equal(proof.cleanup, 'complete'); assert.deepEqual(proof.sql, manifest.sql);
    for (const [file, digest] of Object.entries(proof.installerSources)) assert.equal(releaseSha(readFileSync(path.join(root, file))), digest);
    const sources = schemaUatSources(path.join(release, 'source')); let installedFingerprint = null, auditId = null;
    const revalidate = async tx => { assert.equal(releaseSha(readFileSync(targetFile)), reviewed.target.manifestSha256); assert.equal((await classCohortTargetIdentity(tx, target)).sha256, reviewed.database.identitySha256);
      assert.deepEqual(schemaUatSqlMetadata(schemaUatSources(path.join(release, 'source'))), manifest.sql); stageInventory(manifest, true);
      for (const [file, digest] of Object.entries(proof.installerSources)) assert.equal(releaseSha(readFileSync(path.join(root, file))), digest); };
    const preserve = tx => preservedRows(tx, baseline.columns, auditId);
    const migrate = async (tx, phase) => { const result = await installSchemaUatPackage(tx, { baseline, sources, revalidate, expectedFingerprint: installedFingerprint,
      audit: { runId, revision, candidateSha256: manifestHash } }, phase); installedFingerprint = result.fingerprint; auditId = result.auditId; return result; };
    report.database = { checks: [] };
    await runElectiveTransactions({ db, mode: 'apply', report: report.database, fingerprint: schemaFingerprint,
      recorded: async tx => (await tx`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${SCHEMA_UAT_MIGRATIONS.map(f => f.slice(0, 14))}::text[])`)[0].n, preserve, migrate });
    report.migrationsCommitted = true;
    const journal = await readMigrationJournal(db); assert.deepEqual(journal.slice(0, -3), baseline.originalJournal); assert.deepEqual(await preserve(db), baseline.rows);
    for (const table of ['schema_drafts', 'schema_draft_revisions', 'schema_draft_commands']) assert.equal((await db.unsafe('select count(*)::int n from public.' + table))[0].n, 0);
    report.database.preservedTables = Object.keys(baseline.rows).length; report.database.preservedRowsSha256 = releaseSha(baseline.rows); report.database.journalBefore = baseline.originalJournal.length; report.database.journalAfter = journal.length;
    pass('three migrations rehearsed, rolled back and atomically committed; original rows retained', { journalBefore: baseline.originalJournal.length, journalAfter: journal.length });
    report.phase = 'switch-runtime'; oldMotorStopped = true; await stop(oldMotor, path.join(previous, 'motor'), 3013, oldMotorId); oldMotorStopConfirmed = true;
    newMotor = launch(path.join(stage, 'runtime'), 'motor', token, runId); await ready(3013, motorDir, 'http://127.0.0.1:3013/v1/health');
    newApp = launch(path.join(stage, 'runtime'), 'web', token, runId); const appListener = await ready(3012, appDir, 'http://127.0.0.1:3012/'); assert.equal(appRoot(appListener, appDir), newApp);
    assert.equal(json(path.join(appDir, 'dist-protected/build-mode.json')).revision, revision); assert.equal((await (await request('http://127.0.0.1:3013/v1/health')).json()).contract_version, 4);
    pass('approved app and motor running on3012/3013'); report.phase = 'afterchecks';
    for (const endpoint of ['forslag', 'kontroll', 'lagen', 'folj', 'samling', 'aktiviteter', 'diagnos', 'placering', 'fonster', 'datum', 'salar', 'villkorsforslag', 'utkast/las', 'utkast/spara', 'utkast/status']) {
      const response = await request('http://127.0.0.1:3012/api/schema/' + endpoint, { method: 'POST', headers: { Origin: 'http://127.0.0.1:3012', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 401); assert.equal((await response.json()).code, 'no_session'); assert.equal(response.headers.get('Cache-Control'), 'no-store'); pass('protected endpoint ' + endpoint);
    }
    for (const endpoint of ['solve', 'validate', 'positions', 'diagnose', 'suggest']) { const r = await request('http://127.0.0.1:3013/v1/' + endpoint, { method: 'POST', body: '{}' }); assert.equal(r.status, 401); }
    pass('all five motor token gates');
    const login = await request('http://127.0.0.1:3012/api/auth/login'); assert.equal(login.status, 302);
    const location = new URL(login.headers.get('Location')); assert.equal(location.origin, new URL(currentTarget.idp.issuer).origin); assert.equal((await request(location.href)).status, 200);
    const vars = envMap(path.join(appDir, 'dist-protected/server/.dev.vars')); assert.equal(vars.get('SCHEMAMOTOR_TOKEN'), token); assert.equal(vars.get('SESSION_SECRET'), envMap(path.join(privateDir, 'rollback.dev-vars')).get('SESSION_SECRET'));
    stageInventory(manifest, true); pass('identity provider, unchanged session secret and final product inventory');
    report.processes = { appRoot: newApp, appListener: listener(3012), motorListener: listener(3013) }; report.status = 'PASS'; report.phase = 'complete';
  } catch (error) {
    report.failure = { name: error.name, code: error.code ?? null, messageSha256: releaseSha(String(error.message ?? '')) }; process.exitCode = 1;
    if (db) { try { const installed = (await readMigrationJournal(db)).filter(r => SCHEMA_UAT_MIGRATIONS.some(f => f.startsWith(r.version + '_'))); report.commitResolution = { rows: installed.length, sha256: releaseSha(installed) }; if (installed.length === 3) report.migrationsCommitted = true; } catch { report.commitResolution = { state: 'unknown' }; } }
    if (oldAppStopped || oldMotorStopped) {
      report.rollback.performed = true;
      try {
        if (newApp && cwd(newApp) === appDir) await stop(newApp, appDir, 3012, processIdentity(newApp));
        if (newMotor && cwd(newMotor) === motorDir) await stop(newMotor, motorDir, 3013, processIdentity(newMotor));
        // En process som redan fått SIGTERM får inte räknas som återställd bara för att den ännu svarar.
        if (oldAppStopped && !oldAppStopConfirmed) {
          if (listener(3012)) await stop(oldApp, path.join(previous, 'web'), 3012, oldAppId);
          assert.equal(listener(3012), null); assert.equal(cwd(oldApp), null); oldAppStopConfirmed = true;
        }
        if (oldMotorStopped && !oldMotorStopConfirmed) {
          if (listener(3013)) await stop(oldMotor, path.join(previous, 'motor'), 3013, oldMotorId);
          assert.equal(listener(3013), null); assert.equal(cwd(oldMotor), null); oldMotorStopConfirmed = true;
        }
        if (oldMotorStopped && !listener(3013)) { launch(previous, 'motor', token, runId + '-rollback'); await ready(3013, path.join(previous, 'motor'), 'http://127.0.0.1:3013/v1/health'); }
        if (oldAppStopped && !listener(3012)) { launch(previous, 'web', token, runId + '-rollback'); await ready(3012, path.join(previous, 'web'), 'http://127.0.0.1:3012/'); }
        const restoredMotor = await ready(3013, path.join(previous, 'motor'), 'http://127.0.0.1:3013/v1/health');
        const restoredApp = await ready(3012, path.join(previous, 'web'), 'http://127.0.0.1:3012/');
        await delay(300); assert.equal(listener(3013), restoredMotor); assert.equal(listener(3012), restoredApp);
        assert.equal((await request('http://127.0.0.1:3012/')).status, 200); assert.equal((await (await request('http://127.0.0.1:3013/v1/health')).json()).contract_version, 4);
        assert.equal(cwd(listener(3012)), path.join(previous, 'web')); assert.equal(cwd(listener(3013)), path.join(previous, 'motor')); report.rollback.status = 'PASS'; report.rollback.additiveSqlAndDraftsRetained = true;
      } catch (rollbackError) { report.rollback.status = 'FAIL'; report.rollback.failure = { name: rollbackError.name, messageSha256: releaseSha(String(rollbackError.message ?? '')) }; }
    }
  } finally { if (db) await db.end({ timeout: 5 }); report.finishedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); console.log(JSON.stringify({ status: report.status, phase: report.phase, migrationsCommitted: report.migrationsCommitted, rollback: report.rollback, report: path.relative(root, out) })); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await installApprovedSchema();
