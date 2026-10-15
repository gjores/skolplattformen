#!/usr/bin/env node
// Explicit local package installation, bound to fresh rollback and own fixture.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {root,migrations,hash,reserveReport,readEvidence,classCohortSourceHashes,classCohortTargetIdentity,classCohortInstalledState,connect,catalogColumns,projectionHashes,installPackage,assertLegacyProjection,lockPublicTables} from './verify-class-cohort.mjs';
const rollback=Error('expected_cohort_install_rollback');
export async function applyClassCohort(mode,{evidence,out}){
 const sink=reserveReport(out,'class-cohort-migration-evidence',mode),r=sink.report;let db,locked=false,completed=false;
 try{
  assert.ok(['--verify','--apply'].includes(mode));r.sqlSourceHashes=classCohortSourceHashes();
  const supplied=readEvidence(evidence);let flow,prior;
  if(mode==='--verify')flow=supplied;
  else{prior=supplied;assert.equal(prior.value.kind,'class-cohort-migration-evidence');assert.equal(prior.value.status,'PASS');assert.equal(prior.value.mode,'--verify');assert.equal(prior.value.rollbackRestored,true);assert.deepEqual(prior.value.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(prior.value.finalSqlSourceHashes,r.sqlSourceHashes);flow=readEvidence(prior.value.evidenceChain.rollback.path);assert.equal(flow.sha256,prior.value.evidenceChain.rollback.sha256);}
  const f=flow.value;assert.equal(f.kind,'class-cohort-sql-evidence');assert.equal(f.status,'PASS');assert.equal(f.mode,'rollback');assert.equal(f.rollbackRestored,true);assert.equal(f.databaseClosed,true);assert.ok(f.fixtureEvidence);
  assert.deepEqual(f.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(f.finalSqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(f.beforeHashes,f.afterHashes);assert.equal(f.beforeFingerprint,f.afterFingerprint);
  for(const name of ['dates','linkIdentity','commands','oldClassTimplans','contract'])assert.ok(f.suites[name].status==='PASS'&&f.suites[name].skipped===0&&f.suites[name].checks.length>0&&f.suites[name].checks.every(c=>c.ok));
  const manifest=readEvidence(f.fixtureEvidence.path);assert.equal(manifest.sha256,f.fixtureEvidence.sha256);assert.equal(manifest.value.status,'PASS');assert.equal(manifest.value.committed,true);assert.deepEqual(manifest.value.sqlSourceHashes,r.sqlSourceHashes);
  r.fixtureEvidence=f.fixtureEvidence;r.evidenceChain={rollback:{path:resolve(mode==='--verify'?evidence:prior.value.evidenceChain.rollback.path),sha256:flow.sha256},fixture:f.fixtureEvidence,...(prior?{applyVerify:{path:resolve(evidence),sha256:prior.sha256}}:{})};
  const target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);assert.deepEqual(r.targetIdentity,f.targetIdentity);assert.deepEqual(r.targetIdentity,manifest.value.targetIdentity);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'Fixture lock unavailable');locked=true;
  r.beforeHashes=await allPublicHashes(db);r.beforeFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(r.beforeHashes,f.afterHashes);assert.equal(r.beforeFingerprint,f.afterFingerprint);if(prior){assert.deepEqual(prior.value.beforeHashes,r.beforeHashes);assert.equal(prior.value.beforeFingerprint,r.beforeFingerprint);}
  r.originalColumns=await catalogColumns(db);r.beforeProjectionHashes=await projectionHashes(db,r.originalColumns);r.stage='ddl';sink.save();
  try{await db.begin('isolation level read committed',async tx=>{await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='90s'`;
   await lockPublicTables(tx);assert.deepEqual(await allPublicHashes(tx),r.beforeHashes);assert.equal(await vocationalDatabaseFingerprint(tx),r.beforeFingerprint);
   await installPackage(tx,{journal:true});await assertLegacyProjection(tx);r.afterProjectionHashes=await projectionHashes(tx,r.originalColumns);assert.deepEqual(r.afterProjectionHashes,r.beforeProjectionHashes);
   r.installed=await classCohortInstalledState(tx);if(prior)assert.deepEqual(r.installed,prior.value.installed);assert.deepEqual(classCohortSourceHashes(),r.sqlSourceHashes);
   r.stage='commit_pending';sink.save();if(mode==='--verify')throw rollback;
  });r.committed=true;}catch(e){if(e!==rollback)throw e;r.committed=false;}
  r.afterFingerprint=await vocationalDatabaseFingerprint(db);r.afterProjectionHashes=await projectionHashes(db,r.originalColumns);assert.deepEqual(r.afterProjectionHashes,r.beforeProjectionHashes);
  if(mode==='--verify'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(await allPublicHashes(db),r.beforeHashes);r.rollbackRestored=true;}
  else{assert.deepEqual(await classCohortInstalledState(db),r.installed);for(const migration of migrations){const source=readFileSync(resolve(root,'supabase/migrations',migration));const destination=resolve(target.workdir,'supabase/migrations',migration);if(existsSync(destination))assert.equal(hash(readFileSync(destination)),hash(source));else writeFileSync(destination,source,{flag:'wx',mode:0o600});}}
  r.finalSqlSourceHashes=classCohortSourceHashes();assert.deepEqual(r.finalSqlSourceHashes,r.sqlSourceHashes);completed=true;
 }catch(e){r.failure={code:e.code??'verification_failed',message:e.message,where:e.where,hint:e.hint};}
 finally{if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{completed=false;r.closeFailure=true;}}
  r.status=completed?'PASS':'FAIL';r.stage='finished';r.finishedAt=new Date().toISOString();if(completed)delete r.failureCode;sink.close();}
 console.log(`${r.status}: class cohort migration ${mode}; committed=${r.committed===true}`);return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),mode=args.shift(),opts={};for(let i=0;i<args.length;i+=2){assert.ok(['--evidence','--out'].includes(args[i])&&args[i+1]&&!opts[args[i]]);opts[args[i]]=resolve(args[i+1]);}assert.ok(opts['--evidence']&&opts['--out']);const r=await applyClassCohort(mode,{evidence:opts['--evidence'],out:opts['--out']});if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: class cohort migration preflight');process.exitCode=1;}
}
