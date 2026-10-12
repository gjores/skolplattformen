#!/usr/bin/env node
// Actual PostgreSQL + independent TypeScript, fresh source, rollback-only vocational flow.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {decisionFixtureSource,decisionBusinessHashes,databaseFingerprint,protectedTables} from './verify-plan-decision-flow.mjs';
import {defaultProgramplanChoiceBlocks} from '../../web/lib/programplan-choice-blocks.ts';
import {programplanTermRows,programplanLevelRanks,suggestProgramplanTerms} from '../../web/lib/programplan-terms.ts';
import {nextCohortStart} from '../../web/lib/programplan-lifecycle.ts';
import {vocationalFixture,vocationalCodes} from './vocational-plan-fixture.mjs';
import {parsePlanDecisionCommand,parsePlanDecisionDetail,parsePlanDecisionInbox} from '../../web/lib/plan-decision.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=v=>createHash('sha256').update(v).digest('hex');
export const migrationName='20261012200000_plan_decision_vocational.sql';
export const sourcePaths=['supabase/migrations/'+migrationName,'supabase/tests/phase5_vocational_plan_decisions.test.sql','web/lib/programplan-profile.ts','web/lib/programplan-table.ts','web/lib/programplan-analysis.ts','web/lib/server/gym-timplan.ts','web/lib/server/plan-decision.ts','work/pilot/vocational-plan-fixture.mjs','work/pilot/verify-vocational-plan-decisions.mjs'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
const ROLLBACK=Error('vocational_rollback');
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
async function loadProjectPlanDecision(){
 const hook=registerHooks({load(url,context,next){
  let source;
  if(url===new URL('../../web/lib/server/db.ts',import.meta.url).href)source='export class Deny extends Error {constructor(code,status){super(code);this.code=code;this.status=status;}}';
  if(url===new URL('../../web/lib/server/authz.ts',import.meta.url).href)source='export class AuditUnavailable extends Error {}';
  if(url===new URL('../../web/lib/server/env.ts',import.meta.url).href)source='export const serverEnv=()=>({});';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
 }});
 try{return (await import('../../web/lib/server/plan-decision.ts')).projectPlanDecision;}finally{hook.deregister();}
}
async function runScenarios(tx, checks, programCode) {
 const projectPlanDecision=await loadProjectPlanDecision();
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
 const [{catalog_id:catalogId}] = await tx`select catalog_id from public.point_plans where id=${id(50)}`;
 const {program,reference,rows,terms,points:profilePoints,hours:profileHours}=vocationalFixture(catalog,programCode,catalogId);
 const preservedLegacy = await tx`select to_jsonb(p) row from public.point_plans p where id=${id(52)}`;
 const preservedLinks = await tx`select to_jsonb(c) row from public.class_timplans c order by to_jsonb(c)::text`;
 await actor('hm');
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
  values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetiskt beslutsflöde','Syntetisk framtida kull',${program.code},${reference.orientationCode})`;
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
 assert.deepEqual(originalDraft.detail.blockers,[]);
 assert.ok(originalDraft.detail.checks.some(c=>c.id==='eligibility'));
 assert.ok(originalDraft.detail.checks.some(c=>c.id==='apl'));
 for(const startedOn of ['2025-06-30','2028-07-02']){
  const source={...originalDraft.raw.source,basisReference:{...reference,startedOn}};
  const dateProfile=(await tx`select public.phase5_plan_decision_profile(${tx.json(source)}) profile`)[0].profile;
  assert.deepEqual(dateProfile,{points:profilePoints,hours:profileHours,vocational:true},'Blocked date must retain vocational review controls');
  const blockers=(await tx`select public.phase5_plan_decision_source_blockers(${tx.json(source)}) blockers`)[0].blockers;
  const detail=await projectPlanDecision({...originalDraft.raw,source,blockers},{kind:'programplan',planId:programId});
  assert.equal(detail.checks.length,4);assert.ok(detail.blockers.length);
  assert.ok(blockers.some(s=>detail.blockers.includes(s)),'SQL blockers survive independent TS projection');
  checks.push({name:'program detail remains readable with blocked vocational date '+startedOn,ok:true});
 }

 for(const checkId of ['eligibility','apl']) await denied(`program ${checkId} cannot be skipped`,sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(originalDraft.detail,'submit',{confirmedChecks:originalDraft.detail.checks.map(c=>c.id).filter(id=>id!==checkId)}))})`,['40001']);
 const untrustedRows={...originalDraft.raw.source,rows:originalDraft.raw.source.rows.filter(r=>!r.key.includes('ENGE2000X'))};
 await denied('source with missing eligibility level cannot create timplan',sub=>sub`select public.phase5_gym_timplan_require_source(${sub.json(untrustedRows)})`,['40001']);

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
 const returnedOrganizer=await basis('programplan',programId);
 await denied('organizer cannot approve returned program before new submission',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(returnedOrganizer.detail,'approve'))})`,['42501']);
 await ok('organizer waits while returned program needs rector correction',async()=>{
  const inbox=parsePlanDecisionInbox((await tx`select public.phase5_plan_decision_inbox() result`)[0].result);
  const item=inbox.items.find(item=>item.planId===programId);
  assert.equal(item.task,'waiting');assert.equal(item.nextActor,'rektor');
 });
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
 for(const checkId of ['eligibility','apl']) await denied(`timplan ${checkId} cannot be skipped`,sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'submit',{confirmedChecks:b.detail.checks.map(c=>c.id).filter(id=>id!==checkId)}))})`,['40001']);
 // Exact guaranteed-hour boundary, preserving all active cells and canonical source.
 await actor('principal');
 const boundaryRow=rows.find(row=>row.points>=100), boundaryTerms=terms.find(t=>t.rowKey===boundaryRow.key).points;
 const boundaryHours=boundaryTerms.map(p=>p>0?p:null);
 let reduction=profilePoints-profileHours+1;
 for(let n=0;n<6;n++)if(boundaryHours[n]!==null&&reduction){const reduce=Math.min(boundaryHours[n]-1,reduction);boundaryHours[n]-=reduce;reduction-=reduce;}
 assert.equal(reduction,0,'Boundary test row too short');
 await tx`select public.phase5_write_gym_timplan_row(${gymId},${b.detail.revision},${boundaryRow.key},${tx.json(boundaryHours)})`;
 b=await basis('timplan',gymId);
 assert.ok(b.detail.blockers.some(s=>s.includes('undervisningstimmar')));
 await denied('one hour below vocational guarantee cannot submit',sub=>sub`select public.phase5_plan_decision_command(${sub.json(command(b.detail,'submit'))})`,['40001']);
 const firstActive=boundaryHours.findIndex(h=>h!==null);boundaryHours[firstActive]++;
 await tx`select public.phase5_write_gym_timplan_row(${gymId},${b.detail.revision},${boundaryRow.key},${tx.json(boundaryHours)})`;
 await actor('admin'); b=await basis('timplan',gymId);
 assert.deepEqual(b.detail.blockers,[],'Exact guaranteed vocational hours should pass');

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

async function oldReceiptProof(tx,checks,migration){
 const f=await fixture(tx,randomUUID().slice(0,8));
 const catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const program=catalog.programs.find(p=>p.code==='SA25'&&p.version===4);
 const [{catalog_id:catalogId}]=await tx`select catalog_id from public.point_plans where id=${f.id(50)}`;
 const reference={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),
  specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};
 await f.actor('hm');
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(${f.id(46)},${f.id(2)},${f.id(30)},'gymnasium','Syntetiskt äldre beslut','Syntetisk framtida kull','SA25','SABEP')`;
 await f.actor('principal');
 const p=(await tx`select public.phase5_create_programplan_draft(${f.id(46)},0,${tx.json(reference)}) result`)[0].result;
 const terms=suggestProgramplanTerms(programplanTermRows(program,reference),[],programplanLevelRanks(program));
 await tx`select public.phase5_write_programplan_terms(${p.id},${p.revision},${tx.json(terms)})`;
 const basis=(await tx`select public.phase5_plan_decision_basis('programplan',${p.id}) result`)[0].result;
 const command={kind:'programplan',planId:p.id,commandId:randomUUID(),action:'submit',expectedRevision:basis.revision,expectedDecisionRevision:basis.decisionRevision,basisHash:basis.basisHash,comment:'',confirmedChecks:basis.checks.map(c=>c.id)};
 const reply=(await tx`select public.phase5_plan_decision_command(${tx.json(command)}) result`)[0].result;
 await tx.unsafe(migration);
 const replay=(await tx`select public.phase5_plan_decision_command(${tx.json(command)}) result`)[0].result;
 assert.deepEqual(replay,reply,'New rules must preserve old receipt replay exactly');
 const projected=await (await loadProjectPlanDecision())(replay,{kind:'programplan',planId:p.id});
 assert.deepEqual(projected.blockers,[]);assert.equal(projected.stage,'submitted');assert.equal(projected.checks.length,2);
 const updated=(await tx`select public.phase5_plan_decision_basis('programplan',${p.id}) result`)[0].result;
 assert.notEqual(updated.basisHash,basis.basisHash);
 assert.equal(updated.checks.length,2);
 let denied=false;try{await tx.savepoint(sub=>sub`select public.phase5_plan_decision_command(${sub.json({...command,action:'withdraw',commandId:randomUUID()})})`);}catch(e){assert.equal(e.code,'40001');denied=true;}assert.ok(denied);
 checks.push({name:'pre-migration HE receipt replays exactly while new stale command is refused',ok:true});
}

