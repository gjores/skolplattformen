import test from 'node:test';
import assert from 'node:assert/strict';
import {gymRollbackTestBody,gymTapProof,gymFoundationRollbackScript} from './verify-gym-timplan-foundation.mjs';
test('foundation runner accepts only a rollback transaction with no commit/reset',()=>{
 assert.equal(gymRollbackTestBody('begin;\nselect 1;\nrollback;\n'),'select 1;\n');
 for(const source of ['select 1;','begin;\nselect 1;\ncommit;','begin;\ncommit;\nrollback;','begin;\ntruncate public.timplans;\nrollback;'])assert.throws(()=>gymRollbackTestBody(source));
 const script=gymFoundationRollbackScript('select 1;','begin;\nselect 2;\nrollback;');
 assert.match(script,/pg_advisory_xact_lock\(5520\)/u);assert.match(script,/- 'gym_basis' - 'source_programplan_id'/u);assert.match(script,/rollback;\s*$/u);
});
test('all numbered actual TAP assertions and one exact plan must pass',()=>{
 const lines=Array.from({length:35},(_,i)=>`ok ${i+1} - actual assertion`),pass=[...lines,'1..35'].join('\n');
 assert.equal(gymTapProof(pass).status,'PASS');
 for(const invalid of [pass.replace('ok 8 ','not ok 8 '),pass.replace('ok 8 ','ok 7 '),pass.replace('1..35','1..36'),pass+'\n1..35',pass+'\nBail out!'])assert.equal(gymTapProof(invalid).status,'FAIL');
});
