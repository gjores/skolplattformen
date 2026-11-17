import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forhandsgranskaSalandring, saltabellFiltrera, saltabellRader, saltabellVarden, tillampaSalandring } from './schema-saltabell.ts';
import { checkSalregister, tomtSalbehov } from './schema-salregister.ts';

const sal = (id, name, typ, platser, utrustning = []) => ({ id, name, typ, platser, utrustning });
const register = { nasta: 5, arv: [], salar: [sal('sal-1', 'A101', 'Allmän sal', 32), sal('sal-2', 'Labb 1', 'Laborationssal', 24, ['Dragskåp']), sal('sal-3', 'Labb 2', 'Laborationssal', 18, ['Dragskåp']), sal('sal-4', 'Musiksal', 'Specialsal', null, ['Instrument'])] };
const amnen = ['Biologi 1', 'Kemi 1', 'Fysik 1a', 'Naturkunskap 1b'];
// 22 syntetiska undervisningar: fem–sex grupper per ämne.
const fordelning = Array.from({ length: 22 }, (_, i) => ({ ref: `undervisning:${i + 1}`, title: amnen[i % 4], classes: [`NA27${String.fromCharCode(65 + Math.floor(i / 4))}`] }));
const lessons = fordelning.map((f, i) => ({ sal: { undervisning: f.ref, elever: i === 5 ? null : 20 + i % 5 } }));
const kalla = { fordelning, lessons };
const egen = (n, lage, extra = {}) => ({ slag: 'undervisning', ref: `undervisning:${n}`, ...tomtSalbehov(lage), ...extra });
const villkor = () => ({ salregister: register, salbehov: [{ slag: 'amne', ref: 'Kemi 1', ...tomtSalbehov('sarskild'), utrustning: ['Dragskåp'] }, egen(4, 'ingen', { form: 'utomhus' }), egen(3, 'allman')] });

test('raderna visar gällande salbehov, varifrån det kommer, elevantal och lämpliga salar', () => {
  const rader = saltabellRader(kalla, villkor());
  assert.equal(rader.length, 22);
  // Kemi med 21 elever: Labb 2 (18 platser) faller bort.
  assert.deepEqual([rader[1].kalla, rader[1].behov.lage, rader[1].lampliga], ['amne', 'sarskild', 1]);
  assert.deepEqual([rader[0].behov, rader[0].kalla, rader[0].lampliga], [null, null, null]);
  assert.deepEqual([rader[3].behov.lage, rader[3].lampliga, rader[3].kalla], ['ingen', null, 'eget']);
  assert.equal(rader[5].elever, null); assert.equal(rader[5].kapacitetOkand, true);
  // Kemi med 24 elever: Labb 2 (18 platser) faller bort, Labb 1 är kvar.
  assert.deepEqual([rader[9].elever, rader[9].lampliga], [24, 1]);
  assert.deepEqual(saltabellVarden(rader), { obesvarat: 14, allman: 1, sarskild: 6, ingen: 1 });
  assert.equal(saltabellFiltrera(rader, { sok: 'kemi', lage: 'alla' }).length, 6); assert.equal(saltabellFiltrera(rader, { sok: '', lage: 'obesvarat' }).length, 14);
  assert.equal(saltabellFiltrera(rader, { sok: 'na27a', lage: 'sarskild' }).length, 1);
});
test('20 undervisningar får samma salbehov i en ändring och två omarkerade undantag bevaras', () => {
  const v = villkor(), rader = saltabellRader(kalla, v), undantag = ['undervisning:4', 'undervisning:2'];
  const valda = rader.filter(r => !undantag.includes(r.ref));
  assert.equal(valda.length, 20);
  const visning = forhandsgranskaSalandring(valda, { typ: 'satt', behov: tomtSalbehov('allman') });
  assert.equal(visning.andras.length, 19); assert.deepEqual(visning.oforandrade, ['undervisning:3']); assert.deepEqual(visning.hoppasOver, []);
  assert.equal(visning.andras.filter(a => a.arvBryts).length, 5, 'ärvda kemikrav ersätts av eget undantag och redovisas');
  const efter = tillampaSalandring(v, visning), nya = saltabellRader(kalla, efter);
  assert.deepEqual(checkSalregister(register, efter.salbehov, register.salar.map(s => s.name)), []);
  assert.equal(nya.filter(r => r.behov?.lage === 'allman').length, 20);
  assert.deepEqual([nya[3].behov.lage, nya[3].behov.form], ['ingen', 'utomhus']); assert.deepEqual([nya[1].behov.lage, nya[1].kalla], ['sarskild', 'amne']);
  assert.ok(efter.salbehov.some(b => b.slag === 'amne' && b.ref === 'Kemi 1'), 'ämnets grundvärde ändras inte');
  assert.deepEqual(v.salbehov.length, 3, 'ursprungliga villkor är orörda');
});
test('lägg till, ersätt och ta bort salalternativ är olika handlingar och hoppar över rader med annat salbehov', () => {
  const v = villkor(), rader = saltabellRader(kalla, v), valda = rader.slice(0, 4);
  const lagg = forhandsgranskaSalandring(valda, { typ: 'lagg_till', salar: ['sal-2'] });
  assert.deepEqual(lagg.andras.map(a => [a.ref, a.efter.lage, a.efter.salar, a.efter.utrustning]), [['undervisning:1', 'sarskild', ['sal-2'], []], ['undervisning:2', 'sarskild', ['sal-2'], ['Dragskåp']]]);
  assert.deepEqual(lagg.hoppasOver.map(h => h.ref), ['undervisning:3', 'undervisning:4']);
  const v2 = tillampaSalandring(v, lagg), r2 = saltabellRader(kalla, v2).slice(0, 4);
  assert.deepEqual(forhandsgranskaSalandring(r2, { typ: 'lagg_till', salar: ['sal-2'] }).andras, []);
  assert.deepEqual(forhandsgranskaSalandring(r2, { typ: 'ersatt', salar: ['sal-3'] }).andras.map(a => a.efter.salar), [['sal-3'], ['sal-3']]);
  const bort = forhandsgranskaSalandring(r2, { typ: 'ta_bort', salar: ['sal-2'] });
  assert.deepEqual(bort.andras.map(a => [a.ref, a.efter.salar]), [['undervisning:2', []]]);
  assert.match(bort.hoppasOver.find(h => h.ref === 'undervisning:1').skal, /utan krav/u);
  // Rensa tar bort det egna undantaget: ämnets värde gäller igen, och rader utan eget undantag ändras inte.
  const rensa = forhandsgranskaSalandring(r2, { typ: 'rensa' });
  assert.deepEqual(rensa.andras.map(a => a.ref), ['undervisning:1', 'undervisning:2', 'undervisning:3', 'undervisning:4']);
  const r3 = saltabellRader(kalla, tillampaSalandring(v2, rensa));
  assert.deepEqual([r3[0].behov, r3[1].kalla, r3[1].behov.salar], [null, 'amne', []]);
});
