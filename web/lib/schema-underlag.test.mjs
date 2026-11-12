import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, defaultSchemaTime, mergeSchemaMembers, schemaForslag, schemaKontroll, weeklyLessons } from './schema-underlag.ts';
import { schemaTime } from './schema-kalender.ts';
import { checkSchemaPlacements, parseSchemaCheck, parseSchemaForslag, parseSchemaForslagRequest, parseSchemaKontroll, parseSchemaKontrollRequest, parseSchemaSolution } from './schema-contract.ts';

const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const classKey = (c, row) => `class_timplan:${uid(c)}:2026:${row}`;
const need = (c, row, label, ht = h(54)) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: ht, needVt: ht, needBasis: 'terms' });
const row = (id, sourceKey, personId, extra = {}) => ({ id: uid(id), lineageId: uid(id + 500), sourceKind: 'class_timplan', sourceKey, classId: uid(10), rowKey: 'x',
  personId, teacherHt: h(54), teacherVt: h(54), needHt: h(54), needVt: h(54), needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const group = (id, name, blockId, classIds) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(id)}`, rowKey: `group:${uid(id)}`, label: name, needHt: h(36), needVt: h(36),
  needBasis: 'terms', groupId: uid(id), name, language: null, groupRevision: 1, classIds, sourceRefs: [], stale: false, blockId, optionId: uid(id + 50), subjectCode: 'X', levelCode: '1' });
/** Syntetisk tjänstefördelning: inga verkliga personer eller skolor. */
function plan(extra = {}) {
  return { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 3,
    version: { id: uid(2), versionNo: 4, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
    teachers: [20, 21, 22, 23].map(n => ({ personId: uid(n), displayName: `Lärare ${n}`, draft: false, shareHere: 100 })),
    classes: [
      { classId: uid(10), name: '1A', link: null, aplMinutes: null, needs: [need(10, 'ma', 'Matematik'), need(10, 'sv', 'Svenska'), need(10, 'liten', 'Liten kurs', h(4)), { ...need(10, 'okand', 'Okänt behov'), needHt: null, needVt: null }] },
      { classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik'), need(11, 'idh', 'Idrott', h(27))] },
    ],
    rows: [row(30, classKey(10, 'ma'), uid(20)), row(31, classKey(10, 'sv'), uid(21), { teacherHt: h(36) }), row(32, classKey(10, 'sv'), uid(22), { teacherHt: h(18) }),
      row(33, classKey(11, 'ma'), null)],
    groups: [], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [], ...extra };
}
const request = { unitId: uid(1), schoolYear: 2026, term: 'ht' };

test('veckotiden delas i lika pass om högst 80 min; under 20 min i veckan ger inget pass', () => {
  assert.deepEqual(weeklyLessons(h(54), 18), [60, 60, 60]);
  assert.deepEqual(weeklyLessons(h(27), 18), [45, 45]);
  assert.deepEqual(weeklyLessons(h(24), 18), [80]);
  assert.deepEqual(weeklyLessons(h(4), 18), []);
  // Veckotid som inte går jämnt ut: resten läggs på de första passen, så att summan är veckotiden.
  assert.deepEqual(weeklyLessons(170 * 17.4, 17.4), [60, 55, 55]);
  assert.deepEqual(weeklyLessons(h(54), 0), []);
});

test('underlaget bär bara löpnummer: inga namn och inga av appens ID:n når motorn', () => {
  const { problem } = buildSchemaUnderlag(plan(), request), sent = JSON.stringify(problem);
  assert.ok(!sent.includes('52a10000') && !sent.includes('Lärare') && !sent.includes('1A') && !sent.includes('Matematik') && !sent.includes('Provskolan'));
  assert.equal(problem.version, 1);
  assert.deepEqual(problem.teachers.map(t => t.id), ['larare-1', 'larare-2', 'larare-3', 'larare-4']);
});

test('behov blir pass: ensam lärare, delat behov en i taget, vakant och utelämnat', () => {
  const { problem, labels, omitted } = buildSchemaUnderlag(plan(), request);
  const of = title => labels.lessons.filter(l => l.title === title);
  assert.deepEqual(of('Matematik').map(l => [l.classIds, l.teacherIds, l.vacant]),
    [...Array(3).fill([['grupp-1'], ['larare-1'], false]), ...Array(3).fill([['grupp-2'], [], true])]);
  // 36 h och 18 h av 54 h: två pass till den ena läraren och ett till den andra.
  assert.deepEqual(of('Svenska').map(l => l.teacherIds[0]), ['larare-2', 'larare-2', 'larare-3']);
  // Behov utan rad läggs ändå, utan lärare.
  assert.deepEqual(of('Idrott').map(l => [l.durationMin, l.teacherIds.length, l.vacant]), [[45, 0, true], [45, 0, true]]);
  assert.deepEqual(omitted, [{ title: 'Liten kurs', classes: ['1A'], reason: 'too_short' }, { title: 'Okänt behov', classes: ['1A'], reason: 'no_time' }]);
  assert.equal(problem.lessons.length, labels.lessons.length);
  assert.deepEqual(buildSchemaUnderlag(plan(), request), buildSchemaUnderlag(plan(), request));
});

test('samtidig delning sätter alla lärare på varje pass; okänt behov tar lärarnas tid', () => {
  const sharing = [{ sourceKey: classKey(10, 'sv'), mode: 'concurrent', graderPersonIds: [] }];
  const rows = [...plan().rows, row(34, classKey(10, 'okand'), uid(23), { teacherHt: h(18) })];
  const { labels, omitted } = buildSchemaUnderlag(plan({ sharing, rows }), request);
  assert.deepEqual(labels.lessons.filter(l => l.title === 'Svenska').map(l => l.teacherIds), Array(3).fill(['larare-2', 'larare-3']));
  assert.deepEqual(labels.lessons.filter(l => l.title === 'Okänt behov').map(l => [l.durationMin, l.teacherIds]), [[60, ['larare-4']]]);
  assert.equal(omitted.length, 1);
});

test('valbart block utan lästa elever blir ett gemensamt pass för blockets klasser och lärare; samläsning likaså', () => {
  const groups = [group(40, 'Spanska', uid(60), [uid(10), uid(11)]), group(41, 'Tyska', uid(60), [uid(10), uid(11)]), group(42, 'Läxhjälp', uid(61), [])];
  const g = (id, n, personId) => row(id, `teaching_group:${uid(n)}`, personId, { sourceKind: 'teaching_group', classId: null, groupId: uid(n), classIds: [], sourceRefs: [], groupRevision: 1 });
  const rows = [...plan().rows.slice(0, 1), g(35, 40, uid(21)), g(36, 41, uid(22)),
    row(37, classKey(10, 'sv'), null, { jointGroupId: uid(70) }), row(38, classKey(11, 'idh'), null, { jointGroupId: uid(70) })];
  const joints = [{ id: uid(70), lineageId: uid(71), name: 'Tema', rowIds: [uid(37), uid(38)], teachers: [{ personId: uid(23), ht: h(54), vt: h(54) }] }];
  const { problem, labels } = buildSchemaUnderlag(plan({ groups, rows, joints }), request);
  const block = labels.lessons.filter(l => l.title === 'Valbart block: Spanska, Tyska');
  assert.deepEqual(block.map(l => [l.classIds, l.teacherIds, l.durationMin]), Array(2).fill([['grupp-1', 'grupp-2'], ['larare-2', 'larare-3'], 60]));
  assert.deepEqual(labels.lessons.filter(l => l.title === 'Tema').map(l => [l.classIds, l.teacherIds]), Array(3).fill([['grupp-1', 'grupp-2'], ['larare-4']]));
  assert.ok(!labels.lessons.some(l => l.title === 'Svenska' || l.title === 'Idrott'));
  // Gruppen utan klasser får ett eget elevkluster.
  assert.deepEqual(labels.lessons.filter(l => l.title === 'Läxhjälp').map(l => l.classIds), Array(2).fill(['grupp-3']));
  assert.deepEqual(problem.groups.at(-1), { id: 'grupp-3', clusters: ['kluster-3'] });
});

const gRow = (id, n, personId) => row(id, `teaching_group:${uid(n)}`, personId, { sourceKind: 'teaching_group', classId: null, groupId: uid(n), classIds: [], sourceRefs: [], groupRevision: 1 });
const HT = { start: '2026-08-17', end: '2026-12-18' };
/** Sex syntetiska elever: tre i varje klass. Två har valt Spanska, två Tyska, två har inget val; ingen har valt Franska. */
function chosen() {
  const both = [uid(10), uid(11)];
  const groups = [group(40, 'Spanska', uid(60), both), group(41, 'Tyska', uid(60), both), group(43, 'Franska', uid(60), both)];
  const rows = [...plan().rows, gRow(35, 40, uid(21)), gRow(36, 41, uid(22)), gRow(39, 43, uid(23))];
  const pupils = [1, 2, 3, 4, 5, 6].map(n => ({ id: uid(900 + n), classIds: [uid(n <= 3 ? 10 : 11)] }));
  const m = (g, p, startsOn = '2026-08-17', endsOn = null) => ({ groupId: uid(g), pupilId: uid(900 + p), startsOn, endsOn });
  const memberships = [m(40, 1), m(40, 4), m(41, 2), m(41, 5),
    m(41, 3, '2025-08-18', '2026-06-12'), m(43, 6, '2027-01-11'), m(40, 99), { ...m(40, 3), groupId: uid(77) }];
  return { data: plan({ groups, rows }), basis: { members: { pupils, memberships }, time: { ...defaultSchemaTime('ht'), term: HT } } };
}

test('elevernas grupper avgör krockarna: blockets alternativ läggs var för sig och delar bara kluster med sina elever', () => {
  const { data, basis } = chosen(), { problem, labels, members } = buildSchemaUnderlag(data, request, basis);
  // Medlemskap utanför terminen, för okänd elev och för okänd grupp räknas inte.
  assert.deepEqual(problem.clusters, [1, 1, 1, 1, 1, 1].map((size, i) => ({ id: `kluster-${i + 1}`, size })).concat({ id: 'kluster-7', size: 1 }));
  assert.deepEqual(problem.groups, [
    { id: 'grupp-1', clusters: ['kluster-1', 'kluster-2', 'kluster-3'] }, { id: 'grupp-2', clusters: ['kluster-4', 'kluster-5', 'kluster-6'] },
    { id: 'grupp-3', clusters: ['kluster-2', 'kluster-5'] }, { id: 'grupp-4', clusters: ['kluster-3', 'kluster-6'] }, { id: 'grupp-5', clusters: ['kluster-7'] }]);
  const of = title => problem.lessons.filter((_, i) => labels.lessons[i].title === title);
  assert.deepEqual(of('Spanska').map(l => [l.groups, l.teachers, l.duration_min]), Array(2).fill([['grupp-3'], ['larare-2'], 60]));
  assert.deepEqual(of('Tyska').map(l => l.groups), Array(2).fill(['grupp-4']));
  // Alternativet utan elever får ett eget kluster och krockar inte med någon elev.
  assert.deepEqual(of('Franska').map(l => l.groups), Array(2).fill(['grupp-5']));
  assert.ok(!labels.lessons.some(l => l.title.startsWith('Valbart block')));
  // Passen visas i de klasser som gruppens elever går i; gruppen utan elever visas för sig.
  assert.deepEqual(labels.lessons.find(l => l.title === 'Spanska').classIds, ['grupp-1', 'grupp-2']);
  assert.deepEqual(labels.lessons.find(l => l.title === 'Franska').classIds, ['grupp-5']);
  assert.deepEqual(labels.classes.at(-1), { id: 'grupp-5', name: 'Franska' });
  assert.deepEqual(members, { pupils: 6, groupsWithoutMembers: ['Franska'], classesWithoutPupils: [], withoutChoice: [{ title: 'Spanska, Tyska, Franska', count: 2 }] });
  assert.equal(labels.names['kluster-2'], '1A: Spanska');
  const sent = JSON.stringify(problem);
  assert.ok(!sent.includes('52a10000') && !sent.includes('Spanska') && !sent.includes('1A'));
  assert.deepEqual(buildSchemaUnderlag(data, request, basis), buildSchemaUnderlag(data, request, basis));
});

test('klass utan elever i registret räknas som odelad; grupp utan elever utanför block upptar sina klasser', () => {
  const { data, basis } = chosen();
  const groups = [...data.groups, { ...group(44, 'Stödgrupp', null, [uid(11)]), sourceKind: 'study_group', sourceKey: `study_group:${uid(44)}` }];
  const pupils = basis.members.pupils.slice(0, 3);
  const { problem, labels, members } = buildSchemaUnderlag({ ...data, groups }, request, { ...basis, members: { ...basis.members, pupils } });
  assert.deepEqual(problem.clusters.at(3), { id: 'kluster-4', size: 25 });
  assert.deepEqual(problem.groups[1], { id: 'grupp-2', clusters: ['kluster-4'] });
  assert.deepEqual(members.classesWithoutPupils, ['1B']);
  assert.deepEqual(members.groupsWithoutMembers, ['Franska', 'Stödgrupp']);
  assert.deepEqual(problem.lessons.filter((_, i) => labels.lessons[i].title === 'Stödgrupp').map(l => l.groups), Array(2).fill(['grupp-2']));
});

test('elever och medlemskap slås ihop ur flera läsningar; utan läsning finns inget elevunderlag', () => {
  const a = { pupils: [{ id: 'e1', name: 'Syntetisk Elev', classIds: ['k1'] }], memberships: [{ groupId: 'g1', pupilId: 'e1', startsOn: '2026-08-17', endsOn: null, extra: 1 }] };
  const b = { pupils: [{ id: 'e1', classIds: ['k2'] }, { id: 'e2', classIds: [] }], memberships: [] };
  assert.deepEqual(mergeSchemaMembers([a, { pupils: null, memberships: null }, b]), {
    pupils: [{ id: 'e1', classIds: ['k1', 'k2'] }, { id: 'e2', classIds: [] }], memberships: [{ groupId: 'g1', pupilId: 'e1', startsOn: '2026-08-17', endsOn: null }] });
  assert.equal(mergeSchemaMembers([{ pupils: null, memberships: [] }, { pupils: [], memberships: null }]), null);
});

/** Syntetisk läsårskalender: HT 18 hela veckor med en lovdag (måndag) och en studiedag (onsdag); klass 1B har en egen dag utan undervisning (torsdag). */
function lasar(extra = {}) {
  const calendar = { versionId: uid(80), version: 2, status: 'faststalld', revision: 1, terms: { ht: HT, vt: { start: '2027-01-11', end: '2027-06-11' } },
    exceptions: { '2026-10-26': { kind: 'lovdag', note: 'Höstlov' }, '2026-11-11': { kind: 'studiedag' } },
    groupDays: { [`klass:${uid(11)}`]: { '2026-11-12': { cause: 'friluftsdag' } } }, shortWeeks: {}, frameVersionId: null, contentHash: 'x', decidedOn: '2026-03-18', history: [] };
  return { contractVersion: 'lasar_sql_v1', target: { kind: 'school', unitId: uid(1) }, schoolYear: 2026, schoolName: 'Provskolan', schoolTypes: ['GY'], mode: 'eget', modeLocked: false,
    versions: [{ versionId: uid(80), version: 2, status: 'faststalld', decidedOn: '2026-03-18', current: true }], calendar,
    groups: [10, 11].map(n => ({ scope: 'klass', classId: uid(n), offeringId: uid(90), columnId: null, label: `1${n === 10 ? 'A' : 'B'}`, educationName: 'Provutbildning', kind: 'gy' })), ...extra };
}

test('terminens tid räknas ur läsårskalenderns skoldagar per veckodag, för skolan och för klassen', () => {
  const time = schemaTime(lasar(), 'ht', [uid(10), uid(11), uid(12)]);
  assert.deepEqual(time, { source: 'kalender', version: 2, status: 'faststalld', current: true, term: HT, perWeekday: [17, 18, 17, 18, 18],
    classes: { [uid(10)]: [17, 18, 17, 18, 18], [uid(11)]: [17, 18, 17, 17, 18] } });
  assert.equal(schemaTime(lasar({ versions: [] }), 'ht', []).current, false);
  assert.deepEqual(schemaTime(null, 'vt', [uid(10)]), defaultSchemaTime('vt'));
  assert.deepEqual(schemaTime(lasar({ calendar: null }), 'ht', []), defaultSchemaTime('ht'));
  assert.deepEqual(defaultSchemaTime('vt').perWeekday, [20, 20, 20, 20, 20]);
});

test('utlagd tid är passens längd gånger skoldagarna på passets veckodag; klass utan skoldagar får inga pass', () => {
  const only = extra => plan({ classes: [{ classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik')] }], rows: [], ...extra });
  const time = { source: 'kalender', version: 2, status: 'utkast', current: false, term: HT, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(11)]: [17, 18, 17, 17, 0] } };
  const data = only(), underlag = buildSchemaUnderlag(data, request, { members: null, time });
  // 54 h på 69 skoldagar = 13,8 veckor: 235 min i veckan.
  assert.deepEqual(underlag.problem.lessons.map(l => l.duration_min), [80, 80, 75]);
  const forslag = schemaForslag(data, request, underlag, parseSchemaSolution(solved(underlag.problem), underlag.problem));
  // pass-1 är olagt, pass-2 ligger på tisdag (18 skoldagar) och pass-3 på onsdag (17).
  assert.deepEqual(forslag.teachings, [{ title: 'Matematik', classes: ['1B'], needMin: h(54), weeklyMin: 235, plannedMin: 80 * 18 + 75 * 17, unplaced: 1 }]);
  assert.deepEqual(forslag.time, { source: 'kalender', version: 2, status: 'utkast', current: false, schoolDays: 88, weeks: 17.6 });
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  const none = buildSchemaUnderlag(data, request, { members: null, time: { ...time, classes: { [uid(11)]: [0, 0, 0, 0, 0] } } });
  assert.deepEqual([none.problem.lessons.length, none.omitted], [0, [{ title: 'Matematik', classes: ['1B'], reason: 'no_days' }]]);
});

function solved(problem, extra = {}) {
  const slots = problem.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, start_min: 480 + 90 * Math.floor(i / 5), rooms: [] }));
  return { version: 1, problem_id: problem.id, problem_hash: 'x', status: 'time_limit', placements: slots.slice(1), unplaced: [slots[0].lesson],
    diagnoses: [{ code: 'unplaced', message: 'Pass pass-1 fick ingen plats. I vägen: lärare larare-1 är upptagen; eleverna i kluster-1.', lessons: ['pass-1'], resources: [], proof: false }],
    metrics: { lessons: slots.length, student_gap_min: 50, teacher_gap_min: 10 }, stats: { elapsed_ms: 12 }, ...extra };
}

test('motorns svar tolkas strikt och förslaget får namn i stället för löpnummer', () => {
  const data = plan(), underlag = buildSchemaUnderlag(data, request), raw = solved(underlag.problem);
  const forslag = schemaForslag(data, request, underlag, parseSchemaSolution(raw, underlag.problem));
  assert.equal(forslag.diagnoses[0].message, 'Pass Matematik fick ingen plats. I vägen: lärare Lärare 20 är upptagen; eleverna i 1A.');
  assert.deepEqual([forslag.metrics.placed, forslag.metrics.unplaced, forslag.lessons[0].day, forslag.lessons[1].startMin], [underlag.problem.lessons.length - 1, 1, null, 480]);
  assert.deepEqual(forslag.teachers.map(t => t.name), ['Lärare 20', 'Lärare 21', 'Lärare 22']);
  assert.deepEqual(forslag.basis, { versionNo: 4, status: 'draft' });
  assert.deepEqual(forslag.time, { source: 'forval', version: null, status: null, current: false, schoolDays: 90, weeks: 18 });
  assert.deepEqual(forslag.members, { pupils: 0, groupsWithoutMembers: [], classesWithoutPupils: ['1A', '1B'], withoutChoice: [] });
  assert.equal(forslag.teachings.find(t => t.title === 'Svenska').needMin, h(54));
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  assert.throws(() => parseSchemaForslag(forslag, { ...request, term: 'vt' }));

  const p = underlag.problem, first = raw.placements[0];
  for (const broken of [
    { problem_id: 'annat' }, { version: 2 }, { status: 'klart' },
    { placements: [...raw.placements, first] },
    { placements: [{ ...first, lesson: 'pass-999' }, ...raw.placements.slice(1)] },
    { placements: [{ ...first, start_min: 16 * 60 }, ...raw.placements.slice(1)] },
    { placements: [{ ...first, day: 5 }, ...raw.placements.slice(1)] },
    { unplaced: [] },
  ]) assert.throws(() => parseSchemaSolution(solved(p, broken), p), JSON.stringify(Object.keys(broken)));
});

test('begäran: skola, läsår och termin prövas', () => {
  assert.deepEqual(parseSchemaForslagRequest(request), request);
  for (const broken of [{ ...request, weeks: 18 }, { ...request, term: 'ar' }, { ...request, unitId: 'x' }, { ...request, extra: 1 }, null])
    assert.throws(() => parseSchemaForslagRequest(broken));
});

test('fingeravtrycket följer underlaget och kontrollens begäran och svar tolkas strikt', () => {
  const underlag = buildSchemaUnderlag(plan(), request), p = underlag.problem;
  assert.match(underlag.fingerprint, /^[0-9a-f]{28}$/u);
  assert.equal(buildSchemaUnderlag(plan(), request).fingerprint, underlag.fingerprint);
  // Ändrad lärare, ändrat behov eller ändrat namn ger ett annat underlag.
  const changed = [plan({ rows: [row(30, classKey(10, 'ma'), uid(23))] }), plan({ teachers: [20, 21, 22, 23].map(n => ({ personId: uid(n), displayName: `Ny ${n}`, draft: false, shareHere: 100 })) })];
  for (const other of changed) assert.notEqual(buildSchemaUnderlag(other, request).fingerprint, underlag.fingerprint);
  assert.notEqual(buildSchemaUnderlag(plan(), { ...request, term: 'vt' }).fingerprint, underlag.fingerprint);
  assert.equal(schemaForslag(plan(), request, underlag, parseSchemaSolution(solved(p), p)).fingerprint, underlag.fingerprint);

  const placements = [{ lesson: 'pass-1', day: 0, startMin: 480 }, { lesson: 'pass-2', day: 4, startMin: 930 }];
  const body = { ...request, fingerprint: underlag.fingerprint, placements };
  assert.deepEqual(parseSchemaKontrollRequest(body), body);
  for (const broken of [{ ...body, fingerprint: 'x' }, { ...body, extra: 1 }, { ...body, placements: [{ ...placements[0], rooms: [] }] }, { ...body, placements: [{ ...placements[0], day: 1.5 }] }, { ...request, placements }])
    assert.throws(() => parseSchemaKontrollRequest(broken));
  assert.deepEqual(checkSchemaPlacements(placements, p), placements);
  // Okänt pass, samma pass två gånger, dag som inte finns och tid utanför skoldagen stoppas innan motorn anropas.
  for (const broken of [[{ ...placements[0], lesson: 'pass-999' }], [placements[0], placements[0]], [{ ...placements[0], day: 5 }], [{ ...placements[0], startMin: 475 }], [{ ...placements[0], startMin: 16 * 60 + 30 - 55 }]])
    assert.throws(() => checkSchemaPlacements(broken, p));

  const reply = { version: 1, problem_id: p.id, violations: [
    { code: 'student_clash', message: 'Pass pass-1 och pass-4 krockar för elever i kluster-1.', lessons: ['pass-1', 'pass-4'], resources: ['kluster-1'] },
    { code: 'student_clash', message: 'Pass pass-1 och pass-4 krockar för elever i kluster-1.', lessons: ['pass-1', 'pass-4'], resources: ['kluster-1'] },
    { code: 'teacher_no_lunch', message: 'Lärare larare-1 saknar lunch dag 2.', lessons: [], resources: ['larare-1'] }],
    metrics: { student_gap_min: 30, teacher_gap_min: 0 } };
  const check = parseSchemaCheck(reply, p), kontroll = schemaKontroll(underlag, placements, check);
  assert.deepEqual(kontroll.violations, [
    { code: 'student_clash', message: 'Pass Matematik (1A) och Svenska (1A) krockar för elever i 1A.', lessons: ['pass-1', 'pass-4'] },
    { code: 'teacher_no_lunch', message: 'Lärare Lärare 20 saknar lunch onsdag.', lessons: [] }]);
  assert.deepEqual([kontroll.total, kontroll.metrics], [2, { lessons: p.lessons.length, placed: 2, unplaced: p.lessons.length - 2, studentGapMin: 30, teacherGapMin: 0 }]);
  // Två av matematikens tre pass har en tid: 60 min gånger måndagens och fredagens 18 skoldagar.
  assert.deepEqual(kontroll.teachings.find(t => t.title === 'Matematik' && t.classes[0] === '1A'), { title: 'Matematik', classes: ['1A'], needMin: h(54), weeklyMin: 180, plannedMin: 2 * 60 * 18, unplaced: 1 });
  assert.deepEqual(parseSchemaKontroll(JSON.parse(JSON.stringify(kontroll)), underlag.fingerprint), kontroll);
  assert.throws(() => parseSchemaKontroll(kontroll, '0'.repeat(28)));
  for (const broken of [{ ...reply, problem_id: 'annat' }, { ...reply, version: 2 }, { ...reply, violations: [{ ...reply.violations[0], lessons: ['pass-999'] }] }, { ...reply, metrics: {} }])
    assert.throws(() => parseSchemaCheck(broken, p));
});
