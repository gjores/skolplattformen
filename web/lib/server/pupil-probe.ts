// Syntetiskt elevprov (03-05). Urvalet görs i SQL (phase3_read_pupils) utifrån
// serverns aktuella mandat innan data lämnar transaktionen. Servern lämnar
// endast den explicita fältlistan och först efter att den obligatoriska
// säkerhetshändelsen skrivits i samma transaktion (protectedRoute).
import {
  parseProbeQuery,
  toProbePupil,
  type ProbeRead,
  type ProbeRow,
  type ProbeScope,
  type ProbePupil,
} from '../pupil-probe-model.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

export { probeCsv } from '../pupil-probe-model.ts';

export function requireProbeQuery(url: string): ProbeRead {
  const read = parseProbeQuery(url);
  if (!read) throw new Deny('bad_request', 400);
  return read;
}

export async function readProbeScope(tx: Tx): Promise<ProbeScope> {
  const rows = await mandateOperation(
    () => tx<{ scope: ProbeScope }[]>`select public.phase3_probe_scope() as scope`,
  );
  return rows[0].scope;
}

export async function readProbePupils(
  tx: Tx,
  read: ProbeRead,
  forExport = false,
): Promise<ProbePupil[]> {
  const pupilId = read.form === 'list' ? null : read.pupilId;
  const caseId = read.form === 'case' ? read.caseId : null;
  const rows = await mandateOperation(
    () => tx<ProbeRow[]>`select id, display_name, unit_id, to_jsonb(group_ids) as group_ids
      from public.phase3_read_pupils(${pupilId}::uuid, ${caseId}::uuid, ${forExport})`,
  );
  return rows.map(toProbePupil);
}
