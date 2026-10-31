import test from 'node:test';
import assert from 'node:assert/strict';
import{mkdtempSync,writeFileSync,readFileSync,statSync,mkdirSync,symlinkSync,rmSync}from'node:fs';
import { parseElectiveInstallArgs, assertPriorJournal, ELECTIVE_MIGRATIONS, KNOWN_UNJOURNALLED, migrationSourceSnapshot, runElectiveTransactions, validateReleaseEvidence, assertTransactionalSql, assertRehearsalEvidence, prepareMigrationSql, readMigrationJournal, applyElectiveBlocks, sha } from './apply-elective-blocks.mjs';
const options=['--candidate','/private/tmp/c.json','--verification','/private/tmp/v.json','--out','/private/tmp/r.json'];
test('explicit local mode, private paths and mandatory external rehearsal gate apply',()=>{
 assert.equal(parseElectiveInstallArgs(['--rehearse',...options]).mode,'rehearsal');
 assert.throws(()=>parseElectiveInstallArgs(['--apply',...options]));
 assert.equal(parseElectiveInstallArgs(['--apply',...options,'--rehearsal','/private/tmp/previous.json']).mode,'apply');
 for(const args of [[],['--rehearse','--apply',...options],['--rehearse',...options,'--db-url','postgres://remote'],['--rehearse',...options,'--linked'],['--rehearse',...options,'--candidate','/private/tmp/x.json'],['--rehearse',...options.map(v=>v==='/private/tmp/c.json'?'/tmp/c.json':v)]])assert.throws(()=>parseElectiveInstallArgs(args));
});
function journals(){const sources=migrationSourceSnapshot();const rows=Object.keys(sources).filter(p=>!ELECTIVE_MIGRATIONS.includes(p)&&!KNOWN_UNJOURNALLED.includes(p)).map(p=>({version:p.split('/').at(-1).slice(0,14),name:p.split('/').at(-1).slice(15,-4),statements:[sources[p].sql]}));return{sources,rows};}
test('prior journal is exact and only the two declared historical holes are accepted',()=>{
 const{sources,rows}=journals();const result=assertPriorJournal(rows,sources,[]);assert.equal(result.count,rows.length);assert.equal(result.legacyJournal.length,0);
 assert.throws(()=>assertPriorJournal(rows.slice(1),sources,[]));
 assert.throws(()=>assertPriorJournal([...rows,{version:'99999999999999',name:'unknown',statements:['select 1']}],sources,[]));
 assert.throws(()=>assertPriorJournal(rows.map((r,i)=>i? r:{...r,name:'wrong'}),sources,[]));
});
test('legacy statements mismatch needs an exact named baseline exception; no backfilled journal',()=>{
 const{sources,rows}=journals();rows[0]={...rows[0],statements:['-- historical statement split']};assert.throws(()=>assertPriorJournal(rows,sources,[]));
 const p=Object.keys(sources).find(p=>p.split('/').at(-1).startsWith(rows[0].version));
 const exception={version:rows[0].version,name:rows[0].name,statementsSha256:sha(rows[0].statements),repositorySourceSha256:sources[p].sha256,reason:'verified-baseline-history'};
 assert.equal(assertPriorJournal(rows,sources,[exception]).legacyJournal.length,1);
 assert.throws(()=>assertPriorJournal(rows,sources,[{...exception,statementsSha256:'a'.repeat(64)}]));
 assert.throws(()=>assertPriorJournal(rows,sources,[exception,{...exception,version:'99999999999999'}]));
});
const candidate={kind:'elective-blocks-candidate',status:'PASS',revision:'a'.repeat(40),artifact:{sha256:'b'.repeat(64),fileCount:1},sqlSourceHashes:Object.fromEntries(Object.entries(migrationSourceSnapshot()).map(([p,v])=>[p,v.sha256]))};
function verification(){return{kind:'elective-blocks-release-evidence',status:'PASS',candidate:{path:'/private/tmp/c.json',sha256:'c'.repeat(64)},checks:[{name:'synthetic gate fixture',ok:true}],suites:Object.fromEntries(['sql','workerOidc','desktop','phone'].map(k=>[k,{status:'PASS',checks:1,skipped:0}]))};}
test('candidate and actual release evidence must bind the exact source snapshot and all required suites',()=>{
 const v=verification();validateReleaseEvidence(candidate,v,{candidatePath:'/private/tmp/c.json',candidateSha256:'c'.repeat(64)});
 for(const bad of [{...v,status:'FAIL'},{...v,candidate:{...v.candidate,sha256:'d'.repeat(64)}},{...v,suites:{...v.suites,phone:{status:'PASS',checks:1,skipped:1}}}])assert.throws(()=>validateReleaseEvidence(candidate,bad,{candidatePath:'/private/tmp/c.json',candidateSha256:'c'.repeat(64)}));
 assert.throws(()=>validateReleaseEvidence({...candidate,sqlSourceHashes:{}},v,{candidatePath:'/private/tmp/c.json',candidateSha256:'c'.repeat(64)}));
});
function fake(){const state={schema:'old',journal:0,data:'old',commits:0,rollbacks:0};const db={async begin(fn){const saved={...state};try{const r=await fn(db);state.commits++;return r;}catch(e){Object.assign(state,{...saved,rollbacks:saved.rollbacks+1});throw e;}}};return{db,state};}
async function harness(mode,changes={}){const{db,state}=fake(),report={checks:[]};const args={db,mode,report,fingerprint:async()=>state.schema,recorded:async()=>state.journal,preserve:async()=>state.data,migrate:async(_tx,phase)=>{state.schema='new';state.journal=ELECTIVE_MIGRATIONS.length;return{fingerprint:'new',phase};},...changes};return{state,report,args};}
test('rehearsal always rolls back and apply repeats rehearsal before one commit',async()=>{
 const a=await harness('rehearsal');await runElectiveTransactions(a.args);assert.equal(a.state.commits,0);assert.equal(a.state.rollbacks,1);assert.equal(a.state.schema,'old');assert.equal(a.report.committed,false);
 const b=await harness('apply');await runElectiveTransactions(b.args);assert.equal(b.state.commits,1);assert.equal(b.state.rollbacks,1);assert.equal(b.state.journal,ELECTIVE_MIGRATIONS.length);assert.equal(b.report.committed,true);
});
test('failed preservation or migration blocks apply and restores rows/schema/journal',async()=>{
 const a=await harness('apply');a.args.migrate=async()=>{a.state.data='changed';a.state.schema='new';a.state.journal=ELECTIVE_MIGRATIONS.length;return{};};await assert.rejects(runElectiveTransactions(a.args));assert.equal(a.state.commits,0);assert.equal(a.state.data,'old');
 const b=await harness('apply',{migrate:async()=>{throw Error('failure');}});await assert.rejects(runElectiveTransactions(b.args));assert.equal(b.state.commits,0);
});

