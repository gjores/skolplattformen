#!/usr/bin/env node
// A new source-bound verifier; no historical file or proof is rewritten.
import {readFileSync,writeFileSync,existsSync,copyFileSync,realpathSync,lstatSync,constants} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {PLANNING_FOUNDATION,PLANNING_TEST,PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,planningBusinessHashes,sha,equal} from './apply-planning-year-migration.mjs';
import {PLANNING_GRANTS,PLANNING_API_SOURCE_PATHS,planningAuditPair,planningSelection,planningCleanupPreserved,planningSafeFailure} from './verify-planning-year-api.mjs';
import {PERFORMANCE_MIGRATION,PERFORMANCE_ENTRY,PERFORMANCE_SOURCE_PATHS,PERFORMANCE_FOUNDATION_HASH,PERFORMANCE_ORIGINAL_TEST_HASH,
 readPerformanceCatalog,validatePerformanceBaseApi,validatePerformanceRollback,performanceParityProof,performanceTimingProof,
 originalPlanningParityProof,extractOriginalPlanningRows,timingSummary,PERFORMANCE_ORIGINAL_PARITY_CASES} from './verify-planning-year-read-performance.mjs';
import * as performanceVerifier from './verify-planning-year-read-performance.mjs';
import {planningRollbackBody,planningTapProof} from './verify-planning-year-foundation.mjs';
import {parsePlanningSetup,parsePlanningSelection,parsePlanningList,parsePlanningOverview} from '../../web/lib/planning-year-contract.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const read=p=>readFileSync(join(root,p));
const hashPattern=/^[a-f0-9]{64}$/u,revisionPattern=/^sha256:[a-f0-9]{64}$/u;
export const SEARCH_MIGRATION='20261006123000_phase5_planning_year_search_details.sql';
export const SEARCH_TEST='supabase/tests/phase5_planning_year_search_details.test.sql';
export const SEARCH_ENTRY=PERFORMANCE_ENTRY;
export const SEARCH_PARSER_PATHS=['web/lib/planning-year-contract.ts','web/lib/planning-year-contract.test.mjs'];
export const SEARCH_SOURCE_PATHS=[...new Set([...PERFORMANCE_SOURCE_PATHS,...SEARCH_PARSER_PATHS,
 'work/pilot/verify-planning-year-search-details.mjs','work/pilot/verify-planning-year-search-details.test.mjs',
 'work/pilot/phase5-planning-year-search-fixtures.mjs','work/pilot/apply-planning-year-search-details.mjs',
 'web/lib/programplan-terms.ts','web/lib/programplan-choice-blocks.ts',SEARCH_TEST,`supabase/migrations/${SEARCH_MIGRATION}`])];
export const SEARCH_RUNTIME_PATHS=[...new Set(SEARCH_SOURCE_PATHS.filter(p=>p.startsWith('web/')&&!p.endsWith('.test.mjs')))];
export const SEARCH_WORKER_ENTRIES=[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES];
export const SEARCH_PLANNING_ENTRIES=[...PLANNING_ENTRIES,'public.phase5_planning_year_actor()','public.phase5_planning_year_academic_date(date)',
 'public.phase5_planning_year_audit(text)','public.phase5_planning_year_validate(jsonb)','public.phase5_planning_year_gym_cells(jsonb,uuid)',
 'public.phase5_planning_year_measure(bigint,boolean)','public.phase5_planning_year_metrics(jsonb)',SEARCH_ENTRY,
 'public.phase5_planning_year_sorted(jsonb,jsonb)','public.phase5_planning_year_revision(jsonb,jsonb)','public.phase5_planning_year_totals(jsonb,jsonb)'];
export const SEARCH_API_CASES=['role-setup','full-metadata-pages','local-code-later-page','literal-percent','literal-underscore','literal-apostrophe',
 'code-case-insensitive','program-code','orientation-code','program-name','orientation-name','exact-program-variants','null-and-missing',
 'school-customer-scope','filters-sort-empty','frozen-source-metadata','revision-local-code-conflict','security-denials','audit-failures'];
// Populated from the independently reviewed SQL case agreement, never inferred from output.
export const SEARCH_SQL_CORE_CASES=['school-first-52','all-schools-53','page-two-2','sort-name-desc','sort-school','sort-cohort','sort-version','sort-status','sort-grade','sort-points',
 'grade-filter','relevant-filter','future-year','archived-filter','own-plan-version-revision','own-null-codes','missing-basis','missing-plan',
 'gr-bound-column','im-null-hours','frozen-year-one','frozen-year-two','frozen-year-three','frozen-live-source-mismatch',
 'cache-first-program-mismatch','cache-first-orientation-mismatch','cache-own-code','distinct-start','distinct-distribution','pinned-orientation','pinned-other-program','pinned-catalog-version',
 'unknown-catalog','invalid-program-version','invalid-json-version','malformed-distribution','truncated-frozen-inventory','foreign-scope-denied'];
export const SEARCH_SQL_CORE_STATES={'unknown-catalog':'22023','invalid-program-version':'22023','invalid-json-version':'22023','malformed-distribution':'22023','truncated-frozen-inventory':'22023','foreign-scope-denied':'42501'};
export const SEARCH_SQL_MATCH_CASES=Object.fromEntries([
 ['match-local-last',1],['match-local-middle',1],['match-program-code',58],['match-orientation-code',57],['match-program-name',56],['match-orientation-name',56],
 ['match-literal-percent',1],['match-literal-underscore',1],['match-literal-apostrophe',1],['match-missing-basis-local',1],['match-missing-plan-local',1],['match-gr-local',1],['match-im-local',1],
 ['match-other-school',1],['match-local-lowercase',1],['match-program-lowercase',58],['match-orientation-lowercase',57],['match-combined',1],['match-archived-combined',1],['match-year-filter-excludes',0],['match-empty',0],
 ['stale-local-code',null],['stale-catalog-name',null],
].map(([name,count])=>[name,{oldState:'00000',newState:count===null?'40001':'00000',oldCount:count===null?52:0,newCount:count}]));
export const SEARCH_SQL_TAP_TOTAL=271;
export function validateSearchMigration(source,performanceSource){
 if(typeof source!=='string'||typeof performanceSource!=='string'
  ||(source.match(/^create or replace function public\.phase5_planning_year_rows\(q jsonb\) returns jsonb$/gmu)??[]).length!==1
  ||/^\s*(?:grant|revoke|alter|drop|create\s+(?!or replace function public\.phase5_planning_year_rows\b))/imu.test(source)
  ||!source.includes('language plpgsql volatile security definer set search_path=pg_catalog,public as $$')
  ||!source.includes('cache_key:=jsonb_build_array(tp.catalog_id,tp.basis_reference,tp.term_distribution);')
  ||!source.includes('cardinality(cache_keys)<128')||!source.includes('cached_cell_count+jsonb_array_length(cells)<=50000')
  ||!source.includes('else source:=tp.gym_basis;end if;')||!source.includes('cells:=public.phase5_planning_year_gym_cells(source,case when q->>\'view\'=\'timplan\' then tp.id end);')
  ||/set_config\(|pg_temp\.|latest_catalog|create\s+temp/iu.test(source)
  ||!source.includes("'searchDetails',search_details")||!source.includes('cache_names[names_index]:=pinned_names;')
  ||!source.includes("program.value->'version'=source#>'{basisReference,programRef,version}'"))throw Error('REFUSED: exact bounded source cache, frozen validation and pinned search projection required');
 for(const literal of ['cache_key:=jsonb_build_array(tp.catalog_id,tp.basis_reference,tp.term_distribution);','cardinality(cache_keys)<128','cached_cell_count+jsonb_array_length(cells)<=50000'])
  if(!performanceSource.includes(literal))throw Error('REFUSED: reviewed performance predecessor changed');
}
export function searchCoreProjection(body){
 const copy=structuredClone(body);
 if(!Array.isArray(copy?.rows)||!revisionPattern.test(copy.selectionRevision??''))throw Error('REFUSED: exact planning response required for core comparison');
 copy.rows=copy.rows.map(row=>{const{searchDetails,...core}=row;return core;});
 // Revision changes are explicit and limited to these two known response paths.
 copy.selectionRevision=null;
 if(copy.selection)copy.selection.selectionRevision=null;
 return copy;
}
export function parseSearchArgs(argv){
 const o={target:null,mode:null,baseURL:null,out:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--target','--mode','--base-url','--out'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('REFUSED: exact search arguments required');
  seen.add(flag);o[flag==='--base-url'?'baseURL':flag.slice(2)]=argv[++i];
 }
 if(o.target!=='protected'||!['rollback','applied'].includes(o.mode)||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL??'')||!safeSearchOutput(o.out))throw Error('REFUSED: isolated protected Worker and safe search report required');
 const port=Number(new URL(o.baseURL).port);if(port<1024||port>65535||port===3012)throw Error('REFUSED: owned isolated port required');
 o.out=resolve(o.out);return o;
}
export function safeSearchOutput(p){
 if(typeof p!=='string'||!/^(?:phase5-40-search-details-|search-)[a-z0-9-]+\.json$/u.test(basename(p)))return false;
 const resolved=resolve(p),parent=dirname(resolved),results=join(root,'work/pilot/results');
 if(![results,'/tmp','/private/tmp'].includes(parent))return false;
 try{const stat=lstatSync(resolved);if(!stat.isFile()||stat.nlink!==1)return false;}catch(e){if(e.code!=='ENOENT')return false;}
 try{
  const actualParent=realpathSync(parent);
  if(actualParent==='/private/tmp')return true;
  return actualParent===realpathSync(results)&&actualParent===results;
 }catch{
  // Preparation need not create the gitignored report directory. Its nearest
  // existing parent must still be this project's real work/pilot directory.
  return parent===results&&!existsSync(results)&&realpathSync(join(root,'work/pilot'))===join(root,'work/pilot');
 }
}

