#!/usr/bin/env node
// Preparation/installation only; imports are inert. --verify never runs live DDL.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,openSync,closeSync,lstatSync,realpathSync,existsSync,fsyncSync,renameSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {catalogColumns,projectionHashes,connect,classCohortTargetIdentity} from './verify-class-cohort.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const migrations=['20261015200000_named_timplan_series.sql','20261015201000_named_timplan_commands.sql','20261015202000_named_timplan_decisions.sql','20261015203000_named_timplan_reads.sql','20261015204000_worker_named_timplans.sql'];
export const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const ident=v=>'"'+v.replaceAll('"','""')+'"';
export const migrationSources=()=>Object.fromEntries(migrations.map(n=>['supabase/migrations/'+n,sha(readFileSync(resolve(root,'supabase/migrations',n)))]));
const product=['web/app','web/lib','web/components','web/hooks','web/scripts','web/package.json','web/package-lock.json','web/vite.config.ts','web/vinext.config.ts'];
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
export function productSources(){assert.equal(git(['status','--porcelain','--',...product]),'','Product must be committed');return Object.fromEntries(git(['ls-files','--',...product]).split('\n').filter(Boolean).map(p=>[p,sha(readFileSync(resolve(root,p)))]));}
export function readPrivateEvidence(file){file=resolve(file);assert.ok(file.startsWith('/private/tmp/')&&file.endsWith('.json'));assert.equal(realpathSync(file),file,'Evidence symlinks refused');assert.equal(lstatSync(file).mode&0o077,0,'Private evidence mode required');const bytes=readFileSync(file);return{path:file,sha256:sha(bytes),value:JSON.parse(bytes)};}
export function requirePackageProof(sql,api,{sources,packages}){
 assert.equal(sql.kind,'named-timplan-installed-concurrency');assert.equal(sql.status,'PASS');assert.ok(sql.checks.length>0&&sql.checks.every(c=>c.ok===true));
 assert.deepEqual(sql.migrationRollback,{exactOriginalColumns:true,allTablesRestored:true,schemaAclRestored:true,tableCount:sql.migrationRollback.tableCount});assert.ok(sql.migrationRollback.tableCount>0);
 assert.equal(sql.installed.originalColumnsPreserved,true);assert.equal(sql.finalFingerprint,sql.installed.fingerprint);assert.ok(sql.finalFingerprint);assert.equal(sql.originalPreservation.allRowsPresent,true);assert.ok(sql.originalPreservation.rows>0);assert.equal(sql.cleanup.cleanup,'complete');assert.equal(sql.snapshot.dataCopied,false);
 const races=['same-series next version','same name new series','same command ID','different-series approve','different-series next version','rename versus reviewed approval','class link versus competing update','source change versus create'];
 assert.deepEqual(sql.races.map(r=>r.name).sort(),races.sort());for(const r of sql.races){assert.ok(Number.isInteger(r.leftPid)&&Number.isInteger(r.rightPid)&&r.leftPid!==r.rightPid);assert.ok(r.blockers.includes(r.leftPid));assert.equal(r.left,'committed');assert.equal(r.right,['same command ID','different-series approve','different-series next version'].includes(r.name)?'committed':'40001');}
 for(const [p,h]of Object.entries(packages))assert.equal(sql.sources[p],h,'SQL package changed');
 assert.equal(api.kind,'named-timplan-actual-api-browser');assert.equal(api.status,'PASS');assert.ok(api.checks.length>0&&api.checks.every(c=>c.ok===true));assert.ok(api.api);
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
 for(const [p,h]of Object.entries(api.value.verificationSources??{})){assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));assert.equal(sha(readFileSync(resolve(root,p))),h,'Verification source changed');}
 assert.ok(Object.keys(api.value.verificationSources??{}).length>0,'Verification sources required');
 const buildRoot=realpathSync(api.value.runtime.buildRoot);assert.ok(buildRoot.startsWith(resolve(root,'work/pilot/targets/protected/runtime')+'/'));assert.deepEqual(artifactManifest(buildRoot),api.value.finalArtifact);assert.deepEqual(JSON.parse(readFileSync(resolve(buildRoot,'build-mode.json'),'utf8')),api.value.build);
 return{sql,api,packages,sources,buildRoot};
}
export function assertColumnTransition(before,after){
 const additions={timplans:['series_id','name_at_creation'],plan_decision_history:['name_at_decision']},newTables=['named_timplan_commands','timplan_series','timplan_series_name_events'];
 assert.deepEqual(Object.keys(after).filter(t=>!Object.hasOwn(before,t)).sort(),newTables.sort());
 for(const [table,cols]of Object.entries(before))assert.deepEqual(after[table],[...cols,...(additions[table]??[])]);
}
async function rights(db){return{tables:await db`select relname,relacl::text acl,relowner,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname`,functions:await db`select oid::regprocedure::text signature,proacl::text acl,proowner from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1`};}
export function assertOldRights(before,after){for(const [kind,key]of [['tables','relname'],['functions','signature']]){const current=new Map(after[kind].map(r=>[r[key],r]));for(const row of before[kind])assert.deepEqual(current.get(row[key]),row,'Old grants/owner/RLS changed');}}
async function journalHash(db,exclude=[]){return(await db`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by version),''),'UTF8')),'hex') sha256 from supabase_migrations.schema_migrations m where not(version=any(${exclude}::text[]))`)[0];}
export async function installedPackage(db){for(const n of migrations){const [r]=await db`select version,name,statements from supabase_migrations.schema_migrations where version=${n.slice(0,14)}`;assert.ok(r,'Missing named migration journal');assert.equal(r.name,n.slice(15,-4));assert.deepEqual(r.statements,[readFileSync(resolve(root,'supabase/migrations',n),'utf8')]);}return{packages:migrationSources(),fingerprint:await schemaFingerprint(db)};}
async function absent(db){assert.equal((await db`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${migrations.map(n=>n.slice(0,14))}::text[])`)[0].n,0,'Partial/already installed package refused');assert.equal((await db`select to_regclass('public.timplan_series') series`)[0].series,null);}
export async function installNamedPackage(tx){await absent(tx);for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n),'utf8');await tx.unsafe(source);await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${n.slice(0,14)},${n.slice(15,-4)},${[source]})`;}}
export async function checkInstalledAdditions(tx){
 assert.equal((await tx`select count(*)::int n from public.timplans t join public.timplan_series s on s.id=t.series_id where s.organizer_id<>t.organizer_id or s.offering_id<>t.offering_id or s.unit_id<>t.unit_id or t.name_at_creation is not null`)[0].n,0);
 assert.equal((await tx`select count(*)::int n from public.timplan_series where name<>'Grundfördelning' or revision<>0 or not legacy_default`)[0].n,0);
 assert.equal((await tx`select count(*)::int n from public.timplan_series`)[0].n,(await tx`select count(*)::int n from(select distinct offering_id,unit_id from public.timplans)s`)[0].n);
 for(const table of ['named_timplan_commands','timplan_series_name_events'])assert.equal((await tx.unsafe('select count(*)::int n from public.'+table))[0].n,0);
 assert.equal((await tx`select count(*)::int n from public.plan_decision_history where name_at_decision is not null`)[0].n,0);
 for(const role of ['anon','authenticated','service_role','skolplattform_worker'])for(const table of ['timplan_series','named_timplan_commands','timplan_series_name_events'])assert.equal((await tx`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed`)[0].allowed,false);
}
export function savePrivateReport(out,value){
 const temporary=out+'.'+randomUUID()+'.tmp',fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,out);const directory=openSync(dirname(out),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
}
export async function applyNamedTimplans(mode,{sqlEvidence,apiEvidence,evidence,out}){
 assert.ok(['--verify','--apply'].includes(mode));out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'named-timplan-live-installation',mode,status:'FAIL',stage:'evidence',startedAt:new Date().toISOString(),toolSha256:sha(readFileSync(fileURLToPath(import.meta.url))),committed:false},save=()=>savePrivateReport(out,report);save();let db,locked=false;
 try{
  let prior;if(mode==='--apply'){prior=readPrivateEvidence(evidence);assert.equal(prior.value.kind,report.kind);assert.equal(prior.value.mode,'--verify');assert.equal(prior.value.status,'PASS');assert.equal(prior.value.committed,false);assert.equal(prior.value.toolSha256,report.toolSha256);sqlEvidence=prior.value.sql.path;apiEvidence=prior.value.api.path;report.preflight={path:prior.path,sha256:prior.sha256};}
  const proof=readPackageEvidence({sqlEvidence,apiEvidence});report.sql={path:proof.sql.path,sha256:proof.sql.sha256};report.api={path:proof.api.path,sha256:proof.api.sha256};report.packages=proof.packages;report.build={root:proof.buildRoot,artifact:proof.api.value.finalArtifact};
  if(prior){assert.deepEqual(prior.value.sql,report.sql);assert.deepEqual(prior.value.api,report.api);assert.deepEqual(prior.value.build,report.build);}
  report.stage='read_only_preflight';save();const target=await assertTarget('protected');db=connect(target);report.target=await classCohortTargetIdentity(db,target);if(prior)assert.deepEqual(report.target,prior.value.target);
  assert.equal((await db`select pg_try_advisory_lock(5532) locked`)[0].locked,true);locked=true;
  await db.begin('isolation level repeatable read read only',async tx=>{await absent(tx);report.beforeFingerprint=await schemaFingerprint(tx);assert.equal(report.beforeFingerprint,proof.sql.value.snapshot.sourceFingerprint,'Live schema differs from isolated baseline');report.originalColumns=await catalogColumns(tx);report.beforeProjection=await projectionHashes(tx,report.originalColumns);report.beforeJournal=await journalHash(tx);report.beforeRights=await rights(tx);});
  if(mode==='--apply'){
   assert.equal(prior.value.beforeFingerprint,report.beforeFingerprint);assert.deepEqual(prior.value.originalColumns,report.originalColumns);
   report.stage='bounded_installation';save();await db.begin(async tx=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='25s'`;await tx`set local transaction_timeout='30s'`;
    await tx.unsafe('lock table '+Object.keys(report.originalColumns).sort().map(t=>'public.'+ident(t)).concat('supabase_migrations.schema_migrations').join(',')+' in share row exclusive mode');const start=Date.now();report.lockAcquiredAt=new Date().toISOString();
    await absent(tx);assert.equal(await schemaFingerprint(tx),report.beforeFingerprint);report.beforeProjection=await projectionHashes(tx,report.originalColumns);report.beforeJournal=await journalHash(tx);report.beforeRights=await rights(tx);save();
    await installNamedPackage(tx);assertColumnTransition(report.originalColumns,await catalogColumns(tx));await checkInstalledAdditions(tx);
    report.afterProjection=await projectionHashes(tx,report.originalColumns);assert.deepEqual(report.afterProjection,report.beforeProjection);assertOldRights(report.beforeRights,await rights(tx));
    report.afterOriginalJournal=await journalHash(tx,migrations.map(n=>n.slice(0,14)));assert.deepEqual(report.afterOriginalJournal,report.beforeJournal);report.installed=await installedPackage(tx);assert.deepEqual(migrationSources(),proof.packages);assert.deepEqual(productSources(),proof.sources);assert.deepEqual(artifactManifest(proof.buildRoot),report.build.artifact);
    report.lockHoldMsBeforeCommit=Date.now()-start;report.commitAttempted=true;report.stage='commit_pending';save();
   });report.committed=true;report.stage='committed';report.commitConfirmedAt=new Date().toISOString();save();assert.deepEqual(await installedPackage(db),report.installed);
   report.stage='local_migration_files';save();for(const n of migrations){const source=readFileSync(resolve(root,'supabase/migrations',n)),file=resolve(target.workdir,'supabase/migrations',n);if(existsSync(file))assert.equal(sha(readFileSync(file)),sha(source));else writeFileSync(file,source,{flag:'wx',mode:0o600});}report.localMigrationFilesSynced=true;
  }
  assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))),report.toolSha256);report.status='PASS';
 }catch(error){report.failure={code:error.code??'ASSERTION',messageSha256:sha(String(error.message??''))};report.recoveryRequired=report.commitAttempted===true;report.failedStage=report.stage;}
 finally{if(db)try{if(locked)await db`select pg_advisory_unlock(5532)`;await db.end({timeout:5});report.databaseClosed=true;}catch{report.status='FAIL';report.databaseClosed=false;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: named installation ${mode}; committed=${report.committed}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [mode,...args]=process.argv.slice(2),options={};try{for(let i=0;i<args.length;i+=2){assert.ok(['--sql-evidence','--api-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);const k={'--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--evidence':'evidence','--out':'out'}[args[i]];assert.ok(!options[k]);options[k]=resolve(args[i+1]);}const r=await applyNamedTimplans(mode,options);if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: named installation preflight');process.exitCode=1;}}
