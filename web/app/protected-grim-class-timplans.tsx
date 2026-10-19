'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseGrimClassCreateReply, parseGrimClassCreateRequest, parseGrimClassLinkReply, parseGrimClassLinkRequest, parseGrimClassUnderlag,
  type GrimClassColumn, type GrimClassCreateRequest, type GrimClassLinkRequest, type GrimClassRow, type GrimClassUnderlag } from '@/lib/grim-class-timplan.ts';
import type { ProtectedTimplan } from '@/lib/protected-timplan.ts';
import MfaStepUpNotice from './mfa-step-up';
import './protected-class-timplans.css';

type Pending = { operation: 'create'; request: GrimClassCreateRequest } | { operation: 'link'; request: GrimClassLinkRequest };
type Props = { scopeKey: string; returnTo: string; plan: ProtectedTimplan; canPrepare: boolean; disabled: boolean; onSecurityFailure: (error: unknown) => boolean };
const yearLabel = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
const columnLabel = (column: GrimClassColumn) => column === 'vecka' ? 'Per vecka' : `Åk ${column.slice(2)}`;
/** The browser keeps only the exact command (IDs, revisions, column or class name) so an uncertain write is checked with the same command ID. */
function parsePending(value: unknown): Pending {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('pending');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 2) throw new TypeError('pending');
  if (r.operation === 'create') return { operation: 'create', request: parseGrimClassCreateRequest(r.request) };
  if (r.operation === 'link') return { operation: 'link', request: parseGrimClassLinkRequest(r.request) };
  throw new TypeError('pending');
}

