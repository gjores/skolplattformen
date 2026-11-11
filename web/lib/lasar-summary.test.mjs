import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lasarBasisChange, lasarBasisText, lasarImWeeklyText } from './lasar-summary.ts';

// 05.1.1-13 (D-11, LASAR-05): texter och skillnad ur kalenderns sammanfattning. Syntetiska data; texterna ordagrant enligt
// UI-SPEC avsnitt 15.
const unit = '51c10000-0000-4000-8000-000000000001';
const hash = c => `sha256:${c.repeat(64)}`;
const stat = (over = {}) => ({ version: 2, decidedOn: '2027-06-01', htSchoolDays: 88, vtSchoolDays: 95, contentHash: hash('a'), ...over });
const summary = (over = {}) => ({ contractVersion: 'lasar_sql_v1', unitId: unit, schoolYear: 2027, current: stat(),
  previous: stat({ version: 1, decidedOn: '2027-05-03', htSchoolDays: 83, contentHash: hash('b') }), ...over });
const row = (key, over = {}) => ({ key, needBasis: 'weekly_calendar', stale: true, ...over });

test('IM-texten med fastställd kalender ger version och skoldagar för läsåret, ordagrant', () => {
  assert.equal(lasarImWeeklyText(summary(), 2027),
    'Veckoram. Läsårskalendern 2027/28 är fastställd (version 2, 183 skoldagar). Individuell fördelning visas inte här.');
});

test('IM-texten utan fastställd kalender säger att inga årstimmar beräknas, ordagrant', () => {
  const expected = 'Veckoram. Läsårskalendern för 2027/28 är inte fastställd. Inga årstimmar beräknas.';
  assert.equal(lasarImWeeklyText(summary({ current: null, previous: null }), 2027), expected);
  assert.equal(lasarImWeeklyText(null, 2027), expected);
});

test('IM-texten använder inte en sammanfattning för ett annat läsår', () => {
  assert.equal(lasarImWeeklyText(summary(), 2028), 'Veckoram. Läsårskalendern för 2028/29 är inte fastställd. Inga årstimmar beräknas.');
});

test('skillnaden ger version före och efter och skoldagar per termin för raderna som räknar med en äldre version', () => {
  const rows = [row('im-sv'), row('im-ma', { stale: false }), row('gy-en', { needBasis: 'terms' }), row('im-en')];
  assert.deepEqual(lasarBasisChange(summary(), rows), {
    before: { version: 1, decidedOn: '2027-05-03', htSchoolDays: 83, vtSchoolDays: 95, schoolDays: 178 },
    after: { version: 2, decidedOn: '2027-06-01', htSchoolDays: 88, vtSchoolDays: 95, schoolDays: 183 },
    rows: [rows[0], rows[3]],
  });
});

test('skillnaden är null utan föregående version, utan gällande version och utan berörda rader', () => {
  assert.equal(lasarBasisChange(summary({ previous: null }), [row('im-sv')]), null);
  assert.equal(lasarBasisChange(summary({ current: null, previous: null }), [row('im-sv')]), null);
  assert.equal(lasarBasisChange(null, [row('im-sv')]), null);
  assert.equal(lasarBasisChange(summary(), [row('im-sv', { stale: false }), row('gy', { needBasis: 'even_split' })]), null);
  assert.equal(lasarBasisChange(summary(), []), null);
});

test('markeringens text ger ny version med datum och skoldagar före och efter, ordagrant', () => {
  assert.equal(lasarBasisText(lasarBasisChange(summary(), [row('im-sv')])),
    'Läsårskalendern har en ny fastställd version (2, 1 juni 2027). Underlaget räknar med version 1: 178 → 183 skoldagar.');
});

test('funktionerna är rena: sammanfattningen och raderna ändras inte', () => {
  const s = summary(), rows = [row('im-sv')], before = structuredClone({ s, rows });
  lasarImWeeklyText(s, 2027); lasarBasisText(lasarBasisChange(s, rows));
  assert.deepEqual({ s, rows }, before);
});
