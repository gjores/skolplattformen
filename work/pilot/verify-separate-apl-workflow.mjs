#!/usr/bin/env node
// Owned schema-only PostgreSQL, generated synthetic fixtures. Never installs into active data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, openSync, closeSync, writeSync, ftruncateSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { classFixture } from './verify-class-timplans.mjs';
import { vocationalFixture } from './vocational-plan-fixture.mjs';
import { aplActor, aplDeny, aplRace, aplSources } from './verify-apl-plan-commands.mjs';
const { projectAplFrozenRead, commandAplPlan, readAplStatus } = await import('../../web/lib/server/apl-plan.ts');
const { projectPlanDecision } = await import('../../web/lib/server/plan-decision.ts');
const root=fileURLToPath(new URL('../../',import.meta.url));
export const separationMigration='supabase/migrations/20261018100000_separate_apl_workflow.sql';
const sources=()=>aplSources([separationMigration,'work/pilot/verify-separate-apl-workflow.mjs','web/lib/server/apl-plan.ts','web/lib/server/plan-decision.ts','web/lib/apl-plan-journal.ts','web/app/api/timplaner/gym/apl/kommando/route.ts','web/app/api/timplaner/gym/apl/status/route.ts']);
const raw=async(tx,id)=>(await tx`select public.phase5_gym_timplan_result(${id}) value`)[0].value;
const read=async(tx,id)=>(await tx`select public.phase5_apl_plan_read(${id}) value`)[0].value;
const cmd=async(tx,q)=>(await tx`select public.phase5_apl_plan_command(${tx.json(q)}) value`)[0].value;
const decisionBasis=async(tx,id)=>(await tx`select public.phase5_plan_decision_basis('timplan',${id}) value`)[0].value;
const authority=(f,role)=>({identityId:f.id({principal:11,hm:10,admin:13}[role]),assignmentId:f.roles[role],organizerId:f.id(2),accessFunction:{principal:'rektor',hm:'huvudman',admin:'administrator'}[role]});
const request=(detail,action,extra={})=>({contractVersion:'structured_v1',revisionScope:'apl',expectedTimplanRevision:detail.timplanRevision,commandId:randomUUID(),planId:detail.planId,expectedRevision:detail.revision,action,...extra});
const save=(detail,value)=>request(detail,'save',{plan:value,copyReviewResolutions:[]});
const ok=(r,name)=>{r.checks.push({name,ok:true});console.log('PASS: '+name);};
function environment(workerDbUrl) {
 const values={APP_MODE:'protected',DATABASE_URL:workerDbUrl,SUPABASE_URL:'http://127.0.0.1:56331',
  OIDC_ISSUER:'http://127.0.0.1:8180/realms/synthetic-apl',OIDC_CLIENT_ID:'synthetic-apl',OIDC_CLIENT_SECRET:'unused-synthetic-only',
  OIDC_REDIRECT_URI:'http://127.0.0.1:3999/api/auth/callback',OIDC_POST_LOGOUT_REDIRECT_URI:'http://127.0.0.1:3999/',
  SUPABASE_ANON_KEY:'unused-synthetic-only',SESSION_SECRET:'unused-synthetic-apl-proof-000000000000',MFA_ACR_VALUES:'2',MFA_MAX_AGE_SECONDS:'900',
  SESSION_IDLE_SECONDS:'1800',SESSION_ABSOLUTE_SECONDS:'28800'};
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
 return()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;};
}

