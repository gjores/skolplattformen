import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanDecisionCommand,parsePlanDecisionDetail,parsePlanDecisionInbox} from './plan-decision.ts';
const id='55402000-0000-4000-8000-000000000001';
const item=()=>({kind:'programplan',planId:id,offeringId:id,unitId:null,educationName:'Syntetisk plan',schoolName:null,version:1,stage:'draft',nextActor:'rektor'});
const detail=()=>({...item(),revision:3,decisionRevision:1,basisHash:`sha256:${'a'.repeat(64)}`,actions:['submit'],blockers:[],checks:[{id:'structure',label:'Granska struktur'}],history:[],sourceInfo:null});
const command=()=>({kind:'programplan',planId:id,commandId:id,action:'submit',expectedRevision:3,expectedDecisionRevision:1,basisHash:`sha256:${'a'.repeat(64)}`,comment:'',confirmedChecks:['structure','choices']});
test('commands bind revisions and fingerprint, with mandatory return reason',()=>{
 assert.deepEqual(parsePlanDecisionCommand(command()),command());
 for(const patch of [{expectedRevision:-1},{expectedDecisionRevision:0.5},{basisHash:'unchecked'},{action:'approve-any'},{comment:'\u0001'},{confirmedChecks:['structure','structure']},{action:'return',comment:'  '}])assert.throws(()=>parsePlanDecisionCommand({...command(),...patch}));
 assert.equal(parsePlanDecisionCommand({...command(),action:'return',comment:'  Rätta timmarna.  '}).comment,'Rätta timmarna.');
});
test('detail rejects wrong plan, extra fields and editable approved state',()=>{
 assert.equal(parsePlanDecisionDetail(detail(),{kind:'programplan',planId:id}).revision,3);
 for(const patch of [{kind:'timplan'},{planId:'55402000-0000-4000-8000-000000000002'},{extra:true},{actions:['submit','submit']},{stage:'approved',actions:['return']},{history:[{action:'approve',at:'not a date',actorName:'Syntetisk',comment:''}]}])assert.throws(()=>parsePlanDecisionDetail({...detail(),...patch},{kind:'programplan',planId:id}));
});
test('inbox counts cannot hide actionable items or fabricate decisions',()=>{
 const inbox={items:[{...item(),task:'prepare'}],actionCount:1,decisionCount:0,total:1,truncated:false};
 assert.deepEqual(parsePlanDecisionInbox(inbox),inbox);
 for(const patch of [{actionCount:0},{decisionCount:1},{total:2},{truncated:true},{items:[...inbox.items,...inbox.items],total:2,actionCount:2}])assert.throws(()=>parsePlanDecisionInbox({...inbox,...patch}));
});
