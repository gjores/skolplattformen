#!/usr/bin/env node
// Actual local Worker + public reference register; writes only an owned synthetic customer.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {assertTarget} from './verify-target.mjs';
import {createProgramplanBrowserFixture} from './phase5-programplan-browser-fixtures.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {parseSchoolRegistryList,parseSchoolRegistryLookupResult,parseSchoolRegistryStatus} from '../../web/lib/school-registry.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const code='19207279',organizationNumber='5563571248';
export const sourcePaths=['web/lib/school-registry.ts','web/lib/server/school-registry.ts','web/lib/server/school-registry-upstream.ts',
 'web/lib/server/skolverket.ts','web/lib/server/authz.ts','web/lib/server/db.ts','web/lib/server/audit-details.ts',
 'web/app/api/skolor/route.ts','web/app/api/skolor/register/route.ts','web/app/api/skolor/register/spara/route.ts','web/app/api/skolor/register/status/route.ts',
 'web/app/protected-school-workspace.tsx','web/app/protected-school-workspace.css','web/app/protected-home.tsx',
 'supabase/migrations/20261014120000_phase5_school_registry.sql','supabase/migrations/20261014121000_phase5_worker_school_registry.sql',
 'work/pilot/verify-school-registry-api.mjs','work/pilot/phase5-programplan-browser-fixtures.mjs','work/pilot/verify-programplan-locks.mjs'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
export function args(values){
 const preflight=values.at(-1)==='--preflight';if(preflight)values=values.slice(0,-1);
 assert.equal(values.length,4);assert.equal(values[0],'--base-url');assert.equal(values[2],'--out');
 const url=new URL(values[1]),out=resolve(values[3]);
 assert.ok(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash);
 assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));return{base:url.origin,out,preflight};
}
export async function run({base,out,preflight=false}){
 const target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const checks=[],ok=name=>checks.push({name,ok:true});
 let f,org,baseline,after,cleanup,failure,unknown=false,beforeFingerprint,afterFingerprint,aclBefore,aclAfter,borrowed=false,trigger,auditIdentityProof;
 const sources=sourceHashes();
 const buildRoot=resolve(process.env.SCHOOL_REGISTRY_BUILD_ROOT??resolve(root,'web/dist-protected'));
 const build=JSON.parse(readFileSync(resolve(buildRoot,'build-mode.json'),'utf8'));assert.equal(build.mode,'protected');
 const git=values=>execFileSync('git',values,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const product=sourcePaths.filter(p=>p.startsWith('web/'));git(['merge-base','--is-ancestor',build.revision,'HEAD']);
 assert.equal(git(['status','--porcelain','--',...product]),'','REFUSED: product must be committed');
 assert.equal(git(['diff','--name-only',build.revision,'HEAD','--',...product]),'','REFUSED: build differs from product');
 const artifact=artifactManifest(buildRoot);
 const request=async(session,path,body,extra={})=>{
  const headers={'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'same-origin',...extra};
  if(session){headers.Cookie=`sp_session=${session.token}`;headers['X-Context-Epoch']=String(session.epoch);}
  try{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45_000)});
   return{status:r.status,body:await r.json(),cache:r.headers.get('cache-control'),corr:r.headers.get('x-correlation-id')};
  }catch{unknown=true;throw Error('HTTP completion unknown; preserve fixture for investigation');}
 };
 const success=async(session,path,body)=>{const r=await request(session,path,body);assert.ok(r.status>=200&&r.status<300,`${path}: HTTP ${r.status} ${r.body.code??''}`);assert.match(r.cache??'',/no-store/);return r.body;};
 const list=async()=>parseSchoolRegistryList(await success(f.hm,'/api/skolor'));
 const lookup=async()=>parseSchoolRegistryLookupResult(await success(f.hm,'/api/skolor/register',{kind:'code',value:code}));
 const command=p=>({commandId:randomUUID(),code,operation:p.local?'update':'import',expectedRevision:p.local?.revision??null,registryFingerprint:p.unit.registryFingerprint});
 const save=async q=>parseSchoolRegistryStatus(await success(f.hm,'/api/skolor/register/spara',q),q);
 const localProtected=async()=>decisionBusinessHashes(db,['access_assignments','mandate_units','assignments','assignment_units','staff_assignment_bindings','offerings','point_plans','timplans','class_timplans','pupil_placements']);
 const acl=()=>db`select oid::regprocedure::text signature,proacl::text acl,has_function_privilege('skolplattform_worker',oid,'EXECUTE') allowed from pg_proc where pronamespace='public'::regnamespace and proname in ('phase5_school_registry_list','phase5_school_registry_save') order by 1`;
 try{
  const health=await fetch(base+'/api/health/db').then(r=>r.json());assert.ok(health.ok&&health.role==='skolplattform_worker'&&health.runtime==='workerd');
  const tables=(await db`select tablename from pg_tables where schemaname='public' and tablename not in ('security_events','identities','app_sessions') order by tablename`).map(r=>r.tablename);
  baseline=await decisionBusinessHashes(db,tables);
  beforeFingerprint=await vocationalDatabaseFingerprint(db);aclBefore=await acl();assert.equal(aclBefore.length,2);
  if(preflight){assert.ok(aclBefore.every(r=>!r.allowed));await db.unsafe('grant execute on function public.phase5_school_registry_list(),public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean) to skolplattform_worker');borrowed=true;}
  else assert.ok(aclBefore.every(r=>r.allowed));
  // Original audit and identity rows must survive byte-for-byte. Historical missing anchors are measured, not fabricated.
  await db`create temporary table registry_old_audit as select id,md5(to_jsonb(e)::text) hash from public.security_events e`;
  await db`create temporary table registry_old_identities as select id,md5(to_jsonb(i)::text) hash from public.identities i`;
  await db`create temporary table registry_old_sessions as select id,md5(to_jsonb(s)::text) hash from public.app_sessions s`;
  assert.equal((await db`select count(*)::int n from public.organizers where organization_number=${organizationNumber}`)[0].n,0,'REFUSED: reference organizer already exists');
  f=await createProgramplanBrowserFixture();org=f.customerId.slice(0,8)+'-0000-4000-8000-000000000002';
  assert.equal((await db`update public.organizers set organization_number=${organizationNumber} where id=${org} and customer_id=${f.customerId} returning id`).length,1);
  assert.equal((await request(null,'/api/skolor')).status,401);ok('anonymous list denied');
  assert.equal((await request(f.principal,'/api/skolor')).status,403);ok('principal cannot operate school registry');
  const first=await list();assert.equal(first.organizer.organizationNumber,organizationNumber);assert.ok(first.units.length>0);ok('live HM scoped list');
  const organization=parseSchoolRegistryLookupResult(await success(f.hm,'/api/skolor/register',{kind:'organizationNumber',value:organizationNumber}));
  assert.equal(organization.kind,'organizationNumber');assert.ok(organization.units.some(u=>u.code===code));ok('actual public organizer lookup');
  const preview=await lookup();assert.equal(preview.kind,'code');assert.equal(preview.local,null);assert.equal(preview.unit.organizationNumber,organizationNumber);ok('actual public school preview');
  const q=command(preview);
  assert.equal((await request(f.hmNoMfa,'/api/skolor/register/spara',q)).status,403);ok('save requires MFA');
  assert.equal((await request(f.hm,'/api/skolor/register/spara',q,{Origin:'https://foreign.invalid'})).status,403);ok('cross-origin save denied');
  const preserved=await localProtected();const race=await Promise.allSettled([save(q),save(q)]);
  for(const result of race)if(result.status==='rejected')throw result.reason;
  const created=race[0].value;assert.equal(created.status,'saved');assert.equal(created.operation,'import');assert.equal(race[1].value.unitId,created.unitId);ok('concurrent identical import creates one school and receipt');
  assert.deepEqual(await localProtected(),preserved);ok('import atomic and no mandate or planning graph expansion');
  const imported=(await list()).units.find(u=>u.id===created.unitId);assert.ok(imported);assert.equal(imported.canUpdate,false);ok('own imported school visible without granting update mandate');
  assert.equal((await save(q)).unitId,created.unitId);ok('same full command replays same school');
  assert.equal(parseSchoolRegistryStatus(await success(f.hm,'/api/skolor/register/status',q),q).status,'saved');ok('saved receipt status');
  const absent={...q,commandId:randomUUID()};assert.equal(parseSchoolRegistryStatus(await success(f.hm,'/api/skolor/register/status',absent),absent).status,'not_found');ok('status does not create');
  assert.equal((await request(f.hm,'/api/skolor/register/status',{...q,registryFingerprint:'0'.repeat(64)})).status,409);ok('receipt content conflict');
  const without=command(await lookup());assert.equal((await request(f.hm,'/api/skolor/register/spara',without)).status,403);ok('update needs school mandate');
  // Explicit test-only mandate setup. Product import did not perform this operation.
  await db`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${f.hm.assignmentId},${f.customerId},${org},${created.unitId})`;
  await db`update public.school_units set pupil_register_source='Syntetiskt lokalt elevregister' where id=${created.unitId} and organizer_id=${org}`;
  const [principal]=await db`select staff_assignment_id id from public.access_assignments where id=${f.principal.assignmentId} and customer_id=${f.customerId}`;
  assert.ok(principal?.id);await db`update public.assignments set name='Syntetisk lokalt utsedd rektor' where id=${principal.id} and organizer_id=${org}`;
  await db`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${f.principal.assignmentId},${f.customerId},${org},${created.unitId})`;
  await db`insert into public.assignment_units(assignment_id,unit_id) values(${principal.id},${created.unitId})`;
  await db`insert into public.school_unit_types(unit_id,school_type,grades,programmes) values(${created.unitId},'GR',array[1,2,3]::smallint[],array[]::text[])`;
  const updatePreview=await lookup(),update=command(updatePreview),protectedBefore=await localProtected();
  assert.ok(updatePreview.local.canUpdate);const updated=await save(update);assert.equal(updated.operation,'update');
  assert.deepEqual(await localProtected(),protectedBefore);
  assert.equal((await db`select pupil_register_source from public.school_units where id=${created.unitId}`)[0].pupil_register_source,'Syntetiskt lokalt elevregister');
  assert.deepEqual(Array.from((await db`select grades from public.school_unit_types where unit_id=${created.unitId} and school_type='GR'`)[0].grades),[1,2,3]);ok('refresh preserves principal mandates local grades and pupil source');
  const stale=command(await lookup());await db`update public.school_units set name='Syntetisk samtidig ändring' where id=${created.unitId} and organizer_id=${org}`;
  assert.equal((await request(f.hm,'/api/skolor/register/spara',stale)).status,409);ok('stale local revision denied');
  const fresh=command(await lookup());assert.equal((await request(f.hm,'/api/skolor/register/spara',{...fresh,registryFingerprint:'0'.repeat(64)})).status,409);ok('changed source preview denied');
  const rollbackBefore=await decisionBusinessHashes(db,['school_units','school_unit_types','registry_snapshots','school_registry_receipts']);
  trigger='registry_api_fail_'+f.customerId.slice(0,8);
  await db.unsafe(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.customer_id='${f.customerId}'::uuid and new.source='worker' and new.action='school_registry_updated' and new.outcome='ok' then raise exception 'Synthetic registry audit failure'; end if; return new; end$$; create trigger ${trigger} before insert on public.security_events for each row execute function public.${trigger}()`);
  const auditFailed=await request(f.hm,'/api/skolor/register/spara',fresh);assert.equal(auditFailed.status,500);assert.equal(auditFailed.body.code,'audit_unavailable');
  assert.deepEqual(await decisionBusinessHashes(db,['school_units','school_unit_types','registry_snapshots','school_registry_receipts']),rollbackBefore);ok('Worker audit failure rolls back complete registry update');
  await db.unsafe(`drop trigger ${trigger} on public.security_events; drop function public.${trigger}()`);trigger=null;
  const {chromium,devices,expect}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
  const browser=await chromium.launch();
  try{for(const mode of ['desktop','phone']){
   const context=await browser.newContext(mode==='phone'?{...devices['iPhone 13'],locale:'sv-SE'}:{viewport:{width:1440,height:1000},locale:'sv-SE'});
   try{await f.cookies(context,f.hm,base);const page=await context.newPage(),errors=[],pending=new Set();page.on('pageerror',e=>errors.push(e.name));
    page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/skolor'))pending.add(r);});page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>{if(pending.has(r)){unknown=true;pending.delete(r);}});
    await page.goto(base+'/?vy=skolor');await expect(page.getByRole('heading',{name:'Dina skolenheter',exact:true})).toBeVisible({timeout:30_000});
    await page.getByLabel('Skolenhetskod (8 siffror)',{exact:true}).fill(code);await page.getByRole('button',{name:'Sök skola',exact:true}).click();
    await expect(page.getByRole('heading',{name:/^Granska /})).toBeVisible({timeout:30_000});
    await expect(page.getByText('Syntetisk lokalt utsedd rektor',{exact:true}).first()).toBeVisible();
    await expect(page.getByText(/Lokala skolformer behålls:/)).toBeVisible();
    await page.screenshot({path:out.replace(/\.json$/,`-${mode}-preview.png`),fullPage:true});
    await page.getByRole('button',{name:'Uppdatera registeruppgifter',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Registeruppgifterna är uppdaterade.'})).toBeVisible({timeout:30_000});
    await page.reload();await expect(page.getByRole('heading',{name:'Dina skolenheter',exact:true})).toBeVisible({timeout:30_000});
    await expect(page.getByText('Syntetisk lokalt utsedd rektor',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);assert.deepEqual(errors,[]);
    await page.screenshot({path:out.replace(/\.json$/,`-${mode}-saved.png`),fullPage:true});
    if(pending.size){unknown=true;throw Error('School browser request still pending');}ok(mode+' actual Worker browser preview refresh reload and preserved local principal');
   }finally{await context.close();}
  }}finally{await browser.close();}
  assert.equal((await request(f.hm,'/api/skolor/register',{kind:'organizationNumber',value:'0000000000'})).status,403);ok('foreign organization lookup denied');
  await f.expire(f.hm);assert.equal((await request(f.hm,'/api/skolor/register/status',q)).status,401);ok('expired session cannot read receipt');
 }catch(error){failure=error.message;}
 finally{
  try{
   if(unknown)throw Error('Cleanup deferred: HTTP completion unknown');
   if(trigger){await db.unsafe(`drop trigger ${trigger} on public.security_events; drop function public.${trigger}()`);trigger=null;}
   if(f){await assertTarget('protected');await db.begin(async tx=>{
    assert.equal((await tx`select id from public.organizers where id=${org} and customer_id=${f.customerId}`).length,1);
    await tx`delete from public.school_registry_receipts where customer_id=${f.customerId}`;
    await tx`delete from public.registry_snapshots where organizer_id=${org}`;
   });cleanup=await f.cleanup();}
   if(baseline){after=await decisionBusinessHashes(db,Object.keys(baseline));assert.deepEqual(after,baseline);ok('all original business rows preserved after cleanup');
    const [a]=await db`select (select count(*)::int from registry_old_audit b left join public.security_events e using(id) where e.id is null or b.hash<>md5(to_jsonb(e)::text)) audit_changes,
     (select count(*)::int from registry_old_identities b left join public.identities i using(id) where i.id is null or b.hash<>md5(to_jsonb(i)::text)) identity_changes,
     (select count(*)::int from public.security_events e left join public.identities i on i.id=e.actor_identity_id where e.actor_identity_id is not null and i.id is null and not exists(select 1 from registry_old_audit b where b.id=e.id)) new_missing_anchors`;
    auditIdentityProof={...a};assert.deepEqual(auditIdentityProof,{audit_changes:0,identity_changes:0,new_missing_anchors:0});
    assert.equal((await db`select count(*)::int n from registry_old_sessions b left join public.app_sessions s using(id) where s.id is null or b.hash<>md5(to_jsonb(s)::text)`)[0].n,0);ok('original audit identities preserved and zero new missing anchors');}
  }catch(error){failure=[failure,error.message].filter(Boolean).join('; ');}
  try{if(borrowed)await db.unsafe('revoke execute on function public.phase5_school_registry_list(),public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean) from skolplattform_worker');
   aclAfter=await acl();if(aclBefore)assert.deepEqual(aclAfter,aclBefore);afterFingerprint=await vocationalDatabaseFingerprint(db);if(beforeFingerprint)assert.equal(afterFingerprint,beforeFingerprint);
   assert.deepEqual(sourceHashes(),sources);
  }catch(error){failure=[failure,error.message].filter(Boolean).join('; ');}
  await db.end();
 }
 const report={status:failure?'FAIL':'PASS',kind:'school-registry-built-worker',scope:'isolated-local-customer-public-reference-register',newOidcLogin:false,preflight,databaseClosed:true,unknownHttp:unknown,cleanupDeferred:unknown,preflightAclRestored:!!aclBefore&&JSON.stringify(aclBefore)===JSON.stringify(aclAfter),baselineFingerprint:beforeFingerprint,finalFingerprint:afterFingerprint,beforeHashes:baseline,afterHashes:after,beforeAcl:aclBefore,afterAcl:aclAfter,auditIdentityProof,buildRoot,build,artifact,sourceHashes:sources,finalSourceHashes:sourceHashes(),checks,cleanup,aclBefore,aclAfter,beforeFingerprint,afterFingerprint,originalRows:baseline?sha(baseline):null,finalRows:after?sha(after):null,failure};
 writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=await run(args(process.argv.slice(2)));console.log(JSON.stringify({status:r.status,checks:r.checks.length,failure:r.failure}));if(r.status!=='PASS')process.exitCode=1;
}
