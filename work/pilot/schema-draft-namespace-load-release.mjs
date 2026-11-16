#!/usr/bin/env node
// Appbyte ENBART i ägd Linux-nätverksnamnrymd. API-källor, SQL, motor och privata bindings måste bestå exakt.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifySchemaUatRelease } from '../schema/prepare-uat-release.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }).trim();
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const args = process.argv.slice(2); assert.equal(args.length, 8); assert.deepEqual([args[0], args[2], args[4], args[6]], ['--runtime', '--release', '--api-report', '--expected-manifest-sha256']);
const [privateFile, release, reportFile] = [args[1], args[3], args[5]].map(file => path.resolve(file));
assert.match(args[7], /^[a-f0-9]{64}$/u);
assert.equal(hash(readFileSync(path.join(release, 'artifact.json'))), args[7], 'Release manifest differs from the explicit reviewed digest');
assert.match(privateFile, /^\/private\/tmp\/schema-draft-final-namespace-[a-z0-9-]+-evidence\/namespace-private\.json$/u);
const directory = path.dirname(privateFile), journal = JSON.parse(readFileSync(privateFile, 'utf8')), api = JSON.parse(readFileSync(reportFile, 'utf8'));
assert.equal(journal.kind, 'schema-actual-owned-namespace'); assert.equal(journal.status, 'ready'); assert.equal(journal.cleanup, 'pending');
assert.equal(api.kind, 'schema-draft-actual-protected-api'); assert.equal(api.status, 'PASS'); assert.notEqual(api.notEligibleForFinal, true);
assert.equal(api.checks.length, 8); assert.ok(api.checks.every(c => c.status === 'PASS'));
assert.equal(api.runtime.kind, 'exact-release-owned-network-namespace'); assert.equal(api.runtime.namespace.container, journal.container);
assert.equal(api.ui.baseURL, journal.baseURL); assert.equal(api.ui.directory, directory);
const container = journal.container, owner = JSON.parse(readFileSync(journal.parentRuntime, 'utf8'));
assert.equal(owner.kind, 'schema-actual-owned-runtime'); assert.ok(['ready', 'core-ready'].includes(owner.status)); assert.equal(owner.cleanup, 'pending');
const uiFile = path.join(directory, 'ui-manifest.json'), uiManifest = JSON.parse(readFileSync(uiFile, 'utf8'));
assert.equal(uiManifest.syntheticOnly, true); assert.equal(uiManifest.directory, directory); assert.equal(uiManifest.baseURL, journal.baseURL);
const label = () => docker(['inspect', '--format', '{{index .Config.Labels "skolplattform.schema-actual"}}', container]);
assert.equal(label(), journal.runId); assert.equal(docker(['inspect', '--format', '{{.State.Running}}', container]), 'true');
assert.equal(docker(['inspect', '--format', '{{.Image}}', container]), api.runtime.namespace.image);
assert.equal(docker(['network', 'inspect', '--format', '{{index .Labels "skolplattform.schema-actual"}}', owner.names.network]), owner.runId);
console.log(JSON.stringify({ stage: 'verifying-new-exact-release-api-and-motor' }));
const manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') });
const previousRevision = api.runtime.release.revision;
const backend = file => file.startsWith('web/app/api/') || file.startsWith('web/lib/') && !file.endsWith('.test.mjs') && !file.endsWith('-fixture.mjs');
const inventory = revision => git(['ls-tree', '-r', '--name-only', revision, '--', 'web/app/api', 'web/lib']).split('\n').filter(backend).sort();
const files = inventory(previousRevision); assert.deepEqual(inventory(manifest.source.revision), files, 'API inventory changed; repeat API proof');
const blobHashes = revision => {
  const blobs = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: files.map(file => revision + ':' + file).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024 });
  let offset = 0; const hashes = [];
  for (const file of files) {
    const end = blobs.indexOf(10, offset), match = /^[a-f0-9]{40} blob (\d+)$/u.exec(blobs.subarray(offset, end).toString('utf8')); assert.ok(match, 'Missing committed API blob');
    const length = Number(match[1]); offset = end + 1; hashes.push({ file, sha256: hash(blobs.subarray(offset, offset + length)) });
    offset += length; assert.equal(blobs[offset++], 10);
  }
  assert.equal(offset, blobs.length); return hashes;
};
const sources = blobHashes(previousRevision); assert.deepEqual(blobHashes(manifest.source.revision), sources, 'API source changed; repeat protected API proof');
const guard = git(['show', manifest.source.revision + ':web/lib/server/mandates.ts']);
assert.equal(guard, git(['show', '95abc5a1:web/lib/server/mandates.ts']), 'Product gate changed');
for (const sql of manifest.sql) assert.equal(api.runtime.migrations.find(m => m.file === sql.file)?.sha256, sql.sha256, 'SQL changed');
assert.equal(hash(readFileSync(path.join(release, 'runtime/motor/schemamotor-tjanst'))), api.runtime.motor.binarySha256, 'Motor bytes changed; repeat API proof');
const mounts = JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', container]));
assert.deepEqual(mounts.map(m => m.Destination).sort(), ['/artifact', '/config', '/deps/node_modules', '/evidence', '/linux', '/runner']);
assert.ok(mounts.every(m => m.Type === 'bind' && m.RW === (m.Destination === '/evidence')));
const source = destination => mounts.find(m => m.Destination === destination).Source;
assert.equal(source('/runner'), path.join(directory, 'runner')); assert.equal(source('/config'), path.join(directory, 'worker-config'));
assert.equal(source('/evidence'), path.join(directory, 'worker-evidence')); assert.equal(source('/deps/node_modules'), path.join(root, 'web/node_modules'));
assert.equal(hash(readFileSync(path.join(source('/runner'), 'schema-draft-namespace-worker.mjs'))), api.runtime.runner.sha256);
assert.equal(hash(readFileSync(path.join(source('/runner'), 'preview-worker-modules.mjs'))), api.runtime.runner.moduleLoaderSha256);
const linux = source('/linux');
assert.equal(hash(readFileSync(path.join(linux, 'node/bin/node'))), api.runtime.linux.node.binarySha256);
assert.equal(hash(readFileSync(path.join(linux, 'node_modules/@cloudflare/workerd-linux-arm64/bin/workerd'))), api.runtime.linux.workerd.binarySha256);
assert.equal(hash(readFileSync(path.join(linux, 'node_modules/@esbuild/linux-arm64/bin/esbuild'))), api.runtime.linux.esbuild.binarySha256);
assert.equal(hash(readFileSync(path.join(linux, 'libatomic/usr/lib/aarch64-linux-gnu/libatomic.so.1.2.0'))), api.runtime.linux.libatomic.binarySha256);
const configFile = path.join(source('/config'), 'worker-private.json'), settings = JSON.parse(readFileSync(configFile, 'utf8')), configSha256 = hash(readFileSync(configFile));
assert.equal(settings.bindings.OIDC_REDIRECT_URI, journal.baseURL + '/api/auth/callback'); assert.equal(settings.postgresPort, owner.ports.postgres); assert.equal(settings.authHost, owner.names.auth);
assert.equal(new URL(settings.bindings.DATABASE_URL).pathname, '/' + owner.database); assert.equal(new URL(settings.bindings.DATABASE_URL).port, '56322');
assert.equal(settings.bindings.SUPABASE_URL, 'http://127.0.0.1:56331');
const bindingsHash = hash(JSON.stringify(settings.bindings)), at = Date.now(), oldArtifact = source('/artifact'), artifact = path.join(release, 'runtime/web/dist-protected');
const start = app => docker(['run', '-d', '--name', container, '--label', 'skolplattform.schema-actual=' + journal.runId,
  '--network', owner.names.network, '--add-host', 'schema-test-host:host-gateway', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
  '--user', `${process.getuid()}:${process.getgid()}`, '--pids-limit', '512', '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777', '--publish', `127.0.0.1:${journal.ports.worker}:8080`,
  ...mounts.flatMap(m => ['--volume', (m.Destination === '/artifact' ? app : m.Source) + ':' + m.Destination + (m.RW ? ':rw' : ':ro')]),
  '--env', 'NODE_PATH=/linux/node_modules', '--env', 'LD_LIBRARY_PATH=/linux/libatomic/usr/lib/aarch64-linux-gnu',
  '--env', 'MINIFLARE_WORKERD_PATH=/linux/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd', '--env', 'HOME=/tmp', '--env', 'CI=true',
  '--env', 'WRANGLER_SEND_METRICS=false', '--env', 'WRANGLER_WRITE_LOGS=false', api.runtime.namespace.image, '/linux/node/bin/node', '/runner/schema-draft-namespace-worker.mjs']);
