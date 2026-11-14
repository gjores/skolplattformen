import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, defaultSchemaTime, mergeSchemaMembers, reachable, schemaForslag, schemaKontroll, schemaProvUnderlag, weeklyLessons } from './schema-underlag.ts';
import { schemaTime } from './schema-kalender.ts';
import { checkSchemaPlacements, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaVillkor, parseSchemaCheck, parseSchemaForslag, parseSchemaForslagRequest, parseSchemaKontroll, parseSchemaKontrollRequest, parseSchemaSolution, sammaGrund, schemaGrund, villkorNyckel } from './schema-contract.ts';

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
/** Veckor som stämmer med skoldagarna per veckodag: veckodagen har skoldag de första n veckorna. */
const weeksOf = (perWeekday, classes = {}) => Array.from({ length: Math.max(...perWeekday, ...Object.values(classes).flat()) }, (_, w) => ({ monday: null, label: `Vecka ${w + 1}`,
  perWeekday: perWeekday.map(n => w < n ? 1 : 0), classes: Object.fromEntries(Object.entries(classes).map(([id, row]) => [id, row.map(n => w < n ? 1 : 0)])) }));
const termWith = (base, extra) => { const t = { ...base, ...extra }; return extra.perWeekday || extra.classes ? { ...t, weeks: weeksOf(t.perWeekday, t.classes) } : t; };
const timeWith = (ht = {}, vt = {}) => { const t = defaultSchemaTime(); return { ...t, terms: { ht: termWith(t.terms.ht, ht), vt: termWith(t.terms.vt, vt) } }; };
/** Undervisningens tid utan veckolistorna; summan av veckorna prövas för sig. */
const core = ({ perWeek, trimPerWeek, ...rest }) => { assert.equal(perWeek.reduce((n, x) => n + x, 0), rest.plannedMin); assert.equal(trimPerWeek.reduce((n, x) => n + x, 0), rest.terms.reduce((n, x) => n + x.trimmedMin, 0)); return rest; };
const term = (t, needMin, baseMin, trimmedMin = 0, trimmedCount = 0) => ({ term: t, needMin, maxMin: Math.ceil(needMin / 5) * 5, baseMin, plannedMin: baseMin - trimmedMin, trimmedMin, trimmedCount });

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
  assert.equal(problem.version, 2);
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
  const { weeks, ...ht } = time.terms.ht;
  assert.deepEqual(ht, { span: HT, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(10)]: [17, 18, 17, 18, 18], [uid(11)]: [17, 18, 17, 17, 18] } });
  // Vecka för vecka (05.2-SM-TIMPLAN-VECKA, W1): höstlovets måndag och studiedagens onsdag saknas; 1B har dessutom friluftsdag torsdag vecka 46.
  assert.deepEqual([weeks.length, weeks[0].label, weeks[0].monday], [18, 'v. 34', '2026-08-17']);
  assert.deepEqual(weeks.find(w => w.label === 'v. 44').perWeekday, [0, 1, 1, 1, 1]);
  const v46 = weeks.find(w => w.label === 'v. 46');
  assert.deepEqual([v46.perWeekday, v46.classes[uid(10)], v46.classes[uid(11)]], [[1, 1, 0, 1, 1], [1, 1, 0, 1, 1], [1, 1, 0, 0, 1]]);
  assert.deepEqual([0, 1, 2, 3, 4].map(d => weeks.reduce((n, w) => n + w.classes[uid(11)][d], 0)), ht.classes[uid(11)]);
  // VT 11 januari–11 juni utan lov i provkalendern: 22 veckor minus långfredag, annandag påsk och Kristi himmelsfärdsdag.
  const vt = [21, 22, 22, 21, 21], { weeks: vtWeeks, ...vtRest } = time.terms.vt;
  assert.deepEqual(vtRest, { span: { start: '2027-01-11', end: '2027-06-11' }, perWeekday: vt, classes: { [uid(10)]: vt, [uid(11)]: vt } });
  assert.deepEqual([0, 1, 2, 3, 4].map(d => vtWeeks.reduce((n, w) => n + w.perWeekday[d], 0)), vt);
  assert.equal(schemaTime(lasar({ versions: [] }), []).current, false);
  assert.deepEqual(schemaTime(null, [uid(10)]), defaultSchemaTime());
  assert.deepEqual(schemaTime(lasar({ calendar: null }), []), defaultSchemaTime());
  assert.deepEqual([defaultSchemaTime().terms.ht.perWeekday, defaultSchemaTime().terms.vt.perWeekday], [[18, 18, 18, 18, 18], [20, 20, 20, 20, 20]]);
});

