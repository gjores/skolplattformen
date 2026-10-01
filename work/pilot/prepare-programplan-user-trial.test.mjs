import test from 'node:test';
import assert from 'node:assert/strict';
import {requireTrialSchool,requireOwnedTrialEducation,trialEducationSpecs} from './prepare-programplan-user-trial.mjs';
import {verifyInitialTrialPlan,selectCurrentTrialPlan} from './verify-programplan-user-trial.mjs';
const school={unit_id:'33000000-0000-4000-8000-000000000111',customer_id:'33000000-0000-4000-8000-000000000001',customer_name:'Syntetisk fas 3 kund 1',school_name:'Syntetisk skola 11',organizer_id:'synthetic-organizer'};
test('imports have no database effect; target and ownership guards refuse unrelated rows',()=>{
  assert.equal(requireTrialSchool(school),'synthetic-organizer');
  for(const field of ['unit_id','customer_id','customer_name','school_name'])assert.throws(()=>requireTrialSchool({...school,[field]:'other'}),/REFUSED/u);
  assert.throws(()=>requireTrialSchool(null),/REFUSED/u);
  const spec=trialEducationSpecs[0];
  const owned={id:'55100110-0000-4000-8000-000000000040',organizer_id:'synthetic-organizer',unit_id:school.unit_id,kind:'gymnasium',name:spec.name,program_code:'SA25',orientation_code:'SASAP'};
  requireOwnedTrialEducation(owned,spec,'synthetic-organizer');
  for(const field of Object.keys(owned))assert.throws(()=>requireOwnedTrialEducation({...owned,[field]:'other'},spec,'synthetic-organizer'),/REFUSED/u);
  assert.equal(new Set(trialEducationSpecs.map(s=>s.number)).size,4);
  assert.equal(Object.isFrozen(trialEducationSpecs),true);
});

test('initial readiness refuses missing or changed trial scenarios',()=>{
  const catalogId='sha256:'+'a'.repeat(64),id=n=>`55100110-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const empty={education:{latestVersion:0,draftId:null},versionCount:0,versions:[]};
  assert.equal(verifyInitialTrialPlan(empty,trialEducationSpecs[0],catalogId),null);
  for(const spec of trialEducationSpecs.slice(1)){
    assert.throws(()=>verifyInitialTrialPlan(empty,spec,catalogId),/REFUSED/u);
    const bound=spec.plan===51,locked=spec.plan===52;
    const basis={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SASAP',startedOn:'2026-08-17',specializationRefs:[{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100}]};
    const p={id:id(spec.plan),version:1,revision:0,status:locked?'faststalld':'utkast',decidedOn:locked?'2026-09-01':null,
      catalogId:bound?catalogId:null,basisReference:bound?basis:null,legacySpecialization:bound?null:['ANIM1000X']};
    const w={education:{latestVersion:1,draftId:locked?null:p.id},versionCount:1,versions:[p]};
    assert.equal(verifyInitialTrialPlan(w,spec,catalogId),p);
    for(const patch of [{status:'ersatt'},{revision:1},{catalogId:'sha256:'+'b'.repeat(64)},{decidedOn:'2026-09-02'}])
      assert.throws(()=>verifyInitialTrialPlan({...w,versions:[{...p,...patch}]},spec,catalogId),/REFUSED/u);
    assert.throws(()=>verifyInitialTrialPlan({...w,versions:[{...p,basisReference:bound?{...basis,startedOn:'2026-08-01'}:null,legacySpecialization:bound?null:['ANIM1000X','SYNTETISK_OKAND']}]},spec,catalogId),/REFUSED/u);
  }
});

test('current readiness preserves human changes and selects exact off-page draft or latest version',()=>{
  const latest={id:'latest',version:60,revision:2,status:'faststalld'};
  const draft={id:'draft',version:1,revision:7,status:'utkast',legacySpecialization:['changed','changed']};
  const w={education:{latestVersion:60,draftId:'draft'},versionCount:2,versions:[latest]};
  assert.equal(selectCurrentTrialPlan(w,[latest,draft]),draft);
  assert.equal(selectCurrentTrialPlan({...w,education:{...w.education,draftId:null}},[draft,latest]),latest);
  assert.throws(()=>selectCurrentTrialPlan(w,[latest]),/REFUSED/u);
  assert.throws(()=>selectCurrentTrialPlan(w,[latest,{...draft,status:'ersatt'}]),/REFUSED/u);
  assert.throws(()=>selectCurrentTrialPlan({...w,education:{latestVersion:61,draftId:null}},[latest,draft]),/REFUSED/u);
  assert.equal(selectCurrentTrialPlan({education:{latestVersion:0,draftId:null},versionCount:0},[]),null);
});
