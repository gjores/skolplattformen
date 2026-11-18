// Faktisk, egen lokal motor över HTTP med syntetiskt läsårsunderlag. Ingen databas, OIDC-session eller verksamhetsskrivning ingår.
// Bygg först: cd schemamotor && CARGO_PROFILE_RELEASE_STRIP=none cargo build --locked --offline --release
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { datumFixture } from '../../web/lib/schema-datum-fixture.mjs';
import { SCHEMA_CONTRACT_VERSION } from '../../web/lib/schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll } from '../../web/lib/schema-underlag.ts';
import { parseSchemaFortsatt, parseSchemaFortsattRequest, schemaFortsattProblem } from '../../web/lib/schema-fortsatt.ts';

const token = randomBytes(24).toString('hex'), port = 20_000 + Math.floor(Math.random() * 20_000), url = `http://127.0.0.1:${port}`;
globalThis.__schemaFortsattEnv = { SCHEMAMOTOR_URL: url, SCHEMAMOTOR_TOKEN: token };
registerHooks({ resolve(specifier, context, next) {
  return specifier === 'cloudflare:workers' ? { url: 'schema-fortsatt-test:worker', shortCircuit: true } : next(specifier, context);
}, load(specifier, context, next) {
  return specifier === 'schema-fortsatt-test:worker' ? { format: 'module', source: 'export const env=globalThis.__schemaFortsattEnv;', shortCircuit: true } : next(specifier, context);
} });
const { solveSchema, freshSchemaSolveSeed, validateSchema } = await import('../../web/lib/server/schemamotor.ts');
const service = spawn(fileURLToPath(new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url)), [], {
  env: { SCHEMAMOTOR_ADDR: `127.0.0.1:${port}`, SCHEMAMOTOR_TOKEN: token, SCHEMAMOTOR_THREADS: '1' }, stdio: 'ignore',
});
let spawnError = null; service.on('error', error => { spawnError = error; });
const stopped = new Promise(resolve => service.once('exit', resolve));
try {
  for (let attempt = 0; ; attempt++) {
    if (spawnError) throw spawnError;
    try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* endast den egna processens begränsade uppstart */ }
    assert.ok(attempt < 50, 'egen motor startade inte');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const f = datumFixture({ year: true }), positions = f.placements.slice(0, 2).map((p, i) => ({ ...p, day: 1, startMin: 600 + i * 120, room: null }));
  const input = parseSchemaFortsattRequest({ ...f.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.underlag.grundFingerprint,
    placements: positions, locks: { grundFingerprint: f.underlag.grundFingerprint, placements: [positions[0]] }, solveTimeMs: 10_000 });
  const underlag = buildSchemaUnderlag(f.plan, input, f.basis), before = schemaKontroll(underlag, positions, await validateSchema(underlag.problem, positions));
  const problem = schemaFortsattProblem(underlag.problem, positions, true);
  assert.equal(problem.reference.length, positions.length); assert.ok(problem.lessons.every(l => !l.rooms));
  const seed = freshSchemaSolveSeed(), nextSeed = freshSchemaSolveSeed();
  assert.ok(seed > 0 && Number.isSafeInteger(seed)); assert.notEqual(seed, nextSeed);
  const solution = await solveSchema(problem, input.solveTimeMs, seed);
  const after = schemaKontroll(underlag, solution.placements, await validateSchema(underlag.problem, solution.placements));
  const result = parseSchemaFortsatt({ forslag: { ...schemaForslag(f.plan, input, underlag, solution), metrics: after.metrics, teachings: after.teachings, trims: after.trims }, before, after }, input);
  const lock = positions[0], locked = solution.placements.find(p => p.lesson === lock.lesson);
  assert.deepEqual(locked, lock); assert.equal(result.after.total, 0); assert.ok(after.metrics.placed >= before.metrics.placed);
  assert.ok(solution.placements.every(p => p.room === null));
  assert.equal((await fetch(`${url}/v1/solve?time_ms=10000`, { method: 'POST', body: JSON.stringify(problem) })).status, 401);
  console.log(JSON.stringify({ kind: 'schema-fortsatt-actual-motor-http', status: 'PASS', timeMs: input.solveTimeMs,
    placedBefore: before.metrics.placed, placedAfter: after.metrics.placed, violationsBefore: before.total, violationsAfter: after.total,
    referenceCount: problem.reference.length, lockedPreserved: true, withoutRoomsPreserved: true, strictReply: true, freshSeedAcknowledged: true, noSessionDenied: true }));
} finally {
  delete globalThis.__schemaFortsattEnv;
  if (service.pid) {
    service.kill('SIGTERM');
    await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (service.exitCode === null && service.signalCode === null) { service.kill('SIGKILL'); await stopped; }
  }
}
