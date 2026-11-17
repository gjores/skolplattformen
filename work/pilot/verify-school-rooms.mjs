#!/usr/bin/env node
// Skolans salregister (05.2-SM-UXF-23). Endast en egen ephemeral PostgreSQL från migrationerna och syntetiska fixturer. Ingen målanslutning tas emot.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261118100000_school_rooms.sql', GRANT = 'supabase/migrations/20261118101000_school_rooms_worker_access.sql';
const report = { kind: 'school-rooms-ephemeral-postgresql', status: 'FAIL', checks: [], startedAt: new Date().toISOString(),
  limits: ['Own ephemeral PostgreSQL with synthetic identities only', 'No actual Worker/OIDC/browser claim', 'No active target reads or writes'] };
const record = name => report.checks.push({ name, status: 'PASS' });
const source = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_school_rooms_migration_rollback');
const sal = (n, name, extra = {}) => ({ id: `sal-${n}`, name, typ: 'Allmän sal', platser: 30, utrustning: [], ...extra });
const doc = (nasta, salar) => ({ nasta, salar });
const scope = unitId => ({ contractVersion: 1, unitId });
const save = (unitId, expectedRevision, document, commandId = randomUUID()) => ({ ...scope(unitId), commandId, expectedRevision, document });
async function denied(t, fn, code, hint) {
  let actual;
  try { await t.savepoint(fn); } catch (error) { actual = error; }
  assert.ok(actual, 'expected denial did not occur'); assert.equal(actual.code, code);
  if (hint) assert.equal(actual.hint, hint);
}
const read = async (tx, q) => (await tx`select public.school_rooms_read(${tx.json(q)}) value`)[0].value;
const write = async (tx, q) => (await tx`select public.school_rooms_save(${tx.json(q)}) value`)[0].value;
const events = async (tx, action) => (await tx`select count(*)::int n from public.security_events where action=${action}`)[0].n;

