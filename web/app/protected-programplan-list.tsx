'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseProgramplanSelection } from '@/lib/programplan-education-contract.ts';
import type { PlanningRow } from '@/lib/planning-year-contract.ts';
import ProtectedPlanList from './protected-plan-list';
import { usePlanningContext } from './planning-context';

type Props = {
  disabled: boolean; canEditPlans: boolean; onSecurityFailure: (error: unknown) => boolean;
  onOpen: (row: PlanningRow) => void; onCopy: (row: PlanningRow) => void; onNew: () => void;
  onLoaded: (canCreateEducation: boolean) => void;
};
/** Actual annual rows; creation permission is read separately without resolving catalogue names. */
export default function ProgramplanList(props: Props) {
  const { setup, selection } = usePlanningContext();
  const unitId = selection?.unitId ?? null;
  const key = setup && selection ? JSON.stringify([setup.customerId, selection.schoolYear, selection.unitId]) : '';
  const [permission, setPermission] = useState({ key: '', canCreate: false, loading: true, error: null as string | null });
  const [retry, setRetry] = useState(0), latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController(); let active = true;
    const request = { unitId, catalogId: null, programRef: null };
    queueMicrotask(() => { if (active) { setPermission({ key, canCreate: false, loading: true, error: null }); latest.current.onLoaded(false); } });
    void api.post('/api/programplaner/val', request, controller.signal).then(raw => {
      const result = parseProgramplanSelection(raw, request);
      if (active) { setPermission({ key, canCreate: result.canCreateEducation, loading: false, error: null }); latest.current.onLoaded(result.canCreateEducation); }
    }).catch(error => {
      if (!active || error instanceof DOMException && error.name === 'AbortError' || latest.current.onSecurityFailure(error)) return;
      setPermission({ key, canCreate: false, loading: false, error: error instanceof ApiError ? error.message : 'Rätten att skapa programplan kunde inte läsas.' });
    });
    return () => { active = false; controller.abort(); };
  }, [key, unitId, retry]);
  const visible = permission.key === key ? permission : null, canCreate = visible?.canCreate === true;
  const locked = props.disabled || !visible || visible.loading;
  return <section className="ppl" aria-label="Programplansöversikt">
    <div className="pps-head"><div className="pps-head-text"><h1 className="ppl-title">Programplaner</h1>
      <p>Välj läsår och skola. Öppna den version som årets planeringsrad använder.</p></div>
      {canCreate && props.canEditPlans && <div className="pps-actions"><Button disabled={locked} onClick={props.onNew}><Plus size={16} aria-hidden="true"/>Ny programplan</Button></div>}
    </div>
    {visible?.error && <div className="pp-alert" role="alert"><p>{visible.error}</p><Button variant="outline" disabled={props.disabled} onClick={() => setRetry(n => n + 1)}>Läs skapanderätt igen</Button></div>}
    <ProtectedPlanList disabled={props.disabled} onSecurityFailure={props.onSecurityFailure} onOpen={props.onOpen}
      actions={row => canCreate && row.plan && <Button variant="outline" disabled={locked} aria-label={`Kopiera ${row.educationName}, ${row.schoolName}, version ${row.plan.version}`} onClick={() => props.onCopy(row)}><Copy size={15} aria-hidden="true"/>Kopiera</Button>}/>
  </section>;
}
