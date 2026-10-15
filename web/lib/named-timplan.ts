import { ProgramplanContractError } from './programplan-catalog.ts';
import { gymInteger, gymShape, gymUuid } from './gym-timplan.ts';

/** A plan's stable identity and current name, independent of a particular version. */
export type TimplanSeries = { id: string; name: string; revision: number };
export type NamedTimplanCreateRequest = {
  commandId: string;
  sourcePlanId: string;
  expectedSourceRevision: number;
  expectedEducationRevision: number;
  unitId: string;
  name: string;
  copyFromPlanId: string | null;
  expectedCopyFromRevision: number | null;
};
export type NamedTimplanRenameRequest = {
  commandId: string;
  planId: string;
  seriesId: string;
  expectedSeriesRevision: number;
  name: string;
};

function bad(): never { throw new ProgramplanContractError('invalid_named_timplan'); }

/** Only ordinary edge spaces are trimmed. Never silently rewrite a reviewed name. */
export function normalizeTimplanName(value: string): string {
  if (typeof value !== 'string') bad();
  const name = value.replace(/^ +| +$/gu, '');
  // Count Unicode code points, matching PostgreSQL char_length, not UTF-16 units.
  if (!name || Array.from(name).length > 80 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) bad();
  return name;
}

export function parseTimplanName(value: unknown): string {
  if (typeof value !== 'string') bad();
  const name = normalizeTimplanName(value);
  if (name !== value) bad();
  return name;
}

export function parseTimplanSeries(value: unknown): TimplanSeries {
  const r = gymShape(value, ['id', 'name', 'revision']);
  return { id: gymUuid(r.id), name: parseTimplanName(r.name), revision: gymInteger(r.revision) };
}

/** A separate plan is never inferred from a missing predecessor on a version command. */
export function parseNamedTimplanCreateRequest(value: unknown): NamedTimplanCreateRequest {
  const r = gymShape(value, ['commandId', 'sourcePlanId', 'expectedSourceRevision', 'expectedEducationRevision',
    'unitId', 'name', 'copyFromPlanId', 'expectedCopyFromRevision']);
  const copyFromPlanId = r.copyFromPlanId === null ? null : gymUuid(r.copyFromPlanId);
  const expectedCopyFromRevision = r.expectedCopyFromRevision === null ? null : gymInteger(r.expectedCopyFromRevision);
  if ((copyFromPlanId === null) !== (expectedCopyFromRevision === null)) bad();
  return { commandId: gymUuid(r.commandId), sourcePlanId: gymUuid(r.sourcePlanId),
    expectedSourceRevision: gymInteger(r.expectedSourceRevision), expectedEducationRevision: gymInteger(r.expectedEducationRevision),
    unitId: gymUuid(r.unitId), name: parseTimplanName(r.name), copyFromPlanId, expectedCopyFromRevision };
}

export function parseNamedTimplanRenameRequest(value: unknown): NamedTimplanRenameRequest {
  const r = gymShape(value, ['commandId', 'planId', 'seriesId', 'expectedSeriesRevision', 'name']);
  return { commandId: gymUuid(r.commandId), planId: gymUuid(r.planId), seriesId: gymUuid(r.seriesId),
    expectedSeriesRevision: gymInteger(r.expectedSeriesRevision), name: parseTimplanName(r.name) };
}
