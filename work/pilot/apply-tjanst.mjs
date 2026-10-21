#!/usr/bin/env node
// 05.1-10: installation av tjänstefördelningens migrationer i den skyddade lokala databasen.
// Mönster: apply-apl-central-content.mjs (repetition med återrullning → godkännande → --apply).
//
// 05.1-13: --stage etapp1|gap krävs. etapp1 är 05.1-10:s installation (historik); gap är rättelsen för CR-01 och WR-02
// (tjanstGapMigrations), som förutsätter att alla etapp 1-versioner redan är journalförda.
//
// Bevisfil (en gång, efter SQL-proven och det faktiska provet):
//   node work/pilot/apply-tjanst.mjs --stage etapp1|gap --collect-evidence /private/tmp/tjanst-sql-evidence.json \
//     --reports /private/tmp/a.json,/private/tmp/b.json,... --actual /private/tmp/tjanst-actual.json
// Repetition (rullas alltid tillbaka) respektive installation:
//   node work/pilot/apply-tjanst.mjs --stage etapp1|gap --sql-evidence /private/tmp/tjanst-sql-evidence.json [--apply] [--out /private/tmp/x.json]
//
// Utan --apply körs stegets migrationer i en transaktion som alltid rullas tillbaka.
// --apply upprepar först samma repetition och installerar sedan i en egen transaktion med advisory lock,
// där samma kontroller körs igen och versionerna journalförs i supabase_migrations.schema_migrations.
// Inga anslutningsuppgifter, nycklar eller rader skrivs ut; rapporten innehåller bara antal, namn och hashar.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tjanstEtapp1Migrations, tjanstGapMigrations, tjanstMigrations as allTjanstMigrations } from './tjanst-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const sha = v => createHash('sha256').update(v).digest('hex');
export const versionsOf = list => list.map(p => p.split('/').pop().slice(0, 14));
/** Etapp 1:s versioner (historik från 05.1-10). */
export const versions = versionsOf(tjanstEtapp1Migrations);
const ROLLBACK = Error('tjanst_rehearsal_rollback');

/** Fasens fjorton nya tabeller (personal och tjänstefördelning). */
export const NEW_TABLES = ['staff_employments', 'staff_people', 'staff_person_bindings', 'staff_school_duties', 'tjanst_commands',
  'tjanst_distributions', 'tjanst_feedback', 'tjanst_joint_groups', 'tjanst_joint_members', 'tjanst_joint_teacher_time', 'tjanst_rows',
  'tjanst_special_assignments', 'tjanst_version_teachers', 'tjanst_versions'];
/** Befintliga funktioner som får ny definition: mandatform, mandatinsättning, klass–timplanskontrollen och de nio elevfunktionerna. */
export const REPLACED_FUNCTIONS = ['phase3_insert_mandate(uuid,jsonb)', 'phase3_mandate_shape(access_assignments)', 'phase3_probe_scope()',
  'phase4_card_row(jsonb)', 'phase4_export_pupils(jsonb,boolean)', 'phase4_list_pupils(jsonb)', 'phase4_pupil_card(jsonb)',
  'phase4_pupil_history(jsonb)', 'phase4_register_selection()', 'phase4_reveal_personal_number(jsonb)', 'phase4_validate_selection(jsonb)',
  'validate_class_timplan()'];
/** De tolv öppna entrypointsen för skolplattform_worker (samma lista som verify-tjanst-actual.mjs). */
export const WORKER_ENTRYPOINTS = ['phase51_grim_class_command(jsonb)', 'phase51_grim_class_underlag(jsonb)',
  'tjanst_personal_command(jsonb)', 'tjanst_personal_read(jsonb)', 'tjanst_personal_status(jsonb)',
  'tjanst_plan_command(jsonb)', 'tjanst_plan_read(jsonb)', 'tjanst_plan_status(jsonb)',
  'tjanst_self_command(jsonb)', 'tjanst_self_read(jsonb)', 'tjanst_self_status(jsonb)', 'tjanst_staffing_read(jsonb)'];
