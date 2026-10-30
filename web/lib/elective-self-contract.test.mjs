import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBindingCommand, parseBindingRead, parseParticipantScope, parseParticipantAuthority, parseSelfIndex, ElectiveSelfContractError } from './elective-self-contract.ts';
const id=n=>`73110500-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),pupilId:id(2)};
const command={...scope,commandId:id(3),expectedRevision:0,action:'save_binding',payload:{id:id(4),identityId:id(5),participant:'guardian',confirmationRequired:true,startsOn:'2026-10-01',endsOn:null,sourceReference:'school-case-42'}};
test('explicit guardian binding retains identity, source and required flag',()=>assert.deepEqual(parseBindingCommand(command),command));
test('binding rejects unknown keys, role forgery and malformed periods',()=>{
 for(const bad of [{...command,admin:true},{...command,payload:{...command.payload,participant:'larare'}},{...command,payload:{...command.payload,startsOn:'2026-02-30'}},{...command,payload:{...command.payload,endsOn:'2026-01-01'}},{...command,payload:{...command.payload,sourceReference:''}}])assert.throws(()=>parseBindingCommand(bad),ElectiveSelfContractError);
});
test('pupil binding cannot be marked as required guardian',()=>assert.throws(()=>parseBindingCommand({...command,payload:{...command.payload,participant:'pupil'}})));
test('participant scope never accepts identity or assignment from client',()=>{
 assert.deepEqual(parseParticipantScope({...scope,participant:'pupil'}),{...scope,participant:'pupil'});
 for(const k of ['identityId','assignmentId','sessionId','customerId'])assert.throws(()=>parseParticipantScope({...scope,participant:'pupil',[k]:id(9)}));
});
test('binding read and authority must match requested child and school',()=>{
 assert.deepEqual(parseBindingRead({contractVersion:'elective_binding_v1',...scope,bindings:[]},scope).bindings,[]);
 assert.throws(()=>parseBindingRead({contractVersion:'elective_binding_v1',...scope,unitId:id(9),bindings:[]},scope));
 const a={...scope,identityId:id(5),bindingId:id(4),customerId:id(6),organizerId:id(7),participant:'pupil',bindingRevision:1,confirmationRequired:false,epoch:1};
 assert.deepEqual(parseParticipantAuthority(a,{...scope,participant:'pupil'},id(5),1),a);
 assert.throws(()=>parseParticipantAuthority({...a,identityId:id(9)},{...scope,participant:'pupil'},id(5),1));
 assert.throws(()=>parseParticipantAuthority({...a,epoch:2},{...scope,participant:'pupil'},id(5),1));
});
test('own context index cannot contain duplicate bindings or unbounded information',()=>{
 const p={bindingId:id(4),...scope,schoolName:'Provskola',pupilName:'Prov Elev',participant:'guardian',bindingRevision:1,confirmationRequired:true};
 assert.equal(parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,participants:[p]}).participants[0].pupilName,'Prov Elev');
 assert.throws(()=>parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,participants:[p,p]}));
 assert.throws(()=>parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,participants:[{...p,personalNumber:'private'}]}));
});
