#!/usr/bin/env node
// 05.1-06: fördelning, behov (Gy25, GR, IM), versioner, publicering och lärarens egen läsning. Egen databas, syntetiska
// fixturer; migrationen provas först med återrullning och installeras sedan bara i den egna databasen.
//   node work/pilot/verify-tjanst-plan.mjs --out /private/tmp/tjanst-plan-sql.json              (schemakopia av skyddat lokalt mål)
//   node work/pilot/verify-tjanst-plan.mjs --out /tmp/tjanst-plan-sql.json --ephemeral          (egen PostgreSQL byggd från migrationerna)
// Ingen HTTP/OIDC och inget installerat mål ändras.
import assert from 'node:assert/strict';
import { capturePlanContext, yearCommandSend } from './tjanst-year-fixtures.mjs';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';
let modern = false; // Set once for each explicitly selected schema stage; never a parser fallback.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { createTjanstFixture, grantSelf, planCommand, planRead, planRef, planSend, planStatus, seedGrimNeeds, seedGy25Class, selfRead, staffWithDuties,
  staffingRead, tjanstMigrations } from './tjanst-fixtures.mjs';
import { parsePlanJournalReply, parsePlanLegacyReadReply, parseSelfReadReply } from '../../web/lib/tjanst-contract.ts';
import { coverage, coverageLabel, schoolSums, teacherSums, tjanstNeed } from '../../web/lib/tjanst-model.ts';
import { summarize } from '../../web/lib/lasar-model.ts';
const d28Installed = async t => (await t`select position('tjanst_joint_teacher_mismatch' in pg_get_functiondef('public.tjanst_plan_save_joint(public.tjanst_distributions,jsonb)'::regprocedure))>0 v`)[0].v;

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261020120000_tjanst_plan.sql';
const PREREQUISITES = tjanstMigrations.slice(0, tjanstMigrations.indexOf(OWN));
/** Senare 05.1-migrationer: 06:s fall körs om med dem installerade, och 08:s fall för specialuppdrag och samläsning läggs till. */
const FOLLOWING = tjanstMigrations.slice(tjanstMigrations.indexOf(OWN) + 1);
const sourceFiles = [...tjanstMigrations, 'work/pilot/tjanst-year-fixtures.mjs', 'web/lib/tjanst-year-contract.ts', 'web/lib/tjanst-contract.ts', OWN, ...FOLLOWING, 'work/pilot/verify-tjanst-plan.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
// Pin transitive imports using the same AST inventory as the year-preview verifier.
const sources = () => {
  const pending = [...sourceFiles], found = new Map();
  while (pending.length) {
    const path = pending.pop(); if (found.has(path)) continue;
    const bytes = readFileSync(resolve(root,path)); found.set(path,createHash('sha256').update(bytes).digest('hex'));
    if (!/\.(?:mjs|ts)$/u.test(path)) continue;
    const ts = createRequire(resolve(root,'web/package.json'))('typescript');
    const parsed = ts.createSourceFile(path,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
    const imports = [];
    const visit = node => {
      const specifier = (ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node,visit);
    };visit(parsed);
    for (const specifier of imports) {
      let target = resolve(root,dirname(path),specifier);
      if (!existsSync(target)) target += '.ts';
      assert.ok(target.startsWith(root) && existsSync(target),'Unresolved local source '+specifier+' from '+path);
      pending.push(relative(root,target));
    }
  }
  return Object.fromEntries([...found].sort(([a],[b])=>a.localeCompare(b)));
};
const sql = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_tjanst_plan_rollback');
const ENTRYPOINTS = ['tjanst_plan_read(jsonb)', 'tjanst_plan_command(jsonb)', 'tjanst_plan_status(jsonb)', 'tjanst_self_read(jsonb)'];
const COLUMNS = {
  tjanst_distributions: ['id', 'customer_id', 'organizer_id', 'unit_id', 'school_year', 'revision', 'created_at'],
  tjanst_versions: ['id', 'distribution_id', 'version_no', 'status', 'based_on_version_id', 'content_hash', 'created_by_identity_id', 'created_by_assignment_id', 'created_at',
    'published_by_identity_id', 'published_by_assignment_id', 'published_at'],
  tjanst_version_teachers: ['version_id', 'staff_person_id'],
  tjanst_rows: ['id', 'version_id', 'lineage_id', 'staff_person_id', 'source_kind', 'source_key', 'class_id', 'school_year', 'link_revision', 'timplan_id', 'series_id',
    'timplan_version', 'timplan_row_key', 'link_column', 'need_label', 'need_ht_minutes', 'need_vt_minutes', 'need_basis', 'teacher_ht_minutes', 'teacher_vt_minutes', 'comment'],
};
const PLAN_ACTIONS = ['create_draft', 'add_teacher', 'save_row', 'delete_row', 'save_special', 'delete_special', 'save_joint', 'dissolve_joint', 'discard_draft', 'publish'];

async function fingerprint(db) {
  const parts = await Promise.all([
    db`select p.oid::regprocedure::text s,md5(pg_get_functiondef(p.oid)) d,coalesce(p.proacl::text,'') acl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`,
    db`select c.relname,c.relkind,coalesce(c.relacl::text,'') acl,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='public'::regnamespace order by 1`,
    db`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) t,a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by 1,2`,
    db`select conrelid::regclass::text r,conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='public'::regnamespace order by 1,2`,
    db`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 1,2`,
    db`select tgrelid::regclass::text r,tgname,pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) order by 1,2`,
    db`select * from pg_policies where schemaname='public' order by tablename,policyname`]);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function check(report, name, detail) { name += report.tag ?? ''; report.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
async function deny(tx, report, name, fn, codes, hint) {
  let error;
  try { await tx.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial');
  assert.ok(codes.includes(error.code), `${name}: got ${error.code} ${error.hint ?? ''} ${error.message}`);
  if (hint !== undefined) assert.equal(error.hint, hint, name + ': hint');
  check(report, name, { code: error.code, ...(error.hint ? { hint: error.hint } : {}) });
  return error;
}
/** Kommandosvaret tolkas med kontraktets parser mot exakt begäran (samma som servern i 05.1-04). */
async function send(t, q) {
  if (modern) return (await yearCommandSend(t, q)).result;
  // Explicit historical reply decoding; the old request is never accepted by the current command parser.
  const envelope = await planSend(t, q);
  assert.equal(envelope.contractVersion, 'tjanst_sql_v1');
  const result = parsePlanJournalReply(envelope.result, planRef(q));
  assert.equal(result.receipt.revision, q.expectedRevision + 1);
  return result;
}
const read = async (t, unitId, schoolYear, versionId) => { const q = { unitId, schoolYear, ...(versionId ? { versionId } : {}) }; return (modern ? parseYearPlanReadReply : parsePlanLegacyReadReply)(await planRead(t, q), q); };

async function matrix(tx, report, f) {
  const A = f.schools.A, B = f.schools.B;
  // Personal: P1 (60 % A, 40 % B, self-mandat på A), P2 (100 % A), P3 (bara B).
  const p1 = await staffWithDuties(tx, f, { familyName: 'Ettan', duties: [{ unitId: A, percent: 60, startsOn: '2026-07-01' }, { unitId: B, percent: 40, startsOn: '2026-07-01' }] });
  const p2 = await staffWithDuties(tx, f, { familyName: 'Tvåan', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
  const p3 = await staffWithDuties(tx, f, { familyName: 'Trean', duties: [{ unitId: B, percent: 100, startsOn: '2026-07-01' }] });
  const gy = await seedGy25Class(tx, f);
  const Y = gy.year;
  // Personalens andelar gäller från 2026-07-01 och utan slut, så de överlappar Gy-kullens läsår.
  await grantSelf(tx, f, { unitIds: [A], staffPersonId: p1.personId });

  // Spår: Gy25-behov → tjänsterad → publicerad → läraren ser den.
  await f.actor(tx, 'principalA');
  let d = await read(tx, A, Y);
  assert.equal(d.version, null); if(modern){assert.ok(d.actions.includes('save_row'));assert.ok(!d.actions.includes('create_draft'));assert.equal(d.capabilities.canEdit,true);}else assert.deepEqual(d.actions, ['create_draft']);
  const klass = d.classes.find(c => c.classId === gy.classId);
  assert.equal(klass.link.column, 'ar1'); assert.equal(klass.link.schoolform, 'gymnasium');
  const need = klass.needs.find(n => n.rowKey === gy.aplKey);
  const expected = tjanstNeed({ kind: 'gy_v2', schoolMinutes: gy.timeRows[gy.aplKey].schoolMinutes, yearInCohort: 1 });
  assert.deepEqual([need.needHt, need.needVt, need.needBasis], [expected.needHt, expected.needVt, expected.needBasis]);
  assert.ok(klass.needs.every(n => !n.rowKey.startsWith('meta:')));
  let r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: null })));
  d = r.detail; assert.equal(d.version.status, 'draft'); assert.equal(d.version.versionNo, 1);
  r = await send(tx, await planCommand(A, Y, 'save_row', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p1.personId, teacherHt: 3000, teacherVt: 2400, comment: '' }, choice: 'manual' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p1.personId, teacherHt: 3000, teacherVt: 2400, comment: '' }));
  d = r.detail;
  const row = d.rows[0];
  assert.equal(row.sourceKind, 'class_timplan'); assert.ok(row.sourceKey.startsWith(`class_timplan:${gy.classId}:${Y}:`));
  assert.deepEqual([row.needHt, row.needVt, row.teacherHt, row.teacherVt], [expected.needHt, expected.needVt, 3000, 2400]);
  const stored = (await tx`select * from public.tjanst_rows where id=${row.id}`)[0];
  assert.deepEqual([stored.link_revision, stored.timplan_id, stored.link_column, stored.timplan_row_key], [0, gy.planId, 'ar1', gy.aplKey]);
  await f.actor(tx, 'teacherSelf');
  assert.deepEqual(parseSelfReadReply(await selfRead(tx)).publications, []);
  await f.actor(tx, 'principalA');
  r = await send(tx, await planCommand(A, Y, 'publish', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} })).payload : {}, { expectedContentHash: d.version.contentHash }));
  d = r.detail; assert.equal(d.version.status, 'published'); assert.ok(d.version.publishedAt);
  await f.actor(tx, 'teacherSelf');
  let own = parseSelfReadReply(await selfRead(tx));
  assert.equal(own.person.id, p1.personId); assert.equal(own.publications.length, 1);
  assert.deepEqual(own.publications[0].rows.map(x => [x.ht, x.vt, x.className]), [[3000, 2400, 'SYNBF1']]);
  check(report, 'spår: Gy25-rad sparad, utkast osynligt för läraren, publicerad, tjanst_self_read visar raden med teacherHt/teacherVt och behov skilt',
    { sourceKey: row.sourceKey, need: [row.needHt, row.needVt], teacher: [3000, 2400] });
  check(report, 'raden bär source_kind class_timplan, source_key class_timplan:{classId}:{schoolYear}:… och ögonblicksbild av koppling, timplan, kolumn och radnyckel');

  // Ny version: lineage består, läraren ser den publicerade tills nästa publicering.
  await f.actor(tx, 'principalA');
  const published = d.version;
  await deny(tx, report, modern?'publikt create_draft nekas med22023 context_required':'utkast utan basedOnVersionId när publicerad version finns ger40001', async t => send(t, await planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: null })), modern ? ['22023'] : ['40001'], modern ? 'tjanst_context_required' : 'tjanst_published_meanwhile');
  r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: published.id })));
  d = r.detail; assert.equal(d.version.versionNo, 2); assert.equal(d.rows[0].lineageId, row.lineageId); assert.notEqual(d.rows[0].id, row.id);
  r = await send(tx, await planCommand(A, Y, 'save_row', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: d.rows[0].id, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p1.personId, teacherHt: 1200, teacherVt: 1200, comment: 'Ändrad' }, choice: 'manual' })).payload : { rowId: d.rows[0].id, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p1.personId, teacherHt: 1200, teacherVt: 1200, comment: 'Ändrad' }));
  d = r.detail;
  await f.actor(tx, 'teacherSelf');
  own = parseSelfReadReply(await selfRead(tx));
  assert.deepEqual(own.publications[0].rows.map(x => [x.ht, x.vt]), [[3000, 2400]]); assert.equal(own.publications[0].versionId, published.id);
  check(report, 'ny version: samma lineage_id och nya rad-id; lärarens egen läsning visar fortfarande den publicerade versionen medan utkastet ändras');
  await deny(tx, report, 'publicerad versions rader kan inte ändras (trigger)', t => t`update public.tjanst_rows set teacher_ht_minutes=1 where version_id=${published.id}`, ['42501']);
  await deny(tx, report, 'publicerad version kan inte ändras tillbaka till utkast', t => t`update public.tjanst_versions set status='draft' where id=${published.id}`, ['42501']);

  // D-09: två lärare på samma källa blir två rader och täckningen summerar.
  await f.actor(tx, 'principalA');
  r = await send(tx, await planCommand(A, Y, 'save_row', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p2.personId, teacherHt: 1800, teacherVt: 1200, comment: '' }, choice: 'manual' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p2.personId, teacherHt: 1800, teacherVt: 1200, comment: '' }));
  d = r.detail;
  const cov = coverage(need.sourceKey, { ht: need.needHt ?? 0, vt: need.needVt ?? 0 }, d.rows, d.joints);
  assert.equal(d.rows.filter(x => x.sourceKey === need.sourceKey).length, 2); assert.deepEqual(cov.covered, { ht: 3000, vt: 2400 }); assert.equal(cov.teachers, 2);
  check(report, 'D-09: två lärare på samma kurs och klass blir två rader och täckningen summerar (tjanst-model coverage på SQL-svaret)', cov);
  const frozenCase1 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p2.personId, teacherHt: 60, teacherVt: 0, comment: '' }, choice: 'manual' }) : null;
  await deny(tx, report, 'samma lärare och källa en gång till ger tjanst_duplicate_row', async t => send(t, await planCommand(A, Y, 'save_row', d.revision, modern ? frozenCase1.payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId: p2.personId, teacherHt: 60, teacherVt: 0, comment: '' })), ['22023'], 'tjanst_duplicate_row');

  // Kommandogarantier.
  const frozenCase2 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'add_teacher', payload: { personId: p2.personId } }) : null;
  await deny(tx, report, 'inaktuell expectedRevision ger 40001', async t => send(t, await planCommand(A, Y, 'add_teacher', d.revision - 1, modern ? frozenCase2.payload : { personId: p2.personId })), ['40001'], 'tjanst_revision_conflict');
  const add = await planCommand(A, Y, 'add_teacher', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'add_teacher', payload: { personId: p2.personId } })).payload : { personId: p2.personId });
  const added = await send(tx, add);
  const replay = await planSend(tx, add);
  assert.equal(replay.result.receipt.replayed, true); assert.equal(replay.result.receipt.revision, added.receipt.revision);
  check(report, 'samma commandId och samma begäran ger replayed med samma kvitto');
  d = added.detail;
  await deny(tx, report, 'ändrad begäran med samma commandId ger 40001', t => planSend(t, { ...add, expectedRevision: d.revision }), ['40001'], 'tjanst_command_conflict');
  const frozenCase3 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'add_teacher', payload: { personId: p2.personId } }) : null;
  await deny(tx, report, 'fel payloadHash ger 22023', async t => planSend(t, { ...(await planCommand(A, Y, 'add_teacher', d.revision, modern ? frozenCase3.payload : { personId: p2.personId })), payloadHash: 'sha256:' + '0'.repeat(64) }), ['22023'], 'tjanst_payload_hash');
  const status = await planStatus(tx, { command: planRef(add) });
  assert.equal(status.result.state, 'completed'); assert.equal(status.result.result.receipt.commandId, add.commandId);
  assert.equal((await planStatus(tx, { command: { ...planRef(add), commandId: randomUUID() } })).result.state, 'not_found');
  await f.actor(tx, 'admin');
  await deny(tx, report, 'status för en annan aktörs kommando nekas', t => planStatus(t, { command: planRef(add) }), ['40001'], 'tjanst_command_conflict');
  check(report, 'status: completed för eget kommando och not_found för okänt commandId');
  await f.actor(tx, 'principalA');
  const frozenCase4 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} }) : null;
  await deny(tx, report, 'ändrad innehållshash vid publicering ger tjanst_content_changed', async t => send(t, await planCommand(A, Y, 'publish', d.revision, modern ? frozenCase4.payload : {}, { expectedContentHash: published.contentHash })), ['40001'], 'tjanst_content_changed');
  const auditCapture=modern?await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}}):null;
  await deny(tx, report, 'audit-fel ger 55000 utan skrivning', async t => {
    await t`alter table public.security_events add constraint tjanst_plan_audit_fault check (action<>'tjanst_plan_command') not valid`;
    await send(t, await planCommand(A, Y, 'add_teacher', d.revision, modern ? auditCapture.payload : { personId: p1.personId }));
  }, ['55000']);
  assert.equal((await tx`select revision from public.tjanst_distributions where unit_id=${A} and school_year=${Y}`)[0].revision, d.revision);
  const actions = (await tx`select distinct action from public.tjanst_commands where family='plan'`).map(x => x.action);
  assert.ok(actions.length >= (modern ? 3 : 4) && actions.every(a => PLAN_ACTIONS.includes(a)));
  check(report, 'TJANST-06: kommandojournalens åtgärd är text ur kontraktets lista; lineage_id och source_kind finns från start', { actions });

  // Hinder: inaktuell rad efter ändrad koppling, och person utan skoluppdrag.
  const before = d.rows.find(x => x.personId === p1.personId);
  await tx.savepoint(async t => {
    await t`set local session_replication_role=replica`;
    await t`update public.class_timplans set revision=revision+1 where class_id=${gy.classId} and start_year=${Y}`;
    await t`set local session_replication_role=origin`;
    const stale = await read(t, A, Y);
    assert.equal(stale.rows.find(x => x.id === before.id).stale, true); assert.ok(stale.blockers.some(b => b.code === 'stale_rows'));
    assert.ok(!stale.actions.includes('publish')); assert.equal(stale.capabilities.canPublish, false);
    assert.equal((await t`select need_ht_minutes from public.tjanst_rows where id=${before.id}`)[0].need_ht_minutes, before.needHt);
    const frozenCase5 = modern ? await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'publish', payload: {} }) : null;
  await deny(t, report, 'publicering med hinder ger tjanst_publish_blocked', async u => send(u, await planCommand(A, Y, 'publish', stale.revision, modern ? frozenCase5.payload : {}, { expectedContentHash: stale.version.contentHash })), ['40001'], 'tjanst_publish_blocked');
    const resaved = await send(t, await planCommand(A, Y, 'save_row', stale.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: before.id, sourceKind: 'class_timplan', sourceKey: before.sourceKey, personId: p1.personId, teacherHt: 1200, teacherVt: 1200, comment: 'Ändrad' }, choice: 'manual' })).payload : { rowId: before.id, sourceKind: 'class_timplan', sourceKey: before.sourceKey, personId: p1.personId, teacherHt: 1200, teacherVt: 1200, comment: 'Ändrad' }));
    assert.equal(resaved.detail.rows.find(x => x.id === before.id).stale, false);
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'ändrad koppling markerar raden som inaktuell utan att skriva om ögonblicksbilden; att spara raden igen förnyar den');
  const frozenCase6 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'add_teacher', payload: { personId: p3.personId } }) : null;
  await deny(tx, report, 'lärare utan skoluppdrag på skolan nekas (tjanst_person_not_at_school)', async t => send(t, await planCommand(A, Y, 'add_teacher', d.revision, modern ? frozenCase6.payload : { personId: p3.personId })), ['22023'], 'tjanst_person_not_at_school');

  // D-11 och roller.
  await f.actor(tx, 'principalB');
  const bRead = await read(tx, B, Y);
  assert.equal(bRead.version, null); assert.deepEqual(bRead.teachers, []);
  await deny(tx, report, 'rektor B läser inte skola A (42501)', t => planRead(t, { unitId: A, schoolYear: Y }), ['42501']);
  r = await send(tx, await (modern ? planCommand(B, Y, 'add_teacher', bRead.revision, (await capturePlanContext(tx,{unitId:B,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(B, Y, 'create_draft', bRead.revision, { basedOnVersionId: null })));
  r = await send(tx, await planCommand(B, Y, 'add_teacher', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: B, schoolYear: Y, action: 'add_teacher', payload: { personId: p1.personId } })).payload : { personId: p1.personId }));
  assert.deepEqual(r.detail.teachers.map(x => [x.personId, x.shareHere]), [[p1.personId, 40]]);
  assert.ok(!JSON.stringify(r.detail).includes(A) && !JSON.stringify(r.detail).includes('3000'));
  check(report, 'D-11: rektor B ser bara 40 %-andelen och inget från skola A');
  await f.actor(tx, 'principalAB');
  const abA = await read(tx, A, Y);
  assert.equal(abA.teachers.find(x => x.personId === p1.personId).shareHere, 60); assert.equal(abA.unitId, A);
  check(report, 'rektor AB läser skola A som egen skolpost med A:s andel');
  await f.actor(tx, 'admin');
  const adminRead = await read(tx, A, Y);
  assert.ok(adminRead.capabilities.canEdit); assert.equal(adminRead.capabilities.canPublish, false); assert.ok(!adminRead.actions.includes('publish'));
  const frozenCase7 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} }) : null;
  await deny(tx, report, 'administratör publicerar inte (42501)', async t => send(t, await planCommand(A, Y, 'publish', adminRead.revision, modern ? frozenCase7.payload : {}, { expectedContentHash: adminRead.version.contentHash })), ['42501']);
  const frozenCase8 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'add_teacher', payload: { personId: p2.personId } }) : null;
  const frozenCase9 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} }) : null;
  await f.actor(tx, 'hm');
  const hmRead = await read(tx, A, Y);
  assert.deepEqual(hmRead.actions, []); assert.equal(hmRead.capabilities.canEdit, false);
  check(report, 'huvudman läser utan actions och utan redigering');
  await deny(tx, report, 'huvudman skriver inte (42501)', async t => send(t, await planCommand(A, Y, 'add_teacher', hmRead.revision, modern ? frozenCase8.payload : { personId: p2.personId })), ['42501']);
  await deny(tx, report, 'huvudman publicerar inte (42501)', async t => send(t, await planCommand(A, Y, 'publish', hmRead.revision, modern ? frozenCase9.payload : {}, { expectedContentHash: hmRead.version.contentHash })), ['42501']);
  await f.actor(tx, 'foreignHm');
  await deny(tx, report, 'annan kund nekas (42501)', t => planRead(t, { unitId: A, schoolYear: Y }), ['42501']);
  await f.actor(tx, 'teacherGroup');
  await deny(tx, report, 'lärare med gruppmandat når inte plan-familjen (42501)', t => planRead(t, { unitId: A, schoolYear: Y }), ['42501']);
  await deny(tx, report, 'lärare med gruppmandat har ingen egen läsning (42501)', t => selfRead(t), ['42501']);

  // D-24: äldre publicerade versioner läses i sin helhet.
  await f.actor(tx, 'principalA');
  d = await read(tx, A, Y);
  r = await send(tx, await planCommand(A, Y, 'publish', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} })).payload : {}, { expectedContentHash: d.version.contentHash }));
  const history = await read(tx, A, Y, published.id);
  assert.equal(history.version.status, 'superseded'); assert.deepEqual(history.actions, []); assert.deepEqual(history.rows.map(x => [x.teacherHt, x.teacherVt]), [[3000, 2400]]);
  assert.ok(history.versions.every(v => v.status !== 'published' || v.publishedByName));
  check(report, 'D-24: ersatt version läses i sin helhet utan actions; historiken har status, aktör och tid', { versions: history.versions.map(v => [v.versionNo, v.status]) });
  await f.actor(tx, 'teacherSelf');
  own = parseSelfReadReply(await selfRead(tx));
  assert.deepEqual(own.publications.map(p => p.versionNo), [2]);
  check(report, 'efter ny publicering ser läraren bara den nya publicerade versionen');
  await f.actor(tx, 'principalA');
  await deny(tx, report, 'versionId från ett annat läsår nekas (42501)', t => planRead(t, { unitId: A, schoolYear: Y - 1, versionId: published.id }), ['42501']);
  const wrongYearPayload={rowId:null,sourceKind:'class_timplan',sourceKey:need.sourceKey,personId:p2.personId,teacherHt:60,teacherVt:0,comment:''};
  const wrongYearCapture=modern?await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'save_row',payload:wrongYearPayload,choice:'manual'}):null;
  await deny(tx,report,'source_key från ett annat läsår nekas utan delskrivning',async t=>{
    const cur=await read(t,A,Y);
    const created=modern?{detail:cur}:await send(t,await planCommand(A,Y,'create_draft',cur.revision,{basedOnVersionId:cur.version.id}));
    await planSend(t,await planCommand(A,Y,'save_row',created.detail.revision,{...(modern?wrongYearCapture.payload:wrongYearPayload),sourceKey:need.sourceKey.replace(`:${Y}:`,`:${Y-1}:`)}));
  },['22023'],modern?'tjanst_invalid':'tjanst_unknown_source');
  await deny(tx, report, 'annan skola utanför mandatet nekas vid skrivning (42501)', async t => send(t, await planCommand(f.schools.C, Y, 'create_draft', 0, { basedOnVersionId: null })), ['42501']);
  // discard_draft och delete_row.
  d = await read(tx, A, Y);
  r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: d.version.id })));
  r = await send(tx, await planCommand(A, Y, 'delete_row', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'delete_row', payload: { rowId: r.detail.rows[0].id } })).payload : { rowId: r.detail.rows[0].id }));
  r = await send(tx, await planCommand(A, Y, 'discard_draft', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'discard_draft', payload: {} })).payload : {}));
  assert.equal(r.detail.version.status, 'published'); assert.equal((await tx`select status from public.tjanst_versions where id=${r.receipt.versionId}`)[0].status, 'discarded');
  check(report, 'delete_row och discard_draft: kasserat utkast lämnar den publicerade versionen orörd');
  const emptyCapture=modern?await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}}):null;
  await tx.savepoint(async t => {
    const cur = await read(t, A, Y); const created = await send(t, modern ? await planCommand(A,Y,'add_teacher',cur.revision,emptyCapture.payload) : await planCommand(A,Y,'create_draft',cur.revision,{basedOnVersionId:cur.version.id}));
    let x = created.detail; for (const row of x.rows) x = (await send(t, await planCommand(A, Y, 'delete_row', x.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'delete_row', payload: { rowId: row.id } })).payload : { rowId: row.id }))).detail;
    assert.ok(x.blockers.some(b => b.code === 'empty_draft'));
    const emptyPublication=await planCommand(A,Y,'publish',x.revision,modern?(await capturePlanContext(t,{unitId:A,schoolYear:Y,action:'publish',payload:{}})).payload:{},{expectedContentHash:x.version.contentHash});
    await deny(t,report,'tomt utkast blockeras före publicering',u=>send(u,emptyPublication),['40001'],'tjanst_publish_blocked');
    throw rollback;
  }).catch(e=>{if(e!==rollback)throw e;});
}

