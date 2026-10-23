import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectYearRows, createYearRowEditor, selectYearTeacher, refreshYearRowEditor, yearRowSavePayload, canUseYearChoice, yearEvidenceReason,
  sortYearSuggestions, yearCandidatePeriod, yearRecommendationMessage, YEAR_QUALIFICATION_LABEL, previewYearMove, yearTeacherSums, yearEvidenceLabel } from './tjanst-year-model.ts';
const id = n => `51a20000-0000-4000-8000-${String(n).padStart(12, '0')}`, hash = c => `sha256:${c.repeat(64)}`;
const unitId = id(1), classId = id(2), personId = id(3), rowKey = 'subject:SVEN1000X';
const key = (cls = classId, y = 2026, rk = rowKey) => `class_timplan:${cls}:${y}:${rk}`;
const candidate = (extra = {}) => ({ personId, displayName: 'Lärare A', draft: false, shareHere: 50,
  duties: [{ dutyId: id(4), startsOn: '2026-07-01', endsOn: '2027-06-30', percent: 50 }], personBasisHash: hash('b'), qualificationStatus: 'unknown', ...extra });
const need = (extra = {}) => ({ classId, className: 'A', sourceKind: 'class_timplan', sourceKey: key(), rowKey, label: 'Svenska', needHt: 600, needVt: 900, needBasis: 'terms', ...extra });
const evidence = (extra = {}) => ({ reason: 'previous_same_class_row', unitId, schoolYear: 2025, versionId: id(5), rowId: id(6), personId, classId, rowKey, sourceKey: key(classId, 2025), ...extra });
const suggestion = (extra = {}) => ({ suggestionId: 'previous:1', personId, evidenceHash: hash('c'), reasons: ['previous_same_class_row'], references: [evidence()], ...extra });
const support = (extra = {}) => ({ contractVersion: 'tjanst_year_v1', unitId, schoolYear: 2026, mode: 'row', currentRevision: 0, baseVersionId: null, basisHash: hash('a'), sourceKey: key(), rowId: null,
  need: need(), currentRow: null, candidates: [candidate()], totalCandidates: 1, recommendationStatus: 'ready', suggestions: [suggestion()], ...extra });
const row = (extra = {}) => ({ id: id(10), lineageId: id(11), sourceKind: 'class_timplan', sourceKey: key(), classId, rowKey, personId, teacherHt: 120, teacherVt: 240,
  needHt: 600, needVt: 900, needBasis: 'terms', stale: false, jointGroupId: null, comment: 'Eget arbete', ...extra });
const cls = (extra = {}) => ({ classId, name: 'A', link: {}, needs: [need()], ...extra });
const rejected = (fn, reason) => assert.throws(fn, e => e.reason === reason);

