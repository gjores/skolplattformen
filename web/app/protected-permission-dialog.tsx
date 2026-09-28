'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ProtectedPermissionOption } from '@/lib/server/protected-permission.ts';
import MfaStepUpNotice from './mfa-step-up';

type Props = { open: boolean; epoch: number; onOpenChange: (open: boolean) => void; onMfaRequired: () => void; onSessionLost: () => void };
const path = '/api/kund/skyddsbehorighet';
export default function ProtectedPermissionDialog(props: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const [options, setOptions] = useState<ProtectedPermissionOption[] | null>(null);
  const [unitId, setUnitId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [pending, setPending] = useState<'grant' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const generation = useRef(0);
  const popup = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });
  useUnsavedChanges(`protected-permission-${props.epoch}`, props.open && pending !== null);

  const fail = useCallback((caught: unknown) => {
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    if (caught instanceof ApiError) {
      if (caught.status === 401) { callbacks.current.onSessionLost(); return; }
      if (caught.code === 'mfa_required') { setMfaNeeded(true); callbacks.current.onMfaRequired(); return; }
      const message = caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.'
        : caught.code === 'context_changed' ? 'Uppdraget har ändrats. Öppna dialogen igen i ditt aktuella uppdrag.'
        : caught.status === 403 ? 'Ditt aktuella uppdrag tillåter inte åtgärden.'
        : caught.status === 404 || caught.status === 409 ? 'Uppdraget eller behörigheten har ändrats. Hämta aktuellt läge innan du fortsätter.'
        : 'Åtgärden kunde inte slutföras. Dina val finns kvar; försök igen.';
      setError(`${message}${caught.correlationId ? ` Referens: ${caught.correlationId}` : ''}`);
    } else setError('Tjänsten kunde inte nås. Dina val finns kvar; försök igen.');
  }, []);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true); setError(null); setMfaNeeded(false); setOptions(null);
    try {
      const result = await api.get<{ permissions: ProtectedPermissionOption[] }>(path);
      if (current !== generation.current) return;
      setOptions(result.permissions);
      setUnitId(previous => result.permissions.some(row => row.unitId === previous) ? previous : result.permissions[0]?.unitId ?? '');
      setAssignmentId(previous => result.permissions.some(row => row.assignmentId === previous) ? previous : '');
    } catch (caught) { if (current === generation.current) fail(caught); }
    finally { if (current === generation.current) setBusy(false); }
  }, [fail]);

  useEffect(() => {
    const current = ++generation.current;
    if (props.open) queueMicrotask(() => {
      if (current !== generation.current) return;
      setOptions(null); setUnitId(''); setAssignmentId(''); setPending(null); setStatus(null); setSaving(false);
      void load();
    });
    return () => { generation.current += 1; };
  }, [props.open, props.epoch, load]);

  useEffect(() => { if (pending) confirmButton.current?.focus(); }, [pending]);
  useEffect(() => { if (!busy && status) (actionButton.current ?? popup.current)?.focus(); }, [busy, status]);

  const schools = [...new Map((options ?? []).map(row => [row.unitId, { id: row.unitId, name: row.schoolName }])).values()];
  const recipients = (options ?? []).filter(row => row.unitId === unitId);
  const selected = recipients.find(row => row.assignmentId === assignmentId);
  function discard() { return pending === null || confirmDiscard(); }
  function close(open: boolean) {
    if (!saving && (open || discard())) { setPending(null); props.onOpenChange(open); }
  }
  async function save() {
    if (!selected || !pending || busy) return;
    if (pending === 'revoke' && !selected.permissionId) return;
    const current = ++generation.current;
    const action = pending;
    setBusy(true); setSaving(true); setError(null); setStatus(null); setMfaNeeded(false);
    try {
      await api.post(path, action === 'grant' ? { action, assignmentId: selected.assignmentId, unitId: selected.unitId } : { action, permissionId: selected.permissionId });
      if (current !== generation.current) return;
      setPending(null); setSaving(false);
      setStatus(action === 'grant' ? 'Skyddsbehörigheten har tilldelats. Hämtar aktuellt läge…' : 'Skyddsbehörigheten har återkallats. Hämtar aktuellt läge…');
      // The old permission snapshot is discarded; no optimistic privilege state.
      await load();
      if (current + 1 === generation.current) setStatus(action === 'grant' ? 'Tilldelningen är sparad.' : 'Återkallelsen är sparad.');
    } catch (caught) { if (current === generation.current) fail(caught); }
    finally { if (current === generation.current) { setSaving(false); setBusy(false); } }
  }

  return <Dialog open={props.open} onOpenChange={close}>
    <DialogContent ref={popup} initialFocus={popup} aria-labelledby={titleId} aria-describedby={descriptionId} className="mandate-dialog mandate-grant-dialog [&_button]:min-w-11" showCloseButton={!saving}>
      <DialogTitle id={titleId}>Skyddsbehörighet</DialogTitle>
      <DialogDescription id={descriptionId}>Som huvudman kan du ge ett befintligt administratörsuppdrag rätt att se skyddade elevuppgifter på en vald skola. Rätten gäller bara det uppdraget och den skolan.</DialogDescription>
      {error && <output role="alert" className="validation-warning">{error}</output>}
      {status && <output className="admin-notice">{status}</output>}
      {mfaNeeded && <MfaStepUpNotice message="Ändring av skyddsbehörighet kräver verifiering med engångskod." detail="Efter verifieringen återkommer du till arbetsytan. Öppna dialogen och välj åtgärden igen; dina osparade val sparas inte." />}
      {busy && <output>Hämtar eller sparar behörigheter…</output>}
      {options && options.length === 0 && <p>Det finns inga giltiga administratörsuppdrag på skolorna i ditt uppdrag.</p>}
      {options && options.length > 0 && <div className="protected-form mandate-grant-form">
        <label>Skola<select value={unitId} disabled={busy} onChange={event => { if (!discard()) return; setUnitId(event.target.value); setAssignmentId(''); setPending(null); setStatus(null); setError(null); }}>
          {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select></label>
        <label>Administratörsuppdrag<select value={selected ? assignmentId : ''} disabled={busy} onChange={event => { if (!discard()) return; setAssignmentId(event.target.value); setPending(null); setStatus(null); setError(null); }}>
          <option value="">Välj administratörsuppdrag</option>
          {recipients.map((row, index) => <option key={row.assignmentId} value={row.assignmentId}>{row.displayName}{recipients.filter(other => other.displayName === row.displayName).length > 1 ? ` · uppdrag ${index + 1}` : ''}</option>)}
        </select></label>
        {selected && <div className="mandate-choice">
          <p>Aktuell status: <strong>{selected.permissionId ? 'Har skyddsbehörighet' : 'Saknar skyddsbehörighet'}</strong></p>
          {!pending ? <Button ref={actionButton} disabled={busy} variant="outline" onClick={() => { setPending(selected.permissionId ? 'revoke' : 'grant'); setStatus(null); setError(null); }}>{selected.permissionId ? 'Återkalla skyddsbehörighet' : 'Ge skyddsbehörighet'}</Button> : <>
            <p>{pending === 'grant' ? 'Ge' : 'Återkalla'} skyddsbehörighet för <strong>{selected.displayName}</strong> på <strong>{selected.schoolName}</strong>? Ändringen gäller först när du bekräftar.</p>
            <div className="mandate-actions"><Button disabled={busy} variant="outline" onClick={() => { setPending(null); setMfaNeeded(false); setError(null); queueMicrotask(() => actionButton.current?.focus()); }}>Ångra val</Button><Button ref={confirmButton} disabled={busy} onClick={() => void save()}>{pending === 'grant' ? 'Bekräfta tilldelning' : 'Bekräfta återkallelse'}</Button></div>
          </>}
        </div>}
      </div>}
      <div className="mandate-actions"><Button variant="outline" disabled={saving} onClick={() => close(false)}>Stäng</Button><Button variant="outline" disabled={busy} onClick={() => { if (!discard()) return; setPending(null); setStatus(null); void load(); }}>Hämta aktuellt läge</Button></div>
    </DialogContent>
  </Dialog>;
}
