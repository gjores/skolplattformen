import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchemaVillkor, parseSchemaVillkor, schemaGrund, sammaGrund, SCHEMA_MOTOR_VERSION, parseSchemaSolution, parseSchemaCheck, parseSchemaForslag } from './schema-contract.ts';
import { buildSchemaUnderlag, defaultSchemaTime, schemaForslag, schemaKontroll } from './schema-underlag.ts';
import { arsbehov, arstak, trimmaLasar } from './schema-lasarsmonster.ts';

const uid = n => `65a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceKey = `class_timplan:${uid(10)}:2026:ma`;
function plan({ ht = 3000, vt = 3000, staff = [[20, ht, vt]], concurrent = false } = {}) {
  return { contractVersion: 1, unitId: uid(1), schoolName: 'Syntetisk årsskola', schoolYear: 2026, revision: 1,
    version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
    teachers: [20, 21, 22].map(n => ({ personId: uid(n), displayName: `Provlärare ${n}`, draft: false, shareHere: 100 })),
    classes: [{ classId: uid(10), name: 'Provklass', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey, rowKey: 'ma', label: 'Provmatematik', needHt: ht, needVt: vt, needBasis: 'terms' }] }],
    rows: staff.map(([person, teacherHt, teacherVt], i) => ({ id: uid(30 + i), lineageId: uid(40 + i), sourceKind: 'class_timplan', sourceKey, classId: uid(10), rowKey: 'ma',
      personId: person === null ? null : uid(person), teacherHt, teacherVt, needHt: ht, needVt: vt, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' })),
    groups: [], specials: [], joints: [], actions: [], blockers: [], sharing: concurrent ? [{ sourceKey, mode: 'concurrent' }] : [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true } };
}
function blockPlan({ secondHt = 3000, replace = false } = {}) {
  const data = plan(); data.classes[0].needs = [];
  data.groups = [40, 41].map(n => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(n)}`, rowKey: `group:${uid(n)}`, label: `Provspråk ${n}`, name: `Provspråk ${n}`,
    groupId: uid(n), blockId: uid(60), classIds: [uid(10)], needHt: 3000, needVt: 3000, needBasis: 'terms' }));
  const staff = [[40, 20, 3000, 3000], [41, 21, secondHt, replace ? 0 : 3000], ...(replace ? [[41, 22, 0, 3000]] : [])];
  data.rows = staff.map(([group, person, ht, vt], i) => ({ ...data.rows[0], id: uid(70 + i), lineageId: uid(80 + i), sourceKind: 'teaching_group',
    sourceKey: `teaching_group:${uid(group)}`, rowKey: `group:${uid(group)}`, groupId: uid(group), classId: null, classIds: [uid(10)], personId: uid(person), teacherHt: ht, teacherVt: vt }));
  return data;
}
function time(ht = [17, 17, 17, 17, 17], vt = [19, 19, 19, 19, 19]) {
  const result = defaultSchemaTime();
  for (const term of ['ht', 'vt']) { const days = term === 'ht' ? ht : vt; result.terms[term] = { ...result.terms[term], perWeekday: days,
    weeks: Array.from({ length: Math.max(...days) }, (_, w) => ({ monday: null, label: `${term} ${w + 1}`, perWeekday: days.map(n => Number(w < n)), classes: {} })) }; }
  return result;
}
const request = (period = 'lasar', extra = {}) => ({ unitId: uid(1), schoolYear: 2026, period, villkor: { ...defaultSchemaVillkor(), lunch: null, breakMin: 0, ...extra } });
const build = (data = plan(), req = request(), calendar = time()) => buildSchemaUnderlag(data, req, { time: calendar, members: null });
const placements = u => u.problem.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, startMin: 480, room: null }));
const answer = (data, req, u, placed = placements(u)) => schemaForslag(data, req, u, { status: 'complete', placements: placed, unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 1 });

