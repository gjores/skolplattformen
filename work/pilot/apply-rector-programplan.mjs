#!/usr/bin/env node
// Preparation/installation only; imports are inert. --verify never runs live DDL.
import assert from 'node:assert/strict';
import {readPrivateEvidence,sha,productSources,savePrivateReport,assertOldRights} from './apply-named-timplans.mjs';
export {readPrivateEvidence,sha,productSources,savePrivateReport,assertOldRights};
import {readFileSync,writeFileSync,openSync,closeSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {catalogColumns,projectionHashes,connect,classCohortTargetIdentity} from './verify-class-cohort.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const migrations=['20261016100000_rector_programplan_creation.sql'];
const ident=v=>'"'+v.replaceAll('"','""')+'"';
export const migrationSources=()=>Object.fromEntries(migrations.map(n=>['supabase/migrations/'+n,sha(readFileSync(resolve(root,'supabase/migrations',n)))]));
const hashPattern=/^[a-f0-9]{64}$/u;
export const allowedFunctions=[
 'phase5_programplan_selection(uuid,text,jsonb)',
 'phase5_programplan_organisation_actor()',
 'phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb)',
 'phase5_programplan_education_status(uuid)',
 'phase5_programplan_copy_audit(text,uuid)',
 'phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)',
];
export function assertStructureTransition(before,after){
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 for(const key of Object.keys(before).filter(k=>k!=='functions'))assert.deepEqual(after[key],before[key],'Non-function structure changed');
 const bySignature=new Map(after.functions.map(f=>[f.signature,f]));assert.equal(bySignature.size,after.functions.length);
 assert.equal(after.functions.length,before.functions.length,'Function set changed');
 const changed=[];
 for(const old of before.functions){const current=bySignature.get(old.signature);assert.ok(current,'Function removed');
  const {definition:oldDefinition,...oldMetadata}=old,{definition:newDefinition,...newMetadata}=current;
  assert.deepEqual(newMetadata,oldMetadata,'Function ownership/grants changed');
  if(oldDefinition!==newDefinition){assert.ok(allowedFunctions.includes(old.signature.replace(/^public\./u,'')),'Unapproved function changed');changed.push(old.signature.replace(/^public\./u,''));}
 }
 assert.deepEqual(changed.sort(),[...allowedFunctions].sort(),'Exact six function replacements required');
 return true;
}
export function requirePackageProof(sql,api,{sources,packages}){
 assert.equal(sql.kind,'rector-programplan-schema-only-sql');assert.equal(sql.status,'PASS');assert.ok(sql.checks.length>0&&sql.checks.every(c=>c.ok===true));
 assert.equal(sql.rollback,true);assert.equal(sql.grantsUnchanged,true);assert.equal(sql.cleanup.cleanup,'complete');assert.equal(sql.snapshot.dataCopied,false);
 assert.ok(Object.keys(sql.migrationBeforeRows).length>0);assert.deepEqual(sql.migrationAfterRows,sql.migrationBeforeRows);
 assert.deepEqual(Object.keys(sql.beforeRows).sort(),Object.keys(sql.migrationBeforeRows).sort());assert.deepEqual(sql.afterRows,sql.beforeRows);
 assert.match(sql.beforeSchemaFingerprint,hashPattern);assert.equal(sql.beforeSchemaFingerprint,sql.snapshot.sourceFingerprint);assert.equal(sql.afterSchemaFingerprint,sql.beforeSchemaFingerprint);
 assert.match(sql.installedSchemaFingerprint,hashPattern);assert.notEqual(sql.installedSchemaFingerprint,sql.beforeSchemaFingerprint);
 assert.deepEqual(sql.finalSources,sql.sources);for(const [p,h]of Object.entries(packages))assert.equal(sql.sources[p],h,'SQL package changed');
 assert.equal(api.kind,'rector-programplan-actual-api-browser');assert.equal(api.status,'PASS');assert.ok(api.checks.length>0&&api.checks.every(c=>c.ok===true));assert.ok(api.api);
 assert.deepEqual(api.sources,sources);assert.deepEqual(api.finalSources,sources);assert.deepEqual(api.migrationSources,packages);assert.deepEqual(api.finalMigrationSources,packages);
 assert.equal(api.build.mode,'protected');assert.equal(api.runtime.baseURL,'http://127.0.0.1:3014');assert.deepEqual(api.finalArtifact,api.runtime.artifact);assert.ok(api.finalArtifact.fileCount>0);
 assert.equal(api.snapshot.dataCopied,false);assert.ok(api.oidcCleanup.verifiedCallbacks>0);assert.deepEqual(api.finalVerificationSources,api.verificationSources);assert.equal(api.runtimeCleanup.cleanup,'complete');assert.equal(api.snapshotCleanup.cleanup,'complete');assert.equal(api.oidcCleanup.cleanup,'complete');
 assert.equal(api.snapshot.sourceFingerprint,sql.snapshot.sourceFingerprint);
 for(const device of ['desktop','phone']){const b=api.browserEvidence[device];assert.equal(b.visualReview,'reviewed');assert.equal(b.result.status,'PASS');assert.equal(b.result.device,device);assert.ok(b.result.checks.length>0);assert.ok(b.result.screenshots.length>0);assert.match(b.sha256,/^[a-f0-9]{64}$/u);assert.deepEqual(Object.keys(b.screenshotHashes).sort(),b.result.screenshots.map(s=>s.file).sort());for(const h of Object.values(b.screenshotHashes))assert.match(h,/^[a-f0-9]{64}$/u);}
 return true;
}
export function readPackageEvidence({sqlEvidence,apiEvidence}){
 const sql=readPrivateEvidence(sqlEvidence),api=readPrivateEvidence(apiEvidence),packages=migrationSources(),sources=productSources();requirePackageProof(sql.value,api.value,{sources,packages});
 for(const device of ['desktop','phone']){const ref=api.value.browserEvidence[device],side=readPrivateEvidence(ref.path);assert.equal(side.sha256,ref.sha256);assert.deepEqual(side.value,ref.result);for(const shot of side.value.screenshots){assert.match(shot.file,new RegExp('^'+device+'-[a-z0-9-]+\\.png$','u'));const p=resolve(dirname(side.path),shot.file);assert.equal(realpathSync(p),p);assert.ok(lstatSync(p).isFile());assert.equal(sha(readFileSync(p)),ref.screenshotHashes[shot.file],'Reviewed screenshot changed');}}
 for(const [p,h]of Object.entries({...sql.value.sources,...api.value.verificationSources})){assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));assert.equal(sha(readFileSync(resolve(root,p))),h,'Verification source changed');}
 assert.ok(Object.keys(api.value.verificationSources??{}).length>0,'Verification sources required');
 const buildRoot=realpathSync(api.value.runtime.buildRoot);assert.ok(buildRoot.startsWith(resolve(root,'work/pilot/targets/protected/runtime')+'/'));assert.deepEqual(artifactManifest(buildRoot),api.value.finalArtifact);assert.deepEqual(JSON.parse(readFileSync(resolve(buildRoot,'build-mode.json'),'utf8')),api.value.build);
 return{sql,api,packages,sources,buildRoot};
}
async function rights(db){return{tables:await db`select relname,relacl::text acl,relowner,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname`,functions:await db`select oid::regprocedure::text signature,proacl::text acl,proowner from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1`};}
async function journalHash(db,exclude=[]){return(await db`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by version),''),'UTF8')),'hex') sha256 from supabase_migrations.schema_migrations m where not(version=any(${exclude}::text[]))`)[0];}
export async function installedPackage(db){for(const n of migrations){const [r]=await db`select version,name,statements from supabase_migrations.schema_migrations where version=${n.slice(0,14)}`;assert.ok(r,'Missing rector migration journal');assert.equal(r.name,n.slice(15,-4));assert.deepEqual(r.statements,[readFileSync(resolve(root,'supabase/migrations',n),'utf8')]);}return{packages:migrationSources(),fingerprint:await schemaFingerprint(db)};}
async function absent(db){assert.equal((await db`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${migrations.map(n=>n.slice(0,14))}::text[])`)[0].n,0,'Partial/already installed package refused');}
export async function installRectorPackage(tx){await absent(tx);for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n),'utf8');await tx.unsafe(source);await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${n.slice(0,14)},${n.slice(15,-4)},${[source]})`;}}
export async function applyRectorProgramplan(mode,{sqlEvidence,apiEvidence,evidence,out}){
 assert.ok(['--verify','--apply'].includes(mode));out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'rector-programplan-live-installation',mode,status:'FAIL',stage:'evidence',startedAt:new Date().toISOString(),toolSha256:sha(readFileSync(fileURLToPath(import.meta.url))),committed:false},save=()=>savePrivateReport(out,report);save();let db,locked=false;
 try{
  let prior;if(mode==='--apply'){prior=readPrivateEvidence(evidence);assert.equal(prior.value.kind,report.kind);assert.equal(prior.value.mode,'--verify');assert.equal(prior.value.status,'PASS');assert.equal(prior.value.committed,false);assert.equal(prior.value.toolSha256,report.toolSha256);sqlEvidence=prior.value.sql.path;apiEvidence=prior.value.api.path;report.preflight={path:prior.path,sha256:prior.sha256};}
  const proof=readPackageEvidence({sqlEvidence,apiEvidence});report.sql={path:proof.sql.path,sha256:proof.sql.sha256};report.api={path:proof.api.path,sha256:proof.api.sha256};report.packages=proof.packages;report.build={root:proof.buildRoot,artifact:proof.api.value.finalArtifact};
  if(prior){assert.deepEqual(prior.value.sql,report.sql);assert.deepEqual(prior.value.api,report.api);assert.deepEqual(prior.value.build,report.build);}
  report.stage='read_only_preflight';save();const target=await assertTarget('protected');db=connect(target);report.target=await classCohortTargetIdentity(db,target);if(prior)assert.deepEqual(report.target,prior.value.target);
  assert.equal((await db`select pg_try_advisory_lock(5532) locked`)[0].locked,true);locked=true;
  await db.begin('isolation level repeatable read read only',async tx=>{await absent(tx);report.beforeFingerprint=await schemaFingerprint(tx);assert.equal(report.beforeFingerprint,proof.sql.value.snapshot.sourceFingerprint,'Live schema differs from isolated baseline');report.originalColumns=await catalogColumns(tx);report.beforeProjection=await projectionHashes(tx,report.originalColumns);report.beforeJournal=await journalHash(tx);report.beforeRights=await rights(tx);report.beforeStructure=await schemaFingerprint(tx,true);});
  if(mode==='--apply'){
   assert.equal(prior.value.beforeFingerprint,report.beforeFingerprint);assert.deepEqual(prior.value.originalColumns,report.originalColumns);
   report.stage='bounded_installation';save();await db.begin(async tx=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='25s'`;await tx`set local transaction_timeout='30s'`;
    await tx.unsafe('lock table '+Object.keys(report.originalColumns).sort().map(t=>'public.'+ident(t)).concat('supabase_migrations.schema_migrations').join(',')+' in share row exclusive mode');const start=Date.now();report.lockAcquiredAt=new Date().toISOString();
    await absent(tx);assert.equal(await schemaFingerprint(tx),report.beforeFingerprint);report.beforeProjection=await projectionHashes(tx,report.originalColumns);report.beforeJournal=await journalHash(tx);report.beforeRights=await rights(tx);report.beforeStructure=await schemaFingerprint(tx,true);save();
    await installRectorPackage(tx);assert.deepEqual(await catalogColumns(tx),report.originalColumns);report.afterStructure=await schemaFingerprint(tx,true);assertStructureTransition(report.beforeStructure,report.afterStructure);report.structureVerified=true;assert.equal(await schemaFingerprint(tx),proof.sql.value.installedSchemaFingerprint,'Installed definitions differ from verified SQL');
    report.afterProjection=await projectionHashes(tx,report.originalColumns);assert.deepEqual(report.afterProjection,report.beforeProjection);assertOldRights(report.beforeRights,await rights(tx));
    report.afterOriginalJournal=await journalHash(tx,migrations.map(n=>n.slice(0,14)));assert.deepEqual(report.afterOriginalJournal,report.beforeJournal);report.installed=await installedPackage(tx);assert.deepEqual(migrationSources(),proof.packages);assert.deepEqual(productSources(),proof.sources);assert.deepEqual(artifactManifest(proof.buildRoot),report.build.artifact);
    report.lockHoldMsBeforeCommit=Date.now()-start;report.commitAttempted=true;report.stage='commit_pending';save();
   });report.committed=true;report.stage='committed';report.commitConfirmedAt=new Date().toISOString();save();assert.deepEqual(await installedPackage(db),report.installed);
   report.stage='local_migration_files';save();for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n)),file=resolve(target.workdir,'supabase/migrations',n);if(existsSync(file))assert.equal(sha(readFileSync(file)),sha(source));else writeFileSync(file,source,{flag:'wx',mode:0o600});}report.localMigrationFilesSynced=true;
  }
  assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))),report.toolSha256);report.status='PASS';
 }catch(error){report.failure={code:error.code??'ASSERTION',messageSha256:sha(String(error.message??''))};report.recoveryRequired=report.commitAttempted===true;report.failedStage=report.stage;}
 finally{if(db)try{if(locked)await db`select pg_advisory_unlock(5532)`;await db.end({timeout:5});report.databaseClosed=true;}catch{report.status='FAIL';report.databaseClosed=false;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: rector programplan installation ${mode}; committed=${report.committed}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [mode,...args]=process.argv.slice(2),options={};try{for(let i=0;i<args.length;i+=2){assert.ok(['--sql-evidence','--api-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);const k={'--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--evidence':'evidence','--out':'out'}[args[i]];assert.ok(!options[k]);options[k]=resolve(args[i+1]);}const r=await applyRectorProgramplan(mode,options);if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: rector programplan installation preflight');process.exitCode=1;}}