test('utlagd tid är passens längd gånger skoldagarna på passets veckodag; klass utan skoldagar får inga pass', () => {
  const only = extra => plan({ classes: [{ classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik')] }], rows: [], ...extra });
  const time = { ...timeWith({ span: HT, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(11)]: [17, 18, 17, 17, 0] } }), source: 'kalender', version: 2, status: 'utkast' };
  const data = only(), underlag = buildSchemaUnderlag(data, request, { members: null, time });
  // 54 h på 69 skoldagar fördelade på fyra veckodagar = 17,25 veckor: 187,8 min i veckan, uppåt till 190 (E1). För att tiden ska räcka även om
  // alla pass hamnar på en dag med 17 skoldagar behövs 195 min (W2): 195 × 17 = 3315.
  assert.deepEqual(underlag.problem.lessons.map(l => l.duration_min), [65, 65, 65]);
  // Den övre gränsen är det mesta passen kan ge, 195 min gånger 18. Fredag saknar skoldagar för 1B: där får inget pass ligga (W1).
  assert.deepEqual(underlag.problem.activities[0].time, [{ weekday_days: [17, 18, 17, 17, 0], min_min: 3240, max_min: 195 * 18 }]);
  assert.deepEqual(underlag.problem.lessons[0].allowed.map(w => w.day), [0, 1, 2, 3]);
  const forslag = schemaForslag(data, request, underlag, parseSchemaSolution(solved(underlag.problem), underlag.problem));
  // pass-1 är olagt, pass-2 ligger på tisdag (18 skoldagar) och pass-3 på onsdag (17).
  assert.deepEqual(forslag.teachings.map(core), [{ title: 'Matematik', classes: ['1B'], needMin: h(54), weeklyMin: 195, plannedMin: 65 * 18 + 65 * 17, unplaced: 1,
    terms: [term('ht', h(54), 65 * 18 + 65 * 17)], deviation: 'unplaced' }]);
  assert.deepEqual(forslag.time, { source: 'kalender', version: 2, status: 'utkast', current: false, schoolDays: 88, weeks: 17.6, terms: [{ term: 'ht', schoolDays: 88 }],
    weekLabels: Array.from({ length: 18 }, (_, i) => `Vecka ${i + 1}`) });
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  const none = buildSchemaUnderlag(data, request, { members: null, time: timeWith({ span: HT, classes: { [uid(11)]: [0, 0, 0, 0, 0] } }) });
  assert.deepEqual([none.problem.lessons.length, none.omitted], [0, [{ title: 'Matematik', classes: ['1B'], reason: 'no_days' }]]);
});

function solved(problem, extra = {}) {
  const slots = problem.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, start_min: 480 + 90 * Math.floor(i / 5), rooms: [] }));
  return { version: 2, problem_id: problem.id, problem_hash: 'x', status: 'time_limit', placements: slots.slice(1), unplaced: [slots[0].lesson],
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
  assert.deepEqual(forslag.time, { source: 'forval', version: null, status: null, current: false, schoolDays: 90, weeks: 18, terms: [{ term: 'ht', schoolDays: 90 }],
    weekLabels: Array.from({ length: 18 }, (_, i) => `Vecka ${i + 1}`) });
  assert.deepEqual(forslag.members, { pupils: 0, groupsWithoutMembers: [], classesWithoutPupils: ['1A', '1B'], withoutChoice: [] });
  assert.equal(forslag.teachings.find(t => t.title === 'Svenska').needMin, h(54));
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request), forslag);
  assert.throws(() => parseSchemaForslag(forslag, { ...request, period: 'vt' }));
  assert.throws(() => parseSchemaForslag(forslag, { ...request, villkor: { ...request.villkor, breakMin: 5 } }));

  const p = underlag.problem, first = raw.placements[0];
  for (const broken of [
    { problem_id: 'annat' }, { version: 1 }, { status: 'klart' },
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
  const body = { contractVersion: 3, ...request, grundFingerprint: underlag.grundFingerprint, placements };
  assert.deepEqual(parseSchemaKontrollRequest(body), body);
  for (const broken of [{ ...body, grundFingerprint: 'x' }, { ...body, contractVersion: 2 }, { ...body, fingerprint: underlag.fingerprint }, { ...body, extra: 1 }, { ...body, placements: [{ ...placements[0], rooms: [] }] }, { ...body, placements: [{ ...placements[0], day: 1.5 }] }, { ...body, placements: [{ ...placements[0], room: 'Idrottshallen' }] }, { ...body, placements: [{ lesson: 'pass-1', day: 0, startMin: 480 }] }, { ...request, placements }])
    assert.throws(() => parseSchemaKontrollRequest(broken));
  assert.deepEqual(checkSchemaPlacements(placements, p), placements);
  // Okänt pass, samma pass två gånger, dag som inte finns och tid som inte ryms i dygnet stoppas innan motorn anropas. Tid utanför skoldagen redovisas
  // av kontrollanten (`outside_day`), eftersom skoldagen är ett tidsvillkor som kan ha ändrats efter förslaget (05.2-SM-VILLKOR-DIREKT).
  for (const broken of [[{ ...placements[0], lesson: 'pass-999' }], [placements[0], placements[0]], [{ ...placements[0], day: 5 }], [{ ...placements[0], startMin: 1440 - 55 }]])
    assert.throws(() => checkSchemaPlacements(broken, p));
  for (const ok of [[{ ...placements[0], startMin: 475 }], [{ ...placements[0], startMin: 16 * 60 + 30 - 55 }]]) assert.deepEqual(checkSchemaPlacements(ok, p), ok);

  const reply = { version: 2, problem_id: p.id, violations: [
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
  assert.deepEqual(core(kontroll.teachings.find(t => t.title === 'Matematik' && t.classes[0] === '1A')), { title: 'Matematik', classes: ['1A'], needMin: h(54), weeklyMin: 180, plannedMin: 2 * 60 * 18, unplaced: 1,
    terms: [term('ht', h(54), 2 * 60 * 18)], deviation: 'unplaced' });
  assert.deepEqual(kontroll.rooms, {});
  assert.deepEqual([kontroll.contractVersion, kontroll.grundFingerprint, kontroll.fingerprint], [3, underlag.grundFingerprint, underlag.fingerprint]);
  assert.deepEqual(parseSchemaKontroll(JSON.parse(JSON.stringify(kontroll)), underlag.grundFingerprint), kontroll);
  assert.throws(() => parseSchemaKontroll(kontroll, '0'.repeat(28)));
  for (const broken of [{ ...kontroll, contractVersion: 2 }, { ...kontroll, fingerprint: 'x' }]) assert.throws(() => parseSchemaKontroll(broken, underlag.grundFingerprint));
  for (const broken of [{ ...reply, problem_id: 'annat' }, { ...reply, version: 1 }, { ...reply, violations: [{ ...reply.violations[0], lessons: ['pass-999'] }] }, { ...reply, metrics: {} }])
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
  assert.deepEqual(u.problem.activities[0].time, [{ period: 'ht', weekday_days: [18, 18, 18, 18, 18], min_min: h(54), max_min: 180 * 18 },
    { period: 'vt', weekday_days: [20, 20, 20, 20, 20], min_min: h(54), max_min: 165 * 20 }]);
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
  assert.deepEqual(forslag.teachings.map(core), [{ title: 'Matematik', classes: ['1A'], needMin: h(114), weeklyMin: 180, plannedMin: 2 * 60 * 38, unplaced: 1,
    terms: [term('ht', h(54), 2 * 60 * 18), term('vt', h(60), 2 * 60 * 20)], deviation: 'unplaced' }]);
  // Veckorna: HT:s 18 och VT:s 20 efter varandra, två pass om 60 min i varje.
  assert.deepEqual(forslag.teachings[0].perWeek, Array(38).fill(120));
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
  // Fredagens kortare dag gäller också när en flytt prövas: kontrollanten redovisar ett pass före 08:30 som utanför skoldagen (`outside_day`, motorns prov).
  assert.deepEqual(p.time.days[4], { start_min: 510, end_min: 840 });
  assert.deepEqual(checkSchemaPlacements([{ lesson: 'pass-1', day: 4, startMin: 480, room: null }], p).length, 1);
});

/** Egna villkor (05.2-SM-VILLKOR-PER-RESURS): salar och regler per klass, ämne, lärare och sal. */
const egna = [
  { slag: 'amne', ref: 'Idrott', typ: 'sal', rooms: ['Hallen'] },
  { slag: 'klass', ref: uid(10), typ: 'sparrad', days: [0], startMin: 480, endMin: 720 },
  { slag: 'larare', ref: uid(21), typ: 'tillaten', days: [0, 1, 2], startMin: 480, endMin: 900 },
  { slag: 'amne', ref: 'Matematik', typ: 'marginal', beforeMin: 0, afterMin: 20, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' },
  { slag: 'amne', ref: 'Svenska', typ: 'antal', count: 4 },
  { slag: 'klass', ref: uid(11), typ: 'langd', maxMin: 45 },
  { slag: 'sal', ref: 'Hallen', typ: 'sparrad', days: [4], startMin: 480, endMin: 990 },
  { slag: 'grupp', ref: uid(99), typ: 'marginal', beforeMin: 0, afterMin: 15, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' },
];
const medEgna = { ...defaultSchemaVillkor(), salar: ['Hallen', 'Sal A'], egna };

test('egna villkor prövas: bara tillåtna slag, salar som finns och värden inom gränserna', () => {
  assert.deepEqual(checkSchemaVillkor(medEgna), []);
  assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(medEgna))), medEgna);
  const broken = [{ ...egna[0], rooms: ['Okänd'] }, { ...egna[0], slag: 'sal', ref: 'Hallen' }, { ...egna[3], afterMin: 7 }, { ...egna[3], afterMin: 0 }, { ...egna[3], occupies: [] }, { ...egna[3], label: '' }, { ...egna[3], when: 'vid_byte' }, { ...egna[4], count: 11 }, { ...egna[1], days: [] },
    { ...egna[1], startMin: 720, endMin: 480 }, { ...egna[6], ref: 'Okänd' }, { ...egna[3], slag: 'sal', ref: 'Okänd' }];
  for (const r of broken) {
    assert.match(checkSchemaVillkor({ ...medEgna, egna: [r] })[0], /^Eget villkor 1: /u, JSON.stringify(r));
    assert.throws(() => parseSchemaVillkor({ ...medEgna, egna: [r] }), JSON.stringify(r));
  }
  assert.ok(checkSchemaVillkor({ ...medEgna, salar: ['Hallen', 'hallen'] }).length > 0);
  for (const odd of [{ ...egna[3], extra: 1 }, { ...egna[3], typ: 'annat' }, { slag: 'amne', ref: 'Matematik', typ: 'marginal' }, { slag: 'amne', ref: 'Matematik', typ: 'marginal', minutes: 20 }, null])
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
  // 1A är spärrad måndag förmiddag. Matematiken har 20 min marginal efter passet (05.2-SM-MARGINAL): passet är 60 min och marginalen följer med för elever och lärare.
  const ma = of('Matematik', 'grupp-1');
  assert.deepEqual(ma.map(l => [l.duration_min, l.counted_min, l.margin, label(l.id).durationMin, label(l.id).marginMin, label(l.id).marginBeforeMin]),
    Array(3).fill([60, undefined, { students: { before_min: 0, after_min: 20 }, teachers: { before_min: 0, after_min: 20 }, rooms: { before_min: 0, after_min: 0 } }, 60, 20, 0]));
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
  const raw = { version: 2, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: slots, unplaced: [], diagnoses: [], metrics: { lessons: slots.length, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
  const forslag = schemaForslag(data, req, u, parseSchemaSolution(raw, p));
  assert.deepEqual(forslag.lessons.filter(l => l.title === 'Idrott').map(l => l.roomId), ['sal-1', 'sal-1']);
  assert.deepEqual([forslag.rooms, forslag.egnaUtanTraff, forslag.teachings.filter(t => t.deviation !== null)], [u.labels.rooms, [7], []]);
  assert.deepEqual(parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), req), forslag);
  // Sal som passet inte får ha, eller utebliven sal, godtas inte från motorn.
  const idh = slots.findIndex(x => x.rooms.length > 0);
  for (const rooms of [[], ['sal-2'], ['sal-1', 'sal-2']]) assert.throws(() => parseSchemaSolution({ ...raw, placements: slots.map((x, i) => i === idh ? { ...x, rooms } : x) }, p));

  // Flytt för hand: passet behåller sin sal och får första lediga när ingen anges. En sal passet inte längre får ha (salvillkoret har ändrats efter förslaget,
  // 05.2-SM-VILLKOR-DIREKT) släpps: passet får en tillåten sal, och ett pass utan salkrav ingen.
  const [a, b] = of('Idrott', 'grupp-2').map(l => l.id), at = (lesson, room, startMin = 720) => ({ lesson, day: 1, startMin, room });
  assert.deepEqual(checkSchemaPlacements([at(a, null)], p), [at(a, 'sal-1')]);
  assert.deepEqual(checkSchemaPlacements([at(a, 'sal-1'), at(b, null, 800)], p).map(x => x.room), ['sal-1', 'sal-1']);
  assert.deepEqual(checkSchemaPlacements([at(a, 'sal-2')], p), [at(a, 'sal-1')]);
  assert.deepEqual(checkSchemaPlacements([at(ma[0].id, 'sal-1')], p), [at(ma[0].id, null)]);
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

test('överskottet justeras tillfälle för tillfälle till timplanens tid', () => {
  // HT 90 skoldagar, veckodagarna 17, 18, 18, 18 och 19 gånger. 54 h ger 180 min i veckan, men på tre måndagar (17) bara 3060 min:
  // 195 min i veckan räcker var passen än ligger (195 × 17 = 3315), tre pass om 65 min.
  const data = one(h(54), 0), time = timeWith({ span: HT, perWeekday: [17, 18, 18, 18, 19] }), u = buildSchemaUnderlag(data, request, { members: null, time }), p = u.problem;
  assert.deepEqual(p.lessons.map(l => l.duration_min), [65, 65, 65]);
  assert.deepEqual(p.activities[0].time, [{ weekday_days: [17, 18, 18, 18, 19], min_min: 3240, max_min: 195 * 19 }]);
  const at = days => {
    const slots = p.lessons.map((l, i) => ({ lesson: l.id, day: days[i], start_min: 480, rooms: [] }));
    const raw = { version: 2, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: slots, unplaced: [], diagnoses: [], metrics: { lessons: slots.length, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
    const t = schemaForslag(data, request, u, parseSchemaSolution(raw, p)).teachings[0];
    return [t.deviation, t.plannedMin, t.terms[0].trimmedCount, t.trimPerWeek.filter(n => n > 0).length, new Set(t.perWeek.slice(0, 17)).size];
  };
  // Alltid exakt timplanens 3240 min. Tisdag–torsdag ger 3510: alla tre passen blir 5 minuter kortare hela terminen, och varje hel vecka får 180 min.
  // Måndag–onsdag ger 3445: måndagens och tisdagens pass kortas hela terminen och de sista 30 min sprids, så veckorna får 180 eller 185 min.
  // Onsdag–fredag ger 3575: alla tre kortas och 60 min sprids.
  assert.deepEqual([at([0, 1, 2]), at([1, 2, 3]), at([2, 3, 4])], [[null, 3240, 35, 18, 2], [null, 3240, 54, 18, 1], [null, 3240, 55, 19, 2]]);
  // Per pass för veckoschemat: tisdag–torsdag kortas alla tre 5 minuter alla veckor; måndag–onsdag kortas måndag och tisdag hela terminen
  // och de sista 30 minuterna fördelas på enskilda tillfällen.
  const trimsAt = days => {
    const slots = p.lessons.map((l, i) => ({ lesson: l.id, day: days[i], start_min: 480, rooms: [] }));
    const raw = { version: 2, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: slots, unplaced: [], diagnoses: [], metrics: { lessons: slots.length, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
    return schemaForslag(data, request, u, parseSchemaSolution(raw, p)).trims;
  };
  assert.deepEqual(trimsAt([1, 2, 3]), p.lessons.map(l => ({ lesson: l.id, term: 'ht', fixedMin: 5, extraCount: 0, extraMin: 0 })));
  const mixed = trimsAt([0, 1, 2]);
  assert.deepEqual(mixed.map(x => [x.lesson, x.fixedMin]), [[p.lessons[0].id, 5], [p.lessons[1].id, 5]]);
  assert.equal(mixed.reduce((n, x) => n + x.extraMin, 0), 30);
});

test('passlängderna ska kunna ge minst timplanens tid med någon fördelning på veckodagar', () => {
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
  // Tiden ska räcka även på en dag med 17 skoldagar (W2): 120 × 17 = 2040 räcker inte, 125 min i veckan gör det (2125). Passen högst 120 min.
  assert.deepEqual([u.problem.lessons.map(l => l.duration_min), u.labels.activities[0].weeklyOff], [[65, 60], false]);
});

test('justeringen sprids jämnt över veckorna och kortar aldrig ett tillfälle under kortaste passlängd', () => {
  // 20 veckor med ett pass om 25 min: 500 min mot timplanens 410. 18 steg om 5 min behövs, men varje tillfälle får bara kortas till 20 min.
  const data = one(410, 0), time = timeWith({ span: HT, perWeekday: [20, 20, 20, 20, 20] }), u = buildSchemaUnderlag(data, request, { members: null, time }), p = u.problem;
  assert.deepEqual(p.lessons.map(l => l.duration_min), [25]);
  const raw = { version: 2, problem_id: p.id, problem_hash: 'x', status: 'complete', placements: [{ lesson: p.lessons[0].id, day: 2, start_min: 480, rooms: [] }], unplaced: [], diagnoses: [],
    metrics: { lessons: 1, student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 1 } };
  const t = schemaForslag(data, request, u, parseSchemaSolution(raw, p)).teachings[0];
  assert.deepEqual([t.terms[0].baseMin, t.plannedMin, t.terms[0].trimmedCount, t.deviation], [500, 410, 18, null]);
  // Två veckor av tjugo kortas inte: de ligger utspridda, inte sist.
  assert.deepEqual(t.trimPerWeek.map((n, w) => n ? null : w).filter(w => w !== null).length, 2);
  assert.ok(t.trimPerWeek.slice(0, 10).some(n => n > 0) && t.trimPerWeek.slice(10).some(n => n > 0));
  // Med kortaste pass 25 min går inget att korta: tiden blir över timplanen och redovisas.
  const strict = { ...request, villkor: { ...defaultSchemaVillkor(), minLessonMin: 25 } }, u2 = buildSchemaUnderlag(data, strict, { members: null, time });
  const t2 = schemaForslag(data, strict, u2, parseSchemaSolution({ ...raw, problem_id: u2.problem.id }, u2.problem)).teachings[0];
  assert.deepEqual([t2.plannedMin, t2.deviation], [500, 'calendar']);
});

/** Marginal före och efter pass (05.2-SM-MARGINAL): sammanslagning per pass, gamla villkor och timplanens tid. */
test('marginaler slås ihop per pass och part, når motorn utan att ändra passens längd, och gamla R4-villkor läses', async () => {
  const { lasGammalMarginal, passMarginal } = await import('./schema-marginal.ts');
  const m = (slag, ref, beforeMin, afterMin, occupies, label) => ({ slag, ref, typ: 'marginal', beforeMin, afterMin, occupies, label, visibleFor: ['elever'], when: 'alltid' });
  const egna = [{ slag: 'amne', ref: 'Idrott', typ: 'sal', rooms: ['Hallen'] }, m('amne', 'Idrott', 10, 15, ['elever'], 'Omklädning före, dusch efter'),
    m('sal', 'Hallen', 0, 10, ['sal'], 'Städning'), m('klass', uid(11), 5, 20, ['elever', 'larare'], 'Övergång'), m('pass', 'pass-1', 5, 0, ['elever', 'larare'], 'Övergång')];
  const villkor = { ...defaultSchemaVillkor(), salar: ['Hallen'], egna }, plain = buildSchemaUnderlag(plan(), request), u = buildSchemaUnderlag(plan(), { ...request, villkor });
  assert.deepEqual(checkSchemaVillkor(villkor), []);
  const idx = u.labels.lessons.findIndex(l => l.title === 'Idrott' && l.classIds[0] === 'grupp-2'), idh = u.problem.lessons[idx];
  // Den största marginalen gäller per sida och part: eleverna 10 före (ämnet) och 20 efter (klassen), salen 10 efter. Idrotten saknar lärare, så lärarens marginal är noll.
  assert.deepEqual(u.labels.lessons[idx].teacherIds, []);
  assert.deepEqual(idh.margin, { students: { before_min: 10, after_min: 20 }, teachers: { before_min: 0, after_min: 0 }, rooms: { before_min: 0, after_min: 10 } });
  // Ett pass med lärare: marginalen som upptar läraren når lärarens del.
  assert.deepEqual([u.labels.lessons[0].teacherIds.length > 0, u.problem.lessons[0].margin.teachers], [true, { before_min: 5, after_min: 0 }]);
  assert.deepEqual([u.labels.lessons[idx].marginBeforeMin, u.labels.lessons[idx].marginMin], [10, 20]);
  // Ett enskilt pass och dess marginal; alla villkor träffade något.
  assert.deepEqual(u.problem.lessons[0].margin.students, { before_min: 5, after_min: 0 });
  assert.deepEqual(u.egnaUtanTraff, []);
  // Marginalen räknas aldrig som undervisning: passens längd, veckotid och timplanens tid är desamma som utan marginal.
  assert.ok(u.problem.lessons.every((l, i) => l.duration_min === u.labels.lessons[i].durationMin && l.counted_min === undefined));
  assert.deepEqual(u.problem.lessons.map(l => l.duration_min), plain.problem.lessons.map(l => l.duration_min));
  assert.deepEqual(u.problem.activities, plain.problem.activities);
  assert.deepEqual(u.labels.activities.map(a => [a.weeklyMin, a.terms]), plain.labels.activities.map(a => [a.weeklyMin, a.terms]));
  // Utan marginal skickas inget fält, och passen får namn för villkor på ett pass.
  assert.ok(plain.problem.lessons.every(l => !('margin' in l)));
  assert.match(u.resurser.pass[0].name, /^Matematik, 1A, pass 1$/u);
  // Sammanslagningen för sig: den största per sida, texten från den som ger tiden.
  assert.deepEqual(passMarginal([m('amne', 'x', 10, 5, ['elever'], 'Restid'), m('klass', 'y', 5, 15, ['elever', 'sal'], 'Omklädning före, dusch efter')]).elever,
    { fore: 10, efter: 15, foreLabel: 'Restid', efterLabel: 'Dusch' });
  // Gamla villkor i webbläsaren: marginal till nästa lektion blir marginal efter passet som upptar alla och heter Övergång.
  const gammal = { slag: 'amne', ref: 'Matematik', typ: 'marginal', minutes: 20 };
  assert.deepEqual(lasGammalMarginal(gammal), { slag: 'amne', ref: 'Matematik', typ: 'marginal', beforeMin: 0, afterMin: 20, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' });
  assert.throws(() => parseSchemaVillkor({ ...defaultSchemaVillkor(), egna: [gammal] }));
  assert.deepEqual(parseSchemaVillkor({ ...defaultSchemaVillkor(), egna: [lasGammalMarginal(gammal)] }).egna[0].afterMin, 20);
  assert.equal(lasGammalMarginal(egna[0]), egna[0]);
});

/**
 * Grund och tidsvillkor (05.2-SM-VILLKOR-DIREKT, beslut B 2026-11-14). Varje fält i villkoren och varje typ av eget villkor är klassad; ett tidsvillkor
 * får inte ändra passens ID, aktivitet, längd, lärare, grupper eller termin, och grunden ska ändra grundens fingeravtryck.
 */
const passen = u => u.problem.lessons.map(l => [l.id, l.activity, l.duration_min, l.teachers, l.groups, l.periods ?? null]);
const passensNamn = u => u.labels.lessons.map(l => [l.id, l.title, l.classIds, l.teacherIds, l.durationMin, l.vacant, l.term]);
const marginal = { slag: 'amne', ref: 'Matematik', typ: 'marginal', beforeMin: 0, afterMin: 20, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' };
const grundVillkor = { ...defaultSchemaVillkor(), salar: ['Hallen', 'Sal A'] };
/** Varje fält i `SchemaVillkor` och varje typ av eget villkor, med en ändring som gör skillnad i underlaget. */
const TIDSVILLKOR = {
  days: { days: grundVillkor.days.map((x, i) => i === 4 ? { startMin: 510, endMin: 840 } : x) },
  breakMin: { breakMin: 5 }, startGridMin: { startGridMin: 15 }, lunch: { lunch: null }, lunchfonster: { lunch: { ...grundVillkor.lunch, lengthMin: 30, teachers: false } },
  sameDay: { sameDay: 'forbid' }, lateAfterMin: { lateAfterMin: null }, studentMaxMinPerDay: { studentMaxMinPerDay: 360 }, teacherMaxMinPerDay: { teacherMaxMinPerDay: 300 },
  'egna sparrad': { egna: [{ slag: 'klass', ref: uid(10), typ: 'sparrad', days: [3], startMin: 840, endMin: 990 }] },
  'egna sparrad för sal': { egna: [{ slag: 'sal', ref: 'Hallen', typ: 'sparrad', days: [4], startMin: 480, endMin: 990 }] },
  'egna tillaten': { egna: [{ slag: 'larare', ref: uid(21), typ: 'tillaten', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 900 }] },
  'egna sal': { egna: [{ slag: 'amne', ref: 'Idrott', typ: 'sal', rooms: ['Hallen'] }] },
  'egna marginal': { egna: [marginal] },
};
const GRUND = {
  maxLessonMin: { maxLessonMin: 50 }, minLessonMin: { minLessonMin: 10 }, salar: { salar: ['Hallen', 'Sal A', 'Sal B'] },
  'egna langd': { egna: [{ slag: 'amne', ref: 'Matematik', typ: 'langd', maxMin: 45 }] }, 'egna antal': { egna: [{ slag: 'amne', ref: 'Svenska', typ: 'antal', count: 4 }] },
};

test('grund och tidsvillkor: varje fält och varje eget villkor är klassat', () => {
  const falt = Object.keys(defaultSchemaVillkor()).filter(k => k !== 'egna'), typer = ['sparrad', 'tillaten', 'marginal', 'langd', 'antal', 'sal'];
  const klassat = Object.keys({ ...TIDSVILLKOR, ...GRUND }).map(k => k === 'lunchfonster' ? 'lunch' : k);
  assert.deepEqual(falt.filter(k => !klassat.includes(k)), [], 'fält utan klassning');
  assert.deepEqual(typer.filter(t => !klassat.some(k => k === `egna ${t}`)), [], 'eget villkor utan klassning');
  assert.deepEqual(Object.keys(schemaGrund(grundVillkor)), ['maxLessonMin', 'minLessonMin', 'salar', 'egna']);
  assert.deepEqual(schemaGrund({ ...grundVillkor, egna: [marginal, ...GRUND['egna langd'].egna, ...TIDSVILLKOR['egna sal'].egna] }).egna, GRUND['egna langd'].egna);
  // Jämförelsen bryr sig inte om fältens ordning, som servern efter tolkning.
  assert.equal(villkorNyckel({ b: 1, a: [{ d: 2, c: 3 }] }), villkorNyckel({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('tidsvillkor ändrar fingeravtrycket men inte grunden: passens ID, längder och deltagare är desamma och servern prövar villkoret', () => {
  const req = { ...request, villkor: grundVillkor }, base = buildSchemaUnderlag(plan(), req);
  assert.match(base.grundFingerprint, /^[0-9a-f]{28}$/u);
  assert.notEqual(base.grundFingerprint, base.fingerprint);
  for (const [namn, change] of Object.entries(TIDSVILLKOR)) {
    const villkor = { ...grundVillkor, ...change };
    assert.deepEqual(checkSchemaVillkor(villkor), [], namn);
    const u = buildSchemaUnderlag(plan(), { ...req, villkor });
    assert.notEqual(u.fingerprint, base.fingerprint, `${namn}: villkoret når inte underlaget`);
    assert.equal(u.grundFingerprint, base.grundFingerprint, `${namn}: grunden ändrades`);
    assert.deepEqual(passen(u), passen(base), namn);
    assert.deepEqual(passensNamn(u), passensNamn(base), namn);
    assert.ok(sammaGrund(villkor, grundVillkor), namn);
    // Rutterna: samma grund ger underlaget byggt med de nya villkoren (200), inte 409.
    assert.equal(schemaProvUnderlag(plan(), { ...req, villkor, grundFingerprint: base.grundFingerprint })?.fingerprint, u.fingerprint, namn);
  }
  // En ny spärr når motorn som tillåtna fönster utan spärren, för passen den gäller.
  const sparr = buildSchemaUnderlag(plan(), { ...req, villkor: { ...grundVillkor, ...TIDSVILLKOR['egna sparrad'] } });
  const klass1A = sparr.problem.lessons.filter((_, i) => sparr.labels.lessons[i].classIds.includes('grupp-1'));
  assert.ok(klass1A.length && klass1A.every(l => l.allowed.some(w => w.day === 3) && l.allowed.filter(w => w.day === 3).every(w => w.end_min <= 840) && l.allowed.some(w => w.day === 0 && w.end_min === 990)));
  assert.ok(base.problem.lessons.every(l => !l.allowed));
});

test('grunden ändrar båda fingeravtrycken och kräver ett nytt förslag (409)', () => {
  const req = { ...request, villkor: grundVillkor }, base = buildSchemaUnderlag(plan(), req);
  for (const [namn, change] of Object.entries(GRUND)) {
    const villkor = { ...grundVillkor, ...change };
    assert.deepEqual(checkSchemaVillkor(villkor), [], namn);
    const u = buildSchemaUnderlag(plan(), { ...req, villkor });
    assert.notEqual(u.fingerprint, base.fingerprint, namn);
    assert.notEqual(u.grundFingerprint, base.grundFingerprint, namn);
    assert.equal(sammaGrund(villkor, grundVillkor), false, namn);
    assert.equal(schemaProvUnderlag(plan(), { ...req, villkor, grundFingerprint: base.grundFingerprint }), null, namn);
  }
  // Passen ändras av längsta och kortaste pass, passlängd och antal; salarna ändrar salarnas löpnummer.
  for (const namn of ['maxLessonMin', 'minLessonMin', 'egna langd', 'egna antal'])
    assert.notDeepEqual(passen(buildSchemaUnderlag(plan(), { ...req, villkor: { ...grundVillkor, ...GRUND[namn] } })), passen(base), namn);
  // Ändrad tjänstefördelning ändrar också grunden, som förut.
  assert.notEqual(buildSchemaUnderlag(plan({ rows: [row(30, classKey(10, 'ma'), uid(23))] }), req).grundFingerprint, base.grundFingerprint);
});

test('avvikelse från planens klassning: tidsvillkor som stänger hela veckodagar kan ändra passens längd, och grunden fångar det', () => {
  // Måndagen har 17 skoldagar, övriga 18. Matematik i 1A (54 h) behöver 65-minuterspass om motorn kan välja måndagen, men kortare räcker när klassen är spärrad
  // hela måndagen: underlaget väljer längderna efter veckodagarna där passen kan ligga (W1–W2). Spärren är ett tidsvillkor men ändrar passen;
  // grundens fingeravtryck räknas därför på underlaget med villkoren, och rutten svarar 409 (arbetsytan säger att ändringen kräver ett nytt förslag).
  const basis = { members: null, time: timeWith({ perWeekday: [17, 18, 18, 18, 18] }) }, req = { ...request, villkor: grundVillkor };
  const base = buildSchemaUnderlag(plan(), req, basis);
  const ma = u => u.labels.lessons.filter(l => l.title === 'Matematik' && l.classIds.includes('grupp-1')).map(l => l.durationMin);
  const helDag = { ...grundVillkor, egna: [{ slag: 'klass', ref: uid(10), typ: 'sparrad', days: [0], startMin: 480, endMin: 990 }] };
  const delDag = { ...grundVillkor, egna: [{ slag: 'klass', ref: uid(10), typ: 'sparrad', days: [0], startMin: 480, endMin: 720 }] };
  assert.deepEqual(ma(base), [65, 65, 65]);
  const u = buildSchemaUnderlag(plan(), { ...req, villkor: helDag }, basis);
  assert.deepEqual(ma(u), [65, 60, 60]);
  assert.ok(sammaGrund(helDag, grundVillkor), 'villkoret är klassat som tidsvillkor');
  assert.notEqual(u.grundFingerprint, base.grundFingerprint);
  assert.equal(schemaProvUnderlag(plan(), { ...req, villkor: helDag, grundFingerprint: base.grundFingerprint }, basis), null);
  // En spärr del av dagen lämnar dagen möjlig: passen och grunden är desamma, och spärren prövas direkt.
  const d = buildSchemaUnderlag(plan(), { ...req, villkor: delDag }, basis);
  assert.deepEqual([ma(d), d.grundFingerprint], [[65, 65, 65], base.grundFingerprint]);
  assert.ok(schemaProvUnderlag(plan(), { ...req, villkor: delDag, grundFingerprint: base.grundFingerprint }, basis));
});

test('version 2 av begäran nekas med egen orsak; servern bygger aldrig underlaget med den', () => {
  const underlag = buildSchemaUnderlag(plan(), request);
  const gammal = { ...request, fingerprint: underlag.fingerprint, placements: [] };
  assert.throws(() => parseSchemaKontrollRequest(gammal), { name: 'SchemaVersionError' });
  assert.throws(() => parseSchemaKontrollRequest({ ...gammal, contractVersion: 2 }), { name: 'SchemaVersionError' });
  assert.throws(() => parseSchemaKontrollRequest({ contractVersion: 3, ...request, fingerprint: underlag.fingerprint, placements: [] }), { name: 'SchemaContractError' });
});
