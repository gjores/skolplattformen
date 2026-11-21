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
import { parseStudyPlanBasis, prepareStudyPlanDraft } from '../../web/lib/server/study-plan-basis.ts';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { defaultSchemaVillkor } from '../../web/lib/schema-contract.ts';
import { parseStudyGroupCommand, parseStudyGroupReply, STUDY_GROUP_CONTRACT_VERSION } from '../../web/lib/study-group-contract.ts';

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
const comparisonTables = [...businessTableNames, ...ownTableNames, 'schema_draft_commands', 'study_group_classes',
  'study_group_history', 'study_group_commands', 'study_group_snapshots', 'tjanst_version_study_group_sources'];

async function seedNationalOffering(tx, { customerId, organizerId, unitId, programCode, orientationCode, label }) {
  const offeringId = randomUUID(), classId = randomUUID(), nextClassId = randomUUID();
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
    values (${offeringId},${organizerId},${unitId},'gymnasium',${`Syntetiskt ${programCode}`},${label},${programCode},${orientationCode},2026)`;
  const program = catalog.programs.find(program => program.code === programCode);
  const reference = { catalogId: catalog.catalogId, programRef: { code: program.code, version: program.version },
    orientationCode, startedOn: startsOn, specializationRefs: [],
    choiceBlocks: defaultProgramplanChoiceBlocks(program, orientationCode) };
  // The class register needs a catalog-backed cohort start. No timetable is created.
  await tx`insert into public.point_plans(organizer_id,offering_id,version,catalog_id,basis_reference)
    values (${organizerId},${offeringId},1,${catalog.catalogId},${tx.json(reference)})`;
  await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
    values (${classId},${customerId},${organizerId},${unitId},${offeringId},${label},2026),
    (${nextClassId},${customerId},${organizerId},${unitId},${offeringId},${label + 'B'},2026)`;
  return { unitId, offeringId, classId, nextClassId, programCode, orientationCode };
}

