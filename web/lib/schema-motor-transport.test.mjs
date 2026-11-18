// Endast appens motortransport. HTTP-tjänsten och Rust-sökningen har egna faktiska prov.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return specifier === 'cloudflare:workers' ? { url: 'schema-test:worker', shortCircuit: true } : next(specifier, context);
}, load(url, context, next) {
  return url === 'schema-test:worker' ? { format: 'module', source: 'export const env={SCHEMAMOTOR_URL:"http://motor.example.test",SCHEMAMOTOR_TOKEN:"synthetic-secret"};', shortCircuit: true } : next(url, context);
} });
const { solveSchema, freshSchemaSolveSeed, SchemaEngineError } = await import('./server/schemamotor.ts');
const problem = { version: 5, id: 'syntetiskt-prov', time: { step_min: 5, start_grid_min: 5, days: [{ start_min: 480, end_min: 960 }] }, lessons: [], teachers: [], clusters: [], groups: [], activities: [] };
const reply = { version: 5, problem_id: problem.id, status: 'complete', placements: [], unplaced: [], diagnoses: [], metrics: { student_gap_min: 0, teacher_gap_min: 0 },
  stats: { elapsed_ms: 0 }, search_statistics: { lessons: [], bottlenecks: [], iterations: 0 } };

test('vald budget når HTTP-query och timeout får samma budget plus fem sekunders transportmarginal', async () => {
  const fetchBefore = globalThis.fetch, timeoutBefore = AbortSignal.timeout.bind(AbortSignal), calls = [], limits = [];
  try {
    AbortSignal.timeout = ms => { limits.push(ms); return new AbortController().signal; };
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(reply); };
    for (const time of [10_000, 30_000, 60_000]) await solveSchema(problem, time);
    await solveSchema(problem);
    assert.deepEqual(calls.map(c => new URL(c.url).searchParams.get('time_ms')), ['10000', '30000', '60000', '30000']);
    assert.deepEqual(limits, [15_000, 35_000, 65_000, 35_000]);
    assert.ok(calls.every(c => c.options.redirect === 'manual' && c.options.headers.Authorization === 'Bearer synthetic-secret'));
    const count = calls.length;
    assert.throws(() => solveSchema(problem, 120_000)); assert.equal(calls.length, count, 'ingen tyst kapning eller HTTP vid fel budget');
    globalThis.fetch = async () => { throw Error('synthetic-timeout'); };
    await assert.rejects(solveSchema(problem, 60_000), e => e instanceof SchemaEngineError && e.reason === 'schema_engine_unreachable');
  } finally { globalThis.fetch = fetchBefore; AbortSignal.timeout = timeoutBefore; }
});

test('sökfröet är ett servergenererat säkert 53-bitstal och motortransporten kräver exakt kvitto på fröet', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options }); return Response.json({ ...reply, stats: { ...reply.stats, seed: Number(new URL(url).searchParams.get('seed')) } });
  });
  for (const seed of [0, 1234, Number.MAX_SAFE_INTEGER]) await solveSchema(problem, 10_000, seed);
  assert.deepEqual(calls.map(c => new URL(c.url).searchParams.get('seed')), ['0', '1234', String(Number.MAX_SAFE_INTEGER)]);
  for (const seed of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1234']) assert.throws(() => solveSchema(problem, 10_000, seed));
  assert.equal(calls.length, 3, 'felaktiga frön skickas inte');
  t.mock.method(crypto, 'getRandomValues', array => { array.set([0xffffffff, 0xffffffff]); return array; });
  assert.equal(freshSchemaSolveSeed(), Number.MAX_SAFE_INTEGER);
  t.mock.method(crypto, 'getRandomValues', array => { array.set([0, 0]); return array; });
  assert.equal(freshSchemaSolveSeed(), 1, 'noll normaliseras till positivt sökfrö');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...reply, stats: { ...reply.stats, seed: 99 } }));
  await assert.rejects(solveSchema(problem, 10_000, 1234), e => e instanceof SchemaEngineError && e.reason === 'schema_engine_bad_reply');
});