/** Den enda befintliga tabell som får ändrade villkor: self läggs till i scope_kind, och self kräver lärarfunktion. */
export const CONSTRAINT_CHANGES = { removed: ['access_assignments.phase3_scope_kind'], added: ['access_assignments.phase3_scope_kind', 'access_assignments.phase51_self_scope'] };
export const SQL_KINDS = ['grim-class-timplans-owned-database', 'tjanst-personal-owned-database', 'tjanst-plan-owned-database',
  'tjanst-self-owned-database', 'tjanst-person-account-owned-database'];
/** Gaprättelsen (05.1-11): en ny tabell och sex befintliga fasfunktioner med ny definition. */
export const GAP_NEW_TABLES = ['tjanst_self_mandates'];
export const GAP_REPLACED_FUNCTIONS = ['phase51_bind_self_person(access_assignments,uuid,uuid,uuid,uuid[])', 'tjanst_self_person(access_assignments)',
  'tjanst_self_projection(access_assignments)', 'tjanst_self_command(jsonb)', 'tjanst_plan_save_row(access_assignments,tjanst_distributions,jsonb)',
  'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)'];
export const GAP_SQL_KINDS = ['tjanst-gap-owned-database'];
/**
 * Stegen. migrations installeras; prior ska redan vara journalförda med exakt samma källor; actualMigrations är det
 * faktiska provets migrationSources; functionTotal: grants.functionCount är totalen tjanst_/phase51_-funktioner efter
 * installationen (gap) i stället för antalet nya (etapp1, där inga fanns före).
 */
export const STAGES = {
  etapp1: { migrations: tjanstEtapp1Migrations, prior: [], actualMigrations: tjanstEtapp1Migrations, newTables: NEW_TABLES,
    replacedFunctions: REPLACED_FUNCTIONS, constraintChanges: CONSTRAINT_CHANGES, sqlKinds: SQL_KINDS, functionTotal: false, selfLinks: false },
  gap: { migrations: tjanstGapMigrations, prior: tjanstEtapp1Migrations, actualMigrations: allTjanstMigrations, newTables: GAP_NEW_TABLES,
    replacedFunctions: GAP_REPLACED_FUNCTIONS, constraintChanges: { removed: [], added: [] }, sqlKinds: GAP_SQL_KINDS, functionTotal: true, selfLinks: true },
};
const stageOf = name => { assert.ok(Object.hasOwn(STAGES, name ?? ''), '--stage etapp1|gap krävs'); return STAGES[name]; };
const ROLES = ['anon', 'authenticated', 'service_role', 'skolplattform_worker'];
const fn = s => s.replace(/^public\./u, '').replaceAll(', ', ',').replaceAll('public.', '');
const isNewFunction = s => /^(tjanst|phase51)_/u.test(fn(s));
const sorted = list => [...list].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

// ---------- argument ----------
const privatePath = (flag, value) => { assert.ok(value && resolve(value).startsWith('/private/tmp/') && value.endsWith('.json'), `${flag} /private/tmp/<namn>.json krävs`); return resolve(value); };
export function parseArgs(argv) {
  const known = new Set(['--stage', '--sql-evidence', '--apply', '--out', '--collect-evidence', '--reports', '--actual']);
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; assert.ok(known.has(a), 'Okänt argument: ' + a); assert.ok(!(a in o), 'Dubbelt argument: ' + a);
    if (a === '--apply') { o[a] = true; continue; }
    const v = argv[++i]; assert.ok(v && !v.startsWith('--'), a + ' saknar värde'); o[a] = v;
  }
  const stage = o['--stage']; stageOf(stage);
  if (o['--collect-evidence']) {
    assert.ok(!o['--apply'] && !o['--sql-evidence'] && !o['--out'], '--collect-evidence kan inte kombineras med --apply, --sql-evidence eller --out');
    assert.ok(o['--reports'] && o['--actual'], '--collect-evidence kräver --reports och --actual');
    return { mode: 'collect', stage, out: privatePath('--collect-evidence', o['--collect-evidence']),
      reports: o['--reports'].split(',').map(p => privatePath('--reports', p)), actual: privatePath('--actual', o['--actual']) };
  }
  assert.ok(!o['--reports'] && !o['--actual'], '--reports och --actual hör bara till --collect-evidence');
  assert.ok(o['--sql-evidence'], '--sql-evidence /private/tmp/<namn>.json krävs');
  const mode = o['--apply'] ? 'apply' : 'rehearsal';
  return { mode, stage, evidencePath: privatePath('--sql-evidence', o['--sql-evidence']),
    out: o['--out'] ? privatePath('--out', o['--out']) : `/private/tmp/tjanst-${stage}-${mode}-${Date.now()}.json` };
}

