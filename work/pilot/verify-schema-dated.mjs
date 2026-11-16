#!/usr/bin/env node
// Egen ephemeral PostgreSQL, migrationskedja och syntetiska uppgifter. Ingen målanslutning kan anges.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { parseSchemaDatedBasis } from '../../web/lib/schema-datum-underlag.ts';
const root = fileURLToPath(new URL('../../', import.meta.url)), OWN = '20261116102000_schema_dated_basis.sql';
const report = { kind: 'schema-dated-basis-ephemeral-postgresql', status: 'FAIL', checks: [], startedAt: new Date().toISOString(), limits: ['Synthetic isolated PostgreSQL only', 'No Worker/OIDC/browser claim', 'No target reads or writes'] };
const record = name => report.checks.push({ name, status: 'PASS' });
async function denied(tx, fn, code) {
  let error; try { await tx.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, 'expected denial'); assert.equal(error.code, code);
}
const read = async (tx, scope) => (await tx`select public.schema_dated_basis(${tx.json(scope)}) value`)[0].value;
export async function verifySchemaDated(out) {
  assert.ok(out.startsWith('/private/tmp/') || out.startsWith('/tmp/')); let environment;
  try {
    environment = await createEphemeralMigratedDb({ exclude: [OWN] }); report.database = environment.provenance;
    const db = environment.db, sql = readFileSync(resolve(root, 'supabase/migrations', OWN), 'utf8'), before = await allPublicHashes(db), rollback = Error('expected rollback');
    try { await db.begin(async tx => { await tx.unsafe(sql); throw rollback; }); } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await allPublicHashes(db), before); assert.equal((await db`select to_regprocedure('public.schema_dated_basis(jsonb)') value`)[0].value, null);
    record('migration rollback removes new function and preserves every existing business row');
    await db.begin(tx => tx.unsafe(sql)); assert.deepEqual(await allPublicHashes(db), before); record('additive projection changes no business table');
    assert.equal((await db`select has_function_privilege('skolplattform_worker','public.schema_dated_basis(jsonb)','EXECUTE') yes`)[0].yes, true);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db`select has_function_privilege(${role},'public.schema_dated_basis(jsonb)','EXECUTE') yes`)[0].yes, false);
    record('only Worker obtains EXECUTE on the new entry point');
    const f = await db.begin(createTjanstFixture), scope = { unitId: f.schools.A, schoolYear: 2026 };
    await db.begin(async tx => {
      await f.actor(tx, 'principalA');
      const envelope = await read(tx, scope); let basis = parseSchemaDatedBasis(envelope.result, scope);
      assert.equal(envelope.actor.identityId, f.identity('principalA')); assert.equal(envelope.actor.assignmentId, f.roles.principalA);
      assert.equal(basis.complete, true); assert.equal(basis.placements.length, 3); assert.equal(basis.classMemberships.length, 3);
      assert.ok(!JSON.stringify(basis).includes('Syntetisk elev') && !JSON.stringify(basis).includes('personalNumber'));
      record('current rector reads name-free memberships in an actor-bound envelope');
      await denied(tx, t => read(t, { ...scope, unitId: f.schools.B }), '42501');
      await denied(tx, t => read(t, { ...scope, unitId: f.schools.foreign }), '42501');
      await denied(tx, t => read(t, { ...scope, pupils: [] }), '22023');
      record('other school, other customer and foreign input fields are denied');
      const pupil = f.pupils.inGroup, placement = f.id(70);
      await tx`update public.pupil_class_memberships set ends_on='2026-11-02' where pupil_id=${pupil}`;
      await tx`update public.pupil_placements set ends_on='2026-11-16' where id=${placement}`;
      await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
        values(${f.id(1)},${f.id(2)},${pupil},${f.schools.A},${f.classes.other},${placement},'2026-11-03','2026-11-16')`;
      const parallel = randomUUID(), first = randomUUID(), second = randomUUID();
      for (const [group, name] of [[first, 'Syntetisk datumgrupp A'], [second, 'Syntetisk datumgrupp B']]) {
        await tx`insert into public.study_groups(id,unit_id,organizer_id,school_year,name,starts_on,ends_on,minutes_ht,minutes_vt,parallel_set_id,origin_kind,revision)
          values(${group},${f.schools.A},${f.id(2)},2026,${name},'2026-08-17','2027-06-11',900,900,${parallel},'manual',1)`;
      }
      for (const [group, from, to] of [[first, '2026-08-17', '2026-11-02'], [second, '2026-11-03', '2026-11-16']])
        await tx`insert into public.study_group_memberships(id,group_id,parallel_set_id,unit_id,pupil_id,starts_on,ends_on,source,recorded_by_assignment_id)
          values(${randomUUID()},${group},${parallel},${f.schools.A},${pupil},${from},${to},'manual',${f.roles.principalA})`;
      basis = parseSchemaDatedBasis((await read(tx, scope)).result, scope);
      assert.deepEqual(basis.classMemberships.filter(m => m.pupilId === pupil).map(m => [m.classId, m.startsOn, m.endsOn]),
        [[f.classes.group, '2026-07-01', '2026-11-02'], [f.classes.other, '2026-11-03', '2026-11-16']]);
      assert.ok(basis.classMemberships.filter(m => m.pupilId === pupil).every(m => m.placementId === placement));
      assert.equal(basis.placements.find(p => p.id === placement).endsOn, '2026-11-16');
      const byGroup = (a, b) => a[0].localeCompare(b[0]);
      assert.deepEqual(basis.memberships.filter(m => m.pupilId === pupil).map(m => [m.groupId, m.startsOn, m.endsOn]).sort(byGroup),
        [[first, '2026-08-17', '2026-11-02'], [second, '2026-11-03', '2026-11-16']].sort(byGroup));
      record('class and teaching-group changes preserve inclusive start/end dates and exact school-placement relation');
      await tx`update public.pupils set protected_identity=true where id=${pupil}`;
      basis = parseSchemaDatedBasis((await read(tx, scope)).result, scope); assert.equal(basis.complete, false);
      assert.ok(!basis.placements.some(p => p.pupilId === pupil) && !basis.classMemberships.some(m => m.pupilId === pupil) && !basis.memberships.some(m => m.pupilId === pupil));
      record('missing protected-pupil permission omits all pupil data and explicitly marks projection incomplete');
      await f.actor(tx, 'hm'); await denied(tx, t => read(t, scope), '42501');
      await f.actor(tx, 'teacherGroup'); await denied(tx, t => read(t, scope), '42501');
      record('principal organizer and teacher acquire no new participant access');
      await f.actor(tx, 'principalA');
      const count = (await tx`select count(*)::int n from public.security_events where action='schema_dated_basis_read'`)[0].n;
      await denied(tx, async t => {
        await t.unsafe(`create function public.synthetic_dated_audit_fail() returns trigger language plpgsql as $$begin if new.action='schema_dated_basis_read' then raise exception 'synthetic audit failure';end if;return new;end$$;
          create trigger synthetic_dated_audit_fail before insert on public.security_events for each row execute function public.synthetic_dated_audit_fail();`);
        await read(t, scope);
      }, '55000');
      assert.equal((await tx`select count(*)::int n from public.security_events where action='schema_dated_basis_read'`)[0].n, count);
      record('audit failure returns no participant projection and rolls back its event');
      await tx.unsafe('set local role skolplattform_worker'); await denied(tx, t => t`select id from public.pupil_class_memberships limit 1`, '42501'); await tx.unsafe('reset role');
      record('Worker cannot read the membership tables directly');
      await tx`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.sessionId('principalA')}`; await denied(tx, t => read(t, scope), '42501');
      record('revoked session cannot invoke dated participant projection');
    });
    report.status = 'PASS';
  } catch (error) { report.failure = { code: error.code ?? 'ASSERTION', message: String(error.message).slice(0, 500) }; }
  finally {
    try { await environment?.end(); report.cleanup = 'complete'; } catch { report.cleanup = 'failed'; report.status = 'FAIL'; }
    report.completedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, failure: report.failure, report: out }));
  if (report.status !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 2 && args[0] === '--out'); await verifySchemaDated(args[1]);
}
