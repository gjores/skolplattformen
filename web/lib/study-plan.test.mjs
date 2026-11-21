import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parsePlannedStudyDate, parseStudyPlanContent, parseStudyPlanDecision, parseStudyPlanSnapshot, studyAttemptStatus,
  studyDecisionEffective, studyPlanAt, studyPlanContentIssues, studyPlanLevelKey, validPlannedStudyPeriod,
} from './study-plan-model.ts';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadRequest, parseStudyPlanReadReply,
  parseStudyPlanStatusRequest, parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION, StudyPlanContractError,
} from './study-plan-contract.ts';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const scope = { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId: id(1), pupilId: id(2), placementId: id(3) };
const term = (schoolYear, term) => ({ kind: 'term', schoolYear, term });
const day = date => ({ kind: 'day', date });
const noActual = () => ({ certainty: 'recorded', start: null, end: null });
const attempt = (fields = {}) => ({
  id: id(5), plannedStart: term(2028, 'HT'), plannedEnd: term(2028, 'VT'), actual: noActual(), ...fields,
});
const level = (fields = {}) => ({
  id: id(4), kind: 'gy25_level', subjectCode: 'MODG', subjectVersion: 1, itemCode: 'MODG1000X',
  languageCode: 'es', label: 'Moderna språk – grund, spanska', points: 100, attempts: [attempt()], ...fields,
});
const diplomaWork = level({
  id: id(6), kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: 'GYARSA25',
  languageCode: null, label: 'Gymnasiearbete', attempts: [attempt({ id: id(7) })],
});
const sourceToken = `sha256:${'a'.repeat(64)}`;
const source = { kind: 'school_record', id: id(10) };
const fact = on => ({ on, source });
const decision = (fields = {}) => ({
  id: id(9), kind: 'reduced', reference: { kind: 'action_programme_decision', id: id(12) },
  decidedOn: '2028-11-01', effectiveOn: '2028-12-01', endsOn: null, scopePoints: 100,
  levelIds: [id(4)], replacementLevelIds: [], ...fields,
});
function content(fields = {}) {
  return {
    path: { regime: 'national_gy25', programCode: 'SA25', orientationCode: 'SABEP', apprenticeship: false, specialVariantCode: null },
    source: { offeringId: id(11), placementStartsOn: '2026-08-23', placementEndsOn: null, catalogId: sourceToken, programVersion: 1, choices: [] },
    levels: [level(), diplomaWork], choices: [], decisions: [], compulsorySchoolSubjects: [],
    distanceTeaching: { kind: 'none', minutes: null }, dialogue: null, sourceIssues: [], ...fields,
  };
}
function snapshot(revision = 1, fields = {}) {
  return {
    planId: id(13), revision, state: 'current', effectiveOn: '2027-01-01', recordedAt: '2026-12-08T16:12:42.974781+00:00',
    content: content(), ...fields,
  };
}
const historyEntry = ({ content: _content, ...entry }) => entry;

test('bevarar termins- och dagprecision per nivå utan timplan, kalender eller betygsdatum', () => {
  const studyPlan = parseStudyPlanContent(content());
  assert.deepEqual(studyPlanContentIssues(studyPlan), []);
  assert.deepEqual(studyPlan.levels[0].attempts[0].plannedEnd, term(2028, 'VT'));
  const dates = attempt({ plannedStart: day('2028-08-24') });
  assert.deepEqual(parseStudyPlanContent(content({ levels: [level({ attempts: [dates] })] })).levels[0].attempts, [dates]);
  const bf = content({ path: { ...studyPlan.path, programCode: 'BF25', orientationCode: 'BFPES' },
    levels: [level(), { ...diplomaWork, itemCode: 'GYARBF25' }] });
  assert.deepEqual(studyPlanContentIssues(parseStudyPlanContent(bf)), []);
});

