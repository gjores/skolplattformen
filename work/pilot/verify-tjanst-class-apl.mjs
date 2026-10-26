#!/usr/bin/env node
// 05.1-27: APL-minuter per gymnasieklass i tjänstefördelningens läsning. Endast ägd databas och syntetiska data.
// node work/pilot/verify-tjanst-class-apl.mjs --ephemeral --out /private/tmp/tjanst-class-apl.json
// Utan --ephemeral: schemakopia av skyddat lokalt mål, där bara registrerat saknat suffix installeras.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { createTjanstFixture, planRead, seedGrimNeeds, seedGy25Class, tjanstMigrations } from './tjanst-fixtures.mjs';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261026110000_tjanst_class_apl.sql';
const rollback = Error('expected_class_apl_rollback');
const sourceFiles = [...tjanstMigrations, OWN, 'work/pilot/verify-tjanst-class-apl.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs', 'web/lib/tjanst-contract.ts', 'web/lib/tjanst-year-contract.ts'];
const sources = () => {
  const pending = [...sourceFiles], found = new Map(), ts = createRequire(resolve(ROOT, 'web/package.json'))('typescript');
  while (pending.length) {
    const path = pending.pop(); if (found.has(path)) continue;
    const bytes = readFileSync(resolve(ROOT, path)); found.set(path, createHash('sha256').update(bytes).digest('hex'));
    if (!/\.(?:mjs|ts)$/u.test(path)) continue;
    const parsed = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true), imports = [];
    const visit = node => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node, visit);
    }; visit(parsed);
    for (const specifier of imports) {
      let target = resolve(ROOT, dirname(path), specifier); if (!existsSync(target)) target += '.ts';
      assert.ok(target.startsWith(ROOT) && existsSync(target), 'Unresolved local source ' + specifier + ' from ' + path);
      pending.push(relative(ROOT, target));
    }
  }
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
};
const check = (r, name, detail) => { r.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); };
async function denied(t, r, name, fn, code, hint) {
  let error; try { await t.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial'); assert.equal(error.code, code, error.message);
  if (hint) assert.equal(error.hint, hint, error.message);
  check(r, name, { code, ...(hint ? { hint } : {}) });
}
async function rolledBack(db, fn) {
  try { await db.begin(async t => { await t`set local lock_timeout='10s'`; await t`set local statement_timeout='120s'`; await fn(t); throw rollback; }); }
  catch (e) { if (e !== rollback) throw e; }
}
const functionMeta = async db => Object.fromEntries((await db`select p.oid::regprocedure::text signature,p.proname name,pg_get_functiondef(p.oid) definition,coalesce(p.proacl::text,'') acl,p.proowner::regrole::text owner,p.prosecdef definer,p.proconfig config
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`).map(r => [r.signature, r]));
const workerOpen = async db => (await db`select p.oid::regprocedure::text s from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') order by 1`).map(r => r.s);
const rawRead = async (t, f, schoolYear) => (await planRead(t, { unitId: f.schools.A, schoolYear }));
const classOf = (d, classId) => d.classes.find(c => c.classId === classId);
async function setup(t) { const f = await createTjanstFixture(t); const gy = await seedGy25Class(t, f); await f.actor(t, 'principalA'); return { f, gy }; }
let projectionBefore = null;
async function beforeCases(db, report) {
  await rolledBack(db, async t => {
    const { f, gy } = await setup(t); const d = await rawRead(t, f, gy.year);
    assert.ok(classOf(d, gy.classId) && !Object.hasOwn(classOf(d, gy.classId), 'aplMinutes'));
    projectionBefore = d;
    check(report, 'före migrationen saknar läsningen APL per klass');
  });
}
const withoutApl = d => ({ ...d, classes: d.classes.map(({ aplMinutes: _a, ...c }) => c) });
const stable = d => JSON.parse(JSON.stringify(d, (k, v) => /^(id|classId|versionId|planId|timplanId|seriesId|sourceKey|unitId|schoolName|lineageId)$/u.test(k) ? '·' : v));
async function cases(db, report) {
  await rolledBack(db, async t => {
    const { f, gy } = await setup(t); let d = await rawRead(t, f, gy.year);
    assert.equal(classOf(d, gy.classId).aplMinutes, 20700); check(report, 'gymnasieklass med APL i år 1 ger summan för kopplingens år (20 700 min)', { aplMinutes: 20700 });
    assert.deepEqual(stable(withoutApl(d)), stable(projectionBefore)); check(report, 'projektionen är i övrigt oförändrad');
    const parsed = parseYearPlanReadReply(d, { unitId: f.schools.A, schoolYear: gy.year }); assert.equal(parsed.classes.find(c => c.classId === gy.classId).aplMinutes, 20700);
    check(report, 'kontraktet tolkar aplMinutes');
    // Märkt syntetiskt gränsfall i ägd provtransaktion: tidsradernas skyddstrigger kringgås lokalt bara för dessa två ändringar.
    await t`set local session_replication_role = replica`;
    // Samma tidsmodell utan APL.
    await t`update public.timplan_time_cells_v2 set annual_apl_minutes=(select jsonb_agg(case when jsonb_typeof(x)='number' then to_jsonb(0) else x end) from jsonb_array_elements(annual_apl_minutes) x) where plan_id=${gy.planId}`;
    await t`set local session_replication_role = origin`;
    d = await rawRead(t, f, gy.year); assert.equal(classOf(d, gy.classId).aplMinutes, 0); check(report, 'tidsmodell utan APL ger 0');
    await t`set local session_replication_role = replica`;
    await t`delete from public.timplan_time_cells_v2 where plan_id=${gy.planId}`; await t`delete from public.timplan_time_models where plan_id=${gy.planId}`;
    await t`set local session_replication_role = origin`;
    d = await rawRead(t, f, gy.year); assert.equal(classOf(d, gy.classId).aplMinutes, null); check(report, 'saknad tidsmodell ger okänt (null), inte 0');
  });
  await rolledBack(db, async t => {
    const f = await createTjanstFixture(t); await seedGrimNeeds(t, f); await f.actor(t, 'principalA');
    const d = await rawRead(t, f, 2026); const linked = d.classes.filter(c => c.link);
    assert.ok(linked.length > 0 && linked.every(c => c.aplMinutes === null)); check(report, 'GR- och IM-klasser ger okänt (null)');
    const legacy = parseYearPlanReadReply(withoutApl(d), { unitId: f.schools.A, schoolYear: 2026 }); assert.ok(legacy.classes.every(c => c.aplMinutes === null));
    check(report, 'äldre läsning utan aplMinutes tolkas som okänt');
  });
}

async function openDatabase(ephemeral, report) {
  const { classifyTjanstMigrations, assertTjanstSelfMandatesSchema, TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
  const { createEphemeralMigratedDb, migrationFiles } = await import('./ephemeral-migrated-db.mjs');
  const ownVersion = basename(OWN).slice(0, 14);
  const sourceHashes = Object.fromEntries(migrationFiles().filter(f => f.slice(0, 14) >= TJANST_PHASE_START)
    .map(f => ['supabase/migrations/' + f, createHash('sha256').update(readFileSync(resolve(ROOT, 'supabase/migrations', f))).digest('hex')]));
  classifyTjanstMigrations({ journal: TJANST_MIGRATION_REGISTRY.filter(m => m.version < ownVersion).map(m => m.version), sourceHashes });
  if (ephemeral) {
    const e = await createEphemeralMigratedDb({ exclude: migrationFiles().filter(f => f.slice(0, 14) >= ownVersion) });
    try { await assertTjanstSelfMandatesSchema(e.db, { installed: true }); } catch (error) { await e.end(); throw error; }
    report.baselineMode = 'ephemeral-before-class-apl'; report.pendingMigrations = [OWN];
    return { db: e.db, provenance: e.provenance, pending: [OWN], close: e.end };
  }
  const { targetPendingMigrations } = await import('./verify-tjanst-actual.mjs');
  const target = await targetPendingMigrations();
  const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
  const snapshot = await createNamedTimplanSnapshot();
  try {
    assert.equal(snapshot.provenance.sourceFingerprint, target.fingerprint, 'Målschemat ändrades mellan journalprövning och schemakopia');
    report.targetJournal = target.journal; report.baselineMode = target.baselineMode; report.pendingMigrations = target.pendingMigrations;
    const prior = target.pendingMigrations.filter(p => basename(p).slice(0, 14) < ownVersion);
    if (prior.length) await snapshot.db.begin(async t => { for (const p of prior) await t.unsafe(readFileSync(resolve(ROOT, p), 'utf8')); });
    report.appliedPrerequisites = prior;
    return { db: snapshot.db, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup(); const after = await targetPendingMigrations();
        assert.equal(after.fingerprint, target.fingerprint); assert.deepEqual(after.journal, target.journal); report.targetUnchanged = true; } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}

export async function verifyTjanstClassApl(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok(output.startsWith('/private/tmp/') && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-class-apl', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Syntetiska SQL-prov i ägd databas; ingen installerad målskrivning, HTTP/OIDC eller webbläsarbedömning',
      'Tidsmodell utan APL och saknad tidsmodell är uttryckligt skapade syntetiska gränsfall i ägd provtransaktion',
      'SS 12000:2024 utgåva 4 / OpenAPI 2.1.0: APL-minuter är en härledd planeringsuppgift; inget informationsutbyte verifierat'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); source = await openDatabase(ephemeral, report); report.database = source.provenance;
    const db = source.db;
    assert.ok(source.pending.includes(OWN), 'APL-migrationen ska vara väntande i provdatabasen');
    const before = await allPublicHashes(db), meta = await functionMeta(db), fingerprint = await schemaFingerprint(db), open = await workerOpen(db);
    await beforeCases(db, report); assert.deepEqual(await allPublicHashes(db), before);
    await rolledBack(db, t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    assert.equal(await schemaFingerprint(db), fingerprint); assert.deepEqual(await allPublicHashes(db), before);
    check(report, 'migration med återrullning bevarar schema, ACL och samtliga rader');
    await db.begin(t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    assert.deepEqual(await allPublicHashes(db), before);
    const after = await functionMeta(db), replaced = ['tjanst_plan_projection'];
    assert.deepEqual(Object.keys(after).filter(k => !k.startsWith('tjanst_class_apl_minutes(')).sort(), Object.keys(meta).sort());
    const helper = Object.values(after).find(f => f.name === 'tjanst_class_apl_minutes'); assert.ok(helper && helper.definer);
    assert.equal((await db`select bool_or(has_function_privilege(r,'public.tjanst_class_apl_minutes(jsonb)','EXECUTE')) open from unnest(array['anon','authenticated','service_role','skolplattform_worker']) r`)[0].open, false);
    for (const [name, original] of Object.entries(meta)) {
      if (replaced.includes(original.name)) { assert.notEqual(after[name].definition, original.definition); assert.deepEqual({ ...after[name], definition: '' }, { ...original, definition: '' }); }
      else assert.deepEqual(after[name], original, name);
    }
    assert.deepEqual(await workerOpen(db), open); assert.equal(open.length, 13);
    check(report, 'bara projektionen ersätts och en stängd hjälpfunktion tillkommer; ägare, ACL, SECURITY DEFINER, search_path och 13 öppna ingångar bevaras');
    const installed = await allPublicHashes(db); await cases(db, report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'alla syntetiska beteendeprov rullas tillbaka utan kvarvarande rader');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' APL-kontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstClassApl(rest[1], { ephemeral });
}
