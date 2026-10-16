#!/usr/bin/env node
// Focused APL-04/04A grant and real SQL→server parity proof. Not HTTP/OIDC UAT.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, openSync, closeSync, ftruncateSync, writeSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { approvedClassFixture } from './verify-class-timplans.mjs';
import { aplSources, aplActor, aplDraftFromApproved, installAplCommands, aplPreparedDraft, aplSave } from './verify-apl-plan-commands.mjs';
import { installAplDecisions, aplDecisionRequest, aplDecisionMigration } from './verify-apl-plan-decisions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(resolve(root,'web/package.json')),postgres=require('postgres');
const migration='supabase/migrations/20261016122000_apl_worker_access.sql';
const expectedGrants=['phase5_apl_plan_read(uuid)','phase5_apl_plan_command(jsonb)','phase5_apl_plan_status(jsonb)'].sort();
const localSignature=value=>value.replace(/^public\./u,'');
const rollback=Error('expected_apl_access_rollback');
const sources=()=>aplSources([aplDecisionMigration,migration,'work/pilot/verify-apl-plan-access.mjs',
 'web/lib/server/apl-plan.ts','web/lib/server/plan-decision.ts','web/lib/plan-decision.ts',
 'web/app/api/planbeslut/underlag/route.ts','web/app/api/planbeslut/andra/route.ts',
 'web/app/api/planbeslut/inkorg/route.ts','web/app/api/planbeslut/lista/route.ts',
 'web/app/api/timplaner/gym/apl/lasa/route.ts','web/app/api/timplaner/gym/apl/kommando/route.ts','web/app/api/timplaner/gym/apl/status/route.ts']);
