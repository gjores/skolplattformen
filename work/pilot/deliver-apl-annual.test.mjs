import test from 'node:test';
import assert from 'node:assert/strict';
import { annualFailurePolicy, requireAnnualPreflight, requireAnnualPreparation, deliveryToolHash } from './deliver-apl-annual.mjs';
const preflight=()=>({kind:'apl-annual-local-delivery',mode:'--verify',status:'PASS',databaseClosed:true,databaseUnchanged:true,runtimeUnchanged:true,toolSha256:deliveryToolHash()});
test('annual transfer only accepts current closed successful verify and exact preparation',()=>{
 requireAnnualPreflight(preflight());const prepared={...preflight(),mode:'--prepare',testedBuild:{revision:'abc'}};requireAnnualPreparation(prepared,{testedBuild:{revision:'abc'}});
 for(const patch of [{status:'FAIL'},{mode:'--apply'},{databaseClosed:false},{databaseUnchanged:false},{runtimeUnchanged:false},{toolSha256:'changed'}])assert.throws(()=>requireAnnualPreflight({...preflight(),...patch}));
 assert.throws(()=>requireAnnualPreparation(prepared,{testedBuild:{revision:'other'}}));
});
test('installed V2 schema or stop attempt demands recovery and never permits legacy rollback',()=>{
 for(const r of [{databasePackageInstalled:true},{stopAttempted:true},{databasePackageInstalled:true,stopAttempted:true}]){annualFailurePolicy(r);assert.equal(r.recoveryRequired,true);assert.equal(r.applicationRollbackRestoresCompatibility,false);assert.equal(r.legacyRollbackAllowed,false);}
 const untouched={};annualFailurePolicy(untouched);assert.equal(untouched.recoveryRequired,false);assert.equal(untouched.legacyRollbackAllowed,false);
});
