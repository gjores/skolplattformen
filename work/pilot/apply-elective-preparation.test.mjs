import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationSourceSnapshot,ELECTIVE_MIGRATIONS,sha,runElectiveTransactions} from './apply-elective-blocks.mjs';
import {PREPARATION_MIGRATION,preparationInstallerSources,validatePreparationRelease,validatePreparationJournal,markPreparationInstallFailure} from './apply-elective-preparation.mjs';
function fixture(){
 const sources=migrationSourceSnapshot(),sqlSourceHashes=Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,v.sha256]));
 const candidate={kind:'elective-preparation-candidate',status:'PASS',revision:'a'.repeat(40),artifact:{files:[],fileCount:1,sha256:'b'.repeat(64)},sqlSourceHashes};
 const ref={path:'/private/tmp/candidate.json',sha256:'c'.repeat(64)};
 const actual={kind:'elective-preparation-actual-worker-oidc',status:'PASS',releaseEligible:true,build:{revision:candidate.revision},finalArtifact:candidate.artifact,sqlSourceHashes,checks:[{ok:true}],baselineFingerprint:'d'.repeat(64),installedFingerprint:'e'.repeat(64),finalSchemaFingerprint:'e'.repeat(64),pendingMigrations:[PREPARATION_MIGRATION.split('/').at(-1)],baselineJournal:{count:143,sha256:'f'.repeat(64)}};
 const verification={kind:'elective-preparation-release-evidence',status:'PASS',candidate:ref,installerSources:preparationInstallerSources(),workerOidc:actual,suites:Object.fromEntries(['sql','workerOidc','desktop','phone'].map(name=>[name,{status:'PASS',checks:1,skipped:0}]))};
 return{candidate,verification,ref,sources};
}
test('release gate accepts bound evidence shape, not a claim that synthetic evidence is an actual proof',()=>{
 const f=fixture();validatePreparationRelease(f.candidate,f.verification,f.ref);
});
test('release gate requires actual OIDC variant, exact artifact and current SQL/installer source',()=>{
 for(const change of [f=>{f.verification.workerOidc.kind='mock';},f=>{f.verification.workerOidc.releaseEligible=false;},f=>{f.verification.workerOidc.finalArtifact={...f.candidate.artifact,sha256:'0'.repeat(64)};},f=>{f.candidate.sqlSourceHashes={};},f=>{f.verification.installerSources={};}]){const f=fixture();change(f);assert.throws(()=>validatePreparationRelease(f.candidate,f.verification,f.ref));}
});
test('release gate refuses skipped phone proof, failed checks and a multi-migration target gap',()=>{
 for(const change of [f=>{f.verification.suites.phone.skipped=1;},f=>{f.verification.suites.desktop.checks=0;},f=>{f.verification.workerOidc.checks.push({ok:false});},f=>{f.verification.workerOidc.pendingMigrations.push('other.sql');}]){const f=fixture();change(f);assert.throws(()=>validatePreparationRelease(f.candidate,f.verification,f.ref));}
});
function journalFixture(){const sources=migrationSourceSnapshot(),rows=ELECTIVE_MIGRATIONS.filter(p=>p!==PREPARATION_MIGRATION).map(p=>{const name=p.split('/').at(-1);return{version:name.slice(0,14),name:name.slice(15,-4),statements:[sources[p].sql]};});return{sources,rows,expected:{count:rows.length,sha256:sha(rows)}};}
test('incremental baseline binds every one of the14 installed elective migrations',()=>{
 const f=journalFixture();assert.deepEqual(validatePreparationJournal(f.rows,f.sources,f.expected),f.expected);
});
test('changed historical statement is refused even if a supplied journal hash was recalculated',()=>{
 const f=journalFixture();f.rows[0].statements=['changed'];f.expected.sha256=sha(f.rows);assert.throws(()=>validatePreparationJournal(f.rows,f.sources,f.expected));
});
test('an already installed or later migration cannot be treated as the expected baseline',()=>{
 const f=journalFixture();f.rows.push({version:'20261031100000',name:'elective_preparations',statements:[f.sources[PREPARATION_MIGRATION].sql]});assert.throws(()=>validatePreparationJournal(f.rows,f.sources,{count:f.rows.length,sha256:sha(f.rows)}));
});

test('lost commit response stays unknown even when the synthetic database did commit',async()=>{
 let schema='old',journal=0;const report={checks:[]};
 const db={begin:async callback=>{const before={schema,journal};let result;try{result=await callback(db);}catch(error){schema=before.schema;journal=before.journal;throw error;}throw Object.assign(Error('lost commit response'),{code:'ECONNRESET'});}};
 try{await runElectiveTransactions({db,mode:'apply',report,fingerprint:async()=>schema,recorded:async()=>journal,preserve:async()=>({original:'unchanged'}),migrate:async(_tx,phase)=>{schema='new';journal=1;report.stage=phase==='apply'?'commit_pending':'rollback_pending';return{fingerprint:schema};}});assert.fail('transport must fail');}
 catch(error){markPreparationInstallFailure(report,error);}
 assert.equal(schema,'new');assert.equal(journal,1);assert.equal(report.committed,false);assert.equal(report.status,'FAIL');assert.equal(report.commitOutcome,'unknown');assert.equal(report.failure.code,'ECONNRESET');
});
