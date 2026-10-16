import test from 'node:test';
import assert from 'node:assert/strict';
import {requireDistributionProof,requireCodePreflight} from './deliver-timplan-distribution.mjs';
import {requirePreviousRuntimeProof} from './deliver-apl-plan.mjs';
const sources={'web/a.ts':'a'.repeat(64)};
function proof(){
 const browser=device=>({visualReview:'reviewed',result:{device,status:'PASS',checks:[{ok:true}],screenshots:[{file:device+'-review.png'}]},screenshotHashes:{[device+'-review.png']:'b'.repeat(64)}});
 const artifact={fileCount:1,sha256:'c'.repeat(64)};
 return {kind:'timplan-distribution-actual-api-browser',status:'PASS',api:{status:'PASS',atomicRollback:true,raceStatuses:[409,200]},checks:[{ok:true}],snapshot:{dataCopied:false,sourceFingerprint:'d'.repeat(64)},baselineFingerprint:'d'.repeat(64),finalFingerprint:'d'.repeat(64),sources,finalSources:sources,migrationSources:{},finalMigrationSources:{},verificationSources:{test:'e'},finalVerificationSources:{test:'e'},runtime:{baseURL:'http://127.0.0.1:3014',artifact},finalArtifact:artifact,build:{mode:'protected'},browserRuns:{retries:0},oidcCleanup:{cleanup:'complete',verifiedCallbacks:4},runtimeCleanup:{cleanup:'complete'},snapshotCleanup:{cleanup:'complete'},browserEvidence:{desktop:browser('desktop'),phone:browser('phone')}};
}
test('code-only proof requires real atomic/CAS evidence and both reviewed devices',()=>requireDistributionProof(proof(),sources));
for(const [name,change] of [
 ['failed actual',r=>r.status='FAIL'],['missing rollback',r=>r.api.atomicRollback=false],['mixed race',r=>r.api.raceStatuses=[200,200]],['failed check',r=>r.checks[0].ok=false],['live row copy',r=>r.snapshot.dataCopied=true],['DDL change',r=>r.finalFingerprint='f'.repeat(64)],['source drift',r=>r.finalSources={}],['migration disguised',r=>r.migrationSources={ddl:'changed'}],['test drift',r=>r.finalVerificationSources={}],['live test port',r=>r.runtime.baseURL='http://127.0.0.1:3012'],['different artifact',r=>r.finalArtifact={fileCount:1,sha256:'f'.repeat(64)}],['retry',r=>r.browserRuns.retries=1],['no OIDC',r=>r.oidcCleanup.verifiedCallbacks=0],['incomplete cleanup',r=>r.snapshotCleanup.cleanup='pending'],['unreviewed phone',r=>r.browserEvidence.phone.visualReview='pending'],['missing screenshot binding',r=>r.browserEvidence.desktop.screenshotHashes={}]
])test(name+' prevents code transfer',()=>{const r=proof();change(r);assert.throws(()=>requireDistributionProof(r,sources));});
test('preflight binds tool and unchanged database/runtime',()=>{
 const r={kind:'code-local-delivery',packageId:'timplan-distribution',mode:'--verify',status:'PASS',databaseClosed:true,toolSha256:'tool',databaseUnchanged:true,runtimeUnchanged:true};requireCodePreflight(r,'tool');
 for(const key of ['kind','packageId','mode','status','databaseClosed','toolSha256','databaseUnchanged','runtimeUnchanged'])assert.throws(()=>requireCodePreflight({...r,[key]:'changed'},'tool'));
});
test('completed code-only delivery is accepted as next predecessor but failure is not',()=>{
 const runtime={listener:{pid:3,ppid:2,started:'time',args:'workerd'},preview:{pid:2,ppid:1,started:'time',args:'preview'},manager:{pid:1,ppid:99,started:'time',args:'manager'}},artifact={sha256:'old'};
 const r={kind:'code-local-delivery',mode:'--apply',status:'PASS',applied:true,afterArtifact:artifact,afterRuntime:runtime};
 requirePreviousRuntimeProof(r,artifact,runtime);assert.throws(()=>requirePreviousRuntimeProof({...r,status:'FAIL'},artifact,runtime));
});
