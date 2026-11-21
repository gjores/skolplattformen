#!/usr/bin/env node
// SP-06 uses the prepared, owned network namespace. HTTP checks never substitute auth, API, or data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogins, login } from './verify-schema-draft-actual.mjs';
import { seedTjanstActual } from './tjanst-oidc-fixtures.mjs';
import { seedIndividualStudyPlanPupils, seedStudyPlanImpactGroups } from './verify-individual-study-plan-sql.mjs';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply,
  parseStudyPlanReadRequest, parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION,
} from '../../web/lib/study-plan-contract.ts';
import { studyAttemptStatus, studyPlanContentIssues, studyPlanLevelKey } from '../../web/lib/study-plan-model.ts';
import { parseStudyGroupReply, STUDY_GROUP_CONTRACT_VERSION } from '../../web/lib/study-group-contract.ts';
import { defaultSchemaVillkor } from '../../web/lib/schema-contract.ts';
import { parseSchemaDraftSave, verifySchemaDraftReadReply, verifySchemaDraftSaveReply } from '../../web/lib/schema-draft-contract.ts';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium, webkit, expect, devices } = require('@playwright/test');
const ROLES = ['principalA', 'admin', 'principalB', 'principalAB'];
const year = 2026;
const firstEffective = '2026-09-01', movedOn = '2027-02-15';
const termStart = { kind: 'term', schoolYear: 2028, term: 'HT' };
const termEnd = { kind: 'term', schoolYear: 2028, term: 'VT' };
const exactStart = '2028-08-21', exactEnd = '2029-06-13';
const tables = ['pupils', 'pupil_placements', 'school_classes', 'pupil_class_memberships', 'offerings', 'valplan_choices',
  'study_groups', 'study_group_memberships', 'timplans', 'class_timplans', 'tjanst_versions', 'tjanst_rows',
  'schema_drafts', 'schema_draft_revisions', 'schema_draft_commands',
  'individual_study_plans', 'individual_study_plan_revisions', 'individual_study_plan_receipts'];
const planTables = tables.filter(table => table.startsWith('individual_study_'));

const scope = pupil => ({ contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId: pupil.unitId, pupilId: pupil.pupilId, placementId: pupil.placementId });
const rowFor = (snapshot, itemCode = 'ENGE1000X') => {
  const row = snapshot?.content.levels.find(level => level.itemCode === itemCode);
  assert.ok(row, 'requested level exists in the plan');
  return row;
};
const dateEdit = (row, plannedStart, plannedEnd) => ({ levelId: row.id, attemptId: row.attempts[0].id, plannedStart, plannedEnd });

async function ownedActor(tx, seed, session, role) {
  const actor = seed.actors[role];
  for (const [key, value] of Object.entries({ identity_id: actor.identityId, membership_id: actor.membershipId,
    assignment_id: actor.assignmentId, customer_id: seed.customerId, session_id: session.sessionId, correlation_id: randomUUID() })) {
    await tx`select set_config(${'app.' + key},${value},true)`;
  }
  await tx`set local role skolplattform_worker`;
}

async function seedSeparatePupil(tx, seed, pupil) {
  const pupilId = randomUUID(), placementId = randomUUID(), membershipId = randomUUID();
  const displayName = 'Syntetisk elev för klass- och gruppbyte';
  const [synthetic] = await tx`select number from
    (select 'TEST-20100101-'||lpad(n::text,4,'0') number from generate_series(801,1400) n) s
    where public.phase4_synthetic_birth_date(number) is not null
    and not exists(select 1 from public.synthetic_pupil_numbers x where x.personal_number=s.number)
    order by number limit 1`;
  assert.ok(synthetic);
  await tx`insert into public.synthetic_pupil_numbers(personal_number) values(${synthetic.number})`;
  await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
    values(${pupilId},${seed.customerId},${seed.organizerId},${displayName},${synthetic.number},'Syntetiskt alias')`;
  await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
    values(${placementId},${seed.customerId},${seed.organizerId},${pupilId},${pupil.unitId},${pupil.offeringId},'2026-08-17')`;
  await tx`insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
    values(${membershipId},${seed.customerId},${seed.organizerId},${pupilId},${pupil.unitId},${pupil.classId},${placementId},'2026-08-17')`;
  return { ...pupil, pupilId, placementId, membershipId, displayName };
}

async function hashes(db, names = tables) {
  return Object.fromEntries(await Promise.all(names.map(async name => {
    assert.ok(tables.includes(name));
    const [{ fingerprint, rows }] = await db.unsafe(`select md5(coalesce(string_agg(md5(to_jsonb(x)::text),
      '' order by md5(to_jsonb(x)::text)), '')) fingerprint,count(*)::int as rows from public.${name} x`);
    return [name, { fingerprint, rows }];
  })));
}

