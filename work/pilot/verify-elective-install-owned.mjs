#!/usr/bin/env node
// Owned migrations-built PostgreSQL only. No protected target/URL/runtime is accepted or inspected.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstYearFixture,seedYearHistory} from './tjanst-year-fixtures.mjs';
import {planRead} from './tjanst-fixtures.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {ELECTIVE_MIGRATIONS,KNOWN_UNJOURNALLED,migrationSourceSnapshot,assertPriorJournal,preservedColumns,preservedRows,installElectivePackage,runElectiveTransactions,sha,assertEducationBaseline,prepareMigrationSql,migrationExecutionSnapshot,readMigrationJournal,installerSourceHashes} from './apply-elective-blocks.mjs';
const out=process.argv[2];assert.ok(out?.startsWith('/private/tmp/')&&out.endsWith('.json'),'private_output_required');
const report={kind:'ephemeral-elective-install-proof',status:'FAIL',checks:[],targetContact:false,committedProtected:false};
const check=name=>report.checks.push({name,ok:true});
const own=await createEphemeralMigratedDb({exclude:ELECTIVE_MIGRATIONS.map(p=>p.split('/').at(-1))});
try{
 const db=own.db,sources=migrationSourceSnapshot();report.installerSourceHashes=installerSourceHashes();report.provenance=own.provenance;report.sourceHashes=Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
 await db`create schema if not exists supabase_migrations`;await db`create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
 const originals=Object.keys(sources).filter(p=>!ELECTIVE_MIGRATIONS.includes(p)&&!KNOWN_UNJOURNALLED.includes(p));
 await db.begin(async tx=>{for(const p of originals){const f=p.split('/').at(-1);await tx`insert into supabase_migrations.schema_migrations values(${f.slice(0,14)},${f.slice(15,-4)},${[sources[p].sql]})`;}});
 let fixture,history;await db.begin(async tx=>{fixture=await createTjanstYearFixture(tx);history=await seedYearHistory(tx,fixture);});
 const readRollback=Error('own_read_rollback');
 const published=async()=>{let result;try{await db.begin(async tx=>{await fixture.f.actor(tx,'principalA');const value=await planRead(tx,{unitId:fixture.unitId,schoolYear:fixture.schoolYear-1,versionId:history.versionId});result={version:value.version,rows:value.rows,specials:value.specials,joints:value.joints};throw readRollback;});}catch(e){if(e!==readRollback)throw e;}return result;};
 const frozen=await published();assert.ok(frozen.rows.length);check('seed contains an actual frozen legacy class publication and row');
 const columns=await preservedColumns(db),rows=await preservedRows(db,columns),originalJournal=await readMigrationJournal(db),baselineFingerprint=await schemaFingerprint(db),priorJournal=assertPriorJournal(originalJournal,sources,[]);
 assert.equal(priorJournal.count,originals.length);await assertEducationBaseline(db);check('exact prior sources and two known unjournalled education DDL baseline validated');
 for(const key of ['public.pupils','public.pupil_placements','public.pupil_class_memberships','public.identities','public.memberships','public.school_classes','public.class_timplans','public.tjanst_versions'])assert.ok(rows[key]?.count>0,key);check('synthetic pupils, memberships, classes, links, identities and published history are nonempty');
 let installedFingerprint=null,auditId=null;
 const context={sources,legacyJournal:[],columns,rows,originalJournal,priorJournal,baselineFingerprint,revalidate:async()=>assert.deepEqual(Object.fromEntries(Object.entries(migrationSourceSnapshot()).map(([p,v])=>[p,v.sha256])),report.sourceHashes),audit:{runId:randomUUID(),details:{syntheticOwnedProof:true,sqlSourceHashes:report.sourceHashes,executionSources:migrationExecutionSnapshot(sources)}}};
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
 const journal=await readMigrationJournal(db);assert.equal(journal.length,priorJournal.count+ELECTIVE_MIGRATIONS.length);assert.deepEqual(journal.slice(0,priorJournal.count),originalJournal);check('no old journal backfill, old DDL replay or altered prior statements');
 report.beforeRows=rows;report.afterRows=await preservedRows(db,columns,auditId);report.publishedHashBefore=sha(frozen);report.publishedHashAfter=sha(await published());report.baselineFingerprint=baselineFingerprint;report.installedFingerprint=installedFingerprint;assert.deepEqual(installerSourceHashes(),report.installerSourceHashes);report.status='PASS';
}catch(error){report.failure={code:typeof error.code==='string'?error.code:null,messageSha256:sha(String(error.message??'')),position:error.position??null,routine:error.routine??null,operator:error.operator??null,frames:[...String(error.stack??'').matchAll(/([a-z0-9-]+\.mjs):(\d+):(\d+)/g)].slice(0,8).map(m=>m[0])};throw Error('owned_elective_install_failed');}
finally{await own.end();report.databaseClosed=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}
console.log(`${report.status}: owned elective migration rehearsal/apply; checks=${report.checks.length}; protectedContact=false`);
