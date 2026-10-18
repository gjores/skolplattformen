#!/usr/bin/env node
// Local 3012 transfer only. Copies the tested artifact; never builds or deploys.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {closeSync,copyFileSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,statSync,writeFileSync,fsyncSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {connect,classCohortTargetIdentity} from './verify-class-cohort.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {readPrivateEvidence as readEvidence,readPackageEvidence,installedPackage,assertStructureTransition} from './apply-apl-plan.mjs';
import * as termIntentPackage from './apply-apl-term-intent.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),web=path.join(root,'web');
const destination=path.join(web,'dist-protected'),baseURL='http://127.0.0.1:3012';
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const command=(name,args)=>execFileSync(name,args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function deliveryPackage(packageId='apl-plan'){
 assert.ok(['apl-plan','apl-term-intent'].includes(packageId),'Unknown delivery package');
 return packageId==='apl-plan'?{readPackageEvidence,installedPackage,assertStructureTransition,installationKind:'apl-plan-live-installation',installerFile:'apply-apl-plan.mjs'}
  :{...termIntentPackage,installationKind:'apl-term-intent-live-installation',installerFile:'apply-apl-term-intent.mjs'};
}
const ownSource=(packageId='apl-plan')=>{
 const source=sha(readFileSync(fileURLToPath(import.meta.url)));
 return packageId==='apl-plan'?source:sha([source,sha(readFileSync(path.join(root,'work/pilot',deliveryPackage(packageId).installerFile)))]);
};
// All evidence remains private. Rename only after file fsync, then fsync its directory.
function privateJson(file,value,{exclusive=false}={}){
 const output=path.resolve(file);assert.ok(output.startsWith('/private/tmp/')&&output.endsWith('.json'),'Private JSON output required');
 if(exclusive){const reserved=openSync(output,'wx',0o600);try{fsyncSync(reserved);}finally{closeSync(reserved);}}
 const temporary=output+'.'+randomUUID()+'.tmp',fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,output);
 const directory=openSync(path.dirname(output),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
}
function reserveDeliveryReport(output,kind,mode){
 const report={kind,schemaVersion:1,runId:randomUUID(),mode,status:'FAIL',stage:'started',failureCode:'run_incomplete',startedAt:new Date().toISOString()};
 privateJson(output,report,{exclusive:true});const save=()=>privateJson(output,report);
 return{report,save,close:save};
}
// Assertion messages can contain complete database rows. Keep only safe metadata here.
const failureMetadata=error=>({name:error.name??'Error',code:error.code??null,messageSha256:sha(String(error.message??''))});

const processInfo=pid=>({pid,ppid:Number(command('ps',['-p',String(pid),'-o','ppid='])),started:command('ps',['-p',String(pid),'-o','lstart=']),args:command('ps',['-p',String(pid),'-o','args='])});
const processCwd=pid=>command('lsof',['-a','-p',String(pid),'-d','cwd','-Fn']).split('\n').find(s=>s.startsWith('n'))?.slice(1);
export function localRuntime(){
 const ids=[...new Set(command('lsof',['-nP','-a','-iTCP:3012','-sTCP:LISTEN','-Fp']).split('\n').filter(s=>s.startsWith('p')).map(s=>Number(s.slice(1))))];
 assert.equal(ids.length,1,'Exactly one local preview listener required');
 const listener=processInfo(ids[0]),preview=processInfo(listener.ppid),manager=processInfo(preview.ppid);
 assert.match(listener.args,/workerd/u);assert.equal(processCwd(preview.pid),web);
 assert.ok(preview.args.endsWith('scripts/preview-worker.mjs dist-protected/server/wrangler.json 3012'),'Unexpected preview command');
 assert.ok(manager.args.endsWith('scripts/run-mode.mjs preview --mode protected --port 3012'),'Unexpected preview manager');
 assert.equal(processCwd(manager.pid),web);return{listener,preview,manager};
}
export function requirePreviousRuntimeProof(previous,artifact,runtime,{cleanupProof,business,configuration}={}){
 if(previous.status==='FAIL'&&previous.runtimeRestored===true){
  assert.equal(previous.kind,'apl-plan-local-delivery');assert.equal(previous.mode,'--apply');assert.equal(previous.databaseClosed,true);assert.notEqual(previous.recoveryRequired,true);
  assert.equal(previous.failedStage,'readonly_oidc_pending');assert.equal(previous.readOnlyOidc?.status,'FAIL');
  assert.equal(cleanupProof?.sha256,previous.readOnlyOidc.proofSha256);const clean=cleanupProof?.value;
  assert.equal(clean?.kind,'apl-plan-delivery-readonly');assert.equal(clean?.stage,'complete');
  for(const key of ['quiesced','oldSessionsPreserved','oldAuditPreserved','oldBusinessPreserved','loginMetadataOnly'])assert.equal(clean.cleanup?.[key],true);
  assert.deepEqual(clean.before.business,previous.beforeBusiness);assert.deepEqual(clean.after.business,previous.beforeBusiness);
  assert.deepEqual(business,previous.beforeBusiness);assert.deepEqual(configuration,previous.beforeConfiguration);
  previous={kind:previous.kind,mode:previous.mode,status:'PASS',applied:true,afterArtifact:previous.beforeArtifact,afterRuntime:previous.restoredRuntime};
 }
 assert.ok(['class-cohort-local-delivery','named-timplan-local-delivery','rector-programplan-local-delivery','apl-plan-local-delivery','code-local-delivery','apl-annual-local-delivery','planning-flow-local-delivery','timplan-minimum-local-delivery'].includes(previous.kind));assert.equal(previous.mode,'--apply');assert.equal(previous.status,'PASS');assert.equal(previous.applied,true);assert.deepEqual(previous.afterArtifact,artifact,'Active directory no longer matches the previously delivered process artifact');
 for(const part of ['listener','preview','manager']){const old=previous.afterRuntime[part],current=runtime[part];for(const key of ['pid','started','args'])assert.equal(current[key],old[key],'Active process differs from previous delivery');if(part!=='manager')assert.equal(current.ppid,old.ppid);else assert.ok(current.ppid===old.ppid||current.ppid===1,'Manager parent changed unexpectedly');}
}
async function health(){
 const r=await fetch(baseURL+'/api/health/db',{signal:AbortSignal.timeout(10000)}),body=await r.json();
 assert.ok(r.ok&&body.ok&&body.role==='skolplattform_worker'&&body.runtime==='workerd');return{role:body.role,runtime:body.runtime};
}
function expectedVars(m){return['APP_MODE=protected',`OIDC_ISSUER=${m.idp.issuer}`,`OIDC_CLIENT_ID=${m.idp.clientId}`,`OIDC_CLIENT_SECRET=${m.idp.clientSecret}`,`OIDC_REDIRECT_URI=${baseURL}/api/auth/callback`,`OIDC_POST_LOGOUT_REDIRECT_URI=${baseURL}/`,`SUPABASE_URL=${m.apiUrl}`,`SUPABASE_ANON_KEY=${m.anonKey}`,`DATABASE_URL=${m.worker.dbUrl}`,`SESSION_SECRET=${m.sessionSecret}`,`MFA_ACR_VALUES=${m.mfa.acrValues}`,`MFA_MAX_AGE_SECONDS=${m.mfa.maxAgeSeconds}`,'SESSION_IDLE_SECONDS=900','SESSION_ABSOLUTE_SECONDS=28800',''].join('\n');}
function privateConfiguration(target){
 const manifest=readFileSync(path.join(root,'work/pilot/targets/protected/manifest.json'));
 const vars=readFileSync(path.join(destination,'server/.dev.vars'));
 assert.equal(vars.toString(),expectedVars(target),'Active private configuration must match the protected target');
 assert.equal(statSync(path.join(destination,'server/.dev.vars')).mode&0o077,0);
 const lock=readFileSync(path.join(destination,'server/.dev.vars.lock'));assert.equal(lock.length,0);
 return{manifestSha256:sha(manifest),varsSha256:sha(vars),lockSha256:sha(lock)};
}
async function businessHashes(db){
 const tables=await db`select tablename from pg_tables where schemaname='public' and tablename not in ('app_sessions','identities','security_events') order by tablename`,result={};
 for(const {tablename}of tables){assert.match(tablename,/^[a-z_][a-z_0-9]*$/u);result[tablename]=(await db.unsafe(`select count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),''),'UTF8')),'hex') sha256 from public."${tablename}" t`))[0];}
 return result;
}
export function copyArtifact(source,target,manifest){
 mkdirSync(target,{recursive:false,mode:0o700});
 for(const file of manifest.files){assert.ok(!path.isAbsolute(file.path)&&!file.path.split(path.sep).includes('..'));const out=path.join(target,file.path);mkdirSync(path.dirname(out),{recursive:true});copyFileSync(path.join(source,file.path),out);}
 assert.deepEqual(artifactManifest(target),manifest);
}
async function stopRuntime(expected,onStopAttempt=()=>{}){
 assert.deepEqual(localRuntime(),expected,'Runtime changed before stop');onStopAttempt();process.kill(expected.manager.pid,'SIGTERM');
 const deadline=Date.now()+20000;while(Date.now()<deadline){
  const gone=[expected.listener,expected.preview,expected.manager].every(p=>{try{const current=processInfo(p.pid);return current.started!==p.started;}catch{return true;}});
  if(gone){assert.equal(existsSync(path.join(destination,'server/.dev.vars')),false);assert.equal(existsSync(path.join(destination,'server/.dev.vars.lock')),false);return;}
  await delay(150);
 }throw Error('Local preview did not stop cleanly');
}
async function startRuntime(logPath,onSpawn=()=>{}){
 const fd=openSync(logPath,'wx',0o600);let child;
 try{child=spawn(process.execPath,['scripts/run-mode.mjs','preview','--mode','protected','--port','3012'],{cwd:web,detached:true,stdio:['ignore',fd,fd],env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});onSpawn(processInfo(child.pid));child.unref();}finally{closeSync(fd);}
 const deadline=Date.now()+30000;while(Date.now()<deadline){try{const runtime=localRuntime();assert.equal(runtime.manager.pid,child.pid);await health();return runtime;}catch{await delay(250);}}
 throw Error('Transferred preview did not become healthy');
}
async function stopOwnStartingManager(manager){
 let current;try{current=processInfo(manager.pid);}catch{current=null;}
 if(current){assert.deepEqual(current,manager,'New preview manager identity changed');process.kill(manager.pid,'SIGTERM');}
 const deadline=Date.now()+20000;while(Date.now()<deadline){
  let alive=false;try{alive=processInfo(manager.pid).started===manager.started;}catch{}
  let listening=false;try{listening=Boolean(command('lsof',['-nP','-a','-iTCP:3012','-sTCP:LISTEN','-Fp']));}catch{}
  if(!alive&&!listening&&!existsSync(path.join(destination,'server/.dev.vars'))&&!existsSync(path.join(destination,'server/.dev.vars.lock')))return;
  await delay(150);
 }throw Error('Own failed preview did not release the runtime');
}
// Installation evidence is produced only after current actual API/browser and SQL proofs pass.
export function requireInstallationProof(report,{target,installed,toolSha256,packageId='apl-plan'}){
 const contract=deliveryPackage(packageId);
 assert.equal(report.kind,contract.installationKind);assert.equal(report.mode,'--apply');assert.equal(report.status,'PASS');assert.equal(report.committed,true);assert.equal(report.databaseClosed,true);assert.equal(report.oldWorkerCompatibleAfterCommit,false);assert.equal(report.candidateTransferRequired,true);
 assert.equal(report.toolSha256,toolSha256);assert.deepEqual(report.target,target);assert.deepEqual(report.installed,installed);
 assert.deepEqual(report.beforeProjection,report.afterProjection);assert.deepEqual(report.beforeJournal,report.afterOriginalJournal);
 assert.equal(report.structureVerified,true);contract.assertStructureTransition(report.beforeStructure,report.afterStructure);
 assert.notEqual(report.recoveryRequired,true);assert.ok(report.lockHoldMsBeforeCommit>=0&&report.lockHoldMsBeforeCommit<30000);
}
async function acceptance(file,db,target,packageId){
 const contract=deliveryPackage(packageId);
 const installation=readEvidence(file),r=installation.value;
 requireInstallationProof(r,{target:await classCohortTargetIdentity(db,target),installed:await contract.installedPackage(db),toolSha256:sha(readFileSync(path.join(root,'work/pilot',contract.installerFile))),packageId});
 const proof=contract.readPackageEvidence({sqlEvidence:r.sql.path,apiEvidence:r.api.path});assert.equal(proof.sql.sha256,r.sql.sha256);assert.equal(proof.api.sha256,r.api.sha256);assert.deepEqual(r.packages,proof.packages);assert.deepEqual(r.build,{root:proof.buildRoot,artifact:proof.api.value.finalArtifact});
 return{sha256:installation.sha256,report:r,sql:{evidenceSha256:installation.sha256},build:{buildRoot:proof.buildRoot,buildRevision:proof.api.value.build.revision,artifact:proof.api.value.finalArtifact}};
}
// The new capability remains a school-scoped read; it grants no decision rights.
export function requireRectorCreationCapability(selection,expectedUnitIds,selectedUnitId){
 assert.equal(selection.canCreateEducation,true,'Rector creation capability missing');
 assert.ok(expectedUnitIds.length>0&&expectedUnitIds.includes(selectedUnitId));
 const ids=selection.units.map(unit=>unit.id);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),[...expectedUnitIds].sort(),'Selection exposed incorrect school scope');
 assert.equal(selection.selection.unitId,selectedUnitId);assert.equal(selection.decisionReady,false);
 return true;
}
// Real OIDC read against an existing synthetic school mandate, with exact session cleanup.
// Explicit opt-in keeps the historical delivery proof contract unchanged.
export function requireAplDeliveryRead({gym,apl,decision,allowsApl,aplWorkflow='legacy'}){
 assert.ok(['legacy','separate_apl_v1'].includes(aplWorkflow));
 assert.equal(decision.revision,gym.revision);
 if(aplWorkflow==='separate_apl_v1'){
  assert.equal(apl.revisionScope,'apl');assert.equal(apl.timplanRevision,gym.revision);
  assert.ok(Number.isSafeInteger(apl.revision)&&apl.revision>=0);
  const canPlan=allowsApl&&gym.status==='faststalld'&&!gym.archived;
  assert.equal(apl.capabilities.canSave,canPlan);assert.equal(apl.capabilities.canConfirm,canPlan);assert.equal(apl.capabilities.canReview,false);
  assert.equal(decision.contractVersion,'timetable_decision_v2');assert.equal(decision.apl,null);
 }else{
  assert.equal(apl.revision,gym.revision);assert.equal(apl.capabilities.canSave,allowsApl&&gym.canPlan);assert.equal(apl.capabilities.canConfirm,allowsApl&&gym.canPlan);
  assert.equal(decision.contractVersion,'apl_decision_v1');
  if(decision.apl!==null){assert.equal(decision.apl.detail.contentHash,apl.contentHash);assert.equal(decision.apl.detail.revision,apl.revision);}
 }
}

