#!/usr/bin/env node
// Code-only local transfer. No migration or fabricated installation proof.
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPrivateEvidence,productSources,sha} from './apply-apl-plan.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {assertTarget} from './verify-target.mjs';
import {connect,classCohortTargetIdentity} from './verify-class-cohort.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {reserveDeliveryReport,failureMetadata,health,privateConfiguration,businessHashes,stopRuntime,startRuntime,
 stopOwnStartingManager,inspectDeliveryScope,readOnlyOidc,localRuntime,requirePreviousRuntimeProof,copyArtifact} from './deliver-apl-plan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),destination=path.join(root,'web/dist-protected');
const sourceHash=()=>sha([readFileSync(fileURLToPath(import.meta.url),'utf8'),readFileSync(path.join(root,'work/pilot/deliver-apl-plan.mjs'),'utf8')].join('\n'));
const packages = {'timplan-distribution': requireDistributionProof, 'apl-guide-dates': requireGuideDatesProof};
function requireBrowserProof(r,sources){
 assert.equal(r.status,'PASS');assert.ok(r.checks.length>0&&r.checks.every(c=>c.ok));
 assert.equal(r.snapshot.dataCopied,false);assert.equal(r.baselineFingerprint,r.snapshot.sourceFingerprint);assert.equal(r.finalFingerprint,r.baselineFingerprint);assert.match(r.finalFingerprint,/^[a-f0-9]{64}$/u);
 assert.deepEqual(r.sources,sources);assert.deepEqual(r.finalSources,sources);assert.deepEqual(r.migrationSources,{});assert.deepEqual(r.finalMigrationSources,{});
 assert.deepEqual(r.finalVerificationSources,r.verificationSources);assert.ok(Object.keys(r.verificationSources).length>0);
 assert.equal(r.runtime.baseURL,'http://127.0.0.1:3014');assert.equal(r.build.mode,'protected');assert.ok(r.finalArtifact.fileCount>0);assert.deepEqual(r.finalArtifact,r.runtime.artifact);
 assert.equal(r.browserRuns.retries,0);assert.equal(r.oidcCleanup.cleanup,'complete');assert.ok(r.oidcCleanup.verifiedCallbacks>0);
 assert.equal(r.runtimeCleanup.cleanup,'complete');assert.equal(r.snapshotCleanup.cleanup,'complete');
 for(const device of ['desktop','phone']){const b=r.browserEvidence[device];assert.equal(b.visualReview,'reviewed');assert.equal(b.result.status,'PASS');assert.equal(b.result.device,device);assert.ok(b.result.checks.length>0&&b.result.checks.every(c=>c.ok)&&b.result.screenshots.length>0);assert.deepEqual(Object.keys(b.screenshotHashes).sort(),b.result.screenshots.map(s=>s.file).sort());}
 return true;
}
export function requireDistributionProof(r,sources){
 assert.equal(r.kind,'timplan-distribution-actual-api-browser');requireBrowserProof(r,sources);
 assert.equal(r.api.status,'PASS');assert.equal(r.api.atomicRollback,true);assert.deepEqual([...r.api.raceStatuses].sort(),[200,409]);return true;
}
export function requireGuideDatesProof(r,sources){
 assert.equal(r.kind,'apl-guide-dates-actual-browser');requireBrowserProof(r,sources);
 for(const device of ['desktop','phone']){const b=r.browserEvidence[device].result;assert.ok(b.checks.length>=3);assert.deepEqual(b.features,{guide:true,calendar:true,aplSaveReload:true});}return true;
}
function readProof(file,packageId){
 const evidence=readPrivateEvidence(file),r=evidence.value;packages[packageId](r,productSources());
 for(const [f,h]of Object.entries(r.verificationSources)){assert.ok(!path.isAbsolute(f)&&!f.split('/').includes('..'));assert.equal(sha(readFileSync(path.join(root,f))),h);}
 for(const device of ['desktop','phone']){const b=r.browserEvidence[device],side=readPrivateEvidence(b.path);assert.equal(side.sha256,b.sha256);assert.deepEqual(side.value,b.result);
  for(const shot of b.result.screenshots){assert.match(shot.file,new RegExp('^'+device+'-[a-z0-9-]+\\.png$','u'));assert.equal(sha(readFileSync(path.join(path.dirname(side.path),shot.file))),b.screenshotHashes[shot.file]);}}
 const build=realpathSync(r.runtime.buildRoot);assert.ok(build.startsWith(path.join(root,'work/pilot/targets/protected/runtime/')));assert.deepEqual(artifactManifest(build),r.finalArtifact);
 assert.deepEqual(JSON.parse(readFileSync(path.join(build,'build-mode.json'),'utf8')),r.build);return{...evidence,build};
}
export function requireCodePreflight(r,toolHash,packageId='timplan-distribution'){assert.ok(Object.hasOwn(packages,packageId));assert.equal(r.kind,'code-local-delivery');assert.equal(r.packageId,packageId);assert.equal(r.mode,'--verify');assert.equal(r.status,'PASS');assert.equal(r.databaseClosed,true);assert.equal(r.toolSha256,toolHash);assert.equal(r.databaseUnchanged,true);assert.equal(r.runtimeUnchanged,true);}
export async function deliverDistribution(mode,{actual,previousRuntime,scope,evidence,out,packageId='timplan-distribution'}){
 assert.ok(['--verify','--apply'].includes(mode));assert.ok(Object.hasOwn(packages,packageId));const sink=reserveDeliveryReport(out,'code-local-delivery',mode),r=sink.report;r.packageId=packageId;r.toolSha256=sourceHash();
 let db,locked=false,stopped=false,stopAttempted=false,moved=false,swapped=false,newRuntime,newManager,backup,transferRoot;
 try{
  const prior=mode==='--apply'?readPrivateEvidence(evidence):null;if(prior){requireCodePreflight(prior.value,r.toolSha256,packageId);actual=prior.value.actual.path;previousRuntime=prior.value.previousRuntimeEvidence.path;r.preflight={path:prior.path,sha256:prior.sha256};}
  const proof=readProof(actual,packageId);r.actual={path:proof.path,sha256:proof.sha256};r.testedBuild={root:proof.build,revision:proof.value.build.revision,artifact:proof.value.finalArtifact};
  const target=await assertTarget('protected',{requireIdp:true});db=connect(target);assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true);locked=true;
  r.target=await classCohortTargetIdentity(db,target);r.beforeFingerprint=await schemaFingerprint(db);assert.equal(r.beforeFingerprint,proof.value.baselineFingerprint);
  const scoped=await inspectDeliveryScope(db,target,scope);r.scopePreparation=scoped.proof;
  r.beforeRuntime=localRuntime();r.beforeArtifact=artifactManifest(destination);r.beforeConfiguration=privateConfiguration(target);r.beforeBusiness=await businessHashes(db);
  const previous=readPrivateEvidence(previousRuntime);r.previousRuntimeEvidence={path:previous.path,sha256:previous.sha256};requirePreviousRuntimeProof(previous.value,r.beforeArtifact,r.beforeRuntime);
  r.beforeHealth=await health();
  if(prior)for(const key of ['actual','testedBuild','target','beforeFingerprint','scopePreparation','beforeRuntime','beforeArtifact','beforeConfiguration','beforeBusiness','previousRuntimeEvidence'])assert.deepEqual(r[key],prior.value[key],'Preflight changed: '+key);
  r.databaseUnchanged=true;r.runtimeUnchanged=true;
  if(mode==='--apply'){
   transferRoot=path.join(root,'work/pilot/targets/protected/runtime',packageId+'-delivery-'+r.runId);mkdirSync(transferRoot,{mode:0o700});r.transferRoot=transferRoot;
   const incoming=path.join(transferRoot,'tested-artifact');backup=path.join(transferRoot,'previous-artifact');r.backup=backup;copyArtifact(proof.build,incoming,proof.value.finalArtifact);
   r.stage='stop_pending';sink.save();await stopRuntime(r.beforeRuntime,()=>{stopAttempted=true;r.stopAttempted=true;sink.save();});stopped=true;
   renameSync(destination,backup);moved=true;renameSync(incoming,destination);swapped=true;r.runtimeUnchanged=false;r.stage='start_pending';sink.save();
   newRuntime=await startRuntime(path.join(path.dirname(out),r.runId+'-preview.log'),manager=>{newManager=manager;r.newManager=manager;sink.save();});r.afterRuntime=newRuntime;
   assert.deepEqual(artifactManifest(destination),proof.value.finalArtifact);assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);
   r.stage='readonly_oidc_pending';sink.save();const evidenceDir=path.join(path.dirname(out),r.runId+'-readonly');mkdirSync(evidenceDir,{mode:0o700});
   r.readOnlyOidc=await readOnlyOidc({db,target,baseURL:'http://127.0.0.1:3012',scope:scoped.scope,evidenceDir});
   r.afterArtifact=artifactManifest(destination);assert.deepEqual(r.afterArtifact,proof.value.finalArtifact);r.afterHealth=await health();
  }
  r.afterFingerprint=await schemaFingerprint(db);assert.equal(r.afterFingerprint,r.beforeFingerprint);r.afterBusiness=await businessHashes(db);assert.deepEqual(r.afterBusiness,r.beforeBusiness);
  assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);assert.equal(sourceHash(),r.toolSha256);readProof(actual,packageId);
  r.applied=mode==='--apply';r.stage='completed';r.status='PASS';r.recoveryRequired=false;delete r.failureCode;
 }catch(error){
  r.failure=failureMetadata(error);r.failedStage=r.stage;r.recoveryRequired=stopAttempted;
  if(error.proofPath)r.readOnlyOidc={status:'FAIL',proofPath:error.proofPath,proofSha256:error.proofSha256};
  if(stopped)try{
   if(newRuntime)await stopRuntime(newRuntime);else if(newManager)await stopOwnStartingManager(newManager);
   if(swapped)renameSync(destination,path.join(transferRoot,'failed-artifact'));if(moved)renameSync(backup,destination);
   assert.deepEqual(artifactManifest(destination),r.beforeArtifact);r.restoredRuntime=await startRuntime(path.join(path.dirname(out),r.runId+'-restored.log'));r.runtimeRestored=true;
   r.recoveryRequired=error.proofPath!==undefined; // Failed own-session cleanup still needs review; do not hide it behind process rollback.
  }catch(recovery){r.recoveryFailure=failureMetadata(recovery);r.recoveryRequired=true;}
 }finally{
  if(db)try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch(error){r.databaseClosed=false;r.status='FAIL';r.failure=failureMetadata(error);}
  r.finishedAt=new Date().toISOString();sink.save();
 }
 console.log(`${r.status}: code-only ${packageId} delivery ${mode}; applied=${r.applied===true}`);return r;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2),options={},names={'--actual':'actual','--previous-runtime':'previousRuntime','--scope':'scope','--evidence':'evidence','--out':'out','--package':'packageId'};
 for(let i=0;i<args.length;i+=2){assert.ok(names[args[i]]&&args[i+1]);assert.ok(!options[names[args[i]]]);options[names[args[i]]]=args[i]==='--package'?args[i+1]:path.resolve(args[i+1]);}
 const r=await deliverDistribution(mode,options);if(r.status!=='PASS')process.exitCode=1;
}
