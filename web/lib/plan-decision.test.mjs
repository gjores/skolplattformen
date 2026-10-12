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

test('paginated search retains global counters and reaches rows after 500', async () => {
 const {parsePlanDecisionQuery,parsePlanDecisionPage,defaultPlanDecisionQuery}=await import('./plan-decision.ts');
 const selected={...defaultPlanDecisionQuery(),page:11};
 const page={selection:selected,items:[{...item(),task:'prepare'}],actionCount:500,decisionCount:0,total:501,count:501,pageSize:50};
 assert.equal(parsePlanDecisionPage(page,selected).items.length,1);
 for(const patch of [{page:0},{page:100001},{query:' padded '},{query:'x'.repeat(201)},{kind:'all;select'},{stage:'approved'},{tasks:'foreign'},{customerId:id}]) assert.throws(()=>parsePlanDecisionQuery({...selected,...patch}));
 for(const patch of [{count:502},{pageSize:500},{total:499},{decisionCount:501},{selection:{...selected,page:10}}]) assert.throws(()=>parsePlanDecisionPage({...page,...patch},selected));
 const filtered={...selected,page:1,stage:'returned',tasks:'mine',kind:'programplan'};
 const found={...page,selection:filtered,count:1,items:[{...item(),stage:'returned',task:'revise'}]};
 assert.equal(parsePlanDecisionPage(found,filtered).actionCount,500);
 assert.throws(()=>parsePlanDecisionPage({...found,items:[{...item(),task:'waiting'}]},filtered));
});
