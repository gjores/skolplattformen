#!/usr/bin/env node
// Actual PostgreSQL checks on an owned schema-only copy. Never installs into active data.
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync,openSync,closeSync,writeSync,ftruncateSync,fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot,schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes,privateOutput } from './verify-atomic-cohort-copy.mjs';
import { classFixture } from './verify-class-timplans.mjs';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { programplanTermRows,programplanLevelRanks,suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';
import { parseTimplanTimeRow } from '../../web/lib/timplan-time.ts';
import { aplUxFixture } from './apl-ux-fixtures.mjs';
import { aplActor,aplDeny,aplRace,aplRead,aplSources,aplPreparedDraft,aplCommand,aplSave } from './verify-apl-plan-commands.mjs';
const { projectPlanDecision } = await import('../../web/lib/server/plan-decision.ts');
const root=fileURLToPath(new URL('../../',import.meta.url));
export const timeMigrations=['supabase/migrations/20261016160000_timplan_time_v2_storage.sql','supabase/migrations/20261016161000_timplan_time_v2_integration.sql'];
const sourceFiles=[...timeMigrations,'work/pilot/verify-timplan-time-v2.mjs'];
const sources=()=>aplSources([...sourceFiles,'web/lib/timplan-time.ts','web/lib/server/plan-decision.ts','web/lib/server/timplan-time.ts','work/pilot/apl-ux-fixtures.mjs']);
const rollback=Error('expected_time_rollback');
const command=(db,q)=>db`select public.phase5_timplan_time_command(${db.json(q)}) value`.then(r=>r[0].value);
const raw=(db,id)=>db`select public.phase5_gym_timplan_result(${id}) value`.then(r=>r[0].value);
const basis=(db,id)=>db`select public.phase5_timplan_time_transition_basis(${id}) value`.then(r=>r[0].value);
const request=(plan,action,extra)=>({contractVersion:'timplan_time_v2',action,commandId:randomUUID(),planId:plan.id,expectedRevision:plan.revision,...extra});
const transition=(b)=>({contractVersion:'timplan_time_v2',action:'transition',commandId:randomUUID(),planId:b.planId,expectedRevision:b.revision,expectedBasisHash:b.basisHash,reviewed:true});
const record=(r,name)=>{r.checks.push({name,ok:true});console.log('PASS: '+name);};
async function preparatoryFixture(tx){
 const f=await classFixture(tx),{id,actor}=f,catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const [{catalog_id:catalogId}]=await tx`select catalog_id from public.point_plans where id=${id(50)}`;
 let reference,rows,terms;
 if(true){const program=catalog.programs.find(p=>p.code==='SA25'&&p.version===4);reference={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};rows=programplanTermRows(program,reference);terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));}

 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk klass','Syntetisk framtida kull',${reference.programRef.code},${reference.orientationCode},${Number(reference.startedOn.slice(0,4))})`;
 const created=(await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) result`)[0].result;
 const programId=created.id;
 await actor('principal');await tx`select public.phase5_write_programplan_terms(${programId},0,${tx.json(terms)})`;
 const decision=async(kind,planId,action)=>{const b=(await tx`select public.phase5_plan_decision_basis(${kind},${planId}) result`)[0].result;const d=b.result??b.detail??b;
 return(await tx`select public.phase5_plan_decision_command(${tx.json({kind,planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)})}) result`)[0].result;};
 await decision('programplan',programId,'submit');await actor('hm');await decision('programplan',programId,'approve');
 await actor('principal');const [{revision:programRevision}]=await tx`select revision from public.point_plans where id=${programId}`;
 const g=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${programRevision},0,${id(30)},null,null) result`)[0].result;
 let revision=0;for(const row of rows){const hours=terms.find(t=>t.rowKey===row.key).points.map(p=>p>0?p:null);revision=(await tx`select public.phase5_write_gym_timplan_row(${g.reply.id},${revision},${row.key},${tx.json(hours)}) result`)[0].result.revision;}
 await decision('timplan',g.reply.id,'submit');await actor('hm');await decision('timplan',g.reply.id,'approve');await actor('principal');
 return{...f,programId,planId:g.reply.id,decision,year:Number(reference.startedOn.slice(0,4))-(reference.startedOn.slice(5,7)<'07'?1:0)};
}
async function seedSubhour(tx,f){
 await aplActor(tx,f,'principal');const source=(await tx`select revision from public.point_plans where id=${f.programId}`)[0].revision;
 const original=await raw(tx,f.planId);
 const made=(await tx`select public.phase5_named_timplan_create(${tx.json({commandId:randomUUID(),sourcePlanId:f.programId,expectedSourceRevision:source,expectedEducationRevision:0,unitId:f.id(30),name:'Syntetisk minutövergång',copyFromPlanId:f.planId,expectedCopyFromRevision:original.revision})}) value`)[0].value;
 const key=Object.keys(made.plan.hours).find(k=>made.plan.hours[k][0]!==null),hours=[...made.plan.hours[key]];hours[0]=80;
 const row=(await tx`select public.phase5_write_gym_timplan_row(${made.reply.id},0,${key},${tx.json(hours)}) value`)[0].value;
 const q={contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:made.reply.id,expectedRevision:row.revision,copyReviewResolutions:[],plan:{contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[{id:randomUUID(),name:'Syntetisk halvtimme',startsOn:null,endsOn:null,schoolYear:null,extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[{rowKey:key,description:'Syntetiskt'}],allocations:[{rowKey:key,termIndex:0,gutMinutes:30}]}]}};
 const saved=(await tx`select public.phase5_apl_plan_command(${tx.json(q)}) value`)[0].value;
 return{id:made.reply.id,key,q,saved};
}
async function matrix(tx,r,f,other){
 await aplActor(tx,other,'principal');
 const otherPlan=await raw(tx,other.planId);assert.ok('hours' in otherPlan);assert.ok(!('timeRows' in otherPlan));
 await aplDeny(tx,r.checks,'preparatory programme rejects annual model',t=>basis(t,other.planId),['42501','22023']);
 const otherSource=(await tx`select revision from public.point_plans where id=${other.programId}`)[0].revision;
 const otherMade=(await tx`select public.phase5_named_timplan_create(${tx.json({commandId:randomUUID(),sourcePlanId:other.programId,expectedSourceRevision:otherSource,expectedEducationRevision:0,unitId:other.id(30),name:'Syntetisk högskoleförberedande',copyFromPlanId:null,expectedCopyFromRevision:null})}) value`)[0].value;
 assert.ok('hours' in otherMade.plan);assert.ok(!('timeRows' in otherMade.plan));
 await aplDeny(tx,r.checks,'preparatory programme rejects new APL periods',t=>t`select public.phase5_apl_plan_command(${t.json({contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:otherMade.reply.id,expectedRevision:0,copyReviewResolutions:[],plan:{contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[]}})})`,['22023']);
 record(r,'new preparatory plans remain school-only legacy model');
 for(const [row,points,valid] of [
  [{schoolMinutes:[0,null,4790,null,null,null],annualAplMinutes:[30,0,null]},[1,0,1,0,0,0],true],
  [{schoolMinutes:[120001,null,null,null,null,null],annualAplMinutes:[0,null,null]},[1,0,0,0,0,0],false],
  [{schoolMinutes:[0,0,null,null,null,null],annualAplMinutes:[0,null,null]},[1,0,0,0,0,0],false],
  [{schoolMinutes:[0,null,null,null,null,null],annualAplMinutes:[0,0,null]},[1,0,0,0,0,0],false],
  [{schoolMinutes:[0.5,null,null,null,null,null],annualAplMinutes:[0,null,null]},[1,0,0,0,0,0],false]]){
  let parsed;try{parsed=parseTimplanTimeRow(row,points);}catch{}assert.equal(Boolean(parsed),valid);
  if(valid)assert.deepEqual((await tx`select public.phase5_timplan_time_row(${tx.json(row)},${tx.json(points)}) value`)[0].value,parsed);
  else await aplDeny(tx,r.checks,'SQL/TS invalid minute or activity parity',t=>t`select public.phase5_timplan_time_row(${t.json(row)},${t.json(points)})`,['22023']);
 }
 record(r,'actual SQL and TypeScript agree on minute values and inactive null masks');
 await aplActor(tx,f,'principal');
 const subBefore=await raw(tx,f.subhour.id),subBasis=await basis(tx,f.subhour.id),sub=await command(tx,transition(subBasis));
 assert.equal(sub.plan.timeRows[f.subhour.key].schoolMinutes[0],4770);assert.equal(sub.plan.timeRows[f.subhour.key].annualAplMinutes[0],30);
 assert.equal(subBefore.hours[f.subhour.key][0]*60,sub.plan.timeRows[f.subhour.key].schoolMinutes[0]+sub.plan.timeRows[f.subhour.key].annualAplMinutes[0]);
 const oldReplay=(await tx`select public.phase5_apl_plan_command(${tx.json(f.subhour.q)}) value`)[0].value;
 assert.deepEqual(oldReplay,{...f.subhour.saved,result:{...f.subhour.saved.result,receipt:{...f.subhour.saved.result.receipt,replayed:true}}});
 record(r,'80h minus 30min becomes 79h30 school plus 30min annual APL; old APL receipt replays exact frozen V1');
 const before=await raw(tx,f.planId),b=await basis(tx,f.planId),q=transition(b),oldCells=await tx`select * from public.timplan_cells where timplan_id=${f.planId} order by row_id`;
 const moved=await command(tx,q);assert.equal(moved.plan.timeModel,'school_terms_annual_apl_v2');assert.ok(!('hours' in moved.plan));assert.equal(moved.plan.revision,before.revision+1);
 const rows=moved.plan.timeRows;assert.deepEqual(rows,b.rows);
 assert.deepEqual(await tx`select * from public.timplan_cells where timplan_id=${f.planId} order by row_id`,oldCells);
 const legacyTotal=Object.values(before.hours).flat().reduce((s,v)=>s+(v??0)*60,0),newTotal=Object.values(rows).flatMap(v=>[...v.schoolMinutes,...v.annualAplMinutes]).reduce((s,v)=>s+(v??0),0);assert.equal(newTotal,legacyTotal);
 record(r,'explicit transition preserves every legacy cell and exact total minutes; V2 has no legacy hours');
 const replay=await command(tx,q);assert.deepEqual(replay,{...moved,receipt:{...moved.receipt,replayed:true}});
 await aplDeny(tx,r.checks,'changed request ID conflicts with immutable receipt',t=>command(t,{...q,expectedRevision:q.expectedRevision+1}),['40001']);
 const key=Object.keys(rows).find(k=>rows[k].schoolMinutes[0]!==null),row=structuredClone(rows[key]);assert.ok(key);
 row.schoolMinutes[0]=1200;row.annualAplMinutes[0]=3600;
 let saved=await command(tx,request(moved.plan,'save_row',{rowKey:key,row}));assert.deepEqual(saved.plan.timeRows[key],row);
 assert.equal((await tx`select count(*)::integer n from public.apl_plan_periods where plan_id=${f.planId}`)[0].n,0);
 record(r,'school terms plus annual APL persist without any period or date');
 let plan=structuredClone({contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[{id:randomUUID(),name:'Syntetisk senare förläggning',startsOn:null,endsOn:null,schoolYear:null,plannedTermIndex:0,extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[{rowKey:key,description:'Syntetiskt innehåll'}],allocations:[{rowKey:key,termIndex:0,gutMinutes:3600}]}]});
 const aplQ={contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:f.planId,expectedRevision:saved.plan.revision,copyReviewResolutions:[],plan};
 const apl=(await tx`select public.phase5_apl_plan_command(${tx.json(aplQ)}) value`)[0].value;assert.equal(apl.result.receipt.changed,true);
 const checked=await aplRead(tx,f.planId);assert.equal(checked.detail.contentHash,apl.result.detail.contentHash);record(r,'actual V2 APL frozen basis parses and content hash agrees with TypeScript');
 let current=await raw(tx,f.planId);assert.deepEqual(current.timeRows,saved.plan.timeRows);
 const baseline=Object.values(current.timeRows).flatMap(v=>[...v.schoolMinutes,...v.annualAplMinutes]).reduce((s,v)=>s+(v??0),0);assert.equal(baseline,Object.values(saved.plan.timeRows).flatMap(v=>[...v.schoolMinutes,...v.annualAplMinutes]).reduce((s,v)=>s+(v??0),0));
 row.schoolMinutes[0]=0;saved=await command(tx,request(current,'save_row',{rowKey:key,row}));
 record(r,'later period allocation consumes annual budget without changing total; zero school time permits APL');
 await aplDeny(tx,r.checks,'annual budget cannot drop below allocated periods',t=>command(t,request(saved.plan,'save_row',{rowKey:key,row:{...row,annualAplMinutes:[3599,...row.annualAplMinutes.slice(1)]}})),['22023']);
 await aplDeny(tx,r.checks,'stale row cannot overwrite current revision',t=>command(t,request(current,'save_row',{rowKey:key,row})),['40001']);
 await aplDeny(tx,r.checks,'legacy row endpoint rejects V2',t=>t`select public.phase5_write_gym_timplan_row(${f.planId},${saved.plan.revision},${key},${t.json(before.hours[key])})`,['40001']);
 await aplDeny(tx,r.checks,'direct legacy matrix write rejects V2',t=>t`update public.timplan_cells set hours=hours where timplan_id=${f.planId}`,['40001']);
 await aplDeny(tx,r.checks,'unpermitted direct V2 matrix write rejected',t=>t`update public.timplan_time_cells_v2 set school_minutes=school_minutes where plan_id=${f.planId}`,['42501']);
 for(const who of ['hm','principal2']){await aplActor(tx,f,who);await aplDeny(tx,r.checks,who+' cannot modify this school time matrix',t=>command(t,request(saved.plan,'save_row',{rowKey:key,row})),['42501']);}await aplActor(tx,f,'principal');
 await tx.unsafe(`create function pg_temp.time_fail_audit() returns trigger language plpgsql as $$begin if new.action='gym_timplan_row_changed' then raise exception 'synthetic audit failure';end if;return new;end$$; create trigger time_fail_audit before insert on public.security_events for each row execute function pg_temp.time_fail_audit();`);
 row.schoolMinutes[0]=1;
 await aplDeny(tx,r.checks,'audit failure rolls back V2 row, revision and receipt',t=>command(t,request(saved.plan,'save_row',{rowKey:key,row})),['55000']);
 await tx`drop trigger time_fail_audit on public.security_events`;
 const status=(await tx`select public.phase5_timplan_time_status(${tx.json({command:q})}) value`)[0].value;assert.deepEqual(status.result,replay);record(r,'status returns frozen transition snapshot after later row and period changes');
 const decision=(await tx`select public.phase5_plan_decision_detail('timplan',${f.planId}) value`)[0].value;
 assert.equal(decision.timeModel,'school_terms_annual_apl_v2');assert.ok(!('hours' in decision));assert.deepEqual(decision.timeRows,saved.plan.timeRows);
 record(r,'decision basis uses V2 minute matrix without legacy hours');
 const batchPlan=await raw(tx,f.planId),keys=Object.keys(batchPlan.timeRows).sort().slice(0,2),batchRows=Object.fromEntries(keys.map(k=>[k,structuredClone(batchPlan.timeRows[k])]));
 for(const k of keys){const index=batchRows[k].schoolMinutes.findIndex(v=>v!==null);assert.ok(index>=0);batchRows[k].schoolMinutes[index]+=1;}
 await tx.unsafe(`create function pg_temp.time_midwrite_fail() returns trigger language plpgsql as $$begin if new.row_key='${keys[1].replaceAll("'","''")}' then raise exception 'synthetic midwrite failure';end if;return new;end$$; create trigger zz_time_midwrite_fail before update on public.timplan_time_cells_v2 for each row execute function pg_temp.time_midwrite_fail();`);
 await aplDeny(tx,r.checks,'mid-batch second-row failure restores first row revision and receipt',t=>command(t,request(batchPlan,'save_rows',{rows:batchRows})),['P0001']);await tx`drop trigger zz_time_midwrite_fail on public.timplan_time_cells_v2`;
 const revokedRollback=Error('restore revoked fixture');try{await tx.savepoint(async t=>{await t`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.id(81)}`;await aplDeny(t,r.checks,'revoked session cannot replay a time receipt',t2=>command(t2,q),['42501']);throw revokedRollback;});}catch(e){if(e!==revokedRollback)throw e;}
 const src=(await tx`select revision from public.point_plans where id=${f.programId}`)[0].revision;
 const create={commandId:randomUUID(),sourcePlanId:f.programId,expectedSourceRevision:src,expectedEducationRevision:0,unitId:f.id(30),name:'Syntetisk års-APL-kopia',copyFromPlanId:f.planId,expectedCopyFromRevision:saved.plan.revision};
 const copied=(await tx`select public.phase5_named_timplan_create(${tx.json(create)}) value`)[0].value;
 assert.deepEqual(copied.plan.timeRows,saved.plan.timeRows);assert.equal(copied.plan.timeModel,'school_terms_annual_apl_v2');assert.equal((await tx`select count(*)::integer n from public.apl_rector_confirmations where plan_id=${copied.reply.id}`)[0].n,0);
 record(r,'named V2 copy preserves school and annual minutes and carries no confirmation');
 const empty=(await tx`select public.phase5_named_timplan_create(${tx.json({...create,commandId:randomUUID(),name:'Syntetisk ny års-APL',copyFromPlanId:null,expectedCopyFromRevision:null})}) value`)[0].value;
 assert.equal(empty.plan.timeModel,'school_terms_annual_apl_v2');assert.ok(Object.values(empty.plan.timeRows).every(v=>[...v.schoolMinutes,...v.annualAplMinutes].every(x=>x===null)));record(r,'new empty supported vocational plan starts V2 without invented annual zeros');
 const emptyRow=structuredClone(empty.plan.timeRows[key]);emptyRow.schoolMinutes[0]=123;emptyRow.annualAplMinutes[0]=45;
 const populated=await command(tx,request(empty.plan,'save_row',{rowKey:key,row:emptyRow}));
 const sourceRow=(await tx`select * from public.timplans where id=${empty.reply.id}`)[0],modified=structuredClone(sourceRow.gym_basis);
 const dist=modified.distribution.find(d=>d.rowKey===key);assert.ok(dist.points[0]>0);dist.points[0]-=1;dist.points[1]+=1;
 const targetName='Syntetisk ändrad källa '+randomUUID().slice(0,8);
 const series=(await tx`insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(${sourceRow.organizer_id},${sourceRow.offering_id},${sourceRow.unit_id},${targetName},${targetName.toLowerCase()}) returning id`)[0].id;
 const target=(await tx`insert into public.timplans(organizer_id,offering_id,unit_id,series_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id) values(${sourceRow.organizer_id},${sourceRow.offering_id},${sourceRow.unit_id},${series},1,'utkast',${tx.json(sourceRow.basis)},${sourceRow.catalog_fetched},${tx.json(modified)},${sourceRow.source_programplan_id}) returning id`)[0].id;
 await tx`select public.phase5_named_timplan_copy_rows(${target},${tx.json(modified)},${empty.reply.id})`;
 const loss=await raw(tx,target);assert.equal(loss.timeCopyReview.length,1);const review=loss.timeCopyReview[0];assert.equal(review.sourcePlanId,empty.reply.id);assert.deepEqual(review.row,emptyRow);assert.equal(review.resolution,null);
 assert.ok(!('sourcePeriodId' in review));assert.equal((await tx`select count(*)::integer n from public.apl_plan_periods where plan_id=${target}`)[0].n,0);
 const resolveQ=request(loss,'resolve_copy_review',{reviewId:review.id,note:'Syntetisk granskning: bevarad tid planeras om uttryckligen.'});
 const resolved=await command(tx,resolveQ);assert.deepEqual({...resolved.plan.timeCopyReview[0],resolution:null},review);assert.equal(resolved.plan.timeCopyReview[0].resolution.actorId,f.id(11));
 const resolvedReplay=await command(tx,resolveQ);assert.equal(resolvedReplay.receipt.replayed,true);
 await aplDeny(tx,r.checks,'resolved copy review cannot be resolved again',t=>command(t,request(resolved.plan,'resolve_copy_review',{reviewId:review.id,note:'Ändrad'})),['40001']);
 record(r,'changed-source copy retains exact school/annual loss provenance; atomic reviewed resolution preserves source and replays');
 const completeTransition=await command(tx,transition(await basis(tx,f.complete.planId)));
 let full=await aplRead(tx,f.complete.planId);
 const confirmRequest=()=>({contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:full.detail.planId,expectedRevision:full.detail.revision,expectedContentHash:full.detail.contentHash,comment:'Syntetisk komplett års-APL granskad av rektor.'});
 const confirmQ=confirmRequest();
 await aplActor(tx,f,'hm');await aplDeny(tx,r.checks,'huvudman cannot confirm rector APL placement',t=>aplCommand(t,confirmQ),['42501']);await aplActor(tx,f,'principal');
 let confirmed=await aplCommand(tx,confirmQ);
 let decisionRaw=(await tx`select public.phase5_plan_decision_basis('timplan',${f.complete.planId}) value`)[0].value;
 let projected=await projectPlanDecision(decisionRaw,{kind:'timplan',planId:f.complete.planId},{identityId:f.id(11),assignmentId:f.roles.principal,organizerId:f.id(2),accessFunction:'rektor'});
 assert.equal(projected.apl.ready,true);assert.deepEqual(projected.blockers,[]);
 const changedRow=structuredClone(completeTransition.plan.timeRows[f.complete.rowKey]);changedRow.schoolMinutes[0]+=1;
 const changed=await command(tx,request({...completeTransition.plan,revision:confirmed.detail.revision},'save_row',{rowKey:f.complete.rowKey,row:changedRow}));
 decisionRaw=(await tx`select public.phase5_plan_decision_basis('timplan',${f.complete.planId}) value`)[0].value;assert.equal(decisionRaw.result.apl.ready,false);
 full=await aplRead(tx,f.complete.planId);assert.notEqual(full.detail.contentHash,confirmed.detail.contentHash);assert.deepEqual(full.detail.confirmations,confirmed.detail.confirmations);
 confirmed=await aplCommand(tx,confirmRequest());
 const dq=async action=>{const d=(await tx`select public.phase5_plan_decision_basis('timplan',${f.complete.planId}) value`)[0].value.result;return{kind:'timplan',planId:f.complete.planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)};};
 let submitQ=await dq('submit');const submitted=(await tx`select public.phase5_plan_decision_command(${tx.json(submitQ)}) value`)[0].value;
 await projectPlanDecision(submitted,submitQ,{identityId:f.id(11),assignmentId:f.roles.principal,organizerId:f.id(2),accessFunction:'rektor'},submitQ);
 const approval=await dq('approve');await aplDeny(tx,r.checks,'rektor cannot approve submitted V2 plan',t=>t`select public.phase5_plan_decision_command(${t.json(approval)})`,['42501']);
 await aplActor(tx,f,'hm');const approvalHm=await dq('approve'),approved=(await tx`select public.phase5_plan_decision_command(${tx.json(approvalHm)}) value`)[0].value;
 projected=await projectPlanDecision(approved,approvalHm,{identityId:f.id(10),assignmentId:f.roles.hm,organizerId:f.id(2),accessFunction:'huvudman'},approvalHm);assert.equal(projected.stage,'approved');
 await aplActor(tx,f,'principal');await aplDeny(tx,r.checks,'approved V2 plan rejects time changes',t=>command(t,request({...changed.plan,revision:approved.result.revision},'save_row',{rowKey:f.complete.rowKey,row:changedRow})),['42501']);
 record(r,'complete V2 15-week APL confirms by rektor then submits and approves by huvudman; minute edit invalidates old confirmation; actual Worker decision projection agrees');
 const latest=await aplRead(tx,f.planId);await aplDeny(tx,r.checks,'budget and preliminary period alone cannot confirm placement',t=>aplCommand(t,{contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:f.planId,expectedRevision:latest.detail.revision,expectedContentHash:latest.detail.contentHash,comment:'Syntetiskt'}),['40001']);
 const listCells=(await tx`select public.phase5_planning_year_gym_cells(${tx.json((await raw(tx,f.planId)).source)},${f.planId}) value`)[0].value;
 const selected={schoolform:'gymnasium',relativeYear:1,plan:{id:f.planId,version:1},source:{planId:f.programId,version:1},unitId:f.id(30),cells:listCells,classes:[],diagnostics:[],underlag:'known'};
 const metrics=(await tx`select public.phase5_planning_year_metrics(${tx.json(selected)}) value`)[0].value;
 const expectedMinutes=Object.values(saved.plan.timeRows).reduce((n,x)=>n+(x.schoolMinutes[0]??0)+(x.schoolMinutes[1]??0)+(x.annualAplMinutes[0]??0),0);
 assert.ok(Math.abs(Number(metrics.hours.known)-expectedMinutes/60)<1e-8);
 const summary=(await tx`select public.phase5_planning_year_totals(${tx.json({view:'timplan',schoolform:'gymnasium'})},${tx.json([selected,selected])}) value`)[0].value;assert.ok(Math.abs(Number(summary.annualHours.known)-expectedMinutes/60)<1e-8);
 record(r,'planning list and overview sum school plus annual APL once per selected year and deduplicate identical plan rows');
 for(const table of ['timplan_time_models','timplan_time_cells_v2','timplan_time_commands']){await aplDeny(tx,r.checks,'worker has no direct access to '+table,async t=>{await t`set local role skolplattform_worker`;await t.unsafe('select * from public.'+table);},['42501']);}
 await tx`set local role skolplattform_worker`;const wr=(await tx`select public.phase5_timplan_time_status(${tx.json({command:q})}) value`)[0].value;assert.equal(wr.state,'completed');await tx`reset role`;record(r,'actual Worker role can use only granted protected command/status entrypoints');
}
export async function verifyTimplanTime(out){
 const fd=openSync(out,'wx',0o600),report={kind:'timplan-time-v2-private-schema-only',status:'FAIL',startedAt:new Date().toISOString(),checks:[],races:[],limitations:['Synthetic mandates in actual PostgreSQL; HTTP/OIDC/browser separate','No active data or runtime changes']};let snapshot;
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();
 try{
 report.sources=sources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();const db=snapshot.db;
 const f=await db.begin(aplUxFixture),other=await (await snapshot.connect()).begin(preparatoryFixture);f.subhour=await db.begin(tx=>seedSubhour(tx,f));f.complete=await db.begin(async tx=>{await aplActor(tx,f,'principal');const d=await aplPreparedDraft(tx,f,'Syntetisk års-APL godkännande');await aplCommand(tx,aplSave(d));return d;});report.baseline={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};
 try{await db.begin(async tx=>{for(const p of timeMigrations)await tx.unsafe(readFileSync(resolve(root,p),'utf8'));const now=await allPublicHashes(tx);for(const k in report.baseline.rows)assert.deepEqual(now[k],report.baseline.rows[k]);throw rollback;});}catch(e){if(e!==rollback)throw e;}
 assert.equal(await schemaFingerprint(db),report.baseline.fingerprint);assert.deepEqual(await allPublicHashes(db),report.baseline.rows);report.migrationRollbackRestored=true;record(report,'both migrations roll back exact schema/ACL and every original row');
 await db.begin(async tx=>{for(const p of timeMigrations)await tx.unsafe(readFileSync(resolve(root,p),'utf8'));});
 report.installed={fingerprint:await schemaFingerprint(db),structure:await schemaFingerprint(db,true),rows:await allPublicHashes(db)};for(const k in report.baseline.rows)assert.deepEqual(report.installed.rows[k],report.baseline.rows[k]);report.originalRowsPreserved=true;record(report,'additive install preserves all original tables and receipt rows without backfill');save();
 const before=await allPublicHashes(db);try{await db.begin(async tx=>{await matrix(tx,report,f,other);await tx`set constraints all immediate`;record(report,'all deferred matrix constraints pass before rollback');throw rollback;});}catch(e){if(e!==rollback)throw e;}assert.deepEqual(await allPublicHashes(db),before);report.rollbackRestored=true;
 const committed=await db.begin(async tx=>{await aplActor(tx,f,'principal');const p=await raw(tx,f.planId);await tx`set local role skolplattform_worker`;return (await tx`select public.phase5_named_timplan_create(${tx.json({commandId:randomUUID(),sourcePlanId:p.source.planId,expectedSourceRevision:p.source.revision,expectedEducationRevision:p.source.educationRevision,unitId:p.unitId,name:'Syntetisk verifierad commit',copyFromPlanId:null,expectedCopyFromRevision:null})}) value`)[0].value;});
 const committedRead=await db.begin(async tx=>{await aplActor(tx,f,'principal');return raw(tx,committed.reply.id);});assert.deepEqual(committedRead.timeRows,committed.plan.timeRows);assert.equal(committedRead.timeModel,'school_terms_annual_apl_v2');record(report,'actual Worker-role new V2 creation commits all deferred constraints and reads back exact minute matrix');
 await db.begin(async tx=>{const key=Object.keys(committed.plan.timeRows)[0];
  // Owner-only fault injection bypasses the immediate row guard to exercise the
  // independent deferred completeness invariant, including equal row counts.
  for(const mismatch of ['missing row','wrong key'])await aplDeny(tx,report.checks,'deferred V2 matrix rejects '+mismatch,async t=>{
   await t`alter table public.timplan_time_cells_v2 disable trigger timplan_time_cells_v2_guard`;
   if(mismatch==='missing row')await t`delete from public.timplan_time_cells_v2 where plan_id=${committed.reply.id} and row_key=${key}`;
   else await t`update public.timplan_time_cells_v2 set row_key='synthetic:unknown' where plan_id=${committed.reply.id} and row_key=${key}`;
   await t`set constraints all immediate`;
  },['22023']);
 });
 const b=await db.begin(async tx=>{await aplActor(tx,f,'principal');return basis(tx,f.planId);});const q=transition(b),rival={...q,commandId:randomUUID()};
 const race=await aplRace(snapshot,report,f,'simultaneous annual-model transitions','principal',t=>command(t,q),'admin',t=>command(t,rival));assert.equal(race.right.ok,false);assert.equal(race.right.error.code,'40001');report.concurrencyComplete=true;record(report,'observed concurrent transition: one commit, one stale rejection');
 const raceBudget=await db.begin(async tx=>{await aplActor(tx,f,'principal');const p=await raw(tx,f.planId),key=Object.keys(p.timeRows).find(k=>p.timeRows[k].schoolMinutes[0]!==null),row=structuredClone(p.timeRows[key]);row.annualAplMinutes[0]=3600;return{key,row,saved:await command(tx,request(p,'save_row',{rowKey:key,row}))};});
 const racePeriod={contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:f.planId,expectedRevision:raceBudget.saved.plan.revision,copyReviewResolutions:[],plan:{contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[{id:randomUUID(),name:'Syntetiskt samtidigt periodkommando',startsOn:null,endsOn:null,schoolYear:null,extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[{rowKey:raceBudget.key,description:'Syntetiskt'}],allocations:[{rowKey:raceBudget.key,termIndex:0,gutMinutes:2400}]}]}};
 const lowerRow={...raceBudget.row,annualAplMinutes:[1800,...raceBudget.row.annualAplMinutes.slice(1)]},lower=request(raceBudget.saved.plan,'save_row',{rowKey:raceBudget.key,row:lowerRow});
 const rowWins=await aplRace(snapshot,report,f,'annual row lower versus later period','principal',t=>command(t,lower),'admin',t=>t`select public.phase5_apl_plan_command(${t.json(racePeriod)})`);assert.equal(rowWins.right.ok,false);assert.equal(rowWins.right.error.code,'40001');
 const raised=await db.begin(async tx=>{await aplActor(tx,f,'principal');const p=await raw(tx,f.planId);assert.equal(p.timeRows[raceBudget.key].annualAplMinutes[0],1800);assert.equal((await tx`select count(*)::int n from public.apl_plan_periods where plan_id=${f.planId}`)[0].n,0);return command(tx,request(p,'save_row',{rowKey:raceBudget.key,row:raceBudget.row}));});
 const periodFirst={...racePeriod,commandId:randomUUID(),expectedRevision:raised.plan.revision},rowSecond=request(raised.plan,'save_row',{rowKey:raceBudget.key,row:lowerRow});
 const periodWins=await aplRace(snapshot,report,f,'period allocation versus annual row lower','principal',t=>t`select public.phase5_apl_plan_command(${t.json(periodFirst)})`,'admin',t=>command(t,rowSecond));assert.equal(periodWins.right.ok,false);assert.equal(periodWins.right.error.code,'40001');
 await db.begin(async tx=>{await aplActor(tx,f,'principal');const p=await raw(tx,f.planId);assert.equal(p.timeRows[raceBudget.key].annualAplMinutes[0],3600);assert.equal((await tx`select sum(gut_minutes)::int n from public.apl_time_allocations where plan_id=${f.planId}`)[0].n,2400);});
 record(report,'two observed crossed row/period lock races preserve winning budget or allocation and reject stale loser');
 report.finalStructure=await schemaFingerprint(db,true);report.finalFingerprint=await schemaFingerprint(db);assert.equal(report.finalFingerprint,report.installed.fingerprint);
 }catch(error){report.failure={name:error.name,code:error.code,message:error.message,hint:error.hint,where:error.where,position:error.position,stack:error.stack};}
 finally{try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(e){report.sourceFailure={message:e.message};}try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(e){report.cleanupFailure={message:e.message};}if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.originalRowsPreserved&&report.rollbackRestored&&report.concurrencyComplete)report.status='PASS';report.completedAt=new Date().toISOString();save();closeSync(fd);}
 console.log(report.status+': '+report.checks.length+' annual time checks; '+out);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if((await verifyTimplanTime(privateOutput(process.argv.slice(2)))).status!=='PASS')process.exitCode=1;}
