#!/usr/bin/env node
// Actual built protected Worker, one owned synthetic customer. This tool never
// applies migrations, resets data or touches another customer's graph.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {createGymTimplanFixture} from './phase5-gym-timplan-fixtures.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {vocationalDatabaseFingerprint as databaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {parseProgramplanCopyRequest,parseProgramplanCopyCreated,copyStatusForCommand} from '../../web/lib/programplan-copy.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const COPY_ENTRY='public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)';
const COPY_PATH='/api/programplaner/utbildning/kopiera',STATUS_PATH=COPY_PATH+'/status';
const graphTables=['offerings','offering_units','point_plans','point_plan_events','programplan_education_receipts','organisation_events'];
export const sourcePaths=['work/pilot/verify-programplan-copy-api.mjs','work/pilot/phase5-gym-timplan-fixtures.mjs',
 'work/pilot/phase5-programplan-browser-fixtures.mjs','work/pilot/verify-programplan-locks.mjs',
 'work/pilot/verify-target.mjs','work/pilot/verify-plan-decision-flow.mjs','work/pilot/apply-vocational-plan-decisions.mjs',
 'web/lib/programplan-copy.ts','web/lib/server/programplan-copy.ts','web/lib/programplan-education-contract.ts',
 'web/lib/programplan-catalog.ts','web/lib/programplan-choice-blocks.ts','web/lib/programplan-terms.ts',
 'web/lib/server/programplan-education.ts','web/lib/server/authz.ts','web/lib/server/db.ts',
 'web/lib/server/http.ts','web/lib/server/audit-details.ts','web/lib/mandate-policy.ts',
 'web/app/api/programplaner/utbildning/kopiera/route.ts','web/app/api/programplaner/utbildning/kopiera/status/route.ts',
 'web/app/protected-programplan-workspace.tsx','web/lib/programplan-catalog.generated.json',
 'supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql',
 'supabase/migrations/20261014101000_phase5_worker_atomic_cohort_copy.sql'];
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,sha(readFileSync(resolve(root,p)))]));

export function parseCopyApiArgs(args){
 const options={preflight:false};
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(key==='--preflight'){assert.equal(options.preflight,false,'REFUSED: duplicate preflight');options.preflight=true;}
  else {assert.ok(['--base-url','--out'].includes(key)&&args[i+1]&&!options[key],'REFUSED: invalid arguments');options[key]=args[++i];}
 }
 const url=new URL(options['--base-url']??'http://invalid');
 assert.ok(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'REFUSED: local Worker URL required');
 assert.ok(options['--out'],'REFUSED: private output required');
 const out=resolve(options['--out']);
 assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'),'REFUSED: private JSON report required');
 const parent=realpathSync(resolve(out,'..'));
 assert.ok(parent==='/private/tmp'||parent.startsWith('/private/tmp/'),'REFUSED: output parent must be private tmp');
 return{url:url.origin,out,preflight:options.preflight};
}

export function artifactManifest(buildRoot){
 const entries=[];
 const walk=directory=>{for(const name of readdirSync(directory).sort()){
  if(['.dev.vars','.dev.vars.lock'].includes(name))continue;
  const file=join(directory,name),stat=lstatSync(file);
  assert.equal(stat.isSymbolicLink(),false,'REFUSED: symlink in built artifact');
  if(stat.isDirectory())walk(file);else if(stat.isFile())entries.push({path:relative(buildRoot,file),sha256:sha(readFileSync(file)),bytes:stat.size});
 }};
 walk(buildRoot);return{files:entries,sha256:sha(entries),fileCount:entries.length};
}

