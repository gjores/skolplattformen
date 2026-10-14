#!/usr/bin/env node
// One exact Worker EXECUTE grant, only after source-bound actual HTTP preflight.
// --verify rolls back DDL; --apply also requires its unchanged rollback proof.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {sourcePaths as apiPaths,artifactManifest} from './verify-programplan-copy-api.mjs';
import {allPublicHashes,signature,grantName} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=grantName.slice(0,14),rollback=Error('atomic_copy_activation_rollback');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const privatePath=path=>typeof path==='string'&&resolve(path).startsWith('/private/tmp/')&&path.endsWith('.json');
export function activationOptions(args){
 const mode=args[0],opts={};assert.ok(['--verify','--apply'].includes(mode),'REFUSED: activation mode');
 for(let i=1;i<args.length;i+=2){const key=args[i];assert.ok(['--api-evidence','--evidence','--out'].includes(key)&&args[i+1]&&!opts[key]);assert.ok(privatePath(args[i+1]),'REFUSED: private JSON evidence required');opts[key]=resolve(args[i+1]);}
 assert.ok(opts['--api-evidence']&&opts['--out']);assert.ok(mode==='--verify'?!opts['--evidence']:opts['--evidence']);return{mode,...opts};
}
export function requireCopyPreflight(r,currentHashes){
 assert.ok(r&&r.kind==='programplan-copy-api'&&r.status==='PASS'&&r.complete===true&&r.preflight===true&&r.target==='protected'
  &&r.scope==='local-synthetic-only'&&r.reset===false,'REFUSED: complete actual copy preflight required');
 assert.ok(r.databaseClosed===true&&r.unknownHttp===false&&r.cleanupDeferred===false&&r.artifactUnchanged===true
  &&r.preflightAclRestored===true&&r.originalBusinessPreserved===true&&!r.failure,'REFUSED: unknown or incomplete preflight outcome');
 assert.ok(r.realWorker?.runtime==='workerd'&&r.realWorker.role==='skolplattform_worker'
  &&/^[a-f0-9]{40}$/u.test(r.realWorker.buildRevision??'')&&/^[a-f0-9]{40}$/u.test(r.realWorker.sourceRevision??''));
 assert.ok(r.checks?.length>=16&&r.checks.every(c=>typeof c.name==='string'&&c.name.length>0&&c.ok===true));
 assert.ok(/^[a-f0-9]{64}$/u.test(r.baselineFingerprint??'')&&r.baselineFingerprint===r.finalFingerprint);
 assert.deepEqual(r.beforeAcl,r.afterAcl);assert.ok(Array.isArray(r.beforeAcl)&&r.beforeAcl.length>0);
 assert.deepEqual(r.beforeHashes,r.afterHashes);assert.equal(Object.keys(r.beforeHashes??{}).length,58,'REFUSED: all 58 non-audit/identity public tables required');
 assert.ok(!('security_events' in r.beforeHashes)&&!('identities' in r.beforeHashes));
 assert.ok(r.auditIdentityBaseline?.audit>0&&r.auditIdentityBaseline.identities>0);
 const baselineMissing=r.auditIdentityBaseline.missing_identity_anchors;
 assert.ok(Number.isSafeInteger(baselineMissing)&&baselineMissing>=0,'REFUSED: measured original missing-anchor baseline required');
 const anchors=r.auditIdentityProof;assert.ok(anchors&&anchors.changed_audit===0&&anchors.changed_identities===0
  &&anchors.missing_identity_anchors===baselineMissing&&anchors.new_missing_identity_anchors===0&&anchors.added_audit>0,
  'REFUSED: original anchors changed or a new audit event lost its identity');
 const cleanup=r.cleanup;assert.ok(cleanup&&cleanup.originalBusinessUnchanged===true);
 for(const field of ['libraryVersions','unitPackages','offeringUnits','customers','sessions','plans','receipts','educationEvents','offerings','mandates','mintedSessions','triggers','functions','gymReceipts','timplans','classLinks'])assert.equal(cleanup[field],0,`REFUSED: incomplete cleanup ${field}`);
 assert.ok(cleanup.preservedAuditEvents>0&&cleanup.preservedAuditAnchors>0);assert.deepEqual(cleanup.before,cleanup.after);
 if(cleanup.status!==undefined)assert.equal(cleanup.status,'PASS');
 assert.deepEqual(r.sourceHashes,r.finalSourceHashes);assert.deepEqual(r.sourceHashes,currentHashes,'REFUSED: stale actual preflight sources');
 assert.ok(Object.keys(currentHashes).length>=25&&Object.values(currentHashes).every(h=>/^[a-f0-9]{64}$/u.test(h)));
 const entry=r.beforeAcl.find(a=>a.f===signature);assert.ok(entry&&entry.granted===false,'REFUSED: original copy grant must be closed');
 return r;
}
const currentApiHashes=()=>Object.fromEntries(apiPaths.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
export const activationHashes=()=>Object.fromEntries(['work/pilot/activate-atomic-cohort-copy.mjs','work/pilot/activate-atomic-cohort-copy.test.mjs',
 'supabase/tests/phase5_atomic_cohort_copy.test.sql','supabase/migrations/'+grantName].map(p=>[p,sha(readFileSync(resolve(root,p)))]));
async function functions(db){return [...await db`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`];}
async function targetAcl(db){return [...await db`select a.grantee::text,a.grantor::text,a.privilege_type,a.is_grantable from pg_proc p
 cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(${signature}) order by a.grantee,a.grantor,a.privilege_type,a.is_grantable`];}
async function grantState(db){return(await db`select has_function_privilege('skolplattform_worker',to_regprocedure(${signature}),'execute') worker,
 has_function_privilege('anon',to_regprocedure(${signature}),'execute') anon,has_function_privilege('authenticated',to_regprocedure(${signature}),'execute') authenticated,
 has_function_privilege('service_role',to_regprocedure(${signature}),'execute') service_role,
 has_function_privilege('skolplattform_worker','public.phase5_programplan_copy_audit(text,uuid)','execute') helper,
 has_table_privilege('skolplattform_worker','public.programplan_education_receipts','select') receipts,
 exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid=to_regprocedure(${signature}) and a.grantee=0 and a.privilege_type='EXECUTE') public`)[0];}
async function journal(db){return [...await db`select version,name,statements from supabase_migrations.schema_migrations order by version`];}
export async function activateAtomicCopy(args){
 const options=activationOptions(args),mode=options.mode,apiRaw=readFileSync(options['--api-evidence']),apiHash=sha(apiRaw),api=JSON.parse(apiRaw);
 const sources=currentApiHashes(),ownedSources=activationHashes();requireCopyPreflight(api,sources);
 const buildRoot=realpathSync(api.realWorker.buildRoot),runtimeRoot=join(root,'work/pilot/targets/protected/runtime/');
 assert.ok(buildRoot===join(root,'web/dist-protected')||buildRoot.startsWith(runtimeRoot)
  ||/^\/private\/tmp\/skolplattform-copy-runtime-\d{8}-[A-Za-z0-9_-]+\/web(?:\/dist-protected)?$/u.test(buildRoot),'REFUSED: owned protected build required');
 const marker=JSON.parse(readFileSync(join(buildRoot,'build-mode.json'),'utf8'));assert.equal(marker.mode,'protected');assert.equal(marker.revision,api.realWorker.buildRevision);
 assert.deepEqual(artifactManifest(buildRoot),api.realWorker.artifact,'REFUSED: actual Worker build changed');
 let prior;if(mode==='--apply'){
  prior=JSON.parse(readFileSync(options['--evidence'],'utf8'));
  assert.ok(prior.kind==='atomic-cohort-copy-activation'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.rollbackRestored&&prior.databaseClosed&&!prior.committed);
  assert.equal(prior.apiEvidenceHash,apiHash);assert.deepEqual(prior.sourceHashes,sources);assert.deepEqual(prior.activationSourceHashes,ownedSources);
  assert.deepEqual(prior.beforeHashes,prior.afterHashes);assert.equal(prior.baselineFingerprint,api.finalFingerprint);assert.equal(prior.finalFingerprint,api.finalFingerprint);
 }
 // Evidence, sources and artifact are all validated before target/DB access.
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let before,after,baselineFingerprint,grantFingerprint,expectedFinalFingerprint,finalFingerprint,beforeFunctions,beforeTargetAcl,afterTargetAcl,beforeJournal,afterJournal,state,failure,committed=false,databaseClosed=false;
 try{
  before=await allPublicHashes(db);baselineFingerprint=await vocationalDatabaseFingerprint(db);assert.equal(baselineFingerprint,api.finalFingerprint,'REFUSED: DB differs from closed actual preflight');
  for(const table of Object.keys(api.beforeHashes))assert.deepEqual(before[table],api.beforeHashes[table],'REFUSED: business changed after actual preflight');
  beforeFunctions=await functions(db);beforeTargetAcl=await targetAcl(db);beforeJournal=await journal(db);
  if(prior){assert.deepEqual(before,prior.beforeHashes);assert.deepEqual(beforeFunctions,prior.beforeFunctions);assert.deepEqual(beforeTargetAcl,prior.beforeTargetAcl);assert.deepEqual(beforeJournal,prior.beforeJournal);}
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal(await vocationalDatabaseFingerprint(tx),baselineFingerprint);assert.deepEqual(await allPublicHashes(tx),before);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261014100000'`).length,1);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);
   const initial=await grantState(tx);assert.ok(Object.values(initial).every(v=>v===false),'REFUSED: closed copy foundation required');
   const source=readFileSync(resolve(root,'supabase/migrations',grantName),'utf8');assert.equal(sha(source),api.sourceHashes['supabase/migrations/'+grantName]);
   await tx.unsafe(source);await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_atomic_cohort_copy.test.sql'),'utf8'));
   state=await grantState(tx);assert.equal(state.worker,true);assert.ok(Object.entries(state).filter(([k])=>k!=='worker').every(([,v])=>v===false));
   const currentFunctions=await functions(tx),normalize=r=>r.signature.replace(/^public\./u,'').replace(/,\s*/gu,',')===signature.replace(/^public\./u,'')?{...r,acl:'<only intended Worker execute>'}:r;
   assert.deepEqual(currentFunctions.map(normalize),beforeFunctions.map(normalize),'Unexpected function definition owner or other raw ACL change');
   afterTargetAcl=await targetAcl(tx);const workerOid=(await tx`select oid::text from pg_roles where rolname='skolplattform_worker'`)[0].oid;
   assert.deepEqual(afterTargetAcl.filter(a=>a.grantee!==workerOid),beforeTargetAcl);const added=afterTargetAcl.filter(a=>a.grantee===workerOid);
   assert.equal(added.length,1);assert.equal(added[0].privilege_type,'EXECUTE');assert.equal(added[0].is_grantable,false);
   assert.deepEqual(await allPublicHashes(tx),before);assert.deepEqual(await journal(tx),beforeJournal);grantFingerprint=await vocationalDatabaseFingerprint(tx);
   if(prior)assert.equal(grantFingerprint,prior.grantFingerprint);assert.deepEqual(currentApiHashes(),sources);assert.deepEqual(activationHashes(),ownedSources);assert.deepEqual(artifactManifest(buildRoot),api.realWorker.artifact);
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'phase5_worker_atomic_cohort_copy',${[source]})`;
   expectedFinalFingerprint=await vocationalDatabaseFingerprint(tx);afterJournal=await journal(tx);assert.deepEqual(afterJournal,[...beforeJournal,{version,name:'phase5_worker_atomic_cohort_copy',statements:[source]}]);
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await allPublicHashes(db);finalFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);
  if(committed){assert.equal(finalFingerprint,expectedFinalFingerprint);assert.deepEqual(await journal(db),afterJournal);assert.deepEqual(await targetAcl(db),afterTargetAcl);copyFileSync(resolve(root,'supabase/migrations',grantName),resolve(target.workdir,'supabase/migrations',grantName));}
  else{assert.equal(finalFingerprint,baselineFingerprint);assert.deepEqual(await functions(db),beforeFunctions);assert.deepEqual(await targetAcl(db),beforeTargetAcl);assert.deepEqual(await journal(db),beforeJournal);}
  assert.deepEqual(currentApiHashes(),sources);assert.deepEqual(activationHashes(),ownedSources);assert.deepEqual(artifactManifest(buildRoot),api.realWorker.artifact);
 }catch(e){failure=e;}finally{await db.end({timeout:5});databaseClosed=true;}
 const report={kind:'atomic-cohort-copy-activation',status:failure?'FAIL':'PASS',target:'protected',mode,committed,databaseClosed,
  apiEvidenceHash:apiHash,sourceHashes:sources,activationSourceHashes:ownedSources,buildRevision:api.realWorker.buildRevision,artifact:api.realWorker.artifact,
  beforeHashes:before,afterHashes:after,baselineFingerprint,grantFingerprint,expectedFinalFingerprint,finalFingerprint,
  beforeFunctions,beforeTargetAcl,afterTargetAcl,beforeJournal,afterJournal,grantState:state,rollbackRestored:!committed&&baselineFingerprint===finalFingerprint,
  failure:failure?{code:failure.code,message:failure.message}:null};
 writeFileSync(options['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: atomic copy activation ${mode}`);if(failure)process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await activateAtomicCopy(process.argv.slice(2));
