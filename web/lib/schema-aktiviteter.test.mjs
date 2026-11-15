import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aktiviteternasFel, aktivitetTypAndra, aktivitetsTyper, aktivitetsPassId, aktivitetsSnapshot, aktivitetsVeckorText, parseAktiviteter, readAktivitetsTyper, writeAktivitetsTyper } from './schema-aktiviteter.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaPlacements, defaultSchemaVillkor, parseSchemaForslag, parseSchemaVillkor, sammaGrund } from './schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';
import { parseSchemaAktiviteterRequest, schemaAktivitetsAndring, schemaAktivitetsPlaceringar } from './schema-aktiviteter-underlag.ts';
import { aktivitetsSteg, schemaUtkast, tomtUtkast } from './schema-utkast.ts';
import { vtAktiviteter } from './schema-villkorstabell.ts';

const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const v = () => ({ ...defaultSchemaVillkor(), salar: ['Aulan'] });
const a = (extra = {}) => ({ id: 'aktivitet-1', typId: 'typ-mentorstid', typ: 'Mentorstid', name: 'Mentorstid klass 1', classRefs: [uid(10)], groupRefs: [], teacherRefs: [uid(20)], rooms: ['Aulan'],
  durationMin: 20, veckor: { typ: 'alla' }, visibleFor: 'alla', margin: null, tid: { typ: 'fast', day: 0, startMin: 480 }, ...extra });
const plan = () => ({ contractVersion: 1, unitId: uid(1), schoolYear: 2026, schoolName: 'Provskolan', revision: 1, version: null, versions: [],
  teachers: [{ personId: uid(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
  classes: [{ classId: uid(10), name: 'Klass 1', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey: 'source-1', rowKey: 'ma', label: 'Matematik', needHt: 1200, needVt: 1200, needBasis: 'terms' }] }],
  groups: [], rows: [{ id: uid(40), lineageId: uid(41), sourceKind: 'class_timplan', sourceKey: 'source-1', classId: uid(10), rowKey: 'ma', personId: uid(20), teacherHt: 1200, teacherVt: 1200, needHt: 1200, needVt: 1200, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }],
  specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: false } });
const req = extra => ({ unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: v(), ...extra });
const proposal = (u, request = req()) => schemaForslag(plan(), request, u, { status: 'complete', placements: u.problem.lessons.map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: l.rooms?.allowed[0] ?? null })), unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 });

