import assert from 'node:assert/strict';
import test from 'node:test';
import {activationOptions,requireCopyPreflight} from './activate-atomic-cohort-copy.mjs';
import {signature} from './verify-atomic-cohort-copy.mjs';
function evidence(){
 const hashes=Object.fromEntries(Array.from({length:25},(_,i)=>['reviewed-source-'+i,'a'.repeat(64)]));
 const before=Object.fromEntries(Array.from({length:58},(_,i)=>['business-table-'+i,{count:0,hash:'b'.repeat(64)}]));
 return{kind:'programplan-copy-api',status:'PASS',complete:true,preflight:true,target:'protected',scope:'local-synthetic-only',reset:false,
  databaseClosed:true,unknownHttp:false,cleanupDeferred:false,artifactUnchanged:true,preflightAclRestored:true,originalBusinessPreserved:true,failure:null,
  realWorker:{runtime:'workerd',role:'skolplattform_worker',buildRevision:'c'.repeat(40),sourceRevision:'d'.repeat(40)},
  checks:Array.from({length:16},(_,i)=>({name:'Actual check '+i,ok:true})),baselineFingerprint:'e'.repeat(64),finalFingerprint:'e'.repeat(64),
  beforeAcl:[{f:signature,granted:false,acl:'closed'}],afterAcl:[{f:signature,granted:false,acl:'closed'}],beforeHashes:before,afterHashes:structuredClone(before),
  auditIdentityBaseline:{audit:123,identities:4,missing_identity_anchors:0},auditIdentityProof:{changed_audit:0,changed_identities:0,missing_identity_anchors:0,new_missing_identity_anchors:0,added_audit:23},
  cleanup:{originalBusinessUnchanged:true,libraryVersions:0,unitPackages:0,offeringUnits:0,customers:0,sessions:0,plans:0,receipts:0,educationEvents:0,
   offerings:0,mandates:0,mintedSessions:0,triggers:0,functions:0,gymReceipts:0,timplans:0,classLinks:0,preservedAuditEvents:23,preservedAuditAnchors:4,
   before:{source:'same'},after:{source:'same'}},sourceHashes:hashes,finalSourceHashes:structuredClone(hashes)};
}
test('activation arguments reject unsupported modes public evidence and ambiguous options before target access',()=>{
 for(const args of [[],['--grants'],['--apply','--api-evidence','/private/tmp/api.json','--out','/private/tmp/out.json'],
  ['--verify','--api-evidence','/tmp/api.json','--out','/private/tmp/out.json'],
  ['--verify','--api-evidence','/private/tmp/../api.json','--out','/private/tmp/out.json'],
  ['--verify','--api-evidence','/private/tmp/api.json','--out','/private/tmp/out.json','--out','/private/tmp/second.json']])assert.throws(()=>activationOptions(args));
 assert.equal(activationOptions(['--verify','--api-evidence','/private/tmp/api.json','--out','/private/tmp/out.json']).mode,'--verify');
});
test('complete actual preflight accepts only strict observed cleanup and closed ACL proof',()=>{
 const r=evidence();assert.equal(requireCopyPreflight(r,r.sourceHashes),r);
});
test('measured historical missing anchors must remain exact while new events retain every identity',()=>{
 const r=evidence();r.auditIdentityBaseline.missing_identity_anchors=1827;r.auditIdentityProof.missing_identity_anchors=1827;
 assert.equal(requireCopyPreflight(r,r.sourceHashes),r);
 for(const mutate of [q=>delete q.auditIdentityBaseline.missing_identity_anchors,q=>q.auditIdentityBaseline.missing_identity_anchors=-1,
  q=>q.auditIdentityBaseline.missing_identity_anchors='1827',q=>q.auditIdentityBaseline.missing_identity_anchors=1827.5,
  q=>q.auditIdentityProof.missing_identity_anchors=1828,q=>q.auditIdentityProof.missing_identity_anchors=1826,
  q=>delete q.auditIdentityProof.new_missing_identity_anchors,q=>q.auditIdentityProof.new_missing_identity_anchors=1]){
  const q=structuredClone(r);mutate(q);assert.throws(()=>requireCopyPreflight(q,r.sourceHashes));
 }
});
test('missing simulated stale partial or unsafe preflight cannot authorize activation',()=>{
 const corruptions=[r=>delete r.complete,r=>r.kind='atomic-cohort-copy-rollback',r=>r.preflight=false,r=>r.status='FAIL',r=>r.realWorker.runtime='mock',
  r=>r.databaseClosed=false,r=>r.unknownHttp=true,r=>r.cleanupDeferred=true,r=>r.checks.pop(),r=>r.checks[0].ok=false,
  r=>r.finalFingerprint='f'.repeat(64),r=>r.afterAcl[0].granted=true,r=>r.beforeAcl[0].granted=true,r=>r.afterHashes['business-table-0'].count=1,
  r=>delete r.beforeHashes['business-table-0'],r=>r.auditIdentityProof.changed_audit=1,r=>r.auditIdentityProof.changed_identities=1,
  r=>r.auditIdentityProof.missing_identity_anchors=1,r=>r.cleanup.mintedSessions=1,r=>r.cleanup.receipts=1,r=>r.cleanup.functions=1,
  r=>r.cleanup.originalBusinessUnchanged=false,r=>r.cleanup.after.source='changed',r=>r.artifactUnchanged=false,r=>r.finalSourceHashes['reviewed-source-0']='f'.repeat(64)];
 for(const corrupt of corruptions){const r=evidence();corrupt(r);assert.throws(()=>requireCopyPreflight(r,evidence().sourceHashes));}
 const stale=evidence();assert.throws(()=>requireCopyPreflight(stale,{...stale.sourceHashes,'reviewed-source-0':'f'.repeat(64)}));
 assert.throws(()=>requireCopyPreflight(null,{}));
});
