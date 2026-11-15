import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_UTKAST_STEG, avvikelseRad, avvikelseNyckel, medvetenMarkering, medvetenKrock, medvetenPubliceringssparr, medvetnaAvvikelser, medvetenSteg, flyttaMarkering, laggAldrigHar, markeringMellan, markeringVid, medUtkast, passPaVillkor, schemaUtkast, sparrRegel, sparrResurser,
  stegMal, tomtUtkast, utkastEfter, utkastPlaceringar, utkastSteg, villkorSteg } from './schema-utkast.ts';

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
  assert.deepEqual(next, { placements: { x: { day: 1, startMin: 480, room: null } }, picked: null, selected: [], locked: {}, intentional: [], tool: 'sparra', layers: { lunch: false }, undo: [], redo: [] });
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

// 05.2-SM-MENY: spärrar, lägg aldrig här, piltangenter och markerad tid. Syntetiskt underlag: skoldag 08:00–16:30, startrutnät 10 min.
const days = Array.from({ length: 5 }, () => ({ startMin: 480, endMin: 990 }));
const underlag = {
  days, startGridMin: 10,
  classes: [{ id: 'grupp-1', name: 'Klass 1' }, { id: 'grupp-2', name: 'Spanska' }],
  teachers: [{ id: 'larare-1', name: 'Provlärare 1' }, { id: 'larare-2', name: 'Provlärare 2' }],
  rooms: [{ id: 'sal-1', name: 'Sal 204' }],
  resurser: { klass: [{ ref: 'k1', name: 'Klass 1' }], grupp: [{ ref: 'g1', name: 'Spanska' }], amne: [], larare: [{ ref: 't1', name: 'Provlärare 1' }, { ref: 't2', name: 'Provlärare 2' }] },
};
const pass = (id, title, day, startMin, durationMin, extra = {}) => ({ id, title, day, startMin, durationMin, marginMin: 0, classIds: ['grupp-1'], teacherIds: ['larare-1'], roomId: null, ...extra });
const vecka = [
  pass('p1', 'Samhällskunskap', 3, 850, 65, { teacherIds: ['larare-2'], roomId: 'sal-1' }),
  pass('p2', 'Svenska', 3, 770, 65),
  pass('p3', 'Spanska', 3, 920, 60, { classIds: ['grupp-1', 'grupp-2'] }),
  pass('p4', 'Svenska', 0, 480, 60),
];

test('en spärr läggs till och ångras och görs om i utkastet, utan att något pass flyttas', () => {
  const m = markeringMellan(days, 3, 840, 990), regel = sparrRegel('sparrad', { slag: 'klass', ref: 'k1' }, m);
  assert.deepEqual(regel, { slag: 'klass', ref: 'k1', typ: 'sparrad', days: [3], startMin: 840, endMin: 990 });
  const s0 = start(), s1 = run(s0, { type: 'villkor', fore: [], efter: [regel], text: 'Spärrad · Klass 1', intentional: [] });
  assert.equal(s1.placements, s0.placements);
  assert.equal(villkorSteg(s1.undo.at(-1)), true);
  assert.deepEqual(s1.undo.at(-1), { villkor: [], efter: [regel], text: 'Spärrad · Klass 1', intentional: [] });
  // Ett villkorssteg prövas inte av kontrollen: inga placeringar och inget pass.
  assert.equal(utkastEfter(s1, { type: 'undo' }), null);
  assert.equal(utkastSteg(s1, 'undo'), null);
  const u = run(s1, { type: 'undo' });
  assert.deepEqual([u.undo.length, u.redo.length], [0, 1]);
  assert.deepEqual(u.redo.at(-1), s1.undo.at(-1));
  assert.deepEqual(run(u, { type: 'redo' }), s1);
  // Flytt och spärr ångras i omvänd ordning.
  const s2 = run(s1, { type: 'move', lesson: 'a', day: 2, startMin: 660 });
  assert.equal(utkastSteg(s2, 'undo'), 'a');
  const u2 = run(s2, { type: 'undo' });
  assert.deepEqual(u2.placements, s0.placements);
  assert.equal(villkorSteg(u2.undo.at(-1)), true);
  // Salarna efter en omkontroll för ändrade villkor (05.2-SM-VILLKOR-DIREKT): inget pass flyttas och inget ångra-steg läggs till.
  const s3 = run(s1, { type: 'salar', rooms: { a: 'sal-2', b: null } });
  assert.deepEqual([s3.placements.a, s3.placements.b, s3.placements.d, s3.undo, s3.redo], [{ day: 0, startMin: 480, room: 'sal-2' }, { day: 0, startMin: 600, room: null },
    { day: null, startMin: null, room: null }, s1.undo, s1.redo]);
});

