#!/usr/bin/env node
// CLASS-COHORT-02: synthetic setup and rollback-only current PostgreSQL proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {approvedClassFixture,sourceHashes as classTimplanSourceHashes} from './verify-class-timplans.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migration='supabase/migrations/20261015100000_class_cohort_dates.sql';
const test='supabase/tests/phase5_class_cohort_dates.test.sql';
// Bind the fixture source, pinned catalogue and local import closure as well as
// product/test files. Imported helper changes invalidate a previous report.
export function classCohortDateSourceHashes(){
 const paths=new Set([migration,test,'work/pilot/verify-class-cohort-dates.mjs',
  'supabase/tests/phase5_programplan_drafts.test.sql','web/lib/programplan-catalog.generated.json',
  ...Object.keys(classTimplanSourceHashes())]);
 const visit=path=>{
  const source=readFileSync(resolve(root,path),'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/gu)){
   const absolute=resolve(resolve(root,path),'..',match[1]);
   if(absolute.startsWith(root)&&existsSync(absolute)){
    const relative=absolute.slice(root.length);if(!paths.has(relative)){paths.add(relative);visit(relative);}
   }
  }
 };
 for(const path of [...paths])if(/\.(?:mjs|ts|tsx)$/u.test(path))visit(path);
 return Object.fromEntries([...paths].sort().map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
}
export async function setupClassCohortDatesFixture(tx){
 const f=await approvedClassFixture(tx,'SA25'),{id,actor}=f;
 const [p]=await tx`select * from public.point_plans where id=${f.programId}`;const startedOn=p.basis_reference.startedOn;
 await actor('hm');await tx`update public.offerings set start_year=${Number(startedOn.slice(0,4))} where id=${id(46)}`;
 // Seed a separate early draft and legacy class before the new invariant exists.
 await tx`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',${tx.json(startedOn)}),revision=revision+1 where id=${id(50)}`;
 await tx`update public.offerings set start_year=${Number(startedOn.slice(0,4))} where id=${id(40)}`;
 await tx`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${id(1)},${id(2)},${id(30)},${id(40)},'DRAFT-LEGACY',${f.year})`;
 await tx`insert into public.offering_units(offering_id,organizer_id,unit_id) values(${id(46)},${id(2)},${id(31)})`;
 await tx`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${id(1)},${id(2)},${id(31)},${id(46)},'SECONDARY',${f.year})`;
 for(const[n,kind]of [[47,'grundskola'],[48,'introduktionsprogram']])await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values(${id(n)},${id(2)},${id(30)},${kind},${'Syntetisk '+kind},'Syntetisk')`;
 await actor('principal');const [t]=await tx`select revision from public.timplans where id=${f.planId}`;
 const legacyRequest={operation:'create',commandId:randomUUID(),planId:f.planId,expectedPlanRevision:t.revision,name:'LEGACY',startYear:f.year};
 const legacyReply=(await tx`select public.phase5_class_command(${tx.json(legacyRequest)}) r`)[0].r;
 await tx`create temporary table cohort_context(value jsonb) on commit drop`;
 await tx`insert into cohort_context values(${tx.json({startedOn,offeringId:id(46),programId:f.programId,planId:f.planId,draftPlanId:id(50),extraUnitId:id(31),grundId:id(47),imId:id(48),legacyClassId:legacyReply.id,legacyRequest,legacyReply})})`;

 await actor('hm');
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(${id(49)},${id(2)},${id(30)},'gymnasium','Syntetisk äldre okänt kalenderår','Syntetisk äldre',${p.basis_reference.programRef.code},${p.basis_reference.orientationCode})`;
 const nullCalendarPlan=(await tx`select public.phase5_create_programplan_draft(${id(49)},0,${tx.json(p.basis_reference)}) result`)[0].result;
 await actor('principal');await tx`select public.phase5_write_programplan_terms(${nullCalendarPlan.id},0,${tx.json(p.term_distribution)})`;
 await f.decision('programplan',nullCalendarPlan.id,'submit');await actor('hm');await f.decision('programplan',nullCalendarPlan.id,'approve');
 await tx`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${id(1)},${id(2)},${id(30)},${id(49)},'NULL-CALENDAR-LEGACY',${f.year})`;
 await tx`update cohort_context set value=value||${tx.json({nullCalendarPlanId:nullCalendarPlan.id,nullCalendarOfferingId:id(49)})}`;
 await tx.unsafe(`create function pg_temp.cohort_actor(name text) returns void language plpgsql as $$begin
 perform set_config('app.identity_id',case name when 'hm' then '${id(10)}' when 'admin' then '${id(13)}' else '${id(11)}' end,true);
 perform set_config('app.membership_id',case name when 'hm' then '${id(20)}' when 'admin' then '${id(23)}' else '${id(21)}' end,true);
 perform set_config('app.session_id',case name when 'hm' then '${id(80)}' when 'admin' then '${id(83)}' else '${id(81)}' end,true);
 perform set_config('app.assignment_id',(select r.id::text from programplan_roles r where r.name=cohort_actor.name),true);end$$;`);
 await actor('principal');return f;
}

export async function verifyClassCohortDates(out){
 assert.ok(resolve(out).startsWith('/private/tmp/')&&out.endsWith('.json'),'Private --out /private/tmp/name.json required');
 assert.ok(!existsSync(resolve(out)),'Output already exists; use a new private report path');
 const target=await assertTarget('protected');
 const db=createRequire(resolve(root,'web/package.json'))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const rollback=Error('expected_class_cohort_rollback'),sources=classCohortDateSourceHashes();
 let passed=false,failure,checks=[],before,fingerprint,after,afterFingerprint,defaultIsolation;
 try{
  before=await allPublicHashes(db);fingerprint=await vocationalDatabaseFingerprint(db);
  defaultIsolation=(await db`show default_transaction_isolation`)[0].default_transaction_isolation;
  try{await db.begin('isolation level read committed',async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261015100000'`).length,0,'Migration already installed; use applied verifier');
   await setupClassCohortDatesFixture(tx);
   const oldClasses=await tx`select to_jsonb(c) r from public.school_classes c order by id`;
   const oldMemberships=await tx`select to_jsonb(m) r from public.pupil_class_memberships m order by id`;
   await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
   assert.deepEqual(await tx`select to_jsonb(c)-'starts_on'-'ends_on'-'validity_source'-'created_at'-'updated_at' r from public.school_classes c order by id`,oldClasses);
   assert.deepEqual(await tx`select to_jsonb(m) r from public.pupil_class_memberships m order by id`,oldMemberships);
   await tx.unsafe(readFileSync(resolve(root,test),'utf8'));
   checks=(await tx`select name from cohort_checks order by name`).map(r=>({name:r.name,ok:true}));
   checks.push({name:'migration preserves every original class column and complete membership row',ok:true});
   passed=true;throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
  // Isolation probes use fresh own fixtures. They prove fail-closed entry, not
  // concurrent sessions; real overlap remains a separate plan08 requirement.
  for(const isolation of ['repeatable read','serializable']){
   try{await db.begin('isolation level '+isolation,async tx=>{
    await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
    const f=await setupClassCohortDatesFixture(tx);
    await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
    const deny=async(label,fn)=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}
     assert.equal(error?.code,'40001',label);assert.equal(error?.hint,'class_cohort_start_locked',label);checks.push({name:isolation+': '+label,ok:true});};
    await deny('offering start rejects stale snapshot',s=>s`update public.offerings set start_year=start_year+1 where id=${f.id(46)}`);
    await deny('point plan start rejects stale snapshot',s=>s`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb('2035-08-17'::text)),revision=revision+1 where id=${f.id(50)}`);
    await deny('class insert rejects stale snapshot',s=>s`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${f.id(1)},${f.id(2)},${f.id(30)},${f.id(46)},'ISOLATION',${f.year})`);
    throw rollback;
   });}catch(e){if(e!==rollback)throw e;}
  }
 }catch(e){failure={code:e.code,message:e.message,where:e.where,hint:e.hint,position:e.position};}
 finally{
  try{after=await allPublicHashes(db);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);assert.equal(afterFingerprint,fingerprint);assert.deepEqual(classCohortDateSourceHashes(),sources);}
  catch(e){failure={...failure,verificationFailure:e.message};}
  await db.end();
 }
 const report={kind:'class-cohort-dates-rollback',status:passed&&!failure?'PASS':'FAIL',stage:'02',target:'protected',defaultIsolation,
  rollbackRestored:JSON.stringify(before)===JSON.stringify(after)&&fingerprint===afterFingerprint,before,after,fingerprint,afterFingerprint,sources,checks,
  limitations:['No persistent apply','No two-session concurrency claim','Known class end uses actual private predicate and constraint probes; register mutations use stored open-ended classes'],failure};
 writeFileSync(resolve(out),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`${report.status}: ${checks.length} class cohort date checks; rollback=${report.rollbackRestored}`);
 if(failure)console.log(`Failure code: ${failure.code??'verification_failed'}; details in private report`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Use --out /private/tmp/name.json');assert.equal(process.argv[2],'--out');
 const r=await verifyClassCohortDates(process.argv[3]);if(r.status!=='PASS')process.exitCode=1;
}