const rollback=Error('expected_separate_apl_rollback');
export async function seedSeparateAplFixture(tx){
 const f=await classFixture(tx),{id,actor}=f,catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const catalogId=(await tx`select catalog_id from public.point_plans where id=${id(50)}`)[0].catalog_id;
 const {reference,rows,terms}=vocationalFixture(catalog,'BF25',catalogId);
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetiskt separat APL-flöde','Syntetisk framtida kull','BF25',${reference.orientationCode},${Number(reference.startedOn.slice(0,4))})`;
 const programId=(await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) value`)[0].value.id;
 await actor('principal');await tx`select public.phase5_write_programplan_terms(${programId},0,${tx.json(terms)})`;
 const decide=async(kind,planId,action)=>{const b=(await tx`select public.phase5_plan_decision_basis(${kind},${planId}) value`)[0].value,d=b.result;
  const q={kind,planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)};
  return{q,envelope:(await tx`select public.phase5_plan_decision_command(${tx.json(q)}) value`)[0].value};};
 await decide('programplan',programId,'submit');await actor('hm');const programReceipt=await decide('programplan',programId,'approve');await actor('principal');
 const sourceRevision=(await tx`select revision from public.point_plans where id=${programId}`)[0].revision;
 const made=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${sourceRevision},0,${id(30)},null,null) value`)[0].value;
 let gym=await raw(tx,made.reply.id);assert.equal(gym.timeModel,'school_terms_annual_apl_v2');
 const key=rows.find(r=>!r.key.startsWith('block:')&&!r.key.startsWith('meta:')&&terms.find(t=>t.rowKey===r.key).points[0]>0).key;
 for(const r of rows){const points=terms.find(t=>t.rowKey===r.key).points,row={schoolMinutes:points.map(p=>p>0?p*60:null),annualAplMinutes:[0,1,2].map(i=>points[i*2]+points[i*2+1]>0?(r.key===key&&i===0?20700:0):null)};
  gym=(await tx`select public.phase5_timplan_time_command(${tx.json({contractVersion:'timplan_time_v2',action:'save_row',commandId:randomUUID(),planId:gym.id,expectedRevision:gym.revision,rowKey:r.key,row})}) value`)[0].value.plan;}
 const year=Number(reference.startedOn.slice(0,4)),value={contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[{id:randomUUID(),name:'Syntetisk höst-APL',startsOn:reference.startedOn,endsOn:`${year}-12-30`,schoolYear:year,plannedTermIndex:0,extent:{basis:'whole_weeks',weeks:15,reviewed:true,reviewNote:'Syntetisk granskad omfattning'},contents:[{rowKey:key,description:'Syntetiskt innehåll'}],allocations:[{rowKey:key,termIndex:0,gutMinutes:20700}]}]};
 return {...f,programId,planId:gym.id,key,value,year,programReceipt};
}
async function decision(tx,f,role,action){await aplActor(tx,f,role);const envelope=await decisionBasis(tx,f.planId),d=await projectPlanDecision(envelope,{kind:'timplan',planId:f.planId},authority(f,role));
 const q={kind:'timplan',planId:f.planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)};
 const result=(await tx`select public.phase5_plan_decision_command(${tx.json(q)}) value`)[0].value;await projectPlanDecision(result,{kind:'timplan',planId:f.planId},authority(f,role),q);return{q,result};}
