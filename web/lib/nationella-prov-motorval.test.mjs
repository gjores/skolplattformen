import assert from 'node:assert/strict';
import test from 'node:test';
import { NationellaProvError, parseNationellaProvDocument, provManuellaVal, provMedMotorhistorik, provMotorTilldelning, provRensaMotorval } from './nationella-prov.ts';

const id = n => `83111900-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lasar = id(1), termin = id(2), manuellVakt = id(11), motorvakt = id(12), annanMotorvakt = id(13);
const prov = { id: id(21), namn: 'Engelska', undervisning: 'undervisning:eng', mal: { slag: 'klass', ref: id(22) },
  datum: '2026-11-25', startMin: 540, slutMin: 600, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: '2026-11-23',
  kallprov: { id: 'engelska-delprov-c', revision: 2 } };
const plan = (...bokningar) => ({ granskad: true, bokningar });
const post = (ref, draftId = termin) => ({ ref, draftId });

test('provkontraktet läser äldre bokningar och håller isär katalogkälla och motorns val', () => {
  const b = { ...prov, salId: 'sal-2', vakter: [manuellVakt, motorvakt], motorval: { sal: lasar, vakter: [post(motorvakt)] } };
  assert.deepEqual(parseNationellaProvDocument(plan(prov), 2026), plan(prov));
  assert.deepEqual(parseNationellaProvDocument(plan(b), 2026), plan(b));
  for (const motorval of [null, {}, { sal: 'manuell' }, { sal: lasar, vakter: [] }, { vakter: [post(annanMotorvakt)] },
    { vakter: [post(motorvakt), post(motorvakt, lasar)] }, { vakter: [{ ref: motorvakt }] }, { tid: lasar }]) {
    assert.throws(() => parseNationellaProvDocument(plan({ ...b, motorval }), 2026), NationellaProvError);
  }
  assert.throws(() => parseNationellaProvDocument(plan({ ...prov, motorval: { sal: lasar } }), 2026), NationellaProvError);
});

test('motorn märker bara resurser den tillför och skriver inga val över skolans befintliga val', () => {
  const manuell = { ...prov, salId: 'sal-1' };
  const b = provMotorTilldelning(manuell, 'sal-2', [motorvakt], termin);
  assert.deepEqual(b, { ...manuell, vakter: [motorvakt], motorval: { vakter: [post(motorvakt)] } });
  assert.equal(provMotorTilldelning(b, 'sal-9', [annanMotorvakt], lasar), b);
  const b2 = provMotorTilldelning(prov, 'sal-3', [motorvakt], lasar);
  assert.deepEqual(b2, { ...prov, salId: 'sal-3', vakter: [motorvakt], motorval: { sal: lasar, vakter: [post(motorvakt, lasar)] } });
});

test('manuella val behåller ursprung per oförändrad resurs och kan inte tilldela motorhistorik till nya val', () => {
  const fore = { ...prov, salId: 'sal-2', vakter: [manuellVakt, motorvakt], motorval: { sal: lasar, vakter: [post(motorvakt)] } };
  const efter = { ...fore, salId: 'sal-4', vakter: [motorvakt, annanMotorvakt], motorval: { sal: termin, vakter: [post(annanMotorvakt)] } };
  assert.deepEqual(provManuellaVal(plan(fore), plan(efter, { ...efter, id: id(24), namn: 'Franska' })),
    plan({ ...efter, motorval: { vakter: [post(motorvakt)] } }, { ...prov, id: id(24), namn: 'Franska', salId: 'sal-4', vakter: [motorvakt, annanMotorvakt] }));
  const byttTid = { ...fore, datum: '2026-11-26' };
  assert.deepEqual(provManuellaVal(plan(fore), plan(byttTid)), plan(byttTid));
  assert.deepEqual(provManuellaVal(plan(fore), plan({ ...fore, vakter: [manuellVakt] })), plan({ ...fore, vakter: [manuellVakt], motorval: { sal: lasar } }));
});

test('tömning rensar bara det valda utkastets resurser och bevarar manuella bokningar och andra utkast', () => {
  const b = { ...prov, salId: 'sal-1', vakter: [manuellVakt, motorvakt, annanMotorvakt], motorval: { sal: lasar, vakter: [post(motorvakt), post(annanMotorvakt, lasar)] } };
  const aldreBokning = { ...prov, id: id(24), namn: 'Franska', salId: 'sal-3', vakter: [motorvakt] };
  const original = plan(b, aldreBokning);
  const tomd = provRensaMotorval(original, termin);
  assert.deepEqual(tomd, plan({ ...b, vakter: [manuellVakt, annanMotorvakt], motorval: { sal: lasar, vakter: [post(annanMotorvakt, lasar)] } }, aldreBokning));
  assert.equal(provRensaMotorval(tomd, termin), tomd);
  assert.deepEqual(provRensaMotorval(tomd, lasar), plan({ ...prov, vakter: [manuellVakt] }, aldreBokning));
  assert.deepEqual(original, plan(b, aldreBokning));
});

test('skyddad historik identifierar bara nya värden från bevisad motorkörning och lämnar senare manuella ändringar', () => {
  const manuellSal = { ...prov, salId: 'sal-9', vakter: [manuellVakt] };
  const tillsattSal = { ...prov, salId: 'sal-1' };
  const tillsattVakt = { ...tillsattSal, vakter: [motorvakt] };
  const senare = { ...tillsattVakt, vakter: [motorvakt, manuellVakt], kontrolleradDatum: '2026-11-24' };
  const reviderat = provMedMotorhistorik([
    { document: plan(manuellSal), draftId: lasar },
    { document: plan(prov), draftId: null },
    { document: plan(tillsattSal), draftId: lasar },
    { document: plan(tillsattVakt), draftId: termin },
    { document: plan(senare), draftId: null },
  ]);
  assert.deepEqual(reviderat, plan({ ...senare, motorval: { sal: lasar, vakter: [post(motorvakt)] } }));
  assert.deepEqual(provRensaMotorval(reviderat, lasar), plan({ ...senare, salId: null, motorval: { vakter: [post(motorvakt)] } }));
  const aldre = plan(manuellSal);
  assert.equal(provMedMotorhistorik([{ document: aldre, draftId: lasar }]), aldre);
  assert.equal(provMedMotorhistorik([]), null);
});

test('omärkt äldre ursprung följer inte med bytt datum, tid, undervisning eller deltagare', () => {
  const automatisk = { ...prov, salId: 'sal-2', vakter: [motorvakt] };
  const historik = [{ document: plan(prov), draftId: null }, { document: plan(automatisk), draftId: lasar }];
  for (const andring of [{ datum: '2026-11-26' }, { startMin: 550 }, { slutMin: 605 }, { undervisning: 'undervisning:fra' }, { mal: { slag: 'grupp', ref: id(23) } }]) {
    const byte = plan({ ...automatisk, ...andring });
    assert.equal(provMedMotorhistorik([...historik, { document: byte, draftId: null }]), byte);
  }
  const ombokat = plan({ ...automatisk, datum: '2026-11-26', motorval: { sal: termin, vakter: [post(motorvakt)] } });
  assert.equal(provMedMotorhistorik([...historik, { document: ombokat, draftId: null }]), ombokat);
});
