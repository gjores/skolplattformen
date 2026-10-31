#!/usr/bin/env node
// Own migrations-built PostgreSQL; no target, URL, runtime or actual business data is accepted.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstYearFixture,seedYearHistory} from './tjanst-year-fixtures.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {migrationSourceSnapshot,KNOWN_UNJOURNALLED,preservedColumns,preservedRows,readMigrationJournal,installElectivePackage,runElectiveTransactions,sha} from './apply-elective-blocks.mjs';
import {PREPARATION_MIGRATION,validatePreparationJournal,preparationInstallerSources} from './apply-elective-preparation.mjs';
import {assertElectivePrivileges} from './elective-privilege-scope.mjs';
const out=process.argv[2];assert.ok(out?.startsWith('/private/tmp/')&&out.endsWith('.json'));
const report={kind:'ephemeral-elective-preparation-install-proof',status:'FAIL',targetContact:false,committedProtected:false,checks:[]};
const pass=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const own=await createEphemeralMigratedDb({exclude:[PREPARATION_MIGRATION.split('/').at(-1)]});
try{
 const db=own.db,sources=migrationSourceSnapshot();report.provenance=own.provenance;report.sourceHashes=Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));report.installerSources=preparationInstallerSources();
 await db`create schema if not exists supabase_migrations`;await db`create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
 await db.begin(async tx=>{for(const path of Object.keys(sources).filter(path=>path!==PREPARATION_MIGRATION&&!KNOWN_UNJOURNALLED.includes(path))){const file=path.split('/').at(-1);await tx`insert into supabase_migrations.schema_migrations values(${file.slice(0,14)},${file.slice(15,-4)},${[sources[path].sql]})`;}});
 let fixture,history;await db.begin(async tx=>{fixture=await createTjanstYearFixture(tx);history=await seedYearHistory(tx,fixture);});
 const originalJournal=await readMigrationJournal(db),priorJournal={count:originalJournal.length,sha256:sha(originalJournal)},columns=await preservedColumns(db),rows=await preservedRows(db,columns),baselineFingerprint=await schemaFingerprint(db);
 assert.ok(rows['public.pupils'].count>0&&rows['public.class_timplans'].count>0&&rows['public.tjanst_versions'].count>0);pass('nonempty own pupil/class/link/published service baseline with14 prior elective migrations');
 const frozen=await db`select to_jsonb(x) body from public.tjanst_versions x where id=${history.versionId}`;assert.equal(frozen.length,1);
 const revalidate=async()=>assert.deepEqual(Object.fromEntries(Object.entries(migrationSourceSnapshot()).map(([p,v])=>[p,v.sha256])),report.sourceHashes);
 const base={sources,migrations:[PREPARATION_MIGRATION],validateJournal:value=>validatePreparationJournal(value,sources,priorJournal),columns,rows,originalJournal,priorJournal,baselineFingerprint,revalidate,audit:{runId:randomUUID(),details:{ownedProof:true,sqlSourceHashes:report.sourceHashes}}};
 const count=async connection=>Number((await connection`select count(*) n from supabase_migrations.schema_migrations where version='20261031100000'`)[0].n);
 let installedFingerprint=null,auditId=null;
 const migrate=async(tx,phase)=>{const result=await installElectivePackage(tx,{...base,installedFingerprint},phase);assert.equal(result.newTables,3);await assertElectivePrivileges(tx,{preparation:true});installedFingerprint=result.fingerprint;auditId=result.auditId;return result;};
 report.rehearsal={checks:[]};await runElectiveTransactions({db,mode:'rehearsal',report:report.rehearsal,fingerprint:schemaFingerprint,recorded:count,preserve:q=>preservedRows(q,columns),migrate});
 assert.equal(await schemaFingerprint(db),baselineFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);pass('incremental rehearsal creates exactly3 private tables and19 guarded entries, then restores exact DDL/journal/rows');
 let failed=false;
 try{await db.begin(async tx=>{let calls=0;await installElectivePackage(tx,{...base,installedFingerprint,revalidate:async()=>{if(++calls===2)throw Error('owned_late_revalidation_fault');}},'apply');});}catch{failed=true;}
 assert.equal(failed,true);assert.equal(await schemaFingerprint(db),baselineFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);assert.deepEqual(await preservedRows(db,columns),rows);pass('late failure after DDL and migration journal rolls back all schema/data/audit changes');
 const fault='elective_preparation_install_fault';await db.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$begin if new.action='elective_migration_install' then raise exception 'owned';end if;return new;end$$;create trigger ${fault} before insert on public.security_events for each row execute function public.${fault}()`);
 const faultFingerprint=await schemaFingerprint(db);failed=false;
 try{await db.begin(tx=>installElectivePackage(tx,{...base,baselineFingerprint:faultFingerprint,installedFingerprint:null},'apply'));}catch{failed=true;}
 assert.equal(failed,true);assert.equal(await schemaFingerprint(db),faultFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);assert.deepEqual(await preservedRows(db,columns),rows);
 await db.unsafe(`drop trigger ${fault} on public.security_events;drop function public.${fault}()`);assert.equal(await schemaFingerprint(db),baselineFingerprint);pass('final audit write failure rolls back all3 new tables and journal while preserving every original row');
 report.apply={checks:[]};await runElectiveTransactions({db,mode:'apply',report:report.apply,fingerprint:schemaFingerprint,recorded:count,preserve:q=>preservedRows(q,columns,auditId),migrate});
 assert.equal(await count(db),1);assert.equal(await schemaFingerprint(db),installedFingerprint);assert.deepEqual(await preservedRows(db,columns,auditId),rows);assert.deepEqual(await db`select to_jsonb(x) body from public.tjanst_versions x where id=${history.versionId}`,frozen);
 const journal=await readMigrationJournal(db);assert.deepEqual(journal.slice(0,-1),originalJournal);assert.equal(journal.length,originalJournal.length+1);assert.equal(journal.at(-1).statements[0],sources[PREPARATION_MIGRATION].sql);assert.ok(auditId);pass('apply repeats rehearsal, adds only1 exact-source migration and1 owned audit; all original rows and frozen publication remain byte-identical');
 assert.deepEqual(preparationInstallerSources(),report.installerSources);report.baselineFingerprint=baselineFingerprint;report.installedFingerprint=installedFingerprint;report.beforeRows=rows;report.afterRows=await preservedRows(db,columns,auditId);report.status='PASS';
}catch(error){report.failure={name:error.name,code:error.code??null,messageSha256:sha(String(error.message??'')),position:error.position??null};throw Error('owned_preparation_install_failed');}
finally{await own.end();report.databaseClosed=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}
