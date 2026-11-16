#!/usr/bin/env node
// Egen PostgreSQL från repots migrationer, syntetiska uppgifter, inga målparametrar eller målanslutningar.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEphemeralMigratedDb, migrationFiles } from './ephemeral-migrated-db.mjs';
import { createTjanstYearFixture, seedYearHistory } from './tjanst-year-fixtures.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { KNOWN_UNJOURNALLED, preservedRows, readMigrationJournal, runElectiveTransactions, sha } from './apply-elective-blocks.mjs';
import { SCHEMA_UAT_MIGRATIONS, schemaUatSources, schemaUatSqlMetadata, captureSchemaUatBaseline, installSchemaUatPackage } from './schema-uat-install-core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const installerSources = () => Object.fromEntries(['work/pilot/schema-uat-install-core.mjs', 'work/pilot/verify-schema-uat-install-owned.mjs',
  'work/pilot/apply-elective-blocks.mjs', 'work/pilot/apply-tjanst.mjs', 'work/pilot/named-timplan-snapshot.mjs', 'work/pilot/ephemeral-migrated-db.mjs',
  'work/pilot/ephemeral-supabase-stubs.sql', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/tjanst-year-fixtures.mjs']
  .map(file => [file, sha(readFileSync(resolve(root, file)))]));

