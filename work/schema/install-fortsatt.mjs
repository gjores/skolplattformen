#!/usr/bin/env node
// Godkänd installation av SM-FORTSATT och TMI på samma lokala mål. Ingen SQL tillämpas.
// Bind fryst kandidat och föregående par, bevara utkastrevisioner/salregister, byt, kontrollera, annars återgång.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseSha, verifySchemaUatRelease } from './prepare-uat-release.mjs';
import { assertTarget } from '../pilot/verify-target.mjs';
import { connect, classCohortTargetIdentity } from '../pilot/verify-class-cohort.mjs';
import { readMigrationJournal } from '../pilot/apply-elective-blocks.mjs';
import { schemaFingerprint } from '../pilot/named-timplan-snapshot.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const revision='66a4fb969bc71548768014da59bac2b7f1aedb7a';
const release='/private/tmp/schema-uat-release-20261118-66a4fb96';
const manifestHash='381e203c46e97669e5de37990dc3d50e1bb5154f932fc88988669f5e521df00a';
const stage=path.join(root,'work/pilot/targets/protected/runtime/schema-66a4fb969b');
const previous=path.join(root,'work/pilot/targets/protected/runtime/schema-f3869834e8');
const oldBase=path.join(previous,'runtime'), appDir=path.join(stage,'runtime/web'),motorDir=path.join(stage,'runtime/motor');
const targetFile=path.join(root,'work/pilot/targets/protected/manifest.json');
const node='/opt/homebrew/opt/node@25/bin/node',runId=randomUUID();
const out=path.join(root,'work/schema/results/fortsatt-66a4fb969b-install.json');
const report={kind:'schema-fortsatt-installation',revision,request:'ja (2026-11-18), uttryckligt svar på installation av fryst 66a4fb96 på 3012/3013',startedAt:new Date().toISOString(),status:'FAIL',checks:[],migrationsApplied:0,rollback:{performed:false}};
report.installerSha256 = releaseSha(readFileSync(fileURLToPath(import.meta.url)));
const pass=name=>{report.checks.push({name,status:'PASS'});console.log(JSON.stringify({stage:name,status:'PASS'}));};
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
function stageInventory(manifest, live = false, directory = stage, expectedHash = manifestHash) {
  assert.equal(releaseSha(readFileSync(path.join(directory, 'artifact.json'))), expectedHash);
  const found = [];
  const visit = rel => { for (const d of readdirSync(path.join(directory, rel), { withFileTypes: true })) { const name = rel + '/' + d.name;
    if (d.isDirectory()) visit(name); else { assert.ok(d.isFile()); if (live && privateFiles.has(name)) { assert.equal(lstatSync(path.join(directory, name)).mode & 0o777, 0o600); continue; } found.push(name); } } };
  for (const rel of ['runtime/web/dist-protected', 'runtime/web/scripts', 'runtime/motor', 'sql']) visit(rel);
  found.push('runtime/web/package.json', 'runtime/web/package-lock.json'); assert.deepEqual(found.sort(), manifest.artifact.files.map(f => f.path).sort());
  for (const f of manifest.artifact.files) { const file = path.join(directory, f.path), s = lstatSync(file); assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.size, f.bytes); assert.equal(releaseSha(readFileSync(file)), f.sha256); assert.equal(Boolean(s.mode & 0o111), f.executable); }
}

const previousRevision = 'f3869834e80ba270f024fe41e077a8bbdbbe81b8';
const previousHash = '0dc7da4e0f6f2133d275060a1ed0ce9db6449b0fc1fbc823edace0a4fad891ba';
const endpoints = ['forslag', 'fortsatt', 'kontroll', 'lagen', 'folj', 'samling', 'aktiviteter', 'diagnos', 'placering', 'fonster', 'datum', 'salar', 'villkorsforslag', 'underlag', 'salregister/las', 'salregister/spara', 'utkast/las', 'utkast/spara', 'utkast/status'];

