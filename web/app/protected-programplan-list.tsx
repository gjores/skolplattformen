'use client';

import { Copy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanningRow } from '@/lib/planning-year-contract.ts';
import ProtectedPlanList from './protected-plan-list';

type Props = {
  disabled: boolean; canEditPlans: boolean; onSecurityFailure: (error: unknown) => boolean;
  onOpen: (row: PlanningRow) => void; onCopy: (row: PlanningRow) => void; onNew: () => void;
  canCreateEducation: boolean; creationLoading: boolean;
  canCreateTimplan: boolean; onTimplan: (row: PlanningRow) => void;
};
/** Actual annual rows; creation permission is read separately without resolving catalogue names. */
export default function ProgramplanList(props: Props) {
  const canCreate = props.canCreateEducation;
  const locked = props.disabled || props.creationLoading;
  return <section className="ppl" aria-label="Programplansöversikt">
    <div className="pps-head"><div className="pps-head-text"><h1 className="ppl-title">Programplaner</h1>
      <p>Här ser du programplanen och om skolans timplan är skapad. Välj Skapa timplan för att gå vidare med den här programplanen; underlaget kontrolleras innan något sparas.</p></div>
      {canCreate && props.canEditPlans && <div className="pps-actions"><Button disabled={locked} onClick={props.onNew}><Plus size={16} aria-hidden="true"/>Ny programplan</Button></div>}
    </div>
    <ProtectedPlanList programRows={{ canCreateTimplan: props.canCreateTimplan, onTimplan: props.onTimplan }} disabled={props.disabled} onSecurityFailure={props.onSecurityFailure} onOpen={props.onOpen}
      actions={row => canCreate && row.plan && <Button variant="outline" disabled={locked} aria-label={`Kopiera ${row.educationName}, ${row.schoolName}, version ${row.plan.version}`} onClick={() => props.onCopy(row)}><Copy size={15} aria-hidden="true"/>Kopiera</Button>}/>
  </section>;
}
