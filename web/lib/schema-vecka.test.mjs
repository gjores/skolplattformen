import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSchemaDays, grundschemaVal, schemaDagStatus, schemaTillfallen, schemaTillfallesLangd, schemaVeckaVal, schemaVeckor, schemaVisningsDagar } from './schema-vecka.ts';
import { passRader, sorteraPass } from './schema-passtabell.ts';
import { schemaDatedCalendar } from './schema-vecka-data.ts';
import { parseSchemaForslag } from './schema-contract.ts';

const base = JSON.parse(readFileSync(new URL('../e2e/fixtures/schema-forslag.json', import.meta.url), 'utf8'));
const days = Array.from({ length: 19 }, (_, n) => {
  const date = addSchemaDays('2026-11-02', n), schoolDay = n % 7 < 5 && !(n >= 7 && n < 12);
  return { date, term: 'ht', schoolDay, reason: schoolDay ? null : n >= 7 && n < 12 ? 'Lovdag' : 'Helg', classes: date === '2026-11-17' ? { 'grupp-1': { schoolDay: false, reason: 'Friluftsdag' } } : {} };
});
const calendar = { start: '2026-11-02', end: '2026-11-20', days };
const f = { ...base, time: { ...base.time, calendar }, lessons: base.lessons.slice(0, 2).map((l, i) => ({ ...l, classIds: ['grupp-1'], term: 'ht', day: i, startMin: 480, durationMin: 70 })),
  trims: [{ lesson: base.lessons[0].id, term: 'ht', fixedMin: 5, extraCount: 1, extraMin: 5, occasions: [{ date: '2026-11-02', minutes: 5 }, { date: '2026-11-16', minutes: 10 }] }] };
const vecka = monday => ({ ...grundschemaVal(), mode: 'vecka', monday });

test('helt lovfri undervisning kan inte uppfinnas i en lovvecka; veckan finns ändå i bläddraren', () => {
  assert.equal(schemaTillfallen(f, vecka('2026-11-09')).length, 0);
  assert.equal(schemaVeckor(calendar, 'ht').length, 3);
  assert.match(schemaVeckor(calendar, 'ht')[1].label, /Lovdag/u);
  assert.equal(schemaVisningsDagar(calendar, vecka('2026-11-09')).filter(d => !d.schoolDay).length, 5);
});

test('den daterade kortningen ger den kanoniska längden just den veckan', () => {
  assert.equal(schemaTillfallen(f, vecka('2026-11-02'))[0].length, 65);
  assert.equal(schemaTillfallen(f, vecka('2026-11-16'))[0].length, 60);
  assert.equal(schemaTillfallesLangd(f.lessons[0], { date: '2026-11-16', term: 'vt' }, f.trims), 60);
});

test('klassens egen dag utan undervisning tar bort passet utan att ta bort skolans dag', () => {
  const day = days.find(d => d.date === '2026-11-17');
  assert.equal(schemaDagStatus(day, null).schoolDay, true);
  assert.deepEqual(schemaDagStatus(day, 'grupp-1'), { schoolDay: false, reason: 'Friluftsdag' });
  assert.deepEqual(schemaTillfallen(f, vecka('2026-11-16')).map(o => o.date), ['2026-11-16']);
});

test('datumintervall passerar veckoskiften och begränsas till fyra kalenderveckor', () => {
  const val = { ...grundschemaVal(), mode: 'intervall', from: '2026-11-06', to: '2026-11-17' };
  assert.equal(schemaVisningsDagar(calendar, val).length, 12);
  assert.deepEqual(schemaTillfallen(f, val).map(o => o.date), ['2026-11-16']);
  assert.equal(schemaVisningsDagar(calendar, { ...val, to: '2026-12-04' }).length, 0);
});

test('utan faktisk kalender används enbart grundschemat och dåtida datum fabriceras inte', () => {
  assert.deepEqual(schemaVeckaVal({ ...f, time: { ...f.time, calendar: null } }, 'ht', vecka('2026-11-09')), grundschemaVal());
  assert.equal(schemaVisningsDagar(null, vecka('2026-11-09')).length, 0);
});

test('passtabellen visar unika daterade rader men varje åtgärd behåller grundschemats pass-ID', () => {
  const val = { ...grundschemaVal(), mode: 'intervall', from: '2026-11-02', to: '2026-11-20' };
  const rows = passRader(f, 'ht', null, [], val);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(r => r.id)).size, 3);
  assert.deepEqual(rows.map(r => r.lessonId), [f.lessons[0].id, f.lessons[1].id, f.lessons[0].id]);
  assert.deepEqual(rows.map(r => r.langd), [65, 70, 60]);
  assert.equal(rows.at(-1).kortareVeckor, 0);
  assert.deepEqual(sorteraPass([...rows].reverse(), { kolumn: 'dag', stigande: true }).map(r => r.datum), ['2026-11-02', '2026-11-03', '2026-11-16']);
});

test('serverkalendern lämnar bara klasslöpnummer och verksamhetsorsaker', () => {
  const data = schemaDatedCalendar({ source: 'kalender', dates: [{ date: '2026-11-02', term: 'ht', schoolDay: true, reason: null, classes: { 'internt-klass-id': { schoolDay: false, reason: 'Friluftsdag' } } }] }, ['internt-klass-id'], [{ id: 'grupp-2', classIds: ['internt-klass-id'] }]);
  assert.deepEqual(Object.keys(data.days[0].classes), ['grupp-1', 'grupp-2']);
  assert.ok(!JSON.stringify(data).includes('internt-klass-id'));
});

test('klienttolken nekar felaktiga kalenderdatum, interna klass-ID och tvetydiga kortningar', () => {
  const expected = { unitId: f.unitId, schoolYear: f.schoolYear, period: f.period, villkor: f.villkor };
  for (const mutate of [x => { x.time.calendar.days[0].date = '2026-02-31'; }, x => { x.time.calendar.days[0].classes = { 'internt-id': { schoolDay: false, reason: 'Friluftsdag' } }; },
    x => { x.trims[0].occasions.push({ ...x.trims[0].occasions[0] }); }]) {
    const copy = structuredClone(f); mutate(copy); assert.throws(() => parseSchemaForslag(copy, expected));
  }
});

test('verkliga datum summerar exakt till samma timplanetid som serverns samtliga undervisningar', () => {
  assert.ok(base.time.calendar, 'den syntetiska motorfixturen ska bära daterad kalender');
  for (const term of ['ht', 'vt']) {
    const actual = schemaVeckor(base.time.calendar, term).flatMap(w => schemaTillfallen(base, vecka(w.monday))).filter(o => o.term === term).reduce((sum, o) => sum + o.length, 0);
    const expected = base.teachings.flatMap(t => t.terms).filter(t => t.term === term).reduce((sum, t) => sum + t.plannedMin, 0);
    assert.equal(actual, expected, `${term}: egna klassdagar, grupper och tillfälleskortning får inte ändra timplanssumman`);
  }
});
