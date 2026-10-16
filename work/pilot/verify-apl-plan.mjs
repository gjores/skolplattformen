#!/usr/bin/env node
// Full APL-07 synthetic PostgreSQL proof; no active data or runtime mutation.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, openSync, closeSync, ftruncateSync, writeSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { aplSources, aplActor, aplRace, aplRead, aplCommand, aplStatus, aplSave, installAplCommands, verifyAplCommands, aplMigration } from './verify-apl-plan-commands.mjs';
import { installAplDecisions, aplDecisionRequest, aplDecisionCommand, aplDecisionMigration, verifyAplDecisions } from './verify-apl-plan-decisions.mjs';
import { assertStructureTransition, checkInstalledAdditions } from './apply-apl-plan.mjs';
import { installAplAccess } from './verify-apl-plan-access.mjs';
import { seedAplFull, freshDraft, clone, confirmRequest, completePlan, copyPlan, copyRequest, nextPlan, nextRequest, defensiveCopyMatrix } from './apl-plan-fixtures.mjs';
import { projectAplPlan, parseAplCommand } from '../../web/lib/apl-plan.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(resolve(root,'web/package.json')),postgres=require('postgres');
const accessMigration='supabase/migrations/20261016122000_apl_worker_access.sql';
const sourceHashes=()=>aplSources([aplDecisionMigration,accessMigration,'work/pilot/verify-apl-plan.mjs','work/pilot/apl-plan-fixtures.mjs',
 'web/lib/server/apl-plan.ts','web/lib/server/plan-decision.ts','web/app/api/timplaner/gym/apl/lasa/route.ts','web/app/api/timplaner/gym/apl/kommando/route.ts','web/app/api/timplaner/gym/apl/status/route.ts',
 'web/app/api/planbeslut/underlag/route.ts','web/app/api/planbeslut/andra/route.ts','web/app/api/planbeslut/inkorg/route.ts','web/app/api/planbeslut/lista/route.ts']);
const hash=b=>createHash('sha256').update(b).digest('hex'),rollback=Error('expected_apl_full_rollback');
const ok=(r,id,name,level='actual_worker')=>{assert.ok(!r.checks.some(c=>c.id===id),'duplicate check '+id);r.checks.push({id,name,level,ok:true});console.log('PASS '+id+': '+name);};
async function install(tx,r){await installAplCommands(tx,r);await installAplDecisions(tx,r);await installAplAccess(tx,r);await tx`set constraints all immediate`;for(const [i,c] of r.checks.entries())if(!c.id)Object.assign(c,{id:'INSTALL-'+i,level:'private_helper'});}
async function snapshotState(db){return{fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};}
function inherited(path){const bytes=readFileSync(path),r=JSON.parse(bytes);assert.equal(r.status,'PASS',path);assert.equal(r.cleanup.cleanup,'complete');assert.deepEqual(r.sources,r.finalSources);
 for(const [p,h] of Object.entries(r.sources))assert.equal(hash(readFileSync(resolve(root,p))),h,path+': changed '+p);
 return{kind:r.kind,path,fileSha256:hash(bytes),sourceHashes:r.sources,checks:r.checks,races:r.races??[],cleanup:r.cleanup.cleanup};}
async function deny(db,r,id,name,fn,codes=['42501','40001','22023']){const before=await allPublicHashes(db);let e;try{await fn();}catch(error){e=error;}
 assert.ok(e,name+': unexpectedly accepted');assert.ok(codes.includes(e.code),name+': '+e.code+' '+e.message+' '+e.hint);assert.deepEqual(await allPublicHashes(db),before,name+': partial writes');ok(r,id,name);return e;}
