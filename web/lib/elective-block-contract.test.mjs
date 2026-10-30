import test from 'node:test';
import assert from 'node:assert/strict';
import { parseElectiveSource, parseElectiveBlockDraft, parseElectiveCommand, parseElectiveRead,
  parseElectiveReceipt, parseElectiveStatusReply, electiveGroupSourceKey } from './elective-block-contract.ts';
const id=n=>`75300100-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2027};
const source=(n=2)=>({...scope,classId:id(n),className:'SA27A',sourceKey:`class_timplan:${id(n)}:2027:block:mosp`,rowKey:'block:mosp',
  label:'Moderna språk',linkRevision:1,timplanId:id(3),timplanVersion:2,seriesId:id(4),column:'ar1',schoolform:'gymnasium',
  needHt:2700,needVt:2700,needBasis:'terms',blockKind:'modernLanguage',allowedOptionCodes:['MODO1000X']});
const draft=()=>({id:id(10),kind:'modernLanguage',name:'Språkval SA27',startsOn:'2027-08-01',endsOn:'2028-06-30',sourceRefs:[source()],
  options:[{id:id(11),name:'Franska',subjectCode:'MODO',levelCode:'MODO1000X',language:'franska',points:100}],
  groups:[{id:id(12),optionId:id(11),name:'Franska 1',startsOn:'2027-08-01',endsOn:'2028-06-30',classIds:[id(2)],sourceKeys:[source().sourceKey],estimatedPupils:15}]});
const command=()=>({...scope,commandId:id(20),expectedRevision:1,action:'save_block',payload:{expectedBlockRevision:null,block:draft()}});
const invalid=run=>assert.throws(run,e=>e.name==='ElectiveBlockError');
test('block från exakt timplanskälla behåller gruppens egen identitet och faktiskt språk',()=>{
 assert.deepEqual(parseElectiveSource(source()),source());assert.deepEqual(parseElectiveBlockDraft(draft()),draft());
 assert.equal(electiveGroupSourceKey(id(12),2027),`teaching_group:${id(12)}:2027`);
 for(const patch of [{actorId:id(30)},{needHt:200},{classId:id(2)}])invalid(()=>parseElectiveBlockDraft({...draft(),...patch}));
});
test('okända eller ofullständiga källreferenser och klassnyckelmismatch nekas',()=>{
 for(const patch of [{linkRevision:0},{sourceKey:`class_timplan:${id(99)}:2027:block:mosp`},{timplanVersion:null},{rowKey:'x'},{blockKind:'elevensVal'},{column:'ar0'},{needHt:-1},{points:100}])invalid(()=>parseElectiveSource({...source(),...patch}));
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
test('kvittot och status binds till samma request och kan inte anta en annan handling',()=>{
 const q=command(),receipt={...scope,commandId:q.commandId,action:q.action,revision:2,objectId:id(10),objectRevision:1,replayed:false};
 assert.deepEqual(parseElectiveReceipt(receipt,q),receipt);
 invalid(()=>parseElectiveReceipt({...receipt,action:'set_policy'},q));invalid(()=>parseElectiveReceipt({...receipt,commandId:id(99)},q));
 assert.equal(parseElectiveStatusReply({...scope,commandId:q.commandId,status:'not_found',receipt:null},q).status,'not_found');
 invalid(()=>parseElectiveStatusReply({...scope,commandId:q.commandId,status:'found',receipt:null},q));
});
