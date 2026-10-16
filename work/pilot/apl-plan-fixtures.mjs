// Synthetic fixtures for APL-07. No source-database rows are copied.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { aplSourceProfileSupported } from '../../web/lib/apl-plan.ts';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { approvedClassFixture } from './verify-class-timplans.mjs';
import { aplActor, aplDraftFromApproved, aplRead, aplCommand, aplSave, aplPreparedDraft } from './verify-apl-plan-commands.mjs';
import { aplDecisionRequest, aplDecisionCommand } from './verify-apl-plan-decisions.mjs';
export const clone=structuredClone;
export const copyPlan=(tx,q)=>tx`select public.phase5_named_timplan_create(${tx.json(q)}) result`.then(r=>r[0].result);
export const nextPlan=(tx,q)=>tx`select public.phase5_create_gym_timplan(${q.commandId},${q.sourcePlanId},${q.expectedSourceRevision},${q.expectedEducationRevision},${q.unitId},${q.predecessorPlanId},${q.expectedPredecessorRevision}) result`.then(r=>r[0].result);
export async function copyRequest(db,f,id,name,sourcePlanId=f.programId){return{commandId:randomUUID(),sourcePlanId,
 expectedSourceRevision:(await db`select revision from public.point_plans where id=${sourcePlanId}`)[0].revision,
 expectedEducationRevision:0,unitId:f.id(30),name,copyFromPlanId:id,
 expectedCopyFromRevision:id===null?null:(await db`select revision from public.timplans where id=${id}`)[0].revision};}
export async function nextRequest(db,f,id){const q=await copyRequest(db,f,id,'unused');return{commandId:q.commandId,sourcePlanId:q.sourcePlanId,
 expectedSourceRevision:q.expectedSourceRevision,expectedEducationRevision:0,unitId:q.unitId,predecessorPlanId:id,expectedPredecessorRevision:q.expectedCopyFromRevision};}
export async function confirmRequest(tx,id){const {detail}=await aplRead(tx,id);return{contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:id,
 expectedRevision:detail.revision,expectedContentHash:detail.contentHash,comment:'Syntetisk APL-07-granskning.'};}
export async function completePlan(tx,f,draft){await aplActor(tx,f,'principal');const r=await aplRead(tx,draft.planId),value=clone(r.detail.plan??draft.value);
 value.classification='complete';for(const p of value.periods){p.extent.reviewed=true;p.extent.reviewNote='Syntetisk granskning i exakt denna version.';}
 await aplCommand(tx,aplSave(draft,r.detail.revision,value));return aplCommand(tx,await confirmRequest(tx,draft.planId));}
