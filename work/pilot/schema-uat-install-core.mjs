// Ren installationskärna. Anslutningen tillhandahålls av ett granskat anrop; ingen målupptäckt eller CLI.
// Återanvänder samma SQL-lexning, originalradsinventering och transaktionsmotor som tidigare installationer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { prepareMigrationSql, preservedColumns, preservedRows, readMigrationJournal, electiveTableLock, sha } from './apply-elective-blocks.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SCHEMA_UAT_MIGRATIONS = Object.freeze([
  '20261116100000_schema_drafts.sql',
  '20261116101000_schema_drafts_worker_access.sql',
  '20261116102000_schema_dated_basis.sql',
]);
const TABLES = ['schema_drafts', 'schema_draft_revisions', 'schema_draft_commands'];
const INDEXES = ['schema_drafts_pkey', 'schema_drafts_unit_id_school_year_period_key', 'schema_drafts_id_customer_id_organizer_id_key', 'schema_draft_revisions_pkey', 'schema_draft_commands_pkey'];
const FUNCTIONS = ['schema_draft_canonical(jsonb,integer)', 'schema_draft_hash(jsonb)', 'schema_draft_immutable()',
  'schema_draft_actor(uuid)', 'schema_draft_scope(jsonb,text[])', 'schema_draft_audit(text,uuid,jsonb)', 'schema_draft_json(schema_drafts)',
  'schema_read(jsonb)', 'schema_status(jsonb)', 'schema_command(jsonb)', 'schema_dated_basis(jsonb)'];
const ENTRIES = ['schema_read(jsonb)', 'schema_command(jsonb)', 'schema_status(jsonb)', 'schema_dated_basis(jsonb)'];
const signature = value => value.replaceAll('public.', '').replaceAll(', ', ',');

export function schemaUatSources(sourceRoot = root) {
  return Object.fromEntries(SCHEMA_UAT_MIGRATIONS.map(file => {
    const sql = readFileSync(resolve(sourceRoot, 'supabase/migrations', file), 'utf8');
    const execution = prepareMigrationSql(sql);
    return [file, { sql, sha256: sha(sql), bytes: Buffer.byteLength(sql), execution }];
  }));
}
export const schemaUatSqlMetadata = sources => SCHEMA_UAT_MIGRATIONS.map(file => {
  const { sha256, bytes, execution } = sources[file];
  return { file, version: file.slice(0, 14), name: file.slice(15, -4), bytes, sha256,
    executionSha256: execution.executionSha256, wrapper: execution.wrapper };
});

export function assertSchemaUatJournal(rows) {
  assert.ok(rows.length > 0, 'existing migration journal required');
  assert.equal(rows.some(row => SCHEMA_UAT_MIGRATIONS.some(file => file.startsWith(row.version + '_'))), false, 'package already/partially installed');
  assert.ok(rows.every((row, index) => /^\d{14}$/u.test(row.version) && (index === 0 || rows[index - 1].version < row.version)), 'invalid baseline journal');
  assert.ok(rows.at(-1).version < SCHEMA_UAT_MIGRATIONS[0].slice(0, 14), 'newer baseline requires a separate release review');
  return { count: rows.length, sha256: sha(rows) };
}

// Alla tidigare objekt måste vara identiska. Nya objekts definitioner binds till de tre granskade SQL-hasharna.
export function assertSchemaUatTransition(before, after) {
  const relationNames = new Set([...TABLES, ...INDEXES]);
  const keys = { functions: row => signature(row.signature), tables: row => row.relname, columns: row => row.relname + '.' + row.attname,
    constraints: row => row.relname + '.' + row.conname, indexes: row => row.tablename + '.' + row.indexname,
    triggers: row => row.relname + '.' + row.tgname, policies: row => row.tablename + '.' + row.policyname };
  for (const [part, key] of Object.entries(keys)) {
    const original = new Map(before[part].map(row => [key(row), row]));
    for (const row of after[part]) if (original.has(key(row))) { assert.deepEqual(row, original.get(key(row)), 'existing ' + part + ' changed'); original.delete(key(row)); }
    assert.equal(original.size, 0, 'existing ' + part + ' removed');
    const prior = new Set(before[part].map(key)), added = after[part].filter(row => !prior.has(key(row)));
    if (part === 'functions') assert.deepEqual(added.map(key).sort(), [...FUNCTIONS].sort());
    else if (part === 'tables') assert.deepEqual(added.map(key).sort(), [...relationNames].sort());
    else if (part === 'policies') assert.deepEqual(added, []);
    else if (part === 'triggers') assert.deepEqual(added.map(key).sort(), ['schema_draft_commands.schema_draft_commands_immutable', 'schema_draft_revisions.schema_draft_revisions_immutable']);
    else if (part === 'indexes') assert.deepEqual(added.map(row => row.indexname).sort(), [...INDEXES].sort());
    else assert.ok(added.length > 0 && added.every(row => relationNames.has(row.relname)), 'unexpected added ' + part);
  }
  return { newFunctions: FUNCTIONS.length, newTables: TABLES.length, newIndexes: INDEXES.length, newTriggers: 2, oldObjectsUnchanged: true };
}

