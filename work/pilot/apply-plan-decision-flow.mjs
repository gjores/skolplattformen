#!/usr/bin/env node
// Foundation only: exact local target, rollback DDL proof before apply, no grants/reset.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { gymAcl } from './apply-gym-timplan-migration.mjs';
import { databaseFingerprint,decisionBusinessHashes,protectedTables } from './verify-plan-decision-flow.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const name='20261012180000_plan_decision_flow.sql',version=name.slice(0,14);
const newTables=['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
const newFunctions=['phase5_plan_decision_immutable()','phase5_plan_decision_permitted(text,uuid,text,text,integer)',
 'phase5_plan_decision_source_content(jsonb)','phase5_plan_decision_audit(text,uuid,text)','phase5_plan_decision_source_blockers(jsonb)',
 'phase5_plan_decision_detail(text,uuid)','phase5_plan_decision_basis(text,uuid)','phase5_plan_decision_command(jsonb)',
 'phase5_plan_decision_inbox()','phase5_plan_decision_program_delete_guard()','phase5_plan_decision_offering_guard()'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const rollback=Error('plan_decision_ddl_rollback');
async function foundationChecks(tx,oldAcl,original,tables) {
 assert.deepEqual(await decisionBusinessHashes(tx,tables,true),original,'Original business rows/timestamps changed');
 const allAcl=await gymAcl(tx);
 for(const old of oldAcl)assert.deepEqual(allAcl.find(r=>r.f===old.f),old,'Existing function ACL changed');
 assert.deepEqual(allAcl.filter(r=>r.granted).map(r=>r.f),oldAcl.filter(r=>r.granted).map(r=>r.f),'Worker surface changed');
 for(const signature of newFunctions) {
  const [row]=await tx`select p.oid::regprocedure::text signature,
   exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public,
   has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,
   has_function_privilege('service_role',p.oid,'execute') service,has_function_privilege('skolplattform_worker',p.oid,'execute') worker
   from pg_proc p where p.oid=to_regprocedure(${`public.${signature}`})`;
  assert.ok(row&&!row.public&&!row.anon&&!row.authenticated&&!row.service&&!row.worker,`Foundation function is not closed: ${signature}`);
 }
 for(const table of newTables) {
  const [row]=await tx`select c.relrowsecurity rls,
   exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) public,
   has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') anon,
   has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') authenticated,
   has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') service,
   has_table_privilege('skolplattform_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') worker
   from pg_class c where c.oid=to_regclass(${`public.${table}`})`;
  assert.ok(row?.rls&&!row.public&&!row.anon&&!row.authenticated&&!row.service&&!row.worker,`Foundation table is not closed: ${table}`);
  assert.equal((await tx.unsafe(`select count(*)::integer n from public.${table}`))[0].n,0,'Foundation must not seed decisions');
 }
 assert.equal((await tx`select count(*)::integer n from public.point_plans where decided_identity_id is not null`)[0].n,0);
 assert.equal((await tx`select count(*)::integer n from public.timplans where decided_identity_id is not null`)[0].n,0);
 return {originalBusinessPreserved:true,originalTimestampsPreserved:true,oldAclPreserved:true,workerGrantsAdded:false,closedFunctions:newFunctions.length,emptyClosedTables:newTables.length};
}
async function main() {
 const args=process.argv.slice(2),mode=args.shift();
 assert.ok(['--verify','--apply'].includes(mode),'REFUSED: choose --verify or --apply');
 const opts={};for(let i=0;i<args.length;i+=2){assert.ok(['--out','--evidence'].includes(args[i])&&args[i+1]);opts[args[i]]=resolve(args[i+1]);}
 assert.ok(opts['--out']?.startsWith('/private/tmp/')&&opts['--out'].endsWith('.json'),'REFUSED: private temporary evidence path required');
 const source=readFileSync(resolve(root,'supabase/migrations',name),'utf8'),sourceHash=sha(source);
 let prior;if(mode==='--apply') {
  assert.ok(opts['--evidence'],'REFUSED: rollback evidence required');prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));
  assert.ok(prior.kind==='plan-decision-foundation'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.target==='protected'&&prior.sourceHash===sourceHash&&prior.rollbackRestored===true&&prior.workerGrantsAdded===false,'REFUSED: exact successful rollback evidence required');
 }
 console.log('Foundation: checking isolated local target.');
 const target=await assertTarget('protected');
 console.log('Foundation: local target verified.');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{},
  connection:{application_name:'plan-decision-foundation',statement_timeout:60000,idle_in_transaction_session_timeout:120000}});
 let before,after,fingerprint,afterFingerprint,proof,tables,failure,committed=false;
 try {
  const present=(await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename);
  tables=[...protectedTables];
  console.log('Foundation: database connected.');
  assert.ok(protectedTables.every(t=>present.includes(t))&&!newTables.some(t=>present.includes(t)),'REFUSED: unexpected foundation table state');
  fingerprint=await databaseFingerprint(db);before=await decisionBusinessHashes(db,tables);
  console.log('Foundation: complete baseline hashed.');
  if(prior)assert.equal(fingerprint,prior.baselineFingerprint,'REFUSED: database definitions/ACL/journal changed after verify');
  console.log('Foundation: entering transaction.');
  try {await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;
   await tx`set local statement_timeout='30s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: another local verification owns the fixture lock');
   console.log('Foundation: verification lock acquired.');
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0,'REFUSED: migration or later journal exists');
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012160000'`).length,1,'REFUSED: exact predecessor missing');
   const oldAcl=await gymAcl(tx);
   assert.equal(await databaseFingerprint(tx),fingerprint,'REFUSED: definitions changed before lock');
   console.log('Foundation: baseline fingerprint rechecked.');
   assert.deepEqual(await decisionBusinessHashes(tx,tables),before,'REFUSED: original data changed before lock');
   console.log('Foundation: complete baseline data rechecked.');
   await tx.unsafe(source);
   console.log('Foundation: DDL executed inside transaction.');
   proof=await foundationChecks(tx,oldAcl,before,tables);
   console.log('Foundation: closed privileges and original data verified.');
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'plan_decision_flow',${[source]})`;
  });} catch(error){if(error!==rollback)failure=error;}
  committed=mode==='--apply'&&!failure;
  after=await decisionBusinessHashes(db,tables,mode==='--apply'&&!failure);afterFingerprint=await databaseFingerprint(db);
  assert.deepEqual(after,before,'Complete original rows were not preserved');
  if(mode==='--verify'||failure)assert.equal(afterFingerprint,fingerprint,'Rollback did not restore database fingerprint');
  console.log(mode==='--verify'?'Foundation: rollback verified.':'Foundation: final state verified.');
  if(!failure&&mode==='--apply')copyFileSync(resolve(root,'supabase/migrations',name),resolve(target.workdir,'supabase/migrations',name));
 } catch(error){failure??=error;} finally {await db.end({timeout:5});}
 const result={kind:'plan-decision-foundation',status:failure?'FAIL':'PASS',target:'protected',mode,sourceHash,reset:false,committed,
  ...proof,baselineFingerprint:fingerprint,afterFingerprint,rollbackRestored:mode==='--verify'&&fingerprint===afterFingerprint,
  originalTableCount:tables?.length??0,protectedBusinessTableCount:protectedTables.length,originalHashes:before,finalHashes:after,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.code?'Foundation SQL failed':String(failure.message).slice(0,200)}:null};
 const evidence=JSON.stringify(result,null,2)+'\n';writeFileSync(opts['--out'],evidence,{mode:0o600});
 if(failure)writeFileSync(opts['--out'].replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${result.status}: foundation ${mode.slice(2)}, ${tables?.length??0} original tables, ${newFunctions.length} closed functions; Worker grants unchanged.`);
 if(failure){console.log(`SQLSTATE ${failure.code??'ASSERTION'}`);process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{console.error(error.message?.startsWith('REFUSED')?error.message:'FAIL: foundation preflight/preservation');process.exitCode=1;});
