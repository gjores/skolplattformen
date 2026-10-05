#!/usr/bin/env node
// 05-21: riktiga PostgreSQL-transaktioner/låsväntor i isolerad syntetisk kund.
// SQL körs som skolplattform_worker med faktisk sessionskontext. Inget HTTP-/MFA-bevis.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {createProgramplanBrowserFixture} from './phase5-programplan-browser-fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const UNITS_LOCK_CASES=['same-revision-single-commit','outer-rollback-preserves-units','b-mandate-revoked-after-customer-lock'];
const sources=['supabase/migrations/20261004130000_phase5_programplan_units.sql','work/pilot/phase5-programplan-browser-fixtures.mjs','work/pilot/verify-programplan-units-locks.mjs'];
export async function runUnitsLocks(outFile=resolve(root,'work/pilot/results/phase5-21-units-locks.json')){
 if(![resolve(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(resolve(outFile))))throw Error('REFUSED_unsafe_output');
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:5,prepare:false,onnotice:()=>{}});
 const report={kind:'phase5-programplan-units-locks',scope:'local-synthetic SQL only; observed PostgreSQL locks; no HTTP/MFA proof',status:'FAIL',cases:[],sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
 let fixture,a,b,active,original,baselineAuditIds;
 const businessHashes=async()=>{const[row]=await db`select
  (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id)::text,'[]')) from public.offerings o) offerings,
  (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]')) from public.point_plans p) plans,
  (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) from public.school_classes c) classes,
  (select md5(coalesce(jsonb_agg(to_jsonb(u) order by u.offering_id,u.unit_id)::text,'[]')) from public.offering_units u) offeringUnits,
  (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) from public.security_events e where id=any(${baselineAuditIds}::bigint[])) preservedAudit`;return {...row};};
 const context=async tx=>{await tx`set local role skolplattform_worker`;const corr=randomUUID(),s=fixture.hm;
  await tx`select set_config('app.customer_id',${fixture.customerId},true),set_config('app.identity_id',${s.identityId},true),set_config('app.membership_id',${s.membershipId},true),set_config('app.assignment_id',${s.assignmentId},true),set_config('app.session_id',${s.id},true),set_config('app.correlation_id',${corr},true)`;return corr;};
 const change=async(tx,revision,units)=>{const[row]=await tx`select public.phase5_change_programplan_education(${fixture.offeringId},${revision},'units',${tx.json({unitIds:units})}::jsonb) result`;return row.result;};
 const ownedState=async()=>{const[row]=await db`select
  (select lifecycle_revision from public.offerings where id=${fixture.offeringId}) revision,
  (select jsonb_agg(unit_id::text order by unit_id) from public.offering_units where offering_id=${fixture.offeringId}) units,
  (select count(*)::int from public.security_events where customer_id=${fixture.customerId} and action='programplan_education_units_changed') audit,
  (select count(*)::int from public.organisation_events where organizer_id=(select organizer_id from public.offerings where id=${fixture.offeringId}) and action='programplan_education_units_changed') as "organisationEvents"`;return {...row};};
 try{
  const[applied]=await db`select exists(select 1 from supabase_migrations.schema_migrations where version='20261004130000') ok`;assert.equal(applied.ok,true);
  baselineAuditIds=(await db`select id::text from public.security_events order by id`).map(r=>r.id);original=await businessHashes();
  fixture=await createProgramplanBrowserFixture();a=await db.reserve();b=await db.reserve();
  const[pa]=await a`select pg_backend_pid() pid`,[pb]=await b`select pg_backend_pid() pid`;
  const observe=async()=>{for(const until=Date.now()+5000;Date.now()<until;){const[row]=await db`select wait_event_type,wait_event from pg_stat_activity where pid=${pb.pid} and ${pa.pid}=any(pg_blocking_pids(pid))`;if(row){assert.equal(row.wait_event_type,'Lock');return{blocker:pa.pid,waiter:pb.pid,waitEvent:row.wait_event};}await new Promise(r=>setTimeout(r,25));}throw Error('observed_lock_required');};
  const all=[fixture.unitId,fixture.secondUnitId];
  active=UNITS_LOCK_CASES[0];await a`begin`;const corrA=await context(a);const first=await change(a,0,all);assert.equal(first.lifecycle.revision,1);
  await b`begin`;const corrB=await context(b);const pending=change(b,0,[fixture.unitId,fixture.foreignUnitId]).then(result=>({result}),error=>({code:error.code}));
  const observedLock=await observe();await a`commit`;const second=await pending;assert.equal(second.code,'40001');await b`rollback`;
  const state=await ownedState();assert.deepEqual(state,{revision:1,units:all,audit:1,organisationEvents:1});
  const events=await db`select correlation_id::text from public.security_events where customer_id=${fixture.customerId} and action='programplan_education_units_changed'`;assert.deepEqual(events.map(e=>e.correlation_id),[corrA]);assert.ok(events.every(e=>e.correlation_id!==corrB));
  report.cases.push({name:active,status:'PASS',observedLock,oneCommit:true,loserSqlstate:second.code,noLoserAudit:true});
  active=UNITS_LOCK_CASES[1];const beforeRollback=await ownedState();await a`begin`;await context(a);const rolledBack=await change(a,1,[fixture.unitId]);assert.equal(rolledBack.lifecycle.revision,2);assert.equal(rolledBack.lifecycle.units.length,1);await a`rollback`;assert.deepEqual(await ownedState(),beforeRollback);
  report.cases.push({name:active,status:'PASS',unitsRevisionAuditPreserved:true});
  active=UNITS_LOCK_CASES[2];const beforeRevoke=await ownedState();await a`begin`;await a`select public.phase3_lock_customer(${fixture.customerId})`;
  const deleted=await a`delete from public.mandate_units where assignment_id=${fixture.hm.assignmentId} and customer_id=${fixture.customerId} and unit_id=${fixture.secondUnitId} returning unit_id`;assert.equal(deleted.length,1);
  await b`begin`;await context(b);const waiting=change(b,1,[fixture.unitId]).then(result=>({result}),error=>({code:error.code}));
  const revokeLock=await observe();assert.equal(revokeLock.waitEvent,'advisory');await a`commit`;const denied=await waiting;assert.equal(denied.code,'42501');await b`rollback`;assert.deepEqual(await ownedState(),beforeRevoke);
  report.cases.push({name:active,status:'PASS',observedLock:revokeLock,deniedSqlstate:denied.code,noPartialSchoolWrite:true,mandateRecheckedAfterWait:true});
  assert.deepEqual(report.cases.map(c=>c.name),UNITS_LOCK_CASES);report.status='PASS';
 }catch(error){report.failedCase=active;report.code=/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:'TEST_FAILED';}
 finally{
  for(const tx of[a,b])if(tx){await tx`rollback`.catch(()=>{});tx.release();}
  try{await assertTarget('protected');if(fixture)report.cleanup=await fixture.cleanup();if(original){report.originalHashes=original;report.finalHashes=await businessHashes();assert.deepEqual(report.finalHashes,original);report.originalBusinessAndAuditPreserved=true;}report.cleanupStatus='PASS';}catch{report.cleanupStatus='FAIL';report.status='FAIL';}
  await db.end({timeout:5});report.completedAt=new Date().toISOString();report.sourceHashes=Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));mkdirSync(dirname(resolve(outFile)),{recursive:true});writeFileSync(resolve(outFile),JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let outFile;const args=process.argv.slice(2);for(let i=0;i<args.length;i++){if(args[i]==='--out'&&args[i+1])outFile=resolve(args[++i]);else throw Error('unknown_argument');}
 const report=await runUnitsLocks(outFile);console.log(JSON.stringify({status:report.status,cases:report.cases,code:report.code,cleanup:report.cleanupStatus,businessAndAuditPreserved:report.originalBusinessAndAuditPreserved}));if(report.status!=='PASS')process.exitCode=1;
}
