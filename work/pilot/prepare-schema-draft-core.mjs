#!/usr/bin/env node
// Startar en helt egen riktig DB/Keycloak/GoTrue-kärna; startar ingen produkt-Worker och ersätter inga tillitskontroller.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSchemaActualRuntime } from './schema-draft-actual-runtime.mjs';
const [flag, requested] = process.argv.slice(2); assert.equal(flag, '--out');
const out = path.resolve(requested); assert.match(out, /^\/private\/tmp\/schema-draft-actual-[a-z0-9-]+\.json$/u); assert.equal(existsSync(out), false);
const directory = out.slice(0, -5) + '-evidence'; assert.equal(existsSync(directory), false); mkdirSync(directory, { mode: 0o700 });
const report = { kind: 'schema-actual-core-only', status: 'INITIALIZING', startedAt: new Date().toISOString(), noApiVerificationClaimed: true };
const save = () => writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 }); save();
let runtime;
try {
  runtime = await createSchemaActualRuntime({ directory, onStage: stage => console.log(JSON.stringify({ stage })) });
  runtime.privateUpdate({ status: 'core-ready' });
  writeFileSync(path.join(directory, 'core-provenance.json'), JSON.stringify(runtime.provenance, null, 2), { mode: 0o600 });
  report.status = 'CORE_READY'; report.runtime = runtime.provenance; save();
  console.log(JSON.stringify({ state: 'core-ready', privateFile: runtime.privateFile, provenance: path.join(directory, 'core-provenance.json') }));
  let requestedStop = false; const signal = () => { requestedStop = true; }; process.once('SIGINT', signal); process.once('SIGTERM', signal);
  try { while (!requestedStop && !existsSync(path.join(directory, 'ui-finished'))) await new Promise(resolve => setTimeout(resolve, 250)); }
  finally { process.off('SIGINT', signal); process.off('SIGTERM', signal); }
} catch (error) { report.status = 'FAIL'; report.failure = { code: error.code ?? error.name }; process.exitCode = 1; }
finally { if (runtime) report.cleanup = await runtime.cleanup(); report.completedAt = new Date().toISOString(); save(); }
