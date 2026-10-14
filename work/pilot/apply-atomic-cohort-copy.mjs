#!/usr/bin/env node
// Exact source-bound local foundation migration. Permanent activation requires
// a separate actual Worker preflight and is deliberately not implicit here.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {migrationName,sourceHashes,allPublicHashes} from './verify-atomic-cohort-copy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=migrationName.slice(0,14),rollback=Error('atomic_copy_ddl_rollback');
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));
 for(let i=0;i<args.length;i+=2){assert.ok(['--flow-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);assert.ok(!opts[args[i]]);opts[args[i]]=resolve(args[i+1]);}
 assert.ok(opts['--out']?.startsWith('/private/tmp/')&&opts['--flow-evidence']?.startsWith('/private/tmp/'));
 const sources=sourceHashes(),flow=JSON.parse(readFileSync(opts['--flow-evidence'],'utf8'));
 assert.ok(flow.kind==='atomic-cohort-copy-rollback'&&flow.status==='PASS'&&flow.target==='protected'&&flow.rollback&&flow.databaseClosed
  &&flow.beforeFingerprint===flow.afterFingerprint&&flow.checks.length>=35&&flow.checks.every(c=>c.ok));
 assert.deepEqual(flow.sourceHashes,sources);assert.deepEqual(flow.finalSourceHashes,sources);assert.deepEqual(flow.beforeHashes,flow.afterHashes);
 let prior;if(mode==='--apply'){assert.ok(opts['--evidence']?.startsWith('/private/tmp/'));prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));
  assert.ok(prior.kind==='atomic-cohort-copy-migration'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.rollbackRestored&&prior.databaseClosed);assert.deepEqual(prior.sourceHashes,sources);}
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let before,after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,failure,committed=false;
 try{
  before=await allPublicHashes(db);baselineFingerprint=await vocationalDatabaseFingerprint(db);assert.equal(baselineFingerprint,flow.afterFingerprint);if(prior)assert.equal(baselineFingerprint,prior.baselineFingerprint);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal(await vocationalDatabaseFingerprint(tx),baselineFingerprint);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);
   const oldFunctions=await tx`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`;
   const source=readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8');await tx.unsafe(source);await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_atomic_cohort_copy.test.sql'),'utf8'));
   assert.deepEqual(await allPublicHashes(tx),before);
   const afterFunctions=await tx`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('phase5_copy_programplan_education','phase5_programplan_copy_audit') order by 1`;
   assert.deepEqual(afterFunctions,oldFunctions);afterMigrationFingerprint=await vocationalDatabaseFingerprint(tx);if(prior)assert.equal(afterMigrationFingerprint,prior.afterMigrationFingerprint);assert.deepEqual(sourceHashes(),sources);
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'phase5_atomic_cohort_copy',${[source]})`;
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await allPublicHashes(db);finalFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);if(!committed)assert.equal(finalFingerprint,baselineFingerprint);assert.deepEqual(sourceHashes(),sources);
  if(committed)copyFileSync(resolve(root,'supabase/migrations',migrationName),resolve(target.workdir,'supabase/migrations',migrationName));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'atomic-cohort-copy-migration',status:failure?'FAIL':'PASS',mode,committed,databaseClosed:true,sourceHashes:sources,
  beforeHashes:before,afterHashes:after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,rollbackRestored:!committed&&baselineFingerprint===finalFingerprint,
  failure:failure?{code:failure.code,message:failure.message}:null};
 writeFileSync(opts['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: atomic copy foundation ${mode}`);if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
