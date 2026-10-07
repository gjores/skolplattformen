import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanningApplyArgs,verifyPlanningFoundation,PLANNING_FOUNDATION,PLANNING_BASE_ENTRIES,PLANNING_TABLES,sha} from './apply-planning-year-migration.mjs';
import {parsePlanningVerifyArgs,planningRollbackBody,planningTapProof,planningRollbackScript} from './verify-planning-year-foundation.mjs';
test('foundation apply accepts only the exact closed migration with evidence',()=>{
 assert.deepEqual(parsePlanningApplyArgs(['--migration',PLANNING_FOUNDATION,'--evidence','/private/tmp/proof.json']),{migration:PLANNING_FOUNDATION,evidence:'/private/tmp/proof.json'});
 for(const args of [[],['--migration','../'+PLANNING_FOUNDATION,'--evidence','x'],['--migration',PLANNING_FOUNDATION,'--evidence','x','--migration',PLANNING_FOUNDATION],['--migration','20261006121000_phase5_worker_planning_year_reads.sql','--evidence','x']])assert.throws(()=>parsePlanningApplyArgs(args));
});
test('SQL verifier refuses other targets, modes, duplicate flags and unsafe evidence directories',()=>{
 const args=['--target','protected','--mode','rollback','--out','/private/tmp/proof.json'];assert.equal(parsePlanningVerifyArgs(args).stage,'full');
 for(const invalid of [args.map(v=>v==='protected'?'baseline':v),args.map(v=>v==='rollback'?'reset':v),[...args,'--target','protected'],args.map(v=>v==='/private/tmp/proof.json'?'/Users/proof.json':v)])assert.throws(()=>parsePlanningVerifyArgs(invalid));
});
test('SQL fixture is always rollback-only and snapshot preserves complete unprojected rows',()=>{
 assert.equal(planningRollbackBody('begin;\nselect 1;\nrollback;\n'),'select 1;\n');
 for(const sql of ['select 1;','begin;\ncommit;\nrollback;','begin;\ntruncate public.offerings;\nrollback;','begin;\nselect 1;\ncommit;'])assert.throws(()=>planningRollbackBody(sql));
 const script=planningRollbackScript('select 1;','begin;\nselect 2;\nrollback;');assert.match(script,/pg_advisory_xact_lock\(5520\)/u);assert.match(script,/to_jsonb\(t\)/u);assert.match(script,/rollback;\s*$/u);
});
test('TAP proof requires every sequential assertion and exact single plan, with no bailouts',()=>{
 const output=Array.from({length:60},(_,i)=>`ok ${i+1} - actual SQL assertion`).concat('1..60').join('\n');assert.equal(planningTapProof(output).status,'PASS');
 for(const invalid of [output.replace('ok 2 ','not ok 2 '),output.replace('ok 2 ','ok 1 '),output.replace('1..60','1..61'),output+'\n1..60',output+'\nBail out!'])assert.equal(planningTapProof(invalid).status,'FAIL');
});
test('setup-only, fabricated, stale and incomplete proofs cannot authorize permanent apply',()=>{
 for(const e of [{},{kind:'phase5-planning-year-foundation',status:'PASS',stage:'setup'}, {complete:true,checks:[{ok:true}]}])assert.throws(()=>verifyPlanningFoundation(e,'source','test'));
});

test('apply gate binds exact full proof to immutable SQL, tests, old grants, lock evidence and all original tables',()=>{
 const hashes=Object.fromEntries(PLANNING_TABLES.map(t=>[t,{count:0,sha256:'a'.repeat(64)}]));
 const proof={kind:'phase5-planning-year-foundation',status:'PASS',target:'protected',scope:'local-synthetic-only',mode:'rollback',stage:'full',complete:true,rollback:true,reset:false,
 sourceHash:sha('source'),testHash:sha('test'),baselineFingerprint:'b'.repeat(64),originalBusinessPreserved:true,originalTimestampsPreserved:true,aclUnchanged:true,functionsAndJournalPreserved:true,
 beforeWorkerFunctions:PLANNING_BASE_ENTRIES,afterWorkerFunctions:PLANNING_BASE_ENTRIES,parity:{ok:true},locks:{ok:true},tap:{status:'PASS',total:60},originalHashes:hashes,finalHashes:hashes,checks:[{ok:true}]};
 assert.doesNotThrow(()=>verifyPlanningFoundation(proof,'source','test'));
 for(const patch of [{complete:false},{mode:'applied'},{reset:true},{sourceHash:sha('other')},{testHash:sha('other')},{locks:{ok:false}},
  {originalTimestampsPreserved:false},{beforeWorkerFunctions:PLANNING_BASE_ENTRIES.slice(1)},{finalHashes:{}},{checks:[{ok:false}]}])
 assert.throws(()=>verifyPlanningFoundation({...proof,...patch},'source','test'));
});
