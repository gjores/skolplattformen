#!/usr/bin/env node
// Private schema-only fixture database. No writes or row export on the user's target.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
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
import {parseGymTimplan,parseGymTimplanUnderlag} from '../../web/lib/gym-timplan.ts';
import {parseClassPlanUnderlag,parseClassPlanCreateReply,parseClassPlanLinkReply} from '../../web/lib/class-timplan.ts';
import {parsePlanningSetup,parsePlanningList,parsePlanningOverview,planningAnnualMetrics} from '../../web/lib/planning-year-contract.ts';

const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('named_reads_rollback');
export const migrations=['20261015200000_named_timplan_series.sql','20261015201000_named_timplan_commands.sql','20261015202000_named_timplan_decisions.sql','20261015203000_named_timplan_reads.sql'];
const test='supabase/tests/phase5_named_timplan_reads.test.sql';
function sources(){return {...namedSeriesSources(),...Object.fromEntries([
 ...migrations.map(p=>'supabase/migrations/'+p),'supabase/migrations/20261015204000_worker_named_timplans.sql',test,'work/pilot/verify-named-timplan-reads.mjs','web/lib/server/gym-timplan.ts','web/lib/planning-year-contract.ts','web/lib/gym-timplan.ts','web/lib/class-timplan.ts',
].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]))};}
async function install(tx){await tx`set constraints all immediate`;for(const file of migrations)await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));await tx`set constraints all deferred`;}
async function projected(tx,tables){const result={};for(const table of tables){assert.match(table,/^[a-z_][a-z0-9_]*$/u);const subtract=table==='timplans'?"-'series_id'-'name_at_creation'":table==='plan_decision_history'?"-'name_at_decision'":'';[result[table]]=await tx.unsafe(`select count(*)::integer count,md5(coalesce(string_agg(r::text,'' order by r::text),'')) hash from (select to_jsonb(x)${subtract} r from public.${table} x) d`);}return result;}
async function loadProjection(){
 const hook=registerHooks({load(url,context,next){
  let source;
  if(url===new URL('../../web/lib/server/db.ts',import.meta.url).href)source='export class Deny extends Error {constructor(code,status){super(code);this.code=code;this.status=status;}}';
  if(url===new URL('../../web/lib/server/authz.ts',import.meta.url).href)source='export class AuditUnavailable extends Error {}';
  if(url===new URL('../../web/lib/server/env.ts',import.meta.url).href)source='export const serverEnv=()=>({});';
  if(url===new URL('../../web/lib/server/mandate-route.ts',import.meta.url).href)source='export const mandateOperation=async fn=>fn();';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
 }});
 try{return await import('../../web/lib/server/gym-timplan.ts');}finally{hook.deregister();}
}
async function matrix(tx,checks){
 const {projectGymTimplan,projectSource}=await loadProjection();
 const f=await approvedClassFixture(tx,'SA25'),{actor,planId,programId,id,year,decision}=f;
 // Legacy GR/IM rows are seeded before the additive series migration.
 for(const [form,off,pid] of [['grundskola',id(160),id(161)],['introduktionsprogram',id(170),id(171)]]){
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values(${off},${id(2)},${id(30)},${form},${'Syntetisk '+form},'Syntetisk läsram',${form==='grundskola'?[7,8,9]:null}::smallint[])`;
  await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${off},${id(30)},${id(2)}) on conflict do nothing`;
  await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on) values(${pid},${id(2)},${off},${id(30)},1,'utkast','Syntetiskt positionsunderlag',null)`;
  if(form==='grundskola'){
   await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${pid},'matematik',array[111,222,333]::smallint[])`;
   await tx`update public.timplans set status='faststalld',decided_on='2026-09-01' where id=${pid}`;
   await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${id(162)},${id(1)},${id(2)},${id(30)},${off},'SYNTETISK GR',${year-5})`;
   await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(${id(30)},'SYNTETISK GR',${year},${pid},'ak8'),(${id(30)},'OKÄND LEGACYKLASS',${year},${pid},'ak8')`;
   await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis) values(${id(163)},${id(2)},${off},${id(30)},2,'utkast','Syntetisk senare ram')`;
  }else for(const row of ['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor'])await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${pid},${row},array[2]::smallint[])`;
 }
 const tables=Object.keys(await allPublicHashes(tx)),before=await projected(tx,tables);
 await install(tx);assert.deepEqual(await projected(tx,tables),before);
 const ok=name=>{checks.push({name,ok:true});console.log('PASS: '+name);};ok('02–05 preserve every original synthetic column before named operations');
 const deny=async(name,fn,code)=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}assert.equal(error?.code,code,name);ok(name);};
 await tx.unsafe(readFileSync(resolve(root,test),'utf8'));checks.push(...(await tx`select name from named_read_checks order by name`).map(r=>({name:r.name,ok:true})));
 const plan=async pid=>(await tx`select * from public.timplans where id=${pid}`)[0];
 const create=async(name,copyFromPlanId=planId)=>{const p=(await tx`select revision from public.point_plans where id=${programId}`)[0];const q={commandId:randomUUID(),sourcePlanId:programId,expectedSourceRevision:p.revision,expectedEducationRevision:0,unitId:id(30),name,copyFromPlanId,expectedCopyFromRevision:copyFromPlanId?(await plan(copyFromPlanId)).revision:null};return parseNamedTimplanCreateReply((await tx`select public.phase5_named_timplan_create(${tx.json(q)}) r`)[0].r.reply,q);};
 const rename=async(pid,name)=>{const p=await plan(pid),s=(await tx`select * from public.timplan_series where id=${p.series_id}`)[0];const q={commandId:randomUUID(),planId:pid,seriesId:s.id,expectedSeriesRevision:s.revision,name};return parseNamedTimplanRenameReply((await tx`select public.phase5_named_timplan_rename(${tx.json(q)}) r`)[0].r,q);};
 const gym=async pid=>(await projectGymTimplan((await tx`select public.phase5_read_gym_timplan(${pid}) r`)[0].r,pid)).body;
 const setup=parsePlanningSetup((await tx`select public.phase5_planning_year_selection() r`)[0].r);
 const selection=(extra={})=>({schoolYear:year,unitId:id(30),view:'timplan',schoolform:'gymnasium',query:'',status:'all',cohortRelation:'all',archive:'active',grade:null,sort:'name',direction:'asc',page:1,selectionRevision:null,...extra});
 const list=async(extra={})=>{const q=selection(extra);return parsePlanningList((await tx`select public.phase5_planning_year_list(${tx.json(q)}) r`)[0].r,q,setup);};
 const overview=async(extra={})=>{const q=selection(extra);return parsePlanningOverview((await tx`select public.phase5_planning_year_overview(${tx.json(q)}) r`)[0].r,q,setup);};
 const ownRows=r=>r.rows.filter(r=>r.offeringId===id(46));
 const classCommand=async q=>{const raw=(await tx`select public.phase5_class_command(${tx.json(q)}) r`)[0].r;return q.operation==='create'?parseClassPlanCreateReply(raw,q):parseClassPlanLinkReply(raw,q);};
 const makeClass=async(name,pid)=>classCommand({operation:'create',commandId:randomUUID(),planId:pid,expectedPlanRevision:(await plan(pid)).revision,name,startYear:year});
 const link=async(cid,pid,y)=>classCommand({operation:'link',commandId:randomUUID(),classId:cid,schoolYear:y,planId:pid,expectedPlanRevision:(await plan(pid)).revision,columnId:'ar'+(y-year+1),expectedLinkRevision:null,previousPlanId:null});
 const original=await gym(planId);assert.equal(original.nameAtCreation,null);
 const b=await create('Utökad matematik');assert.equal(b.version,1);assert.notEqual(b.series.id,original.series.id);
 const cellsA=await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${planId} order by row_id`;
 const cell=(await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${b.id} and row_id ilike '%mate%' order by row_id limit 1`)[0];
 const hours=cell.hours.map((v,n)=>cell.allocated[n]?v:null);hours[cell.allocated.indexOf(true)]+=40;
 await tx`select public.phase5_write_gym_timplan_row(${b.id},0,${cell.row_id},${tx.json(hours)})`;
 await decision('timplan',b.id,'submit');await actor('hm');await decision('timplan',b.id,'approve');await actor('principal');
 assert.deepEqual(await tx`select to_jsonb(c) r from public.timplan_cells c where timplan_id=${planId} order by row_id`,cellsA);
 const detailB=await gym(b.id);assert.equal(detailB.series.name,'Utökad matematik');assert.equal(detailB.nameAtCreation,'Utökad matematik');assert.deepEqual(detailB.source,original.source);
 ok('actual gym parser reads independent version-one series, historical null and frozen shared source');
 const ca=await makeClass('SERIE A',planId),cb=await makeClass('SERIE B',b.id);
 await link(ca.id,planId,year);await link(cb.id,b.id,year+1);
 let rows=ownRows(await overview());assert.equal(rows.length,2);assert.equal(rows.find(r=>r.plan.id===planId).underlag,'class-bound');assert.equal(rows.find(r=>r.plan.id===b.id).underlag,'planning');
 rows=ownRows(await overview({schoolYear:year+1}));assert.equal(rows.find(r=>r.plan.id===b.id).underlag,'class-bound');assert.equal(rows.find(r=>r.plan.id===planId).underlag,'planning');
 ok('A year one binding never hides B; B year two binding never hides A');
 await link(cb.id,b.id,year);
 await tx`update public.school_classes set name='SERIE A NYTT NAMN' where id=${ca.id}`;
 rows=ownRows(await overview());assert.deepEqual(rows.find(r=>r.plan.id===planId).classes.map(c=>c.id),[ca.id]);
 assert.ok(!rows.find(r=>r.plan.id===planId).diagnostics.includes('missing-class'));ok('renamed class remains bound through stable class ID despite historical link label');
 const classView=parseClassPlanUnderlag((await tx`select public.phase5_class_underlag(${planId},${year}) r`)[0].r,{planId,schoolYear:year});
 assert.equal(classView.plan.series.id,original.series.id);assert.equal(classView.classes.find(c=>c.id===cb.id).link.series.name,'Utökad matematik');
 ok('actual class parser sees exact other named plan and existing command receipt shape');
 const beforeOverview=await overview();const ownMetrics=ownRows(beforeOverview).map(r=>planningAnnualMetrics(r,year));
 assert.equal(beforeOverview.totals.annualHours.known,ownMetrics.reduce((n,m)=>n+m.hours.known,0));assert.equal(beforeOverview.totals.points.known,ownMetrics[0].points.known);assert.equal(beforeOverview.totals.classCount.known,2);
 ok('actual overview parser independently checks SQL totals: shared source points deduplicated and both plan hours retained');
 const sourceRevision=(await tx`select revision from public.point_plans where id=${programId}`)[0].revision;
 const a2=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${sourceRevision},0,${id(30)},${planId},${(await plan(planId)).revision}) r`)[0].r.reply;
 await decision('timplan',a2.id,'submit');await actor('hm');await decision('timplan',a2.id,'approve');await actor('principal');
 rows=ownRows(await overview());assert.deepEqual(new Set(rows.map(r=>r.plan.id)),new Set([planId,b.id]));assert.equal(rows.find(r=>r.plan.id===planId).plan.status,'ersatt');
 rows=ownRows(await overview({schoolYear:year+1}));assert.deepEqual(new Set(rows.map(r=>r.plan.id)),new Set([a2.id,b.id]));
 const cc=await makeClass('SERIE A NY VERSION',a2.id);await link(cc.id,a2.id,year);
 rows=ownRows(await overview());assert.deepEqual(new Set(rows.map(r=>r.plan.id)),new Set([planId,a2.id,b.id]));
 ok('year-specific selection preserves older bound version and allows two bound versions of one series');
 let programRows=ownRows(await overview({view:'programplan'}));assert.equal(programRows.length,1);assert.equal(programRows[0].series,null);
 assert.deepEqual(new Set(programRows[0].schoolTimplans.map(t=>t.id)),new Set([planId,a2.id,b.id]));
 ok('program frame remains single with every exact named school timplan reference');
 const rawUnderlag=(await tx`select public.phase5_gym_timplan_underlag(${programId}) r`)[0].r, projectedSource=await projectSource(rawUnderlag.source,rawUnderlag.catalog);
 const underlag=parseGymTimplanUnderlag({source:projectedSource.source.projected,rows:projectedSource.rows,readiness:projectedSource.readiness,units:rawUnderlag.units},programId);
 assert.equal(underlag.units.find(u=>u.unitId===id(30)).plans.filter(p=>p.version===1).length,2);
 const oldA2=await gym(a2.id);await rename(planId,'A-klassens fördelning');assert.equal((await gym(a2.id)).series.name,'A-klassens fördelning');assert.equal((await gym(a2.id)).nameAtCreation,oldA2.nameAtCreation);
 assert.equal((await gym(planId)).nameAtCreation,null);
 assert.equal(ownRows(await list({query:'A-klassens'})).length,2);
 assert.equal(ownRows(await list({view:'programplan',query:'Utökad matematik'})).length,1);
 ok('current names update all read references and search without inventing or rewriting historical names');
 for(let n=0;n<51;n++)await create('Plan '+String(n).padStart(2,'0'),b.id);
 const first=await list(),second=await list({page:2,selectionRevision:first.selectionRevision});
 assert.equal(first.rows.length,50);assert.ok(second.rows.length>0);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.plan.id)).size,first.count);
 assert.deepEqual((await list()).rows.map(r=>r.plan.id),first.rows.map(r=>r.plan.id));
 const reversed=await overview({direction:'desc'});assert.equal(reversed.count,first.count);
 assert.equal((await list({query:'Plan 50'})).count,1);assert.equal((await list({status:'faststalld'})).rows.filter(r=>r.offeringId===id(46)).length,2);
 const all=await overview();assert.equal(all.count,first.count);
 await rename(b.id,'B-klassens extra matematik');
 await deny('rename invalidates a prior page revision',s=>s`select public.phase5_planning_year_list(${s.json(selection({page:2,selectionRevision:first.selectionRevision}))})`,'40001');
 ok('more than 50 named rows paginate without omission, stable sorting, filters, search and exact SQL/TS overview parity');
 const empty=await create('Timmar saknas',null);const unknown=ownRows(await overview()).find(r=>r.plan.id===empty.id);
 assert.equal(planningAnnualMetrics(unknown,year).hours.complete,false);assert.ok(unknown.diagnostics.includes('missing-hours'));
 ok('unallocated hours remain unknown without making other named plan hours disappear');
 const gr=await overview({schoolform:'grundskola'});assert.equal(gr.rows.length,1);assert.equal(gr.rows[0].plan.id,id(161));assert.equal(gr.rows[0].series,null);assert.ok(!Object.hasOwn(gr.rows[0],'schoolTimplans'));assert.ok(gr.rows[0].diagnostics.includes('missing-class'));assert.equal(gr.totals.classCount.complete,false);
 const grNext=await overview({schoolform:'grundskola',schoolYear:year+1});assert.equal(grNext.rows[0].plan.id,id(163));
 const im=await overview({schoolform:'introduktionsprogram'});assert.equal(im.rows.length,1);assert.equal(im.rows[0].series,null);assert.equal(im.totals.weeklyHours.known,14);
 ok('actual GR old bound/new unbound plans and missing legacy class remain explicit; IM weekly hours remain separate');
 const p2=(await tx`select public.phase5_clone_programplan_draft(${programId},${sourceRevision},1,null) r`)[0].r;
 await decision('programplan',p2.id,'submit');
 let submitted=ownRows(await overview({view:'programplan',status:'forslag'}));assert.equal(submitted.length,1);assert.equal(submitted[0].plan.id,p2.id);assert.equal(submitted[0].plan.decisionStage,'submitted');
 await actor('hm');const review=(await tx`select public.phase5_plan_decision_basis('programplan',${p2.id}) r`)[0].r;const reviewBody=review.detail??review;
 await tx`select public.phase5_plan_decision_command(${tx.json({kind:'programplan',planId:p2.id,commandId:randomUUID(),action:'return',expectedRevision:reviewBody.revision,expectedDecisionRevision:reviewBody.decisionRevision,basisHash:reviewBody.basisHash,comment:'Syntetiskt återlämnande',confirmedChecks:reviewBody.checks.map(c=>c.id)})})`;
 await actor('principal');const returned=ownRows(await overview({view:'programplan',status:'atersand'}));assert.equal(returned.length,1);assert.equal(returned[0].plan.decisionStage,'returned');
 await decision('programplan',p2.id,'submit');await actor('hm');await decision('programplan',p2.id,'approve');await actor('principal');
 ok('programplan submitted and returned review stages remain filterable after named read migration');
 const frozen=await gym(planId);assert.equal(frozen.source.planId,programId);assert.equal(frozen.currentSource.planId,p2.id);assert.equal(frozen.sourceChanged,true);assert.deepEqual(frozen.rows,original.rows);assert.deepEqual(frozen.hours,original.hours);
 ok('new approved program version leaves old timplan points and hours frozen and reports distinct current source');
 // The client also rejects oversized real-response-shaped envelopes; SQL guards remain inventoried above.
 const oversized={...all,count:10001,rows:Array(10001).fill(all.rows[0])};assert.throws(()=>parsePlanningOverview(oversized,selection(),setup));
 ok('strict overview parser rejects an envelope beyond the 10000-row safety limit');
 await tx`set constraints all immediate`;
}

export async function verifyNamedReads(out){
 out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'named-timplan-reads',status:'FAIL',startedAt:new Date().toISOString(),checks:[],sources:sources(),limitations:['Schema-only isolated database with repository synthetic rows','No original user rows exported or migration over those rows verified','No real concurrency, Worker HTTP or OIDC proof','No permanent migration']};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();let snapshot;
 try{
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;const db=snapshot.db;
  report.before=await allPublicHashes(db);report.beforeFingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin(async tx=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='90s'`;await tx`set local transaction_timeout='240s'`;await matrix(tx,report.checks);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  report.after=await allPublicHashes(db);report.afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(report.after,report.before);assert.equal(report.afterFingerprint,report.beforeFingerprint);report.rollbackRestored=true;
  assert.deepEqual(sources(),report.sources);report.status='PASS';
 }catch(e){report.failure={code:e.code??'ASSERTION',message:e.message,hint:e.hint,where:e.where,stack:e.stack};
  if(snapshot&&report.before)try{report.after=await allPublicHashes(snapshot.db);report.afterFingerprint=await vocationalDatabaseFingerprint(snapshot.db);assert.deepEqual(report.after,report.before);assert.equal(report.afterFingerprint,report.beforeFingerprint);report.rollbackRestored=true;}catch(p){report.preservationFailure=p.message;}
 }
 finally{if(snapshot)try{report.cleanup=await snapshot.cleanup();}catch(e){report.status='FAIL';report.cleanupFailure=e.message;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: ${report.checks.length} isolated read checks`);if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv[2],'--out');assert.equal(process.argv.length,4);await verifyNamedReads(process.argv[3]);}
