'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseGymTimplan, type GymTimplan } from '@/lib/gym-timplan.ts';
import { projectGymTimplanYear } from '@/lib/planning-year-model.ts';
import { PROGRAMPLAN_TERMS } from '@/lib/programplan-terms.ts';
import { parseAplPlan, parseAplReadReply, parseAplCommandReply, projectAplPlan, verifyAplReadReply, validateAplAllocationWrite,
  type AplPlan, type AplPeriod, type AplReadReply, type AplProjection, type AplCommand } from '@/lib/apl-plan.ts';
import { createAplJournal, loadAplJournal, persistAplJournal, removeAplJournal, recoverAplJournal,
  type AplJournal, type AplJournalScope } from '@/lib/apl-plan-journal.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import './protected-apl-plan.css';

type Props = { plan: GymTimplan; context: ActiveContext; identityKey: string | null; disabled: boolean; isBlocked: () => boolean;
  onChanged: (plan: GymTimplan) => void; onSecurityFailure: (error: unknown) => boolean };
type MinutesInput = Record<string, { hours: string; minutes: string }>;
const emptyPlan = (): AplPlan => ({ contractVersion: 'structured_v1', educationForm: 'unknown', classification: 'unreviewed', periods: [] });
const keyFor = (periodId: string, rowKey: string, term: number) => JSON.stringify([periodId, rowKey, term]);
const clone = <T,>(value: T): T => structuredClone(value);
export const aplTime = (minutes: number | null) => minutes === null ? 'Okänt' : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
function inputsFor(plan: AplPlan | null): MinutesInput {
  return Object.fromEntries((plan?.periods ?? []).flatMap(p => p.allocations.map(a => [keyFor(p.id, a.rowKey, a.termIndex),
    { hours: String(Math.floor(a.gutMinutes / 60)), minutes: String(a.gutMinutes % 60) }])));
}
function candidate(plan: AplPlan, inputs: MinutesInput): AplPlan {
  return parseAplPlan({ ...plan, periods: plan.periods.map(p => ({ ...p, name: p.name.trim(), extent: { ...p.extent, reviewNote: p.extent.reviewNote.trim() },
    contents: p.contents.map(c => ({ ...c, description: c.description.trim() })), allocations: p.contents.flatMap(c => [0,1,2,3,4,5].flatMap(termIndex => {
      const input = inputs[keyFor(p.id, c.rowKey, termIndex)];
      if (!input || input.hours === '' && input.minutes === '') return [];
      if (!/^\d{0,4}$/u.test(input.hours) || !/^\d{0,2}$/u.test(input.minutes) || Number(input.minutes) > 59 || Number(input.hours) * 60 + Number(input.minutes) > 120000)
        throw new Error('Ange APL-tid med hela timmar (0–2 000) och minuter (0–59), eller lämna båda fälten tomma.');
      return [{ rowKey: c.rowKey, termIndex, gutMinutes: Number(input.hours) * 60 + Number(input.minutes) }];
    })) })) });
}
function Summary({ projection, label }: { projection: AplProjection; label: string }) {
  return <div className="apl-summary" aria-label={label}>
    <div><span>Total undervisningstid</span><strong>{aplTime(projection.totalMinutes)}</strong><small>Inklusive APL</small></div>
    <div><span>Varav planerad APL</span><strong>{aplTime(projection.allocatedGutMinutes)}</strong><small>{projection.state === 'legacy' ? 'APL är ännu inte redovisad' : 'Fördelad inom totaltiden'}</small></div>
    <div><span>Granskade hela veckor</span><strong>{projection.reviewedWholeWeeks ?? 'Okänt'}</strong><small>Motsvarar {aplTime(projection.expectedGutMinutes)} undervisningstid</small></div>
    <div><span>Återstående skolförlagd tid</span><strong>{aplTime(projection.schoolMinutes)}</strong><small>{projection.schoolMinutes === null ? 'Fördelningen behöver granskas' : 'Enligt granskad fördelning'}</small></div>
  </div>;
}

