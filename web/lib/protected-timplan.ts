import { nationalTimplan } from './timplan-model.ts';

export type TimplanKind = 'grundskola' | 'introduktionsprogram' | 'gymnasium';
export type TimplanStatus = 'utkast' | 'forslag' | 'atersand' | 'faststalld' | 'ersatt';
export type TimplanSummary = {
  id: string; offeringId: string; unitId: string; schoolName: string;
  educationName: string; cohort: string; kind: Exclude<TimplanKind, 'gymnasium'>;
  version: number; revision: number; status: TimplanStatus;
};
export type TimplanList = { plans: TimplanSummary[]; count: number; page: number; pageSize: 50 };
export type ProtectedTimplan = {
  id: string; offeringId: string; unitId: string; version: number; revision: number;
  status: TimplanStatus; basis: string; catalogFetched: string | null; decidedOn: string | null;
  cells: Record<string, number[]>; schoolName: string;
  education: { name: string; cohort: string; kind: TimplanKind; grades: number[] };
};
export type TimplanColumn = { id: string; label: string; grade?: number };
export type TimplanRow = { id: string; label: string; group?: string; block?: boolean };

export const statusLabel: Record<TimplanStatus, string> = {
  utkast: 'Utkast', forslag: 'Förslag', atersand: 'Återsänd', faststalld: 'Fastställd', ersatt: 'Ersatt',
};
function fail(): never { throw new TypeError('Timplanens underlag kunde inte kontrolleras.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  const r = object(value);
  if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) fail();
  return r;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail();
  return value;
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) fail();
  return value;
}
function integer(value: unknown, min = 0, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail();
  return value;
}
function status(value: unknown): TimplanStatus {
  if (typeof value !== 'string' || !Object.hasOwn(statusLabel, value)) fail();
  return value as TimplanStatus;
}
function kind(value: unknown): TimplanKind {
  if (typeof value !== 'string' || !['grundskola','introduktionsprogram','gymnasium'].includes(value)) fail();
  return value as TimplanKind;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0,10) !== value) fail();
  return value;
}
export function timplanGrades(grades?: number[]): number[] {
  const values = grades?.length ? grades : [1,2,3,4,5,6,7,8,9];
  if (!Array.isArray(values) || values.length > 9 || values.some(g => !Number.isInteger(g) || g < 1 || g > 9)
    || new Set(values).size !== values.length) fail();
  return [...values];
}
export function parseTimplanList(value: unknown, expectedPage: number): TimplanList {
  const r = shape(value, ['plans','count','page','pageSize']);
  if (!Array.isArray(r.plans) || r.plans.length > 50 || r.pageSize !== 50 || r.page !== expectedPage) fail();
  const plans = r.plans.map(value => {
    const p = shape(value, ['id','offeringId','unitId','schoolName','educationName','cohort','kind','version','revision','status']);
    const schoolKind = kind(p.kind);
    if (schoolKind === 'gymnasium') fail();
    return { id: uuid(p.id), offeringId: uuid(p.offeringId), unitId: uuid(p.unitId), schoolName: text(p.schoolName),
      educationName: text(p.educationName), cohort: text(p.cohort), kind: schoolKind,
      version: integer(p.version,1), revision: integer(p.revision), status: status(p.status) };
  });
  if (new Set(plans.map(p => p.id)).size !== plans.length || integer(r.count,0,Number.MAX_SAFE_INTEGER) < plans.length) fail();
  return { plans, count: integer(r.count,0,Number.MAX_SAFE_INTEGER), page: integer(r.page,1,100000), pageSize: 50 };
}
export function parseProtectedTimplan(value: unknown, expectedId: string): ProtectedTimplan {
  const r = shape(value, ['id','offeringId','unitId','version','revision','status','basis','catalogFetched','decidedOn','cells','schoolName','education']);
  if (uuid(r.id) !== expectedId) fail();
  const e = shape(r.education, ['name','cohort','kind','grades']);
  const schoolKind = kind(e.kind);
  if (!Array.isArray(e.grades)) fail();
  const grades = schoolKind === 'grundskola' ? timplanGrades(e.grades) : [];
  if (schoolKind !== 'grundskola' && e.grades.length !== 0) fail();
  const entries = Object.entries(object(r.cells));
  if (entries.length > 2000) fail();
  const cells = Object.fromEntries(entries.map(([key,value]) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,95}$/iu.test(key) || ['constructor','prototype','__proto__'].includes(key)
      || !Array.isArray(value) || value.length > 12) fail();
    return [key,value.map(v => integer(v,0,2000))];
  }));
  return { id: uuid(r.id), offeringId: uuid(r.offeringId), unitId: uuid(r.unitId), version: integer(r.version,1),
    revision: integer(r.revision), status: status(r.status), basis: text(r.basis,10000),
    catalogFetched: date(r.catalogFetched), decidedOn: date(r.decidedOn), cells, schoolName: text(r.schoolName),
    education: { name: text(e.name), cohort: text(e.cohort), kind: schoolKind, grades } };
}
export function timplanColumns(plan: ProtectedTimplan): TimplanColumn[] {
  if (plan.education.kind === 'grundskola') return timplanGrades(plan.education.grades).map(grade => ({id:`ak${grade}`,label:`Åk ${grade}`,grade}));
  if (plan.education.kind === 'introduktionsprogram') return [{id:'vecka',label:'Per vecka'}];
  return [];
}
export function timplanRows(plan: ProtectedTimplan): TimplanRow[] {
  if (plan.education.kind === 'grundskola') return [
    ...nationalTimplan.map(row => ({id:row.id,label:row.name,group:row.group,block:!row.code})),
    {id:'skolansval',label:'Skolans val'},
  ];
  if (plan.education.kind === 'introduktionsprogram') return [
    ['im-sv','Svenska eller svenska som andraspråk, grundskolenivå'], ['im-ma','Matematik, grundskolenivå'],
    ['im-en','Engelska, grundskolenivå'], ['im-sh','Samhällskunskap, grundskolenivå'],
    ['im-idh','Idrott och hälsa'], ['im-praktik','Praktik och yrkesorientering'], ['im-mentor','Studiehandledning och mentorstid'],
  ].map(([id,label]) => ({id,label}));
  return [];
}
export function unknownTimplanRows(plan: ProtectedTimplan): string[] {
  const known = new Set(timplanRows(plan).map(row => row.id));
  return Object.keys(plan.cells).filter(id => !known.has(id));
}
export function cellHours(plan: ProtectedTimplan, rowId: string, columnIndex: number): number | null {
  const values = plan.cells[rowId];
  if (!values || values.length !== timplanColumns(plan).length) return null;
  return values[columnIndex] ?? null;
}
export function canChangeTimplanCell(plan: ProtectedTimplan, accessFunction: string, rowId: string, columnIndex: number): boolean {
  if (accessFunction !== 'rektor' || !['utkast','atersand'].includes(plan.status) || unknownTimplanRows(plan).length > 0
    || cellHours(plan,rowId,columnIndex) === null) return false;
  const row = timplanRows(plan).find(row => row.id === rowId), column = timplanColumns(plan)[columnIndex];
  if (!row || !column || plan.education.kind === 'gymnasium') return false;
  if (plan.education.kind === 'grundskola') {
    if (row.block) return column.grade! <= 3;
    if (row.group) return column.grade! > 3;
  }
  return true;
}
export function parseTimplanHours(value: string): number | null {
  if (!/^\d{1,4}$/u.test(value)) return null;
  const n = Number(value);
  return n <= 2000 ? n : null;
}
export function sameTimplanColumn(plan: ProtectedTimplan, columnIndex: number, columnId: string): boolean {
  return timplanColumns(plan)[columnIndex]?.id === columnId;
}
export function parseTimplanCellReply(value: unknown, expected: {
  planId: string; rowId: string; expectedRevision: number; columnIndex: number; hours: number; columnCount: number;
}): {id: string; revision: number; rowId: string; hours: number[]} {
  const r = shape(value,['id','revision','rowId','hours']);
  if (uuid(r.id) !== expected.planId || r.rowId !== expected.rowId || integer(r.revision,1) !== expected.expectedRevision+1
    || !Array.isArray(r.hours) || r.hours.length !== expected.columnCount) fail();
  const hours = r.hours.map(v => integer(v,0,2000));
  if (hours[expected.columnIndex] !== expected.hours) fail();
  return {id:expected.planId,revision:expected.expectedRevision+1,rowId:expected.rowId,hours};
}
