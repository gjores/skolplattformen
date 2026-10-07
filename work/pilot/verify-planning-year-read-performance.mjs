#!/usr/bin/env node
// One private read definition: owned local rollback parity, actual HTTP timing, unchanged API matrix.
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {PLANNING_FOUNDATION,PLANNING_TEST,PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,planningBusinessHashes,sha,equal} from './apply-planning-year-migration.mjs';
import {planningRollbackBody,planningTapProof} from './verify-planning-year-foundation.mjs';
import {PLANNING_GRANTS,PLANNING_API_SOURCE_PATHS,planningApiCasesStatus,planningAuditPair,planningSelection,planningCleanupPreserved,planningSafeFailure,planningCleanupDiagnostics} from './verify-planning-year-api.mjs';
import {parsePlanningSetup,parsePlanningSelection,parsePlanningList,parsePlanningOverview} from '../../web/lib/planning-year-contract.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../web/package.json',import.meta.url));
export const PERFORMANCE_MIGRATION='20261006122000_phase5_planning_year_read_performance.sql';
export const PERFORMANCE_TEST='supabase/tests/phase5_planning_year_read_performance.test.sql';
export const PERFORMANCE_ENTRY='public.phase5_planning_year_rows(jsonb)';
export const PERFORMANCE_FOUNDATION_HASH='e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71';
export const PERFORMANCE_ORIGINAL_TEST_HASH='be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34';
export const PERFORMANCE_ORIGINAL_DEFINITION_HASH='11b720970b78486bb7a51f6d54c490ad1758da09c20b8d4aae9c3423d99a1b44';
export const PERFORMANCE_SOURCE_PATHS=[...new Set([...PLANNING_API_SOURCE_PATHS,
 'work/pilot/verify-planning-year-read-performance.mjs','work/pilot/verify-planning-year-read-performance.test.mjs',
 'work/pilot/apply-planning-year-read-performance.mjs','work/pilot/verify-planning-year-foundation.mjs',
 PERFORMANCE_TEST,PLANNING_TEST,`supabase/migrations/${PERFORMANCE_MIGRATION}`])];
export const PERFORMANCE_SQL_CASES=['program-list-full','program-list-page2','program-search','program-name-desc','program-school-sort',
 'program-cohort-sort','program-version-sort','program-status-sort','program-grade-sort','program-points-sort','program-status-filter',
 'program-grade-filter','program-relation-filter','program-archive-filter','program-school-filter','program-year-before','program-year-after',
 'gym-timplan-year1','gym-timplan-year2','gym-timplan-year3','gr-bound-old-year8','gr-bound-old-year9','im-weekly-null',
 'missing-program-basis','cache-plan-identity-revision','cache-school-identity','distinct-catalog','distinct-start','distinct-orientation',
 'distinct-specialization','distinct-choice-blocks','distinct-distribution','array-order-distinct','cache-128-fallback','cache-cell-limit-fallback',
 'null-basis-fallback','malformed-distribution','extra-distribution-row','duplicate-distribution-row','invalid-start','invalid-program-version',
 'shared-source-conflict','truncated-frozen-inventory','future-2099','selection-stale','foreign-scope-denied'];
export const PERFORMANCE_ORIGINAL_PARITY_CASES=['setup-admin','program','gym','gr8','gr9','im','empty','gr-reordered','im-missing',
 'gr-ambiguous','missing-plans','january','unallocated-points','gr-unknown-row','gym-bound','gr-legacy-width','im-legacy-width','gr-legacy-nested'];
