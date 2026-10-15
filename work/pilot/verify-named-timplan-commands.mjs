#!/usr/bin/env node
// Private schema-only clone + repository synthetic fixtures. No live row export,
// no persistent apply, no HTTP/OIDC or actual concurrent-session claim.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,existsSync,openSync,writeSync,ftruncateSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNamedTimplanSnapshot,schemaFingerprint} from './named-timplan-snapshot.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {approvedClassFixture} from './verify-class-timplans.mjs';
import {parseNamedTimplanCreateRequest,parseNamedTimplanRenameRequest} from '../../web/lib/named-timplan.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const commandMigration='supabase/migrations/20261015201000_named_timplan_commands.sql';
const seriesMigration='supabase/migrations/20261015200000_named_timplan_series.sql';
const sqlTest='supabase/tests/phase5_named_timplan_commands.test.sql';
const rollback=Error('expected_named_commands_rollback');
const sha=x=>createHash('sha256').update(x).digest('hex');
function sources(){
 const paths=new Set([commandMigration,seriesMigration,sqlTest,'work/pilot/verify-named-timplan-commands.mjs',
  'web/lib/programplan-catalog.generated.json','supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql','supabase/tests/phase5_programplan_drafts.test.sql']);
 const visit=p=>{for(const m of readFileSync(resolve(root,p),'utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/gu)){
  const abs=resolve(dirname(resolve(root,p)),m[1]);if(abs.startsWith(root)&&existsSync(abs)){const rel=abs.slice(root.length);if(!paths.has(rel)){paths.add(rel);visit(rel);}}
 }};for(const p of [...paths])if(/\.(?:mjs|tsx?)$/u.test(p))visit(p);
 return Object.fromEntries([...paths].sort().map(p=>[p,sha(readFileSync(resolve(root,p)))]));
}
async function namedCreate(tx,q){return(await tx`select public.phase5_named_timplan_create(${tx.json(q)}) r`)[0].r;}
async function namedRename(tx,q){return(await tx`select public.phase5_named_timplan_rename(${tx.json(q)}) r`)[0].r;}
async function approvedSource(tx,f,n){
 await f.actor('hm');
 const [src]=await tx`select * from public.point_plans where id=${f.programId}`;
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
 select ${f.id(n)},organizer_id,unit_id,kind,'Syntetisk namngiven timplan','Syntetisk framtida kull',program_code,orientation_code,start_year from public.offerings where id=${f.id(46)}`;
 const p=(await tx`select public.phase5_create_programplan_draft(${f.id(n)},0,${tx.json(src.basis_reference)}) r`)[0].r;
 await f.actor('principal');await tx`select public.phase5_write_programplan_terms(${p.id},0,${tx.json(src.term_distribution)})`;
 await f.decision('programplan',p.id,'submit');await f.actor('hm');await f.decision('programplan',p.id,'approve');await f.actor('principal');
 const [current]=await tx`select revision from public.point_plans where id=${p.id}`;
 return {id:p.id,revision:current.revision,offeringId:f.id(n)};
}
async function matrix(tx,checks){
 const ok=name=>checks.push({name,ok:true});
 const denied=async(name,fn,code,hint)=>{let error;const before=await allPublicHashes(tx);
  try{await tx.savepoint(fn);}catch(e){error=e;}assert.ok(error,name);assert.equal(error.code,code,name);if(hint)assert.equal(error.hint,hint,name);
  assert.deepEqual(await allPublicHashes(tx),before,name+' no partial write');ok(name);
 };
 // A real legacy receipt and an approved class target predate both migrations.
 const f=await approvedClassFixture(tx,'SA25');
 const [oldReceipt]=await tx`select * from public.gym_timplan_receipts where timplan_id=${f.planId}`;
 const [oldPlan]=await tx`select revision from public.timplans where id=${f.planId}`;
 const c=(await tx`select public.phase5_class_command(${tx.json({operation:'create',commandId:randomUUID(),planId:f.planId,expectedPlanRevision:oldPlan.revision,name:'SYN-NAMED-A',startYear:f.year})}) r`)[0].r;
 await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:c.id,schoolYear:f.year,planId:f.planId,expectedPlanRevision:oldPlan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})})`;
 await tx`set constraints all immediate`;await tx.unsafe(readFileSync(resolve(root,seriesMigration),'utf8'));await tx`set constraints all deferred`;
 const original=await allPublicHashes(tx);
 await tx`set constraints all immediate`;await tx.unsafe(readFileSync(resolve(root,commandMigration),'utf8'));await tx`set constraints all deferred`;
 const after=await allPublicHashes(tx);for(const table of Object.keys(original))assert.deepEqual(after[table],original[table],table+' unchanged by command migration');ok('command migration leaves every preexisting synthetic public table byte-identical');
 await tx.unsafe(readFileSync(resolve(root,sqlTest),'utf8'));
 checks.push(...(await tx`select name from named_command_checks order by name`).map(r=>({name:r.name,ok:true})));
 for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
  await tx.savepoint(async t=>{await t.unsafe('set local role '+role);
   for(const statement of ["select public.phase5_named_timplan_create('{}'::jsonb)","select public.phase5_named_timplan_rename('{}'::jsonb)",'select * from public.named_timplan_commands','select * from public.timplan_series_name_events']){
    let err;try{await t.savepoint(s=>s.unsafe(statement));}catch(e){err=e;}assert.equal(err?.code,'42501');
   }await t`reset role`;
  });ok(role+' actual role denied closed commands and private history');
 }
 const [series]=await tx`select s.* from public.timplan_series s join public.timplans t on t.series_id=s.id where t.id=${f.planId}`;
 const rename=parseNamedTimplanRenameRequest({commandId:randomUUID(),planId:f.planId,seriesId:series.id,expectedSeriesRevision:0,name:'Grundfördelning A'});
 const preserved=await allPublicHashes(tx),renamed=await namedRename(tx,rename);
 assert.deepEqual(renamed,{planId:f.planId,series:{id:series.id,name:rename.name,revision:1},replayed:false});
 const afterRename=await allPublicHashes(tx);for(const table of Object.keys(preserved))if(!['timplan_series','timplan_series_name_events','named_timplan_commands','security_events'].includes(table))assert.deepEqual(afterRename[table],preserved[table],table+' rename preservation');
 ok('rename approved legacy plan changes only series/history/receipt/audit; exact class links, source, cells, decisions and timestamps preserved');
 const secondRename={...rename,commandId:randomUUID(),expectedSeriesRevision:1,name:'Grundfördelning B'};
 await namedRename(tx,secondRename);
 const replayed=await namedRename(tx,rename);assert.deepEqual(replayed,{...renamed,replayed:true});
 assert.equal((await tx`select name from public.timplan_series where id=${series.id}`)[0].name,secondRename.name);
 assert.equal((await tx`select count(*)::integer n from public.timplan_series_name_events where series_id=${series.id}`)[0].n,2);
 ok('rename replay returns immutable reviewed name/revision after later rename, without reverting live metadata or duplicating history');
 await denied('rename stale revision',s=>namedRename(s,{...rename,commandId:randomUUID()}),'40001','named_timplan_conflict');
 await denied('rename command different payload',s=>namedRename(s,{...rename,name:'Changed request'}),'40001','named_timplan_conflict');
 await denied('rename wrong series identity',s=>namedRename(s,{...rename,commandId:randomUUID(),seriesId:randomUUID()}),'42501');
 for(const role of ['hm','principal2']){await f.actor(role);await denied(role+' cannot rename/replay school plan',s=>namedRename(s,rename),'42501');}await f.actor('principal');
 await denied('other authorized actor cannot replay original receipt',async s=>{await f.actor('admin');await namedRename(s,rename);},'40001','named_timplan_conflict');await f.actor('principal');
 await denied('revoked session cannot replay',async s=>{await s`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.id(81)}`;await namedRename(s,rename);},'42501');
 const legacy=(await tx`select public.phase5_create_gym_timplan(${oldReceipt.command_id},${f.programId},${oldReceipt.request.expectedSourceRevision},${oldReceipt.request.expectedEducationRevision},${f.id(30)},null,null) r`)[0].r;
 assert.deepEqual(legacy.reply,{...oldReceipt.reply,revision:oldPlan.revision,replayed:true});assert.ok(!Object.hasOwn(legacy.reply,'series'));
 assert.deepEqual((await tx`select * from public.gym_timplan_receipts where command_id=${oldReceipt.command_id}`)[0],oldReceipt);ok('old receipt unchanged; old endpoint replay preserves original shape and established current revision semantics');
 await denied('new rename cannot reuse old create command',s=>namedRename(s,{...rename,commandId:oldReceipt.command_id,expectedSeriesRevision:2}),'40001','named_timplan_conflict');
 const source=await approvedSource(tx,f,47);
 const request=parseNamedTimplanCreateRequest({commandId:randomUUID(),sourcePlanId:source.id,expectedSourceRevision:source.revision,expectedEducationRevision:0,unitId:f.id(30),name:'Utökad matematik',copyFromPlanId:null,expectedCopyFromRevision:null});
 for(const role of ['hm','principal2']){await f.actor(role);await denied(role+' cannot create named school plan',s=>namedCreate(s,request),'42501');}await f.actor('principal');
 await denied('create stale program source',s=>namedCreate(s,{...request,expectedSourceRevision:request.expectedSourceRevision+1}),'40001','named_timplan_conflict');
 await denied('copy from another education denied',s=>namedCreate(s,{...request,copyFromPlanId:f.planId,expectedCopyFromRevision:oldPlan.revision}),'42501');
 for(const [label,patch] of [
  ['extra field',{unexpected:true}],['null source',{sourcePlanId:null}],['numeric ID',{commandId:7}],
  ['wrong UUID version',{commandId:'11111111-1111-7111-8111-111111111111'}],['wrong UUID variant',{commandId:'11111111-1111-4111-7111-111111111111'}],
  ['negative revision',{expectedSourceRevision:-1}],['fraction revision',{expectedSourceRevision:0.5}],
  ['half copy pair',{copyFromPlanId:f.planId}],['object name',{name:{text:'Name'}}],['edge space',{name:' Name'}],
  ['control name',{name:'Name\n'}],['format name',{name:'Name\u200d'}],['long astral name',{name:'😀'.repeat(81)}]
 ]) await denied('strict create contract '+label,t=>namedCreate(t,{...request,...patch}),'22023');
 for(const [label,patch] of [['extra field',{extra:1}],['null plan',{planId:null}],['bad UUID',{seriesId:'bad'}],['fraction revision',{expectedSeriesRevision:0.5}],['empty name',{name:''}],['format name',{name:'Name\u202e'}]])
  await denied('strict rename contract '+label,t=>namedRename(t,{...rename,...patch}),'22023');
 await denied('create audit failure rolls back series, plan, cells and receipt',async t=>{
  await t.unsafe("create function pg_temp.reject_named_create_audit() returns trigger language plpgsql as $$begin if new.action='named_timplan_created' then raise exception 'synthetic audit failure';end if;return new;end$$; create trigger named_create_audit_failure before insert on public.security_events for each row execute function pg_temp.reject_named_create_audit()");
  await namedCreate(t,request);
 },'55000');
 const created=await namedCreate(tx,request);assert.equal(created.reply.version,1);assert.equal(created.reply.revision,0);assert.equal(created.reply.series.name,request.name);assert.equal(created.reply.series.revision,0);assert.equal(created.reply.carriedRows,0);assert.ok(created.reply.resetRows>0);
 const [newPlan]=await tx`select * from public.timplans where id=${created.reply.id}`;assert.equal(newPlan.name_at_creation,request.name);assert.equal(newPlan.series_id,created.reply.series.id);assert.equal(newPlan.offering_id,source.offeringId);
 ok('new explicitly named first plan has own stable series and version1, copied source and empty allocations');
 const frozenReceipt=(await tx`select reply from public.named_timplan_commands where command_id=${request.commandId}`)[0].reply;
 const oldCells=await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${created.reply.id} order by row_id`;
 const [firstRow]=await tx`select row_id from public.timplan_cells where timplan_id=${created.reply.id} order by row_id`;
 const dist=newPlan.gym_basis.distribution.find(d=>d.rowKey===firstRow.row_id);const hours=dist.points.map(n=>n>0?45:null);
 await tx`select public.phase5_write_gym_timplan_row(${created.reply.id},0,${firstRow.row_id},${tx.json(hours)})`;
 await namedRename(tx,{commandId:randomUUID(),planId:created.reply.id,seriesId:newPlan.series_id,expectedSeriesRevision:0,name:'Ny benämning'});
 const createReplay=await namedCreate(tx,request);assert.deepEqual(createReplay.reply,{...frozenReceipt,replayed:true});assert.equal(createReplay.plan.revision,1);
 assert.equal((await tx`select name from public.timplan_series where id=${newPlan.series_id}`)[0].name,'Ny benämning');ok('new create replay preserves revision0 and original name snapshot while current plan may have changed');
 await denied('create command cannot change reviewed name',s=>namedCreate(s,{...request,name:'Another'}),'40001','named_timplan_conflict');
 await denied('duplicate name is typed conflict',s=>namedCreate(s,{...request,commandId:randomUUID(),name:'NY BENÄMNING'}),'40001','timplan_name_conflict');
 await denied('copy stale revision fails before index',s=>namedCreate(s,{...request,commandId:randomUUID(),name:'Copy',copyFromPlanId:newPlan.id,expectedCopyFromRevision:0}),'40001','named_timplan_conflict');
 await denied('second independent named plan remains atomically blocked until04 rollout',s=>namedCreate(s,{...request,commandId:randomUUID(),name:'Copy',copyFromPlanId:newPlan.id,expectedCopyFromRevision:1}),'23505');
 const [oldCopyCells]=await tx`select jsonb_agg(to_jsonb(c) order by row_id) value from public.timplan_cells c where timplan_id=${newPlan.id}`;
 const next=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${source.id},${source.revision},0,${f.id(30)},${newPlan.id},1) r`)[0].r;
 const [nextPlan]=await tx`select * from public.timplans where id=${next.reply.id}`;
 assert.equal(nextPlan.series_id,newPlan.series_id);assert.equal(nextPlan.version,2);assert.equal(nextPlan.name_at_creation,'Ny benämning');assert.equal(next.reply.carriedRows,oldCells.length);assert.equal(next.reply.resetRows,0);
 const [sameCells]=await tx`select jsonb_agg(to_jsonb(c) order by row_id) value from public.timplan_cells c where timplan_id=${newPlan.id}`;assert.deepEqual(sameCells,oldCopyCells);
 const copied=await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${nextPlan.id} order by row_id`;
 assert.deepEqual(copied,await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${newPlan.id} order by row_id`);
 ok('new version preserves same series, increments local version and snapshots current name with exact copied hours');
 await denied('legacy null-predecessor cannot fork a nondefault named series',s=>s`select public.phase5_create_gym_timplan(${randomUUID()},${source.id},${source.revision},0,${f.id(30)},null,null)`,'40001','named_timplan_choice_required');
 await denied('legacy endpoint cannot reuse new command ID',s=>s`select public.phase5_create_gym_timplan(${request.commandId},${source.id},${source.revision},0,${f.id(30)},${nextPlan.id},0)`,'40001');
 await denied('name history immutable',s=>s`update public.timplan_series_name_events set old_name='Changed' where series_id=${series.id}`,'55000');
 await denied('named receipt immutable',s=>s`delete from public.named_timplan_commands where command_id=${request.commandId}`,'55000');
 await denied('name audit failure rolls back series revision and append-only rows',async s=>{
  await s.unsafe("create function pg_temp.reject_named_audit() returns trigger language plpgsql as $$begin if new.action='timplan_name_changed' then raise exception 'synthetic audit failure';end if;return new;end$$; create trigger named_audit_failure before insert on public.security_events for each row execute function pg_temp.reject_named_audit()");
  await namedRename(s,{...rename,commandId:randomUUID(),expectedSeriesRevision:2,name:'Must roll back'});
 },'55000');
 const classTables=['school_classes','class_timplans','pupil_class_memberships','pupil_placements'];
 const beforeCopy=await allPublicHashes(tx);const [copySource]=await tx`select p.revision,p.basis_reference,o.lifecycle_revision from public.point_plans p join public.offerings o on o.id=p.offering_id where p.id=${f.programId}`;
 const copyReference={...copySource.basis_reference,startedOn:`${Number(copySource.basis_reference.startedOn.slice(0,4))+1}-08-01`};
 await f.actor('hm');
 const cohortCopy=(await tx`select public.phase5_copy_programplan_education(${randomUUID()},${f.programId},${copySource.revision},${copySource.lifecycle_revision},${f.id(30)},'Syntetisk nästa kull',null,'Syntetisk senare kull',${tx.json(copyReference)},false) r`)[0].r;
 assert.notEqual(cohortCopy.education.id,f.id(46));
 assert.equal((await tx`select count(*)::integer n from public.school_classes where offering_id=${cohortCopy.education.id}`)[0].n,0);
 assert.equal((await tx`select count(*)::integer n from public.timplans where offering_id=${cohortCopy.education.id}`)[0].n,0);
 const afterCopy=await allPublicHashes(tx);for(const table of classTables)assert.deepEqual(afterCopy[table],beforeCopy[table]);
 await f.actor('principal');ok('protected later-cohort copy preserves established program-only scope, no timplan/class/member/link copied or changed');
 await tx`set constraints all immediate`;ok('all deferred source/series/matrix/history FK constraints checked');
}
export async function verifyNamedCommands(out){
 out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));
 const fd=openSync(out,'wx',0o600);const report={kind:'named-timplan-commands-schema-only',schemaVersion:1,status:'FAIL',runId:randomUUID(),checks:[],startedAt:new Date().toISOString(),
 limitations:['Schema-only source export; no live table rows copied','Repository synthetic fixtures only; no original-data migration claim','No persistent apply','No actual multi-session concurrency','No HTTP/OIDC/MFA proof; existing protected route enforces MFA','Second named plan remains blocked by old uniqueness until plan04']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let snapshot;
 try{
  report.sources=sources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const db=snapshot.db;report.before=await allPublicHashes(db);report.beforeSchema=await schemaFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='90s'`;await tx`set local transaction_timeout='240s'`;
   await matrix(tx,report.checks);throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
  report.after=await allPublicHashes(db);report.afterSchema=await schemaFingerprint(db);assert.deepEqual(report.after,report.before);assert.equal(report.afterSchema,report.beforeSchema);report.rollbackRestored=true;
 }catch(e){report.failure={name:e.name,code:e.code,message:e.message,hint:e.hint,where:e.where,position:e.position};}
 finally{
  try{report.finalSources=sources();assert.deepEqual(report.finalSources,report.sources);}catch(e){report.sourceFailure={message:e.message};}
  try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(e){report.cleanupFailure={message:e.message};}
  if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.rollbackRestored)report.status='PASS';
  report.completedAt=new Date().toISOString();save();closeSync(fd);
 }
 console.log(`${report.status}: ${report.checks.length} named command checks; rollback=${report.rollbackRestored===true}; private report ${out}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Use --out /private/tmp/report.json');assert.equal(process.argv[2],'--out');
 if((await verifyNamedCommands(process.argv[3])).status!=='PASS')process.exitCode=1;
}
