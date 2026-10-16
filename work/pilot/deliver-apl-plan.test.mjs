import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { allowedFunctions, newFunctions, aplTables, workerFunctions, migrations, requiredRaces, sha,
  assertSharedSourceHashes, assertStructureTransition, assertColumnTransition, requirePackageProof, readPrivateEvidence } from './apply-apl-plan.mjs';
import { requireAplDeliveryIdentity, requireInstallationProof, requirePreviousRuntimeProof, requirePreparedTransfer, recordAplTransferFailure, copyArtifact } from './deliver-apl-plan.mjs';
import { artifactManifest } from './verify-programplan-copy-api.mjs';

const ownerAcl='{postgres=X/postgres}';
function structures(){
  const before={functions:[...allowedFunctions.map(signature=>({signature,definition:'old '+signature,owner:'1',acl:ownerAcl})),
    {signature:'phase5_programplan_actor()',definition:'unchanged',owner:'1',acl:'{postgres=X/postgres,service_role=X/postgres}'}],
  tables:[{relname:'timplans',relkind:'r',owner:'1',acl:'private',relrowsecurity:true,relforcerowsecurity:false}],
  columns:[{relname:'timplans',attname:'id'}],constraints:[],indexes:[],triggers:[],policies:[]};
  const after=structuredClone(before);
  after.functions=after.functions.map(f=>({...f,definition:allowedFunctions.includes(f.signature)?'new '+f.signature:f.definition}));
  after.functions.push(...newFunctions.map(signature=>({signature,definition:'new '+signature,owner:'1',acl:workerFunctions.includes(signature)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':ownerAcl})));
  after.tables.push(...aplTables.map(relname=>({relname,relkind:'r',owner:'1',acl:'private',relrowsecurity:true,relforcerowsecurity:true})));
  after.triggers=[{relname:'timplan_cells',tgname:'timplan_cells_apl_guard'},{relname:'plan_decision_receipts',tgname:'plan_decision_apl_receipt_required'}];
  return{before,after};
}
const packages=Object.fromEntries(migrations.map(n=>['supabase/migrations/'+n,'a'.repeat(64)])),sources={'web/lib/example.ts':'b'.repeat(64)};
function valid(){
  const {before,after}=structures(),fingerprint=sha(JSON.stringify(before)),installed=sha(JSON.stringify(after));
  const artifact={files:[{path:'server/index.js',bytes:1,sha256:'c'.repeat(64)}],fileCount:1,sha256:'d'.repeat(64)};
  const browser=device=>({path:'/private/tmp/'+device+'.json',sha256:'e'.repeat(64),visualReview:'reviewed',screenshotHashes:{[device+'-apl.png']:'f'.repeat(64)},result:{status:'PASS',device,checks:['actual saved APL'],screenshots:[{file:device+'-apl.png'}]}});
  const rows={timplans:{count:2,hash:'same'}};
  return{sql:{kind:'apl-full-private-worker-sql',schemaVersion:1,status:'PASS',checks:[{ok:true}],cleanup:{cleanup:'complete'},snapshot:{dataCopied:false,sourceFingerprint:fingerprint},
    migrationRollbackRestored:true,baseline:{fingerprint,structure:before,rows},rollback:{restored:true,fingerprint,structure:before,rows},installed:{fingerprint:installed,structure:after,rows},final:{fingerprint:installed,structure:after,rows},
    originalPreservation:{tables:1,exactPreservedRows:2},grants:{tableColumnHelperDefinitionChanges:0,removed:[],added:workerFunctions.map(signature=>({signature,grantee:'skolplattform_worker',privilege:'EXECUTE',grantable:false}))},
    races:Object.entries(requiredRaces).map(([name,right])=>({name,leftPid:1,rightPid:2,blockers:[1],wait_event_type:'Lock',left:'committed',right})),sources:packages,finalSources:packages,migrations:packages},
    api:{kind:'apl-plan-actual-api-browser',status:'PASS',checks:[{ok:true}],api:{},sources,finalSources:sources,migrationSources:packages,finalMigrationSources:packages,build:{mode:'protected'},
      runtime:{baseURL:'http://127.0.0.1:3014',artifact},finalArtifact:artifact,snapshot:{dataCopied:false,sourceFingerprint:fingerprint},runtimeCleanup:{cleanup:'complete'},snapshotCleanup:{cleanup:'complete'},oidcCleanup:{cleanup:'complete',verifiedCallbacks:4},
      verificationSources:{'harness.mjs':'c'.repeat(64)},finalVerificationSources:{'harness.mjs':'c'.repeat(64)},browserEvidence:{desktop:browser('desktop'),phone:browser('phone')}}};
}
test('complete APL proof binds exact SQL transition, twelve observed races and both devices',()=>{const {sql,api}=valid();assert.equal(requirePackageProof(sql,api,{sources,packages}),true);});
for(const [name,mutate]of [
  ['old package',x=>x.sql.kind='rector-programplan-schema-only-sql'],['unknown apply',x=>x.sql.status='FAIL'],['missing rollback',x=>x.sql.rollback.restored=false],
  ['row changed',x=>x.sql.installed.rows={timplans:{count:3,hash:'changed'}}],['schema hash mismatch',x=>x.sql.installed.fingerprint='9'.repeat(64)],
  ['migration changed',x=>x.sql.migrations={}],['source drift',x=>x.sql.finalSources={}],['new public grant',x=>x.sql.grants.added[0].grantee='PUBLIC'],
  ['missing race',x=>x.sql.races.pop()],['duplicate race',x=>x.sql.races[0]=x.sql.races[1]],['unobserved overlap',x=>x.sql.races[0].blockers=[]],
  ['same PID',x=>x.sql.races[0].rightPid=1],['wrong race outcome',x=>x.sql.races[1].right='committed'],
  ['active port used as test',x=>x.api.runtime.baseURL='http://127.0.0.1:3012'],['API source drift',x=>x.api.finalSources={}],
  ['changed candidate',x=>x.api.finalArtifact={...x.api.finalArtifact,sha256:'9'.repeat(64)}],['no actual OIDC',x=>x.api.oidcCleanup.verifiedCallbacks=0],
  ['missing phone',x=>delete x.api.browserEvidence.phone],['unreviewed image',x=>x.api.browserEvidence.phone.visualReview='pending'],
  ['missing screenshot hash',x=>x.api.browserEvidence.desktop.screenshotHashes={}],['copied source data',x=>x.api.snapshot.dataCopied=true],
  ['cleanup incomplete',x=>x.api.snapshotCleanup.cleanup='pending'],['different test baseline',x=>x.api.snapshot.sourceFingerprint='3'.repeat(64)],
])test(name+' blocks APL release',()=>{const x=structuredClone(valid());mutate(x);assert.throws(()=>requirePackageProof(x.sql,x.api,{sources,packages}));});

test('APL permits only exact existing function replacements and new closed objects',()=>{const{before,after}=structures();assertStructureTransition(before,after);});
for(const [name,mutate]of [
  ['existing owner',s=>s.functions[0].owner='2'],['existing grants',s=>s.functions[0].acl='public'],['missing replacement',s=>s.functions[0].definition='old '+s.functions[0].signature],
  ['new helper missing',s=>s.functions.pop()],['new public helper',s=>s.functions.at(-1).acl='{=X/postgres}'],['new service helper',s=>s.functions.at(-1).acl='{postgres=X/postgres,service_role=X/postgres}'],
  ['missing Worker grant',s=>s.functions.find(f=>f.signature===workerFunctions[0]).acl=ownerAcl],['table RLS disabled',s=>s.tables.at(-1).relrowsecurity=false],
  ['force RLS disabled',s=>s.tables.at(-1).relforcerowsecurity=false],['unrelated table',s=>s.tables.push({...s.tables[0],relname:'unrelated'})],
  ['old column',s=>s.columns.push({relname:'timplans',attname:'new'})],['old policy',s=>s.policies.push({tablename:'timplans',policyname:'public_read'})],
  ['old trigger',s=>s.triggers.push({relname:'timplans',tgname:'unrelated'})],['missing cell guard',s=>s.triggers.shift()],
])test('structure refuses '+name,()=>{const{before,after}=structures();mutate(after);assert.throws(()=>assertStructureTransition(before,after));});
test('existing columns remain exact; all nine new tables required',()=>{
  const old={timplans:['id','revision']},next={...old,...Object.fromEntries(aplTables.map(n=>[n,['id']]))};assertColumnTransition(old,next);
  assert.throws(()=>assertColumnTransition(old,{...next,timplans:['id','revision','new']}));delete next.apl_plan_commands;assert.throws(()=>assertColumnTransition(old,next));
});

const priorRuntime={listener:{pid:3,ppid:2,started:'time',args:'workerd'},preview:{pid:2,ppid:1,started:'time',args:'preview'},manager:{pid:1,ppid:99,started:'time',args:'manager'}};
const previous={kind:'rector-programplan-local-delivery',mode:'--apply',status:'PASS',applied:true,afterArtifact:{sha256:'old'},afterRuntime:priorRuntime};
test('actual previous rector delivery can be the APL predecessor',()=>requirePreviousRuntimeProof(previous,previous.afterArtifact,priorRuntime));
test('restored old process after APL schema commit does not establish compatible rollback',()=>{
  const failure={databasePackageInstalled:true,runtimeRestored:true};recordAplTransferFailure(failure);
  assert.equal(failure.recoveryRequired,true);assert.equal(failure.applicationRollbackRestoresCompatibility,false);
  assert.throws(()=>requirePreviousRuntimeProof({...previous,...failure,kind:'apl-plan-local-delivery',status:'FAIL'},previous.afterArtifact,priorRuntime));
});
test('failure before schema acceptance does not invent an installation',()=>{const r={};recordAplTransferFailure(r);assert.equal(r.recoveryRequired,undefined);});
function installation(){const{before,after}=structures();return{kind:'apl-plan-live-installation',mode:'--apply',status:'PASS',committed:true,databaseClosed:true,toolSha256:'tool',target:{host:'127.0.0.1'},installed:{fingerprint:'schema'},beforeProjection:{t:'old'},afterProjection:{t:'old'},beforeJournal:{j:'old'},afterOriginalJournal:{j:'old'},lockHoldMsBeforeCommit:10,structureVerified:true,beforeStructure:before,afterStructure:after,oldWorkerCompatibleAfterCommit:false,candidateTransferRequired:true};}
test('installation acceptance requires committed preserved data and explicit candidate transfer',()=>{const r=installation();requireInstallationProof(r,{target:r.target,installed:r.installed,toolSha256:'tool'});});
for(const [name,mutate]of [['verify only',r=>r.mode='--verify'],['unknown commit',r=>r.committed=false],['changed rows',r=>r.afterProjection={}],['recovery',r=>r.recoveryRequired=true],['unbounded lock',r=>r.lockHoldMsBeforeCommit=30000],['false compatibility',r=>r.oldWorkerCompatibleAfterCommit=true]])test('installation refuses '+name,()=>{const r=installation();mutate(r);assert.throws(()=>requireInstallationProof(r,{target:r.target,installed:r.installed,toolSha256:'tool'}));});
function preparation(){const binding={source:'tool',target:{host:'127.0.0.1'},previousRuntime:priorRuntime,artifact:{sha256:'old'},configuration:{vars:'private'},build:{root:'candidate',revision:'commit'},sql:{sha256:'sql'},api:{sha256:'api'},scopePreparation:{scopeEvidence:{sha256:'scope'},identityId:'identity'}};
 return{binding,proof:{kind:'apl-plan-delivery-preparation',mode:'--prepare',status:'PASS',databaseClosed:true,databaseUnchanged:true,runtimeUnchanged:true,deliverySourceSha256:binding.source,target:binding.target,beforeRuntime:binding.previousRuntime,beforeArtifact:binding.artifact,beforeConfiguration:binding.configuration,testedBuild:binding.build,sql:binding.sql,api:binding.api,scopePreparation:binding.scopePreparation}};}
test('preparation binds old runtime, exact candidate and evidence before installation',()=>{const{proof,binding}=preparation();requirePreparedTransfer(proof,binding);});
for(const key of ['source','target','previousRuntime','artifact','configuration','build','sql','api','scopePreparation'])test('changed '+key+' after preparation prevents transfer',()=>{const{proof,binding}=preparation();binding[key]='changed';assert.throws(()=>requirePreparedTransfer(proof,binding));});

test('candidate transfer copies exact bytes without private configuration and refuses drift/symlinks',()=>{
  const dir=mkdtempSync('/private/tmp/apl-delivery-test-');try{
    const source=join(dir,'source');mkdirSync(source);mkdirSync(join(source,'server'));writeFileSync(join(source,'server/index.js'),'tested');writeFileSync(join(source,'server/.dev.vars'),'private',{mode:0o600});
    const manifest=artifactManifest(source);copyArtifact(source,join(dir,'copy'),manifest);assert.deepEqual(artifactManifest(join(dir,'copy')),manifest);assert.throws(()=>readFileSync(join(dir,'copy/server/.dev.vars')));
    writeFileSync(join(source,'server/index.js'),'drift');assert.throws(()=>copyArtifact(source,join(dir,'drift'),manifest));
    symlinkSync(join(source,'server/index.js'),join(source,'link'));assert.throws(()=>artifactManifest(source));
    const proof=join(dir,'evidence.json');writeFileSync(proof,'{}',{mode:0o600});symlinkSync(proof,join(dir,'alias.json'));assert.throws(()=>readPrivateEvidence(join(dir,'alias.json')));
  }finally{rmSync(dir,{recursive:true});}
});
test('existing 48 JWT-metadata negative cases exercise the new APL delivery helper bytes',()=>{
  const source=readFileSync(new URL('./deliver-class-cohort.test.mjs',import.meta.url),'utf8'),marker="new URL('./deliver-class-cohort.mjs',import.meta.url)";
  assert.equal(source.split(marker).length,2);
  const output=execFileSync(process.execPath,['--input-type=module'],{input:source.replace(marker,JSON.stringify(fileURLToPath(new URL('./deliver-apl-plan.mjs',import.meta.url)))),encoding:'utf8',timeout:30000});
  assert.match(output,/tests 48/u);assert.match(output,/fail 0/u);
});

test('older SQL source cannot be masked by newer API verification hash',()=>{
 const file='web/lib/apl-plan.ts',old='a'.repeat(64),current='b'.repeat(64);
 assert.throws(()=>assertSharedSourceHashes({[file]:old},{[file]:current},{[file]:current}));
 assert.throws(()=>assertSharedSourceHashes({[file]:current},{[file]:old},{[file]:current}));
 assertSharedSourceHashes({[file]:current},{[file]:current},{[file]:current});
});

function identitySnapshot(){const id=n=>'66000000-0000-4000-8000-'+String(n).padStart(12,'0');return{identities:[{id:id(1),auth_user_id:id(2)}],authUsers:[{id:id(2)}],authIdentities:[{id:id(3),user_id:id(2),provider:'keycloak',identity_data:{sub:'subject'}}],plans:[{id:id(4)}]};}
test('delivery preparation requires existing exact identity, auth binding and timetable',()=>assert.ok(requireAplDeliveryIdentity(identitySnapshot(),'subject').metadataIdentityId));
for(const [name,change]of [['missing auth user',s=>s.authUsers=[]],['other subject',s=>s.authIdentities[0].identity_data.sub='other'],['ambiguous identity',s=>s.identities.push(s.identities[0])],['missing timetable',s=>s.plans=[]],['unbound identity',s=>s.identities[0].auth_user_id=null]])test('preparation rejects '+name,()=>{const snapshot=identitySnapshot();change(snapshot);assert.throws(()=>requireAplDeliveryIdentity(snapshot,'subject'));});
