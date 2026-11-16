import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andraSal, checkSalregister, gallandeSalbehov, laggTillSal, lampligaSalar, overforSalnamn, parseSalbehov, parseSalregister, sattSalbehov, taBortSal, tomtSalbehov } from './schema-salregister.ts';

const sal = (id, name, typ, platser, utrustning = []) => ({ id, name, typ, platser, utrustning });
const register = () => ({ nasta: 8, arv: [], salar: [sal('sal-1', 'A101', 'Allmän sal', 32, ['Projektor']), sal('sal-2', 'Labb 1', 'Laborationssal', 24, ['Dragskåp']), sal('sal-3', 'Labb 2', 'Laborationssal', 18, ['Dragskåp']),
  sal('sal-7', 'Musiksal', 'Specialsal', null, ['Instrument']), sal('sal-5', '201', 'allmän sal', null)] });
const behov = (lage, extra = {}) => ({ slag: 'undervisning', ref: 'undervisning:kemi', ...tomtSalbehov(lage), ...extra });

test('flera krav ger snittet av salarna, med skäl för varje sal som faller bort', () => {
  const r = register();
  const ett = lampligaSalar(r, behov('sarskild', { utrustning: ['dragskåp'] }), null);
  assert.deepEqual(ett.tillatna, ['sal-2', 'sal-3']);
  const tva = lampligaSalar(r, behov('sarskild', { utrustning: ['dragskåp'] }), 22);
  assert.deepEqual(tva.tillatna, ['sal-2']); assert.equal(tva.hinder, null);
  assert.deepEqual(tva.rader.find(x => x.sal.id === 'sal-3').skal, ['18 platser, gruppen har 22 elever.']);
  assert.deepEqual(tva.rader.find(x => x.sal.id === 'sal-1').skal, ['Saknar dragskåp.']);
  assert.ok(tva.tillatna.length < ett.tillatna.length);
});
test('okända platser eller okänt elevantal sorterar inte bort salen men kapaciteten är inte kontrollerad', () => {
  const allman = lampligaSalar(register(), behov('allman'), 30);
  assert.deepEqual(allman.tillatna, ['sal-1', 'sal-5']); assert.deepEqual(allman.kapacitet, { 'sal-1': 'racker', 'sal-5': 'okand' });
  assert.deepEqual(lampligaSalar(register(), behov('allman'), null).kapacitet, { 'sal-1': 'okand', 'sal-5': 'okand' });
  assert.deepEqual(allman.rader.find(x => x.sal.id === 'sal-7').skal, ['Är specialsal, inte allmän sal.']);
});
test('tom mängd ger ett namngivet hinder; sal behövs inte ger varken sal eller hinder', () => {
  const tom = lampligaSalar(register(), behov('sarskild', { utrustning: ['Instrument'], typ: 'Laborationssal' }), 30);
  assert.deepEqual(tom.tillatna, []); assert.equal(tom.hinder, 'Ingen sal uppfyller alla krav: saltyp laborationssal, instrument, minst 30 platser.');
  assert.deepEqual(lampligaSalar(register(), behov('ingen', { form: 'utomhus' }), 30), { rader: [], tillatna: [], kapacitet: {}, hinder: null });
  assert.equal(lampligaSalar({ nasta: 1, arv: [], salar: [] }, behov('allman'), null).hinder, 'Salregistret är tomt.');
});
test('undervisningens eget salbehov går före ämnets; utan post är behovet obesvarat', () => {
  const alla = [{ ...behov('sarskild', { utrustning: ['Dragskåp'] }), slag: 'amne', ref: 'Kemi 1' }, behov('ingen', { form: 'utomhus' })];
  assert.equal(gallandeSalbehov(alla, 'undervisning:kemi', 'Kemi 1').kalla, 'eget');
  assert.equal(gallandeSalbehov(alla, 'undervisning:annan', 'Kemi 1').kalla, 'amne');
  assert.equal(gallandeSalbehov(alla, 'undervisning:annan', 'Fysik'), null); assert.equal(gallandeSalbehov(undefined, 'x', 'y'), null);
});
test('äldre salnamn förs bara över uttryckligen och behåller sina nummer; nya salar får aldrig ett använt nummer', () => {
  const gammalt = { salar: ['Idrottshallen', 'Labbet'], egna: [{ slag: 'sal', ref: 'Labbet', typ: 'sparrad', days: [4], startMin: 480, endMin: 720 }, { slag: 'amne', ref: 'Kemi', typ: 'sal', rooms: ['Labbet', 'Idrottshallen'] }],
    aktiviteter: [{ id: 'a', rooms: ['Labbet'] }] };
  assert.equal(laggTillSal(gammalt, sal('', 'Ny', '', null)), gammalt, 'ingen tyst adoption: ny registersal kräver överföring först');
  let v = overforSalnamn(gammalt);
  assert.deepEqual(v.salregister.salar.map(s => [s.id, s.name, s.typ, s.platser]), [['sal-1', 'Idrottshallen', '', null], ['sal-2', 'Labbet', '', null]]);
  assert.equal(overforSalnamn(v), v); assert.deepEqual(v.salregister.arv, ['Idrottshallen', 'Labbet']);
  v = andraSal(v, 'sal-2', { name: 'Labb 1', typ: 'Laborationssal', platser: 24, utrustning: ['Dragskåp'] });
  assert.deepEqual(v.salar, ['Idrottshallen', 'Labb 1']); assert.equal(v.egna[0].ref, 'Labb 1'); assert.deepEqual(v.egna[1].rooms, ['Labb 1', 'Idrottshallen']); assert.deepEqual(v.aktiviteter[0].rooms, ['Labb 1']);
  v = sattSalbehov(v, 'undervisning', 'undervisning:kemi', { ...tomtSalbehov('sarskild'), salar: ['sal-1'], onskad: ['sal-2'] });
  v = sattSalbehov(v, 'amne', 'Idrott', { ...tomtSalbehov('sarskild'), salar: ['sal-1'] });
  const borta = taBortSal(v, 'sal-1'); v = borta.villkor;
  assert.deepEqual(borta.berorda.sort(), ['Idrott', 'undervisning:kemi']);
  assert.deepEqual(v.salregister.salar.map(s => s.id), ['sal-2']); assert.deepEqual(v.salar, ['Labb 1']); assert.deepEqual(v.egna[1].rooms, ['Labb 1']);
  assert.deepEqual(v.salbehov, [], 'krav som bara var den borttagna salen blir obesvarade');
  v = laggTillSal(v, { name: 'A101', typ: 'Allmän sal', platser: 30, utrustning: [] });
  assert.deepEqual(v.salregister.salar.map(s => s.id), ['sal-2', 'sal-3']); assert.equal(v.salregister.nasta, 4);
  assert.deepEqual(v.salregister.arv, ['Idrottshallen', 'Labbet'], 'de överförda namnen ändras aldrig');
  assert.equal(laggTillSal(v, { name: 'a101', typ: '', platser: null, utrustning: [] }), v, 'samma namn nekas');
  assert.deepEqual(checkSalregister(v.salregister, v.salbehov, v.salar), []);
});
test('tolkningen nekar dubbla ID, använda nummer över nästa lediga, okända fält och dubbla salbehov', () => {
  const r = register(); assert.deepEqual(parseSalregister(structuredClone(r)), r);
  assert.throws(() => parseSalregister({ ...r, nasta: 7 })); assert.throws(() => parseSalregister({ nasta: 2, arv: ['A', 'B'], salar: [] })); assert.throws(() => parseSalregister({ ...r, salar: [...r.salar, r.salar[0]] }));
  assert.throws(() => parseSalregister({ ...r, salar: [{ ...r.salar[0], extra: 1 }] })); assert.throws(() => parseSalregister({ ...r, salar: [{ ...r.salar[0], platser: 0 }] }));
  assert.throws(() => parseSalregister({ ...r, salar: [{ ...r.salar[0], id: 'sal-0' }] }));
  const b = behov('sarskild', { utrustning: ['Dragskåp'], onskad: ['sal-2'] });
  assert.deepEqual(parseSalbehov([structuredClone(b)]), [b]); assert.throws(() => parseSalbehov([b, b])); assert.throws(() => parseSalbehov([{ ...b, form: 'hemma' }]));
});
test('rimlighetskontrollen kräver form när sal inte behövs, minst ett särskilt krav och salar som finns', () => {
  const r = register(), namn = r.salar.map(s => s.name), fel = b => checkSalregister(r, [b], namn)[0] ?? null;
  assert.match(fel(behov('ingen', { form: null })), /undervisningsform/u); assert.match(fel(behov('sarskild')), /minst ett krav/u);
  assert.match(fel(behov('allman', { utrustning: ['Projektor'] })), /Särskilda salskrav/u); assert.match(fel(behov('sarskild', { salar: ['sal-9'] })), /finns inte längre/u);
  assert.equal(fel(behov('ingen', { form: 'utomhus' })), null);
  assert.match(checkSalregister(undefined, [behov('allman')], [])[0], /kräver ett salregister/u); assert.deepEqual(checkSalregister(undefined, undefined, ['Gammal sal']), []);
  assert.match(checkSalregister(r, [], ['A101'])[0], /stämmer inte överens/u);
});
