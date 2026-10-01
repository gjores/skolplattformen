#!/usr/bin/env node
// Exact workspace-read preflight against the built local Worker and PostgreSQL.
// Sessions are minted only in the asserted disposable synthetic target.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { extractProgramplanFixture, cleanupProgramplanFixture } from './verify-programplan-locks.mjs';
import { PROGRAMPLAN_ENTRIES, TIMPLAN_ENTRIES, exactFunctions, withTemporaryGrants } from './verify-programplan-api.mjs';
import { canonicalCatalogJson } from '../../web/lib/programplan-catalog.ts';
import { parseProgramplanOfferingList, parseProgramplanWorkspace } from '../../web/lib/programplan-workspace-contract.ts';

export const WORKSPACE_ENTRIES = ['public.phase5_list_programplan_offerings(integer)','public.phase5_programplan_workspace(uuid,integer,text)'];
export const REQUIRED_CASES = ['worker-role','principal-list','hm-list','without-mfa','education-without-plan','legacy-order','pinned-exact-source',
 'explicit-no-selection','missing-exact-catalog','catalog-integrity','source-limitations','education-pagination','version-pagination','empty-school-scope',
 'roles-denied','other-school','other-customer','missing-object','wrong-school-kind','broken-unit-chain','parent-ended','membership-blocked',
 'customer-closed','session-expired','session-revoked','no-session','csrf','stale-context','invalid-input',
 ...['db','worker'].flatMap(s=>['lista','underlag'].map(r=>`${s}-audit-${r}`)),'denied-audit-failure','direct-sql-denied','expiry-after-observed-wait','read-preservation','persistent-audit'];
const root=path.resolve(fileURLToPath(import.meta.url),'../../..'),web=path.join(root,'web'),results=path.join(root,'work/pilot/results');
const BASE_ENTRIES=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES],FINAL_ENTRIES=[...BASE_ENTRIES,...WORKSPACE_ENTRIES];
const ACTIONS={lista:'programplan_offerings_listed',underlag:'programplan_workspace_read'};
const SOURCE_PATHS=['web/lib/programplan-workspace-contract.ts','web/lib/programplan-catalog.ts','web/lib/server/programplan-workspace.ts',
 'web/lib/server/programplan-planning.ts','web/lib/server/authz.ts','web/lib/server/db.ts','web/lib/server/http.ts','web/lib/server/events.ts',
 'web/lib/server/session.ts','web/lib/server/audit-details.ts','web/lib/server/mandate-route.ts',...Object.keys(ACTIONS).map(r=>`web/app/api/programplaner/${r}/route.ts`)];
