#!/usr/bin/env node
// Actual local browser OIDC -> callback -> protected Worker -> SQL evidence.
// Importing this module performs no environment, database, IdP or browser action.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {openSync,closeSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClassCohortOidcFixture,classCohortApiSourceHashes,verifyClassCohortBuild} from './phase5-class-cohort-oidc-fixtures.mjs';
import {parseClassCohortUnderlag,parseClassCohortCreateReply,parseClassCohortStatusReply} from '../../web/lib/class-cohort.ts';
import {parseClassPlanUnderlag} from '../../web/lib/class-timplan.ts';
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const ROOT='/api/klasser/organisation/';
const classesById=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
export const REQUIRED_API_CHECKS=[
 'real OIDC roles and server MFA','draft education has empty class list','principal batch creates stable dated classes without pupils or timplan links',
 'paired DB and Worker class audit','same command replay preserves IDs','changed request with same command rejected','different actor cannot claim command',
 'name conflict rolls back entire batch','head organizer read only','other school denied','controlled other customer denied','real context switch invalidates prior request and status','no cookie denied','cross origin denied','stale epoch denied',
 'strict malformed request denied','unknown command status is not found','MFA expiry denies create but permits status','real step up restores MFA',
 'source revision changed requires review','spring start uses previous school year','worker audit failure rolls back class and receipt',
 'dropped real HTTP response resolves through status without duplicate','same education version retains class identities',
 'copy next cohort starts without classes or links','explicit class year and approved timplan link','school year before education start denied','new approved timplan keeps previous explicit link',
 'explicit version switch keeps class identity','expired real callback session denied',
];

/** A one-shot transport failure: the upstream Worker commits; its response never reaches the client.
 * No fabricated response and no browser route interception. The next status request goes directly
 * to the real Worker using the same actual OIDC browser context. */
export async function dropOneRealResponse(baseURL,send){
 let resolveUpstream,rejectUpstream;
 const upstream=new Promise((yes,no)=>{resolveUpstream=yes;rejectUpstream=no;});let used=false;
 upstream.catch(()=>{});
 const server=createServer(async(req,res)=>{
  try{assert.equal(used,false);used=true;assert.equal(req.method,'POST');assert.equal(req.url,ROOT+'skapa');
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const headers={...req.headers,host:new URL(baseURL).host,origin:baseURL};delete headers.connection;delete headers['content-length'];
   const response=await fetch(baseURL+req.url,{method:'POST',headers,body,signal:AbortSignal.timeout(30000)});
   const bytes=await response.arrayBuffer();assert.equal(response.status,200,'Upstream must commit before the intentional response loss');
   resolveUpstream({status:response.status,bytes:bytes.byteLength,correlationId:response.headers.get('x-correlation-id'),responseDiscarded:true});res.destroy();
  }catch(error){rejectUpstream(error);res.destroy();}
 });
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
 try{let transportFailed=false;try{await send(`http://127.0.0.1:${server.address().port}`);}catch{transportFailed=true;}
  const evidence=await upstream;assert.equal(transportFailed,true,'The caller must not receive a successful HTTP response');return{...evidence,clientTransportFailed:true};
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

export function parseClassCohortApiArgs(args){
 const options={};for(let i=0;i<args.length;i++){assert.ok(['--base-url','--out','--sql-evidence'].includes(args[i]),'Unknown API verifier argument');assert.ok(args[i+1]);assert.ok(!(args[i]in options),'Duplicate argument');options[args[i]]=args[++i];}
 const baseURL=options['--base-url'],out=resolve(options['--out']??'');assert.match(baseURL??'',/^http:\/\/127\.0\.0\.1:\d+$/u);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));
 const evidenceDir=dirname(out);assert.equal(statSync(evidenceDir).mode&0o077,0,'Use a private evidence directory');
 return{baseURL,out,evidenceDir,sqlEvidencePath:options['--sql-evidence']??process.env.CLASS_COHORT_SQL_EVIDENCE_PATH};
}
/** Read-only plan09 gate. Revalidates current build/source and the same applied SQL target. */
export async function requireClassCohortApiEvidence({evidencePath,db,target,sqlEvidencePath,baseURL}){
 const bytes=readFileSync(resolve(evidencePath)),report=JSON.parse(bytes);
 assert.equal(report.kind,'class-cohort-real-oidc-api');assert.equal(report.status,'PASS');assert.equal(report.scope,'local-synthetic-only');
 assert.deepEqual(report.checks.map(c=>c.name),REQUIRED_API_CHECKS);assert.ok(report.checks.every(c=>c.ok===true&&!c.skipped));
 assert.ok(report.cleanup?.originalBusinessPreserved&&report.cleanup.originalAnchorsPreserved&&report.cleanup.sourceUnchanged&&report.cleanup.artifactUnchanged);
 assert.equal(report.cleanup.pendingBeforeDelete,0);assert.equal(report.cleanup.unresolvedCommands,0);assert.deepEqual(report.cleanup.before,report.cleanup.after);
 assert.deepEqual(report.sourceHashes,classCohortApiSourceHashes());assert.deepEqual(report.finalSourceHashes,report.sourceHashes);
 const {requireAppliedEvidence}=await import('./verify-class-cohort.mjs');const sql=await requireAppliedEvidence({evidencePath:sqlEvidencePath,db,target});assert.equal(report.sqlProof.evidenceSha256,sql.evidenceSha256);
 const build=await verifyClassCohortBuild(baseURL);assert.deepEqual(report.buildProof.artifact,build.artifact);assert.equal(report.buildProof.buildRevision,build.buildRevision);
 return{evidenceSha256:sha(bytes),sqlEvidenceSha256:sql.evidenceSha256,buildRevision:build.buildRevision,artifactSha256:build.artifact.sha256,checkCount:report.checks.length};
}

