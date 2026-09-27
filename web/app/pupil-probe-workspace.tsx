'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FUNCTION_LABEL } from '@/lib/access-rules.ts';
import type { ProbePupil, ProbeScope } from '@/lib/pupil-probe-model.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import type { ActiveContext } from './context-switch';

type Props = { context: ActiveContext; epoch: number; onSessionLost: () => void };
type ProbeResponse = { scope: ProbeScope; pupils: ProbePupil[] };
const scopeLabels = { school: 'Skola', group: 'Tilldelade grupper', pupil: 'Tilldelade elever', case: 'Tilldelade ärenden' };

function timeText(value: string | null): string {
  return value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'medium' }) : '';
}

/**
 * Syntetiskt elevprov. Visar endast serverns filtrerade urval; ingen total lista
 * hämtas och filtreras i klienten. Innehållet rensas när arbetsytan avmonteras
 * (kontextbyte, utloggning, spärr) och när ett tidsbegränsat uppdrag upphör.
 */
export default function PupilProbeWorkspace(props: Props) {
  const [scope, setScope] = useState<ProbeScope | null>(null);
  const [pupils, setPupils] = useState<ProbePupil[]>([]);
  const [selected, setSelected] = useState<ProbePupil | null>(null);
  const [caseId, setCaseId] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const lifecycle = useRef(0);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  const clear = useCallback(() => { setPupils([]); setSelected(null); }, []);

  const failure = useCallback((caught: unknown) => {
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    clear();
    if (!(caught instanceof ApiError)) { setError('Tjänsten kunde inte nås. Försök igen.'); return; }
    if (caught.status === 401) { callbacks.current.onSessionLost(); return; }
    const message = caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.'
      : caught.code === 'context_changed' ? 'Uppdraget har ändrats. Ladda om arbetsytan.'
      : caught.status === 403 ? 'Ditt aktuella uppdrag tillåter inte elevläsning. Uppdraget kan ha upphört.'
      : caught.status === 404 ? 'Eleven eller ärendet finns inte eller ingår inte i ditt uppdrag.'
      : caught.status === 400 ? 'Uppgiften kunde inte behandlas. Kontrollera valet och försök igen.'
      : 'Åtgärden kunde inte slutföras. Försök igen.';
    if (caught.status === 403) setScope(null);
    setError(`${message}${caught.correlationId ? ` Referens: ${caught.correlationId}` : ''}`);
  }, [clear]);

  const read = useCallback(async (query: string, onResult: (result: ProbeResponse) => void) => {
    const generation = lifecycle.current;
    setBusy(true); setError(null); setStatus(null);
    try {
      const result = await api.get<ProbeResponse>(`/api/prov/elev${query}`);
      if (generation !== lifecycle.current) return;
      setScope(result.scope);
      onResult(result);
    } catch (caught) { if (generation === lifecycle.current) failure(caught); }
    finally { if (generation === lifecycle.current) setBusy(false); }
  }, [failure]);

  const loadList = useCallback(() => read('', (result) => { setPupils(result.pupils); setSelected(null); }), [read]);

  useEffect(() => {
    lifecycle.current += 1;
    const generation = lifecycle.current;
    queueMicrotask(() => { if (generation === lifecycle.current) void loadList(); });
    return () => { lifecycle.current += 1; };
  }, [props.epoch, props.context.assignmentId, loadList]);

  // Tidsbegränsat uppdrag: töm innehållet exakt vid sluttiden.
  useEffect(() => {
    if (!scope?.endsAt) return undefined;
    const remaining = new Date(scope.endsAt).getTime() - Date.now();
    const expire = () => {
      lifecycle.current += 1;
      clear(); setScope(null); setBusy(false); setError(null); setStatus(null); setExpired(true);
    };
    if (remaining <= 0) { queueMicrotask(expire); return undefined; }
    const timer = window.setTimeout(expire, Math.min(remaining, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [scope?.endsAt, clear]);

  async function exportCsv() {
    const generation = lifecycle.current;
    setBusy(true); setError(null); setStatus(null);
    try {
      const { blob, filename } = await api.download('/api/prov/export');
      if (generation !== lifecycle.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename ?? 'syntetiskt-elevprov.csv';
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Exporten av det syntetiska urvalet är klar.');
    } catch (caught) { if (generation === lifecycle.current) failure(caught); }
    finally { if (generation === lifecycle.current) setBusy(false); }
  }

  const schoolName = (unitId: string) => scope?.schools.find((school) => school.id === unitId)?.name ?? 'Skola i uppdraget';

  if (expired) {
    return (
      <div className="admin-workspace protected-admin probe-workspace">
        <div className="admin-heading"><div><p className="admin-kicker">SKYDDAD PROVMILJÖ · SYNTETISKA UPPGIFTER</p><h1>Syntetiskt elevprov</h1></div></div>
        <output role="alert" className="validation-warning">Uppdraget har upphört vid sin sluttid. Elevuppgifterna har tagits bort från vyn och kan inte läsas längre.</output>
      </div>
    );
  }

  return (
    <div className="admin-workspace protected-admin probe-workspace" aria-busy={busy}>
      <div className="admin-heading"><div><p className="admin-kicker">SKYDDAD PROVMILJÖ · SYNTETISKA UPPGIFTER</p><h1>Syntetiskt elevprov</h1><p>{props.context.label}</p></div></div>
      <p>Provet visar endast syntetiska elever som ditt aktuella uppdrag får läsa. Varje läsning och export registreras i säkerhetsloggen.</p>
      {scope && <dl className="mandate-facts probe-scope">
        <div><dt>Uppdrag</dt><dd>{FUNCTION_LABEL[scope.function as keyof typeof FUNCTION_LABEL] ?? scope.function}</dd></div>
        <div><dt>Omfattning</dt><dd>{scopeLabels[scope.scopeKind]} · {scope.schools.map((school) => school.name).join(', ')}</dd></div>
        {scope.scopeKind === 'group' && (scope.groups?.length ?? 0) > 0 && <div><dt>Grupper</dt><dd>{scope.groups!.map((group) => group.label).join(', ')}</dd></div>}
        {scope.approverName && <div><dt>Godkänt av</dt><dd>{scope.approverName}</dd></div>}
        {scope.purposeCode && <div><dt>Syfte</dt><dd>{scope.purposeCode === 'synthetic-troubleshooting' ? 'Syntetisk felsökning' : 'Ej angivet'}</dd></div>}
        {scope.endsAt && <div><dt>Upphör</dt><dd><time dateTime={scope.endsAt}>{timeText(scope.endsAt)}</time></dd></div>}
      </dl>}
      {status && <output className="admin-notice">{status}</output>}
      {error && <output role="alert" className="validation-warning">{error}</output>}
      <div className="mandate-actions">
        <Button variant="outline" disabled={busy} onClick={() => void loadList()}>Hämta aktuellt urval</Button>
        {scope?.canExport && <Button variant="outline" disabled={busy} onClick={() => void exportCsv()}>Exportera urvalet (CSV)</Button>}
      </div>
      {busy && <output>Hämtar uppgifter…</output>}
      {scope?.scopeKind === 'case' && <form className="protected-filter" onSubmit={(event) => { event.preventDefault(); if (caseId) void read(`?arende=${encodeURIComponent(caseId)}`, (result) => { setPupils([]); setSelected(result.pupils[0] ?? null); }); }}>
        <label>Tilldelat ärende
          <select value={caseId} disabled={busy} onChange={(event) => setCaseId(event.target.value)}>
            <option value="">Välj ärende</option>
            {scope.cases.map((item) => <option key={item.id} value={item.id}>{item.label} · {schoolName(item.unitId)}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={busy || !caseId}>Visa ärendets elev</Button>
      </form>}
      <section aria-label="Tillåtna syntetiska elever" className="probe-results">
        {!busy && !error && scope && scope.scopeKind !== 'case' && pupils.length === 0 && <p>Det finns inga syntetiska elever i ditt uppdrag.</p>}
        {!busy && !error && scope?.scopeKind === 'case' && !selected && <p>Välj ett tilldelat ärende för att se den elev ärendet gäller.</p>}
        <ul className="mandate-list probe-list">{pupils.map((pupil) => <li className="protected-card" key={pupil.id}>
          <h2>{pupil.displayName}</h2>
          <p>{schoolName(pupil.unitId)} · {pupil.groupIds.length} {pupil.groupIds.length === 1 ? 'grupp' : 'grupper'}</p>
          <Button variant="outline" disabled={busy} onClick={() => void read(`?elev=${encodeURIComponent(pupil.id)}`, (result) => setSelected(result.pupils[0] ?? null))}>Visa {pupil.displayName}</Button>
        </li>)}</ul>
        {selected && <article className="protected-card probe-detail" aria-live="polite">
          <h2>{selected.displayName}</h2>
          <dl className="mandate-facts">
            <div><dt>Skola</dt><dd>{schoolName(selected.unitId)}</dd></div>
            <div><dt>Grupper</dt><dd>{selected.groupIds.length}</dd></div>
            <div><dt>Elev-ID (syntetiskt)</dt><dd>{selected.id}</dd></div>
          </dl>
        </article>}
      </section>
    </div>
  );
}
