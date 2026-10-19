#!/usr/bin/env node
// 05 PLANNING-YEAR-SHARED-GRIM: migration och SQL-prov i en transaktion som alltid rullas tillbaka.
// Kör: node work/pilot/verify-planning-year-shared-grim.mjs [--apply]  (endast skyddat lokalt mål)
// Utan flagga består inget. --apply kör först samma rollback-prov och installerar sedan migrationen
// i en egen transaktion som registreras i supabase_migrations.schema_migrations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const migrationPath='supabase/migrations/20261019150000_planning_year_shared_grim_units.sql';
const testPath='supabase/tests/phase5_planning_year_shared_grim.test.sql';
const rollback=Error('shared_grim_rollback');
const sha=text=>createHash('sha256').update(text).digest('hex');
const migration=readFileSync(resolve(root,migrationPath),'utf8');
const testFile=readFileSync(resolve(root,testPath),'utf8');
assert.ok(testFile.startsWith('begin;\n')&&testFile.endsWith('rollback;\n'),'test must own begin/rollback');
const testBody=testFile.slice('begin;\n'.length,-'rollback;\n'.length);

const fingerprint=async tx=>(await tx`
 select (select md5(string_agg(p.oid::regprocedure::text||md5(pg_get_functiondef(p.oid))||coalesce(p.proacl::text,''),',' order by p.oid::regprocedure::text))
   from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname<>'phase5_planning_year_rows') others,
  (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid='public.phase5_planning_year_rows(jsonb)'::regprocedure) rows_def,
  (select coalesce(p.proacl::text,'') from pg_proc p where p.oid='public.phase5_planning_year_rows(jsonb)'::regprocedure) rows_acl,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.offerings t) offerings,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.offering_units t) offering_units,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.timplans t) timplans,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.timplan_cells t) timplan_cells,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.class_timplans t) class_timplans,
  (select md5(coalesce(string_agg(t::text,',' order by t::text),'')) from public.mandate_units t) mandate_units,
  (select count(*)::integer from supabase_migrations.schema_migrations where version='20261019150000') recorded`)[0];
const business=f=>JSON.stringify([f.offerings,f.offering_units,f.timplans,f.timplan_cells,f.class_timplans,f.mandate_units]);
const tapLines=results=>results.flat().flatMap(row=>Object.values(row??{})).filter(v=>typeof v==='string'&&/^((not )?ok \d+|#)/.test(v));
const errorText=e=>`${e.code??''} ${e.message}`;

const mode=process.argv[2]??'--verify';assert.ok(['--verify','--apply'].includes(mode),'mode');
const target=await assertTarget('protected');
const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
const report={kind:'planning-year-shared-grim',mode,sources:{[migrationPath]:sha(migration),[testPath]:sha(testFile)},checks:[]};
const check=(name,ok,detail)=>{report.checks.push({name,ok,...(detail===undefined?{}:{detail})});assert.ok(ok,`${name}: ${JSON.stringify(detail)}`);};
let failure;
try{
 report.before=await fingerprint(db);
 try{await db.begin(async tx=>{
  await tx`set transaction isolation level repeatable read`;await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='120s'`;
  check('migration not yet recorded',report.before.recorded===0,report.before.recorded);
  // Provet måste falla på nuvarande definition, annars bevisar det inte rättningen.
  let pre;try{await tx.savepoint(async sp=>{await sp.unsafe(testBody);});}catch(e){pre=e;}
  check('test fails before migration on its assertions',/failed/i.test(pre?.message??''),pre&&errorText(pre));
  // Förkontrollen stoppar migrationen om en utbildning saknar huvudskolerad.
  let preflight;try{await tx.savepoint(async sp=>{
   await sp`set local session_replication_role=replica`;
   await sp`insert into public.customers(id,name) values('55390000-0000-4000-8000-000000000901','Syntetisk förkontroll')`;
   await sp`insert into public.organizers(id,customer_id,name,type) values('55390000-0000-4000-8000-000000000902','55390000-0000-4000-8000-000000000901','Syntetisk förkontroll','Kommun')`;
   await sp`insert into public.school_units(id,organizer_id,code,name,municipality_code) values('55390000-0000-4000-8000-000000000903','55390000-0000-4000-8000-000000000902','55009903','Syntetisk förkontrollskola','0000')`;
   await sp`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values('55390000-0000-4000-8000-000000000904','55390000-0000-4000-8000-000000000902','55390000-0000-4000-8000-000000000903','grundskola','Utan länk','Text')`;
   await sp`set local session_replication_role=origin`;
   await sp.unsafe(migration);});}catch(e){preflight=e;}
  check('preflight refuses missing primary link',/Planning year scope missing primary school/.test(preflight?.message??''),preflight&&errorText(preflight));
  const beforeMigration=await fingerprint(tx);
  check('savepoints left no trace',JSON.stringify(beforeMigration)===JSON.stringify(report.before),beforeMigration);
  await tx.unsafe(migration);
  const afterMigration=await fingerprint(tx);
  check('only phase5_planning_year_rows changed',afterMigration.others===report.before.others&&afterMigration.rows_def!==report.before.rows_def,afterMigration);
  check('rows ACL unchanged',afterMigration.rows_acl===report.before.rows_acl,afterMigration.rows_acl);
  check('no business rows changed',business(afterMigration)===business(report.before));
  // finish() utan undantag efter migrationen så att varje fall och diagnos redovisas.
  const tap=tapLines(await tx.unsafe(testBody.replace('select * from finish(true);','select * from finish();')));
  report.tap=tap;
  check('all SQL cases pass after migration',tap.some(line=>line.startsWith('ok '))&&!tap.some(line=>line.startsWith('not ok')||/failed/i.test(line)),tap.filter(line=>!line.startsWith('ok ')));
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 report.after=await fingerprint(db);
 check('rollback restored database',report.after.rows_def===report.before.rows_def&&report.after.others===report.before.others&&report.after.recorded===0,report.after);
 if(mode==='--apply'){
  await db.begin(async tx=>{
   await tx`set transaction isolation level repeatable read`;await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   check('install lock acquired',(await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked===true);
   const before=await fingerprint(tx);
   check('install starts from verified definition',before.rows_def===report.before.rows_def&&before.others===report.before.others&&before.recorded===0,before);
   const started=Date.now();await tx.unsafe(migration);
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261019150000','planning_year_shared_grim_units',${[migration]})`;
   const installed=await fingerprint(tx);report.lockHoldMsBeforeCommit=Date.now()-started;
   check('install changes only rows definition',installed.others===before.others&&installed.rows_def!==before.rows_def&&installed.rows_acl===before.rows_acl&&installed.recorded===1,installed);
   check('install leaves business rows unchanged',business(installed)===business(before));
   report.installed=installed;
  });
  report.committed=true;
  const after=await fingerprint(db);report.afterInstall=after;
  check('installation persisted',after.rows_def===report.installed.rows_def&&after.others===report.installed.others&&after.recorded===1,after);
 }
}catch(e){failure=e;}finally{await db.end({timeout:5});}
report.status=failure?'FAIL':'PASS';if(failure)report.error=failure.message;
console.log(JSON.stringify(report,null,1));
process.exitCode=failure?1:0;
