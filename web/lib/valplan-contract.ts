import { ProgramplanContractError } from './programplan-catalog.ts';
import { VALPLAN_KINDS, parseValplan, type Valplan, type ValplanKind, type ValplanRowContext } from './valplan-model.ts';

/** Wire contract for /api/valplaner. The database is the source; the server re-checks model rules before saving. */
export const VALPLAN_CONTRACT_VERSION = 'valplan_v1' as const;
export type ValplanScope = { unitId: string; schoolYear: number };
export type ValplanRowOption = ValplanRowContext & { blockKind: ValplanKind; planName: string; rowLabel: string; classes: { id: string; name: string }[] };
/** Pupils with a choice in the block per class, so the view can ask before a class is unticked. */
export type ValplanClassChoices = { classId: string; pupils: number };
/** Pupils who chose a course, in all and per class, so the view can ask before the course or a class is removed. */
export type ValplanCourseChoices = { courseId: string; pupils: number; classes: ValplanClassChoices[] };
export type ValplanRead = ValplanScope & { contractVersion: typeof VALPLAN_CONTRACT_VERSION; valplans: { catalogId: string; valplan: Valplan; choiceCounts: ValplanClassChoices[]; courseChoices: ValplanCourseChoices[] }[]; rows: ValplanRowOption[] };
export type ValplanCommand = ValplanScope & { contractVersion: typeof VALPLAN_CONTRACT_VERSION; commandId: string; action: 'save'; expectedRevision: number; catalogId: string; valplan: Valplan };
export type ValplanReceipt = { commandId: string; valplanId: string; revision: number; replayed: boolean };
export type ValplanReply = { receipt: ValplanReceipt; read: ValplanRead };

function bad(): never { throw new ProgramplanContractError('invalid_valplan'); }
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  const row = value as Record<string, unknown>;
  if (keys.some(k => !Object.hasOwn(row, k)) || Object.getOwnPropertyNames(row).some(k => !keys.includes(k))) bad();
  return row;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) bad();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function text(value: unknown, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max) bad(); return value; }
function minutes(value: unknown): number | null { return value === null ? null : integer(value, 0, 1000000); }
function catalogId(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) bad(); return value; }

export function parseValplanScope(value: unknown): ValplanScope {
  const r = shape(value, ['unitId', 'schoolYear']);
  return { unitId: uuid(r.unitId), schoolYear: integer(r.schoolYear, 2000, 2100) };
}
function parseRow(value: unknown): ValplanRowOption {
  const r = shape(value, ['timplanId', 'timplanVersion', 'rowKey', 'year', 'rowKind', 'blockKind', 'points', 'minutesHt', 'minutesVt', 'classIds', 'allowedLevelKeys', 'blocks', 'planName', 'rowLabel', 'classes']);
  if (r.rowKind !== 'block' || typeof r.blockKind !== 'string' || !(VALPLAN_KINDS as readonly string[]).includes(r.blockKind)
    || typeof r.rowKey !== 'string' || !/^block:[a-z][a-z0-9]{0,15}$/u.test(r.rowKey) || r.allowedLevelKeys !== null) bad();
  const classes = list(r.classes, 500).map(c => { const x = shape(c, ['id', 'name']); return { id: uuid(x.id), name: text(x.name, 60) }; });
  const classIds = list(r.classIds, 500).map(uuid);
  if (classIds.length !== classes.length || classIds.some((id, i) => id !== classes[i].id)) bad();
  const blocks = list(r.blocks, 500).map(b => { const x = shape(b, ['valplanId', 'classIds']); return { valplanId: uuid(x.valplanId), classIds: list(x.classIds, 500).map(uuid) }; });
  if (new Set(blocks.map(b => b.valplanId)).size !== blocks.length || blocks.some(b => b.classIds.some(id => !classIds.includes(id)))) bad();
  return { timplanId: uuid(r.timplanId), timplanVersion: integer(r.timplanVersion, 1, 100000), rowKey: r.rowKey, year: integer(r.year, 1, 3) as 1 | 2 | 3,
    rowKind: 'block', blockKind: r.blockKind as ValplanKind, points: integer(r.points, 1, 10000), minutesHt: minutes(r.minutesHt), minutesVt: minutes(r.minutesVt),
    classIds, allowedLevelKeys: null, blocks,
    planName: text(r.planName, 200), rowLabel: text(r.rowLabel, 1000), classes };
}
export function parseValplanRead(value: unknown, scope: ValplanScope): ValplanRead {
  const r = shape(value, ['contractVersion', 'unitId', 'schoolYear', 'valplans', 'rows']);
  if (r.contractVersion !== VALPLAN_CONTRACT_VERSION || uuid(r.unitId) !== scope.unitId || r.schoolYear !== scope.schoolYear) bad();
  const classChoices = (value: unknown) => list(value, 2000).map(c => { const y = shape(c, ['classId', 'pupils']); return { classId: uuid(y.classId), pupils: integer(y.pupils, 1, 1000000) }; });
  const valplans = list(r.valplans, 500).map(v => { const x = shape(v, ['catalogId', 'valplan', 'choiceCounts', 'courseChoices']); return { catalogId: catalogId(x.catalogId), valplan: parseValplan(x.valplan), choiceCounts: classChoices(x.choiceCounts),
    courseChoices: list(x.courseChoices, 200).map(c => { const y = shape(c, ['courseId', 'pupils', 'classes']); return { courseId: uuid(y.courseId), pupils: integer(y.pupils, 1, 1000000), classes: classChoices(y.classes) }; }) }; });
  if (valplans.some(v => v.valplan.unitId !== scope.unitId || v.valplan.schoolYear !== scope.schoolYear) || new Set(valplans.map(v => v.valplan.id)).size !== valplans.length) bad();
  return { contractVersion: VALPLAN_CONTRACT_VERSION, ...scope, valplans, rows: list(r.rows, 2000).map(parseRow) };
}
export function parseValplanCommand(value: unknown): ValplanCommand {
  const r = shape(value, ['contractVersion', 'commandId', 'action', 'unitId', 'schoolYear', 'expectedRevision', 'catalogId', 'valplan']);
  if (r.contractVersion !== VALPLAN_CONTRACT_VERSION || r.action !== 'save') bad();
  const scope = parseValplanScope({ unitId: r.unitId, schoolYear: r.schoolYear }), valplan = parseValplan(r.valplan);
  if (valplan.unitId !== scope.unitId || valplan.schoolYear !== scope.schoolYear) bad();
  return { contractVersion: VALPLAN_CONTRACT_VERSION, commandId: uuid(r.commandId), action: 'save', ...scope,
    expectedRevision: integer(r.expectedRevision, 0, 2147483645), catalogId: catalogId(r.catalogId), valplan };
}
export function parseValplanReply(value: unknown, command: ValplanCommand): ValplanReply {
  const r = shape(value, ['receipt', 'read']), x = shape(r.receipt, ['commandId', 'valplanId', 'revision', 'replayed']);
  if (uuid(x.commandId) !== command.commandId || uuid(x.valplanId) !== command.valplan.id || typeof x.replayed !== 'boolean') bad();
  const receipt = { commandId: command.commandId, valplanId: command.valplan.id, revision: integer(x.revision, 1, 2147483646), replayed: x.replayed };
  const read = parseValplanRead(r.read, command);
  if (!x.replayed && (receipt.revision !== command.expectedRevision + 1 || read.valplans.find(v => v.valplan.id === receipt.valplanId)?.valplan.revision !== receipt.revision)) bad();
  return { receipt, read };
}
