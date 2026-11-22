#!/usr/bin/env node
// Exakt release i EGEN nätverksnamnrymd med oförändrad produktgrind och riktiga auth-/DB-/motorbytes.
// Återanvänder enbart en levande journal som skapats av schema-draft-actual-runtime.mjs.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifySchemaUatRelease } from '../schema/prepare-uat-release.mjs';
import { verifySchemaDraftActual } from './verify-schema-draft-actual.mjs';
import { SCHEMA_ACTUAL_ISSUER } from './schema-draft-actual-runtime.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const postgres = require('postgres');
const hash = value => createHash('sha256').update(value).digest('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }).trim();
const image = 'sha256:5b6c2c6cbc90b6085e3f9b3086110b1eccedb643374137bfdcd1d2f5c78f6cd1';
const args = process.argv.slice(2);
const flags = args.slice(8);
assert.ok(args.length >= 8 && (flags.length < 2 && flags.every(flag => ['--hold-until-ui-finished', '--study-plan', '--study-plan-class', '--schema-publication'].includes(flag))
  || flags.length === 2 && flags.includes('--study-plan') && flags.includes('--schema-publication')));
const classStudyPlan = flags.includes('--study-plan-class');
const studyPlan = flags.includes('--study-plan') || classStudyPlan;
const schemaPublication = flags.includes('--schema-publication');
assert.deepEqual([args[0], args[2], args[4], args[6]], ['--runtime', '--release', '--linux', '--out']);
const [privateFile, release, linux, out] = [args[1], args[3], args[5], args[7]].map(file => path.resolve(file));
assert.match(privateFile, /^\/private\/tmp\/schema-draft-actual-[a-z0-9-]+-evidence\/runtime-private\.json$/u);
assert.ok(linux.startsWith(path.dirname(privateFile) + '/'));
const parentDirectory = path.dirname(privateFile), owner = JSON.parse(readFileSync(privateFile, 'utf8'));
assert.equal(owner.kind, 'schema-actual-owned-runtime'); assert.ok(['ready', 'core-ready'].includes(owner.status)); assert.equal(owner.cleanup, 'pending');
assert.match(owner.runId, /^[a-f0-9-]{36}$/u); assert.equal(owner.database, 'named_timplan_' + owner.runId.replaceAll('-', ''));
for (const name of [owner.names.auth, owner.names.idp]) assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "skolplattform.schema-actual"}}', name]), owner.runId);
assert.equal(docker(['network', 'inspect', '--format', '{{index .Labels "skolplattform.schema-actual"}}', owner.names.network]), owner.runId);
console.log(JSON.stringify({ stage: 'verifying-exact-release-and-installed-dependencies' }));
const studyMigrations = [
  '20261120110000_individual_study_plans.sql',
  '20261120111000_individual_study_plan_impact.sql',
  '20261121100000_individual_study_plan_table.sql',
];
if (classStudyPlan || schemaPublication) studyMigrations.push(
  '20261121110000_individual_study_plan_program_terms.sql',
  '20261121120000_individual_study_plan_class.sql',
);
if (schemaPublication) studyMigrations.push('20261122100000_schema_publications.sql');

