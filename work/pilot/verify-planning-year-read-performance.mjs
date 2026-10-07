#!/usr/bin/env node
// One private read definition: owned local rollback parity, actual HTTP timing, unchanged API matrix.
import {readFileSync,writeFileSync,existsSync,copyFileSync,realpathSync,lstatSync,statSync,constants} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,dirname,join,basename} from 'node:path';
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
export const PERFORMANCE_RESERVE_POLICY='right-censored-old-http-lower-bound-v1';
export const PERFORMANCE_REUSE_TOOL_PATHS=['work/pilot/verify-planning-year-read-performance.mjs',
 'work/pilot/verify-planning-year-read-performance.test.mjs','work/pilot/apply-planning-year-read-performance.mjs'];
const SEALED_OLD_COMMIT='c0b5e1705c45dfa11e3490feef83ff4b1b2b6318';
const SEALED_OLD_REPORT_HASH='4f231086020d7f9e739fc0b36f28ab4829c7daf82852eb3356812145852d1603';
const SQL_COMPONENT_NAMES=['performance143','performance46','original93','original18'];
const LEGACY_HTTP_CHECK='actual serial 52-frame HTTP samples with exact audit pairs no-store stable revision and complete business preservation';
const REUSE_REQUIRED_CHECKS=['exact target journal, private helper attributes, original/candidate definition and 28 Worker entries',
 'actual complete old/new JSONB and negative SQLSTATE parity','candidate SQL rollback restores every public definition rawACL table/RLS and journal',
 'exactly one predicted private definition change and no ACL/table/journal change','all93 original SQL tests and18 actual SQL/TypeScript contracts without skips',
 'historical closed-ACL assertion rollback restores exact rawACL28/full state','all15 original business whole rows and timestamps preserved after own cleanup',
 'original and newly retained audit and identity anchors preserved','original audit and identity whole rows preserved from coordinator start through every SQL and HTTP step',
 'full public definitions owners rawACL table/RLS and complete journal unchanged by verifier'];
