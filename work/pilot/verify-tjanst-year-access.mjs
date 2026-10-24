#!/usr/bin/env node
// 05.1-20: isolated SQL only. --ephemeral builds a private PostgreSQL; default copies schema only.
// node work/pilot/verify-tjanst-year-access.mjs --ephemeral --out /private/tmp/tjanst-year-preview.json
// node work/pilot/verify-tjanst-year-access.mjs --out /private/tmp/tjanst-year-preview-schema.json
import assert from 'node:assert/strict';
import { expectedTjanstWorkerEntrypoints, assertTjanstYearAcl, TJANST_MIGRATION_REGISTRY } from './tjanst-migration-state.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { workerGrants } from './verify-tjanst-actual.mjs';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { grantSelf } from './tjanst-fixtures.mjs';
import { createTjanstYearFixture, seedYearHistory, yearPreview, yearRawPreview, yearManual, yearRowPayload } from './tjanst-year-fixtures.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261023130000_tjanst_year_worker_access.sql';
const rollback = Error('expected_year_preview_rollback');
const sourceFiles = [...TJANST_MIGRATION_REGISTRY.map(m=>m.file), OWN, 'work/pilot/verify-tjanst-year-access.mjs', 'work/pilot/tjanst-year-fixtures.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs',
  'web/lib/tjanst-year-contract.ts', 'supabase/tests/phase51_tjanst_year_hash_vectors.json'];
// Pin transitive repository modules, including dynamic literal imports used by the adapters.
// Runtime binaries/packages and SQL migration files are recorded separately by DB provenance.
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
const businessHashes = async t => { const values = await allPublicHashes(t); delete values.security_events; return values; };