async function verified(tx,f,role){await aplActor(tx,f,role);const envelope=await read(tx,f.planId);await projectAplFrozenRead(envelope.result,envelope.basis,f.planId,authority(f,role));return envelope.result;}
async function matrix(tx,r,f,old){
 let d=await verified(tx,f,'principal');assert.equal(d.revisionScope,'apl');assert.equal(d.capabilities.canSave,false);
 await aplDeny(tx,r.checks,'APL draft cannot be changed before timetable approval',t=>cmd(t,save(d,f.value)),['42501']);
 const basis=await decisionBasis(tx,f.planId);assert.equal(basis.result.contractVersion,'timetable_decision_v2');assert.equal(basis.aplBasis,null);assert.equal(basis.result.apl,null);assert.deepEqual(basis.result.blockers,[]);
 const faultRollback=Error('restore synthetic copy-loss injection');
 try{await tx.savepoint(async t=>{const g=await raw(t,f.planId),review={id:randomUUID(),resolution:null,contractVersion:'time_copy_review_v2',sourcePlanId:f.planId,sourceVersion:1,rowKey:f.key,reason:'missing_row',row:g.timeRows[f.key]};
  // Explicit owner fault injection only in our disposable schema: verify the final decision guard, not a copy command.
  await t`alter table public.timplan_time_models disable trigger timplan_time_models_guard`;await t`update public.timplan_time_models set copy_review=${t.json([review])} where plan_id=${f.planId}`;await t`set constraints all immediate`;await t`alter table public.timplan_time_models enable trigger timplan_time_models_guard`;
  const blocked=await decisionBasis(t,f.planId);assert.ok(blocked.result.blockers.some(x=>x.includes('tidsrader')));const checked=await projectPlanDecision(blocked,{kind:'timplan',planId:f.planId},authority(f,'principal'));assert.ok(checked.blockers.some(x=>x.includes('tidsrader')));throw faultRollback;
 });}catch(e){if(e!==faultRollback)throw e;}ok(r,'unresolved copied time remains a table decision blocker independently of APL periods');
 await decision(tx,f,'principal','submit');const approval=await decision(tx,f,'hm','approve');
 ok(r,'timetable submits and approves with annual budget, without APL confirmation or periods');
 const fixed=await raw(tx,f.planId),timetableHash=(await allPublicHashes(tx)).timplans;
 d=await verified(tx,f,'principal');assert.equal(d.timplanRevision,fixed.revision);assert.equal(d.capabilities.canSave,true);assert.equal(fixed.canPlan,false);
 await aplDeny(tx,r.checks,'old unmarked command cannot start a new write',t=>cmd(t,{...old.q,commandId:randomUUID()}),['40001']);
 const historical=await cmd(tx,old.q);assert.equal(historical.result.receipt.replayed,true);assert.deepEqual(historical.result.detail,old.result.result.detail);ok(r,'old frozen APL receipt replays unchanged after new contract and timetable approval');
 await projectAplFrozenRead(historical.result.detail,historical.basis,f.planId,authority(f,'principal'),true);
 const q=save(d,f.value);let saved=await commandAplPlan(tx,q,authority(f,'principal'));d=saved.body.detail;
 assert.equal(d.revision,q.expectedRevision+1);assert.deepEqual(await raw(tx,f.planId),fixed);assert.deepEqual((await allPublicHashes(tx)).timplans,timetableHash);ok(r,'separate APL save and TypeScript verification preserve approved timetable exactly');
 await aplDeny(tx,r.checks,'stale APL revision rejected without partial writes',t=>cmd(t,{...q,commandId:randomUUID()}),['40001']);
 await aplDeny(tx,r.checks,'stale timetable revision rejected independently',t=>cmd(t,{...save(d,f.value),expectedTimplanRevision:fixed.revision-1}),['40001']);
 const excess=structuredClone(f.value);excess.periods[0].allocations[0].gutMinutes++;
 await aplDeny(tx,r.checks,'period time cannot exceed approved annual APL budget',t=>cmd(t,save(d,excess)),['22023']);
 for(const role of ['hm','principal2']){await aplActor(tx,f,role);await aplDeny(tx,r.checks,role+' cannot save periods for this school',t=>cmd(t,save(d,f.value)),['42501']);}
 await aplActor(tx,f,'admin');await aplDeny(tx,r.checks,'administrator cannot confirm rector placement',t=>cmd(t,request(d,'confirm',{expectedContentHash:d.contentHash,comment:'Syntetisk'})),['42501']);
 await aplActor(tx,f,'hm');await aplDeny(tx,r.checks,'organizer review requires current rector confirmation',t=>cmd(t,request(d,'review',{expectedContentHash:d.contentHash,comment:'Syntetisk'})),['40001']);
 await aplActor(tx,f,'principal');const blockers=(await tx`select public.phase5_apl_confirmation_blockers(public.phase5_gym_timplan_result(${f.planId}),public.phase5_apl_plan_value(${f.planId}),public.phase5_apl_copy_review(${f.planId}),public.phase5_apl_program(public.phase5_gym_timplan_result(${f.planId}))) value`)[0].value;assert.deepEqual(blockers,[]);const confirm=request(d,'confirm',{expectedContentHash:d.contentHash,comment:'Syntetiskt bekräftad förläggning'});d=(await commandAplPlan(tx,confirm,authority(f,'principal'))).body.detail;
 assert.deepEqual(await raw(tx,f.planId),fixed);ok(r,'rector confirms separate APL without changing timetable revision or decision');
 await aplActor(tx,f,'hm');const review=request(d,'review',{expectedContentHash:d.contentHash,comment:'Syntetisk separat huvudmannagranskning'});const reviewed=(await commandAplPlan(tx,review,authority(f,'hm'))).body;d=reviewed.detail;
 assert.equal(d.reviews.at(-1).rectorConfirmationId,d.confirmations.at(-1).id);assert.equal(d.reviews.at(-1).timplanRevision,fixed.revision);
 assert.deepEqual(await raw(tx,f.planId),fixed);ok(r,'organizer review binds exact content, rector event and approved timetable revision');
 const retry=await cmd(tx,review);assert.equal(retry.result.receipt.replayed,true);assert.deepEqual(retry.result.detail,reviewed.detail);ok(r,'organizer review retries exact immutable receipt');
 const reviewStatus=await readAplStatus(tx,{command:review},authority(f,'hm'));assert.equal(reviewStatus.body.state,'completed');assert.deepEqual(reviewStatus.body.result.detail,reviewed.detail);ok(r,'organizer status returns exact role-bound frozen review receipt');
 const revoked=Error('restore synthetic revoked session');try{await tx.savepoint(async t=>{await t`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.id(80)}`;
  await aplDeny(t,r.checks,'revoked organizer session cannot replay review',u=>cmd(u,review),['42501']);throw revoked;});}catch(e){if(e!==revoked)throw e;}

 await aplDeny(tx,r.checks,'organizer cannot modify APL content',t=>cmd(t,save(d,f.value)),['42501']);
 await aplActor(tx,f,'principal');await aplDeny(tx,r.checks,'rector cannot mark organizer review',t=>cmd(t,request(d,'review',{expectedContentHash:d.contentHash,comment:'Syntetisk'})),['42501']);
 const changed=structuredClone(f.value);changed.periods[0].name='Syntetisk ändrad förläggning';const changedResult=await commandAplPlan(tx,save(d,changed),authority(f,'principal'));d=changedResult.body.detail;
 assert.notEqual(d.contentHash,d.confirmations.at(-1).contentHash);assert.notEqual(d.contentHash,d.reviews.at(-1).contentHash);ok(r,'changed periods invalidate both confirmations while retaining complete history');
 const unchangedDecision=await decisionBasis(tx,f.planId);assert.equal(unchangedDecision.result.basisHash,approval.result.result.basisHash);assert.deepEqual(await raw(tx,f.planId),fixed);ok(r,'period edits leave timetable decision basis hash and annual time unchanged');
 await aplActor(tx,f,'hm');const replayApproval=(await tx`select public.phase5_plan_decision_command(${tx.json(approval.q)}) value`)[0].value;await projectPlanDecision(replayApproval,{kind:'timplan',planId:f.planId},authority(f,'hm'),approval.q);assert.deepEqual(replayApproval.result,approval.result.result);ok(r,'timetable approval receipt replays unchanged after later period changes');
 await aplActor(tx,f,'principal');await tx.unsafe("create function pg_temp.separate_apl_fail() returns trigger language plpgsql as $$begin if new.action='apl_plan_saved' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger separate_apl_fail before insert on public.security_events for each row execute function pg_temp.separate_apl_fail();");
 await aplDeny(tx,r.checks,'audit failure rolls back periods, separate revision and receipt',t=>cmd(t,save(d,f.value)),['55000']);await tx`drop trigger separate_apl_fail on public.security_events`;
 await aplDeny(tx,r.checks,'direct APL revision write denied',t=>t`update public.apl_workflow_states set revision=revision+1 where plan_id=${f.planId}`,['42501']);
 await aplDeny(tx,r.checks,'direct review deletion denied',t=>t`delete from public.apl_organizer_reviews where plan_id=${f.planId}`,['42501']);
 await tx`set local role skolplattform_worker`;d=await verified(tx,f,'principal');const workerSaved=await commandAplPlan(tx,save(d,f.value),authority(f,'principal'));assert.equal(workerSaved.body.detail.revision,d.revision+1);await tx`reset role`;ok(r,'actual Worker role can save later APL through protected entrypoint');
 await tx`set constraints all immediate`;
 return{fixed,approval};
}
export async function verifySeparateAplWorkflow(out){
 const fd=openSync(out,'wx',0o600),report={kind:'separate-apl-workflow-private-schema-only',status:'FAIL',checks:[],races:[],startedAt:new Date().toISOString(),limitations:['Synthetic PostgreSQL mandates; no HTTP/OIDC/browser claim','No active database/runtime writes']};
 const persist=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};let snapshot,restoreEnvironment;
 try{report.sources=sources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;restoreEnvironment=await snapshot.withPrivateTarget(target=>environment(target.workerDbUrl));persist();const db=snapshot.db;
  const f=await db.begin(seedSeparateAplFixture);
  const old=await db.begin(async tx=>{await aplActor(tx,f,'principal');const p=await raw(tx,f.planId),q={contractVersion:'structured_v1',commandId:randomUUID(),action:'save',planId:f.planId,expectedRevision:p.revision,copyReviewResolutions:[],plan:{contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[]}};return{q,result:await cmd(tx,q)};});
  report.baseline={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};
  try{await db.begin(async tx=>{await tx.unsafe(readFileSync(resolve(root,separationMigration),'utf8'));await tx`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}
  assert.equal(await schemaFingerprint(db),report.baseline.fingerprint);assert.deepEqual(await allPublicHashes(db),report.baseline.rows);report.migrationRollbackRestored=true;ok(report,'migration rollback restores exact schema, ACL and every original row');
  await db.begin(tx=>tx.unsafe(readFileSync(resolve(root,separationMigration),'utf8')));
  report.workflowSeedCount=(await db`select count(*)::int n from public.timplans where gym_basis is not null`)[0].n;
  report.installed={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};for(const k of Object.keys(report.baseline.rows))assert.deepEqual(report.installed.rows[k],report.baseline.rows[k],k);report.originalRowsPreserved=true;
  for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
   for(const table of ['apl_workflow_states','apl_organizer_reviews'])assert.equal((await db`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false);
   for(const signature of ['phase5_apl_workflow_revision(uuid)','phase5_apl_workflow_guard()'])assert.equal((await db`select has_function_privilege(${role},${'public.'+signature},'EXECUTE') allowed`)[0].allowed,false);
  }ok(report,'new counters, organizer events and helper functions remain private to owner');ok(report,'installation leaves all original tables, receipts and decisions untouched');
  const before=await allPublicHashes(db);try{await db.begin(async tx=>{await matrix(tx,report,f,old);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  assert.deepEqual(await allPublicHashes(db),before);report.matrixRollbackRestored=true;ok(report,'full workflow matrix including deferred constraints rolls back completely');
  await db.begin(async tx=>{await decision(tx,f,'principal','submit');await decision(tx,f,'hm','approve');});
  const live=await db.begin(tx=>verified(tx,f,'principal')),q=save(live,f.value),q2=save(live,{...f.value,classification:'unreviewed'});
  const race=await aplRace(snapshot,report,f,'two later APL edits share revision lock','principal',tx=>cmd(tx,q),'admin',tx=>cmd(tx,q2));assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'40001');report.finalFingerprint=await schemaFingerprint(db);report.finalStructure=await schemaFingerprint(db,true);report.concurrencyComplete=true;ok(report,'observed competing APL edits commit once and reject stale writer');
 }catch(e){report.failure={code:e.code??'ASSERTION',hint:e.hint,message:e.message,where:e.where,stack:e.stack};}
 finally{restoreEnvironment?.();try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(e){report.sourceFailure={message:e.message};}try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(e){report.cleanupFailure={message:e.message};}if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.originalRowsPreserved&&report.migrationRollbackRestored&&report.matrixRollbackRestored&&report.concurrencyComplete)report.status='PASS';report.completedAt=new Date().toISOString();persist();closeSync(fd);}
 console.log(report.status+': '+report.checks.length+' separate APL SQL checks');if(report.status!=='PASS')process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifySeparateAplWorkflow(privateOutput(process.argv.slice(2))).catch(()=>{console.error('FAIL: separate APL preflight');process.exitCode=1;});
