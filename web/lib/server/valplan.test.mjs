import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({load(url,ctx,next){if(url===new URL('./session.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const readSession=()=>{throw Error("unexpected session")};'};if(url===new URL('./env.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const serverEnv=()=>({});'};if(url===new URL('./db.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export class Deny extends Error{constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=()=>{throw Error("unexpected DB")};export const withSessionContext=()=>{throw Error("unexpected DB")};'};return next(url,ctx);}});
const {readValplaner,commandValplan,valplanRequest}=await import('./valplan.ts');
import catalog from '../programplan-catalog.generated.json' with {type:'json'};
import {parseValplanCommand,parseValplanScope} from '../valplan-contract.ts';

const id=n=>`58000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2027},ctx={identityId:id(3),assignmentId:id(4),accessFunction:'rektor'};
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const row={timplanId:id(10),timplanVersion:1,rowKey:'block:iv1',year:1,rowKind:'block',blockKind:'individualChoice',points:200,minutesHt:5400,minutesVt:5400,classIds:[id(20)],allowedLevelKeys:null,linkedValplanId:null,planName:'BF26',rowLabel:'Individuellt val',classes:[{id:id(20),name:'BF26A'}]};
const valplan={id:id(5),unitId:scope.unitId,schoolYear:2027,kind:'individualChoice',name:'IV 27/28',revision:1,
  courses:[{id:id(30),subjectCode:'RETO',subjectVersion:version('RETO'),itemCode:'RETO1000X',points:100,languageCode:null,name:'Retorik',minutesHt:2700,minutesVt:2700,classIds:null}],
  rows:[{timplanId:id(10),timplanVersion:1,rowKey:'block:iv1',year:1}]};
const read=(extra={})=>({contractVersion:'valplan_v1',...scope,valplans:[],rows:[row],...extra});
const wrap=result=>({contractVersion:'valplan_sql_v1',actor:{identityId:ctx.identityId,assignmentId:ctx.assignmentId},result});
const command=(doc=valplan)=>parseValplanCommand({contractVersion:'valplan_v1',commandId:id(6),action:'save',...scope,expectedRevision:0,catalogId:catalog.catalogId,valplan:doc});
function fixture(...replies){const calls=[];const tx=async(strings)=>{calls.push(strings.join('?'));const next=replies.shift();if(next instanceof Error)throw next;return[{result:structuredClone(next)}];};tx.json=v=>v;return{tx,calls};}
const rejects=(fn,check)=>assert.rejects(fn,e=>typeof check==='function'?check(e):e.code===check||e.name===check);

test('read checks the true actor and the strict read contract',async()=>{
  const f=fixture(wrap(read()));assert.deepEqual((await readValplaner(f.tx,ctx,scope)).body,read());assert.match(f.calls[0],/valplan_read/);
  for(const bad of [{...wrap(read()),actor:{identityId:id(90),assignmentId:ctx.assignmentId}},wrap(read({unitId:id(91)})),wrap(read({extra:1})),wrap(read({rows:[{...row,classIds:[]}]}))])
    await rejects(()=>readValplaner(fixture(bad).tx,ctx,scope),'AuditUnavailable');
});

test('only rektor and skoladministratör reach the database',async()=>{
  for(const accessFunction of ['larare','huvudman','support',null,'elev']){const f=fixture(wrap(read()));await rejects(()=>readValplaner(f.tx,{...ctx,accessFunction},scope),'forbidden');assert.equal(f.calls.length,0);}
});

test('save re-checks model rules on rows read in the same transaction before the command',async()=>{
  const reply={receipt:{commandId:id(6),valplanId:id(5),revision:1,replayed:false},read:read({valplans:[{catalogId:catalog.catalogId,valplan}],rows:[{...row,linkedValplanId:id(5)}]})};
  const f=fixture(wrap(read()),wrap(reply));const saved=await commandValplan(f.tx,ctx,command());
  assert.equal(saved.body.receipt.revision,1);assert.equal(saved.event.action,'valplan_command');assert.deepEqual(f.calls.map(c=>/valplan_(\w+)\(/.exec(c)[1]),['read','command']);
  const tooBig={...valplan,courses:[{...valplan.courses[0],classIds:[id(99)]}]};
  const g=fixture(wrap(read()));await rejects(()=>commandValplan(g.tx,ctx,command(tooBig)),e=>e.code==='bad_request'&&e.details.reason==='course_class_not_linked');assert.equal(g.calls.length,1);
  const taken=fixture(wrap(read({rows:[{...row,linkedValplanId:id(77)}]})));await rejects(()=>commandValplan(taken.tx,ctx,command()),e=>e.details?.reason==='row_linked_elsewhere');
  await rejects(()=>commandValplan(fixture().tx,ctx,{...command(),catalogId:'sha256:'+'0'.repeat(64)}),e=>e.details?.reason==='valplan_catalog');
});

test('database hints become safe conflict and input replies; wrong receipts are not trusted',async()=>{
  const sqlError=(code,hint)=>Object.assign(new Error('x'),{code,hint});
  await rejects(()=>commandValplan(fixture(wrap(read()),sqlError('40001','valplan_revision_conflict')).tx,ctx,command()),e=>e.code==='conflict'&&e.status===409&&e.details.reason==='valplan_revision_conflict');
  await rejects(()=>commandValplan(fixture(wrap(read()),sqlError('22023','valplan_course_identity')).tx,ctx,command()),e=>e.code==='bad_request'&&e.details.reason==='valplan_course_identity');
  await rejects(()=>commandValplan(fixture(wrap(read()),sqlError('42501')).tx,ctx,command()),'forbidden');
  await rejects(()=>commandValplan(fixture(wrap(read()),sqlError('XX000')).tx,ctx,command()),'AuditUnavailable');
  const wrongReceipt={receipt:{commandId:id(66),valplanId:id(5),revision:1,replayed:false},read:read({valplans:[{catalogId:catalog.catalogId,valplan}]})};
  await rejects(()=>commandValplan(fixture(wrap(read()),wrap(wrongReceipt)).tx,ctx,command()),'AuditUnavailable');
});

test('request bodies are bounded and strictly parsed',async()=>{
  assert.deepEqual(await valplanRequest(new Request('http://x',{method:'POST',body:JSON.stringify(scope)}),parseValplanScope),scope);
  await rejects(()=>valplanRequest(new Request('http://x',{method:'POST',body:'{'}),parseValplanScope),'bad_request');
  await rejects(()=>valplanRequest(new Request('http://x',{method:'POST',body:JSON.stringify({...scope,extra:1})}),parseValplanScope),'bad_request');
  await rejects(()=>valplanRequest(new Request('http://x',{method:'POST',body:'x'.repeat(512001)}),parseValplanScope),e=>e.details?.reason==='payload_too_large');
});
