#!/usr/bin/env node
// Two exact Worker grants, only after source/artifact-bound actual preflight.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {sourceHashes as apiHashes} from './verify-school-registry-api.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {signatures,grantName,migrationName} from './verify-school-registry.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=grantName.slice(0,14),rollback=Error('school_registry_activation_rollback');
const sha=value=>createHash('sha256').update(value).digest('hex');
export function activationOptions(args){
 const mode=args[0],opts={};assert.ok(['--verify','--apply'].includes(mode));
 for(let i=1;i<args.length;i+=2){const key=args[i];assert.ok(['--api-evidence','--evidence','--out'].includes(key)&&args[i+1]&&!opts[key]);const path=resolve(args[i+1]);assert.ok(path.startsWith('/private/tmp/')&&path.endsWith('.json'));opts[key]=path;}
 assert.ok(opts['--api-evidence']&&opts['--out']);assert.ok(mode==='--verify'?!opts['--evidence']:opts['--evidence']);return{mode,...opts};
}
export function requireRegistryPreflight(r,currentHashes){
 assert.ok(r?.kind==='school-registry-built-worker'&&r.status==='PASS'&&r.preflight===true&&r.scope==='isolated-local-customer-public-reference-register');
 assert.ok(r.databaseClosed===true&&r.unknownHttp===false&&r.cleanupDeferred===false&&r.preflightAclRestored===true&&!r.failure);
 assert.ok(r.build?.mode==='protected'&&/^[a-f0-9]{40}$/.test(r.build.revision));
 assert.ok(r.checks?.length>=20&&r.checks.every(c=>c.ok===true&&typeof c.name==='string'&&c.name.length>0));
 assert.ok(/^[a-f0-9]{64}$/.test(r.baselineFingerprint)&&r.baselineFingerprint===r.finalFingerprint);
 assert.ok(r.beforeAcl?.length===2&&r.beforeAcl.every(a=>a.allowed===false));assert.deepEqual(r.beforeAcl,r.afterAcl);
 assert.ok(Object.keys(r.beforeHashes??{}).length>=50);assert.deepEqual(r.beforeHashes,r.afterHashes);
 assert.deepEqual(r.auditIdentityProof,{audit_changes:0,identity_changes:0,new_missing_anchors:0});
 assert.ok(r.cleanup&&r.originalRows===r.finalRows&&/^[a-f0-9]{64}$/.test(r.originalRows));
 assert.deepEqual(r.sourceHashes,r.finalSourceHashes);assert.deepEqual(r.sourceHashes,currentHashes);
 assert.ok(Object.keys(currentHashes).length>=15&&Object.values(currentHashes).every(h=>/^[a-f0-9]{64}$/.test(h)));
 return r;
}
export const activationHashes=()=>Object.fromEntries(['work/pilot/activate-school-registry.mjs','work/pilot/activate-school-registry.test.mjs',
 'supabase/migrations/'+grantName].map(p=>[p,sha(readFileSync(resolve(root,p)))]));
