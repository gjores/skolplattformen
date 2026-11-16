import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION, SchemaVersionError, defaultSchemaVillkor, villkorNyckel } from './schema-contract.ts';
import { parseSchemaVillkorsforslag, parseSchemaVillkorsforslagRequest, schemaVillkorsandring, schemaVillkorsforslagInputFingerprint, tillampaSchemaVillkorsandring } from './schema-villkorsforslag.ts';

const id = '73111500-0000-4000-8000-000000000001', grund = 'a'.repeat(28), originalFingerprint = 'b'.repeat(28), nextFingerprint = 'c'.repeat(28);
const at = (lesson, startMin) => ({ lesson, day: 0, startMin, room: null });
const rule = { slag: 'larare', ref: id, typ: 'sparrad', days: [0], startMin: 480, endMin: 600 };
const request = (extra = {}) => ({ contractVersion: SCHEMA_CONTRACT_VERSION, unitId: id, schoolYear: 2026, period: 'ht', grundFingerprint: grund,
  villkor: { ...defaultSchemaVillkor(), egna: [rule] }, placements: [at('pass-2', 600), at('pass-3', 700)], lesson: 'pass-1', depth: 1, ...extra });
function reply(input = request()) {
  const to = at('pass-1', 480), placements = [...input.placements, to], change = schemaVillkorsandring(input.villkor, 0, 'Provlärare');
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: grund, fingerprint: originalFingerprint, inputFingerprint: schemaVillkorsforslagInputFingerprint(input),
    lesson: input.lesson, depth: input.depth, timedOut: false, elapsedMs: 15, testedCandidates: 1, newGrundCandidates: 0, explanation: 'Ett prövat alternativ.',
    suggestions: [{ id: 'regel-1', change, placement: { placements, changes: [{ lesson: 'pass-1', from: null, to }], cost: 0,
      metricsBefore: { studentGapMin: 0, teacherGapMin: 0, cost: 0 }, metricsAfter: { studentGapMin: 0, teacherGapMin: 0, cost: 0 } },
    kontroll: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: grund, fingerprint: nextFingerprint, violations: [], total: 0,
      teachings: [], trims: [], metrics: { lessons: 3, placed: 3, unplaced: 0, studentGapMin: 0, teacherGapMin: 0 }, rooms: {} } }] };
}
const parse = (value = reply(), input = request(), links) => parseSchemaVillkorsforslag(value, input, ['pass-1', 'pass-2', 'pass-3'], links);

test('versionsbunden begäran kräver ett parkerat pass och bara den dokumenterade formen', () => {
  const input = request(); assert.deepEqual(parseSchemaVillkorsforslagRequest(input), input);
  for (const extra of [{ unknown: true }, { depth: 0 }, { depth: 4 }, { depth: 1.5 }, { lesson: 'foreign' }, { lesson: null },
    { placements: [at('pass-1', 480)] }, { placements: [at('pass-2', 480), at('pass-2', 600)] }]) assert.throws(() => parseSchemaVillkorsforslagRequest(request(extra)));
  assert.throws(() => parseSchemaVillkorsforslagRequest(request({ contractVersion: 7 })), SchemaVersionError);
});

test('fingeravtrycket binder regler, lås, placeringar, valt pass, djup och skolans omfattning', () => {
  const input = request(), key = schemaVillkorsforslagInputFingerprint(input);
  assert.match(key, /^[0-9a-f]{28}$/u);
  assert.equal(schemaVillkorsforslagInputFingerprint({ ...input, placements: [...input.placements].reverse() }), key);
  assert.equal(schemaVillkorsforslagInputFingerprint({ ...input, villkor: { ...input.villkor, fordelning: [] } }), key);
  for (const extra of [{ schoolYear: 2027 }, { lesson: 'pass-4' }, { depth: 2 }, { grundFingerprint: 'd'.repeat(28) }, { placements: [at('pass-2', 610)] },
    { locks: { grundFingerprint: grund, placements: [at('pass-2', 600)] } }, { villkor: { ...input.villkor, breakMin: 15 } }]) assert.notEqual(schemaVillkorsforslagInputFingerprint({ ...input, ...extra }), key);
});

test('en egen spärr eller marginal kan tas bort; alla övriga villkor och deras timplanval bevaras', () => {
  const villkor = { ...defaultSchemaVillkor(), fordelning: [{ ref: 'undervisning:syntetisk', antal: 3 }], egna: [rule, { slag: 'amne', ref: 'Matematik', typ: 'antal', count: 2 }] };
  const change = schemaVillkorsandring(villkor, 0, 'Provlärare'), before = structuredClone(villkor);
  assert.equal(change.after, null); assert.equal(change.resource.name, 'Provlärare');
  const after = tillampaSchemaVillkorsandring(villkor, change);
  assert.deepEqual(after.egna, [villkor.egna[1]]); assert.deepEqual(after.fordelning, villkor.fordelning); assert.deepEqual(villkor, before);
  for (const typ of ['antal', 'langd', 'dag', 'sal']) assert.equal(schemaVillkorsandring({ ...villkor, egna: [{ ...rule, typ }] }, 0, 'Provlärare'), null);
});