export default function ProtectedGrimClassTimplans(props: Props) { return <GrimClassLinks key={`${props.scopeKey}:${props.plan.id}`} {...props}/>; }
function GrimClassLinks({ scopeKey, returnTo, plan, canPrepare, disabled, onSecurityFailure }: Props) {
  const journalKey = `sp:grim-class:v1:${scopeKey}:${plan.id}`;
  const [restored] = useState(() => {
    try { const raw = sessionStorage.getItem(journalKey); const pending = raw ? parsePending(JSON.parse(raw)) : null;
      return { pending: pending && pending.request.planId === plan.id ? pending : null, broken: !!pending && pending.request.planId !== plan.id }; }
    catch { return { pending: null, broken: true }; }
  });
  const [open, setOpen] = useState(!!restored.pending || restored.broken), [data, setData] = useState<GrimClassUnderlag | null>(null);
  const [pending, setPending] = useState<Pending | null>(restored.pending), [uncertain, setUncertain] = useState(!!restored.pending), [broken, setBroken] = useState(restored.broken);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [columns, setColumns] = useState<Record<string, GrimClassColumn>>({}), [creating, setCreating] = useState(false), [name, setName] = useState('');
  const active = useRef(true), running = useRef(false), generation = useRef(0), createButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useUnsavedChanges(`navigation-block:grim-class:${plan.id}`, busy || uncertain || broken);
  useUnsavedChanges(`grim-class-form:${plan.id}`, name.trim().length > 0 || Object.keys(columns).length > 0 || uncertain);
  const valid = data?.plan.id === plan.id && data.plan.unitId === plan.unitId && data.plan.offeringId === plan.offeringId && data.plan.version === plan.version;
  const canManage = canPrepare && valid && data.canManage && !disabled && !broken;

  function store(next: Pending) { const raw = JSON.stringify(next); sessionStorage.setItem(journalKey, raw); if (sessionStorage.getItem(journalKey) !== raw) throw Error('storage'); }
  function clear() { sessionStorage.removeItem(journalKey); if (sessionStorage.getItem(journalKey) !== null) throw Error('storage'); }
  async function fetchData() {
    const input = { planId: plan.id }, result = parseGrimClassUnderlag(await api.post('/api/klasser/grim/underlag', input), input);
    if (result.plan.unitId !== plan.unitId || result.plan.offeringId !== plan.offeringId) throw new Error('wrong_class_scope');
    return result;
  }
  async function load() {
    if (running.current) return;
    const token = ++generation.current; setBusy(true); setError(null);
    try { const result = await fetchData(); if (active.current && token === generation.current) { setData(result); setColumns({}); } }
    catch (caught) { if (active.current && token === generation.current && !onSecurityFailure(caught)) setError(caught instanceof ApiError ? caught.message : 'Klasserna kunde inte läsas. Försök igen.'); }
    finally { if (active.current && token === generation.current) setBusy(false); }
  }
  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; });
  useEffect(() => { if (restored.pending || restored.broken) void loadRef.current(); }, [restored]);

  async function execute(command: Pending) {
    if (running.current || disabled || broken || (!uncertain && !canManage)) return;
    running.current = true; setBusy(true); setError(null); setNotice(null); setMfa(false); let accepted = false;
    try {
      // Persist the exact command before the request, so a lost reply is checked with the same command ID.
      store(command); setPending(command);
      if (command.operation === 'create') {
        const reply = parseGrimClassCreateReply(await api.post('/api/klasser/grim/skapa', command.request), command.request); accepted = true;
        if (active.current) { setNotice(`Klassen ${reply.name} är skapad för ${yearLabel(reply.startYear)}. Välj årskurs och Koppla för att använda timplanen.`); setName(''); setCreating(false); }
      } else {
        const reply = parseGrimClassLinkReply(await api.post('/api/klasser/grim/koppla', command.request), command.request); accepted = true;
        if (active.current) setNotice(reply.adopted ? `Namnkopplingen är nu identifierad och kopplad till ${columnLabel(reply.columnId)}, version ${plan.version}.`
          : `Klassens koppling till ${columnLabel(reply.columnId)}, version ${plan.version} för ${yearLabel(reply.schoolYear)} är sparad.`);
      }
      clear();
      const result = await fetchData();
      if (active.current) { setData(result); setColumns({}); setPending(null); setUncertain(false); }
    } catch (caught) {
      if (!active.current || onSecurityFailure(caught)) return;
      const explicit = caught instanceof ApiError && caught.hasExplicitCode && caught.code !== 'mfa_required';
      const unknown = accepted || !explicit && !(caught instanceof Error && caught.message === 'storage');
      setMfa(caught instanceof ApiError && caught.code === 'mfa_required');
      if (unknown) { setUncertain(true); setError(accepted ? 'Ändringen är sparad men kunde inte läsas tillbaka. Kontrollera sparstatus.' : 'Svaret kunde inte bekräftas. Kontrollera sparstatus med samma begäran innan du fortsätter.'); }
      else {
        try { clear(); } catch { setBroken(true); }
        setPending(null); setUncertain(false);
        setError(caught instanceof ApiError ? caught.message : 'Ändringen kunde inte förberedas i den här fliken. Inget har skickats.');
        if (caught instanceof ApiError && caught.status === 409) setData(null);
      }
    } finally { running.current = false; if (active.current) setBusy(false); }
  }
  function linkRequest(c: GrimClassRow, columnId: GrimClassColumn): GrimClassLinkRequest {
    const prior = c.link ?? c.candidate;
    return { commandId: crypto.randomUUID(), classId: c.id, planId: plan.id, expectedPlanRevision: data!.plan.revision, columnId,
      expectedLinkRevision: prior?.revision ?? null, previousPlanId: prior?.planId ?? null };
  }
  function abandon() {
    if (busy || !pending) return;
    try { clear(); setPending(null); setUncertain(false); setError(null); setNotice('Sparkontrollen är avslutad. Läs om klasserna och gör om ändringen om den saknas.'); void load(); }
    catch { setBroken(true); }
  }

  if (!['faststalld', 'ersatt'].includes(plan.status) || !['grundskola', 'introduktionsprogram'].includes(plan.education.kind)) return null;
  const im = plan.education.kind === 'introduktionsprogram', series = data?.plan.series.name ?? 'Timplan';
  return <section className="class-timplans" aria-label="Klasser och läsår för GR/IM">
    <div className="class-plan-heading"><div><h2>Klasser och läsår</h2><p>En klass använder den timplansversion och {im ? 'veckoram' : 'årskurs'} du kopplar den till. En ny timplansversion flyttar inte befintliga kopplingar.</p></div>
      <Button variant="outline" disabled={busy || uncertain || broken} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>{open ? 'Dölj klasser' : canPrepare && plan.status === 'faststalld' ? 'Koppla klass' : 'Visa klasser'}</Button></div>
    {open && <div aria-busy={busy}>
      {broken && <p role="alert">Den sparade begäran kan inte verifieras. Inget nytt skickas från den här fliken.</p>}
      {error && <p role="alert">{error}</p>}
      {mfa && <MfaStepUpNotice message="Verifiera med engångskod för att spara ändringen." returnTo={returnTo} detail="Begäran finns kvar. Kontrollera sparstatus efter återkomsten."/>}
      {notice && <output>{notice}</output>}
      {uncertain && pending && <div className="class-plan-controls">
        <Button disabled={busy || disabled} onClick={() => void execute(pending)}>Kontrollera sparstatus</Button>
        <Button variant="outline" disabled={busy} onClick={abandon}>Avsluta kontrollen</Button></div>}
      {busy && !data && <output>Hämtar klasser…</output>}
      {data && <>
        <dl className="class-plan-dates">
          <div><dt>Timplan</dt><dd>{series} · version {data.plan.version}</dd></div>
          <div><dt>Läsår</dt><dd>{data.schoolYear === null ? 'Saknas' : yearLabel(data.schoolYear)}</dd></div>
          <div><dt>Skola</dt><dd>{data.plan.schoolName}</dd></div>
        </dl>
        {!valid && <p role="alert">Timplanen har ändrats. Läs om timplanen innan du ändrar en klasskoppling.</p>}
        {data.blockers.length > 0 && <ul>{data.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <h3>Klasser för läsåret</h3>
        {data.classes.length === 0 ? <p>Inga klasser finns för läsåret. {canManage ? 'Skapa en klass för att kunna koppla den.' : ''}</p>
          : <ul className="class-link-choices">{data.classes.map(c => {
            const current = c.link, chosen = columns[c.id] ?? (im ? 'vecka' : current?.columnId ?? c.candidate?.columnId ?? null);
            const same = !!current && current.planId === plan.id && current.columnId === chosen;
            return <li key={c.id}>
              <strong>{c.name}</strong>
              <span>{current ? `${current.series.name} · version ${current.version} · ${columnLabel(current.columnId)}` : c.candidate ? `Äldre namnkoppling · ${columnLabel(c.candidate.columnId)} – blir identifierad först när du kopplar klassen` : 'Ingen timplan för läsåret'}</span>
              {canManage && <div className="class-plan-controls">
                {im ? <span>Per vecka</span> : <label className="grim-column-label">Årskurs<select aria-label={`Årskurs för ${c.name}`} value={chosen ?? ''} disabled={busy || uncertain}
                  onChange={event => setColumns(previous => ({ ...previous, [c.id]: event.target.value as GrimClassColumn }))}>
                  {chosen === null && <option value="" disabled>Välj årskurs</option>}
                  {data.columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>}
                <Button disabled={busy || uncertain || !chosen || same} aria-label={same ? `${c.name} är kopplad` : `${c.candidate ? 'Bekräfta namnkoppling för' : current ? 'Ändra koppling för' : 'Koppla'} ${c.name}`}
                  onClick={() => chosen && void execute({ operation: 'link', request: linkRequest(c, chosen) })}>{same ? 'Kopplad' : c.candidate ? 'Bekräfta namnkoppling' : current ? 'Ändra koppling' : 'Koppla'}</Button>
              </div>}
            </li>;
          })}</ul>}
        {data.legacyRows.length > 0 && <><h3>Namnrader utan klass</h3>
          <p>Namnraderna kommer från en äldre koppling och räknas inte som identifierade. Skapa klassen med samma namn och koppla den för att använda timplanen.</p>
          <ul className="class-plan-links">{data.legacyRows.map(row => <li key={row.className}><strong>{row.className}</strong><span>{columnLabel(row.columnId)}</span></li>)}</ul></>}
        {canManage && data.schoolYear !== null && <Button ref={createButton} variant="outline" disabled={busy || uncertain} onClick={() => setCreating(true)}>Skapa klass</Button>}
      </>}
    </div>}
    <Dialog open={creating} onOpenChange={value => { if (!value && !busy) { setCreating(false); requestAnimationFrame(() => createButton.current?.focus()); } }}>
      <DialogContent className="class-link-dialog"><DialogTitle>Skapa klass</DialogTitle>
        <DialogDescription>{data?.plan.educationName} · {plan.schoolName} · {data?.schoolYear ? yearLabel(data.schoolYear) : ''}. Klassen skapas utan elever.</DialogDescription>
        {error && <p role="alert">{error}</p>}
        <form className="class-plan-create" onSubmit={event => { event.preventDefault(); const n = name.trim().toUpperCase();
          if (!busy && n && data) void execute({ operation: 'create', request: { commandId: crypto.randomUUID(), planId: plan.id, expectedPlanRevision: data.plan.revision, name: n } }); }}>
          <div className="class-plan-controls"><label>Klassnamn<input value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Till exempel 7A"/></label></div>
          <div className="class-plan-controls"><Button type="button" variant="outline" disabled={busy} onClick={() => { setCreating(false); requestAnimationFrame(() => createButton.current?.focus()); }}>Avbryt</Button>
            <Button type="submit" disabled={busy || !name.trim()}>Skapa klass</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
