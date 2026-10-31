import { gymArray, gymBoolean, gymInteger, gymObject, gymShape, gymUuid } from './gym-timplan.ts';
import { isValidDate } from './pupil-register-model.ts';
import { parseTjanstSourceKey, parseTjanstAnySourceKey, parseTjanstRow, TjanstContractError, TJANST_LIMITS, TJANST_NEED_BASES,
  tjanstHashCanonical, type TjanstNeed, type TjanstSourceKind, type TjanstRow, type TjanstSpecialKind, type TjanstJointTeacher } from './tjanst-contract.ts';

/** Etapp 2. Strict boundary; wired into the plan family in 05.1-19, never a second write route.
 * SS 12000:2024 / OpenAPI 2.1.0: stable Person/Group/Duty references, inclusive dates and separate
 * student/teacher minutes. Recommendations are local planning evidence, never qualifications or actual teaching.
 */
export const TJANST_YEAR_CONTRACT_VERSION = 'tjanst_year_v1' as const;
export const TJANST_YEAR_LIMITS = { inputBytes: 64 * 1024, batchItems: 100 } as const;
export const TJANST_YEAR_REASONS = ['current_same_class', 'previous_same_class_row', 'previous_same_class', 'previous_same_row'] as const;
export type TjanstYearReason = typeof TJANST_YEAR_REASONS[number];
export type TjanstYearScope = { unitId: string; schoolYear: number };
export type TjanstYearMutationContext = { baseVersionId: string | null; expectedBasisHash: string };
export type TjanstYearChoice =
  | { kind: 'unassigned'; personId: null }
  | { kind: 'manual'; personId: string; expectedPersonBasisHash: string }
  | { kind: 'suggestion'; personId: string; expectedPersonBasisHash: string; suggestionId: string; expectedEvidenceHash: string };
export type TjanstYearPlanningContext = TjanstYearMutationContext & { choice: TjanstYearChoice };
/** Independent base payloads: the legacy parser may delegate here in plan 19 without recursion. */
export type TjanstYearBasePayload = {
  save_row: { rowId: string | null; sourceKind: TjanstSourceKind; sourceKey: string; personId: string | null; teacherHt: number; teacherVt: number; comment: string };
  add_teacher: { personId: string };
  remove_teacher: { personId: string };
  delete_row: { rowId: string };
  save_special: { specialId: string | null; kind: TjanstSpecialKind; label: string; personId: string | null; classId: string | null; ht: number; vt: number; comment: string };
  delete_special: { specialId: string };
  save_joint: { jointId: string | null; name: string; rowIds: string[]; teachers: TjanstJointTeacher[] };
  dissolve_joint: { jointId: string };
  /** 05.1-33 / D-31: delningsform och betygssättare för ett behov med flera lärare. */
  save_sharing: { sourceKey: string; mode: 'sequential' | 'concurrent'; graderPersonIds: string[] };
  clear_sharing: { sourceKey: string };
  discard_draft: Record<string, never>;
  publish: Record<string, never>;
};
export type TjanstYearSaveRow = TjanstYearBasePayload['save_row'] & { planningContext: TjanstYearPlanningContext };
export type TjanstYearDuty = { dutyId: string; startsOn: string; endsOn: string | null; percent: number };
export type TjanstYearCandidate = { personId: string; displayName: string; draft: boolean; shareHere: number | null;
  duties: TjanstYearDuty[]; personBasisHash: string; qualificationStatus: 'unknown' };
export type TjanstYearNeed = TjanstNeed & ({sourceKind:'class_timplan';classId:string;className:string} | {sourceKind:'teaching_group';classId:null;className:string;groupId:string;classIds:string[]});
export type TjanstYearEvidence = { reason: TjanstYearReason; unitId: string; schoolYear: number; versionId: string;
  rowId: string; personId: string; classId: string; rowKey: string; sourceKey: string };
export type TjanstYearSuggestion = { suggestionId: string; personId: string; evidenceHash: string;
  reasons: TjanstYearReason[]; references: TjanstYearEvidence[] };
export type TjanstYearMoveItem = { itemKey: string; kind: 'row' | 'special'; id: string; fromPersonId: string;
  choice: TjanstYearChoice };
export type TjanstYearBulkItem = { itemKey: string; kind: 'row'; payload: TjanstYearSaveRow }
  | { itemKey: string; kind: 'special'; payload: TjanstYearBasePayload['save_special']; choice: TjanstYearChoice };
export type TjanstYearBatch = { action: 'move'; baseVersionId: string | null; items: TjanstYearMoveItem[] }
  | { action: 'bulk'; baseVersionId: string | null; items: TjanstYearBulkItem[] };
