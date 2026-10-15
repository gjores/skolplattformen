'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { gymShape } from '@/lib/gym-timplan.ts';
import { parseClassCohortCreateRequest, parseClassCohortCreateReply, parseClassCohortStatusReply, parseClassCohortUnderlag,
  type ClassCohortCreateRequest, type ClassCohortCreateReply, type ClassCohortUnderlag } from '@/lib/class-cohort.ts';
import type { ActiveContext } from './context-switch';
import { startStepUp } from './mfa-step-up';
import './protected-class-cohorts.css';

type Props = { context: ActiveContext; epoch: number; offeringId: string; unitId: string; disabled: boolean;
  sourceKey: string; returnTo: string; initiallyOpen?: boolean; onInitialOpen?: () => void; onSecurityFailure: (error: unknown) => boolean };
type Phase = 'awaitingOutcome' | 'mfaDenied' | 'receiptNeedsRead';
type Journal = { version: 1; scope: string; phase: Phase; request: ClassCohortCreateRequest };
const base = '/api/klasser/organisation';
const storagePrefix = 'sp:class-cohort:v1:';
function restore(key: string, scope: string): { journal: Journal | null; broken: boolean } {
  try {
    const text = window.sessionStorage.getItem(key);
    if (text === null) return { journal: null, broken: false };
    const row = gymShape(JSON.parse(text), ['version', 'scope', 'phase', 'request']);
    if (row.version !== 1 || row.scope !== scope || !['awaitingOutcome', 'mfaDenied', 'receiptNeedsRead'].includes(String(row.phase))) throw Error('journal');
    return { journal: { version: 1, scope, phase: row.phase as Phase, request: parseClassCohortCreateRequest(row.request) }, broken: false };
  } catch { return { journal: null, broken: true }; }
}
function compatible(data: ClassCohortUnderlag, request: ClassCohortCreateRequest): boolean {
  return data.canManage && data.educationRevision === request.expectedEducationRevision && data.sourceToken === request.expectedSourceToken
    && data.educationStartsOn === request.startsOn;
}

