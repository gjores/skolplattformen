#!/usr/bin/env node
// 05.1-18: isolated SQL only. --ephemeral builds a private PostgreSQL; default copies schema only.
// node work/pilot/verify-tjanst-year-commands.mjs --ephemeral --out /private/tmp/tjanst-year-preview.json
// node work/pilot/verify-tjanst-year-commands.mjs --out /private/tmp/tjanst-year-preview-schema.json
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { planRead, planSend, planCommand, planStatus, planRef, grantSelf, personalCommand, saveDuties, seedGy25Class } from './tjanst-fixtures.mjs';
import { createTjanstYearFixture, seedYearHistory, yearPreview, yearRawPreview, yearManual, yearVacant, yearRowPayload, yearSend, capturePlanContext, yearCommand, yearCommandSend } from './tjanst-year-fixtures.mjs';
import { parseYearReply, tjanstYearHash } from '../../web/lib/tjanst-year-contract.ts';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261023120000_tjanst_year_commands.sql';
const rollback = Error('expected_year_preview_rollback');
const sourceFiles = [OWN, 'work/pilot/verify-tjanst-year-commands.mjs', 'work/pilot/tjanst-year-fixtures.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs',
  'web/lib/tjanst-year-contract.ts', 'supabase/tests/phase51_tjanst_year_hash_vectors.json'];
