import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TjanstContractError, createPlanCommand, parseCommandRef, parsePersonalCommand, parsePersonalCommandReply, parsePersonalReadReply,
  parsePlanCommand, parsePlanCommandReply, parsePlanReadReply, parseYearPlanReadReply, parseSelfCommand, parseSelfCommandReply, parseSelfReadReply,
  parseStaffingReadReply, parseStatusReply, parseTjanstSourceKey, planCommandRef, selfCommandRef, tjanstCanonicalSerialize,
  tjanstHashCanonical, tjanstPayloadHash, tjanstSourceKey, verifyPlanCommandHash } from './tjanst-contract.ts';

const uid = n => `51a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = c => `sha256:${c.repeat(64)}`;
const unit = uid(1), year = 2026, classId = uid(10), person = uid(20), rowKey = 'programmeSpecific:BYGG:1:BYGG1000X';
const key = `class_timplan:${classId}:${year}:${rowKey}`;
const rejects = (fn, reason) => assert.throws(fn, e => e instanceof TjanstContractError && (reason === undefined || e.reason === reason));
const saveRow = (extra = {}) => ({ rowId: null, sourceKind: 'class_timplan', sourceKey: key, personId: person, teacherHt: 3000, teacherVt: 3000, comment: '', ...extra });
const command = (action, payload, extra = {}) => ({ commandId: uid(40), unitId: unit, schoolYear: year, action, expectedRevision: 3, payloadHash: hash('a'), payload, ...extra });
const version = (extra = {}) => ({ id: uid(50), versionNo: 1, status: 'draft', contentHash: hash('c'), basedOnVersionId: null, publishedByName: null, publishedAt: null, ...extra });
const row = (id, extra = {}) => ({ id: uid(id), lineageId: uid(id + 100), sourceKind: 'class_timplan', sourceKey: key, classId, rowKey, personId: person,
  teacherHt: 3000, teacherVt: 3000, needHt: 3000, needVt: 3000, needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const read = (extra = {}) => ({ contractVersion: 'tjanst_v1', unitId: unit, schoolName: 'Syntetiska gymnasiet', schoolYear: year, revision: 4,
  version: version(), versions: [version()], teachers: [{ personId: person, displayName: 'Syntetisk Lärare', draft: false, shareHere: 60 }],
  classes: [{ classId, name: 'BA26A', link: { linkRevision: 0, timplanId: uid(11), seriesId: uid(12), seriesName: 'Bygg 2026', timplanVersion: 1, column: 'ar1', schoolform: 'gymnasium' },
    needs: [{ sourceKind: 'class_timplan', sourceKey: key, rowKey, label: 'Bygg och anläggning 1', needHt: 3000, needVt: 3000, needBasis: 'terms' }] }],
  rows: [row(30)], specials: [], joints: [], actions: ['save_row', 'publish'], blockers: [], capabilities: { canEdit: true, canPublish: true, canReadHistory: true }, ...extra });

test('explicit year detail decoder accepts continuous actions without weakening legacy ingress', () => {
  const expected = { unitId: unit, schoolYear: year };
  const current = read({ actions: ['add_teacher', 'remove_teacher', 'save_row', 'delete_row', 'save_special', 'delete_special', 'save_joint',
    'dissolve_joint', 'discard_draft', 'publish', 'move', 'bulk'] });
  assert.deepEqual(parseYearPlanReadReply(current, expected).actions, current.actions);
  rejects(() => parsePlanReadReply(current, expected));
  const legacy = read({ actions: ['create_draft'], capabilities: { canEdit: false, canPublish: false, canReadHistory: true } });
  assert.deepEqual(parsePlanReadReply(legacy, expected).actions, ['create_draft']);
  rejects(() => parseYearPlanReadReply(legacy, expected));
  for (const actions of [['unknown'], ['save_row', 'save_row'], ['bulk', 'create_draft']]) rejects(() => parseYearPlanReadReply(read({ actions }), expected));
});

test('year detail permits editing current published or unstarted plans but cannot publish them or edit history', () => {
  const expected = { unitId: unit, schoolYear: year }, caps = { canEdit: true, canPublish: false, canReadHistory: true };
  const published = version({ status: 'published', publishedByName: 'Rektor', publishedAt: '2026-09-01T10:00:00.000Z' });
  const current = read({ version: published, versions: [published], actions: ['save_row', 'move', 'bulk', 'remove_teacher'], capabilities: caps });
  assert.equal(parseYearPlanReadReply(current, expected).capabilities.canEdit, true);
  rejects(() => parsePlanReadReply(current, expected));
  const unstarted = read({ version: null, versions: [], teachers: [], rows: [], actions: ['save_row', 'bulk'], capabilities: caps });
  assert.equal(parseYearPlanReadReply(unstarted, expected).version, null);
  for (const value of [current, unstarted]) {
    rejects(() => parseYearPlanReadReply({ ...value, actions: [...value.actions, 'publish'], capabilities: { ...caps, canPublish: true } }, expected));
    rejects(() => parseYearPlanReadReply({ ...value, actions: ['discard_draft'] }, expected));
    rejects(() => parseYearPlanReadReply({ ...value, capabilities: { ...caps, canEdit: false } }, expected));
  }
  rejects(() => parseYearPlanReadReply(current, { ...expected, versionId: published.id }));
  const history = { ...current, actions: [], capabilities: { ...caps, canEdit: false } };
  assert.equal(parseYearPlanReadReply(history, { ...expected, versionId: published.id }).actions.length, 0);
  rejects(() => parseYearPlanReadReply(history, { ...expected, versionId: uid(90) }), 'wrong_scope');
  for (const status of ['superseded', 'discarded']) rejects(() => parseYearPlanReadReply({ ...current, version: { ...published, status } }, expected));
  rejects(() => parseYearPlanReadReply(read({ actions: ['save_row'] }), expected));
  rejects(() => parseYearPlanReadReply(read({ capabilities: caps }), expected));
});

test('year detail reuses strict full data validation instead of trimming actions or projection fields', () => {
  const expected = { unitId: unit, schoolYear: year };
  for (const value of [read({ extra: true }), read({ unitId: uid(90) }), read({ schoolYear: 2027 }),
    read({ rows: [row(30, { personId: uid(90) })] }), read({ rows: [row(30, { jointGroupId: uid(90) })] }),
    read({ rows: [row(30), row(31)] }), read({ capabilities: { canEdit: true, canPublish: true, canReadHistory: true, canCreateDraft: true } })]) {
    rejects(() => parseYearPlanReadReply(value, expected));
  }
  const unlinked = read(); unlinked.classes[0].link = null;
  rejects(() => parseYearPlanReadReply(unlinked, expected));
});

test('sourceKey byggs kanoniskt och prövas tillbaka; annan källtyp eller form nekas', () => {
  assert.equal(tjanstSourceKey({ classId, schoolYear: year, timplanRowKey: rowKey }), key);
  assert.deepEqual(parseTjanstSourceKey('class_timplan', key), { sourceKind: 'class_timplan', classId, schoolYear: year, rowKey });
  rejects(() => parseTjanstSourceKey('course_offering', key), 'tjanst_unknown_source');
  rejects(() => parseTjanstSourceKey('class_timplan', key.toUpperCase()), 'tjanst_unknown_source');
  rejects(() => parseTjanstSourceKey('class_timplan', `class_timplan:${classId}:26:${rowKey}`), 'tjanst_unknown_source');
});

test('parsePlanCommand(save_row) godtar exakt nycklarna och nekar okänd nyckel, negativ tid och båda terminer 0', () => {
  assert.deepEqual(parsePlanCommand(command('save_row', saveRow())).payload, saveRow());
  rejects(() => parsePlanCommand(command('save_row', { ...saveRow(), workingHours: 1600 })));
  rejects(() => parsePlanCommand(command('save_row', { ...saveRow(), extra: 1 })));
  rejects(() => parsePlanCommand(command('save_row', saveRow({ teacherHt: -60 }))));
  rejects(() => parsePlanCommand(command('save_row', saveRow({ teacherHt: 0, teacherVt: 0 }))));
  rejects(() => parsePlanCommand(command('save_row', saveRow({ teacherHt: 1.5 }))));
  rejects(() => parsePlanCommand(command('save_row', saveRow({ teacherVt: 200001 }))));
  rejects(() => parsePlanCommand({ ...command('save_row', saveRow()), assessment: 'x' }));
  rejects(() => parsePlanCommand(command('save_row', saveRow({ comment: 'x'.repeat(2001) }))), 'tjanst_comment_too_long');
  assert.equal(parsePlanCommand(command('save_row', saveRow({ comment: 'å'.repeat(2000) }))).payload.comment.length, 2000);
});

test('publish kräver expectedContentHash; andra åtgärder får inte bära det', () => {
  assert.equal(parsePlanCommand(command('publish', {}, { expectedContentHash: hash('b') })).expectedContentHash, hash('b'));
  rejects(() => parsePlanCommand(command('publish', {})));
  rejects(() => parsePlanCommand(command('save_row', saveRow(), { expectedContentHash: hash('b') })));
  rejects(() => parsePlanCommand(command('rename_plan', {})));
});

test('specialuppdrag: klass bara för mentor; samläsning kräver minst två unika rader', () => {
  const special = { specialId: null, kind: 'mentor', label: 'Mentor BA26A', personId: person, classId, ht: 1200, vt: 1200, comment: '' };
  assert.equal(parsePlanCommand(command('save_special', special)).payload.classId, classId);
  rejects(() => parsePlanCommand(command('save_special', { ...special, kind: 'programansvar' })));
  assert.equal(parsePlanCommand(command('save_special', { ...special, kind: 'programansvar', classId: null })).payload.classId, null);
  const joint = { jointId: null, name: 'Samläsning', rowIds: [uid(31), uid(32)], teachers: [{ personId: person, ht: 1800, vt: 1800 }] };
  assert.deepEqual(parsePlanCommand(command('save_joint', joint)).payload.rowIds, [uid(31), uid(32)]);
  rejects(() => parsePlanCommand(command('save_joint', { ...joint, rowIds: [uid(31)] })), 'tjanst_joint_too_few');
  rejects(() => parsePlanCommand(command('save_joint', { ...joint, rowIds: [uid(31), uid(31)] })), 'tjanst_duplicate_row');
});

test('payloadHash binder åtgärd och exakt payload', async () => {
  const built = await createPlanCommand({ commandId: uid(40), unitId: unit, schoolYear: year, action: 'save_row', expectedRevision: 3, payload: saveRow() });
  assert.equal(built.payloadHash, await tjanstPayloadHash('save_row', saveRow()));
  assert.equal((await verifyPlanCommandHash(built)).payloadHash, built.payloadHash);
  await assert.rejects(verifyPlanCommandHash({ ...built, payload: saveRow({ teacherHt: 3060 }) }), e => e.reason === 'tjanst_payload_hash');
});

test('tjanstHashCanonical ger samma hex som vektorerna i phase51_tjanst_hash_vectors.json', async () => {
  const file = JSON.parse(readFileSync(new URL('../../supabase/tests/phase51_tjanst_hash_vectors.json', import.meta.url), 'utf8'));
  assert.ok(file.vectors.length >= 10);
  for (const v of file.vectors) {
    assert.equal(tjanstCanonicalSerialize(v.input), v.canonical, v.name);
    assert.equal(await tjanstHashCanonical(v.input), v.sha256, v.name);
    assert.equal('sha256:' + createHash('sha256').update(Buffer.from(v.canonical, 'utf8')).digest('hex'), v.sha256, v.name);
  }
  const byName = Object.fromEntries(file.vectors.map(v => [v.name, v.sha256]));
  assert.equal(byName['nycklar i omvänd ordning'], byName.save_row);
});

test('kanonisk form: objektnycklar sorteras på UTF-8-byte, flyttal och ensamma surrogat nekas', () => {
  assert.equal(tjanstCanonicalSerialize({ b: 1, a: 'å' }), 'o2:s1:as2:ås1:bi1;');
  assert.equal(tjanstCanonicalSerialize({ Z: null, a: null }), 'o2:s1:Zns1:an');
  rejects(() => tjanstCanonicalSerialize(1.5));
  rejects(() => tjanstCanonicalSerialize('\ud800'));
});

test('parsePlanReadReply godtar ett slutet svar och nekar fel skola, dubbelrad och okopplad klass med behov', () => {
  const parsed = parsePlanReadReply(read(), { unitId: unit, schoolYear: year });
  assert.equal(parsed.rows[0].needHt, 3000); assert.equal(parsed.classes[0].link.column, 'ar1');
  rejects(() => parsePlanReadReply(read(), { unitId: uid(2), schoolYear: year }), 'wrong_scope');
  rejects(() => parsePlanReadReply(read({ rows: [row(30), row(31)] }), { unitId: unit, schoolYear: year }), 'tjanst_duplicate_row');
  assert.equal(parsePlanReadReply(read({ rows: [row(30), row(31, { personId: null })] }), { unitId: unit, schoolYear: year }).rows.length, 2);
  const unlinked = read(); unlinked.classes[0].link = null;
  rejects(() => parsePlanReadReply(unlinked, { unitId: unit, schoolYear: year }));
  rejects(() => parsePlanReadReply(read({ rows: [row(30, { personId: uid(99) })] }), { unitId: unit, schoolYear: year }));
  rejects(() => parsePlanReadReply({ ...read(), contract: 'avtal' }, { unitId: unit, schoolYear: year }));
});

test('tjänsteraden kräver lagrad lärartid; timplanens timmar blir aldrig lärartid', () => {
  const { teacherHt, teacherVt, ...withoutTeacher } = row(30); void teacherHt; void teacherVt;
  rejects(() => parsePlanReadReply(read({ rows: [withoutTeacher] }), { unitId: unit, schoolYear: year }));
  rejects(() => parsePlanCommand(command('save_row', { rowId: null, sourceKind: 'class_timplan', sourceKey: key, personId: person, comment: '' })));
  const unknown = parsePlanReadReply(read({ rows: [row(30, { needHt: null, needVt: null })] }), { unitId: unit, schoolYear: year });
  assert.equal(unknown.rows[0].needHt, null); assert.equal(unknown.rows[0].teacherHt, 3000);
});

test('parsePlanCommandReply nekar svar vars revision inte är expectedRevision + 1', () => {
  const q = command('save_row', saveRow());
  const receipt = (revision, extra = {}) => ({ commandId: uid(40), action: 'save_row', versionId: uid(50), revision, contentHash: hash('c'), replayed: false, changed: true, ...extra });
  assert.equal(parsePlanCommandReply({ receipt: receipt(4), detail: read() }, q).receipt.revision, 4);
  rejects(() => parsePlanCommandReply({ receipt: receipt(5), detail: read({ revision: 5 }) }, q), 'tjanst_revision_conflict');
  rejects(() => parsePlanCommandReply({ receipt: receipt(3), detail: read() }, q), 'tjanst_revision_conflict');
  rejects(() => parsePlanCommandReply({ receipt: receipt(4, { commandId: uid(41) }), detail: read() }, q), 'tjanst_revision_conflict');
  rejects(() => parsePlanCommandReply({ receipt: receipt(4), detail: read({ revision: 3 }) }, q), 'tjanst_revision_conflict');
});

test('äldre publicerad version läses skrivskyddat med versionId (D-24)', () => {
  const old = version({ id: uid(51), status: 'superseded', publishedByName: 'Syntetisk Rektor', publishedAt: '2026-08-20T08:00:00.000Z' });
  const reply = read({ version: old, versions: [old, version()], actions: [], capabilities: { canEdit: false, canPublish: false, canReadHistory: true } });
  assert.equal(parsePlanReadReply(reply, { unitId: unit, schoolYear: year, versionId: uid(51) }).version.status, 'superseded');
  rejects(() => parsePlanReadReply({ ...reply, capabilities: { canEdit: true, canPublish: false, canReadHistory: true } }, { unitId: unit, schoolYear: year, versionId: uid(51) }));
  rejects(() => parsePlanReadReply(reply, { unitId: unit, schoolYear: year, versionId: uid(52) }), 'wrong_scope');
});

const personBody = (extra = {}) => ({ id: person, givenName: 'Syntetisk', familyName: 'Lärare', externalId: null, externalIdSource: null, status: 'active',
  proposedForUnitId: null, draftNote: null, revision: 1, employments: [], duties: [], ...extra });
const duty = (id, unitId, pct) => ({ id: uid(id), unitId, schoolName: 'Syntetisk skola', percent: pct, startsOn: '2026-08-01', endsOn: null });

test('personal: rektorns läsning har bara egen skolas andel och inga anställningar (D-11)', () => {
  const unitRead = (people, caps = { canManage: false, canCreateDraft: true }) => ({ contractVersion: 'tjanst_v1', scope: 'unit', unitId: unit, people, actions: ['create_draft_teacher'], blockers: [], capabilities: caps });
  assert.equal(parsePersonalReadReply(unitRead([personBody({ duties: [duty(61, unit, 60)] })]), { unitId: unit }).people[0].duties[0].percent, 60);
  rejects(() => parsePersonalReadReply(unitRead([personBody({ duties: [duty(61, unit, 60), duty(62, uid(2), 40)] })]), { unitId: unit }), 'wrong_scope');
  const employment = { id: uid(60), percent: 100, startsOn: '2026-08-01', endsOn: null, duties: [duty(61, unit, 60)] };
  rejects(() => parsePersonalReadReply(unitRead([personBody({ employments: [employment], duties: [duty(61, unit, 60)] })]), { unitId: unit }), 'wrong_scope');
  rejects(() => parsePersonalReadReply(unitRead([], { canManage: true, canCreateDraft: true }), { unitId: unit }));
  const hm = { contractVersion: 'tjanst_v1', scope: 'organizer', unitId: null, actions: ['create_person', 'save_employment', 'save_duties'], blockers: [], capabilities: { canManage: true, canCreateDraft: false },
    people: [personBody({ employments: [{ ...employment, duties: [duty(61, unit, 60), duty(62, uid(2), 40)] }], duties: [duty(61, unit, 60), duty(62, uid(2), 40)], account: true })] };
  assert.equal(parsePersonalReadReply(hm, {}).people[0].employments[0].duties.length, 2);
  assert.equal(parsePersonalReadReply(hm, {}).people[0].account, true);
  // Kontouppgiften finns bara i huvudmannens läsning: den krävs där och nekas i rektorns läsning (D-11).
  { const { account: _omitted, ...withoutAccount } = hm.people[0]; void _omitted; rejects(() => parsePersonalReadReply({ ...hm, people: [withoutAccount] }, {})); }
  rejects(() => parsePersonalReadReply({ ...hm, people: [{ ...hm.people[0], account: 'ja' }] }, {}));
  rejects(() => parsePersonalReadReply(unitRead([personBody({ duties: [duty(61, unit, 60)], account: false })]), { unitId: unit }), 'wrong_scope');
  rejects(() => parsePersonalReadReply({ ...hm, people: [personBody({ ssn: '19900101-1234' })] }, {}));
});

test('personal: kommandon är slutna, procent i heltal 1–100 och skapande kräver revision 0', () => {
  const create = { commandId: uid(40), action: 'create_person', expectedRevision: 0, payload: { givenName: 'Syntetisk', familyName: 'Lärare', externalId: null, externalIdSource: null } };
  assert.equal(parsePersonalCommand(create).payload.givenName, 'Syntetisk');
  rejects(() => parsePersonalCommand({ ...create, expectedRevision: 1 }), 'tjanst_revision_conflict');
  rejects(() => parsePersonalCommand({ ...create, payload: { ...create.payload, personalNumber: 'x' } }));
  rejects(() => parsePersonalCommand({ ...create, payload: { ...create.payload, externalId: 'abc' } }));
  const duties = d => ({ commandId: uid(40), action: 'save_duties', expectedRevision: 2, payload: { personId: person, employmentId: uid(60), duties: d } });
  const input = (pct, u = unit) => ({ dutyId: null, unitId: u, percent: pct, startsOn: '2026-08-01', endsOn: null });
  assert.equal(parsePersonalCommand(duties([input(60), input(40, uid(2))])).payload.duties.length, 2);
  rejects(() => parsePersonalCommand(duties([input(60.5)])));
  rejects(() => parsePersonalCommand(duties([input(0)])));
  rejects(() => parsePersonalCommand(duties([input(101)])));
  const reply = (revision, personId = person) => ({ receipt: { commandId: uid(40), action: 'save_duties', personId, revision, replayed: false },
    detail: { contractVersion: 'tjanst_v1', scope: 'organizer', unitId: null, people: [], actions: [], blockers: [], capabilities: { canManage: true, canCreateDraft: false } } });
  assert.equal(parsePersonalCommandReply(reply(3), duties([input(60)]), {}).receipt.revision, 3);
  rejects(() => parsePersonalCommandReply(reply(4), duties([input(60)]), {}), 'tjanst_revision_conflict');
  rejects(() => parsePersonalCommandReply(reply(3, uid(21)), duties([input(60)]), {}), 'tjanst_revision_conflict');
});

const publication = (extra = {}) => ({ versionId: uid(70), versionNo: 2, unitId: unit, schoolName: 'Syntetiska gymnasiet', schoolYear: year,
  publishedAt: '2026-08-20T08:00:00.000Z', contentHash: hash('c'), rows: [{ id: uid(30), className: 'BA26A', rowKey, label: 'Bygg 1', ht: 3000, vt: 3000,
    joint: { jointId: uid(90), name: 'Samläsning', colleagues: ['Syntetisk Kollega'], ht: 1800, vt: 1800 } }], specials: [], acknowledgedAt: null, comments: [], ...extra });
const selfRead = (pubs = [publication()]) => ({ contractVersion: 'tjanst_v1', person: { id: person, displayName: 'Syntetisk Lärare' }, publications: pubs, capabilities: { canAck: true, canComment: true } });

test('egen väg: inget person-ID från klienten, kvittens utan text och kommentar högst 2 000 tecken', () => {
  assert.deepEqual(parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'ack' }), { commandId: uid(40), versionId: uid(70), action: 'ack' });
  rejects(() => parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'ack', personId: person }));
  rejects(() => parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'ack', body: 'ok' }));
  assert.equal(parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'comment', body: 'x'.repeat(2000) }).body.length, 2000);
  rejects(() => parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'comment', body: 'x'.repeat(2001) }), 'tjanst_comment_too_long');
  rejects(() => parseSelfCommand({ commandId: uid(40), versionId: uid(70), action: 'comment', body: '' }));
  rejects(() => parseSelfReadReply({ ...selfRead(), pupils: [] }));
  const acked = selfRead([publication({ acknowledgedAt: '2026-08-21T08:00:00.000Z' })]);
  const receipt = { commandId: uid(40), action: 'ack', versionId: uid(70), feedbackId: uid(71), replayed: false };
  assert.equal(parseSelfCommandReply({ receipt, detail: acked }, { commandId: uid(40), versionId: uid(70), action: 'ack' }).receipt.feedbackId, uid(71));
  rejects(() => parseSelfCommandReply({ receipt, detail: selfRead() }, { commandId: uid(40), versionId: uid(70), action: 'ack' }));
});

test('bemanning: bara uppföljning, summor kräver publicerad version och vakanser hör till publicerade skolor', () => {
  const sums = { teaching: { ht: 6000, vt: 6000 }, special: { ht: 0, vt: 0 }, vacant: { ht: 1200, vt: 1200 }, unallocated: { ht: 600, vt: 0 }, unlinkedClasses: 1 };
  const staffing = (units, vacancies = []) => ({ contractVersion: 'tjanst_v1', schoolYear: year, units, vacancies });
  const published = { unitId: unit, schoolName: 'Syntetiska gymnasiet', published: { versionId: uid(70), versionNo: 2, publishedAt: '2026-08-20T08:00:00.000Z' }, sums };
  const draftOnly = { unitId: uid(2), schoolName: 'Syntetiska grundskolan', published: null, sums: null };
  const vacancy = u => ({ unitId: u, kind: 'row', id: uid(80), label: 'BA26A Bygg 1', ht: 1200, vt: 1200 });
  assert.equal(parseStaffingReadReply(staffing([published, draftOnly], [vacancy(unit)]), { schoolYear: year }).vacancies.length, 1);
  rejects(() => parseStaffingReadReply(staffing([published, draftOnly], [vacancy(uid(2))]), { schoolYear: year }));
  rejects(() => parseStaffingReadReply(staffing([{ ...draftOnly, sums }]), { schoolYear: year }));
  rejects(() => parseStaffingReadReply({ ...staffing([published]), decide: true }, { schoolYear: year }));
});

test('statusreferens bär bara familj, commandId, åtgärd och mål', () => {
  const ref = planCommandRef(command('save_row', saveRow()));
  assert.deepEqual(Object.keys(ref).sort(), ['action', 'commandId', 'family', 'target']);
  assert.ok(!JSON.stringify(ref).includes('3000'));
  const self = selfCommandRef({ commandId: uid(40), versionId: uid(70), action: 'comment', body: 'Hemlig kommentarstext' });
  assert.ok(!JSON.stringify(self).includes('Hemlig'));
  rejects(() => parseCommandRef({ ...ref, action: 'ack' }));
  rejects(() => parseCommandRef({ ...self, target: { ...self.target, personId: person } }));
  assert.deepEqual(parseStatusReply({ state: 'not_found', result: null }, ref, v => v), { state: 'not_found', result: null });
  rejects(() => parseStatusReply({ state: 'not_found', result: {} }, ref, v => v));
  const done = parseStatusReply({ state: 'completed', result: { receipt: { commandId: uid(40) } } }, ref, v => v);
  assert.equal(done.state, 'completed');
  rejects(() => parseStatusReply({ state: 'completed', result: { receipt: { commandId: uid(41) } } }, ref, v => v), 'tjanst_command_conflict');
});

test('återkoppling i rektors läsning: valfri, bara för publicerad version och med slutna fält', () => {
  const pub = version({ id: uid(51), versionNo: 1, status: 'published', publishedByName: 'Syntetisk Rektor', publishedAt: '2026-08-20T08:00:00.000Z' });
  const feedback = { versionNo: 1, teachers: [{ personId: person, name: 'Syntetisk Lärare', acknowledgedAt: '2026-08-21T08:00:00.000Z' }],
    comments: [{ id: uid(95), personId: person, name: 'Syntetisk Lärare', at: '2026-08-21T09:00:00.000Z', body: 'Syntetisk kommentar' }] };
  const reply = read({ versions: [pub, version({ versionNo: 2 })], feedback });
  assert.equal(parsePlanReadReply(reply, { unitId: unit, schoolYear: year }).feedback.comments[0].body, 'Syntetisk kommentar');
  assert.equal(parsePlanReadReply(read(), { unitId: unit, schoolYear: year }).feedback, undefined);
  rejects(() => parsePlanReadReply(read({ feedback }), { unitId: unit, schoolYear: year }));
  rejects(() => parsePlanReadReply({ ...reply, feedback: { ...feedback, extra: 1 } }, { unitId: unit, schoolYear: year }));
  rejects(() => parsePlanReadReply({ ...reply, feedback: { ...feedback, comments: [{ ...feedback.comments[0], body: 'x'.repeat(2001) }] } }, { unitId: unit, schoolYear: year }));
});
