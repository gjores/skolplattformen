#!/usr/bin/env node
// Endast metadata: inga schema-RPC:er, verksamhetsrader, DDL, auditinsättningar eller processändringar.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from '../pilot/verify-target.mjs';
import { connect, classCohortTargetIdentity } from '../pilot/verify-class-cohort.mjs';
import { schemaFingerprint } from '../pilot/named-timplan-snapshot.mjs';
import { migrationFiles } from '../pilot/ephemeral-migrated-db.mjs';
import { SCHEMA_UAT_MIGRATIONS, schemaUatSources, schemaUatSqlMetadata } from '../pilot/schema-uat-install-core.mjs';
import { assertEducationBaseline } from '../pilot/apply-elective-blocks.mjs';
import { PREVIOUS_SCHEMA_REVISION, releaseSha } from './prepare-uat-release.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const oldRuntime = path.join(root, 'work/pilot/targets/protected/runtime/schema-4267daf75b');
const oldArtifactSha256 = '2f43bdeb662ac7d92e440b0e5ec1e6e5874d5ee6c27d9120ab53dffae964f96f';
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
const newFunctionNames = ['schema_read', 'schema_command', 'schema_status', 'schema_dated_basis', 'schema_draft_canonical', 'schema_draft_hash',
  'schema_draft_immutable', 'schema_draft_actor', 'schema_draft_scope', 'schema_draft_audit', 'schema_draft_json'];
const newTableNames = ['schema_drafts', 'schema_draft_revisions', 'schema_draft_commands'];

export function summarizeSchemaUatJournal(rows, files, source) {
  const byVersion = new Map(rows.map(row => [row.version, row])); assert.equal(byVersion.size, rows.length, 'duplicate migration version');
  const missing = [], mismatched = [], matched = [];
  for (const file of files) {
    const row = byVersion.get(file.slice(0, 14));
    if (!row) { missing.push(file); continue; }
    const sql = source(file), expectedName = file.slice(15, -4);
    if (row.name !== expectedName || !Array.isArray(row.statements) || row.statements.length !== 1 || row.statements[0] !== sql) {
      mismatched.push({ file, nameMatches: row.name === expectedName, statementCount: row.statements?.length ?? null,
        name: typeof row.name === 'string' && /^[a-z0-9_]+$/u.test(row.name) ? row.name : null,
        sourceMatches: Array.isArray(row.statements) && row.statements.length === 1 && row.statements[0] === sql,
        sourceSha256: releaseSha(sql), journalStatementsSha256: releaseSha(row.statements ?? null) });
    } else matched.push({ file, sha256: releaseSha(sql) });
  }
  const names = new Set(files.map(file => file.slice(0, 14))), unknown = rows.filter(row => !names.has(row.version)).map(row => ({ version: row.version,
    name: typeof row.name === 'string' && /^[a-z0-9_]+$/u.test(row.name) ? row.name : null, nameSha256: releaseSha(String(row.name)) }));
  const shape = rows.map(row => ({ version: row.version, name: typeof row.name === 'string' && /^[a-z0-9_]+$/u.test(row.name) ? row.name : null,
    statementCount: Array.isArray(row.statements) ? row.statements.length : null, statementsSha256: releaseSha(row.statements ?? null) }));
  return { count: rows.length, latestVersion: rows.at(-1)?.version ?? null, journalSha256: releaseSha(rows), shape, shapeSha256: releaseSha(shape), matched, missing, mismatched, unknown };
}

