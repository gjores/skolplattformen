#!/usr/bin/env node
// Syntetiska Gy25-placeringar i en egen tillfällig PostgreSQL. Ingen extern databas tas emot.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createEphemeralMigratedDb, migrationFiles } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply, parseStudyPlanReadRequest,
  parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION,
} from '../../web/lib/study-plan-contract.ts';
import { parseStudyPlanContent, studyAttemptStatus } from '../../web/lib/study-plan-model.ts';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';

const catalog = JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json', import.meta.url)));
const currentDay = '2026-11-20';
const startsOn = '2026-08-17';
const firstEffective = '2026-09-01';
const scopeOf = pupil => ({ contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId: pupil.unitId, pupilId: pupil.pupilId, placementId: pupil.placementId });
const day = date => ({ kind: 'day', date });
const term = (schoolYear, term) => ({ kind: 'term', schoolYear, term });
const ownTableNames = ['individual_study_plans', 'individual_study_plan_revisions', 'individual_study_plan_receipts'];
const businessTableNames = [
  'pupils', 'pupil_placements', 'school_classes', 'pupil_class_memberships', 'offerings', 'offering_units',
  'point_plans',
  'valplans', 'valplan_choices', 'study_groups', 'study_group_memberships',
  'timplans', 'class_timplans', 'tjanst_distributions', 'tjanst_versions', 'tjanst_rows',
  'schema_drafts', 'schema_draft_revisions',
];

/** Ordinary register rows for national programmes without a timetable. The caller owns an isolated test DB. */
export async function seedIndividualStudyPlanPupils(tx, { customerId, organizerId, schoolAId, schoolBId }) {
  assert.ok([customerId, organizerId, schoolAId, schoolBId].every(Boolean));
  assert.notEqual(schoolAId, schoolBId);
  await tx`insert into public.school_unit_types(unit_id,school_type) values (${schoolAId},'GY'),(${schoolBId},'GY') on conflict do nothing`;
  const sa = { unitId: schoolAId, offeringId: randomUUID(), classId: randomUUID(), nextClassId: randomUUID(), programCode: 'SA25', orientationCode: 'SABEP' };
  const bf = { unitId: schoolBId, offeringId: randomUUID(), classId: randomUUID(), nextClassId: randomUUID(), programCode: 'BF25', orientationCode: 'BFPES' };
  for (const [row, label] of [[sa, 'SA26'], [bf, 'BF26']]) {
    await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
      values (${row.offeringId},${organizerId},${row.unitId},'gymnasium',${`Syntetiskt ${row.programCode}`},${label},${row.programCode},${row.orientationCode},2026)`;
    const program = catalog.programs.find(program => program.code === row.programCode);
    const reference = { catalogId: catalog.catalogId, programRef: { code: program.code, version: program.version },
      orientationCode: row.orientationCode, startedOn: startsOn, specializationRefs: [],
      choiceBlocks: defaultProgramplanChoiceBlocks(program, row.orientationCode) };
    // The class register needs its cohort start from a programplan. The class has no timetable link.
    await tx`insert into public.point_plans(organizer_id,offering_id,version,catalog_id,basis_reference)
      values (${organizerId},${row.offeringId},1,${catalog.catalogId},${tx.json(reference)})`;
    await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
      values (${row.classId},${customerId},${organizerId},${row.unitId},${row.offeringId},${label},2026),
      (${row.nextClassId},${customerId},${organizerId},${row.unitId},${row.offeringId},${label + 'B'},2026)`;
  }
  const numbers = (await tx`select number from (
      select 'TEST-20100101-'||lpad(n::text,4,'0') number from generate_series(100,800) n
    ) synthetic where public.phase4_synthetic_birth_date(number) is not null
    and not exists(select 1 from public.synthetic_pupil_numbers x where x.personal_number=synthetic.number)
    order by number limit 3`).map(row => row.number);
  assert.equal(numbers.length, 3, 'synthetic number count');
  const pupils = {};
  for (const [index, [key, school, protectedIdentity]] of [['sa', sa, false], ['bf', bf, false], ['protected', sa, true]].entries()) {
    const pupil = { ...school, pupilId: randomUUID(), placementId: randomUUID(), membershipId: randomUUID() };
    const displayName = `Syntetisk studieplan ${index + 1}`;
    await tx`insert into public.synthetic_pupil_numbers(personal_number) values (${numbers[index]})`;
    await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name,protected_identity)
      values (${pupil.pupilId},${customerId},${organizerId},${displayName},${numbers[index]},${'Syntetiskt alias ' + (index + 1)},${protectedIdentity})`;
    await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
      values (${pupil.placementId},${customerId},${organizerId},${pupil.pupilId},${pupil.unitId},${pupil.offeringId},${startsOn})`;
    await tx`insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
      values (${pupil.membershipId},${customerId},${organizerId},${pupil.pupilId},${pupil.unitId},${pupil.classId},${pupil.placementId},${startsOn})`;
    pupils[key] = { ...pupil, displayName };
  }
  return pupils;
}

