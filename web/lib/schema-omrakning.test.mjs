import assert from 'node:assert/strict';
import test from 'node:test';
import { kontrolleraSchemaDatum } from './schema-datum.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { schemaOmrakning } from './schema-omrakning.ts';
import { overforSalnamn } from './schema-salregister.ts';

const franska = f => f.lessons.find(l => l.title === 'Franska' && l.term === 'ht');
const lasa = l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId });

test('borttagen sal i skolans register följer inte med, men datum och tid finns kvar i förslaget', () => {
  const x = datumFixture(), datum = x.change();
  x.f.villkor = overforSalnamn(x.f.villkor);
  const fore = structuredClone(x.f), efter = structuredClone(x.f);
  efter.villkor.salregister.salar = efter.villkor.salregister.salar.filter(s => s.id !== 'sal-2');
  efter.rooms = efter.rooms.filter(s => s.id !== 'sal-2');
  efter.lessons = efter.lessons.map(l => ({ ...l, roomIds: l.roomIds.filter(id => id !== 'sal-2'), roomId: 'sal-1' }));
  const borttagetLas = lasa(franska(fore)), kvarLas = lasa(fore.lessons[0]);
  const r = schemaOmrakning(fore, efter, [datum], [borttagetLas, kvarLas]);
  assert.deepEqual(r.datedOverrides, [{ ...datum, room: null }]);
  assert.deepEqual(kontrolleraSchemaDatum(efter, r.datedOverrides), r.datedOverrides);
  assert.equal(r.datum[0].status, 'sal-saknas');
  assert.equal(r.datum[0].foreSal, 'Provsal B');
  assert.match(r.datum[0].orsak, /finns inte/);
  assert.deepEqual(r.locks, [kvarLas]);
  assert.equal(r.las[0].fore, borttagetLas);
  assert.equal(r.las[0].efter, franska(efter));
  assert.match(r.las[0].orsak, /låsta salen/);
  const pass = r.pass.find(p => p.fore?.id === datum.lesson);
  assert.deepEqual([pass.foreSal, pass.efterSal, pass.salAndrad, pass.tidAndrad], ['Provsal B', 'Provsal A', true, false]);
  assert.equal(datum.room, 'sal-2');
  assert.deepEqual(fore, x.f);
});

test('samma grund behåller säker datumändring även om tiden ändras på samma veckodag', () => {
  const x = datumFixture(), datum = x.change(), efter = structuredClone(x.f), nytt = franska(efter);
  nytt.startMin += 30;
  const las = lasa(franska(x.f)), r = schemaOmrakning(x.f, efter, [datum], [las]);
  assert.deepEqual(r.datedOverrides, [datum]);
  assert.equal(r.datum[0].status, 'bevarad');
  assert.deepEqual(r.locks, []);
  assert.match(r.las[0].orsak, /låsta dagen och tiden/);
  assert.deepEqual(r.pass, [{ fore: franska(x.f), efter: nytt, foreSal: 'Provsal B', efterSal: 'Provsal B', tidAndrad: true, salAndrad: false }]);
});

test('en tidigare låst placering utan sal redovisas om det nya förslaget tilldelar en sal', () => {
  const x = datumFixture(), nytt = structuredClone(x.f), gammalt = franska(x.f);
  gammalt.roomId = null;
  const r = schemaOmrakning(x.f, nytt, [], [lasa(gammalt)]);
  assert.deepEqual(r.locks, []);
  assert.match(r.las[0].orsak, /sal skiljer sig/);
  assert.deepEqual(r.las[0].fore, lasa(gammalt));
});

test('ändrad grund identifierar veckopasset via undervisning och termin även när dess tidigare ID pekar på ett annat ämne', () => {
  const x = datumFixture(), datum = x.change(), efter = structuredClone(x.f);
  efter.grundFingerprint = 'ny-grund';
  const franskpass = franska(efter), historisk = efter.lessons.find(l => l.title === 'Historia' && l.term === 'ht');
  const ids = new Map([[franskpass.id, historisk.id], [historisk.id, franskpass.id]]);
  [franskpass.id, historisk.id] = [historisk.id, franskpass.id];
  efter.trims = efter.trims.map(t => ({ ...t, lesson: ids.get(t.lesson) ?? t.lesson }));
  const r = schemaOmrakning(x.f, efter, [datum], [lasa(franska(x.f))]);
  assert.ok(datum.lesson !== franskpass.id);
  assert.deepEqual(r.datedOverrides, [{ ...datum, lesson: franskpass.id }]);
  assert.deepEqual(r.locks, [lasa(franskpass)]);
  assert.deepEqual(r.pass, []);
  assert.deepEqual(r.las, []);
});