export type TjanstYearRequest = TjanstYearScope & ({ mode: 'catalog' }
  | { mode: 'row'; sourceKey: string; rowId: string | null }
  | { mode: 'batch'; batch: TjanstYearBatch });
export type TjanstYearReplyBase = TjanstYearScope & { contractVersion: typeof TJANST_YEAR_CONTRACT_VERSION;
  currentRevision: number; baseVersionId: string | null; basisHash: string };
export type TjanstYearCatalogReply = TjanstYearReplyBase & { mode: 'catalog'; candidates: TjanstYearCandidate[]; totalCandidates: number };
export type TjanstYearRowReply = TjanstYearReplyBase & { mode: 'row'; sourceKey: string; rowId: string | null;
  need: TjanstYearNeed; currentRow: TjanstRow | null; candidates: TjanstYearCandidate[]; totalCandidates: number;
  recommendationStatus: 'ready' | 'empty' | 'unavailable'; suggestions: TjanstYearSuggestion[] };
export type TjanstYearPreviewItem = { itemKey: string; kind: 'row' | 'special'; id: string | null;
  sourceKey: string | null; classId: string | null; jointGroupId: string | null;
  before: { personId: string | null; ht: number; vt: number } | null;
  after: { personId: string | null; ht: number; vt: number } | null };
export const TJANST_YEAR_BLOCKERS = ['stale_basis', 'person_unavailable', 'suggestion_unavailable', 'duplicate_row',
  'unknown_need', 'unknown_class', 'joint_incomplete', 'joint_person_collision', 'batch_too_large', 'wrong_scope'] as const;
export type TjanstYearBatchReply = TjanstYearReplyBase & { mode: 'batch'; action: 'move' | 'bulk'; previewHash: string;
  items: TjanstYearPreviewItem[]; selectedCount: number; writeObjectCount: number;
  jointTotals: { jointId: string; personId: string; ht: number; vt: number }[];
  blockers: { itemKey: string; groupId: string | null; code: typeof TJANST_YEAR_BLOCKERS[number] }[] };
export type TjanstYearReply = TjanstYearCatalogReply | TjanstYearRowReply | TjanstYearBatchReply;
export const TJANST_YEAR_EDIT_ACTIONS = ['add_teacher', 'remove_teacher', 'delete_row', 'save_special', 'delete_special', 'save_joint', 'dissolve_joint', 'save_sharing', 'clear_sharing', 'discard_draft', 'publish'] as const;
type EditAction = typeof TJANST_YEAR_EDIT_ACTIONS[number];
export type TjanstYearPayload = { save_row: TjanstYearSaveRow } & {
  [A in EditAction]: (A extends 'publish' | 'discard_draft' ? object : TjanstYearBasePayload[A]) & { mutationContext: TjanstYearMutationContext }
} & { move: Extract<TjanstYearBatch, { action: 'move' }> & { expectedPreviewHash: string };
  bulk: Extract<TjanstYearBatch, { action: 'bulk' }> & { expectedPreviewHash: string } };
export type TjanstYearAction = keyof TjanstYearPayload;
export type TjanstYearCommand = { [A in TjanstYearAction]: TjanstYearScope & { commandId: string; action: A;
  expectedRevision: number; payloadHash: string; payload: TjanstYearPayload[A] }
  & (A extends 'publish' ? { expectedContentHash: string } : unknown) }[TjanstYearAction];

