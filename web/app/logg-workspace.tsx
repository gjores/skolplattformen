'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FUNCTION_LABEL, type AccessFunction } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { messageText } from '@/lib/session-channel.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';

type AuditEvent = {
  id: string;
  occurredAt: string;
  correlationId: string;
  source: string;
  actorIssuer: string | null;
  actorSubject: string | null;
  actorIdentityId: string | null;
  sessionId: string | null;
  membershipId: string | null;
  assignmentId: string | null;
  customerId: string;
  assignmentFunction: AccessFunction | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  outcome: string;
  details: Record<string, unknown>;
};

type Props = { epoch: number; onSessionLost: () => void };
type Filters = { from: string; to: string; action: string };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function initialFilters(): Filters {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: isoDate(from), to: isoDate(to), action: '' };
}

function query(filters: Filters, csv = false): string {
  const params = new URLSearchParams({
    from: `${filters.from}T00:00:00.000Z`,
    to: `${filters.to}T23:59:59.999Z`,
  });
  if (filters.action.trim()) params.set('action', filters.action.trim());
  if (csv) params.set('format', 'csv');
  return `/api/logg?${params}`;
}

function short(value: string | null): string {
  return value ? value.slice(0, 8) : 'saknas';
}

function issuerHost(value: string | null): string {
  if (!value) return 'saknas';
  try { return new URL(value).hostname; } catch { return value; }
}

export default function LoggWorkspace({ epoch, onSessionLost }: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = JSON.stringify(filters) !== JSON.stringify(applied);
  useUnsavedChanges(`log-filter-${epoch}`, dirty);
  // Endast den senast startade hämtningen får visa sitt resultat. Annars kan ett
  // äldre svar för ett annat filter skriva över listan efter ett nyare.
  const generation = useRef(0);
  const appliedRef = useRef(applied);
  const sessionLost = useRef(onSessionLost);
  useEffect(() => { sessionLost.current = onSessionLost; appliedRef.current = applied; });

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) { sessionLost.current(); return; }
    if (caught instanceof ApiError && caught.status === 403) { setError('Loggen kräver granskaruppdraget.'); return; }
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    if (caught instanceof ApiError) {
      setError(`${messageText(caught.code)}${caught.correlationId ? ` (ref ${caught.correlationId})` : ''}`);
      return;
    }
    setError('Loggen kunde inte läsas. Försök igen.');
  }, []);

  const load = useCallback(async (next: Filters): Promise<boolean> => {
    const current = ++generation.current;
    setBusy(true); setError(null); setStatus(null);
    try {
      const result = await api.get<{ events: AuditEvent[] }>(query(next));
      if (current !== generation.current) return false;
      setEvents(result.events);
      setApplied(next);
      return true;
    } catch (caught) { if (current === generation.current) handleError(caught); return false; }
    finally { if (current === generation.current) setBusy(false); }
  }, [handleError]);

  // Hämta vid start och när kontexten (epoken) byts; filterbyten hämtas via formuläret.
  useEffect(() => {
    queueMicrotask(() => void load(appliedRef.current));
    return () => { generation.current += 1; };
  }, [epoch, load]);

  async function exportCsv() {
    const current = ++generation.current;
    setBusy(true); setError(null); setStatus(null);
    try {
      const result = await api.download(query(applied, true));
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename ?? 'sakerhetslogg.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      if (current !== generation.current) return;
      if (await load(applied)) setStatus('CSV-exporten har laddats ner och registrerats i loggen.');
    } catch (caught) { if (current === generation.current) handleError(caught); }
    finally { if (current === generation.current) setBusy(false); }
  }

  const rows = useMemo(() => events, [events]);
  return (
    <div className="admin-workspace protected-admin" aria-busy={busy}>
      <div className="admin-heading"><div><p className="admin-kicker">SPÅRBARHET</p><h1>Säkerhetslogg</h1><p>Beständiga ändringar och nekade anrop i den aktuella kunden.</p></div></div>
      {status && <output className="admin-notice">{status}</output>}
      {error && <output role="alert" className="validation-warning">{error}</output>}
      <section className="protected-card">
        <form className="protected-filter" onSubmit={(event) => { event.preventDefault(); void load(filters); }}>
          <label>Från<input type="date" required value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label>Till<input type="date" required value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          <label>Åtgärd<input value={filters.action} maxLength={80} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /></label>
          <Button type="submit" disabled={busy}>Visa</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void exportCsv()}>Exportera CSV</Button>
        </form>
        <p className="cell-secondary">Exporten registreras som en händelse i loggen.</p>
        {busy && <output>Laddar säkerhetsloggen…</output>}
        {!busy && rows.length === 0 ? <p>Inga händelser i perioden.</p> : (
          <div className="protected-table-scroll"><table className="admin-table protected-table audit-table"><thead><tr><th>Tid</th><th>Åtgärd</th><th>Resultat</th><th>Aktör</th><th>Uppdrag</th><th>Objekt</th><th>Korrelation</th><th>Detaljer</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString('sv-SE')}</td><td>{row.action}</td><td>{row.outcome}</td><td>{short(row.actorSubject)} · {issuerHost(row.actorIssuer)}</td><td>{row.assignmentFunction ? FUNCTION_LABEL[row.assignmentFunction] : 'Saknas'} · {short(row.assignmentId)}</td><td>{row.objectType ?? 'saknas'} · {short(row.objectId)}</td><td>{short(row.correlationId)}</td><td><details><summary aria-label={`Visa detaljer för ${row.action}`}>Detaljer</summary><dl className="audit-details"><div><dt>Händelse-ID</dt><dd>{row.id}</dd></div><div><dt>Korrelations-ID</dt><dd>{row.correlationId}</dd></div><div><dt>Uppdrag</dt><dd>{row.assignmentId ?? 'saknas'}</dd></div><div><dt>Aktör</dt><dd>{row.actorIssuer ?? 'saknas'} · {row.actorSubject ?? 'saknas'}</dd></div><div><dt>Objekt</dt><dd>{row.objectType ?? 'saknas'} · {row.objectId ?? 'saknas'}</dd></div></dl><pre>{JSON.stringify(row.details, null, 2)}</pre></details></td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
