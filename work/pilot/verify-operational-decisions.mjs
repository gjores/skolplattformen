#!/usr/bin/env node
// One isolated transaction, synthetic rows only; DDL and all fixtures rolled back.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {decisionFixtureSource,decisionBusinessHashes,databaseFingerprint,protectedTables} from './verify-plan-decision-flow.mjs';
import {parsePlanDecisionInbox,parsePlanDecisionPage,defaultPlanDecisionQuery} from '../../web/lib/plan-decision.ts';
import {parsePlanningList,parsePlanningSetup} from '../../web/lib/planning-year-contract.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),ROLLBACK=Error('operational_decisions_rollback');
export const migrationName='20261012220000_plan_decision_search.sql';
const migration='supabase/migrations/'+migrationName;
export const sourcePaths=[migration,'work/pilot/verify-operational-decisions.mjs','web/lib/plan-decision.ts','web/lib/server/plan-decision.ts','web/lib/planning-year-contract.ts','work/pilot/apply-operational-decisions.mjs'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
const tables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
async function fixture(tx,prefix,foreign=false){
 const id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await tx.unsafe(decisionFixtureSource(prefix,foreign));
 const roles=Object.fromEntries((await tx.unsafe(`select name,id from ${foreign?'foreign_roles':'programplan_roles'}`)).map(r=>[r.name,r.id]));
 const actor=async name=>{const [identity,membership,session]={hm:[10,20,80],principal:[11,21,81],principal2:[12,22,82],admin:[13,23,83]}[name];
  for(const[k,v]of Object.entries({customer_id:id(1),organizer_id:id(2),identity_id:id(identity),membership_id:id(membership),session_id:id(session),assignment_id:roles[name],correlation_id:randomUUID()}))await tx`select set_config(${`app.${k}`},${v},true)`;
 };
 await actor('hm');await tx`insert into public.school_unit_types(unit_id,school_type) values(${id(30)},'GY'),(${id(31)},'GY')`;
 return{id,actor};
}
async function main(){
 const args=process.argv.slice(2);assert.ok(args.length===3&&args[0]==='--verify'&&args[1]==='--out');
 const out=resolve(args[2]);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));
 const sources=sourceHashes(),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const checks=[],timings=[];let before,after,beforeFingerprint,afterFingerprint,failure;
 const ok=(name)=>checks.push({name,ok:true});
 try{
  before=await decisionBusinessHashes(db,tables);beforeFingerprint=await databaseFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local statement_timeout='120s'`;await tx`set local lock_timeout='5s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   // The combined rollback proof needs the nullable class identity introduced by plan 01.
   // If its migration is not yet installed, use only the harmless column inside this rollback.
   if(!(await tx`select 1 from information_schema.columns where table_schema='public' and table_name='class_timplans' and column_name='class_id'`).length)await tx`alter table public.class_timplans add column class_id uuid`;
   const own=await fixture(tx,randomUUID().slice(0,8)),foreign=await fixture(tx,randomUUID().slice(0,8),true);const{id,actor}=own;
   await actor('principal');
   const oldDefinition=(await tx`select pg_get_functiondef('public.phase5_plan_decision_inbox()'::regprocedure) definition`)[0].definition;
   await tx.unsafe(oldDefinition.replace('public.phase5_plan_decision_inbox()', 'pg_temp.operational_previous_inbox()'));
   const oldInbox={};
   for(const role of ['hm','principal','principal2','admin']){await actor(role);const start=performance.now();oldInbox[role]=parsePlanDecisionInbox((await tx`select public.phase5_plan_decision_inbox() result`)[0].result);timings.push({role,version:'before',ms:performance.now()-start});}
   console.log('Applying migration inside rollback transaction; comparing original role routing.');
   await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
   for(const role of ['hm','principal','principal2','admin']){
    await actor(role);const start=performance.now();const current=parsePlanDecisionInbox((await tx`select public.phase5_plan_decision_inbox() result`)[0].result);timings.push({role,version:'after',ms:performance.now()-start});
    assert.deepEqual([...current.items].sort((a,b)=>a.planId.localeCompare(b.planId)),[...oldInbox[role].items].sort((a,b)=>a.planId.localeCompare(b.planId)));
    assert.equal(current.actionCount,oldInbox[role].actionCount);assert.equal(current.decisionCount,oldInbox[role].decisionCount);ok(role+' exact original detail routing parity');
    assert.ok(current.items.every(i=>!i.planId.startsWith(foreign.id(0).slice(0,8))));ok(role+' foreign customer excluded');
   }
   await actor('hm');
   const prefix=randomUUID().slice(0,8);
   await tx.unsafe(`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
    select ('${prefix}-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(2)}','${id(30)}','gymnasium','Syntetisk inkorg '||lpad(n::text,4,'0'),'Provkull','SA25','SABEP' from generate_series(1000,1519) n`);
   await tx.unsafe(`insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution)
    select ('${prefix}-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,p.organizer_id,
     ('${prefix}-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,p.specialization,p.catalog_id,p.basis_reference,p.term_distribution
    from generate_series(1000,1519) n cross join public.point_plans p where p.id='${id(50)}'`);
   await tx.unsafe(`insert into public.plan_decision_reviews(kind,plan_id,programplan_id,stage)
    select 'programplan',p.id,p.id,case when right(p.id::text,1) in ('0','1') then 'submitted' else 'returned' end from public.point_plans p
    where p.id::text like '${prefix}%' and right(p.id::text,1) in ('0','1','2','3')`);
   await actor('principal');let previousLarge;const largeBefore=performance.now();
   await tx`set local statement_timeout='10s'`;
   try{await tx.savepoint(async sub=>{previousLarge=parsePlanDecisionInbox((await sub`select pg_temp.operational_previous_inbox() result`)[0].result);});
    timings.push({role:'principal',rows:520,version:'before',ms:performance.now()-largeBefore});
   }catch(error){if(error.code!=='57014')throw error;timings.push({role:'principal',rows:520,version:'before',timedOut:true,timeoutMilliseconds:10000,elapsedMilliseconds:performance.now()-largeBefore});ok('old >500 baseline stopped at bounded timeout with savepoint rollback');}
   await tx`set local statement_timeout='30s'`;
   console.log('Comparing complete new 520-row lists for all three roles.');
   const read=async patch=>{const q={...defaultPlanDecisionQuery(),...patch};const result=(await tx`select public.phase5_plan_decision_page(${tx.json(q)}) result`)[0].result;return parsePlanDecisionPage(result,q);};
   for(const role of ['hm','principal','admin']){
    await actor(role);const start=performance.now();const all=parsePlanDecisionInbox((await tx`select public.phase5_plan_decision_inbox() result`)[0].result);timings.push({role,rows:520,version:'after',ms:performance.now()-start});
    if(role==='principal'&&previousLarge){assert.equal(all.actionCount,previousLarge.actionCount);assert.equal(all.decisionCount,previousLarge.decisionCount);assert.equal(all.total,previousLarge.total);ok('large original/new routing counter parity');}
    assert.equal(all.actionCount,oldInbox[role].actionCount+(role==='principal'?416:role==='hm'?104:0));ok(role+' 520-row action count independently derived from known stages');
    assert.ok(all.total>500);assert.equal(all.items.length,500);assert.equal(all.truncated,true);
    let waiting=false;for(const item of all.items){if(['blocked','waiting'].includes(item.task))waiting=true;else assert.equal(waiting,false,'own tasks must precede all waiting');}
    const finalPage=await read({page:Math.ceil(all.total/50)});assert.ok(finalPage.items.length);assert.equal(finalPage.total,all.total);assert.equal(finalPage.actionCount,all.actionCount);ok(role+' complete >500 list, own first, last page, global counts');
    const filtered=await read({query:'1519'});assert.equal(filtered.count,1);assert.equal(filtered.actionCount,all.actionCount);ok(role+' search beyond former cutoff retains global counts');
    for(const stage of ['submitted','returned']){const result=await read({stage});assert.ok(result.count>0);assert.ok(result.items.every(item=>item.stage===stage));ok(role+' '+stage+' filtered count and rows');}
    for(const tasks of ['mine','waiting']){const result=await read({tasks});assert.equal(result.count,tasks==='mine'?all.actionCount:all.total-all.actionCount);ok(role+' '+tasks+' exact count');}
    assert.equal((await read({query:'no matching synthetic value'})).count,0);ok(role+' empty search');
   }
   await actor('principal');const other=await read({query:'Syntetisk annan skola'});assert.equal(other.count,0);ok('own school cannot search existing other-school plan');
   await actor('principal');
   const setup=parsePlanningSetup((await tx`select public.phase5_planning_year_selection() result`)[0].result);
   const startYear=Number((await tx`select basis_reference->>'startedOn' started from public.point_plans where id=${id(50)}`)[0].started.slice(0,4));
   for(const[status,stage]of [['forslag','submitted'],['atersand','returned']]){
    const q={schoolYear:startYear,unitId:id(30),view:'programplan',schoolform:'gymnasium',query:'Syntetisk inkorg',status,cohortRelation:'all',archive:'active',grade:null,sort:'name',direction:'asc',page:1,selectionRevision:null};
    const result=(await tx`select public.phase5_planning_year_list(${tx.json(q)}) result`)[0].result;
    const parsed=parsePlanningList(result,q,setup);assert.equal(parsed.count,104);assert.equal(parsed.rows.length,50);assert.ok(parsed.rows.every(r=>r.plan.status==='utkast'&&r.plan.decisionStage===stage));ok('program list '+stage+' before paging and independent stored status');
   }
   for(const patch of [{page:0},{query:' padded '},{kind:null},{stage:'approved'},{tasks:'foreign'},{customerId:foreign.id(1)}]){
    let caught;try{await tx.savepoint(sub=>sub`select public.phase5_plan_decision_page(${sub.json({...defaultPlanDecisionQuery(),...patch})})`);}catch(e){caught=e;}assert.equal(caught?.code,'22023');ok('strict query '+JSON.stringify(patch));
   }
   const acl=await tx`select has_function_privilege('skolplattform_worker','public.phase5_plan_decision_page(jsonb)','execute') entry,
    has_function_privilege('skolplattform_worker','public.phase5_plan_decision_items()','execute') helper,
    has_function_privilege('authenticated','public.phase5_plan_decision_page(jsonb)','execute') client`;
   assert.deepEqual({...acl[0]},{entry:true,helper:false,client:false});ok('exact new entry grant, closed helper and browser SQL');
   throw ROLLBACK;
  });}catch(e){if(e!==ROLLBACK)failure=e;}
  after=await decisionBusinessHashes(db,tables);afterFingerprint=await databaseFingerprint(db);
  assert.deepEqual(after,before);ok('19 full original business tables preserved');assert.equal(afterFingerprint,beforeFingerprint);ok('DDL grants journal and policies rolled back');
 }finally{await db.end({timeout:5});}
 const finalSources=sourceHashes();assert.deepEqual(finalSources,sources);
 const report={kind:'operational-decisions-rollback',status:failure?'FAIL':'PASS',rollback:true,scope:'local-synthetic-only',checks,timings,sourceHashes:sources,finalSourceHashes:finalSources,beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,failure:failure?{code:failure.code??'ASSERTION',message:failure.message,stack:failure.stack}:null};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.status}: ${checks.length} decision search SQL/TS checks; rollback only.`);if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: decision search verifier preflight');process.exitCode=1;});
