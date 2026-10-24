#!/usr/bin/env node
// 05.1-15 / WR-10. Endast ägd databas och syntetiska data. Inget installerat mål skrivs.
// node work/pilot/verify-tjanst-publish-scope.mjs --ephemeral --out /private/tmp/tjanst-publish-scope.json
// Utan --ephemeral: schemakopia av skyddat lokalt mål, med bara registrerat saknat suffix.
import assert from 'node:assert/strict';
import { capturePlanContext, yearCommandSend } from './tjanst-year-fixtures.mjs';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';
let modern = false; // Set once for each explicitly selected schema stage; never a parser fallback.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { createTjanstFixture, staffWithDuties, seedGrimNeeds, planCommand, planRead, planSend,
  personalCommand, saveDuties, grantSelf, selfRead, tjanstMigrations } from './tjanst-fixtures.mjs';
import { parsePlanCommandReply, parsePlanReadReply, parseSelfReadReply } from '../../web/lib/tjanst-contract.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261023100000_tjanst_publish_person_scope.sql';
const Y = 2026, rollback = Error('expected_publish_scope_rollback');
const sourceFiles = [...tjanstMigrations, 'work/pilot/tjanst-year-fixtures.mjs', 'web/lib/tjanst-year-contract.ts', 'web/lib/tjanst-contract.ts', OWN, 'work/pilot/verify-tjanst-publish-scope.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs'];
// Pin transitive imports using the same AST inventory as the year-preview verifier.
const sources = () => {
  const pending = [...sourceFiles], found = new Map();
  while (pending.length) {
    const path = pending.pop(); if (found.has(path)) continue;
    const bytes = readFileSync(resolve(ROOT,path)); found.set(path,createHash('sha256').update(bytes).digest('hex'));
    if (!/\.(?:mjs|ts)$/u.test(path)) continue;
    const ts = createRequire(resolve(ROOT,'web/package.json'))('typescript');
    const parsed = ts.createSourceFile(path,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
    const imports = [];
    const visit = node => {
      const specifier = (ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node,visit);
    };visit(parsed);
    for (const specifier of imports) {
      let target = resolve(ROOT,dirname(path),specifier);
      if (!existsSync(target)) target += '.ts';
      assert.ok(target.startsWith(ROOT) && existsSync(target),'Unresolved local source '+specifier+' from '+path);
      pending.push(relative(ROOT,target));
    }
  }
  return Object.fromEntries([...found].sort(([a],[b])=>a.localeCompare(b)));
};
const read = async (t, unitId) => (modern ? parseYearPlanReadReply : parsePlanReadReply)(await planRead(t, { unitId, schoolYear: Y }), { unitId, schoolYear: Y });
const send = async (t, q) => modern ? (await yearCommandSend(t,q)).result : parsePlanCommandReply((await planSend(t,q)).result,q);
const codes = d => d.blockers.map(b => b.code);
const check = (r, name, detail) => { r.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); };
async function denied(t, r, name, fn, code, hint) {
  let error; try { await t.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial'); assert.equal(error.code, code, error.message);
  if (hint) assert.equal(error.hint, hint);
  check(r, name, { code, ...(hint ? { hint } : {}) });
}
async function rolledBack(db, fn) {
  try { await db.begin(async t => { await t`set local lock_timeout='10s'`; await t`set local statement_timeout='120s'`; await fn(t); throw rollback; }); }
  catch (e) { if (e !== rollback) throw e; }
}
const functionMeta = async db => Object.fromEntries((await db`select p.oid::regprocedure::text signature,p.proname name,pg_get_functiondef(p.oid) definition,coalesce(p.proacl::text,'') acl,p.proowner::regrole::text owner,p.prosecdef definer,p.proconfig config
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`).map(r => [r.signature, r]));

async function fixture(t, { specialOnly = true } = {}) {
  const f = await createTjanstFixture(t), A = f.schools.A;
  const staff = await staffWithDuties(t, f, { familyName: 'Specialuppdrag', duties: [{ unitId: A, percent: 50, startsOn: '2026-07-01', endsOn: '2027-06-30' }] });
  await seedGrimNeeds(t, f); await f.actor(t, 'principalA');
  let d = (await send(t, await (modern ? planCommand(A, Y, 'add_teacher', 0, (await capturePlanContext(t,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:staff.personId}})).payload) : planCommand(A, Y, 'create_draft', 0, { basedOnVersionId: null })))).detail;
  const need = d.classes.find(c => c.classId === f.classes.group).needs.find(n => n.rowKey === 'matematik');
  d = (await send(t, await planCommand(A, Y, 'save_row', d.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: null, teacherHt: 600, teacherVt: 600, comment: '' }, choice: 'unassigned' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: null, teacherHt: 600, teacherVt: 600, comment: '' }))).detail;
  d = (await send(t, await planCommand(A, Y, 'save_special', d.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'annat', label: 'Syntetiskt specialuppdrag', personId: staff.personId, classId: null, ht: 120, vt: 120, comment: '' } })).payload : { specialId: null, kind: 'annat', label: 'Syntetiskt specialuppdrag', personId: staff.personId, classId: null, ht: 120, vt: 120, comment: '' }))).detail;
  assert.deepEqual(codes(d), []); assert.equal(d.capabilities.canPublish, true);
  // Syntetiskt äldre/gränsdata: normal save_special lägger också till version_teachers.
  // Ta bort bara den extra kopplingen i ägd provtransaktion för att isolera specials-unionen.
  if (specialOnly) await t`delete from public.tjanst_version_teachers where version_id=${d.version.id} and staff_person_id=${staff.personId}`;
  d = await read(t, A);
  assert.equal((await t`select count(*)::int n from public.tjanst_version_teachers where version_id=${d.version.id} and staff_person_id=${staff.personId}`)[0].n, specialOnly ? 0 : 1);
  assert.ok(d.rows.every(x => x.personId !== staff.personId));
  return { f, staff, d };
}
// Capture is opt-in at the case boundary; publish/deny/retry never read current support.
const capturePublication = async (t,d,extra={}) => {
  const captured=modern?await capturePlanContext(t,{unitId:d.unitId,schoolYear:Y,action:'publish',payload:{}}):null;
  return planCommand(d.unitId,Y,'publish',d.revision,captured?.payload??{},{expectedContentHash:d.version.contentHash,...extra});
};
const publish = (t,frozenCommand) => send(t,frozenCommand);

