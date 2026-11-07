#!/usr/bin/env node
// VP-15. Own migrations-built PostgreSQL; no target, URL, runtime or actual business data is accepted.
// The database stops at the class link, gets a block, an open round, a confirmed choice and groups on the old schema, and then
// runs the same runSimplification as the installer. This is a proof of the migration chain with synthetic data, not of 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {KNOWN_UNJOURNALLED,preservedColumns,preservedRows,readMigrationJournal,sha} from './apply-elective-blocks.mjs';
import {hashes} from './apply-valplan.mjs';
import {SIMPLIFICATION_MIGRATIONS,assertSimplificationRehearsal,installerSources,runSimplification,simplificationSourceSnapshot} from './apply-valplan-simplification.mjs';
const at=process.argv.indexOf('--out'),out=at>=0?process.argv[at+1]:process.argv[2];assert.ok(out?.startsWith('/private/tmp/')&&out.endsWith('.json'));
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const report={kind:'ephemeral-valplan-simplification-install-proof',status:'FAIL',targetContact:false,committedProtected:false,checks:[]};
const pass=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const fresh=mode=>({kind:'valplan-simplification-migration-evidence',runId:randomUUID(),mode,status:'FAIL',checks:[],sqlSourceHashes:report.sourceHashes,installerSources:report.installerSources});
const own=await createEphemeralMigratedDb({exclude:SIMPLIFICATION_MIGRATIONS.map(p=>p.split('/').at(-1))});
try{
 const db=own.db,sources=simplificationSourceSnapshot();report.provenance=own.provenance;report.sourceHashes=hashes(sources);report.installerSources=installerSources();
 const revalidate=async()=>assert.deepEqual(hashes(simplificationSourceSnapshot()),report.sourceHashes);
 await db`create schema if not exists supabase_migrations`;await db`create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[])`;
 await db.begin(async tx=>{for(const path of Object.keys(sources).filter(p=>!SIMPLIFICATION_MIGRATIONS.includes(p)&&!KNOWN_UNJOURNALLED.includes(p))){const file=path.split('/').at(-1);await tx`insert into supabase_migrations.schema_migrations values(${file.slice(0,14)},${file.slice(15,-4)},${[sources[path].sql]})`;}});

 let f,first,second;await db.begin(async t=>{f=await createTjanstFixture(t);first=await seedElectiveTimeFrame(t,f);second=await seedElectiveTimeFrame(t,f);});
 const unitId=first.unitId,schoolYear=first.schoolYear,scope={unitId,schoolYear},[classA,classB]=[first,second].map(s=>s.frameSourceKey.split(':')[1]),{inGroup:pupil,inGroup2:pupil2,outside:pupil3}=f.pupils;
 await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`update public.pupil_class_memberships set class_id=${classA} where pupil_id in ${t([pupil,pupil2])}`;await t`update public.pupil_class_memberships set class_id=${classB} where pupil_id=${pupil3}`;});
 const principal=fn=>db.begin(async t=>{await f.actor(t,'principalA');await t`set local role skolplattform_worker`;return fn(t);});
 const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
 const course=(subjectCode,itemCode,points,extra={})=>({id:randomUUID(),subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`${subjectCode} ${itemCode}`,minutesHt:points*27,minutesVt:points*27,classIds:null,...extra});
 const rows=(await principal(t=>t`select public.valplan_read(${t.json(scope)}) value`))[0].value.result.rows.filter(r=>r.rowKey==='block:iv1');assert.equal(rows.length,2);
 const psyl=course('PSYL','PSYL1000X',50),fils=course('FILS','FILS1000X',50),reto=course('RETO','RETO1000X',100),limited=course('ADMI','ADMI1000X',100,{classIds:[classB]});
 const doc={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Befintligt block',revision:1,courses:[psyl,fils,reto,limited],rows:rows.map(r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year}))};
 await principal(t=>t`select public.valplan_command(${t.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision:0,catalogId:catalog.catalogId,valplan:doc})})`);
 const choiceScope={...scope,valplanId:doc.id},staff=(action,payload)=>principal(t=>t`select public.valplan_choice_command(${t.json({contractVersion:'valplan_choice_v1',commandId:randomUUID(),action,...choiceScope,payload})}) value`);
 const later=(await db`select (public.app_today()+30)::text value`)[0].value;
 await staff('set_policy',{guardianConfirmation:false});await staff('open_round',{expectedRevision:0,closesOn:later});
 await staff('record_choice',{pupilId:pupil,expectedChoiceRevision:0,courseIds:[psyl.id,fils.id,reto.id]});await staff('confirm_choice',{pupilId:pupil,expectedChoiceRevision:1});await staff('create_groups',{});
 const choiceBefore=(await principal(t=>t`select public.valplan_choice_read(${t.json(choiceScope)}) value`))[0].value.result.pupils.find(p=>p.id===pupil).choice;assert.equal(choiceBefore.state,'confirmed');

 const columns=await preservedColumns(db),rowsBefore=await preservedRows(db,columns),baseline=await schemaFingerprint(db),journal=await readMigrationJournal(db);
 for(const table of ['valplans','valplan_courses','valplan_course_classes','valplan_rows','valplan_versions','valplan_commands','valplan_rounds','valplan_choices','study_groups','study_group_memberships'])assert.ok(rowsBefore['public.'+table].count>0,table);
 pass('the old schema holds a block, a class limit, an open round, a confirmed choice and groups');
 const untouched=async()=>{assert.equal(await schemaFingerprint(db),baseline);assert.deepEqual(await readMigrationJournal(db),journal);assert.deepEqual(await preservedRows(db,columns),rowsBefore);};
 const fails=async(run,reason)=>{let caught=null;try{await run();}catch(error){caught=error;}assert.ok(caught,'must fail');if(reason)assert.match(String(caught.message),reason);};

 const rehearsal=await runSimplification({db,mode:'rehearsal',report:fresh('rehearsal'),sources,revalidate});rehearsal.status='PASS';rehearsal.databaseClosed=true;
 assert.equal(rehearsal.rollbackRestored,true);assert.equal(rehearsal.committed,false);await untouched();report.transition=rehearsal.transition;report.privileges=rehearsal.privileges;
 pass('rehearsal runs all four migrations, then restores exact schema, journal and rows');

 let calls=0;await fails(()=>runSimplification({db,mode:'apply',report:fresh('apply'),sources,prior:rehearsal,revalidate:async()=>{if(++calls===4)throw Error('owned_late_fault');}}),/owned_late_fault/);assert.equal(calls,4);await untouched();
 pass('a failure after the migrations and the journal rolls back the whole apply');

 const fault='valplan_simplification_install_fault';await db.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$begin if new.action='elective_migration_install' then raise exception 'owned_audit_fault';end if;return new;end$$;create trigger ${fault} before insert on public.security_events for each row execute function public.${fault}()`);
 const faultPrint=await schemaFingerprint(db);await fails(async()=>{const first=await runSimplification({db,mode:'rehearsal',report:fresh('rehearsal'),sources,revalidate});await runSimplification({db,mode:'apply',report:fresh('apply'),sources,prior:first,revalidate});},/owned_audit_fault/);
 assert.equal(await schemaFingerprint(db),faultPrint);assert.deepEqual(await readMigrationJournal(db),journal);assert.deepEqual(await preservedRows(db,columns),rowsBefore);
 await db.unsafe(`drop trigger ${fault} on public.security_events;drop function public.${fault}()`);await untouched();pass('a failed audit row rolls back schema and journal and keeps every row');

 const [{name}]=await db`select name from public.valplans where id=${doc.id}`;await db`update public.valplans set name=${name+' ändrad'} where id=${doc.id}`;
 await fails(()=>runSimplification({db,mode:'apply',report:fresh('apply'),sources,prior:rehearsal,revalidate}),/target_changed_since_rehearsal:beforeRows/);await db`update public.valplans set name=${name} where id=${doc.id}`;await untouched();pass('apply refuses a database that changed after the rehearsal');

 const link=journal.find(r=>r.version==='20261106100000');await db`update supabase_migrations.schema_migrations set statements=${['-- annan text']} where version=${link.version}`;
 await fails(()=>runSimplification({db,mode:'rehearsal',report:fresh('rehearsal'),sources,revalidate}),/installed_journal_differs/);await db`update supabase_migrations.schema_migrations set statements=${link.statements} where version=${link.version}`;await untouched();pass('the class link in the journal must be byte-identical to its source');

 await db.begin(async tx=>{await tx`revoke all on function public.valplan_read(jsonb) from skolplattform_worker`;await tx`grant execute on function public.valplan_pupil_row(public.valplans,uuid) to skolplattform_worker`;});
 await fails(()=>runSimplification({db,mode:'rehearsal',report:fresh('rehearsal'),sources,revalidate}),/worker_entrypoint_missing|helper_exposed/);
 await db.begin(async tx=>{await tx`grant execute on function public.valplan_read(jsonb) to skolplattform_worker`;await tx`revoke all on function public.valplan_pupil_row(public.valplans,uuid) from skolplattform_worker`;});await untouched();pass('wrong rights for Worker stop the rehearsal');

 assertSimplificationRehearsal(rehearsal,fresh('apply'));
 const applied=await runSimplification({db,mode:'apply',report:fresh('apply'),sources,prior:rehearsal,revalidate});assert.equal(applied.committed,true);assert.equal(applied.auditRowsAdded,1);
 assert.deepEqual(applied.afterRows,rowsBefore);report.rowChanges=applied.rowChanges;
 const after=await readMigrationJournal(db);assert.equal(after.length,journal.length+4);assert.deepEqual(after.slice(0,-4),journal);assert.deepEqual(after.slice(-4).map(r=>r.statements[0]),SIMPLIFICATION_MIGRATIONS.map(p=>sources[p].sql));
 assert.equal(applied.afterFingerprint,rehearsal.rehearsal.fingerprint);assert.equal((await db`select count(*)::integer n from public.valplan_row_excluded_classes`)[0].n,0);
 pass('apply repeats the rehearsal, adds four exact journal rows and one audit row, and every original row is byte-identical');

 const read=(await principal(t=>t`select public.valplan_read(${t.json(scope)}) value`))[0].value.result,block=read.valplans.find(v=>v.valplan.id===doc.id).valplan;
 assert.ok(block.rows.every(l=>l.excludedClassIds.length===0));assert.deepEqual(block.courses.find(c=>c.id===limited.id).classIds,[classB]);
 for(const r of read.rows.filter(x=>x.rowKey==='block:iv1'))assert.deepEqual(r.blocks,[{valplanId:doc.id,classIds:r.classIds}]);pass('Worker reads the block in the new form, with every class and the class limit kept');
 const after2=(await principal(t=>t`select public.valplan_choice_read(${t.json(choiceScope)}) value`))[0].value.result.pupils.find(p=>p.id===pupil).choice;assert.deepEqual(after2,choiceBefore);pass('the confirmed choice reads the same after the installation');
 await principal(t=>t`select public.valplan_command(${t.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision:1,catalogId:catalog.catalogId,valplan:{...block,name:'Sparat efter installationen'}})})`);pass('Worker can save the block again after the installation');

 const again=await fails(()=>runSimplification({db,mode:'rehearsal',report:fresh('rehearsal'),sources,revalidate}),/unexpected_journal_tail/);assert.equal(again,undefined);pass('a second run is refused');
 report.baselineFingerprint=baseline;report.installedFingerprint=applied.afterFingerprint;report.originalTables=Object.keys(rowsBefore).length;report.status='PASS';
}catch(error){report.failure={name:error.name,code:error.code??null,message:String(error.message).split('\n')[0].slice(0,160),messageSha256:sha(String(error.message??'')),position:error.position??null};console.error('FAIL',report.failure.message);process.exitCode=1;}
finally{await own.end();report.databaseClosed=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}
console.log(`valplan-simplification-install ${report.status} ${report.checks.length}`);