test('new target year projects real needs with no teacher and unknown time stays unknown', () => {
  const classes = [cls({ needs: [need({ needHt: null, needVt: 0 })] })], before = structuredClone(classes);
  const p = projectYearRows(classes, [], []); assert.equal(p[0].rowId, null); assert.equal(p[0].personId, null);
  assert.equal(p[0].teacherHt, null); assert.equal(p[0].teacherVt, 0); assert.deepEqual(classes, before);
});
test('started year retains multiple teachers, explicit vacancy, minutes, comment and orphaned stale work', () => {
  const rows = [row(), row({ id: id(12), personId: id(13) }), row({ id: id(14), personId: null }), row({ id: id(15), sourceKey: key(id(99)), classId: id(99), stale: true })];
  const before = structuredClone(rows), projected = projectYearRows([cls(), cls({ classId: id(90), name: 'A', needs: [need({ classId: id(90), sourceKey: key(id(90)) })] })], rows, []);
  assert.equal(projected.length, 5); assert.deepEqual(projected.filter(p => p.savedRow).map(p => p.savedRow), before);
  assert.equal(projected.find(p => p.sourceKey === key(id(90))).personId, null); assert.equal(projected.find(p => p.rowId === id(15)).need, null);
  projected[0].savedRow.comment = 'Changed clone'; assert.deepEqual(rows, before);
});
test('teacher column and highest-ranked recommendation never initialize a new choice; time prefill remains need minus allocated', () => {
  const e = createYearRowEditor(support(), { ht: 120, vt: 300 }, personId);
  assert.equal(e.personId, null); assert.equal(e.choice, null); assert.equal(e.teacherHt, 480); assert.equal(e.teacherVt, 600);
  rejected(() => yearRowSavePayload(e, support()), 'tjanst_choice_required');
  const unknown = createYearRowEditor(support({ need: need({ needHt: null }) }));
  const chosen = selectYearTeacher(unknown, support({ need: need({ needHt: null }) }), { kind: 'unassigned' });
  rejected(() => yearRowSavePayload(chosen, support({ need: need({ needHt: null }) })), 'tjanst_time_required');
});
test('saved teacher/vacancy persists on opening and recommendation refresh; saved minutes do not re-prefill', () => {
  for (const person of [personId, null]) {
    const r = row({ personId: person }), s = support({ rowId: r.id, currentRow: r, baseVersionId: id(5) });
    const e = createYearRowEditor(s, { ht: 500, vt: 500 }, id(99)); assert.equal(e.personId, person); assert.equal(e.teacherHt, 120); assert.equal(e.comment, 'Eget arbete');
    assert.equal(yearRowSavePayload(e, s).personId, person);
    assert.deepEqual(refreshYearRowEditor(e, { ...s, recommendationStatus: 'unavailable', suggestions: [] }), e);
  }
});
test('only explicit manual, suggestion and vacancy choices select teachers; switching is explicit', () => {
  const s = support(), initial = createYearRowEditor(s);
  const manual = selectYearTeacher(initial, s, { kind: 'manual', personId }); assert.equal(manual.personId, personId); assert.equal(manual.choice.kind, 'manual');
  const suggested = selectYearTeacher(initial, s, { kind: 'suggestion', suggestionId: 'previous:1' }); assert.equal(suggested.choice.kind, 'suggestion');
  assert.equal(yearRowSavePayload(suggested, s).planningContext.choice.expectedEvidenceHash, hash('c'));
  assert.equal(selectYearTeacher(suggested, s, { kind: 'unassigned' }).personId, null); assert.equal(initial.personId, null);
  rejected(() => selectYearTeacher(initial, s, { kind: 'manual', personId: id(99) }), 'tjanst_stale_person');
});
test('refresh never changes edits or downgrades an unavailable suggestion to manual', () => {
  const s = support(), e = { ...selectYearTeacher(createYearRowEditor(s), s, { kind: 'suggestion', suggestionId: 'previous:1' }), teacherHt: 123, comment: 'Min ändring' };
  const unavailable = support({ recommendationStatus: 'unavailable', suggestions: [] });
  const kept = refreshYearRowEditor(e, unavailable); assert.deepEqual(kept, e);
  rejected(() => yearRowSavePayload(kept, unavailable), 'tjanst_stale_evidence');
  const manual = selectYearTeacher(kept, unavailable, { kind: 'manual', personId }); assert.equal(yearRowSavePayload(manual, unavailable).teacherHt, 123);
  const changed = support({ basisHash: hash('e') }); assert.deepEqual(refreshYearRowEditor(e, changed), e);
  rejected(() => yearRowSavePayload(e, changed), 'tjanst_stale_basis');
  rejected(() => refreshYearRowEditor(e, support({ unitId: id(99), recommendationStatus: 'empty', suggestions: [] })), 'wrong_scope');
});
test('auth, audit, core and selected-person failures stop every choice, optional recommendation failure only blocks suggestions', () => {
  const choices = [{ kind: 'unassigned', personId: null }, { kind: 'manual', personId, expectedPersonBasisHash: hash('b') },
    { kind: 'suggestion', personId, expectedPersonBasisHash: hash('b'), suggestionId: 'x', expectedEvidenceHash: hash('c') }];
  for (const core of ['auth_error', 'audit_error', 'basis_error', 'person_error']) for (const selected of choices) assert.equal(canUseYearChoice({ core }, selected), false);
  assert.equal(canUseYearChoice({ core: 'ok', recommendationStatus: 'unavailable' }, choices[0]), true);
  assert.equal(canUseYearChoice({ core: 'ok', recommendationStatus: 'unavailable' }, choices[1]), true);
  assert.equal(canUseYearChoice({ core: 'ok', recommendationStatus: 'unavailable' }, choices[2]), false);
  assert.equal(canUseYearChoice({ core: 'ok', recommendationStatus: 'ready' }, null), false);
  assert.notEqual(yearRecommendationMessage('empty'), yearRecommendationMessage('unavailable')); assert.equal(YEAR_QUALIFICATION_LABEL, 'Behörighetsunderlag saknas');
});
test('only exact IDs and row keys explain history; same names or inferred next levels add no relationship', () => {
  const target = { unitId, schoolYear: 2026, classId, rowKey }, ref = { ...target, schoolYear: 2025, versionStatus: 'published' };
  assert.equal(yearEvidenceReason(target, ref), 'previous_same_class_row');
  assert.equal(yearEvidenceReason(target, { ...ref, rowKey: 'subject:SVEN2000X' }), 'previous_same_class');
  assert.equal(yearEvidenceReason(target, { ...ref, classId: id(99) }), 'previous_same_row');
  assert.equal(yearEvidenceReason(target, { ...ref, classId: id(99), rowKey: 'subject:SVEN2000X', className: 'A' }), null);
  for (const patch of [{ unitId: id(99) }, { versionStatus: 'draft' }, { versionStatus: 'superseded' }, { schoolYear: 2024 }]) assert.equal(yearEvidenceReason(target, { ...ref, ...patch }), null);
  assert.equal(yearEvidenceReason(target, { ...ref, schoolYear: 2026, versionStatus: 'draft' }), 'current_same_class');
  assert.match(yearEvidenceLabel(evidence()), /^Planerad för samma klass och ämnesrad 2025\/26$/);
});
test('category order is stable by name and ID, has no effect on choice or unknown qualification', () => {
  const second = id(40), candidates = [candidate(), candidate({ personId: second, displayName: 'Lärare A', shareHere: 100 })];
  const current = suggestion({ suggestionId: 'current:2', personId: second, reasons: ['current_same_class'], references: [evidence({ reason: 'current_same_class', schoolYear: 2026, sourceKey: key(), personId: second })] });
  const s = support({ baseVersionId: id(5), candidates, totalCandidates: 2, suggestions: [suggestion(), current] });
  const e = createYearRowEditor(s), sorted = sortYearSuggestions(s); assert.equal(sorted[0].personId, second); assert.equal(e.personId, null);
  assert.equal(s.candidates.every(p => p.qualificationStatus === 'unknown'), true); assert.equal(s.suggestions[0].personId, personId);
});
test('own duty dates show part year, inclusive touching dates and draft without extending employment', () => {
  assert.equal(yearCandidatePeriod(candidate(), 2026), 'full_year');
  assert.equal(yearCandidatePeriod(candidate({ draft: true, duties: [] }), 2026), 'draft');
  assert.equal(yearCandidatePeriod(candidate({ duties: [{ startsOn: '2026-08-01', endsOn: null }] }), 2026), 'part_year');
  assert.equal(yearCandidatePeriod(candidate({ duties: [{ startsOn: '2026-07-01', endsOn: '2026-12-31' }, { startsOn: '2027-01-01', endsOn: '2027-06-30' }] }), 2026), 'full_year');
  assert.equal(yearCandidatePeriod(candidate({ duties: [{ startsOn: '2026-07-01', endsOn: '2026-12-31' }, { startsOn: '2027-01-02', endsOn: null }] }), 2026), 'part_year');
});
test('whole teacher group moves once with student time and other teachers unchanged; partial/colliding batch returns no edits', () => {
  const target = id(30), colleague = id(31), jointId = id(20);
  const rows = [row({ jointGroupId: jointId }), row({ id: id(12), classId: id(22), sourceKey: key(id(22)), jointGroupId: jointId }),
    row({ id: id(13), personId: colleague, jointGroupId: jointId })];
  const joints = [{ id: jointId, lineageId: id(21), name: 'Gruppen', rowIds: rows.map(r => r.id), teachers: [{ personId, ht: 600, vt: 900 }, { personId: colleague, ht: 300, vt: 450 }] }];
  const items = rows.slice(0, 2).map((r, i) => ({ itemKey: `i${i}`, kind: 'row', id: r.id, fromPersonId: personId, choice: { kind: 'manual', personId: target, expectedPersonBasisHash: hash('b') } }));
  const moved = previewYearMove({ unitId, schoolYear: 2026 }, id(5), items, rows, [], joints);
  assert.deepEqual(moved.blockers, []); assert.equal(yearTeacherSums(target, moved.rows, moved.specials, moved.joints).teaching.year, 1500);
  assert.equal(yearTeacherSums(colleague, moved.rows, moved.specials, moved.joints).teaching.year, 750);
  assert.deepEqual(moved.rows.map(r => [r.needHt, r.needVt]), rows.map(r => [r.needHt, r.needVt])); assert.equal(rows[0].personId, personId);
  for (const selection of [[items[0]], items.map(i => ({ ...i, choice: { ...i.choice, personId: colleague } }))]) {
    const blocked = previewYearMove({ unitId, schoolYear: 2026 }, id(5), selection, rows, [], joints);
    assert.ok(blocked.blockers.length); assert.deepEqual(blocked.rows, rows); assert.deepEqual(blocked.joints, joints);
  }
});
test('move preserves special assignments and prevents duplicate need/person without partial mutation', () => {
  const target = id(30), special = { id: id(40), lineageId: id(41), kind: 'mentor', label: 'Mentor', personId, classId, ht: 600, vt: 600, comment: '' };
  const item = { itemKey: 's', kind: 'special', id: special.id, fromPersonId: personId, choice: { kind: 'manual', personId: target, expectedPersonBasisHash: hash('b') } };
  const moved = previewYearMove({ unitId, schoolYear: 2026 }, id(5), [item], [], [special], []);
  assert.deepEqual(moved.specials[0], { ...special, personId: target }); assert.equal(special.personId, personId);
  const rows = [row(), row({ id: id(12), personId: target })], r = { ...item, itemKey: 'r', kind: 'row', id: rows[0].id };
  const blocked = previewYearMove({ unitId, schoolYear: 2026 }, id(5), [r, item], rows, [special], []);
  assert.equal(blocked.blockers[0].code, 'duplicate_row'); assert.deepEqual(blocked.specials, [special]);
});

