import assert from 'node:assert/strict';
import test from 'node:test';
import {privateOutput,sourceHashes,signature,sourcePaths} from './verify-atomic-cohort-copy.mjs';
test('report arguments fail before any target or database access',()=>{
 for(const args of [[],['--out'],['--out','/tmp/report.json'],['--out','/private/tmp/../report.json'],['--out','/private/tmp/fixture.txt'],['--out','/private/tmp/report.json','--apply']])assert.throws(()=>privateOutput(args));
 assert.equal(privateOutput(['--out','/private/tmp/atomic-copy-test.json']),'/private/tmp/atomic-copy-test.json');
});
test('source evidence binds actual migration probe catalogue fixture and exact grant',()=>{
 const hashes=sourceHashes();assert.equal(Object.keys(hashes).length,sourcePaths.length);for(const hash of Object.values(hashes))assert.match(hash,/^[a-f0-9]{64}$/u);
 assert.ok(sourcePaths.includes('supabase/migrations/20261014101000_phase5_worker_atomic_cohort_copy.sql'));
 assert.equal(signature,'public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)');
});