test('kalendern kontrolleras för både original och det flyttade datumet', () => {
  const x = datumFixture(), datum = x.change();
  for (const [dag, orsak] of [[datum.originalDate, /ursprungsdatumet/], [datum.date, /flyttade datumet/]]) {
    const efter = structuredClone(x.f);
    efter.time.calendar.days.find(d => d.date === dag).schoolDay = false;
    const r = schemaOmrakning(x.f, efter, [datum]);
    assert.deepEqual(r.datedOverrides, []);
    assert.equal(r.datum[0].status, 'kan-inte-overforas');
    assert.match(r.datum[0].orsak, orsak);
    assert.deepEqual(r.datum[0].fore, datum);
  }
  const efter = structuredClone(x.f);
  efter.trims = efter.trims.filter(t => t.lesson !== datum.lesson);
  assert.match(schemaOmrakning(x.f, efter, [datum]).datum[0].orsak, /längd/);
});

test('gruppbyte och annan passuppdelning kräver granskning trots tidigare pass-ID och samma namn', () => {
  const x = datumFixture(), datum = x.change();
  for (const andring of ['grupp', 'uppdelning']) {
    const efter = structuredClone(x.f), nytt = franska(efter);
    efter.grundFingerprint = 'ny-grund';
    if (andring === 'grupp') nytt.undervisning = `undervisning:teaching_group:${x.id(71)}`;
    else efter.lessons.push({ ...nytt, id: 'pass-100', day: 2 });
    const r = schemaOmrakning(x.f, efter, [datum], [lasa(franska(x.f))]);
    assert.deepEqual(r.datedOverrides, []);
    assert.match(r.datum[0].orsak, /entydigt/);
    assert.deepEqual(r.locks, []);
    assert.equal(r.las[0].efter, null);
    assert.ok(r.pass.some(p => p.fore?.id === datum.lesson && !p.efter));
    assert.ok(r.pass.some(p => !p.fore && p.efter?.id === datum.lesson));
  }
});

test('flera lika långa pass kräver en entydig koppling till veckotid eller veckodag när grunden ändras', () => {
  const x = datumFixture(), datum = x.change(), gammalt = franska(x.f);
  x.f.lessons.push({ ...gammalt, id: 'pass-100', day: 2, startMin: 540 });
  const efter = structuredClone(x.f), nytt = franska(efter);
  efter.grundFingerprint = 'ny-grund';
  nytt.startMin = 540;
  const andra = efter.lessons.find(l => l.id === 'pass-100');
  andra.startMin = 600;
  assert.deepEqual(schemaOmrakning(x.f, efter, [datum]).datedOverrides, [datum]);

  andra.day = nytt.day;
  nytt.startMin = 600;
  const tvetydigt = schemaOmrakning(x.f, efter, [datum]);
  assert.deepEqual(tvetydigt.datedOverrides, []);
  assert.match(tvetydigt.datum[0].orsak, /entydigt/);
});

test('sal i äldre lista matchas på salnamn och stabilt sal-ID följer med vid namnbyte i register', () => {
  const x = datumFixture(), datum = x.change(), efter = structuredClone(x.f);
  efter.grundFingerprint = 'ny-grund';
  efter.rooms = [{ id: 'sal-1', name: 'Provsal B' }, { id: 'sal-2', name: 'Ny sal' }];
  assert.deepEqual(schemaOmrakning(x.f, efter, [datum]).datedOverrides, [{ ...datum, room: 'sal-1' }]);
  efter.rooms[0].name = 'Ytterligare en sal';
  assert.deepEqual(schemaOmrakning(x.f, efter, [datum]).datedOverrides, [{ ...datum, room: null }]);

  x.f.villkor = overforSalnamn(x.f.villkor);
  const register = structuredClone(x.f);
  register.villkor.salregister.salar.find(s => s.id === 'sal-2').name = 'Nytt namn';
  register.rooms.find(s => s.id === 'sal-2').name = 'Nytt namn';
  const r = schemaOmrakning(x.f, register, [datum]);
  assert.deepEqual(r.datedOverrides, [datum]);
  assert.deepEqual(r.pass, []);
  franska(register).roomIds = ['sal-1'];
  assert.match(schemaOmrakning(x.f, register, [datum]).datum[0].orsak, /inte tillåten/);
});
