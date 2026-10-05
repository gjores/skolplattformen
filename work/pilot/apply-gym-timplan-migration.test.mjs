import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseGymApplyArgs,verifyGymFoundation,verifyGymPreflight,gymBaselineFingerprint,GYM_FOUNDATION,GYM_GRANTS,GYM_ENTRIES,GYM_BASE_ENTRIES,GYM_SOURCE_PATHS,GYM_API_CASES} from './apply-gym-timplan-migration.mjs';
const source='reviewed foundation',sha=s=>createHash('sha256').update(s).digest('hex');
const foundation=()=>({kind:'phase5-gym-timplan-foundation-rollback',status:'PASS',target:'protected',scope:'local-synthetic-only',rollback:true,reset:false,sourceHash:sha(source),baselineFingerprint:'a'.repeat(64),originalBusinessPreserved:true,originalTimestampsPreserved:true,newNullableFieldsOnly:true,aclUnchanged:true,beforeWorkerFunctions:GYM_BASE_ENTRIES,afterWorkerFunctions:GYM_BASE_ENTRIES,checks:[{ok:true}]});
const read=()=>source;
const preflight=()=>({kind:'phase5-gym-timplan-api',status:'PASS',target:'protected',scope:'local-synthetic-only',preflight:true,complete:true,preflightAclRestored:true,aclUnchanged:true,cleanupStatus:'PASS',originalBusinessPreserved:true,beforeWorkerFunctions:GYM_BASE_ENTRIES,restoredWorkerFunctions:GYM_BASE_ENTRIES,verifiedWorkerFunctions:[...GYM_BASE_ENTRIES,...GYM_ENTRIES],cases:GYM_API_CASES.map(name=>({name,status:'PASS',checks:[{ok:true}]})),sourceCommit:'a'.repeat(40),workerBuildRevision:'b'.repeat(40),baselineFingerprint:'c'.repeat(64),cleanup:{originalBusinessUnchanged:true,gymReceipts:0,timplans:0,classLinks:0},originalHashes:Object.fromEntries(Array.from({length:14},(_,i)=>[i,{sha:'original',count:0}])),finalHashes:Object.fromEntries(Array.from({length:14},(_,i)=>[i,{sha:'original',count:0}])),sourceHashes:Object.fromEntries(GYM_SOURCE_PATHS.map(p=>[p,sha(source)]))});
test('only exact local migration with evidence is accepted',()=>{
 for(const migration of[GYM_FOUNDATION,GYM_GRANTS])assert.equal(parseGymApplyArgs(['--migration',migration,'--evidence','/private/tmp/proof.json']).migration,migration);
 for(const args of[[],['--migration','../../reset.sql','--evidence','proof'],['--migration',GYM_FOUNDATION],['--migration',GYM_GRANTS,'--evidence','p','--reset'],['--target','remote']])assert.throws(()=>parseGymApplyArgs(args));
});
test('foundation requires exact rolled-back source, timestamps, original data and ACL',()=>{
 verifyGymFoundation(foundation(),source);
 for(const field of['rollback','originalBusinessPreserved','originalTimestampsPreserved','newNullableFieldsOnly','aclUnchanged']){const e=foundation();e[field]=false;assert.throws(()=>verifyGymFoundation(e,source));}
 for(const field of['target','scope','sourceHash','baselineFingerprint']){const e=foundation();e[field]='wrong';assert.throws(()=>verifyGymFoundation(e,source));}
 assert.throws(()=>verifyGymFoundation({...foundation(),afterWorkerFunctions:[...GYM_BASE_ENTRIES,GYM_ENTRIES[0]]},source));
 assert.throws(()=>verifyGymFoundation({...foundation(),checks:[]},source));assert.throws(()=>verifyGymFoundation(foundation(),'different source'));
});
test('grants demand all actual cases, restored inventory, no leftovers and exact source hashes',()=>{
 verifyGymPreflight(preflight(),read);
 for(const field of['preflight','complete','preflightAclRestored','aclUnchanged','originalBusinessPreserved']){const e=preflight();e[field]=false;assert.throws(()=>verifyGymPreflight(e,read));}
 let e=preflight();e.cases.pop();assert.throws(()=>verifyGymPreflight(e,read));e=preflight();e.cases[0].checks[0].ok=false;assert.throws(()=>verifyGymPreflight(e,read));
 e=preflight();e.restoredWorkerFunctions=[...GYM_BASE_ENTRIES,GYM_ENTRIES[0]];assert.throws(()=>verifyGymPreflight(e,read));
 for(const field of['gymReceipts','timplans','classLinks']){e=preflight();e.cleanup[field]=1;assert.throws(()=>verifyGymPreflight(e,read));}
 e=preflight();e.finalHashes[0].sha='changed';assert.throws(()=>verifyGymPreflight(e,read));
 e=preflight();delete e.sourceHashes[GYM_SOURCE_PATHS[0]];assert.throws(()=>verifyGymPreflight(e,read));assert.throws(()=>verifyGymPreflight(preflight(),()=>'changed'));
 e=preflight();delete e.baselineFingerprint;assert.throws(()=>verifyGymPreflight(e,read));
});
test('shared baseline fingerprint covers exact definitions, raw ACL and complete journal',async()=>{
 const functions=[{f:'public.phase5_example(uuid)',acl:'{owner=X/owner}',definition:'reviewed SQL'}],journal=[{version:'20261004157000',name:'reviewed predecessor',statements:['closed grants']}];
 const fingerprint=async(f=functions,j=journal)=>{let n=0;return gymBaselineFingerprint(async()=>n++===0?f:j);};
 const original=await fingerprint();assert.equal(original,sha(JSON.stringify({functions,journal})));
 for(const field of ['f','acl','definition'])assert.notEqual(original,await fingerprint([{...functions[0],[field]:'changed'}]));
 for(const field of ['version','name','statements'])assert.notEqual(original,await fingerprint(functions,[{...journal[0],[field]:'changed'}]));
});