// Pin transitive repository modules, including dynamic literal imports used by the adapters.
// Runtime binaries/packages and SQL migration files are recorded separately by DB provenance.
const sources = () => {
  const pending = [...sourceFiles], found = new Map();
  while (pending.length) {
    const path = pending.pop(); if (found.has(path)) continue;
    const bytes = readFileSync(resolve(ROOT,path)); found.set(path,createHash('sha256').update(bytes).digest('hex'));
    if (!/\.(?:mjs|ts)$/u.test(path)) continue;
    const ts = createRequire(resolve(ROOT,'web/package.json'))('typescript');
    const parsed = ts.createSourceFile(path,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
    const imports = [];
    const visit = node => {
      const specifier = (ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node,visit);
    };visit(parsed);
    for (const specifier of imports) {
      let target = resolve(ROOT,dirname(path),specifier);
      if (!existsSync(target)) target += '.ts';
      assert.ok(target.startsWith(ROOT) && existsSync(target),'Unresolved local source '+specifier+' from '+path);
      pending.push(relative(ROOT,target));
    }
  }
  return Object.fromEntries([...found].sort(([a],[b])=>a.localeCompare(b)));
};
const check = (r, name, detail) => { r.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); };
async function denied(t, r, name, fn, code, hint) {
  let error; try { await t.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial'); assert.equal(error.code, code, error.message);
  if (hint) assert.equal(error.hint, hint);
  check(r, name, { code, ...(hint ? { hint } : {}) });
}
async function rolledBack(db, fn) {
  try { await db.begin(async t => { await t`set local lock_timeout='10s'`; await t`set local statement_timeout='120s'`; await fn(t); throw rollback; }); }
  catch (e) { if (e !== rollback) throw e; }
}
const businessHashes = async t => { const values = await allPublicHashes(t); delete values.security_events; return values; };

async function savepoint(t, fn) {
  try { await t.savepoint(async u => { await fn(u); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
}

const row = (s,personId,extra={}) => ({rowId:null,sourceKind:'class_timplan',sourceKey:s.key(),personId,teacherHt:600,teacherVt:800,comment:'Syntetisk kommentar',...extra});
const special = (personId,extra={}) => ({specialId:null,kind:'annat',label:'Syntetiskt uppdrag',personId,classId:null,ht:100,vt:120,comment:'Bevara',...extra});
const capture = (t,s,action,payload,choice) => capturePlanContext(t,{unitId:s.unitId,schoolYear:s.schoolYear,action,payload,choice});
const captureCommand = async (t,s,action,payload,choice) => yearCommand(await capture(t,s,action,payload,choice));
const send = async (t,capturedCommand) => (await yearCommandSend(t,capturedCommand)).result.detail;
const read = (t,s) => planRead(t,{unitId:s.unitId,schoolYear:s.schoolYear});
async function unchangedDeny(t,r,name,fn,code,hint) {const before=await allPublicHashes(t);await denied(t,r,name,fn,code,hint);assert.deepEqual(await allPublicHashes(t),before,name+': all tables unchanged');}
const fullVersion = async(t,id)=> {
 const [x]=await t`select jsonb_build_object(
  'rows',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.tjanst_rows r where version_id=${id}),
  'specials',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from public.tjanst_special_assignments s where version_id=${id}),
  'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.tjanst_joint_groups g where version_id=${id}),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.group_id,m.row_id),'[]') from public.tjanst_joint_members m join public.tjanst_joint_groups g on g.id=m.group_id where g.version_id=${id}),
  'times',(select coalesce(jsonb_agg(to_jsonb(v) order by v.group_id,v.staff_person_id),'[]') from public.tjanst_joint_teacher_time v join public.tjanst_joint_groups g on g.id=v.group_id where g.version_id=${id}),
  'teachers',(select coalesce(jsonb_agg(to_jsonb(v) order by v.staff_person_id),'[]') from public.tjanst_version_teachers v where version_id=${id})) value`;return x.value;
};
const normalizeRows = xs => xs.map(({id,version_id,created_at,updated_at,...x})=>x).sort((a,b)=>a.lineage_id.localeCompare(b.lineage_id));
async function cases(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),{f,people,unitId,schoolYear}=s,p=people[0].personId,p2=people[1].personId;
  let d=await read(t,s);assert.equal(d.version,null);assert.equal(d.capabilities.canEdit,true);assert.ok(!d.actions.includes('create_draft'));assert.ok(d.actions.includes('move'));
  check(report,'empty year is directly editable, no create_draft action');
  for(const action of ['create_draft','save_row','add_teacher']) await unchangedDeny(t,report,'new legacy '+action+' cannot write',async u=>planSend(u,await planCommand(unitId,schoolYear,action,0,action==='create_draft'?{basedOnVersionId:null}:action==='save_row'?row(s,p):{personId:p})),'22023','tjanst_context_required');
  let q=await captureCommand(t,s,'save_row',row(s,p),'manual');assert.ok(Object.isFrozen(await capture(t,s,'save_row',row(s,p),'manual')));
  const initial=await allPublicHashes(t),firstCommand=q;const first=await yearCommandSend(t,q);d=first.result.detail;
  assert.equal(d.revision,1);assert.equal(d.version.status,'draft');assert.equal(d.rows.length,1);assert.equal(d.rows[0].personId,p);
  assert.equal((await t`select count(*)::int n from public.tjanst_commands where command_id=${q.commandId}`)[0].n,1);
  check(report,'first captured write atomically creates distribution/draft and one revision/journal/receipt');
  const saved=await allPublicHashes(t),again=await yearCommandSend(t,q);assert.equal(again.result.receipt.replayed,true);assert.deepEqual(await allPublicHashes(t),saved);
  const status=await planStatus(t,{command:planRef(q)});assert.equal(status.result.state,'completed');
  check(report,'lost response can be reconciled by status and exact retry without another write');
  await unchangedDeny(t,report,'same id changed payload denied',async u=>planSend(u,{...q,payload:{...q.payload,comment:'changed'}}),'40001','tjanst_command_conflict');
  await f.actor(t,'admin');await unchangedDeny(t,report,'same id changed actor denied',u=>planSend(u,q),'40001','tjanst_command_conflict');await f.actor(t,'principalA');
  await unchangedDeny(t,report,'old revision frozen command denied',u=>planSend(u,{...q,commandId:randomUUID()}),'40001','tjanst_revision_conflict');
  const id=d.rows[0].id;
  q=await captureCommand(t,s,'save_row',row(s,p,{rowId:id,teacherHt:777}),'manual');
  await savepoint(t,async u=>{
   await f.actor(u,'hm');await personalCommand(u,saveDuties(p,people[0].revision,people[0].employmentId,[{unitId,percent:40,startsOn:'2026-07-01'}]));await f.actor(u,'principalA');
   await unchangedDeny(u,report,'manual selected person percent changed despite same plan revision',v=>planSend(v,q),'40001','tjanst_stale_person');
  });
  const mutation=await captureCommand(t,s,'save_special',special(p));
  await savepoint(t,async u=>{
   await f.actor(u,'hm');await personalCommand(u,saveDuties(p,people[0].revision,people[0].employmentId,[{unitId,percent:40,startsOn:'2026-07-01'}]));await f.actor(u,'principalA');
   await unchangedDeny(u,report,'catalog mutation invalidated by changed still-valid personnel share',v=>planSend(v,mutation),'40001','tjanst_stale_basis');
  });
  await savepoint(t,async u=>{
   const [{revision}]=await u`select revision from public.class_timplans where class_id=${f.classes.group} and start_year=${schoolYear}`;
   await u`select public.phase51_grim_class_command(${u.json({action:'link',commandId:randomUUID(),classId:f.classes.group,planId:s.g.grPlan,expectedPlanRevision:0,columnId:'ak9',expectedLinkRevision:revision,previousPlanId:s.g.grPlan})})`;
   await unchangedDeny(u,report,'real class link invalidates old captured row',v=>planSend(v,q),'40001','tjanst_stale_basis');
  });
  await savepoint(t,async u=>{
   await u`set local session_replication_role=replica`;await u`update public.school_year_days set kind='studiedag' where school_year_id in(select id from public.school_years where unit_id=${unitId} and start_year=${schoolYear}) and day='2026-10-30'`;await u`set local session_replication_role=origin`;
   await unchangedDeny(u,report,'explicit synthetic calendar source invalidates context (no calendar write API)',v=>planSend(v,q),'40001','tjanst_stale_basis');
  });
  await savepoint(t,async u=>{
   await u.unsafe("create or replace function public.tjanst_year_history(unit uuid,year integer) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic history failure' using errcode='P5101';end$$");
   const result=await yearCommandSend(u,q);assert.equal(result.result.detail.rows[0].teacherHt,777);
   check(report,'frozen manual choice survives unavailable optional history');
  });
  const history=await seedYearHistory(t,s);
  const sup=await yearPreview(t,s.request({rowId:id}));assert.equal(sup.recommendationStatus,'ready');
  const suggestion=sup.suggestions.find(x=>x.personId===p);assert.ok(suggestion);
  const selected={kind:'suggestion',personId:p,expectedPersonBasisHash:sup.candidates.find(x=>x.personId===p).personBasisHash,suggestionId:suggestion.suggestionId,expectedEvidenceHash:suggestion.evidenceHash};
  q=await captureCommand(t,s,'save_row',row(s,p,{rowId:id}),selected);
  await savepoint(t,async u=>{await u.unsafe("create or replace function public.tjanst_year_history(unit uuid,year integer) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic history failure' using errcode='P5101';end$$");await unchangedDeny(u,report,'frozen suggestion fails unavailable historical evidence',v=>planSend(v,q),'40001','tjanst_stale_evidence');});
  await unchangedDeny(t,report,'ordinary mentor rejects previous GR class same name',async u=>planSend(u,await captureCommand(u,s,'save_special',special(p,{kind:'mentor',classId:history.classId}))),'22023','tjanst_unknown_source');
  const cat=await yearPreview(t,{unitId,schoolYear,mode:'catalog'}),candidate=cat.candidates.find(x=>x.personId===p);
  const batch={action:'bulk',baseVersionId:cat.baseVersionId,items:[{itemKey:'oldmentor',kind:'special',payload:special(p,{kind:'mentor',classId:history.classId}),choice:yearManual(candidate)}]};
  assert.ok((await yearPreview(t,{unitId,schoolYear,mode:'batch',batch})).blockers.some(x=>x.code==='unknown_class'));
  await unchangedDeny(t,report,'bulk mentor shares ordinary current-class boundary',async u=>planSend(u,await captureCommand(u,s,'bulk',batch)),'40001','tjanst_stale_basis');
  d=await send(t,await captureCommand(t,s,'save_special',special(p)));const specialId=d.specials[0].id;
  d=await send(t,await captureCommand(t,s,'save_row',row(s,p,{sourceKey:s.key('matematik',f.classes.other)}),'manual'));
  const rowIds=d.rows.map(x=>x.id);
  d=await send(t,await captureCommand(t,s,'save_joint',{jointId:null,name:'Syntetisk samläsning',rowIds,teachers:[{personId:p,ht:400,vt:500}]}));
  const jointId=d.joints[0].id;
  await unchangedDeny(t,report,'remove teacher rejects remaining rows specials and joint time',async u=>planSend(u,await captureCommand(u,s,'remove_teacher',{personId:p})),'22023','tjanst_teacher_not_empty');
  for(const [table,action,payload,choice] of [
   ['tjanst_rows','save_row',row(s,p,{rowId:rowIds[0],teacherHt:999}),'manual'],
   ['tjanst_special_assignments','save_special',special(p,{specialId,ht:777}),undefined],
   ['tjanst_joint_groups','save_joint',{jointId,name:'Explicit update',rowIds,teachers:[{personId:p,ht:440,vt:550}]},undefined]]) await savepoint(t,async u=>{
    const cmd=await captureCommand(u,s,action,payload,choice);
    await u.unsafe("create function public.synthetic_18_fail() returns trigger language plpgsql as $$begin raise exception 'Synthetic applied update failure' using errcode='55000';end$$");
    await u.unsafe('create trigger synthetic_18_fail after UPDATE on public.'+table+' for each row execute function public.synthetic_18_fail()');
    await unchangedDeny(u,report,'failure after existing-draft '+table+' UPDATE restores every table',v=>planSend(v,cmd),'55000');
  });
  d=await send(t,await captureCommand(t,s,'add_teacher',{personId:p2}));
  d=await send(t,await captureCommand(t,s,'publish',{}));const published=d.version.id,full=await fullVersion(t,published),frozen=await read(t,s);
  assert.equal(d.version.status,'published');assert.equal(d.capabilities.canEdit,true);assert.ok(!d.actions.includes('publish'));
  check(report,'published current plan remains directly editable without exposing publish/discard');
  const replayBefore=await allPublicHashes(t);assert.equal((await yearCommandSend(t,firstCommand)).result.receipt.replayed,true);assert.deepEqual(await allPublicHashes(t),replayBefore);
  check(report,'original authenticated receipt replays after revision/base/source changes without fresh-context checks');
  await unchangedDeny(t,report,'same command id changed year target is rejected',async u=>planSend(u,await planCommand(unitId,schoolYear+1,'save_row',firstCommand.expectedRevision,{...firstCommand.payload,sourceKey:s.key('matematik',f.classes.group,schoolYear+1)},{commandId:firstCommand.commandId})),'40001','tjanst_command_conflict');
  for(const [action,payload,choice] of [
   ['save_row',row(s,p,{rowId:rowIds[0],teacherHt:999,comment:'Explicit continued planning'}),'manual'],
   ['save_special',special(p,{specialId,ht:777,comment:'Explicit special edit'}),undefined],
   ['add_teacher',{personId:s.draftPersonId},undefined]]) await savepoint(t,async u=>{
    const result=await send(u,await captureCommand(u,s,action,payload,choice));assert.notEqual(result.version.id,published);assert.deepEqual(await fullVersion(u,published),full);
    assert.equal(result.revision,frozen.revision+1);assert.equal(result.rows.length,full.rows.length);assert.equal(result.specials.length,full.specials.length);assert.equal(result.joints.length,full.groups.length);
    check(report,'first '+action+' after publication creates complete copy and leaves full publication unchanged');
   });
  await savepoint(t,async u=>{
   const result=await send(u,await captureCommand(u,s,'save_joint',{jointId,name:'Samma grupp',rowIds,teachers:[{personId:p,ht:440,vt:550}]}));
   assert.notEqual(result.version.id,published);assert.equal(result.revision,frozen.revision+1);
   assert.ok(result.rows.every(x=>!rowIds.includes(x.id)));assert.notEqual(result.specials[0].id,specialId);assert.notEqual(result.joints[0].id,jointId);
   const copied=await fullVersion(u,result.version.id);assert.deepEqual(normalizeRows(copied.rows),normalizeRows(full.rows));assert.deepEqual(normalizeRows(copied.specials),normalizeRows(full.specials));
   assert.deepEqual(await fullVersion(u,published),full);assert.ok(result.joints[0].rowIds.every(x=>result.rows.some(r=>r.id===x)));assert.equal(result.joints[0].teachers[0].ht,440);
   check(report,'first published group edit copies full snapshots/comments/lineages and maps every group/member/special ID');
  });
  await savepoint(t,async u=>{
   const result=await send(u,await captureCommand(u,s,'remove_teacher',{personId:p2}));assert.notEqual(result.version.id,published);assert.ok(!result.teachers.some(x=>x.personId===p2));assert.deepEqual(await fullVersion(u,published),full);
   check(report,'explicit empty teacher removal after publish copies atomically and leaves published data unchanged');
  });
  await unchangedDeny(t,report,'remove absent teacher leaves no draft',async u=>planSend(u,await captureCommand(u,s,'remove_teacher',{personId:s.draftPersonId})),'22023','tjanst_teacher_not_found');
  await unchangedDeny(t,report,'ordinary delete still enforces WR02 after mapping into new draft',async u=>planSend(u,await captureCommand(u,s,'delete_row',{rowId:rowIds[0]})),'22023','tjanst_joint_already');
  await savepoint(t,async u=>{const result=await send(u,await captureCommand(u,s,'dissolve_joint',{jointId}));assert.equal(result.joints.length,0);assert.deepEqual(normalizeRows((await fullVersion(u,result.version.id)).rows),normalizeRows(full.rows));assert.deepEqual(await fullVersion(u,published),full);check(report,'dissolve after publication preserves each row own times and original publication');});
  // Every injected failure happens after a meaningful write; savepoint rollback compares every table.
  for(const [table,op] of [['tjanst_versions','INSERT'],['tjanst_rows','INSERT'],['tjanst_special_assignments','INSERT'],['tjanst_joint_groups','INSERT'],['tjanst_joint_members','INSERT'],['tjanst_commands','INSERT'],['security_events','INSERT']]) await savepoint(t,async u=>{
   const cmd=await captureCommand(u,s,'save_row',row(s,p,{rowId:rowIds[0],teacherHt:900}),'manual');
   await u.unsafe("create function public.synthetic_18_fail() returns trigger language plpgsql as $$begin raise exception 'Synthetic post-write failure' using errcode='55000';end$$");
   await u.unsafe('create trigger synthetic_18_fail after '+op+' on public.'+table+' for each row execute function public.synthetic_18_fail()');
   await unchangedDeny(u,report,'failure after '+table+' INSERT during internal copy or journal/audit restores every table',v=>planSend(v,cmd),'55000');
  });
  await savepoint(t,async u=>{
   await u.unsafe("create or replace function public.tjanst_year_map_id(kind text,object_id uuid,source_version uuid,target_version uuid) returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic missing lineage mapping' using errcode='40001',hint='tjanst_stale_basis';end$$");
   await unchangedDeny(u,report,'missing lineage mapping rolls back complete internal copy',async v=>planSend(v,await captureCommand(v,s,'save_special',special(p,{specialId}))),'40001','tjanst_stale_basis');
  });
  d=await send(t,await captureCommand(t,s,'delete_special',{specialId}));assert.equal(d.specials.length,0);assert.deepEqual(await fullVersion(t,published),full);
  d=await send(t,await captureCommand(t,s,'discard_draft',{}));assert.equal(d.version.id,published);assert.equal(d.version.status,'published');
  check(report,'delete special and discard use copied IDs and restore published current view');
 });
 await batchCases(db,report);
}
async function batchCases(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),{f,people,unitId,schoolYear}=s,p=people[0].personId,p2=people[1].personId;
  const support=await yearPreview(t,s.request()),support2=await yearPreview(t,s.request({sourceKey:s.key('matematik',f.classes.other)}));
  let batch={action:'bulk',baseVersionId:null,items:[{itemKey:'row1',kind:'row',payload:yearRowPayload(support,yearManual(support.candidates.find(x=>x.personId===p)))},{itemKey:'row2',kind:'row',payload:yearRowPayload(support2,yearManual(support2.candidates.find(x=>x.personId===p)))},{itemKey:'special',kind:'special',payload:special(p),choice:yearManual(support.candidates.find(x=>x.personId===p))}]};
  const q=await captureCommand(t,s,'bulk',batch),reply=await yearCommandSend(t,q);let d=reply.result.detail;
  assert.equal(d.revision,1);assert.equal(d.rows.length,2);assert.equal(d.specials.length,1);assert.equal((await t`select count(*)::int n from public.tjanst_commands where command_id=${q.commandId}`)[0].n,1);
  check(report,'bulk first mutation creates one draft/revision/journal for selected rows and special only');
  d=await send(t,await captureCommand(t,s,'save_joint',{jointId:null,name:'Grupp',rowIds:d.rows.map(x=>x.id),teachers:[{personId:p,ht:400,vt:500}]}));
  let catalog=await yearPreview(t,{unitId,schoolYear,mode:'catalog'}),target=yearManual(catalog.candidates.find(x=>x.personId===p2));
  batch={action:'move',baseVersionId:d.version.id,items:d.rows.map((x,i)=>({itemKey:'r'+i,kind:'row',id:x.id,fromPersonId:p,choice:target}))};
  const partial={...batch,items:batch.items.slice(0,1)};
  await unchangedDeny(t,report,'partial joint group move blocked atomically',async u=>planSend(u,await captureCommand(u,s,'move',partial)),'40001','tjanst_stale_basis');
  batch.items.push({itemKey:'s',kind:'special',id:d.specials[0].id,fromPersonId:p,choice:target});
  const move=await captureCommand(t,s,'move',batch);
  await savepoint(t,async u=>{
   await u.unsafe("create function public.synthetic_18_fail() returns trigger language plpgsql as $$begin if new.timplan_row_key like '__move_%' then raise exception 'Synthetic reserved row failure' using errcode='55000';end if;return new;end$$");
   await u.unsafe('create trigger synthetic_18_fail after update on public.tjanst_rows for each row execute function public.synthetic_18_fail()');
   await unchangedDeny(u,report,'failure after batch reservation restores exact original source keys',v=>planSend(v,move),'55000');
  });
  await savepoint(t,async u=>{
   await u.unsafe("create function public.synthetic_18_fail() returns trigger language plpgsql as $$begin if old.staff_person_id is distinct from new.staff_person_id then raise exception 'Synthetic applied move failure' using errcode='55000';end if;return new;end$$");
   await u.unsafe('create trigger synthetic_18_fail after update on public.tjanst_rows for each row execute function public.synthetic_18_fail()');
   await unchangedDeny(u,report,'failure after first real moved row restores all reservations and person assignments',v=>planSend(v,move),'55000');
  });
  const before=d;d=(await yearCommandSend(t,move)).result.detail;assert.equal(d.revision,before.revision+1);assert.ok(d.rows.every(x=>x.personId===p2));assert.equal(d.specials[0].personId,p2);assert.deepEqual(d.joints[0].teachers,[{personId:p2,ht:400,vt:500}]);
  assert.deepEqual(d.rows.map(x=>[x.id,x.sourceKey,x.teacherHt,x.teacherVt,x.comment]),before.rows.map(x=>[x.id,x.sourceKey,x.teacherHt,x.teacherVt,x.comment]));
  check(report,'complete joint move preserves row times/source/comments and counts group time once');
  await f.actor(t,'hm');await personalCommand(t,saveDuties(p,people[0].revision,people[0].employmentId,[]));await f.actor(t,'principalA');
  d=await read(t,s);assert.ok(d.blockers.some(x=>x.code==='person_not_at_school'));
  check(report,'departed source with empty deliberate column remains correctly blocked by WR10');
  const remove=await captureCommand(t,s,'remove_teacher',{personId:p});d=(await yearCommandSend(t,remove)).result.detail;assert.ok(!d.teachers.some(x=>x.personId===p));assert.ok(!d.blockers.some(x=>x.code==='person_not_at_school'));
  assert.equal((await yearCommandSend(t,remove)).result.receipt.replayed,true);d=await send(t,await captureCommand(t,s,'publish',{}));assert.equal(d.version.status,'published');
  check(report,'explicit removal of empty departed column resolves WR10 and enables publish without changing personnel');
 });
 // Immediate unique constraints must allow a final noncolliding A/B swap within one atomic batch.
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),{people,unitId,schoolYear}=s,p=people[0].personId,p2=people[1].personId;
  await send(t,await captureCommand(t,s,'save_row',row(s,p),'manual'));let d=await send(t,await captureCommand(t,s,'save_row',row(s,p2),'manual'));
  // Explicit synthetic legacy row-key boundary: colon suffix must survive reservation/permutation verbatim.
  const colonKey='synthetic:legacy:colon';await t`update public.tjanst_rows set timplan_row_key=${colonKey},source_key=${s.key(colonKey)} where version_id=${d.version.id}`;
  d=await read(t,s);const fullBefore=await fullVersion(t,d.version.id);
  const cat=await yearPreview(t,{unitId,schoolYear,mode:'catalog'});
  const batch={action:'move',baseVersionId:d.version.id,items:d.rows.map((x,i)=>({itemKey:'swap'+i,kind:'row',id:x.id,fromPersonId:x.personId,choice:yearManual(cat.candidates.find(c=>c.personId===(x.personId===p?p2:p)))}))};
  const old=d.rows;d=await send(t,await captureCommand(t,s,'move',batch));for(const r of d.rows){const previous=old.find(x=>x.id===r.id);assert.equal(r.sourceKey,previous.sourceKey);assert.notEqual(r.personId,previous.personId);assert.equal(r.teacherHt,previous.teacherHt);}
  assert.equal((await t`select count(*)::int n from public.tjanst_rows where timplan_row_key like '__move_%'`)[0].n,0);
  const fullAfter=await fullVersion(t,d.version.id);
  assert.deepEqual(normalizeRows(fullAfter.rows).map(({staff_person_id,...r})=>r),normalizeRows(fullBefore.rows).map(({staff_person_id,...r})=>r));
  assert.ok(fullAfter.rows.every(r=>r.timplan_row_key===colonKey&&r.source_key===s.key(colonKey)));
  check(report,'same-source A/B permutation preserves full colon-containing snapshots and leaves no reserved key');
 });
}

