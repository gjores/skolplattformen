import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchemaVillkor, checkSchemaVillkor } from './schema-contract.ts';
import { schemaUtkast, tomtUtkast } from './schema-utkast.ts';
import { vtCellText, vtDagar, vtErsattCell, vtFiltrera, vtKopiera, vtLaggPaValda, vtMarkerade, vtRader, vtRutnat, vtRutor, vtSkolaRader, vtSortera, vtSteg, vtTaBortTyp,
  vtTillRegler, vtTyper } from './schema-villkorstabell.ts';

// Syntetiskt förslag (05.2-SM-VILLKORSTABELL): två klasser, en grupp, tre lärare, en sal. Inga verkliga uppgifter.
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lesson = (id, title, classIds, teacherIds, day, startMin, extra = {}) => ({ id, title, classIds, teacherIds, durationMin: 60, vacant: false, marginMin: 0, marginBeforeMin: 0,
  roomIds: [], roomId: null, term: null, day, startMin, ...extra });
const forslag = {
  period: 'ht', startGridMin: 10, days: Array.from({ length: 5 }, () => ({ startMin: 480, endMin: 990 })),
  classes: [{ id: 'grupp-1', name: '1A' }, { id: 'grupp-2', name: '1B' }, { id: 'grupp-4', name: 'Spanska' }],
  teachers: [{ id: 'larare-1', name: 'Lärare 1' }, { id: 'larare-2', name: 'Lärare 2' }, { id: 'larare-3', name: 'Lärare 3' }],
  rooms: [{ id: 'sal-1', name: 'Hallen' }],
  resurser: { klass: [{ ref: uid(10), name: '1A' }, { ref: uid(11), name: '1B' }], grupp: [{ ref: uid(30), name: 'Spanska' }, { ref: uid(31), name: 'Tyska' }],
    amne: [{ ref: 'Matematik', name: 'Matematik' }, { ref: 'Idrott', name: 'Idrott' }, { ref: 'Spanska', name: 'Spanska' }],
    larare: [{ ref: uid(20), name: 'Lärare 1' }, { ref: uid(21), name: 'Lärare 2' }, { ref: uid(22), name: 'Lärare 3' }, { ref: uid(23), name: 'Lärare 4' }], pass: [] },
  lessons: [
    lesson('pass-1', 'Matematik', ['grupp-1'], ['larare-1'], 0, 480), lesson('pass-2', 'Matematik', ['grupp-1'], ['larare-1'], 4, 840),
    lesson('pass-3', 'Matematik', ['grupp-2'], ['larare-2'], 4, 780), lesson('pass-4', 'Idrott', ['grupp-1'], ['larare-3'], 2, 600, { roomIds: ['sal-1'], roomId: 'sal-1', durationMin: 90 }),
    lesson('pass-5', 'Spanska', ['grupp-4'], ['larare-3'], 1, 600, { term: 'ht' })],
};
const villkor = { ...defaultSchemaVillkor(), salar: ['Hallen'] };
const sparrFre = { typ: 'sparrad', days: [4], startMin: 720, endMin: 990 };

