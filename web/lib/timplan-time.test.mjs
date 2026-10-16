import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMPLAN_TIME_MODEL_V2, parseTimplanTimeRow, parseTimplanTimeCells, parseTimplanTime,
  timplanTimeTotals, timplanTimePeriodBalance, projectTimplanTimeTransition,
  parseTimplanMinuteInput, formatTimplanMinutes, timplanTimeHashPayload } from './timplan-time.ts';
const key='foundation:ENGE:1:ENGE1000X', other='programmeSpecific:BYGG:1:BYGG1000X';
const id='55401000-0000-4000-8000-000000000001';
const row=(k=key, pointTerms=[50,50,0,0,0,0])=>({key:k,name:'Ämne',levelName:'Nivå 1',points:pointTerms.reduce((a,b)=>a+b,0),part:k===key?'foundation':'programmeSpecific',pointTerms,rowKind:'fixed'});
const cells=(schoolMinutes=[1200,1200,null,null,null,null], annualAplMinutes=[3600,null,null])=>({schoolMinutes,annualAplMinutes});
const v2=()=>({rows:[row()],timeRows:{[key]:cells()}});
const legacy=()=>({id,offeringId:id,unitId:id,schoolName:'Skola',version:1,revision:4,status:'utkast',
  source:{planId:id,offeringId:id,version:1,revision:2,status:'faststalld',catalogId:`sha256:${'0'.repeat(64)}`,startedOn:'2027-08-01',educationRevision:1,education:{name:'Bygg',cohort:'2027',programCode:'BA25',orientationCode:null}},
  currentSource:{planId:id,version:1,revision:2,status:'faststalld'},rows:[row()],hours:{[key]:[80,0,null,null,null,null]},canPlan:true,archived:false,sourceChanged:false});
