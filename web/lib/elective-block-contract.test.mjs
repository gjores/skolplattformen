import test from 'node:test';
import assert from 'node:assert/strict';
import { parseElectiveSource, parseElectiveBlockDraft, parseElectiveCommand, parseElectiveRead,
  parseElectiveReceipt, parseElectiveStatusReply, electiveGroupSourceKey, createElectiveCommandRef, parseElectiveCommandRef } from './elective-block-contract.ts';
const id=n=>`75300100-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2027};
const source=(n=2)=>({...scope,classId:id(n),className:'SA27A',sourceKey:`class_timplan:${id(n)}:2027:block:mosp`,frameSourceKey:`class_timplan:${id(n)}:2027:block:mosp`,timeDetailRef:null,rowKey:'block:mosp',
  label:'Moderna språk',linkRevision:1,timplanId:id(3),timplanVersion:2,seriesId:id(4),column:'ar1',schoolform:'gymnasium',
  needHt:2700,needVt:2700,needBasis:'terms',blockKind:'modernLanguage',allowedOptionCodes:['MODO1000X']});
const draft=()=>({id:id(10),kind:'modernLanguage',name:'Språkval SA27',startsOn:'2027-07-01',endsOn:'2028-06-30',sourceRefs:[source()],
  options:[{id:id(11),name:'Franska',subjectCode:'MODO',levelCode:'MODO1000X',language:'fr',points:100}],
  groups:[{id:id(12),optionId:id(11),name:'Franska 1',startsOn:'2027-07-01',endsOn:'2028-06-30',classIds:[id(2)],sourceKeys:[source().sourceKey],estimatedPupils:15}]});
const command=()=>({...scope,commandId:id(20),expectedRevision:1,action:'save_block',payload:{expectedBlockRevision:null,block:draft()}});
const invalid=run=>assert.throws(run,e=>e.name==='ElectiveBlockError');
test('block från exakt timplanskälla behåller gruppens egen identitet och faktiskt språk',()=>{
 assert.deepEqual(parseElectiveSource(source()),source());assert.deepEqual(parseElectiveBlockDraft(draft()),draft());
 assert.equal(electiveGroupSourceKey(id(12),2027),`teaching_group:${id(12)}:2027`);
 for(const patch of [{actorId:id(30)},{needHt:200},{classId:id(2)}])invalid(()=>parseElectiveBlockDraft({...draft(),...patch}));
});
test('okända eller ofullständiga källreferenser och klassnyckelmismatch nekas',()=>{
 for(const patch of [{linkRevision:-1},{sourceKey:`class_timplan:${id(99)}:2027:block:mosp`},{timplanVersion:null},{rowKey:'x'},{blockKind:'elevensVal'},{column:'ar0'},{needHt:-1},{points:100}])invalid(()=>parseElectiveSource({...source(),...patch}));
});
test('dubbel identitet, saknat språk och orelaterad grupp/klass accepteras inte',()=>{
 const d=draft();
 invalid(()=>parseElectiveBlockDraft({...d,options:[{...d.options[0],language:null}]}));
 invalid(()=>parseElectiveBlockDraft({...d,options:[d.options[0],d.options[0]]}));
 invalid(()=>parseElectiveBlockDraft({...d,groups:[{...d.groups[0],optionId:id(99)}]}));
 invalid(()=>parseElectiveBlockDraft({...d,groups:[{...d.groups[0],classIds:[id(99)]}]}));
 invalid(()=>parseElectiveBlockDraft({...d,options:[{...d.options[0],levelCode:'OUTSIDE1000X'}]}));
 invalid(()=>parseElectiveBlockDraft({...d,startsOn:'2027-02-30'}));
});
test('ett alternativ kan ha flera grupper och en grupp kan samla flera klasser',()=>{
 const d=draft(),s2=source(5);d.sourceRefs.push(s2);d.groups[0].classIds.push(id(5));d.groups[0].sourceKeys.push(s2.sourceKey);
 d.groups.push({...d.groups[0],id:id(13),name:'Franska 2'});assert.deepEqual(parseElectiveBlockDraft(d),d);
});
test('strikt command scope och policy kräver uttryckligt booleskt beslut',()=>{
 assert.deepEqual(parseElectiveCommand(command()),command());
 assert.equal(parseElectiveCommand({...scope,commandId:id(20),expectedRevision:1,action:'set_policy',payload:{guardianConfirmation:false}}).payload.guardianConfirmation,false);
 invalid(()=>parseElectiveCommand({...scope,commandId:id(20),expectedRevision:1,action:'set_policy',payload:{guardianConfirmation:null}}));
 invalid(()=>parseElectiveCommand({...command(),identityId:id(90)}));invalid(()=>parseElectiveCommand({...command(),action:'unknown'}));
 invalid(()=>parseElectiveCommand({...command(),schoolYear:2028}));
});
test('read scope måste vara samma skola/år och elevnamn kräver uttrycklig läsförmåga',()=>{
 const r={contractVersion:'elective_block_v1',...scope,schoolName:'Provskola',revision:1,canManage:true,canReadPupils:false,
 policy:{unitId:id(1),revision:1,guardianConfirmation:null},sources:[source()],blocks:[],pupils:null,rounds:[],choices:null,placements:null};
 assert.deepEqual(parseElectiveRead(r,scope),r);invalid(()=>parseElectiveRead(r,{...scope,unitId:id(99)}));
 invalid(()=>parseElectiveRead({...r,pupils:[{id:id(50),name:'Prov Elev',classIds:[id(2)]}]},scope));
 invalid(()=>parseElectiveRead({...r,sourceRefs:[]},scope));
});
test('kvittot och status binds till samma request och kan inte anta en annan handling',async()=>{
 const q=await createElectiveCommandRef(command()),receipt={...scope,commandId:q.commandId,action:q.action,payloadHash:q.payloadHash,revision:2,objectId:id(10),objectRevision:1,replayed:false};
 assert.deepEqual(parseElectiveReceipt(receipt,q),receipt);
 invalid(()=>parseElectiveReceipt({...receipt,action:'set_policy'},q));invalid(()=>parseElectiveReceipt({...receipt,commandId:id(99)},q));
 assert.equal(parseElectiveStatusReply({...scope,commandId:q.commandId,status:'not_found',receipt:null},q).status,'not_found');
 invalid(()=>parseElectiveStatusReply({...scope,commandId:q.commandId,status:'found',receipt:null},q));
});

test('GR och IM bevarar sina riktiga kolumner och initial länk-revision noll',()=>{
 assert.equal(parseElectiveSource({...source(),linkRevision:0,schoolform:'grundskola',column:'ak7',blockKind:'languageChoice'}).column,'ak7');
 assert.equal(parseElectiveSource({...source(),schoolform:'introduktionsprogram',column:'vecka',needBasis:'weekly_calendar'}).column,'vecka');
 invalid(()=>parseElectiveSource({...source(),schoolform:'grundskola',column:'ar1'}));
});

test('statusreferensen innehåller inga elevval men upptäcker ändrad payload eller revision',async()=>{
 const q=command(),ref=await createElectiveCommandRef(q);assert.deepEqual(parseElectiveCommandRef(ref),ref);
 assert.equal(Object.hasOwn(ref,'payload'),false);assert.equal(Object.hasOwn(ref,'expectedRevision'),false);
 assert.notEqual((await createElectiveCommandRef({...q,expectedRevision:2})).payloadHash,ref.payloadHash);
 assert.notEqual((await createElectiveCommandRef({...q,payload:{...q.payload,block:{...q.payload.block,name:'Annat block'}}})).payloadHash,ref.payloadHash);
 const receipt={...ref,revision:2,objectId:id(10),objectRevision:1,replayed:false};
 invalid(()=>parseElectiveReceipt({...receipt,payloadHash:'a'.repeat(64)},ref));
 invalid(()=>parseElectiveCommandRef({...ref,payload:q.payload}));
});

test('kortare grupp eller block får inte ärva hela tillämpningsårets timmar',()=>{
 const d=draft();invalid(()=>parseElectiveBlockDraft({...d,startsOn:'2027-08-01'}));
 invalid(()=>parseElectiveBlockDraft({...d,groups:[{...d.groups[0],startsOn:'2027-08-01'}]}));
 invalid(()=>parseElectiveBlockDraft({...d,groups:[{...d.groups[0],endsOn:'2027-12-31'}]}));
});

test('språkidentitet är kanonisk medan svenska/engelska i GR inte kräver modernt språk',()=>{
 const d=draft();invalid(()=>parseElectiveBlockDraft({...d,options:[{...d.options[0],language:'Franska'}]}));
 const ref={...source(),schoolform:'grundskola',column:'ak7',blockKind:'languageChoice',allowedOptionCodes:['GRGRSVE01','GRGRENG01','GRGRMSP01']};
 const option={...d.options[0],subjectCode:'GRGRSVE01',levelCode:'GRGRSVE01',language:null,points:null};
 assert.equal(parseElectiveBlockDraft({...d,kind:'languageChoice',sourceRefs:[ref],options:[option]}).options[0].language,null);
 assert.equal(parseElectiveBlockDraft({...d,kind:'languageChoice',sourceRefs:[ref],options:[{...option,subjectCode:'GRGRENG01',levelCode:'GRGRENG01'}]}).options[0].language,null);
 invalid(()=>parseElectiveBlockDraft({...d,kind:'languageChoice',sourceRefs:[ref],options:[{...option,subjectCode:'GRGRMSP01',levelCode:'GRGRMSP01'}]}));
});
test('en position har egen nyckel och exakt fryst detaljreferens, inte en falsk timplansrad',()=>{
 const s=source(),positionId=id(40),withPosition={...s,sourceKey:s.frameSourceKey+':position:'+positionId,timeDetailRef:{id:id(41),revision:2,positionId}};
 assert.deepEqual(parseElectiveSource(withPosition),withPosition);
 invalid(()=>parseElectiveSource({...withPosition,sourceKey:s.frameSourceKey}));
 invalid(()=>parseElectiveSource({...withPosition,timeDetailRef:{...withPosition.timeDetailRef,revision:0}}));
 const d=draft();invalid(()=>parseElectiveBlockDraft({...d,sourceRefs:[s,withPosition]}));
});
