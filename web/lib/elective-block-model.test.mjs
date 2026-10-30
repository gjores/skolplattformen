import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritElectiveTime, electiveChoiceState, validateElectiveSelection, electiveMembershipFingerprint } from './elective-block-model.ts';
const id=n=>`75300100-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source=(n=2)=>({unitId:id(1),schoolYear:2027,classId:id(n),className:'SA27A',sourceKey:`class_timplan:${id(n)}:2027:block:mosp`,frameSourceKey:`class_timplan:${id(n)}:2027:block:mosp`,timeDetailRef:null,rowKey:'block:mosp',label:'Språk',
 linkRevision:1,timplanId:id(3),timplanVersion:1,seriesId:id(4),column:'ar1',schoolform:'gymnasium',needHt:2700,needVt:2800,needBasis:'terms',blockKind:'modernLanguage',allowedOptionCodes:['MODO1000X']});
const round=()=>({id:id(10),blockId:id(11),blockRevision:1,revision:1,offeringRevision:1,policyRevision:1,guardianConfirmation:true,
 opensAt:'2027-01-01T00:00:00.000Z',closesAt:'2027-12-31T23:59:59.000Z',status:'open',minChoices:1,maxChoices:1,optionIds:[id(20),id(21)],pupilIds:[id(30)]});
const choice=()=>({id:id(40),roundId:id(10),pupilId:id(30),offeringRevision:1,revision:2,selectedOptionIds:[id(20)],submittedAt:'2027-03-01T10:00:00.000Z',confirmedAt:null});
const confirmation=(bindingId=id(50),decision='approve')=>({id:id(60),bindingId,bindingRevision:1,choiceId:id(40),choiceRevision:2,offeringRevision:1,decision,decidedAt:'2027-03-02T10:00:00.000Z'});
const required=[{bindingId:id(50),revision:1},{bindingId:id(51),revision:1}];
test('gemensam grupp ärver minuter en gång, aldrig summering, elevantal eller poäng',()=>{
 assert.deepEqual(inheritElectiveTime([source(),source(5)]),{needHt:2700,needVt:2800,needBasis:'terms'});
 assert.throws(()=>inheritElectiveTime([source(),{...source(5),needVt:2900}]),/elective_time_conflict/);
 assert.throws(()=>inheritElectiveTime([source(),{...source(5),unitId:id(99)}]),/elective_source_scope/);
});
test('ofullständig timplanstid är okänd och blir inte noll eller en känd annan klass',()=>{
 assert.throws(()=>inheritElectiveTime([]),/elective_source_missing/);
 assert.throws(()=>inheritElectiveTime([{...source(),needHt:null}]),/elective_time_missing/);
 assert.throws(()=>inheritElectiveTime([{...source(),needBasis:'points',needHt:100}]),/elective_/);
});
test('elevval följer erbjudandeversion, tid, uttryckligt urval och valomfattning',()=>{
 const r=round(),now='2027-03-01T10:00:00.000Z';assert.deepEqual(validateElectiveSelection(r,id(30),[id(20)],1,now),[id(20)]);
 for(const args of [[id(99),[id(20)],1,now],[id(30),[id(99)],1,now],[id(30),[id(20)],2,now],[id(30),[id(20)],1,'2028-01-01T00:00:00.000Z'],[id(30),[],1,now],[id(30),[id(20),id(20)],1,now]])assert.throws(()=>validateElectiveSelection(r,...args));
});
test('båda erforderliga VH behövs och gammalt val/bindning kan inte godkänna nytt val',()=>{
 const c=choice(),r=round();assert.equal(electiveChoiceState(c,r,required,[confirmation()]),'awaiting_guardian');
 assert.equal(electiveChoiceState(c,r,required,[confirmation(),confirmation(id(51))]),'ready_for_confirmation');
 assert.equal(electiveChoiceState({...c,revision:3},r,required,[confirmation(),confirmation(id(51))]),'awaiting_guardian');
 assert.equal(electiveChoiceState(c,r,[{bindingId:id(50),revision:2}],[confirmation()]),'awaiting_guardian');
 assert.equal(electiveChoiceState(c,r,required,[confirmation(),confirmation(id(51),'decline')]),'guardian_declined');
});
test('avstängd policy hoppar över VH utan falsk signatur; på utan kända relationer är blockerad',()=>{
 assert.equal(electiveChoiceState(choice(),{...round(),guardianConfirmation:false},[],[]),'ready_for_confirmation');
 assert.equal(electiveChoiceState(choice(),round(),[],[]),'guardian_bindings_missing');
 assert.equal(electiveChoiceState(choice(),{...round(),guardianConfirmation:null},[],[]),'policy_missing');
 assert.equal(electiveChoiceState({...choice(),offeringRevision:2},round(),required,[]),'stale_offer');
});
test('medlemsfingeravtryck upptäcker utbytt elev vid samma antal och är ordningsoberoende',async()=>{
 const a=[{pupilId:id(30),startsOn:'2027-08-01',endsOn:'2028-06-30'},{pupilId:id(31),startsOn:'2027-08-01',endsOn:'2028-06-30'}];
 assert.equal(await electiveMembershipFingerprint(a),await electiveMembershipFingerprint([...a].reverse()));
 assert.notEqual(await electiveMembershipFingerprint(a),await electiveMembershipFingerprint([a[0],{...a[1],pupilId:id(32)}]));
 assert.notEqual(await electiveMembershipFingerprint(a),await electiveMembershipFingerprint([a[0],{...a[1],endsOn:'2028-05-30'}]));
});