const NEGATIVE_STATES={
 'malformed-distribution':'22023','extra-distribution-row':'22023','duplicate-distribution-row':'22023','invalid-start':'22023',
 'invalid-program-version':'22023','truncated-frozen-inventory':'22023','shared-source-conflict':'40001','selection-stale':'40001',
 'foreign-scope-denied':'42501','cache-cell-limit-fallback':'54000',
};
const WORKER_ENTRIES=[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES];
const TIMING_CASES=['list','search','page2'];
const CANDIDATE_MARKER='-- PERFORMANCE_CANDIDATE_APPLY';
const hashPattern=/^[a-f0-9]{64}$/u;
const functions=acl=>acl.filter(r=>r.granted).map(r=>r.f);
const checked=(checks,name,ok)=>checks.push({name,ok:Boolean(ok)});
const read=p=>readFileSync(join(root,p));
const safeOutput=p=>[join(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(resolve(p)));
export function parseReadPerformanceArgs(argv){
 const result={target:null,mode:null,baseURL:null,out:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--target','--mode','--base-url','--out'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('REFUSED: exact arguments required');
  seen.add(flag);const value=argv[++i];if(flag==='--base-url')result.baseURL=value;else result[flag.slice(2)]=value;
 }
 if(result.target!=='protected'||!['rollback','applied'].includes(result.mode)||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(result.baseURL??'')
  ||!result.out||!safeOutput(result.out))throw Error('REFUSED: protected target, local actual Worker, mode and safe evidence output required');
 const port=Number(new URL(result.baseURL).port);if(!Number.isInteger(port)||port<1024||port>65535||port===3012)throw Error('REFUSED: owned isolated local port required');
 result.out=resolve(result.out);return result;
}
export async function readPerformanceCatalog(db){
 const functions=await db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' signature,
  pg_get_functiondef(p.oid) definition,p.proacl::text acl,pg_get_userbyid(p.proowner) owner,p.provolatile::text volatility,
  p.prosecdef "securityDefiner",p.proconfig config from pg_proc p where p.pronamespace='public'::regnamespace order by signature`;
 const tables=await db`select c.oid::regclass::text relation,c.relacl::text acl,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') order by relation`;
 const journal=await db`select version,name,statements from supabase_migrations.schema_migrations order by version`;
 return {functions,tables,journal};
}
export const performanceCatalogFingerprint=catalog=>sha(JSON.stringify(catalog));
export function assertPerformanceDiff(before,after,{journal='unchanged',expectedSource}={}){
 if(!Array.isArray(before?.functions)||!Array.isArray(after?.functions)||before.functions.length!==after.functions.length
  ||!equal(before.tables,after.tables))throw Error('REFUSED: function inventory, tables, owners, raw ACL or RLS changed');
 const changed=[];let originalDefinitionHash,candidateDefinitionHash;
 for(let i=0;i<before.functions.length;i++){
  const b=before.functions[i],a=after.functions[i];
  if(b.signature!==a.signature||!equal({...b,definition:null},{...a,definition:null}))throw Error('REFUSED: raw function privileges, attributes or identity changed');
  if(b.definition!==a.definition){
   if(b.signature!==PERFORMANCE_ENTRY)throw Error('REFUSED: another public definition changed');
   originalDefinitionHash=sha(b.definition);candidateDefinitionHash=sha(a.definition);changed.push(b.signature);
  }
 }
 if(!exactFunctions(changed,[PERFORMANCE_ENTRY]))throw Error('REFUSED: exactly one private helper definition must change');
 if(journal==='unchanged'){if(!equal(before.journal,after.journal))throw Error('REFUSED: rollback migration journal changed');}
 else if(journal==='append'){
  const expected={version:'20261006122000',name:'phase5_planning_year_read_performance',statements:[expectedSource]};
  if(typeof expectedSource!=='string'||!equal(after.journal,[...before.journal,expected]))throw Error('REFUSED: exact one source-bound corrective journal record required');
 }else throw Error('REFUSED: invalid journal diff policy');
 return {changedDefinitions:changed,originalDefinitionHash,candidateDefinitionHash,unexpectedDifferences:0};
}
export function validatePerformanceBaseApi(e,readSource){
 if(e?.kind!=='phase5-planning-year-api'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'
  ||e.preflight!==false||e.reset!==false||e.complete!==true||e.aclUnchanged!==true||e.functionsAndJournalPreserved!==true
  ||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true||e.originalAuditPreserved!==true||e.identityAnchorsPreserved!==true
  ||e.cleanupStatus!=='PASS'||!planningCleanupPreserved(e.cleanup)||planningApiCasesStatus(e.cases)!=='PASS'
  ||!exactFunctions(e.beforeWorkerFunctions??[],WORKER_ENTRIES)||!exactFunctions(e.verifiedWorkerFunctions??[],WORKER_ENTRIES)
  ||!exactFunctions(e.restoredWorkerFunctions??[],WORKER_ENTRIES)||!equal(e.beforeAcl,e.afterAcl)
  ||!exactFunctions(Object.keys(e.originalHashes??{}),PLANNING_TABLES)||!equal(e.originalHashes,e.finalHashes)
  ||!hashPattern.test(e.baselineFingerprint??'')||e.baselineFingerprint!==e.finalFingerprint
  ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??''))throw Error('REFUSED: full source-bound final 05-38 actual Worker proof required');
 for(const p of PLANNING_API_SOURCE_PATHS)if(e.sourceHashes?.[p]!==sha(readSource(p)))throw Error('REFUSED: existing verified API sources changed');
}
export const validateFinal38=validatePerformanceBaseApi;
export function timingSummary(samples){
 if(!Array.isArray(samples)||samples.length<3||samples.some(s=>!Number.isFinite(s.durationMs)||s.durationMs<=0))throw Error('REFUSED: at least three positive real timing samples required');
 const values=samples.map(s=>s.durationMs).sort((a,b)=>a-b),middle=Math.floor(values.length/2);
 return {count:values.length,medianMs:values.length%2?values[middle]:(values[middle-1]+values[middle])/2,minimumMs:values[0],maximumMs:values.at(-1)};
}
export function performanceTimingProof(before,after){
 const groups={};let ok=true;
 for(const name of TIMING_CASES){
  try{const old=timingSummary(before.filter(s=>s.case===name)),current=timingSummary(after.filter(s=>s.case===name));
   const speedup=old.medianMs/current.medianMs,pass=speedup>=3&&current.medianMs<=5000&&current.maximumMs<10000;
   groups[name]={before:old,after:current,speedup,ok:pass};ok&&=pass;
  }catch{groups[name]={ok:false};ok=false;}
 }
 try{const overview=timingSummary(after.filter(s=>s.case==='overview'));groups.overview={after:overview,ok:overview.medianMs<=5000&&overview.maximumMs<10000};ok&&=groups.overview.ok;}
 catch{groups.overview={ok:false};ok=false;}
 return {ok,groups};
}
function timingSamplesComplete(samples,applied=false){
 const names=applied?[...TIMING_CASES,'overview']:TIMING_CASES;
 return Array.isArray(samples)&&samples.length===names.length*3&&names.every(name=>{
  const rows=samples.filter(s=>s.case===name),expected=name==='search'?{count:1,rows:1}:name==='page2'?{count:52,rows:2}:name==='overview'?{count:52,rows:52}:{count:52,rows:50};
  return rows.length===3&&exactFunctions(rows.map(s=>String(s.iteration)),['1','2','3'])&&new Set(rows.map(s=>s.selectionRevision)).size===1
   &&rows.every(s=>s.status==='PASS'&&Number.isFinite(s.durationMs)&&s.durationMs>0&&s.durationMs<30000&&s.count===expected.count&&s.rows===expected.rows
    &&s.auditPaired===true&&s.noStore===true&&s.businessUnchanged===true&&/^sha256:[a-f0-9]{64}$/u.test(s.selectionRevision??'')&&s.httpStatus===200);
 });
}
export function performanceParityProof(output){
 const cases=output.split('\n').filter(l=>l.startsWith('PLANNING_PERFORMANCE_PARITY|')).map(l=>JSON.parse(l.slice('PLANNING_PERFORMANCE_PARITY|'.length)));
 const ok=exactFunctions(cases.map(c=>c.name),PERFORMANCE_SQL_CASES)&&cases.every(c=>c.same===true&&/^[A-Z0-9]{5}$/u.test(c.oldState??'')&&c.oldState===c.newState&&c.oldState===(NEGATIVE_STATES[c.name]??'00000')
  &&hashPattern.test(c.oldHash??'')&&c.oldHash===c.newHash);
 return {ok,cases};
}
export function originalPlanningParityProof(output){
 const cases=[];for(const line of output.split('\n').filter(l=>l.startsWith('PLANNING_PARITY|'))){
  const e=JSON.parse(line.slice('PLANNING_PARITY|'.length)),setup=parsePlanningSetup(e.setup);
  if(e.request){const selection=parsePlanningSelection(e.request,setup);parsePlanningList(e.list,selection,setup);parsePlanningOverview(e.overview,selection,setup);}
  cases.push({name:e.name,ok:true});
 }
 return {ok:exactFunctions(cases.map(c=>c.name),PERFORMANCE_ORIGINAL_PARITY_CASES),cases};
}
export function extractOriginalPlanningRows(foundation){
 if(sha(foundation)!==PERFORMANCE_FOUNDATION_HASH)throw Error('REFUSED: immutable original foundation changed');
 const start=foundation.indexOf('create function public.phase5_planning_year_rows(q jsonb) returns jsonb'),end=foundation.indexOf('\ncreate function public.phase5_planning_year_sorted',start);
 if(start<0||end<=start)throw Error('REFUSED: exact original private helper unavailable');
 return foundation.slice(start,end).replace(/^create function/u,'create or replace function');
}
function performanceCatalogSql(){
 return `jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('signature','public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')',
  'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner),'volatility',p.provolatile::text,
  'securityDefiner',p.prosecdef,'config',p.proconfig) order by 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')')
  from pg_proc p where p.pronamespace='public'::regnamespace),
 'tables',(select jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner),
  'relrowsecurity',c.relrowsecurity,'relforcerowsecurity',c.relforcerowsecurity) order by c.oid::regclass::text)
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')),
 'journal',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version) from supabase_migrations.schema_migrations))`;
}
export function performanceRollbackScript(test,candidate,foundation){
 const body=planningRollbackBody(test);if(body.split(CANDIDATE_MARKER).length!==2)throw Error('REFUSED: one reviewed SQL candidate marker required');
 const definitionProof=`select 'PLANNING_PERFORMANCE_DEFINITION|'||jsonb_build_object('signature','${PERFORMANCE_ENTRY}',
  'definitionHash',encode(extensions.digest(pg_get_functiondef('${PERFORMANCE_ENTRY}'::regprocedure),'sha256'),'hex'))::text;`;
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n${extractOriginalPlanningRows(foundation)}\n`
  +`create temp table performance_original_catalog as select ${performanceCatalogSql()} value;\n`
  +body.replace(CANDIDATE_MARKER,`${candidate}\n${definitionProof}\nselect 'PLANNING_PERFORMANCE_CATALOG|'||jsonb_build_object('before',(select value from performance_original_catalog),'after',${performanceCatalogSql()})::text;`)+'\nrollback;\n';
}
export function historicalPlanningRollbackScript(test){
 if(sha(test)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable original 93 SQL tests changed');
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n`
  +PLANNING_ENTRIES.map(entry=>`revoke execute on function ${entry} from skolplattform_worker;`).join('\n')
  +'\n'+planningRollbackBody(test)+'\nrollback;\n';
}
function tapEvidenceValid(tap,total){
 return tap?.status==='PASS'&&tap.total===total&&Array.isArray(tap.assertions)
  &&planningTapProof(tap.assertions.join('\n')+`\n1..${total}`,total).status==='PASS';
}
export function validatePerformanceRollback(e,readSource){
 if(e?.kind!=='phase5-planning-year-read-performance'||e.mode!=='rollback'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'
  ||e.complete!==true||e.rollback!==true||e.reset!==false||e.originalDefinitionHash!==PERFORMANCE_ORIGINAL_DEFINITION_HASH
  ||!hashPattern.test(e.candidateDefinitionHash??'')||e.candidateDefinitionHash===e.originalDefinitionHash
  ||e.originalFoundationHash!==PERFORMANCE_FOUNDATION_HASH||e.originalTestHash!==PERFORMANCE_ORIGINAL_TEST_HASH
  ||!hashPattern.test(e.baselineFingerprint??'')||e.baselineFingerprint!==e.finalFingerprint
  ||!e.beforeCatalog||!e.afterCatalog||performanceCatalogFingerprint(e.beforeCatalog)!==e.baselineFingerprint||performanceCatalogFingerprint(e.afterCatalog)!==e.finalFingerprint||!equal(e.beforeCatalog,e.afterCatalog)
  ||e.functionsAndJournalPreserved!==true||e.aclUnchanged!==true||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true
  ||e.originalAuditPreserved!==true||e.identityAnchorsPreserved!==true||e.cleanupStatus!=='PASS'||!planningCleanupPreserved(e.cleanup)
  ||!equal(e.beforeAcl,e.afterAcl)||!exactFunctions(e.beforeWorkerFunctions??[],WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],WORKER_ENTRIES)
  ||!exactFunctions(Object.keys(e.originalHashes??{}),PLANNING_TABLES)||!equal(e.originalHashes,e.finalHashes)
  ||e.definitionDiff?.unexpectedDifferences!==0||!exactFunctions(e.definitionDiff?.changedDefinitions??[],[PERFORMANCE_ENTRY])
  ||e.definitionDiff?.originalDefinitionHash!==e.originalDefinitionHash||e.definitionDiff?.candidateDefinitionHash!==e.candidateDefinitionHash
  ||!e.parity?.ok||!exactFunctions((e.parity.cases??[]).map(c=>c.name),PERFORMANCE_SQL_CASES)
  ||!tapEvidenceValid(e.sql?.tap,143)||e.sql.exitCode!==0||!tapEvidenceValid(e.originalSql?.tap,93)||e.originalSql.exitCode!==0
  ||!e.originalSql?.parity?.ok||!e.originalSql.parity.cases?.every(c=>c.ok===true)||!exactFunctions((e.originalSql.parity.cases??[]).map(c=>c.name),PERFORMANCE_ORIGINAL_PARITY_CASES)
  ||!timingSamplesComplete(e.timings?.samples,false)||e.final38ProofStatus!=='PASS'
  ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??'')
  ||!Array.isArray(e.checks)||!e.checks.length||!e.checks.every(c=>c.ok===true))throw Error('REFUSED: full rollback parity, exact original state and real HTTP baseline required');
 const parity=performanceParityProof(e.parity.cases.map(c=>'PLANNING_PERFORMANCE_PARITY|'+JSON.stringify(c)).join('\n'));
 if(!parity.ok)throw Error('REFUSED: incomplete or unequal source parity');
 if(e.sourceHash!==sha(readSource(`supabase/migrations/${PERFORMANCE_MIGRATION}`))||e.testHash!==sha(readSource(PERFORMANCE_TEST)))throw Error('REFUSED: exact corrective SQL/test hash required');
 for(const p of PERFORMANCE_SOURCE_PATHS)if(e.sourceHashes?.[p]!==sha(readSource(p)))throw Error('REFUSED: corrective proof sources changed');
}
export function performanceProgress(line){
 const match=line.match(/\bNOTICE:\s+PERFORMANCE_PROGRESS\|([a-z0-9-]+)\|([A-Z0-9]{5})$/u);
 return match&&PERFORMANCE_SQL_CASES.includes(match[1])?{case:match[1],state:match[2]}:null;
}
async function runProcess(command,args,{input,timeoutMs=3600000,progress=false}={}){
 return await new Promise((resolvePromise,reject)=>{
  const proc=spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];let bytes=0,timedOut=false,progressBuffer='';
  const timer=setTimeout(()=>{timedOut=true;proc.kill('SIGTERM');},timeoutMs);
  const collect=chunks=>chunk=>{bytes+=chunk.length;if(bytes>32*1024*1024){proc.kill('SIGTERM');return;}chunks.push(chunk);};
  proc.stdout.on('data',collect(stdout));proc.stderr.on('data',chunk=>{
   collect(stderr)(chunk);if(progress){progressBuffer+=chunk.toString('utf8');const lines=progressBuffer.split('\n');progressBuffer=lines.pop();
    for(const line of lines){const value=performanceProgress(line);if(value)process.stdout.write(`SQL ${value.case}: ${value.state}\n`);}
   }
  });
  proc.once('error',error=>{clearTimeout(timer);reject(error);});
  proc.once('close',(exitCode,signal)=>{clearTimeout(timer);resolvePromise({exitCode,signal,timedOut,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});});
  proc.stdin.on('error',error=>{if(error.code!=='EPIPE')reject(error);});proc.stdin.end(input);
 });
}
async function runSql(target,script,controlDb){
 const applicationName=`p5_planning_perf_${randomUUID()}`;
 const result=await runProcess('docker',['exec','-i','-e',`PGAPPNAME=${applicationName}`,`supabase_db_${target.projectId}`,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-f','-'],{input:script,progress:true});
 // Stopping docker's local client is not proof that its database backend stopped.
 // Only this exact uniquely tagged owned psql backend may be terminated here.
 if(result.timedOut){
  const owned=await controlDb`select pid from pg_stat_activity where application_name=${applicationName} and usename='postgres' and backend_type='client backend'`;
  for(const row of owned)await controlDb`select pg_terminate_backend(${row.pid}) where exists(select 1 from pg_stat_activity
   where pid=${row.pid} and application_name=${applicationName} and usename='postgres' and backend_type='client backend')`;
  let stopped=false;for(const deadline=Date.now()+5000;Date.now()<deadline;){
   const [state]=await controlDb`select not exists(select 1 from pg_stat_activity where application_name=${applicationName}) stopped`;
   if(state.stopped){stopped=true;break;}await new Promise(done=>setTimeout(done,50));
  }
  result.ownedBackendStopped=stopped;if(!stopped)throw Error('performance_owned_backend_not_stopped');
 }
 return result;
}
const proofOutput=result=>({exitCode:result.exitCode,timedOut:result.timedOut,ownedBackendStopped:result.ownedBackendStopped??null,tap:planningTapProof(result.stdout,1),
 error:result.exitCode===0?null:result.timedOut?'SQL_TIMEOUT':result.stderr.match(/SQLSTATE\s*:?\s*([A-Z0-9]{5})/u)?.[1]??'SQL_PROOF_FAILED'});
async function timingFixture(baseURL,phase){
 const {createPlanningYearFixture}=await import('./phase5-planning-year-fixtures.mjs');
 let fixture,cleanup,cleanupFailure,samples=[],failure;
 try{
  fixture=await createPlanningYearFixture();const metadata=await fixture.setup(baseURL),input=planningSelection(metadata.planningYear,{view:'programplan',query:metadata.pageQuery,status:'utkast'});
  let revision;
  for(const name of phase==='after'?[...TIMING_CASES,'overview']:TIMING_CASES)for(let iteration=1;iteration<=3;iteration++){
   const selection={...input,...(name==='search'?{query:metadata.pageSearchQuery}:name==='page2'?{page:2,selectionRevision:revision}:{})};
   const before=await fixture.businessHashes(),startedAt=new Date().toISOString(),start=performance.now(),route=name==='overview'?'oversikt':'lista';
   const response=await fetch(`${baseURL}/api/planering/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`sp_session=${fixture.hm.token}`,
    'X-Context-Epoch':String(fixture.hm.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL},body:JSON.stringify(selection),signal:AbortSignal.timeout(30000)});
   const body=await response.json(),durationMs=performance.now()-start,correlationId=response.headers.get('x-correlation-id');
   const noStore=response.headers.get('cache-control')==='no-store',auditPaired=response.status===200&&planningAuditPair(await fixture.events(correlationId),fixture.hm,fixture.customerId,route),
    businessUnchanged=equal(before,await fixture.businessHashes());
   const expected=name==='search'?{count:1,rows:1}:name==='page2'?{count:52,rows:2}:name==='overview'?{count:52,rows:52}:{count:52,rows:50};
   const ok=response.status===200&&noStore&&auditPaired&&businessUnchanged&&body.count===expected.count&&body.rows?.length===expected.rows;
   samples.push({case:name,iteration,phase,startedAt,durationMs,httpStatus:response.status,count:body.count??null,rows:body.rows?.length??null,
    selectionRevision:body.selectionRevision??null,noStore,auditPaired,businessUnchanged,status:ok?'PASS':'FAIL'});
   if(name==='list'&&iteration===1)revision=body.selectionRevision;
   process.stdout.write(`${ok?'PASS':'FAIL'} ${phase} ${name} ${iteration}: ${Math.round(durationMs)} ms\n`);
   if(!ok)throw Error('performance_http_timing_failed');
  }
 }catch(error){failure=planningSafeFailure(error);}
 finally{if(fixture)try{cleanup=await fixture.cleanup();}catch(error){cleanupFailure={...planningSafeFailure(error),evidence:planningCleanupDiagnostics(error?.cleanupEvidence)};}}
 return {ok:!failure&&!cleanupFailure&&timingSamplesComplete(samples,phase==='after')&&planningCleanupPreserved(cleanup),samples,cleanup,cleanupFailure,failure};
}
function reportFile(path,value){
 if(existsSync(path)){const previous=JSON.parse(readFileSync(path,'utf8'));if(previous.status!=='PASS'){
  const history=path.replace(/\.json$/u,`-fail-${Date.now()}.json`);copyFileSync(path,history);
 }}
 const content=JSON.stringify(value,null,2)+'\n';writeFileSync(path,content);
 if(value.status!=='PASS')writeFileSync(path.replace(/\.json$/u,`-fail-${Date.now()}.json`),content);
}
async function main(){
 const o=parseReadPerformanceArgs(process.argv.slice(2)),source=read(`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString(),test=read(PERFORMANCE_TEST).toString(),foundation=read(`supabase/migrations/${PLANNING_FOUNDATION}`).toString(),
  grants=read(`supabase/migrations/${PLANNING_GRANTS}`).toString(),originalTest=read(PLANNING_TEST).toString();
 if(sha(foundation)!==PERFORMANCE_FOUNDATION_HASH||sha(originalTest)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable 05-37 sources changed');
 const final38=JSON.parse(read('work/pilot/results/phase5-38-api-final.json').toString());validatePerformanceBaseApi(final38,read);
 const previous=o.mode==='applied'?JSON.parse(read('work/pilot/results/phase5-38-read-performance-rollback.json').toString()):null;
 if(previous)validatePerformanceRollback(previous,read);
 const {verifyPlanningYearBrowserTarget}=await import('./phase5-planning-year-fixtures.mjs');
 const proof=await verifyPlanningYearBrowserTarget(o.baseURL),target=await assertTarget('protected');
 if(proof.buildRevision!==final38.workerBuildRevision||previous&&proof.buildRevision!==previous.workerBuildRevision)throw Error('REFUSED: same actual verified Worker build required');
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const beforeCatalog=await readPerformanceCatalog(db),beforeAcl=await gymAcl(db),originalHashes=await planningBusinessHashes(db),
  baselineFingerprint=performanceCatalogFingerprint(beforeCatalog),sourceHashes=Object.fromEntries(PERFORMANCE_SOURCE_PATHS.map(p=>[p,sha(read(p))]));
 let afterCatalog,afterAcl,finalHashes,finalFingerprint,sql,originalSql,parity,definitionDiff,timings,cleanup,cleanupFailure=null,apiFinal,performanceProof,failure,
  originalDefinitionHash=PERFORMANCE_ORIGINAL_DEFINITION_HASH,candidateDefinitionHash;
 const checks=[];
 try{
  const original=beforeCatalog.functions.find(f=>f.signature===PERFORMANCE_ENTRY);
  if(!original||!exactFunctions(functions(beforeAcl),WORKER_ENTRIES)||original.acl!=='{postgres=X/postgres}'||original.securityDefiner!==true||original.volatility!=='v')throw Error('REFUSED: exact 28 grants and private helper attributes required');
  const journal=beforeCatalog.journal.filter(r=>r.version>='20261006120000'),expected=[
   {version:'20261006120000',name:'phase5_planning_year_reads',statements:[foundation]},
   {version:'20261006121000',name:'phase5_worker_planning_year_reads',statements:[grants]},
   ...(o.mode==='applied'?[{version:'20261006122000',name:'phase5_planning_year_read_performance',statements:[source]}]:[])];
  if(!equal(journal,expected))throw Error('REFUSED: exact applied foundations and latest corrective journal required');
  if(o.mode==='rollback'&&sha(original.definition)!==PERFORMANCE_ORIGINAL_DEFINITION_HASH)throw Error('REFUSED: exact immutable rows definition required');
  if(o.mode==='applied'){
   candidateDefinitionHash=previous.candidateDefinitionHash;
   if(sha(original.definition)!==candidateDefinitionHash)throw Error('REFUSED: actual DB is not the verified corrective definition');
  }
  checked(checks,'exact target journal, private helper attributes, original/candidate definition and 28 Worker entries',true);
  process.stdout.write('Running exact old/new private SQL parity in rollback\n');
  const result=await runSql(target,performanceRollbackScript(test,source,foundation),db);sql=proofOutput(result);parity=performanceParityProof(result.stdout);
  const markers=result.stdout.split('\n').filter(l=>l.startsWith('PLANNING_PERFORMANCE_DEFINITION|'));
  const definition=markers.length===1?JSON.parse(markers[0].slice('PLANNING_PERFORMANCE_DEFINITION|'.length)):null;
  if(definition?.signature!==PERFORMANCE_ENTRY||!hashPattern.test(definition.definitionHash??''))throw Error('performance_candidate_definition_proof_missing');
  if(candidateDefinitionHash&&candidateDefinitionHash!==definition.definitionHash)throw Error('performance_candidate_definition_drift');candidateDefinitionHash=definition.definitionHash;
  checked(checks,'actual complete old/new JSONB and negative SQLSTATE parity',sql.exitCode===0&&sql.tap.status==='PASS'&&parity.ok);
  const afterSql=await readPerformanceCatalog(db);
  checked(checks,'candidate SQL rollback restores every public definition rawACL table/RLS and journal',equal(beforeCatalog,afterSql));
  // Predict only the intended private definition from the actual rollback-created pg_get_functiondef hash.
  // The full original/new function catalog is emitted by the SQL coordinator marker below.
  const catalogMarkers=result.stdout.split('\n').filter(l=>l.startsWith('PLANNING_PERFORMANCE_CATALOG|'));
  if(catalogMarkers.length!==1)throw Error('performance_candidate_catalog_proof_missing');
  const candidateCatalog=JSON.parse(catalogMarkers[0].slice('PLANNING_PERFORMANCE_CATALOG|'.length));
  // Compare canonical DB definitions, never SQL-file formatting. SQL provides both catalogs before and after replacement.
  if(!candidateCatalog.before||!candidateCatalog.after)throw Error('performance_catalog_shape_missing');
  definitionDiff=assertPerformanceDiff(candidateCatalog.before,candidateCatalog.after);
  if(definitionDiff.originalDefinitionHash!==PERFORMANCE_ORIGINAL_DEFINITION_HASH||definitionDiff.candidateDefinitionHash!==candidateDefinitionHash)throw Error('performance_definition_catalog_mismatch');
  checked(checks,'exactly one predicted private definition change and no ACL/table/journal change',true);
  if(sql.exitCode!==0||sql.tap.status!=='PASS'||!parity.ok)throw Error('performance_sql_parity_failed');
  process.stdout.write('Running all 93 immutable original SQL assertions with rollback-only three-entry revoke\n');
  const historical=await runSql(target,historicalPlanningRollbackScript(originalTest),db);originalSql=proofOutput(historical);originalSql.parity=originalPlanningParityProof(historical.stdout);
  checked(checks,'all93 original SQL tests and18 actual SQL/TypeScript contracts without skips',originalSql.exitCode===0&&originalSql.tap.status==='PASS'&&originalSql.tap.total===93&&originalSql.parity.ok);
  checked(checks,'historical closed-ACL assertion rollback restores exact rawACL28/full state',equal(beforeCatalog,await readPerformanceCatalog(db))&&equal(beforeAcl,await gymAcl(db))&&equal(originalHashes,await planningBusinessHashes(db)));
  if(originalSql.exitCode!==0||originalSql.tap.status!=='PASS'||originalSql.tap.total!==93||!originalSql.parity.ok)throw Error('performance_original_sql_failed');
  timings=await timingFixture(o.baseURL,o.mode==='rollback'?'before':'after');cleanup=timings.cleanup;cleanupFailure=timings.cleanupFailure??null;
  checked(checks,'actual serial 52-frame HTTP samples with exact audit pairs no-store stable revision and complete business preservation',timings.ok);
  if(o.mode==='applied'){
   const apiOut=join(dirname(o.out),'phase5-38-read-performance-api-final.json');
   process.stdout.write('Running unchanged full 05-38 actual Worker API matrix\n');
   const actual=await runProcess(process.execPath,[join(root,'work/pilot/verify-planning-year-api.mjs'),'--target','protected','--base-url',o.baseURL,'--out',apiOut],{timeoutMs:1200000});
   if(existsSync(apiOut))apiFinal=JSON.parse(readFileSync(apiOut,'utf8'));
   if(actual.exitCode!==0||actual.timedOut)throw Error('performance_full_api_failed');validatePerformanceBaseApi(apiFinal,read);
   checked(checks,'unchanged full actual API matrix including existing GY GR IM program reads',true);
   performanceProof=performanceTimingProof(previous.timings.samples,timings.samples);checked(checks,'measured list/search/page medians at least3times faster <=5seconds and all samples <10seconds',performanceProof.ok);
  }
 }catch(error){failure=planningSafeFailure(error);}
 finally{
  try{afterCatalog=await readPerformanceCatalog(db);afterAcl=await gymAcl(db);finalHashes=await planningBusinessHashes(db);finalFingerprint=performanceCatalogFingerprint(afterCatalog);}catch(error){failure??=planningSafeFailure(error);}
  await db.end({timeout:5});
 }
 const businessPreserved=equal(originalHashes,finalHashes),catalogPreserved=equal(beforeCatalog,afterCatalog),aclPreserved=equal(beforeAcl,afterAcl),clean=planningCleanupPreserved(cleanup);
 checked(checks,'all15 original business whole rows and timestamps preserved after own cleanup',businessPreserved&&clean);
 checked(checks,'original and newly retained audit and identity anchors preserved',clean);
 checked(checks,'full public definitions owners rawACL table/RLS and complete journal unchanged by verifier',catalogPreserved&&aclPreserved);
 const report={kind:'phase5-planning-year-read-performance',target:'protected',scope:'local-synthetic-only',mode:o.mode,reset:false,rollback:true,
  status:!failure&&checks.every(c=>c.ok)?'PASS':'FAIL',complete:!failure&&checks.every(c=>c.ok),checks,
  sourceCommit:proof.sourceRevision,workerBuildRevision:proof.buildRevision,sourceHashes,originalFoundationHash:sha(foundation),originalTestHash:sha(originalTest),
  sourceHash:sha(source),testHash:sha(test),final38ProofStatus:final38.status,baselineFingerprint,finalFingerprint,beforeCatalog,afterCatalog,originalDefinitionHash,candidateDefinitionHash,definitionDiff,
  originalHashes,finalHashes,beforeAcl,afterAcl,beforeWorkerFunctions:functions(beforeAcl),afterWorkerFunctions:afterAcl?functions(afterAcl):[],
  functionsAndJournalPreserved:catalogPreserved,aclUnchanged:aclPreserved,originalBusinessPreserved:businessPreserved&&clean,originalTimestampsPreserved:businessPreserved&&clean,
  originalAuditPreserved:cleanup?.originalAuditPreserved===true,identityAnchorsPreserved:cleanup?.identityAnchorsPreserved===true,cleanupStatus:clean?'PASS':'FAIL',cleanup,cleanupFailure,
  sql,originalSql,parity,timings,performance:performanceProof,apiFinal:apiFinal?{status:apiFinal.status,cases:apiFinal.cases.length,sourceCommit:apiFinal.sourceCommit,
   workerBuildRevision:apiFinal.workerBuildRevision,report:'phase5-38-read-performance-api-final.json',sha256:sha(JSON.stringify(apiFinal))}:null,failure};
 reportFile(o.out,report);process.stdout.write(`${report.status} planning read performance ${o.mode}; original93=${originalSql?.tap?.total??0}; parity=${parity?.cases?.length??0}\n`);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 process.stderr.write(error.message?.startsWith('REFUSED')?error.message+'\n':`FAILED: ${planningSafeFailure(error).code}\n`);process.exitCode=1;
});