export const readSearchCatalog=readPerformanceCatalog;
export const searchCatalogFingerprint=c=>sha(JSON.stringify(c));
export function assertSearchDiff(before,after,{journal='unchanged',expectedSource}={}){
 if(!Array.isArray(before?.functions)||!Array.isArray(after?.functions)||before.functions.length!==after.functions.length||!equal(before.tables,after.tables))throw Error('REFUSED: public inventory/table privileges changed');
 const changed=[];let originalDefinitionHash,candidateDefinitionHash;
 for(let i=0;i<before.functions.length;i++){
  const b=before.functions[i],a=after.functions[i];
  if(b.signature!==a.signature||!equal({...b,definition:null},{...a,definition:null}))throw Error('REFUSED: raw ACL owner attributes changed');
  if(b.definition!==a.definition){if(b.signature!==SEARCH_ENTRY)throw Error('REFUSED: another definition changed');changed.push(b.signature);originalDefinitionHash=sha(b.definition);candidateDefinitionHash=sha(a.definition);}
 }
 if(!exactFunctions(changed,[SEARCH_ENTRY]))throw Error('REFUSED: exactly one private definition required');
 if(journal==='unchanged'){if(!equal(before.journal,after.journal))throw Error('REFUSED: verifier changed journal');}
 else if(journal==='append'){
  const row={version:'20261006123000',name:'phase5_planning_year_search_details',statements:[expectedSource]};
  if(typeof expectedSource!=='string'||!equal(after.journal,[...before.journal,row]))throw Error('REFUSED: exact single search journal required');
 }else throw Error('REFUSED: invalid journal policy');
 return {changedDefinitions:changed,originalDefinitionHash,candidateDefinitionHash,unexpectedDifferences:0};
}
const historicalRuntimeManifests=new Map();
export function historicalGitSource(revision,p){
 if(!/^[a-f0-9]{40}$/u.test(revision??'')||typeof p!=='string')throw Error('REFUSED: closed historical source reference required');
 if(!SEARCH_SOURCE_PATHS.includes(p)){
  if(!historicalRuntimeManifests.has(revision))historicalRuntimeManifests.set(revision,new Set(execFileSync('git',
   ['ls-tree','-r','--name-only',revision,'--','web/lib','web/app/api','web/package.json','web/package-lock.json'],
   {cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024}).toString().trim().split('\n')));
  if(!historicalRuntimeManifests.get(revision).has(p))throw Error('REFUSED: source absent from exact historical runtime manifest');
 }
 return execFileSync('git',['show',`${revision}:${p}`],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024});
}

