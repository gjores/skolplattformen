import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// Exercise the actual pure helpers without importing the delivery CLI or opening
// a database, browser, IdP connection, or private evidence file.
const source=readFileSync(new URL('./deliver-class-cohort.mjs',import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex'),digest=value=>sha(JSON.stringify(value));
const omitted=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
const startMarker='// BEGIN pure, narrow JWT metadata evidence helpers.';
const endMarker='// END pure, narrow JWT metadata evidence helpers.';
assert.equal(source.split(startMarker).length,2,'Exactly one helper start marker required');
assert.equal(source.split(endMarker).length,2,'Exactly one helper end marker required');
assert.ok(source.indexOf(endMarker)>source.indexOf(startMarker),'Helper markers must be ordered');
const helper=source.slice(source.indexOf(startMarker),source.indexOf(endMarker));
assert.ok(helper.includes('function callbackTokenClaims')&&helper.includes('function preserveAuthJwtMetadata'));
const {callbackTokenClaims,preserveAuthJwtMetadata}=new Function('assert','sha','digest','omitted',helper+'\nreturn {callbackTokenClaims,preserveAuthJwtMetadata};')(assert,sha,digest,omitted);
const clone=value=>structuredClone(value);
const baseClaims={iss:'https://issuer.invalid',sub:'synthetic-subject',aud:'synthetic-client',azp:'synthetic-client',iat:2000000010,exp:2000000310};
const jwt=claims=>Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.c3ludGhldGlj';
const binding={issuer:baseClaims.iss,subject:baseClaims.sub,clientId:baseClaims.aud,startedAt:new Date(2000000000000).toISOString(),observedAt:new Date(2000000020000).toISOString(),stepUp:false,correlationId:'synthetic-correlation'};
const session={id:'own-session',proof_issuer:baseClaims.iss,proof_client_id:baseClaims.aud,proof_audience:[baseClaims.aud],proof_checked_at:new Date(2000000011000).toISOString(),id_token_hint:jwt(baseClaims)};
const audit={id:'own-audit',source:'worker',actor_issuer:baseClaims.iss,actor_subject:baseClaims.sub,details:{stepUp:false,proof:{sourceCorrelationId:binding.correlationId,issuer:binding.issuer,result:'required'}}};
const claims=callbackTokenClaims(session,audit,binding);
test('normal_callback_without_accepted_mfa_is_bound',()=>assert.equal(claims.iat,baseClaims.iat));
test('accepted_stepup_is_bound',()=>{const a=clone(audit);a.details.stepUp=true;a.details.proof.result='accepted';assert.equal(callbackTokenClaims(session,a,{...binding,stepUp:true}).stepUp,true);});
for(const [label,mutate]of [
 ['old_token_iat',x=>{x.iat=1999999999;}],['future_token_iat',x=>{x.iat=2000000030;}],['token_exp_not_after_iat',x=>{x.exp=x.iat;}],['token_nonnumeric_iat',x=>{x.iat='2000000010';}],['token_fractional_iat',x=>{x.iat+=0.5;}],['token_wrong_subject',x=>{x.sub='other';}],['token_wrong_issuer',x=>{x.iss='https://other.invalid';}],['token_wrong_audience',x=>{x.aud='other';}],['token_wrong_azp',x=>{x.azp='other';}],
])test(label+'_denied',()=>{const x=clone(baseClaims);mutate(x);assert.throws(()=>callbackTokenClaims({...session,id_token_hint:jwt(x)},audit,binding));});
for(const [label,mutate]of [
 ['nonworker_audit',x=>{x.source='db';}],['audit_wrong_subject',x=>{x.actor_subject='other';}],['audit_wrong_correlation',x=>{x.details.proof.sourceCorrelationId='other';}],['audit_wrong_stepup',x=>{x.details.stepUp=true;}],
])test(label+'_denied',()=>{const x=clone(audit);mutate(x);assert.throws(()=>callbackTokenClaims(session,x,binding));});
test('stepup_without_accepted_proof_denied',()=>{const x=clone(audit);x.details.stepUp=true;assert.throws(()=>callbackTokenClaims(session,x,{...binding,stepUp:true}));});
test('server_session_wrong_client_denied',()=>assert.throws(()=>callbackTokenClaims({...session,proof_client_id:'other'},audit,binding)));
test('server_proof_outside_attempt_denied',()=>assert.throws(()=>callbackTokenClaims({...session,proof_checked_at:new Date(1999999999000).toISOString()},audit,binding)));
for(const field of ['raw_user_meta_data','identity_data']){
 const old=[{id:'own',row:{id:'own',role:'unchanged',last_sign_in_at:null,updated_at:'old',[field]:{iat:1999999000,exp:1999999300,sub:'synthetic-subject',nested:{stable:'value'}}}},{id:'other',row:{id:'other',role:'unchanged',last_sign_in_at:null,updated_at:'old',[field]:{iat:1999999000,exp:1999999300,sub:'other',nested:{stable:'value'}}}}];
 const next=clone(old);next[0].row[field].iat=claims.iat;next[0].row[field].exp=claims.exp;next[0].row.updated_at='new';
 const options={ownIds:['own'],metadataOwnerId:'own',field,allowed:['last_sign_in_at','updated_at'],claims};
 test(field+'_exact_owned_rotation_allowed',()=>{const evidence=preserveAuthJwtMetadata(old,next,options);assert.deepEqual(evidence[0].changedFields.map(x=>x.field),[field+'.iat',field+'.exp','updated_at']);assert.equal(evidence[0].tokenSha256,claims.tokenSha256);assert.equal(evidence[0].beforeSha256,digest(old[0].row[field]));assert.ok(!JSON.stringify(evidence).includes('2000000010'));});
 for(const [label,mutate]of [
  ['other_nested_value',x=>{x[0].row[field].nested.stable='changed';}],['other_top_value',x=>{x[0].row.role='changed';}],['new_metadata_key',x=>{x[0].row[field].newKey=true;}],['new_top_key',x=>{x[0].row.newKey=true;}],['new_nested_key',x=>{x[0].row[field].nested.newKey=true;}],['removed_key',x=>{delete x[0].row[field].sub;}],['token_mismatch',x=>{x[0].row[field].exp+=1;}],['nonowned_row',x=>{x[1].row[field].iat=claims.iat;}],['old_iat',x=>{x[0].row[field].iat=old[0].row[field].iat;}],['nonnumeric_iat',x=>{x[0].row[field].iat=String(claims.iat);}],['missing_original_row',x=>{x.splice(1,1);}]
 ])test(field+'_'+label+'_denied',()=>{const x=clone(next);mutate(x);assert.throws(()=>preserveAuthJwtMetadata(old,x,options));});
 test(field+'_missing_allowed_timestamp_safe',()=>{const a=clone(old),b=clone(next);delete a[0].row.last_sign_in_at;delete b[0].row.last_sign_in_at;assert.equal(preserveAuthJwtMetadata(a,b,options).length,1);});
 test(field+'_allowed_timestamp_absence_hashes_explicit',()=>{const a=clone(old),b=clone(next);delete a[0].row.last_sign_in_at;b[0].row.last_sign_in_at='new';const item=preserveAuthJwtMetadata(a,b,options)[0].changedFields.find(x=>x.field==='last_sign_in_at');assert.equal(item.beforeSha256,digest({present:false}));assert.equal(item.afterSha256,digest({present:true,value:'new'}));});
 test(field+'_nonowned_metadata_owner_denied',()=>assert.throws(()=>preserveAuthJwtMetadata(old,next,{...options,metadataOwnerId:'other'})));
}