test('markörens frånvaro bevaras strikt; nya förval använder årsmodellen och grundbyte är explicit', () => {
  assert.equal(SCHEMA_MOTOR_VERSION, 5);
  const modern = defaultSchemaVillkor(), legacy = { ...modern }; delete legacy.timeBasis;
  assert.equal(modern.timeBasis, 'lasar');
  assert.deepEqual(parseSchemaVillkor(legacy), legacy);
  assert.ok(!Object.hasOwn(parseSchemaVillkor(legacy), 'timeBasis'));
  assert.ok(!Object.hasOwn(schemaGrund(legacy), 'timeBasis'));
  assert.equal(sammaGrund(modern, legacy), false);
  for (const marker of [null, undefined, 'ht', '', true]) assert.throws(() => parseSchemaVillkor({ ...legacy, timeBasis: marker }));
  assert.throws(() => parseSchemaVillkor({ ...legacy, okant: 'lasar' }));
  assert.equal(build(plan(), { ...request(), villkor: legacy }).problem.version, 4);
});

test('85/95 skoldagar får gemensamma pass, en årsbudget och korrekt årsutfall utan terminskvoter', () => {
  const data = plan(), req = request(), u = build(data, req), result = answer(data, req, u), t = result.teachings[0];
  assert.deepEqual(u.problem.lessons.map(l => l.duration_min), [60, 55, 55]);
  assert.ok(u.problem.lessons.every(l => l.periods === undefined));
  assert.deepEqual(u.problem.activities[0].time.map(t => [t.period, t.budget, t.min_min, t.max_min]), [['ht', 'arsbudget-1', 6000, 6120], ['vt', 'arsbudget-1', 6000, 6120]]);
  assert.equal(t.timeBasis, 'lasar'); assert.equal(t.needMin, 6000); assert.equal(t.maxMin, 6000); assert.equal(t.plannedMin, 6000); assert.equal(t.deviation, null);
  assert.ok(t.terms.find(t => t.term === 'ht').plannedMin < 3000); assert.ok(t.terms.find(t => t.term === 'vt').plannedMin > 3000);
  assert.equal(t.terms.reduce((sum, t) => sum + t.trimmedMin, 0), 120);
  assert.equal(t.perWeek.reduce((sum, n) => sum + n, 0), 6000);
  const sent = JSON.stringify(u.problem);
  for (const forbidden of [uid(10), uid(20), sourceKey, 'Provmatematik', 'Provlärare']) assert.ok(!sent.includes(forbidden));
  assert.deepEqual(parseSchemaForslag(result, req), result);
});

test('årsavrundning sker en gång även vid bråkminuter; termraderna summerar exakt', () => {
  const data = plan({ ht: 1000.2, vt: 1000.2 }), req = request(), u = build(data, req), t = answer(data, req, u).teachings[0];
  assert.equal(arsbehov([1000.2, 1000.2]), 2001); assert.equal(arstak(2001), 2005);
  assert.equal(t.needMin, 2001); assert.equal(t.maxMin, 2005);
  assert.equal(t.terms.reduce((sum, x) => sum + x.needMin, 0), 2001);
  assert.equal(t.terms.reduce((sum, x) => sum + x.maxMin, 0), 2005);
  assert.equal(u.fordelning[0].terms.reduce((sum, x) => sum + x.needMin, 0), 2001);
  assert.ok(t.plannedMin >= 2001 && t.plannedMin <= 2005);
});

test('HT-del med faktiskt lärarbyte uppfinner ingen placering i VT och intygar ingen årsavstämning', () => {
  const data = plan({ staff: [[20, 3000, 0], [21, 0, 3000]] }), req = request('ht'), u = build(data, req), t = answer(data, req, u).teachings[0];
  assert.equal(u.problem.lessons.length, 3); assert.ok(u.problem.lessons.every(l => l.periods[0] === 'ht'));
  assert.deepEqual(t.terms.map(x => x.term), ['ht']);
  assert.equal(t.plannedMin, 17 * 170); assert.equal(t.needMin, 6000); assert.equal(t.deviation, null);
  assert.equal(t.terms[0].trimmedMin, 0);
});

