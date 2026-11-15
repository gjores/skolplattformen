// Samlingsvyn (05.2-SM-SAMLINGSVY): rader, filter, gemensam ledig tid, håltid, lunchtryck, lediga lärare och salar, färg och arbetsvyer.
// Fixturen är motorns syntetiska förslag (e2e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbetsvyAv, arbetsvyResurser, dopOmArbetsvy, filtreraSamling, gemensamLedigTid, haltider, kortNamn, ledigaLarare, ledigaSalar, lunchtryck, medArbetsvy, parseArbetsvyer, passFarg,
  samlingKandidater, samlingNyckel, samlingRader, tomtFilter } from './schema-samling.ts';

const forslag = JSON.parse(readFileSync(new URL('../e2e/fixtures/schema-forslag.json', import.meta.url), 'utf8'));
const pass = (id, day, startMin, durationMin, x = {}) => ({ id, title: 'Svenska', classIds: [], teacherIds: [], durationMin, vacant: false, marginMin: 0, marginBeforeMin: 0, roomIds: [], roomId: null, term: null, day, startMin, ...x });
const dagar = [{ startMin: 480, endMin: 960 }, { startMin: 480, endMin: 900 }];
const overlap = (a, b) => a.day === b.day && a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin;

test('kandidater och rader: klasser, grupper och lärare ur förslaget, i vald ordning och med terminens pass', () => {
  const k = samlingKandidater(forslag);
  assert.deepEqual(k.filter(x => x.slag === 'grupp').map(x => x.name), ['Franska']);
  assert.equal(k.filter(x => x.slag === 'klass').length, 12); assert.equal(k.filter(x => x.slag === 'larare').length, forslag.teachers.length);
  const ht = filtreraSamling(forslag.lessons, tomtFilter(), 'ht');
  const rader = samlingRader(forslag, [{ slag: 'larare', id: 'larare-4' }, { slag: 'klass', id: 'grupp-1' }, { slag: 'sal', id: 'sal-9' }, { slag: 'elev', id: 'okänd' }], ht);
  assert.deepEqual(rader.map(r => [r.key, r.name, r.slag]), [['larare:larare-4', 'Provlärare 4', 'larare'], ['klass:grupp-1', 'Klass 1', 'klass']]);
  assert.match(rader[0].detail, /^lärare · /u); assert.equal(rader[1].detail, 'klass');
  assert.ok(rader[1].lessons.length > 0 && rader[1].lessons.every(l => l.classIds.includes('grupp-1') && l.term !== 'vt' && l.day !== null));
  assert.ok(rader[0].lessons.every(l => l.teacherIds.includes('larare-4')));
  // En elevs rad kommer ur serverns svar: bara elevens pass, och gruppens pass märks.
  const elev = { name: 'Provelev 1', grupper: ['Klass 1', 'Spanska'], lessons: ['pass-1', 'pass-577'], fromGroup: ['pass-577'] };
  const [rad] = samlingRader(forslag, [{ slag: 'elev', id: 'e1', via: 'pass-1' }], ht, { e1: elev });
  assert.deepEqual([rad.key, rad.slag, rad.detail, rad.chip], ['elev:e1', 'elev', 'elev · Klass 1, Spanska', 'Provelev 1 (elev)']);
  assert.deepEqual(rad.lessons.map(l => l.id).sort(), ['pass-1', 'pass-577']); assert.ok(rad.fromGroup.has('pass-577'));
  assert.equal(samlingNyckel({ slag: 'klass', id: 'grupp-1' }), 'klass:grupp-1');
});

test('filterkombination: ämnen är eller, termin är och; pass hela perioden visas i båda terminerna; olagda pass visas inte', () => {
  const amnen = { amnen: ['Matematik', 'Svenska'], termin: null };
  const ht = filtreraSamling(forslag.lessons, amnen, 'ht'), vt = filtreraSamling(forslag.lessons, { ...amnen, termin: 'vt' }, 'ht');
  assert.ok(ht.length > 0 && ht.every(l => ['Matematik', 'Svenska'].includes(l.title) && l.term !== 'vt'));
  assert.ok(ht.some(l => l.title === 'Matematik') && ht.some(l => l.title === 'Svenska'));
  // Filtrets termin går före den veckan visar.
  assert.ok(vt.length > 0 && vt.every(l => l.term !== 'ht'));
  assert.ok(ht.length < filtreraSamling(forslag.lessons, tomtFilter(), 'ht').length);
  const egna = [pass('a', 0, 480, 60), pass('b', 0, 480, 60, { term: 'vt' }), pass('c', null, null, 60), pass('d', 1, 480, 60, { title: 'Matematik', term: 'ht' })];
  assert.deepEqual(filtreraSamling(egna, tomtFilter(), 'ht').map(l => l.id), ['a', 'd']);
  assert.deepEqual(filtreraSamling(egna, tomtFilter(), 'vt').map(l => l.id), ['a', 'b']);
  assert.deepEqual(filtreraSamling(egna, { amnen: ['Matematik'], termin: 'ht' }, 'vt').map(l => l.id), ['d']);
  assert.deepEqual(filtreraSamling(egna, { amnen: ['Matematik'], termin: 'vt' }, 'ht').map(l => l.id), []);
});

