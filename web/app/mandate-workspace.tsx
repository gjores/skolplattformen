'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FUNCTION_LABEL, type AccessFunction } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import type { ActiveContext } from './context-switch';
import MandateGrantDialog from './mandate-grant-dialog';
import MfaStepUpNotice from './mfa-step-up';

type School = { id: string; name: string };
type Mandate = {
  id: string; displayName: string; function: AccessFunction; schools: School[];
  scopeKind: 'school' | 'group' | 'pupil' | 'case';
  validFrom: string; validTo: string | null; startsAt: string | null; endsAt: string | null;
  status: 'giltigt' | 'kommande'; approverName: string | null; purposeCode: string | null;
};
type Connection = { unitId: string; enabled: boolean; version: number; result: string | null };
type Props = { context: ActiveContext; epoch: number; onMfaRequired: () => void; onSessionLost: () => void };
const scopeLabels = { school: 'Skola', group: 'Tilldelade grupper', pupil: 'Tilldelade elever', case: 'Tilldelade ärenden' };

function validity(row: Mandate) {
  if (row.startsAt && row.endsAt) return `${new Date(row.startsAt).toLocaleString('sv-SE')} – ${new Date(row.endsAt).toLocaleString('sv-SE')}`;
  return `${row.validFrom} – ${row.validTo ?? 'tills vidare'}`;
}