test('flikarna har en rad per resurs och en kolumn per villkorstyp resurstypen kan ha', () => {
  assert.deepEqual(vtTyper('larare'), ['sparrad', 'tillaten', 'marginal', 'sal', 'dag']);
  assert.deepEqual(vtTyper('sal'), ['sparrad', 'tillaten', 'marginal']);
  const v = { ...villkor, egna: [{ slag: 'larare', ref: uid(20), ...sparrFre }, { slag: 'larare', ref: uid(20), typ: 'dag', maxMin: 240 }, { slag: 'amne', ref: 'Matematik', typ: 'langd', maxMin: 60 },
    { slag: 'larare', ref: uid(23), typ: 'dag', maxMin: 300 }] };
  const larare = vtRader('larare', v, forslag);
  assert.deepEqual(larare.map(r => [r.namn, r.pass, r.veckotid, r.vem]), [['Lärare 1', 2, '2 h', '1A'], ['Lärare 2', 1, '1 h', '1B'], ['Lärare 3', 2, '2 h 30 min', '1A, Spanska'], ['Lärare 4', 0, '0 min', '']]);
  assert.deepEqual(larare[0].celler.sparrad, { typ: 'sparrad', index: [0], text: 'fre em' });
  assert.deepEqual(larare[0].celler.dag, { typ: 'dag', index: [1], text: 'högst 4 h' });
  // Ett villkor för en resurs utan pass träffar inget och märks.
  assert.deepEqual(larare.map(r => r.utanTraff), [false, false, false, true]);
  assert.deepEqual(vtRader('klass', v, forslag).map(r => [r.namn, r.pass, r.vem]), [['1A', 3, 'Lärare 1, Lärare 3'], ['1B', 1, 'Lärare 2']]);
  assert.deepEqual(vtRader('grupp', v, forslag).map(r => [r.namn, r.pass]), [['Spanska', 1], ['Tyska', 0]]);
  assert.deepEqual(vtRader('amne', v, forslag).map(r => [r.namn, r.pass, r.celler.langd?.text ?? '']), [['Matematik', 3, 'högst 60 min'], ['Idrott', 1, ''], ['Spanska', 1, '']]);
  // Salar kommer ur villkoren: pass som får ligga i salen.
  assert.deepEqual(vtRader('sal', v, forslag).map(r => [r.namn, r.pass, r.vem]), [['Hallen', 1, 'Idrott']]);
  // Läsår: veckotiden per termin när den skiljer.
  assert.equal(vtRader('larare', v, { ...forslag, period: 'lasar' })[2].veckotid, 'HT 2 h 30 min · VT 1 h 30 min');
});

test('cellen sammanfattar villkoret', () => {
  const d = villkor.days, at = r => vtCellText([r], d);
  assert.equal(vtCellText([{ typ: 'sparrad', days: [0], startMin: 480, endMin: 720 }, sparrFre], d), 'mån 08–12, fre em');
  assert.equal(at({ typ: 'tillaten', days: [0, 1, 2, 4], startMin: 480, endMin: 990 }), 'mån–ons, fre hela dagen');
  assert.equal(at({ typ: 'sparrad', days: [1, 3], startMin: 510, endMin: 720 }), 'tis, tor 08:30–12');
  assert.equal(at({ typ: 'sparrad', days: [2], startMin: 480, endMin: 720 }), 'ons 08–12');
  assert.equal(at({ typ: 'marginal', beforeMin: 10, afterMin: 15, occupies: ['elever'], label: 'Omklädning', visibleFor: [], when: 'alltid' }), '10/15 min, elever');
  assert.equal(at({ typ: 'antal', count: 3 }), '3 pass/vecka');
  assert.equal(at({ typ: 'sal', rooms: ['Hallen', 'Sal B'] }), 'Hallen eller Sal B');
  assert.equal(at({ typ: 'dag', maxMin: 270 }), 'högst 4,5 h');
  assert.equal(vtDagar([4, 0, 1, 2]), 'mån–ons, fre');
  assert.equal(vtDagar([0, 1]), 'mån, tis');
});

