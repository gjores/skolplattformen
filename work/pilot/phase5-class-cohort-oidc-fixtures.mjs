// Real local OIDC, callback and MFA. Never exports or authenticates with the base fixture's minted tokens.
// All writes are restricted to a new synthetic customer and new, journalled IdP users.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openSync,closeSync,writeFileSync,readFileSync,existsSync,statSync,unlinkSync,chmodSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {createProgramplanBrowserFixture} from './phase5-programplan-browser-fixtures.mjs';
import {createGymTimplanFixture} from './phase5-gym-timplan-fixtures.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {vocationalFixture} from './vocational-plan-fixture.mjs';
import {parsePlanDecisionDetail} from '../../web/lib/plan-decision.ts';
import {parseClassCohortStatusReply} from '../../web/lib/class-cohort.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'web/package.json'));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const ident=value=>'"'+value.replaceAll('"','""')+'"';
const PRODUCT=['web/app','web/lib','web/components','web/hooks','web/scripts','web/package.json','web/package-lock.json','web/vite.config.ts','web/vinext.config.ts'];
const ownSources=['work/pilot/phase5-class-cohort-oidc-fixtures.mjs','work/pilot/verify-class-cohort-api.mjs','web/e2e/class-cohort-actual.spec.ts','web/playwright.class-cohort-actual.config.ts','web/e2e/helpers/keycloak.ts'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COHORT='/api/klasser/organisation/';
const commandTables={
 '/api/klasser/organisation/skapa':['class_cohort_commands','actor_identity_id'],
 '/api/klasser/skapa':['class_plan_commands','actor_identity_id'],
 '/api/klasser/koppla':['class_plan_commands','actor_identity_id'],
 '/api/programplaner/utbildning/skapa':['programplan_education_receipts','identity_id'],
 '/api/programplaner/utbildning/kopiera':['programplan_education_receipts','identity_id'],
 '/api/timplaner/gym/skapa':['gym_timplan_receipts','actor_identity_id'],
 '/api/planbeslut/andra':['plan_decision_receipts','actor_identity_id'],
};
export function classCohortApiSourceHashes(){
 const sources=new Set([...git(['ls-files','--',...PRODUCT]).split('\n').filter(Boolean),...ownSources]);
 const visit=relative=>{if(!/\.(?:mjs|ts|tsx)$/u.test(relative))return;const source=readFileSync(path.join(root,relative),'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/gu)){
   const base=path.resolve(root,path.dirname(relative),match[1]);
   const absolute=[base,...['.ts','.tsx','.mjs','.json'].map(ext=>base+ext)].find(p=>existsSync(p)&&statSync(p).isFile());
   if(absolute?.startsWith(root)){const next=path.relative(root,absolute);if(!sources.has(next)){sources.add(next);visit(next);}}
  }
 };for(const source of sources)visit(source);
 return Object.fromEntries([...sources].sort().map(source=>[source,hash(readFileSync(path.join(root,source)))]));
}
export async function verifyClassCohortBuild(baseURL){
 assert.match(baseURL,/^http:\/\/127\.0\.0\.1:\d+$/u);
 const buildRoot=path.resolve(process.env.PHASE5_BUILD_ROOT??'');
 assert.ok(buildRoot.startsWith(path.join(root,'work/pilot/targets/protected/runtime/')),'An owned runtime build is required');
 const mark=JSON.parse(readFileSync(path.join(buildRoot,'build-mode.json'),'utf8'));
 assert.equal(mark.mode,'protected');assert.match(mark.revision,/^[0-9a-f]{40}$/u);
 git(['merge-base','--is-ancestor',mark.revision,'HEAD']);
 assert.equal(git(['status','--porcelain','--',...PRODUCT]),'','Product sources must be committed');
 assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...PRODUCT]),'','Build must contain current product sources');
 const response=await fetch(`${baseURL}/api/health/db`,{signal:AbortSignal.timeout(30000)}),health=await response.json();
 assert.ok(response.ok&&health.ok&&health.role==='skolplattform_worker'&&health.runtime==='workerd');
 const processProof=classCohortProcessProof(baseURL,buildRoot);
 const target=await assertTarget('protected',{requireIdp:true});
 const privateConfig=readFileSync(path.join(buildRoot,'server/.dev.vars'),'utf8');
 const config=Object.fromEntries(privateConfig.split('\n').filter(line=>line.includes('=')).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
 assert.ok(config.DATABASE_URL===target.worker.dbUrl,'Runtime DB binding differs from protected target');
 assert.ok(config.OIDC_ISSUER===target.idp.issuer&&config.OIDC_CLIENT_ID===target.idp.clientId,'Runtime OIDC binding differs');
 assert.ok(config.OIDC_REDIRECT_URI===baseURL+'/api/auth/callback','Runtime callback origin differs');
 processProof.privateConfigurationSha256=hash(privateConfig);processProof.protectedTargetBindingsVerified=true;
 return{baseURL,buildRoot,processProof,buildRevision:mark.revision,builtAt:mark.builtAt,sourceRevision:git(['rev-parse','HEAD']),artifact:artifactManifest(buildRoot),runtime:health.runtime,role:health.role};
}
export function classCohortProcessProof(baseURL,buildRoot){
 const port=new URL(baseURL).port;
 const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const listeners=[...new Set(run('/usr/sbin/lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-Fp']).split('\n').filter(line=>/^p\d+$/u.test(line)).map(line=>Number(line.slice(1))))];
 assert.equal(listeners.length,1,'One owned Worker listener required');
 const worker=run('/bin/ps',['-p',String(listeners[0]),'-o','ppid=,command=']);
 const parent=Number(worker.match(/^\s*(\d+)/u)?.[1]);assert.ok(parent);
 assert.ok(worker.includes('/workerd serve ')&&worker.includes(`--socket-addr=entry=127.0.0.1:${port}`),'Listener must be workerd');
 const parentCommand=run('/bin/ps',['-p',String(parent),'-o','command=']);
 const cwd=run('/usr/sbin/lsof',['-a','-p',String(parent),'-d','cwd','-Fn']).split('\n').find(line=>line.startsWith('n'))?.slice(1);
 assert.ok(cwd);const args=parentCommand.split(/\s+/u);const scriptIndex=args.findIndex(arg=>arg.endsWith('scripts/preview-worker.mjs'));
 assert.ok(scriptIndex>=0&&args.length===scriptIndex+3,'Owned preview-worker command required');
 assert.equal(args[scriptIndex+2],port);const configPath=path.resolve(cwd,args[scriptIndex+1]);
 assert.equal(configPath,path.join(buildRoot,'server/wrangler.json'),'Listener does not use supplied build artifact');
 const scriptPath=path.resolve(cwd,args[scriptIndex]);
 assert.equal(hash(readFileSync(scriptPath)),hash(readFileSync(path.join(root,'web/scripts/preview-worker.mjs'))),'Preview source differs');
 assert.equal(hash(readFileSync(path.join(path.dirname(scriptPath),'preview-worker-modules.mjs'))),hash(readFileSync(path.join(root,'web/scripts/preview-worker-modules.mjs'))));
 return{workerPid:listeners[0],previewPid:parent,port:Number(port),cwd,scriptPath,configPath,previewSourceSha256:hash(readFileSync(scriptPath))};
}
function readJson(file,fallback){return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):fallback;}
function privateWrite(file,value){writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(file,0o600);}
function success(response){assert.equal(response.status,200,`API rejected: ${response.body?.code??response.status}`);return response.body;}
async function snapshots(db){
 const result={};
 const tables=await db`select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='auth' and tablename in ('sessions','refresh_tokens')) order by schemaname,tablename`;
 for(const t of tables){if(t.schemaname==='public'&&['identities','security_events'].includes(t.tablename))continue;
  const [row]=await db.unsafe(`select count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),''),'UTF8')),'hex') sha256 from ${ident(t.schemaname)}.${ident(t.tablename)} t`);
  result[`${t.schemaname}.${t.tablename}`]=row;
 }return result;
}
async function anchorSnapshot(db){
 const result={};for(const table of ['public.identities','public.security_events','auth.users','auth.identities','auth.audit_log_entries'])
  result[table]=await db.unsafe(`select id::text,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') hash from ${table} t order by id::text`);
 return result;
}
function preserveAnchors(before,after){for(const table of Object.keys(before)){const current=new Map(after[table].map(row=>[row.id,row.hash]));for(const row of before[table])assert.equal(current.get(row.id),row.hash,`Original anchor changed: ${table}`);}}

