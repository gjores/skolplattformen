#!/usr/bin/env node
// 05.1-17: isolated SQL only. --ephemeral builds a private PostgreSQL; default copies schema only.
// node work/pilot/verify-tjanst-year-preview.mjs --ephemeral --out /private/tmp/tjanst-year-preview.json
// node work/pilot/verify-tjanst-year-preview.mjs --out /private/tmp/tjanst-year-preview-schema.json
import assert from 'node:assert/strict';
import { capturePlanContext, yearCommand, yearCommandSend } from './tjanst-year-fixtures.mjs';
let modern=false;
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { planRead, grantSelf, personalCommand, saveDuties, seedGy25Class, tjanstMigrations } from './tjanst-fixtures.mjs';
import { createTjanstYearFixture, seedYearHistory, yearPreview, yearRawPreview, yearManual, yearVacant, yearRowPayload, yearSend } from './tjanst-year-fixtures.mjs';
import { parseYearReply, tjanstYearHash } from '../../web/lib/tjanst-year-contract.ts';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261023110000_tjanst_year_preview.sql';
const rollback = Error('expected_year_preview_rollback');
const sourceFiles = [...tjanstMigrations, OWN, 'work/pilot/verify-tjanst-year-preview.mjs', 'work/pilot/tjanst-year-fixtures.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs',
  'web/lib/tjanst-year-contract.ts', 'supabase/tests/phase51_tjanst_year_hash_vectors.json'];
