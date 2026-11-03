#!/usr/bin/env node
// VP-03. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const own=await createEphemeralMigratedDb(),report={kind:'ephemeral-study-groups-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/study-groups-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
async function deny(tx,name,run,codes,hint){let e;try{await tx.savepoint(nested=>run(nested));}catch(error){e=error;}assert.ok(e,name);assert.ok(codes.includes(e.code),`${name}: ${e.code} ${e.message}`);if(hint)assert.equal(e.hint,hint,name);check(name);}
async function snapshot(tx,names){const result={};for(const name of names)result[name]=(await tx.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C"),'[]') value from public.${name} x`))[0].value;return result;}
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const courseRef=(subjectCode,itemCode,points,languageCode=null)=>({subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode});
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),seed=await seedElectiveTimeFrame(tx,f);await f.actor(tx,'principalA');
  const unitId=f.schools.A,schoolYear=2026,{inGroup:p1,inGroup2:p2,outside:p3}=f.pupils,classA=f.classes.group,classB=f.classes.other;
  const ordinary=['pupils','pupil_placements','pupil_class_memberships','school_classes','tjanst_rows','teaching_groups','elective_placements'],before=await snapshot(tx,ordinary);
  const read=async(t=tx,year=schoolYear)=>(await t`select public.study_group_read(${t.json({unitId,schoolYear:year})}) value`)[0].value.result;
  const run=(t,action,payload,year=schoolYear,commandId=randomUUID())=>t`select public.study_group_command(${t.json({contractVersion:'study_group_v1',commandId,action,unitId,schoolYear:year,payload})}) value`.then(r=>r[0].value.result);
  const r0=await read();assert.equal(r0.groups.length,0);assert.deepEqual(r0.pupils.map(p=>p.id).sort(),[p1,p2,p3].sort());
  assert.deepEqual(r0.pupils.find(p=>p.id===p3).classIds,[classB]);check('read lists visible pupils placed at the school with their classes');
  const setPsyl=randomUUID(),setLang=randomUUID(),setDe=randomUUID();
  const group=(name,set,course,extra={})=>({id:randomUUID(),expectedRevision:0,name,startsOn:'2026-08-17',endsOn:'2027-06-11',course,minutesHt:1350,minutesVt:1350,parallelSetId:set,classIds:[classA,classB],origin:{kind:'manual'},...extra});
  const A=group('Psykologi 1 a',setPsyl,courseRef('PSYL','PSYL1000X',50)),B=group('Psykologi 1 b',setPsyl,courseRef('PSYL','PSYL1000X',50));
  const ES=group('Spanska',setLang,courseRef('MODY','MODY1000X',100,'es'),{origin:{kind:'classes'},classIds:[classA]}),DE=group('Tyska',setDe,courseRef('MODY','MODY1000X',100,'de'),{origin:{kind:'classes'},classIds:[classA]});
  const createCmd=randomUUID(),created=await run(tx,'save_group',A,schoolYear,createCmd);assert.deepEqual([created.receipt.groupId,created.receipt.revision,created.receipt.replayed],[A.id,1,false]);
  assert.equal((await run(tx,'save_group',A,schoolYear,createCmd)).receipt.replayed,true);
  await deny(tx,'same command id with another payload is a collision',t=>run(t,'save_group',{...A,name:'Annat'},schoolYear,createCmd),['40001'],'study_group_command_conflict');
  for(const g of [B,ES,DE])await run(tx,'save_group',g);check('groups are created idempotently, with parallel sets and optional class sources');
  await deny(tx,'old revision is rejected',t=>run(t,'save_group',{...A,name:'Nytt'}),['40001'],'study_group_revision_conflict');
  const renamed=await run(tx,'save_group',{...A,expectedRevision:1,name:'Psykologi grund A'});assert.equal(renamed.read.groups.find(g=>g.id===A.id).name,'Psykologi grund A');assert.equal(renamed.receipt.revision,2);check('rename keeps the group identity and raises the revision');
  await deny(tx,'parallel set cannot be changed',t=>run(t,'save_group',{...A,expectedRevision:2,parallelSetId:randomUUID()}),['22023'],'study_group_identity_fixed');
  await deny(tx,'course content cannot be swapped on a saved group',t=>run(t,'save_group',{...A,expectedRevision:2,course:courseRef('FILS','FILS1000X',50)}),['22023'],'study_group_identity_fixed');
  await deny(tx,'parallel set only holds the same course',t=>run(t,'save_group',group('Filosofi',setPsyl,courseRef('FILS','FILS1000X',50))),['22023'],'study_group_parallel_set');
  await deny(tx,'group period must stay inside the school year',t=>run(t,'save_group',group('Fel',randomUUID(),null,{endsOn:'2027-07-01'})),['22023'],'study_group_period');
  await deny(tx,'class of another school is rejected',t=>run(t,'save_group',group('Fel',randomUUID(),null,{classIds:[randomUUID()]})),['22023'],'study_group_class');
  await deny(tx,'class origin requires classes',t=>run(t,'save_group',group('Fel',randomUUID(),null,{classIds:[],origin:{kind:'classes'}})),['22023'],'study_group_class');
  const member=(pupilId,extra={})=>({pupilId,startsOn:'2026-08-17',endsOn:'2027-06-11',source:'manual',sourceRef:null,...extra});
  const added=await run(tx,'add_members',{groupId:A.id,members:[member(p1),member(p2)]});assert.equal(added.receipt.membershipIds.length,2);
  await deny(tx,'a pupil cannot be in two parallel groups at once',t=>run(t,'add_members',{groupId:B.id,members:[member(p1)]}),['40001'],'study_group_member_overlap');
  await deny(tx,'a pupil cannot be added twice to the same group',t=>run(t,'add_members',{groupId:A.id,members:[member(p1,{startsOn:'2027-01-10'})]}),['40001'],'study_group_member_overlap');
  await deny(tx,'membership outside the group period is rejected',t=>run(t,'add_members',{groupId:A.id,members:[member(p3,{startsOn:'2026-08-01'})]}),['22023'],'study_group_member_period');
  await run(tx,'add_members',{groupId:ES.id,members:[member(p1)]});await run(tx,'add_members',{groupId:DE.id,members:[member(p2)]});check('same class pupils can be members of two different language groups');
  const p2InA=added.read.memberships.find(m=>m.pupilId===p2&&m.groupId===A.id);
  const moved=await run(tx,'move_member',{membershipId:p2InA.id,toGroupId:B.id,on:'2027-01-11'});
  const ended=moved.read.memberships.find(m=>m.id===p2InA.id),fresh=moved.read.memberships.find(m=>m.id===moved.receipt.membershipIds[0]);
  assert.equal(ended.endsOn,'2027-01-10');assert.deepEqual([fresh.groupId,fresh.startsOn,fresh.endsOn],[B.id,'2027-01-11','2027-06-11']);check('a move ends the old membership the day before and starts the new one');
  const later=(await run(tx,'add_members',{groupId:A.id,members:[member(p3,{startsOn:'2027-03-01'})]})).receipt.membershipIds[0];
  const early=await run(tx,'move_member',{membershipId:later,toGroupId:B.id,on:'2027-02-01'});assert.equal(early.read.memberships.some(m=>m.id===later),false);
  assert.equal(early.read.memberships.find(m=>m.id===early.receipt.membershipIds[0]).startsOn,'2027-03-01');check('a move before start withdraws the planned membership instead');
  await deny(tx,'move outside the parallel set is rejected',t=>run(t,'move_member',{membershipId:fresh.id,toGroupId:ES.id,on:'2027-02-01'}),['22023'],'study_group_move');
  const end=await run(tx,'end_member',{membershipId:fresh.id,endsOn:'2027-05-31'});assert.equal(end.read.memberships.find(m=>m.id===fresh.id).endsOn,'2027-05-31');
  await deny(tx,'end date after the current end is rejected',t=>run(t,'end_member',{membershipId:fresh.id,endsOn:'2027-06-11'}),['22023'],'study_group_member_period');
  await deny(tx,'group in use cannot be retired',t=>run(t,'retire_group',{groupId:B.id,expectedRevision:1}),['22023'],'study_group_in_use');
  let state=await read();for(const m of state.memberships.filter(x=>x.groupId===B.id))await run(tx,'cancel_member',{membershipId:m.id});
  const retired=await run(tx,'retire_group',{groupId:B.id,expectedRevision:1});assert.equal(retired.read.groups.find(g=>g.id===B.id).active,false);
  await deny(tx,'retired group takes no new members',t=>run(t,'add_members',{groupId:B.id,members:[member(p3)]}),['22023'],'study_group_inactive');check('cancelled memberships free the group for retirement; history stays');
  // Valplan origin: the valplan owns the course and its time.
  const vYear=seed.schoolYear;
  const rows=(await tx`select public.valplan_read(${tx.json({unitId,schoolYear:vYear})}) value`)[0].value.result.rows.filter(r=>r.rowKey==='block:iv1');
  const reto={id:randomUUID(),subjectCode:'RETO',subjectVersion:version('RETO'),itemCode:'RETO1000X',points:100,languageCode:null,name:'Retorik',minutesHt:2700,minutesVt:2700,classIds:null};
  const vp={id:randomUUID(),unitId,schoolYear:vYear,kind:'individualChoice',name:'IV',revision:1,courses:[reto],rows:rows.map(r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year}))};
  await tx`select public.valplan_command(${tx.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear:vYear,expectedRevision:0,catalogId:catalog.catalogId,valplan:vp})})`;
  const fromValplan=g=>({id:randomUUID(),expectedRevision:0,name:'Retorik A',startsOn:`${vYear}-08-17`,endsOn:`${vYear+1}-06-11`,course:courseRef('RETO','RETO1000X',100),minutesHt:2700,minutesVt:2700,parallelSetId:randomUUID(),classIds:rows[0].classIds,origin:{kind:'valplan',valplanId:vp.id,courseId:reto.id},...g});
  await deny(tx,'valplan group must keep the course time',t=>run(t,'save_group',fromValplan({minutesHt:100}),vYear),['22023'],'study_group_valplan_course');
  await deny(tx,'valplan group must keep the course content',t=>run(t,'save_group',fromValplan({course:courseRef('FILS','FILS1000X',50)}),vYear),['22023'],'study_group_valplan_course');
  const vg=await run(tx,'save_group',fromValplan(),vYear);assert.deepEqual(vg.read.groups[0].origin,{kind:'valplan',valplanId:vp.id,courseId:reto.id});check('a valplan group copies the valplan course and its time exactly');
  await f.actor(tx,'principalB');await deny(tx,'principal of another school cannot read groups',t=>read(t),['42501']);await deny(tx,'principal of another school cannot write groups',t=>run(t,'save_group',group('X',randomUUID(),null)),['42501']);
  await f.actor(tx,'hm');await deny(tx,'huvudman cannot write school groups',t=>run(t,'save_group',group('X',randomUUID(),null)),['42501']);await f.actor(tx,'principalA');
  assert.deepEqual(await snapshot(tx,ordinary),before);check('pupils, placements, class memberships, classes, tjänstefördelning and old elective groups are unchanged');
  await deny(tx,'history cannot be rewritten',t=>t`update public.study_group_history set detail='{}'`,['42501']);await deny(tx,'command journal cannot be truncated',t=>t`truncate public.study_group_commands`,['42501']);
  const grants=await tx`select has_function_privilege('skolplattform_worker','public.study_group_command(jsonb)','execute') w,has_function_privilege('authenticated','public.study_group_read(jsonb)','execute') a,has_table_privilege('skolplattform_worker','public.study_group_memberships','select') t`;
  assert.deepEqual({...grants[0]},{w:true,a:false,t:false});check('only the worker may call the guarded entrypoints; tables are closed');
 });
 report.ok=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS`);
}catch(error){console.error('SQL verification failed:',error.code??'',error.message,error.where??'',error.stack??'');process.exitCode=1;}finally{await own.end();}
