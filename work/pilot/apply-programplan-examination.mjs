#!/usr/bin/env node
// Preparation/installation only; imports are inert. --verify never runs live DDL.
import assert from 'node:assert/strict';
import {readPrivateEvidence,sha,savePrivateReport,assertOldRights} from './apply-named-timplans.mjs';
export {readPrivateEvidence,sha,savePrivateReport,assertOldRights};
import {examinationCandidateSources} from './examination-candidate-sources.mjs';
import {readFileSync,writeFileSync,openSync,closeSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {catalogColumns,projectionHashes,connect,classCohortTargetIdentity} from './verify-class-cohort.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const migrations=['20261018180000_programplan_examination_review.sql'];
export const expectedBaselineFingerprint='1ae3b9682cb04cf0d711712f7059d93561ec60f78e9bca28d0aa3222bdc7f04d';
export const expectedPreviousArtifact='8b0b83b6401333cd234b6d7787bdfd23f363c7fc2385c144a370aa462f6a8387';
const ident=v=>'"'+v.replaceAll('"','""')+'"';
export const migrationSources=()=>Object.fromEntries(migrations.map(n=>['supabase/migrations/'+n,sha(readFileSync(resolve(root,'supabase/migrations',n)))]));
const hashPattern=/^[a-f0-9]{64}$/u;
export const allowedFunctions=[
 'phase5_apl_confirmation_blockers(jsonb,jsonb,jsonb,jsonb)','phase5_apl_copy_structure(uuid,uuid)',
 'phase5_apl_hash_payload(jsonb,uuid,jsonb,jsonb,jsonb)',
 'phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)',
 'phase5_named_timplan_copy_rows(uuid,jsonb,uuid)','phase5_plan_decision_detail(text,uuid)',
 'phase5_plan_decision_source_blockers(jsonb)','phase5_programplan_audit(uuid,text,uuid)',
 'phase5_programplan_event_actor()','phase5_programplan_guard()','phase5_resolve_programplan_basis(jsonb)',
];
export const addedFunctions=['phase5_programplan_examination_valid(jsonb,text,text)','phase5_set_programplan_examination(uuid,integer,jsonb)'];
export const requiredSqlChecks=[
 'migration rollback restores exact schema, grants and all rows',
 'only expected functions/grant added; every original row and existing ACL preserved',
 'historical approved receipt replays original shape without examination backfill',
 'SQL/TypeScript validation parity: scope, source, real dates and UTF16 limits',
 'generic education creation cannot inject review without dedicated command',
 'missing review blocks submit','principal2 cannot edit examination','admin cannot edit examination',
 'review write changes only evidence, revision and update time; 100-point rows and term budget preserved',
 'unchanged occupational selection preserves the existing examination review',
 'changed occupational frame clears examination and requires fresh review',
 'stale CAS changes no state','documented unavailable-provision choice can save diploma work',
 'Worker can invoke only the granted write entrypoint','database audit failure rolls back evidence and history',
 'HM decision detail binds the exact frozen dated source review','submitted review is locked',
 'approved review requires new version','2028 table with evidence, GUT and annual APL approves before any periods',
 '2028 APL source-supported flag and optional examination hash agree with TypeScript',
 'copy to next cohort clears review and requires new examination investigation',
 'new version for same cohort retains frozen review and all 100-point allocation',
 'changed examination model resets only final-work time row with explicit copy review',
 'full synthetic matrix restores rows and deferred constraints',
 'actual concurrent review CAS permits one write and rejects the stale second',
];
export const requiredApiFeatures=['scopeProtected','malformedDenied','casProtected','auditRollback','mfaProtected','frozenSource','copyRequiresReview','revokedDenied','originalPreserved'];
export const requiredBrowserFeatures=['missingBlocked','diplomaReview','organizerApproval','annualApl','tableApproval'];
export const toolSourceHashes=()=>Object.fromEntries(['work/pilot/apply-programplan-examination.mjs','work/pilot/examination-candidate-sources.mjs','work/pilot/apply-named-timplans.mjs',
 'work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-programplan-copy-api.mjs']
 .map(file=>[file,sha(readFileSync(resolve(root,file)))]));
export const toolHash=()=>sha(JSON.stringify(toolSourceHashes()));
const signature=s=>s.replace(/^public\./u,'').replaceAll(', ', ',');
const normalized=value=>JSON.parse(JSON.stringify(value));
export function assertColumnTransition(before,after){assert.deepEqual(after,before,'Existing columns changed');}
export function assertStructureTransition(beforeValue,afterValue){
 const before=normalized(beforeValue),after=normalized(afterValue);
 assert.deepEqual(Object.keys(before).sort(),['columns','constraints','functions','indexes','policies','tables','triggers']);
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 for(const key of Object.keys(before).filter(k=>k!=='functions'))assert.deepEqual(after[key],before[key],'Unexpected schema change: '+key);
 for(const structure of [before,after])assert.equal(new Set(structure.functions.map(f=>signature(f.signature))).size,structure.functions.length,'Duplicate function signature');
 assert.equal(after.functions.length,before.functions.length+addedFunctions.length);
 const changed=[];
 for(const old of before.functions){const current=after.functions.find(f=>signature(f.signature)===signature(old.signature));assert.ok(current,'Function removed');
  const {definition:oldDefinition,...oldMetadata}=old,{definition:newDefinition,...newMetadata}=current;
  assert.deepEqual(newMetadata,oldMetadata,'Function metadata or privileges changed');
  if(oldDefinition!==newDefinition)changed.push(signature(old.signature));
 }
 assert.deepEqual(changed.sort(),[...allowedFunctions].sort());
 const additions=after.functions.filter(f=>!before.functions.some(old=>signature(old.signature)===signature(f.signature)));
 assert.deepEqual(additions.map(f=>signature(f.signature)).sort(),[...addedFunctions].sort());
 const owner=before.functions.find(f=>signature(f.signature)==='phase5_programplan_guard()').owner;
 for(const f of additions){
  assert.deepEqual(Object.keys(f).sort(),['acl','definition','owner','signature']);assert.equal(f.owner,owner,'New function owner differs');
  assert.equal(f.acl,signature(f.signature)===addedFunctions[0]?'{postgres=X/postgres}':'{postgres=X/postgres,skolplattform_worker=X/postgres}','New function privileges broadened');
  assert.match(f.definition,/SECURITY DEFINER/iu);assert.match(f.definition,/SET search_path TO 'pg_catalog', 'public'/u);
 }
 return true;
}
export async function checkInstalledAdditions(db){
 for(const fn of addedFunctions)for(const role of ['anon','authenticated','service_role','skolplattform_worker'])
  assert.equal((await db`select has_function_privilege(${role},${'public.'+fn},'EXECUTE') allowed`)[0].allowed,role==='skolplattform_worker'&&fn===addedFunctions[1],'Unexpected execution permission');
 for(const table of ['apl_workflow_states','apl_organizer_reviews'])for(const role of ['anon','authenticated','service_role','skolplattform_worker'])
  assert.equal((await db`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false);
}
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
 assert.equal(sql.kind,'programplan-examination-private-schema-only');assert.equal(sql.status,'PASS');
 assert.ok(sql.checks.length>=requiredSqlChecks.length&&sql.checks.every(c=>c.ok===true));
 for(const name of requiredSqlChecks)assert.ok(sql.checks.some(c=>c.name===name&&c.ok===true),'Required SQL scenario missing: '+name);
 assert.equal(sql.cleanup.cleanup,'complete');assert.equal(sql.snapshot.dataCopied,false);
 for(const name of ['migrationRollbackRestored','matrixRollbackRestored','originalRowsPreserved','concurrencyComplete'])assert.equal(sql[name],true,name);
 assert.match(sql.baseline.fingerprint,hashPattern);assert.equal(sql.baseline.fingerprint,sql.snapshot.sourceFingerprint);
 assert.match(sql.installed.fingerprint,hashPattern);assert.notEqual(sql.installed.fingerprint,sql.baseline.fingerprint);
 assert.equal(sql.finalFingerprint,sql.installed.fingerprint);assert.deepEqual(sql.finalStructure,sql.installed.structure);
 assertStructureTransition(sql.baseline.structure,sql.installed.structure);
 assert.equal(sha(JSON.stringify(sql.baseline.structure)),sql.baseline.fingerprint);assert.equal(sha(JSON.stringify(sql.installed.structure)),sql.installed.fingerprint);
 assert.ok(Object.keys(sql.baseline.rows).length>0);
 for(const [table,rows]of Object.entries(sql.baseline.rows))assert.deepEqual(sql.installed.rows[table],rows,'Migration modified existing rows');
 assert.deepEqual(sql.installed.rows,sql.baseline.rows,'All original rows must remain exact');
 assert.ok(sql.races.length>0);for(const race of sql.races){assert.ok(Number.isInteger(race.leftPid)&&Number.isInteger(race.rightPid)&&race.leftPid!==race.rightPid);
  assert.ok(race.blockers.includes(race.leftPid));assert.equal(race.wait_event_type,'Lock');assert.equal(race.left,'committed');assert.equal(race.right,'40001');}
 assert.deepEqual(sql.finalSources,sql.sources);for(const [p,h]of Object.entries(packages))assert.equal(sql.sources[p],h,'SQL package changed');
 assert.equal(api.kind,'programplan-examination-actual-api-browser');assert.equal(api.status,'PASS');assert.ok(api.checks.length>=20&&api.checks.every(c=>c.ok===true));
 assert.match(api.candidateCheckout.revision,/^[a-f0-9]{40}$/u);assert.equal(api.candidateCheckout.revision,api.build.revision);assert.deepEqual(api.finalCandidateCheckout,api.candidateCheckout);
 assert.equal(api.api.status,'PASS');for(const feature of requiredApiFeatures)assert.equal(api.api[feature],true,feature);
 assert.deepEqual([...api.api.raceStatuses].sort(),[200,409]);assert.equal(api.originalRowsPreserved,true);
 assert.deepEqual(api.sources,sources);assert.deepEqual(api.finalSources,sources);assert.deepEqual(api.migrationSources,packages);assert.deepEqual(api.finalMigrationSources,packages);
 assert.equal(api.baselineFingerprint,sql.baseline.fingerprint);assert.equal(api.installedFingerprint,sql.installed.fingerprint);assert.equal(api.finalFingerprint,sql.installed.fingerprint);
 assert.ok(Object.keys(api.migrationBeforeRows).length>0);assert.deepEqual(api.migrationAfterRows,api.migrationBeforeRows,'All API migration rows must remain exact');
 assert.equal(api.build.mode,'protected');assert.equal(api.runtime.baseURL,'http://127.0.0.1:3014');assert.deepEqual(api.finalArtifact,api.runtime.artifact);assert.ok(api.finalArtifact.fileCount>0);
 assert.deepEqual(api.originalArtifact,api.finalArtifact,'Original built artifact must match the verified runtime copy');
 assert.equal(api.snapshot.dataCopied,false);assert.equal(api.browserRuns.retries,0);assert.ok(api.oidcCleanup.verifiedCallbacks>0);assert.deepEqual(api.finalVerificationSources,api.verificationSources);
 assert.equal(api.runtimeCleanup.cleanup,'complete');assert.equal(api.snapshotCleanup.cleanup,'complete');assert.equal(api.oidcCleanup.cleanup,'complete');assert.equal(api.snapshot.sourceFingerprint,sql.snapshot.sourceFingerprint);
 for(const device of ['desktop','phone']){const b=api.browserEvidence[device];assert.equal(b.visualReview,'reviewed');assert.equal(b.result.status,'PASS');assert.equal(b.result.device,device);
  assert.ok(b.result.checks.length>=5&&b.result.checks.every(c=>c.ok===true));for(const feature of requiredBrowserFeatures)assert.equal(b.result.features[feature],true,device+': '+feature);
  assert.ok(b.result.screenshots.length>0);assert.match(b.sha256,hashPattern);
  assert.deepEqual(Object.keys(b.screenshotHashes).sort(),b.result.screenshots.map(s=>s.file).sort());for(const h of Object.values(b.screenshotHashes))assert.match(h,hashPattern);}
 return true;
}
export function readPackageEvidence({sqlEvidence,apiEvidence}){
 const sql=readPrivateEvidence(sqlEvidence),api=readPrivateEvidence(apiEvidence),packages=migrationSources();
 const {sources,candidateCheckout}=examinationCandidateSources({checkout:api.value.candidateCheckout.path,revision:api.value.build.revision});
 assert.deepEqual(candidateCheckout,api.value.candidateCheckout);requirePackageProof(sql.value,api.value,{sources,packages});
 assert.equal(sql.value.baseline.fingerprint,expectedBaselineFingerprint,'This package requires the verified APL autofill baseline');
 for(const device of ['desktop','phone']){const ref=api.value.browserEvidence[device],side=readPrivateEvidence(ref.path);assert.equal(side.sha256,ref.sha256);assert.deepEqual(side.value,ref.result);for(const shot of side.value.screenshots){assert.match(shot.file,new RegExp('^'+device+'-[a-z0-9-]+\\.png$','u'));const p=resolve(dirname(side.path),shot.file);assert.equal(realpathSync(p),p);assert.ok(lstatSync(p).isFile());assert.equal(sha(readFileSync(p)),ref.screenshotHashes[shot.file],'Reviewed screenshot changed');}}
 for(const [p,h]of [sql.value.sources,api.value.verificationSources].flatMap(manifest=>Object.entries(manifest))){assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));assert.equal(sha(readFileSync(resolve(root,p))),h,'Verification source changed');}
 assert.ok(Object.keys(api.value.verificationSources??{}).length>0,'Verification sources required');
 const buildRoot=realpathSync(api.value.runtime.buildRoot);assert.ok(buildRoot.startsWith(resolve(root,'work/pilot/targets/protected/runtime')+'/'));assert.deepEqual(artifactManifest(buildRoot),api.value.finalArtifact);assert.deepEqual(JSON.parse(readFileSync(resolve(buildRoot,'build-mode.json'),'utf8')),api.value.build);
 const originalBuild=resolve(candidateCheckout.path,'web/dist-protected');assert.equal(api.value.originalBuild,originalBuild);assert.equal(realpathSync(originalBuild),originalBuild);
 assert.deepEqual(artifactManifest(originalBuild),api.value.originalArtifact);assert.deepEqual(JSON.parse(readFileSync(resolve(originalBuild,'build-mode.json'),'utf8')),api.value.build);
 return{sql,api,packages,sources,buildRoot,candidateCheckout};
}
async function rights(db){return{tables:await db`select relname,relacl::text acl,relowner,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname`,functions:await db`select oid::regprocedure::text signature,proacl::text acl,proowner from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1`};}
async function journalHash(db,exclude=[]){return(await db`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by version),''),'UTF8')),'hex') sha256 from supabase_migrations.schema_migrations m where not(version=any(${exclude}::text[]))`)[0];}
export async function installedPackage(db){for(const n of migrations){const [r]=await db`select version,name,statements from supabase_migrations.schema_migrations where version=${n.slice(0,14)}`;assert.ok(r,'Missing APL migration journal');assert.equal(r.name,n.slice(15,-4));assert.deepEqual(r.statements,[readFileSync(resolve(root,'supabase/migrations',n),'utf8')]);}return{packages:migrationSources(),fingerprint:await schemaFingerprint(db)};}
async function absent(db){assert.equal((await db`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${migrations.map(n=>n.slice(0,14))}::text[])`)[0].n,0,'Partial/already installed package refused');assert.ok((await db`select to_regclass('public.apl_workflow_states') present`)[0].present,'Separate APL workflow baseline required');}
export async function installExaminationPackage(tx){await absent(tx);for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n),'utf8');await tx.unsafe(source);await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${n.slice(0,14)},${n.slice(15,-4)},${[source]})`;}}
export async function applyProgramplanExamination(mode,{sqlEvidence,apiEvidence,evidence,out}){
 assert.ok(['--verify','--apply'].includes(mode));out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'programplan-examination-live-installation',mode,status:'FAIL',stage:'evidence',startedAt:new Date().toISOString(),toolSha256:toolHash(),committed:false},save=()=>savePrivateReport(out,report);save();let db,locked=false;
 try{
  let prior;if(mode==='--apply'){prior=readPrivateEvidence(evidence);assert.equal(prior.value.kind,report.kind);assert.equal(prior.value.mode,'--verify');assert.equal(prior.value.status,'PASS');assert.equal(prior.value.committed,false);assert.equal(prior.value.databaseClosed,true);assert.equal(prior.value.toolSha256,report.toolSha256);sqlEvidence=prior.value.sql.path;apiEvidence=prior.value.api.path;report.preflight={path:prior.path,sha256:prior.sha256};}
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
    await installExaminationPackage(tx);assertColumnTransition(report.originalColumns,await catalogColumns(tx));await checkInstalledAdditions(tx);report.afterStructure=await schemaFingerprint(tx,true);assertStructureTransition(report.beforeStructure,report.afterStructure);report.structureVerified=true;assert.equal(await schemaFingerprint(tx),proof.sql.value.installed.fingerprint,'Installed definitions differ from verified SQL');
    report.afterProjection=await projectionHashes(tx,report.originalColumns);assert.deepEqual(report.afterProjection,report.beforeProjection);assertOldRights(report.beforeRights,await rights(tx));
    report.afterOriginalJournal=await journalHash(tx,migrations.map(n=>n.slice(0,14)));assert.deepEqual(report.afterOriginalJournal,report.beforeJournal);report.installed=await installedPackage(tx);assert.deepEqual(migrationSources(),proof.packages);
    const finalCandidate=examinationCandidateSources({checkout:proof.candidateCheckout.path,revision:proof.candidateCheckout.revision});assert.deepEqual(finalCandidate.sources,proof.sources);assert.deepEqual(finalCandidate.candidateCheckout,proof.candidateCheckout);assert.deepEqual(artifactManifest(proof.buildRoot),report.build.artifact);
    report.lockHoldMsBeforeCommit=Date.now()-start;report.commitAttempted=true;report.stage='commit_pending';save();
   });report.committed=true;report.oldWorkerCompatibleAfterCommit=false;report.candidateTransferRequired=true;report.stage='committed';report.commitConfirmedAt=new Date().toISOString();save();assert.deepEqual(await installedPackage(db),report.installed);
   report.stage='local_migration_files';save();for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n)),file=resolve(target.workdir,'supabase/migrations',n);if(existsSync(file))assert.equal(sha(readFileSync(file)),sha(source));else writeFileSync(file,source,{flag:'wx',mode:0o600});}report.localMigrationFilesSynced=true;
  }
  assert.equal(toolHash(),report.toolSha256);report.status='PASS';
 }catch(error){report.failure={code:error.code??'ASSERTION',messageSha256:sha(String(error.message??''))};report.recoveryRequired=report.commitAttempted===true;report.oldWorkerCompatibleAfterCommit=false;report.failedStage=report.stage;}
 finally{if(db)try{if(locked)await db`select pg_advisory_unlock(5532)`;await db.end({timeout:5});report.databaseClosed=true;}catch{report.status='FAIL';report.databaseClosed=false;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: programplan examination installation ${mode}; committed=${report.committed}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [mode,...args]=process.argv.slice(2),options={};try{for(let i=0;i<args.length;i+=2){assert.ok(['--sql-evidence','--api-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);const k={'--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--evidence':'evidence','--out':'out'}[args[i]];assert.ok(!options[k]);options[k]=resolve(args[i+1]);}const r=await applyProgramplanExamination(mode,options);if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: programplan examination installation preflight');process.exitCode=1;}}