const readOnlyOidc=(()=>{
const require=createRequire(path.join(root,'web/package.json'));
const {chromium}=require('@playwright/test');
const OTP=require('otpauth');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const omitted=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
const idpDir=path.join(root,'work/pilot/targets/protected/idp');
const ownOrigin='http://127.0.0.1:3012';
const sentCodes=new Map();

async function businessHashes(db){
  const result={};
  const tables=await db`select tablename from pg_tables where schemaname='public' and tablename not in ('app_sessions','identities','security_events') order by tablename`;
  for(const {tablename} of tables){
    const [row]=await db.unsafe(`select count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),''),'UTF8')),'hex') sha256 from public.${quote(tablename)} t`);
    result[tablename]=row;
  }
  return result;
}
async function rows(db,table){return (await db.unsafe(`select id::text,to_jsonb(t) row from ${table} t order by id::text`)).map(({id,row})=>({id,row}));}
function preserved(before,after,{ownIds=[],allowed=[]}={}){
  const current=new Map(after.map(item=>[item.id,item.row])),own=new Set(ownIds);
  for(const old of before){
    assert.ok(current.has(old.id),'Original row disappeared');
    assert.deepEqual(omitted(current.get(old.id),own.has(old.id)?allowed:[]),omitted(old.row,own.has(old.id)?allowed:[]),'Original row changed outside allowed login metadata');
  }
}
// BEGIN pure, narrow JWT metadata evidence helpers.
function callbackTokenClaims(session,audit,{issuer,subject,clientId,startedAt,observedAt,stepUp,correlationId}){
  assert.equal(audit.source,'worker');assert.equal(audit.actor_issuer,issuer);assert.equal(audit.actor_subject,subject);
  assert.equal(audit.details?.stepUp,stepUp);assert.equal(audit.details?.proof?.sourceCorrelationId,correlationId);
  assert.equal(audit.details?.proof?.issuer,issuer);if(stepUp)assert.equal(audit.details?.proof?.result,'accepted');
  assert.equal(session.proof_issuer,issuer);assert.equal(session.proof_client_id,clientId);assert.deepEqual(session.proof_audience,[clientId]);
  const checkedAt=Date.parse(session.proof_checked_at),start=Date.parse(startedAt),observed=Date.parse(observedAt);
  assert.ok(Number.isFinite(start)&&Number.isFinite(observed)&&observed>=start&&checkedAt>=start&&checkedAt<=observed);
  // Decode only the exact token stored by the successful server callback. This
  // is correlation with prior server verification, not a new JWT trust decision.
  assert.equal(typeof session.id_token_hint,'string');assert.match(session.id_token_hint,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  const claims=JSON.parse(Buffer.from(session.id_token_hint.split('.')[1],'base64url').toString('utf8'));
  assert.ok(claims&&typeof claims==='object'&&!Array.isArray(claims));
  assert.equal(claims.iss,issuer);assert.equal(claims.sub,subject);
  assert.deepEqual(typeof claims.aud==='string'?[claims.aud]:claims.aud,[clientId]);
  if(claims.azp!==undefined)assert.equal(claims.azp,clientId);
  assert.ok(Number.isSafeInteger(claims.iat)&&Number.isSafeInteger(claims.exp)&&claims.exp>claims.iat);
  assert.ok(claims.iat>=Math.floor(start/1000)&&claims.iat<=Math.floor(observed/1000),'Token must be issued during this own login attempt');
  return{iat:claims.iat,exp:claims.exp,tokenSha256:sha(session.id_token_hint),claimsSha256:digest({iat:claims.iat,exp:claims.exp}),
    auditId:audit.id,sessionId:session.id,correlationId,stepUp,startedAt,observedAt};
}
function preserveAuthJwtMetadata(before,after,{ownIds,metadataOwnerId,field,allowed,claims}){
  assert.ok(claims&&ownIds.includes(metadataOwnerId),'Exact callback-bound metadata owner required');
  const current=new Map(after.map(item=>[item.id,item.row])),own=new Set(ownIds),changes=[];
  assert.equal(before.filter(item=>item.id===metadataOwnerId).length,1);
  for(const old of before){
    assert.ok(current.has(old.id),'Original auth row disappeared');const next=current.get(old.id),allow=own.has(old.id)?allowed:[];
    if(old.id!==metadataOwnerId){assert.deepEqual(omitted(next,allow),omitted(old.row,allow));continue;}
    assert.deepEqual(omitted(next,[...allow,field]),omitted(old.row,[...allow,field]),'Other auth row fields changed');
    const original=old.row[field],updated=next[field];
    assert.ok(original&&updated&&typeof original==='object'&&typeof updated==='object'&&!Array.isArray(original)&&!Array.isArray(updated));
    assert.deepEqual(Object.keys(updated).sort(),Object.keys(original).sort(),'Metadata keys changed');
    assert.ok(Object.hasOwn(original,'iat')&&Object.hasOwn(original,'exp'));
    assert.deepEqual(omitted(updated,['iat','exp']),omitted(original,['iat','exp']),'Other nested metadata changed');
    assert.ok(Number.isSafeInteger(original.iat)&&Number.isSafeInteger(original.exp)&&original.exp>original.iat);
    assert.ok(Number.isSafeInteger(updated.iat)&&Number.isSafeInteger(updated.exp)&&updated.exp>updated.iat);
    assert.equal(updated.iat,claims.iat,'Metadata iat differs from exact callback token');
    assert.equal(updated.exp,claims.exp,'Metadata exp differs from exact callback token');
    const changedFields=[];
    for(const key of ['iat','exp'])if(original[key]!==updated[key])changedFields.push({field:`${field}.${key}`,beforeSha256:digest(original[key]),afterSha256:digest(updated[key])});
    const fieldHash=(row,key)=>digest({present:Object.hasOwn(row,key),value:row[key]});
    for(const key of allow)if(fieldHash(old.row,key)!==fieldHash(next,key))changedFields.push({field:key,beforeSha256:fieldHash(old.row,key),afterSha256:fieldHash(next,key)});
    changes.push({rowId:old.id,metadataField:field,changedFields,beforeSha256:digest(original),afterSha256:digest(updated),
      tokenSha256:claims.tokenSha256,claimsSha256:claims.claimsSha256,auditId:claims.auditId,sessionId:claims.sessionId,correlationId:claims.correlationId});
  }
  return changes;
}
// END pure, narrow JWT metadata evidence helpers.

const safeRows=items=>({count:items.length,sha256:digest(items.map(({id,row})=>({id,sha256:digest(row)})))});

// Existing-account-only login. Refuses enrollment before entering any new TOTP secret.
// Keep password, TOTP seed, code, cookies and URLs carrying OIDC parameters in memory.
async function existingLogin(page,{username,password,secret,issuer,stepUp=false}){
  // The login route's safeReturnTo accepts this same-origin path. Returning to
  // JSON completes the real callback without mounting the app or auto-reading
  // unrelated workspaces. The same explicit return applies to step-up.
  const query=new URLSearchParams({till:'/api/health/db'});if(stepUp)query.set('step_up','1');
  await page.goto(ownOrigin+'/api/auth/login?'+query);
  await page.waitForURL(url=>url.origin===new URL(issuer).origin,{timeout:30000});
  const user=page.getByLabel(/Användarnamn|Username/i),pass=page.getByRole('textbox',{name:/Lösenord|Password/i});
  const otp=page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
  await Promise.race([user.waitFor({state:'visible'}),pass.waitFor({state:'visible'}),otp.waitFor({state:'visible'})]);
  if(await user.isVisible())await user.fill(username);
  if(await pass.isVisible()){await pass.fill(password);await page.getByRole('button',{name:/Logga in|Sign In/i}).click();}
  await Promise.race([
    otp.waitFor({state:'visible'}),
    page.locator('#kc-totp-secret-key').waitFor({state:'visible'}).then(()=>{throw Error('EXISTING_ACCOUNT_ENROLLMENT_REFUSED');}),
    page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i).waitFor({state:'visible'}).then(()=>{throw Error('EXISTING_ACCOUNT_ENROLLMENT_REFUSED');}),
  ]);
  const generator=new OTP.TOTP({algorithm:'SHA1',digits:6,period:30,secret:OTP.Secret.fromBase32(secret)});
  // Avoid sending a code on a period boundary. Never modify existing TOTP files.
  const lastPath=path.join(idpDir,'totp-last-used.json');
  const previous=sentCodes.get(username)??(existsSync(lastPath)?JSON.parse(readFileSync(lastPath,'utf8'))[username]:null);
  while(Date.now()%30000>25000||generator.generate()===previous)await page.waitForTimeout(1000);
  const code=generator.generate();sentCodes.set(username,code);
  await otp.fill(code);await page.getByRole('button',{name:/Logga in|Sign In/i}).click();
  await page.waitForURL(url=>url.origin===ownOrigin&&url.pathname==='/api/health/db'&&!url.search,{timeout:30000});
}

async function readAplAfterDelivery({db,target,baseURL,scope,evidenceDir,aplWorkflow='legacy'}){
  assert.ok(['legacy','separate_apl_v1'].includes(aplWorkflow));
  assert.equal(baseURL,ownOrigin,'Only the reviewed local delivery endpoint is accepted');
  for(const key of ['customerId','unitId','offeringId','assignmentId'])assert.match(scope[key],UUID);
  assert.ok(path.isAbsolute(evidenceDir)&&path.resolve(evidenceDir).startsWith('/private/tmp/'));
  assert.ok(statSync(evidenceDir).isDirectory()&&(statSync(evidenceDir).mode&0o077)===0,'Private directory must be 0700');
  const {assertTarget}=await import(path.join(root,'work/pilot/verify-target.mjs'));
  const verified=await assertTarget('protected',{requireIdp:true});
  assert.equal(target.dbUrl,verified.dbUrl);assert.equal(target.idp.issuer,verified.idp.issuer);
  const username='p3.rektor',configured=target.idp.users.find(user=>user.username===username);
  assert.ok(configured?.totp&&configured.subject,'Existing synthetic TOTP identity required');
  const passwords=JSON.parse(readFileSync(path.join(idpDir,'phase3-users.json'),'utf8'));
  const secrets=JSON.parse(readFileSync(path.join(idpDir,'totp-users.json'),'utf8'));
  assert.equal(typeof passwords[username],'string');assert.equal(typeof secrets[username],'string');
  const runId=randomUUID(),proofPath=path.join(evidenceDir,`delivery-readonly-${runId}.json`);
  const lockPath=path.join(idpDir,'class-cohort-run.lock');
  let lockFd,browser,context,page,before,identity,authIdentityIds=[],metadataIdentityId,latestCallbackClaims,failure,cleanupComplete=false,quiesced=false;
  const callbacks=[],appIds=new Set(),authIds=new Set(),requests=new Set(),forbiddenWrites=[];
  const report={kind:'apl-plan-delivery-readonly',runId,status:'FAIL',stage:'reserved',baseURL,scope,
    actualOidc:false,businessWrites:false,createdAt:new Date().toISOString(),callbacks,ownedAppSessionIds:[],ownedAuthSessionIds:[],proofPath};
  privateJson(proofPath,report,{exclusive:true});
  const save=()=>privateJson(proofPath,report);
  const checkpoint=(stage,check)=>{report.stage=stage;report.check=check;save();};
  const snapshot=async(conn=db)=>({business:await businessHashes(conn),app:await rows(conn,'public.app_sessions'),identities:await rows(conn,'public.identities'),
    users:await rows(conn,'auth.users'),authIdentities:await rows(conn,'auth.identities'),authSessions:await rows(conn,'auth.sessions'),tokens:await rows(conn,'auth.refresh_tokens'),claims:await rows(conn,'auth.mfa_amr_claims'),
    audit:await rows(conn,'public.security_events'),authAudit:await rows(conn,'auth.audit_log_entries')});
  const verifyPreservation=(after,phase)=>{
    const check=label=>checkpoint(phase,label);
    check('business_rows_unchanged');assert.deepEqual(after.business,before.business,'Business rows changed');
    for(const key of ['app','authSessions','tokens','claims']){check(`original_${key}_preserved`);preserved(before[key],after[key]);}
    check('identity_count_unchanged');assert.equal(after.identities.length,before.identities.length,'Login created an unexpected identity');
    check('auth_user_count_unchanged');assert.equal(after.users.length,before.users.length,'Login created an unexpected auth user');
    check('auth_identity_count_unchanged');assert.equal(after.authIdentities.length,before.authIdentities.length,'Login created an unexpected auth identity');
    check('identity_values_login_metadata_only');preserved(before.identities,after.identities,{ownIds:[identity.id],allowed:['last_login_at']});
    check('auth_user_values_exact_callback_jwt_rotation');
    const userChanges=preserveAuthJwtMetadata(before.users,after.users,{ownIds:[identity.auth_user_id],metadataOwnerId:identity.auth_user_id,field:'raw_user_meta_data',allowed:['last_sign_in_at','updated_at'],claims:latestCallbackClaims});
    check('auth_identity_values_exact_callback_jwt_rotation');
    const identityChanges=preserveAuthJwtMetadata(before.authIdentities,after.authIdentities,{ownIds:authIdentityIds,metadataOwnerId:metadataIdentityId,field:'identity_data',allowed:['last_sign_in_at','updated_at'],claims:latestCallbackClaims});
    report.jwtMetadataChanges??={};report.jwtMetadataChanges[phase]={users:userChanges,authIdentities:identityChanges};save();
    check('original_security_audit_preserved');preserved(before.audit,after.audit);
    check('original_auth_audit_preserved');preserved(before.authAudit,after.authAudit);
  };
  try{
    lockFd=openSync(lockPath,'wx',0o600);writeFileSync(lockFd,JSON.stringify({runId,proofPath,kind:report.kind})+'\n');fsyncSync(lockFd);
    const found=await db`select i.id::text,i.auth_user_id::text from public.identities i
      join public.memberships m on m.identity_id=i.id join public.access_assignments a on a.membership_id=m.id
      join public.mandate_units mu on mu.assignment_id=a.id
      where i.issuer=${target.idp.issuer} and i.subject=${configured.subject} and a.id=${scope.assignmentId}
        and a.customer_id=${scope.customerId} and m.customer_id=${scope.customerId} and m.status='active'
        and a.function='rektor' and mu.unit_id=${scope.unitId} and public.phase3_mandate_is_valid(a.id)`;
    assert.equal(found.length,1,'Exact existing school mandate required');identity=found[0];assert.match(identity.auth_user_id,UUID);
    checkpoint('baseline_pending','capture_full_read_only_snapshot');
    let businessRows;
    before=await db.begin('isolation level repeatable read read only',async tx=>{
      const captured=await snapshot(tx);businessRows={};
      for(const table of Object.keys(captured.business))businessRows[table]=(await tx.unsafe(`select to_jsonb(t) row from public.${quote(table)} t order by to_jsonb(t)::text`)).map(item=>item.row);
      return captured;
    });
    authIdentityIds=before.authIdentities.filter(item=>item.row.user_id===identity.auth_user_id).map(item=>item.id);
    assert.ok(authIdentityIds.length>0,'Existing GoTrue identity required');
    const metadataIdentities=before.authIdentities.filter(item=>authIdentityIds.includes(item.id)&&item.row.provider==='keycloak'&&item.row.identity_data?.sub===configured.subject);
    assert.equal(metadataIdentities.length,1,'Exact existing Keycloak metadata identity required');metadataIdentityId=metadataIdentities[0].id;
    report.before={business:before.business,app:safeRows(before.app),identities:safeRows(before.identities),users:safeRows(before.users),authIdentities:safeRows(before.authIdentities),authSessions:safeRows(before.authSessions),tokens:safeRows(before.tokens),claims:safeRows(before.claims),audit:safeRows(before.audit),authAudit:safeRows(before.authAudit)};
    // Full rows stay in process memory only. Never export auth, tokens or user rows.
    report.baseline={sha256:digest(before),fullOriginalRows:false,inMemoryComparison:true,beforeFirstOidcLogin:true};save();
    checkpoint('logging_in','existing_account_oidc');
    browser=await chromium.launch();context=await browser.newContext({baseURL,locale:'sv-SE',viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('request',request=>{if(new URL(request.url()).origin===baseURL){requests.add(request);const pathname=new URL(request.url()).pathname;
      if(request.method()==='POST')forbiddenWrites.push(pathname);}});
    page.on('requestfinished',request=>requests.delete(request));page.on('requestfailed',request=>requests.delete(request));
    page.on('response',response=>{if(new URL(response.url()).origin===baseURL&&new URL(response.url()).pathname==='/api/auth/callback'){
      callbacks.push({status:response.status(),correlationId:response.headers()['x-correlation-id']??null});save();}});
    const captureCallback=async(previousAuthIds,previousCallbackCount,startedAt,stepUp)=>{
      assert.equal(callbacks.length,previousCallbackCount+1,'Exactly one callback per login required');
      const callback=callbacks.at(-1);assert.ok(callback.status>=300&&callback.status<400);assert.match(callback.correlationId,UUID);
      const cookie=(await context.cookies(baseURL)).find(item=>item.name==='sp_session');assert.ok(cookie);
      const tokenHash=createHash('sha256').update(cookie.value).digest();
      const [session]=await db`select id::text,identity_id::text,id_token_hint,proof_issuer,proof_client_id,proof_audience,proof_checked_at::text from public.app_sessions where token_hash=${tokenHash}`;
      assert.equal(session?.identity_id,identity.id);assert.ok(!before.app.some(item=>item.id===session.id),'Never clean a pre-existing app session');
      const audit=await db`select id::text,source,actor_issuer,actor_subject,details from public.security_events where correlation_id=${callback.correlationId} and actor_identity_id=${identity.id} and session_id=${session.id} and action='login' and outcome='ok'`;
      assert.equal(audit.length,1,'Callback must bind to the own login audit');
      assert.ok(!before.audit.some(item=>item.id===audit[0].id),'Callback audit must be new in this run');
      assert.ok(!callbacks.slice(0,-1).some(item=>item.auditId===audit[0].id),'Callback audit cannot be reused');
      latestCallbackClaims=callbackTokenClaims(session,audit[0],{issuer:target.idp.issuer,subject:configured.subject,clientId:target.idp.clientId,
        startedAt,observedAt:new Date().toISOString(),stepUp,correlationId:callback.correlationId});
      callback.auditId=audit[0].id;callback.sessionId=session.id;callback.tokenSha256=latestCallbackClaims.tokenSha256;
      callback.claimsSha256=latestCallbackClaims.claimsSha256;callback.stepUp=stepUp;
      appIds.add(session.id);
      const current=await rows(db,'auth.sessions'),newRows=current.filter(item=>!previousAuthIds.has(item.id));
      assert.equal(newRows.length,1,'Unknown or concurrent GoTrue login: cleanup refused');
      assert.equal(newRows[0].row.user_id,identity.auth_user_id);authIds.add(newRows[0].id);
      report.ownedAppSessionIds=[...appIds];report.ownedAuthSessionIds=[...authIds];report.attribution='exclusive account lock, exact callback audit/cookie binding, one new GoTrue session per successful callback';save();
    };
    const loginStartedAt=new Date().toISOString();
    await existingLogin(page,{username,password:passwords[username],secret:secrets[username],issuer:target.idp.issuer});
    await captureCallback(new Set(before.authSessions.map(item=>item.id)),0,loginStartedAt,false);
    let response=await context.request.get('/api/session');assert.equal(response.status(),200);let view=await response.json();
    assert.equal(view.identity.issuer,target.idp.issuer);assert.equal(view.identity.subject,configured.subject);
    if(!view.mfa.proof){const previous=new Set((await rows(db,'auth.sessions')).map(item=>item.id)),count=callbacks.length,stepUpStartedAt=new Date().toISOString();
      await existingLogin(page,{username,password:passwords[username],secret:secrets[username],issuer:target.idp.issuer,stepUp:true});await captureCallback(previous,count,stepUpStartedAt,true);
      response=await context.request.get('/api/session');assert.equal(response.status(),200);view=await response.json();}
    assert.equal(view.mfa.proof,true);assert.ok(view.mfa.amr.includes('otp'));
    const assignment=view.assignments.find(item=>item.id===scope.assignmentId&&item.customerId===scope.customerId&&item.unitId===scope.unitId&&item.function==='rektor'&&item.state==='giltigt'&&!item.blocked);
    assert.ok(assignment,'Exact readable school assignment not offered');
    if(view.context?.assignmentId!==scope.assignmentId){response=await context.request.post('/api/context',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)},data:{assignmentId:scope.assignmentId}});assert.equal(response.status(),200);view=await(await context.request.get('/api/session')).json();}
    assert.equal(view.context?.assignmentId,scope.assignmentId);assert.equal(view.context?.customerId,scope.customerId);assert.equal(view.context?.valid,true);assert.equal(view.context?.blocked,false);assert.ok(Number.isInteger(view.epoch));
    const input={offeringId:scope.offeringId,unitId:scope.unitId};
    response=await context.request.post('/api/klasser/organisation/underlag',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)},data:input});assert.equal(response.status(),200);
    const {parseClassCohortUnderlag}=await import(path.join(root,'web/lib/class-cohort.ts'));
    const underlag=parseClassCohortUnderlag(await response.json(),input),correlationId=response.headers()['x-correlation-id'];assert.match(correlationId,UUID);
    const readAudit=await db`select source from public.security_events where correlation_id=${correlationId} and actor_identity_id=${identity.id}
      and session_id=any(${[...appIds]}::uuid[]) and assignment_id=${scope.assignmentId} and customer_id=${scope.customerId} and outcome='ok'
      and action='class_cohort_read' and object_type='education' and object_id=${scope.offeringId}`;
    assert.deepEqual(readAudit.map(item=>item.source).sort(),['db','worker']);
    checkpoint('reading_named_timplans','existing_synthetic_gym_source');
    const plans=await db`select distinct source_programplan_id::text source_id from public.timplans where offering_id=${scope.offeringId} and unit_id=${scope.unitId} and gym_basis is not null order by source_id`;
    assert.ok(plans.length>0,'Selected scope needs an existing synthetic gym timplan');
    const sourcePlanId=plans[0].source_id,namedResponse=await context.request.post('/api/timplaner/gym/underlag',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)},data:{sourcePlanId}});assert.equal(namedResponse.status(),200);
    const {parseGymTimplanUnderlag}=await import(path.join(root,'web/lib/gym-timplan.ts'));const named=parseGymTimplanUnderlag(await namedResponse.json(),sourcePlanId),unit=named.units.find(u=>u.unitId===scope.unitId);assert.ok(unit?.plans.length&&unit.plans.every(p=>p.series));
    const namedCorrelation=namedResponse.headers()['x-correlation-id'];assert.match(namedCorrelation,UUID);
    const namedAudit=await db`select source from public.security_events where correlation_id=${namedCorrelation} and actor_identity_id=${identity.id} and session_id=any(${[...appIds]}::uuid[]) and assignment_id=${scope.assignmentId} and customer_id=${scope.customerId} and action='gym_timplan_basis_read' and object_type='programplan' and object_id=${sourcePlanId} and outcome='ok'`;
    assert.deepEqual(namedAudit.map(a=>a.source).sort(),['db','worker']);
    report.read={status:200,epoch:view.epoch,correlationId,classCount:underlag.classes.length,sha256:digest(underlag),namedCorrelation,namedPlanCount:unit.plans.length,namedSha256:digest(named),mfaProof:true,exactAssignment:true};report.actualOidc=true;
    checkpoint('reading_rector_programplan_capability','actual_school_scoped_creation');
    const selectionInput={unitId:scope.unitId,catalogId:null,programRef:null};
    const selectionResponse=await context.request.post('/api/programplaner/val',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)},data:selectionInput});assert.equal(selectionResponse.status(),200);
    const {parseProgramplanSelection}=await import(path.join(root,'web/lib/programplan-education-contract.ts'));
    const selection=parseProgramplanSelection(await selectionResponse.json(),selectionInput);
    const expectedUnits=await db`select distinct u.id::text id from public.school_units u join public.organizers g on g.id=u.organizer_id
      join public.access_assignments a on a.organizer_id=u.organizer_id and a.customer_id=g.customer_id
      join public.mandate_units m on m.assignment_id=a.id and m.unit_id=u.id
      where a.id=${scope.assignmentId} and a.customer_id=${scope.customerId} and exists(select 1 from public.school_unit_types t where t.unit_id=u.id and t.school_type='GY') order by id`;
    requireRectorCreationCapability(selection,expectedUnits.map(u=>u.id),scope.unitId);
    const selectionCorrelation=selectionResponse.headers()['x-correlation-id'];assert.match(selectionCorrelation,UUID);
    const selectionAudit=await db`select source from public.security_events where correlation_id=${selectionCorrelation} and actor_identity_id=${identity.id}
      and session_id=any(${[...appIds]}::uuid[]) and assignment_id=${scope.assignmentId} and customer_id=${scope.customerId}
      and action='programplan_selection_read' and object_type='education_collection' and object_id is null and outcome='ok'`;
    assert.deepEqual(selectionAudit.map(a=>a.source).sort(),['db','worker']);
    report.read.rectorCreation={status:200,canCreateEducation:true,schoolCount:selection.units.length,exactMandatedSchools:true,selectionCorrelation,sha256:digest(selection)};
    checkpoint('reading_apl','exact_existing_named_plan');
    const planId=unit.plans[0].id,headers={Origin:baseURL,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(view.epoch)};
    const gymResponse=await context.request.post('/api/timplaner/gym/lasa',{headers,data:{planId}});assert.equal(gymResponse.status(),200);
    const {parseGymTimplan}=await import(path.join(root,'web/lib/gym-timplan.ts'));
    const gym=parseGymTimplan(await gymResponse.json(),planId);assert.equal(gym.unitId,scope.unitId);assert.equal(gym.offeringId,scope.offeringId);
    const aplResponse=await context.request.post('/api/timplaner/gym/apl/lasa',{headers,data:{planId}});assert.equal(aplResponse.status(),200);
    const {parseAplReadReply}=await import(path.join(root,'web/lib/apl-plan.ts'));
    const apl=parseAplReadReply(await aplResponse.json(),{planId});assert.equal(apl.organizerId,view.context.organizerId);
    const {gymTimplanAllowsApl}=await import(path.join(root,'web/lib/gym-timplan.ts'));const allowsApl=gymTimplanAllowsApl(gym);
    const decisionResponse=await context.request.post('/api/planbeslut/underlag',{headers,data:{kind:'timplan',planId}});assert.equal(decisionResponse.status(),200);
    const {parsePlanDecisionDetail}=await import(path.join(root,'web/lib/plan-decision.ts'));
    const decision=parsePlanDecisionDetail(await decisionResponse.json(),{kind:'timplan',planId});
    requireAplDeliveryRead({gym,apl,decision,allowsApl,aplWorkflow});
    for(const [response,action]of [[gymResponse,'gym_timplan_read'],[aplResponse,'apl_plan_read'],[decisionResponse,'plan_decision_basis_read']]){
      const correlation=response.headers()['x-correlation-id'];assert.match(correlation,UUID);
      const audit=await db`select source from public.security_events where correlation_id=${correlation} and actor_identity_id=${identity.id}
       and session_id=any(${[...appIds]}::uuid[]) and assignment_id=${scope.assignmentId} and customer_id=${scope.customerId}
       and action=${action} and object_type='timplan' and object_id=${planId} and outcome='ok'`;
      assert.deepEqual(audit.map(a=>a.source).sort(),['db','worker']);
    }
    report.read.apl={status:200,exactPlan:true,contractVersion:apl.contractVersion,revision:apl.revision,state:apl.plan===null?'legacy':'structured_v1',sha256:digest(apl),decisionSha256:digest(decision)};
    assert.deepEqual(forbiddenWrites,[]);report.stage='read_complete';save();
  }catch(error){failure=error;report.failureCode=error.code??'READ_OR_CALLBACK_PROOF_FAILED';report.failure={...failureMetadata(error),stage:report.stage,check:report.check};try{save();}catch(saveError){report.proofWriteFailure=failureMetadata(saveError);}}
  finally{
    try{
      checkpoint('cleanup_quiesce','close_browser_page');if(page)await page.close();
      checkpoint('cleanup_quiesce','no_inflight_browser_requests');assert.equal(requests.size,0,'Browser requests not quiescent');quiesced=true;
      checkpoint('cleanup_attribution','complete_baseline_and_context');assert.ok(before&&identity&&context,'No complete before/callback proof');
      // No cleanup after an unknown callback, even when an earlier callback was known.
      checkpoint('cleanup_attribution','exact_successful_callbacks_and_owned_sessions');assert.equal(callbacks.length,authIds.size);assert.ok(appIds.size>0);assert.ok(callbacks.every(item=>item.status>=300&&item.status<400));
      checkpoint('cleanup_logout','logout_status_200');const logout=await context.request.post('/api/auth/logout',{headers:{Origin:baseURL,'Sec-Fetch-Site':'same-origin'}});assert.equal(logout.status(),200);
      checkpoint('cleanup_logout','logout_redirect_matches_issuer');const ended=await logout.json();assert.equal(new URL(ended.redirect).origin,new URL(target.idp.issuer).origin);
      checkpoint('cleanup_logout','logged_out_session_status_401');await context.request.get(ended.redirect);assert.equal((await context.request.get('/api/session')).status(),401);
      checkpoint('cleanup_quiesce','close_browser_context');await context.close();context=null;
      checkpoint('cleanup_before','capture_snapshot');const beforeCleanup=await snapshot();verifyPreservation(beforeCleanup,'cleanup_before');
      checkpoint('cleanup_ownership','exact_new_app_session_ids');assert.deepEqual(beforeCleanup.app.filter(item=>!before.app.some(old=>old.id===item.id)).map(item=>item.id).sort(),[...appIds].sort(),'Unknown new app session');
      checkpoint('cleanup_ownership','exact_new_auth_session_ids');assert.deepEqual(beforeCleanup.authSessions.filter(item=>!before.authSessions.some(old=>old.id===item.id)).map(item=>item.id).sort(),[...authIds].sort(),'Unknown new auth session');
      checkpoint('cleanup_ownership','new_refresh_tokens_owned');assert.ok(beforeCleanup.tokens.filter(item=>!before.tokens.some(old=>old.id===item.id)).every(item=>authIds.has(item.row.session_id)),'Unknown new refresh token');
      checkpoint('cleanup_ownership','new_mfa_claims_owned');assert.ok(beforeCleanup.claims.filter(item=>!before.claims.some(old=>old.id===item.id)).every(item=>authIds.has(item.row.session_id)),'Unknown new MFA claim');
      checkpoint('cleanup_transaction','lock_owned_sessions');await db.begin(async tx=>{
        await tx`select id from public.app_sessions where id=any(${[...appIds]}::uuid[]) and identity_id=${identity.id} for update`;
        const sessions=await tx`select id::text,user_id::text from auth.sessions where id=any(${[...authIds]}::uuid[]) for update`;
        checkpoint('cleanup_transaction','locked_auth_sessions_exact_owner');assert.equal(sessions.length,authIds.size);assert.ok(sessions.every(item=>item.user_id===identity.auth_user_id));
        checkpoint('cleanup_transaction','delete_exact_owned_sessions_and_children');await tx`delete from auth.refresh_tokens where session_id=any(${[...authIds]}::uuid[])`;
        checkpoint('cleanup_transaction','delete_owned_mfa_claims');await tx`delete from auth.mfa_amr_claims where session_id=any(${[...authIds]}::uuid[])`;
        checkpoint('cleanup_transaction','delete_owned_auth_sessions');await tx`delete from auth.sessions where id=any(${[...authIds]}::uuid[]) and user_id=${identity.auth_user_id}`;
        checkpoint('cleanup_transaction','delete_owned_app_sessions');await tx`delete from public.app_sessions where id=any(${[...appIds]}::uuid[]) and identity_id=${identity.id}`;
        checkpoint('cleanup_transaction','commit_owned_cleanup_pending');
      });
      checkpoint('cleanup_after','capture_snapshot');const after=await snapshot();verifyPreservation(after,'cleanup_after');
      for(const key of ['app','authSessions','tokens','claims']){checkpoint('cleanup_after',`exact_original_${key}_restored`);assert.deepEqual(after[key],before[key]);}
      report.after={business:after.business,app:safeRows(after.app),authSessions:safeRows(after.authSessions),tokens:safeRows(after.tokens),claims:safeRows(after.claims),audit:safeRows(after.audit),authAudit:safeRows(after.authAudit)};
      report.cleanup={quiesced,newAppSessionsRemoved:appIds.size,newGoTrueSessionsRemoved:authIds.size,oldSessionsPreserved:true,oldAuditPreserved:true,oldBusinessPreserved:true,loginMetadataOnly:true};cleanupComplete=true;
    }catch(error){failure??=error;report.cleanupFailureCode=error.code??'UNKNOWN_CALLBACK_OR_CLEANUP_PROOF_FAILED';report.cleanupFailure={...failureMetadata(error),stage:report.stage,check:report.check};}
    finally{
      if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
      report.status=!failure&&cleanupComplete?'PASS':'FAIL';report.stage=cleanupComplete?'complete':'private_recovery_required';report.quiesced=quiesced;report.finishedAt=new Date().toISOString();try{save();}catch(saveError){failure??=saveError;report.proofWriteFailure=failureMetadata(saveError);}
      if(lockFd!==undefined){closeSync(lockFd);if(cleanupComplete)unlinkSync(lockPath);}
    }
  }
  if(failure||!cleanupComplete){const error=Error('Delivery read failed; preserve private callback proof and review before cleanup',{cause:failure});error.code=failure?.code??'DELIVERY_READ_OR_CLEANUP_FAILED';error.proofPath=proofPath;error.proofSha256=sha(readFileSync(proofPath));error.failure=report.failure??report.cleanupFailure;error.cleanupFailure=report.cleanupFailure;error.proofWriteFailure=report.proofWriteFailure;throw error;}
  return{status:'PASS',proofPath,proofSha256:createHash('sha256').update(readFileSync(proofPath)).digest('hex'),read:report.read,cleanup:report.cleanup};
}

