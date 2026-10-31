import {
  ELECTIVE_BLOCK_KINDS, electiveEnum, electiveInteger, electiveText, electiveUuid, electiveFail,
  parseElectiveOption, type ElectiveBlockKind, type ElectiveOption,
} from './elective-block-contract.ts';
import { tjanstHashCanonical } from './tjanst-contract.ts';

/** Local planning metadata; Group/Activity identities are created only by explicit materialisation. */
export const ELECTIVE_PREPARATION_VERSION = 'elective_preparation_v1' as const;
export const ELECTIVE_PREPARATION_LIMITS = { frames: 20, slots: 16, options: 100, groups: 200, classes: 250, bytes: 512_000 } as const;
export type ElectivePreparationScope = { unitId: string; planId: string; schoolYear: number; columnId: string };
export type ElectivePreparationProfile = 'single' | 'terms' | 'even' | 'custom';
export type ElectivePreparationExistingBlock = { id: string; name: string; revision: number; classIds: string[] };
export type ElectivePreparationFrame = {
  rowKey: string; label: string; kind: ElectiveBlockKind;
  pointsHt: number | null; pointsVt: number | null; needHt: number | null; needVt: number | null;
  needBasis: 'terms' | 'even_split'; allowedCodesByPoints: Record<string, string[]>; existingBlocks: ElectivePreparationExistingBlock[];
  detailId: string | null; detailRevision: number; appliedDetailRevision: number | null;
};
export type ElectivePreparationClass = { classId: string; className: string; linkRevision: number };
export type ElectivePreparationGroup = { id: string; optionId: string; name: string; classIds: string[]; estimatedPupils: number | null };
export type ElectivePreparationSlot = {
  positionId: string; blockId: string; name: string; pointsHt: number | null; pointsVt: number | null;
  needHt: number; needVt: number; options: ElectiveOption[]; groups: ElectivePreparationGroup[];
};
export type ElectivePreparationFrameDraft = { rowKey: string; detailId: string; expectedDetailRevision: number; profile: ElectivePreparationProfile; slots: ElectivePreparationSlot[] };
export type ElectivePreparationDraft = { id: string; classIds: string[]; frames: ElectivePreparationFrameDraft[] };
export type ElectivePreparation = { id: string; revision: number; appliedRevision: number | null; draft: ElectivePreparationDraft; sourceHash: string; materializedBlockIds: string[] };
export type ElectivePreparationRead = ElectivePreparationScope & {
  contractVersion: typeof ELECTIVE_PREPARATION_VERSION; planName: string; planVersion: number; planRevision: number;
  schoolform: 'gymnasium' | 'grundskola'; catalogId: string | null; sourceHash: string; frames: ElectivePreparationFrame[];
  classes: ElectivePreparationClass[]; preparation: ElectivePreparation | null; blockers: string[];
};
export type ElectivePreparationCommand = ElectivePreparationScope & {
  contractVersion: typeof ELECTIVE_PREPARATION_VERSION; action: 'save' | 'apply'; commandId: string;
  expectedRevision: number; expectedSourceHash: string; draft: ElectivePreparationDraft;
};
export type ElectivePreparationRef = ElectivePreparationScope & { commandId: string; action: 'save' | 'apply'; payloadHash: string };
export type ElectivePreparationReceipt = ElectivePreparationRef & { preparationId: string; revision: number; appliedRevision: number | null; blockIds: string[]; replayed: boolean };
export type ElectivePreparationReply = { receipt: ElectivePreparationReceipt; read: ElectivePreparationRead };
export type ElectivePreparationStatus = { state: 'not_found'; result: null } | { state: 'found'; result: ElectivePreparationReply };
export type ElectivePreparationAllocation = Pick<ElectivePreparationSlot, 'pointsHt' | 'pointsVt' | 'needHt' | 'needVt'>;
export type ElectivePreparationSlotIdentity = Pick<ElectivePreparationSlot, 'positionId' | 'blockId' | 'name'>;
export type ElectivePreparationIssue = { field: string; code: string; message: string };

