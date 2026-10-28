import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runInstallation, assertTransition, assertPrivate, requireEvidence, NEW_TABLES, REPLACED_FUNCTIONS, WORKER_ENTRYPOINTS, SQL_KINDS, sha,
  GAP_NEW_TABLES, GAP_REPLACED_FUNCTIONS, GAP_SQL_KINDS, STAGES } from './apply-tjanst.mjs';

test('argumentvakter: --stage krävs, bevisfil under /private/tmp krävs, okända och blandade argument nekas', () => {
  assert.throws(() => parseArgs([]), /--stage/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.json']), /--stage etapp1\|gap krävs/u);
  assert.throws(() => parseArgs(['--sql-evidence', '/private/tmp/x.json', '--apply']), /--stage/u);
  assert.throws(() => parseArgs(['--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json', '--actual', '/private/tmp/b.json']), /--stage/u);
  for (const bad of ['etapp2', 'GAP', 'toString', '__proto__']) assert.throws(() => parseArgs(['--stage', bad, '--sql-evidence', '/private/tmp/x.json']), /--stage/u, bad);
  assert.throws(() => parseArgs(['--stage', '--sql-evidence', '/private/tmp/x.json']), /saknar värde/u);
  assert.throws(() => parseArgs(['--stage', 'gap', '--stage', 'etapp1', '--sql-evidence', '/private/tmp/x.json']), /Dubbelt/u);
  assert.equal(parseArgs(['--stage', 'gap', '--sql-evidence', '/private/tmp/x.json']).stage, 'gap');
  assert.equal(parseArgs(['--stage', 'gap', '--sql-evidence', '/private/tmp/x.json']).mode, 'rehearsal');
  assert.equal(parseArgs(['--stage', 'gap', '--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json', '--actual', '/private/tmp/b.json']).stage, 'gap');
  const E = ['--stage', 'etapp1'];
  assert.throws(() => parseArgs(E), /--sql-evidence/u);
  assert.throws(() => parseArgs([...E, '--apply']), /--sql-evidence/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/tmp/x.json']), /private\/tmp/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/private/tmp/../etc/x.json']), /private\/tmp/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/private/tmp/x.txt']), /private\/tmp/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/private/tmp/x.json', '--linked']), /Okänt/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/private/tmp/x.json', '--apply', '--apply']), /Dubbelt/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '--apply']), /saknar värde/u);
  assert.throws(() => parseArgs([...E, '--sql-evidence', '/private/tmp/x.json', '--actual', '/private/tmp/a.json']), /collect-evidence/u);
  assert.throws(() => parseArgs([...E, '--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json', '--actual', '/private/tmp/b.json', '--apply']), /kombineras/u);
  assert.throws(() => parseArgs([...E, '--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json']), /kräver/u);
  assert.equal(parseArgs([...E, '--sql-evidence', '/private/tmp/x.json']).mode, 'rehearsal');
  assert.equal(parseArgs([...E, '--sql-evidence', '/private/tmp/x.json', '--apply']).mode, 'apply');
  assert.deepEqual(parseArgs([...E, '--collect-evidence', '/private/tmp/e.json', '--reports', '/private/tmp/a.json,/private/tmp/b.json', '--actual', '/private/tmp/c.json']).reports,
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
  await assert.rejects(runInstallation(harness(db, 'rehearsal').args), /no migration of the stage recorded/u);
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
  const { before, after } = structures(), result = assertTransition(before, after, { stage: 'etapp1', functionCount: 2 });
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
  for (const [i, change] of deviations.entries()) { const a = structuredClone(after); change(a); assert.throws(() => assertTransition(before, a, { stage: 'etapp1', functionCount: a.functions.length - before.functions.length }), undefined, 'avvikelse ' + i); }
  assert.throws(() => assertTransition(before, after, { stage: 'etapp1', functionCount: 68 }), /Antal nya funktioner/u);
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
  assert.equal(requireEvidence(manifest, read, { stage: 'etapp1', migrations: e.migrations, baselineFingerprint: e.base }).actual.functionCount, 68);
  assert.throws(() => requireEvidence(manifest, read, { stage: 'etapp1', migrations: e.migrations, baselineFingerprint: 'other' }));
  assert.throws(() => requireEvidence(manifest, read, { stage: 'etapp1', migrations: { ...e.migrations, 'supabase/migrations/20261020110000_b.sql': 'h3' }, baselineFingerprint: e.base }));
  for (const change of [x => { x.files['/private/tmp/0'].status = 'FAIL'; }, x => { x.files['/private/tmp/1'].checks[0].ok = false; }, x => { x.files['/private/tmp/2'].cleanup.cleanup = 'pending'; },
    x => { x.files['/private/tmp/3'].mode = 'ephemeral'; }, x => { x.files['/private/tmp/actual'].status = 'FAIL'; }, x => { x.files['/private/tmp/actual'].notExecuted = ['x']; },
    x => { x.files['/private/tmp/actual'].grants.workerExecute = []; }, x => { x.files['/private/tmp/actual'].oidcCleanup.cleanup = 'failed'; },
    x => { x.files['/private/tmp/actual'].migrationSources = {}; }, x => { x.files['/private/tmp/0'].sources = {}; x.files['/private/tmp/0'].finalSources = {}; }]) {
    const x = evidence(); change(x); const m = manifestFor(x); assert.throws(() => requireEvidence(m.manifest, m.read, { stage: 'etapp1', migrations: x.migrations, baselineFingerprint: x.base }));
  }
  const tampered = manifestFor(e); tampered.manifest.actual.sha256 = 'c'.repeat(64);
  assert.throws(() => requireEvidence(tampered.manifest, tampered.read, { stage: 'etapp1', migrations: e.migrations, baselineFingerprint: e.base }), /ändrats/u);
});

