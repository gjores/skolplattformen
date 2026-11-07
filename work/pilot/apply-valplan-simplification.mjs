#!/usr/bin/env node
// VP-10–VP-14. Four forward-only migrations for the simpler valbara block, on the class-link baseline of the protected target.
// Rehearsal runs inside a rolled-back transaction; apply requires that private rehearsal evidence and repeats
// every check. Never changes runtime 3012, never accepts a DB URL and never writes business rows.
// No migration writes a row. VP-12 only widens valplan_rows from one block per row to several: the unique key becomes a plain
// index, and blocks that exist keep their classes because the new table starts empty. The row comparison therefore stays exact
// for every original table. The schema delta below is exact too: anything else in the transaction refuses the installation.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {ELECTIVE_MIGRATIONS,preservedColumns,preservedRows,readMigrationJournal,installElectivePackage,runElectiveTransactions,sqlStatements,sha} from './apply-elective-blocks.mjs';
import {VALPLAN_MIGRATIONS,parseValplanArgs,privatePath,evidence,hashes} from './apply-valplan.mjs';
import {CHOICE_MIGRATIONS} from './apply-valplan-choices.mjs';
import {LINK_MIGRATIONS} from './apply-class-link-following.mjs';
import {TJANST_MIGRATION_REGISTRY} from './tjanst-migration-state.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),prefix='supabase/migrations/';
const INSTALLED=[...ELECTIVE_MIGRATIONS,...VALPLAN_MIGRATIONS,prefix+'20261104120000_valplan_legacy_row_time.sql',...CHOICE_MIGRATIONS,...LINK_MIGRATIONS];
export const SIMPLIFICATION_MIGRATIONS=['20261107100000_valplan_all_block_kinds.sql','20261107110000_valplan_class_selection.sql','20261107120000_valplan_open_check.sql','20261107130000_valplan_held_courses.sql'].map(p=>prefix+p);
const ENTRYPOINTS=['valplan_read(jsonb)','valplan_command(jsonb)','study_group_read(jsonb)','study_group_command(jsonb)','valplan_choice_read(jsonb)','valplan_choice_command(jsonb)','valplan_self_read()','valplan_self_command(jsonb)'];
const ROLES=['anon','authenticated','service_role','skolplattform_worker'];
const NEW_TABLE='valplan_row_excluded_classes',NEW_PKEY=NEW_TABLE+'_pkey',NEW_INDEX='valplan_rows_row_idx',OLD_KEY='valplan_rows_unit_id_school_year_timplan_id_row_key_year_key';
export const NEW_FUNCTIONS=['valplan_choice_base_state(valplan_choices)','valplan_class_choices(valplans)','valplan_class_fixed(uuid)','valplan_class_organized(jsonb,text)','valplan_course_choices(valplans)',
 'valplan_points_reachable(integer[],integer)','valplan_pupil_blocked(valplans,uuid)','valplan_pupil_held_courses(valplans,uuid)','valplan_round_problem(valplans)'];
export const REPLACED_FUNCTIONS=['tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)','tjanst_working_needs(uuid,integer)','valplan_choice_command(jsonb)','valplan_choice_projection(access_assignments,valplans)',
 'valplan_choice_state(valplan_choices)','valplan_command(jsonb)','valplan_document(valplans)','valplan_projection(uuid,integer)','valplan_pupil_row(valplans,uuid)',
 'valplan_record_choice(valplan_rounds,uuid,integer,uuid[],uuid,uuid,uuid)','valplan_row_contexts(uuid,integer)','valplan_self_read()'];
