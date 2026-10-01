import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProgramplanListRequest, parseProgramplanWorkspaceRequest, parseProgramplanOfferingList,
  parseProgramplanWorkspace, parseRawProgramplanWorkspace } from './programplan-workspace-contract.ts';
const id='55101000-0000-4000-8000-000000000001', unit='55101000-0000-4000-8000-000000000002', planId='55101000-0000-4000-8000-000000000003';
const artifact=JSON.parse(await readFile(new URL('./programplan-catalog.generated.json',import.meta.url),'utf8'));
const request=(catalogId=null)=>({offeringId:id,versionPage:1,catalogId});
const education=()=>({id,unitId:unit,schoolName:'Syntetisk skola',kind:'gymnasium',name:'Syntetisk utbildning',localCode:null,cohort:'Fri kulltext',startYear:null,status:'planerad',programCode:'ES25',orientationCode:'ESBIF',latestVersion:0,draftId:null});
const workspace=()=>({education:education(),versions:[],versionCount:0,versionPage:1,pageSize:50,catalogs:[{catalogId:artifact.catalogId,source:artifact.source}],catalog:{status:'unselected',catalogId:null,diagnostic:null,source:null,program:null,subjects:[]},decisionReady:false});
const version=()=>({id:planId,version:1,revision:0,status:'utkast',decidedOn:null,catalogId:null,basisReference:null,legacySpecialization:['UNKNOWN_LEGACY','FOTO2000X','UNKNOWN_LEGACY']});
function selected(programCode='ES25'){const value=workspace(),program=artifact.programs.find(p=>p.code===programCode),codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(s=>s.subjectVersion!==null).map(s=>s.code));value.education.programCode=programCode;value.education.orientationCode=program.orientations[0]?.code??null;value.catalog={status:'selected',catalogId:artifact.catalogId,diagnostic:null,source:artifact.source,program,subjects:artifact.subjects.filter(s=>codes.has(s.code))};return value;}
test('strict requests accept explicit NULL selection and reject hidden authority, coercion and invalid paging',()=>{
 assert.deepEqual(parseProgramplanListRequest({page:1}),{page:1});assert.deepEqual(parseProgramplanWorkspaceRequest(request()),request());
 for(const value of [{page:'1'},{page:0},{page:100001},{page:1,customerId:id}])assert.throws(()=>parseProgramplanListRequest(value));
 for(const value of [{...request(),catalogId:undefined},{...request(),startedOn:'2026-08-01'},{...request(),offeringId:'not-id'},{...request(),versionPage:'1'},{...request(),catalogId:'latest'}])assert.throws(()=>parseProgramplanWorkspaceRequest(value));
});
test('actual education without plan remains selectable and nullable start is not filled from cohort',()=>{
 const value={offerings:[education()],count:1,page:1,pageSize:50};assert.deepEqual(parseProgramplanOfferingList(value,1),value);
 const parsed=parseProgramplanWorkspace(workspace(),request());assert.equal(parsed.education.startYear,null);assert.equal(parsed.catalog.status,'unselected');assert.equal(parsed.decisionReady,false);
});
test('pages describe whole counts and whole max/draft, including empty pages and old version pages',()=>{
 const empty={offerings:[],count:50,page:2,pageSize:50};assert.deepEqual(parseProgramplanOfferingList(empty,2),empty);
 const data=workspace();data.education.latestVersion=52;data.education.draftId=id;data.versionCount=52;data.versionPage=2;
 data.versions=[{...version(),version:2,status:'ersatt'},{...version(),id:unit,version:1,status:'faststalld',decidedOn:'2026-01-01'}];
 const parsed=parseProgramplanWorkspace(data,{...request(),versionPage:2});assert.equal(parsed.education.latestVersion,52);assert.equal(parsed.education.draftId,id);
 for(const mutate of [v=>v.pageSize=49,v=>v.versionCount=53,v=>v.versions.reverse(),v=>v.versions[1].id=planId,v=>v.education.latestVersion=1]){const invalid=structuredClone(data);mutate(invalid);assert.throws(()=>parseProgramplanWorkspace(invalid,{...request(),versionPage:2}));}
});
test('legacy unknown and duplicate choices remain in original order without catalog/start auto-binding',()=>{
 const value=workspace();value.education.latestVersion=1;value.education.draftId=planId;value.versionCount=1;value.versions=[version()];
 const parsed=parseProgramplanWorkspace(value,request());assert.deepEqual(parsed.versions[0].legacySpecialization,['UNKNOWN_LEGACY','FOTO2000X','UNKNOWN_LEGACY']);assert.equal(parsed.versions[0].basisReference,null);
 const inconsistent=structuredClone(value);inconsistent.versions[0].legacySpecialization=null;assert.throws(()=>parseProgramplanWorkspace(inconsistent,request()));
});
test('projected actual catalog preserves fixed optional blocks, empty levels and raw points',()=>{
 const value=selected(),parsed=parseProgramplanWorkspace(value,request(artifact.catalogId));assert.deepEqual(parsed.catalog.program,value.catalog.program);
 assert.ok(parsed.catalog.program.foundation.some(s=>s.optional));assert.equal(parsed.decisionReady,false);
 const emptyProgram=artifact.programs.find(p=>[...p.foundation,...p.programmeSpecific,...p.orientations.flatMap(o=>o.subjects),...p.specialization].some(s=>s.levels.length===0));assert.ok(emptyProgram);
 const empty=parseProgramplanWorkspace(selected(emptyProgram.code),request(artifact.catalogId));assert.deepEqual(empty.catalog.program,emptyProgram);
 const altered=structuredClone(value);altered.catalog.program.code='SA25';assert.throws(()=>parseProgramplanWorkspace(altered,request(artifact.catalogId)));
 const extra=structuredClone(value);extra.catalog.subjects.push(artifact.subjects.find(s=>!extra.catalog.subjects.some(t=>t.code===s.code)));assert.throws(()=>parseProgramplanWorkspace(extra,request(artifact.catalogId)));
});
test('missing exact catalog remains a readable blocked source; selected mismatch and extra fields fail closed',()=>{
 const missing='sha256:'+'0'.repeat(64),value=workspace();value.catalog={status:'blocked',catalogId:missing,diagnostic:'catalog_unavailable',source:null,program:null,subjects:[]};
 assert.equal(parseProgramplanWorkspace(value,request(missing)).catalog.diagnostic,'catalog_unavailable');
 for(const mutate of [v=>v.decisionReady=true,v=>v.education.actorId=id,v=>v.catalog.payload={},v=>v.catalog.catalogId=artifact.catalogId,v=>v.catalog.diagnostic='forbidden']){const invalid=structuredClone(value);mutate(invalid);assert.throws(()=>parseProgramplanWorkspace(invalid,request(missing)));}
});
test('raw SQL selection demands explicit ID and whole payload, preserving server verification boundary',()=>{
 const value=workspace(),{catalogId,...payload}=artifact;value.catalog={status:'selected',catalogId,diagnostic:null,payload};
 assert.deepEqual(parseRawProgramplanWorkspace(value,request(catalogId)).catalog.payload,payload);
 assert.throws(()=>parseProgramplanWorkspace(value,request(catalogId)));
 for(const mutate of [v=>v.catalog.payload=null,v=>v.catalog.diagnostic='catalog_unavailable',v=>v.catalog.catalogId=null]){const invalid=structuredClone(value);mutate(invalid);assert.throws(()=>parseRawProgramplanWorkspace(invalid,request(catalogId)));}
});
test('nested getters, hidden fields, sparse arrays and unsafe URLs are rejected without coercion',()=>{
 const value=workspace();Object.defineProperty(value.education,'hidden',{value:'private'});assert.throws(()=>parseProgramplanWorkspace(value,request()));
 const getter=workspace();Object.defineProperty(getter.education,'name',{get(){throw new Error('getter executed');}});assert.throws(()=>parseProgramplanWorkspace(getter,request()),/invalid_programplan_workspace/u);
 const sparse={offerings:new Array(1),count:1,page:1,pageSize:50};assert.throws(()=>parseProgramplanOfferingList(sparse,1));
 for(const url of ['javascript:alert(1)','https://secret:password@example.test/data']){const invalid=workspace();invalid.catalogs[0].source={...artifact.source,url};assert.throws(()=>parseProgramplanWorkspace(invalid,request()));}
});
