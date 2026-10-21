import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runInstallation, assertTransition, assertPrivate, requireEvidence, NEW_TABLES, REPLACED_FUNCTIONS, WORKER_ENTRYPOINTS, SQL_KINDS, sha } from './apply-tjanst.mjs';

test('argumentvakter: bevisfil under /private/tmp krävs, okända och blandade argument nekas', () => {
  assert.throws(() => parseArgs([]), /--sql-evidence/u);
  assert.throws(() => parseArgs(['--apply']), /--sql-evidence/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/tmp/x.json']), /private\/tmp/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/../etc/x.json']), /private\/tmp/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.txt']), /private\/tmp/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.json', '--linked']), /Okänt/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.json', '--apply', '--apply']), /Dubbelt/u);
  assert.throws(() => parseArgs(['--sql-evidence', '--apply']), /saknar värde/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.json', '--actual', '/private/tmp/a.json']), /collect-evidence/u);
  assert.throws(() => parseArgs(['--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json', '--actual', '/private/tmp/b.json', '--apply']), /kombineras/u);
  assert.throws(() => parseArgs(['--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json']), /kräver/u);
  assert.equal(parseArgs(['--sql-evidence', '/private/tmp/x.json']).mode, 'rehearsal');
  assert.equal(parseArgs(['--sql-evidence', '/private/tmp/x.json', '--apply']).mode, 'apply');
  assert.deepEqual(parseArgs(['--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json,/private/tmp/b.json', '--actual', '/private/tmp/c.json']).reports,
    ['/private/tmp/a.json', '/private/tmp/b.json']);
});

/** Falsk databas: en transaktion "committas" bara om återanropet returnerar utan att kasta. */
function fakeDb() {
  const state = { schema: 'base', journal: 0, commits: 0, rollbacks: 0, begins: 0 };
  const db = { state, async begin(cb) { state.begins++; const saved = { ...state }; try { const r = await cb(db); state.commits++; return r; }
    catch (e) { Object.assign(state, { schema: saved.schema, journal: saved.journal }); state.rollbacks++; throw e; } } };
  return db;
}
const harness = (db, mode, overrides = {}) => {
  const report = { checks: [] };
  return { report, args: { db, mode, report, fingerprint: async () => db.state.schema, recorded: async () => db.state.journal,
    check: (name, ok, detail) => { report.checks.push({ name, ok }); assert.ok(ok, name + JSON.stringify(detail ?? '')); },
    rehearse: async () => { db.state.schema = 'installed'; db.state.journal = 7; return { afterFingerprint: 'installed' }; },
    install: async () => { db.state.schema = 'installed'; db.state.journal = 7; return { afterFingerprint: 'installed' }; }, ...overrides } };
};

test('utan --apply görs aldrig commit, även när repetitionen lyckas', async () => {
  const db = fakeDb(), { report, args } = harness(db, 'rehearsal');
  await runInstallation(args);
  assert.deepEqual({ commits: db.state.commits, rollbacks: db.state.rollbacks, begins: db.state.begins, schema: db.state.schema, journal: db.state.journal },
    { commits: 0, rollbacks: 1, begins: 1, schema: 'base', journal: 0 });
  assert.equal(report.committed, false); assert.equal(report.installed, undefined);
});

test('ett fel i repetitionen rullas tillbaka och stoppar, även i --apply', async () => {
  const db = fakeDb(), { args } = harness(db, 'apply', { rehearse: async () => { db.state.schema = 'half'; throw Error('kontroll fallerade'); } });
  await assert.rejects(runInstallation(args), /kontroll fallerade/u);
  assert.deepEqual({ commits: db.state.commits, schema: db.state.schema, journal: db.state.journal }, { commits: 0, schema: 'base', journal: 0 });
});

test('repetitionen nekas om schemat inte återställs eller journalen redan har versioner', async () => {
  const db = fakeDb(); db.state.journal = 1;
  await assert.rejects(runInstallation(harness(db, 'rehearsal').args), /no 05.1 migration recorded/u);
  const db2 = fakeDb(), leak = harness(db2, 'rehearsal', { fingerprint: async () => db2.state.begins ? 'changed' : 'base' });
  await assert.rejects(runInstallation(leak.args), /rollback restored/u);
});

test('--apply installerar i en andra, egen transaktion efter återrullad repetition', async () => {
  const db = fakeDb(), { report, args } = harness(db, 'apply');
  await runInstallation(args);
  assert.deepEqual({ begins: db.state.begins, rollbacks: db.state.rollbacks, commits: db.state.commits, journal: db.state.journal }, { begins: 2, rollbacks: 1, commits: 1, journal: 7 });
  assert.equal(report.committed, true); assert.equal(report.afterRehearsal.fingerprint, 'base');
});