async function changeDuty(t, f, staff, startsOn, endsOn) {
  await f.actor(t, 'hm');
  const command = saveDuties(staff.personId, staff.revision, staff.employmentId, [{ unitId: f.schools.A, percent: 50, startsOn, endsOn }]);
  const reply = await personalCommand(t, command);
  await f.actor(t, 'principalA');
  return reply;
}
const planState = async (t, d) => ({
  distribution: (await t`select to_jsonb(x) value from public.tjanst_distributions x where unit_id=${d.unitId} and school_year=${Y}`)[0].value,
  versions: (await t`select to_jsonb(v) value from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where d.unit_id=${d.unitId} and d.school_year=${Y} order by v.id`).map(r => r.value),
  journal: (await t`select to_jsonb(c) value from public.tjanst_commands c where c.family='plan' and c.target->>'unitId'=${d.unitId} order by c.command_id`).map(r => r.value),
});
async function blocked(t, report, s, name, { reread = false } = {}) {
  const { f, staff, d } = s;
  const stalePublication=await capturePublication(t,d);
  // Spara en riktig ändrad andel via personalvägen, inte triggeravstängning. Distributionen ändras inte.
  await changeDuty(t, f, staff, '2027-07-01', '2028-06-30');
  const before = await planState(t, d); assert.equal(before.distribution.revision, d.revision);
  if (reread) {
    const fresh = await read(t, d.unitId);
    assert.deepEqual(codes(fresh), ['person_not_at_school']); assert.equal(fresh.capabilities.canPublish, false); assert.ok(!fresh.actions.includes('publish'));
    check(report, name + ': läsning ger exakt en gemensam blockerare');
  }
  await denied(t, report, name + ': direkt publicering med äldre läsning nekas', u => publish(u, stalePublication), '40001', modern?'tjanst_stale_basis':'tjanst_publish_blocked');
  if(modern){const freshPublication=await capturePublication(t,await read(t,d.unitId));
    await denied(t,report,name+': explicit ny capture når fortsatt WR10',u=>publish(u,freshPublication),'40001','tjanst_publish_blocked');}
  assert.deepEqual(await planState(t, d), before);
  check(report, name + ': versioner, distributionsrevision och kommandojournal är oförändrade');
}
async function cases(db, report) {
  await rolledBack(db, async t => {
    const s = await fixture(t, { specialOnly: false });
    await blocked(t, report, s, 'ordinarie save_special med versionslärare', { reread: true });
  });
  await rolledBack(db, async t => {
    const s = await fixture(t); await blocked(t, report, s, 'lärare endast i specialuppdrag', { reread: true });
  });
  await rolledBack(db, async t => { const s = await fixture(t); await blocked(t, report, s, 'direktkommando utan ny förhandsläsning'); });
  for (const kind of ['version_teachers', 'rows']) await rolledBack(db, async t => {
    const s = await fixture(t), { f, staff } = s;
    let d = s.d;
    if (kind === 'version_teachers') d = (await send(t, await planCommand(d.unitId, Y, 'add_teacher', d.revision, modern ? (await capturePlanContext(t, { unitId: d.unitId, schoolYear: Y, action: 'add_teacher', payload: { personId: staff.personId } })).payload : { personId: staff.personId }))).detail;
    else { const row = d.rows[0]; d = (await send(t, await planCommand(d.unitId, Y, 'save_row', d.revision, modern ? (await capturePlanContext(t, { unitId: d.unitId, schoolYear: Y, action: 'save_row', payload: { rowId: row.id, sourceKind: row.sourceKind, sourceKey: row.sourceKey, personId: staff.personId, teacherHt: row.teacherHt, teacherVt: row.teacherVt, comment: '' }, choice: 'manual' })).payload : { rowId: row.id, sourceKind: row.sourceKind, sourceKey: row.sourceKey, personId: staff.personId, teacherHt: row.teacherHt, teacherVt: row.teacherVt, comment: '' }))).detail; }
    d = (await send(t, await planCommand(d.unitId, Y, 'delete_special', d.revision, modern ? (await capturePlanContext(t, { unitId: d.unitId, schoolYear: Y, action: 'delete_special', payload: { specialId: d.specials[0].id } })).payload : { specialId: d.specials[0].id }))).detail;
    if (kind === 'rows') {
      // Isolera även rows-unionen: save_row lägger normalt till version_teachers.
      await t`delete from public.tjanst_version_teachers where version_id=${d.version.id} and staff_person_id=${staff.personId}`;
      d = await read(t, d.unitId);
    }
    await blocked(t, report, { f, staff, d }, 'lärare endast i ' + kind, { reread: true });
  });
  for (const [label, startsOn, endsOn] of [['giltigt helår', null, null], ['giltig delårsöverlapp', '2027-01-11', '2027-03-01'], ['inkluderande sista läsårsdag', '2027-06-30', '2027-06-30']]) await rolledBack(db, async t => {
    const { f, staff, d } = await fixture(t);
    if (startsOn) await changeDuty(t, f, staff, startsOn, endsOn);
    const fresh = await read(t, d.unitId); assert.deepEqual(codes(fresh), []);
    const published = await publish(t, await capturePublication(t,d)); assert.equal(published.detail.version.status, 'published');
    check(report, label + ': publicering passerar (ingen ny fullterminskontroll)');
    const frozen = published.detail.version;
    const selfDeniedPublication=await capturePublication(t,published.detail);
    await grantSelf(t, f, { unitIds: [f.schools.A], staffPersonId: staff.personId }); await f.actor(t, 'teacherSelf');
    const own = parseSelfReadReply(await selfRead(t)); assert.equal(own.publications.length, 1); assert.equal(own.publications[0].versionId, frozen.id);
    check(report, label + ': Egen tjänst läser publicerat specialuppdrag');
    await denied(t, report, 'self kan inte publicera', u => publish(u, selfDeniedPublication), '42501');
    await f.actor(t, 'principalA');
    const next = (await send(t, await (modern ? planCommand(d.unitId, Y, 'add_teacher', published.detail.revision, (await capturePlanContext(t,{unitId:d.unitId,schoolYear:Y,action:'add_teacher',payload:{personId:staff.personId}})).payload) : planCommand(d.unitId, Y, 'create_draft', published.detail.revision, { basedOnVersionId: frozen.id })))).detail;
    const before = (await t`select to_jsonb(v) value from public.tjanst_versions v where id=${frozen.id}`)[0].value;
    const nextPublication=await capturePublication(t,next);
    // En misslyckad senare publicering får inte skriva om ett redan fattat beslut.
    const current = (await t`select revision from public.staff_people where id=${staff.personId}`)[0].revision;
    await changeDuty(t, f, { ...staff, revision: current }, '2027-07-01', '2028-06-30');
    await denied(t, report, 'ny publicering nekas efter personaländring', u => publish(u,nextPublication), '40001',modern?'tjanst_stale_basis':'tjanst_publish_blocked');
    if(modern){const fresh=await capturePublication(t,await read(t,d.unitId));await denied(t,report,'fresh context retains publication blocker',u=>publish(u,fresh),'40001','tjanst_publish_blocked');}
    assert.deepEqual((await t`select to_jsonb(v) value from public.tjanst_versions v where id=${frozen.id}`)[0].value, before);
    check(report, 'befintligt publicerat beslut och hash är oförändrade');
  });
  await rolledBack(db, async t => {
    const { f, d } = await fixture(t);
    const draft = await personalCommand(t, { commandId: randomUUID(), action: 'create_draft_teacher', expectedRevision: 0,
      payload: { unitId: d.unitId, givenName: 'Syntetisk', familyName: 'Utkastlärare', draftNote: 'Syntetiskt prov' } });
    const special = d.specials[0];
    const next = (await send(t, await planCommand(d.unitId, Y, 'save_special', d.revision, modern ? (await capturePlanContext(t, { unitId: d.unitId, schoolYear: Y, action: 'save_special', payload: {
      specialId: special.id, kind: special.kind, label: special.label, personId: draft.result.receipt.personId, classId: null, ht: special.ht, vt: special.vt, comment: '' } })).payload : {
      specialId: special.id, kind: special.kind, label: special.label, personId: draft.result.receipt.personId, classId: null, ht: special.ht, vt: special.vt, comment: '' }))).detail;
    assert.deepEqual(codes(next), []); assert.equal((await publish(t, await capturePublication(t,next))).detail.version.status, 'published');
    check(report, 'utkastlärare på föreslagen skola behåller tidigare publiceringssemantik');
  });
  await rolledBack(db, async t => {
    const { f, d } = await fixture(t);
    const deniedPublication=await capturePublication(t,d);
    for (const role of ['principalB', 'foreignHm', 'admin', 'teacherGroup']) {
      await f.actor(t, role); await denied(t, report, role + ' nekas publicering på skola A', u => publish(u, deniedPublication), '42501');
    }
  });
}

