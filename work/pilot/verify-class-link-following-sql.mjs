#!/usr/bin/env node
// CLASS-LINK. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture,planRead} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
import {parseYearPlanReadReply} from '../../web/lib/tjanst-contract.ts';
import {parseClassPlanCreateReply,parseClassPlanLinkReply,parseClassPlanUnderlag} from '../../web/lib/class-timplan.ts';
const own=await createEphemeralMigratedDb(),report={kind:'ephemeral-class-link-following-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/class-link-following-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),first=await seedElectiveTimeFrame(tx,f),other=await seedElectiveTimeFrame(tx,f),{unitId,schoolYear:year}=first;
  const classOf=seed=>seed.frameSourceKey.split(':')[1],seeded=classOf(first);
  const[{plan_id:planId}]=await tx`select timplan_id plan_id from public.class_timplans where class_id=${seeded} and start_year=${year}`;
  const[{plan_id:otherPlan}]=await tx`select timplan_id plan_id from public.class_timplans where class_id=${classOf(other)} and start_year=${year}`;
  await f.actor(tx,'principalA');
  const worker=async run=>{await tx`set local role skolplattform_worker`;try{return await run();}finally{await tx`reset role`;}};
  const links=id=>tx`select start_year::int as year,column_id,timplan_id,revision from public.class_timplans where class_id=${id} order by start_year`;
  const plan=async id=>(await tx`select revision from public.timplans where id=${id}`)[0].revision;
  const underlag=(id,schoolYear)=>worker(async()=>parseClassPlanUnderlag((await tx`select public.phase5_class_underlag(${id},${schoolYear}) value`)[0].value,{planId:id,schoolYear}));
  const make=async name=>{const q={commandId:randomUUID(),planId,expectedPlanRevision:await plan(planId),name,startYear:year};return worker(async()=>parseClassPlanCreateReply((await tx`select public.phase5_class_command(${tx.json({operation:'create',...q})}) value`)[0].value,q)).then(r=>r.id);};
  const link=async(classId,schoolYear,id=planId,current=null)=>{
   const q={commandId:randomUUID(),classId,schoolYear,planId:id,expectedPlanRevision:await plan(id),columnId:'ar'+(schoolYear-year+1),expectedLinkRevision:current?.revision??null,previousPlanId:current?.timplan_id??null};
   return{q,reply:await worker(async()=>parseClassPlanLinkReply((await tx`select public.phase5_class_command(${tx.json({operation:'link',...q})}) value`)[0].value,q))};};
  assert.deepEqual((await links(seeded)).map(l=>[l.year,l.column_id,l.timplan_id]),[0,1,2].map(i=>[year+i,'ar'+(i+1),planId]));
  check('one link covers the chosen year and the rest of the plan');
  const a=await make('LINK-A'),before=await underlag(planId,year),row=before.classes.find(c=>c.id===a);
  assert.deepEqual(row.following.map(x=>[x.schoolYear,x.status]),[[year+1,'new'],[year+2,'new']]);check('the review reads which coming years follow');
  const first1=await link(a,year);assert.deepEqual(first1.reply.followingYears,[year+1,year+2]);assert.deepEqual(first1.reply.skippedYears,[]);
  const replay=await worker(async()=>(await tx`select public.phase5_class_command(${tx.json({operation:'link',...first1.q})}) value`)[0].value);assert.equal(replay.replayed,true);assert.deepEqual(await links(a).then(r=>r.map(l=>l.revision)),[0,0,0]);
  check('a resent command changes nothing');
  assert.ok((await underlag(planId,year)).classes.find(c=>c.id===a).following.every(x=>x.status==='same'));
  const need=await worker(async()=>parseYearPlanReadReply(await planRead(tx,{unitId,schoolYear:year+1}),{unitId,schoolYear:year+1}));assert.ok(need.classes.some(c=>c.classId===a&&c.needs.length>0));
  check('the coming school year has needs without another link');
  const b=await make('LINK-B');await link(b,year+1);assert.deepEqual((await links(b)).map(l=>l.year),[year+1,year+2]);check('a link from a later year leaves earlier years alone');
  await tx`set local session_replication_role=replica`;
  await tx`delete from public.class_timplans where class_id=${a} and start_year>${year}`;
  await tx`set local session_replication_role=origin`;
  const[a1]=await links(a),filled=await link(a,year,planId,a1);assert.equal(filled.reply.revision,a1.revision);assert.equal((await links(a))[0].revision,a1.revision);assert.equal((await links(a)).length,3);
  check('adding only missing years keeps the chosen year revision, so service rows stay current');
  const d=await make('LINK-D');await tx`set local session_replication_role=replica`;
  await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(${unitId},'LINK-D',${year+2},${otherPlan},'ar3',null)`;await tx`set local session_replication_role=origin`;
  assert.deepEqual((await underlag(planId,year)).classes.find(x=>x.id===d).following.map(x=>x.status),['new','occupied']);
  const occupied=await link(d,year);assert.deepEqual([occupied.reply.followingYears,occupied.reply.skippedYears],[[year+1],[year+2]]);assert.equal((await links(d)).length,2);check('an occupied class name skips that year and reports it');
  const e=await make('LINK-E');await tx`set local session_replication_role=replica`;await tx`update public.school_classes set ends_on=${`${year+1}-06-30`} where id=${e}`;await tx`set local session_replication_role=origin`;
  await link(e,year);assert.deepEqual((await links(e)).map(l=>l.year),[year]);check('coming years outside the class validity are not linked');
  const c=await make('LINK-C');await link(c,year);const[,c2]=await links(c);
  await tx`set local session_replication_role=replica`;const newer=randomUUID();await tx`update public.timplans set status='ersatt' where id=${planId}`;
  await tx`insert into public.timplans select (jsonb_populate_record(t,jsonb_build_object('id',${newer}::uuid,'version',t.version+1,'status','faststalld'))).* from public.timplans t where t.id=${planId}`;await tx`set local session_replication_role=origin`;
  const changed=(await underlag(newer,year+1)).classes.find(x=>x.id===c).following;assert.deepEqual(changed.map(x=>[x.schoolYear,x.status,x.current.planId]),[[year+2,'change',planId]]);
  await link(c,year+1,newer,c2);assert.deepEqual((await links(c)).map(l=>[l.timplan_id,l.revision]),[[planId,0],[newer,1],[newer,1]]);check('a change applies from the chosen year onward and earlier years stay');
  const[audit]=await tx`select details from public.security_events where action='class_plan_linked' and object_id=${a} order by id desc limit 1`;assert.ok(Array.isArray(audit.details.followingYears));check('the audit row records the following years');
  assert.equal((await tx`select has_function_privilege('skolplattform_worker','public.phase5_class_following(public.school_classes,public.timplans,integer)','EXECUTE') ok`)[0].ok,false);check('the helper stays closed to the Worker');
  throw Object.assign(new Error('rollback'),{rollback:true});
 }).catch(e=>{if(!e.rollback)throw e;});
 report.ok=true;report.total=report.checks.length;console.log(`PASS ${report.total} class link following SQL checks`);
}finally{writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});await own.end();}
