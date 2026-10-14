import test from 'node:test';
import assert from 'node:assert/strict';
import {activationOptions,requireRegistryPreflight} from './activate-school-registry.mjs';
test('activation paths and dependency mode constrained',()=>{
 assert.equal(activationOptions(['--verify','--api-evidence','/private/tmp/api.json','--out','/private/tmp/verify.json']).mode,'--verify');
 for(const args of [[],['--apply','--api-evidence','/private/tmp/a.json','--out','/private/tmp/b.json'],['--verify','--api-evidence','/tmp/a.json','--out','/private/tmp/b.json']])assert.throws(()=>activationOptions(args));
});
test('activation refuses stale, failed, incomplete or unpreserved actual evidence',()=>{
 const hashes=Object.fromEntries(Array.from({length:15},(_,i)=>['path'+i,'a'.repeat(64)])),rows=Object.fromEntries(Array.from({length:50},(_,i)=>['table'+i,{count:0,hash:'x'}]));
 const r={kind:'school-registry-built-worker',status:'PASS',preflight:true,scope:'isolated-local-customer-public-reference-register',databaseClosed:true,unknownHttp:false,cleanupDeferred:false,preflightAclRestored:true,
  build:{mode:'protected',revision:'a'.repeat(40)},checks:Array.from({length:20},()=>({name:'verified',ok:true})),baselineFingerprint:'b'.repeat(64),finalFingerprint:'b'.repeat(64),
  beforeAcl:[{allowed:false},{allowed:false}],afterAcl:[{allowed:false},{allowed:false}],beforeHashes:rows,afterHashes:rows,auditIdentityProof:{audit_changes:0,identity_changes:0,new_missing_anchors:0},cleanup:{},originalRows:'c'.repeat(64),finalRows:'c'.repeat(64),sourceHashes:hashes,finalSourceHashes:hashes};
 assert.doesNotThrow(()=>requireRegistryPreflight(r,hashes));
 for(const change of [{status:'FAIL'},{preflight:false},{unknownHttp:true},{cleanupDeferred:true},{preflightAclRestored:false},{finalFingerprint:'d'.repeat(64)},{checks:[]},{finalSourceHashes:{}},{auditIdentityProof:{audit_changes:0,identity_changes:0,new_missing_anchors:1}}])assert.throws(()=>requireRegistryPreflight({...r,...change},hashes));
 assert.throws(()=>requireRegistryPreflight(r,{}));
});
