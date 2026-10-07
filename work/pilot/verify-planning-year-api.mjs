#!/usr/bin/env node
// Actual owned local Worker/Postgres reads. Never resets or emits business payloads.
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {PLANNING_BASE_ENTRIES,PLANNING_ENTRIES,PLANNING_TABLES,PLANNING_FOUNDATION,planningFingerprint,planningBusinessHashes,sha,equal} from './apply-planning-year-migration.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../web/package.json',import.meta.url));
export const PLANNING_GRANTS='20261006121000_phase5_worker_planning_year_reads.sql';
export const PLANNING_API_CASES=['built-worker','role-school-selection','full-search-filter-sort-pages','gym-frozen-year-hours',
 'overview-frame-deduplication','gr-old-binding-unknown-map','im-null-legacy','future-missing-no-writes','scope-session-denials',
 'stale-selection','audit-required','clients-helpers-closed','legacy-read-regression','revoked-mandate','original-state-preservation'];
export const PLANNING_API_SOURCE_PATHS=['work/pilot/verify-planning-year-api.mjs','work/pilot/verify-planning-year-api.test.mjs',
 'work/pilot/phase5-planning-year-fixtures.mjs','work/pilot/phase5-gym-timplan-fixtures.mjs','work/pilot/phase5-programplan-browser-fixtures.mjs',
 'work/pilot/apply-planning-year-grants.mjs','work/pilot/apply-planning-year-migration.mjs','work/pilot/apply-gym-timplan-migration.mjs',
 'work/pilot/verify-programplan-api.mjs','work/pilot/verify-target.mjs',
 'web/lib/planning-year-contract.ts','web/lib/planning-year-model.ts','web/lib/server/planning-year.ts','web/lib/server/authz.ts',
 'web/lib/server/mandate-route.ts','web/lib/server/db.ts','web/lib/server/events.ts','web/lib/server/http.ts','web/lib/server/audit-details.ts','web/lib/mandate-policy.ts',
 'web/lib/server/gym-timplan.ts','web/lib/gym-timplan.ts','web/lib/programplan-catalog.generated.json',
 ...['urval','lista','oversikt'].map(s=>`web/app/api/planering/${s}/route.ts`),
 `supabase/migrations/${PLANNING_FOUNDATION}`,`supabase/migrations/${PLANNING_GRANTS}`];
const ACTIONS={urval:'planning_year_selection_read',lista:'planning_year_list_read',oversikt:'planning_year_overview_read'};
const checked=(checks,name,ok)=>checks.push({name,ok:Boolean(ok)});
const functions=acl=>acl.filter(r=>r.granted).map(r=>r.f);
export function parsePlanningApiArgs(argv){
 const o={target:null,baseURL:null,out:null,preflight:false};const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--target','--base-url','--out','--preflight'].includes(flag)||seen.has(flag))throw Error('REFUSED: exact arguments required');seen.add(flag);
  if(flag==='--preflight'){o.preflight=true;continue;}
  const value=argv[++i];if(!value||value.startsWith('--'))throw Error('REFUSED: missing argument');
  if(flag==='--target')o.target=value;else if(flag==='--base-url')o.baseURL=value;else o.out=resolve(value);
 }
 if(o.target!=='protected'||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL??'')||!o.out
  ||!(dirname(o.out)===join(root,'work/pilot/results')||[tmpdir(),'/tmp','/private/tmp'].some(p=>o.out.startsWith(`${p}/`))))throw Error('REFUSED: explicit protected target, local Worker and safe evidence path required');
 const port=Number(new URL(o.baseURL).port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('REFUSED: invalid local port');return o;
}
export function planningApiCasesStatus(cases){return Array.isArray(cases)&&exactFunctions(cases.map(c=>c.name),PLANNING_API_CASES)
 &&cases.every(c=>c.status==='PASS'&&Array.isArray(c.checks)&&c.checks.length&&c.checks.every(k=>k.ok===true))?'PASS':'FAIL';}
