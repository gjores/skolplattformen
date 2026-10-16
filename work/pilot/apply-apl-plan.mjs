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
export const migrations=['20261016120000_apl_planning.sql','20261016121000_apl_plan_decisions.sql','20261016122000_apl_worker_access.sql'];
const ident=v=>'"'+v.replaceAll('"','""')+'"';
export const migrationSources=()=>Object.fromEntries(migrations.map(n=>['supabase/migrations/'+n,sha(readFileSync(resolve(root,'supabase/migrations',n)))]));
const hashPattern=/^[a-f0-9]{64}$/u;
export const allowedFunctions=[
 'phase5_plan_decision_detail(text,uuid)','phase5_plan_decision_basis(text,uuid)',
 'phase5_plan_decision_command(jsonb)','phase5_plan_decision_items()',
 'phase5_named_timplan_copy_rows(uuid,jsonb,uuid)',
];
export const aplTables=['apl_plan_underlag','apl_plan_periods','apl_period_contents','apl_time_allocations',
 'apl_plan_copy_reviews','apl_rector_confirmations','apl_plan_commands','apl_plan_write_permits','apl_plan_decision_receipts'];
export const workerFunctions=['phase5_apl_plan_read(uuid)','phase5_apl_plan_command(jsonb)','phase5_apl_plan_status(jsonb)'];
export const newFunctions=[
 'phase5_apl_text(jsonb,integer,boolean)','phase5_apl_date(jsonb)','phase5_apl_uuid(jsonb)','phase5_apl_row_key(jsonb)',
 'phase5_apl_plan_parse(jsonb)','phase5_apl_plan_request(jsonb)','phase5_apl_write_guard()','phase5_apl_timplan_cells_guard()',
 'phase5_apl_plan_scope(uuid,boolean)','phase5_apl_plan_value(uuid)','phase5_apl_copy_review(uuid)','phase5_apl_program(jsonb)',
 'phase5_apl_canonical(jsonb)','phase5_apl_hash_payload(jsonb,uuid,jsonb,jsonb,jsonb)','phase5_apl_hash_value(jsonb,uuid,jsonb,jsonb,jsonb)',
 'phase5_apl_content_hash(uuid)','phase5_apl_plan_basis(uuid)','phase5_apl_plan_projection(uuid)','phase5_apl_plan_audit(uuid,text)',
 'phase5_apl_plan_read(uuid)','phase5_apl_plan_command(jsonb)','phase5_apl_plan_status(jsonb)',
 'phase5_apl_allocation_issues(jsonb,jsonb)','phase5_apl_validate_allocations(jsonb,jsonb)',
 'phase5_apl_confirmation_blockers(jsonb,jsonb,jsonb,jsonb)','phase5_apl_decision_receipt_guard()',
 'phase5_apl_decision_receipt_required()','phase5_apl_decision_underlag(uuid)','phase5_apl_copy_audit(uuid,uuid)','phase5_apl_copy_structure(uuid,uuid)',
];
const signature=s=>s.replace(/^public\./u,'').replaceAll(', ', ',');
const normalized=value=>JSON.parse(JSON.stringify(value));
export function assertColumnTransition(before,after){
 assert.deepEqual(Object.keys(after).filter(t=>!Object.hasOwn(before,t)).sort(),[...aplTables].sort());
 for(const [table,columns] of Object.entries(before))assert.deepEqual(after[table],columns,'Existing columns changed');
}
export function assertStructureTransition(beforeValue,afterValue){
 const before=normalized(beforeValue),after=normalized(afterValue);
 assert.deepEqual(Object.keys(before).sort(),['columns','constraints','functions','indexes','policies','tables','triggers']);
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 const oldFunctions=new Map(before.functions.map(f=>[signature(f.signature),f])),nextFunctions=new Map(after.functions.map(f=>[signature(f.signature),f]));
 assert.equal(oldFunctions.size,before.functions.length);assert.equal(nextFunctions.size,after.functions.length);
 const changed=[];
 for(const [name,old] of oldFunctions){const current=nextFunctions.get(name);assert.ok(current,'Function removed');
  const {definition:oldDefinition,...oldMetadata}=old,{definition:newDefinition,...newMetadata}=current;
  assert.deepEqual(newMetadata,oldMetadata,'Existing function metadata or privileges changed');
  if(oldDefinition!==newDefinition){assert.ok(allowedFunctions.includes(name),'Unexpected function changed');changed.push(name);}
 }
 assert.deepEqual(changed.sort(),[...allowedFunctions].sort());
 const added=after.functions.filter(f=>!oldFunctions.has(signature(f.signature)));
 assert.deepEqual(added.map(f=>signature(f.signature)).sort(),[...newFunctions].sort());
 const owner=before.tables.find(t=>t.relname==='timplans').owner;
 // Existing actor helpers may also permit service_role. New APL helpers must be owner-only.
 const actor=before.functions.find(f=>signature(f.signature)==='phase5_programplan_actor()');assert.equal(actor.owner,owner);
 const ownerGrantor=actor.acl?.slice(1,-1).split(',')[0].split('/')[1];assert.match(ownerGrantor,/^[a-z_][a-z_0-9]*$/u);
 const ownerAcl='{'+ownerGrantor+'=X/'+ownerGrantor+'}';
 for(const fn of added){assert.equal(fn.owner,owner);const allowed=workerFunctions.includes(signature(fn.signature))
  ?'{'+ownerAcl.slice(1,-1)+',skolplattform_worker=X/'+ownerGrantor+'}':ownerAcl;
  assert.equal(fn.acl,allowed,'New helper or RPC privileges differ from exact owner/Worker allowance');}
 const oldRelations=new Set(before.tables.map(t=>t.relname));
 for(const key of ['tables','columns','constraints']){
  assert.deepEqual(after[key].filter(r=>oldRelations.has(r.relname)),before[key],'Existing '+key+' changed');
 }
 const newTables=after.tables.filter(t=>!oldRelations.has(t.relname)&&t.relkind==='r');
 assert.deepEqual(newTables.map(t=>t.relname).sort(),[...aplTables].sort());
 const newRelations=after.tables.filter(t=>!oldRelations.has(t.relname));
 for(const relation of newRelations){assert.equal(relation.owner,owner);assert.ok(['r','i'].includes(relation.relkind));
  if(relation.relkind==='r'){assert.equal(relation.relrowsecurity,true);assert.equal(relation.relforcerowsecurity,true);}
 }
 for(const key of ['indexes','policies']){const oldNames=new Set(before[key].map(r=>JSON.stringify(r)));
  for(const row of before[key])assert.ok(after[key].some(r=>JSON.stringify(r)===JSON.stringify(row)),'Existing '+key+' removed or changed');
  for(const row of after[key].filter(r=>!oldNames.has(JSON.stringify(r))))assert.ok(aplTables.includes(row.tablename),'Unexpected '+key+' added');
 }
 const oldTriggers=new Set(before.triggers.map(r=>JSON.stringify(r)));
 for(const row of before.triggers)assert.ok(after.triggers.some(r=>JSON.stringify(r)===JSON.stringify(row)),'Existing trigger changed');
 const oldTableAdditions=[];
 for(const row of after.triggers.filter(r=>!oldTriggers.has(JSON.stringify(r))))if(!aplTables.includes(row.relname))oldTableAdditions.push(row.relname+'.'+row.tgname);
 assert.deepEqual(oldTableAdditions.sort(),['plan_decision_receipts.plan_decision_apl_receipt_required','timplan_cells.timplan_cells_apl_guard']);
 return true;
}
export async function checkInstalledAdditions(db){
 for(const table of aplTables){
  assert.equal((await db.unsafe('select count(*)::int n from public.'+ident(table)))[0].n,0,'Installation must not backfill APL');
  for(const role of ['anon','authenticated','service_role','skolplattform_worker'])
   assert.equal((await db`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false);
 }
 for(const fn of newFunctions)for(const role of ['anon','authenticated','service_role','skolplattform_worker'])
  assert.equal((await db`select has_function_privilege(${role},${'public.'+fn},'EXECUTE') allowed`)[0].allowed,role==='skolplattform_worker'&&workerFunctions.includes(fn));
}
export const requiredRaces={
 'same ID same request':'committed','same ID different request':'40001',
 'save before save':'40001','save before row':'40001','save before confirm':'40001','confirm before save':'40001',
 'save before submit':'40001','submit before save':'42501','approve before save':'42501',
 'new version before save':'42501','copy before source save':'committed','mandate revoke before queued save':'42501',
};
export function assertSharedSourceHashes(...manifests){
 const seen=new Map();
 for(const manifest of manifests)for(const [file,hash]of Object.entries(manifest)){
  assert.match(hash,hashPattern);
  if(seen.has(file))assert.equal(hash,seen.get(file),'Conflicting verification source: '+file);
  seen.set(file,hash);
 }
}
export function requirePackageProof(sql,api,{sources,packages}){
 assertSharedSourceHashes(sql.sources,api.verificationSources,sources);
 assert.equal(sql.kind,'apl-full-private-worker-sql');assert.equal(sql.schemaVersion,1);assert.equal(sql.status,'PASS');
 assert.ok(sql.checks.length>0&&sql.checks.every(c=>c.ok===true));assert.equal(sql.cleanup.cleanup,'complete');assert.equal(sql.snapshot.dataCopied,false);
 assert.equal(sql.migrationRollbackRestored,true);assert.equal(sql.rollback.restored,true);
 assert.match(sql.baseline.fingerprint,hashPattern);assert.equal(sql.baseline.fingerprint,sql.snapshot.sourceFingerprint);
 assert.equal(sql.rollback.fingerprint,sql.baseline.fingerprint);assert.deepEqual(sql.rollback.structure,sql.baseline.structure);assert.deepEqual(sql.rollback.rows,sql.baseline.rows);
 assert.match(sql.installed.fingerprint,hashPattern);assert.notEqual(sql.installed.fingerprint,sql.baseline.fingerprint);
 assert.equal(sql.final.fingerprint,sql.installed.fingerprint);assert.deepEqual(sql.final.structure,sql.installed.structure);
 assertStructureTransition(sql.baseline.structure,sql.installed.structure);
 assert.equal(sha(JSON.stringify(sql.baseline.structure)),sql.baseline.fingerprint);assert.equal(sha(JSON.stringify(sql.installed.structure)),sql.installed.fingerprint);
 assert.ok(Object.keys(sql.baseline.rows).length>0);
 for(const [table,rows]of Object.entries(sql.baseline.rows))assert.deepEqual(sql.installed.rows[table],rows,'Migration modified existing rows');
 assert.ok(sql.originalPreservation.tables>0&&sql.originalPreservation.exactPreservedRows>0);
 assert.equal(sql.grants.tableColumnHelperDefinitionChanges,0);assert.deepEqual(sql.grants.removed,[]);
 assert.deepEqual(sql.grants.added.map(r=>signature(r.signature)).sort(),[...workerFunctions].sort());
 assert.ok(sql.grants.added.every(r=>r.grantee==='skolplattform_worker'&&r.privilege==='EXECUTE'&&!r.grantable));
 assert.deepEqual(sql.races.map(r=>r.name).sort(),Object.keys(requiredRaces).sort());for(const race of sql.races){assert.ok(Number.isInteger(race.leftPid)&&Number.isInteger(race.rightPid)&&race.leftPid!==race.rightPid);
  assert.ok(race.blockers.includes(race.leftPid));assert.equal(race.wait_event_type,'Lock');assert.equal(race.left,'committed');assert.equal(race.right,requiredRaces[race.name]);}
 assert.deepEqual(sql.finalSources,sql.sources);assert.deepEqual(sql.migrations,packages);
 for(const [p,h]of Object.entries(packages))assert.equal(sql.sources[p],h,'SQL package changed');
 assert.equal(api.kind,'apl-plan-actual-api-browser');assert.equal(api.status,'PASS');assert.ok(api.checks.length>0&&api.checks.every(c=>c.ok===true));assert.ok(api.api);
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
 for(const [p,h]of [sql.value.sources,api.value.verificationSources].flatMap(manifest=>Object.entries(manifest))){assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));assert.equal(sha(readFileSync(resolve(root,p))),h,'Verification source changed');}
 assert.ok(Object.keys(api.value.verificationSources??{}).length>0,'Verification sources required');
 const buildRoot=realpathSync(api.value.runtime.buildRoot);assert.ok(buildRoot.startsWith(resolve(root,'work/pilot/targets/protected/runtime')+'/'));assert.deepEqual(artifactManifest(buildRoot),api.value.finalArtifact);assert.deepEqual(JSON.parse(readFileSync(resolve(buildRoot,'build-mode.json'),'utf8')),api.value.build);
 return{sql,api,packages,sources,buildRoot};
}
async function rights(db){return{tables:await db`select relname,relacl::text acl,relowner,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname`,functions:await db`select oid::regprocedure::text signature,proacl::text acl,proowner from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1`};}
async function journalHash(db,exclude=[]){return(await db`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by version),''),'UTF8')),'hex') sha256 from supabase_migrations.schema_migrations m where not(version=any(${exclude}::text[]))`)[0];}
export async function installedPackage(db){for(const n of migrations){const [r]=await db`select version,name,statements from supabase_migrations.schema_migrations where version=${n.slice(0,14)}`;assert.ok(r,'Missing APL migration journal');assert.equal(r.name,n.slice(15,-4));assert.deepEqual(r.statements,[readFileSync(resolve(root,'supabase/migrations',n),'utf8')]);}return{packages:migrationSources(),fingerprint:await schemaFingerprint(db)};}
async function absent(db){assert.equal((await db`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${migrations.map(n=>n.slice(0,14))}::text[])`)[0].n,0,'Partial/already installed package refused');for(const table of aplTables)assert.equal((await db`select to_regclass(${'public.'+table}) present`)[0].present,null,'Unjournaled or partial APL objects refused');}
export async function installAplPackage(tx){await absent(tx);for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n),'utf8');await tx.unsafe(source);await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${n.slice(0,14)},${n.slice(15,-4)},${[source]})`;}}
export async function applyAplPlan(mode,{sqlEvidence,apiEvidence,evidence,out}){
 assert.ok(['--verify','--apply'].includes(mode));out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'apl-plan-live-installation',mode,status:'FAIL',stage:'evidence',startedAt:new Date().toISOString(),toolSha256:sha(readFileSync(fileURLToPath(import.meta.url))),committed:false},save=()=>savePrivateReport(out,report);save();let db,locked=false;
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
    await installAplPackage(tx);assertColumnTransition(report.originalColumns,await catalogColumns(tx));await checkInstalledAdditions(tx);report.afterStructure=await schemaFingerprint(tx,true);assertStructureTransition(report.beforeStructure,report.afterStructure);report.structureVerified=true;assert.equal(await schemaFingerprint(tx),proof.sql.value.installed.fingerprint,'Installed definitions differ from verified SQL');
    report.afterProjection=await projectionHashes(tx,report.originalColumns);assert.deepEqual(report.afterProjection,report.beforeProjection);assertOldRights(report.beforeRights,await rights(tx));
    report.afterOriginalJournal=await journalHash(tx,migrations.map(n=>n.slice(0,14)));assert.deepEqual(report.afterOriginalJournal,report.beforeJournal);report.installed=await installedPackage(tx);assert.deepEqual(migrationSources(),proof.packages);assert.deepEqual(productSources(),proof.sources);assert.deepEqual(artifactManifest(proof.buildRoot),report.build.artifact);
    report.lockHoldMsBeforeCommit=Date.now()-start;report.commitAttempted=true;report.stage='commit_pending';save();
   });report.committed=true;report.oldWorkerCompatibleAfterCommit=false;report.candidateTransferRequired=true;report.stage='committed';report.commitConfirmedAt=new Date().toISOString();save();assert.deepEqual(await installedPackage(db),report.installed);
   report.stage='local_migration_files';save();for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n)),file=resolve(target.workdir,'supabase/migrations',n);if(existsSync(file))assert.equal(sha(readFileSync(file)),sha(source));else writeFileSync(file,source,{flag:'wx',mode:0o600});}report.localMigrationFilesSynced=true;
  }
  assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))),report.toolSha256);report.status='PASS';
 }catch(error){report.failure={code:error.code??'ASSERTION',messageSha256:sha(String(error.message??''))};report.recoveryRequired=report.commitAttempted===true;report.oldWorkerCompatibleAfterCommit=false;report.failedStage=report.stage;}
 finally{if(db)try{if(locked)await db`select pg_advisory_unlock(5532)`;await db.end({timeout:5});report.databaseClosed=true;}catch{report.status='FAIL';report.databaseClosed=false;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: APL plan installation ${mode}; committed=${report.committed}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [mode,...args]=process.argv.slice(2),options={};try{for(let i=0;i<args.length;i+=2){assert.ok(['--sql-evidence','--api-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);const k={'--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--evidence':'evidence','--out':'out'}[args[i]];assert.ok(!options[k]);options[k]=resolve(args[i+1]);}const r=await applyAplPlan(mode,options);if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: APL plan installation preflight');process.exitCode=1;}}