// ---------- gapläget (05.1-13) ----------
test('gapläget har egna listor: en ny tabell, sex ersatta fasfunktioner, inga villkorsändringar, etapp 1 som föregående steg', () => {
  assert.deepEqual(GAP_NEW_TABLES, ['tjanst_self_mandates']); assert.equal(GAP_REPLACED_FUNCTIONS.length, 6); assert.deepEqual(GAP_SQL_KINDS, ['tjanst-gap-owned-database']);
  assert.deepEqual(STAGES.gap.migrations, ['supabase/migrations/20261021120000_tjanst_self_schools_joint_rules.sql']);
  assert.equal(STAGES.gap.prior.length, 7); assert.deepEqual(STAGES.gap.prior, STAGES.etapp1.migrations);
  assert.deepEqual(STAGES.gap.actualMigrations, [...STAGES.etapp1.migrations, ...STAGES.gap.migrations]);
  assert.deepEqual(STAGES.gap.constraintChanges, { removed: [], added: [] });
});

/** Falsk struktur efter etapp 1: fasfunktioner finns redan, och gapet lägger till en tabell, dess index och två stängda funktioner. */
function gapStructures() {
  const phase = ['tjanst_plan_read(jsonb)', 'tjanst_self_read(jsonb)', ...GAP_REPLACED_FUNCTIONS];
  const before = { tables: [{ relname: 'access_assignments', relkind: 'r', acl: 'a' }, { relname: 'tjanst_rows', relkind: 'r', acl: 'p' }],
    columns: [{ relname: 'access_assignments', attname: 'scope_kind' }, { relname: 'tjanst_rows', attname: 'id' }],
    constraints: [{ relname: 'access_assignments', conname: 'phase3_scope_kind', definition: "CHECK (scope_kind IN ('school','group','self'))" }],
    indexes: [{ tablename: 'tjanst_rows', indexname: 'tjanst_rows_pkey', indexdef: 'x' }], triggers: [{ relname: 'tjanst_rows', tgname: 't' }], policies: [],
    functions: [f('phase3_other(jsonb)'), ...phase.map(s => f(s))] };
  const after = structuredClone(before);
  after.tables.push({ relname: 'tjanst_self_mandates', relkind: 'r', acl: 'p' }, { relname: 'tjanst_self_mandates_pkey', relkind: 'i', acl: 'p' });
  after.columns.push({ relname: 'tjanst_self_mandates', attname: 'access_assignment_id' }, { relname: 'tjanst_self_mandates_pkey', attname: 'access_assignment_id' });
  after.indexes.push({ tablename: 'tjanst_self_mandates', indexname: 'tjanst_self_mandates_pkey', indexdef: 'y' });
  after.triggers.push({ relname: 'tjanst_self_mandates', tgname: 'tjanst_self_mandates_immutable' });
  after.constraints.push({ relname: 'tjanst_self_mandates', conname: 'tjanst_self_mandates_pkey', definition: 'PK' });
  after.functions = after.functions.map(x => GAP_REPLACED_FUNCTIONS.includes(x.signature) ? { ...x, definition: 'new' } : x);
  after.functions.push(f('tjanst_self_unit_ids(access_assignments)', 'n'), f('tjanst_self_mandates_guard()', 'n'));
  return { before, after, total: phase.length + 2 };
}

test('gaplägets strukturkontroll godtar exakt rättelsen och nekar varje avvikelse', () => {
  const { before, after, total } = gapStructures(), result = assertTransition(before, after, { stage: 'gap', functionCount: total });
  assert.deepEqual(result.addedTables, ['tjanst_self_mandates']); assert.deepEqual(result.replacedFunctions, [...GAP_REPLACED_FUNCTIONS].sort());
  assert.deepEqual(result.addedFunctions, ['tjanst_self_mandates_guard()', 'tjanst_self_unit_ids(access_assignments)']);
  assert.deepEqual(result.constraintChanges, { removed: [], added: [] });
  // Etapp 1:s listor passar inte gapet, och tvärtom.
  assert.throws(() => assertTransition(before, after, { stage: 'etapp1', functionCount: 2 }));
  assert.throws(() => assertTransition(before, after, { functionCount: total }), /--stage/u);
  const deviations = [
    a => { a.constraints[0].definition = "CHECK (scope_kind IN ('school','group'))"; },
    a => a.constraints.push({ relname: 'access_assignments', conname: 'extra', definition: 'x' }),
    a => a.columns.push({ relname: 'access_assignments', attname: 'binding_id' }),
    a => a.columns.push({ relname: 'tjanst_rows', attname: 'extra' }),
    a => a.tables.push({ relname: 'tjanst_other', relkind: 'r', acl: 'p' }),
    a => a.indexes.push({ tablename: 'tjanst_rows', indexname: 'tjanst_rows_extra', indexdef: 'z' }),
    a => a.triggers.push({ relname: 'tjanst_rows', tgname: 'extra' }),
    a => a.policies.push({ tablename: 'tjanst_rows', policyname: 'p' }),
    a => { a.functions.find(x => x.signature === 'tjanst_plan_read(jsonb)').definition = 'changed'; },
    a => { a.functions.find(x => x.signature === 'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)').definition = 'old'; },
    a => { a.functions.find(x => x.signature === 'tjanst_self_command(jsonb)').acl = '{postgres=X/postgres,anon=X/postgres}'; },
    a => { a.functions.find(x => x.signature === 'phase51_bind_self_person(access_assignments,uuid,uuid,uuid,uuid[])').owner = '11'; },
    a => a.functions.push(f('phase5_new(jsonb)', 'n')),
    a => { a.functions = a.functions.filter(x => x.signature !== 'tjanst_self_read(jsonb)'); },
  ];
  for (const [i, change] of deviations.entries()) {
    const a = structuredClone(after); change(a);
    assert.throws(() => assertTransition(before, a, { stage: 'gap', functionCount: a.functions.filter(x => /^(tjanst|phase51)_/u.test(x.signature)).length }), undefined, 'avvikelse ' + i);
  }
  assert.throws(() => assertTransition(before, after, { stage: 'gap', functionCount: total - 2 }), /tjanst_\/phase51_-funktioner/u);
  const empty = structuredClone(before); empty.functions = [f('phase3_other(jsonb)')];
  // Utan etapp 1:s fasfunktioner före finns inget att ersätta: kontrollen nekar redan på de ersatta funktionerna.
  assert.throws(() => assertTransition(empty, after, { stage: 'gap', functionCount: total }), /Ersatta funktioner|Föregående stegs/u);
});

