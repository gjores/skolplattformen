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
// 05.1-28: --stage trial (05.1-26/27, D-28 och APL per klass) använder samma strikta väg som year, med egna listor i RELEASES.
// Year/trial: utan --apply körs DDL bara i en egen schema-only kopia med syntetiska bevaranderader.
// Year --apply är en färdig installationsväg för separat konkret installationsbeslut; kör den aldrig som förberedelse.
// Historiska etapp1/gap: utan --apply körs stegets migrationer i en transaktion som alltid rullas tillbaka.
// --apply upprepar först samma repetition och installerar sedan i en egen transaktion med advisory lock,
// där samma kontroller körs igen och versionerna journalförs i supabase_migrations.schema_migrations.
// Inga anslutningsuppgifter, nycklar eller rader skrivs ut; rapporten innehåller bara antal, namn och hashar.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tjanstEtapp1Migrations, tjanstGapMigrations } from './tjanst-fixtures.mjs';

import { TJANST_MIGRATION_REGISTRY, classifyTjanstMigrations } from './tjanst-migration-state.mjs';

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
/** Reviewed year suffix: independent of future registry additions. */
export const YEAR_MIGRATIONS = [
  'supabase/migrations/20261023100000_tjanst_publish_person_scope.sql',
  'supabase/migrations/20261023110000_tjanst_year_preview.sql',
  'supabase/migrations/20261023120000_tjanst_year_commands.sql',
  'supabase/migrations/20261023130000_tjanst_year_worker_access.sql',
];
export const YEAR_NEW_FUNCTIONS = [
  'tjanst_year_hash(text,jsonb)', 'tjanst_year_core(access_assignments,uuid,integer)', 'tjanst_year_catalog(jsonb)',
  'tjanst_year_history(uuid,integer)', 'tjanst_year_recommendations(jsonb,jsonb)', 'tjanst_year_row(jsonb,text,uuid)',
  'tjanst_year_choice(jsonb)', 'tjanst_year_choice_blocker(jsonb,jsonb,jsonb)', 'tjanst_year_payload(text,jsonb)',
  'tjanst_year_batch(jsonb,jsonb)', 'tjanst_year_preview(jsonb)', 'tjanst_plan_parse_legacy(jsonb)',
  'tjanst_year_map_id(text,uuid,uuid,uuid)', 'tjanst_year_ensure_draft(access_assignments,app_sessions,tjanst_distributions,uuid)',
  'tjanst_year_apply_one(access_assignments,tjanst_distributions,text,jsonb,uuid,uuid)',
  'tjanst_year_apply_batch(access_assignments,tjanst_distributions,jsonb,uuid,uuid,jsonb)',
];
export const YEAR_REPLACED_FUNCTIONS = [
  'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)',
  'tjanst_plan_projection(access_assignments,uuid,integer,uuid)', 'tjanst_audit(text,text,uuid,jsonb)',
  'tjanst_plan_parse(jsonb)', 'tjanst_plan_copy_extras(uuid,uuid)', 'tjanst_plan_command(jsonb)', 'tjanst_command_ref(jsonb,text)',
];
export const YEAR_ENTRYPOINTS = [...WORKER_ENTRYPOINTS, 'tjanst_year_preview(jsonb)'];
export const YEAR_SQL_KINDS = ['tjanst-publish-person-scope', 'tjanst-year-preview', 'tjanst-year-commands', 'tjanst-year-access'];
/**
 * Stegen. migrations installeras; prior ska redan vara journalförda med exakt samma källor; actualMigrations är det
 * faktiska provets migrationSources; functionTotal: grants.functionCount är totalen tjanst_/phase51_-funktioner efter
 * installationen (gap) i stället för antalet nya (etapp1, där inga fanns före).
 */
export const STAGES = {
  etapp1: { migrations: tjanstEtapp1Migrations, prior: [], actualMigrations: tjanstEtapp1Migrations, newTables: NEW_TABLES,
    replacedFunctions: REPLACED_FUNCTIONS, constraintChanges: CONSTRAINT_CHANGES, sqlKinds: SQL_KINDS, functionTotal: false, selfLinks: false },
  gap: { migrations: tjanstGapMigrations, prior: tjanstEtapp1Migrations, actualMigrations: [...tjanstEtapp1Migrations, ...tjanstGapMigrations], newTables: GAP_NEW_TABLES,
    replacedFunctions: GAP_REPLACED_FUNCTIONS, constraintChanges: { removed: [], added: [] }, sqlKinds: GAP_SQL_KINDS, functionTotal: true, selfLinks: true },
};
STAGES.year = { migrations: YEAR_MIGRATIONS, prior: [...tjanstEtapp1Migrations, ...tjanstGapMigrations],
  actualMigrations: [...tjanstEtapp1Migrations, ...tjanstGapMigrations, ...YEAR_MIGRATIONS], newTables: [],
  replacedFunctions: YEAR_REPLACED_FUNCTIONS, constraintChanges: { removed: [], added: [] }, sqlKinds: YEAR_SQL_KINDS, functionTotal: true, selfLinks: true };
/** 05.1-28: rättelserna från användarprovet (05.1-26 D-28 och 05.1-27 APL per klass), installerade efter year. */
export const TRIAL_MIGRATIONS = [
  'supabase/migrations/20261026100000_tjanst_joint_single_teacher.sql',
  'supabase/migrations/20261026110000_tjanst_class_apl.sql',
];
export const TRIAL_NEW_FUNCTIONS = ['tjanst_class_apl_minutes(jsonb)'];
export const TRIAL_REPLACED_FUNCTIONS = ['tjanst_plan_save_joint(tjanst_distributions,jsonb)',
  'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)', 'tjanst_plan_projection(access_assignments,uuid,integer,uuid)'];
export const TRIAL_SQL_KINDS = ['tjanst-joint-teacher', 'tjanst-class-apl', ...YEAR_SQL_KINDS];
STAGES.trial = { migrations: TRIAL_MIGRATIONS, prior: STAGES.year.actualMigrations, actualMigrations: [...STAGES.year.actualMigrations, ...TRIAL_MIGRATIONS],
  newTables: [], replacedFunctions: TRIAL_REPLACED_FUNCTIONS, constraintChanges: { removed: [], added: [] }, sqlKinds: TRIAL_SQL_KINDS, functionTotal: true, selfLinks: true };
