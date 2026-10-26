import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocationQueue, candidateTotals, nextAfter, queueSubject } from './tjanst-queue.ts';

const uid = n => `51a30000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const link = { seriesName: 'Syntetisk' };
const entry = (key, label, { rows = [], need = [h(50), h(50)], covered = [0, 0] } = {}) =>
  ({ need: { sourceKey: key, label, needHt: need[0], needVt: need[1] }, rows, cov: { covered: { ht: covered[0], vt: covered[1] } } });
const groups = () => [
  { cls: { classId: uid(1), name: 'TE1', link }, entries: [entry('a', 'Engelska 5'), entry('b', 'Matematik 1c', { covered: [h(50), h(50)] }), entry('c', 'Svenska 1')] },
  { cls: { classId: uid(2), name: 'EK1', link }, entries: [entry('d', 'Engelska 5'), entry('e', 'Historia 1a1', { need: [null, null] })] },
  { cls: { classId: uid(3), name: 'NA1', link: null }, entries: [entry('f', 'Fysik 1')] },
];

test('kön innehåller ofördelade behov i klassordning; okänt behov och okopplade klasser ingår inte', () => {
  assert.deepEqual(allocationQueue(groups(), 'ar').map(i => i.sourceKey), ['a', 'c', 'd']);
  assert.deepEqual(allocationQueue(groups(), 'ar').map(i => i.group), ['TE1', 'TE1', 'EK1']);
});

test('gruppering per ämne och sökning i kurs, ämne och klass', () => {
  const byAmne = allocationQueue(groups(), 'ar', { groupBy: 'amne' });
  assert.deepEqual(byAmne.map(i => [i.subject, i.className]), [['Engelska', 'EK1'], ['Engelska', 'TE1'], ['Svenska', 'TE1']]);
  assert.deepEqual(allocationQueue(groups(), 'ar', { search: 'engelska' }).map(i => i.sourceKey), ['a', 'd']);
  assert.deepEqual(allocationQueue(groups(), 'ar', { search: 'ek1' }).map(i => i.sourceKey), ['d']);
  assert.equal(queueSubject('Svenska – Nivå 1'), 'Svenska');
});

test('vakant rad är ofördelad även när tiden är täckt; samläsning räknas genom täckningen en gång', () => {
  const g = [{ cls: { classId: uid(1), name: 'TE1', link }, entries: [
    entry('v', 'Kemi 1', { rows: [{ personId: null, jointGroupId: null }], covered: [h(50), h(50)] }),
    entry('j', 'Svenska 1', { rows: [{ personId: uid(9), jointGroupId: uid(8) }], covered: [h(50), h(50)] })] }];
  assert.deepEqual(allocationQueue(g, 'ar').map(i => i.sourceKey), ['v']);
});

test('nästa behov efter val: framåt, hoppar över det valda och börjar om vid slutet', () => {
  const before = allocationQueue(groups(), 'ar');
  const after = before.filter(i => i.sourceKey !== 'a');
  assert.equal(nextAfter(before, after, 'a').sourceKey, 'c');
  assert.equal(nextAfter(before, before.filter(i => i.sourceKey !== 'd'), 'd').sourceKey, 'a', 'börjar om');
  assert.equal(nextAfter(before, before, 'c').sourceKey, 'd', 'hoppa över: behovet finns kvar');
  assert.equal(nextAfter(before, [], 'a'), null);
  assert.equal(nextAfter([], after, 'x').sourceKey, 'c', 'okänt behov ger första i kön');
});

test('kandidatens undervisning före och efter valet; samläsning räknas en gång, specialuppdrag ingår inte', () => {
  const p = uid(5), joint = { id: uid(8), teachers: [{ personId: p, ht: h(10), vt: h(10) }] };
  const rows = [{ id: uid(20), personId: p, teacherHt: h(30), teacherVt: h(20), jointGroupId: null },
    { id: uid(21), personId: p, teacherHt: h(99), teacherVt: h(99), jointGroupId: joint.id }];
  joint.rowIds = [uid(21)];
  const specials = [{ personId: p, ht: h(5), vt: h(5) }];
  assert.deepEqual(candidateTotals(p, rows, specials, [joint], { ht: h(50), vt: h(40) }),
    { before: { ht: h(40), vt: h(30), year: h(70) }, after: { ht: h(90), vt: h(70), year: h(160) } });
});