export function currentMigrationSources(list = tjanstEtapp1Migrations, read = p => readFileSync(resolve(root, p))) {
  return Object.fromEntries(list.map(p => [p, sha(read(p))]));
}

// ---------- bevis ----------
/**
 * Prövar SQL-rapporterna och den faktiska rapporten mot aktuella migrationskällor och skyddade måls schema.
 * migrations: källorna som installeras; actualMigrations: hela källmängden det faktiska provet ska ha installerat i sin schemakopia.
 */
export function requireEvidence(manifest, read, { stage, migrations, actualMigrations = migrations, baselineFingerprint }) {
  const s = stageOf(stage);
  assert.equal(manifest.kind, 'tjanst-sql-evidence'); assert.equal(manifest.schemaVersion, 1);
  if (stage !== 'etapp1' || manifest.stage !== undefined) assert.equal(manifest.stage, stage, 'Bevisfilen gäller ett annat steg');
  const summary = { sql: {}, actual: null }, covered = new Set();
  assert.deepEqual(sorted(Object.keys(manifest.sql ?? {})), sorted(s.sqlKinds), 'Bevisfilen ska ha exakt stegets SQL-rapporter');
  for (const kind of s.sqlKinds) {
    const { path, sha256 } = manifest.sql[kind], bytes = read(path); assert.equal(sha(bytes), sha256, 'SQL-rapporten har ändrats: ' + path);
    const r = JSON.parse(bytes);
    assert.equal(r.kind, kind); assert.equal(r.status, 'PASS', kind + ' är inte PASS'); assert.equal(r.mode, 'schema-snapshot', kind + ' ska vara provad mot schemakopia av målet');
    assert.ok(Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every(c => c.ok === true), kind + ': kontroller saknas eller fallerade');
    assert.deepEqual(r.finalSources, r.sources, kind + ': källor ändrades under provet');
    assert.equal(r.cleanup?.cleanup, 'complete', kind + ': schemakopian är inte städad'); assert.equal(r.database?.dataCopied, false);
    assert.equal(r.database?.sourceFingerprint, baselineFingerprint, kind + ': provad mot annat schema än målets nuvarande');
    for (const [p, h] of Object.entries(r.sources)) if (p.startsWith('supabase/migrations/2026102')) {
      assert.ok(p in actualMigrations, kind + ': okänd fasmigration ' + p); assert.equal(h, actualMigrations[p], kind + ': provad mot annan källa än ' + p);
      if (p in migrations) covered.add(p);
    }
    summary.sql[kind] = { path, sha256, checks: r.checks.length };
  }
  assert.deepEqual(sorted(covered), sorted(Object.keys(migrations)), 'Varje fasmigration ska vara provad i SQL');
  const { path, sha256 } = manifest.actual ?? {}, bytes = read(path); assert.equal(sha(bytes), sha256, 'Den faktiska rapporten har ändrats');
  const a = JSON.parse(bytes);
  assert.equal(a.kind, 'tjanst-actual-api-browser'); assert.equal(a.status, 'PASS', 'Det faktiska provet är inte PASS');
  assert.ok(a.checks.length > 0 && a.checks.every(c => c.ok === true) && a.notExecuted.length === 0, 'Faktiska kontroller saknas, fallerade eller kördes inte');
  assert.equal(a.playwrightOutcome?.stats?.unexpected, 0); assert.equal(a.playwrightOutcome?.stats?.flaky, 0);
  assert.deepEqual(a.migrationSources, actualMigrations, 'Det faktiska provet installerade andra migrationskällor');
  assert.deepEqual(a.finalMigrationSources, actualMigrations);
  if (stage === 'gap') assert.deepEqual(a.pendingMigrations, Object.keys(migrations), 'Det faktiska provet installerade andra migrationer över målet än stegets');
  assert.equal(a.snapshot?.dataCopied, false); assert.equal(a.snapshot?.sourceFingerprint, baselineFingerprint, 'Det faktiska provet utgick från ett annat schema');
  assert.equal(a.baselineFingerprint, baselineFingerprint); assert.equal(a.finalFingerprint, a.installedFingerprint);
  assert.deepEqual(a.grants?.workerExecute, sorted(WORKER_ENTRYPOINTS)); assert.deepEqual(a.finalGrants, a.grants);
  for (const k of ['clientRoleExecute', 'tablePrivileges', 'publicTablePrivileges']) assert.deepEqual(a.grants[k], [], k);
  for (const k of ['oidcCleanup', 'runtimeCleanup', 'snapshotCleanup']) assert.equal(a[k]?.cleanup, 'complete', k);
  assert.equal(a.buildCopyRemoved, true); assert.match(a.candidate?.revision ?? '', /^[0-9a-f]{40}$/u); assert.equal(a.sourceRevision, a.candidate.revision);
  assert.ok(a.finalArtifact?.fileCount > 0 && /^[0-9a-f]{64}$/u.test(a.finalArtifact.sha256));
  summary.actual = { path, sha256, checks: a.checks.length, revision: a.candidate.revision, artifact: { fileCount: a.finalArtifact.fileCount, sha256: a.finalArtifact.sha256 },
    installedFingerprint: a.installedFingerprint, functionCount: a.grants.functionCount };
  return summary;
}

