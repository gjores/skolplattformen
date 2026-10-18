import { canonicalCatalogJson } from '../programplan-catalog.ts';
import { parseProgramplan } from '../programplan-contract.ts';
import { parseProgramplanExamination, validProgramplanExamination, type ProgramplanExamination } from '../programplan-examination.ts';
import { gymShape, gymUuid, gymInteger } from '../gym-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { lifecycleOperation } from './programplan-lifecycle.ts';

export type ProgramplanExaminationWrite = { planId: string; expectedRevision: number; examination: ProgramplanExamination; confirmed: true };
export function parseProgramplanExaminationWrite(value: unknown): ProgramplanExaminationWrite {
  try {
    const r = gymShape(value,['planId','expectedRevision','examination','confirmed']);
    if (r.confirmed !== true) throw new TypeError();
    return { planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision), examination: parseProgramplanExamination(r.examination), confirmed: true };
  } catch { throw new Deny('bad_request',400); }
}
export async function writeProgramplanExamination(tx: Tx, input: ProgramplanExaminationWrite) {
  const rows = await lifecycleOperation(() => tx<{result:unknown}[]>`select public.phase5_set_programplan_examination(${input.planId},${input.expectedRevision},${tx.json(input.examination)}::jsonb) as result`);
  try {
    if (rows.length !== 1) throw new TypeError();
    const body = parseProgramplan(rows[0].result), basis = body.basisReference;
    if (body.id !== input.planId || body.revision !== input.expectedRevision+1 || body.status !== 'utkast' || body.decidedOn !== null || !basis
      || !validProgramplanExamination(basis.examination,basis.programRef.code,basis.startedOn)
      || canonicalCatalogJson(basis.examination) !== canonicalCatalogJson(input.examination)) throw new TypeError();
    return { body, event: { action:'programplan_examination_changed',objectType:'programplan',objectId:body.id } };
  } catch { throw new AuditUnavailable(); }
}
