import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFlow} from './apply-school-registry.mjs';
import {sourceHashes,signatures} from './verify-school-registry.mjs';
test('foundation rejects incomplete failed or changed-source proof',()=>{
 const sources=sourceHashes(),flow={kind:'school-registry-rollback',status:'PASS',target:'protected',rollback:true,databaseClosed:true,
  beforeFingerprint:'a',afterFingerprint:'a',beforeHashes:{a:{count:1,hash:'a'}},afterHashes:{a:{count:1,hash:'a'}},sourceHashes:sources,finalSourceHashes:sources,checks:Array.from({length:40},()=>({ok:true}))};
 assert.doesNotThrow(()=>validateFlow(flow,sources));
 for(const change of [{status:'FAIL'},{target:'other'},{rollback:false},{databaseClosed:false},{afterFingerprint:'b'},{checks:[]},{finalSourceHashes:{}},{afterHashes:{}}])assert.throws(()=>validateFlow({...flow,...change},sources));
 assert.throws(()=>validateFlow(flow,{}));
});
test('grant scope is exactly list and save, proof binds source files',()=>{
 assert.deepEqual(signatures,['public.phase5_school_registry_list()','public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean)']);
 assert.ok(Object.keys(sourceHashes()).includes('supabase/tests/phase5_school_registry.test.sql'));
});