// ---------- strukturkontroll (ren funktion) ----------
/** Jämför schemaFingerprint(…, true) före och efter. Returnerar listorna över tillkomna och ersatta objekt; kastar vid avvikelse. */
export function assertTransition(before, after, { stage, functionCount }) {
  const st = stageOf(stage), json = x => JSON.stringify(x), newRel = new Set(st.newTables);
  const oldRel = new Set(before.tables.map(t => t.relname));
  // Relationer: alla befintliga identiska; nya tabeller exakt; övriga nya relationer (index, sekvenser) hör till nya tabeller.
  const afterRel = new Map(after.tables.map(t => [t.relname, t]));
  for (const t of before.tables) assert.equal(json(afterRel.get(t.relname)), json(t), 'Befintlig relation ändrad: ' + t.relname);
  const addedRel = after.tables.filter(t => !oldRel.has(t.relname));
  assert.deepEqual(sorted(addedRel.filter(t => t.relkind === 'r').map(t => t.relname)), sorted(st.newTables), 'Nya tabeller');
  const newIndexes = after.indexes.filter(i => !before.indexes.some(b => json(b) === json(i)));
  assert.ok(newIndexes.every(i => newRel.has(i.tablename)), 'Index på befintlig tabell: ' + newIndexes.filter(i => !newRel.has(i.tablename)).map(i => i.indexname));
  const indexNames = new Set(newIndexes.map(i => i.indexname));
  for (const t of addedRel.filter(t => t.relkind !== 'r'))
    assert.ok(t.relkind === 'i' && indexNames.has(t.relname) || t.relkind === 'S' && st.newTables.some(n => t.relname.startsWith(n + '_')), 'Oväntad ny relation: ' + t.relname);
  assert.ok(before.indexes.every(b => after.indexes.some(i => json(i) === json(b))), 'Befintligt index borttaget eller ändrat');
  // Kolumner: befintliga identiska, nya bara på nya tabeller och deras index.
  const colKey = c => c.relname + '.' + c.attname, afterCols = new Map(after.columns.map(c => [colKey(c), c]));
  for (const c of before.columns) assert.equal(json(afterCols.get(colKey(c))), json(c), 'Befintlig kolumn ändrad: ' + colKey(c));
  const addedCols = after.columns.filter(c => !oldRel.has(c.relname));
  assert.ok(after.columns.filter(c => oldRel.has(c.relname)).length === before.columns.length, 'Ny kolumn på befintlig tabell');
  assert.ok(addedCols.every(c => newRel.has(c.relname) || indexNames.has(c.relname)), 'Kolumn utanför nya tabeller');
  // Villkor: befintliga tabeller får bara stegets planerade ändringar (etapp1: self i scope_kind; gap: inga).
  const conKey = c => c.relname + '.' + c.conname, old = list => list.filter(c => !newRel.has(c.relname));
  const removed = old(before.constraints).filter(c => !after.constraints.some(a => json(a) === json(c))).map(conKey);
  const added = old(after.constraints).filter(c => !before.constraints.some(b => json(b) === json(c))).map(conKey);
  assert.deepEqual({ removed: sorted(removed), added: sorted(added) }, st.constraintChanges, 'Villkor på befintliga tabeller');
  const scope = after.constraints.find(c => conKey(c) === 'access_assignments.phase3_scope_kind');
  assert.ok(/'self'/u.test(scope?.definition ?? ''), 'access_assignments.phase3_scope_kind saknar self');
  // Triggrar och policyer på befintliga tabeller oförändrade.
  assert.equal(json(before.triggers), json(after.triggers.filter(t => !newRel.has(t.relname))), 'Triggrar på befintliga tabeller ändrade');
  assert.equal(json(before.policies), json(after.policies.filter(p => !newRel.has(p.tablename))), 'Policyer ändrade');
  // Funktioner: inga borttagna, exakt de listade får ny definition med oförändrade rättigheter och ägare.
  const replaced = [], metadata = [];
  for (const o of before.functions) {
    const n = after.functions.find(f => fn(f.signature) === fn(o.signature)); assert.ok(n, 'Funktion borttagen: ' + o.signature);
    const { definition: a, ...am } = o, { definition: b, ...bm } = n;
    if (json(am) !== json(bm)) metadata.push(fn(o.signature)); if (a !== b) replaced.push(fn(o.signature));
  }
  assert.deepEqual({ replaced: sorted(replaced), metadata }, { replaced: sorted(st.replacedFunctions), metadata: [] }, 'Ersatta funktioner');
  const addedFunctions = after.functions.filter(f => !before.functions.some(o => fn(o.signature) === fn(f.signature))).map(f => fn(f.signature));
  assert.ok(addedFunctions.every(isNewFunction), 'Ny funktion utanför tjanst_/phase51_: ' + addedFunctions.filter(f => !isNewFunction(f)));
  if (st.functionTotal) {
    assert.ok(before.functions.some(f => isNewFunction(f.signature)), 'Föregående stegs fasfunktioner saknas före installationen');
    assert.equal(after.functions.filter(f => isNewFunction(f.signature)).length, functionCount, 'Antal tjanst_/phase51_-funktioner skiljer sig från det faktiska provet');
  } else {
    assert.ok(before.functions.every(f => !isNewFunction(f.signature)), 'Fasens funktioner finns redan före installationen');
    assert.equal(addedFunctions.length, functionCount, 'Antal nya funktioner skiljer sig från det faktiska provet');
  }
  return { addedTables: sorted(st.newTables), addedRelations: sorted(addedRel.filter(t => t.relkind !== 'r').map(t => t.relname)),
    addedFunctions: sorted(addedFunctions), replacedFunctions: sorted(replaced), constraintChanges: st.constraintChanges };
}