async function groupBoundaryCases(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),{f,unitId,schoolYear,people}=s,p=people[0].personId,p2=people[1].personId;let d;
  for(const personId of [p,p2])for(const classId of [f.classes.group,f.classes.other])d=await send(t,await captureCommand(t,s,'save_row',row(s,personId,{sourceKey:s.key('matematik',classId)}),'manual'));
  d=await send(t,await captureCommand(t,s,'save_joint',{jointId:null,name:'Tvålärare',rowIds:d.rows.map(r=>r.id),teachers:[{personId:p,ht:100,vt:200},{personId:p2,ht:300,vt:400}]}));
  const cat=await yearPreview(t,{unitId,schoolYear,mode:'catalog'}),choice=yearManual(cat.candidates.find(x=>x.personId===s.draftPersonId));
  const batch={action:'move',baseVersionId:d.version.id,items:d.rows.filter(x=>x.personId===p).map((x,i)=>({itemKey:'r'+i,kind:'row',id:x.id,fromPersonId:p,choice}))};
  const captured=await captureCommand(t,s,'move',batch),full=await fullVersion(t,d.version.id);
  await savepoint(t,async u=>{
   await u`update public.tjanst_joint_teacher_time set ht_minutes=ht_minutes+1 where group_id=${d.joints[0].id} and staff_person_id=${p2}`;
   await unchangedDeny(u,report,'unchanged other teacher group time invalidates frozen batch hash',v=>planSend(v,captured),'40001','tjanst_stale_basis');
  });
  const collision={...batch,items:batch.items.map(x=>({...x,choice:yearManual(cat.candidates.find(c=>c.personId===p2))}))};
  await unchangedDeny(t,report,'move into existing group teacher is rejected before mutation',async u=>planSend(u,await captureCommand(u,s,'move',collision)),'40001','tjanst_stale_basis');
  await savepoint(t,async u=>{
   const result=(await yearCommandSend(u,captured)).result.detail,after=await fullVersion(u,d.version.id);
   assert.deepEqual(normalizeRows(after.rows.filter(x=>x.staff_person_id===p2)),normalizeRows(full.rows.filter(x=>x.staff_person_id===p2)));
   assert.deepEqual(result.joints[0].teachers.find(x=>x.personId===p2),{personId:p2,ht:300,vt:400});assert.equal(result.joints[0].teachers.find(x=>x.personId===s.draftPersonId).ht,100);
   check(report,'selected group teacher moves while all other teacher rows and group times remain identical');
  });
  const base=d.rows.find(x=>x.personId===p2),group=d.joints[0].id;
  for(let n=4;n<100;n++) {const id=randomUUID(),key='synthetic:boundary:'+n;await t`insert into public.tjanst_rows select (jsonb_populate_record(null::public.tjanst_rows,to_jsonb(r)||jsonb_build_object('id',${id}::uuid,'lineage_id',${randomUUID()}::uuid,'source_key',${s.key(key,base.classId)}::text,'timplan_row_key',${key}::text))).* from public.tjanst_rows r where r.id=${base.id}`;await t`insert into public.tjanst_joint_members(group_id,row_id) values(${group},${id})`;}
  await savepoint(t,async u=>{const preview=await yearPreview(u,{unitId,schoolYear,mode:'batch',batch});assert.equal(preview.writeObjectCount,100);const result=await send(u,await captureCommand(u,s,'move',batch));assert.equal(result.rows.length,100);assert.equal(result.joints[0].teachers.length,2);check(report,'actual apply accepts100 affected group members while only explicit source-person rows move');});
  const specialId=randomUUID();await t`insert into public.tjanst_special_assignments(id,version_id,lineage_id,kind,label,staff_person_id,ht_minutes,vt_minutes,comment) values(${specialId},${d.version.id},${randomUUID()},'annat','Explicit extra',${p},60,0,'')`;
  await unchangedDeny(t,report,'100 affected group rows plus selected special101 is atomically blocked',async u=>planSend(u,await captureCommand(u,s,'move',{...batch,items:[...batch.items,{itemKey:'extra',kind:'special',id:specialId,fromPersonId:p,choice}]})),'40001','tjanst_stale_basis');
 });
}

