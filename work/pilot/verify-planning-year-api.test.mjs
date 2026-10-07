import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanningApiArgs,planningApiCasesStatus,withPlanningAclRestore,validatePreflight,planningAuditPair,planningSelection,planningCleanupPreserved,planningSafeFailure,planningCleanupDiagnostics,
 PLANNING_API_CASES,PLANNING_API_SOURCE_PATHS} from './verify-planning-year-api.mjs';
import {PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,sha} from './apply-planning-year-migration.mjs';
const cases=()=>PLANNING_API_CASES.map(name=>({name,status:'PASS',checks:[{ok:true}]}));
test('actual API runner rejects remote targets resets unsafe paths duplicate or missing arguments',()=>{
 const args=['--target','protected','--base-url','http://127.0.0.1:3060','--out','/private/tmp/planning-proof.json','--preflight'];
 assert.equal(parsePlanningApiArgs(args).preflight,true);
 for(const rejected of [[],args.concat('--reset'),args.concat('--preflight'),args.concat('--target','protected'),args.slice(0,-2).concat('--out'),
  args.map(v=>v==='protected'?'baseline':v),args.map(v=>v==='http://127.0.0.1:3060'?'https://remote.test':v),
  args.map(v=>v==='http://127.0.0.1:3060'?'http://127.0.0.1:301':v),args.map(v=>v==='/private/tmp/planning-proof.json'?'/Users/test/proof.json':v)])assert.throws(()=>parsePlanningApiArgs(rejected));
});
test('PASS requires all uniquely named actual cases and nonempty successful checks',()=>{
 assert.equal(planningApiCasesStatus(cases()),'PASS');
 for(const mutate of [c=>c.pop(),c=>c.push(c[0]),c=>c[0].checks=[],c=>c[0].checks[0].ok=false,c=>c[0].status='PARTIAL',c=>c[0].name=c[1].name]){
  const c=cases();mutate(c);assert.equal(planningApiCasesStatus(c),'FAIL');
 }
});
test('raw ACL finally restoration runs after partial grant failure and Worker failure',async()=>{
 for(const stage of ['grant','run']){
  const sequence=[],original=[{f:PLANNING_ENTRIES[0],acl:'{postgres=X/postgres}',granted:false}];
  await assert.rejects(withPlanningAclRestore(original,async()=>{sequence.push('grant');if(stage==='grant')throw Error('grant failed');},
   async before=>{sequence.push('restore');assert.equal(before,original);},async()=>{sequence.push('verify');return true;},async()=>{sequence.push('run');throw Error('failed');}));
  assert.deepEqual(sequence,stage==='grant'?['grant','restore','verify']:['grant','run','restore','verify']);
 }
 await assert.rejects(withPlanningAclRestore([],async()=>{},async()=>{},async()=>false,async()=>{}),/planning_acl_restore_failed/u);
});
function evidence(){
 const hashes=Object.fromEntries(PLANNING_TABLES.map(t=>[t,{count:0,sha256:'a'.repeat(64)}]));
 const acl=[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES].map(f=>({f,granted:PLANNING_BASE_ENTRIES.includes(f),acl:'{postgres=X/postgres}'}));
 return {kind:'phase5-planning-year-api',status:'PASS',target:'protected',scope:'local-synthetic-only',preflight:true,complete:true,reset:false,
  preflightAclRestored:true,aclUnchanged:true,functionsAndJournalPreserved:true,cleanupStatus:'PASS',originalBusinessPreserved:true,originalTimestampsPreserved:true,
  originalAuditPreserved:true,identityAnchorsPreserved:true,beforeWorkerFunctions:PLANNING_BASE_ENTRIES,restoredWorkerFunctions:PLANNING_BASE_ENTRIES,
  verifiedWorkerFunctions:[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES],cases:cases(),beforeAcl:acl,afterAcl:structuredClone(acl),sourceCommit:'a'.repeat(40),
  workerBuildRevision:'b'.repeat(40),baselineFingerprint:'a'.repeat(64),finalFingerprint:'a'.repeat(64),originalHashes:hashes,finalHashes:structuredClone(hashes),
  cleanup:{originalBusinessUnchanged:true,originalAuditPreserved:true,identityAnchorsPreserved:true,retainedAuditPreserved:true,retainedIdentityAnchorsPreserved:true,
   beforeRetainedAudit:{count:10,sha256:'c'.repeat(64)},afterRetainedAudit:{count:10,sha256:'c'.repeat(64)},
   beforeRetainedAnchors:{count:2,sha256:'d'.repeat(64)},afterRetainedAnchors:{count:2,sha256:'d'.repeat(64)},
   customers:0,sessions:0,plans:0,receipts:0,educationEvents:0,offerings:0,mandates:0,mintedSessions:0,triggers:0,functions:0,
   offeringUnits:0,unitPackages:0,libraryVersions:0,gymReceipts:0,timplans:0,classLinks:0,
   foreignRemaining:{offerings:0,offeringUnits:0,sessions:0},foreignRetainedAuditAnchors:{events:2,anchoredEvents:2}},sourceHashes:Object.fromEntries(PLANNING_API_SOURCE_PATHS.map(p=>[p,sha('source')]))};
}
test('permanent grant gate rejects partial proof changed source raw ACL and original data',()=>{
 assert.doesNotThrow(()=>validatePreflight(evidence(),()=>Buffer.from('source')));
 for(const mutate of [e=>e.preflight=false,e=>e.complete=false,e=>e.originalAuditPreserved=false,e=>e.identityAnchorsPreserved=false,
  e=>e.beforeWorkerFunctions=[...PLANNING_BASE_ENTRIES,PLANNING_ENTRIES[0]],e=>e.afterAcl[0].acl='changed',e=>e.finalFingerprint='b'.repeat(64),
  e=>e.cleanup.afterRetainedAudit.count++,e=>e.cleanup.retainedIdentityAnchorsPreserved=false,e=>delete e.cleanup.beforeRetainedAnchors,e=>e.cleanup.foreignRemaining.sessions=1,
  e=>e.finalHashes.point_plans.count++,e=>delete e.sourceHashes[PLANNING_API_SOURCE_PATHS[0]],e=>e.cases.pop()]){
  const e=evidence();mutate(e);assert.throws(()=>validatePreflight(e,()=>Buffer.from('source')));
 }
 assert.throws(()=>validatePreflight(evidence(),()=>Buffer.from('changed')));
});
test('every successful planning response requires its exact transaction actor audit pairs',()=>{
 const session={identityId:'i',membershipId:'m',assignmentId:'a',id:'s'};
 const make=action=>['db','worker'].map(source=>({source,action,outcome:'ok',actor_identity_id:'i',membership_id:'m',assignment_id:'a',session_id:'s',customer_id:'c',object_type:'planning_year_collection',object_id:null}));
 const selection=make('planning_year_selection_read'),list=[...selection,...make('planning_year_list_read')];
 assert.equal(planningAuditPair(selection,session,'c','urval'),true);assert.equal(planningAuditPair(list,session,'c','lista'),true);
 for(const bad of [list.slice(1),list.concat(list[0]),list.map((e,i)=>i===0?{...e,customer_id:'foreign'}:e),list.map((e,i)=>i===0?{...e,outcome:'denied'}:e)])assert.equal(planningAuditPair(bad,session,'c','lista'),false);
 assert.equal(planningAuditPair(selection,session,'c','lista'),false);
 assert.equal(planningSelection(2027,{page:2}).schoolYear,2027);
});

