import { ProgramplanContractError } from './programplan-catalog.ts';
import { gymArray, gymBoolean, gymInteger, gymShape, gymStatus, gymText, gymUuid } from './gym-timplan.ts';
import { parseTimplanSeries, type TimplanSeries } from './named-timplan.ts';
import type { TimplanStatus } from './protected-timplan.ts';

/**
 * GR/IM-klassernas skyddade klass–timplanskoppling (05.1-01, D-21). GR/IM är läsårsramar: klassen och kopplingen
 * gäller utbildningens läsår. Kolumnen väljs uttryckligen: GR ak{n} inom utbildningens årskurser, IM bara vecka.
 * En namnrad från demosidan är aldrig en identifierad koppling förrän rektor har kopplat klassen.
 */
export type GrimClassColumn = `ak${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | 'vecka';
export type GrimClassKind = 'grundskola' | 'introduktionsprogram';
export type GrimClassLink = { planId: string; series: TimplanSeries; version: number; status: TimplanStatus; columnId: GrimClassColumn; revision: number };
export type GrimClassRow = { id: string; name: string; startYear: number; link: GrimClassLink | null; candidate: GrimClassLink | null };
export type GrimClassUnderlagRequest = { planId: string };
export type GrimClassUnderlag = {
  plan: { id: string; offeringId: string; unitId: string; schoolName: string; educationName: string; kind: GrimClassKind; series: TimplanSeries;
    version: number; status: TimplanStatus; revision: number };
  schoolYear: number | null; columns: { id: GrimClassColumn; label: string }[]; canManage: boolean; blockers: string[];
  classes: GrimClassRow[]; legacyRows: { className: string; columnId: GrimClassColumn; revision: number }[];
};
export type GrimClassCreateRequest = { commandId: string; planId: string; expectedPlanRevision: number; name: string };
export type GrimClassCreateReply = { id: string; name: string; startYear: number; replayed: boolean };
export type GrimClassLinkRequest = { commandId: string; classId: string; planId: string; expectedPlanRevision: number; columnId: GrimClassColumn;
  expectedLinkRevision: number | null; previousPlanId: string | null };
export type GrimClassLinkReply = { classId: string; schoolYear: number; planId: string; columnId: GrimClassColumn; revision: number; adopted: boolean; replayed: boolean };

function bad(): never { throw new ProgramplanContractError('invalid_grim_class'); }
function year(v: unknown) { return gymInteger(v, 2100, 2000); }
export function grimClassColumn(v: unknown): GrimClassColumn {
  if (v !== 'vecka' && (typeof v !== 'string' || !/^ak[1-9]$/u.test(v))) bad();
  return v as GrimClassColumn;
}
function name(v: unknown) { const n = gymText(v, 60); if (!n || n !== n.trim().toUpperCase() || /[\p{Cc}\p{Cf}]/u.test(n)) bad(); return n; }
function revision(v: unknown) { return gymInteger(v, 999999999); }
function parseLink(v: unknown): GrimClassLink {
  const l = gymShape(v, ['planId', 'series', 'version', 'status', 'columnId', 'revision']);
  return { planId: gymUuid(l.planId), series: parseTimplanSeries(l.series), version: gymInteger(l.version, 2147483647, 1), status: gymStatus(l.status),
    columnId: grimClassColumn(l.columnId), revision: revision(l.revision) };
}
export function parseGrimClassUnderlagRequest(value: unknown): GrimClassUnderlagRequest { return { planId: gymUuid(gymShape(value, ['planId']).planId) }; }
export function parseGrimClassCreateRequest(value: unknown): GrimClassCreateRequest {
  const r = gymShape(value, ['commandId', 'planId', 'expectedPlanRevision', 'name']);
  return { commandId: gymUuid(r.commandId), planId: gymUuid(r.planId), expectedPlanRevision: revision(r.expectedPlanRevision), name: name(r.name) };
}
export function parseGrimClassLinkRequest(value: unknown): GrimClassLinkRequest {
  const r = gymShape(value, ['commandId', 'classId', 'planId', 'expectedPlanRevision', 'columnId', 'expectedLinkRevision', 'previousPlanId']);
  if ((r.expectedLinkRevision === null) !== (r.previousPlanId === null)) bad();
  return { commandId: gymUuid(r.commandId), classId: gymUuid(r.classId), planId: gymUuid(r.planId), expectedPlanRevision: revision(r.expectedPlanRevision),
    columnId: grimClassColumn(r.columnId), expectedLinkRevision: r.expectedLinkRevision === null ? null : revision(r.expectedLinkRevision),
    previousPlanId: r.previousPlanId === null ? null : gymUuid(r.previousPlanId) };
}
export function parseGrimClassCreateReply(value: unknown, input: GrimClassCreateRequest): GrimClassCreateReply {
  const r = gymShape(value, ['id', 'name', 'startYear', 'replayed']);
  const result = { id: gymUuid(r.id), name: name(r.name), startYear: year(r.startYear), replayed: gymBoolean(r.replayed) };
  if (result.name !== input.name) bad();
  return result;
}
/** The reply must be the exact requested link with revision = expectedLinkRevision + 1 (0 for a new link). */
export function parseGrimClassLinkReply(value: unknown, input: GrimClassLinkRequest): GrimClassLinkReply {
  const r = gymShape(value, ['classId', 'schoolYear', 'planId', 'columnId', 'revision', 'adopted', 'replayed']);
  const result = { classId: gymUuid(r.classId), schoolYear: year(r.schoolYear), planId: gymUuid(r.planId), columnId: grimClassColumn(r.columnId),
    revision: revision(r.revision), adopted: gymBoolean(r.adopted), replayed: gymBoolean(r.replayed) };
  if (result.classId !== input.classId || result.planId !== input.planId || result.columnId !== input.columnId
    || result.revision !== (input.expectedLinkRevision ?? -1) + 1 || result.adopted && input.expectedLinkRevision === null) bad();
  return result;
}
export function parseGrimClassUnderlag(value: unknown, input: GrimClassUnderlagRequest): GrimClassUnderlag {
  const r = gymShape(value, ['plan', 'schoolYear', 'columns', 'canManage', 'blockers', 'classes', 'legacyRows']);
  const p = gymShape(r.plan, ['id', 'offeringId', 'unitId', 'schoolName', 'educationName', 'kind', 'series', 'version', 'status', 'revision']);
  if (p.kind !== 'grundskola' && p.kind !== 'introduktionsprogram') bad();
  const plan = { id: gymUuid(p.id), offeringId: gymUuid(p.offeringId), unitId: gymUuid(p.unitId), schoolName: gymText(p.schoolName), educationName: gymText(p.educationName),
    kind: p.kind as GrimClassKind, series: parseTimplanSeries(p.series), version: gymInteger(p.version, 2147483647, 1), status: gymStatus(p.status), revision: revision(p.revision) };
  const schoolYear = r.schoolYear === null ? null : year(r.schoolYear);
  const columns = gymArray(r.columns, 9).map(v => { const c = gymShape(v, ['id', 'label']); return { id: grimClassColumn(c.id), label: gymText(c.label, 20) }; });
  if (new Set(columns.map(c => c.id)).size !== columns.length || plan.kind === 'introduktionsprogram' && (columns.length !== 1 || columns[0].id !== 'vecka')
    || plan.kind === 'grundskola' && columns.some(c => c.id === 'vecka')) bad();
  const allowed = new Set(columns.map(c => c.id));
  const classes = gymArray(r.classes, 2000).map(v => {
    const c = gymShape(v, ['id', 'name', 'startYear', 'link', 'candidate']);
    const row = { id: gymUuid(c.id), name: name(c.name), startYear: year(c.startYear), link: c.link === null ? null : parseLink(c.link), candidate: c.candidate === null ? null : parseLink(c.candidate) };
    if (row.startYear !== schoolYear || row.link && row.candidate || row.link && !allowed.has(row.link.columnId)) bad();
    return row;
  });
  const legacyRows = gymArray(r.legacyRows, 2000).map(v => { const l = gymShape(v, ['className', 'columnId', 'revision']);
    return { className: name(l.className), columnId: grimClassColumn(l.columnId), revision: revision(l.revision) }; });
  const result = { plan, schoolYear, columns, canManage: gymBoolean(r.canManage), blockers: gymArray(r.blockers, 20).map(v => gymText(v)), classes, legacyRows };
  if (plan.id !== input.planId || new Set(classes.map(c => c.id)).size !== classes.length || new Set(classes.map(c => c.name)).size !== classes.length
    || legacyRows.some(l => classes.some(c => c.name === l.className))
    || result.canManage && (plan.status !== 'faststalld' || result.blockers.length > 0 || schoolYear === null)) bad();
  return result;
}