// Pin transitive repository modules, including dynamic literal imports used by the adapters.
// Runtime binaries/packages are recorded separately by DB provenance; SQL sources are also pinned here.
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
const codes = r => r.blockers.map(b => b.code);
async function cases(db, report) {
  const vectors = JSON.parse(readFileSync(resolve(ROOT, 'supabase/tests/phase51_tjanst_year_hash_vectors.json'), 'utf8'));
  for (const vector of vectors.vectors) {
    const [r] = await db`select public.tjanst_canonical(${db.json(vector.input)}) canonical,public.tjanst_year_hash(${vector.input[1]},${db.json(vector.input[2])}) hash`;
    assert.equal(r.canonical, vector.canonical, vector.name); assert.equal(r.hash, vector.sha256, vector.name);
    assert.equal(r.hash, await tjanstYearHash(vector.input[1], vector.input[2]));
  }
  check(report, 'all shared TypeScript/SQL canonical hash vectors agree', { vectors: vectors.vectors.length });
  await rolledBack(db, async t => {
    const s = await createTjanstYearFixture(t), { f, unitId, schoolYear, people, key } = s;
    const before = await businessHashes(t);
    const catalog = await yearPreview(t, { unitId, schoolYear, mode: 'catalog' });
    assert.deepEqual(catalog.candidates.map(p => p.personId).sort(), [people[0].personId, people[1].personId, people[4].personId, s.draftPersonId].sort());
    assert.equal(catalog.candidates.filter(p => p.displayName === 'Syntetisk Samma namn').length, 2);
    assert.ok(catalog.candidates.every(p => p.qualificationStatus === 'unknown' && !('account' in p)));
    const support = await yearPreview(t, s.request());
    assert.equal(support.recommendationStatus, 'empty'); assert.equal(support.currentRow, null); assert.equal(support.rowId, null); assert.equal(support.baseVersionId, null);
    assert.equal(support.currentRevision, 0); assert.equal(support.need.needHt, 2700);
    assert.deepEqual(await businessHashes(t), before);
    check(report, 'new year/catalog/row keep all business rows unchanged and every teacher field empty');
    check(report, 'own school catalog retains duplicate names, draft, inclusive last-day and part-year duties; excludes expired/foreign duties');
    const audit = (await t`select details from public.security_events where action='tjanst_year_preview_read' order by id`).map(x => x.details);
    assert.equal(audit.length, 2); assert.ok(audit.every(x => Object.keys(x).sort().join(',') === 'count,mode,schoolYear,unitId'));
    check(report, 'every read has mandatory minimal school/year/mode/count audit without names or evidence');
    await f.actor(t, 'admin'); assert.equal((await yearPreview(t,s.request())).candidates.length,4);
    check(report, 'school administrator reads narrow catalog without organizer personal access');
    for (const role of ['hm','foreignHm','principalB','teacherGroup']) {
      await f.actor(t,role); await denied(t,report,role+' cannot read year support for school A',u=>yearRawPreview(u,s.request()),'42501');
    }
    await grantSelf(t,f,{ unitIds:[unitId],staffPersonId:people[0].personId });await f.actor(t,'teacherSelf');
    await denied(t,report,'self mandate cannot read planning support',u=>yearRawPreview(u,s.request()),'42501');
    await f.actor(t,'principalA');
    for (const value of [null, 4, 'bad']) await denied(t,report,'invalid SQL mode '+String(value),u=>yearRawPreview(u,{unitId,schoolYear,mode:value,batch:{}}),'22023');
    for (const value of [null, '2026', 0, 2101]) await denied(t,report,'invalid SQL year '+String(value),u=>yearRawPreview(u,{...s.request(),schoolYear:value}),'22023');
    for (const value of [null, {}, 'foreign']) await denied(t,report,'invalid SQL batch action '+String(value),u=>yearRawPreview(u,{unitId,schoolYear,mode:'batch',batch:{action:value,baseVersionId:null,items:[]}}),'22023');
    await denied(t,report,'foreign current row denied without leaking it',u=>yearRawPreview(u,s.request({rowId:randomUUID()})),'42501');
    await denied(t,report,'unknown current need rejected, not zero-filled',u=>yearRawPreview(u,s.request({sourceKey:key('missing')})),'22023','tjanst_unknown_source');
    await savepoint(t,async u=>{
      await f.actor(u,'hm');await u`select public.phase3_revoke_mandate(${f.roles.principalA})`;await f.actor(u,'principalA');
      await denied(u,report,'revoked current mandate denies preview',v=>yearRawPreview(v,s.request()),'42501');
    });await f.actor(t,'principalA');
    await savepoint(t,async u=>{
      await u.unsafe("create or replace function public.tjanst_year_history(unit uuid,year integer) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic optional failure' using errcode='P5101';end$$");
      const degraded=await yearPreview(u,s.request()); assert.equal(degraded.recommendationStatus,'unavailable');assert.deepEqual(degraded.suggestions,[]);
      assert.equal(degraded.basisHash,support.basisHash);assert.deepEqual(degraded.candidates,support.candidates);
      const batch={action:'bulk',baseVersionId:null,items:[{itemKey:'manual',kind:'row',payload:yearRowPayload(degraded,yearManual(degraded.candidates[0]))}]};
      assert.deepEqual(codes(await yearPreview(u,{unitId,schoolYear,mode:'batch',batch})),[]);
      batch.items[0].payload=yearRowPayload(degraded,yearVacant());assert.deepEqual(codes(await yearPreview(u,{unitId,schoolYear,mode:'batch',batch})),[]);
      check(report,'only known optional history failure degrades; manual and explicit vacancy retain valid core/person hashes');
    });
    for (const code of ['42501','55000','XX000']) await savepoint(t,async u=>{
      await u.unsafe("create or replace function public.tjanst_year_history(unit uuid,year integer) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic hard failure' using errcode='"+code+"';end$$");
      await denied(u,report,'optional-source '+code+' remains hard failure',v=>yearRawPreview(v,s.request()),code);
    });
    await savepoint(t,async u=>{
      await u.unsafe("create or replace function public.tjanst_needs(unit uuid,school_year integer) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic core failure' using errcode='P5101';end$$");
      await denied(u,report,'core failure cannot be disguised as optional history failure',v=>yearRawPreview(v,s.request()),'P5101');
    });
    await savepoint(t,async u=>{
      await u.unsafe("create or replace function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$begin raise exception 'Synthetic audit failure' using errcode='55000';end$$");
      await denied(u,report,'mandatory SQL audit failure denies result',v=>yearRawPreview(v,s.request()),'55000');
    });
    const revision=support.currentRevision;
    await savepoint(t,async u=>{
      await f.actor(u,'hm');const person=people[0];await personalCommand(u,saveDuties(person.personId,person.revision,person.employmentId,[{unitId,percent:40,startsOn:'2026-07-01'}]));await f.actor(u,'principalA');
      const fresh=await yearPreview(u,s.request());assert.equal(fresh.currentRevision,revision);assert.equal(fresh.basisHash,support.basisHash);
      assert.notEqual(fresh.candidates.find(p=>p.personId===person.personId).personBasisHash,support.candidates.find(p=>p.personId===person.personId).personBasisHash);
      const freshCatalog=await yearPreview(u,{unitId,schoolYear,mode:'catalog'});
      assert.notEqual(freshCatalog.basisHash,catalog.basisHash);assert.equal(freshCatalog.currentRevision,catalog.currentRevision);
      check(report,'real personnel duty command invalidates catalog mutation basis and selected person hash while preserving narrow row basis/revision');
    });await f.actor(t,'principalA');
    await savepoint(t,async u=>{
      const [link]=await u`select revision from public.class_timplans where class_id=${f.classes.group} and start_year=${schoolYear}`;
      await u`select public.phase51_grim_class_command(${u.json({action:'link',commandId:randomUUID(),classId:f.classes.group,planId:s.g.grPlan,expectedPlanRevision:0,columnId:'ak9',expectedLinkRevision:link.revision,previousPlanId:s.g.grPlan})})`;
      const fresh=await yearPreview(u,s.request());assert.equal(fresh.currentRevision,revision);assert.notEqual(fresh.basisHash,support.basisHash);
      check(report,'real class-link command invalidates current basis without a distribution revision');
    });
    await savepoint(t,async u=>{
      await u`set local session_replication_role=replica`;
      await u`update public.school_year_days set kind='studiedag' where school_year_id in(select id from public.school_years where unit_id=${unitId} and start_year=${schoolYear}) and day='2026-10-30'`;
      await u`set local session_replication_role=origin`;
      const fresh=await yearPreview(u,s.request());assert.equal(fresh.currentRevision,revision);assert.notEqual(fresh.basisHash,support.basisHash);
      check(report,'marked synthetic calendar source change invalidates basis even when displayed GR minutes stay the same');
    });
    await savepoint(t,async u=>{
      const imRequest=s.request({sourceKey:key('im-ma',s.g.imClass)}),known=await yearPreview(u,imRequest);
      assert.ok(known.need.needHt>0);
      await u`set local session_replication_role=replica`;
      await u`delete from public.school_year_days where school_year_id in(select id from public.school_years where unit_id=${unitId} and start_year=${schoolYear})`;
      await u`delete from public.school_years where unit_id=${unitId} and start_year=${schoolYear}`;
      await u`set local session_replication_role=origin`;
      const absent=await yearPreview(u,imRequest);
      assert.equal(absent.need.needHt,null);assert.equal(absent.need.needVt,null);assert.notEqual(absent.basisHash,known.basisHash);
      check(report,'marked synthetic missing calendar retains unknown IM minutes as null and invalidates basis');
    });
    await savepoint(t,async u=>{
      const history=await seedYearHistory(u,s);const historical=await yearPreview(u,s.request());
      assert.equal(historical.recommendationStatus,'ready');assert.equal(historical.suggestions.length,1);assert.deepEqual(historical.suggestions[0].reasons,['previous_same_row']);
      assert.equal(historical.suggestions[0].personId,people[0].personId);assert.equal(historical.suggestions[0].references[0].classId,history.classId);
      assert.notEqual(history.classId,f.classes.group);assert.equal(historical.basisHash,support.basisHash);
      check(report,'different GR class ID with identical name gets only exact subject-row evidence; same-name person is not inferred');
      const noRelation=await yearPreview(u,s.request({sourceKey:key('engelska')}));assert.equal(noRelation.recommendationStatus,'empty');
      check(report,'unproven subject/level relationship yields empty recommendations and normal candidates');
      const evidence=historical.suggestions[0],person=historical.candidates.find(p=>p.personId===evidence.personId);
      const choice={...yearManual(person),kind:'suggestion',suggestionId:evidence.suggestionId,expectedEvidenceHash:evidence.evidenceHash};
      const suggestedBatch={action:'bulk',baseVersionId:null,items:[{itemKey:'suggested',kind:'row',payload:yearRowPayload(historical,choice)}]};
      assert.deepEqual(codes(await yearPreview(u,{unitId,schoolYear,mode:'batch',batch:suggestedBatch})),[]);
      check(report,'explicit evidence-backed suggestion passes actual SQL batch validation');
      const newer=randomUUID(),newRow=randomUUID();
      await u`insert into public.tjanst_versions(id,distribution_id,version_no,status,created_by_identity_id,created_by_assignment_id)
        values(${newer},${history.distributionId},2,'draft',${f.identity('principalA')},${f.roles.principalA})`;
      await u`insert into public.tjanst_rows select (jsonb_populate_record(null::public.tjanst_rows,to_jsonb(r)||jsonb_build_object('id',${newRow}::uuid,'version_id',${newer}::uuid))).*
        from public.tjanst_rows r where r.id=${history.rowId}`;
      await u`set local session_replication_role=replica`;
      await u`update public.tjanst_versions set status='superseded' where id=${history.versionId}`;
      await u`update public.tjanst_versions set status='published',published_at=clock_timestamp(),published_by_identity_id=${f.identity('principalA')},
        published_by_assignment_id=${f.roles.principalA},content_hash=public.tjanst_version_hash(id) where id=${newer}`;
      await u`set local session_replication_role=origin`;
      const latest=await yearPreview(u,s.request());assert.equal(latest.suggestions[0].references[0].versionId,newer);
      assert.notEqual(latest.suggestions[0].evidenceHash,historical.suggestions[0].evidenceHash);assert.equal(latest.basisHash,historical.basisHash);assert.equal(latest.currentRevision,historical.currentRevision);
      check(report,'latest previous publication replaces evidence hash without changing current core hash or plan revision');
      assert.ok(codes(await yearPreview(u,{unitId,schoolYear,mode:'batch',batch:suggestedBatch})).includes('suggestion_unavailable'));
      check(report,'changed evidence rejects the previously explicit suggestion although person and need basis remain current');
      await savepoint(u,async v=>{
        await v`set local session_replication_role=replica`;await v`update public.tjanst_versions set content_hash=${'sha256:'+'f'.repeat(64)} where id=${newer}`;await v`set local session_replication_role=origin`;
        const degraded=await yearPreview(v,s.request());assert.equal(degraded.recommendationStatus,'unavailable');assert.deepEqual(degraded.suggestions,[]);assert.equal(degraded.basisHash,latest.basisHash);
        check(report,'actual invalid historic content hash degrades without exposing false evidence');
      });
      await u`set local session_replication_role=replica`;await u`update public.tjanst_versions set status='superseded' where id=${newer}`;await u`set local session_replication_role=origin`;
      assert.equal((await yearPreview(u,s.request())).recommendationStatus,'empty');
      check(report,'previous year without current publication never uses superseded/unpublished source');
    });
    if(!modern) await yearSend(t,unitId,schoolYear,'create_draft',{basedOnVersionId:null});
    let d=await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:schoolYear,action:'save_row',payload:{rowId:null,sourceKind:'class_timplan',sourceKey:key(),personId:people[0].personId,teacherHt:333,teacherVt:444,comment:'Syntetiskt manuellt val'},choice:'manual'})))).result.detail : await yearSend(t,unitId,schoolYear,'save_row',{rowId:null,sourceKind:'class_timplan',sourceKey:key(),personId:people[0].personId,teacherHt:333,teacherVt:444,comment:'Syntetiskt manuellt val'}));
    const row=d.rows[0],started=await yearPreview(t,s.request({rowId:row.id}));
    assert.equal(started.currentRow.personId,people[0].personId);assert.equal(started.currentRow.teacherHt,333);assert.equal(started.currentRow.comment,'Syntetiskt manuellt val');
    assert.equal(started.suggestions[0].references[0].versionId,d.version.id);
    const projection=await yearPreview(t,s.request({sourceKey:key('engelska')}));assert.equal(projection.currentRow,null);assert.equal(projection.rowId,null);
    check(report,'manually started year retains saved teacher/time/comment; other needs remain projections with current-class suggestions');
    d=await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:schoolYear,action:'publish',payload:{}})))).result.detail : await yearSend(t,unitId,schoolYear,'publish',{}));const frozen=await businessHashes(t);
    const published=await yearPreview(t,s.request({rowId:row.id}));assert.equal(published.baseVersionId,d.version.id);assert.equal(published.currentRow.personId,people[0].personId);
    assert.deepEqual(await businessHashes(t),frozen);
    check(report,'published-only year read uses published base and creates no draft or teacher choice');
  });
  await batchCases(db,report);
  await gyCases(db,report);
}