async function savepoint(t, fn) {
  try { await t.savepoint(async u => { await fn(u); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
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
    report.baselineMode = 'ephemeral-before-year-access'; report.pendingMigrations = stage==='current' ? TJANST_MIGRATION_REGISTRY.filter(m=>m.version>=ownVersion).map(m=>m.file) : [OWN];
    return { installed: prefix, db: e.db, connect:e.connect, provenance: e.provenance, pending: report.pendingMigrations, close: e.end };
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
    return { installed: [...target.installed,...prior.map(p=>basename(p).slice(0,14))], db: snapshot.db, connect:snapshot.connect, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup();const after=await targetPendingMigrations();assert.equal(after.fingerprint,target.fingerprint);assert.deepEqual(after.journal,target.journal);report.targetUnchanged=true; } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}


// Every SET ROLE occurs in a rolled-back savepoint. Fixture writes always use the owner.
async function asRole(t, role, fn) {
  assert.ok(['skolplattform_worker','anon','authenticated','service_role'].includes(role));
  let result;
  await savepoint(t, async u => { await u.unsafe('set local role '+role); result=await fn(u); });
  return result;
}
async function acl(db, report, state) {
  const expected=await assertTjanstYearAcl(db,state), actual=await workerGrants(db);
  assert.deepEqual(actual.workerExecute,expected);
  assert.deepEqual(actual.clientRoleExecute,[]);assert.deepEqual(actual.tablePrivileges,[]);assert.deepEqual(actual.publicTablePrivileges,[]);
  report.grants=actual;
  check(report,'exact registry-derived Worker entrypoints; all client/PUBLIC/helper/table grants closed',{count:expected.length,functions:actual.functionCount});
}
const withoutPreviewAcl = structure => ({...structure,functions:structure.functions.map(f=>f.signature.replace(/^public\./u,'')==='tjanst_year_preview(jsonb)'?{...f,acl:null}:f)});
async function cases(db, report) {
  await rolledBack(db, async t => {
    const s=await createTjanstYearFixture(t),{f,unitId,schoolYear}=s;
    await seedYearHistory(t,s);
    const row=await yearPreview(t,s.request());
    const requests=[{unitId,schoolYear,mode:'catalog'},s.request(),{unitId,schoolYear,mode:'batch',batch:{action:'bulk',baseVersionId:row.baseVersionId,items:[{itemKey:'one',kind:'row',payload:yearRowPayload(row,yearManual(row.candidates[0]))}]}}];
    for(const actor of ['principalA','admin']) {
      await f.actor(t,actor);
      for(const q of requests) {
        const before=await businessHashes(t),auditBefore=new Set((await t`select id::text id from public.security_events where action='tjanst_year_preview_read'`).map(e=>e.id));
        await savepoint(t,async u=>{
          await u`set local role skolplattform_worker`;
          const reply=await yearPreview(u,q);assert.equal(reply.mode,q.mode);
          await u`reset role`;
          const events=await u`select id::text id,details,actor_identity_id,session_id,assignment_id,outcome from public.security_events where action='tjanst_year_preview_read' order by id`;
          const added=events.filter(e=>!auditBefore.has(e.id));assert.equal(added.length,1);assert.equal(events.length,auditBefore.size+1);
          const [event]=added;assert.equal(event.session_id,f.sessionId(actor));assert.equal(event.details.mode,q.mode);
          assert.ok(event);assert.equal(event.actor_identity_id,f.identity(actor));assert.equal(event.assignment_id,f.roles[actor]);assert.equal(event.outcome,'ok');
          assert.deepEqual(Object.keys(event.details).sort(),['count','mode','schoolYear','unitId']);assert.equal(event.details.unitId,unitId);assert.equal(event.details.schoolYear,schoolYear);
          assert.deepEqual(await businessHashes(u),before);
        });
        check(report,actor+' Worker '+q.mode+' returns strict DTO and mandatory minimal audit without business writes');
      }
    }
    await f.actor(t,'principalA');
    for(const role of ['anon','authenticated','service_role']) for(const q of requests)
      await denied(t,report,role+' cannot execute '+q.mode,u=>asRole(u,role,v=>yearRawPreview(v,q)),'42501');
    // Direct helpers stay inaccessible even when their arguments would be semantically valid.
    for(const call of ["public.tjanst_year_hash('basis','{}'::jsonb)","public.tjanst_year_history(null::uuid,2026)","public.tjanst_year_choice('{}'::jsonb)","public.tjanst_plan_parse_legacy('{}'::jsonb)"])
      await denied(t,report,'Worker cannot execute internal '+call.split('(')[0],u=>asRole(u,'skolplattform_worker',v=>v.unsafe('select '+call)),'42501');
    for(const actor of ['hm','foreignHm','principalB','teacherGroup']) {
      await f.actor(t,actor);
      for(const q of requests) await denied(t,report,actor+' Worker denied '+q.mode,u=>asRole(u,'skolplattform_worker',v=>yearRawPreview(v,q)),'42501');
    }
    await grantSelf(t,f,{unitIds:[unitId],staffPersonId:s.people[0].personId});await f.actor(t,'teacherSelf');
    for(const q of requests) await denied(t,report,'self Worker denied '+q.mode,u=>asRole(u,'skolplattform_worker',v=>yearRawPreview(v,q)),'42501');
    await f.actor(t,'principalA');
    for(const q of requests) for(const [label,key,value] of [
      ['missing session','session_id',''],['unknown session','session_id',randomUUID()],
      ['mismatched identity','identity_id',f.identity('principalB')],['mismatched membership','membership_id',f.membership('principalB')],
      ['mismatched assignment','assignment_id',f.roles.principalB],['mismatched customer','customer_id',f.id(3)],
    ]) await savepoint(t,async u=>{
      await u`select set_config(${'app.'+key},${value},true)`;
      await denied(u,report,label+' denies '+q.mode,v=>asRole(v,'skolplattform_worker',w=>yearRawPreview(w,q)),'42501');
    });
    for(const state of ['expired','revoked','absolute_expired']) await savepoint(t,async u=>{
      if(state==='expired')await u`update public.app_sessions set expires_at=clock_timestamp()-interval '1 minute' where id=${f.sessionId('principalA')}`;
      if(state==='revoked')await u`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.sessionId('principalA')}`;
      if(state==='absolute_expired')await u`update public.app_sessions set expires_at=clock_timestamp()-interval '2 minutes',absolute_expires_at=clock_timestamp()-interval '1 minute' where id=${f.sessionId('principalA')}`;
      for(const q of requests) await denied(u,report,state+' session denies '+q.mode,v=>asRole(v,'skolplattform_worker',w=>yearRawPreview(w,q)),'42501');
    });
    await savepoint(t,async u=>{
      await f.actor(u,'hm');await u`select public.phase3_revoke_mandate(${f.roles.principalA})`;await f.actor(u,'principalA');
      for(const q of requests) await denied(u,report,'revoked mandate denies '+q.mode,v=>asRole(v,'skolplattform_worker',w=>yearRawPreview(w,q)),'42501');
    });
    await savepoint(t,async u=>{
      await u.unsafe("create or replace function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic audit failure' using errcode='55000';end$$");
      const before=await allPublicHashes(u);
      for(const q of requests) await denied(u,report,'mandatory audit failure prevents Worker '+q.mode,v=>asRole(v,'skolplattform_worker',w=>yearRawPreview(w,q)),'55000');
      assert.deepEqual(await allPublicHashes(u),before);
    });
    check(report,'audit failures leave every business and audit row unchanged');
  });
}

// A real row lock is taken inside the entrypoint. The reader must wait and recheck
// a revocation committed by another connection, rather than trusting the earlier GUCs.
async function sessionLockCase(source,report) {
  const db=source.db;let s;
  await db.begin(async t=>{s=await createTjanstYearFixture(t);});
  const before=await businessHashes(db),one=await source.connect(),two=await source.connect();
  let release,locked,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>locked=r),starting=new Promise(r=>started=r);
  let first,second;
  try {
    first=one.begin(async t=>{await t`set local statement_timeout='20s'`;await t`select id from public.app_sessions where id=${s.f.sessionId('principalA')} for update`;locked();await gate;await t`update public.app_sessions set revoked_at=clock_timestamp() where id=${s.f.sessionId('principalA')}`;});
    await Promise.race([ready,first.then(()=>{throw Error('session lock holder ended before readiness');})]);
    second=two.begin(async t=>{await t`set local statement_timeout='20s'`;await s.f.actor(t,'principalA');const [{pid}]=await t`select pg_backend_pid() pid`;started(pid);await t`set local role skolplattform_worker`;return yearRawPreview(t,s.request());}).then(value=>({value}),error=>({error}));
    const pid=await Promise.race([starting,second.then(r=>{throw r.error??Error('reader ended before readiness');})]);
    let waiting=false;
    for(let i=0;i<100;i++) {const [r]=await db`select wait_event_type from pg_stat_activity where pid=${pid}`;if(r?.wait_event_type==='Lock'){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}
    assert.ok(waiting,'preview must wait on the actual session row lock');release();await first;
    const result=await second;assert.equal(result.error?.code,'42501');
    const after=await businessHashes(db);delete before.app_sessions;delete after.app_sessions;assert.deepEqual(after,before);
    check(report,'Worker waits on real session row lock and rejects committed revocation without business writes');
  } finally {release();await Promise.allSettled([first,second]);await one.end();await two.end();}
}

export async function verifyTjanstYearAccess(out,{ephemeral=false}={}) {
  const output=resolve(out);assert.ok((output.startsWith('/private/tmp/')||output.startsWith('/tmp/'))&&output.endsWith('.json'));assert.ok(!existsSync(output));
  const fd=openSync(output,'wx',0o600),report={kind:'tjanst-year-access',status:'FAIL',mode:ephemeral?'ephemeral':'schema-snapshot',checks:[],startedAt:new Date().toISOString(),migration:OWN,
    limitations:['Only owned databases and synthetic rows; target schema/journal read only; no active 3012, HTTP/OIDC/browser or deployment',
      'SET LOCAL ROLE tests actual SQL grants; session locking is performed by the entrypoint itself',
      'SS 12000:2024/OpenAPI2.1.0: ACL-only change, stable internal IDs and validity unchanged; no exchange verified']};
  const persist=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};let source;
  try {
    report.sources=sources();persist();source=await openDatabase(ephemeral,report,'current');report.database=source.provenance;
    const db=source.db,state={installed:source.installed,applied:[]},before=await schemaFingerprint(db,true),rows=await allPublicHashes(db);
    await acl(db,report,state);
    if(source.pending.includes(OWN)) {
      // Seed representative pre-existing mandate/person/plan/history rows before transactional rehearsal.
      await rolledBack(db,async t=>{
        const s=await createTjanstYearFixture(t);await seedYearHistory(t,s);const existing=await allPublicHashes(t);
        await t.unsafe(readFileSync(resolve(ROOT,OWN),'utf8'));assert.deepEqual(await allPublicHashes(t),existing);
        check(report,'grant preserves pre-existing synthetic mandates, persons, plans and publication history');
      });
      assert.deepEqual(await schemaFingerprint(db,true),before);assert.deepEqual(await allPublicHashes(db),rows);
      check(report,'rehearsal rollback preserves complete schema ACL and all rows');
      await db.begin(t=>t.unsafe(readFileSync(resolve(ROOT,OWN),'utf8')));state.applied.push(OWN);
      const after=await schemaFingerprint(db,true);assert.deepEqual(withoutPreviewAcl(after),withoutPreviewAcl(before));
      assert.notEqual(after.functions.find(f=>f.signature==='tjanst_year_preview(jsonb)').acl,before.functions.find(f=>f.signature==='tjanst_year_preview(jsonb)').acl);
      assert.deepEqual(await allPublicHashes(db),rows);
      check(report,'only preview ACL changes; function definitions owners search_path SECURITY DEFINER RLS tables constraints triggers remain exact');
    }else check(report,'installed access suffix is verified without reapplication or downgrade');
    await acl(db,report,state);assert.equal(report.grants.workerExecuteCount,13);report.expectedEntrypoints=expectedTjanstWorkerEntrypoints(state);
    const installed=await schemaFingerprint(db),data=await allPublicHashes(db);await cases(db,report);
    assert.equal(await schemaFingerprint(db),installed);assert.deepEqual(await allPublicHashes(db),data);check(report,'all role/session/audit cases roll back schema and rows');
    await sessionLockCase(source,report);report.raceFixtures='Committed only in owned database for two-connection session locking; database removed at cleanup';
    assert.equal(await schemaFingerprint(db),installed);
  }catch(e){report.failure={code:e.code??'ASSERTION',hint:e.hint,message:e.message,where:e.where,stack:e.stack};}
  finally {
    try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(e){report.sourceFailure={message:e.message};}
    try{await source?.close();report.cleanup='complete';}catch(e){report.cleanupFailure={message:e.message};}
    if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure)report.status='PASS';report.finishedAt=new Date().toISOString();persist();closeSync(fd);
  }
  console.log(report.status+': '+(report.status==='PASS'?report.checks.length+' årsbehörighetskontroller':report.failure?.message??report.sourceFailure?.message??report.cleanupFailure?.message));
  if(report.status!=='PASS')process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),ephemeral=args.includes('--ephemeral'),rest=args.filter(a=>a!=='--ephemeral');assert.ok(rest.length===2&&rest[0]==='--out');await verifyTjanstYearAccess(rest[1],{ephemeral});
}
