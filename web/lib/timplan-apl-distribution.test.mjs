import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestGymTimplanTimeV2, gymTimplanAplSuggestionRows, parseGymTimplanDistributionRequest } from './gym-timplan-distribution.ts';
const keys=['programmeSpecific:PEDG:1:PEDG1000X','orientation:BYGG:1:BYGG1000X','foundation:SVEN:1:SVEN1000X'];
const fixture=()=>({timeModel:'school_terms_annual_apl_v2',source:{catalogId:'frozen',startedOn:'2027-08-01',education:{programCode:'BF25'}},
 rows:keys.map((key,i)=>({key,name:'Ämne '+i,levelName:'Nivå 1',points:900,part:key.split(':')[0],rowKind:'fixed',pointTerms:[150,150,150,150,150,150]})),
 timeRows:Object.fromEntries(keys.map(key=>[key,{schoolMinutes:Array(6).fill(null),annualAplMinutes:Array(3).fill(null)}]))});
const choice=(totalHours=345,rowKeys=keys.slice(0,2))=>({totalHours,rowKeys});
test('new annual plan reaches both GUT and APL exactly, fills active fields, and does not mutate input',()=>{
 const p=fixture(),before=structuredClone(p),s=suggestGymTimplanTimeV2(p,2625,'fill-empty',choice());
 assert.equal(s.totalMinutes,2625*60);assert.equal(s.aplMinutes,345*60);assert.equal(s.schoolMinutes,2280*60);assert.equal(s.complete,true);
 for(const key of keys.slice(0,2))assert.deepEqual(s.timeRows[key].annualAplMinutes,[3450,3450,3450]);
 assert.deepEqual(s.timeRows[keys[2]].annualAplMinutes,[0,0,0]);assert.deepEqual(p,before);assert.deepEqual(s.changedRows,keys);
 const reversed={...p,rows:[...p.rows].reverse()};assert.deepEqual(suggestGymTimplanTimeV2(reversed,2625,'fill-empty',choice()).timeRows,s.timeRows);
});
test('saved APL is never reduced, including unselected subjects, and additions are counted once',()=>{
 const p=fixture();p.timeRows[keys[0]].annualAplMinutes=[24000,0,0];p.timeRows[keys[2]].annualAplMinutes=[60,null,null];
 const s=suggestGymTimplanTimeV2(p,2700,'replace',choice(450,[keys[1]]));
 assert.deepEqual(s.timeRows[keys[0]].annualAplMinutes,[24000,0,0]);assert.equal(s.timeRows[keys[2]].annualAplMinutes[0],60);
 assert.equal(s.aplMinutes,450*60);assert.equal(s.totalMinutes,2700*60);assert.equal(s.timeRows[keys[1]].annualAplMinutes.reduce((a,b)=>a+b),49*60);
 assert.throws(()=>suggestGymTimplanTimeV2(p,2700,'replace',choice(400)),/lägre/);
});
test('school fill-empty preserves custom values and zero; replacing school hours is explicit',()=>{
 const p=fixture();p.timeRows[keys[0]].schoolMinutes[0]=0;p.timeRows[keys[0]].schoolMinutes[1]=1020;
 const s=suggestGymTimplanTimeV2(p,2625,'fill-empty',choice());assert.equal(s.timeRows[keys[0]].schoolMinutes[0],0);assert.equal(s.timeRows[keys[0]].schoolMinutes[1],1020);
 const full={...p,timeRows:s.timeRows};assert.throws(()=>suggestGymTimplanTimeV2(full,2625,'fill-empty',choice(400)),/Höj totalen/);
 const replaced=suggestGymTimplanTimeV2(full,2625,'replace',choice(400));assert.equal(replaced.totalMinutes,2625*60);assert.equal(replaced.aplMinutes,400*60);
});
test('APL proposals reject inadequate totals, unsafe row selections and unsupported programmes',()=>{
 const p=fixture();assert.deepEqual(gymTimplanAplSuggestionRows(p).map(r=>r.key),keys.slice(0,2));
 for(const c of [choice(344),choice(345,[]),choice(345,[keys[2]]),choice(345,[keys[0],keys[0]]),choice(345,['programmeSpecific:LOST:1:LOST1000X'])])assert.throws(()=>suggestGymTimplanTimeV2(p,2625,'replace',c));
 assert.throws(()=>suggestGymTimplanTimeV2(p,2624,'replace',choice()),/GUT/);
 for(const mutate of [p=>p.source.education.programCode='SA25',p=>p.source.catalogId=null,p=>p.source.startedOn='2028-07-02',p=>p.rows[0].points++]){const q=fixture();mutate(q);assert.throws(()=>suggestGymTimplanTimeV2(q,2625,'replace',choice()),/stödd/);}
 const block=fixture();block.rows[0].rowKind='block';assert.ok(!gymTimplanAplSuggestionRows(block).some(r=>r.key===keys[0]));assert.throws(()=>suggestGymTimplanTimeV2(block,2625,'replace',choice()));
});
test('inactive years remain null and capacity or zero-time rows cannot masquerade as a complete proposal',()=>{
 const p=fixture();p.rows[0].pointTerms=[450,450,0,0,0,0];p.timeRows[keys[0]]={schoolMinutes:Array(6).fill(null),annualAplMinutes:[null,null,null]};
 const s=suggestGymTimplanTimeV2(p,2625,'replace',choice(345,[keys[0]]));assert.deepEqual(s.timeRows[keys[0]].annualAplMinutes,[20700,null,null]);
 assert.throws(()=>suggestGymTimplanTimeV2(p,5000,'replace',choice(4001,[keys[0]])),/ryms inte/);
 const zero=fixture();zero.timeRows[keys[2]].schoolMinutes.fill(0);assert.throws(()=>suggestGymTimplanTimeV2(zero,2625,'fill-empty',choice()),/rad saknar/);
});
test('strict optional APL request rejects invented fields, duplicate keys and coercion',()=>{
 const r={planId:'55000000-0000-4000-8000-000000000001',expectedRevision:1,totalHours:2625,mode:'replace',commandId:'55000000-0000-4000-8000-000000000002',apl:choice()};
 assert.deepEqual(parseGymTimplanDistributionRequest(r),r);
 for(const apl of [null,{...choice(),totalHours:'345'},{...choice(),approved:true},choice(345,[keys[0],keys[0]])])assert.throws(()=>parseGymTimplanDistributionRequest({...r,apl}));
});