test('skolans typnamn, grupp och förval kan ändras utan att redan inlagd aktivitet byter typ', () => {
  const types = aktivitetsTyper(), own = a(), renamed = aktivitetTypAndra(types, { ...types[0], name: 'Planeringsmöte', group: 'Planering' });
  assert.equal(renamed[0].name, 'Planeringsmöte'); assert.equal(renamed[0].group, 'Planering'); assert.equal(own.typ, 'Mentorstid');
  assert.equal(aktivitetTypAndra(types, { ...types[0], id: 'egen', name: 'Egen typ' }).length, types.length + 1);
  assert.throws(() => aktivitetTypAndra(types, { ...types[0], name: '  ' }));
});
test('typer cachelagras per skola utan aktivitetslista', () => {
  const memory = new Map(), storage = { getItem: k => memory.get(k), setItem: (k, x) => memory.set(k, x) }, types = aktivitetsTyper();
  writeAktivitetsTyper(storage, uid(1), types.slice(0, 1));
  assert.equal(readAktivitetsTyper(storage, uid(1)).length, 1); assert.equal(readAktivitetsTyper(storage, uid(2)).length, types.length);
  assert.ok(!JSON.stringify([...memory]).includes(uid(20))); assert.deepEqual(readAktivitetsTyper({ getItem() { throw Error(); } }, uid(1)), types);
});
test('aktiviteter tolkas strikt, inklusive veckoidentitet, deltagare och tidsfönster', () => {
  assert.deepEqual(parseAktiviteter([a()]), [a()]); assert.deepEqual(aktiviteternasFel([a()]), []);
  for (const bad of [a({ id: 'aktivitet-100000' }), a({ teacherRefs: [] , classRefs: [], rooms: [] }), a({ durationMin: 7 }), a({ rooms: ['A', 'B'] }), a({ veckor: { typ: 'valda', veckor: [54] } }), a({ tid: { typ: 'motor', days: [], startMin: 840, endMin: 900 } }), a({ tid: { typ: 'fast', day: 5, startMin: 480 } })]) assert.throws(() => parseAktiviteter([bad]));
  assert.throws(() => parseAktiviteter([a(), a()])); assert.throws(() => parseAktiviteter([a({ pupilId: uid(30) })]));
  assert.equal(aktivitetsVeckorText({ typ: 'jamna' }), 'Jämna veckor (B)');
});
test('aktiviteter i villkoren ändrar grunden och gammal grund nekas', () => {
  assert.deepEqual(parseSchemaVillkor({ ...v(), aktiviteter: [a()] }).aktiviteter, [a()]);
  assert.equal(sammaGrund(v(), { ...v(), aktiviteter: [a()] }), false);
  assert.equal(sammaGrund(v(), { ...v(), aktiviteter: [] }), true);
});
test('fast aktivitet är låst motorpass med samma deltagare och sal, utan timplanetid', () => {
  const own = a(), before = buildSchemaUnderlag(plan(), req()), after = buildSchemaUnderlag(plan(), req({ villkor: { ...v(), aktiviteter: [own] } }));
  const l = after.problem.lessons.find(l => l.id === aktivitetsPassId(own.id));
  assert.deepEqual(l.locked, { day: 0, start_min: 480 }); assert.deepEqual(l.teachers, ['larare-1']); assert.deepEqual(l.groups, ['grupp-1']); assert.deepEqual(l.rooms, { count: 1, allowed: ['sal-1'] });
  assert.deepEqual(after.labels.activities, before.labels.activities); assert.deepEqual(after.problem.lessons.filter(x => x !== l), before.problem.lessons);
  assert.deepEqual(after.problem.activities.find(x => x.id === l.activity), { id: l.activity });
  assert.throws(() => checkSchemaPlacements([{ lesson: l.id, day: 1, startMin: 480, room: 'sal-1' }], after.problem));
});
test('motorn får tillåtet fönster och typens marginal för motorplacerad aktivitet', () => {
  const own = a({ tid: { typ: 'motor', days: [1, 2, 3], startMin: 840, endMin: 990 }, durationMin: 60,
    margin: { typ: 'marginal', beforeMin: 5, afterMin: 10, occupies: ['larare'], label: 'Övergång', visibleFor: ['larare'], when: 'alltid' } });
  const u = buildSchemaUnderlag(plan(), req({ villkor: { ...v(), aktiviteter: [own] } })), l = u.problem.lessons.at(-1);
  assert.equal(l.locked, undefined); assert.deepEqual(l.allowed.map(w => w.day), [1, 2, 3]); assert.ok(l.allowed.every(w => w.start_min === 840 && w.end_min === 990));
  assert.deepEqual(l.margin.teachers, { before_min: 5, after_min: 10 }); assert.deepEqual(l.margin.students, { before_min: 0, after_min: 0 });
});
test('okänd skolas deltagare eller sal nekas, inga app-ID når motorns problem', () => {
  for (const own of [a({ classRefs: [uid(999)] }), a({ teacherRefs: [uid(999)] }), a({ groupRefs: [uid(999)] }), a({ rooms: ['Okänd sal'] })]) assert.throws(() => buildSchemaUnderlag(plan(), req({ villkor: { ...v(), aktiviteter: [own] } })));
  const u = buildSchemaUnderlag(plan(), req({ villkor: { ...v(), aktiviteter: [a()] } }));
  assert.ok(!JSON.stringify(u.problem).includes('52a10000')); assert.ok(!JSON.stringify(u.problem).includes('Mentorstid'));
});
test('borttagen aktivitet lämnar andra aktivitetspass och alla undervisnings-ID oförändrade', () => {
  const own = [a(), a({ id: 'aktivitet-2', tid: { typ: 'fast', day: 2, startMin: 480 } })], r = req({ villkor: { ...v(), aktiviteter: own } }), u = buildSchemaUnderlag(plan(), r);
  const p = proposal(u, r), placements = p.lessons.filter(l => !l.egenAktivitet).map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }));
  placements.push(...own.map(x => ({ lesson: aktivitetsPassId(x.id), day: x.tid.day, startMin: x.tid.startMin, room: 'sal-1' })));
  const input = { ...r, contractVersion: SCHEMA_CONTRACT_VERSION, previousVillkor: r.villkor, villkor: { ...v(), aktiviteter: [own[1]] }, grundFingerprint: u.grundFingerprint, placements };
  assert.deepEqual(parseSchemaAktiviteterRequest(input), input);
  const c = schemaAktivitetsAndring(plan(), input); assert.ok(c); assert.equal(c.added.length, 0);
  assert.ok(c.efter.problem.lessons.some(l => l.id === 'pass-900002')); assert.ok(!c.efter.problem.lessons.some(l => l.id === 'pass-900001'));
  assert.deepEqual(schemaAktivitetsPlaceringar(c, null), placements.filter(p => p.lesson !== 'pass-900001'));
  assert.equal(schemaAktivitetsAndring(plan(), { ...input, grundFingerprint: 'f'.repeat(28) }), null);
  assert.throws(() => schemaAktivitetsAndring(plan(), { ...input, villkor: { ...input.villkor, breakMin: 0 } }));
});
test('aktivitetsändring bevarar också flyttade pass och kan ångras och göras om som ett steg', () => {
  const r = req(), u = buildSchemaUnderlag(plan(), r), f = proposal(u), at = Object.fromEntries(f.lessons.map(l => [l.id, { day: 3, startMin: 720, room: l.roomId }]));
  const fore = aktivitetsSnapshot(f, at, r.villkor), nextR = req({ villkor: { ...v(), aktiviteter: [a()] } }), nextU = buildSchemaUnderlag(plan(), nextR), next = proposal(nextU, nextR);
  const efter = { forslag: next, villkor: nextR.villkor }, reset = schemaUtkast(tomtUtkast(), { type: 'reset', forslag: f });
  const state = schemaUtkast(reset, { type: 'aktiviteter', fore, efter, text: 'Tillagd' });
  assert.equal(state.undo.length, 1); assert.ok(aktivitetsSteg(state.undo[0]));
  const undone = schemaUtkast(state, { type: 'undo' }); assert.equal(undone.placements[f.lessons[0].id].day, 3); assert.equal(undone.placements[f.lessons[0].id].startMin, 720);
  assert.deepEqual(schemaUtkast(undone, { type: 'redo' }).placements, state.placements);
});
test('förslagets aktivitetsmetadata kontrolleras mot skickat namn och identitet', () => {
  const r = req({ villkor: { ...v(), aktiviteter: [a()] } }), u = buildSchemaUnderlag(plan(), r), f = proposal(u, r);
  assert.equal(parseSchemaForslag(structuredClone(f), r).lessons.at(-1).egenAktivitet.typ, 'Mentorstid');
  f.lessons.at(-1).egenAktivitet.typ = 'Annan typ'; assert.throws(() => parseSchemaForslag(f, r));
});
test('villkorstabellens aktivitetskolumn visar rätt resurs och räknar aldrig aktiviteten som ämne', () => {
  const v = { ...defaultSchemaVillkor(), aktiviteter: [a({ groupRefs: [uid(30)] })] };
  for (const [slag, ref] of [['klass', uid(10)], ['grupp', uid(30)], ['larare', uid(20)], ['sal', 'Aulan']]) assert.equal(vtAktiviteter(slag, ref, v), 'Mentorstid klass 1 (Mentorstid)');
  assert.equal(vtAktiviteter('klass', uid(11), v), ''); assert.equal(vtAktiviteter('amne', 'Mentorstid klass 1', v), '');
});
test('skolans behörigt lästa övriga personal kan delta med samma person-ID utan att undervisningspassen numreras om', () => {
  const p = plan(), own = a({ teacherRefs: [uid(21)] }), basis = { members: null, time: buildSchemaUnderlag(p, req()).time, personer: [{ ref: uid(21), name: 'Provpersonal' }] };
  const u = buildSchemaUnderlag(p, req({ villkor: { ...v(), aktiviteter: [own] } }), basis);
  assert.deepEqual(u.problem.lessons.at(-1).teachers, ['larare-2']); assert.deepEqual(u.resurser.larare.at(-1), { ref: uid(21), name: 'Provpersonal' });
  assert.deepEqual(u.problem.lessons[0].teachers, ['larare-1']); assert.equal(u.labels.teachers.at(-1).name, 'Provpersonal');
});