export async function decide(tx,f,id,action,kind='timplan'){await aplActor(tx,f,['approve','return'].includes(action)?'hm':'principal');return aplDecisionCommand(tx,await aplDecisionRequest(tx,id,action,kind));}
export async function seedAplFull(snapshot){const connections=[await snapshot.connect(),await snapshot.connect()];let bf,other;
 await connections[0].begin(async tx=>{
  bf=await approvedClassFixture(tx,'BF25');bf.legacy={approved:bf.planId};
  for(const stage of ['draft','submitted','returned','replaced']){await aplActor(tx,bf,'principal');const id=(await aplDraftFromApproved(tx,bf,'Syntetisk APL07 äldre '+stage)).reply.id;bf.legacy[stage]=id;
   if(['submitted','returned'].includes(stage)){await bf.decision('timplan',id,'submit');if(stage==='returned'){await aplActor(tx,bf,'hm');await tx`select public.phase5_plan_decision_command(${tx.json(await aplDecisionRequest(tx,id,'return'))})`;}}
   if(stage==='replaced'){await aplActor(tx,bf,'principal');await nextPlan(tx,await nextRequest(tx,bf,id));}
  }
  await aplActor(tx,bf,'principal');bf.parallel=(await aplDraftFromApproved(tx,bf,'Syntetisk APL07 parallell')).reply.id;
  await bf.decision('timplan',bf.parallel,'submit');await aplActor(tx,bf,'hm');await bf.decision('timplan',bf.parallel,'approve');await aplActor(tx,bf,'principal');
  bf.classes=[];
  for(const [index,planId] of [[0,bf.planId],[1,bf.parallel]]){
   const revision=(await tx`select revision from public.timplans where id=${planId}`)[0].revision;
   const c=(await tx`select public.phase5_class_command(${tx.json({operation:'create',commandId:randomUUID(),planId,expectedPlanRevision:revision,name:'SYN-APL07-'+index,startYear:bf.year})}) result`)[0].result;
   bf.classes.push(c.id);
   for(const offset of [0,1])await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:c.id,schoolYear:bf.year+offset,planId,
    expectedPlanRevision:revision,columnId:'ar'+(offset+1),expectedLinkRevision:null,previousPlanId:null})})`;
  }
  await tx`insert into public.synthetic_pupil_numbers(personal_number) values('TEST-20100101-0014') on conflict do nothing`;
  const [{starts_on:startsOn}]=await tx`select starts_on from public.school_classes where id=${bf.classes[0]}`;assert.ok(startsOn);
  await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name) values(${bf.id(190)},${bf.id(1)},${bf.id(2)},'Syntetisk APL07','TEST-20100101-0014','Syntetisk')`;
  await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values(${bf.id(191)},${bf.id(1)},${bf.id(2)},${bf.id(190)},${bf.id(30)},${bf.id(46)},${startsOn})`;
  await tx`insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on) values(${bf.id(192)},${bf.id(1)},${bf.id(2)},${bf.id(190)},${bf.id(30)},${bf.classes[0]},${bf.id(191)},${startsOn})`;
  await tx`insert into public.identities(id,issuer,subject) values(${bf.id(14)},'https://programplan.example.test','synthetic-apl07-teacher')`;
  await tx`insert into public.memberships(id,identity_id,customer_id) values(${bf.id(24)},${bf.id(14)},${bf.id(1)})`;
  await aplActor(tx,bf,'principal');bf.roles.teacher=(await tx`select public.phase3_grant_mandate(${tx.json({membershipId:bf.id(24),function:'larare',scopeKind:'group',unitIds:[bf.id(30)],groups:[{id:bf.classes[0],kind:'teaching'}]})}) id`)[0].id;
  await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
   values(${bf.id(84)},decode(md5(${bf.id(84)})||md5(${bf.id(84)}),'hex'),${bf.id(14)},${bf.id(24)},${bf.roles.teacher},clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours')`;
  bf.legacyReceipts=await tx`select command_id,request,result,assignment_id,request::text request_text,result::text result_text from public.plan_decision_receipts where organizer_id=${bf.id(2)} order by command_id`;
 });
 await connections[1].begin(async tx=>{other=await approvedClassFixture(tx,'SA25');});return{bf,other};}
export async function freshDraft(db,f,name){return db.begin(async tx=>{await aplActor(tx,f,'principal');return aplPreparedDraft(tx,f,name);});}
export async function planGraph(db,id){return{plan:await db`select to_jsonb(t) r from public.timplans t where id=${id}`,
 cells:await db`select to_jsonb(t) r from public.timplan_cells t where timplan_id=${id} order by row_id`,
 periods:await db`select to_jsonb(t) r from public.apl_plan_periods t where plan_id=${id} order by id`,
 allocations:await db`select to_jsonb(t) r from public.apl_time_allocations t where plan_id=${id} order by period_id,row_key,term_index`,
 commands:await db`select to_jsonb(t) r from public.apl_plan_commands t where plan_id=${id} order by command_id`,
 confirmations:await db`select to_jsonb(t) r from public.apl_rector_confirmations t where plan_id=${id} order by id`};}