const scopeKeys = ['unitId', 'planId', 'schoolYear', 'columnId'];
function fail(code = 'elective_preparation_invalid'): never { return electiveFail(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => 'get' in d || 'set' in d)) fail();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const r = object(value);
  if (Object.getOwnPropertyNames(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) fail();
  return r;
}
function array<T>(value: unknown, parse: (v: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => 'get' in d || 'set' in d)) fail();
  for (let i = 0; i < (value as unknown[]).length; i++) if (!Object.hasOwn(value, i)) fail();
  return (value as unknown[]).map(parse);
}
function unique<T>(rows: T[], key: (row: T) => unknown): T[] { if (new Set(rows.map(key)).size !== rows.length) fail('elective_preparation_duplicate'); return rows; }
const revision = (value: unknown) => electiveInteger(value, 1, 2147483646);
const maybe = <T>(value: unknown, parse: (v: unknown) => T): T | null => value === null ? null : parse(value);
const points = (value: unknown) => maybe(value, v => electiveInteger(v, 0, 10000));
const minutes = (value: unknown) => electiveInteger(value, 0, 6000000);
const ids = (value: unknown, max: number = ELECTIVE_PREPARATION_LIMITS.classes) => unique(array(value, electiveUuid, max), x => x);
function hash(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('elective_preparation_hash'); return value as string; }
const rowKey = (value: unknown) => electiveText(value, 160);
function scopeFrom(r: Record<string, unknown>): ElectivePreparationScope { return parseElectivePreparationScope(Object.fromEntries(scopeKeys.map(k => [k, r[k]]))); }
function sameScope(a: ElectivePreparationScope, b: ElectivePreparationScope): void {
  if (scopeKeys.some(k => a[k as keyof ElectivePreparationScope] !== b[k as keyof ElectivePreparationScope])) fail('elective_preparation_scope');
}
export function parseElectivePreparationScope(value: unknown): ElectivePreparationScope {
  const r = shape(value, scopeKeys), columnId = electiveText(r.columnId, 10);
  if (!/^(ar[1-3]|ak[1-9])$/u.test(columnId)) fail('elective_preparation_scope');
  return { unitId: electiveUuid(r.unitId), planId: electiveUuid(r.planId), schoolYear: electiveInteger(r.schoolYear, 2000, 2100), columnId };
}
function parseCodes(value: unknown): Record<string, string[]> {
  const r = object(value), out: Record<string, string[]> = {};
  if (Object.keys(r).length > 100) fail();
  for (const [key, codes] of Object.entries(r)) {
    if (key !== 'null' && !/^[1-9]\d{0,3}$/u.test(key)) fail('elective_preparation_catalogue');
    out[key] = unique(array(codes, code => electiveText(code, 80), 3000), x => x);
  }
  return out;
}
export function parseElectivePreparationFrame(value: unknown): ElectivePreparationFrame {
  const r = shape(value, ['rowKey', 'label', 'kind', 'pointsHt', 'pointsVt', 'needHt', 'needVt', 'needBasis', 'allowedCodesByPoints', 'existingBlocks', 'detailId', 'detailRevision', 'appliedDetailRevision']);
  const frame: ElectivePreparationFrame = {
    rowKey: rowKey(r.rowKey), label: electiveText(r.label, 300), kind: electiveEnum(r.kind, ELECTIVE_BLOCK_KINDS),
    pointsHt: points(r.pointsHt), pointsVt: points(r.pointsVt), needHt: maybe(r.needHt, minutes), needVt: maybe(r.needVt, minutes),
    needBasis: electiveEnum(r.needBasis, ['terms', 'even_split']), allowedCodesByPoints: parseCodes(r.allowedCodesByPoints),
    existingBlocks: unique(array(r.existingBlocks, value => { const b = shape(value, ['id', 'name', 'revision', 'classIds']); return { id: electiveUuid(b.id), name: electiveText(b.name), revision: revision(b.revision), classIds: ids(b.classIds) }; }, 250), b => b.id),
    detailId: maybe(r.detailId, electiveUuid), detailRevision: electiveInteger(r.detailRevision), appliedDetailRevision: maybe(r.appliedDetailRevision, revision),
  };
  if ((frame.pointsHt === null) !== (frame.pointsVt === null) || (frame.detailId === null) !== (frame.detailRevision === 0)
    || frame.appliedDetailRevision !== null && frame.appliedDetailRevision > frame.detailRevision) fail('elective_preparation_frame');
  return frame;
}
export function parseElectivePreparationGroup(value: unknown): ElectivePreparationGroup {
  const r = shape(value, ['id', 'optionId', 'name', 'classIds', 'estimatedPupils']);
  return { id: electiveUuid(r.id), optionId: electiveUuid(r.optionId), name: electiveText(r.name), classIds: ids(r.classIds), estimatedPupils: maybe(r.estimatedPupils, v => electiveInteger(v, 0, 10000)) };
}
export function parseElectivePreparationSlot(value: unknown): ElectivePreparationSlot {
  const r = shape(value, ['positionId', 'blockId', 'name', 'pointsHt', 'pointsVt', 'needHt', 'needVt', 'options', 'groups']);
  const options = unique(array(r.options, v => parseElectiveOption(shape(v, ['id', 'name', 'subjectCode', 'levelCode', 'language', 'points'])), ELECTIVE_PREPARATION_LIMITS.options), o => o.id);
  const groups = unique(array(r.groups, parseElectivePreparationGroup, ELECTIVE_PREPARATION_LIMITS.groups), g => g.id);
  const slot: ElectivePreparationSlot = { positionId: electiveUuid(r.positionId), blockId: electiveUuid(r.blockId), name: electiveText(r.name, 160), pointsHt: points(r.pointsHt), pointsVt: points(r.pointsVt), needHt: minutes(r.needHt), needVt: minutes(r.needVt), options, groups };
  if ((slot.pointsHt === null) !== (slot.pointsVt === null) || groups.some(g => !options.some(o => o.id === g.optionId))) fail('elective_preparation_slot');
  if (slot.pointsHt !== null && (slot.pointsHt + slot.pointsVt! <= 0 || slot.pointsHt === 0 && slot.needHt !== 0 || slot.pointsVt === 0 && slot.needVt !== 0)) fail('elective_preparation_slot');
  if (slot.needHt + slot.needVt <= 0) fail('elective_preparation_time_missing');
  return slot;
}
export function parseElectivePreparationDraft(value: unknown): ElectivePreparationDraft {
  const r = shape(value, ['id', 'classIds', 'frames']);
  const frames = unique(array(r.frames, value => {
    const f = shape(value, ['rowKey', 'detailId', 'expectedDetailRevision', 'profile', 'slots']);
    return { rowKey: rowKey(f.rowKey), detailId: electiveUuid(f.detailId), expectedDetailRevision: electiveInteger(f.expectedDetailRevision), profile: electiveEnum(f.profile, ['single', 'terms', 'even', 'custom']), slots: unique(array(f.slots, parseElectivePreparationSlot, ELECTIVE_PREPARATION_LIMITS.slots), s => s.positionId) };
  }, ELECTIVE_PREPARATION_LIMITS.frames), f => f.rowKey);
  const draft = { id: electiveUuid(r.id), classIds: ids(r.classIds), frames };
  const childIds = [draft.id, ...frames.flatMap(f => [f.detailId, ...f.slots.flatMap(s => [s.positionId, s.blockId, ...s.options.map(o => o.id), ...s.groups.map(g => g.id)])])];
  if (new Set(childIds).size !== childIds.length) fail('elective_preparation_duplicate');
  if (frames.some(f => f.slots.some(s => s.groups.some(g => g.classIds.some(id => !draft.classIds.includes(id)))))) fail('elective_preparation_class');
  return draft;
}
function parsePreparation(value: unknown): ElectivePreparation {
  const r = shape(value, ['id', 'revision', 'appliedRevision', 'draft', 'sourceHash', 'materializedBlockIds']);
  const p = { id: electiveUuid(r.id), revision: revision(r.revision), appliedRevision: maybe(r.appliedRevision, revision), draft: parseElectivePreparationDraft(r.draft), sourceHash: hash(r.sourceHash), materializedBlockIds: ids(r.materializedBlockIds, ELECTIVE_PREPARATION_LIMITS.frames * ELECTIVE_PREPARATION_LIMITS.slots) };
  if (p.id !== p.draft.id || p.appliedRevision !== null && p.appliedRevision > p.revision || p.appliedRevision === null && p.materializedBlockIds.length > 0) fail('elective_preparation_revision');
  return p;
}
export function parseElectivePreparationRead(value: unknown, expected: ElectivePreparationScope): ElectivePreparationRead {
  const r = shape(value, [...scopeKeys, 'contractVersion', 'planName', 'planVersion', 'planRevision', 'schoolform', 'catalogId', 'sourceHash', 'frames', 'classes', 'preparation', 'blockers']);
  const scope = scopeFrom(r); sameScope(scope, scopeFrom(object(expected)));
  if (r.contractVersion !== ELECTIVE_PREPARATION_VERSION) fail('elective_preparation_version');
  const schoolform = electiveEnum(r.schoolform, ['gymnasium', 'grundskola']);
  if ((schoolform === 'gymnasium') !== scope.columnId.startsWith('ar')) fail('elective_preparation_scope');
  const frames = unique(array(r.frames, parseElectivePreparationFrame, ELECTIVE_PREPARATION_LIMITS.frames), f => f.rowKey);
  if (frames.some(f => (schoolform === 'gymnasium') !== (f.pointsHt !== null) || !(schoolform === 'gymnasium' ? ['modernLanguage', 'individualChoice', 'specialization'] : ['languageChoice', 'schoolChoice']).includes(f.kind))) fail('elective_preparation_frame');
  const classes = unique(array(r.classes, value => { const c = shape(value, ['classId', 'className', 'linkRevision']); return { classId: electiveUuid(c.classId), className: electiveText(c.className), linkRevision: electiveInteger(c.linkRevision) }; }, ELECTIVE_PREPARATION_LIMITS.classes), c => c.classId);
  return { ...scope, contractVersion: ELECTIVE_PREPARATION_VERSION, planName: electiveText(r.planName, 200), planVersion: revision(r.planVersion), planRevision: electiveInteger(r.planRevision), schoolform, catalogId: maybe(r.catalogId, v => electiveText(v, 200)), sourceHash: hash(r.sourceHash), frames, classes, preparation: maybe(r.preparation, parsePreparation), blockers: array(r.blockers, x => electiveText(x, 1000), 100) };
}
export function parseElectivePreparationCommand(value: unknown): ElectivePreparationCommand {
  const r = shape(value, [...scopeKeys, 'contractVersion', 'action', 'commandId', 'expectedRevision', 'expectedSourceHash', 'draft']);
  if (r.contractVersion !== ELECTIVE_PREPARATION_VERSION) fail('elective_preparation_version');
  const command: ElectivePreparationCommand = { ...scopeFrom(r), contractVersion: ELECTIVE_PREPARATION_VERSION, action: electiveEnum(r.action, ['save', 'apply']), commandId: electiveUuid(r.commandId), expectedRevision: electiveInteger(r.expectedRevision, 0, 2147483645), expectedSourceHash: hash(r.expectedSourceHash), draft: parseElectivePreparationDraft(r.draft) };
  if (new TextEncoder().encode(JSON.stringify(command)).length > ELECTIVE_PREPARATION_LIMITS.bytes) fail('elective_preparation_size');
  return command;
}
export function parseElectivePreparationRef(value: unknown): ElectivePreparationRef {
  const r = shape(value, [...scopeKeys, 'commandId', 'action', 'payloadHash']);
  return { ...scopeFrom(r), commandId: electiveUuid(r.commandId), action: electiveEnum(r.action, ['save', 'apply']), payloadHash: hash(r.payloadHash) };
}
export async function createElectivePreparationRef(input: ElectivePreparationCommand): Promise<ElectivePreparationRef> {
  const command = parseElectivePreparationCommand(input);
  return { unitId: command.unitId, planId: command.planId, schoolYear: command.schoolYear, columnId: command.columnId, commandId: command.commandId, action: command.action, payloadHash: (await tjanstHashCanonical(command)).slice('sha256:'.length) };
}
export function parseElectivePreparationReply(value: unknown, ref: ElectivePreparationRef): ElectivePreparationReply {
  const r = shape(value, ['receipt', 'read']), rc = shape(r.receipt, [...scopeKeys, 'commandId', 'action', 'payloadHash', 'preparationId', 'revision', 'appliedRevision', 'blockIds', 'replayed']);
  const actual = parseElectivePreparationRef(Object.fromEntries([...scopeKeys, 'commandId', 'action', 'payloadHash'].map(k => [k, rc[k]])));
  sameScope(actual, ref);
  if (actual.commandId !== ref.commandId || actual.action !== ref.action || actual.payloadHash !== ref.payloadHash || typeof rc.replayed !== 'boolean') fail('elective_preparation_receipt');
  const receipt = { ...actual, preparationId: electiveUuid(rc.preparationId), revision: revision(rc.revision), appliedRevision: maybe(rc.appliedRevision, revision), blockIds: ids(rc.blockIds, ELECTIVE_PREPARATION_LIMITS.frames * ELECTIVE_PREPARATION_LIMITS.slots), replayed: rc.replayed };
  const read = parseElectivePreparationRead(r.read, ref), preparation = read.preparation;
  if (!preparation || preparation.id !== receipt.preparationId || preparation.revision !== receipt.revision || preparation.appliedRevision !== receipt.appliedRevision
    || receipt.action === 'apply' && receipt.appliedRevision !== receipt.revision
    || JSON.stringify(preparation.materializedBlockIds) !== JSON.stringify(receipt.blockIds)
    || receipt.action === 'apply' && (!receipt.blockIds.length || JSON.stringify([...receipt.blockIds].sort()) !== JSON.stringify(preparation.draft.frames.flatMap(f => f.slots.map(s => s.blockId)).sort()))) fail('elective_preparation_receipt');
  return { receipt, read };
}
export function parseElectivePreparationStatus(value: unknown, ref: ElectivePreparationRef): ElectivePreparationStatus {
  const r = shape(value, ['state', 'result']);
  if (r.state === 'not_found' && r.result === null) return { state: 'not_found', result: null };
  if (r.state === 'found') return { state: 'found', result: parseElectivePreparationReply(r.result, ref) };
  fail('elective_preparation_status');
}
export function assertElectivePreparationReplyCommand(reply: ElectivePreparationReply, command: ElectivePreparationCommand): void {
  if (reply.receipt.preparationId !== command.draft.id || reply.receipt.revision !== command.expectedRevision + 1
    || JSON.stringify(reply.read.preparation?.draft) !== JSON.stringify(command.draft)) fail('elective_preparation_receipt');
  // read.sourceHash may legitimately include our newly applied time-detail revisions.
}