test('gemensam ledig tid för tre resurser: tider då ingen har pass, inom skoldagen och minst så långa som begärs', () => {
  const klass = { lessons: [pass('a', 0, 480, 60), pass('b', 0, 600, 60)] };          // 08–09, 10–11
  const larare = { lessons: [pass('c', 0, 540, 30), pass('d', 0, 720, 120)] };        // 09–09:30, 12–14
  const sal = { lessons: [pass('e', 0, 650, 40), pass('f', 1, 480, 420)] };           // 10:50–11:30; dag 2 08–15 (hela dagen)
  assert.deepEqual(gemensamLedigTid(dagar, [klass, larare, sal]), [
    { day: 0, startMin: 570, endMin: 600 }, { day: 0, startMin: 690, endMin: 720 }, { day: 0, startMin: 840, endMin: 960 }]);
  assert.deepEqual(gemensamLedigTid(dagar, [klass, larare, sal], 40), [{ day: 0, startMin: 840, endMin: 960 }]);
  // Två rader: dag 2 är ledig hela dagen för dem. En rad räcker inte.
  assert.deepEqual(gemensamLedigTid(dagar, [klass, larare]).filter(t => t.day === 1), [{ day: 1, startMin: 480, endMin: 900 }]);
  assert.deepEqual(gemensamLedigTid(dagar, [klass]), []);
  // Mot fixturen: inget pass för någon av de tre raderna ligger i en gemensam ledig tid, och tiderna täcker allt annat i skoldagen.
  const ht = filtreraSamling(forslag.lessons, tomtFilter(), 'ht');
  const rader = samlingRader(forslag, [{ slag: 'klass', id: 'grupp-1' }, { slag: 'larare', id: 'larare-4' }, { slag: 'larare', id: 'larare-1' }], ht);
  const lediga = gemensamLedigTid(forslag.days, rader, 20), alla = rader.flatMap(r => r.lessons);
  assert.ok(lediga.length > 0 && lediga.every(t => t.endMin - t.startMin >= 20));
  assert.ok(lediga.every(t => !alla.some(l => overlap(l, { day: t.day, startMin: t.startMin, durationMin: t.endMin - t.startMin }))));
  const upptaget = d => { const m = new Set(); for (const l of alla.filter(x => x.day === d)) for (let i = l.startMin; i < l.startMin + l.durationMin; i++) m.add(i); return m.size; };
  for (const [d, dag] of forslag.days.entries()) assert.equal(gemensamLedigTid(forslag.days, rader).filter(t => t.day === d).reduce((n, t) => n + t.endMin - t.startMin, 0), dag.endMin - dag.startMin - upptaget(d));
});

test('håltid: luckor mellan pass som är längre än rasten, per dag', () => {
  const lessons = [pass('a', 0, 480, 60), pass('b', 0, 550, 60), pass('c', 0, 700, 50), pass('d', 1, 600, 60), pass('e', null, null, 60)];
  assert.deepEqual(haltider(lessons, 10), [{ day: 0, startMin: 610, endMin: 700 }]);
  assert.deepEqual(haltider(lessons, 5), [{ day: 0, startMin: 540, endMin: 550 }, { day: 0, startMin: 610, endMin: 700 }]);
});