const CANDIDATE_MARKER='-- PERFORMANCE_CANDIDATE_APPLY';
const hashPattern=/^[a-f0-9]{64}$/u;
const functions=acl=>acl.filter(r=>r.granted).map(r=>r.f);
const checked=(checks,name,ok)=>checks.push({name,ok:Boolean(ok)});
const read=p=>readFileSync(join(root,p));
export function canonicalPerformanceEvidencePath(path,{input=false}={}){
 const absolute=resolve(path);let entry;try{entry=lstatSync(absolute);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(entry?.isSymbolicLink()&&!existsSync(absolute))throw Error('REFUSED: broken evidence symlink');
 if(input&&!existsSync(absolute))throw Error('REFUSED: existing evidence file required');
 const canonical=existsSync(absolute)?realpathSync(absolute):join(realpathSync(dirname(absolute)),basename(absolute));
 const parents=[join(root,'work/pilot/results'),'/private/tmp','/tmp'].filter(p=>existsSync(p)).map(p=>realpathSync(p));
 if(!parents.includes(dirname(canonical))||!canonical.endsWith('.json'))throw Error('REFUSED: canonical safe evidence file required');return canonical;
}
export function assertPerformanceEvidenceOutput(path,inputs=[]){
 const out=canonicalPerformanceEvidencePath(path);
 if(/^phase5-read-performance-sealed-full-/u.test(basename(out))||/-fail-\d+/u.test(basename(out)))throw Error('REFUSED: immutable or historical report cannot be output');
 for(const input of inputs.filter(Boolean)){
  const canonical=canonicalPerformanceEvidencePath(input);
  if(out===canonical||existsSync(out)&&existsSync(canonical)&&statSync(out).dev===statSync(canonical).dev&&statSync(out).ino===statSync(canonical).ino)throw Error('REFUSED: evidence output aliases protected input');
 }
 return out;
}
const safeOutput=path=>{try{assertPerformanceEvidenceOutput(path);return true;}catch{return false;}};
export function parseReadPerformanceArgs(argv){
 const result={target:null,mode:null,baseURL:null,out:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--target','--mode','--base-url','--out','--reuse-sql-evidence','--rollback-evidence'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('REFUSED: exact arguments required');
  seen.add(flag);const value=argv[++i];if(flag==='--base-url')result.baseURL=value;else if(flag==='--reuse-sql-evidence')result.reuseSqlEvidence=value;else if(flag==='--rollback-evidence')result.rollbackEvidence=value;else result[flag.slice(2)]=value;
 }
 if(result.target!=='protected'||!['rollback','applied'].includes(result.mode)||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(result.baseURL??'')
  ||!result.out||!safeOutput(result.out))throw Error('REFUSED: protected target, local actual Worker, mode and safe evidence output required');
 const port=Number(new URL(result.baseURL).port);if(!Number.isInteger(port)||port<1024||port>65535||port===3012)throw Error('REFUSED: owned isolated local port required');
 result.out=assertPerformanceEvidenceOutput(result.out);
 for(const key of ['reuseSqlEvidence','rollbackEvidence'])if(result[key]){
  result[key]=canonicalPerformanceEvidencePath(result[key],{input:true});
  if(result[key]===result.out||key==='reuseSqlEvidence'&&result.mode!=='rollback'||key==='rollbackEvidence'&&result.mode!=='applied')throw Error('REFUSED: explicit safe separate evidence path for its exact mode required');
 }
 assertPerformanceEvidenceOutput(result.out,[result.reuseSqlEvidence,result.rollbackEvidence]);
 return result;
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
  +body.replace(CANDIDATE_MARKER,()=>`${candidate}\n${definitionProof}\nselect 'PLANNING_PERFORMANCE_CATALOG|'||jsonb_build_object('before',(select value from performance_original_catalog),'after',${performanceCatalogSql()})::text;`)+'\nrollback;\n';
}
export function historicalPlanningRollbackScript(test){
 if(sha(test)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable original 93 SQL tests changed');
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n`
  +PLANNING_ENTRIES.map(entry=>`revoke execute on function ${entry} from skolplattform_worker;`).join('\n')
  +'\n'+planningRollbackBody(test)+'\nrollback;\n';
}
function tapEvidenceValid(tap,total){
 return tap?.status==='PASS'&&tap.total===total&&Array.isArray(tap.assertions)
  &&tap.assertions.every(line=>!/#\s*(?:skip|todo)\b/iu.test(line))
  &&planningTapProof(tap.assertions.join('\n')+`\n1..${total}`,total).status==='PASS';
}
function originalAnchorsValid(before,after){
 return ['audit','identities'].every(key=>Number.isInteger(before?.[key]?.count)&&before[key].count>=0
  &&hashPattern.test(before[key].sha256??'')&&equal(before[key],after?.[key]));
}
async function originalAnchorSnapshot(db,auditIds,identityIds){
 const [audit]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text,'sha256'),'hex') sha256
  from public.security_events e where ${auditIds}::bigint[] is null or id=any(${auditIds}::bigint[])`;
 const [identities]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text,'sha256'),'hex') sha256
  from public.identities i where ${identityIds}::uuid[] is null or id=any(${identityIds}::uuid[])`;
 return {audit:{...audit},identities:{...identities}};
}
function validatePerformanceRollbackData(e,readSource){
 if(e?.kind!=='phase5-planning-year-read-performance'||e.mode!=='rollback'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'
  ||e.complete!==true||e.rollback!==true||e.reset!==false||e.originalDefinitionHash!==PERFORMANCE_ORIGINAL_DEFINITION_HASH
  ||!hashPattern.test(e.candidateDefinitionHash??'')||e.candidateDefinitionHash===e.originalDefinitionHash
  ||e.originalFoundationHash!==PERFORMANCE_FOUNDATION_HASH||e.originalTestHash!==PERFORMANCE_ORIGINAL_TEST_HASH
  ||!hashPattern.test(e.baselineFingerprint??'')||e.baselineFingerprint!==e.finalFingerprint
  ||!e.beforeCatalog||!e.afterCatalog||performanceCatalogFingerprint(e.beforeCatalog)!==e.baselineFingerprint||performanceCatalogFingerprint(e.afterCatalog)!==e.finalFingerprint||!equal(e.beforeCatalog,e.afterCatalog)
  ||e.functionsAndJournalPreserved!==true||e.aclUnchanged!==true||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true
  ||e.originalAuditPreserved!==true||e.identityAnchorsPreserved!==true||!originalAnchorsValid(e.originalAnchors,e.finalOriginalAnchors)
  ||!originalAnchorsValid(e.finalAllAnchors,e.finalAllAnchors)
  ||['audit','identities'].some(key=>e.finalAllAnchors[key].count<e.originalAnchors[key].count)
  ||e.cleanupStatus!=='PASS'||!planningCleanupPreserved(e.cleanup)
  ||!equal(e.beforeAcl,e.afterAcl)||!exactFunctions(e.beforeWorkerFunctions??[],WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],WORKER_ENTRIES)
  ||!exactFunctions(Object.keys(e.originalHashes??{}),PLANNING_TABLES)||!equal(e.originalHashes,e.finalHashes)
  ||e.definitionDiff?.unexpectedDifferences!==0||!exactFunctions(e.definitionDiff?.changedDefinitions??[],[PERFORMANCE_ENTRY])
  ||e.definitionDiff?.originalDefinitionHash!==e.originalDefinitionHash||e.definitionDiff?.candidateDefinitionHash!==e.candidateDefinitionHash
  ||!e.parity?.ok||!exactFunctions((e.parity.cases??[]).map(c=>c.name),PERFORMANCE_SQL_CASES)
  ||!tapEvidenceValid(e.sql?.tap,143)||e.sql.exitCode!==0||performanceSqlNeedsCompletionProof(e.sql)||performanceSqlNeedsCompletionProof(e.originalSql)||!tapEvidenceValid(e.originalSql?.tap,93)||e.originalSql.exitCode!==0
  ||!e.originalSql?.parity?.ok||!e.originalSql.parity.cases?.every(c=>c.ok===true)||!exactFunctions((e.originalSql.parity.cases??[]).map(c=>c.name),PERFORMANCE_ORIGINAL_PARITY_CASES)
  ||!(e.reusableExplicitNamedSqlComponents?reserveTimingEvidenceValid(e.timings):timingSamplesComplete(e.timings?.samples,false))||e.final38ProofStatus!=='PASS'
  ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??'')
  ||!Array.isArray(e.checks)||!e.checks.length||!e.checks.every(c=>c.ok===true))throw Error('REFUSED: full rollback parity, exact original state and real HTTP baseline required');
 const parity=performanceParityProof(e.parity.cases.map(c=>'PLANNING_PERFORMANCE_PARITY|'+JSON.stringify(c)).join('\n'));
 if(!parity.ok)throw Error('REFUSED: incomplete or unequal source parity');
 if(e.sourceHash!==sha(readSource(`supabase/migrations/${PERFORMANCE_MIGRATION}`))||e.testHash!==sha(readSource(PERFORMANCE_TEST)))throw Error('REFUSED: exact corrective SQL/test hash required');
 for(const p of PERFORMANCE_SOURCE_PATHS)if(e.sourceHashes?.[p]!==sha(readSource(p)))throw Error('REFUSED: corrective proof sources changed');
}

// A failed historical coordinator is not made PASS. Only these exact, source-bound SQL
// components may be used by a separately reviewed reserve run; its new baselines are fresh.
export function validateReusablePerformanceSql(e,{reportHash,readHistorical,readCurrent,currentFullReportHash,runtimePaths}={}){
 if(!hashPattern.test(reportHash??'')||typeof readHistorical!=='function'||typeof readCurrent!=='function'
  ||! /^[a-f0-9]{40}$/u.test(e?.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e?.workerBuildRevision??'')||e.reusableExplicitNamedSqlComponents
  ||!(e.sourceCommit===SEALED_OLD_COMMIT&&reportHash===SEALED_OLD_REPORT_HASH||reportHash===currentFullReportHash)
  ||e.kind!=='phase5-planning-year-read-performance'||e.mode!=='rollback'||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.reset!==false||e.rollback!==true
  ||!(e.status==='PASS'&&e.complete===true||e.status==='FAIL'&&e.complete===false&&(e.failure==null||e.failure.code==='REQUEST_TIMEOUT')&&e.timings?.failure?.code==='REQUEST_TIMEOUT')
  ||e.originalDefinitionHash!==PERFORMANCE_ORIGINAL_DEFINITION_HASH||!hashPattern.test(e.candidateDefinitionHash??'')||e.candidateDefinitionHash===e.originalDefinitionHash
  ||e.originalFoundationHash!==PERFORMANCE_FOUNDATION_HASH||e.originalTestHash!==PERFORMANCE_ORIGINAL_TEST_HASH
  ||!tapEvidenceValid(e.sql?.tap,143)||e.sql.exitCode!==0||performanceSqlNeedsCompletionProof(e.sql)||performanceSqlNeedsCompletionProof(e.originalSql)||e.sql.timedOut===true||e.sqlCompletionPending===true||e.timings?.cleanupDeferred===true||!tapEvidenceValid(e.originalSql?.tap,93)||e.originalSql.exitCode!==0||e.originalSql.timedOut===true
  ||!e.parity?.ok||!performanceParityProof((e.parity.cases??[]).map(c=>'PLANNING_PERFORMANCE_PARITY|'+JSON.stringify(c)).join('\n')).ok
  ||!e.originalSql.parity?.ok||!exactFunctions((e.originalSql.parity.cases??[]).map(c=>c.name),PERFORMANCE_ORIGINAL_PARITY_CASES)||!e.originalSql.parity.cases.every(c=>c.ok===true)
  ||e.definitionDiff?.unexpectedDifferences!==0||!exactFunctions(e.definitionDiff?.changedDefinitions??[],[PERFORMANCE_ENTRY])
  ||e.definitionDiff.originalDefinitionHash!==e.originalDefinitionHash||e.definitionDiff.candidateDefinitionHash!==e.candidateDefinitionHash
  ||!equal(e.beforeCatalog,e.afterCatalog)||performanceCatalogFingerprint(e.beforeCatalog)!==e.baselineFingerprint||e.baselineFingerprint!==e.finalFingerprint
  ||!exactFunctions(Object.keys(e.originalHashes??{}),PLANNING_TABLES)||!equal(e.originalHashes,e.finalHashes)
  ||!equal(e.beforeAcl,e.afterAcl)||!exactFunctions(e.beforeWorkerFunctions??[],WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],WORKER_ENTRIES)
  ||!originalAnchorsValid(e.originalAnchors,e.finalOriginalAnchors)||!originalAnchorsValid(e.finalAllAnchors,e.finalAllAnchors)
  ||['audit','identities'].some(k=>e.finalAllAnchors[k].count<e.originalAnchors[k].count)
  ||e.cleanupStatus!=='PASS'||!planningCleanupPreserved(e.cleanup)||e.final38ProofStatus!=='PASS'
  ||['functionsAndJournalPreserved','aclUnchanged','originalBusinessPreserved','originalTimestampsPreserved','originalAuditPreserved','identityAnchorsPreserved'].some(k=>e[k]!==true)
  ||!Array.isArray(e.checks)||!exactFunctions(e.checks.map(c=>c.name),[...REUSE_REQUIRED_CHECKS,LEGACY_HTTP_CHECK])
  ||REUSE_REQUIRED_CHECKS.some(name=>e.checks.find(c=>c.name===name)?.ok!==true)
  ||e.checks.some(c=>c.ok!==true&&c.name!==LEGACY_HTTP_CHECK)
  ||!exactFunctions(Object.keys(e.sourceHashes??{}),PERFORMANCE_SOURCE_PATHS))throw Error('REFUSED: exact sealed named SQL components, historical preservation and only HTTP timeout required');
 for(const path of PERFORMANCE_SOURCE_PATHS){
  const historic=readHistorical(path,e.sourceCommit);
  if(e.sourceHashes[path]!==sha(historic)||!PERFORMANCE_REUSE_TOOL_PATHS.includes(path)&&sha(historic)!==sha(readCurrent(path)))throw Error('REFUSED: reused SQL/runtime/fixture/grant bytes changed');
 }
 if(!Array.isArray(runtimePaths)||!runtimePaths.length||!['web/package.json','web/lib/programplan-catalog.ts','web/lib/server/planning-year.test.mjs'].every(p=>runtimePaths.includes(p))
  ||runtimePaths.some(p=>!(p.startsWith('web/lib/')||p.startsWith('web/app/api/')||['web/package.json','web/package-lock.json'].includes(p)))
  ||new Set(runtimePaths).size!==runtimePaths.length||runtimePaths.some(p=>sha(readHistorical(p,e.sourceCommit))!==sha(readCurrent(p))))throw Error('REFUSED: complete immutable runtime manifest required');
 if(e.sourceHash!==sha(readCurrent(`supabase/migrations/${PERFORMANCE_MIGRATION}`))||e.testHash!==sha(readCurrent(PERFORMANCE_TEST)))throw Error('REFUSED: reused candidate/test source changed');
 return {status:'PASS',namedComponents:SQL_COMPONENT_NAMES,sql:e.sql,originalSql:e.originalSql,parity:e.parity,definitionDiff:e.definitionDiff,
  candidateDefinitionHash:e.candidateDefinitionHash,originalDefinitionHash:e.originalDefinitionHash};
}
export const readHistoricalPerformanceSource=(path,commit)=>execFileSync('git',['show',`${commit}:${path}`],{cwd:root,maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore']});
const historicalSource=readHistoricalPerformanceSource;

const componentHash=e=>sha(JSON.stringify({sql:e.sql,originalSql:e.originalSql,parity:e.parity,definitionDiff:e.definitionDiff}));
const runtimeManifest=commit=>execFileSync('git',['ls-tree','-r','--name-only',commit,'--','web/lib','web/app/api','web/package.json','web/package-lock.json'],
 {cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n');
function immutableReportCopy(path){
 const canonical=canonicalPerformanceEvidencePath(path,{input:true}),raw=readFileSync(canonical),hash=sha(raw);
 const preserved=canonicalPerformanceEvidencePath(join(dirname(canonical),`phase5-read-performance-sealed-full-${hash}.json`));
 if(existsSync(preserved)){if(sha(readFileSync(preserved))!==hash)throw Error('REFUSED: preserved SQL report drift');}
 else writeFileSync(preserved,raw,{flag:constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW});
 return {report:preserved,reportHash:hash,sourceCommit:JSON.parse(raw.toString()).sourceCommit,componentHash:componentHash(JSON.parse(raw.toString()))};
}
function loadReusablePerformanceSql(path,readCurrent=read){
 const canonical=canonicalPerformanceEvidencePath(path,{input:true}),raw=readFileSync(canonical),e=JSON.parse(raw.toString()),reportHash=sha(raw);
 const latestPath=join(root,'work/pilot/results/phase5-38-read-performance-rollback.json');
 if(!existsSync(latestPath))throw Error('REFUSED: current full SQL report required');
 const latest=readFileSync(latestPath),newer=JSON.parse(latest.toString()),currentFullReportHash=sha(latest);
 if(newer.reusableExplicitNamedSqlComponents)throw Error('REFUSED: first reserve seal requires a preserved full-run report');
 const runtimePaths=runtimeManifest(e.sourceCommit);
 const component=validateReusablePerformanceSql(e,{reportHash,currentFullReportHash,readHistorical:historicalSource,readCurrent,runtimePaths});
 validateReusablePerformanceSql(newer,{reportHash:currentFullReportHash,currentFullReportHash,readHistorical:historicalSource,readCurrent,runtimePaths:runtimeManifest(newer.sourceCommit)});
 if(newer.candidateDefinitionHash!==e.candidateDefinitionHash||!equal(newer.parity,e.parity))throw Error('REFUSED: contradictory newer SQL proof');
 // Only explicit reserve preparation copies byte-identical reports to new hash-named files.
 // Later validation reads those immutable references without creating or rewriting evidence.
 const preserved=immutableReportCopy(canonical),currentFullReport=immutableReportCopy(latestPath);
 return {...component,policy:PERFORMANCE_RESERVE_POLICY,...preserved,currentFullReport,workerBuildRevision:e.workerBuildRevision,
  originalReportStatus:e.status,originalReportComplete:e.complete,
  historicalSourceHashes:e.sourceHashes,runtimeHashes:Object.fromEntries(runtimePaths.map(p=>[p,sha(historicalSource(p,e.sourceCommit))]))};
}
function validateNamedComponents(report,seal){
 if(!equal(report.sql,seal.sql)||!equal(report.originalSql,seal.originalSql)||!equal(report.parity,seal.parity)||!equal(report.definitionDiff,seal.definitionDiff)
  ||report.candidateDefinitionHash!==seal.candidateDefinitionHash||report.workerBuildRevision!==seal.workerBuildRevision)throw Error('REFUSED: named reused components drift');
}
function validateReuseSeal(seal,readCurrent){
 if(seal?.policy!==PERFORMANCE_RESERVE_POLICY||!exactFunctions(seal.namedComponents??[],SQL_COMPONENT_NAMES)||!seal.currentFullReport)throw Error('REFUSED: explicit reviewed reserve seal required');
 const path=canonicalPerformanceEvidencePath(seal.report,{input:true}),fullPath=canonicalPerformanceEvidencePath(seal.currentFullReport.report,{input:true});
 const raw=readFileSync(path),fullRaw=readFileSync(fullPath),e=JSON.parse(raw.toString()),full=JSON.parse(fullRaw.toString());
 if(sha(raw)!==seal.reportHash||sha(fullRaw)!==seal.currentFullReport.reportHash||full.sourceCommit!==seal.currentFullReport.sourceCommit
  ||componentHash(full)!==seal.currentFullReport.componentHash)throw Error('REFUSED: immutable full SQL report reference/hash drift');
 const runtimePaths=runtimeManifest(e.sourceCommit),context={reportHash:sha(raw),currentFullReportHash:sha(fullRaw),readHistorical:historicalSource,readCurrent,runtimePaths};
 const component=validateReusablePerformanceSql(e,context);
 validateReusablePerformanceSql(full,{...context,reportHash:sha(fullRaw),runtimePaths:runtimeManifest(full.sourceCommit)});
 const expected={...component,policy:PERFORMANCE_RESERVE_POLICY,report:path,reportHash:sha(raw),sourceCommit:e.sourceCommit,componentHash:componentHash(e),
  currentFullReport:{report:fullPath,reportHash:sha(fullRaw),sourceCommit:full.sourceCommit,componentHash:componentHash(full)},workerBuildRevision:e.workerBuildRevision,
  originalReportStatus:e.status,originalReportComplete:e.complete,historicalSourceHashes:e.sourceHashes,
  runtimeHashes:Object.fromEntries(runtimePaths.map(p=>[p,sha(historicalSource(p,e.sourceCommit))]))};
 if(!equal(seal,expected)||full.candidateDefinitionHash!==e.candidateDefinitionHash||!equal(full.parity,e.parity))throw Error('REFUSED: sealed SQL report/source/component drift');
 const canonical=join(root,'work/pilot/results/phase5-38-read-performance-rollback.json');
 if(existsSync(canonical)){
  const currentRaw=readFileSync(canonical),current=JSON.parse(currentRaw.toString());
  if(current.reusableExplicitNamedSqlComponents){
   // Non-recursive: run the complete shared rollback data/source gate, then require the
   // identical already-verified seal and components. It cannot introduce another waiver.
   validatePerformanceRollbackData(current,readCurrent);
   if(!equal(current.reusableExplicitNamedSqlComponents,seal))throw Error('REFUSED: canonical accepted reserve seal differs');
   validateNamedComponents(current,seal);
  }else if(sha(currentRaw)!==seal.currentFullReport.reportHash){
   validateReusablePerformanceSql(current,{...context,reportHash:sha(currentRaw),currentFullReportHash:sha(currentRaw),runtimePaths:runtimeManifest(current.sourceCommit)});
   if(current.candidateDefinitionHash!==e.candidateDefinitionHash||!equal(current.parity,e.parity))throw Error('REFUSED: contradictory newer canonical SQL result');
  }
 }
 return expected;
}
export function validatePerformanceRollback(e,readSource){
 validatePerformanceRollbackData(e,readSource);
 if(e.reusableExplicitNamedSqlComponents)validateNamedComponents(e,validateReuseSeal(e.reusableExplicitNamedSqlComponents,readSource));
}
export function candidateDefinitionRollbackScript(candidate,foundation){
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n${extractOriginalPlanningRows(foundation)}\n`
  +`create temp table performance_original_catalog as select ${performanceCatalogSql()} value;\n${candidate}\n`
  +`select 'PLANNING_PERFORMANCE_DEFINITION|'||jsonb_build_object('signature','${PERFORMANCE_ENTRY}','definitionHash',encode(extensions.digest(pg_get_functiondef('${PERFORMANCE_ENTRY}'::regprocedure),'sha256'),'hex'))::text;\n`
  +`select 'PLANNING_PERFORMANCE_CATALOG|'||jsonb_build_object('before',(select value from performance_original_catalog),'after',${performanceCatalogSql()})::text;\nrollback;\n`;
}
export function samePlanningTimingSelection(actual,expected){
 return actual&&expected&&typeof actual==='object'&&typeof expected==='object'&&!Array.isArray(actual)&&!Array.isArray(expected)
  &&exactFunctions(Object.keys(actual),Object.keys(expected))&&Object.keys(expected).every(k=>actual[k]===expected[k]);
}
export function classifyPerformanceTimeout(error,elapsedMs,signal){
 return error instanceof DOMException&&error.name==='TimeoutError'&&Number.isFinite(elapsedMs)&&elapsedMs>=30000
  &&signal instanceof AbortSignal&&signal.aborted&&signal.reason===error;
}
const SAFE_FAILURE_NAMES=new Set(['Error','TypeError','SyntaxError','RangeError','AbortError','TimeoutError','AggregateError']);
const SAFE_TRANSPORT_CODES=new Set(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET',
 'UND_ERR_ABORTED','UND_ERR_DESTROYED','UND_ERR_CLOSED','UND_ERR_RESPONSE_STATUS_CODE','ECONNRESET','ECONNREFUSED','ECONNABORTED',
 'ETIMEDOUT','EPIPE','ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH']);