const ok=(report,name)=>{report.checks.push({name,ok:true});console.log('PASS: '+name);};
async function loadServer() {
 const ts=require('typescript');
 const hook=registerHooks({resolve(specifier,context,next){
  return specifier==='cloudflare:workers'?{url:'data:text/javascript,export%20const%20env%3D%7B%7D%3B',shortCircuit:true}:next(specifier,context);
 },load(url,context,next){
  if(url.startsWith(new URL('../../web/',import.meta.url).href)&&url.endsWith('.ts'))return{format:'module',shortCircuit:true,
   source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
  return next(url,context);
 }});
 try{return {apl:await import('../../web/lib/server/apl-plan.ts'),decision:await import('../../web/lib/server/plan-decision.ts')};}
 finally{hook.deregister();}
}
async function functionAcl(tx) {
 return tx`select p.oid::regprocedure::text signature,coalesce(r.rolname,'PUBLIC') grantee,
  g.rolname grantor,a.privilege_type privilege,a.is_grantable grantable
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  left join pg_roles r on r.oid=a.grantee join pg_roles g on g.oid=a.grantor
  where p.pronamespace='public'::regnamespace order by 1,2,3,4,5`;
}
export async function installAplAccess(tx,report) {
 const before=await schemaFingerprint(tx,true),beforeAcl=await functionAcl(tx),beforeRows=await allPublicHashes(tx);
 await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
 const after=await schemaFingerprint(tx,true),afterAcl=await functionAcl(tx);
 assert.deepEqual(await allPublicHashes(tx),beforeRows,'access migration must not change any row');
 const keys=rows=>new Set(rows.map(r=>JSON.stringify(r))),old=keys(beforeAcl),next=keys(afterAcl);
 const removed=beforeAcl.filter(r=>!next.has(JSON.stringify(r))),added=afterAcl.filter(r=>!old.has(JSON.stringify(r)));
 assert.deepEqual(removed,[]);assert.equal(added.length,3);
 assert.deepEqual(added.map(r=>localSignature(r.signature)).sort(),expectedGrants);
 assert.ok(added.every(r=>r.grantee==='skolplattform_worker'&&r.privilege==='EXECUTE'&&!r.grantable));
 const changed=after.functions.filter(f=>f.acl!==before.functions.find(old=>old.signature===f.signature)?.acl);
 assert.deepEqual(changed.map(f=>localSignature(f.signature)).sort(),expectedGrants);
 const comparable=structuredClone(after);
 for(const f of comparable.functions)if(expectedGrants.includes(localSignature(f.signature)))f.acl=before.functions.find(old=>old.signature===f.signature).acl;
 assert.deepEqual(comparable,structuredClone(before),'only the three exact function ACLs may change; definitions, tables, columns, ownership and policies stay exact');
 report.grants={added,removed,tableColumnHelperDefinitionChanges:0};
 ok(report,'grant migration adds exactly three Worker EXECUTE privileges and changes no table, column, helper, definition or original row');
}
async function seed(snapshot) {
 let bf,sa;const b=await snapshot.connect(),s=await snapshot.connect();
 await b.begin(async tx=>{bf=await approvedClassFixture(tx,'BF25');
  bf.oldReceipts=await tx`select request,result,assignment_id from public.plan_decision_receipts where organizer_id=${bf.id(2)} order by created_at,command_id`;
  // An explicit historical fixture shape from before named series existed.
  // This INSERT occurs before APL installation and never edits a stored receipt.
  // Its source is an actual synthetic approval; only absent old presentation keys
  // and a distinct command identity differ. It is not a live historical-data claim.
  const old=bf.oldReceipts.find(r=>r.request.kind==='timplan'&&r.request.action==='approve');assert.ok(old);
  const historicalRequest={...structuredClone(old.request),commandId:randomUUID()},historicalResult=structuredClone(old.result);
  delete historicalResult.series;for(const event of historicalResult.history)delete event.nameAtDecision;
  await tx`insert into public.plan_decision_receipts(command_id,kind,plan_id,organizer_id,actor_identity_id,assignment_id,request,result)
   values(${historicalRequest.commandId},'timplan',${historicalRequest.planId},${bf.id(2)},${bf.id(10)},${bf.roles.hm},${tx.json(historicalRequest)},${tx.json(historicalResult)})`;
  bf.oldReceipts.push({request:historicalRequest,result:historicalResult,assignment_id:bf.roles.hm,fixtureForm:'pre_named'});
  bf.submitted=(await aplDraftFromApproved(tx,bf,'Syntetisk äldre inskickad')).reply.id;
  await tx`select public.phase5_plan_decision_command(${tx.json(await aplDecisionRequest(tx,bf.submitted,'submit'))})`;
 });
 await s.begin(async tx=>{sa=await approvedClassFixture(tx,'SA25');});return {bf,sa};
}
async function install(tx,report) {
 await installAplCommands(tx,report);await installAplDecisions(tx,report);await installAplAccess(tx,report);
 await tx`set constraints all immediate`;
}
function environment(workerDbUrl) {
 const values={APP_MODE:'protected',DATABASE_URL:workerDbUrl,SUPABASE_URL:'http://127.0.0.1:56331',
  OIDC_ISSUER:'http://127.0.0.1:8180/realms/synthetic-apl',OIDC_CLIENT_ID:'synthetic-apl',OIDC_CLIENT_SECRET:'unused-synthetic-only',
  OIDC_REDIRECT_URI:'http://127.0.0.1:3999/api/auth/callback',OIDC_POST_LOGOUT_REDIRECT_URI:'http://127.0.0.1:3999/',
  SUPABASE_ANON_KEY:'unused-synthetic-only',SESSION_SECRET:'unused-synthetic-apl-proof-000000000000',MFA_ACR_VALUES:'2',MFA_MAX_AGE_SECONDS:'900',
  SESSION_IDLE_SECONDS:'1800',SESSION_ABSOLUTE_SECONDS:'28800'};
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
 return()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;};
}
const actorNumbers={hm:[10,20,80],principal:[11,21,81],principal2:[12,22,82],admin:[13,23,83]};
async function authority(db,f,name) {
 const [identity,membership,session]=actorNumbers[name];
 const [row]=await db`select a.id assignment_id,a.organizer_id,a.function,s.identity_id
  from public.app_sessions s join public.access_assignments a on a.id=s.assignment_id
  where s.id=${f.id(session)} and s.identity_id=${f.id(identity)} and s.membership_id=${f.id(membership)}
   and a.id=${f.roles[name]} and a.customer_id=${f.id(1)}`;
 assert.ok(row);return {identityId:row.identity_id,assignmentId:row.assignment_id,organizerId:row.organizer_id,accessFunction:row.function};
}
function injectedTransaction(tx,signature,mutate) {
 return new Proxy(tx,{apply(target,thisArg,args){
  const result=Reflect.apply(target,thisArg,args);
  if(!Array.isArray(args[0])||!args[0].join('').includes(signature))return result;
  return Promise.resolve(result).then(rows=>rows.map(row=>{const changed=structuredClone(row);mutate(changed.result);return changed;}));
 }});
}
async function expectRollback(db,report,name,fn,predicate) {
 const before=await allPublicHashes(db);let error;
 try{await fn();}catch(e){error=e;}
 assert.ok(error,name+': unexpectedly succeeded');assert.ok(predicate(error),name+': '+error.name+' '+error.message+' '+(error.status??error.code));
 assert.deepEqual(await allPublicHashes(db),before,name+': partial rows/audits survived');ok(report,name);
}
async function exercise(snapshot,report,fixtures,server,workerDbUrl) {
 const db=snapshot.db,{bf,sa}=fixtures,{apl,decision}=server;
 const worker=postgres(workerDbUrl,{max:1,prepare:false,onnotice:()=>{}});
 try{
  const [roles]=await worker`select current_user,session_user`;assert.deepEqual(roles,{current_user:'skolplattform_worker',session_user:'skolplattform_worker'});report.workerRole=roles;
  const run=async(f,name,fn)=>{const auth=await authority(db,f,name);return worker.begin(async tx=>{
   await tx`set local lock_timeout='10s'`;await tx`set local statement_timeout='90s'`;await aplActor(tx,f,name);return fn(tx,auth);
  });};
  let draft,saDraft,bfProgram;
  await db.begin(async tx=>{await aplActor(tx,bf,'principal');draft=await aplPreparedDraft(tx,bf,'Syntetisk faktisk Worker APL');
   const p=(await tx`select id,revision,version from public.point_plans where id=${bf.programId}`)[0];
   bfProgram=(await tx`select public.phase5_clone_programplan_draft(${p.id},${p.revision},${p.version},null) result`)[0].result.id;
   await aplActor(tx,sa,'principal');saDraft=(await aplDraftFromApproved(tx,sa,'Syntetisk faktisk Worker SA')).reply.id;
  });
  const read=(name='principal',id=draft.planId)=>run(bf,name,(tx,a)=>apl.readAplPlan(tx,{planId:id},a));
  report.case='capabilities';
  for(const [name,expected] of [['principal',{canSave:true,canConfirm:true}],['admin',{canSave:true,canConfirm:false}],['hm',{canSave:false,canConfirm:false}]]){
   const r=await read(name);assert.deepEqual(r.body.capabilities,expected);assert.equal(r.body.plan,null);
  }
  ok(report,'actual Worker read projects rector/admin/HM capabilities from real synthetic assignments');
  const denied=e=>e.status===403||e.code==='42501',broken=e=>e.name==='AuditUnavailable';
  await expectRollback(db,report,'other-school rector read is denied by actual Worker SQL',()=>read('principal2'),denied);
  for(const sql of ['select * from public.apl_plan_underlag','select public.phase5_apl_plan_value(null::uuid)','select * from public.apl_plan_decision_receipts']){
   await expectRollback(db,report,'Worker direct table/helper denied: '+sql,()=>run(bf,'principal',tx=>tx.unsafe(sql)),e=>e.code==='42501');
  }
  report.case='save/status/replay';const q=aplSave(draft);
  const notFound=await run(bf,'principal',(tx,a)=>apl.readAplStatus(tx,{command:q},a));assert.deepEqual(notFound.body,{state:'not_found',result:null});
  const saved=await run(bf,'principal',(tx,a)=>apl.commandAplPlan(tx,q,a));assert.equal(saved.body.receipt.changed,true);assert.equal(saved.body.detail.revision,q.expectedRevision+1);
  const replay=await run(bf,'principal',(tx,a)=>apl.commandAplPlan(tx,q,a));
  const status=await run(bf,'principal',(tx,a)=>apl.readAplStatus(tx,{command:q},a));
  const expectedReplay=structuredClone(saved.body);expectedReplay.receipt.replayed=true;
  assert.deepEqual(replay.body,expectedReplay);assert.deepEqual(status.body,{state:'completed',result:expectedReplay});
  ok(report,'actual Worker save/read/status/replay returns strict server-verified receipts and identical historical content');
  const adminPlan=structuredClone(q.plan);adminPlan.periods[0].contents[0].description+=' Förberett av skoladministratör.';
  const adminQ={...q,commandId:randomUUID(),expectedRevision:saved.body.detail.revision,plan:adminPlan};
  const adminSaved=await run(bf,'admin',(tx,a)=>apl.commandAplPlan(tx,adminQ,a));assert.equal(adminSaved.body.receipt.changed,true);
  assert.equal(adminSaved.body.detail.revision,saved.body.detail.revision+1);assert.equal(adminSaved.body.detail.capabilities.canConfirm,false);
  ok(report,'actual administrator saves changed planning content while lacking rector confirmation capability');
  await expectRollback(db,report,'HM cannot save APL through actual server helper',()=>run(bf,'hm',(tx,a)=>apl.commandAplPlan(tx,{...adminQ,commandId:randomUUID(),expectedRevision:adminSaved.body.detail.revision},a)),denied);
  report.case='parser rollback';
  const mutations=[['missing contract',raw=>delete raw.contractVersion],['false capability',raw=>raw.result.detail.capabilities.canConfirm=false],
   ['wrong content hash',raw=>raw.result.detail.contentHash='sha256:'+'0'.repeat(64)],
   ['invalid minute allocation',raw=>raw.result.detail.plan.periods[0].allocations[0].gutMinutes=99999]];
  for(const [name,mutate] of mutations){
   const changed=structuredClone(q.plan);changed.periods[0].contents[0].description+=' osparat';
   const badQ={...q,commandId:randomUUID(),expectedRevision:adminSaved.body.detail.revision,plan:changed};
   let injected=0;
   await expectRollback(db,report,'real save rolls back after server rejects '+name,
    ()=>run(bf,'principal',(tx,a)=>apl.commandAplPlan(injectedTransaction(tx,'phase5_apl_plan_command',raw=>{injected++;mutate(raw);}),badQ,a)),e=>injected===1&&broken(e));
   report.checks.at(-1).observedPostWriteResponses=injected;
  }
  let current=await read();const confirm={contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:draft.planId,
   expectedRevision:current.body.revision,expectedContentHash:current.body.contentHash,comment:'Syntetisk faktisk Worker-bekräftelse.'};
  await expectRollback(db,report,'administrator cannot confirm rector placement through Worker',()=>run(bf,'admin',(tx,a)=>apl.commandAplPlan(tx,confirm,a)),denied);
  report.case='confirm';const confirmed=await run(bf,'principal',(tx,a)=>apl.commandAplPlan(tx,confirm,a));assert.equal(confirmed.body.detail.confirmations.length,1);
  const confirmedStatus=await run(bf,'principal',(tx,a)=>apl.readAplStatus(tx,{command:confirm},a));assert.equal(confirmedStatus.body.result.receipt.confirmationId,confirmed.body.receipt.confirmationId);
  ok(report,'actual rector confirm persists immutable event and replays through status with exact authority');
  const request=async(f,actor,id,action,kind='timplan')=>run(f,actor,async(tx,a)=>{
   const {body:d}=await decision.readPlanDecision(tx,{kind,planId:id},a);
   return {kind,planId:id,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,
    basisHash:d.basisHash,comment:action==='return'?'Syntetisk komplettering.':'',confirmedChecks:d.checks.map(c=>c.id)};
  });
  const execute=(f,actor,q)=>run(f,actor,(tx,a)=>decision.commandPlanDecision(tx,q,a));
  report.case='new decision projection';const submit=await request(bf,'principal',draft.planId,'submit');
  let decisionInjected=0;
  await expectRollback(db,report,'real submit rolls back when independent decision projector rejects missing APL',
   ()=>run(bf,'principal',(tx,a)=>decision.commandPlanDecision(injectedTransaction(tx,'phase5_plan_decision_command',raw=>{decisionInjected++;delete raw.result.apl;}),submit,a)),e=>decisionInjected===1&&broken(e));
  report.checks.at(-1).observedPostWriteResponses=decisionInjected;
  const submitted=await execute(bf,'principal',submit);assert.equal(submitted.body.stage,'submitted');assert.equal(submitted.body.apl.ready,true);
  const approval=await request(bf,'hm',draft.planId,'approve');const approved=await execute(bf,'hm',approval);
  assert.equal(approved.body.stage,'approved');assert.equal(approved.body.apl.detail.contentHash,confirmed.body.detail.contentHash);
  const replayDecision=await execute(bf,'principal',submit);assert.deepEqual(replayDecision.body,submitted.body);
  ok(report,'actual Worker new decision basis/submit/approve/replay passes versions and APL projector with stable rector hash');
  report.case='legacy decisions';
  for(const receipt of bf.oldReceipts){const actor=receipt.assignment_id===bf.roles.hm?'hm':'principal';
   const r=await execute(bf,actor,receipt.request);assert.equal(r.body.contractVersion,'legacy');assert.equal(r.body.stage,receipt.result.stage);assert.equal(r.body.basisHash,receipt.result.basisHash);
   if(receipt.fixtureForm==='pre_named'){assert.equal(r.body.series??null,null);assert.ok(r.body.history.every(h=>(h.nameAtDecision??null)===null));report.preNamedLegacyVerified=true;}
  }
  const blocked=await request(bf,'hm',bf.submitted,'approve');
  await expectRollback(db,report,'new approval of submitted legacy BF is blocked through actual Worker server',()=>execute(bf,'hm',blocked),e=>e.status===409);
  const inbox=await run(bf,'hm',tx=>decision.readPlanDecisionInbox(tx));const item=inbox.body.items.find(i=>i.planId===bf.submitted);assert.equal(item.task,'review');assert.equal(item.apl.ready,false);
  const selection={query:'Syntetisk äldre inskickad',kind:'timplan',stage:'submitted',tasks:'mine',page:1};
  const page=await run(bf,'hm',tx=>decision.readPlanDecisionPage(tx,selection));assert.deepEqual(page.body.items,[item]);assert.equal(page.body.count,1);
  assert.equal((await execute(bf,'hm',await request(bf,'hm',bf.submitted,'return'))).body.stage,'returned');
  ok(report,'actual Worker legacy dispatch, inbox/page and return preserve old outcomes without granting new legacy approval');
  report.case='program/SA regression';
  for(const [f,id,kind] of [[bf,bfProgram,'programplan'],[sa,saDraft,'timplan']]){
   const s=await execute(f,'principal',await request(f,'principal',id,'submit',kind));assert.equal(s.body.apl,null);
   const a=await execute(f,'hm',await request(f,'hm',id,'approve',kind));assert.equal(a.body.stage,'approved');assert.equal(a.body.apl,null);
  }
  ok(report,'actual Worker BF programplan and SA timplan retain prior decision path with explicit null APL');
  report.case='historical APL after decisions';current=await read();assert.equal(current.body.capabilities.canSave,false);
  const old=await run(bf,'principal',(tx,a)=>apl.readAplStatus(tx,{command:q},a));assert.deepEqual(old.body.result,expectedReplay);
  ok(report,'historical APL save remains exact after live approval while fresh read correctly disables editing');
  report.serverParityComplete=true;
 }finally{await worker.end();}
}
export async function verifyAplAccess(out) {
 const fd=openSync(out,'wx',0o600),report={kind:'apl-access-real-worker-sql-parity',schemaVersion:1,status:'FAIL',runId:randomUUID(),startedAt:new Date().toISOString(),checks:[],
  limitations:['Owned schema-only clone with synthetic fixtures; no active DB data copied or changed','Actual PostgreSQL Worker login and actual server helpers; not HTTP, MFA, OIDC, browser or deployment acceptance','Cloudflare bindings import shim is empty; serverEnv receives scoped private fixture configuration, restored afterward','Node projection validates before SQL commit; outer protectedRoute audit/CSRF/MFA are tested separately']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let snapshot;
 try{
  report.sources=sources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const fixtures=await seed(snapshot),db=snapshot.db;const before=await allPublicHashes(db),beforeSchema=await schemaFingerprint(db);
  try{await db.begin(async tx=>{await install(tx,report);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  assert.deepEqual(await allPublicHashes(db),before);assert.equal(await schemaFingerprint(db),beforeSchema);report.migrationRollbackRestored=true;
  await db.begin(tx=>install(tx,report));report.installedFingerprint=await schemaFingerprint(db);save();
  await snapshot.withPrivateTarget(async({workerDbUrl})=>{const restore=environment(workerDbUrl);try{const server=await loadServer();await exercise(snapshot,report,fixtures,server,workerDbUrl);}finally{restore();}});
  assert.equal(await schemaFingerprint(db),report.installedFingerprint);report.finalRows=await allPublicHashes(db);
 }catch(error){report.failure={name:error.name,code:error.code,status:error.status,message:error.message,hint:error.hint,where:error.where,position:error.position,stack:error.stack};}
 finally{
  try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(error){report.sourceFailure={message:error.message};}
  try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(error){report.cleanupFailure={message:error.message};}
  if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.migrationRollbackRestored&&report.serverParityComplete&&report.cleanup?.cleanup==='complete')report.status='PASS';
  report.completedAt=new Date().toISOString();save();closeSync(fd);
 }
 console.log(`${report.status}: ${report.checks.length} access/parity checks; Worker=${report.workerRole?.current_user??'not reached'}; ${out}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if((await verifyAplAccess(privateOutput(process.argv.slice(2)))).status!=='PASS')process.exitCode=1;
}