test('lunchtryck: antal klasser med lunchlucka per tid, ur förslaget', () => {
  const f = { classes: [{ id: 'k1', name: 'Klass 1' }, { id: 'k2', name: 'Klass 2' }, { id: 'k3', name: 'Klass 3' }], days: [{ startMin: 480, endMin: 960 }] };
  const lunch = { startMin: 660, endMin: 780, lengthMin: 40, teachers: false };          // 11:00–13:00
  const lessons = [
    pass('a', 0, 600, 80, { classIds: ['k1'] }), pass('b', 0, 740, 60, { classIds: ['k1'] }),   // k1 ledig 11:20–12:20
    pass('c', 0, 480, 180, { classIds: ['k2'] }), pass('d', 0, 720, 60, { classIds: ['k2'] }),  // k2 ledig 11:00–12:00
    pass('e', 0, 480, 190, { classIds: ['k3'] }), pass('f', 0, 700, 80, { classIds: ['k3'] }),  // k3 ledig 11:10–11:40: rymmer inte lunchen
  ];
  assert.deepEqual(lunchtryck(f, lessons, lunch).map(t => [t.startMin, t.endMin, t.klasser, t.elever]), [[660, 680, 1, null], [680, 720, 2, null], [720, 740, 1, null]]);
  // Med kända storlekar räknas eleverna; en klass utan pass den dagen räknas inte.
  assert.deepEqual(lunchtryck(f, lessons.slice(0, 4), lunch, ['k1', 'k2', 'k3'], { k1: 25, k2: 30, k3: 28 }).map(t => [t.startMin, t.klasser, t.elever]), [[660, 1, 30], [680, 2, 55], [720, 1, 25]]);
  assert.deepEqual(lunchtryck(f, lessons, null), []);
  // Fixturen: aldrig fler klasser än skolan har, och bara inom lunchfönstret.
  const ht = filtreraSamling(forslag.lessons, tomtFilter(), 'ht'), klasser = samlingKandidater(forslag).filter(k => k.slag === 'klass').map(k => k.id);
  const tryck = lunchtryck(forslag, ht, forslag.villkor.lunch, klasser);
  assert.ok(tryck.length > 0 && tryck.every(t => t.klasser >= 1 && t.klasser <= 12 && t.startMin >= forslag.villkor.lunch.startMin && t.endMin <= forslag.villkor.lunch.endMin));
});

test('lediga lärare med ämnet i tjänstefördelningen först, och lediga salar', () => {
  const ht = filtreraSamling(forslag.lessons, tomtFilter(), 'ht'), ma = forslag.lessons.find(l => l.title === 'Matematik' && l.term !== 'vt' && l.day !== null);
  const tid = { day: ma.day, startMin: ma.startMin, endMin: ma.startMin + ma.durationMin };
  const lediga = ledigaLarare(forslag, ht, tid, 'Matematik');
  const upptagna = new Set(ht.filter(l => overlap(l, { ...tid, durationMin: tid.endMin - tid.startMin })).flatMap(l => l.teacherIds));
  assert.ok(upptagna.has(ma.teacherIds[0]) && !lediga.some(t => t.id === ma.teacherIds[0]));
  assert.equal(lediga.length, forslag.teachers.length - upptagna.size);
  assert.ok(lediga.every(t => !upptagna.has(t.id)));
  // De som har Matematik står först, sedan övriga, i namnordning ("Provlärare 2" före "Provlärare 10").
  const forsta = lediga.findIndex(t => !t.harAmnet);
  assert.ok(lediga.some(t => t.harAmnet) && lediga.slice(forsta).every(t => !t.harAmnet));
  const medMa = new Set(forslag.lessons.filter(l => l.title === 'Matematik').flatMap(l => l.teacherIds));
  assert.ok(lediga.every(t => t.harAmnet === medMa.has(t.id)));
  const tal = lediga.slice(forsta).map(t => Number(t.name.split(' ')[1]));
  assert.deepEqual(tal, [...tal].sort((a, b) => a - b));
  // Utan ämne: ingen märks, namnordning.
  assert.ok(ledigaLarare(forslag, ht, tid, null).every(t => !t.harAmnet));
  // Salar: de utan pass den tiden. Fixturen har inga salar.
  assert.deepEqual(ledigaSalar(forslag, ht, tid), []);
  const rooms = [{ id: 'sal-1', name: 'Sal 2' }, { id: 'sal-2', name: 'Sal 10' }, { id: 'sal-3', name: 'Aulan' }];
  assert.deepEqual(ledigaSalar({ rooms }, [pass('a', 0, 480, 60, { roomId: 'sal-1' }), pass('b', 0, 600, 60, { roomId: 'sal-3' })], { day: 0, startMin: 500, endMin: 560 }).map(r => r.name), ['Aulan', 'Sal 10']);
});

