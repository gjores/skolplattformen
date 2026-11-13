import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_UTKAST_STEG, medUtkast, schemaUtkast, tomtUtkast, utkastEfter, utkastPlaceringar, utkastSteg } from './schema-utkast.ts';

/** Syntetiskt förslag: tre pass på måndag, ett på viloytan. */
const forslag = { lessons: [
  { id: 'a', day: 0, startMin: 480, roomId: null },
  { id: 'b', day: 0, startMin: 600, roomId: 'sal-1' },
  { id: 'c', day: 1, startMin: 540, roomId: null },
  { id: 'd', day: null, startMin: null, roomId: null },
] };
const start = () => schemaUtkast(tomtUtkast(), { type: 'reset', forslag });
const run = (state, ...actions) => actions.reduce(schemaUtkast, state);

test('flytt, ångra och gör om ger samma placeringar', () => {
  const s0 = start(), s1 = run(s0, { type: 'move', lesson: 'a', day: 2, startMin: 660 });
  assert.deepEqual(s1.placements.a, { day: 2, startMin: 660, room: null });
  assert.equal(s1.undo.length, 1);
  const s2 = run(s1, { type: 'undo' });
  assert.deepEqual(s2.placements, s0.placements);
  assert.deepEqual([s2.undo.length, s2.redo.length], [0, 1]);
  const s3 = run(s2, { type: 'redo' });
  assert.deepEqual(s3.placements, s1.placements);
  assert.deepEqual([s3.undo.length, s3.redo.length], [1, 0]);
});

test('tre flyttar ångras i omvänd ordning och görs om i rätt ordning', () => {
  const s0 = start();
  const s1 = run(s0, { type: 'move', lesson: 'a', day: 2, startMin: 660 });
  const s2 = run(s1, { type: 'move', lesson: 'b', day: 3, startMin: 480, room: 'sal-2' });
  const s3 = run(s2, { type: 'move', lesson: 'a', day: 4, startMin: 500 });
  assert.equal(utkastSteg(s3, 'undo'), 'a');
  const u1 = run(s3, { type: 'undo' }), u2 = run(u1, { type: 'undo' }), u3 = run(u2, { type: 'undo' });
  assert.deepEqual(u1.placements, s2.placements);
  assert.deepEqual(u2.placements, s1.placements);
  assert.deepEqual(u3.placements, s0.placements);
  assert.equal(utkastSteg(u3, 'undo'), null);
  assert.equal(run(u3, { type: 'undo' }), u3, 'inget mer att ångra ändrar ingenting');
  assert.equal(utkastSteg(u3, 'redo'), 'a');
  const r1 = run(u3, { type: 'redo' }), r2 = run(r1, { type: 'redo' });
  assert.deepEqual(r1.placements, s1.placements);
  assert.deepEqual(r2.placements, s2.placements);
  // En ny flytt efter ångra tömmer gör om.
  const n = run(u2, { type: 'move', lesson: 'c', day: 0, startMin: 900 });
  assert.deepEqual([n.undo.length, n.redo.length], [2, 0]);
});

test('nytt förslag tömmer historiken men behåller verktyg och lager', () => {
  const s = run(start(), { type: 'move', lesson: 'a', day: 2, startMin: 660 }, { type: 'move', lesson: 'b', day: 2, startMin: 480 }, { type: 'undo' },
    { type: 'tool', tool: 'sparra' }, { type: 'layer', layer: 'lunch', on: false }, { type: 'pick', lesson: 'c' });
  assert.deepEqual([s.undo.length, s.redo.length, s.picked], [1, 1, 'c']);
  const next = run(s, { type: 'reset', forslag: { lessons: [{ id: 'x', day: 1, startMin: 480, roomId: null }] } });
  assert.deepEqual(next, { placements: { x: { day: 1, startMin: 480, room: null } }, picked: null, tool: 'sparra', layers: { lunch: false }, undo: [], redo: [] });
});

test('parkera och lägga ut igen', () => {
  const s0 = start();
  const parked = run(s0, { type: 'park', lesson: 'b' });
  assert.deepEqual(parked.placements.b, { day: null, startMin: null, room: null });
  assert.equal(utkastPlaceringar(parked.placements).some(p => p.lesson === 'b'), false);
  const out = run(parked, { type: 'move', lesson: 'd', day: 3, startMin: 720 }, { type: 'move', lesson: 'b', day: 4, startMin: 480 });
  assert.deepEqual(out.placements.d, { day: 3, startMin: 720, room: null });
  // Ett parkerat pass har ingen sal; ut igen utan angiven sal ger ingen sal.
  assert.deepEqual(out.placements.b, { day: 4, startMin: 480, room: null });
  assert.deepEqual(run(out, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }).placements, s0.placements);
});

test('kontrollens salar följer med i utkastet och placeringen kan prövas före ändringen', () => {
  const s0 = start(), action = { type: 'move', lesson: 'a', day: 2, startMin: 660 };
  const prov = utkastEfter(s0, action);
  assert.deepEqual(prov.a, { day: 2, startMin: 660, room: null });
  assert.deepEqual(s0.placements.a, { day: 0, startMin: 480, room: null }, 'att pröva ändrar inte utkastet');
  const s1 = schemaUtkast(s0, { ...action, rooms: { a: 'sal-3', b: 'sal-1', d: 'sal-9' } });
  assert.deepEqual([s1.placements.a.room, s1.placements.b.room, s1.placements.c.room, s1.placements.d.room], ['sal-3', 'sal-1', null, null]);
  assert.deepEqual(utkastEfter(s1, { type: 'undo' }), s0.placements);
  assert.equal(utkastEfter(s0, { type: 'move', lesson: 'saknas', day: 0, startMin: 480 }), null);
  assert.equal(schemaUtkast(s0, { type: 'pick', lesson: 'saknas' }), s0);
});

test('utkastet är serialiserbart och historiken har ett tak', () => {
  let s = start();
  for (let i = 0; i < SCHEMA_UTKAST_STEG + 5; i++) s = schemaUtkast(s, { type: 'move', lesson: 'a', day: i % 5, startMin: 480 + i });
  assert.equal(s.undo.length, SCHEMA_UTKAST_STEG);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  const lessons = medUtkast([{ id: 'a', title: 'Matematik', day: 0, startMin: 480, roomId: null }, { id: 'z', title: 'Okänd', day: 1, startMin: 500, roomId: null }], s.placements);
  assert.deepEqual(lessons.map(l => [l.title, l.day, l.startMin]), [['Matematik', s.placements.a.day, s.placements.a.startMin], ['Okänd', 1, 500]]);
});
