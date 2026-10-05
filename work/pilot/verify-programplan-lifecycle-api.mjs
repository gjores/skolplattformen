#!/usr/bin/env node
// 05-20: livscykel-API mot verklig byggd Worker, endast lokalt syntetiskt mål.
// Preflight öppnar dispatchern tillfälligt och återställer exakt tidigare ACL.
import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { createProgramplanBrowserFixture,FUTURE_START,STARTED_START } from './phase5-programplan-browser-fixtures.mjs';
import { TIMPLAN_ENTRIES,PROGRAMPLAN_ENTRIES,WORKSPACE_ENTRIES,EDUCATION_ENTRIES,TERM_ENTRIES,LIFECYCLE_ENTRIES,exactFunctions } from './verify-programplan-api.mjs';
import { parseProgramplanOfferingList,parseProgramplanWorkspace } from '../../web/lib/programplan-workspace-contract.ts';
import { parseProgramplanLifecycleReply } from '../../web/lib/programplan-lifecycle.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const SOURCE=['web/lib/programplan-lifecycle.ts','web/lib/server/programplan-lifecycle.ts','web/app/api/programplaner/utbildning/livscykel/route.ts','web/lib/programplan-workspace-contract.ts',
 'web/lib/server/http.ts','supabase/migrations/20261004120000_phase5_programplan_lifecycle.sql','supabase/migrations/20261004121000_phase5_worker_programplan_lifecycle.sql'];
const LOCK_SOURCES=['supabase/migrations/20261004122000_phase5_programplan_lifecycle_locks.sql','web/lib/server/programplan-planning.ts','web/lib/server/programplan-terms.ts','web/lib/server/programplan-education.ts'];
const ROUTE='utbildning/livscykel',DELETED='programplan_education_deleted';
export const LIFECYCLE_API_CASES_T1=['built-worker','list-lifecycle','workspace-lifecycle','hm-delete-future','receipt-barrier','principal-denied','stale-revision','in-use-denied',
 'started-denied','unknown-denied','invalid-shape','no-MFA','no-session','origin-required','foreign-customer','mandatory-db-audit','mandatory-worker-audit','hm-delete-empty',
 'direct-clients-closed','persistent-minimal-audit'];
