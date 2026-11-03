#!/usr/bin/env node
// VP-02/VP-03. Two forward-only migrations on the installed elective baseline of the protected target.
// Rehearsal runs inside a rolled-back transaction; apply requires that private rehearsal evidence and repeats
// every check. Never changes runtime 3012, never accepts a DB URL and never writes business rows.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {ELECTIVE_MIGRATIONS,preservedColumns,preservedRows,readMigrationJournal,installElectivePackage,runElectiveTransactions,sha} from './apply-elective-blocks.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),prefix='supabase/migrations/';
export const VALPLAN_MIGRATIONS=['20261104100000_valplans.sql','20261104110000_study_groups.sql'].map(p=>prefix+p);
const NEW_TABLES=11,ENTRYPOINTS=['valplan_read(jsonb)','valplan_command(jsonb)','study_group_read(jsonb)','study_group_command(jsonb)'];
const version=p=>p.split('/').at(-1).slice(0,14),name=p=>p.split('/').at(-1).slice(15,-4);
const privatePath=value=>{const p=resolve(value);assert.ok(p.startsWith('/private/tmp/')&&p.endsWith('.json'),'private_json_required');return p;};
function evidence(value){const p=privatePath(value);assert.equal(realpathSync(p),p);const stat=lstatSync(p);assert.ok(stat.isFile()&&(stat.mode&0o077)===0&&stat.size<64*1024*1024);const bytes=readFileSync(p);return{path:p,sha256:sha(bytes),value:JSON.parse(bytes)};}
export function valplanSourceSnapshot(){
 const files=readdirSync(resolve(root,prefix)).filter(p=>/^\d{14}_[a-z0-9_]+\.sql$/u.test(p)).sort().map(p=>prefix+p);
 assert.deepEqual(files.filter(p=>version(p)>='20261030110000'),[...ELECTIVE_MIGRATIONS,...VALPLAN_MIGRATIONS],'unexpected_migration_suffix');
 return Object.fromEntries(files.map(p=>{const sql=readFileSync(resolve(root,p),'utf8');return[p,{sha256:sha(sql),sql}];}));
}
const hashes=sources=>Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
export function installerSources(){return Object.fromEntries(['work/pilot/apply-valplan.mjs','work/pilot/apply-elective-blocks.mjs','work/pilot/apply-tjanst.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs'].map(p=>[p,sha(readFileSync(resolve(root,p)))]));}
/** The installed journal must end with the elective package, byte-identical to the sources, and lack both new versions. */
export function validateValplanJournal(rows,sources){
 assert.equal(rows.at(-1)?.version,'20261031100000','unexpected_journal_tail');
 for(const p of VALPLAN_MIGRATIONS)assert.equal(rows.some(r=>r.version===version(p)),false,'already_installed');
 for(const p of ELECTIVE_MIGRATIONS)assert.deepEqual(rows.find(r=>r.version===version(p)),{version:version(p),name:name(p),statements:[sources[p].sql]},'elective_journal_differs');
 return{count:rows.length,sha256:sha(rows)};
}
export function parseValplanArgs(args){
 assert.ok(['--rehearse','--apply'].includes(args[0]),'explicit_mode_required');const out={mode:args[0]==='--apply'?'apply':'rehearsal'};
 for(let i=1;i<args.length;i+=2){const key=args[i];assert.ok(['--rehearsal','--out'].includes(key)&&args[i+1]&&!Object.hasOwn(out,key.slice(2)),'unknown_or_duplicate_argument');out[key.slice(2)]=privatePath(args[i+1]);}
 assert.ok(out.out,'output_required');assert.equal(!!out.rehearsal,out.mode==='apply','rehearsal_evidence_only_for_apply');assert.notEqual(out.rehearsal,out.out);return out;
}
async function entrypointPrivileges(tx){
 for(const fn of ENTRYPOINTS){const sig='public.'+fn;
  assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,true,'worker_entrypoint_missing');
  for(const role of ['anon','authenticated'])assert.equal((await tx`select has_function_privilege(${role},${sig},'EXECUTE') ok`)[0].ok,false,'entrypoint_too_open');}
 const helpers=await tx`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'valplan\\_%' or p.proname like 'study\\_group\\_%')`;
 for(const {sig} of helpers)if(!ENTRYPOINTS.includes(sig.replace(/^public\./u,'')))assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,false,'helper_exposed');
 return{entrypoints:ENTRYPOINTS.length,helpers:helpers.length-ENTRYPOINTS.length};
}
export async function applyValplan(options){
 const out=privatePath(options.out);assert.equal(realpathSync(dirname(out)),dirname(out));const sink=reserveReport(out,'valplan-migration-evidence',options.mode),r=sink.report;r.checks=[];
 let db,locked=false,auditId=null;
 try{
  const sources=valplanSourceSnapshot();r.sqlSourceHashes=hashes(sources);r.installerSources=installerSources();
  const prior=options.mode==='apply'?evidence(options.rehearsal):null;
  if(prior){const p=prior.value;assert.equal(p.kind,r.kind);assert.equal(p.status,'PASS');assert.equal(p.mode,'rehearsal');assert.equal(p.committed,false);assert.equal(p.rollbackRestored,true);assert.equal(p.databaseClosed,true);
   assert.deepEqual(p.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(p.installerSources,r.installerSources);r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};}
  const target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);if(prior)assert.deepEqual(prior.value.targetIdentity,r.targetIdentity);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'target_lock_unavailable');locked=true;
  r.beforeFingerprint=await schemaFingerprint(db);const originalJournal=await readMigrationJournal(db);r.priorJournal=validateValplanJournal(originalJournal,sources);
  r.originalColumns=await preservedColumns(db);r.beforeRows=await preservedRows(db,r.originalColumns);
  if(prior)for(const key of ['beforeFingerprint','priorJournal','originalColumns','beforeRows'])assert.deepEqual(prior.value[key],r[key],`target_changed_since_rehearsal:${key}`);
  const revalidate=async connection=>{assert.deepEqual(hashes(valplanSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(installerSources(),r.installerSources);if(prior)assert.equal(evidence(options.rehearsal).sha256,prior.sha256);
   const active=await assertTarget('protected');assert.deepEqual(await classCohortTargetIdentity(connection,active),r.targetIdentity);};
  const migrate=async(tx,phase)=>{
   r.stage=phase==='apply'?'installing':'rehearsing';sink.save();
   const result=await installElectivePackage(tx,{sources,migrations:VALPLAN_MIGRATIONS,validateJournal:rows=>validateValplanJournal(rows,sources),columns:r.originalColumns,baselineFingerprint:r.beforeFingerprint,rows:r.beforeRows,
    priorJournal:r.priorJournal,originalJournal,installedFingerprint:prior?.value.rehearsal?.fingerprint??null,revalidate,audit:{runId:r.runId,details:{sqlSourceHashes:r.sqlSourceHashes,package:'valplan'}}},phase);
   assert.equal(result.newTables,NEW_TABLES,'unexpected_new_tables');r.privileges=await entrypointPrivileges(tx);auditId=result.auditId;
   r.stage=phase==='apply'?'commit_pending':'rollback_pending';sink.save();return result;
  };
  const preserve=connection=>preservedRows(connection,r.originalColumns,auditId);
  await runElectiveTransactions({db,mode:options.mode,report:r,fingerprint:schemaFingerprint,
   recorded:async q=>Number((await q`select count(*) n from supabase_migrations.schema_migrations where version=any(${VALPLAN_MIGRATIONS.map(version)})`)[0].n),preserve,migrate});
  r.afterRows=await preserve(db);assert.deepEqual(r.afterRows,r.beforeRows);r.afterFingerprint=await schemaFingerprint(db);
  if(options.mode==='rehearsal'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);r.rollbackRestored=true;}
  else{assert.equal(r.afterFingerprint,prior.value.rehearsal.fingerprint);assert.equal((await readMigrationJournal(db)).length,originalJournal.length+VALPLAN_MIGRATIONS.length);assert.ok(auditId);r.auditRowsAdded=1;}
  await revalidate(db);r.status='PASS';delete r.failureCode;r.stage='verified';
 }catch(error){r.status='FAIL';r.failure={name:error.name==='AssertionError'?'AssertionError':'Error',code:/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:null,message:error.name==='AssertionError'?String(error.message).split('\n')[0].slice(0,120):null,messageSha256:sha(String(error.message??''))};if(r.stage==='commit_pending'&&!r.committed)r.commitOutcome='unknown';}
 finally{if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}}r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await applyValplan(parseValplanArgs(process.argv.slice(2)));console.log(`${report.status}: valplan SQL; mode=${report.mode}; committed=${report.committed===true}; checks=${report.checks.length}${report.failure?.message?`; ${report.failure.message}`:''}`);if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: valplan SQL preflight');process.exitCode=1;}
}