async function batchCases(db,report) {
  await rolledBack(db,async t=>{
    const s=await createTjanstYearFixture(t),{f,unitId,schoolYear,people,key}=s;
    let support=await yearPreview(t,s.request());const selected=yearManual(support.candidates.find(p=>p.personId===people[0].personId));
    const bulk={action:'bulk',baseVersionId:null,items:[{itemKey:'row',kind:'row',payload:yearRowPayload(support,selected)},
      {itemKey:'mentor',kind:'special',payload:{specialId:null,kind:'mentor',label:'Mentor',personId:null,classId:f.classes.group,ht:60,vt:0,comment:''},choice:yearVacant()}]};
    const req=batch=>({unitId,schoolYear,mode:'batch',batch});
    const before=await businessHashes(t),preview=await yearPreview(t,req(bulk));assert.deepEqual(codes(preview),[]);assert.equal(preview.selectedCount,2);assert.equal(preview.writeObjectCount,2);assert.deepEqual(await businessHashes(t),before);
    check(report,'bulk preview has explicit teacher/vacancy and actual mentor class, with zero business writes');
    for (const bad of [null,{},4,'automatic']) {
      const q=structuredClone(bulk);q.items[0].payload.planningContext.choice={kind:bad,personId:null};
      await denied(t,report,'SQL rejects invalid explicit choice '+String(bad),u=>yearRawPreview(u,req(q)),'22023');
    }
    for (const bad of [null,{},4,'foreign']) {
      const q=structuredClone(bulk);q.items[0].kind=bad;
      await denied(t,report,'SQL rejects invalid item discriminator '+String(bad),u=>yearRawPreview(u,req(q)),'22023');
    }
    const oversized=structuredClone(bulk);oversized.items[0].payload.comment='x'.repeat(66000);
    await denied(t,report,'SQL rejects request beyond64KiB',u=>yearRawPreview(u,req(oversized)),'22023','tjanst_input_too_large');
    const tooMany={...bulk,items:Array.from({length:101},(_,i)=>({...bulk.items[0],itemKey:'item'+i}))};
    await denied(t,report,'SQL rejects101 explicitly selected items',u=>yearRawPreview(u,req(tooMany)),'22023');
    const stale=structuredClone(bulk);stale.items[0].payload.planningContext.expectedBasisHash='sha256:'+'f'.repeat(64);
    assert.ok(codes(await yearPreview(t,req(stale))).includes('stale_basis'));
    const unavailable=structuredClone(bulk);unavailable.items[0].payload.planningContext.choice.expectedPersonBasisHash='sha256:'+'f'.repeat(64);
    assert.ok(codes(await yearPreview(t,req(unavailable))).includes('person_unavailable'));
    const unknown=structuredClone(bulk);unknown.items[0].payload.sourceKey=key('unknown');assert.ok(codes(await yearPreview(t,req(unknown))).includes('unknown_need'));
    const foreignClass=structuredClone(bulk);foreignClass.items[1].payload.classId=randomUUID();assert.ok(codes(await yearPreview(t,req(foreignClass))).includes('unknown_class'));
    check(report,'batch reports stale basis/person, unknown need and foreign mentor class per selected item');
    if(!modern) await yearSend(t,unitId,schoolYear,'create_draft',{basedOnVersionId:null});
    for (const classId of [f.classes.group,f.classes.other]) for (const personId of [people[0].personId,people[1].personId])
      await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:schoolYear,action:'save_row',payload:{rowId:null,sourceKind:'class_timplan',sourceKey:key('matematik',classId),personId,teacherHt:100,teacherVt:200,comment:''},choice:'manual'})))).result.detail : await yearSend(t,unitId,schoolYear,'save_row',{rowId:null,sourceKind:'class_timplan',sourceKey:key('matematik',classId),personId,teacherHt:100,teacherVt:200,comment:''}));
    let d=await planRead(t,{unitId,schoolYear});
    d=await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:schoolYear,action:'save_joint',payload:{jointId:null,name:'Syntetisk helgrupp',rowIds:d.rows.map(r=>r.id),teachers:[{personId:people[0].personId,ht:300,vt:400},{personId:people[1].personId,ht:500,vt:600}]}})))).result.detail : await yearSend(t,unitId,schoolYear,'save_joint',{jointId:null,name:'Syntetisk helgrupp',rowIds:d.rows.map(r=>r.id),teachers:[{personId:people[0].personId,ht:300,vt:400},{personId:people[1].personId,ht:500,vt:600}]}));
    const cat=await yearPreview(t,{unitId,schoolYear,mode:'catalog'}),to=yearManual(cat.candidates.find(p=>p.personId===s.draftPersonId));
    const move={action:'move',baseVersionId:d.version.id,items:d.rows.filter(r=>r.personId===people[0].personId).map((r,i)=>({itemKey:'move'+i,kind:'row',id:r.id,fromPersonId:r.personId,choice:to}))};
    const moved=await yearPreview(t,req(move));assert.deepEqual(codes(moved),[]);assert.equal(moved.selectedCount,2);assert.equal(moved.writeObjectCount,4);
    assert.deepEqual(moved.jointTotals,[{jointId:d.joints[0].id,personId:s.draftPersonId,ht:300,vt:400}]);
    assert.ok(moved.items.every(i=>i.before.ht===100 && i.after.ht===100));
    check(report,'whole-person group move counts all four members and transfers group time once, preserving other teacher time');
    const partial={...move,items:move.items.slice(0,1)};assert.ok(codes(await yearPreview(t,req(partial))).includes('joint_incomplete'));
    const collision={...move,items:move.items.map(i=>({...i,choice:yearManual(cat.candidates.find(p=>p.personId===people[1].personId))}))};
    assert.ok(codes(await yearPreview(t,req(collision))).includes('joint_person_collision'));
    const double={...move,items:d.rows.map((r,i)=>({itemKey:'both'+i,kind:'row',id:r.id,fromPersonId:r.personId,choice:to}))};
    assert.ok(codes(await yearPreview(t,req(double))).includes('joint_person_collision'));
    check(report,'partial group, existing target teacher and two source teachers selecting same target all block');
    await savepoint(t,async u=>{
      await u`update public.tjanst_joint_teacher_time set ht_minutes=ht_minutes+1 where group_id=${d.joints[0].id} and staff_person_id=${people[1].personId}`;
      const changed=await yearPreview(u,req(move));assert.equal(changed.currentRevision,moved.currentRevision);assert.notEqual(changed.previewHash,moved.previewHash);
      check(report,'unchanged other teacher group time is bound into preview hash even without plan revision');
    });
    const missing={...move,items:[{...move.items[0],id:randomUUID()}]};const blocked=await yearPreview(t,req(missing));assert.ok(codes(blocked).includes('wrong_scope'));assert.equal(blocked.items[0].before,null);assert.equal(blocked.items[0].after,null);
    check(report,'unknown move ID returns identified blocker with no fabricated before/after or cross-school data');
    support=await yearPreview(t,s.request());const duplicate={action:'bulk',baseVersionId:d.version.id,items:[{itemKey:'dup',kind:'row',payload:yearRowPayload(support,yearManual(support.candidates.find(p=>p.personId===people[0].personId)))}]};
    assert.ok(codes(await yearPreview(t,req(duplicate))).includes('duplicate_row'));
    check(report,'bulk never overwrites existing same-person need');
    await denied(t,report,'changed base returns conflict instead of mismatched/fabricated preview base',u=>yearRawPreview(u,req({...move,baseVersionId:randomUUID()})),'40001','tjanst_stale_basis');
    await savepoint(t,async u=>{
      // Synthetic boundary rows: all real PostgreSQL rows with stable IDs; no fake UI/API capacity claims.
      const baseRow=d.rows.find(r=>r.personId===people[1].personId),groupId=d.joints[0].id;
      for(let n=4;n<100;n++) {
        const rowId=randomUUID(),rowKey='synthetic-boundary-'+n;
        await u`insert into public.tjanst_rows select (jsonb_populate_record(null::public.tjanst_rows,to_jsonb(r)||jsonb_build_object(
          'id',${rowId}::uuid,'lineage_id',${randomUUID()}::uuid,'source_key',${key(rowKey,baseRow.classId)}::text,'timplan_row_key',${rowKey}::text))).*
          from public.tjanst_rows r where r.id=${baseRow.id}`;
        await u`insert into public.tjanst_joint_members(group_id,row_id) values(${groupId},${rowId})`;
      }
      const hundred=await yearPreview(u,req(move));assert.equal(hundred.writeObjectCount,100);assert.ok(!codes(hundred).includes('batch_too_large'));
      const specialId=randomUUID();await u`insert into public.tjanst_special_assignments(id,version_id,lineage_id,kind,label,staff_person_id,class_id,ht_minutes,vt_minutes,comment)
        values(${specialId},${d.version.id},${randomUUID()},'annat','Syntetisk extra',${people[0].personId},null,60,0,'')`;
      const over=await yearPreview(u,req({...move,items:[...move.items,{itemKey:'extra',kind:'special',id:specialId,fromPersonId:people[0].personId,choice:to}]}));
      assert.equal(over.selectedCount,3);assert.equal(over.writeObjectCount,101);assert.ok(codes(over).includes('batch_too_large'));
      assert.equal(over.jointTotals.length,1);
      check(report,'100 real group members fit; union with one extra selected special is101 and blocks, with group time counted once');
    });
  });
}

