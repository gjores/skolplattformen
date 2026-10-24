import { TjanstContractError, parseTjanstSourceKey, type TjanstClass, type TjanstJoint, type TjanstRow, type TjanstSpecial, type TjanstTermMinutes } from './tjanst-contract.ts';
import { coverage, prefill, teacherSums } from './tjanst-model.ts';
import { assertYearRowContext, parseYearBatch, parseYearReply, TJANST_YEAR_REASONS, type TjanstYearCandidate, type TjanstYearChoice,
  type TjanstYearEvidence, type TjanstYearMoveItem, type TjanstYearNeed, type TjanstYearReason, type TjanstYearRowReply, type TjanstYearSaveRow,
  type TjanstYearScope, type TjanstYearSuggestion } from './tjanst-year-contract.ts';

function bad(reason = 'tjanst_invalid'): never { throw new TjanstContractError(reason); }
export type TjanstYearProjectedRow = { rowId: string | null; sourceKey: string; need: TjanstYearNeed | null;
  savedRow: TjanstRow | null; personId: string | null; teacherHt: number | null; teacherVt: number | null };
/** Projection only. Stable source keys, never names, connect current needs to saved work.
 * Removed/stale needs keep their saved row visible instead of dropping manually started work. */
export function projectYearRows(classes: TjanstClass[], rows: TjanstRow[], joints: TjanstJoint[]): TjanstYearProjectedRow[] {
  const result: TjanstYearProjectedRow[] = [], seen = new Set<string>();
  for (const cls of classes) for (const value of cls.needs) {
    if (seen.has(value.sourceKey)) bad('tjanst_duplicate_row'); seen.add(value.sourceKey);
    const src = parseTjanstSourceKey(value.sourceKind, value.sourceKey); if (src.classId !== cls.classId || src.rowKey !== value.rowKey) bad('wrong_scope');
    const need = { ...value, classId: cls.classId, className: cls.name }, saved = rows.filter(r => r.sourceKey === value.sourceKey);
    if (saved.length) for (const row of saved) result.push({ rowId: row.id, sourceKey: row.sourceKey, need, savedRow: structuredClone(row),
      personId: row.personId, teacherHt: row.teacherHt, teacherVt: row.teacherVt });
    else {
      const allocated = coverage(value.sourceKey, null, rows, joints).covered;
      result.push({ rowId: null, sourceKey: value.sourceKey, need, savedRow: null, personId: null,
        teacherHt: prefill(value.needHt, allocated.ht), teacherVt: prefill(value.needVt, allocated.vt) });
    }
  }
  for (const row of rows) if (!seen.has(row.sourceKey)) result.push({ rowId: row.id, sourceKey: row.sourceKey, need: null,
    savedRow: structuredClone(row), personId: row.personId, teacherHt: row.teacherHt, teacherVt: row.teacherVt });
  return result;
}
export type TjanstYearRowEditor = TjanstYearScope & { sourceKey: string; rowId: string | null; baseVersionId: string | null;
  expectedRevision: number; expectedBasisHash: string; personId: string | null; choice: TjanstYearChoice | null; teacherHt: number | null; teacherVt: number | null; comment: string };
