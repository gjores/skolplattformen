#!/usr/bin/env node
// Provinstallation av skolans salregister (05.2-SM-UXF-23) i en egen PostgreSQL från repots migrationer. Syntetiska uppgifter,
// inga målparametrar eller målanslutningar. Journalen har samma form som målets: alla migrationer utom paketet och de två kända ojournalförda.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEphemeralMigratedDb, migrationFiles } from './ephemeral-migrated-db.mjs';
import { createTjanstYearFixture, seedYearHistory } from './tjanst-year-fixtures.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { KNOWN_UNJOURNALLED, preservedRows, readMigrationJournal, runElectiveTransactions, sha } from './apply-elective-blocks.mjs';
import { SCHOOL_ROOMS_AUDIT_ACTION, SCHOOL_ROOMS_MIGRATIONS, captureSchoolRoomsBaseline, installSchoolRoomsPackage, schoolRoomsSources, schoolRoomsSqlMetadata } from './school-rooms-install-core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SCHOOL_ROOMS_INSTALLER_FILES = ['work/pilot/school-rooms-install-core.mjs', 'work/pilot/verify-school-rooms-install-owned.mjs', 'work/pilot/schema-uat-install-core.mjs',
  'work/pilot/apply-elective-blocks.mjs', 'work/pilot/named-timplan-snapshot.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql',
  'work/pilot/tjanst-fixtures.mjs', 'work/pilot/tjanst-year-fixtures.mjs'];
export const schoolRoomsInstallerSources = () => Object.fromEntries(SCHOOL_ROOMS_INSTALLER_FILES.map(file => [file, sha(readFileSync(resolve(root, file)))]));

