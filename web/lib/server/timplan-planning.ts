import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

type RecordValue = Record<string, unknown>;
function bad(): never { throw new Deny('bad_request', 400); }
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  return value as RecordValue;
}
function shape(value: unknown, keys: string[]): RecordValue {
  const row = object(value);
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) bad();
  return row;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) bad();
  return value.toLowerCase();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function rowId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,95}$/iu.test(value)
    || ['constructor','prototype','__proto__'].includes(value)) bad();
  return value;
}
function hours(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 12) bad();
  return value.map(v => integer(v, 0, 2000));
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) bad();
  return value;
}
export type TimplanReadRequest = { planId: string };
export type TimplanCellRequest = TimplanReadRequest & {
  expectedRevision: number; rowId: string; columnIndex: number; hours: number;
};
export function parseTimplanRead(value: unknown): TimplanReadRequest {
  const row = shape(value, ['planId']);
  return { planId: uuid(row.planId) };
}
export function parseTimplanCell(value: unknown): TimplanCellRequest {
  const row = shape(value, ['planId','expectedRevision','rowId','columnIndex','hours']);
  return { planId: uuid(row.planId), expectedRevision: integer(row.expectedRevision, 0, 2147483646),
    rowId: rowId(row.rowId), columnIndex: integer(row.columnIndex, 0, 11), hours: integer(row.hours, 0, 2000) };
}
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await mandateOperation(fn); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable();
    throw error;
  }
}
function project<T>(rows: { result: unknown }[], parse: (value: unknown) => T): T {
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    return parse(rows[0].result);
  } catch { throw new AuditUnavailable(); }
}
export async function readTimplan(tx: Tx, input: TimplanReadRequest) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.phase5_read_timplan(${input.planId}) as result`);
  const body = project(rows, value => {
    const r = shape(value, ['id','offeringId','unitId','version','revision','status','basis','catalogFetched','decidedOn','cells']);
    const id = uuid(r.id);
    if (id !== input.planId || typeof r.status !== 'string' || !['utkast','forslag','atersand','faststalld','ersatt'].includes(String(r.status))
      || typeof r.basis !== 'string' || r.basis.length > 10000) bad();
    const cells = object(r.cells);
    if (Object.keys(cells).length > 2000) bad();
    return { id, offeringId: uuid(r.offeringId), unitId: uuid(r.unitId), version: integer(r.version, 1, 2147483647),
      revision: integer(r.revision, 0, 2147483647), status: r.status as string, basis: r.basis,
      catalogFetched: date(r.catalogFetched), decidedOn: date(r.decidedOn),
      cells: Object.fromEntries(Object.entries(cells).map(([key, value]) => [rowId(key), hours(value)])) };
  });
  return { body, event: { action: 'timplan_read', objectType: 'timplan', objectId: input.planId } };
}
export async function changeTimplanCell(tx: Tx, input: TimplanCellRequest) {
  const rows = await operation(() => tx<{ result: unknown }[]>`select public.phase5_change_timplan_cell(
    ${input.planId},${input.expectedRevision},${input.rowId},${input.columnIndex},${input.hours}) as result`);
  const body = project(rows, value => {
    const r = shape(value, ['id','revision','rowId','hours']);
    const result = { id: uuid(r.id), revision: integer(r.revision, 1, 2147483647), rowId: rowId(r.rowId), hours: hours(r.hours) };
    if (result.id !== input.planId || result.rowId !== input.rowId || result.revision !== input.expectedRevision + 1
      || result.hours[input.columnIndex] !== input.hours) bad();
    return result;
  });
  return { body, event: { action: 'timplan_cell_changed', objectType: 'timplan', objectId: input.planId } };
}