const ready = async () => {
  for (let attempt = 0; attempt < 180; attempt++) {
    assert.equal(label(), journal.runId);
    if (docker(['inspect', '--format', '{{.State.Running}}', container]) !== 'true') throw new Error('Owned UI reload exited');
    try { const r = await fetch(journal.baseURL + '/api/health/db', { signal: AbortSignal.timeout(1000) }); if (r.ok) { const h = await r.json(); assert.equal(h.runtime, 'workerd'); assert.equal(h.role, 'skolplattform_worker'); return; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Owned UI reload readiness timed out');
};
writeFileSync(path.join(directory, 'worker-before-ui-' + at + '.log'), docker(['logs', container]), { mode: 0o600 });
const proof = { kind: 'schema-namespace-exact-ui-release', at: new Date().toISOString(), previousApiRevision: previousRevision, releaseRevision: manifest.source.revision,
  releaseManifestSha256: hash(readFileSync(path.join(release, 'artifact.json'))), releaseArtifactSha256: manifest.artifact.sha256,
  apiSourceUnchanged: true, apiSourceCount: files.length, apiSourceManifestSha256: hash(JSON.stringify(sources)),
  unchangedGuardSha256: api.runtime.unchangedGuard.sha256,
  identicalMotorBytes: true, motorSha256: api.runtime.motor.binarySha256, sqlUnchanged: true, bindingsHash, configSha256, baseURL: journal.baseURL,
  originalApiReportSha256: hash(readFileSync(reportFile)), originalApiChecks: api.checks.length, status: 'pending', noDbWrites: true, noAuthChanges: true };
assert.equal(label(), journal.runId); docker(['rm', '-f', container]);
try {
  start(artifact); await ready(); assert.equal(hash(readFileSync(configFile)), configSha256, 'Private bindings changed');
  proof.status = 'ready'; journal.currentUiRelease = manifest.source.revision; writeFileSync(privateFile, JSON.stringify(journal, null, 2), { mode: 0o600 });
  uiManifest.apiReleaseRevision = previousRevision; uiManifest.releaseRevision = manifest.source.revision;
  uiManifest.releaseManifestSha256 = proof.releaseManifestSha256; uiManifest.releaseArtifactSha256 = proof.releaseArtifactSha256;
  uiManifest.apiSourceUnchanged = true; uiManifest.identicalMotorBytes = true;
  writeFileSync(uiFile, JSON.stringify(uiManifest, null, 2), { mode: 0o600 });
} catch (error) {
  if (docker(['ps', '-a', '--filter', 'name=^' + container + '$', '--format', '{{.Names}}']) === container) { assert.equal(label(), journal.runId); docker(['rm', '-f', container]); }
  start(oldArtifact); await ready(); proof.status = 'rolled_back_to_previous_owned_artifact'; proof.failure = { code: error.code ?? error.name };
  process.exitCode = 1;
}
appendFileSync(path.join(directory, 'ui-builds.jsonl'), JSON.stringify(proof) + '\n', { mode: 0o600 });
console.log(JSON.stringify(proof));
