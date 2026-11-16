import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_MOTOR_VERSION, SchemaVersionError, defaultSchemaVillkor } from './schema-contract.ts';
import { checkSchemaPlaceringRequest, parseSchemaMotorPlacering, parseSchemaPlacering, parseSchemaPlaceringRequest, sammaSchemaPlaceringar } from './schema-placering.ts';

const problem = () => ({ version: SCHEMA_MOTOR_VERSION, id: 'prov', time: { step_min: 5, start_grid_min: 10, days: [{ start_min: 480, end_min: 900 }] },
  teachers: [{ id: 'larare-1' }], groups: [{ id: 'grupp-1', clusters: ['kluster-1'] }], clusters: [{ id: 'kluster-1', size: 25 }], rooms: [{ id: 'sal-1' }, { id: 'sal-2' }], activities: [],
  lessons: [1, 2, 3].map(n => ({ id: `pass-${n}`, duration_min: 60, teachers: ['larare-1'], groups: ['grupp-1'] })),
  rules: { break_min: 0, lunch: null, same_day: 'allow' }, weights: { late_after_min: null } });
const at = (lesson, startMin, room = null) => ({ lesson: `pass-${lesson}`, day: 0, startMin, room });
const request = (extra = {}) => ({ contractVersion: SCHEMA_CONTRACT_VERSION, unitId: '73111500-0000-4000-8000-000000000001', schoolYear: 2026, period: 'ht', villkor: defaultSchemaVillkor(),
  grundFingerprint: 'a'.repeat(28), placements: [at(2, 480), at(3, 540)], mode: 'lesson', lesson: 'pass-1', target: null, depth: 1, ...extra });
const motorAt = p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] });
function raw(input = request(), placements = [at(2, 480), at(3, 540), at(1, 600)]) {
  const before = new Map(input.placements.map(p => [p.lesson, p]));
  const changes = placements.filter(p => JSON.stringify(p) !== JSON.stringify(before.get(p.lesson))).map(p => ({ lesson: p.lesson, from: before.has(p.lesson) ? motorAt(before.get(p.lesson)) : null, to: motorAt(p) }));
  return { version: SCHEMA_MOTOR_VERSION, problem_id: 'prov', depth: input.depth, timed_out: false, elapsed_ms: 12,
    suggestions: [{ placements: placements.map(motorAt), changes, cost: 10, metrics_before: { student_gap_min: 20, teacher_gap_min: 10, cost: 0 }, metrics_after: { student_gap_min: 0, teacher_gap_min: 0, cost: 10 } }] };
}
const parse = (value = raw(), input = request(), p = problem()) => parseSchemaMotorPlacering(value, p, input);
const reply = (result, input = request()) => ({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, ...result });
const lessonIds = ['pass-1', 'pass-2', 'pass-3'];

test('placeringsförslagets svarsversion följer faktiskt problem4 eller5', () => {
  for (const version of [4, 5]) {
    const p = { ...problem(), version }, result = { ...raw(), version };
    assert.equal(parse(result, request(), p).suggestions.length, 1);
    assert.throws(() => parse({ ...result, version: version === 4 ? 5 : 4 }, request(), p));
  }
});

test('begäran bevarar nuvarande villkor, lås och hela utkastet; strikta lägeskombinationer', () => {
  const input = request({ locks: { grundFingerprint: 'a'.repeat(28), placements: [at(3, 540)] } });
  assert.deepEqual(parseSchemaPlaceringRequest(input), input);
  for (const bad of [{ depth: 0 }, { depth: 4 }, { depth: 1.1 }, { mode: 'annat' }, { lesson: null }, { mode: 'rest' }, { mode: 'rest', lesson: null, target: { day: 0, startMin: 600, room: null } },
    { mode: 'target' }, { target: { day: 0, startMin: 600, room: null } }, { target: undefined }, { unknown: true }, { placements: [at(2, 480), at(2, 540)] }, { lesson: 'främmande' }]) {
    assert.throws(() => parseSchemaPlaceringRequest({ ...request(), ...bad }), JSON.stringify(bad));
  }
  assert.equal(parseSchemaPlaceringRequest(request({ mode: 'rest', lesson: null })).mode, 'rest');
  assert.equal(parseSchemaPlaceringRequest(request({ mode: 'target', target: { day: 0, startMin: 600, room: null } })).target.startMin, 600);
  assert.throws(() => parseSchemaPlaceringRequest(request({ contractVersion: SCHEMA_CONTRACT_VERSION - 1 })), SchemaVersionError);
});

