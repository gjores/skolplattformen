// Endast syntetiska kontrakts- och problemprov. Riktig motorsökning prövas separat i Rust och över HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchemaFortsatt, parseSchemaFortsattRequest, parseSchemaSolveRequest, schemaFortsattProblem } from './schema-fortsatt.ts';
import { SCHEMA_CONTRACT_VERSION, parseSchemaForslagRequest, parseSchemaKontrollRequest } from './schema-contract.ts';
import { schemaKontroll } from './schema-underlag.ts';
import { datumFixture } from './schema-datum-fixture.mjs';

const fixture = () => {
  const f = datumFixture({ year: true }), input = { ...f.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.underlag.grundFingerprint, placements: f.placements, solveTimeMs: 30_000 };
  const control = schemaKontroll(f.underlag, f.placements, { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  return { ...f, input, result: { forslag: { ...f.f, metrics: control.metrics }, before: structuredClone(control), after: structuredClone(control) } };
};

test('bara valbara 10/30/60 sekunder är giltiga kommandoalternativ; grundens äldre parsers är oförändrade', () => {
  const { input, request } = fixture();
  for (const solveTimeMs of [10_000, 30_000, 60_000]) {
    assert.equal(parseSchemaSolveRequest({ ...request, solveTimeMs }).solveTimeMs, solveTimeMs);
    assert.equal(parseSchemaFortsattRequest({ ...input, solveTimeMs }).solveTimeMs, solveTimeMs);
  }
  assert.equal(parseSchemaSolveRequest(request).solveTimeMs, 30_000);
  for (const solveTimeMs of [0, 5000, 120_000, NaN, null, '60000', {}, -1]) {
    assert.throws(() => parseSchemaSolveRequest({ ...request, solveTimeMs }));
    assert.throws(() => parseSchemaFortsattRequest({ ...input, solveTimeMs }));
  }
  assert.throws(() => parseSchemaSolveRequest({ ...request, extra: 1 }));
  assert.throws(() => parseSchemaFortsattRequest({ ...input, extra: 1 }));
  assert.throws(() => parseSchemaSolveRequest({ ...request, seed: 1 }));
  assert.throws(() => parseSchemaFortsattRequest({ ...input, seed: 1 }));
  assert.throws(() => parseSchemaForslagRequest({ ...request, solveTimeMs: 30_000 }));
  assert.throws(() => parseSchemaKontrollRequest(input));
});

test('referens och lås följer aktuellt schema; salfria och olagda pass får inga nya salar med register', () => {
  const { underlag, placements } = fixture(), source = structuredClone(underlag.problem);
  const positions = placements.slice(0, 2).map((p, i) => ({ ...p, room: i === 0 ? p.room : null }));
  source.lessons[0].locked = { day: positions[0].day, start_min: positions[0].startMin, rooms: [positions[0].room] };
  const before = structuredClone(source), problem = schemaFortsattProblem(source, positions, true);
  assert.deepEqual(source, before, 'underlaget ändras inte');
  assert.deepEqual(problem.reference, positions.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })));
  assert.deepEqual(problem.lessons[0].locked, source.lessons[0].locked);
  assert.ok(problem.lessons.slice(1).every(l => !l.rooms)); assert.ok(problem.lessons[0].rooms);
  assert.deepEqual(schemaFortsattProblem(source, positions, false).lessons, source.lessons, 'äldre utkast behåller salkraven');
  assert.throws(() => schemaFortsattProblem(source, [...positions, positions[0]], true));
  assert.throws(() => schemaFortsattProblem(source, [{ ...positions[0], lesson: 'pass-999999' }], true));
  assert.throws(() => schemaFortsattProblem(source, positions.slice(1), true), 'lås måste finnas bland placeringarna');
  assert.throws(() => schemaFortsattProblem(source, positions.map((p, i) => i === 0 ? { ...p, room: 'sal-2' } : p), true), 'låst sal får inte skilja från utkastet');
});

test('granskningssvar binds till samma underlag, referens, salbild och kontrollmått', () => {
  const { input, result } = fixture();
  assert.equal(parseSchemaFortsatt(structuredClone(result), input).after.metrics.placed, input.placements.length);
  const cases = [
    r => { r.after.grundFingerprint = 'a'.repeat(28); }, r => { r.before.fingerprint = 'b'.repeat(28); },
    r => { r.before.metrics.placed--; }, r => { r.after.metrics.unplaced++; },
    r => { r.after.metrics.studentGapMin++; }, r => { r.after.rooms['pass-999999'] = 'sal-1'; },
    r => { delete r.after.rooms[input.placements[0].lesson]; },
    r => { r.forslag.lessons.push(r.forslag.lessons[0]); },
    r => { r.after.violations = [{ code: 'teacher_clash', message: 'Prov', lessons: ['pass-999999'] }]; r.after.total = 1; },
    r => { r.extra = true; },
  ];
  for (const mutate of cases) { const wrong = structuredClone(result); mutate(wrong); assert.throws(() => parseSchemaFortsatt(wrong, input)); }
});

test('kandidat som flyttar ett uttryckligt lås nekas även om svarets låslista ser riktig ut', () => {
  const { input, result } = fixture(), lock = input.placements[0];
  input.locks = { grundFingerprint: input.grundFingerprint, placements: [lock] }; result.forslag.locks = [lock];
  result.forslag.lessons.find(l => l.id === lock.lesson).startMin += 5;
  assert.throws(() => parseSchemaFortsatt(result, input));
});
