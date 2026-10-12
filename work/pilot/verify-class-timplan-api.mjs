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
import {sourcePaths as classSourcePaths} from './verify-class-timplans.mjs';
import {parseClassPlanUnderlag} from '../../web/lib/class-timplan.ts';
import {parsePlanDecisionDetail} from '../../web/lib/plan-decision.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const entries=['public.phase5_plan_decision_basis(text,uuid)','public.phase5_plan_decision_command(jsonb)','public.phase5_plan_decision_inbox()'];
const decisions=['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
const sourcePaths=[...classSourcePaths,'work/pilot/verify-class-timplan-api.mjs','work/pilot/verify-plan-decision-api.mjs','web/lib/plan-decision.ts','web/lib/server/plan-decision.ts','web/lib/server/gym-timplan.ts',
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
 const tables=[...protectedTables,...decisions,'class_plan_commands'],checks=[];
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
  let p=await read(f.principal,'programplan',programId);await send(f.principal,command(p,'submit'));p=await read(f.hm,'programplan',programId);await send(f.hm,command(p,'approve'));
  p=await read(f.principal,'programplan',programId);
  const [{lifecycle_revision:educationRevision}]=await db`select lifecycle_revision from public.offerings where id=${ready.offeringId} and organizer_id=${f.organizerId}`;
  const createGym={commandId:randomUUID(),sourcePlanId:programId,expectedSourceRevision:p.revision,expectedEducationRevision:educationRevision,unitId:f.unitId,predecessorPlanId:null,expectedPredecessorRevision:null};
  const gym=(await exact(f.principal,'/api/timplaner/gym/skapa',createGym)).body,gymId=gym.id;
  const plan=(await exact(f.principal,'/api/timplaner/gym/lasa',{planId:gymId})).body;
  let revision=plan.revision;for(const row of plan.rows)revision=(await exact(f.principal,'/api/timplaner/gym/rad',{planId:gymId,expectedRevision:revision,rowKey:row.key,hours:row.pointTerms.map(p=>p>0?p:null)})).body.revision;
  let t=await read(f.admin,'timplan',gymId);await send(f.admin,command(t,'submit'));t=await read(f.hm,'timplan',gymId);await send(f.hm,command(t,'approve'));
  const year=Number(profile.reference.startedOn.slice(0,4))-(profile.reference.startedOn.slice(5,7)<'07'?1:0);
  const classRead=async(session=f.principal,planId=gymId,schoolYear=year)=>parseClassPlanUnderlag((await exact(session,'/api/klasser/underlag',{planId,schoolYear})).body,{planId,schoolYear});
  let basis=await classRead();await check('approved frozen class basis',async()=>{assert.equal(basis.canManage,true);assert.equal(basis.plan.startYear,year);});
  const creation={commandId:randomUUID(),planId:gymId,expectedPlanRevision:basis.plan.revision,name:'SYNKLASS',startYear:year};let c;
  await check('real HTTP creates permanent class and paired audit',async()=>{const r=await exact(f.principal,'/api/klasser/skapa',creation);c=r.body;assert.equal(c.name,creation.name);const events=await f.events(r.correlationId);assert.deepEqual(events.filter(e=>e.action==='class_created').map(e=>e.source).sort(),['db','worker']);});
  await check('creation replay retains stable class ID',async()=>{const replay=(await exact(f.principal,'/api/klasser/skapa',creation)).body;assert.equal(replay.id,c.id);assert.equal(replay.replayed,true);});
  await check('duplicate class rejected',async()=>{await exact(f.principal,'/api/klasser/skapa',{...creation,commandId:randomUUID()},409);});
  await check('HM cannot create but reads class list',async()=>{await exact(f.hm,'/api/klasser/skapa',{...creation,commandId:randomUUID(),name:'WRONG'},403);assert.equal((await classRead(f.hm)).canManage,false);});
  await check('other school denied class read and write',async()=>{await exact(f.principalB,'/api/klasser/underlag',{planId:gymId,schoolYear:year},403);await exact(f.principalB,'/api/klasser/skapa',creation,403);});
  await check('MFA CSRF and epoch enforced for class command',async()=>{await exact(f.noMfa,'/api/klasser/skapa',creation,403);await exact(f.principal,'/api/klasser/skapa',creation,403,{Origin:'https://foreign.invalid','Sec-Fetch-Site':'cross-site'});await exact(f.principal,'/api/klasser/skapa',creation,409,{'X-Context-Epoch':String(f.principal.epoch+1)});});
  const binding={commandId:randomUUID(),classId:c.id,schoolYear:year,planId:gymId,expectedPlanRevision:basis.plan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
  await check('admin binds exact approved version',async()=>{const b=(await exact(f.admin,'/api/klasser/koppla',binding)).body;assert.equal(b.planId,gymId);assert.equal(b.revision,0);});
  await check('binding replay and stale second tab',async()=>{assert.equal((await exact(f.admin,'/api/klasser/koppla',binding)).body.replayed,true);await exact(f.admin,'/api/klasser/koppla',{...binding,commandId:randomUUID()},409);});
  await check('invalid school year column and source revision rejected',async()=>{await exact(f.principal,'/api/klasser/koppla',{...binding,commandId:randomUUID(),schoolYear:year+1},400);await exact(f.principal,'/api/klasser/koppla',{...binding,commandId:randomUUID(),expectedPlanRevision:0},409);});
  const g2=(await exact(f.principal,'/api/timplaner/gym/skapa',{...createGym,commandId:randomUUID(),predecessorPlanId:gymId,expectedPredecessorRevision:basis.plan.revision})).body;
  await check('draft target cannot take over class',async()=>{await exact(f.principal,'/api/klasser/koppla',{...binding,commandId:randomUUID(),planId:g2.id,expectedPlanRevision:g2.revision,previousPlanId:gymId,expectedLinkRevision:0},409);});
  t=await read(f.principal,'timplan',g2.id);await send(f.principal,command(t,'submit'));t=await read(f.hm,'timplan',g2.id);await send(f.hm,command(t,'approve'));
  await check('new approved version never moves old class',async()=>{const older=await classRead();assert.equal(older.plan.status,'ersatt');assert.equal(older.linkedClasses[0].classId,c.id);assert.equal((await classRead(f.principal,g2.id)).linkedClasses.length,0);});
  basis=await classRead(f.principal,g2.id);
  await check('explicit switch persists exact new version',async()=>{await exact(f.principal,'/api/klasser/koppla',{...binding,commandId:randomUUID(),planId:g2.id,expectedPlanRevision:basis.plan.revision,previousPlanId:gymId,expectedLinkRevision:0});assert.equal((await classRead(f.principal,g2.id)).linkedClasses[0].revision,1);assert.equal((await classRead()).linkedClasses.length,0);});
  const beforeAudit=await decisionBusinessHashes(db,['school_classes','class_timplans','class_plan_commands']);
  await db.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.customer_id='${f.customerId}'::uuid and new.action='class_created' and new.source='worker' and new.outcome='ok' then raise exception 'Synthetic final Worker audit failure';end if;return new;end$$;create trigger ${trigger} before insert on public.security_events for each row execute function public.${fn}();`);triggerCreated=true;
  await check('final Worker audit failure rolls back class and receipt',async()=>{await exact(f.principal,'/api/klasser/skapa',{...creation,commandId:randomUUID(),planId:g2.id,expectedPlanRevision:basis.plan.revision,name:'AUDITFAIL'},500);assert.deepEqual(await decisionBusinessHashes(db,['school_classes','class_timplans','class_plan_commands']),beforeAudit);});
  await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${fn}();`);triggerCreated=false;
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
     const classIds=(await tx`select (c.reply->>'id')::uuid id from public.class_plan_commands c join public.access_assignments a on a.id=c.assignment_id where a.customer_id=${f.customerId} and c.request->>'operation'='create'`).map(r=>r.id);
     await tx`delete from public.class_timplans where class_id=any(${classIds}::uuid[])`;
     await tx`delete from public.school_classes where customer_id=${f.customerId} and id=any(${classIds}::uuid[])`;
     await tx`delete from public.class_plan_commands where assignment_id in(select id from public.access_assignments where customer_id=${f.customerId})`;
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
 const report={kind:'class-timplan-api',programCode,status:failure?'FAIL':'PASS',target:'protected',scope:'local-synthetic-only',preflight:false,reset:false,
  apiVerified:!failure,realWorker:build,checks,cleanup,sourceHashes,finalSourceHashes,sourceUnchanged:JSON.stringify(sourceHashes)===JSON.stringify(finalSourceHashes),
  baselineFingerprint,finalFingerprint,
  aclRestored:JSON.stringify(acl)===JSON.stringify(finalAcl),originalBusinessPreserved:JSON.stringify(before)===JSON.stringify(after),beforeHashes:before,afterHashes:after,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.code&&failure.code!=='ERR_ASSERTION'?'API fixture operation failed':String(failure.message).split('\n')[0].slice(0,300),location:failure.stack?.split('\n').find(line=>line.includes('verify-class-timplan-api.mjs:'))?.trim()}:null};
 const evidence=JSON.stringify(report,null,2)+'\n';writeFileSync(out,evidence,{mode:0o600});if(failure)writeFileSync(out.replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${report.status}: ${checks.length} actual Worker decision checks; ACL restored ${report.aclRestored}; original business preserved ${report.originalBusinessPreserved}.`);
 if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: decision API preflight');process.exitCode=1;});
