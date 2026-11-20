#!/usr/bin/env node
// Endast en egen ephemeral PostgreSQL från migrationerna och syntetiska fixturer. Ingen målanslutning tas emot.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { defaultSchemaVillkor } from '../../web/lib/schema-contract.ts';
import { schemaDraftHash } from '../../web/lib/schema-draft-contract.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261116100000_schema_drafts.sql', GRANT = 'supabase/migrations/20261116101000_schema_drafts_worker_access.sql';
const report = { kind: 'schema-drafts-ephemeral-postgresql', status: 'FAIL', checks: [], startedAt: new Date().toISOString(),
  limits: ['Own ephemeral PostgreSQL with synthetic identities only', 'No actual Worker/OIDC/browser claim', 'No active target reads or writes'] };
const record = name => report.checks.push({ name, status: 'PASS' });
const source = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_schema_migration_rollback');
const scope = unitId => ({ contractVersion: 1, unitId, schoolYear: 2027, period: 'lasar' });
const hash = `sha256:${'a'.repeat(64)}`;
const doc = () => ({ documentVersion: 1, base: null, basisVillkor: null, workingVillkor: defaultSchemaVillkor(), placements: [], locks: [], intentional: [],
  datedOverrides: [], activityTypes: [], control: null, requiresRecalculation: true, source: { planId: null, planRevision: 0, calendarVersionId: null, calendarVersion: null, lessonSources: [], digest: hash } });
const input = unitId => ({ ...scope(unitId), commandId: randomUUID(), draftId: null, expectedRevision: 0, name: 'Syntetiskt schemautkast', requestHash: hash, document: doc(), sourceHash: hash });
async function denied(t, fn, code, hint) {
  let actual;
  try { await t.savepoint(fn); } catch (error) { actual = error; }
  assert.ok(actual, 'expected denial did not occur'); assert.equal(actual.code, code);
  if (hint) assert.equal(actual.hint, hint);
}
const command = async (tx, q) => (await tx`select public.schema_command(${tx.json(q)}) value`)[0].value;
const read = async (tx, q) => (await tx`select public.schema_read(${tx.json(q)}) value`)[0].value;
const status = async (tx, q) => (await tx`select public.schema_status(${tx.json(q)}) value`)[0].value;
const reference = q => ({ ...scope(q.unitId), commandId: q.commandId, draftId: q.draftId });