/** This editor owns its exact pending command. Receipts never replace the latest jointly read gym/APL snapshot. */
export default function ProtectedAplPlan({ plan, context, identityKey, disabled, isBlocked, onChanged, onSecurityFailure }: Props) {
  const [reply, setReply] = useState<AplReadReply | null>(null), [draft, setDraft] = useState<AplPlan | null>(null);
  const [termChoices, setTermChoices] = useState<Record<string, { year: string; season: string }>>({});
  const [otherTerms, setOtherTerms] = useState<Record<string, boolean>>({});
  const calendar = useMemo(() => projectGymTimplanYear(2000, plan), [plan]);
  const termLabel = (index: number) => `Årskurs ${Math.floor(index / 2) + 1} · ${index % 2 ? 'Vårtermin' : 'Hösttermin'}${calendar.terms[index] ? ` (${calendar.terms[index].label.slice(3)})` : ''}`;
  const [inputs, setInputs] = useState<MinutesInput>({}), [editing, setEditing] = useState(false), [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState<Record<string, { note: string; resolved: boolean }>>({});
  const [journal, setJournal] = useState<AplJournal | null>(null), [retryExact, setRetryExact] = useState(false);
  const [journalReady, setJournalReady] = useState(false), loadedScope = useRef<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [review, setReview] = useState<AplPlan | null>(null), [confirming, setConfirming] = useState(false), [comment, setComment] = useState('');
  const active = useRef(true), operation = useRef(false), controller = useRef<AbortController | null>(null), latestPlan = useRef(plan);
  const callbacks = useRef({ onChanged, onSecurityFailure, isBlocked });
  useLayoutEffect(() => { callbacks.current = { onChanged, onSecurityFailure, isBlocked }; latestPlan.current = plan; }, [plan, onChanged, onSecurityFailure, isBlocked]);
  const scope = useMemo<AplJournalScope | null>(() => identityKey && context.organizerId && (context.function === 'rektor' || context.function === 'administrator') ? {
    identityKey, customerId: context.customerId, membershipId: context.membershipId, assignmentId: context.assignmentId,
    organizerId: context.organizerId, unitId: plan.unitId, planId: plan.id, planVersion: plan.version, accessFunction: context.function,
  } : null, [identityKey, context.customerId, context.membershipId, context.assignmentId, context.organizerId, context.function, plan.id, plan.unitId, plan.version]);
  const scopeKey = JSON.stringify(scope), scopeRef = useRef(scopeKey);
  useLayoutEffect(() => { scopeRef.current = scopeKey; }, [scopeKey]);
  useUnsavedChanges(`apl-draft:${plan.id}`, dirty || journal !== null || busy);
  useUnsavedChanges(`navigation-block:apl:${plan.id}`, journal !== null || busy || loading || !journalReady);
  const aplContext = reply && context.organizerId ? { organizerId: context.organizerId, plan, program: reply.program, copyReview: reply.copyReview } : null;
  const savedProjection = aplContext && reply ? projectAplPlan(aplContext, reply.plan) : null;
  let projectedDraft: AplProjection | null = null, draftError: string | null = null;
  try { if (aplContext && draft) projectedDraft = projectAplPlan(aplContext, candidate(draft, inputs)); }
  catch (caught) { draftError = caught instanceof Error && !(caught instanceof TypeError) ? caught.message : 'Kontrollera periodens datum, veckor och granskningsanteckning.'; }
  const locked = disabled || !journalReady || loading || busy || journal !== null || !reply?.capabilities.canSave || reply.revision !== plan.revision || !scope;
  const canStart = () => !operation.current && !callbacks.current.isBlocked();
  const live = (ownScope = scopeKey) => active.current && scopeRef.current === ownScope;
  function adopt(fresh: { gym: GymTimplan; apl: AplReadReply }, keepDraft = false) {
    latestPlan.current = fresh.gym; setReply(fresh.apl); callbacks.current.onChanged(fresh.gym);
    if (!keepDraft) { setDraft(fresh.apl.plan && clone(fresh.apl.plan)); setInputs(inputsFor(fresh.apl.plan)); setDirty(false); setNotes({}); setEditing(false); setTermChoices({}); setOtherTerms({}); }
  }
  async function readBoth(signal: AbortSignal) {
    // Revisions must match. One bounded reread allows an unrelated writer to finish between the two reads.
    for (let attempt = 0; attempt < 2; attempt++) {
      const own = latestPlan.current;
      const gym = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: own.id }, signal), own.id);
      if (gym.unitId !== own.unitId || gym.offeringId !== own.offeringId || gym.version !== own.version || gym.revision < own.revision) throw new Error('Timplanens skola eller version kunde inte kontrolleras. Läs om arbetsytan.');
      const raw = parseAplReadReply(await api.post('/api/timplaner/gym/apl/lasa', { planId: own.id }, signal), { planId: own.id });
      if (raw.revision !== gym.revision && attempt === 0) continue;
      if (!context.organizerId) throw new Error('APL-underlagets huvudman kunde inte kontrolleras.');
      const apl = await verifyAplReadReply(raw, { organizerId: context.organizerId, plan: gym, program: raw.program, copyReview: raw.copyReview });
      return { gym, apl };
    }
    throw new Error('Timplanen ändrades under läsningen. Läs underlaget igen.');
  }
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  async function load(c: AbortController, ownScope: string) {
    if (operation.current || reply && (journal || dirty) || reply?.revision === plan.revision && loadedScope.current === ownScope) return;
    if (context.function !== 'huvudman' && !scope) return;
    controller.current = c; setLoading(true); setJournalReady(false); setError(null);
    try {
      const pending = scope ? await loadAplJournal(window.sessionStorage, scope) : null;
      if (!live(ownScope) || c.signal.aborted) return;
      setJournal(pending); setJournalReady(true);
      if (pending) {
        setNotice('Ett tidigare sparförsök behöver kontrolleras. Läs sparstatus innan du fortsätter.');
        if (pending.request.action === 'save') { setDraft(clone(pending.request.plan)); setInputs(inputsFor(pending.request.plan)); setEditing(true); setDirty(true); }
      }
      const fresh = await readBoth(c.signal);
      if (!live(ownScope) || c.signal.aborted) return;
      loadedScope.current = ownScope; adopt(fresh, pending?.request.action === 'save');
    } catch (caught) { if (live(ownScope) && !c.signal.aborted && !callbacks.current.onSecurityFailure(caught)) setError('APL-underlaget eller det tidigare sparförsöket kunde inte läsas. Försök läsa igen.'); }
    finally { if (live(ownScope) && !c.signal.aborted) setLoading(false); }
  }
  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const c = new AbortController();
    // Local drafts survive parent rerenders. Only verified identity/plan scope or a saved revision starts a read.
    queueMicrotask(() => { if (!c.signal.aborted) void loadRef.current(c, scopeKey); });
    return () => c.abort();
  }, [scopeKey, plan.revision]);
  function change(value: AplPlan) { if (locked || !canStart()) return; setDraft(value); setDirty(true); setError(null); setNotice(null); setReview(null); }
  function periodChange(id: string, update: (period: AplPeriod) => AplPeriod) { if (draft) change({ ...draft, periods: draft.periods.map(p => p.id === id ? update(p) : p) }); }
  function chooseTerm(period: AplPeriod, field: 'year' | 'season', value: string) {
    if (locked || !canStart()) return;
    const previous = termChoices[period.id] ?? { year: period.plannedTermIndex === undefined ? '' : String(Math.floor(period.plannedTermIndex / 2) + 1), season: period.plannedTermIndex === undefined ? '' : period.plannedTermIndex % 2 ? 'VT' : 'HT' };
    const choice = { ...previous, [field]: value }; setTermChoices(old => ({ ...old, [period.id]: choice }));
    periodChange(period.id, old => {
      const { plannedTermIndex: _previousTerm, ...rest } = old;
      if (!choice.year || !choice.season) return rest;
      const plannedTermIndex = (Number(choice.year) - 1) * 2 + (choice.season === 'VT' ? 1 : 0);
      const schoolYear = calendar.startAcademicYear === null ? old.schoolYear : calendar.startAcademicYear + Math.floor(plannedTermIndex / 2);
      return { ...rest, plannedTermIndex, schoolYear };
    });
  }
  function allocationChange(id: string, row: string, term: number, field: 'hours' | 'minutes', value: string) {
    if (locked || !canStart()) return;
    const key = keyFor(id, row, term); setInputs(previous => ({ ...previous, [key]: { ...(previous[key] ?? { hours: '', minutes: '' }), [field]: value } })); setDirty(true); setReview(null);
  }
  function startReview() {
    if (!draft || !aplContext || locked || !canStart()) return;
    try {
      if (draft.periods.some(p => { const choice = termChoices[p.id]; return choice && Boolean(choice.year) !== Boolean(choice.season); })) throw new Error('Välj både årskurs och termin, eller lämna båda tomma.');
      const value = candidate(draft, inputs); validateAplAllocationWrite(aplContext, value);
      if (Object.values(notes).some(n => n.resolved && !n.note.trim())) throw new Error('Beskriv hur varje markerad granskningspunkt har hanterats.');
      setReview(value); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Kontrollera APL-underlaget.'); }
  }
  async function finish(pending: AplJournal, fresh: { gym: GymTimplan; apl: AplReadReply }, message: string) {
    if (!scope) return;
    await removeAplJournal(window.sessionStorage, pending, scope);
    if (!live()) return;
    adopt(fresh); setJournal(null); setRetryExact(false); setReview(null); setConfirming(false); setMfa(false); setNotice(message); setError(null);
  }
  async function send(command: AplCommand, existing?: AplJournal) {
    if (!scope || !canStart() || !existing && (locked || !reply)) return;
    operation.current = true; setBusy(true); setError(null); setRetryExact(false);
    const ownScope = scopeKey, c = new AbortController(); controller.current = c;
    let persisted: AplJournal | null = existing ?? null;
    try {
      persisted = await persistAplJournal(window.sessionStorage, existing ?? await createAplJournal(scope, command), scope);
      if (!live(ownScope)) return;
      setJournal(persisted); setReview(null); setConfirming(false);
      const result = parseAplCommandReply(await api.post('/api/timplaner/gym/apl/kommando', persisted.request, c.signal), persisted.request);
      const fresh = await readBoth(c.signal); if (!live(ownScope)) return;
      if (fresh.apl.revision < result.receipt.revision || fresh.apl.revision === result.receipt.revision && fresh.apl.contentHash !== result.receipt.contentHash) throw new Error('inconsistent_receipt');
      await finish(persisted, fresh, fresh.apl.revision > result.receipt.revision ? 'Sparandet är bekräftat. En senare ändring finns också; den aktuella timplanen visas.' : command.action === 'confirm' ? 'Förläggningen är bekräftad av rektor. Huvudmannen fastställer timplanen separat.' : 'APL-planen är sparad. Du kan fortsätta med datum, omfattning och ämnen senare.');
    } catch (caught) {
      if (!live(ownScope) || callbacks.current.onSecurityFailure(caught)) return;
      if (!persisted) { setReview(null); setConfirming(false); }
      setMfa(caught instanceof ApiError && caught.code === 'mfa_required');
      // Even an explicit conflict is reconciled via status, preserving the exact pending request and draft.
      setError(persisted ? caught instanceof ApiError && caught.code === 'mfa_required' ? 'Verifiera med engångskod och läs sedan sparstatus.' : 'Sparandet kunde inte bekräftas. Dina uppgifter finns kvar. Läs sparstatus innan du fortsätter.' : 'Sparförsöket kunde inte lagras i den här fliken. Inget skickades. Kontrollera att webbläsaren tillåter sessionslagring och försök igen.');
    } finally { operation.current = false; if (live(ownScope)) setBusy(false); }
  }
  async function checkStatus() {
    if (!scope || !journal || !canStart()) return;
    const pending = journal, ownScope = scopeKey, c = new AbortController(); controller.current = c; operation.current = true; setBusy(true); setError(null);
    try {
      const status = await api.post('/api/timplaner/gym/apl/status', { command: pending.request }, c.signal);
      const fresh = await readBoth(c.signal);
      const recovery = await recoverAplJournal(pending, scope, status, fresh.apl); if (!live(ownScope)) return;
      if (recovery.state === 'completed_current' || recovery.state === 'completed_historical') await finish(pending, fresh,
        recovery.state === 'completed_historical' ? 'Sparandet är bekräftat. En senare ändring finns också; den aktuella timplanen visas.' : pending.request.action === 'confirm' ? 'Rektors bekräftelse är sparad. Huvudmannens fastställande är ett separat steg.' : 'APL-planen är sparad och återläst.');
      else if (recovery.state === 'retry_exact') { adopt(fresh, true); setRetryExact(true); setMfa(false); setNotice('Sparförsöket finns inte registrerat. Du kan skicka exakt samma underlag igen.'); }
      else if (recovery.status.state === 'not_found') {
        await removeAplJournal(window.sessionStorage, pending, scope); if (!live(ownScope)) return;
        adopt(fresh, pending.request.action === 'save'); setJournal(null); setMfa(false); setRetryExact(false);
        setNotice('Inget sparande registrerades och timplanen har ändrats. Dina uppgifter finns kvar. Granska dem mot den aktuella totaltiden innan du sparar igen.');
      } else { setError('Det tidigare kvittot och den aktuella timplanen stämmer ännu inte överens. Läs sparstatus igen.'); }
    } catch (caught) { if (live(ownScope) && !callbacks.current.onSecurityFailure(caught)) setError('Sparstatus kunde inte kontrolleras. Behåll den här fliken och försök läsa sparstatus igen.'); }
    finally { operation.current = false; if (live(ownScope)) setBusy(false); }
  }
  const confirmed = !!reply?.confirmations.length && reply.confirmations.at(-1)?.contentHash === reply.contentHash;
  const reviewProjection = review && aplContext ? projectAplPlan(aplContext, review) : null;
  const displayedPlan = editing ? draft : reply?.plan;
  const displayedProjection = editing && projectedDraft ? projectedDraft : savedProjection;
  const schoolYears = [...new Set(displayedPlan?.periods.map(p => p.schoolYear) ?? [])].sort((a, b) => (a ?? 9999) - (b ?? 9999));
  const returnTo = '/?' + new URLSearchParams({ vy: 'timplaner', timplan: plan.id, timplansskola: plan.unitId, timplansutbildning: plan.offeringId, timplansversion: String(plan.version) });
  return <section id="apl-planering" tabIndex={-1} className="apl-plan" aria-label="APL-planering" aria-busy={busy || loading}>
    <header><div><h2>APL-planering</h2><p>Planera arbetsplatsförlagt lärande inom timplanens undervisningstid.</p></div><span className="apl-state">{journal ? 'Sparstatus behöver kontrolleras' : dirty ? 'Osparade ändringar' : confirmed ? 'Förläggningen bekräftad' : reply?.plan ? 'Sparat planeringsunderlag' : 'APL-underlag saknas'}</span></header>
    <p>Detta visar planering. Arbetsplatser, närvaro och genomförd APL följs inte upp här ännu.</p>
    {loading && <output>Läser APL-underlaget…</output>}
    {error && <div role="alert" className="apl-error"><p>{error}</p>{!reply && !loading && <Button variant="outline" onClick={() => { setLoading(true); const c = new AbortController(); controller.current = c; void loadRef.current(c, scopeKey); }}>Läs APL-underlaget igen</Button>}</div>}
    {notice && <output className="apl-notice">{notice}</output>}
    {mfa && <MfaStepUpNotice message="Verifiering behövs för att spara." detail="Sparförsöket är bevarat i den här fliken. Läs sparstatus efter återkomsten." returnTo={returnTo}/>}
    {journal && <div className="apl-actions"><Button disabled={busy || disabled} onClick={() => void checkStatus()}>Läs sparstatus</Button>{retryExact && <><Button variant="outline" disabled={busy || disabled} onClick={() => void send(journal.request, journal)}>Skicka samma sparförsök igen</Button><Button variant="outline" disabled={busy || disabled} onClick={() => {
      if (!scope || !canStart()) return;
      const pending = journal; operation.current = true; setBusy(true);
      void removeAplJournal(window.sessionStorage, pending, scope).then(() => { if (live()) { setJournal(null); setRetryExact(false); setNotice('Det osparade underlaget finns kvar. Granska innan du gör ett nytt sparförsök.'); } }).catch(() => { if (live()) setError('Sparförsöket kunde inte avslutas. Läs sparstatus igen.'); }).finally(() => { operation.current = false; if (live()) setBusy(false); });
    }}>Granska underlaget igen</Button></>}</div>}
    {savedProjection && (editing ? <details className="apl-details"><summary>Visa tidsöversikt</summary><Summary projection={projectedDraft ?? savedProjection} label="APL-planens aktuella inmatning"/></details> : <Summary projection={savedProjection} label="Sparad APL-plan"/>)}
    {!editing && !!reply?.plan?.periods.length && <ul className="apl-period-overview">{reply.plan.periods.map((p, index) => <li key={p.id}><strong>{p.name || `Period ${index + 1}`}</strong> · {p.plannedTermIndex === undefined ? 'Terminsval inte angivet' : termLabel(p.plannedTermIndex)}{!p.startsOn || !p.endsOn ? ' · Preliminär – datum kommer senare' : ` · ${p.startsOn}–${p.endsOn}`}</li>)}</ul>}
    {!editing && displayedPlan && schoolYears.length > 0 && <div className="apl-by-year" aria-label="APL per läsår"><h3>Omfattning per läsår</h3>{schoolYears.map(year => {
      const periods = displayedPlan.periods.filter(p => p.schoolYear === year), values = periods.map(p => displayedProjection?.periods.find(value => value.id === p.id));
      const allReviewed = values.every(value => value?.reviewedWholeWeeks !== null && value?.reviewedWholeWeeks !== undefined);
      const weeks = allReviewed ? values.reduce((sum, value) => sum + value!.reviewedWholeWeeks!, 0) : null;
      const expectedMinutes = values.every(value => value?.expectedGutMinutes != null) ? values.reduce((sum, value) => sum + value!.expectedGutMinutes!, 0) : null;
      return <p key={year ?? 'unknown'}><strong>{year === null ? 'Läsår saknas' : `${year}/${year + 1}`}</strong> · {weeks === null ? 'Veckounderlaget behöver granskas' : `${weeks} granskade hela veckor`} · motsvarande undervisningstid: {aplTime(expectedMinutes)}</p>;
    })}</div>}
    {reply && <>
      {!reply.capabilities.canSave && <p>{['faststalld','ersatt'].includes(plan.status) ? 'Den här versionen är låst. Skapa en ny version av timplanen för att ändra APL-planeringen.' : 'APL-underlaget visas i läsläge för ditt aktuella uppdrag.'}</p>}
      {disabled && <p className="apl-notice">Avsluta eller kontrollera den andra pågående ändringen i timplanen innan du ändrar APL.</p>}
      {!editing && <div className="apl-actions">{reply.capabilities.canSave && <Button disabled={locked} onClick={() => { if (!canStart()) return; setDraft(clone(reply.plan ?? emptyPlan())); setInputs(inputsFor(reply.plan)); setEditing(true); setNotice(null); setTermChoices({}); setOtherTerms({}); }}>Planera APL</Button>}
        {reply.capabilities.canConfirm && <Button variant="outline" disabled={locked || dirty || !savedProjection?.readyForConfirmation || confirmed} onClick={() => { if (canStart()) { setComment(''); setConfirming(true); } }}>Bekräfta förläggningen</Button>}</div>}
      <details className="apl-details"><summary>Inför rektors bekräftelse – visa vad som saknas{(projectedDraft ?? savedProjection)?.issues.length ? ` (${(projectedDraft ?? savedProjection)!.issues.length})` : ''}</summary>
        {(projectedDraft ?? savedProjection)?.issues.length ? <ul>{(projectedDraft ?? savedProjection)!.issues.map((issue, index) => <li key={index}>{issue.periodId && <strong>{(draft ?? reply.plan)?.periods.find(p => p.id === issue.periodId)?.name || 'Period'}: </strong>}{issue.message}</li>)}</ul> : <p>Planeringsunderlaget är komplett för rektors bekräftelse. Det är inte ett besked om genomförd APL.</p>}
        {draftError && <p role="alert">{draftError}</p>}</details>
      <details className="apl-details"><summary>Visa underlag</summary><p>APL räknas inom angiven undervisningstid. För skolförlagda yrkesprogram motsvarar en granskad hel APL-vecka 23 undervisningstimmar. Datum används bara för kontroll; de fyller aldrig i veckotal.</p>
        <p>Flera ämneskopplingar beskriver innehållet. Tiden fördelas separat och räknas bara en gång. Olika klassers behov hanteras med olika namngivna timplaner.</p>
        {(reply.plan?.periods ?? []).map(p => <article key={p.id}><h3>{p.name || 'Period utan namn'}</h3><p>{p.plannedTermIndex !== undefined && <><strong>{termLabel(p.plannedTermIndex)}</strong> · </>}{p.startsOn ?? 'Datum kommer senare'} – {p.endsOn ?? 'Slut saknas'} · {p.schoolYear === null ? 'Läsår saknas' : `${p.schoolYear}/${p.schoolYear + 1}`} · {p.extent.reviewed && p.extent.weeks !== null ? `${p.extent.weeks} granskade hela veckor` : 'Omfattningen behöver granskas'}</p><ul>{p.contents.map(c => <li key={c.rowKey}>{plan.rows.find(r => r.key === c.rowKey)?.name ?? 'Innehåll som behöver granskas'}: {c.description || 'Arbetsmoment saknas'}</li>)}</ul></article>)}
      </details>
    </>}
    {editing && draft && <div className="apl-editor">
      <p>Välj årskurs och termin för varje period. Du kan spara direkt och fylla på med detaljer senare.</p>
      {draft.periods.map((p, index) => { const selected = p.plannedTermIndex;
        const choice = termChoices[p.id] ?? { year: selected === undefined ? '' : String(Math.floor(selected / 2) + 1), season: selected === undefined ? '' : selected % 2 ? 'VT' : 'HT' };
        const derivedYear = selected === undefined || calendar.startAcademicYear === null ? null : calendar.startAcademicYear + Math.floor(selected / 2);
        const savedTimes = p.contents.flatMap(c => [0,1,2,3,4,5].flatMap(term => {
          const value = inputs[keyFor(p.id, c.rowKey, term)];
          return value && (value.hours !== '' || value.minutes !== '') ? [{ row: c.rowKey, term, value }] : [];
        }));
        const differs = selected !== undefined && (savedTimes.some(a => a.term !== selected) || !!(p.startsOn && p.endsOn && calendar.terms[selected] && (p.startsOn < calendar.terms[selected].startsOn || p.endsOn >= calendar.terms[selected].endsBefore)));
        return <fieldset key={p.id} disabled={locked} className="apl-period"><legend>Period {index + 1}{p.name ? ` · ${p.name}` : ''}</legend>
        <label>Periodens namn (valfritt)<input aria-label="Periodens namn" maxLength={120} value={p.name} onChange={e => periodChange(p.id, old => ({ ...old, name: e.target.value }))}/></label>
        <div className="apl-fields apl-term-choice">
          <label>Årskurs<select aria-label="Årskurs" value={choice.year} onChange={e => chooseTerm(p, 'year', e.target.value)}><option value="">Välj årskurs</option>{[1,2,3].map(year => <option key={year} value={year}>Årskurs {year}</option>)}</select></label>
          <label>Termin<select aria-label="Termin" value={choice.season} onChange={e => chooseTerm(p, 'season', e.target.value)}><option value="">Välj termin</option><option value="HT">Hösttermin</option><option value="VT">Vårtermin</option></select></label>
          <div className="apl-derived-year"><span>Läsår</span><strong>{derivedYear === null ? 'Visas när terminen kan bestämmas' : `${derivedYear}/${derivedYear + 1}`}</strong></div>
        </div>
        {calendar.startAcademicYear === null && <p>Läsåret kan inte härledas eftersom utbildningens start saknas i timplanens underlag. Terminsvalet kan ändå sparas.</p>}
        {calendar.startedOn && calendar.startedOn.slice(5, 7) < '07' && <p>Utbildningen har vårstart. Årskurs och termin följer timplanens indelning; kontrollera förläggningen mot starten {calendar.startedOn}.</p>}
        {selected === undefined && (p.startsOn || p.contents.length > 0) && <p>Terminsval är frivilligt för äldre perioder som redan har datum eller tid i flera terminer.</p>}
        {differs && <p className="apl-notice">Perioden innehåller datum eller undervisningstid utanför den valda terminen. Uppgifterna är kvar. Kontrollera förläggningen eller ändra terminsvalet.</p>}
        {savedTimes.length > 0 && <div className="apl-saved-times"><strong>Periodens fördelade APL-tid</strong><ul>{savedTimes.map(a => <li key={`${a.row}:${a.term}`}>{plan.rows.find(r => r.key === a.row)?.name ?? 'Ämne'} · {PROGRAMPLAN_TERMS[a.term]}: {a.value.hours || '0'} h {a.value.minutes || '0'} min</li>)}</ul></div>}
        <details className="apl-details"><summary>Datum och omfattning</summary><p>Komplettera när förläggningen är känd. Exakta datum behövs inför rektors bekräftelse.</p>
        <div className="apl-fields"><label>Startdatum<input type="date" value={p.startsOn ?? ''} onChange={e => periodChange(p.id, old => ({ ...old, startsOn: e.target.value || null, extent: { ...old.extent, reviewed: false } }))}/></label>
          <label>Slutdatum<input type="date" value={p.endsOn ?? ''} onChange={e => periodChange(p.id, old => ({ ...old, endsOn: e.target.value || null, extent: { ...old.extent, reviewed: false } }))}/></label>
          <label>Periodens läsår<select value={p.schoolYear ?? ''} onChange={e => periodChange(p.id, old => ({ ...old, schoolYear: e.target.value ? Number(e.target.value) : null, extent: { ...old.extent, reviewed: false } }))}><option value="">Välj läsår</option>{Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => <option key={y} value={y}>{y}/{y + 1}</option>)}</select></label></div>
        <div className="apl-fields"><label>Omfattning<select value={p.extent.basis} onChange={e => periodChange(p.id, old => ({ ...old, extent: { ...old.extent, basis: e.target.value as AplPeriod['extent']['basis'], weeks: null, reviewed: false } }))}><option value="unknown">Behöver utredas</option><option value="whole_weeks">Hela APL-veckor</option><option value="mixed_weeks">Delar av veckor eller blandveckor</option></select></label>
          {p.extent.basis === 'whole_weeks' && <label>Uppgivna hela veckor<input type="number" min={1} max={160} step={1} value={p.extent.weeks ?? ''} onChange={e => periodChange(p.id, old => ({ ...old, extent: { ...old.extent, weeks: e.target.value === '' ? null : Number(e.target.value), reviewed: false } }))}/></label>}</div>
        <p>Veckotalet är en uttrycklig uppgift. Datum räknar inte fram det.</p>
        <label>Underlag för omfattningen<textarea maxLength={2000} value={p.extent.reviewNote} onChange={e => periodChange(p.id, old => ({ ...old, extent: { ...old.extent, reviewNote: e.target.value, reviewed: false } }))}/></label>
        {p.extent.basis === 'whole_weeks' && <label className="apl-check"><input type="checkbox" disabled={!p.extent.weeks || !p.extent.reviewNote.trim()} checked={p.extent.reviewed} onChange={e => periodChange(p.id, old => ({ ...old, extent: { ...old.extent, reviewed: e.target.checked } }))}/>Omfattningen är granskad mot underlaget</label>}
        {p.extent.basis !== 'whole_weeks' && <p>Den här omfattningen kan sparas som planeringsunderlag. Den räknas inte automatiskt om till hela APL-veckor.</p>}
        </details>
        <details className="apl-details"><summary>Ämnesinnehåll och undervisningstid</summary>
        {selected !== undefined && <><p>Fördela tid för {termLabel(selected).toLowerCase()}. Redan angiven tid i andra terminer visas också.</p><label className="apl-check"><input type="checkbox" checked={otherTerms[p.id] ?? false} onChange={e => setOtherTerms(old => ({ ...old, [p.id]: e.target.checked }))}/>Fördela även på andra terminer</label></>}

        {p.contents.map(c => { const row = plan.rows.find(r => r.key === c.rowKey); return <div key={c.rowKey} className="apl-content"><h4>{row ? `${row.name} ${row.levelName}` : 'Innehållet finns inte längre i timplanen'}</h4>
          {row?.rowKind !== 'fixed' && <p>Detta innehåll behöver preciseras till en ämnesnivå innan förläggningen kan bekräftas.</p>}
          {selected !== undefined && row && row.pointTerms[selected] === 0 && <p>Ämnet är inte fördelat på den valda terminen i timplanen. Kontrollera terminsvalet eller visa andra terminer.</p>}
          <label>Arbetsmoment<textarea maxLength={2000} value={c.description} onChange={e => periodChange(p.id, old => ({ ...old, contents: old.contents.map(item => item.rowKey === c.rowKey ? { ...item, description: e.target.value } : item) }))}/></label>
          <div className="apl-allocations">{[0,1,2,3,4,5].filter(term => ((selected === undefined || otherTerms[p.id] || selected === term) && (row?.pointTerms[term] ?? 0) > 0) || inputs[keyFor(p.id, c.rowKey, term)]).map(term => { const values = inputs[keyFor(p.id, c.rowKey, term)] ?? { hours: '', minutes: '' }; return <div key={term} className="apl-allocation"><strong>{PROGRAMPLAN_TERMS[term]}</strong><span>Total: {row ? plan.hours[row.key][term] === null ? 'Ofördelad' : `${plan.hours[row.key][term]} h` : 'Saknas'}</span>
            <div className="apl-time-input"><label>Varav APL, timmar<input type="text" inputMode="numeric" value={values.hours} aria-label={`${row?.name ?? 'Ämne'}, ${PROGRAMPLAN_TERMS[term]}, APL timmar`} onChange={e => allocationChange(p.id, c.rowKey, term, 'hours', e.target.value)}/></label><label>Minuter<input type="text" inputMode="numeric" value={values.minutes} aria-label={`${row?.name ?? 'Ämne'}, ${PROGRAMPLAN_TERMS[term]}, APL minuter`} onChange={e => allocationChange(p.id, c.rowKey, term, 'minutes', e.target.value)}/></label></div></div>; })}</div>
          <Button variant="outline" onClick={() => periodChange(p.id, old => ({ ...old, contents: old.contents.filter(item => item.rowKey !== c.rowKey), allocations: old.allocations.filter(a => a.rowKey !== c.rowKey) }))}>Ta bort ämnesinnehållet</Button></div>; })}
        <label>Lägg till ämnesinnehåll<select value="" onChange={e => { if (e.target.value) periodChange(p.id, old => ({ ...old, contents: [...old.contents, { rowKey: e.target.value, description: '' }] })); }}><option value="">Välj ämne, nivå eller block</option>{plan.rows.filter(r => !p.contents.some(c => c.rowKey === r.key)).map(r => <option key={r.key} value={r.key}>{r.name} {r.levelName}</option>)}</select></label>
        </details>
        <Button variant="outline" onClick={() => { if (draft) change({ ...draft, periods: draft.periods.filter(old => old.id !== p.id) }); }}>Ta bort perioden</Button>
      </fieldset>; })}
      <Button variant="outline" disabled={locked || draft.periods.length >= 100} onClick={() => change({ ...draft, periods: [...draft.periods, { id: crypto.randomUUID(), name: '', startsOn: null, endsOn: null, schoolYear: null, extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' }, contents: [], allocations: [] }] })}>Lägg till period</Button>
      <details className="apl-details"><summary>Utbildningsform och granskning</summary>
      <fieldset disabled={locked}><legend>Utbildningsform och fördelning</legend><label>Utbildningsform<select value={draft.educationForm} onChange={e => change({ ...draft, educationForm: e.target.value as AplPlan['educationForm'] })}><option value="unknown">Behöver anges</option><option value="school_based">Skolförlagd yrkesutbildning</option><option value="apprenticeship">Gymnasial lärlingsutbildning</option></select></label>
        <label className="apl-check"><input type="checkbox" checked={draft.classification === 'complete'} onChange={e => change({ ...draft, classification: e.target.checked ? 'complete' : 'unreviewed' })}/>All APL-tid är identifierad i timplanens totaltid</label>
        <p>Markera först när hela fördelningen har granskats. En tom APL-plan eller ett okänt underlag betyder inte noll APL.</p></fieldset>
      </details>
      {!!reply?.copyReview.some(r => r.resolution === null) && <fieldset disabled={locked}><legend>Granska kopierat underlag</legend><p>Dessa uppgifter kunde inte kopieras till timplanen. Fördela innehåll och tid på nytt eller beskriv varför uppgiften ska utgå.</p>{reply.copyReview.filter(r => r.resolution === null).map(r => <div key={r.id} className="apl-content"><h3>{r.sourcePeriodName || 'Kopierad period'} · version {r.sourceVersion}</h3><p>{{ missing_row: 'Ämnesinnehållet saknas i den nya planen.', inactive_term: 'Terminen används inte i den nya planen.', insufficient_total: 'APL-tiden ryms inte inom den nya totaltiden.', unverified_source: 'Källunderlaget kunde inte verifieras.' }[r.reason]}</p><ul>{r.contents.map(c => <li key={c.rowKey}>{c.description || 'Arbetsmoment saknas'}</li>)}</ul><p>Berörd tid: {aplTime(r.allocations.reduce((sum, a) => sum + a.gutMinutes, 0))}</p><label>Så har uppgiften hanterats<textarea maxLength={2000} value={notes[r.id]?.note ?? ''} onChange={e => { setNotes(old => ({ ...old, [r.id]: { ...(old[r.id] ?? { resolved: false, note: '' }), note: e.target.value } })); setDirty(true); }}/></label><label className="apl-check"><input type="checkbox" checked={notes[r.id]?.resolved ?? false} onChange={e => { setNotes(old => ({ ...old, [r.id]: { ...(old[r.id] ?? { resolved: false, note: '' }), resolved: e.target.checked } })); setDirty(true); }}/>Jag har hanterat den här uppgiften</label></div>)}</fieldset>}
      {draftError && <p role="alert" className="apl-error">{draftError}</p>}
      <div className="apl-actions"><Button disabled={locked || !dirty} onClick={startReview}>Granska ändringar</Button><Button variant="outline" disabled={busy || journal !== null} onClick={() => { setDraft(reply?.plan ? clone(reply.plan) : null); setInputs(inputsFor(reply?.plan ?? null)); setNotes({}); setEditing(false); setDirty(false); setTermChoices({}); setOtherTerms({}); setError(null); }}>Avbryt ändringar</Button></div>
    </div>}
    <Dialog open={review !== null} onOpenChange={open => { if (!open && !busy) setReview(null); }}><DialogContent className="apl-dialog"><DialogTitle>Granska APL-planen före sparande</DialogTitle><DialogDescription>Totaltiden ändras inte. APL-tiden nedan ingår i den.</DialogDescription>
      {savedProjection && reviewProjection && <><h3>Sparat underlag</h3><Summary projection={savedProjection} label="Före ändringen"/><h3>Efter ändringen</h3><Summary projection={reviewProjection} label="Efter ändringen"/><p>{reply?.plan?.classification === 'complete' ? 'Tidigare fördelning var granskad.' : 'Tidigare fördelning var okänd eller inte färdiggranskad.'} {review?.classification === 'complete' ? 'Du anger nu att all APL-tid är identifierad.' : 'Fördelningen behöver fortfarande granskas.'}</p><p>Ämneskopplingar: {reply?.plan?.periods.reduce((sum, p) => sum + p.contents.length, 0) ?? 0} → {review?.periods.reduce((sum, p) => sum + p.contents.length, 0)}. Perioder: {reply?.plan?.periods.length ?? 0} → {review?.periods.length}.</p>{reviewProjection.issues.length > 0 && <p>{reviewProjection.issues.length} punkter behöver fortfarande kompletteras. Du kan spara underlaget och fortsätta senare.</p>}</>}
      {!!review?.periods.length && <ul className="apl-review-periods">{review.periods.map((p, index) => <li key={p.id}><strong>{p.name || `Period ${index + 1}`}</strong>: {p.plannedTermIndex === undefined ? 'Terminsval inte angivet' : termLabel(p.plannedTermIndex)}{!p.startsOn || !p.endsOn ? ' · Preliminär – datum kommer senare' : ` · ${p.startsOn}–${p.endsOn}`}</li>)}</ul>}
      <div className="apl-actions"><Button disabled={locked || !review} onClick={() => { if (review && reply) void send({ contractVersion: 'structured_v1', action: 'save', commandId: crypto.randomUUID(), planId: plan.id, expectedRevision: reply.revision, plan: review, copyReviewResolutions: Object.entries(notes).filter(([, n]) => n.resolved).map(([id, n]) => ({ id, note: n.note.trim() })) }); }}>Spara APL-plan</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Fortsätt redigera</Button></div>
    </DialogContent></Dialog>
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}><DialogContent className="apl-dialog"><DialogTitle>Bekräfta förläggningen</DialogTitle><DialogDescription>Som rektor bekräftar du den sparade APL-förläggningen och dess ämnesinnehåll. Huvudmannen fastställer timplanen separat.</DialogDescription><label>Rektors kommentar<textarea maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></label><div className="apl-actions"><Button disabled={locked || dirty || !comment.trim() || !savedProjection?.readyForConfirmation} onClick={() => { if (reply && canStart()) void send({ contractVersion: 'structured_v1', action: 'confirm', commandId: crypto.randomUUID(), planId: plan.id, expectedRevision: reply.revision, expectedContentHash: reply.contentHash, comment: comment.trim() }); }}>Bekräfta förläggningen</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Avbryt</Button></div></DialogContent></Dialog>
  </section>;
}
