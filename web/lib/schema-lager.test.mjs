import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_LAGER, lagerPa, marginalBand, schemaLager } from './schema-lager.ts';

/** Syntetiskt förslag: två klasser, två lärare, en sal. Klass 1 har matematik i Sal 204 och idrott; Klass 2 har svenska. */
const day = { startMin: 480, endMin: 990 };
const lesson = (id, title, classIds, teacherIds, day, startMin, extra = {}) => ({ id, title, classIds, teacherIds, durationMin: 60, marginMin: 0, roomIds: [], roomId: null, vacant: false, term: null, day, startMin, ...extra });
const forslag = {
  days: [day, day, day, day, day],
  classes: [{ id: 'grupp-1', name: 'Klass 1' }, { id: 'grupp-2', name: 'Klass 2' }, { id: 'grupp-4', name: 'Franska' }],
  teachers: [{ id: 'larare-1', name: 'Provlärare 1' }, { id: 'larare-2', name: 'Provlärare 2' }],
  rooms: [{ id: 'sal-1', name: 'Sal 204' }],
  resurser: {
    klass: [{ ref: 'k1', name: 'Klass 1' }, { ref: 'k2', name: 'Klass 2' }, { ref: 'k3', name: 'Klass 3' }],
    grupp: [{ ref: 'g1', name: 'Franska' }], amne: [{ ref: 'Matematik', name: 'Matematik' }], larare: [{ ref: 'p1', name: 'Provlärare 1' }, { ref: 'p2', name: 'Provlärare 2' }], pass: [],
  },
  lessons: [
    lesson('m1', 'Matematik', ['grupp-1'], ['larare-1'], 0, 540, { roomIds: ['sal-1'], roomId: 'sal-1' }),
    lesson('i1', 'Idrott och hälsa', ['grupp-1'], ['larare-2'], 1, 600),
    lesson('s2', 'Svenska', ['grupp-2'], ['larare-2'], 0, 900),
    lesson('f1', 'Franska', ['grupp-4'], ['larare-1'], 2, 480),
    lesson('v1', 'Matematik', ['grupp-2'], ['larare-1'], null, null),
  ],
};
const villkor = (patch = {}) => ({ days: [day, day, day, day, day], breakMin: 10, startGridMin: 5, lunch: null, maxLessonMin: 80, minLessonMin: 20, sameDay: 'avoid',
  lateAfterMin: null, studentMaxMinPerDay: null, teacherMaxMinPerDay: null, salar: ['Sal 204'], egna: [], ...patch });
const klass1 = { slag: 'klass', ref: 'grupp-1' }, klass2 = { slag: 'klass', ref: 'grupp-2' };
const alla = { salar: true };

test('förval: alla lager på utom salar', () => {
  assert.deepEqual(SCHEMA_LAGER.filter(x => lagerPa({}, x.id)).map(x => x.id), ['sparrad', 'tillaten', 'lunch', 'marginal', 'sena']);
  assert.equal(lagerPa({ salar: true }, 'salar'), true);
  assert.equal(lagerPa({ lunch: false }, 'lunch'), false);
});

test('spärr för en klass ger fält bara i klassens vy, med källa och berörda pass', () => {
  const v = villkor({ egna: [{ slag: 'klass', ref: 'k1', typ: 'sparrad', days: [0], startMin: 480, endMin: 600 }] });
  const mine = schemaLager(v, forslag, klass1);
  assert.deepEqual(mine.overlays, [{ day: 0, startMin: 480, endMin: 600, kind: 'sparrad', label: 'Spärrad · Klass 1 · 08:00–10:00', sourceId: 'egna:0' }]);
  // Matematik 09:00–10:00 måndag ligger på spärren.
  assert.deepEqual(mine.kallor['egna:0'], { id: 'egna:0', lager: 'sparrad', typ: 'egen', index: 0, namn: 'Klass 1', beror: 1 });
  assert.deepEqual(schemaLager(v, forslag, klass2).overlays, []);
  // Räkningen följer passen som räknas, till exempel terminen som visas.
  assert.equal(schemaLager(v, forslag, klass1, { alla: forslag.lessons.filter(l => l.id !== 'm1') }).kallor['egna:0'].beror, 0);
  // Lärarens vy visar inte klassens spärr.
  assert.deepEqual(schemaLager(v, forslag, { slag: 'larare', ref: 'larare-1' }).overlays, []);
  // Lagret av: inget fält och ingen källa.
  const off = schemaLager(v, forslag, klass1, { layers: { sparrad: false } });
  assert.deepEqual([off.overlays, off.kallor], [[], {}]);
});