function selecting(available, programCode) {
  const selections = [], taken = new Set();
  const include = (choiceId, item) => {
    assert.ok(item && !taken.has(studyPlanLevelKey(item)), 'distinct allowed curriculum choice');
    taken.add(studyPlanLevelKey(item));
    const { subjectCode, subjectVersion, itemCode, languageCode } = item;
    selections.push({ choiceId, level: { subjectCode, subjectVersion, itemCode, languageCode } });
  };
  const inChoice = id => available.filter(item => item.choiceIds?.includes(id));
  for (const code of ['SVEN1000X', 'SVEN2000X', 'SVEN3000X']) include('svenska', inChoice('svenska').find(item => item.itemCode === code));
  if (programCode === 'SA25') {
    for (const code of ['MODY1000X', 'MODG1000X']) include('mosp', inChoice('mosp').find(item => item.itemCode === code && item.languageCode === 'es'));
    assert.ok(inChoice('mosp').some(item => item.itemCode === 'MODY1000X' && item.languageCode === 'de'));
  }
  for (const [kind, count] of [['specialization', programCode === 'SA25' ? 3 : 5], ['individual', 2]]) {
    const subjects = new Set();
    for (const option of inChoice(kind)) {
      if (option.points !== 100 || option.languageCode !== null || taken.has(studyPlanLevelKey(option))
        || subjects.has(option.subjectCode) || !option.itemCode.slice(option.subjectCode.length).startsWith('1')) continue;
      include(kind, option);
      subjects.add(option.subjectCode);
      if (subjects.size === count) break;
    }
    assert.equal(subjects.size, count, `catalog choices for ${kind}`);
  }
  return { selections, confirmedChoiceIds: [...new Set(selections.map(selection => selection.choiceId))] };
}

async function openPupilPlan(page, baseURL, pupil, { reload = false } = {}) {
  if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
  else await page.goto(baseURL + '/?vy=elever&lasar=' + year + '&skola=' + pupil.unitId + '&sida=1', { waitUntil: 'domcontentloaded' });
  const pupilButton = page.getByRole('button', { name: pupil.displayName + ', öppna elevkortet', exact: true });
  await expect(pupilButton).toBeEnabled({ timeout: 20000 });
  const [pupilReply] = await Promise.all([
    page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/elever/elev' && url.searchParams.get('pupilId') === pupil.pupilId;
    }, { timeout: 20000 }),
    pupilButton.click(),
  ]);
  assert.equal(pupilReply.status(), 200, 'ordinary pupil card HTTP read');
  await expect(page.getByRole('heading', { name: pupil.displayName, exact: true })).toBeFocused({ timeout: 15000 });
  const tab = page.getByRole('tab', { name: 'Studieplan', exact: true });
  await tab.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const plan = page.getByRole('region', { name: /^Studieplan för /u });
  await expect(plan.getByRole('heading', { name: /^Studieplan för /u })).toBeVisible({ timeout: 15000 });
  assert.equal(new URL(page.url()).searchParams.has('pupilId'), false);
  return plan;
}

function planLevel(panel, label) {
  return panel.getByRole('table', { name: 'Ämnesnivåer och gymnasiearbete', exact: true }).getByRole('row')
    .filter({ has: panel.getByRole('rowheader', { name: label }) });
}

async function clickCommand(page, button, action) {
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/studieplaner/kommando' && response.request().postDataJSON()?.action === action,
    { timeout: 30000 }),
    button.click(),
  ]);
  assert.equal(response.status(), 200, `browser command ${action}`);
  const input = parseStudyPlanCommand(response.request().postDataJSON());
  return parseStudyPlanCommandReply(await response.json(), input);
}

async function viewportFits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'study plan fits viewport');
}