const safeFailureName=value=>SAFE_FAILURE_NAMES.has(value)?value:null;
const safeTransportCode=value=>SAFE_TRANSPORT_CODES.has(value)?value:null;
export function performanceSafeTransportFailure(error){
 return {name:safeFailureName(error?.name),code:safeTransportCode(error?.code),causeCode:safeTransportCode(error?.cause?.code)};
}
export function performanceTimingAttempt({name,iteration,phase,startedAt,auditBaseline,selection}){
 if(![...TIMING_CASES,'overview'].includes(name)||![1,2,3].includes(iteration)||!['before','after'].includes(phase)
  ||typeof startedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(startedAt)
  ||!Number.isSafeInteger(auditBaseline?.count)||auditBaseline.count<0||!/^\d+$/u.test(auditBaseline.maxEventId??'')
  ||!hashPattern.test(auditBaseline.sha256??''))throw Error('performance_attempt_metadata_invalid');
 return {case:name,iteration,phase,startedAt,auditBaseline:{count:auditBaseline.count,maxEventId:auditBaseline.maxEventId,sha256:auditBaseline.sha256},
  selectionHash:sha(JSON.stringify(selection)),stage:'fetch',response:null,transportFailure:null,timeoutSignal:null,completionFailure:null};
}
export function recordPerformanceAttemptResponse(attempt,response,error,signal,elapsedMs){
 const received=response?.headers.get('x-correlation-id')??null;
 const valid=typeof received==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(received);
 attempt.response=response?{httpStatus:response.status,correlationId:valid?received:null,correlationHeaderValid:received===null?null:valid}:null;
 attempt.elapsedMs=Number.isFinite(elapsedMs)&&elapsedMs>=0?elapsedMs:null;
 attempt.transportFailure=error?{stage:attempt.stage,...performanceSafeTransportFailure(error)}:null;
 // Snapshot at the transport outcome: a later timeout during audit waiting must not reclassify a network failure.
 attempt.timeoutSignal={kind:'AbortSignal.timeout',timeoutMs:30000,aborted:signal.aborted,
  reasonName:safeFailureName(signal.reason?.name),errorIsReason:!!error&&signal.reason===error};
}
export async function completePerformanceTimingAttempt(attempt,waitForCompletion){
 attempt.stage='audit-group';
 try{return await waitForCompletion(stage=>{if(['audit-group','session-barrier'].includes(stage))attempt.stage=stage;});}
 catch(error){
  const reasons={performance_unexpected_owned_audit_group:'UNEXPECTED_AUDIT_GROUP',performance_owned_db_transaction_not_finished:'AUDIT_GROUP_NOT_FINISHED',
   performance_owned_session_mismatch:'OWNED_SESSION_MISMATCH',performance_owned_session_barrier_failed:'SESSION_BARRIER_FAILED'};
  attempt.completionFailure={stage:attempt.stage,reason:reasons[error?.message]??(attempt.stage==='session-barrier'?'SESSION_BARRIER_FAILED':'AUDIT_READ_FAILED'),
   ...performanceSafeTransportFailure(error)};
  throw error;
 }
}
export function validateOwnedDbCompletion(sample){
 const d=sample?.dbCompletion,session={id:sample?.sessionId,identityId:sample?.identityId,membershipId:sample?.membershipId,assignmentId:sample?.assignmentId};
 if(!sample.auditBaseline||!hashPattern.test(sample.auditBaseline.sha256??'')||!/^\d+$/u.test(sample.auditBaseline.maxEventId??'')
  ||d?.ownedDbTransactionFinished!==true||d.sessionLockReleased!==true||d.barrier?.lockMode!=='FOR UPDATE'||d.barrier.rollback!==true
  ||d.barrier.sessionId!==sample.sessionId||!hashPattern.test(d.auditGroupHash??'')||d.auditCount!==4
  ||! /^[a-f0-9-]{36}$/u.test(d.correlationId??'')||d.correlationId!==sample.correlationId
  ||!Array.isArray(d.newEventIds)||d.newEventIds.length!==4||new Set(d.newEventIds).size!==4
  ||d.newEventIds.some(id=>!/^\d+$/u.test(id)||BigInt(id)<=BigInt(sample.auditBaseline.maxEventId))
  ||!planningAuditPair(d.events,session,sample.customerId,sample.case==='overview'?'oversikt':'lista')
  ||d.events.some(e=>e.correlation_id!==sample.correlationId)||sha(JSON.stringify(d.events))!==d.auditGroupHash
  ||!exactFunctions(d.events.map(e=>String(e.id)),d.newEventIds))throw Error('REFUSED: exact owned session audit group and rollback lock barrier required');
 return true;
}
export function validateCensoredTimingSample(sample){
 if(sample?.status!=='RIGHT_CENSORED'||sample.phase!=='before'||sample.errorName!=='TimeoutError'||sample.timeoutSignal?.kind!=='AbortSignal.timeout'||sample.timeoutSignal.timeoutMs!==30000||sample.timeoutSignal.aborted!==true||sample.timeoutSignal.reasonName!=='TimeoutError'||sample.timeoutSignal.errorIsReason!==true||sample.lowerBoundMs!==30000
  ||!Number.isFinite(sample.elapsedMs)||sample.elapsedMs<30000||sample.durationMs!==null||sample.count!==null||sample.rows!==null||sample.selectionRevision!==null
  ||!['list','search','page2'].includes(sample.case)||sample.businessUnchanged!==true||sample.auditPaired!==true
  ||![null,200].includes(sample.httpStatus)
  ||sample.httpStatus===null&&sample.noStore!==null||sample.httpStatus===200&&sample.noStore!==true
)throw Error('REFUSED: real timeout with unknown HTTP data required');
 validateOwnedDbCompletion(sample);return true;
}
function reserveSamplesComplete(samples){
 if(!Array.isArray(samples)||samples.length!==9)return false;
 const correlations=new Set(),eventIds=new Set(),owner=samples[0];let previousMax=0n;
 for(const s of samples){
  if(['sessionId','customerId','identityId','membershipId','assignmentId'].some(k=>s[k]!==owner[k]))return false;
  try{validateOwnedDbCompletion(s);if(BigInt(s.auditBaseline.maxEventId)<previousMax)return false;
   for(const id of s.dbCompletion.newEventIds){if(eventIds.has(id))return false;eventIds.add(id);previousMax=BigInt(id)>previousMax?BigInt(id):previousMax;}
  }catch{return false;}
 }
 if(!equal(samples.map(s=>[s.case,s.iteration]),TIMING_CASES.flatMap(name=>[1,2,3].map(i=>[name,i]))))return false;
 for(const name of TIMING_CASES){
  const group=samples.filter(s=>s.case===name);if(group.length!==3||!exactFunctions(group.map(s=>String(s.iteration)),['1','2','3']))return false;
  for(const s of group){
   if(s.status==='RIGHT_CENSORED'){try{validateCensoredTimingSample(s);}catch{return false;}}
   else if(s.status!=='PASS'||!Number.isFinite(s.durationMs)||s.durationMs<=0||s.durationMs>=30000||s.httpStatus!==200
    ||s.auditPaired!==true||s.noStore!==true||s.businessUnchanged!==true||!/^sha256:[a-f0-9]{64}$/u.test(s.selectionRevision??'')
    ||s.count!==(name==='search'?1:52)||s.rows!==(name==='search'?1:name==='page2'?2:50)||s.phase!=='before')return false;
   try{validateOwnedDbCompletion(s);}catch{return false;}
   if(typeof s.correlationId!=='string'||correlations.has(s.correlationId))return false;correlations.add(s.correlationId);
  }
  const revisions=group.filter(s=>s.status==='PASS').map(s=>s.selectionRevision);if(new Set(revisions).size>1)return false;
 }
 return true;
}