async function limitsAndRemoval(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),p=s.people[0].personId;
  await send(t,await captureCommand(t,s,'add_teacher',{personId:p}));const cat=await yearPreview(t,{unitId:s.unitId,schoolYear:s.schoolYear,mode:'catalog'}),choice=yearManual(cat.candidates.find(x=>x.personId===p));
  const batch={action:'bulk',baseVersionId:cat.baseVersionId,items:Array.from({length:100},(_,i)=>({itemKey:'special'+i,kind:'special',payload:special(p,{label:'Explicit '+i}),choice}))};
  const before=await read(t,s);let d=await send(t,await captureCommand(t,s,'bulk',batch));assert.equal(d.specials.length,100);assert.equal(d.revision,before.revision+1);
  const current=await yearPreview(t,{unitId:s.unitId,schoolYear:s.schoolYear,mode:'catalog'});
  d=await send(t,await captureCommand(t,s,'bulk',{action:'bulk',baseVersionId:d.version.id,items:[{itemKey:'one-more',kind:'special',payload:special(p,{label:'Explicit101'}),choice:yearManual(current.candidates.find(x=>x.personId===p))}]}));
  assert.equal(d.specials.length,101);assert.equal(d.revision,before.revision+2);
  check(report,'100 then1 explicit bulk items preserve manually started plan and make exactly two revisions');
  await unchangedDeny(t,report,'remove teacher with only special assignments is denied',async u=>planSend(u,await captureCommand(u,s,'remove_teacher',{personId:p})),'22023','tjanst_teacher_not_empty');
  const tooMany={...batch,baseVersionId:d.version.id,items:[...batch.items,batch.items[0]],expectedPreviewHash:'sha256:'+'0'.repeat(64)};
  await unchangedDeny(t,report,'SQL rejects101 explicit selected items without parser fallback',async u=>planSend(u,await planCommand(s.unitId,s.schoolYear,'bulk',d.revision,tooMany)),'22023');
  const wrong=await captureCommand(t,s,'remove_teacher',{personId:s.people[2].personId});await unchangedDeny(t,report,'foreign-school unlinked column cannot be removed',u=>planSend(u,wrong),'22023','tjanst_teacher_not_found');
 });
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),p=s.people[0].personId;let d=await send(t,await captureCommand(t,s,'save_row',row(s,p),'manual'));
  await unchangedDeny(t,report,'remove teacher with only ordinary row is denied',async u=>planSend(u,await captureCommand(u,s,'remove_teacher',{personId:p})),'22023','tjanst_teacher_not_empty');
  d=await send(t,await captureCommand(t,s,'delete_row',{rowId:d.rows[0].id}));const q=await captureCommand(t,s,'remove_teacher',{personId:p});
  for(const table of ['tjanst_version_teachers','security_events']) await savepoint(t,async u=>{
   await u.unsafe("create function public.synthetic_18_fail() returns trigger language plpgsql as $$begin raise exception 'Synthetic removal failure' using errcode='55000';end$$");
   await u.unsafe('create trigger synthetic_18_fail after '+(table==='tjanst_version_teachers'?'DELETE':'INSERT')+' on public.'+table+' for each row execute function public.synthetic_18_fail()');
   await unchangedDeny(u,report,'removal failure after '+table+' restores column revision journal audit',v=>planSend(v,q),'55000');
  });
  await savepoint(t,async u=>{
   // Explicit invalid legacy boundary: orphan group time with no row/special must still prevent removal.
   const id=randomUUID();await u`insert into public.tjanst_joint_groups(id,version_id,lineage_id,name) values(${id},${d.version.id},${randomUUID()},'Syntetisk äldre ofullständig grupp')`;
   await u`insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes) values(${id},${p},60,0)`;
   await unchangedDeny(u,report,'synthetic legacy group-time-only column cannot be removed',async v=>planSend(v,await captureCommand(v,s,'remove_teacher',{personId:p})),'22023','tjanst_teacher_not_empty');
  });
 });
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t);const old=await seedYearHistory(t,s);const frozen=await fullVersion(t,old.versionId);
  const d=await send(t,await captureCommand(t,s,'save_row',row(s,null),'unassigned'));assert.equal(d.rows.length,1);assert.equal(d.rows[0].personId,null);assert.deepEqual(d.specials,[]);assert.deepEqual(d.joints,[]);assert.deepEqual(d.teachers,[]);assert.deepEqual(await fullVersion(t,old.versionId),frozen);
  check(report,'first new-year explicit vacancy never copies prior-year assignments/teachers/specials/groups');
 });
}
async function legacyReplayBeforeMigration(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),q=await planCommand(s.unitId,s.schoolYear,'create_draft',0,{basedOnVersionId:null});
  const original=await planSend(t,q);await t.unsafe(readFileSync(resolve(ROOT,OWN),'utf8'));
  const before=await allPublicHashes(t),reply=await planSend(t,q);assert.equal(reply.result.receipt.replayed,true);assert.equal(reply.result.receipt.versionId,original.result.receipt.versionId);assert.deepEqual(await allPublicHashes(t),before);
  const status=await planStatus(t,{command:planRef(q)});assert.equal(status.result.state,'completed');assert.equal(status.result.result.receipt.commandId,q.commandId);
  check(report,'persisted legacy create_draft exact replay/status survive forward migration without new writes');
  await unchangedDeny(t,report,'fresh legacy create_draft cannot reuse historical replay route',u=>planSend(u,{...q,commandId:randomUUID()}),'22023','tjanst_context_required');
  await s.f.actor(t,'admin');await unchangedDeny(t,report,'legacy receipt cannot be replayed by different actor',u=>planSend(u,q),'40001','tjanst_command_conflict');await s.f.actor(t,'principalA');
  await s.f.actor(t,'hm');await t`select public.phase3_revoke_mandate(${s.f.roles.principalA})`;await s.f.actor(t,'principalA');
  await unchangedDeny(t,report,'revoked actor cannot replay legacy receipt',u=>planSend(u,q),'42501');
  await unchangedDeny(t,report,'revoked actor cannot recover legacy receipt by status',u=>planStatus(u,{command:planRef(q)}),'42501');
 });
}