test('direkt förslag har exakt nytt pass från viloyta till tid och kan tolkas av klienten', () => {
  const result = parse(); assert.equal(result.suggestions.length, 1);
  assert.deepEqual(result.suggestions[0].changes, [{ lesson: 'pass-1', from: null, to: at(1, 600) }]);
  assert.deepEqual(result.suggestions[0].metricsBefore, { studentGapMin: 20, teacherGapMin: 10, cost: 0 });
  assert.deepEqual(parseSchemaPlacering(reply(result), request(), lessonIds).suggestions, result.suggestions);
  assert.ok(sammaSchemaPlaceringar([at(2, 480), at(3, 540)], [at(3, 540), at(2, 480)]));
});

test('ett följdflyttat pass tillåts på djup1, två kräver djup2', () => {
  const moved = [at(1, 480), at(2, 600), at(3, 540)];
  assert.equal(parse(raw(request(), moved)).suggestions[0].changes.length, 2);
  const chain = [at(1, 480), at(2, 540), at(3, 600)];
  assert.throws(() => parse(raw(request(), chain)));
  const deeper = request({ depth: 2 }); assert.equal(parse(raw(deeper, chain), deeper).suggestions[0].changes.length, 3);
});

test('ändringslistan får varken dölja, uppfinna eller dubblera en ändring', () => {
  for (const edit of [s => { s.changes = []; }, s => { s.changes[0].from = motorAt(at(1, 480)); }, s => { s.changes[0].to.start_min = 610; },
    s => { s.changes[0].lesson = 'pass-2'; }, s => { s.changes.push(structuredClone(s.changes[0])); }, s => { s.changes.push({ lesson: 'pass-2', from: motorAt(at(2, 480)), to: motorAt(at(2, 480)) }); }]) {
    const value = raw(); edit(value.suggestions[0]); assert.throws(() => parse(value));
  }
});

test('hela kandidaten bevarar tidigare lagda pass och nekar främmande, dubbla eller ofullständiga placeringar', () => {
  for (const placements of [[at(1, 600), at(2, 480)], [at(1, 600), at(2, 480), at(3, 540), at(9, 700)], [at(1, 600), at(2, 480), at(3, 540), at(3, 700)]]) assert.throws(() => parse(raw(request(), placements)));
  const input = request({ mode: 'rest', lesson: null });
  assert.equal(parse(raw(input), input).suggestions[0].placements.length, 3);
  const partial = request({ ...input, placements: [at(2, 480)] });
  assert.throws(() => parse(raw(partial, [at(2, 480), at(1, 600)]), partial));
});

test('enpassläget lägger aldrig orelaterade parkerade pass som en dold sidoeffekt', () => {
  const input = request({ placements: [at(2, 480)] }), value = raw(input, [at(1, 600), at(2, 480), at(3, 540)]);
  assert.throws(() => parse(value, input));
  const normalized = { depth: 1, timedOut: false, elapsedMs: 1, suggestions: [{ placements: [at(1, 600), at(2, 480), at(3, 540)],
    changes: [{ lesson: 'pass-1', from: null, to: at(1, 600) }, { lesson: 'pass-3', from: null, to: at(3, 540) }], metricsBefore: { studentGapMin: 0, teacherGapMin: 0, cost: 0 }, metricsAfter: { studentGapMin: 0, teacherGapMin: 0, cost: 0 }, cost: 0 }] };
  assert.throws(() => parseSchemaPlacering(reply(normalized, input), input, lessonIds));
});

test('motorkontraktet bevarar uttrycklig samplaceringsrot men ger inte andra kopplingar rätt att lägga fler pass', () => {
  const input = request({ placements: [at(2, 480)] }), p = problem();
  p.lessons[2].groups = []; p.lessons[2].teachers = [];
  p.links = [{ kind: 'simultaneous', lessons: ['pass-1', 'pass-3'] }];
  const value = raw(input, [at(1, 600), at(2, 480), at(3, 600)]);
  const result = parse(value, input, p);
  assert.equal(result.suggestions[0].changes.length, 2);
  assert.equal(parseSchemaPlacering(reply(result, input), input, lessonIds, p.links).suggestions[0].changes.length, 2);
  assert.throws(() => parseSchemaPlacering(reply(result, input), input, lessonIds));
  p.links[0].kind = 'no_overlap'; assert.throws(() => parse(value, input, p));
});

test('målpunktens dag, minut och uttryckliga sal måste vara precis de begärda', () => {
  const input = request({ mode: 'target', target: { day: 0, startMin: 600, room: null } });
  assert.equal(parse(raw(input), input).suggestions[0].changes[0].to.startMin, 600);
  assert.throws(() => parse(raw(input, [at(2, 480), at(3, 540), at(1, 610)]), input));
  const p = problem(); p.lessons[0].rooms = { count: 1, allowed: ['sal-1', 'sal-2'] };
  const sal = { ...input, target: { ...input.target, room: 'sal-1' } };
  assert.throws(() => parse(raw(sal, [at(2, 480), at(3, 540), at(1, 600, 'sal-2')]), sal, p));
  assert.equal(parse(raw(sal, [at(2, 480), at(3, 540), at(1, 600, 'sal-1')]), sal, p).suggestions.length, 1);
});