// ---------- strukturkontroll ----------
const f = (signature, definition = 'old', acl = '{postgres=X/postgres}') => ({ signature, definition, acl, owner: '10' });
function structures() {
  const before = { tables: [{ relname: 'access_assignments', relkind: 'r', acl: 'a' }, { relname: 'pupils', relkind: 'r', acl: 'a' }],
    columns: [{ relname: 'access_assignments', attname: 'scope_kind' }, { relname: 'pupils', attname: 'id' }],
    constraints: [{ relname: 'access_assignments', conname: 'phase3_scope_kind', definition: "CHECK (scope_kind IN ('school','group'))" }],
    indexes: [{ tablename: 'pupils', indexname: 'pupils_pkey', indexdef: 'x' }], triggers: [{ relname: 'pupils', tgname: 't' }], policies: [],
    functions: [f('phase3_other(jsonb)'), ...REPLACED_FUNCTIONS.map(s => f(s))] };
  const after = structuredClone(before);
  after.tables.push(...NEW_TABLES.map(relname => ({ relname, relkind: 'r', acl: 'p' })), { relname: 'tjanst_rows_lineage', relkind: 'i', acl: 'p' });
  after.columns.push(...NEW_TABLES.map(relname => ({ relname, attname: 'id' })), { relname: 'tjanst_rows_lineage', attname: 'id' });
  after.indexes.push({ tablename: 'tjanst_rows', indexname: 'tjanst_rows_lineage', indexdef: 'y' });
  after.triggers.push({ relname: 'tjanst_rows', tgname: 'g' });
  after.constraints = [{ relname: 'access_assignments', conname: 'phase3_scope_kind', definition: "CHECK (scope_kind IN ('school','group','self'))" },
    { relname: 'access_assignments', conname: 'phase51_self_scope', definition: 'CHECK (...)' }, { relname: 'tjanst_rows', conname: 'tjanst_rows_pkey', definition: 'PK' }];
  after.functions = after.functions.map(x => REPLACED_FUNCTIONS.includes(x.signature) ? { ...x, definition: 'new' } : x);
  after.functions.push(f('tjanst_plan_read(jsonb)', 'n'), f('phase51_deny_self()', 'n'));
  return { before, after };
}

test('strukturkontrollen godtar exakt de planerade objekten och nekar varje avvikelse', () => {
  const { before, after } = structures(), result = assertTransition(before, after, { functionCount: 2 });
  assert.deepEqual(result.replacedFunctions, [...REPLACED_FUNCTIONS].sort()); assert.equal(result.addedTables.length, 14);
  const deviations = [
    a => a.columns.push({ relname: 'pupils', attname: 'extra' }),
    a => { a.columns[1].attname = 'renamed'; },
    a => a.tables.splice(2, 1),
    a => a.tables.push({ relname: 'other_table', relkind: 'r', acl: 'p' }),
    a => a.indexes.push({ tablename: 'pupils', indexname: 'pupils_extra', indexdef: 'z' }),
    a => a.triggers.push({ relname: 'pupils', tgname: 'extra' }),
    a => a.policies.push({ tablename: 'pupils', policyname: 'p' }),
    a => { a.functions[0].definition = 'changed'; },
    a => { a.functions.find(x => x.signature === 'phase4_list_pupils(jsonb)').definition = 'old'; },
    a => { a.functions.find(x => x.signature === 'phase4_pupil_card(jsonb)').acl = '{postgres=X/postgres,skolplattform_worker=X/postgres}'; },
    a => a.functions.push(f('phase5_new(jsonb)', 'n')),
    a => a.functions.splice(0, 1),
    a => { a.constraints[0].definition = "CHECK (scope_kind IN ('school','group'))"; },
    a => a.constraints.push({ relname: 'pupils', conname: 'extra', definition: 'x' }),
    a => { a.tables[0].acl = 'changed'; },
  ];
  for (const [i, change] of deviations.entries()) { const a = structuredClone(after); change(a); assert.throws(() => assertTransition(before, a, { functionCount: a.functions.length - before.functions.length }), undefined, 'avvikelse ' + i); }
  assert.throws(() => assertTransition(before, after, { functionCount: 68 }), /Antal nya funktioner/u);
});

test('bara de tolv entrypointsen är öppna och bara för Worker', () => {
  const functions = [...WORKER_ENTRYPOINTS, 'tjanst_hash(jsonb)'].flatMap(s => ['anon', 'skolplattform_worker'].map(role =>
    ({ signature: 'public.' + s, role, allowed: role === 'skolplattform_worker' && s !== 'tjanst_hash(jsonb)', public_execute: false })));
  const relations = [{ relname: 'tjanst_rows', role: 'skolplattform_worker', allowed: false, public_any: false }];
  assert.equal(assertPrivate({ functions, relations }).privateFunctions, 1);
  for (const change of [r => { r.functions.find(x => x.signature === 'public.tjanst_hash(jsonb)' && x.role === 'skolplattform_worker').allowed = true; },
    r => { r.functions.find(x => x.role === 'anon').allowed = true; }, r => { r.functions[0].public_execute = true; },
    r => { r.relations[0].allowed = true; }, r => { r.relations[0].public_any = true; }, r => { r.functions.find(x => x.role === 'skolplattform_worker').allowed = false; }]) {
    const r = structuredClone({ functions, relations }); change(r); assert.throws(() => assertPrivate(r));
  }
});

