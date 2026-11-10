import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySchoolYear, COPY_REVIEW_REASONS } from './lasar-copy.ts';
import { proposeSchoolYear, summarize, publicHolidays, easterSunday, addDays, daysBetween, isoWeek, weekday } from './lasar-model.ts';

// Syntetiska data. Källåret är förslaget för 2026/27; målåret är 2027/28.
const offering = '51a10000-0000-4000-8000-000000000001';
const otherOffering = '51a10000-0000-4000-8000-000000000002';
const source = (patch = {}) => ({ ...proposeSchoolYear(2026, 'u1', ['GR']), ...patch });
const withExceptions = (extra) => { const s = source(); return { ...s, exceptions: { ...s.exceptions, ...extra } }; };
const group = (id, scope = 'årskurs', columnId = 'ak4') => ({ id, name: id, scope, kind: 'grundskola', educationId: offering, educationName: 'Grundskola', columnId });
const reviewOf = (result, date) => result.review.filter((r) => r.sourceDate === date);

/** Ingen granskad dag får finnas i utkastet. */
function assertNothingReviewedInserted({ draft, review }) {
  for (const r of review) {
    if (r.reason === 'term_edge' || r.kind === 'termin' || r.kind === 'kort vecka') continue;
    const target = r.groupId ? draft.groupExceptions[r.groupId] ?? {} : draft.exceptions;
    for (const d of [r.targetDate, r.suggestedDate]) if (d) assert.equal(target[d], undefined, `${r.id} finns i utkastet`);
  }
  assert.ok(review.every((r) => COPY_REVIEW_REASONS.includes(r.reason)));
}

test('höstlov v44 2026 kopieras till v44 2027 med samma slag och anteckning', () => {
  const result = copySchoolYear(source(), 2027, []);
  const v44 = ['2027-11-01', '2027-11-02', '2027-11-03', '2027-11-04', '2027-11-05'];
  for (const d of v44) {
    assert.equal(isoWeek(d).week, 44);
    assert.deepEqual(result.draft.exceptions[d], { kind: 'lovdag', note: 'Höstlov' });
  }
  assert.deepEqual(result.draft.exceptions['2028-02-28'], { kind: 'lovdag', note: 'Sportlov' });
  assertNothingReviewedInserted(result);
});

test('terminernas kanter flyttas till samma ISO-vecka och veckodag', () => {
  const { draft } = copySchoolYear(source(), 2027, []);
  // 2026 har 53 ISO-veckor, så höstens kanter hamnar en vecka senare än i förslaget för 2027.
  assert.deepEqual(draft.ht, { start: '2027-08-23', end: '2027-12-24' });
  assert.deepEqual(draft.vt, { start: '2028-01-10', end: '2028-06-09' });
  assert.equal(draft.startYear, 2027);
});

test('en lovdag i vecka 53 2026 till 2027/28 ger missing_week och läggs inte in', () => {
  const result = copySchoolYear(withExceptions({ '2026-12-28': { kind: 'lovdag', note: 'Mellandag' } }), 2027, []);
  const items = reviewOf(result, '2026-12-28');
  assert.equal(items.length, 1);
  assert.equal(items[0].reason, 'missing_week');
  assert.equal(items[0].kind, 'lovdag');
  assert.equal(items[0].note, 'Mellandag');
  assert.equal(items[0].targetDate, undefined);
  assert.ok(!Object.values(result.draft.exceptions).some((e) => e.note === 'Mellandag'));
  assertNothingReviewedInserted(result);
});

test('påskfönstret och klämdagen efter Kristi himmelsfärd ger easter med förslag på samma avstånd från påsk 2028', () => {
  const result = copySchoolYear(source(), 2027, []);
  const easter27 = easterSunday(2027), easter28 = easterSunday(2028);
  for (const d of ['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-05-07']) {
    const [item] = reviewOf(result, d);
    assert.equal(item?.reason, 'easter', d);
    assert.equal(item.suggestedDate, addDays(easter28, daysBetween(easter27, d)), d);
    assert.equal(result.draft.exceptions[item.suggestedDate], undefined);
    assert.equal(result.draft.exceptions[item.targetDate], undefined);
  }
  assert.equal(reviewOf(result, '2027-05-07')[0].suggestedDate, '2028-05-26');
  assert.ok(!Object.values(result.draft.exceptions).some((e) => e.note === 'Påsklov' || e.note?.startsWith('Klämdag')));
  assertNothingReviewedInserted(result);
});