async function openDatabase(ephemeral, report, stage) {
  const { classifyTjanstMigrations, assertTjanstSelfMandatesSchema, TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
  const { createEphemeralMigratedDb, migrationFiles } = await import('./ephemeral-migrated-db.mjs');
  const ownVersion = basename(OWN).slice(0, 14);
  const prefix = TJANST_MIGRATION_REGISTRY.filter(m => m.version < ownVersion).map(m => m.version);
  const sourceHashes = Object.fromEntries(migrationFiles().filter(f => f.slice(0, 14) >= TJANST_PHASE_START)
    .map(f => ['supabase/migrations/' + f, createHash('sha256').update(readFileSync(resolve(ROOT, 'supabase/migrations', f))).digest('hex')]));
  classifyTjanstMigrations({ journal: prefix, sourceHashes });
  if (ephemeral) {
    const e = await createEphemeralMigratedDb({ exclude: migrationFiles().filter(f => f.slice(0, 14) >= ownVersion) });
    try { await assertTjanstSelfMandatesSchema(e.db, { installed: true }); }
    catch (error) { await e.end(); throw error; }
    report.baselineMode = 'ephemeral-before-publish-scope'; report.pendingMigrations = stage==='current' ? TJANST_MIGRATION_REGISTRY.filter(m=>m.version>=ownVersion).map(m=>m.file) : [OWN];
    return { db: e.db, provenance: e.provenance, pending: stage==='current' ? TJANST_MIGRATION_REGISTRY.filter(m=>m.version>=ownVersion).map(m=>m.file) : [OWN], close: e.end };
  }
  const { targetPendingMigrations } = await import('./verify-tjanst-actual.mjs');
  const target = await targetPendingMigrations();
  const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
  const snapshot = await createNamedTimplanSnapshot();
  try {
    assert.equal(snapshot.provenance.sourceFingerprint, target.fingerprint, 'Målschemat ändrades mellan journalprövning och schemakopia');
    report.targetJournal = target.journal; report.baselineMode = target.baselineMode;
    report.pendingMigrations = target.pendingMigrations;
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: target.installed.includes('20261021120000') });
    const prior = target.pendingMigrations.filter(p => basename(p).slice(0, 14) < ownVersion);
    if (prior.length) await snapshot.db.begin(async t => { for (const p of prior) await t.unsafe(readFileSync(resolve(ROOT, p), 'utf8')); });
    report.appliedPrerequisites = prior;
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: true });
    return { db: snapshot.db, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup();const after=await targetPendingMigrations();assert.equal(after.fingerprint,target.fingerprint);assert.deepEqual(after.journal,target.journal);report.targetUnchanged=true; } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}

