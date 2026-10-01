import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with { type: 'json' };
import { programplanOptions, resolveLegacyProgramplan, newProgramplanBasis, programplanCommand, programplanCommandReply,
  sameProgramplanLevels, sameProgramplanPin, programplanReference, programplanSelectedId, assertProgramplanSummary, programplanLevelName } from './protected-programplan.ts';

const offeringId = '55101100-0000-4000-8000-000000000040', planId = '55101100-0000-4000-8000-000000000050';
const program = artifact.programs.find(p=>p.code==='SA25');
const orientationCode = 'SASAP';
const workspace = () => ({education:{id:offeringId,programCode:'SA25',orientationCode,latestVersion:3,draftId:null},
  catalog:{status:'selected',catalogId:artifact.catalogId,program,subjects:artifact.subjects}});
const first = () => programplanOptions(workspace()).find(r=>r.itemCode==='ANIM1000X');
const ref = () => programplanReference(first());
const basis = () => newProgramplanBasis(workspace(),'2026-08-17',[ref()]);
const draft = (kind='replace') => ({kind,offeringId,planId,expectedRevision:2,expectedLatestVersion:3,
  pin:{...basis(),specializationRefs:undefined},startedOn:'2026-08-17',sourceBound:true,legacyConfirmed:false,refs:[ref()]});
function cleanDraft(kind='replace') { const d=draft(kind);delete d.pin.specializationRefs;return d; }
const result = () => ({id:planId,offeringId,unitId:offeringId,schoolName:'Syntetisk skola',education:{name:'SA',cohort:'Fri kulltext',programCode:'SA25',orientationCode},
  version:3,revision:3,status:'utkast',decidedOn:null,catalogId:artifact.catalogId,basisReference:basis(),resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[{kind:'program_rules_unverified',blockId:'program',category:program.category}],decisionReady:false}});

test('options use exact subject versions, names and source points and exclude all fixed levels',()=>{
  const w=workspace(), options=programplanOptions(w),fixed=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.find(o=>o.code===orientationCode).subjects].flatMap(s=>s.levels.map(l=>l.code)));
  assert.ok(options.length>0);assert.ok(first());
  for(const r of options){assert.ok(!fixed.has(r.itemCode));const s=artifact.subjects.find(s=>s.code===r.subjectCode);assert.equal(s.version,r.subjectVersion);assert.equal(s.items.find(i=>i.code===r.itemCode).points,r.points);assert.ok(r.name);assert.ok(r.subjectName);}
  w.catalog.status='blocked';assert.deepEqual(programplanOptions(w),[]);
});
test('legacy resolution preserves stored order and never silently accepts unknown, duplicate or ambiguous codes',()=>{
  const options=programplanOptions(workspace()), a=options[0],b=options[1];
  assert.deepEqual(resolveLegacyProgramplan([b.itemCode,a.itemCode],options),{refs:[programplanReference(b),programplanReference(a)],problems:[]});
  assert.deepEqual(resolveLegacyProgramplan(['UNKNOWN',a.itemCode,a.itemCode],options).problems,['UNKNOWN',a.itemCode]);
  assert.deepEqual(resolveLegacyProgramplan([a.itemCode],[a,{...a,subjectVersion:a.subjectVersion+1}]).problems,[a.itemCode]);
});
test('new basis requires explicit selected catalog and real calendar date, not cohort or year',()=>{
  assert.equal(basis().startedOn,'2026-08-17');assert.equal(basis().programRef.version,program.version);assert.equal(basis().catalogId,artifact.catalogId);
  for(const date of ['','2026','2026-02-30','Fri kulltext'])assert.throws(()=>newProgramplanBasis(workspace(),date,[]));
  const w=workspace();w.catalog.status='unselected';assert.throws(()=>newProgramplanBasis(w,'2026-08-17',[]));
});
test('ordered comparisons preserve order and distinguish frozen reference identity from mutable choices',()=>{
  const a=basis(),b={...a,specializationRefs:[]};assert.ok(sameProgramplanPin(a,b));assert.ok(!sameProgramplanLevels(a.specializationRefs,b.specializationRefs));
  assert.ok(!sameProgramplanPin(a,{...a,startedOn:'2026-08-18'}));assert.ok(!sameProgramplanPin(a,{...a,programRef:{...a.programRef,version:a.programRef.version+1}}));assert.ok(!sameProgramplanPin(a,null));
  const refs=[ref(),{...ref(),itemCode:'SECOND'}];assert.ok(!sameProgramplanLevels(refs,[...refs].reverse()));
});
test('commands send exact five-route requests and preserve legacy confirmation and clone pin policy',()=>{
  const replace=programplanCommand(cleanDraft());assert.equal(replace.route,'/api/programplaner/fordjupning');assert.deepEqual(Object.keys(replace.body),['planId','expectedRevision','specializationRefs']);
  const create=cleanDraft('create');create.planId=null;assert.equal(programplanCommand(create).body.expectedLatestVersion,3);
  const bind=cleanDraft('bind');assert.throws(()=>programplanCommand(bind));bind.legacyConfirmed=true;assert.equal(programplanCommand(bind).route,'/api/programplaner/binda');
  const clone=cleanDraft('clone');assert.equal(programplanCommand(clone).body.explicitLegacyBasis,null);clone.sourceBound=false;assert.throws(()=>programplanCommand(clone));clone.legacyConfirmed=true;assert.deepEqual(programplanCommand(clone).body.explicitLegacyBasis,basis());
});
test('successful write reply must match actual offering, ordered values, frozen pin and CAS',()=>{
  const d=cleanDraft(),r=result();assert.equal(programplanCommandReply(r,d).id,planId);
  for(const change of [{revision:2},{offeringId:'55101100-0000-4000-8000-000000000041'},{status:'faststalld'},{basisReference:{...basis(),startedOn:'2026-08-18'}},{resolution:{...r.resolution,decisionReady:true}}])assert.throws(()=>programplanCommandReply({...r,...change},d));
  assert.throws(()=>programplanCommandReply({...r,basisReference:{...basis(),specializationRefs:[]}},d));
});
test('create and clone accept only new server IDs and latest+1/revision0; copied source remains distinct',()=>{
  const d=cleanDraft('clone'),r={...result(),id:'55101100-0000-4000-8000-000000000070',version:4,revision:0};assert.equal(programplanCommandReply(r,d).id,r.id);
  for(const change of [{id:planId},{version:3},{revision:1}])assert.throws(()=>programplanCommandReply({...r,...change},d));
  d.kind='create';d.planId=null;assert.equal(programplanCommandReply(r,d).version,4);
});

