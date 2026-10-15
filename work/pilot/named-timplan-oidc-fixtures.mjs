// Real Keycloak -> GoTrue -> Worker on the owned, empty schema-copy database.
// Only random synthetic IdP users and an exact temporary redirect are added to the shared local realm.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {approvedClassFixture} from './verify-class-timplans.mjs';
import {verifyClassCohortCallbackProof} from './phase5-class-cohort-oidc-fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const OTP=createRequire(path.join(root,'web/package.json'))('otpauth');
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function createNamedTimplanOidcFixture({snapshot,runtime,evidenceDir}){
 const db=snapshot.db,baseURL=runtime.baseURL,target=await assertTarget('protected',{requireIdp:true}),runId=randomUUID();
 assert.equal((await db`select current_database() n`)[0].n,snapshot.provenance.database);
 const lock=path.join(root,'work/pilot/targets/protected/idp/named-timplan-run.lock');
 const lockFd=openSync(lock,'wx',0o600);writeFileSync(lockFd,runId);
 const journalPath=path.join(evidenceDir,'oidc-private.json'),journal={runId,users:[],auth:[],redirectAdded:false,cleanup:'pending'},actors={};
 const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});save();
 let client,fixture,closed=false;
 const keycloak=async(route,method='GET',body)=>{
  const auth=await fetch(target.idp.publicUrl+'/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:target.idp.adminUser,password:target.idp.adminPassword}),signal:AbortSignal.timeout(15000)});assert.ok(auth.ok);
  const token=(await auth.json()).access_token;
  const res=await fetch(target.idp.publicUrl+'/admin/realms/'+new URL(target.idp.issuer).pathname.split('/').pop()+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  assert.ok(res.ok,'Local IdP operation rejected: '+res.status);const text=await res.text();return text?JSON.parse(text):null;
 };
 const cleanup=async()=>{
  if(closed)return {runId,cleanup:journal.cleanup,deletedUsers:journal.users.length};
  for(const user of journal.users){const matches=await keycloak('/users?username='+encodeURIComponent(user.username)+'&exact=true');assert.ok(matches.length<=1);if(matches.length){assert.equal(matches[0].username,user.username);if(user.subject)assert.equal(matches[0].id,user.subject);await keycloak('/users/'+matches[0].id,'DELETE');}assert.equal((await keycloak('/users?username='+encodeURIComponent(user.username)+'&exact=true')).length,0);}
  if(journal.redirectAdded){const current=await keycloak('/clients/'+client.id);assert.equal(current.clientId,target.idp.clientId);current.redirectUris=current.redirectUris.filter(x=>x!==baseURL+'/api/auth/callback');await keycloak('/clients/'+client.id,'PUT',current);}
  assert.equal(readFileSync(lock,'utf8'),runId);closeSync(lockFd);unlinkSync(lock);journal.cleanup='complete';closed=true;save();return {runId,cleanup:journal.cleanup,deletedUsers:journal.users.length,redirectRestored:true,verifiedCallbacks:journal.auth.filter(a=>a.status==='verified').length};
 };
 try{
  const clients=await keycloak('/clients?clientId='+encodeURIComponent(target.idp.clientId));assert.equal(clients.length,1);client=clients[0];journal.clientId=client.id;
  if(!client.redirectUris.includes(baseURL+'/api/auth/callback')){journal.redirectAdded=true;save();await keycloak('/clients/'+client.id,'PUT',{...client,redirectUris:[...client.redirectUris,baseURL+'/api/auth/callback']});}
  fixture=await db.begin(async tx=>{await tx`set constraints all deferred`;return approvedClassFixture(tx,'SA25');});
  for(const [role,identityNumber,memberNumber]of [['hm',10,20],['principal',11,21],['principal2',12,22],['admin',13,23]]){
   const username='named-'+runId+'-'+role,password=randomBytes(24).toString('base64url'),email=username+'@synthetic.example.test';
   assert.equal((await keycloak('/users?username='+encodeURIComponent(username)+'&exact=true')).length,0);
   const user={username,password,email,subject:null,identityId:randomUUID(),membershipId:randomUUID(),assignmentId:randomUUID(),role};journal.users.push(user);save();
   await keycloak('/users','POST',{username,email,firstName:'Syntetisk',lastName:'Timplansprov',enabled:true,emailVerified:true,requiredActions:['CONFIGURE_TOTP']});
   const found=await keycloak('/users?username='+encodeURIComponent(username)+'&exact=true');assert.equal(found.length,1);user.subject=found[0].id;save();
   await keycloak('/users/'+user.subject+'/reset-password','PUT',{type:'password',value:password,temporary:false});
   await db.begin(async tx=>{
    await tx`insert into public.identities(id,issuer,subject,display_name,email) values(${user.identityId},${target.idp.issuer},${user.subject},'Syntetisk Timplansprov',${email})`;
    await tx`insert into public.memberships(id,identity_id,customer_id) values(${user.membershipId},${user.identityId},${fixture.id(1)})`;
    const [original]=await tx`select to_jsonb(a) r from public.access_assignments a where id=${fixture.roles[role]} and membership_id=${fixture.id(memberNumber)}`;assert.ok(original);
    if(role==='hm'){
     await tx`insert into public.access_assignments select (jsonb_populate_record(null::public.access_assignments,${tx.json({...original.r,id:user.assignmentId,membership_id:user.membershipId})})).*`;
     await tx`insert into public.mandate_units select ${user.assignmentId}::uuid,customer_id,organizer_id,unit_id from public.mandate_units where assignment_id=${fixture.roles[role]}`;
    }else{
     // The real mandate constructor also creates the new membership's staff binding.
     const units=(await tx`select unit_id from public.mandate_units where assignment_id=${fixture.roles[role]} order by unit_id`).map(r=>r.unit_id);
     user.assignmentId=(await tx`select public.phase3_insert_mandate(${original.r.parent_assignment_id},${tx.json({membershipId:user.membershipId,function:original.r.function,scopeKind:'school',unitIds:units})}) id`)[0].id;
    }
    assert.equal((await tx`select public.assignment_is_valid(a) valid from public.access_assignments a where id=${user.assignmentId}`)[0].valid,true,'Synthetic actor requires a real valid mandate');
   });actors[role]=user;
  }
  const view=async(page,role,select=false)=>{
   const a=actors[role];let r=await page.request.get(baseURL+'/api/session');assert.equal(r.status(),200);let v=await r.json();assert.equal(v.identity.subject,a.subject);
   if(select&&v.context?.assignmentId!==a.assignmentId){r=await page.request.post(baseURL+'/api/context',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(v.epoch)},data:{assignmentId:a.assignmentId}});assert.equal(r.status(),200,'Context selection: '+JSON.stringify(await r.json()));r=await page.request.get(baseURL+'/api/session');v=await r.json();}
   assert.equal(v.context?.assignmentId,a.assignmentId);assert.equal(v.context.valid,true);a.epoch=v.epoch;
   const cookie=(await page.context().cookies(baseURL)).find(c=>c.name==='sp_session');assert.ok(cookie);
   const [s]=await db`select id::text,identity_id::text,context_epoch::int epoch from public.app_sessions where token_hash=${Buffer.from(hash(cookie.value),'hex')}`;assert.equal(s.identity_id,a.identityId);assert.equal(s.epoch,v.epoch);
   return{role,identityId:a.identityId,issuer:target.idp.issuer,subject:a.subject,sessionId:s.id,epoch:v.epoch,mfa:v.mfa.proof};
  };
  const audits=async role=>Array.from(await db`select id::text,source,action,outcome,actor_identity_id::text,actor_issuer,actor_subject,session_id::text,details from public.security_events where actor_identity_id=${actors[role].identityId} and action='login' order by id`);
  const code=async a=>{for(let n=0;n<130;n++){const token=new OTP.TOTP({algorithm:'SHA1',digits:6,period:30,secret:OTP.Secret.fromBase32(a.secret)}).generate();if(token!==a.lastCode){a.lastCode=token;save();return token;}await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Fresh OTP unavailable');};
  const fill=async(page,a)=>{
   const username=page.getByLabel(/Användarnamn|Username/i),password=page.getByRole('textbox',{name:/Lösenord|Password/i}),otp=page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
   await password.waitFor({state:'visible',timeout:15000});if(await username.isVisible())await username.fill(a.username);await password.fill(a.password);await page.getByRole('button',{name:/Logga in|Sign In/i}).click();
   const secret=page.locator('#kc-totp-secret-key'),manual=page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i);
   const next=await Promise.race([secret.waitFor({state:'visible',timeout:15000}).then(()=> 'secret'),manual.waitFor({state:'visible',timeout:15000}).then(()=> 'manual'),otp.waitFor({state:'visible',timeout:15000}).then(()=> 'otp'),page.waitForURL(u=>u.origin===baseURL,{timeout:15000}).then(()=> 'returned')]);
   if(next==='returned')return;
   if(next==='manual')await manual.click();
   if(next!=='otp'){await secret.waitFor({state:'visible'});a.secret=(await secret.innerText()).replaceAll(/\s/gu,'');save();await page.locator('input[name="totp"]').fill(await code(a));const label=page.locator('input[name="userLabel"]');if(await label.isVisible())await label.fill('Isolerat timplansprov');await page.getByRole('button',{name:/Skicka|Spara|Logga in|Submit/i}).click();}
   else{assert.ok(a.secret);await otp.fill(await code(a));await page.getByRole('button',{name:/Logga in|Sign In/i}).click();}
  };
  const login=async(page,role,{stepUp=false,returnTo='/'}={})=>{
   const a=actors[role],before=stepUp?await view(page,role):null,priorAudits=await audits(role),priorSessions=await db`select id::text from public.app_sessions where identity_id=${a.identityId}`;
   const attempt={id:randomUUID(),role,identityId:a.identityId,issuer:target.idp.issuer,subject:a.subject,origin:baseURL,stepUp,priorAuditIds:priorAudits.map(a=>a.id),priorSessionIds:priorSessions.map(s=>s.id),...(before?{sessionId:before.sessionId,epoch:before.epoch}:{}),loginRequests:0};
   const callbacks=[],pending=[];journal.auth.push(attempt);save();
   const observe=req=>{const u=new URL(req.url());if(u.origin!==baseURL)return;if(u.pathname==='/api/auth/login')attempt.loginRequests++;if(u.pathname==='/api/auth/callback'){const c={id:randomUUID(),attemptId:attempt.id,role,origin:u.origin,pathname:u.pathname,method:req.method(),navigation:req.isNavigationRequest(),status:null};callbacks.push(c);pending.push(Promise.race([req.response(),new Promise(resolve=>setTimeout(()=>resolve(null),3000))]).then(r=>{if(r)c.status=r.status();}));}};
   page.context().on('request',observe);
   try{await page.goto(baseURL+'/api/auth/login?'+new URLSearchParams({till:returnTo,...(stepUp?{step_up:'1'}:{})}));await fill(page,a);await page.waitForURL(u=>u.origin===baseURL&&!u.pathname.startsWith('/api/auth'),{timeout:30000});const proof=await view(page,role,true);await Promise.all(pending);
    const verified=verifyClassCohortCallbackProof({attempt,callbacks,audits:(await audits(role)).filter(a=>!attempt.priorAuditIds.includes(a.id)),session:proof,browserReturn:{origin:new URL(page.url()).origin,pathname:new URL(page.url()).pathname}});Object.assign(attempt,{proof:verified,callbacks,status:'verified'});save();
    if(!proof.mfa)return login(page,role,{stepUp:true,returnTo});await page.goto(baseURL+returnTo);return proof;
   }finally{page.context().off('request',observe);}
  };
  const request=async(page,role,route,input,headers={})=>{
   assert.ok(route.startsWith('/api/')&&!route.startsWith('/api/auth'));const r=await page.request.fetch(baseURL+route,{method:input===undefined?'GET':'POST',headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(actors[role].epoch),...headers},...(input===undefined?{}:{data:input}),maxRetries:0});const body=await r.json();return{status:r.status(),body};
  };
  return{scope:{programId:fixture.programId,planId:fixture.planId,unitId:fixture.id(30),secondUnitId:fixture.id(31),offeringId:fixture.id(46),customerId:fixture.id(1),year:fixture.year},actors,login,request,view,cleanup,
   async expireMfa(page,role){const s=await view(page,role);await db`update public.app_sessions set auth_time=now()-interval '9 hours' where id=${s.sessionId} and identity_id=${actors[role].identityId}`;},
   async revoke(role){await db`update public.memberships set status='blocked',blocked_at=now() where id=${actors[role].membershipId} and identity_id=${actors[role].identityId}`;},
   proof:()=>({runId,auth:journal.auth,cleanup:journal.cleanup}),
  };
 }catch(error){try{await cleanup();}catch{journal.cleanup='failed';save();}throw error;}
}
