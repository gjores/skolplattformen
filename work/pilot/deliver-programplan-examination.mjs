#!/usr/bin/env node
// Local tested-artifact transfer. Inert on import. Never roll back to a previous app after examination installation.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrivateEvidence, readPackageEvidence, installedPackage, assertStructureTransition, sha, toolHash, toolSourceHashes, expectedPreviousArtifact } from './apply-programplan-examination.mjs';
import { artifactManifest } from './verify-programplan-copy-api.mjs';
import { assertTarget } from './verify-target.mjs';
import { connect, classCohortTargetIdentity } from './verify-class-cohort.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { reserveDeliveryReport, failureMetadata, health, privateConfiguration, businessHashes, stopRuntime, startRuntime,
 stopOwnStartingManager, inspectDeliveryScope, readOnlyOidc, localRuntime, requirePreviousRuntimeProof, copyArtifact } from './deliver-apl-plan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),destination=path.join(root,'web/dist-protected');
export const deliveryToolHash=()=>sha(JSON.stringify({...toolSourceHashes(),...Object.fromEntries(['work/pilot/deliver-programplan-examination.mjs','work/pilot/deliver-apl-plan.mjs','work/pilot/apply-apl-term-intent.mjs','work/pilot/apply-apl-plan.mjs'].map(file=>[file,sha(readFileSync(path.join(root,file)))]))}));
export function requireProgramplanExaminationInstallation(r,{target,installed}){
 assert.equal(r.kind,'programplan-examination-live-installation');assert.equal(r.mode,'--apply');assert.equal(r.status,'PASS');
 for(const key of ['committed','databaseClosed','structureVerified','candidateTransferRequired','localMigrationFilesSynced'])assert.equal(r[key],true,key);
 assert.equal(r.oldWorkerCompatibleAfterCommit,false);assert.notEqual(r.recoveryRequired,true);assert.equal(r.toolSha256,toolHash());
 assert.deepEqual(r.target,target);assert.deepEqual(r.installed,installed);assert.deepEqual(r.beforeProjection,r.afterProjection);assert.deepEqual(r.beforeJournal,r.afterOriginalJournal);
 assertStructureTransition(r.beforeStructure,r.afterStructure);assert.ok(r.lockHoldMsBeforeCommit>=0&&r.lockHoldMsBeforeCommit<30000);
}
export function requireProgramplanExaminationPreparation(r,expected){
 assert.equal(r.kind,'programplan-examination-local-delivery');assert.equal(r.mode,'--prepare');assert.equal(r.status,'PASS');
 for(const key of ['databaseClosed','databaseUnchanged','runtimeUnchanged'])assert.equal(r[key],true);
 assert.equal(r.toolSha256,deliveryToolHash());
 for(const [key,value] of Object.entries(expected))assert.deepEqual(r[key],value,'Preparation changed: '+key);
}
export function requireProgramplanExaminationPreflight(r){
 assert.equal(r.kind,'programplan-examination-local-delivery');assert.equal(r.mode,'--verify');assert.equal(r.status,'PASS');
 assert.equal(r.databaseClosed,true);assert.equal(r.databaseUnchanged,true);assert.equal(r.runtimeUnchanged,true);assert.equal(r.toolSha256,deliveryToolHash());
}
export function programplanExaminationFailurePolicy(r){
 r.recoveryRequired=r.databasePackageInstalled===true||r.stopAttempted===true;
 r.applicationRollbackRestoresCompatibility=false;r.legacyRollbackAllowed=false;
}
export async function deliverProgramplanExamination(mode,{sqlEvidence,apiEvidence,prepared,evidence,scope,previousRuntime,out}){
 assert.ok(['--prepare','--verify','--apply'].includes(mode));
 const sink=reserveDeliveryReport(out,'programplan-examination-local-delivery',mode),r=sink.report;
 r.toolSha256=deliveryToolHash();r.legacyRollbackAllowed=false;
 let db,locked=false,newRuntime,newManager,stopped=false;
 try{
  const prior=mode==='--apply'?readPrivateEvidence(evidence):null;
  if(prior){requireProgramplanExaminationPreflight(prior.value);r.preflight={path:prior.path,sha256:prior.sha256};evidence=prior.value.installation.path;prepared=prior.value.preparation.path;previousRuntime=prior.value.previousRuntimeEvidence.path;}
  const installation=mode==='--prepare'?null:readPrivateEvidence(evidence);
  if(installation){sqlEvidence=installation.value.sql.path;apiEvidence=installation.value.api.path;r.installation={path:installation.path,sha256:installation.sha256};}
  const proof=readPackageEvidence({sqlEvidence,apiEvidence});r.sql={path:proof.sql.path,sha256:proof.sql.sha256};r.api={path:proof.api.path,sha256:proof.api.sha256};
  r.packages=proof.packages;r.testedBuild={root:proof.buildRoot,revision:proof.api.value.build.revision,artifact:proof.api.value.finalArtifact};
  const target=await assertTarget('protected',{requireIdp:true});db=connect(target);assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true);locked=true;
  r.target=await classCohortTargetIdentity(db,target);r.beforeFingerprint=await schemaFingerprint(db);
  if(installation){
   requireProgramplanExaminationInstallation(installation.value,{target:r.target,installed:await installedPackage(db)});
   assert.deepEqual(installation.value.sql,r.sql);assert.deepEqual(installation.value.api,r.api);assert.deepEqual(installation.value.packages,r.packages);
   assert.deepEqual(installation.value.build,{root:proof.buildRoot,artifact:proof.api.value.finalArtifact});
   assert.equal(r.beforeFingerprint,proof.sql.value.installed.fingerprint);r.databasePackageInstalled=true;
  }else assert.equal(r.beforeFingerprint,proof.sql.value.baseline.fingerprint);
  const scoped=await inspectDeliveryScope(db,target,scope);r.scopePreparation=scoped.proof;
  r.beforeRuntime=localRuntime();r.beforeArtifact=artifactManifest(destination);r.beforeConfiguration=privateConfiguration(target);r.beforeBusiness=await businessHashes(db);
  assert.equal(r.beforeArtifact.sha256,expectedPreviousArtifact,'Previous artifact differs from the verified APL autofill delivery');
  const previous=readPrivateEvidence(previousRuntime);r.previousRuntimeEvidence={path:previous.path,sha256:previous.sha256};
  requirePreviousRuntimeProof(previous.value,r.beforeArtifact,r.beforeRuntime);r.beforeHealth=await health();
  if(installation){
   const preparation=readPrivateEvidence(prepared);r.preparation={path:preparation.path,sha256:preparation.sha256};
   requireProgramplanExaminationPreparation(preparation.value,Object.fromEntries(['target','scopePreparation','beforeRuntime','beforeArtifact','beforeConfiguration','previousRuntimeEvidence','sql','api','packages','testedBuild'].map(key=>[key,r[key]])));
   assert.equal(preparation.value.beforeFingerprint,installation.value.beforeFingerprint);
  }
  if(prior)for(const key of ['installation','preparation','target','scopePreparation','beforeRuntime','beforeArtifact','beforeConfiguration','beforeBusiness','previousRuntimeEvidence','sql','api','packages','testedBuild','beforeFingerprint'])assert.deepEqual(r[key],prior.value[key],'Preflight changed: '+key);
  r.databaseUnchanged=true;r.runtimeUnchanged=true;
  if(mode==='--apply'){
   const transfer=path.join(root,'work/pilot/targets/protected/runtime','programplan-examination-delivery-'+r.runId);mkdirSync(transfer,{mode:0o700});r.transferRoot=transfer;
   const incoming=path.join(transfer,'tested-artifact'),backup=path.join(transfer,'previous-legacy-artifact');r.backup=backup;
   copyArtifact(proof.buildRoot,incoming,proof.api.value.finalArtifact);r.stage='stop_pending';sink.save();
   await stopRuntime(r.beforeRuntime,()=>{r.stopAttempted=true;sink.save();});stopped=true;
   renameSync(destination,backup);renameSync(incoming,destination);r.runtimeUnchanged=false;r.stage='start_pending';sink.save();
   newRuntime=await startRuntime(path.join(path.dirname(out),r.runId+'-preview.log'),manager=>{newManager=manager;r.newManager=manager;sink.save();});r.afterRuntime=newRuntime;
   assert.deepEqual(artifactManifest(destination),proof.api.value.finalArtifact);assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);
   r.stage='readonly_oidc_pending';sink.save();const evidenceDir=path.join(path.dirname(out),r.runId+'-readonly');mkdirSync(evidenceDir,{mode:0o700});
   r.readOnlyOidc=await readOnlyOidc({db,target,baseURL:'http://127.0.0.1:3012',scope:scoped.scope,evidenceDir,aplWorkflow:'separate_apl_v1'});
   r.afterArtifact=artifactManifest(destination);assert.deepEqual(r.afterArtifact,proof.api.value.finalArtifact);r.afterHealth=await health();r.candidateCompatible=true;
  }
  r.afterFingerprint=await schemaFingerprint(db);assert.equal(r.afterFingerprint,r.beforeFingerprint);r.afterBusiness=await businessHashes(db);assert.deepEqual(r.afterBusiness,r.beforeBusiness);
  assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);assert.equal(deliveryToolHash(),r.toolSha256);readPackageEvidence({sqlEvidence,apiEvidence});
  r.applied=mode==='--apply';r.status='PASS';r.stage='completed';r.recoveryRequired=false;delete r.failureCode;
 }catch(error){
  r.failure=failureMetadata(error);r.failedStage=r.stage;programplanExaminationFailurePolicy(r);
  if(error.proofPath)r.readOnlyOidc={status:'FAIL',proofPath:error.proofPath,proofSha256:error.proofSha256};
  // Fail closed: preserve the candidate and backup. Never restart the old app against a examination-capable schema.
  if(stopped)try{if(newRuntime)await stopRuntime(newRuntime);else if(newManager)await stopOwnStartingManager(newManager);r.failedRuntimeQuiesced=true;}catch(cleanup){r.runtimeCleanupFailure=failureMetadata(cleanup);}
 }finally{
  if(db)try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch(error){r.status='FAIL';r.databaseClosed=false;r.failure=failureMetadata(error);programplanExaminationFailurePolicy(r);}
  r.finishedAt=new Date().toISOString();sink.save();
 }
 console.log(`${r.status}: local programplan examination ${mode}; applied=${r.applied===true}`);return r;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [mode,...args]=process.argv.slice(2),options={},keys={'--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--prepared':'prepared','--evidence':'evidence','--scope':'scope','--previous-runtime':'previousRuntime','--out':'out'};
  for(let i=0;i<args.length;i+=2){assert.ok(keys[args[i]]&&args[i+1]&&!options[keys[args[i]]]);options[keys[args[i]]]=path.resolve(args[i+1]);}
  assert.ok(options.out&&options.scope);if(mode==='--prepare')assert.ok(options.previousRuntime&&options.sqlEvidence&&options.apiEvidence);else assert.ok(options.evidence);
  const r=await deliverProgramplanExamination(mode,options);if(r.status!=='PASS')process.exitCode=1;
 }catch{console.error('FAIL: programplan examination delivery preflight');process.exitCode=1;}
}