const KEY_COLUMNS=['unit_id','school_year','timplan_id','row_key','year'],EXCLUDED_COLUMNS=['valplan_id','timplan_id','row_key','year','class_id'];
const columnsOf=(relation,names)=>names.map(name=>`${relation}.${name}`);
// By content, not name: a generated name is not part of the contract. NOT NULL is read from the columns below, because
// PostgreSQL 18 also lists it as a constraint and older versions do not.
const NEW_CONSTRAINTS=['FOREIGN KEY (class_id) REFERENCES school_classes(id)','FOREIGN KEY (valplan_id, timplan_id, row_key, year) REFERENCES valplan_rows(valplan_id, timplan_id, row_key, year) ON DELETE CASCADE','PRIMARY KEY (valplan_id, timplan_id, row_key, year, class_id)'];
export const EXPECTED_DELTA={
 functions:{added:NEW_FUNCTIONS,removed:[],changed:REPLACED_FUNCTIONS},
 tables:{added:[NEW_TABLE,NEW_PKEY,NEW_INDEX],removed:[OLD_KEY],changed:[]},
 columns:{added:[...columnsOf(NEW_TABLE,EXCLUDED_COLUMNS),...columnsOf(NEW_PKEY,EXCLUDED_COLUMNS),...columnsOf(NEW_INDEX,KEY_COLUMNS)],removed:columnsOf(OLD_KEY,KEY_COLUMNS),changed:[]},
 constraints:{added:NEW_CONSTRAINTS.map(definition=>`${NEW_TABLE}: ${definition}`),removed:[`valplan_rows.${OLD_KEY}`],changed:['valplans.valplans_kind_check']},
 indexes:{added:[`${NEW_TABLE}.${NEW_PKEY}`,`valplan_rows.${NEW_INDEX}`],removed:[`valplan_rows.${OLD_KEY}`],changed:[]},
 triggers:{added:[],removed:[],changed:[]},policies:{added:[],removed:[],changed:[]},
};
const KEYS={functions:f=>signature(f.signature),tables:t=>t.relname,columns:c=>`${c.relname}.${c.attname}`,constraints:c=>c.relname===NEW_TABLE?`${NEW_TABLE}: ${c.definition.replaceAll('public.','')}`:`${c.relname}.${c.conname}`,indexes:i=>`${i.tablename}.${i.indexname}`,triggers:t=>`${t.relname}.${t.tgname}`,policies:p=>`${p.tablename}.${p.policyname}`};
const version=p=>p.split('/').at(-1).slice(0,14),name=p=>p.split('/').at(-1).slice(15,-4),signature=s=>s.replaceAll('public.','').replaceAll(', ',',');
export function simplificationSourceSnapshot(){
 const files=readdirSync(resolve(root,prefix)).filter(p=>/^\d{14}_[a-z0-9_]+\.sql$/u.test(p)).sort().map(p=>prefix+p);
 assert.deepEqual(files.filter(p=>version(p)>=version(INSTALLED[0])),[...INSTALLED,...SIMPLIFICATION_MIGRATIONS],'unexpected_migration_suffix');
 const sources=Object.fromEntries(files.map(p=>{const sql=readFileSync(resolve(root,p),'utf8');return[p,{sha256:sha(sql),sql}];}));
 for(const p of [...INSTALLED,...SIMPLIFICATION_MIGRATIONS])assert.equal(sources[p].sha256,TJANST_MIGRATION_REGISTRY.find(m=>m.file===p)?.sha256,'migration_not_in_registry');
 return sources;
}
export function installerSources(){return Object.fromEntries(['work/pilot/apply-valplan-simplification.mjs','work/pilot/apply-class-link-following.mjs','work/pilot/apply-valplan-choices.mjs','work/pilot/apply-valplan.mjs','work/pilot/apply-elective-blocks.mjs','work/pilot/apply-tjanst.mjs','work/pilot/tjanst-migration-state.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs'].map(p=>[p,sha(readFileSync(resolve(root,p)))]));}
/** The journal must end with the class link, list exactly the known versions from the elective package on, and hold each of them byte-identical to its source. */
export function validateSimplificationJournal(rows,sources){
 assert.equal(rows.at(-1)?.version,version(INSTALLED.at(-1)),'unexpected_journal_tail');
 for(const p of SIMPLIFICATION_MIGRATIONS)assert.equal(rows.some(r=>r.version===version(p)),false,'already_installed');
 assert.deepEqual(rows.filter(r=>r.version>=version(INSTALLED[0])).map(r=>r.version),INSTALLED.map(version),'unexpected_journal_versions');
 for(const p of INSTALLED)assert.deepEqual(rows.find(r=>r.version===version(p)),{version:version(p),name:name(p),statements:[sources[p].sql]},'installed_journal_differs');
 return{count:rows.length,sha256:sha(rows)};
}
/** Only schema statements at the top level. A routine body is opaque here and runs only when a command is called. */
const SCHEMA_ONLY=/^(?:alter\s+table|create\s+table|create\s+index|create\s+(?:or\s+replace\s+)?function|revoke)\b/iu;
export function assertNoRowWrites(sql){for(const statement of sqlStatements(sql))assert.match(statement.text,SCHEMA_ONLY,'migration_statement_refused');}
function delta(before,after,key){
 const a=new Map(before.map(x=>[key(x),JSON.stringify(x)])),b=new Map(after.map(x=>[key(x),JSON.stringify(x)])),sorted=list=>[...list].sort();
 return{added:sorted([...b.keys()].filter(k=>!a.has(k))),removed:sorted([...a.keys()].filter(k=>!b.has(k))),changed:sorted([...a.keys()].filter(k=>b.has(k)&&a.get(k)!==b.get(k)))};
}
/** The exact schema change. Replaced functions keep owner and rights, and the block types are the five the catalog has. */
export function assertSimplificationTransition(beforeValue,afterValue){
 const before=JSON.parse(JSON.stringify(beforeValue)),after=JSON.parse(JSON.stringify(afterValue)),sorted=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,[...v].sort()]));
 assert.deepEqual(Object.keys(after).sort(),Object.keys(KEYS).sort(),'unexpected_structure');
 assert.deepEqual(after.columns.filter(c=>c.relname===NEW_TABLE&&c.attnotnull).map(c=>c.attname).sort(),[...EXCLUDED_COLUMNS].sort(),'new_table_nullable');
 after.constraints=after.constraints.filter(c=>c.relname!==NEW_TABLE||!/^NOT NULL /u.test(c.definition));
 for(const[part,key]of Object.entries(KEYS))assert.deepEqual(delta(before[part],after[part],key),sorted(EXPECTED_DELTA[part]),'unexpected_'+part+'_delta');
 const old=new Map(before.functions.map(f=>[signature(f.signature),f]));
 for(const f of after.functions){const prior=old.get(signature(f.signature));if(prior)assert.deepEqual([f.acl,f.owner],[prior.acl,prior.owner],'function_rights_changed');}
 const kinds=after.constraints.find(c=>c.relname==='valplans'&&c.conname==='valplans_kind_check');assert.equal(kinds.convalidated,true,'kind_check_not_validated');
 assert.deepEqual([...kinds.definition.matchAll(/'([A-Za-z]+)'::text/gu)].map(m=>m[1]).sort(),['individualChoice','languageSubject','modernLanguage','naturalScience','specialization'],'unexpected_block_kinds');
 for(const c of after.constraints.filter(c=>c.relname===NEW_TABLE))assert.equal(c.convalidated,true,'new_constraint_not_validated');
 return Object.fromEntries(Object.entries(EXPECTED_DELTA).map(([part,value])=>[part,{added:value.added.length,removed:value.removed.length,changed:value.changed.length}]));
}
/** Worker keeps the same eight entrypoints. Everything else stays closed, and the new table reads like its sibling under forced row security. */
export async function simplificationPrivileges(tx){
 for(const fn of ENTRYPOINTS){const sig='public.'+fn;
  assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,true,'worker_entrypoint_missing');
  for(const role of ['anon','authenticated'])assert.equal((await tx`select has_function_privilege(${role},${sig},'EXECUTE') ok`)[0].ok,false,'entrypoint_too_open');}
 const helpers=await tx`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'valplan\\_%' or p.proname like 'study\\_group\\_%')`;
 for(const {sig} of helpers)if(!ENTRYPOINTS.includes(signature(sig)))assert.equal((await tx`select has_function_privilege('skolplattform_worker',${sig},'EXECUTE') ok`)[0].ok,false,'helper_exposed');
 for(const fn of NEW_FUNCTIONS){const[{sig}]=await tx`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=${fn.split('(')[0]}`;
  for(const role of ROLES)assert.equal((await tx`select has_function_privilege(${role},${sig},'EXECUTE') ok`)[0].ok,false,'new_function_exposed');}
 const table='public.'+NEW_TABLE;
 for(const role of ROLES)assert.equal((await tx`select has_any_column_privilege(${role},${table},'SELECT,INSERT,UPDATE,REFERENCES') ok`)[0].ok,false,'new_table_column_exposed');
 const security=relation=>tx`select c.relowner::text owner,c.relrowsecurity rls,c.relforcerowsecurity forced,(select count(*)::integer from pg_policies p where p.schemaname='public' and p.tablename=c.relname) policies from pg_class c where c.oid=${relation}::regclass`;
 const[[sibling],[own]]=[await security('public.valplan_rows'),await security(table)];
 assert.deepEqual(own,sibling,'new_table_differs_from_sibling');
 return{entrypoints:ENTRYPOINTS.length,helpers:helpers.length-ENTRYPOINTS.length,newFunctions:NEW_FUNCTIONS.length};
}
export function assertSimplificationRehearsal(p,current){
 assert.equal(p.kind,current.kind);assert.equal(p.status,'PASS');assert.equal(p.mode,'rehearsal');assert.equal(p.committed,false);assert.equal(p.rollbackRestored,true);assert.equal(p.databaseClosed,true);
 assert.ok(Array.isArray(p.checks)&&p.checks.length&&p.checks.every(c=>c.ok===true));assert.deepEqual(p.sqlSourceHashes,current.sqlSourceHashes);assert.deepEqual(p.installerSources,current.installerSources);
}
/** Everything that touches the database. The caller owns the connection, so the same code runs in the temporary PostgreSQL proof. */
export async function runSimplification({db,mode,report:r,save=()=>{},sources,prior=null,revalidate}){
 assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'target_lock_unavailable');
 try{
  const before=await schemaFingerprint(db,true);r.beforeFingerprint=sha(before);const originalJournal=await readMigrationJournal(db);r.priorJournal=validateSimplificationJournal(originalJournal,sources);
  for(const p of SIMPLIFICATION_MIGRATIONS)assertNoRowWrites(sources[p].sql);
  r.originalColumns=await preservedColumns(db);r.beforeRows=await preservedRows(db,r.originalColumns);
  if(prior)for(const key of ['beforeFingerprint','priorJournal','originalColumns','beforeRows'])assert.deepEqual(prior[key],r[key],`target_changed_since_rehearsal:${key}`);
  let auditId=null;
  const migrate=async(tx,phase)=>{
   r.stage=phase==='apply'?'installing':'rehearsing';save();
   const result=await installElectivePackage(tx,{sources,migrations:SIMPLIFICATION_MIGRATIONS,validateJournal:rows=>validateSimplificationJournal(rows,sources),columns:r.originalColumns,baselineFingerprint:r.beforeFingerprint,rows:r.beforeRows,
    priorJournal:r.priorJournal,originalJournal,installedFingerprint:prior?.rehearsal?.fingerprint??null,revalidate,audit:{runId:r.runId,details:{sqlSourceHashes:r.sqlSourceHashes,package:'valplan_simplification'}}},phase);
   assert.equal(result.newTables,1,'unexpected_new_tables');r.transition=assertSimplificationTransition(before,await schemaFingerprint(tx,true));r.privileges=await simplificationPrivileges(tx);
   const{[`public.${NEW_TABLE}`]:added,...kept}=await preservedColumns(tx);assert.deepEqual(added,EXCLUDED_COLUMNS,'unexpected_new_table_columns');assert.deepEqual(kept,r.originalColumns,'original_columns_changed');
   auditId=result.auditId;r.stage=phase==='apply'?'commit_pending':'rollback_pending';save();return result;
  };
  const preserve=connection=>preservedRows(connection,r.originalColumns,auditId);
  await runElectiveTransactions({db,mode,report:r,fingerprint:schemaFingerprint,
   recorded:async q=>Number((await q`select count(*) n from supabase_migrations.schema_migrations where version=any(${SIMPLIFICATION_MIGRATIONS.map(version)})`)[0].n),preserve,migrate});
  r.afterRows=await preserve(db);assert.deepEqual(r.afterRows,r.beforeRows);r.afterFingerprint=await schemaFingerprint(db);
  r.rowChanges={originalTables:Object.keys(r.beforeRows).length,originalRowsChanged:0,newTableRows:0,journalRowsAdded:mode==='apply'?SIMPLIFICATION_MIGRATIONS.length:0,auditRowsAdded:mode==='apply'?1:0};
  if(mode==='rehearsal'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);r.rollbackRestored=true;}
  else{assert.equal(r.afterFingerprint,prior.rehearsal.fingerprint);assert.equal((await readMigrationJournal(db)).length,originalJournal.length+SIMPLIFICATION_MIGRATIONS.length);assert.ok(auditId);assert.equal((await db.unsafe(`select count(*)::integer n from public.${NEW_TABLE}`))[0].n,0,'new_table_not_empty');r.auditRowsAdded=1;}
  await revalidate(db);return r;
 }finally{await db`select pg_advisory_unlock(5520)`;}
}
export async function applySimplification(options){
 const out=privatePath(options.out);assert.equal(realpathSync(dirname(out)),dirname(out));const sink=reserveReport(out,'valplan-simplification-migration-evidence',options.mode),r=sink.report;r.checks=[];
 let db;
 try{
  const sources=simplificationSourceSnapshot();r.sqlSourceHashes=hashes(sources);r.installerSources=installerSources();
  const prior=options.mode==='apply'?evidence(options.rehearsal):null;
  if(prior){assertSimplificationRehearsal(prior.value,r);r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};}
  const target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);if(prior)assert.deepEqual(prior.value.targetIdentity,r.targetIdentity);
  const revalidate=async connection=>{assert.deepEqual(hashes(simplificationSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(installerSources(),r.installerSources);if(prior)assert.equal(evidence(options.rehearsal).sha256,prior.sha256);
   const active=await assertTarget('protected');assert.deepEqual(await classCohortTargetIdentity(connection,active),r.targetIdentity);};
  await runSimplification({db,mode:options.mode,report:r,save:sink.save,sources,prior:prior?.value??null,revalidate});
  r.status='PASS';delete r.failureCode;r.stage='verified';
 }catch(error){r.status='FAIL';r.failure={name:error.name==='AssertionError'?'AssertionError':'Error',code:/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:null,message:error.name==='AssertionError'?String(error.message).split('\n')[0].slice(0,120):null,messageSha256:sha(String(error.message??''))};if(r.stage==='commit_pending'&&!r.committed)r.commitOutcome='unknown';}
 finally{if(db){try{await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}}r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await applySimplification(parseValplanArgs(process.argv.slice(2)));console.log(`${report.status}: valplan simplification SQL; mode=${report.mode}; committed=${report.committed===true}; checks=${report.checks.length}${report.failure?.message?`; ${report.failure.message}`:''}`);if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: valplan simplification SQL preflight');process.exitCode=1;}
}