/** 05.1-33 / D-31: delning och betygsansvar per behov, installerad efter trial. Två nya stängda tabeller. */
export const SHARING_MIGRATIONS = ['supabase/migrations/20261028100000_tjanst_need_sharing.sql'];
export const SHARING_NEW_TABLES = ['tjanst_need_graders', 'tjanst_need_sharing'];
export const SHARING_NEW_FUNCTIONS = ['tjanst_plan_save_sharing(tjanst_distributions,jsonb)', 'tjanst_plan_clear_sharing(tjanst_distributions,jsonb)'];
export const SHARING_REPLACED_FUNCTIONS = ['tjanst_plan_parse(jsonb)',
  'tjanst_year_apply_one(access_assignments,tjanst_distributions,text,jsonb,uuid,uuid)',
  'tjanst_year_apply_batch(access_assignments,tjanst_distributions,jsonb,uuid,uuid,jsonb)', 'tjanst_plan_copy_extras(uuid,uuid)', 'tjanst_version_hash(uuid)',
  'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)', 'tjanst_plan_projection(access_assignments,uuid,integer,uuid)',
  'tjanst_command_ref(jsonb,text)', 'tjanst_school_sums(uuid,uuid,integer)', 'tjanst_self_projection(access_assignments)'];
// Samläsnings- och APL-sviterna kräver sin egen migration som väntande; efter trial är de installerade och provas som regression i tillfällig databas.
export const SHARING_SQL_KINDS = ['tjanst-need-sharing', ...YEAR_SQL_KINDS];
STAGES.sharing = { migrations: SHARING_MIGRATIONS, prior: STAGES.trial.actualMigrations, actualMigrations: [...STAGES.trial.actualMigrations, ...SHARING_MIGRATIONS],
  newTables: SHARING_NEW_TABLES, replacedFunctions: SHARING_REPLACED_FUNCTIONS, constraintChanges: { removed: [], added: [] }, sqlKinds: SHARING_SQL_KINDS, functionTotal: true, selfLinks: true };
/**
 * Strikta leveranssteg efter etapp 2 (year, trial): samma grindar, egna objektlistor och antal.
 * opened: nya funktioner som öppnas för Worker; uncheckedStage: SQL-sviter utan requestedStage.
 */
export const RELEASES = {
  year: { stage: 'year', migrations: YEAR_MIGRATIONS, newFunctions: YEAR_NEW_FUNCTIONS, replacedFunctions: YEAR_REPLACED_FUNCTIONS,
    opened: ['tjanst_year_preview(jsonb)'], functionCount: 86, privateFunctions: 73, sqlKinds: YEAR_SQL_KINDS,
    uncheckedStage: ['tjanst-year-access'], caseCounts: [51, 13, 10, 9], checks: 83, journalCount: 12 },
  trial: { stage: 'trial', migrations: TRIAL_MIGRATIONS, newFunctions: TRIAL_NEW_FUNCTIONS, replacedFunctions: TRIAL_REPLACED_FUNCTIONS,
    opened: [], functionCount: 87, privateFunctions: 74, sqlKinds: TRIAL_SQL_KINDS,
    uncheckedStage: ['tjanst-year-access', 'tjanst-joint-teacher', 'tjanst-class-apl'], caseCounts: [53, 13, 10, 9], checks: 85, journalCount: 14 },
  sharing: { stage: 'sharing', migrations: SHARING_MIGRATIONS, newTables: SHARING_NEW_TABLES, newFunctions: SHARING_NEW_FUNCTIONS, replacedFunctions: SHARING_REPLACED_FUNCTIONS,
    opened: [], functionCount: 89, privateFunctions: 76, sqlKinds: SHARING_SQL_KINDS,
    uncheckedStage: ['tjanst-year-access', 'tjanst-need-sharing'], caseCounts: [56, 13, 10, 9], checks: 88, journalCount: 15 },
};
for (const r of Object.values(RELEASES)) Object.assign(r, { prior: STAGES[r.stage].prior, actualMigrations: STAGES[r.stage].actualMigrations });
const releaseOf = stage => { assert.ok(Object.hasOwn(RELEASES, stage)); return RELEASES[stage]; };
const stageOf = name => { assert.ok(Object.hasOwn(STAGES, name ?? ''), '--stage etapp1|gap krävs (eller year|trial|sharing för isolerad repetition)'); return STAGES[name]; };
const ROLES = ['anon', 'authenticated', 'service_role', 'skolplattform_worker'];
const fn = s => s.replace(/^public\./u, '').replaceAll(', ', ',').replaceAll('public.', '');
const isNewFunction = s => /^(tjanst|phase51)_/u.test(fn(s));
const sorted = list => [...list].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