export const LIFECYCLE_API_CASES_T2=['archive-restore','archived-locked','update-details','update-start','update-start-denied','started-writes-locked','future-writes-open','past-start-create-denied','past-start-copy-denied'];
export async function runLifecycleApi(o) {
 if(!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL)||typeof o.preflight!=='boolean'||![resolve(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(resolve(o.outFile))))throw Error('REFUSED_unsafe_target');
 const manifest=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:5,prepare:false,onnotice:()=>{}});
 const report={kind:'phase5-programplan-lifecycle-api',scope:'local-synthetic-only',preflight:o.preflight,status:'FAIL',cases:[],calls:[],complete:false};
 let fixture,foreign,beforeAcl,original,triggerActive=false,locks=false;const extraSessions=[];const suffix=randomUUID().slice(0,8),trigger='p520_fail_'+suffix,fn='p520_fail_fn_'+suffix;
 const acl=()=>db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' f,has_function_privilege('skolplattform_worker',p.oid,'execute') granted,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;
 const restore=async()=>{for(const f of LIFECYCLE_ENTRIES){const r=beforeAcl.find(r=>r.f===f);await db.unsafe(`${r.granted?'grant':'revoke'} execute on function ${f} ${r.granted?'to':'from'} skolplattform_worker`);}assert.deepEqual(await acl(),beforeAcl);report.preflightAclRestored=true;};
 const hashes=()=>db`select (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.point_plans p) plans,(select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'[]')) from public.offerings o) offerings,(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'[]')) from public.school_classes c) classes`;
 const check=(c,name,ok)=>c.push({name,ok:Boolean(ok)});
 const run=async(name,callback)=>{const checks=[];try{await callback(checks);}catch(e){check(checks,'executable '+(/^[A-Z0-9_]{1,40}$/u.test(e.code??'')?e.code:'TEST_FAILED'),false);if(process.env.P520_DEBUG)console.error(e);}const status=checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL';report.cases.push({name,status,checks});console.log(status+' '+name);};
 try {
  const mark=JSON.parse(readFileSync(resolve(root,'web/dist-protected/build-mode.json'))),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  locks=(await db`select exists(select 1 from supabase_migrations.schema_migrations where version='20261004122000') applied`)[0].applied;
  const sources=locks?[...SOURCE,...LOCK_SOURCES]:SOURCE;
  if(mark.mode!=='protected'||!mark.revision||git(['status','--porcelain','--',...sources])||git(['diff','--name-only',mark.revision,'HEAD','--',...sources]))throw Error('BLOCKED_source_build');
  report.sourceCommit=git(['rev-parse','HEAD']);report.workerBuildRevision=mark.revision;report.locksApplied=locks;
  const old=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES],expected=[...old,...LIFECYCLE_ENTRIES];
  beforeAcl=await acl();if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),o.preflight?old:expected))throw Error('REFUSED_ACL');original=await hashes();
  if(o.preflight)for(const f of LIFECYCLE_ENTRIES)await db.unsafe(`grant execute on function ${f} to skolplattform_worker`);
  fixture=await createProgramplanBrowserFixture();foreign=await createProgramplanBrowserFixture();
  const started=await fixture.startedEducation();
  const offering=n=>`${fixture.customerId.slice(0,8)}-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const call=async(s,route,body,headers={})=>{const r=await fetch(`${o.baseURL}/api/programplaner/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:o.baseURL,'Sec-Fetch-Site':'same-origin',...(s?{Cookie:`sp_session=${s.token}`,'X-Context-Epoch':String(s.epoch)}:{}),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});let data;try{data=await r.json();}catch{}const out={status:r.status,body:data,corr:r.headers.get('x-correlation-id'),cache:r.headers.get('cache-control')};report.calls.push({status:r.status,route,correlationId:out.corr});return out;};
  const command=(offeringId,expectedRevision,cmd='delete',details={})=>({offeringId,expectedRevision,command:cmd,details});
  const state=async()=>(await db`select (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id)::text,'[]')) from public.offerings o join public.organizers g on g.id=o.organizer_id where g.customer_id=${fixture.customerId}) offerings,(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]')) from public.point_plans p join public.organizers g on g.id=p.organizer_id where g.customer_id=${fixture.customerId}) plans`)[0];
  const events=async corr=>db`select source,action,outcome,actor_identity_id,session_id,object_type,object_id,details from public.security_events where correlation_id=${corr}`;
  const paired=async(r,s,action,objectId)=>{const all=await events(r.corr);return all.length===2&&['db','worker'].every(src=>all.some(e=>e.source===src&&e.action===action&&e.outcome==='ok'&&e.actor_identity_id===s.identityId&&e.session_id===s.id&&e.object_type==='education'&&e.object_id===objectId));};
  const deny=async(c,s,body,status,code,route=ROUTE)=>{const before=await state(),r=await call(s,route,body),after=await state();check(c,`nekas ${status} ${code??''} utan skrivning`,r.status===status&&(!code||r.body?.code===code)&&JSON.stringify(before)===JSON.stringify(after));const e=await events(r.corr);check(c,'endast nekad Worker-händelse',e.length===1&&e[0].source==='worker'&&e[0].outcome==='denied');return r;};
  const inject=async(source,action,callback)=>{await assertTarget('protected');await db.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.customer_id='${fixture.customerId}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='ok' then raise exception 'Synthetic lifecycle audit failure' using errcode='55000';end if;return new;end$$;create trigger ${trigger} before insert on public.security_events for each row execute function public.${fn}()`);triggerActive=true;try{return await callback();}finally{await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${fn}()`);triggerActive=false;}};
  const mintHm=async(mfa)=>{const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest();const [s]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at) values(${hash},${fixture.hm.identityId},${fixture.hm.membershipId},${fixture.hm.assignmentId},${mfa?'2':'1'},${mfa?['pwd','otp']:['pwd']},now(),${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),now()+interval '30 minutes',now()+interval '8 hours') returning id::text,context_epoch::int epoch`;extraSessions.push(s.id);return{...s,token,identityId:fixture.hm.identityId,membershipId:fixture.hm.membershipId,assignmentId:fixture.hm.assignmentId};};
  const createFuture=async(name,startedOn=FUTURE_START)=>{const body={commandId:randomUUID(),unitId:fixture.unitId,name,localCode:null,cohort:'Syntetisk kull',basisReference:fixture.basis([],startedOn)};return{body,r:await call(fixture.hm,'utbildning/skapa',body)};};
  const lifecycleOf=async(s,id)=>{const r=await call(s,'underlag',{offeringId:id,versionPage:1,catalogId:null});return r.status===200?parseProgramplanWorkspace(r.body,{offeringId:id,versionPage:1,catalogId:null}).lifecycle:null;};

  await run('built-worker',async c=>{const r=await fetch(`${o.baseURL}/api/health/db`),b=await r.json();check(c,'verklig byggd workerd-roll',r.status===200&&b.role==='skolplattform_worker'&&b.runtime==='workerd');check(c,'exakt sexton Worker-funktioner',exactFunctions((await acl()).filter(r=>r.granted).map(r=>r.f),expected));});
  await run('list-lifecycle',async c=>{for(const s of [fixture.hm,fixture.principal]){const r=await call(s,'lista',{page:1}),list=parseProgramplanOfferingList(r.body,1),phase=id=>list.offerings.find(x=>x.id===id)?.lifecycle.phase;
   check(c,'statusen kommer från SQL i listan',r.status===200&&phase(offering(40))==='framtida'&&phase(offering(41))==='framtida'&&phase(offering(42))==='okand'&&phase(started.offeringId)==='pagaende');
   check(c,'startdatum och huvudskola',list.offerings.find(x=>x.id===started.offeringId)?.lifecycle.startsOn===STARTED_START&&list.offerings.every(x=>x.lifecycle.units.length===1&&x.lifecycle.units[0].id===x.unitId&&x.lifecycle.units[0].inMandate));}});
  await run('workspace-lifecycle',async c=>{const hm=await lifecycleOf(fixture.hm,offering(40)),pr=await lifecycleOf(fixture.principal,offering(40));check(c,'arbetsytan visar samma status som listan',hm?.phase==='framtida'&&hm.startsOn===FUTURE_START&&JSON.stringify(hm)===JSON.stringify(pr));check(c,'pågående i arbetsytan',(await lifecycleOf(fixture.hm,started.offeringId))?.phase==='pagaende');});
  let receipt;
  await run('hm-delete-future',async c=>{const {body,r}=await createFuture('Syntetisk raderbar SA');receipt=body;const id=r.body?.education?.id;check(c,'framtida utbildning skapad',r.status===200&&(await lifecycleOf(fixture.hm,id))?.phase==='framtida');
   const d=await call(fixture.hm,ROUTE,command(id,0));let reply=null;try{reply=parseProgramplanLifecycleReply(d.body,command(id,0));}catch{}
   check(c,'borttagning med strikt svar',d.status===200&&d.cache==='no-store'&&reply?.lifecycle===null&&await paired(d,fixture.hm,DELETED,id));
   const [left]=await db`select (select count(*)::int from public.offerings where id=${id}) offerings,(select count(*)::int from public.point_plans where offering_id=${id}) plans,(select details from public.security_events where correlation_id=${d.corr} and source='db') details,(select count(*)::int from public.organisation_events where action=${DELETED} and actor_identity_id=${fixture.hm.identityId}) org`;
   check(c,'utbildning och versioner borta, minimerad audit och organisationshändelse kvar',left.offerings===0&&left.plans===0&&JSON.stringify(left.details)===JSON.stringify({decided:false,versions:1})&&left.org===1);});
  await run('receipt-barrier',async c=>{const replay=await call(fixture.hm,'utbildning/skapa',receipt),status=await call(fixture.hm,'utbildning/status',{commandId:receipt.commandId});
   check(c,'replay återskapar inte',replay.status===409&&(await db`select count(*)::int n from public.offerings where name='Syntetisk raderbar SA' and organizer_id=(select organizer_id from public.access_assignments where id=${fixture.hm.assignmentId})`)[0].n===0);
   check(c,'status not_found och kvitto kvar',status.status===200&&status.body?.status==='not_found'&&(await db`select count(*)::int n from public.programplan_education_receipts where command_id=${receipt.commandId}`)[0].n===1);});
  await run('principal-denied',c=>deny(c,fixture.principal,command(offering(46),0),403,'forbidden'));
  await run('stale-revision',c=>deny(c,fixture.hm,command(offering(46),1),409,'conflict'));
  await run('in-use-denied',async c=>{await fixture.addClass(offering(45));await deny(c,fixture.hm,command(offering(45),0),409,'programplan_in_use');});
  await run('started-denied',c=>deny(c,fixture.hm,command(started.offeringId,0),409,'programplan_locked'));
  await run('unknown-denied',c=>deny(c,fixture.hm,command(offering(42),0),409,'programplan_locked'));
  await run('invalid-shape',async c=>{for(const b of [command(offering(46),0,'delete',{force:true}),command(offering(46),0,'drop'),{...command(offering(46),0),organizerId:fixture.customerId},command('inte-id',0)])await deny(c,fixture.hm,b,400,'bad_request');});
  await run('no-MFA',async c=>deny(c,await mintHm(false),command(offering(46),0),403,'mfa_required'));
  await run('no-session',c=>deny(c,null,command(offering(46),0),401,'no_session'));
  await run('origin-required',async c=>{for(const headers of [{Origin:'https://foreign.example.test','Sec-Fetch-Site':'cross-site'},{Origin:'','Sec-Fetch-Site':''}]){const before=await state(),r=await call(fixture.hm,ROUTE,command(offering(46),0),headers);check(c,'origin krävs',r.status===403&&r.body?.code==='csrf'&&JSON.stringify(before)===JSON.stringify(await state()));}});
  await run('foreign-customer',c=>deny(c,fixture.hm,command(`${foreign.customerId.slice(0,8)}-0000-4000-8000-000000000046`,0),403,'forbidden'));
  for(const [name,source] of [['mandatory-db-audit','db'],['mandatory-worker-audit','worker']])await run(name,async c=>{const before=await state(),r=await inject(source,DELETED,()=>call(fixture.hm,ROUTE,command(offering(46),0)));check(c,'auditfel stoppar och rullar tillbaka',r.status===500&&r.body?.code==='audit_unavailable'&&JSON.stringify(before)===JSON.stringify(await state()));check(c,'ingen lyckad händelse kvar',!(await events(r.corr)).some(e=>e.outcome==='ok'));});
  if(locks)await runLocks();
  await run('hm-delete-empty',async c=>{const d=await call(fixture.hm,ROUTE,command(offering(46),0)),[row]=await db`select details from public.security_events where correlation_id=${d.corr} and source='db'`;check(c,'utbildning utan versioner tas bort',d.status===200&&await paired(d,fixture.hm,DELETED,offering(46))&&!(await fixture.offering(offering(46)))&&JSON.stringify(row?.details)===JSON.stringify({decided:false,versions:0}));});
  await run('direct-clients-closed',async c=>{const codes=[];for(const role of ['anon','authenticated'])try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select public.phase5_change_programplan_education(null::uuid,null::integer,null::text,null::jsonb)`);});codes.push('open');}catch(e){codes.push(e.code);}
   for(const role of ['anon','authenticated','skolplattform_worker'])for(const sql of ['delete from public.offerings where false','update public.point_plans set revision=revision where false','delete from public.school_units where false'])try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(sql);});codes.push('open');}catch(e){codes.push(e.code);}
   check(c,'direkta klienter och Worker nekas',codes.length===11&&codes.every(x=>x==='42501'));
   check(c,'hjälpare stängd',(await db`select not has_function_privilege('skolplattform_worker','public.phase5_programplan_writable(public.offerings,boolean)','execute') ok`)[0].ok);});
  await run('persistent-minimal-audit',async c=>{const [row]=await db`select count(*)::int n,bool_and(details ?& array['versions','decided'] and (select count(*) from jsonb_object_keys(details))=2) minimized from public.security_events where customer_id=${fixture.customerId} and source='db' and action=${DELETED}`;check(c,'DB-händelser utan namn eller planinnehåll',row.n>=2&&row.minimized);check(c,'varje svar korrelerat',report.calls.every(r=>r.correlationId));});
  // 05-20 uppgift 2: lås, arkiv och ändrade uppgifter. Körs bara när låsmigrationen är tillämpad.
  async function runLocks(){
   const id40=offering(40),plan50=fixture.planId;
   await run('archive-restore',async c=>{const a=await call(fixture.hm,ROUTE,command(started.offeringId,0,'archive'));let reply=null;try{reply=parseProgramplanLifecycleReply(a.body,command(started.offeringId,0,'archive'));}catch{}
    check(c,'pågående plan kan arkiveras',a.status===200&&reply?.lifecycle?.archived===true&&reply.lifecycle.revision===1&&await paired(a,fixture.hm,'programplan_education_archived',started.offeringId));
    const listed=parseProgramplanOfferingList((await call(fixture.principal,'lista',{page:1})).body,1).offerings.find(x=>x.id===started.offeringId);check(c,'arkiverad syns som arkiverad i listan',listed?.lifecycle.archived===true);
    const r=await call(fixture.hm,ROUTE,command(started.offeringId,1,'restore'));check(c,'tas fram ur arkivet med ny revision',r.status===200&&r.body?.lifecycle?.archived===false&&r.body.lifecycle.revision===2&&await paired(r,fixture.hm,'programplan_education_restored',started.offeringId));
    await deny(c,fixture.principal,command(started.offeringId,2,'archive'),403,'forbidden');await deny(c,fixture.hm,command(started.offeringId,2,'restore'),409,'conflict');});
   await run('archived-locked',async c=>{const a=await call(fixture.hm,ROUTE,command(id40,0,'archive'));check(c,'framtida plan arkiverad',a.status===200);
    await deny(c,fixture.principal,{planId:plan50,expectedRevision:0,distribution:[]},409,'programplan_locked','terminer');
    await deny(c,fixture.hm,command(id40,1,'delete'),409,'programplan_locked');
    const r=await call(fixture.hm,ROUTE,command(id40,1,'restore'));check(c,'framtagen plan kan ändras igen',r.status===200&&(await call(fixture.principal,'terminer',{planId:plan50,expectedRevision:0,distribution:[]})).status===200);});
   await run('update-details',async c=>{const details={name:'Syntetisk bunden SA, ny',localCode:'SYN-1',cohort:'Syntetisk kull nästa år',startedOn:null},r=await call(fixture.hm,ROUTE,command(id40,2,'update',details)),row=await fixture.offering(id40);
    check(c,'namn, kod och kull ändrade',r.status===200&&r.body?.lifecycle?.revision===3&&row.name===details.name&&row.local_code==='SYN-1'&&row.cohort===details.cohort&&await paired(r,fixture.hm,'programplan_education_updated',id40));
    await deny(c,fixture.hm,command(id40,3,'update',{...details,name:'x'.repeat(121)}),400,'bad_request');await deny(c,fixture.principal,command(id40,3,'update',details),403,'forbidden');});
   await run('update-start',async c=>{const {r}=await createFuture('Syntetisk startbyte SA'),id=r.body?.education?.id,plan=r.body?.plan?.id,next=`${Number(FUTURE_START.slice(0,4))+1}-08-18`;
    const u=await call(fixture.hm,ROUTE,command(id,0,'update',{name:'Syntetisk startbyte SA',localCode:null,cohort:'Syntetisk kull',startedOn:next})),[p]=await db`select revision,basis_reference->>'startedOn' s from public.point_plans where id=${plan}`,row=await fixture.offering(id);
    check(c,'startdatum i ensamt utkast och startår ändrade i samma transaktion',u.status===200&&u.body?.lifecycle?.startsOn===next&&p.s===next&&p.revision===1&&row.start_year===Number(next.slice(0,4)));
    await deny(c,fixture.hm,command(id,1,'update',{name:'Syntetisk startbyte SA',localCode:null,cohort:'Syntetisk kull',startedOn:STARTED_START}),400,'programplan_start_passed');});
   await run('update-start-denied',async c=>{await deny(c,fixture.hm,command(offering(41),0,'update',{name:'Syntetisk obunden SA',localCode:null,cohort:'Inte ett datum',startedOn:FUTURE_START}),400,'bad_request');});
   await run('started-writes-locked',async c=>{const p=started.planId,base={planId:p,expectedRevision:0};
    for(const [route,body] of [['terminer',{...base,distribution:[]}],['fordjupning',{...base,specializationRefs:[]}],['binda',{...base,basisReference:fixture.basis()}]])await deny(c,fixture.principal,body,409,'programplan_locked',route);
    await deny(c,fixture.hm,command(started.offeringId,2,'update',{name:'Syntetisk pågående SA',localCode:null,cohort:'Syntetisk startad kull',startedOn:null}),409,'programplan_locked');
    const read=await call(fixture.principal,'terminer/lasa',{planId:p});check(c,'utkast i pågående plan kan läsas och finns kvar',read.status===200&&read.body?.status==='utkast');});
   await run('future-writes-open',async c=>{const r=await call(fixture.principal,'fordjupning',{planId:fixture.planId,expectedRevision:1,specializationRefs:[]});check(c,'framtida plan ändras som förut',r.status===200&&r.body?.revision===2);});
   await run('past-start-create-denied',async c=>{for(const day of [STARTED_START,new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm'}).format(new Date())]){const before=await state(),{r}=await createFuture(`Syntetisk passerad ${day}`,day);check(c,`skapande med start ${day} nekas`,r.status===400&&r.body?.code==='programplan_start_passed'&&JSON.stringify(before)===JSON.stringify(await state()));}});
   await run('past-start-copy-denied',async c=>{const before=await state(),{r}=await createFuture('Syntetisk kopia bakåt','2020-08-17');check(c,'kopia med passerat start nekas',r.status===400&&r.body?.code==='programplan_start_passed'&&JSON.stringify(before)===JSON.stringify(await state()));});
  }
  const required=locks?[...LIFECYCLE_API_CASES_T1,...LIFECYCLE_API_CASES_T2]:LIFECYCLE_API_CASES_T1;
  report.complete=exactFunctions(report.cases.map(c=>c.name),required);report.status=report.complete&&report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
 } catch(e) {report.error=/^(BLOCKED|REFUSED)_/u.test(e.message??'')?e.message:'TEST_FAILED';report.code=/^[A-Z0-9]{5}$/u.test(e.code??'')?e.code:null;if(process.env.P520_DEBUG)console.error(e);}
 finally {
  try{await assertTarget('protected');if(triggerActive)await db.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${fn}()`);if(extraSessions.length)await db.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`delete from public.app_sessions where id=any(${extraSessions}::uuid[])`;});if(fixture)report.cleanup=await fixture.cleanup();if(foreign)report.foreignCleanup=await foreign.cleanup();if(o.preflight&&beforeAcl)await restore();if(original){report.originalHashes=original;report.finalHashes=await hashes();assert.deepEqual(report.finalHashes,original);report.originalBusinessPreserved=true;}report.cleanupStatus='PASS';}catch(e){report.cleanupStatus='FAIL';report.status='FAIL';if(process.env.P520_DEBUG)console.error(e);}
  await db.end({timeout:5});report.completedAt=new Date().toISOString();report.sourceHashes=Object.fromEntries((locks?[...SOURCE,...LOCK_SOURCES]:SOURCE).map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));mkdirSync(dirname(o.outFile),{recursive:true});writeFileSync(o.outFile,JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o={baseURL:'http://127.0.0.1:3059',preflight:false,outFile:resolve(root,'work/pilot/results/phase5-20-lifecycle-api.json')};const args=process.argv.slice(2);for(let i=0;i<args.length;i++){if(args[i]==='--preflight')o.preflight=true;else if(args[i]==='--base-url')o.baseURL=args[++i];else if(args[i]==='--out')o.outFile=resolve(args[++i]);else throw Error('unknown_argument');}
 const r=await runLifecycleApi(o);console.log(JSON.stringify({status:r.status,passed:r.cases.filter(c=>c.status==='PASS').length,total:r.cases.length,error:r.error,cleanup:r.cleanupStatus}));if(r.status!=='PASS')process.exitCode=1;
}
