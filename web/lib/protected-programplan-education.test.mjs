import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with {type:'json'};
import {newEducationCommand,educationStatusForCommand} from './protected-programplan-education.ts';
const id=n=>`55101100-0000-4000-8000-${String(n).padStart(12,'0')}`;
const program=artifact.programs.find(p=>p.code==='VO25');
const input={unitId:id(1),name:'Vård och omsorg 2026',localCode:null,cohort:'2026–2029',basisReference:{catalogId:artifact.catalogId,programRef:{code:program.code,version:program.version},orientationCode:null,startedOn:'2026-08-17',specializationRefs:[]}};
const command=()=>newEducationCommand(input,id(2));
function created(){const plan={id:id(4),offeringId:id(3),unitId:input.unitId,schoolName:'Syntetisk skola',education:{name:input.name,cohort:input.cohort,programCode:program.code,orientationCode:null},version:1,revision:0,status:'utkast',decidedOn:null,catalogId:artifact.catalogId,basisReference:input.basisReference,resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[{kind:'program_rules_unverified',blockId:'program',category:program.category}],decisionReady:false}};return{commandId:id(2),status:'created',education:{id:id(3),unitId:input.unitId,schoolName:plan.schoolName,kind:'gymnasium',name:input.name,localCode:null,cohort:input.cohort,startYear:2026,status:'planerad',programCode:program.code,orientationCode:null,latestVersion:1,draftId:plan.id},plan};}

test('one reviewed request retains caller UUID and exact source, date, ordered values',()=>{
 const value=command();assert.deepEqual(value,{commandId:id(2),...input});assert.throws(()=>newEducationCommand(input,'new-attempt'));
 assert.throws(()=>newEducationCommand({...input,basisReference:{...input.basisReference,startedOn:'2026'}},id(2)));
});
test('status not_found resolves only the same command and never implies success',()=>{
 assert.deepEqual(educationStatusForCommand({commandId:id(2),status:'not_found'},command()),{commandId:id(2),status:'not_found'});
 assert.throws(()=>educationStatusForCommand({commandId:id(5),status:'not_found'},command()));
 assert.throws(()=>educationStatusForCommand({},command()));
});
test('created receipt must match all originally reviewed education and basis facts before opening',()=>{
 const value=created();assert.equal(educationStatusForCommand(value,command()).plan.id,id(4));
 for(const changed of [{...input,name:'Different'}, {...input,localCode:'OTHER'}, {...input,cohort:'Other cohort'}, {...input,unitId:id(8)}, {...input,basisReference:{...input.basisReference,startedOn:'2026-08-18'}}, {...input,basisReference:{...input.basisReference,programRef:{...input.basisReference.programRef,version:program.version+1}}}]){
  assert.throws(()=>educationStatusForCommand(value,newEducationCommand(changed,id(2))));
 }
 assert.throws(()=>educationStatusForCommand({...value,commandId:id(5)},command()));
});