async function gyCases(db,report) {
 await rolledBack(db,async t=>{
  const s=await createTjanstYearFixture(t),{f,unitId,people}=s;
  const gy=await seedGy25Class(t,f),priorYear=gy.year,targetYear=priorYear+1;
  await f.actor(t,'principalA');
  if(!modern) await yearSend(t,unitId,priorYear,'create_draft',{basedOnVersionId:null});
  let d=await planRead(t,{unitId,schoolYear:priorYear});const priorNeed=d.classes.find(c=>c.classId===gy.classId).needs[0];
  d=await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:priorYear,action:'save_row',payload:{rowId:null,sourceKind:'class_timplan',sourceKey:priorNeed.sourceKey,personId:people[0].personId,teacherHt:120,teacherVt:180,comment:''},choice:'manual'})))).result.detail : await yearSend(t,unitId,priorYear,'save_row',{rowId:null,sourceKind:'class_timplan',sourceKey:priorNeed.sourceKey,personId:people[0].personId,teacherHt:120,teacherVt:180,comment:''}));
  const published=await (modern ? (await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{unitId:unitId,schoolYear:priorYear,action:'publish',payload:{}})))).result.detail : await yearSend(t,unitId,priorYear,'publish',{}));
  const [{revision}]=await t`select revision from public.timplans where id=${gy.planId}`;
  await t`select public.phase5_class_command(${t.json({operation:'link',commandId:randomUUID(),classId:gy.classId,schoolYear:targetYear,planId:gy.planId,expectedPlanRevision:revision,columnId:'ar2',expectedLinkRevision:null,previousPlanId:null})})`;
  const target=await planRead(t,{unitId,schoolYear:targetYear}),need=target.classes.find(c=>c.classId===gy.classId).needs[0];
  assert.ok(need);
  const before=await businessHashes(t),result=await yearPreview(t,{unitId,schoolYear:targetYear,mode:'row',sourceKey:need.sourceKey,rowId:null});
  assert.equal(result.baseVersionId,null);assert.equal(result.currentRow,null);assert.equal(result.recommendationStatus,'ready');
  assert.ok(result.suggestions[0].reasons.includes(priorNeed.rowKey===need.rowKey?'previous_same_class_row':'previous_same_class'));
  assert.equal(result.suggestions[0].references[0].classId,gy.classId);assert.equal(result.suggestions[0].references[0].versionId,published.version.id);
  assert.deepEqual(await businessHashes(t),before);
  check(report,'Gy25 same stable class over two real linked year-columns gives exact previous-class evidence and no implicit row/teacher', { priorYear,targetYear });
 });
}

