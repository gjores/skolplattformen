// Bygger en egen tillfällig databas. Ingen installerad provmiljö används.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';

const year = 2027;
const sourceId = 'engelska1-c-ht';
const source = {
  id: sourceId,
  namn: 'Syntetiskt prov · Delprov C',
  nivaer: [{ amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' }],
  tid: { typ: 'fast', datum: '2027-11-30' },
};
const checked = '2026-11-19';
const imported = async (tx, entries, schoolYear = year) =>
  (await tx`select * from public.nationella_prov_katalog_import(${schoolYear}::integer, ${tx.json(entries)}::jsonb, ${checked}::date)`)[0];
const rejected = (tx, run, code) => assert.rejects(tx.savepoint(run), error => error.code === code);
const scope = (unitId, schoolYear = year) => ({ contractVersion: 'nationella_prov_v1', unitId, schoolYear });
const readPlan = async (tx, target) =>
  (await tx`select public.nationella_prov_read(${tx.json(target)}) value`)[0].value.result.register;
const savePlan = async (tx, target, booking, expectedRevision = 0) =>
  (await tx`select public.nationella_prov_save(${tx.json({
    ...target, commandId: randomUUID(), expectedRevision, document: { granskad: false, bokningar: [booking] },
  })}) value`)[0].value.result.register;

const env = await createEphemeralMigratedDb();
try {
  const { db } = env;
  const fixture = await db.begin(createTjanstFixture);
  const concurrent = env.connect();
  const first = await Promise.all([imported(db, [source]), imported(concurrent, [source])]);
  assert.deepEqual(first.map(result => result.revision), [1, 1]);
  assert.equal(first.filter(result => result.changed).length, 1);
  assert.deepEqual(await imported(db, [source]), { revision: 1, changed: false });

  await db.begin(async tx => {
    for (const bad of [[], [{ ...source, id: null }], [source, source]]) {
      await rejected(tx, sub => imported(sub, bad), '22023');
    }
    await rejected(tx, sub => sub`update public.nationella_prov_kataloger set checked_date = current_date where school_year = ${year}`, '55000');
    await rejected(tx, sub => sub`delete from public.nationella_prov_kataloger where school_year = ${year}`, '55000');
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      const [rights] = await tx`
        select has_table_privilege(${role}, 'public.nationella_prov_kataloger', 'SELECT') allowed,
          has_table_privilege(${role}, 'public.nationella_prov_kataloger', 'INSERT,UPDATE,DELETE,TRUNCATE') write_allowed,
          has_function_privilege(${role}, 'public.nationella_prov_katalog_import(integer,jsonb,date)', 'EXECUTE') import_allowed
      `;
      assert.deepEqual(rights, { allowed: role === 'skolplattform_worker', write_allowed: false, import_allowed: false });
    }
  });

  const target = scope(fixture.schools.A);
  const booking = {
    id: randomUUID(), namn: source.namn, undervisning: 'undervisning:engelska', mal: { slag: 'klass', ref: randomUUID() },
    datum: source.tid.datum, startMin: 540, slutMin: 600, tidsval: 'fast', salId: null, vakter: [],
    kontrolleradDatum: checked, kallprov: { id: sourceId, revision: 1 },
  };
  const saved = await db.begin(async tx => {
    await fixture.actor(tx, 'principalA');
    await tx`set local role skolplattform_worker`;
    const [catalog] = await tx`select revision, document from public.nationella_prov_kataloger where school_year = ${year}`;
    assert.deepEqual(catalog, { revision: 1, document: [source] });
    await rejected(tx, sub => imported(sub, [source]), '42501');
    await rejected(tx, sub => savePlan(sub, scope(fixture.schools.B), booking), '42501');
    for (const bad of [
      null, { id: sourceId, revision: '1' }, { id: sourceId, revision: 2 }, { id: 'samma-prov-annat-id', revision: 1 },
    ]) {
      await rejected(tx, sub => savePlan(sub, target, { ...booking, kallprov: bad }), '22023');
    }
    await rejected(tx, sub => savePlan(sub, scope(fixture.schools.A, year + 1), { ...booking, datum: '2028-11-30' }), '22023');
    const value = await savePlan(tx, target, booking);
    assert.deepEqual(value.document.bokningar[0], booking);
    return value;
  });
  await db.begin(async tx => {
    await fixture.actor(tx, 'principalB');
    await tx`set local role skolplattform_worker`;
    const targetB = scope(fixture.schools.B);
    assert.equal(await readPlan(tx, targetB), null);
    await rejected(tx, sub => readPlan(sub, target), '42501');
    const groupBooking = { ...booking, id: randomUUID(), mal: { slag: 'grupp', ref: randomUUID() } };
    const value = await savePlan(tx, targetB, groupBooking);
    assert.deepEqual(value.document.bokningar, [groupBooking]);
  });

  const revised = { ...source, tid: { typ: 'fast', datum: '2027-12-02' } };
  assert.deepEqual(await imported(db, [revised]), { revision: 2, changed: true });
  assert.deepEqual(await imported(db, [revised]), { revision: 2, changed: false });
  assert.deepEqual(await imported(db, [{ ...source, tid: { typ: 'fast', datum: '2028-11-30' } }], year + 1), { revision: 1, changed: true });
  await db.begin(async tx => {
    await fixture.actor(tx, 'principalA');
    await tx`set local role skolplattform_worker`;
    const list = await tx`select revision, document from public.nationella_prov_kataloger where school_year = ${year} order by revision`;
    assert.deepEqual([...list], [{ revision: 1, document: [source] }, { revision: 2, document: [revised] }]);
    assert.deepEqual(await readPlan(tx, target), saved);
    const draftId = randomUUID(), vakt = randomUUID();
    const assigned = { ...booking, salId: 'sal-1', vakter: [vakt], motorval: { sal: draftId, vakter: [{ ref: vakt, draftId }] } };
    assert.deepEqual((await savePlan(tx, target, assigned, 1)).document.bokningar, [assigned]);
    const edited = { ...assigned, salId: 'sal-2', motorval: { vakter: assigned.motorval.vakter } };
    const receipt = await savePlan(tx, target, edited, 2);
    assert.equal(receipt.revision, 3);
    assert.deepEqual(receipt.document.bokningar, [edited]);
    assert.deepEqual(await readPlan(tx, target), receipt);
  });
  console.log(JSON.stringify({ status: 'PASS', sourceRevisions: 2, concurrentImportDeduplicated: true,
    priorMappingPreserved: true, distinctSchoolYear: true, workerReadOnly: true, independentlyMappedSchools: 2, schoolScopeEnforced: true,
    manualRoomChangeWithMotorGuard: true }));
} finally {
  await env.end();
}
