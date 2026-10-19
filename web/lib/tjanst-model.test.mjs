import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityViolations, coverage, coverageLabel, deviation, formatHours, grNeedRowIds, gyNeedRowKey, needForTerm, prefill,
  schoolSums, teacherSums, tjanstNeed } from './tjanst-model.ts';

const uid = n => `51a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const key = (classN, row = 'programmeSpecific:BYGG:1:BYGG1000X') => `class_timplan:${uid(classN)}:2026:${row}`;
const row = (id, extra = {}) => ({ id: uid(id), lineageId: uid(id + 100), sourceKind: 'class_timplan', sourceKey: key(10), classId: uid(10),
  rowKey: 'programmeSpecific:BYGG:1:BYGG1000X', personId: uid(20), teacherHt: h(50), teacherVt: h(50), needHt: h(50), needVt: h(50),
  needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });

test('Gy25 v2-plan, läsår 2 i kullen: HT läses ur index 2 och VT ur index 3 i schoolMinutes', () => {
  const schoolMinutes = [h(10), h(11), h(20), h(21), h(30), null];
  assert.deepEqual(tjanstNeed({ kind: 'gy_v2', schoolMinutes, yearInCohort: 2 }), { needHt: h(20), needVt: h(21), needBasis: 'terms' });
  assert.equal(needForTerm({ kind: 'gy_v2', schoolMinutes, yearInCohort: 1 }, 'ht'), h(10));
  assert.equal(needForTerm({ kind: 'gy_v2', schoolMinutes, yearInCohort: 3 }, 'vt'), null);
  assert.throws(() => tjanstNeed({ kind: 'gy_v2', schoolMinutes, yearInCohort: 4 }));
});

test('Gy-plan utan v2-tid: årets timmar delas 50/50 och märks even_split; helt tomt år är okänt', () => {
  assert.deepEqual(tjanstNeed({ kind: 'gy_legacy', hours: [null, null, 40, 60, null, null], yearInCohort: 2 }), { needHt: h(50), needVt: h(50), needBasis: 'even_split' });
  assert.deepEqual(tjanstNeed({ kind: 'gy_legacy', hours: [null, null, null, null, null, null], yearInCohort: 2 }), { needHt: null, needVt: null, needBasis: 'even_split' });
});

test('GR ak8 med 90 årstimmar: HT 45 h och VT 45 h, needBasis even_split', () => {
  assert.deepEqual(tjanstNeed({ kind: 'gr', annualHours: 90 }), { needHt: h(45), needVt: h(45), needBasis: 'even_split' });
  assert.deepEqual(tjanstNeed({ kind: 'gr', annualHours: 91 }), { needHt: 2730, needVt: 2730, needBasis: 'even_split' });
  assert.equal(needForTerm({ kind: 'gr', annualHours: null }, 'ht'), null);
});

test('GR-grupprader räknas inte dubbelt med sina delrader', () => {
  const low = grNeedRowIds(2), high = grNeedRowIds(8);
  assert.ok(low.includes('no') && low.includes('so') && !low.includes('biologi') && !low.includes('historia'));
  assert.ok(high.includes('biologi') && high.includes('historia') && !high.includes('no') && !high.includes('so'));
  assert.ok(low.includes('skolansval') && high.includes('matematik'));
  assert.throws(() => grNeedRowIds(10));
});

test('Gy: valblock är behovsrader, meta-rader är det inte', () => {
  assert.equal(gyNeedRowKey('block:individuellt-val'), true);
  assert.equal(gyNeedRowKey('foundation:ENGE:1:ENGE1000X'), true);
  assert.equal(gyNeedRowKey('meta:gymnasiearbete'), false);
});

test('IM 3 h/vecka med 17,4 skolveckor HT: 3132 minuter; saknad eller ej fastställd kalender: null', () => {
  const calendar = { status: 'faststalld', htSchoolDays: 87, vtSchoolDays: 91 };
  assert.deepEqual(tjanstNeed({ kind: 'im', weeklyHours: 3, calendar }), { needHt: 3132, needVt: 3276, needBasis: 'weekly_calendar' });
  assert.deepEqual(tjanstNeed({ kind: 'im', weeklyHours: 3, calendar: null }), { needHt: null, needVt: null, needBasis: 'weekly_calendar' });
  assert.deepEqual(tjanstNeed({ kind: 'im', weeklyHours: 3, calendar: { ...calendar, status: 'utkast' } }), { needHt: null, needVt: null, needBasis: 'weekly_calendar' });
  assert.equal(needForTerm({ kind: 'im', weeklyHours: null, calendar }, 'vt'), null);
});

test('Förifyllning när 30 h redan är fördelat av 100 h: 70 h; när allt är fördelat: 0, aldrig negativt', () => {
  assert.equal(prefill(h(100), h(30)), h(70));
  assert.equal(prefill(h(100), h(100)), 0);
  assert.equal(prefill(h(100), h(120)), 0);
  assert.equal(prefill(null, h(30)), null);
});

test('avvikelse är lärartid minus behov och okänd när behovet är okänt', () => {
  assert.equal(deviation(h(55), h(50)), h(5));
  assert.equal(deviation(h(45), h(50)), -h(5));
  assert.equal(deviation(h(45), null), null);
});

test('summa för en rad: undervisning, specialuppdrag och totalt per termin och år', () => {
  const sums = teacherSums(uid(20), [row(30)], [{ id: uid(40), lineageId: uid(41), kind: 'annat', label: 'Arbetslag', personId: uid(20), classId: null, ht: h(10), vt: h(5), comment: '' }], []);
  assert.deepEqual(sums.teaching, { ht: h(50), vt: h(50), year: h(100) });
  assert.deepEqual(sums.special, { ht: h(10), vt: h(5), year: h(15) });
  assert.deepEqual(sums.total, { ht: h(60), vt: h(55), year: h(115) });
});

test('Samläsning 2 klasser × 60 h behov och 1 lärare 60 h: lärartotal 60 h och båda klasserna täckta', () => {
  const rows = [row(31, { classId: uid(10), sourceKey: key(10), teacherHt: h(30), teacherVt: h(30), jointGroupId: uid(50) }),
    row(32, { classId: uid(11), sourceKey: key(11), teacherHt: h(30), teacherVt: h(30), jointGroupId: uid(50) })];
  const joints = [{ id: uid(50), lineageId: uid(51), name: 'Samläsning', rowIds: [uid(31), uid(32)], teachers: [{ personId: uid(20), ht: h(30), vt: h(30) }] }];
  assert.deepEqual(teacherSums(uid(20), rows, [], joints).teaching, { ht: h(30), vt: h(30), year: h(60) });
  for (const n of [10, 11]) {
    const c = coverage(key(n), { ht: h(30), vt: h(30) }, rows, joints);
    assert.deepEqual(c.covered, { ht: h(30), vt: h(30) }); assert.equal(c.teachers, 1);
  }
  const classes = [10, 11].map(n => ({ classId: uid(n), name: `K${n}`, link: { linkRevision: 0, timplanId: uid(60), seriesId: uid(61), seriesName: 'S', timplanVersion: 1, column: 'ar1', schoolform: 'gymnasium' },
    needs: [{ sourceKind: 'class_timplan', sourceKey: key(n), rowKey: 'programmeSpecific:BYGG:1:BYGG1000X', label: 'Bygg', needHt: h(30), needVt: h(30), needBasis: 'terms' }] }));
  const school = schoolSums(classes, rows, [], joints);
  assert.deepEqual(school.teaching, { ht: h(30), vt: h(30) }); assert.deepEqual(school.unallocated, { ht: 0, vt: 0 });
});

test('1 klass med 2 lärare à 50 h: "100 av 100 h · 2 lärare"', () => {
  const rows = [row(31, { personId: uid(20), teacherHt: h(25), teacherVt: h(25) }), row(32, { personId: uid(21), teacherHt: h(25), teacherVt: h(25) })];
  const c = coverage(key(10), { ht: h(50), vt: h(50) }, rows, []);
  assert.equal(coverageLabel(c), '100 av 100 h · 2 lärare');
});

test('vakant rad täcker inte behovet och räknas som vakant', () => {
  const c = coverage(key(10), { ht: h(50), vt: h(50) }, [row(31, { personId: null })], []);
  assert.deepEqual(c.covered, { ht: 0, vt: 0 }); assert.deepEqual(c.vacant, { ht: h(50), vt: h(50) }); assert.equal(c.teachers, 0);
});

test('Okopplad klass: behov null, inga nollor i summor och linked false', () => {
  const linked = { classId: uid(10), name: 'BA26A', link: { linkRevision: 0, timplanId: uid(60), seriesId: uid(61), seriesName: 'S', timplanVersion: 1, column: 'ar1', schoolform: 'gymnasium' },
    needs: [{ sourceKind: 'class_timplan', sourceKey: key(10), rowKey: 'programmeSpecific:BYGG:1:BYGG1000X', label: 'Bygg', needHt: h(50), needVt: null, needBasis: 'terms' }] };
  const unlinked = { classId: uid(11), name: 'BA26B', link: null, needs: [] };
  const sums = schoolSums([linked, unlinked], [row(31, { teacherHt: h(20), teacherVt: h(10) })], [], []);
  assert.deepEqual(sums.unallocated, { ht: h(30), vt: 0 });
  assert.equal(sums.unlinkedClasses, 1);
  assert.equal(coverageLabel(coverage(key(11), null, [], [])), '0 h · behov okänt · 0 lärare');
  assert.equal(unlinked.link !== null, false);
});

test('Specialuppdrag räknas i summan Specialuppdrag och aldrig i Undervisning', () => {
  const specials = [{ id: uid(40), lineageId: uid(41), kind: 'mentor', label: 'Mentor', personId: uid(20), classId: uid(10), ht: h(20), vt: h(20), comment: '' },
    { id: uid(42), lineageId: uid(43), kind: 'speciallarare', label: 'Specialundervisning', personId: null, classId: null, ht: h(10), vt: 0, comment: '' }];
  const t = teacherSums(uid(20), [], specials, []);
  assert.deepEqual(t.teaching, { ht: 0, vt: 0, year: 0 }); assert.deepEqual(t.special, { ht: h(20), vt: h(20), year: h(40) });
  const s = schoolSums([], [], specials, []);
  assert.deepEqual(s.teaching, { ht: 0, vt: 0 }); assert.deepEqual(s.special, { ht: h(20), vt: h(20) }); assert.deepEqual(s.vacant, { ht: h(10), vt: 0 });
});

test('Kapacitet: 60 + 40 av 100 godkänns, 60 + 50 nekas, och överlappande perioder prövas per datum', () => {
  const employment = { percent: 100, startsOn: '2026-01-01', endsOn: null };
  const d = (percent, startsOn, endsOn = null) => ({ percent, startsOn, endsOn });
  assert.deepEqual(capacityViolations(employment, [d(60, '2026-01-01'), d(40, '2026-01-01')]), []);
  assert.deepEqual(capacityViolations(employment, [d(60, '2026-01-01'), d(50, '2026-01-01')]), [{ from: '2026-01-01', to: null, sum: 110, percent: 100 }]);
  assert.deepEqual(capacityViolations(employment, [d(60, '2026-01-01', '2026-06-30'), d(50, '2026-04-01', '2026-12-31')]),
    [{ from: '2026-04-01', to: '2026-06-30', sum: 110, percent: 100 }]);
  assert.deepEqual(capacityViolations(employment, [d(60, '2026-01-01', '2026-03-31'), d(50, '2026-04-01', '2026-12-31')]), []);
  assert.deepEqual(capacityViolations({ percent: 50, startsOn: '2026-01-01', endsOn: null }, [d(60, '2026-01-01')]), [{ from: '2026-01-01', to: null, sum: 60, percent: 50 }]);
  assert.deepEqual(capacityViolations({ percent: 100, startsOn: '2026-02-01', endsOn: '2026-12-31' }, [d(60, '2026-01-01', '2026-12-31')]),
    [{ from: '2026-01-01', to: '2026-01-31', outside: true }]);
  assert.throws(() => capacityViolations(employment, [d(60.5, '2026-01-01')]));
});

test('60 + 40 ger dutyPercent 60/40 utan avrundning och hela minuter visas med decimalkomma', () => {
  assert.equal(formatHours(3132), '52,2 h');
  assert.equal(formatHours(h(45)), '45 h');
  assert.deepEqual([60, 40].map(p => p), [60, 40]);
});