export async function verifyStudyPlanActual({ out, runtimeFactory }) {
  assert.equal(typeof runtimeFactory, 'function', 'prepared own-runtime factory required');
  out = resolve(out);
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json') && !existsSync(out));
  const directory = join(dirname(out), out.split('/').at(-1).slice(0, -5) + '-evidence');
  mkdirSync(directory, { mode: 0o700 });
  const report = { kind: 'individual-study-plan-actual-protected', status: 'FAIL', startedAt: new Date().toISOString(), checks: [],
    limits: ['Own prepared release and synthetic pupils, schools and assignments only', 'Local actual OIDC/MFA, no municipal production integration or product installation',
      'Phone profile uses the actual session in WebKit device emulation. Human acceptance is separate.'], screenshots: [] };
  const saveReport = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const pass = name => { report.checks.push({ name, status: 'PASS' }); saveReport(); console.log(JSON.stringify({ check: name, status: 'PASS' })); };
  let stage = 'start', runtime, desktop, phoneBrowser, phoneContext, comparisonPage;
  const sessions = {};
  try {
    runtime = await runtimeFactory({ directory, onStage: value => console.log(JSON.stringify({ stage: value })) });
    assert.ok(runtime.baseURL.startsWith('http://127.0.0.1:'), 'own loopback target');
    stage = 'synthetic setup';
    const seed = await seedTjanstActual(runtime.db);
    const { sa, bf, protected: protectedPupil, moved } = await runtime.db.begin(async tx => {
      const pupils = await seedIndividualStudyPlanPupils(tx, { customerId: seed.customerId, organizerId: seed.organizerId,
        schoolAId: seed.schools.A, schoolBId: seed.schools.B });
      const moved = await seedSeparatePupil(tx, seed, pupils.sa);
      return { ...pupils, moved };
    });
    const [{ today }] = await runtime.db`select public.app_today()::text as today`;
    assert.ok(today >= '2026-11-20', 'fixture dates have commenced');
    assert.equal((await runtime.db`select count(*)::int as n from public.class_timplans
      where class_id in (${sa.classId},${bf.classId},${sa.nextClassId})`)[0].n, 0);
    assert.equal((await runtime.db`select count(*)::int as n from public.school_years
      where unit_id in (${sa.unitId},${bf.unitId}) and start_year=2028`)[0].n, 0);
    const users = await createLogins(runtime, seed, ROLES);
    stage = 'exact Worker startup';
    const build = await runtime.startWorker();
    report.runtime = { kind: build.kind, release: build.release, health: build.health, migrations: build.migrations, namespace: build.namespace,
      noTargetReads: build.noTargetReads };
    const baseURL = runtime.baseURL;

    desktop = await chromium.launch({ headless: true });
    for (const role of ROLES) {
      stage = 'OIDC ' + role;
      console.log(JSON.stringify({ stage }));
      sessions[role] = await login(runtime, desktop, users[role], role, directory);
    }
    report.logins = ROLES.map(role => sessions[role].proof);
    assert.equal(report.logins.filter(proof => proof.mfa).length, 3);
    pass('Lokala OIDC-callbackar, skilda verkliga skoluppdrag och verifierad MFA i skyddad Worker.');

    const api = async (role, path, input, headers = {}) => {
      const session = sessions[role];
      const endpoint = path.startsWith('/') ? path : '/api/studieplaner/' + path;
      const response = await session.page.request.post(baseURL + endpoint, { data: input, timeout: 45000,
        headers: { Origin: baseURL, 'X-Context-Epoch': String(session.epoch), ...headers } });
      return { status: response.status(), body: await response.json(), cache: response.headers()['cache-control'] };
    };
    const read = async (role, pupil, options = {}) => {
      const input = parseStudyPlanReadRequest({ ...scope(pupil), view: 'current', on: today, ...options });
      const response = await api(role, 'lasa', input);
      assert.equal(response.status, 200, 'authorized plan read');
      assert.equal(response.cache, 'no-store');
      return parseStudyPlanReadReply(response.body, input);
    };
    const command = (pupil, read, action, payload) => parseStudyPlanCommand({ ...scope(pupil), commandId: randomUUID(), expectedRevision: read.latestRevision,
      expectedSourceToken: read.sourceToken, action, payload });
    const execute = async (role, input) => {
      const response = await api(role, 'kommando', input);
      assert.equal(response.status, 200, `authorized plan command ${input.action}`);
      return parseStudyPlanCommandReply(response.body, input);
    };
    const saved = result => { assert.equal(result.status, 'saved', 'typed command outcome'); return result.receipt.snapshot; };
    const requestCommand = async (role, pupil, action, payload) => command(pupil, await read(role, pupil), action, payload);
    const change = async (role, pupil, action, payload) => saved(await execute(role, await requestCommand(role, pupil, action, payload)));
    const approve = (role, pupil) => change(role, pupil, 'make_current', { effectiveOn: firstEffective });
    const screenshot = async (panel, filename) => {
      await panel.screenshot({ path: join(directory, filename) });
      report.screenshots.push(filename);
    };

    stage = 'read permissions and empty scoped plan';
    const initial = await read('admin', sa);
    assert.equal(initial.current, null);
    assert.equal(initial.draft, null);
    assert.equal(initial.canMakeCurrent, false);
    assert.equal((await read('principalB', bf)).current, null);
    const initialRead = { ...scope(sa), view: 'current', on: today };
    const guarded = [
      ['principalB', 'lasa', initialRead, 'forbidden'],
      ['principalA', 'lasa', { ...scope(bf), view: 'current', on: today }, 'forbidden'],
      ['principalA', 'lasa', { ...scope(protectedPupil), view: 'current', on: today }, 'forbidden'],
      ['principalAB', 'lasa', initialRead, 'mfa_required'],
      ['principalB', 'lasa', { ...scope(sa), view: 'history', on: today }, 'forbidden'],
      ['principalB', 'status', { ...scope(sa), commandId: randomUUID() }, 'forbidden'],
    ];
    for (const [role, endpoint, payload, code] of guarded) {
      const result = await api(role, endpoint, payload);
      assert.equal(result.status, 403, 'scope or proof denied');
      assert.equal(result.body.code, code);
      assert.ok(!('current' in result.body || 'receipt' in result.body || 'version' in result.body));
    }
    const anonymous = await fetch(baseURL + '/api/studieplaner/lasa', { method: 'POST',
      headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(initialRead) });
    assert.equal(anonymous.status, 401);
    pass('Aktuell plan, historik och kvitto är skyddade över skolgräns. Svag inloggning och oinloggad besökare nekas.');

    stage = 'desktop create through actual pupil card';
    const administrator = sessions.admin.page;
    const adminPanel = await openPupilPlan(administrator, baseURL, sa);
    const first = saved(await clickCommand(administrator, adminPanel.getByRole('button', { name: 'Skapa utkast', exact: true }), 'prepare_draft'));
    assert.equal(first.state, 'draft');
    const sourceChoices = selecting(initial.availableLevels, 'SA25');
    const firstDiplomaWork = first.content.levels.find(level => level.kind === 'diploma_work');
    assert.ok(firstDiplomaWork);
    const dates = [dateEdit(rowFor(first), termStart, termEnd), dateEdit(firstDiplomaWork, null, termEnd)];
    const termDraft = await change('admin', sa, 'prepare_draft', { ...sourceChoices, dates, apprenticeship: false, compulsorySchoolSubjects: [],
      distanceTeaching: { kind: 'applies', minutes: null } });
    assert.deepEqual(studyPlanContentIssues(termDraft.content), [{ code: 'distance_teaching_incomplete', field: 'distanceTeaching' }]);
    const make = await requestCommand('principalA', sa, 'make_current', { effectiveOn: firstEffective });
    const forbidden = await api('admin', 'kommando', make);
    assert.equal(forbidden.status, 403);
    const csrf = await api('principalA', 'kommando', make, { Origin: 'https://foreign.example.test' });
    assert.equal(csrf.status, 403);
    assert.equal(csrf.body.code, 'csrf');
    const rejected = await execute('principalA', make);
    assert.equal(rejected.status, 'incomplete');
    assert.ok(rejected.issues.some(issue => issue.field === 'distanceTeaching'));
    assert.equal((await read('principalA', sa)).current, null);
    pass('Administratören skapar utkast från elevkortets ordinarie väg. Rektor får besked om saknad omfattning före Gör gällande.');

    stage = 'complete terms and read after reload';
    const completed = await change('admin', sa, 'prepare_draft', { dates: [], distanceTeaching: { kind: 'applies', minutes: 120 } });
    assert.deepEqual(studyPlanContentIssues(completed.content), []);
    const termVersion = await approve('principalA', sa);
    assert.equal(termVersion.planId, first.planId);
    assert.deepEqual(rowFor(termVersion).attempts[0].plannedEnd, termEnd);
    assert.equal(rowFor(termVersion).attempts[0].actual.start, null);
    assert.equal(termVersion.content.dialogue, null);
    const principalPage = sessions.principalA.page;
    const termPanel = await openPupilPlan(principalPage, baseURL, sa);
    const selectedLevel = rowFor(termVersion);
    await expect(planLevel(termPanel, selectedLevel.label)).toContainText('HT 2028');
    await expect(planLevel(termPanel, selectedLevel.label)).toContainText('VT 2029');
    await expect(termPanel.getByText('Gällande', { exact: true })).toBeVisible();
    await expect(termPanel.getByRole('button', { name: 'Granska med eleven', exact: true })).toHaveCount(0);
    const reloadedTerms = await openPupilPlan(principalPage, baseURL, sa, { reload: true });
    await expect(planLevel(reloadedTerms, selectedLevel.label)).toContainText('VT 2029');
    await viewportFits(principalPage);
    await screenshot(reloadedTerms, 'terminer-dator.png');
    pass('SA26 kan göras gällande med HT 2028–VT 2029 utan timplanskoppling, framtida kalender eller betygsdatum.');

    stage = 'precise dates through actual editor';
    await runtime.db`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on)
      values(${seed.organizerId},${sa.unitId},2028,${exactStart},'2028-12-21','2029-01-10',${exactEnd},'faststalld','2026-11-20')`;
    const planBeforeDates = await openPupilPlan(principalPage, baseURL, sa, { reload: true });
    const currentDiplomaWork = rowFor(termVersion, firstDiplomaWork.itemCode);
    const englishRow = planLevel(planBeforeDates, selectedLevel.label);
    const diplomaRow = planLevel(planBeforeDates, currentDiplomaWork.label);
    await englishRow.getByRole('button', { name: 'Ändra planerad period för ' + selectedLevel.label, exact: true }).click();
    await englishRow.getByRole('button', { name: 'Använd ' + exactStart + ' som startdatum', exact: true }).click();
    await englishRow.getByRole('button', { name: 'Använd ' + exactEnd + ' som slutdatum', exact: true }).click();
    await diplomaRow.getByRole('button', { name: 'Ändra planerad period för ' + currentDiplomaWork.label, exact: true }).click();
    await diplomaRow.getByRole('button', { name: 'Använd ' + exactEnd + ' som slutdatum', exact: true }).click();
    const precise = saved(await clickCommand(principalPage, planBeforeDates.getByRole('button', { name: 'Spara ändringar', exact: true }), 'update_planned_dates'));
    assert.equal(precise.planId, first.planId);
    assert.equal(precise.state, 'current');
    assert.equal(precise.revision, termVersion.revision + 1, 'both dates were saved in one revision');
    assert.equal(rowFor(precise).attempts[0].id, rowFor(first).attempts[0].id);
    assert.deepEqual(rowFor(precise).attempts[0].plannedEnd, { kind: 'day', date: exactEnd });
    assert.deepEqual(rowFor(precise, firstDiplomaWork.itemCode).attempts[0].plannedEnd, { kind: 'day', date: exactEnd });
    const forbiddenDates = await api('admin', 'kommando', await requestCommand('admin', sa, 'update_planned_dates',
      { dates: [dateEdit(rowFor(precise), termStart, termEnd)] }));
    assert.equal(forbiddenDates.status, 403);
    const desktopPanel = await openPupilPlan(principalPage, baseURL, sa, { reload: true });
    await expect(planLevel(desktopPanel, selectedLevel.label)).toContainText(exactStart);
    await expect(planLevel(desktopPanel, selectedLevel.label)).toContainText(exactEnd);
    await expect(planLevel(desktopPanel, currentDiplomaWork.label)).toContainText(exactEnd);
    await viewportFits(principalPage);
    await screenshot(desktopPanel, 'gallande-dator.png');

    await desktopPanel.getByRole('button', { name: 'Visa historik', exact: true }).click();
    await desktopPanel.getByRole('button', { name: `Läs version ${termVersion.revision}`, exact: true }).click();
    await expect(planLevel(desktopPanel, selectedLevel.label)).toContainText('VT 2029');
    const old = (await read('principalA', sa, { view: 'history', revision: termVersion.revision })).version;
    assert.equal(old.planId, precise.planId);
    assert.deepEqual(rowFor(old).attempts[0].plannedEnd, termEnd);
    pass('Rektor sparar två rader från tabellen i samma gällande revision. Administratörens direkta gällandeändring nekas. Historiken går att läsa efter omladdning.');

    stage = 'populated plan forbidden across school boundary';
    const priorSchoolBoundary = await hashes(runtime.db);
    const wrongSchoolCommand = await requestCommand('principalA', sa, 'prepare_draft', { dates: [] });
    for (const [route, body] of [
      ['lasa', { ...scope(sa), view: 'current', on: today }],
      ['lasa', { ...scope(sa), view: 'history', on: today, revision: termVersion.revision }],
      ['kommando', wrongSchoolCommand],
    ]) {
      const denied = await api('principalB', route, body);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, 'forbidden');
      assert.ok(!('current' in denied.body || 'version' in denied.body || 'receipt' in denied.body));
    }
    assert.deepEqual(await hashes(runtime.db), priorSchoolBoundary);
    pass('Rektor i annan skola kan varken läsa eller ändra en upprättad plan eller läsa dess versionshistorik.');

    stage = 'phone protected session and reload';
    phoneBrowser = await webkit.launch({ headless: true });
    phoneContext = await phoneBrowser.newContext({ ...devices['iPhone 13'], storageState: await sessions.principalA.context.storageState(), locale: 'sv-SE' });
    const phone = await phoneContext.newPage();
    const mobileSession = await phone.request.get(baseURL + '/api/session');
    assert.equal(mobileSession.status(), 200);
    assert.equal((await mobileSession.json()).mfa.proof, true);
    const mobile = await openPupilPlan(phone, baseURL, sa);
    await expect(planLevel(mobile, selectedLevel.label)).toContainText(exactEnd);
    await viewportFits(phone);
    await screenshot(mobile, 'gallande-telefon.png');
    const mobileReloaded = await openPupilPlan(phone, baseURL, sa, { reload: true });
    await expect(planLevel(mobileReloaded, selectedLevel.label)).toContainText(exactEnd);
    await mobileReloaded.getByRole('button', { name: 'Visa historik', exact: true }).click();
    await mobileReloaded.getByRole('button', { name: `Läs version ${termVersion.revision}`, exact: true }).click();
    await expect(planLevel(mobileReloaded, selectedLevel.label)).toContainText('VT 2029');
    await viewportFits(phone);
    await screenshot(mobileReloaded, 'historik-telefon.png');
    pass('Inloggad iPhone 13-profil visar precisa datum och äldre termin även efter omladdning, utan sidledsrullning.');

    stage = 'BF actual events and reduction';
    async function populate(role, pupil) {
      const before = await read(role, pupil), options = selecting(before.availableLevels, pupil.programCode);
      const draft = await change(role, pupil, 'prepare_draft', { ...options, dates: [], apprenticeship: false,
        compulsorySchoolSubjects: [], distanceTeaching: { kind: 'none', minutes: null } });
      assert.deepEqual(studyPlanContentIssues(draft.content), []);
      return draft;
    }
    const bfDraft = await populate('principalB', bf);
    const english = rowFor(bfDraft), attemptId = english.attempts[0].id;
    await change('principalB', bf, 'prepare_draft', { dates: [dateEdit(english, { kind: 'day', date: '2026-08-18' }, { kind: 'day', date: '2026-10-05' })] });
    await approve('principalB', bf);
    const actual = (kind, on) => ({ levelId: english.id, attemptId, event: { kind, on, source: { kind: 'school_record', id: randomUUID() } } });
    const started = await change('principalB', bf, 'record_actual', actual('started', '2026-08-20'));
    assert.equal(started.state, 'current');
    assert.equal((await read('principalB', bf)).draft, null);
    assert.deepEqual(studyAttemptStatus(rowFor(started).attempts[0], today, [], english.id),
      { progress: 'started', reduced: false, needsFollowUp: true });
    const ended = await change('principalB', bf, 'record_actual', actual('completed', '2026-10-20'));
    assert.equal(ended.state, 'current');
    assert.deepEqual((await read('principalB', bf)).current, ended);
    const bfPage = sessions.principalB.page;
    const completedBF = await openPupilPlan(bfPage, baseURL, bf);
    await expect(planLevel(completedBF, english.label).getByText('Avslutad', { exact: true })).toBeVisible();
    const reduction = (levelIds, scopePoints) => ({ id: randomUUID(), kind: 'reduced',
      reference: { kind: 'action_programme_decision', id: randomUUID() }, decidedOn: '2026-10-15', effectiveOn: '2026-10-22', endsOn: null,
      scopePoints, levelIds, replacementLevelIds: [] });
    await change('principalB', bf, 'record_decision', { decision: reduction([english.id], 100) });
    const decisions = await change('principalB', bf, 'record_decision', { decision: reduction([], 50) });
    assert.equal(studyAttemptStatus(rowFor(decisions).attempts[0], '2026-10-21', decisions.content.decisions, english.id).reduced, false);
    assert.deepEqual(studyAttemptStatus(rowFor(decisions).attempts[0], today, decisions.content.decisions, english.id),
      { progress: 'completed', reduced: true, needsFollowUp: false });
    const bfActive = await approve('principalB', bf);
    const bfPanel = await openPupilPlan(bfPage, baseURL, bf, { reload: true });
    await expect(bfPanel.getByText('Reducerad', { exact: true })).toBeVisible();
    await expect(bfPanel.getByText('Omfattning 50 poäng', { exact: true })).toBeVisible();
    await screenshot(bfPanel, 'reducering-dator.png');
    assert.equal(rowFor(bfActive).attempts[0].actual.start.on, '2026-08-20');
    assert.equal(rowFor(bfActive).attempts[0].actual.end.on, '2026-10-20');
    pass('BF26 visar faktiskt start- och slutdatum direkt på den gällande planen. Reducering visas från beslutets giltighet med nivå eller bara omfattning.');

    stage = 'protected CAS, status, and audit rollback';
    const beforeCas = await read('principalA', sa);
    const cas = command(sa, beforeCas, 'prepare_draft', { dates: [] });
    const competing = command(sa, beforeCas, 'prepare_draft', { dates: [] });
    const contenders = [
      ['principalA', cas], ['admin', competing],
    ];
    const responses = await Promise.all(contenders.map(([role, input]) => execute(role, input)));
    assert.equal(responses.filter(result => result.status === 'saved').length, 1);
    assert.equal(responses.find(result => result.status === 'conflict')?.reason, 'revision');
    const winnerIndex = responses.findIndex(result => result.status === 'saved');
    const [winner, applied] = contenders[winnerIndex];
    const statusInput = { ...scope(sa), commandId: applied.commandId };
    const receipt = await api(winner, 'status', statusInput);
    assert.equal(receipt.status, 200);
    assert.deepEqual(parseStudyPlanStatusReply(receipt.body, statusInput).receipt, responses[winnerIndex].receipt);
    assert.deepEqual(await execute(winner, applied), responses[winnerIndex]);
    const collision = await execute(winner, { ...applied, payload: { dates: [], distanceTeaching: { kind: 'none', minutes: null } } });
    assert.equal(collision.status, 'conflict');
    assert.equal(collision.reason, 'command');
    const forbiddenReceipt = await api('principalB', 'status', statusInput);
    assert.equal(forbiddenReceipt.status, 403);
    assert.ok(!('receipt' in forbiddenReceipt.body));
    const staleSource = await requestCommand('principalA', sa, 'prepare_draft', { dates: [] });
    await runtime.db`update public.pupil_placements set ends_on='2099-06-30' where id=${sa.placementId}`;
    try {
      const stale = await execute('principalA', staleSource);
      assert.equal(stale.status, 'conflict');
      assert.equal(stale.reason, 'source');
    } finally {
      await runtime.db`update public.pupil_placements set ends_on=null where id=${sa.placementId}`;
    }
    const beforeAudit = await hashes(runtime.db);
    const auditInput = await requestCommand('principalA', sa, 'prepare_draft', { dates: [] });
    await runtime.db.unsafe(`create function public.synthetic_study_plan_worker_audit_fault() returns trigger language plpgsql as $$
      begin
        if new.source='worker' and new.action='individual_study_plan_command' and new.outcome='ok' then
          raise exception 'owned test audit failure' using errcode='55000';
        end if;
        return new;
      end $$;
      create trigger synthetic_study_plan_worker_audit_fault before insert on public.security_events
      for each row execute function public.synthetic_study_plan_worker_audit_fault();`);
    try {
      const audit = await api('principalA', 'kommando', auditInput);
      assert.equal(audit.status, 500);
      assert.equal(audit.body.code, 'audit_unavailable');
      assert.ok(!('receipt' in audit.body));
    } finally {
      await runtime.db.unsafe('drop trigger synthetic_study_plan_worker_audit_fault on public.security_events; drop function public.synthetic_study_plan_worker_audit_fault();');
    }
    assert.deepEqual(await hashes(runtime.db), beforeAudit);
    const uncommittedStatus = { ...scope(sa), commandId: auditInput.commandId };
    const missing = await api('principalA', 'status', uncommittedStatus);
    assert.equal(missing.status, 200);
    assert.equal(parseStudyPlanStatusReply(missing.body, uncommittedStatus).receipt, null);
    assert.deepEqual((await read('principalA', sa)).current, precise);
    pass('Två levande uppdrag konkurrerar utan överskrivning. Exakt kvitto återhämtas och framtvingat Worker-auditfel återställer skrivningen atomiskt.');

    stage = 'prepare own group and schema comparison sources';
    await populate('principalA', moved);
    const movedPlan = await approve('principalA', moved);
    const groups = await runtime.db.begin(async tx => {
      await ownedActor(tx, seed, sessions.principalA, 'principalA');
      const primary = await seedStudyPlanImpactGroups(tx, sa);
      const separate = await seedStudyPlanImpactGroups(tx, moved);
      return { primary, separate };
    });
    const movedRead = await read('principalA', moved);
    const suggestedEnglish = movedRead.dateSuggestions?.find(suggestion => suggestion.levelId === rowFor(movedPlan).id);
    assert.deepEqual(suggestedEnglish, dateEdit(rowFor(movedPlan), { kind: 'day', date: '2027-01-18' }, { kind: 'day', date: '2027-06-14' }));
    assert.equal(rowFor(movedRead.current).attempts[0].actual.start, null);
    assert.equal(rowFor(movedRead.current).attempts[0].plannedStart, null);
    assert.ok(!(await read('principalA', sa)).dateSuggestions?.some(suggestion => suggestion.levelId === rowFor(precise).id));
    pass('Entydigt undervisningsgruppsmedlemskap ger ett förslag på planerade datum utan skrivning. Tidigare datum får inget nytt förslag.');
    const scheduleScope = { contractVersion: 1, unitId: sa.unitId, schoolYear: year, period: 'ht' };
    const scheduleReq = parseSchemaDraftSave({ ...scheduleScope, commandId: randomUUID(), draftId: null, expectedRevision: 0,
      name: 'Syntetiskt schemautkast för studieplansprov', basisVillkor: null, workingVillkor: defaultSchemaVillkor(),
      grundFingerprint: null, placements: [], locks: [] });
    const scheduleResponse = await api('principalA', '/api/schema/utkast/spara', scheduleReq);
    assert.equal(scheduleResponse.status, 200, 'protected draft fixture via ordinary HTTP route');
    const { draft: originalSchedule } = await verifySchemaDraftSaveReply(scheduleResponse.body, scheduleReq);
    assert.equal(originalSchedule.revision, 1);
    const readSchedule = async () => {
      const response = await api('principalA', '/api/schema/utkast/las', scheduleScope);
      assert.equal(response.status, 200, 'protected schema draft read');
      return (await verifySchemaDraftReadReply(response.body, scheduleScope)).draft;
    };
    assert.equal((await readSchedule()).stale, false);

    stage = 'read-only actual compare API and browser';
    const unchangedBefore = await hashes(runtime.db);
    const compare = async (pupil, target, on = movedOn) => {
      const result = await read('principalA', pupil, { on, view: 'impact', target });
      assert.equal(result.status, 'compared');
      return result.impact;
    };
    const { primary, separate } = groups;
    const target = { kind: 'group_move', membershipId: primary.memberships.english, toGroupId: primary.englishSame.id };
    const same = await compare(sa, target);
    assert.equal(same.result, 'same_level');
    assert.equal(same.plan.planId, precise.planId);
    assert.equal(same.sourceRemainder.endsOn, '2027-02-14');
    assert.equal(same.levels[0].after.startsOn, movedOn);
    const language = await compare(sa, { kind: 'group_move', membershipId: primary.memberships.spanish, toGroupId: primary.german.id });
    assert.equal(language.result, 'follow_up');
    assert.ok(language.issues.some(issue => issue.code === 'different_parallel_set'));
    assert.deepEqual(language.levels.map(level => level.ref.languageCode).sort(), ['de', 'es']);
    const sameClass = await compare(sa, { kind: 'class_move', classId: sa.nextClassId });
    assert.equal(sameClass.result, 'same_level');
    comparisonPage = await sessions.principalA.context.newPage();
    const comparePanel = await openPupilPlan(comparisonPage, baseURL, sa);
    await comparePanel.getByRole('button', { name: 'Jämför förändring', exact: true }).press('Enter');
    await comparePanel.getByLabel('Jämförelsedatum', { exact: true }).fill(movedOn);
    await comparePanel.getByRole('button', { name: 'Hämta alternativ', exact: true }).click();
    await comparePanel.getByLabel('Typ av förändring', { exact: true }).selectOption('group_move');
    await comparePanel.getByLabel('Medlemskap', { exact: true }).selectOption(primary.memberships.english);
    await comparePanel.getByLabel('Målgrupp', { exact: true }).selectOption(primary.englishSame.id);
    await comparePanel.getByRole('button', { name: 'Visa jämförelse', exact: true }).click();
    await expect(comparePanel.getByText('Efter föreslagen ändring', { exact: true })).toBeVisible();
    await viewportFits(comparisonPage);
    await screenshot(comparePanel, 'jamforelse-dator.png');
    assert.deepEqual(await hashes(runtime.db), unchangedBefore);
    pass('Förhandsgranskning på elevkortet läser daterade klass-, grupp- och språkföljder. Studieplaner och övriga verksamhetsrader är oförändrade.');

    stage = 'ordinary group and class writes on separate pupil';
    const movedComparison = await compare(moved, { kind: 'group_move', membershipId: separate.memberships.english,
      toGroupId: separate.englishTo.id });
    const normalGroupInput = { contractVersion: STUDY_GROUP_CONTRACT_VERSION, commandId: randomUUID(), action: 'move_member',
      unitId: moved.unitId, schoolYear: year, payload: { membershipId: separate.memberships.english, toGroupId: separate.englishTo.id, on: movedOn } };
    const planBeforeChanges = await hashes(runtime.db, planTables);
    const groupChange = await api('principalA', '/api/undervisningsgrupper/kommando', normalGroupInput);
    assert.equal(groupChange.status, 200);
    const groupReply = parseStudyGroupReply(groupChange.body, normalGroupInput);
    const newMembership = groupReply.read.memberships.find(item => item.id === groupReply.receipt.membershipIds[0]);
    const oldMembership = groupReply.read.memberships.find(item => item.id === separate.memberships.english);
    assert.deepEqual([newMembership.startsOn, newMembership.endsOn],
      [movedComparison.levels[0].after.startsOn, movedComparison.levels[0].after.endsOn]);
    assert.equal(oldMembership.endsOn, movedComparison.sourceRemainder.endsOn);
    const afterGroup = await readSchedule();
    assert.equal(afterGroup.stale, true);
    assert.deepEqual([afterGroup.id, afterGroup.revision, afterGroup.contentHash, afterGroup.sourceHash],
      [originalSchedule.id, originalSchedule.revision, originalSchedule.contentHash, originalSchedule.sourceHash]);
    const refreshScheduleReq = parseSchemaDraftSave({ ...scheduleReq, commandId: randomUUID(),
      draftId: originalSchedule.id, expectedRevision: afterGroup.revision });
    const refreshSchedule = await api('principalA', '/api/schema/utkast/spara', refreshScheduleReq);
    assert.equal(refreshSchedule.status, 200, 'refresh draft from current group sources to isolate class move');
    const { draft: updatedSchedule } = await verifySchemaDraftSaveReply(refreshSchedule.body, refreshScheduleReq);
    assert.equal((await readSchedule()).stale, false);
    const classChange = await api('admin', '/api/elever/andra', { pupilId: moved.pupilId, schoolYear: year, caseId: null, expectedVersion: 1, kind: 'class',
      payload: { placementId: moved.placementId, classId: moved.nextClassId, startsOn: '2027-02-16', endsOn: null } });
    assert.equal(classChange.status, 200);
    assert.equal(classChange.body.version, 2);
    const afterClass = (await read('principalA', moved, { on: '2027-02-16' })).current;
    assert.deepEqual(afterClass, movedPlan);
    assert.deepEqual(await hashes(runtime.db, planTables), planBeforeChanges);
    const storedSchedule = await readSchedule();
    assert.equal(storedSchedule.stale, true);
    assert.deepEqual([storedSchedule.id, storedSchedule.revision, storedSchedule.contentHash, storedSchedule.sourceHash],
      [updatedSchedule.id, updatedSchedule.revision, updatedSchedule.contentHash, updatedSchedule.sourceHash]);
    report.schedule = { unchangedRevision: true, staleAfterGroup: afterGroup.stale, staleAfterClass: storedSchedule.stale,
      sourcePlan: storedSchedule.source.planId ? 'linked' : 'empty' };
    pass('Ordinarie grupp- och klassbyte bevarar separat elevs studieplan. Båda upptäcks var för sig som nytt schemaunderlag.');

    stage = 'live revocation and audit counts';
    await runtime.db`update public.access_assignments set ended_at=clock_timestamp() where id=${seed.actors.admin.assignmentId}`;
    const revoked = await api('admin', 'lasa', initialRead);
    assert.ok([401, 403].includes(revoked.status));
    assert.ok(!('current' in revoked.body));
    const audit = await runtime.db`select source,action,outcome,count(*)::int n from public.security_events
      where customer_id=${seed.customerId} and action like 'individual_study_plan_%'
      group by source,action,outcome order by source,action,outcome`;
    assert.ok(audit.some(item => item.source === 'db' && item.action === 'individual_study_plan_saved' && item.outcome === 'ok'));
    assert.ok(audit.some(item => item.source === 'worker' && item.action === 'individual_study_plan_command' && item.outcome === 'ok'));
    assert.ok(audit.some(item => item.source === 'worker' && item.outcome === 'denied'));
    report.audit = audit;
    pass('Återkallat skoluppdrag ger inga studieuppgifter. Lyckade skrivningar och nekanden kan följas i isolerad auditlogg.');

    report.status = 'PASS';
  } catch (error) {
    report.failure = { stage, code: error.code ?? error.name,
      line: error.stack?.split('\n').find(row => row.includes('/verify-study-plan-actual.mjs:'))?.trim() ?? null };
    // A private locator trace helps recover failed runs. The JSON result has no pupil values or auth state.
    if (error.name === 'TimeoutError' || error.matcherResult) {
      const main = comparisonPage ? await comparisonPage.getByRole('main').ariaSnapshot({ timeout: 1500 }).catch(() => '') : '';
      writeFileSync(join(directory, 'ui-failure-private.txt'), String(error.message).slice(0, 6000) + '\n' + main.slice(0, 6000), { mode: 0o600 });
    }
  } finally {
    await phoneContext?.close().catch(() => {});
    await phoneBrowser?.close().catch(() => {});
    for (const session of Object.values(sessions)) await session.context.close().catch(() => {});
    await desktop?.close().catch(() => {});
    if (runtime) {
      try { report.cleanup = await runtime.cleanup(); }
      catch { report.status = 'FAIL'; report.cleanup = { cleanup: 'failed' }; }
    }
    for (const role of ROLES) rmSync(join(directory, 'auth-' + role + '.json'), { force: true });
    report.completedAt = new Date().toISOString();
    saveReport();
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failure: report.failure,
    cleanup: report.cleanup?.cleanup, report: out }));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('Kör verify-schema-draft-namespace.mjs med förberedd release och --study-plan.');
  process.exitCode = 2;
}
