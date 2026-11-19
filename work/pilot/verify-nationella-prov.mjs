// Isolerat SQL-prov med syntetiska identiteter. Startar en egen tillfällig PostgreSQL från repots migrationer.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import { parseNationellaProvRegister, parseNationellaProvSave, NationellaProvError } from '../../web/lib/nationella-prov.ts';

const read = async (tx, input) => (await tx`select public.nationella_prov_read(${tx.json(input)}) value`)[0].value.result.register;
const save = async (tx, input) => (await tx`select public.nationella_prov_save(${tx.json(input)}) value`)[0].value.result;
const scope = (unitId, schoolYear = 2027) => ({ contractVersion: 'nationella_prov_v1', unitId, schoolYear });
const command = (target, expectedRevision, document, commandId = randomUUID()) => ({ ...target, expectedRevision, document, commandId });
const document = (...bokningar) => ({ granskad: false, bokningar });
const auditN = async (tx, action) => (await tx`select count(*)::int n from public.security_events where action=${action}`)[0].n;
const denied = async (tx, call, code, hint) => assert.rejects(tx.savepoint(call), error =>
  error.code === code && (!hint || error.hint === hint));

const environment = await createEphemeralMigratedDb();
try {
  const { db } = environment;
  const fixture = await db.begin(createTjanstFixture);
  const target = scope(fixture.schools.A);
  const booking = { id: randomUUID(), namn: 'Engelska, delprov B', undervisning: 'undervisning:syntetisk-niva',
    mal: { slag: 'klass', ref: randomUUID() }, datum: '2027-11-30', startMin: 540, slutMin: 600,
    tidsval: 'fast', salId: 'sal-1', vakter: [randomUUID()], kontrolleradDatum: '2026-11-19' };
  const initial = command(target, 0, document(booking));

  await db.begin(async tx => {
    const [table] = await tx`select relrowsecurity, relforcerowsecurity from pg_class where oid='public.nationella_prov_revisions'::regclass`;
    assert.equal(table.relrowsecurity && table.relforcerowsecurity, true);
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      const [rights] = await tx`select has_table_privilege(${role}, 'public.nationella_prov_revisions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed`;
      assert.equal(rights.allowed, false);
      for (const fn of ['nationella_prov_read(jsonb)', 'nationella_prov_save(jsonb)', 'nationella_prov_valid(jsonb,integer)']) {
        const [rights] = await tx`select has_function_privilege(${role}, ${'public.' + fn}, 'EXECUTE') as allowed`;
        assert.equal(rights.allowed, role === 'skolplattform_worker' && !fn.startsWith('nationella_prov_valid'));
      }
    }
    assert.equal(await auditN(tx, 'nationella_prov_read'), 0);
    await fixture.actor(tx, 'principalA');
    await tx`set local role skolplattform_worker`;
    assert.equal(await read(tx, target), null);
    await denied(tx, t => read(t, scope(fixture.schools.B)), '42501');
    await denied(tx, t => read(t, scope(fixture.schools.foreign)), '42501');
    await denied(tx, t => save(t, command(scope(fixture.schools.B), 0, document())), '42501');
    await denied(tx, t => read(t, ['unexpected']), '22023', 'nationella_prov_invalid');

    const first = await save(tx, parseNationellaProvSave(initial));
    assert.equal(first.register.revision, 1);
    assert.equal(first.replayed, false);
    assert.deepEqual(parseNationellaProvRegister(first.register, target.schoolYear)?.document, initial.document);
    assert.deepEqual(await read(tx, target), first.register);
    assert.equal(await read(tx, scope(target.unitId, 2028)), null);
    assert.deepEqual(await save(tx, initial), { ...first, replayed: true });
    await denied(tx, t => save(t, { ...initial, document: document() }), '40001', 'nationella_prov_command_conflict');
    await denied(tx, t => save(t, command(target, 0, document())), '40001', 'nationella_prov_conflict');

    const invalidDocuments = [null, { bokningar: [], granskad: 0 }, document({ ...booking, datum: '2028-02-30' }),
      document({ ...booking, datum: '2027-11-27' }), document({ ...booking, datum: '2028-09-11' }),
      document({ ...booking, startMin: 545 }), document({ ...booking, slutMin: 540 }), document({ ...booking, extra: true }),
      document({ ...booking, kontrolleradDatum: '2101-01-01' }),
      document({ ...booking, namn: 'Prov\u009f' }), document({ ...booking, undervisning: booking.undervisning + '\u00a0' }),
      document({ ...booking, vakter: [...booking.vakter, ...booking.vakter] }), document(booking, { ...booking, id: randomUUID() })];
    for (const invalid of invalidDocuments) {
      const req = command(target, 1, invalid);
      assert.throws(() => parseNationellaProvSave(req), NationellaProvError);
      await denied(tx, t => save(t, req), '22023', 'nationella_prov_invalid');
    }

    await tx`reset role`;
    await fixture.actor(tx, 'admin');
    assert.deepEqual(await read(tx, target), first.register);
    await denied(tx, t => save(t, initial), '40001', 'nationella_prov_command_conflict');
    assert.equal((await save(tx, command(target, 1, { ...document(booking), granskad: true }))).register.revision, 2);
    assert.equal((await save(tx, command(scope(target.unitId, 2028), 0, document()))).register.revision, 1);
    assert.equal(await auditN(tx, 'nationella_prov_saved'), 3);

    for (const role of ['teacherGroup', 'hm', 'foreignHm']) {
      await fixture.actor(tx, role);
      await denied(tx, t => read(t, target), '42501');
      await denied(tx, t => save(t, command(target, 2, document())), '42501');
    }
    await fixture.actor(tx, 'principalA');
    assert.deepEqual(await save(tx, initial), { ...first, replayed: true });
    const revisions = await tx`select revision, document from public.nationella_prov_revisions where unit_id=${target.unitId}
      and school_year=${target.schoolYear} order by revision`;
    assert.deepEqual(revisions.map(r => r.revision), [1, 2]);
    assert.deepEqual(revisions[0].document, initial.document);
    await denied(tx, t => t`delete from public.nationella_prov_revisions where unit_id=${target.unitId}`, '55000');
    await denied(tx, t => t`update public.nationella_prov_revisions set revision=20 where unit_id=${target.unitId}`, '55000');
    await denied(tx, async t => {
      await t.unsafe(`create function public.synthetic_exam_audit_fail() returns trigger language plpgsql as $$
        begin if new.action = 'nationella_prov_saved' then raise exception 'test audit unavailable'; end if; return new; end$$;
        create trigger synthetic_exam_audit_fail before insert on public.security_events for each row execute function public.synthetic_exam_audit_fail();`);
      return save(t, command(target, 2, document()));
    }, '55000');
    assert.equal((await read(tx, target)).revision, 2);
    assert.equal(await auditN(tx, 'nationella_prov_saved'), 3);
  });

  const connections = [environment.connect(), environment.connect()];
  const outcomes = await Promise.allSettled(connections.map((db, i) => db.begin(async tx => {
    await fixture.actor(tx, i === 0 ? 'principalA' : 'admin');
    return save(tx, command(target, 2, document(booking)));
  })));
  const saved = outcomes.find(o => o.status === 'fulfilled');
  const conflict = outcomes.find(o => o.status === 'rejected');
  assert.equal(saved?.value.register.revision, 3);
  assert.equal(conflict?.reason.hint, 'nationella_prov_conflict');
  console.log('PASS nationella prov i isolerad PostgreSQL: skolmandat, rättigheter, revisionskedja, samtidighet, oföränderlig historik, replay och revisionens granskningslogg.');
} finally {
  await environment.end();
}