const apl=(allocations=[{rowKey:key,termIndex:0,gutMinutes:30}])=>({contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[{id,name:'APL',startsOn:null,endsOn:null,schoolYear:null,extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[{rowKey:key,description:'Arbetsmoment'}],allocations}]});
test('strict V2 shape has no legacy hours, validates row ownership and inactive null masks',()=>{
 const value={timeModel:TIMPLAN_TIME_MODEL_V2,timeRows:v2().timeRows};
 assert.deepEqual(parseTimplanTime(value,v2().rows),value);
 for(const changed of [{...value,hours:{}},{...value,timeModel:'inclusive_terms_v1'},{...value,timeRows:{}},{...value,timeRows:{...value.timeRows,extra:cells()}}]) assert.throws(()=>parseTimplanTime(changed,v2().rows));
 for(const changed of [cells([1,2,0,null,null,null]),cells(undefined,[1,0,null]),{...cells(),extra:1}]) assert.throws(()=>parseTimplanTimeRow(changed,row().pointTerms));
});
test('minute arrays reject coercion, fractions, overflow, sparse/accessor and decorated values',()=>{
 for(const n of [-1,0.5,120001,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'60']) assert.throws(()=>parseTimplanTimeRow(cells([n,0,null,null,null,null])));
 assert.throws(()=>parseTimplanTimeRow(cells(undefined,[240001,null,null])));
 const sparse=cells(); Reflect.deleteProperty(sparse.schoolMinutes, 1); assert.throws(()=>parseTimplanTimeRow(sparse));
 const getter=cells();Object.defineProperty(getter,'schoolMinutes',{get(){throw Error('Getter ran');}});assert.throws(()=>parseTimplanTimeRow(getter),e=>e.code==='invalid_timplan_time');
 const decorated=cells();decorated.annualAplMinutes.extra=1;assert.throws(()=>parseTimplanTimeRow(decorated));
 assert.deepEqual(parseTimplanTimeRow(cells([120000,120000,null,null,null,null],[240000,null,null])),cells([120000,120000,null,null,null,null],[240000,null,null]));
});
test('20 HT plus 20 VT plus 60 annual APL totals 100, independent of periods',()=>{
 const result=timplanTimeTotals(v2()); assert.equal(result.totalMinutes,6000);assert.equal(result.schoolMinutes,2400);assert.equal(result.aplMinutes,3600);assert.equal(result.aplPercent,60);assert.equal(result.complete,true);assert.deepEqual(result.yearMinutes,[6000,0,0]);
 const balance=timplanTimePeriodBalance(v2(),apl([{rowKey:key,termIndex:0,gutMinutes:1200},{rowKey:key,termIndex:1,gutMinutes:600}]));
 assert.deepEqual(balance.rows[key],[{budgetMinutes:3600,allocatedMinutes:1800,remainingMinutes:1800},null,null]);assert.equal(balance.allocatedMinutes,1800);assert.equal(timplanTimeTotals(v2()).totalMinutes,6000);
});
test('null differs from explicit zero; missing school/APL values cannot be complete',()=>{
 const p=v2();p.timeRows[key]=cells([0,null,null,null,null,null],[null,null,null]);
 const result=timplanTimeTotals(p);assert.equal(result.totalMinutes,0);assert.equal(result.aplPercent,null);assert.equal(result.complete,false);assert.deepEqual(result.missingRows,[key]);assert.equal(result.missingSchoolCells,1);assert.equal(result.missingAplCells,1);
 p.timeRows[key]=cells([0,0,null,null,null,null],[0,null,null]);assert.equal(timplanTimeTotals(p).complete,true);assert.equal(timplanTimeTotals(p).aplPercent,null);
});
test('school zero with positive annual APL permits later allocation; unbudgeted/excess/inactive allocations fail',()=>{
 const p=v2();p.timeRows[key]=cells([0,0,null,null,null,null],[60,null,null]);
 assert.equal(timplanTimePeriodBalance(p,apl([{rowKey:key,termIndex:1,gutMinutes:60}])).remainingMinutes,0);
 for(const allocation of [{rowKey:key,termIndex:0,gutMinutes:61},{rowKey:key,termIndex:2,gutMinutes:1}]) assert.throws(()=>timplanTimePeriodBalance(p,apl([allocation])));
 p.timeRows[key].annualAplMinutes[0]=null;assert.throws(()=>timplanTimePeriodBalance(p,apl([{rowKey:key,termIndex:0,gutMinutes:0}])));
});
test('higher education preparatory policy forbids APL fields, including explicit zero and allocations',()=>{
 const p=v2();assert.throws(()=>parseTimplanTimeCells(p.timeRows,p.rows,false));p.timeRows[key]=cells([1200,1200,null,null,null,null],[null,null,null]);
 assert.equal(timplanTimeTotals(p,false).complete,true);assert.equal(timplanTimeTotals(p,false).aplMinutes,0);
 assert.throws(()=>timplanTimePeriodBalance(p,apl([]),false));
 assert.throws(()=>projectTimplanTimeTransition(legacy(),apl(),false));
});
test('transition preserves 80 hours exactly: 79:30 school and 0:30 annual APL, without mutating or creating periods',()=>{
 const p=legacy(),a=apl(), before=JSON.stringify([p,a]);const out=projectTimplanTimeTransition(p,a);
 assert.deepEqual(out.timeRows[key],cells([4770,0,null,null,null,null],[30,null,null]));assert.equal(out.beforeMinutes,4800);assert.equal(out.afterMinutes,4800);assert.equal(out.totalPreserved,true);assert.equal(JSON.stringify([p,a]),before);assert.equal(Object.hasOwn(out,'periods'),false);assert.equal(out.requiresReview,true);
});
test('transition sums multiple periods per year and retains null school cells',()=>{
 const p=legacy();p.hours[key]=[80,null,null,null,null,null];const a=apl();a.periods.push({...structuredClone(a.periods[0]),id:'55401000-0000-4000-8000-000000000002',allocations:[{rowKey:key,termIndex:0,gutMinutes:15}]});
 const out=projectTimplanTimeTransition(p,a);assert.equal(out.timeRows[key].schoolMinutes[0],4755);assert.equal(out.timeRows[key].schoolMinutes[1],null);assert.equal(out.timeRows[key].annualAplMinutes[0],45);assert.equal(out.complete,false);assert.equal(out.totalPreserved,true);
});
test('transition without registered APL requires explicit review rather than proving no APL',()=>{
 const out=projectTimplanTimeTransition(legacy(),null);assert.deepEqual(out.timeRows[key].annualAplMinutes,[0,null,null]);assert.equal(out.requiresReview,true);assert.ok(out.reviewPoints.includes('unclassified_apl'));assert.equal(out.totalPreserved,true);
});
test('transition refuses unknown rows, missing total, negative remainder and locked plans',()=>{
 for(const alter of [p=>p.hours[key][0]=null,p=>p.hours[key][0]=0,p=>p.status='faststalld']){const p=legacy();alter(p);assert.throws(()=>projectTimplanTimeTransition(p,apl()));}
 const a=apl();a.periods[0].contents[0].rowKey=other;a.periods[0].allocations[0].rowKey=other;assert.throws(()=>projectTimplanTimeTransition(legacy(),a));
});
test('hour and h:mm inputs preserve minutes exactly and reject ambiguous formats',()=>{
 for(const [input,expected]of [['',null],['0',0],['80',4800],['79:30',4770],['0:01',1],['2000:00',120000]])assert.equal(parseTimplanMinuteInput(input),expected);
 for(const input of [' ','1.5','1,5','1:5','1:60','-1','1e2','2000:01','1:00:00'])assert.equal(parseTimplanMinuteInput(input),undefined);
 assert.equal(parseTimplanMinuteInput('4000',240000),240000);assert.equal(formatTimplanMinutes(null),'');assert.equal(formatTimplanMinutes(4800),'80');assert.equal(formatTimplanMinutes(4770),'79:30');assert.equal(formatTimplanMinutes(1),'0:01');
 for(let n=0;n<=120000;n+=137)assert.equal(parseTimplanMinuteInput(formatTimplanMinutes(n)),n);
});
test('V2 hash payload is versioned, key-order independent, minute-sensitive and preserves null versus zero',()=>{
 const first={rows:[row(),row(other)],timeRows:{[key]:cells(),[other]:cells()}};const second={rows:[...first.rows].reverse(),timeRows:{[other]:cells(),[key]:cells()}};
 assert.deepEqual(timplanTimeHashPayload(first),timplanTimeHashPayload(second));assert.equal(timplanTimeHashPayload(first)[0],'timplan_time_v2');
 second.timeRows[key].schoolMinutes[0]++;assert.notDeepEqual(timplanTimeHashPayload(first),timplanTimeHashPayload(second));
 second.timeRows[key].schoolMinutes[0]=null;assert.notDeepEqual(timplanTimeHashPayload(first),timplanTimeHashPayload(second));
});