test('en studiedag som hamnar på en allmän helgdag ger holiday', () => {
  // Måndag v18 2027 blir måndag v18 2028, som är första maj.
  const result = copySchoolYear(withExceptions({ '2027-05-03': { kind: 'studiedag', note: 'Fortbildning' } }), 2027, []);
  const [item] = reviewOf(result, '2027-05-03');
  assert.equal(item?.reason, 'holiday');
  assert.equal(item.targetDate, '2028-05-01');
  assert.equal(result.draft.exceptions['2028-05-01'], undefined);
  assertNothingReviewedInserted(result);
});

test('en studiedag som hamnar på en helg ger weekend', () => {
  const result = copySchoolYear(withExceptions({ '2026-09-12': { kind: 'studiedag', note: 'Lördag' } }), 2027, []);
  const [item] = reviewOf(result, '2026-09-12');
  assert.equal(item?.reason, 'weekend');
  assert.equal(weekday(item.targetDate), 5);
  assertNothingReviewedInserted(result);
});

test('en måldag utanför de kopierade terminerna ger outside_terms', () => {
  const result = copySchoolYear(withExceptions({ '2026-08-11': { kind: 'studiedag', note: 'Före start' } }), 2027, []);
  const [item] = reviewOf(result, '2026-08-11');
  assert.equal(item?.reason, 'outside_terms');
  assert.ok(item.targetDate < result.draft.ht.start);
  assertNothingReviewedInserted(result);
});

test('en måldag i jullovet ger jullov', () => {
  const result = copySchoolYear(withExceptions({ '2026-12-21': { kind: 'studiedag', note: 'Planering' } }), 2027, []);
  const [item] = reviewOf(result, '2026-12-21');
  assert.equal(item?.reason, 'jullov');
  assert.equal(item.targetDate, '2027-12-27');
  assertNothingReviewedInserted(result);
});

test('en terminskant på en helgdag ger term_edge, får den flyttade dagen och modellens varning visas', () => {
  // Tisdag v23 2027 blir tisdag v23 2028, nationaldagen.
  const result = copySchoolYear(source({ vt: { start: '2027-01-11', end: '2027-06-08' } }), 2027, []);
  assert.equal(result.draft.vt.end, '2028-06-06');
  const [item] = result.review.filter((r) => r.reason === 'term_edge');
  assert.equal(item?.edge, 'vt:end');
  assert.equal(item.sourceDate, '2027-06-08');
  assert.equal(item.suggestedDate, '2028-06-06');
  assert.ok(summarize(result.draft, ['GR']).issues.some((i) => i.level === 'warning' && /Vårterminen slutar .*nationaldagen/.test(i.text)));
});

test('en terminskant på en helg ger term_edge', () => {
  const result = copySchoolYear(source({ ht: { start: '2026-08-16', end: '2026-12-18' } }), 2027, []);
  const [item] = result.review.filter((r) => r.reason === 'term_edge');
  assert.equal(item?.edge, 'ht:start');
  assert.equal(result.draft.ht.start, '2027-08-22');
  assert.equal(weekday(result.draft.ht.start), 6);
});

test('en årskursgruppdag kopieras när samma utbildning och kolumn finns i målårets grupper', () => {
  const id = `arskurs:${offering}:ak4`;
  const s = source({ groupExceptions: { [id]: { '2026-09-16': { cause: 'friluftsdag', note: 'Skogen' } } } });
  const result = copySchoolYear(s, 2027, [group(id)]);
  assert.deepEqual(result.draft.groupExceptions[id], { '2027-09-22': { cause: 'friluftsdag', note: 'Skogen' } });
  assert.equal(result.review.filter((r) => r.groupId === id).length, 0);
});