export default function MandateWorkspace(props: Props) {
  const isIT = props.context.function === 'it';
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ending, setEnding] = useState<Mandate | null>(null);
  const [granting, setGranting] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const lifecycle = useRef(0);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  const failure = useCallback((caught: unknown) => {
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    if (caught instanceof ApiError) {
      if (caught.status === 401) { callbacks.current.onSessionLost(); return; }
      if (caught.code === 'mfa_required') {
        // Arbetsytans ruta syns inte bakom en öppen dialog; bekräftelsedialogen visar egen åtgärd.
        callbacks.current.onMfaRequired();
        setMfaNeeded(true);
        return;
      }
      if (caught.status === 409) setConflict(true);
      const message = caught.status === 409 ? 'Uppgifterna har ändrats. Hämta aktuellt läge innan du fortsätter.'
        : caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.'
        : caught.status === 403 ? 'Ditt aktuella uppdrag tillåter inte åtgärden.'
        : caught.status === 404 ? 'Uppgiften finns inte längre eller är inte tillgänglig i ditt uppdrag.'
        : caught.code === 'context_changed' ? 'Uppdraget har ändrats. Ladda om arbetsytan.'
        : 'Åtgärden kunde inte slutföras. Försök igen.';
      setError(`${message}${caught.correlationId ? ` Referens: ${caught.correlationId}` : ''}`);
      if (caught.status === 403 || caught.status === 404) { setMandates([]); setConnection(null); setEnding(null); }
    } else setError('Tjänsten kunde inte nås. Försök igen.');
  }, []);

  const load = useCallback(async (unitId?: string) => {
    const generation = lifecycle.current;
    setBusy(true); setError(null); setStatus(null); setConflict(false); setMfaNeeded(false);
    setEnding(null); setMandates([]); setConnection(null);
    try {
      if (isIT) {
        let selected = unitId;
        if (!selected) {
          const result = await api.get<{ schools: School[] }>('/api/kund/anslutning');
          if (generation !== lifecycle.current) return;
          setSchools(result.schools);
          selected = result.schools[0]?.id;
          setSchoolId(selected ?? '');
        }
        if (selected) {
          const result = await api.get<Connection>(`/api/kund/anslutning?unitId=${encodeURIComponent(selected)}`);
          if (generation !== lifecycle.current) return;
          setConnection(result);
        }
      } else {
        const result = await api.get<{ mandates: Mandate[] }>('/api/kund/mandat');
        if (generation !== lifecycle.current) return;
        setMandates(result.mandates);
      }
    } catch (caught) { if (generation === lifecycle.current) failure(caught); }
    finally { if (generation === lifecycle.current) setBusy(false); }
  }, [isIT, failure]);

  useEffect(() => {
    lifecycle.current += 1;
    const generation = lifecycle.current;
    queueMicrotask(() => { if (generation === lifecycle.current) void load(); });
    return () => { lifecycle.current += 1; };
    // The workspace is keyed by context epoch; callbacks use a current ref.
  }, [props.epoch, props.context.assignmentId, load]);

  async function endMandate() {
    if (!ending || busy) return;
    const generation = lifecycle.current;
    setBusy(true); setError(null); setStatus(null); setMfaNeeded(false);
    try {
      const result = await api.post<{ selfEnded: boolean }>('/api/kund/uppdrag/avsluta', { assignmentId: ending.id });
      if (generation !== lifecycle.current) return;
      if (result.selfEnded) { callbacks.current.onSessionLost(); return; }
      setMandates((rows) => rows.filter((row) => row.id !== ending.id));
      setEnding(null); setStatus('Uppdraget är avslutat. Uppdrag som bygger på detta mandat gäller inte längre.');
    } catch (caught) { if (generation === lifecycle.current) failure(caught); }
    finally { if (generation === lifecycle.current) setBusy(false); }
  }

  async function changeConnection(test: boolean) {
    if (!connection || busy || conflict) return;
    const generation = lifecycle.current;
    setBusy(true); setError(null); setStatus(null); setMfaNeeded(false);
    try {
      const result = test
        ? await api.post<Connection>('/api/kund/anslutning', { unitId: schoolId, action: 'test' })
        : await api.patch<Connection>('/api/kund/anslutning', { unitId: schoolId, enabled: !connection.enabled, expectedVersion: connection.version });
      if (generation !== lifecycle.current) return;
      setConnection(result);
      setStatus(test ? (result.result === 'synthetic_ok' ? 'Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.' : 'Anslutningen är pausad. Aktivera den innan du kör testet.') : `Den lokala anslutningen är ${result.enabled ? 'aktiv' : 'pausad'}.`);
    } catch (caught) { if (generation === lifecycle.current) failure(caught); }
    finally { if (generation === lifecycle.current) setBusy(false); }
  }

  return (
    <div className="admin-workspace protected-admin mandate-workspace" aria-busy={busy}>
      <div className="admin-heading"><div><p className="admin-kicker">SKYDDAD PROVMILJÖ</p><h1>{isIT ? 'Lokal anslutning' : 'Mandat'}</h1><p>{props.context.customerName} · {props.context.label}</p></div></div>
      <p>{isIT ? 'Inställningar och syntetiskt test för skolorna i ditt IT-uppdrag.' : 'Giltiga och kommande uppdrag som du har tilldelat genom ditt aktuella mandat.'}</p>
      {status && <output className="admin-notice">{status}</output>}
      {error && <output role="alert" className="validation-warning">{error}</output>}
      <div className="mandate-actions"><Button variant="outline" disabled={busy} onClick={() => void load(isIT ? schoolId : undefined)}>Hämta aktuellt läge</Button>{!isIT && <Button disabled={busy} onClick={() => { setError(null); setGranting(true); }}>Tilldela uppdrag</Button>}</div>
      {busy && <output>Hämtar eller sparar uppgifter…</output>}
      {isIT ? <section className="protected-card">
        <h2>Skolans lokala anslutning</h2>
        {schools.length > 0 && <div className="protected-filter"><label>Skola<select value={schoolId} disabled={busy} onChange={(event) => { setSchoolId(event.target.value); void load(event.target.value); }}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label></div>}
        {!busy && !error && schools.length === 0 && <p>Det finns inga tillgängliga skolor i ditt IT-uppdrag.</p>}
        {connection && <><p>Status: <strong>{connection.enabled ? 'Aktiv' : 'Pausad'}</strong></p><div className="mandate-actions"><Button disabled={busy || conflict} onClick={() => void changeConnection(false)}>{connection.enabled ? 'Pausa anslutningen' : 'Aktivera anslutningen'}</Button><Button variant="outline" disabled={busy || conflict} onClick={() => void changeConnection(true)}>Kör syntetiskt test</Button></div></>}
      </section> : <section aria-label="Tilldelade mandat">
        {!busy && !error && mandates.length === 0 && <p>Du har inga giltiga eller kommande tilldelningar i detta uppdrag.</p>}
        <div className="mandate-list">{mandates.map((row) => <article className="protected-card" key={row.id}>
          <h2>{row.displayName}</h2><dl className="mandate-facts"><div><dt>Funktion</dt><dd>{FUNCTION_LABEL[row.function]}</dd></div><div><dt>Omfattning</dt><dd>{scopeLabels[row.scopeKind]} · {row.schools.map((school) => school.name).join(', ')}</dd></div><div><dt>Giltighet</dt><dd>{validity(row)}</dd></div>{row.function === 'support' && <><div><dt>Syfte</dt><dd>{row.purposeCode === 'synthetic-troubleshooting' ? 'Syntetisk felsökning' : 'Ej angivet'}</dd></div><div><dt>Godkännare</dt><dd>{row.approverName ?? 'Namn saknas'}</dd></div></>}<div><dt>Status</dt><dd>{row.status === 'kommande' ? 'Kommande' : 'Giltigt'}</dd></div></dl>
          <Button variant="outline" disabled={busy} onClick={() => { setError(null); setMfaNeeded(false); setEnding(row); }}>Avsluta uppdrag för {row.displayName}</Button>
        </article>)}</div>
      </section>}
      {!isIT && <MandateGrantDialog open={granting} epoch={props.epoch} onOpenChange={setGranting} onMfaRequired={() => callbacks.current.onMfaRequired()} onSessionLost={() => callbacks.current.onSessionLost()} onGranted={(name) => { setGranting(false); void load().then(() => setStatus(`Uppdraget har tilldelats ${name}.`)); }} />}
      <Dialog open={ending !== null} onOpenChange={(open) => { if (!open && !busy) setEnding(null); }}>
        <DialogContent className="mandate-dialog" showCloseButton={!busy}>
          <DialogTitle>Avsluta uppdrag?</DialogTitle>
          <DialogDescription>{ending && `${ending.displayName} förlorar uppdraget ${FUNCTION_LABEL[ending.function]} för ${ending.schools.map((school) => school.name).join(', ')}. Även uppdrag som bygger på detta mandat upphör att gälla.`}</DialogDescription>
          {error && <output role="alert" className="validation-warning">{error}</output>}
          {mfaNeeded && <MfaStepUpNotice message="Att avsluta uppdrag kräver verifiering med engångskod." detail="Efter verifieringen kommer du tillbaka till arbetsytan och avslutar uppdraget igen." />}
          <div className="mandate-actions"><DialogClose render={<Button variant="outline" disabled={busy} />}>Avbryt</DialogClose><Button disabled={busy} onClick={() => void endMandate()}>Ja, avsluta uppdraget</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