test('validerar verkliga kalenderdatum, lika datum och entydigt omvända perioder', () => {
  assert.deepEqual(parsePlannedStudyDate(day('2028-02-29')), day('2028-02-29'));
  assert.throws(() => parsePlannedStudyDate(day('2029-02-29')), StudyPlanContractError);
  assert.throws(() => parsePlannedStudyDate({ ...term(2028, 'VT'), date: '2029-01-16' }), StudyPlanContractError);
  assert.equal(validPlannedStudyPeriod(day('2029-06-11'), day('2029-06-11')), true);
  assert.equal(validPlannedStudyPeriod(day('2029-06-11'), day('2029-06-10')), false);
  assert.equal(validPlannedStudyPeriod(term(2028, 'VT'), term(2028, 'HT')), false);
  assert.equal(validPlannedStudyPeriod(term(2028, 'VT'), term(2028, 'VT')), true);
  assert.equal(validPlannedStudyPeriod(term(2028, 'VT'), term(2029, 'HT')), true);
  assert.equal(validPlannedStudyPeriod(term(2028, 'HT'), day('2028-06-30')), false);
  assert.equal(validPlannedStudyPeriod(day('2029-07-01'), term(2028, 'VT')), false);
  assert.equal(validPlannedStudyPeriod(day('2029-01-16'), term(2028, 'HT')), true);
});

test('planerade datum ändrar aldrig status och bara en passerad exakt sluttid ger uppföljning', () => {
  const planned = attempt({ plannedStart: day('2028-08-24'), plannedEnd: day('2029-06-11') });
  assert.deepEqual(studyAttemptStatus(planned, '2029-06-11', [], id(4)), { progress: 'upcoming', reduced: false, needsFollowUp: false });
  assert.deepEqual(studyAttemptStatus(planned, '2029-06-12', [], id(4)), { progress: 'upcoming', reduced: false, needsFollowUp: true });
  assert.equal(studyAttemptStatus(attempt(), '2030-02-02', [], id(4)).needsFollowUp, false);
});

test('registrerad start, avslut och avbrott styr status vid angiven dag', () => {
  const actual = { ...noActual(), start: fact('2028-08-25'), end: { kind: 'completed', ...fact('2029-06-15') } };
  const row = attempt({ plannedEnd: day('2029-06-11'), actual });
  assert.equal(studyAttemptStatus(row, '2028-08-24', [], id(4)).progress, 'upcoming');
  assert.deepEqual(studyAttemptStatus(row, '2029-06-12', [], id(4)), { progress: 'started', reduced: false, needsFollowUp: true });
  assert.deepEqual(studyAttemptStatus(row, '2029-06-15', [], id(4)), { progress: 'completed', reduced: false, needsFollowUp: false });
  const interrupted = attempt({ actual: { ...actual, end: { ...actual.end, kind: 'interrupted' } } });
  assert.equal(studyAttemptStatus(interrupted, '2029-08-01', [], id(4)).progress, 'interrupted');
  const backwards = attempt({ actual: { ...actual, end: { kind: 'completed', ...fact('2028-08-24') } } });
  assert.throws(() => parseStudyPlanContent(content({ levels: [level({ attempts: [backwards] })] })), StudyPlanContractError);
});

test('bevarar okänt studieutfall och registrerat avslut utan dokumenterad äldre start', () => {
  const actual = { certainty: 'unknown', start: null, end: { kind: 'completed', ...fact('2028-12-15') } };
  const legacy = level({ kind: 'gy11_course', subjectCode: null, subjectVersion: null, itemCode: 'MATMAT01B', languageCode: null,
    attempts: [attempt({ actual })] });
  const r = parseStudyPlanContent(content({ levels: [legacy] })).levels[0];
  assert.equal(r.itemCode, 'MATMAT01B');
  assert.equal(studyAttemptStatus(r.attempts[0], '2028-12-14', [], r.id).progress, 'unknown');
  assert.equal(studyAttemptStatus(r.attempts[0], '2028-12-15', [], r.id).progress, 'completed');
});

