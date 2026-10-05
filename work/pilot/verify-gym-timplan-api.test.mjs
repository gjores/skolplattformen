import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGymApiArgs,gymCasesStatus,withGymAclRestore} from './verify-gym-timplan-api.mjs';
import {GYM_API_CASES} from './apply-gym-timplan-migration.mjs';
test('actual API runner refuses remote, reset, unsafe output and omitted target',()=>{
 const args=['--target','protected','--base-url','http://127.0.0.1:3059','--out','/private/tmp/gym-proof.json','--preflight'];
 assert.equal(parseGymApiArgs(args).preflight,true);
 for(const rejected of [[],args.concat('--reset'),args.map(v=>v==='protected'?'baseline':v),args.map(v=>v==='http://127.0.0.1:3059'?'https://remote.test':v),args.map(v=>v==='/private/tmp/gym-proof.json'?'/Users/test/proof.json':v)])assert.throws(()=>parseGymApiArgs(rejected));
});
test('all actual cases and nonempty passing checks are necessary',()=>{
 const cases=()=>GYM_API_CASES.map(name=>({name,status:'PASS',checks:[{ok:true}]}));
 assert.equal(gymCasesStatus(cases()),'PASS');let missing=cases();missing.pop();assert.equal(gymCasesStatus(missing),'FAIL');
 for(const change of [c=>c[0].checks=[],c=>c[0].checks[0].ok=false,c=>c[0].name=c[1].name]){const c=cases();change(c);assert.equal(gymCasesStatus(c),'FAIL');}
});
test('temporary grants restore exact ACL after partial grant or failed Worker run',async()=>{
 for(const stage of ['grant','run']) {
  const sequence=[];
  await assert.rejects(withGymAclRestore(['original'],async()=>{sequence.push('grant');if(stage==='grant')throw Error('grant failed');},
   async before=>{sequence.push('restore');assert.deepEqual(before,['original']);},async()=>{sequence.push('verify');return true;},
   async()=>{sequence.push('run');throw Error('test failed');}));
  assert.deepEqual(sequence,stage==='grant'?['grant','restore','verify']:['grant','run','restore','verify']);
 }
 await assert.rejects(withGymAclRestore([],async()=>{},async()=>{},async()=>false,async()=>{}),/gym_acl_restore_failed/u);
});
