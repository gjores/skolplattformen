import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PERFORMANCE_MIGRATION,PERFORMANCE_TEST,PERFORMANCE_ENTRY,PERFORMANCE_SOURCE_PATHS,PERFORMANCE_SQL_CASES,PERFORMANCE_ORIGINAL_PARITY_CASES,
 PERFORMANCE_FOUNDATION_HASH,PERFORMANCE_ORIGINAL_TEST_HASH,PERFORMANCE_ORIGINAL_DEFINITION_HASH,parseReadPerformanceArgs,
 assertPerformanceDiff,validatePerformanceBaseApi,validatePerformanceRollback,timingSummary,performanceTimingProof,
 performanceParityProof,performanceProgress,performanceCatalogFingerprint,performanceRollbackScript,historicalPlanningRollbackScript,extractOriginalPlanningRows} from './verify-planning-year-read-performance.mjs';
import {parsePerformanceApplyArgs} from './apply-planning-year-read-performance.mjs';
import {PLANNING_FOUNDATION,PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,sha} from './apply-planning-year-migration.mjs';
import {PLANNING_API_CASES,PLANNING_API_SOURCE_PATHS} from './verify-planning-year-api.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const clone=structuredClone;
const cases=names=>names.map(name=>({name,status:'PASS',checks:[{ok:true}]}));
const read=()=>Buffer.from('source');
const negative={
 'malformed-distribution':'22023','extra-distribution-row':'22023','duplicate-distribution-row':'22023','invalid-start':'22023',
 'invalid-program-version':'22023','truncated-frozen-inventory':'22023','shared-source-conflict':'40001','selection-stale':'40001',
 'foreign-scope-denied':'42501','cache-cell-limit-fallback':'54000',
};
function cleanup(){return {originalBusinessUnchanged:true,originalAuditPreserved:true,identityAnchorsPreserved:true,retainedAuditPreserved:true,retainedIdentityAnchorsPreserved:true,
 beforeRetainedAudit:{count:10,sha256:'c'.repeat(64)},afterRetainedAudit:{count:10,sha256:'c'.repeat(64)},
 beforeRetainedAnchors:{count:2,sha256:'d'.repeat(64)},afterRetainedAnchors:{count:2,sha256:'d'.repeat(64)},
 customers:0,sessions:0,plans:0,receipts:0,educationEvents:0,offerings:0,mandates:0,mintedSessions:0,triggers:0,functions:0,
 offeringUnits:0,unitPackages:0,libraryVersions:0,gymReceipts:0,timplans:0,classLinks:0,
 foreignRemaining:{offerings:0,offeringUnits:0,sessions:0},foreignRetainedAuditAnchors:{events:2,anchoredEvents:2}};}
const entries=[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES];
const hashes=()=>Object.fromEntries(PLANNING_TABLES.map(t=>[t,{count:0,sha256:'a'.repeat(64)}]));
const acls=()=>entries.map(f=>({f,granted:true,acl:'{postgres=X/postgres,skolplattform_worker=X/postgres}'}));
const sourceHashes=paths=>Object.fromEntries(paths.map(p=>[p,sha(read(p))]));
const anchors=()=>({audit:{count:10,sha256:'c'.repeat(64)},identities:{count:2,sha256:'d'.repeat(64)}});
function baseApi(){return {kind:'phase5-planning-year-api',status:'PASS',target:'protected',scope:'local-synthetic-only',preflight:false,complete:true,reset:false,
 aclUnchanged:true,functionsAndJournalPreserved:true,originalBusinessPreserved:true,originalTimestampsPreserved:true,originalAuditPreserved:true,identityAnchorsPreserved:true,
 cleanupStatus:'PASS',cleanup:cleanup(),beforeWorkerFunctions:[...entries],verifiedWorkerFunctions:[...entries],restoredWorkerFunctions:[...entries],beforeAcl:acls(),afterAcl:acls(),
 originalHashes:hashes(),finalHashes:hashes(),baselineFingerprint:'a'.repeat(64),finalFingerprint:'a'.repeat(64),sourceCommit:'a'.repeat(40),workerBuildRevision:'b'.repeat(40),
 cases:cases(PLANNING_API_CASES),sourceHashes:sourceHashes(PLANNING_API_SOURCE_PATHS)};}
