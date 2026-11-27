'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { parseGymTimplan, type GymTimplan } from '@/lib/gym-timplan.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import ProtectedClassTimplans from './protected-class-timplans';

export type IntakeTimetableChoice = { id: string; name: string; version: number };

export default function PupilIntakeTimetable({ klass, choices, scopeKey, returnTo, schoolYear, onSessionLost, onClose }: {
  klass: { id: string; name: string; offeringId: string; timetable: { planId: string; name: string; version: number } | null };
  choices: IntakeTimetableChoice[]; scopeKey: string; returnTo: string; schoolYear: number;
  onSessionLost: () => void; onClose: () => void;
}) {
  const initial = klass.timetable;
  const plans = initial && !choices.some(item => item.id === initial.planId)
    ? [{ id: initial.planId, name: initial.name, version: initial.version }, ...choices] : choices;
  const [planId, setPlanId] = useState(initial?.planId ?? (plans.length === 1 ? plans[0].id : ''));
  const [plan, setPlan] = useState<GymTimplan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!planId) return;
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setPlan(null); setError(''); setBusy(true); } });
    void api.post<unknown>('/api/timplaner/gym/lasa', { planId }, abort.signal).then(raw => {
      const next = parseGymTimplan(raw, planId);
      if (next.offeringId !== klass.offeringId) throw new Error('Avvikande utbildning.');
      if (!abort.signal.aborted) setPlan(next);
    }).catch(caught => {
      if (abort.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) onSessionLost();
      else setError('Timplanen kunde inte läsas. Återgå och läs om klassens uppgifter.');
    }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [klass.offeringId, onSessionLost, planId]);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-3xl" showCloseButton={false}>
      <DialogTitle>Timplan för {klass.name}</DialogTitle>
      <DialogDescription>Granska klassens timplanskoppling för valt läsår.</DialogDescription>
      {plans.length > 1 && <label className="grid gap-1">Timplan<select className="h-11 max-w-full rounded-md border border-input bg-background px-3" value={planId}
        disabled={busy} onChange={event => { setPlan(null); setPlanId(event.target.value); }}>
        <option value="">Välj fastställd timplan</option>
        {plans.map(item => <option value={item.id} key={item.id}>{item.name} · version {item.version}</option>)}
      </select></label>}
      {!plans.length && <p>Fastställd timplan saknas för utbildningen. Öppna Timplaner för att ta fram underlaget. Klassfördelning och studieplansutkast kan hanteras här under tiden.</p>}
      {busy && <output>Hämtar timplanen…</output>}
      {error && <p role="alert" className="validation-warning">{error}</p>}
      {!!plan && <ProtectedClassTimplans scopeKey={scopeKey} returnTo={returnTo} plan={plan} schoolYear={schoolYear} initialClassId={klass.id}
        canPrepare disabled={busy} onSecurityFailure={caught => { if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return true; } return false; }} />}
      <div><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Tillbaka till Elevmottagande</Button></div>
    </DialogContent>
  </Dialog>;
}
