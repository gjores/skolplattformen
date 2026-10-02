// Egen syntetisk kund per browserfall. Audit och dess identitetsankare bevaras.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTarget } from './verify-target.mjs';
import { extractProgramplanFixture, cleanupProgramplanFixture } from './verify-programplan-locks.mjs';
import { trialEducationSpecs } from './prepare-programplan-user-trial.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'web/package.json'));
const MARKER='Syntetiskt programplansprov';
const SOURCE_PATHS=['web/scripts/run-mode.mjs','web/scripts/preview-worker.mjs','web/scripts/preview-worker-modules.mjs','web/app/protected-home.tsx','web/app/protected-programplan-workspace.tsx','web/app/protected-programplan-overview.tsx','web/app/protected-programplan.css','web/app/mfa-step-up.tsx',
  'web/lib/programplan-education-contract.ts','web/lib/server/programplan-education.ts','web/lib/protected-programplan-education.ts','web/app/protected-programplan-level-picker.tsx','web/app/protected-programplan-flow.tsx','supabase/migrations/20261002120000_phase5_programplan_education.sql','supabase/migrations/20261002121000_phase5_worker_programplan_education.sql','web/lib/protected-programplan.ts','web/lib/programplan-contract.ts','web/lib/programplan-workspace-contract.ts','web/lib/server-client.ts','web/lib/unsaved-changes.tsx',
  'web/lib/server/programplan-planning.ts','web/lib/server/programplan-workspace.ts','web/lib/programplan-catalog.ts','web/app/api/programplaner',
  'web/e2e/phase5-programplan.spec.ts','web/playwright.phase5-programplan.config.ts','work/pilot/phase5-programplan-browser-fixtures.mjs','work/pilot/verify-programplan-browser.mjs','work/pilot/prepare-programplan-user-trial.mjs'];
export function programplanBrowserBuildProof(mark,sourceRevision,dirty,ancestor,health) {
  if(mark?.mode!=='protected'||!/^([0-9a-f]{40})$/u.test(mark.revision??'')||!/^([0-9a-f]{40})$/u.test(sourceRevision??''))throw Error('Skyddat versionshanterat bygge saknas.');
  if(dirty||ancestor!==true)throw Error('Browserprov kräver aktuell versionshanterad UI/serverkod i bygget.');
  if(health?.ok!==true||health.role!=='skolplattform_worker'||health.runtime!=='workerd')throw Error('Browserprovet kräver verklig byggd Worker.');
  return {sourceRevision,buildRevision:mark.revision};
}
export async function verifyProgramplanBrowserTarget(baseURL) {
  if(!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL))throw Error('Endast lokal browserprovserver tillåts.');
  await assertTarget('protected');
  const mark=JSON.parse(readFileSync(path.join(root,'web/dist-protected/build-mode.json'),'utf8'));
  if(mark.mode!=='protected'||!mark.revision)throw Error('Skyddat versionshanterat bygge saknas.');
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(git(['status','--porcelain','--',...SOURCE_PATHS]))throw Error('Browserprov kräver versionshanterad UI/serverkod.');
  const source=git(['rev-parse','HEAD']);
  try{git(['merge-base','--is-ancestor',mark.revision,source]);}catch{throw Error('Browserprov kräver ett bygge från denna källhistorik.');}
  if(git(['diff','--name-only',mark.revision,'HEAD','--',...SOURCE_PATHS]))throw Error('Browserprov kräver samma styrda källor som bygget.');
  const response=await fetch(`${baseURL}/api/health/db`,{signal:AbortSignal.timeout(10000)}),body=await response.json();
  return programplanBrowserBuildProof(mark,source,false,true,{...body,ok:response.ok});
}