async function builtWorkerProof(url){
 const buildRoot=realpathSync(resolve(process.env.PHASE5_BUILD_ROOT??join(root,'web/dist-protected')));
 const runtimeRoot=join(root,'work/pilot/targets/protected/runtime/');
 const privateRuntime=/^\/private\/tmp\/skolplattform-copy-runtime-\d{8}-[A-Za-z0-9_-]+\/web(?:\/dist-protected)?$/u.test(buildRoot);
 assert.ok(buildRoot===join(root,'web/dist-protected')||buildRoot.startsWith(runtimeRoot)||privateRuntime,'REFUSED: owned protected build required');
 const mark=JSON.parse(readFileSync(join(buildRoot,'build-mode.json'),'utf8'));
 assert.ok(mark.mode==='protected'&&/^[a-f0-9]{40}$/u.test(mark.revision??''),'REFUSED: protected revision required');
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const sourceRevision=git(['rev-parse','HEAD']);git(['merge-base','--is-ancestor',mark.revision,sourceRevision]);
 const appPaths=sourcePaths.filter(p=>p.startsWith('web/'));
 assert.equal(git(['status','--porcelain','--',...appPaths]),'','REFUSED: protected product sources must be committed');
 assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...appPaths]),'','REFUSED: protected source must match built revision');
 const response=await fetch(`${url}/api/health/db`,{signal:AbortSignal.timeout(15000)}),health=await response.json();
 assert.ok(response.ok&&health.ok===true&&health.role==='skolplattform_worker'&&health.runtime==='workerd','REFUSED: real protected Worker health required');
 return{sourceRevision,buildRevision:mark.revision,builtAt:mark.builtAt,buildRoot,runtime:'workerd',role:health.role,artifact:artifactManifest(buildRoot)};
}

async function originalAnchors(connection){
 // Keep only UUIDs and per-row digests in a private temporary table. No audit
 // messages, person data, tokens or SQL binding values reach tool output.
 await connection`create temporary table copy_api_old_audit on commit preserve rows as select id,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') hash from public.security_events e`;
 await connection`create temporary table copy_api_old_identity on commit preserve rows as select id,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex') hash from public.identities i`;
 const [counts]=await connection`select (select count(*)::integer from copy_api_old_audit) audit,(select count(*)::integer from copy_api_old_identity) identities`;
 return counts;
}
async function verifyOriginalAnchors(connection){
 const [proof]=await connection`select
  (select count(*)::integer from copy_api_old_audit b left join public.security_events e using(id) where e.id is null or b.hash<>encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) changed_audit,
  (select count(*)::integer from copy_api_old_identity b left join public.identities i using(id) where i.id is null or b.hash<>encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex')) changed_identities,
  (select count(*)::integer from public.security_events e left join copy_api_old_audit b using(id) where b.id is null) added_audit,
  (select count(*)::integer from public.security_events e left join public.identities i on i.id=e.actor_identity_id where e.actor_identity_id is not null and i.id is null) missing_identity_anchors`;
 assert.equal(proof.changed_audit,0,'Original audit changed');assert.equal(proof.changed_identities,0,'Original identities changed');assert.equal(proof.missing_identity_anchors,0,'Retained audit anchor missing');
 return proof;
}

