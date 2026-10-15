#!/usr/bin/env node
// NAMED-TIMPLANS-UX-02. No work runs on import. Every mutation rolls back.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,existsSync,openSync,writeSync,ftruncateSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNamedTimplanSnapshot} from './named-timplan-snapshot.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {approvedClassFixture,classTimplanScenarios,sourceHashes as existingSources} from './verify-class-timplans.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const migration='supabase/migrations/20261015200000_named_timplan_series.sql';
const test='supabase/tests/phase5_named_timplan_series.test.sql';
const rollback=Error('expected_named_series_rollback');
const hash=s=>createHash('sha256').update(s).digest('hex');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
export function namedSeriesSources(){
 const paths=new Set([migration,test,'work/pilot/verify-named-timplan-series.mjs','web/lib/programplan-catalog.generated.json','supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql','supabase/tests/phase5_programplan_drafts.test.sql',...Object.keys(existingSources())]);
 const visit=path=>{for(const m of readFileSync(resolve(root,path),'utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/gu)){
  const abs=resolve(dirname(resolve(root,path)),m[1]);if(abs.startsWith(root)&&existsSync(abs)){const rel=abs.slice(root.length);if(!paths.has(rel)){paths.add(rel);visit(rel);}}
 }};for(const p of [...paths])if(/\.(?:mjs|tsx?)$/u.test(p))visit(p);
 return Object.fromEntries([...paths].sort().map(p=>[p,hash(readFileSync(resolve(root,p)))]));
}
async function projection(tx,tables){
 const result={};for(const table of tables){const value=`to_jsonb(r)${table==='timplans'?"-'series_id'-'name_at_creation'":''}`;
  [result[table]]=await tx.unsafe(`select count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(h,'' order by h),''),'UTF8')),'hex') hash from (select encode(sha256(convert_to((${value})::text,'UTF8')),'hex') h from public.${quote(table)} r) rows`);
 }return result;
}
async function triggers(tx){return tx`select tgname,tgenabled,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid='public.timplans'::regclass and not tgisinternal order by tgname`;}
async function install(tx){
 assert.equal((await tx`select to_regclass('public.timplan_series') existing`)[0].existing,null,'Additive schema already installed');
 await tx`set constraints all immediate`;await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));await tx`set constraints all deferred`;
}
async function createGym(tx,f,predecessor=null){
 const [p]=await tx`select revision from public.point_plans where id=${f.programId}`;
 const revision=predecessor?(await tx`select revision from public.timplans where id=${predecessor}`)[0].revision:null;
 return(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${f.programId},${p.revision},0,${f.id(30)},${predecessor},${revision}) r`)[0].r;
}
async function seed(tx){
 const f=await approvedClassFixture(tx,'SA25');
 const second=await createGym(tx,f,f.planId);
 const [p]=await tx`select revision from public.timplans where id=${f.planId}`;
 const request={operation:'create',commandId:randomUUID(),planId:f.planId,expectedPlanRevision:p.revision,name:'SERIES-BEFORE',startYear:f.year};
 const c=(await tx`select public.phase5_class_command(${tx.json(request)}) r`)[0].r;
 await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:c.id,schoolYear:f.year,planId:f.planId,expectedPlanRevision:p.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})})`;
 for(const [n,kind]of [[47,'grundskola'],[48,'introduktionsprogram'],[49,'grundskola']])await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values(${f.id(n)},${f.id(2)},${f.id(30)},${kind},'Syntetisk seriefixtur','Syntetisk')`;
 const [grund]=await tx`insert into public.timplans(organizer_id,offering_id,unit_id,version,status,decided_on) values(${f.id(2)},${f.id(47)},${f.id(30)},1,'faststalld',current_date) returning id`;
 await tx`insert into public.timplans(organizer_id,offering_id,unit_id,version) values(${f.id(2)},${f.id(47)},${f.id(30)},2),(${f.id(2)},${f.id(48)},${f.id(30)},1)`;
 await tx`create temporary table named_series_context(value jsonb) on commit drop`;
 await tx`insert into named_series_context values(${tx.json({planId:f.planId,secondPlan:second.reply.id,grundPlan:grund.id,foreignUnit:f.id(31),emptyOffering:f.id(49)})})`;
 return{...f,secondId:second.reply.id,oldClassId:c.id};
}
async function unicodeParity(tx,checks){
 const values=new Set(['Grundfördelning','Utökad matematik','ÅÄÖ åäö','A  B','A\u00a0B','\u00a0','e\u0301','é','😀'.repeat(80),'😀'.repeat(81),'a'.repeat(80),'a'.repeat(81),' A','A ','']);
 for(let cp=1;cp<=0x10ffff;cp++)if(/[\p{Cc}\p{Cf}\p{Cs}]/u.test(String.fromCodePoint(cp))){for(const c of [cp-1,cp,cp+1])if(c>0&&c<=0x10ffff&&(c<0xd800||c>0xdfff))values.add('A'+String.fromCodePoint(c)+'B');}
 const rows=await tx`select n,public.phase5_timplan_series_name(n) ok from unnest(${[...values]}::text[]) n`;
 for(const {n,ok}of rows)assert.equal(ok,[...n].length>=1&&[...n].length<=80&&!n.startsWith(' ')&&!n.endsWith(' ')&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(n));
 for(const n of ['"\\ud800"','"\\udc00"','"A\\ud800B"','"\\u0000"']){let e;try{await tx.savepoint(t=>t`select (${n}::text)::jsonb`);}catch(error){e=error;}assert.equal(e?.code,n==='"\\u0000"'?'22P05':'22P02');}
 checks.push({name:`${rows.length} SQL Unicode name parity probes; lone surrogate and NUL transport rejection; Unicode ${process.versions.unicode}`,ok:true});
}
async function matrix(tx,checks,report){
 const f=await seed(tx),tables=Object.keys(await allPublicHashes(tx));
 const before=await projection(tx,tables),oldTriggers=await triggers(tx);
 const oldIndexes=await tx`select indexname,indexdef from pg_indexes where schemaname='public' and tablename='timplans' order by indexname`;
 await install(tx);
 report.migrationProjection={before,after:await projection(tx,tables)};assert.deepEqual(report.migrationProjection.after,before);
 assert.deepEqual((await triggers(tx)).filter(r=>r.tgname!=='timplans_series_binding'),[...oldTriggers]);
 const newIndexes=await tx`select indexname,indexdef from pg_indexes where schemaname='public' and tablename='timplans' order by indexname`;
 assert.deepEqual(newIndexes.filter(i=>i.indexname!=='timplans_series_version'),[...oldIndexes]);
 checks.push({name:'all original columns in every public table, trigger activation and original indexes preserved across migration',ok:true});
 await tx.unsafe(readFileSync(resolve(root,test),'utf8'));
 checks.push(...(await tx`select name from named_series_checks order by name`).map(r=>({name:r.name,ok:true})));
 await unicodeParity(tx,checks);
 for(const role of ['anon','authenticated','service_role','skolplattform_worker'])await tx.savepoint(async t=>{
  await t.unsafe('set local role '+quote(role));for(const statement of ['select * from public.timplan_series','insert into public.timplan_series default values','select public.phase5_timplan_series_name(\'A\')']){let e;try{await t.savepoint(s=>s.unsafe(statement));}catch(error){e=error;}assert.equal(e?.code,'42501');}await t`reset role`;checks.push({name:role+' actual DB role cannot read/write private series or call helper',ok:true});
 });
 const [first]=await tx`insert into public.timplans(organizer_id,offering_id,unit_id,version) values(${f.id(2)},${f.id(49)},${f.id(30)},1) returning series_id,name_at_creation`;
 assert.equal(first.name_at_creation,'Grundfördelning');assert.equal((await tx`select count(*)::integer n from public.timplan_series where offering_id=${f.id(49)}`)[0].n,1);checks.push({name:'first legacy insert atomically creates sole default for empty education',ok:true});
 const [old]=await tx`select series_id from public.timplans where id=${f.planId}`;
 const priorLinks=(await tx`select to_jsonb(c) r from public.class_timplans c where class_id=${f.oldClassId}`);
 const next=await createGym(tx,f,f.secondId);
 const [created]=await tx`select series_id,name_at_creation from public.timplans where id=${next.reply.id}`;
 assert.equal(created.series_id,old.series_id);assert.equal(created.name_at_creation,'Grundfördelning');
 await f.decision('timplan',next.reply.id,'submit');await f.actor('hm');await f.decision('timplan',next.reply.id,'approve');
 assert.equal((await tx`select status from public.timplans where id=${f.planId}`)[0].status,'ersatt');
 assert.deepEqual(await tx`select to_jsonb(c) r from public.class_timplans c where class_id=${f.oldClassId}`,priorLinks);
 checks.push({name:'legacy create submit approve stays in default chain and preserves exact old class link',ok:true});
 await tx`set constraints all immediate`;
}
export async function verifyNamedSeries(out){
 out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);
 const report={kind:'named-timplan-series-rollback',schemaVersion:1,status:'FAIL',stage:'started',runId:randomUUID(),target:'protected',startedAt:new Date().toISOString(),checks:[],limitations:['No persistent apply','No independent parallel chains activated','No two-session concurrency claim','No HTTP/OIDC verification','SQL uses current protected schema with repository synthetic fixtures only; no live user data copied']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let db,snapshot,lockStarted;
 try{
  report.sources=namedSeriesSources();report.stage='isolated-schema-only-snapshot';save();
  snapshot=await createNamedTimplanSnapshot();db=snapshot.db;report.snapshot=snapshot.provenance;
  try{await db.begin('isolation level read committed',async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='90s'`;
   await tx`set local transaction_timeout='240s'`;
   // Locks apply only to our private schema-only fixture database, never live.
   // Keep exact baseline/inner rollback/final comparison within one transaction.
   const tables=(await tx`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename);
   await tx.unsafe('lock table '+tables.map(t=>'public.'+quote(t)).join(',')+' in share row exclusive mode');
   lockStarted=performance.now();
   report.before=await allPublicHashes(tx);report.beforeFingerprint=await vocationalDatabaseFingerprint(tx);
   const frame=async fn=>{try{await tx.savepoint(async s=>{await fn(s);throw rollback;});}catch(e){if(e!==rollback)throw e;}};
   try{
    report.stage='matrix';save();await frame(s=>matrix(s,report.checks,report));
    report.stage='legacy-regressions';save();
    for(const code of ['SA25','BF25'])await frame(async s=>{await install(s);await classTimplanScenarios(s,report.checks,code);await s`set constraints all immediate`;});
   }catch(e){report.failure={code:e.code,message:e.message,hint:e.hint,where:e.where,position:e.position};}
   report.stage='preservation';save();
   report.after=await allPublicHashes(tx);report.afterFingerprint=await vocationalDatabaseFingerprint(tx);
   assert.deepEqual(report.after,report.before);assert.equal(report.afterFingerprint,report.beforeFingerprint);report.rollbackRestored=true;
   report.comparisonHeldOriginalTableLocks=true;report.lockHoldMs=Math.round(performance.now()-lockStarted);
   throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
 }catch(e){report.failure??={code:e.code,message:e.message,hint:e.hint,where:e.where,position:e.position};}
 finally{
  try{report.finalSources=namedSeriesSources();assert.deepEqual(report.finalSources,report.sources);}
  catch(e){report.preservationFailure={code:e.code,message:e.message};}
  try{if(snapshot)report.snapshotCleanup=await snapshot.cleanup();else if(db)await db.end();report.databaseClosed=true;}catch(e){report.preservationFailure={code:e.code,message:e.message};}
  if(lockStarted&&!report.lockHoldMs)report.lockHoldMs=Math.round(performance.now()-lockStarted);
  if(!report.failure&&!report.preservationFailure&&report.rollbackRestored){report.status='PASS';report.stage='complete';}
  report.completedAt=new Date().toISOString();save();closeSync(fd);
 }
 console.log(`${report.status}: ${report.checks.length} named series checks; rollback=${report.rollbackRestored===true}; details in private report`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Use --out /private/tmp/report.json');assert.equal(process.argv[2],'--out');
 const r=await verifyNamedSeries(process.argv[3]);if(r.status!=='PASS')process.exitCode=1;
}
