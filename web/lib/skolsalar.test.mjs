// 05.2-SM-UXF-23: skolans salregister. Syntetiska uppgifter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchemaVillkor, checkSchemaVillkor, parseSchemaVillkor, sammaGrund } from './schema-contract.ts';
import { laggTillSal, sattSalbehov, tomtSalbehov } from './schema-salregister.ts';
import { medSkolsalar, overforingTillSkolan, parseSkolsalarDokument, parseSkolsalarSpara } from './skolsalar.ts';

const sal = (n, name, extra = {}) => ({ id: `sal-${n}`, name, typ: 'Allmän sal', platser: 30, utrustning: [], ...extra });
const skola = (nasta, salar) => ({ nasta, salar });

test('dokumentet tolkas strikt: exakta nycklar, nummer under nästa, unika namn', () => {
  assert.deepEqual(parseSkolsalarDokument(skola(3, [sal(1, 'A101'), sal(2, 'A102')])), skola(3, [sal(1, 'A101'), sal(2, 'A102')]));
  for (const bad of [skola(2, [sal(2, 'A')]), skola(3, [sal(1, 'A'), sal(2, 'a')]), { nasta: 2, salar: [], arv: [] }, skola(0, []), skola(2, [{ ...sal(1, 'A'), extra: 1 }])])
    assert.throws(() => parseSkolsalarDokument(bad));
  assert.throws(() => parseSkolsalarSpara({ contractVersion: 1, unitId: 'x', commandId: 'y', expectedRevision: 0, document: skola(1, []) }));
});

test('ett utkast utan salar börjar använda skolans register, och grunden ändras inte', () => {
  const v = defaultSchemaVillkor(), med = medSkolsalar(v, skola(3, [sal(1, 'A101'), sal(2, 'A102')]));
  assert.equal(med.salregister.kalla, 'skola');
  assert.deepEqual(med.salregister.salar.map(s => s.id), ['sal-1', 'sal-2']);
  assert.deepEqual(med.salar, ['A101', 'A102']);
  assert.ok(sammaGrund(v, med), 'grunden är densamma');
  assert.deepEqual(checkSchemaVillkor(med), []);
  assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(med))), med);
  // Utan skolregister blir spegeln tom men utkastet använder ändå skolans register.
  assert.deepEqual(medSkolsalar(v, null).salregister, { nasta: 1, arv: [], salar: [], kalla: 'skola' });
  // Idempotent: samma villkor tillbaka.
  assert.equal(medSkolsalar(med, skola(3, [sal(1, 'A101'), sal(2, 'A102')])), med);
});

test('äldre salnamn och utkastets eget register lämnas orörda tills de förs över', () => {
  const namn = { ...defaultSchemaVillkor(), salar: ['A101'] };
  assert.equal(medSkolsalar(namn, skola(2, [sal(1, 'A101')])), namn, 'ingen tyst adoption av salnamn');
  const egen = laggTillSal(defaultSchemaVillkor(), { name: 'B201', typ: 'Allmän sal', platser: 24, utrustning: [] });
  assert.equal(egen.salregister.kalla, undefined);
  assert.equal(medSkolsalar(egen, skola(2, [sal(1, 'A101')])), egen);
});

