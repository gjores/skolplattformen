import assert from 'node:assert/strict';
import test from 'node:test';

import { schemaElevkvalitet } from './schema-kvalitet.ts';
import { defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, SchemaContractError } from './schema-contract.ts';
import { buildSchemaUnderlag, defaultSchemaTime, schemaForslag, schemaKontroll } from './schema-underlag.ts';

const place = (p) => new Map(p.map(([lesson, day, startMin]) => [lesson, { lesson, day, startMin, room: null }]));
const pass = (id, groups, duration_min = 60, extra = {}) => ({ id, groups, duration_min, ...extra });
const resources = [
  { slag: 'klass', ref: 'klass-a', kluster: ['a', 'b'] },
  { slag: 'grupp', ref: 'grupp-a', kluster: ['a'] },
  { slag: 'grupp', ref: 'grupp-b', kluster: ['b'] },
];
const groups = [
  { id: 'helklass', clusters: ['a', 'b'] },
  { id: 'a', clusters: ['a'] },
  { id: 'b', clusters: ['b'] },
];
const rules = { break_min: 10, lunch: null, same_day: 'allow' };

test('hålet för en grupp försvinner inte i klassmåttet när andra elever har undervisning då', () => {
  const lessons = [pass('start', ['helklass']), pass('sprak-b', ['b'], 50), pass('slut', ['helklass', 'a'], 35),
    pass('kort-dag', ['a'], 40)];
  const at = place([['start', 0, 480], ['sprak-b', 0, 550], ['slut', 0, 610], ['kort-dag', 1, 480]]);
  const [klass, a, b] = schemaElevkvalitet({ groups, lessons, rules }, ['ht'], resources, at, new Set());
  assert.deepEqual(klass.hal, { dag: 0, min: 60, fran: 540, till: 610, pass: 'slut' });
  assert.deepEqual(a.hal, klass.hal);
  assert.equal(b.hal, null);
  assert.deepEqual(klass.sluttid, { dag: 0, min: 645, pass: 'slut' });
  assert.equal(klass.kortasteDag, 40);
  assert.equal(klass.langstaDag, 165);
  assert.equal(b.kortasteDag, 165);
});

test('överlapp och elevmarginaler minskar möjliga hål och lunch räknas av en gång', () => {
  const lessons = [
    pass('forst', ['a']),
    pass('overlappar', ['a'], 50, { margin: { students: { before_min: 0, after_min: 5 } } }),
    pass('inuti', ['a'], 15),
    pass('mitten', ['a'], 30, { margin: { students: { before_min: 10, after_min: 0 } } }),
    pass('sist', ['a'], 30),
  ];
  const at = place([['forst', 0, 480], ['overlappar', 0, 510], ['inuti', 0, 525], ['mitten', 0, 625], ['sist', 0, 705]]);
  const report = (rules) => schemaElevkvalitet({ groups, lessons, rules }, ['ht'], [resources[1]], at, new Set())[0];
  assert.deepEqual(report(rules).hal, { dag: 0, min: 40, fran: 565, till: 615, pass: 'mitten' });
  const lunch = { window_start_min: 565, window_end_min: 705, length_min: 30, teachers: false };
  assert.deepEqual(report({ ...rules, lunch }).hal, { dag: 0, min: 40, fran: 655, till: 705, pass: 'sist' });
  assert.equal(report({ ...rules, lunch }).langstaDag, 255);
});

test('varje termin följer sina pass och mått kräver placerade pass med elevunderlag', () => {
  const lessons = [
    pass('gemensam', ['a']),
    pass('host', ['a'], 30, { periods: ['ht'] }),
    pass('var', ['a'], 45, { periods: ['vt'] }),
    pass('utan-tid', ['b']),
    pass('veckoval', ['b']),
    pass('okand-grupp', ['syntetisk']),
  ];
  const at = place([['gemensam', 0, 480], ['host', 0, 550], ['var', 0, 600], ['veckoval', 2, 750], ['okand-grupp', 1, 545]]);
  const extra = { slag: 'grupp', ref: 'saknar-medlemmar', kluster: [] };
  const rows = schemaElevkvalitet({ groups: [...groups, { id: 'syntetisk', clusters: ['x'] }], lessons, rules },
    ['ht', 'vt'], [...resources, extra], at, new Set(['veckoval']));
  assert.deepEqual(rows.map(({ slag, ref, term, hal, sluttid }) => [slag, ref, term, hal?.min ?? 0, sluttid.min]), [
    ['klass', 'klass-a', 'ht', 0, 580],
    ['grupp', 'grupp-a', 'ht', 0, 580],
    ['klass', 'klass-a', 'vt', 50, 645],
    ['grupp', 'grupp-a', 'vt', 50, 645],
  ]);
});

