import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchemaLagen, parseSchemaLagenRequest, parseSchemaPositions, schemaElevKluster, schemaLagen, schemaPassKluster, varfor } from './schema-lagen.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';
import { defaultSchemaVillkor } from './schema-contract.ts';

/** Syntetisk tjänstefördelning: två klasser, ett valbart block med Spanska och Tyska, sex elever. Inga verkliga personer eller skolor. */
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const classKey = (c, r) => `class_timplan:${uid(c)}:2026:${r}`;
const need = (c, r, label) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, r), rowKey: r, label, needHt: h(54), needVt: h(54), needBasis: 'terms' });
const row = (id, sourceKey, personId, extra = {}) => ({ id: uid(id), lineageId: uid(id + 500), sourceKind: 'class_timplan', sourceKey, classId: uid(10), rowKey: 'x',
  personId, teacherHt: h(54), teacherVt: h(54), needHt: h(54), needVt: h(54), needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const gRow = (id, n, personId) => row(id, `teaching_group:${uid(n)}`, personId, { sourceKind: 'teaching_group', classId: null, groupId: uid(n), classIds: [], sourceRefs: [], groupRevision: 1 });
const group = (id, name) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(id)}`, rowKey: `group:${uid(id)}`, label: name, needHt: h(36), needVt: h(36),
  needBasis: 'terms', groupId: uid(id), name, language: null, groupRevision: 1, classIds: [uid(10), uid(11)], sourceRefs: [], stale: false, blockId: uid(60), optionId: uid(id + 50), subjectCode: 'X', levelCode: '1' });
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
  version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: [20, 21, 22].map(n => ({ personId: uid(n), displayName: `Provlärare ${n - 16}`, draft: false, shareHere: 100 })),
  classes: [{ classId: uid(10), name: 'Klass 1', link: null, aplMinutes: null, needs: [need(10, 'ma', 'Matematik'), need(10, 'idh', 'Idrott och hälsa')] },
    { classId: uid(11), name: 'Klass 2', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik')] }],
  rows: [row(30, classKey(10, 'ma'), uid(20)), row(31, classKey(10, 'idh'), uid(21)), row(32, classKey(11, 'ma'), uid(20)), gRow(35, 40, uid(21)), gRow(36, 41, uid(22))],
  groups: [group(40, 'Spanska'), group(41, 'Tyska')], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
const pupils = [1, 2, 3, 4, 5, 6].map(n => ({ id: uid(900 + n), classIds: [uid(n <= 3 ? 10 : 11)] }));
const m = (g, p) => ({ groupId: uid(g), pupilId: uid(900 + p), startsOn: '2026-08-17', endsOn: null });
const basis = { members: { pupils, memberships: [m(40, 1), m(40, 2), m(40, 4), m(41, 5)] }, time: defaultSchemaTime() };
const request = { unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: { ...defaultSchemaVillkor(), salar: ['Sal 204'], egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['Sal 204'] }] } };
const underlag = buildSchemaUnderlag(plan, request, basis), p = underlag.problem;
const lessonOf = title => underlag.labels.lessons.find(l => l.title === title && l.classIds.includes('grupp-1')).id;
const ma = lessonOf('Matematik'), idh = lessonOf('Idrott och hälsa');

const reply = positions => ({ version: 2, problem_id: p.id, lesson: ma, positions });
const pos = (day, start_min, state, reasons = [], extra = {}) => ({ day, start_min, rooms: ['sal-1'], state, cost_delta: 0, reasons, ...extra });
const reason = (code, resource_kind, resource, lessons = []) => ({ code, resource_kind, resource, lessons });

test('begäran: kontrollens fält, passet och en elev eller ingen', () => {
  const base = { ...request, fingerprint: underlag.fingerprint, placements: [{ lesson: ma, day: 0, startMin: 480, room: null }] };
  assert.deepEqual(parseSchemaLagenRequest({ ...base, lesson: ma, pupilId: null }), { ...base, lesson: ma, pupilId: null });
  assert.equal(parseSchemaLagenRequest({ ...base, lesson: ma, pupilId: uid(901).toUpperCase() }).pupilId, uid(901));
  for (const broken of [{ ...base, lesson: ma }, { ...base, lesson: 'Matematik', pupilId: null }, { ...base, lesson: ma, pupilId: 'elev-1' }, { ...base, lesson: ma, pupilId: null, extra: 1 },
    { ...base, fingerprint: 'x', lesson: ma, pupilId: null }])
    assert.throws(() => parseSchemaLagenRequest(broken));
});

test('motorns svar tolkas strikt: okända koder, fel läge, okända resurser och tider utanför rutnätet nekas', () => {
  const ok = reply([pos(1, 730, 'violation', [reason('student_clash', 'students', 'kluster-1', [idh])]), pos(0, 480, 'free'),
    pos(0, 500, 'preference', [reason('student_gap', null, null)], { cost_delta: 40 }), pos(0, 520, 'blocked', [reason('outside_allowed', 'lesson', null), reason('teacher_clash', 'teacher', 'larare-1', [idh])]),
    pos(0, 540, 'swap', [reason('room_clash', 'room', 'sal-1', [idh])])]);
  const parsed = parseSchemaPositions(ok, p, ma);
  assert.deepEqual(parsed.positions.map(x => [x.day, x.startMin, x.state, x.room, x.costDelta]), [[1, 730, 'brott', 'sal-1', 0], [0, 480, 'fri', 'sal-1', 0], [0, 500, 'onskemal', 'sal-1', 40], [0, 520, 'sparrad', 'sal-1', 0], [0, 540, 'byte', 'sal-1', 0]]);
  assert.deepEqual(parsed.positions[0].reasons, [{ code: 'student_clash', kind: 'elever', resource: 'kluster-1', lessons: [idh] }]);
  const one = (position, extra = {}) => ({ ...reply([position]), ...extra });
  for (const broken of [
    one(pos(0, 480, 'free'), { problem_id: 'annat' }), one(pos(0, 480, 'free'), { lesson: idh }), one(pos(0, 480, 'free'), { extra: 1 }), one(pos(0, 480, 'free'), { version: 1 }),
    // Okänd kod, okänt läge, kod som inte hör till läget, orsak som saknas.
    one(pos(0, 480, 'violation', [reason('ny_regel', 'lesson', null)])), one(pos(0, 480, 'kanske')), one(pos(0, 480, 'violation', [reason('student_gap', null, null)])),
    one(pos(0, 480, 'preference', [reason('teacher_clash', 'teacher', 'larare-1')])), one(pos(0, 480, 'violation')), one(pos(0, 480, 'free', [reason('student_gap', null, null)])),
    one(pos(0, 480, 'swap', [reason('outside_allowed', 'lesson', null)])), one(pos(0, 480, 'blocked', [reason('teacher_clash', 'teacher', 'larare-1')])),
    // Fel slag, okänd resurs, passet självt eller okänt pass bland de berörda.
    one(pos(0, 480, 'violation', [reason('teacher_clash', 'room', 'larare-1')])), one(pos(0, 480, 'violation', [reason('teacher_clash', 'teacher', 'larare-99')])),
    one(pos(0, 480, 'violation', [reason('student_clash', 'students', 'kluster-1', [ma])])), one(pos(0, 480, 'violation', [reason('student_clash', 'students', 'kluster-1', ['pass-999'])])),
    one(pos(0, 480, 'violation', [reason('outside_allowed', 'lesson', 'larare-1')])), one(pos(0, 480, 'violation', [{ ...reason('room_clash', 'room', 'sal-1'), message: 'x' }])),
    // Tid utanför rutnätet eller skoldagen, dag som inte finns, samma tid två gånger, sal som passet inte får ha.
    one(pos(0, 485, 'free')), one(pos(0, 470, 'free')), one(pos(0, 16 * 60 + 30, 'free')), one(pos(5, 480, 'free')), reply([pos(0, 480, 'free'), pos(0, 480, 'free')]),
    one(pos(0, 480, 'free', [], { rooms: [] })), one(pos(0, 480, 'free', [], { rooms: ['sal-2'] })), one(pos(0, 480, 'free', [], { cost_delta: 1.5 }))])
    assert.throws(() => parseSchemaPositions(broken, p, ma), JSON.stringify(broken.positions?.[0] ?? broken).slice(0, 200));
});

test('svaret får namn i stället för löpnummer, och klientens tolkning prövar formen', () => {
  const parsed = parseSchemaPositions(reply([pos(1, 730, 'violation', [reason('student_clash', 'students', 'kluster-1', [idh]), reason('student_clash', 'students', 'kluster-1', [idh]),
    reason('teacher_no_lunch', 'teacher', 'larare-1')]), pos(0, 480, 'free')]), p, ma);
  const lagen = schemaLagen(underlag, parsed, false);
  assert.deepEqual(lagen.positions[0].reasons, [{ code: 'student_clash', kind: 'elever', name: underlag.labels.names['kluster-1'], lessons: [idh] },
    { code: 'teacher_no_lunch', kind: 'larare', name: 'Provlärare 4', lessons: [] }]);
  // Salen bär sitt löpnummer som i förslaget (`rooms`); lärare, elever, grupper och ämnen har namn.
  assert.ok(!/\b(?:grupp|kluster|larare|behov)-\d/u.test(JSON.stringify(lagen)) && lagen.positions.every(x => x.room === 'sal-1'), 'löpnummer för resurser i svaret');
  assert.ok(!JSON.stringify(lagen).includes('52a10000'), 'appens ID i svaret');
  const wire = JSON.parse(JSON.stringify(lagen));
  assert.deepEqual(parseSchemaLagen(wire, underlag.fingerprint, ma), lagen);
  assert.throws(() => parseSchemaLagen(wire, '0'.repeat(28), ma));
  assert.throws(() => parseSchemaLagen(wire, underlag.fingerprint, idh));
  for (const change of [x => { x.positions[0].reasons[0].code = 'ny_regel'; }, x => { x.positions[0].state = 'oklart'; }, x => { x.positions[1].reasons = [x.positions[0].reasons[0]]; },
    x => { x.positions[0].reasons[0].kind = 'larare'; }, x => { x.positions[0].reasons = []; }, x => { x.positions[0].room = 'Sal 204'; }, x => { x.elev = 'ja'; }, x => { x.extra = 1; }]) {
    const copy = structuredClone(wire);
    change(copy);
    assert.throws(() => parseSchemaLagen(copy, underlag.fingerprint, ma));
  }
});

test('elevnivå: elevens kluster ur underlaget, aldrig elev-ID; elev som inte ingår ger inget kluster', () => {
  // Elev 1 och 2 i klass 1 har Spanska: samma kluster. Elev 3 i klass 1 har inget val.
  const one = schemaElevKluster(plan, request, basis, underlag, uid(901));
  assert.equal(one, schemaElevKluster(plan, request, basis, underlag, uid(902)));
  assert.notEqual(one, schemaElevKluster(plan, request, basis, underlag, uid(903)));
  assert.match(one, /^kluster-\d+$/u);
  assert.equal(underlag.labels.names[one], 'Klass 1: Spanska');
  assert.ok(schemaPassKluster(p, ma).includes(one), 'eleven har klassens matematik');
  const spanska = underlag.labels.lessons.find(l => l.title === 'Spanska').id, tyska = underlag.labels.lessons.find(l => l.title === 'Tyska').id;
  assert.ok(schemaPassKluster(p, spanska).includes(one) && !schemaPassKluster(p, tyska).includes(one), 'eleven har Spanska, inte Tyska');
  assert.equal(schemaElevKluster(plan, request, basis, underlag, uid(999)), null);
  assert.equal(schemaElevKluster(plan, request, { ...basis, members: null }, underlag, uid(901)), null);
  // Underlaget är oförändrat av prövningen.
  assert.equal(buildSchemaUnderlag(plan, request, basis).fingerprint, underlag.fingerprint);
});

/** Designvyns exempel: Matematik 65 min för Klass 1 med Provlärare 4 i Sal 204; Klass 1 har Idrott och hälsa tisdag 12:10–13:10. */
const kontext = {
  lessons: [{ id: 'pass-1', title: 'Matematik', classIds: ['grupp-1'], teacherIds: ['larare-1'], durationMin: 65, marginMin: 0, roomIds: ['sal-1'], roomId: 'sal-1', vacant: false, term: null, day: 0, startMin: 610 },
    { id: 'pass-2', title: 'Idrott och hälsa', classIds: ['grupp-1'], teacherIds: ['larare-2'], durationMin: 60, marginMin: 0, roomIds: [], roomId: null, vacant: false, term: null, day: 1, startMin: 730 },
    { id: 'pass-3', title: 'Matematik', classIds: ['grupp-2'], teacherIds: ['larare-1'], durationMin: 60, marginMin: 0, roomIds: ['sal-1'], roomId: 'sal-1', vacant: false, term: null, day: 2, startMin: 480 }],
  classes: [{ id: 'grupp-1', name: 'Klass 1' }, { id: 'grupp-2', name: 'Klass 2' }], teachers: [{ id: 'larare-1', name: 'Provlärare 4' }, { id: 'larare-2', name: 'Provlärare 9' }],
  rooms: [{ id: 'sal-1', name: 'Sal 204' }],
  placements: [{ lesson: 'pass-1', day: 0, startMin: 610, room: 'sal-1' }, { lesson: 'pass-2', day: 1, startMin: 730, room: null }, { lesson: 'pass-3', day: 2, startMin: 480, room: 'sal-1' }] };
const lage = (day, startMin, state, reasons = [], costDelta = 0) => ({ day, startMin, room: 'sal-1', state, costDelta, reasons });
const orsak = (code, kind, name, lessons = []) => ({ code, kind, name, lessons });

test('varför inte: texterna som i designvyn', () => {
  assert.deepEqual(varfor('pass-1', lage(1, 730, 'brott', [orsak('student_clash', 'elever', 'Klass 1', ['pass-2'])]), kontext),
    ['Varför inte tisdag 12:10?', 'Klass 1 har Idrott och hälsa 12:10–13:10.', 'Provlärare 4 och Sal 204 är lediga.', 'Regelbrott: eleverna har redan ett pass.']);
  // Flera kluster i samma klass ger en rad; marginal efter det andra passet anges för sig. På elevnivå står elevens namn.
  const med = { ...kontext, lessons: kontext.lessons.map(l => l.id === 'pass-2' ? { ...l, marginMin: 25 } : l) };
  assert.deepEqual(varfor('pass-1', lage(1, 730, 'brott', [orsak('student_clash', 'elever', 'Klass 1', ['pass-2']), orsak('student_clash', 'elever', 'Klass 1: Spanska', ['pass-2'])]), { ...med, elev: 'Provelev 7' }),
    ['Varför inte tisdag 12:10?', 'Provelev 7 har Idrott och hälsa 12:10–13:10, med marginal till 13:35.', 'Provlärare 4 och Sal 204 är lediga.', 'Regelbrott: eleverna har redan ett pass.']);
  // Läraren och salen upptagna av ett annat pass som kan byta plats.
  assert.deepEqual(varfor('pass-1', lage(2, 480, 'byte', [orsak('teacher_clash', 'larare', 'Provlärare 4', ['pass-3']), orsak('room_clash', 'sal', 'Sal 204', ['pass-3'])]), kontext),
    ['Varför inte onsdag 08:00?', 'Provlärare 4 har Matematik med Klass 2 08:00–09:00.', 'Sal 204 används av Matematik med Klass 2 08:00–09:00.', 'Klass 1 är ledig.',
      'Går med ett byte: Matematik med Klass 2 kan ta passets plats måndag 10:10.']);
  // För kort rast i stället för krock.
  assert.deepEqual(varfor('pass-1', lage(1, 660, 'brott', [orsak('student_clash', 'elever', 'Klass 1', ['pass-2'])]), kontext).at(-1), 'Regelbrott: eleverna får för kort rast.');
  assert.deepEqual(varfor('pass-1', lage(4, 480, 'sparrad', [orsak('teacher_unavailable', 'larare', 'Provlärare 4'), orsak('outside_allowed', 'pass', null)]), kontext),
    ['Varför inte fredag 08:00?', 'Provlärare 4 är spärrad då.', 'Tiden ligger utanför passets tillåtna tider.', 'Klass 1 och Sal 204 är lediga.', 'Spärrad tid.']);
  assert.deepEqual(varfor('pass-1', lage(3, 900, 'onskemal', [orsak('student_gap', null, null), orsak('student_late', null, null)], 120), kontext),
    ['Varför inte torsdag 15:00?', 'Klass 1, Provlärare 4 och Sal 204 är lediga.', 'Bryter ett önskemål: håltid för eleverna, sen dag.']);
  assert.deepEqual(varfor('pass-1', lage(0, 480, 'fri'), kontext), ['Måndag 08:00', 'Klass 1, Provlärare 4 och Sal 204 är lediga.', 'Passet kan läggas här.']);
  assert.deepEqual(varfor('pass-1', lage(2, 600, 'brott', [orsak('teacher_no_lunch', 'larare', 'Provlärare 4'), orsak('student_day_too_long', 'elever', 'Klass 1')]), kontext),
    ['Varför inte onsdag 10:00?', 'Provlärare 4 får ingen lunch onsdag.', 'Klass 1 får för lång dag onsdag.', 'Sal 204 är ledig.', 'Regelbrott: läraren får ingen lunch, för lång dag för eleverna.']);
});