function samples(applied=false,duration=17000){return (applied?['list','search','page2','overview']:['list','search','page2']).flatMap(name=>[1,2,3].map(iteration=>({
 case:name,iteration,durationMs:duration+iteration,httpStatus:200,count:name==='search'?1:52,rows:name==='search'?1:name==='page2'?2:name==='overview'?52:50,
 selectionRevision:'sha256:'+'a'.repeat(64),status:'PASS',auditPaired:true,noStore:true,businessUnchanged:true})));}
const tap=total=>({status:'PASS',total,assertions:Array.from({length:total},(_,i)=>`ok ${i+1} actual assertion`)});
function parityCases(){return PERFORMANCE_SQL_CASES.map(name=>({name,oldState:negative[name]??'00000',newState:negative[name]??'00000',oldHash:'a'.repeat(64),newHash:'a'.repeat(64),same:true}));}
function rollback(){return {kind:'phase5-planning-year-read-performance',mode:'rollback',status:'PASS',target:'protected',scope:'local-synthetic-only',complete:true,rollback:true,reset:false,
 originalDefinitionHash:PERFORMANCE_ORIGINAL_DEFINITION_HASH,candidateDefinitionHash:'b'.repeat(64),originalFoundationHash:PERFORMANCE_FOUNDATION_HASH,originalTestHash:PERFORMANCE_ORIGINAL_TEST_HASH,
 sourceHash:sha(read()),testHash:sha(read()),baselineFingerprint:performanceCatalogFingerprint(catalog()),finalFingerprint:performanceCatalogFingerprint(catalog()),beforeCatalog:catalog(),afterCatalog:catalog(),functionsAndJournalPreserved:true,aclUnchanged:true,
 originalBusinessPreserved:true,originalTimestampsPreserved:true,originalAuditPreserved:true,identityAnchorsPreserved:true,originalAnchors:anchors(),finalOriginalAnchors:anchors(),finalAllAnchors:anchors(),cleanupStatus:'PASS',cleanup:cleanup(),beforeAcl:acls(),afterAcl:acls(),
 beforeWorkerFunctions:[...entries],afterWorkerFunctions:[...entries],originalHashes:hashes(),finalHashes:hashes(),
 definitionDiff:{changedDefinitions:[PERFORMANCE_ENTRY],unexpectedDifferences:0,originalDefinitionHash:PERFORMANCE_ORIGINAL_DEFINITION_HASH,candidateDefinitionHash:'b'.repeat(64)},
 parity:{ok:true,cases:parityCases()},sql:{exitCode:0,tap:tap(143)},originalSql:{exitCode:0,tap:tap(93),parity:{ok:true,cases:PERFORMANCE_ORIGINAL_PARITY_CASES.map(name=>({name,ok:true}))}},
 timings:{samples:samples()},final38ProofStatus:'PASS',sourceCommit:'a'.repeat(40),workerBuildRevision:'b'.repeat(40),checks:[{ok:true}],sourceHashes:sourceHashes(PERFORMANCE_SOURCE_PATHS)};}
function catalog(){return {functions:[
 {signature:PERFORMANCE_ENTRY,definition:'old rows',acl:'{postgres=X/postgres}',owner:'postgres',volatility:'v',securityDefiner:true,config:['search_path=pg_catalog, public']},
 {signature:'public.other()',definition:'preserved',acl:null,owner:'postgres',volatility:'s',securityDefiner:false,config:null}],
 tables:[{relation:'public.timplans',acl:null,owner:'postgres',relrowsecurity:true,relforcerowsecurity:true}],journal:[{version:'20261006121000',name:'old',statements:['old']} ]};}
