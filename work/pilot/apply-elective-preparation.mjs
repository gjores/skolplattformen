#!/usr/bin/env node
// One forward-only migration on the already installed elective baseline. Never changes runtime3012.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {ELECTIVE_MIGRATIONS,migrationSourceSnapshot,prepareMigrationSql,preservedColumns,preservedRows,readMigrationJournal,installElectivePackage,runElectiveTransactions,parseElectiveInstallArgs,sha} from './apply-elective-blocks.mjs';
import {assertElectivePrivileges} from './elective-privilege-scope.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const PREPARATION_MIGRATION='supabase/migrations/20261031100000_elective_preparations.sql';
const version='20261031100000';
const privatePath=value=>{const p=resolve(value);assert.ok(p.startsWith('/private/tmp/')&&p.endsWith('.json'));return p;};
function evidence(value){const p=privatePath(value);assert.equal(realpathSync(p),p);const stat=lstatSync(p);assert.ok(stat.isFile()&&(stat.mode&0o077)===0&&stat.size<64*1024*1024);const bytes=readFileSync(p);return{path:p,sha256:sha(bytes),value:JSON.parse(bytes)};}
const hashes=sources=>Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
export function preparationInstallerSources(){return Object.fromEntries(['work/pilot/apply-elective-preparation.mjs','work/pilot/apply-elective-blocks.mjs','work/pilot/apply-tjanst.mjs','work/pilot/elective-privilege-scope.mjs','work/pilot/verify-class-cohort.mjs','work/pilot/verify-target.mjs','work/pilot/named-timplan-snapshot.mjs'].map(p=>[p,sha(readFileSync(root+p))]));}
export function validatePreparationRelease(candidate,verification,candidateRef){
 assert.equal(candidate.kind,'elective-preparation-candidate');assert.equal(candidate.status,'PASS');assert.match(candidate.revision??'',/^[a-f0-9]{40}$/u);
 assert.match(candidate.artifact?.sha256??'',/^[a-f0-9]{64}$/u);assert.ok(Number.isSafeInteger(candidate.artifact?.fileCount)&&candidate.artifact.fileCount>0);
 assert.equal(verification.kind,'elective-preparation-release-evidence');assert.equal(verification.status,'PASS');assert.deepEqual(verification.candidate,candidateRef);
 assert.deepEqual(candidate.sqlSourceHashes,hashes(migrationSourceSnapshot()));assert.deepEqual(verification.installerSources,preparationInstallerSources());
 for(const key of ['sql','workerOidc','desktop','phone']){const suite=verification.suites?.[key];assert.equal(suite?.status,'PASS');assert.ok(Number.isSafeInteger(suite.checks)&&suite.checks>0);assert.equal(suite.skipped,0);}
 const actual=verification.workerOidc;assert.equal(actual?.kind,'elective-preparation-actual-worker-oidc');assert.equal(actual.status,'PASS');assert.equal(actual.releaseEligible,true);
 assert.equal(actual.build?.revision,candidate.revision);assert.deepEqual(actual.finalArtifact,candidate.artifact);assert.deepEqual(actual.sqlSourceHashes,candidate.sqlSourceHashes);
 assert.ok(actual.checks.length>0&&actual.checks.every(item=>item.ok===true));assert.match(actual.baselineFingerprint,/^[a-f0-9]{64}$/u);assert.match(actual.installedFingerprint,/^[a-f0-9]{64}$/u);
 assert.equal(actual.finalSchemaFingerprint,actual.installedFingerprint);assert.equal(actual.pendingMigrations.length,1);assert.equal(actual.pendingMigrations[0],PREPARATION_MIGRATION.split('/').at(-1));
 assert.ok(actual.baselineJournal?.count>0);assert.match(actual.baselineJournal.sha256,/^[a-f0-9]{64}$/u);
}
export function validatePreparationJournal(rows,sources,expected){
 assert.equal(rows.length,expected.count);assert.equal(sha(rows),expected.sha256,'baseline_journal_changed');
 assert.equal(rows.at(-1)?.version,'20261030115700');assert.equal(rows.some(row=>row.version===version),false);
 for(const path of ELECTIVE_MIGRATIONS.filter(path=>path!==PREPARATION_MIGRATION)){
  const filename=path.split('/').at(-1),row=rows.find(item=>item.version===filename.slice(0,14));
  assert.deepEqual(row,{version:filename.slice(0,14),name:filename.slice(15,-4),statements:[sources[path].sql]});
 }
 return{count:rows.length,sha256:sha(rows)};
}
export function markPreparationInstallFailure(report,error){
 report.status='FAIL';if(report.stage==='commit_pending'&&!report.committed)report.commitOutcome='unknown';
 report.failure={name:error.name==='AssertionError'?'AssertionError':'Error',code:/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:null,messageSha256:sha(String(error.message??''))};
}
export async function applyElectivePreparation(options){
 const out=privatePath(options.out);assert.equal(realpathSync(dirname(out)),dirname(out));const sink=reserveReport(out,'elective-preparation-migration-evidence',options.mode),r=sink.report;r.checks=[];
 let db,locked=false,auditId=null;
 try{
  assert.ok(['rehearsal','apply'].includes(options.mode));const candidate=evidence(options.candidate),verification=evidence(options.verification),sources=migrationSourceSnapshot();
  r.candidate={path:candidate.path,sha256:candidate.sha256};r.verification={path:verification.path,sha256:verification.sha256};validatePreparationRelease(candidate.value,verification.value,r.candidate);
  r.sqlSourceHashes=hashes(sources);r.installerSources=preparationInstallerSources();r.executionSource=prepareMigrationSql(sources[PREPARATION_MIGRATION].sql);delete r.executionSource.sql;
  const prior=options.mode==='apply'?evidence(options.rehearsal):null;
  if(prior){assert.equal(prior.value.kind,r.kind);assert.equal(prior.value.status,'PASS');assert.equal(prior.value.mode,'rehearsal');assert.equal(prior.value.committed,false);assert.equal(prior.value.rollbackRestored,true);assert.equal(prior.value.databaseClosed,true);for(const key of ['candidate','verification','sqlSourceHashes','installerSources','executionSource'])assert.deepEqual(prior.value[key],r[key]);r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};}
  const actual=verification.value.workerOidc,target=await assertTarget('protected');db=connect(target);r.targetIdentity=await classCohortTargetIdentity(db,target);
  const source=actual.snapshot;assert.equal(r.targetIdentity.projectId,source.sourceProject);for(const key of ['database','server_version','system_identifier'])assert.equal(r.targetIdentity[key],source.source[key]);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true);locked=true;
  r.beforeFingerprint=await schemaFingerprint(db);assert.equal(r.beforeFingerprint,actual.baselineFingerprint);const originalJournal=await readMigrationJournal(db);r.priorJournal=validatePreparationJournal(originalJournal,sources,actual.baselineJournal);
  r.originalColumns=await preservedColumns(db);r.beforeRows=await preservedRows(db,r.originalColumns);
  if(prior)for(const key of ['targetIdentity','beforeFingerprint','priorJournal','originalColumns','beforeRows'])assert.deepEqual(prior.value[key],r[key]);
  const revalidate=async(connection=db)=>{assert.deepEqual(hashes(migrationSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(preparationInstallerSources(),r.installerSources);assert.equal(evidence(options.candidate).sha256,candidate.sha256);assert.equal(evidence(options.verification).sha256,verification.sha256);if(prior)assert.equal(evidence(options.rehearsal).sha256,prior.sha256);assert.deepEqual(await classCohortTargetIdentity(connection,await assertTarget('protected')),r.targetIdentity);};
  const migrate=async(tx,phase)=>{
   r.stage=phase==='apply'?'installing':'rehearsing';sink.save();const result=await installElectivePackage(tx,{sources,migrations:[PREPARATION_MIGRATION],validateJournal:rows=>validatePreparationJournal(rows,sources,actual.baselineJournal),columns:r.originalColumns,baselineFingerprint:r.beforeFingerprint,rows:r.beforeRows,priorJournal:r.priorJournal,originalJournal,installedFingerprint:actual.installedFingerprint,revalidate,audit:{runId:r.runId,details:{package:'elective-preparation',revision:candidate.value.revision,candidateSha256:candidate.sha256,verificationSha256:verification.sha256}}},phase);
   assert.equal(result.newTables,3);await assertElectivePrivileges(tx,{preparation:true});auditId=result.auditId;r.stage=phase==='apply'?'commit_pending':'rollback_pending';sink.save();return result;
  };
  const preserve=connection=>preservedRows(connection,r.originalColumns,auditId);
  await runElectiveTransactions({db,mode:options.mode,report:r,fingerprint:schemaFingerprint,recorded:async connection=>Number((await connection`select count(*) n from supabase_migrations.schema_migrations where version=${version}`)[0].n),preserve,migrate});
  r.afterRows=await preserve(db);assert.deepEqual(r.afterRows,r.beforeRows);r.afterFingerprint=await schemaFingerprint(db);
  if(options.mode==='rehearsal'){assert.equal(r.afterFingerprint,r.beforeFingerprint);assert.deepEqual(await readMigrationJournal(db),originalJournal);r.rollbackRestored=true;}
  else{assert.equal(r.afterFingerprint,actual.installedFingerprint);assert.equal((await readMigrationJournal(db)).length,originalJournal.length+1);assert.ok(auditId);r.auditRowsAdded=1;}
  await revalidate();r.status='PASS';r.stage='verified';
 }catch(error){markPreparationInstallFailure(r,error);}
 finally{if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}}r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await applyElectivePreparation(parseElectiveInstallArgs(process.argv.slice(2)));console.log(`${report.status}: preparation SQL; mode=${report.mode}; committed=${report.committed===true}`);if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: preparation SQL preflight');process.exitCode=1;}
}