async function main(){
 const{url,out,preflight}=parseCopyApiArgs(process.argv.slice(2)),sources=sourceHashes();
 const build=await builtWorkerProof(url),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:3,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const checks=[];let fixture,before,after,acl,finalAcl,baselineFingerprint,finalFingerprint,anchorConnection,anchorBaseline,anchorProof,
  failure,cleanup,finalSources,finalArtifact,temporaryGrant=false,triggerInstalled=false,databaseClosed=false,unknownHttp=false,cleanupDeferred=false;
 const suffix=randomUUID().replaceAll('-',''),trigger=`copy_api_worker_failure_${suffix}`,triggerFn=`copy_api_worker_failure_fn_${suffix}`;
 const check=async(name,run)=>{try{await run();checks.push({name,ok:true});}catch(error){checks.push({name,ok:false});throw error;}};
 const request=async(session,path,body,status=200,headers={})=>{
  let response;
  try{response=await fetch(url+path,{method:'POST',headers:{Cookie:`sp_session=${session.token}`,'Content-Type':'application/json',Origin:url,
   'Sec-Fetch-Site':'same-origin','X-Context-Epoch':String(session.epoch),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
   const text=await response.text();let value;try{value=JSON.parse(text);}catch{throw Error('Non-JSON protected response');}
   assert.equal(response.status,status,`Unexpected HTTP status at ${path}`);return{body:value,correlationId:response.headers.get('x-correlation-id')};
  }catch(error){if(!response||error.name==='TimeoutError'||error.name==='AbortError')unknownHttp=true;throw error;}
 };
 try{
  baselineFingerprint=await databaseFingerprint(db);acl=await gymAcl(db);
  const entry=acl.find(row=>row.f===COPY_ENTRY);assert.ok(entry,'REFUSED: closed copy foundation must already be installed');
  assert.equal(entry.granted,!preflight,'REFUSED: unexpected copy entrypoint grant');
  const tables=(await db`select tablename from pg_tables where schemaname='public' and tablename not in ('security_events','identities') order by tablename`).map(row=>row.tablename);
  before=await decisionBusinessHashes(db,tables);
  anchorConnection=await db.reserve();anchorBaseline=await originalAnchors(anchorConnection);
  if(preflight){await db.unsafe(`grant execute on function ${COPY_ENTRY} to skolplattform_worker`);temporaryGrant=true;
   const granted=await gymAcl(db);assert.deepEqual(granted.filter(row=>row.f!==COPY_ENTRY),acl.filter(row=>row.f!==COPY_ENTRY),'Preflight changed another grant');}
  fixture=await createGymTimplanFixture();const f=fixture;
  const ready=await f.createReadyProgramplan(url,{twoSchools:true});
  const source=await f.snapshot(ready.planId),education=await f.offering(ready.offeringId);
  assert.equal(source.basis_reference.programRef.code,'SA25');assert.equal(source.basis_reference.programRef.version,4);
  const newStart=new Date(Date.parse(source.basis_reference.startedOn+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const makeCommand=(name,extra={})=>parseProgramplanCopyRequest({commandId:randomUUID(),sourcePlanId:source.id,expectedSourceRevision:source.revision,
   expectedEducationRevision:education.lifecycle_revision,unitId:f.unitId,name,localCode:null,cohort:'Syntetisk senare elevkull',
   basisReference:{...source.basis_reference,startedOn:newStart},...extra});
  const sourceSnapshot=async()=>({plan:await f.snapshot(source.id),offering:await f.offering(education.id),events:await f.history(source.id),units:await f.units(education.id),packages:await f.packageSnapshot(source.id)});
  const original=await sourceSnapshot(),command=makeCommand('Syntetisk atomär HTTP-kopia');let created;
  await check('HM copies bound SA25 v4 with two schools through actual Worker',async()=>{
   const result=await request(f.hm,COPY_PATH,command);created=parseProgramplanCopyCreated(result.body,command);
   assert.equal(created.plan.revision,0);assert.equal(created.plan.version,1);assert.equal(created.plan.status,'utkast');assert.equal(created.replayed,false);
   const events=(await f.events(result.correlationId)).filter(row=>row.action==='programplan_education_copied');
   assert.equal(events.length,2);assert.deepEqual(events.map(row=>row.source).sort(),['db','worker']);
   assert.ok(events.every(row=>row.outcome==='ok'&&row.customer_id===f.customerId&&row.actor_identity_id===f.hm.identityId&&row.session_id===f.hm.id&&row.assignment_id===f.hm.assignmentId&&row.membership_id===f.hm.membershipId&&row.object_id===created.education.id));
  });
  await check('current copy is revision one with exact terms basis and schools',async()=>{
   const plan=await f.snapshot(created.plan.id);assert.equal(plan.revision,1);assert.equal(plan.status,'utkast');assert.equal(plan.version,1);
   assert.equal(plan.decided_on,null);assert.equal(plan.decided_by,null);assert.equal(plan.decided_identity_id,null);
   assert.deepEqual(plan.basis_reference,command.basisReference);assert.deepEqual(plan.term_distribution,ready.distribution);
   assert.deepEqual(await f.units(created.education.id),await f.units(education.id));
   assert.equal((await f.offering(created.education.id)).status,'planerad');
   const [receipt]=await db`select request,initial_result from public.programplan_education_receipts where command_id=${command.commandId} and customer_id=${f.customerId}`;
   assert.deepEqual(receipt.request,command);assert.deepEqual(receipt.initial_result,created);
  });
  await check('copy has no pupils classes timplans packages or previous decisions',async()=>{
   for(const table of ['pupil_placements','school_classes','timplans','programplan_unit_packages']){
    const [count]=await db.unsafe(`select count(*)::integer n from public.${table} where offering_id=$1`,[created.education.id]);assert.equal(count.n,0);
   }
   for(const table of ['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits']){
    const [count]=await db.unsafe(`select count(*)::integer n from public.${table} where plan_id=$1`,[created.plan.id]);assert.equal(count.n,0);
   }
   assert.deepEqual(await f.packageSnapshot(created.plan.id),{versions:original.packages.versions,selections:[]});
   assert.deepEqual(await sourceSnapshot(),original);
  });
  const graph=await decisionBusinessHashes(db,graphTables);
  await check('full request status confirms immutable receipt without graph writes',async()=>{
   const status=copyStatusForCommand((await request(f.hm,STATUS_PATH,command)).body,command);assert.equal(status.status,'created');assert.equal(status.plan.id,created.plan.id);assert.equal(status.plan.revision,0);
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('unknown full-request status is not_found and never creates',async()=>{
   const unknown={...command,commandId:randomUUID(),expectedSourceRevision:800,expectedEducationRevision:800};
   assert.deepEqual(copyStatusForCommand((await request(f.hm,STATUS_PATH,unknown)).body,unknown),{commandId:unknown.commandId,status:'not_found'});
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('identical retry returns same immutable result and no graph writes',async()=>{
   const replay=parseProgramplanCopyCreated((await request(f.hm,COPY_PATH,command)).body,command);
   assert.deepEqual(replay,{...created,replayed:true});assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('changed request under commandId conflicts for copy and status',async()=>{
   for(const path of [COPY_PATH,STATUS_PATH])await request(f.hm,path,{...command,name:'Syntetiskt annat namn'},409);
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('stale source and education revisions create no graph',async()=>{
   await request(f.hm,COPY_PATH,makeCommand('Syntetisk stale plan',{expectedSourceRevision:source.revision+1}),409);
   await request(f.hm,COPY_PATH,makeCommand('Syntetisk stale utbildning',{expectedEducationRevision:education.lifecycle_revision+1}),409);
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('rektor and administrator are denied copy and status',async()=>{
   for(const session of [f.principal,f.admin])for(const path of [COPY_PATH,STATUS_PATH])await request(session,path,command,403);
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('MFA CSRF and context epoch enforced including status',async()=>{
   for(const path of [COPY_PATH,STATUS_PATH]){
    await request(f.hmNoMfa,path,command,403);
    await request(f.hm,path,command,403,{Origin:'https://foreign.invalid','Sec-Fetch-Site':'cross-site'});
    await request(f.hm,path,command,409,{'X-Context-Epoch':String(f.hm.epoch+1)});
   }
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('partial-school HM cannot recover or copy shared source',async()=>{
   for(const path of [COPY_PATH,STATUS_PATH])await request(f.partialHm,path,command,403);
   assert.deepEqual(await decisionBusinessHashes(db,graphTables),graph);
  });
  await check('simultaneous identical HTTP commands create one complete graph',async()=>{
   const both=makeCommand('Syntetisk samtidig HTTP-kopia');
   // Wait for both full responses even when one fails. Never clean a fixture
   // while the other actual request could still be committing.
   const finish=promise=>promise.then(value=>({value}),error=>({error}));
   const settled=await Promise.all([finish(request(f.hm,COPY_PATH,both)),finish(request(f.hm,COPY_PATH,both))]);
   for(const result of settled)if(result.error)throw result.error;
   const results=settled.map(reply=>parseProgramplanCopyCreated(reply.value.body,both));
   assert.equal(results[0].plan.id,results[1].plan.id);assert.equal(results[0].education.id,results[1].education.id);
   assert.deepEqual(results.map(result=>result.replayed).sort(),[false,true]);
   assert.equal((await db`select count(*)::integer n from public.programplan_education_receipts where command_id=${both.commandId} and customer_id=${f.customerId}`)[0].n,1);
   assert.equal((await f.plans(results[0].education.id)).length,1);
   assert.deepEqual((await f.snapshot(results[0].plan.id)).term_distribution,ready.distribution);
   assert.deepEqual(await f.units(results[0].education.id),await f.units(education.id));
   assert.deepEqual(await sourceSnapshot(),original);
  });
  await check('final Worker copy audit failure rolls back the complete graph',async()=>{
   const oldGraph=await decisionBusinessHashes(db,graphTables);
   await db.begin(async tx=>{
    assert.equal((await tx`select count(*)::integer n from public.customers where id=${f.customerId} and name='Syntetiskt programplansprov'`)[0].n,1);
    await tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin if new.customer_id='${f.customerId}'::uuid and new.source='worker' and new.action='programplan_education_copied' and new.outcome='ok' then raise exception 'synthetic_copy_worker_audit_failure' using errcode='55000';end if;return new;end$$;create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`);
   });triggerInstalled=true;
   try{await request(f.hm,COPY_PATH,makeCommand('Syntetisk auditrollback'),500);assert.deepEqual(await decisionBusinessHashes(db,graphTables),oldGraph);}
   finally{await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${triggerFn}();`);triggerInstalled=false;}
  });
  await check('observed held source row then committed revision change yields HTTP409',async()=>{
   const stale=makeCommand('Syntetisk observerad källkonflikt');let pending,observed=false,holderPid;
   let probeFailure;
   try{await db.begin(async tx=>{
    await tx`set local statement_timeout='25s'`;await tx`set local lock_timeout='5s'`;
    assert.equal((await tx`select count(*)::integer n from public.customers where id=${f.customerId} and name='Syntetiskt programplansprov'`)[0].n,1);
    holderPid=(await tx`select pg_backend_pid() pid`)[0].pid;
    assert.equal((await tx`select id from public.point_plans where id=${source.id} and organizer_id=${f.organizerId} for update`).length,1);
    pending=request(f.hm,COPY_PATH,stale,409);pending.catch(()=>{});
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
     const rows=await db`select a.pid from pg_stat_activity a where a.datname=current_database() and a.state='active' and ${holderPid}::integer=any(pg_blocking_pids(a.pid)) and position('phase5_copy_programplan_education' in a.query)>0`;
     if(rows.length){observed=true;break;}await new Promise(done=>setTimeout(done,50));
    }
    assert.equal(observed,true,'Actual copy source lock wait not observed');
    await tx`update public.point_plans set revision=revision+1 where id=${source.id} and organizer_id=${f.organizerId}`;
   });}catch(error){probeFailure=error;}
   const replies=pending?await Promise.allSettled([pending]):[];
   if(probeFailure)throw probeFailure;
   assert.equal(replies[0]?.status,'fulfilled','Held copy HTTP did not finish as conflict');
   assert.equal((await db`select count(*)::integer n from public.programplan_education_receipts where command_id=${stale.commandId} and customer_id=${f.customerId}`)[0].n,0);
   assert.equal((await db`select count(*)::integer n from public.offerings where organizer_id=${f.organizerId} and name=${stale.name}`)[0].n,0);
   assert.equal((await f.snapshot(source.id)).revision,source.revision+1);
  });
  await check('initial receipt remains recoverable after source revision changed',async()=>{
   const status=copyStatusForCommand((await request(f.hm,STATUS_PATH,command)).body,command);
   assert.equal(status.status,'created');assert.equal(status.plan.id,created.plan.id);assert.equal(status.plan.revision,0);
   const replay=parseProgramplanCopyCreated((await request(f.hm,COPY_PATH,command)).body,command);assert.deepEqual(replay,{...created,replayed:true});
  });
 }catch(error){failure=error;}
 finally{
  try{
   if(triggerInstalled){await db.unsafe(`drop trigger ${trigger} on public.security_events;drop function public.${triggerFn}();`);triggerInstalled=false;}
   // A fetch timeout does not prove the database transaction ended. Preserve
   // the owned graph for a separately reviewed recovery after stopping Worker.
   if(unknownHttp){cleanupDeferred=true;throw Error('REFUSED: unknown HTTP completion; fixture cleanup deferred');}
   if(fixture)cleanup=await fixture.cleanup();
  }catch(error){failure??=error;}
  try{
   if(temporaryGrant){await db.unsafe(`revoke execute on function ${COPY_ENTRY} from skolplattform_worker`);temporaryGrant=false;}
   finalAcl=await gymAcl(db);assert.deepEqual(finalAcl,acl,'Raw phase5 ACL not restored');
   finalFingerprint=await databaseFingerprint(db);assert.equal(finalFingerprint,baselineFingerprint,'Definitions ACL or migration journal changed');
   const tables=Object.keys(before??{});after=await decisionBusinessHashes(db,tables);assert.deepEqual(after,before,'Original public business changed');
   if(anchorConnection)anchorProof=await verifyOriginalAnchors(anchorConnection);
   finalSources=sourceHashes();assert.deepEqual(finalSources,sources,'Controlled source changed during verification');
   finalArtifact=artifactManifest(build.buildRoot);assert.deepEqual(finalArtifact,build.artifact,'Built artifact changed during verification');
  }catch(error){failure??=error;}
  try{if(anchorConnection)await anchorConnection.release();await db.end({timeout:5});databaseClosed=true;}catch(error){failure??=error;}
 }
 const report={kind:'programplan-copy-api',status:failure?'FAIL':'PASS',target:'protected',scope:'local-synthetic-only',preflight,reset:false,
  programCode:'SA25',programVersion:4,complete:!failure,databaseClosed,unknownHttp,cleanupDeferred,checks,cleanup,
  realWorker:build,sourceHashes:sources,finalSourceHashes:finalSources,baselineFingerprint,finalFingerprint,
  preflightAclRestored:JSON.stringify(acl)===JSON.stringify(finalAcl),beforeAcl:acl,afterAcl:finalAcl,
  originalBusinessPreserved:JSON.stringify(before)===JSON.stringify(after),beforeHashes:before,afterHashes:after,
  auditIdentityBaseline:anchorBaseline,auditIdentityProof:anchorProof,artifactUnchanged:JSON.stringify(build.artifact)===JSON.stringify(finalArtifact),
  failure:failure?{code:/^[A-Z0-9_]{1,40}$/u.test(failure.code??'')?failure.code:'VERIFICATION_FAILED',
   check:checks.findLast(item=>!item.ok)?.name??'setup-or-final-preservation',location:failure.stack?.split('\n').find(line=>line.includes('verify-programplan-copy-api.mjs:'))?.trim()}:null};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`${report.status}: ${checks.filter(check=>check.ok).length}/${checks.length} actual copy HTTP checks; ACL restored ${report.preflightAclRestored}; business preserved ${report.originalBusinessPreserved}.`);
 if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(()=>{console.error('FAIL: copy API setup or private report');process.exitCode=1;});
