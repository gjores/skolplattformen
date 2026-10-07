import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,symlinkSync,unlinkSync,linkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {SEARCH_MIGRATION,SEARCH_TEST,SEARCH_ENTRY,SEARCH_SOURCE_PATHS,SEARCH_PARSER_PATHS,SEARCH_WORKER_ENTRIES,
 SEARCH_SQL_CORE_CASES,SEARCH_SQL_CORE_STATES,SEARCH_SQL_MATCH_CASES,SEARCH_SQL_TAP_TOTAL,SEARCH_API_CASES,SEARCH_PLANNING_ENTRIES,
 parseSearchArgs,assertSearchDiff,searchCatalogFingerprint,searchSqlProof,searchRollbackScript,searchHistoricalScript,
 validateHistoricalSources,validateSearchDependencies,validateSearchRollback,validateSearchMigration,searchCoreProjection,
 searchCasesComplete,searchAnchorsValid,validateSearchJournal,searchSqlNeedsDrain,searchTimingsComplete,safeSearchOutput,exactSearchTap,validateSearchApplied,processResult,historicalGitSource,searchSqlCompleted,searchRecoveryRequired} from './verify-planning-year-search-details.mjs';
import {parseSearchApplyArgs} from './apply-planning-year-search-details.mjs';
import {pinnedSearchDetails,SEARCH_LAST_CODE,searchFixtureName} from './phase5-planning-year-search-fixtures.mjs';
import {PERFORMANCE_MIGRATION,PERFORMANCE_ORIGINAL_PARITY_CASES} from './verify-planning-year-read-performance.mjs';
import {PLANNING_FOUNDATION,PLANNING_TEST,PLANNING_TABLES,PLANNING_ENTRIES,sha} from './apply-planning-year-migration.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),read=p=>readFileSync(join(root,p)),clone=structuredClone;
const migration=()=>read(`supabase/migrations/${SEARCH_MIGRATION}`).toString(),performanceSource=()=>read(`supabase/migrations/${PERFORMANCE_MIGRATION}`).toString();
function records(){
 const core=SEARCH_SQL_CORE_CASES.map(name=>{const state=SEARCH_SQL_CORE_STATES[name]??'00000';return {name,oldState:state,newState:state,
  oldCoreHash:'a'.repeat(64),newCoreHash:'a'.repeat(64),coreSame:true,oldRevision:state==='00000'?'sha256:'+'b'.repeat(64):null,
  newRevision:state==='00000'?'sha256:'+'c'.repeat(64):null,revisionPolicy:state==='00000'?'metadata-bound':'error-unchanged',detailsValid:state==='00000'?true:null};});
 const matches=Object.entries(SEARCH_SQL_MATCH_CASES).map(([name,e])=>({name,...e,expectedOldState:e.oldState,expectedNewState:e.newState,expectedOldCount:e.oldCount,expectedNewCount:e.newCount,
  oldHash:'d'.repeat(64),newHash:'e'.repeat(64),metadataProvenance:e.newState==='00000'?true:null,scopeValid:e.newState==='00000'?true:null}));
 return {core,matches};
}
const output=r=>[...r.core.map(c=>'PLANNING_SEARCH_PARITY|'+JSON.stringify(c)),...r.matches.map(c=>'PLANNING_SEARCH_MATCH|'+JSON.stringify(c))].join('\n');
const assertions=n=>({status:'PASS',total:n,assertions:Array.from({length:n},(_,i)=>`ok ${i+1} - assertion`)});
function cleanup(){return {originalBusinessUnchanged:true,originalAuditPreserved:true,identityAnchorsPreserved:true,retainedAuditPreserved:true,retainedIdentityAnchorsPreserved:true,
 beforeRetainedAudit:{count:8,sha256:'a'.repeat(64)},afterRetainedAudit:{count:8,sha256:'a'.repeat(64)},beforeRetainedAnchors:{count:2,sha256:'b'.repeat(64)},afterRetainedAnchors:{count:2,sha256:'b'.repeat(64)},
 ...Object.fromEntries(['customers','sessions','plans','receipts','educationEvents','offerings','mandates','mintedSessions','triggers','functions','offeringUnits','unitPackages','libraryVersions','gymReceipts','timplans','classLinks'].map(k=>[k,0])),
 foreignRemaining:{offerings:0,offeringUnits:0,sessions:0},foreignRetainedAuditAnchors:{events:2,anchoredEvents:2},searchAuditFixtures:{triggers:0,functions:0}};}