const normalize=signature=>signature.replace(/^public\./,'').replace(/,\s*/g,',');
async function functions(db){return Array.from(await db`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`);}
async function targetAcl(db){return Array.from(await db`select p.oid::regprocedure::text signature,a.grantee::text,a.grantor::text,a.privilege_type,a.is_grantable from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname in ('phase5_school_registry_list','phase5_school_registry_save') order by 1,a.grantee,a.grantor,a.privilege_type,a.is_grantable`);}
async function assertState(db,active){
 for(const f of signatures){const [s]=await db`select has_function_privilege('skolplattform_worker',to_regprocedure(${f}),'execute') worker,has_function_privilege('anon',to_regprocedure(${f}),'execute') anon,has_function_privilege('authenticated',to_regprocedure(${f}),'execute') authenticated,has_function_privilege('service_role',to_regprocedure(${f}),'execute') service_role`;
  assert.equal(s.worker,active);assert.ok(!s.anon&&!s.authenticated&&!s.service_role);}
 for(const f of ['public.phase5_school_registry_actor()','public.phase5_school_registry_revision(uuid)','public.phase5_school_registry_audit(text,uuid)'])assert.equal((await db`select has_function_privilege('skolplattform_worker',to_regprocedure(${f}),'execute') allowed`)[0].allowed,false);
 assert.equal((await db`select has_table_privilege('skolplattform_worker','public.school_registry_receipts','select,insert,update,delete,truncate,references,trigger') allowed`)[0].allowed,false);
 assert.equal((await db`select count(*)::int n from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_school_registry_%' and a.grantee=0 and a.privilege_type='EXECUTE'`)[0].n,0);
}
async function journal(db){return Array.from(await db`select version,name,statements from supabase_migrations.schema_migrations order by version`);}
export async function activateSchoolRegistry(args){
 const options=activationOptions(args),mode=options.mode,apiRaw=readFileSync(options['--api-evidence']),apiHash=sha(apiRaw),api=JSON.parse(apiRaw);
 const sources=apiHashes(),ownedSources=activationHashes();requireRegistryPreflight(api,sources);
 const buildRoot=realpathSync(api.buildRoot);
 assert.ok(buildRoot===join(root,'web/dist-protected')||buildRoot.startsWith(join(root,'work/pilot/targets/protected/runtime/'))||/^\/private\/tmp\/skolplattform-school-registry-runtime-\d{8}-[A-Za-z0-9_-]+\/web\/dist-protected$/.test(buildRoot));
 const marker=JSON.parse(readFileSync(join(buildRoot,'build-mode.json'),'utf8'));assert.equal(marker.mode,'protected');assert.equal(marker.revision,api.build.revision);assert.deepEqual(artifactManifest(buildRoot),api.artifact);
 let prior;if(mode==='--apply'){
  prior=JSON.parse(readFileSync(options['--evidence'],'utf8'));assert.ok(prior.kind==='school-registry-activation'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.rollbackRestored&&prior.databaseClosed&&!prior.committed);
  assert.equal(prior.apiEvidenceHash,apiHash);assert.deepEqual(prior.sourceHashes,sources);assert.deepEqual(prior.activationSourceHashes,ownedSources);assert.deepEqual(prior.beforeHashes,prior.afterHashes);assert.equal(prior.finalFingerprint,api.finalFingerprint);
 }
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let before,after,baselineFingerprint,grantFingerprint,finalFingerprint,expectedFinalFingerprint,beforeFunctions,beforeTargetAcl,afterTargetAcl,beforeJournal,afterJournal,failure,committed=false;
 try{
  before=await allPublicHashes(db);baselineFingerprint=await vocationalDatabaseFingerprint(db);assert.equal(baselineFingerprint,api.finalFingerprint);
  for(const table of Object.keys(api.beforeHashes))assert.deepEqual(before[table],api.beforeHashes[table]);
  beforeFunctions=await functions(db);beforeTargetAcl=await targetAcl(db);beforeJournal=await journal(db);
  if(prior){assert.deepEqual(before,prior.beforeHashes);assert.deepEqual(beforeFunctions,prior.beforeFunctions);assert.deepEqual(beforeTargetAcl,prior.beforeTargetAcl);assert.deepEqual(beforeJournal,prior.beforeJournal);}
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal(await vocationalDatabaseFingerprint(tx),baselineFingerprint);assert.deepEqual(await allPublicHashes(tx),before);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version=${migrationName.slice(0,14)}`).length,1);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);await assertState(tx,false);
   const source=readFileSync(resolve(root,'supabase/migrations',grantName),'utf8');assert.equal(sha(source),api.sourceHashes['supabase/migrations/'+grantName]);await tx.unsafe(source);await assertState(tx,true);
   const mask=r=>signatures.map(normalize).includes(normalize(r.signature))?{...r,acl:'<intended Worker EXECUTE>'}:r;
   assert.deepEqual((await functions(tx)).map(mask),beforeFunctions.map(mask));
   afterTargetAcl=await targetAcl(tx);const workerOid=(await tx`select oid::text from pg_roles where rolname='skolplattform_worker'`)[0].oid;
   assert.deepEqual(afterTargetAcl.filter(a=>a.grantee!==workerOid),beforeTargetAcl);const added=afterTargetAcl.filter(a=>a.grantee===workerOid);assert.equal(added.length,2);assert.ok(added.every(a=>a.privilege_type==='EXECUTE'&&!a.is_grantable));
   assert.deepEqual(await allPublicHashes(tx),before);assert.deepEqual(await journal(tx),beforeJournal);grantFingerprint=await vocationalDatabaseFingerprint(tx);if(prior)assert.equal(grantFingerprint,prior.grantFingerprint);
   assert.deepEqual(apiHashes(),sources);assert.deepEqual(activationHashes(),ownedSources);assert.deepEqual(artifactManifest(buildRoot),api.artifact);
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'phase5_worker_school_registry',${[source]})`;
   expectedFinalFingerprint=await vocationalDatabaseFingerprint(tx);afterJournal=await journal(tx);assert.deepEqual(afterJournal,[...beforeJournal,{version,name:'phase5_worker_school_registry',statements:[source]}]);
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await allPublicHashes(db);finalFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);
  if(committed){assert.equal(finalFingerprint,expectedFinalFingerprint);assert.deepEqual(await targetAcl(db),afterTargetAcl);assert.deepEqual(await journal(db),afterJournal);copyFileSync(resolve(root,'supabase/migrations',grantName),resolve(target.workdir,'supabase/migrations',grantName));}
  else{assert.equal(finalFingerprint,baselineFingerprint);assert.deepEqual(await functions(db),beforeFunctions);assert.deepEqual(await targetAcl(db),beforeTargetAcl);assert.deepEqual(await journal(db),beforeJournal);}
  assert.deepEqual(apiHashes(),sources);assert.deepEqual(activationHashes(),ownedSources);assert.deepEqual(artifactManifest(buildRoot),api.artifact);
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'school-registry-activation',status:failure?'FAIL':'PASS',mode,target:'protected',committed,databaseClosed:true,apiEvidenceHash:apiHash,sourceHashes:sources,activationSourceHashes:ownedSources,
  beforeHashes:before,afterHashes:after,baselineFingerprint,grantFingerprint,finalFingerprint,expectedFinalFingerprint,beforeFunctions,beforeTargetAcl,afterTargetAcl,beforeJournal,afterJournal,
  rollbackRestored:!committed&&baselineFingerprint===finalFingerprint,failure:failure?{code:failure.code,message:failure.message}:null};
 writeFileSync(options['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: school registry activation ${mode}`);if(failure)process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await activateSchoolRegistry(process.argv.slice(2));