test('spärr för en lärare och för en grupp som visas som klass', () => {
  const v = villkor({ egna: [{ slag: 'larare', ref: 'p1', typ: 'sparrad', days: [4], startMin: 480, endMin: 990 }, { slag: 'grupp', ref: 'g1', typ: 'sparrad', days: [2], startMin: 840, endMin: 990 }] });
  assert.deepEqual(schemaLager(v, forslag, { slag: 'larare', ref: 'larare-1' }).overlays.map(o => [o.day, o.label]), [[4, 'Spärrad · Provlärare 1 · hela dagen']]);
  assert.deepEqual(schemaLager(v, forslag, { slag: 'klass', ref: 'grupp-4' }).overlays.map(o => [o.day, o.label]), [[2, 'Spärrad · Franska · 14:00–16:30']]);
});

test('spärr för en sal ger fält i vyn för klassen vars pass använder salen, när lagret Salar visas', () => {
  const v = villkor({ egna: [{ slag: 'sal', ref: 'Sal 204', typ: 'sparrad', days: [4], startMin: 480, endMin: 990 }] });
  // Salar är av i förval.
  assert.deepEqual(schemaLager(v, forslag, klass1).overlays, []);
  const mine = schemaLager(v, forslag, klass1, { layers: alla });
  assert.deepEqual(mine.overlays, [{ day: 4, startMin: 480, endMin: 990, kind: 'sparrad', label: 'Spärrad · Sal 204 · hela dagen', sourceId: 'egna:0' }]);
  assert.equal(mine.kallor['egna:0'].lager, 'salar');
  assert.equal(mine.kallor['egna:0'].beror, 0);
  // Klass 2 har inget pass i salen.
  assert.deepEqual(schemaLager(v, forslag, klass2, { layers: alla }).overlays, []);
});