async function raceCases(source,report) {
 const db=source.db,one=await source.connect(),two=await source.connect();
 try {
  async function waitBlocked(pid) {
   for(let i=0;i<100;i++) {const [r]=await db`select wait_event_type,wait_event from pg_stat_activity where pid=${pid}`;if(r?.wait_event_type==='Lock'&&r.wait_event==='advisory')return;await new Promise(resolve=>setTimeout(resolve,25));}
   assert.fail('Second real connection did not wait on the customer advisory lock');
  }
  async function pair(s,left,right) {
   const secondSession=randomUUID();
   await db`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
    select ${secondSession},${createHash('sha256').update(randomUUID()).digest()},identity_id,membership_id,assignment_id,expires_at,absolute_expires_at
    from public.app_sessions where id=${s.f.sessionId('principalA')}`;
   const ready=Promise.withResolvers(),release=Promise.withResolvers(),started=Promise.withResolvers();
   const a=one.begin(async t=>{await t`set local lock_timeout='10s'`;await s.f.actor(t,'principalA');const result=await left(t);ready.resolve();await release.promise;return result;});
   a.catch(ready.reject);await ready.promise;
   const b=two.begin(async t=>{await t`set local lock_timeout='10s'`;await s.f.actor(t,'principalA');await t`select set_config('app.session_id',${secondSession},true)`;const [{pid}]=await t`select pg_backend_pid() pid`;started.resolve(pid);return right(t);}).then(value=>({value}),error=>({error}));
   try {await waitBlocked(await started.promise);} finally {release.resolve();}
   return [await a,await b];
  }
  let s,q;
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
  let [first,second]=await pair(s,t=>yearCommandSend(t,q),t=>yearCommandSend(t,q));
  assert.equal(first.result.receipt.replayed,false);assert.equal(second.value.result.receipt.replayed,true);
  assert.equal((await db`select count(*)::int n from public.tjanst_commands where command_id=${q.commandId}`)[0].n,1);
  check(report,'two real simultaneous first identical writes serialize and return one original plus one replay');
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
  [,second]=await pair(s,t=>yearCommandSend(t,q),t=>planSend(t,{...q,commandId:randomUUID()}));
  assert.equal(second.error?.code,'40001');assert.equal(second.error?.hint,'tjanst_revision_conflict');
  check(report,'two distinct first writes serialize; loser observes fresh revision without another draft');
  for(const kind of ['person','class']) {
   await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
   [,second]=await pair(s,async t=>{
    if(kind==='person'){await s.f.actor(t,'hm');return personalCommand(t,saveDuties(s.people[0].personId,s.people[0].revision,s.people[0].employmentId,[{unitId:s.unitId,percent:40,startsOn:'2026-07-01'}]));}
    const [{revision}]=await t`select revision from public.class_timplans where class_id=${s.f.classes.group} and start_year=${s.schoolYear}`;
    return t`select public.phase51_grim_class_command(${t.json({action:'link',commandId:randomUUID(),classId:s.f.classes.group,planId:s.g.grPlan,expectedPlanRevision:0,columnId:'ak9',expectedLinkRevision:revision,previousPlanId:s.g.grPlan})})`;
   },t=>planSend(t,q));
   assert.equal(second.error?.code,'40001');assert.equal(second.error?.hint,kind==='person'?'tjanst_stale_person':'tjanst_stale_basis');
   assert.equal((await db`select count(*)::int n from public.tjanst_distributions where unit_id=${s.unitId} and school_year=${s.schoolYear}`)[0].n,0);
   check(report,'real '+kind+' command owns same customer lock; waiting plan detects changed source before first draft');
  }
  // Reverse order: a plan apply holds the same lock while a real personnel writer waits.
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
  [,second]=await pair(s,t=>yearCommandSend(t,q),async t=>{await s.f.actor(t,'hm');return personalCommand(t,saveDuties(s.people[0].personId,s.people[0].revision,s.people[0].employmentId,[{unitId:s.unitId,percent:40,startsOn:'2026-07-01'}]));});
  assert.ok(second.value);check(report,'personnel change during plan apply waits until the complete plan journal commits');
  let bulk,publish;
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');const cat=await yearPreview(t,{unitId:s.unitId,schoolYear:s.schoolYear,mode:'catalog'});bulk=await captureCommand(t,s,'bulk',{action:'bulk',baseVersionId:null,items:[{itemKey:'only',kind:'special',payload:special(s.people[0].personId),choice:yearManual(cat.candidates.find(x=>x.personId===s.people[0].personId))}]});});
  [,second]=await pair(s,t=>yearCommandSend(t,q),t=>planSend(t,bulk));assert.equal(second.error?.hint,'tjanst_revision_conflict');
  check(report,'ordinary row save racing bulk produces one revision and explicit stale loser');
  await db.begin(async t=>{await s.f.actor(t,'principalA');const d=await read(t,s);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId,{rowId:d.rows[0].id,teacherHt:900}),'manual');publish=await captureCommand(t,s,'publish',{});});
  [,second]=await pair(s,t=>yearCommandSend(t,q),t=>planSend(t,publish));assert.equal(second.error?.hint,'tjanst_revision_conflict');
  check(report,'publication during an in-flight edit waits then rejects stale revision/content');
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
  [,second]=await pair(s,async t=>{await s.f.actor(t,'hm');return t`select public.phase3_revoke_mandate(${s.f.roles.principalA})`;},t=>planSend(t,q));assert.equal(second.error?.code,'42501');
  await db.begin(async t=>{await s.f.actor(t,'principalA');await denied(t,report,'revoked concurrent actor also denied command status',u=>planStatus(u,{command:planRef(q)}),'42501');});
  check(report,'real mandate revocation while apply waits is rechecked under customer lock');
  // A real prior-year publication changes only evidence while the next-year command is waiting.
  let historical,publishHistory,manualTarget;
  await db.begin(async t=>{
   s=await createTjanstYearFixture(t);const gy=await seedGy25Class(t,s.f);await s.f.actor(t,'principalA');
   historical={...s,schoolYear:gy.year};let prior=await read(t,historical);const need=prior.classes.find(c=>c.classId===gy.classId).needs[0];
   prior=await send(t,await captureCommand(t,historical,'save_row',row(s,s.people[0].personId,{sourceKey:need.sourceKey}),'manual'));
   prior=await send(t,await captureCommand(t,historical,'publish',{}));
   const [{revision}]=await t`select revision from public.timplans where id=${gy.planId}`;
   await t`select public.phase5_class_command(${t.json({operation:'link',commandId:randomUUID(),classId:gy.classId,schoolYear:gy.year+1,planId:gy.planId,expectedPlanRevision:revision,columnId:'ar2',expectedLinkRevision:null,previousPlanId:null})})`;
   s={...s,schoolYear:gy.year+1};const target=await read(t,s),targetNeed=target.classes.find(c=>c.classId===gy.classId).needs[0];
   const support=await yearPreview(t,{unitId:s.unitId,schoolYear:s.schoolYear,mode:'row',sourceKey:targetNeed.sourceKey,rowId:null});
   const suggestion=support.suggestions.find(x=>x.personId===s.people[0].personId),candidate=support.candidates.find(x=>x.personId===s.people[0].personId);assert.ok(suggestion);
   const choice={kind:'suggestion',personId:candidate.personId,expectedPersonBasisHash:candidate.personBasisHash,suggestionId:suggestion.suggestionId,expectedEvidenceHash:suggestion.evidenceHash};
   q=await captureCommand(t,s,'save_row',row(s,candidate.personId,{sourceKey:targetNeed.sourceKey}),choice);
   manualTarget=await captureCommand(t,s,'save_row',row(s,candidate.personId,{sourceKey:targetNeed.sourceKey}),'manual');
   prior=await send(t,await captureCommand(t,historical,'save_row',row(historical,candidate.personId,{sourceKey:need.sourceKey,rowId:prior.rows[0].id,teacherHt:700}),'manual'));
   publishHistory=await captureCommand(t,historical,'publish',{});
  });
  [,second]=await pair(s,t=>yearCommandSend(t,publishHistory),t=>planSend(t,q));assert.equal(second.error?.hint,'tjanst_stale_evidence');
  await db.begin(async t=>{await s.f.actor(t,'principalA');const result=await yearCommandSend(t,manualTarget);assert.equal(result.result.detail.rows.length,1);});
  check(report,'real prior-year republication under customer lock invalidates waiting suggestion evidence while frozen manual choice still saves');
  // Reverse class order, using the real GR class-link entrypoint.
  await db.begin(async t=>{s=await createTjanstYearFixture(t);q=await captureCommand(t,s,'save_row',row(s,s.people[0].personId),'manual');});
  [,second]=await pair(s,t=>yearCommandSend(t,q),async t=>{
   const [{revision}]=await t`select revision from public.class_timplans where class_id=${s.f.classes.group} and start_year=${s.schoolYear}`;
   return t`select public.phase51_grim_class_command(${t.json({action:'link',commandId:randomUUID(),classId:s.f.classes.group,planId:s.g.grPlan,expectedPlanRevision:0,columnId:'ak9',expectedLinkRevision:revision,previousPlanId:s.g.grPlan})})`;
  });assert.ok(second.value);check(report,'real GR class-link change during plan apply waits for complete plan commit');
 } finally {await one.end();await two.end();}
}

