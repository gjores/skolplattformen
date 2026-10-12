#!/usr/bin/env node
// Exact source-bound local DDL, first rollback then apply. No business deletion.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {migrationName,sourceHashes,classBusinessHashes} from './verify-class-timplans.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('class_ddl_rollback'),version=migrationName.slice(0,14);
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));for(let i=0;i<args.length;i+=2){assert.ok(['--flow-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);opts[args[i]]=resolve(args[i+1]);}
 assert.ok(opts['--flow-evidence']?.startsWith('/private/tmp/')&&opts['--out']?.startsWith('/private/tmp/'));
 const sources=sourceHashes(),flow=JSON.parse(readFileSync(opts['--flow-evidence'],'utf8'));assert.equal(flow.kind,'class-timplans-rollback');assert.equal(flow.status,'PASS');assert.ok(flow.rollback&&flow.checks.length>=40&&flow.checks.every(c=>c.ok));assert.equal(flow.beforeFingerprint,flow.afterFingerprint);assert.deepEqual(flow.sourceHashes,sources);assert.deepEqual(flow.finalSourceHashes,sources);
 let prior;if(mode==='--apply'){assert.ok(opts['--evidence']?.startsWith('/private/tmp/'));prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));assert.equal(prior.status,'PASS');assert.equal(prior.mode,'--verify');assert.ok(prior.rollbackRestored);assert.deepEqual(prior.sourceHashes,sources);}
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let before,after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,failure,committed=false;
 try{before=await classBusinessHashes(db);baselineFingerprint=await vocationalDatabaseFingerprint(db);assert.equal(baselineFingerprint,flow.afterFingerprint);if(prior)assert.equal(baselineFingerprint,prior.baselineFingerprint);
 try{await db.begin(async tx=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);assert.equal(await vocationalDatabaseFingerprint(tx),baselineFingerprint);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012200000'`).length,1);
 const source=readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8');await tx.unsafe(source);await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_class_timplan_flow.test.sql'),'utf8'));assert.deepEqual(await classBusinessHashes(tx,true),before);assert.equal((await tx`select count(*)::integer count from public.class_plan_commands`)[0].count,0);
 afterMigrationFingerprint=await vocationalDatabaseFingerprint(tx);if(prior)assert.equal(afterMigrationFingerprint,prior.afterMigrationFingerprint);assert.deepEqual(sourceHashes(),sources);if(mode==='--verify')throw rollback;await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'class_timplan_flow',${[source]})`;
 });committed=true;}catch(e){if(e!==rollback)throw e;}
 after=await classBusinessHashes(db,committed);finalFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);if(!committed)assert.equal(finalFingerprint,baselineFingerprint);if(committed)copyFileSync(resolve(root,'supabase/migrations',migrationName),resolve(target.workdir,'supabase/migrations',migrationName));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'class-timplans-migration',status:failure?'FAIL':'PASS',mode,committed,sourceHashes:sources,beforeHashes:before,afterHashes:after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,rollbackRestored:!committed&&baselineFingerprint===finalFingerprint,failure:failure?{code:failure.code,message:failure.message}:null};writeFileSync(opts['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.status}: class migration ${mode}`);if(failure)process.exitCode=1;
}
await main();