test('coordinator rejects remote targets ordinary3012 resets duplicateflags partial args unsafe output',()=>{
 const good=['--target','protected','--mode','rollback','--base-url','http://127.0.0.1:3060','--out','/private/tmp/read-performance.json'];
 assert.equal(parseReadPerformanceArgs(good).mode,'rollback');assert.equal(parseReadPerformanceArgs(good.map(v=>v==='rollback'?'applied':v)).mode,'applied');
 for(const args of [[],good.concat('--reset'),good.concat('--mode','applied'),good.slice(0,-1),good.map(v=>v==='protected'?'baseline':v),
  good.map(v=>v==='rollback'?'setup':v),good.map(v=>v==='http://127.0.0.1:3060'?'https://remote.test':v),
  good.map(v=>v==='http://127.0.0.1:3060'?'http://127.0.0.1:3012':v),good.map(v=>v==='/private/tmp/read-performance.json'?'/Users/test/proof.json':v)])assert.throws(()=>parseReadPerformanceArgs(args));
});
test('apply accepts only exact correction and safe evidence output, never old migrations reset or force',()=>{
 const args=['--migration',PERFORMANCE_MIGRATION,'--evidence','/private/tmp/proof.json','--out','/private/tmp/apply.json'];
 assert.equal(parsePerformanceApplyArgs(args).migration,PERFORMANCE_MIGRATION);
 for(const bad of [args.concat('--reset'),args.concat('--force'),args.map(v=>v===PERFORMANCE_MIGRATION?PLANNING_FOUNDATION:v),args.map(v=>v==='/private/tmp/apply.json'?'/Users/test/proof.json':v)])assert.throws(()=>parsePerformanceApplyArgs(bad));
});
test('one helper definition diff preserves function metadata all raw ACL and table policies',()=>{
 const before=catalog(),after=clone(before);after.functions[0].definition='new rows';const result=assertPerformanceDiff(before,after);
 assert.deepEqual(result.changedDefinitions,[PERFORMANCE_ENTRY]);assert.equal(result.originalDefinitionHash,sha('old rows'));assert.equal(result.candidateDefinitionHash,sha('new rows'));
 for(const change of [a=>a.functions[0].acl='open',a=>a.functions[0].owner='other',a=>a.functions[0].volatility='s',a=>a.functions[0].securityDefiner=false,
  a=>a.functions[0].config=['search_path=public'],a=>a.functions[1].definition='changed',a=>a.functions.pop(),a=>a.functions.push(clone(a.functions[0])),
  a=>a.tables[0].relrowsecurity=false,a=>a.tables[0].acl='open',a=>a.journal.push({version:'unexpected'})]){
  const bad=clone(after);change(bad);assert.throws(()=>assertPerformanceDiff(before,bad));
 }
 assert.throws(()=>assertPerformanceDiff(before,before));
});
test('apply journal diff allows precisely one exact corrective byte-bound journal record',()=>{
 const before=catalog(),after=clone(before);after.functions[0].definition='new rows';after.journal.push({version:'20261006122000',name:'phase5_planning_year_read_performance',statements:['candidate']});
 assert.doesNotThrow(()=>assertPerformanceDiff(before,after,{journal:'append',expectedSource:'candidate'}));
 for(const change of [a=>a.journal.at(-1).statements=['changed cache key'],a=>a.journal.at(-1).version='20261006122100',a=>a.journal[0].name='changed',a=>a.journal.push(a.journal.at(-1))]){
  const bad=clone(after);change(bad);assert.throws(()=>assertPerformanceDiff(before,bad,{journal:'append',expectedSource:'candidate'}));
 }
 assert.throws(()=>assertPerformanceDiff(before,after,{journal:'invalid',expectedSource:'candidate'}));
});
test('existing actual38 proof must be complete source-bound all15 cases all28 grants rawACL and cleanup',()=>{
 assert.doesNotThrow(()=>validatePerformanceBaseApi(baseApi(),read));
 for(const change of [e=>e.preflight=true,e=>e.complete=false,e=>e.cases.pop(),e=>e.cases[0].checks[0].ok=false,e=>e.beforeWorkerFunctions.pop(),
  e=>e.afterAcl[0].acl='changed',e=>e.cleanup.afterRetainedAudit.count++,e=>e.originalTimestampsPreserved=false,e=>e.finalHashes.point_plans.count++]){
  const e=baseApi();change(e);assert.throws(()=>validatePerformanceBaseApi(e,read));
 }
 assert.throws(()=>validatePerformanceBaseApi(baseApi(),()=>Buffer.from('changed source')));
});
test('SQL parity requires all46 unique actual expected SQLSTATE and identical outcome hashes',()=>{
 const output=values=>values.map(c=>'PLANNING_PERFORMANCE_PARITY|'+JSON.stringify(c)).join('\n');assert.equal(performanceParityProof(output(parityCases())).ok,true);
 for(const change of [c=>c.pop(),c=>c.push(c[0]),c=>c[0].same=false,c=>c[0].newHash='b'.repeat(64),c=>c[0].newState='42501',
  c=>{c[0].oldState='42501';c[0].newState='42501';},c=>c[0].oldHash=null,c=>c[0].name=c[1].name]){
  const c=parityCases();change(c);assert.equal(performanceParityProof(output(c)).ok,false);
 }
});
test('rollback gate rejects incomplete setup, changed cache source/definition, journal/ACL/timestamps/audit and skipped assertions',()=>{
 assert.doesNotThrow(()=>validatePerformanceRollback(rollback(),read));
 for(const change of [e=>e.complete=false,e=>e.mode='applied',e=>e.originalDefinitionHash='d'.repeat(64),e=>e.candidateDefinitionHash=e.originalDefinitionHash,
  e=>e.definitionDiff.candidateDefinitionHash='c'.repeat(64),e=>e.definitionDiff.changedDefinitions.push('public.other()'),e=>e.parity.cases.pop(),
  e=>e.parity.cases[0].newHash='d'.repeat(64),e=>e.originalSql.tap.total=92,e=>e.originalSql.tap.assertions[0]='not ok 1 failed',
  e=>e.sql.tap.assertions.pop(),e=>e.originalSql.parity.cases[0].ok=false,e=>e.checks[0].ok=false,e=>e.afterAcl[0].acl='changed',
  e=>e.finalFingerprint='b'.repeat(64),e=>e.afterCatalog.functions[0].definition='changed cache source',e=>e.afterCatalog.journal[0].name='changed journal',e=>e.finalHashes.timplans.count++,e=>e.cleanup.retainedIdentityAnchorsPreserved=false,
  e=>delete e.originalAnchors,e=>e.finalOriginalAnchors.audit.sha256='a'.repeat(64),e=>e.finalOriginalAnchors.identities.count++,e=>e.originalAnchors.audit.sha256='invalid',
  e=>delete e.finalAllAnchors,e=>e.finalAllAnchors.identities.count=1,e=>e.finalAllAnchors.audit.sha256='invalid',
  e=>e.timings.samples.pop(),e=>e.timings.samples[0].auditPaired=false,e=>e.timings.samples[0].durationMs=30001,e=>e.timings.samples[0].count=51,
  e=>e.timings.samples[1].selectionRevision='sha256:'+'b'.repeat(64),e=>delete e.sourceHashes[PERFORMANCE_SOURCE_PATHS[0]],e=>e.sourceHash='b'.repeat(64)]){
  const e=rollback();change(e);assert.throws(()=>validatePerformanceRollback(e,read));
 }
 assert.throws(()=>validatePerformanceRollback(rollback(),p=>Buffer.from(p.includes('performance.sql')?'different cache key':'source')));
});
test('real timing gate requires three serial cases each, expected improvement ceiling and overview samples',()=>{
 assert.deepEqual(timingSummary([{durationMs:1},{durationMs:9},{durationMs:5}]),{count:3,medianMs:5,minimumMs:1,maximumMs:9});
 assert.throws(()=>timingSummary([{durationMs:1}]));assert.throws(()=>timingSummary([{durationMs:0},{durationMs:1},{durationMs:2}]));
 assert.equal(performanceTimingProof(samples(),samples(true,1000)).ok,true);
 assert.equal(performanceTimingProof(samples(),samples(true,6000)).ok,false);
 assert.equal(performanceTimingProof(samples(false,2000),samples(true,1000)).ok,false);
 assert.equal(performanceTimingProof(samples(),samples(true,1000).filter(s=>s.case!=='overview')).ok,false);
 const tail=samples(true,1000);tail[0].durationMs=10000;assert.equal(performanceTimingProof(samples(),tail).ok,false);
});
test('historical93 rollback closes precisely three planning RPCs and restores with transaction rollback',()=>{
 const original=readFileSync(root+'supabase/tests/phase5_planning_year.test.sql','utf8'),script=historicalPlanningRollbackScript(original);
 assert.equal(sha(original),PERFORMANCE_ORIGINAL_TEST_HASH);assert.equal((script.match(/revoke execute on function/gu)??[]).length,3);
 for(const entry of PLANNING_ENTRIES)assert.ok(script.includes(`revoke execute on function ${entry} from skolplattform_worker;`));
 assert.match(script,/begin;[\s\S]*rollback;\s*$/u);assert.doesNotMatch(script,/\bcommit;/iu);
 assert.throws(()=>historicalPlanningRollbackScript(original+'\n-- changed'));assert.throws(()=>historicalPlanningRollbackScript('begin; commit; rollback;'));
});
test('candidate rollback preserves immutable original source and injects definition/catalog evidence once',()=>{
 const foundation=readFileSync(root+'supabase/migrations/'+PLANNING_FOUNDATION,'utf8'),sqlTest='begin;\nselect 1;\n-- PERFORMANCE_CANDIDATE_APPLY\nselect 2;\nrollback;\n';
 assert.equal(sha(foundation),PERFORMANCE_FOUNDATION_HASH);assert.match(extractOriginalPlanningRows(foundation),/^create or replace function public\.phase5_planning_year_rows/u);
 const script=performanceRollbackScript(sqlTest,'candidate SQL;',foundation);
 assert.equal((script.match(/PLANNING_PERFORMANCE_DEFINITION\|/gu)??[]).length,1);assert.equal((script.match(/PLANNING_PERFORMANCE_CATALOG\|/gu)??[]).length,1);
 assert.ok(script.indexOf('select 1;')<script.indexOf('candidate SQL;'));assert.ok(script.indexOf('candidate SQL;')<script.indexOf('select 2;'));
 assert.throws(()=>performanceRollbackScript(sqlTest.replace('-- PERFORMANCE_CANDIDATE_APPLY',''),'',foundation));
 assert.throws(()=>performanceRollbackScript(sqlTest.replace('select 1;','-- PERFORMANCE_CANDIDATE_APPLY'),'',foundation));
 assert.throws(()=>extractOriginalPlanningRows(foundation+'\n-- changed'));
});

