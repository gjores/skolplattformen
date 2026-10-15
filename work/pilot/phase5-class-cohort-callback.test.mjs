import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClassCohortCallbackProof} from './phase5-class-cohort-oidc-fixtures.mjs';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sample(stepUp=false){return{
 attempt:{id:uuid(1),role:'principal',identityId:uuid(2),issuer:'http://local-idp.test',subject:uuid(3),origin:'http://127.0.0.1:3013',stepUp,priorAuditIds:[uuid(4)],priorSessionIds:stepUp?[uuid(5)]:[],sessionId:uuid(5),epoch:7,loginRequests:1},
 callbacks:[{id:uuid(6),attemptId:uuid(1),role:'principal',origin:'http://127.0.0.1:3013',pathname:'/api/auth/callback',method:'GET',navigation:true,status:null}],
 audits:[{id:uuid(7),source:'worker',action:'login',outcome:'ok',actor_identity_id:uuid(2),actor_issuer:'http://local-idp.test',actor_subject:uuid(3),session_id:uuid(5),details:{stepUp,proof:{result:'accepted',issuer:'http://local-idp.test'}}}],
 session:{identityId:uuid(2),issuer:'http://local-idp.test',subject:uuid(3),sessionId:uuid(5),epoch:7,mfa:stepUp},browserReturn:{origin:'http://127.0.0.1:3013',pathname:'/'},usedAuditIds:[]
};}
test('Real browser/server proof keeps absent HTTP status explicitly null',()=>{const value=sample();const result=verifyClassCohortCallbackProof(value);assert.equal(result.proofKind,'browser-return-and-server-audit');assert.equal(result.httpStatus,null);assert.equal(result.auditId,value.audits[0].id);});
test('Actual observed redirect status is retained',()=>{const value=sample();value.callbacks[0].status=302;assert.equal(verifyClassCohortCallbackProof(value).httpStatus,302);});
test('Step-up binds same session and epoch to accepted MFA audit',()=>{assert.equal(verifyClassCohortCallbackProof(sample(true)).sessionId,uuid(5));});
const negatives=[
 ['missing callback',v=>{v.callbacks=[];}],['two callbacks',v=>{v.callbacks.push({...v.callbacks[0],id:uuid(8)});}],
 ['no authentication navigation',v=>{v.attempt.loginRequests=0;}],['parallel navigation',v=>{v.attempt.loginRequests=2;}],
 ['missing audit',v=>{v.audits=[];}],['two fresh audits',v=>{v.audits.push({...v.audits[0],id:uuid(8)});}],
 ['wrong attempt',v=>{v.callbacks[0].attemptId=uuid(8);}],['wrong role',v=>{v.callbacks[0].role='hm';}],
 ['foreign callback origin',v=>{v.callbacks[0].origin='http://127.0.0.1:3012';}],['wrong callback path',v=>{v.callbacks[0].pathname='/';}],
 ['non-navigation callback',v=>{v.callbacks[0].navigation=false;}],['POST callback',v=>{v.callbacks[0].method='POST';}],
 ['audit identity',v=>{v.audits[0].actor_identity_id=uuid(8);}],['audit issuer',v=>{v.audits[0].actor_issuer='http://other.test';}],
 ['audit subject',v=>{v.audits[0].actor_subject=uuid(8);}],['audit session',v=>{v.audits[0].session_id=uuid(8);}],
 ['audit stepUp',v=>{v.audits[0].details.stepUp=true;}],['audit source',v=>{v.audits[0].source='db';}],
 ['audit action',v=>{v.audits[0].action='context_changed';}],['audit denied',v=>{v.audits[0].outcome='denied';}],
 ['baseline audit replay',v=>{v.attempt.priorAuditIds.push(v.audits[0].id);}],['already bound audit replay',v=>{v.usedAuditIds.push(v.audits[0].id);}],
 ['cookie session identity',v=>{v.session.identityId=uuid(8);}],['cookie session issuer',v=>{v.session.issuer='http://other.test';}],
 ['cookie session subject',v=>{v.session.subject=uuid(8);}],['old session on normal login',v=>{v.attempt.priorSessionIds.push(v.session.sessionId);}],
 ['browser has not returned',v=>{v.browserReturn.origin='http://local-idp.test';}],['browser remains on auth path',v=>{v.browserReturn.pathname='/api/auth/callback';}],
 ['actual HTTP200',v=>{v.callbacks[0].status=200;}],['actual HTTP400',v=>{v.callbacks[0].status=400;}],['actual HTTP500',v=>{v.callbacks[0].status=500;}],
 ['missing HTTP representation',v=>{delete v.callbacks[0].status;}],
];
for(const[name,mutate]of negatives)test('Reject '+name,()=>{const value=sample();mutate(value);assert.throws(()=>verifyClassCohortCallbackProof(value));});
for(const[name,mutate]of [
 ['changed step-up session',v=>{v.attempt.sessionId=uuid(8);}],['changed step-up epoch',v=>{v.session.epoch++;}],
 ['missing MFA proof',v=>{v.session.mfa=false;}],['unaccepted audit MFA',v=>{v.audits[0].details.proof.result='denied';}],
 ['foreign MFA proof issuer',v=>{v.audits[0].details.proof.issuer='http://other.test';}],
])test('Reject '+name,()=>{const value=sample(true);mutate(value);assert.throws(()=>verifyClassCohortCallbackProof(value));});