export async function verifySchoolRoomsInstallOwned(out) {
  assert.ok(/^\/(?:private\/)?tmp\/[^\n]+\.json$/u.test(out), 'new private temporary report required');
  const report = { kind: 'school-rooms-install-owned', status: 'FAIL', targetContact: false, startedAt: new Date().toISOString(), checks: [],
    limits: ['Own migrations-built PostgreSQL only', 'No installed target or application rollback claim', 'No real pupil or provider data'] };
  const pass = name => report.checks.push({ name, ok: true });
  let own;
  try {
    own = await createEphemeralMigratedDb({ exclude: [...SCHOOL_ROOMS_MIGRATIONS] });
    const db = own.db, sources = schoolRoomsSources(); report.provenance = own.provenance; report.sql = schoolRoomsSqlMetadata(sources); report.installerSources = schoolRoomsInstallerSources();
    await db`create schema supabase_migrations`; await db`create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
    const unjournalled = new Set([...SCHOOL_ROOMS_MIGRATIONS, ...KNOWN_UNJOURNALLED.map(file => file.split('/').at(-1))]);
    await db.begin(async tx => {
      for (const file of migrationFiles().filter(f => !unjournalled.has(f)))
        await tx`insert into supabase_migrations.schema_migrations values(${file.slice(0, 14)},${file.slice(15, -4)},${[readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')]})`;
    });
    let frozen;
    await db.begin(async tx => { const fixture = await createTjanstYearFixture(tx), history = await seedYearHistory(tx, fixture);
      frozen = (await tx`select to_jsonb(x) body from public.tjanst_versions x where id=${history.versionId}`)[0].body; });
    const baseline = await captureSchoolRoomsBaseline(db);
    assert.ok(baseline.rows['public.pupils'].count > 0 && baseline.rows['public.tjanst_versions'].count > 0);
    pass('nonempty synthetic business baseline with the installed schema package and the target journal shape (known education gaps excluded)');
    let installedFingerprint = null, auditId = null;
    const revalidate = async () => { assert.deepEqual(schoolRoomsSqlMetadata(schoolRoomsSources()), report.sql, 'SQL changed during installation');
      assert.deepEqual(schoolRoomsInstallerSources(), report.installerSources, 'installer changed during rehearsal'); };
    const context = { baseline, sources, revalidate, audit: { runId: randomUUID(), revision: 'a'.repeat(40), candidateSha256: 'b'.repeat(64) } };
    const recorded = async connection => (await connection`select count(*)::int n from supabase_migrations.schema_migrations
      where version=any(${SCHOOL_ROOMS_MIGRATIONS.map(file => file.slice(0, 14))}::text[])`)[0].n;
    const preserve = connection => preservedRows(connection, baseline.columns, auditId);
    const migrate = async (tx, phase) => {
      const result = await installSchoolRoomsPackage(tx, { ...context, expectedFingerprint: installedFingerprint }, phase);
      installedFingerprint = result.fingerprint; auditId = result.auditId; return result;
    };
    report.rehearsal = { checks: [] };
    await runElectiveTransactions({ db, mode: 'rehearsal', report: report.rehearsal, fingerprint: schemaFingerprint, recorded, preserve, migrate });
    assert.equal(await schemaFingerprint(db), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal);
    assert.deepEqual(await preserve(db), baseline.rows);
    pass('two migrations rehearse atomically; rollback restores exact schema, ACL, original journal and all original rows');
    let calls = 0, failure;
    try { await db.begin(tx => installSchoolRoomsPackage(tx, { ...context, expectedFingerprint: installedFingerprint,
      revalidate: async () => { await revalidate(); if (++calls === 2) throw new Error('synthetic_late_source_fault'); } }, 'apply')); } catch (error) { failure = error; }
    assert.equal(failure?.message, 'synthetic_late_source_fault');
    assert.equal(await schemaFingerprint(db), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal);
    assert.deepEqual(await preserve(db), baseline.rows);
    pass('failure after all DDL, grants and journal rows rolls back the entire package without original changes');
    await db.unsafe(`create function public.synthetic_rooms_install_audit_fail() returns trigger language plpgsql as $$begin
      if new.action='${SCHOOL_ROOMS_AUDIT_ACTION}' then raise exception 'synthetic audit unavailable';end if;return new;end$$;
      create trigger synthetic_rooms_install_audit_fail before insert on public.security_events for each row execute function public.synthetic_rooms_install_audit_fail()`);
    const faultBaseline = await captureSchoolRoomsBaseline(db); failure = null;
    try { await db.begin(tx => installSchoolRoomsPackage(tx, { ...context, baseline: faultBaseline }, 'apply')); } catch (error) { failure = error; }
    assert.equal(failure?.code, 'P0001'); assert.equal(await schemaFingerprint(db), faultBaseline.fingerprint);
    assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal); assert.deepEqual(await preserve(db), baseline.rows);
    await db.unsafe('drop trigger synthetic_rooms_install_audit_fail on public.security_events;drop function public.synthetic_rooms_install_audit_fail()');
    assert.equal(await schemaFingerprint(db), baseline.fingerprint);
    pass('mandatory installation audit failure atomically removes new objects and journal rows');
    report.apply = { checks: [] };
    await runElectiveTransactions({ db, mode: 'apply', report: report.apply, fingerprint: schemaFingerprint, recorded, preserve, migrate });
    assert.equal(await recorded(db), 2); assert.equal(await schemaFingerprint(db), installedFingerprint);
    assert.deepEqual(await preserve(db), baseline.rows); assert.ok(auditId);
    const journal = await readMigrationJournal(db); assert.deepEqual(journal.slice(0, -2), baseline.originalJournal);
    assert.equal((await db`select count(*)::int n from public.security_events where action=${SCHOOL_ROOMS_AUDIT_ACTION}`)[0].n, 1);
    assert.equal((await db`select count(*)::int n from public.tjanst_versions x where to_jsonb(x)=${db.json(frozen)}`)[0].n, 1);
    pass('apply repeats rehearsal then commits exactly two bound SQL journal rows and one audit; old business/auth rows and publication unchanged');
    let failureAgain = null;
    try { await captureSchoolRoomsBaseline(db); } catch (error) { failureAgain = error; }
    assert.match(String(failureAgain?.message), /already\/partially installed/u);
    pass('a second installation is refused before any change');
    const [tables] = await db`select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r'
      and relname=any(${['school_room_registers', 'school_room_register_revisions']}::text[]) and relrowsecurity and relforcerowsecurity`;
    let entries = 0;
    for (const entry of ['school_rooms_read(jsonb)', 'school_rooms_save(jsonb)']) if ((await db`select has_function_privilege('skolplattform_worker',${entry},'EXECUTE') allowed`)[0].allowed) entries++;
    assert.equal(tables.n, 2); assert.equal(entries, 2);
    pass('post-commit two narrow Worker entries; two forced-RLS tables remain empty and closed to direct access');
    report.baseline = { fingerprint: baseline.fingerprint, journal: baseline.priorJournal, originalRowsSha256: sha(baseline.rows), tables: Object.keys(baseline.rows).length };
    report.installed = { fingerprint: installedFingerprint, journal: { count: journal.length, sha256: sha(journal) }, oldObjectsUnchanged: true, addedAuditRows: 1 };
    await revalidate(); report.status = 'PASS';
  } catch (error) {
    report.failure = { name: error.name, code: error.code ?? null, messageSha256: sha(String(error.message ?? '')) }; throw error;
  } finally {
    if (own) { await own.end(); report.databaseClosed = true; report.cleanup = 'complete'; }
    report.finishedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.equal(process.argv.length, 3); const report = await verifySchoolRoomsInstallOwned(process.argv[2]);
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, targetContact: false, journalBefore: report.baseline.journal.count, journalAfter: report.installed.journal.count })); }
  catch (error) { console.error('FAIL: own school rooms install rehearsal; inspect private report', error?.message?.slice(0, 200)); process.exitCode = 1; }
}
