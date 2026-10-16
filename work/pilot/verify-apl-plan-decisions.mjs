#!/usr/bin/env node
// Actual APL decisions and copies on an owned, schema-only PostgreSQL snapshot.
// The protected source is read only; all rows here are repository/synthetic data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, openSync, closeSync, ftruncateSync, writeSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { approvedClassFixture } from './verify-class-timplans.mjs';
import { aplSources, aplActor, aplRace, aplDeny as aplDenyBase, aplDraftFromApproved, installAplCommands,
 aplVerifiedEnvelope, aplRead, aplCommand, aplPreparedDraft, aplSave } from './verify-apl-plan-commands.mjs';
import { projectAplPlan } from '../../web/lib/apl-plan.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const aplDecisionMigration='supabase/migrations/20261016121000_apl_plan_decisions.sql';
const sources=()=>aplSources([aplDecisionMigration,'work/pilot/verify-apl-plan-decisions.mjs']);
const rollback=Error('expected_apl_decisions_rollback');
const clone=structuredClone;
async function aplDeny(tx,checks,name,fn,codes) {
 let caught;
 try {return await aplDenyBase(tx,checks,name,async s=>{try{return await fn(s);}catch(e){caught=e;throw e;}},codes);}
 catch(error){if(caught)error.message+='; SQL: '+caught.message+'; hint: '+(caught.hint??'')+'; where: '+(caught.where??'');throw error;}
}
const ok=(report,name)=>{report.checks.push({name,ok:true});console.log('PASS: '+name);};
const rawBasis=async(tx,id,kind='timplan')=>(await tx`select public.phase5_plan_decision_basis(${kind},${id}) result`)[0].result;
const rawCommand=async(tx,q)=>(await tx`select public.phase5_plan_decision_command(${tx.json(q)}) result`)[0].result;
const unwrap=raw=>raw.contractVersion==='apl_decision_sql_v1'?raw.result:raw.detail??raw;
export async function aplDecisionRequest(tx,id,action,kind='timplan') {
 const d=unwrap(await rawBasis(tx,id,kind));
 return {kind,planId:id,commandId:randomUUID(),action,expectedRevision:d.revision,
  expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,
  comment:action==='return'?'Syntetisk begäran om komplettering.':'',confirmedChecks:d.checks.map(c=>c.id)};
}
export async function verifyAplDecisionEnvelope(raw,{legacyResult,replayed=false}={}) {
 assert.deepEqual(Object.keys(raw).sort(),['aplBasis','contractVersion','replayed','result','resultContract']);
 assert.equal(raw.contractVersion,'apl_decision_sql_v1');assert.equal(raw.replayed,replayed);
 if(legacyResult!==undefined){assert.equal(raw.resultContract,'legacy');assert.equal(raw.aplBasis,null);assert.deepEqual(raw.result,legacyResult);return raw;}
 assert.equal(raw.resultContract,'apl_decision_v1');assert.equal(raw.result.contractVersion,'apl_decision_v1');
 const d=raw.result;
 if(d.apl===null){assert.equal(raw.aplBasis,null);return raw;}
 assert.equal(d.kind,'timplan');
 assert.deepEqual(Object.keys(d.apl).sort(),['blockers','currentConfirmationId','detail','ready']);
 assert.ok(Array.isArray(d.apl.blockers)&&d.apl.blockers.every(b=>typeof b==='string'));
 const verified=await aplVerifiedEnvelope({contractVersion:'apl_sql_v1',basis:raw.aplBasis,result:d.apl.detail},'read',{planId:d.planId});
 assert.deepEqual(d.source,raw.aplBasis.gymTimplan.source);
 assert.deepEqual(d.catalog,raw.aplBasis.gymTimplan.catalog);
 assert.deepEqual(Object.fromEntries(d.hours.map(r=>[r.rowKey,r.hours])),raw.aplBasis.gymTimplan.hours);
 const projection=projectAplPlan(verified.context,verified.detail.plan);
 const latest=verified.detail.confirmations.at(-1)??null;
 const current=latest?.contentHash===verified.detail.contentHash?latest:null;
 assert.equal(d.apl.currentConfirmationId,current?.id??null);
 assert.equal(d.apl.ready,projection.readyForConfirmation&&current!==null);
 assert.equal(d.apl.ready,d.apl.blockers.length===0);
 return raw;
}
export const aplDecisionBasis=async(tx,id,kind='timplan')=>verifyAplDecisionEnvelope(await rawBasis(tx,id,kind));
export const aplDecisionCommand=async(tx,q,options)=>verifyAplDecisionEnvelope(await rawCommand(tx,q),options);
async function decide(tx,f,id,action,kind='timplan') {
 await aplActor(tx,f,action==='approve'||action==='return'?'hm':'principal');
 const q=await aplDecisionRequest(tx,id,action,kind);return {q,result:await aplDecisionCommand(tx,q)};
}
async function confirm(tx,f,id) {
 await aplActor(tx,f,'principal');const {detail}=await aplRead(tx,id);
 const q={contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:id,
  expectedRevision:detail.revision,expectedContentHash:detail.contentHash,comment:'Syntetiskt rektorsbeslut om förläggning.'};
 return aplCommand(tx,q);
}
async function complete(tx,f,draft) {
 await aplActor(tx,f,'principal');const before=await aplRead(tx,draft.planId);
 const value=clone(before.detail.plan??draft.value);value.classification='complete';
 for(const p of value.periods){p.extent.reviewed=true;p.extent.reviewNote='Ny syntetisk granskning av denna planversion.';}
 await aplCommand(tx,aplSave(draft,before.detail.revision,value));return confirm(tx,f,draft.planId);
}
async function copyRequest(tx,f,id,name,sourceId=f.programId) {
 return {commandId:randomUUID(),sourcePlanId:sourceId,
  expectedSourceRevision:(await tx`select revision from public.point_plans where id=${sourceId}`)[0].revision,
  expectedEducationRevision:0,unitId:f.id(30),name,copyFromPlanId:id,
  expectedCopyFromRevision:id===null?null:(await tx`select revision from public.timplans where id=${id}`)[0].revision};
}
const copy=(tx,q)=>tx`select public.phase5_named_timplan_create(${tx.json(q)}) result`.then(r=>r[0].result);
async function nextRequest(tx,f,id,sourceId=f.programId) {
 return {commandId:randomUUID(),sourcePlanId:sourceId,
  expectedSourceRevision:(await tx`select revision from public.point_plans where id=${sourceId}`)[0].revision,
  expectedEducationRevision:0,unitId:f.id(30),predecessorPlanId:id,
  expectedPredecessorRevision:(await tx`select revision from public.timplans where id=${id}`)[0].revision};
}
const next=(tx,q)=>tx`select public.phase5_create_gym_timplan(${q.commandId},${q.sourcePlanId},${q.expectedSourceRevision},${q.expectedEducationRevision},${q.unitId},${q.predecessorPlanId},${q.expectedPredecessorRevision}) result`.then(r=>r[0].result);
const rows=(tx,table,id)=>tx.unsafe('select to_jsonb(t) r from public.'+table+' t where '+(table==='timplans'?'id':'timplan_id')+'=$1 order by to_jsonb(t)::text',[id]);
async function planGraph(tx,id) {
 return {plan:await rows(tx,'timplans',id),cells:await rows(tx,'timplan_cells',id),events:await rows(tx,'timplan_events',id),
  classes:await rows(tx,'class_timplans',id),apl:(await tx`select public.phase5_apl_plan_value(${id}) value`)[0].value,
  reviews:(await tx`select public.phase5_apl_copy_review(${id}) value`)[0].value,
  confirmations:await tx`select to_jsonb(c) r from public.apl_rector_confirmations c where plan_id=${id} order by id`};
}
async function acl(tx) {
 return tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace order by 1`;
}
export async function installAplDecisions(tx,report) {
 await tx`set constraints all immediate`;const before=await allPublicHashes(tx),beforeAcl=await acl(tx);
 await tx.unsafe(readFileSync(resolve(root,aplDecisionMigration),'utf8'));
 const after=await allPublicHashes(tx),afterAcl=await acl(tx);
 for(const [table,hash] of Object.entries(before))assert.deepEqual(after[table],hash,table+': migration changed original rows');
 for(const old of beforeAcl)assert.deepEqual(afterAcl.find(x=>x.signature===old.signature),old,old.signature+': migration changed existing ACL');
 report.decisionInstall={before,after,existingAclUnchanged:true};await tx`set constraints all deferred`;
 ok(report,'APL-03 installation preserves all existing complete rows, timestamps, receipts, history and function ACL');
 const added=afterAcl.filter(x=>!beforeAcl.some(y=>x.signature===y.signature));
 assert.ok(added.length>0);
 for(const role of ['anon','authenticated','service_role','skolplattform_worker'])for(const f of added){
  assert.equal((await tx`select has_function_privilege(${role},${f.signature},'execute') allowed`)[0].allowed,false,role+' '+f.signature);
 }
 ok(report,'all newly introduced decision/copy helpers remain closed to ordinary and Worker roles');
}
async function seedLegacy(snapshot) {
 const bfDb=await snapshot.connect(),saDb=await snapshot.connect();let bf,sa;
 await bfDb.begin(async tx=>{
  bf=await approvedClassFixture(tx,'BF25');bf.legacy={approved:bf.planId};
  const oldDecide=async(id,action)=>{await aplActor(tx,bf,['approve','return'].includes(action)?'hm':'principal');return rawCommand(tx,await aplDecisionRequest(tx,id,action));};
  for(const stage of ['draft','returned','submitted','withdraw','replaced']){
   const id=(await aplDraftFromApproved(tx,bf,'Syntetisk legacy '+stage)).reply.id;bf.legacy[stage]=id;
   if(['returned','submitted','withdraw'].includes(stage))await oldDecide(id,'submit');
   if(stage==='returned')await oldDecide(id,'return');
   if(stage==='replaced'){await aplActor(tx,bf,'principal');await next(tx,await nextRequest(tx,bf,id));}
  }
  bf.legacyReceipts=await tx`select command_id,request,result,assignment_id from public.plan_decision_receipts where organizer_id=${bf.id(2)} order by created_at,command_id`;
  await tx`set constraints all immediate`;
 });
 await saDb.begin(async tx=>{sa=await approvedClassFixture(tx,'SA25');await tx`set constraints all immediate`;});
 return {bf,sa};
}
async function legacyMatrix(tx,report,f) {
 await aplActor(tx,f,'principal');
 for(const stage of ['approved','replaced','draft','returned']){
  const d=(await aplDecisionBasis(tx,f.legacy[stage])).result;
  assert.equal(d.apl.detail.plan,null);assert.equal(d.apl.ready,false);assert.ok(d.apl.blockers.length);
  if(['approved','replaced'].includes(stage))assert.ok(d.apl.blockers.every(b=>!d.blockers.includes(b)),'historic read must not create retroactive correction');
  else await aplDeny(tx,report.checks,'legacy '+stage+' cannot submit',s=>aplDecisionRequest(s,f.legacy[stage],'submit').then(q=>rawCommand(s,q)),['40001']);
 }
 ok(report,'approved/replaced legacy remains historical; draft/returned requires explicit APL preparation');
 const historyBefore=await tx`select to_jsonb(h) r from public.plan_decision_history h where organizer_id=${f.id(2)} order by id`;
 for(const receipt of f.legacyReceipts){
  const actor=receipt.assignment_id===f.roles.hm?'hm':'principal';await aplActor(tx,f,actor);
  await aplDecisionCommand(tx,receipt.request,{legacyResult:receipt.result,replayed:true});
 }
 assert.deepEqual(await tx`select to_jsonb(h) r from public.plan_decision_history h where organizer_id=${f.id(2)} order by id`,historyBefore);
 for(const receipt of f.legacyReceipts)assert.deepEqual((await tx`select result from public.plan_decision_receipts where command_id=${receipt.command_id}`)[0].result,receipt.result);
 ok(report,'all original submit/approve/return receipts replay exact stored bodies and hashes under trusted legacy dispatch');
 await aplActor(tx,f,'hm');const submitted=(await aplDecisionBasis(tx,f.legacy.submitted)).result;
 assert.equal(submitted.stage,'submitted');assert.equal(submitted.apl.ready,false);assert.ok(submitted.actions.includes('return'));
 await aplDeny(tx,report.checks,'legacy submitted cannot receive a new approval',s=>aplDecisionRequest(s,f.legacy.submitted,'approve').then(q=>rawCommand(s,q)),['40001']);
 const items=(await tx`select public.phase5_plan_decision_items() result`)[0].result;
 const item=items.find(i=>i.planId===f.legacy.submitted);assert.equal(item.task,'review');assert.equal(item.apl.state,'legacy');assert.equal(item.apl.ready,false);assert.deepEqual(item.apl.blockers,submitted.apl.blockers);
 const selection={query:'Syntetisk legacy submitted',kind:'timplan',stage:'submitted',tasks:'mine',page:1};
 const page=(await tx`select public.phase5_plan_decision_page(${tx.json(selection)}) result`)[0].result;
 assert.equal(page.count,1);assert.deepEqual(page.items,[item]);assert.equal(page.decisionCount,items.filter(i=>i.task==='review').length);
 const inbox=(await tx`select public.phase5_plan_decision_inbox() result`)[0].result;
 assert.deepEqual(inbox.items.find(i=>i.planId===item.planId),item);
 ok(report,'detail/items/inbox/search page agree on legacy APL blocker while retaining HM return task and counts');
 assert.equal((await decide(tx,f,f.legacy.submitted,'return')).result.result.stage,'returned');
 assert.equal((await decide(tx,f,f.legacy.withdraw,'withdraw')).result.result.stage,'draft');
 ok(report,'existing legacy submission can be returned or withdrawn without invented APL or automatic status conversion');
 await aplActor(tx,f,'principal');const old=f.legacyReceipts.find(r=>r.assignment_id===f.roles.principal);
 await tx.savepoint(async s=>{
  await s`update public.access_assignments set ended_at=clock_timestamp() where id=${f.roles.principal}`;
  await aplDeny(s,report.checks,'recalled mandate cannot replay legacy decision receipt',t=>rawCommand(t,old.request),['42501']);throw rollback;
 }).catch(e=>{if(e!==rollback)throw e;});
}
async function structuredMatrix(tx,report,f) {
 await aplActor(tx,f,'principal');const draft=await aplPreparedDraft(tx,f,'Syntetisk APL A');
 await aplCommand(tx,aplSave(draft));
 let d=(await aplDecisionBasis(tx,draft.planId)).result;assert.equal(d.apl.ready,false);assert.equal(d.apl.currentConfirmationId,null);
 await aplDeny(tx,report.checks,'complete APL without rector placement cannot submit',s=>aplDecisionRequest(s,draft.planId,'submit').then(q=>rawCommand(s,q)),['40001']);
 const c=await confirm(tx,f,draft.planId),hash=c.detail.contentHash,event=c.detail.confirmations.at(-1);
 d=(await aplDecisionBasis(tx,draft.planId)).result;assert.equal(d.apl.ready,true);assert.equal(d.apl.currentConfirmationId,event.id);
 const submitted=await decide(tx,f,draft.planId,'submit');assert.equal(submitted.result.result.stage,'submitted');assert.equal(submitted.result.result.apl.detail.contentHash,hash);
 assert.equal(submitted.result.result.apl.currentConfirmationId,event.id);
 const approveRequest=await aplDecisionRequest(tx,draft.planId,'approve');
 await aplDeny(tx,report.checks,'rector cannot approve timplan',s=>rawCommand(s,approveRequest),['42501']);
 await aplDeny(tx,report.checks,'submitted APL save is denied atomically',s=>aplCommand(s,aplSave(draft,submitted.result.result.revision)),['42501']);
 const higher=[...draft.hours];higher[0]+=1;
 await aplDeny(tx,report.checks,'submitted total-hour edit is denied atomically',s=>s`select public.phase5_write_gym_timplan_row(${draft.planId},${submitted.result.result.revision},${draft.rowKey},${s.json(higher)})`,['42501']);
 await decide(tx,f,draft.planId,'withdraw');
 let current=await aplRead(tx,draft.planId);const changed=clone(current.detail.plan);changed.periods[0].contents[0].description+=' ändrat';
 await aplCommand(tx,aplSave(draft,current.detail.revision,changed));
 d=(await aplDecisionBasis(tx,draft.planId)).result;assert.equal(d.apl.ready,false);assert.equal(d.apl.currentConfirmationId,null);assert.equal(d.apl.detail.confirmations.length,1);
 await confirm(tx,f,draft.planId);await decide(tx,f,draft.planId,'submit');
 await aplActor(tx,f,'hm');await aplDeny(tx,report.checks,'withdraw/change/resubmit rejects stale approval payload',s=>rawCommand(s,approveRequest),['40001']);
 const approved=await decide(tx,f,draft.planId,'approve');assert.equal(approved.result.result.stage,'approved');assert.equal(approved.result.result.apl.ready,true);
 current=await aplRead(tx,draft.planId);assert.deepEqual(current.detail.confirmations.at(-1),approved.result.result.apl.detail.confirmations.at(-1));
 await aplActor(tx,f,'principal');const replay=await aplDecisionCommand(tx,submitted.q,{replayed:true});
 assert.deepEqual(replay.result,submitted.result.result);assert.deepEqual(replay.aplBasis,submitted.result.aplBasis);
 ok(report,'structured submit/approve uses current rector event; status-only transitions preserve hash and frozen new receipt replay');
 await aplDeny(tx,report.checks,'approved APL cannot be edited in place',s=>aplCommand(s,aplSave(draft,current.detail.revision)),['42501']);
 const b=await aplPreparedDraft(tx,f,'Syntetisk APL B');await complete(tx,f,b);await decide(tx,f,b.planId,'submit');await decide(tx,f,b.planId,'approve');
 await aplActor(tx,f,'principal');const classes=[];
 for(const [id,name] of [[draft.planId,'APL A'],[b.planId,'APL B']]){
  const revision=(await tx`select revision from public.timplans where id=${id}`)[0].revision;
  const created=(await tx`select public.phase5_class_command(${tx.json({operation:'create',commandId:randomUUID(),planId:id,expectedPlanRevision:revision,name,startYear:f.year})}) result`)[0].result;
  const linked=(await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:created.id,schoolYear:f.year,planId:id,expectedPlanRevision:revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})}) result`)[0].result;classes.push(linked);
 }
 const classRows=await tx`select to_jsonb(c) r from public.class_timplans c where timplan_id in (select id from public.timplans where organizer_id=${f.id(2)}) order by to_jsonb(c)::text`;
 const aBefore=await planGraph(tx,draft.planId),bBefore=await planGraph(tx,b.planId);
 const nq=await nextRequest(tx,f,draft.planId),a2=await next(tx,nq);
 assert.equal(a2.reply.revision,0);assert.equal(a2.reply.version,2);
 const a2read=await aplRead(tx,a2.reply.id);assert.equal(a2read.detail.plan.classification,'unreviewed');assert.ok(a2read.detail.plan.periods.every(p=>!p.extent.reviewed));assert.deepEqual(a2read.detail.confirmations,[]);
 assert.notEqual(a2read.detail.plan.periods[0].id,current.detail.plan.periods[0].id);assert.equal(a2read.detail.plan.periods[0].extent.weeks,15);
 assert.deepEqual(await planGraph(tx,draft.planId),aBefore);assert.deepEqual(await planGraph(tx,b.planId),bBefore);
 await complete(tx,f,{...draft,planId:a2.reply.id});await decide(tx,f,a2.reply.id,'submit');await decide(tx,f,a2.reply.id,'approve');
 assert.equal((await tx`select status from public.timplans where id=${draft.planId}`)[0].status,'ersatt');assert.deepEqual(await planGraph(tx,b.planId),bBefore);
 assert.deepEqual(await tx`select to_jsonb(c) r from public.class_timplans c where timplan_id in (select id from public.timplans where organizer_id=${f.id(2)}) order by to_jsonb(c)::text`,classRows);
 ok(report,'two approved named series and exact year/class links stay independent when only A receives and approves a successor');
 await aplActor(tx,f,'principal');const sourceBefore=await planGraph(tx,b.planId);
 const copied=await copy(tx,await copyRequest(tx,f,b.planId,'Syntetisk APL kopia'));
 const copiedRead=await aplRead(tx,copied.reply.id);assert.equal(copied.reply.revision,0);assert.equal(copied.reply.version,1);
 assert.notEqual(copied.reply.series.id,beforeSeries(bBefore));assert.equal(copiedRead.detail.plan.classification,'unreviewed');assert.deepEqual(copiedRead.detail.confirmations,[]);
 assert.equal(copiedRead.detail.plan.periods[0].extent.weeks,15);assert.notEqual(copiedRead.detail.plan.periods[0].id,sourceBefore.apl.periods[0].id);
 assert.deepEqual(await planGraph(tx,b.planId),sourceBefore);
 const empty=await copy(tx,await copyRequest(tx,f,null,'Syntetisk helt ny APL'));assert.equal(empty.reply.revision,0);assert.equal((await aplRead(tx,empty.reply.id)).detail.plan,null);
 const copiedBefore=await planGraph(tx,copied.reply.id),draftNext=await next(tx,await nextRequest(tx,f,copied.reply.id));
 assert.equal(draftNext.reply.revision,0);assert.equal(draftNext.reply.version,2);assert.equal((await tx`select status from public.timplans where id=${copied.reply.id}`)[0].status,'ersatt');
 const draftNextRead=await aplRead(tx,draftNext.reply.id);assert.notEqual(draftNextRead.detail.plan.periods[0].id,copiedBefore.apl.periods[0].id);assert.deepEqual(draftNextRead.detail.confirmations,[]);
 assert.deepEqual((await planGraph(tx,copied.reply.id)).cells,copiedBefore.cells);
 ok(report,'both named copy and new-version paths initialize new period IDs at revision zero; empty create has no inferred APL');
 return {draft,b,draftNext};
}
const beforeSeries=graph=>graph.plan[0].r.series_id;
async function auditMatrix(tx,report,f,draft) {
 await aplActor(tx,f,'principal');await complete(tx,f,draft);
 const submit=await aplDecisionRequest(tx,draft.planId,'submit'),cq=await copyRequest(tx,f,draft.planId,'Syntetisk auditfel'),nq=await nextRequest(tx,f,draft.planId);
 await tx.unsafe(`create function pg_temp.fail_apl_decision_audit() returns trigger language plpgsql as $$begin if new.customer_id='${f.id(1)}' and new.action in ('plan_decision_command','named_timplan_created','gym_timplan_created','apl_plan_copied') then raise exception 'synthetic audit failure';end if;return new;end$$;
 create trigger fail_apl_decision_audit before insert on public.security_events for each row execute function pg_temp.fail_apl_decision_audit();`);
 await aplDeny(tx,report.checks,'decision audit failure restores status, history, APL and receipt',s=>rawCommand(s,submit),['55000']);
 await aplDeny(tx,report.checks,'copy audit failure restores new series, plan, copied APL and receipts',s=>copy(s,cq),['55000']);
 await aplDeny(tx,report.checks,'successor audit failure restores original draft status and all copied data',s=>next(s,nq),['55000']);
 await tx`drop trigger fail_apl_decision_audit on public.security_events`;
}
async function regressionMatrix(tx,report,f,sa) {
 await aplActor(tx,sa,'principal');const created=await aplDraftFromApproved(tx,sa,'Syntetisk SA regression');
 assert.equal((await aplDecisionBasis(tx,created.reply.id)).result.apl,null);await decide(tx,sa,created.reply.id,'submit');
 assert.equal((await decide(tx,sa,created.reply.id,'approve')).result.result.apl,null);
 for(const fixture of [f,sa]){
  await aplActor(tx,fixture,'principal');const p=(await tx`select * from public.point_plans where id=${fixture.programId}`)[0];
  const created=(await tx`select public.phase5_clone_programplan_draft(${p.id},${p.revision},${p.version},null) result`)[0].result;
  const detail=(await aplDecisionBasis(tx,created.id,'programplan')).result;assert.equal(detail.apl,null);assert.equal(detail.checks.some(c=>c.id==='apl'),fixture===f);
  await decide(tx,fixture,created.id,'submit','programplan');assert.equal((await decide(tx,fixture,created.id,'approve','programplan')).result.result.stage,'approved');
 }
 ok(report,'SA timplan approval and BF/SA programplan decisions retain their previous controls without school APL requirements');
}
async function copyLossMatrix(tx,report,f,original) {
 // Exercise genuine source edits inside a savepoint, then restore that source
 // so the independent BF/SA regressions still start from the original fixture.
 try {await tx.savepoint(async s=>{
  await aplActor(s,f,'principal');const source=await copy(s,await copyRequest(s,f,original.planId,'Syntetisk bortfallskälla'));
  let read=await aplRead(s,source.reply.id);const value=clone(read.detail.plan),period=value.periods[0];
  const block=read.context.plan.rows.find(r=>r.key==='block:yrkesp');assert.ok(block);
  const blockTerm=block.pointTerms.findIndex(n=>n>0);assert.ok(blockTerm>=0&&read.context.plan.hours[block.key][blockTerm]>=1);
  period.contents.push({rowKey:block.key,description:'Syntetiskt innehåll från en fördjupningsram.'});
  period.allocations.push({rowKey:block.key,termIndex:blockTerm,gutMinutes:60});
  await aplCommand(s,aplSave({...original,planId:source.reply.id},read.detail.revision,value));
  const sourceBefore=await planGraph(s,source.reply.id),p=(await s`select * from public.point_plans where id=${f.programId}`)[0];
  let edited=(await s`select public.phase5_clone_programplan_draft(${p.id},${p.revision},${p.version},null) result`)[0].result;
  edited=(await s`select public.phase5_write_programplan_terms(${edited.id},${edited.revision},'[]'::jsonb) result`)[0].result;
  const blocks=clone(p.basis_reference.choiceBlocks),changedBlock=blocks.find(b=>b.id==='yrkesp');assert.ok(changedBlock);changedBlock.id='yrkny';
  const afterBlocks=(await s`select public.phase5_replace_programplan_blocks(${edited.planId??edited.id},${edited.revision},${s.json(blocks)}) result`)[0].result;
  const terms=clone(p.term_distribution);terms.find(t=>t.rowKey===block.key).rowKey='block:yrkny';
  const main=terms.find(t=>t.rowKey===original.rowKey);assert.ok(main.points[0]>0);main.points[1]+=main.points[0];main.points[0]=0;
  const extra=period.allocations.find(a=>a.rowKey!==original.rowKey&&a.rowKey!==block.key).rowKey;
  const other=terms.find(t=>t.rowKey===extra);assert.ok(other.points[0]>1);other.points[0]-=1;other.points[1]+=1;
  await s`select public.phase5_write_programplan_terms(${afterBlocks.id},${afterBlocks.revision},${s.json(terms)})`;
  await decide(s,f,afterBlocks.id,'submit','programplan');await decide(s,f,afterBlocks.id,'approve','programplan');await aplActor(s,f,'principal');
  const target=await copy(s,await copyRequest(s,f,source.reply.id,'Syntetiskt synligt bortfall',afterBlocks.id));
  read=await aplRead(s,target.reply.id);assert.equal(read.detail.revision,0);assert.equal(read.detail.plan.classification,'unreviewed');
  assert.deepEqual(read.detail.copyReview.map(r=>r.reason).sort(),['inactive_term','insufficient_total','missing_row']);
  assert.ok(read.detail.copyReview.every(r=>r.resolution===null&&r.sourcePlanId===source.reply.id&&r.sourceVersion===1&&r.sourcePeriodId===period.id));
  for(const [reason,rowKey] of [['missing_row',block.key],['inactive_term',original.rowKey],['insufficient_total',extra]]){
   const review=read.detail.copyReview.find(r=>r.reason===reason);assert.equal(review.sourcePeriodName,period.name);
   assert.deepEqual(review.contents,period.contents.filter(c=>c.rowKey===rowKey));
   assert.deepEqual(review.allocations,period.allocations.filter(a=>a.rowKey===rowKey));
  }
  const lost=read.detail.copyReview.flatMap(r=>r.allocations).reduce((n,a)=>n+a.gutMinutes,0);
  const active=read.detail.plan.periods.flatMap(p=>p.allocations).reduce((n,a)=>n+a.gutMinutes,0);assert.equal(lost+active,20760);assert.equal(lost,20760);
  assert.ok(read.detail.plan.periods.every(p=>p.contents.every(c=>c.rowKey!=='block:yrkesp')));
  assert.deepEqual(await planGraph(s,source.reply.id),sourceBefore);
  ok(report,'real source block/term edits preserve exactly 20 760 lost minutes in three explicit reviews, with no invalid active row or source write');
  const again=await copy(s,await copyRequest(s,f,target.reply.id,'Syntetiskt ärvt bortfall',afterBlocks.id));
  const inherited=(await aplRead(s,again.reply.id)).detail.copyReview;assert.equal(inherited.length,3);
  const withoutId=r=>{const v={...r};delete v.id;return v;};
  assert.deepEqual(inherited.map(withoutId).sort((a,b)=>a.reason.localeCompare(b.reason)),read.detail.copyReview.map(withoutId).sort((a,b)=>a.reason.localeCompare(b.reason)));
  assert.ok(inherited.every(r=>!read.detail.copyReview.some(old=>old.id===r.id)));
  const resolution={...aplSave({...original,planId:target.reply.id},read.detail.revision,read.detail.plan),
   copyReviewResolutions:read.detail.copyReview.map(r=>({id:r.id,note:'Syntetiskt granskat bortfall; separat omplanering återstår.'}))};
  const resolved=await aplCommand(s,resolution);assert.equal(resolved.detail.revision,read.detail.revision+1);assert.ok(resolved.detail.copyReview.every(r=>r.resolution!==null));
  const afterResolved=await copy(s,await copyRequest(s,f,target.reply.id,'Syntetisk löst historik',afterBlocks.id));
  assert.deepEqual((await aplRead(s,afterResolved.reply.id)).detail.copyReview,[]);
  assert.equal((await aplDecisionBasis(s,target.reply.id)).result.apl.ready,false);
  ok(report,'pending copy reviews propagate with fresh IDs; explicit resolution advances revision but neither copies resolved history nor makes incomplete APL ready');
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
}
async function concurrency(snapshot,report,f) {
 const db=snapshot.db;let draft,q,copyQ,structuralBefore;
 await db.begin(async tx=>{await installAplCommands(tx,report);await installAplDecisions(tx,report);await aplActor(tx,f,'principal');draft=await aplPreparedDraft(tx,f,'Syntetisk race APL');await complete(tx,f,draft);
  const current=await aplRead(tx,draft.planId);q=aplSave(draft,current.detail.revision,{...current.detail.plan,classification:'unreviewed'});copyQ=await copyRequest(tx,f,draft.planId,'Syntetisk race kopia');
  structuralBefore={plans:await tx`select id from public.timplans order by id`,series:await tx`select to_jsonb(s) r from public.timplan_series s order by id`,classes:await tx`select to_jsonb(c) r from public.class_timplans c order by to_jsonb(c)::text`};
 });
 const installedSchema=await schemaFingerprint(db);
 let race=await aplRace(snapshot,report,f,'actual save before copy','principal',t=>aplCommand(t,q),'principal',t=>copy(t,copyQ));
 assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'40001');
 await db.begin(async tx=>{await aplActor(tx,f,'principal');assert.equal((await tx`select count(*)::int n from public.named_timplan_commands where command_id=${copyQ.commandId}`)[0].n,0);
  assert.deepEqual({plans:await tx`select id from public.timplans order by id`,series:await tx`select to_jsonb(s) r from public.timplan_series s order by id`,classes:await tx`select to_jsonb(c) r from public.class_timplans c order by to_jsonb(c)::text`},structuralBefore);
 });
 ok(report,'observed save/copy overlap rejects stale copied revision with no series or receipt');
 let preCopy;
 await db.begin(async tx=>{await aplActor(tx,f,'principal');const r=await aplRead(tx,draft.planId);preCopy=r.detail.plan;copyQ=await copyRequest(tx,f,draft.planId,'Syntetisk race kopia efter');
  const v=clone(r.detail.plan);v.periods[0].name+=' senare';q=aplSave(draft,r.detail.revision,v);});
 race=await aplRace(snapshot,report,f,'actual copy before save','principal',t=>copy(t,copyQ),'principal',t=>aplCommand(t,q));
 assert.equal(race.right.ok,true);
 await db.begin(async tx=>{await aplActor(tx,f,'principal');const r=await aplRead(tx,race.left.reply.id);assert.equal(r.detail.plan.periods[0].name,preCopy.periods[0].name);assert.deepEqual(r.detail.plan.periods[0].allocations,preCopy.periods[0].allocations);});
 ok(report,'observed copy/save overlap copies a consistent prior structure; later source save stays independent');
 let approval,blockedSave;
 await db.begin(async tx=>{await complete(tx,f,draft);await decide(tx,f,draft.planId,'submit');await aplActor(tx,f,'hm');approval=await aplDecisionRequest(tx,draft.planId,'approve');
  await aplActor(tx,f,'principal');const r=await aplRead(tx,draft.planId),changed=clone(r.detail.plan);changed.periods[0].contents[0].description+=' ej tillåten ändring';blockedSave=aplSave(draft,r.detail.revision,changed);});
 race=await aplRace(snapshot,report,f,'actual approve before APL save','hm',t=>aplDecisionCommand(t,approval),'principal',t=>aplCommand(t,blockedSave));
 assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'42501');
 await db.begin(async tx=>{await aplActor(tx,f,'hm');const d=(await aplDecisionBasis(tx,draft.planId)).result;assert.equal(d.stage,'approved');assert.equal(d.apl.ready,true);assert.equal((await tx`select count(*)::int n from public.apl_plan_commands where command_id=${blockedSave.commandId}`)[0].n,0);});
 ok(report,'observed approve/save overlap commits one approval and denies the competing APL edit without receipt');
 assert.equal(report.races.length,3);assert.ok(report.races.every(r=>r.leftPid!==r.rightPid&&r.blockers.includes(r.leftPid)));
 assert.equal(await schemaFingerprint(db),installedSchema);report.concurrencySchemaUnchanged=true;
 report.concurrencyComplete=true;
}
export async function verifyAplDecisions(out) {
 const fd=openSync(out,'wx',0o600),report={kind:'apl-decisions-private-schema-only',schemaVersion:1,status:'FAIL',runId:randomUUID(),startedAt:new Date().toISOString(),checks:[],races:[],
  limitations:['Schema-only snapshot plus repository catalog and synthetic rows; no active business data copied or modified','Actual PostgreSQL mandates, commands and lock overlap; no HTTP/OIDC/browser or deployment claim','New private helpers are owner-tested; no new Worker grants']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let snapshot;
 try{
  report.sources=sources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const {bf,sa}=await seedLegacy(snapshot),db=snapshot.db;report.before=await allPublicHashes(db);report.beforeSchema=await schemaFingerprint(db);
  const originalRecords={};for(const table of Object.keys(report.before))originalRecords[table]=await db.unsafe('select to_jsonb(t) r from public.'+table+' t');
  try{await db.begin(async tx=>{await tx`set local lock_timeout='10s'`;await tx`set local statement_timeout='120s'`;await tx`set local transaction_timeout='480s'`;
   await installAplCommands(tx,report);await installAplDecisions(tx,report);await legacyMatrix(tx,report,bf);
   const matrix=await structuredMatrix(tx,report,bf);await auditMatrix(tx,report,bf,{...matrix.draft,planId:matrix.draftNext.reply.id});
   await copyLossMatrix(tx,report,bf,matrix.b);await regressionMatrix(tx,report,bf,sa);
   await tx`set constraints all immediate`;throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  report.after=await allPublicHashes(db);report.afterSchema=await schemaFingerprint(db);assert.deepEqual(report.after,report.before);assert.equal(report.afterSchema,report.beforeSchema);report.rollbackRestored=true;save();
  await concurrency(snapshot,report,bf);
  let originalCount=0;
  for(const [table,originals] of Object.entries(originalRecords)){
   const present=new Set((await db.unsafe('select to_jsonb(t) r from public.'+table+' t')).map(x=>JSON.stringify(x.r)));
   for(const {r} of originals){assert.ok(present.has(JSON.stringify(r)),table+': concurrency changed an original row');originalCount++;}
  }
  report.concurrencyOriginals={exactPreservedRows:originalCount,tables:Object.keys(originalRecords).length};
  ok(report,'all original synthetic rows including receipt/history timestamps remain exact after committed concurrent operations');
 }catch(error){report.failure={name:error.name,code:error.code,message:error.message,hint:error.hint,where:error.where,position:error.position,stack:error.stack};}
 finally{
  try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(error){report.sourceFailure={message:error.message};}
  try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(error){report.cleanupFailure={message:error.message};}
  if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.rollbackRestored&&report.concurrencyComplete&&report.cleanup?.cleanup==='complete')report.status='PASS';
  report.completedAt=new Date().toISOString();save();closeSync(fd);
 }
 console.log(`${report.status}: ${report.checks.length} APL decision checks; overlaps=${report.races.length}; rollback=${report.rollbackRestored===true}; ${out}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if((await verifyAplDecisions(privateOutput(process.argv.slice(2)))).status!=='PASS')process.exitCode=1;
}