async function openDatabase(ephemeral, report, stage) {
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
    report.baselineMode = 'ephemeral-before-year-preview'; report.pendingMigrations = stage==='current' ? TJANST_MIGRATION_REGISTRY.filter(m=>m.version>=ownVersion).map(m=>m.file) : [OWN];
    return { db: e.db, provenance: e.provenance, pending: stage==='current' ? TJANST_MIGRATION_REGISTRY.filter(m=>m.version>=ownVersion).map(m=>m.file) : [OWN], close: e.end };
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
    return { db: snapshot.db, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup();const after=await targetPendingMigrations();assert.equal(after.fingerprint,target.fingerprint);assert.deepEqual(after.journal,target.journal);report.targetUnchanged=true; } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}

export async function verifyTjanstYearPreview(out, { ephemeral = false, stage='current' } = {}) {
  assert.ok(['current','historical'].includes(stage));assert.ok(stage!=='historical'||ephemeral,'Historical stage requires --ephemeral');modern=false;
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-year-preview', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Synthetic SQL only in owned databases; no live target writes, HTTP/OIDC/browser or qualification claims',
      'Historical GR fixture is explicitly synthetic frozen data; calendar invalidation is a marked direct change, not a live calendar API test',
      'SS 12000:2024 / OpenAPI2.1.0: stable own Person/Group/Duty and inclusive dates; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); report.requestedStage=stage; source = await openDatabase(ephemeral, report,stage); report.database = source.provenance;
    const db = source.db, before = await allPublicHashes(db), fingerprint = await schemaFingerprint(db);
    if (source.pending.includes(OWN)) {
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
    report.migrationCheckCount=report.checks.length;
    if(stage==='current') {
      const suffix=source.pending.filter(p=>basename(p).slice(0,14)>basename(OWN).slice(0,14));
      if(suffix.length) await db.begin(async t=>{for(const file of suffix)await t.unsafe(readFileSync(resolve(ROOT,file),'utf8'));});
      report.appliedFollowing=suffix;
    }
    modern=!!(await db`select to_regprocedure('public.tjanst_year_ensure_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,uuid)') present`)[0].present;
    assert.equal(modern,stage==='current','Selected stage must match installed command schema');report.commandStage=stage;
    const installed = await allPublicHashes(db); await cases(db, report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'all synthetic cases roll back without remaining rows');
    report.historicalCheckCount=stage==='historical'?report.checks.length:report.migrationCheckCount;
    report.currentCheckCount=stage==='current'?report.checks.length-report.migrationCheckCount:0;
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' årsunderlagskontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),ephemeral=args.includes('--ephemeral'),si=args.indexOf('--stage'),stage=si<0?'current':args[si+1],rest=args.filter((a,i)=>a!=='--ephemeral'&&(si<0||i!==si&&i!==si+1));
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral] [--stage current|historical]');
  await verifyTjanstYearPreview(rest[1], { ephemeral,stage });
}
