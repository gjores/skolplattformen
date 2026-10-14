#!/usr/bin/env node
// Local synthetic probes in one rollback transaction. Never resets or cleans
// production graphs. Reports contain hashes/IDs/counts, never session secrets.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {classFixture} from './verify-class-timplans.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('atomic_copy_rollback');
export const migrationName='20261014100000_phase5_atomic_cohort_copy.sql';
export const grantName='20261014101000_phase5_worker_atomic_cohort_copy.sql';
export const signature='public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)';
export const sourcePaths=['supabase/migrations/'+migrationName,'supabase/migrations/'+grantName,
 'supabase/tests/phase5_atomic_cohort_copy.test.sql','work/pilot/verify-atomic-cohort-copy.mjs',
 'work/pilot/verify-class-timplans.mjs','work/pilot/verify-plan-decision-flow.mjs',
 'supabase/tests/phase5_programplan_drafts.test.sql'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
export function privateOutput(args){assert.equal(args.length,2,'REFUSED: use --out /private/tmp/name.json');assert.equal(args[0],'--out');const out=resolve(args[1]);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'),'REFUSED: private JSON report required');return out;}
export async function allPublicHashes(db){const tables=(await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename);return decisionBusinessHashes(db,tables);}
export async function copyCommand(tx,q,statusOnly=false){return(await tx`select public.phase5_copy_programplan_education(${q.commandId},${q.sourcePlanId},${q.expectedSourceRevision},${q.expectedEducationRevision},${q.unitId},${q.name},${q.localCode},${q.cohort},${tx.json(q.basisReference)},${statusOnly}) result`)[0].result;}
async function scenarios(tx,checks){
 const f=await classFixture(tx),{id,actor}=f;await actor('hm');
 const ok=name=>checks.push({name,ok:true});
 const deny=async(name,q,codes,status=false)=>{let error;try{await tx.savepoint(s=>copyCommand(s,q,status));}catch(e){error=e;}assert.ok(error,name);assert.ok(codes.includes(error.code),`${name}: ${error.code}`);ok(name);};
 const [source]=await tx`select * from public.point_plans where id=${id(50)}`;
 const sourceReference=source.basis_reference;
 const later=`${Number(sourceReference.startedOn.slice(0,4))+1}-08-17`;
 const request={commandId:randomUUID(),sourcePlanId:id(50),expectedSourceRevision:0,expectedEducationRevision:0,
  unitId:id(30),name:'Syntetisk atomär kopia',localCode:null,cohort:'Senare syntetisk kull',basisReference:{...sourceReference,startedOn:later}};
 const ownSnapshot=async()=>({source:(await tx`select to_jsonb(p) value from public.point_plans p where id=${id(50)}`)[0].value,
  education:(await tx`select to_jsonb(o) value from public.offerings o where id=${id(40)}`)[0].value,
  links:await tx`select to_jsonb(u) value from public.offering_units u where offering_id=${id(40)} order by unit_id`});
 const packageBefore=await decisionBusinessHashes(tx,['programplan_packages']);
 const single=await copyCommand(tx,request);assert.equal((await tx`select count(*)::integer n from public.offering_units where offering_id=${single.education.id}`)[0].n,1);assert.deepEqual((await tx`select term_distribution from public.point_plans where id=${single.plan.id}`)[0].term_distribution,[]);ok('one-school empty-term copy creates complete draft');
 const schoolRequest={...request,commandId:randomUUID(),name:'Syntetisk fler skolor',expectedSourceRevision:1,expectedEducationRevision:1};
 const terms=[{rowKey:'specialization:ENGE:1:ENGE3000X',points:[0,0,0,0,0,100]}];
 await tx`select public.phase5_write_programplan_terms(${id(50)},0,${tx.json(terms)})`;
 await tx`select public.phase5_change_programplan_education(${id(40)},0,'units',${tx.json({unitIds:[id(30),id(31)]})})`;
 const frozenSource=await ownSnapshot();
 const created=await copyCommand(tx,schoolRequest);assert.equal(created.plan.revision,0);assert.equal(created.plan.version,1);assert.equal(created.plan.status,'utkast');ok('immutable creation snapshot remains revision zero version one draft');
 const destination=created.education.id,planId=created.plan.id;
 const [plan]=await tx`select * from public.point_plans where id=${planId}`;
 assert.equal(plan.revision,1);assert.deepEqual(plan.term_distribution,terms);assert.deepEqual(plan.basis_reference,schoolRequest.basisReference);assert.equal(plan.decided_on,null);assert.equal(plan.decided_by,null);ok('committed copy has exact frame and six-term allocation at revision one without decision');
 assert.deepEqual((await tx`select unit_id from public.offering_units where offering_id=${destination} order by unit_id`).map(r=>r.unit_id),[id(30),id(31)]);ok('all authorized source schools copied');
 const [receipt]=await tx`select request,initial_result from public.programplan_education_receipts where command_id=${schoolRequest.commandId}`;
 assert.deepEqual(receipt.request,schoolRequest);assert.deepEqual(receipt.initial_result,created);ok('receipt freezes exact full source and target request and immutable initial result');
 for(const table of ['school_classes','pupil_placements','timplans','programplan_unit_packages'])assert.equal((await tx.unsafe(`select count(*)::integer n from public.${table} where offering_id=$1`,[destination]))[0].n,0);
 for(const table of ['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'])assert.equal((await tx.unsafe(`select count(*)::integer n from public.${table} where plan_id=$1`,[planId]))[0].n,0);assert.deepEqual(await decisionBusinessHashes(tx,['programplan_packages']),packageBefore);ok('no class pupil timetable package or former decision copies');
 assert.deepEqual(await ownSnapshot(),frozenSource);ok('source complete rows timestamps and school links unchanged');
 const graphTables=['offerings','offering_units','point_plans','point_plan_events','programplan_education_receipts','organisation_events'];
 let before=await decisionBusinessHashes(tx,graphTables);
 const replay=await copyCommand(tx,schoolRequest);assert.equal(replay.replayed,true);assert.equal(replay.plan.id,planId);assert.deepEqual(await decisionBusinessHashes(tx,graphTables),before);ok('identical replay never writes graph or history');
 const status=await copyCommand(tx,schoolRequest,true);assert.equal(status.status,'created');assert.equal(status.plan.id,planId);assert.equal('replayed' in status,false);assert.deepEqual(await decisionBusinessHashes(tx,graphTables),before);ok('created status reads same full-request receipt only');
 const unknown={...schoolRequest,commandId:randomUUID(),expectedSourceRevision:900,expectedEducationRevision:900};
 assert.deepEqual(await copyCommand(tx,unknown,true),{commandId:unknown.commandId,status:'not_found'});assert.deepEqual(await decisionBusinessHashes(tx,graphTables),before);ok('not-found status performs no create and no CAS');
 for(const [label,change]of [['name',{name:'OTHER'}],['source',{sourcePlanId:id(51)}],['revision',{expectedSourceRevision:900}],['education revision',{expectedEducationRevision:900}],['cohort',{cohort:'OTHER'}]])await deny('receipt conflict '+label,{...schoolRequest,...change},['40001'],true);
 await deny('stale source revision',{...schoolRequest,commandId:randomUUID(),expectedSourceRevision:0},['40001']);
 await deny('stale education revision',{...schoolRequest,commandId:randomUUID(),expectedEducationRevision:0},['40001']);
 await deny('wrong target primary school',{...schoolRequest,commandId:randomUUID(),unitId:id(31)},['22023']);
 await deny('different catalog program content',{...schoolRequest,commandId:randomUUID(),basisReference:{...schoolRequest.basisReference,specializationRefs:[]}},['40001']);
 await deny('same source cohort start',{...schoolRequest,commandId:randomUUID(),basisReference:sourceReference},['22023']);
 await deny('past cohort start',{...schoolRequest,commandId:randomUUID(),basisReference:{...schoolRequest.basisReference,startedOn:'2020-08-17'}},['22023']);
 await deny('malformed date',{...schoolRequest,commandId:randomUUID(),basisReference:{...schoolRequest.basisReference,startedOn:'2029-02-30'}},['22023']);
 await deny('unbound source',{...schoolRequest,commandId:randomUUID(),sourcePlanId:id(51),expectedSourceRevision:0,expectedEducationRevision:0},['22023']);
 assert.deepEqual(await decisionBusinessHashes(tx,graphTables),before);ok('all malformed conflict requests preserve full graph and history');
 for(const role of ['principal','admin']){await actor(role);await deny(role+' cannot copy',schoolRequest,['42501']);await deny(role+' cannot read copy status',schoolRequest,['42501'],true);}await actor('hm');
 for(const stage of ['terms','schools','audit']){
  const failed={...schoolRequest,commandId:randomUUID(),name:'Syntetiskt fel '+stage};
  const relation=stage==='terms'?'point_plans':stage==='schools'?'offering_units':'security_events';
  const condition=stage==='terms'?`new.offering_id<>'${id(40)}' and new.term_distribution<>'[]'::jsonb`:stage==='schools'?`new.offering_id<>'${id(40)}' and new.unit_id='${id(31)}'`:`new.customer_id='${id(1)}' and new.action='programplan_education_copied'`;
  await tx.unsafe(`create or replace function pg_temp.fail_atomic_copy() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'synthetic_atomic_copy_failure' using errcode='55000';end if;return new;end$$;create trigger fail_atomic_copy before ${stage==='terms'?'update':'insert'} on public.${relation} for each row execute function pg_temp.fail_atomic_copy();`);
  const fullBefore=await allPublicHashes(tx);await deny(stage+' failure aborts entire copy',failed,['55000']);assert.deepEqual(await allPublicHashes(tx),fullBefore);ok(stage+' failure preserves all business audit identity rows');await tx.unsafe(`drop trigger fail_atomic_copy on public.${relation}`);
 }
 await tx`select public.phase5_write_programplan_terms(${id(50)},1,'[]'::jsonb)`;
 before=await decisionBusinessHashes(tx,graphTables);assert.equal((await copyCommand(tx,schoolRequest,true)).status,'created');assert.equal((await copyCommand(tx,schoolRequest)).replayed,true);assert.deepEqual(await decisionBusinessHashes(tx,graphTables),before);ok('source edits after success do not break immutable replay or status');
 const empty={...schoolRequest,commandId:randomUUID(),name:'Syntetisk tom termin',expectedSourceRevision:2};const emptyCopy=await copyCommand(tx,empty);assert.deepEqual((await tx`select term_distribution from public.point_plans where id=${emptyCopy.plan.id}`)[0].term_distribution,[]);ok('empty distribution copies completely');
 await tx`select public.phase5_change_programplan_education(${id(40)},1,'archive','{}'::jsonb)`;
 assert.equal((await copyCommand(tx,schoolRequest,true)).status,'created');ok('archive after commit preserves authorized status confirmation');await deny('new copy from archived source',{...empty,commandId:randomUUID(),expectedEducationRevision:2},['42501']);
 await tx`delete from public.mandate_units where assignment_id=${id(60)} and unit_id=${id(31)}`;
 await deny('lost secondary school mandate cannot replay',schoolRequest,['42501']);await deny('lost secondary school mandate cannot read status',schoolRequest,['42501'],true);ok('cached receipt retains full current school mandate enforcement');
}
export async function runAtomicCopy(out){
 const sources=sourceHashes(),target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const checks=[];let before,after,beforeFingerprint,afterFingerprint,failure;
 try{
  before=await allPublicHashes(db);beforeFingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${migrationName.slice(0,14)}`).length,0,'REFUSED: migration already applied');
   await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8'));
   await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_atomic_cohort_copy.test.sql'),'utf8'));
   assert.equal((await tx`select has_function_privilege('skolplattform_worker',to_regprocedure(${signature}),'execute') granted`)[0].granted,false);checks.push({name:'exact entrypoint foundation and helper client grants remain closed',ok:true});
   assert.deepEqual(await allPublicHashes(tx),before);checks.push({name:'foundation preserves all existing public table rows including audit identities',ok:true});
   await scenarios(tx,checks);assert.deepEqual(sourceHashes(),sources);throw rollback;
  });}catch(e){if(e!==rollback)failure=e;}
  after=await allPublicHashes(db);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);assert.equal(afterFingerprint,beforeFingerprint);checks.push({name:'all public rows full DDL ACL and migration journal rolled back exactly',ok:true});
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const finalSourceHashes=sourceHashes();if(JSON.stringify(sources)!==JSON.stringify(finalSourceHashes))failure=Error('Source changed');
 const report={kind:'atomic-cohort-copy-rollback',target:'protected',status:failure?'FAIL':'PASS',rollback:true,databaseClosed:true,
  sourceHashes:sources,finalSourceHashes,beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,checks,
  failure:failure?{code:failure.code,message:failure.message,stack:failure.stack}:null};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: ${checks.length} atomic copy SQL checks`);if(failure)process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runAtomicCopy(privateOutput(process.argv.slice(2)));
