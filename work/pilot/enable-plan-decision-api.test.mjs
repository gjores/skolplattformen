import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateDecisionEvidence} from './enable-plan-decision-api.mjs';
const sha=createHash('sha256').update('synthetic source').digest('hex');
const paths=['web/lib/plan-decision.ts','web/lib/server/plan-decision.ts','web/lib/server/gym-timplan.ts','web/lib/server/audit-details.ts','web/lib/mandate-policy.ts','web/app/api/planbeslut/underlag/route.ts','web/app/api/planbeslut/andra/route.ts','web/app/api/planbeslut/inkorg/route.ts','supabase/migrations/20261012180000_plan_decision_flow.sql','supabase/migrations/20261012180100_plan_decision_command_fix.sql','work/pilot/verify-plan-decision-api.mjs'];
const names=['MFA required','head organizer approves corrected programplan','head organizer approves corrected timplan','final Worker audit failure rolls back database decision','rector submits and retry is idempotent with paired audit'];
const proof=()=>({kind:'plan-decision-api',status:'PASS',target:'protected',preflight:true,apiVerified:true,aclRestored:true,originalBusinessPreserved:true,sourceUnchanged:true,realWorker:{runtime:'workerd',role:'skolplattform_worker'},baselineFingerprint:'fingerprint',finalFingerprint:'fingerprint',checks:[...names,...Array.from({length:14},(_,i)=>`Other ${i}`)].map(name=>({name,ok:true})),finalSourceHashes:Object.fromEntries(paths.map(path=>[path,sha]))});
test('only an unchanged actual Worker preflight permits local grant preparation',()=>{
 assert.doesNotThrow(()=>validateDecisionEvidence(proof(),()=> 'synthetic source'));
 for(const patch of [{status:'FAIL'},{apiVerified:false},{preflight:false},{aclRestored:false},{sourceUnchanged:false},{originalBusinessPreserved:false},{finalFingerprint:'changed'},{target:'example'},{realWorker:{runtime:'mock',role:'skolplattform_worker'}}])assert.throws(()=>validateDecisionEvidence({...proof(),...patch},()=> 'synthetic source'));
});
test('missing meaningful proof and changed current source refuse activation',()=>{
 const missing=proof();missing.checks=missing.checks.filter(c=>c.name!=='MFA required');assert.throws(()=>validateDecisionEvidence(missing,()=> 'synthetic source'));
 assert.throws(()=>validateDecisionEvidence(proof(),()=> 'changed source'));
 const absent=proof();delete absent.finalSourceHashes[paths[0]];assert.throws(()=>validateDecisionEvidence(absent,()=> 'synthetic source'));
});