/** Keyed by the complete trusted scope: a late response can never populate a new assignment or school. */
export default function ProtectedClassCohorts(props: Props) {
  const scope = JSON.stringify([props.context.customerId, props.context.membershipId, props.context.assignmentId, props.epoch, props.offeringId, props.unitId]);
  return <CohortPanel key={scope} {...props} scope={scope}/>;
}
function CohortPanel({ context, offeringId, unitId, disabled, sourceKey, returnTo, initiallyOpen = false, onInitialOpen, onSecurityFailure, scope }: Props & { scope: string }) {
  const key = storagePrefix + scope;
  const [stored] = useState(() => restore(key, scope));
  const restored = stored.journal?.request;
  const wrongTarget = !!restored && (restored.offeringId !== offeringId || restored.unitId !== unitId);
  const [broken] = useState(stored.broken || wrongTarget);
  const [open, setOpen] = useState(initiallyOpen || !!restored || broken);
  const initialOpening = useRef(initiallyOpen);
  useLayoutEffect(() => {
    if (!initialOpening.current) return;
    initialOpening.current = false;
    onInitialOpen?.();
  }, [onInitialOpen]);
  const [data, setData] = useState<ClassCohortUnderlag | null>(null);
  const [verified, setVerified] = useState(false);
  const [names, setNames] = useState<string[]>(['']);
  const [editing, setEditing] = useState(false), [reviewing, setReviewing] = useState(false);
  const [command, setCommand] = useState<ClassCohortCreateRequest | null>(wrongTarget ? null : restored ?? null);
  const [receipt, setReceipt] = useState<ClassCohortCreateReply | null>(null);
  const knownReceipt = useRef(stored.journal?.phase === 'receiptNeedsRead');
  const [retry, setRetry] = useState(false), [busy, setBusy] = useState(false), [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(broken ? 'Den sparade klassbegäran kan inte verifieras. Inget nytt skickas från den här fliken.' : null);
  const [notice, setNotice] = useState<string | null>(null), [selected, setSelected] = useState('');
  const mounted = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), running = useRef(false);
  const reviewRef = useRef<HTMLElement>(null), feedbackRef = useRef<HTMLDivElement>(null), openerRef = useRef<HTMLButtonElement>(null);
  const uncertain = command !== null && !reviewing;
  useUnsavedChanges(`class-cohort:${scope}`, editing || command !== null || broken);
  useUnsavedChanges(`navigation-block:class-cohort:${scope}`, uncertain || busy && command !== null || broken);
  useLayoutEffect(() => { if (reviewing) reviewRef.current?.focus(); }, [reviewing]);
  useLayoutEffect(() => { if (notice || error) feedbackRef.current?.focus(); }, [notice, error]);
  function begin() { controller.current?.abort(); const c = new AbortController(); controller.current = c; running.current = true; setBusy(true); return { token: ++generation.current, signal: c.signal }; }
  function current(token: number) { return mounted.current && token === generation.current; }
  function finish(token: number) { if (current(token)) { running.current = false; setBusy(false); } }
  function saveJournal(request: ClassCohortCreateRequest, phase: Phase) {
    const journal: Journal = { version: 1, scope, phase, request: parseClassCohortCreateRequest(request) };
    const serialized = JSON.stringify(journal);
    window.sessionStorage.setItem(key, serialized);
    if (window.sessionStorage.getItem(key) !== serialized) throw Error('storage');
  }
  function clearJournal() { window.sessionStorage.removeItem(key); if (window.sessionStorage.getItem(key) !== null) throw Error('storage'); }
  async function read(signal: AbortSignal) { return parseClassCohortUnderlag(await api.post(`${base}/underlag`, { offeringId, unitId }, signal), { offeringId, unitId }); }
  function failed(errorValue: unknown, fallback: string) {
    if (errorValue instanceof DOMException && errorValue.name === 'AbortError') return;
    if (errorValue instanceof ApiError && errorValue.code === 'mfa_required' && errorValue.hasExplicitCode) { setMfa(true); setError('Verifiera med engångskod för att fortsätta.'); }
    else if (!onSecurityFailure(errorValue)) setError(errorValue instanceof ApiError ? errorValue.message : fallback);
  }
  async function confirmRead(value: ClassCohortCreateReply, signal: AbortSignal, token: number) {
    const fresh = await read(signal);
    for (const row of value.classes) {
      const found = fresh.classes.find(candidate => candidate.id === row.id);
      if (!found || found.name !== row.name || found.cohortStartYear !== row.cohortStartYear || found.startsOn !== row.startsOn
        || found.endsOn !== row.endsOn || found.validitySource !== row.validitySource) throw Error('readback');
    }
    if (!current(token)) return;
    clearJournal(); knownReceipt.current = false; setData(fresh); setVerified(true); setCommand(null); setReceipt(null); setRetry(false); setReviewing(false); setEditing(false); setNames(['']); setMfa(false); setError(null);
    setNotice(`${value.classes.length === 1 ? 'En tom klass har' : `${value.classes.length} tomma klasser har`} sparats och lästs tillbaka. Ingen elev eller timplanskoppling har lagts till.`);
  }
  async function status(request: ClassCohortCreateRequest) {
    if (running.current || broken) return;
    const r = begin(); setVerified(false); setError(null); setRetry(false);
    try {
      const result = parseClassCohortStatusReply(await api.post(`${base}/status`, request, r.signal), request);
      if (!current(r.token)) return;
      if (result.status === 'found') {
        knownReceipt.current = true; setReceipt(result.receipt); saveJournal(request, 'receiptNeedsRead'); await confirmRead(result.receipt, r.signal, r.token);
      } else {
        if (receipt || knownReceipt.current) throw Error('receipt-disappeared');
        const fresh = await read(r.signal); if (!current(r.token)) return;
        setData(fresh); setVerified(true); setMfa(false);
        if (compatible(fresh, request)) { setRetry(true); setNotice('Begäran har inte sparats. Du kan skicka samma granskade klassbegäran igen.'); }
        else { clearJournal(); setCommand(null); setNames(request.names); setEditing(true); setNotice('Underlaget har ändrats. Kontrollera klassnamnen och granska på nytt.'); }
      }
    } catch (e) { if (current(r.token)) failed(e, 'Sparandet kan inte avgöras ännu. Läs sparstatus igen innan du fortsätter.'); }
    finally { finish(r.token); }
  }
  async function reload() {
    if (running.current || broken) return;
    if (command && !reviewing && !receipt) { await status(command); return; }
    const r = begin(); setVerified(false); setError(null);
    try { if (receipt) await confirmRead(receipt, r.signal, r.token); else { const fresh = await read(r.signal); if (current(r.token)) { setData(fresh); setVerified(true); setMfa(false); if (command && reviewing && !compatible(fresh, command)) { setNames(command.names); setCommand(null); setReviewing(false); setNotice('Underlaget har ändrats. Kontrollera klassnamnen och granska på nytt.'); } } } }
    catch (e) { if (current(r.token)) failed(e, receipt ? 'Klasserna är sparade men kunde inte läsas tillbaka. Läs klasserna igen; skapa dem inte på nytt.' : 'Klassunderlaget kunde inte läsas. Försök igen.'); }
    finally { finish(r.token); }
  }
  const reloadRef = useRef(reload);
  useLayoutEffect(() => { reloadRef.current = reload; });
  const stop = useCallback(() => { mounted.current = false; generation.current++; controller.current?.abort(); running.current = false; }, []);
  useEffect(() => {
    mounted.current = true;
    if (open && !broken) void reloadRef.current();
    return stop;
    // The scope is the component key. Source changes require a fresh own read;
    // pending commands always recover through status, never a new command.
  }, [open, sourceKey, broken, stop]);
  function review() {
    if (!verified || !data?.canManage || disabled || busy || command) return;
    try {
      const request = parseClassCohortCreateRequest({ commandId: crypto.randomUUID(), offeringId, unitId, expectedEducationRevision: data.educationRevision,
        expectedSourceToken: data.sourceToken, startsOn: data.educationStartsOn, names: names.map(name => name.trim().toUpperCase()) });
      setCommand(request); setReviewing(true); setError(null); setNotice(null);
    } catch { setError('Ange 1–20 olika klassnamn med högst 60 tecken. Kontroll- och osynliga formattecken är inte tillåtna.'); }
  }
  async function create() {
    if (!verified || !command || running.current || disabled || !(reviewing || retry)) return;
    const request = command;
    try { saveJournal(request, 'awaitingOutcome'); }
    catch { setError('Fliken kan inte bevara klassbegäran. Inget skickades. Tillåt sessionslagring och försök igen.'); return; }
    const r = begin(); setReviewing(false); setRetry(false); setError(null); setNotice(null); setMfa(false);
    try {
      const value = parseClassCohortCreateReply(await api.post(`${base}/skapa`, request, r.signal), request);
      if (!current(r.token)) return;
      knownReceipt.current = true; setReceipt(value); saveJournal(request, 'receiptNeedsRead'); await confirmRead(value, r.signal, r.token);
    } catch (e) {
      if (!current(r.token)) return;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') {
        try { saveJournal(request, knownReceipt.current ? 'receiptNeedsRead' : 'mfaDenied'); } catch { /* The earlier awaitingOutcome journal remains conservative. */ }
        setMfa(true); setError('Verifiera med engångskod. Den granskade klassbegäran finns kvar.');
      } else if (e instanceof ApiError && e.hasExplicitCode && e.status === 409 && !knownReceipt.current) {
        try { const fresh = await read(r.signal); if (current(r.token)) { clearJournal(); knownReceipt.current = false; setData(fresh); setVerified(true); setCommand(null); setEditing(true); setNames(request.names); setError(e.message + ' Kontrollera uppgifterna och granska på nytt.'); } }
        catch (readError) { if (current(r.token)) failed(readError, 'Begäran nekades. Läs sparstatus innan du granskar på nytt.'); }
      } else failed(e, 'Sparandet kan inte avgöras ännu. Läs sparstatus innan du fortsätter.');
    } finally { finish(r.token); }
  }
  function stepUp() {
    if (busy || broken) return;
    try { if (command) saveJournal(command, receipt || knownReceipt.current ? 'receiptNeedsRead' : 'awaitingOutcome'); }
    catch { setError('Begäran kunde inte bevaras. Stanna kvar och försök igen.'); return; }
    startStepUp(returnTo);
  }
  function later() { if (uncertain || busy || broken) return; setCommand(null); setReviewing(false); setEditing(false); setNames(['']); setError(null); setNotice(null); setOpen(false); requestAnimationFrame(() => openerRef.current?.focus()); }
  const locked = disabled || busy || !verified || command !== null;
  const chosen = data?.classes.find(row => row.id === selected);
  return <section className="class-cohorts" aria-label="Klasser för utbildningen" aria-busy={busy}>
    <div className="cc-head"><div><h3>Klasser för utbildningen</h3><p>Förbered klassorganisationen nu eller fortsätt med programplanen och gör det senare.</p></div>
      {!open && <Button ref={openerRef} variant="outline" disabled={disabled} onClick={() => setOpen(true)}>Visa klasser</Button>}</div>
    {open && <>
      <div ref={feedbackRef} tabIndex={-1} className="cc-feedback">{error && <p role="alert">{error}</p>}{notice && <output>{notice}</output>}</div>
      {busy && <output>Läser eller sparar klassuppgifter…</output>}
      {data && <>
        <p><strong>{data.educationName}</strong> · {data.schoolName}</p>
        <dl className="cc-dates"><div><dt>Utbildningsstart</dt><dd>{data.educationStartsOn ?? 'Inte entydigt verifierad'}</dd></div><div><dt>Första läsår</dt><dd>{data.firstSchoolYear === null ? 'Okänt' : `${data.firstSchoolYear}/${data.firstSchoolYear + 1}`}</dd></div><div><dt>Nya klassers giltighet</dt><dd>{data.educationStartsOn ? `Från ${data.educationStartsOn}, slutdatum okänt` : 'Kan inte fastställas ännu'}</dd></div></dl>
        <p>Klasserna tillhör utbildningen och följer med när programplanen får en ny version. Koppling till timplan görs separat, för ett uttryckligt läsår och en fastställd version.</p>
        {!data.canManage && <p>{context.function === 'huvudman' ? 'Du läser som huvudman. Rektor eller skoladministratör med aktuellt skolmandat kan förbereda klasser.' : 'Nya klasser kan inte skapas från detta underlag.'}</p>}
        {data.blockers.map((text, index) => <p key={index} className="cc-blocker">{text}</p>)}
        <div className="cc-existing"><label htmlFor={`cc-existing-${unitId}`}>Befintliga klasser ({data.classes.length})</label><select id={`cc-existing-${unitId}`} value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}><option value="">Välj klass för att läsa giltigheten</option>{data.classes.map(row => <option key={row.id} value={row.id}>{row.name} · första läsår {row.cohortStartYear}/{row.cohortStartYear + 1}</option>)}</select>
          {data.classes.length === 0 && <p>Inga klasser finns ännu. Inget skapas automatiskt.</p>}
          {chosen && <p>{chosen.name}: {chosen.validitySource === 'legacy_unknown' ? 'Äldre klass, giltighetsdatum okända.' : `Gäller från ${chosen.startsOn}${chosen.endsOn ? ` till och med ${chosen.endsOn}` : ', slutdatum okänt'}.`} Valet ändrar ingen koppling.</p>}</div>
        {data.canManage && !editing && !command && <Button disabled={disabled || busy || !verified} onClick={() => { setEditing(true); setNotice(null); requestAnimationFrame(() => document.getElementById(`cc-name-${unitId}-0`)?.focus()); }}>Skapa tomma klasser</Button>}
      </>}
      {editing && !command && <fieldset disabled={locked} className="cc-names"><legend>Namnge klasserna</legend><p>Varje rad skapar en tom klass. Namnen granskas med stora bokstäver innan du sparar.</p>{names.map((name, index) => <div className="cc-name-row" key={index}><label htmlFor={`cc-name-${unitId}-${index}`}>Klassnamn {index + 1}</label><input id={`cc-name-${unitId}-${index}`} value={name} maxLength={120} onChange={e => setNames(previous => previous.map((value, n) => n === index ? e.target.value : value))}/>{names.length > 1 && <Button variant="outline" onClick={() => setNames(previous => previous.filter((_, n) => n !== index))}>Ta bort rad {index + 1}</Button>}</div>)}<div className="cc-actions"><Button variant="outline" disabled={names.length >= 20} onClick={() => setNames(previous => [...previous, ''])}>Lägg till klassrad</Button><Button onClick={review}>Granska klasser</Button></div></fieldset>}
      {reviewing && command && <section ref={reviewRef} tabIndex={-1} className="cc-review" aria-label="Granska nya klasser"><h4>Granska {command.names.length === 1 ? 'en tom klass' : `${command.names.length} tomma klasser`}</h4><ul>{command.names.map(name => <li key={name}>{name}</li>)}</ul><p>Giltighet från {command.startsOn}. Slutdatum är okänt. Inga elever eller timplanskopplingar läggs till.</p><div className="cc-actions"><Button variant="outline" disabled={busy} onClick={() => { setNames(command.names); setCommand(null); setReviewing(false); }}>Ändra namn</Button><Button disabled={disabled || busy || !verified} onClick={() => void create()}>Spara {command.names.length} {command.names.length === 1 ? 'klass' : 'klasser'}</Button></div></section>}
      {uncertain && <div className="cc-recovery"><p>{receipt ? 'Sparandet är bekräftat. Återläsningen behöver slutföras.' : 'Den granskade begäran behålls tills sparstatus har kontrollerats.'}</p><Button variant="outline" disabled={busy || broken} onClick={() => void reload()}>{receipt ? 'Läs klasserna igen' : 'Läs sparstatus'}</Button>{retry && <Button disabled={disabled || busy || !verified} onClick={() => void create()}>Försök igen med samma begäran</Button>}</div>}
      {mfa && <div className="cc-mfa"><p>Begäran finns kvar i den här fliken. Efter verifieringen kontrolleras sparstatus.</p><Button disabled={busy || broken} onClick={stepUp}>Verifiera med engångskod</Button></div>}
      <div className="cc-actions"><Button variant="outline" disabled={uncertain || busy || broken} onClick={later}>Gör senare</Button>{!command && !broken && <Button variant="outline" disabled={busy || disabled} onClick={() => void reload()}>Läs klassunderlaget igen</Button>}</div>
    </>}
  </section>;
}
