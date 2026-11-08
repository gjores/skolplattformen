import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({load(url,ctx,next){if(url===new URL('./session.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const readSession=()=>{throw Error("unexpected session")};'};if(url===new URL('./env.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export const serverEnv=()=>({});'};if(url===new URL('./db.ts',import.meta.url).href)return{format:'module',shortCircuit:true,source:'export class Deny extends Error{constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=()=>{throw Error("unexpected DB")};export const withSessionContext=()=>{throw Error("unexpected DB")};'};return next(url,ctx);}});
const {readStudyGroups,commandStudyGroup,studyGroupRequest}=await import('./study-groups.ts');
import {parseStudyGroupCommand,parseStudyGroupReply,parseStudyGroupScope} from '../study-group-contract.ts';

const id=n=>`59000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2026},ctx={identityId:id(3),assignmentId:id(4),accessFunction:'rektor'};
const group={id:id(10),unitId:scope.unitId,schoolYear:2026,name:'Psykologi A',startsOn:'2026-08-17',endsOn:'2027-06-11',course:{subjectCode:'PSYL',subjectVersion:3,itemCode:'PSYL1000X',points:50,languageCode:null},
  minutesHt:1350,minutesVt:1350,parallelSetId:id(11),classIds:[id(20)],origin:{kind:'manual'},revision:1,active:true};
const membership={id:id(30),groupId:id(10),pupilId:id(40),startsOn:'2026-08-17',endsOn:'2027-06-11',source:'manual',sourceRef:null};
const read=(extra={})=>({contractVersion:'study_group_v1',...scope,groups:[group],memberships:[membership],pupils:[{id:id(40),name:'Elev',classIds:[id(20)]}],classes:[{id:id(20),name:'SA26A'}],...extra});
const wrap=result=>({contractVersion:'study_group_sql_v1',actor:{identityId:ctx.identityId,assignmentId:ctx.assignmentId},result});
const command=(action,payload)=>parseStudyGroupCommand({contractVersion:'study_group_v1',commandId:id(6),action,...scope,payload});
const {unitId:_u,schoolYear:_y,revision:_r,active:_a,...saveFields}=group;
function fixture(...replies){const calls=[];const tx=async(strings)=>{calls.push(strings.join('?'));const next=replies.shift();if(next instanceof Error)throw next;return[{result:structuredClone(next)}];};tx.json=v=>v;return{tx,calls};}
const rejects=(fn,check)=>assert.rejects(fn,e=>typeof check==='function'?check(e):e.code===check||e.name===check);

test('read checks actor, scope and that memberships belong to listed groups',async()=>{
  const f=fixture(wrap(read()));assert.deepEqual((await readStudyGroups(f.tx,ctx,scope)).body,read());assert.match(f.calls[0],/study_group_read/);
  for(const bad of [{...wrap(read()),actor:{identityId:id(90),assignmentId:ctx.assignmentId}},wrap(read({schoolYear:2027})),wrap(read({memberships:[{...membership,groupId:id(99)}]})),wrap(read({groups:[{...group,unitId:id(98)}]}))])
    await rejects(()=>readStudyGroups(fixture(bad).tx,ctx,scope),'AuditUnavailable');
});

test('only rektor and skoladministratör reach the database',async()=>{
  for(const accessFunction of ['larare','huvudman','support',null]){const f=fixture(wrap(read()));await rejects(()=>readStudyGroups(f.tx,{...ctx,accessFunction},scope),'forbidden');assert.equal(f.calls.length,0);}
});

test('commands are strictly parsed per action',()=>{
  assert.equal(command('save_group',{...saveFields,expectedRevision:0}).payload.name,'Psykologi A');
  assert.equal(command('move_member',{membershipId:id(30),toGroupId:id(12),on:'2027-01-11'}).payload.on,'2027-01-11');
  for(const [action,payload] of [['save_group',{...saveFields}],['save_group',{...saveFields,expectedRevision:0,extra:1}],['add_members',{groupId:id(10),members:[]}],
    ['move_member',{membershipId:id(30),toGroupId:id(12),on:'2027-02-30'}],['end_member',{membershipId:id(30)}],['delete_group',{groupId:id(10)}],
    ['add_members',{groupId:id(10),members:[{pupilId:id(40),startsOn:'2027-01-02',endsOn:'2027-01-01',source:'manual',sourceRef:null}]}]])
    assert.throws(()=>command(action,payload),e=>e.code==='invalid_study_group',action);
});

test('reply must echo the command and target; database hints become safe replies',async()=>{
  const save=command('save_group',{...saveFields,expectedRevision:0});
  const ok={receipt:{commandId:id(6),action:'save_group',replayed:false,groupId:id(10),revision:1},read:read()};
  const {body}=await commandStudyGroup(fixture(wrap(ok)).tx,ctx,save);assert.equal(body.receipt.revision,1);
  assert.deepEqual(parseStudyGroupReply(JSON.parse(JSON.stringify(body)),save),body,"the view accepts the reply the server sends");
  await rejects(()=>commandStudyGroup(fixture(wrap({...ok,receipt:{...ok.receipt,groupId:id(77)}})).tx,ctx,save),'AuditUnavailable');
  await rejects(()=>commandStudyGroup(fixture(wrap({...ok,receipt:{...ok.receipt,action:'retire_group'}})).tx,ctx,save),'AuditUnavailable');
  const sqlError=(code,hint)=>Object.assign(new Error('x'),{code,hint});
  await rejects(()=>commandStudyGroup(fixture(sqlError('40001','study_group_member_overlap')).tx,ctx,save),e=>e.code==='conflict'&&e.details.reason==='study_group_member_overlap');
  await rejects(()=>commandStudyGroup(fixture(sqlError('22023','study_group_in_use')).tx,ctx,save),e=>e.code==='bad_request'&&e.details.reason==='study_group_in_use');
  await rejects(()=>commandStudyGroup(fixture(sqlError('42501')).tx,ctx,save),'forbidden');
  await rejects(()=>commandStudyGroup(fixture(sqlError('XX000')).tx,ctx,save),'AuditUnavailable');
});

test('request bodies are bounded and strictly parsed',async()=>{
  assert.deepEqual(await studyGroupRequest(new Request('http://x',{method:'POST',body:JSON.stringify(scope)}),parseStudyGroupScope),scope);
  await rejects(()=>studyGroupRequest(new Request('http://x',{method:'POST',body:'x'.repeat(512001)}),parseStudyGroupScope),e=>e.details?.reason==='payload_too_large');
});
