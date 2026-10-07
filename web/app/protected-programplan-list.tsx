'use client';

import { Copy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanningRow } from '@/lib/planning-year-contract.ts';
import ProtectedPlanList from './protected-plan-list';

type Props = {
  disabled: boolean; canEditPlans: boolean; onSecurityFailure: (error: unknown) => boolean;
  onOpen: (row: PlanningRow) => void; onCopy: (row: PlanningRow) => void; onNew: () => void;
  canCreateEducation: boolean; creationLoading: boolean;
};
/** Actual annual rows; creation permission is read separately without resolving catalogue names. */
export default function ProgramplanList(props: Props) {
  const canCreate = props.canCreateEducation;
  const locked = props.disabled || props.creationLoading;
  return <section className="ppl" aria-label="Programplansöversikt">
    <div className="pps-head"><div className="pps-head-text"><h1 className="ppl-title">Programplaner</h1>
      <p>Välj läsår och skola. Öppna den version som årets planeringsrad använder.</p></div>
      {canCreate && props.canEditPlans && <div className="pps-actions"><Button disabled={locked} onClick={props.onNew}><Plus size={16} aria-hidden="true"/>Ny programplan</Button></div>}
    </div>
    <ProtectedPlanList disabled={props.disabled} onSecurityFailure={props.onSecurityFailure} onOpen={props.onOpen}
      actions={row => canCreate && row.plan && <Button variant="outline" disabled={locked} aria-label={`Kopiera ${row.educationName}, ${row.schoolName}, version ${row.plan.version}`} onClick={() => props.onCopy(row)}><Copy size={15} aria-hidden="true"/>Kopiera</Button>}/>
  </section>;
}
