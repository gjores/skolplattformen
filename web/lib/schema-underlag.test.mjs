import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, defaultSchemaTime, mergeSchemaMembers, reachable, schemaForslag, schemaKontroll, weeklyLessons } from './schema-underlag.ts';
import { schemaTime } from './schema-kalender.ts';
import { checkSchemaPlacements, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaVillkor, parseSchemaCheck, parseSchemaForslag, parseSchemaForslagRequest, parseSchemaKontroll, parseSchemaKontrollRequest, parseSchemaSolution } from './schema-contract.ts';

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
const request = { unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: defaultSchemaVillkor() };
const lasarRequest = { ...request, period: 'lasar' };
/** Tid utan läsårskalender, med terminens spann för HT. */
const timeWith = (ht = {}, vt = {}) => { const t = defaultSchemaTime(); return { ...t, terms: { ht: { ...t.terms.ht, ...ht }, vt: { ...t.terms.vt, ...vt } } }; };

test('veckotiden avrundas uppåt och delas i lika pass om högst 80 min; under 20 min i veckan ger inget pass', () => {
  assert.deepEqual(weeklyLessons(h(54), 18), [60, 60, 60]);
  assert.deepEqual(weeklyLessons(h(27), 18), [45, 45]);
  assert.deepEqual(weeklyLessons(h(24), 18), [80]);
  assert.deepEqual(weeklyLessons(h(4), 18), []);
  // Veckotid som inte går jämnt ut: resten läggs på de första passen, så att summan är veckotiden.
  assert.deepEqual(weeklyLessons(170 * 17.4, 17.4), [60, 55, 55]);
  // Aldrig nedåt (E1): 171 min i veckan blir 175, inte 170.
  assert.deepEqual(weeklyLessons(171 * 18, 18), [60, 60, 55]);
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
test('ett valbart block med långa alternativnamn är ett ämne som förslaget och egna villkor godtar', () => {
  const names = ['Spanska · Moderna språk – fortsättning – Nivå 1 1', 'Franska · Moderna språk – fördjupning – Nivå 1 1', 'Tyska · Moderna språk – fortsättning – Nivå 2 1', 'Spanska · Moderna språk – fortsättning – Nivå 2 1'];
  const groups = names.map((name, i) => group(40 + i, name, uid(60), [uid(10), uid(11)]));
  const data = plan({ groups, rows: [...plan().rows.slice(0, 1), ...names.map((_, i) => gRow(35 + i, 40 + i, uid(20 + i)))] });
  const title = `Valbart block: ${names.join(', ')}`;
  assert.ok(title.length > 200);
  const req = { ...request, villkor: { ...defaultSchemaVillkor(), egna: [{ slag: 'amne', ref: title, typ: 'langd', maxMin: 45 }] } };
  assert.deepEqual(parseSchemaForslagRequest(JSON.parse(JSON.stringify(req))), req);
  const underlag = buildSchemaUnderlag(data, req);
  assert.ok(underlag.resurser.amne.some(r => r.ref === title));
  assert.deepEqual(underlag.egnaUtanTraff, []);
  assert.ok(underlag.labels.lessons.filter(l => l.title === title).every(l => l.durationMin <= 45));
  const forslag = schemaForslag(data, req, underlag, parseSchemaSolution(solved(underlag.problem), underlag.problem));
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), req), forslag);
});

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
  return { data: plan({ groups, rows }), basis: { members: { pupils, memberships }, time: timeWith({ span: HT }) } };
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
  const time = schemaTime(lasar(), [uid(10), uid(11), uid(12)]);
  assert.deepEqual([time.source, time.version, time.status, time.current], ['kalender', 2, 'faststalld', true]);
  assert.deepEqual(time.terms.ht, { span: HT, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(10)]: [17, 18, 17, 18, 18], [uid(11)]: [17, 18, 17, 17, 18] } });
  // VT 11 januari–11 juni utan lov i provkalendern: 22 veckor minus långfredag, annandag påsk och Kristi himmelsfärdsdag.
  const vt = [21, 22, 22, 21, 21];
  assert.deepEqual(time.terms.vt, { span: { start: '2027-01-11', end: '2027-06-11' }, perWeekday: vt, classes: { [uid(10)]: vt, [uid(11)]: vt } });
  assert.equal(schemaTime(lasar({ versions: [] }), []).current, false);
  assert.deepEqual(schemaTime(null, [uid(10)]), defaultSchemaTime());
  assert.deepEqual(schemaTime(lasar({ calendar: null }), []), defaultSchemaTime());
  assert.deepEqual([defaultSchemaTime().terms.ht.perWeekday, defaultSchemaTime().terms.vt.perWeekday], [[18, 18, 18, 18, 18], [20, 20, 20, 20, 20]]);
});