async function openDatabase(ephemeral, report) {
  const { classifyTjanstMigrations, assertTjanstSelfMandatesSchema, TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
  const { createEphemeralMigratedDb, migrationFiles } = await import('./ephemeral-migrated-db.mjs');
  const ownVersion = basename(OWN).slice(0, 14);
  const prefix = TJANST_MIGRATION_REGISTRY.filter(m => m.version < ownVersion).map(m => m.version);
  const sourceHashes = Object.fromEntries(migrationFiles().filter(f => f.slice(0, 14) >= TJANST_PHASE_START)
    .map(f => ['supabase/migrations/' + f, createHash('sha256').update(readFileSync(resolve(ROOT, 'supabase/migrations', f))).digest('hex')]));
  classifyTjanstMigrations({ journal: prefix, sourceHashes });
  if (ephemeral) {
    const e = await createEphemeralMigratedDb({ exclude: migrationFiles().filter(f => f.slice(0, 14) >= ownVersion) });
    try { await assertTjanstSelfMandatesSchema(e.db, { installed: true }); }
    catch (error) { await e.end(); throw error; }
    report.baselineMode = 'ephemeral-before-year-commands'; report.pendingMigrations = [OWN];
    return { db: e.db, connect:e.connect, provenance: e.provenance, pending: [OWN], close: e.end };
  }
  const { targetPendingMigrations } = await import('./verify-tjanst-actual.mjs');
  const target = await targetPendingMigrations();
  const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
  const snapshot = await createNamedTimplanSnapshot();
  try {
    assert.equal(snapshot.provenance.sourceFingerprint, target.fingerprint, 'Målschemat ändrades mellan journalprövning och schemakopia');
    report.targetJournal = target.journal; report.baselineMode = target.baselineMode;
    report.pendingMigrations = target.pendingMigrations;
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: target.installed.includes('20261021120000') });
    const prior = target.pendingMigrations.filter(p => basename(p).slice(0, 14) < ownVersion);
    if (prior.length) await snapshot.db.begin(async t => { for (const p of prior) await t.unsafe(readFileSync(resolve(ROOT, p), 'utf8')); });
    report.appliedPrerequisites = prior;
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: true });
    return { db: snapshot.db, connect:snapshot.connect, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup(); } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}