function listener(port, role) {
  const ids = [...new Set(execute('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean))];
  assert.equal(ids.length, 1, 'one known listener required'); assert.match(ids[0], /^\d+$/u);
  const pid = ids[0], cwd = execute('/usr/sbin/lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']).split('\n').find(value => value.startsWith('n'))?.slice(1);
  assert.equal(realpathSync(cwd), realpathSync(path.join(oldRuntime, role)), 'listener is not the previous frozen runtime');
  const started = execute('/bin/ps', ['-p', pid, '-o', 'lstart=']), command = execute('/bin/ps', ['-p', pid, '-o', 'command=']);
  return { port, role, runtimeRevision: PREVIOUS_SCHEMA_REVISION, processSha256: releaseSha({ pid, started, command, cwd }) };
}

function priorArtifact() {
  const file = path.join(oldRuntime, 'artifact.json'), bytes = readFileSync(file), artifact = JSON.parse(bytes);
  assert.equal(releaseSha(bytes), oldArtifactSha256, 'previous artifact metadata changed');
  assert.equal(artifact.sourceRevision, PREVIOUS_SCHEMA_REVISION); assert.equal(artifact.appContractVersion, 7); assert.equal(artifact.motorContractVersion, 4);
  for (const item of artifact.files) {
    assert.ok(!path.isAbsolute(item.path) && !item.path.split('/').includes('..'));
    const name = path.join(oldRuntime, item.path), stat = lstatSync(name); assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(stat.size, item.bytes, 'previous product size changed'); assert.equal(releaseSha(readFileSync(name)), item.sha256, 'previous product hash changed');
  }
  const mark = readJson(path.join(oldRuntime, 'web/dist-protected/build-mode.json'));
  assert.equal(mark.mode, 'protected'); assert.equal(mark.revision, PREVIOUS_SCHEMA_REVISION);
  return { revision: PREVIOUS_SCHEMA_REVISION, appContract: 7, motorContract: 4, artifactSha256: oldArtifactSha256, fileCount: artifact.files.length,
    productFilesSha256: releaseSha(artifact.files), buildMarkSha256: releaseSha(mark) };
}

export async function preflightSchemaUatTargetReadOnly(out) {
  assert.match(out ?? '', /^\/private\/tmp\/schema-uat-target-readonly-[a-z0-9-]+\.json$/u); assert.equal(existsSync(out), false);
  const report = { kind: 'schema-uat-target-readonly-preflight', status: 'FAIL', startedAt: new Date().toISOString(), checks: [],
    readsOnly: true, migrationsApplied: 0, processesChanged: false, businessRowsRead: false, auditRpcCalled: false,
    limits: ['No business values, auth rows or runtime secrets read into output', 'No app/API workflow exercised', 'Metadata preflight is not installation approval'] };
  const check = (name, ok) => report.checks.push({ name, ok: ok === true });
  let db;
  try {
    const manifestFile = path.join(root, 'work/pilot/targets/protected/manifest.json'), stat = lstatSync(manifestFile);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0); assert.equal(realpathSync(manifestFile), manifestFile);
    // requireRunning:false undviker Supabase-CLI:ns cache-skrivning/radering. Verklig DB-identitet prövas nedan.
    const target = await assertTarget('protected', { requireRunning: false, requireIdp: false });
    const endpoint = new URL(target.dbUrl); assert.equal(endpoint.hostname, '127.0.0.1'); assert.equal(endpoint.port, '56322');
    assert.equal(new URL(target.apiUrl).hostname, '127.0.0.1'); assert.equal(new URL(target.apiUrl).port, '56321');
    assert.equal(realpathSync(target.workdir), path.dirname(manifestFile));
    report.target = { name: 'protected', manifestSha256: releaseSha(readFileSync(manifestFile)), manifestMigrationCount: target.migrations?.length ?? null };
    check('private known local target manifest accepted without CLI or cache writes', true);
    report.runtime = { app: listener(3012, 'web'), motor: listener(3013, 'motor'), artifact: priorArtifact() };
    const health = await fetch('http://127.0.0.1:3013/v1/health', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200); assert.equal((await health.json()).contract_version, 4);
    check('3012/3013 identified as frozen 4267daf7 pair; all1460 old files and motor4 health unchanged', true);
    const docker = JSON.parse(execute('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', 'supabase_db_skolplattform-pilot-protected']));
    assert.ok(docker['5432/tcp']?.some(binding => ['127.0.0.1', '0.0.0.0'].includes(binding.HostIp) && binding.HostPort === '56322'), 'known target container port mismatch');
    report.target.databaseContainerBinding = docker['5432/tcp'].some(binding => binding.HostIp === '0.0.0.0') ? 'existing-wildcard' : 'loopback';
    check('metadata connection belongs to the existing known local protected database container', true);
    db = connect(target);
    await db.begin(async tx => {
      await tx`set transaction isolation level repeatable read read only`; await tx`set local statement_timeout='30s'`; await tx`set local lock_timeout='5s'`;
      const [mode] = await tx`select current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation`;
      assert.equal(mode.read_only, 'on'); assert.equal(mode.isolation, 'repeatable read');
      const identity = await classCohortTargetIdentity(tx, target); assert.equal(identity.database, decodeURIComponent(endpoint.pathname.slice(1)));
      report.database = { identitySha256: identity.sha256, transactionReadOnly: true, isolation: mode.isolation, schemaFingerprint: await schemaFingerprint(tx) };
      const rows = Array.from(await tx`select version,name,statements from supabase_migrations.schema_migrations order by version`, row => ({ version: row.version, name: row.name, statements: Array.isArray(row.statements) ? Array.from(row.statements) : row.statements }));
      report.journal = summarizeSchemaUatJournal(rows, migrationFiles(), file => readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
      const pending = new Set(SCHEMA_UAT_MIGRATIONS), missingBaseline = report.journal.missing.filter(file => !pending.has(file));
      report.journal.missingBaseline = missingBaseline; report.sql = schemaUatSqlMetadata(schemaUatSources());
      check('explicit repeatable-read READ ONLY transaction and known actual database identity', true);
      check('all three new migration versions absent', SCHEMA_UAT_MIGRATIONS.every(file => report.journal.missing.includes(file)));
      check('all earlier repository migrations exactly journalled with no unknown versions', missingBaseline.length === 0 && report.journal.mismatched.length === 0 && report.journal.unknown.length === 0);
      const functions = await tx`select proname from pg_proc where pronamespace='public'::regnamespace and proname=any(${newFunctionNames}::text[])`;
      const tables = await tx`select relname from pg_class where relnamespace='public'::regnamespace and relname=any(${newTableNames}::text[])`;
      report.packageObjects = { functionNames: functions.map(row => row.proname), tableNames: tables.map(row => row.relname) };
      check('no partial new schema RPC/helper/table objects exist', functions.length === 0 && tables.length === 0);
      const requiredFunctions = ['tjanst_actor', 'tjanst_plan_scope', 'phase5_programplan_session_check', 'phase5_programplan_shape', 'phase5_programplan_integer', 'tjanst_uuid', 'tjanst_audit_details', 'phase3_actor', 'phase4_scope', 'phase4_can_read_protected'];
      const present = await tx`select distinct proname from pg_proc where pronamespace='public'::regnamespace and proname=any(${requiredFunctions}::text[])`;
      const requiredColumns = { pupils: ['id', 'customer_id', 'organizer_id', 'protected_identity'], pupil_placements: ['id', 'pupil_id', 'unit_id', 'customer_id', 'organizer_id', 'starts_on', 'ends_on'],
        pupil_class_memberships: ['placement_id', 'pupil_id', 'class_id', 'unit_id', 'starts_on', 'ends_on'], study_groups: ['id', 'unit_id', 'school_year', 'active', 'starts_on', 'ends_on'],
        teaching_groups: ['id', 'block_id', 'active', 'starts_on', 'ends_on'], elective_blocks: ['id', 'unit_id', 'school_year'],
        study_group_memberships: ['group_id', 'pupil_id', 'unit_id', 'starts_on', 'ends_on', 'cancelled_at'], elective_placements: ['group_id', 'pupil_id', 'unit_id', 'starts_on', 'ends_on', 'cancelled_at'] };
      const columns = await tx`select c.relname,a.attname from pg_class c join pg_attribute a on a.attrelid=c.oid where c.relnamespace='public'::regnamespace
        and c.relname=any(${Object.keys(requiredColumns)}::text[]) and a.attnum>0 and not a.attisdropped`;
      report.prerequisites = { missingFunctions: requiredFunctions.filter(name => !present.some(row => row.proname === name)),
        missingColumns: Object.entries(requiredColumns).flatMap(([table, names]) => names.filter(name => !columns.some(row => row.relname === table && row.attname === name)).map(name => table + '.' + name)) };
      check('guarded actor/scope/audit and real dated-membership source prerequisites exist', report.prerequisites.missingFunctions.length === 0 && report.prerequisites.missingColumns.length === 0);
      report.educationBaseline = await assertEducationBaseline(tx);
      check('known unjournalled education objects retain forced RLS, required actor columns and only three narrow Worker entries', report.educationBaseline.status === 'PASS');
      assert.equal((await tx`select current_setting('transaction_read_only') value`)[0].value, 'on');
    });
    assert.deepEqual({ app: listener(3012, 'web'), motor: listener(3013, 'motor') }, { app: report.runtime.app, motor: report.runtime.motor });
    assert.deepEqual(priorArtifact(), report.runtime.artifact);
    assert.equal(releaseSha(readFileSync(manifestFile)), report.target.manifestSha256);
    check('original process identities, product files and private manifest unchanged after metadata read', true);
    report.status = report.checks.every(item => item.ok) ? 'PASS' : 'FAIL';
  } catch (error) { report.failure = { name: error.name, code: error.code ?? null, messageSha256: releaseSha(String(error.message ?? '')) }; }
  finally { if (db) { await db.end({ timeout: 5 }); report.databaseClosed = true; } report.finishedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.equal(process.argv.length, 3); const report = await preflightSchemaUatTargetReadOnly(process.argv[2]); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, journalCount: report.journal?.count ?? null, latest: report.journal?.latestVersion ?? null, pending: report.journal?.missing ?? null, failure: report.failure ?? null })); if (report.status !== 'PASS') process.exitCode = 1; }
  catch { console.error('FAIL: private metadata preflight setup'); process.exitCode = 1; }
}