async function noReceipt(db,id){assert.equal((await db`select count(*)::int n from public.apl_plan_commands where command_id=${id}`)[0].n,0);}
async function workerMatrix(snapshot,r,fixtures,url){const {bf:f,other}=fixtures,db=snapshot.db,connections=[];
 try{
 const connect=async()=>{const c=postgres(url,{max:1,prepare:false,onnotice:()=>{}});connections.push(c);assert.deepEqual((await c`select current_user,session_user`)[0],{current_user:'skolplattform_worker',session_user:'skolplattform_worker'});return c;};
 const worker=await connect(),run=(actor,fn,fixture=f)=>worker.begin(async tx=>{await tx`set local statement_timeout='90s'`;await aplActor(tx,fixture,actor);return fn(tx);});
 const ws={db,connect};
 const read=id=>run('principal',tx=>aplRead(tx,id));
 const changed=(d,read,suffix)=>{const v=clone(read.detail.plan??d.value);v.periods[0].name+=suffix;return aplSave(d,read.detail.revision,v);};
 const race=async(name,leftActor,leftFn,rightActor,rightFn)=>{const n=r.races.length,result=await aplRace(ws,r,f,name,leftActor,leftFn,rightActor,rightFn);assert.equal(r.races.length,n+1);return result;};
 const draft=await freshDraft(db,f,'Syntetisk APL07 kapacitet');
  r.case='worker roles';r.workerRole=(await worker`select current_user,session_user`)[0];
  for(const [actor,caps] of [['principal',{canSave:true,canConfirm:true}],['admin',{canSave:true,canConfirm:false}],['hm',{canSave:false,canConfirm:false}]])assert.deepEqual((await run(actor,tx=>aplRead(tx,draft.planId))).detail.capabilities,caps);
  ok(r,'ROLE-01','real rector/admin/HM reads bind actual database assignments');
  await deny(db,r,'ROLE-02','other-school rector cannot read',()=>run('principal2',tx=>aplRead(tx,draft.planId)),['42501']);
  await deny(db,r,'ROLE-03','other-customer session cannot read BF plan',()=>run('principal',tx=>aplRead(tx,draft.planId),other),['42501']);
  const teacherRun=fn=>worker.begin(async tx=>{for(const [key,value]of Object.entries({customer_id:f.id(1),organizer_id:f.id(2),identity_id:f.id(14),membership_id:f.id(24),session_id:f.id(84),assignment_id:f.roles.teacher,correlation_id:randomUUID()}))await tx`select set_config(${`app.${key}`},${value},true)`;return fn(tx);});
  await deny(db,r,'ROLE-04','actual teacher assignment cannot read APL',()=>teacherRun(tx=>aplRead(tx,draft.planId)),['42501']);
  await deny(db,r,'ROLE-05','actual teacher assignment cannot save APL',()=>teacherRun(tx=>aplCommand(tx,aplSave(draft))),['42501']);
  const dates=(await db`select valid_from,valid_to from public.access_assignments where id=${f.roles.principal}`)[0];
  await db`update public.access_assignments set valid_from=public.app_today()-10,valid_to=public.app_today()-1 where id=${f.roles.principal}`;
  try{await deny(db,r,'ROLE-06','expired assignment denies read',()=>read(draft.planId),['42501']);await deny(db,r,'ROLE-07','expired assignment denies save',()=>run('principal',tx=>aplCommand(tx,aplSave(draft))),['42501']);}
  finally{await db`update public.access_assignments set valid_from=${dates.valid_from},valid_to=${dates.valid_to} where id=${f.roles.principal}`;}
  // Archived fixture is rolled back together with its touch timestamp; scope is
  // still checked by production SQL under SET LOCAL ROLE skolplattform_worker.
  const archiveBefore=await allPublicHashes(db);
  try{await db.begin(async tx=>{await aplActor(tx,f,'principal');await tx`update public.offerings set archived_at=clock_timestamp() where id=${f.id(46)}`;
   await tx`set local role skolplattform_worker`;assert.equal((await tx`select current_user`)[0].current_user,'skolplattform_worker');
   assert.equal((await aplRead(tx,draft.planId)).detail.capabilities.canSave,false);
   let e;try{await tx.savepoint(s=>aplCommand(s,aplSave(draft)));}catch(error){e=error;}assert.equal(e?.code,'42501');throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
  assert.deepEqual(await allPublicHashes(db),archiveBefore);ok(r,'ROLE-08','archived education disables save under actual SQL Worker role and preserves original archive/timestamp after rollback','private_helper');
  r.case='domain rule parity';
  const variants=[
   ['unknown form',v=>v.educationForm='unknown'],['apprenticeship',v=>v.educationForm='apprenticeship'],
   ['partial week',v=>v.periods[0].extent={basis:'mixed_weeks',weeks:null,reviewed:false,reviewNote:'Syntetisk blandvecka.'}],
   ['unknown extent',v=>v.periods[0].extent={basis:'unknown',weeks:null,reviewed:false,reviewNote:''}],
   ['unreviewed classification',v=>v.classification='unreviewed'],['missing reviewed extent',v=>v.periods[0].extent.reviewed=false],
   ['impossible calendar capacity',v=>v.periods[0].endsOn=v.periods[0].startsOn],
   ['overlapping periods',v=>{const p=clone(v.periods[0]);p.id=randomUUID();p.allocations=p.allocations.map(a=>({...a,gutMinutes:0}));v.periods.push(p);}],
   ['missing content allocation',v=>v.periods[0].allocations=[]],
   ['minimum 14 weeks',v=>{v.periods[0].extent.weeks=14;v.periods[0].allocations[0].gutMinutes=18630;}],
   ['missing content description',v=>v.periods[0].contents[0].description=''],
   ['wrong school year',v=>v.periods[0].schoolYear+=1],
   ['before actual frozen start',v=>v.periods[0].startsOn=String(f.year-1)+'-08-01'],
   ['outside six terms',v=>v.periods[0].endsOn=String(f.year+4)+'-12-31'],
   ['allocation outside period dates',v=>{v.periods[0].extent.weeks=1;v.periods[0].allocations=[{rowKey:draft.rowKey,termIndex:1,gutMinutes:1380}];}],
   ['disjoint dates reuse one ISO week',v=>{const p=v.periods[0],start=new Date(p.startsOn+'T00:00:00Z');p.endsOn=p.startsOn;p.extent.weeks=1;p.allocations=[{rowKey:draft.rowKey,termIndex:0,gutMinutes:1380}];const next=clone(p);next.id=randomUUID();start.setUTCDate(start.getUTCDate()+2);next.startsOn=next.endsOn=start.toISOString().slice(0,10);v.periods.push(next);}],
   ['incomplete period',v=>Object.assign(v.periods[0],{startsOn:null,endsOn:null,schoolYear:null,contents:[],allocations:[],extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''}})] ];
  let index=0;
  for(const [name,mutate] of variants){const current=await read(draft.planId),v=clone(draft.value);mutate(v);const q=aplSave(draft,current.detail.revision,v);
   const saved=await run('principal',tx=>aplCommand(tx,q));assert.equal(projectAplPlan(saved.context,saved.detail.plan).readyForConfirmation,false,name);
   const cq=await run('principal',tx=>confirmRequest(tx,draft.planId));const error=await deny(db,r,'RULE-'+String(++index).padStart(2,'0'),name+' persists as incomplete and cannot confirm',()=>run('principal',tx=>aplCommand(tx,cq)),['40001']);
   assert.deepEqual(JSON.parse(error.detail).sort(),projectAplPlan(saved.context,saved.detail.plan).issues.filter(i=>i.level==='blocker').map(i=>i.message).sort(),name+': exact SQL/TS blockers');
  }
  let current=await read(draft.planId);const good=await run('principal',tx=>aplCommand(tx,aplSave(draft,current.detail.revision)));assert.equal(projectAplPlan(good.context,good.detail.plan).readyForConfirmation,true);
  ok(r,'RULE-COMPLETE','school-based complete 15 weeks gives exact 20 700 GUT minutes in SQL and TS');
  for(const [id,name,mutate] of [
   ['BOUND-01','101 periods',v=>v.periods=Array.from({length:101},()=>({...clone(v.periods[0]),id:randomUUID()}))],
   ['BOUND-02','foreign row',v=>v.periods[0].contents[0].rowKey='programmeSpecific:ZZZZ:1:ZZZZ1000X'],
   ['BOUND-03','duplicate period identity',v=>v.periods.push(clone(v.periods[0]))],
   ['BOUND-04','inactive term',v=>v.periods[0].allocations[0].termIndex=5],
   ['BOUND-05','negative minute',v=>v.periods[0].allocations[0].gutMinutes=-1],
   ['BOUND-06','duplicate cell tuple',v=>v.periods[0].allocations.push(clone(v.periods[0].allocations[0]))],
  ]){const v=clone(draft.value);mutate(v);const q={...aplSave(draft,good.detail.revision),plan:v};
   let modelRejected=false;try{parseAplCommand(q);}catch{modelRejected=true;}
   if(['BOUND-01','BOUND-03','BOUND-05','BOUND-06'].includes(id))assert.ok(modelRejected);
   await deny(db,r,id,name+' denied without partial writes',()=>run('principal',tx=>tx`select public.phase5_apl_plan_command(${tx.json(q)})`),['22023']);
  }
  const foreignDraft=await freshDraft(db,f,'Syntetisk främmande period');
  const foreignPeriod=clone(foreignDraft.value);foreignPeriod.periods[0].id=good.detail.plan.periods[0].id;
  await deny(db,r,'BOUND-07','period ID from another plan cannot be adopted',()=>run('principal',tx=>aplCommand(tx,aplSave(foreignDraft,foreignDraft.plan.revision,foreignPeriod))),['23505']);
  r.case='actual mandatory audit rollback';
  await db.unsafe(`create function pg_temp.apl07_fail_audit() returns trigger language plpgsql as $$begin if new.customer_id='${f.id(1)}' and new.action='apl_plan_saved' then raise exception 'synthetic APL07 audit failure';end if;return new;end$$;
   create trigger apl07_fail_audit before insert on public.security_events for each row execute function pg_temp.apl07_fail_audit();`);
  try{await deny(db,r,'AUDIT-01','mandatory SQL audit failure rolls back actual Worker save, revision and receipt',()=>run('principal',tx=>aplCommand(tx,aplSave(draft,good.detail.revision,{...draft.value,classification:'unreviewed'}))),['55000']);}
  finally{await db`drop trigger apl07_fail_audit on public.security_events`;}
  r.case='same command concurrency';
  for(const differs of [false,true]){current=await read(draft.planId);const q=changed(draft,current,' tävling'),q2=clone(q);if(differs)q2.plan.periods[0].name+=' annat';
   const v=await race('same ID '+(differs?'different':'same')+' request','principal',tx=>aplCommand(tx,q),'principal',tx=>aplCommand(tx,q2));
   if(differs){assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'40001');}else{assert.equal(v.right.ok,true);const expected=clone(v.left.envelope.result);expected.receipt.replayed=true;assert.deepEqual(v.right.value.envelope.result,expected);}
   assert.equal((await db`select count(*)::int n from public.apl_plan_commands where command_id=${q.commandId}`)[0].n,1);ok(r,differs?'RACE-02':'RACE-01','observed same command ID '+(differs?'different payload conflicts':'identical payload replays once'));
  }
  for(const kind of ['save','row','confirm']){current=await read(draft.planId);const q=changed(draft,current,' före '+kind);let losing;
   if(kind==='save')losing={...changed(draft,current,' andra'),commandId:randomUUID()};
   else if(kind==='confirm')losing=await run('principal',tx=>confirmRequest(tx,draft.planId));
   const hours=clone(draft.hours);hours[0]=401;
   const v=await race('save before '+kind,'principal',tx=>aplCommand(tx,q),kind==='row'?'admin':'principal',tx=>kind==='row'?tx`select public.phase5_write_gym_timplan_row(${draft.planId},${current.detail.revision},${draft.rowKey},${tx.json(hours)})`:aplCommand(tx,losing));
   assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'40001');if(losing)await noReceipt(db,losing.commandId);ok(r,'RACE-03-'+kind,'observed save/'+kind+' prevents stale losing mutation');
  }
  await run('principal',tx=>completePlan(tx,f,draft));current=await read(draft.planId);
  let cq=await run('principal',tx=>confirmRequest(tx,draft.planId)),q=changed(draft,current,' mot bekräftelse');
  let v=await race('confirm before save','principal',tx=>aplCommand(tx,cq),'admin',tx=>aplCommand(tx,q));assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'40001');await noReceipt(db,q.commandId);ok(r,'RACE-04','observed rector confirm/save preserves one confirmation and denies stale save');
  r.case='decision concurrency';
  let submit=await run('principal',tx=>aplDecisionRequest(tx,draft.planId,'submit'));current=await read(draft.planId);q=changed(draft,current,' mot submit');
  v=await race('save before submit','principal',tx=>aplCommand(tx,q),'principal',tx=>aplDecisionCommand(tx,submit));assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'40001');
  assert.equal((await db`select count(*)::int n from public.plan_decision_receipts where command_id=${submit.commandId}`)[0].n,0);ok(r,'RACE-05','observed save/submit denies stale reviewed basis and leaves draft');
  await run('principal',tx=>completePlan(tx,f,draft));submit=await run('principal',tx=>aplDecisionRequest(tx,draft.planId,'submit'));current=await read(draft.planId);q=changed(draft,current,' efter submit');
  v=await race('submit before save','principal',tx=>aplDecisionCommand(tx,submit),'admin',tx=>aplCommand(tx,q));assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'42501');await noReceipt(db,q.commandId);ok(r,'RACE-06','observed submit/save commits submitted state and denies edit');
  const approve=await run('hm',tx=>aplDecisionRequest(tx,draft.planId,'approve'));current=await read(draft.planId);q=changed(draft,current,' efter approve');
  v=await race('approve before save','hm',tx=>aplDecisionCommand(tx,approve),'principal',tx=>aplCommand(tx,q));assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'42501');await noReceipt(db,q.commandId);ok(r,'RACE-07','observed approve/save commits approved state without losing edit');
  r.case='version/copy concurrency';const d2=await freshDraft(db,f,'Syntetisk APL07 version');await run('principal',tx=>aplCommand(tx,aplSave(d2)));current=await read(d2.planId);
  const nq=await nextRequest(db,f,d2.planId);q=changed(d2,current,' efter version');
  v=await race('new version before save','principal',tx=>nextPlan(tx,nq),'principal',tx=>aplCommand(tx,q));assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'42501');await noReceipt(db,q.commandId);
  assert.equal((await db`select status from public.timplans where id=${d2.planId}`)[0].status,'ersatt');ok(r,'RACE-08','observed new-version/save makes old draft immutable and keeps copied structure');
  const d3={...d2,planId:v.left.reply.id};current=await read(d3.planId);const copyQ=await copyRequest(db,f,d3.planId,'Syntetisk APL07 sourcecopy');q=changed(d3,current,' efter copy');
  v=await race('copy before source save','principal',tx=>copyPlan(tx,copyQ),'principal',tx=>aplCommand(tx,q));assert.equal(v.right.ok,true);
  const copied=await read(v.left.reply.id);assert.equal(copied.detail.plan.periods[0].name,current.detail.plan.periods[0].name);assert.deepEqual(copied.detail.plan.periods[0].allocations,current.detail.plan.periods[0].allocations);ok(r,'RACE-09','observed copy/source-save copies exactly prior source and keeps later edit independent');
  r.case='mandate after success';const receipt=v.right.value.envelope.result.receipt;assert.equal(receipt.commandId,q.commandId);
  await db`update public.access_assignments set ended_at=clock_timestamp() where id=${f.roles.principal}`;
  try{await deny(db,r,'MANDATE-01','revoked actual mandate cannot status successful receipt',()=>run('principal',tx=>aplStatus(tx,q)),['42501']);await deny(db,r,'MANDATE-02','revoked actual mandate cannot replay successful receipt',()=>run('principal',tx=>aplCommand(tx,q)),['42501']);}
  finally{await db`update public.access_assignments set ended_at=null where id=${f.roles.principal}`;}
  const replay=await run('principal',tx=>aplStatus(tx,q));assert.equal(replay.envelope.result.state,'completed');
  r.case='mandate changed while queued';current=await read(d3.planId);q=changed(d3,current,' förbjudet efter kö');
  const mandateBefore=(await db`select ended_at,ended_by from public.access_assignments where id=${f.roles.principal}`)[0];
  // Use the production revocation command: it takes the same customer lock as APL.
  // A raw owner UPDATE does not exercise that protocol and cannot prove a queued recheck.
  try{
   v=await aplRace(ws,r,f,'mandate revoke before queued save','hm',tx=>tx`select public.phase3_revoke_mandate(${f.roles.principal})`,'principal',tx=>aplCommand(tx,q));
   assert.equal(v.right.ok,false);assert.equal(v.right.error.code,'42501');await noReceipt(db,q.commandId);
   ok(r,'MANDATE-03','observed production revocation/customer-lock wait rechecks revoked assignment after release');
  }finally{await db`update public.access_assignments set ended_at=${mandateBefore.ended_at},ended_by=${mandateBefore.ended_by} where id=${f.roles.principal}`;}
  r.case='legacy byte preservation';
  for(const receipt of f.legacyReceipts){const actor=receipt.assignment_id===f.roles.hm?'hm':'principal',actual=await run(actor,tx=>aplDecisionCommand(tx,receipt.request,{legacyResult:receipt.result,replayed:true}));assert.equal(JSON.stringify(actual.result),JSON.stringify(receipt.result));const [stored]=await db`select request::text request_text,result::text result_text from public.plan_decision_receipts where command_id=${receipt.command_id}`;assert.equal(stored.request_text,receipt.request_text);assert.equal(stored.result_text,receipt.result_text);}
  ok(r,'LEGACY-01','all pre-install decision receipts replay byte-equivalent JSON through real Worker');
  r.workerMatrixComplete=true;
 }finally{await Promise.all(connections.map(c=>c.end()));}
}
export async function verifyAplPlan({out,accessReport,commandsReport,decisionsReport}){
 const fd=openSync(out,'wx',0o600),r={kind:'apl-full-private-worker-sql',schemaVersion:1,status:'FAIL',runId:randomUUID(),startedAt:new Date().toISOString(),checks:[],races:[],inherited:[],limitations:['Synthetic schema-only database; no active business/auth row copied or changed','Actual PostgreSQL Worker role, synthetic session GUC; not HTTP/OIDC/MFA/browser acceptance','Defensive copy helpers are separately labelled and never represented as public user flows']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(r,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let snapshot;
 try{r.sources=sourceHashes();r.migrations=Object.fromEntries([aplMigration,aplDecisionMigration,accessMigration].map(p=>[p,r.sources[p]]));
  r.inherited.push(inherited(accessReport));
  if(commandsReport)r.inherited.push(inherited(commandsReport));else{const p=out+'.commands.json';assert.equal((await verifyAplCommands(p)).status,'PASS');r.inherited.push(inherited(p));}
  if(decisionsReport)r.inherited.push(inherited(decisionsReport));else{const p=out+'.decisions.json';assert.equal((await verifyAplDecisions(p)).status,'PASS');r.inherited.push(inherited(p));}
  snapshot=await createNamedTimplanSnapshot();r.snapshot=snapshot.provenance;save();const fixtures=await seedAplFull(snapshot),db=snapshot.db;
  r.baseline=await snapshotState(db);const records={};for(const table of Object.keys(r.baseline.rows))records[table]=await db.unsafe('select to_jsonb(t) r from public.'+table+' t');
  try{await db.begin(async tx=>{await install(tx,r);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  r.rollback=await snapshotState(db);assert.deepEqual(r.rollback,r.baseline);r.rollback.restored=true;r.migrationRollbackRestored=true;ok(r,'PRESERVE-01','complete package rollback restores every original row/schema/ACL','private_helper');
  await db.begin(tx=>install(tx,r));r.installed=await snapshotState(db);assertStructureTransition(r.baseline.structure,r.installed.structure);await checkInstalledAdditions(db);r.structureTransitionVerified=true;save();
  const helperBefore=await allPublicHashes(db);try{await db.begin(async tx=>{await tx`set local statement_timeout='180s'`;await defensiveCopyMatrix(tx,fixtures.bf,(id,name,level)=>ok(r,id,name,level));throw rollback;});}catch(e){if(e!==rollback)throw e;}assert.deepEqual(await allPublicHashes(db),helperBefore);r.defensiveCopyRollback=true;
  await snapshot.withPrivateTarget(async({workerDbUrl})=>workerMatrix(snapshot,r,fixtures,workerDbUrl));
  r.final=await snapshotState(db);assert.equal(r.final.fingerprint,r.installed.fingerprint);assert.deepEqual(r.final.structure,r.installed.structure);
  let count=0;for(const [table,rows] of Object.entries(records)){const present=new Set((await db.unsafe('select to_jsonb(t) r from public.'+table+' t')).map(x=>JSON.stringify(x.r)));for(const {r:record}of rows){assert.ok(present.has(JSON.stringify(record)),table+': original row changed');count++;}}
  r.originalPreservation={tables:Object.keys(records).length,exactPreservedRows:count};ok(r,'PRESERVE-02','installed tests preserve every original timestamp, receipt, class and membership row','private_helper');
 }catch(e){r.failure={name:e.name,code:e.code,message:e.message,hint:e.hint,where:e.where,stack:e.stack};}
 finally{try{r.finalSources=sourceHashes();assert.deepEqual(r.finalSources,r.sources);}catch(e){r.sourceFailure={message:e.message};}
  try{if(snapshot)r.cleanup=await snapshot.cleanup();}catch(e){r.cleanupFailure={message:e.message};}
  if(!r.failure&&!r.sourceFailure&&!r.cleanupFailure&&r.workerMatrixComplete&&r.defensiveCopyRollback&&r.structureTransitionVerified&&r.originalPreservation&&r.cleanup?.cleanup==='complete')r.status='PASS';
  r.completedAt=new Date().toISOString();save();closeSync(fd);}
 console.log(r.status+': APL-07 '+r.checks.length+' checks, '+r.races.length+' overlaps; '+out);return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),allowed=new Set(['--out','--access-report','--commands-report','--decisions-report']),opts={};for(let i=0;i<args.length;i+=2){assert.ok(allowed.has(args[i])&&args[i+1]);opts[args[i].slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=resolve(args[i+1]);}
 assert.ok(opts.out?.startsWith('/private/tmp/')&&opts.accessReport?.startsWith('/private/tmp/'),'private --out and --access-report required');if((await verifyAplPlan(opts)).status!=='PASS')process.exitCode=1;
}
