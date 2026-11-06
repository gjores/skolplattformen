#!/usr/bin/env node
// VP-09. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture,planRead,staffWithDuties} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
import {capturePlanContext,yearCommand,yearCommandSend,yearPreview,yearSend} from './tjanst-year-fixtures.mjs';
import {parseYearPlanReadReply} from '../../web/lib/tjanst-contract.ts';
import {parseElectiveCommand,parseElectiveRead,parseElectiveReceipt,createElectiveCommandRef} from '../../web/lib/elective-block-contract.ts';
import {legacyBlocks,nextLegacyStep} from '../../web/lib/legacy-block-retirement.ts';
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const own=await createEphemeralMigratedDb(),report={kind:'ephemeral-legacy-block-retirement-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/legacy-block-retirement-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),first=await seedElectiveTimeFrame(tx,f),{unitId,schoolYear}=first,scope={unitId,schoolYear};
  const teacher=await staffWithDuties(tx,f,{familyName:'Blocklärare',startsOn:'2025-07-01',duties:[{unitId,percent:100,startsOn:`${schoolYear}-07-01`}]});await f.actor(tx,'principalA');
  const today=(await tx`select public.app_today()::text value`)[0].value;
  const worker=async run=>{await tx`set local role skolplattform_worker`;try{return await run();}finally{await tx`reset role`;}};
  const electiveRead=()=>worker(async()=>parseElectiveRead((await tx`select public.elective_block_read(${tx.json(scope)}) value`)[0].value.result,scope));
  const plan=()=>worker(async()=>parseYearPlanReadReply(await planRead(tx,scope),scope));
  const elective=async(action,payload)=>{const q=parseElectiveCommand({...scope,commandId:randomUUID(),expectedRevision:(await electiveRead()).revision,action,payload});
   return worker(async()=>parseElectiveReceipt((await tx`select public.elective_block_command(${tx.json(q)}) value`)[0].value.result,await createElectiveCommandRef(q)));};
  const tj=async(action,payload,choice)=>{const captured=await capturePlanContext(tx,{...scope,action,payload,...(choice?{choice}:{})});return(await yearCommandSend(tx,await yearCommand(captured))).result.detail;};
  const needs=r=>r.classes.flatMap(c=>c.needs).filter(n=>n.rowKey==='block:iv1');
  const source=(await electiveRead()).sources.find(s=>s.rowKey==='block:iv1');assert.ok(source);
  const levelCode=source.allowedOptionCodes[0],subject=catalog.subjects.find(s=>s.schoolTypes.includes('GY')&&s.items.some(i=>i.code===levelCode));
  const option=(id,name)=>({id,name,subjectCode:subject.code,levelCode,language:null,points:subject.items.find(i=>i.code===levelCode).points});
  const block=(name,groupNames)=>{const blockId=randomUUID(),options=groupNames.map(g=>option(randomUUID(),g));return{id:blockId,kind:source.blockKind,name,startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,sourceRefs:[source],options,
   groups:options.map(o=>({id:randomUUID(),optionId:o.id,name:o.name,startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,classIds:[source.classId],sourceKeys:[source.sourceKey],estimatedPupils:10}))};};
  const applied=block('Gammalt individuellt val',['Psykologi a','Psykologi b']);
  await elective('save_block',{expectedBlockRevision:null,block:applied});await elective('apply_groups',{blockId:applied.id,expectedBlockRevision:1});
  const sourceKey=`teaching_group:${applied.groups[0].id}:${schoolYear}`,support=await yearPreview(tx,{...scope,mode:'row',sourceKey,rowId:null}),candidate=support.candidates.find(c=>c.personId===teacher.id)??support.candidates[0];
  await tj('save_row',{rowId:null,sourceKind:'teaching_group',sourceKey,personId:candidate.personId,teacherHt:source.needHt,teacherVt:source.needVt,comment:''},'manual');
  const before=await yearPreview(tx,{...scope,mode:'catalog'});await yearSend(tx,unitId,schoolYear,'publish',{mutationContext:{baseVersionId:before.baseVersionId,expectedBasisHash:before.basisHash}});
  const published=await plan(),publishedId=published.version.id;
  assert.equal(published.version.status,'published');assert.equal(published.rows.filter(r=>r.sourceKind==='teaching_group').length,1);
  const[listed]=legacyBlocks(await electiveRead(),published,today);assert.deepEqual([listed.block.id,listed.rowIds.length,listed.block.groups.length],[applied.id,1,2]);
  check('the view lists an applied block with its published tjänst row');
  const steps=[];
  while(true){
   const read=await electiveRead(),current=await plan(),step=nextLegacyStep(read,current,applied.id,today);if(!step)break;assert.ok(!('stop' in step));steps.push(step.kind==='delete_row'?step.kind:step.action);
   if(step.kind==='delete_row'){const c=await yearPreview(tx,{...scope,mode:'catalog'});await worker(()=>yearSend(tx,unitId,schoolYear,'delete_row',{rowId:step.rowId,mutationContext:{baseVersionId:c.baseVersionId,expectedBasisHash:c.basisHash}}));}
   else await elective(step.action,step.payload);
   assert.ok(steps.length<10);
  }
  assert.deepEqual(steps,['delete_row','retire_group','retire_group']);check('the same step function retires the block through existing Worker commands');
  const after=await plan(),read=await electiveRead();
  assert.equal(after.version.status,'draft');assert.equal(after.rows.filter(r=>r.sourceKind==='teaching_group').length,0);
  const history=parseYearPlanReadReply(await planRead(tx,{...scope,versionId:publishedId}),{...scope,versionId:publishedId});
  assert.equal(history.rows.filter(r=>r.sourceKind==='teaching_group').length,1);check('the row leaves the new draft and stays in the published version');
  assert.equal(read.blocks.find(b=>b.id===applied.id).groups.length,0);assert.ok(read.releasedBlockIds.includes(applied.id));assert.equal(read.retiredGroups.length,2);
  assert.equal(legacyBlocks(read,after,today).length,0);check('the groups keep their identity as retired and the block leaves the list');
  assert.equal(after.groups?.length??0,0);assert.ok(needs(after).length>0&&needs(after).every(n=>n.organizationPending===true));assert.ok(after.blockers.some(b=>b.code==='organization_pending'));
  check('the timplan row is counted once and waits for organization, which blocks publication');
  const unapplied=block('Aldrig tillämpat',['Psykologi c']);await elective('save_block',{expectedBlockRevision:null,block:unapplied});
  const step=nextLegacyStep(await electiveRead(),await plan(),unapplied.id,today);assert.equal(step.action,'retire_group');await elective(step.action,step.payload);
  assert.equal(nextLegacyStep(await electiveRead(),await plan(),unapplied.id,today),null);check('a block that was never applied retires the same way');
  const rows=(await tx`select public.valplan_read(${tx.json(scope)}) value`)[0].value.result.rows.filter(r=>r.rowKey==='block:iv1');
  const course={id:randomUUID(),subjectCode:'PSYL',subjectVersion:version('PSYL'),itemCode:'PSYL1000X',points:50,languageCode:null,name:'Psykologi 1',minutesHt:1350,minutesVt:1350,classIds:null};
  const doc={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Individuellt val',revision:1,courses:[course],rows:rows.map(r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year}))};
  await tx`select public.valplan_command(${tx.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision:0,catalogId:catalog.catalogId,valplan:doc})})`;
  await tx`select public.study_group_command(${tx.json({contractVersion:'study_group_v1',commandId:randomUUID(),action:'save_group',unitId,schoolYear,payload:{id:randomUUID(),expectedRevision:0,name:'Psykologi 1',startsOn:`${schoolYear}-08-17`,endsOn:`${schoolYear+1}-06-11`,course:{subjectCode:'PSYL',subjectVersion:version('PSYL'),itemCode:'PSYL1000X',points:50,languageCode:null},minutesHt:1350,minutesVt:1350,parallelSetId:randomUUID(),classIds:[source.classId],origin:{kind:'valplan',valplanId:doc.id,courseId:course.id}}})})`;
  const organized=await plan();assert.equal(needs(organized).length,0);assert.ok(!organized.blockers.some(b=>b.code==='organization_pending'));assert.equal(organized.groups.length,1);
  check('a valplan group takes over the row and clears the publication stop');
  throw Object.assign(new Error('rollback'),{rollback:true});
 }).catch(e=>{if(!e.rollback)throw e;});
 report.ok=true;report.total=report.checks.length;console.log(`PASS ${report.total} legacy block retirement SQL checks`);
}finally{writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});await own.end();}
