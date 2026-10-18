// Real distribution/model/command parsers; mocked transaction I/O is not SQL or OIDC evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {timplanTimeTotals,projectTimplanTimeTransition} from '../timplan-time.ts';
const id='55408000-0000-4000-8000-000000000001',key='programmeSpecific:PEDG:1:PEDG1000X',other='orientation:PEDG:1:PEDG2000X',third='foundation:SVEN:1:SVEN1000X';
const row=(key,part)=>({key,part,name:'Syntetiskt ämne',levelName:'Nivå 1',points:900,pointTerms:[150,150,150,150,150,150],rowKind:'fixed'});
function plan(){return{id,offeringId:id,unitId:id,schoolName:'Syntetisk skola',version:1,revision:12,status:'utkast',canPlan:true,archived:false,sourceChanged:false,series:{id,name:'Syntetisk timplan',revision:0},nameAtCreation:null,
 source:{planId:id,offeringId:id,version:1,revision:0,status:'faststalld',catalogId:`sha256:${'a'.repeat(64)}`,startedOn:'2027-08-01',educationRevision:0,education:{name:'Syntetisk BF',cohort:'2027',programCode:'BF25',orientationCode:null}},
 currentSource:{planId:id,version:1,revision:0,status:'faststalld'},rows:[row(key,'programmeSpecific'),row(other,'orientation'),row(third,'foundation')],timeModel:'school_terms_annual_apl_v2',timeCopyReview:[],
 timeRows:Object.fromEntries([key,other,third].map(k=>[k,{schoolMinutes:[null,null,null,null,null,null],annualAplMinutes:[null,null,null]}]))};}
