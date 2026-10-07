import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,symlinkSync,linkSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PERFORMANCE_MIGRATION,PERFORMANCE_TEST,PERFORMANCE_ENTRY,PERFORMANCE_SOURCE_PATHS,PERFORMANCE_SQL_CASES,PERFORMANCE_ORIGINAL_PARITY_CASES,
 PERFORMANCE_FOUNDATION_HASH,PERFORMANCE_ORIGINAL_TEST_HASH,PERFORMANCE_ORIGINAL_DEFINITION_HASH,parseReadPerformanceArgs,
 assertPerformanceDiff,validatePerformanceBaseApi,validatePerformanceRollback,timingSummary,performanceTimingProof,
 performanceParityProof,performanceProgress,performanceCatalogFingerprint,performanceRollbackScript,historicalPlanningRollbackScript,extractOriginalPlanningRows,
 PERFORMANCE_RESERVE_POLICY,validateReusablePerformanceSql,validateCensoredTimingSample,validateOwnedDbCompletion,classifyPerformanceTimeout,
 performanceTimingLowerBoundProof,candidateDefinitionRollbackScript,canonicalPerformanceEvidencePath,computeAcceptedPerformanceTimingProof,validateReserveTimingEvidence,assertPerformanceEvidenceOutput,performanceProcessResult,performanceSqlNeedsCompletionProof,readHistoricalPerformanceSource,samePlanningTimingSelection,preservePerformanceReport,performanceSafeTransportFailure,performanceTimingAttempt,recordPerformanceAttemptResponse,completePerformanceTimingAttempt,installOwnedPerformanceTransport} from './verify-planning-year-read-performance.mjs';
import {parsePerformanceApplyArgs} from './apply-planning-year-read-performance.mjs';
import {PLANNING_FOUNDATION,PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,sha} from './apply-planning-year-migration.mjs';
import {PLANNING_API_CASES,PLANNING_API_SOURCE_PATHS,planningSelection} from './verify-planning-year-api.mjs';
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

const reuseCheckNames=['exact target journal, private helper attributes, original/candidate definition and 28 Worker entries',
 'actual complete old/new JSONB and negative SQLSTATE parity','candidate SQL rollback restores every public definition rawACL table/RLS and journal',
 'exactly one predicted private definition change and no ACL/table/journal change','all93 original SQL tests and18 actual SQL/TypeScript contracts without skips',
 'historical closed-ACL assertion rollback restores exact rawACL28/full state','all15 original business whole rows and timestamps preserved after own cleanup',
 'original and newly retained audit and identity anchors preserved','original audit and identity whole rows preserved from coordinator start through every SQL and HTTP step',
 'full public definitions owners rawACL table/RLS and complete journal unchanged by verifier'];
const httpCheck='actual serial 52-frame HTTP samples with exact audit pairs no-store stable revision and complete business preservation';
const reuseContext=()=>({reportHash:'4f231086020d7f9e739fc0b36f28ab4829c7daf82852eb3356812145852d1603',readHistorical:read,readCurrent:read,
 runtimePaths:['web/package.json','web/lib/programplan-catalog.ts','web/lib/server/planning-year.test.mjs']});
function reuseComponent(){const e=rollback();return {...e,status:'FAIL',complete:false,sourceCommit:'c0b5e1705c45dfa11e3490feef83ff4b1b2b6318',failure:null,
 checks:[...reuseCheckNames.map(name=>({name,ok:true})),{name:httpCheck,ok:false}],timings:{samples:[],failure:{code:'REQUEST_TIMEOUT'}}};}