function firstDraft(basis, programCode, settings = {}) {
  const subject = catalog.subjects.find(row => row.code === 'ENGE' && row.schoolTypes.includes('GY') && row.version === 1);
  const level = subject.items.find(row => row.code === 'ENGE1000X');
  const attempt = () => ({ id: randomUUID(), plannedStart: null, plannedEnd: null, actual: { certainty: 'recorded', start: null, end: null } });
  return parseStudyPlanContent({
    source: basis.source, path: { ...basis.path, apprenticeship: false },
    levels: [
      { id: randomUUID(), kind: 'gy25_level', subjectCode: subject.code, subjectVersion: subject.version, itemCode: level.code,
        label: 'Engelska, nivå 1', languageCode: null, points: level.points, attempts: [attempt()] },
      { id: randomUUID(), kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: `GYAR${programCode.slice(0, 2)}25`,
        label: 'Gymnasiearbete', languageCode: null, points: 100, attempts: [attempt()] },
    ],
    choices: [], decisions: [], dialogue: null, sourceIssues: [], compulsorySchoolSubjects: [],
    distanceTeaching: { kind: 'none', minutes: null }, ...settings,
  });
}

function unwrap(result, f, actor) {
  assert.equal(result.contractVersion, 'individual_study_plan_sql_v1', 'RPC version');
  assert.equal(result.actor.identityId, f.identity(actor), 'RPC actor identity');
  assert.equal(result.actor.assignmentId, f.roles[actor], 'RPC actor assignment');
  return result;
}

const readWith = (db, f) => async (actor, pupil, { view = 'current', on = currentDay, ...details } = {}) => db.begin(async tx => {
  const request = parseStudyPlanReadRequest({ ...scopeOf(pupil), view, on, ...details });
  await setActor(tx, f, actor);
  const value = (await tx`select public.individual_study_plan_read(${tx.json(request)}) r`)[0].r;
  const envelope = unwrap(value, f, actor);
  return { ...envelope, result: parseStudyPlanReadReply(envelope.result, request) };
});

async function setActor(tx, f, actor) {
  await f.actor(tx, actor);
  await tx`set local role skolplattform_worker`;
}

function commandFor(pupil, latest, action, payload) {
  return parseStudyPlanCommand({ ...scopeOf(pupil), action, payload,
    commandId: randomUUID(), expectedRevision: latest.latestRevision, expectedSourceToken: latest.sourceToken });
}
const sendWith = (db, f) => async (actor, command, content = null) => db.begin(async tx => {
  await setActor(tx, f, actor);
  const value = (await tx`select public.individual_study_plan_command(${tx.json({ command, content })}) r`)[0].r;
  return parseStudyPlanCommandReply(unwrap(value, f, actor).result, command);
});
const statusWith = (db, f) => async (actor, pupil, commandId) => db.begin(async tx => {
  await setActor(tx, f, actor);
  const request = { ...scopeOf(pupil), commandId };
  const value = (await tx`select public.individual_study_plan_status(${tx.json(request)}) r`)[0].r;
  return parseStudyPlanStatusReply(unwrap(value, f, actor).result, request);
});

function saved(result) {
  assert.equal(result.status, 'saved', 'command saved');
  return result.receipt.snapshot;
}
function conflict(result, reason) {
  assert.equal(result.status, 'conflict', 'command reports conflict');
  assert.equal(result.reason, reason, 'conflict cause');
}
async function denied(run, code = '42501') {
  await assert.rejects(run, error => error?.code === code, `expected SQLSTATE ${code}`);
}

