import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNeedOnceArgs,assertNeedOnceDiff,NEED_ONCE_ADDED,NEED_ONCE_CHANGED} from './apply-tjanst-need-once.mjs';

const fn=(signature,definition='a',acl='{postgres=X/postgres}')=>({signature,definition,acl});
const before=[...NEED_ONCE_CHANGED.map(s=>fn(s)),fn('tjanst_plan_read(jsonb)','r','{postgres=X/postgres,skolplattform_worker=X/postgres}')];
const after=[...before.map(f=>NEED_ONCE_CHANGED.includes(f.signature)?{...f,definition:'b'}:f),fn(NEED_ONCE_ADDED[0])];

test('kräver uttryckligt läge och privat utfil',()=>{
 assert.equal(parseNeedOnceArgs(['--rehearse','--out','/private/tmp/x.json']).mode,'rehearsal');
 assert.equal(parseNeedOnceArgs(['--apply','--out','/tmp/x.json']).mode,'apply');
 assert.throws(()=>parseNeedOnceArgs(['--out','/tmp/x.json']));
 assert.throws(()=>parseNeedOnceArgs(['--apply','--out','work/pilot/results/x.json']));
});
test('godtar bara den förväntade katalogskillnaden',()=>{
 assert.deepEqual(assertNeedOnceDiff(before,after).added,NEED_ONCE_ADDED);
 assert.throws(()=>assertNeedOnceDiff(before,after.map(f=>f.signature==='tjanst_plan_read(jsonb)'?{...f,definition:'x'}:f)),/unexpected_changed_function/u);
 assert.throws(()=>assertNeedOnceDiff(before,after.map(f=>f.signature===NEED_ONCE_CHANGED[0]?{...f,acl:'{postgres=X/postgres,skolplattform_worker=X/postgres}'}:f)),/privileges_changed/u);
 assert.throws(()=>assertNeedOnceDiff(before,after.map(f=>f.signature===NEED_ONCE_ADDED[0]?{...f,acl:''}:f)),/new_function_must_be_private/u);
 assert.throws(()=>assertNeedOnceDiff(before,[...after,fn('extra()')]),/unexpected_added_function/u);
 assert.throws(()=>assertNeedOnceDiff(before,after.slice(1)),/function_removed|unexpected/u);
});
