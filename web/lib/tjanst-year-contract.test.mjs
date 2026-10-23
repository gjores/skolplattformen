import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TjanstContractError, tjanstCanonicalSerialize, tjanstHashCanonical } from './tjanst-contract.ts';
import { assertTjanstYearInputSize, parseYearRequest, parseYearReply, parseYearPlanCommand, parseYearChoice,
  parseYearBatch, parseYearPlanReceipt, createYearPlanCommand, verifyYearPlanCommandHash, assertYearRowContext, yearPlanCommandRef, tjanstYearHash } from './tjanst-year-contract.ts';
const id = n => `51a20000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = c => `sha256:${c.repeat(64)}`;
const unitId = id(1), classId = id(2), personId = id(3), rowKey = 'subject:SVEN1000X';
const key = (y = 2026, cls = classId, row = rowKey) => `class_timplan:${cls}:${y}:${row}`;
const request = (extra = {}) => ({ unitId, schoolYear: 2026, mode: 'row', sourceKey: key(), rowId: null, ...extra });
const candidate = (extra = {}) => ({ personId, displayName: 'Lärare A', draft: false, shareHere: 50,
  duties: [{ dutyId: id(4), startsOn: '2026-07-01', endsOn: '2027-06-30', percent: 50 }], personBasisHash: hash('b'), qualificationStatus: 'unknown', ...extra });
const evidence = (extra = {}) => ({ reason: 'previous_same_class_row', unitId, schoolYear: 2025, versionId: id(5), rowId: id(6), personId, classId, rowKey, sourceKey: key(2025), ...extra });
const suggestion = (extra = {}) => ({ suggestionId: 'historical:1', personId, evidenceHash: hash('c'), reasons: ['previous_same_class_row'], references: [evidence()], ...extra });
const reply = (extra = {}) => ({ contractVersion: 'tjanst_year_v1', unitId, schoolYear: 2026, mode: 'row', currentRevision: 0, baseVersionId: null, basisHash: hash('a'),
  sourceKey: key(), rowId: null, need: { sourceKind: 'class_timplan', sourceKey: key(), rowKey, classId, className: 'A', label: 'Svenska', needHt: null, needVt: 0, needBasis: 'terms' },
  currentRow: null, candidates: [candidate()], totalCandidates: 1, recommendationStatus: 'ready', suggestions: [suggestion()], ...extra });
const manual = () => ({ kind: 'manual', personId, expectedPersonBasisHash: hash('b') });
const selectedSuggestion = () => ({ ...manual(), kind: 'suggestion', suggestionId: 'historical:1', expectedEvidenceHash: hash('c') });
const rowPayload = (selected = manual(), extra = {}) => ({ rowId: null, sourceKind: 'class_timplan', sourceKey: key(), personId: selected.personId, teacherHt: 600, teacherVt: 0, comment: '',
  planningContext: { baseVersionId: null, expectedBasisHash: hash('a'), choice: selected }, ...extra });
const command = (extra = {}) => ({ commandId: id(10), unitId, schoolYear: 2026, action: 'save_row', expectedRevision: 0, payloadHash: hash('f'), payload: rowPayload(), ...extra });
const rejects = (fn, reason) => assert.throws(fn, e => e instanceof TjanstContractError && (!reason || e.reason === reason));

test('row request defaults only absent rowId to null, rejects fake IDs, version selection and foreign year', () => {
  const { rowId, ...q } = request(); assert.equal(parseYearRequest(q).rowId, null);
  for (const extra of [{ rowId: 0 }, { sourceVersionId: id(9) }, { sourceKey: key(2027) }, { mode: 'extend' }, { autoSelect: true }]) rejects(() => parseYearRequest(request(extra)));
});
test('row response distinguishes projected null row from actual row and unknown minutes from zero', () => {
  const r = parseYearReply(reply(), request()); assert.equal(r.rowId, null); assert.equal(r.currentRow, null);
  assert.equal(r.need.needHt, null); assert.equal(r.need.needVt, 0);
  for (const extra of [{ rowId: 0 }, { rowId: id(8) }, { unitId: id(9) }, { schoolYear: 2025 }, { sourceKey: key(2025) }, { defaultPersonId: personId }]) rejects(() => parseYearReply(reply(extra), request()));
});
test('catalog is complete, duplicate IDs and silent truncation are rejected', () => {
  const q = { unitId, schoolYear: 2026, mode: 'catalog' };
  const r = { contractVersion: 'tjanst_year_v1', ...q, currentRevision: 0, baseVersionId: null, basisHash: hash('a'), candidates: [candidate()], totalCandidates: 1 };
  assert.equal(parseYearReply(r, q).totalCandidates, 1);
  rejects(() => parseYearReply({ ...r, totalCandidates: 2 }, q), 'tjanst_catalog_incomplete');
  rejects(() => parseYearReply({ ...r, candidates: [candidate(), candidate()], totalCandidates: 2 }, q));
});
test('candidate exposes own inclusive dates and unknown qualification only', () => {
  for (const d of [{ startsOn: '2025-01-01', endsOn: '2026-07-01' }, { startsOn: '2027-06-30', endsOn: null }]) {
    assert.equal(parseYearReply(reply({ candidates: [candidate({ duties: [{ dutyId: id(4), percent: 50, ...d }] })] }), request()).candidates.length, 1);
  }
  for (const c of [candidate({ qualificationStatus: 'qualified' }), candidate({ qualificationStatus: 'unqualified' }), candidate({ account: true }), candidate({ otherSchools: [] }),
    candidate({ duties: [] }), candidate({ duties: [{ dutyId: id(4), startsOn: '2026-02-30', endsOn: null, percent: 50 }] }),
    candidate({ duties: [{ dutyId: id(4), startsOn: '2027-07-01', endsOn: null, percent: 50 }] }),
    candidate({ duties: [{ dutyId: id(4), startsOn: '2025-01-01', endsOn: '2026-06-30', percent: 50 }] })]) rejects(() => parseYearReply(reply({ candidates: [c] }), request()));
});
test('recommendations require exact class/row/person/school/year references; no free-form truth assertions', () => {
  for (const patch of [{ unitId: id(90) }, { classId: id(90), sourceKey: key(2025, id(90)) }, { rowKey: 'subject:SVEN2000X', sourceKey: key(2025, classId, 'subject:SVEN2000X') },
    { personId: id(90) }, { schoolYear: 2024, sourceKey: key(2024) }, { reason: 'taught_same_class' }, { reason: 'qualified' }, { className: 'A' }]) {
    rejects(() => parseYearReply(reply({ suggestions: [suggestion({ references: [evidence(patch)] })] }), request()));
  }
  rejects(() => parseYearReply(reply({ suggestions: [suggestion({ reasons: ['previous_same_class'] })] }), request()));
  rejects(() => parseYearReply(reply({ suggestions: [suggestion({ personId: id(90) })] }), request()));
});
test('empty and unavailable have no evidence; ready must have evidence', () => {
  for (const recommendationStatus of ['empty', 'unavailable']) {
    assert.equal(parseYearReply(reply({ recommendationStatus, suggestions: [] }), request()).recommendationStatus, recommendationStatus);
    rejects(() => parseYearReply(reply({ recommendationStatus }), request()));
  }
  rejects(() => parseYearReply(reply({ suggestions: [] }), request()));
});
test('every new choice is explicit; no default, absent/null person confusion or extra evidence', () => {
  assert.deepEqual(parseYearChoice({ kind: 'unassigned', personId: null }), { kind: 'unassigned', personId: null });
  for (const value of [undefined, {}, { kind: 'unassigned' }, { kind: 'unassigned', personId }, { kind: 'manual', personId: null, expectedPersonBasisHash: hash('b') },
    { ...manual(), expectedPersonBasisHash: undefined }, { ...manual(), suggestionId: 'x' }, { ...selectedSuggestion(), expectedEvidenceHash: null }]) rejects(() => parseYearChoice(value));
});
test('new save rejects old payload, mismatched person, stale basis/person/evidence, and suggestion downgrade', () => {
  const { planningContext, ...legacy } = rowPayload(); rejects(() => parseYearPlanCommand(command({ payload: legacy })), 'tjanst_context_required');
  rejects(() => parseYearPlanCommand(command({ payload: rowPayload(manual(), { personId: id(90) }) })), 'tjanst_choice_mismatch');
  const support = parseYearReply(reply(), request());
  assertYearRowContext(rowPayload(manual()), support); assertYearRowContext(rowPayload(selectedSuggestion()), support);
  assertYearRowContext(rowPayload({ kind: 'unassigned', personId: null }), support);
  rejects(() => assertYearRowContext(rowPayload(manual(), { planningContext: { ...planningContext, expectedBasisHash: hash('e') } }), support), 'tjanst_stale_basis');
  rejects(() => assertYearRowContext(rowPayload({ ...manual(), expectedPersonBasisHash: hash('e') }), support), 'tjanst_stale_person');
  rejects(() => assertYearRowContext(rowPayload({ ...selectedSuggestion(), expectedEvidenceHash: hash('e') }), support), 'tjanst_stale_evidence');
  const unavailable = parseYearReply(reply({ recommendationStatus: 'unavailable', suggestions: [] }), request());
  assertYearRowContext(rowPayload(manual()), unavailable); assertYearRowContext(rowPayload({ kind: 'unassigned', personId: null }), unavailable);
  rejects(() => assertYearRowContext(rowPayload(selectedSuggestion()), unavailable), 'tjanst_stale_evidence');
});
test('all editing actions require mutation context and publish/discard require an actual base', () => {
  const contexts = { add_teacher: { personId }, delete_row: { rowId: id(8) }, delete_special: { specialId: id(8) }, dissolve_joint: { jointId: id(8) },
    save_special: { specialId: null, kind: 'annat', label: 'Uppdrag', classId: null, personId: null, ht: 60, vt: 0, comment: '' },
    save_joint: { jointId: null, name: 'Grupp', rowIds: [id(8), id(9)], teachers: [{ personId, ht: 60, vt: 0 }] }, discard_draft: {}, publish: {} };
  for (const [action, payload] of Object.entries(contexts)) {
    const extra = action === 'publish' ? { expectedContentHash: hash('d') } : {};
    rejects(() => parseYearPlanCommand(command({ action, payload, ...extra })), 'tjanst_context_required');
    assert.equal(parseYearPlanCommand(command({ action, payload: { ...payload, mutationContext: { baseVersionId: id(5), expectedBasisHash: hash('a') } }, ...extra })).action, action);
  }
  rejects(() => parseYearPlanCommand(command({ action: 'create_draft', payload: { basedOnVersionId: null } })));
  rejects(() => parseYearPlanCommand(command({ action: 'discard_draft', payload: { mutationContext: { baseVersionId: null, expectedBasisHash: hash('a') } } })));
});
test('payload hash binds explicit choices and evidence within same plan journal target', async () => {
  const { payloadHash, ...input } = command(); const q = await createYearPlanCommand(input);
  assert.equal((await verifyYearPlanCommandHash(q)).payloadHash, q.payloadHash);
  assert.deepEqual(yearPlanCommandRef(q).target, { unitId, schoolYear: 2026, versionId: null, personId: null }); assert.equal(yearPlanCommandRef(q).family, 'plan');
  await assert.rejects(() => verifyYearPlanCommandHash({ ...q, payload: rowPayload({ kind: 'unassigned', personId: null }) }), /underlag/);
  assert.notEqual((await createYearPlanCommand({ ...input, payload: rowPayload(selectedSuggestion()) })).payloadHash, q.payloadHash);
});
test('batch allows only move/bulk with explicit choices, distinct item keys and at most 100 objects', () => {
  const move = { action: 'move', baseVersionId: id(5), items: [{ itemKey: 'a', kind: 'row', id: id(8), fromPersonId: id(9), choice: manual() }] };
  assert.equal(parseYearBatch(move, 2026).items.length, 1);
  for (const badBatch of [{ ...move, action: 'extend' }, { ...move, sourceVersionId: id(5) }, { ...move, items: [] }, { ...move, items: [move.items[0], move.items[0]] },
    { ...move, items: [{ ...move.items[0], choice: undefined }] }, { ...move, items: [{ ...move.items[0], choice: selectedSuggestion() }] }]) rejects(() => parseYearBatch(badBatch, 2026));
  const items = Array.from({ length: 100 }, (_, n) => ({ itemKey: `i${n}`, kind: 'row', id: id(100 + n), fromPersonId: id(9), choice: manual() }));
  assert.equal(parseYearBatch({ ...move, items }, 2026).items.length, 100);
  rejects(() => parseYearBatch({ ...move, items: [...items, { ...items[0], itemKey: 'extra', id: id(999) }] }, 2026));
  const bulk = { action: 'bulk', baseVersionId: null, items: [{ itemKey: 'a', kind: 'row', payload: rowPayload() }] };
  assert.equal(parseYearBatch(bulk, 2026).items.length, 1);
  rejects(() => parseYearBatch({ ...bulk, items: [{ ...bulk.items[0], payload: rowPayload(manual(), { rowId: id(8) }) }] }, 2026));
  rejects(() => parseYearBatch({ ...bulk, items: [bulk.items[0], { ...bulk.items[0], itemKey: 'b' }] }, 2026));
  assert.equal(parseYearBatch({ ...bulk, items: [bulk.items[0], { ...bulk.items[0], itemKey: 'b', payload: rowPayload({ ...manual(), personId: id(12) }) }] }, 2026).items.length, 2);
});
test('batch reply matches selected target/person and exposes identified blockers and whole-group object limit', () => {
  const batch = { action: 'move', baseVersionId: id(5), items: [{ itemKey: 'a', kind: 'row', id: id(8), fromPersonId: id(9), choice: manual() }] };
  const q = { unitId, schoolYear: 2026, mode: 'batch', batch };
  const r = { contractVersion: 'tjanst_year_v1', unitId, schoolYear: 2026, mode: 'batch', currentRevision: 1, baseVersionId: id(5), basisHash: hash('a'), action: 'move', previewHash: hash('d'),
    items: [{ itemKey: 'a', kind: 'row', id: id(8), sourceKey: key(), classId, jointGroupId: id(7), before: { personId: id(9), ht: 60, vt: 0 }, after: { personId, ht: 60, vt: 0 } }],
    selectedCount: 1, writeObjectCount: 1, jointTotals: [{ jointId: id(7), personId, ht: 60, vt: 0 }], blockers: [] };
  assert.equal(parseYearReply(r, q).selectedCount, 1);
  for (const patch of [{ items: [{ ...r.items[0], itemKey: 'foreign' }] }, { items: [{ ...r.items[0], id: id(90) }] }, { items: [{ ...r.items[0], after: { ...r.items[0].after, personId: id(90) } }] },
    { selectedCount: 2 }, { writeObjectCount: 101 }, { items: [{ ...r.items[0], after: { ...r.items[0].after, ht: 120 } }] }, { jointTotals: [] }, { jointTotals: [{ ...r.jointTotals[0], personId: id(90) }] }, { blockers: [{ itemKey: 'foreign', groupId: null, code: 'wrong_scope' }] }]) rejects(() => parseYearReply({ ...r, ...patch }, q));
  assert.equal(parseYearReply({ ...r, writeObjectCount: 101, blockers: [{ itemKey: 'a', groupId: id(7), code: 'batch_too_large' }] }, q).writeObjectCount, 101);
});
test('64KiB input limit counts UTF-8 bytes; no character-count loophole', () => {
  assertTjanstYearInputSize('a'.repeat(65534)); rejects(() => assertTjanstYearInputSize('a'.repeat(65535)), 'tjanst_input_too_large');
  rejects(() => assertTjanstYearInputSize('å'.repeat(32768)), 'tjanst_input_too_large');
});
test('shared canonical vectors include stale person/source/date/evidence with unchanged plan revision', async () => {
  const file = JSON.parse(readFileSync(new URL('../../supabase/tests/phase51_tjanst_year_hash_vectors.json', import.meta.url), 'utf8'));
  for (const vector of file.vectors) {
    assert.equal(tjanstCanonicalSerialize(vector.input), vector.canonical, vector.name);
    assert.equal(await tjanstHashCanonical(vector.input), vector.sha256, vector.name);
    assert.equal(await tjanstYearHash(vector.input[1], vector.input[2]), vector.sha256, vector.name);
  }
  for (const [before, after] of file.mustDiffer) assert.notEqual(file.vectors.find(v => v.name === before).sha256, file.vectors.find(v => v.name === after).sha256);
});

test('year receipt validates original contextual command without legacy command parser', () => {
  const q = command(), receipt = { commandId: q.commandId, action: 'save_row', versionId: id(5), revision: 1, contentHash: hash('d'), replayed: false, changed: true };
  assert.equal(parseYearPlanReceipt(receipt, q).revision, 1);
  for (const change of [{ revision: 0 }, { revision: 2 }, { commandId: id(99) }, { action: 'bulk' }, { versionId: null }, { untrusted: true }]) rejects(() => parseYearPlanReceipt({ ...receipt, ...change }, q));
});
test('current-class suggestion is tied to current base version; historical source cannot masquerade as current', () => {
  const s = suggestion({ reasons: ['current_same_class'], references: [evidence({ reason: 'current_same_class', schoolYear: 2026, sourceKey: key() })] });
  assert.equal(parseYearReply(reply({ baseVersionId: id(5), suggestions: [s] }), request()).suggestions.length, 1);
  rejects(() => parseYearReply(reply({ suggestions: [s] }), request()));
  rejects(() => parseYearReply(reply({ baseVersionId: id(99), suggestions: [s] }), request()));
});
test('blocked missing batch object uses null states instead of inventing zero-minute assignments', () => {
  const batch = { action: 'move', baseVersionId: id(5), items: [{ itemKey: 'missing', kind: 'row', id: id(8), fromPersonId: id(9), choice: manual() }] };
  const q = { unitId, schoolYear: 2026, mode: 'batch', batch };
  const r = { contractVersion: 'tjanst_year_v1', unitId, schoolYear: 2026, mode: 'batch', currentRevision: 1, baseVersionId: id(5), basisHash: hash('a'), action: 'move', previewHash: hash('d'),
    items: [{ itemKey: 'missing', kind: 'row', id: id(8), sourceKey: null, classId: null, jointGroupId: null, before: null, after: null }],
    selectedCount: 1, writeObjectCount: 1, jointTotals: [], blockers: [{ itemKey: 'missing', groupId: null, code: 'wrong_scope' }] };
  assert.equal(parseYearReply(r, q).items[0].after, null); rejects(() => parseYearReply({ ...r, blockers: [] }, q));
});
test('bulk preview must preserve explicit teacher minutes', () => {
  const batch = { action: 'bulk', baseVersionId: null, items: [{ itemKey: 'new', kind: 'row', payload: rowPayload() }] };
  const q = { unitId, schoolYear: 2026, mode: 'batch', batch };
  const r = { contractVersion: 'tjanst_year_v1', unitId, schoolYear: 2026, mode: 'batch', currentRevision: 0, baseVersionId: null, basisHash: hash('a'), action: 'bulk', previewHash: hash('d'),
    items: [{ itemKey: 'new', kind: 'row', id: null, sourceKey: key(), classId, jointGroupId: null, before: null, after: { personId, ht: 600, vt: 0 } }], selectedCount: 1, writeObjectCount: 1, jointTotals: [], blockers: [] };
  assert.equal(parseYearReply(r, q).items[0].after.ht, 600);
  rejects(() => parseYearReply({ ...r, items: [{ ...r.items[0], after: { personId, ht: 599, vt: 0 } }] }, q), 'tjanst_time_mismatch');
});

test('ordinary mentor save requires explicit real class ID just like bulk; other specials cannot invent groups', () => {
  const payload = { specialId: null, kind: 'mentor', label: 'Mentor', personId, classId, ht: 60, vt: 0, comment: '', mutationContext: { baseVersionId: null, expectedBasisHash: hash('a') } };
  assert.equal(parseYearPlanCommand(command({ action: 'save_special', payload })).payload.classId, classId);
  rejects(() => parseYearPlanCommand(command({ action: 'save_special', payload: { ...payload, classId: null } })));
  rejects(() => parseYearPlanCommand(command({ action: 'save_special', payload: { ...payload, kind: 'annat' } })));
});