/** evidencePath is this run's unique private output; the applied SQL proof is a separate input. */
export async function createClassCohortOidcFixture({baseURL,evidencePath,evidenceDir,sqlEvidencePath=process.env.CLASS_COHORT_SQL_EVIDENCE_PATH}){
 assert.ok(path.isAbsolute(evidenceDir)&&path.resolve(evidenceDir).startsWith('/private/tmp/'),'Private evidence directory required');
 assert.ok(statSync(evidenceDir).isDirectory()&&(statSync(evidenceDir).mode&0o077)===0,'Evidence directory must be mode 0700');
 assert.ok(path.resolve(evidencePath).startsWith(path.resolve(evidenceDir)+path.sep)&&evidencePath.endsWith('.json'));
 const reportFd=openSync(evidencePath,'wx',0o600);closeSync(reportFd);
 const runId=randomUUID(),journalPath=path.join(evidenceDir,`${runId}-private-journal.json`);
 const report={kind:'class-cohort-real-oidc-fixture',runId,status:'FAIL',scope:'local-synthetic-only',stage:'initializing',startedAt:new Date().toISOString()};
 const journal={runId,users:[],commands:[],sessions:[],authSessions:[]};
 const save=()=>{privateWrite(journalPath,journal);privateWrite(evidencePath,report);};save();
 const target=await assertTarget('protected',{requireIdp:true});
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const manifestPath=path.join(root,'work/pilot/targets/protected/manifest.json');
 const lockPath=path.join(root,'work/pilot/targets/protected/idp/class-cohort-run.lock');
 const secretPaths=['totp-users.json','totp-last-used.json'].map(name=>path.join(root,'work/pilot/targets/protected/idp',name));
 let lockFd,base,foreign,foreignOriginal,closed=false,quiescing=false,initial,anchors,sourceHashes,buildProof,sqlProof,identitySetup=false;
 let manifestOriginal,secretOriginal;
 const actors={},contexts=new Map(),pages=new Map(),inflight=new Set(),observerErrors=[],callbacks=[];
 const ownOfferings=new Set(),ownPlans=new Set(),ownClasses=new Set(),ownGyms=new Set();
 const enqueue=promise=>{inflight.add(promise);promise.catch(error=>observerErrors.push(error)).finally(()=>inflight.delete(promise));return promise;};
 const drain=async()=>{while(inflight.size)await Promise.allSettled(inflight);if(observerErrors.length)throw Error('An observed request could not be journalled');};
 const keycloak=async(route,method='GET',body)=>{
  const auth=await fetch(`${target.idp.publicUrl}/realms/master/protocol/openid-connect/token`,{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:target.idp.adminUser,password:target.idp.adminPassword}),signal:AbortSignal.timeout(15000)});
  assert.ok(auth.ok,'IdP administration authentication failed');const {access_token:token}=await auth.json();
  const response=await fetch(`${target.idp.publicUrl}/admin/realms/${new URL(target.idp.issuer).pathname.split('/').pop()}${route}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,`Own IdP operation rejected (${response.status})`);const text=await response.text();return text?JSON.parse(text):null;
 };
 const roleActor=role=>{assert.ok(actors[role],'Unknown fixture role');return actors[role];};
 const owned=async tx=>{const [row]=await tx`select id from public.customers where id=${base.customerId} and name='Syntetiskt programplansprov'`;assert.ok(row,'Own fixture marker missing');};
 const record=(role,route,input)=>{
  if(!commandTables[route]||!input||!uuid.test(input.commandId??''))return null;
  const actor=roleActor(role),existing=journal.commands.find(c=>c.role===role&&c.route===route&&canonical(c.input)===canonical(input));
  if(existing)return existing;
  const entry={role,route,input:structuredClone(input),identityId:actor.identityId,assignmentId:actor.assignmentId,state:'unknown'};
  journal.commands.push(entry);save();return entry;
 };
 const observeResult=(entry,body,status)=>{if(!entry)return;entry.httpStatus=status;if(status===200){entry.state='committed';entry.response=body;
  if(body.education?.id)ownOfferings.add(body.education.id);if(body.plan?.id)ownPlans.add(body.plan.id);if(entry.route==='/api/timplaner/gym/skapa'&&body.id)ownGyms.add(body.id);
  if(entry.route===COHORT+'skapa')for(const row of body.classes??[])ownClasses.add(row.id);
  if(entry.route==='/api/klasser/skapa'&&body.id)ownClasses.add(body.id);
 }else if(status<500)entry.state='rejected';save();};
 const normalized=(entry)=>{
  const input=structuredClone(entry.input);
  if(entry.route==='/api/klasser/koppla')input.operation='link';if(entry.route==='/api/klasser/skapa')input.operation='create';
  if(entry.route.startsWith('/api/programplaner/utbildning/')){input.name=input.name.trim();input.cohort=input.cohort.trim();input.localCode=input.localCode===null?null:input.localCode.trim();}
  return input;
 };
 const ownSession=async(context,role)=>{
  const actor=roleActor(role),cookies=await context.cookies(baseURL),cookie=cookies.find(c=>c.name==='sp_session');assert.ok(cookie,'Real callback cookie missing');
  const tokenHash=createHash('sha256').update(cookie.value).digest();
  const [row]=await db`select id::text,identity_id::text,membership_id::text,assignment_id::text,context_epoch::int epoch from public.app_sessions where token_hash=${tokenHash}`;
  assert.ok(row&&row.identity_id===actor.identityId,'Callback session is not owned by this OIDC identity');
  if(!journal.sessions.some(s=>s.id===row.id)){journal.sessions.push({id:row.id,identityId:actor.identityId,role});save();}
  return row;
 };
 const sessionView=async(context,role,{select=false,requireMfa=false}={})=>{
  const actor=roleActor(role);let response=await context.request.get(`${baseURL}/api/session`);assert.equal(response.status(),200);let view=await response.json();
  assert.equal(view.identity.issuer,target.idp.issuer);assert.equal(view.identity.subject,actor.subject);
  assert.ok(view.assignments.some(a=>a.id===actor.assignmentId&&a.membershipId===actor.membershipId&&a.customerId===base.customerId&&a.serverValid));
  if(select&&view.context?.assignmentId!==actor.assignmentId){response=await context.request.post(`${baseURL}/api/context`,{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)},data:{assignmentId:actor.assignmentId}});assert.equal(response.status(),200);response=await context.request.get(`${baseURL}/api/session`);assert.equal(response.status(),200);view=await response.json();}
  assert.equal(view.context?.assignmentId,actor.assignmentId);assert.equal(view.context?.membershipId,actor.membershipId);assert.equal(view.context?.customerId,base.customerId);assert.equal(view.context?.valid,true);
  if(requireMfa)assert.equal(view.mfa.proof,true,'Actual server MFA proof missing');
  const s=await ownSession(context,role);assert.equal(s.assignment_id,actor.assignmentId);assert.equal(s.membership_id,actor.membershipId);assert.equal(s.epoch,view.epoch);
  contexts.set(role,context);actor.epoch=view.epoch;return{role,identityId:actor.identityId,membershipId:actor.membershipId,assignmentId:actor.assignmentId,sessionId:s.id,epoch:view.epoch,mfa:view.mfa.proof};
 };
 const request=async(context,role,route,input,options={})=>{
  assert.ok(route.startsWith('/api/'),'Only application API routes allowed');const actor=roleActor(role);assert.equal(contexts.get(role),context,'Context must first complete real OIDC login');
  const entry=record(role,route,input);
  const pending=(async()=>{const response=await context.request.fetch(`${options.baseURL??baseURL}${route}`,{method:input===undefined?'GET':'POST',headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(actor.epoch),...options.headers},...(input===undefined?{}:{data:input}),timeout:30000,maxRetries:0});
   const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={code:'non_json_response'};}
   observeResult(entry,body,response.status());if(response.status()===200&&route==='/api/programplaner/klona'){assert.ok(uuid.test(body.id));ownPlans.add(body.id);journal.clonedPlans??=[];journal.clonedPlans.push({role,input,result:body});save();}return{status:response.status(),body,correlationId:response.headers()['x-correlation-id']??null,epoch:response.headers()['x-context-epoch']??null};
  })();inflight.add(pending);pending.finally(()=>inflight.delete(pending)).catch(()=>{});return pending;
 };
 const trackPage=(page,role)=>{
  if(pages.has(page))return;roleActor(role);assert.ok(!quiescing);pages.set(page,role);
  page.on('request',req=>{try{const url=new URL(req.url());if(url.origin!==baseURL)return;if(url.pathname==='/api/auth/callback'){callbacks.push({role,state:'pending',request:req});}if(req.method()==='POST')record(role,url.pathname,req.postDataJSON());}catch{observerErrors.push(Error('Request observation failed'));}});
  page.on('response',response=>{if(new URL(response.url()).origin!==baseURL)return;const pathname=new URL(response.url()).pathname;
   if(pathname==='/api/auth/callback'){const callback=callbacks.find(c=>c.request===response.request());assert.ok(callback,'Callback request observation missing');callback.status=response.status();callback.state='completed';}
   if(response.request().method()==='POST'&&commandTables[pathname])enqueue((async()=>{const entry=record(role,pathname,response.request().postDataJSON());const body=await response.json().catch(()=>null);observeResult(entry,body,response.status());})());
  });
 };
 const captureAuth=async()=>{
  const identityIds=Object.values(actors).map(a=>a.identityId);
  if(!identityIds.length)return;
  const rows=await db`select s.id::text,s.user_id::text from auth.sessions s join public.identities i on i.auth_user_id=s.user_id where i.id=any(${identityIds}::uuid[])`;
  for(const row of rows)if(!journal.authSessions.some(s=>s.id===row.id))journal.authSessions.push(row);save();
 };
 const login=async(page,role,{stepUp=true}={})=>{
  assert.ok(!quiescing);const actor=roleActor(role);trackPage(page,role);const context=page.context();assert.ok(![...contexts.values()].includes(context),'Use a fresh browser context per identity');
  const {loginViaKeycloak}=await import('../../web/e2e/helpers/keycloak.ts');
  const steps=await loginViaKeycloak(page,actor.username,{password:actor.password});
  let proof=await sessionView(context,role,{select:true});
  if(stepUp&&!proof.mfa){steps.push(...await loginViaKeycloak(page,actor.username,{password:actor.password,stepUp:true}));proof=await sessionView(context,role,{requireMfa:true});}
  await captureAuth();await page.goto(baseURL+'/');return{...proof,steps,realOidcCallback:callbacks.some(c=>c.role===role&&c.status>=300&&c.status<400)};
 };
 const completeStepUp=async(page,role)=>{
  const actor=roleActor(role),before=await ownSession(page.context(),role);
  await page.waitForURL(url=>url.origin===new URL(target.idp.issuer).origin);
  const {fillKeycloakLogin}=await import('../../web/e2e/helpers/keycloak.ts');const steps=await fillKeycloakLogin(page,actor.username,actor.password);
  await page.waitForURL(url=>url.origin===baseURL&&!url.pathname.startsWith('/api/auth'),{timeout:30000});
  const proof=await sessionView(page.context(),role,{requireMfa:true});assert.equal(proof.sessionId,before.id);assert.equal(proof.epoch,before.epoch);await captureAuth();return{...proof,steps,realOidcCallback:true};
 };
 const expireMfa=async(context,role)=>{
  const s=await ownSession(context,role);await assertTarget('protected');await owned(db);
  const changed=await db`update public.app_sessions set auth_time=now()-interval '1 day' where id=${s.id} and identity_id=${roleActor(role).identityId} returning id`;
  assert.equal(changed.length,1);assert.equal((await sessionView(context,role)).mfa,false);return{sessionId:s.id,syntheticProofAge:true};
 };
 const resolvePending=async(context,role)=>{
  for(const entry of journal.commands.filter(c=>c.role===role&&c.state==='unknown')){
   if(entry.route===COHORT+'skapa'){
    const r=await request(context,role,COHORT+'status',entry.input);const status=parseClassCohortStatusReply(success(r),entry.input);
    entry.state=status.status==='found'?'committed':'not_found';entry.resolution='real_http_status';if(status.receipt){entry.response=status.receipt;for(const c of status.receipt.classes)ownClasses.add(c.id);}save();
   }
  }
 };
 const profile=()=>vocationalFixture(JSON.parse(readFileSync(path.join(root,'web/lib/programplan-catalog.generated.json'),'utf8')),'BF25',base.catalogId);
 const basis=({startedOn}={})=>({...profile().reference,...(startedOn?{startedOn}:{})});
 const prepareEducation=async(hmContext,principalContext,{name,startedOn})=>{
  const reference=basis({startedOn});const created=success(await request(hmContext,'hm','/api/programplaner/utbildning/skapa',{commandId:randomUUID(),unitId:base.unitId,name,localCode:null,cohort:'Syntetisk framtida kull',basisReference:reference}));
  // This is an education draft. Class creation precedes approval and any timplan.
  return{planId:created.plan.id,offeringId:created.education.id,unitId:base.unitId,startedOn:reference.startedOn,reference};
 };
 const readDecision=async(context,role,kind,planId)=>parsePlanDecisionDetail(success(await request(context,role,'/api/planbeslut/underlag',{kind,planId})),{kind,planId});
 const decide=async(context,role,detail,action)=>success(await request(context,role,'/api/planbeslut/andra',{commandId:randomUUID(),kind:detail.kind,planId:detail.planId,action,expectedRevision:detail.revision,expectedDecisionRevision:detail.decisionRevision,basisHash:detail.basisHash,comment:'',confirmedChecks:detail.checks.map(c=>c.id)}));
 const approveProgramplan=async({hm,principal},{planId,offeringId})=>{
  await owned(db);const [p]=await db`select revision,status,basis_reference from public.point_plans where id=${planId} and offering_id=${offeringId} and organizer_id=${base.organizerId}`;assert.ok(p);
  if(p.status==='utkast'){
   const full=basis({startedOn:p.basis_reference.startedOn});assert.deepEqual(p.basis_reference.programRef,full.programRef);assert.equal(p.basis_reference.orientationCode,full.orientationCode);
   let revision=p.revision;if(canonical(p.basis_reference.choiceBlocks)!==canonical(full.choiceBlocks))revision=success(await request(principal,'principal','/api/programplaner/block',{planId,expectedRevision:revision,choiceBlocks:full.choiceBlocks})).revision;
   success(await request(principal,'principal','/api/programplaner/terminer',{planId,expectedRevision:revision,distribution:profile().terms}));
   await decide(principal,'principal',await readDecision(principal,'principal','programplan',planId),'submit');await decide(hm,'hm',await readDecision(hm,'hm','programplan',planId),'approve');
  }
  return readDecision(principal,'principal','programplan',planId);
 };
 const approveTimplan=async({hm,principal},{planId,offeringId,unitId,predecessorPlanId=null,expectedPredecessorRevision=null})=>{
  const source=await approveProgramplan({hm,principal},{planId,offeringId});
  const [o]=await db`select lifecycle_revision from public.offerings where id=${offeringId} and organizer_id=${base.organizerId}`;assert.ok(o);
  let gym=success(await request(principal,'principal','/api/timplaner/gym/skapa',{commandId:randomUUID(),sourcePlanId:planId,expectedSourceRevision:source.revision,expectedEducationRevision:o.lifecycle_revision,unitId,predecessorPlanId,expectedPredecessorRevision}));
  let detail=success(await request(principal,'principal','/api/timplaner/gym/lasa',{planId:gym.id}));
  if(!predecessorPlanId){let revision=detail.revision;for(const row of detail.rows)revision=success(await request(principal,'principal','/api/timplaner/gym/rad',{planId:gym.id,expectedRevision:revision,rowKey:row.key,hours:row.pointTerms.map(points=>points>0?points:null)})).revision;}
  await decide(principal,'principal',await readDecision(principal,'principal','timplan',gym.id),'submit');await decide(hm,'hm',await readDecision(hm,'hm','timplan',gym.id),'approve');
  gym=success(await request(principal,'principal','/api/timplaner/gym/lasa',{planId:gym.id}));return gym;
 };
 const receiptProof=async tx=>{
  const entries=journal.commands,proof=[];
  for(const [table,actorColumn]of new Map(Object.values(commandTables).map(pair=>[pair[0],pair[1]]))){
   const ids=[...new Set(entries.filter(e=>commandTables[e.route][0]===table).map(e=>e.input.commandId))];
   const rows=await tx.unsafe(`select * from public.${ident(table)} where ${ident(actorColumn)}=any($1::uuid[]) or command_id=any($2::uuid[])`,[Object.values(actors).map(a=>a.identityId),ids]);
   for(const row of rows){if(row.organizer_id!==undefined)assert.equal(row.organizer_id,base.organizerId,'Foreign command receipt must never be removed');
    const matches=entries.filter(e=>commandTables[e.route][0]===table&&e.input.commandId===row.command_id&&e.identityId===row[actorColumn]&&(!row.assignment_id||e.assignmentId===row.assignment_id)&&canonical(normalized(e))===canonical(row.request));
    assert.ok(matches.length,'Unjournalled or mismatched receipt must never be removed');
    for(const entry of matches){entry.state='committed';entry.resolution??='locked_database_receipt';const reply=row.reply??row.initial_result??row.result;entry.response=reply;
     if(reply?.education?.id)ownOfferings.add(reply.education.id);if(reply?.plan?.id)ownPlans.add(reply.plan.id);if(table==='gym_timplan_receipts'&&reply?.id)ownGyms.add(reply.id);
     if(table==='class_cohort_commands')for(const c of reply.classes)ownClasses.add(c.id);
     if(table==='class_plan_commands'&&entry.route.endsWith('/skapa'))ownClasses.add(reply.id);
    }
    proof.push({table,commandId:row.command_id,actorMatches:true,assignmentMatches:!row.assignment_id||matches.some(e=>e.assignmentId===row.assignment_id),requestSha256:hash(canonical(row.request))});
   }
   // Locked absence is conclusive for a completed request; all web contexts are closed before this pass.
   for(const entry of entries.filter(e=>commandTables[e.route][0]===table&&e.state==='unknown')){
    assert.ok(!rows.some(row=>row.command_id===entry.input.commandId),'Unknown command collided with another actor or request');entry.state='not_found';entry.resolution='locked_database_absence';
   }
  }
  save();return proof;
 };
 let failureTrigger=null;
 const clearAuditFailure=async()=>{if(!failureTrigger)return;await owned(db);await db.unsafe(`drop trigger ${ident(failureTrigger)} on public.security_events;drop function public.${ident(failureTrigger)}()`);failureTrigger=null;};
 const auditFailure=async(source='worker')=>{
  assert.ok(['worker','db'].includes(source));assert.equal(failureTrigger,null);await owned(db);
  const name='cohort_oidc_fail_'+runId.replaceAll('-','');
  await db.unsafe(`create function public.${ident(name)}() returns trigger language plpgsql as $$begin if new.customer_id='${base.customerId}'::uuid and new.source='${source}' and new.action='class_cohort_created' and new.outcome='ok' then raise exception 'Synthetic mandatory audit failure'; end if;return new;end$$;create trigger ${ident(name)} before insert on public.security_events for each row execute function public.${ident(name)}()`);failureTrigger=name;
 };
 const inspect=async(offeringId)=>{
  await owned(db);const [offering]=await db`select id,organizer_id,lifecycle_revision from public.offerings where id=${offeringId} and organizer_id=${base.organizerId}`;assert.ok(offering);
  const value={offering,classes:await db`select id::text,name,start_year,starts_on::text,ends_on::text,validity_source from public.school_classes where offering_id=${offeringId} order by id`,
   links:await db`select to_jsonb(l) row from public.class_timplans l join public.school_classes c on c.id=l.class_id where c.offering_id=${offeringId} order by l.unit_id,l.class_name,l.start_year`,
   memberships:await db`select to_jsonb(m) row from public.pupil_class_memberships m join public.school_classes c on c.id=m.class_id where c.offering_id=${offeringId} order by m.id`,
   receipts:await db`select command_id::text,request,reply from public.class_cohort_commands where actor_identity_id=any(${Object.values(actors).map(a=>a.identityId)}::uuid[]) and request->>'offeringId'=${offeringId} order by command_id`,
   placements:await db`select to_jsonb(p) row from public.pupil_placements p where p.offering_id=${offeringId} order by p.id`};
  // postgres.js Result extends Array; the public fixture contract exposes plain row arrays.
  return Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,Array.isArray(rows)?Array.from(rows):rows]));
 };
 const audit=async(correlationId)=>{
  assert.match(correlationId,uuid);return Array.from(await db`select source,action,outcome,actor_identity_id::text,membership_id::text,assignment_id::text,session_id::text,customer_id::text,object_type,object_id,details from public.security_events where correlation_id=${correlationId} and customer_id=${base.customerId} order by source,action`);
 };
 const cleanup=async()=>{
  assert.equal(closed,false,'Fixture already closed');quiescing=true;let failure,cleanupEvidence,retainedAnchors;
  try{
   report.stage='quiescing';save();for(const page of pages.keys())await page.close({runBeforeUnload:false});await drain();assert.equal(callbacks.filter(c=>c.state!=='completed').length,0,'Unfinished callback: preserve journal before any business cleanup');
   for(const [role,context]of contexts)await resolvePending(context,role);await drain();
   await captureAuth();for(const context of new Set(contexts.values()))await context.close();
   await clearAuditFailure();await assertTarget('protected');
   if(base){
    // Every managed session originates from the real callback. Also capture sessions from a callback
    // that completed just before an assertion failed; identities are exclusively this fixture's.
    const actorIds=Object.values(actors).map(a=>a.identityId);
    const realSessions=actorIds.length?await db`select id::text,identity_id::text from public.app_sessions where identity_id=any(${actorIds}::uuid[])`:[];
    for(const s of realSessions)if(!journal.sessions.some(v=>v.id===s.id))journal.sessions.push({id:s.id,identityId:s.identity_id,role:Object.entries(actors).find(([,a])=>a.identityId===s.identity_id)?.[0]});
    await captureAuth();save();
    cleanupEvidence=await db.begin(async tx=>{
     await tx`set local lock_timeout='15s'`;await tx`set local statement_timeout='30s'`;
     // Same session -> customer lock order as protected commands. Contexts/pages are already closed.
     const sessionIds=journal.sessions.map(s=>s.id);
     await tx`select id from public.app_sessions where id=any(${sessionIds}::uuid[]) order by id for update`;
     await owned(tx);await tx`select public.phase3_lock_customer(${base.customerId})`;
     for(const entry of [...journal.commands].sort((a,b)=>a.input.commandId.localeCompare(b.input.commandId))){
      const seed=entry.route.startsWith(COHORT)?5523:entry.route.startsWith('/api/klasser/')?5521:entry.route.startsWith('/api/programplaner/utbildning/')?515:null;
      if(seed!==null)await tx`select pg_advisory_xact_lock(hashtextextended(${entry.input.commandId.toLowerCase()},${seed}::bigint))`;
     }
     const receipts=await receiptProof(tx);assert.equal(journal.commands.filter(e=>e.state==='unknown').length,0);
     for(const [table,allowed]of [['offerings',ownOfferings],['point_plans',ownPlans],['timplans',ownGyms]]){
      const rows=await tx.unsafe(`select id::text from public.${ident(table)} where organizer_id=$1`,[base.organizerId]);assert.ok(rows.every(row=>allowed.has(row.id)),`Unjournalled owned-graph row: ${table}`);
     }
     const classes=await tx`select id::text from public.school_classes where organizer_id=${base.organizerId}`;
     assert.ok(classes.every(c=>ownClasses.has(c.id)),'Unjournalled class cannot be removed');
     const cross=await tx`select l.class_id from public.class_timplans l join public.school_classes c on c.id=l.class_id join public.timplans t on t.id=l.timplan_id where (c.organizer_id=${base.organizerId} or t.organizer_id=${base.organizerId}) and (c.organizer_id<>${base.organizerId} or t.organizer_id<>${base.organizerId})`;
     assert.equal(cross.length,0,'Foreign class link');
     assert.equal((await tx`select id from public.pupil_class_memberships where class_id=any(${classes.map(c=>c.id)}::uuid[])`).length,0,'Unexpected pupil membership');
     assert.equal((await tx`select id from public.pupil_placements where organizer_id=${base.organizerId}`).length,0,'Unexpected pupil placement');
     const ownAuthUsers=(await tx`select auth_user_id::text id from public.identities where id=any(${actorIds}::uuid[]) and auth_user_id is not null`).map(r=>r.id);
     const authIds=journal.authSessions.map(s=>s.id),authRows=await tx`select id::text,user_id::text from auth.sessions where id=any(${authIds}::uuid[])`;
     assert.ok(authRows.every(s=>ownAuthUsers.includes(s.user_id)),'Foreign GoTrue session');
     await tx`set local session_replication_role=replica`;
     await tx`delete from auth.refresh_tokens where session_id=any(${authIds}::uuid[])`;
     await tx`delete from auth.sessions where id=any(${authIds}::uuid[])`;
     await tx`delete from public.app_sessions where id=any(${sessionIds}::uuid[]) and identity_id=any(${actorIds}::uuid[])`;
     for(const table of new Set(Object.values(commandTables).map(v=>v[0]))){const ids=receipts.filter(r=>r.table===table).map(r=>r.commandId);await tx.unsafe(`delete from public.${ident(table)} where command_id=any($1::uuid[]) and ${ident(new Map(Object.values(commandTables).map(pair=>[pair[0],pair[1]])).get(table))}=any($2::uuid[])`,[ids,Object.values(actors).map(a=>a.identityId)]);}
     await tx`delete from public.plan_decision_history where organizer_id=${base.organizerId}`;
     await tx`delete from public.plan_decision_reviews where plan_id in(select id from public.point_plans where organizer_id=${base.organizerId} union select id from public.timplans where organizer_id=${base.organizerId})`;
     assert.equal((await tx`select * from public.plan_decision_write_permits where plan_id in(select id from public.point_plans where organizer_id=${base.organizerId} union select id from public.timplans where organizer_id=${base.organizerId})`).length,0);
     return{closedPages:pages.size,closedContexts:contexts.size,pendingBeforeDelete:inflight.size,unresolvedCommands:0,receipts,realAppSessionsRemoved:sessionIds.length,gotrueSessionsRemoved:authIds.length};
    });
    const ownIdentityIds=Object.values(actors).flatMap(a=>[a.identityId,a.originalIdentityId]);
    retainedAnchors=await db`select i.id::text,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex') hash from public.identities i where i.id=any(${ownIdentityIds}::uuid[]) and exists(select 1 from public.security_events e where e.actor_identity_id=i.id) order by i.id`;
    cleanupEvidence.base=await base.cleanup();
    const retainedAfter=await db`select i.id::text,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex') hash from public.identities i where i.id=any(${retainedAnchors.map(a=>a.id)}::uuid[]) order by i.id`;
    assert.deepEqual(retainedAfter,retainedAnchors,'Old/new own audited identity anchors changed');cleanupEvidence.retainedAuditedOwnAnchors=retainedAfter;
   }
   if(foreign){assert.deepEqual(await foreign.readOwnedGraph(),foreignOriginal,'Controlled second customer was mutated');const foreignCleanup=await foreign.cleanup();cleanupEvidence={...cleanupEvidence,controlledForeignCustomer:foreignCleanup};
   }
   // Only exact newly created subjects may be deleted. Existing users and their credentials are never modified.
   for(const actor of journal.users){
    if(!actor.subject){const found=await keycloak(`/users?username=${encodeURIComponent(actor.username)}&exact=true`);assert.ok(found.length<=1);if(!found.length)continue;actor.subject=found[0].id;save();}
    const current=await keycloak(`/users/${actor.subject}`);assert.equal(current.username,actor.username);assert.equal(current.id,actor.subject);await keycloak(`/users/${actor.subject}`,'DELETE');
   }
   if(identitySetup){const current=readJson(manifestPath,null),usernames=new Set(journal.users.map(a=>a.username));
    for(const original of manifestOriginal.idp.users)assert.deepEqual(current.idp.users.find(u=>u.username===original.username),original,'Original IdP manifest entry changed');
    current.idp.users=current.idp.users.filter(u=>!usernames.has(u.username));privateWrite(manifestPath,current);
    for(const [index,file]of secretPaths.entries()){const stored=readJson(file,{});for(const [key,value]of Object.entries(secretOriginal[index]))assert.equal(stored[key],value,'Original OTP entry changed');for(const username of usernames)delete stored[username];if(Object.keys(stored).length||existsSync(file))privateWrite(file,stored);}
   }
   if(initial){const after=await snapshots(db);assert.deepEqual(after,initial,'Original business/session rows changed');preserveAnchors(anchors,await anchorSnapshot(db));
    if(base){const ids=Object.values(actors).map(a=>a.identityId);assert.equal((await db`select id from public.identities where id=any(${ids}::uuid[])`).length,ids.length,'New identity anchors must remain');}
    cleanupEvidence={...cleanupEvidence,originalBusinessPreserved:true,originalAnchorsPreserved:true,before:initial,after};
   }
   const finalSourceHashes=classCohortApiSourceHashes(),finalBuildProof=await verifyClassCohortBuild(baseURL);
   assert.deepEqual(finalSourceHashes,sourceHashes,'Verifier/product sources changed during run');assert.deepEqual(finalBuildProof.artifact,buildProof.artifact,'Built artifact changed');
   const {requireAppliedEvidence}=await import('./verify-class-cohort.mjs');const finalSql=await requireAppliedEvidence({evidencePath:sqlEvidencePath,db,target});assert.deepEqual(finalSql,sqlProof);
   Object.assign(report,{status:'PASS',stage:'cleaned',cleanup:cleanupEvidence,finalSourceHashes,finalBuildProof,sqlProof,callbacks:callbacks.map(({role,state,status})=>({role,state,status})),commands:journal.commands.map(e=>({commandId:e.input.commandId,route:e.route,role:e.role,state:e.state,resolution:e.resolution,requestSha256:hash(canonical(e.input))})),finishedAt:new Date().toISOString()});save();
  }catch(error){failure=error;Object.assign(report,{status:'FAIL',stage:'cleanup_failed',failureCode:error.code??'ASSERTION',cleanup:cleanupEvidence});save();}
  finally{closed=true;await db.end({timeout:5});if(lockFd!==undefined){closeSync(lockFd);if(!failure)unlinkSync(lockPath);}}
  if(failure)throw failure;return{...cleanupEvidence,sourceUnchanged:true,artifactUnchanged:true,sqlEvidenceSha256:sqlProof.evidenceSha256,evidencePath,evidenceSha256:hash(readFileSync(evidencePath))};
 };
 try{
  lockFd=openSync(lockPath,'wx',0o600);writeFileSync(lockFd,JSON.stringify({runId,journalPath})+'\n');
  assert.equal((await db`select pg_try_advisory_lock(5520) acquired`)[0].acquired,true,'Another SQL/apply/HTTP verifier owns this target');
  const {requireAppliedEvidence}=await import('./verify-class-cohort.mjs');assert.ok(sqlEvidencePath,'Applied SQL evidence path required');
  sqlProof=await requireAppliedEvidence({evidencePath:sqlEvidencePath,db,target});buildProof=await verifyClassCohortBuild(baseURL);sourceHashes=classCohortApiSourceHashes();
  initial=await snapshots(db);anchors=await anchorSnapshot(db);manifestOriginal=readJson(manifestPath,null);secretOriginal=secretPaths.map(file=>readJson(file,{}));
  foreign=await createProgramplanBrowserFixture();
  const foreignRows=async()=>({offerings:await db`select to_jsonb(o) row from public.offerings o where organizer_id=${foreign.customerId.slice(0,8)+'-0000-4000-8000-000000000002'} order by id`,plans:await db`select to_jsonb(p) row from public.point_plans p where organizer_id=${foreign.customerId.slice(0,8)+'-0000-4000-8000-000000000002'} order by id`});
  foreignOriginal=await foreignRows();foreign.readOwnedGraph=foreignRows;
  base=await createGymTimplanFixture();
  for(const row of await db`select id::text from public.offerings where organizer_id=${base.organizerId}`)ownOfferings.add(row.id);
  for(const row of await db`select id::text from public.point_plans where organizer_id=${base.organizerId}`)ownPlans.add(row.id);
  for(const row of await db`select id::text from public.timplans where organizer_id=${base.organizerId}`)ownGyms.add(row.id);
  journal.baseGraph={offeringIds:[...ownOfferings],planIds:[...ownPlans],gymIds:[...ownGyms]};save();
  // The reusable SQL scaffolding includes twelve sessions. Their composite FK intentionally
  // prevents rebinding a membership while any old-identity session remains. Remove only
  // these exact, unused and unreferenced scaffolding sessions with normal FK enforcement.
  const scaffoldRoles=['principal','second','hm','noMfa','hmNoMfa','principalB','partialHm','admin'];
  const scaffold=scaffoldRoles.map(role=>({...base[role],tokenHash:createHash('sha256').update(base[role].token).digest()}));
  for(const [index,role]of ['hm','principal','second','admin'].entries()){
   const id=`${base.customerId.slice(0,8)}-0000-4000-8000-${String(80+index).padStart(12,'0')}`;
   scaffold.push({...base[role],id,tokenHash:Buffer.from(createHash('md5').update(id).digest('hex').repeat(2),'hex')});
  }
  journal.scaffoldingSessions=scaffold.map(s=>({id:s.id,identityId:s.identityId,membershipId:s.membershipId,assignmentId:s.assignmentId}));save();
  report.scaffoldingSessions=await db.begin(async tx=>{
   await owned(tx);const ids=scaffold.map(s=>s.id);assert.equal(new Set(ids).size,12);
   const rows=await tx`select id::text,identity_id::text,membership_id::text,assignment_id::text,token_hash,
    context_epoch,revoked_at,last_seen_at=created_at unused from public.app_sessions where id=any(${ids}::uuid[]) order by id for update`;
   assert.equal(rows.length,12);
   for(const row of rows){const expected=scaffold.find(s=>s.id===row.id);assert.ok(expected);
    assert.equal(row.identity_id,expected.identityId);assert.equal(row.membership_id,expected.membershipId);assert.equal(row.assignment_id,expected.assignmentId);
    assert.ok(Buffer.from(row.token_hash).equals(expected.tokenHash),'Scaffolding token hash differs');assert.equal(row.context_epoch,1);assert.equal(row.revoked_at,null);assert.equal(row.unused,true);
    const [member]=await tx`select id from public.memberships where id=${row.membership_id} and identity_id=${row.identity_id} and customer_id=${base.customerId}`;assert.ok(member);
   }
   const references=await tx`select distinct n.nspname schema,c.relname tab,a.attname col from pg_constraint f
    join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace
    cross join lateral unnest(f.conkey,f.confkey) keys(localatt,foreignatt)
    join pg_attribute a on a.attrelid=f.conrelid and a.attnum=keys.localatt
    join pg_attribute target on target.attrelid=f.confrelid and target.attnum=keys.foreignatt
    where f.contype='f' and f.confrelid='public.app_sessions'::regclass and target.attname='id'
    union select table_schema,table_name,column_name from information_schema.columns where table_schema='public' and column_name='session_id' and udt_name='uuid'`;
   for(const ref of references){const [count]=await tx.unsafe(`select count(*)::int n from ${ident(ref.schema)}.${ident(ref.tab)} where ${ident(ref.col)}=any($1::uuid[])`,[ids]);assert.equal(count.n,0,`Referenced scaffolding session: ${ref.tab}.${ref.col}`);}
   const removed=await tx`delete from public.app_sessions where id=any(${ids}::uuid[]) returning id`;assert.equal(removed.length,12);
   return{removed:removed.length,exactIdentityMembershipAssignment:true,unused:true,auditAndDomainReferenceChecks:references.length,normalForeignKeys:true};
  });save();
  for(const [role,original]of Object.entries({hm:base.hm,principal:base.principal,admin:base.admin,second:base.principalB})){
   const username=`cohort-${runId}-${role}`,password=randomBytes(24).toString('base64url'),email=`${username}@synthetic.example.test`;
   assert.equal((await keycloak(`/users?username=${encodeURIComponent(username)}&exact=true`)).length,0,'Own random IdP username already exists');
   journal.users.push({username,subject:null,password,email});save();
   await keycloak('/users','POST',{username,email,firstName:'Syntetisk',lastName:'Klassprov',enabled:true,emailVerified:true,requiredActions:['CONFIGURE_TOTP']});
   const users=await keycloak(`/users?username=${encodeURIComponent(username)}&exact=true`);assert.equal(users.length,1);const subject=users[0].id;assert.match(subject,uuid);
   journal.users.at(-1).subject=subject;save();
   await keycloak(`/users/${subject}/reset-password`,'PUT',{type:'password',value:password,temporary:false});
   const identityId=randomUUID();await db.begin(async tx=>{await owned(tx);await tx`insert into public.identities(id,issuer,subject,display_name,email) values(${identityId},${target.idp.issuer},${subject},'Syntetisk Klassprov',${email})`;
    const changed=await tx`update public.memberships set identity_id=${identityId} where id=${original.membershipId} and identity_id=${original.identityId} and customer_id=${base.customerId} returning id`;assert.equal(changed.length,1);
   });actors[role]={username,password,subject,identityId,membershipId:original.membershipId,assignmentId:original.assignmentId,originalIdentityId:original.identityId,...(role==='second'?{alternateAssignmentId:base.second.assignmentId}:{})};journal.users.at(-1).identityId=identityId;journal.users.at(-1).membershipId=original.membershipId;save();
  }
  const manifest=readJson(manifestPath,null);assert.deepEqual(manifest,manifestOriginal);manifest.idp.users.push(...journal.users.map(({username,subject,email})=>({username,subject,email,totp:true})));privateWrite(manifestPath,manifest);identitySetup=true;
  const reference=basis(),scope={unitId:base.unitId,secondUnitId:base.secondUnitId,foreignCustomerId:foreign.customerId,foreignUnitId:foreign.unitId,foreignOfferingId:foreign.offeringId,offeringId:base.offeringId,emptyOfferingId:base.emptyOfferingId,catalogId:base.catalogId,customerId:base.customerId,organizerId:base.organizerId,futureStart:reference.startedOn,springStart:`${reference.startedOn.slice(0,4)}-02-15`};
  Object.assign(report,{stage:'ready',buildProof,sourceHashes,sqlProof,scope});save();
  return{scope,basis,login,completeStepUp,expireMfa,request,trackPage,resolvePending,prepareEducation,approveProgramplan,approveTimplan,cleanup,buildProof,sourceHashes,sqlProof,inspect,audit,auditFailure,clearAuditFailure,
   async switchAssignment(context,role,alternate=false){
    const actor=roleActor(role);assert.equal(role,'second');const assignmentId=alternate?actor.alternateAssignmentId:base.principalB.assignmentId;
    const response=await context.request.post(`${baseURL}/api/context`,{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(actor.epoch)},data:{assignmentId}});assert.equal(response.status(),200);actor.assignmentId=assignmentId;return sessionView(context,role);
   },
   commandJournal:()=>journal.commands.map(e=>({commandId:e.input.commandId,route:e.route,role:e.role,state:e.state})),
   async source(planId){await owned(db);const [row]=await db`select id::text,revision,version,status,basis_reference from public.point_plans where id=${planId} and organizer_id=${base.organizerId}`;assert.ok(row);return row;},
   async expireSession(context,role){const s=await ownSession(context,role);await owned(db);await db`update public.app_sessions set expires_at=now()-interval '1 second' where id=${s.id} and identity_id=${roleActor(role).identityId}`;},
   async advanceEpoch(context,role){const s=await ownSession(context,role);await owned(db);await db`update public.app_sessions set context_epoch=context_epoch+1 where id=${s.id} and identity_id=${roleActor(role).identityId}`;},
  };
 }catch(error){report.failureCode=error.code??'SETUP';save();if(base||foreign||journal.users.length){try{await cleanup();}catch{throw Error('OIDC fixture setup failed; exact cleanup requires the private journal');}}else{await db.end({timeout:3});if(lockFd!==undefined){closeSync(lockFd);unlinkSync(lockPath);}}throw error;}
}
