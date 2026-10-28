#!/usr/bin/env node
// 05.1-33 / D-31: flera lärare på samma behov (delningsform och betygssättare). Endast ägd databas och syntetiska data.
// node work/pilot/verify-tjanst-sharing.mjs --ephemeral --out /private/tmp/tjanst-sharing.json
// Utan --ephemeral: schemakopia av skyddat lokalt mål, där bara registrerat saknat suffix installeras.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { planRead, selfRead, grantSelf, tjanstMigrations } from './tjanst-fixtures.mjs';
import { createTjanstYearFixture, capturePlanContext, yearCommand, yearCommandSend, yearManual } from './tjanst-year-fixtures.mjs';
import { parseYearPlanReadReply, parseSelfReadReply } from '../../web/lib/tjanst-contract.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261028100000_tjanst_need_sharing.sql';
const rollback = Error('expected_sharing_rollback');
const sourceFiles = [...tjanstMigrations, OWN, 'work/pilot/verify-tjanst-sharing.mjs', 'work/pilot/tjanst-year-fixtures.mjs', 'work/pilot/tjanst-fixtures.mjs',
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
const read = async s => parseYearPlanReadReply(await planRead(s.t, { unitId: s.unitId, schoolYear: s.schoolYear }), { unitId: s.unitId, schoolYear: s.schoolYear });
const codes = d => d.blockers.map(b => b.code);
async function send(s, action, payload, choice) {
  const captured = await capturePlanContext(s.t, { unitId: s.unitId, schoolYear: s.schoolYear, action, payload, ...(choice ? { choice } : {}) });
  return (await yearCommandSend(s.t, await yearCommand(captured))).result.detail;
}
const saveRow = (s, classId, personId, ht = 600, vt = 600, rowKey = 'matematik') => send(s, 'save_row', { rowId: null, sourceKind: 'class_timplan', sourceKey: s.key(rowKey, classId), personId,
  teacherHt: ht, teacherVt: vt, comment: '' }, personId ? 'manual' : 'unassigned');
const sharing = (s, mode, graderPersonIds, sourceKey = s.need) => send(s, 'save_sharing', { sourceKey, mode, graderPersonIds });
const sums = async s => (await s.t`select public.tjanst_school_sums(${(await read(s)).version.id}::uuid,${s.unitId}::uuid,${s.schoolYear}::integer) value`)[0].value;
async function setup(t) {
  const y = await createTjanstYearFixture(t), s = { ...y, t, p0: y.people[0].personId, p1: y.people[1].personId, p4: y.people[4].personId };
  s.need = y.key('matematik', y.f.classes.group);
  await saveRow(s, y.f.classes.group, s.p0, 600, 600); await saveRow(s, y.f.classes.group, s.p1, 600, 600);
  return s;
}

async function cases(db, report) {
  await rolledBack(db, async t => {
    const s = await setup(t);
    let d = await read(s);
    assert.ok(codes(d).includes('shared_need_unspecified')); assert.equal(d.capabilities.canPublish, false); assert.ok(d.actions.includes('save_sharing'));
    assert.deepEqual(d.sharing, []);
    check(report, 'två lärare på samma behov utan delning ger hindret shared_need_unspecified och ingen publicering');
    const hashUnspecified = d.version.contentHash, sequentialSums = await sums(s);
    d = await sharing(s, 'concurrent', [s.p0]);
    assert.deepEqual(d.sharing, [{ sourceKey: s.need, mode: 'concurrent', graderPersonIds: [s.p0] }]); assert.deepEqual(codes(d), []);
    assert.notEqual(d.version.contentHash, hashUnspecified);
    check(report, 'samtidigt med betygssättare häver hindret, syns i läsningen och ändrar innehållshashen');
    const need = d.classes.find(c => c.classId === s.f.classes.group).needs.find(n => n.sourceKey === s.need), concurrentSums = await sums(s);
    const gap = (n, c) => n === null ? 0 : Math.max(0, n - c);
    assert.equal(concurrentSums.unallocated.ht - sequentialSums.unallocated.ht, gap(need.needHt, 600) - gap(need.needHt, 1200));
    assert.equal(concurrentSums.unallocated.vt - sequentialSums.unallocated.vt, gap(need.needVt, 600) - gap(need.needVt, 1200));
    assert.deepEqual(concurrentSums.teaching, sequentialSums.teaching);
    check(report, 'huvudmannens summor: samtidigt räknar behovet en gång, lärarnas undervisning summeras oförändrat', { need: [need.needHt, need.needVt] });
    d = await sharing(s, 'sequential', [s.p1]);
    assert.deepEqual(d.sharing, [{ sourceKey: s.need, mode: 'sequential', graderPersonIds: [s.p1] }]);
    check(report, 'byte till en i taget ersätter form och betygssättare');
    await denied(t, report, 'betygssättare som inte har tid på behovet nekas', () => sharing({ ...s, t }, 'concurrent', [s.p4]), '22023', 'tjanst_sharing_grader');
    const one = s.key('matematik', s.f.classes.other); await saveRow(s, s.f.classes.other, s.p0);
    await denied(t, report, 'delning med bara en lärare nekas', () => sharing({ ...s, t }, 'concurrent', [s.p0], one), '22023', 'tjanst_sharing_too_few');
    d = await send(s, 'clear_sharing', { sourceKey: s.need });
    assert.deepEqual(d.sharing, []); assert.ok(codes(d).includes('shared_need_unspecified'));
    check(report, 'uttrycklig rensning tar bort delningen och hindret kommer tillbaka');
  });
  await rolledBack(db, async t => {
    const s = await setup(t);
    await saveRow(s, s.f.classes.group, s.p4, 300, 300);
    let d = await sharing(s, 'concurrent', [s.p0]);
    const row = d.rows.find(r => r.sourceKey === s.need && r.personId === s.p0);
    d = await send(s, 'delete_row', { rowId: row.id });
    assert.ok(codes(d).includes('grader_missing')); assert.ok(!codes(d).includes('shared_need_unspecified'));
    check(report, 'en betygssättare utan kvarvarande tid ger hindret grader_missing (ingen tyst ändring)');
    d = await sharing(s, 'concurrent', [s.p1, s.p4]); assert.deepEqual(codes(d), []);
    check(report, 'ny angiven betygssättare häver grader_missing');
  });
  await rolledBack(db, async t => {
    const s = await setup(t);
    await saveRow(s, s.f.classes.other, s.p0);
    const d0 = await read(s), rowIds = [d0.rows.find(r => r.sourceKey === s.need && r.personId === s.p0).id, d0.rows.find(r => r.sourceKey === s.key('matematik', s.f.classes.other)).id];
    await send(s, 'save_joint', { jointId: null, name: 'Syntetisk samläsning', rowIds, teachers: [{ personId: s.p0, ht: 600, vt: 600 }] });
    await denied(t, report, 'delning av ett samläst behov nekas (D-28 och D-31 kombineras inte)', () => sharing({ ...s, t }, 'concurrent', [s.p0]), '22023', 'tjanst_sharing_joint');
  });
  await rolledBack(db, async t => {
    // Behov med en samläst rad och två lärare utanför samläsningen: hindret och delningen räknar samma lärare.
    const s = await setup(t);
    await saveRow(s, s.f.classes.other, s.p0);
    const d0 = await read(s), rowIds = [d0.rows.find(r => r.sourceKey === s.need && r.personId === s.p0).id, d0.rows.find(r => r.sourceKey === s.key('matematik', s.f.classes.other)).id];
    await send(s, 'save_joint', { jointId: null, name: 'Syntetisk samläsning', rowIds, teachers: [{ personId: s.p0, ht: 600, vt: 600 }] });
    let d = await saveRow(s, s.f.classes.group, s.p4, 300, 300);
    d = await read(s); assert.ok(codes(d).includes('shared_need_unspecified'));
    await denied(t, report, 'samläst lärare kan inte vara betygssättare i delningen utanför samläsningen', () => sharing({ ...s, t }, 'sequential', [s.p0]), '22023', 'tjanst_sharing_grader');
    d = await sharing(s, 'sequential', [s.p4]);
    assert.deepEqual(d.sharing, [{ sourceKey: s.need, mode: 'sequential', graderPersonIds: [s.p4] }]); assert.ok(!codes(d).includes('shared_need_unspecified'));
    check(report, 'delvis samläst behov: två lärare utanför samläsningen kan få delning, och hindret hävs');
  });
  await rolledBack(db, async t => {
    const s = await setup(t);
    await sharing(s, 'concurrent', [s.p0, s.p1]);
    let d = await send(s, 'publish', {}); assert.equal(d.version.status, 'published');
    check(report, 'delat behov med angiven form kan publiceras');
    // Ny ändring skapar ett nytt utkast; delningen följer med.
    await saveRow(s, s.f.classes.other, s.p0);
    d = await read(s); assert.equal(d.version.status, 'draft');
    assert.deepEqual(d.sharing, [{ sourceKey: s.need, mode: 'concurrent', graderPersonIds: [s.p0, s.p1].sort() }]);
    check(report, 'delning och betygssättare kopieras till nästa utkast');
    // Flytt: betygssättaren följer personbytet.
    const row = d.rows.find(r => r.sourceKey === s.need && r.personId === s.p1);
    const catalog = (await t`select public.tjanst_year_preview(${t.json({ unitId: s.unitId, schoolYear: s.schoolYear, mode: 'catalog' })}) value`)[0].value;
    const target = catalog.candidates.find(p => p.personId === s.p4);
    d = await send(s, 'move', { action: 'move', baseVersionId: d.version.id, items: [{ itemKey: 'row-1', kind: 'row', id: row.id, fromPersonId: s.p1, choice: yearManual(target) }] });
    assert.deepEqual(d.sharing.find(x => x.sourceKey === s.need).graderPersonIds, [s.p0, s.p4].sort());
    check(report, 'flytt av en lärares rad flyttar betygsansvaret till den nya läraren');
  });
  await rolledBack(db, async t => {
    const s = await setup(t);
    await sharing(s, 'concurrent', [s.p0]);
    await send(s, 'publish', {});
    await grantSelf(t, s.f, { staffPersonId: s.p0, unitIds: [s.unitId] }); await s.f.actor(t, 'teacherSelf');
    const self = parseSelfReadReply(await selfRead(t)), rows = self.publications.flatMap(p => p.rows).filter(r => r.label && r.sharing);
    assert.equal(rows.length, 1); assert.equal(rows[0].sharing.mode, 'concurrent'); assert.equal(rows[0].sharing.grader, true); assert.equal(rows[0].sharing.colleagues.length, 1);
    check(report, 'Min tjänst visar delning, kollega och att läraren sätter betyg');
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
    report.baselineMode = 'ephemeral-before-sharing'; report.pendingMigrations = [OWN];
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

export async function verifyTjanstSharing(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok(output.startsWith('/private/tmp/') && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-need-sharing', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Syntetiska SQL-prov i ägd databas; ingen installerad målskrivning, HTTP/OIDC eller webbläsarbedömning',
      'Behörighet för betygssättare prövas inte (fas 05.4); skollagen 3 kap. 16 § återges bara som krav på minst en betygssättare med tid',
      'SS 12000: avsedd mappning (Activity med flera lärartilldelningar); inget informationsutbyte verifierat'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); source = await openDatabase(ephemeral, report); report.database = source.provenance;
    const db = source.db;
    assert.ok(source.pending.includes(OWN), 'Delningsmigrationen ska vara väntande i provdatabasen');
    const before = await allPublicHashes(db), meta = await functionMeta(db), fingerprint = await schemaFingerprint(db), open = await workerOpen(db);
    const versionHashes = await db`select v.id,public.tjanst_version_hash(v.id) h from public.tjanst_versions v order by v.id`;
    await rolledBack(db, t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    assert.equal(await schemaFingerprint(db), fingerprint); assert.deepEqual(await allPublicHashes(db), before);
    check(report, 'migration med återrullning bevarar schema, ACL och samtliga rader');
    await db.begin(t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    const migrated = await allPublicHashes(db), NEW = ['tjanst_need_graders', 'tjanst_need_sharing'];
    for (const table of NEW) assert.equal(migrated[table]?.count, 0, table);
    assert.deepEqual(Object.fromEntries(Object.entries(migrated).filter(([k]) => !NEW.includes(k))), before);
    assert.deepEqual(await db`select v.id,public.tjanst_version_hash(v.id) h from public.tjanst_versions v order by v.id`, versionHashes);
    check(report, 'befintliga versioners innehållshash är oförändrad efter migrationen', { versions: versionHashes.length });
    const after = await functionMeta(db);
    const replaced = ['tjanst_plan_parse', 'tjanst_year_apply_one', 'tjanst_year_apply_batch', 'tjanst_plan_copy_extras', 'tjanst_version_hash', 'tjanst_plan_blockers',
      'tjanst_plan_projection', 'tjanst_command_ref', 'tjanst_school_sums', 'tjanst_self_projection'];
    const added = Object.keys(after).filter(k => !meta[k]).sort();
    assert.deepEqual(added, ['tjanst_plan_clear_sharing(tjanst_distributions,jsonb)', 'tjanst_plan_save_sharing(tjanst_distributions,jsonb)']);
    for (const [name, original] of Object.entries(meta)) {
      if (replaced.includes(original.name)) { assert.notEqual(after[name].definition, original.definition, name); assert.deepEqual({ ...after[name], definition: '' }, { ...original, definition: '' }, name); }
      else assert.deepEqual(after[name], original, name);
    }
    for (const name of added) for (const role of ['public', 'anon', 'authenticated', 'service_role', 'skolplattform_worker'])
      if (role !== 'public') assert.equal((await db`select has_function_privilege(${role},${name},'EXECUTE') x`)[0].x, false, name + ' ' + role);
    for (const table of ['tjanst_need_sharing', 'tjanst_need_graders']) {
      const [rls] = await db`select relrowsecurity r,relforcerowsecurity f from pg_class where oid=${'public.' + table}::regclass`; assert.ok(rls.r && rls.f, table);
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
        assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE') x`)[0].x, false, table + ' ' + role);
    }
    assert.deepEqual(await workerOpen(db), open); assert.equal(open.length, 13);
    check(report, 'tio funktioner ersätts med bevarad ägare, ACL och sökväg; två nya stängda funktioner; nya tabeller med tvingad RLS utan rättigheter; 13 öppna ingångar');
    const installed = await allPublicHashes(db); await cases(db, report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'alla syntetiska beteendeprov rullas tillbaka utan kvarvarande rader');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' delningskontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  void randomUUID;
  await verifyTjanstSharing(rest[1], { ephemeral });
}