test('klassens egna faktiska dagar och spärrar styr möjliga årsbidrag; inga halvårskvoter införs', () => {
  const data = plan(), calendar = time();
  calendar.terms.ht.classes[uid(10)] = [0, 0, 0, 0, 0];
  calendar.terms.ht.weeks = calendar.terms.ht.weeks.map(w => ({ ...w, classes: { [uid(10)]: [0, 0, 0, 0, 0] } }));
  const req = request(), u = build(data, req, calendar), t = answer(data, req, u).teachings[0];
  assert.ok(u.problem.lessons.every(l => l.periods[0] === 'vt'));
  assert.equal(t.plannedMin, 6000); assert.equal(t.deviation, null);
  assert.equal(t.terms.find(t => t.term === 'ht').plannedMin, 0);
  assert.equal(t.terms.find(t => t.term === 'vt').plannedMin, 6000);
  const closed = build(data, request('lasar', { egna: [{ slag: 'amne', ref: 'Provmatematik', typ: 'sparrad', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 990 }] }));
  assert.ok(closed.labels.activities[0].weeklyOff);
});

test('minimilängd som hindrar årstrim ger en verklig tidsavvikelse', () => {
  const data = plan({ ht: 300, vt: 300 }), req = request('lasar', { minLessonMin: 20, fordelning: [{ ref: `undervisning:${sourceKey}`, antal: 1 }] }), u = build(data, req);
  const t = answer(data, req, u).teachings[0];
  assert.equal(t.plannedMin, 20 * 36); assert.equal(t.needMin, 600); assert.equal(t.deviation, 'calendar');
});

test('årssvarets nya metadata måste vara komplett och giltig; äldre undervisningsrader är fortsatt tillåtna', () => {
  const data = plan(), req = request(), u = build(data, req), result = answer(data, req, u);
  for (const change of [t => { delete t.maxMin; }, t => { t.maxMin = 5999; }, t => { t.timeBasis = null; }, t => { t.timeBasis = 'ht'; }]) {
    const broken = structuredClone(result); change(broken.teachings[0]); assert.throws(() => parseSchemaForslag(broken, req));
  }
  const legacy = structuredClone(result); delete legacy.teachings[0].timeBasis; delete legacy.teachings[0].maxMin;
  assert.deepEqual(parseSchemaForslag(legacy, req), legacy);
});

test('samma personer med ändrade turandelar får termpass men gemensamt årsbelopp och samma längder', () => {
  const data = plan({ staff: [[20, 1800, 900], [21, 1200, 2100]] }), u = build(data);
  assert.equal(u.problem.lessons.length, 6);
  assert.deepEqual(u.problem.lessons.slice(0, 3).map(l => l.duration_min), u.problem.lessons.slice(3).map(l => l.duration_min));
  assert.deepEqual(u.problem.lessons.map(l => l.periods), [...Array(3).fill(['ht']), ...Array(3).fill(['vt'])]);
  assert.deepEqual(u.problem.lessons.map(l => l.teachers), [['larare-1'], ['larare-1'], ['larare-2'], ['larare-1'], ['larare-2'], ['larare-2']]);
  assert.ok(u.problem.activities[0].time.every(t => t.min_min === 6000 && t.max_min === 6120));
});

test('nollminuterslärare räknas inte som aktiva; verkligt lärarbyte och samtidig undervisning bevaras', () => {
  const changed = build(plan({ staff: [[20, 3000, 0], [21, 0, 3000]] }));
  assert.deepEqual(changed.problem.lessons.map(l => l.teachers), [...Array(3).fill(['larare-1']), ...Array(3).fill(['larare-2'])]);
  const simultaneous = build(plan({ staff: [[20, 3000, 1000], [21, 1000, 3000]], concurrent: true }));
  assert.equal(simultaneous.problem.lessons.length, 3); assert.ok(simultaneous.problem.lessons.every(l => l.teachers.length === 2 && !l.periods));
  const zero = build(plan({ staff: [[20, 3000, 3000], [21, 0, 0]] }));
  for (const l of zero.problem.lessons) assert.deepEqual(l.teachers, ['larare-1']);
});

