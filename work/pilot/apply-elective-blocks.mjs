#!/usr/bin/env node
// Source-bound SQL installation only. No runtime/process control and no arbitrary DB URL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {runInstallation} from './apply-tjanst.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const prefix='supabase/migrations/';
export const ELECTIVE_MIGRATIONS=[
 '20261030110000_elective_blocks.sql','20261030111000_elective_participant_authority.sql','20261030111500_elective_timplan_positions.sql',
 '20261030112000_elective_tjanst_sources.sql','20261030113000_elective_rounds_choices.sql','20261030114000_elective_guardian_confirmation.sql',
 '20261030115000_elective_placements.sql','20261030115100_elective_binding_recovery_reference.sql','20261030115200_elective_frame_exclusivity.sql',
 '20261030115300_elective_participant_account_attestation.sql','20261030115400_elective_placement_applied_organization.sql','20261030115500_elective_group_retirement.sql',
 '20261030115600_elective_applied_pool_intent.sql','20261030115700_elective_explicit_privileges.sql',
 '20261031100000_elective_preparations.sql',
].map(p=>prefix+p);
export const KNOWN_UNJOURNALLED=['20261002120000_phase5_programplan_education.sql','20261002121000_phase5_worker_programplan_education.sql'].map(p=>prefix+p);
const version=p=>p.split('/').at(-1).slice(0,14),name=p=>p.split('/').at(-1).slice(15,-4);
const hex=value=>assert.match(value??'',/^[a-f0-9]{64}$/u);
const ident=s=>'"'+s.replaceAll('"','""')+'"';
function privatePath(path){assert.equal(typeof path,'string');const out=resolve(path);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'),'private_json_required');return out;}
export function parseElectiveInstallArgs(args){
 assert.ok(['--rehearse','--apply'].includes(args[0]),'explicit_mode_required');const out={mode:args[0]==='--apply'?'apply':'rehearsal'};
 for(let i=1;i<args.length;i+=2){const key=args[i];assert.ok(['--candidate','--verification','--rehearsal','--out'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--')&&!Object.hasOwn(out,key.slice(2)),'unknown_duplicate_or_missing_argument');out[key.slice(2)]=privatePath(args[i+1]);}
 assert.ok(out.candidate&&out.verification&&out.out,'evidence_and_output_required');assert.ok(out.mode!=='apply'||out.rehearsal,'external_rehearsal_required');assert.ok(out.mode==='apply'||!out.rehearsal,'rehearsal_not_an_input_to_rehearse');assert.ok(new Set([out.candidate,out.verification,out.rehearsal,out.out].filter(Boolean)).size===[out.candidate,out.verification,out.rehearsal,out.out].filter(Boolean).length,'distinct_evidence_paths_required');return out;
}
function evidence(path){const file=privatePath(path);assert.equal(realpathSync(file),file,'evidence_symlink_refused');const stat=lstatSync(file);assert.ok(stat.isFile()&&(stat.mode&0o077)===0&&stat.size<64*1024*1024,'private_evidence_file_required');const bytes=readFileSync(file);return{path:file,sha256:sha(bytes),value:JSON.parse(bytes)};}
export function migrationSourceSnapshot(){
 const files=readdirSync(resolve(root,prefix)).filter(p=>/^\d{14}_[a-z0-9_]+\.sql$/u.test(p)).sort().map(p=>prefix+p);
 assert.deepEqual(files.filter(p=>version(p)>='20261030110000'),ELECTIVE_MIGRATIONS,'unexpected_migration_suffix');
 return Object.fromEntries(files.map(p=>{const sql=readFileSync(resolve(root,p),'utf8');return[p,{sha256:sha(sql),sql}];}));
}
const sourceHashes=sources=>Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
export function installerSourceHashes(){return Object.fromEntries(['work/pilot/apply-elective-blocks.mjs','work/pilot/apply-tjanst.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs'].map(p=>[p,sha(readFileSync(resolve(root,p)))]));}
export function assertPriorJournal(rows,sources,accepted=[]){
 const paths=Object.keys(sources).filter(p=>!ELECTIVE_MIGRATIONS.includes(p)&&!KNOWN_UNJOURNALLED.includes(p));
 assert.deepEqual(rows.map(r=>r.version),paths.map(version),'prior_version_set_mismatch');const used=[];
 for(const[i,p]of paths.entries()){
  const r=rows[i];assert.ok(Array.isArray(r.statements)&&r.statements.every(s=>typeof s==='string'),'prior_statements_missing');
  if(r.name===name(p)&&r.statements.length===1&&r.statements[0]===sources[p].sql)continue;
  const exception={version:r.version,name:r.name,statementsSha256:sha(r.statements),repositorySourceSha256:sources[p].sha256,reason:'verified-baseline-history'};
  assert.ok(accepted.some(e=>isDeepStrictEqual(e,exception)),'unclassified_prior_source_mismatch');used.push(exception);
 }
 assert.deepEqual(accepted,used,'unused_legacy_exception');return{count:rows.length,sha256:sha(rows),legacyJournal:used,acceptedUnjournalled:KNOWN_UNJOURNALLED.map(p=>({file:p,sha256:sources[p].sha256}))};
}
export function validateReleaseEvidence(candidate,verification,{candidatePath,candidateSha256}){
 assert.equal(candidate.kind,'elective-blocks-candidate');assert.equal(candidate.status,'PASS');assert.match(candidate.revision??'',/^[a-f0-9]{40}$/u);hex(candidate.artifact?.sha256);assert.ok(Number.isSafeInteger(candidate.artifact.fileCount)&&candidate.artifact.fileCount>0);
 assert.deepEqual(candidate.sqlSourceHashes,sourceHashes(migrationSourceSnapshot()),'candidate_sql_changed');assert.equal(verification.kind,'elective-blocks-release-evidence');assert.equal(verification.status,'PASS');assert.deepEqual(verification.candidate,{path:candidatePath,sha256:candidateSha256});
 assert.ok(Array.isArray(verification.checks)&&verification.checks.length&&verification.checks.every(c=>c.ok===true));
 for(const key of ['sql','workerOidc','desktop','phone']){const s=verification.suites?.[key];assert.equal(s?.status,'PASS');assert.ok(Number.isSafeInteger(s.checks)&&s.checks>0);assert.equal(s.skipped,0);}
}
export function assertRehearsalEvidence(p,current){
 assert.equal(p.kind,'elective-blocks-migration-evidence');assert.equal(p.status,'PASS');assert.equal(p.mode,'rehearsal');assert.equal(p.rollbackRestored,true);assert.equal(p.committed,false);assert.equal(p.databaseClosed,true);
 assert.ok(Array.isArray(p.checks)&&p.checks.length&&p.checks.every(c=>c.ok===true));
 for(const key of ['candidate','verification','sqlSourceHashes','installerSourceHashes','executionSources'])assert.deepEqual(p[key],current[key]);
 assert.deepEqual(p.finalSqlSourceHashes,current.sqlSourceHashes);hex(p.rehearsal?.fingerprint);
}
/** Lex only top-level statement boundaries; quoted routine bodies remain opaque. */
function sqlStatements(sql){
 let plain='',i=0,start=0,tokenStart=null;const statements=[];
 const push=end=>{if(plain.trim())statements.push({text:plain.trim(),from:start,tokenStart,to:end});plain='';tokenStart=null;start=end;};
 while(i<sql.length){
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end;plain+=' ';continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}assert.equal(depth,0,'unterminated_comment');plain+=' ';continue;}
  const dollar=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/u)?.[0];
  if(dollar){if(tokenStart===null)tokenStart=i;const end=sql.indexOf(dollar,i+dollar.length);assert.ok(end>=0,'unterminated_body');i=end+dollar.length;plain+=' BODY ';continue;}
  if(sql[i]==="'"||sql[i]==='"'){if(tokenStart===null)tokenStart=i;const quote=sql[i],escape=quote==="'"&&/(?:^|\W)[Ee]$/u.test(sql.slice(0,i));i++;let closed=false;while(i<sql.length){if(escape&&sql[i]==='\\'){i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}i++;}assert.ok(closed,'unterminated_quote');plain+=' QUOTED ';continue;}
  if(sql[i]===';'){push(++i);continue;}if(tokenStart===null&&!/\s/u.test(sql[i]))tokenStart=i;plain+=sql[i++];
 }
 push(i);return statements;
}
const transactionControl=/^(?:begin\b|start\s+transaction\b|commit\b|end\b|rollback\b|abort\b|prepare\s+transaction\b|savepoint\b|release\s+savepoint\b)/iu;
export function assertTransactionalSql(sql){for(const statement of sqlStatements(sql))assert.ok(!transactionControl.test(statement.text),'transaction_control_refused');}
export function prepareMigrationSql(source){
 const statements=sqlStatements(source),first=statements[0],last=statements.at(-1);let sql=source,wrapper='none';
 if(first?.text.toLowerCase()==='begin'&&last?.text.toLowerCase()==='commit'&&statements.length>=2){
  sql=source.slice(0,first.tokenStart)+source.slice(first.to,last.tokenStart)+source.slice(last.to);wrapper='outer-begin-commit';
 }
 assertTransactionalSql(sql);return{sql,wrapper,sourceSha256:sha(source),executionSha256:sha(sql)};
}
export function migrationExecutionSnapshot(sources=migrationSourceSnapshot()){return Object.fromEntries(ELECTIVE_MIGRATIONS.map(p=>{const{sql:_sql,...meta}=prepareMigrationSql(sources[p].sql);return[p,meta];}));}
export async function preservedColumns(db){
 const rows=await db`select n.nspname schema,c.relname table,a.attname column from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where n.nspname in ('public','auth') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped order by 1,2,a.attnum`;
 const result={};for(const r of rows)(result[`${r.schema}.${r.table}`]??=[]).push(r.column);return result;
}
export async function preservedRows(db,columns,auditId=null){
 const result={};for(const[key,names]of Object.entries(columns)){const[schema,table]=key.split('.'),filter=key==='public.security_events'&&auditId!==null?' where id<>$1':'';
  const q=`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(r::text,E'\\n' order by r::text),''),'UTF8')),'hex') sha256 from (select to_jsonb(p) r from (select ${names.map(ident).join(',')} from ${ident(schema)}.${ident(table)}${filter}) p) s`;
  result[key]=(await db.unsafe(q,filter?[auditId]:[]))[0];
 }return result;
}
export async function readMigrationJournal(db){return Array.from(await db`select version,name,statements from supabase_migrations.schema_migrations order by version`,r=>({version:r.version,name:r.name,statements:Array.isArray(r.statements)?Array.from(r.statements):r.statements}));}
export async function assertEducationBaseline(db){
 const[table]=await db`select c.relrowsecurity rls,c.relforcerowsecurity forced from pg_class c where c.oid=to_regclass('public.programplan_education_receipts')`;assert.equal(table?.rls,true,'education_receipt_rls_missing');
 for(const role of ['anon','authenticated','skolplattform_worker'])assert.equal((await db`select has_table_privilege(${role},'public.programplan_education_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false,'education_receipt_privilege');
 const signatures=['phase5_programplan_unit(uuid,boolean)','phase5_programplan_education_audit(text,uuid,text)','phase5_programplan_selection(uuid,text,jsonb)','phase5_programplan_organisation_actor()','phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb)','phase5_programplan_education_status(uuid)'];
 for(const signature of signatures){const[r]=await db`select to_regprocedure(${'public.'+signature})::text signature`;assert.ok(r.signature,'education_function_missing');for(const role of ['anon','authenticated'])assert.equal((await db`select has_function_privilege(${role},${'public.'+signature},'EXECUTE') allowed`)[0].allowed,false);const worker=['phase5_programplan_selection(uuid,text,jsonb)','phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb)','phase5_programplan_education_status(uuid)'].includes(signature);assert.equal((await db`select has_function_privilege('skolplattform_worker',${'public.'+signature},'EXECUTE') allowed`)[0].allowed,worker);}
 for(const column of ['actor_identity_id','session_id','membership_id','assignment_id'])assert.equal((await db`select exists(select 1 from pg_attribute where attrelid='public.organisation_events'::regclass and attname=${column} and not attisdropped) ok`)[0].ok,true,'education_actor_column_missing');
 return{status:'PASS',functions:signatures.length,workerEntrypoints:3};
}
export async function runElectiveTransactions({db,mode,report,fingerprint,recorded,preserve,migrate}){
 const before=await preserve(db),check=(name,ok)=>{report.checks.push({name,ok:ok===true});assert.equal(ok,true,name);};
 await runInstallation({db,mode,report,fingerprint,recorded,check,rehearse:async tx=>{const result=await migrate(tx,'rehearsal');assert.deepEqual(await preserve(tx),before,'legacy_rows_changed');return result;},install:async tx=>{assert.deepEqual(await preserve(tx),before,'baseline_changed_after_rehearsal');const result=await migrate(tx,'apply');assert.deepEqual(await preserve(tx),before,'legacy_rows_changed');return result;}});
 assert.deepEqual(await preserve(db),before,'legacy_rows_changed_after_transaction');return report;
}
/** Auth provider owns its migration journal; only this metadata table needs a read lock.
 * All original rows are still hashed before/after. Every business/auth table keeps the write-excluding lock. */
export function electiveTableLock(key){
 const parts=key.split('.');assert.equal(parts.length,2);assert.ok(['public','auth'].includes(parts[0]));
 return `lock table ${parts.map(ident).join('.')} in ${key==='auth.schema_migrations'?'access share':'share row exclusive'} mode`;
}
export async function installElectivePackage(tx,context,phase){
   assert.ok(['rehearsal','apply'].includes(phase),'invalid_transaction_phase');
   await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='180s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked,true,'migration_lock_unavailable');
   for(const key of Object.keys(context.columns).sort())await tx.unsafe(electiveTableLock(key));await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
   const packagePaths=context.migrations??ELECTIVE_MIGRATIONS,validateJournal=context.validateJournal??(rows=>assertPriorJournal(rows,context.sources,context.legacyJournal));
   assert.equal(await schemaFingerprint(tx),context.baselineFingerprint);assert.deepEqual(validateJournal(await readMigrationJournal(tx)),context.priorJournal);assert.deepEqual(await preservedRows(tx,context.columns),context.rows);await assertEducationBaseline(tx);await context.revalidate(tx);
   const executionSources=Object.fromEntries(packagePaths.map(p=>{const{sql:_sql,...meta}=prepareMigrationSql(context.sources[p].sql);return[p,meta];}));
   for(const p of packagePaths)await tx.unsafe(prepareMigrationSql(context.sources[p].sql).sql);
   await tx`set constraints all immediate`;assert.deepEqual(await preservedRows(tx,context.columns),context.rows);
   const fingerprint=await schemaFingerprint(tx);if(context.installedFingerprint)assert.equal(fingerprint,context.installedFingerprint);
   const columns=await preservedColumns(tx),newTables=Object.keys(columns).filter(key=>!Object.hasOwn(context.columns,key));
   for(const key of newTables){assert.ok(key.startsWith('public.'),'new_auth_table_refused');const[privacy]=await tx`select relrowsecurity rls,relforcerowsecurity forced from pg_class where oid=${key}::regclass`;assert.ok(privacy.rls&&privacy.forced,'new_table_rls_required');assert.equal((await preservedRows(tx,{[key]:columns[key]}))[key].count,0,'new_tables_must_be_empty');for(const role of ['anon','authenticated','service_role','skolplattform_worker'])assert.equal((await tx`select has_table_privilege(${role},${key},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false,'new_table_privilege_refused');}
   for(const p of packagePaths)await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version(p)},${name(p)},${[context.sources[p].sql]})`;
   const journal=await readMigrationJournal(tx);assert.equal(journal.length,context.priorJournal.count+packagePaths.length);assert.deepEqual(journal.slice(0,context.priorJournal.count),context.originalJournal);
   for(const[i,p]of packagePaths.entries())assert.deepEqual(journal[context.priorJournal.count+i],{version:version(p),name:name(p),statements:[context.sources[p].sql]});
   await context.revalidate(tx);
   let auditId=null;
   if(phase==='apply'){assert.ok(context.audit);const[audit]=await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details) values(${context.audit.runId},'cli','elective_migration_install','migration_package','ok',${tx.json(context.audit.details)}) returning id`;auditId=audit.id;}
   return {fingerprint,newTables:newTables.length,journalCount:journal.length,journalSha256:sha(journal),auditId,executionSources};
}
export async function applyElectiveBlocks(options){
 const output=privatePath(options.out);assert.equal(realpathSync(dirname(output)),dirname(output),'private_output_parent_symlink');
 const sink=reserveReport(output,'elective-blocks-migration-evidence',options.mode),r=sink.report;r.checks=[];let db,locked=false;
 try{
  assert.ok(['rehearsal','apply'].includes(options.mode));const candidate=evidence(options.candidate),verification=evidence(options.verification),sources=migrationSourceSnapshot();
  validateReleaseEvidence(candidate.value,verification.value,{candidatePath:candidate.path,candidateSha256:candidate.sha256});
  r.candidate={path:candidate.path,sha256:candidate.sha256,revision:candidate.value.revision,artifact:{sha256:candidate.value.artifact.sha256,fileCount:candidate.value.artifact.fileCount}};r.verification={path:verification.path,sha256:verification.sha256};r.sqlSourceHashes=sourceHashes(sources);r.executionSources=migrationExecutionSnapshot(sources);r.installerSourceHashes=installerSourceHashes();
  hex(verification.value.installedFingerprint);hex(verification.value.baselineFingerprint);hex(verification.value.baselineJournalSha256);hex(verification.value.targetIdentitySha256);assert.deepEqual(verification.value.installerSourceHashes,r.installerSourceHashes,'installer_not_in_release_evidence');
  const prior=options.mode==='apply'?evidence(options.rehearsal):null;
  if(prior){assertRehearsalEvidence(prior.value,r);r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};}
  const target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);assert.equal(r.targetIdentity.sha256,verification.value.targetIdentitySha256);if(prior)assert.deepEqual(prior.value.targetIdentity,r.targetIdentity);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'target_lock_unavailable');locked=true;
  const legacy=verification.value.legacyJournal??[];
  r.beforeFingerprint=await schemaFingerprint(db);assert.equal(r.beforeFingerprint,verification.value.baselineFingerprint);const originalJournal=await readMigrationJournal(db);r.priorJournal=assertPriorJournal(originalJournal,sources,legacy);assert.equal(r.priorJournal.sha256,verification.value.baselineJournalSha256);
  r.educationBaseline=await assertEducationBaseline(db);r.originalColumns=await preservedColumns(db);r.beforeRows=await preservedRows(db,r.originalColumns);
  if(prior){assert.equal(prior.value.beforeFingerprint,r.beforeFingerprint);assert.deepEqual(prior.value.priorJournal,r.priorJournal);assert.deepEqual(prior.value.originalColumns,r.originalColumns);assert.deepEqual(prior.value.beforeRows,r.beforeRows);}
  let auditId=null;const preserve=q=>preservedRows(q,r.originalColumns,auditId);
  const revalidate=async(connection=db)=>{assert.deepEqual(sourceHashes(migrationSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(installerSourceHashes(),r.installerSourceHashes);assert.equal(evidence(options.candidate).sha256,candidate.sha256);assert.equal(evidence(options.verification).sha256,verification.sha256);if(prior)assert.equal(evidence(options.rehearsal).sha256,prior.sha256);const active=await assertTarget('protected');assert.deepEqual(await classCohortTargetIdentity(connection,active),r.targetIdentity);};
  const migrate=async(tx,phase)=>{
   r.stage=phase==='apply'?'installing':'rehearsing';sink.save();
   const result=await installElectivePackage(tx,{sources,legacyJournal:legacy,columns:r.originalColumns,baselineFingerprint:r.beforeFingerprint,rows:r.beforeRows,priorJournal:r.priorJournal,originalJournal,installedFingerprint:verification.value.installedFingerprint,revalidate,
    audit:{runId:r.runId,details:{candidateSha256:candidate.sha256,verificationSha256:verification.sha256,revision:candidate.value.revision,sqlSourceHashes:r.sqlSourceHashes,executionSources:r.executionSources}}},phase);
   auditId=result.auditId;r.stage=phase==='apply'?'commit_pending':'rollback_pending';sink.save();return result;
  };
  await runElectiveTransactions({db,mode:options.mode,report:r,fingerprint:schemaFingerprint,recorded:async q=>Number((await q`select count(*) n from supabase_migrations.schema_migrations where version>=${'20261030110000'}`)[0].n),preserve,migrate});
  r.afterRows=await preserve(db);assert.deepEqual(r.afterRows,r.beforeRows);r.afterFingerprint=await schemaFingerprint(db);
  if(options.mode==='rehearsal'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(assertPriorJournal(await readMigrationJournal(db),sources,legacy),r.priorJournal);r.rollbackRestored=true;}
  else{assert.equal(r.afterFingerprint,r.installed.fingerprint);assert.equal(sha(await readMigrationJournal(db)),r.installed.journalSha256);assert.ok(auditId!==null);r.auditRowsAdded=1;}
  await revalidate();r.finalSqlSourceHashes=sourceHashes(migrationSourceSnapshot());r.status='PASS';delete r.failureCode;r.stage='verified';
 }catch(error){r.status='FAIL';r.failureCode='installation_failed';r.failure={code:typeof error.code==='string'&&/^[A-Z0-9_]{1,40}$/u.test(error.code)?error.code:null,name:error.name==='AssertionError'?'AssertionError':'Error',messageSha256:sha(String(error.message??''))};if(r.stage==='commit_pending'&&!r.committed)r.commitOutcome='unknown';}
 finally{if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}}r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await applyElectiveBlocks(parseElectiveInstallArgs(process.argv.slice(2)));console.log(`${report.status}: elective SQL installation; mode=${report.mode}; committed=${report.committed===true}; checks=${report.checks?.length??0}`);if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: elective SQL installation preflight');process.exitCode=1;}
}
