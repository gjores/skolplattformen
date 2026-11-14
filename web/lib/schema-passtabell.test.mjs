// Passtabellen (05.2-SM-PASSTABELL): rader, status, filter, sortering, gruppering och storlek. Fixturen är motorns syntetiska förslag (e2e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterVal, filtreraPass, grupperaPass, marginalText, passRader, radNamn, sorteraPass, terminText, tidText, veckorText } from './schema-passtabell.ts';
import { medUtkast, schemaUtkast, tomtUtkast, utkastEfter } from './schema-utkast.ts';

const forslag = JSON.parse(readFileSync(new URL('../e2e/fixtures/schema-forslag.json', import.meta.url), 'utf8'));
const kontroll = JSON.parse(readFileSync(new URL('../e2e/fixtures/schema-kontroll.json', import.meta.url), 'utf8'));
const ids = rader => rader.map(r => r.id);

test('en rad per pass ur utkastets placeringar, också passen på viloytan', () => {
  let utkast = schemaUtkast(tomtUtkast(), { type: 'reset', forslag });
  utkast = schemaUtkast(utkast, { type: 'park', lesson: 'pass-1' });
  utkast = schemaUtkast(utkast, { type: 'move', lesson: 'pass-2', day: 0, startMin: 480 });
  const rader = passRader({ ...forslag, lessons: medUtkast(forslag.lessons, utkast.placements) }, 'ht', null, []);
  assert.equal(rader.length, forslag.lessons.length);
  const [a, b] = rader;
  assert.deepEqual({ id: a.id, dag: a.dag, start: a.start, status: a.status }, { id: 'pass-1', dag: null, start: null, status: 'viloyta' });
  assert.equal(tidText(a), '–');
  assert.deepEqual({ dag: b.dag, start: b.start, status: b.status }, { dag: 0, start: 480, status: 'lagd' });
  // Justerad längd för terminen som i veckan, och kortning vissa veckor (fixturens pass-1: 5 min kortare alla veckor, 2 veckor ytterligare).
  assert.equal(a.langd, 65); assert.equal(a.grundLangd, 70); assert.equal(veckorText(a), 'kortare 2 veckor');
  assert.equal(b.langd, 65); assert.equal(veckorText(b), '');
  assert.equal(terminText(a), 'HT');
  assert.equal(radNamn(b), 'Svenska, Klass 1, måndag 08:00–09:05');
  // Klass och grupp hålls isär: Franska är en grupp i underlaget.
  const franska = rader.find(r => r.undervisning === 'Franska');
  assert.deepEqual(franska.klasser, []); assert.deepEqual(franska.grupper.map(x => x.namn), ['Franska']);
  assert.equal(marginalText({ marginalFore: 0, marginalEfter: 10 }), '– · 10 min');
  assert.equal(marginalText({ marginalFore: 0, marginalEfter: 0 }), '');
});

test('status ur kontrollens svar: regelavvikelse med orsak, viloytan har ingen avvikelse', () => {
  const lessons = medUtkast(forslag.lessons, { 'pass-1': { day: kontroll.move.day, startMin: kontroll.move.startMin, room: null } });
  const rader = passRader({ ...forslag, lessons }, 'ht', kontroll.clash.violations, []);
  const fel = rader.filter(r => r.status === 'avvikelse');
  assert.deepEqual(ids(fel), ['pass-1', 'pass-2']);
  assert.equal(fel[0].orsak, kontroll.clash.violations[0].message);
  // Utan kontroll eller med tomt svar är alla lagda pass Lagd.
  assert.ok(passRader({ ...forslag, lessons }, 'ht', null, []).every(r => r.status === 'lagd'));
  // Ett pass på spärrad tid får kontrollens kod som rad (samma text som i passrutan).
  const egna = [{ slag: 'amne', ref: 'Svenska', typ: 'sparrad', days: [kontroll.move.day], startMin: 480, endMin: 990 }];
  const sparr = passRader({ ...forslag, lessons }, 'ht', [{ code: 'outside_allowed', message: 'Utanför tillåten tid.', lessons: ['pass-1', 'pass-99'] }], egna);
  assert.equal(sparr.find(r => r.id === 'pass-1').orsak, 'Ligger på spärrad tid');
  const parkerad = passRader({ ...forslag, lessons: medUtkast(forslag.lessons, { 'pass-1': { day: null, startMin: null, room: null } }) }, 'ht', kontroll.clash.violations, []);
  assert.equal(parkerad.find(r => r.id === 'pass-1').status, 'viloyta');
});