test('migration transaction control cannot escape the mandatory rollback',()=>{
 for(const sql of ['BEGIN;select 1;COMMIT;','select 1; /* comment */ COMMIT AND CHAIN;','-- hi\nEND;','PREPARE TRANSACTION \'x\';','ROLLBACK TO SAVEPOINT x;'])assert.throws(()=>assertTransactionalSql(sql));
 for(const sql of ["do $$begin perform 'COMMIT;';end$$;", "create function x() returns void language plpgsql as $body$begin perform 'ROLLBACK;';end$body$;", "select 'COMMIT;'; /* outer /* nested */ comment */ select 2;", "select E'escaped\\\\backslash';-- COMMIT;\nselect 3;"])assert.doesNotThrow(()=>assertTransactionalSql(sql));
});

test('external rehearsal proof must be rolled back, closed and bound to the same code/candidate',()=>{
 const current={candidate:{path:'/private/tmp/c.json',sha256:'a'.repeat(64)},verification:{path:'/private/tmp/v.json',sha256:'b'.repeat(64)},sqlSourceHashes:{one:'c'.repeat(64)},installerSourceHashes:{installer:'d'.repeat(64)}};
 const p={kind:'elective-blocks-migration-evidence',status:'PASS',mode:'rehearsal',rollbackRestored:true,committed:false,databaseClosed:true,checks:[{name:'rollback',ok:true}],...current,finalSqlSourceHashes:current.sqlSourceHashes,rehearsal:{fingerprint:'e'.repeat(64)}};
 assertRehearsalEvidence(p,current);
 for(const bad of [{...p,committed:true},{...p,rollbackRestored:false},{...p,databaseClosed:false},{...p,candidate:{...p.candidate,sha256:'f'.repeat(64)}},{...p,checks:[{ok:false}]}])assert.throws(()=>assertRehearsalEvidence(bad,current));
});

