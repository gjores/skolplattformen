import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LASAR_CONTRACT_VERSION,
  LASAR_ERROR_TEXT,
  LASAR_GENERIC_TEXT,
  LASAR_REASONS,
  LASAR_TEXT_REQUIRED,
  LASAR_UNCERTAIN_TEXT,
  LasarContractError,
  lasarCommandRequest,
  lasarDbStatus,
  lasarDecisionRequest,
  lasarErrorText,
  lasarModelStatus,
  lasarPayloadHash,
  lasarSchoolYear,
  parseLasarCommandReply,
  parseLasarCommandRequest,
  parseLasarDecisionReply,
  parseLasarDecisionRequest,
  parseLasarEnvelope,
  parseLasarErrorDetails,
  parseLasarModePreviewReply,
  parseLasarOverviewReply,
  parseLasarOverviewRequest,
  parseLasarReadReply,
  parseLasarReadRequest,
  parseLasarStatusReply,
  parseLasarStatusRequest,
  parseLasarSummaryReply,
  parseLasarSummaryRequest,
  verifyLasarCommandHash,
} from './lasar-contract.ts';
import { LASAR_RULE_CODES } from './lasar-rule-codes.ts';

// Syntetiska ID:n och namn; inga personuppgifter.
const id = (n) => `51a50000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const UNIT = id(3), V1 = id(101), V2 = id(102), FRAME = id(301), CLASS = id(501), OFFERING = id(401), TIMPLAN = id(601);
const HASH = 'sha256:' + 'a'.repeat(64);
const school = { kind: 'school', unitId: UNIT };
const terms = () => ({ ht: { start: '2026-08-17', end: '2026-12-18' }, vt: { start: '2027-01-11', end: '2027-06-11' } });
const capabilities = (over = {}) => ({
  canEdit: true, canSubmit: true, canWithdraw: false, canRequestChange: false, canWithdrawRequest: false, canReturn: false,
  canApprove: false, canReopen: false, canDecline: false, canComment: true, canCreate: [], canPublishFrame: false, canSetMode: false, ...over,
});
const calendar = () => ({
  versionId: V2,
  version: 2,
  status: 'utkast',
  revision: 3,
  terms: terms(),
  exceptions: { '2026-10-26': { kind: 'lovdag', note: 'Höstlov' }, '2026-11-11': { kind: 'studiedag' } },
  groupDays: { [`klass:${CLASS}`]: { '2026-11-12': { cause: 'friluftsdag' } } },
  shortWeeks: { [`arskurs:${OFFERING}:ak1`]: { weekday: 4, reason: 'Särskilda skäl', columnId: 'ak1' } },
  frameVersionId: null,
  contentHash: HASH,
  decidedOn: null,
  history: [{ id: id(201), role: 'rektor', actorName: 'Syntetisk rektor', at: '2026-09-04T08:00:00.000Z', action: 'Förslag skapat', comment: '', version: 2 }],
});
const read = () => ({
  contractVersion: 'lasar_sql_v1',
  target: school,
  schoolYear: 2026,
  schoolName: 'Syntetiska grundskolan',
  schoolTypes: ['GR'],
  mode: 'eget',
  modeLocked: false,
  versions: [
    { versionId: V1, version: 1, status: 'faststalld', decidedOn: '2026-03-18', current: true },
    { versionId: V2, version: 2, status: 'utkast', decidedOn: null, current: false },
  ],
  calendar: calendar(),
  capabilities: capabilities(),
  editableFrom: '2026-11-09',
  changeRequest: { id: id(701), status: 'accepted', reason: 'Ny studiedag i mars.', answer: null, requestedAt: '2026-10-01T09:00:00.000Z', answeredAt: '2026-10-02T09:00:00.000Z' },
  review: [{ id: 'easter:2026-04-06', sourceDate: '2026-04-06', kind: 'lovdag', note: 'Påsklov', reason: 'easter', suggestedDate: '2027-03-29', resolved: false }],
  frame: null,
  groups: [
    { scope: 'arskurs', offeringId: OFFERING, columnId: 'ak1', label: 'Årskurs 1', educationName: 'Grundskola', kind: 'grundskola' },
    { scope: 'klass', classId: CLASS, offeringId: OFFERING, columnId: 'ak1', label: '1A', educationName: 'Grundskola', kind: 'grundskola' },
  ],
  teaching: { classes: [{ classId: CLASS, name: '1A', offeringId: OFFERING, columnId: 'ak1', timplanId: TIMPLAN, timplanVersion: 1, rows: [{ columnId: 'ak1', hours: 720 }] }], imClassIds: [] },
  previousYearAvailable: true,
});
const readRequest = { target: school, schoolYear: 2026, versionId: null };
const rejects = (fn) => assert.throws(fn, (e) => e instanceof LasarContractError);
const rejectsAsync = (p) => assert.rejects(p, (e) => e instanceof LasarContractError);

test('kontraktsversionen är lasar_sql_v1', () => {
  assert.equal(LASAR_CONTRACT_VERSION, 'lasar_sql_v1');
  assert.equal(parseLasarReadReply(read()).contractVersion, 'lasar_sql_v1');
  rejects(() => parseLasarReadReply({ ...read(), contractVersion: 'lasar_sql_v2' }));
});

test('svarskuvertet kräver kontraktsversion och aktör, och aktören jämförs med sessionen', () => {
  const actor = { identityId: id(801), assignmentId: id(802) };
  const env = { contractVersion: 'lasar_sql_v1', actor, result: { ok: true } };
  assert.deepEqual(parseLasarEnvelope(env, actor), { ok: true });
  assert.deepEqual(parseLasarEnvelope(env, { identityId: actor.identityId.toUpperCase(), assignmentId: actor.assignmentId }), { ok: true });
  rejects(() => parseLasarEnvelope({ ...env, extra: 1 }));
  rejects(() => parseLasarEnvelope({ ...env, actor: { ...actor, role: 'huvudman' } }));
  rejects(() => parseLasarEnvelope({ ...env, contractVersion: 'tjanst_sql_v1' }));
  rejects(() => parseLasarEnvelope({ contractVersion: 'lasar_sql_v1', actor }));
  rejects(() => parseLasarEnvelope(env, { identityId: id(803), assignmentId: actor.assignmentId }));
});

test('läsbegäran tolkas för skola och ram; extra fält och namn som id nekas', () => {
  assert.deepEqual(parseLasarReadRequest(readRequest), readRequest);
  assert.deepEqual(parseLasarReadRequest({ target: { kind: 'frame' }, schoolYear: 2026, versionId: V1 }), { target: { kind: 'frame' }, schoolYear: 2026, versionId: V1 });
  rejects(() => parseLasarReadRequest({ ...readRequest, role: 'rektor' }));
  rejects(() => parseLasarReadRequest({ ...readRequest, target: { ...school, role: 'rektor' } }));
  rejects(() => parseLasarReadRequest({ ...readRequest, target: { kind: 'frame', unitId: UNIT } }));
  rejects(() => parseLasarReadRequest({ ...readRequest, target: { kind: 'school', unitId: 'Syntetiska grundskolan' } }));
  rejects(() => parseLasarReadRequest({ target: school, schoolYear: 2026 }));
});

test('läsningen tolkas och mappas till modellens SchoolYear med gruppdagar och korta veckor', () => {
  const reply = parseLasarReadReply(read(), readRequest);
  const sy = lasarSchoolYear(reply);
  assert.equal(sy.id, V2);
  assert.equal(sy.status, 'utkast');
  assert.equal(sy.label, 'Läsåret 2026/27');
  assert.deepEqual(sy.exceptions['2026-10-26'], { kind: 'lovdag', note: 'Höstlov' });
  assert.deepEqual(sy.groupExceptions[`klass:${CLASS}`], { '2026-11-12': { cause: 'friluftsdag' } });
  assert.equal(sy.shortWeeks[`arskurs:${OFFERING}:ak1`].weekday, 4);
  assert.equal(reply.capabilities.canCreate.length, 0);
  assert.equal(reply.editableFrom, '2026-11-09');
  assert.equal(lasarSchoolYear({ ...reply, calendar: null }), null);
  const fixed = read(); fixed.calendar = { ...calendar(), versionId: V1, version: 1, status: 'faststalld', decidedOn: '2026-03-18' };
  assert.equal(lasarSchoolYear(parseLasarReadReply(fixed)).decidedOn, '2026-03-18');
});

test('läsningens svar nekar extra fält på alla nivåer', () => {
  const cases = [
    (r) => { r.role = 'rektor'; },
    (r) => { r.calendar.extra = 1; },
    (r) => { r.capabilities.canSwitchRole = true; },
    (r) => { r.calendar.exceptions['2026-11-11'].cause = 'x'; },
    (r) => { r.calendar.history[0].email = 'x'; },
    (r) => { r.versions[0].label = 'x'; },
    (r) => { r.changeRequest.extra = 1; },
    (r) => { r.review[0].extra = 1; },
    (r) => { r.groups[1].pupils = 24; },
    (r) => { r.teaching.classes[0].pupils = 24; },
    (r) => { r.teaching.extra = []; },
    (r) => { r.calendar.groupDays[`klass:${CLASS}`]['2026-11-12'].extra = 1; },
    (r) => { r.calendar.shortWeeks[`arskurs:${OFFERING}:ak1`].extra = 1; },
    (r) => { r.frame = { current: null, latest: null, acknowledgedVersionId: null, extra: 1 }; },
  ];
  for (const mutate of cases) { const r = read(); mutate(r); rejects(() => parseLasarReadReply(r)); }
});

test('saknade fält, fel urval, okända förmågor och ogiltiga värden nekas', () => {
  const r1 = read(); delete r1.capabilities.canDecline; rejects(() => parseLasarReadReply(r1));
  rejects(() => parseLasarReadReply(read(), { ...readRequest, target: { kind: 'school', unitId: id(4) } }));
  rejects(() => parseLasarReadReply(read(), { ...readRequest, schoolYear: 2027 }));
  rejects(() => parseLasarReadReply(read(), { ...readRequest, versionId: V1 }));
  rejects(() => parseLasarReadReply(read(), { target: { kind: 'frame' }, schoolYear: 2026, versionId: null }));
  const r2 = read(); r2.calendar.exceptions['2026-02-30'] = { kind: 'lovdag' }; rejects(() => parseLasarReadReply(r2));
  const r3 = read(); r3.calendar.exceptions['2026-10-27'] = { kind: 'skoldag' }; rejects(() => parseLasarReadReply(r3));
  const r4 = read(); r4.capabilities.canCreate = ['proposal', 'proposal']; rejects(() => parseLasarReadReply(r4));
  const r5 = read(); r5.capabilities.canCreate = ['import']; rejects(() => parseLasarReadReply(r5));
  const r6 = read(); r6.mode = 'blandat'; rejects(() => parseLasarReadReply(r6));
  const r7 = read(); r7.versions[1].current = true; rejects(() => parseLasarReadReply(r7));
  const r8 = read(); r8.calendar.version = 3; rejects(() => parseLasarReadReply(r8));
  const r9 = read(); r9.calendar.decidedOn = '2026-10-01'; rejects(() => parseLasarReadReply(r9));
  const r10 = read(); r10.calendar.contentHash = 'sha256:xyz'; rejects(() => parseLasarReadReply(r10));
  const r11 = read(); r11.calendar.history[0].role = 'administrator'; rejects(() => parseLasarReadReply(r11));
});

test('grupp-ID byggs bara av stabila UUID:n; namn som grupp-ID nekas (SS 12000)', () => {
  const r1 = read(); r1.calendar.groupDays = { 'klass:1A': { '2026-11-12': { cause: 'friluftsdag' } } }; rejects(() => parseLasarReadReply(r1));
  const r2 = read(); r2.calendar.shortWeeks = { 'arskurs:Grundskola:ak1': { weekday: 4, reason: 'x', columnId: 'ak1' } }; rejects(() => parseLasarReadReply(r2));
  const r3 = read(); r3.groups[1].classId = '1A'; rejects(() => parseLasarReadReply(r3));
  const r4 = read(); r4.teaching.classes[0].classId = '1A'; rejects(() => parseLasarReadReply(r4));
  const r5 = read(); r5.teaching.imClassIds = ['IM-klassen']; rejects(() => parseLasarReadReply(r5));
});

test('status tolkas i databasens ascii-form; modellens namn och okända statusar nekas', () => {
  for (const [db, model] of [['utkast', 'utkast'], ['forslag', 'förslag'], ['atersand', 'återsänd'], ['faststalld', 'fastställd']]) {
    const r = read(); r.calendar.status = db; r.versions[1].status = db;
    if (db === 'faststalld') { r.calendar.decidedOn = '2026-10-01'; r.versions[1].decidedOn = '2026-10-01'; }
    assert.equal(lasarSchoolYear(parseLasarReadReply(r)).status, model);
    assert.equal(lasarModelStatus(db), model);
    assert.equal(lasarDbStatus(model), db);
  }
  for (const status of ['förslag', 'fastställd', 'ersatt', 'FORSLAG', '']) {
    const r = read(); r.calendar.status = status; r.versions[1].status = status; rejects(() => parseLasarReadReply(r));
  }
});

test('payloadHash är stabil och oberoende av nyckelordning', async () => {
  const ops = [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }];
  // Handskriven kanonisk form: [prefix, ops] med nycklarna dates, kind, op i byteordning.
  const canonical = 'a2:s16:lasar_payload_v1a1:o3:s5:datesa1:s10:2026-10-07s4:kinds6:lovdags2:ops8:set_days';
  const expected = 'sha256:' + createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
  assert.equal(await lasarPayloadHash(ops), expected);
  assert.equal(await lasarPayloadHash([{ kind: 'lovdag', dates: ['2026-10-07'], op: 'set_days' }]), expected);
  assert.notEqual(await lasarPayloadHash([{ op: 'set_days', dates: ['2026-10-08'], kind: 'lovdag' }]), expected);
});

test('hashvektorer för terminskant, veckodag och skapande', async () => {
  const sha = (s) => 'sha256:' + createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
  assert.equal(await lasarPayloadHash([{ op: 'set_term', term: 'ht', edge: 'end', date: '2026-12-21' }]),
    sha('a2:s16:lasar_payload_v1a1:o4:s4:dates10:2026-12-21s4:edges3:ends2:ops8:set_terms4:terms2:ht'));
  assert.equal(await lasarPayloadHash([{ op: 'set_short_week', groupId: `arskurs:${OFFERING}:ak1`, columnId: 'ak1', weekday: 4, reason: 'Skäl' }]),
    sha(`a2:s16:lasar_payload_v1a1:o5:s8:columnIds3:ak1s7:groupIds48:arskurs:${OFFERING}:ak1s2:ops14:set_short_weeks6:reasons5:Skäls7:weekdayi4;`));
  assert.equal(await lasarPayloadHash([{ op: 'create', source: 'copy' }]), sha('a2:s16:lasar_payload_v1a1:o2:s2:ops6:creates6:sources4:copy'));
});

test('alla kommandotyper tolkas, och varje typ nekar extra fält', async () => {
  const all = [
    { op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag', note: 'Höstlov' },
    { op: 'set_notes', dates: ['2026-10-26'], note: 'Höstlov' },
    { op: 'set_notes', dates: ['2026-10-26'] },
    { op: 'set_term', term: 'vt', edge: 'end', date: '2027-06-10' },
    { op: 'set_group_days', groupId: `klass:${CLASS}`, dates: ['2026-11-12'], cause: 'annat', note: 'Temadag' },
    { op: 'clear_group_days', groupId: `klass:${CLASS}`, dates: ['2026-11-12'] },
    { op: 'set_short_week', groupId: `arskurs:${OFFERING}:ak1`, columnId: 'ak1', weekday: 4, reason: 'Skäl' },
    { op: 'clear_short_week', groupId: `arskurs:${OFFERING}:ak1` },
  ];
  const request = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: all });
  assert.deepEqual((await verifyLasarCommandHash(JSON.parse(JSON.stringify(request)))).ops, all);
  for (const op of all) rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...op, extra: 1 }] }));
  const single = [
    { op: 'reset_to_proposal' },
    { op: 'resolve_review', itemId: 'easter:2026-04-06', resolution: 'dismissed' },
    { op: 'take_frame_changes', frameVersionId: FRAME, accepted: ['day:2026-10-26', 'term:ht:start'] },
    { op: 'keep_school_calendar', frameVersionId: FRAME },
    { op: 'comment', text: 'Syntetisk kommentar.' },
  ];
  for (const op of single) {
    const r = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [op] });
    assert.deepEqual(parseLasarCommandRequest(r).ops, [op]);
    rejects(() => parseLasarCommandRequest({ ...r, ops: [{ ...op, extra: 1 }] }));
    // Uttryckliga kommandon står ensamma.
    await rejectsAsync(lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [op, all[0]] }));
  }
  const created = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'proposal' }] });
  assert.equal(parseLasarCommandRequest(created).versionId, null);
  await rejectsAsync(lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [{ op: 'create', source: 'proposal' }] }));
  await rejectsAsync(lasarCommandRequest({ target: school, schoolYear: 2026, versionId: null, expectedRevision: null, ops: all.slice(0, 1) }));
  await rejectsAsync(lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [{ op: 'set_group_days', groupId: 'klass:1A', dates: ['2026-11-12'], cause: 'friluftsdag' }] }));
  await rejectsAsync(lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [{ op: 'comment', text: '' }] }));
});

test('kommandot byggs med kommando-id, förväntad revision och payloadHash och tolkas strikt', async () => {
  const ops = [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }];
  const request = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops });
  assert.match(request.commandId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(request.expectedRevision, 3);
  assert.equal(request.payloadHash, await lasarPayloadHash(ops));
  assert.deepEqual(await verifyLasarCommandHash(JSON.parse(JSON.stringify(request))), request);
  rejects(() => parseLasarCommandRequest({ ...request, role: 'rektor' }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], dates: ['2026-10-08', '2026-10-07'] }] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], kind: 'helgdag' }] }));
  rejects(() => parseLasarCommandRequest({ ...request, ops: [{ ...ops[0], kind: 'skoldag', note: 'x' }] }));
  await rejectsAsync(verifyLasarCommandHash({ ...request, ops: [{ ...ops[0], kind: 'studiedag' }] }));
});

test('kommandots svar måste gälla samma kommando och version med ny revision', async () => {
  const request = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3, ops: [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }] });
  const detail = read(); detail.calendar.revision = 4;
  const ok = { receipt: { commandId: request.commandId, revision: 4, replayed: false }, detail };
  assert.equal(parseLasarCommandReply(ok, request).receipt.revision, 4);
  rejects(() => parseLasarCommandReply({ ...ok, extra: true }, request));
  rejects(() => parseLasarCommandReply({ ...ok, receipt: { ...ok.receipt, commandId: id(999) } }, request));
  rejects(() => parseLasarCommandReply({ ...ok, receipt: { ...ok.receipt, revision: 3 } }, request));
  const stale = read(); stale.calendar.revision = 3;
  rejects(() => parseLasarCommandReply({ receipt: { ...ok.receipt, revision: 3 }, detail: stale }, request));
  const created = await lasarCommandRequest({ target: school, schoolYear: 2026, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'proposal' }] });
  const first = read(); first.calendar.revision = 1;
  assert.equal(parseLasarCommandReply({ receipt: { commandId: created.commandId, revision: 1, replayed: false }, detail: first }, created).detail.calendar.versionId, V2);
});

test('beslut kräver text där UI-SPEC kräver det och tolkas strikt', () => {
  const base = { target: school, schoolYear: 2026, versionId: V2, expectedRevision: 3 };
  for (const [action, text] of Object.entries(LASAR_TEXT_REQUIRED)) {
    if (text === null) continue;
    assert.throws(() => lasarDecisionRequest({ ...base, action, text: '  ' }), (e) => e instanceof LasarContractError && e.reason === 'lasar_text_required');
  }
  assert.deepEqual(Object.entries(LASAR_TEXT_REQUIRED).filter(([, t]) => t).map(([a]) => a).sort(), ['approve', 'decline_request', 'reopen', 'request_change', 'return', 'submit']);
  const submit = lasarDecisionRequest({ ...base, action: 'submit', text: ' Förslag för syntetisk skola. ' });
  assert.equal(submit.text, 'Förslag för syntetisk skola.');
  assert.deepEqual(parseLasarDecisionRequest(JSON.parse(JSON.stringify(submit))), submit);
  rejects(() => parseLasarDecisionRequest({ ...submit, role: 'huvudman' }));
  rejects(() => parseLasarDecisionRequest({ ...submit, action: 'switch_role' }));
  assert.equal(lasarDecisionRequest({ ...base, action: 'withdraw', text: '' }).text, '');
  const mode = lasarDecisionRequest({ target: { kind: 'frame' }, schoolYear: 2027, versionId: null, expectedRevision: null, action: 'set_mode', text: '', mode: 'ram', confirmAffected: [UNIT] });
  assert.deepEqual(parseLasarDecisionRequest(mode).confirmAffected, [UNIT]);
  rejects(() => lasarDecisionRequest({ ...base, action: 'set_mode', text: '', mode: 'ram' }));
  rejects(() => lasarDecisionRequest({ ...base, action: 'submit', text: 'x', confirmAffected: [UNIT] }));
  rejects(() => lasarDecisionRequest({ ...base, action: 'publish_frame', text: '' }));
});

test('beslutets svar: samma kommando; öppna för ändring ger en ny version', () => {
  const base = { target: school, schoolYear: 2026, versionId: V1, expectedRevision: 5 };
  const reopen = lasarDecisionRequest({ ...base, action: 'reopen', text: 'Ny studiedag.' });
  const detail = read();
  assert.equal(parseLasarDecisionReply({ receipt: { commandId: reopen.commandId, revision: 3, replayed: false }, detail }, reopen).detail.calendar.version, 2);
  const submit = lasarDecisionRequest({ ...base, versionId: V2, expectedRevision: 3, action: 'submit', text: 'Förslag.' });
  const d2 = read(); d2.calendar.revision = 4; d2.calendar.status = 'forslag'; d2.versions[1].status = 'forslag';
  assert.equal(parseLasarDecisionReply({ receipt: { commandId: submit.commandId, revision: 4, replayed: false }, detail: d2 }, submit).receipt.revision, 4);
  rejects(() => parseLasarDecisionReply({ receipt: { commandId: id(999), revision: 4, replayed: false }, detail: d2 }, submit));
  rejects(() => parseLasarDecisionReply({ receipt: { commandId: submit.commandId, revision: 3, replayed: false }, detail: d2 }, submit));
  rejects(() => parseLasarDecisionReply({ receipt: { commandId: submit.commandId, revision: 4, replayed: false }, detail: d2, extra: 1 }, submit));
  const preview = { contractVersion: 'lasar_sql_v1', schoolYear: 2027, mode: 'ram', affected: [{ unitId: UNIT, schoolName: 'Syntetiska grundskolan', status: 'utkast' }] };
  assert.equal(parseLasarModePreviewReply(preview).affected.length, 1);
  rejects(() => parseLasarModePreviewReply({ ...preview, affected: [{ ...preview.affected[0], pupils: 1 }] }));
});

test('status, överblick och sammanfattning tolkas strikt', () => {
  assert.deepEqual(parseLasarStatusRequest({ target: school, schoolYear: 2026 }), { target: school, schoolYear: 2026 });
  rejects(() => parseLasarStatusRequest({ target: school, schoolYear: 2026, extra: 1 }));
  const status = { contractVersion: 'lasar_sql_v1', target: school, schoolYear: 2026, calendar: { versionId: V2, version: 2, status: 'forslag', revision: 4, contentHash: HASH }, current: { versionId: V1, version: 1, decidedOn: '2026-03-18' } };
  assert.equal(parseLasarStatusReply(status, { target: school, schoolYear: 2026 }).calendar.status, 'forslag');
  rejects(() => parseLasarStatusReply({ ...status, calendar: { ...status.calendar, extra: 1 } }));
  rejects(() => parseLasarStatusReply(status, { target: school, schoolYear: 2027 }));

  assert.deepEqual(parseLasarOverviewRequest({ schoolYear: 2026 }), { schoolYear: 2026 });
  rejects(() => parseLasarOverviewRequest({ schoolYear: 2026, unitId: UNIT }));
  const row = { unitId: UNIT, schoolName: 'Syntetiska grundskolan', status: 'forslag', versions: read().versions, frameChanged: false, changeRequested: true, waitingFor: 'huvudman' };
  const overview = { contractVersion: 'lasar_sql_v1', schoolYear: 2026, mode: 'ram', frame: { status: 'utgiven', version: 2 }, schools: [row, { ...row, unitId: id(4), status: null, versions: [], changeRequested: false, waitingFor: 'rektor' }] };
  assert.equal(parseLasarOverviewReply(overview).schools.length, 2);
  rejects(() => parseLasarOverviewReply({ ...overview, schools: [row, row] }));
  rejects(() => parseLasarOverviewReply({ ...overview, schools: [{ ...row, pupils: 1 }] }));
  rejects(() => parseLasarOverviewReply({ ...overview, frame: { status: 'fastställd', version: 2 } }));

  assert.deepEqual(parseLasarSummaryRequest({ unitId: UNIT, schoolYear: 2026 }), { unitId: UNIT, schoolYear: 2026 });
  const stat = { version: 1, decidedOn: '2026-03-18', htSchoolDays: 84, vtSchoolDays: 95, contentHash: HASH };
  const summary = { contractVersion: 'lasar_sql_v1', unitId: UNIT, schoolYear: 2026, current: { ...stat, version: 2 }, previous: stat };
  assert.equal(parseLasarSummaryReply(summary, { unitId: UNIT, schoolYear: 2026 }).previous.htSchoolDays, 84);
  rejects(() => parseLasarSummaryReply({ ...summary, current: { ...stat, extra: 1 } }));
  rejects(() => parseLasarSummaryReply(summary, { unitId: id(4), schoolYear: 2026 }));
});

test('varje felorsak har en text, och regelnekandet bär bara kända regelkoder', () => {
  assert.equal(LASAR_REASONS.length, 12);
  const ctx = { status: 'fastställd', editableFrom: '2026-11-09', action: 'submit', reviewOpen: 2, schoolYear: 2026 };
  for (const reason of LASAR_REASONS) {
    assert.equal(typeof LASAR_ERROR_TEXT[reason], 'function', reason);
    const text = lasarErrorText(reason, ctx);
    assert.ok(text.trim().length > 10, reason);
    assert.equal(lasarErrorText(reason, {}).trim().length > 10, true, reason);
  }
  // Ordagrant med UI-SPEC avsnitt 13.
  assert.equal(lasarErrorText('lasar_forbidden', {}), 'Du har inte behörighet att ändra den här kalendern. Kalendern har lästs om.');
  assert.equal(lasarErrorText('lasar_revision_conflict', {}), 'Kalendern ändrades av någon annan. Den har lästs om och din senaste ändring sparades inte. Gör om ändringen om den fortfarande behövs.');
  assert.equal(lasarErrorText('lasar_locked_status', { status: 'fastställd' }), 'Kalendern är fastställd och kan inte ändras. Begär ändring för att få en ny version.');
  assert.equal(lasarErrorText('lasar_locked_status', { status: 'förslag' }), 'Kalendern är skickad och kan inte ändras. Ta tillbaka förslaget för att ändra.');
  assert.equal(lasarErrorText('lasar_past_day', { editableFrom: '2026-11-09' }), 'Passerade dagar kan inte ändras. Dagar från och med 9 november 2026 kan ändras i den nya versionen.');
  assert.equal(lasarErrorText('lasar_rules_failed', { action: 'submit' }), 'Förslaget kunde inte skickas:');
  assert.equal(lasarErrorText('lasar_rules_failed', { action: 'approve' }), 'Kalendern kunde inte fastställas:');
  assert.equal(LASAR_UNCERTAIN_TEXT, 'Det gick inte att bekräfta att ändringen sparades. Kalendern har lästs om. Kontrollera dagen.');
  assert.ok(!/lasar_|sql|hint/i.test(LASAR_GENERIC_TEXT));

  assert.deepEqual(parseLasarErrorDetails({ reason: 'lasar_past_day' }), { reason: 'lasar_past_day' });
  assert.deepEqual(parseLasarErrorDetails({ reason: 'lasar_rules_failed', rules: ['school_days_min', 'holidays_min'] }).rules, ['school_days_min', 'holidays_min']);
  assert.ok(Object.keys(LASAR_RULE_CODES).includes('group_days_min'));
  rejects(() => parseLasarErrorDetails({ reason: 'lasar_rules_failed', rules: ['okand_regel'] }));
  rejects(() => parseLasarErrorDetails({ reason: 'lasar_rules_failed', rules: [] }));
  rejects(() => parseLasarErrorDetails({ reason: 'lasar_past_day', rules: ['school_days_min'] }));
  rejects(() => parseLasarErrorDetails({ reason: 'tjanst_invalid' }));
  rejects(() => parseLasarErrorDetails({ reason: 'lasar_forbidden', message: 'SQL-fel' }));
});
