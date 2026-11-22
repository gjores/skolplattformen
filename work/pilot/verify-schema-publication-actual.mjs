// Publicering och elevkort via skyddad Worker och syntetiska data i provets ägda namnrymd.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { defaultSchemaVillkor, parseSchemaForslag } from '../../web/lib/schema-contract.ts';
import { SCHEMA_DRAFT_VERSION, parseSchemaDraftSave, verifySchemaDraftSaveReply } from '../../web/lib/schema-draft-contract.ts';
import { parseSchemaPublicationReply, parseSchemaPublicationRequest } from '../../web/lib/schema-publication-contract.ts';
import { STUDY_PLAN_CONTRACT_VERSION, parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply } from '../../web/lib/study-plan-contract.ts';
import { createLogins, login } from './verify-schema-draft-actual.mjs';
import { seedTjanstActual } from './tjanst-oidc-fixtures.mjs';

const { chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('@playwright/test');
const roles = ['principalA', 'admin', 'principalB', 'principalAB'];
const publicationPath = '/api/schema/publicering';

async function seedPupil(tx, seed) {
  const pupilId = randomUUID(), placementId = randomUUID();
  const { customerId, organizerId, year, gy: { offeringId, classId }, schools: { A: unitId } } = seed;
  const [synthetic] = await tx`select number from (
    select 'TEST-20100101-'||lpad(n::text,4,'0') number from generate_series(801,1400) n
  ) s where public.phase4_synthetic_birth_date(number) is not null
    and not exists(select 1 from public.synthetic_pupil_numbers x where x.personal_number=s.number)
    order by number limit 1`;
  assert.ok(synthetic);
  await tx`insert into public.synthetic_pupil_numbers(personal_number) values(${synthetic.number})`;
  await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
    values(${pupilId},${customerId},${organizerId},'Syntetisk elev för schemapublicering',${synthetic.number},'Syntetiskt alias')`;
  await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
    values(${placementId},${customerId},${organizerId},${pupilId},${unitId},${offeringId},${year + '-08-17'})`;
  await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
    values(${customerId},${organizerId},${pupilId},${unitId},${classId},${placementId},${year + '-08-17'})`;
  return { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId, pupilId, placementId };
}

export async function verifySchemaPublicationActual({ out, runtimeFactory }) {
  assert.equal(typeof runtimeFactory, 'function');
  out = resolve(out);
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json') && !existsSync(out));
  const directory = out.slice(0, -5) + '-evidence';
  mkdirSync(directory, { mode: 0o700 });
  const report = { kind: 'schema-publication-actual-protected', status: 'FAIL', startedAt: new Date().toISOString(), checks: [],
    limits: ['Egen isolerad körning med syntetiska skolor, elever och riktiga OIDC-sessioner.',
      'Schemat läses vid ett uttryckligt syntetiskt terminsdatum. Ingen informationsöverföring till annan tjänst.'] };
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const pass = name => { report.checks.push(name); save(); console.log(JSON.stringify({ check: name, status: 'PASS' })); };
  let runtime, browser, stage = 'förbereder prov';
  const sessions = {};
  try {
    runtime = await runtimeFactory({ directory, onStage: value => console.log(JSON.stringify({ stage: value })) });
    const baseURL = runtime.baseURL;
    assert.ok(baseURL.startsWith('http://127.0.0.1:'));
    const seed = await seedTjanstActual(runtime.db, { published: true });
    const pupil = await runtime.db.begin(tx => seedPupil(tx, seed));
    const users = await createLogins(runtime, seed, roles);
    const build = await runtime.startWorker();
    report.runtime = { kind: build.kind, release: build.release, health: build.health, migrations: build.migrations, noTargetReads: build.noTargetReads };
    browser = await chromium.launch({ headless: true });
    for (const role of roles) {
      stage = 'OIDC ' + role;
      sessions[role] = await login(runtime, browser, users[role], role, directory);
    }
    assert.deepEqual(roles.map(role => sessions[role].proof.mfa), [true, true, true, false]);
    const post = async (path, input, role = 'principalA', headers = {}) => {
      const session = sessions[role];
      const response = await session.page.request.post(baseURL + path, { data: input, timeout: 60000,
        headers: { Origin: baseURL, 'X-Context-Epoch': String(session.epoch), ...headers } });
      return { status: response.status(), body: await response.json(), cache: response.headers()['cache-control'] };
    };
    const statusRequest = parseSchemaPublicationRequest({ action: 'status', unitId: pupil.unitId, schoolYear: seed.year, period: 'ht' });
    const { unitId, schoolYear, period } = statusRequest;
    stage = 'behörig första läsning';
    const initial = await post(publicationPath, statusRequest);
    assert.equal(initial.status, 200);
    assert.equal(initial.cache, 'no-store');
    assert.deepEqual(parseSchemaPublicationReply(initial.body, statusRequest), { publication: null });
    for (const [role, reason] of [['principalB', 'forbidden'], ['principalAB', 'mfa_required']]) {
      const denied = await post(publicationPath, statusRequest, role);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, reason);
      assert.ok(!Object.hasOwn(denied.body, 'publication'));
    }
    pass('MFA krävs och publiceringens status kan bara läsas inom rätt skolenhet.');

    stage = 'syntetisk individuell studieplan';
    const planRequest = { ...pupil, view: 'current', on: schoolYear + '-10-15' };
    const readPlan = async () => {
      const result = await post('/api/studieplaner/lasa', planRequest);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return parseStudyPlanReadReply(result.body, planRequest);
    };
    const beforeDraft = await readPlan();
    const prepare = parseStudyPlanCommand({ ...pupil, commandId: randomUUID(), expectedRevision: beforeDraft.latestRevision,
      expectedSourceToken: beforeDraft.sourceToken, action: 'prepare_draft', payload: { dates: [] } });
    const prepared = await post('/api/studieplaner/kommando', prepare);
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    assert.equal(parseStudyPlanCommandReply(prepared.body, prepare).status, 'saved');

    stage = 'färdigt schemautkast';
    const request = { unitId, schoolYear, period, villkor: defaultSchemaVillkor() };
    const proposal = await post('/api/schema/forslag', request);
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    const f = parseSchemaForslag(proposal.body, request);
    assert.equal(f.metrics.unplaced, 0);
    assert.ok(f.lessons.length && f.time.current);
    const command = parseSchemaDraftSave({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: randomUUID(), draftId: null,
      expectedRevision: 0, name: 'Syntetiskt schema för publicering', basisVillkor: f.villkor, workingVillkor: f.villkor, grundFingerprint: f.grundFingerprint,
      placements: f.lessons.map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })), locks: [], intentional: [], datedOverrides: [], activityTypes: [] });
    const saved = await post('/api/schema/utkast/spara', command);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const { draft } = await verifySchemaDraftSaveReply(saved.body, command);
    assert.equal(draft.control.total, 0);
    const planWithoutSchedule = await readPlan();
    assert.ok(planWithoutSchedule.draft);
    assert.deepEqual(planWithoutSchedule.schedule ?? [], []);
    pass('Ett färdiglagt och sparat utkast ger ingen schemainformation i elevens studieplan.');

    stage = 'publicerar den sparade revisionen';
    const publish = parseSchemaPublicationRequest({ ...statusRequest, action: 'publish', draftId: draft.id,
      revision: draft.revision, contentHash: draft.contentHash, commandId: randomUUID() });
    assert.equal((await post(publicationPath, publish, 'admin')).status, 403);
    assert.equal((await post(publicationPath, publish, 'principalA', { Origin: 'https://annan.example.test' })).status, 403);
    assert.equal((await post(publicationPath, { ...publish, revision: publish.revision + 1 })).status, 409);
    const written = await post(publicationPath, publish);
    assert.equal(written.status, 200, JSON.stringify(written.body));
    const { publication } = parseSchemaPublicationReply(written.body, publish);
    assert.ok(publication);
    const retry = await post(publicationPath, publish);
    assert.deepEqual(retry.body, written.body);
    assert.deepEqual((await post(publicationPath, statusRequest, 'admin')).body, written.body);
    const [{ count }] = await runtime.db`select count(*)::int from public.schema_publications where customer_id=${seed.customerId}`;
    assert.equal(count, 1);
    pass('Rektor publicerar en exakt sparad revision. Omgörning återger samma publicering. Administratör kan läsa, och olovlig skrivning nekas.');

    stage = 'läser datumen på elevens egen studieplan';
    const planWithSchedule = await readPlan();
    assert.equal(planWithSchedule.latestRevision, planWithoutSchedule.latestRevision);
    assert.deepEqual(planWithSchedule.draft, planWithoutSchedule.draft);
    assert.ok(planWithSchedule.schedule.some(row => row.scheduledNow), 'exact class and curriculum match in active published term');
    for (const row of planWithSchedule.schedule) {
      const level = planWithSchedule.draft.content.levels.find(l => l.id === row.levelId);
      assert.equal(row.attemptId, level.attempts[0].id);
      const [{ firstPass }] = await runtime.db`select min(day)::text as "firstPass"
        from public.schema_publication_study_tracks t cross join lateral unnest(t.days) day
        where t.publication_id=${publication.id} and t.target_id=${seed.gy.classId}
          and t.subject_code=${level.subjectCode} and t.subject_version=${level.subjectVersion}
          and t.item_code=${level.itemCode} and t.language_code is not distinct from ${level.languageCode}`;
      assert.equal(row.firstPassOn, firstPass);
      assert.equal(level.attempts[0].actual.start, null);
    }
    assert.equal((await post('/api/studieplaner/lasa', planRequest, 'principalB')).status, 403);
    const audit = await runtime.db`select source,action,count(*)::int from public.security_events
      where customer_id=${seed.customerId} and action in ('schema_published','schema_publication_published')
      group by source,action order by source,action`;
    assert.deepEqual([...audit], [{ source: 'db', action: 'schema_published', count: 1 }, { source: 'worker', action: 'schema_publication_published', count: 1 }]);
    report.scheduleRows = planWithSchedule.schedule.length;
    pass('Elevens exakta nivåer och studieförsök får giltiga datum från publiceringen. Planrevisionen och faktisk start består vid omläsning.');
    report.status = 'PASS';
  } catch (error) {
    report.failure = { stage, code: error.code ?? error.name, message: String(error.message).slice(0, 900) };
  } finally {
    for (const session of Object.values(sessions)) await session.context.close().catch(() => {});
    await browser?.close().catch(() => {});
    for (const role of roles) rmSync(join(directory, 'auth-' + role + '.json'), { force: true });
    if (runtime) try { report.cleanup = await runtime.cleanup(); } catch { report.status = 'FAIL'; report.cleanup = { cleanup: 'failed' }; }
    report.completedAt = new Date().toISOString();
    save();
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: out }));
  return report;
}