export function validateHistoricalSources(report,paths,gitRead){
 if(!/^[a-f0-9]{40}$/u.test(report?.sourceCommit??'')||!report.sourceHashes)throw Error('REFUSED: historical verified revision required');
 for(const p of paths)if(report.sourceHashes[p]!==sha(gitRead(report.sourceCommit,p)))throw Error('REFUSED: historical report bytes do not match its verified Git revision');
}
export function searchAnchorsValid(before,after){return ['audit','identities'].every(k=>Number.isSafeInteger(before?.[k]?.count)&&before[k].count>=0&&hashPattern.test(before[k].sha256??'')&&equal(before[k],after?.[k]));}
export function searchWholeRowsValid(h){return h&&exactFunctions(Object.keys(h),PLANNING_TABLES)&&Object.values(h).every(v=>v&&Number.isSafeInteger(v.count)&&v.count>=0&&hashPattern.test(v.sha256??'')&&exactFunctions(Object.keys(v),['count','sha256']));}
export const searchCleanupPreserved=c=>planningCleanupPreserved(c)&&c.searchAuditFixtures?.triggers===0&&c.searchAuditFixtures?.functions===0;
export const searchRecoveryRequired=(current,http)=>current===true||http?.cleanupDeferred===true;
export const searchSqlCompleted=r=>r?.exitCode===0&&r.timedOut===false&&r.outputOverflow===false&&r.streamError===false&&r.signal===null;
export function exactSearchTap(t,total){return t?.status==='PASS'&&t.total===total&&Array.isArray(t.assertions)&&!t.assertions.some(line=>typeof line!=='string'||/#\s*(?:SKIP|TODO)\b|Bail\s*out!/iu.test(line))&&planningTapProof(t.assertions.join('\n')+`\n1..${total}`,total).status==='PASS';}
function originalContractsComplete(p){return p?.ok===true&&Array.isArray(p.cases)&&exactFunctions(p.cases.map(c=>c.name),PERFORMANCE_ORIGINAL_PARITY_CASES)&&p.cases.every(c=>c.ok===true);}
export function searchTimingsComplete(samples){
 return Array.isArray(samples)&&samples.length===12&&['list','search','page2','overview'].every(name=>{
  const group=samples.filter(s=>s.case===name),expected=name==='search'?[1,1]:name==='page2'?[52,2]:name==='overview'?[52,52]:[52,50];
  return group.length===3&&exactFunctions(group.map(s=>String(s.iteration)),['1','2','3'])&&new Set(group.map(s=>s.selectionRevision)).size===1
   &&group.every(s=>s.status==='PASS'&&s.phase==='after'&&s.httpStatus===200&&s.count===expected[0]&&s.rows===expected[1]
    &&s.noStore===true&&s.auditPaired===true&&s.businessUnchanged===true&&revisionPattern.test(s.selectionRevision??'')&&Number.isFinite(s.durationMs)&&s.durationMs>0&&s.durationMs<10000)
   &&timingSummary(group).medianMs<=5000;
 });
}
export function validateSearchDependencies(bundle,gitRead=historicalGitSource,currentRead=read){
 const {final38,performanceRollback,performanceFinal,performanceApi}=bundle??{};
 validateHistoricalSources(final38,PLANNING_API_SOURCE_PATHS,gitRead);
 validatePerformanceBaseApi(final38,p=>gitRead(final38.sourceCommit,p));
 validateHistoricalSources(performanceRollback,PERFORMANCE_SOURCE_PATHS,gitRead);
 validatePerformanceRollback(performanceRollback,p=>gitRead(performanceRollback.sourceCommit,p));
 const e=performanceFinal;
 validateHistoricalSources(e,PERFORMANCE_SOURCE_PATHS,gitRead);
 validateHistoricalSources(performanceApi,PLANNING_API_SOURCE_PATHS,gitRead);
 validatePerformanceBaseApi(performanceApi,p=>gitRead(performanceApi.sourceCommit,p));
 const performanceProof=typeof performanceVerifier.computeAcceptedPerformanceTimingProof==='function'
  ?performanceVerifier.computeAcceptedPerformanceTimingProof(performanceRollback,e,p=>gitRead(performanceRollback.sourceCommit,p))
  :performanceTimingProof(performanceRollback.timings.samples,e.timings?.samples??[]);
 if(e?.kind!=='phase5-planning-year-read-performance'||e.mode!=='applied'||e.status!=='PASS'||e.complete!==true||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.reset!==false||e.rollback!==true
  ||e.cleanupStatus!=='PASS'||!planningCleanupPreserved(e.cleanup)||!searchAnchorsValid(e.originalAnchors,e.finalOriginalAnchors)
  ||!exactSearchTap(e.sql?.tap,143)||e.sql.exitCode!==0||!performanceParityProof(e.parity?.cases?.map(c=>'PLANNING_PERFORMANCE_PARITY|'+JSON.stringify(c)).join('\n')??'').ok
  ||!exactSearchTap(e.originalSql?.tap,93)||e.originalSql.exitCode!==0||!originalContractsComplete(e.originalSql.parity)
  ||!equal(e.beforeCatalog,e.afterCatalog)||searchCatalogFingerprint(e.beforeCatalog)!==e.baselineFingerprint||e.baselineFingerprint!==e.finalFingerprint
  ||!equal(e.originalHashes,e.finalHashes)||!searchWholeRowsValid(e.originalHashes)||!equal(e.beforeAcl,e.afterAcl)
  ||!exactFunctions(e.beforeWorkerFunctions??[],SEARCH_WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],SEARCH_WORKER_ENTRIES)
  ||!['originalBusinessPreserved','originalTimestampsPreserved','originalAuditPreserved','identityAnchorsPreserved','aclUnchanged','functionsAndJournalPreserved'].every(k=>e[k]===true)
  ||!Array.isArray(e.checks)||!e.checks.length||!e.checks.every(c=>c.ok===true)||!searchTimingsComplete(e.timings?.samples)
  ||!performanceProof.ok||e.performance?.ok!==true
  ||e.apiFinal?.sha256!==sha(JSON.stringify(performanceApi))||e.apiFinal?.status!=='PASS'||e.apiFinal.sourceCommit!==performanceApi.sourceCommit||e.workerBuildRevision!==performanceApi.workerBuildRevision
  ||e.candidateDefinitionHash!==performanceRollback.candidateDefinitionHash||e.originalDefinitionHash!==performanceRollback.originalDefinitionHash
  ||!equal(e.originalHashes,performanceRollback.originalHashes)||!equal(e.originalHashes,final38.finalHashes)
  ||sha(e.beforeCatalog.functions.find(f=>f.signature===SEARCH_ENTRY)?.definition??'')!==e.candidateDefinitionHash)throw Error('REFUSED: complete actually applied performance and unchanged full API proof required');
 const performanceSource=gitRead(e.sourceCommit,`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString();
 if(e.sourceHash!==sha(performanceSource)||e.originalFoundationHash!==PERFORMANCE_FOUNDATION_HASH||e.originalTestHash!==PERFORMANCE_ORIGINAL_TEST_HASH
  ||e.testHash!==e.sourceHashes['supabase/tests/phase5_planning_year_read_performance.test.sql'])throw Error('REFUSED: exact performance migration/test bytes and immutable originals required');
 const oldCatalog=performanceRollback.beforeCatalog;
 // Dependency's only intended change was the existing private helper plus its journal.
 const withoutJournal={...e.beforeCatalog,journal:oldCatalog.journal};
 const dependencyDiff=assertSearchDiff(oldCatalog,withoutJournal);
 if(dependencyDiff.candidateDefinitionHash!==e.candidateDefinitionHash||!equal(e.beforeCatalog.journal,[...oldCatalog.journal,
  {version:'20261006122000',name:'phase5_planning_year_read_performance',statements:[performanceSource]}]))throw Error('REFUSED: performance applied catalog/journal differs from its proof');
 for(const p of PERFORMANCE_SOURCE_PATHS)if(!SEARCH_PARSER_PATHS.includes(p)&&sha(currentRead(p))!==e.sourceHashes[p])throw Error('REFUSED: an unplanned historical performance source changed');
 return {final38:sha(JSON.stringify(final38)),performanceRollback:sha(JSON.stringify(performanceRollback)),performanceFinal:sha(JSON.stringify(e)),performanceApi:sha(JSON.stringify(performanceApi)),performanceDefinitionHash:e.candidateDefinitionHash};
}
export function validateSearchJournal(catalog,sourceReader=read,applied=false){
 const files=[PLANNING_FOUNDATION,PLANNING_GRANTS,PERFORMANCE_MIGRATION,...(applied?[SEARCH_MIGRATION]:[])];
 const expected=files.map(f=>({version:f.slice(0,14),name:f.slice(15,-4),statements:[sourceReader(`supabase/migrations/${f}`).toString()]}));
 if(!equal(catalog?.journal?.filter(r=>r.version>='20261006120000'),expected))throw Error('REFUSED: exact applied predecessors and search journal required');
 const planning=catalog.functions.filter(f=>f.signature.startsWith('public.phase5_planning_year_'));
 if(!exactFunctions(planning.map(f=>f.signature),SEARCH_PLANNING_ENTRIES)||planning.some(f=>f.acl!==(PLANNING_ENTRIES.includes(f.signature)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'))
  ||!planning.find(f=>f.signature===SEARCH_ENTRY)?.securityDefiner||planning.find(f=>f.signature===SEARCH_ENTRY)?.volatility!=='v')throw Error('REFUSED: exact14 planning signatures and owner-only helpers required');
}
export function searchSqlProof(output){
 const parse=marker=>output.split('\n').filter(l=>l.startsWith(marker+'|')).map(l=>JSON.parse(l.slice(marker.length+1)));
 const core=parse('PLANNING_SEARCH_PARITY'),matches=parse('PLANNING_SEARCH_MATCH');
 const coreOK=SEARCH_SQL_CORE_CASES.length>0&&exactFunctions(core.map(c=>c.name),SEARCH_SQL_CORE_CASES)&&core.every(c=>{
  const expected=SEARCH_SQL_CORE_STATES[c.name]??'00000';
  return c.oldState===expected&&c.newState===expected&&hashPattern.test(c.oldCoreHash??'')&&c.oldCoreHash===c.newCoreHash&&c.coreSame===true
   &&(expected==='00000'?c.revisionPolicy==='metadata-bound'&&revisionPattern.test(c.oldRevision??'')&&revisionPattern.test(c.newRevision??'')&&c.oldRevision!==c.newRevision&&c.detailsValid===true
    :c.revisionPolicy==='error-unchanged'&&c.oldRevision===null&&c.newRevision===null&&c.detailsValid===null);
 });
 const matchOK=Object.keys(SEARCH_SQL_MATCH_CASES).length>0&&exactFunctions(matches.map(c=>c.name),Object.keys(SEARCH_SQL_MATCH_CASES))&&matches.every(c=>{
  const expected=SEARCH_SQL_MATCH_CASES[c.name];
  return c.oldState===expected.oldState&&c.newState===expected.newState&&c.expectedOldState===expected.oldState&&c.expectedNewState===expected.newState
   &&c.oldCount===expected.oldCount&&c.newCount===expected.newCount&&c.expectedOldCount===expected.oldCount&&c.expectedNewCount===expected.newCount
   &&hashPattern.test(c.oldHash??'')&&hashPattern.test(c.newHash??'')
   &&(c.newState==='00000'?c.metadataProvenance===true&&c.scopeValid===true:c.metadataProvenance===null&&c.scopeValid===null);
 });
 return {ok:coreOK&&matchOK,core,matches};
}
function catalogSql(){return `jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('signature','public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')','definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner),'volatility',p.provolatile::text,'securityDefiner',p.prosecdef,'config',p.proconfig) order by 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')') from pg_proc p where p.pronamespace='public'::regnamespace),'tables',(select jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner),'relrowsecurity',c.relrowsecurity,'relforcerowsecurity',c.relforcerowsecurity) order by c.oid::regclass::text) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')),'journal',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version) from supabase_migrations.schema_migrations))`;}
export function searchRollbackScript(test,candidate,performanceSource){
 const marker='-- SEARCH_DETAILS_CANDIDATE_APPLY',body=planningRollbackBody(test);
 if(body.split(marker).length!==2)throw Error('REFUSED: unique candidate apply marker required');
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n${performanceSource}\n`
  +body.replace(marker,()=>`create temp table search_definition_catalog as select ${catalogSql()} value;\n${candidate}\n`
   +`select 'PLANNING_SEARCH_DEFINITION|'||jsonb_build_object('signature','${SEARCH_ENTRY}','definitionHash',encode(extensions.digest(pg_get_functiondef('${SEARCH_ENTRY}'::regprocedure),'sha256'),'hex'))::text;\n`
   +`select 'PLANNING_SEARCH_CATALOG|'||jsonb_build_object('before',(select value from search_definition_catalog),'after',${catalogSql()})::text;`)+ '\nrollback;\n';
}
export function searchHistoricalScript(test,definition){
 if(sha(test)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable original93 source changed');
 return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(5520);\n${definition}\n`
  +PLANNING_ENTRIES.map(entry=>`revoke execute on function ${entry} from skolplattform_worker;`).join('\n')+'\n'+planningRollbackBody(test)+'\nrollback;\n';
}
export function searchCasesComplete(cases,names=SEARCH_API_CASES){return Array.isArray(cases)&&exactFunctions(cases.map(c=>c.name),names)&&cases.every(c=>c.status==='PASS'&&Array.isArray(c.checks)&&c.checks.length&&c.checks.every(k=>k.ok===true));}
export function validateSearchRollback(e,readSource=read){
 if(e?.kind!=='phase5-planning-year-search-details'||e.mode!=='rollback'||e.status!=='PASS'||e.complete!==true||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.reset!==false||e.rollback!==true
  ||!hashPattern.test(e.originalDefinitionHash??'')||!hashPattern.test(e.candidateDefinitionHash??'')||e.originalDefinitionHash===e.candidateDefinitionHash
  ||!equal(e.beforeCatalog,e.afterCatalog)||e.baselineFingerprint!==e.finalFingerprint||searchCatalogFingerprint(e.beforeCatalog)!==e.baselineFingerprint
  ||!equal(e.originalHashes,e.finalHashes)||!searchWholeRowsValid(e.originalHashes)||!equal(e.beforeAcl,e.afterAcl)
  ||!exactFunctions(e.beforeWorkerFunctions??[],SEARCH_WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],SEARCH_WORKER_ENTRIES)
  ||!['functionsAndJournalPreserved','aclUnchanged','originalBusinessPreserved','originalTimestampsPreserved','originalAuditPreserved','identityAnchorsPreserved'].every(k=>e[k]===true)
  ||e.cleanupStatus!=='PASS'||!searchCleanupPreserved(e.cleanup)||!searchAnchorsValid(e.originalAnchors,e.finalOriginalAnchors)||!searchAnchorsValid(e.finalAllAnchors,e.finalAllAnchors)
  ||['audit','identities'].some(k=>e.finalAllAnchors[k].count<e.originalAnchors[k].count)
  ||!exactSearchTap(e.sql?.tap,SEARCH_SQL_TAP_TOTAL)||!searchSqlCompleted(e.sql)||!e.sqlProof?.ok
  ||!searchSqlProof([...e.sqlProof.core.map(c=>'PLANNING_SEARCH_PARITY|'+JSON.stringify(c)),...e.sqlProof.matches.map(c=>'PLANNING_SEARCH_MATCH|'+JSON.stringify(c))].join('\n')).ok
  ||!['original','candidate'].every(k=>exactSearchTap(e.originalSql?.[k]?.tap,93)&&searchSqlCompleted(e.originalSql[k])&&originalContractsComplete(e.originalSql[k].parity))
  ||!searchCasesComplete(e.parserApi?.cases,['legacy-parser-role-reads'])||e.fullApiStatus!=='PASS'
  ||!Array.isArray(e.checks)||!e.checks.length||!e.checks.every(c=>c.ok===true)
  ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??'')
  ||!e.dependencyHashes||!['final38','performanceRollback','performanceFinal','performanceApi'].every(k=>hashPattern.test(e.dependencyHashes[k]??''))
  ||e.dependencyHashes.performanceDefinitionHash!==e.originalDefinitionHash||e.parserBuild?.actualWorker!==true||e.parserBuild.revision!==e.workerBuildRevision
  ||!e.definitionDiff||e.definitionDiff.unexpectedDifferences!==0||!exactFunctions(e.definitionDiff.changedDefinitions??[],[SEARCH_ENTRY])
  ||e.definitionDiff.originalDefinitionHash!==e.originalDefinitionHash||e.definitionDiff.candidateDefinitionHash!==e.candidateDefinitionHash)throw Error('REFUSED: complete search rollback, historical93/18, actual parser Worker and preservation proof required');
 if(!exactFunctions(Object.keys(e.sourceHashes??{}),SEARCH_SOURCE_PATHS))throw Error('REFUSED: closed exact SEARCH source inventory required');
 for(const p of SEARCH_SOURCE_PATHS)if(e.sourceHashes?.[p]!==sha(readSource(p)))throw Error('REFUSED: source changed after search rollback');
 if(e.sourceHash!==sha(readSource(`supabase/migrations/${SEARCH_MIGRATION}`))||e.testHash!==sha(readSource(SEARCH_TEST)))throw Error('REFUSED: exact search SQL bytes required');
 if(sha(e.beforeCatalog.functions.find(f=>f.signature===SEARCH_ENTRY)?.definition??'')!==e.originalDefinitionHash
  ||e.parserBuild.sourceRevision!==e.sourceCommit||e.parserBuild.buildRevision!==e.workerBuildRevision
  ||!SEARCH_PARSER_PATHS.every(p=>e.parserBuild.parserSourceHashes?.[p]===e.sourceHashes[p])
  ||e.fullApi?.workerBuildRevision!==e.workerBuildRevision||e.fullApi?.cases!==15||!hashPattern.test(e.fullApi?.sha256??'')
  ||e.sql.timedOut!==false||!['original','candidate'].every(k=>e.originalSql[k].timedOut===false))throw Error('REFUSED: definition, new parser bytes, full API report or actual SQL completion mismatch');
 validateSearchMigration(readSource(`supabase/migrations/${SEARCH_MIGRATION}`).toString(),readSource(`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString());
}
export function validateSearchApplied(e,rollback,readSource=read){
 if(e?.kind!=='phase5-planning-year-search-details-apply'||e.status!=='PASS'||e.complete!==true||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.reset!==false
  ||e.migration!==SEARCH_MIGRATION||e.originalDefinitionHash!==rollback.originalDefinitionHash||e.candidateDefinitionHash!==rollback.candidateDefinitionHash
  ||e.sourceHash!==sha(readSource(`supabase/migrations/${SEARCH_MIGRATION}`))||!equal(e.sourceHashes,rollback.sourceHashes)||!equal(e.dependencyHashes,rollback.dependencyHashes)
  ||e.workerBuildRevision!==rollback.workerBuildRevision||e.baselineFingerprint!==rollback.baselineFingerprint
  ||!equal(e.beforeCatalog,rollback.beforeCatalog)||searchCatalogFingerprint(e.afterCatalog)!==e.afterFingerprint
  ||!equal(e.originalHashes,rollback.originalHashes)||!equal(e.originalHashes,e.finalHashes)||!equal(e.beforeAcl,rollback.beforeAcl)||!equal(e.beforeAcl,e.afterAcl)
  ||!searchAnchorsValid(e.beforeAudit,e.afterAudit)||!equal(e.beforeAudit,rollback.finalAllAnchors)
  ||!exactFunctions(e.beforeWorkerFunctions??[],SEARCH_WORKER_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],SEARCH_WORKER_ENTRIES)
  ||!['originalBusinessPreserved','originalTimestampsPreserved','originalAuditPreserved','identityAnchorsPreserved','aclUnchanged'].every(k=>e[k]===true)
  ||e.unexpectedDifferences!==0||!exactFunctions(e.changedDefinitions??[],[SEARCH_ENTRY]))throw Error('REFUSED: complete exact controlled SEARCH apply proof required');
 const difference=assertSearchDiff(e.beforeCatalog,e.afterCatalog,{journal:'append',expectedSource:readSource(`supabase/migrations/${SEARCH_MIGRATION}`).toString()});
 if(difference.originalDefinitionHash!==e.originalDefinitionHash||difference.candidateDefinitionHash!==e.candidateDefinitionHash)throw Error('REFUSED: applied definition catalog does not match rollback');
}
export function preserveSearchReport(out,value){
 if(!safeSearchOutput(out))throw Error('REFUSED: historical or aliased report destination');
 if(existsSync(out)){const previous=JSON.parse(readFileSync(out,'utf8'));if(previous.status!=='PASS')copyFileSync(out,out.replace(/\.json$/u,`-fail-${Date.now()}-${randomUUID()}.json`));}
 const content=JSON.stringify(value,null,2)+'\n';writeFileSync(out,content,{flag:constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW});
 if(value.status!=='PASS')writeFileSync(out.replace(/\.json$/u,`-fail-${Date.now()}-${randomUUID()}.json`),content);
}
export async function searchAuditAnchors(db,auditIds=null,identityIds=null){
 const[audit]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.security_events e where ${auditIds}::bigint[] is null or id=any(${auditIds}::bigint[])`;
 const[identities]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.identities i where ${identityIds}::uuid[] is null or id=any(${identityIds}::uuid[])`;
 return {audit:{...audit},identities:{...identities}};
}
export function processResult(command,args,{input,timeoutMs=7200000,onAbort}={}){
 return new Promise((done,reject)=>{
  const proc=spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];
  let size=0,timedOut=false,outputOverflow=false,streamError=false,abortStarted=false,abortProof=null,abortError=false,killTimer,abortWork=Promise.resolve();
  const abort=()=>{
   if(abortStarted)return;abortStarted=true;
   // Stop this tagged DB backend from the independent control connection while
   // the SQL command is still running. Waiting for docker client close first
   // does not enforce a deadline on its PostgreSQL child.
   let stopDeadline;
   abortWork=Promise.race([Promise.resolve().then(()=>onAbort?.()),new Promise((_,fail)=>{stopDeadline=setTimeout(()=>fail(Error('owned stop deadline')),20000);})])
    .then(proof=>{abortProof=proof??null;},()=>{abortError=true;}).finally(()=>clearTimeout(stopDeadline));
   proc.kill('SIGTERM');killTimer=setTimeout(()=>proc.kill('SIGKILL'),5000);
  };
  const timer=setTimeout(()=>{timedOut=true;abort();},timeoutMs);
  for(const [stream,list]of[[proc.stdout,stdout],[proc.stderr,stderr]])stream.on('data',chunk=>{
   size+=chunk.length;if(size>32*1024*1024){outputOverflow=true;abort();}else list.push(chunk);
  });
  proc.once('error',e=>{clearTimeout(timer);clearTimeout(killTimer);reject(e);});
  proc.once('close',async(exitCode,signal)=>{
   clearTimeout(timer);clearTimeout(killTimer);await abortWork;
   done({exitCode,signal,timedOut,outputOverflow,streamError,abortProof,abortError,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()});
  });
  proc.stdin.on('error',e=>{if(e.code!=='EPIPE'){streamError=true;abort();}});proc.stdin.end(input);
 });
}
export const searchSqlNeedsDrain=r=>r?.exitCode!==0||r.timedOut===true||r.outputOverflow===true||r.streamError===true||Boolean(r.signal);
async function stopOwnedSearchBackend(db,applicationName){
 const deadline=Date.now()+15000;let stopped=false;
 while(Date.now()<deadline){
  const owned=await db`select pid from pg_stat_activity where application_name=${applicationName} and usename='postgres' and backend_type='client backend'`;
  for(const row of owned)await db`select pg_terminate_backend(${row.pid}) where exists(select 1 from pg_stat_activity where pid=${row.pid} and application_name=${applicationName} and usename='postgres' and backend_type='client backend')`;
  const[s]=await db`select not exists(select 1 from pg_stat_activity where application_name=${applicationName}) stopped`;
  if(s.stopped){stopped=true;break;}await new Promise(done=>setTimeout(done,50));
 }
 if(!stopped)throw Error('search_owned_backend_not_stopped');
 return {ownedBackendStopped:true};
}
async function sqlRun(target,script,db){
 const applicationName=`p5_planning_search_${randomUUID()}`;
 const onAbort=()=>stopOwnedSearchBackend(db,applicationName);
 const r=await processResult('docker',['exec','-i','-e',`PGAPPNAME=${applicationName}`,`supabase_db_${target.projectId}`,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-f','-'],{input:script,onAbort});
 if(r.abortError)throw Error('search_owned_backend_not_stopped');
 if(searchSqlNeedsDrain(r)){
  // Recheck after the owned client is closed as well; a zero client exit code
  // never turns an exceeded SQL deadline into completed proof.
  const final=await stopOwnedSearchBackend(db,applicationName);r.ownedBackendStopped=final.ownedBackendStopped;
 }
 return r;
}

function sqlEvidence(r){return {exitCode:r.exitCode,timedOut:r.timedOut,outputOverflow:r.outputOverflow,streamError:r.streamError,signal:r.signal,ownedBackendStopped:r.ownedBackendStopped??null,tap:planningTapProof(r.stdout,1),error:r.exitCode===0?null:r.timedOut?'SQL_TIMEOUT':r.outputOverflow?'SQL_OUTPUT_LIMIT':'SQL_FAILED'};}
const checked=(checks,name,ok)=>checks.push({name,ok:Boolean(ok)});
function dependencyBundle(){return Object.fromEntries([['final38','phase5-38-api-final'],['performanceRollback','phase5-38-read-performance-rollback'],['performanceFinal','phase5-38-read-performance-final'],['performanceApi','phase5-38-read-performance-api-final']].map(([key,name])=>[key,JSON.parse(read(`work/pilot/results/${name}.json`).toString())]));}
export async function verifySearchWorker(baseURL,performanceFinal){
 const {verifyPlanningYearBrowserTarget}=await import('./phase5-planning-year-fixtures.mjs');
 const proof=await verifyPlanningYearBrowserTarget(baseURL);
 const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','ignore']}).toString().trim();
 if(proof.buildRevision===performanceFinal.workerBuildRevision||git(['status','--porcelain','--',...SEARCH_SOURCE_PATHS])
  ||git(['diff','--name-only',proof.buildRevision,'HEAD','--',...SEARCH_RUNTIME_PATHS]))throw Error('REFUSED: new separately built actual parser Worker and clean pinned sources required');
 git(['merge-base','--is-ancestor',performanceFinal.sourceCommit,'HEAD']);
 return {...proof,actualWorker:true,revision:proof.buildRevision,parserSourceHashes:Object.fromEntries(SEARCH_PARSER_PATHS.map(p=>[p,sha(read(p))]))};
}
async function httpProof(baseURL,applied){
 const {createPlanningSearchFixture}=await import('./phase5-planning-year-search-fixtures.mjs');
 let fixture,metadata,setup,cleanup,failure,cleanupDeferred=false;const cases=[],samples=[];
 const run=async(name,fn)=>{const checks=[];try{await fn(checks);}catch(e){checked(checks,planningSafeFailure(e).code,false);if(cleanupDeferred){cases.push({name,status:'FAIL',checks});throw e;}}cases.push({name,status:checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL',checks});};
 try{
  fixture=await createPlanningSearchFixture();
  try{metadata=await fixture.setup(baseURL);}catch(e){
   if(e?.name==='TimeoutError'||e?.name==='AbortError'||e?.code==='ECONNRESET')cleanupDeferred=true;
   throw e;
  }
  const q=patch=>planningSelection(metadata.planningYear,{view:'programplan',unitId:fixture.unitId,query:metadata.pageQuery,status:'utkast',...patch});
  const request=async(session,route,selection,options={})=>{
   const before=await fixture.businessHashes(),boundary=await fixture.auditBoundary(session),startedAt=new Date().toISOString(),start=performance.now();
   const headers={'Content-Type':'application/json',Cookie:`sp_session=${session.token}`,'X-Context-Epoch':String(session.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL,...options.headers};
   if(options.noSession)delete headers.Cookie;
   const signal=AbortSignal.timeout(30000);let r,body;
   try{
    r=await fetch(`${baseURL}/api/planering/${route}`,{method:route==='urval'?'GET':'POST',headers,...(route==='urval'?{}:{body:JSON.stringify(selection)}),signal});
    body=await r.json();
   }catch(e){
    try{await fixture.finishTimedRead(session,boundary,route);}catch{cleanupDeferred=true;throw Object.assign(Error('search_owned_read_drain_failed'),{code:'OWNED_READ_UNDRAINED'});}
    throw e;
   }
   const durationMs=performance.now()-start,corr=r.headers.get('x-correlation-id'),events=await fixture.events(corr);
   return {status:r.status,body,durationMs,startedAt,events,noStore:r.headers.get('cache-control')==='no-store',unchanged:equal(before,await fixture.businessHashes()),
    auditPaired:planningAuditPair(events,session,session.customerId??fixture.customerId,route)};
  };
  const positive=async(checks,session,route,selection,{count,rows,details=applied}={})=>{
   const r=await request(session,route,selection);
   checked(checks,`${route} actual HTTP${r.status}, no-store, whole rows and paired DB/Worker audit`,r.status===200&&r.noStore&&r.unchanged&&r.auditPaired);
   if(r.status!==200)throw Error('search_http_positive_failed');
   if(route==='urval')parsePlanningSetup(r.body);
   else {const parsed=route==='lista'?parsePlanningList(r.body,parsePlanningSelection(selection,setup),setup):parsePlanningOverview(r.body,parsePlanningSelection(selection,setup),setup);
    if(count!==undefined)checked(checks,'exact actual count',parsed.count===count);if(rows!==undefined)checked(checks,'exact actual rows',parsed.rows.length===rows);
    if(details)checked(checks,'every own code/name matches exact pinned DB source',await fixture.metadataMatches(parsed.rows));
    else checked(checks,'legacy exact row shape preserved with new parser',parsed.rows.every(row=>!Object.hasOwn(row,'searchDetails')));
   }
   return r;
  };
  const denied=async(checks,session,route,selection,status,options)=>{
   const r=await request(session,route,selection,options);checked(checks,`${route} expected ${status}, observed ${r.status}, no data/ok audit`,r.status===status&&r.noStore&&r.unchanged
    &&Object.keys(r.body).every(k=>['code','correlationId','details'].includes(k))&&!r.events.some(e=>e.outcome==='ok'));
   return r;
  };
  const selected=await request(fixture.hm,'urval');if(selected.status!==200||!selected.auditPaired||!selected.noStore)throw Error('search_setup_actual_read_failed');setup=parsePlanningSetup(selected.body);
  if(!applied){
   await run('legacy-parser-role-reads',async checks=>{
    for(const actor of [fixture.hm,fixture.principal,fixture.admin]){
     await positive(checks,actor,'urval');
     await positive(checks,actor,'lista',q({}),{count:52,rows:50,details:false});
     await positive(checks,actor,'oversikt',q({}),{count:52,rows:52,details:false});
    }
   });
  }else{
   await run('role-setup',async checks=>{for(const actor of [fixture.hm,fixture.principal,fixture.admin])await positive(checks,actor,'urval');});
   await run('full-metadata-pages',async checks=>{
    const first=await positive(checks,fixture.hm,'lista',q({}),{count:52,rows:50});
    const second=await positive(checks,fixture.hm,'lista',q({page:2,selectionRevision:first.body.selectionRevision}),{count:52,rows:2});
    checked(checks,'50+2 distinct own offering IDs and later-page target',new Set([...first.body.rows,...second.body.rows].map(r=>r.offeringId)).size===52
     &&second.body.rows.some(r=>r.offeringId===metadata.pageOfferingIds[51])&&!first.body.rows.some(r=>r.offeringId===metadata.pageOfferingIds[51]));
    const all=await positive(checks,fixture.hm,'oversikt',q({}),{count:52,rows:52});
    checked(checks,'list and overview exact rows/revision',equal([...first.body.rows,...second.body.rows],all.body.rows)&&first.body.selectionRevision===all.body.selectionRevision);
   });
   for(const [name,query]of[['local-code-later-page',metadata.lastCode],['literal-percent','%'],['literal-underscore','_'],['literal-apostrophe',"O'Hara"],['code-case-insensitive',metadata.lastCode.toLowerCase()]])
    await run(name,async checks=>{for(const route of ['lista','oversikt']){const r=await positive(checks,fixture.hm,route,q({query}),{count:1,rows:1});checked(checks,'only actual last own offering found',r.body.rows[0].offeringId===metadata.pageOfferingIds[51]);}});
   for(const [name,query]of[['program-code','EK25'],['orientation-code','EKEKI'],['program-name',metadata.programNames[1]],['orientation-name',metadata.orientationNames[1]]])
    await run(name,async checks=>{for(const route of ['lista','oversikt']){const r=await positive(checks,fixture.hm,route,q({query}),{count:1,rows:1});checked(checks,'exact alternate program own identity',r.body.rows[0].offeringId===metadata.variantOfferingIds[1]);}});
   await run('exact-program-variants',async checks=>{
    const r=await positive(checks,fixture.hm,'oversikt',q({}),{count:52,rows:52});
    for(const id of metadata.variantOfferingIds)checked(checks,'actual own variant pinned metadata',r.body.rows.some(row=>row.offeringId===id&&row.searchDetails.programName!==null&&row.searchDetails.orientationName!==null));
   });
   await run('null-and-missing',async checks=>{
    const full=await positive(checks,fixture.hm,'oversikt',q({}),{count:52,rows:52});
    const nullable=full.body.rows.find(r=>r.offeringId===metadata.pageOfferingIds[46])?.searchDetails;
    checked(checks,'null own local/orientation codes stay null; valid own program remains pinned',nullable?.localCode===null&&nullable.programCode==='SA25'&&nullable.orientationCode===null&&nullable.programName!==null&&nullable.orientationName===null);
    const missing=await positive(checks,fixture.hm,'lista',q({query:'Syntetisk saknad sökram',status:'all'}),{count:1,rows:1});
    checked(checks,'missing actual plan has real codes but null names',missing.body.rows[0].plan===null&&missing.body.rows[0].searchDetails.programCode==='SA25'&&missing.body.rows[0].searchDetails.programName===null);
    const legacy=await positive(checks,fixture.hm,'lista',q({query:'MISSING-BASIS-LEGACY',status:'all'}),{count:1,rows:1});
    checked(checks,'actual missing basis preserves own plan/codes with null names',legacy.body.rows[0].plan!==null&&legacy.body.rows[0].source===null&&legacy.body.rows[0].searchDetails.programName===null&&legacy.body.rows[0].searchDetails.orientationName===null);
    for(const schoolform of ['grundskola','introduktionsprogram'])await positive(checks,fixture.hm,'oversikt',q({view:'timplan',schoolform,unitId:null,query:'',status:'all'}));
   });
   await run('school-customer-scope',async checks=>{
    await positive(checks,fixture.hm,'oversikt',q({unitId:null}),{count:53,rows:53});
    await positive(checks,fixture.hm,'lista',q({unitId:fixture.secondUnitId}),{count:1,rows:1});
    const foreignSetup=await request(metadata.foreignHm,'urval');checked(checks,'foreign actual own setup',foreignSetup.status===200&&foreignSetup.auditPaired&&foreignSetup.noStore&&foreignSetup.unchanged);
    const r=await request(metadata.foreignHm,'lista',q({unitId:metadata.foreignUnitId,query:metadata.lastCode,status:'all'}));
    const foreignParsed=r.status===200?parsePlanningList(r.body,parsePlanningSelection(q({unitId:metadata.foreignUnitId,query:metadata.lastCode,status:'all'}),parsePlanningSetup(foreignSetup.body)),parsePlanningSetup(foreignSetup.body)):null;
    checked(checks,'foreign actual same-code row remains in its own customer',r.status===200&&foreignParsed.count===1&&foreignParsed.rows?.[0]?.offeringId===metadata.foreignOfferingId&&r.auditPaired&&r.noStore&&r.unchanged&&await fixture.metadataMatches(foreignParsed.rows));
    await denied(checks,fixture.hm,'lista',q({unitId:metadata.foreignUnitId}),403);
   });
   await run('filters-sort-empty',async checks=>{
    for(const patch of [{grade:1,cohortRelation:'new',archive:'active'},{schoolYear:metadata.planningYear+1,cohortRelation:'continuing'},
     {sort:'school',direction:'desc'},{sort:'version',direction:'desc'},{archive:'archived'},{query:'Syntetisk ingen träff'}]){
     const first=await positive(checks,fixture.hm,'lista',q(patch)),all=await positive(checks,fixture.hm,'oversikt',q(patch));
     checked(checks,'actual combined selection has same count/first page/revision',first.body.count===all.body.count&&equal(first.body.rows,all.body.rows.slice(0,50))&&first.body.selectionRevision===all.body.selectionRevision);
     if(patch.query)checked(checks,'empty result is actual',all.body.count===0);
     if(patch.archive==='archived')checked(checks,'one own archived frame',all.body.count===1);
    }
   });
   await run('frozen-source-metadata',async checks=>{
    const input=q({view:'timplan',unitId:null,query:metadata.sharedQuery,status:'all'}),before=await positive(checks,fixture.hm,'oversikt',input,{count:2,rows:2});
    await fixture.changeFrozenSource();await fixture.changeFrozenEducation();
    const after=await positive(checks,fixture.hm,'oversikt',input,{count:2,rows:2});
    const strip=row=>{const{searchDetails,...core}=row;return core;};
    checked(checks,'frozen source/years/cells/IDs unchanged; own mismatch does not acquire another orientation name',equal(before.body.rows.map(strip),after.body.rows.map(strip))
     &&after.body.rows.every(r=>r.searchDetails.programName===before.body.rows[0].searchDetails.programName&&r.searchDetails.orientationCode==='SASAP'&&r.searchDetails.orientationName===null));
   });
   await run('revision-local-code-conflict',async checks=>{
    const first=await positive(checks,fixture.hm,'lista',q({}),{count:52,rows:50});await fixture.changeLocalCode();
    const stale=q({page:2,selectionRevision:first.body.selectionRevision});await denied(checks,fixture.hm,'lista',stale,409);
    const fresh=await positive(checks,fixture.hm,'lista',q({}),{count:52,rows:50});checked(checks,'own local code alone changes full selection revision',fresh.body.selectionRevision!==first.body.selectionRevision);
   });
   await run('security-denials',async checks=>{
    await denied(checks,fixture.hm,'lista',q({}),401,{noSession:true});await denied(checks,fixture.hm,'lista',q({}),409,{headers:{'X-Context-Epoch':String(fixture.hm.epoch+1)}});
    await denied(checks,fixture.hm,'lista',{...q({}),unexpected:true},400);await denied(checks,fixture.admin,'lista',q({view:'timplan',schoolform:'grundskola',unitId:null}),403);
   });
   await run('audit-failures',async checks=>{
    for(const source of ['db','worker'])for(const [route,action]of[['urval','planning_year_selection_read'],['lista','planning_year_list_read'],['oversikt','planning_year_overview_read']]){
     try{await fixture.injectAuditFailure(source,action);await denied(checks,fixture.hm,route,q({}),503);}finally{if(!cleanupDeferred)await fixture.clearAuditFailure();}
    }
   });
   let revision;
   for(const name of ['list','search','page2','overview'])for(let iteration=1;iteration<=3;iteration++){
    const input=q(name==='search'?{query:metadata.lastCode}:name==='page2'?{page:2,selectionRevision:revision}:{}),checks=[];
    const expected=name==='search'?{count:1,rows:1}:name==='page2'?{count:52,rows:2}:name==='overview'?{count:52,rows:52}:{count:52,rows:50};
    const route=name==='overview'?'oversikt':'lista',r=await positive(checks,fixture.hm,route,input,expected);
    if(!checks.every(c=>c.ok))throw Error('search_timing_read_failed');if(name==='list'&&iteration===1)revision=r.body.selectionRevision;
    samples.push({case:name,iteration,phase:'after',startedAt:r.startedAt,durationMs:r.durationMs,httpStatus:r.status,count:r.body.count,rows:r.body.rows.length,selectionRevision:r.body.selectionRevision,noStore:r.noStore,auditPaired:r.auditPaired,businessUnchanged:r.unchanged,status:'PASS'});
    process.stdout.write(`HTTP ${name} ${iteration}: ${Math.round(r.durationMs)} ms\n`);
   }
  }
 }catch(e){failure=planningSafeFailure(e);}
 finally{if(fixture&&!cleanupDeferred)try{await fixture.clearAuditFailure();cleanup=await fixture.cleanup();}catch(e){failure??=planningSafeFailure(e);}}
 return {ok:!failure&&!cleanupDeferred&&searchCasesComplete(cases,applied?SEARCH_API_CASES:['legacy-parser-role-reads'])&&searchCleanupPreserved(cleanup)&&(!applied||searchTimingsComplete(samples)),cases,samples,cleanup,cleanupDeferred,
  recovery:cleanupDeferred?{ownedCustomerId:fixture?.customerId,ownedOrganizerId:fixture?.organizerId,reason:'OWNED_READ_UNDRAINED'}:null,failure};
}
async function main(){
 const o=parseSearchArgs(process.argv.slice(2)),bundle=dependencyBundle(),dependencyHashes=validateSearchDependencies(bundle);
 const proof=await verifySearchWorker(o.baseURL,bundle.performanceFinal),target=await assertTarget('protected'),db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const source=read(`supabase/migrations/${SEARCH_MIGRATION}`).toString(),test=read(SEARCH_TEST).toString(),performanceSource=read(`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString(),foundation=read(`supabase/migrations/${PLANNING_FOUNDATION}`).toString(),originalTest=read(PLANNING_TEST).toString();
 validateSearchMigration(source,performanceSource);
 if(sha(foundation)!==PERFORMANCE_FOUNDATION_HASH||sha(originalTest)!==PERFORMANCE_ORIGINAL_TEST_HASH)throw Error('REFUSED: immutable originals changed');
 const beforeCatalog=await readSearchCatalog(db),beforeAcl=await gymAcl(db),originalHashes=await planningBusinessHashes(db),baselineFingerprint=searchCatalogFingerprint(beforeCatalog),sourceHashes=Object.fromEntries(SEARCH_SOURCE_PATHS.map(p=>[p,sha(read(p))]));
 const auditIds=(await db`select id::text from public.security_events order by id`).map(r=>r.id),identityIds=(await db`select id::text from public.identities order by id`).map(r=>r.id),originalAnchors=await searchAuditAnchors(db,auditIds,identityIds);
 let sql,sqlProof,definitionDiff,candidateDefinitionHash,parserApi,searchApi,fullApi,afterCatalog,afterAcl,finalHashes,finalOriginalAnchors,finalAllAnchors,failure,databaseRecoveryRequired=false;
 const checks=[],originalSql={};
 try{
  validateSearchJournal(beforeCatalog,read,o.mode==='applied');
  const currentHash=sha(beforeCatalog.functions.find(f=>f.signature===SEARCH_ENTRY)?.definition??'');
  if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),SEARCH_WORKER_ENTRIES))throw Error('REFUSED: exact28 entries required');
  if(o.mode==='rollback'&&currentHash!==dependencyHashes.performanceDefinitionHash)throw Error('REFUSED: actual applied performance definition changed');
  if(o.mode==='rollback'&&(!equal(beforeCatalog,bundle.performanceFinal.afterCatalog)||!equal(originalHashes,bundle.performanceFinal.finalHashes)||!equal(beforeAcl,bundle.performanceFinal.afterAcl)))throw Error('REFUSED: actual catalog, RLS/ACL or original15 rows drifted since applied performance');
  if(o.mode==='applied'){
   const previous=JSON.parse(read('work/pilot/results/phase5-40-search-details-rollback.json').toString());validateSearchRollback(previous);
   const applyProof=JSON.parse(read('work/pilot/results/phase5-40-search-details-apply.json').toString());validateSearchApplied(applyProof,previous);
   if(currentHash!==previous.candidateDefinitionHash||!equal(dependencyHashes,previous.dependencyHashes)||proof.buildRevision!==previous.workerBuildRevision)throw Error('REFUSED: applied search differs from complete rollback/Worker proof');
   if(searchCatalogFingerprint(beforeCatalog)!==applyProof.afterFingerprint)throw Error('REFUSED: current catalog differs from controlled SEARCH apply');
   if(!equal(originalHashes,applyProof.finalHashes)||!equal(beforeAcl,applyProof.afterAcl))throw Error('REFUSED: original15 rows or raw ACL drifted after controlled SEARCH apply');
   candidateDefinitionHash=previous.candidateDefinitionHash;
  }
  checked(checks,'exact current journal, source-bound dependency, private helper and28 entries',true);
  process.stdout.write('Running SEARCH exact old/new SQL/core/provenance in rollback\n');
  const actual=await sqlRun(target,searchRollbackScript(test,source,performanceSource),db);sql=sqlEvidence(actual);sqlProof=searchSqlProof(actual.stdout);
  const marker=actual.stdout.split('\n').filter(l=>l.startsWith('PLANNING_SEARCH_DEFINITION|')),catalogMarker=actual.stdout.split('\n').filter(l=>l.startsWith('PLANNING_SEARCH_CATALOG|'));
  if(marker.length!==1||catalogMarker.length!==1)throw Error('search_candidate_marker_missing');
  const definition=JSON.parse(marker[0].slice('PLANNING_SEARCH_DEFINITION|'.length)),catalog=JSON.parse(catalogMarker[0].slice('PLANNING_SEARCH_CATALOG|'.length));
  if(definition.signature!==SEARCH_ENTRY||!hashPattern.test(definition.definitionHash??'')||candidateDefinitionHash&&candidateDefinitionHash!==definition.definitionHash)throw Error('search_candidate_hash_changed');
  candidateDefinitionHash=definition.definitionHash;definitionDiff=assertSearchDiff(catalog.before,catalog.after);
  checked(checks,'exact old/new core and intentional search differences with real source provenance',searchSqlCompleted(sql)&&exactSearchTap(sql.tap,SEARCH_SQL_TAP_TOTAL)&&sqlProof.ok);
  checked(checks,'candidate rollback restores full actual catalog/ACL/journal/business',equal(beforeCatalog,await readSearchCatalog(db))&&equal(beforeAcl,await gymAcl(db))&&equal(originalHashes,await planningBusinessHashes(db)));
  for(const [name,definitionSource]of[['original',extractOriginalPlanningRows(foundation)],['candidate',source]]){
   process.stdout.write(`Running unchanged original93/18 around ${name} definition in rollback\n`);
   const r=await sqlRun(target,searchHistoricalScript(originalTest,definitionSource),db);originalSql[name]={...sqlEvidence(r),parity:originalPlanningParityProof(r.stdout)};
   checked(checks,`immutable original93 assertions/18 strict contracts on ${name}, no skips, restore28 raw ACL`,searchSqlCompleted(r)&&exactSearchTap(originalSql[name].tap,93)&&originalSql[name].parity.ok
    &&equal(beforeCatalog,await readSearchCatalog(db))&&equal(beforeAcl,await gymAcl(db))&&equal(originalHashes,await planningBusinessHashes(db)));
  }
  if(!checks.every(c=>c.ok))throw Error('search_sql_failed');
  const apiOut=join(dirname(o.out),o.mode==='rollback'?'phase5-40-search-details-parser-api.json':'phase5-40-search-details-api-final.json');
  if(!safeSearchOutput(apiOut))throw Error('REFUSED: unsafe dedicated API proof destination');
  const apiProcess=await processResult(process.execPath,[join(root,'work/pilot/verify-planning-year-api.mjs'),'--target','protected','--base-url',o.baseURL,'--out',apiOut],{timeoutMs:1200000});
  if(apiProcess.timedOut||apiProcess.outputOverflow||apiProcess.streamError||apiProcess.signal){databaseRecoveryRequired=true;throw Error('search_unchanged_api_completion_unknown');}
  if(apiProcess.exitCode!==0||!existsSync(apiOut))throw Error('search_unchanged_full_api_failed');fullApi=JSON.parse(readFileSync(apiOut,'utf8'));validatePerformanceBaseApi(fullApi,read);
  checked(checks,'unchanged full actual38 matrix on new parser Worker, dedicated fresh report',fullApi.workerBuildRevision===proof.buildRevision);
  if(o.mode==='rollback')parserApi=await httpProof(o.baseURL,false);else searchApi=await httpProof(o.baseURL,true);
  checked(checks,o.mode==='rollback'?'actual new-parser old-shape role reads':'actual complete search/provenance/denials/audit matrix and12 full timing reads',o.mode==='rollback'?parserApi.ok:searchApi.ok);
 }catch(e){failure=planningSafeFailure(e);if(e.message==='search_owned_backend_not_stopped')databaseRecoveryRequired=true;}
 finally{
  databaseRecoveryRequired=searchRecoveryRequired(databaseRecoveryRequired,o.mode==='rollback'?parserApi:searchApi);
  if(!databaseRecoveryRequired)try{afterCatalog=await readSearchCatalog(db);afterAcl=await gymAcl(db);finalHashes=await planningBusinessHashes(db);finalOriginalAnchors=await searchAuditAnchors(db,auditIds,identityIds);finalAllAnchors=await searchAuditAnchors(db);}catch(e){failure??=planningSafeFailure(e);}await db.end({timeout:5});
 }
 const http=o.mode==='rollback'?parserApi:searchApi,cleanup=http?.cleanup,catalogPreserved=equal(beforeCatalog,afterCatalog),aclPreserved=equal(beforeAcl,afterAcl),businessPreserved=equal(originalHashes,finalHashes)&&searchCleanupPreserved(cleanup),anchorsPreserved=searchAnchorsValid(originalAnchors,finalOriginalAnchors);
 checked(checks,'full catalog/journal/rawACL and all15 whole original rows/timestamps preserved',catalogPreserved&&aclPreserved&&businessPreserved);
 checked(checks,'all original and newly retained audit/identity anchors preserved',anchorsPreserved&&searchCleanupPreserved(cleanup));
 const complete=!failure&&checks.every(c=>c.ok),report={kind:'phase5-planning-year-search-details',mode:o.mode,target:'protected',scope:'local-synthetic-only',reset:false,rollback:true,status:complete?'PASS':'FAIL',complete,checks,
  sourceCommit:proof.sourceRevision,workerBuildRevision:proof.buildRevision,parserBuild:proof,sourceHashes,sourceHash:sha(source),testHash:sha(test),dependencyHashes,
  beforeCatalog,afterCatalog,baselineFingerprint,finalFingerprint:afterCatalog?searchCatalogFingerprint(afterCatalog):null,originalDefinitionHash:dependencyHashes.performanceDefinitionHash,candidateDefinitionHash,definitionDiff,
  beforeAcl,afterAcl,beforeWorkerFunctions:beforeAcl.filter(r=>r.granted).map(r=>r.f),afterWorkerFunctions:afterAcl?.filter(r=>r.granted).map(r=>r.f)??[],originalHashes,finalHashes,
  originalAnchors,finalOriginalAnchors,finalAllAnchors,functionsAndJournalPreserved:catalogPreserved,aclUnchanged:aclPreserved,originalBusinessPreserved:businessPreserved,originalTimestampsPreserved:businessPreserved,
  originalAuditPreserved:anchorsPreserved&&cleanup?.originalAuditPreserved===true,identityAnchorsPreserved:anchorsPreserved&&cleanup?.identityAnchorsPreserved===true,cleanupStatus:searchCleanupPreserved(cleanup)?'PASS':'FAIL',cleanup,
  sql,sqlProof,originalSql,parserApi,searchApi,fullApiStatus:fullApi?.status??null,fullApi:fullApi?{report:o.mode==='rollback'?'phase5-40-search-details-parser-api.json':'phase5-40-search-details-api-final.json',sha256:sha(JSON.stringify(fullApi)),sourceCommit:fullApi.sourceCommit,workerBuildRevision:fullApi.workerBuildRevision,cases:fullApi.cases.length}:null,
  performance:searchApi?{ok:searchTimingsComplete(searchApi.samples),policy:'new-search-completed-http-median5s-all-under10s',
   reference:{kind:'historical-performance-applied-reference',sha256:dependencyHashes.performanceFinal,
    // The reference used its original owned dataset/search. This comparison is
    // descriptive and cannot isolate catalogue-name cost from our extra variants.
    comparison:'different-owned-fixture-not-a-causal-cost-estimate',groups:Object.fromEntries(['list','search','page2','overview'].map(name=>[name,timingSummary(bundle.performanceFinal.timings.samples.filter(s=>s.case===name))]))},
   groups:Object.fromEntries(['list','search','page2','overview'].map(name=>{const group=searchApi.samples.filter(s=>s.case===name);return [name,group.length===3?timingSummary(group):null];}))}:null,databaseRecoveryRequired,failure};
 preserveSearchReport(o.out,report);process.stdout.write(`${report.status} SEARCH ${o.mode}; SQL ${sql?.tap?.total??0}; original93/18 twice; whole-state cleanup ${report.cleanupStatus}\n`);if(!complete)process.exitCode=1;
 // A refused drain must not trigger destructive cleanup or keep the local
 // coordinator alive through its fixture pools. The failed report retains only
 // explicit owned recovery IDs; the independent Worker is left for root recovery.
 if(http?.cleanupDeferred||databaseRecoveryRequired)process.exit(1);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':`FAILED: ${planningSafeFailure(e).code}\n`);process.exitCode=1;});
