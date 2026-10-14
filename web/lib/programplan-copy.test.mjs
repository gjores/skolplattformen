import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with {type:'json'};
import {newCopyCommand,parseProgramplanCopyRequest,copyStatusForCommand,parseProgramplanCopyCreated} from './programplan-copy.ts';
const id=n=>`55101100-0000-4000-8000-${String(n).padStart(12,'0')}`;
const program=artifact.programs.find(p=>p.code==='VO25');
const input={unitId:id(1),name:'Vård och omsorg 2026',localCode:null,cohort:'2026–2029',basisReference:{catalogId:artifact.catalogId,programRef:{code:program.code,version:program.version},orientationCode:null,startedOn:'2026-08-17',specializationRefs:[],choiceBlocks:[{id:'iv1',kind:'individualChoice',points:200,name:'Individuellt val'}]}};
const source={sourcePlanId:id(8),expectedSourceRevision:7,expectedEducationRevision:3};
const command=()=>newCopyCommand({...input,...source},id(2));
function created(){const plan={id:id(4),offeringId:id(3),unitId:input.unitId,schoolName:'Syntetisk skola',education:{name:input.name,cohort:input.cohort,programCode:program.code,orientationCode:null},version:1,revision:0,status:'utkast',decidedOn:null,catalogId:artifact.catalogId,basisReference:input.basisReference,resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[{kind:'program_rules_unverified',blockId:'program',category:program.category}],decisionReady:false}};return{commandId:id(2),status:'created',education:{id:id(3),unitId:input.unitId,schoolName:plan.schoolName,kind:'gymnasium',name:input.name,localCode:null,cohort:input.cohort,startYear:2026,status:'planerad',programCode:program.code,orientationCode:null,latestVersion:1,draftId:plan.id},plan};}


test('copy binds source pins and rejects ambiguous or accessor input',()=>{
 const value=command();assert.deepEqual(value,{commandId:id(2),...input,...source});
 for(const changed of [{sourcePlanId:'missing'},{expectedSourceRevision:-1},{expectedEducationRevision:1.5},{expectedSourceRevision:2147483648},{expectedEducationRevision:'3'},{extra:'authority'}]) assert.throws(()=>parseProgramplanCopyRequest({...value,...changed}));
 const getter={...value};Object.defineProperty(getter,'sourcePlanId',{enumerable:true,get(){throw new Error('must not run');}});
 assert.throws(()=>parseProgramplanCopyRequest(getter),error=>error.message!=='must not run');
 assert.throws(()=>newCopyCommand({...input,...source,basisReference:{...input.basisReference,startedOn:'2026'}},id(2)));
});
test('copy status binds new education facts and never treats not_found as success',()=>{
 const request=command();assert.deepEqual(copyStatusForCommand({commandId:id(2),status:'not_found'},request),{commandId:id(2),status:'not_found'});
 assert.throws(()=>copyStatusForCommand({commandId:id(5),status:'not_found'},request));
 const result=created();assert.equal(copyStatusForCommand(result,request).plan.id,id(4));
 for(const changed of [{...input,name:'Other'}, {...input,unitId:id(9)}, {...input,cohort:'Other cohort'}, {...input,basisReference:{...input.basisReference,startedOn:'2026-08-18'}}]) assert.throws(()=>copyStatusForCommand(result,newCopyCommand({...changed,...source},id(2))));
});
test('copy receipt describes the initial draft, exact new identity and distinct decisions',()=>{
 const {status:_status,...receipt}=created();receipt.replayed=false;
 assert.equal(parseProgramplanCopyCreated(receipt,command()).plan.revision,0);
 for(const mutation of [r=>r.commandId=id(5),r=>r.plan.offeringId=id(7),r=>r.plan.status='faststalld',r=>r.plan.revision=1,r=>r.education.unitId=id(7),r=>r.plan.basisReference.startedOn='2026-08-18']){
  const changed=structuredClone(receipt);mutation(changed);assert.throws(()=>parseProgramplanCopyCreated(changed,command()));
 }
});
