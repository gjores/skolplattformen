import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with { type: 'json' };
import { programFrame, frameStatus, canAddLevel, blockPoints, subjectPoints } from './programplan-table.ts';

const program = code => artifact.programs.find(p => p.code === code);
const ref = points => ({ subjectCode: 'X', subjectVersion: 1, itemCode: `X${points}`, points });

test('humanistiska programmet räknas som i Skolverkets programstruktur', () => {
  const frame = programFrame(program('HU25'), program('HU25').orientations[0].code);
  assert.deepEqual(frame.sections.map(s => s.points), [1150, 350, 400]);
  assert.equal(frame.fixedPoints, 1900);
  assert.equal(frame.specializationRoom, 300);
});

test('alternativa ämnen räknas en gång och nivåer summeras', () => {
  const foundation = program('ES25').foundation;
  const svenska = foundation.find(s => s.code === 'SVEN'), andraSprak = foundation.find(s => s.code === 'SVEA');
  assert.equal(subjectPoints(svenska), 300);
  assert.equal(blockPoints([svenska, andraSprak]), 300);
});

test('inriktning som saknas ger okänd ram i stället för en gissning', () => {
  assert.equal(programFrame(program('ES25'), null).specializationRoom, null);
  assert.equal(programFrame(program('ES25'), null).unresolved, 'orientation');
  assert.equal(canAddLevel(programFrame(program('ES25'), null), [], 100), false);
});

test('yrkesprogram har ingen verifierad totalsumma och blir därför inte kontrollerade mot en gräns', () => {
  const p = program('VO25'), frame = programFrame(p, null);
  assert.equal(p.orientations.length, 0);
  assert.equal(frame.sections.length, 2);
  assert.equal(frame.unresolved, 'total');
  assert.equal(frame.specializationRoom, null);
  assert.equal(canAddLevel(frame, [], 100), true);
});

test('ramen kan inte överskridas via canAddLevel och överskridet val markeras', () => {
  const frame = programFrame(program('HU25'), program('HU25').orientations[0].code);
  assert.equal(canAddLevel(frame, [ref(100), ref(100)], 100), true);
  assert.equal(canAddLevel(frame, [ref(100), ref(100), ref(100)], 50), false);
  assert.deepEqual(frameStatus(frame, [ref(100), ref(100)]), { chosen: 200, room: 300, remaining: 100, over: false });
  assert.equal(frameStatus(frame, [ref(200), ref(200)]).over, true);
});
