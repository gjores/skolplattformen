import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagesfalt, stegaStart } from './schema-lagesfalt.ts';

const p = (day, startMin, state) => ({ day, startMin, state });
test('starttider i följd med samma läge blir ett fält; ett annat läge, en lucka eller en annan dag börjar ett nytt', () => {
  const positions = [p(0, 480, 'fri'), p(0, 485, 'fri'), p(0, 490, 'fri'), p(0, 495, 'byte'), p(0, 500, 'byte'), p(0, 510, 'byte'), p(1, 480, 'fri'), p(0, 515, 'byte')];
  assert.deepEqual(lagesfalt(positions, 5), [
    { day: 0, startMin: 480, endMin: 495, state: 'fri', starter: 3 },
    { day: 0, startMin: 495, endMin: 505, state: 'byte', starter: 2 },
    { day: 0, startMin: 510, endMin: 520, state: 'byte', starter: 2 },
    { day: 1, startMin: 480, endMin: 485, state: 'fri', starter: 1 }]);
  // Tidsaxeln är rättvis: fälten täcker exakt de prövade starttiderna och inget däremellan.
  const minuter = lagesfalt(positions, 5).reduce((sum, f) => sum + f.endMin - f.startMin, 0);
  assert.equal(minuter, positions.length * 5);
  assert.deepEqual(lagesfalt([], 5), []);
});
test('stegning går till närmaste möjliga starttid åt valt håll', () => {
  const starter = [480, 485, 490, 630, 635, 640];
  assert.equal(stegaStart(starter, 630, 1), 635); assert.equal(stegaStart(starter, 635, -1), 630);
  assert.equal(stegaStart(starter, 490, 1), 630, 'hoppar över tider där passet inte får plats');
  assert.equal(stegaStart(starter, 640, 1), null); assert.equal(stegaStart(starter, 480, -1), null);
});
