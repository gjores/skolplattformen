import { parseProgramplanCopyCreated, copyStatusForCommand, type ProgramplanCopyRequest } from '../programplan-copy.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { lifecycleOperation } from './programplan-lifecycle.ts';
import { readProgramplanSelection } from './programplan-education.ts';

export async function copyProgramplanEducation(tx: Tx, input: ProgramplanCopyRequest, statusOnly = false) {
  if (!statusOnly) {
    // Verify the entire stored catalog, as for education creation. SQL still
    // derives the source basis, term distribution and schools under its locks.
    const { body } = await readProgramplanSelection(tx, { unitId: input.unitId,
      catalogId: input.basisReference.catalogId, programRef: input.basisReference.programRef });
    if (!body.canCreateEducation) throw new Deny('forbidden', 403);
    if (!body.projection) throw new AuditUnavailable();
  }
  const rows = await lifecycleOperation(() => tx<{ result: unknown }[]>`select public.phase5_copy_programplan_education(
    ${input.commandId}, ${input.sourcePlanId}, ${input.expectedSourceRevision}, ${input.expectedEducationRevision},
    ${input.unitId}, ${input.name}, ${input.localCode}, ${input.cohort}, ${tx.json(input.basisReference)}::jsonb, ${statusOnly}) as result`);
  try {
    if (rows.length !== 1) throw new AuditUnavailable();
    if (statusOnly) return { body: copyStatusForCommand(rows[0].result, input),
      event: { action: 'programplan_copy_status_read', objectType: 'education_command', objectId: input.commandId } };
    const body = parseProgramplanCopyCreated(rows[0].result, input);
    return { body, event: { action: 'programplan_education_copied', objectType: 'education', objectId: body.education.id } };
  } catch { throw new AuditUnavailable(); }
}
