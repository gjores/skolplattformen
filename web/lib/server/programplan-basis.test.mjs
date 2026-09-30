import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
const forbiddenDependencies=[];
registerHooks({resolve(specifier,context,next){
  if (/supabase|(?:^|\/)db\.ts$|(?:^|\/)env\.ts$/u.test(specifier)){
    forbiddenDependencies.push(specifier);throw new Error('Programplansvalidering får inte läsa driftberoenden.');
  }
  return next(specifier,context);
}});
const {createVerifiedProgramplanCatalog,validateProgramplanCatalogBasis}=await import('./programplan-basis.ts');
const artifact=JSON.parse(await readFile(new URL('../programplan-catalog.generated.json',import.meta.url),'utf8'));
const request=()=>({catalogId:artifact.catalogId,programRef:{code:'ES25',version:artifact.programs.find(p=>p.code==='ES25').version},
  orientationCode:'ESBIF',startedOn:'2026-08-01',specializationRefs:[]});
async function blocked(value,code){const r=await validateProgramplanCatalogBasis(value);assert.equal(r.status,'blocked');assert.equal(r.basis,null);
  assert.ok(r.diagnostics.some(d=>d.code===code),JSON.stringify(r.diagnostics));assert.equal(r.writeReady,false);assert.equal(r.decisionReady,false);}
test('actual server adapter resolves the approved catalog without granting writing or deciding',async()=>{
  const r=await validateProgramplanCatalogBasis(request());
  assert.equal(r.status,'resolved');assert.equal(r.catalogId,artifact.catalogId);
  assert.equal(r.basis.program.code,'ES25');assert.equal(r.basis.orientation.code,'ESBIF');
  assert.equal(r.writeReady,false);assert.equal(r.decisionReady,false);assert.ok(Object.isFrozen(r.basis));
  assert.ok(r.unresolvedChoices.some(c=>c.subjectCode==='SVEA'));assert.equal(forbiddenDependencies.length,0);
});
test('unbound historical legacy plans are explicit rather than filled from the latest catalog',async()=>{
  for(const legacy of [null,{}, {catalog_fetched:'2026-09-05',program_code:'ES25',start_year:2026,cohort:'2026'}])await blocked(legacy,'unpinned_basis');
  await blocked({...request(),startedOn:undefined},'unknown_education_start');
  await blocked({...request(),startedOn:'2025-08-01'},'historical_version_missing');
  await blocked({...request(),programRef:{code:'ES25',version:2}},'historical_version_missing');
});
test('production parser rejects free top-level and nested authority, fields and numeric coercions',async()=>{
  const invalids=[{...request(),role:'huvudman'},{...request(),customerId:'private'},{...request(),status:'faststalld'},
    {...request(),programRef:{...request().programRef,source:'forged'}},{...request(),programRef:{code:'ES25',version:'3'}},
    {...request(),programRef:{code:'ES25',version:NaN}},{...request(),programRef:{code:'ES25',version:Infinity}},
    {...request(),startedOn:'2026-02-30'},{...request(),orientationCode:[]},
    {...request(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:'100'}]},
    {...request(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100,actor:'forged'}]},
    {...request(),programRef:{code:'A'.repeat(97),version:1}}];
  for(const value of invalids)await blocked(value,'invalid_basis_reference');
  await blocked({...request(),catalogId:'sha256:'+'0'.repeat(64)},'catalog_mismatch');
  await blocked({...request(),catalogId:'sha256:bad'},'invalid_catalog_id');
});
test('trusted factory checks both schema and fingerprint before producing an immutable capability',async()=>{
  const original=structuredClone(artifact),verified=await createVerifiedProgramplanCatalog(original);
  assert.ok(Object.isFrozen(verified));assert.ok(Object.isFrozen(verified.programs));
  original.programs[0].name='Altered after verification';assert.notEqual(original.programs[0].name,verified.programs[0].name);
  const bad=structuredClone(artifact);bad.programs[0].name='Modified while retaining ID';
  await assert.rejects(()=>createVerifiedProgramplanCatalog(bad),/catalog_integrity_failed/u);
  await assert.rejects(()=>createVerifiedProgramplanCatalog({...artifact,role:'rektor'}),/invalid_catalog/u);
  const wrongNested=structuredClone(artifact);wrongNested.subjects[0].items[0].points='100';
  await assert.rejects(()=>createVerifiedProgramplanCatalog(wrongNested),/invalid_catalog/u);
  const duplicate=structuredClone(artifact);duplicate.subjects.push(structuredClone(duplicate.subjects[0]));
  await assert.rejects(()=>createVerifiedProgramplanCatalog(duplicate),/duplicate_catalog_code/u);
});
test('chosen subject references are checked by the actual server resolver',async()=>{
  const reference={subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100};
  const r=await validateProgramplanCatalogBasis({...request(),specializationRefs:[reference]});assert.equal(r.status,'resolved');
  assert.equal(r.basis.selectedSpecialization[0].itemCode,'ENGE3000X');
  await blocked({...request(),specializationRefs:[{...reference,subjectVersion:2}]},'historical_version_missing');
  await blocked({...request(),specializationRefs:[{...reference,subjectCode:'MATE'}]},'wrong_subject');
  await blocked({...request(),specializationRefs:[{...reference,points:50}]},'points_mismatch');
  await blocked({...request(),specializationRefs:[reference,reference]},'duplicate_selected_level');
});
