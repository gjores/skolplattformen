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
 assert.equal(parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,identityReference:id(4),participants:[p]}).participants[0].pupilName,'Prov Elev');
 assert.throws(()=>parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,identityReference:id(4),participants:[p,p]}));
 assert.throws(()=>parseSelfIndex({contractVersion:'elective_self_v1',epoch:1,identityReference:id(4),participants:[{...p,personalNumber:'private'}]}));
});

const {parseSelfRead,parseSelfCommand,createSelfCommandRef,parseSelfReceipt,parseSelfStatus}=await import('./elective-self-contract.ts');
const participant={bindingId:id(4),...scope,schoolName:'Provskola',pupilName:'Prov Elev',participant:'pupil',bindingRevision:1,confirmationRequired:false};
const ownRead={contractVersion:'elective_self_v1',epoch:1,participant,policy:{unitId:scope.unitId,revision:1,guardianConfirmation:false},offers:[],choices:[],confirmations:[],placements:[]};
test('self read rejects full class list or another child projection',()=>{
 assert.equal(parseSelfRead(ownRead,{...scope,participant:'pupil'}).offers.length,0);
 assert.throws(()=>parseSelfRead({...ownRead,pupils:[]},{...scope,participant:'pupil'}));
 assert.throws(()=>parseSelfRead({...ownRead,participant:{...participant,pupilId:id(99)}},{...scope,participant:'pupil'}));
});
test('own read rejects other guardian confirmation and unrelated choice',()=>{
 const choice={id:id(7),roundId:id(8),pupilId:id(99),offeringRevision:1,revision:1,selectedOptionIds:[id(9)],submittedAt:'2026-10-31T00:00:00.000Z',confirmedAt:null,state:'ready_for_confirmation'};
 assert.throws(()=>parseSelfRead({...ownRead,choices:[choice]},{...scope,participant:'pupil'}));
});
test('self command action cannot be forged between pupil and guardian',async()=>{
 const q={...scope,participant:'pupil',expectedBindingRevision:1,commandId:id(9),action:'submit_choice',payload:{roundId:id(8),offeringRevision:1,expectedChoiceRevision:null,selectedOptionIds:[id(7)]}};
 assert.deepEqual(parseSelfCommand(q),q);assert.throws(()=>parseSelfCommand({...q,participant:'guardian'}));
 const ref=await createSelfCommandRef(q);assert.match(ref.payloadHash,/^[0-9a-f]{64}$/);assert.equal(Object.hasOwn(ref,'payload'),false);
 const receipt={...ref,identityId:id(5),bindingId:id(4),bindingRevision:1,choiceId:id(6),choiceRevision:1,replayed:false};
 assert.deepEqual(parseSelfReceipt(receipt,ref,{identityId:id(5),bindingId:id(4)}),receipt);
 assert.throws(()=>parseSelfReceipt({...receipt,bindingId:id(99)},ref,{identityId:id(5),bindingId:id(4)}));
 assert.throws(()=>parseSelfReceipt({...receipt,payloadHash:'0'.repeat(64)},ref));
 assert.equal(parseSelfStatus({...scope,participant:'pupil',commandId:ref.commandId,status:'not_found',receipt:null},ref).status,'not_found');
});

test('binding recovery persists only reference and verifies original actor/hash on receipt',async()=>{
 const {createBindingCommandRef,parseBindingCommandRef,parseBindingStatusReply}=await import('./elective-self-contract.ts');
 const ref=await createBindingCommandRef(command);assert.deepEqual(Object.keys(ref).sort(),['action','commandId','payloadHash','pupilId','unitId']);assert.deepEqual(parseBindingCommandRef(ref),ref);
 assert.throws(()=>parseBindingCommandRef({...ref,payload:command.payload}));
 const actor={identityId:id(8),assignmentId:id(9)},binding={...scope,...command.payload,revision:1,revokedAt:null,attestedByAssignmentId:id(9)};
 const reply={status:'done',receipt:{commandId:command.commandId,...actor,bindingId:binding.id,bindingRevision:1,request:command},binding};
 assert.equal((await parseBindingStatusReply(reply,ref,actor)).status,'done');
 await assert.rejects(()=>parseBindingStatusReply(reply,{...ref,payloadHash:'0'.repeat(64)},actor));
 await assert.rejects(()=>parseBindingStatusReply(reply,ref,{...actor,identityId:id(7)}));
});

test('kvittot kräver faktiskt sparad kontorelation och ny revision, inte bara korrekt requestecho',async()=>{
 const{parseBindingReply}=await import('./elective-self-contract.ts');
 const actor={identityId:id(8),assignmentId:id(9)},binding={...scope,...command.payload,revision:1,revokedAt:null,attestedByAssignmentId:id(9)};
 const receipt={commandId:command.commandId,...actor,bindingId:binding.id,bindingRevision:1,request:command};
 for(const patch of [{identityId:id(7)},{participant:'pupil',confirmationRequired:false},{sourceReference:'annan-källa'},{startsOn:'2026-10-02'},{endsOn:'2026-12-31'}])assert.throws(()=>parseBindingReply({status:'done',receipt,binding:{...binding,...patch}},command,actor));
 assert.throws(()=>parseBindingReply({status:'done',receipt:{...receipt,bindingRevision:3},binding:{...binding,revision:3}},command,actor));
 const revoke={...scope,commandId:id(11),expectedRevision:1,action:'revoke_binding',payload:{id:binding.id}};
 assert.throws(()=>parseBindingReply({status:'done',receipt:{...receipt,commandId:revoke.commandId,bindingRevision:2,request:revoke},binding:{...binding,revision:2}},revoke,actor));
});