test('cleanup PASS requires new append-only audit and actor anchor hashes plus no remaining owned business',()=>{
 const good=evidence().cleanup;assert.equal(planningCleanupPreserved(good),true);
 for(const mutate of [c=>c.retainedAuditPreserved=false,c=>c.afterRetainedAudit.sha256='e'.repeat(64),c=>c.afterRetainedAnchors.count++,
  c=>c.timplans=1,c=>delete c.foreignRemaining,c=>c.foreignRetainedAuditAnchors.anchoredEvents=1]){
  const c=structuredClone(good);mutate(c);assert.equal(planningCleanupPreserved(c),false);
 }
});
test('controlled cleanup failure metadata excludes arbitrary SQL payload and recognizes timeouts',()=>{
 assert.deepEqual(planningSafeFailure(new Error('planning_fixture_preservation_failed')),{code:'TEST_FAILED',reason:'planning_fixture_preservation_failed'});
 assert.deepEqual(planningSafeFailure({name:'TimeoutError',code:23,message:'arbitrary secret'}),{code:'REQUEST_TIMEOUT',reason:null});
 assert.deepEqual(planningSafeFailure({code:'23503',message:'customer data in SQL error'}),{code:'23503',reason:null});
 assert.deepEqual(planningSafeFailure({code:'secret content',message:'raw query and data'}),{code:'TEST_FAILED',reason:null});
});

test('failed cleanup diagnostics allow only aggregate counts hashes and controlled booleans',()=>{
 assert.deepEqual(planningCleanupDiagnostics({originalAuditPreserved:true,foreignRemaining:{offerings:0,offeringUnits:0,sessions:0,raw:'secret'},
  beforeRetainedAudit:{count:10,sha256:'a'.repeat(64),rows:['secret']},row:'secret',token:'secret'}),
  {originalAuditPreserved:true,beforeRetainedAudit:{count:10,sha256:'a'.repeat(64)},foreignRemaining:{offerings:0,offeringUnits:0,sessions:0}});
 assert.deepEqual(planningCleanupDiagnostics({beforeRetainedAudit:{count:10,sha256:'secret SQL'},foreignRetainedAuditAnchors:{events:'secret',anchoredEvents:0}}),{});
});
