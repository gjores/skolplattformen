#!/usr/bin/env node
// Actual protected Worker HTTP with unchanged installed grants.
// Own synthetic fixtures only; existing business records and sessions stay untouched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {createGymTimplanFixture,verifyGymTimplanBrowserTarget} from './phase5-gym-timplan-fixtures.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {databaseFingerprint,decisionBusinessHashes,protectedTables} from './verify-plan-decision-flow.mjs';
import {vocationalFixture} from './vocational-plan-fixture.mjs';
import {sourcePaths as vocationalSourcePaths} from './verify-vocational-plan-decisions.mjs';
import {parsePlanDecisionDetail,parsePlanDecisionInbox} from '../../web/lib/plan-decision.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const entries=['public.phase5_plan_decision_basis(text,uuid)','public.phase5_plan_decision_command(jsonb)','public.phase5_plan_decision_inbox()'];
const decisions=['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
const sourcePaths=[...vocationalSourcePaths,'work/pilot/verify-vocational-plan-decision-api.mjs','work/pilot/verify-plan-decision-api.mjs','web/lib/plan-decision.ts','web/lib/server/plan-decision.ts','web/lib/server/gym-timplan.ts',
 'web/lib/server/audit-details.ts','web/lib/mandate-policy.ts','web/app/api/planbeslut/underlag/route.ts','web/app/api/planbeslut/andra/route.ts','web/app/api/planbeslut/inkorg/route.ts',
 'supabase/migrations/20261012180000_plan_decision_flow.sql','supabase/migrations/20261012180100_plan_decision_command_fix.sql'];
const sha=s=>createHash('sha256').update(s).digest('hex');
async function main(){
 const args=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i++){if(args[i]==='--dev-worker')o.devWorker=true;else if(['--base-url','--out','--program-code'].includes(args[i]))o[args[i]]=args[++i];else throw Error('REFUSED: unknown argument');}
 const programCode=o['--program-code'];assert.ok(['BF25','BA25'].includes(programCode),'REFUSED: representative profile required');
 const url=o['--base-url'],out=resolve(o['--out']??'');
 assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/u.test(url??'')&&out.startsWith('/private/tmp/')&&out.endsWith('.json'),'REFUSED: local URL and private output required');
 const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
 let build;
 if(o.devWorker){
  assert.ok(url==='http://127.0.0.1:5193','REFUSED: development Worker is only the isolated preflight server');
  const response=await fetch(`${url}/api/health/db`,{signal:AbortSignal.timeout(30000)}),health=await response.json();
  assert.ok(response.ok&&health.ok===true&&health.role==='skolplattform_worker'&&health.runtime==='workerd','REFUSED: actual protected Worker health required');
  build={mode:'development',runtime:'workerd',role:health.role,builtArtifactVerified:false};
 }else build=await verifyGymTimplanBrowserTarget(url);
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:2,prepare:false,onnotice:()=>{}});
 const tables=[...protectedTables,...decisions],checks=[];
 let fixture,before,after,acl,finalAcl,failure,cleanup,finalSourceHashes,baselineFingerprint,finalFingerprint,triggerCreated=false;
 const suffix=randomUUID().replaceAll('-',''),trigger=`decision_api_failure_${suffix}`,fn=`decision_api_failure_fn_${suffix}`;
 const check=(name,run)=>Promise.resolve().then(run).then(()=>checks.push({name,ok:true}));
 const exact=async(session,path,body,status=200,headers={})=>{
  const r=await fetch(`${url}${path}`,{method:body===undefined?'GET':'POST',headers:{Cookie:`sp_session=${session.token}`,'Content-Type':'application/json',Origin:url,'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(session.epoch),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const responseText=await r.text();let result;
  try{result=JSON.parse(responseText);}catch{assert.notEqual(status,200,'Successful API response must be JSON');result={code:'non-json-rejection'};}
  assert.equal(r.status,status,`${path}: unexpected HTTP status (${result.code??'response'})`);return {body:result,correlationId:r.headers.get('x-correlation-id')};
 };
 const read=async(session,kind,planId)=>parsePlanDecisionDetail((await exact(session,'/api/planbeslut/underlag',{kind,planId})).body,{kind,planId});
 const command=(detail,action,more={})=>({kind:detail.kind,planId:detail.planId,commandId:randomUUID(),action,expectedRevision:detail.revision,
  expectedDecisionRevision:detail.decisionRevision,basisHash:detail.basisHash,comment:action==='return'?'Komplettera den syntetiska planen.':'',confirmedChecks:detail.checks.map(c=>c.id),...more});
 const send=async(session,input,status=200,headers={})=>exact(session,'/api/planbeslut/andra',input,status,headers);
 const roleTask=async(session,planId,stage,task,nextActor)=>{
  const inbox=parsePlanDecisionInbox((await exact(session,'/api/planbeslut/inkorg')).body);
  const item=inbox.items.find(item=>item.planId===planId);
  assert.ok(item,'Expected exact plan in role inbox');assert.equal(item.stage,stage);assert.equal(item.task,task);assert.equal(item.nextActor,nextActor);
  assert.equal(inbox.actionCount,inbox.items.filter(item=>['prepare','review','revise'].includes(item.task)).length);
  assert.equal(inbox.decisionCount,inbox.items.filter(item=>item.task==='review').length);
 };

 try {
  baselineFingerprint=await databaseFingerprint(db);
  before=await decisionBusinessHashes(db,tables);acl=await gymAcl(db);
  for(const entry of entries){const row=acl.find(r=>r.f===entry);assert.ok(row&&row.granted===true,'REFUSED: unexpected original decision Worker ACL');}
  fixture=await createGymTimplanFixture();
  const f=fixture;
  const catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
  const profile=vocationalFixture(catalog,programCode,f.catalogId);
  const education=(await exact(f.hm,'/api/programplaner/utbildning/skapa',{commandId:randomUUID(),unitId:f.unitId,name:'Syntetiskt yrkesbeslut '+programCode,localCode:null,cohort:'Syntetisk framtida kull',basisReference:profile.reference})).body;
  const ready={planId:education.plan.id,offeringId:education.education.id,distribution:profile.terms};
  await exact(f.principal,'/api/programplaner/terminer',{planId:ready.planId,expectedRevision:education.plan.revision,distribution:profile.terms});

  const programId=ready.planId;
  let p=await read(f.principal,'programplan',programId);
  assert.deepEqual(p.blockers,[]);assert.ok(p.actions.includes('submit'));
  const [{lifecycle_revision:educationRevision}]=await db`select lifecycle_revision from public.offerings where id=${ready.offeringId} and organizer_id=${f.organizerId}`;
  const gym=(await exact(f.principal,'/api/timplaner/gym/skapa',{commandId:randomUUID(),sourcePlanId:programId,expectedSourceRevision:p.revision,expectedEducationRevision:educationRevision,unitId:f.unitId,predecessorPlanId:null,expectedPredecessorRevision:null})).body;
  const gymId=gym.id;
  await check('real Worker returns blocked draft timplan until source approval',async()=>assert.ok((await read(f.principal,'timplan',gymId)).blockers.length));
  assert.deepEqual(p.checks.map(c=>c.id),['structure','choices','eligibility','apl']);
  const initial=command(p,'submit');
  for(const checkId of ['eligibility','apl'])await check('required vocational '+checkId+' control cannot be omitted',async()=>{await send(f.principal,{...initial,commandId:randomUUID(),confirmedChecks:initial.confirmedChecks.filter(id=>id!==checkId)},409);});

  await check('MFA required',async()=>{await send(f.noMfa,initial,403);});
  await check('cross-site command rejected',async()=>{await send(f.principal,initial,403,{Origin:'https://foreign.invalid','Sec-Fetch-Site':'cross-site'});});
  await check('stale session epoch rejected',async()=>{await send(f.principal,initial,409,{'X-Context-Epoch':String(f.principal.epoch+1)});});
  await check('administrator cannot submit programplan',async()=>{await send(f.admin,initial,403);});
  await check('other school cannot read programplan or timplan',async()=>{
   await exact(f.principalB,'/api/planbeslut/underlag',{kind:'programplan',planId:programId},403);
   await exact(f.principalB,'/api/planbeslut/underlag',{kind:'timplan',planId:gymId},403);
  });
  await check('required controls cannot be omitted',async()=>{await send(f.principal,{...initial,confirmedChecks:[]},409);});
  await check('rector submits and retry is idempotent with paired audit',async()=>{
   const first=await send(f.principal,initial);assert.equal(first.body.stage,'submitted');
   const repeated=await send(f.principal,initial);assert.deepEqual(repeated.body,first.body);
   const events=await f.events(first.correlationId);assert.equal(events.filter(e=>e.action==='plan_decision_command'&&e.outcome==='ok').length,2);
   assert.deepEqual(events.map(e=>e.source).sort(),['db','worker']);
  });
  await check('stale second tab and reused key with changed body rejected',async()=>{
   await send(f.principal,{...initial,commandId:randomUUID(),action:'withdraw'},409);
   await send(f.principal,{...initial,comment:'Different payload'},409);
  });
  await check('all three role inboxes identify submitted program decision',async()=>{
   await roleTask(f.hm,programId,'submitted','review','huvudman');
   await roleTask(f.principal,programId,'submitted','waiting','huvudman');
   await roleTask(f.admin,programId,'submitted','waiting','huvudman');
  });
  p=await read(f.principal,'programplan',programId);
  await check('submitted programplan cannot be edited',async()=>{await exact(f.principal,'/api/programplaner/terminer',{planId:programId,expectedRevision:p.revision,distribution:ready.distribution},409);});
  await check('rector cannot approve programplan',async()=>{await send(f.principal,command(p,'approve'),403);});
  p=await read(f.hm,'programplan',programId);
  await check('return requires explanation',async()=>{await send(f.hm,command(p,'return',{comment:' '}),400);});
  await check('head organizer returns programplan with explanation',async()=>{assert.equal((await send(f.hm,command(p,'return'))).body.stage,'returned');});
  await check('returned program is rectors correction task with visible comment',async()=>{
   await roleTask(f.hm,programId,'returned','waiting','rektor');
   const returnedHm=await read(f.hm,'programplan',programId);await send(f.hm,command(returnedHm,'approve'),403);
   await roleTask(f.principal,programId,'returned','revise','rektor');
   await roleTask(f.admin,programId,'returned','waiting','rektor');
   const returned=await read(f.principal,'programplan',programId);assert.ok(returned.history.some(event=>event.action==='return'&&event.comment==='Komplettera den syntetiska planen.'));
  });
  p=await read(f.principal,'programplan',programId);
  await exact(f.principal,'/api/programplaner/terminer',{planId:programId,expectedRevision:p.revision,distribution:ready.distribution});
  p=await read(f.principal,'programplan',programId);await send(f.principal,command(p,'submit'));
  p=await read(f.hm,'programplan',programId);
  await check('head organizer approves corrected programplan',async()=>{assert.equal((await send(f.hm,command(p,'approve'))).body.stage,'approved');});
  const plan=(await exact(f.principal,'/api/timplaner/gym/lasa',{planId:gymId})).body;
  let revision=plan.revision;
  for(const row of plan.rows){const result=(await exact(f.principal,'/api/timplaner/gym/rad',{planId:gymId,expectedRevision:revision,rowKey:row.key,hours:row.pointTerms.map(p=>p>0?p:null)})).body;revision=result.revision;}
  let t=await read(f.admin,'timplan',gymId);
  await check('old frozen draft source remains usable after same-content program approval',async()=>{assert.deepEqual(t.blockers,[]);assert.equal(plan.source.status,'utkast');assert.equal((await send(f.admin,command(t,'submit'))).body.stage,'submitted');});
  await check('all three role inboxes identify submitted timplan decision',async()=>{
   await roleTask(f.hm,gymId,'submitted','review','huvudman');
   await roleTask(f.principal,gymId,'submitted','waiting','huvudman');
   await roleTask(f.admin,gymId,'submitted','waiting','huvudman');
  });
  t=await read(f.hm,'timplan',gymId);await send(f.hm,command(t,'return'));
  await check('returned timplan gives correction tasks to rector and administrator while organizer waits',async()=>{
   await roleTask(f.hm,gymId,'returned','waiting','rektor');
   await roleTask(f.principal,gymId,'returned','revise','rektor');
   await roleTask(f.admin,gymId,'returned','revise','rektor');
   const returned=await read(f.admin,'timplan',gymId);assert.ok(returned.history.some(event=>event.action==='return'&&event.comment==='Komplettera den syntetiska planen.'));
  });
  t=await read(f.principal,'timplan',gymId);
  const row=plan.rows[0];await exact(f.principal,'/api/timplaner/gym/rad',{planId:gymId,expectedRevision:t.revision,rowKey:row.key,hours:row.pointTerms.map(p=>p>0?p+1:null)});
  t=await read(f.principal,'timplan',gymId);await send(f.principal,command(t,'submit'));
  t=await read(f.hm,'timplan',gymId);
  const beforeAuditFailure=await decisionBusinessHashes(db,[...decisions,'timplans','timplan_cells','timplan_events']);
  await db.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.customer_id='${f.customerId}'::uuid and new.object_id='${gymId}'::uuid and new.action='plan_decision_command' and new.source='worker' and new.outcome='ok' then raise exception 'Synthetic final Worker audit failure';end if;return new;end$$;create trigger ${trigger} before insert on public.security_events for each row execute function public.${fn}();`);triggerCreated=true;
  await check('final Worker audit failure rolls back database decision',async()=>{await send(f.hm,command(t,'approve'),500);assert.deepEqual(await decisionBusinessHashes(db,[...decisions,'timplans','timplan_cells','timplan_events']),beforeAuditFailure);});
  await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${fn}();`);triggerCreated=false;
  await check('head organizer approves corrected timplan',async()=>{assert.equal((await send(f.hm,command(t,'approve'))).body.stage,'approved');});
  await check('inbox is exact and final plans leave pending decisions',async()=>{const inbox=parsePlanDecisionInbox((await exact(f.hm,'/api/planbeslut/inkorg')).body);assert.ok(!inbox.items.some(i=>[programId,gymId].includes(i.planId)));});
  const histories=await db`select kind,action from public.plan_decision_history where organizer_id=${f.organizerId} order by occurred_at,id`;
  await check('both return cycles are recorded',async()=>{for(const kind of ['programplan','timplan'])assert.deepEqual(histories.filter(h=>h.kind===kind).map(h=>h.action),['submit','return','submit','approve']);});
 }catch(error){failure=error;}finally{
  try {
   if(triggerCreated){await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${fn}();`);triggerCreated=false;}
   if(fixture){
    const f=fixture;await assertTarget('protected');
    await db.begin(async tx=>{
     const owned=await tx`select id from public.customers where id=${f.customerId} and name='Syntetiskt programplansprov'`;
     assert.equal(owned.length,1,'REFUSED: cannot clean unowned test data');
     // Append-only evidence is bypassed only for owned synthetic test objects.
     // Security audit stays intact with its identity anchors, as in base fixture.
     await tx`set local session_replication_role=replica`;
     await tx`delete from public.plan_decision_receipts where organizer_id=${f.organizerId}`;
     await tx`delete from public.plan_decision_history where organizer_id=${f.organizerId}`;
     await tx`delete from public.plan_decision_reviews where (kind='programplan' and plan_id in(select id from public.point_plans where organizer_id=${f.organizerId})) or (kind='timplan' and plan_id in(select id from public.timplans where organizer_id=${f.organizerId}))`;
    });
    cleanup=await f.cleanup();
   }
  }catch(error){failure??=error;}
  try {
   finalAcl=await gymAcl(db);if(acl)assert.deepEqual(finalAcl,acl,'Original raw ACL not restored');
   finalFingerprint=await databaseFingerprint(db);
   if(baselineFingerprint)assert.equal(finalFingerprint,baselineFingerprint,'Database definitions, ACL or migration journal changed during API verification');
   after=await decisionBusinessHashes(db,tables);if(before)assert.deepEqual(after,before,'Original business rows not restored');
   finalSourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
   assert.deepEqual(finalSourceHashes,sourceHashes,'Protected source changed during actual Worker verification');
  }catch(error){failure??=error;}
  await db.end({timeout:5});
 }
 const report={kind:'vocational-plan-decision-api',programCode,status:failure?'FAIL':'PASS',target:'protected',scope:'local-synthetic-only',preflight:false,reset:false,
  apiVerified:!failure,realWorker:build,checks,cleanup,sourceHashes,finalSourceHashes,sourceUnchanged:JSON.stringify(sourceHashes)===JSON.stringify(finalSourceHashes),
  baselineFingerprint,finalFingerprint,
  aclRestored:JSON.stringify(acl)===JSON.stringify(finalAcl),originalBusinessPreserved:JSON.stringify(before)===JSON.stringify(after),beforeHashes:before,afterHashes:after,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.code&&failure.code!=='ERR_ASSERTION'?'API fixture operation failed':String(failure.message).split('\n')[0].slice(0,300),location:failure.stack?.split('\n').find(line=>line.includes('verify-vocational-plan-decision-api.mjs:'))?.trim()}:null};
 const evidence=JSON.stringify(report,null,2)+'\n';writeFileSync(out,evidence,{mode:0o600});if(failure)writeFileSync(out.replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${report.status}: ${checks.length} actual Worker decision checks; ACL restored ${report.aclRestored}; original business preserved ${report.originalBusinessPreserved}.`);
 if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: decision API preflight');process.exitCode=1;});
