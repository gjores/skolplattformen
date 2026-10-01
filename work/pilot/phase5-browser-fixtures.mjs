// Egna syntetiska 05-06-fixturer. Lokalt mintade sessionsbevis, ingen IdP-
// inloggning. Säkerhetsloggar är append-only och städas aldrig av detta prov.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTarget } from './verify-target.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'web/package.json'));
const MARKER = 'Syntetiskt 05-06 browserprov';
const SOURCE_PATHS = ['web/app/protected-timplan-workspace.tsx','web/app/timplan-guidance.tsx','web/app/protected-home.tsx',
  'web/app/protected-timplan.css','web/lib/protected-timplan.ts','web/lib/server/timplan-planning.ts',
  'web/app/api/timplaner/lista/route.ts','web/app/api/timplaner/lasa/route.ts','web/app/api/timplaner/cell/route.ts',
  'work/pilot/phase5-browser-fixtures.mjs','web/e2e/phase5-timplan.spec.ts','web/playwright.phase5-timplan.config.ts'];

export async function verifyBrowserTarget(baseURL) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw new Error('Endast lokal browserprovserver tillåts.');
  await assertTarget('protected');
  const mark = JSON.parse(readFileSync(path.join(root,'web/dist-protected/build-mode.json'),'utf8'));
  if (mark.mode !== 'protected' || !mark.revision) throw new Error('Verifierat skyddat bygge saknas.');
  const git = args => execFileSync('git', args, {cwd: root, encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim();
  if (git(['status','--porcelain','--',...SOURCE_PATHS])) throw new Error('Browserprovet kräver versionshanterad UI/serverkod.');
  const source = git(['log','-1','--format=%H','--',...SOURCE_PATHS]);
  try { git(['merge-base','--is-ancestor',source,mark.revision]); }
  catch { throw new Error('Browserprovet kräver ett bygge av aktuell UI/serverkod.'); }
  const response = await fetch(`${baseURL}/api/health/db`, {signal:AbortSignal.timeout(10000)});
  const body = await response.json();
  if (!response.ok || body.role !== 'skolplattform_worker' || body.runtime !== 'workerd') throw new Error('Browserprovets databasroll är inte byggd Worker.');
  return {sourceRevision: source, buildRevision: mark.revision};
}

export async function createTimplanBrowserFixture() {
  const manifest = await assertTarget('protected');
  if (!manifest.idp?.issuer || !manifest.idp?.clientId) throw new Error('Lokalt sessionsbevis saknar testprofil.');
  const postgres = require('postgres');
  const db = postgres(manifest.dbUrl, {max:3, prepare:false, connect_timeout:10, onnotice:()=>{}});
  const prefix = randomUUID().slice(0,8);
  const id = n => `${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const code = String(parseInt(prefix.slice(0,5),16)).padStart(6,'0').slice(-6);
  const trigger = `p5_browser_fail_${prefix}`, triggerFn = `p5_browser_fail_fn_${prefix}`;
  const roles = {}, sessions = new Set();
  let created=false, injected=false, legacyAssignmentIds=[];
  const owned = async tx => {
    const rows=await tx`select id from public.customers where id=${id(1)} and name=${MARKER}`;
    if (rows.length!==1) throw new Error('Browserfixturens ägarskap kunde inte verifieras.');
  };
  const removePlans = async tx => {
    await tx`delete from public.class_timplans where unit_id in(select id from public.school_units where organizer_id=${id(2)})`;
    await tx`delete from public.timplan_cells where timplan_id in(select id from public.timplans where organizer_id=${id(2)})`;
    await tx`delete from public.timplan_events where timplan_id in(select id from public.timplans where organizer_id=${id(2)})`;
    await tx`delete from public.timplans where organizer_id=${id(2)}`;
  };
  const clearAuditFailure = async () => {
    if (!injected) return;
    await assertTarget('protected');
    await owned(db);
    await db.unsafe(`drop trigger if exists ${trigger} on public.security_events; drop function if exists public.${triggerFn}();`);
    injected=false;
  };
  const cleanup = async () => {
    let failed=false,evidence=null;
    try {
      await assertTarget('protected');
      await clearAuditFailure();
      if(created) await db.begin(async tx=>{
        await owned(tx);
        await tx`set local session_replication_role=replica`;
        await tx`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`;
        await removePlans(tx);
        await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
        await tx`delete from public.mandate_units where customer_id=${id(1)}`;
        await tx`delete from public.access_assignments where customer_id=${id(1)}`;
        await tx`delete from public.assignment_units where assignment_id=any(${legacyAssignmentIds}::uuid[])`;
        await tx`delete from public.assignments where organizer_id=${id(2)}`;
        await tx`delete from public.offerings where organizer_id=${id(2)}`;
        await tx`delete from public.school_units where organizer_id=${id(2)}`;
        await tx`delete from public.memberships where customer_id=${id(1)}`;
        await tx`delete from public.organizers where id=${id(2)}`;
        // Retained audit still needs its original synthetic actor identity.
        await tx`delete from public.identities i where i.id=any(${[10,11,12,13,14].map(id)}::uuid[]) and not exists(select 1 from public.security_events e where e.actor_identity_id=i.id)`;
        await tx`delete from public.customers where id=${id(1)}`;
      });
      const [row]=await db`select not exists(select 1 from public.customers where id=${id(1)})
        and not exists(select 1 from public.app_sessions where id=any(${[...sessions]}::uuid[]))
        and not exists(select 1 from public.assignments where organizer_id=${id(2)})
        and not exists(select 1 from public.assignment_units where assignment_id=any(${legacyAssignmentIds}::uuid[]))
        and not exists(select 1 from public.staff_assignment_bindings where customer_id=${id(1)})
        and not exists(select 1 from pg_trigger where tgname=${trigger})
        and not exists(select 1 from pg_proc where proname=${triggerFn})
        and not exists(select 1 from public.access_assignments where customer_id=${id(1)})
        and not exists(select 1 from public.offerings where organizer_id=${id(2)})
        and not exists(select 1 from public.timplans where organizer_id=${id(2)}) as clean,
        (select count(*)::int from public.security_events where customer_id=${id(1)}) as "preservedAuditEvents",
        (select count(*)::int from public.identities i where i.id=any(${[10,11,12,13,14].map(id)}::uuid[]) and exists(select 1 from public.security_events e where e.actor_identity_id=i.id)) as "preservedAuditAnchors"`;
      if(!row.clean) failed=true;else evidence=row;
    } catch { failed=true; }
    await db.end({timeout:3});
    if(failed) throw new Error('Browserfixturens städning misslyckades.');return evidence;
  };
  try {
    const source = readFileSync(path.join(root,'supabase/tests/phase5_timplan.test.sql'),'utf8');
    const start=source.indexOf('-- Planning fixture:'), end=source.indexOf('-- End planning fixture.');
    if(start<0 || end<=start) throw new Error('Avgränsad SQL-provmall saknas.');
    const block=source.slice(start,end);
    if(/\b(?:grant|revoke|truncate|drop)\b/iu.test(block))throw new Error('SQL-provmallen får inte ändra databasrättigheter eller städa globalt.');
    const sql=block.replaceAll('55003000',prefix)
      .replaceAll('Syntetiskt timplansprov',MARKER)
      .replaceAll('planning.example.test',`${prefix}.browser.example.test`)
      .replaceAll('55003030',`${code}30`).replaceAll('55003031',`${code}31`);
    await db.begin(async tx=>{
      await tx.unsafe(sql);
      for(const row of await tx`select name,id from planning_roles`) roles[row.name]=row.id;
      legacyAssignmentIds=(await tx`select id from public.assignments where organizer_id=${id(2)}`).map(r=>r.id);
      await tx`update public.identities set display_name='Syntetisk provperson' where id=any(${[10,11,12,13,14].map(id)}::uuid[])`;
      await tx`update public.offerings set name=case when unit_id=${id(31)} then 'Syntetisk annan grundskola' when kind='introduktionsprogram' then 'Syntetisk IM' when kind='gymnasium' then 'Syntetiskt gymnasium' else 'Syntetisk grundskola' end where organizer_id=${id(2)}`;
      await tx`update public.offerings set grades=array[9,1,4]::smallint[] where id=${id(40)}`;
    });
    created=true;
    const mint=async(identityN,membershipN,assignmentId,mfa=true)=>{
      const token=randomBytes(32).toString('base64url'), hash=createHash('sha256').update(token).digest();
      const [session]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,
        proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
        values(${hash},${id(identityN)},${id(membershipN)},${assignmentId},${mfa?'2':'1'},${mfa?['pwd','otp']:['pwd']},now(),
        ${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),
        now()+interval '30 minutes',now()+interval '8 hours') returning id::text,context_epoch::int as epoch`;
      sessions.add(session.id);
      return {...session,token,identityId:id(identityN),membershipId:id(membershipN),assignmentId};
    };
    const principal=await mint(11,21,roles.principal),second=await mint(12,22,roles.principal2),hm=await mint(10,20,id(60),false),noMfa=await mint(11,21,roles.principal,false);
    const snapshot=async(plan=id(50))=>{
      const [row]=await db`select t.revision,t.status,coalesce((select jsonb_object_agg(c.row_id,to_jsonb(c.hours)) from public.timplan_cells c where c.timplan_id=t.id),'{}') as cells from public.timplans t where t.id=${plan} and t.organizer_id=${id(2)}`;
      return row;
    };
    const events=async correlationId=>db`select source,action,outcome,actor_identity_id,membership_id,assignment_id,session_id,customer_id,object_type,object_id,details from public.security_events where correlation_id=${correlationId}`;
    const paired=async(correlationId,session,action,plan=id(50))=>{
      const rows=await events(correlationId);
      return rows.length===2 && ['db','worker'].every(source=>rows.some(e=>e.source===source && e.action===action && e.outcome==='ok'
        && e.actor_identity_id===session.identityId && e.membership_id===session.membershipId && e.assignment_id===session.assignmentId
        && e.session_id===session.id && e.customer_id===id(1) && e.object_type==='timplan' && e.object_id===plan
        && Object.keys(e.details).every(key=>['path','accessFunction','proof'].includes(key))));
    };
    const request=async(baseURL,session,route,body)=>{
      const response=await fetch(`${baseURL}${route}`, {method:'POST',headers:{'Content-Type':'application/json',Cookie:`sp_session=${session.token}`,
        'X-Context-Epoch':String(session.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      return {status:response.status,body:await response.json(),correlationId:response.headers.get('x-correlation-id')};
    };
    return {principal,second,hm,noMfa,planId:id(50),imPlanId:id(53),lockedPlanId:id(54),customerId:id(1),parentAssignmentId:id(60),snapshot,events,paired,request,cleanup,
      async newPrincipal(){return mint(11,21,roles.principal);},
      async addPrincipalContext(){
        await assertTarget('protected');
        await db.begin(async tx=>{
          await owned(tx);
          await tx`select set_config('app.customer_id',${id(1)},true),set_config('app.assignment_id',${id(60)},true),
            set_config('app.membership_id',${id(20)},true),set_config('app.identity_id',${id(10)},true),set_config('app.correlation_id',${randomUUID()},true)`;
          await tx`select public.phase3_grant_mandate(jsonb_build_object('membershipId',${id(21)}::uuid,'function','rektor','scopeKind','school','unitIds',jsonb_build_array(${id(31)}::uuid)))`;
          legacyAssignmentIds=(await tx`select id from public.assignments where organizer_id=${id(2)}`).map(row=>row.id);
        });
      },
      async cookies(context,session,baseURL){await context.addCookies([{name:'sp_session',value:session.token,url:baseURL,httpOnly:true,sameSite:'Lax'}]);},
      async addPages(){await assertTarget('protected'); await db.begin(async tx=>{await owned(tx);for(let n=3;n<=58;n++)await tx`insert into public.timplans(id,organizer_id,offering_id,version,basis,status,decided_on) values(${id(200+n)},${id(2)},${id(40)},${n},'Syntetisk grund','ersatt',public.app_today())`;});},
      async emptyPlans(){await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await removePlans(tx);});},
      async unknownRow(){await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx`insert into public.timplan_cells values(${id(50)},'syntetisk_okand',array[1,2,3]::smallint[])`;});},
      async expire(session){await assertTarget('protected');await owned(db);await db`update public.app_sessions set expires_at=now()-interval '1 second' where id=${session.id} and identity_id=${session.identityId}`;},
      async advanceEpoch(session){await assertTarget('protected');await owned(db);await db`update public.app_sessions set context_epoch=context_epoch+1 where id=${session.id} and identity_id=${session.identityId}`;},
      async revokeParent(){await assertTarget('protected');await owned(db);await db`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)} and customer_id=${id(1)}`;},
      async auditFailure(source='worker'){
        if(!['worker','db'].includes(source))throw new Error('Ogiltig provkälla.');
        await assertTarget('protected');await owned(db);
        await db.begin(async tx=>tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin
          if new.customer_id='${id(1)}'::uuid and new.source='${source}' and new.action='timplan_cell_changed' and new.outcome='ok' then
            raise exception 'Synthetic browser audit failure' using errcode='P0001'; end if; return new; end $$;
          create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`));
        injected=true;
      },clearAuditFailure};
  } catch(error) {
    await cleanup();
    const code=typeof error?.code==='string' && /^[A-Z0-9]{5}$/u.test(error.code)?error.code:'unknown';
    throw new Error(`Browserfixturen kunde inte förberedas (SQLSTATE ${code}).`);
  }
}
