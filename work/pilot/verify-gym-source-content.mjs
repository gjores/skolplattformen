#!/usr/bin/env node
// Local-only one-function migration; business rows, other DDL and ACL preserved.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {vocationalDatabaseFingerprint,vocationalTables} from './apply-vocational-plan-decisions.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {approvedClassFixture} from './verify-class-timplans.mjs';
import {canonicalCatalogJson} from '../../web/lib/programplan-catalog.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),name='20261012230000_gym_source_content.sql',version=name.slice(0,14),rollback=Error('source_projection_rollback');
const sources=()=>Object.fromEntries(['supabase/migrations/'+name,'web/lib/server/gym-timplan.ts','web/lib/gym-timplan.ts','work/pilot/verify-gym-source-content.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
const content=({revision,status,educationRevision,archived,...r})=>canonicalCatalogJson(r);
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));for(let i=0;i<args.length;i+=2){assert.ok(['--out','--evidence'].includes(args[i]));opts[args[i]]=resolve(args[i+1]);}assert.ok(opts['--out']?.startsWith('/private/tmp/'));
 const sourceHashes=sources(),source=readFileSync(resolve(root,'supabase/migrations',name),'utf8');let prior;if(mode==='--apply'){prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));assert.equal(prior.status,'PASS');assert.equal(prior.mode,'--verify');assert.deepEqual(prior.sourceHashes,sourceHashes);}
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let beforeFingerprint,afterFingerprint,before,after,committed=false,failure;const checks=[];
 try{
  beforeFingerprint=await vocationalDatabaseFingerprint(db);before=await decisionBusinessHashes(db,[...vocationalTables,'class_plan_commands']);if(prior)assert.equal(prior.beforeFingerprint,beforeFingerprint);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal(await vocationalDatabaseFingerprint(tx),beforeFingerprint);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012220000'`).length,1);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);
   const old=(await tx`select pg_get_functiondef('public.phase5_gym_timplan_result(uuid)'::regprocedure) definition`)[0].definition;
   await tx.unsafe(source);const expected=(await tx`select pg_get_functiondef('public.phase5_gym_timplan_result(uuid)'::regprocedure) definition`)[0].definition;
   // Temporarily restore only the allowed definition: full fingerprint must equal baseline.
   await tx.unsafe(old);assert.equal(await vocationalDatabaseFingerprint(tx),beforeFingerprint);await tx.unsafe(expected);checks.push('one function only; ACL and all other DDL unchanged');
   for(const code of ['SA25','BF25'])try{await tx.savepoint(async s=>{
    const f=await approvedClassFixture(s,code);const result=(await s`select public.phase5_read_gym_timplan(${f.planId}) result`)[0].result;
    const actual=(await s`select public.phase5_gym_timplan_source(${f.programId}) result`)[0].result;
    assert.deepEqual(result.currentSourceBasis,actual);assert.equal(result.currentSource.planId,actual.planId);assert.equal(result.currentSource.revision,actual.revision);assert.equal(content(result.source),content(result.currentSourceBasis));
    checks.push(code+' actual approved source projection and equivalent frozen content');throw rollback;
   });}catch(e){if(e!==rollback)throw e;}
   assert.deepEqual(await decisionBusinessHashes(tx,[...vocationalTables,'class_plan_commands']),before);assert.deepEqual(sources(),sourceHashes);checks.push('all business rows unchanged after isolated scenarios');
   if(mode==='--verify')throw rollback;
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'gym_source_content',${[source]})`;
  });committed=true;}catch(e){if(e!==rollback)throw e;}
  after=await decisionBusinessHashes(db,[...vocationalTables,'class_plan_commands']);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);if(!committed)assert.equal(beforeFingerprint,afterFingerprint);if(committed)copyFileSync(resolve(root,'supabase/migrations',name),resolve(target.workdir,'supabase/migrations',name));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 writeFileSync(opts['--out'],JSON.stringify({kind:'gym-source-content-migration',status:failure?'FAIL':'PASS',mode,sourceHashes,beforeFingerprint,afterFingerprint,beforeHashes:before,afterHashes:after,checks,committed,rollbackRestored:!committed&&beforeFingerprint===afterFingerprint,failure:failure?{code:failure.code,message:failure.message}:null},null,2)+'\n',{mode:0o600});console.log(`${failure?'FAIL':'PASS'}: source-content ${mode}, ${checks.length} checks`);if(failure)process.exitCode=1;
}
await main().catch(()=>{console.error('FAIL: source-content preflight');process.exitCode=1;});
