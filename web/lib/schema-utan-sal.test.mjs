import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSchemaPlacements } from './schema-contract.ts';
import { flyttSal, motorProblem, salIfyllning, salLedig } from './schema-utan-sal.ts';

// Syntetiskt underlag: tre pass som får använda sal-1 och sal-2; pass-3 går bara på vårterminen. Sal-2 är spärrad måndag 13–14.
const marginal = { students: { before_min: 0, after_min: 0 }, teachers: { before_min: 0, after_min: 0 }, rooms: { before_min: 0, after_min: 10 } };
const problem = {
  version: 5, id: 'prov', time: { step_min: 5, start_grid_min: 5, days: [{ start_min: 480, end_min: 960 }, { start_min: 480, end_min: 960 }] },
  rooms: [{ id: 'sal-1' }, { id: 'sal-2', unavailable: [{ day: 0, start_min: 780, end_min: 840 }] }],
  lessons: [
    { id: 'pass-1', activity: 'a', duration_min: 60, teachers: [], groups: [], margin: marginal, rooms: { count: 1, allowed: ['sal-1', 'sal-2'] } },
    { id: 'pass-2', activity: 'a', duration_min: 60, teachers: [], groups: [], rooms: { count: 1, allowed: ['sal-1', 'sal-2'] }, locked: { day: 1, start_min: 480, rooms: ['sal-1'] } },
    { id: 'pass-3', activity: 'a', duration_min: 60, teachers: [], groups: [], periods: ['vt'], rooms: { count: 1, allowed: ['sal-1', 'sal-2'] } },
    { id: 'pass-4', activity: 'b', duration_min: 40, teachers: [], groups: [] },
  ],
};
const at = (lesson, day, startMin, room) => ({ lesson, day, startMin, room });

test('salIfyllning: bara utkast utan salregister fyller i sal', () => {
  assert.equal(salIfyllning({}), true);
  assert.equal(salIfyllning({ salregister: { nasta: 1, arv: [], salar: [] } }), false);
});

test('kontrollen fyller i första lediga sal utan register men lämnar passet utan sal med register', () => {
  const placements = [at('pass-1', 0, 480, 'sal-1'), at('pass-3', 0, 480, null), at('pass-2', 1, 480, 'sal-1')];
  assert.equal(checkSchemaPlacements(placements, problem)[1].room, 'sal-2');
  assert.equal(checkSchemaPlacements(placements, problem, false)[1].room, null);
  // En sal som inte längre är tillåten släpps i båda fallen.
  const ej = [at('pass-1', 0, 480, 'sal-9'), at('pass-2', 1, 480, 'sal-1')];
  assert.equal(checkSchemaPlacements(ej, problem, false)[0].room, null);
});

test('motorProblem: lagt pass utan sal skickas utan salkrav, övriga oförändrade', () => {
  assert.equal(motorProblem(problem, [at('pass-1', 0, 480, 'sal-1')]), problem);
  const m = motorProblem(problem, [at('pass-1', 0, 480, null), at('pass-2', 1, 480, null), at('pass-4', 0, 600, null)]);
  assert.equal(m.lessons[0].rooms, undefined);
  assert.deepEqual(m.lessons[1].locked, { day: 1, start_min: 480 });
  assert.equal(m.lessons[1].rooms, undefined);
  assert.deepEqual(m.lessons[2], problem.lessons[2]);
  assert.deepEqual(m.lessons[3], problem.lessons[3]);
  assert.ok(problem.lessons[0].rooms, 'originalet ändras inte');
  // Passet vars lägen prövas skickas utan salkrav även när det inte är lagt.
  assert.equal(motorProblem(problem, [], ['pass-3']).lessons[2].rooms, undefined);
});

test('salLedig: krock, period, salmarginal, spärr och skoldagens slut', () => {
  const ovriga = [at('pass-1', 0, 600, 'sal-1'), at('pass-3', 0, 480, 'sal-1')];
  // pass-1 i sal-1 10:00–11:00 med 10 min salmarginal efter.
  assert.equal(salLedig(problem, ovriga, 'pass-2', 'sal-1', 0, 600), false, 'samma tid');
  assert.equal(salLedig(problem, ovriga, 'pass-2', 'sal-1', 0, 660), false, 'marginalen efter pass-1 ligger i vägen');
  assert.equal(salLedig(problem, ovriga, 'pass-2', 'sal-1', 0, 670), true, 'efter marginalen');
  assert.equal(salLedig(problem, ovriga, 'pass-2', 'sal-1', 0, 540), true, 'pass-2 har ingen marginal och slutar när pass-1 börjar');
  assert.equal(salLedig(problem, [at('pass-2', 0, 600, 'sal-1')], 'pass-1', 'sal-1', 0, 540), false, 'egen marginal mot annat pass undervisning');
  assert.equal(salLedig(problem, [at('pass-2', 0, 610, 'sal-1')], 'pass-1', 'sal-1', 0, 540), true);
  // pass-3 går vt och pass-1 har ingen period: de delar period. Två vt-pass mot ett ht-pass delar inte.
  const htProblem = { ...problem, lessons: problem.lessons.map(l => l.id === 'pass-2' ? { ...l, periods: ['ht'] } : l) };
  assert.equal(salLedig(htProblem, [at('pass-3', 0, 480, 'sal-1')], 'pass-2', 'sal-1', 0, 480), true, 'olika perioder');
  assert.equal(salLedig(problem, [at('pass-3', 0, 480, 'sal-1')], 'pass-2', 'sal-1', 0, 480), false, 'samma period');
  assert.equal(salLedig(problem, [], 'pass-2', 'sal-2', 0, 750), false, 'spärrad 13–14');
  assert.equal(salLedig(problem, [], 'pass-2', 'sal-2', 0, 720), true, 'slutar när spärren börjar');
  assert.equal(salLedig(problem, [], 'pass-1', 'sal-2', 0, 720), false, 'salmarginalen når in i spärren');
  assert.equal(salLedig(problem, [], 'pass-1', 'sal-1', 0, 900), false, 'salmarginalen ryms inte före dagens slut');
  assert.equal(salLedig(problem, [], 'pass-1', 'sal-1', 0, 890), true);
  assert.equal(salLedig(problem, [], 'pass-4', 'sal-1', 0, 480), false, 'passet ska inte ha sal');
  assert.equal(salLedig(problem, [], 'pass-1', 'sal-9', 0, 480), false, 'okänd sal');
});

test('flyttSal: egen sal behålls bara där den är ledig; uttryckligt val behålls', () => {
  assert.equal(flyttSal('sal-1', undefined, { room: 'sal-1' }), 'sal-1');
  assert.equal(flyttSal('sal-1', undefined, { room: null }), null);
  assert.equal(flyttSal('sal-1', 'sal-1', { room: null }), null, 'panelens förval är den egna salen');
  assert.equal(flyttSal('sal-1', 'sal-2', { room: null }), 'sal-2', 'uttryckligt annat val');
  assert.equal(flyttSal('sal-1', null, { room: 'sal-1' }), null, 'uttryckligt Ingen sal');
  assert.equal(flyttSal('sal-1', undefined, undefined), undefined, 'utan läge behålls salen');
  assert.equal(flyttSal(null, undefined, { room: null }), undefined, 'utan sal förblir utan sal');
});
