// Installationskärna för skolans salregister (05.2-SM-UXF-23): exakt två additiva migrationer ovanpå den installerade schemaleveransen.
// Samma mönster som schema-uat-install-core.mjs (som lämnas orörd): samma SQL-lexning, originalradsinventering och transaktionsmotor.
// Anslutningen tillhandahålls av ett granskat anrop; ingen målupptäckt eller CLI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { prepareMigrationSql, preservedColumns, preservedRows, readMigrationJournal, electiveTableLock, sha } from './apply-elective-blocks.mjs';
import { SCHEMA_UAT_MIGRATIONS } from './schema-uat-install-core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SCHOOL_ROOMS_MIGRATIONS = Object.freeze(['20261118100000_school_rooms.sql', '20261118101000_school_rooms_worker_access.sql']);
const TABLES = ['school_room_registers', 'school_room_register_revisions'];
const INDEXES = ['school_room_registers_pkey', 'school_room_register_revisions_pkey', 'school_room_register_revisions_command_id_key'];
const FUNCTIONS = ['school_rooms_immutable()', 'school_rooms_hash(jsonb)', 'school_rooms_actor(uuid)', 'school_rooms_unit(jsonb,text[])', 'school_rooms_valid_text(jsonb,integer,boolean)',
  'school_rooms_valid(jsonb)', 'school_rooms_audit(text,uuid,jsonb)', 'school_rooms_json(school_room_registers)', 'school_rooms_read(jsonb)', 'school_rooms_save(jsonb)'];
const ENTRIES = ['school_rooms_read(jsonb)', 'school_rooms_save(jsonb)'];
const TRIGGERS = ['school_room_register_revisions.school_room_register_revisions_immutable'];
export const SCHOOL_ROOMS_AUDIT_ACTION = 'school_rooms_migration_install';
const signature = value => value.replaceAll('public.', '').replaceAll(', ', ',');

export function schoolRoomsSources(sourceRoot = root) {
  return Object.fromEntries(SCHOOL_ROOMS_MIGRATIONS.map(file => {
    const sql = readFileSync(resolve(sourceRoot, 'supabase/migrations', file), 'utf8');
    const execution = prepareMigrationSql(sql);
    return [file, { sql, sha256: sha(sql), bytes: Buffer.byteLength(sql), execution }];
  }));
}
export const schoolRoomsSqlMetadata = sources => SCHOOL_ROOMS_MIGRATIONS.map(file => {
  const { sha256, bytes, execution } = sources[file];
  return { file, version: file.slice(0, 14), name: file.slice(15, -4), bytes, sha256, executionSha256: execution.executionSha256, wrapper: execution.wrapper };
});

/** Schemaleveransens tre migrationer ska redan finnas; paketet får inte vara helt eller delvis installerat, och ingen nyare migration får finnas. */
export function assertSchoolRoomsJournal(rows) {
  assert.ok(rows.length > 0, 'existing migration journal required');
  for (const file of SCHEMA_UAT_MIGRATIONS) assert.ok(rows.some(row => file.startsWith(row.version + '_')), 'installed schema package required');
  assert.equal(rows.some(row => SCHOOL_ROOMS_MIGRATIONS.some(file => file.startsWith(row.version + '_'))), false, 'package already/partially installed');
  assert.ok(rows.every((row, index) => /^\d{14}$/u.test(row.version) && (index === 0 || rows[index - 1].version < row.version)), 'invalid baseline journal');
  assert.ok(rows.at(-1).version < SCHOOL_ROOMS_MIGRATIONS[0].slice(0, 14), 'newer baseline requires a separate release review');
  return { count: rows.length, sha256: sha(rows) };
}