function completionSample(name='list',iteration=1){
 const correlationId=`55000000-0000-4000-8000-${String(['list','search','page2'].indexOf(name)*3+iteration).padStart(12,'0')}`;
 const session={sessionId:'55000000-0000-4000-8000-000000000080',identityId:'55000000-0000-4000-8000-000000000010',
 membershipId:'55000000-0000-4000-8000-000000000020',assignmentId:'55000000-0000-4000-8000-000000000060',customerId:'55000000-0000-4000-8000-000000000001'};
 const events=['planning_year_selection_read','planning_year_list_read'].flatMap(action=>['db','worker'].map(source=>({
 correlation_id:correlationId,source,action,outcome:'ok',actor_identity_id:session.identityId,membership_id:session.membershipId,
 assignment_id:session.assignmentId,session_id:session.sessionId,customer_id:session.customerId,object_type:'planning_year_collection',object_id:null}))).map((e,i)=>({...e,id:String(101+(['list','search','page2'].indexOf(name)*3+iteration-1)*4+(name==='page2'?1:0)+i)}));
 const base=planningSelection(2026,{view:'programplan',query:'Syntetisk årsplaneringsram',status:'utkast'});
 const requestSelection={...base,...(name==='search'?{query:'Syntetisk årsplaneringsram52'}:name==='page2'?{page:2,selectionRevision:'sha256:'+'c'.repeat(64)}:{})};
 return {case:name,iteration,phase:'before',requestSelection,timeoutSignal:{kind:'AbortSignal.timeout',timeoutMs:30000,aborted:true,reasonName:'TimeoutError',errorIsReason:true},...session,correlationId,status:'RIGHT_CENSORED',errorName:'TimeoutError',elapsedMs:30002,lowerBoundMs:30000,
 durationMs:null,httpStatus:null,count:null,rows:null,selectionRevision:null,noStore:null,auditPaired:true,businessUnchanged:true,
 auditBaseline:{count:2,maxEventId:String(100+(['list','search','page2'].indexOf(name)*3+iteration-1)*4+(name==='page2'?1:0)),sha256:'a'.repeat(64)},dbCompletion:{ownedDbTransactionFinished:true,sessionLockReleased:true,
 barrier:{sessionId:session.sessionId,lockMode:'FOR UPDATE',rollback:true},correlationId,auditCount:4,auditGroupHash:sha(JSON.stringify(events)),events,newEventIds:events.map(e=>e.id)}};
}
function sqlPrep(){
 const owner=completionSample(),auditEvent={...owner.dbCompletion.events[2],id:'125',correlation_id:'55000000-0000-4000-8000-000000000099'};
 return {kind:'OWNED_SQL_PREPARATION',transport:'postgres',httpResponse:false,requestSelection:owner.requestSelection,correlationId:auditEvent.correlation_id,sessionId:owner.sessionId,count:52,rows:50,selectionRevision:'sha256:'+'c'.repeat(64),auditCount:1,auditHash:sha(JSON.stringify([auditEvent])),auditEvent,barrier:owner.dbCompletion.barrier,ownedDbTransactionFinished:true};
}
function censoredBefore(){return ['list','search','page2'].flatMap(name=>[1,2,3].map(i=>completionSample(name,i)));}
test('explicit reuse and applied rollback paths preserve defaults and reject aliases unsafe modes or overwritten input',()=>{
 const folder=mkdtempSync('/private/tmp/performance-reserve-path-');
 try{
  const proof=join(folder,'proof.json'),alias=join(folder,'alias.json');writeFileSync(proof,'{}');symlinkSync(proof,alias);
  // Only direct files in approved directories are supported, never arbitrary subdirectories.
  assert.throws(()=>canonicalPerformanceEvidencePath(proof,{input:true}));
  const direct=join('/private/tmp',`performance-proof-${Date.now()}.json`),sym=direct.replace('.json','-alias.json');writeFileSync(direct,'{}');symlinkSync(direct,sym);
  try{
   const args=['--target','protected','--mode','rollback','--base-url','http://127.0.0.1:3060','--out','/private/tmp/reserve-out.json'];
   assert.equal(parseReadPerformanceArgs([...args,'--reuse-sql-evidence',direct]).reuseSqlEvidence,direct);
   assert.throws(()=>parseReadPerformanceArgs([...args.slice(0,-1),sym,'--reuse-sql-evidence',direct]));
   assert.throws(()=>parseReadPerformanceArgs([...args,'--reuse-sql-evidence',direct,'--rollback-evidence',direct]));
   assert.throws(()=>parseReadPerformanceArgs([...args.map(v=>v==='rollback'?'applied':v),'--reuse-sql-evidence',direct]));
   assert.equal(parseReadPerformanceArgs([...args.map(v=>v==='rollback'?'applied':v),'--rollback-evidence',direct]).rollbackEvidence,direct);
   assert.throws(()=>parseReadPerformanceArgs([...args.slice(0,-1),direct.replace('/private/tmp/','/tmp/'),'--reuse-sql-evidence',direct]));
  }finally{rmSync(sym);rmSync(direct);}
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('SQL component reuse accepts only named sealed SQL success while historical coordinator FAIL stays FAIL',()=>{
 const e=reuseComponent(),original=clone(e),component=validateReusablePerformanceSql(e,reuseContext());
 assert.deepEqual(component.namedComponents,['performance143','performance46','original93','original18']);assert.deepEqual(e,original);assert.equal(e.status,'FAIL');assert.equal(e.complete,false);
 for(const mutate of [e=>e.sql.exitCode=3,e=>e.sql.timedOut=true,e=>e.sql.tap.assertions[0]+=' # SKIP omitted',e=>e.originalSql.tap.assertions[0]+=' # TODO later',e=>e.sql.tap.total=142,e=>e.sql.tap.assertions.pop(),
  e=>e.originalSql.tap.assertions[0]='not ok 1 actual failure',e=>e.parity.cases[0].newHash='b'.repeat(64),e=>e.originalSql.parity.cases.pop(),
  e=>e.originalFoundationHash='b'.repeat(64),e=>e.originalTestHash='b'.repeat(64),e=>e.sourceHash='b'.repeat(64),e=>e.sourceHashes[PERFORMANCE_TEST]='b'.repeat(64),
  e=>e.beforeWorkerFunctions.pop(),e=>e.afterAcl[0].acl='changed',e=>e.afterCatalog.functions[0].owner='other',e=>e.finalHashes.point_plans.count++,
  e=>e.finalOriginalAnchors.audit.sha256='b'.repeat(64),e=>e.finalOriginalAnchors.identities.count++,e=>e.cleanup.retainedIdentityAnchorsPreserved=false,
  e=>e.checks[0].ok=false,e=>e.checks.pop(),e=>e.checks.push({name:'ignored exception',ok:false}),e=>e.timings.failure.code='TEST_FAILED',
  e=>e.failure={code:'SQL_PROOF_FAILED'},e=>e.complete=true,e=>e.reusableExplicitNamedSqlComponents={},e=>e.workerBuildRevision='bad']){
  const bad=reuseComponent();mutate(bad);assert.throws(()=>validateReusablePerformanceSql(bad,reuseContext()));
 }
 for(const context of [{...reuseContext(),reportHash:'a'.repeat(64)}, {...reuseContext(),readHistorical:()=>Buffer.from('changed old SQL')},
  {...reuseContext(),readCurrent:p=>Buffer.from(p.endsWith(PERFORMANCE_MIGRATION)?'wrong cache key':'source')},
  {...reuseContext(),readCurrent:p=>Buffer.from(p.includes('fixtures.mjs')?'wrong fixture':'source')},
  {...reuseContext(),runtimePaths:[]}, {...reuseContext(),readCurrent:p=>Buffer.from(p.endsWith('programplan-catalog.ts')?'wrong runtime':'source')}])assert.throws(()=>validateReusablePerformanceSql(reuseComponent(),context));
});
test('current canonical full SQL report may have the same c0b5 commit but a fresh exact hash',()=>{
 const context={...reuseContext(),reportHash:'a'.repeat(64),currentFullReportHash:'a'.repeat(64)};
 assert.doesNotThrow(()=>validateReusablePerformanceSql(reuseComponent(),context));
 const bad=reuseComponent();bad.sql.exitCode=3;assert.throws(()=>validateReusablePerformanceSql(bad,context));
 const allowed={...context,readCurrent:p=>Buffer.from(p==='work/pilot/verify-planning-year-read-performance.mjs'?'new explicit measurement/gate code':'source')};
 assert.doesNotThrow(()=>validateReusablePerformanceSql(reuseComponent(),allowed));
});
test('censor classification requires the real timeout error and at least actual thirty seconds',()=>{
 const signal=AbortSignal.abort(new DOMException('timeout','TimeoutError'));assert.equal(classifyPerformanceTimeout(signal.reason,30001,signal),true);
 assert.equal(classifyPerformanceTimeout(signal.reason,30001,AbortSignal.abort()),false);
 assert.equal(classifyPerformanceTimeout({name:'TimeoutError'},30001,signal),false);
 for(const [error,time] of [[Error('timeout'),30001],[new DOMException('abort','AbortError'),30001],[new DOMException('timeout','TimeoutError'),29999],[{name:'TimeoutError'},NaN]])assert.equal(classifyPerformanceTimeout(error,time),false);
 assert.doesNotThrow(()=>validateCensoredTimingSample(completionSample()));
 for(const mutate of [s=>s.errorName='AbortError',s=>s.elapsedMs=29999,s=>s.lowerBoundMs=29999,s=>s.durationMs=30000,s=>s.count=52,s=>s.rows=50,
  s=>s.selectionRevision='sha256:'+'a'.repeat(64),s=>s.httpStatus=200,s=>s.noStore=true,s=>s.httpStatus=503,s=>s.businessUnchanged=false,
  s=>s.dbCompletion.ownedDbTransactionFinished=false,s=>s.dbCompletion.sessionLockReleased=false,s=>s.dbCompletion.barrier.rollback=false,
  s=>s.dbCompletion.barrier.sessionId='wrong',s=>s.dbCompletion.auditCount=3,s=>s.dbCompletion.newEventIds[0]='100',s=>s.dbCompletion.newEventIds[1]=s.dbCompletion.newEventIds[0],
  s=>s.dbCompletion.events[0].source='worker',s=>s.dbCompletion.events[0].outcome='denied',s=>s.dbCompletion.events[0].session_id='wrong',
  s=>s.dbCompletion.events[0].correlation_id='wrong',s=>s.dbCompletion.events[0].actor_identity_id='wrong',s=>s.dbCompletion.auditGroupHash='b'.repeat(64)]){
  const bad=completionSample();mutate(bad);assert.throws(()=>validateCensoredTimingSample(bad));
 }
 const headers=completionSample();headers.httpStatus=200;headers.noStore=true;assert.doesNotThrow(()=>validateCensoredTimingSample(headers));
});
test('audit completion never treats four wrong OK events or a lock without rollback as finished',()=>{
 assert.doesNotThrow(()=>validateOwnedDbCompletion(completionSample()));
 for(const mutate of [s=>s.dbCompletion.events[0].action='planning_year_overview_read',s=>s.dbCompletion.events[0].customer_id='wrong',
  s=>s.dbCompletion.events[0].object_type='wrong',s=>s.dbCompletion.events[0].object_id='invented',s=>s.dbCompletion.events[0].assignment_id='wrong',
  s=>s.dbCompletion.events[0].membership_id='wrong',s=>s.dbCompletion.events.pop(),s=>s.dbCompletion.barrier.lockMode='FOR SHARE']){
  const bad=completionSample();mutate(bad);bad.dbCompletion.auditGroupHash=sha(JSON.stringify(bad.dbCompletion.events));assert.throws(()=>validateOwnedDbCompletion(bad));
 }
});
test('lower bound is conservative and never invents exact old responses or speedup',()=>{
 const before=censoredBefore(),after=samples(true,1000),proof=performanceTimingLowerBoundProof(before,after,sqlPrep());
 assert.equal(proof.ok,true);assert.equal(proof.policy,PERFORMANCE_RESERVE_POLICY);assert.equal(proof.groups.list.beforeLowerBound.medianMs,30000);
 assert.ok(proof.groups.list.speedupLowerBound>=3);assert.equal(Object.hasOwn(proof.groups.list,'speedup'),false);
 assert.equal(performanceTimingProof(before,after).ok,false);
 for(const mutate of [s=>s.pop(),s=>s[0].status='PASS',s=>s[0].durationMs=30000,s=>s[0].dbCompletion.barrier.rollback=false,
  s=>s[1].correlationId=s[0].correlationId,s=>s[0].count=52]){const bad=censoredBefore();mutate(bad);assert.equal(performanceTimingLowerBoundProof(bad,after,sqlPrep()).ok,false);}
 assert.equal(performanceTimingLowerBoundProof(before,samples(true,6000),sqlPrep()).ok,false);
 const slow=samples(true,1000);slow[0].durationMs=10000;assert.equal(performanceTimingLowerBoundProof(before,slow,sqlPrep()).ok,false);
 assert.equal(performanceTimingLowerBoundProof(before,after.filter(s=>s.case!=='overview'),sqlPrep()).ok,false);
 assert.equal(computeAcceptedPerformanceTimingProof(rollback(),{timings:{samples:after}},read).ok,true);
});
test('short canonical helper proof is transaction rollback with literal exact candidate and no SQL case substitution',()=>{
 const foundation=readFileSync(root+'supabase/migrations/'+PLANNING_FOUNDATION,'utf8'),candidate=readFileSync(root+'supabase/migrations/'+PERFORMANCE_MIGRATION,'utf8');
 const script=candidateDefinitionRollbackScript(candidate,foundation);
 assert.ok(script.includes(candidate));assert.equal((script.match(/PLANNING_PERFORMANCE_DEFINITION\|/gu)??[]).length,1);
 assert.equal((script.match(/PLANNING_PERFORMANCE_CATALOG\|/gu)??[]).length,1);assert.match(script,/begin;[\s\S]*rollback;\s*$/u);assert.doesNotMatch(script,/\bcommit;/iu);
 assert.throws(()=>candidateDefinitionRollbackScript(candidate,foundation+'\n-- changed'));
});

test('reserve requires actual SQL prefetch, exact page requests and unique serial owned audit groups',()=>{
 const valid=()=>({policy:PERFORMANCE_RESERVE_POLICY,cleanupDeferred:false,samples:censoredBefore(),sqlPreparation:sqlPrep()});
 assert.doesNotThrow(()=>validateReserveTimingEvidence(valid()));
 for(const mutate of [e=>e.sqlPreparation=null,e=>e.sqlPreparation.auditHash='b'.repeat(64),e=>e.sqlPreparation.httpResponse=true,
  e=>e.sqlPreparation.requestSelection.schoolYear++,e=>e.sqlPreparation.auditEvent.actor_identity_id='wrong',e=>e.sqlPreparation.barrier.rollback=false,
  e=>e.samples[6].requestSelection.selectionRevision='sha256:'+'d'.repeat(64),e=>e.samples[4].requestSelection.schoolYear++,
  e=>e.samples[1].auditBaseline.maxEventId='100',e=>e.samples[1].sessionId='wrong',e=>e.samples[1].identityId='wrong',
  e=>e.samples[1].dbCompletion.newEventIds[0]=e.samples[0].dbCompletion.newEventIds[0],e=>e.samples.reverse(),
  e=>e.samples[0].timeoutSignal.errorIsReason=false,e=>e.cleanupDeferred=true]){
  const bad=valid();mutate(bad);assert.throws(()=>validateReserveTimingEvidence(bad));
 }
 assert.equal(performanceTimingLowerBoundProof(censoredBefore(),samples(true,1000)).ok,false);
});
test('evidence destinations reject broken symlinks, hardlink aliases and immutable/historical names',()=>{
 const stem='/private/tmp/performance-alias-'+Date.now(),proof=stem+'.json',link=stem+'-link.json',broken=stem+'-broken.json';
 writeFileSync(proof,'{}');linkSync(proof,link);symlinkSync(stem+'-missing.json',broken);
 try{
  assert.throws(()=>canonicalPerformanceEvidencePath(broken));assert.throws(()=>assertPerformanceEvidenceOutput(link,[proof]));
  assert.throws(()=>assertPerformanceEvidenceOutput('/private/tmp/phase5-read-performance-sealed-full-'+ 'a'.repeat(64)+'.json'));
  assert.throws(()=>assertPerformanceEvidenceOutput('/private/tmp/phase5-38-read-performance-rollback-fail-123.json'));
  assert.throws(()=>parsePerformanceApplyArgs(['--migration',PERFORMANCE_MIGRATION,'--evidence',proof,'--out',link]));
 }finally{for(const path of [proof,link,broken])rmSync(path,{force:true});}
});
test('SQL deadline aborts while the client is still alive and never treats exit zero as completed',async()=>{
 let abortCalls=0;
 const result=await performanceProcessResult(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:20,onAbort:async()=>{abortCalls++;return {ownedBackendStopped:true};}});
 assert.equal(abortCalls,1);assert.equal(result.timedOut,true);assert.equal(result.abortProof.ownedBackendStopped,true);assert.equal(performanceSqlNeedsCompletionProof(result),true);
 for(const partial of [{exitCode:0,timedOut:true},{exitCode:0,outputOverflow:true},{exitCode:0,streamError:true},{exitCode:0,signal:'SIGTERM'},{exitCode:3}])assert.equal(performanceSqlNeedsCompletionProof(partial),true);
 assert.equal(performanceSqlNeedsCompletionProof({exitCode:0,timedOut:false}),false);
});

test('eligible HTTP-only full report permits absent historical failure but rejects every SQL/pending failure',()=>{
 const omitted=reuseComponent();delete omitted.failure;assert.doesNotThrow(()=>validateReusablePerformanceSql(omitted,reuseContext()));
 const current=reuseComponent();current.failure={code:'REQUEST_TIMEOUT',reason:null};assert.doesNotThrow(()=>validateReusablePerformanceSql(current,reuseContext()));
 for(const mutate of [e=>e.failure={code:'TEST_FAILED'},e=>e.sqlCompletionPending=true,e=>e.timings.cleanupDeferred=true,e=>e.originalSql.timedOut=true,
  e=>e.sql.signal='SIGTERM',e=>e.originalSql.outputOverflow=true]){const bad=reuseComponent();mutate(bad);assert.throws(()=>validateReusablePerformanceSql(bad,reuseContext()));}
});

test('actual historical large generated catalog is read as bounded complete Git bytes',()=>{
 const data=readHistoricalPerformanceSource('web/lib/programplan-catalog.generated.json','c0b5e1705c45dfa11e3490feef83ff4b1b2b6318');
 assert.ok(data.length>1024*1024);assert.ok(data.length<8*1024*1024);assert.doesNotThrow(()=>JSON.parse(data.toString()));
});
test('actual JSONB selection echo compares exact primitive fields independent of PostgreSQL key order',()=>{
 const input=planningSelection(2026,{view:'programplan',query:'Syntetisk årsplaneringsram',status:'utkast'}),jsonb=Object.fromEntries(Object.entries(input).reverse());
 assert.equal(samePlanningTimingSelection(jsonb,input),true);assert.equal(samePlanningTimingSelection({...jsonb,extra:true},input),false);
 assert.equal(samePlanningTimingSelection({...jsonb,schoolYear:2027},input),false);
});

test('rapid failed report updates retain both older and newer exact FAIL bytes',()=>{
 const stem='performance-history-'+Date.now(),out='/private/tmp/'+stem+'.json',old={status:'FAIL',complete:false,proof:'older'};
 writeFileSync(out,JSON.stringify(old));const original=readFileSync(out,'utf8');
 try{
  preservePerformanceReport(out,{status:'FAIL',complete:false,proof:'newer'});
  preservePerformanceReport(out,{status:'FAIL',complete:false,proof:'newest'});
  const history=readdirSync('/private/tmp').filter(n=>n.startsWith(stem+'-fail-')).map(n=>readFileSync('/private/tmp/'+n,'utf8'));
  assert.ok(history.includes(original));assert.ok(history.some(raw=>JSON.parse(raw).proof==='newer'));assert.ok(history.some(raw=>JSON.parse(raw).proof==='newest'));
  assert.equal(history.length,4);
 }finally{for(const n of readdirSync('/private/tmp').filter(n=>n.startsWith(stem)))rmSync('/private/tmp/'+n,{force:true});}
});

const diagnosticAttempt=()=>performanceTimingAttempt({name:'list',iteration:2,phase:'before',startedAt:'2026-10-07T09:52:00.000Z',
 auditBaseline:{count:12,maxEventId:'181747',sha256:'a'.repeat(64)},selection:planningSelection(2026,{view:'programplan',query:'private input'})});
test('pending timing attempt persists only owned whitelisted metadata and a selection hash',()=>{
 const attempt=diagnosticAttempt();assert.equal(attempt.case,'list');assert.equal(attempt.iteration,2);assert.equal(attempt.stage,'fetch');
 assert.equal(attempt.auditBaseline.maxEventId,'181747');assert.match(attempt.selectionHash,/^[a-f0-9]{64}$/u);
 assert.equal(JSON.stringify(attempt).includes('private input'),false);
 assert.throws(()=>performanceTimingAttempt({name:'SECRET',iteration:1,phase:'before',startedAt:'secret',auditBaseline:{},selection:{}}));
 const a=performanceTimingAttempt({name:'page2',iteration:1,phase:'before',startedAt:'2026-10-07T09:52:00.000Z',
  auditBaseline:{count:12,maxEventId:'181747',sha256:'a'.repeat(64),token:'secret'},selection:planningSelection(2026)});
 assert.equal(JSON.stringify(a).includes('secret'),false);
});
test('transport diagnostics never expose messages stacks nested secrets or unapproved codes',()=>{
 const failure=Object.assign(new TypeError('https://secret.test/?token=secret'),{code:'ECONNRESET',cause:{code:'UND_ERR_SOCKET',message:'secret',token:'secret'}});
 assert.deepEqual(performanceSafeTransportFailure(failure),{name:'TypeError',code:'ECONNRESET',causeCode:'UND_ERR_SOCKET'});
 assert.deepEqual(performanceSafeTransportFailure({name:'secret',code:'PASSWORD_ABC',cause:{code:'secret'},stack:'secret'}),{name:null,code:null,causeCode:null});
 assert.equal(JSON.stringify(performanceSafeTransportFailure(failure)).includes('secret'),false);
});
test('actual response and own signal snapshots distinguish fetch JSON and unrelated network failures',()=>{
 const attempt=diagnosticAttempt(),network=Object.assign(new TypeError('secret'),{cause:{code:'ECONNREFUSED'}}),signal=new AbortController().signal;
 recordPerformanceAttemptResponse(attempt,undefined,network,signal,12);
 assert.equal(attempt.response,null);assert.equal(attempt.transportFailure.stage,'fetch');assert.equal(attempt.timeoutSignal.aborted,false);
 assert.equal(classifyPerformanceTimeout(network,31000,signal),false);assert.equal(attempt.timeoutSignal.errorIsReason,false);
 attempt.stage='response-json';const jsonError=new SyntaxError('secret body'),response=new Response('bad',{status:502,headers:{'x-correlation-id':'11111111-1111-1111-1111-111111111111'}});
 recordPerformanceAttemptResponse(attempt,response,jsonError,signal,13);
 assert.deepEqual(attempt.response,{httpStatus:502,correlationId:'11111111-1111-1111-1111-111111111111',correlationHeaderValid:true});
 assert.equal(attempt.transportFailure.stage,'response-json');assert.equal(attempt.transportFailure.name,'SyntaxError');
 recordPerformanceAttemptResponse(attempt,new Response('bad',{headers:{'x-correlation-id':'secret'}}),jsonError,signal,13);
 assert.equal(attempt.response.correlationId,null);assert.equal(attempt.response.correlationHeaderValid,false);assert.equal(JSON.stringify(attempt).includes('secret'),false);
 const timeout=new DOMException('secret','TimeoutError'),controller=new AbortController();controller.abort(timeout);
 recordPerformanceAttemptResponse(attempt,undefined,timeout,controller.signal,31000);
 assert.deepEqual(attempt.timeoutSignal,{kind:'AbortSignal.timeout',timeoutMs:30000,aborted:true,reasonName:'TimeoutError',errorIsReason:true});
});
test('completion error remains separate from the original transport failure and cannot manufacture audit proof',async()=>{
 const attempt=diagnosticAttempt(),network=Object.assign(new TypeError('secret URL'),{cause:{code:'UND_ERR_SOCKET'}});
 recordPerformanceAttemptResponse(attempt,undefined,network,new AbortController().signal,10);
 const completion=Error('performance_owned_db_transaction_not_finished');
 await assert.rejects(completePerformanceTimingAttempt(attempt,async()=>{throw completion;}),e=>e===completion);
 assert.deepEqual(attempt.transportFailure,{stage:'fetch',name:'TypeError',code:null,causeCode:'UND_ERR_SOCKET'});
 assert.deepEqual(attempt.completionFailure,{stage:'audit-group',reason:'AUDIT_GROUP_NOT_FINISHED',name:'Error',code:null,causeCode:null});
 assert.equal(attempt.response,null);assert.equal(Object.hasOwn(attempt,'ownedDbTransactionFinished'),false);
 assert.throws(()=>validateCensoredTimingSample({...attempt,status:'RIGHT_CENSORED',errorName:'TimeoutError',elapsedMs:31000,lowerBoundMs:30000}));
 const locked=diagnosticAttempt();await assert.rejects(completePerformanceTimingAttempt(locked,async stage=>{stage('session-barrier');throw Error('secret DSN');}));
 assert.equal(locked.completionFailure.stage,'session-barrier');assert.equal(locked.completionFailure.reason,'SESSION_BARRIER_FAILED');
 assert.equal(JSON.stringify(locked).includes('secret'),false);
 const success=diagnosticAttempt(),proof={ownedDbTransactionFinished:true};
 assert.equal(await completePerformanceTimingAttempt(success,async stage=>{stage('session-barrier');return proof;}),proof);
 assert.equal(success.completionFailure,null);
});


const transportFixture=()=>({hm:{token:'h'.repeat(43)},principal:{token:'p'.repeat(43)},principalB:{token:'b'.repeat(43)}});
test('owned close transport preserves request options deadlines body auth and response',async()=>{
 const original=globalThis.fetch,calls=[],reply={status:200};globalThis.fetch=(...args)=>{calls.push(args);return Promise.resolve(reply);};
 const installedOriginal=globalThis.fetch,fixture=transportFixture(),restore=installOwnedPerformanceTransport('http://127.0.0.1:3060',fixture);
 try{
  const signal=new AbortController().signal,headers={'Content-Type':'application/json',Cookie:`sp_session=${fixture.hm.token}`,'X-Context-Epoch':'7'},body='{"selection":"unchanged"}';
  const options={method:'POST',headers,signal,body,redirect:'error'};
  assert.equal(await fetch('http://127.0.0.1:3060/api/planering/lista',options),reply);
  assert.equal(calls[0][0],'http://127.0.0.1:3060/api/planering/lista');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][1].body,body);assert.equal(calls[0][1].method,'POST');assert.equal(calls[0][1].redirect,'error');
  assert.equal(calls[0][1].headers.get('connection'),'close');assert.equal(calls[0][1].headers.get('cookie'),headers.Cookie);
  assert.equal(calls[0][1].headers.get('x-context-epoch'),'7');assert.equal(headers.Connection,undefined);
  for(const [session,path]of[[fixture.principal,'/api/timplaner/gym/skapa'],[fixture.principalB,'/api/programplaner/skapa']]){
   await fetch(new URL('http://127.0.0.1:3060'+path),{headers:new Headers({Cookie:`sp_session=${session.token}`}),signal});
   assert.equal(calls.at(-1)[1].signal,signal);assert.equal(calls.at(-1)[1].headers.get('connection'),'close');
  }
  const getOptions={method:'GET',headers:{Cookie:`sp_session=${fixture.hm.token}`},signal};await fetch('http://127.0.0.1:3060/api/planering/urval',getOptions);
  assert.equal(calls.at(-1)[1].method,'GET');assert.equal(Object.hasOwn(calls.at(-1)[1],'body'),false);
 }finally{restore();assert.equal(globalThis.fetch,installedOriginal);globalThis.fetch=original;}
});
test('owned close transport refuses escaped scope and altered cookies without disclosing secrets',()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=(...args)=>{calls.push(args);return Promise.resolve({});};
 const fixture=transportFixture(),restore=installOwnedPerformanceTransport('http://127.0.0.1:3060',fixture),cookie=`sp_session=${fixture.hm.token}`;
 try{
  for(const url of ['https://remote.test/api/planering/lista','http://localhost:3060/api/planering/lista','http://127.0.0.1:3061/api/planering/lista',
   'http://127.0.0.1:3060/api/other','http://127.0.0.1:3060/api/planering/lista?q=secret','http://127.0.0.1:3060/api/planering/lista#fragment',
   'http://user:secret@127.0.0.1:3060/api/planering/lista','http://127.0.0.1:3060/api/planering/../planering/lista']){
   assert.throws(()=>fetch(url,{headers:{Cookie:cookie}}),error=>error.message==='performance_transport_scope_refused'&&!error.message.includes(fixture.hm.token));
  }
  for(const badCookie of ['',cookie+'; other=1',cookie+'; '+cookie,'sp_session=foreign'])assert.throws(()=>fetch('http://127.0.0.1:3060/api/planering/lista',{headers:{Cookie:badCookie}}));
  assert.throws(()=>fetch(new Request('http://127.0.0.1:3060/api/planering/lista',{headers:{Cookie:cookie}})));
  assert.equal(calls.length,0);
 }finally{restore();globalThis.fetch=original;}
 for(const base of ['https://remote.test','http://localhost:3060','http://127.0.0.1:3012','http://127.0.0.1:3060/','http://127.0.0.1:999'])assert.throws(()=>installOwnedPerformanceTransport(base,fixture));
 assert.throws(()=>installOwnedPerformanceTransport('http://127.0.0.1:3060',{...fixture,principal:fixture.hm}));
 assert.equal(globalThis.fetch,original);
});
test('owned close transport leaves unrelated fetch unchanged and restores on setup or timing failure',async()=>{
 const original=globalThis.fetch,calls=[];const fake=(...args)=>{calls.push(args);return Promise.resolve({});};globalThis.fetch=fake;
 try{
  for(const stage of ['setup','timing']){
   const fixture=transportFixture(),restore=installOwnedPerformanceTransport('http://127.0.0.1:3060',fixture),captured=globalThis.fetch;
   try{
    const options={method:'GET',headers:{'X-Unrelated':'same'},signal:new AbortController().signal};
    await fetch('https://unrelated.test/read',options);assert.equal(calls.at(-1)[1],options);
    throw Error(stage);
   }catch(error){assert.equal(error.message,stage);}finally{restore();}
   assert.equal(globalThis.fetch,fake);restore();assert.equal(globalThis.fetch,fake);
   assert.throws(()=>captured('http://127.0.0.1:3060/api/planering/lista',{headers:{Cookie:`sp_session=${fixture.hm.token}`}}));
  }
 }finally{globalThis.fetch=original;}
 const source=readFileSync(root+'work/pilot/verify-planning-year-read-performance.mjs','utf8');
 assert.match(source,/fixture=await createPlanningYearFixture\(\);restoreTransport=installOwnedPerformanceTransport\(baseURL,fixture\);const metadata=await fixture\.setup/u);
 assert.match(source,/finally\{\s*restoreTransport\?\.\(\);[\s\S]*?fixture\.cleanup\(\)/u);
});
