#!/usr/bin/env node
// Laddar exakt fryst release-app i befintlig ÄGD testmiljö. Inget bygge eller målanslutning.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySchemaUatRelease, releaseInventory } from '../schema/prepare-uat-release.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), hash = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2); assert.equal(args.length, 6); assert.equal(args[0], '--runtime'); assert.equal(args[2], '--release'); assert.equal(args[4], '--api-report');
const [privateFile, release, reportFile] = [args[1], args[3], args[5]].map(p => path.resolve(p));
assert.ok(privateFile.startsWith('/private/tmp/') && privateFile.endsWith('/runtime-private.json'));
const directory = path.dirname(privateFile), journal = JSON.parse(readFileSync(privateFile, 'utf8')), api = JSON.parse(readFileSync(reportFile, 'utf8'));
assert.equal(journal.kind, 'schema-actual-owned-runtime'); assert.equal(journal.status, 'ready'); assert.equal(journal.cleanup, 'pending'); assert.equal(api.status, 'PASS');
assert.equal(api.runtime.health.runtime, 'workerd'); assert.equal(api.ui.directory, directory); assert.ok(Number.isSafeInteger(journal.workerPid));
assert.ok(execFileSync('ps', ['-p', String(journal.workerPid), '-o', 'command='], { encoding: 'utf8' }).includes(path.join(directory, 'worker-private.json')), 'Owned Worker changed');
const manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') });
const uiLibraries = new Set(['web/lib/schema-spara.ts', 'web/lib/schema-synk.ts', 'web/lib/unsaved-changes.tsx', 'web/lib/schema-passtabell.ts']);
const backend = file => file.startsWith('web/app/api/') || file.startsWith('web/lib/') && !uiLibraries.has(file) && !file.endsWith('.test.mjs') && !file.endsWith('-fixture.mjs');
const sources = Object.fromEntries(Object.entries(api.runtime.build.sources).filter(([file]) => backend(file))), files = Object.keys(sources).sort();
const committed = execFileSync('git', ['ls-tree', '-r', '--name-only', manifest.source.revision, '--', 'web/app/api', 'web/lib'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(backend).sort();
assert.deepEqual(committed, files, 'Release API inventory differs from the verified working-tree snapshot');
const blobs = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: files.map(file => manifest.source.revision + ':' + file).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024 });
let offset = 0;
for (const file of files) {
  const end = blobs.indexOf(10, offset), match = /^[0-9a-f]{40} blob (\d+)$/u.exec(blobs.subarray(offset, end).toString('utf8')); assert.ok(match, 'Committed API file missing: ' + file);
  const length = Number(match[1]); offset = end + 1; assert.equal(hash(blobs.subarray(offset, offset + length)), sources[file], 'API source changed; repeat API proof: ' + file);
  offset += length; assert.equal(blobs[offset++], 10);
}
assert.equal(offset, blobs.length);
for (const item of manifest.sql) assert.equal(api.runtime.migrations.find(m => m.file === item.file)?.sha256, item.sha256, 'Installed own SQL differs from release');
const releaseMotor = path.join(release, 'runtime/motor/schemamotor-tjanst');
assert.equal(hash(readFileSync(releaseMotor)), api.runtime.motor.binarySha256, 'Final Rust bytes differ; a final motor/API proof is required before this app-only reload');
const tag = path.join(directory, 'ui-release-' + Date.now()), buildRoot = path.join(tag, 'web/dist-protected'); mkdirSync(path.dirname(buildRoot), { recursive: true });
const original = path.join(release, 'runtime/web/dist-protected'); cpSync(original, buildRoot, { recursive: true });
assert.deepEqual(releaseInventory(buildRoot), releaseInventory(original), 'Release app copy changed bytes');
const workerFile = path.join(directory, 'worker-private.json'), settings = JSON.parse(readFileSync(workerFile, 'utf8')); settings.buildRoot = buildRoot;
writeFileSync(workerFile, JSON.stringify(settings), { mode: 0o600 }); process.kill(journal.workerPid, 'SIGUSR2');
let ready = false;
for (let attempt = 0; attempt < 180; attempt++) {
  const file = path.join(directory, 'worker-reloads.jsonl'); if (existsSync(file)) {
    const row = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1));
    if (row.status === 'ready' && row.buildRoot === buildRoot) { ready = true; break; }
    if (row.status === 'failed') throw new Error('Owned release Worker reload failed');
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(ready);
const proof = { kind: 'schema-actual-exact-release-app', at: new Date().toISOString(), releaseRevision: manifest.source.revision,
  releaseArtifactSha256: manifest.artifact.sha256, manifestSha256: hash(readFileSync(path.join(release, 'artifact.json'))), apiSourceUnchanged: true,
  apiSourceCount: files.length, originalApiSourceManifestSha256: api.runtime.build.sourceManifestSha256, identicalMotorBytes: true, buildRoot };
appendFileSync(path.join(directory, 'ui-builds.jsonl'), JSON.stringify(proof) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'ready', baseURL: journal.baseURL, ...proof }));
