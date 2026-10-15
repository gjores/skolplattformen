#!/usr/bin/env node
// Reviewed continuation after an assertion-only alias defect. The original FAIL
// remains immutable; inherited full-matrix checks are always labelled as such.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {approvedClassFixture,appliedDefinitions} from './verify-class-timplans.mjs';
import {root,hash,reserveReport,readEvidence,classCohortSourceHashes,classCohortTargetIdentity,classCohortInstalledState,connect,catalogColumns,projectionHashes,keyInventory,lockPublicTables,physicalConcurrency,cleanupFixture} from './verify-class-cohort.mjs';
const runner='work/pilot/verify-class-cohort.mjs';
const suiteCounts={dates:124,linkIdentity:68,commands:183,contract:3,oldClassTimplans:58};
const ident=value=>'"'+value.replaceAll('"','""')+'"';
const difference=(after,before)=>Object.fromEntries(Object.entries(after).map(([table,list])=>{const prior=new Set((before[table]??[]).map(k=>JSON.stringify(k)));return[table,list.filter(k=>!prior.has(JSON.stringify(k)))];}));
// A complete byte comparison proves the old matrix/fixture/cleanup/lock code is
// unchanged. Only this reviewed alias, two exports, closure and provenance hook
// may differ; any other edit invalidates the inherited checks.
export function reviewedRunner(old){
 const edits=[
  ["'work/pilot/apply-class-cohort.mjs']);","'work/pilot/apply-class-cohort.mjs','work/pilot/resume-class-cohort-concurrency.mjs']);"],
  ['async function physicalConcurrency(db,target,f,ledger){','export async function physicalConcurrency(db,target,f,ledger){'],
  ['async function cleanupFixture(db,manifest,ledger){','export async function cleanupFixture(db,manifest,ledger){'],
  [') batchAudits`',') "batchAudits"`'],
  [' const sources=classCohortSourceHashes();assert.deepEqual(r.sqlSourceHashes,sources);'," if(r.composition)await (await import('./resume-class-cohort-concurrency.mjs')).validateComposition(r);\n const sources=classCohortSourceHashes();assert.deepEqual(r.sqlSourceHashes,sources);"],
 ];
 for(const [from,to]of edits){assert.equal(old.split(from).length,2,'Reviewed source edit must be unique');old=old.replace(from,to);}return old;
}
const priorAuditLimitation='The prior run retained exactly 92 own audit PKs and excluded them from deletion. Its unordered parallel row hash is not treated as a new value comparison. A canonical current baseline is compared before and after this continuation.';
const canonicalRows=rows=>hash([...rows].sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;}));
function inheritedEvidence(path,frozenRunner){
 assert.ok(resolve(path).startsWith('/private/tmp/')&&resolve(frozenRunner).startsWith('/private/tmp/'));
 const evidence=readEvidence(path),p=evidence.value,old=readFileSync(frozenRunner,'utf8'),current=readFileSync(resolve(root,runner),'utf8'),sources=classCohortSourceHashes();
 assert.equal(p.kind,'class-cohort-sql-evidence');assert.equal(p.mode,'applied');assert.equal(p.status,'FAIL');assert.equal(p.failure?.code,'ERR_ASSERTION');
 assert.ok(p.failure.message.includes('-   batchAudits: 1')&&p.failure.message.includes('+   batchaudits: 1'),'Only the recorded alias assertion is resumable');
 assert.equal(p.databaseClosed,true);assert.equal(p.cleanup.status,'complete');for(const k of ['ownBusinessRowsRemaining','ownSessionsRemaining','foreignReferences'])assert.equal(p.cleanup[k],0);
 assert.equal(p.preservation.originalRowsUnchanged,true);assert.deepEqual(p.preservation.baselineProjectionHashes,p.preservation.finalOriginalProjectionHashes);
 for(const [name,count]of Object.entries(suiteCounts)){assert.equal(p.suites[name].status,'PASS');assert.equal(p.suites[name].skipped,0);assert.equal(p.suites[name].checks.length,count);assert.ok(p.suites[name].checks.every(c=>c.ok===true));}
 assert.equal(hash(old),p.sqlSourceHashes[runner]);assert.equal(current,reviewedRunner(old),'Unreviewed runner change invalidates inherited matrix');
 const priorSources={...sources};delete priorSources['work/pilot/resume-class-cohort-concurrency.mjs'];priorSources[runner]=hash(old);assert.deepEqual(priorSources,p.sqlSourceHashes,'Product, SQL tests, fixtures and other sources must be unchanged');
 return{evidence,p,sources,composition:{kind:'full-matrix-plus-concurrency',priorOwnAuditValueComparison:'not-established-against-old-unordered-hash',priorOwnAuditLimitation:priorAuditLimitation,matrixExecutedInThisRun:false,inheritedStatus:'FAIL',inheritedMatrixStatus:'PASS',matrixEvidence:{path:resolve(path),sha256:evidence.sha256},frozenRunner:{path:resolve(frozenRunner),sha256:hash(old)},reviewedRunnerSha256:hash(current),matrixSourceHashes:p.sqlSourceHashes}};
}
export async function validateComposition(report){
 const c=report.composition;assert.equal(c?.kind,'full-matrix-plus-concurrency');assert.equal(c.matrixExecutedInThisRun,false);
 const checked=inheritedEvidence(c.matrixEvidence.path,c.frozenRunner.path);assert.deepEqual(c,checked.composition);
 for(const name of Object.keys(suiteCounts))assert.deepEqual(report.suites[name],{...checked.p.suites[name],inherited:true,origin:{path:c.matrixEvidence.path,sha256:c.matrixEvidence.sha256,runnerSha256:c.frozenRunner.sha256}});
 assert.deepEqual(report.sqlSourceHashes,checked.sources);
 assert.equal(report.priorCleanupAssessment.audit.count,92);assert.equal(report.priorCleanupAssessment.audit.exactKeysMatch,true);assert.equal(report.priorCleanupAssessment.audit.oldValueHashCompared,false);assert.equal(report.priorCleanupAssessment.identities.oldValueHashMatches,true);
 assert.equal(report.priorCleanupAssessment.audit.canonicalAfterSha256,report.priorCleanupAssessment.audit.canonicalBeforeSha256);
}
async function confirmPriorCleanup(db,p){
 const priorManifest=readEvidence(p.fixtureEvidence.path);assert.equal(priorManifest.sha256,p.fixtureEvidence.sha256);
 const own=difference(await keyInventory(db),priorManifest.value.originalKeys),assessment={};
 for(const [table,list]of Object.entries(own)){
  const proof=p.cleanup.preservedAuditAndAnchorHashes[table];if(!proof){assert.equal(list.length,0,'Unexpected row after previous cleanup');continue;}
  assert.equal(list.length,proof.count);assert.equal(hash(list),proof.keysSha256);
  assert.ok(table==='identities'||table==='security_events');
  const rows=(await db.unsafe(`select to_jsonb(t) r from public.${ident(table)} t where id=any($1::${table==='identities'?'uuid':'bigint'}[])`,[list.map(k=>k.id)])).map(r=>r.r);assert.equal(rows.length,list.length);
  if(table==='identities'){const ordered=[...rows].sort((a,b)=>a.id<b.id?-1:1);assert.ok(hash(ordered)===proof.rowsSha256||hash([...ordered].reverse())===proof.rowsSha256,'Previous identity anchor values changed');assessment.identities={count:list.length,exactKeysMatch:true,oldValueHashMatches:true,previousRowsSha256:proof.rowsSha256};}
  else{assert.equal(list.length,92);assessment.audit={count:list.length,keys:list,exactKeysMatch:true,keysSha256:hash(list),oldValueHashCompared:false,previousUnorderedRowsSha256:proof.rowsSha256,limitation:priorAuditLimitation,canonicalBeforeSha256:canonicalRows(rows)};}
 }
 assert.deepEqual(await projectionHashes(db,priorManifest.value.originalColumns,own),priorManifest.value.originalProjectionHashes);assessment.originalProjectionMatches=true;return assessment;
}
export async function resumeConcurrency({evidence,frozenRunner,out,verifyOnly=false}){
 const sink=reserveReport(out,'class-cohort-sql-evidence',verifyOnly?'resume-preflight':'applied'),r=sink.report;let db,locked=false,complete=false;
 try{
  const inherited=inheritedEvidence(evidence,frozenRunner),p=inherited.p;r.composition=inherited.composition;r.sqlSourceHashes=inherited.sources;
  r.suites=Object.fromEntries(Object.entries(p.suites).map(([name,s])=>[name,{...s,inherited:true,origin:{path:r.composition.matrixEvidence.path,sha256:r.composition.matrixEvidence.sha256,runnerSha256:r.composition.frozenRunner.sha256}}]));
  r.evidenceChain={previousApplied:r.composition.matrixEvidence,...p.evidenceChain};
  const target=await assertTarget('protected');db=connect(target);r.defaultIsolation=(await db`show default_transaction_isolation`)[0].default_transaction_isolation;assert.equal(r.defaultIsolation,'read committed');r.targetIdentity=await classCohortTargetIdentity(db,target);assert.deepEqual(r.targetIdentity,p.targetIdentity);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true);locked=true;r.installed=await classCohortInstalledState(db);assert.deepEqual(r.installed,p.installed);await appliedDefinitions(db);r.priorCleanupAssessment=await confirmPriorCleanup(db,p);
  r.beforeHashes=await allPublicHashes(db);r.beforeFingerprint=r.installed.schemaFingerprint;r.priorCleanupReverified=true;r.stage='preflight';sink.save();
  if(!verifyOnly){
   const manifest={originalColumns:await catalogColumns(db),originalKeys:await keyInventory(db)};manifest.originalProjectionHashes=await projectionHashes(db,manifest.originalColumns);
   await db.begin(async tx=>{await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='90s'`;await lockPublicTables(tx);assert.deepEqual(await allPublicHashes(tx),r.beforeHashes);assert.deepEqual(await keyInventory(tx),manifest.originalKeys);
    const f=await approvedClassFixture(tx,'SA25');manifest.fixture={prefix:f.id(1).slice(0,8),roles:f.roles,context:{programId:f.programId,offeringId:f.id(46),year:f.year,unitId:f.id(30),customerId:f.id(1),organizerId:f.id(2),sessionId:f.id(81)}};
    manifest.ownedKeys=difference(await keyInventory(tx),manifest.originalKeys);r.modernFixtureManifest=manifest;r.stage='modern_fixture_commit_pending';sink.save();
   });r.modernFixtureCommitted=true;
   r.ownedMutationLedger={keys:structuredClone(manifest.ownedKeys),operations:[]};const ledger={...r.ownedMutationLedger,save:()=>sink.save()};r.stage='physical_concurrency';sink.save();
   try{r.concurrency=await physicalConcurrency(db,target,manifest.fixture,ledger);}finally{r.stage='owned_cleanup';sink.save();Object.assign(r,await cleanupFixture(db,manifest,ledger));}
   assert.deepEqual(await classCohortInstalledState(db),r.installed);r.originalMatrixPreservation=p.preservation;
  }else{assert.deepEqual(await allPublicHashes(db),r.beforeHashes);r.readOnly=true;r.committed=false;}
  const priorAuditRows=(await db`select to_jsonb(t) r from public.security_events t where id=any(${r.priorCleanupAssessment.audit.keys.map(k=>k.id)}::bigint[])`).map(r=>r.r);assert.equal(priorAuditRows.length,92);r.priorCleanupAssessment.audit.canonicalAfterSha256=canonicalRows(priorAuditRows);assert.equal(r.priorCleanupAssessment.audit.canonicalAfterSha256,r.priorCleanupAssessment.audit.canonicalBeforeSha256);
  r.finalSqlSourceHashes=classCohortSourceHashes();assert.deepEqual(r.finalSqlSourceHashes,r.sqlSourceHashes);await validateComposition(r);complete=true;
 }catch(e){r.failure={code:e.code??'resume_failed',message:e.message,where:e.where,hint:e.hint};}
 finally{if(db)try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{complete=false;r.closeFailure=true;}
  r.status=complete?'PASS':'FAIL';r.stage='finished';r.finishedAt=new Date().toISOString();if(complete)delete r.failureCode;sink.close();}
 console.log(`${r.status}: class cohort ${verifyOnly?'read-only resume preflight':'concurrency continuation'}; inheritedMatrix=true; databaseClosed=${r.databaseClosed===true}`);return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),verifyOnly=args[0]==='--verify';if(verifyOnly)args.shift();const opts={};for(let i=0;i<args.length;i+=2){assert.ok(['--evidence','--frozen-runner','--out'].includes(args[i])&&args[i+1]&&!opts[args[i]]);opts[args[i]]=resolve(args[i+1]);}assert.ok(opts['--evidence']&&opts['--frozen-runner']&&opts['--out']);const r=await resumeConcurrency({evidence:opts['--evidence'],frozenRunner:opts['--frozen-runner'],out:opts['--out'],verifyOnly});if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: class cohort concurrency preflight');process.exitCode=1;}
}
