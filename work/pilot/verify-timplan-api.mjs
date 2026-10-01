#!/usr/bin/env node
// 05-04: byggd protected-Worker, verklig PostgreSQL och egen syntetisk kund.
// Sessioner mintas lokalt med testrealmens bevisprofil. Ingen interaktiv IdP-
// inloggning eller verklig kommunanslutning påstås. Inga privata värden skrivs ut.
// --preflight öppnar två entrypoints (eller med --selection bara den nya listan)
// tillfälligt och återställer deras
// ursprungliga Worker-grants i finally. Hjälpfunktionerna öppnas aldrig.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const RESULTS = path.join(root, 'work/pilot/results');
const ENTRYPOINTS = ['public.phase5_read_timplan(uuid)', 'public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)'];
const SELECTION_ENTRYPOINT = 'public.phase5_list_timplans(integer)';
const PROGRAMPLAN_ENTRYPOINTS = ['public.phase5_read_programplan(uuid)','public.phase5_bind_programplan_draft(uuid,integer,jsonb)','public.phase5_replace_programplan_specialization(uuid,integer,jsonb)','public.phase5_create_programplan_draft(uuid,integer,jsonb)','public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)'];
export function validWorkerFunctions(actual, entries, programplan=false) {const expected=[...entries,...(programplan?PROGRAMPLAN_ENTRYPOINTS:[])];return actual.length===expected.length&&new Set(actual).size===expected.length&&actual.every(f=>expected.includes(f));}
const HELPERS = ['public.phase5_timplan_scope(uuid,boolean)', 'public.phase5_timplan_audit(uuid,text)'];
const MARKER = 'Syntetiskt 05-04 API-prov';
export const REQUIRED_CASES = ['worker-role','principal-read','hm-read','principal-write-reload','revision-conflict','concurrent-write','hm-write-denied','admin-denied','other-school','other-customer','missing-object','no-mfa','csrf','stale-context','parent-revoked','session-expired','session-revoked','membership-blocked','customer-closed','no-session','invalid-input','decided-plan','gymnasium-write','denied-audit-failure','db-audit-read-failure','db-audit-write-failure','worker-audit-write-failure','client-sql-denied','persistent-audit'];
export const REQUIRED_SELECTION_CASES = [...REQUIRED_CASES,'selection-hm','selection-principal','selection-role-denied','selection-revoked','selection-pagination','selection-empty','selection-strict-input','selection-db-audit-failure','selection-worker-audit-failure','selection-metadata'];
export function overallStatus(cases, required = REQUIRED_CASES) {
  if (cases.length !== required.length || new Set(cases.map(c => c.name)).size !== required.length) return 'FAIL';
  return required.every(name => {
    const c = cases.find(item => item.name === name);
    return c?.status === 'PASS' && c.checks.length > 0 && c.checks.every(check => check.ok === true) && ['response','persistent'].every(kind => c.checks.some(check => check.kind === kind));
  }) ? 'PASS' : 'FAIL';
}
export function parseArgs(argv) {
  const o = { target: null, out: null, port: 3054, preflight: false, selection: false, programplan: false };
  for (let i=0; i<argv.length; i++) {
    const a=argv[i];
    const value=()=>{ if (argv[i+1] === undefined) throw new Error(`${a} saknar värde`); return argv[++i]; };
    if(a==='--target') o.target=value(); else if(a==='--out') o.out=path.resolve(value());
    else if(a==='--port') o.port=Number(value()); else if(a==='--preflight') o.preflight=true; else if(a==='--selection') o.selection=true; else if(a==='--programplan') o.programplan=true;
    else throw new Error(`okänt argument ${a}`);
  }
  if(o.target!=='protected') throw new Error('--target protected krävs');
  if(!o.out || !(path.dirname(o.out)===RESULTS || [os.tmpdir(),'/tmp','/private/tmp'].some(dir => o.out.startsWith(`${dir}/`)))) throw new Error('--out måste ligga i resultatkatalogen eller tmp');
  if(!Number.isInteger(o.port)||o.port<1024||o.port>65535) throw new Error('ogiltig port');
  return o;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
async function main() {
  let o;
  try { o=parseArgs(process.argv.slice(2)); } catch(e) { console.error(`REFUSED: ${e.message}`); process.exit(1); }
  const required=o.selection?REQUIRED_SELECTION_CASES:REQUIRED_CASES;
  const activeEntries=o.selection?[...ENTRYPOINTS,SELECTION_ENTRYPOINT]:ENTRYPOINTS;
  const temporaryEntries=o.selection?[SELECTION_ENTRYPOINT]:ENTRYPOINTS;
  const prefix=crypto.randomUUID().slice(0,8), id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const trigger=`p5_api_fail_${prefix}`, triggerFn=`p5_api_fail_fn_${prefix}`;
  let db, server, created=false, grants=null, triggerCreated=false, serverErrors='', exitCode=1, legacyAssignmentIds=[], aclTouched=false;
  const cases=[], sessions=new Set(), allowed=[], denied=[], failedAudits=[], calls=[];
  let currentCase=null;
  const startedAt=new Date().toISOString();
  const revision=()=>{ try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;} };
  const check=(checks,kind,name,ok)=>checks.push({kind, name, ok:Boolean(ok)});
  const run=async(name,fn)=>{
    const checks=[]; currentCase=name;
    try { await fn(checks); } catch { check(checks,'response','fall kunde köras',false); }
    const status=checks.length&&checks.every(c=>c.ok)&&['response','persistent'].every(kind=>checks.some(c=>c.kind===kind))?'PASS':'FAIL';
    cases.push({name,status,checks}); console.log(`${status} ${name} (${checks.filter(c=>c.ok).length}/${checks.length})`);
  };
  const baseUrl=`http://127.0.0.1:${o.port}`;
  let mark;
  try {
    const manifest=await assertTarget('protected');
    if(!manifest.idp?.issuer || !manifest.idp?.clientId) throw new Error('BLOCKED: testrealmens bevisprofil saknas');
    try { mark=JSON.parse(fs.readFileSync(path.join(web,'dist-protected/build-mode.json'),'utf8')); }catch{}
    if(mark?.mode!=='protected'||!mark.revision) throw new Error('BLOCKED: protected-bygge saknas');
    const sourcePaths=['web/lib/server/db.ts','web/lib/server/timplan-planning.ts','web/lib/server/audit-details.ts','web/app/api/timplaner/lista/route.ts','web/app/api/timplaner/lasa/route.ts','web/app/api/timplaner/cell/route.ts'];
    const dirty=execFileSync('git',['status','--porcelain','--',...sourcePaths],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(dirty)throw new Error('BLOCKED: timplansserverns ändringar måste versionshanteras före verifierat bygge');
    const sourceCommit=execFileSync('git',['log','-1','--format=%H','--',...sourcePaths],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    try{execFileSync('git',['merge-base','--is-ancestor',sourceCommit,mark.revision],{cwd:root,stdio:'ignore'});}catch{throw new Error('BLOCKED: protected-bygget är äldre än timplansservern');}
    const postgres=createRequire(path.join(web,'package.json'))('postgres');
    db=postgres(manifest.dbUrl,{max:4,prepare:false,connect_timeout:10,onnotice:()=>{}});
    const acl=async()=>db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' as f,has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') as granted,p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;
    grants=await acl();
    if(grants.some(r=>HELPERS.includes(r.f)&&r.granted)) throw new Error('REFUSED: Worker får redan köra en intern hjälpfunktion');
    if(o.preflight) {
      if(o.selection&&grants.some(r=>ENTRYPOINTS.includes(r.f)&&!r.granted))throw new Error('REFUSED: befintlig timplans-API måste vara öppen före listpreflight');
      if(grants.some(r=>temporaryEntries.includes(r.f)&&r.granted))throw new Error('REFUSED: preflight kräver stängda Worker-entrypoints');
      await assertTarget('protected');
      aclTouched=true;
      for(const f of temporaryEntries) await db.unsafe(`grant execute on function ${f} to skolplattform_worker`);
    } else if(grants.some(r=>activeEntries.includes(r.f)&&!r.granted)) throw new Error('BLOCKED: Worker-entrypoints saknar permanent grant');
    const src=fs.readFileSync(path.join(root,'supabase/tests/phase5_timplan.test.sql'),'utf8');
    const start=src.indexOf('-- Planning fixture:'), end=src.indexOf('-- End planning fixture.');
    if(start<0||end<=start) throw new Error('REFUSED: avgränsad planning-fixtur saknas');
    const code=String(parseInt(prefix.slice(0,5),16)).padStart(6,'0').slice(-6);
    const fixture=src.slice(start,end).replaceAll('55003000',prefix).replaceAll('Syntetiskt timplansprov',MARKER).replaceAll('planning.example.test',`${prefix}.timplan-api.example.test`).replaceAll('55003030',`${code}30`).replaceAll('55003031',`${code}31`);
    const roles={};
    await db.begin(async tx=>{
      await tx.unsafe(fixture);
      await tx.unsafe(`select pg_temp.planning_actor('${id(60)}','${id(20)}','${id(10)}');
        insert into planning_roles values('outside',public.phase3_grant_mandate(jsonb_build_object('membershipId','${id(24)}'::uuid,'function','rektor','scopeKind','school','unitIds',jsonb_build_array('${id(31)}'::uuid))));
        insert into public.customers(id,name) values('${id(101)}','${MARKER}');
        insert into public.organizers(id,customer_id,name,type) values('${id(102)}','${id(101)}','Syntetisk huvudman','Kommun');
        insert into public.school_units(id,organizer_id,code,name,municipality_code) values('${id(130)}','${id(102)}','${code}99','Syntetisk skola','0000');
        insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values('${id(140)}','${id(102)}','${id(130)}','grundskola','Syntetisk utbildning','Synthetic');
        insert into public.timplans(id,organizer_id,offering_id,version) values('${id(150)}','${id(102)}','${id(140)}',1);`);
      for(const row of await tx`select name,id from planning_roles`) roles[row.name]=row.id;
      legacyAssignmentIds=(await tx`select id from public.assignments where organizer_id=any(${[id(2),id(102)]}::uuid[])`).map(row=>row.id);
    });
    created=true;
    const mint=async(identityN,membershipN,assignmentId,mfa=true)=>{
      const token=crypto.randomBytes(32).toString('base64url'), hash=crypto.createHash('sha256').update(token).digest();
      const [s]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
        values(${hash},${id(identityN)},${id(membershipN)},${assignmentId},${mfa?'2':'1'},${mfa?['pwd','otp']:['pwd']},now(),${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),now()+interval '15 minutes',now()+interval '8 hours') returning id::text,context_epoch::int as epoch`;
      sessions.add(s.id);const [assignment]=await db`select function from public.access_assignments where id=${assignmentId}`;return {token,...s,identityId:id(identityN),membershipId:id(membershipN),assignmentId,accessFunction:assignment.function};
    };
    const principal=await mint(11,21,roles.principal), second=await mint(12,22,roles.principal2), hm=await mint(10,20,id(60),false), admin=await mint(13,23,roles.admin), outside=await mint(14,24,roles.outside), noMfa=await mint(11,21,roles.principal,false);
    const planId=id(50);
    const snapshot=async()=>{
      const [r]=await db`select revision,(select hours from public.timplan_cells where timplan_id=${planId} and row_id='matematik') as hours from public.timplans where id=${planId}`;
      return r;
    };
    const allPlans=async()=>db`select t.id,t.revision,t.status,t.version,t.decided_on,coalesce((select jsonb_object_agg(c.row_id,to_jsonb(c.hours)) from public.timplan_cells c where c.timplan_id=t.id),'{}') as cells from public.timplans t where t.organizer_id=any(${[id(2),id(102)]}::uuid[]) order by t.id`;
    const events=async r=>r.corr?db`select source,action,outcome,actor_identity_id,membership_id,assignment_id,customer_id,session_id,object_type,object_id,details from public.security_events where correlation_id=${r.corr}::uuid`:[];
    const call=async(s,route,body,extra={})=>{
      const headers={'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...(s?{Cookie:`sp_session=${s.token}`,'X-Context-Epoch':String(s.epoch)}:{}),...extra};
      const r=await fetch(`${baseUrl}${route}`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const text=await r.text(); let parsed;try{parsed=JSON.parse(text);}catch{}
      calls.push({caseId:currentCase,status:r.status,code:typeof parsed?.code==='string'&&/^[a-z_]{1,40}$/u.test(parsed.code)?parsed.code:null,hasCorrelation:Boolean(r.headers.get('x-correlation-id'))});
      // CSRF och ogiltig session stoppas före ctx. Vid blockering/stängning eller
      // ogiltig givarkedja finns sessions-ID:n i ctx-hinten, medan RLS döljer
      // accessFunction innan withSessionContext hunnit skapa en levande kontext.
      return{status:r.status,body:parsed,text,corr:r.headers.get('x-correlation-id'),cache:r.headers.get('cache-control'),epoch:r.headers.get('x-context-epoch'),auditAction:route==='/api/timplaner/cell'?'timplan_cell_changed':route==='/api/timplaner/lista'?'timplan_list_read':'timplan_read',auditSession:['csrf','session-expired','session-revoked','no-session'].includes(currentCase)?null:s,auditFunction:['parent-revoked','membership-blocked','customer-closed','selection-revoked'].includes(currentCase)?null:s?.accessFunction};
    };
    const selectPlans=(s=principal,extra={})=>call(s,'/api/timplaner/lista',{page:1},extra);
    const read=(s=principal,p=planId)=>call(s,'/api/timplaner/lasa',{planId:p});
    const change=async(s=principal,hours=210,revision=null,p=planId,extra={})=>call(s,'/api/timplaner/cell',{planId:p,expectedRevision:revision??(await snapshot()).revision,rowId:'matematik',columnIndex:1,hours},extra);
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const paired=async(r,s,action)=>{
      const list=await events(r);
      return list.length===2&&['db','worker'].every(source=>list.some(e=>e.source===source&&e.action===action&&e.outcome==='ok'&&e.actor_identity_id===s.identityId&&e.membership_id===s.membershipId&&e.assignment_id===s.assignmentId&&e.customer_id===id(1)&&e.session_id===s.id&&e.object_type===(action==='timplan_list_read'?'timplan_collection':'timplan')&&e.object_id===(action==='timplan_list_read'?null:r.body?.id)));
    };
    const errorContract=r=>r.body&&typeof r.body==='object'&&!Array.isArray(r.body)&&Object.keys(r.body).length===2&&Object.hasOwn(r.body,'code')&&Object.hasOwn(r.body,'correlationId')&&typeof r.body.code==='string'&&/^[a-z_]{1,40}$/u.test(r.body.code)&&typeof r.corr==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(r.corr)&&r.body.correlationId===r.corr&&/no-store/u.test(r.cache||'');
    const exactDenial=async(r,source)=>{
      if(!source)source=await events(r);const s=r.auditSession;
      return source.length===1&&source.every(e=>e.source==='worker'&&e.action===r.auditAction&&e.outcome==='denied'&&e.session_id===(s?.id??null)&&e.actor_identity_id===(s?.identityId??null)&&e.membership_id===(s?.membershipId??null)&&e.assignment_id===(s?.assignmentId??null)&&e.customer_id===(s?id(1):null)&&e.object_type===null&&e.object_id===null&&e.details?.code===r.body?.code&&e.details?.path==='/api/timplaner'&&Object.keys(e.details).every(key=>['code','path','accessFunction','proof'].includes(key))&&(s&&r.auditFunction?e.details.accessFunction===r.auditFunction:!('accessFunction'in e.details)));
    };
    const denial=async(checks,fn,status,code)=>{
      const before=await allPlans(), r=await fn(); denied.push(r);
      check(checks,'response','nekad utan planinnehåll',r.status===status&&(!code||r.body?.code===code)&&errorContract(r));
      const list=await events(r);
      check(checks,'persistent','ingen ändring och beständig nekandelogg',same(before,await allPlans())&&await exactDenial(r,list));
    };
    const health=async()=>{try{const r=await fetch(`${baseUrl}/api/health/db`,{signal:AbortSignal.timeout(2000)});const b=await r.json();return r.ok&&b.role==='skolplattform_worker';}catch{return false;}};
    // Refuse any listener, including an unrelated service on our dedicated port.
    try { const r=await fetch(baseUrl,{signal:AbortSignal.timeout(1000)}); await r.body?.cancel(); throw new Error('BLOCKED: provporten är upptagen'); } catch(e) { if(e.message?.startsWith('BLOCKED:')) throw e; }
    server=spawn(process.execPath,['scripts/run-mode.mjs','preview','--mode','protected','--port',String(o.port)],{cwd:web,env:process.env,stdio:['ignore','pipe','pipe']});
    for(const stream of [server.stdout,server.stderr]) stream.on('data',chunk=>{serverErrors=`${serverErrors}${chunk}`.slice(-40000);});
    let up=false;
    for(const deadline=Date.now()+90000;Date.now()<deadline&&server.exitCode===null;){if(await health()){up=true;break;}await new Promise(r=>setTimeout(r,500));}
    if(!up) throw new Error('BLOCKED: protected-Worker startade inte');
    await run('worker-role',async checks=>{
      check(checks,'response','byggd protected-Worker med databasroll',await health());
      const a=await acl();
      const [all]=await db`select count(*)::int as n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE')`;
      check(checks,'persistent','exakt avgränsad Worker-EXECUTE-mängd',all.n===activeEntries.length+(o.programplan?5:0)&&validWorkerFunctions(a.filter(r=>r.granted).map(r=>r.f),activeEntries,o.programplan)&&a.filter(r=>HELPERS.includes(r.f)).every(r=>!r.granted));
    });
    for(const [name,s] of [['principal-read',principal],['hm-read',hm]]) await run(name,async checks=>{
      const r=await read(s); allowed.push({r,s,action:'timplan_read'});
      const snap=await snapshot();
      check(checks,'response','giltig skolas plan med revision och cacheförbud',r.status===200&&r.body?.id===planId&&r.body?.revision===snap.revision&&same(r.body?.cells?.matematik,snap.hours)&&/no-store/u.test(r.cache||''));
      check(checks,'persistent','DB och Worker loggar faktisk session',await paired(r,s,'timplan_read'));
    });
    await run('principal-write-reload',async checks=>{
      const before=await snapshot(),r=await change(principal,220);allowed.push({r,s:principal,action:'timplan_cell_changed'});
      const reload=await read(principal);allowed.push({r:reload,s:principal,action:'timplan_read'});
      check(checks,'response','ändring och omläsning lämnar samma revision',r.status===200&&r.body?.revision===before.revision+1&&r.body?.hours?.[1]===220&&reload.status===200&&reload.body?.revision===r.body.revision&&reload.body?.cells?.matematik?.[1]===220);
      const after=await snapshot();
      check(checks,'persistent','bara vald cell ändras och båda auditkällorna finns',after.revision===before.revision+1&&after.hours[0]===before.hours[0]&&after.hours[2]===before.hours[2]&&after.hours[1]===220&&await paired(r,principal,'timplan_cell_changed'));
    });
    await run('revision-conflict',checks=>denial(checks,()=>change(principal,999,0),409,'conflict'));
    await run('concurrent-write',async checks=>{
      const before=await snapshot(),rs=await Promise.all([change(principal,230,before.revision),change(second,240,before.revision)]);
      const winner=rs.find(r=>r.status===200),loser=rs.find(r=>r.status===409);
      if(winner)allowed.push({r:winner,s:rs[0]===winner?principal:second,action:'timplan_cell_changed'});if(loser)denied.push(loser);
      check(checks,'response','en vinnare och en revisionskonflikt',Boolean(winner)&&loser?.body?.code==='conflict'&&errorContract(loser));
      const after=await snapshot(),loserLog=loser?await events(loser):[];
      check(checks,'persistent','en revision sparad utan förlorarens ok-logg',after.revision===before.revision+1&&after.hours[1]===winner?.body?.hours?.[1]&&await exactDenial(loser,loserLog));
      const reload=await read(second);allowed.push({r:reload,s:second,action:'timplan_read'});
      const retry=await change(second,250,reload.body?.revision);allowed.push({r:retry,s:second,action:'timplan_cell_changed'});
      check(checks,'response','omläsning och färskt omförsök lyckas',reload.status===200&&reload.body?.revision===after.revision&&retry.status===200&&retry.body?.revision===after.revision+1);
      check(checks,'persistent','färskt omförsök sparat med korrekt sessionsaudit',(await snapshot()).hours[1]===250&&await paired(retry,second,'timplan_cell_changed'));
    });
    await run('hm-write-denied',checks=>denial(checks,()=>change(hm),403,'forbidden'));
    await run('admin-denied',async checks=>{await denial(checks,()=>read(admin),403,'forbidden');await denial(checks,()=>change(admin),403,'forbidden');});
    await run('other-school',async checks=>{await denial(checks,()=>read(outside),403,'forbidden');await denial(checks,()=>change(outside),403,'forbidden');});
    await run('other-customer',async checks=>{await denial(checks,()=>read(principal,id(150)),403,'forbidden');await denial(checks,()=>change(principal,210,0,id(150)),403,'forbidden');});
    await run('missing-object',checks=>denial(checks,()=>read(principal,id(999)),403,'forbidden'));
    await run('no-mfa',async checks=>{
      await denial(checks,()=>change(noMfa),403,'mfa_required');
      const r=await read(noMfa);allowed.push({r,s:noMfa,action:'timplan_read'});
      check(checks,'response','rektor kan läsa utan MFA',r.status===200);check(checks,'persistent','läsning utan MFA loggas',await paired(r,noMfa,'timplan_read'));
      if(o.selection){const l=await selectPlans(noMfa);allowed.push({r:l,s:noMfa,action:'timplan_list_read'});check(checks,'response','lista kräver inte MFA',l.status===200);check(checks,'persistent','lista utan MFA är auditerad',await paired(l,noMfa,'timplan_list_read'));}
    });
    await run('csrf',checks=>denial(checks,()=>change(principal,210,null,planId,{'Sec-Fetch-Site':'cross-site',Origin:'https://untrusted.example.test'}),403,'csrf'));
    await run('stale-context',async checks=>{await denial(checks,()=>read({...principal,epoch:principal.epoch+1}),409,'context_changed');if(o.selection)await denial(checks,()=>selectPlans({...principal,epoch:principal.epoch+1}),409,'context_changed');});
    await run('parent-revoked',async checks=>{
      await db`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`;
      try{await denial(checks,()=>read(principal),403);await denial(checks,()=>change(principal),403);}finally{await db`update public.access_assignments set ended_at=null where id=${id(60)}`;}
    });
    await run('session-expired',async checks=>{
      const expired=await mint(11,21,roles.principal);
      await db`update public.app_sessions set expires_at=now()-interval '1 second' where id=${expired.id}`;
      await denial(checks,()=>read(expired),401,'session_expired');if(o.selection)await denial(checks,()=>selectPlans(expired),401,'session_expired');await denial(checks,()=>change(expired),401,'session_expired');
    });
    await run('session-revoked',async checks=>{
      const revoked=await mint(11,21,roles.principal);
      await db`update public.app_sessions set revoked_at=clock_timestamp() where id=${revoked.id}`;
      await denial(checks,()=>read(revoked),401,'session_revoked');if(o.selection)await denial(checks,()=>selectPlans(revoked),401,'session_revoked');await denial(checks,()=>change(revoked),401,'session_revoked');
    });
    await run('membership-blocked',async checks=>{
      await db`update public.memberships set status='blocked',blocked_at=clock_timestamp() where id=${id(21)}`;
      try{await denial(checks,()=>read(principal),403,'membership_blocked');if(o.selection)await denial(checks,()=>selectPlans(),403,'membership_blocked');await denial(checks,()=>change(principal),403,'membership_blocked');}finally{await db`update public.memberships set status='active',blocked_at=null where id=${id(21)}`;}
    });
    await run('customer-closed',async checks=>{
      await db`update public.customers set closed_at=clock_timestamp() where id=${id(1)}`;
      try{await denial(checks,()=>read(principal),403,'customer_closed');if(o.selection)await denial(checks,()=>selectPlans(),403,'customer_closed');await denial(checks,()=>change(principal),403,'customer_closed');}finally{await db`update public.customers set closed_at=null where id=${id(1)}`;}
    });
    await run('no-session',async checks=>{await denial(checks,()=>read(null),401,'no_session');if(o.selection)await denial(checks,()=>selectPlans(null),401,'no_session');await denial(checks,()=>change(null),401,'no_session');});
    await run('invalid-input',async checks=>{
      const rev=(await snapshot()).revision;
      for(const body of [{planId,unexpected:true},{planId:'invalid'},'{', {planId,expectedRevision:rev,rowId:'matematik',columnIndex:1,hours:'200'}, {planId,expectedRevision:rev,rowId:'forged',columnIndex:1,hours:200},{planId,expectedRevision:rev,rowId:'matematik',columnIndex:99,hours:200},{planId,expectedRevision:rev,rowId:'matematik',columnIndex:1,hours:2001}])
        await denial(checks,()=>call(principal,typeof body==='object'&&'expectedRevision'in body?'/api/timplaner/cell':'/api/timplaner/lasa',body),400,'bad_request');
    });
    await run('decided-plan',checks=>denial(checks,()=>change(principal,210,0,id(54)),403,'forbidden'));
    await run('gymnasium-write',checks=>denial(checks,()=>call(principal,'/api/timplaner/cell',{planId:id(52),expectedRevision:0,rowId:'MATE1000X',columnIndex:0,hours:100}),403,'forbidden'));
    const injectAudit=async(source,operation,fn,outcome='ok')=>{
      await assertTarget('protected');
      // Unique marker-bounded trigger only rejects this run's own customer/action.
      await db.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin
        if new.customer_id='${id(1)}'::uuid and new.source='${source}' and new.action='${operation}' and new.outcome='${outcome}' then raise exception 'Synthetic planning audit failure' using errcode='${source==='db'?'P0001':'55000'}'; end if; return new; end $$;
        create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`);
      triggerCreated=true;
      try{return await fn();}finally{await db.unsafe(`drop trigger if exists ${trigger} on public.security_events; drop function if exists public.${triggerFn}();`);triggerCreated=false;}
    };
    await run('denied-audit-failure',async checks=>{
      const before=await snapshot();
      const r=await injectAudit('worker','timplan_cell_changed',()=>change(noMfa), 'denied');failedAudits.push(r);
      check(checks,'response','nekandeloggfel stoppar med audit_unavailable',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));
      check(checks,'persistent','inga data eller ok-händelser trots nekandeloggfel',same(before,await snapshot())&&!(await events(r)).some(e=>e.outcome==='ok'));
    });
    for(const [name,source,operation] of [['db-audit-read-failure','db','timplan_read'],['db-audit-write-failure','db','timplan_cell_changed'],['worker-audit-write-failure','worker','timplan_cell_changed']]) await run(name,async checks=>{
      const before=await snapshot();
      const r=await injectAudit(source,operation,()=>operation==='timplan_read'?read(principal):change(principal,777));failedAudits.push(r);
      check(checks,'response','loggfel lämnar generiskt felsvar utan plan',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));
      check(checks,'persistent','timmar revision och båda ok-loggar rullas tillbaka',same(before,await snapshot())&&!(await events(r)).some(e=>e.outcome==='ok'));
    });
    if(o.selection){
      const list=(s=principal,page=1)=>call(s,'/api/timplaner/lista',{page});
      const remember=(r,s,action='timplan_list_read')=>{allowed.push({r,s,action});return r;};
      const scopedIds=async unit=> (await db`select t.id from public.timplans t join public.offerings o on o.id=t.offering_id where t.organizer_id=${id(2)} and o.kind in ('grundskola','introduktionsprogram') and (${unit}::uuid is null or o.unit_id=${unit}::uuid)`).map(r=>r.id).sort();
      for(const [name,s,unit]of[['selection-hm',hm,null],['selection-principal',principal,id(30)]])await run(name,async checks=>{
        const r=remember(await list(s),s),expected=await scopedIds(unit);
        const keys=['id','offeringId','unitId','schoolName','educationName','cohort','kind','version','revision','status'];
        check(checks,'response','endast uppdragets befintliga GR-/IM-planer och slutet listkontrakt',r.status===200&&Object.keys(r.body||{}).sort().join(',')===['plans','count','page','pageSize'].sort().join(',')&&r.body.page===1&&r.body.pageSize===50&&r.body.count===expected.length&&same(r.body.plans.map(p=>p.id).sort(),expected)&&r.body.plans.every(p=>Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k))&&p.id!==id(150)&&p.id!==id(52))&&/no-store/u.test(r.cache||''));
        check(checks,'persistent','listläsningen har faktisk sessionskoppling i båda källorna',await paired(r,s,'timplan_list_read'));
      });
      await run('selection-role-denied',checks=>denial(checks,()=>list(admin),403,'forbidden'));
      await run('selection-revoked',async checks=>{
        await db`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`;
        try{await denial(checks,()=>list(),403,'assignment_expired');}finally{await db`update public.access_assignments set ended_at=null where id=${id(60)}`;}
      });
      await run('selection-pagination',async checks=>{
        await db`insert into public.timplans(id,organizer_id,offering_id,version,status,decided_on) select gen_random_uuid(),${id(2)}::uuid,${id(40)}::uuid,n,'ersatt',public.app_today() from generate_series(10,69) n`;
        const first=remember(await list(),principal),second=remember(await list(principal,2),principal),empty=remember(await list(principal,100000),principal),expected=await scopedIds(id(30));
        check(checks,'response','50 per sida utan dubblett eller dold trunkering',first.status===200&&second.status===200&&empty.status===200&&first.body.plans.length===50&&first.body.count===expected.length&&second.body.count===expected.length&&second.body.page===2&&same([...first.body.plans,...second.body.plans].map(p=>p.id).sort(),expected)&&empty.body.plans.length===0&&empty.body.count===expected.length);
        check(checks,'persistent','alla sidläsningar har minimerad sessionsaudit',(await Promise.all([first,second,empty].map(r=>paired(r,principal,'timplan_list_read')))).every(Boolean));
      });
      await run('selection-empty',async checks=>{
        await db`update public.offerings set kind='gymnasium',program_code='EK25' where id=${id(41)}`;
        try{const r=remember(await list(outside),outside);check(checks,'response','giltigt tomt skolurval återges uttryckligt',r.status===200&&r.body.count===0&&r.body.plans.length===0);check(checks,'persistent','även tomt urval är obligatoriskt loggat',await paired(r,outside,'timplan_list_read'));}
        finally{await db`update public.offerings set kind='grundskola',program_code=null where id=${id(41)}`;}
      });
      await run('selection-strict-input',async checks=>{
        for(const body of [{},{page:0},{page:'1'},{page:1,customerId:id(101)},'{'])await denial(checks,()=>call(principal,'/api/timplaner/lista',body),400,'bad_request');
      });
      for(const source of['db','worker'])await run(`selection-${source}-audit-failure`,async checks=>{
        const before=await allPlans(),r=await injectAudit(source,'timplan_list_read',()=>list());failedAudits.push(r);
        check(checks,'response','loggfel lämnar endast generiskt felsvar',r.status===500&&r.body?.code==='audit_unavailable'&&errorContract(r));
        check(checks,'persistent','ingen framgångslogg eller dataändring vid loggfel',same(before,await allPlans())&&!(await events(r)).some(e=>e.outcome==='ok'));
      });
      await run('selection-metadata',async checks=>{
        await db`update public.offerings set grades=array[9,1,4]::smallint[] where id=${id(40)}`;
        try{const r=remember(await read(),principal,'timplan_read'),im=remember(await read(principal,id(53)),principal,'timplan_read');
          check(checks,'response','årskursordning och IM-vecka kommer från faktiskt underlag',r.status===200&&same(r.body.education?.grades,[9,1,4])&&r.body.education?.kind==='grundskola'&&r.body.schoolName==='Syntetisk skola 30'&&same(r.body.cells.matematik,(await snapshot()).hours)&&im.status===200&&im.body.education?.kind==='introduktionsprogram'&&same(im.body.education?.grades,[])&&same(im.body.cells['im-ma'],[5]));
          check(checks,'persistent','båda metadata-/celläsningar loggar exakt rätt plan',await paired(r,principal,'timplan_read')&&await paired(im,principal,'timplan_read'));
        }finally{await db`update public.offerings set grades=array[1,4,9]::smallint[] where id=${id(40)}`;}
      });
    }
    await run('client-sql-denied',async checks=>{
      const states=[];
      for(const role of ['anon','authenticated'])for(const f of [...activeEntries,...HELPERS]){
        const args=f===SELECTION_ENTRYPOINT?'1':f===ENTRYPOINTS[0]?`'${planId}'::uuid`:f===ENTRYPOINTS[1]?`'${planId}'::uuid,0,'matematik',1,200`:f===HELPERS[0]?`'${planId}'::uuid,false`:`'${planId}'::uuid,'timplan_read'`;
        let code='ok';try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select ${f.split('(')[0]}(${args})`);});}catch(e){code=e.code;}
        states.push(code);
      }
      check(checks,'response','anon och authenticated får SQL permission denied',states.length===activeEntries.length*2+HELPERS.length*2&&states.every(code=>code==='42501'));
      const publicACL=await db`select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee=0 and a.privilege_type='EXECUTE') as open`;
      const a=await acl();
      check(checks,'persistent','PUBLIC och Worker-hjälpare är stängda',publicACL[0].open===false&&a.filter(r=>HELPERS.includes(r.f)).every(r=>!r.granted));
    });
    await run('persistent-audit',async checks=>{
      check(checks,'response','alla observerade svar har korrelation',allowed.every(({r})=>Boolean(r.corr))&&denied.every(r=>Boolean(r.corr))&&failedAudits.every(r=>Boolean(r.corr)));
      const pairs=await Promise.all(allowed.map(({r,s,action})=>paired(r,s,action)));
      const lists=await Promise.all([...allowed.map(({r})=>r),...denied,...failedAudits].map(events));
      const minimized=lists.flat().every(e=>!('hours'in(e.details||{}))&&!('cells'in(e.details||{}))&&!('rowId'in(e.details||{}))&&!('basis'in(e.details||{}))&&!JSON.stringify(e.details).includes('Syntetisk grund')&&!JSON.stringify(e.details).includes(MARKER));
      const deniedLogs=await Promise.all(denied.map(events));
      const denialsExact=await Promise.all(denied.map((r,i)=>exactDenial(r,deniedLogs[i])));
      check(checks,'persistent','alla tillåtna sessioner har två minimerade händelser',pairs.every(Boolean)&&minimized);
      check(checks,'persistent','alla nekanden loggas och saknar lyckad datahändelse',denialsExact.every(Boolean));
    });
    const status=overallStatus(cases,required);
    const report={kind:'phase5-timplan-api',scope:'local-synthetic-only',proof:'lokalt mintade sessioner med testrealmens bevisprofil; byggd protected-Worker och verklig PostgreSQL; ingen interaktiv IdP-inloggning eller kommunanslutning',startedAt,completedAt:new Date().toISOString(),revision:revision(),workerBuildRevision:mark.revision,preflight:o.preflight,selection:o.selection,programplanProfile:o.programplan,requiredCases:required,complete:cases.length===required.length,status,cases,calls};
    fs.mkdirSync(path.dirname(o.out),{recursive:true});fs.writeFileSync(o.out,`${JSON.stringify(report,null,2)}\n`);
    console.log(`Totalstatus: ${status} (${cases.filter(c=>c.status==='PASS').length}/${required.length})`);exitCode=status==='PASS'?0:1;
  } catch(e) {
    const safe=/^(BLOCKED|REFUSED):/u.test(e.message||'')?e.message.slice(0,200):'FAILED';
    console.error(safe);
    fs.mkdirSync(path.dirname(o.out),{recursive:true});fs.writeFileSync(o.out,`${JSON.stringify({kind:'phase5-timplan-api',status:safe.startsWith('BLOCKED:')?'BLOCKED':'FAIL',startedAt,completedAt:new Date().toISOString(),revision:revision(),complete:false,cases,error:safe},null,2)}\n`);
    exitCode=safe.startsWith('BLOCKED:')?3:1;
  } finally {
    if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,3000);});if(server.exitCode===null)server.kill('SIGKILL');}
    if(exitCode&&serverErrors){const log=path.join(os.tmpdir(),`phase5-api-worker-${process.pid}.log`);try{fs.writeFileSync(log,serverErrors,{mode:0o600});console.error(`Privat Worker-diagnos: ${log}`);}catch{}}
    if(db){
      await (async()=>{
      try{
        await assertTarget('protected');
        if(triggerCreated)await db.unsafe(`drop trigger if exists ${trigger} on public.security_events; drop function if exists public.${triggerFn}();`);
        if(aclTouched&&grants)for(const row of grants.filter(r=>temporaryEntries.includes(r.f)))await db.unsafe(`${row.granted?'grant':'revoke'} execute on function ${row.f} ${row.granted?'to':'from'} skolplattform_worker`);
        if(aclTouched&&grants){
          const restored=await aclForCleanup(db,grants.map(row=>row.f));
          if(!restored.every(row=>grants.find(original=>original.f===row.f)?.granted===row.granted&&grants.find(original=>original.f===row.f)?.acl===row.acl))throw new Error('ACL restore');
        }
        if(sessions.size)await db`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`;
        if(created)await db.begin(async tx=>{
          const owned=await tx`select id from public.customers where id=any(${[id(1),id(101)]}::uuid[]) and name=${MARKER}`;
          if(owned.length!==2)throw new Error('ownership');
          await tx`set local session_replication_role=replica`;
          await tx`delete from public.class_timplans where unit_id in (select id from public.school_units where organizer_id=any(${[id(2),id(102)]}::uuid[]))`;
          await tx`delete from public.timplan_cells where timplan_id in(select id from public.timplans where organizer_id=any(${[id(2),id(102)]}::uuid[]))`;
          await tx`delete from public.timplan_events where timplan_id in(select id from public.timplans where organizer_id=any(${[id(2),id(102)]}::uuid[]))`;
          await tx`delete from public.timplans where organizer_id=any(${[id(2),id(102)]}::uuid[])`;
          await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
          await tx`delete from public.mandate_units where customer_id=${id(1)}`;
          await tx`delete from public.access_assignments where customer_id=${id(1)}`;
          await tx`delete from public.assignment_units where assignment_id=any(${legacyAssignmentIds}::uuid[])`;
          await tx`delete from public.assignments where organizer_id=any(${[id(2),id(102)]}::uuid[])`;
          await tx`delete from public.offerings where organizer_id=any(${[id(2),id(102)]}::uuid[])`;
          await tx`delete from public.school_units where organizer_id=any(${[id(2),id(102)]}::uuid[])`;
          await tx`delete from public.memberships where customer_id=${id(1)}`;
          await tx`delete from public.organizers where id=any(${[id(2),id(102)]}::uuid[])`;
          await tx`delete from public.identities where id=any(${[10,11,12,13,14].map(id)}::uuid[])`;
          await tx`delete from public.customers where id=any(${[id(1),id(101)]}::uuid[])`;
          // Append-only security_events are deliberately preserved.
        });
        const clean=await db`select not exists(select 1 from public.customers where id=any(${[id(1),id(101)]}::uuid[])) and not exists(select 1 from public.app_sessions where id=any(${[...sessions]}::uuid[])) and not exists(select 1 from public.assignments where organizer_id=any(${[id(2),id(102)]}::uuid[])) and not exists(select 1 from public.assignment_units where assignment_id=any(${legacyAssignmentIds}::uuid[])) and not exists(select 1 from public.staff_assignment_bindings where customer_id=${id(1)}) and not exists(select 1 from pg_trigger where tgname=${trigger}) and not exists(select 1 from pg_proc where proname=${triggerFn}) as clean`;
        if(!clean[0].clean)throw new Error('cleanup incomplete');
        try{const report=JSON.parse(fs.readFileSync(o.out,'utf8'));report.cleanup='PASS';report.preflightAclRestored=aclTouched;fs.writeFileSync(o.out,`${JSON.stringify(report,null,2)}\n`);}catch{throw new Error('cleanup report');}
      }catch{console.error('Städning eller ACL-återställning misslyckades');exitCode=1;try{const report=JSON.parse(fs.readFileSync(o.out,'utf8'));report.status='FAIL';report.cleanup='FAIL';fs.writeFileSync(o.out,`${JSON.stringify(report,null,2)}\n`);}catch{}}
      })();
      await db.end({timeout:5});
    }
  }
  process.exit(exitCode);
}

async function aclForCleanup(db,functions){return db`select f,has_function_privilege('skolplattform_worker',f,'EXECUTE') as granted,(select proacl::text from pg_proc where oid=to_regprocedure(f)) as acl from unnest(${functions}::text[]) f`;}