export function validateReserveTimingEvidence(timings){
 if(timings?.policy!==PERFORMANCE_RESERVE_POLICY||timings.cleanupDeferred!==false||!reserveSamplesComplete(timings.samples))throw Error('REFUSED: all nine serial complete/censored owned samples required');
 const successfulList=timings.samples.filter(s=>s.case==='list'&&s.status==='PASS'),prep=timings.sqlPreparation;
 const request=timings.samples[0].requestSelection;
 if(!request||!equal(planningSelection(request.schoolYear,{view:'programplan',query:request.query,status:'utkast'}),request))throw Error('REFUSED: exact owned first-page timing selection required');
 const revision=successfulList[0]?.selectionRevision??prep?.selectionRevision;
 for(const s of timings.samples){
  const expected={...request,...(s.case==='page2'?{page:2,selectionRevision:revision}:s.case==='search'?{query:timings.samples.find(x=>x.case==='search').requestSelection?.query}:{})};
  if(!equal(s.requestSelection,expected)||s.case==='search'&&s.requestSelection.query===request.query)throw Error('REFUSED: owned serial HTTP request selection/page/revision mismatch');
 }
 if(successfulList.length){if(prep!==null)throw Error('REFUSED: unused SQL prefetch must not be presented as an HTTP response');return true;}
 const owner=timings.samples[0],event=prep?.auditEvent;
 if(prep?.kind!=='OWNED_SQL_PREPARATION'||prep.transport!=='postgres'||prep.httpResponse!==false||prep.count!==52||prep.rows!==50
  ||!/^sha256:[a-f0-9]{64}$/u.test(prep.selectionRevision??'')||prep.sessionId!==owner.sessionId||!equal(prep.requestSelection,request)||prep.ownedDbTransactionFinished!==true
  ||prep.auditCount!==1||!hashPattern.test(prep.auditHash??'')||prep.auditHash!==sha(JSON.stringify([event]))
  ||event?.source!=='db'||event.action!=='planning_year_list_read'||event.outcome!=='ok'||event.session_id!==owner.sessionId
  ||event.actor_identity_id!==owner.identityId||event.membership_id!==owner.membershipId||event.assignment_id!==owner.assignmentId||event.customer_id!==owner.customerId
  ||event.correlation_id!==prep.correlationId||event.object_type!=='planning_year_collection'||event.object_id!==null||!/^\d+$/u.test(String(event.id))
  ||prep.barrier?.lockMode!=='FOR UPDATE'||prep.barrier.rollback!==true||prep.barrier.sessionId!==owner.sessionId
  ||timings.samples.some(s=>s.sessionId!==owner.sessionId||s.customerId!==owner.customerId)
  ||!/^[a-f0-9-]{36}$/u.test(prep.correlationId??'')||timings.samples.some(s=>s.correlationId===prep.correlationId||s.dbCompletion.newEventIds.includes(String(event.id)))
  ||BigInt(event.id)<=BigInt(timings.samples.filter(s=>s.case==='search').at(-1).dbCompletion.newEventIds.at(-1))
  ||timings.samples.filter(s=>s.case==='page2').some(s=>BigInt(event.id)>BigInt(s.auditBaseline.maxEventId)))throw Error('REFUSED: separately owned actual SQL page-revision preparation before timing audit baseline required');
 return true;
}
const reserveTimingEvidenceValid=timings=>{try{return validateReserveTimingEvidence(timings);}catch{return false;}};