function checkSupport(value: TjanstYearRowReply): TjanstYearRowReply {
  const parsed = parseYearReply(value, { unitId: value.unitId, schoolYear: value.schoolYear, mode: 'row', sourceKey: value.sourceKey, rowId: value.rowId });
  if (parsed.mode !== 'row') bad(); return parsed;
}
function manual(candidate: TjanstYearCandidate): TjanstYearChoice { return { kind: 'manual', personId: candidate.personId, expectedPersonBasisHash: candidate.personBasisHash }; }
/** A column is a navigation hint only. It never selects its teacher on a new row. A saved choice is retained. */
export function createYearRowEditor(support: TjanstYearRowReply, allocated: TjanstTermMinutes = { ht: 0, vt: 0 }, _columnPersonId?: string | null): TjanstYearRowEditor {
  const s = checkSupport(support), row = s.currentRow, person = s.candidates.find(p => p.personId === row?.personId);
  return { unitId: s.unitId, schoolYear: s.schoolYear, sourceKey: s.sourceKey, rowId: s.rowId, baseVersionId: s.baseVersionId, expectedRevision: s.currentRevision, expectedBasisHash: s.basisHash,
    personId: row?.personId ?? null, choice: row === null ? null : row.personId === null ? { kind: 'unassigned', personId: null } : person ? manual(person) : null,
    teacherHt: row ? row.teacherHt : prefill(s.need.needHt, allocated.ht), teacherVt: row ? row.teacherVt : prefill(s.need.needVt, allocated.vt), comment: row?.comment ?? '' };
}
function sameTarget(editor: TjanstYearRowEditor, support: TjanstYearRowReply): boolean {
  return editor.unitId === support.unitId && editor.schoolYear === support.schoolYear && editor.sourceKey === support.sourceKey && editor.rowId === support.rowId;
}
/** Called only on an explicit UI choice, never on search/loading/Enter or recommendation ordering. */
export function selectYearTeacher(editor: TjanstYearRowEditor, support: TjanstYearRowReply,
  selection: { kind: 'unassigned' } | { kind: 'manual'; personId: string } | { kind: 'suggestion'; suggestionId: string }): TjanstYearRowEditor {
  const s = checkSupport(support); if (!sameTarget(editor, s)) bad('wrong_scope');
  let selected: TjanstYearChoice;
  if (selection.kind === 'unassigned') selected = { kind: 'unassigned', personId: null };
  else if (selection.kind === 'manual') { const person = s.candidates.find(p => p.personId === selection.personId); if (!person) bad('tjanst_stale_person'); selected = manual(person); }
  else {
    const suggestion = s.suggestions.find(x => x.suggestionId === selection.suggestionId);
    if (s.recommendationStatus !== 'ready' || !suggestion) bad('tjanst_stale_evidence');
    const person = s.candidates.find(p => p.personId === suggestion.personId); if (!person) bad('tjanst_stale_person');
    selected = { kind: 'suggestion', personId: person.personId, expectedPersonBasisHash: person.personBasisHash,
      suggestionId: suggestion.suggestionId, expectedEvidenceHash: suggestion.evidenceHash };
  }
  return { ...editor, baseVersionId: s.baseVersionId, expectedRevision: s.currentRevision, expectedBasisHash: s.basisHash, choice: selected, personId: selected.personId };
}
/** Refreshing support preserves all edits and frozen hashes. Stale support must be reviewed; no silent manual fallback. */
export function refreshYearRowEditor(editor: TjanstYearRowEditor, support: TjanstYearRowReply): TjanstYearRowEditor {
  const s = checkSupport(support); if (!sameTarget(editor, s)) bad('wrong_scope'); return structuredClone(editor);
}
export function yearRowSavePayload(editor: TjanstYearRowEditor, support: TjanstYearRowReply): TjanstYearSaveRow {
  const s = checkSupport(support); if (!sameTarget(editor, s)) bad('wrong_scope');
  if (editor.choice === null) bad('tjanst_choice_required');
  if (editor.teacherHt === null || editor.teacherVt === null) bad('tjanst_time_required');
  const payload: TjanstYearSaveRow = { rowId: editor.rowId, sourceKind: 'class_timplan', sourceKey: editor.sourceKey, personId: editor.personId,
    teacherHt: editor.teacherHt, teacherVt: editor.teacherVt, comment: editor.comment,
    planningContext: { baseVersionId: editor.baseVersionId, expectedBasisHash: editor.expectedBasisHash, choice: editor.choice } };
  assertYearRowContext(payload, s); return payload;
}
export type TjanstYearReadHealth = { core: 'ok'; recommendationStatus: 'ready' | 'empty' | 'unavailable' }
  | { core: 'auth_error' | 'audit_error' | 'basis_error' | 'person_error' };