test('only one exact outer wrapper is removed; inner control still refuses execution',()=>{
 const source="-- before\nbegin;\ncreate function x() returns void as $tag$begin perform 'COMMIT;';end$tag$ language plpgsql;\n/* after body */ commit; -- tail";
 const p=prepareMigrationSql(source);assert.equal(p.wrapper,'outer-begin-commit');assert.equal(p.sourceSha256,sha(source));assert.equal(p.executionSha256,sha(p.sql));assert.ok(p.sql.includes('$tag$begin'));assert.ok(p.sql.includes('-- before'));assert.ok(p.sql.includes('-- tail'));assertTransactionalSql(p.sql);
 for(const bad of ['begin;select 1;commit;commit;',"begin;rollback;commit;",'select 1;begin;select 2;commit;','BEGIN ISOLATION LEVEL SERIALIZABLE;select 1;COMMIT;'])assert.throws(()=>prepareMigrationSql(bad));
 assert.equal(prepareMigrationSql("select 'begin;commit;';").wrapper,'none');
});

test('journal comparisons normalize postgres Result arrays before preservation checks',async()=>{
 class Result extends Array{};const result=new Result({version:'one',name:'one',statements:['select 1']});result.count=1;
 const actual=await readMigrationJournal(async()=>result);assert.deepEqual(actual,[{version:'one',name:'one',statements:['select 1']}]);assert.equal(Object.getPrototypeOf(actual),Array.prototype);
});

test('actual preflight refuses before target access and never logs supplied secrets or unsafe report paths',async()=>{
 const dir=mkdtempSync('/private/tmp/elective-installer-test-'),secret='NEVER_LOG_ACCOUNT_OR_URL_SECRET';
 try{
  const c=dir+'/candidate.json',v=dir+'/verification.json',out=dir+'/report.json';
  writeFileSync(c,JSON.stringify({...candidate,artifact:{...candidate.artifact,unexpected:secret}}),{mode:0o600});
  const proof={...verification(),candidate:{path:c,sha256:sha(readFileSync(c))},installedFingerprint:'a'.repeat(64),baselineFingerprint:secret};
  writeFileSync(v,JSON.stringify(proof),{mode:0o600});
  const report=await applyElectiveBlocks({mode:'rehearsal',candidate:c,verification:v,out});
  assert.equal(report.status,'FAIL');assert.equal(report.targetIdentity,undefined);assert.equal(statSync(out).mode&0o077,0);assert.equal(readFileSync(out,'utf8').includes(secret),false);
  mkdirSync(dir+'/actual');symlinkSync(dir+'/actual',dir+'/link');await assert.rejects(applyElectiveBlocks({mode:'rehearsal',candidate:c,verification:v,out:dir+'/link/report.json'}));
  symlinkSync(c,dir+'/candidate-link.json');const denied=await applyElectiveBlocks({mode:'rehearsal',candidate:dir+'/candidate-link.json',verification:v,out:dir+'/refused.json'});assert.equal(denied.status,'FAIL');assert.equal(denied.targetIdentity,undefined);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('wrapper lexer distinguishes ordinary quotes, escaped E quotes and nested comments',()=>{
 for(const sql of [String.raw`begin; select E'it\'s COMMIT;'; commit;`, "begin;select 'it''s COMMIT;';/* outer /* inner */ comment */commit;"]){const p=prepareMigrationSql(sql);assert.equal(p.wrapper,'outer-begin-commit');assertTransactionalSql(p.sql);}
 for(const sql of [String.raw`select '\'; COMMIT;`,String.raw`select E'\\'; COMMIT;`,"begin;select 'unterminated;commit;","begin;do $tag$unterminated;commit;","begin;/* unterminated commit;"])assert.throws(()=>prepareMigrationSql(sql));
});

test('empty historical statements require exact reviewed exceptions and remain unchanged',()=>{
 const {sources,rows}=journals();const versions=['20260930110000','20260930120000','20260930121000','20260930130000','20260930140000','20260930150000'];
 const exceptions=[];
 for(const r of rows){if(!versions.includes(r.version))continue;r.statements=[];const p=Object.keys(sources).find(p=>p.split('/').at(-1).startsWith(r.version));exceptions.push({version:r.version,name:r.name,statementsSha256:sha([]),repositorySourceSha256:sources[p].sha256,reason:'verified-baseline-history'});}
 assert.equal(exceptions.length,6);const frozen=structuredClone(rows);
 assert.throws(()=>assertPriorJournal(rows,sources,[]));assert.throws(()=>assertPriorJournal(rows,sources,exceptions.slice(1)));
 assert.equal(assertPriorJournal(rows,sources,exceptions).legacyJournal.length,6);assert.deepEqual(rows,frozen);
 assert.throws(()=>assertPriorJournal(rows,sources,exceptions.map((e,i)=>i?e:{...e,repositorySourceSha256:'0'.repeat(64)})));
 assert.throws(()=>assertPriorJournal(rows.map((r,i)=>i?r:{...r,statements:null}),sources,exceptions));
});