function gapEvidence() {
  const gap = { 'supabase/migrations/20261021120000_gap.sql': 'g1' }, all = { 'supabase/migrations/20261020100000_a.sql': 'h1', ...gap }, base = 'fp';
  const files = {
    '/private/tmp/sql': { kind: 'tjanst-gap-owned-database', status: 'PASS', mode: 'schema-snapshot', checks: [{ ok: true }], sources: { ...gap, 'work/pilot/x.mjs': 'w' },
      finalSources: { ...gap, 'work/pilot/x.mjs': 'w' }, cleanup: { cleanup: 'complete' }, database: { dataCopied: false, sourceFingerprint: base } },
    '/private/tmp/actual': { kind: 'tjanst-actual-api-browser', status: 'PASS', checks: [{ ok: true }], notExecuted: [], playwrightOutcome: { stats: { unexpected: 0, flaky: 0 } },
      migrationSources: all, finalMigrationSources: all, pendingMigrations: Object.keys(gap), snapshot: { dataCopied: false, sourceFingerprint: base }, baselineFingerprint: base,
      installedFingerprint: 'x', finalFingerprint: 'x',
      grants: { workerExecute: [...WORKER_ENTRYPOINTS].sort(), clientRoleExecute: [], tablePrivileges: [], publicTablePrivileges: [], functionCount: 70 },
      oidcCleanup: { cleanup: 'complete' }, runtimeCleanup: { cleanup: 'complete' }, snapshotCleanup: { cleanup: 'complete' }, buildCopyRemoved: true,
      candidate: { revision: 'a'.repeat(40) }, sourceRevision: 'a'.repeat(40), finalArtifact: { fileCount: 3, sha256: 'b'.repeat(64) } } };
  files['/private/tmp/actual'].finalGrants = files['/private/tmp/actual'].grants;
  return { files, gap, all, base };
}
const gapManifest = (e, stage = 'gap') => { const bytes = p => Buffer.from(JSON.stringify(e.files[p]));
  return { read: bytes, manifest: { kind: 'tjanst-sql-evidence', schemaVersion: 1, stage, sql: { 'tjanst-gap-owned-database': { path: '/private/tmp/sql', sha256: sha(bytes('/private/tmp/sql')) } },
    actual: { path: '/private/tmp/actual', sha256: sha(bytes('/private/tmp/actual')) } } }; };

test('gaplägets bevis: gap-SQL-rapporten i schemakopia, och det faktiska provet med pendingMigrations = gap och migrationSources = alla', () => {
  const e = gapEvidence(), opts = x => ({ stage: 'gap', migrations: x.gap, actualMigrations: x.all, baselineFingerprint: x.base });
  { const { read, manifest } = gapManifest(e); assert.equal(requireEvidence(manifest, read, opts(e)).actual.functionCount, 70); }
  { const { read, manifest } = gapManifest(e, 'etapp1'); assert.throws(() => requireEvidence(manifest, read, opts(e)), /annat steg/u); }
  { const { read, manifest } = gapManifest(e); assert.throws(() => requireEvidence(manifest, read, { ...opts(e), stage: 'etapp1' })); }
  { const { read, manifest } = gapManifest(e); assert.throws(() => requireEvidence(manifest, read, { ...opts(e), actualMigrations: e.gap })); }
  for (const change of [x => { x.files['/private/tmp/actual'].pendingMigrations = []; }, x => { x.files['/private/tmp/actual'].pendingMigrations = Object.keys(x.all); },
    x => { x.files['/private/tmp/actual'].migrationSources = x.gap; x.files['/private/tmp/actual'].finalMigrationSources = x.gap; },
    x => { x.files['/private/tmp/sql'].sources = { 'work/pilot/x.mjs': 'w' }; x.files['/private/tmp/sql'].finalSources = { 'work/pilot/x.mjs': 'w' }; },
    x => { x.files['/private/tmp/sql'].sources['supabase/migrations/20261021120000_gap.sql'] = 'other'; x.files['/private/tmp/sql'].finalSources = x.files['/private/tmp/sql'].sources; },
    x => { x.files['/private/tmp/sql'].mode = 'ephemeral'; }, x => { x.files['/private/tmp/sql'].database.sourceFingerprint = 'old'; },
    x => { x.files['/private/tmp/sql'].kind = 'tjanst-plan-owned-database'; }]) {
    const x = gapEvidence(); change(x); const m = gapManifest(x); assert.throws(() => requireEvidence(m.manifest, m.read, opts(x)));
  }
});

test('gaplägets repetition gör aldrig commit: utan --apply en transaktion som rullas tillbaka', async () => {
  const opts = parseArgs(['--stage', 'gap', '--sql-evidence', '/private/tmp/x.json']); assert.equal(opts.mode, 'rehearsal');
  const db = fakeDb(), { report, args } = harness(db, opts.mode, { rehearse: async () => { db.state.schema = 'gap'; db.state.journal = 1; return { afterFingerprint: 'gap' }; } });
  await runInstallation(args);
  assert.deepEqual({ commits: db.state.commits, rollbacks: db.state.rollbacks, schema: db.state.schema, journal: db.state.journal }, { commits: 0, rollbacks: 1, schema: 'base', journal: 0 });
  assert.equal(report.committed, false); assert.equal(report.afterRehearsal.fingerprint, report.before.fingerprint);
});

// ---------- year: exact release evidence and isolated rehearsal ----------
import { withoutNewTables,SHARING_MIGRATIONS,SHARING_NEW_FUNCTIONS,SHARING_NEW_TABLES,SHARING_REPLACED_FUNCTIONS,SHARING_SQL_KINDS,RELEASES,TRIAL_MIGRATIONS,TRIAL_NEW_FUNCTIONS,TRIAL_REPLACED_FUNCTIONS,TRIAL_SQL_KINDS,YEAR_MIGRATIONS,YEAR_NEW_FUNCTIONS,YEAR_REPLACED_FUNCTIONS,YEAR_ENTRYPOINTS,YEAR_SQL_KINDS,
  assertYearTransition,requireYearEvidence,runOwnedYearRehearsal,runYearApply } from './apply-tjanst.mjs';