/** Only the optional source may degrade. Authorization/audit/current basis/person errors always stop saving. */
export function canUseYearChoice(health: TjanstYearReadHealth, selected: TjanstYearChoice | null): boolean {
  return health.core === 'ok' && selected !== null && (selected.kind !== 'suggestion' || health.recommendationStatus === 'ready');
}
export function yearRecommendationMessage(status: 'ready' | 'empty' | 'unavailable'): string {
  return { ready: 'Förslag utifrån tidigare planering', empty: 'Inga tidigare planeringsförslag', unavailable: 'Förslagen kunde inte hämtas' }[status];
}
export const YEAR_QUALIFICATION_LABEL = 'Behörighetsunderlag saknas';
/** Input is exact server-selected current/previous publication evidence. No matching by names or inferred level progression. */
export function yearEvidenceReason(target: TjanstYearScope & { classId: string; rowKey: string }, reference: {
  unitId: string; schoolYear: number; classId: string; rowKey: string; versionStatus: 'draft' | 'published' | 'superseded' | 'discarded';
}): TjanstYearReason | null {
  if (target.unitId !== reference.unitId) return null;
  if (target.schoolYear === reference.schoolYear) return ['draft', 'published'].includes(reference.versionStatus) && target.classId === reference.classId ? 'current_same_class' : null;
  if (reference.schoolYear !== target.schoolYear - 1 || reference.versionStatus !== 'published') return null;
  if (target.classId === reference.classId) return target.rowKey === reference.rowKey ? 'previous_same_class_row' : 'previous_same_class';
  return target.rowKey === reference.rowKey ? 'previous_same_row' : null;
}
export function yearEvidenceLabel(evidence: TjanstYearEvidence): string {
  const year = `${evidence.schoolYear}/${String(evidence.schoolYear + 1).slice(-2)}`;
  const label: Record<TjanstYearReason, string> = { current_same_class: 'Planerad för samma klass', previous_same_class_row: 'Planerad för samma klass och ämnesrad',
    previous_same_class: 'Planerad för samma klass', previous_same_row: 'Planerad för samma ämnesrad på skolan' };
  return `${label[evidence.reason]} ${year}`;
}
/** Categories are presentation order, not teacher skill, workload or qualification scores. */
export function sortYearSuggestions(support: TjanstYearRowReply): TjanstYearSuggestion[] {
  const s = checkSupport(support), names = new Map(s.candidates.map(p => [p.personId, p.displayName]));
  const rank = (item: TjanstYearSuggestion) => Math.min(...item.reasons.map(reason => TJANST_YEAR_REASONS.indexOf(reason)));
  return [...s.suggestions].sort((a, b) => rank(a) - rank(b) || (names.get(a.personId) ?? '').localeCompare(names.get(b.personId) ?? '', 'sv-SE')
    || a.personId.localeCompare(b.personId));
}
export function yearCandidatePeriod(candidate: TjanstYearCandidate, schoolYear: number): 'draft' | 'full_year' | 'part_year' {
  if (candidate.draft) return 'draft';
  const start = `${schoolYear}-07-01`, end = `${schoolYear + 1}-06-30`;
  // Inclusive contiguous periods may collectively cover the school year; no implied employment extension.
  let next = start;
  for (const duty of [...candidate.duties].sort((a, b) => a.startsOn.localeCompare(b.startsOn))) {
    if (duty.startsOn > next) return 'part_year';
    if (duty.endsOn === null || duty.endsOn >= end) return 'full_year';
    if (duty.endsOn >= next) next = new Date(Date.parse(`${duty.endsOn}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  return 'part_year';
}
export type TjanstYearMovePreview = { writeObjectCount: number; rows: TjanstRow[]; specials: TjanstSpecial[]; joints: TjanstJoint[];
  blockers: { itemKey: string; groupId: string | null; code: 'joint_incomplete' | 'joint_person_collision' | 'duplicate_row' | 'wrong_scope' | 'batch_too_large' }[] };
/** Pure rehearsal, not a write. Moving one teacher in a joint requires all that teacher's group rows.
 * Other teachers' member rows/time stay intact; the selected teacher's group total moves once. */
export function previewYearMove(scope: TjanstYearScope, baseVersionId: string, selected: TjanstYearMoveItem[],
  rows: TjanstRow[], specials: TjanstSpecial[], joints: TjanstJoint[]): TjanstYearMovePreview {
  const batch = parseYearBatch({ action: 'move', baseVersionId, items: selected }, scope.schoolYear);
  if (batch.action !== 'move') bad();
  const affectedObjects = new Set(batch.items.map(i => `${i.kind}:${i.id}`));
  for (const joint of joints) if (joint.rowIds.some(id => batch.items.some(i => i.kind === 'row' && i.id === id))) {
    for (const id of joint.rowIds) affectedObjects.add(`row:${id}`);
  }
  const result: TjanstYearMovePreview = { writeObjectCount: affectedObjects.size, rows: structuredClone(rows), specials: structuredClone(specials), joints: structuredClone(joints), blockers: [] };
  const add = (item: TjanstYearMoveItem, code: TjanstYearMovePreview['blockers'][number]['code'], groupId: string | null = null) => {
    if (!result.blockers.some(b => b.itemKey === item.itemKey && b.code === code && b.groupId === groupId)) result.blockers.push({ itemKey: item.itemKey, groupId, code });
  };
  if (result.writeObjectCount > 100) for (const item of batch.items) add(item, 'batch_too_large');
  const movedGroups = new Set<string>();
  for (const item of batch.items) {
    const original = item.kind === 'row' ? rows.find(r => r.id === item.id) : specials.find(s => s.id === item.id);
    if (!original || original.personId !== item.fromPersonId) { add(item, 'wrong_scope'); continue; }
    if (item.kind === 'row') {
      const row = original as TjanstRow;
      if (parseTjanstSourceKey(row.sourceKind, row.sourceKey).schoolYear !== scope.schoolYear) { add(item, 'wrong_scope'); continue; }
      const joint = joints.find(j => j.rowIds.includes(row.id));
      if (joint) {
        const members = rows.filter(r => joint.rowIds.includes(r.id) && r.personId === item.fromPersonId);
        if (members.some(r => !batch.items.some(i => i.kind === 'row' && i.id === r.id && i.fromPersonId === item.fromPersonId && i.choice.personId === item.choice.personId))) add(item, 'joint_incomplete', joint.id);
        if (joint.rowIds.length > 100) add(item, 'batch_too_large', joint.id);
        if (item.choice.personId === null || joint.teachers.some(t => t.personId === item.choice.personId)) add(item, 'joint_person_collision', joint.id);
        const groupKey = `${joint.id}:${item.fromPersonId}`;
        if (!movedGroups.has(groupKey) && item.choice.personId !== null) {
          const time = result.joints.find(j => j.id === joint.id)!.teachers.find(t => t.personId === item.fromPersonId);
          if (!time) add(item, 'joint_incomplete', joint.id); else time.personId = item.choice.personId;
          movedGroups.add(groupKey);
        }
      }
      result.rows.find(r => r.id === item.id)!.personId = item.choice.personId;
    } else result.specials.find(s => s.id === item.id)!.personId = item.choice.personId;
  }
  for (const item of batch.items.filter(i => i.kind === 'row')) {
    const row = result.rows.find(r => r.id === item.id);
    if (row && row.personId !== null && result.rows.some(other => other.id !== row.id && other.personId === row.personId && other.sourceKey === row.sourceKey)) add(item, 'duplicate_row', row.jointGroupId);
  }
  for (const joint of result.joints) if (new Set(joint.teachers.map(t => t.personId)).size !== joint.teachers.length) {
    for (const item of batch.items) if (item.kind === 'row' && joint.rowIds.includes(item.id)) add(item, 'joint_person_collision', joint.id);
  }
  // Blocked batches never return partly changed content.
  if (result.blockers.length) return { writeObjectCount: result.writeObjectCount, rows: structuredClone(rows), specials: structuredClone(specials), joints: structuredClone(joints), blockers: result.blockers };
  return result;
}
export { teacherSums as yearTeacherSums };
