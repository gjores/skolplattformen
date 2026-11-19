import test from 'node:test';
import assert from 'node:assert/strict';
import { NationellaProvError, parseNationellaProvKatalog, parseNationellaProvUnderlag, skapaProvId } from './nationella-prov.ts';
import { provDatumTillatet, provDeltagarforslag, provNivaNyckel, provTidTillaten } from './nationella-prov-katalog.ts';
import { nationellaProvDeltagare } from './nationella-prov-deltagare.ts';

const eng1 = { amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' };
const eng2 = { amne: 'ENGE', niva: 'ENGE2000X', namn: 'Engelska nivå 2' };
const eng5 = { amne: 'ENG', niva: 'ENGENG05', namn: 'Engelska 5' };
const uid = n => `5a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const t = (ref, nivaer = [eng1], terminer = { ht: true, vt: true }) => ({ ref: 'undervisning:' + ref, title: 'Samma visningsnamn', nivaer, terminer });
const klass = (id, ...undervisningar) => ({ slag: 'klass', ref: uid(id), name: 'Klass ' + id, undervisningar });
const grupp = (id, klassRefs, ...undervisningar) => ({ slag: 'grupp', ref: uid(id), name: 'Grupp ' + id, klassRefs, undervisningar });
const katalog = deltagare => ({ deltagare, gallerGymnasiet: true, salar: [], vakter: [], skoldagar: null });

test('lokal HTTP kan skapa UUID v4 från kryptografiskt slumpade byte', t => {
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  t.after(() => { delete crypto.randomUUID; });
  const slump = t.mock.method(crypto, 'getRandomValues', bytes => bytes.fill(0xff));
  assert.equal(skapaProvId(), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(slump.mock.callCount(), 1);
});

const prov = (id, tid) => ({ id, namn: 'Exempelprov', nivaer: [eng1], tid });
const fast = prov('engelska1-c-ht', { typ: 'fast', datum: '2026-11-24' });

test('katalogen kräver unik provnyckel och datum inom läsåret', () => {
  const snapshot = { revision: 2, kontrolleradDatum: '2026-11-19', prov: [fast] };
  assert.deepEqual(parseNationellaProvKatalog(snapshot, 2026), snapshot);
  assert.equal(parseNationellaProvKatalog(null, 2027), null);
  assert.throws(() => parseNationellaProvKatalog(snapshot, 2027), NationellaProvError);
  assert.throws(() => parseNationellaProvKatalog({ ...snapshot, prov: [fast, fast] }, 2026), NationellaProvError);
  assert.throws(() => parseNationellaProvKatalog({ ...snapshot, prov: [{ ...fast, id: 'eget-prov' }] }, 2026), NationellaProvError);
});

test('fasta datum och öppna provperioder avgränsas till publicerad start, rätt termin och vardagar', () => {
  const oppet = prov('engelska1-a-ht', { typ: 'period', fran: '2026-11-02' });
  const avgransat = prov('svenska1-a-ht', { typ: 'period', fran: '2026-11-02', till: '2026-11-30', senasteSlutMin: 540 });
  assert.equal(provDatumTillatet(fast, '2026-11-24'), true);
  assert.equal(provDatumTillatet(fast, '2026-11-25'), false);
  for (const dag of ['2026-10-30', '2026-11-07', '2027-01-01', '2026-11-31', '2026-11-2', '']) {
    assert.equal(provDatumTillatet(oppet, dag), false, dag);
  }
  assert.equal(provDatumTillatet(oppet, '2026-11-02'), true);
  assert.equal(provDatumTillatet(avgransat, '2026-11-27'), true);
  assert.equal(provDatumTillatet(oppet, '2027-01-08', '2027-01-09'), true);
  assert.equal(provDatumTillatet(avgransat, '2026-11-30'), true);
  assert.equal(provDatumTillatet(avgransat, '2026-12-01'), false);
  assert.equal(provTidTillaten(avgransat, '2026-11-30', 480, 540), true);
  assert.equal(provTidTillaten(avgransat, '2026-11-30', 525, 545), false);
  const efter = prov('svenska3-b-ht', { typ: 'period', fran: '2026-11-10', tidigasteStartMin: 780 });
  assert.equal(provDatumTillatet(efter, '2026-11-10'), true);
  assert.equal(provTidTillaten(efter, '2026-11-10', 775, 810), false);
  assert.equal(provTidTillaten(efter, '2026-11-10', 780, 810), true);
  assert.equal(provDatumTillatet(efter, '2026-11-11'), true);
});

test('deltagarförslag matchar ämne, nivå och termin via koder med verifierad Gy11-motsvarighet', () => {
  const deltagare = [
    klass(1, t('gy25', [eng1], { ht: true, vt: false })),
    klass(2, t('gy11', [eng5], { ht: true, vt: true })),
    klass(3, t('wrong-level', [eng2])),
    klass(4, t('unknown', [eng1], { vt: true })),
    klass(5, { ref: 'undervisning:old', title: 'Engelska nivå 1' }),
    klass(6, t('wrong-subject', [{ ...eng1, amne: 'ENGD' }])),
  ];
  const ht = provDeltagarforslag([eng1], deltagare, 'ht');
  assert.equal(provNivaNyckel(eng1), provNivaNyckel(eng5));
  assert.deepEqual(ht.map(row => row.deltagare.ref), [uid(1), uid(2), uid(4)]);
  assert.deepEqual(ht.map(row => row.valt), ['undervisning:gy25', 'undervisning:gy11', null]);
  assert.match(ht[2].osaker, /terminen/u);
  const vt = provDeltagarforslag([eng1], deltagare, 'vt');
  assert.deepEqual(vt.map(row => row.deltagare.ref), [uid(2), uid(4)]);
  assert.equal(vt[1].osaker, null);
});

test('alternativrader och gemensamma klass- och gruppkopplingar kräver ett eget val', () => {
  const deltagare = [
    klass(1, t('class')),
    grupp(2, [uid(1)], t('group')),
    klass(3, t('alternative', [eng1, eng2])),
    klass(4, t('one'), t('another')),
    grupp(5, [uid(6)], t('separate')),
  ];
  const rows = provDeltagarforslag([eng1], deltagare, 'ht');
  assert.equal(rows.length, deltagare.length);
  assert.ok(rows.slice(0, 4).every(r => r.valt === null && r.osaker));
  assert.equal(rows[4].valt, 'undervisning:separate');
  assert.equal(rows[3].alternativ.length, 2);
});

test('skolans katalog härleder nivåmetadata från timplanens radnyckel och undervisningsgruppens koder', () => {
  const need = (rowKey, extra = {}) => ({ sourceKind: 'class_timplan', sourceKey: `class_timplan:${uid(1)}:2026:${rowKey}`,
    rowKey, label: 'Oberoende visningsnamn', needHt: 600, needVt: null, needBasis: 'terms', ...extra });
  const plan = {
    classes: [{ classId: uid(1), name: 'Skolklass', link: { schoolform: 'gymnasium' },
      needs: [need('foundation:ENGE:1:ENGE1000X'), need('foundation:ENG:2:ENGENG06', { organizationPending: true }),
        need('alternative:foundation:SVEN:1:SVEN1000X+SVEA:1:SVEA1000X'), need('block:iv1'), need('gammal')] }],
    groups: [{ groupId: uid(2), name: 'Studiegrupp', subjectCode: 'MAT', levelCode: 'MATMAT03c', label: 'Valt namn',
      classIds: [uid(1)], sourceKey: 'study_group:math', needHt: 0, needVt: 200 }],
  };
  const res = parseNationellaProvUnderlag(katalog(nationellaProvDeltagare(plan))).deltagare;
  const studier = res.find(d => d.slag === 'klass').undervisningar;
  const studiegrupp = res.find(d => d.slag === 'grupp');
  assert.equal(studier.length, 3);
  assert.deepEqual(studier[0].nivaer.map(p => p.niva), ['ENGE1000X']);
  assert.deepEqual(studier[0].terminer, { ht: true });
  assert.deepEqual(studier[1].nivaer.map(p => p.niva), ['SVEN1000X', 'SVEA1000X']);
  assert.equal(studier[2].nivaer, undefined);
  assert.deepEqual(studiegrupp.klassRefs, [uid(1)]);
  assert.deepEqual(studiegrupp.undervisningar[0].terminer, { ht: false, vt: true });
  assert.equal(provNivaNyckel(studiegrupp.undervisningar[0].nivaer[0]), 'MATO:MATO1C00X');
});

test('den lästa katalogen behåller stöd för äldre svar och avvisar ogiltig metadata', () => {
  const original = katalog([klass(1, { ref: 'undervisning:old', title: 'Engelska' })]);
  assert.deepEqual(parseNationellaProvUnderlag(original), original);
  for (const undervisning of [{ ...t('invalid'), nivaer: [] }, { ...t('invalid'), nivaer: [eng1, eng1] },
    { ...t('invalid'), nivaer: [{ ...eng1, niva: '' }] }, { ...t('invalid'), terminer: { ht: 'true' } },
    { ...t('invalid'), terminer: { annan: true } }]) {
    assert.throws(() => parseNationellaProvUnderlag(katalog([klass(1, undervisning)])), NationellaProvError);
  }
  assert.throws(() => parseNationellaProvUnderlag(katalog([{ ...klass(1, t('invalid')), klassRefs: [] }])), NationellaProvError);
});

test('jämnt delade årstimmar ger inget förval i en viss termin', () => {
  const rowKey = 'foundation:ENGE:1:ENGE1000X';
  const plan = { classes: [{ classId: uid(1), name: 'Gymnasieklass', link: { schoolform: 'gymnasium' },
    needs: [{ sourceKind: 'class_timplan', sourceKey: `class_timplan:${uid(1)}:2026:${rowKey}`, rowKey,
      label: 'Engelska nivå 1', needHt: 1200, needVt: 1200, needBasis: 'even_split' }] }] };
  const { deltagare } = parseNationellaProvUnderlag(katalog(nationellaProvDeltagare(plan)));
  assert.equal(deltagare[0].undervisningar[0].terminer, undefined);
  for (const term of ['ht', 'vt']) {
    const [rad] = provDeltagarforslag([eng1], deltagare, term);
    assert.equal(rad.valt, null);
    assert.match(rad.osaker, /terminen/u);
  }
});