export async function verifySchemaDrafts(out) {
  assert.ok(out.startsWith('/private/tmp/') || out.startsWith('/tmp/'), 'report must be a new temporary file');
  let environment;
  try {
    // Återläsningen tillkom senare och kräver tabellerna som det här provet installerar självt.
    environment = await createEphemeralMigratedDb({ exclude: [OWN.split('/').at(-1), GRANT.split('/').at(-1), '20261120100000_schema_reset_previous.sql'] });
    report.database = environment.provenance;
    const db = environment.db, before = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx.unsafe(source(OWN)); throw rollback; }); } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await allPublicHashes(db), before);
    assert.equal((await db`select to_regclass('public.schema_drafts') x`)[0].x, null);
    record('migration rollback preserves all existing rows and removes its objects');
    await db.begin(tx => tx.unsafe(source(OWN)));
    const after = await allPublicHashes(db);
    for (const [name, value] of Object.entries(before)) assert.deepEqual(after[name], value);
    record('additive migration preserves every existing business table');
    for (const table of ['schema_drafts', 'schema_draft_revisions', 'schema_draft_commands']) {
      const rls = (await db`select relrowsecurity enabled,relforcerowsecurity forced from pg_class where oid=${'public.' + table}::regclass`)[0];
      assert.ok(rls.enabled && rls.forced);
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') yes`)[0].yes, false);
    }
    record('forced RLS and no direct table privileges for client or Worker roles');
    for (const fn of ['schema_read(jsonb)', 'schema_command(jsonb)', 'schema_status(jsonb)']) {
      assert.equal((await db`select has_function_privilege('skolplattform_worker',${fn}::regprocedure,'EXECUTE') yes`)[0].yes, false);
    }
    await db.begin(tx => tx.unsafe(source(GRANT)));
    for (const fn of ['schema_read(jsonb)', 'schema_command(jsonb)', 'schema_status(jsonb)']) {
      assert.equal((await db`select has_function_privilege('skolplattform_worker',${fn}::regprocedure,'EXECUTE') yes`)[0].yes, true);
      for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db`select has_function_privilege(${role},${fn}::regprocedure,'EXECUTE') yes`)[0].yes, false);
    }
    record('separate grant opens only intended RPCs to Worker, not browser roles');
    for (const value of [35.4, 177 / 5, 1e-7, -1e-7, 0.30000000000000004, 1e-100, -0, { veckor: 35.4, minuter: 2400 / 17.6, text: 'Åäö🗓️' }]) {
      const actual = (await db`select public.schema_draft_hash(${db.json(value)}) hash`)[0].hash;
      assert.equal(actual, await schemaDraftHash(value));
    }
    record('JavaScript and PostgreSQL agree on fractional weeks, calculated minutes, exponent notation and Unicode');
    const f = await db.begin(createTjanstFixture);
    await db.begin(async tx => {
      await f.actor(tx, 'principalA');
      assert.equal((await read(tx, scope(f.schools.A))).result.draft, null);
      record('current rector sees explicit empty draft for own school');
      await denied(tx, t => read(t, scope(f.schools.B)), '42501');
      await denied(tx, t => read(t, scope(f.schools.foreign)), '42501');
      record('other school and other customer are denied before content');
      const q = input(f.schools.A), first = await command(tx, q), d = first.result.draft;
      assert.equal(d.revision, 1); assert.equal(d.document.workingVillkor.breakMin, 10);
      const expectedHash = await schemaDraftHash(q.document);
      assert.equal(d.contentHash, expectedHash);
      assert.equal((await read(tx, scope(f.schools.A))).result.draft.id, d.id);
      record('first save and reopen preserve exact server document and canonical content hash');
      const repeated = await command(tx, q);
      assert.equal(repeated.result.receipt.replayed, true); assert.equal(repeated.result.receipt.revision, 1);
      assert.equal((await tx`select count(*)::int n from public.schema_draft_revisions where draft_id=${d.id}`)[0].n, 1);
      record('same command replays exact receipt without a second revision');
      const found = await status(tx, reference(q));
      assert.equal(found.result.state, 'completed'); assert.equal(found.result.receipt.contentHash, d.contentHash);
      assert.equal((await status(tx, { ...reference(q), commandId: randomUUID() })).result.state, 'not_found');
      record('status distinguishes committed command from unknown command');
      await denied(tx, t => command(t, { ...q, document: { ...q.document, requiresRecalculation: false } }), '40001', 'schema_draft_command_conflict');
      await denied(tx, t => command(t, { ...q, commandId: randomUUID() }), '40001', 'schema_draft_conflict');
      record('changed replay payload and concurrent initial save cannot replace existing work');
      const q2 = { ...q, commandId: randomUUID(), draftId: d.id, expectedRevision: 1, document: { ...q.document, workingVillkor: { ...q.document.workingVillkor, breakMin: 15 } } };
      const second = await command(tx, q2);
      assert.equal(second.result.draft.revision, 2); assert.equal(second.result.draft.document.workingVillkor.breakMin, 15);
      assert.equal((await tx`select count(*)::int n from public.schema_draft_revisions where draft_id=${d.id}`)[0].n, 2);
      record('CAS appends new revision and preserves earlier revision');
      await denied(tx, t => command(t, { ...q2, commandId: randomUUID() }), '40001', 'schema_draft_conflict');
      record('stale revision is denied without a write');
      await denied(tx, t => t`update public.schema_draft_revisions set document='{}'::jsonb where draft_id=${d.id}`, '55000');
      await denied(tx, t => t`delete from public.schema_draft_commands where command_id=${q.commandId}`, '55000');
      record('saved revisions and receipts are immutable');
      await f.actor(tx, 'admin');
      assert.equal((await read(tx, scope(f.schools.A))).result.draft.revision, 2);
      await denied(tx, t => status(t, reference(q)), '40001', 'schema_draft_command_conflict');
      record('school administrator can reopen school draft but not reuse another identity command');
      await f.actor(tx, 'hm'); await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      await f.actor(tx, 'teacherGroup'); await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      record('principal organizer role and teacher do not gain draft access');
      await f.actor(tx, 'principalA');
      const beforeRevision = (await read(tx, scope(f.schools.A))).result.draft.revision;
      await denied(tx, async t => {
        await t.unsafe(`create function public.synthetic_schema_audit_fail() returns trigger language plpgsql as $$begin if new.action='schema_draft_saved' then raise exception 'synthetic audit unavailable';end if;return new;end$$;
          create trigger synthetic_schema_audit_fail before insert on public.security_events for each row execute function public.synthetic_schema_audit_fail();`);
        await command(t, { ...q2, commandId: randomUUID(), expectedRevision: 2 });
      }, '55000');
      assert.equal((await read(tx, scope(f.schools.A))).result.draft.revision, beforeRevision);
      record('audit failure rolls back draft, revision and receipt atomically');
      await tx`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.sessionId('principalA')}`;
      await denied(tx, t => read(t, scope(f.schools.A)), '42501');
      record('revoked session cannot read saved draft');
    });
    const simultaneous = async requests => Promise.allSettled(requests.map(q => db.begin(async tx => { await f.actor(tx, 'principalB'); return command(tx, q); })));
    const initial = { ...input(f.schools.B), period: 'ht' }, other = { ...initial, commandId: randomUUID() };
    const created = await simultaneous([initial, other]);
    assert.equal(created.filter(r => r.status === 'fulfilled').length, 1); assert.equal(created.filter(r => r.status === 'rejected' && r.reason.code === '40001').length, 1);
    const winner = created.find(r => r.status === 'fulfilled').value.result.draft;
    record('two simultaneous initial writers create exactly one draft revision');
    const writers = await simultaneous([20, 25].map(breakMin => ({ ...initial, commandId: randomUUID(), draftId: winner.id, expectedRevision: 1,
      document: { ...doc(), workingVillkor: { ...defaultSchemaVillkor(), breakMin } } })));
    assert.equal(writers.filter(r => r.status === 'fulfilled').length, 1); assert.equal(writers.filter(r => r.status === 'rejected' && r.reason.code === '40001').length, 1);
    assert.equal((await db`select count(*)::int n from public.schema_draft_revisions where draft_id=${winner.id}`)[0].n, 2);
    record('simultaneous CAS writers append exactly one new revision without overwriting the winner');
    const repeatedInput = { ...input(f.schools.B), period: 'vt' }, repeated = await simultaneous([repeatedInput, repeatedInput]);
    assert.ok(repeated.every(r => r.status === 'fulfilled')); assert.equal(new Set(repeated.map(r => r.value.result.draft.id)).size, 1);
    assert.deepEqual(repeated.map(r => r.value.result.receipt.replayed).sort(), [false, true]);
    record('simultaneous identical command produces one immutable receipt and an exact replay');
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
  await verifySchemaDrafts(args[1]);
}