function timeBudget(frame: ElectivePreparationFrame): { ht: number; vt: number } {
  const ht = frame.needHt === null && frame.pointsHt === 0 ? 0 : frame.needHt;
  const vt = frame.needVt === null && frame.pointsVt === 0 ? 0 : frame.needVt;
  if (ht === null || vt === null || ht + vt <= 0) fail('elective_preparation_time_missing');
  return { ht: ht!, vt: vt! };
}
function allocations(frame: ElectivePreparationFrame, profile: ElectivePreparationProfile, custom?: ElectivePreparationAllocation[]): ElectivePreparationAllocation[] {
  const { ht, vt } = timeBudget(frame);
  if (profile === 'custom') { if (!custom) fail('elective_preparation_profile'); return custom!; }
  if (profile === 'single') return [{ pointsHt: frame.pointsHt, pointsVt: frame.pointsVt, needHt: ht, needVt: vt }];
  if (frame.pointsHt === null || frame.pointsVt === null) fail('elective_preparation_profile');
  const ph = frame.pointsHt!, pv = frame.pointsVt!;
  if (profile === 'terms') {
    if (ph <= 0 || pv <= 0 || ht <= 0 || vt <= 0) fail('elective_preparation_profile');
    return [{ pointsHt: ph, pointsVt: 0, needHt: ht, needVt: 0 }, { pointsHt: 0, pointsVt: pv, needHt: 0, needVt: vt }];
  }
  if ((ph + pv) % 2 || ph + pv < 2 || ph === 1 || pv === 1) fail('elective_preparation_profile');
  const firstHt = Math.ceil(ph / 2), firstVt = (ph + pv) / 2 - firstHt;
  return [{ pointsHt: firstHt, pointsVt: firstVt, needHt: Math.ceil(ht / 2), needVt: Math.ceil(vt / 2) },
    { pointsHt: ph - firstHt, pointsVt: pv - firstVt, needHt: Math.floor(ht / 2), needVt: Math.floor(vt / 2) }];
}
export function proposePreparationSlots(frame: ElectivePreparationFrame, profile: ElectivePreparationProfile, identities: ElectivePreparationSlotIdentity[], custom?: ElectivePreparationAllocation[]): ElectivePreparationSlot[] {
  const values = allocations(frame, profile, custom);
  if (identities.length !== values.length) fail('elective_preparation_identity');
  const slots = values.map((value, index) => parseElectivePreparationSlot({ ...identities[index], ...value, options: [], groups: [] }));
  validateElectivePreparationAllocation(frame, slots);
  return slots;
}
export const deriveElectivePreparationSlots = proposePreparationSlots;
export function availableElectivePreparationProfiles(frame: ElectivePreparationFrame): ElectivePreparationProfile[] {
  return (['single', 'terms', 'even'] as const).filter(profile => {
    try { const values = allocations(frame, profile); validateElectivePreparationAllocation(frame, values); return values.every(v => (frame.allowedCodesByPoints[v.pointsHt === null ? 'null' : String(v.pointsHt + v.pointsVt!)]?.length ?? 0) > 0); } catch { return false; }
  });
}
export function validateElectivePreparationAllocation(frame: ElectivePreparationFrame, slots: readonly ElectivePreparationAllocation[]): void {
  const { ht, vt } = timeBudget(frame);
  if (!slots.length || slots.length > ELECTIVE_PREPARATION_LIMITS.slots) fail('elective_preparation_time_missing');
  if (slots.some(s => !Number.isSafeInteger(s.needHt) || !Number.isSafeInteger(s.needVt) || s.needHt < 0 || s.needVt < 0 || s.needHt + s.needVt <= 0
    || s.pointsHt !== null && (!Number.isSafeInteger(s.pointsHt) || !Number.isSafeInteger(s.pointsVt) || s.pointsHt < 0 || s.pointsVt! < 0 || s.pointsHt + s.pointsVt! <= 0 || s.pointsHt === 0 && s.needHt !== 0 || s.pointsVt === 0 && s.needVt !== 0))) fail('elective_preparation_slot');
  if (slots.reduce((n, s) => n + s.needHt, 0) !== ht || slots.reduce((n, s) => n + s.needVt, 0) !== vt) fail('elective_preparation_total');
  if (frame.pointsHt === null) { if (slots.length !== 1 || slots[0].pointsHt !== null || slots[0].pointsVt !== null) fail('elective_preparation_profile'); }
  else if (slots.some(s => s.pointsHt === null || s.pointsVt === null) || slots.reduce((n, s) => n + s.pointsHt!, 0) !== frame.pointsHt || slots.reduce((n, s) => n + s.pointsVt!, 0) !== frame.pointsVt) fail('elective_preparation_total');
}
export function electivePreparationIssues(draft: ElectivePreparationDraft, read: ElectivePreparationRead, applying = false): ElectivePreparationIssue[] {
  const issues: ElectivePreparationIssue[] = [], add = (field: string, code: string, message: string) => issues.push({ field, code, message });
  if (applying) {
    for (const blocker of read.blockers) add('source', 'elective_preparation_source', blocker);
    if (draft.classIds.length > 100) add('classes', 'elective_preparation_class_limit', 'Högst 100 klasser kan ingå i ett gemensamt gruppunderlag.');
    if (!draft.classIds.length) add('classes', 'elective_preparation_classes_missing', 'Välj klasser innan gruppunderlaget skapas.');
    if (!draft.frames.length) add('frames', 'elective_preparation_frames_missing', 'Välj minst en valram att förbereda.');
  }
  if (draft.classIds.some(id => !read.classes.some(c => c.classId === id))) add('classes', 'elective_preparation_class', 'Klasskopplingen har ändrats. Välj aktuella klasser.');
  for (const entry of draft.frames) {
    const frame = read.frames.find(f => f.rowKey === entry.rowKey);
    if (!frame) { add(entry.rowKey, 'elective_preparation_frame_missing', 'Valramen finns inte i det aktuella timplansunderlaget.'); continue; }
    if (frame.detailId !== null && frame.detailId !== entry.detailId || frame.detailRevision !== entry.expectedDetailRevision) add(entry.rowKey, 'elective_preparation_source', 'Tidsfördelningen har ändrats. Hämta aktuellt underlag.');
    if (!entry.slots.length) { if (applying) add(entry.rowKey, 'elective_preparation_slots_missing', 'Välj hur kurserna ska läsas.'); continue; }
    try { validateElectivePreparationAllocation(frame, entry.slots); } catch { add(entry.rowKey, 'elective_preparation_total', 'Fördelningen behöver bevara timplanens poäng och tid för både HT och VT.'); }
    if (read.schoolform === 'grundskola' && entry.profile !== 'single') add(entry.rowKey, 'elective_preparation_profile', 'Grundskolans val använder timplansramens undervisningstid utan gymnasiepoäng.');
    if (entry.profile !== 'custom') { try { const expected = allocations(frame, entry.profile); if (JSON.stringify(expected) !== JSON.stringify(entry.slots.map(({ pointsHt, pointsVt, needHt, needVt }) => ({ pointsHt, pointsVt, needHt, needVt })))) add(entry.rowKey, 'elective_preparation_profile', 'Tidsfördelningen stämmer inte med det valda upplägget.'); } catch { add(entry.rowKey, 'elective_preparation_profile', 'Det valda upplägget passar inte timplansramen.'); } }
    for (const slot of entry.slots) {
      const key = slot.pointsHt === null ? 'null' : String(slot.pointsHt + slot.pointsVt!);
      if (applying && !slot.options.length) add(slot.blockId, 'elective_preparation_options_missing', 'Välj minst ett alternativ för varje kursval.');
      for (const option of slot.options) {
        if (!frame.allowedCodesByPoints[key]?.includes(option.levelCode) || option.points !== (key === 'null' ? null : Number(key))) add(slot.blockId, 'elective_option_not_allowed', 'Alternativet passar inte kursvalets frysta utbildningsram.');
        if (applying && !slot.groups.some(group => group.optionId === option.id)) add(slot.blockId, 'elective_preparation_groups_missing', 'Varje alternativ behöver minst en undervisningsgrupp.');
      }
      for (const group of slot.groups) {
        if (group.classIds.some(id => !draft.classIds.includes(id))) add(group.id, 'elective_preparation_class', 'Gruppens klasser behöver finnas i blockets klassurval.');
        if (applying && !group.classIds.length) add(group.id, 'elective_preparation_classes_missing', 'Välj vilka klasser som ingår i gruppen.');
      }
    }
  }
  return issues;
}
export function validateElectivePreparationDraft(draft: ElectivePreparationDraft, read: ElectivePreparationRead, applying = false): void {
  const issues = electivePreparationIssues(draft, read, applying);
  if (issues.length) fail(issues[0].code);
}
export function electivePreparationTotals(draft: ElectivePreparationDraft): { pupilHt: number; pupilVt: number; groupHt: number; groupVt: number; groups: number; blocks: number } {
  const slots = draft.frames.flatMap(frame => frame.slots);
  return { pupilHt: slots.reduce((n, s) => n + s.needHt, 0), pupilVt: slots.reduce((n, s) => n + s.needVt, 0), groupHt: slots.reduce((n, s) => n + s.needHt * s.groups.length, 0), groupVt: slots.reduce((n, s) => n + s.needVt * s.groups.length, 0), groups: slots.reduce((n, s) => n + s.groups.length, 0), blocks: slots.length };
}
/** Names are presentation only; IDs and explicitly changed names are retained across profile changes. */
export function reprofilePreparationFrame(frame: ElectivePreparationFrame, current: ElectivePreparationFrameDraft, profile: ElectivePreparationProfile, identities: ElectivePreparationSlotIdentity[]): ElectivePreparationFrameDraft {
  const proposed = proposePreparationSlots(frame, profile, identities);
  return { ...current, profile, slots: proposed.map((slot, index) => {
    const previous = current.slots[index];
    return previous ? { ...slot, positionId: previous.positionId, blockId: previous.blockId, name: previous.name, options: previous.options, groups: previous.groups } : slot;
  }) };
}

export async function hashElectivePreparationSource(read: ElectivePreparationRead): Promise<string> {
  const { sourceHash: _sourceHash, preparation: _preparation, ...source } = read;
  return (await tjanstHashCanonical(source)).slice('sha256:'.length);
}

/** Ref-only recovery verifies the payload retained in the immutable receipt without persisting a full draft locally. */
export async function assertElectivePreparationReplyHash(reply: ElectivePreparationReply): Promise<void> {
  const stored = reply.read.preparation;
  if (!stored) fail('elective_preparation_receipt');
  const command: ElectivePreparationCommand = { unitId: reply.receipt.unitId, planId: reply.receipt.planId, schoolYear: reply.receipt.schoolYear,
    columnId: reply.receipt.columnId, contractVersion: ELECTIVE_PREPARATION_VERSION, action: reply.receipt.action, commandId: reply.receipt.commandId,
    expectedRevision: reply.receipt.revision - 1, expectedSourceHash: stored!.sourceHash, draft: stored!.draft };
  if ((await createElectivePreparationRef(command)).payloadHash !== reply.receipt.payloadHash) fail('elective_preparation_receipt');
}
