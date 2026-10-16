import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanDecisionCommand,parsePlanDecisionDetail,parsePlanDecisionInbox} from './plan-decision.ts';
const id='55402000-0000-4000-8000-000000000001';
const item=()=>({series:null,apl:null,kind:'programplan',planId:id,offeringId:id,unitId:null,educationName:'Syntetisk plan',schoolName:null,version:1,stage:'draft',nextActor:'rektor'});
const detail=()=>({...item(),contractVersion:'apl_decision_v1',revision:3,decisionRevision:1,basisHash:`sha256:${'a'.repeat(64)}`,actions:['submit'],blockers:[],checks:[{id:'structure',label:'Granska struktur'}],history:[],sourceInfo:null});
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

const uid=n=>`55402000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const series=(n=20)=>({id:uid(n),name:n===20?'Grundfördelning':'Utökad matematik',revision:2});
const namedItem=(n=2)=>({...item(),kind:'timplan',planId:uid(n),unitId:uid(10),schoolName:'Skola',series:series(18+n),task:'prepare'});
const inbox=items=>({items,actionCount:items.length,decisionCount:0,total:items.length,truncated:false});
test('named decision inbox preserves independent version ones and rejects series identity/scope conflicts',()=>{
 const a=namedItem(),b=namedItem(3);assert.deepEqual(parsePlanDecisionInbox(inbox([a,b])).items,[a,b]);
 for(const patch of [{series:a.series},{series:null},{series:{...a.series,name:'Fel namn'},version:2},{series:a.series,unitId:uid(11),version:2},{series:a.series,offeringId:uid(12),version:2}])assert.throws(()=>parsePlanDecisionInbox(inbox([a,{...b,...patch}])));
 const legacy={...b};delete legacy.series;assert.throws(()=>parsePlanDecisionInbox(inbox([a,legacy])));
 assert.throws(()=>parsePlanDecisionInbox(inbox([{...item(),series:series(),task:'prepare'}])));
 assert.equal(parsePlanDecisionInbox(inbox([{...item(),series:null,task:'prepare'}])).items[0].series,null);
});
test('named decision detail keeps historical names distinct from current name with explicit legacy history',()=>{
 const d={...detail(),kind:'timplan',unitId:uid(10),schoolName:'Skola',series:series(),history:[{action:'approve',at:'2026-10-15T12:00:00Z',actorName:'Rektor',comment:'',nameAtDecision:'Tidigare namn'}]};
 const expected={kind:'timplan',planId:id};assert.equal(parsePlanDecisionDetail(d,expected).history[0].nameAtDecision,'Tidigare namn');
 assert.equal(parsePlanDecisionDetail({...d,history:[{...d.history[0],nameAtDecision:null}]},expected).history[0].nameAtDecision,null);
 const old={...d.history[0]};delete old.nameAtDecision;assert.deepEqual(parsePlanDecisionDetail({...d,history:[old]},expected).history[0],old);
 for(const patch of [{series:null},{history:[{...d.history[0],nameAtDecision:' padded '}]},{history:[{...d.history[0],nameAtDecision:'x\u200b'}]},{series:{...series(),extra:true}}])assert.throws(()=>parsePlanDecisionDetail({...d,...patch},expected));
 assert.throws(()=>parsePlanDecisionDetail({...detail(),series:null,history:d.history},{kind:'programplan',planId:id}));
});

test('named paginated decisions enforce metadata consistently with inbox',async()=>{
 const {parsePlanDecisionPage,defaultPlanDecisionQuery}=await import('./plan-decision.ts');
 const selected=defaultPlanDecisionQuery(),a=namedItem(),b={...namedItem(3),version:2,series:a.series};
 const page={selection:selected,items:[a,b],total:2,count:2,actionCount:2,decisionCount:0,pageSize:50};
 assert.deepEqual(parsePlanDecisionPage(page,selected).items,[a,b]);
 assert.throws(()=>parsePlanDecisionPage({...page,items:[a,{...b,version:1}]},selected));
 const renamed={...a,series:{...a.series,name:'Nytt namn',revision:3}};
 assert.equal(parsePlanDecisionPage({...page,items:[renamed],total:1,count:1,actionCount:1},selected).items[0].planId,a.planId);
});
test('named decision metadata and historical names reject hostile descriptors without running them',()=>{
 let called=false;const value=namedItem();Object.defineProperty(value,'series',{enumerable:true,get(){called=true;return series();}});assert.throws(()=>parsePlanDecisionInbox(inbox([value])));assert.equal(called,false);
 const d={...detail(),series:null,history:[{action:'submit',at:'2026-10-15T12:00:00Z',actorName:'Rektor',comment:'',nameAtDecision:null}]};
 Object.defineProperty(d.history[0],'nameAtDecision',{enumerable:true,get(){called=true;return null;}});assert.throws(()=>parsePlanDecisionDetail(d,{kind:'programplan',planId:id}));assert.equal(called,false);
 const legacy={...detail(),history:[{action:'submit',at:'2026-10-15T12:00:00Z',actorName:'Rektor',comment:'',nameAtDecision:null}]};delete legacy.series;assert.throws(()=>parsePlanDecisionDetail(legacy,{kind:'programplan',planId:id}));
});

test('new details require explicit version and APL fields; legacy replay is explicitly marked',()=>{
 const expected={kind:'programplan',planId:id};
 for(const key of ['contractVersion','apl','series']){const d=detail();delete d[key];assert.throws(()=>parsePlanDecisionDetail(d,expected));}
 const old=detail();delete old.apl;delete old.series;old.contractVersion='legacy';
 assert.deepEqual(parsePlanDecisionDetail(old,expected),old);
 assert.throws(()=>parsePlanDecisionDetail({...old,apl:null},expected));
 assert.throws(()=>parsePlanDecisionDetail({...detail(),contractVersion:'legacy'},expected));
});
test('bounded raw APL blockers preserve repeated period messages before semantic server comparison',()=>{
 const d={...detail(),blockers:Array.from({length:200},()=> 'Perioden saknar datum.')};
 assert.equal(parsePlanDecisionDetail(d,{kind:'programplan',planId:id}).blockers.length,200);
 assert.throws(()=>parsePlanDecisionDetail({...d,blockers:Array(100001).fill('Fel')},{kind:'programplan',planId:id}));
});
test('new inbox requires explicit APL summary and keeps review discoverable when incomplete',()=>{
 const row={...namedItem(),stage:'submitted',nextActor:'huvudman',task:'review',apl:{state:'legacy',ready:false,blockers:['Planering saknas.']}};
 assert.equal(parsePlanDecisionInbox({...inbox([row]),decisionCount:1}).items[0].task,'review');
 for(const patch of [{apl:{...row.apl,ready:true}},{apl:{...row.apl,blockers:[]}},{apl:{...row.apl,state:'unknown'}}])assert.throws(()=>parsePlanDecisionInbox({...inbox([{...row,...patch}]),decisionCount:1}));
 const missing={...row};delete missing.apl;assert.throws(()=>parsePlanDecisionInbox({...inbox([missing]),decisionCount:1}));
});