test('grundveckan använder terminens fasta passkortning och bortser från enstaka datumkortningar', () => {
  const lessons = [pass('start', ['a']), pass('slut', ['a'])];
  const at = place([['start', 0, 480], ['slut', 0, 560]]);
  const trims = [
    { term: 'ht', lesson: 'start', fixedMin: 10, extraCount: 1, extraMin: 5, occasions: [{ date: '2026-09-07', minutes: 15 }] },
    { term: 'vt', lesson: 'slut', fixedMin: 5, extraCount: 0, extraMin: 0 },
  ];
  const [ht, vt] = schemaElevkvalitet({ groups, lessons, rules }, ['ht', 'vt'], [resources[1]], at, new Set(), trims);
  assert.deepEqual([ht.hal.min, ht.sluttid.min, ht.langstaDag], [20, 620, 140]);
  assert.deepEqual([vt.hal.min, vt.sluttid.min, vt.langstaDag], [10, 615, 135]);
});

test('förslag och kontroll använder verkliga medlemsmönster och transporterar måtten utan elevidentiteter', () => {
  const unitId = '65a10000-0000-4000-8000-000000000001', classId = '65a10000-0000-4000-8000-000000000002';
  const pupilId = '65a10000-0000-4000-8000-000000000003', assumedClass = '65a10000-0000-4000-8000-000000000004';
  const klass = (classId, name) => ({ classId, name, needs: [{ sourceKind: 'class_timplan', sourceKey: `class_timplan:${classId}:2026:ma`,
    rowKey: 'ma', label: 'Matematik', needHt: 3600, needVt: 3600, needBasis: 'terms' }] });
  const plan = { unitId, schoolName: 'Provskolan', schoolYear: 2026, version: null, teachers: [], rows: [],
    classes: [klass(classId, 'Ettan'), klass(assumedClass, 'Tvåan')], specials: [], groups: [], joints: [], sharing: [] };
  const input = { unitId, schoolYear: 2026, period: 'ht', villkor: { ...defaultSchemaVillkor(), lunch: null } };
  const underlag = buildSchemaUnderlag(plan, input, { time: defaultSchemaTime(), members: { pupils: [{ id: pupilId, classIds: [classId] }], memberships: [] } });
  const placements = underlag.problem.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, startMin: 480, room: null }));
  const metrics = { studentGapMin: 0, teacherGapMin: 0 };
  const result = schemaForslag(plan, input, underlag, { placements, unplaced: [], status: 'complete', diagnoses: [], metrics, elapsedMs: 10 });
  const checked = schemaKontroll(underlag, placements, { violations: [], metrics });
  const rows = parseSchemaForslag(result, input).elevkvalitet;
  assert.deepEqual(parseSchemaKontroll(checked, underlag.grundFingerprint).elevkvalitet, rows);
  assert.deepEqual(rows.map(({ ref, slag, term }) => ({ ref, slag, term })), [{ ref: classId, slag: 'klass', term: 'ht' }]);
  assert.ok(!JSON.stringify(rows).includes(pupilId));
  assert.ok(!JSON.stringify(rows).includes('kluster-'));
  const { elevkvalitet: _, ...legacy } = result;
  assert.equal(parseSchemaForslag(legacy, input).elevkvalitet, undefined);
  assert.throws(() => parseSchemaForslag({ ...result, elevkvalitet: [...rows, ...rows] }, input), SchemaContractError);
});