function verifyInputs() {
  const manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') });
  const coreProofFile = path.join(parentDirectory, 'core-provenance.json');
  const coreProof = existsSync(coreProofFile) ? JSON.parse(readFileSync(coreProofFile, 'utf8')) : JSON.parse(readFileSync(parentDirectory.replace(/-evidence$/u, '.json'), 'utf8')).runtime;
  assert.equal(coreProof.noTargetReads, true); assert.equal(coreProof.noUserBrowserAuth, true);
  for (const sql of manifest.sql) assert.equal(coreProof.migrations.find(m => m.file === sql.file)?.sha256, sql.sha256);
  const verifiedStudyMigrations = studyPlan || schemaPublication ? studyMigrations.map(file => {
    const relative = 'supabase/migrations/' + file;
    const sha256 = hash(execFileSync('git', ['show', manifest.source.revision + ':' + relative], { cwd: root }));
    assert.equal(hash(readFileSync(path.join(release, 'source', relative))), sha256, 'Release source differs for ' + file);
    const applied = coreProof.migrations.filter(item => item.file === file);
    assert.equal(applied.length, 1, 'Owned core must have applied ' + file);
    assert.equal(applied[0].sha256, sha256, 'Owned core SQL differs for ' + file);
    return { file, sha256 };
  }) : null;
  const integrity = JSON.parse(readFileSync(path.join(linux, 'integrity.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(release, 'source/web/package-lock.json'), 'utf8'));
  const workerd = lock.packages['node_modules/@cloudflare/workerd-linux-arm64'], esbuild = lock.packages['node_modules/@esbuild/linux-arm64'];
  assert.equal(integrity.workerd.version, workerd.version); assert.equal(integrity.workerd.integrity, workerd.integrity);
  assert.equal('sha512-' + createHash('sha512').update(readFileSync(path.join(linux, 'workerd.tgz'))).digest('base64'), workerd.integrity);
  assert.equal(integrity.workerd.binarySha256, hash(readFileSync(path.join(linux, 'node_modules/@cloudflare/workerd-linux-arm64/bin/workerd'))));
  assert.equal(integrity.esbuild.integrity, esbuild.integrity); assert.equal(integrity.esbuild.binarySha256, hash(readFileSync(path.join(linux, 'node_modules/@esbuild/linux-arm64/bin/esbuild'))));
  assert.equal('sha512-' + createHash('sha512').update(readFileSync(path.join(linux, 'esbuild.tgz'))).digest('base64'), esbuild.integrity);
  assert.equal(integrity.node.archiveSha256, hash(readFileSync(path.join(linux, 'node.tar.xz'))));
  assert.equal(integrity.libatomic.archiveSha256, hash(readFileSync(path.join(linux, 'libatomic1_12.2.0-14+deb12u1_arm64.deb'))));
  assert.equal(integrity.node.binarySha256, hash(readFileSync(path.join(linux, 'node/bin/node'))));
  assert.equal(integrity.libatomic.binarySha256, hash(readFileSync(path.join(linux, 'libatomic/usr/lib/aarch64-linux-gnu/libatomic.so.1.2.0'))));
  assert.equal(docker(['image', 'inspect', image, '--format', '{{.Architecture}}']), 'arm64');
  // Den här kontrollen granskar commitblobben, inte den tidigare privata guardvarianten.
  const finalGuard = execFileSync('git', ['show', manifest.source.revision + ':web/lib/server/mandates.ts'], { cwd: root });
  assert.deepEqual(finalGuard, execFileSync('git', ['show', '95abc5a1:web/lib/server/mandates.ts'], { cwd: root }), 'Product security gate differs from the accepted unchanged baseline');
  return { manifest, coreProof, integrity, guardSha256: hash(finalGuard), verifiedStudyMigrations };
}
const freePort = async () => { const s = createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); const port = s.address().port; await new Promise(resolve => s.close(resolve)); return port; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = async (url, check = () => {}) => { for (let attempt = 0; attempt < 180; attempt++) { check(); try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (r.ok) return; } catch {} await sleep(250); } throw new Error('Owned namespace readiness timed out: ' + new URL(url).pathname); };

const makeRuntimeFactory = ({ manifest, coreProof, integrity, guardSha256, verifiedStudyMigrations }) => async ({ directory, onStage }) => {
  const runId = randomUUID(), container = 'schema-worker-' + runId.replaceAll('-', ''), ports = { worker: await freePort(), motor: await freePort() };
  const baseURL = `http://127.0.0.1:${ports.worker}`, idpURL = owner.idpURL;
  const db = postgres({ path: path.join(owner.pg, `.s.PGSQL.${owner.ports.postgres}`), database: owner.database, username: 'postgres', max: 2, prepare: false, onnotice: () => {} });
  assert.equal((await db`select current_database() name`)[0].name, owner.database);
  const keycloak = async (route, method = 'GET', body) => {
    const login = await fetch(idpURL + '/realms/master/protocol/openid-connect/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'schema-test-admin', password: owner.secrets.idpAdmin }) });
    assert.ok(login.ok); const token = (await login.json()).access_token;
    const response = await fetch(idpURL + '/admin/realms/skolplattform-test' + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, 'Owned Keycloak setup rejected: ' + response.status); const text = await response.text(); return text ? JSON.parse(text) : null;
  };
  const [client] = await keycloak('/clients?clientId=skolplattform-worker'), originalClient = await keycloak('/clients/' + client.id);
  const updated = structuredClone(originalClient); updated.redirectUris.push(baseURL + '/api/auth/callback'); updated.webOrigins.push(baseURL);
  updated.attributes['post.logout.redirect.uris'] += '##' + baseURL + '/'; await keycloak('/clients/' + client.id, 'PUT', updated);
  const motorToken = randomBytes(24).toString('hex'), sessionSecret = randomBytes(48).toString('base64url');
  const configDirectory = path.join(directory, 'worker-config'), runner = path.join(directory, 'runner'), workerEvidence = path.join(directory, 'worker-evidence');
  for (const d of [configDirectory, runner, workerEvidence]) mkdirSync(d, { mode: 0o700 });
  const motorRequestsFile = path.join(workerEvidence, 'motor-requests.jsonl'); writeFileSync(motorRequestsFile, '', { mode: 0o600 });
  copyFileSync(path.join(root, 'work/pilot/schema-draft-namespace-worker.mjs'), path.join(runner, 'schema-draft-namespace-worker.mjs'));
  copyFileSync(path.join(root, 'web/scripts/preview-worker-modules.mjs'), path.join(runner, 'preview-worker-modules.mjs'));
  const vars = { APP_MODE: 'protected', OIDC_ISSUER: SCHEMA_ACTUAL_ISSUER, OIDC_CLIENT_ID: 'skolplattform-worker', OIDC_CLIENT_SECRET: owner.secrets.client,
    OIDC_REDIRECT_URI: baseURL + '/api/auth/callback', OIDC_POST_LOGOUT_REDIRECT_URI: baseURL + '/', SUPABASE_URL: 'http://127.0.0.1:56331', SUPABASE_ANON_KEY: 'own-synthetic-local-api',
    DATABASE_URL: `postgresql://skolplattform_worker:${owner.secrets.workerDb}@127.0.0.1:56322/${owner.database}`, SESSION_SECRET: sessionSecret,
    MFA_ACR_VALUES: '2', MFA_MAX_AGE_SECONDS: '28800', SESSION_IDLE_SECONDS: '900', SESSION_ABSOLUTE_SECONDS: '28800',
    SCHEMAMOTOR_URL: `http://schema-test-host:${ports.motor}`, SCHEMAMOTOR_TOKEN: motorToken };
  writeFileSync(path.join(configDirectory, 'worker-private.json'), JSON.stringify({ postgresPort: owner.ports.postgres, authHost: owner.names.auth, bindings: vars }), { mode: 0o600 });
  const journalFile = path.join(directory, 'namespace-private.json'), journal = { kind: 'schema-actual-owned-namespace', runId, parentRuntime: privateFile, container, ports, baseURL, idpURL, status: 'initializing', cleanup: 'pending' };
  const save = () => writeFileSync(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 }); save();
  let motor, fd, started = false;
  const startWorker = async () => {
    onStage('starting-final-release-motor');
    const motorBinary = path.join(release, 'runtime/motor/schemamotor-tjanst');
    fd = openSync(path.join(directory, 'motor.log'), 'wx', 0o600);
    motor = spawn(motorBinary, [], { cwd: directory, env: { PATH: process.env.PATH, SCHEMAMOTOR_TOKEN: motorToken, SCHEMAMOTOR_ADDR: `127.0.0.1:${ports.motor}` }, stdio: ['ignore', fd, fd] });
    await ready(`http://127.0.0.1:${ports.motor}/v1/health`, () => { if (motor.exitCode !== null) throw new Error('Final motor exited'); });
    onStage('starting-owned-linux-workerd-namespace');
    docker(['run', '-d', '--name', container, '--label', 'skolplattform.schema-actual=' + runId, '--network', owner.names.network, '--add-host', 'schema-test-host:host-gateway',
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--user', `${process.getuid()}:${process.getgid()}`, '--pids-limit', '512',
      '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777', '--publish', `127.0.0.1:${ports.worker}:8080`,
      '--volume', path.join(release, 'runtime/web/dist-protected') + ':/artifact:ro', '--volume', path.join(root, 'web/node_modules') + ':/deps/node_modules:ro',
      '--volume', linux + ':/linux:ro', '--volume', runner + ':/runner:ro', '--volume', configDirectory + ':/config:ro', '--volume', workerEvidence + ':/evidence:rw',
      '--env', 'NODE_PATH=/linux/node_modules', '--env', 'LD_LIBRARY_PATH=/linux/libatomic/usr/lib/aarch64-linux-gnu',
      '--env', 'MINIFLARE_WORKERD_PATH=/linux/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd', '--env', 'HOME=/tmp', '--env', 'CI=true',
      '--env', 'WRANGLER_SEND_METRICS=false', '--env', 'WRANGLER_WRITE_LOGS=false', image, '/linux/node/bin/node', '/runner/schema-draft-namespace-worker.mjs']); started = true;
    await ready(baseURL + '/api/health/db', () => { if (docker(['inspect', '--format', '{{.State.Running}}', container]) !== 'true') throw new Error('Owned Linux Worker exited'); });
    const health = await (await fetch(baseURL + '/api/health/db')).json(); assert.equal(health.role, 'skolplattform_worker'); assert.equal(health.runtime, 'workerd');
    journal.status = 'ready'; save();
    return { kind: 'exact-release-owned-network-namespace', noTargetReads: true, noUserBrowserAuth: true, health,
      release: { revision: manifest.source.revision, artifactSha256: manifest.artifact.sha256, manifestSha256: hash(readFileSync(path.join(release, 'artifact.json'))) },
      unchangedGuard: { revision: '95abc5a1', sha256: guardSha256 }, namespace: { container, image, ports: { postgres: 56322, auth: 56331 }, relays: 'real TCP/HTTP; no replacement claims or SQL' },
      linux: integrity, runner: { sha256: hash(readFileSync(path.join(runner, 'schema-draft-namespace-worker.mjs'))), moduleLoaderSha256: hash(readFileSync(path.join(runner, 'preview-worker-modules.mjs'))) },
      migrations: coreProof.migrations,
      ...(verifiedStudyMigrations ? { studyPlanMigrations: verifiedStudyMigrations } : {}),
      motor: { binarySha256: hash(readFileSync(motorBinary)), source: 'exact frozen release Rust HTTP service' } };
  };
  const cleanup = async () => {
    if (started) { assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "skolplattform.schema-actual"}}', container]), runId); writeFileSync(path.join(directory, 'worker.log'), docker(['logs', container]), { mode: 0o600 }); docker(['rm', '-f', container]); }
    if (motor && motor.exitCode === null) { motor.kill('SIGTERM'); await Promise.race([new Promise(resolve => motor.once('exit', resolve)), sleep(5000).then(() => motor.kill('SIGKILL'))]); }
    if (fd !== undefined) closeSync(fd);
    await keycloak('/clients/' + client.id, 'PUT', originalClient); await db.end({ timeout: 5 }); rmSync(configDirectory, { recursive: true, force: true });
    delete journal.users; journal.status = 'stopped'; journal.cleanup = 'complete'; save();
    return { cleanup: 'complete', stoppedOwnedContainers: [container], parentRuntimeRetained: true };
  };
  return { db, keycloak, baseURL, idpURL, directory, runId, motorRequestsFile, startWorker, cleanup,
    privateUpdate(value) { Object.assign(journal, value); save(); },
    reportLimits: ['Exact frozen release; unchanged product security gate, actual protected endpoints and school mandates',
      'Own initialized PostgreSQL/Keycloak/GoTrue in a previously created owned runtime; a separate new synthetic customer is seeded',
      'Native Linux workerd with locked binary integrity; only own TCP/HTTP relays inside its network namespace',
      'Storage helpers are bootstrap facades; no Storage/municipal integration or target installation is claimed',
      studyPlan || schemaPublication ? 'Synthetic schedule or study-plan cases; human acceptance is separate' : 'Product UI acceptance is separate'] };
};

async function finishOwnedCore() {
  writeFileSync(path.join(parentDirectory, 'ui-finished'), 'Final namespace verification completed\n', { mode: 0o600 });
  for (let i = 0; i < 160 && JSON.parse(readFileSync(privateFile, 'utf8')).cleanup !== 'complete'; i++) await sleep(250);
  const stoppedCore = JSON.parse(readFileSync(privateFile, 'utf8'));
  assert.equal(stoppedCore.cleanup, 'complete', 'Owned core cleanup has not completed');
  delete stoppedCore.users; delete stoppedCore.secrets;
  writeFileSync(privateFile, JSON.stringify(stoppedCore, null, 2), { mode: 0o600 });
}

if (studyPlan || schemaPublication) {
  let cleanupNamespace;
  try {
    const createRuntime = makeRuntimeFactory(verifyInputs());
    const runtimeFactory = async options => {
      const runtime = await createRuntime(options);
      let cleanup;
      cleanupNamespace = () => (cleanup ??= runtime.cleanup());
      return { ...runtime, cleanup: cleanupNamespace };
    };
    if (studyPlan) {
      const { verifyStudyPlanActual } = await import('./verify-study-plan-actual.mjs');
      const result = await verifyStudyPlanActual({ out, runtimeFactory, classOnly: classStudyPlan });
      if (result.status !== 'PASS') process.exitCode = 1;
    }
    if (schemaPublication) {
      const { verifySchemaPublicationActual } = await import('./verify-schema-publication-actual.mjs');
      const publicationOut = studyPlan ? out.replace(/\.json$/u, '-publication.json') : out;
      if ((await verifySchemaPublicationActual({ out: publicationOut, runtimeFactory })).status !== 'PASS') process.exitCode = 1;
    }
  } finally {
    try { await cleanupNamespace?.(); }
    finally { await finishOwnedCore(); }
  }
} else {
  const runtimeFactory = makeRuntimeFactory(verifyInputs());
  const result = await verifySchemaDraftActual({ out, holdSeconds: args[8] === '--hold-until-ui-finished' ? null : 0, runtimeFactory });
  // Den historiska varianten får aldrig återfå PASS när dess hållprocess senare sparar sin RAM-rapport.
  if (result.status === 'PASS') {
    await finishOwnedCore();
    if (owner.build) {
      const priorReportFile = parentDirectory.replace(/-evidence$/u, '.json'), prior = JSON.parse(readFileSync(priorReportFile, 'utf8'));
      prior.caseStatus = prior.caseStatus ?? prior.status; prior.status = 'HISTORICAL_GUARD_VARIANT'; prior.notEligibleForFinal = true;
      prior.approvalReview = { status: 'rejected', action: 'persistent local security-gate extension', reason: 'User authorization covered isolated tests; unchanged-product infrastructure is the safer alternative' };
      writeFileSync(priorReportFile, JSON.stringify(prior, null, 2), { mode: 0o600 });
    }
  }
}
