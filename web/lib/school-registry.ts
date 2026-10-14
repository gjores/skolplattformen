import type { SchoolAddress } from './registry-address.ts';

export type SchoolRegistryCommand = {
  commandId: string; code: string; operation: 'import' | 'update';
  expectedRevision: string | null; registryFingerprint: string;
};
export type SchoolRegistryLookup = { kind: 'code' | 'organizationNumber'; value: string };
export type RegistrySchool = {
  code: string; name: string; status: string; municipalityCode: string;
  municipalityName: string | null; locality: string | null; address: SchoolAddress | null;
  organizationNumber: string; schoolTypes: string[]; programmes: Record<string, string[]>;
  modified: string | null; registryFingerprint: string; fetchedAt: string;
};
export type LocalRegistrySchool = {
  id: string; code: string; name: string; status: string; municipalityCode: string;
  municipalityName: string | null; locality: string | null; address: SchoolAddress | null;
  principalName: string | null; schoolTypes: string[]; sourceSchoolTypes: string[] | null;
  revision: string; sourceFetchedAt: string | null; canUpdate: boolean;
};
export type SchoolRegistryList = {
  organizer: { id: string; name: string; organizationNumber: string | null };
  units: LocalRegistrySchool[];
};
export type SchoolRegistryLookupResult =
  | { kind: 'code'; unit: RegistrySchool; local: LocalRegistrySchool | null }
  | { kind: 'organizationNumber'; organizationNumber: string; units: { code: string; name: string; status: string }[] };