test('lägg på valda ger ett villkor per resurs och ett enda ångra-steg', () => {
  const refs = [uid(20), uid(21), uid(22)], fore = [{ slag: 'amne', ref: 'Idrott', typ: 'sal', rooms: ['Hallen'] }];
  const efter = vtLaggPaValda(fore, 'larare', refs, [sparrFre]);
  assert.deepEqual(efter.slice(1), refs.map(ref => ({ slag: 'larare', ref, ...sparrFre })));
  assert.deepEqual(checkSchemaVillkor({ ...villkor, egna: efter }), []);
  // Längsta dag har ett värde per lärare: lägg på valda ersätter det som fanns.
  const dag = vtLaggPaValda([{ slag: 'larare', ref: uid(20), typ: 'dag', maxMin: 300 }], 'larare', refs.slice(0, 2), [{ typ: 'dag', maxMin: 240 }]);
  assert.deepEqual(dag, [{ slag: 'larare', ref: uid(20), typ: 'dag', maxMin: 240 }, { slag: 'larare', ref: uid(21), typ: 'dag', maxMin: 240 }]);
  // Utkastet: ett villkorssteg; ångra ger tillbaka villkoren före i ett steg och gör om villkoren efter.
  let u = schemaUtkast(tomtUtkast(), vtSteg(fore, efter, 'Spärrad tid · 3 lärare'));
  assert.equal(u.undo.length, 1);
  assert.deepEqual(u.undo[0].villkor, fore);
  u = schemaUtkast(u, { type: 'undo' });
  assert.deepEqual([u.undo.length, u.redo.length, u.redo[0].efter], [0, 1, efter]);
  // Cellen i tabellen: alla tre lärarnas spärr syns, och tre pass på fredag eftermiddag bryter enligt kontrollen. Läraren 3 har inget pass där.
  const kontroll = { violations: [{ code: 'outside_allowed', message: 'x', lessons: ['pass-2', 'pass-3'] }, { code: 'student_clash', message: 'y', lessons: ['pass-1'] }] };
  const rader = vtRader('larare', { ...villkor, egna: efter }, forslag, kontroll);
  assert.deepEqual(rader.map(r => [r.celler.sparrad?.text ?? '', r.brott]), [['fre em', 1], ['fre em', 1], ['fre em', 0], ['', 0]]);
});

test('kopiera, ersätt och ta bort för valda rader', () => {
  const egna = [{ slag: 'larare', ref: uid(20), ...sparrFre }, { slag: 'larare', ref: uid(20), typ: 'dag', maxMin: 240 }, { slag: 'larare', ref: uid(21), typ: 'sal', rooms: ['Hallen'] },
    { slag: 'klass', ref: uid(10), ...sparrFre }];
  const kopia = vtKopiera(egna, 'larare', uid(20), [uid(21), uid(22), uid(20)]);
  assert.deepEqual(kopia.filter(r => r.ref === uid(21)), [{ slag: 'larare', ref: uid(21), ...sparrFre }, { slag: 'larare', ref: uid(21), typ: 'dag', maxMin: 240 }]);
  assert.deepEqual(kopia.filter(r => r.ref === uid(22)).length, 2);
  assert.deepEqual(kopia.filter(r => r.ref === uid(20) || r.slag === 'klass'), [egna[0], egna[1], egna[3]]);
  // Ersätt cellen: nya villkor där det första stod, och tom lista tar bort.
  const ny = { typ: 'sparrad', days: [0, 1], startMin: 480, endMin: 600 };
  assert.deepEqual(vtErsattCell(egna, 'larare', uid(20), 'sparrad', [ny]), [{ slag: 'larare', ref: uid(20), ...ny }, ...egna.slice(1)]);
  assert.deepEqual(vtErsattCell(egna, 'larare', uid(20), 'sparrad', []), egna.slice(1));
  assert.deepEqual(vtErsattCell(egna, 'larare', uid(22), 'dag', [{ typ: 'dag', maxMin: 300 }]).at(-1), { slag: 'larare', ref: uid(22), typ: 'dag', maxMin: 300 });
  assert.deepEqual(vtTaBortTyp(egna, 'larare', [uid(20), uid(21)], 'sparrad'), egna.slice(1));
});

test('tidsrutnätet: rutor ur villkoren och villkor ur rutorna', () => {
  const g = vtRutnat(villkor);
  assert.deepEqual([g.from, g.to, g.step, vtRutor(g)], [480, 990, 10, 51]);
  const marked = vtMarkerade([{ typ: 'sparrad', days: [0, 4], startMin: 720, endMin: 990 }, { typ: 'sparrad', days: [2], startMin: 485, endMin: 500 }], g);
  assert.deepEqual([marked[0].filter(Boolean).length, marked[2].filter(Boolean).length, marked[1].some(Boolean)], [27, 2, false]);
  // Samma tid flera dagar blir ett villkor; en ruta som bara delvis låg i villkoret blir hel.
  assert.deepEqual(vtTillRegler(marked, g, 'sparrad'), [{ typ: 'sparrad', days: [0, 4], startMin: 720, endMin: 990 }, { typ: 'sparrad', days: [2], startMin: 480, endMin: 500 }]);
  assert.deepEqual(vtTillRegler(vtMarkerade([], g), g, 'tillaten'), []);
});

