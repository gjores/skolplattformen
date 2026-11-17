import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aktiviteternasFel, parseAktiviteter } from './schema-aktiviteter.ts';
import { nySerieId, serieAktiviteter, serieKontroll } from './schema-serie.ts';

const mall = { id: 'aktivitet-9', typId: 'typ-4-0', typ: 'Mentorstid', name: 'Mentorstid', classRefs: ['k1', 'k2', 'k3'], groupRefs: [], teacherRefs: ['t1'], rooms: [], durationMin: 20,
  veckor: { typ: 'alla' }, visibleFor: 'alla', margin: null, tid: { typ: 'fast', day: 0, startMin: 480 } };
const rader = [{ classRef: 'k1', klass: 'TE27', teacherRef: 't1' }, { classRef: 'k2', klass: 'NA27A', teacherRef: 't2' }, { classRef: 'k3', klass: 'NA27B', teacherRef: null }];
const befintlig = { ...mall, id: 'aktivitet-1', serie: 'serie-3', classRefs: ['k9'] };

test('en per klass ger en egen aktivitet per klass med samma tid och en gemensam serie', () => {
  const nya = serieAktiviteter(mall, rader, [befintlig]);
  assert.deepEqual(nya.map(a => [a.id, a.serie, a.name, a.classRefs, a.teacherRefs]), [
    ['aktivitet-2', 'serie-4', 'Mentorstid TE27', ['k1'], ['t1']], ['aktivitet-3', 'serie-4', 'Mentorstid NA27A', ['k2'], ['t2']], ['aktivitet-4', 'serie-4', 'Mentorstid NA27B', ['k3'], []]]);
  assert.ok(nya.every(a => a.tid === mall.tid && a.durationMin === 20));
  assert.deepEqual(aktiviteternasFel([befintlig, ...nya]), []);
  assert.deepEqual(parseAktiviteter(JSON.parse(JSON.stringify([befintlig, ...nya]))), [befintlig, ...nya]);
  assert.equal(nySerieId([]), 'serie-1');
});
test('samma ansvarig för två klasser på fast tid är en krock; gränsen på 100 aktiviteter syns före sparning', () => {
  const larare = new Map([['t1', 'Provlärare 1'], ['t2', 'Provlärare 2']]);
  const dubbel = rader.map(r => ({ ...r, teacherRef: r.classRef === 'k3' ? 't1' : r.teacherRef }));
  const k = serieKontroll(serieAktiviteter(mall, dubbel, []), dubbel, [], larare);
  assert.equal(k.fel, null); assert.deepEqual(k.krockar, { k1: 'Provlärare 1 är ansvarig för TE27 och NA27B på samma tid.', k3: 'Provlärare 1 är ansvarig för NA27B och TE27 på samma tid.' });
  const motor = { ...mall, tid: { typ: 'motor', days: [0, 1], startMin: 480, endMin: 600 } };
  assert.deepEqual(serieKontroll(serieAktiviteter(motor, dubbel, []), dubbel, [], larare).krockar, {}, 'motorn placerar varje aktivitet för sig');
  const manga = Array.from({ length: 99 }, (_, i) => ({ ...mall, id: `aktivitet-${i + 1}` }));
  assert.equal(serieKontroll(serieAktiviteter(mall, rader, manga), rader, manga, larare).fel, 'Serien ger 3 aktiviteter. Skolan har 99 av högst 100.');
  assert.match(serieKontroll(serieAktiviteter(mall, rader.slice(0, 1), []), rader.slice(0, 1), [], larare).fel, /minst två klasser/u);
});
test('serien tolkas strikt', () => {
  assert.throws(() => parseAktiviteter([{ ...befintlig, serie: 'serie-0' }])); assert.throws(() => parseAktiviteter([{ ...befintlig, serie: 7 }]));
  assert.deepEqual(parseAktiviteter([{ ...mall }]), [mall], 'aktivitet utan serie tolkas som förut');
});
