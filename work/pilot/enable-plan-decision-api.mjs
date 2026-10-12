#!/usr/bin/env node
// Exact local activation after actual Worker proof; never a generic SQL runner.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {databaseFingerprint} from './verify-plan-decision-flow.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const name='20261012181000_plan_decision_worker.sql',version='20261012181000';
const entries=['public.phase5_plan_decision_basis(text,uuid)','public.phase5_plan_decision_command(jsonb)','public.phase5_plan_decision_inbox()'];
const required=['web/lib/plan-decision.ts','web/lib/server/plan-decision.ts','web/lib/server/gym-timplan.ts','web/lib/server/audit-details.ts',
 'web/lib/mandate-policy.ts','web/app/api/planbeslut/underlag/route.ts','web/app/api/planbeslut/andra/route.ts','web/app/api/planbeslut/inkorg/route.ts',
 'supabase/migrations/20261012180000_plan_decision_flow.sql','supabase/migrations/20261012180100_plan_decision_command_fix.sql','work/pilot/verify-plan-decision-api.mjs'];
const sha=s=>createHash('sha256').update(s).digest('hex');
export function validateDecisionEvidence(proof,readSource){
 assert.ok(proof.kind==='plan-decision-api'&&proof.status==='PASS'&&proof.target==='protected'&&proof.preflight===true
  &&proof.apiVerified===true&&proof.aclRestored===true&&proof.originalBusinessPreserved===true&&proof.sourceUnchanged===true
  &&proof.realWorker?.runtime==='workerd'&&proof.realWorker?.role==='skolplattform_worker'
  &&proof.baselineFingerprint===proof.finalFingerprint&&typeof proof.finalFingerprint==='string','REFUSED: successful actual Worker preflight required');
 assert.ok(proof.checks.length>=19&&proof.checks.every(c=>c.ok===true),'REFUSED: complete API checks required');
 for(const name of ['MFA required','head organizer approves corrected programplan','head organizer approves corrected timplan','final Worker audit failure rolls back database decision','rector submits and retry is idempotent with paired audit'])assert.ok(proof.checks.some(c=>c.name===name&&c.ok===true),'REFUSED: required decision proof missing');
 for(const path of required)assert.equal(proof.finalSourceHashes[path],sha(readSource(path)),`REFUSED: preflight source changed: ${path}`);
}
async function main(){
 const args=process.argv.slice(2);assert.equal(args.length,4,'REFUSED: --evidence and --out required');
 assert.equal(args[0],'--evidence');assert.equal(args[2],'--out');
 const evidence=resolve(args[1]),out=resolve(args[3]);
 assert.ok(evidence.startsWith('/private/tmp/')&&out.startsWith('/private/tmp/')&&evidence!==out,'REFUSED: private distinct proof paths required');
 const proof=JSON.parse(readFileSync(evidence,'utf8'));
 validateDecisionEvidence(proof,path=>readFileSync(resolve(root,path)));
 const source=readFileSync(resolve(root,'supabase/migrations',name),'utf8');
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{},connect_timeout:10});
 let committed=false,finalAcl;
 try{await db.begin(async tx=>{
  await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
  assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: another verification owns the lock');
  assert.equal(await databaseFingerprint(tx),proof.finalFingerprint,'REFUSED: database changed after Worker preflight');
  assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012180000'`).length,1,'REFUSED: foundation missing');
  assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012180100'`).length,1,'REFUSED: verified command repair missing');
  assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0,'REFUSED: grant or newer migration exists');
  const before=await gymAcl(tx);
  for(const entry of entries)assert.equal(before.find(r=>r.f===entry)?.granted,false,'REFUSED: entrypoint already granted');
  await tx.unsafe(source);finalAcl=await gymAcl(tx);
  for(const old of before){const current=finalAcl.find(r=>r.f===old.f);if(entries.includes(old.f))assert.equal(current?.granted,true);else assert.deepEqual(current,old,'Unrelated ACL changed');}
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'plan_decision_worker',${[source]})`;
 });committed=true;
 copyFileSync(resolve(root,'supabase/migrations',name),resolve(target.workdir,'supabase/migrations',name));
 }finally{await db.end({timeout:5});writeFileSync(out,JSON.stringify({kind:'plan-decision-worker-activation',committed,migration:name,sourceHash:sha(source),evidenceHash:sha(readFileSync(evidence)),entrypoints:entries,finalAcl},null,2)+'\n',{mode:0o600});}
 console.log('PASS: exactly three local decision entrypoints enabled after actual Worker preflight.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{console.error(error.message?.startsWith('REFUSED')?error.message:'FAIL: decision activation; inspect private result before retry');process.exitCode=1;});