/** Alla tidigare objekt måste vara identiska. Nya objekt ska vara exakt paketets. */
export function assertSchoolRoomsTransition(before, after) {
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
    else if (part === 'triggers') assert.deepEqual(added.map(key).sort(), [...TRIGGERS]);
    else if (part === 'indexes') assert.deepEqual(added.map(row => row.indexname).sort(), [...INDEXES].sort());
    else assert.ok(added.length > 0 && added.every(row => relationNames.has(row.relname)), 'unexpected added ' + part);
  }
  return { newFunctions: FUNCTIONS.length, newTables: TABLES.length, newIndexes: INDEXES.length, newTriggers: TRIGGERS.length, oldObjectsUnchanged: true };
}

export async function assertSchoolRoomsPrivileges(tx) {
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

export async function captureSchoolRoomsBaseline(db) {
  const columns = await preservedColumns(db), originalJournal = await readMigrationJournal(db);
  return { columns, originalJournal, priorJournal: assertSchoolRoomsJournal(originalJournal), rows: await preservedRows(db, columns),
    structure: await schemaFingerprint(db, true), fingerprint: await schemaFingerprint(db) };
}

// Anropas i en befintlig transaktion. Oavsett senare fel rullas DDL, grants, journal och granskningsrad tillbaka tillsammans.
export async function installSchoolRoomsPackage(tx, { baseline, sources, revalidate, expectedFingerprint = null, audit = null }, phase) {
  assert.ok(['rehearsal', 'apply'].includes(phase)); assert.equal(typeof revalidate, 'function');
  await tx`set local lock_timeout='8s'`; await tx`set local statement_timeout='180s'`;
  assert.equal((await tx`select pg_try_advisory_xact_lock(5552) locked`)[0].locked, true);
  for (const key of Object.keys(baseline.columns).sort()) await tx.unsafe(electiveTableLock(key));
  await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
  assert.equal(await schemaFingerprint(tx), baseline.fingerprint); assert.deepEqual(await readMigrationJournal(tx), baseline.originalJournal);
  assert.deepEqual(await preservedRows(tx, baseline.columns), baseline.rows); await revalidate(tx);
  for (const file of SCHOOL_ROOMS_MIGRATIONS) {
    assert.equal(sha(sources[file].sql), sources[file].sha256); await tx.unsafe(prepareMigrationSql(sources[file].sql).sql);
  }
  await tx`set constraints all immediate`;
  const inventory = assertSchoolRoomsTransition(baseline.structure, await schemaFingerprint(tx, true));
  const privileges = await assertSchoolRoomsPrivileges(tx), fingerprint = await schemaFingerprint(tx);
  if (expectedFingerprint !== null) assert.equal(fingerprint, expectedFingerprint, 'rehearsed catalog changed');
  assert.deepEqual(await preservedRows(tx, baseline.columns), baseline.rows);
  for (const file of SCHOOL_ROOMS_MIGRATIONS) await tx`insert into supabase_migrations.schema_migrations(version,name,statements)
    values(${file.slice(0, 14)},${file.slice(15, -4)},${[sources[file].sql]})`;
  const journal = await readMigrationJournal(tx), n = SCHOOL_ROOMS_MIGRATIONS.length;
  assert.deepEqual(journal.slice(0, -n), baseline.originalJournal);
  assert.deepEqual(journal.slice(-n), SCHOOL_ROOMS_MIGRATIONS.map(file => ({ version: file.slice(0, 14), name: file.slice(15, -4), statements: [sources[file].sql] })));
  await revalidate(tx);
  let auditId = null;
  if (phase === 'apply') {
    assert.match(audit?.runId ?? '', /^[a-f0-9-]{36}$/u); assert.match(audit?.revision ?? '', /^[a-f0-9]{40}$/u); assert.match(audit?.candidateSha256 ?? '', /^[a-f0-9]{64}$/u);
    const [row] = await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details)
      values(${audit.runId},'cli',${SCHOOL_ROOMS_AUDIT_ACTION},'migration_package','ok',${tx.json({ revision: audit.revision, candidateSha256: audit.candidateSha256, sql: schoolRoomsSqlMetadata(sources) })}) returning id`;
    auditId = row.id;
  }
  return { fingerprint, inventory, privileges, journalCount: journal.length, journalSha256: sha(journal), auditId };
}