test('passet säger varför det avviker, ur kontrollens koder: spärrad tid, tillåten tid, sal och skoldag', () => {
  const m = markeringMellan(days, 3, 840, 990), sparr = sparrRegel('sparrad', { slag: 'klass', ref: 'k1' }, m), tillat = sparrRegel('tillaten', { slag: 'amne', ref: 'Svenska' }, m);
  // Vilka pass som avviker avgör kontrollen; utan dess kod ingen rad, även när passet ligger på spärren.
  assert.equal(avvikelseRad(underlag, [sparr], [], vecka[0]), null);
  assert.equal(avvikelseRad(underlag, [sparr], ['student_clash'], vecka[0]), null);
  assert.equal(avvikelseRad(underlag, [sparr], ['outside_allowed'], vecka[0]), 'Ligger på spärrad tid');
  assert.equal(avvikelseRad(underlag, [sparr, tillat], ['outside_allowed'], vecka[3]), 'Utanför tillåten tid');
  assert.equal(avvikelseRad(underlag, [], ['room_unavailable', 'teacher_clash'], vecka[0]), 'Salen är spärrad då');
  assert.equal(avvikelseRad(underlag, [], ['room_unfit'], vecka[0]), 'Salen följer inte salvillkoret');
  assert.equal(avvikelseRad(underlag, [], ['outside_day'], vecka[0]), 'Utanför skoldagen');
});

test('det en spärr kan gälla är den som visas och lärare, sal, ämne och grupper för passen som ligger där', () => {
  const m = markeringMellan(days, 3, 840, 990);
  assert.deepEqual(sparrResurser(underlag, 'grupp-1', vecka, m).map(r => [r.slag, r.ref, r.namn]), [
    ['klass', 'k1', 'Klass 1'], ['larare', 't2', 'Provlärare 2 (Samhällskunskap)'], ['larare', 't1', 'Provlärare 1 (Spanska)'],
    ['sal', 'Sal 204', 'Sal 204'], ['amne', 'Samhällskunskap', 'Ämnet Samhällskunskap'], ['amne', 'Spanska', 'Ämnet Spanska'], ['grupp', 'g1', 'Spanska']]);
  // En lärare som visas: läraren först. Tom tid: bara den som visas.
  assert.deepEqual(sparrResurser(underlag, 'larare-1', vecka, markeringMellan(days, 1, 480, 540)).map(r => r.namn), ['Provlärare 1']);
  // Tillåten tid: allt utanför de tillåtna tiderna för samma resurs ligger fel, även andra dagar.
  const tillat = sparrRegel('tillaten', { slag: 'amne', ref: 'Svenska' }, m);
  assert.deepEqual(passPaVillkor(underlag, [tillat], 0, vecka).map(l => l.id), ['p2', 'p4']);
  assert.deepEqual(passPaVillkor(underlag, [tillat, sparrRegel('tillaten', { slag: 'amne', ref: 'Svenska' }, { day: 0, startMin: 480, endMin: 600 }),
    sparrRegel('tillaten', { slag: 'amne', ref: 'Svenska' }, { day: 3, startMin: 700, endMin: 840 })], 0, vecka).map(l => l.id), []);
  assert.deepEqual(passPaVillkor(underlag, [{ slag: 'sal', ref: 'Sal 204', typ: 'sparrad', days: [3], startMin: 900, endMin: 990 }], 0, vecka).map(l => l.id), ['p1']);
});

