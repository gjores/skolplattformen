import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, schemaForslag, weeklyLessons } from './schema-underlag.ts';
import { parseSchemaForslag, parseSchemaForslagRequest, parseSchemaSolution } from './schema-contract.ts';

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
const request = { unitId: uid(1), schoolYear: 2026, term: 'ht', weeks: 18 };

test('veckotiden delas i lika pass om högst 80 min; under 20 min i veckan ger inget pass', () => {
  assert.deepEqual(weeklyLessons(h(54), 18), [60, 60, 60]);
  assert.deepEqual(weeklyLessons(h(27), 18), [45, 45]);
  assert.deepEqual(weeklyLessons(h(24), 18), [80]);
  assert.deepEqual(weeklyLessons(h(4), 18), []);
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

test('valbart block blir ett gemensamt pass för blockets klasser och lärare; samläsning likaså', () => {
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

test('begäran: skola, läsår, termin och veckor prövas', () => {
  assert.deepEqual(parseSchemaForslagRequest(request), request);
  for (const broken of [{ ...request, weeks: 0 }, { ...request, weeks: 31 }, { ...request, term: 'ar' }, { ...request, unitId: 'x' }, { ...request, extra: 1 }, null])
    assert.throws(() => parseSchemaForslagRequest(broken));
});