test('giltig reducering är en separat beslutseffekt och bevarar faktisk start', () => {
  const row = attempt({ actual: { ...noActual(), start: fact('2028-08-25') } });
  const reduced = parseStudyPlanDecision(decision({ endsOn: '2029-01-13' }));
  assert.deepEqual(studyAttemptStatus(row, '2028-11-30', [reduced], id(4)), { progress: 'started', reduced: false, needsFollowUp: false });
  assert.deepEqual(studyAttemptStatus(row, '2028-12-01', [reduced], id(4)), { progress: 'started', reduced: true, needsFollowUp: false });
  assert.equal(studyDecisionEffective(reduced, '2029-01-13'), true);
  assert.equal(studyAttemptStatus(row, '2029-01-14', [reduced], id(4)).reduced, false);
  assert.equal(row.actual.start.on, '2028-08-25');
});

test('reducering med känd omfattning kan gälla på plannivå före kända nivåer', () => {
  const reduction = parseStudyPlanDecision(decision({ levelIds: [], scopePoints: 150 }));
  assert.equal(studyDecisionEffective(reduction, '2028-12-01'), true);
  assert.equal(reduction.scopePoints, 150);
  assert.equal(studyAttemptStatus(attempt(), '2028-12-01', [reduction], id(4)).reduced, false);
  assert.throws(() => parseStudyPlanDecision(decision({ reference: null })), StudyPlanContractError);
  assert.throws(() => parseStudyPlanDecision(decision({ scopePoints: null })), StudyPlanContractError);
  assert.throws(() => parseStudyPlanDecision(decision({ reference: { kind: 'school_decision', id: id(12) } })), StudyPlanContractError);
  assert.throws(() => parseStudyPlanDecision(decision({ decidedOn: '2028-12-02' })), StudyPlanContractError);
});

test('behörighetsbortval och ersatt nivå bevaras med annan beslutstyp', () => {
  const prior = decision({ kind: 'eligibility_opt_out', reference: { kind: 'school_decision', id: id(12) }, scopePoints: null });
  assert.equal(parseStudyPlanDecision(prior).kind, 'eligibility_opt_out');
  assert.equal(studyAttemptStatus(attempt(), '2028-12-01', [prior], id(4)).reduced, false);
  const replacement = { ...prior, kind: 'replaced', replacementLevelIds: [id(6)] };
  assert.deepEqual(parseStudyPlanDecision(replacement).replacementLevelIds, [id(6)]);
});

test('två språk skiljs åt trots samma kod och två försök hålls isär för samma nivå', () => {
  const de = level({ id: id(16), languageCode: 'de', attempts: [attempt({ id: id(17) })] });
  const es = level({ attempts: [attempt(), attempt({ id: id(18) })] });
  assert.notEqual(studyPlanLevelKey(de), studyPlanLevelKey(es));
  assert.equal(parseStudyPlanContent(content({ levels: [es, de] })).levels[0].attempts.length, 2);
  assert.throws(() => parseStudyPlanContent(content({ levels: [es, { ...de, languageCode: 'es' }] })), StudyPlanContractError);
  assert.throws(() => parseStudyPlanContent(content({ levels: [es, { ...de, attempts: [attempt()] }] })), StudyPlanContractError);
});

test('utkast kan bära kompletteringsbehov för fjärrundervisning och oklara val', () => {
  const draft = content({ distanceTeaching: { kind: 'applies', minutes: null }, choices: [
    { id: 'language:1', kind: 'language', label: 'Moderna språk', state: 'unresolved', levelIds: [] },
  ] });
  assert.deepEqual(studyPlanContentIssues(parseStudyPlanContent(draft)), [
    { code: 'distance_teaching_incomplete', field: 'distanceTeaching' }, { code: 'choice_unresolved', field: 'language:1' },
  ]);
});

