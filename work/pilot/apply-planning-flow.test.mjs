import test from 'node:test';
import assert from 'node:assert/strict';
import { assertColumnTransition, assertStructureTransition, allowedFunctions, newFunctions, workerFunctions, changedConstraints, aplTables, requirePackageProof, sha } from './apply-planning-flow.mjs';
const hash='a'.repeat(64), sources={'web/x.ts':hash}, packages={'supabase/migrations/x.sql':hash};
const fn=(signature,definition='old',worker=false)=>({signature,definition,owner:'postgres',acl:worker?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'});
function structures(){
 const baseline={tables:[{relname:'timplans',relkind:'r',owner:'postgres',relrowsecurity:true,relforcerowsecurity:true}],columns:[],constraints:Object.keys(changedConstraints).map(name=>({relname:name.split('.')[0],conname:name.split('.')[1],definition:'old',convalidated:true})),indexes:[],policies:[],triggers:[],
 functions:[fn('phase5_programplan_actor()'),...allowedFunctions.map(name=>fn(name))]};
 baseline.tables.push(...['apl_plan_commands','apl_plan_decision_receipts'].map(relname=>({relname,relkind:'r',owner:'postgres',relrowsecurity:true,relforcerowsecurity:true})));
 const installed=structuredClone(baseline);installed.constraints=baseline.constraints.map(c=>({...c,definition:changedConstraints[c.relname+'.'+c.conname]}));
 installed.tables.push(...aplTables.map(relname=>({relname,relkind:'r',owner:'postgres',relrowsecurity:true,relforcerowsecurity:true})));
 installed.functions=baseline.functions.map(f=>({...f,definition:allowedFunctions.includes(f.signature)?'new':f.definition}));
 installed.functions.push(...newFunctions.map(name=>fn(name,'new',workerFunctions.includes(name))));
 installed.triggers=aplTables.flatMap(relname=>[{relname,tgname:relname+'_guard'},{relname,tgname:relname+'_no_truncate'}]);return{baseline,installed};
}
function proofs(){
 const {baseline,installed}=structures(),bf=sha(JSON.stringify(baseline)),af=sha(JSON.stringify(installed));
 const rows={timplans:{count:2,hash}},sql={kind:'separate-apl-workflow-private-schema-only',status:'PASS',checks:Array.from({length:20},()=>({ok:true})),cleanup:{cleanup:'complete'},snapshot:{dataCopied:false,sourceFingerprint:bf},
 migrationRollbackRestored:true,workflowSeedCount:0,matrixRollbackRestored:true,originalRowsPreserved:true,concurrencyComplete:true,baseline:{fingerprint:bf,structure:baseline,rows},
 installed:{fingerprint:af,structure:installed,rows:{...rows,...Object.fromEntries(aplTables.map(t=>[t,{count:0,hash}]))}},finalFingerprint:af,finalStructure:installed,
 races:[{leftPid:1,rightPid:2,blockers:[1],wait_event_type:'Lock',left:'committed',right:'40001'}],sources:packages,finalSources:packages};
 const api={kind:'planning-flow-actual-api-browser',status:'PASS',checks:[{ok:true}],sources,finalSources:sources,migrationSources:packages,finalMigrationSources:packages,
 baselineFingerprint:bf,installedFingerprint:af,finalFingerprint:af,migrationBeforeRows:rows,migrationAfterRows:rows,build:{mode:'protected'},runtime:{baseURL:'http://127.0.0.1:3014',artifact:{fileCount:1}},finalArtifact:{fileCount:1},snapshot:{dataCopied:false,sourceFingerprint:bf},browserRuns:{retries:0},
 oidcCleanup:{cleanup:'complete',verifiedCallbacks:2},runtimeCleanup:{cleanup:'complete'},snapshotCleanup:{cleanup:'complete'},verificationSources:{...sources,...packages},finalVerificationSources:{...sources,...packages},
 browserEvidence:Object.fromEntries(['desktop','phone'].map(device=>[device,{visualReview:'reviewed',sha256:hash,result:{status:'PASS',device,checks:[{ok:true}],screenshots:[{file:device+'-table.png'}]},screenshotHashes:{[device+'-table.png']:hash}}]))};return{sql,api};
}
test('additive package changes exactly two tables and allowlisted definitions/rights',()=>{
 const {baseline,installed}=structures();assertStructureTransition(baseline,installed);assertColumnTransition({timplans:['id']},{timplans:['id'],...Object.fromEntries(aplTables.map(t=>[t,['id']]))});
 for(const change of [a=>a.tables[0].owner='anon',a=>a.tables.at(-1).relforcerowsecurity=false,a=>a.functions[0].definition='changed',a=>a.functions.at(-1).acl='{PUBLIC=X/postgres}',a=>a.triggers.push({relname:'timplans',tgname:'bad'})]){const a=structuredClone(installed);change(a);assert.throws(()=>assertStructureTransition(baseline,a));}
 assert.throws(()=>assertColumnTransition({timplans:['id']},{timplans:['id','other'],...Object.fromEntries(aplTables.map(t=>[t,['id']]))}));
});
test('only the exact two immutable-command contract constraints may change',()=>{
 const {baseline,installed}=structures();assertStructureTransition(baseline,installed);
 for(const mutate of [a=>a.constraints[0].definition='CHECK (true)',a=>a.constraints[0].convalidated=false,a=>a.constraints.pop()]){
  const next=structuredClone(installed);mutate(next);assert.throws(()=>assertStructureTransition(baseline,next));
 }
});
test('SQL+actual browser proof requires exact migrations, sources, preserved rows, real race, visuals and cleanup',()=>{
 const {sql,api}=proofs();assert.equal(requirePackageProof(sql,api,{sources,packages}),true);
 for(const change of [s=>s.status='FAIL',s=>s.cleanup.cleanup='pending',s=>s.races[0].blockers=[],s=>s.originalRowsPreserved=false,s=>s.finalFingerprint=hash,s=>s.installed.rows.apl_organizer_reviews.count=1,s=>s.migrationRollbackRestored=false]){const s=structuredClone(sql);change(s);assert.throws(()=>requirePackageProof(s,api,{sources,packages}));}
 for(const change of [a=>a.browserEvidence.phone.visualReview='pending',a=>a.browserEvidence.desktop.result.checks[0].ok=false,a=>a.browserRuns.retries=1,a=>a.finalFingerprint=hash,a=>a.snapshot.dataCopied=true,a=>a.oidcCleanup.cleanup='failed',a=>a.finalSources={},a=>a.migrationAfterRows={timplans:{count:3,hash}}]){const a=structuredClone(api);change(a);assert.throws(()=>requirePackageProof(sql,a,{sources,packages}));}
});