async function tableHashes(db, names) {
  const result = {};
  for (const name of names) {
    assert.match(name, /^[a-z_][a-z_0-9]*$/u);
    const [{ fingerprint, n }] = await db.unsafe(`select md5(coalesce(string_agg(md5(to_jsonb(x)::text), '' order by md5(to_jsonb(x)::text)), '')) fingerprint, count(*)::int n from public.${name} x`);
    result[name] = { fingerprint, n };
  }
  return result;
}

function fileSource(name) {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
}

export async function verifyIndividualStudyPlanSql(out) {
  const report = { kind: 'ephemeral-individual-study-plan-sql', status: 'FAIL', checks: [], startedAt: new Date().toISOString() };
  const check = name => { report.checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); };
  let environment;
  let stage = 'bootstrap';
  try {
    const migrations = migrationFiles().filter(name => name.includes('_individual_study_plan'));
    assert.ok(migrations.includes('20261120110000_individual_study_plans.sql'), 'expected SP-02 migration present');
    environment = await createEphemeralMigratedDb({ exclude: migrations });
    report.database = environment.provenance;
    report.migrations = migrations.map(name => ({ name, sha256: createHash('sha256').update(fileSource(name)).digest('hex') }));
    report.gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' }).trim();
    report.probeSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
    const db = environment.db;
    const { f, pupils } = await db.begin(async tx => {
      const f = await createTjanstFixture(tx);
      const pupils = await seedIndividualStudyPlanPupils(tx, {
        customerId: f.id(1), organizerId: f.id(2), schoolAId: f.schools.A, schoolBId: f.schools.B,
      });
      return { f, pupils };
    });
    const { sa, bf } = pupils;
    const read = readWith(db, f), send = sendWith(db, f), status = statusWith(db, f);

    stage = 'migration preservation';
    const existingTables = (await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(row => row.tablename);
    const beforeMigration = await tableHashes(db, existingTables);
    for (const name of migrations) await db.begin(tx => tx.unsafe(fileSource(name)));
    assert.deepEqual(await tableHashes(db, existingTables), beforeMigration, 'existing table fingerprints');
    check('Migrationen bevarar innehållet i varje befintlig tabell.');
    for (const table of ownTableNames) {
      const qualified = `public.${table}`;
      const [rls] = await db`select relrowsecurity as enabled,relforcerowsecurity as forced from pg_class where oid=${qualified}::regclass`;
      assert.ok(rls.enabled && rls.forced, 'forced RLS');
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
        const [grant] = await db`select has_table_privilege(${role},${qualified},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed`;
        assert.equal(grant.allowed, false, 'no direct table grants');
      }
    }
    for (const suffix of ['read', 'command', 'status']) {
      const fn = `public.individual_study_plan_${suffix}(jsonb)`;
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
        const [grant] = await db`select has_function_privilege(${role},${fn},'EXECUTE') as allowed`;
        assert.equal(grant.allowed, role === 'skolplattform_worker', 'workload-only RPC grant');
      }
    }
    check('Tre avgränsade RPC:er är tillgängliga för Worker. Tabellerna har tvingat RLS och saknar direkta klient- och Worker-rättigheter.');

    stage = 'program sources and scope';
    const initial = await read('principalA', sa);
    const vocational = await read('principalB', bf);
    assert.equal(initial.result.current, null);
    assert.equal(initial.result.latestRevision, 0);
    assert.equal(initial.basis.path.programCode, 'SA25');
    assert.equal(vocational.basis.path.programCode, 'BF25');
    assert.equal(initial.basis.source.catalogId, catalog.catalogId);
    assert.equal(vocational.basis.source.catalogId, catalog.catalogId);
    assert.equal(initial.result.canMakeCurrent, true);
    assert.equal((await read('admin', sa)).result.canMakeCurrent, false);
    assert.equal((await db`select count(*)::int n from public.class_timplans where class_id in (${sa.classId},${bf.classId})`)[0].n, 0);
    assert.equal((await db`select count(*)::int n from public.school_years where unit_id in (${sa.unitId},${bf.unitId}) and start_year=2028`)[0].n, 0);
    check('SA26 och BF26 får nationella Gy25-källor i rätt katalog utan klassernas timplanskoppling eller framtida kalender.');

    // The baseline contains register, placement, class, choice, schedule and group data.
    const businessBaseline = await tableHashes(db, businessTableNames);
    await denied(() => read('principalB', sa));
    await denied(() => read('principalA', bf));
    await denied(() => read('admin', bf));
    await denied(() => read('teacherGroup', sa));
    await denied(() => read('hm', sa));
    await denied(() => read('foreignHm', sa));
    await denied(() => read('principalAB', { ...sa, unitId: bf.unitId }));
    await denied(() => read('principalA', { ...sa, pupilId: pupils.protected.pupilId }));
    await denied(() => read('principalA', pupils.protected));
    await denied(() => read('admin', pupils.protected));
    await db.begin(async tx => {
      await f.actor(tx, 'hm');
      await tx`select public.phase4_grant_protected_permission(${f.roles.admin},${sa.unitId})`;
    });
    assert.equal((await read('admin', pupils.protected)).result.latestRevision, 0);
    await denied(() => read('principalA', pupils.protected));
    check('Skol-, elev- och placeringsgränsen tillämpas även på skyddad elev. Bara separat behörigt administratörsuppdrag får läsa den.');

    stage = 'preparation and initial publication';
    const blank = firstDraft(initial.basis, 'SA25', { distanceTeaching: { kind: 'applies', minutes: null } });
    const requiredFields = { dates: [], apprenticeship: false, compulsorySchoolSubjects: [], distanceTeaching: blank.distanceTeaching };
    const first = commandFor(sa, initial.result, 'prepare_draft', requiredFields);
    await denied(() => send('principalB', first, blank));
    const created = await send('admin', first, blank);
    const firstDraftVersion = saved(created);
    assert.equal(firstDraftVersion.revision, 1);
    assert.equal(firstDraftVersion.state, 'draft');
    assert.deepEqual(await send('admin', first, blank), created);
    assert.deepEqual((await status('admin', sa, first.commandId)).receipt, created.receipt);
    assert.equal((await status('admin', sa, randomUUID())).receipt, null);
    await denied(() => status('principalB', sa, first.commandId));
    const foreignReceipt = await status('principalA', sa, first.commandId).catch(error => {
      if (error.code === '42501' || error.code === '40001') return { receipt: null };
      throw error;
    });
    assert.equal(foreignReceipt.receipt, null);
    conflict(await send('admin', { ...first, payload: { ...requiredFields, apprenticeship: true } }, blank), 'command');
    check('Utkast, identiskt omförsök, skyddad kvittoläsning och återanvänt kommando-ID valideras mot exakt revision.');

    let latest = (await read('admin', sa)).result;
    const [eng] = latest.draft.content.levels;
    const termDates = { levelId: eng.id, attemptId: eng.attempts[0].id, plannedStart: term(2028, 'HT'), plannedEnd: term(2028, 'VT') };
    const termsDocument = structuredClone(latest.draft.content);
    Object.assign(termsDocument.levels[0].attempts[0], { plannedStart: termDates.plannedStart, plannedEnd: termDates.plannedEnd });
    saved(await send('admin', commandFor(sa, latest, 'prepare_draft', { dates: [termDates] }), termsDocument));
    latest = (await read('admin', sa)).result;
    saved(await send('admin', commandFor(sa, latest, 'record_dialogue', { on: firstEffective })));
    latest = (await read('principalA', sa)).result;
    const publish = commandFor(sa, latest, 'make_current', { effectiveOn: firstEffective });
    await denied(() => send('admin', publish));
    const incomplete = await send('principalA', publish);
    assert.equal(incomplete.status, 'incomplete');
    assert.ok(incomplete.issues.some(item => item.field === 'distanceTeaching'));
    assert.equal((await read('principalA', sa)).result.latestRevision, latest.latestRevision);
    const ready = { ...latest.draft.content, dialogue: null, distanceTeaching: { kind: 'applies', minutes: 120 } };
    const supplemented = saved(await send('admin', commandFor(sa, latest, 'prepare_draft', { dates: [], distanceTeaching: ready.distanceTeaching }), ready));
    const edited = (await read('principalA', sa)).result;
    assert.equal(edited.draft.content.dialogue, null);
    assert.equal(edited.latestRevision, supplemented.revision);
    const noReview = await send('principalA', commandFor(sa, edited, 'make_current', { effectiveOn: firstEffective }));
    assert.equal(noReview.status, 'incomplete');
    check('Saknad omfattning av fjärrundervisning sparas som utkast. Gör gällande kräver komplettering och ny elevdialog.');

    const saveAndPublish = async (actor, pupil, effectiveOn) => {
      const beforeDialogue = (await read(actor, pupil)).result;
      saved(await send(actor, commandFor(pupil, beforeDialogue, 'record_dialogue', { on: firstEffective })));
      const reviewed = (await read(actor, pupil)).result;
      return saved(await send(actor, commandFor(pupil, reviewed, 'make_current', { effectiveOn })));
    };
    const termVersion = await saveAndPublish('principalA', sa, firstEffective);
    assert.deepEqual(termVersion.content.levels[0].attempts[0].plannedEnd, term(2028, 'VT'));
    assert.equal(termVersion.planId, firstDraftVersion.planId);
    const bfContent = firstDraft(vocational.basis, 'BF25');
    saved(await send('principalB', commandFor(bf, vocational.result, 'prepare_draft', {
      dates: [], apprenticeship: false, distanceTeaching: bfContent.distanceTeaching, compulsorySchoolSubjects: [],
    }), bfContent));
    assert.equal((await saveAndPublish('principalB', bf, firstEffective)).content.path.programCode, 'BF25');
    check('Rektor kan göra terminsplanering gällande för både högskoleförberedande program och yrkesprogram.');

    stage = 'historical date precision and outcomes';
    latest = (await read('principalA', sa)).result;
    await db`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on)
      values(${f.id(2)},${sa.unitId},2028,'2028-08-21','2028-12-21','2029-01-10','2029-06-13','faststalld','2026-10-30')`;
    const withCalendar = (await read('principalA', sa)).result;
    assert.deepEqual(withCalendar.calendar, [
      { schoolYear: 2028, htStart: '2028-08-21', htEnd: '2028-12-21', vtStart: '2029-01-10', vtEnd: '2029-06-13' },
    ]);
    assert.equal(withCalendar.sourceToken, latest.sourceToken);
    assert.deepEqual(withCalendar.current.content.levels[0].attempts[0].plannedStart, term(2028, 'HT'));
    check('Fastställd framtida kalender ger datumstöd och bevarar den sparade terminsuppgiften.');
    const exactDates = { ...termDates, plannedStart: day('2028-08-21'), plannedEnd: day('2029-06-13') };
    const exactContent = structuredClone(latest.current.content);
    exactContent.dialogue = null;
    Object.assign(exactContent.levels[0].attempts[0], { plannedStart: exactDates.plannedStart, plannedEnd: exactDates.plannedEnd });
    saved(await send('admin', commandFor(sa, latest, 'prepare_draft', { dates: [exactDates] }), exactContent));
    const exact = await saveAndPublish('principalA', sa, '2026-12-01');
    assert.equal(exact.planId, termVersion.planId);
    assert.equal((await read('principalA', sa)).result.current.revision, termVersion.revision);
    assert.deepEqual((await read('principalA', sa, { on: '2026-12-01' })).result.current.content.levels[0].attempts[0].plannedEnd, exactDates.plannedEnd);
    const historical = (await read('principalA', sa, { on: '2027-01-01', view: 'history', revision: termVersion.revision })).result.version;
    assert.deepEqual(historical.content.levels[0].attempts[0].plannedStart, term(2028, 'HT'));
    assert.deepEqual(historical.content.levels[0].attempts[0].plannedEnd, term(2028, 'VT'));
    assert.equal(historical.planId, exact.planId);
    assert.equal(studyAttemptStatus(exact.content.levels[0].attempts[0], '2029-06-14', [], eng.id).needsFollowUp, true);
    check('Precisa datum sparas på samma plan-ID. Tidigare termin och framtida giltighet läses på rätt revision.');

    latest = (await read('principalA', sa)).result;
    const actualEvent = { kind: 'started', on: '2026-09-05', source: { kind: 'school_record', id: randomUUID() } };
    const actual = commandFor(sa, latest, 'record_actual', { levelId: eng.id, attemptId: eng.attempts[0].id, event: actualEvent });
    const actualVersion = saved(await send('admin', actual));
    assert.equal(actualVersion.content.levels[0].attempts[0].actual.start.on, actualEvent.on);
    latest = (await read('principalA', sa)).result;
    const reduction = {
      id: randomUUID(), kind: 'reduced', reference: { kind: 'action_programme_decision', id: randomUUID() },
      scopePoints: 100, decidedOn: '2026-11-10', effectiveOn: '2026-11-12', endsOn: null, levelIds: [eng.id], replacementLevelIds: [],
    };
    const decision = commandFor(sa, latest, 'record_decision', { decision: reduction });
    await denied(() => send('admin', decision));
    await denied(() => send('principalA', { ...decision, payload: { decision: { ...reduction, reference: null } } }), '22023');
    saved(await send('principalA', decision));
    latest = (await read('principalA', sa)).result;
    saved(await send('principalA', commandFor(sa, latest, 'record_decision', { decision: {
      ...reduction, id: randomUUID(), reference: { ...reduction.reference, id: randomUUID() }, levelIds: [], scopePoints: 50,
    } })));
    const reducedVersion = await saveAndPublish('principalA', sa, '2026-09-01');
    const reread = (await read('principalA', sa)).result.current;
    assert.equal(reread.revision, reducedVersion.revision, 'same-day correction wins');
    assert.equal(reread.content.decisions.length, 2);
    assert.equal(reread.content.decisions[0].decidedOn, reduction.decidedOn);
    assert.equal(reread.content.decisions[0].effectiveOn, reduction.effectiveOn);
    assert.equal(reread.content.decisions[1].scopePoints, 50);
    assert.equal(reread.content.decisions[1].levelIds.length, 0);
    assert.notEqual(reread.recordedAt.slice(0, 10), reduction.decidedOn);
    const tracked = reread.content.levels[0].attempts[0];
    assert.equal(tracked.actual.start.on, actualEvent.on);
    assert.equal(studyAttemptStatus(tracked, '2026-11-11', reread.content.decisions, eng.id).reduced, false);
    assert.deepEqual(studyAttemptStatus(tracked, '2026-11-12', reread.content.decisions, eng.id), { progress: 'started', reduced: true, needsFollowUp: false });
    check('Registrerad faktisk start och två reduceringsbeslut bevarar datum, källa och giltighet. Reducerad börjar på beslutets giltighetsdag.');

    stage = 'source conflict, atomic audit and concurrent writes';
    latest = (await read('principalA', sa)).result;
    const writer = commandFor(sa, latest, 'prepare_draft', { dates: [] });
    const content = { ...latest.current.content, dialogue: null, source: exactContent.source };
    await db`update public.pupil_placements set ends_on='2029-06-20' where id=${sa.placementId}`;
    let outcome;
    try { outcome = await send('admin', writer, content); }
    finally { await db`update public.pupil_placements set ends_on=null where id=${sa.placementId}`; }
    conflict(outcome, 'source');
    check('Ändrat källunderlag avvisar samma redigeringsbegäran innan skrivning.');
    const savedBeforeError = await tableHashes(db, ownTableNames);
    await db.unsafe(`create function public.synthetic_study_plan_audit_fail() returns trigger language plpgsql as $$
      begin if new.action='individual_study_plan_saved' then raise exception 'synthetic audit unavailable' using errcode='55000'; end if; return new; end $$;
      create trigger synthetic_study_plan_audit_fail before insert on public.security_events for each row execute function public.synthetic_study_plan_audit_fail();`);
    try {
      await denied(() => send('admin', writer, content), '55000');
    } finally {
      await db.unsafe('drop trigger synthetic_study_plan_audit_fail on public.security_events; drop function public.synthetic_study_plan_audit_fail();');
    }
    assert.deepEqual(await tableHashes(db, ownTableNames), savedBeforeError);
    assert.equal((await status('admin', sa, writer.commandId)).receipt, null);
    assert.equal((await read('principalA', sa)).result.current.revision, reducedVersion.revision);
    check('Framtvingat auditfel lämnar plan, historik, kvitto och gällande revision hela.');
    const sendOther = sendWith(environment.connect(), f);
    const pair = await Promise.all([send('admin', writer, content), sendOther('admin', { ...writer, commandId: randomUUID() }, content)]);
    assert.equal(pair.filter(result => result.status === 'saved').length, 1);
    const collided = pair.filter(result => result.status === 'conflict');
    assert.equal(collided.length, 1);
    assert.equal(collided[0].reason, 'revision');
    latest = (await read('principalA', sa)).result;
    const retry = commandFor(sa, latest, 'prepare_draft', { dates: [] });
    const retryContent = { ...latest.draft.content, dialogue: null };
    const replay = await Promise.all([send('admin', retry, retryContent), sendOther('admin', retry, retryContent)]);
    assert.deepEqual(replay[0], replay[1]);
    assert.equal(saved(replay[0]).revision, latest.latestRevision + 1);
    check('Två databasanslutningar ger en vinnare för konkurrerande skrivningar och ett identiskt kvitto vid parallellt omförsök.');
    await denied(() => db`update public.individual_study_plan_revisions set recorded_at=clock_timestamp() where plan_id=${exact.planId}`);
    await denied(() => db`delete from public.individual_study_plan_receipts where command_id=${retry.commandId}`);
    await denied(() => db`insert into public.individual_study_plan_revisions
      select * from public.individual_study_plan_revisions where plan_id=${exact.planId} and revision=${exact.revision}`, '23505');
    check('Historik och kvitto är oföränderliga. En dublettrevision nekas.');

    stage = 'live scope and register preservation';
    await db`update public.access_assignments set ended_at=clock_timestamp() where id=${f.roles.principalA}`;
    try {
      await denied(() => read('principalA', sa, { view: 'history', revision: exact.revision }));
      await denied(() => send('principalA', commandFor(sa, latest, 'record_decision', { decision: reduction })));
    } finally {
      await db`update public.access_assignments set ended_at=null where id=${f.roles.principalA}`;
    }
    check('Indraget rektorsuppdrag stoppar historik och beslut på redan sparad plan.');
    await db.begin(async tx => {
      await setActor(tx, f, 'principalA');
      await tx`select public.study_group_read(${tx.json({ unitId: sa.unitId, schoolYear: 2026 })})`;
    });
    assert.deepEqual(await tableHashes(db, businessTableNames), businessBaseline);
    check('Studieplanskommandon och gruppläsning bevarar elev-, klass-, val-, grupp-, timplans-, tjänste- och schemadata.');

    stage = 'ordinary class change';
    const beforeClassChange = await tableHashes(db, ownTableNames);
    const changed = await db.begin(async tx => {
      await setActor(tx, f, 'admin');
      return (await tx`select public.phase4_change_pupil(${tx.json({
        pupilId: sa.pupilId, schoolYear: 2026, caseId: null, expectedVersion: 1, kind: 'class',
        payload: { placementId: sa.placementId, classId: sa.nextClassId, startsOn: '2027-01-11', endsOn: null },
      })}) as changed`)[0].changed;
    });
    assert.equal(changed.kind, 'success');
    const [newMembership] = await db`select placement_id from public.pupil_class_memberships where pupil_id=${sa.pupilId} and class_id=${sa.nextClassId}`;
    assert.equal(newMembership.placement_id, sa.placementId);
    assert.equal((await read('principalA', sa, { on: '2027-01-11' })).result.current.planId, exact.planId);
    assert.deepEqual(await tableHashes(db, ownTableNames), beforeClassChange);
    check('Ordinarie daterat klassbyte inom placeringen bevarar plan-ID, historik och kvitton.');

    report.status = 'PASS';
  } catch (error) {
    report.failure = { stage, code: error.code ?? 'ASSERTION', hint: error.hint ?? null };
    const location = error.stack?.split('\n').find(line => line.includes('/verify-individual-study-plan-sql.mjs:'));
    console.error('SQL-provet stannade i', stage, error.code ?? error.name, error.hint ?? '', location?.trim() ?? '');
  } finally {
    try {
      await environment?.end();
      report.cleanup = environment ? 'complete' : 'not_started';
    } catch {
      report.cleanup = 'failed';
      report.status = 'FAIL';
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportPath = join(tmpdir(), `individual-study-plan-sql-${randomUUID()}.json`);
  const report = await verifyIndividualStudyPlanSql(reportPath);
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, report: reportPath }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