test('reservblock utan medlemskap behåller båda bemannade alternativens samtidiga lärare i gemensamma årspass', () => {
  const data = blockPlan(), req = request(), u = build(data, req), f = answer(data, req, u);
  assert.equal(u.fordelning[0].ref, `valbart-block:${uid(60)}`); assert.equal(u.fordelning[0].typ, 'block');
  assert.equal(u.problem.lessons.length, 3);
  for (const l of u.problem.lessons) { assert.deepEqual(l.teachers, ['larare-1', 'larare-2']); assert.equal(l.periods, undefined); }
  assert.ok(u.labels.lessons.every(l => l.vacant === false));
  assert.equal(f.teachings[0].needMin, 6000); assert.equal(f.teachings[0].plannedMin, 6000);
});

test('reservblock med nollminutslärare i HT har rätt termresurser och visar den obemannade alternativdelen', () => {
  const data = blockPlan({ secondHt: 0 }), u = build(data);
  const ht = u.problem.lessons.filter(l => l.periods?.includes('ht')), vt = u.problem.lessons.filter(l => l.periods?.includes('vt'));
  assert.equal(ht.length, 3); assert.equal(vt.length, 3);
  for (const l of ht) assert.deepEqual(l.teachers, ['larare-1']);
  for (const l of vt) assert.deepEqual(l.teachers, ['larare-1', 'larare-2']);
  assert.ok(u.labels.lessons.filter(l => l.term === 'ht').every(l => l.vacant));
  assert.ok(u.labels.lessons.filter(l => l.term === 'vt').every(l => !l.vacant));
  const inactiveAlternative = blockPlan({ secondHt: 0 }); inactiveAlternative.groups[1].needHt = 0;
  assert.ok(build(inactiveAlternative).labels.lessons.filter(l => l.term === 'ht').every(l => !l.vacant));
  const req = request(); delete req.villkor.timeBasis;
  const legacy = build(data, req);
  assert.equal(legacy.problem.version, 4);
  for (const l of legacy.problem.lessons) assert.deepEqual(l.teachers, ['larare-1', 'larare-2']);
  assert.ok(legacy.labels.lessons.every(l => l.vacant === false));
});

test('reservblock med verkligt lärarbyte har samtidiga rätta lärare i varje termin inom samma årsbudget', () => {
  const data = blockPlan({ replace: true }), req = request(), u = build(data, req), f = answer(data, req, u);
  assert.equal(u.problem.lessons.length, 6);
  for (const l of u.problem.lessons) assert.deepEqual(l.teachers, l.periods[0] === 'ht' ? ['larare-1', 'larare-2'] : ['larare-1', 'larare-3']);
  assert.ok(u.labels.lessons.every(l => !l.vacant));
  assert.ok(u.problem.activities[0].time.every(t => t.budget === 'arsbudget-1' && t.min_min === 6000));
  assert.equal(f.teachings[0].plannedMin, 6000); assert.equal(f.teachings[0].deviation, null);
});

test('ensam termin behåller sin faktiska period och ger inga spökpass i den andra', () => {
  const data = plan({ ht: 3000, vt: 0 }), req = request(), u = build(data, req), t = answer(data, req, u).teachings[0];
  assert.ok(u.problem.lessons.every(l => JSON.stringify(l.periods) === '["ht"]'));
  assert.deepEqual(t.terms.map(t => t.term), ['ht']); assert.equal(t.needMin, 3000); assert.equal(t.timeBasis, 'lasar');
  assert.equal(build(data, request('vt')).problem.lessons.length, 0);
});