// SHA256 av hela revisionsraden beräknas inne i databasen. Inga personuppgifter eller dokument hämtas eller skrivs till provrapporten.
async function savedRevisions(tx) {
  const drafts = Array.from(await tx`select draft_id::text id, revision, encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') row_hash from public.schema_draft_revisions r order by draft_id,revision`);
  const rooms = Array.from(await tx`select unit_id::text id, revision, encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') row_hash from public.school_room_register_revisions r order by unit_id,revision`);
  return { drafts, rooms };
}
function preserved(before, after) {
  for (const name of ['drafts', 'rooms']) {
    const keys = new Set(before[name].map(r => `${r.id}:${r.revision}`));
    assert.deepEqual(after[name].filter(r => keys.has(`${r.id}:${r.revision}`)), before[name]);
  }
}
async function motorSmoke(token) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (const version of [4, 5]) {
    const problem = { version, id: `install-fortsatt-${version}`, time: { step_min: 5, start_grid_min: 5, days: [{ start_min: 480, end_min: 720 }] },
      teachers: [{ id: 't' }], clusters: [{ id: 'c', size: 2 }], groups: [{ id: 'g', clusters: ['c'] }], activities: [{ id: 'a' }, { id: 'b' }],
      lessons: [{ id: 'p1', activity: 'a', duration_min: 40, teachers: ['t'], groups: ['g'], locked: { day: 0, start_min: 480 } },
        { id: 'p2', activity: 'b', duration_min: 40, teachers: ['t'], groups: ['g'] }],
      reference: [{ lesson: 'p1', day: 0, start_min: 480 }], rules: { break_min: 5, lunch: null, same_day: 'allow' } };
    const seed = 763129 + version;
    const response = await request(`http://127.0.0.1:3013/v1/solve?time_ms=200&seed=${seed}`, { method: 'POST', headers, body: JSON.stringify(problem) });
    assert.equal(response.status, 200);
    const solution = await response.json();
    assert.equal(solution.version, version); assert.equal(solution.problem_id, problem.id); assert.equal(solution.stats.seed, seed);
    assert.equal(solution.placements.length, 2); assert.equal(solution.unplaced.length, 0);
    const locked = solution.placements.find(p => p.lesson === 'p1'); assert.equal(locked.day, 0); assert.equal(locked.start_min, 480);
    assert.ok(solution.placements.every(p => p.rooms.length === 0));
    const control = await request('http://127.0.0.1:3013/v1/validate', { method: 'POST', headers, body: JSON.stringify({ problem, placements: solution.placements }) });
    assert.equal(control.status, 200); assert.equal((await control.json()).violations.length, 0);
  }
  assert.equal((await request('http://127.0.0.1:3013/v1/solve?time_ms=200&seed=123', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
}

assert.deepEqual(process.argv.slice(2), ['--install-fortsatt']);
assert.ok(!existsSync(stage) && !existsSync(out), 'new stage and report required');
let db, oldApp, oldMotor, oldAppId, oldMotorId, newApp, newMotor, token, priorRevisions;
let appAttempted = false, motorAttempted = false, appStopped = false, motorStopped = false;
try {
  assert.equal(releaseSha(readFileSync(path.join(release, 'artifact.json'))), manifestHash);
  const manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') });
  assert.equal(manifest.source.revision, revision); assert.equal(manifest.previousRuntimeRevision, previousRevision);
  assert.equal(manifest.artifact.fileCount, 1490); assert.deepEqual(manifest.contracts, { app: 8, motor: 5 });
  const proof = json(path.join(root, 'work/schema/results/fortsatt-frozen-motor-66a4fb96.json'));
  assert.equal(proof.status, 'PASS'); assert.equal(proof.timeMs, 60000); assert.equal(proof.motorBinary.explicitlyBound, true);
  assert.equal(proof.motorBinary.sha256, manifest.artifact.files.find(f => f.path === 'runtime/motor/schemamotor-tjanst').sha256);
  for (const key of ['motorBinaryUnchanged', 'lockedPreserved', 'withoutRoomsPreserved', 'strictReply', 'freshSeedAcknowledged', 'noTokenDenied', 'ownTemporaryProcessCleaned']) assert.equal(proof[key], true);
  assert.equal(proof.violationsAfter, 0); assert.ok(proof.placedAfter > proof.placedBefore);
  const final = json(path.join(root, 'work/schema/results/fortsatt-final-20261118.json'));
  assert.equal(final.status, 'PASS'); assert.equal(final.checks.node.failed, 0); assert.equal(final.checks.ui.uniqueProfileCases, 34);
  for (const [name, hash] of Object.entries(final.sourceSha256)) assert.equal(releaseSha(readFileSync(path.join(release, 'source', name))), hash);
  pass('approved exact frozen candidate, 1490 files, dependencies and bound 60s proof');

  const installed = json(path.join(root, 'work/schema/results/uxf23-f3869834e8-install.json'));
  assert.equal(installed.status, 'PASS'); assert.equal(installed.revision, previousRevision); assert.equal(installed.manifestSha256, previousHash);
  const prior = json(path.join(previous, 'artifact.json')); assert.equal(prior.source.revision, previousRevision);
  stageInventory(prior, true, previous, previousHash); assert.deepEqual(prior.sql, manifest.sql);
  assert.equal(execute('/usr/bin/git', ['diff', '--name-only', previousRevision, revision, '--', 'supabase/migrations', 'web/lib/server/authz.ts', 'web/lib/server/mandates.ts', 'web/lib/server/mandate-route.ts']), '');
  const target = await assertTarget('protected', { requireRunning: false, requireIdp: false }); db = connect(target);
  const reviewed = json(path.join(root, 'work/schema/results/schema-uat-target-readonly-final-20261116.json'));
  await db.begin('isolation level repeatable read read only', async tx => {
    report.targetIdentitySha256 = (await classCohortTargetIdentity(tx, target)).sha256;
    assert.equal(report.targetIdentitySha256, reviewed.database.identitySha256);
    const journal = await readMigrationJournal(tx); assert.equal(journal.length, 171); assert.equal(releaseSha(journal), installed.database.installed.journalSha256);
    assert.equal(await schemaFingerprint(tx), installed.database.installed.fingerprint);
    // Pröva att revisionsläsningen fungerar före varje processförändring.
    await savedRevisions(tx);
  });
  pass('old pair and unchanged SQL/mandate gate verified; correct local database and 171-entry journal read only');

  const oldListener = listener(3012); assert.ok(oldListener); oldApp = appRoot(oldListener, path.join(oldBase, 'web'));
  oldMotor = listener(3013); assert.ok(oldMotor); assert.equal(cwd(oldMotor), path.join(oldBase, 'motor'));
  oldAppId = processIdentity(oldApp); oldMotorId = processIdentity(oldMotor);
  const tokenBytes = readFileSync(path.join(oldBase, 'motor/token')); token = tokenBytes.toString('utf8').trim(); assert.match(token, /^[a-f0-9]{32,128}$/u);
  const varsBefore = envMap(path.join(oldBase, 'web/dist-protected/server/.dev.vars')); assert.equal(varsBefore.get('SCHEMAMOTOR_TOKEN'), token);
  cpSync(path.join(release, 'runtime'), path.join(stage, 'runtime'), { recursive: true }); cpSync(path.join(release, 'sql'), path.join(stage, 'sql'), { recursive: true }); chmodSync(stage, 0o700);
  for (const f of ['artifact.json', 'dependencies.json']) copyFileSync(path.join(release, f), path.join(stage, f));
  symlinkSync(path.join(root, 'web/node_modules'), path.join(appDir, 'node_modules'), 'dir');
  const mf = path.join(stage, 'runtime/work/pilot/targets/protected'); mkdirSync(mf, { recursive: true }); symlinkSync(targetFile, path.join(mf, 'manifest.json'));
  stageInventory(manifest); writeFileSync(path.join(motorDir, 'token'), tokenBytes, { flag: 'wx', mode: 0o600 });
  pass('new stage copied without rebuild; old configuration and rollback pair retained');

  appAttempted = true; await stop(oldApp, path.join(oldBase, 'web'), 3012, oldAppId); appStopped = true;
  priorRevisions = await db.begin('isolation level repeatable read read only', savedRevisions);
  report.preservedRevisions = Object.fromEntries(Object.entries(priorRevisions).map(([name, rows]) => [name, { count: rows.length, sha256: releaseSha(rows) }]));
  motorAttempted = true; await stop(oldMotor, path.join(oldBase, 'motor'), 3013, oldMotorId); motorStopped = true;
  newMotor = launch(path.join(stage, 'runtime'), 'motor', token, runId); await ready(3013, motorDir, 'http://127.0.0.1:3013/v1/health');
  newApp = launch(path.join(stage, 'runtime'), 'web', token, runId);
  const app = await ready(3012, appDir, 'http://127.0.0.1:3012/'); assert.equal(appRoot(app, appDir), newApp);
  assert.equal(json(path.join(appDir, 'dist-protected/build-mode.json')).revision, revision);
  const health = await (await request('http://127.0.0.1:3013/v1/health')).json(); assert.equal(health.contract_version, 5); assert.deepEqual(health.supported_problem_versions, [4, 5]);
  pass('approved 66a4fb96 app/motor pair running on 3012/3013 with correct build and health');
  await motorSmoke(token); pass('installed motor accepts new seed and both problem versions; reference/lock/roomless and independent validation pass');
  for (const endpoint of endpoints) {
    const response = await request('http://127.0.0.1:3012/api/schema/' + endpoint, { method: 'POST', headers: { Origin: 'http://127.0.0.1:3012', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401); assert.equal((await response.json()).code, 'no_session'); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  pass('all 19 schema routes including fortsatt deny without a session and remain no-store');
  const vars = envMap(path.join(appDir, 'dist-protected/server/.dev.vars'));
  assert.equal(vars.get('SESSION_SECRET'), varsBefore.get('SESSION_SECRET')); assert.equal(vars.get('SCHEMAMOTOR_TOKEN'), token);
  await db.begin('isolation level repeatable read read only', async tx => {
    const journal = await readMigrationJournal(tx); assert.equal(journal.length, 171); assert.equal(releaseSha(journal), installed.database.installed.journalSha256);
    assert.equal(await schemaFingerprint(tx), installed.database.installed.fingerprint); preserved(priorRevisions, await savedRevisions(tx));
  });
  stageInventory(manifest, true); pass('journal/catalog and all prior draft/room-register revision rows preserved; same session secret and exact product files');
  report.manifestSha256 = manifestHash; report.inventorySha256 = manifest.artifact.sha256;
  report.stage = path.relative(root, stage); report.previousStage = path.relative(root, previous);
  report.processes = { appRoot: newApp, appListener: listener(3012), motorListener: listener(3013) }; report.status = 'PASS';
} catch (error) {
  process.exitCode = 1; report.failure = { name: error.name, code: error.code ?? null, messageSha256: releaseSha(String(error.message ?? '')) };
  if (appAttempted || motorAttempted) {
    report.rollback.performed = true;
    try {
      if (newApp && cwd(newApp) === appDir) await stop(newApp, appDir, 3012, processIdentity(newApp));
      if (newMotor && cwd(newMotor) === motorDir) await stop(newMotor, motorDir, 3013, processIdentity(newMotor));
      if (appAttempted && !appStopped) { if (listener(3012)) await stop(oldApp, path.join(oldBase, 'web'), 3012, oldAppId); assert.equal(listener(3012), null); assert.equal(cwd(oldApp), null); }
      if (motorAttempted && !motorStopped) { if (listener(3013)) await stop(oldMotor, path.join(oldBase, 'motor'), 3013, oldMotorId); assert.equal(listener(3013), null); assert.equal(cwd(oldMotor), null); }
      if (motorAttempted && !listener(3013)) launch(oldBase, 'motor', token, runId + '-rollback');
      if (appAttempted && !listener(3012)) launch(oldBase, 'web', token, runId + '-rollback');
      const rm = await ready(3013, path.join(oldBase, 'motor'), 'http://127.0.0.1:3013/v1/health'), ra = await ready(3012, path.join(oldBase, 'web'), 'http://127.0.0.1:3012/');
      await delay(300); assert.equal(listener(3012), ra); assert.equal(listener(3013), rm); report.rollback.status = 'PASS';
    } catch (caught) { report.rollback.status = 'FAIL'; report.rollback.failure = { name: caught.name, messageSha256: releaseSha(String(caught.message ?? '')) }; }
  }
} finally {
  if (db) await db.end({ timeout: 5 }); report.finishedAt = new Date().toISOString();
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rollback: report.rollback, report: path.relative(root, out) }));
}

