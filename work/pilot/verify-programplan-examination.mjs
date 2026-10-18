#!/usr/bin/env node
// Disposable schema-only database; synthetic school review is not a verified national exam catalogue.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,openSync,closeSync,writeSync,ftruncateSync,fsyncSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNamedTimplanSnapshot,schemaFingerprint} from './named-timplan-snapshot.mjs';
import {allPublicHashes,privateOutput} from './verify-atomic-cohort-copy.mjs';
import {seedSeparateAplFixture} from './verify-separate-apl-workflow.mjs';
import {aplActor,aplDeny,aplRace,aplSources} from './verify-apl-plan-commands.mjs';
import {validProgramplanExamination,EXAMINATION_REVIEW_REQUIRED} from '../../web/lib/programplan-examination.ts';
const {projectPlanDecision}=await import('../../web/lib/server/plan-decision.ts');
const {projectAplFrozenRead}=await import('../../web/lib/server/apl-plan.ts');
const root=fileURLToPath(new URL('../../',import.meta.url));
export const examinationMigration='supabase/migrations/20261018180000_programplan_examination_review.sql';
const sources=()=>aplSources([examinationMigration,'work/pilot/verify-programplan-examination.mjs','web/lib/server/plan-decision.ts','web/lib/server/programplan-examination.ts','web/app/api/programplaner/examensform/route.ts']);
const check=(r,name)=>{r.checks.push({name,ok:true});console.log('PASS: '+name);};
const rollback=Error('synthetic examination rollback');
const example={model:'vocational_exam',appliesToStart:'2028-08-15',checkedOn:'2026-10-18',referenceUrl:'https://www.skolverket.se/syntetiskt-verifieringsunderlag',referenceText:'Syntetiskt prov, inget påstående om ett faktiskt nationellt prov.'};
const write=async(t,id,revision,examination=example)=>(await t`select public.phase5_set_programplan_examination(${id},${revision},${t.json(examination)}) value`)[0].value;
const plan=async(t,id)=>(await t`select public.phase5_programplan_result(${id}) value`)[0].value;
const raw=async(t,id)=>(await t`select public.phase5_gym_timplan_result(${id}) value`)[0].value;
const basis=async(t,kind,id)=>(await t`select public.phase5_plan_decision_basis(${kind},${id}) value`)[0].value;
const authority=(f,role)=>({identityId:f.id(role==='hm'?10:11),assignmentId:f.roles[role],organizerId:f.id(2),accessFunction:role==='hm'?'huvudman':'rektor'});
const req=(b,action)=>({kind:b.kind,planId:b.planId,commandId:randomUUID(),action,expectedRevision:b.revision,expectedDecisionRevision:b.decisionRevision,basisHash:b.basisHash,comment:'Syntetisk examensformskontroll',confirmedChecks:b.checks.map(c=>c.id)});
async function decide(t,f,role,kind,id,action){await aplActor(t,f,role);const b=await basis(t,kind,id),q=req(b.result,action);const result=(await t`select public.phase5_plan_decision_command(${t.json(q)}) value`)[0].value;await projectPlanDecision(result,{kind,planId:id},authority(f,role),q);return{q,result};}
async function copy(t,f,sourceId,start){await aplActor(t,f,'principal');const s=(await t`select public.phase5_gym_timplan_source(${sourceId}) value`)[0].value,reference={...s.basisReference,startedOn:start};delete reference.examination;
 return(await t`select public.phase5_copy_programplan_education(${randomUUID()},${sourceId},${s.revision},${s.educationRevision},${f.id(30)},${'Syntetiskt examensform '+start},null,${start},${t.json(reference)},false) value`)[0].value;}