export function performanceTimingLowerBoundProof(before,after,sqlPreparation=null){
 if(!reserveTimingEvidenceValid({policy:PERFORMANCE_RESERVE_POLICY,cleanupDeferred:false,samples:before,sqlPreparation})||!timingSamplesComplete(after,true))return {policy:PERFORMANCE_RESERVE_POLICY,ok:false,groups:{}};
 const groups={};let ok=true;
 for(const name of TIMING_CASES){
  const values=before.filter(s=>s.case===name).map(s=>s.status==='RIGHT_CENSORED'?s.lowerBoundMs:s.durationMs);
  const lower=timingSummary(values.map(durationMs=>({durationMs}))),current=timingSummary(after.filter(s=>s.case===name));
  const speedupLowerBound=lower.medianMs/current.medianMs,pass=speedupLowerBound>=3&&current.medianMs<=5000&&current.maximumMs<10000;
  groups[name]={beforeLowerBound:lower,after:current,censoredCount:before.filter(s=>s.case===name&&s.status==='RIGHT_CENSORED').length,speedupLowerBound,ok:pass};ok&&=pass;
 }
 const overview=timingSummary(after.filter(s=>s.case==='overview'));groups.overview={after:overview,ok:overview.medianMs<=5000&&overview.maximumMs<10000};ok&&=groups.overview.ok;
 return {policy:PERFORMANCE_RESERVE_POLICY,ok,groups};
}
export function computeAcceptedPerformanceTimingProof(rollbackReport,appliedReport,readSource=read){
 validatePerformanceRollback(rollbackReport,readSource);
 if(rollbackReport.reusableExplicitNamedSqlComponents){
  if(!equal(rollbackReport.reusableExplicitNamedSqlComponents,appliedReport.reusableExplicitNamedSqlComponents))throw Error('REFUSED: applied timing lost exact reused SQL seal');
  return performanceTimingLowerBoundProof(rollbackReport.timings.samples,appliedReport.timings.samples,rollbackReport.timings.sqlPreparation);
 }
 return performanceTimingProof(rollbackReport.timings.samples,appliedReport.timings.samples);
}

