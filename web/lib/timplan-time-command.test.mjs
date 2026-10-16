import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGymTimplan } from './gym-timplan.ts';
import { parseTimplanTimeCommand, parseTimplanTimeReply, parseTimplanTimeStatus } from './timplan-time-command.ts';
import { suggestGymTimplanTimeV2 } from './gym-timplan-distribution.ts';
const id='55401000-0000-4000-8000-000000000001', key='foundation:ENGE:1:ENGE1000X';
const time=()=>({schoolMinutes:[1200,1200,null,null,null,null],annualAplMinutes:[3600,null,null]});
const plan=()=>({id,offeringId:id,unitId:id,schoolName:'Syntetisk',version:1,revision:5,status:'utkast',
 source:{planId:id,offeringId:id,version:1,revision:2,status:'faststalld',catalogId:`sha256:${'0'.repeat(64)}`,startedOn:'2027-08-01',educationRevision:1,education:{name:'Bygg',cohort:'2027',programCode:'BA25',orientationCode:null}},
 currentSource:{planId:id,version:1,revision:2,status:'faststalld'},rows:[{key,name:'Engelska',levelName:'Nivå 1',points:100,part:'foundation',pointTerms:[50,50,0,0,0,0],rowKind:'fixed'}],
 timeModel:'school_terms_annual_apl_v2',timeRows:{[key]:time()},timeCopyReview:[],canPlan:true,archived:false,sourceChanged:false});
const command=()=>({contractVersion:'timplan_time_v2',action:'save_row',commandId:id,planId:id,expectedRevision:4,rowKey:key,row:time()});
const reply=()=>({contractVersion:'timplan_time_v2',plan:plan(),receipt:{commandId:id,planId:id,action:'save_row',revision:5,changed:true,replayed:false}});
test('gym V2 has strict disjoint shape; higher-ed cannot carry annual APL',()=>{
 assert.deepEqual(parseGymTimplan(plan(),id),plan());
 for(const patch of [{hours:{}},{timeModel:'v3'},{timeRows:{}},{timeCopyReview:[{}]}])assert.throws(()=>parseGymTimplan({...plan(),...patch},id));
 const prep=plan();prep.source.education.programCode='SA25';assert.throws(()=>parseGymTimplan(prep,id));
});
test('request identity and response rows are exact; unknown fields, stale revision and fake completion fail',()=>{
 assert.deepEqual(parseTimplanTimeCommand(command()),command());assert.deepEqual(parseTimplanTimeReply(reply(),command()),reply());
 for(const patch of [{actorId:id},{expectedRevision:'4'},{action:'erase'},{row:{...time(),hours:[]}}])assert.throws(()=>parseTimplanTimeCommand({...command(),...patch}));
 for(const alter of [r=>r.receipt.revision=6,r=>r.receipt.changed=false,r=>r.plan.timeRows[key].schoolMinutes[0]++,r=>r.receipt.commandId=id.slice(0,-1)+'2']){const r=reply();alter(r);assert.throws(()=>parseTimplanTimeReply(r,command()));}
 assert.throws(()=>parseTimplanTimeStatus({state:'completed',result:reply()},{command:command()}));
 const done=reply();done.receipt.replayed=true;assert.equal(parseTimplanTimeStatus({state:'completed',result:done},{command:command()}).state,'completed');
});
test('annual distribution reserves APL, preserves minute remainders/explicit zero, exact total, and leaves original untouched',()=>{
 const p=plan();p.timeRows[key].schoolMinutes=[4770,null,null,null,null,null];p.timeRows[key].annualAplMinutes=[30,null,null];const before=structuredClone(p);
 const result=suggestGymTimplanTimeV2(p,100,'fill-empty');assert.deepEqual(result.timeRows[key],{schoolMinutes:[4770,1200,null,null,null,null],annualAplMinutes:[30,null,null]});assert.equal(result.totalMinutes,6000);assert.deepEqual(p,before);
 p.timeRows[key].schoolMinutes[0]=0;const zero=suggestGymTimplanTimeV2(p,1,'fill-empty');assert.deepEqual(zero.timeRows[key].schoolMinutes,[0,30,null,null,null,null]);
 assert.throws(()=>suggestGymTimplanTimeV2(before,79,'fill-empty'));
 const unknown=plan();unknown.timeRows[key].annualAplMinutes[0]=null;const u=suggestGymTimplanTimeV2(unknown,100,'replace');assert.equal(u.complete,false);assert.equal(u.timeRows[key].annualAplMinutes[0],null);
});
test('distribution caps and deterministic rounding remain exact in whole minutes',()=>{
 for(const n of [61,100,2001,4059,4060]){const p=plan(),s=suggestGymTimplanTimeV2(p,n,'replace');assert.equal(s.totalMinutes,n*60);assert.equal(s.aplMinutes,3600);assert.ok(s.timeRows[key].schoolMinutes.every(x=>x===null||x<=120000));}
 assert.throws(()=>suggestGymTimplanTimeV2(plan(),4061,'replace'));
});
