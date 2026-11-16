#!/usr/bin/env node
// Byter bara UI/artefakt i en redan ägd schema-testmiljö. Gammalt API-bevis förblir oförändrat.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { buildSchemaActual } from './schema-draft-actual-runtime.mjs';
const [flag, file] = process.argv.slice(2); assert.equal(flag, '--runtime'); assert.ok(file?.startsWith('/private/tmp/') && file.endsWith('/runtime-private.json'));
const before = JSON.parse(readFileSync(file, 'utf8')), directory = path.dirname(file); assert.equal(before.kind, 'schema-actual-owned-runtime');
assert.equal(before.status, 'ready'); assert.equal(before.cleanup, 'pending'); assert.ok(Number.isSafeInteger(before.workerPid));
assert.ok(execFileSync('ps', ['-p', String(before.workerPid), '-o', 'command='], { encoding: 'utf8' }).includes(path.join(directory, 'worker-private.json')), 'Worker ownership differs');
const build = await buildSchemaActual(directory, stage => console.log(JSON.stringify({ stage })), 'ui-' + Date.now());
const uiLibraries = new Set(['web/lib/schema-spara.ts', 'web/lib/schema-synk.ts', 'web/lib/unsaved-changes.tsx', 'web/lib/schema-passtabell.ts']);
const backend = file => file.startsWith('web/app/api/') || file.startsWith('web/lib/') && !uiLibraries.has(file) && !file.endsWith('.test.mjs');
for (const file of new Set([...Object.keys(before.build.sources), ...Object.keys(build.sources)])) if (backend(file)) {
  assert.equal(build.sources[file], before.build.sources[file], 'API source changed; rerun protected API proof before replacing artifact: ' + file);
}
const privateFile = path.join(directory, 'worker-private.json'), settings = JSON.parse(readFileSync(privateFile, 'utf8'));
settings.buildRoot = build.buildRoot; writeFileSync(privateFile, JSON.stringify(settings), { mode: 0o600 }); process.kill(before.workerPid, 'SIGUSR2');
let ready = false;
for (let attempt = 0; attempt < 180; attempt++) {
  const file = path.join(directory, 'worker-reloads.jsonl');
  if (existsSync(file)) {
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)), last = rows.at(-1);
    if (last.status === 'ready' && last.buildRoot === build.buildRoot) { ready = true; break; }
    if (last.status === 'failed') throw new Error('Owned Worker reload failed');
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(ready, 'Owned Worker did not acknowledge UI artifact');
const proof = { kind: 'schema-actual-ui-artifact', at: new Date().toISOString(), apiSourceUnchanged: true, originalApiSourceManifestSha256: before.build.sourceManifestSha256, build };
appendFileSync(path.join(directory, 'ui-builds.jsonl'), JSON.stringify(proof) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'ready', baseURL: before.baseURL, artifact: build.buildRoot, sourceManifestSha256: build.sourceManifestSha256, apiSourceUnchanged: true }));
