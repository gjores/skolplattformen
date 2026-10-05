#!/usr/bin/env node
// Actual built local Worker and PostgreSQL, owned synthetic customer only.
// Preflight temporarily opens exactly four RPCs and restores their exact ACL.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {createGymTimplanFixture,verifyGymTimplanBrowserTarget} from './phase5-gym-timplan-fixtures.mjs';
import {GYM_BASE_ENTRIES,GYM_ENTRIES,GYM_API_CASES,GYM_SOURCE_PATHS,gymAcl,gymBaselineFingerprint} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const TABLES=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','timplan_events','class_timplans',
 'school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages','gym_timplan_receipts'];
const ROUTES={basis:'underlag',create:'skapa',read:'lasa',row:'rad'};
const ACTIONS={basis:'gym_timplan_basis_read',create:'gym_timplan_created',read:'gym_timplan_read',row:'gym_timplan_row_changed'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checked=(checks,name,ok)=>checks.push({name,ok:Boolean(ok)});

export function parseGymApiArgs(argv) {
 const o={target:null,baseURL:null,out:null,preflight:false};
 for(let i=0;i<argv.length;i++) {
  const value=()=>{if(argv[i+1]===undefined)throw Error('REFUSED: missing argument');return argv[++i];};
  if(argv[i]==='--target')o.target=value();else if(argv[i]==='--base-url')o.baseURL=value();else if(argv[i]==='--out')o.out=resolve(value());
  else if(argv[i]==='--preflight')o.preflight=true;else throw Error('REFUSED: unknown argument');
 }
 if(o.target!=='protected'||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL??'')||!o.out
  ||!(dirname(o.out)===join(root,'work/pilot/results')||[tmpdir(),'/tmp','/private/tmp'].some(p=>o.out.startsWith(`${p}/`)))) {
  throw Error('REFUSED: explicit protected target, local Worker and safe evidence path required');
 }
 const port=Number(new URL(o.baseURL).port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('REFUSED: invalid local port');
 return o;
}
export function gymCasesStatus(cases) {
 return exactFunctions(cases.map(c=>c.name),GYM_API_CASES)&&cases.every(c=>c.status==='PASS'&&c.checks.length&&c.checks.every(k=>k.ok===true))?'PASS':'FAIL';
}
export async function withGymAclRestore(before,grant,restore,verify,run) {
 // Restore runs even when opening the entries failed halfway through.
 try {await grant();return await run();}
 finally {await restore(before);if(!await verify(before))throw Error('gym_acl_restore_failed');}
}
async function businessHashes(db) {
 const hashes={};
 for(const table of TABLES) {
  const rows=await db.unsafe(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`);
  hashes[table]={count:rows.length,sha256:sha(JSON.stringify(rows.map(r=>r.row)))};
 }
 return hashes;
}
async function main() {
 const o=parseGymApiArgs(process.argv.slice(2));
 // This guards target ownership, source/build equality, actual workerd and DB role
 // before any fixture writes or temporary privilege changes occur.
 const proof=await verifyGymTimplanBrowserTarget(o.baseURL),manifest=await assertTarget('protected');
 const db=require('postgres')(manifest.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const beforeAcl=await gymAcl(db),beforeFunctions=beforeAcl.filter(r=>r.granted).map(r=>r.f);
 const baselineFingerprint=await gymBaselineFingerprint(db);
 const expected=o.preflight?GYM_BASE_ENTRIES:[...GYM_BASE_ENTRIES,...GYM_ENTRIES];
 if(!exactFunctions(beforeFunctions,expected)) {await db.end({timeout:3});throw Error('REFUSED: previous exact Worker ACL changed');}
 const sourceHashes=Object.fromEntries(GYM_SOURCE_PATHS.map(p=>[p,sha(readFileSync(join(root,p)))]));
 let fixture,cleanup,verifiedFunctions=[],restoredFunctions=[],aclRestored=!o.preflight,failure;
 const cases=[],state={};
 const trigger=`p5_gym_api_fail_${randomUUID().replaceAll('-','')}`,triggerFn=`${trigger}_fn`;let injected=false;
 const owned=async tx=>{
  if(!fixture)throw Error('gym_fixture_missing');
  const rows=await tx`select c.id from public.customers c join public.organizers g on g.customer_id=c.id
   where c.id=${fixture.customerId} and g.id=${fixture.organizerId} and c.name='Syntetiskt programplansprov'`;
  if(rows.length!==1)throw Error('gym_fixture_ownership');
 };
 const clearInjection=async()=>{
  if(!injected)return;await assertTarget('protected');await owned(db);
  await db.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${triggerFn}()`);injected=false;
 };
 const inject=async(source,action,operation)=>{
  if(!['db','worker'].includes(source)||!Object.values(ACTIONS).includes(action))throw Error('gym_injection_invalid');
  await assertTarget('protected');await owned(db);
  // UUID, source and action are checked above; only this own customer's audit is affected.
  await db.begin(tx=>tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin
   if new.customer_id='${fixture.customerId}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='ok'
   then raise exception 'Synthetic gym audit failure' using errcode='P0001';end if;return new;end $$;
   create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}()`));
  injected=true;try{return await operation();}finally{await clearInjection();}
 };
 const request=async(session,path,body,headers={})=>{
  const response=await fetch(`${o.baseURL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',
   ...(session?{Cookie:`sp_session=${session.token}`,'X-Context-Epoch':String(session.epoch)}:{}),
   'Sec-Fetch-Site':'same-origin',Origin:o.baseURL,...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return {status:response.status,body:await response.json(),correlationId:response.headers.get('x-correlation-id'),cache:response.headers.get('cache-control')};
 };
 const call=(session,route,body,headers)=>request(session,`/api/timplaner/gym/${ROUTES[route]}`,body,headers);
 const success=async(checks,reply,session,route,id)=>{
  checked(checks,`${route} HTTP 200 and private response`,reply.status===200&&reply.cache==='no-store');
  checked(checks,`${route} exact DB and Worker audit pair`,reply.status===200&&await fixture.pairedGym(reply.correlationId,session,ACTIONS[route],id,route==='basis'?'programplan':'timplan'));
  if(reply.status!==200)throw Error('gym_response_failed');return reply.body;
 };
 const denied=async(checks,session,route,input,status,headers)=>{
  const before=await businessHashes(db),reply=await call(session,route,input,headers);
  checked(checks,`${route} denied HTTP ${status}`,reply.status===status&&reply.cache==='no-store'&&Object.keys(reply.body).every(k=>['code','correlationId','details'].includes(k)));
  checked(checks,`${route} denial preserves every business row`,equal(before,await businessHashes(db))&&!(await fixture.events(reply.correlationId)).some(e=>e.outcome==='ok'));
  return reply;
 };
 const createInput=(basis,unitId,predecessor=null)=>({commandId:randomUUID(),sourcePlanId:basis.source.planId,expectedSourceRevision:basis.source.revision,
  expectedEducationRevision:basis.source.educationRevision,unitId,predecessorPlanId:predecessor?.id??null,expectedPredecessorRevision:predecessor?.revision??null});
 const run=async(name,operation)=>{
  const checks=[];try{await operation(checks);}catch(error){checked(checks,`case completed (${/^[A-Z0-9_]{1,40}$/u.test(error?.code??'')?error.code:'TEST_FAILED'})`,false);}
  const status=checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL';cases.push({name,status,checks});process.stdout.write(`${status} ${name}\n`);
 };
 const execute=async()=>{
  verifiedFunctions=(await gymAcl(db)).filter(r=>r.granted).map(r=>r.f);
  fixture=await createGymTimplanFixture();
  await run('built-worker',async checks=>{
   const response=await fetch(`${o.baseURL}/api/health/db`,{signal:AbortSignal.timeout(30000)}),health=await response.json();
   checked(checks,'actual workerd uses limited Worker role',response.ok&&health.role==='skolplattform_worker'&&health.runtime==='workerd');
   checked(checks,'exact 25 entry privileges',exactFunctions(verifiedFunctions,[...GYM_BASE_ENTRIES,...GYM_ENTRIES]));
  });
  await run('source-school-scope',async checks=>{
   state.ready=await fixture.createReadyProgramplan(o.baseURL,{twoSchools:true});
   for(const [name,session,count,canPlan] of [['HM',fixture.hm,2,false],['R A',fixture.principal,1,true],['R B',fixture.principalB,1,true],['limited HM',fixture.partialHm,1,false],['administrator',fixture.admin,1,true]]) {
    const reply=await call(session,'basis',{sourcePlanId:state.ready.planId});
    const body=await success(checks,reply,session,'basis',state.ready.planId);
    checked(checks,`${name} own school scope and complete 2500 point frame`,body.units.length===count&&body.units.every(u=>u.canPlan===canPlan)&&body.readiness.ready&&body.rows.reduce((n,r)=>n+r.points,0)===2500);
   }
   state.basis=(await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId})).body;
  });
  await run('create-two-schools-replay',async checks=>{
   state.firstInput=createInput(state.basis,fixture.unitId);
   const simultaneous=await Promise.all([call(fixture.principal,'create',state.firstInput),call(fixture.principal,'create',state.firstInput)]);
   for(const reply of simultaneous)await success(checks,reply,fixture.principal,'create',reply.body.id);
   checked(checks,'concurrent identical commands create exactly one version and one replay',simultaneous.every(r=>r.status===200)
    &&simultaneous[0].body.id===simultaneous[1].body.id&&simultaneous.filter(r=>r.body.replayed===false).length===1&&simultaneous.filter(r=>r.body.replayed===true).length===1);
   state.first=simultaneous.find(r=>r.body.replayed===false)?.body;if(!state.first)throw Error('gym_concurrent_create_failed');
   const b=await call(fixture.principalB,'create',createInput(state.basis,fixture.secondUnitId));
   state.second=await success(checks,b,fixture.principalB,'create',b.body.id);
   checked(checks,'school version counters are independent',state.first.id!==state.second.id&&state.first.version===1&&state.second.version===1&&state.first.resetRows===state.basis.rows.length);
   const replay=await call(fixture.principal,'create',state.firstInput);
   const receipt=await success(checks,replay,fixture.principal,'create',state.first.id);
   checked(checks,'same command returns same frozen source',receipt.replayed&&receipt.id===state.first.id&&receipt.sourceRevision===state.basis.source.revision);
   state.firstPlan=await success(checks,await call(fixture.principal,'read',{planId:state.first.id}),fixture.principal,'read',state.first.id);
   checked(checks,'new hours are blank; point terms stay independent',Object.values(state.firstPlan.hours).every(h=>equal(h,[null,null,null,null,null,null]))&&equal(state.firstPlan.rows.map(r=>({rowKey:r.key,points:r.pointTerms})),state.ready.distribution));
   await denied(checks,fixture.principal,'create',{...state.firstInput,expectedSourceRevision:state.firstInput.expectedSourceRevision+1},409);
  });
  await run('row-null-cas',async checks=>{
   state.row=state.firstPlan.rows.find(r=>r.key.includes('IDRO'));
   state.carriedRow=state.firstPlan.rows.find(r=>r.key!==state.row.key&&r.pointTerms.some(p=>p>0));
   if(!state.row||!state.carriedRow)throw Error('gym_rows_missing');
   const zero=r=>r.pointTerms.map(p=>p>0?0:null);
   const input={planId:state.first.id,expectedRevision:state.first.revision,rowKey:state.row.key,hours:zero(state.row)};
   const before=await fixture.timplanSnapshot(state.first.id),simultaneous=await Promise.all([call(fixture.principal,'row',input),call(fixture.principal,'row',input)]);
   const winner=simultaneous.find(r=>r.status===200),loser=simultaneous.find(r=>r.status===409);
   checked(checks,'concurrent same-revision rows have one winner and one conflict',simultaneous.filter(r=>r.status===200).length===1&&simultaneous.filter(r=>r.status===409).length===1);
   if(!winner||!loser)throw Error('gym_concurrent_row_failed');
   const row=await success(checks,winner,fixture.principal,'row',state.first.id);state.first.revision=row.revision;
   const after=await fixture.timplanSnapshot(state.first.id);
   checked(checks,'concurrent conflict leaves exactly one row change/revision/history',after.plan.revision===before.plan.revision+1&&after.events.length===before.events.length+1
    &&equal(before.cells.filter(c=>c.row.row_id!==state.row.key),after.cells.filter(c=>c.row.row_id!==state.row.key))&&!(await fixture.events(loser.correlationId)).some(e=>e.outcome==='ok'));
   checked(checks,'zero is an explicitly saved allocation',equal(row.hours,input.hours));
   await denied(checks,fixture.principal,'row',input,409);
   const other={...input,expectedRevision:state.first.revision,rowKey:state.carriedRow.key,hours:zero(state.carriedRow)};
   const saved=await success(checks,await call(fixture.admin,'row',other),fixture.admin,'row',state.first.id);state.first.revision=saved.revision;
   const invalid={...other,expectedRevision:state.first.revision,hours:state.carriedRow.pointTerms.map((p,i)=>p>0?0:(i===state.carriedRow.pointTerms.indexOf(0)?0:null))};
   await denied(checks,fixture.principal,'row',invalid,400);
   const read=await success(checks,await call(fixture.hm,'read',{planId:state.first.id}),fixture.hm,'read',state.first.id);
   checked(checks,'HM sees saved zeros with other terms still blank',read.canPlan===false&&equal(read.hours[state.row.key],input.hours));
  });
  await run('source-replacement',async checks=>{
   const frozen=await fixture.timplanSnapshot(state.first.id),oldSource=await fixture.snapshot(state.ready.planId);
   const distribution=structuredClone(state.ready.distribution),changed=distribution.find(r=>r.rowKey===state.row.key),active=changed.points.map((p,i)=>p>0?i:-1).filter(i=>i>=0);
   if(active.length<2||changed.points[active[0]]<2)throw Error('gym_terms_missing');
   changed.points[active[0]]-=1;changed.points[active[1]]+=1;
   const terms=await request(fixture.hm,'/api/programplaner/terminer',{planId:state.ready.planId,expectedRevision:oldSource.revision,distribution});
   checked(checks,'saved program source can change independently',terms.status===200);if(terms.status!==200)throw Error('gym_source_change_failed');
   const oldRead=await success(checks,await call(fixture.principal,'read',{planId:state.first.id}),fixture.principal,'read',state.first.id);
   checked(checks,'old draft remains frozen and announces changed source',oldRead.sourceChanged&&oldRead.source.revision===oldSource.revision&&equal((await fixture.timplanSnapshot(state.first.id)).plan.gym_basis,frozen.plan.gym_basis));
   state.basis=await success(checks,await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId}),fixture.hm,'basis',state.ready.planId);
   const created=await call(fixture.principal,'create',createInput(state.basis,fixture.unitId,state.first));
   state.current=await success(checks,created,fixture.principal,'create',created.body.id);
   const old=await fixture.timplanSnapshot(state.first.id);
   checked(checks,'explicit replacement keeps every old hour',old.plan.status==='ersatt'&&old.plan.revision===state.first.revision+1&&equal(old.cells,frozen.cells));
   state.currentPlan=await success(checks,await call(fixture.principal,'read',{planId:state.current.id}),fixture.principal,'read',state.current.id);
   checked(checks,'only exactly unchanged rows reuse hours',state.current.resetRows===1&&state.current.carriedRows===state.basis.rows.length-1
    &&equal(state.currentPlan.hours[state.row.key],[null,null,null,null,null,null])&&equal(state.currentPlan.hours[state.carriedRow.key],state.firstPlan.rows.find(r=>r.key===state.carriedRow.key).pointTerms.map(p=>p>0?0:null)));
   const replay=await call(fixture.principal,'create',state.firstInput);
   const receipt=await success(checks,replay,fixture.principal,'create',state.first.id);
   checked(checks,'original receipt replay survives changed source and revision',receipt.replayed&&receipt.id===state.first.id&&receipt.revision===old.plan.revision&&receipt.sourceRevision===oldSource.revision);
   await denied(checks,fixture.principal,'row',{planId:state.first.id,expectedRevision:old.plan.revision,rowKey:state.row.key,hours:[null,null,null,null,null,null]},403);
  });
  await run('role-school-denials',async checks=>{
   const input=createInput(state.basis,fixture.unitId,state.current);
   await denied(checks,fixture.hm,'create',input,403);
   await denied(checks,fixture.principalB,'read',{planId:state.current.id},403);
   await denied(checks,fixture.principal,'read',{planId:state.second.id},403);
   await denied(checks,fixture.principal,'create',{...input,unitId:fixture.foreignUnitId},403);
   await denied(checks,fixture.admin,'create',{...input,unitId:fixture.nonGymUnitId},403);
   // The old projection must never reinterpret a six-term gym mask as raw zeros.
   const before=await businessHashes(db),legacy=await request(fixture.principal,'/api/timplaner/lasa',{planId:state.current.id});
   checked(checks,'old timplan API denies new six-term plans',legacy.status===403&&equal(before,await businessHashes(db)));
  });
  await run('source-not-ready',async checks=>{
   const beforeSource=await fixture.snapshot(state.ready.planId);
   const empty=await request(fixture.hm,'/api/programplaner/terminer',{planId:state.ready.planId,expectedRevision:beforeSource.revision,distribution:[]});
   checked(checks,'partial program source can be saved as work in progress',empty.status===200);if(empty.status!==200)throw Error('gym_partial_source_failed');
   const basis=await success(checks,await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId}),fixture.hm,'basis',state.ready.planId);
   checked(checks,'readiness provides concrete missing reasons',basis.readiness.ready===false&&basis.readiness.missing.length>0);
   await denied(checks,fixture.principal,'create',createInput(basis,fixture.unitId,state.current),409);
   const restored=await request(fixture.hm,'/api/programplaner/terminer',{planId:state.ready.planId,expectedRevision:empty.body.revision,distribution:beforeSource.term_distribution});
   checked(checks,'complete source is restored through real API',restored.status===200);
   // Full points with an invalid level order passes the SQL completeness gate;
   // the Worker must reject it and roll the already constructed timdraft back.
   const reversed=structuredClone(beforeSource.term_distribution),low=reversed.find(r=>r.rowKey.includes('ANIM1000X')),high=reversed.find(r=>r.rowKey.includes('ANIM2000X'));
   if(!low||!high)throw Error('gym_level_fixture_missing');[low.points,high.points]=[high.points,low.points];
   const badOrder=await request(fixture.hm,'/api/programplaner/terminer',{planId:state.ready.planId,expectedRevision:restored.body.revision,distribution:reversed});
   checked(checks,'a complete draft can expose its level-order error',badOrder.status===200);if(badOrder.status!==200)throw Error('gym_level_order_source_failed');
   const badBasis=await success(checks,await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId}),fixture.hm,'basis',state.ready.planId);
   checked(checks,'Worker catalog analysis rejects invalid level order',badBasis.readiness.ready===false&&badBasis.readiness.missing.length>0);
   await denied(checks,fixture.principal,'create',createInput(badBasis,fixture.unitId,state.current),409);
   const goodOrder=await request(fixture.hm,'/api/programplaner/terminer',{planId:state.ready.planId,expectedRevision:badOrder.body.revision,distribution:beforeSource.term_distribution});
   checked(checks,'valid frame is restored after Worker rollback proof',goodOrder.status===200);
   state.basis=(await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId})).body;
   const legacy=await call(fixture.hm,'basis',{sourcePlanId:fixture.legacyPlanId});
   checked(checks,'unbound legacy basis is readable but cannot become a draft',legacy.status===200&&!legacy.body.readiness.ready);
  });
  await run('audit-rollback',async checks=>{
   const input={planId:state.current.id,expectedRevision:state.current.revision,rowKey:state.row.key,hours:state.currentPlan.rows.find(r=>r.key===state.row.key).pointTerms.map(p=>p>0?15:null)};
   for(const source of ['db','worker'])for(const route of ['basis','read','row','create']) {
    const body=route==='basis'?{sourcePlanId:state.ready.planId}:route==='read'?{planId:state.current.id}:route==='row'?input:createInput(state.basis,fixture.unitId,state.current);
    const before=await businessHashes(db),reply=await inject(source,ACTIONS[route],()=>call(fixture.principal,route,body));
    checked(checks,`${source} ${route} audit failure returns no content`,reply.status===500&&reply.body.code==='audit_unavailable'&&reply.cache==='no-store');
    checked(checks,`${source} ${route} rolls back all rows/history and both success events`,equal(before,await businessHashes(db))&&!(await fixture.events(reply.correlationId)).some(e=>e.outcome==='ok'));
   }
  });
  await run('mfa-csrf-session',async checks=>{
   const input=createInput(state.basis,fixture.unitId,state.current);
   await denied(checks,fixture.noMfa,'create',input,403);
   await denied(checks,fixture.principal,'create',input,403,{Origin:'http://127.0.0.1:1','Sec-Fetch-Site':'cross-site'});
   await denied(checks,null,'read',{planId:state.current.id},401);
   const expired=await fixture.newPrincipal();await fixture.expire(expired);
   await denied(checks,expired,'read',{planId:state.current.id},401);
   await denied(checks,fixture.principal,'create',input,409,{'X-Context-Epoch':String(fixture.principal.epoch+1)});
  });
  await run('clients-closed',async checks=>{
   for(const role of ['anon','authenticated'])for(const entry of GYM_ENTRIES) {
    let code;try {await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select ${entry.split('(')[0]}(${entry.slice(entry.indexOf('(')+1,-1).split(',').map(t=>`null::${t}`).join(',')})`);});}catch(error){code=error.code;}
    checked(checks,`${role} cannot execute ${entry}`,code==='42501');
   }
   for(const role of ['anon','authenticated','skolplattform_worker'])for(const sql of ['select * from public.gym_timplan_receipts',`select public.phase5_gym_timplan_result('${state.current.id}'::uuid)`]) {
    let code;try {await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(sql);});}catch(error){code=error.code;}
    checked(checks,`${role} direct helper/table path is closed`,code==='42501');
   }
   const [profile]=await db`select rolbypassrls,rolsuper from pg_roles where rolname='skolplattform_worker'`;
   checked(checks,'Worker cannot bypass restrictive row policies',profile?.rolbypassrls===false&&profile?.rolsuper===false);
   const rawWorker=async(sql)=>db.begin(async tx=>{
    await tx`select set_config('app.customer_id',${fixture.customerId},true),set_config('app.organizer_id',${fixture.organizerId},true),
     set_config('app.identity_id',${fixture.principal.identityId},true),set_config('app.membership_id',${fixture.principal.membershipId},true),
     set_config('app.assignment_id',${fixture.principal.assignmentId},true),set_config('app.session_id',${fixture.principal.id},true),
     set_config('app.app_role','rektor',true),set_config('app.correlation_id',${randomUUID()},true)`;
    await tx`set local role skolplattform_worker`;return tx.unsafe(sql);
   });
   for(const sql of [`select id from public.timplans where id='${state.current.id}'::uuid`,
    `select row_id from public.timplan_cells where timplan_id='${state.current.id}'::uuid`,
    `select id from public.timplan_events where timplan_id='${state.current.id}'::uuid`]) {
    let result,code;try{result=await rawWorker(sql);}catch(error){code=error.code;}
    checked(checks,'new GY rows cannot be read through preserved legacy table grants',code==='42501'||result?.length===0);
   }
   for(const sql of [`update public.timplans set revision=revision+1 where id='${state.current.id}'::uuid`,
    `update public.timplan_cells set hours=array[1,1,1,1,1,1]::smallint[] where timplan_id='${state.current.id}'::uuid`,
    `insert into public.timplan_events(timplan_id,actor_role,action) values('${state.current.id}'::uuid,'rektor','gym_timplan_created')`]) {
    const before=await businessHashes(db);let result,code;try{result=await rawWorker(sql);}catch(error){code=error.code;}
    checked(checks,'raw GY writes cannot bypass required RPC/audit',code==='42501'||result?.count===0);
    checked(checks,'raw write denial preserves all business rows',equal(before,await businessHashes(db)));
   }
  });
  await run('legacy-class-preservation',async checks=>{
   const legacy=await fixture.seedLegacyClassLink();
   await denied(checks,fixture.principal,'read',{planId:legacy.planId},403);
   const read=await call(fixture.principal,'read',{planId:state.current.id});await success(checks,read,fixture.principal,'read',state.current.id);
   checked(checks,'legacy three-column values/timestamps and explicit class links remain exact',equal(legacy.snapshot,await fixture.timplanSnapshot(legacy.planId))&&equal(legacy.links,await fixture.classLinks()));
   // A valid decided program frame remains usable when a newer program draft exists.
   // Synthetic sealing supplies the decision fixture; the subsequent clone/create are real APIs.
   await fixture.sealOwnedPlan(state.ready.planId);
   const source=await fixture.snapshot(state.ready.planId),cloned=await request(fixture.hm,'/api/programplaner/klona',{
    sourcePlanId:state.ready.planId,expectedSourceRevision:source.revision,expectedLatestVersion:source.version,explicitLegacyBasis:null});
   checked(checks,'newer program draft coexists with decided source',cloned.status===200);if(cloned.status!==200)throw Error('gym_source_clone_failed');
   const oldBasis=await success(checks,await call(fixture.hm,'basis',{sourcePlanId:state.ready.planId}),fixture.hm,'basis',state.ready.planId);
   const oldCreate=await call(fixture.principal,'create',createInput(oldBasis,fixture.unitId,state.current));
   const older=await success(checks,oldCreate,fixture.principal,'create',oldCreate.body.id);
   checked(checks,'decided source remains usable despite higher draft version',older.sourcePlanId===state.ready.planId&&older.sourceRevision===source.revision);
   // A decided timplan predecessor must be copied without touching any old field.
   await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;
    await tx`update public.timplans set status='faststalld',decided_on='2026-09-10' where id=${older.id} and organizer_id=${fixture.organizerId}`;});
   const decided=await fixture.timplanSnapshot(older.id),next=await call(fixture.principal,'create',createInput(oldBasis,fixture.unitId,older));
   await success(checks,next,fixture.principal,'create',next.body.id);
   checked(checks,'decided predecessor is exactly preserved while new school draft is created',equal(decided,await fixture.timplanSnapshot(older.id))&&next.body.carriedRows===oldBasis.rows.length&&equal(legacy.links,await fixture.classLinks()));
   // Observe the real Worker blocked by an owned mandate-row lock, then revoke
   // that mandate before releasing it. A response-only delayed call is no proof.
   const lockDb=require('postgres')(manifest.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
   let release,readyResolve,readyReject;
   const released=new Promise(resolve=>{release=resolve;}),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
   const holder=lockDb.begin(async tx=>{
    await owned(tx);const assignments=await tx`select id from public.access_assignments where id=${fixture.principal.assignmentId} and customer_id=${fixture.customerId} for update`;
    if(assignments.length!==1)throw Error('gym_owned_assignment_missing');
    const [backend]=await tx`select pg_backend_pid() id`;readyResolve(backend.id);
    if(await released)await tx`update public.access_assignments set ended_at=clock_timestamp() where id=${fixture.principal.assignmentId} and customer_id=${fixture.customerId}`;
   }).catch(error=>{readyReject(error);throw error;});
   // Consume a possible early rejection while waiting for holder readiness.
   holder.catch(()=>{});
   try {
    const holderPid=await ready,before=await businessHashes(db);
    const row=oldBasis.rows.find(r=>r.key===state.row.key),pending=call(fixture.principal,'row',{
     planId:next.body.id,expectedRevision:next.body.revision,rowKey:row.key,hours:row.pointTerms.map(p=>p>0?25:null)});
    pending.catch(()=>{});
    let observed=false;
    for(let n=0;n<40&&!observed;n++) {
     const [waiting]=await db`select exists(select 1 from pg_stat_activity a where a.pid<>${holderPid} and a.wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(a.pid))) blocked`;
     observed=waiting.blocked;if(!observed)await new Promise(resolve=>setTimeout(resolve,100));
    }
    checked(checks,'actual Worker waits on the owned live mandate lock',observed);
    release(true);await holder;const result=await pending;
    checked(checks,'mandate revoked while waiting denies the actual row command',result.status===403&&result.cache==='no-store');
    checked(checks,'wait/revocation leaves all 14 business tables and success audit unchanged',equal(before,await businessHashes(db))&&!(await fixture.events(result.correlationId)).some(e=>e.outcome==='ok'));
   }finally {release(false);await holder.catch(()=>{});await lockDb.end({timeout:3});}
  });
 };
 try {
  if(o.preflight)await withGymAclRestore(beforeAcl,
   async()=>{for(const entry of GYM_ENTRIES)await db.unsafe(`grant execute on function ${entry} to skolplattform_worker`);},
   async before=>{for(const row of before.filter(r=>GYM_ENTRIES.includes(r.f)))await db.unsafe(`${row.granted?'grant':'revoke'} execute on function ${row.f} ${row.granted?'to':'from'} skolplattform_worker`);},
   async before=>{const after=await gymAcl(db);restoredFunctions=after.filter(r=>r.granted).map(r=>r.f);aclRestored=equal(before,after);return aclRestored;},execute);
  else {await execute();restoredFunctions=(await gymAcl(db)).filter(r=>r.granted).map(r=>r.f);aclRestored=equal(beforeAcl,await gymAcl(db));}
 }catch(error){failure=error;}
 finally {
  try {await clearInjection();}catch{failure??=Error('gym_audit_cleanup_failed');}
  if(fixture)try {cleanup=await fixture.cleanup();}catch{failure??=Error('gym_fixture_cleanup_failed');}
  await db.end({timeout:5});
 }
 const clean=cleanup?.originalBusinessUnchanged===true&&['gymReceipts','timplans','classLinks'].every(k=>cleanup[k]===0);
 const report={kind:'phase5-gym-timplan-api',target:'protected',scope:'local-synthetic-only',preflight:o.preflight,complete:!failure,
  status:!failure&&clean&&aclRestored&&gymCasesStatus(cases)==='PASS'?'PASS':'FAIL',cases,
  sourceCommit:proof.sourceRevision,workerBuildRevision:proof.buildRevision,sourceHashes,
  baselineFingerprint,
  beforeWorkerFunctions:beforeFunctions,verifiedWorkerFunctions:verifiedFunctions,restoredWorkerFunctions:restoredFunctions,
  preflightAclRestored:aclRestored,aclUnchanged:aclRestored,cleanupStatus:clean?'PASS':'FAIL',cleanup,
  originalBusinessPreserved:clean,originalHashes:fixture?.originalBusiness??null,finalHashes:cleanup?.after??null,
  error:failure?/^[A-Z0-9_]{1,40}$/u.test(failure.code??'')?failure.code:'TEST_FAILED':null};
 writeFileSync(o.out,JSON.stringify(report,null,2)+'\n');process.stdout.write(`${report.status} actual Worker gym preflight; ACL restored: ${aclRestored}; cleanup: ${report.cleanupStatus}\n`);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 process.stderr.write(error.message?.startsWith('REFUSED')?error.message+'\n':`FAILED: ${/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:'TEST_FAILED'}\n`);process.exitCode=1;
});