/** Ordinary register rows for national programmes without a timetable. The caller owns an isolated test DB. */
export async function seedIndividualStudyPlanPupils(tx, { customerId, organizerId, schoolAId, schoolBId }) {
  assert.ok([customerId, organizerId, schoolAId, schoolBId].every(Boolean));
  assert.notEqual(schoolAId, schoolBId);
  await tx`insert into public.school_unit_types(unit_id,school_type) values (${schoolAId},'GY'),(${schoolBId},'GY') on conflict do nothing`;
  const sa = await seedNationalOffering(tx, { customerId, organizerId, unitId: schoolAId, programCode: 'SA25',
    orientationCode: 'SABEP', label: 'SA26' });
  const bf = await seedNationalOffering(tx, { customerId, organizerId, unitId: schoolBId, programCode: 'BF25',
    orientationCode: 'BFPES', label: 'BF26' });
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

function catalogCourse(itemCode, languageCode = null) {
  const subject = catalog.subjects.find(row => row.typeOfSyllabus === 'GRADE_SUBJECT_SYLLABUS'
    && row.schoolTypes.includes('GY') && row.items.some(item => item.code === itemCode));
  assert.ok(subject, 'synthetic group course found in catalog');
  return { subjectCode: subject.code, subjectVersion: subject.version, itemCode, languageCode,
    points: subject.items.find(row => row.code === itemCode).points };
}

function firstDraft(basis, programCode, settings = {}) {
  const attempt = () => ({ id: randomUUID(), plannedStart: null, plannedEnd: null, actual: { certainty: 'recorded', start: null, end: null } });
  const level = (course, label) => ({ ...course, id: randomUUID(), kind: 'gy25_level', label, attempts: [attempt()] });
  const optionalLanguages = programCode === 'SA25' ? [
    level(catalogCourse('MODY1000X', 'es'), 'Spanska, nybörjare'),
    level(catalogCourse('MODY1000X', 'de'), 'Tyska, nybörjare'),
  ] : [];
  return parseStudyPlanContent({
    source: basis.source, path: { ...basis.path, apprenticeship: false },
    levels: [
      level(catalogCourse('ENGE1000X'), 'Engelska, nivå 1'), ...optionalLanguages,
      { id: randomUUID(), kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: `GYAR${programCode.slice(0, 2)}25`,
        label: 'Gymnasiearbete', languageCode: null, points: 100, attempts: [attempt()] },
    ],
    choices: [], decisions: [], dialogue: null, sourceIssues: [], compulsorySchoolSubjects: [],
    distanceTeaching: { kind: 'none', minutes: null }, ...settings,
  });
}

/** Calls the existing group flow in a caller's isolated fixture transaction with an actor already set. */
export async function studyPlanFixtureGroupCommand(tx, unitId, action, payload) {
  const input = parseStudyGroupCommand({ contractVersion: STUDY_GROUP_CONTRACT_VERSION, commandId: randomUUID(),
    unitId, schoolYear: 2026, action, payload });
  const [{ result }] = await tx`select public.study_group_command(${tx.json(input)}) as result`;
  return parseStudyGroupReply(result.result, input);
}

/** Parallel English groups and two languages with a shared level code. Uses only real group commands. */
export async function seedStudyPlanImpactGroups(tx, pupil, { otherPupilId } = {}) {
  const set = randomUUID(), groupStarts = '2026-08-17', groupEnds = '2027-06-15';
  const group = (name, course, parallelSetId = randomUUID(), endsOn = groupEnds) => ({
    id: randomUUID(), name, expectedRevision: 0, startsOn: groupStarts, endsOn, course,
    minutesHt: 900, minutesVt: 900, parallelSetId, classIds: [pupil.classId, pupil.nextClassId].filter(Boolean), origin: { kind: 'manual' },
  });
  const groups = {
    englishFrom: group('Syntetisk engelska A', catalogCourse('ENGE1000X'), set),
    englishTo: group('Syntetisk engelska B', catalogCourse('ENGE1000X'), set, '2027-06-11'),
    englishSame: group('Syntetisk engelska D', catalogCourse('ENGE1000X'), set),
    englishOther: group('Syntetisk engelska C', catalogCourse('ENGE1000X')),
    spanish: group('Syntetisk spanska', catalogCourse('MODY1000X', 'es')),
    german: group('Syntetisk tyska', catalogCourse('MODY1000X', 'de')),
    unknown: group('Syntetisk grupp utan ämne', null),
  };
  for (const item of Object.values(groups)) await studyPlanFixtureGroupCommand(tx, pupil.unitId, 'save_group', item);
  async function addTo(item, id, startsOn, endsOn) {
    const { receipt } = await studyPlanFixtureGroupCommand(tx, pupil.unitId, 'add_members', {
      groupId: item.id, members: [{ pupilId: id, startsOn, endsOn, source: 'manual', sourceRef: null }],
    });
    return receipt.membershipIds[0];
  }
  const english = await addTo(groups.englishFrom, pupil.pupilId, '2027-01-18', '2027-06-14');
  const spanish = await addTo(groups.spanish, pupil.pupilId, '2026-09-01', '2027-06-10');
  const other = otherPupilId ? await addTo(groups.englishTo, otherPupilId, '2026-09-01', '2027-06-10') : null;
  return { ...groups, memberships: { english, spanish, other } };
}

function unwrap(result, f, actor) {
  assert.equal(result.contractVersion, 'individual_study_plan_sql_v1', 'RPC version');
  assert.equal(result.actor.identityId, f.identity(actor), 'RPC actor identity');
  assert.equal(result.actor.assignmentId, f.roles[actor], 'RPC actor assignment');
  return result;
}

const readWith = (db, f) => async (actor, pupil, { view = 'current', on = currentDay, legacy = false, ...details } = {}) => db.begin(async tx => {
  const request = parseStudyPlanReadRequest({ ...scopeOf(pupil), view, on, ...details });
  await setActor(tx, f, actor);
  const input = view === 'current' && !legacy ? { ...request, includeDateSuggestions: true, includeProgramTerms: true } : request;
  const value = (await tx`select public.individual_study_plan_read(${tx.json(input)}) r`)[0].r;
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
const sendWith = (db, f) => async (actor, command, content = null, legacy = false) => db.begin(async tx => {
  await setActor(tx, f, actor);
  const input = { command, content, ...(command.action === 'record_actual' && !legacy ? { keepCurrentActual: true } : {}) };
  const value = (await tx`select public.individual_study_plan_command(${tx.json(input)}) r`)[0].r;
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

async function seedComparisonDraft(tx, unitId) {
  const hash = `sha256:${'a'.repeat(64)}`;
  const document = {
    documentVersion: 1, base: null, basisVillkor: null, workingVillkor: defaultSchemaVillkor(),
    placements: [], locks: [], intentional: [], datedOverrides: [], activityTypes: [], control: null, requiresRecalculation: true,
    source: { planId: null, planRevision: 0, calendarVersionId: null, calendarVersion: null, lessonSources: [], digest: hash },
  };
  const input = { contractVersion: 1, unitId, schoolYear: 2026, period: 'lasar', commandId: randomUUID(), draftId: null,
    expectedRevision: 0, name: 'Syntetiskt schemautkast för studieplansjämförelse', requestHash: hash, document, sourceHash: hash };
  const [{ value }] = await tx`select public.schema_command(${tx.json(input)}) as value`;
  assert.equal(value.result.draft.revision, 1);
}

async function verifyComparisons({ db, f, read, sa, bf, check, logStage }) {
  logStage('comparison fixture');
  const alternative = await db.begin(tx => seedNationalOffering(tx, { customerId: f.id(1), organizerId: f.id(2), unitId: sa.unitId,
    programCode: 'BF25', orientationCode: 'BFPES', label: 'SPBF26' }));
  const group = await db.begin(async tx => {
    await setActor(tx, f, 'principalA');
    const groups = await seedStudyPlanImpactGroups(tx, sa, { otherPupilId: f.pupils.inGroup2 });
    await seedComparisonDraft(tx, sa.unitId);
    return groups;
  });
  const foreign = await db.begin(async tx => {
    await setActor(tx, f, 'principalB');
    return seedStudyPlanImpactGroups(tx, bf);
  });
  const before = await tableHashes(db, comparisonTables);
  assert.ok(before.schema_draft_revisions.n > 0 && before.study_group_history.n > 0 && before.individual_study_plan_revisions.n > 0);
  const compareOn = '2027-02-15';
  const compare = async (target, on = compareOn, actor = 'principalA', pupil = sa) => {
    const reply = (await read(actor, pupil, { view: 'impact', on, target })).result;
    assert.deepEqual(reply.target, target, 'projection echoes dated target');
    assert.equal(reply.on, on);
    return reply;
  };
  const compared = async (...args) => {
    const reply = await compare(...args);
    assert.equal(reply.status, 'compared', 'comparison available');
    return reply.impact;
  };
  const readWithGroups = (await read('principalA', sa, { on: compareOn })).result;
  const original = readWithGroups.current;
  const spanish = (readWithGroups.draft ?? original).content.levels.find(item => item.languageCode === 'es');
  assert.deepEqual(readWithGroups.dateSuggestions, [{
    levelId: spanish.id, attemptId: spanish.attempts[0].id,
    plannedStart: day('2026-09-01'), plannedEnd: day('2027-06-10'),
  }]);
  assert.equal(spanish.attempts[0].actual.start, null);
  assert.equal(spanish.attempts[0].actual.end, null);
  assert.equal(Object.hasOwn((await read('principalA', sa, { on: compareOn, legacy: true })).result, 'dateSuggestions'), false);
  check('Entydigt språk- och nivåmatchat gruppmedlemskap ger ett valbart datumförslag utan att fylla i faktisk start eller slut.');
  const termDates = { levelId: spanish.id, attemptId: spanish.attempts[0].id,
    plannedStart: term(2026, 'HT'), plannedEnd: term(2026, 'VT') };
  const planned = structuredClone((readWithGroups.draft ?? original).content);
  Object.assign(planned.levels.find(level => level.id === spanish.id).attempts[0], {
    plannedStart: termDates.plannedStart, plannedEnd: termDates.plannedEnd,
  });
  planned.dialogue = null;
  const datesCommand = commandFor(sa, readWithGroups, 'prepare_draft', { dates: [termDates] });
  const rollbackDates = new Error('synthetic term suggestion rollback');
  await assert.rejects(() => db.begin(async tx => {
    await setActor(tx, f, 'principalA');
    const [{ r: savedDates }] = await tx`select public.individual_study_plan_command(${tx.json({ command: datesCommand, content: planned })}) r`;
    assert.equal(savedDates.result.status, 'saved');
    const request = { ...scopeOf(sa), on: compareOn, view: 'current', includeDateSuggestions: true, includeProgramTerms: true };
    const [{ r: legacyDates }] = await tx`select public.individual_study_plan_read(${tx.json(request)}) r`;
    assert.deepEqual(legacyDates.result.dateSuggestions, []);
    const [{ r: suggestedDates }] = await tx`select public.individual_study_plan_read(${tx.json({ ...request, includeTermDateSuggestions: true })}) r`;
    assert.deepEqual(suggestedDates.result.dateSuggestions, readWithGroups.dateSuggestions);
    const attempt = suggestedDates.result.draft.content.levels.find(level => level.id === spanish.id).attempts[0];
    assert.deepEqual([attempt.plannedStart, attempt.plannedEnd, attempt.actual], [termDates.plannedStart, termDates.plannedEnd, spanish.attempts[0].actual]);
    throw rollbackDates;
  }), error => error === rollbackDates);
  check('Den utökade gruppläsningen kan precisera två planerade terminer. Äldre klienter får bara förslag för tomma datumfält.');
  const plannedEnglish = original.content.levels.find(item => item.itemCode === 'ENGE1000X');
  const checkPlan = impact => assert.deepEqual(impact.plan, { planId: original.planId, revision: original.revision });

  logStage('dated class comparison and scoped options');
  const options = (await read('principalA', sa, { view: 'options', on: compareOn })).result;
  assert.equal(options.status, 'available');
  assert.ok(options.options.some(option => option.kind === 'class' && option.classId === sa.nextClassId));
  assert.ok(options.options.some(option => option.kind === 'class' && option.classId === alternative.classId));
  assert.ok(options.options.some(option => option.kind === 'group' && option.groupId === group.englishTo.id));
  assert.ok(options.options.some(option => option.kind === 'membership' && option.membershipId === group.memberships.english));
  for (const item of options.options) {
    assert.notEqual(item.classId, bf.classId, 'no target class from another school');
    assert.notEqual(item.groupId, foreign.englishTo.id, 'no target group from another school');
    assert.notEqual(item.membershipId, group.memberships.other, 'no other pupil membership');
  }
  const sameClass = await compared({ kind: 'class_move', classId: sa.nextClassId });
  checkPlan(sameClass);
  assert.equal(sameClass.result, 'same_level');
  assert.equal(sameClass.sources.classId, sa.classId);
  assert.equal(sameClass.sources.classMembershipId, sa.membershipId);
  assert.equal(sameClass.sources.offeringId, sa.offeringId);
  assert.equal(sameClass.sources.targetOfferingId, sa.offeringId);
  const differentClass = await compared({ kind: 'class_move', classId: alternative.classId });
  checkPlan(differentClass);
  assert.equal(differentClass.result, 'review_education');
  assert.equal(differentClass.sources.offeringId, sa.offeringId);
  assert.equal(differentClass.sources.targetOfferingId, alternative.offeringId);
  assert.equal(original.content.path.programCode, 'SA25');
  check('Daterad klassjämförelse läser befintlig utbildning. Annat erbjudande visas för granskning inom samma skola.');

  logStage('inclusive parallel dates and source revisions');
  const move = { kind: 'group_move', membershipId: group.memberships.english, toGroupId: group.englishSame.id };
  const same = await compared(move);
  checkPlan(same);
  assert.equal(same.result, 'same_level');
  assert.equal(same.comparedOn, compareOn);
  const sameRow = same.levels.find(row => row.levelId === plannedEnglish.id);
  assert.equal(sameRow.change, 'same_level');
  assert.equal(sameRow.before.groupId, group.englishFrom.id);
  assert.deepEqual([sameRow.before.startsOn, sameRow.before.endsOn], ['2027-01-18', '2027-06-14']);
  assert.equal(sameRow.after.groupId, group.englishSame.id);
  assert.deepEqual([sameRow.after.startsOn, sameRow.after.endsOn], [compareOn, '2027-06-14']);
  assert.ok(same.sources.groups.some(row => row.membershipId === group.memberships.english && row.revision === 1));
  assert.ok(same.sources.groups.some(row => row.groupId === group.englishSame.id && row.revision === 1));
  assert.equal(same.sourceRemainder.endsOn, '2027-02-14');
  const truncated = await compared({ ...move, toGroupId: group.englishTo.id });
  const truncatedRow = truncated.levels.find(row => row.levelId === plannedEnglish.id);
  assert.equal(truncated.result, 'follow_up');
  assert.equal(truncatedRow.change, 'same_level');
  assert.equal(truncatedRow.after.endsOn, '2027-06-11');
  assert.ok(truncated.issues.some(issue => issue.code === 'planned_period_review'));
  check('Direkt parallellbyte visar vald källrelation, gruppversion, sista källdag och klippt målperiod.');

  const early = await compared(move, '2027-01-13');
  assert.equal(early.comparedOn, '2027-01-18');
  assert.equal(early.sourceRemainder, null);
  assert.equal(early.levels.find(row => row.levelId === plannedEnglish.id).after.startsOn, '2027-01-18');
  const oldRevision = (await read('principalA', sa, { on: '2026-11-20' })).result.current;
  const oldDate = await compared({ kind: 'class_move', classId: sa.nextClassId }, '2026-11-20');
  assert.deepEqual(oldDate.plan, { planId: original.planId, revision: oldRevision.revision });
  assert.notEqual(oldRevision.revision, original.revision);
  check('Begärt tidigt byte drar tillbaka tidigare planerad start. Jämförelsedatum väljer rätt gällande studieplansrevision.');

  logStage('group addition, end, separate language, missing source and school boundary');
  const add = await compared({ kind: 'group_add', groupId: group.german.id, startsOn: compareOn, endsOn: '2027-04-28' });
  const addedRow = add.levels.find(row => row.ref.languageCode === 'de');
  assert.equal(addedRow.after.groupId, group.german.id);
  assert.deepEqual([addedRow.after.startsOn, addedRow.after.endsOn], [compareOn, '2027-04-28']);
  assert.equal(addedRow.before, null);
  const end = await compared({ kind: 'group_end', membershipId: group.memberships.spanish });
  assert.equal(end.result, 'follow_up');
  const endedRow = end.levels.find(row => row.ref.languageCode === 'es');
  assert.equal(endedRow.change, 'missing_group');
  assert.equal(endedRow.before.endsOn, '2027-06-10');
  assert.equal(endedRow.after.groupId, group.spanish.id);
  assert.equal(endedRow.after.endsOn, compareOn, 'last day remains included');
  const outsideStudyPeriod = await compared({ kind: 'group_end', membershipId: group.memberships.english });
  assert.equal(outsideStudyPeriod.result, 'same_level', 'no missing group when the planned level starts later');
  check('Grupptillägg visar valt slutdatum. Avslut behåller sista närvarodagen och synliggör fortsatt uppföljning.');

  const otherSet = await compared({ ...move, toGroupId: group.englishOther.id });
  assert.equal(otherSet.result, 'follow_up');
  assert.ok(otherSet.issues.some(issue => issue.code === 'different_parallel_set'));
  const languages = await compared({ kind: 'group_move', membershipId: group.memberships.spanish, toGroupId: group.german.id });
  assert.equal(languages.result, 'follow_up');
  assert.ok(languages.issues.some(issue => issue.code === 'different_parallel_set'));
  const languageRows = languages.levels.filter(row => row.ref.itemCode === 'MODY1000X');
  assert.deepEqual(languageRows.map(row => row.ref.languageCode).sort(), ['de', 'es']);
  assert.notEqual(languageRows[0].levelId, languageRows[1].levelId);
  check('Annat parallellblock kan granskas. Spanska och tyska med gemensam nivåkod förblir separata planrader.');

  const noCourse = await compared({ kind: 'group_add', groupId: group.unknown.id, startsOn: compareOn, endsOn: '2027-04-28' });
  assert.equal(noCourse.result, 'unknown');
  assert.ok(noCourse.issues.some(issue => issue.code === 'group_course_missing'));
  const beforePlan = await compared({ kind: 'class_move', classId: sa.nextClassId }, '2026-08-25');
  assert.equal(beforePlan.plan, null);
  assert.equal(beforePlan.result, 'unknown');
  for (const target of [{ kind: 'class_move', classId: bf.classId },
    { ...move, toGroupId: foreign.englishTo.id },
    { kind: 'group_end', membershipId: group.memberships.other }]) {
    const response = await compare(target);
    assert.equal(response.status, 'unavailable');
    assert.equal(response.impact, null);
  }
  await denied(() => compare(move, compareOn, 'principalB'));
  await denied(() => read('principalB', sa, { view: 'options', on: compareOn }));
  check('Okänd nivåkälla eller saknad gällande plan visas som sådana. Främmande mål och andra elevers medlemskap ger inget underlag.');

  logStage('comparison fingerprints and ordinary group command parity');
  assert.deepEqual(await tableHashes(db, comparisonTables), before);
  const unchanged = (await read('principalA', sa, { on: compareOn })).result.current;
  assert.deepEqual(unchanged, original, 'planned and actual dates preserved');
  check('Skrivskyddad jämförelse bevarar sparade studieplaner, grupp- och klasskällor, tjänstefördelning samt ett faktiskt sparat schemautkast.');

  const rollback = new Error('synthetic comparison command parity rollback');
  await assert.rejects(() => db.begin(async tx => {
    await setActor(tx, f, 'principalA');
    const moveResult = await studyPlanFixtureGroupCommand(tx, sa.unitId, 'move_member', {
      membershipId: group.memberships.english, toGroupId: group.englishTo.id, on: compareOn,
    });
    const actual = moveResult.read.memberships.find(row => row.id === moveResult.receipt.membershipIds[0]);
    const previous = moveResult.read.memberships.find(row => row.id === group.memberships.english);
    assert.deepEqual([actual.startsOn, actual.endsOn], [truncatedRow.after.startsOn, truncatedRow.after.endsOn]);
    assert.equal(previous.endsOn, same.sourceRemainder.endsOn);
    throw rollback;
  }), error => error === rollback);
  assert.deepEqual(await tableHashes(db, comparisonTables), before);
  check('Ordinarie gruppkommando i återställd provtransaktion bekräftar tidigare förhandsvisade gränsdagar och slutdatum.');
}

export async function verifyIndividualStudyPlanSql(out) {
  const report = { kind: 'ephemeral-individual-study-plan-sql', status: 'FAIL', checks: [], startedAt: new Date().toISOString() };
  const check = name => { report.checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); };
  let environment;
  let stage = 'bootstrap';
  try {
    const migrations = migrationFiles().filter(name => name.includes('_individual_study_plan'));
    assert.ok(migrations.includes('20261120110000_individual_study_plans.sql'), 'expected SP-02 migration present');
    assert.ok(migrations.includes('20261120111000_individual_study_plan_impact.sql'), 'expected SP-05 migration present');
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
    const distribution = [{ rowKey: 'meta:diplomaWork', points: [0, 0, 0, 0, 50, 50] }];
    assert.equal(vocational.basis.programTerms, undefined, 'draft plan is not a source');
    const published = await db.begin(async tx => {
      await f.actor(tx, 'hm');
      const [programPlan] = await tx`update public.point_plans set term_distribution=${tx.json(distribution)},revision=revision+1
        where offering_id=${bf.offeringId} and status='utkast' returning id,revision`;
      await tx`insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),
        'programplan',${programPlan.id},'utkast','faststalld',${programPlan.revision})`;
      const [locked] = await tx`update public.point_plans set status='faststalld',revision=revision+1,
        decided_on=public.phase5_programplan_today(),decided_identity_id=public.current_identity_id()
        where id=${programPlan.id} returning id,revision,version`;
      await tx`delete from public.plan_decision_write_permits
        where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=${programPlan.id}`;
      return locked;
    });
    const ratedVocational = await read('principalB', bf);
    const legacyVocational = await read('principalB', bf, { legacy: true });
    assert.deepEqual(ratedVocational.basis.programTerms, { cohortStartYear: 2026, distribution });
    assert.deepEqual(ratedVocational.basis.programPlan, { ...published, specializationRefs: [] });
    assert.equal(legacyVocational.basis.programTerms, undefined);
    assert.equal(ratedVocational.result.sourceToken, legacyVocational.result.sourceToken);
    assert.notEqual(ratedVocational.result.sourceToken, vocational.result.sourceToken);
    assert.equal((await read('principalA', sa)).basis.programTerms, undefined);
    check('Bara den fastställda programplansrevisionen ger kullens terminsunderlag. Den utökade läsningen bevarar källtoken.');
    const bfDraft = await prepareStudyPlanDraft(parseStudyPlanBasis(ratedVocational.basis), null, { dates: [] });
    const [diplomaWork] = bfDraft.levels.filter(level => level.kind === 'diploma_work');
    assert.deepEqual(diplomaWork.attempts[0].plannedStart, term(2028, 'HT'));
    assert.deepEqual(diplomaWork.attempts[0].plannedEnd, term(2028, 'VT'));
    assert.deepEqual(diplomaWork.attempts[0].actual, { certainty: 'recorded', start: null, end: null });
    check('Det skyddade BF26-underlaget ger HT 2028 och VT 2029 när servern bereder gymnasiearbetet i första utkastet.');

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
    const saveAndPublish = async (actor, pupil, effectiveOn) => {
      const beforePublication = (await read(actor, pupil)).result;
      return saved(await send(actor, commandFor(pupil, beforePublication, 'make_current', { effectiveOn })));
    };
    const termVersion = await saveAndPublish('principalA', sa, firstEffective);
    assert.equal(termVersion.content.dialogue, null);
    assert.deepEqual(termVersion.content.levels[0].attempts[0].plannedEnd, term(2028, 'VT'));
    assert.equal(termVersion.planId, firstDraftVersion.planId);
    const bfContent = firstDraft(ratedVocational.basis, 'BF25');
    assert.equal((await send('principalB', commandFor(bf, vocational.result, 'prepare_draft', { dates: [] }), bfContent)).reason, 'source');
    saved(await send('principalB', commandFor(bf, ratedVocational.result, 'prepare_draft', {
      dates: [], apprenticeship: false, distanceTeaching: bfContent.distanceTeaching, compulsorySchoolSubjects: [],
    }), bfContent));
    assert.equal((await saveAndPublish('principalB', bf, firstEffective)).content.path.programCode, 'BF25');
    check('Rektor gör kompletta studieplaner gällande utan separat dialogregistrering. Saknade innehållsuppgifter stannar som utkast.');

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
    const secondLevel = latest.current.content.levels.at(-1);
    const secondDates = { levelId: secondLevel.id, attemptId: secondLevel.attempts[0].id,
      plannedStart: term(2027, 'HT'), plannedEnd: term(2027, 'VT') };
    const combined = commandFor(sa, latest, 'update_planned_dates', { dates: [exactDates, secondDates] });
    await denied(() => send('admin', combined));
    await denied(() => send('principalB', combined));
    await denied(() => send('principalA', { ...combined, payload: { dates: [exactDates, { ...secondDates, levelId: eng.id }] } }), '22023');
    assert.equal((await read('principalA', sa)).result.latestRevision, latest.latestRevision);
    const combinedResult = await send('principalA', combined);
    const combinedVersion = saved(combinedResult);
    assert.equal(combinedVersion.planId, termVersion.planId);
    assert.equal(combinedVersion.revision, latest.latestRevision + 1);
    const exactRead = (await read('principalA', sa, { on: combinedVersion.effectiveOn })).result;
    assert.equal(exactRead.draft, null);
    assert.deepEqual(exactRead.current.content.levels[0].attempts[0].plannedEnd, exactDates.plannedEnd);
    assert.deepEqual(exactRead.current.content.levels.at(-1).attempts[0].plannedEnd, secondDates.plannedEnd);
    assert.deepEqual(await send('principalA', combined), combinedResult);
    assert.deepEqual((await status('principalA', sa, combined.commandId)).receipt, combinedResult.receipt);
    check('Två planerade perioder sparas atomiskt på samma gällande studieplan i en revision. Ogiltig rad rullar tillbaka hela kommandot.');
    const currentBeforeActual = (await read('principalB', bf)).result;
    const [pupilEnglish] = currentBeforeActual.current.content.levels;
    const starts = { kind: 'started', on: firstEffective, source: { kind: 'school_record', id: randomUUID() } };
    const eventCommand = commandFor(bf, currentBeforeActual, 'record_actual', {
      levelId: pupilEnglish.id, attemptId: pupilEnglish.attempts[0].id, event: starts,
    });
    const newFact = saved(await send('principalB', eventCommand));
    assert.equal(newFact.effectiveOn, currentBeforeActual.current.effectiveOn);
    assert.equal(newFact.state, 'current');
    const afterCurrentActual = (await read('principalB', bf)).result;
    assert.equal(afterCurrentActual.draft, null);
    assert.equal(afterCurrentActual.current.revision, newFact.revision);
    assert.equal(studyAttemptStatus(afterCurrentActual.current.content.levels[0].attempts[0], currentDay, [], pupilEnglish.id).progress, 'started');
    check('En bekräftad studiehändelse uppdaterar status direkt i den gällande planen med samma giltighetsdag.');
    assert.equal(Object.hasOwn((await read('principalB', bf, { legacy: true })).result, 'dateSuggestions'), false);
    const legacyCompletion = commandFor(bf, afterCurrentActual, 'record_actual', {
      levelId: pupilEnglish.id, attemptId: pupilEnglish.attempts[0].id,
      event: { ...starts, kind: 'completed', on: '2026-11-10' },
    });
    assert.equal(saved(await send('principalB', legacyCompletion, null, true)).state, 'draft');
    check('Den tidigare appen kan fortfarande läsa studieplanen och få sitt utkastskvitto efter migrationen.');

    latest = (await read('principalA', sa)).result;
    const exactContent = structuredClone(latest.current.content);
    exactContent.dialogue = null;
    Object.assign(exactContent.levels[0].attempts[0], { plannedStart: exactDates.plannedStart, plannedEnd: exactDates.plannedEnd });
    saved(await send('admin', commandFor(sa, latest, 'prepare_draft', { dates: [exactDates] }), exactContent));
    const exact = await saveAndPublish('principalA', sa, '2026-12-01');
    assert.equal(exact.planId, termVersion.planId);
    assert.equal((await read('principalA', sa, { on: firstEffective })).result.current.revision, termVersion.revision);
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
    // Bevara den andra tidslinjen i jämförelseprovet och pröva äldre sparformat.
    const actualVersion = saved(await send('admin', actual, null, true));
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

    await verifyComparisons({ db, f, read, sa, bf, check, logStage: description => { stage = description; } });

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