export type SchoolRegistrySaved = {
  commandId: string; status: 'saved'; unitId: string; code: string;
  operation: 'import' | 'update'; revision: string; replayed: boolean;
};
export type SchoolRegistryStatus = SchoolRegistrySaved | { commandId: string; status: 'not_found' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA = /^[a-f0-9]{64}$/u;
function invalid(): never { throw new TypeError('invalid_school_registry'); }
function record(v: unknown, keys?: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(v))
    || Object.getOwnPropertySymbols(v).length
    || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) invalid();
  const out = v as Record<string, unknown>;
  if (keys && (Object.keys(out).length !== keys.length || keys.some(key => !Object.hasOwn(out, key)))) invalid();
  return out;
}
function text(v: unknown, max = 300, empty = false): string {
  if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) invalid();
  for (let i=0;i<v.length;i++) if (v.charCodeAt(i)<32 || v.charCodeAt(i)===127) invalid();
  return v;
}
function patterned(v: unknown, pattern: RegExp): string { const result = text(v); if (!pattern.test(result)) invalid(); return result; }
function nullable(v: unknown, max = 300) { return v === null ? null : text(v, max); }
function strings(v: unknown, max = 100): string[] {
  if (!Array.isArray(v) || v.length > max) invalid();
  const values = v.map(s => text(s, 100)); if (new Set(values).size !== values.length) invalid(); return values;
}
function bool(v: unknown): boolean { if (typeof v !== 'boolean') invalid(); return v; }
function time(v: unknown): string { const s = text(v); if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(s) || !Number.isFinite(Date.parse(s))) invalid(); return s; }
function address(v: unknown): SchoolAddress | null {
  if (v === null) return null;
  const r = record(v); const expected = ['street', 'postalCode', 'locality', ...(Object.hasOwn(r, 'type') ? ['type'] : [])]; record(r, expected);
  return { street: text(r.street, 300, true), postalCode: text(r.postalCode, 30, true), locality: text(r.locality, 200, true), ...(Object.hasOwn(r, 'type') ? { type: text(r.type, 50) } : {}) };
}
export function parseSchoolRegistryCommand(v: unknown): SchoolRegistryCommand {
  const r = record(v, ['commandId', 'code', 'operation', 'expectedRevision', 'registryFingerprint']);
  if (r.operation !== 'import' && r.operation !== 'update') invalid();
  const expectedRevision = r.expectedRevision === null ? null : patterned(r.expectedRevision, SHA);
  if ((r.operation === 'import') !== (expectedRevision === null)) invalid();
  return { commandId: patterned(r.commandId, UUID), code: patterned(r.code, /^\d{8}$/u), operation: r.operation,
    expectedRevision, registryFingerprint: patterned(r.registryFingerprint, SHA) };
}
export function parseSchoolRegistryLookup(v: unknown): SchoolRegistryLookup {
  const r = record(v, ['kind', 'value']); if (r.kind !== 'code' && r.kind !== 'organizationNumber') invalid();
  return { kind: r.kind, value: patterned(r.value, r.kind === 'code' ? /^\d{8}$/u : /^\d{10}$/u) };
}
export function parseRegistrySchool(v: unknown): RegistrySchool {
  const r = record(v, ['code','name','status','municipalityCode','municipalityName','locality','address','organizationNumber','schoolTypes','programmes','modified','registryFingerprint','fetchedAt']);
  const programmes: Record<string, string[]> = {}; const p = record(r.programmes);
  const schoolTypes = strings(r.schoolTypes,50); if (!schoolTypes.length || schoolTypes.some(v => !/^[A-Z][A-Z0-9_]{0,15}$/u.test(v))) invalid();
  if (Object.keys(p).length !== schoolTypes.length || schoolTypes.some(code => !Object.hasOwn(p,code))) invalid();
  if (Object.keys(p).length > 50) invalid();
  for (const [key,value] of Object.entries(p)) { if (!/^[A-Z][A-Z0-9_]{0,15}$/u.test(key)) invalid(); programmes[key] = strings(value, 200); if (programmes[key].some(v => v.length > 80)) invalid(); }
  return { code: patterned(r.code,/^\d{8}$/u), name: text(r.name), status: text(r.status,50), municipalityCode: patterned(r.municipalityCode,/^\d{4}$/u),
    municipalityName: nullable(r.municipalityName), locality: nullable(r.locality), address: address(r.address), organizationNumber: patterned(r.organizationNumber,/^\d{10}$/u),
    schoolTypes, programmes, modified: r.modified === null ? null : time(r.modified), registryFingerprint: patterned(r.registryFingerprint,SHA), fetchedAt: time(r.fetchedAt) };
}
export function parseLocalRegistrySchool(v: unknown): LocalRegistrySchool {
  const r = record(v, ['id','code','name','status','municipalityCode','municipalityName','locality','address','principalName','schoolTypes','sourceSchoolTypes','revision','sourceFetchedAt','canUpdate']);
  return { id: patterned(r.id,UUID), code: patterned(r.code,/^\d{8}$/u), name: text(r.name), status: text(r.status,50), municipalityCode: patterned(r.municipalityCode,/^\d{4}$/u),
    municipalityName: nullable(r.municipalityName), locality: nullable(r.locality), address: address(r.address), principalName: nullable(r.principalName,500), schoolTypes: strings(r.schoolTypes,50),
    sourceSchoolTypes: r.sourceSchoolTypes === null ? null : strings(r.sourceSchoolTypes,50), revision: patterned(r.revision,SHA), sourceFetchedAt: r.sourceFetchedAt === null ? null : time(r.sourceFetchedAt), canUpdate: bool(r.canUpdate) };
}
export function parseSchoolRegistryList(v: unknown): SchoolRegistryList {
  const r = record(v,['organizer','units']); const o = record(r.organizer,['id','name','organizationNumber']);
  if (!Array.isArray(r.units) || r.units.length > 5000) invalid(); const units = r.units.map(parseLocalRegistrySchool);
  if (new Set(units.map(u => u.id)).size !== units.length || new Set(units.map(u => u.code)).size !== units.length) invalid();
  return { organizer: { id: patterned(o.id,UUID), name: text(o.name), organizationNumber: o.organizationNumber === null ? null : patterned(o.organizationNumber,/^\d{10}$/u) }, units };
}
export function parseSchoolRegistryLookupResult(v: unknown, request?: SchoolRegistryLookup): SchoolRegistryLookupResult {
  const r = record(v);
  if (r.kind === 'code') {
    record(r,['kind','unit','local']); const unit = parseRegistrySchool(r.unit); const local = r.local === null ? null : parseLocalRegistrySchool(r.local);
    if (local && local.code !== unit.code) invalid(); if (request && (request.kind !== r.kind || request.value !== unit.code)) invalid();
    return { kind: 'code', unit, local };
  }
  record(r,['kind','organizationNumber','units']); if (r.kind !== 'organizationNumber') invalid();
  const organizationNumber = patterned(r.organizationNumber,/^\d{10}$/u); if (!Array.isArray(r.units) || r.units.length > 5000) invalid();
  const units = r.units.map(v => { const u = record(v,['code','name','status']); return { code: patterned(u.code,/^\d{8}$/u), name: text(u.name), status: text(u.status,50) }; });
  if (new Set(units.map(u => u.code)).size !== units.length || (request && (request.kind !== r.kind || request.value !== organizationNumber))) invalid();
  return { kind:'organizationNumber', organizationNumber, units };
}
export function parseSchoolRegistryStatus(v: unknown, command: SchoolRegistryCommand): SchoolRegistryStatus {
  const r = record(v); if (r.commandId !== command.commandId) invalid();
  if (r.status === 'not_found') { record(r,['commandId','status']); return { commandId: command.commandId, status:'not_found' }; }
  record(r,['commandId','status','unitId','code','operation','revision','replayed']);
  if (r.status !== 'saved' || r.code !== command.code || r.operation !== command.operation) invalid();
  return { commandId:command.commandId, status:'saved', unitId:patterned(r.unitId,UUID), code:command.code, operation:command.operation, revision:patterned(r.revision,SHA), replayed:bool(r.replayed) };
}
