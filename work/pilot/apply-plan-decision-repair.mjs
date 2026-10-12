#!/usr/bin/env node
// One forward-only local function repair, gated on complete rollback flow proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {databaseFingerprint,decisionBusinessHashes,protectedTables} from './verify-plan-decision-flow.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const name='20261012180100_plan_decision_command_fix.sql',version='20261012180100';
const foundation='20261012180000_plan_decision_flow.sql';
const allowed=['phase5_plan_decision_command(jsonb)','public.phase5_plan_decision_command(jsonb)'];
const tables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const rollback=Error('repair_verification_rollback');
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));
 for(let i=0;i<args.length;i+=2){assert.ok(['--flow-evidence','--evidence','--out'].includes(args[i])&&args[i+1]);opts[args[i]]=resolve(args[i+1]);}
 assert.ok(opts['--out']?.startsWith('/private/tmp/')&&opts['--flow-evidence']?.startsWith('/private/tmp/'),'REFUSED: private evidence paths required');
 const source=readFileSync(resolve(root,'supabase/migrations',name),'utf8'),sourceHash=sha(source);
 const flow=JSON.parse(readFileSync(opts['--flow-evidence'],'utf8'));
 assert.ok(flow.kind==='plan-decision-flow-rollback'&&flow.status==='PASS'&&flow.rollback===true&&flow.target==='protected'
  &&flow.repairInRollback===true&&flow.repairName===name&&flow.repairHash===sourceHash
  &&flow.beforeFingerprint===flow.afterFingerprint&&flow.checks.length>=30&&flow.checks.every(c=>c.ok===true),'REFUSED: complete exact repaired rollback flow required');
 let prior;if(mode==='--apply'){
  assert.ok(opts['--evidence']?.startsWith('/private/tmp/'),'REFUSED: rollback DDL proof required');prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));
  assert.ok(prior.kind==='plan-decision-repair'&&prior.status==='PASS'&&prior.mode==='--verify'&&prior.sourceHash===sourceHash&&prior.rollbackRestored,'REFUSED: exact DDL proof required');
 }
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let before,after,baselineFingerprint,finalFingerprint,committed=false,failure;
 try{
  before=await decisionBusinessHashes(db,tables);baselineFingerprint=await databaseFingerprint(db);
  assert.equal(baselineFingerprint,flow.afterFingerprint,'REFUSED: database changed after rollback flow');
  if(prior)assert.equal(baselineFingerprint,prior.baselineFingerprint,'REFUSED: database changed after DDL verify');
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: verification lock held');
   assert.equal(await databaseFingerprint(tx),baselineFingerprint,'REFUSED: database definitions changed');
   const journal=await tx`select statements from supabase_migrations.schema_migrations where version='20261012180000'`;
   assert.equal(journal.length,1);assert.equal(journal[0].statements[0],readFileSync(resolve(root,'supabase/migrations',foundation),'utf8'),'REFUSED: installed foundation source differs');
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0,'REFUSED: repair or later migration exists');
   const invariant=await databaseFingerprint(tx,allowed);
   await tx.unsafe(source);
   assert.equal(await databaseFingerprint(tx,allowed),invariant,'Repair changed other definitions, ACL, triggers, policies or journal');
   assert.deepEqual(await decisionBusinessHashes(tx,tables),before,'Business data changed during function repair');
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'plan_decision_command_fix',${[source]})`;
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await decisionBusinessHashes(db,tables);finalFingerprint=await databaseFingerprint(db);
  assert.deepEqual(after,before,'Business preservation failed');
  if(mode==='--verify')assert.equal(finalFingerprint,baselineFingerprint,'DDL rollback changed database');
  if(committed)copyFileSync(resolve(root,'supabase/migrations',name),resolve(target.workdir,'supabase/migrations',name));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'plan-decision-repair',status:failure?'FAIL':'PASS',mode,target:'protected',sourceHash,committed,baselineFingerprint,finalFingerprint,
  rollbackRestored:mode==='--verify'&&baselineFingerprint===finalFingerprint,workerGrantsAdded:false,businessTableCount:tables.length,beforeHashes:before,afterHashes:after,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.code&&failure.code!=='ERR_ASSERTION'?'Repair SQL failed':failure.message.split('\n')[0]}:null};
 writeFileSync(opts['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(`${report.status}: exact command repair ${mode}; 15 original plus four decision tables, other definitions and ACL preserved.`);if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: repair preflight');process.exitCode=1;});