test('färg efter ämne, lärare, sal och avvikelse: alltid text i rutan, samma värde ger samma ton', () => {
  const [a, b] = forslag.lessons.filter(l => l.title === 'Svenska'), ma = forslag.lessons.find(l => l.title === 'Matematik'), idrott = forslag.lessons.find(l => l.teacherIds.length === 0);
  const amne = l => passFarg(forslag, 'amne', l, new Set());
  assert.equal(amne(a).ton, amne(b).ton); assert.notEqual(amne(a).ton, amne(ma).ton);
  assert.deepEqual([amne(a).text, amne(a).namn], ['Sv', 'Svenska']);
  assert.deepEqual(passFarg(forslag, 'larare', a, new Set()), { ton: 0, avvikelse: false, text: 'P1 Sv', namn: 'Provlärare 1' });
  assert.deepEqual(passFarg(forslag, 'larare', idrott, new Set()), { ton: null, avvikelse: false, text: '– Id', namn: 'Ingen lärare' });
  assert.deepEqual(passFarg(forslag, 'sal', a, new Set()), { ton: null, avvikelse: false, text: '– Sv', namn: 'Ingen sal' });
  assert.deepEqual(passFarg({ ...forslag, rooms: [{ id: 'sal-1', name: 'Sal 2' }] }, 'sal', { ...a, roomId: 'sal-1' }, new Set()), { ton: 0, avvikelse: false, text: 'Sal 2 Sv', namn: 'Sal 2' });
  assert.deepEqual(passFarg(forslag, 'avvikelse', a, new Set([a.id])), { ton: null, avvikelse: true, text: 'Avv. Sv', namn: 'Regelavvikelse' });
  assert.equal(passFarg(forslag, 'avvikelse', b, new Set([a.id])).avvikelse, false);
  assert.equal(kortNamn('Anna Berg'), 'AB'); assert.equal(kortNamn('Provlärare 14'), 'P14');
});

test('arbetsvy: sparas med appens referenser, utan elever, och läses tillbaka i ett förslag; trasig lagring kastas', () => {
  const resurser = [{ slag: 'klass', id: 'grupp-1' }, { slag: 'larare', id: 'larare-4' }, { slag: 'grupp', id: 'grupp-15' }, { slag: 'elev', id: 'e1', via: 'pass-1' }];
  const { vy, utan } = arbetsvyAv(forslag, '  Åk 1 och matematik ', resurser, { lunch: false, haltid: true }, { amnen: ['Matematik'], termin: 'vt' }, 'larare');
  assert.equal(utan, 1); assert.equal(vy.namn, 'Åk 1 och matematik');
  assert.deepEqual(vy.resurser, [{ slag: 'klass', ref: forslag.resurser.klass[0].ref }, { slag: 'larare', ref: forslag.resurser.larare[3].ref }, { slag: 'grupp', ref: forslag.resurser.grupp[2].ref }]);
  // Inget elev-ID och inget elevnamn i det som sparas.
  assert.ok(!JSON.stringify(vy).includes('e1'));
  const text = JSON.stringify(medArbetsvy([], vy)), [last] = parseArbetsvyer(text);
  assert.deepEqual(last, vy);
  assert.deepEqual(arbetsvyResurser(forslag, last), { resurser: resurser.slice(0, 3), saknas: 0 });
  // En lärare som inte finns i ett annat förslag hoppas över och räknas.
  const utanLarare = { ...forslag, teachers: forslag.teachers.slice(0, 3), resurser: { ...forslag.resurser, larare: forslag.resurser.larare.slice(0, 3) } };
  assert.deepEqual(arbetsvyResurser(utanLarare, last), { resurser: [resurser[0], resurser[2]], saknas: 1 });
  // Samma namn ersätter; nytt namn läggs sist; namnbyte till ett upptaget eller tomt namn ändrar ingenting.
  const tva = medArbetsvy(medArbetsvy([vy], { ...vy, farg: 'amne' }), { ...vy, namn: 'Salar' });
  assert.deepEqual(tva.map(x => [x.namn, x.farg]), [['Åk 1 och matematik', 'amne'], ['Salar', 'larare']]);
  assert.equal(dopOmArbetsvy(tva, 'Salar', 'Åk 1 och matematik'), tva); assert.equal(dopOmArbetsvy(tva, 'Salar', '  '), tva);
  assert.deepEqual(dopOmArbetsvy(tva, 'Salar', 'Lärarna').map(x => x.namn), ['Åk 1 och matematik', 'Lärarna']);
  // Det som inte har rätt form kastas, post för post.
  assert.deepEqual(parseArbetsvyer('inte json'), []); assert.deepEqual(parseArbetsvyer(null), []); assert.deepEqual(parseArbetsvyer('{"namn":"x"}'), []);
  const blandat = parseArbetsvyer(JSON.stringify([{ namn: '', resurser: [] }, { namn: 'Ok', resurser: [{ slag: 'elev', ref: 'e1' }, { slag: 'sal', ref: 'Sal 2' }, null], lager: { lunch: 'ja', haltid: true }, filter: { amnen: ['Ma', 3], termin: 'x' }, farg: 'rosa' }, 7, { namn: 'Ok', resurser: [] }]));
  assert.deepEqual(blandat, [{ namn: 'Ok', resurser: [{ slag: 'sal', ref: 'Sal 2' }], lager: { haltid: true }, filter: { amnen: ['Ma'], termin: null }, farg: 'amne' }]);
});