import { randomUUID } from 'node:crypto';
let auditSeq=0; // säkerhetsloggens id är heltal

test('year CLI: explicit apply is distinct, visual evidence mandatory, legacy gap remains eight migrations',()=>{
  assert.equal(parseArgs(['--stage','year','--sql-evidence','/private/tmp/y.json']).mode,'rehearsal');
  assert.equal(parseArgs(['--stage','year','--sql-evidence','/private/tmp/y.json','--apply']).mode,'apply');
  assert.throws(()=>parseArgs(['--stage','year','--collect-evidence','/private/tmp/y.json','--reports','/private/tmp/s.json','--actual','/private/tmp/a.json']),/visual-review/u);
  assert.equal(parseArgs(['--stage','year','--collect-evidence','/private/tmp/y.json','--reports','/private/tmp/s.json','--actual','/private/tmp/a.json','--visual-review','/private/tmp/v.json']).visualReview,'/private/tmp/v.json');
  assert.throws(()=>parseArgs(['--stage','gap','--sql-evidence','/private/tmp/y.json','--visual-review','/private/tmp/v.json']));
  assert.equal(STAGES.gap.actualMigrations.length,8);assert.deepEqual(STAGES.year.migrations,YEAR_MIGRATIONS);assert.equal(YEAR_MIGRATIONS.length,4);
});
function yearStructures(){
  const signatures=[...new Set([...WORKER_ENTRYPOINTS,...YEAR_REPLACED_FUNCTIONS])];
  while(signatures.length<70)signatures.push('tjanst_existing_'+signatures.length+'()');
  const before={tables:[{relname:'access_assignments',relkind:'r'}],columns:[{relname:'access_assignments',attname:'id'}],constraints:[],indexes:[],triggers:[],policies:[],
    functions:signatures.map(s=>f(s,'old',WORKER_ENTRYPOINTS.includes(s)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'))};
  const after=structuredClone(before);
  after.functions=after.functions.map(v=>({...v,definition:YEAR_REPLACED_FUNCTIONS.includes(v.signature)?'new':v.definition}));
  after.functions.push(...YEAR_NEW_FUNCTIONS.map(s=>f(s,'new',s==='tjanst_year_preview(jsonb)'?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}')));
  return {before,after};
}
test('year structure permits exactly sixteen new, seven changed functions and no other objects',()=>{
  const {before,after}=yearStructures();assert.equal(assertYearTransition(before,after).addedFunctions.length,16);
  const changes=[...['tables','columns','constraints','indexes','triggers','policies'].map(key=>a=>a[key].push({unexpected:true})),
    a=>{a.functions[0].owner='11';},a=>{a.functions[0].acl='{anon=X/postgres}';},a=>{a.functions[0].definition='unlisted';},
    a=>a.functions.pop(),a=>a.functions.push(f('tjanst_unlisted()')),a=>{a.functions.at(-1).acl='{postgres=X/postgres,skolplattform_worker=X/postgres}';},
    a=>{a.functions.at(-1).owner='11';},a=>{a.functions.find(v=>v.signature===YEAR_REPLACED_FUNCTIONS[0]).definition='old';},
    a=>{a.functions.find(v=>v.signature==='tjanst_year_preview(jsonb)').acl='{postgres=X/postgres}';}];
  for(const [i,change]of changes.entries()){const next=structuredClone(after);change(next);assert.throws(()=>assertYearTransition(before,next),undefined,'change '+i);}
  assert.throws(()=>assertYearTransition(before,after,{functionCount:85}));
  const rows={relations:[],functions:after.functions.flatMap(v=>['anon','authenticated','service_role','skolplattform_worker'].map(role=>({signature:v.signature,role,allowed:role==='skolplattform_worker'&&YEAR_ENTRYPOINTS.includes(v.signature),public_execute:false})))};
  assert.equal(assertPrivate(rows,YEAR_ENTRYPOINTS).privateFunctions,73);
  rows.functions.find(v=>v.signature==='tjanst_year_hash(text,jsonb)'&&v.role==='skolplattform_worker').allowed=true;
  assert.throws(()=>assertPrivate(rows,YEAR_ENTRYPOINTS));
});
function yearEvidence(stage='year'){
  const rel=RELEASES[stage];
  const H=sha('fixture'),revision='a'.repeat(40),projects=['desktop','desktop-small','phone','phone-small'],dimensions=[[1440,900],[1024,768],[390,664],[320,740]];
  const actualMigrations=Object.fromEntries(rel.actualMigrations.map(p=>[p,sha(p)])),migrations=Object.fromEntries(rel.migrations.map(p=>[p,sha(p)]));
  const products={'web/app/a.ts':H},verification={'work/pilot/v.mjs':H};
  const requiredCases=Object.fromEntries(projects.map((p,i)=>[p,Array.from({length:rel.caseCounts[i]},(_,n)=>p+'-case-'+n)]));
  const artifact={fileCount:1,files:[{path:'worker.js',bytes:4,sha256:H}],sha256:H};
  const a={kind:'tjanst-actual-api-browser',stage:'year',suiteVersion:'tjanst-year-actual-v1',status:'PASS',fullSuite:true,
    sourceRevision:revision,build:{mode:'protected',revision},candidate:{revision,mark:{revision}},
    sources:products,finalSources:products,verificationSources:verification,finalVerificationSources:verification,migrationSources:actualMigrations,finalMigrationSources:actualMigrations,
    pendingMigrations:rel.migrations,snapshot:{dataCopied:false,sourceFingerprint:H},baselineFingerprint:H,targetFingerprint:H,finalTargetFingerprint:H,targetUnchanged:true,
    targetJournal:{read:'read only',installed:rel.prior.map(p=>p.split('/').at(-1).slice(0,14)),unknown:[],missing:rel.migrations.map(p=>p.split('/').at(-1).slice(0,14)),
      fingerprint:{sha256:H,count:100,columns:['version','name','statements']},installedSources:rel.prior.map(p=>({version:p.split('/').at(-1).slice(0,14),name:p.split('/').at(-1).slice(15,-4),statementCount:1,sha256:actualMigrations[p]}))},
    installedFingerprint:H,finalFingerprint:H,grants:{workerExecute:[...YEAR_ENTRYPOINTS].sort(),workerExecuteCount:13,functionCount:rel.functionCount,closedFunctions:rel.privateFunctions,clientRoleExecute:[],tablePrivileges:[],publicTablePrivileges:[]},
    oidcCleanup:{cleanup:'complete',expectedFixtures:4,fixtures:[],verifiedCallbacks:0},runtimeCleanup:{cleanup:'complete'},snapshotCleanup:{cleanup:'complete'},buildCopyRemoved:true,originalArtifactPreserved:true,
    originalArtifact:artifact,finalOriginalArtifact:artifact,finalArtifact:artifact,runtime:{artifact},projects,requiredCases,playwright:{code:0},
    playwrightOutcome:{stats:{unexpected:0,flaky:0},tests:projects.map(project=>({project,retries:0,status:'passed',expected:'passed'}))},notExecuted:[],checks:[],browserEvidence:{},browsers:{},foreignCanary:{},oidcEvidence:{},casesPerProject:{}};
  a.finalTargetJournal=structuredClone(a.targetJournal);a.finalGrants=structuredClone(a.grants);
  const files={},visual={kind:'tjanst-year-visual-review',status:'PASS',candidateRevision:revision,screenshots:[]};
  for(const [i,p]of projects.entries()){
    const browser={name:p.startsWith('phone')?'webkit':'chromium',version:'1',viewport:{width:dimensions[i][0],height:dimensions[i][1]}};
    const canary={before:{sha256:H,customerId:randomUUID(),counts:{people:1,employments:1,duties:1,versions:1,specials:1}},unchanged:true};canary.after=structuredClone(canary.before);
    const checks=requiredCases[p].map(name=>({case:name,ok:true}));a.checks.push(...checks.map(c=>({...c,project:p})));
    const screenshot={file:p+'.png',sha256:sha('pixels')};files['/private/tmp/year/'+p+'.png']=Buffer.from('pixels');
    visual.screenshots.push({path:'/private/tmp/year/'+p+'.png',sha256:screenshot.sha256,review:'approved'});
    const result={status:'PASS',project:p,checks,errors:[],browser,foreignCanary:canary,screenshots:[screenshot]};
    const path='/private/tmp/year/browser-'+p+'.json';files[path]=result;a.browserEvidence[p]={path,result,screenshotHashes:{[screenshot.file]:screenshot.sha256}};
    a.browsers[p]=browser;a.foreignCanary[p]=canary;a.casesPerProject[p]={required:checks.length,passed:checks.length};
    const roles=p==='desktop'?['hm','principalA','principalB','principalAB','admin','teacherSelf']:p==='desktop-small'?['hm','principalA','admin']:['hm','principalA','principalB','teacherSelf'];
    const auth=roles.map(role=>{const id=randomUUID();return{id,role,status:'verified',stepUp:false,proof:{proofKind:'browser-return-and-server-audit',attemptId:id,callbackId:randomUUID(),auditId:String(++auditSeq),sessionId:randomUUID(),httpStatus:302}};});
    const oidcPath='/private/tmp/year/oidc-'+p+'.json',oidc={status:'PASS',databaseClosed:true,cleanup:{cleanup:'complete',verifiedCallbacks:auth.length},proof:{cleanup:'complete',auth}};
    files[oidcPath]=oidc;a.oidcEvidence[p]={path:oidcPath,requiredRoles:roles,result:oidc};
    a.oidcCleanup.fixtures.push({project:p,cleanup:'complete',verifiedCallbacks:auth.length});a.oidcCleanup.verifiedCallbacks+=auth.length;
  }
  const sql=Object.fromEntries(rel.sqlKinds.map((kind,i)=>{const path='/private/tmp/year/sql-'+i+'.json';files[path]={kind,status:'PASS',mode:'schema-snapshot',...(rel.uncheckedStage.includes(kind)?{}:{requestedStage:'current'}),checks:[{ok:true}],database:{dataCopied:false,sourceFingerprint:H},cleanup:'complete',snapshotCleanup:{cleanup:'complete'},targetUnchanged:true,sources:{...actualMigrations,...verification},finalSources:{...actualMigrations,...verification},pendingMigrations:rel.migrations};return[kind,{path}];}));
  const context={baselineFingerprint:H,journalFingerprint:H,migrations,actualMigrations,products,verification,requiredCases,artifact,stage,
    sourceHash:p=>({...actualMigrations,...products,...verification})[p],commitHash:(_revision,p)=>({...actualMigrations,...products,...verification})[p]};
  return {a,files,visual,sql,context};
}
function yearManifest(e){
  const bytes=p=>Buffer.isBuffer(e.files[p])?e.files[p]:Buffer.from(JSON.stringify(e.files[p]));
  for(const ref of [...Object.values(e.a.browserEvidence),...Object.values(e.a.oidcEvidence),...Object.values(e.sql)])ref.sha256=sha(bytes(ref.path));
  e.files['/private/tmp/year/actual.json']=e.a;const actual={path:'/private/tmp/year/actual.json',sha256:sha(bytes('/private/tmp/year/actual.json'))};
  e.visual.actualReportSha256=actual.sha256;e.files['/private/tmp/year/visual.json']=e.visual;
  const manifest={kind:'tjanst-sql-evidence',schemaVersion:2,stage:e.context.stage,migrations:e.context.migrations,actualMigrations:e.context.actualMigrations,baselineFingerprint:e.context.baselineFingerprint,
    sql:e.sql,actual,visualReview:{path:'/private/tmp/year/visual.json',sha256:sha(bytes('/private/tmp/year/visual.json'))}};
  return {manifest,read:bytes};
}
test('year exact evidence accepts all four SQL reports, 83 actual cases, callbacks, images and artifact',()=>{
  const e=yearEvidence(),m=yearManifest(e);const r=requireYearEvidence(m.manifest,m.read,e.context);assert.equal(r.actual.checks,83);assert.equal(Object.keys(r.sql).length,4);assert.equal(r.callbacks.length,4);
});
test('year rejects mismatched revisions, stale source/SQL/artifact, missing or duplicate cases, retries and unsafe cleanup/ACL',()=>{
  const changes=[
    e=>{e.a.sourceRevision='b'.repeat(40);},e=>{e.a.build.revision='b'.repeat(40);},e=>{e.a.candidate.mark.revision='b'.repeat(40);},
    e=>{e.context.sourceHash=()=>sha('changed');},e=>{e.context.commitHash=()=>sha('other commit');},e=>{e.a.finalVerificationSources={};},
    e=>{e.context.artifact={...e.context.artifact,sha256:sha('other build')};},e=>{e.a.finalOriginalArtifact={};},e=>{e.a.originalArtifactPreserved=false;},
    e=>{e.a.fullSuite=false;},e=>{e.a.projects=e.a.projects.slice(0,3);},e=>{e.a.checks.pop();},e=>{e.a.browserEvidence.desktop.result.checks[1].case=e.a.browserEvidence.desktop.result.checks[0].case;},
    e=>{e.a.requiredCases={};},e=>{e.a.playwrightOutcome.tests[0].retries=1;},e=>{e.a.playwrightOutcome.tests[0].status='skipped';},
    e=>{e.a.grants.workerExecute.pop();},e=>{e.a.grants.functionCount=85;},e=>{e.a.grants.tablePrivileges=['tjanst_rows:authenticated'];},
    e=>{e.a.runtimeCleanup.cleanup='failed';},e=>{e.a.buildCopyRemoved=false;},e=>{e.a.targetUnchanged=false;},e=>{e.a.finalTargetJournal.fingerprint.sha256=sha('changed');},
    e=>{e.a.targetJournal.installedSources[0].sha256=sha('changed');},e=>{e.context.journalFingerprint=sha('changed');},
    e=>{e.a.foreignCanary.phone.before.counts.people=0;e.a.foreignCanary.phone.after.counts.people=0;},e=>{e.a.browsers.phone.name='chromium';},
    e=>{e.a.oidcEvidence.desktop.result.proof.auth[0].status='started';},e=>{e.a.oidcEvidence.desktop.result.proof.auth[0].stepUp=true;},
    e=>{e.a.oidcEvidence.desktop.result.proof.auth[1].proof.auditId=e.a.oidcEvidence.desktop.result.proof.auth[0].proof.auditId;},
    e=>{e.a.oidcCleanup.fixtures[0].verifiedCallbacks--;},e=>{e.visual.screenshots.pop();},e=>{e.visual.screenshots[0].review='pending';},
    e=>{e.files['/private/tmp/year/desktop.png']=Buffer.from('different pixels');},
    e=>{e.files[e.sql[YEAR_SQL_KINDS[0]].path].requestedStage='historical';},e=>{e.files[e.sql[YEAR_SQL_KINDS[1]].path].snapshotCleanup.cleanup='failed';},
    e=>{e.files[e.sql[YEAR_SQL_KINDS[2]].path].sources={};},e=>{delete e.sql[YEAR_SQL_KINDS[3]];},
  ];
  for(const [i,change]of changes.entries()){const e=yearEvidence();change(e);const m=yearManifest(e);assert.throws(()=>requireYearEvidence(m.manifest,m.read,e.context),undefined,'tamper '+i);}
  const e=yearEvidence(),m=yearManifest(e);m.manifest.actual.sha256=sha('wrong');assert.throws(()=>requireYearEvidence(m.manifest,m.read,e.context));
});
function ownedHarness(){
  const db=fakeDb(),report={},events=[],target={fingerprint:'base',rows:{people:{count:5,hash:'unchanged'}},journal:['old']};
  const args={report,readTarget:async()=>{events.push('read-only-target');return structuredClone(target);},
    createSnapshot:async()=>{events.push('own-copy');return{db,provenance:{dataCopied:false,sourceFingerprint:'base',database:'named_timplan_'+'a'.repeat(32)},cleanup:async()=>{events.push('cleanup');return{cleanup:'complete'};}};},
    seed:async()=>{events.push('synthetic-seed');db.state.journal=8;return{synthetic:true};},
    preserve:async()=>({published:{count:1,hash:'pub'},mandates:{count:2,hash:'mandates'},rows:{people:{count:1,hash:'person'}},journalHash:String(db.state.journal)}),
    structure:async()=>({schema:db.state.schema}),migrate:async()=>{db.state.schema='year';},checkInstalled:async()=>({afterFingerprint:'year'})};
  return {db,report,args,events,target};
}
test('year rehearsal seeds its owned copy, rolls back DDL and journal, cleans up, never gets a writable target',async()=>{
  const h=ownedHarness();await runOwnedYearRehearsal(h.args);assert.equal(h.report.committed,false);assert.equal(h.report.targetUnchanged,true);
  assert.equal(h.db.state.schema,'base');assert.equal(h.db.state.journal,8);assert.equal(h.db.state.commits,1);assert.equal(h.db.state.rollbacks,1);
  assert.deepEqual(h.events,['read-only-target','own-copy','synthetic-seed','cleanup','read-only-target']);assert.equal(h.report.preservation.rollback,true);
});
test('year cleanup and target recheck still happen after failure; empty copy, leaks and target drift fail',async()=>{
  for(const fail of ['migrate','preserve','empty','drift']){
    const h=ownedHarness();
    if(fail==='migrate')h.args.migrate=async()=>{h.db.state.schema='half';throw Error('injected');};
    if(fail==='preserve')h.args.preserve=async()=>({published:{count:1},mandates:{count:1},rows:{},journalHash:h.db.state.schema});
    if(fail==='empty')h.args.preserve=async()=>({published:{count:0},mandates:{count:0},rows:{}});
    if(fail==='drift')h.args.migrate=async()=>{h.db.state.schema='year';h.target.rows.people.hash='changed';};
    await assert.rejects(runOwnedYearRehearsal(h.args));assert.ok(h.events.includes('cleanup'));assert.equal(h.events.at(-1),'read-only-target');assert.equal(h.db.state.schema,'base');
  }
});
test('year apply opens a writable target only when explicitly requested and after rehearsal/evidence gates',async()=>{
  let connects=0,validations=0;const db=fakeDb();
  const report={targetUnchanged:true,preservation:{rollback:true},cleanup:{cleanup:'complete'},targetBefore:{columns:{},rows:{},invalidPublishedJoints:{groups:0}}};
  const args={report,revalidate:async()=>{validations++;},connect:async()=>{connects++;db.end=async()=>{};return db;},install:async()=>{db.state.schema='year';return{afterFingerprint:'year'};},
    readAfter:async()=>{throw Error('test must provide the expected installed journal');}};
  await runYearApply({...args,mode:'rehearsal'});assert.equal(connects,0);assert.equal(validations,0);
  await assert.rejects(runYearApply({...args,mode:'apply',report:{...report,cleanup:{cleanup:'failed'}}}));assert.equal(connects,0);
  await assert.rejects(runYearApply({...args,mode:'apply',revalidate:async()=>{throw Error('artifact changed');}}),/artifact changed/u);assert.equal(connects,0);
  // Inject real frozen source hashes for the exact twelve journal entries, without a database or target access.
  const {currentMigrationSources}=await import('./apply-tjanst.mjs');
  args.readAfter=async()=>({...report.targetBefore,fingerprint:'year',journal:STAGES.year.actualMigrations.map(p=>({version:p.split('/').at(-1).slice(0,14),sha256:currentMigrationSources([p])[p]}))});
  await runYearApply({...args,mode:'apply'});assert.equal(connects,1);assert.equal(db.state.commits,1);assert.equal(report.committed,true);
  const bad=fakeDb();bad.end=async()=>{};
  await assert.rejects(runYearApply({...args,mode:'apply',connect:async()=>bad,install:async()=>{bad.state.schema='half';throw Error('rollback');}}),/rollback/u);
  assert.equal(bad.state.commits,0);assert.equal(bad.state.schema,'base');
});

// ---------- trial (05.1-28): användarprovets rättelser efter year ----------
test('trial: två migrationer efter year, egen bevisfil och visuell granskning krävs',()=>{
  assert.deepEqual(STAGES.trial.prior,STAGES.year.actualMigrations);assert.deepEqual(STAGES.trial.migrations,TRIAL_MIGRATIONS);assert.equal(STAGES.trial.actualMigrations.length,14);
  assert.equal(parseArgs(['--stage','trial','--sql-evidence','/private/tmp/t.json','--apply']).mode,'apply');
  assert.throws(()=>parseArgs(['--stage','trial','--collect-evidence','/private/tmp/t.json','--reports','/private/tmp/s.json','--actual','/private/tmp/a.json']),/visual-review/u);
  assert.equal(RELEASES.trial.journalCount,14);assert.deepEqual(RELEASES.trial.opened,[]);
});
test('trial struktur: exakt en ny stängd funktion och tre ersatta, inga nya ingångar',()=>{
  const signatures=[...new Set([...WORKER_ENTRYPOINTS,'tjanst_year_preview(jsonb)',...TRIAL_REPLACED_FUNCTIONS])];
  while(signatures.length<86)signatures.push('tjanst_existing_'+signatures.length+'()');
  const before={tables:[],columns:[],constraints:[],indexes:[],triggers:[],policies:[],
    functions:signatures.map(s=>f(s,'old',YEAR_ENTRYPOINTS.includes(s)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'))};
  const after=structuredClone(before);after.functions=after.functions.map(v=>({...v,definition:TRIAL_REPLACED_FUNCTIONS.includes(v.signature)?'new':v.definition}));
  after.functions.push(f(TRIAL_NEW_FUNCTIONS[0],'new','{postgres=X/postgres}'));
  const o={functionCount:87,stage:'trial'};assert.deepEqual(assertYearTransition(before,after,o).addedFunctions,TRIAL_NEW_FUNCTIONS);
  for(const change of [a=>{a.functions.at(-1).acl='{postgres=X/postgres,skolplattform_worker=X/postgres}';},a=>{a.functions.find(v=>v.signature===TRIAL_REPLACED_FUNCTIONS[2]).definition='old';},
    a=>a.functions.push(f('tjanst_unlisted()')),a=>a.constraints.push({unexpected:true})]){const next=structuredClone(after);change(next);assert.throws(()=>assertYearTransition(before,next,o));}
  assert.throws(()=>assertYearTransition(before,after,{functionCount:86,stage:'trial'}));assert.throws(()=>assertYearTransition(before,after));
});
test('trial bevis: 85 fall, sex SQL-rapporter, pending = två migrationer; year-bevis godtas inte',()=>{
  const e=yearEvidence('trial'),m=yearManifest(e);const r=requireYearEvidence(m.manifest,m.read,e.context);
  assert.equal(r.actual.checks,85);assert.equal(r.actual.functionCount,87);assert.deepEqual(Object.keys(r.sql).sort(),[...TRIAL_SQL_KINDS].sort());
  for(const change of [e=>{e.a.pendingMigrations=YEAR_MIGRATIONS;},e=>{e.a.grants.closedFunctions=73;},e=>{delete e.sql['tjanst-class-apl'];},
    e=>{e.a.checks.pop();},e=>{e.context.stage='year';}]){const x=yearEvidence('trial');change(x);const y=yearManifest(x);assert.throws(()=>requireYearEvidence(y.manifest,y.read,x.context));}
  const y=yearEvidence('year'),ym=yearManifest(y);assert.throws(()=>requireYearEvidence(ym.manifest,ym.read,{...y.context,stage:'trial'}));
});

// ---------- sharing (05.1-33 / D-31): delning och betygsansvar per behov efter trial ----------
test('sharing: en migration efter trial, femton journalposter och egen bevisfil',()=>{
  assert.deepEqual(STAGES.sharing.prior,STAGES.trial.actualMigrations);assert.deepEqual(STAGES.sharing.migrations,SHARING_MIGRATIONS);assert.equal(STAGES.sharing.actualMigrations.length,15);
  assert.equal(parseArgs(['--stage','sharing','--sql-evidence','/private/tmp/t.json','--apply']).mode,'apply');
  assert.throws(()=>parseArgs(['--stage','sharing','--collect-evidence','/private/tmp/t.json','--reports','/private/tmp/s.json','--actual','/private/tmp/a.json']),/visual-review/u);
  assert.equal(RELEASES.sharing.journalCount,15);assert.deepEqual(RELEASES.sharing.opened,[]);assert.equal(RELEASES.sharing.functionCount,89);assert.equal(RELEASES.sharing.privateFunctions,76);
});
function sharingStructures(){
  const signatures=[...new Set([...WORKER_ENTRYPOINTS,'tjanst_year_preview(jsonb)',...SHARING_REPLACED_FUNCTIONS])];
  while(signatures.length<87)signatures.push('tjanst_existing_'+signatures.length+'()');
  const before={tables:[{relname:'tjanst_versions',relkind:'r',relrowsecurity:true,relforcerowsecurity:true}],columns:[{relname:'tjanst_versions',attname:'id'}],
    constraints:[{relname:'tjanst_versions',conname:'tjanst_versions_pkey'}],indexes:[{tablename:'tjanst_versions',indexname:'tjanst_versions_pkey'}],
    triggers:[{relname:'tjanst_versions',tgname:'g',definition:'x'}],policies:[],
    functions:signatures.map(s=>f(s,'old',YEAR_ENTRYPOINTS.includes(s)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'))};
  const after=structuredClone(before);after.functions=after.functions.map(v=>({...v,definition:SHARING_REPLACED_FUNCTIONS.includes(v.signature)?'new':v.definition}));
  after.functions.push(...SHARING_NEW_FUNCTIONS.map(s=>f(s,'new','{postgres=X/postgres}')));
  for(const t of SHARING_NEW_TABLES){after.tables.push({relname:t,relkind:'r',relrowsecurity:true,relforcerowsecurity:true},{relname:t+'_pkey',relkind:'i'});
    after.columns.push({relname:t,attname:'version_id'});after.constraints.push({relname:t,conname:t+'_pkey'});after.indexes.push({tablename:t,indexname:t+'_pkey'});
    after.triggers.push({relname:t,tgname:t+'_guard',definition:'CREATE TRIGGER x BEFORE INSERT ON public.'+t+' FOR EACH ROW EXECUTE FUNCTION tjanst_version_guard()'});}
  return {before,after};
}
test('sharing struktur: två stängda tabeller, två stängda funktioner, tio ersatta och inga ändringar på befintliga relationer',()=>{
  const {before,after}=sharingStructures(),o={functionCount:89,stage:'sharing'},r=assertYearTransition(before,after,o);
  assert.deepEqual(r.addedFunctions,[...SHARING_NEW_FUNCTIONS].sort());assert.deepEqual(r.addedTables,[...SHARING_NEW_TABLES].sort());assert.equal(r.replacedFunctions.length,10);
  for(const change of [a=>{a.functions.at(-1).acl='{postgres=X/postgres,skolplattform_worker=X/postgres}';},a=>{a.functions.find(v=>v.signature===SHARING_REPLACED_FUNCTIONS[4]).definition='old';},
    a=>a.functions.push(f('tjanst_unlisted()')),a=>a.constraints.push({unexpected:true}),a=>a.columns.push({relname:'tjanst_versions',attname:'extra'}),
    a=>{a.tables.find(t=>t.relname==='tjanst_need_sharing').relforcerowsecurity=false;},a=>a.policies.push({tablename:'tjanst_need_graders',policyname:'open'}),
    a=>{a.triggers=a.triggers.filter(t=>t.relname!=='tjanst_need_graders');},a=>a.tables.push({relname:'tjanst_extra',relkind:'r',relrowsecurity:true,relforcerowsecurity:true}),
    a=>{a.triggers[0].definition='changed';}]){const next=structuredClone(after);change(next);assert.throws(()=>assertYearTransition(before,next,o));}
  const pre=structuredClone(before);pre.tables.push({relname:'tjanst_need_sharing',relkind:'r'});assert.throws(()=>assertYearTransition(pre,after,o),/finns redan/u);
  assert.throws(()=>assertYearTransition(before,after,{functionCount:87,stage:'trial'}));
});
test('sharing bevis: 88 fall, fem SQL-rapporter, pending = en migration; trial-bevis godtas inte',()=>{
  const e=yearEvidence('sharing'),m=yearManifest(e);const r=requireYearEvidence(m.manifest,m.read,e.context);
  assert.equal(r.actual.checks,88);assert.equal(r.actual.functionCount,89);assert.deepEqual(Object.keys(r.sql).sort(),[...SHARING_SQL_KINDS].sort());
  for(const change of [e=>{e.a.pendingMigrations=TRIAL_MIGRATIONS;},e=>{e.a.grants.closedFunctions=74;},e=>{delete e.sql['tjanst-need-sharing'];},
    e=>{e.a.checks.pop();},e=>{e.context.stage='trial';}]){const x=yearEvidence('sharing');change(x);const y=yearManifest(x);assert.throws(()=>requireYearEvidence(y.manifest,y.read,x.context));}
  const y=yearEvidence('trial'),ym=yearManifest(y);assert.throws(()=>requireYearEvidence(ym.manifest,ym.read,{...y.context,stage:'sharing'}));
});
test('sharing bevarande: nya tomma tabeller godtas, rader i dem eller ändrade befintliga tabeller godtas inte',()=>{
  const before={columns:{tjanst_rows:['id']},rows:{tjanst_rows:{count:2,hash:'a'}},mandates:{count:1},published:{count:1}};
  const after={columns:{...before.columns,tjanst_need_sharing:['version_id']},rows:{...before.rows,tjanst_need_sharing:{count:0,hash:'d41d8cd98f00b204e9800998ecf8427e'}},mandates:before.mandates,published:before.published};
  assert.deepEqual(withoutNewTables(after,SHARING_NEW_TABLES),before);assert.notDeepEqual(withoutNewTables(after,[]),before);
  assert.throws(()=>withoutNewTables({...after,rows:{...after.rows,tjanst_need_sharing:{count:1,hash:'x'}}},SHARING_NEW_TABLES),/har rader/u);
  assert.notDeepEqual(withoutNewTables({...after,rows:{...after.rows,tjanst_rows:{count:3,hash:'b'}}},SHARING_NEW_TABLES),before);
});