// Defensive fixture construction runs only as owner in the owned database.
// Every production trigger remains enabled; no generic bypass is introduced.
async function emptyCopyTarget(tx,f,sourceId,{hours=null,startedOn=null}={}){
 const source=(await tx`select * from public.timplans where id=${sourceId}`)[0],basis=clone(source.gym_basis);
 if(startedOn)basis.basisReference.startedOn=startedOn;
 const name='Syntetiskt helpermål '+randomUUID().slice(0,8);
 const [{id:seriesId}]=await tx`insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(${source.organizer_id},${source.offering_id},${source.unit_id},${name},${name.toLowerCase()}) returning id`;
 const [{id}]=await tx`insert into public.timplans(organizer_id,offering_id,unit_id,series_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id)
  values(${source.organizer_id},${source.offering_id},${source.unit_id},${seriesId},1,'utkast',${tx.json(source.basis)},${source.catalog_fetched},${tx.json(basis)},${source.source_programplan_id}) returning id`;
 await tx`insert into public.timplan_cells(timplan_id,row_id,hours,allocated) select ${id},row_id,hours,allocated from public.timplan_cells where timplan_id=${sourceId}`;
 if(hours)await tx`update public.timplan_cells set hours=${hours.value.map(v=>v??0)} where timplan_id=${id} and row_id=${hours.rowKey}`;
 assert.equal((await tx`select count(*)::int n from public.timplan_events where timplan_id=${id}`)[0].n,0);
 assert.equal((await tx`select count(*)::int n from public.named_timplan_commands where plan_id=${id}`)[0].n,0);return id;
}
export async function defensiveCopyMatrix(tx,f,record){
 await aplActor(tx,f,'principal');const d=await aplPreparedDraft(tx,f,'Syntetisk APL07 helperkälla'),base=clone(d.value.periods[0]);
 Object.assign(base,{startsOn:null,endsOn:null,schoolYear:null,extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[base.contents[0]],allocations:[{rowKey:d.rowKey,termIndex:0,gutMinutes:60}]});
 const value={contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[base,{...clone(base),id:randomUUID(),name:'Syntetisk andra period'}]};
 await aplCommand(tx,aplSave(d,d.plan.revision,value));const original=await planGraph(tx,d.planId);
 const h=clone(d.hours);h[0]=1;
 const target=await emptyCopyTarget(tx,f,d.planId,{hours:{rowKey:d.rowKey,value:h}});
 await tx`select public.phase5_apl_copy_structure(${d.planId},${target})`;
 const r=await aplRead(tx,target);assert.equal(r.detail.copyReview.length,2);assert.ok(r.detail.copyReview.every(x=>x.reason==='insufficient_total'));
 assert.equal(r.detail.plan.periods.flatMap(p=>p.allocations).length,0);assert.equal(r.detail.copyReview.flatMap(x=>x.allocations).reduce((n,a)=>n+a.gutMinutes,0),120);
 assert.deepEqual(await planGraph(tx,d.planId),original);
 record('COPY-01','private helper rejects whole shared cell when two individually fitting 60-minute periods total 120 > 60; all 120 minutes retained as review','private_helper');
 const supportedTarget=await emptyCopyTarget(tx,f,d.planId);await tx`select public.phase5_apl_copy_structure(${d.planId},${supportedTarget})`;
 const carried=await aplRead(tx,supportedTarget);assert.deepEqual(carried.detail.copyReview,[]);assert.equal(carried.detail.plan.periods.flatMap(p=>p.allocations).reduce((n,a)=>n+a.gutMinutes,0),120);
 record('COPY-02','private helper carries all periods in a cell whose aggregate fits; no period-order subset','private_helper');
 const unsupported=await emptyCopyTarget(tx,f,d.planId,{startedOn:'2028-08-15'});
 const [{p}]=await tx`select public.phase5_apl_program(public.phase5_gym_timplan_result(${unsupported})) p`;assert.equal(p.sourceSupported,false);
 await tx`select public.phase5_apl_copy_structure(${d.planId},${unsupported})`;
 const rawUnsupported=(await tx`select public.phase5_apl_plan_read(${unsupported}) result`)[0].result;
 const {projectSource}=await import('../../web/lib/server/gym-timplan.ts');const projectedSource=await projectSource({...rawUnsupported.basis.gymTimplan.source,status:'utkast',archived:false},rawUnsupported.basis.gymTimplan.catalog);
 const derivedSupport=projectedSource.readiness.ready&&aplSourceProfileSupported(rawUnsupported.result.program,rawUnsupported.basis.gymTimplan.source.basisReference.startedOn);
 assert.equal(derivedSupport,rawUnsupported.result.program.sourceSupported,'unsupported-source SQL/TS parity');assert.equal(derivedSupport,false);
 const blocked=await aplRead(tx,unsupported);assert.equal(blocked.detail.copyReview.length,2);assert.ok(blocked.detail.copyReview.every(x=>x.reason==='unverified_source'));
 assert.ok(blocked.detail.plan.periods.every(p=>p.contents.length===0&&p.allocations.length===0));assert.equal(blocked.detail.copyReview.flatMap(x=>x.allocations).reduce((n,a)=>n+a.gutMinutes,0),120);
 assert.deepEqual(await planGraph(tx,d.planId),original);record('COPY-03','real frozen vocational autumn-2028 source blocker moves all content and minutes into unverified_source reviews','private_helper');
 // Seed provenance-valid immutable unresolved reviews with guarded owner permits.
 // This boundary fixture is not a claim that 1000 reviews were created by a UI.
 await tx`insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),${d.planId})`;
 await tx`insert into public.apl_plan_copy_reviews(id,plan_id,source_plan_id,source_version,source_period_id,source_period_name,reason,contents,allocations)
  select gen_random_uuid(),${d.planId},${d.planId},1,${base.id},${base.name},'insufficient_total',${tx.json(base.contents)},${tx.json(base.allocations)} from generate_series(1,1000)`;
 await tx`delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=${d.planId}`;
 const accepted=await copyPlan(tx,await copyRequest(tx,f,d.planId,'Syntetisk exakt 1000 granskningar'));
 assert.equal((await aplRead(tx,accepted.reply.id)).detail.copyReview.length,1000);
 record('COPY-04','public named copy accepts exactly 1000 guarded unresolved provenance-valid reviews','private_helper');
 const beforeAddedLoss=await allPublicHashes(tx);let addedLossError;
 try{await tx.savepoint(async s=>{const overflowTarget=await emptyCopyTarget(s,f,d.planId,{startedOn:'2028-08-15'});
  await s`select public.phase5_apl_copy_structure(${d.planId},${overflowTarget})`;});}catch(e){addedLossError=e;}
 assert.equal(addedLossError?.code,'40001');assert.equal(addedLossError?.hint,'apl_copy_review_limit');assert.deepEqual(await allPublicHashes(tx),beforeAddedLoss);
 record('COPY-06','1000 inherited reviews plus newly lost content rejects the whole copy with no partial target or reviews','private_helper');
 const beforeCount=(await tx`select count(*)::int n from public.timplans`)[0].n;
 const beforeSeries=(await tx`select count(*)::int n from public.timplan_series`)[0].n;
 await tx`insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),${d.planId})`;
 await tx`insert into public.apl_plan_copy_reviews(id,plan_id,source_plan_id,source_version,source_period_id,source_period_name,reason,contents,allocations)
  values(gen_random_uuid(),${d.planId},${d.planId},1,${base.id},${base.name},'insufficient_total',${tx.json(base.contents)},${tx.json(base.allocations)})`;
 await tx`delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=${d.planId}`;
 const command=await copyRequest(tx,f,d.planId,'Syntetisk över gränsen'),beforeAttempt=await allPublicHashes(tx);let error;
 try{await tx.savepoint(s=>copyPlan(s,command));}catch(e){error=e;}
 assert.equal(error?.code,'40001');assert.equal(error?.hint,'apl_copy_review_limit');assert.deepEqual(await allPublicHashes(tx),beforeAttempt);assert.equal((await tx`select count(*)::int n from public.timplans`)[0].n,beforeCount);assert.equal((await tx`select count(*)::int n from public.timplan_series`)[0].n,beforeSeries);
 assert.equal((await tx`select count(*)::int n from public.named_timplan_commands where command_id=${command.commandId}`)[0].n,0);
 record('COPY-05','public named copy rejects 1001 reviews with explicit limit and no target series/plan/receipt','private_helper');
}
