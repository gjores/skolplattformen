'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, FileText, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplanOfferingList, parseProgramplanWorkspace, type ProgramplanOfferingList } from '@/lib/programplan-workspace-contract.ts';
import { PROGRAMPLAN_TERMS } from '@/lib/programplan-terms.ts';
import { statusLabel } from '@/lib/protected-timplan.ts';
import { gymTimplanCanEdit, gymTimplanTotals, parseGymTimplan, parseGymTimplanCreateReply, parseGymTimplanHourInput,
  parseGymTimplanRowReply, parseGymTimplanUnderlag, type GymTimplan, type GymTimplanCreateRequest,
  type GymTimplanHours, type GymTimplanRow, type GymTimplanUnderlag, type GymTimplanUnit } from '@/lib/gym-timplan.ts';
import type { GymTimplanLocation, ProgramplanLocation } from '@/lib/protected-plan-location.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import './protected-gym-timplan.css';

type RowDraft = { row: GymTimplanRow; values: string[]; original: GymTimplanHours; mode: 'edit' | 'compare' | 'applied' | 'unread'; error: string | null; mfa: boolean };
type CreateDraft = { request: GymTimplanCreateRequest; schoolName: string; previousVersion: number | null;
  preserved: number; cleared: number; error: string | null; uncertain: boolean; stale: boolean; mfa: boolean };
type Props = { context: ActiveContext; epoch: number; initialTarget: GymTimplanLocation | null;
  year: string; onYear: (year: string) => void;
  onSessionLost: () => void; onOpened: (target: GymTimplanLocation | null, sourcePlanId?: string) => void; onProgramplan: (target: ProgramplanLocation) => void };
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const message = (caught: unknown, fallback: string) => caught instanceof ApiError ? caught.message : fallback;
const sameValues = (values: string[], hours: GymTimplanHours) => values.every((value, i) => parseGymTimplanHourInput(value) === hours[i]);
const rowLabel = (row: GymTimplanRow) => `${row.name} ${row.levelName}`;
const editableValues = (draft: RowDraft): GymTimplanHours | null => {
  const values = draft.values.map(parseGymTimplanHourInput);
  return values.some(value => value === undefined) ? null : values as GymTimplanHours;
};