export async function withPlanningAclRestore(before,grant,restore,verify,run){
 try{await grant();return await run();}finally{await restore(before);if(!await verify(before))throw Error('planning_acl_restore_failed');}
}
export function validatePreflight(e,read){
 if(e?.kind!=='phase5-planning-year-api'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.preflight!==true||e.complete!==true||e.reset!==false
  ||e.preflightAclRestored!==true||e.aclUnchanged!==true||e.functionsAndJournalPreserved!==true||e.cleanupStatus!=='PASS'
  ||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true||e.originalAuditPreserved!==true||e.identityAnchorsPreserved!==true
  ||!exactFunctions(e.beforeWorkerFunctions??[],PLANNING_BASE_ENTRIES)||!exactFunctions(e.restoredWorkerFunctions??[],PLANNING_BASE_ENTRIES)
  ||!exactFunctions(e.verifiedWorkerFunctions??[],[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES])||planningApiCasesStatus(e.cases)!=='PASS'
  ||!Array.isArray(e.beforeAcl)||!e.beforeAcl.length||!equal(e.beforeAcl,e.afterAcl)
  ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??'')
  ||! /^[a-f0-9]{64}$/u.test(e.baselineFingerprint??'')||e.baselineFingerprint!==e.finalFingerprint
  ||!exactFunctions(Object.keys(e.originalHashes??{}),PLANNING_TABLES)||!equal(e.originalHashes,e.finalHashes)
  ||!e.cleanup?.originalBusinessUnchanged)throw Error('REFUSED: complete actual Worker, raw ACL and original-state proof required');
 for(const path of PLANNING_API_SOURCE_PATHS)if(e.sourceHashes?.[path]!==sha(read(path)))throw Error('REFUSED: source changed since preflight');
}
export function planningSelection(year,changes={}){return {schoolYear:year,unitId:null,view:'timplan',schoolform:'gymnasium',query:'',status:'all',cohortRelation:'all',archive:'all',grade:null,sort:'name',direction:'asc',page:1,selectionRevision:null,...changes};}
export function planningAuditPair(events,session,customerId,route){
 const actions=route==='urval'?[ACTIONS.urval]:[ACTIONS.urval,ACTIONS[route]];
 return Array.isArray(events)&&events.length===actions.length*2&&actions.every(action=>['db','worker'].every(source=>
  events.filter(e=>e.action===action&&e.source===source&&e.outcome==='ok'&&e.actor_identity_id===session.identityId
   &&e.membership_id===session.membershipId&&e.assignment_id===session.assignmentId&&e.session_id===session.id
   &&e.customer_id===customerId&&e.object_type==='planning_year_collection'&&e.object_id===null).length===1));
}
async function main(){
 const o=parsePlanningApiArgs(process.argv.slice(2));
 const {createPlanningYearFixture,verifyPlanningYearBrowserTarget}=await import('./phase5-planning-year-fixtures.mjs');
 const proof=await verifyPlanningYearBrowserTarget(o.baseURL),target=await assertTarget('protected');
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const beforeAcl=await gymAcl(db),beforeFunctions=functions(beforeAcl),expected=o.preflight?PLANNING_BASE_ENTRIES:[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES];
 if(!exactFunctions(beforeFunctions,expected)){await db.end({timeout:3});throw Error('REFUSED: exact starting Worker privileges differ');}
 const baselineFingerprint=await planningFingerprint(db),originalHashes=await planningBusinessHashes(db);
 const sourceHashes=Object.fromEntries(PLANNING_API_SOURCE_PATHS.map(p=>[p,sha(readFileSync(join(root,p)))]));
 let fixture,metadata,cleanup,failure,verifiedFunctions=[],afterAcl=[],finalFingerprint=null,finalHashes=null,aclRestored=false;
 const cases=[],state={};
 const trigger=`p5_planning_fail_${randomUUID().replaceAll('-','')}`,triggerFn=`${trigger}_fn`;let injected=false;
 const owned=async tx=>{
  if(!fixture)throw Error('planning_fixture_missing');
  const rows=await tx`select c.id from public.customers c join public.organizers g on g.customer_id=c.id
   where c.id=${fixture.customerId} and g.id=${fixture.organizerId} and c.name='Syntetiskt programplansprov'`;
  if(rows.length!==1)throw Error('planning_fixture_ownership');
 };
 const clearInjection=async()=>{if(!injected)return;await assertTarget('protected');await owned(db);
  await db.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${triggerFn}()`);injected=false;};
 const inject=async(source,action,operation)=>{
  if(!['db','worker'].includes(source)||!Object.values(ACTIONS).includes(action))throw Error('planning_injection_invalid');
  await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin
   if new.customer_id='${fixture.customerId}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='ok'
   then raise exception 'Synthetic planning audit failure' using errcode='P0001';end if;return new;end $$;
   create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}()`);});
  injected=true;try{return await operation();}finally{await clearInjection();}
 };
 const call=async(session,route,input,headers={})=>{
  const response=await fetch(`${o.baseURL}/api/planering/${route}`,{method:route==='urval'?'GET':'POST',headers:{'Content-Type':'application/json',
   ...(session?{Cookie:`sp_session=${session.token}`,'X-Context-Epoch':String(session.epoch)}:{}),'Sec-Fetch-Site':'same-origin',Origin:o.baseURL,...headers},
   ...(route==='urval'?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(30000)});
  return {status:response.status,body:await response.json(),correlationId:response.headers.get('x-correlation-id'),cache:response.headers.get('cache-control')};
 };
 const success=async(checks,session,route,input)=>{
  const reply=await call(session,route,input);checked(checks,`${route} HTTP200 no-store`,reply.status===200&&reply.cache==='no-store');
  checked(checks,`${route} exact actor DB/Worker audit pairs`,reply.status===200&&planningAuditPair(await fixture.events(reply.correlationId),session,fixture.customerId,route));
  if(reply.status!==200)throw Error('planning_response_failed');return reply.body;
 };
 const denied=async(checks,session,route,input,status,headers)=>{
  const before=await planningBusinessHashes(db),reply=await call(session,route,input,headers);
  checked(checks,`${route} HTTP${status} no-store without planning data`,reply.status===status&&reply.cache==='no-store'
   &&Object.keys(reply.body).every(k=>['code','correlationId','details'].includes(k)));
  checked(checks,`${route} denied read preserves every business row and no success audit`,equal(before,await planningBusinessHashes(db))
   &&!(await fixture.events(reply.correlationId)).some(e=>e.outcome==='ok'));return reply;
 };
 const run=async(name,operation)=>{const checks=[];try{await operation(checks);}catch(error){checked(checks,`case completed (${/^[A-Z0-9_]{1,40}$/u.test(error?.code??'')?error.code:'TEST_FAILED'})`,false);}
  const status=checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL';cases.push({name,status,checks});process.stdout.write(`${status} ${name}\n`);};
 const q=changes=>planningSelection(metadata.planningYear,changes);
 const execute=async()=>{
  verifiedFunctions=functions(await gymAcl(db));fixture=await createPlanningYearFixture();metadata=await fixture.setup(o.baseURL);
  await run('built-worker',async checks=>{
   const response=await fetch(`${o.baseURL}/api/health/db`),health=await response.json();
   checked(checks,'actual workerd uses limited Worker role',response.ok&&health.role==='skolplattform_worker'&&health.runtime==='workerd');
   checked(checks,'exact 28 read entry privileges',exactFunctions(verifiedFunctions,[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES]));
  });
  await run('role-school-selection',async checks=>{
   for(const [name,session] of [['HM',fixture.hm],['R A',fixture.principal],['R B',fixture.principalB],['limited HM',fixture.partialHm],['GY administrator',fixture.admin]]){
    const setup=await success(checks,session,'urval');
    checked(checks,`${name} actual live customer and school scope`,setup.customerId===fixture.customerId&&setup.units.length>0
     &&!setup.units.some(u=>u.unitId===metadata.foreignUnitId));
    if(name!=='HM')checked(checks,`${name} cannot acquire another school`,!setup.units.some(u=>u.unitId===(name==='R B'?fixture.unitId:fixture.secondUnitId)));
    if(name==='GY administrator')checked(checks,'GY administrator cannot read GR/IM',setup.units.every(u=>!u.canRead.grundskola&&!u.canRead.introduktionsprogram));
    const list=await success(checks,session,'lista',q({view:'programplan',query:metadata.sharedQuery}));
    checked(checks,`${name} program frame without pupil mandate`,list.count>0&&list.rows.every(r=>r.customerId===fixture.customerId));
   }
  });
  await run('full-search-filter-sort-pages',async checks=>{
   const input=q({view:'programplan',query:metadata.pageQuery,status:'utkast'}),first=await success(checks,fixture.hm,'lista',input);
   checked(checks,'52 full-scope rows, first page50',first.count===52&&first.rows.length===50&&first.pageSize===50);
   const second=await success(checks,fixture.hm,'lista',{...input,page:2,selectionRevision:first.selectionRevision});
   checked(checks,'same revision page2 has remaining2 without duplicates',second.rows.length===2&&second.selectionRevision===first.selectionRevision
    &&new Set([...first.rows,...second.rows].map(r=>r.offeringId)).size===52);
   const search=await success(checks,fixture.hm,'lista',{...input,query:metadata.pageSearchQuery});
   checked(checks,'search finds full collection item beyond initial page',search.count===1&&search.rows[0].offeringId===metadata.pageOfferingIds.at(-1));
   const reverse=await success(checks,fixture.hm,'oversikt',{...input,direction:'desc'});
   checked(checks,'overview and reversed ordering use all52 rows',reverse.count===52&&equal(reverse.rows.map(r=>r.offeringId),[...first.rows,...second.rows].map(r=>r.offeringId).reverse()));
   const filtered=await success(checks,fixture.hm,'lista',{...input,status:'faststalld'});checked(checks,'status filter applies to whole scope',filtered.count===0);
   const grade=await success(checks,fixture.hm,'lista',{...input,grade:1,cohortRelation:'relevant'});checked(checks,'grade/relation selects current firstyear',grade.count===17&&grade.rows.every(r=>r.relativeYear===1));
   for(const sort of ['school','cohort','version','status','grade','points']){
    const sorted=await success(checks,fixture.hm,'lista',{...input,sort});checked(checks,`${sort} has complete count and real revision`,sorted.count===52&&/^sha256:[a-f0-9]{64}$/u.test(sorted.selectionRevision));
   }
  });
  await run('gym-frozen-year-hours',async checks=>{
   const first=await success(checks,fixture.hm,'lista',q({query:metadata.sharedQuery}));state.frozenRows=first.rows;
   checked(checks,'two real school timplans freeze shared source',first.rows.length===2&&first.rows.every(r=>r.source?.planId===metadata.shared.planId&&r.relativeYear===1&&r.start.provenance==='timplan-source'));
   for(let delta=0;delta<3;delta++){
    const result=await success(checks,fixture.hm,'oversikt',q({query:metadata.sharedQuery,schoolYear:metadata.planningYear+delta}));
    checked(checks,`relativeyear${delta+1} keeps six originaltermcolumns`,result.rows.every(r=>r.relativeYear===delta+1&&r.cells.every(c=>c.hourValues===null||c.hourValues.length===6)));
    const expected=result.rows.reduce((sum,r)=>sum+r.cells.reduce((n,c)=>n+(c.hourValues?.[delta*2]??0)+(c.hourValues?.[delta*2+1]??0),0),0);
    checked(checks,`relativeyear${delta+1} uses exact relevanttermhours`,result.totals.annualHours.known===expected);
   }
   await fixture.changeFrozenSource();const after=await success(checks,fixture.hm,'lista',q({query:metadata.sharedQuery}));
   checked(checks,'live source mutation cannot move frozen start/revision/cells',equal(after.rows.map(r=>({start:r.start,source:r.source,cells:r.cells})),first.rows.map(r=>({start:r.start,source:r.source,cells:r.cells}))));
  });
  await run('overview-frame-deduplication',async checks=>{
   const both=await success(checks,fixture.hm,'oversikt',q({query:metadata.sharedQuery}));
   const a=await success(checks,fixture.hm,'oversikt',q({query:metadata.sharedQuery,unitId:fixture.unitId}));
   const b=await success(checks,fixture.hm,'oversikt',q({query:metadata.sharedQuery,unitId:fixture.secondUnitId}));
   checked(checks,'shared program points count once across schools',both.rows.length===2&&a.rows.length===1&&b.rows.length===1&&both.totals.points.known===a.totals.points.known&&a.totals.points.known===b.totals.points.known);
   checked(checks,'school timplan hours add independently',both.totals.annualHours.known===a.totals.annualHours.known+b.totals.annualHours.known);
  });
  await run('gr-old-binding-unknown-map',async checks=>{
   for(const [year,column,expectedClassIds] of [[metadata.gr.year8,'ak8',metadata.gr.classIds],[metadata.gr.year9,'ak9',[metadata.gr.classIds[0]]]]){
    const input=q({schoolform:'grundskola',unitId:fixture.nonGymUnitId,schoolYear:year}),body=await success(checks,fixture.hm,'oversikt',input);
    const rows=body.rows.filter(r=>r.offeringId===metadata.gr.offeringId);
    checked(checks,`${column} real year-bound old version wins newer draft`,rows.length===1&&rows.every(r=>r.plan?.id===metadata.gr.oldPlanId&&r.underlag==='class-bound'&&r.application?.schoolYear===year&&r.application.columnId===column));
    checked(checks,`${column} unknown original map retains real class references`,rows.every(r=>r.columnMap?.kind==='unknown'&&r.diagnostics.includes('unverified-column-map')&&r.cells.every(c=>c.hourValues===null))
     &&equal(rows.flatMap(r=>r.classes.map(c=>c.id)).sort(),[...expectedClassIds].sort())&&body.totals.annualHours.value===null);
    const grade=await success(checks,fixture.hm,'lista',{...input,grade:Number(column.slice(2))});checked(checks,`${column} grade filter follows exact binding`,grade.rows.length===1&&grade.rows.every(r=>r.application?.columnId===column));
   }
  });
  await run('im-null-legacy',async checks=>{
   const body=await success(checks,fixture.hm,'oversikt',q({schoolform:'introduktionsprogram',unitId:fixture.unitId}));
   const row=body.rows.find(r=>r.offeringId===metadata.im.offeringId);
   checked(checks,'IM keeps actual weekly source and null cells',row?.plan?.id===metadata.im.planId&&row.cells.length===7&&row.cells.some(c=>c.hourValues===null||c.hourValues.includes(null)));
   checked(checks,'weekly frame is partial, never yearly workload',body.totals.weeklyHours.value===null&&body.totals.weeklyHours.known>=0&&body.totals.annualHours.known===0);
  });
  await run('future-missing-no-writes',async checks=>{
   const before=await planningBusinessHashes(db),body=await success(checks,fixture.hm,'oversikt',q({schoolYear:2099}));
   checked(checks,'future query preserves all15 business tables and timestamps',equal(before,await planningBusinessHashes(db)));
   checked(checks,'missing and finished source diagnoses remain explicit',body.rows.some(r=>r.plan===null&&r.diagnostics.includes('missing-plan'))&&body.rows.some(r=>r.relation==='finished'&&r.relativeYear===null));
  });
  await run('scope-session-denials',async checks=>{
   await denied(checks,null,'urval',null,401);await denied(checks,null,'lista',q({}),401);await denied(checks,null,'oversikt',q({}),401);
   for(const route of ['lista','oversikt']){
    await denied(checks,fixture.hm,route,q({unitId:metadata.foreignUnitId}),403);
    await denied(checks,metadata.foreignHm,route,q({unitId:fixture.unitId}),403);
    await denied(checks,fixture.principal,route,q({unitId:fixture.secondUnitId}),403);
    await denied(checks,fixture.admin,route,q({schoolform:'grundskola',unitId:fixture.nonGymUnitId}),403);
    await denied(checks,fixture.hm,route,{...q({}),schoolYear:1999},400);
    await denied(checks,fixture.hm,route,{...q({}),unknown:true},400);
    await denied(checks,fixture.hm,route,q({page:2}),400);
    await denied(checks,fixture.hm,route,q({}),403,{Origin:'http://127.0.0.1:1','Sec-Fetch-Site':'cross-site'});
    await denied(checks,fixture.hm,route,q({}),409,{'X-Context-Epoch':String(fixture.hm.epoch+1)});
    await denied(checks,fixture.hm,route,q({}),400,{'Content-Type':'text/plain'});
   }
   const expired=await fixture.newPrincipal();await fixture.expire(expired);await denied(checks,expired,'urval',null,401);
   const epoch=await fixture.newPrincipal();await fixture.advanceEpoch(epoch);await denied(checks,epoch,'lista',q({}),409);
  });
  await run('stale-selection',async checks=>{
   const input=q({view:'programplan',query:metadata.pageQuery}),first=await success(checks,fixture.hm,'lista',input);await fixture.changeListRevision();
   for(const route of ['lista','oversikt']){const reply=await denied(checks,fixture.hm,route,{...input,page:route==='lista'?2:1,selectionRevision:first.selectionRevision},409);
    checked(checks,`${route} conflict directs whole selection reload`,reply.body.details?.reloadSelection===true);}
  });
  await run('audit-required',async checks=>{
   for(const source of ['db','worker'])for(const route of ['urval','lista','oversikt']){
    const before=await planningBusinessHashes(db),reply=await inject(source,ACTIONS[route],()=>call(fixture.hm,route,q({query:metadata.pageQuery,view:'programplan'})));
    checked(checks,`${source} ${route} failed required audit returns503 without data`,reply.status===503&&reply.body.code==='audit_unavailable'&&reply.cache==='no-store'
     &&Object.keys(reply.body).every(k=>['code','correlationId','details'].includes(k)));
    checked(checks,`${source} ${route} failure rolls back all success events and keeps original rows`,equal(before,await planningBusinessHashes(db))&&!(await fixture.events(reply.correlationId)).some(e=>e.outcome==='ok'));
   }
  });
  await run('clients-helpers-closed',async checks=>{
   for(const role of ['anon','authenticated','service_role'])for(const entry of PLANNING_ENTRIES){let code;
    try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select ${entry.split('(')[0]}(${entry.endsWith('(jsonb)')?"'{}'::jsonb":''})`);});}catch(error){code=error.code;}
    checked(checks,`${role} cannot execute ${entry}`,code==='42501');
   }
   const helpers=(await gymAcl(db)).filter(r=>r.f.startsWith('public.phase5_planning_year_')&&!PLANNING_ENTRIES.includes(r.f));
   checked(checks,'all11 internal helpers remain Worker closed',helpers.length===11&&helpers.every(r=>!r.granted));
   const [profile]=await db`select rolbypassrls,rolsuper from pg_roles where rolname='skolplattform_worker'`;checked(checks,'Worker has no bypass or superuser',profile?.rolbypassrls===false&&profile?.rolsuper===false);
  });
  await run('legacy-read-regression',async checks=>{
   const before=await planningBusinessHashes(db);
   for(const [path,body,session,action,type,id] of [
    ['/api/timplaner/gym/lasa',{planId:metadata.shared.firstTimplanId},fixture.principal,'gym_timplan_read','timplan',metadata.shared.firstTimplanId],
    ['/api/timplaner/lasa',{planId:metadata.gr.oldPlanId},fixture.hm,'timplan_read','timplan',metadata.gr.oldPlanId],
    ['/api/timplaner/lasa',{planId:metadata.im.planId},fixture.hm,'timplan_read','timplan',metadata.im.planId],
    ['/api/programplaner/lasa',{planId:metadata.shared.planId},fixture.hm,'programplan_read','programplan',metadata.shared.planId]]){
    const reply=await fixture.request(o.baseURL,session,path,body);checked(checks,`${path} old protected read remains200`,reply.status===200);
    const events=await fixture.events(reply.correlationId);checked(checks,`${path} old read still audits DB and Worker`,events.length===2&&['db','worker'].every(source=>events.some(e=>e.action===action&&e.source===source&&e.outcome==='ok'&&e.customer_id===fixture.customerId&&e.object_type===type&&e.object_id===id)));
   }
   checked(checks,'legacy reads preserve all business rows',equal(before,await planningBusinessHashes(db)));
  });
  await run('revoked-mandate',async checks=>{
   await fixture.revokeParent();for(const session of [fixture.hm,fixture.principal,fixture.principalB,fixture.admin])for(const route of ['urval','lista','oversikt'])await denied(checks,session,route,q({}),403);
  });
 };
 try{
  if(o.preflight)await withPlanningAclRestore(beforeAcl,
   async()=>{for(const entry of PLANNING_ENTRIES)await db.unsafe(`grant execute on function ${entry} to skolplattform_worker`);},
   async before=>{for(const row of before.filter(r=>PLANNING_ENTRIES.includes(r.f)))await db.unsafe(`${row.granted?'grant':'revoke'} execute on function ${row.f} ${row.granted?'to':'from'} skolplattform_worker`);},
   async before=>{afterAcl=await gymAcl(db);aclRestored=equal(before,afterAcl);return aclRestored;},execute);
  else{await execute();afterAcl=await gymAcl(db);aclRestored=equal(beforeAcl,afterAcl);}
 }catch(error){failure=error;}
 finally{
  try{await clearInjection();}catch{failure??=Error('planning_audit_cleanup_failed');}
  if(fixture)try{cleanup=await fixture.cleanup();}catch{failure??=Error('planning_fixture_cleanup_failed');}
  try{afterAcl=await gymAcl(db);aclRestored=equal(beforeAcl,afterAcl);finalFingerprint=await planningFingerprint(db);finalHashes=await planningBusinessHashes(db);}catch{failure??=Error('planning_final_state_failed');}
  await db.end({timeout:5});
 }
 const clean=cleanup?.originalBusinessUnchanged===true&&equal(originalHashes,finalHashes);
 const auditPreserved=cleanup?.originalAuditPreserved===true,anchorsPreserved=cleanup?.identityAnchorsPreserved===true;
 await run('original-state-preservation',async checks=>{
  checked(checks,'all15 original whole business rows/timestamps preserved',clean);
  checked(checks,'original security audit and identity anchors retained',auditPreserved&&anchorsPreserved);
  checked(checks,'all function definitions rawACL tableRLSACL journal preserved',baselineFingerprint===finalFingerprint);
  checked(checks,'exact raw functionACL restored even after partial grant',aclRestored&&equal(beforeAcl,afterAcl));
 });
 const report={kind:'phase5-planning-year-api',target:'protected',scope:'local-synthetic-only',preflight:o.preflight,reset:false,complete:!failure,
  status:!failure&&planningApiCasesStatus(cases)==='PASS'?'PASS':'FAIL',cases,sourceCommit:proof.sourceRevision,workerBuildRevision:proof.buildRevision,sourceHashes,
  baselineFingerprint,finalFingerprint,beforeAcl,afterAcl,beforeWorkerFunctions:beforeFunctions,verifiedWorkerFunctions:verifiedFunctions,restoredWorkerFunctions:functions(afterAcl),
  preflightAclRestored:aclRestored,aclUnchanged:aclRestored,functionsAndJournalPreserved:baselineFingerprint===finalFingerprint,
  cleanupStatus:clean&&auditPreserved&&anchorsPreserved?'PASS':'FAIL',cleanup,originalBusinessPreserved:clean,originalTimestampsPreserved:clean,
  originalAuditPreserved:auditPreserved,identityAnchorsPreserved:anchorsPreserved,originalHashes,finalHashes,
  error:failure?/^[A-Z0-9_]{1,40}$/u.test(failure.code??'')?failure.code:'TEST_FAILED':null};
 // Retain first FAIL/PARTIAL when retrying the same controlled output path.
 if(existsSync(o.out)){const old=JSON.parse(readFileSync(o.out,'utf8'));if(old.status!=='PASS'){
  const history=o.out.replace(/\.json$/u,'-first-fail.json');if(!existsSync(history))copyFileSync(o.out,history);
 }}
 writeFileSync(o.out,JSON.stringify(report,null,2)+'\n');process.stdout.write(`${report.status} actual Worker planning reads; raw ACL restored: ${aclRestored}; cleanup: ${report.cleanupStatus}\n`);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 process.stderr.write(error.message?.startsWith('REFUSED')?error.message+'\n':`FAILED: ${/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:'TEST_FAILED'}\n`);process.exitCode=1;
});