test('current selection uses actual draft ID beyond the history page, exact latest ID and explicit old ID',()=>{
  const older='55101100-0000-4000-8000-000000000051';
  const w={...workspace(),versionCount:53,versions:[{id:older,version:53,status:'ersatt'}]};
  w.education.latestVersion=53;w.education.draftId=planId;
  assert.equal(programplanSelectedId(w,null),planId);
  assert.equal(programplanSelectedId(w,older),older);
  w.education.draftId=null;assert.equal(programplanSelectedId(w,null),older);
  w.versions=[{id:planId,version:1}];assert.throws(()=>programplanSelectedId(w,null));
  assert.equal(programplanSelectedId(w,null,[...w.versions,{id:older,version:53}]),older);
  assert.throws(()=>programplanSelectedId(w,null,[{id:older,version:53},{id:planId,version:53}]));
  w.education.latestVersion=0;assert.throws(()=>programplanSelectedId(w,null));
  w.versionCount=0;w.versions=[];assert.equal(programplanSelectedId(w,null),null);
});

test('separate selected summary must match actual read; absent or changed summary is never empty legacy data',()=>{
  const r=result(),summary={id:r.id,version:r.version,revision:r.revision,status:r.status,catalogId:r.catalogId,decidedOn:r.decidedOn,basisReference:r.basisReference,legacySpecialization:null};
  assert.doesNotThrow(()=>assertProgramplanSummary(summary,r));
  for(const changed of [null,{...summary,id:'other'},{...summary,revision:2},{...summary,status:'ersatt'},
    {...summary,basisReference:{...basis(),startedOn:'2026-08-18'}},{...summary,basisReference:{...basis(),specializationRefs:[]}},
    {...summary,catalogId:null,basisReference:null}])assert.throws(()=>assertProgramplanSummary(changed,r));
  const legacy={...r,catalogId:null,basisReference:null};
  assert.doesNotThrow(()=>assertProgramplanSummary({...summary,catalogId:null,basisReference:null,legacySpecialization:['UNKNOWN','ENGE3000X','ENGE3000X']},legacy));
});

test('saved level names require exact source identity, version and points; ambiguous names stay raw',()=>{
  const option=first(),r=ref();assert.equal(programplanLevelName(r,[option]),`${option.subjectName} · ${option.name}`);
  for(const choices of [[],[{...option,subjectVersion:2}],[{...option,points:200}],[option,{...option,name:'Other'}]])assert.equal(programplanLevelName(r,choices),r.itemCode);
});