export default function ProtectedGymTimplanWorkspace({ context, epoch, initialTarget, year, onYear, onSessionLost, onOpened, onProgramplan }: Props) {
  const [list, setList] = useState<ProgramplanOfferingList | null>(null), [page, setPage] = useState(1);
  const [underlag, setUnderlag] = useState<GymTimplanUnderlag | null>(null), [plan, setPlan] = useState<GymTimplan | null>(null);
  const [draft, setDraft] = useState<RowDraft | null>(null), [creating, setCreating] = useState<CreateDraft | null>(null);
  const [showSource, setShowSource] = useState(false), [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const active = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), saving = useRef(false);
  const opened = useRef(onOpened); useEffect(() => { opened.current = onOpened; }, [onOpened]);
  const dirty = !!draft && (draft.mode !== 'applied' && (!sameValues(draft.values, draft.original) || draft.mode !== 'edit')) || !!creating?.uncertain;
  useUnsavedChanges(`gym-timplan-${epoch}-${context.assignmentId}`, dirty || busy && (!!draft || !!creating));
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; }, []);
  const begin = useCallback(() => { invalidate(); const c = new AbortController(); controller.current = c; return { token: generation.current, signal: c.signal }; }, [invalidate]);
  const current = useCallback((token: number) => active.current && generation.current === token, []);
  const securityFailure = useCallback((caught: unknown) => {
    if (!(caught instanceof ApiError) || !(caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) return false;
    invalidate(); setList(null); setUnderlag(null); setPlan(null); setDraft(null); setCreating(null); setShowSource(false); setError(null); setNotice(null); setBusy(false); onSessionLost(); return true;
  }, [invalidate, onSessionLost]);

  const loadList = useCallback(async (nextPage = 1) => {
    const r = begin(); setPage(nextPage); setList(null); setUnderlag(null); setPlan(null); setError(null); setNotice(null); setBusy(true); setOnlyMissing(false);
    try {
      const result = parseProgramplanOfferingList(await api.post('/api/programplaner/lista', { page: nextPage }, r.signal), nextPage);
      if (current(r.token)) { setList(result); opened.current(null); }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Utbildningarna kunde inte hämtas. Försök igen.')); }
    finally { if (current(r.token)) setBusy(false); }
  }, [begin, current, securityFailure]);
  const openPlan = useCallback(async (planId: string) => {
    const r = begin(); setList(null); setUnderlag(null); setPlan(null); setError(null); setNotice(null); setBusy(true);
    try {
      const result = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId }, r.signal), planId);
      if (current(r.token)) { setPlan(result); opened.current({ kind: 'plan', id: planId }, result.source.planId); }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Timplanen kunde inte hämtas. Försök igen.')); }
    finally { if (current(r.token)) setBusy(false); }
  }, [begin, current, securityFailure]);
  const loadUnderlag = useCallback(async (sourcePlanId: string, continueExisting = false) => {
    const r = begin(); setUnderlag(null); setPlan(null); setList(null); setError(null); setNotice(null); setBusy(true);
    try {
      const result = parseGymTimplanUnderlag(await api.post('/api/timplaner/gym/underlag', { sourcePlanId }, r.signal), sourcePlanId);
      if (current(r.token)) {
        const unit = result.units.length === 1 ? result.units[0] : null;
        const existing = unit?.plans.find(p => p.status === 'utkast') ?? unit?.plans.find(p => p.status === 'faststalld');
        if (continueExisting && existing?.sourcePlanId === sourcePlanId && existing.sourceRevision === result.source.revision) await openPlan(existing.id);
        else { setUnderlag(result); opened.current({ kind: 'source', id: sourcePlanId }); }
      }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Programplanens underlag kunde inte hämtas. Försök igen.')); }
    finally { if (current(r.token)) setBusy(false); }
  }, [begin, current, openPlan, securityFailure]);
  useEffect(() => {
    active.current = true;
    queueMicrotask(() => {
      if (!active.current) return;
      if (initialTarget?.kind === 'source') void loadUnderlag(initialTarget.id, true);
      else if (initialTarget?.kind === 'plan') void openPlan(initialTarget.id);
      else void loadList();
    });
    return () => { active.current = false; invalidate(); };
  }, [initialTarget, invalidate, loadList, loadUnderlag, openPlan]);

  async function chooseEducation(offeringId: string) {
    const r = begin(); setBusy(true); setError(null);
    try {
      const request = { offeringId, versionPage: 1, catalogId: null };
      const workspace = parseProgramplanWorkspace(await api.post('/api/programplaner/underlag', request, r.signal), request);
      if (!current(r.token)) return;
      const source = workspace.versions.find(v => v.status === 'utkast') ?? workspace.versions.find(v => v.status === 'faststalld') ?? workspace.versions[0];
      if (!source) { setBusy(false); setError('Utbildningen saknar programplan. Skapa och spara programramen i Programplaner först.'); return; }
      await loadUnderlag(source.id, true);
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) { setBusy(false); setError(message(caught, 'Programplanen kunde inte hämtas.')); } }
  }
  async function prepareCreate(unit: GymTimplanUnit) {
    if (!underlag || busy || !unit.canPlan || !underlag.readiness.ready) return;
    const previous = unit.plans.find(p => ['utkast', 'forslag', 'atersand'].includes(p.status)) ?? unit.plans.find(p => p.status === 'faststalld') ?? null;
    const request: GymTimplanCreateRequest = { commandId: crypto.randomUUID(), sourcePlanId: underlag.source.planId,
      expectedSourceRevision: underlag.source.revision, expectedEducationRevision: underlag.source.educationRevision,
      unitId: unit.unitId, predecessorPlanId: previous?.id ?? null, expectedPredecessorRevision: previous?.revision ?? null };
    let preserved = 0;
    if (previous?.sourcePlanId) {
      const r = begin(); setBusy(true); setError(null);
      try {
        const old = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: previous.id }, r.signal), previous.id);
        if (!current(r.token)) return;
        if (old.revision !== previous.revision) { setBusy(false); await loadUnderlag(underlag.source.planId); setNotice('Timplanen ändrades. Välj åtgärden igen från det aktuella underlaget.'); return; }
        preserved = underlag.rows.filter(row => old.rows.some(before => before.key === row.key && before.points === row.points && before.pointTerms.every((p, i) => p === row.pointTerms[i]))).length;
      } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Tidigare timplan kunde inte jämföras. Läs om innan du skapar nästa version.')); return; }
      finally { if (current(r.token)) setBusy(false); }
    }
    setCreating({ request, schoolName: unit.schoolName, previousVersion: previous?.version ?? null, preserved,
      cleared: underlag.rows.length - preserved, error: null, uncertain: false, stale: false, mfa: false });
  }
  async function createPlan() {
    if (!creating || busy || saving.current || creating.stale) return;
    const own = creating, r = begin(); saving.current = true; setBusy(true); setCreating({ ...own, error: null, mfa: false }); let accepted = false;
    try {
      const reply = parseGymTimplanCreateReply(await api.post('/api/timplaner/gym/skapa', own.request, r.signal), own.request);
      accepted = true;
      if (!current(r.token)) return;
      const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: reply.id }, r.signal), reply.id);
      if (!current(r.token)) return;
      setPlan(fresh); setUnderlag(null); setCreating(null); opened.current({ kind: 'plan', id: fresh.id }, fresh.source.planId);
      setNotice(own.previousVersion ? `Version ${fresh.version} sparades. ${reply.carriedRows} oförändrade rader behöll sin tid; ${reply.resetRows} rader behöver fördelas.` : 'Timplansutkastet sparades. Fyll i skolans undervisningstid.');
    } catch (caught) {
      if (!current(r.token) || aborted(caught) || securityFailure(caught)) return;
      const explicit = caught instanceof ApiError && caught.hasExplicitCode;
      setCreating({ ...own, uncertain: accepted || !explicit || own.uncertain, stale: !accepted && explicit && caught.status === 409,
        mfa: caught instanceof ApiError && caught.code === 'mfa_required', error: explicit ? message(caught, 'Kunde inte skapa timplanen.') : 'Svaret kunde inte bekräftas. Försök igen med samma begäran för att hämta den sparade timplanen.' });
    } finally { saving.current = false; if (current(r.token)) setBusy(false); }
  }
  function edit(row: GymTimplanRow) {
    if (!plan || busy || !gymTimplanCanEdit(plan)) return;
    const original = plan.hours[row.key]; setNotice(null);
    setDraft({ row, original, values: original.map(value => value === null ? '' : String(value)), mode: 'edit', error: null, mfa: false });
  }
  async function refreshDraft(own: RowDraft, uncertain: boolean, token: number, signal: AbortSignal) {
    setPlan(null);
    try {
      const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: plan!.id }, signal), plan!.id);
      if (!current(token)) return;
      setPlan(fresh); setDraft(now => now && ({ ...now, mode: uncertain && sameValues(now.values, fresh.hours[own.row.key]) ? 'applied' : 'compare', mfa: false,
        error: 'Aktuell timplan har hämtats. Jämför den sparade tiden med din fördelning innan du sparar igen.' }));
    } catch (caught) {
      if (current(token) && !aborted(caught) && !securityFailure(caught)) setDraft(now => now && ({ ...now, mode: 'unread', mfa: false, error: 'Aktuell timplan kunde inte läsas. Din fördelning finns kvar. Läs om innan du sparar igen.' }));
    }
  }
  const retryPlanId = useRef<string | null>(null);
  async function reloadDraft() {
    if (!draft || busy || !retryPlanId.current) return;
    const r = begin(); setBusy(true);
    try {
      const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: retryPlanId.current }, r.signal), retryPlanId.current);
      if (current(r.token)) { setPlan(fresh); setDraft(now => now && ({ ...now, mode: 'compare', mfa: false, error: 'Aktuell timplan har hämtats. Jämför innan du sparar igen.' })); }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setDraft(now => now && ({ ...now, mode: 'unread', error: message(caught, 'Timplanen kunde inte läsas.') })); }
    finally { if (current(r.token)) setBusy(false); }
  }
  async function saveRow() {
    if (!plan || !draft || busy || saving.current || !gymTimplanCanEdit(plan) || !['edit', 'compare'].includes(draft.mode)) return;
    const values = editableValues(draft);
    if (!values) { setDraft({ ...draft, error: 'Ange hela timmar mellan 0 och 2 000, eller lämna fältet tomt.' }); return; }
    const own = draft, r = begin(), request = { planId: plan.id, expectedRevision: plan.revision, rowKey: draft.row.key, hours: values };
    retryPlanId.current = plan.id; saving.current = true; setBusy(true); setDraft({ ...own, error: null, mfa: false }); let accepted = false;
    try {
      parseGymTimplanRowReply(await api.post('/api/timplaner/gym/rad', request, r.signal), request); accepted = true;
      const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: plan.id }, r.signal), plan.id);
      if (!current(r.token)) return;
      setPlan(fresh); setDraft(now => !now || sameValues(now.values, values) ? null : { ...now, original: fresh.hours[now.row.key], mode: 'edit', error: null, mfa: false });
      setNotice('Timmarna sparades.');
    } catch (caught) {
      if (!current(r.token) || aborted(caught) || securityFailure(caught)) return;
      if (accepted || !(caught instanceof ApiError) || !caught.hasExplicitCode || caught.status === 409) await refreshDraft(own, accepted || !(caught instanceof ApiError) || !caught.hasExplicitCode, r.token, r.signal);
      else setDraft(now => now && ({ ...now, mode: 'edit', error: message(caught, 'Timmarna kunde inte sparas.'), mfa: caught.code === 'mfa_required' }));
    } finally { saving.current = false; if (current(r.token)) setBusy(false); }
  }
  function leave(action: () => void) { if (!busy && (!dirty || confirmDiscard())) { setDraft(null); setCreating(null); action(); } }
  const totals = plan ? gymTimplanTotals(plan) : null, editable = plan ? gymTimplanCanEdit(plan) : false;
  const visibleColumns = PROGRAMPLAN_TERMS.map((label, i) => ({ label, i })).filter(({ i }) => year === 'all' || Math.floor(i / 2) === Number(year));
  const visibleRows = plan?.rows.filter(row => !onlyMissing || totals!.missingRows.includes(row.key)) ?? [];

  return <section className="gym-timplan" data-testid="protected-gym-timplan-workspace" aria-busy={busy}>
    {error && <div role="alert" className="gt-error"><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => leave(() => void loadList(page))}>Välj utbildning igen</Button></div>}
    {notice && <output className="gt-notice">{notice}</output>}
    {!plan && !underlag && <><div className="gt-title"><Clock3 size={24}/><div><h1>Timplaner för gymnasiet</h1><p>Välj programram och fortsätt med skolans undervisningstid.</p></div></div>
      {busy ? <output>Hämtar underlag…</output> : list && <section aria-label="Välj utbildning för timplan">
        {!list.offerings.length && <p>Inga gymnasieutbildningar finns inom ditt aktuella uppdrag.</p>}
        <div className="gt-education-list">{list.offerings.map(education => <button key={education.id} type="button" onClick={() => void chooseEducation(education.id)} disabled={busy} aria-label={`Timplan för ${education.name}, ${education.cohort}`}><strong>{education.name}</strong><span>{education.cohort} · {education.schoolName}</span></button>)}</div>
        {list.count > 50 && <div className="gt-toolbar"><Button disabled={page === 1 || busy} variant="outline" onClick={() => void loadList(page - 1)}>Föregående</Button><span>Sida {page} av {Math.ceil(list.count / 50)}</span><Button disabled={page * 50 >= list.count || busy} variant="outline" onClick={() => void loadList(page + 1)}>Nästa</Button></div>}
      </section>}</>}
    {underlag && <>
      <Button variant="ghost" disabled={busy} onClick={() => leave(() => void loadList())}><ArrowLeft size={16}/>Alla gymnasieutbildningar</Button>
      <header className="gt-head"><div><h1>{underlag.source.education.name}</h1><p>{underlag.source.education.cohort} · Programplan version {underlag.source.version}, revision {underlag.source.revision} ({statusLabel[underlag.source.status].toLocaleLowerCase('sv')})</p></div>
        <Button variant="outline" disabled={busy} onClick={() => onProgramplan({ offeringId: underlag.source.offeringId, planId: underlag.source.planId })}><FileText size={16}/>Öppna programplan</Button></header>
      <p className="gt-explanation">Programplanens poäng och terminer är underlag. Varje skola fördelar sin undervisningstid i ett eget timplansutkast. Ett programutkast blir inte fastställt av detta.</p>
      {!underlag.readiness.ready && <output className="gt-source-missing"><strong>Programramen behöver kompletteras före timplaneringen.</strong><ul>{underlag.readiness.missing.map((reason, i) => <li key={i}>{reason}</li>)}</ul></output>}
      <section className="gt-schools" aria-label="Välj skola"><h2>Skolans timplan</h2><div className="gt-school-grid">{underlag.units.map(unit => {
        const open = unit.plans.find(p => ['utkast', 'forslag', 'atersand'].includes(p.status));
        const currentPlan = open ?? unit.plans.find(p => p.status === 'faststalld');
        const sourceMatches = !!currentPlan && currentPlan.sourcePlanId === underlag.source.planId && currentPlan.sourceRevision === underlag.source.revision;
        return <article className="gt-school" key={unit.unitId}><h3>{unit.schoolName}</h3>
          {currentPlan ? <p>{statusLabel[currentPlan.status]} · Version {currentPlan.version}{currentPlan.sourceVersion !== null ? ` · Programplan v${currentPlan.sourceVersion}` : ' · Äldre underlag'}</p> : <p>Ingen timplan skapad.</p>}
          {currentPlan?.sourcePlanId && <Button variant="outline" disabled={busy} aria-label={`Öppna timplan, version ${currentPlan.version}, ${unit.schoolName}`} onClick={() => void openPlan(currentPlan.id)}>Öppna timplan</Button>}
          {currentPlan && !currentPlan.sourcePlanId && <p className="gt-muted">Den äldre versionens timmar bevaras. Ett nytt utkast börjar utan kopierad tid.</p>}
          {unit.canPlan && underlag.readiness.ready && (!open || !sourceMatches) && <Button disabled={busy || !!open && open.status !== 'utkast'} aria-label={`${currentPlan ? 'Nytt' : 'Skapa'} timplansutkast för ${unit.schoolName}`} onClick={() => void prepareCreate(unit)}>{currentPlan ? 'Nytt timplansutkast' : 'Skapa timplansutkast'}</Button>}
          {!unit.canPlan && !currentPlan && <p className="gt-muted">Rektor eller skoladministratör förbereder skolans timplan.</p>}
          {unit.plans.filter(p => p.sourcePlanId && p.id !== currentPlan?.id).length > 0 && <details><summary>Tidigare versioner</summary>{unit.plans.filter(p => p.sourcePlanId && p.id !== currentPlan?.id).map(p => <button type="button" key={p.id} disabled={busy} onClick={() => void openPlan(p.id)} aria-label={`Öppna timplan, version ${p.version}, ${unit.schoolName}`}>Version {p.version} · {statusLabel[p.status]}</button>)}</details>}
        </article>;
      })}</div></section>
    </>}
    {plan && <>
      <div className="gt-toolbar"><Button variant="ghost" disabled={busy} onClick={() => leave(() => void loadUnderlag(plan.currentSource?.planId ?? plan.source.planId))}><ArrowLeft size={16}/>Skolans timplaner</Button><Button variant="outline" disabled={busy || !!draft} onClick={() => void openPlan(plan.id)}><RefreshCw size={16}/>Läs om</Button></div>
      <header className="gt-head"><div><h1>{plan.source.education.name}</h1><p>{plan.schoolName} · {plan.source.education.cohort}</p><span className="gt-state">{statusLabel[plan.status]} · Timplan version {plan.version}</span></div>
        <Button variant="outline" disabled={busy} onClick={() => leave(() => onProgramplan({ offeringId: plan.offeringId, planId: plan.source.planId }))}><FileText size={16}/>Öppna programplan</Button></header>
      <div className="gt-source-line"><button type="button" onClick={() => setShowSource(true)}><FileText size={15}/>Underlag: Programplan v{plan.source.version}, revision {plan.source.revision} ({statusLabel[plan.source.status].toLocaleLowerCase('sv')})</button><span>{editable ? 'Välj en rad för att fördela timmar' : plan.archived ? 'Utbildningen är arkiverad' : 'Läsvy'}</span></div>
      {plan.sourceChanged && <p className="gt-changed">Programplanen har ändrats. Den sparade tidsfördelningen använder fortfarande underlaget ovan. {plan.currentSource && <Button variant="link" disabled={busy} onClick={() => leave(() => void loadUnderlag(plan.currentSource!.planId))}>Välj nytt underlag</Button>}</p>}
      <div className="gt-year-totals">{[0, 1, 2].map(y => <div key={y}><span>Årskurs {y + 1}</span><strong>{totals!.terms[y * 2] + totals!.terms[y * 2 + 1]} <small>timmar</small></strong><span>HT {totals!.terms[y * 2]} · VT {totals!.terms[y * 2 + 1]}</span></div>)}</div>
      <div className="gt-toolbar"><p><strong>{totals!.total} timmar</strong> planerade · {totals!.missingRows.length ? `${totals!.missingRows.length} rader kvar att fördela` : 'alla aktiva terminer ifyllda'}</p><Button variant="outline" disabled={busy} onClick={() => setOnlyMissing(value => !value)}>{onlyMissing ? 'Visa alla rader' : 'Visa bara ofördelade'}</Button></div>
      <label className="gt-year-picker">Visa årskurs<select value={year} onChange={event => onYear(event.target.value)}><option value="all">Alla årskurser</option>{[0, 1, 2].map(y => <option key={y} value={y}>Årskurs {y + 1}</option>)}</select></label>
      <section className="gt-table-scroll" aria-label="Skolans undervisningstid"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla timmarna även i läsvyn.
        tabIndex={0}>
        <table className="gt-matrix"><caption>Undervisningstimmar per termin. Poängen under timmarna kommer från programplanen. ”Ofördelat” är ännu inte ifyllt; 0 är angivna noll timmar.</caption>
          <thead><tr><th scope="col">Ämne, nivå eller block</th><th scope="col">Poäng</th>{visibleColumns.map(({ label, i }) => <th key={i} scope="col">{label}</th>)}{editable && <th scope="col"><span className="sr-only">Åtgärd</span></th>}</tr></thead>
          <tbody>{visibleRows.map(row => <tr key={row.key} data-row-key={row.key}><th scope="row"><strong>{row.name}</strong><span>{row.levelName}</span></th><td>{row.points}</td>{visibleColumns.map(({ i }) => <td key={i}>{row.pointTerms[i] === 0 ? <span className="gt-inactive" aria-label="Ingår inte denna termin">—</span> : <><span className={plan.hours[row.key][i] === null ? 'gt-unallocated' : ''}>{plan.hours[row.key][i] ?? 'Ofördelat'}</span><small>{row.pointTerms[i]} p</small></>}</td>)}{editable && <td><Button size="sm" variant="ghost" disabled={busy} aria-label={`Ändra ${rowLabel(row)}`} onClick={() => edit(row)}><Pencil size={15}/><span>Ändra</span></Button></td>}</tr>)}</tbody>
        </table>{!visibleRows.length && <p className="gt-empty">Alla rader har angiven tid i de aktiva terminerna.</p>}
      </section>
      <p className="gt-boundary">Planerade timmar är ett separat utkast. Fastställande och kontroll av garanterad undervisningstid återstår.</p>
    </>}
    <Dialog open={showSource && !!plan} onOpenChange={setShowSource}><DialogContent className="gt-source-dialog"><DialogTitle>Sparat programunderlag</DialogTitle><DialogDescription>Programplan version {plan?.source.version}, revision {plan?.source.revision}. Detta är den frysta poängram som timplanen använder.</DialogDescription>
      {plan && <div className="gt-table-scroll"><table className="gt-matrix"><caption>{plan.source.education.name} · {plan.source.education.cohort} · {plan.rows.reduce((n, r) => n + r.points, 0)} poäng</caption><thead><tr><th>Ämne, nivå eller block</th>{PROGRAMPLAN_TERMS.map(term => <th key={term}>{term}</th>)}</tr></thead><tbody>{plan.rows.map(row => <tr key={row.key}><th>{rowLabel(row)}</th>{row.pointTerms.map((points, i) => <td key={i}>{points}</td>)}</tr>)}</tbody></table></div>}
      <Button variant="outline" onClick={() => setShowSource(false)}>Stäng underlaget</Button></DialogContent></Dialog>
    <Dialog open={!!creating} onOpenChange={open => { if (!open) leave(() => setCreating(null)); }}><DialogContent><DialogTitle>Skapa timplansutkast</DialogTitle><DialogDescription>{creating?.schoolName} · Programplan version {underlag?.source.version}, revision {underlag?.source.revision}. Poängramen kopieras som underlag; timmar anges separat.</DialogDescription>
      {creating && <>{creating.previousVersion !== null ? <p>Version {creating.previousVersion} bevaras. {creating.preserved} rader har samma poäng och terminsram och behåller sin tid. {creating.cleared} rader börjar ofördelade.</p> : <p>Alla undervisningstimmar börjar ofördelade.</p>}
        {creating.error && <p role="alert">{creating.error}</p>}{creating.mfa && <MfaStepUpNotice message={creating.error ?? 'Verifiering med engångskod krävs.'}/>}
        <div className="gt-dialog-actions"><Button variant="outline" disabled={busy} onClick={() => leave(() => setCreating(null))}>Avbryt</Button>{creating.stale ? <Button disabled={busy} onClick={() => { setCreating(null); void loadUnderlag(creating.request.sourcePlanId); }}>Läs aktuellt underlag</Button> : <Button disabled={busy} onClick={() => void createPlan()}>{busy ? 'Sparar…' : creating.uncertain ? 'Hämta sparad timplan' : 'Skapa timplansutkast'}</Button>}</div>
      </>}</DialogContent></Dialog>
    <Dialog open={!!draft} onOpenChange={open => { if (!open) leave(() => setDraft(null)); }}><DialogContent><DialogTitle>Fördela undervisningstid</DialogTitle><DialogDescription>{draft && rowLabel(draft.row)}. Timmar i terminerna där programplanen har poäng. Tomt fält betyder ännu ofördelat.</DialogDescription>
      {draft && <><div className="gt-hour-inputs">{PROGRAMPLAN_TERMS.map((term, i) => <label key={term}>{term}<input aria-label={`Timmar, ${term}`} inputMode="numeric" type="text" value={draft.values[i]} disabled={draft.row.pointTerms[i] === 0 || draft.mode === 'applied'} placeholder={draft.row.pointTerms[i] ? 'Ofördelat' : '—'} onChange={event => { const value = event.target.value; setDraft(now => now && ({ ...now, values: now.values.map((old, j) => j === i ? value : old), mode: now.mode === 'applied' ? 'edit' : now.mode, error: null })); }}/><small>{draft.row.pointTerms[i]} poäng i underlaget</small></label>)}</div>
        {draft.error && <p role="alert">{draft.error}</p>}{draft.mfa && <MfaStepUpNotice message={draft.error ?? 'Verifiering med engångskod krävs.'}/>}
        {draft.mode === 'compare' && plan && <div className="gt-compare"><strong>Sparat nu</strong><p>{PROGRAMPLAN_TERMS.map((term, i) => `${term}: ${plan.hours[draft.row.key][i] ?? 'ofördelat'}`).join(' · ')}</p></div>}
        {draft.mode === 'applied' && <p>Din fördelning är redan sparad.</p>}
        <div className="gt-dialog-actions"><Button variant="outline" disabled={busy} onClick={() => leave(() => setDraft(null))}>{draft.mode === 'applied' ? 'Stäng' : 'Avbryt'}</Button>{draft.mode === 'unread' ? <Button disabled={busy} onClick={() => void reloadDraft()}>Läs aktuell timplan</Button> : draft.mode !== 'applied' && <Button disabled={busy || !editable || !editableValues(draft)} onClick={() => void saveRow()}>{busy ? 'Sparar…' : draft.mode === 'compare' ? 'Spara min fördelning' : 'Spara timmar'}</Button>}</div>
      </>}</DialogContent></Dialog>
  </section>;
}