test('two source teachers in a joint cannot merge into the same new person even with different need keys', () => {
  const target = id(30), colleague = id(31), jointId = id(20);
  const rows = [row({ jointGroupId: jointId }), row({ id: id(12), classId: id(22), sourceKey: key(id(22)), personId: colleague, jointGroupId: jointId })];
  const joints = [{ id: jointId, lineageId: id(21), name: 'Gruppen', rowIds: rows.map(r => r.id), teachers: [{ personId, ht: 600, vt: 900 }, { personId: colleague, ht: 300, vt: 450 }] }];
  const items = rows.map((r, i) => ({ itemKey: `i${i}`, kind: 'row', id: r.id, fromPersonId: r.personId, choice: { kind: 'manual', personId: target, expectedPersonBasisHash: hash('b') } }));
  const blocked = previewYearMove({ unitId, schoolYear: 2026 }, id(5), items, rows, [], joints);
  assert.ok(blocked.blockers.some(b => b.code === 'joint_person_collision')); assert.deepEqual(blocked.joints, joints); assert.deepEqual(blocked.rows, rows);
});
test('100-object limit counts union of whole affected groups plus standalone selected objects', () => {
  const target = id(30), other = id(31), rows = [], joints = [], items = [];
  for (let g = 0; g < 2; g++) {
    const jointId = id(200 + g), members = Array.from({ length: 60 }, (_, n) => row({ id: id(1000 + g * 60 + n), classId: id(2000 + g * 60 + n),
      sourceKey: key(id(2000 + g * 60 + n)), personId: n === 0 ? personId : other, jointGroupId: jointId }));
    rows.push(...members); joints.push({ id: jointId, lineageId: id(300 + g), name: 'Grupp', rowIds: members.map(r => r.id), teachers: [{ personId, ht: 600, vt: 900 }, { personId: other, ht: 300, vt: 450 }] });
    items.push({ itemKey: `g${g}`, kind: 'row', id: members[0].id, fromPersonId: personId, choice: { kind: 'manual', personId: target, expectedPersonBasisHash: hash('b') } });
  }
  const blocked = previewYearMove({ unitId, schoolYear: 2026 }, id(5), items, rows, [], joints);
  assert.equal(blocked.writeObjectCount, 120); assert.ok(blocked.blockers.some(b => b.code === 'batch_too_large')); assert.deepEqual(blocked.rows, rows);
  const single = previewYearMove({ unitId, schoolYear: 2026 }, id(5), [items[0]], rows, [], joints); assert.equal(single.writeObjectCount, 60); assert.deepEqual(single.blockers, []);
});
