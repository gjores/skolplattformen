#!/usr/bin/env node
// Actual local PostgreSQL, synthetic rows, no persistent apply or role grants.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {setupClassCohortDatesFixture,classCohortDateSourceHashes} from './verify-class-cohort-dates.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migration='supabase/migrations/20261015101000_class_cohort_link_identity.sql';
const test='supabase/tests/phase5_class_cohort_link_identity.test.sql';
export function classCohortLinkSourceHashes(){
 return {...classCohortDateSourceHashes(),...Object.fromEntries([migration,test,'work/pilot/verify-class-cohort-link-identity.mjs','web/lib/cohort-store.ts','web/package.json','web/package-lock.json'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
}
// A second approved offering in the SAME school is essential: a separate
// customer/school would never exercise the preserved historical name/year PK.
async function secondCohort(tx,f){
 const [p]=await tx`select * from public.point_plans where id=${f.programId}`;
 const reference={...p.basis_reference,startedOn:`${f.year+1}-08-17`},offeringId=randomUUID();
 await f.actor('hm');
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
 values(${offeringId},${f.id(2)},${f.id(30)},'gymnasium','Syntetisk andra klasskull','Syntetisk',${reference.programRef.code},${reference.orientationCode},${f.year+1})`;
 const plan=(await tx`select public.phase5_create_programplan_draft(${offeringId},0,${tx.json(reference)}) r`)[0].r;
 await f.actor('principal');await tx`select public.phase5_write_programplan_terms(${plan.id},0,${tx.json(p.term_distribution)})`;
 await f.decision('programplan',plan.id,'submit');await f.actor('hm');await f.decision('programplan',plan.id,'approve');
 const [{revision}]=await tx`select revision from public.point_plans where id=${plan.id}`;
 await f.actor('principal');
 const gym=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${plan.id},${revision},0,${f.id(30)},null,null) r`)[0].r;
 let gymRevision=0;
 for(const term of p.term_distribution)gymRevision=(await tx`select public.phase5_write_gym_timplan_row(${gym.reply.id},${gymRevision},${term.rowKey},${tx.json(term.points.map(n=>n>0?n:null))}) r`)[0].r.revision;
 await f.decision('timplan',gym.reply.id,'submit');await f.actor('hm');await f.decision('timplan',gym.reply.id,'approve');await f.actor('principal');
 return{offeringId,planId:gym.reply.id,programId:plan.id,year:f.year+1};
}
export async function verifyClassCohortLinks(out){
 const output=resolve(out);assert.ok(output.startsWith('/private/tmp/')&&output.endsWith('.json'),'Private --out required');assert.ok(!existsSync(output),'Output exists; choose new private path');
 const target=await assertTarget('protected');const sources=classCohortLinkSourceHashes();
 const db=createRequire(resolve(root,'web/package.json'))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const rollback=Error('expected_link_identity_rollback');let before,after,fingerprint,afterFingerprint,failure,checks=[],passed=false;
 try{
  before=await allPublicHashes(db);fingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin('isolation level read committed',async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>='20261015100000'`).length,0,'Package already applied; use applied verifier');
   const f=await setupClassCohortDatesFixture(tx);
   // Legacy link and its receipt predate both new migrations.
   const [{revision}]=await tx`select revision from public.timplans where id=${f.planId}`;
   const [ctx]=await tx`select value from cohort_context`;
   const priorRequest={operation:'link',commandId:randomUUID(),classId:ctx.value.legacyClassId,schoolYear:f.year,planId:f.planId,expectedPlanRevision:revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
   const priorReply=(await tx`select public.phase5_class_command(${tx.json(priorRequest)}) r`)[0].r;
   await tx`update cohort_context set value=value||${tx.json({priorRequest,priorReply})}`;
   // Historical inconsistent class-year rows must not make a named legacy link
   // look unambiguously adopted. Seed before02, never bypass its triggers.
   for(const year of [f.year,f.year+1])await tx`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year)
    values(${f.id(1)},${f.id(2)},${f.id(30)},${f.id(46)},'AMBIGUOUS',${year})`;
   await tx.unsafe(readFileSync(resolve(root,'supabase/migrations/20261015100000_class_cohort_dates.sql'),'utf8'));
   const before03=await allPublicHashes(tx);
   const relationProtection=async()=>({
    tables:await tx`select c.relname,c.relacl::text acl,c.relowner,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.oid in ('public.class_timplans'::regclass,'public.school_classes'::regclass) order by c.relname`,
    constraints:await tx`select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in ('public.class_timplans'::regclass,'public.school_classes'::regclass) order by 1,2`,
    policies:await tx`select * from pg_policies where schemaname='public' and tablename in ('class_timplans','school_classes') order by tablename,policyname`
   });
   const protectionsBefore=await relationProtection();
   const aclBefore=await tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner from pg_proc p where p.oid in ('public.phase5_class_underlag(uuid,integer)'::regprocedure,'public.phase5_class_command(jsonb)'::regprocedure,'public.validate_class_timplan()'::regprocedure) order by 1`;
   await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
   assert.deepEqual(await allPublicHashes(tx),before03);
   assert.deepEqual(await relationProtection(),protectionsBefore);
   checks.push({name:'legacy primary key class uniqueness table ACL owners and RLS policies remain exact',ok:true});
   assert.deepEqual(await tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner from pg_proc p where p.oid in ('public.phase5_class_underlag(uuid,integer)'::regprocedure,'public.phase5_class_command(jsonb)'::regprocedure,'public.validate_class_timplan()'::regprocedure) order by 1`,aclBefore);
   checks.push({name:'03 migration changes no stored rows or existing function ACL/owners',ok:true});
   await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_class_cohort_dates.test.sql'),'utf8'));
   checks.push(...(await tx`select name from cohort_checks order by name`).map(r=>({name:'02 regression: '+r.name,ok:true})));
   const second=await secondCohort(tx,f);
   await tx`update cohort_context set value=value||${tx.json({second,year:f.year})}`;
   await tx.unsafe(readFileSync(resolve(root,test),'utf8'));
   checks.push(...(await tx`select name from link_identity_checks order by name`).map(r=>({name:r.name,ok:true})));
   passed=true;throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
 }catch(e){failure={code:e.code,message:e.message,where:e.where,hint:e.hint};}
 finally{
  try{after=await allPublicHashes(db);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);assert.equal(afterFingerprint,fingerprint);assert.deepEqual(classCohortLinkSourceHashes(),sources);}
  catch(e){failure={...failure,verificationFailure:e.message};}await db.end();
 }
 const report={kind:'class-cohort-link-identity-rollback',status:passed&&!failure?'PASS':'FAIL',target:'protected',stage:'03',sources,before,after,fingerprint,afterFingerprint,checks,
  rollbackRestored:JSON.stringify(before)===JSON.stringify(after)&&fingerprint===afterFingerprint,
  limitations:['No persistent apply','No two-session concurrency claim until plan08','Legacy row format uses own migration-role fixture; protected demo client access remains denied','Closed-end overlap tested using actual private predicate; stored classes have immutable open end'],failure};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: ${checks.length} class link checks; rollback=${report.rollbackRestored}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Use --out /private/tmp/name.json');assert.equal(process.argv[2],'--out');
 const report=await verifyClassCohortLinks(process.argv[3]);if(report.status!=='PASS')process.exitCode=1;
}
