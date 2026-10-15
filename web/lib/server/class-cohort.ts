import {
  parseClassCohortUnderlag, parseClassCohortCreateReply, parseClassCohortStatusReply,
  type ClassCohortUnderlagRequest, type ClassCohortCreateRequest,
} from '../class-cohort.ts';
import { ProgramplanContractError } from '../programplan-catalog.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

async function operation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await mandateOperation(async () => {
      try { return await run(); }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '40001'
          && 'hint' in error && error.hint === 'class_plan_not_ready') throw new Deny('class_plan_not_ready', 409);
        throw error;
      }
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable();
    throw error;
  }
}

function one(rows: { result: unknown }[]): unknown {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') throw new AuditUnavailable();
  return rows[0].result;
}

export function classCohortRequest<T>(parse: (value: unknown) => T, value: unknown): T {
  try { return parse(value); }
  catch (error) {
    if (error instanceof ProgramplanContractError) throw new Deny('bad_request', 400);
    throw error;
  }
}

export async function readClassCohort(tx: Tx, input: ClassCohortUnderlagRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_class_cohort_underlag(${input.offeringId},${input.unitId}) result`));
  try {
    return { body: parseClassCohortUnderlag(raw, input), event: {
      action: 'class_cohort_read', objectType: 'education', objectId: input.offeringId, details: { unitId: input.unitId },
    } };
  } catch { throw new AuditUnavailable(); }
}

export async function createClassCohort(tx: Tx, input: ClassCohortCreateRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_class_cohort_command(${tx.json(input)}) result`));
  try {
    const body = parseClassCohortCreateReply(raw, input);
    return { body, event: {
      action: 'class_cohort_created', objectType: 'education_command', objectId: input.commandId,
      details: { unitId: input.unitId, count: body.classes.length },
    } };
  } catch { throw new AuditUnavailable(); }
}

export async function readClassCohortStatus(tx: Tx, input: ClassCohortCreateRequest) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_class_cohort_status(${tx.json(input)}) result`));
  try {
    return { body: parseClassCohortStatusReply(raw, input), event: {
      action: 'class_cohort_status_read', objectType: 'education_command', objectId: input.commandId, details: { unitId: input.unitId },
    } };
  } catch { throw new AuditUnavailable(); }
}
