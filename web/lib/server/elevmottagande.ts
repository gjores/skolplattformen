import {
  ELEVMOTTAGANDE_LIMIT,
  type ElevmottagandeAllocationRequest,
  type ElevmottagandePreview,
  type ElevmottagandeRead,
  type ElevmottagandeReceipt,
} from '../elevmottagande.ts';
import { isValidDate } from '../pupil-register-model.ts';
import { AuditUnavailable, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { logEvent } from './events.ts';
import { mandateOperation } from './mandate-route.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function bad(): never {
  throw new Deny('bad_request', 400);
}

function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const row = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(row, key))
    || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) return bad();
  return row;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) return bad();
  return value.toLowerCase();
}

function date(value: unknown): string {
  if (!isValidDate(value) || value < '2000-01-01' || value > '2101-06-30') return bad();
  return value;
}

function scope(row: Record<string, unknown>) {
  if (typeof row.schoolYear !== 'number' || !Number.isInteger(row.schoolYear) || row.schoolYear < 2000 || row.schoolYear > 2100) return bad();
  return { unitId: uuid(row.unitId), schoolYear: row.schoolYear, offeringId: row.offeringId == null ? null : uuid(row.offeringId) };
}

export function parseElevmottagandeRead(value: unknown) {
  const row = object(value, ['unitId', 'schoolYear', 'on'], ['offeringId']);
  return { ...scope(row), on: date(row.on) };
}

export function parseElevmottagandeAllocation(value: unknown): ElevmottagandeAllocationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('action' in value)) return bad();
  const common = ['action', 'unitId', 'schoolYear'];
  switch (value.action) {
    case 'preview': {
      const row = object(value, [...common, 'on', 'rows'], ['offeringId']);
      if (!Array.isArray(row.rows) || !row.rows.length || row.rows.length > ELEVMOTTAGANDE_LIMIT) return bad();
      const rows = row.rows.map(valueRow => {
        const entry = object(valueRow, ['placementId', 'classId', 'startsOn']);
        return { placementId: uuid(entry.placementId), classId: uuid(entry.classId), startsOn: date(entry.startsOn) };
      });
      if (new Set(rows.map(entry => entry.placementId)).size !== rows.length) return bad();
      return { action: 'preview', ...scope(row), on: date(row.on), rows };
    }
    case 'save': {
      const row = object(value, [...common, 'on', 'commandId', 'previewToken'], ['offeringId']);
      return { action: 'save', ...scope(row), on: date(row.on), commandId: uuid(row.commandId), previewToken: uuid(row.previewToken) };
    }
    case 'status': {
      const row = object(value, common, ['offeringId', 'commandId']);
      return { action: 'status', ...scope(row), ...(row.commandId === undefined ? {} : { commandId: uuid(row.commandId) }) };
    }
    default:
      return bad();
  }
}

type ReadRequest = ReturnType<typeof parseElevmottagandeRead>;
type RegisterBody = ElevmottagandeRead | ElevmottagandePreview | ElevmottagandeReceipt | null;

async function auditResult<T extends RegisterBody>(tx: Tx, ctx: Context, request: ReadRequest | ElevmottagandeAllocationRequest,
  raw: unknown, action: string): Promise<{ body: T; event: { action: string; objectType: string; objectId: string; details: { schoolYear: number } } }> {
  if (!raw || typeof raw !== 'object' || !('body' in raw) || !('protectedIds' in raw)
    || !Array.isArray(raw.protectedIds) || !raw.protectedIds.every(id => typeof id === 'string' && uuidPattern.test(id))) {
    throw new AuditUnavailable();
  }
  const details = { schoolYear: request.schoolYear };
  try {
    for (const id of new Set<string>(raw.protectedIds)) {
      await logEvent(tx, ctx, { action: 'pupil_protected_read', objectType: 'pupil', objectId: id, outcome: 'ok', details });
    }
  } catch {
    throw new AuditUnavailable();
  }
  return { body: raw.body as T, event: { action, objectType: 'school', objectId: request.unitId, details } };
}

export async function readElevmottagande(tx: Tx, ctx: Context, request: ReadRequest) {
  const rows = await mandateOperation(() => tx<{ result: unknown }[]>`select public.elevmottagande_read(${tx.json(request)}) as result`);
  return auditResult<ElevmottagandeRead>(tx, ctx, request, rows[0]?.result, 'elevmottagande_read');
}

export async function allocateElevmottagande(tx: Tx, ctx: Context, request: ElevmottagandeAllocationRequest) {
  const rows = await mandateOperation(() => tx<{ result: unknown }[]>`select public.elevmottagande_allocate(${tx.json(request)}) as result`);
  return auditResult<ElevmottagandePreview | ElevmottagandeReceipt | null>(
    tx, ctx, request, rows[0]?.result, 'elevmottagande_' + request.action,
  );
}