test('lägg aldrig här ger spärrad tid för passets ämne på passets dag och tid', () => {
  assert.deepEqual(laggAldrigHar({ title: 'Programämne', day: 2, startMin: 780, durationMin: 65 }),
    { slag: 'amne', ref: 'Programämne', typ: 'sparrad', days: [2], startMin: 780, endMin: 845 });
  assert.equal(laggAldrigHar({ title: 'Programämne', day: null, startMin: null, durationMin: 65 }), null, 'ett pass på viloytan har ingen plats');
  const regel = laggAldrigHar(vecka[0]);
  assert.deepEqual(passPaVillkor(underlag, [regel], 0, vecka).map(l => l.id), ['p1'], 'passet självt ligger på spärren tills det flyttas');
  assert.deepEqual(passPaVillkor(underlag, [regel], 0, [{ ...vecka[0], startMin: 480 }]).map(l => l.id), []);
});

test('piltangenterna flyttar ett pass ett startsteg eller en dag och stannar vid dagens gräns', () => {
  const f = { days, startGridMin: 10 };
  assert.deepEqual(stegMal(f, pass('x', 'A', 2, 600, 60), 'ner'), { day: 2, startMin: 610 });
  assert.deepEqual(stegMal(f, pass('x', 'A', 2, 600, 60), 'upp'), { day: 2, startMin: 590 });
  assert.deepEqual(stegMal(f, pass('x', 'A', 2, 600, 60), 'hoger'), { day: 3, startMin: 600 });
  assert.deepEqual(stegMal(f, pass('x', 'A', 2, 600, 60), 'vanster'), { day: 1, startMin: 600 });
  // Dagens början och slut (passet med marginal ska rymmas), veckans första och sista dag.
  assert.equal(stegMal(f, pass('x', 'A', 2, 480, 60), 'upp'), null);
  assert.equal(stegMal(f, pass('x', 'A', 2, 930, 60), 'ner'), null);
  assert.equal(stegMal(f, { ...pass('x', 'A', 2, 920, 60), marginMin: 10 }, 'ner'), null);
  assert.equal(stegMal(f, pass('x', 'A', 0, 600, 60), 'vanster'), null);
  assert.equal(stegMal(f, pass('x', 'A', 4, 600, 60), 'hoger'), null);
  assert.equal(stegMal({ days: [...days.slice(0, 3), { startMin: 480, endMin: 900 }, days[4]], startGridMin: 10 }, pass('x', 'A', 2, 860, 60), 'hoger'), null, 'tiden ryms inte nästa dag');
  assert.equal(stegMal(f, pass('x', 'A', null, null, 60), 'ner'), null);
});

test('markerad tid följer 5-minutersrutnätet och skoldagen; pilar flyttar och Skift+pil utökar', () => {
  assert.deepEqual(markeringMellan(days, 3, 1002, 838), { day: 3, startMin: 840, endMin: 990 });
  assert.deepEqual(markeringMellan(days, 3, 600, 601), { day: 3, startMin: 600, endMin: 605 });
  assert.deepEqual(markeringVid(days, 1, 603), { day: 1, startMin: 600, endMin: 660 });
  assert.deepEqual(markeringVid(days, 1, 960), { day: 1, startMin: 960, endMin: 990 });
  let m = markeringVid(days, 0, 480);
  for (let i = 0; i < 3; i++) m = flyttaMarkering(days, m, 'hoger');
  for (let i = 0; i < 24; i++) m = flyttaMarkering(days, m, 'ner');
  assert.deepEqual(m, { day: 3, startMin: 840, endMin: 900 });
  for (let i = 0; i < 6; i++) m = flyttaMarkering(days, m, 'ner', true);
  assert.deepEqual(m, { day: 3, startMin: 840, endMin: 990 });
  assert.deepEqual(flyttaMarkering(days, m, 'ner', true), m, 'utökas inte förbi dagens slut');
  assert.deepEqual(flyttaMarkering(days, m, 'ner'), m, 'flyttas inte förbi dagens slut');
  assert.deepEqual(flyttaMarkering(days, m, 'hoger'), { day: 4, startMin: 840, endMin: 990 });
  assert.deepEqual(flyttaMarkering(days, { day: 4, startMin: 840, endMin: 990 }, 'hoger'), { day: 4, startMin: 840, endMin: 990 });
  assert.deepEqual(flyttaMarkering(days, { day: 0, startMin: 480, endMin: 495 }, 'upp', true), { day: 0, startMin: 480, endMin: 485 }, 'minst 5 minuter');
});