test('utlagd tid är passens längd gånger skoldagarna på passets veckodag; klass utan skoldagar får inga pass', () => {
  const only = extra => plan({ classes: [{ classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik')] }], rows: [], ...extra });
  const time = { ...timeWith({ span: HT, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(11)]: [17, 18, 17, 17, 0] } }), source: 'kalender', version: 2, status: 'utkast' };
  const data = only(), underlag = buildSchemaUnderlag(data, request, { members: null, time });
  // 54 h på 69 skoldagar fördelade på fyra veckodagar = 17,25 veckor: 187,8 min i veckan, uppåt till 190 (E1).
  assert.deepEqual(underlag.problem.lessons.map(l => l.duration_min), [65, 65, 60]);
  // Tillåten tid (E2): 3240 min till och med 3240 + 5 min × 17,25 veckor, under 3327.
  assert.deepEqual(underlag.problem.activities[0].time, [{ weekday_days: [17, 18, 17, 17, 0], min_min: 3240, max_min: 3326 }]);
  const forslag = schemaForslag(data, request, underlag, parseSchemaSolution(solved(underlag.problem), underlag.problem));
  // pass-1 är olagt, pass-2 ligger på tisdag (18 skoldagar) och pass-3 på onsdag (17).
  assert.deepEqual(forslag.teachings, [{ title: 'Matematik', classes: ['1B'], needMin: h(54), weeklyMin: 190, plannedMin: 65 * 18 + 60 * 17, unplaced: 1,
    terms: [{ term: 'ht', needMin: h(54), maxMin: 3326, plannedMin: 65 * 18 + 60 * 17 }], deviation: 'unplaced' }]);
  assert.deepEqual(forslag.time, { source: 'kalender', version: 2, status: 'utkast', current: false, schoolDays: 88, weeks: 17.6, terms: [{ term: 'ht', schoolDays: 88 }] });
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  const none = buildSchemaUnderlag(data, request, { members: null, time: timeWith({ span: HT, classes: { [uid(11)]: [0, 0, 0, 0, 0] } }) });
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
  assert.deepEqual(forslag.time, { source: 'forval', version: null, status: null, current: false, schoolDays: 90, weeks: 18, terms: [{ term: 'ht', schoolDays: 90 }] });
  assert.deepEqual(forslag.members, { pupils: 0, groupsWithoutMembers: [], classesWithoutPupils: ['1A', '1B'], withoutChoice: [] });
  assert.equal(forslag.teachings.find(t => t.title === 'Svenska').needMin, h(54));
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  assert.throws(() => parseSchemaForslag(forslag, { ...request, period: 'vt' }));
  assert.throws(() => parseSchemaForslag(forslag, { ...request, villkor: { ...request.villkor, breakMin: 5 } }));

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

test('begäran: skola, läsår, period och villkor prövas', () => {
  assert.deepEqual(parseSchemaForslagRequest(request), request);
  for (const broken of [{ ...request, weeks: 18 }, { ...request, period: 'ar' }, { ...request, unitId: 'x' }, { ...request, extra: 1 }, { unitId: uid(1), schoolYear: 2026, period: 'ht' },
    { ...request, villkor: { ...request.villkor, breakMin: 7 } }, { ...request, villkor: { ...request.villkor, extra: 1 } }, null])
    assert.throws(() => parseSchemaForslagRequest(broken));
});

test('fingeravtrycket följer underlaget och kontrollens begäran och svar tolkas strikt', () => {
  const underlag = buildSchemaUnderlag(plan(), request), p = underlag.problem;
  assert.match(underlag.fingerprint, /^[0-9a-f]{28}$/u);
  assert.equal(buildSchemaUnderlag(plan(), request).fingerprint, underlag.fingerprint);
  // Ändrad lärare, ändrat behov eller ändrat namn ger ett annat underlag.
  const changed = [plan({ rows: [row(30, classKey(10, 'ma'), uid(23))] }), plan({ teachers: [20, 21, 22, 23].map(n => ({ personId: uid(n), displayName: `Ny ${n}`, draft: false, shareHere: 100 })) })];
  for (const other of changed) assert.notEqual(buildSchemaUnderlag(other, request).fingerprint, underlag.fingerprint);
  assert.notEqual(buildSchemaUnderlag(plan(), { ...request, period: 'vt' }).fingerprint, underlag.fingerprint);
  assert.notEqual(buildSchemaUnderlag(plan(), { ...request, villkor: { ...request.villkor, breakMin: 5 } }).fingerprint, underlag.fingerprint);
  assert.equal(schemaForslag(plan(), request, underlag, parseSchemaSolution(solved(p), p)).fingerprint, underlag.fingerprint);

  const placements = [{ lesson: 'pass-1', day: 0, startMin: 480, room: null }, { lesson: 'pass-2', day: 4, startMin: 930, room: null }];
  const body = { ...request, fingerprint: underlag.fingerprint, placements };
  assert.deepEqual(parseSchemaKontrollRequest(body), body);
  for (const broken of [{ ...body, fingerprint: 'x' }, { ...body, extra: 1 }, { ...body, placements: [{ ...placements[0], rooms: [] }] }, { ...body, placements: [{ ...placements[0], day: 1.5 }] }, { ...body, placements: [{ ...placements[0], room: 'Idrottshallen' }] }, { ...body, placements: [{ lesson: 'pass-1', day: 0, startMin: 480 }] }, { ...request, placements }])
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
  assert.deepEqual(kontroll.teachings.find(t => t.title === 'Matematik' && t.classes[0] === '1A'), { title: 'Matematik', classes: ['1A'], needMin: h(54), weeklyMin: 180, plannedMin: 2 * 60 * 18, unplaced: 1,
    terms: [{ term: 'ht', needMin: h(54), maxMin: h(54) + 89, plannedMin: 2 * 60 * 18 }], deviation: 'unplaced' });
  assert.deepEqual(kontroll.rooms, {});
  assert.deepEqual(parseSchemaKontroll(JSON.parse(JSON.stringify(kontroll)), underlag.fingerprint), kontroll);
  assert.throws(() => parseSchemaKontroll(kontroll, '0'.repeat(28)));
  for (const broken of [{ ...reply, problem_id: 'annat' }, { ...reply, version: 2 }, { ...reply, violations: [{ ...reply.violations[0], lessons: ['pass-999'] }] }, { ...reply, metrics: {} }])
    assert.throws(() => parseSchemaCheck(broken, p));
});

const one = (needHt, needVt, rows = []) => plan({ classes: [{ classId: uid(10), name: '1A', link: null, aplMinutes: null, needs: [{ ...need(10, 'ma', 'Matematik'), needHt, needVt }] }], rows });
const lessonsOf = u => u.problem.lessons.map((l, i) => [l.duration_min, l.periods ?? null, u.labels.lessons[i].term]);

test('läsårsschema: terminerna är motorns perioder och timplanens tid per termin avgör när undervisningen läggs', () => {
  const u = buildSchemaUnderlag(plan(), lasarRequest);
  assert.deepEqual([u.problem.id, u.problem.periods, u.terms], ['forslag-lasar', [{ id: 'ht' }, { id: 'vt' }], ['ht', 'vt']]);
  assert.equal(buildSchemaUnderlag(plan(), request).problem.periods, undefined);
  // 54 h per termin på 18 och 20 veckor är 180 och 162 min i veckan, uppåt 180 och 165: egna pass per termin, och varje termin har sin tid (E2, E5).
  assert.equal(lessonsOf(u).filter(l => l[1] === null).length, 0);
  assert.ok(!('termDiffPct' in defaultSchemaVillkor()));
  assert.deepEqual(u.problem.activities[0].time, [{ period: 'ht', weekday_days: [18, 18, 18, 18, 18], min_min: h(54), max_min: h(54) + 89 },
    { period: 'vt', weekday_days: [20, 20, 20, 20, 20], min_min: h(54), max_min: h(54) + 99 }]);
  assert.equal(u.labels.activities[0].needMin, h(108));
  // Tid bara en termin: passen går bara den terminen, så att en HT-kurs och en VT-kurs kan dela tid.
  assert.deepEqual(lessonsOf(buildSchemaUnderlag(one(h(54), 0), lasarRequest)), Array(3).fill([60, ['ht'], 'ht']));
  assert.deepEqual(lessonsOf(buildSchemaUnderlag(one(null, h(60)), lasarRequest)), Array(3).fill([60, ['vt'], 'vt']));
  // Terminsschema: samma undervisning utan perioder, och inget alls den termin timplanen saknar tid.
  assert.deepEqual(lessonsOf(buildSchemaUnderlag(one(h(54), 0), request)), Array(3).fill([60, null, null]));
  assert.deepEqual(buildSchemaUnderlag(one(h(54), 0), { ...request, period: 'vt' }).omitted, [{ title: 'Matematik', classes: ['1A'], reason: 'no_time' }]);
});

test('olika veckotid i timplanen ger egna pass per termin', () => {
  const data = one(h(54), h(30));
  // HT 180 min i veckan, VT 90: skillnaden är avsedd i timplanen.
  assert.deepEqual(lessonsOf(buildSchemaUnderlag(data, lasarRequest)), [[60, ['ht'], 'ht'], [60, ['ht'], 'ht'], [60, ['ht'], 'ht'], [45, ['vt'], 'vt'], [45, ['vt'], 'vt']]);
  // Ett sparat terminsval från tidigare versioner nekas av servern.
  assert.throws(() => parseSchemaVillkor({ ...defaultSchemaVillkor(), termDiffPct: 15 }));
  // För lite tid ena terminen: den terminen redovisas som utelämnad, den andra läggs.
  const short = buildSchemaUnderlag(one(h(54), h(4)), lasarRequest);
  assert.deepEqual([lessonsOf(short).length, short.omitted], [3, [{ title: 'Matematik (VT)', classes: ['1A'], reason: 'too_short' }]]);
});

test('lärarbyte mellan terminerna ger egna pass per termin med terminens lärare', () => {
  const rows = [row(30, classKey(10, 'ma'), uid(20), { teacherVt: 0 }), row(31, classKey(10, 'ma'), uid(21), { teacherHt: 0 })];
  const u = buildSchemaUnderlag(one(h(54), h(60), rows), lasarRequest);
  assert.deepEqual(u.labels.lessons.map(l => [l.term, l.teacherIds]), [...Array(3).fill(['ht', ['larare-1']]), ...Array(3).fill(['vt', ['larare-2']])]);
});

test('utlagd tid räknas över passets terminer och håltid redovisas som snitt per vecka', () => {
  const data = one(h(54), h(60)), u = buildSchemaUnderlag(data, lasarRequest);
  assert.deepEqual(lessonsOf(u), Array(3).fill([60, null, null]));
  const forslag = schemaForslag(data, lasarRequest, u, parseSchemaSolution(solved(u.problem), u.problem));
  // Två lagda pass om 60 min, vart och ett 18 skoldagar HT och 20 VT.
  assert.deepEqual(forslag.teachings, [{ title: 'Matematik', classes: ['1A'], needMin: h(114), weeklyMin: 180, plannedMin: 2 * 60 * 38, unplaced: 1,
    terms: [{ term: 'ht', needMin: h(54), maxMin: h(54) + 89, plannedMin: 2 * 60 * 18 }, { term: 'vt', needMin: h(60), maxMin: h(60) + 99, plannedMin: 2 * 60 * 20 }], deviation: 'unplaced' }]);
  assert.deepEqual(forslag.time.terms, [{ term: 'ht', schoolDays: 90 }, { term: 'vt', schoolDays: 100 }]);
  assert.deepEqual([forslag.period, forslag.metrics.studentGapMin, forslag.metrics.teacherGapMin], ['lasar', 25, 5]);
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), lasarRequest), forslag);
  const split = buildSchemaUnderlag(one(h(54), h(30)), lasarRequest), at = parseSchemaSolution(solved(split.problem), split.problem);
  // pass-2 och pass-3 (HT, 60 min) ligger tisdag och onsdag, pass-4 och pass-5 (VT, 45 min) torsdag och fredag.
  assert.equal(schemaForslag(one(h(54), h(30)), lasarRequest, split, at).teachings[0].plannedMin, 2 * 60 * 18 + 2 * 45 * 20);
});

test('villkoren prövas och når motorn', () => {
  const d = defaultSchemaVillkor();
  assert.deepEqual(checkSchemaVillkor(d), []);
  assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(d))), d);
  const broken = [{ breakMin: 7 }, { breakMin: 35 }, { startGridMin: 25 }, { maxLessonMin: 200 }, { minLessonMin: 45 }, { sameDay: 'ibland' }, { lateAfterMin: 5 * 60 },
    { studentMaxMinPerDay: 60 }, { teacherMaxMinPerDay: 601 }, { lunch: { ...d.lunch, startMin: 13 * 60, endMin: 13 * 60 + 30 } }, { lunch: { ...d.lunch, lengthMin: 15 } },
    { days: d.days.slice(0, 4) }, { days: d.days.map((x, i) => i === 2 ? { startMin: 8 * 60, endMin: 8 * 60 + 30 } : x) }, { days: d.days.map((x, i) => i === 0 ? { ...x, startMin: 5 * 60 } : x) }];
  for (const change of broken) {
    assert.ok(checkSchemaVillkor({ ...d, ...change }).length > 0, JSON.stringify(change));
    assert.throws(() => parseSchemaVillkor({ ...d, ...change }), JSON.stringify(change));
  }
  for (const odd of [{ ...d, extra: 1 }, { ...d, lunch: { ...d.lunch, extra: 1 } }, { ...d, days: d.days.map(x => ({ ...x, extra: 1 })) }, null, []]) assert.throws(() => parseSchemaVillkor(odd));

  const villkor = { ...d, days: d.days.map((x, i) => i === 4 ? { startMin: 8 * 60 + 30, endMin: 14 * 60 } : x), breakMin: 5, startGridMin: 15, lunch: null, maxLessonMin: 50, minLessonMin: 25,
    sameDay: 'forbid', lateAfterMin: null, studentMaxMinPerDay: 360, teacherMaxMinPerDay: 300 };
  const u = buildSchemaUnderlag(plan(), { ...request, villkor }), p = u.problem;
  assert.deepEqual(p.time, { step_min: 5, start_grid_min: 15, days: [...Array(4).fill({ start_min: 480, end_min: 990 }), { start_min: 510, end_min: 840 }] });
  assert.deepEqual(p.rules, { student_max_min_per_day: 360, break_min: 5, lunch: null, same_day: 'forbid' });
  assert.deepEqual([p.weights, p.teachers[0]], [{ late_after_min: null }, { id: 'larare-1', max_min_per_day: 300 }]);
  // 180 min i veckan i pass om högst 50 min: fyra pass om 45 min. 27 h på 18 veckor (90 min) blir två pass.
  assert.deepEqual(p.lessons.slice(0, 4).map(l => l.duration_min), [45, 45, 45, 45]);
  assert.equal(u.villkor, villkor);
  assert.deepEqual(buildSchemaUnderlag(plan(), request).problem.rules, { break_min: 10, lunch: { window_start_min: 630, window_end_min: 810, length_min: 40, teachers: true }, same_day: 'avoid' });
  // Fredagens kortare dag gäller också när en flytt prövas.
  assert.throws(() => checkSchemaPlacements([{ lesson: 'pass-1', day: 4, startMin: 480, room: null }], p));
  assert.deepEqual(checkSchemaPlacements([{ lesson: 'pass-1', day: 4, startMin: 510, room: null }], p).length, 1);
});