export function workspaceStatus(cases) {
 return exactFunctions(cases.map(c=>c.name),REQUIRED_CASES)&&cases.every(c=>c.status==='PASS'&&c.checks.length&&c.checks.every(k=>k.ok===true)
  &&['response','persistent'].every(kind=>c.checks.some(k=>k.kind===kind)))?'PASS':'FAIL';
}
export function workspaceArgs(argv) {
 const o={target:null,out:null,port:3060,preflight:false};
 for(let i=0;i<argv.length;i++){const a=argv[i],v=()=>{if(argv[i+1]===undefined)throw Error('missing_value');return argv[++i];};
  if(a==='--target')o.target=v();else if(a==='--out')o.out=path.resolve(v());else if(a==='--port')o.port=Number(v());else if(a==='--preflight')o.preflight=true;else throw Error('unknown_argument');}
 if(o.target!=='protected'||!o.out||!(path.dirname(o.out)===results||[os.tmpdir(),'/tmp','/private/tmp'].some(d=>o.out.startsWith(`${d}/`)))
  ||!Number.isInteger(o.port)||o.port<1024||o.port>65535)throw Error('invalid_options');
 return o;
}
export async function workspaceTarget(guard,callback) { return callback(await guard('protected')); }
const equal=(a,b)=>canonicalCatalogJson(a)===canonicalCatalogJson(b);
function snapshotHashes(db) { return db`select
 (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.point_plans p) as plans,
 (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'[]')) from public.offerings o) as offerings,
 (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from public.point_plan_events e) as history,
 (select md5(coalesce(jsonb_agg(to_jsonb(c) order by unit_id,class_name,start_year)::text,'[]')) from public.class_timplans c) as classBindings,
 (select md5(coalesce(jsonb_agg(to_jsonb(c) order by catalog_id)::text,'[]')) from public.programplan_catalogs c) as catalogs`; }
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
async function main() {
 let o;try{o=workspaceArgs(process.argv.slice(2));}catch{console.error('REFUSED: explicit protected target, safe out and valid port required');process.exitCode=1;return;}
 const prefix=crypto.randomUUID().slice(0,8),foreignPrefix=crypto.randomUUID().slice(0,8);
 const id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`,foreignId=n=>`${foreignPrefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const trigger=`p510_fail_${prefix}`,triggerFn=`p510_fail_fn_${prefix}`;
 const revision=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 let db,server,manifest,mark,sourceCommit,aclBefore,originalHashes,setup=false,foreignSetup=false,triggerCreated=false,ownedCatalog=null,exitCode=1,activeCase,workerOutput='';
 const sessions=new Set(),cases=[],successes=[],denials=[],auditFailures=[],calls=[],startedAt=new Date().toISOString();
 let report={kind:'phase5-programplan-workspace-api',scope:'local-synthetic-only',startedAt,status:'FAIL',complete:false,cases};
 const check=(a,kind,name,ok)=>a.push({kind,name,ok:Boolean(ok)});
 const run=async(name,fn)=>{activeCase=name;const checks=[];try{await fn(checks);}catch{check(checks,'response','fall kunde köras',false);}
  const status=checks.length&&checks.every(c=>c.ok)&&['response','persistent'].every(k=>checks.some(c=>c.kind===k))?'PASS':'FAIL';cases.push({name,status,checks});console.log(`${status} ${name} (${checks.filter(c=>c.ok).length}/${checks.length})`);};
 const base=`http://127.0.0.1:${o.port}`;
 const acl=()=>db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' as f,
  has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') as granted,p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;
 const restoreAcl=async rows=>{for(const r of rows.filter(r=>WORKSPACE_ENTRIES.includes(r.f)))await db.unsafe(`${r.granted?'grant':'revoke'} execute on function ${r.f} ${r.granted?'to':'from'} skolplattform_worker`);};
 try {
  manifest=await assertTarget('protected');
  if(!manifest.idp?.issuer||!manifest.idp?.clientId)throw Error('BLOCKED: testprofil saknas');
  mark=JSON.parse(fs.readFileSync(path.join(web,'dist-protected/build-mode.json'),'utf8'));
  if(mark.mode!=='protected'||!mark.revision)throw Error('BLOCKED: protected-bygge saknas');
  if(execFileSync('git',['status','--porcelain','--',...SOURCE_PATHS],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim())throw Error('BLOCKED: APIkällor måste vara versionshanterade');
  sourceCommit=execFileSync('git',['log','-1','--format=%H','--',...SOURCE_PATHS],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  try{execFileSync('git',['merge-base','--is-ancestor',sourceCommit,mark.revision],{cwd:root,stdio:'ignore'});}catch{throw Error('BLOCKED: Worker-bygget är äldre än workspace-API');}
  db=createRequire(path.join(web,'package.json'))('postgres')(manifest.dbUrl,{max:5,prepare:false,connect_timeout:10,onnotice:()=>{}});
  aclBefore=await acl();
  if(!exactFunctions(aclBefore.filter(r=>r.granted).map(r=>r.f),o.preflight?BASE_ENTRIES:FINAL_ENTRIES)||WORKSPACE_ENTRIES.some(f=>!aclBefore.some(r=>r.f===f)))throw Error('REFUSED: oväntad phase5-ACL eller saknad workspace-signatur');
  originalHashes=await snapshotHashes(db);
  const execute=async()=>{
   let roles;
   const fixtureSource=fs.readFileSync(path.join(root,'supabase/tests/phase5_programplan_drafts.test.sql'),'utf8');
   await db.begin(async tx=>{await tx.unsafe(extractProgramplanFixture(fixtureSource,prefix));roles=Object.fromEntries((await tx`select name,id from programplan_roles`).map(r=>[r.name,r.id]));});setup=true;
   await db.begin(async tx=>{await tx.unsafe(extractProgramplanFixture(fixtureSource,foreignPrefix).replaceAll('create function pg_temp.','create or replace function pg_temp.').replace('create temporary table programplan_roles(name text primary key,id uuid);','delete from programplan_roles;'));});foreignSetup=true;
   const artifact=JSON.parse(fs.readFileSync(path.join(web,'lib/programplan-catalog.generated.json'),'utf8')),catalogId=artifact.catalogId;
   // Owned fixture changes happen before read-preservation snapshots.
   await db`update public.point_plans set specialization=${['UNKNOWN_LEGACY','ANIM1000X','UNKNOWN_LEGACY']} where id=${id(51)}`;
   await db`update public.offerings set local_code='SYNTETISK-ES',start_year=2026 where id=${id(45)}`;
   const mint=async(identity,membership,assignment)=>{const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest();
    const[s]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
     values(${hash},${id(identity)},${id(membership)},${assignment},'1',${['pwd']},now(),${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),now()+interval '30 minutes',now()+interval '8 hours') returning id::text,context_epoch::int as epoch`;
    sessions.add(s.id);return{...s,token,identityId:id(identity),membershipId:id(membership),assignmentId:assignment};};
   const principal=await mint(11,21,roles.principal),hm=await mint(10,20,id(60)),admin=await mint(13,23,roles.admin);
   const listInput={page:1},input=(offeringId=id(45),selectedId=null,versionPage=1)=>({offeringId,versionPage,catalogId:selectedId});
   const graph=async()=>({plans:await db`select to_jsonb(p) as p from public.point_plans p where organizer_id=${id(2)} order by id`,
    offerings:await db`select to_jsonb(o) as o from public.offerings o where organizer_id=${id(2)} order by id`,history:await db`select to_jsonb(e) as e from public.point_plan_events e where point_plan_id in(select id from public.point_plans where organizer_id=${id(2)}) order by id`});
   const call=async(s,route,body,headers={})=>{const response=await fetch(`${base}/api/programplaner/${route}`,{method:'POST',headers:{'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...(s?{Cookie:`sp_session=${s.token}`,'X-Context-Epoch':String(s.epoch)}:{}),...headers},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    let data;try{data=await response.json();}catch{}const r={status:response.status,body:data,corr:response.headers.get('x-correlation-id'),cache:response.headers.get('cache-control'),epoch:response.headers.get('x-context-epoch'),s,route,input:body};calls.push({caseId:activeCase,status:r.status,code:typeof r.body?.code==='string'?r.body.code:null,hasCorrelation:Boolean(r.corr)});return r;};
   const events=r=>r.corr?db`select source,action,outcome,actor_identity_id,membership_id,assignment_id,customer_id,session_id,object_type,object_id,details from public.security_events where correlation_id=${r.corr}::uuid`:[];
   const success=async r=>{if(r.route==='lista')parseProgramplanOfferingList(r.body,r.input.page);else parseProgramplanWorkspace(r.body,r.input);successes.push(r);const rows=await events(r);
    return r.status===200&&r.cache==='no-store'&&r.epoch===String(r.s.epoch)&&rows.length===2&&['db','worker'].every(source=>rows.some(e=>e.source===source&&e.action===ACTIONS[r.route]&&e.outcome==='ok'
     &&e.actor_identity_id===r.s.identityId&&e.membership_id===r.s.membershipId&&e.assignment_id===r.s.assignmentId&&e.customer_id===id(1)&&e.session_id===r.s.id
     &&e.object_type===(r.route==='lista'?'education_collection':'education')&&e.object_id===(r.route==='lista'?null:r.input.offeringId)
     &&(source==='db'?equal(e.details,{}):Object.keys(e.details).every(k=>k==='accessFunction'))));};
   const errorContract=r=>r.body&&Object.keys(r.body).length===2&&Object.hasOwn(r.body,'code')&&r.body.correlationId===r.corr&&r.cache==='no-store';
   const deny=async(c,s,route,body,status,code,headers={})=>{const before=await graph(),r=await call(s,route,body,headers);denials.push(r);check(c,'response','minimerat nekande',r.status===status&&(!code||r.body?.code===code)&&errorContract(r));const rows=await events(r);check(c,'persistent','oförändrad verksamhet och obligatoriskt nekande',equal(before,await graph())&&rows.length===1&&rows[0].source==='worker'&&rows[0].outcome==='denied'&&rows[0].action===ACTIONS[route]&&rows[0].object_id===null&&rows[0].details?.path==='/api/programplaner');return r;};
   const health=async()=>{try{const r=await fetch(`${base}/api/health/db`,{signal:AbortSignal.timeout(2000)});return r.ok&&(await r.json()).role==='skolplattform_worker';}catch{return false;}};
   try{const r=await fetch(base,{signal:AbortSignal.timeout(800)});await r.body?.cancel();throw Error('BLOCKED: provporten upptagen');}catch(e){if(e.message?.startsWith('BLOCKED:'))throw e;}
   server=spawn(process.execPath,['scripts/run-mode.mjs','preview','--mode','protected','--port',String(o.port)],{cwd:web,env:process.env,stdio:['ignore','pipe','pipe']});
   for(const stream of[server.stdout,server.stderr])stream.on('data',c=>workerOutput=(workerOutput+c).slice(-40000));
   let ready=false;for(const until=Date.now()+90000;Date.now()<until&&server.exitCode===null;){if(await health()){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('BLOCKED: Worker startade inte');
   await run('worker-role',async c=>{check(c,'response','byggd Worker har rätt roll',await health());check(c,'persistent','exakt tio entrypoints under provet',exactFunctions((await acl()).filter(r=>r.granted).map(r=>r.f),FINAL_ENTRIES));});
   for(const[name,s,count]of[['principal-list',principal,4],['hm-list',hm,5]])await run(name,async c=>{const r=await call(s,'lista',listInput);check(c,'response','verkligt scoped gymnasieurval med tom utbildning',r.status===200&&r.body.count===count&&r.body.offerings.some(e=>e.id===id(45)&&e.latestVersion===0));check(c,'persistent','tom och befintlig utbildning auditeras',await success(r));});
   await run('without-mfa',async c=>{for(const s of[principal,hm])for(const[route,body]of[['lista',listInput],['underlag',input()]]){const r=await call(s,route,body);check(c,'response','läsning tillåten utan engångskod',r.status===200);check(c,'persistent','faktisk sessionsbunden dubbel audit utan MFA',await success(r));}});
   await run('education-without-plan',async c=>{const r=await call(principal,'underlag',input());check(c,'response','utbildning med verklig metadata utan plan',r.status===200&&r.body.education.localCode==='SYNTETISK-ES'&&r.body.education.startYear===2026&&r.body.education.latestVersion===0&&r.body.education.draftId===null&&r.body.versionCount===0);check(c,'persistent','audit på rätt utbildning',await success(r));});
   await run('legacy-order',async c=>{const r=await call(principal,'underlag',input(id(41)));check(c,'response','okända/dubbla äldre koder och ordning bevaras',r.status===200&&equal(r.body.versions[0].legacySpecialization,['UNKNOWN_LEGACY','ANIM1000X','UNKNOWN_LEGACY'])&&r.body.education.startYear===null&&r.body.versions[0].basisReference===null);check(c,'persistent','legacyläsning auditerad',await success(r));});
   await run('pinned-exact-source',async c=>{const r=await call(principal,'underlag',input(id(40),catalogId));check(c,'response','exakt fryst källa och verkliga block/ämnesversioner',r.status===200&&r.body.catalog.status==='selected'&&r.body.catalog.catalogId===catalogId&&equal(r.body.catalog.program,artifact.programs.find(p=>p.code==='SA25'))&&r.body.versions[0].catalogId===catalogId&&r.body.versions[0].legacySpecialization===null);check(c,'persistent','exakt källunderlag auditerat',await success(r));});
   await run('explicit-no-selection',async c=>{const r=await call(principal,'underlag',input(id(40)));check(c,'response','NULL väljer aldrig tidigare bunden eller senaste katalog',r.status===200&&r.body.catalog.status==='unselected'&&r.body.catalog.catalogId===null&&r.body.catalog.program===null&&r.body.catalogs.length>0);check(c,'persistent','ingen dold bindning, auditerad läsning',await success(r));});
   await run('missing-exact-catalog',async c=>{const missing='sha256:'+'0'.repeat(64),r=await call(principal,'underlag',input(id(40),missing));check(c,'response','saknad exakt källa blir läsbart stopp utan fallback',r.status===200&&r.body.catalog.diagnostic==='catalog_unavailable'&&r.body.catalog.program===null);check(c,'persistent','begränsad läsning auditerad',await success(r));});
   await run('catalog-integrity',async c=>{
    const {catalogId:_hash,...payload}=structuredClone(artifact);payload.source.url=`https://${prefix}.catalog.example.test`;
    ownedCatalog='sha256:'+crypto.createHash('sha256').update(canonicalCatalogJson(payload)).digest('hex');
    await db`insert into public.programplan_catalogs(catalog_id,payload) values(${ownedCatalog},${db.json(payload)})`;
    try{await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`update public.programplan_catalogs set payload=jsonb_set(payload,'{source,url}','"https://corrupt.example.test"'::jsonb) where catalog_id=${ownedCatalog}`;});
     const before=await graph(),r=await call(principal,'underlag',input(id(45),ownedCatalog));auditFailures.push(r);
     check(c,'response','hashfel efter SQL lämnar inget källunderlag',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));
     check(c,'persistent','yttre transaktion rullar tillbaka DB-läsaudit',equal(before,await graph())&&!(await events(r)).some(e=>e.source==='db'||e.outcome==='ok'));
    }finally{await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`delete from public.programplan_catalogs where catalog_id=${ownedCatalog}`;});ownedCatalog=null;}
   });
   await run('source-limitations',async c=>{await db`update public.offerings set program_code='UNKNOWN',orientation_code=null where id=${id(45)}`;try{const r=await call(principal,'underlag',input(id(45),catalogId));check(c,'response','saknat program synligt utan gissning',r.status===200&&r.body.catalog.diagnostic==='program_not_found');check(c,'persistent','begränsad referensläsning auditerad',await success(r));}finally{await db`update public.offerings set program_code='ES25',orientation_code='ESBIF' where id=${id(45)}`;}});
   await run('education-pagination',async c=>{await db`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) select (${prefix}||'-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,${id(2)},${id(30)},'gymnasium','Syntetisk paginerad '||lpad(n::text,2,'0'),'Fri kull','ES25','ESBIF' from generate_series(1,55)n`;
    const first=await call(principal,'lista',{page:1}),second=await call(principal,'lista',{page:2}),empty=await call(principal,'lista',{page:3}),repeat=await call(principal,'lista',{page:1});check(c,'response','stabila sidor femtio/nio/noll med hel count',first.body?.count===59&&first.body.offerings.length===50&&second.body?.count===59&&second.body.offerings.length===9&&empty.body?.count===59&&empty.body.offerings.length===0&&equal(first.body,repeat.body)&&new Set([...first.body.offerings,...second.body.offerings].map(e=>e.id)).size===59);check(c,'persistent','varje sida och tomt svar har dubbel audit',(await Promise.all([first,second,empty,repeat].map(success))).every(Boolean));});
   await run('version-pagination',async c=>{await db`insert into public.point_plans(id,organizer_id,offering_id,version,status,specialization,decided_on) select (${prefix}||'-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,${id(2)},${id(42)},n,case when n=52 then 'utkast'::public.plan_status else 'ersatt'::public.plan_status end,array['UNKNOWN_ORDERED','ENGE3000X'],case when n=52 then null else '2026-01-01'::date end from generate_series(1,52)n where n<>3`;
    const first=await call(principal,'underlag',input(id(42))),old=await call(principal,'underlag',input(id(42),null,2)),empty=await call(principal,'underlag',input(id(42),null,3));check(c,'response','old page retains whole max/draft and exact old order',first.body?.versions.length===50&&old.body?.versionCount===52&&old.body.education.latestVersion===52&&old.body.education.draftId===id(452)&&old.body.versions.length===2&&old.body.versions[0].version===2&&old.body.versions[1].version===1&&equal(old.body.versions[1].legacySpecialization,['UNKNOWN_ORDERED','ENGE3000X'])&&empty.body?.versions.length===0&&empty.body.versionCount===52);check(c,'persistent','alla versionssidor har audit',(await Promise.all([first,old,empty].map(success))).every(Boolean));});
   const ownedBefore=await graph();
   await run('empty-school-scope',async c=>{
    const schoolCode=String(parseInt(prefix.slice(0,5),16)).padStart(6,'0').slice(-6)+'39';
    await db`insert into public.school_units(id,organizer_id,code,name,municipality_code) values(${id(39)},${id(2)},${schoolCode},'Syntetisk tom skola','0000')`;
    await db`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(${id(63)},${id(20)},${id(1)},${id(2)},'huvudman','synthetic-v1','school')`;
    await db`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${id(63)},${id(1)},${id(2)},${id(39)})`;
    const empty=await mint(10,20,id(63));const r=await call(empty,'lista',listInput);check(c,'response','giltig skolkontext utan gymnasieutbildning ger tom lista',r.status===200&&r.body.count===0&&r.body.offerings.length===0);check(c,'persistent','tomt resultat har audit',await success(r));});
   await run('roles-denied',async c=>{await deny(c,admin,'lista',listInput,403,'forbidden');await deny(c,admin,'underlag',input(),403,'forbidden');});
   await run('other-school',async c=>{await deny(c,principal,'underlag',input(id(43)),403,'forbidden');});
   await run('other-customer',async c=>{await deny(c,principal,'underlag',input(foreignId(45),catalogId),403,'forbidden');});
   await run('missing-object',async c=>{await deny(c,principal,'underlag',input(id(999)),403,'forbidden');});
   await run('wrong-school-kind',async c=>{await db`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values(${id(700)},${id(2)},${id(30)},'grundskola','Syntetisk GR','Fri kull')`;try{await deny(c,principal,'underlag',input(id(700)),403,'forbidden');}finally{await db`delete from public.offerings where id=${id(700)}`;}});
   await run('broken-unit-chain',async c=>{const[original]=await db`select unit_id,updated_at::text as updated_at from public.offerings where id=${id(45)}`;await db`update public.offerings set unit_id=${foreignId(30)} where id=${id(45)}`;try{await deny(c,principal,'underlag',input(),403,'forbidden');}finally{await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`update public.offerings set unit_id=${original.unit_id},updated_at=${original.updated_at}::text::timestamptz where id=${id(45)}`;});}});
   const boundary=async(c,change,restore,status=403,code)=>{await change();try{await deny(c,principal,'lista',listInput,status,code);await deny(c,principal,'underlag',input(),status,code);}finally{await restore();}};
   await run('parent-ended',c=>boundary(c,()=>db`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`,()=>db`update public.access_assignments set ended_at=null where id=${id(60)}`));
   await run('membership-blocked',c=>boundary(c,()=>db`update public.memberships set status='blocked',blocked_at=clock_timestamp() where id=${id(21)}`,()=>db`update public.memberships set status='active',blocked_at=null where id=${id(21)}`,403,'membership_blocked'));
   await run('customer-closed',c=>boundary(c,()=>db`update public.customers set closed_at=clock_timestamp() where id=${id(1)}`,()=>db`update public.customers set closed_at=null where id=${id(1)}`,403,'customer_closed'));
   for(const state of['expired','revoked'])await run(`session-${state}`,async c=>{const s=await mint(11,21,roles.principal);if(state==='expired')await db`update public.app_sessions set expires_at=now()-interval '1 second' where id=${s.id}`;else await db`update public.app_sessions set revoked_at=now() where id=${s.id}`;for(const[route,body]of[['lista',listInput],['underlag',input()]])await deny(c,s,route,body,401,`session_${state}`);});
   await run('no-session',async c=>{await deny(c,null,'lista',listInput,401,'no_session');await deny(c,null,'underlag',input(),401,'no_session');});
   await run('csrf',async c=>{for(const[route,body]of[['lista',listInput],['underlag',input()]])await deny(c,principal,route,body,403,'csrf',{'Sec-Fetch-Site':'cross-site',Origin:'https://foreign.example.test'});});
   await run('stale-context',async c=>{for(const[route,body]of[['lista',listInput],['underlag',input()]])await deny(c,{...principal,epoch:principal.epoch+1},route,body,409,'context_changed');});
   await run('invalid-input',async c=>{for(const body of['{',{page:0},{page:'1'},{page:1,customerId:id(1)}])await deny(c,principal,'lista',body,400,'bad_request');for(const body of['{',{...input(),startedOn:'2026-08-01'},{...input(),catalogId:'latest'},{...input(),versionPage:0},{...input(),offeringId:'invalid'}])await deny(c,principal,'underlag',body,400,'bad_request');});
   const inject=async(source,action,outcome,fn)=>{await assertTarget('protected');await db.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin if new.customer_id='${id(1)}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='${outcome}' then raise exception 'Synthetic workspace audit unavailable' using errcode='${source==='db'?'P0001':'55000'}';end if;return new;end $$;create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`);triggerCreated=true;try{return await fn();}finally{await db.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${triggerFn}();`);triggerCreated=false;}};
   for(const source of['db','worker'])for(const route of Object.keys(ACTIONS))await run(`${source}-audit-${route}`,async c=>{const before=await graph(),r=await inject(source,ACTIONS[route],'ok',()=>call(principal,route,route==='lista'?listInput:input()));auditFailures.push(r);check(c,'response','auditfel lämnar inget underlag',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));check(c,'persistent','inga ändringar eller framgångshändelser',equal(before,await graph())&&!(await events(r)).some(e=>e.outcome==='ok'));});
   await run('denied-audit-failure',async c=>{const before=await graph(),r=await inject('worker',ACTIONS.underlag,'denied',()=>call(admin,'underlag',input()));auditFailures.push(r);check(c,'response','nekandeloggfel stoppar svar',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));check(c,'persistent','ingen data eller framgångsaudit',equal(before,await graph())&&!(await events(r)).some(e=>e.outcome==='ok'));});
   await run('direct-sql-denied',async c=>{const codes=[];for(const role of['anon','authenticated'])for(const f of WORKSPACE_ENTRIES){try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select ${f.split('(')[0]}(${f.slice(f.indexOf('(')+1,-1).split(',').map(t=>`null::${t}`).join(',')})`);});codes.push('open');}catch(e){codes.push(e.code);}}for(const role of['anon','authenticated','skolplattform_worker'])for(const sql of['select * from public.programplan_catalogs',`select public.phase5_programplan_education(null::public.offerings)`,`select public.phase5_programplan_workspace_audit(null::uuid,'programplan_offerings_listed')`]){try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(sql);});codes.push('open');}catch(e){codes.push(e.code);}}check(c,'response','klient och hjälparanrop är verkligt nekade',codes.length===13&&codes.every(code=>code==='42501'));const[publicAcl]=await db`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%programplan%' and a.grantee=0 and a.privilege_type='EXECUTE') as closed`;check(c,'persistent','PUBLIC/helpers stängda och exakt tio grants',publicAcl.closed&&exactFunctions((await acl()).filter(r=>r.granted).map(r=>r.f),FINAL_ENTRIES));});
   await run('expiry-after-observed-wait',async c=>{
    const s=await mint(11,21,roles.principal);await db`update public.app_sessions set expires_at=clock_timestamp()+interval '3 seconds' where id=${s.id}`;
    let unlock,held,lockerPid;
    const gate=new Promise(resolve=>{unlock=resolve;}),locked=new Promise(resolve=>{held=resolve;});
    const locker=db.begin(async tx=>{const[p]=await tx`select pg_backend_pid() as pid`;lockerPid=p.pid;await tx`select id from public.offerings where id=${id(45)} for update`;held();await gate;});
    let response;
    try{
     await Promise.race([locked,locker.then(()=>{throw Error('lock_not_held');})]);const pending=call(s,'underlag',input());let observed=false;
     for(const until=Date.now()+2200;Date.now()<until;){const[p]=await db`select exists(select 1 from pg_stat_activity a where ${lockerPid}=any(pg_blocking_pids(a.pid)) and a.query like '%phase5_programplan_workspace%') as waiting`;if(p.waiting){observed=true;break;}await new Promise(r=>setTimeout(r,30));}
     check(c,'persistent','pg_blocking_pids observerar faktisk Worker-väntan på utbildning',observed);
     let expired=false;for(const until=Date.now()+5000;Date.now()<until;){const[p]=await db`select expires_at<=clock_timestamp() as expired from public.app_sessions where id=${s.id}`;if(p.expired){expired=true;break;}await new Promise(r=>setTimeout(r,40));}
     check(c,'persistent','verklig sessionssluttid passerad före låsfrigöring',expired);
     unlock();await locker;response=await pending;
    }finally{unlock();await locker;}
    denials.push(response);check(c,'response','utgången session efter väntan får inget innehåll',[401,403].includes(response.status)&&errorContract(response));
    const logged=await events(response);check(c,'persistent','ingen DB-framgång, endast Worker-nekande efter rollback',logged.length===1&&logged[0].source==='worker'&&logged[0].outcome==='denied'&&logged[0].action===ACTIONS.underlag);
   });
   await run('read-preservation',async c=>{const after=await graph();report.fixtureDifference=Object.entries(ownedBefore).flatMap(([table,rows])=>rows.flatMap((r,i)=>Object.entries(r).flatMap(([col,v])=>typeof v==='object'&&v?Object.keys(v).filter(k=>!equal(v[k],after[table][i]?.[col]?.[k])).map(k=>({table,row:i,field:k})):[])));check(c,'response','läsningar och nekanden bevarar originalets plan-/utbildningsfält',equal(ownedBefore,await graph()));check(c,'persistent','ingen verksamhetshistorik eller revisionsändring',equal(ownedBefore.history,(await graph()).history));});
   await run('persistent-audit',async c=>{check(c,'response','alla lässvar har korrelation och stängt beslut',successes.length>0&&successes.every(r=>r.corr&&(r.route==='lista'||r.body.decisionReady===false))&&[...denials,...auditFailures].every(errorContract));const rows=(await Promise.all([...successes,...denials,...auditFailures].map(events))).flat();check(c,'persistent','inga råa metadata/val/payload i audit',rows.every(e=>Object.keys(e.details).every(k=>['accessFunction','path','code'].includes(k)))&&denials.length>0);});
  };
  if(o.preflight){await withTemporaryGrants(aclBefore,async()=>{await assertTarget('protected');for(const f of WORKSPACE_ENTRIES)await db.unsafe(`grant execute on function ${f} to skolplattform_worker`);},restoreAcl,async rows=>equal(await acl(),rows),execute);report.preflightAclRestored=true;}else await execute();
  report={...report,revision:revision(),workerBuildRevision:mark.revision,sourceCommit,preflight:o.preflight,requiredCases:REQUIRED_CASES,complete:cases.length===REQUIRED_CASES.length,status:workspaceStatus(cases),cases,calls};exitCode=report.status==='PASS'?0:1;
 }catch(e){const safe=/^(BLOCKED|REFUSED):/u.test(e.message||'')?e.message.slice(0,200):'FAILED';console.error(safe,typeof e?.code==='string'&&/^[A-Z0-9_]{1,40}$/u.test(e.code)?e.code:'TEST_FAILED');report={...report,status:safe.startsWith('BLOCKED:')?'BLOCKED':'FAIL',error:safe};}
 finally{
  if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>{server.once('exit',r);setTimeout(r,3000);});if(server.exitCode===null)server.kill('SIGKILL');}
  if(db){const errors=[];try{await assertTarget('protected');}catch{errors.push('target');}
   if(o.preflight&&aclBefore)try{await restoreAcl(aclBefore);if(!equal(await acl(),aclBefore))throw Error('ACL');report.preflightAclRestored=true;}catch{errors.push('ACL');}
   if(ownedCatalog)try{await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`delete from public.programplan_catalogs where catalog_id=${ownedCatalog}`;});}catch{errors.push('catalog');}
   if(triggerCreated)try{await db.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${triggerFn}();`);}catch{errors.push('trigger');}
   try{if(sessions.size)await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`;});if(setup)report.cleanup=await cleanupProgramplanFixture(db,prefix);if(foreignSetup)report.foreignCleanup=await cleanupProgramplanFixture(db,foreignPrefix);if(originalHashes){report.originalHashes=originalHashes;report.finalHashes=await snapshotHashes(db);if(!equal(originalHashes,report.finalHashes))throw Error('business_preservation');report.originalBusinessPreserved=true;}const[t]=await db`select not exists(select 1 from pg_trigger where tgname=${trigger}) and not exists(select 1 from pg_proc where proname=${triggerFn}) as clean`;if(!t.clean)throw Error('trigger');report.cleanupStatus='PASS';}catch{errors.push('fixture');}
   if(errors.length){exitCode=1;report.status='FAIL';report.cleanupStatus='FAIL';report.cleanupFailures=errors;}await db.end({timeout:5});}
  if(exitCode&&workerOutput){const log=path.join(os.tmpdir(),`phase5-10-worker-${process.pid}.log`);fs.writeFileSync(log,workerOutput,{mode:0o600});console.error(`Privat Worker-diagnos: ${log}`);}
  report.completedAt=new Date().toISOString();report.migrationHashes=Object.fromEntries(['20261001120000_phase5_programplan_workspace.sql','20261001121000_phase5_worker_programplan_workspace.sql'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations',n))).digest('hex')]));report.sourceHashes=Object.fromEntries([...SOURCE_PATHS,'work/pilot/verify-programplan-workspace-api.mjs','supabase/migrations/20261001120000_phase5_programplan_workspace.sql'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
  fs.mkdirSync(path.dirname(o.out),{recursive:true});fs.writeFileSync(o.out,JSON.stringify(report,null,2)+'\n');console.log(`Totalstatus: ${report.status} (${cases.filter(c=>c.status==='PASS').length}/${REQUIRED_CASES.length})`);
 }
 process.exitCode=exitCode;
}
