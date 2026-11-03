#!/usr/bin/env node
// VP-02. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const own=await createEphemeralMigratedDb(),report={kind:'ephemeral-valplan-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/valplan-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
async function deny(tx,name,run,codes,hint){let e;try{await tx.savepoint(nested=>run(nested));}catch(error){e=error;}assert.ok(e,name);assert.ok(codes.includes(e.code),`${name}: ${e.code} ${e.message}`);if(hint)assert.equal(e.hint,hint,name);check(name);}
async function snapshot(tx,names){const result={};for(const name of names)result[name]=(await tx.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C"),'[]') value from public.${name} x`))[0].value;return result;}
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const course=(subjectCode,itemCode,points,extra={})=>({id:randomUUID(),subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`${subjectCode} ${itemCode}`,minutesHt:points*27,minutesVt:points*27,classIds:null,...extra});
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),first=await seedElectiveTimeFrame(tx,f),second=await seedElectiveTimeFrame(tx,f);await f.actor(tx,'principalA');
  const unitId=first.unitId,schoolYear=first.schoolYear,[classA,classB]=[first,second].map(s=>s.frameSourceKey.split(':')[1]);
  const read=async(t=tx)=>(await t`select public.valplan_read(${t.json({unitId,schoolYear})}) value`)[0].value;
  const ordinary=['timplans','class_timplans','school_classes','timplan_time_cells_v2','tjanst_versions','tjanst_rows','elective_blocks','teaching_groups'],before=await snapshot(tx,ordinary);
  const r0=await read();assert.equal(r0.contractVersion,'valplan_sql_v1');assert.equal(r0.result.valplans.length,0);
  const ivRows=r0.result.rows.filter(r=>r.rowKey==='block:iv1');assert.equal(ivRows.length,2);
  for(const r of ivRows){assert.equal(r.year,1);assert.equal(r.points,200);assert.equal(r.minutesHt,5400);assert.equal(r.minutesVt,5400);assert.equal(r.blockKind,'individualChoice');assert.equal(r.linkedValplanId,null);assert.equal(r.classIds.length,1);}
  assert.deepEqual(ivRows.flatMap(r=>r.classIds).sort(),[classA,classB].sort());check('read lists IV rows of both approved timplaner with year points, school minutes and real classes');
  const link=r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year});
  const psyl=course('PSYL','PSYL1000X',50),fils=course('FILS','FILS1000X',50),reto=course('RETO','RETO1000X',100,{classIds:[classA]});
  const valplan={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Individuellt val',revision:1,courses:[psyl,fils,reto],rows:ivRows.map(link)};
  const cmd=(doc,expectedRevision=0,extra={})=>({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision,catalogId:catalog.catalogId,valplan:doc,...extra});
  const run=(t,c)=>t`select public.valplan_command(${t.json(c)}) value`;
  const create=cmd(valplan),saved=(await run(tx,create))[0].value;
  assert.deepEqual(saved.result.receipt,{commandId:create.commandId,valplanId:valplan.id,revision:1,replayed:false});
  const stored=saved.result.read.valplans[0];assert.equal(stored.catalogId,catalog.catalogId);
  assert.deepEqual(stored.valplan,{...valplan,courses:valplan.courses.map(c=>({...c})),rows:[...valplan.rows].sort((a,b)=>a.timplanId<b.timplanId?-1:1)});
  assert.ok(saved.result.read.rows.filter(r=>r.rowKey==='block:iv1').every(r=>r.linkedValplanId===valplan.id));check('one valplan fills IV rows in two timplaner and reads back exactly');
  const replay=(await run(tx,create))[0].value;assert.equal(replay.result.receipt.replayed,true);assert.equal((await tx`select count(*)::int n from public.valplan_versions`)[0].n,1);check('same command replays its receipt without a new version');
  await deny(tx,'same command id with another payload is a collision',t=>run(t,{...create,valplan:{...valplan,name:'Annat'}}),['40001'],'valplan_command_conflict');
  await deny(tx,'old revision is rejected',t=>run(t,cmd({...valplan,name:'Nytt namn'},0)),['40001'],'valplan_revision_conflict');
  const other={...valplan,id:randomUUID(),name:'Andra IV',courses:[course('FILS','FILS2000X',50)]};
  await deny(tx,'a row already filled by another valplan cannot be linked',t=>run(t,cmd(other)),['40001'],'valplan_row_conflict');
  await deny(tx,'modern language valplan cannot fill an IV row',t=>run(t,cmd({...other,kind:'modernLanguage',courses:[course('MODY','MODY1000X',100,{languageCode:'es'})]})),['22023'],'valplan_row_kind');
  const noRows={...other,rows:[]};
  await deny(tx,'unknown catalog item is rejected',t=>run(t,cmd({...noRows,courses:[course('PSYL','PSYL9000X',50)]})),['22023'],'valplan_course_not_in_catalog');
  await deny(tx,'catalog points cannot be changed',t=>run(t,cmd({...noRows,courses:[course('PSYL','PSYL1000X',100)]})),['22023'],'valplan_course_not_in_catalog');
  await deny(tx,'modern language course requires a language',t=>run(t,cmd({...noRows,courses:[course('MODY','MODY1000X',100)]})),['22023'],'valplan_invalid');
  await deny(tx,'course without teaching time is rejected',t=>run(t,cmd({...noRows,courses:[course('FILS','FILS2000X',50,{minutesHt:0,minutesVt:0})]})),['22023'],'valplan_invalid');
  await deny(tx,'course class restriction outside linked classes is rejected',t=>run(t,cmd({...noRows,courses:[course('FILS','FILS2000X',50,{classIds:[classA]})]})),['22023'],'valplan_course_class');
  await deny(tx,'duplicate course content is rejected',t=>run(t,cmd({...noRows,courses:[course('FILS','FILS2000X',50),course('FILS','FILS2000X',50)]})),['22023'],'valplan_duplicate_course');
  await deny(tx,'saved course content cannot be swapped under the same id',t=>run(t,cmd({...valplan,courses:[{...psyl,itemCode:'PSYL2000X'},fils,reto]},1)),['22023'],'valplan_course_identity');
  await deny(tx,'valplan kind is fixed after creation',t=>run(t,cmd({...valplan,kind:'specialization',rows:[]},1)),['22023'],'valplan_kind_fixed');
  const fakeRow={...link(ivRows[0]),rowKey:'block:nope'};
  await deny(tx,'row that is not a choice row of an approved timplan is rejected',t=>run(t,cmd({...noRows,rows:[fakeRow]})),['40001'],'valplan_row_conflict');
  const edited=(await run(tx,cmd({...valplan,name:'Individuellt val 27/28',courses:[{...psyl,name:'Psykologi grund',minutesHt:900,minutesVt:0},reto]},1)))[0].value;
  assert.equal(edited.result.receipt.revision,2);const ev=edited.result.read.valplans[0].valplan;assert.deepEqual(ev.courses.map(c=>c.id),[psyl.id,reto.id]);assert.equal(ev.courses[0].minutesHt,900);
  assert.equal((await tx`select active from public.valplan_courses where id=${fils.id}`)[0].active,false);check('edit renames, retimes and deactivates a removed course without deleting it');
  const readded=(await run(tx,cmd({...ev,courses:[...ev.courses,fils]},2)))[0].value;assert.ok(readded.result.read.valplans[0].valplan.courses.some(c=>c.id===fils.id));check('a deactivated course can be offered again with the same identity');
  const unlinked=(await run(tx,cmd({...readded.result.read.valplans[0].valplan,courses:[psyl],rows:[link(ivRows[0])]},3)))[0].value;
  assert.equal(unlinked.result.read.rows.filter(r=>r.linkedValplanId===valplan.id).length,1);
  const freed=(await run(tx,cmd({...other,rows:[link(ivRows[1])]})))[0].value;assert.equal(freed.result.read.valplans.length,2);check('an unlinked row can be filled by another valplan');
  await f.actor(tx,'principalB');await deny(tx,'principal of another school cannot read',t=>read(t),['42501']);await deny(tx,'principal of another school cannot save',t=>run(t,cmd({...noRows,id:randomUUID()})),['42501']);
  await f.actor(tx,'hm');await deny(tx,'huvudman cannot write school valplaner',t=>run(t,cmd({...noRows,id:randomUUID()})),['42501']);await f.actor(tx,'principalA');
  assert.deepEqual(await snapshot(tx,ordinary),before);check('timplaner, class links, tjänstefördelning and old elective tables are unchanged');
  await deny(tx,'versions cannot be rewritten',t=>t`update public.valplan_versions set document='{}'`,['42501']);await deny(tx,'command journal cannot be truncated',t=>t`truncate public.valplan_commands`,['42501']);
  const grants=await tx`select has_function_privilege('skolplattform_worker','public.valplan_command(jsonb)','execute') w,has_function_privilege('authenticated','public.valplan_command(jsonb)','execute') a,has_table_privilege('skolplattform_worker','public.valplans','select') t`;
  assert.deepEqual({...grants[0]},{w:true,a:false,t:false});check('only the worker may call the guarded entrypoints; tables are closed');
 });
 report.ok=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS`);
}catch(error){console.error('SQL verification failed:',error.code??'',error.message,error.where??'',error.stack??'');process.exitCode=1;}finally{await own.end();}