test('tillåten tid utökas i en enda rad; en annan unionsrad lämnas kvar', () => {
  const one = { ...rule, typ: 'tillaten' }, two = { ...one, days: [1], startMin: 600, endMin: 700 }, villkor = { ...defaultSchemaVillkor(), egna: [one, two] };
  const change = schemaVillkorsandring(villkor, 0, 'Provlärare');
  assert.deepEqual(change.after, { ...one, days: [0, 1, 2, 3, 4], startMin: 480, endMin: 990 });
  const after = tillampaSchemaVillkorsandring(villkor, change); assert.deepEqual(after.egna, [change.after, two]);
  assert.equal(schemaVillkorsandring({ ...villkor, egna: [change.after] }, 0, 'Provlärare'), null);
});

test('en gammal eller utökad regeländring får inte tillämpas', () => {
  const input = request(), change = schemaVillkorsandring(input.villkor, 0, 'Provlärare');
  for (const patch of [{ ruleIndex: 1 }, { before: { ...rule, endMin: 610 } }, { after: { ...rule, typ: 'antal', count: 1 } },
    { resource: { ...change.resource, ref: 'annan' } }, { message: 'Annan ändring' }]) assert.throws(() => tillampaSchemaVillkorsandring(input.villkor, { ...change, ...patch }));
  assert.throws(() => tillampaSchemaVillkorsandring({ ...input.villkor, egna: [{ ...rule, startMin: 490 }] }, change));
});

test('ett prövat alternativ behåller före/efter, namngiven regel och full kontroll', () => {
  const result = parse(); assert.equal(result.suggestions.length, 1); assert.equal(result.suggestions[0].change.resource.name, 'Provlärare');
  assert.equal(result.suggestions[0].change.before.typ, 'sparrad'); assert.equal(result.suggestions[0].kontroll.total, 0);
  assert.equal(villkorNyckel(result), villkorNyckel(reply()));
});

test('svar från gammal körning, annan regel, bruten kontroll och ofullständig före/efter nekas', () => {
  const mutations = [r => r.contractVersion = 7, r => r.inputFingerprint = 'd'.repeat(28), r => r.fingerprint = 'x', r => r.lesson = 'pass-2', r => r.depth = 2,
    r => r.suggestions[0].change.before.endMin = 610, r => r.suggestions[0].change.after = { ...rule, endMin: 900 },
    r => r.suggestions[0].change.resource.ref = 'annan', r => r.suggestions[0].id = 'regel-2', r => r.suggestions[0].kontroll.total = 1,
    r => r.suggestions[0].kontroll.fingerprint = originalFingerprint, r => r.suggestions[0].kontroll.metrics.placed = 2,
    r => r.suggestions[0].kontroll.rooms = { 'pass-2': 'sal-1' }, r => r.suggestions[0].placement.changes[0].from = at('pass-1', 500),
    r => r.suggestions[0].placement.placements.pop(), r => r.suggestions.push(structuredClone(r.suggestions[0])), r => r.testedCandidates = 0,
    r => r.testedCandidates = 13, r => r.newGrundCandidates = 12, r => r.explanation = '', r => r.extra = true];
  for (const mutate of mutations) { const r = reply(); mutate(r); assert.throws(() => parse(r), mutate.toString()); }
  assert.throws(() => parse(reply(), request({ depth: 2 })));
});

test('lås och orörda baselinepass måste bevaras även när villkoret ändras', () => {
  const input = request({ locks: { grundFingerprint: grund, placements: [at('pass-2', 600)] } }), r = reply(input);
  assert.equal(parse(r, input).suggestions.length, 1);
  r.suggestions[0].placement.placements = [at('pass-3', 700), at('pass-2', 620), at('pass-1', 480)];
  r.suggestions[0].placement.changes.push({ lesson: 'pass-2', from: at('pass-2', 600), to: at('pass-2', 620) });
  assert.throws(() => parse(r, input));
});

test('tom sökning och tidsgräns kan förklaras utan ett falskt olösbarhetsbevis', () => {
  const r = reply(); r.suggestions = []; r.timedOut = true; r.newGrundCandidates = 1; r.explanation = 'Tidsgränsen nåddes. Ett nytt passmönster kräver omberäkning.';
  const result = parse(r); assert.equal(result.suggestions.length, 0); assert.equal(result.timedOut, true); assert.equal(result.newGrundCandidates, 1);
});
