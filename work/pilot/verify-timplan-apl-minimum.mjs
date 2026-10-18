#!/usr/bin/env node
// Own schema-only PostgreSQL and synthetic fixtures; never changes the active database or 3012.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,openSync,closeSync,writeSync,ftruncateSync,fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot,schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes,privateOutput } from './verify-atomic-cohort-copy.mjs';
import { seedSeparateAplFixture } from './verify-separate-apl-workflow.mjs';
import { seedPlanningFlowFixture } from './planning-flow-fixtures.mjs';
import { aplActor,aplDeny,aplRace,aplSources } from './verify-apl-plan-commands.mjs';
const {projectPlanDecision}=await import('../../web/lib/server/plan-decision.ts');
const root=fileURLToPath(new URL('../../',import.meta.url));
export const minimumAplMigration='supabase/migrations/20261018120000_timplan_minimum_apl_budget.sql';
const minimum='Planera minst 345 timmar APL i timplanen. Perioder och veckor planeras senare.';
const transition='Byt till timtabellen med separat APL per årskurs innan timplanen skickas för godkännande.';
const sources=()=>aplSources([minimumAplMigration,'work/pilot/verify-timplan-apl-minimum.mjs','web/lib/server/plan-decision.ts']);
const raw=async(tx,id)=>(await tx`select public.phase5_gym_timplan_result(${id}) value`)[0].value;
const basis=async(tx,id)=>(await tx`select public.phase5_plan_decision_basis('timplan',${id}) value`)[0].value;
const command=async(tx,q)=>(await tx`select public.phase5_plan_decision_command(${tx.json(q)}) value`)[0].value;
const auth=(f,role)=>({identityId:f.id(role==='hm'?10:11),assignmentId:f.roles[role],organizerId:f.id(2),accessFunction:role==='hm'?'huvudman':'rektor'});
const request=(d,action)=>({kind:'timplan',planId:d.planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)});
const ok=(r,name)=>{r.checks.push({name,ok:true});console.log('PASS: '+name);};
async function decision(tx,f,role,action){await aplActor(tx,f,role);const b=await basis(tx,f.planId),q=request(b.result,action);return{q,result:await command(tx,q)};}
async function saveRow(tx,planId,rowKey,row,revision){return(await tx`select public.phase5_timplan_time_command(${tx.json({contractVersion:'timplan_time_v2',action:'save_row',commandId:randomUUID(),planId,expectedRevision:revision,rowKey,row})}) value`)[0].value.plan;}
async function budget(tx,f,minutes){await aplActor(tx,f,'principal');const g=await raw(tx,f.planId),row=structuredClone(g.timeRows[f.key]);row.annualAplMinutes[0]=minutes;return saveRow(tx,f.planId,f.key,row,g.revision);}
async function projected(tx,f,role='principal'){await aplActor(tx,f,role);const b=await basis(tx,f.planId);return{b,p:await projectPlanDecision(b,{kind:'timplan',planId:f.planId},auth(f,role))};}
const rolled=Error('synthetic minimum matrix rollback');
async function sandbox(tx,fn){try{await tx.savepoint(async t=>{await fn(t);await t`set constraints all immediate`;throw rolled;});}catch(e){if(e!==rolled)throw e;}}
export function assertMinimumStructure(before,after){
 const changed=[];
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 for(const key of Object.keys(before))if(key!=='functions')assert.deepEqual(after[key],before[key],key);
 assert.equal(after.functions.length,before.functions.length);
 for(const old of before.functions){const next=after.functions.find(f=>f.signature===old.signature);assert.ok(next);const {definition:a,...am}=old,{definition:b,...bm}=next;assert.deepEqual(am,bm);if(a!==b)changed.push(old.signature.replace(/^public\./u,'').replaceAll(', ',','));}
 assert.deepEqual(changed,['phase5_plan_decision_detail(text,uuid)']);
}
async function matrix(tx,r,f,oldSubmitted,oldApproved){
 for(const minutes of [0,20699,20700,20701])await sandbox(tx,async t=>{
  const saved=await budget(t,f,minutes);assert.equal(saved.timeRows[f.key].annualAplMinutes[0],minutes);
  const {b,p}=await projected(t,f);assert.equal(b.result.blockers.includes(minimum),minutes<20700);assert.equal(p.blockers.includes(minimum),minutes<20700);
  assert.equal(b.result.apl,null);assert.equal(b.aplBasis,null);
  if(minutes<20700)await aplDeny(t,r.checks,`APL ${minutes} minutes: draft saves but submission fails`,u=>command(u,request(b.result,'submit')),['40001']);
  else{await decision(t,f,'principal','submit');await decision(t,f,'hm','approve');ok(r,`APL ${minutes} minutes submits and approves with no periods`);}
 });
 await sandbox(tx,async t=>{
  await aplActor(t,oldSubmitted.f,'hm');const b=await basis(t,oldSubmitted.f.planId);assert.ok(b.result.blockers.includes(minimum));
  await aplDeny(t,r.checks,'previously submitted insufficient budget cannot be approved',u=>command(u,request(b.result,'approve')),['40001']);
 });
 for(const prior of [oldSubmitted,oldApproved]){
  const role=prior.q.action==='approve'?'hm':'principal';await aplActor(tx,prior.f,role);const again=await command(tx,prior.q);
  assert.equal(again.replayed,true);assert.deepEqual(again.result,prior.result.result);
  const p=await projectPlanDecision(again,{kind:'timplan',planId:prior.f.planId},auth(prior.f,role),prior.q);assert.deepEqual(p.blockers,[]);
  ok(r,'historical '+prior.q.action+' below minimum replays exact frozen result');
 }
 await sandbox(tx,async t=>{
  await aplActor(t,f,'principal');const g=await raw(t,f.planId);
  // Isolated owner fixture simulates a pre-V2 draft, without weakening production permissions.
  await t`set constraints all immediate`;await t`alter table public.timplan_time_cells_v2 disable trigger user`;await t`alter table public.timplan_time_models disable trigger user`;
  await t`delete from public.timplan_time_cells_v2 where plan_id=${f.planId}`;await t`delete from public.timplan_time_models where plan_id=${f.planId}`;
  await t`set constraints all immediate`;await t`alter table public.timplan_time_cells_v2 enable trigger user`;await t`alter table public.timplan_time_models enable trigger user`;
  await t`alter table public.timplan_cells disable trigger user`;
  for(const [key,row]of Object.entries(g.timeRows))await t`insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(${f.planId},${key},array(select jsonb_array_elements_text(${t.json(row.schoolMinutes.map(n=>(n??0)/60))}))::smallint[],array(select jsonb_array_elements_text(${t.json(row.schoolMinutes.map(n=>n!==null))}))::boolean[])`;
  await t`set constraints all immediate`;await t`alter table public.timplan_cells enable trigger user`;
  const {b,p}=await projected(t,f);assert.ok(b.result.blockers.includes(transition));assert.ok(p.blockers.includes(transition));
  await aplDeny(t,r.checks,'legacy vocational draft requires explicit annual APL transition',u=>command(u,request(b.result,'submit')),['40001']);
 });
 await sandbox(tx,async t=>{
  await aplActor(t,f,'principal');let g=await raw(t,f.planId);
  for(const [key,value]of Object.entries(g.timeRows)){const row=structuredClone(value);row.schoolMinutes=row.schoolMinutes.map(n=>n===null?null:1);g=await saveRow(t,f.planId,key,row,g.revision);}
  const {b,p}=await projected(t,f);assert.ok(b.result.blockers.some(x=>x.includes('planerade undervisningstimmar')));assert.ok(p.blockers.some(x=>x.includes('planerade undervisningstimmar')));assert.ok(!p.blockers.includes(minimum));
  await aplDeny(t,r.checks,'sufficient APL does not bypass guaranteed teaching-time minimum',u=>command(u,request(b.result,'submit')),['40001']);
 });
 await sandbox(tx,async t=>{
  const pf={...f,planId:f.preparatory.planId};await aplActor(t,pf,'principal');let g=await raw(t,pf.planId);
  assert.equal(g.timeModel,undefined);
  for(const d of g.source.distribution){const saved=(await t`select public.phase5_write_gym_timplan_row(${pf.planId},${g.revision},${d.rowKey},${t.json(d.points.map(n=>n>0?n:null))}) value`)[0].value;g.revision=saved.revision;}
  const {p}=await projected(t,pf);assert.deepEqual(p.blockers,[]);await decision(t,pf,'principal','submit');await decision(t,pf,'hm','approve');
  ok(r,'higher-education preparatory timetable needs no APL budget');
 });
 await sandbox(tx,async t=>{
  await aplActor(t,f,'principal');await budget(t,f,20699);const b=await basis(t,f.planId);
  await aplDeny(t,r.checks,'actual Worker grant cannot bypass APL minimum',async u=>{await u`set local role skolplattform_worker`;return command(u,request(b.result,'submit'));},['40001']);
 });
}
export async function verifyTimplanAplMinimum(out){
 const fd=openSync(out,'wx',0o600),r={kind:'timplan-apl-minimum-private-schema-only',status:'FAIL',checks:[],races:[],startedAt:new Date().toISOString(),limitations:['Own schema-only PostgreSQL with synthetic school mandates; no active rows copied or changed','No actual HTTP/OIDC/browser claim']};
 const persist=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(r,null,2)+'\n',0,'utf8');fsyncSync(fd);};let snap;
 try{
  r.sources=sources();snap=await createNamedTimplanSnapshot();r.snapshot=snap.provenance;persist();const db=snap.db;
  const seed=await seedPlanningFlowFixture(snap),f={...seed,id:n=>seed.ids[1].slice(0,-12)+String(n).padStart(12,'0')};
  const old=[];for(const approve of [false,true]){const conn=await snap.connect();try{old.push(await conn.begin(async tx=>{const fixture=await seedSeparateAplFixture(tx);await budget(tx,fixture,0);let receipt=await decision(tx,fixture,'principal','submit');if(approve)receipt=await decision(tx,fixture,'hm','approve');return{f:fixture,...receipt};}));}finally{await conn.end();}}
  await db.begin(async tx=>{await aplActor(tx,f,'principal');r.oldDraftHash=(await basis(tx,f.planId)).result.basisHash;});
  r.baseline={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};
  try{await db.begin(async tx=>{await tx.unsafe(readFileSync(resolve(root,minimumAplMigration),'utf8'));await tx`set constraints all immediate`;throw rolled;});}catch(e){if(e!==rolled)throw e;}
  assert.equal(await schemaFingerprint(db),r.baseline.fingerprint);assert.deepEqual(await allPublicHashes(db),r.baseline.rows);r.migrationRollbackRestored=true;ok(r,'migration rollback restores exact schema, ACL and all rows');
  await db.begin(tx=>tx.unsafe(readFileSync(resolve(root,minimumAplMigration),'utf8')));
  r.installed={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};
  assertMinimumStructure(r.baseline.structure,r.installed.structure);assert.deepEqual(r.installed.rows,r.baseline.rows);r.originalRowsPreserved=true;ok(r,'only decision detail function changes; all rows, ACL and other structures preserved');
  await db.begin(async tx=>{await aplActor(tx,f,'principal');const b=await basis(tx,f.planId);assert.notEqual(b.result.basisHash,r.oldDraftHash);await aplDeny(tx,r.checks,'old decision preview hash cannot authorize a new decision',t=>command(t,{...request(b.result,'submit'),basisHash:r.oldDraftHash}),['40001']);});
  const before=await allPublicHashes(db);try{await db.begin(async tx=>{await matrix(tx,r,f,...old);await tx`set constraints all immediate`;throw rolled;});}catch(e){if(e!==rolled)throw e;}
  assert.deepEqual(await allPublicHashes(db),before);r.matrixRollbackRestored=true;ok(r,'complete synthetic matrix rolls back, including deferred constraints');
  const submit=await db.begin(async tx=>{await aplActor(tx,f,'principal');return request((await basis(tx,f.planId)).result,'submit');});
  const race=await aplRace(snap,r,f,'APL reduction races submission','principal',tx=>budget(tx,f,20699),'principal',tx=>command(tx,submit));assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'40001');r.concurrencyComplete=true;
  await db.begin(async tx=>{await aplActor(tx,f,'principal');const b=await basis(tx,f.planId);assert.ok(b.result.blockers.includes(minimum));await aplDeny(tx,r.checks,'fresh submission after concurrent reduction rejects the persisted budget',t=>command(t,request(b.result,'submit')),['40001']);});
  ok(r,'observed concurrent budget reduction commits; stale submission cannot commit');r.finalFingerprint=await schemaFingerprint(db);r.finalStructure=await schemaFingerprint(db,true);assert.equal(r.finalFingerprint,r.installed.fingerprint);
 }catch(e){r.failure={code:e.code??'ASSERTION',hint:e.hint,message:e.message,where:e.where,stack:e.stack};}
 finally{try{r.finalSources=sources();assert.deepEqual(r.finalSources,r.sources);}catch(e){r.sourceFailure={message:e.message};}try{if(snap)r.cleanup=await snap.cleanup();}catch(e){r.cleanupFailure={message:e.message};}if(!r.failure&&!r.sourceFailure&&!r.cleanupFailure&&r.migrationRollbackRestored&&r.originalRowsPreserved&&r.matrixRollbackRestored&&r.concurrencyComplete)r.status='PASS';r.completedAt=new Date().toISOString();persist();closeSync(fd);}
 console.log(r.status+': '+r.checks.length+' minimum APL SQL checks');if(r.status!=='PASS')process.exitCode=1;return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyTimplanAplMinimum(privateOutput(process.argv.slice(2))).catch(()=>{console.error('FAIL: minimum APL preflight');process.exitCode=1;});