test('filter i kombination: samma typ är eller, olika typer är och; sökningen kräver varje ord', () => {
  const rader = passRader(forslag, 'ht', null, []), val = filterVal(rader);
  assert.deepEqual(val.klass.slice(0, 2).map(x => x.namn), ['Klass 1', 'Klass 2']);
  assert.deepEqual(val.dag.map(x => x.namn), ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']);
  assert.deepEqual(val.termin.map(x => x.varde), ['ht', 'vt']);
  // Ett pass som går hela läsåret träffas av båda terminerna.
  const helt = { ...rader[0], termin: null };
  assert.deepEqual(['ht', 'vt'].map(t => filtreraPass([helt], [{ typ: 'termin', varde: t }]).length), [1, 1]);
  const larare = filtreraPass(rader, [{ typ: 'larare', varde: 'larare-1' }]);
  assert.ok(larare.length > 0 && larare.every(r => r.larare.some(x => x.id === 'larare-1')));
  const tva = filtreraPass(rader, [{ typ: 'larare', varde: 'larare-1' }, { typ: 'larare', varde: 'larare-2' }]);
  assert.equal(tva.length, larare.length + filtreraPass(rader, [{ typ: 'larare', varde: 'larare-2' }]).length - filtreraPass(larare, [{ typ: 'larare', varde: 'larare-2' }]).length);
  const kombinerat = filtreraPass(rader, [{ typ: 'larare', varde: 'larare-1' }, { typ: 'dag', varde: '0' }, { typ: 'termin', varde: 'ht' }]);
  assert.ok(kombinerat.length > 0 && kombinerat.length < larare.length);
  assert.ok(kombinerat.every(r => r.dag === 0 && r.termin === 'ht' && r.larare.some(x => x.id === 'larare-1')));
  assert.deepEqual(filtreraPass(rader, [{ typ: 'status', varde: 'viloyta' }]), []);
  const sok = filtreraPass(rader, [], 'svenska  MÅNDAG klass 12');
  assert.ok(sok.length > 0 && sok.every(r => r.undervisning === 'Svenska' && r.dag === 0));
  assert.ok(sok.some(r => r.klasser.some(x => x.namn === 'Klass 12')));
  assert.equal(filtreraPass(rader, []), rader);
  const vakant = filtreraPass(rader, [{ typ: 'larare', varde: 'ingen' }]);
  assert.ok(vakant.length > 0 && vakant.every(r => r.vakant));
});

test('sortering på kolumn, stabil och åt båda hållen; viloytan sist på dag', () => {
  const lessons = medUtkast(forslag.lessons, { 'pass-1': { day: null, startMin: null, room: null } });
  const rader = passRader({ ...forslag, lessons }, 'ht', null, []);
  const dag = sorteraPass(rader, { kolumn: 'dag', stigande: true });
  for (let i = 1; i < dag.length; i += 1) {
    const a = dag[i - 1], b = dag[i];
    assert.ok((a.dag ?? 99) < (b.dag ?? 99) || (a.dag === b.dag && (a.start ?? 0) <= (b.start ?? 0)));
  }
  assert.equal(dag.at(-1).id, 'pass-1');
  const ned = sorteraPass(rader, { kolumn: 'dag', stigande: false });
  assert.equal(ned[0].id, 'pass-1');
  const amne = sorteraPass(rader, { kolumn: 'undervisning', stigande: true });
  assert.ok(amne.every((r, i) => i === 0 || amne[i - 1].undervisning.localeCompare(r.undervisning, 'sv') <= 0));
  assert.deepEqual(ids(sorteraPass(rader, { kolumn: 'undervisning', stigande: true })), ids(amne));
  const langd = sorteraPass(rader, { kolumn: 'langd', stigande: false });
  assert.ok(langd.every((r, i) => i === 0 || langd[i - 1].langd >= r.langd));
});

test('gruppering per undervisning med samma tal som Tid över läsåret', () => {
  const rader = passRader(forslag, 'ht', null, []);
  const grupper = grupperaPass(sorteraPass(rader, { kolumn: 'undervisning', stigande: true }), forslag.teachings);
  assert.equal(grupper.reduce((n, g) => n + g.rader.length, 0), rader.length);
  // Varje undervisning i Tid över läsåret har en grupp, och varje grupp har sin tid därifrån.
  assert.equal(grupper.length, forslag.teachings.length);
  assert.ok(grupper.every(g => g.tid !== null));
  for (const t of forslag.teachings) {
    const g = grupper.find(x => x.undervisning === t.title && x.klasser.join(',') === [...t.classes].sort((a, b) => a.localeCompare(b, 'sv')).join(','));
    assert.ok(g, `${t.title} ${t.classes}`);
    assert.deepEqual(g.tid, { planeradMin: t.plannedMin, timplanMin: t.needMin, utanTid: t.unplaced });
  }
  const franska = grupper.find(g => g.undervisning === 'Franska');
  assert.equal(franska.rader.length, 4);
  // Grupperna följer sorteringen och raderna i gruppen behåller den.
  assert.ok(grupper.every((g, i) => i === 0 || grupper[i - 1].undervisning.localeCompare(g.undervisning, 'sv') <= 0));
});

test('flera pass läggs på viloytan i ett ångra-steg', () => {
  const start = schemaUtkast(tomtUtkast(), { type: 'reset', forslag });
  const action = { type: 'park', lesson: 'pass-1', fler: ['pass-2', 'pass-3'] };
  const efter = utkastEfter(start, action);
  assert.deepEqual(['pass-1', 'pass-2', 'pass-3'].map(id => efter[id].day), [null, null, null]);
  const parkerat = schemaUtkast(start, action);
  assert.equal(parkerat.undo.length, 1);
  assert.equal(Object.values(parkerat.placements).filter(p => p.day === null).length, 3);
  const angrat = schemaUtkast(parkerat, { type: 'undo' });
  assert.deepEqual(angrat.placements, start.placements);
  assert.equal(utkastEfter(start, { type: 'park', lesson: 'pass-1', fler: ['finns-inte'] }), null);
});

test('1 000 pass filtreras, sorteras och grupperas på under 50 ms', () => {
  const lessons = Array.from({ length: 1000 }, (_, i) => ({ ...forslag.lessons[i % forslag.lessons.length], id: `pass-${i + 1}` }));
  const stor = { ...forslag, lessons };
  const t0 = performance.now();
  const rader = passRader(stor, 'ht', kontroll.clash.violations, []);
  const tRader = performance.now() - t0;
  // Värm upp en gång (JIT), mät sedan det användaren gör vid varje ändring av filter och sortering.
  sorteraPass(filtreraPass(rader, [{ typ: 'larare', varde: 'larare-1' }]), { kolumn: 'dag', stigande: true });
  const matt = [];
  for (const [filter, sok, kolumn] of [[[], '', 'undervisning'], [[{ typ: 'dag', varde: '2' }, { typ: 'termin', varde: 'ht' }], '', 'larare'], [[], 'matematik klass', 'tid'], [[{ typ: 'status', varde: 'lagd' }], '', 'status']]) {
    const t = performance.now();
    const ut = sorteraPass(filtreraPass(rader, filter, sok), { kolumn, stigande: false });
    grupperaPass(ut, forslag.teachings);
    matt.push(performance.now() - t);
  }
  const t = performance.now();
  sorteraPass(rader, { kolumn: 'undervisning', stigande: true });
  matt.push(performance.now() - t);
  console.log(`1 000 pass: rader ${tRader.toFixed(1)} ms, filter och sortering ${matt.map(x => x.toFixed(1)).join(' / ')} ms`);
  assert.equal(rader.length, 1000);
  assert.ok(Math.max(...matt) < 50, `högst ${Math.max(...matt)} ms`);
  assert.ok(tRader < 50, `rader ${tRader} ms`);
});