test('gällande version väljs på giltighetsdatum och därefter rättelsens revisionsnummer', () => {
  const early = snapshot(1), future = snapshot(2, { effectiveOn: '2029-01-01' }), correction = snapshot(3);
  const draft = snapshot(4, { state: 'draft', effectiveOn: null });
  assert.equal(studyPlanAt([early, future, correction, draft], '2026-12-31'), null);
  assert.equal(studyPlanAt([early, future, correction, draft], '2027-01-01'), correction);
  assert.equal(studyPlanAt([early, future, correction, draft], '2029-01-01'), future);
  assert.throws(() => parseStudyPlanSnapshot({ ...early, effectiveOn: '2026-08-22' }), StudyPlanContractError);
});

test('beredningskommando kan bära precisering men saknar behörighet att skicka faktiska datum', () => {
  const command = {
    ...scope, action: 'prepare_draft', commandId: id(20), expectedRevision: 1, expectedSourceToken: sourceToken,
    payload: { dates: [{ levelId: id(4), attemptId: id(5), plannedStart: day('2028-08-21'), plannedEnd: term(2028, 'VT') }], apprenticeship: false },
  };
  assert.deepEqual(parseStudyPlanCommand(command), command);
  assert.throws(() => parseStudyPlanCommand({ ...command, payload: { ...command.payload, actual: {} } }), StudyPlanContractError);
  assert.throws(() => parseStudyPlanCommand({ ...command, expectedSourceToken: id(20) }), StudyPlanContractError);
  assert.throws(() => parseStudyPlanCommand({ ...command, pupilName: 'Synthetic' }), StudyPlanContractError);
});

test('historisk läsning och kvitto är skol- och placeringsbundna och bevarar exakt revision', () => {
  const command = parseStudyPlanCommand({
    ...scope, action: 'make_current', commandId: id(20), expectedRevision: 1,
    expectedSourceToken: sourceToken, payload: { effectiveOn: '2027-01-01' },
  });
  const saved = snapshot(2);
  const receipt = { commandId: id(20), action: command.action, snapshot: saved };
  assert.deepEqual(parseStudyPlanCommandReply({ ...scope, commandId: id(20), status: 'saved', receipt }, command).receipt, receipt);
  assert.throws(() => parseStudyPlanCommandReply({ ...scope, unitId: id(21), commandId: id(20), status: 'saved', receipt }, command), StudyPlanContractError);
  assert.throws(() => parseStudyPlanCommandReply({ ...scope, commandId: id(20), status: 'saved', receipt: { ...receipt, snapshot: snapshot(3) } }, command), StudyPlanContractError);
  const status = parseStudyPlanStatusRequest({ ...scope, commandId: id(20) });
  assert.deepEqual(parseStudyPlanStatusReply({ ...status, receipt }, status).receipt, receipt);
  assert.throws(() => parseStudyPlanStatusReply({ ...status, placementId: id(21), receipt }, status), StudyPlanContractError);
  const request = parseStudyPlanReadRequest({ ...scope, on: '2027-02-01', view: 'history', revision: 2 });
  const answer = { ...scope, on: request.on, view: request.view, history: [historyEntry(saved)], version: saved };
  assert.equal(parseStudyPlanReadReply(answer, request).version.revision, 2);
  assert.throws(() => parseStudyPlanReadReply({ ...answer, pupilId: id(27) }, request), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...answer, roster: [] }, request), StudyPlanContractError);
});

