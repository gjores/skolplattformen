#!/usr/bin/env node
// Stängd SQL-grund med verkliga anslutningar; inget Worker-/HTTP-/MFA-bevis.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';
import { canonicalCatalogJson, resolveProgramplanBasis, verifyProgramplanCatalog } from '../../web/lib/programplan-catalog.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const marker = 'Syntetiskt programplansprov';
function fixtureId(prefix, n) {
  if (!/^[0-9a-f]{8}$/u.test(prefix) || !Number.isSafeInteger(n) || n < 1 || n > 999) throw new Error('fixture_scope_invalid');
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
export function extractProgramplanFixture(source, prefix) {
  fixtureId(prefix, 1);
  const start = '-- Programplan fixture:', end = '-- End programplan fixture.';
  const a = source.indexOf(start), b = source.indexOf(end);
  if (a < 0 || b <= a || source.indexOf(start, a + start.length) >= 0 || source.indexOf(end, b + end.length) >= 0) throw new Error('fixture_markers_invalid');
  const block = source.slice(a, b);
  if (/\b(?:grant|truncate|drop)\b/iu.test(block) || !block.includes(marker)) throw new Error('fixture_source_invalid');
  const code = String(parseInt(prefix.slice(0, 5), 16)).padStart(6, '0').slice(-6);
  return block.replaceAll('55008000', prefix).replaceAll('55008030', `${code}30`).replaceAll('55008031', `${code}31`)
    .replaceAll('https://programplan.example.test', `https://${prefix}.programplan.example.test`);
}
export async function withProgramplanTarget(guard, callback) {
  const target = await guard('protected');
  return callback(target);
}
export async function cleanupProgramplanFixture(db, prefix) {
  const id = n => fixtureId(prefix, n);
  await db.begin(async tx => {
    const [owned] = await tx`select exists(select 1 from public.customers where id=${id(1)} and name=${marker}) as owned`;
    if (!owned?.owned) throw new Error('fixture_cleanup_refused');
    // Only this owned synthetic graph. Audit rows remain append-only, and
    // identities referenced by retained security events remain as anchors.
    await tx`set local session_replication_role=replica`;
    await tx`delete from public.app_sessions where id=any(${[80,81,82,83].map(id)}::uuid[])`;
    await tx`delete from public.programplan_education_receipts where customer_id=${id(1)}`;
    await tx`delete from public.organisation_events where organizer_id=${id(2)}`;
    await tx`delete from public.point_plan_events where point_plan_id in(select id from public.point_plans where organizer_id=${id(2)})`;
    await tx`delete from public.point_plans where organizer_id=${id(2)}`;
    await tx`delete from public.assignment_units where assignment_id in(select id from public.assignments where organizer_id=${id(2)})`;
    await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
    await tx`delete from public.mandate_units where customer_id=${id(1)}`;
    await tx`delete from public.access_assignments where customer_id=${id(1)}`;
    await tx`delete from public.assignments where organizer_id=${id(2)}`;
    await tx`delete from public.offerings where organizer_id=${id(2)}`;
    await tx`delete from public.school_unit_types where unit_id in(select id from public.school_units where organizer_id=${id(2)})`;
    await tx`delete from public.school_units where organizer_id=${id(2)}`;
    await tx`delete from public.memberships where customer_id=${id(1)}`;
    await tx`delete from public.organizers where id=${id(2)}`;
    await tx`delete from public.identities i where i.id=any(${[10,11,12,13].map(id)}::uuid[]) and not exists(select 1 from public.security_events e where e.actor_identity_id=i.id)`;
    await tx`delete from public.customers where id=${id(1)}`;
  });
  const [remaining] = await db`select
    (select count(*)::int from public.customers where id=${id(1)}) as customers,
    (select count(*)::int from public.app_sessions where id=any(${[80,81,82,83].map(id)}::uuid[])) as sessions,
    (select count(*)::int from public.point_plans where organizer_id=${id(2)}) as plans,
    (select count(*)::int from public.programplan_education_receipts where customer_id=${id(1)}) as receipts,
    (select count(*)::int from public.organisation_events where organizer_id=${id(2)}) as educationEvents,
    (select count(*)::int from public.offerings where organizer_id=${id(2)}) as offerings,
    (select count(*)::int from public.access_assignments where customer_id=${id(1)}) as mandates,
    (select count(*)::int from public.security_events where customer_id=${id(1)}) as preservedAuditEvents,
    (select count(*)::int from public.identities i where i.id=any(${[10,11,12,13].map(id)}::uuid[]) and exists(select 1 from public.security_events e where e.actor_identity_id=i.id)) as preservedAuditAnchors`;
  for (const field of ['customers','sessions','plans','offerings','mandates','receipts','educationevents']) assert.equal(remaining[field], 0, `cleanup_${field}`);
  return remaining;
}
function normalizedResolution(r) {
  assert.equal(r.decisionReady, false);
  if (Object.hasOwn(r, 'writeReady')) assert.equal(r.writeReady, false);
  return { status:r.status, catalogId:r.catalogId, programRef:r.programRef,
    diagnostics:r.diagnostics.map(canonicalCatalogJson).sort(), unresolvedChoices:r.unresolvedChoices.map(canonicalCatalogJson).sort() };
}
export function programplanWorkerNames(profile='closed') {if(!['closed','programplan','workspace','education'].includes(profile))throw Error('worker_profile_invalid');return ['phase5_change_timplan_cell','phase5_list_timplans','phase5_read_timplan',...(profile!=='closed'?['phase5_read_programplan','phase5_bind_programplan_draft','phase5_replace_programplan_specialization','phase5_create_programplan_draft','phase5_clone_programplan_draft']:[]),...(['workspace','education'].includes(profile)?['phase5_list_programplan_offerings','phase5_programplan_workspace']:[]),...(profile==='education'?['phase5_programplan_selection','phase5_create_programplan_education','phase5_programplan_education_status']:[])].sort();}
export async function runProgramplanVerification({workerProfile='closed',outFile=new URL('./results/phase5-08-locks.json',import.meta.url)}={}) {
  const expectedWorkerNames=programplanWorkerNames(workerProfile);
  return withProgramplanTarget(assertTarget, async target => {
    const require = createRequire(new URL('../../web/package.json', import.meta.url));
    const postgres = require('postgres');
    const db = postgres(target.dbUrl, {max:3, prepare:false, connect_timeout:10, onnotice:()=>{}});
    const prefix = randomUUID().slice(0,8), id = n => fixtureId(prefix,n);
    const report = {target:'protected',scope:'closed SQL; no Worker/API/MFA verification',status:'FAIL',cases:[],parity:[],cleanup:null};
    let a, b, roles, setup=false, activeCase='setup';
    try {
      const artifact = JSON.parse(await readFile(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
      const catalog = await verifyProgramplanCatalog(artifact);
      report.catalogId = catalog.catalogId;
      const fixture = extractProgramplanFixture(await readFile(new URL('../../supabase/tests/phase5_programplan_drafts.test.sql',import.meta.url),'utf8'),prefix);
      await db.begin(async tx => {
        await tx.unsafe(fixture);
        roles = Object.fromEntries((await tx`select name,id from programplan_roles`).map(r=>[r.name,r.id]));
      });
      setup=true;
      const ref = (refs=[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100}]) => ({catalogId:catalog.catalogId,
        programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),specializationRefs:refs});
      activeCase='catalog-parity';
      const inputs = catalog.programs.map(p=>({name:`program-${p.code}`,value:{catalogId:catalog.catalogId,programRef:{code:p.code,version:p.version},
        orientationCode:p.orientations[0]?.code??null,startedOn:nextCohortStart(),specializationRefs:[]}}));
      const level = ref().specializationRefs[0];
      const gy11=catalog.subjects.find(s=>s.typeOfSyllabus==='SUBJECT_SYLLABUS'&&s.items.length);
      const gr=catalog.subjects.find(s=>s.schoolTypes.includes('GR'));
      const subjectRef=s=>({subjectCode:s.code,subjectVersion:s.version,itemCode:s.items[0]?.code??'UNKNOWN',points:s.items[0]?.points??0});
      inputs.push(...[
        ['historical-start',{...ref(),startedOn:'2025-08-01'}],['historical-program',{...ref(),programRef:{code:'SA25',version:3}}],
        ['invalid-start',{...ref(),startedOn:'2026-02-30'}],['orientation',{...ref(),orientationCode:'UNKNOWN'}],
        ['wrong-subject',ref([{...level,subjectCode:'MATE'}])],['points',ref([{...level,points:50}])],
        ['missing-item',ref([{...level,itemCode:'UNKNOWN'}])],['gy11',ref([subjectRef(gy11)])],['ground-school',ref([subjectRef(gr)])],['duplicate',ref([level,level])],
        ['fixed',ref([{...level,itemCode:'ENGE1000X'}])],['unbound',{}],['extra-field',{...ref(),role:'huvudman'}],
      ].map(([name,value])=>({name,value})));
      for (const input of inputs) {
        const [row] = await db`select public.phase5_resolve_programplan_basis(${db.json(input.value)}::jsonb) as result`;
        const sqlResolution=normalizedResolution(row.result), tsResolution=normalizedResolution(resolveProgramplanBasis(catalog,input.value));
        if(['unbound','extra-field'].includes(input.name)) {
          // SQL has no verified catalog selected on malformed input; TS already has its capability.
          assert.equal(sqlResolution.catalogId,null);assert.equal(sqlResolution.programRef,null);
          tsResolution.catalogId=null;tsResolution.programRef=null;
        }
        assert.deepEqual(sqlResolution,tsResolution,input.name);
        report.parity.push({name:input.name,status:'PASS'});
      }
      a=await db.reserve(); b=await db.reserve();
      const [{pid:aPid}]=await a`select pg_backend_pid() as pid`, [{pid:bPid}]=await b`select pg_backend_pid() as pid`;
      const context = async (sql, second=false) => sql`select set_config('app.customer_id',${id(1)},true),
        set_config('app.assignment_id',${roles[second?'principal2':'principal']},true),set_config('app.membership_id',${id(second?22:21)},true),
        set_config('app.identity_id',${id(second?12:11)},true),set_config('app.session_id',${id(second?82:81)},true),set_config('app.correlation_id',${randomUUID()},true)`;
      const begin = async () => { for(const c of [a,b]) {await c`begin`;await c`set local statement_timeout='15s'`;} await context(a);await context(b,true); };
      const waitForLock = async () => {
        for(let attempt=0;attempt<150;attempt++) {
          const [row]=await db`select ${aPid}::integer=any(pg_blocking_pids(${bPid})) as waiting,
            (select locktype from pg_locks where pid=${bPid} and not granted limit 1) as kind`;
          if(row.waiting) return row.kind;
          await new Promise(done=>setTimeout(done,20));
        }
        throw new Error('expected_lock_missing');
      };
      const snapshot = async plan => {
        const [r]=await db`select id,offering_id,version,revision,status,catalog_id,basis_reference,specialization,decided_on,decided_by from public.point_plans where id=${plan}`;
        return r;
      };
      const auditCount = async () => {const [r]=await db`select count(*)::int as n from public.security_events where customer_id=${id(1)}`;return r.n;};
      const replace = (c,plan,revision,refs) => c`select public.phase5_replace_programplan_specialization(${plan},${revision},${db.json(refs)}::jsonb) as result`;
      const finishConflict = async (pending,expected,lock) => {
        await a`commit`;const outcome=await pending;assert.equal(outcome.code,expected);await b`rollback`;
        assert.ok(['advisory','transactionid','tuple'].includes(lock));
        return {name:activeCase,status:'PASS',waitingObserved:true,lockType:lock,outcome:expected,dataPreserved:true};
      };
      activeCase='same-revision-replace';
      let letCase;
      let before=await snapshot(id(50)), events=await auditCount();
      await begin();await replace(a,id(50),before.revision,[]);
      let pending=replace(b,id(50),before.revision,ref().specializationRefs).then(result=>({result}),error=>({code:error.code}));
      letCase=await finishConflict(pending,'40001',await waitForLock());
      let after=await snapshot(id(50));assert.equal(after.revision,before.revision+1);assert.deepEqual(after.specialization,[]);assert.equal(await auditCount(),events+1);

      report.cases.push(letCase);
      activeCase='same-revision-bind';
      const anim=catalog.subjects.find(s=>s.code==='ANIM'), animItem=anim.items.find(i=>i.code==='ANIM1000X');
      const legacy=ref([...ref().specializationRefs,{subjectCode:anim.code,subjectVersion:anim.version,itemCode:animItem.code,points:animItem.points}]);
      before=await snapshot(id(51));events=await auditCount();
      await begin();await a`select public.phase5_bind_programplan_draft(${id(51)},${before.revision},${db.json(legacy)}::jsonb)`;
      pending=b`select public.phase5_bind_programplan_draft(${id(51)},${before.revision},${db.json(legacy)}::jsonb)`.then(result=>({result}),error=>({code:error.code}));
      letCase=await finishConflict(pending,'40001',await waitForLock());
      after=await snapshot(id(51));assert.equal(after.revision,before.revision+1);assert.deepEqual(after.specialization,before.specialization);
      assert.deepEqual(after.basis_reference,legacy);assert.equal(await auditCount(),events+1);

      report.cases.push(letCase);
      activeCase='one-next-draft';before=await snapshot(id(52));events=await auditCount();
      await begin();const [created]=await a`select public.phase5_clone_programplan_draft(${id(52)},${before.revision},${before.version},${db.json(ref())}::jsonb) as result`;
      pending=b`select public.phase5_clone_programplan_draft(${id(52)},${before.revision},${before.version},${db.json(ref())}::jsonb)`.then(result=>({result}),error=>({code:error.code}));
      letCase=await finishConflict(pending,'40001',await waitForLock());
      assert.deepEqual(await snapshot(id(52)),before);const [count]=await db`select count(*)::int as drafts,max(version)::int as version from public.point_plans where offering_id=${id(42)} and status='utkast'`;
      assert.equal(count.drafts,1);assert.equal(count.version,before.version+1);const cloned=await snapshot(created.result.id);
      assert.equal(cloned.status,'utkast');assert.equal(cloned.revision,0);assert.equal(cloned.decided_on,null);assert.deepEqual(cloned.specialization,before.specialization);assert.equal(await auditCount(),events+1);

      report.cases.push(letCase);
      activeCase='plan-row-revision';before=await snapshot(id(50));events=await auditCount();
      await begin();await a`select id from public.point_plans where id=${id(50)} for update`;
      pending=replace(b,id(50),before.revision,ref().specializationRefs).then(result=>({result}),error=>({code:error.code}));
      const rowLock=await waitForLock();assert.ok(['transactionid','tuple'].includes(rowLock));
      await a`update public.point_plans set revision=revision+1 where id=${id(50)}`;
      letCase=await finishConflict(pending,'40001',rowLock);after=await snapshot(id(50));assert.equal(after.revision,before.revision+1);assert.deepEqual(after.specialization,before.specialization);assert.equal(await auditCount(),events);

      report.cases.push(letCase);
      activeCase='parent-revoked-after-wait';before=await snapshot(id(50));events=await auditCount();
      await begin();await a`select public.phase3_lock_customer(${id(1)})`;await a`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`;
      pending=replace(b,id(50),before.revision,ref().specializationRefs).then(result=>({result}),error=>({code:error.code}));
      letCase=await finishConflict(pending,'42501',await waitForLock());assert.deepEqual(await snapshot(id(50)),before);assert.equal(await auditCount(),events);
      await db`update public.access_assignments set ended_at=null where id=${id(60)}`;

      report.cases.push(letCase);
      activeCase='session-expired-after-wait';before=await snapshot(id(50));events=await auditCount();
      await db`update public.app_sessions set expires_at=clock_timestamp()+interval '1 second' where id=${id(82)}`;
      await begin();await a`select public.phase3_lock_customer(${id(1)})`;
      pending=replace(b,id(50),before.revision,ref().specializationRefs).then(result=>({result}),error=>({code:error.code}));
      const expiryLock=await waitForLock();let expired=false;
      for(let attempt=0;attempt<150;attempt++) {const [r]=await db`select clock_timestamp()>=expires_at as expired from public.app_sessions where id=${id(82)}`;if(r.expired){expired=true;break;}await new Promise(done=>setTimeout(done,20));}
      assert.equal(expired,true);letCase=await finishConflict(pending,'42501',expiryLock);assert.deepEqual(await snapshot(id(50)),before);assert.equal(await auditCount(),events);
      await db`update public.app_sessions set expires_at=clock_timestamp()+interval '1 hour' where id=${id(82)}`;

      report.cases.push(letCase);
      activeCase='outer-transaction-rollback';before=await snapshot(id(50));events=await auditCount();
      await assert.rejects(db.begin(async tx=>{await context(tx);await replace(tx,id(50),before.revision,ref().specializationRefs);throw new Error('required_following_step_failed');}),/required_following_step_failed/);
      assert.deepEqual(await snapshot(id(50)),before);assert.equal(await auditCount(),events);
      report.cases.push({name:activeCase,status:'PASS',dataPreserved:true,auditPreserved:true,scope:'SQL caller rollback'});
      const acl=await db`select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute') order by proname`;
      assert.deepEqual(acl.map(r=>r.proname),expectedWorkerNames);
      report.phase5WorkerFunctions=acl.map(r=>r.proname);report.status='PASS';
    } catch(error) {
      report.failedCase=activeCase;report.code=typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/u.test(error.code)?error.code:'TEST_FAILED';
    } finally {
      for(const c of [a,b])if(c){await c`rollback`.catch(()=>{});c.release();}
      if(setup)try{await assertTarget('protected');report.cleanup=await cleanupProgramplanFixture(db,prefix);}catch{report.status='FAIL';report.cleanupFailed=true;}
      await db.end({timeout:3});
    }
    report.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    report.checkedAt=new Date().toISOString();report.sourceHashes={};
    for(const path of ['supabase/migrations/20260930160000_phase5_programplan_catalog.sql','supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql',
      'supabase/migrations/20260930162000_phase5_programplan_drafts.sql','supabase/tests/phase5_programplan_drafts.test.sql','work/pilot/verify-programplan-locks.mjs']) {
      report.sourceHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
    }
    await writeFile(outFile,`${JSON.stringify(report,null,2)}\n`);
    return report;
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===1&&['--programplan','--workspace','--education'].includes(args[0]))){process.stderr.write('REFUSED: endast --programplan eller --workspace tillåten\n');process.exitCode=1;}
  else try {const report=await runProgramplanVerification(args[0]==='--education'?{workerProfile:'education',outFile:new URL('./results/phase5-15-regression-locks.json',import.meta.url)}:args[0]==='--workspace'?{workerProfile:'workspace',outFile:new URL('./results/phase5-10-locks.json',import.meta.url)}:args[0]==='--programplan'?{workerProfile:'programplan',outFile:new URL('./results/phase5-09-locks.json',import.meta.url)}:{});process.stdout.write(`${JSON.stringify(report)}\n`);if(report.status!=='PASS')process.exitCode=1;}
  catch{process.stderr.write('Programplansprovet kunde inte startas mot verifierat protected-mål.\n');process.exitCode=1;}
}