export async function assertSchemaUatPrivileges(tx) {
  for (const table of TABLES) {
    const [row] = await tx`select relrowsecurity rls, relforcerowsecurity forced from pg_class where oid=${'public.' + table}::regclass`;
    assert.ok(row.rls && row.forced, 'new tables require forced RLS');
    assert.equal((await tx.unsafe('select count(*)::int n from public.' + table))[0].n, 0, 'migration must create empty tables');
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      const [p] = await tx`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') any,
        has_any_column_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,REFERENCES') columns`;
      assert.equal(p.any, false); assert.equal(p.columns, false);
    }
  }
  for (const fn of FUNCTIONS) {
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      assert.equal((await tx`select has_function_privilege(${role},${'public.' + fn},'EXECUTE') allowed`)[0].allowed,
        role === 'skolplattform_worker' && ENTRIES.includes(fn), 'unexpected effective function grant');
    }
    assert.equal((await tx`select exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=${'public.' + fn}::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') open`)[0].open, false);
  }
  return { forcedPrivateTables: TABLES.length, workerEntries: ENTRIES.length, privateHelpers: FUNCTIONS.length - ENTRIES.length };
}

export async function captureSchemaUatBaseline(db) {
  const columns = await preservedColumns(db), originalJournal = await readMigrationJournal(db);
  return { columns, originalJournal, priorJournal: assertSchemaUatJournal(originalJournal), rows: await preservedRows(db, columns),
    structure: await schemaFingerprint(db, true), fingerprint: await schemaFingerprint(db) };
}

// Anropas i en befintlig transaktion. Oavsett senare fel rullas DDL, grants, journal och revisionslogg tillbaka tillsammans.
export async function installSchemaUatPackage(tx, { baseline, sources, revalidate, expectedFingerprint = null, audit = null }, phase) {
  assert.ok(['rehearsal', 'apply'].includes(phase)); assert.equal(typeof revalidate, 'function');
  await tx`set local lock_timeout='8s'`; await tx`set local statement_timeout='180s'`;
  assert.equal((await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked, true);
  for (const key of Object.keys(baseline.columns).sort()) await tx.unsafe(electiveTableLock(key));
  await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
  assert.equal(await schemaFingerprint(tx), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(tx), baseline.originalJournal);
  assert.deepEqual(await preservedRows(tx, baseline.columns), baseline.rows); await revalidate(tx);
  for (const file of SCHEMA_UAT_MIGRATIONS) {
    assert.equal(sha(sources[file].sql), sources[file].sha256); await tx.unsafe(prepareMigrationSql(sources[file].sql).sql);
  }
  await tx`set constraints all immediate`;
  const inventory = assertSchemaUatTransition(baseline.structure, await schemaFingerprint(tx, true));
  const privileges = await assertSchemaUatPrivileges(tx), fingerprint = await schemaFingerprint(tx);
  if (expectedFingerprint !== null) assert.equal(fingerprint, expectedFingerprint, 'rehearsed catalog changed');
  assert.deepEqual(await preservedRows(tx, baseline.columns), baseline.rows);
  for (const file of SCHEMA_UAT_MIGRATIONS) await tx`insert into supabase_migrations.schema_migrations(version,name,statements)
    values(${file.slice(0, 14)},${file.slice(15, -4)},${[sources[file].sql]})`;
  const journal = await readMigrationJournal(tx);
  assert.deepEqual(journal.slice(0, -3), baseline.originalJournal);
  assert.deepEqual(journal.slice(-3), SCHEMA_UAT_MIGRATIONS.map(file => ({ version: file.slice(0, 14), name: file.slice(15, -4), statements: [sources[file].sql] })));
  await revalidate(tx);
  let auditId = null;
  if (phase === 'apply') {
    assert.match(audit?.runId ?? '', /^[a-f0-9-]{36}$/u); assert.match(audit?.revision ?? '', /^[a-f0-9]{40}$/u); assert.match(audit?.candidateSha256 ?? '', /^[a-f0-9]{64}$/u);
    const [row] = await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details)
      values(${audit.runId},'cli','schema_uat_migration_install','migration_package','ok',${tx.json({ revision: audit.revision, candidateSha256: audit.candidateSha256, sql: schemaUatSqlMetadata(sources) })}) returning id`;
    auditId = row.id;
  }
  return { fingerprint, inventory, privileges, journalCount: journal.length, journalSha256: sha(journal), auditId };
}