/** Egna villkor (05.2-SM-VILLKOR-PER-RESURS): salar och regler per klass, ämne, lärare och sal. */
const egna = [
  { slag: 'amne', ref: 'Idrott', typ: 'sal', rooms: ['Hallen'] },
  { slag: 'klass', ref: uid(10), typ: 'sparrad', days: [0], startMin: 480, endMin: 720 },
  { slag: 'larare', ref: uid(21), typ: 'tillaten', days: [0, 1, 2], startMin: 480, endMin: 900 },
  { slag: 'amne', ref: 'Matematik', typ: 'marginal', minutes: 20 },
  { slag: 'amne', ref: 'Svenska', typ: 'antal', count: 4 },
  { slag: 'klass', ref: uid(11), typ: 'langd', maxMin: 45 },
  { slag: 'sal', ref: 'Hallen', typ: 'sparrad', days: [4], startMin: 480, endMin: 990 },
  { slag: 'grupp', ref: uid(99), typ: 'marginal', minutes: 15 },
];
const medEgna = { ...defaultSchemaVillkor(), salar: ['Hallen', 'Sal A'], egna };

test('egna villkor prövas: bara tillåtna slag, salar som finns och värden inom gränserna', () => {
  assert.deepEqual(checkSchemaVillkor(medEgna), []);
  assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(medEgna))), medEgna);
  const broken = [{ ...egna[0], rooms: ['Okänd'] }, { ...egna[0], slag: 'sal', ref: 'Hallen' }, { ...egna[3], minutes: 7 }, { ...egna[4], count: 11 }, { ...egna[1], days: [] },
    { ...egna[1], startMin: 720, endMin: 480 }, { ...egna[6], ref: 'Okänd' }, { slag: 'sal', ref: 'Hallen', typ: 'marginal', minutes: 10 }];
  for (const r of broken) {
    assert.match(checkSchemaVillkor({ ...medEgna, egna: [r] })[0], /^Eget villkor 1: /u, JSON.stringify(r));
    assert.throws(() => parseSchemaVillkor({ ...medEgna, egna: [r] }), JSON.stringify(r));
  }
  assert.ok(checkSchemaVillkor({ ...medEgna, salar: ['Hallen', 'hallen'] }).length > 0);
  for (const odd of [{ ...egna[3], extra: 1 }, { ...egna[3], typ: 'annat' }, { slag: 'amne', ref: 'Matematik', typ: 'marginal' }, null])
    assert.throws(() => parseSchemaVillkor({ ...medEgna, egna: [odd] }));
});

