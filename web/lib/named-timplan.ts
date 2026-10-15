import { ProgramplanContractError } from './programplan-catalog.ts';
import { gymBoolean, gymInteger, gymShape, gymUuid, parseGymTimplanCreateReply, type GymTimplanCreateReply } from './gym-timplan.ts';

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
export type NamedTimplanCreateReply = GymTimplanCreateReply & { series: TimplanSeries };
export type NamedTimplanRenameReply = { planId: string; series: TimplanSeries; replayed: boolean };

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
    expectedSeriesRevision: gymInteger(r.expectedSeriesRevision, 2147483646), name: parseTimplanName(r.name) };
}

/** New-series receipts are immutable, including their original name and revision. */
export function parseNamedTimplanCreateReply(value: unknown, input: NamedTimplanCreateRequest): NamedTimplanCreateReply {
  const r = gymShape(value, ['id', 'offeringId', 'unitId', 'version', 'revision', 'sourcePlanId', 'sourceRevision', 'replayed', 'carriedRows', 'resetRows', 'series']);
  const { series: rawSeries, ...rest } = r;
  const reply = parseGymTimplanCreateReply(rest, { ...input, predecessorPlanId: null, expectedPredecessorRevision: null });
  const series = parseTimplanSeries(rawSeries);
  if (reply.version !== 1 || reply.revision !== 0 || series.revision !== 0 || series.name !== input.name
    || input.copyFromPlanId === null && reply.carriedRows !== 0) bad();
  return { ...reply, series };
}

export function parseNamedTimplanRenameReply(value: unknown, input: NamedTimplanRenameRequest): NamedTimplanRenameReply {
  const r = gymShape(value, ['planId', 'series', 'replayed']), series = parseTimplanSeries(r.series);
  if (gymUuid(r.planId) !== input.planId || series.id !== input.seriesId || series.name !== input.name
    || series.revision !== input.expectedSeriesRevision + 1) bad();
  return { planId: input.planId, series, replayed: gymBoolean(r.replayed) };
}