let state;
globalThis.__autoAplServer={
 read(){const body=structuredClone(state.plan);if(state.saved.length&&state.tamperRead)state.tamperRead(body);return{body};},
 write(q){state.saved.push(q);state.plan.hours[q.rowKey]=structuredClone(q.hours);state.plan.revision++;return{body:{revision:state.plan.revision}};},
 apl(){return{body:state.apl};},
};
registerHooks({load(url,context,next){let source;
 if(url===new URL('./gym-timplan.ts',import.meta.url).href)source='export const readGymTimplan=async()=>globalThis.__autoAplServer.read();export const writeGymTimplanRow=async(_tx,q)=>globalThis.__autoAplServer.write(q);export const projectGymTimplan=async body=>({body});export const gymTimplanOperation=fn=>fn();';
 if(url===new URL('./apl-plan.ts',import.meta.url).href)source='export const readAplPlan=async()=>globalThis.__autoAplServer.apl();';
 if(url===new URL('./db.ts',import.meta.url).href)source='export class Deny extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}';
 if(url===new URL('./authz.ts',import.meta.url).href)source='export class AuditUnavailable extends Error{}';
 return source?{format:'module',shortCircuit:true,source}:next(url,context);
}});
const {distributeGymTimplan}=await import('./gym-timplan-distribution.ts');
const {readTimplanTimeBasis}=await import('./timplan-time.ts');
const tx=async(strings,...values)=>{
 const sql=strings.join('?');
 if(sql.includes('phase5_timplan_time_transition_basis'))return[{result:state.transition}];
 assert.ok(sql.includes('phase5_timplan_time_command'));
 const q=values[0];state.saved.push(structuredClone(q));state.plan.timeRows=structuredClone(q.rows);state.plan.revision++;
 const body={contractVersion:'timplan_time_sql_v2',plan:structuredClone(state.plan),receipt:{commandId:q.commandId,planId:id,action:'save_rows',revision:state.plan.revision,changed:true,replayed:false}};
 if(state.tamperReceipt)state.tamperReceipt(body);return[{result:body}];
};tx.json=v=>v;
const request=(apl={totalHours:345,rowKeys:[key]})=>({commandId:id,planId:id,expectedRevision:12,totalHours:2625,mode:'replace',...(apl?{apl}:{})});
function reset(){state={plan:plan(),saved:[],apl:{revisionScope:'apl',revision:2,timplanRevision:12,plan:null}};}
async function run(q=request()){
 const original=structuredClone(state.plan),count=state.saved.length;
 try{return await distributeGymTimplan(tx,q,{identityId:id,assignmentId:id,organizerId:id,accessFunction:'rektor'});}catch(e){state.plan=original;state.saved.length=count;throw e;}
}
function legacy(){delete state.plan.timeModel;delete state.plan.timeRows;delete state.plan.timeCopyReview;state.plan.hours=Object.fromEntries([key,other,third].map(k=>[k,[null,null,null,null,null,null]]));}
test('server sends selected APL budget through one bulk command and reads exact proposed annual cells',async()=>{
 reset();const result=await run();const totals=timplanTimeTotals(result.body);assert.equal(totals.aplMinutes,20700);assert.equal(totals.totalMinutes,2625*60);assert.equal(totals.complete,true);
 assert.equal(state.saved.length,1);assert.equal(state.saved[0].action,'save_rows');assert.deepEqual(state.saved[0].rows,result.body.timeRows);assert.equal(result.body.revision,13);
 assert.equal(Object.hasOwn(state.saved[0],'apl'),false);assert.equal(result.event.action,'gym_timplan_hours_distributed');
});
test('bulk proposal preserves existing APL on unselected rows and never reduces above-minimum budgets',async()=>{
 reset();state.plan.timeRows[other].annualAplMinutes=[24000,0,0];await assert.rejects(run(),e=>e.status===400);assert.equal(state.saved.length,0);const result=await run(request({totalHours:400,rowKeys:[key]}));assert.deepEqual(result.body.timeRows[other].annualAplMinutes,[24000,0,0]);assert.equal(timplanTimeTotals(result.body).aplMinutes,24000);
 assert.equal(timplanTimeTotals(result.body).totalMinutes,2625*60);
});
test('old V2 request retains its existing annual APL including null cells',async()=>{
 reset();state.plan.timeRows[key].annualAplMinutes=[600,null,0];const old=structuredClone(state.plan.timeRows);
 const result=await run(request(null));for(const k of [key,other,third])assert.deepEqual(result.body.timeRows[k].annualAplMinutes,old[k].annualAplMinutes);
});
test('mismatched APL in command receipt or final read rolls back the entire synthetic transaction',async()=>{
 for(const target of ['receipt','read']){reset();const original=structuredClone(state.plan);
  if(target==='receipt')state.tamperReceipt=r=>r.plan.timeRows[key].annualAplMinutes[0]++;
  else state.tamperRead=p=>p.timeRows[key].annualAplMinutes[0]++;
  await assert.rejects(run(),e=>e.constructor.name==='AuditUnavailable');assert.deepEqual(state.plan,original);assert.equal(state.saved.length,0);
 }
});
test('APL request is rejected for legacy before writes; stale revision and locked V2 cannot distribute',async()=>{
 reset();legacy();await assert.rejects(run(),e=>e.status===400);assert.equal(state.saved.length,0);
 reset();await assert.rejects(run({...request(),expectedRevision:11}),e=>e.status===409);
 reset();state.plan.status='faststalld';await assert.rejects(run(),e=>e.status===403);
});
test('legacy auto distribution compares timetable revision independently of APL counter',async()=>{
 reset();legacy();assert.equal((await run(request(null))).body.revision,15);
 reset();legacy();state.apl.timplanRevision=11;await assert.rejects(run(request(null)),e=>e.status===409);assert.equal(state.saved.length,0);
 reset();legacy();delete state.apl.timplanRevision;delete state.apl.revisionScope;state.apl.revision=12;assert.equal((await run(request(null))).body.revision,15);
});
test('legacy transition accepts own APL counter only when exact timetable revision matches',async()=>{
 reset();legacy();for(const k of [key,other,third])state.plan.hours[k]=[150,150,150,150,150,150];
 const proposal=projectTimplanTimeTransition(state.plan,null);state.transition={planId:id,revision:12,basisHash:`sha256:${'b'.repeat(64)}`,rows:proposal.timeRows};
 assert.deepEqual((await readTimplanTimeBasis(tx,{planId:id},{})).body.rows,proposal.timeRows);
 state.apl.timplanRevision=11;await assert.rejects(readTimplanTimeBasis(tx,{planId:id},{}),e=>e.constructor.name==='AuditUnavailable');
 delete state.apl.timplanRevision;delete state.apl.revisionScope;state.apl.revision=12;assert.equal((await readTimplanTimeBasis(tx,{planId:id},{})).body.revision,12);
});
