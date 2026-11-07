#!/usr/bin/env node
// VP-10. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture,planRead} from './tjanst-fixtures.mjs';
import {seedSlotBlockFrame} from './valplan-block-fixtures.mjs';
import {parseYearPlanReadReply} from '../../web/lib/tjanst-contract.ts';
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const own=await createEphemeralMigratedDb(),report={kind:'ephemeral-valplan-block-kinds-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/valplan-block-kinds-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
async function deny(tx,name,run,codes,hint){let e;try{await tx.savepoint(nested=>run(nested));}catch(error){e=error;}assert.ok(e,name);assert.ok(codes.includes(e.code),`${name}: ${e.code} ${e.message}`);if(hint)assert.equal(e.hint,hint,name);check(name);}
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const course=(subjectCode,itemCode,points,extra={})=>({id:randomUUID(),subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`${subjectCode} ${itemCode}`,minutesHt:points*30,minutesVt:points*30,classIds:null,...extra});
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),hu=await seedSlotBlockFrame(tx,f,'HU25','HUSPK','block:sprk'),na=await seedSlotBlockFrame(tx,f,'NA25','NANAA','block:nave');
  const unitId=hu.unitId,schoolYear=hu.schoolYear,scope={unitId,schoolYear},{inGroup:pupilA,inGroup2:pupilB,outside:pupilC}=f.pupils;
  await tx`set local session_replication_role=replica`;
  await tx`update public.pupil_class_memberships set class_id=${hu.classId} where pupil_id in ${tx([pupilA,pupilB])}`;await tx`update public.pupil_class_memberships set class_id=${na.classId} where pupil_id=${pupilC}`;
  await tx`set local session_replication_role=origin`;
  const read=async(t=tx)=>(await t`select public.valplan_read(${t.json(scope)}) value`)[0].value.result;
  const save=(t,doc,expectedRevision=0)=>t`select public.valplan_command(${t.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision,catalogId:catalog.catalogId,valplan:doc})}) value`;
  const link=r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year,excludedClassIds:[]});
  const rows=(await read()).rows,sprk=rows.find(r=>r.rowKey==='block:sprk'),nave=rows.find(r=>r.rowKey==='block:nave');
  assert.deepEqual([sprk.blockKind,sprk.points,sprk.classIds],['languageSubject',300,[hu.classId]]);assert.deepEqual([nave.blockKind,nave.points,nave.classIds],['naturalScience',100,[na.classId]]);
  check('the HUSPK and NANAA rows are read with their kind, points and classes');
  const plan=(kind,row,courses)=>({id:randomUUID(),unitId,schoolYear,kind,name:row.rowLabel,revision:1,courses,rows:[link(row)]});
  const spanish=course('MODO','MODO1000X',100,{languageCode:'es'}),english=course('ENGE','ENGE3000X',100),greek=course('KLAS','KLAS1000X',100),latin=course('LATI','LATI2000X',100);
  const chem=course('KEMI','KEMI2000X',100),bio=course('BIOE','BIOE1000X',100);
  await deny(tx,'an individual choice plan cannot fill a Språkämne row',t=>save(t,plan('individualChoice',sprk,[english])),['22023'],'valplan_row_kind');
  await deny(tx,'a Språkämne plan cannot fill a naturvetenskapligt row',t=>save(t,plan('languageSubject',nave,[english])),['22023'],'valplan_row_kind');
  await deny(tx,'a subject outside 4 kap. 1 a § is refused in Språkämne',t=>save(t,plan('languageSubject',sprk,[course('PSYL','PSYL1000X',50)])),['22023'],'valplan_invalid');
  await deny(tx,'a subject outside 4 kap. 1 a § is refused in naturvetenskapligt ämne',t=>save(t,plan('naturalScience',nave,[english])),['22023'],'valplan_invalid');
  await deny(tx,'a modern language in Språkämne needs a language',t=>save(t,plan('languageSubject',sprk,[course('MODO','MODO1000X',100)])),['22023'],'valplan_invalid');
  const language=plan('languageSubject',sprk,[spanish,english,greek,latin]),science=plan('naturalScience',nave,[chem,bio]);
  await save(tx,language);await save(tx,science);
  const after=await read();assert.equal(after.valplans.length,2);assert.deepEqual(after.rows.find(r=>r.rowKey==='block:sprk').blocks.map(b=>b.valplanId),[language.id]);assert.deepEqual(after.rows.find(r=>r.rowKey==='block:nave').blocks.map(b=>b.valplanId),[science.id]);
  assert.equal(after.valplans.find(v=>v.valplan.id===language.id).valplan.courses[0].languageCode,'es');check('both blocks are filled, and a modern language in Språkämne keeps its language');
  const staff=async(doc,action,payload)=>(await tx`select public.valplan_choice_command(${tx.json({contractVersion:'valplan_choice_v1',commandId:randomUUID(),action,unitId,schoolYear,valplanId:doc.id,payload})}) value`)[0].value.result;
  const later=(await tx`select (public.app_today()+30)::text value`)[0].value;
  await staff(language,'set_policy',{guardianConfirmation:false});
  for(const [doc,picks] of [[language,[[pupilA,[spanish,english,greek]],[pupilB,[english,greek,latin]]]],[science,[[pupilC,[chem]]]]]){
   const opened=await staff(doc,'open_round',{expectedRevision:0,closesOn:later});
   for(const [pupilId,courses] of picks){await staff(doc,'record_choice',{pupilId,expectedChoiceRevision:0,courseIds:courses.map(c=>c.id)});await staff(doc,'confirm_choice',{pupilId,expectedChoiceRevision:1});}
   await staff(doc,'close_round',{expectedRevision:opened.read.round.revision});
  }
  check('pupils in the classes choose exactly the points of their row, and the choices are confirmed');
  const made=await staff(language,'create_groups',{}),other=await staff(science,'create_groups',{});
  assert.deepEqual([made.receipt.created,made.receipt.added],[4,6]);assert.deepEqual([other.receipt.created,other.receipt.added],[1,1]);
  const groups=await tx`select g.valplan_id,g.language_code,count(m.id)::int n from public.study_groups g join public.study_group_memberships m on m.group_id=g.id group by g.id order by 1,2`;
  assert.equal(groups.length,5);assert.equal(groups.filter(g=>g.language_code==='es').length,1);check('groups are created from the choices, one per chosen course, and the language follows');
  const needs=parseYearPlanReadReply(await planRead(tx,scope),scope),classNeeds=needs.classes.flatMap(c=>c.needs);
  assert.equal(classNeeds.filter(n=>['block:sprk','block:nave'].includes(n.rowKey)).length,0);assert.equal(needs.groups.length,5);assert.ok(needs.groups.every(g=>g.sourceKind==='study_group'&&g.needHt===3000&&g.needVt===3000));
  check('the need is counted once: the groups carry it and the rows are no class needs');
 });
 report.ok=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS`);
}catch(error){console.error('SQL verification failed:',error.code??'',error.message,error.hint??'',error.stack??'');process.exitCode=1;}finally{await own.end();}
