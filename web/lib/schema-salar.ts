/** Salsökning vid exakt flyttmål (C5). Salval är ett val i flyttpanelen, aldrig en flytt. */
import { SCHEMA_CONTRACT_VERSION, SCHEMA_VILLKOR_LIMITS, SchemaContractError, parseSchemaKontrollRequest, villkorNyckel,
  type SchemaKontrollRequest, type SchemaPlacement, type SchemaViolation } from './schema-contract.ts';
import { parseSchemaDatumAndringar, schemaDatumDate, type SchemaDatumAndring } from './schema-datum.ts';
import { schemaWeekday } from './schema-vecka.ts';

export type SchemaSalDatum = { originalDate: string; date: string };
export type SchemaSalScope = SchemaKontrollRequest & { datedTarget?: SchemaSalDatum | null; datedOverrides?: SchemaDatumAndring[] };
export type SchemaSalRequest = SchemaKontrollRequest & { lesson: string; target: { day: number; startMin: number }; datedTarget: SchemaSalDatum | null; datedOverrides: SchemaDatumAndring[] };
export const SCHEMA_SAL_STATUS = ['ledig', 'upptagen', 'hindrad', 'otillaten', 'ej_kontrollerad'] as const;
export type SchemaSalStatus = typeof SCHEMA_SAL_STATUS[number];
export type SchemaSalRad = { id: string; name: string; status: SchemaSalStatus; reasons: SchemaViolation[]; total: number };
export type SchemaSalSvar = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; grundFingerprint: string; fingerprint: string; inputFingerprint: string;
  lesson: string; target: SchemaSalRequest['target']; datedTarget: SchemaSalDatum | null; durationMin: number; marginBeforeMin: number; marginAfterMin: number;
  rooms: SchemaSalRad[]; timedOut: boolean; checkedRooms: number; explanation: string };
