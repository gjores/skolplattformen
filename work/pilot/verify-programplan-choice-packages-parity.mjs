#!/usr/bin/env node
// 05-23 D: actual TS/SQL selection parity using one synthetic rollback graph.
// No HTTP, grant, journal, reset, real pupils, or permanently persisted fixtures.
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { extractProgramplanFixture } from './verify-programplan-locks.mjs';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { validateProgramplanPackageEntries, programplanPackageLevels, programplanPackageKey, createLanguagePackage } from '../../web/lib/programplan-packages.ts';
import { canonicalCatalogJson } from '../../web/lib/programplan-catalog.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const TABLES=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','class_timplans','school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages'];
const SOURCES=['work/pilot/verify-programplan-choice-packages-parity.mjs','work/pilot/verify-programplan-locks.mjs','supabase/tests/phase5_programplan_drafts.test.sql','web/lib/programplan-packages.ts','web/lib/programplan-catalog.ts','web/lib/programplan-choice-blocks.ts','web/lib/programplan-terms.ts','web/lib/programplan-catalog.generated.json','supabase/migrations/20261004156000_phase5_programplan_packages.sql','supabase/migrations/20261004157000_phase5_worker_programplan_packages.sql'];
const equal=(a,b)=>canonicalCatalogJson(a)===canonicalCatalogJson(b);
const sha=value=>createHash('sha256').update(value).digest('hex');
const rollback=Error('EXPECTED_OUTER_ROLLBACK');
export async function runChoicePackageParity(outFile=resolve(root,'work/pilot/results/phase5-23-d-parity.json')){
 if(![resolve(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(outFile)))throw Error('REFUSED_unsafe_output');
 const manifest=await assertTarget('protected');
 const db=createRequire(resolve(root,'web/package.json'))('postgres')(manifest.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const prefix=randomUUID().slice(0,8),id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const report={kind:'phase5-programplan-choice-packages-parity',target:'protected',scope:'local-synthetic-only',status:'FAIL',cases:[],complete:false,rollback:false,reset:false,grantsChanged:false,startedAt:new Date().toISOString()};
 const hashes=async sql=>Object.fromEntries(await Promise.all(TABLES.map(async table=>{const[r]=await sql.unsafe(`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text collate "C"),'')) hash from public.${table} t`);return[table,r];})));
 const acl=()=>db`select p.proname,pg_get_function_identity_arguments(p.oid) signature,p.proacl::text acl,has_function_privilege('skolplattform_worker',p.oid,'execute') worker from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.proname,p.oid`;
 let beforeHashes,beforeAcl;
 try{
  beforeHashes=await hashes(db);beforeAcl=await acl();report.workerCountBefore=beforeAcl.filter(r=>r.worker).length;
  if(![19,21].includes(report.workerCountBefore))throw Error('REFUSED_worker_profile');
  const [definition]=await db`select pg_get_functiondef('public.phase5_programplan_validate_scoped_selection(jsonb,text,jsonb,uuid,uuid)'::regprocedure) value`;
  report.scopedDefinitionHash=sha(definition.value);
  try{await db.begin(async tx=>{
   // These are exact repository fixture statements, all inside this outer transaction.
   await tx.unsafe(extractProgramplanFixture(readFileSync(resolve(root,'supabase/tests/phase5_programplan_drafts.test.sql'),'utf8'),prefix));
   await tx`insert into public.school_unit_types(unit_id,school_type) values(${id(30)},'GY'),(${id(31)},'GY') on conflict do nothing`;
   await tx`select pg_temp.programplan_actor(${id(60)}::uuid,${id(20)}::uuid,${id(10)}::uuid,${id(80)}::uuid)`;
   const catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
   const [actual]=await tx`select payload from public.programplan_catalogs where catalog_id=${catalog.catalogId}`;
   const {catalogId,...payload}=catalog;if(!actual||!equal(actual.payload,payload))throw Error('REFUSED_catalog_source');
   const level=itemCode=>{const subject=catalog.subjects.find(s=>s.items.some(i=>i.code===itemCode));const item=subject?.items.find(i=>i.code===itemCode);if(!subject||!item)throw Error('fixture_level_missing');return{subjectCode:subject.code,subjectVersion:subject.version,itemCode:item.code,points:item.points};};
   const basis=(programCode='SA25',orientationCode='SABEP',extras=[])=>{const program=catalog.programs.find(p=>p.code===programCode);if(!program)throw Error('fixture_program_missing');return{catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode,startedOn:'2027-08-17',specializationRefs:[],choiceBlocks:[...defaultProgramplanChoiceBlocks(program,orientationCode),...extras]};};
   const save=async(kind,codes,unitId=id(30),packageId=null,expectedVersion=0)=>{const[row]=await tx`select public.phase5_save_programplan_package(${packageId}::uuid,${expectedVersion}::integer,${tx.json({unitId,kind,name:'Syntetiskt paritetspaket',levels:codes.map(level)})}::jsonb) value`;return row.value;};
   const first=await save('individualChoice',['ANIM1000X','ANIM2000X']);
   const second=await save('individualChoice',['BILD1B00X','IDRO2000X'],id(30),first.packageId,1);
   const single=await save('individualChoice',['ANIM1000X']);
   const foreign=await save('individualChoice',['ANIM1000X','ANIM2000X'],id(31));
   const global=await save('individualChoice',['ANIM1000X','ANIM2000X'],null);
   const nave=await save('naturalScience',['BIOG2000X']);
   const fixedNave=await save('naturalScience',['BIOG1000X']);
   const sprk=await save('languageSubject',['ENGE3000X','KLAS1000X','LATI2000X']);
   const fixedHu=await save('languageSubject',['LATI1000X','LATI2000X','LATI3000X']);
   const spec=await save('specialization',['ANIM1000X']);
   const excludedSpec=await save('specialization',['LATI1000X']);
   const fixedSv=await save('individualChoice',['SVEN1000X','SVEN2000X']);
   const fixedSva=await save('individualChoice',['SVEA1000X','SVEA2000X']);
   const fixedSelected=await save('individualChoice',['ENGE3000X','ANIM1000X']);
   const specs=[first,second,single,foreign,global,nave,fixedNave,sprk,fixedHu,spec,excludedSpec,fixedSv,fixedSva,fixedSelected];
   const entry=p=>({ref:{type:'package',packageId:p.packageId,version:p.version},distribution:[]});
   const specBasis=basis('SA25','SABEP',[{id:'pf1',kind:'specialization',points:100,name:'Valbar fördjupning'}]);
   const vectors=[];
   const add=(name,accept,p,reference=basis(),blockId='iv1',extra={})=>vectors.push({name,accept,reference,blockId,entries:[entry(p)],unitId:id(30),organizerId:id(2),packages:specs,...extra});
   add('individual-choice-valid',true,first);
   add('old-version-one-after-version-two',true,first);
   add('latest-version-two-exact',true,second);
   add('global-package-own-school',true,global);
   add('natural-science-valid',true,nave,basis('NA25','NANAA'),'nave');
   add('language-subject-valid',true,sprk,basis('HU25','HUSPK'),'sprk');
   add('specialization-valid',true,spec,specBasis,'pf1');
   add('other-school-unavailable',false,foreign);
   add('package-points-differ-from-block',false,single);
   add('wrong-kind-for-block',false,nave);
   add('generic-modern-language-forbidden',false,first,basis(),'mosp');
   add('latin-one-already-fixed-in-hu',false,fixedHu,basis('HU25','HUSPK'),'sprk');
   add('biology-one-already-fixed-in-na',false,fixedNave,basis('NA25','NANAA'),'nave');
   add('swedish-alternative-one-two-fixed',false,fixedSv);
   add('swedish-second-language-alternative-fixed',false,fixedSva);
   add('selected-specialization-level-already-fixed',false,fixedSelected,{...basis(),specializationRefs:[level('ENGE3000X')]});
   add('specialization-outside-program-options',false,excludedSpec,specBasis,'pf1');
   add('missing-exact-version-no-latest-fallback',false,first,basis(),'iv1',{entries:[{ref:{type:'package',packageId:first.packageId,version:999},distribution:[]}]});
   add('distribution-within-level',true,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[50,50,0,0,0,0]}]}]});
   add('distribution-unfinished-saveable',true,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[0,0,0,0,0,0]}]}]});
   add('distribution-outside-frame-saveable',true,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[0,0,0,0,0,100]}]}]});
   add('distribution-exceeds-level',false,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[101,0,0,0,0,0]}]}]});
   add('distribution-unknown-level',false,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM3000X',points:[0,0,0,0,0,0]}]}]});
   add('distribution-fractional-points',false,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[0.1,0,0,0,0,0]}]}]});
   add('distribution-duplicate-row',false,first,basis(),'iv1',{entries:[{...entry(first),distribution:[{levelKey:'ANIM:1:ANIM1000X',points:[0,0,0,0,0,0]},{levelKey:'ANIM:1:ANIM1000X',points:[0,0,0,0,0,0]}]}]});
   add('package-ref-extra-levels-denied',false,first,basis(),'iv1',{entries:[{ref:{...entry(first).ref,levels:first.levels},distribution:[]}]});
   add('package-another-catalogue',false,first,basis(),'iv1',{patchPackage:{packageId:first.packageId,version:1,catalogId:'sha256:'+'0'.repeat(64)},packages:specs.map(p=>p===first?{...p,catalogId:'sha256:'+'0'.repeat(64)}:p)});
   for(const field of ['startDate','endDate','canceledDate']){
    const alternate=structuredClone(catalog);alternate.subjects.find(s=>s.code==='ANIM')[field]=field==='startDate'?'2028-08-17':field==='endDate'?'2026-08-17':'2027-08-17';
    add(`package-subject-${field}-denied`,false,first,basis(),'iv1',{catalog:alternate,patchCatalog:alternate});
   }
   // Foreign organizer global package is not part of TS's organizer-scoped available list.
   await tx`insert into public.customers(id,name) values(${id(901)},'Syntetiskt främmande paritetsprov')`;
   await tx`insert into public.organizers(id,customer_id,name,type) values(${id(902)},${id(901)},'Syntetisk annan huvudman','Kommun')`;
   const foreignGlobal={...global,packageId:id(903)};
   await tx`insert into public.programplan_packages(package_id,version,organizer_id,unit_id,kind,name,catalog_id,levels,points,created_by_assignment) values(${foreignGlobal.packageId},1,${id(902)},null,'individualChoice','Syntetiskt främmande paket',${catalog.catalogId},${tx.json(foreignGlobal.levels)},200,${id(60)})`;
   add('foreign-organizer-global-reference-denied',false,foreignGlobal,basis(),'iv1',{availableListScope:'organizer-scoped-list'});
   const language=createLanguagePackage('fr','modern',2,200);
   vectors.push({name:'C-language-contiguous-smoke',accept:true,reference:basis(),blockId:'mosp',entries:[{ref:language,distribution:[]}],unitId:id(30),organizerId:id(2),packages:specs});
   const gap=structuredClone(language);gap.levels[1]=level('MODF1000X');
   vectors.push({name:'C-language-gap-smoke',accept:false,reference:basis(),blockId:'mosp',entries:[{ref:gap,distribution:[]}],unitId:id(30),organizerId:id(2),packages:specs});
   for(const v of vectors){
    const selectedCatalog=v.catalog??catalog,program=selectedCatalog.programs.find(p=>p.code===v.reference.programRef.code&&p.version===v.reference.programRef.version);
    const context={unitId:v.unitId,packages:v.packages};let tsAccepted=false,tsNormalized,tsCode=null,sqlAccepted=false,sqlNormalized,sqlCode=null;
    try{const parsed=validateProgramplanPackageEntries(program,v.reference,v.blockId,v.entries,selectedCatalog,context);tsNormalized=parsed.map(e=>{const levels=programplanPackageLevels(e.ref,selectedCatalog,context);return{key:programplanPackageKey(e.ref),ref:e.ref,levels,points:levels.reduce((n,l)=>n+l.points,0),distribution:e.distribution};});tsAccepted=true;}catch(e){tsCode=e?.code??'TEST_ERROR';}
    const caseRollback=Error('EXPECTED_CASE_ROLLBACK');
    try{await tx.savepoint(async sp=>{
     if(v.patchPackage||v.patchCatalog){await sp`set local session_replication_role=replica`;
      if(v.patchPackage)await sp`update public.programplan_packages set catalog_id=${v.patchPackage.catalogId} where package_id=${v.patchPackage.packageId} and version=${v.patchPackage.version}`;
      if(v.patchCatalog){const {catalogId:ignored,...patch}=v.patchCatalog;await sp`update public.programplan_catalogs set payload=${sp.json(patch)} where catalog_id=${catalog.catalogId}`;}
      await sp`set local session_replication_role=origin`;
     }
     sqlNormalized=[];for(const e of v.entries){const[r]=await sp`select public.phase5_programplan_validate_scoped_selection(${sp.json(v.reference)}::jsonb,${v.blockId}::text,${sp.json(e)}::jsonb,${v.unitId}::uuid,${v.organizerId}::uuid) value`;sqlNormalized.push(r.value);}
     sqlAccepted=true;throw caseRollback;
    });}catch(e){if(e!==caseRollback)sqlCode=e?.code??'TEST_ERROR';}
    const normalizedEqual=tsAccepted&&sqlAccepted?equal(tsNormalized,sqlNormalized):null;
    const pass=tsAccepted===v.accept&&sqlAccepted===v.accept&&(!v.accept||normalizedEqual===true);
    // Invalid test vectors may contain fractional numbers, which catalogue canonicalization rejects.
    const vectorHash=sha(JSON.stringify({reference:v.reference,blockId:v.blockId,entries:v.entries,unitId:v.unitId,organizerId:v.organizerId,context,catalog:selectedCatalog}));
    report.cases.push({name:v.name,status:pass?'PASS':'FAIL',expected:v.accept?'accept':'deny',tsAccepted,sqlAccepted,normalizedEqual,tsCode,sqlCode,vectorHash,availableListScope:v.availableListScope??'same-synthetic-package-versions'});
    console.log(`${pass?'PASS':'FAIL'} ${v.name}`);
   }
   report.complete=report.cases.length===33;throw rollback;
  });}catch(e){if(e===rollback)report.rollback=true;else throw e;}
 }catch(e){report.error=/^[A-Z0-9_]{1,80}$/u.test(e?.code??'')?e.code:/^(REFUSED|fixture_)/u.test(e?.message??'')?e.message:'PARITY_EXECUTION_FAILED';}
 finally{
  try{report.originalHashes=beforeHashes;report.finalHashes=await hashes(db);report.originalBusinessPreserved=equal(beforeHashes,report.finalHashes);
   report.workerCountAfter=(await acl()).filter(r=>r.worker).length;report.aclUnchanged=equal(beforeAcl,await acl());
   const [left]=await db`select (select count(*)::int from public.customers where id in (${id(1)},${id(901)})) customers,(select count(*)::int from public.programplan_packages where organizer_id in (${id(2)},${id(902)})) packages,(select count(*)::int from public.programplan_unit_packages where organizer_id in (${id(2)},${id(902)})) selections,(select count(*)::int from public.security_events where customer_id in (${id(1)},${id(901)})) audit`;
   report.cleanup=left;report.cleanupStatus=Object.values(left).every(n=>n===0)?'PASS':'FAIL';
  }catch{report.cleanupStatus='FAIL';}
  report.status=report.complete&&report.rollback&&report.originalBusinessPreserved&&report.aclUnchanged&&report.cleanupStatus==='PASS'&&report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
  report.completedAt=new Date().toISOString();report.sourceHashes=Object.fromEntries(SOURCES.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
  await db.end({timeout:5});mkdirSync(dirname(outFile),{recursive:true});writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2);if(argv.length&&!(argv.length===2&&argv[0]==='--out'))throw Error('REFUSED_use_optional_out');
 const report=await runChoicePackageParity(argv.length?resolve(argv[1]):undefined);console.log(JSON.stringify({status:report.status,cases:report.cases.length,rollback:report.rollback,originalBusinessPreserved:report.originalBusinessPreserved,aclUnchanged:report.aclUnchanged,cleanupStatus:report.cleanupStatus,error:report.error}));process.exitCode=report.status==='PASS'?0:1;
}