export function performanceProgress(line){
 const match=line.match(/\bNOTICE:\s+PERFORMANCE_PROGRESS\|([a-z0-9-]+)\|([A-Z0-9]{5})$/u);
 return match&&PERFORMANCE_SQL_CASES.includes(match[1])?{case:match[1],state:match[2]}:null;
}
export async function performanceProcessResult(command,args,{input,timeoutMs=7200000,progress=false,onAbort}={}){
 return new Promise((done,reject)=>{
  const proc=spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];
  let bytes=0,timedOut=false,outputOverflow=false,streamError=false,abortStarted=false,abortError=false,abortProof=null,progressBuffer='',killTimer,abortWork=Promise.resolve();
  const abort=()=>{if(abortStarted)return;abortStarted=true;
   abortWork=Promise.resolve().then(()=>onAbort?.()).then(proof=>{abortProof=proof??null;},()=>{abortError=true;});
   proc.kill('SIGTERM');killTimer=setTimeout(()=>proc.kill('SIGKILL'),5000);
  };
  const timer=setTimeout(()=>{timedOut=true;abort();},timeoutMs);
  const collect=chunks=>chunk=>{bytes+=chunk.length;if(bytes>32*1024*1024){outputOverflow=true;abort();return;}chunks.push(chunk);};
  proc.stdout.on('data',collect(stdout));proc.stderr.on('data',chunk=>{
   collect(stderr)(chunk);if(progress){progressBuffer+=chunk.toString('utf8');const lines=progressBuffer.split('\n');progressBuffer=lines.pop();
    for(const line of lines){const value=performanceProgress(line);if(value)process.stdout.write(`SQL ${value.case}: ${value.state}\n`);}}
  });
  proc.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error);});
  proc.once('close',async(exitCode,signal)=>{clearTimeout(timer);clearTimeout(killTimer);await abortWork;
   done({exitCode,signal,timedOut,outputOverflow,streamError,abortError,abortProof,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});});
  proc.stdin.on('error',error=>{if(error.code!=='EPIPE'){streamError=true;abort();}});proc.stdin.end(input);
 });
}
const runProcess=performanceProcessResult;
export const performanceSqlNeedsCompletionProof=r=>r?.exitCode!==0||r.timedOut===true||r.outputOverflow===true||r.streamError===true||Boolean(r.signal);
async function boundedOwnedBackendStop(db,applicationName){
 let timer;try{return await Promise.race([stopOwnedPerformanceBackend(db,applicationName),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('performance_owned_backend_not_stopped')),20000);})]);}finally{clearTimeout(timer);}
}
async function stopOwnedPerformanceBackend(db,applicationName){
 const deadline=Date.now()+15000;
 for(;Date.now()<deadline;){
  const owned=await db`select pid from pg_stat_activity where application_name=${applicationName} and usename='postgres' and backend_type='client backend'`;
  for(const row of owned)await db`select pg_terminate_backend(${row.pid}) where exists(select 1 from pg_stat_activity where pid=${row.pid} and application_name=${applicationName} and usename='postgres' and backend_type='client backend')`;
  const [state]=await db`select not exists(select 1 from pg_stat_activity where application_name=${applicationName}) stopped`;
  if(state.stopped)return {ownedBackendStopped:true};await new Promise(done=>setTimeout(done,50));
 }
 throw Error('performance_owned_backend_not_stopped');
}
async function runSql(target,script,controlDb){
 const applicationName=`p5_planning_perf_${randomUUID()}`,onAbort=()=>boundedOwnedBackendStop(controlDb,applicationName);
 const result=await runProcess('docker',['exec','-i','-e',`PGAPPNAME=${applicationName}`,`supabase_db_${target.projectId}`,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-f','-'],{input:script,progress:true,onAbort});
 try{
  if(result.abortError)throw Error('performance_owned_backend_not_stopped');
  if(performanceSqlNeedsCompletionProof(result))result.ownedBackendStopped=(await onAbort()).ownedBackendStopped;
 }catch(error){error.ownedDbCompletionUnknown=true;error.ownedApplicationName=applicationName;throw error;}
 return result;
}
const proofOutput=result=>({exitCode:result.exitCode,timedOut:result.timedOut,outputOverflow:result.outputOverflow,streamError:result.streamError,signal:result.signal,ownedBackendStopped:result.ownedBackendStopped??null,tap:planningTapProof(result.stdout,1),
 error:performanceSqlNeedsCompletionProof(result)?result.timedOut?'SQL_TIMEOUT':result.outputOverflow?'SQL_OUTPUT_LIMIT':'SQL_PROOF_FAILED':null});
async function assertOwnedTimingSession(db,fixture,lock=false){
 await assertTarget('protected');
 const rows=lock?await db`select s.id from public.app_sessions s join public.memberships m on m.id=s.membership_id
  join public.access_assignments a on a.id=s.assignment_id join public.customers c on c.id=m.customer_id
  join public.organizers o on o.id=a.organizer_id and o.customer_id=c.id
  where s.id=${fixture.hm.id} and s.identity_id=${fixture.hm.identityId} and s.membership_id=${fixture.hm.membershipId}
   and s.assignment_id=${fixture.hm.assignmentId} and m.identity_id=s.identity_id and a.membership_id=m.id
   and c.id=${fixture.customerId} and o.id=${fixture.organizerId} and c.name='Syntetiskt programplansprov' for update of s`
  :await db`select s.id from public.app_sessions s join public.memberships m on m.id=s.membership_id
   join public.access_assignments a on a.id=s.assignment_id join public.customers c on c.id=m.customer_id
   join public.organizers o on o.id=a.organizer_id and o.customer_id=c.id
   where s.id=${fixture.hm.id} and s.identity_id=${fixture.hm.identityId} and s.membership_id=${fixture.hm.membershipId}
    and s.assignment_id=${fixture.hm.assignmentId} and m.identity_id=s.identity_id and a.membership_id=m.id
    and c.id=${fixture.customerId} and o.id=${fixture.organizerId} and c.name='Syntetiskt programplansprov'`;
 if(rows.length!==1)throw Error('performance_owned_session_mismatch');
}
async function ownedSessionBarrier(db,fixture){
 const rollback=Error('performance_owned_barrier_rollback');let locked=false;
 try{await db.begin(async tx=>{
  await tx`set local lock_timeout='5s'`;await assertOwnedTimingSession(tx,fixture,true);locked=true;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 if(!locked)throw Error('performance_owned_session_barrier_failed');
 return {sessionId:fixture.hm.id,lockMode:'FOR UPDATE',rollback:true};
}
async function timingAuditBaseline(db,fixture){
 await assertOwnedTimingSession(db,fixture);
 const [r]=await db`select count(*)::integer count,coalesce(max(id),0)::text "maxEventId",
  encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by id),'[]'::jsonb)::text,'sha256'),'hex') sha256
  from public.security_events e where e.session_id=${fixture.hm.id} and e.customer_id=${fixture.customerId}`;
 return {...r};
}
async function awaitOwnedDbCompletion(db,fixture,baseline,expectedCorrelationId,route='lista',onStage=()=>{}){
 let events=[];
 for(const deadline=Date.now()+90000;Date.now()<deadline;){
  events=await db`select id::text id,correlation_id::text correlation_id,source,action,outcome,
   actor_identity_id::text actor_identity_id,membership_id::text membership_id,assignment_id::text assignment_id,
   session_id::text session_id,customer_id::text customer_id,object_type,object_id::text object_id
   from public.security_events where session_id=${fixture.hm.id} and customer_id=${fixture.customerId} and id>${baseline.maxEventId}::bigint order by id`;
  const correlations=new Set(events.map(e=>e.correlation_id));
  if(events.length>4||correlations.size>1||events.some(e=>e.outcome!=='ok'||expectedCorrelationId&&e.correlation_id!==expectedCorrelationId))throw Error('performance_unexpected_owned_audit_group');
  if(events.length===4&&planningAuditPair(events,fixture.hm,fixture.customerId,route)){
   onStage('session-barrier');const barrier=await ownedSessionBarrier(db,fixture);
   return {ownedDbTransactionFinished:true,sessionLockReleased:true,barrier,correlationId:events[0].correlation_id,
    auditCount:4,auditGroupHash:sha(JSON.stringify(events)),events:events.map(e=>({...e})),newEventIds:events.map(e=>e.id)};
  }
  await new Promise(done=>setTimeout(done,100));
 }
 throw Error('performance_owned_db_transaction_not_finished');
}
async function prepareOwnedPageRevision(db,fixture,input){
 await assertOwnedTimingSession(db,fixture);const correlationId=randomUUID();let reply;
 await db.begin(async tx=>{
  await assertOwnedTimingSession(tx,fixture);
  await tx`select set_config('app.identity_id',${fixture.hm.identityId},true),set_config('app.session_id',${fixture.hm.id},true),
   set_config('app.customer_id',${fixture.customerId},true),set_config('app.membership_id',${fixture.hm.membershipId},true),
   set_config('app.assignment_id',${fixture.hm.assignmentId},true),set_config('app.correlation_id',${correlationId},true)`;
  const [r]=await tx`select public.phase5_planning_year_list(${JSON.stringify(input)}::jsonb) value`;reply=r.value;
 });
 if(reply?.count!==52||reply.rows?.length!==50||!/^sha256:[a-f0-9]{64}$/u.test(reply.selectionRevision??'')||!samePlanningTimingSelection(reply.selection,input))throw Error('performance_owned_sql_revision_preparation_failed');
 const events=await fixture.events(correlationId);
 if(events.length!==1||events[0].source!=='db'||events[0].action!=='planning_year_list_read'||events[0].outcome!=='ok'
  ||events[0].actor_identity_id!==fixture.hm.identityId||events[0].membership_id!==fixture.hm.membershipId||events[0].assignment_id!==fixture.hm.assignmentId
  ||events[0].session_id!==fixture.hm.id||events[0].customer_id!==fixture.customerId||events[0].object_type!=='planning_year_collection'||events[0].object_id!==null)throw Error('performance_owned_sql_revision_audit_failed');
 const barrier=await ownedSessionBarrier(db,fixture),event=events[0],auditEvent=Object.fromEntries(['id','correlation_id','source','action','outcome','actor_identity_id','membership_id','assignment_id','session_id','customer_id','object_type','object_id'].map(k=>[k,k==='id'?String(event[k]):event[k]]));
 return {kind:'OWNED_SQL_PREPARATION',transport:'postgres',httpResponse:false,correlationId,sessionId:fixture.hm.id,
  requestSelection:input,count:reply.count,rows:reply.rows.length,selectionRevision:reply.selectionRevision,auditCount:1,auditHash:sha(JSON.stringify([auditEvent])),auditEvent,barrier,ownedDbTransactionFinished:true};
}
// Own-fixture transport only: preserve every request option and existing deadline.
// The closure keeps tokens in memory; no transport metadata contains credentials.
export function installOwnedPerformanceTransport(baseURL,fixture){
 if(typeof baseURL!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL))throw Error('performance_transport_scope_refused');
 const origin=new URL(baseURL),port=Number(origin.port);
 if(port<1024||port>65535||port===3012)throw Error('performance_transport_scope_refused');
 const tokens=[fixture?.hm?.token,fixture?.principal?.token,fixture?.principalB?.token];
 if(tokens.some(token=>typeof token!=='string'||! /^[A-Za-z0-9_-]{32,128}$/u.test(token))||new Set(tokens).size!==3)throw Error('performance_transport_scope_refused');
 const cookies=new Set(tokens.map(token=>`sp_session=${token}`)),routes=new Set([
  '/api/programplaner/skapa','/api/programplaner/terminer','/api/programplaner/utbildning/livscykel',
  '/api/timplaner/gym/underlag','/api/timplaner/gym/skapa','/api/planering/urval','/api/planering/lista','/api/planering/oversikt']);
 const originalFetch=globalThis.fetch;let active=true;
 if(typeof originalFetch!=='function')throw Error('performance_transport_scope_refused');
 const transport=(input,options)=>{
  const request=typeof Request!=='undefined'&&input instanceof Request;
  const rawURL=request?input.url:input instanceof URL?input.href:typeof input==='string'?input:null;
  let url;try{url=rawURL===null?null:new URL(rawURL);}catch{url=null;}
  const headers=new Headers(options?.headers??(request?input.headers:undefined)),cookie=headers.get('cookie')??'';
  const owned=cookies.has(cookie),mentionsOwned=tokens.some(token=>cookie.includes(token));
  const routeInScope=url?.origin===origin.origin&&routes.has(url.pathname);
  if(!owned&&!mentionsOwned&&!routeInScope)return originalFetch(input,options);
  if(!active||!owned||request||!url||!routes.has(url.pathname)||rawURL!==`${baseURL}${url.pathname}`)throw Error('performance_transport_scope_refused');
  headers.set('Connection','close');
  return originalFetch(input,{...options,headers});
 };
 globalThis.fetch=transport;
 return ()=>{active=false;globalThis.fetch=originalFetch;};
}

export async function timingFixtureReserve(baseURL,phase='before',allowCensor=true){
 const {createPlanningYearFixture}=await import('./phase5-planning-year-fixtures.mjs');
 const target=await assertTarget('protected'),db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let fixture,cleanup,cleanupFailure,failure,restoreTransport,cleanupDeferred=false,dbCompletionPending=false,sqlPreparation=null,pendingAttempt=null;const samples=[];
 try{
  fixture=await createPlanningYearFixture();restoreTransport=installOwnedPerformanceTransport(baseURL,fixture);const metadata=await fixture.setup(baseURL),input=planningSelection(metadata.planningYear,{view:'programplan',query:metadata.pageQuery,status:'utkast'});
  let revision;
  for(const name of phase==='after'?[...TIMING_CASES,'overview']:TIMING_CASES)for(let iteration=1;iteration<=3;iteration++){
   if(name==='page2'&&!revision){sqlPreparation=await prepareOwnedPageRevision(db,fixture,input);revision=sqlPreparation.selectionRevision;}
   const selection={...input,...(name==='search'?{query:metadata.pageSearchQuery}:name==='page2'?{page:2,selectionRevision:revision}:{})};
   const before=await fixture.businessHashes(),auditBaseline=await timingAuditBaseline(db,fixture),startedAt=new Date().toISOString(),start=performance.now(),route=name==='overview'?'oversikt':'lista',signal=AbortSignal.timeout(30000);
   let response,body,durationMs,error;
   pendingAttempt=performanceTimingAttempt({name,iteration,phase,startedAt,auditBaseline,selection});dbCompletionPending=true;
   try{
    response=await fetch(`${baseURL}/api/planering/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`sp_session=${fixture.hm.token}`,
     'X-Context-Epoch':String(fixture.hm.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL},body:JSON.stringify(selection),signal});
    pendingAttempt.stage='response-json';body=await response.json();durationMs=performance.now()-start;
   }catch(caught){error=caught;}
   const elapsedMs=performance.now()-start;
   recordPerformanceAttemptResponse(pendingAttempt,response,error,signal,elapsedMs);
   // Keep transport diagnostics even when the exact audit/barrier wait itself fails.
   // Neither a pre-Worker network error nor a missing audit group is censor evidence.
   const dbCompletion=await completePerformanceTimingAttempt(pendingAttempt,onStage=>
    awaitOwnedDbCompletion(db,fixture,auditBaseline,response?.headers.get('x-correlation-id')??null,route,onStage));dbCompletionPending=false;
   if(error&&!(allowCensor&&phase==='before'&&classifyPerformanceTimeout(error,elapsedMs,signal)))throw error;
   pendingAttempt.stage='sample-validation';
   const common={case:name,iteration,phase,requestSelection:selection,startedAt,sessionId:fixture.hm.id,identityId:fixture.hm.identityId,membershipId:fixture.hm.membershipId,
    assignmentId:fixture.hm.assignmentId,customerId:fixture.customerId,correlationId:dbCompletion.correlationId,auditBaseline,dbCompletion,
    auditPaired:true,businessUnchanged:equal(before,await fixture.businessHashes())};
   const expected=name==='search'?{count:1,rows:1}:name==='page2'?{count:52,rows:2}:name==='overview'?{count:52,rows:52}:{count:52,rows:50};
   let sample;
   if(error){sample={...common,status:'RIGHT_CENSORED',timeoutSignal:{kind:'AbortSignal.timeout',timeoutMs:30000,aborted:signal.aborted,reasonName:signal.reason?.name,errorIsReason:signal.reason===error},errorName:error.name,elapsedMs,lowerBoundMs:30000,durationMs:null,httpStatus:response?.status??null,
    count:null,rows:null,selectionRevision:null,noStore:response?response.headers.get('cache-control')==='no-store':null};validateCensoredTimingSample(sample);}
   else{
    const noStore=response.headers.get('cache-control')==='no-store',ok=response.status===200&&noStore&&common.businessUnchanged&&body.count===expected.count&&body.rows?.length===expected.rows
     &&samePlanningTimingSelection(body.selection,selection)&&/^sha256:[a-f0-9]{64}$/u.test(body.selectionRevision??'');
    sample={...common,status:ok?'PASS':'FAIL',durationMs,httpStatus:response.status,count:body.count??null,rows:body.rows?.length??null,selectionRevision:body.selectionRevision??null,noStore};
    if(ok&&name==='list')revision??=body.selectionRevision;
   }
   samples.push(sample);process.stdout.write(`${sample.status} ${phase} ${name} ${iteration}: ${error?'>=30000':Math.round(durationMs)} ms; owned DB transaction finished\n`);
   if(sample.status==='FAIL')throw Error('performance_http_timing_failed');
   pendingAttempt=null;
  }
 }catch(error){failure=planningSafeFailure(error);cleanupDeferred=dbCompletionPending;}
 finally{
  restoreTransport?.();
  // Unknown database completion forbids both cleanup and a purported fresh preservation
  // snapshot. The owned fixture remains identifiable for a separate diagnosis.
  if(fixture&&!cleanupDeferred)try{cleanup=await fixture.cleanup();}catch(error){cleanupFailure={...planningSafeFailure(error),evidence:planningCleanupDiagnostics(error?.cleanupEvidence)};}
  await db.end({timeout:5});
 }
 return {transport:{kind:'owned-local-http-connection-close',connectionHeader:'close',originalSetupDeadlineMs:15000,planningDeadlineMs:30000},
  policy:allowCensor&&phase==='before'?PERFORMANCE_RESERVE_POLICY:null,ok:!failure&&!cleanupFailure&&!cleanupDeferred&&(allowCensor&&phase==='before'?reserveTimingEvidenceValid({policy:PERFORMANCE_RESERVE_POLICY,cleanupDeferred,sqlPreparation,samples}):timingSamplesComplete(samples,phase==='after'))&&planningCleanupPreserved(cleanup),
  samples,sqlPreparation,cleanup,cleanupDeferred,cleanupFailure,failure,pendingAttempt,
  pendingOwner:cleanupDeferred&&fixture?{customerId:fixture.customerId,organizerId:fixture.organizerId,sessionId:fixture.hm.id}:null};
}

export function preservePerformanceReport(path,value){
 assertPerformanceEvidenceOutput(path);
 if(existsSync(path)){const previous=JSON.parse(readFileSync(path,'utf8'));if(previous.status!=='PASS'){
  const history=path.replace(/\.json$/u,`-fail-${Date.now()}-${randomUUID()}.json`);copyFileSync(path,history,constants.COPYFILE_EXCL);
 }}
 const content=JSON.stringify(value,null,2)+'\n';writeFileSync(path,content,{flag:constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW});
 if(value.status!=='PASS')writeFileSync(path.replace(/\.json$/u,`-fail-${Date.now()}-${randomUUID()}.json`),content,{flag:'wx'});
}
const reportFile=preservePerformanceReport;
async function main(){
 const o=parseReadPerformanceArgs(process.argv.slice(2)),source=read(`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString(),test=read(PERFORMANCE_TEST).toString(),foundation=read(`supabase/migrations/${PLANNING_FOUNDATION}`).toString(),
  grants=read(`supabase/migrations/${PLANNING_GRANTS}`).toString(),originalTest=read(PLANNING_TEST).toString();
 if(sha(foundation)!==PERFORMANCE_FOUNDATION_HASH||sha(originalTest)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable 05-37 sources changed');
 const final38=JSON.parse(read('work/pilot/results/phase5-38-api-final.json').toString());validatePerformanceBaseApi(final38,read);
 const previous=o.mode==='applied'?JSON.parse(readFileSync(o.rollbackEvidence??join(root,'work/pilot/results/phase5-38-read-performance-rollback.json'),'utf8')):null;
 if(previous)validatePerformanceRollback(previous,read);
 const reused=o.reuseSqlEvidence?loadReusablePerformanceSql(o.reuseSqlEvidence):previous?.reusableExplicitNamedSqlComponents??null;
 assertPerformanceEvidenceOutput(o.out,[o.reuseSqlEvidence,o.rollbackEvidence,reused?.report,reused?.currentFullReport?.report,join(root,'work/pilot/results/phase5-38-api-final.json'),o.mode==='applied'?join(root,'work/pilot/results/phase5-38-read-performance-rollback.json'):null]);
 const {verifyPlanningYearBrowserTarget}=await import('./phase5-planning-year-fixtures.mjs');
 const proof=await verifyPlanningYearBrowserTarget(o.baseURL),target=await assertTarget('protected');
 if(proof.buildRevision!==final38.workerBuildRevision||previous&&proof.buildRevision!==previous.workerBuildRevision||reused&&proof.buildRevision!==reused.workerBuildRevision)throw Error('REFUSED: same actual verified Worker build required');
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const beforeCatalog=await readPerformanceCatalog(db),beforeAcl=await gymAcl(db),originalHashes=await planningBusinessHashes(db),
  baselineFingerprint=performanceCatalogFingerprint(beforeCatalog),sourceHashes=Object.fromEntries(PERFORMANCE_SOURCE_PATHS.map(p=>[p,sha(read(p))]));
 const originalAuditIds=(await db`select id::text from public.security_events order by id`).map(r=>r.id),
  originalIdentityIds=(await db`select id::text from public.identities order by id`).map(r=>r.id),
  originalAnchors=await originalAnchorSnapshot(db,originalAuditIds,originalIdentityIds);
 let afterCatalog,afterAcl,finalHashes,finalFingerprint,sql,originalSql,parity,definitionDiff,timings,cleanup,cleanupFailure=null,apiFinal,performanceProof,failure,
  originalDefinitionHash=PERFORMANCE_ORIGINAL_DEFINITION_HASH,candidateDefinitionHash,finalOriginalAnchors,finalAllAnchors;
 let sqlCompletionPending=false,pendingApplicationName=null;const checks=[];
 try{
  if(reused){
   const full=JSON.parse(readFileSync(reused.currentFullReport.report,'utf8'));
   if(o.mode==='rollback'){if(!equal(beforeCatalog,full.afterCatalog)||!equal(beforeAcl,full.afterAcl)||!equal(originalHashes,full.finalHashes))throw Error('REFUSED: fresh whole catalog/ACL/15 differ from sealed full SQL baseline');}
   else{const apply=JSON.parse(read('work/pilot/results/phase5-38-read-performance-apply.json').toString());
    if(apply.status!=='PASS'||apply.complete!==true||apply.targetProjectId!==target.projectId||apply.baselineFingerprint!==previous.baselineFingerprint||apply.afterFingerprint!==baselineFingerprint||!equal(apply.reusableExplicitNamedSqlComponents,reused)||!equal(beforeAcl,previous.afterAcl)||!equal(originalHashes,previous.finalHashes))throw Error('REFUSED: fresh applied full baseline differs from exact sealed application');
    assertPerformanceDiff(previous.beforeCatalog,beforeCatalog,{journal:'append',expectedSource:source});
   }
  }
  if(!equal(originalHashes,final38.finalHashes))throw Error('REFUSED: all15 original applied38 business rows changed before fresh verifier baseline');
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
  const result=await runSql(target,reused?candidateDefinitionRollbackScript(source,foundation):performanceRollbackScript(test,source,foundation),db);
  sql=reused?reused.sql:proofOutput(result);parity=reused?reused.parity:performanceParityProof(result.stdout);
  if(reused&&performanceSqlNeedsCompletionProof(result))throw Error('performance_fresh_candidate_definition_failed');
  const markers=result.stdout.split('\n').filter(l=>l.startsWith('PLANNING_PERFORMANCE_DEFINITION|'));
  const definition=markers.length===1?JSON.parse(markers[0].slice('PLANNING_PERFORMANCE_DEFINITION|'.length)):null;
  if(definition?.signature!==PERFORMANCE_ENTRY||!hashPattern.test(definition.definitionHash??''))throw Error('performance_candidate_definition_proof_missing');
  if(candidateDefinitionHash&&candidateDefinitionHash!==definition.definitionHash)throw Error('performance_candidate_definition_drift');candidateDefinitionHash=definition.definitionHash;
  checked(checks,'actual complete old/new JSONB and negative SQLSTATE parity',sql.exitCode===0&&sql.timedOut!==true&&sql.outputOverflow!==true&&sql.streamError!==true&&!sql.signal&&tapEvidenceValid(sql.tap,143)&&parity.ok);
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
  if(sql.exitCode!==0||sql.timedOut===true||sql.outputOverflow===true||sql.streamError===true||sql.signal||sql.tap.status!=='PASS'||!parity.ok)throw Error('performance_sql_parity_failed');
  if(reused&&o.mode==='rollback')originalSql=reused.originalSql;
  else{
   process.stdout.write('Running all 93 immutable original SQL assertions with rollback-only three-entry revoke\n');
   const historical=await runSql(target,historicalPlanningRollbackScript(originalTest),db);originalSql=proofOutput(historical);originalSql.parity=originalPlanningParityProof(historical.stdout);
  }
  checked(checks,'all93 original SQL tests and18 actual SQL/TypeScript contracts without skips',originalSql.exitCode===0&&originalSql.timedOut!==true&&originalSql.outputOverflow!==true&&originalSql.streamError!==true&&!originalSql.signal&&tapEvidenceValid(originalSql.tap,93)&&originalSql.tap.total===93&&originalSql.parity.ok);
  checked(checks,'historical closed-ACL assertion rollback restores exact rawACL28/full state',equal(beforeCatalog,await readPerformanceCatalog(db))&&equal(beforeAcl,await gymAcl(db))&&equal(originalHashes,await planningBusinessHashes(db)));
  if(originalSql.exitCode!==0||originalSql.timedOut===true||originalSql.outputOverflow===true||originalSql.streamError===true||originalSql.signal||originalSql.tap.status!=='PASS'||originalSql.tap.total!==93||!originalSql.parity.ok)throw Error('performance_original_sql_failed');
  if(reused&&candidateDefinitionHash!==reused.candidateDefinitionHash)throw Error('REFUSED: fresh canonical candidate disagrees with sealed SQL proof');
  timings=await timingFixtureReserve(o.baseURL,o.mode==='rollback'?'before':'after',Boolean(reused)&&o.mode==='rollback');cleanup=timings.cleanup;cleanupFailure=timings.cleanupFailure??null;
  checked(checks,'actual serial 52-frame HTTP samples with exact audit pairs no-store stable revision and complete business preservation',timings.ok);
  if(!timings.ok){if(timings.failure?.code==='REQUEST_TIMEOUT'&&!timings.cleanupDeferred)throw new DOMException('owned HTTP timing limit','TimeoutError');throw Error('performance_http_timing_failed');}
  if(o.mode==='applied'){
   const apiOut=join(dirname(o.out),'phase5-38-read-performance-api-final.json');
   process.stdout.write('Running unchanged full 05-38 actual Worker API matrix\n');
   const actual=await runProcess(process.execPath,[join(root,'work/pilot/verify-planning-year-api.mjs'),'--target','protected','--base-url',o.baseURL,'--out',apiOut],{timeoutMs:1200000});
   if(existsSync(apiOut))apiFinal=JSON.parse(readFileSync(apiOut,'utf8'));
   if(actual.exitCode!==0||actual.timedOut)throw Error('performance_full_api_failed');validatePerformanceBaseApi(apiFinal,read);
   checked(checks,'unchanged full actual API matrix including existing GY GR IM program reads',true);
   performanceProof=computeAcceptedPerformanceTimingProof(previous,{timings,reusableExplicitNamedSqlComponents:reused});checked(checks,'measured list/search/page medians at least3times faster <=5seconds and all samples <10seconds',performanceProof.ok);
  }
 }catch(error){failure=planningSafeFailure(error);sqlCompletionPending=error.ownedDbCompletionUnknown===true;pendingApplicationName=error.ownedApplicationName??null;}
 finally{
  try{if(sqlCompletionPending||timings?.cleanupDeferred)throw Error('performance_preservation_snapshot_deferred_pending_owned_db');afterCatalog=await readPerformanceCatalog(db);afterAcl=await gymAcl(db);finalHashes=await planningBusinessHashes(db);finalFingerprint=performanceCatalogFingerprint(afterCatalog);
   finalOriginalAnchors=await originalAnchorSnapshot(db,originalAuditIds,originalIdentityIds);
   finalAllAnchors=await originalAnchorSnapshot(db,null,null);}catch(error){failure??=planningSafeFailure(error);}
  await db.end({timeout:5});
 }
 const businessPreserved=equal(originalHashes,finalHashes),catalogPreserved=equal(beforeCatalog,afterCatalog),aclPreserved=equal(beforeAcl,afterAcl),clean=planningCleanupPreserved(cleanup);
 checked(checks,'all15 original business whole rows and timestamps preserved after own cleanup',businessPreserved&&clean);
 checked(checks,'original and newly retained audit and identity anchors preserved',clean);
 checked(checks,'original audit and identity whole rows preserved from coordinator start through every SQL and HTTP step',originalAnchorsValid(originalAnchors,finalOriginalAnchors));
 checked(checks,'full public definitions owners rawACL table/RLS and complete journal unchanged by verifier',catalogPreserved&&aclPreserved);
 const report={kind:'phase5-planning-year-read-performance',target:'protected',scope:'local-synthetic-only',mode:o.mode,reset:false,rollback:true,
  status:!failure&&checks.every(c=>c.ok)?'PASS':'FAIL',complete:!failure&&checks.every(c=>c.ok),checks,
  sourceCommit:proof.sourceRevision,workerBuildRevision:proof.buildRevision,sourceHashes,reusableExplicitNamedSqlComponents:reused,targetProjectId:target.projectId,originalFoundationHash:sha(foundation),originalTestHash:sha(originalTest),
  sourceHash:sha(source),testHash:sha(test),final38ProofStatus:final38.status,baselineFingerprint,finalFingerprint,beforeCatalog,afterCatalog,originalDefinitionHash,candidateDefinitionHash,definitionDiff,
  originalHashes,finalHashes,beforeAcl,afterAcl,beforeWorkerFunctions:functions(beforeAcl),afterWorkerFunctions:afterAcl?functions(afterAcl):[],
  functionsAndJournalPreserved:catalogPreserved,aclUnchanged:aclPreserved,originalBusinessPreserved:businessPreserved&&clean,originalTimestampsPreserved:businessPreserved&&clean,
  originalAnchors,finalOriginalAnchors,finalAllAnchors,
  originalAuditPreserved:originalAnchorsValid(originalAnchors,finalOriginalAnchors)&&cleanup?.originalAuditPreserved===true,
  identityAnchorsPreserved:originalAnchorsValid(originalAnchors,finalOriginalAnchors)&&cleanup?.identityAnchorsPreserved===true,cleanupStatus:clean?'PASS':'FAIL',cleanup,cleanupFailure,
  sql,originalSql,parity,timings,performance:performanceProof,sqlCompletionPending,pendingApplicationName,apiFinal:apiFinal?{status:apiFinal.status,cases:apiFinal.cases.length,sourceCommit:apiFinal.sourceCommit,
   workerBuildRevision:apiFinal.workerBuildRevision,report:'phase5-38-read-performance-api-final.json',sha256:sha(JSON.stringify(apiFinal))}:null,failure};
 reportFile(o.out,report);process.stdout.write(`${report.status} planning read performance ${o.mode}; original93=${originalSql?.tap?.total??0}; parity=${parity?.cases?.length??0}\n`);
 if(report.status!=='PASS')process.exitCode=1;
 if(timings?.cleanupDeferred)process.stderr.write('FAILED: OWNED_DB_COMPLETION_UNKNOWN; cleanup and preservation snapshot deferred; see pendingOwner in report\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 process.stderr.write(error.message?.startsWith('REFUSED')?error.message+'\n':`FAILED: ${planningSafeFailure(error).code}\n`);process.exitCode=1;
});
