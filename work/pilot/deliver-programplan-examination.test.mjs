import test from 'node:test';
import assert from 'node:assert/strict';
import { programplanExaminationFailurePolicy, requireProgramplanExaminationInstallation, requireProgramplanExaminationPreflight, requireProgramplanExaminationPreparation, deliveryToolHash } from './deliver-programplan-examination.mjs';
import {allowedFunctions,addedFunctions,toolHash} from './apply-programplan-examination.mjs';
const preflight=()=>({kind:'programplan-examination-local-delivery',mode:'--verify',status:'PASS',databaseClosed:true,databaseUnchanged:true,runtimeUnchanged:true,toolSha256:deliveryToolHash()});
test('examination transfer only accepts current closed successful verify and exact preparation',()=>{
 requireProgramplanExaminationPreflight(preflight());const prepared={...preflight(),mode:'--prepare',testedBuild:{revision:'abc'}};requireProgramplanExaminationPreparation(prepared,{testedBuild:{revision:'abc'}});
 for(const patch of [{status:'FAIL'},{mode:'--apply'},{databaseClosed:false},{databaseUnchanged:false},{runtimeUnchanged:false},{toolSha256:'changed'}])assert.throws(()=>requireProgramplanExaminationPreflight({...preflight(),...patch}));
 assert.throws(()=>requireProgramplanExaminationPreparation(prepared,{testedBuild:{revision:'other'}}));
});
test('installed examination schema or stop attempt demands recovery and never permits legacy rollback',()=>{
 for(const r of [{databasePackageInstalled:true},{stopAttempted:true},{databasePackageInstalled:true,stopAttempted:true}]){programplanExaminationFailurePolicy(r);assert.equal(r.recoveryRequired,true);assert.equal(r.applicationRollbackRestoresCompatibility,false);assert.equal(r.legacyRollbackAllowed,false);}
 const untouched={};programplanExaminationFailurePolicy(untouched);assert.equal(untouched.recoveryRequired,false);assert.equal(untouched.legacyRollbackAllowed,false);
});
test('delivery refuses partial, uncommitted, changed or unbounded installation evidence',()=>{
 const fn=signature=>({signature,definition:'before',acl:'{postgres=X/postgres}',owner:'16384'});
 const before={tables:[],columns:[],constraints:[],indexes:[],policies:[],triggers:[],functions:allowedFunctions.map(fn)};
 const after=structuredClone(before);after.functions.forEach(f=>f.definition='after');
 after.functions.push(...addedFunctions.map((signature,i)=>({...fn(signature),definition:"SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'",acl:i===1?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'})));
 const expected={target:{database:'synthetic'},installed:{fingerprint:'verified'}};
 const valid={kind:'programplan-examination-live-installation',mode:'--apply',status:'PASS',committed:true,databaseClosed:true,structureVerified:true,candidateTransferRequired:true,localMigrationFilesSynced:true,oldWorkerCompatibleAfterCommit:false,toolSha256:toolHash(),...expected,beforeProjection:{rows:'same'},afterProjection:{rows:'same'},beforeJournal:{count:1},afterOriginalJournal:{count:1},beforeStructure:before,afterStructure:after,lockHoldMsBeforeCommit:1};
 requireProgramplanExaminationInstallation(valid,expected);
 for(const patch of [{status:'FAIL'},{mode:'--verify'},{committed:false},{databaseClosed:false},{structureVerified:false},{candidateTransferRequired:false},{localMigrationFilesSynced:false},{oldWorkerCompatibleAfterCommit:true},{recoveryRequired:true},{toolSha256:'old'},{target:{}},{installed:{}},{afterProjection:{}},{afterOriginalJournal:{}},{lockHoldMsBeforeCommit:30000},{lockHoldMsBeforeCommit:-1},{afterStructure:before}])assert.throws(()=>requireProgramplanExaminationInstallation({...valid,...patch},expected));
});
