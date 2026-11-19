import assert from 'node:assert/strict';
import test from 'node:test';
import { provDeltagareForPlanering, provRekommendationer, provTidsforslag } from './nationella-prov-forslag.ts';

const engelska = { amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' };
const gymnasieklass = (ref, terminer, niva = engelska) => ({ slag: 'klass', ref, name: ref,
  undervisningar: [{ ref: `undervisning:${ref}`, title: niva.namn, nivaer: [niva], terminer }] });
const fastProv = (id, datum) => ({ id, namn: 'Engelska', nivaer: [engelska], tid: { typ: 'fast', datum },
  tidsplan: { typ: 'gemensam', minuter: 90 } });
const muntligt = (tid = {}) => ({ id: 'engelska1-a-ht', namn: 'Engelska muntligt', nivaer: [engelska],
  tid: { typ: 'period', fran: '2026-11-02', ...tid },
  tidsplan: { typ: 'muntlig', minuterPerTillfalle: 15, deltagarePerTillfalle: 2, forberedelseMin: 10 } });
const underlag = (deltagare, prov, skoldagar = null, terminer) => ({ gallerGymnasiet: true, deltagare, skoldagar, terminer,
  salar: [], vakter: [], provkatalog: { revision: 5, kontrolleradDatum: '2026-10-23', prov } });
const bokning = (id, ref, datum, startMin = 540, slutMin = 630) => ({ kallprov: { id, revision: 3 },
  mal: { slag: 'klass', ref }, datum, startMin, slutMin });

test('rekommenderar matchande undervisning i rätt avslutningstermin och håller isär tidigare bokningar', () => {
  const ht = fastProv('engelska1-c-ht', '2026-11-24');
  const vt = fastProv('engelska1-c-vt', '2027-05-03');
  const t = underlag([
    gymnasieklass('fortsatter', { ht: true, vt: true }), gymnasieklass('avslutar', { ht: true, vt: false }),
    gymnasieklass('okant', undefined), gymnasieklass('fel-amne', { ht: true, vt: true }, { ...engelska, niva: 'ENGE2000X' }),
  ], [ht, vt]);
  const redan = [bokning(ht.id, 'avslutar', ht.tid.datum)];
  assert.deepEqual(provRekommendationer(t, 2026, redan, '2026-11-01'), [
    { prov: ht, deltagare: 1, osakra: 1, saknarTidsforslag: false }, { prov: vt, deltagare: 2, osakra: 1, saknarTidsforslag: false },
  ]);
  assert.deepEqual(provRekommendationer(t, 2026, redan, '2026-11-28').map(r => r.prov.id), [vt.id]);
  const rader = provDeltagareForPlanering(ht, t, 2026, redan);
  assert.deepEqual(rader.map(rad => [rad.deltagare.ref, rad.valt]), [['fortsatter', null], ['okant', null]]);
});

test('flyttade fasta datum och ytterligare muntliga tillfällen kan väljas aktivt', () => {
  const fast = fastProv('engelska1-c-ht', '2026-11-25');
  const period = muntligt();
  const t = underlag([gymnasieklass('a', { ht: true, vt: false })], [fast, period]);
  const redan = [bokning(fast.id, 'a', '2026-11-24'), bokning(period.id, 'a', '2026-11-23')];
  assert.deepEqual(provRekommendationer(t, 2026, redan, '2026-11-01'), [{ prov: fast, deltagare: 1, osakra: 1, saknarTidsforslag: false }]);
  assert.match(provDeltagareForPlanering(fast, t, 2026, redan)[0].osaker, /ersättas/u);
  const [rad] = provDeltagareForPlanering(period, t, 2026, redan);
  assert.equal(rad.valt, null);
  assert.match(rad.osaker, /ytterligare ett tillfälle/u);
});

test('fast provtid föreslår publicerad start och bokningslängd och respekterar skolans dagar', () => {
  const fast = fastProv('engelska1-c-ht', '2026-11-24');
  assert.deepEqual(provTidsforslag(fast, underlag([], [fast], [fast.tid.datum]), 2026, [], '2026-11-25'),
    { datum: '2026-11-24', startMin: 540, slutMin: 630 });
  assert.equal(provTidsforslag(fast, underlag([], [fast], ['2026-11-25']), 2026, [], '2026-11-19'), null);
  assert.equal(provTidsforslag({ ...fast, tidsplan: undefined }, underlag([], [fast]), 2026, [], '2026-11-19'), null);
});

test('periodförslag börjar på en framtida skoldag i provets termin och prövar sparade prov', () => {
  const period = muntligt({ fran: '2026-11-03', tidigasteStartMin: 780 });
  const dagar = ['2027-01-15', '2026-11-07', '2026-11-03', '2026-11-04'];
  const terminer = { ht: { start: '2026-08-13', end: '2026-12-20' }, vt: { start: '2027-01-13', end: '2027-06-09' } };
  const t = underlag([gymnasieklass('a', { ht: true, vt: false })], [period], dagar, terminer);
  const tidigare = [bokning('annat-prov', 'a', '2026-11-03', 780, 855), bokning('annat-prov', 'b', '2026-11-03', 855, 950)];
  assert.deepEqual(provTidsforslag(period, t, 2026, tidigare, '2026-11-01'), { datum: '2026-11-03', startMin: 855, slutMin: 945 });
  assert.deepEqual(provTidsforslag(period, t, 2026, tidigare, '2026-11-03'), { datum: '2026-11-04', startMin: 540, slutMin: 630 });
  assert.equal(provTidsforslag(period, t, 2026, tidigare, '2026-11-05'), null);
  assert.equal(provTidsforslag(period, { ...t, skoldagar: null }, 2026, [], '2026-11-01'), null);
});

test('ett muntligt block som inte ryms före sista delprovets start får inget tidförslag', () => {
  const period = muntligt({ till: '2026-11-30', senasteSlutMin: 540 });
  const t = underlag([gymnasieklass('a', { ht: true, vt: false })], [period], ['2026-11-30']);
  assert.equal(provTidsforslag(period, t, 2026, [], '2026-11-28'), null);
  assert.equal(provRekommendationer(t, 2026, [], '2026-11-28')[0].saknarTidsforslag, true);
  assert.deepEqual(provRekommendationer(t, 2026, [], '2026-12-01'), []);
});

test('muntliga prov kan få ett tidigare block samma dag när senare tider redan är bokade', () => {
  const period = muntligt();
  const fast = fastProv('engelska1-c-ht', '2026-11-25');
  const dag = '2026-11-24';
  const t = underlag([gymnasieklass('a', { ht: true, vt: false })], [fast, period], [dag]);
  const tidigare = [bokning('annat-prov', 'a', dag, 570, 1020)];
  assert.deepEqual(provTidsforslag(period, t, 2026, tidigare, '2026-11-23'), { datum: dag, startMin: 480, slutMin: 570 });
  assert.equal(provRekommendationer(t, 2026, tidigare, '2026-11-23').find(r => r.prov.id === fast.id).saknarTidsforslag, true);
});