test('spärr för ett ämne syns för klasser som har ämnet', () => {
  const v = villkor({ egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sparrad', days: [0, 1], startMin: 900, endMin: 990 }] });
  assert.deepEqual(schemaLager(v, forslag, klass1).overlays.map(o => [o.day, o.label]), [[0, 'Spärrad · Matematik · 15:00–16:30'], [1, 'Spärrad · Matematik · 15:00–16:30']]);
  // Klass 2 har bara matematik på viloytan: inget lagt pass i veckan.
  assert.deepEqual(schemaLager(v, forslag, klass2).overlays, []);
});

test('tillåten tid tonar ned allt utanför, och dagar utan tillåten tid helt', () => {
  const v = villkor({ egna: [{ slag: 'klass', ref: 'k2', typ: 'tillaten', days: [0, 1], startMin: 480, endMin: 720 }, { slag: 'klass', ref: 'k2', typ: 'tillaten', days: [0], startMin: 780, endMin: 960 }] });
  const { overlays, kallor } = schemaLager(v, forslag, klass2);
  assert.ok(overlays.every(o => o.kind === 'tillaten-ute' && o.sourceId === 'egna:0' && o.label === 'Utanför tillåten tid · Klass 2'));
  assert.deepEqual(overlays.map(o => [o.day, o.startMin, o.endMin]), [[0, 720, 780], [0, 960, 990], [1, 720, 990], [2, 480, 990], [3, 480, 990], [4, 480, 990]]);
  // Svenska 15:00–16:00 måndag ryms i 13:00–16:00.
  assert.equal(kallor['egna:0'].beror, 0);
  assert.equal(schemaLager(villkor({ egna: [v.egna[0]] }), forslag, klass2).kallor['egna:0'].beror, 1);
  assert.deepEqual(schemaLager(v, forslag, klass2, { layers: { tillaten: false } }).overlays, []);
});

test('skoldagens ramar och dag utan skoldag tonas ned', () => {
  const v = villkor({ days: [day, { startMin: 540, endMin: 990 }, day, day, { startMin: 480, endMin: 900 }] });
  const { overlays, kallor } = schemaLager(v, forslag, klass1, { utanSkoldag: [2] });
  assert.deepEqual(overlays.map(o => [o.day, o.startMin, o.endMin, o.kind, o.label, o.sourceId]), [
    [1, 480, 540, 'tillaten-ute', 'Utanför skoldagen', 'skoldag'],
    [2, 480, 990, 'tillaten-ute', 'Ingen skoldag', 'skoldag'],
    [4, 900, 990, 'tillaten-ute', 'Utanför skoldagen', 'skoldag'],
  ]);
  assert.deepEqual(kallor.skoldag, { id: 'skoldag', lager: 'tillaten', typ: 'skoldag', beror: 0 });
  // Samma skoldag alla dagar: inget att tona ned.
  assert.deepEqual(schemaLager(villkor(), forslag, klass1).overlays, []);
});

test('lunchfönstret och sena pass', () => {
  const v = villkor({ lunch: { startMin: 660, endMin: 780, lengthMin: 40, teachers: false }, lateAfterMin: 930 });
  const k = schemaLager(v, forslag, klass2);
  assert.deepEqual(k.overlays.filter(o => o.kind === 'lunch').map(o => [o.day, o.startMin, o.endMin, o.label, o.sourceId]), [0, 1, 2, 3, 4].map(d => [d, 660, 780, 'Lunch', 'lunch']));
  assert.deepEqual(k.overlays.filter(o => o.kind === 'onskemal').map(o => [o.day, o.startMin, o.endMin, o.label]), [0, 1, 2, 3, 4].map(d => [d, 930, 990, 'Sena pass · efter 15:30']));
  // Svenska slutar 16:00, efter 15:30.
  assert.equal(k.kallor.sena.beror, 1);
  // Lärare får lunchfältet bara när lärare också ska få lunch.
  assert.equal(schemaLager(v, forslag, { slag: 'larare', ref: 'larare-2' }).overlays.filter(o => o.kind === 'lunch').length, 0);
  assert.equal(schemaLager({ ...v, lunch: { ...v.lunch, teachers: true } }, forslag, { slag: 'larare', ref: 'larare-2' }).overlays.filter(o => o.kind === 'lunch').length, 5);
  assert.deepEqual(schemaLager(v, forslag, klass2, { layers: { lunch: false, sena: false } }).overlays, []);
});

test('marginal ger band före och efter rätt pass, för den part vyn visar (05.2-SM-MARGINAL)', () => {
  const m = (slag, ref, beforeMin, afterMin, occupies, label) => ({ slag, ref, typ: 'marginal', beforeMin, afterMin, occupies, label, visibleFor: [], when: 'alltid' });
  const idrott = m('amne', 'Idrott och hälsa', 10, 15, ['elever'], 'Omklädning före, dusch efter');
  const v = villkor({ egna: [idrott] });
  assert.deepEqual(schemaLager(v, forslag, klass1).bands, [{ lesson: 'i1', side: 'fore', minutes: 10, label: 'Omklädning 10 min', kind: 'marginal' },
    { lesson: 'i1', side: 'efter', minutes: 15, label: 'Dusch 15 min', kind: 'marginal' }]);
  // Marginalen upptar bara eleverna: lärarens vy har inget band.
  assert.deepEqual(schemaLager(v, forslag, { slag: 'larare', ref: 'larare-2' }).bands, []);
  assert.deepEqual(schemaLager(v, forslag, klass2).bands, []);
  assert.deepEqual(schemaLager(v, forslag, klass1, { layers: { marginal: false } }).bands, []);
  // Passen som visas styr: utan idrotten i veckan inget band.
  assert.deepEqual(schemaLager(v, forslag, klass1, { lessons: forslag.lessons.filter(l => l.id === 'm1') }).bands, []);
  // Flera marginaler på samma pass: den största gäller per sida och part, med dess etikett.
  const klassens = m('klass', 'k1', 0, 20, ['elever', 'larare'], 'Övergång');
  assert.deepEqual(schemaLager(villkor({ egna: [idrott, klassens] }), forslag, klass1).bands.filter(b => b.lesson === 'i1').map(b => [b.side, b.label]), [['fore', 'Omklädning 10 min'], ['efter', 'Övergång 20 min']]);
  assert.deepEqual(schemaLager(villkor({ egna: [idrott, klassens] }), forslag, { slag: 'larare', ref: 'larare-2' }).bands.map(b => [b.lesson, b.side, b.label]), [['i1', 'efter', 'Övergång 20 min']]);
  // Ett enskilt pass och en sal: salens marginal gäller pass som får ligga i salen, för salen.
  const egna = [m('pass', 's2', 5, 5, ['elever'], 'Övergång'), m('sal', 'Sal 204', 0, 10, ['sal'], 'Städning')];
  assert.deepEqual(schemaLager(villkor({ egna }), forslag, klass2).bands.map(b => [b.lesson, b.side, b.minutes]), [['s2', 'fore', 5], ['s2', 'efter', 5]]);
  assert.deepEqual(marginalBand(villkor({ egna }), forslag, forslag.lessons[0], 'sal'), [{ lesson: 'm1', side: 'efter', minutes: 10, label: 'Städning 10 min', kind: 'marginal' }]);
  assert.deepEqual(marginalBand(villkor({ egna }), forslag, forslag.lessons[0], 'elever'), []);
});
