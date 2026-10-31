#!/usr/bin/env node
// Owned migrations-built PostgreSQL only. No protected target/URL/runtime is accepted or inspected.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstYearFixture,seedYearHistory} from './tjanst-year-fixtures.mjs';
import {planRead} from './tjanst-fixtures.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {ELECTIVE_MIGRATIONS,KNOWN_UNJOURNALLED,electiveTableLock,migrationSourceSnapshot,assertPriorJournal,preservedColumns,preservedRows,installElectivePackage,runElectiveTransactions,sha,assertEducationBaseline,prepareMigrationSql,migrationExecutionSnapshot,readMigrationJournal,installerSourceHashes} from './apply-elective-blocks.mjs';
const out=process.argv[2];assert.ok(out?.startsWith('/private/tmp/')&&out.endsWith('.json'),'private_output_required');
const report={kind:'ephemeral-elective-install-proof',status:'FAIL',checks:[],targetContact:false,committedProtected:false};
const check=name=>report.checks.push({name,ok:true});
const own=await createEphemeralMigratedDb({exclude:ELECTIVE_MIGRATIONS.map(p=>p.split('/').at(-1))});
try{
 const db=own.db,sources=migrationSourceSnapshot();
 const rollback=Symbol('owned_provider_permission_probe'),provider='vb_provider_'+randomUUID().replaceAll('-','').slice(0,12),operator='vb_operator_'+randomUUID().replaceAll('-','').slice(0,12),quote=s=>'"'+s.replaceAll('"','""')+'"';
 try{await db.begin(async tx=>{
  await tx.unsafe('create role '+quote(provider));await tx.unsafe('create role '+quote(operator));
  await tx`create table if not exists auth.schema_migrations(version text primary key)`;
  await tx.unsafe('alter table auth.schema_migrations owner to '+quote(provider));await tx.unsafe('grant usage on schema auth to '+quote(operator));await tx.unsafe('grant select on auth.schema_migrations to '+quote(operator));
  let denied=false;try{await tx.savepoint(async sp=>{await sp.unsafe('set local role '+quote(operator));await sp`lock table auth.schema_migrations in share row exclusive mode`;});}catch(error){assert.equal(error.code,'42501');denied=true;}assert.equal(denied,true);
  await tx.savepoint(async sp=>{await sp.unsafe('set local role '+quote(operator));await sp.unsafe(electiveTableLock('auth.schema_migrations'));await sp`select count(*) from auth.schema_migrations`;});
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 check('provider-owned auth migration journal admits read lock without write privilege; probe roles/table changes rollback');
report.installerSourceHashes=installerSourceHashes();report.provenance=own.provenance;report.sourceHashes=Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
 await db`create schema if not exists supabase_migrations`;await db`create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
 // Reproduce provider defaults before new objects: table/function grants must be explicitly revoked.
 await db`alter default privileges in schema public grant all on tables to service_role`;
 await db`alter default privileges in schema public grant execute on functions to service_role`;
 const aclRollback=Symbol('provider_default_acl_probe');let exposed;
 try{await db.begin(async tx=>{
  for(const p of ELECTIVE_MIGRATIONS.slice(0,-1))await tx.unsafe(prepareMigrationSql(sources[p].sql).sql);
  exposed=(await tx`select has_table_privilege('service_role','public.elective_participant_bindings','SELECT') table_read,(select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and left(proname,9)='elective_' and has_function_privilege('service_role',oid,'EXECUTE')) helper_execute`)[0];
  assert.equal(exposed.table_read,true);assert.ok(exposed.helper_execute>0);throw aclRollback;
 });}catch(error){if(error!==aclRollback)throw error;}
 report.providerDefaults={reproduced:true,pre157TableRead:exposed.table_read,pre157ExecutableHelpers:exposed.helper_execute};check('broad provider defaults reproduce pre157 service table/function access in rollback only');
 const originals=Object.keys(sources).filter(p=>!ELECTIVE_MIGRATIONS.includes(p)&&!KNOWN_UNJOURNALLED.includes(p));
 await db.begin(async tx=>{for(const p of originals){const f=p.split('/').at(-1);await tx`insert into supabase_migrations.schema_migrations values(${f.slice(0,14)},${f.slice(15,-4)},${[sources[p].sql]})`;}});
 // Synthetic journal-shape fixture: current DDL is independently checked; empty history is never reconstructed.
 const emptyVersions=['20260930110000','20260930120000','20260930121000','20260930130000','20260930140000','20260930150000'];
 for(const v of emptyVersions)await db`update supabase_migrations.schema_migrations set statements=${[]} where version=${v}`;
 const legacyJournal=originals.filter(p=>emptyVersions.includes(p.split('/').at(-1).slice(0,14))).map(p=>({version:p.split('/').at(-1).slice(0,14),name:p.split('/').at(-1).slice(15,-4),statementsSha256:sha([]),repositorySourceSha256:sources[p].sha256,reason:'verified-baseline-history'}));assert.equal(legacyJournal.length,6);
 let fixture,history;await db.begin(async tx=>{fixture=await createTjanstYearFixture(tx);history=await seedYearHistory(tx,fixture);});
 const readRollback=Error('own_read_rollback');
 const published=async()=>{let result;try{await db.begin(async tx=>{await fixture.f.actor(tx,'principalA');const value=await planRead(tx,{unitId:fixture.unitId,schoolYear:fixture.schoolYear-1,versionId:history.versionId});result={version:value.version,rows:value.rows,specials:value.specials,joints:value.joints};throw readRollback;});}catch(e){if(e!==readRollback)throw e;}return result;};
 const frozen=await published();assert.ok(frozen.rows.length);check('seed contains an actual frozen legacy class publication and row');
 const columns=await preservedColumns(db),rows=await preservedRows(db,columns),originalJournal=await readMigrationJournal(db),baselineFingerprint=await schemaFingerprint(db),priorJournal=assertPriorJournal(originalJournal,sources,legacyJournal);
 assert.equal(priorJournal.count,originals.length);await assertEducationBaseline(db);check('exact prior journal with six explicitly reviewed empty synthetic statements and education DDL baseline validated');
 for(const key of ['public.pupils','public.pupil_placements','public.pupil_class_memberships','public.identities','public.memberships','public.school_classes','public.class_timplans','public.tjanst_versions'])assert.ok(rows[key]?.count>0,key);check('synthetic pupils, memberships, classes, links, identities and published history are nonempty');
 let installedFingerprint=null,auditId=null;
 const context={sources,legacyJournal,columns,rows,originalJournal,priorJournal,baselineFingerprint,revalidate:async()=>assert.deepEqual(Object.fromEntries(Object.entries(migrationSourceSnapshot()).map(([p,v])=>[p,v.sha256])),report.sourceHashes),audit:{runId:randomUUID(),details:{syntheticOwnedProof:true,sqlSourceHashes:report.sourceHashes,executionSources:migrationExecutionSnapshot(sources)}}};
 const count=async q=>Number((await q`select count(*) n from supabase_migrations.schema_migrations where version>='20261030110000'`)[0].n);
 const migrate=async(tx,phase)=>{const result=await installElectivePackage(tx,{...context,installedFingerprint},phase);installedFingerprint=result.fingerprint;auditId=result.auditId;return result;};
 report.rehearsal={checks:[]};await runElectiveTransactions({db,mode:'rehearsal',report:report.rehearsal,fingerprint:schemaFingerprint,recorded:count,preserve:q=>preservedRows(q,columns),migrate});
 assert.equal(await schemaFingerprint(db),baselineFingerprint);assert.deepEqual(await preservedRows(db,columns),rows);assert.equal(await count(db),0);assert.deepEqual(await published(),frozen);check('real full-package rehearsal rolled back schema, journal, original rows and published payload');
 const last=ELECTIVE_MIGRATIONS.at(-1),body=prepareMigrationSql(sources[last].sql).sql;
 const broken={...sources,[last]:{sql:'begin;\n'+body+'\nselect 1/0;\ncommit;',sha256:sha('owned injected failure')}};
 await assert.rejects(db.begin(tx=>installElectivePackage(tx,{...context,sources:broken,revalidate:async()=>{}},'apply')),e=>e.code==='22012');
 assert.equal(await schemaFingerprint(db),baselineFingerprint);assert.equal(await count(db),0);assert.deepEqual(await preservedRows(db,columns),rows);check('SQL failure in the final wrapped migration rolls back every earlier migration and all old data');
 const fault=Error('owned_injected_post_ddl_failure');let calls=0;
 await assert.rejects(db.begin(tx=>installElectivePackage(tx,{...context,installedFingerprint,revalidate:async()=>{if(++calls===2)throw fault;}},'apply')),e=>e===fault);
 assert.equal(await schemaFingerprint(db),baselineFingerprint);assert.equal(await count(db),0);assert.deepEqual(await preservedRows(db,columns),rows);check('injected failure after DDL/journal rolls back the entire package');
 report.applyOwned={checks:[]};await runElectiveTransactions({db,mode:'apply',report:report.applyOwned,fingerprint:schemaFingerprint,recorded:count,preserve:q=>preservedRows(q,columns,auditId),migrate});
 assert.equal(await count(db),ELECTIVE_MIGRATIONS.length);assert.equal(await schemaFingerprint(db),installedFingerprint);assert.deepEqual(await preservedRows(db,columns,auditId),rows);assert.deepEqual(await published(),frozen);
 const audit=(await db`select details from public.security_events where id=${auditId}`)[0];assert.deepEqual(audit.details.sqlSourceHashes,report.sourceHashes);assert.deepEqual(audit.details.executionSources,migrationExecutionSnapshot(sources));check('owned apply repeats rollback first, commits the complete exact-source suffix plus one audit and preserves old data');
 const journal=await readMigrationJournal(db);assert.equal(journal.length,priorJournal.count+ELECTIVE_MIGRATIONS.length);assert.deepEqual(journal.slice(0,priorJournal.count),originalJournal);assert.equal(journal.filter(r=>emptyVersions.includes(r.version)&&r.statements.length===0).length,6);check('all six empty historical statements remain empty: no journal backfill, old DDL replay or altered prior statements');
 const forbidden=(await db`select count(*)::integer n from pg_proc where pronamespace='public'::regnamespace and left(proname,9)='elective_' and has_function_privilege('service_role',oid,'EXECUTE')`)[0].n;assert.equal(forbidden,0);check('final package denies service role raw helpers under reproduced provider defaults; table deny gate passed');
 report.beforeRows=rows;report.afterRows=await preservedRows(db,columns,auditId);report.publishedHashBefore=sha(frozen);report.publishedHashAfter=sha(await published());report.baselineFingerprint=baselineFingerprint;report.installedFingerprint=installedFingerprint;assert.deepEqual(installerSourceHashes(),report.installerSourceHashes);report.status='PASS';
}catch(error){report.failure={code:typeof error.code==='string'?error.code:null,messageSha256:sha(String(error.message??'')),position:error.position??null,routine:error.routine??null,operator:error.operator??null,frames:[...String(error.stack??'').matchAll(/([a-z0-9-]+\.mjs):(\d+):(\d+)/g)].slice(0,8).map(m=>m[0])};throw Error('owned_elective_install_failed');}
finally{await own.end();report.databaseClosed=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}
console.log(`${report.status}: owned elective migration rehearsal/apply; checks=${report.checks.length}; protectedContact=false`);