test('nytt namn och borttagen sal i skolans register följer med i regler, aktiviteter och salbehov via ID:t', () => {
  let v = medSkolsalar(defaultSchemaVillkor(), skola(4, [sal(1, 'A101'), sal(2, 'Labb'), sal(3, 'A103')]));
  v = sattSalbehov(v, 'amne', 'Kemi', { ...tomtSalbehov('sarskild'), salar: ['sal-2'] });
  v = sattSalbehov(v, 'amne', 'Svenska', { ...tomtSalbehov('sarskild'), salar: ['sal-1', 'sal-2'] });
  v = { ...v, egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A101', 'Labb'] }, { slag: 'sal', ref: 'Labb', typ: 'sparrad', days: [0], startMin: 480, endMin: 540 }, { slag: 'sal', ref: 'A103', typ: 'sparrad', days: [1], startMin: 480, endMin: 540 }] };
  assert.deepEqual(checkSchemaVillkor(v), []);
  // Labb tas bort, A101 och A103 byter namn med varandra.
  const efter = medSkolsalar(v, skola(4, [sal(1, 'A103'), sal(3, 'A101')]));
  assert.deepEqual(efter.salar, ['A103', 'A101']);
  assert.deepEqual(efter.egna, [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A103'] }, { slag: 'sal', ref: 'A101', typ: 'sparrad', days: [1], startMin: 480, endMin: 540 }],
    'regeln för den borttagna salen försvinner, och namnen följer ID:t även när två salar byter namn med varandra');
  assert.deepEqual(efter.salbehov.map(b => [b.ref, b.salar]), [['Svenska', ['sal-1']]], 'ett särskilt krav på bara den borttagna salen blir obesvarat');
  assert.deepEqual(checkSchemaVillkor(efter), []);
  assert.ok(sammaGrund(v, efter));
});

test('överföring av utkastets eget register: förhandsgranskning, samma nummer och namn är samma sal, konflikter stoppar', () => {
  let egen = laggTillSal(defaultSchemaVillkor(), { name: 'A101', typ: 'Allmän sal', platser: 30, utrustning: [] });
  egen = laggTillSal(egen, { name: 'Labb', typ: 'Laborationssal', platser: 20, utrustning: [] });
  egen = sattSalbehov(egen, 'amne', 'Kemi', { ...tomtSalbehov('sarskild'), salar: ['sal-2'] });
  const tom = overforingTillSkolan(egen, null);
  assert.deepEqual(tom.konflikter, []); assert.deepEqual(tom.rader.map(r => [r.id, r.finns]), [['sal-1', false], ['sal-2', false]]);
  assert.deepEqual(tom.dokument, skola(3, egen.salregister.salar));
  assert.equal(tom.villkor.salregister.kalla, 'skola'); assert.deepEqual(tom.villkor.salbehov, egen.salbehov);
  assert.ok(sammaGrund(egen, tom.villkor));
  const delvis = overforingTillSkolan(egen, skola(5, [sal(1, 'A101'), sal(4, 'Aula')]));
  assert.deepEqual(delvis.konflikter, []); assert.deepEqual(delvis.rader.map(r => r.finns), [true, false]);
  assert.deepEqual(delvis.dokument.salar.map(s => s.id), ['sal-1', 'sal-4', 'sal-2']); assert.equal(delvis.dokument.nasta, 5);
  assert.deepEqual(overforingTillSkolan(egen, skola(3, [sal(2, 'Gymnastik')])).konflikter, ['Labb: numret 2 är redan Gymnastik i skolans salregister.']);
  assert.deepEqual(overforingTillSkolan(egen, skola(4, [sal(3, 'labb')])).konflikter, ['Labb: salen har ett annat nummer i skolans salregister.']);
  assert.equal(overforingTillSkolan(defaultSchemaVillkor(), null), null);
  assert.equal(overforingTillSkolan(tom.villkor, tom.dokument), null);
});

test('överföring av äldre salnamn: namnet n blir sal-n och grunden behålls', () => {
  const namn = { ...defaultSchemaVillkor(), salar: ['A101', 'A102'], egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A102'] }] };
  const o = overforingTillSkolan(namn, null);
  assert.deepEqual(o.konflikter, []); assert.deepEqual(o.dokument.salar.map(s => [s.id, s.name]), [['sal-1', 'A101'], ['sal-2', 'A102']]);
  assert.deepEqual(o.villkor.salregister.arv, ['A101', 'A102']); assert.equal(o.villkor.salregister.kalla, 'skola');
  assert.deepEqual(o.villkor.egna, namn.egna);
  assert.ok(sammaGrund(namn, o.villkor));
  assert.deepEqual(checkSchemaVillkor(o.villkor), []);
});