export async function verifyTjanstYearCommands(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-year-commands', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Synthetic SQL only in owned databases; no live target writes, HTTP/OIDC/browser or qualification claims',
      'Historical GR fixture is explicitly synthetic frozen data; calendar invalidation is a marked direct change, not a live calendar API test',
      'SS 12000:2024 / OpenAPI2.1.0: stable own Person/Group/Duty and inclusive dates; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); source = await openDatabase(ephemeral, report); report.database = source.provenance;
    const db = source.db, before = await allPublicHashes(db), fingerprint = await schemaFingerprint(db);
    if (source.pending.includes(OWN)) {
      await legacyReplayBeforeMigration(db,report);
      await rolledBack(db, t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
      assert.equal(await schemaFingerprint(db), fingerprint); assert.deepEqual(await allPublicHashes(db), before);
      check(report, 'migration rollback preserves schema, ACL and every business row');
      await db.begin(t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
      assert.deepEqual(await allPublicHashes(db), before);
      check(report, 'migration creates no business rows and preserves existing rows');
    } else check(report, 'registered installed suffix is not reapplied');
    const grants = await db`select p.oid::regprocedure::text signature,has_function_privilege(r.role,p.oid,'EXECUTE') allowed
      from pg_proc p cross join (values ('skolplattform_worker'),('anon'),('authenticated'),('service_role')) r(role)
      where p.pronamespace='public'::regnamespace and p.proname like 'tjanst_year_%'`;
    assert.ok(grants.length && grants.every(g => !g.allowed));
    assert.equal((await db`select count(*)::int n from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.pronamespace='public'::regnamespace and p.proname like 'tjanst_year_%' and acl.grantee=0`)[0].n,0);
    check(report, 'all year calculators and entrypoint closed to Worker, clients and PUBLIC');
    const installed = await allPublicHashes(db); await cases(db, report); await limitsAndRemoval(db,report); await groupBoundaryCases(db,report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'all transactional synthetic cases roll back without remaining rows');
    await raceCases(source,report);
    report.raceFixtures='Committed only in owned database for real connection visibility; complete database removed at cleanup';
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' årskommandokontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstYearCommands(rest[1], { ephemeral });
}