export async function createProgramplanBrowserFixture() {
  const manifest=await assertTarget('protected');
  if(!manifest.idp?.issuer||!manifest.idp?.clientId)throw Error('Testprofil för sessionsbevis saknas.');
  const db=require('postgres')(manifest.dbUrl,{max:3,prepare:false,connect_timeout:10,onnotice:()=>{}});
  const prefix=randomUUID().slice(0,8),id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const roles={},sessions=new Set(),trigger=`p5_pp_browser_fail_${prefix}`,triggerFn=`p5_pp_browser_fail_fn_${prefix}`;
  let created=false,injected=false;
  const owned=async tx=>{const rows=await tx`select id from public.customers where id=${id(1)} and name=${MARKER}`;if(rows.length!==1)throw Error('Syntetiskt ägarskap kunde inte verifieras.');};
  const clearAuditFailure=async()=>{if(!injected)return;await assertTarget('protected');await owned(db);await db.unsafe(`drop trigger if exists ${trigger} on public.security_events; drop function if exists public.${triggerFn}();`);injected=false;};
  const cleanup=async()=>{
    let failure,evidence=null;
    try{await assertTarget('protected');await clearAuditFailure();if(created){await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;await tx`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`;});evidence=await cleanupProgramplanFixture(db,prefix);const [remaining]=await db`select (select count(*)::int from public.app_sessions where id=any(${[...sessions]}::uuid[])) as "mintedSessions",(select count(*)::int from pg_trigger where tgname=${trigger}) as triggers,(select count(*)::int from pg_proc where proname=${triggerFn}) as functions`;if(Object.values(remaining).some(n=>n!==0))throw Error('fixture_cleanup_remaining');evidence={customers:evidence.customers,sessions:evidence.sessions,plans:evidence.plans,receipts:evidence.receipts,educationEvents:evidence.educationevents,offerings:evidence.offerings,mandates:evidence.mandates,preservedAuditEvents:evidence.preservedauditevents,preservedAuditAnchors:evidence.preservedauditanchors,...remaining};}}
    catch(e){failure=e;}finally{await db.end({timeout:3});}
    if(failure)throw Error('Programplansbrowserfixturens städning misslyckades.');return evidence;
  };
  try {
    const sql=extractProgramplanFixture(readFileSync(path.join(root,'supabase/tests/phase5_programplan_drafts.test.sql'),'utf8'),prefix);
    await db.begin(async tx=>{
      await tx.unsafe(sql);
      for(const row of await tx`select name,id from programplan_roles`)roles[row.name]=row.id;
      await tx`insert into public.school_unit_types(unit_id,school_type) values(${id(30)},'GY'),(${id(31)},'GY')`;
      await tx`update public.identities set display_name='Syntetisk programplansprovperson' where id=any(${[10,11,12,13].map(id)}::uuid[])`;
      await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk SA utan plan','Kulltext utan startdatum','SA25','SABEP')`;
    });created=true;
    const mint=async(identityN,membershipN,assignmentId,mfa=true)=>{
      const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest();
      const [s]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
        values(${hash},${id(identityN)},${id(membershipN)},${assignmentId},${mfa?'2':'1'},${mfa?['pwd','otp']:['pwd']},now(),${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),now()+interval '30 minutes',now()+interval '8 hours') returning id::text,context_epoch::int as epoch`;
      sessions.add(s.id);return {...s,token,identityId:id(identityN),membershipId:id(membershipN),assignmentId};
    };
    const principal=await mint(11,21,roles.principal),second=await mint(12,22,roles.principal2),hm=await mint(10,20,id(60)),noMfa=await mint(11,21,roles.principal,false);
    const snapshot=async(plan=id(50))=>{const [row]=await db`select to_jsonb(p) as plan from public.point_plans p where id=${plan} and organizer_id=${id(2)}`;return row?.plan;};
    const plans=async offering=>db`select id::text,version,revision,status from public.point_plans where offering_id=${offering} and organizer_id=${id(2)} order by version`;
    const history=async plan=>db`select to_jsonb(e) as event from public.point_plan_events e where point_plan_id=${plan} order by created_at,id`;
    const events=async corr=>db`select source,action,outcome,actor_identity_id,membership_id,assignment_id,session_id,customer_id,object_type,object_id,details from public.security_events where correlation_id=${corr}`;
    const paired=async(corr,session,action,objectId=/** @type {string|null} */(id(50)),objectType='programplan')=>{
      const all=await events(corr),rows=all.filter(e=>e.action===action);return (all.length===2||action==='programplan_education_created'&&all.length===4)&&rows.length===2&&['db','worker'].every(source=>rows.some(e=>e.source===source&&e.action===action&&e.outcome==='ok'&&e.actor_identity_id===session.identityId&&e.membership_id===session.membershipId&&e.assignment_id===session.assignmentId&&e.session_id===session.id&&e.customer_id===id(1)&&e.object_type===objectType&&e.object_id===objectId&&Object.keys(e.details).every(k=>['path','accessFunction','proof','sourcePlanId'].includes(k))));
    };
    const request=async(baseURL,session,route,body)=>{const r=await fetch(`${baseURL}${route}`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`sp_session=${session.token}`,'X-Context-Epoch':String(session.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json(),correlationId:r.headers.get('x-correlation-id')};};
    const catalogId=(await snapshot()).catalog_id;
    const basis=(refs=[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100}],startedOn='2026-08-01')=>({catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn,specializationRefs:refs});
    return {principal,second,hm,noMfa,idpOrigin:new URL(manifest.idp.issuer).origin,unitId:id(30),foreignUnitId:id(31),planId:id(50),legacyPlanId:id(51),lockedPlanId:id(52),offeringId:id(40),legacyOfferingId:id(41),lockedOfferingId:id(42),emptyOfferingId:id(46),foreignOfferingId:id(43),customerId:id(1),catalogId,basis,snapshot,plans,history,events,paired,request,cleanup,
      async addProgramTrials(){
        await assertTarget('protected');const specs=trialEducationSpecs.filter(s=>s.program!=='SA25');
        await db.begin(async tx=>{await owned(tx);for(const spec of specs)await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
          values(${id(600+spec.number)},${id(2)},${id(30)},'gymnasium',${spec.name},'Syntetiskt prov 2026',${spec.program},${spec.orientation})`;});
        return specs.map(s=>({...s,id:id(600+s.number)}));
      },
      async newPrincipal(){return mint(11,21,roles.principal);},
      async cookies(context,session,baseURL){await context.addCookies([{name:'sp_session',value:session.token,url:baseURL,httpOnly:true,sameSite:'Lax'}]);},
      async expire(session){await assertTarget('protected');await owned(db);await db`update public.app_sessions set expires_at=now()-interval '1 second' where id=${session.id} and identity_id=${session.identityId}`;},
      async advanceEpoch(session){await assertTarget('protected');await owned(db);await db`update public.app_sessions set context_epoch=context_epoch+1 where id=${session.id} and identity_id=${session.identityId}`;},
      async revokeParent(){await assertTarget('protected');await owned(db);await db`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)} and customer_id=${id(1)}`;},
      async addPages(){await assertTarget('protected');await db.begin(async tx=>{await owned(tx);for(let n=100;n<152;n++)await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(${id(n)},${id(2)},${id(30)},'gymnasium',${`Syntetisk sidutbildning ${n}`},'Syntetiskt prov','SA25','SABEP')`;for(let n=2;n<54;n++)await tx`insert into public.point_plans(id,organizer_id,offering_id,version,specialization,status,decided_on) values(${id(300+n)},${id(2)},${id(40)},${n},array['ENGE3000X'],'ersatt','2026-09-10')`;for(let n=2;n<54;n++)await tx`insert into public.point_plans(id,organizer_id,offering_id,version,specialization,status,decided_on) values(${id(400+n)},${id(2)},${id(41)},${n},array['ENGE3000X'],'ersatt','2026-09-10')`;});},
      async unknownLegacy(){await assertTarget('protected');await owned(db);await db`update public.point_plans set specialization=array['SYNTETISK_OKAND','ENGE3000X','ENGE3000X'] where id=${id(51)} and organizer_id=${id(2)}`;},
      async emptyOfferings(){await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx`delete from public.point_plan_events where point_plan_id in(select id from public.point_plans where organizer_id=${id(2)})`;await tx`delete from public.point_plans where organizer_id=${id(2)}`;await tx`delete from public.offerings where organizer_id=${id(2)}`;});},
      async seedBoundLocked(){await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;await tx`update public.point_plans set status='faststalld',decided_on='2026-09-10' where id=${id(50)} and organizer_id=${id(2)}`;});},
      async auditFailure(source='worker',action='programplan_specialization_changed'){
        if(!['worker','db'].includes(source)||!['programplan_specialization_changed','programplan_draft_created','programplan_basis_bound','programplan_draft_cloned','programplan_education_created'].includes(action))throw Error('Ogiltig provkälla/åtgärd.');
        await assertTarget('protected');await owned(db);await db.begin(async tx=>tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin if new.customer_id='${id(1)}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='ok' then raise exception 'Synthetic browser audit failure' using errcode='P0001'; end if; return new; end $$; create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`));injected=true;
      },clearAuditFailure};
  }catch(error){await cleanup();const code=typeof error?.code==='string'&&/^[A-Z0-9]{5}$/u.test(error.code)?error.code:'unknown';throw Error(`Programplansbrowserfixturen kunde inte förberedas (SQLSTATE ${code}).`);}
}
