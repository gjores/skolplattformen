// 05.2-SM-UXF-51: egna samtidighetsblock genom underlaget till motorns kopplingar och förslagets svar. Syntetiska uppgifter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, defaultSchemaTime, schemaForslag } from './schema-underlag.ts';
import { checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaVillkor, sammaGrund } from './schema-contract.ts';
import { schemaDiagnos } from './schema-diagnos.ts';
import { schemaForbered } from './schema-forbered.ts';

const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, h = n => n * 60;
const classKey = (c, row) => `class_timplan:${uid(c)}:2026:${row}`;
const need = (c, row, label) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: h(54), needVt: h(54), needBasis: 'terms' });
const row = (id, c, key, personId) => ({ id: uid(id), lineageId: uid(id + 500), sourceKind: 'class_timplan', sourceKey: classKey(c, key), classId: uid(c), rowKey: key,
  personId, teacherHt: h(54), teacherVt: h(54), needHt: h(54), needVt: h(54), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' });
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 3,
  version: { id: uid(2), versionNo: 4, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: [20, 21, 22].map(n => ({ personId: uid(n), displayName: `Lärare ${n}`, draft: false, shareHere: 100 })),
  classes: [{ classId: uid(10), name: '1A', link: null, aplMinutes: null, needs: [need(10, 'ma', 'Matematik'), need(10, 'ke', 'Kemi')] },
    { classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ke', 'Kemi')] }],
  rows: [row(30, 10, 'ma', uid(20)), row(31, 10, 'ke', uid(21)), row(32, 11, 'ke', uid(22))],
  groups: [], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
// 22 elever i 1A; 1B saknar elever, så dess elevantal är okänt.
const basis = { members: { pupils: Array.from({ length: 22 }, (_, i) => ({ id: uid(1000 + i), classIds: [uid(10)] })), memberships: [] }, time: defaultSchemaTime() };
const build = villkor => buildSchemaUnderlag(plan, { period: 'ht', villkor }, basis);
const ref = (u, title, klass) => u.fordelning.find(r => r.title === title && r.classes.join() === klass).ref;
const bas = build(defaultSchemaVillkor());
const block = (id, namn, ...medlemmar) => ({ id, namn, medlemmar: medlemmar.map(([title, klass, pass]) => ({ ref: ref(bas, title, klass), term: 'ht', pass })) });

test('ett block utan hinder blir en koppling i motorns problem och ändrar grunden', () => {
  const v = { ...defaultSchemaVillkor(), block: [block('block-1', 'Kemi samtidigt', ['Kemi', '1A', 1], ['Kemi', '1B', 1])] };
  assert.deepEqual(checkSchemaVillkor(v), []); assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(v))), v);
  const u = build(v), kemiA = u.labels.lessons.filter(l => l.title === 'Kemi' && l.classIds.includes(u.labels.classes.find(c => c.name === '1A').id))[0];
  const kemiB = u.labels.lessons.filter(l => l.title === 'Kemi' && l.classIds.includes(u.labels.classes.find(c => c.name === '1B').id))[0];
  assert.deepEqual(u.problem.links, [{ kind: 'simultaneous', lessons: [kemiA.id, kemiB.id] }]);
  assert.equal(u.block[0].status, 'aktivt');
  assert.notEqual(u.grundFingerprint, bas.grundFingerprint); assert.equal(sammaGrund(defaultSchemaVillkor(), v), false);
  // Passen behåller sina lärare och grupper.
  assert.deepEqual(u.problem.lessons.find(l => l.id === kemiA.id).teachers, bas.problem.lessons.find(l => l.id === kemiA.id).teachers);
});
test('samma klass i två pass är hinder: ingen koppling, ett fynd i fördiagnosen och en uppgift i Förbered', () => {
  const v = { ...defaultSchemaVillkor(), block: [block('block-1', 'Samma klass', ['Matematik', '1A', 1], ['Kemi', '1A', 1])] }, u = build(v);
  assert.equal(u.problem.links, undefined); assert.equal(u.block[0].status, 'hinder');
  assert.match(u.block[0].text, /^Samma elever går i Matematik \(1A\) och Kemi \(1A\)/u);
  const fynd = schemaDiagnos(u, []).filter(f => f.code === 'block_hinder');
  assert.equal(fynd.length, 1); assert.match(fynd[0].message, /^Samtidighetsblocket Samma klass: /u);
  assert.equal(fynd[0].action.label, 'Se över samtidighetsblocket under Lektioner och block');
  assert.equal(u.grundFingerprint, bas.grundFingerprint, 'ett block som inte används ändrar inte passen eller kopplingarna');
});
test('förslaget bär passens undervisning och blockens status, och tolkas tillbaka', () => {
  const v = { ...defaultSchemaVillkor(), block: [block('block-1', 'Kemi samtidigt', ['Kemi', '1A', 1], ['Kemi', '1B', 1]), block('block-2', 'Saknas', ['Kemi', '1A', 9], ['Kemi', '1B', 2])] };
  const u = build(v), request = { unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: v };
  const f = schemaForslag(plan, request, u, { status: 'complete', placements: [], unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 1 });
  const tolkad = parseSchemaForslag(JSON.parse(JSON.stringify(f)), request);
  assert.deepEqual(tolkad.block.map(b => [b.id, b.status]), [['block-1', 'aktivt'], ['block-2', 'inaktuellt']]);
  assert.ok(tolkad.lessons.every(l => l.undervisning && tolkad.fordelning.some(r => r.ref === l.undervisning)));
  const lektioner = schemaForbered({ kalla: tolkad, villkor: v, las: 0 }).find(p => p.id === 'lektioner');
  assert.equal(lektioner.nasta, '1 samtidighetsblock behöver ses över'); assert.match(lektioner.varden.join(' · '), /2 egna samtidighetsblock/u);
  assert.throws(() => parseSchemaForslag({ ...JSON.parse(JSON.stringify(f)), block: [{ ...f.block[0], id: 'block-9' }] }, request), undefined, 'status för ett block som inte finns i villkoren nekas');
});