test('gammal motor, grund, appversion, djup, översize och fel mått nekas', () => {
  for (const edit of [v => { v.version--; }, v => { v.problem_id = 'annan'; }, v => { v.depth = 2; }, v => { delete v.timed_out; }, v => { v.elapsed_ms = -1; },
    v => { v.suggestions = Array(6).fill(v.suggestions[0]); }, v => { v.suggestions.push(structuredClone(v.suggestions[0])); },
    v => { v.suggestions[0].metrics_after.cost = 9; }, v => { v.suggestions[0].metrics_before.student_gap_min = -1; }, v => { v.suggestions[0].cost = Number.MAX_SAFE_INTEGER + 1; }]) {
    const value = raw(); edit(value); assert.throws(() => parse(value));
  }
  const value = reply(parse());
  assert.throws(() => parseSchemaPlacering({ ...value, contractVersion: SCHEMA_CONTRACT_VERSION - 1 }, request(), lessonIds));
  assert.throws(() => parseSchemaPlacering({ ...value, grundFingerprint: 'b'.repeat(28) }, request(), lessonIds));
});

test('ny sökning eller annat fönsters ändring kan inte återanvända gamla föreplaceringar', () => {
  const value = reply(parse(raw(request(), [at(1, 480), at(2, 600), at(3, 540)])));
  assert.throws(() => parseSchemaPlacering(value, request({ placements: [at(2, 490), at(3, 540)] }), lessonIds));
  assert.throws(() => parseSchemaPlacering(value, request({ depth: 2 }), lessonIds));
  assert.throws(() => parseSchemaPlacering(value, request(), ['pass-1', 'pass-2']));
});

test('användarlås och fast aktivitet måste behålla exakt tid och sal i motorns svar', () => {
  const p = problem(); p.lessons[1].locked = { day: 0, start_min: 480 };
  assert.throws(() => parse(raw(request(), [at(1, 480), at(2, 600), at(3, 540)]), request(), p));
  const input = request({ locks: { grundFingerprint: 'a'.repeat(28), placements: [at(2, 480)] } });
  const value = reply(parse(raw(request(), [at(1, 480), at(2, 600), at(3, 540)])), input);
  assert.throws(() => parseSchemaPlacering(value, input, lessonIds));
  assert.throws(() => checkSchemaPlaceringRequest(request({ lesson: 'pass-2' }), p), e => e.reason === 'schema_placement_locked_lesson');
});

test('parkerad fast aktivitet får finnas i restens utgångspunkt och läggs bara på sin låsta tid', () => {
  const p = problem(); p.lessons[0].locked = { day: 0, start_min: 600 };
  const input = request({ mode: 'rest', lesson: null });
  assert.deepEqual(checkSchemaPlaceringRequest(input, p), input.placements);
  assert.equal(parse(raw(input), input, p).suggestions.length, 1);
  assert.throws(() => parse(raw(input, [at(2, 480), at(3, 540), at(1, 610)]), input, p));
});

test('salomskrivning, tom viloyta och mål utanför dag, rutnät eller marginal får egna stopp', () => {
  const p = problem(); p.lessons[1].rooms = { count: 1, allowed: ['sal-1'] };
  assert.throws(() => checkSchemaPlaceringRequest(request(), p), e => e.reason === 'schema_placement_rooms_changed');
  assert.throws(() => checkSchemaPlaceringRequest(request({ mode: 'rest', lesson: null, placements: [at(1, 600), at(2, 480), at(3, 540)] }), problem()), e => e.reason === 'schema_placement_rest_empty');
  for (const target of [{ day: 1, startMin: 600, room: null }, { day: 0, startMin: 605, room: null }, { day: 0, startMin: 870, room: null }, { day: 0, startMin: 600, room: 'sal-1' }]) {
    assert.throws(() => checkSchemaPlaceringRequest(request({ mode: 'target', target }), problem()), e => e.reason === 'schema_placement_bad_target');
  }
  const margin = problem(); margin.lessons[0].margin = { students: { before_min: 10, after_min: 0 } };
  assert.throws(() => checkSchemaPlaceringRequest(request({ mode: 'target', target: { day: 0, startMin: 480, room: null } }), margin), e => e.reason === 'schema_placement_bad_target');
});

test('tidsgräns och tomt förslag är giltiga svar och lovar ingen olösbarhet', () => {
  const value = { ...raw(), timed_out: true, suggestions: [] };
  assert.deepEqual(parse(value), { depth: 1, timedOut: true, elapsedMs: 12, suggestions: [] });
});
