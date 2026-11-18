// Faktisk, egen lokal motor över HTTP med syntetiskt läsårsunderlag. Ingen databas, OIDC-session eller verksamhetsskrivning ingår.
// Bygg först: cd schemamotor && CARGO_PROFILE_RELEASE_STRIP=none cargo build --locked --offline --release
// Fryst motor: --motor-bin /absolut/sokvag/schemamotor-tjanst --expected-motor-sha256 HASH [--time-ms 60000] [--out rapport.json]
// --out skapar en ny fil; ett tidigare verifieringsbevis skrivs aldrig över.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { accessSync, constants, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { datumFixture } from '../../web/lib/schema-datum-fixture.mjs';
import { SCHEMA_CONTRACT_VERSION } from '../../web/lib/schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll } from '../../web/lib/schema-underlag.ts';
import { SCHEMA_SOLVE_TIMES, parseSchemaFortsatt, parseSchemaFortsattRequest, schemaFortsattProblem } from '../../web/lib/schema-fortsatt.ts';

const args = parseArgs({ options: { 'motor-bin': { type: 'string' }, 'expected-motor-sha256': { type: 'string' }, 'time-ms': { type: 'string' }, out: { type: 'string' } }, tokens: true });
const optionNames = args.tokens.filter(t => t.kind === 'option').map(t => t.name);
assert.equal(new Set(optionNames).size, optionNames.length, 'samma flagga får inte anges flera gånger');
const rawTime = args.values['time-ms'] ?? '10000';
assert.ok(SCHEMA_SOLVE_TIMES.map(String).includes(rawTime), '--time-ms ska vara 10000, 30000 eller 60000');
const timeMs = Number(rawTime);
const explicitBin = args.values['motor-bin'], expectedSha = args.values['expected-motor-sha256']?.toLowerCase();
assert.ok(explicitBin === undefined || isAbsolute(explicitBin), '--motor-bin ska vara en absolut sökväg');
assert.ok(explicitBin === undefined || expectedSha !== undefined, '--expected-motor-sha256 krävs med --motor-bin');
assert.ok(expectedSha === undefined || /^[0-9a-f]{64}$/u.test(expectedSha), '--expected-motor-sha256 ska ha 64 hextecken');
const motorBin = explicitBin ?? fileURLToPath(new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url));
assert.ok(lstatSync(motorBin).isFile(), 'motorbinären ska vara en vanlig fil');
accessSync(motorBin, constants.X_OK);
const motorSha = () => createHash('sha256').update(readFileSync(motorBin)).digest('hex'), actualSha = motorSha();
if (expectedSha !== undefined) assert.equal(actualSha, expectedSha, 'motorbinärens SHA256 stämmer inte');
assert.ok(args.values.out === undefined || args.values.out.trim().length > 0, '--out ska ha en sökväg');
const out = args.values.out === undefined ? null : resolve(args.values.out);
assert.ok(out === null || !existsSync(out), '--out får inte ersätta ett tidigare verifieringsbevis');
let report;

const token = randomBytes(24).toString('hex'), port = 20_000 + Math.floor(Math.random() * 20_000), url = `http://127.0.0.1:${port}`;
globalThis.__schemaFortsattEnv = { SCHEMAMOTOR_URL: url, SCHEMAMOTOR_TOKEN: token };
registerHooks({ resolve(specifier, context, next) {
  return specifier === 'cloudflare:workers' ? { url: 'schema-fortsatt-test:worker', shortCircuit: true } : next(specifier, context);
}, load(specifier, context, next) {
  return specifier === 'schema-fortsatt-test:worker' ? { format: 'module', source: 'export const env=globalThis.__schemaFortsattEnv;', shortCircuit: true } : next(specifier, context);
} });
const { solveSchema, freshSchemaSolveSeed, validateSchema } = await import('../../web/lib/server/schemamotor.ts');
const service = spawn(motorBin, [], {
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
    placements: positions, locks: { grundFingerprint: f.underlag.grundFingerprint, placements: [positions[0]] }, solveTimeMs: timeMs });
  const underlag = buildSchemaUnderlag(f.plan, input, f.basis), before = schemaKontroll(underlag, positions, await validateSchema(underlag.problem, positions));
  const problem = schemaFortsattProblem(underlag.problem, positions, true);
  assert.equal(problem.reference.length, positions.length); assert.ok(problem.lessons.every(l => !l.rooms));
  const seed = freshSchemaSolveSeed(), nextSeed = freshSchemaSolveSeed();
  assert.ok(seed > 0 && Number.isSafeInteger(seed)); assert.notEqual(seed, nextSeed);
  const solveStart = performance.now(), solution = await solveSchema(problem, input.solveTimeMs, seed), solveRoundTripMs = Math.round(performance.now() - solveStart);
  assert.ok(solution.elapsedMs <= input.solveTimeMs + 5000, 'motorn överskred budgeten och transportmarginalen');
  const after = schemaKontroll(underlag, solution.placements, await validateSchema(underlag.problem, solution.placements));
  const result = parseSchemaFortsatt({ forslag: { ...schemaForslag(f.plan, input, underlag, solution), metrics: after.metrics, teachings: after.teachings, trims: after.trims }, before, after }, input);
  const lock = positions[0], locked = solution.placements.find(p => p.lesson === lock.lesson);
  assert.deepEqual(locked, lock); assert.equal(result.after.total, 0); assert.ok(after.metrics.placed >= before.metrics.placed);
  assert.ok(solution.placements.every(p => p.room === null));
  assert.equal((await fetch(`${url}/v1/solve?time_ms=${input.solveTimeMs}`, { method: 'POST', body: JSON.stringify(problem) })).status, 401);
  assert.equal(motorSha(), actualSha, 'motorbinären ändrades under provet');
  report = { kind: 'schema-fortsatt-actual-motor-http', status: 'PASS', timeMs: input.solveTimeMs, actualElapsedMs: solution.elapsedMs, solveRoundTripMs, withinRequestedBudget: true,
    motorBinary: { file: basename(motorBin), sha256: actualSha, explicitlyBound: explicitBin !== undefined }, motorBinaryUnchanged: true,
    placedBefore: before.metrics.placed, placedAfter: after.metrics.placed, violationsBefore: before.total, violationsAfter: after.total,
    referenceCount: problem.reference.length, lockedPreserved: true, withoutRoomsPreserved: true, strictReply: true, freshSeedAcknowledged: true, noTokenDenied: true };
} finally {
  delete globalThis.__schemaFortsattEnv;
  if (service.pid) {
    service.kill('SIGTERM');
    let timer;
    try { await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]); }
    finally { clearTimeout(timer); }
    if (service.exitCode === null && service.signalCode === null) { service.kill('SIGKILL'); await stopped; }
  }
}
report.ownTemporaryProcessCleaned = true;
if (out !== null) writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report));