async function sandbox(t,fn){try{await t.savepoint(async u=>{await fn(u);await u`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}}
function structureCheck(before,after){
 for(const k of Object.keys(before))if(k!=='functions')assert.deepEqual(after[k],before[k],k);
 const changes=[];for(const old of before.functions){const next=after.functions.find(f=>f.signature===old.signature);assert.ok(next);const{definition:a,...am}=old,{definition:b,...bm}=next;assert.deepEqual(am,bm);if(a!==b)changes.push(old.signature.replace(/^public\./u,''));}
 assert.equal(changes.length,11);const additions=after.functions.filter(f=>!before.functions.some(o=>o.signature===f.signature));assert.equal(additions.length,2);return{changes,additions:additions.map(f=>f.signature)};
}
async function matrix(t,r,f,n){
 for(const [label,value,code,start]of [
 ['valid',example,'BF25',example.appliesToStart],['fallback',{...example,model:'diploma_work'},'BF25',example.appliesToStart],['missing',null,'BF25',example.appliesToStart],['old cohort',example,'BF25','2027-08-15'],['SA',example,'SA25',example.appliesToStart],['wrong start',{...example,appliesToStart:'2029-08-15'},'BF25',example.appliesToStart],['future check',{...example,checkedOn:'2099-01-01'},'BF25',example.appliesToStart],['extra key',{...example,unknown:1},'BF25',example.appliesToStart],['lookalike host',{...example,referenceUrl:'https://skolverket.se.example/prov'},'BF25',example.appliesToStart],['credentials',{...example,referenceUrl:'https://x@skolverket.se/prov'},'BF25',example.appliesToStart],['control URL',{...example,referenceUrl:'https://skolverket.se/a\u000bb'},'BF25',example.appliesToStart],['long astral',{...example,referenceText:'😀'.repeat(1001)},'BF25',example.appliesToStart],['trim whitespace',{...example,referenceText:'\u00a0text'},'BF25',example.appliesToStart],['real leap date',{...example,checkedOn:'2024-02-29'},'BF25',example.appliesToStart],['invalid date',{...example,checkedOn:'2025-02-29'},'BF25',example.appliesToStart]]){
  const valid=(await t`select public.phase5_programplan_examination_valid(${t.json(value)},${code},${start}) value`)[0].value;assert.equal(valid,validProgramplanExamination(value,code,start),label);
 }check(r,'SQL/TypeScript validation parity: scope, source, real dates and UTF16 limits');
 await aplActor(t,f,'principal');
 await aplDeny(t,r.checks,'generic education creation cannot inject review without dedicated command',u=>u`select public.phase5_create_programplan_education(${randomUUID()},${f.id(30)},'Syntetiskt otillåtet införande',null,'2028',${u.json({...n.plan.basisReference,examination:example})})`,['22023']);
 let b=await basis(t,'programplan',n.plan.id);assert.ok(b.result.blockers.includes(EXAMINATION_REVIEW_REQUIRED));assert.ok((await projectPlanDecision(b,{kind:'programplan',planId:n.plan.id},authority(f,'principal'))).blockers.includes(EXAMINATION_REVIEW_REQUIRED));
 await aplDeny(t,r.checks,'missing review blocks submit',u=>u`select public.phase5_plan_decision_command(${u.json(req(b.result,'submit'))})`,['40001']);
 for(const who of ['principal2','admin'])await sandbox(t,async u=>{await aplActor(u,f,who);await aplDeny(u,r.checks,who+' cannot edit examination',v=>write(v,n.plan.id,n.plan.revision),['42501']);});
 const before=(await t`select to_jsonb(p) value from public.point_plans p where id=${n.plan.id}`)[0].value;
 let p=await write(t,n.plan.id,n.plan.revision);const after=(await t`select to_jsonb(p) value from public.point_plans p where id=${n.plan.id}`)[0].value;
 for(const x of [before,after]){delete x.revision;delete x.updated_at;delete x.basis_reference.examination;}assert.deepEqual(after,before);assert.deepEqual(p.basisReference.examination,example);check(r,'review write changes only evidence, revision and update time; 100-point rows and term budget preserved');
 await sandbox(t,async u=>{const q=(await u`select public.phase5_replace_programplan_specialization(${p.id},${p.revision},${u.json(p.basisReference.specializationRefs)}) value`)[0].value;assert.deepEqual(q.basisReference.examination,example);check(r,'unchanged occupational selection preserves the existing examination review');});
 await sandbox(t,async u=>{const blocks=structuredClone(p.basisReference.choiceBlocks);blocks[0].name+=' ändrad';const q=(await u`select public.phase5_replace_programplan_blocks(${p.id},${p.revision},${u.json(blocks)}) value`)[0].value;assert.ok(!Object.hasOwn(q.basisReference,'examination'));check(r,'changed occupational frame clears examination and requires fresh review');});
 await aplDeny(t,r.checks,'stale CAS changes no state',u=>write(u,n.plan.id,n.plan.revision),['40001']);
 await sandbox(t,async u=>{const q=await write(u,n.plan.id,p.revision,{...example,model:'diploma_work'});assert.equal(q.basisReference.examination.model,'diploma_work');check(r,'documented unavailable-provision choice can save diploma work');});
 await sandbox(t,async u=>{await u`set local role skolplattform_worker`;const q=await write(u,n.plan.id,p.revision);assert.equal(q.revision,p.revision+1);check(r,'Worker can invoke only the granted write entrypoint');});
 await sandbox(t,async u=>{await u`create function public.examination_test_audit_fail() returns trigger language plpgsql as 'begin raise exception ''synthetic audit failure''; end'`;await u`create trigger examination_test_audit_fail before insert on public.security_events for each row execute function public.examination_test_audit_fail()`;await aplDeny(u,r.checks,'database audit failure rolls back evidence and history',v=>write(v,n.plan.id,p.revision),['55000']);});
 b=await basis(t,'programplan',n.plan.id);assert.deepEqual(b.result.examination,example);assert.deepEqual((await projectPlanDecision(b,{kind:'programplan',planId:n.plan.id},authority(f,'principal'))).examination,example);check(r,'HM decision detail binds the exact frozen dated source review');
 await decide(t,f,'principal','programplan',n.plan.id,'submit');await aplDeny(t,r.checks,'submitted review is locked',u=>write(u,n.plan.id,p.revision),['42501']);
 await decide(t,f,'hm','programplan',n.plan.id,'approve');await aplDeny(t,r.checks,'approved review requires new version',u=>write(u,n.plan.id,p.revision+1),['40001']);
 p=await plan(t,n.plan.id);await aplActor(t,f,'principal');const g=(await t`select public.phase5_create_gym_timplan(${randomUUID()},${p.id},${p.revision},0,${f.id(30)},null,null) value`)[0].value.reply;
 let gym=await raw(t,g.id);assert.equal(gym.timeModel,'school_terms_annual_apl_v2');
 for(const d of gym.source.distribution){const row={schoolMinutes:d.points.map(v=>v>0?v*60:null),annualAplMinutes:[0,1,2].map(i=>d.points[i*2]+d.points[i*2+1]>0?(d.rowKey===f.key&&i===0?20700:0):null)};gym=(await t`select public.phase5_timplan_time_command(${t.json({contractVersion:'timplan_time_v2',action:'save_row',commandId:randomUUID(),planId:gym.id,expectedRevision:gym.revision,rowKey:d.rowKey,row})}) value`)[0].value.plan;}
 await decide(t,f,'principal','timplan',gym.id,'submit');await decide(t,f,'hm','timplan',gym.id,'approve');check(r,'2028 table with evidence, GUT and annual APL approves before any periods');
 await aplActor(t,f,'principal');const ar=(await t`select public.phase5_apl_plan_read(${gym.id}) value`)[0].value;await projectAplFrozenRead(ar.result,ar.basis,gym.id,authority(f,'principal'));check(r,'2028 APL source-supported flag and optional examination hash agree with TypeScript');
 const next=await copy(t,f,p.id,'2029-08-15');assert.ok(!Object.hasOwn(next.plan.basisReference,'examination'));assert.ok((await basis(t,'programplan',next.plan.id)).result.blockers.includes(EXAMINATION_REVIEW_REQUIRED));check(r,'copy to next cohort clears review and requires new examination investigation');
 const clone=(await t`select public.phase5_clone_programplan_draft(${p.id},${p.revision},${p.version},null) value`)[0].value;assert.deepEqual(clone.basisReference.examination,example);check(r,'new version for same cohort retains frozen review and all 100-point allocation');
 await write(t,clone.id,clone.revision,{...example,model:'diploma_work'});await decide(t,f,'principal','programplan',clone.id,'submit');await decide(t,f,'hm','programplan',clone.id,'approve');
 const current=await plan(t,clone.id);await aplActor(t,f,'principal');const replacement=(await t`select public.phase5_create_gym_timplan(${randomUUID()},${current.id},${current.revision},0,${f.id(30)},${gym.id},${(await raw(t,gym.id)).revision}) value`)[0].value.reply;const copied=await raw(t,replacement.id);
 assert.ok(copied.timeCopyReview.some(x=>x.rowKey==='meta:diplomaWork'&&x.reason==='changed_source'));assert.deepEqual(copied.timeRows['meta:diplomaWork'],{schoolMinutes:[null,null,null,null,null,null],annualAplMinutes:[null,null,null]});assert.deepEqual(copied.timeRows[f.key],gym.timeRows[f.key]);check(r,'changed examination model resets only final-work time row with explicit copy review');
}
export async function verifyProgramplanExamination(out){
 const fd=openSync(out,'wx',0o600),r={kind:'programplan-examination-private-schema-only',status:'FAIL',checks:[],races:[],startedAt:new Date().toISOString(),limitations:['Own schema-only PostgreSQL and synthetic evidence; no live data writes','School evidence review does not establish an actual approved national exam','No HTTP/OIDC/browser claim']};let snap;
 const persist=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(r,null,2)+'\n',0,'utf8');fsyncSync(fd);};
 try{r.sources=sources();snap=await createNamedTimplanSnapshot();r.snapshot=snap.provenance;persist();const db=snap.db;
  const f=await db.begin(t=>seedSeparateAplFixture(t));
  r.baseline={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};
  try{await db.begin(async t=>{await t.unsafe(readFileSync(resolve(root,examinationMigration),'utf8'));await t`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}
  assert.equal(await schemaFingerprint(db),r.baseline.fingerprint);assert.deepEqual(await allPublicHashes(db),r.baseline.rows);r.migrationRollbackRestored=true;check(r,'migration rollback restores exact schema, grants and all rows');
  await db.begin(t=>t.unsafe(readFileSync(resolve(root,examinationMigration),'utf8')));r.installed={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};r.structureChanges=structureCheck(r.baseline.structure,r.installed.structure);assert.deepEqual(r.installed.rows,r.baseline.rows);r.originalRowsPreserved=true;check(r,'only expected functions/grant added; every original row and existing ACL preserved');
  await db.begin(async t=>{await aplActor(t,f,'hm');const old=f.programReceipt;const again=(await t`select public.phase5_plan_decision_command(${t.json(old.q)}) value`)[0].value;assert.equal(again.replayed,true);assert.deepEqual(again.result,old.envelope.result);const parsed=await projectPlanDecision(again,{kind:'programplan',planId:f.programId},authority(f,'hm'),old.q);assert.ok(!Object.hasOwn(parsed,'examination'));check(r,'historical approved receipt replays original shape without examination backfill');});
  const n=await db.begin(async t=>{const made=await copy(t,f,f.programId,example.appliesToStart);made.plan=await plan(t,made.plan.id);return made;});
  const before=await allPublicHashes(db);try{await db.begin(async t=>{await matrix(t,r,f,n);await t`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}
  assert.deepEqual(await allPublicHashes(db),before);r.matrixRollbackRestored=true;check(r,'full synthetic matrix restores rows and deferred constraints');
  const race=await aplRace(snap,r,f,'competing examination writes','principal',t=>write(t,n.plan.id,n.plan.revision),'principal',t=>write(t,n.plan.id,n.plan.revision,{...example,model:'diploma_work'}));assert.equal(race.left.revision,n.plan.revision+1);assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'40001');r.concurrencyComplete=true;check(r,'actual concurrent review CAS permits one write and rejects the stale second');
  r.finalStructure=await schemaFingerprint(db,true);r.finalFingerprint=await schemaFingerprint(db);assert.equal(r.finalFingerprint,r.installed.fingerprint);
 }catch(e){r.failure={code:e.code??'ASSERTION',hint:e.hint,message:e.message,where:e.where,stack:e.stack};}
 finally{try{r.finalSources=sources();assert.deepEqual(r.finalSources,r.sources);}catch(e){r.sourceFailure={message:e.message};}try{if(snap)r.cleanup=await snap.cleanup();}catch(e){r.cleanupFailure={message:e.message};}if(!r.failure&&!r.sourceFailure&&!r.cleanupFailure&&r.matrixRollbackRestored&&r.concurrencyComplete)r.status='PASS';r.completedAt=new Date().toISOString();persist();closeSync(fd);}
 console.log(r.status+': '+r.checks.length+' examination SQL checks');if(r.status!=='PASS')process.exitCode=1;return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyProgramplanExamination(privateOutput(process.argv.slice(2))).catch(()=>{console.error('FAIL: examination preflight');process.exitCode=1;});
