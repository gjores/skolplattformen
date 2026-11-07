#!/usr/bin/env node
// VP-12. Befintliga block ska behålla sina klasser. Provet sparar ett block med det gamla schemat och installerar sedan
// migrationen ovanpå. Own temporary PostgreSQL with synthetic fixtures only. Never reads an existing DB URL or 3012.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture} from './tjanst-fixtures.mjs';
import {seedElectiveTimeFrame} from './elective-time-fixtures.mjs';
import {linkExtraClass} from './valplan-block-fixtures.mjs';
const file='20261107110000_valplan_class_selection.sql';
const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
const later=['20261107120000_valplan_open_check.sql']; // Bygger på den här migrationen och installeras efter den.
const own=await createEphemeralMigratedDb({exclude:[file,...later]}),report={kind:'ephemeral-valplan-class-migration-sql',provenance:own.provenance,checks:[],ok:false};
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/valplan-class-migration-sql.json';assert.ok(out?.startsWith('/private/tmp/'));
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const course=(subjectCode,itemCode,points,extra={})=>({id:randomUUID(),subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`${subjectCode} ${itemCode}`,minutesHt:points*27,minutesVt:points*27,classIds:null,...extra});
try{
 await own.db.begin(async tx=>{
  const f=await createTjanstFixture(tx),first=await seedElectiveTimeFrame(tx,f),second=await seedElectiveTimeFrame(tx,f);await f.actor(tx,'principalA');
  const unitId=first.unitId,schoolYear=first.schoolYear,scope={unitId,schoolYear},read=async()=>(await tx`select public.valplan_read(${tx.json(scope)}) value`)[0].value.result;
  const rows=(await read()).rows.filter(r=>r.rowKey==='block:iv1');assert.equal(rows.length,2);
  const planId=rows[0].timplanId,extraClass=await linkExtraClass(tx,planId,schoolYear,'SYN-BEFINTLIG');
  const before=(await read()).rows.filter(r=>r.rowKey==='block:iv1'),limited=before[0].classIds[0];
  const doc={id:randomUUID(),unitId,schoolYear,kind:'individualChoice',name:'Befintligt block',revision:1,courses:[course('PSYL','PSYL1000X',50),course('RETO','RETO1000X',100,{classIds:[limited]})],
   rows:before.map(r=>({timplanId:r.timplanId,timplanVersion:r.timplanVersion,rowKey:r.rowKey,year:r.year}))};
  await tx`select public.valplan_command(${tx.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision:0,catalogId:catalog.catalogId,valplan:doc})})`;
  const old=(await read()).rows.filter(r=>r.rowKey==='block:iv1');assert.ok(old.every(r=>r.linkedValplanId===doc.id));
  const tables=['valplans','valplan_courses','valplan_course_classes','valplan_rows','valplan_versions','valplan_commands'],snapshot=async()=>{const result={};for(const name of tables)result[name]=(await tx.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C"),'[]') value from public.${name} x`))[0].value;return result;};
  const stored=await snapshot();check('a block with a two-class row is saved on the old schema');
  await tx.unsafe('reset role');for(const name of [file,...later])await tx.unsafe(readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));await f.actor(tx,'principalA');
  assert.deepEqual(await snapshot(),stored);assert.equal((await tx`select count(*)::int n from public.valplan_row_excluded_classes`)[0].n,0);check('the migration changes no stored block and unticks no class');
  const after=(await read()),now=after.rows.filter(r=>r.rowKey==='block:iv1');
  for(const r of old){const n=now.find(x=>x.timplanId===r.timplanId);assert.deepEqual(n.classIds,r.classIds);assert.deepEqual(n.blocks,[{valplanId:doc.id,classIds:r.classIds}]);}
  assert.ok(now.find(r=>r.timplanId===planId).classIds.includes(extraClass));check('every class on the rows stays in the block after the migration');
  const block=after.valplans[0].valplan;assert.ok(block.rows.every(l=>l.excludedClassIds.length===0));assert.deepEqual(block.courses.find(c=>c.subjectCode==='RETO').classIds,[limited]);assert.deepEqual(after.valplans[0].choiceCounts,[]);check('course class limits are kept and the block reads in the new shape');
  await tx`select public.valplan_command(${tx.json({contractVersion:'valplan_v1',commandId:randomUUID(),action:'save',unitId,schoolYear,expectedRevision:1,catalogId:catalog.catalogId,valplan:{...block,name:'Efter migrationen'}})})`;
  assert.deepEqual((await read()).rows.filter(r=>r.rowKey==='block:iv1').map(r=>r.blocks[0].classIds).sort(),now.map(r=>r.classIds).sort());check('the block can be saved again with the same classes');
  const constraints=await tx`select conname from pg_constraint where conrelid='public.valplan_rows'::regclass and contype='u'`;assert.equal(constraints.length,0);check('a row is no longer unique per block');
  throw new Error('rollback');
 }).catch(e=>{if(e.message!=='rollback')throw e;});
 report.ok=true;
}finally{writeFileSync(out,JSON.stringify(report,null,1),{mode:0o600});await own.end();}
console.log(`valplan-class-migration-sql ${report.checks.length} PASS`);
