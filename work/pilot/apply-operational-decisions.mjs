#!/usr/bin/env node
// Forward-only, local-only function migration; exact rollback evidence required.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {decisionBusinessHashes,protectedTables} from './verify-plan-decision-flow.mjs';
import {migrationName,sourceHashes} from './verify-operational-decisions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const version=migrationName.slice(0,14),sha=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex');
const replaced=['phase5_plan_decision_inbox()','phase5_planning_year_validate(jsonb)','phase5_planning_year_rows(jsonb)'];
const helpers=['phase5_plan_decision_items()','phase5_plan_decision_page(jsonb)'],rollback=Error('operational_ddl_rollback');
export const operationalTables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits','class_plan_commands'];
export async function operationalDatabaseFingerprint(db,invariant=false){
 const functions=await db`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`;
 const tables=await db`select c.relname,c.relkind,c.relacl::text acl,c.relowner::text owner,c.relrowsecurity,c.relforcerowsecurity,
  c.reloptions::text options from pg_class c where c.relnamespace='public'::regnamespace order by c.relname`;
 const columns=await db`select c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,
  a.attacl::text acl,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`;
 const constraints=await db`select c.relname,p.conname,pg_get_constraintdef(p.oid) definition,p.convalidated
  from pg_constraint p join pg_class c on c.oid=p.conrelid where c.relnamespace='public'::regnamespace order by c.relname,p.conname`;
 const indexes=await db`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`;
 const triggers=await db`select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by c.relname,t.tgname`;
 const policies=await db`select * from pg_policies where schemaname='public' order by tablename,policyname`;
 const journal=await db`select to_jsonb(m) row from supabase_migrations.schema_migrations m order by version`;
 const name=f=>f.signature.replace(/^public\./u,'');
 return sha({functions:functions.filter(f=>!invariant||!helpers.includes(name(f))).map(f=>invariant&&replaced.includes(name(f))?{...f,definition:'<allowed replacement>'}:f),tables,columns,constraints,indexes,triggers,policies,journal});
}
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));
 for(let i=0;i<args.length;i+=2){assert.ok(['--flow-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);opts[args[i]]=resolve(args[i+1]);}
 assert.ok(opts['--out']?.startsWith('/private/tmp/')&&opts['--flow-evidence']?.startsWith('/private/tmp/'),'REFUSED: private evidence required');
 const sources=sourceHashes(),source=readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8'),flow=JSON.parse(readFileSync(opts['--flow-evidence'],'utf8'));
 assert.ok(flow.kind==='operational-decisions-rollback'&&flow.status==='PASS'&&flow.rollback===true&&flow.scope==='local-synthetic-only'
  &&flow.beforeFingerprint===flow.afterFingerprint&&flow.checks.length>=40&&flow.checks.every(c=>c.ok),'REFUSED: full operational rollback flow required');
 assert.deepEqual(flow.sourceHashes,sources,'REFUSED: flow source stale');assert.deepEqual(flow.finalSourceHashes,sources,'REFUSED: flow source changed');
 let prior;if(mode==='--apply'){
  assert.ok(opts['--evidence']?.startsWith('/private/tmp/'),'REFUSED: DDL rollback proof required');prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));
  assert.ok(prior.kind==='operational-plan-decisions-migration'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.rollbackRestored,'REFUSED: exact DDL rollback proof required');
  assert.deepEqual(prior.sourceHashes,sources,'REFUSED: DDL proof source stale');
 }
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let before,after,baselineFingerprint,finalFingerprint,committed=false,failure;
 try{
  before=await decisionBusinessHashes(db,operationalTables);baselineFingerprint=await operationalDatabaseFingerprint(db);
  // The flow report additionally binds all schema/ACL/journal changes by the established full function fingerprint.
  const {databaseFingerprint}=await import('./verify-plan-decision-flow.mjs');
  assert.equal(await databaseFingerprint(db),flow.afterFingerprint,'REFUSED: database changed after SQL flow');
  if(prior)assert.equal(baselineFingerprint,prior.baselineFingerprint,'REFUSED: database changed after DDL proof');
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: fixture lock held');
   assert.equal(await operationalDatabaseFingerprint(tx),baselineFingerprint);
   for(const required of ['20261012200000','20261012210000'])assert.equal((await tx`select version from supabase_migrations.schema_migrations where version=${required}`).length,1,'REFUSED: required decision migration missing');
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0,'REFUSED: later migration already present');
   const invariant=await operationalDatabaseFingerprint(tx,true);
   await tx.unsafe(source);
   assert.equal(await operationalDatabaseFingerprint(tx,true),invariant,'Unexpected definition, owner, permission, column, constraint, index, trigger, policy or journal change');
   const permissions=await tx`select has_function_privilege('skolplattform_worker','public.phase5_plan_decision_items()','execute') worker,
    has_function_privilege('anon','public.phase5_plan_decision_items()','execute') anon,has_function_privilege('authenticated','public.phase5_plan_decision_items()','execute') authenticated,
    has_function_privilege('service_role','public.phase5_plan_decision_items()','execute') service_role,
    exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.phase5_plan_decision_items()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') public`;
   assert.ok(Object.values(permissions[0]).every(v=>v===false),'New helper must stay closed');
   const entry=await tx`select has_function_privilege('skolplattform_worker','public.phase5_plan_decision_page(jsonb)','execute') worker,
    has_function_privilege('anon','public.phase5_plan_decision_page(jsonb)','execute') anon,
    has_function_privilege('authenticated','public.phase5_plan_decision_page(jsonb)','execute') authenticated,
    has_function_privilege('service_role','public.phase5_plan_decision_page(jsonb)','execute') service_role,
    exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.phase5_plan_decision_page(jsonb)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') public`;
   assert.deepEqual({...entry[0]},{worker:true,anon:false,authenticated:false,service_role:false,public:false});
   assert.deepEqual(await decisionBusinessHashes(tx,operationalTables),before);
   assert.deepEqual(sourceHashes(),sources,'REFUSED: source changed during migration verification');
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'plan_decision_operational',${[source]})`;
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await decisionBusinessHashes(db,operationalTables);finalFingerprint=await operationalDatabaseFingerprint(db);
  assert.deepEqual(after,before);if(mode==='--verify')assert.equal(finalFingerprint,baselineFingerprint);
  if(committed)copyFileSync(resolve(root,'supabase/migrations',migrationName),resolve(target.workdir,'supabase/migrations',migrationName));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'operational-plan-decisions-migration',status:failure?'FAIL':'PASS',mode,target:'protected',sourceHashes:sources,committed,
  baselineFingerprint,finalFingerprint,rollbackRestored:mode==='--verify'&&baselineFingerprint===finalFingerprint,workerGrantsAdded:['phase5_plan_decision_page(jsonb)'],beforeHashes:before,afterHashes:after,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.message?.split('\n')[0]}:null};
 const evidence=JSON.stringify(report,null,2)+'\n';writeFileSync(opts['--out'],evidence,{mode:0o600});if(failure)writeFileSync(opts['--out'].replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${report.status}: operational migration ${mode}; 20 business tables and unrelated DDL/ACL preserved.`);if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: operational migration preflight');process.exitCode=1;});
