#!/usr/bin/env node
// VP-03B, VP-04, VP-07. Groups as tjänst sources, elevval and the class list in the group read, on the protected target.
// Rehearsal runs inside a rolled-back transaction; apply requires that private rehearsal evidence and repeats
// every check. Never changes runtime 3012, never accepts a DB URL and never writes business rows.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {preservedColumns,preservedRows,readMigrationJournal,installElectivePackage,runElectiveTransactions,sha} from './apply-elective-blocks.mjs';
import {VALPLAN_MIGRATIONS,parseValplanArgs,privatePath,evidence,hashes} from './apply-valplan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),prefix='supabase/migrations/';
const INSTALLED=[...VALPLAN_MIGRATIONS,prefix+'20261104120000_valplan_legacy_row_time.sql'];
export const CHOICE_MIGRATIONS=['20261105100000_study_group_tjanst.sql','20261105110000_valplan_choices.sql','20261105120000_study_group_read_classes.sql'].map(p=>prefix+p);
const ENTRYPOINTS=['valplan_read(jsonb)','valplan_command(jsonb)','study_group_read(jsonb)','study_group_command(jsonb)','valplan_choice_read(jsonb)','valplan_choice_command(jsonb)','valplan_self_read()','valplan_self_command(jsonb)'];
const version=p=>p.split('/').at(-1).slice(0,14),name=p=>p.split('/').at(-1).slice(15,-4);
export function choiceSourceSnapshot(){
 const files=readdirSync(resolve(root,prefix)).filter(p=>/^\d{14}_[a-z0-9_]+\.sql$/u.test(p)).sort().map(p=>prefix+p);
 assert.deepEqual(files.filter(p=>version(p)>='20261104100000'),[...INSTALLED,...CHOICE_MIGRATIONS],'unexpected_migration_suffix');
 return Object.fromEntries(files.map(p=>{const sql=readFileSync(resolve(root,p),'utf8');return[p,{sha256:sha(sql),sql}];}));
}
export function installerSources(){return Object.fromEntries(['work/pilot/apply-valplan-choices.mjs','work/pilot/apply-valplan.mjs','work/pilot/apply-elective-blocks.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs'].map(p=>[p,sha(readFileSync(resolve(root,p)))]));}
/** The installed journal must end with the valplan package, byte-identical to the sources, and lack the new versions. */
export function validateChoiceJournal(rows,sources){
 assert.equal(rows.at(-1)?.version,version(INSTALLED.at(-1)),'unexpected_journal_tail');
 for(const p of CHOICE_MIGRATIONS)assert.equal(rows.some(r=>r.version===version(p)),false,'already_installed');
 for(const p of INSTALLED)assert.deepEqual(rows.find(r=>r.version===version(p)),{version:version(p),name:name(p),statements:[sources[p].sql]},'valplan_journal_differs');
 return{count:rows.length,sha256:sha(rows)};
}
async function entrypointPrivileges(tx){
 for(const fn of ENTRYPOINTS){const sig='public.'+fn;
  assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,true,'worker_entrypoint_missing');
  for(const role of ['anon','authenticated'])assert.equal((await tx`select has_function_privilege(${role},${sig},'EXECUTE') ok`)[0].ok,false,'entrypoint_too_open');}
 const helpers=await tx`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'valplan\\_%' or p.proname like 'study\\_group\\_%')`;
 for(const {sig} of helpers)if(!ENTRYPOINTS.includes(sig.replace(/^public\./u,'')))assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,false,'helper_exposed');
 return{entrypoints:ENTRYPOINTS.length,helpers:helpers.length-ENTRYPOINTS.length};
}
export async function applyChoices(options){
 const out=privatePath(options.out);assert.equal(realpathSync(dirname(out)),dirname(out));const sink=reserveReport(out,'valplan-choices-migration-evidence',options.mode),r=sink.report;r.checks=[];
 let db,locked=false,auditId=null;
 try{
  const sources=choiceSourceSnapshot();r.sqlSourceHashes=hashes(sources);r.installerSources=installerSources();
  const prior=options.mode==='apply'?evidence(options.rehearsal):null;
  if(prior){const p=prior.value;assert.equal(p.kind,r.kind);assert.equal(p.status,'PASS');assert.equal(p.mode,'rehearsal');assert.equal(p.committed,false);assert.equal(p.rollbackRestored,true);assert.equal(p.databaseClosed,true);
   assert.deepEqual(p.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(p.installerSources,r.installerSources);r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};}
  const target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);if(prior)assert.deepEqual(prior.value.targetIdentity,r.targetIdentity);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'target_lock_unavailable');locked=true;
  r.beforeFingerprint=await schemaFingerprint(db);const originalJournal=await readMigrationJournal(db);r.priorJournal=validateChoiceJournal(originalJournal,sources);
  r.originalColumns=await preservedColumns(db);r.beforeRows=await preservedRows(db,r.originalColumns);
  if(prior)for(const key of ['beforeFingerprint','priorJournal','originalColumns','beforeRows'])assert.deepEqual(prior.value[key],r[key],`target_changed_since_rehearsal:${key}`);
  const revalidate=async connection=>{assert.deepEqual(hashes(choiceSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(installerSources(),r.installerSources);if(prior)assert.equal(evidence(options.rehearsal).sha256,prior.sha256);
   const active=await assertTarget('protected');assert.deepEqual(await classCohortTargetIdentity(connection,active),r.targetIdentity);};
  const migrate=async(tx,phase)=>{
   r.stage=phase==='apply'?'installing':'rehearsing';sink.save();
   const result=await installElectivePackage(tx,{sources,migrations:CHOICE_MIGRATIONS,validateJournal:rows=>validateChoiceJournal(rows,sources),columns:r.originalColumns,baselineFingerprint:r.beforeFingerprint,rows:r.beforeRows,
    priorJournal:r.priorJournal,originalJournal,installedFingerprint:prior?.value.rehearsal?.fingerprint??null,revalidate,audit:{runId:r.runId,details:{sqlSourceHashes:r.sqlSourceHashes,package:'valplan_choices'}}},phase);
   assert.equal(result.newTables,8,'unexpected_new_tables');for(const t of ['study_group_snapshots','tjanst_version_study_group_sources','valplan_rounds','valplan_choices','valplan_choice_history','valplan_guardian_confirmations','valplan_choice_commands','valplan_self_commands'])assert.equal((await tx.unsafe(`select count(*)::integer n from public.${t}`))[0].n,0,'new_table_not_empty');r.privileges=await entrypointPrivileges(tx);auditId=result.auditId;
   r.stage=phase==='apply'?'commit_pending':'rollback_pending';sink.save();return result;
  };
  const preserve=connection=>preservedRows(connection,r.originalColumns,auditId);
  await runElectiveTransactions({db,mode:options.mode,report:r,fingerprint:schemaFingerprint,
   recorded:async q=>Number((await q`select count(*) n from supabase_migrations.schema_migrations where version=any(${CHOICE_MIGRATIONS.map(version)})`)[0].n),preserve,migrate});
  r.afterRows=await preserve(db);assert.deepEqual(r.afterRows,r.beforeRows);r.afterFingerprint=await schemaFingerprint(db);
  if(options.mode==='rehearsal'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);r.rollbackRestored=true;}
  else{assert.equal(r.afterFingerprint,prior.value.rehearsal.fingerprint);assert.equal((await readMigrationJournal(db)).length,originalJournal.length+CHOICE_MIGRATIONS.length);assert.ok(auditId);r.auditRowsAdded=1;}
  await revalidate(db);r.status='PASS';delete r.failureCode;r.stage='verified';
 }catch(error){r.status='FAIL';r.failure={name:error.name==='AssertionError'?'AssertionError':'Error',code:/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:null,message:error.name==='AssertionError'?String(error.message).split('\n')[0].slice(0,120):null,messageSha256:sha(String(error.message??''))};if(r.stage==='commit_pending'&&!r.committed)r.commitOutcome='unknown';}
 finally{if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}}r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await applyChoices(parseValplanArgs(process.argv.slice(2)));console.log(`${report.status}: valplan choices SQL; mode=${report.mode}; committed=${report.committed===true}; checks=${report.checks.length}${report.failure?.message?`; ${report.failure.message}`:''}`);if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: valplan choices SQL preflight');process.exitCode=1;}
}
