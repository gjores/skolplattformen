#!/usr/bin/env node
// Actual PostgreSQL decisions in one rollback-only connection. No HTTP/MFA claim.
// Original complete business rows, ACLs, functions and journal are hashed before/after.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertTarget } from './verify-target.mjs';
import { extractProgramplanFixture } from './verify-programplan-locks.mjs';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { parsePlanDecisionCommand, parsePlanDecisionDetail, parsePlanDecisionInbox } from '../../web/lib/plan-decision.ts';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const ENTRYPOINTS = ['public.phase5_plan_decision_basis(text,uuid)', 'public.phase5_plan_decision_command(jsonb)', 'public.phase5_plan_decision_inbox()'];
const ROLLBACK = new Error('decision_verification_rollback');
export const protectedTables = ['offerings','offering_units','point_plans','point_plan_events','timplans','timplan_cells','timplan_events',
 'class_timplans','school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages','gym_timplan_receipts','programplan_education_receipts'];
const quote = name => '"' + name.replaceAll('"','""') + '"';

export async function decisionBusinessHashes(db, tables, projectNewColumns = false) {
 const result = {};
 for (const table of tables) {
  const value = `to_jsonb(r)${projectNewColumns&&['point_plans','timplans'].includes(table)?" - 'decided_identity_id'":''}`;
  // Hash each complete row first: keep evidence exact without assembling a
  // huge JSON array of the append-only security log in PostgreSQL memory.
  const [row] = await db.unsafe(`select count(*)::integer count, encode(sha256(convert_to(coalesce(string_agg(h,'' order by h),''),'UTF8')),'hex') hash from (select encode(sha256(convert_to((${value})::text,'UTF8')),'hex') h from public.${quote(table)} r) full_rows`);
  result[table] = row;
 }
 return result;
}
export async function databaseFingerprint(db, excludeDefinitions = []) {
 const functions = await db`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`;
 const tables = await db`select c.relname,c.relacl::text acl,c.relowner::text owner,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.relname`;
 const triggers = await db`select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by c.relname,t.tgname`;
 const policies = await db`select * from pg_policies where schemaname='public' order by tablename,policyname`;
 const journal = await db`select to_jsonb(m) row from supabase_migrations.schema_migrations m order by version`;
 return sha({functions:functions.map(f=>excludeDefinitions.includes(f.signature)?{...f,definition:'<verified replacement>'}:f),tables,triggers,policies,journal});
}
export function decisionFixtureSource(prefix, foreign = false) {
 let source = extractProgramplanFixture(readFileSync(resolve(root,'supabase/tests/phase5_programplan_drafts.test.sql'),'utf8'),prefix);
 // No fixture helper disables audit. Its only replication-mode use inserts one
 // explicitly synthetic legacy event; remove that compatibility setup entirely.
 source = source.replace(/-- Only this synthetic legacy row[\s\S]*?set local session_replication_role=origin;/u, '');
 assert.ok(!/session_replication_role|\b(?:commit|rollback|truncate|grant|revoke)\s/iu.test(source));
 if (foreign) source = source.replaceAll('programplan_actor','foreign_actor').replaceAll('programplan_reference','foreign_reference').replaceAll('programplan_roles','foreign_roles');
 return source;
}
async function checkEntrypoints(tx) {
 const acl = [];
 for (const signature of ENTRYPOINTS) {
  const [row] = await tx`select p.oid::regprocedure::text signature,p.proacl::text acl,
   has_function_privilege('skolplattform_worker',p.oid,'execute') worker,
   has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,
   exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public
   from pg_proc p where p.oid=to_regprocedure(${signature})`;
  assert.ok(row, `Missing exact entrypoint ${signature}`);
  assert.ok(!row.public && !row.anon && !row.authenticated, 'Decision entrypoint open to client');
  acl.push(row);
 }
 assert.ok(acl.every(r=>r.worker) || acl.every(r=>!r.worker), 'Partial Worker decision grant');
 return acl;
}
async function fixture(tx, prefix, foreign = false) {
 const id = n => `${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 assert.equal((await tx`select id from public.customers where id=${id(1)}`).length,0,'Fixture ID collision');
 await tx.unsafe(decisionFixtureSource(prefix,foreign));
 const roles = Object.fromEntries((await tx.unsafe(`select name,id from ${foreign ? 'foreign_roles' : 'programplan_roles'}`)).map(r=>[r.name,r.id]));
 const actor = async name => {
  const numbers = {hm:[10,20,80],principal:[11,21,81],principal2:[12,22,82],admin:[13,23,83]};
  const [identity,membership,session] = numbers[name];
  const settings = {customer_id:id(1),organizer_id:id(2),identity_id:id(identity),membership_id:id(membership),session_id:id(session),assignment_id:roles[name],correlation_id:randomUUID()};
  for (const [key,value] of Object.entries(settings)) await tx`select set_config(${`app.${key}`},${value},true)`;
 };
 await actor('hm');
 await tx`insert into public.school_unit_types(unit_id,school_type) values(${id(30)},'GY'),(${id(31)},'GY')`;
 return {id,roles,actor};
}
async function runScenarios(tx, checks) {
 // Real TS projection over real SQL results. Only platform dependencies are
 // stubbed; no source, catalog, analysis, decision or database data is mocked.
 const hook=registerHooks({load(url,context,next){
  let source;
  if(url===new URL('../../web/lib/server/db.ts',import.meta.url).href)source='export class Deny extends Error {constructor(code,status){super(code);this.code=code;this.status=status;}}';
  if(url===new URL('../../web/lib/server/authz.ts',import.meta.url).href)source='export class AuditUnavailable extends Error {}';
  if(url===new URL('../../web/lib/server/env.ts',import.meta.url).href)source='export const serverEnv=()=>({});';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
 }});
 let projectPlanDecision;
 try {({projectPlanDecision}=await import('../../web/lib/server/plan-decision.ts'));} finally {hook.deregister();}
 let projections=0;
 const ok = (name, callback) => Promise.resolve().then(callback).then(()=>checks.push({name,ok:true}));
 const denied = async (name, run, codes = ['42501','40001','22023','55000']) => {
  let caught;
  try { await tx.savepoint(run); } catch (error) { caught=error; }
  assert.ok(caught, `${name}: mutation unexpectedly succeeded`);
  assert.ok(codes.includes(caught.code), `${name}: unexpected SQLSTATE ${caught.code ?? 'none'}${caught.code==='42P01'?` (${caught.message})`:''}`);
  checks.push({name,ok:true,sqlstate:caught.code});
 };
 const own = await fixture(tx,randomUUID().slice(0,8)), foreign = await fixture(tx,randomUUID().slice(0,8),true);
 const {id,actor} = own;
 const catalog = JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const program = catalog.programs.find(p=>p.code==='SA25'&&p.version===4);
 assert.ok(program,'Pinned SA25 version missing');
 const [{catalog_id:catalogId}] = await tx`select catalog_id from public.point_plans where id=${id(50)}`;
 const reference = {catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),
  specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],
  choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};
 const rows = programplanTermRows(program,reference);
 const terms = suggestProgramplanTerms(rows,[],programplanLevelRanks(program));
 const preservedLegacy = await tx`select to_jsonb(p) row from public.point_plans p where id=${id(52)}`;
 const preservedLinks = await tx`select to_jsonb(c) row from public.class_timplans c order by to_jsonb(c)::text`;
 await actor('hm');
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
  values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetiskt beslutsflöde','Syntetisk framtida kull','SA25','SABEP')`;
 const created = (await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) result`)[0].result;
 const programId = created.id;
 await actor('principal');
 await tx`select public.phase5_write_programplan_terms(${programId},${created.revision},${tx.json(terms)})`;
 const basis = async (kind,planId) => {
  const raw = (await tx`select public.phase5_plan_decision_basis(${kind},${planId}) result`)[0].result;
  const {source: _source,catalog: _catalog,hours: _hours,...projection}=raw;
  const sqlDetail = parsePlanDecisionDetail(projection,{kind,planId});
  const detail = await projectPlanDecision(raw,{kind,planId});
  assert.equal(detail.basisHash,sqlDetail.basisHash);assert.equal(detail.revision,sqlDetail.revision);
  projections++;
  return {raw,detail};
 };
 const command = (detail,action,extra={}) => parsePlanDecisionCommand({kind:detail.kind,planId:detail.planId,commandId:randomUUID(),action,
  expectedRevision:detail.revision,expectedDecisionRevision:detail.decisionRevision,basisHash:detail.basisHash,
  comment:action==='return'?'Komplettera den syntetiska fördelningen.':'',confirmedChecks:detail.checks.map(c=>c.id),...extra});
 const send = async input => (await tx`select public.phase5_plan_decision_command(${tx.json(input)}) result`)[0].result;
 const stage = async (kind,planId,expected) => {const b=await basis(kind,planId);assert.equal(b.detail.stage,expected);return b;};
 const originalDraft = await basis('programplan',programId);
 assert.ok(originalDraft.detail.actions.includes('submit'),'Rector should prepare programplan');
 const gym = (await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${originalDraft.detail.revision},0,${id(30)},null,null) result`)[0].result;
 const gymId = gym.reply.id;
 assert.equal(gym.plan.source.status,'utkast');
 const gymSnapshot = (await tx`select gym_basis from public.timplans where id=${gymId}`)[0].gym_basis;
 const incompleteTime = await basis('timplan',gymId);
 assert.ok(incompleteTime.detail.blockers.some(s=>s.includes('fastställa')),'Unapproved source must block timplan');
 await denied('timplan cannot submit before source approval',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(incompleteTime.detail,'submit'))})`,['40001']);
 await denied('required program checks cannot be skipped',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(originalDraft.detail,'submit',{confirmedChecks:[]}))})`,['40001']);
 await actor('admin');
 await denied('administrator cannot submit programplan',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(originalDraft.detail,'submit'))})`);
 await foreign.actor('hm');
 await denied('other customer cannot read decision basis',sub=>sub`select public.phase5_plan_decision_basis('programplan',${programId})`,['42501']);
 await actor('principal');
 await denied('other school cannot read decision basis',sub=>sub`select public.phase5_plan_decision_basis('programplan',${id(53)})`,['42501']);
 const firstCommand = command(originalDraft.detail,'submit');
 await ok('rector submits programplan',async()=>{await send(firstCommand);await stage('programplan',programId,'submitted');});
 const snapshotAfterSubmit = await decisionBusinessHashes(tx,['point_plans','point_plan_events']);
 await ok('same command is idempotent',async()=>{await send(firstCommand);assert.deepEqual(await decisionBusinessHashes(tx,['point_plans','point_plan_events']),snapshotAfterSubmit);});
 await denied('command key reuse with different body fails',sub=>sub`select public.phase5_plan_decision_command(${sub.json({...firstCommand,comment:'changed key payload'})})`,['40001','22023']);
 await denied('stale second tab cannot withdraw changed review',sub=>sub`select public.phase5_plan_decision_command(${sub.json({...firstCommand,commandId:randomUUID(),action:'withdraw'})})`,['40001']);
 let b = await basis('programplan',programId);
 await denied('submitted programplan content is locked',sub=>sub`select public.phase5_write_programplan_terms(${programId},${b.detail.revision},${sub.json(terms)})`);
 await denied('rector cannot approve programplan',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'approve'))})`,['42501']);
 await actor('hm'); b=await basis('programplan',programId);
 await denied('return requires reason on SQL boundary',sub=>sub`select public.phase5_plan_decision_command(${sub.json({...command(b.detail,'return'),comment:''})})`,['22023']);
 await ok('head organizer returns with reason',async()=>{await send(command(b.detail,'return'));await stage('programplan',programId,'returned');});
 await actor('principal'); b=await basis('programplan',programId);
 await tx`select public.phase5_write_programplan_terms(${programId},${b.detail.revision},${tx.json(terms)})`;
 b=await basis('programplan',programId);
 await ok('returned programplan can be saved and resubmitted',async()=>{await send(command(b.detail,'submit'));await stage('programplan',programId,'submitted');});
 await actor('hm'); b=await basis('programplan',programId);
 await ok('head organizer approves programplan',async()=>{await send(command(b.detail,'approve'));await stage('programplan',programId,'approved');});
 b=await basis('programplan',programId);
 await denied('approved programplan remains locked',sub=>sub`select public.phase5_write_programplan_terms(${programId},${b.detail.revision},${sub.json(terms)})`);
 assert.deepEqual((await tx`select gym_basis from public.timplans where id=${gymId}`)[0].gym_basis,gymSnapshot,'Program decision must not rewrite frozen timplan source');
 await actor('principal');
 let gymRevision=0;
 for(const row of rows) {
  const distribution=terms.find(t=>t.rowKey===row.key).points;
  const hours=distribution.map(p=>p>0?p:null);
  const changed=(await tx`select public.phase5_write_gym_timplan_row(${gymId},${gymRevision},${row.key},${tx.json(hours)}) result`)[0].result;
  gymRevision=changed.revision;
 }
 await actor('admin'); b=await basis('timplan',gymId);
 await denied('required teaching checks cannot be skipped',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'submit',{confirmedChecks:[]}))})`,['40001']);
 await ok('same-content approved source accepts old frozen draft status',async()=>{assert.equal(b.detail.blockers.length,0);await send(command(b.detail,'submit'));await stage('timplan',gymId,'submitted');});
 b=await basis('timplan',gymId);
 const firstRow=rows[0], firstHours=terms.find(t=>t.rowKey===firstRow.key).points.map(p=>p>0?p:null);
 await denied('submitted timplan hours are locked',sub=>sub`select public.phase5_write_gym_timplan_row(${gymId},${b.detail.revision},${firstRow.key},${sub.json(firstHours)})`);
 await denied('administrator cannot approve timplan',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'approve'))})`,['42501']);
 await actor('hm'); b=await basis('timplan',gymId);
 await ok('head organizer returns timplan with reason',async()=>{await send(command(b.detail,'return'));await stage('timplan',gymId,'returned');});
 await actor('principal'); b=await basis('timplan',gymId);
 const revisedHours=firstHours.map(h=>h===null?null:h+1);
 await tx`select public.phase5_write_gym_timplan_row(${gymId},${b.detail.revision},${firstRow.key},${tx.json(revisedHours)})`;
 b=await basis('timplan',gymId);
 await ok('rector edits and resubmits timplan',async()=>{await send(command(b.detail,'submit'));await stage('timplan',gymId,'submitted');});
 await actor('hm'); b=await basis('timplan',gymId);
 const evidenceTables=['timplans','timplan_cells','timplan_events','plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
 const beforeFailure=await decisionBusinessHashes(tx,evidenceTables);
 // Customer- and object-scoped failure injection, never disable the audit path.
 await tx.unsafe(`create function pg_temp.plan_decision_fail_audit() returns trigger language plpgsql as $$begin
  if new.customer_id='${id(1)}'::uuid and new.object_id='${gymId}'::uuid and new.outcome='ok' then
   raise exception 'Synthetic decision audit failure' using errcode='P0001'; end if;return new;end$$;
  create trigger synthetic_decision_audit_failure before insert on public.security_events for each row execute function pg_temp.plan_decision_fail_audit();`);
 await denied('audit failure rolls back approval',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'approve'))})`,['55000']);
 await tx`drop trigger synthetic_decision_audit_failure on public.security_events`;
 await ok('failed approval leaves plan, hours, review, history, receipts and permits exact',async()=>assert.deepEqual(await decisionBusinessHashes(tx,evidenceTables),beforeFailure));
 await ok('head organizer approves timplan',async()=>{await send(command(b.detail,'approve'));await stage('timplan',gymId,'approved');});
 b=await basis('timplan',gymId);
 await denied('approved timplan hours remain locked',sub=>sub`select public.phase5_write_gym_timplan_row(${gymId},${b.detail.revision},${firstRow.key},${sub.json(firstHours)})`);
 await ok('legacy decided version and original class links preserved',async()=>{
  assert.deepEqual(await tx`select to_jsonb(p) row from public.point_plans p where id=${id(52)}`,preservedLegacy);
  assert.deepEqual(await tx`select to_jsonb(c) row from public.class_timplans c order by to_jsonb(c)::text`,preservedLinks);
 });
 await ok('decision inbox parses against exact contract',async()=>{parsePlanDecisionInbox((await tx`select public.phase5_plan_decision_inbox() result`)[0].result);});
 await ok('full immutable decision histories record both return cycles',async()=>{
  for(const [kind,planId] of [['programplan',programId],['timplan',gymId]]) {
   const events=await tx`select action,actor_identity_id,assignment_id,comment,confirmed_checks from public.plan_decision_history where kind=${kind} and plan_id=${planId} order by occurred_at,id`;
   assert.deepEqual(events.map(e=>e.action),['submit','return','submit','approve']);
   assert.ok(events.every(e=>e.actor_identity_id&&e.assignment_id));
   assert.ok(events.find(e=>e.action==='return').comment.trim());
  }
 });
 await denied('decision history is immutable',sub=>sub`update public.plan_decision_history set comment='tampered' where plan_id=${gymId}`,['42501']);
 await denied('decision receipts are immutable',sub=>sub`update public.plan_decision_receipts set result='{}'::jsonb where plan_id=${gymId}`,['42501']);
 await tx`set constraints all immediate`;
 checks.push({name:'independent TypeScript projection accepts actual scoped SQL outputs',ok:projections>20,projections});
 return {programFlow:['draft','submitted','returned','submitted','approved'],timplanFlow:['draft','submitted','returned','submitted','approved'],ownCustomerCount:2};
}

async function main() {
 const args=process.argv.slice(2),withRepair=args.includes('--repair-in-rollback');
 if(withRepair)args.splice(args.indexOf('--repair-in-rollback'),1);
 assert.ok(args.length===3&&args[0]==='--verify'&&args[1]==='--out','Usage: --verify --out /private/tmp/<evidence>.json');
 const output=resolve(args[2]);assert.ok(output.startsWith('/private/tmp/')&&output.endsWith('.json'));
 const repairName='20261012180100_plan_decision_command_fix.sql';
 const repair=withRepair?readFileSync(resolve(root,'supabase/migrations',repairName),'utf8'):null;
 const target=await assertTarget('protected');
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let before,after,beforeFingerprint,afterFingerprint,acl,flow,failure;
 const checks=[];
 try {
  const present=(await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename);
  const tables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
  assert.ok(tables.every(t=>present.includes(t)),'Expected preservation table missing');
  before=await decisionBusinessHashes(db,tables);beforeFingerprint=await databaseFingerprint(db);
  try {await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;
   await tx`set local statement_timeout='30s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: another local verification owns the fixture lock');
   acl=await checkEntrypoints(tx);
   if(repair)await tx.unsafe(repair);
   flow=await runScenarios(tx,checks);
   throw ROLLBACK;
  });} catch(error) {if(error!==ROLLBACK)failure=error;}
  after=await decisionBusinessHashes(db,tables);afterFingerprint=await databaseFingerprint(db);
  checks.push({name:'15 original business tables and four decision tables restored with complete rows/timestamps',ok:JSON.stringify(before)===JSON.stringify(after)});
  checks.push({name:'function definitions, table/function ACL, policies, triggers and migration journal restored',ok:beforeFingerprint===afterFingerprint});
 } finally {await db.end({timeout:5});}
 const report={kind:'plan-decision-flow-rollback',status:!failure&&checks.every(c=>c.ok)?'PASS':'FAIL',target:'protected',scope:'local-synthetic-only',rollback:true,reset:false,
  apiVerified:false,mfaVerified:false,concurrentConnectionsVerified:false,sourceHash:sha(readFileSync(fileURLToPath(import.meta.url),'utf8')),
  repairInRollback:withRepair,repairName:repair?repairName:null,repairHash:repair?sha(repair):null,
  checks,flow,entrypoints:acl,beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,
  failure:failure?{code:typeof failure.code==='string'?failure.code:'ASSERTION',message:failure.code&&failure.code!=='ERR_ASSERTION'?'SQL operation failed':String(failure.message).split('\n')[0].slice(0,300),location:failure.stack?.split('\n').find(line=>line.includes('verify-plan-decision-flow.mjs:'))?.trim()}:null};
 const evidence=JSON.stringify(report,null,2)+'\n';writeFileSync(output,evidence,{mode:0o600});
 if(report.status==='FAIL')writeFileSync(output.replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${report.status}: ${checks.filter(c=>c.ok).length}/${checks.length} checks; rollback-only; HTTP/MFA not tested.`);
 if(failure)console.log(`Failed after ${checks.length-2} scenario checks: ${report.failure.code}`);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{console.error(error.message?.startsWith('REFUSED')?error.message:'FAIL: decision verifier preflight');process.exitCode=1;});