test('byte av två pass ger ett ångra-steg och behåller sal när den följer passet', () => {
  const first = start(), changed = schemaUtkast(first, { type: 'swap', lesson: 'a', other: 'b' });
  assert.deepEqual(changed.placements.a, { day: 0, startMin: 600, room: null });
  assert.deepEqual(changed.placements.b, { day: 0, startMin: 480, room: 'sal-1' });
  assert.equal(changed.undo.length, 1);
  assert.deepEqual(schemaUtkast(changed, { type: 'undo' }).placements, first.placements);
  assert.equal(utkastEfter(first, { type: 'swap', lesson: 'a', other: 'd' }), null, 'pass på viloytan byts inte');
});

test('tre markerade pass flyttas med samma tidsförskjutning och ångras tillsammans', () => {
  const first = schemaUtkast(start(), { type: 'select', lessons: ['a', 'b', 'c'] });
  const changed = schemaUtkast(first, { type: 'move', lesson: 'a', day: 1, startMin: 510, fler: ['b', 'c'] });
  assert.deepEqual(changed.placements, { ...first.placements, a: { day: 1, startMin: 510, room: null }, b: { day: 1, startMin: 630, room: 'sal-1' }, c: { day: 2, startMin: 570, room: null } });
  assert.equal(changed.undo.length, 1);
  assert.deepEqual(schemaUtkast(changed, { type: 'undo' }).placements, first.placements);
});

test('lås hela dagen, lås upp och ångra bevarar platser och blockerar flytt, byte och parkering', () => {
  const first = start(), locked = schemaUtkast(first, { type: 'lock', lesson: 'a', fler: ['b'], locked: true });
  assert.deepEqual(locked.locked, { a: first.placements.a, b: first.placements.b });
  for (const action of [{ type: 'move', lesson: 'a', day: 1, startMin: 600 }, { type: 'park', lesson: 'b' }, { type: 'swap', lesson: 'a', other: 'c' }]) {
    assert.equal(utkastEfter(locked, action), null);
    assert.equal(schemaUtkast(locked, action), locked);
  }
  const unlocked = schemaUtkast(locked, { type: 'lock', lesson: 'a', fler: ['b'], locked: false });
  assert.deepEqual(unlocked.locked, {});
  assert.deepEqual(schemaUtkast(unlocked, { type: 'undo' }).locked, locked.locked);
  const undo = schemaUtkast(locked, { type: 'undo' });
  assert.deepEqual(undo.locked, {});
  assert.deepEqual(schemaUtkast(undo, { type: 'redo' }).locked, locked.locked);
});

test('olösbart förslag bevarar låsens ursprungliga placering utan att påstå att passet är lagt', () => {
  const state = schemaUtkast(tomtUtkast(), { type: 'reset', forslag: { lessons: [{ id: 'a', day: null, startMin: null, roomId: null }], locks: [{ lesson: 'a', day: 1, startMin: 600, room: null }] } });
  assert.equal(state.placements.a.day, null);
  assert.deepEqual(state.locked.a, { day: 1, startMin: 600, room: null });
});

test('sal följer det bytta passet när den är ledig och släpps när den är upptagen', async () => {
  const { bytSalar } = await import('./schema-utkast.ts');
  const lessons = [{ id: 'a', durationMin: 60, term: 'ht' }, { id: 'b', durationMin: 60, term: 'ht' }, { id: 'c', durationMin: 45, term: 'ht' }];
  const places = { a: { day: 0, startMin: 600, room: 'sal-1' }, b: { day: 0, startMin: 480, room: 'sal-2' }, c: { day: 0, startMin: 620, room: 'sal-1' } };
  assert.deepEqual(bytSalar({ lessons }, places, ['a', 'b']), { ...places, a: { ...places.a, room: null } });
  assert.deepEqual(bytSalar({ lessons: lessons.map(l => l.id === 'c' ? { ...l, term: 'vt' } : l) }, places, ['a', 'b']), places, 'olika terminer upptar inte salen samtidigt');
});