test('en årskursgruppdag utan samma utbildning och kolumn i målåret ger group_offering_missing', () => {
  const id = `arskurs:${offering}:ak4`;
  const s = source({ groupExceptions: { [id]: { '2026-09-16': { cause: 'friluftsdag' } } } });
  for (const groups of [[], [group(`arskurs:${otherOffering}:ak4`)], [group(`arskurs:${offering}:ak5`, 'årskurs', 'ak5')], [group(id, 'klass')]]) {
    const result = copySchoolYear(s, 2027, groups);
    const [item] = result.review.filter((r) => r.groupId === id);
    assert.equal(item?.reason, 'group_offering_missing');
    assert.equal(item.kind, 'gruppdag');
    assert.equal(result.draft.groupExceptions[id], undefined);
    assertNothingReviewedInserted(result);
  }
});

test('en klassgruppdag kopieras aldrig och ger group_class', () => {
  const id = 'klass:51a10000-0000-4000-8000-000000000101';
  const s = source({ groupExceptions: { [id]: { '2026-09-16': { cause: 'apl' } } } });
  const result = copySchoolYear(s, 2027, [group(id, 'klass')]);
  const [item] = result.review.filter((r) => r.groupId === id);
  assert.equal(item?.reason, 'group_class');
  assert.equal(item.sourceDate, '2026-09-16');
  assert.equal(result.draft.groupExceptions[id], undefined);
  assertNothingReviewedInserted(result);
});

test('en kort vecka kopieras aldrig och ger short_week', () => {
  const id = `arskurs:${offering}:ak1`;
  const short = { weekday: 4, reason: 'Inskolning', columnId: 'ak1' };
  const result = copySchoolYear(source({ shortWeeks: { [id]: short } }), 2027, [group(id, 'årskurs', 'ak1')]);
  const [item] = result.review.filter((r) => r.reason === 'short_week');
  assert.equal(item?.groupId, id);
  assert.equal(item.kind, 'kort vecka');
  assert.equal(item.sourceDate, null);
  assert.deepEqual(item.shortWeek, short);
  assert.deepEqual(result.draft.shortWeeks, {});
});

test('helgdagarna räknas om för målåret', () => {
  const { draft } = copySchoolYear(source(), 2027, []);
  const inTerms = (d) => d >= draft.ht.start && d <= draft.vt.end;
  const expected = [...publicHolidays(2027), ...publicHolidays(2028)].filter((h) => inTerms(h.date) && weekday(h.date) < 5).map((h) => h.date);
  assert.deepEqual(summarize(draft, ['GR']).helgdagar.map((h) => h.date), expected);
  assert.ok(expected.includes('2028-04-14') && expected.includes('2028-05-25'));
});

test('utkastet har status utkast, tom historik och eget läsår', () => {
  const s = { ...source(), status: 'fastställd', decidedOn: '2026-06-01', history: [{ id: 'h', time: 't', role: 'huvudman', action: 'Fastställd', comment: '' }] };
  const { draft } = copySchoolYear(s, 2027, []);
  assert.equal(draft.status, 'utkast');
  assert.deepEqual(draft.history, []);
  assert.equal(draft.decidedOn, undefined);
  assert.equal(draft.id, '2027/28');
  assert.equal(draft.label, 'Läsåret 2027/28');
  assert.equal(draft.unitId, 'u1');
});

test('granskningsposterna har deterministiska och unika id', () => {
  const id = 'klass:51a10000-0000-4000-8000-000000000101';
  const s = { ...withExceptions({ '2026-12-28': { kind: 'lovdag' }, '2027-05-03': { kind: 'studiedag' } }), groupExceptions: { [id]: { '2026-09-16': { cause: 'apl' }, '2026-09-17': { cause: 'apl' } } } };
  const a = copySchoolYear(s, 2027, []), b = copySchoolYear(structuredClone(s), 2027, []);
  assert.deepEqual(a.review.map((r) => r.id), b.review.map((r) => r.id));
  assert.equal(new Set(a.review.map((r) => r.id)).size, a.review.length);
  assert.ok(a.review.length >= 8);
  assertNothingReviewedInserted(a);
});
