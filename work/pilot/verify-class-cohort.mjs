#!/usr/bin/env node
// Local SQL evidence only. This module never applies DDL or runs a CLI on import.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {openSync,writeSync,ftruncateSync,fsyncSync,closeSync,readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {setupClassCohortLinkFixture,secondCohort} from './verify-class-cohort-link-identity.mjs';
import {classCohortCommandSourceHashes} from './verify-class-cohort-commands.mjs';
import {classTimplanScenarios,appliedDefinitions} from './verify-class-timplans.mjs';
import {parseClassCohortUnderlag,parseClassCohortCreateReply,parseClassCohortStatusReply} from '../../web/lib/class-cohort.ts';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const migrations=['20261015100000_class_cohort_dates.sql','20261015101000_class_cohort_link_identity.sql','20261015102000_class_cohort_commands.sql'];
const rollback=Error('expected_class_cohort_rollback');
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const ident=value=>'"'+value.replaceAll('"','""')+'"';
export function reserveReport(path,kind,mode){
 const output=resolve(path);assert.ok(output.startsWith('/private/tmp/')&&output.endsWith('.json'),'Private JSON output required');
 const fd=openSync(output,'wx',0o600),report={kind,schemaVersion:1,runId:randomUUID(),mode,status:'FAIL',stage:'started',failureCode:'run_incomplete',startedAt:new Date().toISOString()};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();
 return{report,save,close(){save();closeSync(fd);}};
}
export function readEvidence(path){const bytes=readFileSync(resolve(path));return{value:JSON.parse(bytes),sha256:hash(bytes)};}
export function classCohortSourceHashes(){
 const paths=new Set([...Object.keys(classCohortCommandSourceHashes()),'work/pilot/verify-class-cohort.mjs','work/pilot/apply-class-cohort.mjs','work/pilot/resume-class-cohort-concurrency.mjs']);
 const visit=path=>{for(const m of readFileSync(resolve(root,path),'utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/gu)){
  const absolute=resolve(resolve(root,path),'..',m[1]);if(absolute.startsWith(root)&&existsSync(absolute)){const relative=absolute.slice(root.length);if(!paths.has(relative)){paths.add(relative);visit(relative);}}
 }};for(const path of [...paths])if(/\.(?:mjs|ts|tsx)$/u.test(path))visit(path);
 return Object.fromEntries([...paths].sort().map(path=>[path,hash(readFileSync(resolve(root,path)))]));
}
export function connect(target,max=1){return createRequire(resolve(root,'web/package.json'))('postgres')(target.dbUrl,{max,prepare:false,connect_timeout:10,onnotice:()=>{}});}
export async function classCohortTargetIdentity(db,target){
 const [row]=await db`select current_database() database,current_setting('server_version_num') server_version,(pg_control_system()).system_identifier::text system_identifier`;
 const endpoint=new URL(target.dbUrl),identity={target:'protected',projectId:target.projectId??target.project_id,host:endpoint.hostname,port:endpoint.port,...row};
 assert.equal(identity.host,'127.0.0.1');return{...identity,sha256:hash(identity)};
}
export async function classCohortInstalledState(db){
 const installed=[];for(const migration of migrations){const version=migration.slice(0,14),source=readFileSync(resolve(root,'supabase/migrations',migration),'utf8');
  const [r]=await db`select version,name,statements from supabase_migrations.schema_migrations where version=${version}`;
  assert.ok(r,'Required cohort migration missing');assert.deepEqual(r.statements,[source],'Installed journal differs from current migration');
  installed.push({version,sourceSha256:hash(source),journalSourceSha256:hash(r.statements[0])});
 }
 return{migrations:installed,schemaFingerprint:await vocationalDatabaseFingerprint(db),definitionAndAclChecks:'PASS'};
}
export async function catalogColumns(db){
 const rows=await db`select t.tablename,a.attname from pg_tables t join pg_class c on c.relname=t.tablename and c.relnamespace='public'::regnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where t.schemaname='public' order by t.tablename,a.attnum`;
 const result={};for(const r of rows)(result[r.tablename]??=[]).push(r.attname);return result;
}
export async function projectionHashes(db,columns,excluded={}){
 const result={};for(const [table,names]of Object.entries(columns)){
  const omit=excluded[table]??[];
  const [row]=await db.unsafe(`select count(*)::integer count,md5(coalesce(string_agg(r::text,'' order by r::text),'')) hash from (select to_jsonb(p) r from (select ${names.map(ident).join(',')} from public.${ident(table)} t where not exists(select 1 from jsonb_array_elements(($1::text)::jsonb) k where to_jsonb(t) @> k)) p) s`,[JSON.stringify(omit)]);
  result[table]=row;
 }return result;
}
export async function keyInventory(db){
 const tables=await db`select t.tablename,array_agg(a.attname order by x.ordinality) columns from pg_tables t join pg_class c on c.relname=t.tablename and c.relnamespace='public'::regnamespace join pg_index i on i.indrelid=c.oid and i.indisprimary cross join lateral unnest(i.indkey) with ordinality x(attnum,ordinality) join pg_attribute a on a.attrelid=c.oid and a.attnum=x.attnum where t.schemaname='public' group by t.tablename order by t.tablename`;
 assert.equal(tables.length,(await db`select count(*)::int n from pg_tables where schemaname='public'`)[0].n,'Every public table must have known primary key');
 const result={};for(const t of tables)result[t.tablename]=(await db.unsafe(`select to_jsonb(k) key from (select ${t.columns.map(ident).join(',')} from public.${ident(t.tablename)}) k order by to_jsonb(k)::text`)).map(r=>r.key);for(const list of Object.values(result))for(const key of list)for(const value of Object.values(key))if(typeof value==='number')assert.ok(Number.isSafeInteger(value),'Unsafe numeric primary key');return result;
}
function keyDifference(after,before){return Object.fromEntries(Object.entries(after).map(([table,keys])=>{const prior=new Set((before[table]??[]).map(k=>JSON.stringify(k)));return[table,keys.filter(k=>!prior.has(JSON.stringify(k)))];}));}
export async function packageAbsent(db){assert.equal((await db`select version from supabase_migrations.schema_migrations where version>='20261015100000'`).length,0,'Cohort package already installed');}
export async function installPackage(tx,{journal=false}={}){
 await packageAbsent(tx);for(const migration of migrations){const source=readFileSync(resolve(root,'supabase/migrations',migration),'utf8');await tx.unsafe(source);
  if(journal)await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${migration.slice(0,14)},${migration.slice(15,-4)},${[source]})`;
 }
}
export async function assertLegacyProjection(tx){
 assert.equal((await tx`select count(*)::int n from public.school_classes where starts_on is not null or ends_on is not null or validity_source<>'legacy_unknown' or created_at is not null or updated_at is not null`)[0].n,0,'No historical dates fabricated by migration');
 assert.equal((await tx`select count(*)::int n from public.class_cohort_commands`)[0].n,0);
}
async function seedFixture(tx){
 const f=await setupClassCohortLinkFixture(tx),second=await secondCohort(tx,f);
 const context={...(await tx`select value from cohort_context`)[0].value,second,year:f.year,unitId:f.id(30),customerId:f.id(1),organizerId:f.id(2),earlyOfferingId:f.id(40),identityId:f.id(11),sessionId:f.id(81)};
 await tx`update cohort_context set value=${tx.json(context)}`;
 return{prefix:f.id(1).slice(0,8),roles:f.roles,context};
}
function fixtureId(f,n){assert.match(f.prefix,/^[0-9a-f]{8}$/u);return`${f.prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;}
export async function setFixtureActor(tx,f,name='principal',sessionId){
 const [i,m,s]={hm:[10,20,80],principal:[11,21,81],admin:[13,23,83]}[name];
 const context={customer_id:fixtureId(f,1),organizer_id:fixtureId(f,2),identity_id:fixtureId(f,i),membership_id:fixtureId(f,m),session_id:sessionId??fixtureId(f,s),assignment_id:f.roles[name],correlation_id:randomUUID()};
 for(const [key,value]of Object.entries(context))await tx`select set_config(${`app.${key}`},${value},true)`;return context;
}
async function restoreContext(tx,f){
 await tx`create temporary table cohort_context(value jsonb) on commit drop`;await tx`insert into cohort_context values(${tx.json(f.context)})`;
 await tx`create temporary table programplan_roles(name text primary key,id uuid) on commit drop`;
 for(const [name,id]of Object.entries(f.roles))await tx`insert into programplan_roles values(${name},${id})`;
 await tx.unsafe(`create function pg_temp.cohort_actor(name text) returns void language plpgsql as $$begin
 perform set_config('app.identity_id',case name when 'hm' then '${fixtureId(f,10)}' when 'admin' then '${fixtureId(f,13)}' else '${fixtureId(f,11)}' end,true);
 perform set_config('app.membership_id',case name when 'hm' then '${fixtureId(f,20)}' when 'admin' then '${fixtureId(f,23)}' else '${fixtureId(f,21)}' end,true);
 perform set_config('app.session_id',case name when 'hm' then '${fixtureId(f,80)}' when 'admin' then '${fixtureId(f,83)}' else '${fixtureId(f,81)}' end,true);
 perform set_config('app.assignment_id',(select id::text from programplan_roles where programplan_roles.name=cohort_actor.name),true);end$$;`);
 await setFixtureActor(tx,f);
}
async function matrix(tx,report){
 report.suites={};for(const [name,file,table]of [['dates','phase5_class_cohort_dates.test.sql','cohort_checks'],['linkIdentity','phase5_class_cohort_link_identity.test.sql','link_identity_checks'],['commands','phase5_class_cohort_commands.test.sql','cohort_command_checks']]){
  await tx.unsafe(readFileSync(resolve(root,'supabase/tests',file),'utf8'));
  const checks=(await tx.unsafe(`select name from pg_temp.${ident(table)} order by name`)).map(r=>({name:r.name,ok:true}));report.suites[name]={status:'PASS',skipped:0,checks};
 }
 const [{value:x}]=await tx`select value from cohort_context`;
 parseClassCohortCreateReply(x.batchReply,x.batchRequest);
 parseClassCohortStatusReply((await tx`select public.phase5_class_cohort_status(${tx.json(x.batchRequest)}) r`)[0].r,x.batchRequest);
 for(const offeringId of [x.offeringId,x.earlyOfferingId,x.nullCalendarOfferingId,x.outsideYearOfferingId])parseClassCohortUnderlag((await tx`select public.phase5_class_cohort_underlag(${offeringId},${x.unitId}) r`)[0].r,{offeringId,unitId:x.unitId});
 const checks=[{name:'actual full SQL responses satisfy TS parsers',ok:true}];
 await tx`set local role skolplattform_worker`;
 const input={offeringId:x.earlyOfferingId,unitId:x.unitId};
 const underlag=parseClassCohortUnderlag((await tx`select public.phase5_class_cohort_underlag(${input.offeringId},${input.unitId}) r`)[0].r,input);
 const q={commandId:randomUUID(),...input,expectedEducationRevision:underlag.educationRevision,expectedSourceToken:underlag.sourceToken,startsOn:underlag.educationStartsOn,names:['08-WORKER-ÅÄÖ','𐐀08','😀'.repeat(30)]};
 parseClassCohortCreateReply((await tx`select public.phase5_class_cohort_command(${tx.json(q)}) r`)[0].r,q);
 parseClassCohortStatusReply((await tx`select public.phase5_class_cohort_status(${tx.json(q)}) r`)[0].r,q);
 for(const sql of ['select * from public.class_cohort_commands',"select public.phase5_class_cohort_name('A')"]){let e;try{await tx.savepoint(t=>t.unsafe(sql));}catch(error){e=error;}assert.equal(e?.code,'42501');}
 await tx`reset role`;checks.push({name:'actual DB role skolplattform_worker creates Unicode batch and cannot access private helpers/receipts',ok:true});
 for(const value of ['\\ud800','\\udc00','A\\ud800B']){let e;try{await tx.savepoint(t=>t`select (${ '"'+value+'"'}::text)::jsonb`);}catch(error){e=error;}assert.equal(e?.code,'22P02');}
 const candidates=['SA27A','ÅÄÖ 27','A B','😀'.repeat(30),'𐐀27','',' A','A ','a','å','A\nB','A\u200dB','A\ufeffB','\u00a0A','A\u00a0','😀'.repeat(31),'𐐨27','ß27'];
 for(let cp=1;cp<=0x10ffff;cp++){const s=String.fromCodePoint(cp);if(/[\p{Cc}\p{Cf}]/u.test(s)||s.toUpperCase()!==s)for(const n of [cp-1,cp,cp+1])if(n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff))candidates.push('A'+String.fromCodePoint(n)+'B');}
 for(const cp of [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]){const s=String.fromCodePoint(cp);candidates.push(s+'A','A'+s,'A'+s+'B');}
 const rows=await tx`select n,public.phase5_class_cohort_name(n) ok from unnest(${candidates}::text[]) n`;
 for(const {n,ok}of rows)assert.equal(ok,n.length>=1&&n.length<=60&&n===n.trim().toUpperCase()&&!/[\p{Cc}\p{Cf}]/u.test(n));
 checks.push({name:`${rows.length} actual Unicode name probes and lone-surrogate transport rejection; Unicode ${process.versions.unicode}`,ok:true});
 report.suites.contract={status:'PASS',skipped:0,checks};
}
async function legacyRegression(db,report,applied=false){
 const checks=[];for(const code of ['SA25','BF25']){try{await db.begin('isolation level read committed',async tx=>{await tx`set local statement_timeout='90s'`;if(!applied)await installPackage(tx);await classTimplanScenarios(tx,checks,code);throw rollback;});}catch(e){if(e!==rollback)throw e;}}
 report.suites.oldClassTimplans={status:'PASS',skipped:0,checks};
}
async function isolationRegression(db,report,manifest,applied){
 for(const isolation of ['repeatable read','serializable']){
  try{await db.begin('isolation level '+isolation,async tx=>{await timeoutSettings(tx);const f=applied?manifest.fixture:await seedFixture(tx);if(applied)await restoreContext(tx,f);else await installPackage(tx);
   const deny=async(name,fn)=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}assert.equal(error?.code,'40001');assert.equal(error?.hint,'class_cohort_start_locked');report.suites.dates.checks.push({name:isolation+': '+name,ok:true});};
   await deny('offering start rejects stale isolation',t=>t`update public.offerings set start_year=start_year+1 where id=${f.context.offeringId}`);
   await deny('point plan start rejects stale isolation',t=>t`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb('2035-08-17'::text)),revision=revision+1 where id=${f.context.programId}`);
   await deny('class insert rejects stale isolation',t=>t`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${f.context.customerId},${f.context.organizerId},${f.context.unitId},${f.context.offeringId},'ISOLATION-08',${f.context.year})`);
   throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
 }
}
async function timeoutSettings(tx){await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='90s'`;}
export async function requireAppliedEvidence({evidencePath,db,target}){
 const {value:r,sha256}=readEvidence(evidencePath);
 assert.equal(r.kind,'class-cohort-sql-evidence');assert.equal(r.schemaVersion,1);assert.equal(r.mode,'applied');assert.equal(r.status,'PASS');assert.equal(r.databaseClosed,true);
 for(const name of ['dates','linkIdentity','commands','oldClassTimplans','contract']){assert.equal(r.suites[name].status,'PASS');assert.equal(r.suites[name].skipped,0);assert.ok(r.suites[name].checks.length>0&&r.suites[name].checks.every(c=>c.ok===true));}
 assert.equal(r.cleanup.status,'complete');assert.equal(r.cleanup.ownBusinessRowsRemaining,0);assert.equal(r.cleanup.ownSessionsRemaining,0);assert.equal(r.cleanup.foreignReferences,0);
 assert.equal(r.preservation.originalRowsUnchanged,true);assert.deepEqual(r.preservation.baselineProjectionHashes,r.preservation.finalOriginalProjectionHashes);
 assert.equal(r.concurrency.status,'PASS');for(const id of concurrencyIds){const c=r.concurrency.cases.find(c=>c.id===id);assert.ok(c?.status==='PASS'&&c.aPid!==c.bPid&&c.barrier.observation?.aXactStart&&c.barrier.observation?.bPid===c.bPid);assert.ok(c.barrier.kind==='blocked'&&c.barrier.observation.blockingPids.includes(c.aPid)||c.barrier.kind==='nowait'&&c.outcomes.b.code==='40001');}
 for(const isolation of ['repeatable_read','serializable']){const c=r.concurrency.cases.find(c=>c.id==='stale_snapshot_'+isolation);assert.ok(c?.status==='PASS'&&c.aPid!==c.bPid&&c.barrier.observation.aXactStart&&c.barrier.observation.bXactStart);assert.equal(c.barrier.currentCount,1);assert.equal(c.outcomes.a.result.stale,0);assert.ok(c.outcomes.a.result.denials.length===2&&c.outcomes.a.result.denials.every(d=>d.code==='40001'&&d.hint==='class_cohort_start_locked'));}
 if(r.composition)await (await import('./resume-class-cohort-concurrency.mjs')).validateComposition(r);
 const sources=classCohortSourceHashes();assert.deepEqual(r.sqlSourceHashes,sources);assert.deepEqual(r.finalSqlSourceHashes,sources);
 assert.deepEqual(r.targetIdentity,await classCohortTargetIdentity(db,target));assert.deepEqual(r.installed,await classCohortInstalledState(db));await appliedDefinitions(db);
 return{evidenceSha256:sha256,targetIdentity:r.targetIdentity,installedMigrations:r.installed.migrations,installedSchemaFingerprint:r.installed.schemaFingerprint,sqlSourceHashes:sources};
}
// The applied mode completes physical concurrency and exact owned cleanup below.
const concurrencyIds=['class_then_plan_start','source_then_direct_class','class_then_offering_start','identical_batch','revision_then_stale_request'];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function observe(db,aPid,bPid){
 const rows=await db`select pid,xact_start::text,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=any(${[aPid,bPid]}::int[])`;
 const a=rows.find(r=>r.pid===aPid),b=rows.find(r=>r.pid===bPid);assert.ok(a&&b&&aPid!==bPid);
 return{observedAt:new Date().toISOString(),aPid,bPid,aXactStart:a.xact_start,bXactStart:b.xact_start,aState:a.state,bState:b.state,waitEventType:b.wait_event_type,waitEvent:b.wait_event,blockingPids:b.blockers};
}
async function waitBlocked(db,aPid,bPid){
 const end=Date.now()+7000;while(Date.now()<end){const o=await observe(db,aPid,bPid);if(o.aXactStart&&o.bXactStart&&o.waitEventType==='Lock'&&o.blockingPids.includes(aPid))return o;await new Promise(r=>setTimeout(r,40));}throw Error('physical_blocking_barrier_timeout');
}
// Each persistent write records exact keys while its transaction is still open.
// Selectors are operation IDs and full audit context, never a customer-wide graph.
async function recordExact(tx,ledger,table,selector,expected=1){
 const columns=(await tx`select array_agg(a.attname order by x.o) names from pg_index i cross join lateral unnest(i.indkey) with ordinality x(n,o) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.n where i.indrelid=${'public.'+table}::regclass and i.indisprimary`)[0].names;
 assert.ok(columns?.length);
 const rows=await tx.unsafe(`select to_jsonb(k) key from (select ${columns.map(ident).join(',')} from public.${ident(table)} t where to_jsonb(t) @> (($1::text)::jsonb)) k order by to_jsonb(k)::text`,[JSON.stringify(selector)]);
 assert.equal(rows.length,expected,'Exact operation row count');
 const keys=ledger.keys[table]??=[];for(const {key}of rows){for(const value of Object.values(key))if(typeof value==='number')assert.ok(Number.isSafeInteger(value));if(!keys.some(k=>JSON.stringify(k)===JSON.stringify(key)))keys.push(key);}
 ledger.operations.push({table,selector,keys:rows.map(r=>r.key)});ledger.save();
}
async function recordAudit(tx,ledger,actor,action,objectId){
 await recordExact(tx,ledger,'security_events',{correlation_id:actor.correlation_id,actor_identity_id:actor.identity_id,session_id:actor.session_id,membership_id:actor.membership_id,assignment_id:actor.assignment_id,customer_id:actor.customer_id,action,object_id:objectId,outcome:'ok'});
}
export async function lockPublicTables(tx){
 const tables=Object.keys(await catalogColumns(tx)).sort();await tx.unsafe('lock table '+tables.map(t=>'public.'+ident(t)).join(',')+' in share row exclusive mode');
}
async function race(db,target,f,id,aAction,bAction,kind){
 const a=connect(target),b=connect(target),aReady=deferred(),bReady=deferred(),releaseA=deferred(),releaseB=deferred();let aPid,bPid,barrier,outcomes;
 const aRun=a.begin('isolation level read committed',async tx=>{await timeoutSettings(tx);aPid=(await tx`select pg_backend_pid() pid`)[0].pid;const actor=await setFixtureActor(tx,f);const result=await aAction(tx,actor);aReady.resolve(result);await releaseA.promise;return result;}).then(result=>({ok:true,result}),e=>{aReady.reject(e);return{ok:false,code:e.code,hint:e.hint};});
 let bRun;
 try{
  await aReady.promise;
  bRun=b.begin('isolation level read committed',async tx=>{await timeoutSettings(tx);bPid=(await tx`select pg_backend_pid() pid`)[0].pid;const actor=await setFixtureActor(tx,f,'principal',f.concurrentSessionId);bReady.resolve();await releaseB.promise;return bAction(tx,actor);}).then(result=>({ok:true,result}),e=>{bReady.reject(e);return{ok:false,code:e.code,hint:e.hint};});
  await bReady.promise;const before=await observe(db,aPid,bPid);assert.ok(before.aXactStart&&before.bXactStart);releaseB.resolve();
  if(kind==='blocked'){barrier={kind,observation:await waitBlocked(db,aPid,bPid)};releaseA.resolve();}
  else{const result=await Promise.race([bRun,new Promise((_,reject)=>setTimeout(()=>reject(Error('nowait_timeout')),7000))]);const after=await observe(db,aPid,bPid);assert.ok(after.aXactStart);assert.equal(result.code,'40001');assert.equal(result.hint,'class_cohort_start_locked');barrier={kind,observation:before,aAfterB:after};releaseA.resolve();}
  outcomes={a:await aRun,b:await bRun};assert.equal(outcomes.a.ok,true);
  return{id,status:'PASS',aPid,bPid,barrier,outcomes};
 }finally{releaseB.resolve();releaseA.resolve();await aRun;if(bRun)await bRun;await a.end({timeout:5});await b.end({timeout:5});}
}
async function freshEducation(db,f,ledger){
 return db.begin(async tx=>{const hm=await setFixtureActor(tx,f,'hm');const [p]=await tx`select * from public.point_plans where id=${f.context.programId}`;const id=randomUUID();
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${id},${f.context.organizerId},${f.context.unitId},'gymnasium','Syntetiskt konkurrensprov','Syntetisk',${p.basis_reference.programRef.code},${p.basis_reference.orientationCode},${Number(p.basis_reference.startedOn.slice(0,4))})`;
  const plan=(await tx`select public.phase5_create_programplan_draft(${id},0,${tx.json(p.basis_reference)}) r`)[0].r;
  await recordExact(tx,ledger,'offerings',{id});await recordExact(tx,ledger,'offering_units',{offering_id:id,unit_id:f.context.unitId});await recordExact(tx,ledger,'point_plans',{id:plan.id});await recordExact(tx,ledger,'point_plan_events',{point_plan_id:plan.id,action:'programplan_draft_created'});await recordAudit(tx,ledger,hm,'programplan_draft_created',plan.id);
  const actor=await setFixtureActor(tx,f);
  const read=(await tx`select public.phase5_class_cohort_underlag(${id},${f.context.unitId}) r`)[0].r;
  await recordAudit(tx,ledger,actor,'class_cohort_read',id);
  return{id,planId:plan.id,startedOn:read.educationStartsOn,year:read.firstSchoolYear,q:{commandId:randomUUID(),offeringId:id,unitId:f.context.unitId,expectedEducationRevision:read.educationRevision,expectedSourceToken:read.sourceToken,startsOn:read.educationStartsOn,names:['CONCURRENT-A','CONCURRENT-B']}};
 });
}
async function staleSnapshotRace(db,target,f,e,isolation,direct){
 const a=connect(target),b=connect(target),ready=deferred(),resume=deferred();let aPid,bPid,observation;
 const aRun=a.begin('isolation level '+isolation,async tx=>{await timeoutSettings(tx);await setFixtureActor(tx,f);aPid=(await tx`select pg_backend_pid() pid`)[0].pid;
  const before=(await tx`select count(*)::int n from public.school_classes where offering_id=${e.id}`)[0].n;assert.equal(before,0);ready.resolve();await resume.promise;
  const stale=(await tx`select count(*)::int n from public.school_classes where offering_id=${e.id}`)[0].n;assert.equal(stale,0);const denials=[];
  for(const action of [t=>t`update public.offerings set start_year=start_year+1 where id=${e.id}`,t=>t`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb((${e.startedOn}::date+1)::text)),revision=revision+1 where id=${e.planId}`]){let error;try{await tx.savepoint(action);}catch(e){error=e;}assert.equal(error?.code,'40001');assert.equal(error?.hint,'class_cohort_start_locked');denials.push({code:error.code,hint:error.hint});}
  return{before,stale,denials};
 }).then(result=>({ok:true,result}),error=>{ready.reject(error);return{ok:false,code:error.code};});
 try{await ready.promise;
  const bResult=await b.begin('isolation level read committed',async tx=>{await timeoutSettings(tx);await setFixtureActor(tx,f,'principal',f.concurrentSessionId);bPid=(await tx`select pg_backend_pid() pid`)[0].pid;const result=await direct(tx,e);observation=await observe(db,aPid,bPid);assert.ok(observation.aXactStart&&observation.bXactStart);return result;});
  const currentCount=(await db`select count(*)::int n from public.school_classes where offering_id=${e.id}`)[0].n;assert.equal(currentCount,1);resume.resolve();const aResult=await aRun;assert.equal(aResult.ok,true);
  return{id:'stale_snapshot_'+isolation.replaceAll(' ','_'),status:'PASS',aPid,bPid,barrier:{kind:'stale_snapshot',observation,currentCount},outcomes:{a:aResult,b:{ok:true,result:bResult}}};
 }finally{resume.resolve();await aRun;await a.end({timeout:5});await b.end({timeout:5});}
}
export async function physicalConcurrency(db,target,f,ledger){
 const sessionId=randomUUID();f.concurrentSessionId=sessionId;
 await db.begin(async tx=>{await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) select ${sessionId},sha256(convert_to(${randomUUID()},'UTF8')),identity_id,membership_id,assignment_id,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours' from public.app_sessions where id=${f.context.sessionId}`;await recordExact(tx,ledger,'app_sessions',{id:sessionId});});
 const cases=[];
 const direct=async(tx,e)=>{const rows=await tx`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${f.context.customerId},${f.context.organizerId},${f.context.unitId},${e.id},${'CONCURRENT-'+e.id.toUpperCase()},${e.year}) returning id`;await recordExact(tx,ledger,'school_classes',{id:rows[0].id});return rows;};
 const command=async(tx,e,actor)=>{const reply=(await tx`select public.phase5_class_cohort_command(${tx.json(e.q)}) r`)[0].r;if(!reply.replayed){for(const c of reply.classes){await recordExact(tx,ledger,'school_classes',{id:c.id});await recordAudit(tx,ledger,actor,'class_created',c.id);}await recordExact(tx,ledger,'class_cohort_commands',{command_id:e.q.commandId});await recordAudit(tx,ledger,actor,'class_cohort_created',e.q.commandId);}else await recordAudit(tx,ledger,actor,'class_cohort_status_read',e.q.commandId);return reply;};
 const changeStart=(tx,e)=>tx`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb((${e.startedOn}::date+1)::text)),revision=revision+1 where id=${e.planId}`;
 for(const id of concurrencyIds){const e=await freshEducation(db,f,ledger);let c;
  if(id==='class_then_plan_start')c=await race(db,target,f,id,tx=>direct(tx,e),tx=>changeStart(tx,e),'nowait');
  if(id==='source_then_direct_class')c=await race(db,target,f,id,tx=>changeStart(tx,e),tx=>direct(tx,e),'nowait');
  if(id==='class_then_offering_start')c=await race(db,target,f,id,tx=>direct(tx,e),tx=>tx`update public.offerings set start_year=start_year+1 where id=${e.id}`,'blocked');
  if(id==='identical_batch')c=await race(db,target,f,id,(tx,actor)=>command(tx,e,actor),(tx,actor)=>command(tx,e,actor),'blocked');
  if(id==='revision_then_stale_request')c=await race(db,target,f,id,async tx=>{await tx`select public.phase5_gym_timplan_scope(${e.id},${f.context.unitId},false)`;await tx`update public.point_plans set revision=revision+1 where id=${e.planId}`;return{revised:true};},(tx,actor)=>command(tx,e,actor),'blocked');
  const [counts]=await db`select (select count(*)::int from public.school_classes where offering_id=${e.id}) classes,(select count(*)::int from public.class_cohort_commands where command_id=${e.q.commandId}) receipts,(select count(*)::int from public.security_events where object_id=${e.q.commandId} and action='class_cohort_created') "batchAudits"`;
  if(id==='identical_batch'){assert.equal(c.outcomes.b.ok,true);assert.equal(c.outcomes.a.result.replayed,false);assert.deepEqual(c.outcomes.b.result,{...c.outcomes.a.result,replayed:true});assert.deepEqual(counts,{classes:2,receipts:1,batchAudits:1});}
  else{assert.equal(c.outcomes.b.code,'40001');if(id!=='revision_then_stale_request')assert.equal(c.outcomes.b.hint,'class_cohort_start_locked');assert.equal(counts.classes,id.startsWith('class_then')?1:0);assert.equal(counts.receipts,0);}
  c.finalCounts=counts;cases.push(c);
 }
 for(const isolation of ['repeatable read','serializable']){const e=await freshEducation(db,f,ledger);cases.push(await staleSnapshotRace(db,target,f,e,isolation,direct));}
 return{status:'PASS',cases};
}
// The manifest and per-operation ledger are the sole cleanup authority. Any
// other new PK, even within the same synthetic customer, aborts before deletion.
async function ownedInventory(db,manifest,ledger){
 const current=await keyInventory(db),own=keyDifference(current,manifest.originalKeys),rows={};
 for(const [table,keys]of Object.entries(own)){
  const allowed=new Set((ledger.keys[table]??[]).map(k=>JSON.stringify(k)));
  for(const key of keys)assert.ok(allowed.has(JSON.stringify(key)),'Unjournalled row forbids cleanup');
  rows[table]=keys.length?(await db.unsafe(`select to_jsonb(t) r from public.${ident(table)} t where exists(select 1 from jsonb_array_elements(($1::text)::jsonb) k where to_jsonb(t) @> k)`,[JSON.stringify(keys)])).map(r=>r.r):[];
 }
 return{keys:own,rows};
}
export async function cleanupFixture(db,manifest,ledger){
 // Table locks prevent concurrent inserts, row changes, and new FK references
 // between inventory validation and exact deletion; ordinary reads remain safe.
 const result=await db.begin(async tx=>{await timeoutSettings(tx);await lockPublicTables(tx);
  const {keys,rows}=await ownedInventory(tx,manifest,ledger),retained={security_events:keys.security_events??[],identities:[]};
  const actorIds=new Set((rows.security_events??[]).map(r=>r.actor_identity_id));retained.identities=(keys.identities??[]).filter(k=>actorIds.has(k.id));
  const fks=await tx`select conrelid::regclass::text child,confrelid::regclass::text parent,array(select attname from unnest(conkey) with ordinality x(n,o) join pg_attribute a on a.attrelid=conrelid and a.attnum=x.n order by x.o) child_columns,array(select attname from unnest(confkey) with ordinality x(n,o) join pg_attribute a on a.attrelid=confrelid and a.attnum=x.n order by x.o) parent_columns from pg_constraint where contype='f' and connamespace='public'::regnamespace`;
  for(const fk of fks){const child=fk.child.replace(/^public\./u,''),parent=fk.parent.replace(/^public\./u,'');if(!keys[parent]?.length)continue;
   const join=fk.child_columns.map((c,i)=>`c.${ident(c)}=p.${ident(fk.parent_columns[i])}`).join(' and ');
   const [r]=await tx.unsafe(`select count(*)::int n from public.${ident(child)} c join public.${ident(parent)} p on ${join} where exists(select 1 from jsonb_array_elements(($1::text)::jsonb) k where to_jsonb(p) @> k) and not exists(select 1 from jsonb_array_elements(($2::text)::jsonb) k where to_jsonb(c) @> k)`,[JSON.stringify(keys[parent]),JSON.stringify(keys[child]??[])]);assert.equal(r.n,0,'Foreign reference forbids cleanup');
  }
  await tx`set local session_replication_role=replica`;
  for(const [table,list]of Object.entries(keys)){const keep=new Set((retained[table]??[]).map(k=>JSON.stringify(k))),remove=list.filter(k=>!keep.has(JSON.stringify(k)));if(!remove.length)continue;
   const deleted=await tx.unsafe(`delete from public.${ident(table)} t where exists(select 1 from jsonb_array_elements(($1::text)::jsonb) k where to_jsonb(t) @> k) returning 1`,[JSON.stringify(remove)]);assert.equal(deleted.length,remove.length,'Exact owned cleanup count');
  }
  const after=keyDifference(await keyInventory(tx),manifest.originalKeys);for(const [table,list]of Object.entries(after))assert.deepEqual(list,retained[table]??[],'Unexpected rows after cleanup');
  const finalOriginalProjectionHashes=await projectionHashes(tx,manifest.originalColumns,retained);assert.deepEqual(finalOriginalProjectionHashes,manifest.originalProjectionHashes);
  const preserved={};for(const [table,list]of Object.entries(retained))preserved[table]={count:list.length,keysSha256:hash(list),rowsSha256:hash((rows[table]??[]).filter(r=>list.some(k=>Object.entries(k).every(([n,v])=>r[n]===v))))};
  return{retained,cleanup:{status:'complete',ownBusinessRowsRemaining:0,ownSessionsRemaining:0,foreignReferences:0,preservedAuditAndAnchorHashes:preserved},preservation:{originalColumns:manifest.originalColumns,baselineProjectionHashes:manifest.originalProjectionHashes,finalOriginalProjectionHashes,originalRowsUnchanged:true}};
 });
 assert.deepEqual(await projectionHashes(db,manifest.originalColumns,result.retained),manifest.originalProjectionHashes);delete result.retained;return result;
}
function cliArgs(args){const options={};let mode='rollback';if(args[0]?.startsWith('--')&&['--prepare-applied-fixture','--applied'].includes(args[0]))mode=args.shift().slice(2);for(let i=0;i<args.length;i+=2){assert.ok(['--out','--fixture','--evidence'].includes(args[i])&&args[i+1]&&!options[args[i]]);options[args[i]]=resolve(args[i+1]);}assert.ok(options['--out']);return{mode,options};}
export async function runClassCohortVerification(mode,options){
 const sink=reserveReport(options['--out'],mode==='prepare-applied-fixture'?'class-cohort-fixture-manifest':'class-cohort-sql-evidence',mode),r=sink.report;
 let db,locked=false,manifest,completed=false;
 try{
  r.sqlSourceHashes=classCohortSourceHashes();const target=await assertTarget('protected');db=connect(target);r.defaultIsolation=(await db`show default_transaction_isolation`)[0].default_transaction_isolation;assert.equal(r.defaultIsolation,'read committed');r.targetIdentity=await classCohortTargetIdentity(db,target);
  assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'Fixture lock unavailable');locked=true;
  r.beforeHashes=await allPublicHashes(db);r.beforeFingerprint=await vocationalDatabaseFingerprint(db);r.stage='baseline';sink.save();
  if(options['--fixture']){const e=readEvidence(options['--fixture']);manifest=e.value;assert.equal(manifest.kind,'class-cohort-fixture-manifest');assert.equal(manifest.status,'PASS');assert.deepEqual(manifest.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(manifest.targetIdentity,r.targetIdentity);r.fixtureEvidence={path:options['--fixture'],sha256:e.sha256};}
  if(mode==='prepare-applied-fixture'){
   const prior=readEvidence(options['--evidence']);assert.equal(prior.value.status,'PASS');assert.equal(prior.value.mode,'rollback');assert.equal(prior.value.rollbackRestored,true);assert.deepEqual(prior.value.sqlSourceHashes,r.sqlSourceHashes);assert.deepEqual(prior.value.afterHashes,r.beforeHashes);assert.equal(prior.value.afterFingerprint,r.beforeFingerprint);assert.deepEqual(prior.value.targetIdentity,r.targetIdentity);
   r.evidenceChain={initialRollback:{path:options['--evidence'],sha256:prior.sha256}};r.originalColumns=await catalogColumns(db);r.originalProjectionHashes=await projectionHashes(db,r.originalColumns);r.originalKeys=await keyInventory(db);
   await db.begin(async tx=>{await timeoutSettings(tx);await lockPublicTables(tx);await packageAbsent(tx);assert.deepEqual(await projectionHashes(tx,r.originalColumns),r.originalProjectionHashes);assert.deepEqual(await keyInventory(tx),r.originalKeys);r.fixture=await seedFixture(tx);r.ownedKeys=keyDifference(await keyInventory(tx),r.originalKeys);r.stage='fixture_commit_pending';sink.save();});r.committed=true;r.preparedHashes=await allPublicHashes(db);r.preparedFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(keyDifference(await keyInventory(db),r.originalKeys),r.ownedKeys);
  }else{
   const applied=mode==='applied';if(applied){assert.ok(manifest&&options['--evidence']);const e=readEvidence(options['--evidence']);assert.equal(e.value.status,'PASS');assert.equal(e.value.mode,'--apply');assert.equal(e.value.committed,true);assert.deepEqual(e.value.fixtureEvidence,r.fixtureEvidence);r.evidenceChain={apply:{path:options['--evidence'],sha256:e.sha256},...e.value.evidenceChain};r.installed=await classCohortInstalledState(db);assert.deepEqual(r.installed,e.value.installed);assert.deepEqual(await projectionHashes(db,e.value.originalColumns),e.value.afterProjectionHashes);await appliedDefinitions(db);}else await packageAbsent(db);
   try{await db.begin('isolation level read committed',async tx=>{await timeoutSettings(tx);if(manifest)await restoreContext(tx,manifest.fixture);else await seedFixture(tx);
    if(!applied){const columns=await catalogColumns(tx),before=await projectionHashes(tx,columns);await installPackage(tx);assert.deepEqual(await projectionHashes(tx,columns),before);await assertLegacyProjection(tx);r.migrationPreservesOriginalColumns=true;}
    await matrix(tx,r);throw rollback;
   });}catch(e){if(e!==rollback)throw e;}
   await isolationRegression(db,r,manifest,applied);await legacyRegression(db,r,applied);
   r.afterMatrixHashes=await allPublicHashes(db);assert.deepEqual(r.afterMatrixHashes,r.beforeHashes);assert.equal(await vocationalDatabaseFingerprint(db),r.beforeFingerprint);
   if(applied){r.stage='physical_concurrency';sink.save();r.ownedMutationLedger={keys:structuredClone(manifest.ownedKeys),operations:[]};const ledger={...r.ownedMutationLedger,save:()=>sink.save()};sink.save();try{r.concurrency=await physicalConcurrency(db,target,manifest.fixture,ledger);}finally{r.stage='owned_cleanup';sink.save();Object.assign(r,await cleanupFixture(db,manifest,ledger));}r.installed=await classCohortInstalledState(db);}
   else{r.afterHashes=await allPublicHashes(db);r.afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(r.afterHashes,r.beforeHashes);assert.equal(r.afterFingerprint,r.beforeFingerprint);r.rollbackRestored=true;r.concurrency={status:'NOT_RUN',reason:'requires explicit isolated apply'};}
  }
  r.finalSqlSourceHashes=classCohortSourceHashes();assert.deepEqual(r.finalSqlSourceHashes,r.sqlSourceHashes);completed=true;
 }catch(e){r.failure={code:e.code??'verification_failed',message:e.message,where:e.where,hint:e.hint};}
 finally{
  if(db){try{if(mode==='rollback'){r.afterHashes=await allPublicHashes(db);r.afterFingerprint=await vocationalDatabaseFingerprint(db);r.rollbackRestored=JSON.stringify(r.beforeHashes)===JSON.stringify(r.afterHashes)&&r.beforeFingerprint===r.afterFingerprint;}if(locked)await db`select pg_advisory_unlock(5520)`;await db.end({timeout:5});r.databaseClosed=true;}catch(e){completed=false;r.closeFailure={code:e.code??'close_failed'};}}
  r.status=completed?'PASS':'FAIL';r.stage='finished';r.finishedAt=new Date().toISOString();if(completed)delete r.failureCode;sink.close();
 }
 console.log(`${r.status}: class cohort SQL ${mode}; suites=${Object.keys(r.suites??{}).length}; databaseClosed=${r.databaseClosed===true}`);return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const {mode,options}=cliArgs(process.argv.slice(2));const r=await runClassCohortVerification(mode,options);if(r.status!=='PASS')process.exitCode=1;}catch{console.error('FAIL: class cohort SQL preflight');process.exitCode=1;}
}
