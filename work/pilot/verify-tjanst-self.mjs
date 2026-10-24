#!/usr/bin/env node
// 05.1-08: lärarens egen väg (specialuppdrag, samläsning, kvittens och kommentar) och huvudmannens bemanning.
// Egen databas, syntetiska fixturer; migrationen provas först med återrullning och installeras sedan bara i den egna databasen.
//   node work/pilot/verify-tjanst-self.mjs --out /private/tmp/tjanst-self-sql.json              (schemakopia av skyddat lokalt mål)
//   node work/pilot/verify-tjanst-self.mjs --out /tmp/tjanst-self-sql.json --ephemeral          (egen PostgreSQL byggd från migrationerna)
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
import { createTjanstFixture, grantSelf, planCommand, planRead, planSend, seedGrimNeeds, selfRead, selfRef, selfSend, selfStatus, staffWithDuties, staffingRead,
  tjanstMigrations } from './tjanst-fixtures.mjs';
import { parsePlanCommandReply, parsePlanReadReply, parseSelfCommandReply, parseSelfReadReply, parseStaffingReadReply } from '../../web/lib/tjanst-contract.ts';
import { schoolSums } from '../../web/lib/tjanst-model.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261020130000_tjanst_assignments_feedback.sql';
const PREREQUISITES = tjanstMigrations.slice(0, tjanstMigrations.indexOf(OWN));
const sourceFiles = [...tjanstMigrations, 'work/pilot/tjanst-year-fixtures.mjs', 'web/lib/tjanst-year-contract.ts', 'web/lib/tjanst-contract.ts', OWN, 'work/pilot/verify-tjanst-self.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
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
const rollback = Error('expected_tjanst_self_rollback');
const COLUMNS = {
  tjanst_special_assignments: ['id', 'version_id', 'lineage_id', 'kind', 'label', 'staff_person_id', 'class_id', 'ht_minutes', 'vt_minutes', 'comment'],
  tjanst_joint_groups: ['id', 'version_id', 'lineage_id', 'name'],
  tjanst_joint_members: ['group_id', 'row_id'],
  tjanst_joint_teacher_time: ['group_id', 'staff_person_id', 'ht_minutes', 'vt_minutes'],
  tjanst_feedback: ['id', 'version_id', 'staff_person_id', 'kind', 'body', 'actor_identity_id', 'assignment_id', 'created_at'],
};
const MARKER = 'SYNTETISKKOMMENTAR';

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
function check(report, name, detail) { report.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
async function deny(tx, report, name, fn, codes, hint) {
  let error;
  try { await tx.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial');
  assert.ok(codes.includes(error.code), `${name}: got ${error.code} ${error.hint ?? ''} ${error.message}`);
  if (hint !== undefined) assert.equal(error.hint, hint, name + ': hint');
  check(report, name, { code: error.code, ...(error.hint ? { hint: error.hint } : {}) });
}
const send = async (t, q) => modern ? (await yearCommandSend(t,q)).result : parsePlanCommandReply((await planSend(t,q)).result,q);
const read = async (t, unitId, schoolYear) => (modern ? parseYearPlanReadReply : parsePlanReadReply)(await planRead(t, { unitId, schoolYear }), { unitId, schoolYear });
const self = async t => parseSelfReadReply(await selfRead(t));
const command = async (t, q) => { const envelope = await selfSend(t, q); assert.equal(envelope.contractVersion, 'tjanst_sql_v1'); return parseSelfCommandReply(envelope.result, q); };

async function matrix(tx, report, f) {
  const A = f.schools.A, Y = 2026;
  const p1 = await staffWithDuties(tx, f, { familyName: 'Ettan', duties: [{ unitId: A, percent: 60, startsOn: '2026-07-01' }, { unitId: f.schools.B, percent: 40, startsOn: '2026-07-01' }] });
  const p2 = await staffWithDuties(tx, f, { familyName: 'Tvåan', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
  const g = await seedGrimNeeds(tx, f);
  const selfAssignment = await grantSelf(tx, f, { unitIds: [A], staffPersonId: p1.personId });
  await grantSelf(tx, f, { teacher: 'teacherSelf2', unitIds: [A], staffPersonId: p2.personId });
  await f.actor(tx, 'principalA');
  let d = await read(tx, A, Y);
  const en = d.classes.find(c => c.classId === f.classes.group).needs.find(n => n.rowKey === 'engelska');
  let r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: null })));
  r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: en.sourceKey, personId: p1.personId, teacherHt: 1800, teacherVt: 1800, comment: '' }, choice: 'manual' })).payload : { rowId: null, sourceKind: 'class_timplan', sourceKey: en.sourceKey, personId: p1.personId, teacherHt: 1800, teacherVt: 1800, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'save_special', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'programansvar', label: 'Programansvar', personId: p1.personId, classId: null, ht: 600, vt: 600, comment: '' } })).payload : { specialId: null, kind: 'programansvar', label: 'Programansvar', personId: p1.personId, classId: null, ht: 600, vt: 600, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'save_special', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_special', payload: { specialId: null, kind: 'annat', label: 'Vakant uppdrag', personId: null, classId: null, ht: 300, vt: 300, comment: '' } })).payload : { specialId: null, kind: 'annat', label: 'Vakant uppdrag', personId: null, classId: null, ht: 300, vt: 300, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'publish', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'publish', payload: {} })).payload : {}, { expectedContentHash: r.detail.version.contentHash }));
  const published = r.detail.version;

  // Egen läsning och kvittens.
  await f.actor(tx, 'teacherSelf');
  let own = await self(tx);
  assert.equal(own.capabilities.canAck, true); assert.equal(own.publications[0].acknowledgedAt, null);
  assert.deepEqual(own.publications[0].specials.map(s => s.kind), ['programansvar']);
  const ack = { commandId: randomUUID(), versionId: published.id, action: 'ack' };
  const acked = await command(tx, ack);
  assert.ok(acked.detail.publications[0].acknowledgedAt);
  const replay = await selfSend(tx, ack);
  assert.equal(replay.result.receipt.replayed, true);
  const again = await command(tx, { ...ack, commandId: randomUUID() });
  assert.equal(again.receipt.feedbackId, acked.receipt.feedbackId);
  assert.equal((await tx`select count(*)::int n from public.tjanst_feedback where version_id=${published.id} and kind='ack'`)[0].n, 1);
  check(report, 'kvittens en gång per version: återspelning ger replayed och en ny kvittens ger samma kvitto utan ny rad');
  await deny(tx, report, 'ändrad begäran med samma commandId ger 40001', t => selfSend(t, { ...ack, action: 'comment', body: 'x' }), ['40001'], 'tjanst_command_conflict');
  const body = MARKER + 'å'.repeat(2000 - MARKER.length);
  const comment = { commandId: randomUUID(), versionId: published.id, action: 'comment', body };
  const commented = await command(tx, comment);
  assert.equal(commented.detail.publications[0].comments[0].body.length, 2000);
  check(report, 'kommentar med 2 000 tecken godkänns och syns i lärarens egen läsning');
  await deny(tx, report, 'kommentar med 2 001 tecken ger tjanst_comment_too_long', t => selfSend(t, { ...comment, commandId: randomUUID(), body: body + 'x' }), ['22023'], 'tjanst_comment_too_long');
  const events = await tx`select count(*)::int n from public.security_events where action like 'tjanst_%' and (details::text like ${'%' + MARKER + '%'} or coalesce(object_type,'') like ${'%' + MARKER + '%'})`;
  assert.equal(events[0].n, 0);
  const commandAudit = await tx`select details from public.security_events where action='tjanst_self_command' order by id`;
  assert.ok(commandAudit.length >= 3 && commandAudit.every(e => Object.keys(e.details).every(k => ['commandId', 'action', 'feedbackId'].includes(k))));
  check(report, 'kommentarstexten förekommer aldrig i security_events; audit bär bara commandId, action och feedbackId', { auditRows: commandAudit.length });
  const st = await selfStatus(tx, { command: selfRef(comment) });
  assert.equal(st.result.state, 'completed'); assert.equal(st.result.result.receipt.feedbackId, commented.receipt.feedbackId);
  assert.equal((await selfStatus(tx, { command: { ...selfRef(comment), commandId: randomUUID() } })).result.state, 'not_found');
  check(report, 'status: completed för eget kommando och not_found för okänt commandId');
  await deny(tx, report, 'audit-fel ger 55000 utan återkoppling', async t => {
    await t`alter table public.security_events add constraint tjanst_self_audit_fault check (action<>'tjanst_self_command') not valid`;
    await selfSend(t, { commandId: randomUUID(), versionId: published.id, action: 'comment', body: 'Syntetisk' });
  }, ['55000']);
  assert.equal((await tx`select count(*)::int n from public.tjanst_feedback where kind='comment'`)[0].n, 1);

  // Identitet och synlighet.
  await f.actor(tx, 'teacherSelf2');
  assert.deepEqual((await self(tx)).publications, []);
  await deny(tx, report, 'en annan lärares publicerade version kan inte kvitteras (42501)', t => selfSend(t, { commandId: randomUUID(), versionId: published.id, action: 'ack' }), ['42501']);
  await f.actor(tx, 'teacherGroup');
  await deny(tx, report, 'lärare utan bindning nekas egen läsning (42501)', t => selfRead(t), ['42501']);
  await deny(tx, report, 'lärare utan bindning nekas kvittens (42501)', t => selfSend(t, { commandId: randomUUID(), versionId: published.id, action: 'ack' }), ['42501']);
  await f.actor(tx, 'teacherSelf');
  const viaSelf = await self(tx);
  await f.assign(tx, 'teacherSelf', 'principalA', { function: 'larare', scopeKind: 'group', unitIds: [A], groups: [{ id: f.classes.group, kind: 'teaching' }] });
  await f.actor(tx, 'teacherSelf');
  assert.deepEqual(await self(tx), viaSelf);
  check(report, 'samma lärare med gruppmandat och bindning läser exakt samma egen vy');
  await tx.savepoint(async t => {
    await t`update public.access_assignments set ended_at=now() where id=${selfAssignment}`;
    await f.actor(t, 'teacherSelf');
    let error; try { await t.savepoint(u => selfRead(u)); } catch (e) { error = e; }
    assert.equal(error?.code, '42501');
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'avslutat self-mandat stänger den egna läsningen även via gruppmandatet');
  await f.actor(tx, 'principalA');
  d = await read(tx, A, Y);
  r = await send(tx, await (modern ? planCommand(A, Y, 'add_teacher', d.revision, (await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'add_teacher',payload:{personId:p1.personId}})).payload) : planCommand(A, Y, 'create_draft', d.revision, { basedOnVersionId: published.id })));
  r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, modern ? (await capturePlanContext(tx, { unitId: A, schoolYear: Y, action: 'save_row', payload: { rowId: r.detail.rows[0].id, sourceKind: 'class_timplan', sourceKey: en.sourceKey, personId: p1.personId, teacherHt: 60, teacherVt: 60, comment: '' }, choice: 'manual' })).payload : { rowId: r.detail.rows[0].id, sourceKind: 'class_timplan', sourceKey: en.sourceKey, personId: p1.personId, teacherHt: 60, teacherVt: 60, comment: '' }));
  await f.actor(tx, 'teacherSelf');
  assert.deepEqual((await self(tx)).publications.map(p => [p.versionId, p.rows[0].ht]), [[published.id, 1800]]);
  check(report, 'utkastet är osynligt för läraren; den publicerade versionen visas oförändrad');

  // Rektor ser återkopplingen; huvudmannen inte.
  await f.actor(tx, 'principalA');
  d = await read(tx, A, Y);
  assert.equal(d.feedback.versionNo, published.versionNo);
  assert.ok(d.feedback.teachers.find(t => t.personId === p1.personId).acknowledgedAt);
  assert.equal(d.feedback.comments[0].body, body); assert.equal(d.feedback.comments[0].personId, p1.personId);
  check(report, 'rektor ser kvittens och kommentar för den publicerade versionen');
  await f.actor(tx, 'hm');
  const hm = await read(tx, A, Y);
  assert.equal(hm.feedback, undefined);
  check(report, 'huvudmannens läsning av fördelningen har ingen återkoppling');

  // Bemanning.
  const staffing = parseStaffingReadReply(await staffingRead(tx, { schoolYear: Y }), { schoolYear: Y });
  const a = staffing.units.find(u => u.unitId === A), b = staffing.units.find(u => u.unitId === f.schools.B);
  await f.actor(tx, 'principalA');
  const publishedRead = parsePlanReadReply(await planRead(tx, { unitId: A, schoolYear: Y, versionId: published.id }), { unitId: A, schoolYear: Y, versionId: published.id });
  assert.deepEqual(a.sums, schoolSums(publishedRead.classes, publishedRead.rows, publishedRead.specials, publishedRead.joints));
  assert.equal(a.published.versionId, published.id); assert.equal(b.published, null); assert.equal(b.sums, null);
  assert.deepEqual(staffing.vacancies.map(v => [v.kind, v.label]), [['special', 'Vakant uppdrag']]);
  assert.ok(a.sums.unlinkedClasses >= 0 && a.sums.unallocated.ht > 0);
  check(report, 'bemanning: summor per skola lika tjanst-model.schoolSums, vakanser listas och skola utan publicering har inga summor', a.sums);
  for (const role of ['principalA', 'admin']) {
    await f.actor(tx, role);
    await deny(tx, report, `bemanning nekas för ${role} (42501)`, t => staffingRead(t, { schoolYear: Y }), ['42501']);
  }
  void g;
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