const anchors=()=>({audit:{count:8,sha256:'a'.repeat(64)},identities:{count:2,sha256:'b'.repeat(64)}});
function rollbackGateFixture(){
 const before={functions:[{signature:SEARCH_ENTRY,definition:'verified performance definition',acl:'{postgres=X/postgres}',owner:'postgres',volatility:'v',securityDefiner:true,config:['search_path=pg_catalog, public']}],tables:[],journal:[]};
 const sourceHashes=Object.fromEntries(SEARCH_SOURCE_PATHS.map(p=>[p,sha(read(p))])),originalDefinitionHash=sha(before.functions[0].definition),candidateDefinitionHash='f'.repeat(64),h=Object.fromEntries(PLANNING_TABLES.map(t=>[t,{count:0,sha256:'0'.repeat(64)}]));
 const old=()=>({exitCode:0,timedOut:false,outputOverflow:false,streamError:false,signal:null,tap:assertions(93),parity:{ok:true,cases:PERFORMANCE_ORIGINAL_PARITY_CASES.map(name=>({name,ok:true}))}});
 const e={kind:'phase5-planning-year-search-details',mode:'rollback',status:'PASS',complete:true,target:'protected',scope:'local-synthetic-only',reset:false,rollback:true,
  sourceCommit:'1'.repeat(40),workerBuildRevision:'2'.repeat(40),sourceHashes,sourceHash:sourceHashes[`supabase/migrations/${SEARCH_MIGRATION}`],testHash:sourceHashes[SEARCH_TEST],
  originalDefinitionHash,candidateDefinitionHash,beforeCatalog:before,afterCatalog:clone(before),baselineFingerprint:searchCatalogFingerprint(before),finalFingerprint:searchCatalogFingerprint(before),
  beforeAcl:[],afterAcl:[],beforeWorkerFunctions:[...SEARCH_WORKER_ENTRIES],afterWorkerFunctions:[...SEARCH_WORKER_ENTRIES],originalHashes:h,finalHashes:clone(h),
  originalAnchors:anchors(),finalOriginalAnchors:anchors(),finalAllAnchors:anchors(),functionsAndJournalPreserved:true,aclUnchanged:true,originalBusinessPreserved:true,originalTimestampsPreserved:true,
  originalAuditPreserved:true,identityAnchorsPreserved:true,cleanupStatus:'PASS',cleanup:cleanup(),checks:[{name:'gate',ok:true}],
  sql:{exitCode:0,timedOut:false,outputOverflow:false,streamError:false,signal:null,tap:assertions(SEARCH_SQL_TAP_TOTAL)},sqlProof:{ok:true,...records()},originalSql:{original:old(),candidate:old()},
  parserApi:{cases:[{name:'legacy-parser-role-reads',status:'PASS',checks:[{ok:true}]}]},fullApiStatus:'PASS',fullApi:{workerBuildRevision:'2'.repeat(40),cases:15,sha256:'5'.repeat(64)},
  dependencyHashes:{final38:'3'.repeat(64),performanceRollback:'3'.repeat(64),performanceFinal:'3'.repeat(64),performanceApi:'3'.repeat(64),performanceDefinitionHash:originalDefinitionHash},
  parserBuild:{actualWorker:true,revision:'2'.repeat(40),buildRevision:'2'.repeat(40),sourceRevision:'1'.repeat(40),parserSourceHashes:Object.fromEntries(SEARCH_PARSER_PATHS.map(p=>[p,sourceHashes[p]]))},
  definitionDiff:{changedDefinitions:[SEARCH_ENTRY],originalDefinitionHash,candidateDefinitionHash,unexpectedDifferences:0}};
 return e;
}
test('CLI requires isolated exact target, modes, safe filenames and explicit apply Worker',()=>{
 const args=['--target','protected','--mode','rollback','--base-url','http://127.0.0.1:3060','--out','/tmp/search-proof.json'];
 assert.equal(parseSearchArgs(args).mode,'rollback');
 for(const bad of [args.map(v=>v==='http://127.0.0.1:3060'?'http://127.0.0.1:3012':v),[...args,'--reset'],[...args,'--mode','applied'],args.slice(0,-2)])assert.throws(()=>parseSearchArgs(bad));
 const apply=['--migration',SEARCH_MIGRATION,'--evidence','/tmp/search-proof.json','--out','/tmp/search-apply.json','--base-url','http://127.0.0.1:3060'];
 assert.equal(parseSearchApplyArgs(apply).migration,SEARCH_MIGRATION);assert.throws(()=>parseSearchApplyArgs(apply.slice(0,-2)));
 assert.throws(()=>parseSearchApplyArgs(apply.map(v=>v===SEARCH_MIGRATION?PERFORMANCE_MIGRATION:v)));
 assert.throws(()=>parseSearchApplyArgs(apply.map(v=>v==='/tmp/search-apply.json'?'/tmp/search-proof.json':v)));
 assert.throws(()=>parseSearchApplyArgs(apply.map(v=>v==='/tmp/search-apply.json'?'/private/tmp/search-proof.json':v)));
 assert.throws(()=>parseSearchApplyArgs(apply.map(v=>v==='/tmp/search-proof.json'?'/etc/search-proof.json':v)));
});
test('SEARCH report paths reject historical destinations and symlink aliases including broken links',()=>{
 assert.equal(safeSearchOutput('/tmp/search-proof.json'),true);
 assert.equal(safeSearchOutput(join(root,'work/pilot/results/phase5-40-search-details-rollback.json')),true);
 for(const name of ['phase5-38-api-final.json','phase5-38-read-performance-final.json','phase5-38-read-performance-rollback.json']){
  assert.equal(safeSearchOutput(join(root,'work/pilot/results',name)),false);assert.equal(safeSearchOutput('/tmp/'+name),false);
 }
 const suffix=randomUUID(),target='/tmp/phase5-38-proof-'+suffix+'.json',alias='/tmp/search-alias-'+suffix+'.json',broken='/tmp/search-broken-'+suffix+'.json',hard='/tmp/search-hard-'+suffix+'.json';
 try{
  writeFileSync(target,'historical evidence');symlinkSync(target,alias);symlinkSync('/tmp/phase5-38-nonexistent-'+suffix+'.json',broken);linkSync(target,hard);
  assert.equal(safeSearchOutput(alias),false);assert.equal(safeSearchOutput(broken),false);assert.equal(safeSearchOutput(hard),false);assert.equal(readFileSync(target,'utf8'),'historical evidence');
 }finally{for(const p of [alias,broken,hard,target])try{unlinkSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}}
});
test('strict SQL TAP proof rejects SKIP, TODO and bailout without changing historical verifier sources',()=>{
 assert.equal(exactSearchTap(assertions(93),93),true);
 for(const suffix of [' # SKIP fixture unavailable',' # TODO later',' Bail out! controlled']){
  const t=assertions(93);t.assertions[20]+=suffix;assert.equal(exactSearchTap(t,93),false);
 }
});
test('actual name sort keeps target52 beyond page1 even when cohort years differ',()=>{
 const rows=Array.from({length:52},(_,index)=>({index,name:searchFixtureName(index),cohort:`Syntetisk kull ${2027+(index%3)-1}`}));
 rows.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.cohort<b.cohort?-1:1);
 assert.equal(rows[51].index,51);assert.equal(rows.slice(0,50).some(r=>r.index===51),false);assert.equal(new Set(rows.map(r=>r.name)).size,52);
 assert.throws(()=>searchFixtureName(52));
});
test('catalog change admits only one private definition and one exact source journal',()=>{
 const b=rollbackGateFixture().beforeCatalog,a=clone(b);a.functions[0].definition='candidate';
 assert.equal(assertSearchDiff(b,a).changedDefinitions[0],SEARCH_ENTRY);
 for(const edit of [x=>x.functions[0].owner='other',x=>x.functions[0].acl=null,x=>x.tables.push({relation:'offerings'}),x=>x.functions.push({...x.functions[0],signature:'public.extra()'})]){
  const broken=clone(a);edit(broken);assert.throws(()=>assertSearchDiff(b,broken));
 }
 a.journal.push({version:'20261006123000',name:'phase5_planning_year_search_details',statements:['candidate bytes']});
 assert.doesNotThrow(()=>assertSearchDiff(b,a,{journal:'append',expectedSource:'candidate bytes'}));
 assert.throws(()=>assertSearchDiff(b,a,{journal:'append',expectedSource:'different bytes'}));
});
test('all61 closed cases/states/counts required; self-reported expectations cannot override policy',()=>{
 assert.equal(SEARCH_SQL_CORE_CASES.length,38);assert.equal(Object.keys(SEARCH_SQL_MATCH_CASES).length,23);assert.equal(SEARCH_SQL_TAP_TOTAL,271);
 assert.equal(searchSqlProof(output(records())).ok,true);
 for(const change of [r=>r.core.pop(),r=>r.core.push(r.core[0]),r=>r.core[0].newCoreHash='f'.repeat(64),r=>r.core[0].detailsValid=false,
  r=>r.core.find(c=>c.name==='unknown-catalog').newState='00000',r=>r.core[0].newRevision=r.core[0].oldRevision,
  r=>r.matches[0].newCount=2,r=>{r.matches[0].newCount=2;r.matches[0].expectedNewCount=2;},r=>r.matches[0].metadataProvenance=false,
  r=>r.matches.find(c=>c.name==='stale-local-code').newCount=52,r=>r.matches.find(c=>c.name==='stale-catalog-name').newHash=null]){
  const r=records();change(r);assert.equal(searchSqlProof(output(r)).ok,false);
 }
});
test('SQL client overflow/signal/nonzero also require tagged backend drain, not only deadline',()=>{
 assert.equal(searchSqlNeedsDrain({exitCode:0,timedOut:false,outputOverflow:false,signal:null}),false);
 for(const r of [{exitCode:0,outputOverflow:true},{exitCode:1},{exitCode:null,signal:'SIGTERM'},{exitCode:0,timedOut:true}])assert.equal(searchSqlNeedsDrain(r),true);
});
test('unknown HTTP completion transfers a sticky recovery block before any final database snapshot',()=>{
 assert.equal(searchRecoveryRequired(false,{cleanupDeferred:true}),true);
 assert.equal(searchRecoveryRequired(true,{cleanupDeferred:false}),true);
 assert.equal(searchRecoveryRequired(false,{cleanupDeferred:false}),false);
 assert.equal(searchRecoveryRequired(false,undefined),false);
 const source=read('work/pilot/verify-planning-year-search-details.mjs').toString(),gate=source.indexOf('databaseRecoveryRequired=searchRecoveryRequired('),snapshot=source.indexOf('if(!databaseRecoveryRequired)try{afterCatalog=');
 assert.ok(gate>0&&snapshot>gate);
});
test('SQL deadline invokes owned backend-stop callback before client-close and retains timeout despite exit0',async()=>{
 let aborted=false;
 const running=processResult(process.execPath,['-e',"process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],
  {timeoutMs:300,onAbort:async()=>{aborted=true;return {ownedBackendStopped:true};}});
 const result=await running;assert.equal(aborted,true);assert.equal(result.timedOut,true);assert.equal(result.exitCode,0);assert.equal(result.abortProof.ownedBackendStopped,true);
 assert.equal(searchSqlNeedsDrain(result),true);assert.equal(searchSqlCompleted(result),false);
 const failed=await processResult(process.execPath,['-e',"setInterval(()=>{},1000)"],{timeoutMs:300,onAbort:async()=>{throw Error('controlled stop failure');}});
 assert.equal(failed.abortError,true);assert.equal(failed.timedOut,true);
});
test('fresh12 timing proof rejects censored/missing/auditless reads and enforces actual median5/all-under10',()=>{
 const samples=['list','search','page2','overview'].flatMap(name=>[1,2,3].map(iteration=>({case:name,iteration,phase:'after',status:'PASS',durationMs:1000,httpStatus:200,
  count:name==='search'?1:52,rows:name==='search'?1:name==='page2'?2:name==='overview'?52:50,selectionRevision:'sha256:'+'a'.repeat(64),noStore:true,auditPaired:true,businessUnchanged:true})));
 assert.equal(searchTimingsComplete(samples),true);
 for(const edit of [x=>x.pop(),x=>x[0].durationMs=null,x=>x[0].auditPaired=false,x=>x[0].durationMs=10000,x=>{x[0].durationMs=6000;x[1].durationMs=6000;},x=>x[0].count=51]){
  const broken=clone(samples);edit(broken);assert.equal(searchTimingsComplete(broken),false);
 }
});
test('core projection drops only declared details and two explicit revision paths',()=>{
 const original={selection:{selectionRevision:null,page:1},selectionRevision:'sha256:'+'a'.repeat(64),count:1,pageSize:50,
  rows:[{offeringId:'own',plan:{id:'p',revision:1},cells:[{points:3}],diagnostics:['missing-hours']}]};
 const next=clone(original);next.selectionRevision='sha256:'+'b'.repeat(64);next.rows[0].searchDetails={localCode:'L'};
 assert.deepEqual(searchCoreProjection(original),searchCoreProjection(next));
 next.rows[0].plan.id='foreign';assert.notDeepEqual(searchCoreProjection(original),searchCoreProjection(next));
 next.rows[0].plan.id='p';next.rows[0].cells[0].points=4;assert.notDeepEqual(searchCoreProjection(original),searchCoreProjection(next));
});
test('own codes mask pinned names by exact code/version without poisoning shared source metadata',()=>{
 const catalog={programs:[{code:'SA25',version:4,name:'Pinned programme',orientations:[{code:'SABEP',name:'Pinned orientation'}]},
  {code:'SA25',version:5,name:'Different version',orientations:[{code:'SABEP',name:'New orientation'}]}]};
 const basis={programRef:{code:'SA25',version:4},orientationCode:'SABEP'},own={local_code:SEARCH_LAST_CODE,program_code:'SA25',orientation_code:'SABEP'};
 assert.deepEqual(pinnedSearchDetails(own,basis,catalog),{localCode:SEARCH_LAST_CODE,programCode:'SA25',orientationCode:'SABEP',programName:'Pinned programme',orientationName:'Pinned orientation'});
 assert.equal(pinnedSearchDetails({...own,orientation_code:'SASAP'},basis,catalog).programName,'Pinned programme');
 assert.equal(pinnedSearchDetails({...own,orientation_code:'SASAP'},basis,catalog).orientationName,null);
 assert.equal(pinnedSearchDetails({...own,program_code:'EK25'},basis,catalog).programName,null);
 assert.equal(pinnedSearchDetails(own,null,catalog).programName,null);
 assert.equal(pinnedSearchDetails(own,{...basis,programRef:{code:'SA25',version:99}},catalog).programName,null);
 assert.equal(pinnedSearchDetails(own,basis,catalog).orientationName,'Pinned orientation');
});
test('historical source hashes read the exact report revision; missing future performance cannot pass',()=>{
 const report={sourceCommit:'1'.repeat(40),sourceHashes:{'web/lib/planning-year-contract.ts':sha('historical parser')}};
 const requested=[];validateHistoricalSources(report,['web/lib/planning-year-contract.ts'],(revision,p)=>{requested.push([revision,p]);return Buffer.from('historical parser');});
 assert.deepEqual(requested,[['1'.repeat(40),'web/lib/planning-year-contract.ts']]);
 assert.throws(()=>validateHistoricalSources(report,['web/lib/planning-year-contract.ts'],()=>Buffer.from('new parser')));
 assert.throws(()=>validateSearchDependencies({}));assert.throws(()=>validateSearchDependencies({performanceFinal:{status:'PASS'}}));
});
test('rollback uses unique candidate marker/catalog guard; historical93 is untouched and revoke3 is rollback-only',()=>{
 const script=searchRollbackScript(read(SEARCH_TEST).toString(),migration(),performanceSource());
 assert.ok(script.includes('pg_advisory_xact_lock(5520)'));assert.equal((script.match(/PLANNING_SEARCH_CATALOG\|/gu)??[]).length,1);assert.ok(script.endsWith('rollback;\n'));
 assert.throws(()=>searchRollbackScript('begin;\nrollback;',migration(),performanceSource()));
 const historical=searchHistoricalScript(read(PLANNING_TEST).toString(),migration());
 assert.equal((historical.match(/revoke execute on function/gu)??[]).length,3);assert.ok(historical.includes(read(PLANNING_TEST).toString().replace(/^begin;\s*/iu,'').replace(/rollback;\s*$/iu,'')));
 assert.throws(()=>searchHistoricalScript('begin;\nselect 1;\nrollback;',migration()));
});
test('reviewed SQL retains exact cache key, caps, frozen validation and typed pinned version lookup',()=>{
 validateSearchMigration(migration(),performanceSource());
 for(const [before,after]of [['tp.catalog_id,tp.basis_reference,tp.term_distribution','tp.catalog_id,tp.basis_reference'],['cardinality(cache_keys)<128','cardinality(cache_keys)<999'],
  ['cached_cell_count+jsonb_array_length(cells)<=50000','cached_cell_count+jsonb_array_length(cells)<=999999'],["program.value->'version'=source#>'{basisReference,programRef,version}'","program.value->>'version'=source#>>'{basisReference,programRef,version}'"]])
  assert.throws(()=>validateSearchMigration(migration().replace(before,after),performanceSource()));
 assert.throws(()=>validateSearchMigration(migration()+'\ngrant execute on function public.extra() to authenticated;\n',performanceSource()));
});
test('full rollback gate rejects incomplete SQL93/18, altered sources, partial cleanup and parser/API drift',()=>{
 const e=rollbackGateFixture();assert.doesNotThrow(()=>validateSearchRollback(e,read));
 for(const change of [x=>x.complete=false,x=>x.mode='applied',x=>x.sql.tap.assertions.pop(),x=>x.sql.timedOut=true,x=>x.sql.outputOverflow=true,x=>x.originalSql.candidate.streamError=true,x=>x.finalAllAnchors.audit.count=0,x=>x.cleanup.searchAuditFixtures.functions=1,x=>x.sourceHashes['unexpected']=sha('unknown'),x=>x.sql.tap.assertions[0]+=' # SKIP',x=>x.originalSql.original.tap.assertions[0]+=' # TODO',x=>x.originalSql.candidate.parity.cases.pop(),
  x=>x.originalSql.original.timedOut=true,x=>x.originalHashes.offerings.sha256='9'.repeat(64),x=>x.cleanup.retainedAuditPreserved=false,
  x=>x.cleanup.afterRetainedAudit.count++,x=>x.beforeWorkerFunctions.pop(),x=>x.originalDefinitionHash='e'.repeat(64),
  x=>x.parserBuild.parserSourceHashes[SEARCH_PARSER_PATHS[0]]='e'.repeat(64),x=>x.fullApi.cases=14,x=>x.sourceHashes[SEARCH_TEST]='e'.repeat(64)]){
  const broken=clone(e);change(broken);assert.throws(()=>validateSearchRollback(broken,read));
 }
});
test('controlled SEARCH apply binds the complete approved catalog and original15 rows, not only helper hash',()=>{
 const rollback=rollbackGateFixture(),after=clone(rollback.beforeCatalog);after.functions[0].definition='controlled SEARCH candidate';
 rollback.candidateDefinitionHash=sha(after.functions[0].definition);
 after.journal.push({version:'20261006123000',name:'phase5_planning_year_search_details',statements:[migration()]});
 const applied={kind:'phase5-planning-year-search-details-apply',status:'PASS',complete:true,target:'protected',scope:'local-synthetic-only',reset:false,
  migration:SEARCH_MIGRATION,sourceHash:rollback.sourceHash,sourceHashes:rollback.sourceHashes,dependencyHashes:rollback.dependencyHashes,
  workerBuildRevision:rollback.workerBuildRevision,baselineFingerprint:rollback.baselineFingerprint,
  originalDefinitionHash:rollback.originalDefinitionHash,candidateDefinitionHash:rollback.candidateDefinitionHash,
  beforeCatalog:clone(rollback.beforeCatalog),afterCatalog:after,afterFingerprint:searchCatalogFingerprint(after),
  originalHashes:clone(rollback.originalHashes),finalHashes:clone(rollback.originalHashes),beforeAcl:[],afterAcl:[],beforeAudit:anchors(),afterAudit:anchors(),
  beforeWorkerFunctions:[...SEARCH_WORKER_ENTRIES],afterWorkerFunctions:[...SEARCH_WORKER_ENTRIES],changedDefinitions:[SEARCH_ENTRY],unexpectedDifferences:0,
  originalBusinessPreserved:true,originalTimestampsPreserved:true,originalAuditPreserved:true,identityAnchorsPreserved:true,aclUnchanged:true};
 assert.doesNotThrow(()=>validateSearchApplied(applied,rollback,read));
 for(const edit of [x=>x.afterCatalog.tables.push({relation:'other'}),x=>x.afterCatalog.functions[0].owner='other',
  x=>x.finalHashes.offerings.sha256='9'.repeat(64),x=>x.beforeAudit.audit.count++,x=>x.afterWorkerFunctions.pop(),x=>x.afterCatalog.journal[0].statements=['wrong source'],x=>x.complete=false]){
  const broken=clone(applied);edit(broken);assert.throws(()=>validateSearchApplied(broken,rollback,read));
 }
});
test('exact current journal, required named HTTP cases and entire audit anchors have no partial bypass',()=>{
 const sourceFiles=[PLANNING_FOUNDATION,'20261006121000_phase5_worker_planning_year_reads.sql',PERFORMANCE_MIGRATION];
 const cat={functions:SEARCH_PLANNING_ENTRIES.map(signature=>({signature,acl:PLANNING_ENTRIES.includes(signature)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}',securityDefiner:true,volatility:'v'})),
  journal:sourceFiles.map(f=>({version:f.slice(0,14),name:f.slice(15,-4),statements:[read(`supabase/migrations/${f}`).toString()]}))};
 validateSearchJournal(cat,read);const bad=clone(cat);bad.functions[0].signature='public.phase5_planning_year_invented()';assert.throws(()=>validateSearchJournal(bad,read));
 const cases=SEARCH_API_CASES.map(name=>({name,status:'PASS',checks:[{ok:true}]}));assert.equal(searchCasesComplete(cases),true);cases.pop();assert.equal(searchCasesComplete(cases),false);
 assert.equal(searchAnchorsValid(anchors(),anchors()),true);const broken=anchors();broken.audit.sha256='9'.repeat(64);assert.equal(searchAnchorsValid(anchors(),broken),false);
});