test('SQL progress streaming accepts only named controlled case and SQLSTATE, never payloads or raw errors',()=>{
 assert.deepEqual(performanceProgress('psql:<stdin>:100: NOTICE: PERFORMANCE_PROGRESS|program-list-full|00000'),{case:'program-list-full',state:'00000'});
 assert.deepEqual(performanceProgress('NOTICE: PERFORMANCE_PROGRESS|invalid-start|22023'),{case:'invalid-start',state:'22023'});
 for(const raw of ['ERROR: arbitrary SQL secret','NOTICE: PERFORMANCE_PROGRESS|unknown-case|00000','NOTICE: PERFORMANCE_PROGRESS|invalid-start|payload',
  'NOTICE: PERFORMANCE_PROGRESS|invalid-start|22023 secret'])assert.equal(performanceProgress(raw),null);
});

test('candidate SQL keeps literal PLpgSQL dollar quotes and replacement tokens byte-for-byte',()=>{
 const foundation=readFileSync(root+'supabase/migrations/'+PLANNING_FOUNDATION,'utf8'),candidate=readFileSync(root+'supabase/migrations/'+PERFORMANCE_MIGRATION,'utf8');
 const template='begin;\n-- PERFORMANCE_CANDIDATE_APPLY\nrollback;\n';
 const script=performanceRollbackScript(template,candidate,foundation);
 assert.ok(script.includes(candidate+'\nselect \'PLANNING_PERFORMANCE_DEFINITION|\''));
 assert.equal((script.match(/as \$\$/gu)??[]).length,2);
 const literal="-- literal $$ $& $` $' tokens\n"+candidate;
 assert.ok(performanceRollbackScript(template,literal,foundation).includes(literal));
});