test('helt placeringsförslag med tre ändrade pass är ett steg och håller låsta pass orörda', () => {
  const s0 = start(), placements = [{ lesson: 'a', day: 2, startMin: 480, room: null }, { lesson: 'b', day: 2, startMin: 600, room: 'sal-1' }, { lesson: 'c', day: 1, startMin: 540, room: null }, { lesson: 'd', day: 3, startMin: 720, room: null }];
  const s1 = schemaUtkast(s0, { type: 'placement', lesson: 'd', placements });
  assert.equal(s1.undo.length, 1); assert.equal(utkastPlaceringar(s1.placements).length, 4);
  const undo = schemaUtkast(s1, { type: 'undo' }); assert.deepEqual(undo.placements, s0.placements);
  assert.deepEqual(schemaUtkast(undo, { type: 'redo' }).placements, s1.placements);
  const locked = schemaUtkast(s0, { type: 'lock', lesson: 'a', locked: true });
  assert.equal(schemaUtkast(locked, { type: 'placement', lesson: 'd', placements }), locked);
  assert.equal(schemaUtkast(s0, { type: 'placement', lesson: 'd', placements: [...placements, placements[0]] }), s0);
  assert.equal(schemaUtkast(s0, { type: 'placement', lesson: 'd', placements: [...placements, { lesson: 'unknown', day: 0, startMin: 480, room: null }] }), s0);
});

test('medveten krock binds till exakt avvikelse, berörda platser och villkor utan att godkänna brottet', () => {
  const s0 = start(), violation = { code: 'teacher_clash', message: 'Två pass krockar för provläraren.', lessons: ['a', 'b'] }, other = { ...violation, message: 'En annan krock.' };
  const marked = schemaUtkast(s0, { type: 'intent', mark: medvetenMarkering(violation, s0.placements, 'villkor-a'), on: true });
  assert.equal(medvetenSteg(marked.undo.at(-1)), true); assert.deepEqual([...medvetnaAvvikelser(marked, [violation, other], 'villkor-a')], [avvikelseNyckel(violation)]);
  assert.equal(medvetnaAvvikelser(marked, [other], 'villkor-a').size, 0);
  assert.equal(medvetnaAvvikelser(marked, [violation], 'villkor-b').size, 0);
  const reordered = { ...violation, lessons: ['b', 'a'] }; assert.equal(avvikelseNyckel(violation), avvikelseNyckel(reordered));
  const moved = schemaUtkast(marked, { type: 'move', lesson: 'a', day: 4, startMin: 900 }); assert.equal(moved.intentional.length, 0);
  const restored = schemaUtkast(moved, { type: 'undo' }); assert.equal(medvetnaAvvikelser(restored, [violation], 'villkor-a').size, 1);
  const unmarked = schemaUtkast(marked, { type: 'undo' }); assert.equal(unmarked.intentional.length, 0);
  assert.equal(schemaUtkast(unmarked, { type: 'redo' }).intentional.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(marked)), marked);
});

test('nya villkor upphäver markering; bara explicit ångra återställer rätt tidigare medvetna krock', () => {
  const s0 = start(), violation = { code: 'student_clash', message: 'Elevernas pass krockar.', lessons: ['a', 'b'] };
  const marked = schemaUtkast(s0, { type: 'intent', mark: medvetenMarkering(violation, s0.placements, 'fore'), on: true });
  const changed = schemaUtkast(marked, { type: 'villkor', fore: [], efter: [{ slag: 'klass', ref: 'k1', typ: 'sparrad', days: [0], startMin: 480, endMin: 540 }], text: 'Ny spärr' });
  assert.equal(changed.intentional.length, 0); assert.equal(schemaUtkast(changed, { type: 'undo' }).intentional.length, 1);
  const pruned = schemaUtkast(marked, { type: 'intent-prune', keys: [] }); assert.equal(medvetnaAvvikelser(pruned, [violation], 'fore').size, 0);
  const later = schemaUtkast(pruned, { type: 'move', lesson: 'a', day: 4, startMin: 900 }); assert.equal(schemaUtkast(later, { type: 'undo' }).intentional.length, 0);
});