/** GR- och IM-behov, okopplade klasser och namnrader (D-21, D-22). */
async function grimMatrix(tx, report, f) {
  const A = f.schools.A;
  const g = await seedGrimNeeds(tx, f);
  await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(${A},'SYN7B',2026,${g.grPlan},'ak7')`;
  await f.actor(tx, 'principalA');
  const d = await read(tx, A, 2026);
  const gr = d.classes.find(c => c.classId === f.classes.group), im = d.classes.find(c => c.classId === g.imClass), legacy = d.classes.find(c => c.classId === f.classes.other);
  const math = gr.needs.find(n => n.rowKey === 'matematik');
  assert.deepEqual([math.needHt, math.needVt, math.needBasis], [2700, 2700, 'even_split']);
  assert.deepEqual(tjanstNeed({ kind: 'gr', annualHours: 90 }), { needHt: math.needHt, needVt: math.needVt, needBasis: math.needBasis });
  check(report, 'GR ak8 90 årstimmar → 45/45 h (even_split), lika med tjanst-model');
  assert.ok(gr.needs.some(n => n.rowKey === 'biologi') && !gr.needs.some(n => n.rowKey === 'no') && !gr.needs.some(n => n.rowKey === 'idrott'));
  check(report, 'GR åk 8 räknar delrader och inte NO-grupprad; rader med 0 timmar ger inget behov');
  const ts = summarize({ id: 'x', unitId: A, startYear: 2026, label: '2026/27', ...g.calendar, groupExceptions: {}, shortWeeks: {}, status: 'fastställd', history: [] });
  const [sqlWeeks] = await tx`select public.tjanst_school_weeks(${A},2026) w`;
  assert.deepEqual(sqlWeeks.w, { htSchoolDays: ts.terms.ht.skoldagar, vtSchoolDays: ts.terms.vt.skoldagar });
  const ma = im.needs.find(n => n.rowKey === 'im-ma');
  const expected = tjanstNeed({ kind: 'im', weeklyHours: 3, calendar: { status: 'faststalld', htSchoolDays: ts.terms.ht.skoldagar, vtSchoolDays: ts.terms.vt.skoldagar } });
  assert.deepEqual([ma.needHt, ma.needVt, ma.needBasis], [expected.needHt, expected.needVt, expected.needBasis]);
  check(report, 'IM 3 h/vecka mot fastställd kalender ger exakta minuter enligt tjanst-model; skoldagar lika med lasar-model (helgdagar och lovdagar)', { schoolDays: sqlWeeks.w, minutes: [ma.needHt, ma.needVt] });
  assert.equal(legacy.link, null); assert.deepEqual(legacy.needs, []);
  check(report, 'klass med bara namnrad ger link null och inga behov, aldrig 0');
  await tx.savepoint(async t => {
    await t`update public.school_years set status='utkast',decided_on=null where unit_id=${A} and start_year=2026`;
    const noCal = await read(t, A, 2026);
    assert.ok(noCal.classes.find(c => c.classId === g.imClass).needs.every(n => n.needHt === null && n.needVt === null));
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'IM utan fastställd kalender ger null, aldrig 0');
}

/** Valblock med, meta och APL-minuter inte med (Gy25-källan). */
function gyRowRules(report, d, gy) {
  const klass = d.classes.find(c => c.classId === gy.classId);
  const blocks = gy.rows.filter(r => r.key.startsWith('block:') && gy.terms.find(t => t.rowKey === r.key).points.slice(0, 2).some(p => p > 0));
  for (const b of blocks) assert.ok(klass.needs.some(n => n.rowKey === b.key), b.key);
  assert.ok(klass.needs.every(n => !n.rowKey.startsWith('meta:')));
  const apl = klass.needs.find(n => n.rowKey === gy.aplKey);
  assert.equal(apl.needHt, gy.timeRows[gy.aplKey].schoolMinutes[0]);
  check(report, 'Gy25: valblock blir behovsrader, meta:* och APL-minuter ingår inte', { blocks: blocks.length });
}

async function concurrency(db, connect, report, f) {
  const setup = await db.begin(async t => {
    const p = await staffWithDuties(t, f, { familyName: 'Samtidig', duties: [{ unitId: f.schools.A, percent: 100, startsOn: '2026-07-01' }] });
    const g = await seedGrimNeeds(t, f, { calendar: false });
    await f.actor(t, 'principalA');
    const d = await read(t, f.schools.A, 2026);
    const created = await send(t, await (modern ? planCommand(f.schools.A, 2026, 'add_teacher', d.revision, (await capturePlanContext(t,{unitId:f.schools.A,schoolYear:2026,action:'add_teacher',payload:{personId:p.personId}})).payload) : planCommand(f.schools.A, 2026, 'create_draft', d.revision, { basedOnVersionId: null })));
    const need = created.detail.classes.find(c => c.classId === f.classes.group).needs.find(n => n.rowKey === 'matematik');
    return { p, g, revision: created.detail.revision, need };
  });
  const c1 = await connect(), c2 = await connect();
  const [q1,q2]=await db.begin(async t=>{await f.actor(t,'principalA');
  const q = async (minutes) => planCommand(f.schools.A, 2026, 'save_row', setup.revision, modern ? (await capturePlanContext(t, { unitId: f.schools.A, schoolYear: 2026, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: setup.need.sourceKey, personId: minutes === 1200 ? setup.p.personId : null, teacherHt: minutes, teacherVt: 0, comment: '' }, choice: (minutes === 1200 ? setup.p.personId : null) === null ? 'unassigned' : 'manual' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: setup.need.sourceKey, personId: minutes === 1200 ? setup.p.personId : null, teacherHt: minutes, teacherVt: 0, comment: '' });
  return [await q(1200),await q(600)];
  });
  let release; const gate = new Promise(r => { release = r; }); let held; const heldReady = new Promise(r => { held = r; });
  const p1 = c1.begin(async t => { await f.actor(t, 'principalA'); const v = await planSend(t, q1); held(); await gate; return v; });
  await heldReady;
  const p2 = c2.begin(async t => { await f.actor(t, 'principalA'); return planSend(t, q2); });
  let blocked = false;
  for (let i = 0; i < 100 && !blocked; i++) { const [w] = await db`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and state='active'`; blocked = w.n > 0; if (!blocked) await new Promise(r => setTimeout(r, 50)); }
  release();
  const results = (await Promise.allSettled([p1, p2])).map(x => x.status === 'fulfilled' ? { ok: true } : { ok: false, code: x.reason.code, hint: x.reason.hint });
  assert.equal(blocked, true); assert.deepEqual(results, [{ ok: true }, { ok: false, code: '40001', hint: 'tjanst_revision_conflict' }]);
  check(report, 'två samtidiga save_row med samma revision från två anslutningar: exakt en lyckas', results);
}


/** 05.1-08: specialuppdrag (TJANST-02) och samläsning (TJANST-03, D-16), med paritet mot tjanst-model. */
async function jointMatrix(tx, report, f) {
  const A = f.schools.A, Y = 2026;
  const p1 = await staffWithDuties(tx, f, { familyName: 'Samläsare', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
  const p2 = await staffWithDuties(tx, f, { familyName: 'Kollega', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
  const g = await seedGrimNeeds(tx, f);
  await grantSelf(tx, f, { unitIds: [A], staffPersonId: p1.personId });
  await f.actor(tx, 'principalA');
  await tx`select public.phase51_grim_class_command(${tx.json({ action: 'link', commandId: randomUUID(), classId: f.classes.other, planId: g.grPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null })})`;
  let d = await read(tx, A, Y);
  const needOf = (classId, rowKey) => d.classes.find(c => c.classId === classId).needs.find(n => n.rowKey === rowKey);
  const en7a = needOf(f.classes.group, 'engelska'), en7b = needOf(f.classes.other, 'engelska'), ma7a = needOf(f.classes.group, 'matematik');
  assert.deepEqual([en7a.needHt, en7a.needVt], [1800, 1800]);
  let r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: null })));
  const row = async (need, personId, ht, vt) => { r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId, teacherHt: ht, teacherVt: vt, comment: '' }, choice: personId === null ? 'unassigned' : 'manual' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId, teacherHt: ht, teacherVt: vt, comment: '' })); return r.detail.rows.find(x => x.sourceKey === need.sourceKey && x.personId === personId).id; };
  const r1 = await row(en7a, p1.personId, 1800, 1800), r2 = await row(en7b, p1.personId, 1800, 1800);
  const m1 = await row(ma7a, p1.personId, 1350, 1350); await row(ma7a, p2.personId, 1350, 1350);
  r = await send(tx, await planCommand(A, Y, 'save_joint', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Engelska 7A+7B', rowIds: [r1, r2], teachers: [{ personId: p1.personId, ht: 1800, vt: 1800 }] } })).payload : { jointId: null, name: 'Engelska 7A+7B', rowIds: [r1, r2], teachers: [{ personId: p1.personId, ht: 1800, vt: 1800 }] }));
  d = r.detail;
  assert.ok(d.rows.filter(x => [r1, r2].includes(x.id)).every(x => x.jointGroupId === d.joints[0].id));
  const sums = teacherSums(p1.personId, d.rows, d.specials, d.joints);
  assert.deepEqual(sums.teaching, { ht: 1800 + 1350, vt: 1800 + 1350, year: 6300 });
  for (const n of [en7a, en7b]) assert.deepEqual(coverage(n.sourceKey, { ht: n.needHt, vt: n.needVt }, d.rows, d.joints).covered, { ht: 1800, vt: 1800 });
  check(report, 'samläsning 2 klasser × 60 h behov och 1 lärare 60 h: lärartotal 60 h och båda klasserna täckta (tjanst-model på SQL-svaret)', sums.teaching);
  assert.equal(coverageLabel(coverage(ma7a.sourceKey, { ht: ma7a.needHt, vt: ma7a.needVt }, d.rows, d.joints)), '90 av 90 h · 2 lärare');
  check(report, '1 klass med 2 lärare ger full täckning och 2 lärare (90 av 90 h · 2 lärare)');
  const frozenCase10 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Fel', rowIds: [m1, d.rows.find(x => x.sourceKey === ma7a.sourceKey && x.personId === p2.personId).id], teachers: [] } }) : null;
  await deny(tx, report, 'samläsning med rader i bara en klass ger tjanst_joint_too_few', async t => send(t, await planCommand(A, Y, 'save_joint', d.revision, modern ? frozenCase10.payload : { jointId: null, name: 'Fel', rowIds: [m1, d.rows.find(x => x.sourceKey === ma7a.sourceKey && x.personId === p2.personId).id], teachers: [] })), ['22023'], 'tjanst_joint_too_few');
  const m7b = await (async () => { r = { detail: d }; return row(needOf(f.classes.other, 'matematik'), p2.personId, 600, 600); })(); d = r.detail;
  const frozenCase11 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Dubbel', rowIds: [r1, m7b], teachers: [] } }) : null;
  await deny(tx, report, 'rad som redan ingår i en samläsning ger tjanst_joint_already', async t => send(t, await planCommand(A, Y, 'save_joint', d.revision, modern ? frozenCase11.payload : { jointId: null, name: 'Dubbel', rowIds: [r1, m7b], teachers: [] })), ['22023'], 'tjanst_joint_already');
  const frozenCase12 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Fel lärare', rowIds: [m1, m7b], teachers: [{ personId: f.id(99), ht: 60, vt: 0 }] } }) : null;
  await deny(tx, report, 'lärartid för en lärare utanför radernas lärare nekas', async t => send(t, await planCommand(A, Y, 'save_joint', d.revision, modern ? frozenCase12.payload : { jointId: null, name: 'Fel lärare', rowIds: [m1, m7b], teachers: [{ personId: f.id(99), ht: 60, vt: 0 }] })), ['22023'], 'tjanst_invalid');
  const frozenCase13 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'delete_row', payload: { rowId: r1 } }) : null;
  await deny(tx, report, 'en rad i en samläsning kan inte tas bort innan gruppen löses upp', async t => send(t, await planCommand(A, Y, 'delete_row', d.revision, modern ? frozenCase13.payload : { rowId: r1 })), ['22023'], 'tjanst_joint_already');
  if (await d28Installed(tx)) {
    // D-28 (05.1-26), uttryckligt ändrad förväntan: blandgrupp med olika lärare (tidigare godkänd) nekas nu utan delresultat.
    const frozenMixed = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Blandgrupp', rowIds: [m1, m7b], teachers: [{ personId: p1.personId, ht: 1350, vt: 1350 }, { personId: p2.personId, ht: 600, vt: 600 }] } }) : null;
    await deny(tx, report, 'blandgrupp med olika lärare nekas enligt D-28 (tidigare godkänd)', async t => send(t, await planCommand(A, Y, 'save_joint', d.revision, frozenMixed.payload)), ['22023'], 'tjanst_joint_teacher_mismatch');
  } else {
  await tx.savepoint(async t => {
    const mixed = await send(t, await planCommand(A, Y, 'save_joint', d.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'save_joint', payload: { jointId: null, name: 'Blandgrupp', rowIds: [m1, m7b], teachers: [{ personId: p1.personId, ht: 1350, vt: 1350 }, { personId: p2.personId, ht: 600, vt: 600 }] } })).payload : { jointId: null, name: 'Blandgrupp', rowIds: [m1, m7b], teachers: [{ personId: p1.personId, ht: 1350, vt: 1350 }, { personId: p2.personId, ht: 600, vt: 600 }] }));
    assert.equal(mixed.detail.joints.length, 2);
    const dissolved = await send(t, await planCommand(A, Y, 'dissolve_joint', mixed.detail.revision, modern ? (await capturePlanContext(t, { unitId: A, schoolYear: Y, action: 'dissolve_joint', payload: { jointId: mixed.detail.joints.find(j => j.name === 'Blandgrupp').id } })).payload : { jointId: mixed.detail.joints.find(j => j.name === 'Blandgrupp').id }));
    const kept = Object.fromEntries(dissolved.detail.rows.filter(x => [m1, m7b].includes(x.id)).map(x => [x.id, [x.teacherHt, x.jointGroupId]]));
    assert.deepEqual(kept, { [m1]: [1350, null], [m7b]: [600, null] });
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'blandgrupp mellan två kurser i två klasser godkänns; upplösning behåller radernas egen tid');
  }
  // Specialuppdrag: programansvar utan grupp och mentor med klass.
  const frozenCase14 = modern ? await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'programansvar', label: 'Programansvar', personId: p1.personId, classId: f.classes.group, ht: 600, vt: 600, comment: '' } }) : null;
  await deny(tx, report, 'specialuppdrag annat än mentor med klass nekas', async t => send(t, await planCommand(A, Y, 'save_special', d.revision, modern ? frozenCase14.payload : { specialId: null, kind: 'programansvar', label: 'Programansvar', personId: p1.personId, classId: f.classes.group, ht: 600, vt: 600, comment: '' })), ['22023'], 'tjanst_invalid');
  r = await send(tx, await planCommand(A, Y, 'save_special', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'programansvar', label: 'Programansvar GR', personId: p1.personId, classId: null, ht: 1200, vt: 600, comment: '' } })).payload : { specialId: null, kind: 'programansvar', label: 'Programansvar GR', personId: p1.personId, classId: null, ht: 1200, vt: 600, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'save_special', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'mentor', label: 'Mentor 7A', personId: p2.personId, classId: f.classes.group, ht: 600, vt: 600, comment: '' } })).payload : { specialId: null, kind: 'mentor', label: 'Mentor 7A', personId: p2.personId, classId: f.classes.group, ht: 600, vt: 600, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'save_special', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'annat', label: 'Vakant uppdrag', personId: null, classId: null, ht: 300, vt: 0, comment: '' } })).payload : { specialId: null, kind: 'annat', label: 'Vakant uppdrag', personId: null, classId: null, ht: 300, vt: 0, comment: '' }));
  d = r.detail;
  await deny(tx, report, 'CHECK nekar klass på annat uppdrag än mentor även vid direkt skrivning', t => t`update public.tjanst_special_assignments set class_id=${f.classes.group} where label='Programansvar GR'`, ['23514']);
  assert.deepEqual(teacherSums(p1.personId, d.rows, d.specials, d.joints).special, { ht: 1200, vt: 600, year: 1800 });
  r = await send(tx, await planCommand(A, Y, 'publish', d.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} })).payload : {}, { expectedContentHash: d.version.contentHash }));
  d = r.detail;
  await f.actor(tx, 'teacherSelf');
  const own = parseSelfReadReply(await selfRead(tx)).publications[0];
  assert.deepEqual(own.specials.map(x => [x.kind, x.className, x.ht, x.vt]), [['programansvar', null, 1200, 600]]);
  const jointRows = own.rows.filter(x => x.joint);
  assert.equal(jointRows.length, 2); assert.deepEqual(jointRows[0].joint.colleagues, []); assert.equal(jointRows[0].joint.ht, 1800);
  check(report, 'spår: programansvar publicerat syns hos läraren under Specialuppdrag, i summan Specialuppdrag och inte i Undervisning');
  check(report, 'lärarens egen läsning visar samläsningen med lärarens tid i gruppen en gång och utan kollegors uppgifter utanför gruppen');
  await deny(tx, report, 'publicerad samläsningsgrupp är oföränderlig', t => t`update public.tjanst_joint_groups set name='Ändrad' where version_id=${d.version.id}`, ['42501']);
  await deny(tx, report, 'publicerat specialuppdrag är oföränderligt', t => t`delete from public.tjanst_special_assignments where version_id=${d.version.id}`, ['42501']);
  await f.actor(tx, 'principalA');
  const next = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: d.version.id })));
  const lineages = async v => [...(await tx`select lineage_id from public.tjanst_joint_groups where version_id=${v}`), ...(await tx`select lineage_id from public.tjanst_special_assignments where version_id=${v}`)].map(x => x.lineage_id).sort();
  assert.deepEqual(await lineages(next.receipt.versionId), await lineages(d.version.id));
  assert.deepEqual(next.detail.joints[0].rowIds.length, 2); assert.equal(next.detail.specials.length, 3);
  check(report, 'nytt utkast kopierar specialuppdrag och samläsningar med nya id och samma lineage_id');
  // Bemanningens summor lika tjanst-model.schoolSums för samma publicerade fixtur.
  await f.actor(tx, 'hm');
  const staffing = await staffingRead(tx, { schoolYear: Y });
  const unitSums = staffing.units.find(u => u.unitId === A).sums;
  assert.deepEqual(unitSums, schoolSums(d.classes, d.rows, d.specials, d.joints));
  assert.equal(unitSums.teaching.ht, 1800 + 1350 + 1350 + 600);
  check(report, 'samläst tid räknas en gång i bemanningen; summorna är lika i SQL och tjanst-model.schoolSums', unitSums);
}


/** Explicit current-schema adapter: never removes/replaces installed migrations. */
async function currentDatabase(ephemeral, report) {
  const { createEphemeralMigratedDb, migrationFiles } = await import('./ephemeral-migrated-db.mjs');
  const { classifyTjanstMigrations, TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
  const actualSources=Object.fromEntries(migrationFiles().filter(f=>f.slice(0,14)>=TJANST_PHASE_START).map(f=>{
    const file='supabase/migrations/'+f;return [file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')];}));
  classifyTjanstMigrations({journal:TJANST_MIGRATION_REGISTRY.map(m=>m.version),sourceHashes:actualSources});
  report.currentMigrationSources=actualSources;
  if(ephemeral){const e=await createEphemeralMigratedDb();report.baselineMode='ephemeral-current';report.pendingMigrations=[];report.builtMigrations=TJANST_MIGRATION_REGISTRY.map(m=>m.file);
    return {db:e.db,provenance:e.provenance,connect:async()=>e.connect(),close:async()=>{await e.end();report.currentCleanup='complete';}};}
  const {targetPendingMigrations}=await import('./verify-tjanst-actual.mjs');
  const {createNamedTimplanSnapshot}=await import('./named-timplan-snapshot.mjs');
  const target=await targetPendingMigrations(),s=await createNamedTimplanSnapshot();
  try {
    assert.equal(s.provenance.sourceFingerprint,target.fingerprint);
    await s.db.begin(async t=>{for(const file of target.pendingMigrations) await t.unsafe(readFileSync(resolve(root,file),'utf8'));});
    report.baselineMode=target.baselineMode;report.pendingMigrations=target.pendingMigrations;
    return {db:s.db,provenance:s.provenance,connect:s.connect,close:async()=>{
      report.currentCleanup=await s.cleanup();const after=await targetPendingMigrations();
      assert.equal(after.fingerprint,target.fingerprint);assert.deepEqual(after.journal,target.journal);report.targetUnchanged=true;}};
  }catch(e){await s.cleanup();throw e;}
}

export async function verifyTjanstPlan(out, { ephemeral = false, stage = 'current' } = {}) {
  assert.ok(['current','historical'].includes(stage));
  assert.ok(stage !== 'historical' || ephemeral,'Historical stage requires --ephemeral; installed schemas are never downgraded');
  modern = false;
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-plan-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    limitations: ['Own database and synthetic fixtures only; no installed target written', 'No HTTP/OIDC/browser claim; Worker grants come in plan 09',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target' : 'Schema-only copy of the protected local target',
      'GR/IM plan status and one stale-link case are set directly in the fixture (owner, replica role)', 'Special assignments, joint teaching and feedback come in plan 08',
      'SS 12000: Activity/DutyAssignment mapping is intended compatibility, no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); report.commandStage=stage; persist();
    if(stage==='current') {
      source=await currentDatabase(ephemeral,report);report.database=source.provenance;
      const db=source.db;assert.ok((await db`select to_regprocedure('public.tjanst_year_ensure_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,uuid)') present`)[0].present,'Current stage requires year commands');modern=true;
      const f=await db.begin(createTjanstFixture),before=await allPublicHashes(db);
      for(const run of [matrix,grimMatrix,jointMatrix]) {try{await db.begin(async tx=>{await tx`set local statement_timeout='120s'`;await run(tx,report,f);throw rollback;});}catch(e){if(e!==rollback)throw e;}}
      try { await db.begin(async tx=>{const gy=await seedGy25Class(tx,f,'SYNBF2');await f.actor(tx,'principalA');gyRowRules(report,await read(tx,f.schools.A,gy.year),gy);throw rollback;}); } catch(e){if(e!==rollback)throw e;}
      assert.deepEqual(await allPublicHashes(db),before);check(report,'current-schema regression rolls back every behavior fixture');
      await concurrency(db,source.connect,report,f);
    } else {
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: tjanstMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end, connect: async () => e.connect() };
    } else {
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); }, connect: s.connect };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname like 'tjanst_plan%'`)[0].n, 0, 'Plan migration already present');
    for (const p of PREREQUISITES) await db.begin(tx => tx.unsafe(sql(p)));
    report.prerequisites = PREREQUISITES;
    const f = await db.begin(createTjanstFixture);
    const baseline = { fingerprint: await fingerprint(db), rows: await allPublicHashes(db) };
    try { await db.begin(async tx => { await tx.unsafe(sql(OWN)); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await fingerprint(db), baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'återrullning av migrationen återställer exakt schema, ACL och alla rader');
    await db.begin(tx => tx.unsafe(sql(OWN)));
    const installedRows = await allPublicHashes(db);
    for (const [table, value] of Object.entries(baseline.rows)) assert.deepEqual(installedRows[table], value, table);
    check(report, 'installation i den egna databasen lämnar alla befintliga rader orörda');
    for (const [table, columns] of Object.entries(COLUMNS)) {
      assert.deepEqual((await db`select a.attname from pg_attribute a where a.attrelid=${'public.' + table}::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`).map(x => x.attname), columns, table);
      const [t] = await db`select relrowsecurity r,relforcerowsecurity f from pg_class where oid=${'public.' + table}::regclass`;
      assert.ok(t.r && t.f, table + ' RLS');
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
        assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') v`)[0].v, false, role + table);
    }
    check(report, 'exakt kolumnlista per ny tabell (behov och lärartid i skilda kolumner, inga avtal eller bedömningar), tvingad RLS och inga klienträttigheter', COLUMNS);
    const helpers = (await db`select p.oid::regprocedure::text s from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'tjanst_%'`).map(x => x.s);
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) for (const fn of helpers)
      assert.equal((await db`select has_function_privilege(${role},${fn}::regprocedure,'EXECUTE') v`)[0].v, false, role + fn);
    for (const fn of ENTRYPOINTS) assert.ok(helpers.includes(fn), fn);
    check(report, 'alla tjanst-funktioner är stängda för klientroller och Worker tills grant-migrationen (plan 09)', { functions: helpers.length });
    const installed = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='120s'`; await matrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    try { await db.begin(async tx => {
      await tx`set local statement_timeout='120s'`;
      const gy = await seedGy25Class(tx, f, 'SYNBF2'); await f.actor(tx, 'principalA');
      gyRowRules(report, await read(tx, f.schools.A, gy.year), gy); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    try { await db.begin(async tx => { await tx`set local statement_timeout='120s'`; await grimMatrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'hela planprovet rullas tillbaka utan kvarvarande rader');
    for (const p of FOLLOWING.filter(p=>basename(p).slice(0,14)<'20261023120000')) await db.begin(tx => tx.unsafe(sql(p)));
    report.following = FOLLOWING.filter(p=>basename(p).slice(0,14)<'20261023120000');
    const withFollowing = await allPublicHashes(db);
    report.tag = ' (med 05.1-08 installerad)';
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='120s'`; await matrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    report.tag = '';
    try { await db.begin(async tx => { await tx`set local statement_timeout='120s'`; await jointMatrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), withFollowing);
    check(report, 'specialuppdrag- och samläsningsprovet rullas tillbaka utan kvarvarande rader');
    // Samtidighetsprovet committar sina fixturer och körs därför sist.
    await concurrency(db, source.connect, report, f);
    }
    report.historicalCheckCount=stage==='historical'?report.checks.length:0;
    report.currentCheckCount=stage==='current'?report.checks.length:0;
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} service allocation plan SQL checks` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), si=args.indexOf('--stage'), stage=si<0?'current':args[si+1], rest=args.filter((a,i)=>a!=='--ephemeral' && (si<0 || i!==si && i!==si+1));
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral] [--stage current|historical]');
  await verifyTjanstPlan(rest[1], { ephemeral, stage });
}
