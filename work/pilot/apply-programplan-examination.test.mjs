import test from 'node:test';
import assert from 'node:assert/strict';
import { assertColumnTransition, assertStructureTransition, allowedFunctions, addedFunctions, requiredSqlChecks, requiredApiFeatures, requiredBrowserFeatures, requirePackageProof, sha } from './apply-programplan-examination.mjs';
const hash='a'.repeat(64), sources={'web/x.ts':hash}, packages={'supabase/migrations/x.sql':hash};
const fn=(signature,definition="SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' old",worker=false)=>({signature,definition,owner:'postgres',acl:worker?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'});
function structures(){
 const baseline={tables:[{relname:'timplans',relkind:'r',owner:'postgres',relrowsecurity:true,relforcerowsecurity:true}],columns:[],constraints:[{relname:'timplans',conname:'guard',definition:'check'}],indexes:[],policies:[],triggers:[],functions:[fn('phase5_programplan_actor()'),...allowedFunctions.map(name=>fn(name))]};
 const installed=structuredClone(baseline);installed.functions=baseline.functions.map(f=>({...f,definition:allowedFunctions.includes(f.signature)?'new':f.definition}));installed.functions.push(...addedFunctions.map((name,i)=>fn(name,undefined,i===1)));return{baseline,installed};
}
function proofs(){
 const {baseline,installed}=structures(),bf=sha(JSON.stringify(baseline)),af=sha(JSON.stringify(installed));
 const rows={timplans:{count:2,hash}},sql={kind:'programplan-examination-private-schema-only',status:'PASS',checks:requiredSqlChecks.map(name=>({name,ok:true})),cleanup:{cleanup:'complete'},snapshot:{dataCopied:false,sourceFingerprint:bf},
 migrationRollbackRestored:true,matrixRollbackRestored:true,originalRowsPreserved:true,concurrencyComplete:true,baseline:{fingerprint:bf,structure:baseline,rows},
 installed:{fingerprint:af,structure:installed,rows},finalFingerprint:af,finalStructure:installed,
 races:[{leftPid:1,rightPid:2,blockers:[1],wait_event_type:'Lock',left:'committed',right:'40001'}],sources:packages,finalSources:packages};
 const api={kind:'programplan-examination-actual-api-browser',status:'PASS',checks:Array.from({length:20},()=>({ok:true})),originalRowsPreserved:true,api:{status:'PASS',...Object.fromEntries(requiredApiFeatures.map(f=>[f,true])),raceStatuses:[409,200]},sources,finalSources:sources,migrationSources:packages,finalMigrationSources:packages,
 baselineFingerprint:bf,installedFingerprint:af,finalFingerprint:af,migrationBeforeRows:rows,migrationAfterRows:rows,build:{mode:'protected'},runtime:{baseURL:'http://127.0.0.1:3014',artifact:{fileCount:1}},finalArtifact:{fileCount:1},snapshot:{dataCopied:false,sourceFingerprint:bf},browserRuns:{retries:0},
 oidcCleanup:{cleanup:'complete',verifiedCallbacks:2},runtimeCleanup:{cleanup:'complete'},snapshotCleanup:{cleanup:'complete'},verificationSources:{...sources,...packages},finalVerificationSources:{...sources,...packages},
 browserEvidence:Object.fromEntries(['desktop','phone'].map(device=>[device,{visualReview:'reviewed',sha256:hash,result:{status:'PASS',device,features:Object.fromEntries(requiredBrowserFeatures.map(f=>[f,true])),checks:Array.from({length:18},()=>({ok:true})),screenshots:[{file:device+'-table.png'}]},screenshotHashes:{[device+'-table.png']:hash}}]))};return{sql,api};
}
test('examination package permits exactly eleven replacements and two restricted additions',()=>{
 const {baseline,installed}=structures();assertStructureTransition(baseline,installed);assertColumnTransition({timplans:['id']},{timplans:['id']});
 for(const change of [a=>a.tables[0].owner='anon',a=>a.tables[0].relforcerowsecurity=false,a=>a.functions[0].definition='changed',a=>a.functions.at(-1).acl='{PUBLIC=X/postgres}',a=>a.triggers.push({relname:'timplans',tgname:'bad'}),a=>a.constraints[0].definition='CHECK (true)',a=>a.functions.push(fn('unexpected()'))]){const a=structuredClone(installed);change(a);assert.throws(()=>assertStructureTransition(baseline,a));}
 assert.throws(()=>assertStructureTransition(baseline,baseline));
 assert.throws(()=>assertColumnTransition({timplans:['id']},{timplans:['id','other']}));
});
test('new private functions cannot acquire default PUBLIC, extra roles, grant option, wrong owner or search path',()=>{
 const {baseline,installed}=structures();
 for(const change of [
  a=>a.functions.at(-2).acl=null,
  a=>a.functions.at(-2).acl='{postgres=X/postgres,skolplattform_worker=X/postgres}',
  a=>a.functions.at(-1).acl='{postgres=X/postgres,skolplattform_worker=X*/postgres}',
  a=>a.functions.at(-1).acl='{postgres=X/postgres,skolplattform_worker=X/postgres,anon=X/postgres}',
  a=>a.functions.at(-1).owner='anon',
  a=>a.functions.at(-1).definition='SECURITY INVOKER',
  a=>a.functions.at(-1).definition="SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'",
  a=>a.functions.at(-1).signature=addedFunctions[0],
  a=>a.functions.at(-1).signature='unrelated(uuid,integer,jsonb)',
  a=>a.functions[1].acl=null,
 ]){const altered=structuredClone(installed);change(altered);assert.throws(()=>assertStructureTransition(baseline,altered));}
});
test('SQL+actual browser proof requires exact migrations, sources, preserved rows, real race, visuals and cleanup',()=>{
 const {sql,api}=proofs();assert.equal(requirePackageProof(sql,api,{sources,packages}),true);
 for(const change of [s=>s.status='FAIL',s=>s.cleanup.cleanup='pending',s=>s.races[0].blockers=[],s=>s.originalRowsPreserved=false,s=>s.finalFingerprint=hash,s=>s.installed.rows={timplans:{count:3,hash}},s=>s.migrationRollbackRestored=false]){const s=structuredClone(sql);change(s);assert.throws(()=>requirePackageProof(s,api,{sources,packages}));}
 for(const change of [a=>a.browserEvidence.phone.visualReview='pending',a=>a.browserEvidence.desktop.result.checks[0].ok=false,a=>a.browserRuns.retries=1,a=>a.finalFingerprint=hash,a=>a.snapshot.dataCopied=true,a=>a.oidcCleanup.cleanup='failed',a=>a.finalSources={},a=>a.checks.length=14,a=>a.browserEvidence.phone.result.checks.length=4,a=>a.migrationAfterRows={timplans:{count:3,hash}}]){const a=structuredClone(api);change(a);assert.throws(()=>requirePackageProof(sql,a,{sources,packages}));}
});
test('scenario-specific SQL, API and device evidence cannot be replaced with generic successful checks',()=>{
 const {sql,api}=proofs();
 for(const name of requiredSqlChecks){const s=structuredClone(sql);s.checks.find(c=>c.name===name).name='generic substitute';assert.throws(()=>requirePackageProof(s,api,{sources,packages}),name);}
 for(const feature of requiredApiFeatures){const a=structuredClone(api);delete a.api[feature];assert.throws(()=>requirePackageProof(sql,a,{sources,packages}),feature);}
 for(const device of ['desktop','phone'])for(const feature of requiredBrowserFeatures){const a=structuredClone(api);a.browserEvidence[device].result.features[feature]=false;assert.throws(()=>requirePackageProof(sql,a,{sources,packages}),device+feature);}
 for(const change of [a=>a.api.raceStatuses=[200,200],a=>a.api.status='FAIL',a=>a.originalRowsPreserved=false,
  a=>a.migrationAfterRows={...a.migrationAfterRows,new_table:{count:1,hash}},a=>a.migrationSources={},
  a=>a.verificationSources['web/x.ts']='b'.repeat(64),a=>delete a.browserEvidence.phone,
  a=>a.browserEvidence.desktop.screenshotHashes={},a=>a.kind='timplan-minimum-actual-api-browser']){
  const a=structuredClone(api);change(a);assert.throws(()=>requirePackageProof(sql,a,{sources,packages}));
 }
});