test('HT/VT använder samma årsberäknade pass och årstrim som projektionen av fullt årsutkast', () => {
  const data = plan(), calendar = time([16, 17, 17, 17, 18], [20, 19, 19, 19, 18]), fullRequest = request(), full = build(data, fullRequest, calendar);
  const complete = answer(data, fullRequest, full);
  for (const period of ['ht', 'vt']) {
    const req = request(period), u = build(data, req, calendar), result = answer(data, req, u);
    assert.deepEqual(u.problem.lessons.map(l => [l.id, l.duration_min, l.teachers]), full.problem.lessons.map(l => [l.id, l.duration_min, l.teachers]));
    assert.ok(u.problem.activities[0].time.every(t => t.min_min === 0 && t.period === period));
    assert.deepEqual(result.teachings[0].terms, complete.teachings[0].terms.filter(t => t.term === period));
    assert.deepEqual(result.trims, complete.trims.filter(t => t.term === period));
    assert.equal(result.teachings[0].needMin, 6000); assert.equal(result.teachings[0].maxMin, 6000);
    assert.ok(result.teachings[0].plannedMin < 6000);
  }
  const changedOutside = build(plan({ vt: 3200 }), request('ht'), calendar);
  assert.notEqual(changedOutside.grundFingerprint, build(data, request('ht'), calendar).grundFingerprint);
});

test('årstrim kortar samma pass lika över HT/VT före jämnt spridd rest och underskrider aldrig kortaste pass', () => {
  const occasions = [...Array(17 + 19)].flatMap(() => [{ lesson: 0, durationMin: 70 }, { lesson: 1, durationMin: 70 }]);
  const cut = trimmaLasar(occasions, 4105, 20);
  assert.equal(occasions.reduce((sum, o, i) => sum + o.durationMin - cut[i], 0), 4105);
  assert.ok(cut.every((n, i) => occasions[i].durationMin - n >= 20));
  assert.equal(Math.min(...cut.filter((_, i) => i % 2 === 0)), 15);
  assert.ok(cut.slice(0, 34).some(n => n > 15) && cut.slice(34).some(n => n > 15));
  assert.deepEqual(trimmaLasar([{ lesson: 0, durationMin: 20 }], 0, 20), [0]);
});

test('gruppvalt lektionsantal, lås och regelkontroll behåller årsmodellens passidentiteter', () => {
  const data = plan(), req = request('lasar', { fordelning: [{ ref: `undervisning:${sourceKey}`, antal: 2 }] }), u = build(data, req);
  assert.equal(u.problem.lessons.length, 2);
  const locked = build(data, { ...req, locks: { grundFingerprint: u.grundFingerprint, placements: [placements(u)[0]] } });
  assert.deepEqual(locked.problem.lessons[0].locked, { day: 0, start_min: 480 });
  assert.equal(locked.grundFingerprint, u.grundFingerprint);
  const result = schemaKontroll(u, placements(u), { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  assert.equal(result.teachings[0].timeBasis, 'lasar'); assert.equal(result.teachings[0].plannedMin, 6000);
});

test('svarsversion måste spegla det faktiskt skickade problemet, både äldre4 och nya5', () => {
  for (const version of [4, 5]) {
    const u = build(), p = { ...u.problem, version };
    const result = { version, problem_id: p.id, status: 'time_limit', placements: [], unplaced: p.lessons.map(l => l.id), diagnoses: [], search_statistics: { lessons: [], bottlenecks: [], iterations: 0 }, metrics: { student_gap_min: 0, teacher_gap_min: 0 }, stats: { elapsed_ms: 0 } };
    assert.equal(parseSchemaSolution(result, p).status, 'time_limit');
    assert.throws(() => parseSchemaSolution({ ...result, version: version === 4 ? 5 : 4 }, p));
    const checked = { version, problem_id: p.id, violations: [], metrics: { student_gap_min: 0, teacher_gap_min: 0 } };
    assert.deepEqual(parseSchemaCheck(checked, p).violations, []);
    assert.throws(() => parseSchemaCheck({ ...checked, version: version === 4 ? 5 : 4 }, p));
  }
});