return readAplAfterDelivery;
})();

export function requireAplDeliveryIdentity({identities,authUsers,authIdentities,plans},subject){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
 assert.equal(identities.length,1,'Exact existing school mandate required');const identity=identities[0];
 assert.match(identity.id,uuid);assert.match(identity.auth_user_id,uuid);
 assert.equal(authUsers.filter(u=>u.id===identity.auth_user_id).length,1,'Existing GoTrue user required');
 const matched=authIdentities.filter(i=>i.user_id===identity.auth_user_id&&i.provider==='keycloak'&&i.identity_data?.sub===subject);
 assert.equal(matched.length,1,'Exact existing Keycloak metadata identity required');assert.match(matched[0].id,uuid);
 assert.ok(plans.length>0,'Selected scope requires an existing gym timetable');
 for(const p of plans)assert.match(p.id,uuid);
 return{identityId:identity.id,authUserId:identity.auth_user_id,metadataIdentityId:matched[0].id,planIds:plans.map(p=>p.id).sort()};
}
async function inspectDeliveryScope(db,target,file){
 const evidence=readEvidence(file),scope=evidence.value;
 for(const key of ['customerId','unitId','offeringId','assignmentId'])assert.match(scope[key],/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
 const configured=target.idp.users.find(u=>u.username==='p3.rektor');assert.ok(configured?.totp&&configured.subject);
 const credentials={};
 for(const name of ['phase3-users.json','totp-users.json']){const bytes=readFileSync(path.join(root,'work/pilot/targets/protected/idp',name)),values=JSON.parse(bytes);
  assert.equal(typeof values['p3.rektor'],'string');assert.ok(values['p3.rektor'].length>0);credentials[name]=sha(bytes);}
 const identities=await db`select i.id::text,i.auth_user_id::text from public.identities i join public.memberships m on m.identity_id=i.id
  join public.access_assignments a on a.membership_id=m.id join public.mandate_units mu on mu.assignment_id=a.id
  join public.offerings o on o.organizer_id=a.organizer_id join public.offering_units ou on ou.offering_id=o.id and ou.unit_id=mu.unit_id
  where i.issuer=${target.idp.issuer} and i.subject=${configured.subject} and a.id=${scope.assignmentId} and a.customer_id=${scope.customerId}
  and m.customer_id=${scope.customerId} and m.status='active' and a.function='rektor' and mu.unit_id=${scope.unitId}
  and o.id=${scope.offeringId} and o.kind='gymnasium' and public.phase3_mandate_is_valid(a.id)`;
 const userId=identities[0]?.auth_user_id;assert.ok(userId);
 const authUsers=await db`select id::text from auth.users where id=${userId}`;
 const authIdentities=await db`select id::text,user_id::text,provider,identity_data from auth.identities where user_id=${userId}`;
 const plans=await db`select id::text from public.timplans where offering_id=${scope.offeringId} and unit_id=${scope.unitId} and gym_basis is not null and source_programplan_id is not null order by id`;
 const identity=requireAplDeliveryIdentity({identities,authUsers,authIdentities,plans},configured.subject);
 const tokenReply=await fetch(target.idp.publicUrl+'/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:target.idp.adminUser,password:target.idp.adminPassword}),signal:AbortSignal.timeout(15000)});
 assert.ok(tokenReply.ok);const token=(await tokenReply.json()).access_token;
 const prefix=target.idp.publicUrl+'/admin/realms/'+new URL(target.idp.issuer).pathname.split('/').pop()+'/users/'+encodeURIComponent(configured.subject);
 const get=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});assert.ok(r.ok);return r.json();};
 const remote=await get(prefix);assert.equal(remote.id,configured.subject);assert.equal(remote.username,'p3.rektor');assert.equal(remote.enabled,true);
 assert.ok((await get(prefix+'/credentials')).some(c=>c.type==='otp'),'Existing synthetic MFA credential required');
 return{scope,proof:{scopeEvidence:{path:evidence.path,sha256:evidence.sha256},...identity,credentials,remoteIdentityVerified:true}};
}

