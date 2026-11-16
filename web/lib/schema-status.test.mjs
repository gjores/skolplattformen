import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schemaLage, schemaLagesBrickor } from './schema-status.ts';

const p = (extra = {}) => ({ day: 0, roomIds: [], roomId: null, ...extra });
const text = lessons => schemaLagesBrickor(schemaLage(lessons)).map(b => `${b.ton}|${b.text}`);

test('alla pass med tid men utan salbehov är inte klart: tid, sal och kapacitet redovisas var för sig', () => {
  assert.deepEqual(text([p(), p(), p()]), ['success|Tid · Alla pass har tid', 'warning|Sal · Salbehov saknas för 3 pass', '|Kapacitet · Inga pass har sal att kontrollera']);
});
test('olagda pass, pass utan tilldelad sal och okänd kapacitet ger var sitt besked', () => {
  const lessons = [p({ roomIds: ['sal-1'], roomId: 'sal-1' }), p({ roomIds: ['sal-1'] }), p({ day: null, roomIds: ['sal-1'] }), p({ egenAktivitet: { id: 'a' } })];
  assert.deepEqual(text(lessons), ['warning|Tid · 3 av 4 pass har tid', 'warning|Sal · 1 av 3 pass som ska ha sal har sal', '|Kapacitet · Inte kontrollerad för 1 pass']);
});
test('sal behövs inte är ett besvarat salbehov; hinder och för få platser syns med antal', () => {
  const sal = (lage, kapacitet, hinder) => ({ sal: { lage, ...(kapacitet ? { kapacitet } : {}), ...(hinder ? { hinder } : {}) } });
  const lessons = [p(sal('ingen')), p({ roomIds: ['sal-1', 'sal-2'], roomId: 'sal-2', ...sal('allman', { 'sal-1': 'racker', 'sal-2': 'for_liten' }) }),
    p({ roomIds: ['sal-1'], roomId: 'sal-1', ...sal('allman', { 'sal-1': 'racker' }) }), p(sal('sarskild', null, true))];
  assert.deepEqual(schemaLage(lessons).sal, { skaHaSal: 2, medSal: 2, utanSalbehov: 0, hinder: 1 });
  assert.deepEqual(text(lessons), ['success|Tid · Alla pass har tid', 'warning|Sal · Alla 2 pass som ska ha sal har sal, ingen lämplig sal finns för 1 pass', 'warning|Kapacitet · För få platser för 1 pass']);
});
test('grönt för sal och kapacitet kräver att allt är tilldelat och kontrollerat', () => {
  const ok = p({ roomIds: ['sal-1'], roomId: 'sal-1', sal: { lage: 'allman', kapacitet: { 'sal-1': 'racker' } } });
  assert.deepEqual(text([ok, ok]), ['success|Tid · Alla pass har tid', 'success|Sal · Alla 2 pass som ska ha sal har sal', 'success|Kapacitet · Platserna räcker för 2 pass']);
  assert.equal(text([])[0], 'warning|Tid · Inga pass i underlaget');
});