test('oförändrad medveten krock bevaras när ett orelaterat pass flyttas, parkeras eller låses', () => {
  const s0 = start(), violation = { code: 'teacher_clash', message: 'A och B krockar.', lessons: ['a', 'b'] };
  const marked = schemaUtkast(s0, { type: 'intent', mark: medvetenMarkering(violation, s0.placements, 'villkor'), on: true });
  for (const action of [{ type: 'move', lesson: 'c', day: 4, startMin: 900 }, { type: 'park', lesson: 'c' }, { type: 'lock', lesson: 'c', locked: true }]) {
    const next = schemaUtkast(marked, action); assert.equal(medvetnaAvvikelser(next, [violation], 'villkor').size, 1);
  }
  const rooms = schemaUtkast(marked, { type: 'salar', rooms: { a: null, b: 'sal-1', c: 'sal-2' } }); assert.equal(rooms.intentional.length, 1);
});

test('bara lärar-, elev- och salskrock samt förbjuden överlappning kan medvetenmarkeras', () => {
  const state = start();
  for (const code of ['teacher_clash', 'student_clash', 'room_clash', 'overlap_forbidden']) assert.equal(medvetenKrock({ code }), true);
  for (const code of ['off_grid', 'outside_allowed', 'teacher_no_lunch', 'outside_day']) {
    const v = { code, message: 'Regeln gäller.', lessons: ['a'] }; assert.equal(medvetenKrock(v), false);
    assert.equal(schemaUtkast(state, { type: 'intent', mark: medvetenMarkering(v, state.placements, 'villkor'), on: true }), state);
  }
});


test('grundfingeravtryck är en explicit del av markeringen och den framtida publiceringsdelspärren', () => {
  const state = start(), violation = { code: 'room_clash', message: 'Samma sal används samtidigt.', lessons: ['a', 'b'] };
  const mark = medvetenMarkering(violation, state.placements, 'villkor', 'grund-1');
  const marked = schemaUtkast(state, { type: 'intent', mark, on: true }); assert.equal(marked.intentional[0].grundFingerprint, 'grund-1');
  const blocked = medvetenPubliceringssparr(marked, [violation], 'villkor', 'grund-1');
  assert.deepEqual({ blocked: blocked.blocked, count: blocked.count, reason: blocked.reason }, { blocked: true, count: 1, reason: 'medvetna_krockar' });
  const incomplete = { ...marked, intentional: [{ ...mark, placements: { a: mark.placements.a } }] };
  assert.equal(medvetenPubliceringssparr(incomplete, [violation], 'villkor', 'grund-1').blocked, false);
  assert.equal(medvetnaAvvikelser(marked, [violation], 'villkor', 'grund-2').size, 0);
  assert.equal(medvetenPubliceringssparr(marked, [violation], 'villkor', 'grund-2').blocked, false);
  assert.equal(medvetenPubliceringssparr(marked, [{ ...violation, message: 'En annan sal krockar.' }], 'villkor', 'grund-1').blocked, false);
  assert.equal(medvetenPubliceringssparr(marked, [violation], 'ändrade villkor', 'grund-1').blocked, false);
  assert.equal(medvetenPubliceringssparr(schemaUtkast(marked, { type: 'move', lesson: 'a', day: 4, startMin: 900 }), [violation], 'villkor', 'grund-1').blocked, false);
  // Delspärren ändrar inte regelbrotten och är ingen implementerad publiceringsrutt.
  const all = [violation, { code: 'off_grid', message: 'Fel startrutnät.', lessons: ['c'] }], before = structuredClone(all);
  assert.equal(medvetenPubliceringssparr(marked, all, 'villkor', 'grund-1').count, 1); assert.deepEqual(all, before);
});
