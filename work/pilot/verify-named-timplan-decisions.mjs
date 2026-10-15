#!/usr/bin/env node
// Private schema-only fixture database. No writes or row export on the user's target.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNamedTimplanSnapshot} from './named-timplan-snapshot.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {approvedClassFixture,classTimplanScenarios} from './verify-class-timplans.mjs';
import {namedSeriesSources} from './verify-named-timplan-series.mjs';
import {parseNamedTimplanCreateReply,parseNamedTimplanRenameReply} from '../../web/lib/named-timplan.ts';
import {parsePlanDecisionDetail,parsePlanDecisionInbox,parsePlanDecisionPage} from '../../web/lib/plan-decision.ts';

const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('named_decision_rollback');
export const migrations=['20261015200000_named_timplan_series.sql','20261015201000_named_timplan_commands.sql','20261015202000_named_timplan_decisions.sql'];
const test='supabase/tests/phase5_named_timplan_decisions.test.sql';
function sources(){return {...namedSeriesSources(),...Object.fromEntries([
 ...migrations.map(p=>'supabase/migrations/'+p),'supabase/migrations/20261015204000_worker_named_timplans.sql',test,'work/pilot/verify-named-timplan-decisions.mjs','web/lib/plan-decision.ts',
].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]))};}
async function install(tx){await tx`set constraints all immediate`;for(const file of migrations)await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));await tx`set constraints all deferred`;}
async function projected(tx,tables){const result={};for(const table of tables){assert.match(table,/^[a-z_][a-z0-9_]*$/u);const subtract=table==='timplans'?"-'series_id'-'name_at_creation'":table==='plan_decision_history'?"-'name_at_decision'":'';[result[table]]=await tx.unsafe(`select count(*)::integer count,md5(coalesce(string_agg(r::text,'' order by r::text),'')) hash from (select to_jsonb(x)${subtract} r from public.${table} x) d`);}return result;}
async function matrix(tx,checks){
 const f=await approvedClassFixture(tx,'SA25'),{actor,planId,programId,id,year}=f;
 const tables=Object.keys(await allPublicHashes(tx)),before=await projected(tx,tables);
 const oldReceipts=await tx`select request,result from public.plan_decision_receipts where plan_id=${planId} order by command_id`;
 const oldHistory=await tx`select to_jsonb(h) r from public.plan_decision_history h where plan_id=${planId} order by id`;
 await install(tx);assert.deepEqual(await projected(tx,tables),before);
 const ok=name=>checks.push({name,ok:true});ok('02/03/04 preserve every old column across all synthetic public tables');
 const deny=async(name,fn,code)=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}assert.equal(error?.code,code,name);ok(name);};
 await tx.unsafe(readFileSync(resolve(root,test),'utf8'));checks.push(...(await tx`select name from named_decision_checks order by name`).map(r=>({name:r.name,ok:true})));
 const plan=async pid=>(await tx`select * from public.timplans where id=${pid}`)[0];
 const basis=async pid=>{const raw=(await tx`select public.phase5_plan_decision_basis('timplan',${pid}) r`)[0].r;const {source:_s,catalog:_c,hours:_h,...detail}=raw;return parsePlanDecisionDetail(detail,{kind:'timplan',planId:pid});};
 const command=async q=>(await tx`select public.phase5_plan_decision_command(${tx.json(q)}) r`)[0].r;
 const reviewed=async(pid,action,comment='')=>{const b=await basis(pid);return{kind:'timplan',planId:pid,commandId:randomUUID(),action,expectedRevision:b.revision,expectedDecisionRevision:b.decisionRevision,basisHash:b.basisHash,comment,confirmedChecks:b.checks.map(c=>c.id)};};
 const decision=async(pid,action,comment='')=>command(await reviewed(pid,action,comment));
 const create=async(name,copyFromPlanId=planId)=>{const p=(await tx`select revision from public.point_plans where id=${programId}`)[0];const q={commandId:randomUUID(),sourcePlanId:programId,expectedSourceRevision:p.revision,expectedEducationRevision:0,unitId:id(30),name,copyFromPlanId,expectedCopyFromRevision:copyFromPlanId?(await plan(copyFromPlanId)).revision:null};const raw=(await tx`select public.phase5_named_timplan_create(${tx.json(q)}) r`)[0].r;return{q,reply:parseNamedTimplanCreateReply(raw.reply,q)};};
 const rename=async(pid,name)=>{const p=await plan(pid),s=(await tx`select * from public.timplan_series where id=${p.series_id}`)[0];const q={commandId:randomUUID(),planId:pid,seriesId:s.id,expectedSeriesRevision:s.revision,name};return parseNamedTimplanRenameReply((await tx`select public.phase5_named_timplan_rename(${tx.json(q)}) r`)[0].r,q);};
 const original=await plan(planId),b=await create('Utökad matematik');
 assert.equal(b.reply.version,1);assert.notEqual(b.reply.series.id,original.series_id);
 assert.equal((await plan(planId)).status,'faststalld');ok('new B1 shares source but has independent series and leaves A1 approved');
 const cellsA=await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${planId} order by row_id`;
 const cell=(await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${b.reply.id} and row_id ilike '%mate%' order by row_id limit 1`)[0];
 assert.ok(cell,'Mathematics fixture row exists');const hours=cell.hours.map((v,n)=>cell.allocated[n]?v:null),active=cell.allocated.indexOf(true);hours[active]+=40;
 await tx`select public.phase5_write_gym_timplan_row(${b.reply.id},0,${cell.row_id},${tx.json(hours)})`;
 assert.deepEqual(await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${planId} order by row_id`,cellsA);
 assert.equal((await plan(b.reply.id)).gym_basis.rows.reduce((n,r)=>n+r.points,0),2500);ok('B gains 40 mathematics hours without changing A cells or source points');
 await decision(b.reply.id,'submit');await actor('hm');await decision(b.reply.id,'return','Förtydliga fördelningen');await actor('principal');
 await decision(b.reply.id,'submit');await decision(b.reply.id,'withdraw');await decision(b.reply.id,'submit');
 await actor('hm');const stale=await reviewed(b.reply.id,'approve');await actor('principal');await rename(b.reply.id,'Utökad matematik – B');await actor('hm');
 await deny('rename invalidates previously reviewed decision hash',s=>s`select public.phase5_plan_decision_command(${s.json(stale)})`,'40001');
 const approved=await decision(b.reply.id,'approve');assert.equal(approved.series.name,'Utökad matematik – B');
 assert.equal((await plan(planId)).status,'faststalld');assert.equal((await plan(b.reply.id)).status,'faststalld');ok('A1 and B1 approved simultaneously after independent full lifecycle');
 const bHistory=await tx`select to_jsonb(h) r from public.plan_decision_history h where plan_id=${b.reply.id} order by id`;
 assert.ok(bHistory.some(h=>h.r.action==='approve'&&h.r.name_at_decision==='Utökad matematik – B'));
 await actor('principal');await rename(b.reply.id,'B-klassens matematik');
 assert.deepEqual(await tx`select to_jsonb(h) r from public.plan_decision_history h where plan_id=${b.reply.id} order by id`,bHistory);ok('renaming approved series preserves historical decision names and hashes');
 const classCommand=async q=>(await tx`select public.phase5_class_command(${tx.json(q)}) r`)[0].r;
 for(const [name,pid]of [['SERIE A',planId],['SERIE B',b.reply.id]]){const p=await plan(pid);const c=await classCommand({operation:'create',commandId:randomUUID(),planId:pid,expectedPlanRevision:p.revision,name,startYear:year});for(const [y,columnId]of [[year,'ar1'],[year+1,'ar2']])await classCommand({operation:'link',commandId:randomUUID(),classId:c.id,schoolYear:y,planId:pid,expectedPlanRevision:p.revision,columnId,expectedLinkRevision:null,previousPlanId:null});}
 const links=await tx`select to_jsonb(c) r from public.class_timplans c order by unit_id,class_name,start_year`;
 const unchangedB=await plan(b.reply.id),bCells=await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${b.reply.id} order by row_id`;
 const sourceRevision=(await tx`select revision from public.point_plans where id=${programId}`)[0].revision;
 const a2=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${sourceRevision},0,${id(30)},${planId},${original.revision}) r`)[0].r.reply;
 assert.equal(a2.version,2);assert.equal((await plan(a2.id)).series_id,original.series_id);
 await decision(a2.id,'submit');await actor('hm');await decision(a2.id,'approve');
 assert.equal((await plan(planId)).status,'ersatt');assert.deepEqual(await plan(b.reply.id),unchangedB);
 assert.deepEqual(await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${b.reply.id} order by row_id`,bCells);
 assert.deepEqual(await tx`select to_jsonb(c) r from public.class_timplans c order by unit_id,class_name,start_year`,links);ok('A2 replaces only A1; B1 and both years of every class link are byte-equivalent');
 assert.deepEqual((await tx`select to_jsonb(h)-'name_at_decision' r from public.plan_decision_history h where plan_id=${planId} order by id`),oldHistory);
 for(const receipt of oldReceipts){await actor(receipt.request.action==='approve'?'hm':'principal');const replay=await command(receipt.request);assert.deepEqual(replay,{...receipt.result,series:await tx`select public.phase5_named_timplan_series_json(${original.series_id}) r`.then(r=>r[0].r)});}
 assert.deepEqual(await tx`select request,result from public.plan_decision_receipts where plan_id=${planId} order by command_id`,oldReceipts);ok('legacy decision replay adds metadata without rewriting old receipt or history');
 await actor('principal');const c=await create('Till granskning',b.reply.id);
 await deny('parallel open version in same series rejected by unique index',s=>s`insert into public.timplans(organizer_id,offering_id,unit_id,series_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id) select organizer_id,offering_id,unit_id,series_id,2,'utkast',basis,catalog_fetched,gym_basis,source_programplan_id from public.timplans where id=${c.reply.id}`,'23505');
 const auditCommand=await reviewed(c.reply.id,'submit'),beforeAudit=await allPublicHashes(tx);
 await tx.unsafe(`create function pg_temp.fail_named_decision() returns trigger language plpgsql as $$begin if new.customer_id='${id(1)}' and new.action='plan_decision_command' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger fail_named_decision before insert on public.security_events for each row execute function pg_temp.fail_named_decision();`);
 await deny('audit failure rolls back status review history and receipt',s=>s`select public.phase5_plan_decision_command(${s.json(auditCommand)})`,'55000');await tx`drop trigger fail_named_decision on public.security_events`;
 assert.deepEqual(await allPublicHashes(tx),beforeAudit);
 const inbox=(await tx`select public.phase5_plan_decision_inbox() r`)[0].r;parsePlanDecisionInbox(inbox);
 const query={query:'Till granskning',kind:'timplan',stage:'all',tasks:'all',page:1};const page=parsePlanDecisionPage((await tx`select public.phase5_plan_decision_page(${tx.json(query)}) r`)[0].r,query);
 assert.equal(page.items.length,1);assert.equal(page.items[0].series.name,'Till granskning');ok('inbox and search parse exact named series and find names');
 const a3=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${sourceRevision},0,${id(30)},${a2.id},${(await plan(a2.id)).revision}) r`)[0].r.reply;
 await decision(a3.id,'submit');await actor('hm');
 await deny('same series cannot contain a second approved version even with a valid decision permit',async s=>{
  const p=await plan(a3.id);
  await s`insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'timplan',${p.id},'forslag','faststalld',${p.revision})`;
  await s`update public.timplans set status='faststalld',revision=revision+1,decided_on=public.phase5_programplan_today(),decided_identity_id=public.current_identity_id() where id=${p.id}`;
 },'23505');
 await actor('principal');
 const grants=async()=>await tx`select p.oid::regprocedure::text signature,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace order by 1`;
 const beforeGrants=await grants(),tableRights=await tx`select relname,relacl::text acl from pg_class where relnamespace='public'::regnamespace order by relname`;
 await tx.unsafe(readFileSync(resolve(root,'supabase/migrations/20261015204000_worker_named_timplans.sql'),'utf8'));
 const afterGrants=await grants(),changed=afterGrants.filter((g,n)=>g.acl!==beforeGrants[n].acl).map(g=>g.signature);
 assert.deepEqual(changed,['phase5_named_timplan_create(jsonb)','phase5_named_timplan_rename(jsonb)']);
 assert.deepEqual(await tx`select relname,relacl::text acl from pg_class where relnamespace='public'::regnamespace order by relname`,tableRights);
 for(const fn of ['phase5_named_timplan_create','phase5_named_timplan_rename'])for(const role of ['anon','authenticated','service_role'])assert.equal((await tx`select has_function_privilege(${role},${'public.'+fn+'(jsonb)'},'EXECUTE') allowed`)[0].allowed,false);
 const workerRequest={commandId:randomUUID(),sourcePlanId:programId,expectedSourceRevision:sourceRevision,expectedEducationRevision:0,unitId:id(30),name:'Workerprov',copyFromPlanId:null,expectedCopyFromRevision:null};
 await tx.savepoint(async s=>{await s`set local role skolplattform_worker`;const created=parseNamedTimplanCreateReply((await s`select public.phase5_named_timplan_create(${s.json(workerRequest)}) r`)[0].r.reply,workerRequest);
  const q={commandId:randomUUID(),planId:created.id,seriesId:created.series.id,expectedSeriesRevision:0,name:'Workerprov namn'};
  parseNamedTimplanRenameReply((await s`select public.phase5_named_timplan_rename(${s.json(q)}) r`)[0].r,q);await s`reset role`;
 });ok('07 grants exactly two new entrypoints; actual Worker role creates and renames without table rights');
 await tx`set constraints all immediate`;
}

export async function verifyNamedDecisions(out){
 out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'named-timplan-decisions',status:'FAIL',startedAt:new Date().toISOString(),checks:[],sources:sources(),limitations:['Schema-only isolated database with repository synthetic rows','No original user rows exported or migration over those rows verified','No real concurrency, Worker HTTP or OIDC proof','No permanent migration']};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();let snapshot;
 try{
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;const db=snapshot.db;
  report.before=await allPublicHashes(db);report.beforeFingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin(async tx=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='90s'`;await tx`set local transaction_timeout='240s'`;await matrix(tx,report.checks);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  for(const code of ['SA25','BF25'])try{await db.begin(async tx=>{await install(tx);await classTimplanScenarios(tx,report.checks,code);await tx`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}
  report.after=await allPublicHashes(db);report.afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(report.after,report.before);assert.equal(report.afterFingerprint,report.beforeFingerprint);report.rollbackRestored=true;
  assert.deepEqual(sources(),report.sources);report.status='PASS';
 }catch(e){report.failure={code:e.code??'ASSERTION',message:e.message,hint:e.hint,where:e.where};
  if(snapshot&&report.before)try{report.after=await allPublicHashes(snapshot.db);report.afterFingerprint=await vocationalDatabaseFingerprint(snapshot.db);assert.deepEqual(report.after,report.before);assert.equal(report.afterFingerprint,report.beforeFingerprint);report.rollbackRestored=true;}catch(p){report.preservationFailure=p.message;}
 }
 finally{if(snapshot)try{report.cleanup=await snapshot.cleanup();}catch(e){report.status='FAIL';report.cleanupFailure=e.message;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: ${report.checks.length} isolated decision checks`);if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv[2],'--out');assert.equal(process.argv.length,4);await verifyNamedDecisions(process.argv[3]);}
