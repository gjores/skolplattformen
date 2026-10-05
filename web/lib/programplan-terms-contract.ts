import { ProgramplanContractError } from './programplan-catalog.ts';
import type { ProgramplanTermDistribution, ProgramplanTermPoints } from './programplan-terms.ts';
export type { ProgramplanTermDistribution, ProgramplanTermPoints } from './programplan-terms.ts';
export type ProgramplanTermRead = { planId: string };
export type ProgramplanTermWrite = { planId: string; expectedRevision: number; distribution: ProgramplanTermDistribution };
export type ProgramplanTermReply = { planId: string; revision: number; status: 'utkast' | 'faststalld' | 'ersatt'; distribution: ProgramplanTermDistribution };
function bad(): never { throw new ProgramplanContractError('invalid_programplan_terms'); }
function shape(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    || Object.getOwnPropertySymbols(v).length || Object.getOwnPropertyNames(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return v as Record<string, unknown>;
}
function array(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertySymbols(v).length
    || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < v.length; i++) if (!Object.hasOwn(v, i)) bad();
  return v;
}
function uuid(v: unknown): string { if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)) bad(); return v.toLowerCase(); }
function integer(v: unknown, max = 2147483647): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) bad(); return v; }
export function parseProgramplanTermDistribution(v: unknown): ProgramplanTermDistribution {
  const rows = array(v, 2000).map(v => {
    const r = shape(v, ['rowKey', 'points']);
    const code = String.raw`\p{L}[\p{L}\p{N}_-]*`, version = '[1-9][0-9]{0,5}', part = '(?:foundation|programmeSpecific|orientation|specialization)';
    const level = `${code}:${version}:${code}`;
    const keyPattern = new RegExp(`^(?:meta:(?:individualChoice|diplomaWork)|${part}:${level}|alternative:${part}:${level}(?:\\+${level})+|block:[a-z][a-z0-9]{0,15})$`, 'u');
    if (typeof r.rowKey !== 'string' || r.rowKey.length > 320 || !keyPattern.test(r.rowKey)) bad();
    const values = array(r.points, 6); if (values.length !== 6) bad();
    return { rowKey: r.rowKey, points: values.map(v => integer(v, 10000)) as ProgramplanTermPoints };
  });
  if (new Set(rows.map(r => r.rowKey)).size !== rows.length) bad();
  return rows;
}
export function parseProgramplanTermRead(v: unknown): ProgramplanTermRead { return { planId: uuid(shape(v, ['planId']).planId) }; }
export function parseProgramplanTermWrite(v: unknown): ProgramplanTermWrite {
  const r = shape(v, ['planId', 'expectedRevision', 'distribution']);
  return { planId: uuid(r.planId), expectedRevision: integer(r.expectedRevision, 2147483646), distribution: parseProgramplanTermDistribution(r.distribution) };
}
export function parseProgramplanTermReply(v: unknown): ProgramplanTermReply {
  const r = shape(v, ['planId', 'revision', 'status', 'distribution']);
  if (!['utkast', 'faststalld', 'ersatt'].includes(r.status as string)) bad();
  return { planId: uuid(r.planId), revision: integer(r.revision), status: r.status as ProgramplanTermReply['status'], distribution: parseProgramplanTermDistribution(r.distribution) };
}