// ---------- bevis ----------
function evidence() {
  const migrations = { 'supabase/migrations/20261020100000_a.sql': 'h1', 'supabase/migrations/20261020110000_b.sql': 'h2' }, base = 'fp';
  const files = {};
  const sql = Object.fromEntries(SQL_KINDS.map((kind, i) => { const sources = i === 0 ? { 'supabase/migrations/20261020100000_a.sql': 'h1' } : { 'supabase/migrations/20261020110000_b.sql': 'h2' };
    files['/private/tmp/' + i] = { kind, status: 'PASS', mode: 'schema-snapshot', checks: [{ ok: true }], sources, finalSources: sources, cleanup: { cleanup: 'complete' }, database: { dataCopied: false, sourceFingerprint: base } };
    return [kind, '/private/tmp/' + i]; }));
  files['/private/tmp/actual'] = { kind: 'tjanst-actual-api-browser', status: 'PASS', checks: [{ ok: true }], notExecuted: [], playwrightOutcome: { stats: { unexpected: 0, flaky: 0 } },
    migrationSources: migrations, finalMigrationSources: migrations, snapshot: { dataCopied: false, sourceFingerprint: base }, baselineFingerprint: base, installedFingerprint: 'x', finalFingerprint: 'x',
    grants: { workerExecute: [...WORKER_ENTRYPOINTS].sort(), clientRoleExecute: [], tablePrivileges: [], publicTablePrivileges: [], functionCount: 68 },
    oidcCleanup: { cleanup: 'complete' }, runtimeCleanup: { cleanup: 'complete' }, snapshotCleanup: { cleanup: 'complete' }, buildCopyRemoved: true,
    candidate: { revision: 'a'.repeat(40) }, sourceRevision: 'a'.repeat(40), finalArtifact: { fileCount: 3, sha256: 'b'.repeat(64) } };
  files['/private/tmp/actual'].finalGrants = files['/private/tmp/actual'].grants;
  return { files, migrations, base, sql };
}
const manifestFor = e => { const bytes = p => Buffer.from(JSON.stringify(e.files[p]));
  return { read: bytes, manifest: { kind: 'tjanst-sql-evidence', schemaVersion: 1, sql: Object.fromEntries(Object.entries(e.sql).map(([k, p]) => [k, { path: p, sha256: sha(bytes(p)) }])),
    actual: { path: '/private/tmp/actual', sha256: sha(bytes('/private/tmp/actual')) } } }; };

test('bevisen kräver PASS-rapporter för exakt de aktuella migrationskällorna och målets schema', () => {
  const e = evidence(), { read, manifest } = manifestFor(e);
  assert.equal(requireEvidence(manifest, read, { migrations: e.migrations, baselineFingerprint: e.base }).actual.functionCount, 68);
  assert.throws(() => requireEvidence(manifest, read, { migrations: e.migrations, baselineFingerprint: 'other' }));
  assert.throws(() => requireEvidence(manifest, read, { migrations: { ...e.migrations, 'supabase/migrations/20261020110000_b.sql': 'h3' }, baselineFingerprint: e.base }));
  for (const change of [x => { x.files['/private/tmp/0'].status = 'FAIL'; }, x => { x.files['/private/tmp/1'].checks[0].ok = false; }, x => { x.files['/private/tmp/2'].cleanup.cleanup = 'pending'; },
    x => { x.files['/private/tmp/3'].mode = 'ephemeral'; }, x => { x.files['/private/tmp/actual'].status = 'FAIL'; }, x => { x.files['/private/tmp/actual'].notExecuted = ['x']; },
    x => { x.files['/private/tmp/actual'].grants.workerExecute = []; }, x => { x.files['/private/tmp/actual'].oidcCleanup.cleanup = 'failed'; },
    x => { x.files['/private/tmp/actual'].migrationSources = {}; }, x => { x.files['/private/tmp/0'].sources = {}; x.files['/private/tmp/0'].finalSources = {}; }]) {
    const x = evidence(); change(x); const m = manifestFor(x); assert.throws(() => requireEvidence(m.manifest, m.read, { migrations: x.migrations, baselineFingerprint: x.base }));
  }
  const tampered = manifestFor(e); tampered.manifest.actual.sha256 = 'c'.repeat(64);
  assert.throws(() => requireEvidence(tampered.manifest, tampered.read, { migrations: e.migrations, baselineFingerprint: e.base }), /ändrats/u);
});
