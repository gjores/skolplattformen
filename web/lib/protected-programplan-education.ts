import { parseProgramplanEducationCreate, parseProgramplanEducationCreated, parseProgramplanEducationStatus,
  type ProgramplanEducationCreateRequest } from './programplan-education-contract.ts';

export function newEducationCommand(input: Omit<ProgramplanEducationCreateRequest, 'commandId'>, commandId: string): ProgramplanEducationCreateRequest {
  return parseProgramplanEducationCreate({ commandId, ...input });
}
export function educationStatusForCommand(value: unknown, command: ProgramplanEducationCreateRequest) {
  const status = parseProgramplanEducationStatus(value, { commandId: command.commandId });
  if (status.status === 'not_found') return status;
  const created = parseProgramplanEducationCreated({ commandId: status.commandId, education: status.education, plan: status.plan, replayed: true }, command);
  return { ...created, status: 'created' as const };
}