export async function verifyTjanstSelf(out, { ephemeral = false, stage = 'current' } = {}) {
  assert.ok(['current','historical'].includes(stage));
  assert.ok(stage !== 'historical' || ephemeral,'Historical stage requires --ephemeral; installed schemas are never downgraded');
  modern = false;
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-self-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    limitations: ['Own database and synthetic fixtures only; no installed target written', 'No HTTP/OIDC/browser claim; Worker grants come in plan 09',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target' : 'Schema-only copy of the protected local target',
      'GR/IM plan status is set directly in the fixture', 'Acknowledgement is receipt, not acceptance', 'SS 12000: feedback and staffing sums are internal'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); report.commandStage=stage; persist();
    if(stage==='current') {
      source=await currentDatabase(ephemeral,report);report.database=source.provenance;
      const db=source.db;assert.ok((await db`select to_regprocedure('public.tjanst_year_ensure_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,uuid)') present`)[0].present,'Current stage requires year commands');modern=true;
      const f=await db.begin(createTjanstFixture),before=await allPublicHashes(db);
      for(const run of [matrix]) {try{await db.begin(async tx=>{await tx`set local statement_timeout='120s'`;await run(tx,report,f);throw rollback;});}catch(e){if(e!==rollback)throw e;}}
      assert.deepEqual(await allPublicHashes(db),before);check(report,'current-schema regression rolls back every behavior fixture');

    } else {
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: tjanstMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end };
    } else {
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); } };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname in ('tjanst_self_command','tjanst_staffing_read')`)[0].n, 0, 'Feedback migration already present');
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
    check(report, 'exakt kolumnlista per ny tabell, tvingad RLS och inga klienträttigheter', COLUMNS);
    const fns = (await db`select p.oid::regprocedure::text s from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'tjanst_%'`).map(x => x.s);
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) for (const fn of fns)
      assert.equal((await db`select has_function_privilege(${role},${fn}::regprocedure,'EXECUTE') v`)[0].v, false, role + fn);
    check(report, 'alla tjanst-funktioner är stängda för klientroller och Worker tills grant-migrationen (plan 09)', { functions: fns.length });
    const installed = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='120s'`; await matrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'hela provet rullas tillbaka utan kvarvarande rader');
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
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} own service, feedback and staffing SQL checks` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), si=args.indexOf('--stage'), stage=si<0?'current':args[si+1], rest=args.filter((a,i)=>a!=='--ephemeral' && (si<0 || i!==si && i!==si+1));
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral] [--stage current|historical]');
  await verifyTjanstSelf(rest[1], { ephemeral, stage });
}
