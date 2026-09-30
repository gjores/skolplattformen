import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syllabusSnapshot } from './syllabus-snapshot.ts';
import { canonicalCatalogJson, projectProgramplanCatalog, parseProgramplanCatalog, verifyProgramplanCatalog,
  parseProgramplanBasisReference, resolveProgramplanBasis } from './programplan-catalog.ts';
const payload=projectProgramplanCatalog(syllabusSnapshot);
const raw={...payload,catalogId:`sha256:${createHash('sha256').update(canonicalCatalogJson(payload),'utf8').digest('hex')}`};
const catalog=await verifyProgramplanCatalog(raw);
async function syntheticCatalog(change){
  const snapshot={source:'https://catalog.example.test/v1',apiVersion:'synthetic-1',fetched:'2026-09-05',schoolTypes:['gy'],
    subjects:[{code:'TEST',name:'Syntetiskt ämne',typeOfSyllabus:'GRADE_SUBJECT_SYLLABUS',schoolTypes:['GY'],version:1,startDate:'2026-01-01',items:[{code:'TEST1000X',name:'Nivå 1',points:100}]}],
    programs:[{code:'TP25',name:'Syntetiskt program',category:'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION',version:1,startDate:'2026-01-01',foundation:[{code:'TEST',name:'Syntetiskt ämne',points:100,optional:false,levels:[{code:'TEST1000X',name:'Nivå 1',points:100}]}],programmeSpecific:[],orientations:[],specialization:[]}]};
  change?.(snapshot);const payload=projectProgramplanCatalog(snapshot);
  const artifact={...payload,catalogId:`sha256:${createHash('sha256').update(canonicalCatalogJson(payload)).digest('hex')}`};
  return verifyProgramplanCatalog(artifact);
}
const reference=(code='SA25',orientationCode='SABEP')=>({catalogId:catalog.catalogId,programRef:{code,version:catalog.programs.find(p=>p.code===code).version},orientationCode,startedOn:'2026-08-01',specializationRefs:[]});
const issue=(input,expected)=>{const r=resolveProgramplanBasis(catalog,input);assert.equal(r.status,'blocked');assert.equal(r.basis,null);assert.ok(r.diagnostics.some(d=>d.code===expected),JSON.stringify(r.diagnostics));assert.equal(r.decisionReady,false);assert.equal(r.writeReady,false);};
test('actual SA, EK, ES references retain levels, exact subject pins and unresolved alternatives',()=>{
  for(const [code,orientation] of [['SA25','SABEP'],['EK25','EKEKI'],['ES25','ESBIF']]){
    const r=resolveProgramplanBasis(catalog,reference(code,orientation));assert.equal(r.status,'resolved');
    assert.equal(r.basis.program.code,code);assert.equal(r.basis.orientation.code,orientation);
    const levels=r.basis.nationalBlocks.flatMap(b=>b.levels);
    assert.ok(levels.some(l=>l.itemCode==='SVEN1000X'&&l.optional));assert.ok(levels.some(l=>l.itemCode==='SVEA1000X'&&l.optional));
    assert.ok(r.unresolvedChoices.some(c=>c.kind==='optional_subject'&&c.subjectCode==='SVEN'));
    assert.ok(r.unresolvedChoices.some(c=>c.kind==='optional_subject'&&c.subjectCode==='SVEA'));
    assert.ok(r.unresolvedChoices.some(c=>c.kind==='program_rules_unverified'));
    assert.equal(r.decisionReady,false);assert.equal(r.writeReady,false);assert.equal('totalPoints'in r.basis,false);
    assert.equal('requiredSpecializationPoints'in r.basis,false);assert.equal('guaranteedHours'in r.basis,false);
    assert.ok(Object.isFrozen(r.basis.nationalBlocks[0].levels));
    for(const level of levels){const s=catalog.subjects.find(s=>s.code===level.subjectCode&&s.version===level.subjectVersion);
      assert.equal(s.items.find(i=>i.code===level.itemCode).points,level.points);}
    if(code==='SA25'||code==='EK25'){
      assert.ok(r.unresolvedChoices.some(c=>c.kind==='subject_levels_unresolved'&&c.subjectCode==='MOSP'));
      assert.equal(levels.some(l=>l.itemCode==='MOSP'),false);
    }
  }
});
test('invalid orientation cannot disappear or fabricate a specialization remainder',()=>{
  for(const orientation of ['UNKNOWN','EKEKI'])issue({...reference(),orientationCode:orientation},'orientation_not_found');
  issue({...reference(),orientationCode:null},'orientation_required');
  issue({...reference(),programRef:{code:'MISSING',version:1}},'program_not_found');
  issue({...reference(),programRef:{code:'SA25',version:3}},'historical_version_missing');
});
test('education start is explicit, real and pinned to available date metadata',()=>{
  issue({...reference(),startedOn:'2025-08-01'},'historical_version_missing');
  for(const startedOn of [undefined,null,''])issue({...reference(),startedOn},'unknown_education_start');
  for(const startedOn of ['2026-02-30','2026-13-01','2026-8-1',20260801])issue({...reference(),startedOn},'invalid_basis_reference');
  assert.equal(resolveProgramplanBasis(catalog,{...reference(),startedOn:'2026-07-01'}).status,'resolved');
});
test('real specialization level checks subject, version, points, membership and duplicates',()=>{
  const p=reference();const r=resolveProgramplanBasis(catalog,p);
  const chosen=r.basis.specializationOptions.find(l=>l.itemCode==='ENGE3000X');
  const ref={subjectCode:chosen.subjectCode,subjectVersion:chosen.subjectVersion,itemCode:chosen.itemCode,points:chosen.points};
  const accepted=resolveProgramplanBasis(catalog,{...p,specializationRefs:[ref]});assert.equal(accepted.status,'resolved');
  assert.equal(accepted.basis.selectedSpecialization[0].itemCode,'ENGE3000X');
  issue({...p,specializationRefs:[ref,ref]},'duplicate_selected_level');
  issue({...p,specializationRefs:[{...ref,points:50}]},'points_mismatch');
  issue({...p,specializationRefs:[{...ref,subjectVersion:ref.subjectVersion+1}]},'historical_version_missing');
  issue({...p,specializationRefs:[{...ref,subjectCode:'MATE'}]},'wrong_subject');
  issue({...p,specializationRefs:[{...ref,itemCode:'UNKNOWN'}]},'item_not_found');
  const fixed=r.basis.nationalBlocks.flatMap(b=>b.levels).find(l=>l.itemCode==='ENGE1000X');
  issue({...p,specializationRefs:[{subjectCode:fixed.subjectCode,subjectVersion:fixed.subjectVersion,itemCode:fixed.itemCode,points:fixed.points}]},'fixed_level_duplicate');
  const gy11=catalog.subjects.find(s=>s.typeOfSyllabus==='SUBJECT_SYLLABUS'&&s.items.length);
  issue({...p,specializationRefs:[{subjectCode:gy11.code,subjectVersion:gy11.version,itemCode:gy11.items[0].code,points:gy11.items[0].points}]},'unsupported_regime');
  const gr=catalog.subjects.find(s=>s.schoolTypes.includes('GR'));
  issue({...p,specializationRefs:[{subjectCode:gr.code,subjectVersion:gr.version,itemCode:gr.items[0]?.code??'UNKNOWN',points:gr.items[0]?.points??0}]},'unsupported_school_type');
});
test('artifact and reference schemas reject unknown fields and duplicate global codes',async()=>{
  assert.throws(()=>projectProgramplanCatalog({...syllabusSnapshot,actor:'forged'}));
  const duplicate=structuredClone(syllabusSnapshot);duplicate.subjects.push(structuredClone(duplicate.subjects[0]));
  assert.throws(()=>projectProgramplanCatalog(duplicate),/duplicate_catalog_code/u);
  const across=structuredClone(syllabusSnapshot);across.subjects[1].items.push({...across.subjects[0].items[0]});
  assert.throws(()=>projectProgramplanCatalog(across),/duplicate_catalog_code/u);
  assert.throws(()=>parseProgramplanCatalog({...raw,role:'huvudman'}));
  assert.throws(()=>parseProgramplanBasisReference({...reference(),source:'private'}));
  issue({...reference(),programRef:{...reference().programRef,extra:true}},'invalid_basis_reference');
  issue({...reference(),catalogId:'sha256:'+'0'.repeat(64)},'catalog_mismatch');
});
test('only integrity-verified immutable catalog capabilities can resolve references',async()=>{
  assert.equal(resolveProgramplanBasis(raw,reference()).diagnostics[0].code,'unverified_catalog');
  assert.equal(resolveProgramplanBasis(structuredClone(catalog),reference()).diagnostics[0].code,'unverified_catalog');
  const modified=structuredClone(raw);modified.programs[0].name='Changed';
  await assert.rejects(()=>verifyProgramplanCatalog(modified),/catalog_integrity_failed/u);
  assert.throws(()=>catalog.programs[0].name='Changed',TypeError);
  const caller=structuredClone(raw),verified=await verifyProgramplanCatalog(caller);caller.programs[0].name='Changed';
  assert.notEqual(verified.programs[0].name,caller.programs[0].name);
});
test('every actual program yields explicit reference status and never decision or write readiness',()=>{
  const report={};
  for(const p of catalog.programs){
    const r=resolveProgramplanBasis(catalog,{catalogId:catalog.catalogId,programRef:{code:p.code,version:p.version},orientationCode:p.orientations[0]?.code??null,
      startedOn:'2026-08-01',specializationRefs:[]});
    assert.equal(r.decisionReady,false);assert.equal(r.writeReady,false);assert.ok(['resolved','blocked'].includes(r.status));
    for(const d of r.diagnostics)report[d.code]=(report[d.code]??0)+1;
    for(const c of r.unresolvedChoices)report[c.kind]=(report[c.kind]??0)+1;
  }
  assert.ok(Object.keys(report).length>0);
  console.log('Katalogdiagnostik (alla program):',JSON.stringify(report));
});
test('both program and fixed subject dates constrain the explicit education start',async()=>{
  const run=async(change,start='2026-08-01')=>{
    const c=await syntheticCatalog(change);
    return resolveProgramplanBasis(c,{catalogId:c.catalogId,programRef:{code:'TP25',version:1},orientationCode:null,startedOn:start,specializationRefs:[]});
  };
  for(const change of [s=>s.programs[0].endDate='2026-07-31',s=>s.subjects[0].endDate='2026-07-31'])assert.ok((await run(change)).diagnostics.some(d=>d.code==='version_not_applicable_at_start'));
  for(const change of [s=>s.programs[0].canceledDate='2026-08-01',s=>s.subjects[0].canceledDate='2026-08-01'])assert.ok((await run(change)).diagnostics.some(d=>d.code==='version_canceled_before_start'));
  assert.equal((await run(s=>s.subjects[0].canceledDate='2026-08-02')).status,'resolved');
  assert.ok((await run(s=>s.subjects[0].startDate='2026-09-01')).diagnostics.some(d=>d.code==='historical_version_missing'));
  assert.ok((await run(s=>delete s.subjects[0].startDate)).diagnostics.some(d=>d.code==='validity_metadata_missing'));
  assert.ok((await run(s=>s.subjects[0].schoolTypes=['GYAN'])).diagnostics.some(d=>d.code==='unsupported_school_type'));
  assert.ok((await run(s=>s.subjects[0].typeOfSyllabus='SUBJECT_SYLLABUS')).diagnostics.some(d=>d.code==='unsupported_regime'));
});
test('strict runtime records reject injected prototypes, symbols and accessors without evaluating them',()=>{
  const withPrototype=Object.assign(Object.create({actor:'forged'}),reference());
  assert.throws(()=>parseProgramplanBasisReference(withPrototype));
  class Wrapper {constructor(){Object.assign(this,reference());}}
  assert.throws(()=>parseProgramplanBasisReference(new Wrapper()));
  const symbols={...reference(),[Symbol('actor')]:'forged'};assert.throws(()=>parseProgramplanBasisReference(symbols));
  let read=false;const getter={...reference()};Object.defineProperty(getter,'startedOn',{enumerable:true,get(){read=true;return '2026-08-01';}});
  assert.throws(()=>parseProgramplanBasisReference(getter));assert.equal(read,false);
  const nested={...reference(),programRef:Object.assign(Object.create({role:'rektor'}),reference().programRef)};
  assert.throws(()=>parseProgramplanBasisReference(nested));
  for(const location of ['top','nested']){
    const hidden=reference();Object.defineProperty(location==='top'?hidden:hidden.programRef,'role',{value:'huvudman'});
    assert.throws(()=>parseProgramplanBasisReference(hidden));
  }
  const sparse=[];sparse.length=1;
  issue({...reference(),specializationRefs:sparse},'invalid_basis_reference');
  const arrayGetter=[];Object.defineProperty(arrayGetter,0,{get(){read=true;return {};},enumerable:true});
  issue({...reference(),specializationRefs:arrayGetter},'invalid_basis_reference');assert.equal(read,false);
});