test('sök, filter och sortering', () => {
  const v = { ...villkor, egna: [{ slag: 'larare', ref: uid(22), ...sparrFre }, { slag: 'larare', ref: uid(23), typ: 'dag', maxMin: 300 }] };
  const rader = vtRader('larare', v, forslag);
  assert.deepEqual(vtFiltrera(rader, 'lärare 3', 'alla').map(r => r.namn), ['Lärare 3']);
  assert.deepEqual(vtFiltrera(rader, '', 'har').map(r => r.namn), ['Lärare 3', 'Lärare 4']);
  assert.deepEqual(vtFiltrera(rader, '', 'saknar').map(r => r.namn), ['Lärare 1', 'Lärare 2']);
  assert.deepEqual(vtFiltrera(rader, '', 'utanTraff').map(r => r.namn), ['Lärare 4']);
  assert.deepEqual(vtSortera(rader, 'pass', 'desc').map(r => r.namn), ['Lärare 1', 'Lärare 3', 'Lärare 2', 'Lärare 4']);
  assert.deepEqual(vtSortera(rader, 'namn', 'desc').map(r => r.namn), ['Lärare 4', 'Lärare 3', 'Lärare 2', 'Lärare 1']);
  // Tomma celler står sist åt båda hållen.
  assert.deepEqual(vtSortera(rader, 'sparrad', 'desc').map(r => r.namn), ['Lärare 3', 'Lärare 1', 'Lärare 2', 'Lärare 4']);
  assert.deepEqual(vtSortera(rader, 'sparrad', 'asc').map(r => r.namn), ['Lärare 3', 'Lärare 1', 'Lärare 2', 'Lärare 4']);
});

test('tom tabell utan förslag; salar och hela skolan finns ändå', () => {
  assert.deepEqual(vtRader('larare', villkor, null), []);
  assert.deepEqual(vtRader('klass', villkor, null), []);
  assert.deepEqual(vtRader('sal', villkor, null).map(r => [r.namn, r.pass, r.utanTraff]), [['Hallen', 0, false]]);
  const skola = vtSkolaRader({ ...villkor, teacherMaxMinPerDay: 360 }, { violations: [{ code: 'outside_day', message: '', lessons: ['pass-1'] }, { code: 'teacher_no_lunch', message: '', lessons: [] }] });
  assert.deepEqual(skola.map(r => [r.namn, r.text, r.grund, r.avvikelser]), [
    ['Skoldag', '08:00–16:30 mån–fre', false, 1], ['Rast mellan pass', '10 min', false, 0], ['Pass får börja', 'var 10:e minut', false, 0],
    ['Lunch', '40 min mellan 10:30 och 13:30, även lärare', false, 1], ['Längsta pass', '80 min', true, 0], ['Kortaste pass', '20 min', true, 0],
    ['Samma ämne samma dag', 'Undvik', false, 0], ['Sena pass', 'Undviks efter 15:30', false, 0], ['Längsta dag, elever', 'Ingen gräns', false, 0], ['Längsta dag, lärare', 'Högst 6 h', false, 0]]);
});

test('längsta dag i kontrollens svar räknas som lärarens pass den dagen', () => {
  const v = { ...villkor, egna: [{ slag: 'larare', ref: uid(20), typ: 'dag', maxMin: 120 }] };
  const kontroll = { violations: [{ code: 'teacher_day_too_long', message: 'Lärare Lärare 1 har 180 min undervisning fredag, högst 120 är tillåtet.', lessons: [] },
    { code: 'teacher_day_too_long', message: 'Lärare Lärare 10 har 180 min undervisning måndag, högst 120 är tillåtet.', lessons: [] }] };
  assert.deepEqual(vtRader('larare', v, forslag, kontroll).map(r => r.brott), [1, 0, 0, 0]);
});