async function main(){
 const args=process.argv.slice(2);assert.ok(args.length===3&&args[0]==='--verify'&&args[1]==='--out');
 const out=resolve(args[2]);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));
 const sources=sourceHashes(),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const tables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits'];
 const checks=[];let before,after,beforeFingerprint,afterFingerprint,failure;
 try{
  before=await decisionBusinessHashes(db,tables);beforeFingerprint=await databaseFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true,'REFUSED: fixture lock held');
   const migration=readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8');
   await tx.savepoint(async sub=>{await oldReceiptProof(sub,checks,migration);throw ROLLBACK;}).catch(e=>{if(e!==ROLLBACK)throw e;});
   await tx.unsafe(migration);
   await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_vocational_plan_decisions.test.sql'),'utf8'));
   checks.push({name:'SQL frozen national profile and closed helper contract',ok:true});
   // Every national vocational profile plus unchanged HE profile, fully frozen source.
   const catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
   await tx.savepoint(async tx=>{
   const own=await fixture(tx,randomUUID().slice(0,8));
   const [{catalog_id:catalogId}]=await tx`select catalog_id from public.point_plans where id=${own.id(50)}`;
   for(const code of vocationalCodes){
    const f=vocationalFixture(catalog,code,catalogId),source={catalogId,basisReference:f.reference,rows:f.rows.map(({key,points})=>({key,points})),distribution:f.terms,status:'utkast',archived:false};
    const profile=(await tx`select public.phase5_plan_decision_profile(${tx.json(source)}) profile`)[0].profile;
    assert.deepEqual(profile,{points:f.points,hours:f.hours,vocational:true});
    await tx`select public.phase5_gym_timplan_require_source(${tx.json(source)})`;
    const nextRules={...source,basisReference:{...f.reference,startedOn:'2028-07-02'}};
    assert.ok((await tx`select public.phase5_plan_decision_source_blockers(${tx.json(nextRules)}) blockers`)[0].blockers.some(s=>s.includes('yrkesprov')));
    checks.push({name:code+' exact frame, complete creation source and 2028 decision boundary',ok:true});
   }
   throw ROLLBACK;
   }).catch(e=>{if(e!==ROLLBACK)throw e;});
   for(const code of ['BF25','BA25']){
    console.log('Verifying complete synthetic '+code+' return/decision chain');
    await tx.savepoint(async sub=>{await runScenarios(sub,checks,code);throw ROLLBACK;}).catch(e=>{if(e!==ROLLBACK)throw e;});
   }
   throw ROLLBACK;
  });}catch(e){if(e!==ROLLBACK)failure=e;}
  after=await decisionBusinessHashes(db,tables);afterFingerprint=await databaseFingerprint(db);
  checks.push({name:'15 original plus four decision tables preserved completely',ok:JSON.stringify(before)===JSON.stringify(after)});
  checks.push({name:'DDL ACL policies triggers and journal restored',ok:beforeFingerprint===afterFingerprint});
 }finally{await db.end({timeout:5});}
 const finalSources=sourceHashes();checks.push({name:'exact source unchanged during proof',ok:JSON.stringify(sources)===JSON.stringify(finalSources)});
 const report={kind:'vocational-plan-decisions-rollback',status:!failure&&checks.every(c=>c.ok)?'PASS':'FAIL',target:'protected',rollback:true,scope:'local-synthetic-only',apiVerified:false,
  sourceHashes:sources,finalSourceHashes:finalSources,beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,checks,
  failure:failure?{code:failure.code??'ASSERTION',message:failure.message?.split('\n')[0],location:failure.stack?.split('\n').find(l=>l.includes('verify-vocational-plan-decisions.mjs:'))}:null};
 const evidence=JSON.stringify(report,null,2)+'\n';writeFileSync(out,evidence,{mode:0o600});if(failure)writeFileSync(out.replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence,{mode:0o600});
 console.log(`${report.status}: ${checks.filter(c=>c.ok).length}/${checks.length} vocational SQL/TS checks; rollback only.`);if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:'FAIL: vocational verifier preflight');process.exitCode=1;});