/** Rättighetsrader för nya objekt → endast de tolv entrypointsen öppna och bara för Worker. */
export function assertPrivate(rows) {
  const open = rows.functions.filter(r => r.allowed).map(r => r.role + ':' + fn(r.signature));
  assert.deepEqual(sorted(open), sorted(WORKER_ENTRYPOINTS.map(e => 'skolplattform_worker:' + e)), 'Öppna nya funktioner');
  assert.deepEqual(rows.functions.filter(r => r.public_execute).map(r => r.signature), [], 'Nya funktioner öppna för public');
  assert.deepEqual(rows.relations.filter(r => r.allowed || r.public_any).map(r => r.role + ':' + r.relname), [], 'Nya relationer öppna');
  return { openForWorker: sorted(WORKER_ENTRYPOINTS), privateFunctions: new Set(rows.functions.map(r => r.signature)).size - WORKER_ENTRYPOINTS.length,
    privateRelations: new Set(rows.relations.map(r => r.relname)).size };
}

// ---------- orkestrering (prövas med falsk databas) ----------
/**
 * Repetition i transaktion som alltid rullas tillbaka; vid apply en andra transaktion med lås och journal.
 * db.begin(cb) ska köra cb i en transaktion som rullas tillbaka om cb kastar.
 */
export async function runInstallation({ db, mode, rehearse, install, fingerprint, recorded, report, check }) {
  assert.ok(mode === 'rehearsal' || mode === 'apply');
  report.before = { fingerprint: await fingerprint(db), recorded: await recorded(db) };
  check('no migration of the stage recorded before', report.before.recorded === 0, report.before.recorded);
  let returned = false;
  try { await db.begin(async tx => { report.rehearsal = await rehearse(tx, 'rehearsal'); returned = true; throw ROLLBACK; }); }
  catch (e) { if (e !== ROLLBACK) throw e; }
  check('rehearsal completed inside the transaction', returned);
  check('rollback restored the exact schema fingerprint and empty journal', await fingerprint(db) === report.before.fingerprint && await recorded(db) === 0,
    { before: report.before.fingerprint });
  report.afterRehearsal = { fingerprint: await fingerprint(db) };
  report.committed = false;
  if (mode === 'apply') { await db.begin(async tx => { report.installed = await install(tx); }); report.committed = true; }
  return report;
}