export async function verifyTjanstPublishScope(out, { ephemeral = false, stage='current' } = {}) {
  assert.ok(['current','historical'].includes(stage));assert.ok(stage!=='historical'||ephemeral,'Historical stage requires --ephemeral');modern=false;
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-publish-person-scope', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Syntetiska SQL-prov i ägd databas; ingen installerad målskrivning, HTTP/OIDC eller webbläsarbedömning',
      'Skoluppdrag kräver befintlig läsårsöverlapp, inte täckning av hela terminen; utkastpersoners föreslagna skola behålls',
      'Specials-only/rows-only är uttryckligt skapade gränsdata i ägd provtransaktion; ordinarie sparkommandon lägger även till versionslärare',
      'SS 12000:2024 utgåva 4 / OpenAPI 2.1.0: Person och Duty-identiteter/giltighet bevaras; inget informationsutbyte verifierat'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); report.requestedStage=stage; source = await openDatabase(ephemeral, report,stage); report.database = source.provenance;
    const db = source.db, before = await allPublicHashes(db), meta = await functionMeta(db), fingerprint = await schemaFingerprint(db);
    if (source.pending.includes(OWN)) {
      await rolledBack(db, async t => {
        const { f, staff, d } = await fixture(t);
        await changeDuty(t, f, staff, '2027-07-01', '2028-06-30');
        assert.deepEqual(codes(await read(t, d.unitId)), ['person_not_at_school']);
        assert.equal((await publish(t, await capturePublication(t,d))).detail.version.status, 'published');
        check(report, 'före rättelsen, syntetiskt specials-only: läsning blockerar men direkt publicering passerar');
      });
      await rolledBack(db, t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
      assert.equal(await schemaFingerprint(db), fingerprint); assert.deepEqual(await allPublicHashes(db), before);
      check(report, 'migration med återrullning bevarar schema, ACL och samtliga rader');
      await db.begin(t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
      assert.deepEqual(await allPublicHashes(db), before);
      const after = await functionMeta(db), replaced = ['tjanst_plan_blockers', 'tjanst_plan_projection'];
      assert.deepEqual(Object.keys(after).sort(), Object.keys(meta).sort());
      for (const [name, original] of Object.entries(meta)) {
        if (replaced.includes(original.name)) { assert.notEqual(after[name].definition, original.definition); assert.deepEqual({ ...after[name], definition: '' }, { ...original, definition: '' }); }
        else assert.deepEqual(after[name], original, name);
      }
      check(report, 'bara blockerare/projektion ersätts; ägare, ACL, SECURITY DEFINER och search_path bevaras');
    } else check(report, 'registrerat suffix finns redan i schemakopian och tillämpas inte på nytt');
    report.migrationCheckCount=report.checks.length;
    if(stage==='current') {
      const suffix=source.pending.filter(p=>basename(p).slice(0,14)>basename(OWN).slice(0,14));
      if(suffix.length) await db.begin(async t=>{for(const file of suffix)await t.unsafe(readFileSync(resolve(ROOT,file),'utf8'));});
      report.appliedFollowing=suffix;
    }
    modern=!!(await db`select to_regprocedure('public.tjanst_year_ensure_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,uuid)') present`)[0].present;
    assert.equal(modern,stage==='current','Selected stage must match installed command schema');report.commandStage=stage;
    const installed = await allPublicHashes(db); await cases(db, report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'alla syntetiska beteendeprov rullas tillbaka utan kvarvarande rader');
    report.historicalCheckCount=stage==='historical'?report.checks.length:report.migrationCheckCount;
    report.currentCheckCount=stage==='current'?report.checks.length-report.migrationCheckCount:0;
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' publiceringskontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),ephemeral=args.includes('--ephemeral'),si=args.indexOf('--stage'),stage=si<0?'current':args[si+1],rest=args.filter((a,i)=>a!=='--ephemeral'&&(si<0||i!==si&&i!==si+1));
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral] [--stage current|historical]');
  await verifyTjanstPublishScope(rest[1], { ephemeral,stage });
}
