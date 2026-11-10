#!/usr/bin/env node
// VP-02. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
import {linkExtraClass} from './valplan-block-fixtures.mjs';
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
  for(const r of ivRows){assert.equal(r.year,1);assert.equal(r.points,200);assert.equal(r.minutesHt,5400);assert.equal(r.minutesVt,5400);assert.equal(r.blockKind,'individualChoice');assert.deepEqual(r.blocks,[]);assert.equal(r.classIds.length,1);}
  assert.deepEqual(ivRows.flatMap(r=>r.classIds).sort(),[classA,classB].sort());check('read lists IV rows of both approved timplaner with year points, school minutes and real classes');
  // Plans without time model v2 keep hours per term in timplan_cells: 88 year hours become 44 + 44, as in tjänstefördelningen.
  const legacyPlan=ivRows[0].timplanId,noTime=Symbol();
  await tx.savepoint(async t=>{await t`set local session_replication_role=replica`;await t`delete from public.timplan_time_cells_v2 where plan_id=${legacyPlan}`;await t`delete from public.timplan_time_models where plan_id=${legacyPlan}`;
   await t`insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(${legacyPlan},'block:iv1','{50,38,0,0,0,0}','{true,true,false,false,false,false}') on conflict(timplan_id,row_id) do update set hours=excluded.hours,allocated=excluded.allocated`;
   let row=(await read(t)).result.rows.find(r=>r.timplanId===legacyPlan&&r.rowKey==='block:iv1');assert.deepEqual([row.minutesHt,row.minutesVt],[2640,2640]);
   await t`update public.timplan_cells set allocated='{false,false,false,false,false,false}' where timplan_id=${legacyPlan} and row_id='block:iv1'`;
   row=(await read(t)).result.rows.find(r=>r.timplanId===legacyPlan&&r.rowKey==='block:iv1');assert.deepEqual([row.minutesHt,row.minutesVt],[null,null]);throw noTime;}).catch(e=>{if(e!==noTime)throw e;});
  check('rows of plans without time model v2 read hours split evenly, and stay unknown when no time is allocated');
  const link=r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year,excludedClassIds:[]});
  const psyl=course('PSYL','PSYL1000X',50),fils=course('FILS','FILS1000X',50),reto=course('RETO','RETO1000X',100,{classIds:[classA]});
  const valplan={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Individuellt val',revision:1,courses:[psyl,fils,reto],rows:ivRows.map(link)};
  const cmd=(doc,expectedRevision=0,extra={})=>({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision,catalogId:catalog.catalogId,valplan:doc,...extra});
  const run=(t,c)=>t`select public.valplan_command(${t.json(c)}) value`;
  const create=cmd(valplan),saved=(await run(tx,create))[0].value;
  assert.deepEqual(saved.result.receipt,{commandId:create.commandId,valplanId:valplan.id,revision:1,replayed:false});
  const stored=saved.result.read.valplans[0];assert.equal(stored.catalogId,catalog.catalogId);
  assert.deepEqual(stored.valplan,{...valplan,courses:valplan.courses.map(c=>({...c})),rows:[...valplan.rows].sort((a,b)=>a.timplanId<b.timplanId?-1:1)});
  assert.ok(saved.result.read.rows.filter(r=>r.rowKey==='block:iv1').every(r=>r.blocks.length===1&&r.blocks[0].valplanId===valplan.id&&r.blocks[0].classIds.length===1));check('one valplan fills IV rows in two timplaner and reads back exactly');
  const replay=(await run(tx,create))[0].value;assert.equal(replay.result.receipt.replayed,true);assert.equal((await tx`select count(*)::int n from public.valplan_versions`)[0].n,1);check('same command replays its receipt without a new version');
  await deny(tx,'same command id with another payload is a collision',t=>run(t,{...create,valplan:{...valplan,name:'Annat'}}),['40001'],'valplan_command_conflict');
  await deny(tx,'old revision is rejected',t=>run(t,cmd({...valplan,name:'Nytt namn'},0)),['40001'],'valplan_revision_conflict');
  const other={...valplan,id:randomUUID(),name:'Andra IV',courses:[course('FILS','FILS2000X',50)]};
  await deny(tx,'a class already in another valplan cannot be linked',t=>run(t,cmd(other)),['40001'],'valplan_class_in_other_block');
  await deny(tx,'modern language valplan cannot fill an IV row',t=>run(t,cmd({...other,kind:'modernLanguage',courses:[course('MODY','MODY1000X',100,{languageCode:'es'})]})),['22023'],'valplan_row_kind');
  const noRows={...other,rows:[]};
  await deny(tx,'unknown catalog item is rejected',t=>run(t,cmd({...noRows,courses:[course('PSYL','PSYL9000X',50)]})),['22023'],'valplan_course_not_in_catalog');
  await deny(tx,'catalog points cannot be changed',t=>run(t,cmd({...noRows,courses:[course('PSYL','PSYL1000X',100)]})),['22023'],'valplan_course_not_in_catalog');
  await deny(tx,'modern language course requires a language',t=>run(t,cmd({...noRows,courses:[course('MODY','MODY1000X',100)]})),['22023'],'valplan_invalid');
  // VP-16: the ladders decide the language, and the database agrees with the model for every subject in the catalog.
  const accepts=async(name,c)=>{const done=Symbol();try{await tx.savepoint(async t=>{await run(t,c);throw done;});}catch(e){if(e!==done)throw new Error(`${name}: ${e.code} ${e.message}`);}check(name);};
  const ladders={...noRows,kind:'modernLanguage'};
  await accepts('Moderna språk takes modersmål in two languages, teckenspråk without and finska with its own',cmd({...ladders,courses:[course('MODE','MODE1000X',100,{languageCode:'ar'}),course('MODE','MODE1000X',100,{languageCode:'so'}),course('SVEY','SVEY1000X',100),course('FINX','FINX1000X',100,{languageCode:'fi'})]}));
  await deny(tx,'modersmål requires a language',t=>run(t,cmd({...ladders,courses:[course('MODE','MODE1000X',100)]})),['22023'],'valplan_invalid');
  await deny(tx,'teckenspråk carries no language',t=>run(t,cmd({...ladders,courses:[course('SVEY','SVEY1000X',100,{languageCode:'fr'})]})),['22023'],'valplan_invalid');
  await deny(tx,'a minority language carries its own language only',t=>run(t,cmd({...ladders,courses:[course('FINX','FINX1000X',100,{languageCode:'se'})]})),['22023'],'valplan_invalid');
  await deny(tx,'språkämne keeps 4 kap. 1 a § and takes no modersmål',t=>run(t,cmd({...noRows,kind:'languageSubject',courses:[course('MODE','MODE1000X',100,{languageCode:'ar'})]})),['22023'],'valplan_invalid');
  const {valplanLanguageRule}=await import('../../web/lib/valplan-model.ts');
  const subjects=[...new Set(catalog.subjects.filter(x=>x.schoolTypes.includes('GY')).map(x=>x.code))];
  const sqlRules=new Map((await tx`select code,public.valplan_language_rule(code) rule from unnest(${subjects}::text[]) code`).map(r=>[r.code,r.rule]));
  for(const code of subjects){const r=valplanLanguageRule(code);assert.equal(sqlRules.get(code),r===null?null:!r.required?'none':r.fixed??'pick',code);}
  check(`the database language rule agrees with the model for ${subjects.length} subjects`);
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
  assert.equal(unlinked.result.read.rows.filter(r=>r.blocks.some(b=>b.valplanId===valplan.id)).length,1);
  const freed=(await run(tx,cmd({...other,rows:[link(ivRows[1])]})))[0].value;assert.equal(freed.result.read.valplans.length,2);check('an unlinked row can be filled by another valplan');
  await f.actor(tx,'principalB');await deny(tx,'principal of another school cannot read',t=>read(t),['42501']);await deny(tx,'principal of another school cannot save',t=>run(t,cmd({...noRows,id:randomUUID()})),['42501']);
  await f.actor(tx,'hm');await deny(tx,'huvudman cannot write school valplaner',t=>run(t,cmd({...noRows,id:randomUUID()})),['42501']);await f.actor(tx,'principalA');
  assert.deepEqual(await snapshot(tx,ordinary),before);check('timplaner, class links, tjänstefördelning and old elective tables are unchanged');
  await deny(tx,'versions cannot be rewritten',t=>t`update public.valplan_versions set document='{}'`,['42501']);await deny(tx,'command journal cannot be truncated',t=>t`truncate public.valplan_commands`,['42501']);
  const grants=await tx`select has_function_privilege('skolplattform_worker','public.valplan_command(jsonb)','execute') w,has_function_privilege('authenticated','public.valplan_command(jsonb)','execute') a,has_table_privilege('skolplattform_worker','public.valplans','select') t`;
  assert.deepEqual({...grants[0]},{w:true,a:false,t:false});check('only the worker may call the guarded entrypoints; tables are closed');
  // VP-12. Klasser väljs i blocket: en rad kan delas, men en klass på raden finns i högst ett block.
  const shared=ivRows[0],kept=shared.classIds[0],late=await linkExtraClass(tx,shared.timplanId,schoolYear,'SYN-SEN-A');
  const row=async()=>(await read()).result.rows.find(r=>r.timplanId===shared.timplanId&&r.rowKey==='block:iv1'),plan=async id=>(await read()).result.valplans.find(v=>v.valplan.id===id).valplan;
  let current=await row();assert.deepEqual(current.classIds.length,2);assert.deepEqual(current.blocks,[{valplanId:valplan.id,classIds:current.classIds}]);check('a class linked later is in the block until someone unticks it');
  const partner={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Andra blocket',revision:1,courses:[course('FILS','FILS2000X',50)],rows:[{...link(shared),excludedClassIds:[kept]}]};
  await deny(tx,'the same class in two blocks on a row is refused',t=>run(t,cmd(partner)),['40001'],'valplan_class_in_other_block');
  let first4=await plan(valplan.id);const exclude=(doc,ids)=>({...doc,rows:doc.rows.map(l=>l.timplanId===shared.timplanId?{...l,excludedClassIds:[...ids].sort()}:l)});
  await deny(tx,'a block cannot untick every class on its row',t=>run(t,cmd(exclude(first4,current.classIds),first4.revision)),['22023'],'valplan_row_without_classes');
  await deny(tx,'an unticked class must belong to the school',t=>run(t,cmd(exclude(first4,[randomUUID()]),first4.revision)),['22023'],'valplan_row_class');
  await deny(tx,'an unticked class is listed once',t=>run(t,cmd({...first4,rows:first4.rows.map(l=>({...l,excludedClassIds:[late,late]}))},first4.revision)),['22023'],'valplan_row_class');
  await deny(tx,'a course cannot name a class outside the block',t=>run(t,cmd({...exclude(first4,[late]),courses:[{...first4.courses[0],classIds:[late]}]},first4.revision)),['22023'],'valplan_course_class');
  await run(tx,cmd(exclude(first4,[late]),first4.revision));current=await row();
  assert.deepEqual(current.blocks,[{valplanId:valplan.id,classIds:[kept]}]);assert.deepEqual((await plan(valplan.id)).rows.find(l=>l.timplanId===shared.timplanId).excludedClassIds,[late]);check('the block stores the unticked class and keeps the rest');
  await run(tx,cmd(partner));current=await row();
  assert.deepEqual(current.blocks.map(b=>b.classIds).sort(),[[kept],[late]].sort());check('two blocks share a row with separate classes');
  const later=await linkExtraClass(tx,shared.timplanId,schoolYear,'SYN-SEN-B');current=await row();
  assert.equal(current.blocks.length,2);assert.ok(current.blocks.every(b=>b.classIds.includes(later)));check('a class linked later to a shared row is shown in both blocks until someone chooses');
  first4=await plan(valplan.id);await deny(tx,'a block with a doubled class cannot be saved until the class is unticked',t=>run(t,cmd({...first4,name:'Omdöpt'},first4.revision)),['40001'],'valplan_class_in_other_block');
  await run(tx,cmd(exclude(first4,[late,later]),first4.revision));current=await row();
  assert.deepEqual(current.blocks.find(b=>b.valplanId===valplan.id).classIds,[kept]);assert.ok(current.blocks.find(b=>b.valplanId===partner.id).classIds.includes(later));check('unticking the doubled class leaves it in one block');
  const closed=await tx`select relrowsecurity r,relforcerowsecurity f,has_table_privilege('skolplattform_worker','public.valplan_row_excluded_classes','select') w from pg_class where oid='public.valplan_row_excluded_classes'::regclass`;assert.deepEqual({...closed[0]},{r:true,f:true,w:false});
  const helpers=await tx`select has_function_privilege('skolplattform_worker','public.valplan_class_choices(public.valplans)','execute') a,has_function_privilege('skolplattform_worker','public.valplan_class_organized(jsonb,text)','execute') b`;assert.deepEqual({...helpers[0]},{a:false,b:false});check('the new table and its helpers are closed to the worker');
 });
 report.ok=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS`);
}catch(error){console.error('SQL verification failed:',error.code??'',error.message,error.where??'',error.stack??'');process.exitCode=1;}finally{await own.end();}