export class SchemaSalError extends SchemaContractError {
  public reason: 'schema_underlag_changed' | 'schema_sal_lesson_unknown' | 'schema_placement_locked_lesson';
  constructor(reason: SchemaSalError['reason']) { super(); this.reason = reason; this.name = 'SchemaSalError'; }
}
function bad(): never { throw new SchemaContractError(); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) bad(); return value as Record<string, unknown>; }
function exact(value: unknown, keys: string[]): Record<string, unknown> { const r = record(value); if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad(); return r; }
function int(value: unknown, low: number, high: number): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < low || value > high) bad(); return value; }
function text(value: unknown, max = 2000): string { if (typeof value !== 'string' || !value.trim() || value.length > max) bad(); return value; }
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{28}$/u.test(value)) bad(); return value; }
function date(value: unknown): SchemaSalDatum | null {
  if (value === null) return null; const d = exact(value, ['originalDate', 'date']); return { originalDate: schemaDatumDate(d.originalDate), date: schemaDatumDate(d.date) };
}
function target(value: unknown): SchemaSalRequest['target'] { const t = exact(value, ['day', 'startMin']); return { day: int(t.day, 0, 4), startMin: int(t.startMin, 0, 1435) }; }
export function parseSchemaSalRequest(value: unknown): SchemaSalRequest {
  const { lesson, target: rawTarget, datedTarget, datedOverrides, ...rest } = record(value), input = parseSchemaKontrollRequest(rest), wanted = target(rawTarget), dated = date(datedTarget);
  if (typeof lesson !== 'string' || !/^pass-\d{1,10}$/u.test(lesson) || wanted.startMin % 5 || dated && schemaWeekday(dated.date) !== wanted.day) bad();
  const seen = new Set<string>(); for (const p of input.placements) { if (seen.has(p.lesson)) bad(); seen.add(p.lesson); }
  return { ...input, lesson, target: wanted, datedTarget: dated, datedOverrides: parseSchemaDatumAndringar(datedOverrides) };
}
/** Kanonisk driftkontroll av hela underlaget/målet. Ingen del av fingeravtrycket ersätter skolbehörighet eller serverns källäsning. */
export function schemaSalInputFingerprint(input: SchemaSalRequest): string {
  const at = (placements: SchemaPlacement[]) => [...placements].sort((a, b) => a.lesson.localeCompare(b.lesson));
  const canonical = villkorNyckel({ ...input, placements: at(input.placements), datedOverrides: parseSchemaDatumAndringar(input.datedOverrides),
    ...(input.locks ? { locks: { ...input.locks, placements: at(input.locks.placements) } } : {}) });
  let a = 2166136261, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
  for (let i = 0; i < canonical.length; i++) { const n = canonical.charCodeAt(i); a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822507); c = Math.imul(c ^ n, 3266489909); d = Math.imul(d ^ n, 668265263); }
  return [a, b, c, d].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 28);
}
export function schemaSalPlaceringar(input: SchemaSalRequest, room: string): SchemaPlacement[] {
  return [...input.placements.filter(p => p.lesson !== input.lesson), { lesson: input.lesson, ...input.target, room }];
}
export function parseSchemaSalSvar(value: unknown, expected: SchemaSalRequest, knownRooms: { id: string; name: string }[]): SchemaSalSvar {
  const r = exact(value, ['contractVersion', 'grundFingerprint', 'fingerprint', 'inputFingerprint', 'lesson', 'target', 'datedTarget', 'durationMin', 'marginBeforeMin', 'marginAfterMin', 'rooms', 'timedOut', 'checkedRooms', 'explanation']);
  if (r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.grundFingerprint !== expected.grundFingerprint || r.lesson !== expected.lesson || r.inputFingerprint !== schemaSalInputFingerprint(expected)
    || villkorNyckel(target(r.target)) !== villkorNyckel(expected.target) || villkorNyckel(date(r.datedTarget)) !== villkorNyckel(expected.datedTarget) || typeof r.timedOut !== 'boolean'
    || !Array.isArray(r.rooms) || r.rooms.length > SCHEMA_VILLKOR_LIMITS.salar || r.rooms.length !== knownRooms.length) bad();
  const seen = new Set<string>();
  const rooms = r.rooms.map(raw => {
    const room = exact(raw, ['id', 'name', 'status', 'reasons', 'total']), id = text(room.id, 10), name = text(room.name, SCHEMA_VILLKOR_LIMITS.salNamn);
    if (!/^sal-\d{1,3}$/u.test(id) || seen.has(id) || !knownRooms.some(x => x.id === id && x.name === name) || !SCHEMA_SAL_STATUS.includes(room.status as SchemaSalStatus)
      || !Array.isArray(room.reasons) || room.reasons.length > 20) bad();
    seen.add(id);
    const reasons = room.reasons.map(rawReason => {
      const reason = exact(rawReason, ['code', 'message', 'lessons']);
      if (!Array.isArray(reason.lessons) || reason.lessons.length > 20000 || reason.lessons.some(id => typeof id !== 'string' || !/^pass-\d{1,10}$/u.test(id))) bad();
      return { code: text(reason.code, 100), message: text(reason.message), lessons: reason.lessons as string[] };
    });
    const total = int(room.total, reasons.length, Number.MAX_SAFE_INTEGER), status = room.status as SchemaSalStatus;
    if (status === 'ledig' ? total !== 0 || reasons.length > 0 : total === 0 || reasons.length === 0) bad();
    return { id, name, status, reasons, total };
  });
  const checkedRooms = int(r.checkedRooms, 0, rooms.length);
  if (checkedRooms !== rooms.filter(room => room.status === 'ledig' || room.status === 'upptagen' || room.status === 'hindrad').length
    || !r.timedOut && rooms.some(room => room.status === 'ej_kontrollerad')) bad();
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: expected.grundFingerprint, fingerprint: fingerprint(r.fingerprint), inputFingerprint: fingerprint(r.inputFingerprint),
    lesson: expected.lesson, target: expected.target, datedTarget: expected.datedTarget, durationMin: int(r.durationMin, 5, 600), marginBeforeMin: int(r.marginBeforeMin, 0, 60), marginAfterMin: int(r.marginAfterMin, 0, 60),
    rooms, timedOut: r.timedOut, checkedRooms, explanation: text(r.explanation) };
}