/** Read-only preparation before permanent installation. It binds the exact current process and candidate. */
export async function prepareAplDelivery({sqlEvidence,apiEvidence,out,previousRuntime,scope,packageId='apl-plan'}){
 const sink=reserveDeliveryReport(out,'apl-plan-delivery-preparation','--prepare'),r=sink.report;let db;
 try{
  r.packageId=packageId;r.deliverySourceSha256=ownSource(packageId);const proof=deliveryPackage(packageId).readPackageEvidence({sqlEvidence,apiEvidence});
  const target=await assertTarget('protected',{requireIdp:true});db=connect(target);r.scopePreparation=(await inspectDeliveryScope(db,target,scope)).proof;r.target=await classCohortTargetIdentity(db,target);
  r.beforeFingerprint=await schemaFingerprint(db);assert.equal(r.beforeFingerprint,proof.sql.value.baseline.fingerprint);
  r.beforeRuntime=localRuntime();r.beforeArtifact=artifactManifest(destination);r.beforeConfiguration=privateConfiguration(target);
  r.previousRuntimeEvidence=readEvidence(previousRuntime);r.beforeBusiness=await businessHashes(db);
  requirePreviousRuntimeProof(r.previousRuntimeEvidence.value,r.beforeArtifact,r.beforeRuntime,{business:r.beforeBusiness,configuration:r.beforeConfiguration});
  r.previousRuntimeEvidence={path:r.previousRuntimeEvidence.path,sha256:r.previousRuntimeEvidence.sha256};
  r.beforeHealth=await health();r.sql={path:proof.sql.path,sha256:proof.sql.sha256};r.api={path:proof.api.path,sha256:proof.api.sha256};
  r.testedBuild={root:proof.buildRoot,revision:proof.api.value.build.revision,artifact:proof.api.value.finalArtifact};r.packages=proof.packages;
  r.oldWorkerCompatibleAfterCommit=false;r.databaseUnchanged=true;r.runtimeUnchanged=true;r.status='PASS';delete r.failureCode;
 }catch(error){r.failure=failureMetadata(error);}
 finally{if(db)try{await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.databaseClosed=false;}r.stage='finished';r.finishedAt=new Date().toISOString();sink.close();}
 return r;
}
export function requirePreparedTransfer(prepared,{source,target,previousRuntime,artifact,configuration,build,sql,api,scopePreparation,packageId='apl-plan'}){
 deliveryPackage(packageId);assert.equal(prepared.packageId??'apl-plan',packageId,'Prepared package mismatch');
 assert.equal(prepared.kind,'apl-plan-delivery-preparation');assert.equal(prepared.mode,'--prepare');assert.equal(prepared.status,'PASS');
 assert.equal(prepared.databaseClosed,true);assert.equal(prepared.databaseUnchanged,true);assert.equal(prepared.runtimeUnchanged,true);
 assert.equal(prepared.deliverySourceSha256,source);assert.deepEqual(prepared.target,target);
 assert.deepEqual(prepared.beforeRuntime,previousRuntime);assert.deepEqual(prepared.beforeArtifact,artifact);assert.deepEqual(prepared.beforeConfiguration,configuration);
 assert.deepEqual(prepared.scopePreparation,scopePreparation);assert.deepEqual(prepared.testedBuild,build);assert.deepEqual(prepared.sql,sql);assert.deepEqual(prepared.api,api);
}
export function recordAplTransferFailure(report){
 if(report.databasePackageInstalled){report.recoveryRequired=true;report.applicationRollbackRestoresCompatibility=false;}
}
export async function deliverAplPlan(mode,{evidence,out,scope,previousRuntime,prepared,sqlEvidence,apiEvidence,packageId='apl-plan'}){
 deliveryPackage(packageId);
 if(mode==='--prepare')return prepareAplDelivery({sqlEvidence,apiEvidence,out,previousRuntime,scope,packageId});
 const sink=reserveDeliveryReport(out,'apl-plan-local-delivery',mode),r=sink.report;let db,locked=false,completed=false,stopAttempted=false,stopped=false,movedOld=false,swapped=false,newRuntime,newManager,backup,transferRoot;
 try{
  assert.ok(['--verify','--apply'].includes(mode));r.packageId=packageId;r.deliverySourceSha256=ownSource(packageId);
  const input=readEvidence(evidence),prior=mode==='--apply'?input.value:null;
  if(prior){assert.equal(prior.packageId??'apl-plan',packageId);assert.equal(prior.kind,'apl-plan-local-delivery');assert.equal(prior.status,'PASS');assert.equal(prior.mode,'--verify');assert.equal(prior.databaseClosed,true);assert.equal(prior.deliverySourceSha256,r.deliverySourceSha256);}
  const target=await assertTarget('protected');db=connect(target);assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true);locked=true;
  const proof=await acceptance(prior?prior.acceptance.path:evidence,db,target,packageId);r.acceptance={path:prior?prior.acceptance.path:path.resolve(evidence),sha256:proof.sha256};r.databasePackageInstalled=true;r.oldWorkerCompatible=false;if(prior)assert.deepEqual(r.acceptance,prior.acceptance);
  const scoped=await inspectDeliveryScope(db,target,scope),selected=scoped.scope;r.scopePreparation=scoped.proof;r.scopeEvidence=scoped.proof.scopeEvidence;
  r.beforeRuntime=localRuntime();r.beforeArtifact=artifactManifest(destination);const previous=readEvidence(prior?prior.previousRuntimeEvidence.path:previousRuntime);r.previousRuntimeEvidence={path:previous.path,sha256:previous.sha256};if(prior)assert.deepEqual(r.previousRuntimeEvidence,prior.previousRuntimeEvidence);r.beforeConfiguration=privateConfiguration(target);r.beforeBusiness=await businessHashes(db);const cleanupProof=previous.value.status==='FAIL'&&previous.value.readOnlyOidc?.proofPath?readEvidence(previous.value.readOnlyOidc.proofPath):undefined;requirePreviousRuntimeProof(previous.value,r.beforeArtifact,r.beforeRuntime,{cleanupProof,business:r.beforeBusiness,configuration:r.beforeConfiguration});r.beforeHealth=await health();
  if(prior)for(const key of ['scopeEvidence','beforeRuntime','beforeArtifact','beforeConfiguration','beforeBusiness'])assert.deepEqual(r[key],prior[key],`Preflight changed: ${key}`);
  r.testedBuild={root:proof.build.buildRoot,revision:proof.build.buildRevision,artifact:proof.build.artifact};r.sqlEvidenceSha256=proof.sql.evidenceSha256;
  const preparation=readEvidence(prior?prior.preparedEvidence.path:prepared);r.preparedEvidence={path:preparation.path,sha256:preparation.sha256};if(prior)assert.deepEqual(r.preparedEvidence,prior.preparedEvidence);
  requirePreparedTransfer(preparation.value,{source:r.deliverySourceSha256,target:await classCohortTargetIdentity(db,target),previousRuntime:r.beforeRuntime,
   artifact:r.beforeArtifact,configuration:r.beforeConfiguration,build:r.testedBuild,sql:proof.report.sql,api:proof.report.api,scopePreparation:r.scopePreparation,packageId});
  assert.deepEqual(preparation.value.packages,proof.report.packages);assert.equal(preparation.value.beforeFingerprint,proof.report.beforeFingerprint);
  if(mode==='--apply'){
   transferRoot=path.join(root,'work/pilot/targets/protected/runtime',`apl-plan-delivery-${randomUUID()}`);mkdirSync(transferRoot,{mode:0o700});
   const incoming=path.join(transferRoot,'tested-artifact');backup=path.join(transferRoot,'previous-artifact');r.transferRoot=transferRoot;r.backup=backup;
   copyArtifact(proof.build.buildRoot,incoming,proof.build.artifact);r.stage='stop_pending';sink.save();
   await stopRuntime(r.beforeRuntime,()=>{stopAttempted=true;r.stopAttempted=true;sink.save();});stopped=true;renameSync(destination,backup);movedOld=true;renameSync(incoming,destination);swapped=true;r.stage='start_pending';sink.save();
   newRuntime=await startRuntime(path.join(path.dirname(out),`${r.runId}-preview.log`),manager=>{newManager=manager;r.newManager=manager;sink.save();});r.afterRuntime=newRuntime;
   assert.deepEqual(artifactManifest(destination),proof.build.artifact);assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);
   r.stage='readonly_oidc_pending';sink.save();
   const readEvidenceDir=path.join(path.dirname(out),r.runId+'-readonly');mkdirSync(readEvidenceDir,{mode:0o700});
   r.readOnlyOidc=await readOnlyOidc({db,target,baseURL,scope:selected,evidenceDir:readEvidenceDir});
   r.afterArtifact=artifactManifest(destination);assert.deepEqual(r.afterArtifact,proof.build.artifact);assert.deepEqual(privateConfiguration(target),r.beforeConfiguration);r.afterHealth=await health();r.applied=true;r.candidateCompatible=true;r.recoveryRequired=false;
  }
  r.afterBusiness=await businessHashes(db);assert.deepEqual(r.afterBusiness,r.beforeBusiness);assert.equal(ownSource(packageId),r.deliverySourceSha256);completed=true;
 }catch(error){
  recordAplTransferFailure(r);
  r.failureCode=error.code??'delivery_verification_failed';r.failedStage=r.stage;
  if(error.proofPath)r.readOnlyOidc={status:'FAIL',proofPath:error.proofPath,proofSha256:error.proofSha256,failure:error.failure,cleanupFailure:error.cleanupFailure,proofWriteFailure:error.proofWriteFailure};
  try{sink.save();}catch(saveError){r.proofWriteFailure=failureMetadata(saveError);}
  if(stopAttempted&&!stopped){try{
   for(const p of Object.values(r.beforeRuntime)){let present=false;try{processInfo(p.pid);present=true;}catch{}assert.equal(present,false,'A previous process is still present');}
   let listening=false;try{listening=Boolean(command('lsof',['-nP','-a','-iTCP:3012','-sTCP:LISTEN','-Fp']));}catch{}assert.equal(listening,false);
   assert.deepEqual(artifactManifest(destination),r.beforeArtifact);
   for(const [name,expected]of [['.dev.vars',r.beforeConfiguration.varsSha256],['.dev.vars.lock',r.beforeConfiguration.lockSha256]]){const file=path.join(destination,'server',name);if(existsSync(file)){assert.equal(sha(readFileSync(file)),expected,'Private residue changed');unlinkSync(file);}}
   stopped=true;r.partialStopResolved=true;
  }catch{r.recoveryRequired=true;r.runtimeRestored=false;}}
  if(stopped){try{
   if(newRuntime)await stopRuntime(newRuntime);
   else if(newManager)await stopOwnStartingManager(newManager);
   if(swapped)renameSync(destination,path.join(transferRoot,'failed-artifact'));
   if(movedOld)renameSync(backup,destination);
   assert.deepEqual(artifactManifest(destination),r.beforeArtifact);assert.equal(sha(readFileSync(path.join(root,'work/pilot/targets/protected/manifest.json'))),r.beforeConfiguration.manifestSha256,'Private target changed before rollback');
   r.restoredRuntime=await startRuntime(path.join(path.dirname(out),`${r.runId}-restored-preview.log`));
   assert.deepEqual(privateConfiguration(await assertTarget('protected')),r.beforeConfiguration);r.runtimeRestored=true;
  }catch{r.runtimeRestored=false;r.recoveryRequired=true;}}
 }finally{
  if(db){try{if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch{completed=false;r.databaseClosed=false;}}
  r.status=completed?'PASS':'FAIL';r.stage='finished';r.finishedAt=new Date().toISOString();if(completed)delete r.failureCode;sink.close();
 }
 console.log(`${r.status}: local APL delivery ${mode}; applied=${r.applied===true}; restored=${r.runtimeRestored===true}`);return r;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),mode=args.shift(),options={},keys={'--evidence':'evidence','--out':'out','--scope':'scope','--previous-runtime':'previousRuntime','--prepared':'prepared','--sql-evidence':'sqlEvidence','--api-evidence':'apiEvidence','--package':'packageId'};
  for(let i=0;i<args.length;i+=2){assert.ok(Object.hasOwn(keys,args[i])&&args[i+1]);const key=keys[args[i]];assert.ok(!options[key]);options[key]=key==='packageId'?args[i+1]:path.resolve(args[i+1]);}
  assert.ok(options.out&&options.scope);if(mode!=='--prepare')assert.ok(options.evidence);
  const r=await deliverAplPlan(mode,options);if(r.status!=='PASS')process.exitCode=1;
 }catch{console.error('FAIL: local APL delivery preflight');process.exitCode=1;}
}

// Shared, unchanged local-transfer mechanics for code-only packages.
export { reserveDeliveryReport, failureMetadata, health, privateConfiguration, businessHashes, stopRuntime, startRuntime, stopOwnStartingManager, inspectDeliveryScope, readOnlyOidc };