// ---------- argument ----------
const privatePath = (flag, value) => { assert.ok(value && resolve(value).startsWith('/private/tmp/') && value.endsWith('.json'), `${flag} /private/tmp/<namn>.json krävs`); return resolve(value); };
export function parseArgs(argv) {
  const known = new Set(['--stage', '--sql-evidence', '--apply', '--out', '--collect-evidence', '--reports', '--actual', '--visual-review']);
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; assert.ok(known.has(a), 'Okänt argument: ' + a); assert.ok(!(a in o), 'Dubbelt argument: ' + a);
    if (a === '--apply') { o[a] = true; continue; }
    const v = argv[++i]; assert.ok(v && !v.startsWith('--'), a + ' saknar värde'); o[a] = v;
  }
  const stage = o['--stage']; stageOf(stage);
  const release = Object.hasOwn(RELEASES, stage);
  assert.ok(!o['--visual-review'] || (release && o['--collect-evidence']), '--visual-review hör bara till year|trial|sharing --collect-evidence');
  if (o['--collect-evidence']) {
    assert.ok(!o['--apply'] && !o['--sql-evidence'] && !o['--out'], '--collect-evidence kan inte kombineras med --apply, --sql-evidence eller --out');
    if (release) assert.ok(o['--visual-review'], stage + ' kräver --visual-review');
    assert.ok(o['--reports'] && o['--actual'], '--collect-evidence kräver --reports och --actual');
    return { mode: 'collect', stage, out: privatePath('--collect-evidence', o['--collect-evidence']),
      reports: o['--reports'].split(',').map(p => privatePath('--reports', p)), actual: privatePath('--actual', o['--actual']),
      ...(release ? { visualReview: privatePath('--visual-review', o['--visual-review']) } : {}) };
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
  assert.ok(!Object.hasOwn(RELEASES,stage),stage+' kräver requireYearEvidence');
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

// ---------- year: strict, independent release gates ----------
export function assertYearTransition(before, after, { functionCount = 86, stage = 'year' } = {}) {
  const r = releaseOf(stage), newRel = new Set(r.newTables ?? []);
  // 05.1-33: sharing lägger till stängda tabeller; allt på befintliga relationer ska vara identiskt.
  const newIndexes = after.indexes.filter(i => newRel.has(i.tablename)).map(i => i.indexname), owned = new Set([...newRel, ...newIndexes]);
  assert.ok(before.tables.every(t => !owned.has(t.relname)), 'Stegets tabeller finns redan före installationen');
  const relKey = { tables: 'relname', columns: 'relname', constraints: 'relname', indexes: 'tablename', triggers: 'relname', policies: 'tablename' };
  for (const [key, field] of Object.entries(relKey))
    assert.deepEqual([...after[key]].filter(x => !owned.has(x[field])), [...before[key]], 'year ändrar inte ' + key);
  const addedTables = after.tables.filter(t => owned.has(t.relname));
  assert.deepEqual(sorted(addedTables.filter(t => t.relkind === 'r').map(t => t.relname)), sorted(r.newTables ?? []), 'Nya tabeller');
  assert.ok(addedTables.every(t => t.relkind === 'r' ? t.relrowsecurity && t.relforcerowsecurity : t.relkind === 'i'), 'Ny tabell utan tvingad RLS eller oväntad relation');
  assert.equal(after.policies.filter(p => newRel.has(p.tablename)).length, 0, 'Policy på ny tabell');
  for (const t of newRel) assert.ok(after.triggers.some(x => x.relname === t && /tjanst_version_guard/u.test(x.definition)), 'Versionsskydd saknas: ' + t);
  assert.equal(functionCount, r.functionCount);
  const old = new Map(before.functions.map(f => [fn(f.signature), f]));
  const next = new Map(after.functions.map(f => [fn(f.signature), f]));
  assert.equal(old.size,before.functions.length); assert.equal(next.size,after.functions.length);
  const changed=[];
  for (const [signature, value] of old) {
    const current=next.get(signature); assert.ok(current,'Funktion borttagen: '+signature);
    const {definition:a,...am}=value,{definition:b,...bm}=current;
    assert.deepEqual(bm,am,'Befintlig funktionsmetadata/ACL ändrad: '+signature);
    if(a!==b) changed.push(signature);
  }
  assert.deepEqual(sorted(changed),sorted(r.replacedFunctions));
  const added=[...next.keys()].filter(k=>!old.has(k));
  assert.deepEqual(sorted(added),sorted(r.newFunctions));
  assert.equal(after.functions.filter(f=>isNewFunction(f.signature)).length,r.functionCount);
  // Exact owners/ACL for every new function, including newly opened RPCs.
  const anchor=before.functions.find(f=>fn(f.signature)==='tjanst_plan_command(jsonb)');
  assert.ok(anchor && anchor.acl);
  const ownerGrant=anchor.acl.slice(1,-1).split(',').find(g=>!g.startsWith('skolplattform_worker='));
  assert.match(ownerGrant,/^[a-z_][a-z_0-9]*=X\/[a-z_][a-z_0-9]*$/u);
  const grantor=ownerGrant.split('/')[1];
  for(const name of added){const f=next.get(name);assert.equal(f.owner,anchor.owner,name);
    assert.equal(f.acl,'{'+ownerGrant+(r.opened.includes(name)?',skolplattform_worker=X/'+grantor:'')+'}',name+' ACL');}
  return {addedTables:sorted(r.newTables??[]),addedRelations:sorted(newIndexes),addedFunctions:sorted(added),replacedFunctions:sorted(changed),constraintChanges:{removed:[],added:[]}};
}
const hashPattern=/^[a-f0-9]{64}$/u;
const relativeSource=p=>assert.ok(typeof p==='string'&&!isAbsolute(p)&&!p.split('/').includes('..'),'Ogiltig källsökväg');
const fileEvidence=(ref,read)=>{assert.ok(ref && hashPattern.test(ref.sha256));privatePath('bevis',ref.path);
  const bytes=read(ref.path);assert.equal(sha(bytes),ref.sha256,'Ändrad bevisfil: '+ref.path);return JSON.parse(bytes);};
/** Dependencies are injected for meaningful tamper tests; CLI supplies fresh inventories, Git bytes and artifact bytes. */
export function requireYearEvidence(manifest, read, context) {
  const {baselineFingerprint,journalFingerprint,migrations,actualMigrations,products,verification,requiredCases,sourceHash,commitHash,artifact,stage='year'}=context,rel=releaseOf(stage);
  assert.equal(manifest.kind,'tjanst-sql-evidence');assert.equal(manifest.schemaVersion,2);assert.equal(manifest.stage,stage);
  assert.deepEqual(manifest.migrations,migrations);assert.deepEqual(manifest.actualMigrations,actualMigrations);assert.equal(manifest.baselineFingerprint,baselineFingerprint);
  assert.deepEqual(sorted(Object.keys(manifest.sql??{})),sorted(rel.sqlKinds));
  const a=fileEvidence(manifest.actual,read), revision=a.candidate?.revision;
  assert.equal(a.kind,'tjanst-actual-api-browser');assert.equal(a.stage,'year');assert.equal(a.suiteVersion,'tjanst-year-actual-v1');assert.equal(a.status,'PASS');assert.equal(a.fullSuite,true);
  assert.match(revision??'',/^[a-f0-9]{40}$/u);assert.equal(a.sourceRevision,revision);assert.equal(a.build?.revision,revision);assert.equal(a.candidate.mark?.revision,revision);assert.equal(a.build.mode,'protected');
  const verifySources=(map,label)=>{assert.ok(map&&Object.keys(map).length>0,label+' saknar källor');for(const[p,h]of Object.entries(map)){
    relativeSource(p);assert.match(h,hashPattern);assert.equal(sourceHash(p),h,label+': aktuell källa ändrad '+p);assert.equal(commitHash(revision,p),h,label+': annan kandidatkälla '+p);}};
  assert.deepEqual(a.sources,products);assert.deepEqual(a.finalSources,products);verifySources(products,'Produkt');
  assert.deepEqual(a.verificationSources,verification);assert.deepEqual(a.finalVerificationSources,verification);verifySources(verification,'Verifierare');
  assert.deepEqual(a.migrationSources,actualMigrations);assert.deepEqual(a.finalMigrationSources,actualMigrations);verifySources(actualMigrations,'Migration');
  assert.deepEqual(a.pendingMigrations,rel.migrations);
  assert.equal(a.snapshot?.dataCopied,false);assert.equal(a.snapshot.sourceFingerprint,baselineFingerprint);assert.equal(a.baselineFingerprint,baselineFingerprint);
  assert.equal(a.targetFingerprint,baselineFingerprint);assert.equal(a.finalTargetFingerprint,baselineFingerprint);assert.equal(a.targetUnchanged,true);assert.deepEqual(a.finalTargetJournal,a.targetJournal);
  assert.match(a.targetJournal.fingerprint?.sha256??'',hashPattern);assert.equal(a.targetJournal.fingerprint.sha256,journalFingerprint);assert.ok(a.targetJournal.fingerprint.count>=8);assert.deepEqual(a.targetJournal.fingerprint.columns,['version','name','statements']);
  assert.deepEqual(a.targetJournal.installedSources,rel.prior.map(file=>({version:file.split('/').at(-1).slice(0,14),name:file.split('/').at(-1).slice(15,-4),statementCount:1,sha256:actualMigrations[file]})));
  assert.deepEqual(a.targetJournal.installed,versionsOf(rel.prior));assert.deepEqual(a.targetJournal.unknown,[]);assert.deepEqual(a.targetJournal.missing,versionsOf(rel.migrations));assert.equal(a.targetJournal.read,'read only');
  assert.match(a.installedFingerprint,hashPattern);assert.equal(a.finalFingerprint,a.installedFingerprint);
  assert.deepEqual(a.grants.workerExecute,sorted(YEAR_ENTRYPOINTS));assert.equal(a.grants.workerExecuteCount,13);assert.equal(a.grants.functionCount,rel.functionCount);assert.equal(a.grants.closedFunctions,rel.privateFunctions);
  for(const k of ['clientRoleExecute','tablePrivileges','publicTablePrivileges'])assert.deepEqual(a.grants[k],[]);
  assert.deepEqual(a.finalGrants,a.grants);
  for(const k of ['oidcCleanup','runtimeCleanup','snapshotCleanup'])assert.equal(a[k]?.cleanup,'complete',k);
  assert.equal(a.buildCopyRemoved,true);assert.equal(a.originalArtifactPreserved,true);
  assert.ok(artifact.fileCount>0);assert.match(artifact.sha256,hashPattern);
  assert.deepEqual(a.originalArtifact,artifact);assert.deepEqual(a.finalOriginalArtifact,artifact);assert.deepEqual(a.finalArtifact,artifact);assert.deepEqual(a.runtime?.artifact,artifact);
  const projects=['desktop','desktop-small','phone','phone-small'];
  assert.deepEqual(a.projects,projects);assert.deepEqual(Object.keys(requiredCases),projects);assert.deepEqual(a.requiredCases,requiredCases);
  assert.deepEqual(projects.map(p=>requiredCases[p].length),rel.caseCounts);
  assert.equal(a.playwright?.code,0);assert.equal(a.playwrightOutcome?.stats?.unexpected,0);assert.equal(a.playwrightOutcome?.stats?.flaky,0);
  const tests=a.playwrightOutcome.tests;assert.ok(tests.length>0);
  assert.ok(tests.every(t=>projects.includes(t.project)&&t.retries===0&&(t.status==='passed'&&t.expected==='passed'||t.status==='skipped'&&t.expected==='skipped')));
  assert.deepEqual(a.notExecuted,[]);assert.equal(a.checks.length,rel.checks);assert.ok(a.checks.every(c=>c.ok===true));
  assert.equal(a.oidcCleanup.expectedFixtures,4);assert.equal(a.oidcCleanup.fixtures.length,4);
  const screenshots=[],callbacks=[];const dimensions=[[1440,900],[1024,768],[390,664],[320,740]];
  for(const [i,p]of projects.entries()){
    const b=a.browserEvidence[p];const r=fileEvidence(b,read);assert.deepEqual(r,b.result);assert.equal(r.status,'PASS');assert.equal(r.project,p);assert.deepEqual(r.errors,[]);
    const expected=sorted(requiredCases[p]),names=r.checks.map(c=>c.case);assert.equal(new Set(names).size,names.length);assert.deepEqual(sorted(names),expected);assert.ok(r.checks.every(c=>c.ok===true));
    assert.deepEqual(sorted(a.checks.filter(c=>c.project===p).map(c=>c.case)),expected);
    assert.deepEqual(a.casesPerProject[p],{required:expected.length,passed:expected.length});
    assert.ok(tests.some(t=>t.project===p&&t.status==='passed'));
    const browser=a.browsers[p];assert.deepEqual(r.browser,browser);assert.equal(browser.name,p.startsWith('phone')?'webkit':'chromium');assert.ok(browser.version?.length>0);assert.deepEqual(browser.viewport,{width:dimensions[i][0],height:dimensions[i][1]});
    const canary=a.foreignCanary[p];assert.deepEqual(canary,r.foreignCanary);assert.equal(canary.unchanged,true);assert.deepEqual(canary.after,canary.before);assert.match(canary.before.sha256,hashPattern);
    for(const table of ['people','employments','duties','versions','specials'])assert.ok(canary.before.counts[table]>0,'Tom främmande kontroll: '+table);
    assert.ok(r.screenshots.length>0);assert.deepEqual(Object.keys(b.screenshotHashes).sort(),r.screenshots.map(s=>s.file).sort());
    for(const s of r.screenshots){relativeSource(s.file);const path=join(dirname(b.path),s.file);assert.equal(sha(read(path)),s.sha256);assert.equal(b.screenshotHashes[s.file],s.sha256);screenshots.push({path,sha256:s.sha256,review:'approved'});}
    const oidcRef=a.oidcEvidence[p],oidc=fileEvidence(oidcRef,read),oidcPath=oidcRef.path;assert.deepEqual(oidc,oidcRef.result);
    assert.equal(oidc.status,'PASS');assert.equal(oidc.databaseClosed,true);assert.equal(oidc.cleanup?.cleanup,'complete');assert.equal(oidc.proof?.cleanup,'complete');
    const auth=oidc.proof.auth;assert.ok(auth.length>0);const audits=new Set(),attempts=new Set(),callbackIds=new Set();
    for(const x of auth){assert.equal(x.status,'verified');assert.equal(x.proof?.proofKind,'browser-return-and-server-audit');assert.equal(x.proof.attemptId,x.id);
      for(const key of ['attemptId','callbackId','sessionId'])assert.match(x.proof[key],/^[0-9a-f-]{36}$/u);assert.match(x.proof.auditId,/^[1-9][0-9]*$/u,'Säkerhetsloggens id');
      assert.ok(!audits.has(x.proof.auditId)&&!attempts.has(x.id)&&!callbackIds.has(x.proof.callbackId));audits.add(x.proof.auditId);attempts.add(x.id);callbackIds.add(x.proof.callbackId);
      assert.ok(x.proof.httpStatus===null||x.proof.httpStatus>=300&&x.proof.httpStatus<400);}
    const expectedRoles=p==='desktop'?['hm','principalA','principalB','principalAB','admin','teacherSelf']:p==='desktop-small'?['hm','principalA','admin']:['hm','principalA','principalB','teacherSelf'];
    assert.deepEqual(oidcRef.requiredRoles,expectedRoles);assert.deepEqual(sorted([...new Set(auth.map(x=>x.role))]),sorted(expectedRoles));
    for(const role of expectedRoles)assert.ok(auth.some(x=>x.role===role&&x.stepUp===false),'Normal callback saknas: '+role);
    const clean=a.oidcCleanup.fixtures.filter(x=>x.project===p);assert.equal(clean.length,1);assert.equal(clean[0].cleanup,'complete');assert.equal(clean[0].verifiedCallbacks,auth.length);assert.equal(oidc.cleanup.verifiedCallbacks,auth.length);
    callbacks.push({path:oidcPath,sha256:oidcRef.sha256,count:auth.length});
  }
  assert.equal(a.oidcCleanup.verifiedCallbacks,callbacks.reduce((n,c)=>n+c.count,0));
  const visual=fileEvidence(manifest.visualReview,read);assert.equal(visual.kind,'tjanst-year-visual-review');assert.equal(visual.status,'PASS');assert.equal(visual.actualReportSha256,manifest.actual.sha256);assert.equal(visual.candidateRevision,revision);
  assert.deepEqual([...visual.screenshots].sort((a,b)=>a.path.localeCompare(b.path)),screenshots.sort((a,b)=>a.path.localeCompare(b.path)));
  const sql={};
  for(const kind of rel.sqlKinds){const ref=manifest.sql[kind],r=fileEvidence(ref,read);assert.equal(r.kind,kind);assert.equal(r.status,'PASS');assert.equal(r.mode,'schema-snapshot');
    assert.ok(r.checks.length>0&&r.checks.every(c=>c.ok===true));assert.equal(r.database?.dataCopied,false);assert.equal(r.database.sourceFingerprint,baselineFingerprint);
    assert.equal(r.cleanup,'complete');assert.equal(r.snapshotCleanup?.cleanup,'complete');assert.equal(r.targetUnchanged,true);assert.deepEqual(r.finalSources,r.sources);verifySources(r.sources,kind);
    for(const[p,h]of Object.entries(actualMigrations))assert.equal(r.sources[p],h,kind+': saknad migrationskälla');
    assert.deepEqual(r.pendingMigrations,rel.migrations);if(!rel.uncheckedStage.includes(kind))assert.equal(r.requestedStage,'current');
    sql[kind]={...ref,checks:r.checks.length};}
  return {sql,actual:{...manifest.actual,revision,checks:rel.checks,artifact,installedFingerprint:a.installedFingerprint,functionCount:rel.functionCount},visualReview:manifest.visualReview,callbacks};
}

// ---------- strukturkontroll (ren funktion) ----------
/** Jämför schemaFingerprint(…, true) före och efter. Returnerar listorna över tillkomna och ersatta objekt; kastar vid avvikelse. */
export function assertTransition(before, after, { stage, functionCount }) {
  if (Object.hasOwn(RELEASES, stage)) return assertYearTransition(before, after, { functionCount, stage });
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
export function assertPrivate(rows, entrypoints = WORKER_ENTRYPOINTS) {
  const open = rows.functions.filter(r => r.allowed).map(r => r.role + ':' + fn(r.signature));
  assert.deepEqual(sorted(open), sorted(entrypoints.map(e => 'skolplattform_worker:' + e)), 'Öppna nya funktioner');
  assert.deepEqual(rows.functions.filter(r => r.public_execute).map(r => r.signature), [], 'Nya funktioner öppna för public');
  assert.deepEqual(rows.relations.filter(r => r.allowed || r.public_any).map(r => r.role + ':' + r.relname), [], 'Nya relationer öppna');
  return { openForWorker: sorted(entrypoints), privateFunctions: new Set(rows.functions.map(r => r.signature)).size - entrypoints.length,
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

function yearMigrationInventory(){
  const files=readdirSync(resolve(root,'supabase/migrations')).filter(f=>/^\d{14}_.*\.sql$/u.test(f)&&f.slice(0,14)>='20261020000000').sort().map(f=>'supabase/migrations/'+f);
  assert.deepEqual(files,TJANST_MIGRATION_REGISTRY.map(m=>m.file),'Okänd eller saknad registrerad migration');return currentMigrationSources(files);
}
/** No mutation method receives the target connection: only read-only inventory opens it. */
export async function readYearTarget({installed=false,stage='year'}={}) {
  const rel=releaseOf(stage);
  const {assertTarget}=await import('./verify-target.mjs');
  const {schemaFingerprint}=await import('./named-timplan-snapshot.mjs');
  const {catalogColumns,projectionHashes}=await import('./verify-class-cohort.mjs');
  const target=await assertTarget('protected');
  const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
  try{return await db.begin('isolation level repeatable read read only',async tx=>{
    const rows=await tx`select version,name,statements from supabase_migrations.schema_migrations order by version`;
    const actualMigrations=yearMigrationInventory();
    const state=classifyTjanstMigrations({journal:rows.map(r=>r.version),sourceHashes:actualMigrations});
    const expected=installed?rel.actualMigrations:rel.prior;
    assert.deepEqual(state.installed,versionsOf(expected),stage+' kräver exakt registrerat före-/efterläge');
    assert.deepEqual(state.pendingMigrations,TJANST_MIGRATION_REGISTRY.slice(expected.length).map(m=>m.file));
    if(!installed)assert.deepEqual(state.pendingMigrations.slice(0,rel.migrations.length),rel.migrations);
    const journal=rows.filter(r=>r.version>='20261020000000').map(r=>{
      const file=expected.find(p=>p.split('/').at(-1).startsWith(r.version+'_'));
      assert.equal(r.name,file.split('/').at(-1).slice(15,-4));assert.deepEqual(r.statements,[readFileSync(resolve(root,file),'utf8')],'Installerad journal skiljer sig från fryst källa');
      return {version:r.version,sha256:sha(r.statements[0])};});
    const columns=await catalogColumns(tx),rowsHash=await projectionHashes(tx,columns);
    const invalid=await invalidPublishedJoints(tx);
    return {read:'repeatable read read only',fingerprint:await schemaFingerprint(tx),journal,journalFingerprint:sha(JSON.stringify(rows)),columns,rows:rowsHash,invalidPublishedJoints:invalid};
  });}finally{await db.end({timeout:5});}
}
/** IN-07: counts only, includes superseded decisions because they remain published history. */
async function invalidPublishedJoints(tx){
  const [r]=await tx`select count(*)::int groups,count(distinct g.version_id)::int versions,
    count(distinct g.version_id) filter(where v.status='published')::int current_versions,
    count(distinct g.version_id) filter(where v.status='superseded')::int historical_versions,
    count(*) filter(where v.status='published')::int current_groups,
    count(*) filter(where v.status='superseded')::int historical_groups
    from public.tjanst_joint_groups g join public.tjanst_versions v on v.id=g.version_id
    where v.status in ('published','superseded') and (
      (select count(distinct r.class_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)<2
      or exists(select 1 from public.tjanst_joint_teacher_time t where t.group_id=g.id and not exists(
        select 1 from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id and r.staff_person_id=t.staff_person_id)))`;
  return r;
}
async function seedYearRehearsal(tx,rel=RELEASES.year){
  const {createTjanstYearFixture}=await import('./tjanst-year-fixtures.mjs');
  const {planRead,planSend,planCommand,grantSelf}=await import('./tjanst-fixtures.mjs');
  const s=await createTjanstYearFixture(tx),{f,unitId,schoolYear}=s,p=s.people[0].personId;
  await grantSelf(tx,f,{staffPersonId:p,unitIds:[unitId]});await f.actor(tx,'principalA');
  // trial: the owned copy already has the year suffix, so only context-bound commands are accepted.
  const {capturePlanContext,yearCommand,yearCommandSend}=await import('./tjanst-year-fixtures.mjs');
  const sendCurrent=async(action,payload,choice)=>(await yearCommandSend(tx,await yearCommand(await capturePlanContext(tx,{unitId,schoolYear,action,payload,...(choice?{choice}:{})})))).result.detail;
  // Deliberate historical builder for year: the owned copy is still exactly the installed pre-year schema.
  const send=rel.stage!=='year'?(action,payload)=>action==='create_draft'?null:sendCurrent(action,payload,action==='save_row'?'manual':undefined):async(action,payload)=>{const current=await planRead(tx,{unitId,schoolYear});
    return (await planSend(tx,await planCommand(unitId,schoolYear,action,current.revision,payload,
      action==='publish'?{expectedContentHash:current.version.contentHash}:{}))).result.detail;};
  await send('create_draft',{basedOnVersionId:null});
  let d;
  for(const id of [f.classes.group,f.classes.other])d=await send('save_row',{rowId:null,sourceKind:'class_timplan',sourceKey:s.key('matematik',id),personId:p,teacherHt:600,teacherVt:720,comment:'Syntetiskt bevarande'});
  await send('save_special',{specialId:null,kind:'mentor',label:'Syntetiskt mentorskap',personId:p,classId:f.classes.group,ht:120,vt:180,comment:'Syntetisk kommentar'});
  await send('save_joint',{jointId:null,name:'Syntetisk samläsning',rowIds:d.rows.map(r=>r.id),teachers:[{personId:p,ht:700,vt:800}]});
  d=await send('publish',{});assert.equal(d.version.status,'published');assert.equal(d.rows.length,2);assert.equal(d.specials.length,1);assert.equal(d.joints.length,1);
  // The clone's journal is new synthetic state derived from the reviewed sources. No journal rows are copied from the target.
  assert.equal((await tx`select count(*)::int n from supabase_migrations.schema_migrations`)[0].n,0);
  for(const p of rel.prior)await tx`insert into supabase_migrations.schema_migrations(version,name,statements)
    values(${p.split('/').at(-1).slice(0,14)},${p.split('/').at(-1).slice(15,-4)},${[readFileSync(resolve(root,p),'utf8')]})`;
  return {synthetic:true,publishedVersions:1,publishedRows:2,publishedSpecials:1,publishedGroups:1,selfMandates:1};
}
async function preservedYearState(tx){
  const {catalogColumns,projectionHashes}=await import('./verify-class-cohort.mjs');
  const columns=await catalogColumns(tx),rows=await projectionHashes(tx,columns);
  const [mandates]=await tx`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(a)::text||public.phase3_mandate_shape(a)::text,'' order by a.id),'')) hash from public.access_assignments a`;
  const [published]=await tx`select count(*)::int count,md5(coalesce(string_agg(v.id::text||v.content_hash||public.tjanst_version_hash(v.id),'' order by v.id),'')) hash
    from public.tjanst_versions v where v.status in ('published','superseded')`;
  const journal=await tx`select version,name,statements from supabase_migrations.schema_migrations order by version`;
  return {columns,rows,mandates,published,journalHash:sha(JSON.stringify(journal)),journalCount:journal.length};
}
/** Lifecycle is separately tested: cleanup and fresh read-only target proof run even after a failed transaction. */
/** 05.1-33: stegets nya tabeller finns bara efter migreringen och ska då vara tomma; allt annat jämförs exakt. */
export function withoutNewTables(state,newTables=[]){
  const next=structuredClone(state);
  for(const t of newTables){assert.ok(!next.rows?.[t]||next.rows[t].count===0,'Ny tabell har rader efter migreringen: '+t);delete next.rows?.[t];delete next.columns?.[t];}
  return next;
}
export async function runOwnedYearRehearsal({readTarget,createSnapshot,seed,preserve,structure,migrate,checkInstalled,report,newTables=[]}){
  let snapshot,failure;
  report.targetBefore=await readTarget();report.committed=false;
  try{
    snapshot=await createSnapshot();report.database=snapshot.provenance;
    assert.equal(snapshot.provenance.dataCopied,false);assert.equal(snapshot.provenance.sourceFingerprint,report.targetBefore.fingerprint);
    assert.match(snapshot.provenance.database,/^named_timplan_[0-9a-f]{32}$/u,'Endast egen schemakopia');
    await snapshot.db.begin(async tx=>{report.synthetic=await seed(tx);});
    const before=await preserve(snapshot.db),schema=await structure(snapshot.db);
    assert.ok(before.published.count>0 && before.mandates.count>0,'Tom kopia bevisar inte bevarande');
    let completed=false;
    try{await snapshot.db.begin(async tx=>{
      await migrate(tx);
      assert.deepEqual(withoutNewTables(await preserve(tx),newTables),before,'Migration ändrade ursprungliga rader, kolumner, mandat, andelar, publicering eller journal');
      report.rehearsal=await checkInstalled(tx,schema);completed=true;throw ROLLBACK;
    });}catch(e){if(e!==ROLLBACK)throw e;}
    assert.equal(completed,true);assert.deepEqual(await structure(snapshot.db),schema,'Rollback återställde inte schema');
    assert.deepEqual(await preserve(snapshot.db),before,'Rollback återställde inte rader/journal');
    report.preservation={tables:Object.keys(before.rows).length,mandates:before.mandates,published:before.published,journalHash:before.journalHash,originalRowsHash:sha(JSON.stringify(before.rows)),rollback:true};
  }catch(e){failure=e;}
  finally{
    if(snapshot)try{report.cleanup=await snapshot.cleanup();assert.equal(report.cleanup.cleanup,'complete');}catch(e){failure??=e;}
    try{report.targetAfter=await readTarget();assert.deepEqual(report.targetAfter,report.targetBefore,'Installerat mål ändrades');report.targetUnchanged=true;}catch(e){failure??=e;report.targetUnchanged=false;}
  }
  if(failure)throw failure;
  return report;
}
/** The only year path that can obtain a writable target. Called only for an explicit --apply after the owned rehearsal. */
export async function runYearApply({mode,report,revalidate,connect,install,readAfter,stage='year'}){
  if(mode!=='apply'){assert.equal(mode,'rehearsal');return;}
  assert.equal(report.targetUnchanged,true);assert.equal(report.preservation?.rollback,true);assert.equal(report.cleanup?.cleanup,'complete');
  await revalidate();let db;
  try{db=await connect();await db.begin(async tx=>{report.installed=await install(tx);});report.committed=true;}
  finally{if(db)await db.end({timeout:5});}
  report.targetAfterInstall=await readAfter();
  assert.equal(report.targetAfterInstall.fingerprint,report.installed.afterFingerprint);
  for(const key of ['columns','rows','invalidPublishedJoints'])assert.deepEqual(report.targetAfterInstall[key],report.targetBefore[key],'Efterinstallation ändrade '+key);
  assert.deepEqual(report.targetAfterInstall.journal,releaseOf(stage).actualMigrations.map(p=>({version:p.split('/').at(-1).slice(0,14),sha256:currentMigrationSources([p])[p]})));
}
async function installYearTransaction(tx,expected,evidence,revalidate,rel=RELEASES.year){
  const {schemaFingerprint}=await import('./named-timplan-snapshot.mjs');
  // READ COMMITTED plus table locks: snapshots used for the comparisons are taken after waiting for prior writers.
  await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='180s'`;
  assert.equal((await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked,true,'Installationslåset är upptaget');
  const ident=v=>'"'+v.replaceAll('"','""')+'"';
  for(const table of Object.keys(expected.columns).sort())await tx.unsafe('lock table public.'+ident(table)+' in share row exclusive mode');
  await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
  const beforeSchema=await schemaFingerprint(tx,true),before=await preservedYearState(tx);
  assert.equal(await schemaFingerprint(tx),expected.fingerprint,'Schemat ändrades efter repetition');
  assert.deepEqual(before.columns,expected.columns);assert.deepEqual(before.rows,expected.rows);
  assert.equal(before.journalHash,expected.journalFingerprint,'Journalen ändrades efter repetition');
  await revalidate();
  const sources=currentMigrationSources(rel.migrations);
  for(const p of rel.migrations){const sql=readFileSync(resolve(root,p),'utf8');assert.equal(sha(sql),TJANST_MIGRATION_REGISTRY.find(m=>m.file===p).sha256);await tx.unsafe(sql);}
  await tx`set constraints all immediate`;
  assert.deepEqual(withoutNewTables(await preservedYearState(tx),rel.newTables),before,'Befintliga rader/mandat/andelar/publicering/journal ändrades');
  const objects=assertYearTransition(beforeSchema,await schemaFingerprint(tx,true),{functionCount:rel.functionCount,stage:rel.stage});
  const privacy=assertPrivate(await newObjectPrivileges(tx),YEAR_ENTRYPOINTS);assert.equal(privacy.privateFunctions,rel.privateFunctions);
  const afterFingerprint=await schemaFingerprint(tx);assert.equal(afterFingerprint,evidence.actual.installedFingerprint);
  for(const p of rel.migrations){const source=readFileSync(resolve(root,p),'utf8');assert.equal(sha(source),sources[p]);
    await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${p.split('/').at(-1).slice(0,14)},${p.split('/').at(-1).slice(15,-4)},${[source]})`;}
  const journal=await tx`select version,name,statements from supabase_migrations.schema_migrations where version>=${'20261020000000'} order by version`;
  assert.equal(journal.length,rel.journalCount);
  for(const [i,p]of rel.actualMigrations.entries())assert.deepEqual(journal[i],{version:p.split('/').at(-1).slice(0,14),name:p.split('/').at(-1).slice(15,-4),statements:[readFileSync(resolve(root,p),'utf8')]});
  const after=withoutNewTables(await preservedYearState(tx),rel.newTables);for(const key of ['columns','rows','mandates','published'])assert.deepEqual(after[key],before[key]);
  return {afterFingerprint,...objects,privacy,preservedTables:Object.keys(before.rows).length,mandates:before.mandates,published:before.published};
}
async function mainYear(opts){
  const rel=releaseOf(opts.stage);
  assert.ok(['collect','rehearsal','apply'].includes(opts.mode));
  const {productSources}=await import('./apply-apl-plan.mjs');
  const {verificationSources}=await import('./verify-tjanst-actual.mjs');
  const {TJANST_ACTUAL_CASES}=await import('./tjanst-oidc-fixtures.mjs');
  const {artifactManifest}=await import('./verify-programplan-copy-api.mjs');
  const {createNamedTimplanSnapshot,schemaFingerprint}=await import('./named-timplan-snapshot.mjs');
  const read=p=>{assert.ok(resolve(p).startsWith('/private/tmp/'));return readFileSync(p);};
  const migrations=currentMigrationSources(rel.migrations),actualMigrations=currentMigrationSources(rel.actualMigrations),registered=yearMigrationInventory();
  assert.deepEqual(Object.keys(registered),TJANST_MIGRATION_REGISTRY.map(m=>m.file));
  for(const m of TJANST_MIGRATION_REGISTRY)assert.equal(registered[m.file],m.sha256);
  const readTarget=(o={})=>readYearTarget({...o,stage:rel.stage});
  const target=await readTarget(),report={kind:'tjanst-installation',schemaVersion:2,stage:rel.stage,mode:opts.mode,status:'FAIL',startedAt:new Date().toISOString(),migrations,committed:false};
  let failure;
  try{
    let manifest;
    if(opts.mode==='collect'){
      const entries=opts.reports.map(path=>{const bytes=read(path);return [JSON.parse(bytes).kind,{path,sha256:sha(bytes)}];});
      assert.equal(new Set(entries.map(([k])=>k)).size,entries.length,'Dubbla SQL-rapporter');
      manifest={kind:'tjanst-sql-evidence',schemaVersion:2,stage:rel.stage,createdAt:new Date().toISOString(),migrations,actualMigrations,baselineFingerprint:target.fingerprint,
        sql:Object.fromEntries(entries),actual:{path:opts.actual,sha256:sha(read(opts.actual))},visualReview:{path:opts.visualReview,sha256:sha(read(opts.visualReview))}};
    }else manifest=JSON.parse(read(opts.evidencePath));
    const actual=fileEvidence(manifest.actual,read),candidate='/private/tmp/tjanst-candidate';
    const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
    assert.equal(actual.candidate.path,candidate);assert.equal(git(['rev-parse','HEAD'],candidate),actual.candidate.revision);
    assert.equal(git(['status','--porcelain','--untracked-files=no'],candidate),'','Kandidaten är inte ren');
    assert.equal(actual.candidate.build,join(candidate,'web/dist-protected'));
    const context={baselineFingerprint:target.fingerprint,journalFingerprint:target.journalFingerprint,migrations,actualMigrations,products:productSources(),verification:verificationSources(),requiredCases:TJANST_ACTUAL_CASES,
      sourceHash:p=>sha(readFileSync(resolve(root,p))),commitHash:(rev,p)=>sha(execFileSync('git',['show',rev+':'+p],{cwd:root,maxBuffer:128*1024*1024})),artifact:artifactManifest(actual.candidate.build),stage:rel.stage};
    report.evidence=requireYearEvidence(manifest,read,context);
    if(opts.mode==='collect'){const fd=openSync(opts.out,'wx',0o600);try{writeSync(fd,JSON.stringify(manifest,null,2)+'\n');}finally{closeSync(fd);}
      report.evidencePath=opts.out;report.evidenceSha256=sha(read(opts.out));
    }else{
      report.sqlEvidence={path:opts.evidencePath,sha256:sha(read(opts.evidencePath))};
      await runOwnedYearRehearsal({readTarget,createSnapshot:createNamedTimplanSnapshot,seed:tx=>seedYearRehearsal(tx,rel),preserve:preservedYearState,newTables:rel.newTables??[],
        structure:q=>schemaFingerprint(q,true),migrate:async tx=>{
          await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='180s'`;
          for(const p of rel.migrations){const sql=readFileSync(resolve(root,p),'utf8');assert.equal(sha(sql),TJANST_MIGRATION_REGISTRY.find(m=>m.file===p).sha256);await tx.unsafe(sql);}await tx`set constraints all immediate`;
        },checkInstalled:async(tx,before)=>{
          const after=await schemaFingerprint(tx,true),objects=assertYearTransition(before,after,{functionCount:rel.functionCount,stage:rel.stage});
          const privacy=assertPrivate(await newObjectPrivileges(tx),YEAR_ENTRYPOINTS);assert.equal(privacy.privateFunctions,rel.privateFunctions);
          const fingerprint=await schemaFingerprint(tx);assert.equal(fingerprint,report.evidence.actual.installedFingerprint);
          return {afterFingerprint:fingerprint,...objects,privacy};
        },report});
      assert.deepEqual(report.targetBefore,target,'Målet ändrades efter bevisgrinden');
      // No source or original artifact drift during repetition, including all evidence file hashes.
      const revalidate=async()=>requireYearEvidence(manifest,read,{...context,products:productSources(),verification:verificationSources(),artifact:artifactManifest(actual.candidate.build)});
      await revalidate();
      await runYearApply({mode:opts.mode,report,stage:rel.stage,revalidate:async()=>{await revalidate();assert.deepEqual(await readTarget(),target);},
        connect:async()=>{const {assertTarget}=await import('./verify-target.mjs');const t=await assertTarget('protected');return createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(t.dbUrl,{max:1,prepare:false,onnotice:()=>{}});},
        install:tx=>installYearTransaction(tx,target,report.evidence,revalidate,rel),readAfter:()=>readTarget({installed:true})});
    }
    report.status='PASS';
  }catch(e){failure=e;report.error=e.message;}
  report.finishedAt=new Date().toISOString();
  const out=opts.mode==='collect'?opts.out.replace(/\.json$/u,'-collect-report.json'):opts.out;
  const fd=openSync(out,'wx',0o600);try{writeSync(fd,JSON.stringify(report,null,2)+'\n');}finally{closeSync(fd);}
  console.log(report.status+': '+rel.stage+' '+opts.mode+'; committed='+report.committed+'; privat rapport '+out);
  return failure?1:0;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (Object.hasOwn(RELEASES, opts.stage)) return mainYear(opts);
  const st = stageOf(opts.stage), stageMigrations = st.migrations, stageVersions = versionsOf(stageMigrations);
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