test('läsresultat måste överensstämma med rättelse, framtida giltighet och senaste utkast i historiken', () => {
  const older = snapshot(1), future = snapshot(2, { effectiveOn: '2029-01-01' }), correction = snapshot(3);
  const draft = snapshot(4, { state: 'draft', effectiveOn: null });
  const history = [older, future, correction, draft].map(historyEntry);
  const current = parseStudyPlanReadRequest({ ...scope, view: 'current', on: '2027-06-10' });
  const result = { ...current, history, latestRevision: 4, draft, current: correction, canMakeCurrent: true,
    sourceToken, basisStatus: 'ready', basisIssues: [], availableLevels: [],
    calendar: [{ schoolYear: 2028, htStart: '2028-08-20', htEnd: '2028-12-22', vtStart: '2029-01-14', vtEnd: '2029-06-11' }] };
  assert.deepEqual(parseStudyPlanReadReply(result, current), result);
  assert.throws(() => parseStudyPlanReadReply({ ...result, current: older }, current), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...result, current: future }, current), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...result, current: null }, current), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...result, draft: null }, current), StudyPlanContractError);
  const historical = parseStudyPlanReadRequest({ ...scope, view: 'history', on: '2029-01-01' });
  assert.deepEqual(parseStudyPlanReadReply({ ...historical, history, version: future }, historical).version, future);
  assert.throws(() => parseStudyPlanReadReply({ ...historical, history, version: correction }, historical), StudyPlanContractError);
  const exact = parseStudyPlanReadRequest({ ...historical, revision: 1 });
  assert.throws(() => parseStudyPlanReadReply({ ...historical, history, version: null }, exact), StudyPlanContractError);
});

test('entydiga gruppdatum kan precisera två terminer när klienten begär det', () => {
  const legacy = parseStudyPlanReadRequest({ ...scope, view: 'current', on: '2027-06-10' });
  const request = parseStudyPlanReadRequest({ ...legacy, includeTermDateSuggestions: true });
  assert.equal(request.includeTermDateSuggestions, true);
  assert.throws(() => parseStudyPlanReadRequest({ ...legacy, includeTermDateSuggestions: false }), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadRequest({ ...request, view: 'history' }), StudyPlanContractError);
  const current = snapshot();
  const dates = { levelId: id(4), attemptId: id(5), plannedStart: day('2028-08-24'), plannedEnd: day('2029-06-11') };
  const result = { ...legacy, history: [historyEntry(current)], latestRevision: 1, draft: null, current, canMakeCurrent: true,
    sourceToken, basisStatus: 'ready', basisIssues: [], availableLevels: [], dateSuggestions: [dates] };
  assert.deepEqual(parseStudyPlanReadReply(result, request).dateSuggestions, [dates]);
  assert.throws(() => parseStudyPlanReadReply(result, legacy), StudyPlanContractError);
  for (const plannedStart of [null, day('2028-08-20')]) {
    const mixed = { ...current, content: content({ levels: [level({ attempts: [attempt({ plannedStart })] }), diplomaWork] }) };
    assert.throws(() => parseStudyPlanReadReply({ ...result, current: mixed }, request), StudyPlanContractError);
  }
});

test('jämförelse kräver måltypens egna ID:n och datum med inkluderande semantik', () => {
  const on = '2027-02-01';
  const base = { ...scope, on, view: 'impact' };
  const add = { kind: 'group_add', groupId: id(31), startsOn: on, endsOn: on };
  const move = { kind: 'group_move', membershipId: id(32), toGroupId: id(33) };
  const end = { kind: 'group_end', membershipId: id(32) };
  const classMove = { kind: 'class_move', classId: id(33) };
  for (const target of [add, move, end, classMove]) {
    const request = { ...base, target };
    assert.deepEqual(parseStudyPlanReadRequest(request), request);
  }
  for (const target of [{ ...end, endsOn: on }, { ...add, startsOn: '2027-01-30' }, { ...add, endsOn: '2027-01-31' },
    { ...move, groupId: id(33) }, { kind: 'group_move', toGroupId: id(33) }, { kind: 'class_move', groupId: id(31) }]) {
    assert.throws(() => parseStudyPlanReadRequest({ ...base, target }), StudyPlanContractError);
  }
  const input = parseStudyPlanReadRequest({ ...base, target: move });
  const reply = { ...input, status: 'unavailable', impact: null };
  assert.deepEqual(parseStudyPlanReadReply(reply, input), reply);
  assert.throws(() => parseStudyPlanReadReply({ ...reply, target: end }, input), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...reply, on: '2027-02-02' }, input), StudyPlanContractError);
  assert.throws(() => parseStudyPlanReadReply({ ...reply, pupilName: 'Synthetic' }, input), StudyPlanContractError);
});