/** Endast metadataformat återanvänds. Inga mål-SQL-texter, auth- eller affärsrader kan bli fixtur. */
export function syntheticJournalFromMetadata(value, files = migrationFiles()) {
  assert.equal(value.kind, 'schema-uat-target-readonly-preflight'); assert.equal(value.readsOnly, true); assert.equal(value.businessRowsRead, false);
  assert.equal(value.database?.transactionReadOnly, true); assert.equal(value.databaseClosed, true);
  const excluded = new Set([...SCHEMA_UAT_MIGRATIONS, ...KNOWN_UNJOURNALLED.map(file => file.split('/').at(-1))]);
  const expected = files.filter(file => !excluded.has(file)), shape = value.journal?.shape;
  assert.ok(Array.isArray(shape)); assert.equal(shape.length, value.journal.count);
  assert.deepEqual(shape.map(row => row.version), expected.map(file => file.slice(0, 14)), 'unexpected metadata versions/gaps');
  assert.equal(sha(shape), value.journal.shapeSha256); assert.deepEqual(value.journal.missingBaseline, KNOWN_UNJOURNALLED.map(file => file.split('/').at(-1)));
  return shape.map(row => {
    assert.match(row.name ?? '', /^[a-z0-9_]+$/u); assert.ok(Number.isSafeInteger(row.statementCount) && row.statementCount >= 0 && row.statementCount <= 1000);
    assert.match(row.statementsSha256 ?? '', /^[a-f0-9]{64}$/u);
    return { version: row.version, name: row.name, statements: Array.from({ length: row.statementCount }, (_, index) =>
      '-- synthetic prior journal metadata only; source array hash ' + row.statementsSha256 + '; part ' + (index + 1)) };
  });
}
export async function verifySchemaUatInstallOwned(out, { baselineReport = null } = {}) {
  assert.ok(/^\/(?:private\/)?tmp\/[^\n]+\.json$/u.test(out), 'new private temporary report required');
  const report = { kind: 'schema-uat-install-owned', status: 'FAIL', targetContact: false, protectedCommitted: false,
    startedAt: new Date().toISOString(), checks: [], limits: ['Own migrations-built PostgreSQL only', 'No installed target or application rollback claim', 'No real pupil or provider data'] };
  const pass = name => report.checks.push({ name, ok: true });
  let own;
  try {
    own = await createEphemeralMigratedDb({ exclude: [...SCHEMA_UAT_MIGRATIONS] });
    const db = own.db, sources = schemaUatSources(); report.provenance = own.provenance; report.sql = schemaUatSqlMetadata(sources); report.installerSources = installerSources();
    await db`create schema supabase_migrations`; await db`create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
    let metadataJournal = null;
    if (baselineReport !== null) {
      assert.match(baselineReport, /^\/private\/tmp\/schema-uat-target-readonly-[a-z0-9-]+\.json$/u);
      const stat = lstatSync(baselineReport); assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.size < 1024 * 1024);
      assert.equal(realpathSync(baselineReport), baselineReport);
      const bytes = readFileSync(baselineReport), metadata = JSON.parse(bytes); metadataJournal = syntheticJournalFromMetadata(metadata);
      report.metadataBaseline = { kind: 'anonymized-actual-journal-shape', sourceReportSha256: sha(bytes), shapeSha256: metadata.journal.shapeSha256,
        sourceJournalSha256: metadata.journal.journalSha256, count: metadataJournal.length, latestVersion: metadataJournal.at(-1)?.version,
        sourceSqlCopied: false, businessRowsCopied: false, expectedUnjournalledEducation: metadata.journal.missingBaseline,
        statementCounts: [...new Set(metadata.journal.shape.map(row => row.statementCount))].sort((a, b) => a - b) };
    }
    await db.begin(async tx => {
      const rows = metadataJournal ?? migrationFiles().filter(file => !SCHEMA_UAT_MIGRATIONS.includes(file)).map(file =>
        ({ version: file.slice(0, 14), name: file.slice(15, -4), statements: [readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')] }));
      for (const row of rows) {
        await tx`insert into supabase_migrations.schema_migrations values(${row.version},${row.name},${row.statements})`;
      }
    });
    let frozen;
    await db.begin(async tx => { const fixture = await createTjanstYearFixture(tx), history = await seedYearHistory(tx, fixture);
      frozen = (await tx`select to_jsonb(x) body from public.tjanst_versions x where id=${history.versionId}`)[0].body; });
    const baseline = await captureSchemaUatBaseline(db);
    assert.ok(baseline.rows['public.pupils'].count > 0 && baseline.rows['public.tjanst_versions'].count > 0);
    pass(metadataJournal ? 'nonempty synthetic business baseline plus actual older journal versions/names/array-counts with redacted synthetic texts, including two known education gaps'
      : 'nonempty synthetic pupil, class, timplan and published service baseline with exact migration source journal');
    let installedFingerprint = null, auditId = null;
    const revalidate = async () => { assert.deepEqual(schemaUatSqlMetadata(schemaUatSources()), report.sql, 'SQL changed during installation');
      assert.deepEqual(installerSources(), report.installerSources, 'installer changed during rehearsal'); };
    const context = { baseline, sources, revalidate, audit: { runId: randomUUID(), revision: 'a'.repeat(40), candidateSha256: 'b'.repeat(64) } };
    const recorded = async connection => (await connection`select count(*)::int n from supabase_migrations.schema_migrations
      where version=any(${SCHEMA_UAT_MIGRATIONS.map(file => file.slice(0, 14))}::text[])`)[0].n;
    const preserve = connection => preservedRows(connection, baseline.columns, auditId);
    const migrate = async (tx, phase) => {
      const result = await installSchemaUatPackage(tx, { ...context, expectedFingerprint: installedFingerprint }, phase);
      installedFingerprint = result.fingerprint; auditId = result.auditId; return result;
    };
    report.rehearsal = { checks: [] };
    await runElectiveTransactions({ db, mode: 'rehearsal', report: report.rehearsal, fingerprint: schemaFingerprint, recorded, preserve, migrate });
    assert.equal(await schemaFingerprint(db), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal);
    assert.deepEqual(await preserve(db), baseline.rows);
    pass('three migrations rehearse atomically; rollback restores exact schema, ACL, original journal and all original rows');
    let calls = 0, failure;
    try { await db.begin(tx => installSchemaUatPackage(tx, { ...context, expectedFingerprint: installedFingerprint,
      revalidate: async () => { await revalidate(); if (++calls === 2) throw new Error('synthetic_late_source_fault'); } }, 'apply')); } catch (error) { failure = error; }
    assert.equal(failure?.message, 'synthetic_late_source_fault');
    assert.equal(await schemaFingerprint(db), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal);
    assert.deepEqual(await preserve(db), baseline.rows);
    pass('failure after all DDL, grants and three journal rows rolls back the entire package without original changes');
    await db.unsafe(`create function public.synthetic_schema_install_audit_fail() returns trigger language plpgsql as $$begin
      if new.action='schema_uat_migration_install' then raise exception 'synthetic audit unavailable';end if;return new;end$$;
      create trigger synthetic_schema_install_audit_fail before insert on public.security_events for each row execute function public.synthetic_schema_install_audit_fail()`);
    const faultBaseline = await captureSchemaUatBaseline(db); failure = null;
    try { await db.begin(tx => installSchemaUatPackage(tx, { ...context, baseline: faultBaseline }, 'apply')); } catch (error) { failure = error; }
    assert.equal(failure?.code, 'P0001'); assert.equal(await schemaFingerprint(db), faultBaseline.fingerprint);
    assert.deepEqual(await readMigrationJournal(db), baseline.originalJournal); assert.deepEqual(await preserve(db), baseline.rows);
    await db.unsafe('drop trigger synthetic_schema_install_audit_fail on public.security_events;drop function public.synthetic_schema_install_audit_fail()');
    assert.equal(await schemaFingerprint(db), baseline.fingerprint);
    pass('mandatory installation audit failure atomically removes new objects and journal rows');
    report.apply = { checks: [] };
    await runElectiveTransactions({ db, mode: 'apply', report: report.apply, fingerprint: schemaFingerprint, recorded, preserve, migrate });
    assert.equal(await recorded(db), 3); assert.equal(await schemaFingerprint(db), installedFingerprint);
    assert.deepEqual(await preserve(db), baseline.rows); assert.ok(auditId);
    const journal = await readMigrationJournal(db); assert.deepEqual(journal.slice(0, -3), baseline.originalJournal);
    assert.equal((await db`select count(*)::int n from public.security_events where action='schema_uat_migration_install'`)[0].n, 1);
    assert.equal((await db`select count(*)::int n from public.tjanst_versions x where to_jsonb(x)=${db.json(frozen)}`)[0].n, 1);
    pass('apply repeats rehearsal then commits exactly three bound SQL journal rows and one audit; old business/auth rows and publication unchanged');
    const installed = await captureSchemaUatBaselineAfter(db);
    assert.equal(installed.workingEntries, 4); assert.equal(installed.newTables, 3);
    pass('post-commit four narrow Worker entries work by privilege; three forced-RLS tables remain empty and closed to direct access');
    report.baseline = { fingerprint: baseline.fingerprint, journal: baseline.priorJournal, originalRowsSha256: sha(baseline.rows), tables: Object.keys(baseline.rows).length };
    report.installed = { fingerprint: installedFingerprint, journal: { count: journal.length, sha256: sha(journal) }, oldObjectsUnchanged: true,
      originalRowsSha256: sha(await preserve(db)), addedAuditRows: 1, ...installed };
    await revalidate(); report.status = 'PASS';
  } catch (error) {
    report.failure = { name: error.name, code: error.code ?? null, messageSha256: sha(String(error.message ?? '')) }; throw error;
  } finally {
    if (own) { await own.end(); report.databaseClosed = true; report.cleanup = 'complete'; }
    report.finishedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return report;
}
async function captureSchemaUatBaselineAfter(db) {
  const [row] = await db`select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r'
    and relname=any(${['schema_drafts', 'schema_draft_revisions', 'schema_draft_commands']}::text[]) and relrowsecurity and relforcerowsecurity`;
  let workingEntries = 0;
  for (const entry of ['schema_read(jsonb)', 'schema_command(jsonb)', 'schema_status(jsonb)', 'schema_dated_basis(jsonb)']) {
    if ((await db`select has_function_privilege('skolplattform_worker',${entry},'EXECUTE') allowed`)[0].allowed) workingEntries++;
  }
  return { newTables: row.n, workingEntries };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.ok([3, 5].includes(process.argv.length)); if (process.argv.length === 5) assert.equal(process.argv[3], '--baseline-report');
    const report = await verifySchemaUatInstallOwned(process.argv[2], { baselineReport: process.argv[4] ?? null }); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, targetContact: false,
      journalBefore: report.baseline.journal.count, journalAfter: report.installed.journal.count })); }
  catch { console.error('FAIL: own schema UAT install rehearsal; inspect private report'); process.exitCode = 1; }
}
