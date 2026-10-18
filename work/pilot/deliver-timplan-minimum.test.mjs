import test from 'node:test';
import assert from 'node:assert/strict';
import { timplanMinimumFailurePolicy, requireTimplanMinimumPreflight, requireTimplanMinimumPreparation, deliveryToolHash } from './deliver-timplan-minimum.mjs';
const preflight=()=>({kind:'timplan-minimum-local-delivery',mode:'--verify',status:'PASS',databaseClosed:true,databaseUnchanged:true,runtimeUnchanged:true,toolSha256:deliveryToolHash()});
test('planning flow transfer only accepts current closed successful verify and exact preparation',()=>{
 requireTimplanMinimumPreflight(preflight());const prepared={...preflight(),mode:'--prepare',testedBuild:{revision:'abc'}};requireTimplanMinimumPreparation(prepared,{testedBuild:{revision:'abc'}});
 for(const patch of [{status:'FAIL'},{mode:'--apply'},{databaseClosed:false},{databaseUnchanged:false},{runtimeUnchanged:false},{toolSha256:'changed'}])assert.throws(()=>requireTimplanMinimumPreflight({...preflight(),...patch}));
 assert.throws(()=>requireTimplanMinimumPreparation(prepared,{testedBuild:{revision:'other'}}));
});
test('installed V2 schema or stop attempt demands recovery and never permits legacy rollback',()=>{
 for(const r of [{databasePackageInstalled:true},{stopAttempted:true},{databasePackageInstalled:true,stopAttempted:true}]){timplanMinimumFailurePolicy(r);assert.equal(r.recoveryRequired,true);assert.equal(r.applicationRollbackRestoresCompatibility,false);assert.equal(r.legacyRollbackAllowed,false);}
 const untouched={};timplanMinimumFailurePolicy(untouched);assert.equal(untouched.recoveryRequired,false);assert.equal(untouched.legacyRollbackAllowed,false);
});