test('egna villkor når motorn som fönster, salar, marginal och uppdelning; veckotiden är timplanens', () => {
  const data = plan(), req = { ...request, villkor: medEgna }, u = buildSchemaUnderlag(data, req), p = u.problem;
  const of = (title, cls) => p.lessons.filter((_, i) => u.labels.lessons[i].title === title && u.labels.lessons[i].classIds[0] === cls);
  const label = id => u.labels.lessons.find(l => l.id === id);
  // Salarna når motorn som löpnummer; hallen är spärrad på fredagar.
  assert.deepEqual(p.rooms, [{ id: 'sal-1', unavailable: [{ day: 4, start_min: 480, end_min: 990 }] }, { id: 'sal-2' }]);
  assert.deepEqual(u.labels.rooms, [{ id: 'sal-1', name: 'Hallen' }, { id: 'sal-2', name: 'Sal A' }]);
  assert.ok(!JSON.stringify(p).includes('Hallen'));
  // 1A är spärrad måndag förmiddag. Matematiken har 20 min marginal, tio utöver rasten: passet upptar 70 min men är 60.
  const ma = of('Matematik', 'grupp-1');
  assert.deepEqual(ma.map(l => [l.duration_min, label(l.id).durationMin, label(l.id).marginMin]), Array(3).fill([70, 60, 10]));
  assert.deepEqual(ma[0].allowed, [{ day: 0, start_min: 720, end_min: 990 }, ...[1, 2, 3, 4].map(day => ({ day, start_min: 480, end_min: 990 }))]);
  // Svenskan: fyra pass i stället för tre, samma 180 min. Läraren får bara mån–ons till 15.00, och klassens spärr gäller också.
  const sv = of('Svenska', 'grupp-1');
  assert.deepEqual(sv.map(l => l.duration_min), [45, 45, 45, 45]);
  assert.deepEqual(sv[0].allowed, [{ day: 0, start_min: 720, end_min: 900 }, { day: 1, start_min: 480, end_min: 900 }, { day: 2, start_min: 480, end_min: 900 }]);
  // 1B: pass om högst 45 min. Idrotten får hallen; övriga pass ingen sal.
  assert.deepEqual(of('Matematik', 'grupp-2').map(l => label(l.id).durationMin), [45, 45, 45, 45]);
  assert.deepEqual(of('Idrott', 'grupp-2').map(l => [l.rooms, label(l.id).roomIds]), Array(2).fill([{ count: 1, allowed: ['sal-1'] }, ['sal-1']]));
  assert.equal(ma[0].rooms, undefined);
  // Villkoret för en grupp som inte finns redovisas; veckotiden är densamma som utan egna villkor (T1).
  assert.deepEqual(u.egnaUtanTraff, [7]);
  const plain = buildSchemaUnderlag(data, request);
  assert.deepEqual(u.labels.activities.map(a => [a.title, a.weeklyMin]), plain.labels.activities.map(a => [a.title, a.weeklyMin]));
  assert.notEqual(u.fingerprint, plain.fingerprint);
  assert.deepEqual([u.resurser.klass.map(r => r.name), u.resurser.amne.map(r => r.ref), u.resurser.larare.length, u.resurser.grupp], [['1A', '1B'], ['Matematik', 'Svenska', 'Liten kurs', 'Okänt behov', 'Idrott'], 4, []]);

  // Motorn lägger idrotten i hallen; förslaget bär salens namn och följer timplanen när allt är lagt.
  const slots = p.lessons.map((l, i) => ({ lesson: l.id, day: i % 4, start_min: 720 + 60 * Math.floor(i / 4), rooms: l.rooms ? ['sal-1'] : [] }));
  const raw = { version: 1, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: slots, unplaced: [], diagnoses: [], metrics: { lessons: slots.length, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
  const forslag = schemaForslag(data, req, u, parseSchemaSolution(raw, p));
  assert.deepEqual(forslag.lessons.filter(l => l.title === 'Idrott').map(l => l.roomId), ['sal-1', 'sal-1']);
  assert.deepEqual([forslag.rooms, forslag.egnaUtanTraff, forslag.teachings.filter(t => t.deviation !== null)], [u.labels.rooms, [7], []]);
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), req), forslag);
  // Sal som passet inte får ha, eller utebliven sal, godtas inte från motorn.
  const idh = slots.findIndex(x => x.rooms.length > 0);
  for (const rooms of [[], ['sal-2'], ['sal-1', 'sal-2']]) assert.throws(() => parseSchemaSolution({ ...raw, placements: slots.map((x, i) => i === idh ? { ...x, rooms } : x) }, p));

  // Flytt för hand: passet behåller sin sal, får första lediga när ingen anges, och en otillåten sal nekas.
  const [a, b] = of('Idrott', 'grupp-2').map(l => l.id), at = (lesson, room, startMin = 720) => ({ lesson, day: 1, startMin, room });
  assert.deepEqual(checkSchemaPlacements([at(a, null)], p), [at(a, 'sal-1')]);
  assert.deepEqual(checkSchemaPlacements([at(a, 'sal-1'), at(b, null, 800)], p).map(x => x.room), ['sal-1', 'sal-1']);
  assert.throws(() => checkSchemaPlacements([at(a, 'sal-2')], p));
  assert.throws(() => checkSchemaPlacements([at(ma[0].id, 'sal-1')], p));
  const kontroll = schemaKontroll(u, checkSchemaPlacements([at(a, null)], p), { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  assert.deepEqual(kontroll.rooms, { [a]: 'sal-1' });
});

test('timplanen är ram: tillåten tid som inte rymmer passet ger ett pass utan plats, aldrig mindre undervisning', () => {
  const villkor = { ...defaultSchemaVillkor(), egna: [{ slag: 'amne', ref: 'Svenska', typ: 'tillaten', days: [0], startMin: 480, endMin: 500 }] };
  const u = buildSchemaUnderlag(plan(), { ...request, villkor }), sv = u.problem.lessons.filter((_, i) => u.labels.lessons[i].title === 'Svenska');
  // Passen finns kvar med timplanens längd; fönstret är för kort för något av dem.
  assert.deepEqual(sv.map(l => [l.duration_min, l.allowed]), Array(3).fill([60, [{ day: 0, start_min: 480, end_min: 485 }]]));
  assert.deepEqual(u.egnaUtanTraff, []);
});

test('tiden ska vara timplanens, uppåt bara till hela 5 minuter i veckan; annars avvikelse', () => {
  // HT 90 skoldagar, veckodagarna 17, 18, 18, 18 och 19 gånger. 54 h ger 180 min i veckan: tre pass om 60 min, tillåtet 3240–3329 min.
  const data = one(h(54), 0), time = timeWith({ span: HT, perWeekday: [17, 18, 18, 18, 19] }), u = buildSchemaUnderlag(data, request, { members: null, time }), p = u.problem;
  assert.deepEqual(p.lessons.map(l => l.duration_min), [60, 60, 60]);
  assert.deepEqual(p.activities[0].time, [{ weekday_days: [17, 18, 18, 18, 19], min_min: 3240, max_min: 3329 }]);
  const at = days => {
    const slots = p.lessons.map((l, i) => ({ lesson: l.id, day: days[i], start_min: 480, rooms: [] }));
    const raw = { version: 1, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: slots, unplaced: [], diagnoses: [], metrics: { lessons: slots.length, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
    const t = schemaForslag(data, request, u, parseSchemaSolution(raw, p)).teachings[0];
    return [t.deviation, t.plannedMin];
  };
  // Måndag–onsdag ger 3180 min: under timplanen. Tisdag–torsdag 3240 och onsdag–fredag 3300: inom avrundningen.
  assert.deepEqual([at([0, 1, 2]), at([1, 2, 3]), at([2, 3, 4])], [['calendar', 3180], [null, 3240], [null, 3300]]);
});

test('passlängderna väljs så att timplanens tid går att nå med någon fördelning på veckodagar', () => {
  const r = (perWeekday, min, max) => ({ perWeekday, min, max });
  assert.equal(reachable([60, 60], [r([17, 18, 18, 18, 17], 2150, 2160)]), true);
  assert.equal(reachable([60, 60], [r([17, 18, 18, 18, 17], 2170, 2200)]), false);
  // Veckodag utan skoldagar ger ingen tid och räknas inte.
  assert.equal(reachable([60], [r([0, 0, 0, 0, 18], 0, 2000)]), true);
  assert.equal(reachable([60], [r([0, 0, 0, 0, 0], 0, 2000)]), false);
  // Båda terminerna på en gång för pass som går hela läsåret.
  assert.equal(reachable([60], [r([18, 18, 18, 18, 18], 1080, 1080), r([20, 19, 20, 20, 20], 1140, 1140)]), true);
  assert.equal(reachable([60], [r([18, 18, 18, 18, 18], 1080, 1080), r([20, 19, 20, 20, 20], 1170, 1170)]), false);
  // En enda lång vecka: 120 min på 17 eller 18 dagar ger 2040 eller 2160, inte 2050–2137; två pass om 60 min ger 2100.
  const v = { ...defaultSchemaVillkor(), maxLessonMin: 120, minLessonMin: 20 };
  const data = one(2050, 0), time = timeWith({ span: HT, perWeekday: [17, 18, 18, 17, 18] }), u = buildSchemaUnderlag(data, { ...request, villkor: v }, { members: null, time });
  assert.equal(reachable([120], [r([17, 18, 18, 17, 18], 2050, 2136)]), false);
  assert.deepEqual([u.problem.lessons.map(l => l.duration_min), u.labels.activities[0].weeklyOff], [[60, 60], false]);
});