function bad(reason = 'tjanst_invalid'): never { throw new TjanstContractError(reason); }
function guarded<T>(fn: () => T): T { try { return fn(); } catch (error) { if (error instanceof TjanstContractError) throw error; return bad(); } }
const shape = gymShape, uuid = gymUuid, integer = gymInteger;
const nullableUuid = (v: unknown) => v === null ? null : uuid(v);
const year = (v: unknown) => integer(v, 2100, 2000);
const minutes = (v: unknown) => integer(v, TJANST_LIMITS.minutes);
function text(v: unknown, max = 200): string {
  if (typeof v !== 'string' || !v || v.trim() !== v || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(v) || Array.from(v).length > max) bad(); return v;
}
function hash(v: unknown): string { if (typeof v !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(v)) bad(); return v; }
function choice<T extends string>(v: unknown, values: readonly T[]): T { if (typeof v !== 'string' || !values.includes(v as T)) bad(); return v as T; }
function date(v: unknown): string { if (!isValidDate(v)) bad(); return v as string; }
function list<T>(v: unknown, max: number, fn: (v: unknown) => T): T[] { return gymArray(v, max).map(fn); }
function unique<T>(v: T[], key: (v: T) => string): T[] { if (new Set(v.map(key)).size !== v.length) bad('tjanst_duplicate_row'); return v; }
function source(v: unknown, schoolYear: number) {
  const s = parseTjanstAnySourceKey(v); if (s.schoolYear !== schoolYear) bad('wrong_scope'); return s;
}
/** Reject rather than truncate. HTTP must enforce this against received bytes BEFORE JSON parsing too. */
export function assertTjanstYearInputSize(value: unknown): void {
  guarded(() => { const json = JSON.stringify(value); if (!json || new TextEncoder().encode(json).byteLength > TJANST_YEAR_LIMITS.inputBytes) bad('tjanst_input_too_large'); });
}
export function parseYearChoice(value: unknown): TjanstYearChoice {
  return guarded(() => {
    const kind = choice(gymObject(value).kind, ['unassigned', 'manual', 'suggestion'] as const);
    const c = shape(value, ['kind', 'personId', ...(kind === 'unassigned' ? [] : ['expectedPersonBasisHash']),
      ...(kind === 'suggestion' ? ['suggestionId', 'expectedEvidenceHash'] : [])]);
    if (kind === 'unassigned') { if (c.personId !== null) bad(); return { kind, personId: null }; }
    const common = { personId: uuid(c.personId), expectedPersonBasisHash: hash(c.expectedPersonBasisHash) };
    return kind === 'manual' ? { kind, ...common } : { kind, ...common, suggestionId: text(c.suggestionId, 240), expectedEvidenceHash: hash(c.expectedEvidenceHash) };
  });
}
export function parseYearMutationContext(value: unknown): TjanstYearMutationContext {
  return guarded(() => { if (value === undefined) bad('tjanst_context_required'); const c = shape(value, ['baseVersionId', 'expectedBasisHash']);
    return { baseVersionId: nullableUuid(c.baseVersionId), expectedBasisHash: hash(c.expectedBasisHash) }; });
}
export function parseYearPlanningContext(value: unknown, personId: string | null): TjanstYearPlanningContext {
  return guarded(() => { if (value === undefined) bad('tjanst_context_required'); const c = shape(value, ['baseVersionId', 'expectedBasisHash', 'choice']);
    const selected = parseYearChoice(c.choice); if (selected.personId !== personId) bad('tjanst_choice_mismatch');
    return { ...parseYearMutationContext({ baseVersionId: c.baseVersionId, expectedBasisHash: c.expectedBasisHash }), choice: selected }; });
}
function comment(value: unknown): string {
  if (typeof value === 'string' && Array.from(value).length > TJANST_LIMITS.comment) bad('tjanst_comment_too_long');
  if (value === '') return ''; return text(value, TJANST_LIMITS.comment);
}
function positiveTerms(ht: number, vt: number): void { if (ht === 0 && vt === 0) bad(); }
/** Private payload validation, deliberately independent of the legacy command parser. */
function basePayload<A extends keyof TjanstYearBasePayload>(action: A, value: unknown): TjanstYearBasePayload[A] {
  let parsed: TjanstYearBasePayload[keyof TjanstYearBasePayload];
  if (action === 'save_row') {
    const p = shape(value, ['rowId', 'sourceKind', 'sourceKey', 'personId', 'teacherHt', 'teacherVt', 'comment']);
    const src = parseTjanstSourceKey(p.sourceKind, p.sourceKey), teacherHt = minutes(p.teacherHt), teacherVt = minutes(p.teacherVt); positiveTerms(teacherHt, teacherVt);
    parsed = { rowId: nullableUuid(p.rowId), sourceKind: src.sourceKind, sourceKey: p.sourceKey as string, personId: nullableUuid(p.personId), teacherHt, teacherVt, comment: comment(p.comment) };
  } else if (action === 'save_special') {
    const p = shape(value, ['specialId', 'kind', 'label', 'personId', 'classId', 'ht', 'vt', 'comment']);
    const kind = choice(p.kind, ['mentor', 'programansvar', 'speciallarare', 'annat'] as const), classId = nullableUuid(p.classId), ht = minutes(p.ht), vt = minutes(p.vt); positiveTerms(ht, vt);
    if ((kind === 'mentor') !== (classId !== null)) bad();
    parsed = { specialId: nullableUuid(p.specialId), kind, label: text(p.label), personId: nullableUuid(p.personId), classId, ht, vt, comment: comment(p.comment) };
  } else if (action === 'save_joint') {
    const p = shape(value, ['jointId', 'name', 'rowIds', 'teachers']);
    const rowIds = unique(list(p.rowIds, TJANST_LIMITS.jointRows, uuid), v => v); if (rowIds.length < 2) bad('tjanst_joint_too_few');
    const teachers = unique(list(p.teachers, TJANST_LIMITS.teachers, v => { const t = shape(v, ['personId', 'ht', 'vt']), ht = minutes(t.ht), vt = minutes(t.vt); positiveTerms(ht, vt); return { personId: uuid(t.personId), ht, vt }; }), t => t.personId);
    parsed = { jointId: nullableUuid(p.jointId), name: text(p.name), rowIds, teachers };
  } else if (action === 'add_teacher' || action === 'remove_teacher') parsed = { personId: uuid(shape(value, ['personId']).personId) };
  else if (action === 'delete_row') parsed = { rowId: uuid(shape(value, ['rowId']).rowId) };
  else if (action === 'delete_special') parsed = { specialId: uuid(shape(value, ['specialId']).specialId) };
  else if (action === 'dissolve_joint') parsed = { jointId: uuid(shape(value, ['jointId']).jointId) };
  else if (action === 'save_sharing') {
    const p = shape(value, ['sourceKey', 'mode', 'graderPersonIds']); parseTjanstAnySourceKey(p.sourceKey);
    const graderPersonIds = unique(list(p.graderPersonIds, 20, uuid), v => v); if (!graderPersonIds.length) bad('tjanst_sharing_grader');
    parsed = { sourceKey: p.sourceKey as string, mode: choice(p.mode, ['sequential', 'concurrent'] as const), graderPersonIds };
  } else if (action === 'clear_sharing') { const p = shape(value, ['sourceKey']); parseTjanstAnySourceKey(p.sourceKey); parsed = { sourceKey: p.sourceKey as string }; }
  else { shape(value, []); parsed = {}; }
  return parsed as TjanstYearBasePayload[A];
}
function saveRow(value: unknown, schoolYear: number): TjanstYearSaveRow {
  const raw = gymObject(value), { planningContext, ...rest } = raw;
  if (planningContext === undefined) bad('tjanst_context_required');
  const p = basePayload('save_row', rest); source(p.sourceKey, schoolYear);
  return { ...p, planningContext: parseYearPlanningContext(planningContext, p.personId) };
}
export function parseYearBatch(value: unknown, schoolYear: number): TjanstYearBatch {
  return guarded(() => {
    const b = shape(value, ['action', 'baseVersionId', 'items']), action = choice(b.action, ['move', 'bulk'] as const), baseVersionId = nullableUuid(b.baseVersionId);
    if (action === 'move') {
      if (baseVersionId === null) bad();
      const items = unique(list(b.items, 100, v => { const i = shape(v, ['itemKey', 'kind', 'id', 'fromPersonId', 'choice']);
        const c = parseYearChoice(i.choice), fromPersonId = uuid(i.fromPersonId);
        if (c.kind === 'suggestion' || c.personId === fromPersonId) bad('tjanst_choice_mismatch');
        return { itemKey: text(i.itemKey), kind: choice(i.kind, ['row', 'special'] as const), id: uuid(i.id), fromPersonId, choice: c }; }), i => i.itemKey);
      unique(items, i => `${i.kind}:${i.id}`); if (!items.length) bad(); return { action, baseVersionId, items };
    }
    const items = unique(list(b.items, 100, (v): TjanstYearBulkItem => {
      const kind = choice(gymObject(v).kind, ['row', 'special'] as const);
      const i = shape(v, ['itemKey', 'kind', 'payload', ...(kind === 'special' ? ['choice'] : [])]), itemKey = text(i.itemKey);
      if (kind === 'row') { const payload = saveRow(i.payload, schoolYear);
        if (payload.rowId !== null || payload.planningContext.baseVersionId !== baseVersionId) bad(); return { itemKey, kind, payload }; }
      const payload = basePayload('save_special', i.payload), selected = parseYearChoice(i.choice);
      if (payload.specialId !== null || selected.kind === 'suggestion' || selected.personId !== payload.personId || payload.kind === 'mentor' && payload.classId === null) bad();
      return { itemKey, kind, payload, choice: selected };
    }), i => i.itemKey);
    unique(items.filter((i): i is Extract<TjanstYearBulkItem, { kind: 'row' }> => i.kind === 'row'), i => `${i.payload.sourceKey}:${i.payload.personId}`);
    if (!items.length) bad(); return { action, baseVersionId, items };
  });
}
export function parseYearRequest(value: unknown): TjanstYearRequest {
  return guarded(() => {
    assertTjanstYearInputSize(value);
    const mode = choice(gymObject(value).mode, ['catalog', 'row', 'batch'] as const);
    const raw = gymObject(value);
    const r = shape(value, ['unitId', 'schoolYear', 'mode', ...(mode === 'row' ? ['sourceKey', ...(Object.hasOwn(raw, 'rowId') ? ['rowId'] : [])] : mode === 'batch' ? ['batch'] : [])]);
    const scope = { unitId: uuid(r.unitId), schoolYear: year(r.schoolYear) };
    if (mode === 'catalog') return { ...scope, mode };
    if (mode === 'batch') return { ...scope, mode, batch: parseYearBatch(r.batch, scope.schoolYear) };
    source(r.sourceKey, scope.schoolYear); return { ...scope, mode, sourceKey: r.sourceKey as string, rowId: Object.hasOwn(r, 'rowId') ? nullableUuid(r.rowId) : null };
  });
}
function candidate(value: unknown, schoolYear: number): TjanstYearCandidate {
  const c = shape(value, ['personId', 'displayName', 'draft', 'shareHere', 'duties', 'personBasisHash', 'qualificationStatus']);
  const duties = unique(list(c.duties, TJANST_LIMITS.duties, v => { const d = shape(v, ['dutyId', 'startsOn', 'endsOn', 'percent']);
    const startsOn = date(d.startsOn), endsOn = d.endsOn === null ? null : date(d.endsOn);
    if (endsOn !== null && endsOn < startsOn || startsOn > `${schoolYear + 1}-06-30` || endsOn !== null && endsOn < `${schoolYear}-07-01`) bad();
    return { dutyId: uuid(d.dutyId), startsOn, endsOn, percent: integer(d.percent, 100, 1) }; }), d => d.dutyId);
  const draft = gymBoolean(c.draft); if (!draft && duties.length === 0) bad();
  return { personId: uuid(c.personId), displayName: text(c.displayName), draft, shareHere: c.shareHere === null ? null : integer(c.shareHere, 100, 1),
    duties, personBasisHash: hash(c.personBasisHash), qualificationStatus: choice(c.qualificationStatus, ['unknown'] as const) };
}
function need(value: unknown, schoolYear: number): TjanstYearNeed {
  const raw=gymObject(value),group=raw.sourceKind==='teaching_group';
  const n=shape(raw,['classId','className','sourceKind','sourceKey','rowKey','label','needHt','needVt','needBasis',...(group?['groupId','classIds']:[]),...(Object.hasOwn(raw,'organizationPending')?['organizationPending']:[])]);
  const s=source(n.sourceKey,schoolYear);if(n.sourceKind!==s.sourceKind||n.rowKey!==s.rowKey||n.classId!==s.classId)bad();
  const common={sourceKey:n.sourceKey as string,rowKey:s.rowKey,label:text(n.label,300),needHt:n.needHt===null?null:minutes(n.needHt),needVt:n.needVt===null?null:minutes(n.needVt),needBasis:choice(n.needBasis,TJANST_NEED_BASES),...(Object.hasOwn(n,'organizationPending')?{organizationPending:gymBoolean(n.organizationPending)}:{})};
  if(s.sourceKind==='class_timplan')return {...common,sourceKind:'class_timplan',classId:s.classId,className:text(n.className,60)};
  const classIds=unique(list(n.classIds,TJANST_LIMITS.classes,uuid),x=>x);if(!classIds.length||uuid(n.groupId)!==s.groupId)bad();
  return {...common,sourceKind:'teaching_group',classId:null,className:text(n.className),groupId:s.groupId,classIds};
}
function currentRow(value:unknown,schoolYear:number):TjanstRow{
  const r=parseTjanstRow(value);source(r.sourceKey,schoolYear);return r;
}
function suggestion(value: unknown, scope: TjanstYearScope, target: TjanstYearNeed, baseVersionId: string | null): TjanstYearSuggestion {
  const s = shape(value, ['suggestionId', 'personId', 'evidenceHash', 'reasons', 'references']), personId = uuid(s.personId);
  const reasons = unique(list(s.reasons, 4, v => choice(v, TJANST_YEAR_REASONS)), v => v);
  const references = unique(list(s.references, TJANST_LIMITS.rows, v => {
    const r = shape(v, ['reason', 'unitId', 'schoolYear', 'versionId', 'rowId', 'personId', 'classId', 'rowKey', 'sourceKey']);
    const reason = choice(r.reason, TJANST_YEAR_REASONS), schoolYear = year(r.schoolYear), src = source(r.sourceKey, schoolYear);
    if(src.sourceKind!=='class_timplan'||target.sourceKind!=='class_timplan')bad('tjanst_evidence_mismatch');
    const sameClass = src.sourceKind==='class_timplan'&&target.sourceKind==='class_timplan'&&src.classId === target.classId, sameRow = src.rowKey === target.rowKey;
    if (reason === 'current_same_class' && r.versionId !== baseVersionId || r.unitId !== scope.unitId || r.personId !== personId || r.classId !== src.classId || r.rowKey !== src.rowKey
      || schoolYear !== scope.schoolYear - (reason === 'current_same_class' ? 0 : 1)
      || (reason === 'current_same_class' || reason === 'previous_same_class' || reason === 'previous_same_class_row') && !sameClass
      || (reason === 'previous_same_row' || reason === 'previous_same_class_row') && !sameRow) bad('tjanst_evidence_mismatch');
    return { reason, unitId: uuid(r.unitId), schoolYear, versionId: uuid(r.versionId), rowId: uuid(r.rowId), personId, classId: src.classId, rowKey: src.rowKey, sourceKey: r.sourceKey as string };
  }), r => `${r.reason}:${r.versionId}:${r.rowId}`);
  if (!reasons.length || !references.length || reasons.some(r => !references.some(e => e.reason === r)) || references.some(r => !reasons.includes(r.reason))) bad();
  return { suggestionId: text(s.suggestionId, 240), personId, evidenceHash: hash(s.evidenceHash), reasons, references };
}
export function parseYearReply(value: unknown, expected: TjanstYearRequest): TjanstYearReply {
  return guarded(() => {
    const q = parseYearRequest(expected), raw = gymObject(value);
    const extra = q.mode === 'catalog' ? ['candidates', 'totalCandidates'] : q.mode === 'row'
      ? ['sourceKey', 'rowId', 'need', 'currentRow', 'candidates', 'totalCandidates', 'recommendationStatus', 'suggestions']
      : ['action', 'previewHash', 'items', 'selectedCount', 'writeObjectCount', 'jointTotals', 'blockers'];
    const r = shape(raw, ['contractVersion', 'unitId', 'schoolYear', 'mode', 'currentRevision', 'baseVersionId', 'basisHash', ...extra]);
    if (r.mode !== q.mode || r.unitId !== q.unitId || r.schoolYear !== q.schoolYear) bad('wrong_scope');
    const base: TjanstYearReplyBase = { contractVersion: choice(r.contractVersion, [TJANST_YEAR_CONTRACT_VERSION]), unitId: q.unitId, schoolYear: q.schoolYear,
      currentRevision: integer(r.currentRevision), baseVersionId: nullableUuid(r.baseVersionId), basisHash: hash(r.basisHash) };
    if (q.mode === 'batch') return batchReply(r, base, q.batch);
    const candidates = unique(list(r.candidates, TJANST_LIMITS.people, v => candidate(v, q.schoolYear)), c => c.personId);
    const totalCandidates = integer(r.totalCandidates, TJANST_LIMITS.people); if (totalCandidates !== candidates.length) bad('tjanst_catalog_incomplete');
    if (q.mode === 'catalog') return { ...base, mode: 'catalog', candidates, totalCandidates };
    const n = need(r.need, q.schoolYear), row = r.currentRow === null ? null : currentRow(r.currentRow, q.schoolYear);
    if (r.sourceKey !== q.sourceKey || r.rowId !== q.rowId || n.sourceKey !== q.sourceKey || (row?.id ?? null) !== q.rowId
      || row !== null && (row.sourceKey !== q.sourceKey || base.baseVersionId === null)) bad('wrong_scope');
    const recommendationStatus = choice(r.recommendationStatus, ['ready', 'empty', 'unavailable'] as const);
    const suggestions = unique(list(r.suggestions, TJANST_LIMITS.people, v => suggestion(v, q, n, base.baseVersionId)), s => s.suggestionId);
    unique(suggestions, s => s.personId);
    if ((recommendationStatus === 'ready') !== (suggestions.length > 0) || suggestions.some(s => !candidates.some(c => c.personId === s.personId))) bad();
    return { ...base, mode: 'row', sourceKey: q.sourceKey, rowId: q.rowId, need: n, currentRow: row, candidates, totalCandidates, recommendationStatus, suggestions };
  });
}
function previewState(v: unknown) { const s = shape(v, ['personId', 'ht', 'vt']); return { personId: nullableUuid(s.personId), ht: minutes(s.ht), vt: minutes(s.vt) }; }
function batchReply(r: Record<string, unknown>, base: TjanstYearReplyBase, request: TjanstYearBatch): TjanstYearBatchReply {
  if (r.action !== request.action || base.baseVersionId !== request.baseVersionId) bad('wrong_scope');
  const blockers = list(r.blockers, 500, v => { const b = shape(v, ['itemKey', 'groupId', 'code']), itemKey = text(b.itemKey);
    if (!request.items.some(i => i.itemKey === itemKey)) bad('wrong_scope');
    return { itemKey, groupId: nullableUuid(b.groupId), code: choice(b.code, TJANST_YEAR_BLOCKERS) }; });
  const items = unique(list(r.items, 100, v => { const i = shape(v, ['itemKey', 'kind', 'id', 'sourceKey', 'classId', 'jointGroupId', 'before', 'after']);
    const kind = choice(i.kind, ['row', 'special'] as const), classId = nullableUuid(i.classId), itemKey = text(i.itemKey);
    const blocked = blockers.some(b => b.itemKey === itemKey);
    if (kind === 'row') {
      if (i.sourceKey === null) { if (!blocked || classId !== null) bad(); }
      else { const src = source(i.sourceKey, base.schoolYear); if (src.classId !== classId) bad(); }
    } else if (i.sourceKey !== null || i.jointGroupId !== null) bad();
    if (i.after === null && !blocked) bad();
    return { itemKey, kind, id: nullableUuid(i.id), sourceKey: i.sourceKey === null ? null : text(i.sourceKey, 240), classId,
      jointGroupId: nullableUuid(i.jointGroupId), before: i.before === null ? null : previewState(i.before), after: i.after === null ? null : previewState(i.after) }; }), i => i.itemKey);
  const selectedCount = integer(r.selectedCount, 100, 1), writeObjectCount = integer(r.writeObjectCount);
  if (selectedCount !== request.items.length || items.length !== selectedCount || writeObjectCount < selectedCount) bad();
  for (const item of items) {
    const requested = request.items.find(i => i.itemKey === item.itemKey); if (!requested || requested.kind !== item.kind) bad('wrong_scope');
    const selected = 'choice' in requested ? requested.choice : requested.payload.planningContext.choice;
    if (item.after !== null && selected.personId !== item.after.personId) bad('tjanst_choice_mismatch');
    if ('id' in requested) {
      if (item.id !== requested.id) bad('wrong_scope');
      if (item.before === null) { if (!blockers.some(b => b.itemKey === item.itemKey) || item.after !== null) bad(); }
      else {
        if (item.before.personId !== requested.fromPersonId) bad('wrong_scope');
        if (item.after !== null && (item.before.ht !== item.after.ht || item.before.vt !== item.after.vt)) bad('tjanst_time_mismatch');
      }
    } else {
      if (item.id !== null || item.before !== null || requested.kind === 'row' && item.sourceKey !== requested.payload.sourceKey
        || requested.kind === 'special' && item.classId !== requested.payload.classId) bad('wrong_scope');
      const ht = requested.kind === 'row' ? requested.payload.teacherHt : requested.payload.ht;
      const vt = requested.kind === 'row' ? requested.payload.teacherVt : requested.payload.vt;
      if (item.after !== null && (item.after.ht !== ht || item.after.vt !== vt)) bad('tjanst_time_mismatch');
    }
  }
  if (writeObjectCount > 100 && !blockers.some(b => b.code === 'batch_too_large')) bad();
  // Totals describe only moved teachers; the full group's membership/times belong to the server preview hash.
  const jointTotals = unique(list(r.jointTotals, 100, v => { const t = shape(v, ['jointId', 'personId', 'ht', 'vt']);
    const jointId = uuid(t.jointId); if (!items.some(i => i.jointGroupId === jointId && i.after?.personId === t.personId)) bad('wrong_scope');
    return { jointId, personId: uuid(t.personId), ht: minutes(t.ht), vt: minutes(t.vt) }; }), t => `${t.jointId}:${t.personId}`);
  if (items.some(i => i.jointGroupId !== null && i.after?.personId != null && !jointTotals.some(t => t.jointId === i.jointGroupId && t.personId === i.after?.personId))) bad('tjanst_joint_incomplete');
  return { ...base, mode: 'batch', action: request.action, previewHash: hash(r.previewHash), items, selectedCount, writeObjectCount, jointTotals, blockers };
}
export function parseYearPlanCommand(value: unknown): TjanstYearCommand {
  return guarded(() => {
    assertTjanstYearInputSize(value);
    const action = choice(gymObject(value).action, ['save_row', ...TJANST_YEAR_EDIT_ACTIONS, 'move', 'bulk'] as const);
    const r = shape(value, ['commandId', 'unitId', 'schoolYear', 'action', 'expectedRevision', 'payloadHash', 'payload', ...(action === 'publish' ? ['expectedContentHash'] : [])]);
    const schoolYear = year(r.schoolYear); let payload: TjanstYearPayload[TjanstYearAction];
    if (action === 'save_row') payload = saveRow(r.payload, schoolYear);
    else if (action === 'move' || action === 'bulk') {
      const p = shape(r.payload, ['action', 'baseVersionId', 'items', 'expectedPreviewHash']);
      if (p.action !== action) bad();
      payload = { ...parseYearBatch({ action: p.action, baseVersionId: p.baseVersionId, items: p.items }, schoolYear), expectedPreviewHash: hash(p.expectedPreviewHash) };
    } else {
      const { mutationContext, ...rest } = gymObject(r.payload), context = parseYearMutationContext(mutationContext);
      if ((action === 'publish' || action === 'discard_draft') && context.baseVersionId === null) bad();
      payload = { ...basePayload(action, rest), mutationContext: context };
    }
    return { commandId: uuid(r.commandId), unitId: uuid(r.unitId), schoolYear, action, expectedRevision: integer(r.expectedRevision), payloadHash: hash(r.payloadHash), payload,
      ...(action === 'publish' ? { expectedContentHash: hash(r.expectedContentHash) } : {}) } as TjanstYearCommand;
  });
}
/** Payload domain intentionally stays tjanst_payload_v1: same plan journal, new context included in exact payload. */
type UnhashedCommand = TjanstYearCommand extends infer C ? C extends TjanstYearCommand ? Omit<C, 'payloadHash'> : never : never;
export async function createYearPlanCommand(value: UnhashedCommand): Promise<TjanstYearCommand> {
  const q = parseYearPlanCommand({ ...value, payloadHash: `sha256:${'0'.repeat(64)}` });
  return { ...q, payloadHash: await tjanstHashCanonical(['tjanst_payload_v1', q.action, q.payload]) };
}
export async function verifyYearPlanCommandHash(value: unknown): Promise<TjanstYearCommand> {
  const q = parseYearPlanCommand(value);
  if (await tjanstHashCanonical(['tjanst_payload_v1', q.action, q.payload]) !== q.payloadHash) bad('tjanst_payload_hash'); return q;
}
/** Domain-separated canonical vectors shared with SQL; no JSON text/hash or object insertion-order dependence. */
export function tjanstYearHash(kind: 'basis' | 'person' | 'evidence' | 'preview', value: unknown): Promise<string> {
  return tjanstHashCanonical([TJANST_YEAR_CONTRACT_VERSION, kind, value]);
}
export function yearPlanCommandRef(value: TjanstYearCommand) {
  const q = parseYearPlanCommand(value);
  return { family: 'plan' as const, commandId: q.commandId, action: q.action,
    target: { unitId: q.unitId, schoolYear: q.schoolYear, versionId: null, personId: null } };
}
/** Form-side check only. SQL must recompute these dependencies under the customer/distribution lock. */
export function assertYearRowContext(payload: TjanstYearSaveRow, support: TjanstYearRowReply): void {
  guarded(() => {
    const p = saveRow(payload, support.schoolYear), c = p.planningContext;
    if (p.sourceKey !== support.sourceKey || p.rowId !== support.rowId || c.baseVersionId !== support.baseVersionId
      || c.expectedBasisHash !== support.basisHash) bad('tjanst_stale_basis');
    const selected = c.choice;
    if (selected.kind === 'unassigned') return;
    const person = support.candidates.find(candidate => candidate.personId === selected.personId);
    if (!person || person.personBasisHash !== selected.expectedPersonBasisHash) bad('tjanst_stale_person');
    if (selected.kind === 'suggestion') {
      const found = support.suggestions.find(s => s.suggestionId === selected.suggestionId && s.personId === selected.personId);
      if (support.recommendationStatus !== 'ready' || !found || found.evidenceHash !== selected.expectedEvidenceHash) bad('tjanst_stale_evidence');
    }
  });
}

export type TjanstYearReceipt = { commandId: string; action: TjanstYearAction; versionId: string | null;
  revision: number; contentHash: string; replayed: boolean; changed: boolean };
/** Usable by plan 18's SQL probes before the HTTP/legacy parser integration in plan 19. */
export function parseYearPlanReceipt(value: unknown, command: TjanstYearCommand): TjanstYearReceipt {
  return guarded(() => {
    const q = parseYearPlanCommand(command), r = shape(value, ['commandId', 'action', 'versionId', 'revision', 'contentHash', 'replayed', 'changed']);
    if (r.commandId !== q.commandId || r.action !== q.action || r.revision !== q.expectedRevision + 1) bad('tjanst_revision_conflict');
    const versionId = nullableUuid(r.versionId); if (q.action !== 'discard_draft' && versionId === null) bad();
    return { commandId: q.commandId, action: q.action, versionId, revision: integer(r.revision), contentHash: hash(r.contentHash), replayed: gymBoolean(r.replayed), changed: gymBoolean(r.changed) };
  });
}
