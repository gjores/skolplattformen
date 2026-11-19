import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORBERED_OMRADEN, genomgangsStatus, nastaUppgift, parseGenomgang, schemaForbered } from './schema-forbered.ts';
import { defaultSchemaVillkor } from './schema-contract.ts';
import { laggTillSal, sattSalbehov, tomtSalbehov } from './schema-salregister.ts';

// Samma syntetiska förslag som gränssnittsproven använder, utan lagda pass.
const fixtur = JSON.parse(readFileSync(new URL('../e2e/fixtures/schema-forslag.json', import.meta.url), 'utf8'));
const kalla = () => ({ ...structuredClone(fixtur), lessons: fixtur.lessons.map(l => ({ ...l, day: null, startMin: null, roomId: null })) });
const punkter = (villkor = defaultSchemaVillkor(), k = kalla(), las = 0) => schemaForbered({ kalla: k, villkor, las });
const id = (p, omrade) => p.find(x => x.id === omrade);

test('sju områden i fast ordning, med värden och kontroll även innan något är ifyllt', () => {
  const p = punkter();
  assert.deepEqual(p.map(x => x.id), [...FORBERED_OMRADEN]); assert.equal(p.length, 7);
  assert.ok(p.every(x => x.varden.length && x.kontroll.length && /^[0-9a-f]{8}$/u.test(x.avtryck)));
  assert.match(id(p, 'salar').varden.join(' · '), new RegExp(`Inget salregister · 0 av ${fixtur.fordelning.length} undervisningar har salbehov · ${fixtur.fordelning.length} obesvarade`, 'u'));
  assert.equal(id(p, 'salar').saknas, fixtur.fordelning.length + 1);
  assert.equal(id(p, 'aktiviteter').nasta, 'Gå igenom nationella prov'); assert.match(id(p, 'mal').kontroll[0], /går inte att välja ännu/u);
  assert.match(id(p, 'larartider').kontroll[0], /kan inte avgöra/u);
});
test('provplanen räknas som en förutsättning och en sparad ändring upphäver områdets genomgång', () => {
  const aktivitet = (provplan, provlasning = 'klar') => id(schemaForbered({ kalla: null, villkor: defaultSchemaVillkor(), las: 0, provplan, provlasning }), 'aktiviteter');
  const osparad = aktivitet(null);
  assert.equal(osparad.saknas, 1);
  assert.equal(aktivitet(null, 'fel').nasta, 'Läs in provplanen');
  assert.equal(aktivitet(null, 'ej-tillamplig').saknas, 0);
  const bekräftad = aktivitet({ granskad: true, bokningar: [] });
  assert.equal(bekräftad.saknas, 0);
  assert.ok(bekräftad.varden.includes('Inga prov bekräftade'));
  assert.equal(genomgangsStatus(bekräftad, { aktiviteter: { avtryck: osparad.avtryck, at: '2026-11-19T12:00:00Z' } }), 'andrat');
});
test('utan läst underlag går inget att kontrollera och underlaget är nästa uppgift', () => {
  const p = schemaForbered({ kalla: null, villkor: defaultSchemaVillkor(), las: 0 });
  assert.deepEqual(id(p, 'salar').varden, ['Underlaget är inte läst']); assert.equal(nastaUppgift(p, {}).omrade, 'underlag');
  assert.ok(id(p, 'regler').varden[0].startsWith('Skoldag 08:'), 'reglerna visas ur villkoren även utan underlag');
});
test('nästa uppgift är första området där uppgifter saknas, sedan första utan aktuell genomgång', () => {
  let v = laggTillSal(defaultSchemaVillkor(), { name: 'A101', typ: 'Allmän sal', platser: 30, utrustning: [] });
  const fore = punkter(v), nasta = nastaUppgift(fore, {});
  assert.equal(nasta.omrade, id(fore, 'underlag').saknas ? 'underlag' : 'salar');
  assert.equal(id(fore, 'salar').nasta, `Ange salbehov för ${fixtur.fordelning.length} undervisningar`);
  for (const amne of new Set(fixtur.fordelning.map(r => r.title))) v = sattSalbehov(v, 'amne', amne, tomtSalbehov('allman'));
  const efter = punkter(v);
  assert.equal(id(efter, 'salar').saknas, 0); assert.equal(id(efter, 'salar').nasta, null);
  assert.match(id(efter, 'salar').kontroll.join(' '), /Kapaciteten är inte kontrollerad/u, 'fixturen saknar elevantal: kapaciteten är inte kontrollerad, inte godkänd');
  // Inget saknas (utom ev. underlagets luckor): då pekar nästa uppgift på genomgången, och till sist på ingenting.
  const utanLuckor = efter.map(x => ({ ...x, saknas: 0, nasta: null }));
  assert.deepEqual(nastaUppgift(utanLuckor, {}), { omrade: 'underlag', atgard: 'Visa', text: 'Gå igenom underlag', skal: 'Området är inte genomgånget.' });
  const alla = Object.fromEntries(utanLuckor.map(x => [x.id, { avtryck: x.avtryck, at: '2026-11-17T08:00:00.000Z' }]));
  assert.equal(nastaUppgift(utanLuckor, alla), null);
});
test('människans bock gäller områdets innehåll: ändras det blir genomgången inaktuell, andra områden påverkas inte', () => {
  const v = laggTillSal(defaultSchemaVillkor(), { name: 'A101', typ: 'Allmän sal', platser: 30, utrustning: [] }), fore = punkter(v);
  const g = Object.fromEntries(fore.map(x => [x.id, { avtryck: x.avtryck, at: '2026-11-17T08:00:00.000Z' }]));
  assert.ok(fore.every(x => genomgangsStatus(x, g) === 'genomgangen'));
  const efter = punkter(sattSalbehov(v, 'amne', fixtur.fordelning[0].title, tomtSalbehov('allman')));
  assert.deepEqual(efter.filter(x => genomgangsStatus(x, g) === 'andrat').map(x => x.id), ['salar']);
  const regler = punkter({ ...v, breakMin: v.breakMin + 5 });
  assert.deepEqual(regler.filter(x => genomgangsStatus(x, g) === 'andrat').map(x => x.id), ['regler']);
  assert.deepEqual(punkter(v, kalla(), 3).filter(x => genomgangsStatus(x, g) === 'andrat').map(x => x.id), ['larartider'], 'låsta pass hör till fasta tider');
  assert.equal(genomgangsStatus(fore[0], {}), 'aterstar');
  // Maskinen bockar aldrig av: ett område utan luckor är fortfarande Återstår tills en människa gått igenom det.
  assert.equal(genomgangsStatus(id(fore, 'mal'), {}), 'aterstar');
});
test('avtrycket beror på innehållet, inte på fältens ordning efter omläsning', () => {
  const v = sattSalbehov(laggTillSal(defaultSchemaVillkor(), { name: 'A101', typ: 'Allmän sal', platser: 30, utrustning: [] }), 'amne', fixtur.fordelning[0].title, tomtSalbehov('allman'));
  const omkastad = { ...v, salbehov: v.salbehov.map(b => Object.fromEntries(Object.entries(b).reverse())), salregister: Object.fromEntries(Object.entries(v.salregister).reverse()) };
  assert.equal(JSON.stringify(v.salbehov) === JSON.stringify(omkastad.salbehov), false);
  assert.deepEqual(punkter(omkastad).map(x => x.avtryck), punkter(v).map(x => x.avtryck));
});
test('sparad genomgång tolkas strikt: okända områden och trasiga värden släpps', () => {
  assert.deepEqual(parseGenomgang({ salar: { avtryck: '0123abcd', at: '2026-11-17T08:00:00.000Z' }, annat: { avtryck: '0123abcd', at: 'x' }, regler: { avtryck: 'nej', at: '2026-11-17' }, mal: { avtryck: '0123abcd', at: 'inte datum' } }),
    { salar: { avtryck: '0123abcd', at: '2026-11-17T08:00:00.000Z' } });
  assert.deepEqual(parseGenomgang(null), {}); assert.deepEqual(parseGenomgang([1]), {});
});
