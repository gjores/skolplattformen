import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestGymTimplanHours, gymTimplanGut, parseGymTimplanDistributionRequest } from './gym-timplan-distribution.ts';
const row=(key,points)=>({key,pointTerms:points,points:points.reduce((a,b)=>a+b,0)});
const fixture=()=>({source:{catalogId:'verified',startedOn:'2027-08-01',education:{programCode:'SA25'}},rows:[row('a',[50,50,0,0,0,0]),row('b',[0,0,100,0,0,0])],hours:{a:[null,null,null,null,null,null],b:[null,null,null,null,null,null]}});
const apl=(allocations)=>({periods:[{allocations}]});
test('whole-plan weighted proposal has exact total, deterministic rounding and no inactive cells',()=>{
 const p=fixture(),before=structuredClone(p),s=suggestGymTimplanHours(p,219,'fill-empty');
 assert.deepEqual(s.hours,{a:[55,55,null,null,null,null],b:[null,null,109,null,null,null]});assert.equal(s.total,219);assert.deepEqual(p,before);
 assert.deepEqual(suggestGymTimplanHours({...p,rows:[...p.rows].reverse()},219,'fill-empty').hours,s.hours);
});
test('fill-empty preserves explicit zero and custom hours; replace is deliberate',()=>{
 const p=fixture();p.hours.a=[0,90,null,null,null,null];const filled=suggestGymTimplanHours(p,220,'fill-empty');
 assert.deepEqual(filled.hours.a,p.hours.a);assert.equal(filled.hours.b[2],130);assert.equal(filled.keptHours,90);
 assert.deepEqual(suggestGymTimplanHours(p,220,'replace').hours.a,[55,55,null,null,null,null]);
 assert.throws(()=>suggestGymTimplanHours(p,89,'fill-empty'),/minst/);
 p.hours=filled.hours;assert.deepEqual(suggestGymTimplanHours(p,220,'fill-empty').changedRows,[]);assert.throws(()=>suggestGymTimplanHours(p,221,'fill-empty'),/Alla celler/);
});
test('all saved APL minutes are summed, rounded up once per cell and remain within total',()=>{
 const p=fixture(),a={periods:[{allocations:[{rowKey:'a',termIndex:0,gutMinutes:31}]},{allocations:[{rowKey:'a',termIndex:0,gutMinutes:30}]}]},before=structuredClone(a);
 const s=suggestGymTimplanHours(p,2,'replace',a);assert.equal(s.hours.a[0],2);assert.equal(s.total,2);assert.deepEqual(a,before);
 assert.throws(()=>suggestGymTimplanHours(p,1,'replace',a),/minst/);
 p.hours.a[0]=0;assert.throws(()=>suggestGymTimplanHours(p,100,'fill-empty',a),/lägre än APL/);
 assert.throws(()=>suggestGymTimplanHours(p,100,'replace',apl([{rowKey:'a',termIndex:4,gutMinutes:1}])),/granskas/);
});
test('per-cell cap is respected while redistributing excess, with exact totals across many budgets',()=>{
 const p=fixture();p.rows[0].pointTerms=[1,1,0,0,0,0];p.rows[1].pointTerms=[0,0,1000,0,0,0];
 for(const total of [1,2,3,1999,2001,4999,6000]){
  const s=suggestGymTimplanHours(p,total,'replace');assert.equal(s.total,total);
  assert.ok(Object.values(s.hours).flat().every(v=>v===null||Number.isInteger(v)&&v>=0&&v<=2000));
 }
 assert.throws(()=>suggestGymTimplanHours(p,6001,'replace'),/för stor/);
});
test('known Gy25 GUT profiles require verified matching programme scope',()=>{
 for(const [code,points,hours,vocational]of [['SA25',2500,2180,false],['BF25',2700,2625,true],['BA25',2800,2720,true]]){
  const p=fixture();p.source.education.programCode=code;p.rows=[row('one',[points,0,0,0,0,0])];assert.deepEqual(gymTimplanGut(p),{hours,vocational});
  p.rows[0].points++;assert.equal(gymTimplanGut(p),null);
 }
 for(const mutate of [p=>p.source.catalogId=null,p=>p.source.startedOn=null,p=>p.source.startedOn='2024-08-01',p=>p.source.education.programCode='UNKNOWN']){const p=fixture();mutate(p);assert.equal(gymTimplanGut(p),null);}
});
test('strict request rejects invented authority, coercion, invalid mode and totals',()=>{
 const r={planId:'55000000-0000-4000-8000-000000000001',expectedRevision:2,totalHours:2200,mode:'replace'};
 assert.deepEqual(parseGymTimplanDistributionRequest(r),r);
 for(const patch of [{totalHours:'2200'},{totalHours:0},{totalHours:2.5},{totalHours:NaN},{totalHours:Infinity},{mode:'all'},{role:'rektor'},{expectedRevision:-1}])assert.throws(()=>parseGymTimplanDistributionRequest({...r,...patch}));
 for(const v of [0,-1,NaN,Infinity,2.5,'2200'])assert.throws(()=>suggestGymTimplanHours(fixture(),v,'replace'));
});