// ---------- databasdelar ----------
async function newObjectPrivileges(tx) {
  const functions = await tx`select p.oid::regprocedure::text signature,r.role,has_function_privilege(r.role,p.oid,'EXECUTE') allowed,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
   from pg_proc p cross join unnest(${ROLES}::text[]) r(role) where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') order by 1,2`;
  const relations = await tx`select c.relname,r.role,case when c.relkind='S' then has_sequence_privilege(r.role,c.oid,'USAGE,SELECT,UPDATE')
     when c.relkind='i' then false else has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') end allowed,
    exists(select 1 from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a where a.grantee=0) and c.relkind<>'i' public_any
   from pg_class c cross join unnest(${ROLES}::text[]) r(role) where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')
    and (c.relname like 'tjanst\\_%' or c.relname like 'staff\\_people%' or c.relname like 'staff\\_employments%' or c.relname like 'staff\\_school\\_duties%' or c.relname like 'staff\\_person\\_bindings%') order by 1,2`;
  return { functions, relations };
}

async function main(argv) {
  const opts = parseArgs(argv), st = stageOf(opts.stage), stageMigrations = st.migrations, stageVersions = versionsOf(stageMigrations);
  const priorVersions = versionsOf(st.prior);
  const { assertTarget } = await import('./verify-target.mjs');
  const { schemaFingerprint } = await import('./named-timplan-snapshot.mjs');
  const { catalogColumns, projectionHashes } = await import('./verify-class-cohort.mjs');
  const migrations = currentMigrationSources(stageMigrations), actualMigrations = currentMigrationSources(st.actualMigrations);
  const priorSources = currentMigrationSources(st.prior);
  const readPrivate = p => { assert.ok(resolve(p).startsWith('/private/tmp/')); return readFileSync(p); };
  const target = await assertTarget('protected');
  const db = createRequire(new URL('../../web/package.json', import.meta.url))('postgres')(target.dbUrl, { max: 1, prepare: false, onnotice: () => {} });
  const report = { kind: 'tjanst-installation', schemaVersion: 1, stage: opts.stage, mode: opts.mode, startedAt: new Date().toISOString(), migrations, versions: stageVersions,
    priorVersions, checks: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); assert.ok(ok, `${name}: ${JSON.stringify(detail)}`); };
  const recorded = async q => (await q`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${stageVersions}::text[])`)[0].n;
  /** Föregående steg: varje version journalförd med exakt den aktuella källan (gap: de sju etapp 1-versionerna). */
  const priorJournalled = async q => {
    if (!st.prior.length) return true;
    const rows = await q`select version,statements from supabase_migrations.schema_migrations where version=any(${priorVersions}::text[]) order by version`;
    return rows.length === priorVersions.length && rows.every((r, i) => r.version === priorVersions[i] && sha(r.statements?.[0] ?? '') === priorSources[st.prior[i]]);
  };
  let failure;
  try {
    const baselineFingerprint = await schemaFingerprint(db);
    report.baselineFingerprint = baselineFingerprint;
    const evidenceOptions = { stage: opts.stage, migrations, actualMigrations, baselineFingerprint };
    if (opts.mode === 'collect') {
      const reports = Object.fromEntries(opts.reports.map(p => { const bytes = readPrivate(p); return [JSON.parse(bytes).kind, { path: p, sha256: sha(bytes) }]; }));
      const bytes = readPrivate(opts.actual), manifest = { kind: 'tjanst-sql-evidence', schemaVersion: 1, stage: opts.stage, createdAt: new Date().toISOString(), migrations,
        actualMigrations, baselineFingerprint, sql: reports, actual: { path: opts.actual, sha256: sha(bytes) } };
      report.evidence = requireEvidence(manifest, readPrivate, evidenceOptions);
      const fd = openSync(opts.out, 'wx', 0o600); writeSync(fd, JSON.stringify(manifest, null, 1) + '\n'); closeSync(fd);
      report.evidencePath = opts.out; report.evidenceSha256 = sha(readFileSync(opts.out));
      check('evidence collected from PASS reports for the exact migration sources', true, Object.keys(reports).length + 1);
    } else {
      const evidenceBytes = readPrivate(opts.evidencePath);
      report.sqlEvidence = { path: opts.evidencePath, sha256: sha(evidenceBytes) };
      report.evidence = requireEvidence(JSON.parse(evidenceBytes), readPrivate, evidenceOptions);
      check('SQL and actual evidence PASS for the exact migration sources and current target schema', true,
        { sql: Object.fromEntries(Object.entries(report.evidence.sql).map(([k, v]) => [k, v.sha256])), actual: report.evidence.actual.sha256 });
      if (st.prior.length) check('every prior-stage version is journalled with its exact source', await priorJournalled(db), { prior: priorVersions });
      const [{ latest }] = await db`select max(version) latest from supabase_migrations.schema_migrations where not (version=any(${stageVersions}::text[]))`;
      report.latestInstalledVersion = latest;
      check('every migration of the stage sorts after the latest installed migration',
        latest < sorted(stageVersions)[0] && JSON.stringify(stageVersions) === JSON.stringify(sorted(stageVersions)), { latest, first: stageVersions[0] });

      const installAndCheck = async (tx, label) => {
        await tx`set local lock_timeout='5s'`; await tx`set local statement_timeout='180s'`;
        check(label + ': migrations not yet recorded', await recorded(tx) === 0);
        if (st.prior.length) check(label + ': prior stage journalled with exact sources', await priorJournalled(tx));
        const beforeStructure = await schemaFingerprint(tx, true), originalColumns = await catalogColumns(tx), beforeRows = await projectionHashes(tx, originalColumns);
        const shape = async () => (await tx`select a.id::text id,public.phase3_mandate_shape(a) ok,to_jsonb(a)::text row from public.access_assignments a order by a.id`).map(r => r.id + ':' + r.ok + ':' + sha(r.row));
        const beforeShape = await shape();
        for (const p of stageMigrations) await tx.unsafe(readFileSync(resolve(root, p), 'utf8'));
        await tx`set constraints all immediate`;
        const afterStructure = JSON.parse(JSON.stringify(await schemaFingerprint(tx, true))), before = JSON.parse(JSON.stringify(beforeStructure));
        const afterRows = await projectionHashes(tx, originalColumns);
        const changedRows = Object.keys(beforeRows).filter(t => JSON.stringify(afterRows[t]) !== JSON.stringify(beforeRows[t]));
        check(label + ': every existing row unchanged in its original columns', changedRows.length === 0, { tables: Object.keys(beforeRows).length, changedRows });
        const objects = assertTransition(before, afterStructure, { stage: opts.stage, functionCount: report.evidence.actual.functionCount });
        check(label + ': existing tables, columns, indexes, triggers and policies unchanged; only planned objects added', true,
          { addedTables: objects.addedTables, addedRelations: objects.addedRelations.length, addedFunctions: objects.addedFunctions.length,
            phaseFunctionsAfter: afterStructure.functions.filter(f => isNewFunction(f.signature)).length });
        check(label + ': exactly the listed functions replaced with unchanged privileges and owner', true, objects.replacedFunctions);
        check(label + (opts.stage === 'gap' ? ': no constraint on an existing table changed' : ': access_assignments.phase3_scope_kind accepts self; phase51_self_scope added'),
          true, objects.constraintChanges);
        const afterShape = await shape();
        check(label + ': every existing mandate keeps its row and shape result', JSON.stringify(afterShape) === JSON.stringify(beforeShape), { mandates: beforeShape.length });
        let selfLinks;
        if (st.selfLinks) {
          [selfLinks] = await tx`select count(*)::int "selfMandates",
              (select count(*)::int from public.tjanst_self_mandates) links,
              count(*) filter (where (select count(*) from public.tjanst_self_mandates l where l.access_assignment_id=a.id)<>1)::int "notExactlyOne",
              (select count(*)::int from public.tjanst_self_mandates l join public.staff_person_bindings own on own.access_assignment_id=l.access_assignment_id
                where l.binding_id<>own.id) repaired
            from public.access_assignments a where a.scope_kind='self'`;
          check(label + ': every self mandate has exactly one row in tjanst_self_mandates', selfLinks.notExactlyOne === 0 && selfLinks.links === selfLinks.selfMandates, selfLinks);
        }
        const privacy = assertPrivate(await newObjectPrivileges(tx));
        check(label + ': only the twelve entrypoints are open, and only for skolplattform_worker', true, privacy);
        const installedFingerprint = sha(JSON.stringify(afterStructure));
        check(label + ': installed schema equals the schema of the actual test', installedFingerprint === report.evidence.actual.installedFingerprint,
          { installedFingerprint, actual: report.evidence.actual.installedFingerprint });
        return { beforeFingerprint: sha(JSON.stringify(beforeStructure)), afterFingerprint: installedFingerprint, preservedTables: Object.keys(beforeRows).length,
          existingMandates: beforeShape.length, ...objects, ...(selfLinks ? { selfLinks } : {}), privacy };
      };
      const install = async tx => {
        await tx`set transaction isolation level repeatable read`;
        check('install lock acquired', (await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked === true);
        check('install starts from the rehearsed schema', await schemaFingerprint(tx) === report.before.fingerprint);
        const started = Date.now(), result = await installAndCheck(tx, 'install');
        for (const [i, p] of stageMigrations.entries())
          await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${stageVersions[i]},${p.split('/').pop().slice(15, -4)},${[readFileSync(resolve(root, p), 'utf8')]})`;
        check('install: all versions of the stage journalled in the transaction', await recorded(tx) === stageVersions.length);
        report.lockHoldMsBeforeCommit = Date.now() - started; return result;
      };
      await runInstallation({ db, mode: opts.mode, fingerprint: q => schemaFingerprint(q), recorded, report, check,
        rehearse: async tx => { await tx`set transaction isolation level repeatable read`; return installAndCheck(tx, 'rehearsal'); }, install });
      if (opts.mode === 'apply') {
        check('installation persisted and journalled', await recorded(db) === stageVersions.length && await schemaFingerprint(db) === report.installed.afterFingerprint);
        const journal = await db`select version,name,statements from supabase_migrations.schema_migrations where version=any(${stageVersions}::text[]) order by version`;
        check('journal holds the exact migration sources', journal.length === stageVersions.length && journal.every((r, i) => r.version === stageVersions[i] && sha(r.statements[0]) === migrations[stageMigrations[i]]));
      }
    }
  } catch (e) { failure = e; } finally { await db.end({ timeout: 5 }); }
  report.status = failure ? 'FAIL' : 'PASS'; report.finishedAt = new Date().toISOString(); if (failure) report.error = failure.message;
  const out = opts.mode === 'collect' ? opts.out.replace(/\.json$/u, '-collect-report.json') : opts.out;
  const fd = openSync(out, 'wx', 0o600); writeSync(fd, JSON.stringify(report, null, 1) + '\n'); closeSync(fd);
  const r = report.rehearsal;
  console.log(`${report.status}: ${report.checks.length} kontroller, tjänstefördelningens installation (${opts.stage}, ${opts.mode})` +
    (r ? `; ${r.preservedTables} bevarade tabeller, ${r.existingMandates} bevarade mandat, ${r.addedTables.length} nya tabeller, ${r.addedFunctions.length} nya och ${r.replacedFunctions.length} ersatta funktioner` +
      (r.selfLinks ? `, ${r.selfLinks.links} kopplingar för ${r.selfLinks.selfMandates} self-mandat varav ${r.selfLinks.repaired} reparerade` : '') + `; committed=${report.committed}` : '') +
    `; rapport ${out}` + (failure ? `; ${failure.message}` : ''));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, before: report.before, afterRehearsal: report.afterRehearsal, committed: report.committed,
    sqlEvidence: report.sqlEvidence, evidence: report.evidence, latestInstalledVersion: report.latestInstalledVersion,
    rehearsal: r && { ...r, addedFunctions: r.addedFunctions.length }, installed: report.installed && { afterFingerprint: report.installed.afterFingerprint } }, null, 1));
  return failure ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { console.error('FAIL: ' + e.message); process.exitCode = 1; }
}
