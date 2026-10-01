// Explicit, additive recovery for missing private local test-code bindings.
// Never removes existing credentials or changes passwords, profiles or mandates.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {TEST_OTP_USERS} from './idp-otp-helper.mjs';

export async function prepareMissingLocalOtpBindings() {
  const manifest=await assertTarget('protected',{requireIdp:true});
  if(manifest.idp.publicUrl!=='http://127.0.0.1:8180'||manifest.idp.containerName!=='skolplattform-pilot-idp')throw Error('local_only');
  const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',manifest.idp.containerName],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  if(!ports['8080/tcp']?.length||ports['8080/tcp'].some(p=>p.HostIp!=='127.0.0.1'||p.HostPort!=='8180'))throw Error('loopback_only');
  const dir=new URL('./targets/protected/idp/',import.meta.url);
  if(!fs.existsSync(new URL('test-buttons-state.json',dir)))throw Error('theme_required');
  const read=name=>{try{const value=JSON.parse(fs.readFileSync(new URL(name,dir),'utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error('invalid_private_file');return value;}catch(e){if(e.code==='ENOENT')return {};throw e;}};
  const seeds=read('totp-users.json'),bindings=read('helper-otp-bindings.json');
  if(Object.values(seeds).some(s=>typeof s!=='string'))throw Error('invalid_private_file');
  const save=(name,value)=>{const file=new URL(name,dir);fs.writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});fs.chmodSync(file,0o600);};
  const require=createRequire(new URL('../../web/package.json',import.meta.url));
  const {Secret}=require('otpauth');
  let token;
  const api=async(path,method='GET',body)=>{
    const response=await fetch(manifest.idp.publicUrl+path,{method,signal:AbortSignal.timeout(15000),headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{ })},...(body?{body:JSON.stringify(body)}:{ })});
    if(!response.ok)throw Error('local_api_failed');
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const auth=await fetch(manifest.idp.publicUrl+'/realms/master/protocol/openid-connect/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:manifest.idp.adminUser,password:manifest.idp.adminPassword})});
  if(!auth.ok)throw Error('local_admin_failed');token=(await auth.json()).access_token;
  const realm='/admin/realms/skolplattform-test',results=[];
  for(const username of TEST_OTP_USERS){
    const account=manifest.idp.users.find(u=>u.username===username&&u.totp);
    if(!account)throw Error('test_account_required');
    if(typeof seeds[username]==='string'&&!bindings[username]){results.push({username,action:'existing_binding_preserved'});continue;}
    const route=realm+'/users/'+encodeURIComponent(account.subject);
    const user=await api(route),previous=await api(route+'/credentials');
    const needsEnrollment=Array.isArray(user.requiredActions)&&user.requiredActions.includes('CONFIGURE_TOTP');
    if(user.id!==account.subject||user.username!==username||user.email!==account.email||user.enabled!==true
      ||previous.filter(c=>c.type==='password').length!==1
      ||previous.filter(c=>c.type==='otp').length===0&&!needsEnrollment)throw Error('account_mismatch');

    let binding=bindings[username];
    if(!binding){
      binding={credentialId:randomUUID(),seed:new Secret({size:20}).base32};
      bindings[username]=binding;save('helper-otp-bindings.json',bindings);
    }
    if(!/^[0-9a-f-]{36}$/.test(binding.credentialId)||!/^\w{32}$/.test(binding.seed))throw Error('invalid_binding');
    if(!previous.some(c=>c.id===binding.credentialId)){
      await api(route,'PUT',{...(needsEnrollment?{requiredActions:user.requiredActions.filter(a=>a!=='CONFIGURE_TOTP')}:{ }),credentials:[{id:binding.credentialId,type:'otp',userLabel:'Lokala provkodsknappen',
        secretData:JSON.stringify({value:binding.seed}),credentialData:JSON.stringify({subType:'totp',digits:6,counter:0,period:30,algorithm:'HmacSHA1',secretEncoding:'BASE32'})}]});
    }
    const after=await api(route+'/credentials');
    const added=after.find(c=>c.id===binding.credentialId&&c.type==='otp');
    if(!added||previous.some(c=>!after.some(a=>JSON.stringify(a)===JSON.stringify(c)))
      ||JSON.stringify(await api(route))!==JSON.stringify(needsEnrollment?{...user,totp:true,requiredActions:user.requiredActions.filter(a=>a!=='CONFIGURE_TOTP')}:user))throw Error('preservation_failed');
    await api(route+'/credentials/'+encodeURIComponent(binding.credentialId)+'/moveToFirst','POST');
    seeds[username]=binding.seed;save('totp-users.json',seeds);
    results.push({username,action:'additive_helper_credential',oldCredentialsPreserved:true,profilePreserved:true,enrollmentCompleted:needsEnrollment});
  }
  return {status:'PASS',scope:'isolated local synthetic IdP',results,
    limitations:['Setup adds a separate local helper OTP registration only where needed; actual OIDC/MFA login still requires separate verification.']};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{if(process.argv.length!==2)throw Error('no_flags');console.log(JSON.stringify(await prepareMissingLocalOtpBindings()));}
  catch(error){const safe=['local_only','loopback_only','theme_required','invalid_private_file','local_api_failed','local_admin_failed','test_account_required','account_mismatch','invalid_binding','preservation_failed'];console.error('Lokal kodbindning kunde inte förberedas:',safe.includes(error?.message)?error.message:'LOCAL_SETUP_FAILED');process.exitCode=1;}
}