export async function runClassCohortApi(options){
 const {baseURL,out,evidenceDir,sqlEvidencePath}=options;const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'class-cohort-real-oidc-api',schemaVersion:1,status:'FAIL',scope:'local-synthetic-only',checks:[],startedAt:new Date().toISOString()};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 let fixture,browser,failure;
 const check=async(name,action)=>{assert.equal(name,REQUIRED_API_CHECKS[report.checks.length]);await action();report.checks.push({name,ok:true});save();};
 try{
  fixture=await createClassCohortOidcFixture({baseURL,evidenceDir,evidencePath:resolve(evidenceDir,`fixture-${randomUUID()}.json`),sqlEvidencePath});
  report.buildProof=fixture.buildProof;report.sourceHashes=fixture.sourceHashes;report.sqlProof=fixture.sqlProof;save();
  browser=await require('@playwright/test').chromium.launch();const actors={};
  for(const role of ['hm','principal','admin','second']){const context=await browser.newContext({baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm'}),page=await context.newPage();actors[role]={context,page,proof:await fixture.login(page,role,{stepUp:true})};}
  const call=(role,route,input,opts)=>fixture.request(actors[role].context,role,route,input,opts);
  const exact=async(role,route,input,status=200,code,opts)=>{const reply=await call(role,route,input,opts);assert.equal(reply.status,status,`${route}: ${reply.body?.code??'response'}`);if(code)assert.equal(reply.body.code,code);return reply;};
  const read=async(education,role='principal')=>{const input={offeringId:education.offeringId,unitId:education.unitId};return parseClassCohortUnderlag((await exact(role,ROOT+'underlag',input)).body,input);};
  const command=(basis,names)=>({commandId:randomUUID(),offeringId:basis.offeringId,unitId:basis.unitId,expectedEducationRevision:basis.educationRevision,expectedSourceToken:basis.sourceToken,startsOn:basis.educationStartsOn,names});
  let education,basis,input,receipt,creation,classesBefore;
  await check('real OIDC roles and server MFA',async()=>{for(const actor of Object.values(actors)){assert.equal(actor.proof.mfa,true);assert.equal(actor.proof.realOidcCallback,true);}assert.equal(new Set(Object.values(actors).map(a=>a.proof.identityId)).size,4);report.oidc=Object.fromEntries(Object.entries(actors).map(([role,a])=>[role,a.proof]));});
  education=await fixture.prepareEducation(actors.hm.context,actors.principal.context,{name:'Syntetisk API klassorganisation',startedOn:fixture.scope.futureStart});
  await check('draft education has empty class list',async()=>{basis=await read(education);assert.deepEqual(basis.classes,[]);assert.deepEqual(basis.blockers,[]);assert.equal(basis.canManage,true);assert.equal((await fixture.source(education.planId)).status,'utkast');});
  input=command(basis,['KLASS B','ÅÄÖ A']);
  await check('principal batch creates stable dated classes without pupils or timplan links',async()=>{creation=await exact('principal',ROOT+'skapa',input);receipt=parseClassCohortCreateReply(creation.body,input);assert.equal(receipt.replayed,false);assert.equal(receipt.classes.length,2);const state=await fixture.inspect(education.offeringId);assert.deepEqual(state.links,[]);assert.deepEqual(state.memberships,[]);assert.deepEqual(state.placements,[]);assert.equal(state.receipts.length,1);classesBefore=(await read(education)).classes;assert.deepEqual(classesById(classesBefore),classesById(receipt.classes));});
  await check('paired DB and Worker class audit',async()=>{const events=await fixture.audit(creation.correlationId),actor=actors.principal.proof;const batch=events.filter(e=>e.action==='class_cohort_created');assert.deepEqual(batch.map(e=>e.source).sort(),['db','worker']);for(const event of batch){assert.equal(event.actor_identity_id,actor.identityId);assert.equal(event.membership_id,actor.membershipId);assert.equal(event.assignment_id,actor.assignmentId);assert.equal(event.session_id,actor.sessionId);assert.equal(event.outcome,'ok');assert.equal(event.object_id,input.commandId);}assert.equal(events.filter(e=>e.action==='class_created'&&e.source==='db').length,2);});
  await check('same command replay preserves IDs',async()=>{const replay=parseClassCohortCreateReply((await exact('principal',ROOT+'skapa',input)).body,input);assert.equal(replay.replayed,true);assert.deepEqual(replay.classes,receipt.classes);});
  await check('changed request with same command rejected',()=>exact('principal',ROOT+'skapa',{...input,names:['CHANGED']},409));
  await check('different actor cannot claim command',()=>exact('admin',ROOT+'skapa',input,409));
  await check('name conflict rolls back entire batch',async()=>{const before=await fixture.inspect(education.offeringId);await exact('principal',ROOT+'skapa',{...input,commandId:randomUUID(),names:['NEW FIRST','KLASS B']},409,'class_name_year_conflict');assert.deepEqual(await fixture.inspect(education.offeringId),before);});
  await check('head organizer read only',async()=>{assert.equal((await read(education,'hm')).canManage,false);await exact('hm',ROOT+'skapa',{...input,commandId:randomUUID(),names:['NO HM']},403);await exact('hm',ROOT+'status',input,403);});
  await check('other school denied',async()=>{await exact('second',ROOT+'underlag',{offeringId:education.offeringId,unitId:education.unitId},403);await exact('second',ROOT+'skapa',{...input,commandId:randomUUID(),names:['NO SCHOOL']},403);await exact('second',ROOT+'status',input,403);});
  await check('controlled other customer denied',async()=>{const foreign={offeringId:fixture.scope.foreignOfferingId,unitId:fixture.scope.foreignUnitId};await exact('principal',ROOT+'underlag',foreign,403);await exact('principal',ROOT+'skapa',{...input,...foreign,commandId:randomUUID(),names:['NO CUSTOMER']},403);await exact('principal',ROOT+'status',{...input,...foreign},403);});
  await check('real context switch invalidates prior request and status',async()=>{const selected=await fixture.switchAssignment(actors.second.context,'second',true);const q=command(await read(education,'second'),['OLD CONTEXT']);await fixture.switchAssignment(actors.second.context,'second',false);
   for(const route of ['skapa','status']){await exact('second',ROOT+route,q,409,'context_changed',{headers:{'X-Context-Epoch':String(selected.epoch)}});await exact('second',ROOT+route,q,403);}
   const reselected=await fixture.switchAssignment(actors.second.context,'second',true);assert.ok(reselected.epoch>selected.epoch);for(const route of ['skapa','status'])await exact('second',ROOT+route,q,409,'context_changed',{headers:{'X-Context-Epoch':String(selected.epoch)}});await fixture.switchAssignment(actors.second.context,'second',false);
  });
  await check('no cookie denied',async()=>{const context=await browser.newContext({baseURL});try{const r=await context.request.post(ROOT+'underlag',{data:{offeringId:education.offeringId,unitId:education.unitId}});assert.equal(r.status(),401);}finally{await context.close();}});
  await check('cross origin denied',()=>exact('principal',ROOT+'skapa',{...input,commandId:randomUUID(),names:['CROSS']},403,undefined,{headers:{Origin:'https://foreign.invalid','Sec-Fetch-Site':'cross-site'}}));
  await check('stale epoch denied',()=>exact('principal',ROOT+'skapa',{...input,commandId:randomUUID(),names:['EPOCH']},409,'context_changed',{headers:{'X-Context-Epoch':String(actors.principal.proof.epoch+1)}}));
  await check('strict malformed request denied',async()=>{for(const changed of [{...input,names:[]},{...input,names:['lowercase']},{...input,extra:'not allowed'},{...input,startsOn:'2027-02-30'}])await exact('principal',ROOT+'skapa',changed,400,'bad_request');});
  await check('unknown command status is not found',async()=>{const unknown={...input,commandId:randomUUID(),names:['UNKNOWN']};assert.equal(parseClassCohortStatusReply((await exact('principal',ROOT+'status',unknown)).body,unknown).status,'not_found');});
  await check('MFA expiry denies create but permits status',async()=>{await fixture.expireMfa(actors.principal.context,'principal');await exact('principal',ROOT+'skapa',{...input,commandId:randomUUID(),names:['MFA DENIED']},403,'mfa_required');assert.equal(parseClassCohortStatusReply((await exact('principal',ROOT+'status',input)).body,input).status,'found');});
  await check('real step up restores MFA',async()=>{await actors.principal.page.goto(baseURL+'/api/auth/login?step_up=1');const proof=await fixture.completeStepUp(actors.principal.page,'principal');assert.equal(proof.mfa,true);assert.equal(proof.sessionId,actors.principal.proof.sessionId);});
  await check('source revision changed requires review',async()=>{const stale=command(await read(education),['STALE']);const source=await fixture.source(education.planId);await exact('principal','/api/programplaner/block',{planId:education.planId,expectedRevision:source.revision,choiceBlocks:source.basis_reference.choiceBlocks.map(b=>b.kind==='specialization'?{...b,name:'Ändrad syntetisk rubrik'}:b)});await exact('principal',ROOT+'skapa',stale,409,'conflict');assert.deepEqual((await read(education)).classes,classesBefore);});
  await check('spring start uses previous school year',async()=>{const spring=await fixture.prepareEducation(actors.hm.context,actors.principal.context,{name:'Syntetisk API vår',startedOn:fixture.scope.springStart});const b=await read(spring),q=command(b,['VÅR A']);const r=parseClassCohortCreateReply((await exact('admin',ROOT+'skapa',q)).body,q);assert.equal(r.classes[0].cohortStartYear,Number(fixture.scope.springStart.slice(0,4))-1);assert.equal(r.classes[0].startsOn,fixture.scope.springStart);assert.deepEqual((await fixture.inspect(spring.offeringId)).links,[]);});
  await check('worker audit failure rolls back class and receipt',async()=>{const before=await fixture.inspect(education.offeringId);await fixture.auditFailure('worker');try{await exact('principal',ROOT+'skapa',command(await read(education),['AUDIT FAIL']),500);}finally{await fixture.clearAuditFailure();}assert.deepEqual(await fixture.inspect(education.offeringId),before);});
  await check('dropped real HTTP response resolves through status without duplicate',async()=>{const q=command(await read(education),['LOST RESPONSE']);report.transport=await dropOneRealResponse(baseURL,proxy=>call('principal',ROOT+'skapa',q,{baseURL:proxy}));const status=parseClassCohortStatusReply((await exact('principal',ROOT+'status',q)).body,q);assert.equal(status.status,'found');const replay=parseClassCohortCreateReply((await exact('principal',ROOT+'skapa',q)).body,q);assert.equal(replay.replayed,true);assert.deepEqual(replay.classes,status.receipt.classes);await fixture.resolvePending(actors.principal.context,'principal');assert.equal((await read(education)).classes.filter(c=>c.name==='LOST RESPONSE').length,1);});
  const stableClasses=(await read(education)).classes;
  await check('same education version retains class identities',async()=>{await fixture.approveProgramplan({hm:actors.hm.context,principal:actors.principal.context},education);assert.deepEqual((await read(education)).classes,stableClasses);const p=await fixture.source(education.planId);const cloned=(await exact('principal','/api/programplaner/klona',{sourcePlanId:p.id,expectedSourceRevision:p.revision,expectedLatestVersion:p.version,explicitLegacyBasis:null})).body;assert.notEqual(cloned.id,p.id);assert.equal(cloned.offeringId,education.offeringId);education={...education,planId:cloned.id};assert.deepEqual((await read(education)).classes,stableClasses);});
  await check('copy next cohort starts without classes or links',async()=>{const p=await fixture.source(education.planId),state=await fixture.inspect(education.offeringId);const start=`${Number(fixture.scope.futureStart.slice(0,4))+1}${fixture.scope.futureStart.slice(4)}`;
   const copy=(await exact('hm','/api/programplaner/utbildning/kopiera',{commandId:randomUUID(),sourcePlanId:p.id,expectedSourceRevision:p.revision,expectedEducationRevision:state.offering.lifecycle_revision,unitId:education.unitId,name:'Syntetisk nästa API-kull',localCode:null,cohort:'Nästa syntetiska kull',basisReference:{...p.basis_reference,startedOn:start}})).body;
   assert.deepEqual((await read({offeringId:copy.education.id,unitId:education.unitId})).classes,[]);assert.deepEqual((await fixture.inspect(copy.education.id)).links,[]);assert.deepEqual((await read(education)).classes,stableClasses);
  });
  let gym,link,basisLink;
  await check('explicit class year and approved timplan link',async()=>{gym=await fixture.approveTimplan({hm:actors.hm.context,principal:actors.principal.context},education);const schoolYear=Number(education.startedOn.slice(0,4));const q={planId:gym.id,schoolYear};basisLink=parseClassPlanUnderlag((await exact('principal','/api/klasser/underlag',q)).body,q);assert.deepEqual(basisLink.linkedClasses,[]);link={commandId:randomUUID(),classId:receipt.classes[0].id,schoolYear,planId:gym.id,expectedPlanRevision:basisLink.plan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};const linked=(await exact('principal','/api/klasser/koppla',link)).body;assert.equal(linked.classId,link.classId);assert.equal(linked.planId,gym.id);assert.equal(linked.revision,0);assert.deepEqual((await read(education)).classes,stableClasses);});
  await check('school year before education start denied',()=>exact('principal','/api/klasser/koppla',{...link,commandId:randomUUID(),schoolYear:link.schoolYear-1},400));
  let next;
  await check('new approved timplan keeps previous explicit link',async()=>{next=await fixture.approveTimplan({hm:actors.hm.context,principal:actors.principal.context},{...education,predecessorPlanId:gym.id,expectedPredecessorRevision:basisLink.plan.revision});const state=await fixture.inspect(education.offeringId);assert.equal(state.links.length,1);assert.equal(state.links[0].row.timplan_id,gym.id);assert.equal(state.links[0].row.class_id,link.classId);});
  await check('explicit version switch keeps class identity',async()=>{const q={planId:next.id,schoolYear:link.schoolYear},b=parseClassPlanUnderlag((await exact('principal','/api/klasser/underlag',q)).body,q);const switched=(await exact('principal','/api/klasser/koppla',{...link,commandId:randomUUID(),planId:next.id,expectedPlanRevision:b.plan.revision,expectedLinkRevision:0,previousPlanId:gym.id})).body;assert.equal(switched.revision,1);const state=await fixture.inspect(education.offeringId);assert.equal(state.links[0].row.timplan_id,next.id);assert.equal(state.links[0].row.class_id,link.classId);assert.deepEqual((await read(education)).classes,stableClasses);});
  await check('expired real callback session denied',async()=>{await fixture.expireSession(actors.admin.context,'admin');await exact('admin',ROOT+'underlag',{offeringId:education.offeringId,unitId:education.unitId},401,'session_expired');});
 }catch(error){failure=error;report.failure={code:error.code??'ASSERTION',message:String(error.message).split('\n')[0].slice(0,250),location:error.stack?.split('\n').find(line=>line.includes('verify-class-cohort-api.mjs:'))?.trim()};}
 finally{
  if(fixture)try{report.cleanup=await fixture.cleanup();}catch(error){failure??=error;report.cleanupFailure={code:error.code??'ASSERTION',message:String(error.message).split('\n')[0].slice(0,250)};}
  if(browser)await browser.close();
  try{report.finalSourceHashes=classCohortApiSourceHashes();assert.deepEqual(report.sourceHashes,report.finalSourceHashes);}catch(error){failure??=error;}
  report.status=!failure&&report.checks.length===REQUIRED_API_CHECKS.length?'PASS':'FAIL';report.finishedAt=new Date().toISOString();save();
 }
 return report;
}
async function main(){const options=parseClassCohortApiArgs(process.argv.slice(2));const report=await runClassCohortApi(options);console.log(`${report.status}: ${report.checks.length}/${REQUIRED_API_CHECKS.length} real OIDC/Worker API checks; cleanup ${report.cleanup?.originalBusinessPreserved===true?'PASS':'FAIL'}.`);if(report.status!=='PASS')process.exitCode=1;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('FAIL: class-cohort API verification refused; inspect the private report.');process.exitCode=1;});
