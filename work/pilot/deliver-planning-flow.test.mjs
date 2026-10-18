import test from 'node:test';
import assert from 'node:assert/strict';
import { planningFlowFailurePolicy, requirePlanningFlowPreflight, requirePlanningFlowPreparation, deliveryToolHash } from './deliver-planning-flow.mjs';
const preflight=()=>({kind:'planning-flow-local-delivery',mode:'--verify',status:'PASS',databaseClosed:true,databaseUnchanged:true,runtimeUnchanged:true,toolSha256:deliveryToolHash()});
test('planning flow transfer only accepts current closed successful verify and exact preparation',()=>{
 requirePlanningFlowPreflight(preflight());const prepared={...preflight(),mode:'--prepare',testedBuild:{revision:'abc'}};requirePlanningFlowPreparation(prepared,{testedBuild:{revision:'abc'}});
 for(const patch of [{status:'FAIL'},{mode:'--apply'},{databaseClosed:false},{databaseUnchanged:false},{runtimeUnchanged:false},{toolSha256:'changed'}])assert.throws(()=>requirePlanningFlowPreflight({...preflight(),...patch}));
 assert.throws(()=>requirePlanningFlowPreparation(prepared,{testedBuild:{revision:'other'}}));
});
test('installed V2 schema or stop attempt demands recovery and never permits legacy rollback',()=>{
 for(const r of [{databasePackageInstalled:true},{stopAttempted:true},{databasePackageInstalled:true,stopAttempted:true}]){planningFlowFailurePolicy(r);assert.equal(r.recoveryRequired,true);assert.equal(r.applicationRollbackRestoresCompatibility,false);assert.equal(r.legacyRollbackAllowed,false);}
 const untouched={};planningFlowFailurePolicy(untouched);assert.equal(untouched.recoveryRequired,false);assert.equal(untouched.legacyRollbackAllowed,false);
});

import { requireAplDeliveryRead } from './deliver-apl-plan.mjs';
test('separate read-only delivery proves approved timetable capability using two independent revisions',()=>{
 const input={gym:{revision:8,status:'faststalld',archived:false,canPlan:false},apl:{revision:3,revisionScope:'apl',timplanRevision:8,capabilities:{canSave:true,canConfirm:true,canReview:false}},decision:{revision:8,contractVersion:'timetable_decision_v2',apl:null},allowsApl:true,aplWorkflow:'separate_apl_v1'};
 requireAplDeliveryRead(input);
 for(const mutate of [x=>x.apl.timplanRevision=7,x=>x.apl.revisionScope='timplan',x=>x.apl.capabilities.canSave=false,x=>x.apl.capabilities.canReview=true,x=>x.decision.apl={},x=>x.decision.contractVersion='apl_decision_v1']){
  const next=structuredClone(input);mutate(next);assert.throws(()=>requireAplDeliveryRead(next));
 }
 for(const patch of [{status:'utkast'},{status:'ersatt'},{archived:true}]){
  const next=structuredClone(input);Object.assign(next.gym,patch);next.apl.capabilities.canSave=false;next.apl.capabilities.canConfirm=false;requireAplDeliveryRead(next);
 }
 const higher=structuredClone(input);higher.allowsApl=false;higher.apl.capabilities.canSave=false;higher.apl.capabilities.canConfirm=false;requireAplDeliveryRead(higher);
});
test('historical read-only delivery keeps original shared-revision draft contract by default',()=>{
 const input={gym:{revision:8,canPlan:true},apl:{revision:8,capabilities:{canSave:true,canConfirm:true}},decision:{revision:8,contractVersion:'apl_decision_v1',apl:null},allowsApl:true};
 requireAplDeliveryRead(input);assert.throws(()=>requireAplDeliveryRead({...input,aplWorkflow:'separate_apl_v1'}));
});