export async function verifySchoolRooms(out) {
  assert.ok(out.startsWith('/private/tmp/') || out.startsWith('/tmp/'), 'report must be a new temporary file');
  let environment;
  try {
    environment = await createEphemeralMigratedDb({ exclude: [OWN.split('/').at(-1), GRANT.split('/').at(-1)] });
    report.database = environment.provenance;
    const db = environment.db, before = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx.unsafe(source(OWN)); throw rollback; }); } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await allPublicHashes(db), before);
    assert.equal((await db`select to_regclass('public.school_room_registers') x`)[0].x, null);
    record('migration rollback preserves all existing rows and removes its objects');
    await db.begin(tx => tx.unsafe(source(OWN)));
    const after = await allPublicHashes(db);
    for (const [name, value] of Object.entries(before)) assert.deepEqual(after[name], value);
    record('additive migration preserves every existing business table');
    for (const table of ['school_room_registers', 'school_room_register_revisions']) {
      const rls = (await db`select relrowsecurity enabled,relforcerowsecurity forced from pg_class where oid=${'public.' + table}::regclass`)[0];
      assert.ok(rls.enabled && rls.forced);
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') yes`)[0].yes, false);
    }
    record('forced RLS and no direct table privileges for client or Worker roles');
    const fns = ['school_rooms_read(jsonb)', 'school_rooms_save(jsonb)'];
    for (const fn of fns) assert.equal((await db`select has_function_privilege('skolplattform_worker',${fn}::regprocedure,'EXECUTE') yes`)[0].yes, false);
    await db.begin(tx => tx.unsafe(source(GRANT)));
    for (const fn of fns) {
      assert.equal((await db`select has_function_privilege('skolplattform_worker',${fn}::regprocedure,'EXECUTE') yes`)[0].yes, true);
      for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db`select has_function_privilege(${role},${fn}::regprocedure,'EXECUTE') yes`)[0].yes, false);
    }
    for (const fn of ['school_rooms_actor(uuid)', 'school_rooms_valid(jsonb)', 'school_rooms_audit(text,uuid,jsonb)'])
      assert.equal((await db`select has_function_privilege('skolplattform_worker',${fn}::regprocedure,'EXECUTE') yes`)[0].yes, false);
    record('separate grant opens only the two intended RPCs to Worker, not browser roles or helpers');
    const f = await db.begin(createTjanstFixture);
    await db.begin(async tx => {
      await f.actor(tx, 'principalA');
      const readsBefore = await events(tx, 'school_rooms_read');
      assert.equal((await read(tx, scope(f.schools.A))).result.register, null);
      assert.equal(await events(tx, 'school_rooms_read'), readsBefore + 1);
      record('rector sees explicit empty register for own school, and the read is audited');
      await denied(tx, t => read(t, scope(f.schools.B)), '42501');
      await denied(tx, t => read(t, scope(f.schools.foreign)), '42501');
      await denied(tx, t => write(t, save(f.schools.B, 0, doc(2, [sal(1, 'B101')]))), '42501');
      record('other school and other customer are denied before content');
      const first = save(f.schools.A, 0, doc(3, [sal(1, 'A101'), sal(2, 'Labb 1', { typ: 'Laborationssal', platser: null, utrustning: ['Dragskåp'] })]));
      const saved = await write(tx, first), r = saved.result.register;
      assert.equal(r.revision, 1); assert.equal(saved.result.replayed, false); assert.deepEqual(r.document, first.document);
      assert.match(r.contentHash, /^sha256:[0-9a-f]{64}$/u);
      assert.deepEqual((await read(tx, scope(f.schools.A))).result.register.document, first.document);
      assert.equal(await events(tx, 'school_rooms_saved'), 1);
      record('first save and reopen preserve exact document, content hash and audit');
      const again = await write(tx, first);
      assert.equal(again.result.replayed, true); assert.equal(again.result.register.revision, 1);
      assert.equal((await tx`select count(*)::int n from public.school_room_register_revisions where unit_id=${f.schools.A}`)[0].n, 1);
      record('same command replays exact receipt without a second revision');
      await denied(tx, t => write(t, { ...first, document: doc(3, [sal(1, 'A101')]) }), '40001', 'school_rooms_command_conflict');
      await denied(tx, t => write(t, save(f.schools.A, 0, doc(2, [sal(1, 'A101')]))), '40001', 'school_rooms_conflict');
      record('changed replay payload and stale revision cannot replace the register');
      const second = await write(tx, save(f.schools.A, 1, doc(4, [sal(1, 'A101 stor'), sal(3, 'A103')])));
      assert.equal(second.result.register.revision, 2);
      assert.equal((await tx`select count(*)::int n from public.school_room_register_revisions where unit_id=${f.schools.A}`)[0].n, 2);
      record('optimistic revision appends a new revision and keeps the earlier one');
      for (const bad of [doc(3, []), doc(4, [sal(4, 'För högt nummer')]), doc(4, [sal(1, 'Lika'), sal(2, 'lika')]), doc(4, [sal(1, 'A'), sal(1, 'B')]),
        doc(4, [sal(1, ' blank')]), doc(4, [sal(1, 'A', { platser: 0 })]), doc(4, [sal(1, 'A', { utrustning: ['x', 'X'] })]), doc(4, [{ ...sal(1, 'A'), extra: 1 }]),
        { nasta: 4, salar: [], arv: [] }, doc(4, Array.from({ length: 101 }, (_, i) => sal(i + 1, `S${i}`)))])
        await denied(tx, t => write(t, save(f.schools.A, 2, bad)), '22023', 'school_rooms_invalid');
      record('document rules: next number never decreases, ids under nasta, unique ids and names, limits and exact keys');
      await denied(tx, t => t`update public.school_room_register_revisions set document='{}'::jsonb where unit_id=${f.schools.A}`, '55000');
      await denied(tx, t => t`delete from public.school_room_register_revisions where unit_id=${f.schools.A}`, '55000');
      record('saved revisions are immutable');
      await f.actor(tx, 'admin');
      assert.equal((await read(tx, scope(f.schools.A))).result.register.revision, 2);
      const third = await write(tx, save(f.schools.A, 2, doc(5, [sal(1, 'A101 stor'), sal(3, 'A103'), sal(4, 'A104')])));
      assert.equal(third.result.register.revision, 3);
      await f.actor(tx, 'hm');
      assert.equal((await read(tx, scope(f.schools.A))).result.register.revision, 3);
      assert.equal((await write(tx, save(f.schools.A, 3, doc(5, [sal(1, 'A101 stor'), sal(3, 'A103')])))).result.register.revision, 4);
      record('school administrator and organizer with mandate can read and change the register');
      await f.actor(tx, 'teacherGroup'); await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      await f.actor(tx, 'foreignHm'); await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      record('teacher and organizer of another customer are denied');
      await f.actor(tx, 'principalA');
      await denied(tx, async t => {
        await t.unsafe(`create function public.synthetic_rooms_audit_fail() returns trigger language plpgsql as $$begin if new.action='school_rooms_saved' then raise exception 'synthetic audit unavailable';end if;return new;end$$;
          create trigger synthetic_rooms_audit_fail before insert on public.security_events for each row execute function public.synthetic_rooms_audit_fail();`);
        await write(t, save(f.schools.A, 4, doc(5, [sal(1, 'A101 stor')])));
      }, '55000');
      assert.equal((await read(tx, scope(f.schools.A))).result.register.revision, 4);
      record('audit failure rolls back register and revision atomically');
      await tx`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.sessionId('principalA')}`;
      await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      record('revoked session cannot read the register');
    });
    const simultaneous = async requests => Promise.allSettled(requests.map(q => db.begin(async tx => { await f.actor(tx, 'principalB'); return write(tx, q); })));
    const created = await simultaneous([save(f.schools.B, 0, doc(2, [sal(1, 'B101')])), save(f.schools.B, 0, doc(2, [sal(1, 'B102')]))]);
    assert.equal(created.filter(r => r.status === 'fulfilled').length, 1); assert.equal(created.filter(r => r.status === 'rejected' && r.reason.code === '40001').length, 1);
    record('two simultaneous initial writers create exactly one register');
    const writers = await simultaneous([save(f.schools.B, 1, doc(3, [sal(2, 'B2')])), save(f.schools.B, 1, doc(3, [sal(2, 'B3')]))]);
    assert.equal(writers.filter(r => r.status === 'fulfilled').length, 1); assert.equal(writers.filter(r => r.status === 'rejected' && r.reason.code === '40001').length, 1);
    record('simultaneous writers with the same revision append exactly one new revision');
    report.status = 'PASS';
  } catch (error) { report.failure = { code: error.code ?? 'ASSERTION', hint: error.hint ?? null, message: String(error.message).slice(0, 500) }; }
  finally {
    try { await environment?.end(); report.cleanup = 'complete'; } catch (error) { report.cleanup = 'failed'; report.status = 'FAIL'; report.cleanupFailure = String(error.message).slice(0, 300); }
    report.completedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, failure: report.failure, report: out }));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 2 && args[0] === '--out', 'Use --out /private/tmp/<new-name>.json');
  await verifySchoolRooms(args[1]);
}
