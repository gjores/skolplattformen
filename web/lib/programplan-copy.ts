import { ProgramplanContractError } from './programplan-catalog.ts';
import { parseProgramplanEducationCreate, parseProgramplanEducationCreated,
  type ProgramplanEducationCreateRequest } from './programplan-education-contract.ts';
import { educationStatusForCommand } from './protected-programplan-education.ts';

export type ProgramplanCopyRequest = ProgramplanEducationCreateRequest & {
  sourcePlanId: string;
  expectedSourceRevision: number;
  expectedEducationRevision: number;
};

function invalid(): never { throw new ProgramplanContractError('invalid_programplan_education'); }
const keys = ['commandId', 'unitId', 'name', 'localCode', 'cohort', 'basisReference',
  'sourcePlanId', 'expectedSourceRevision', 'expectedEducationRevision'];
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2147483647) invalid();
  return value;
}

export function parseProgramplanCopyRequest(value: unknown): ProgramplanCopyRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)) invalid();
  const request = value as Record<string, unknown>;
  const created = parseProgramplanEducationCreate({ commandId: request.commandId, unitId: request.unitId,
    name: request.name, localCode: request.localCode, cohort: request.cohort, basisReference: request.basisReference });
  if (Object.hasOwn(created.basisReference, 'examination')) invalid();
  // Reuse the education UUID rules without reading client-supplied properties through getters.
  const sourcePlanId = parseProgramplanEducationCreate({ ...created, commandId: request.sourcePlanId }).commandId;
  return { ...created, sourcePlanId, expectedSourceRevision: revision(request.expectedSourceRevision),
    expectedEducationRevision: revision(request.expectedEducationRevision) };
}

export function newCopyCommand(input: Omit<ProgramplanCopyRequest, 'commandId'>, commandId: string) {
  return parseProgramplanCopyRequest({ ...input, commandId });
}

function creationInput(value: ProgramplanCopyRequest): ProgramplanEducationCreateRequest {
  const request = parseProgramplanCopyRequest(value);
  const { sourcePlanId: _source, expectedSourceRevision: _planRevision,
    expectedEducationRevision: _educationRevision, ...created } = request;
  return created;
}

// The immutable receipt holds the initial draft. The caller must read the exact
// created plan again for its current revision, terms and schools after the copy.
export function parseProgramplanCopyCreated(value: unknown, command: ProgramplanCopyRequest) {
  return parseProgramplanEducationCreated(value, creationInput(command));
}
export function copyStatusForCommand(value: unknown, command: ProgramplanCopyRequest) {
  const status = educationStatusForCommand(value, creationInput(command));
  if (status.status === 'not_found') return status;
  // The shared helper validates through a creation receipt, adding replayed.
  // Keep the public status response in its own strict four-field schema so it
  // can be parsed again by the browser after crossing the HTTP boundary.
  const { replayed: _replayed, ...reply } = status;
  return reply;
}
