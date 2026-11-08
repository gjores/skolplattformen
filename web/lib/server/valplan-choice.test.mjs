import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({load(url,ctx,next){if(url===new URL('./session.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const readSession=()=>{throw Error("unexpected session")};export const tokenHash=()=>{throw Error("unexpected token")};'};if(url===new URL('./env.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const serverEnv=()=>({});'};if(url===new URL('./db.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export class Deny extends Error{constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=()=>{throw Error("unexpected DB")};export const withSessionContext=()=>{throw Error("unexpected DB")};'};return next(url,ctx);}});
const {readValplanChoices,commandValplanChoice}=await import('./valplan-choice.ts');
import {parseValplanChoiceCommand,parseValplanChoiceRead,parseValplanChoiceReply,parseValplanChoiceScope,parseValplanSelfCommand,parseValplanSelfRead} from '../valplan-choice-contract.ts';

const id=n=>`58100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2027,valplanId:id(2)},ctx={identityId:id(3),assignmentId:id(4),accessFunction:'rektor'};
const read=(extra={})=>({contractVersion:'valplan_choice_v1',...scope,valplanName:'IV',valplanRevision:1,guardianConfirmation:null,round:null,courses:[],classes:[],groupCourseIds:[],pupils:[],...extra});
const wrap=result=>({contractVersion:'valplan_choice_sql_v1',actor:{identityId:ctx.identityId,assignmentId:ctx.assignmentId},result});
const command=(action,payload)=>parseValplanChoiceCommand({contractVersion:'valplan_choice_v1',commandId:id(6),action,...scope,payload});
function fixture(...replies){const calls=[];const tx=async strings=>{calls.push(strings.join('?'));const next=replies.shift();if(next instanceof Error)throw next;return[{result:structuredClone(next)}];};tx.json=v=>v;return{tx,calls};}
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code||e.name===code);
const sql=(code,hint)=>Object.assign(new Error('sql'),{code,hint});

test('read checks the true actor and the strict contract',async()=>{
 assert.deepEqual((await readValplanChoices(fixture(wrap(read())).tx,ctx,scope)).body,read());
 for(const bad of [{...wrap(read()),actor:{identityId:id(9),assignmentId:ctx.assignmentId}},wrap(read({valplanId:id(9)})),wrap(read({extra:1}))])await rejects(()=>readValplanChoices(fixture(bad).tx,ctx,scope),'AuditUnavailable');
});
test('only rektor and skoladministratör reach the database',async()=>{
 for(const accessFunction of ['larare','huvudman',null]){const f=fixture(wrap(read()));await rejects(()=>readValplanChoices(f.tx,{...ctx,accessFunction},scope),'forbidden');assert.equal(f.calls.length,0);}
});
test('sql outcomes map to clear statuses without leaking text',async()=>{
 const c=command('close_round',{expectedRevision:1});
 await rejects(()=>commandValplanChoice(fixture(sql('42501')).tx,ctx,c),'forbidden');
 await assert.rejects(()=>commandValplanChoice(fixture(sql('40001','valplan_round_conflict')).tx,ctx,c),e=>e.code==='conflict'&&e.details.reason==='valplan_round_conflict');
 await assert.rejects(()=>commandValplanChoice(fixture(sql('22023','valplan_choice_points')).tx,ctx,c),e=>e.code==='bad_request'&&e.details.reason==='valplan_choice_points');
 for(const reason of ['valplan_choice_course_held','valplan_choice_course_twice'])await assert.rejects(()=>commandValplanChoice(fixture(sql('22023',reason)).tx,ctx,c),e=>e.code==='bad_request'&&e.details.reason===reason);
 await rejects(()=>commandValplanChoice(fixture(sql('XX000')).tx,ctx,c),'AuditUnavailable');
});
test('commands return the new read and group counts from the receipt',async()=>{
 const c=command('create_groups',{}),reply=wrap({receipt:{commandId:id(6),action:'create_groups',replayed:false,created:2,added:5,notConfirmed:1},read:read()});
 const {body}=await commandValplanChoice(fixture(reply).tx,ctx,c);
 assert.deepEqual(parseValplanChoiceReply(JSON.parse(JSON.stringify(body)),c).receipt.groups,{created:2,added:5,notConfirmed:1},"the view reads the counts from the reply the server sends");
});
test('the read says why a course cannot be chosen, and nothing else passes',()=>{
 const pupil={id:id(60),name:'Syntetisk',classIds:[],targetPoints:200,offeredCourseIds:[],blockedCourses:[{courseId:id(30),reason:'timplan'}],choice:null},good=read({pupils:[pupil]});
 assert.deepEqual(parseValplanChoiceRead(good,scope).pupils[0].blockedCourses,[{courseId:id(30),reason:'timplan'}]);
 for(const blockedCourses of [[{courseId:id(30),reason:'betyg'}],[{courseId:id(30)}],undefined])assert.throws(()=>parseValplanChoiceRead(read({pupils:[{...pupil,blockedCourses}]}),scope));
 const offer={round:{id:id(40),status:'open',closesOn:'2027-01-01',guardianConfirmation:false,revision:1,accepting:true},valplanId:id(2),valplanName:'IV',kind:'individualChoice',schoolYear:2027,targetPoints:200,courses:[],blockedCourses:[{courseId:id(30),reason:'val'}],choice:null,decision:null};
 assert.equal(parseValplanSelfRead({contractVersion:'valplan_self_v1',epoch:1,offers:[offer]},1).offers[0].blockedCourses[0].reason,'val');
 const {blockedCourses:_,...old}=offer;assert.throws(()=>parseValplanSelfRead({contractVersion:'valplan_self_v1',epoch:1,offers:[old]},1),'a read without the field is refused');
});
test('contracts refuse unknown shapes before the database',()=>{
 assert.throws(()=>parseValplanChoiceScope({...scope,extra:1}));
 assert.throws(()=>command('record_choice',{pupilId:id(7),expectedChoiceRevision:0,courseIds:[]}));
 assert.throws(()=>command('record_choice',{pupilId:id(7),expectedChoiceRevision:0,courseIds:[id(8),id(8)]}));
 assert.throws(()=>command('delete_round',{}));
 const base={unitId:id(1),pupilId:id(7),expectedBindingRevision:1,commandId:id(6)};
 assert.throws(()=>parseValplanSelfCommand({...base,participant:'guardian',action:'submit_choice',payload:{roundId:id(8),expectedChoiceRevision:0,courseIds:[id(9)]}}));
 assert.throws(()=>parseValplanSelfCommand({...base,participant:'pupil',action:'confirm_guardian',payload:{choiceId:id(8),expectedChoiceRevision:1,decision:'approve'}}));
});
