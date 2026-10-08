'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { canChangeTimplanCell, cellHours, parseProtectedTimplan, parseTimplanCellReply, parseTimplanHours, parseTimplanList, sameTimplanColumn,
  statusLabel, timplanColumns, timplanRows, unknownTimplanRows,
  type ProtectedTimplan, type TimplanList } from '@/lib/protected-timplan.ts';
import { parsePlanningOverview, type PlanningRow } from '@/lib/planning-year-contract.ts';
import type { OtherTimplanLocation } from '@/lib/protected-plan-location.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { usePlanningContext } from './planning-context';
import ProtectedPlanList from './protected-plan-list';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import { TimplanGuidance, TimplanEditGuidance } from './timplan-guidance';
import './protected-timplan.css';

type CellDraft = {
  weekly: boolean;
  planId: string; rowId: string; rowLabel: string; columnIndex: number; columnId: string; columnLabel: string;
  value: string; original: number; mode: 'draft' | 'refreshing' | 'refresh-failed' | 'compare' | 'applied';
  error: string | null; mfa: boolean; uncertain: boolean;
};
type Props = { context: ActiveContext; epoch: number; initialTarget: OtherTimplanLocation | null;
  onOpened: (target: OtherTimplanLocation | null) => void; onSessionLost: () => void };
type VerifiedMatrix = { target: OtherTimplanLocation; currentMatrix: boolean };
class MissingAnnualTarget extends Error {}
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export default function ProtectedTimplanWorkspace({ context, epoch, initialTarget, onOpened, onSessionLost }: Props) {
  const { setup, selection } = usePlanningContext();
  const [annualRow, setAnnualRow] = useState<PlanningRow | null>(null);
  const [currentMatrix, setCurrentMatrix] = useState(false);
  const [chooseCurrent, setChooseCurrent] = useState(false);
  const initialOpened = useRef(false);
  const verified = useRef<VerifiedMatrix | null>(null);
  const opened = useRef(onOpened);
  useLayoutEffect(() => { opened.current = onOpened; }, [onOpened]);
  const [list, setList] = useState<TimplanList | null>(null);
  const [page, setPage] = useState(1);
  const [plan, setPlan] = useState<ProtectedTimplan | null>(null);
  const [draft, setDraft] = useState<CellDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shownColumn, setShownColumn] = useState('all');
  const generation = useRef(0);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const dirty = draft !== null && draft.mode !== 'applied'
    && (draft.value !== String(draft.original) || draft.uncertain || draft.mode !== 'draft');
  const navigationBlocked = busy && draft !== null || draft?.mode === 'refreshing' || draft?.mode === 'refresh-failed';
  const draftRef = useRef(draft), busyRef = useRef(busy);
  useLayoutEffect(() => { draftRef.current = draft; busyRef.current = busy; }, [draft, busy]);
  const updateDraft = useCallback((next: CellDraft | null) => { draftRef.current = next; setDraft(next); }, []);
  const updateBusy = useCallback((next: boolean) => { busyRef.current = next; setBusy(next); }, []);
  const allowNavigation = useCallback(() => {
    const own = draftRef.current;
    if (saving.current || busyRef.current || own?.mode === 'refreshing' || own?.mode === 'refresh-failed') {
      setNotice('Invänta sparandet eller läs aktuell sparstatus innan du lämnar timplanen.'); return false;
    }
    return true;
  }, []);
  useUnsavedChanges(`timplan-${epoch}-${context.assignmentId}`, dirty || busy && draft !== null);
  useUnsavedChanges(`navigation-block:timplan-${epoch}-${context.assignmentId}`, navigationBlocked);

  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);
  const begin = useCallback(() => {
    invalidate();
    const abort = new AbortController(); controller.current = abort;
    return { token: generation.current, signal: abort.signal };
  }, [invalidate]);
  const current = useCallback((token: number) => active.current && generation.current === token, []);
  const securityFailure = useCallback((caught: unknown) => {
    if (!(caught instanceof ApiError) || !(caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) return false;
    invalidate(); verified.current = null; setList(null); setPlan(null); setAnnualRow(null); setCurrentMatrix(false); setChooseCurrent(false); updateDraft(null); setNotice(null); setError(null); updateBusy(false);
    onSessionLost();
    return true;
  }, [invalidate, onSessionLost, updateBusy, updateDraft]);

  // This lookup is independent of the displayed page and filters. It is an
  // actual complete annual collection; its strict parser rejects truncated rows.
  const readVerified = useCallback(async (expected: OtherTimplanLocation, explicitCurrent: boolean, signal: AbortSignal, recovering = false) => {
    if (!setup || !selection || setup.customerId !== context.customerId || selection.view !== 'timplan'
      || selection.schoolform !== expected.kind || context.function === 'administrator') throw new MissingAnnualTarget('Målet hör inte till det aktuella planeringsurvalet.');
    const matrix = parseProtectedTimplan(await api.post<unknown>('/api/timplaner/lasa', { planId: expected.id }, signal), expected.id);
    if (matrix.education.kind !== expected.kind || expected.unitId && matrix.unitId !== expected.unitId
      || expected.offeringId && matrix.offeringId !== expected.offeringId || expected.version !== undefined && matrix.version !== expected.version
      || selection.unitId !== null && matrix.unitId !== selection.unitId
      || !setup.units.some(unit => unit.unitId === matrix.unitId && unit.canRead[expected.kind]))
      throw new MissingAnnualTarget('Timplanens skola, utbildning, skolform eller version avviker från målet. Läs om årslistan.');
    const query = { ...selection, unitId: matrix.unitId, query: '', status: 'all' as const, cohortRelation: 'all' as const,
      archive: 'all' as const, grade: null, page: 1, selectionRevision: null };
    const overview = parsePlanningOverview(await api.post('/api/planering/oversikt', query, signal), query, setup);
    const membership = overview.rows.filter(row => row.customerId === context.customerId && row.unitId === matrix.unitId
      && row.offeringId === matrix.offeringId && row.schoolform === expected.kind);
    if (!membership.length) throw new MissingAnnualTarget('Utbildningen saknar årsrad för valt läsår. Ingen annan timversion har valts.');
    const candidates = membership.filter(row => row.plan?.id === matrix.id && row.plan.version === matrix.version
      && (expected.columnId == null || row.application?.columnId === expected.columnId));
    if (explicitCurrent) {
      if (!recovering && !['utkast', 'atersand'].includes(matrix.status))
        throw new MissingAnnualTarget('Aktuell utkastmatris kräver en uttryckligt vald öppen version inom det aktuella uppdraget.');
      // The selected annual version can still be an older class-bound plan.
      // Its row establishes education/school membership, never a binding for this draft.
      return { matrix, row: null, target: { kind: expected.kind, id: matrix.id, unitId: matrix.unitId,
        offeringId: matrix.offeringId, version: matrix.version }, currentMatrix: true };
    }
    if (candidates.length !== 1) throw new MissingAnnualTarget('Målet saknar en entydig årsrad för valt läsår. Välj en faktisk årsrad; ingen senaste version har valts.');
    const row = candidates[0];
    if (expected.kind === 'grundskola' && !row.application)
      throw new MissingAnnualTarget('Klassbindning saknas för valt läsår. Årets timmar är okända; ingen gammal matris visas som en ny årsbindning.');
    if (!row.plan || row.plan.revision !== matrix.revision || row.plan.status !== matrix.status
      || row.application && (row.application.schoolYear !== selection.schoolYear || row.application.planId !== matrix.id
        || row.application.version !== matrix.version))
      throw new MissingAnnualTarget('Årsbindningen och timmatrisen skiljer sig. Läs om innan du öppnar versionen.');
    return { matrix, row, target: { kind: expected.kind, id: matrix.id, unitId: matrix.unitId,
      offeringId: matrix.offeringId, version: matrix.version, columnId: (row.application?.columnId ?? null) as OtherTimplanLocation['columnId'] }, currentMatrix: false };
  }, [context.customerId, context.function, selection, setup]);

  const loadList = useCallback(() => {
    if (!allowNavigation()) return;
    invalidate(); verified.current = null; setPlan(null); updateDraft(null); setAnnualRow(null); setCurrentMatrix(false);
    setChooseCurrent(false); setList(null); setError(null); setNotice(null); opened.current(null);
  }, [allowNavigation, invalidate, updateDraft]);

  const loadCurrentList = useCallback(async (nextPage: number) => {
    if (!allowNavigation() || !setup || !selection) return;
    const request = begin(); verified.current = null;
    setPage(nextPage); setChooseCurrent(true); setList(null); setPlan(null); updateDraft(null); setAnnualRow(null); setCurrentMatrix(false);
    setError(null); setNotice(null); updateBusy(true);
    try {
      const result = parseTimplanList(await api.post<unknown>('/api/timplaner/lista', { page: nextPage }, request.signal), nextPage);
      if (current(request.token)) setList(result);
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (!securityFailure(caught)) setError(caught instanceof ApiError ? caught.message : 'Utkastmatriserna kunde inte hämtas. Försök igen.');
    } finally { if (current(request.token)) updateBusy(false); }
  }, [allowNavigation, begin, current, securityFailure, selection, setup, updateBusy, updateDraft]);

  const openPlan = useCallback(async (expected: OtherTimplanLocation, explicitCurrent = false) => {
    if (!allowNavigation()) return;
    const own = draftRef.current;
    if (own && own.mode !== 'applied' && (own.value !== String(own.original) || own.mode !== 'draft' || own.uncertain) && !confirmDiscard()) return;
    initialOpened.current = true;
    const request = begin(); verified.current = null;
    setPlan(null); updateDraft(null); setAnnualRow(null); setCurrentMatrix(false); setChooseCurrent(false);
    setNotice(null); setError(null); updateBusy(true); setShownColumn('all');
    try {
      const result = await readVerified(expected, explicitCurrent, request.signal);
      if (!current(request.token)) return;
      verified.current = { target: result.target, currentMatrix: result.currentMatrix };
      setPlan(result.matrix); setAnnualRow(result.row); setCurrentMatrix(result.currentMatrix); opened.current(result.target);
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (!securityFailure(caught)) {
        setError(caught instanceof MissingAnnualTarget ? caught.message : caught instanceof ApiError && caught.status !== 400 ? caught.message
          : 'Timplanens hela underlag saknas eller kan inte läsas. Okända timmar ersätts inte med noll. Läs om årslistan eller välj en annan faktisk årsrad.');
        if (caught instanceof MissingAnnualTarget) opened.current(null);
      }
    } finally { if (current(request.token)) updateBusy(false); }
  }, [allowNavigation, begin, current, readVerified, securityFailure, updateBusy, updateDraft]);

  useEffect(() => { active.current = true; return () => { active.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    if (initialOpened.current) return;
    initialOpened.current = true;
    queueMicrotask(() => { if (active.current && initialTarget) void openPlan(initialTarget); });
  }, [initialTarget, openPlan]);

  function chooseAnnualRow(row: PlanningRow) {
    if (!allowNavigation() || !setup || !selection) return;
    if (row.customerId !== context.customerId || row.schoolform !== selection.schoolform
      || !setup.units.some(unit => unit.unitId === row.unitId && unit.canRead[row.schoolform])
      || selection.unitId !== null && row.unitId !== selection.unitId || row.schoolform === 'gymnasium') {
      setError('Årsraden hör inte till det aktuella skol- och läsårsurvalet. Läs om listan.'); return;
    }
    if (!row.plan) { setNotice('Årsraden saknar timplan eller klassbindning för valt läsår. Ingen annan version har valts.'); return; }
    void openPlan({ kind: row.schoolform, id: row.plan.id, unitId: row.unitId, offeringId: row.offeringId,
      version: row.plan.version, columnId: (row.application?.columnId ?? null) as OtherTimplanLocation['columnId'] });
  }

  function closeDraft() {
    if (!allowNavigation() || dirty && !confirmDiscard()) return;
    updateDraft(null);
  }
  function edit(rowId: string, columnIndex: number) {
    if (!plan || !currentMatrix || !allowNavigation() || !canChangeTimplanCell(plan,context.function,rowId,columnIndex)) return;
    const value = cellHours(plan,rowId,columnIndex)!;
    setNotice(null);
    updateDraft({ weekly:plan.education.kind==='introduktionsprogram', planId:plan.id, rowId, rowLabel:timplanRows(plan).find(row=>row.id===rowId)!.label,
      columnIndex, columnId:timplanColumns(plan)[columnIndex].id, columnLabel:timplanColumns(plan)[columnIndex].label, value:String(value), original:value,
      mode:'draft', error:null, mfa:false, uncertain:false });
  }

  // Efter konflikt eller oklart transportsvar visas aldrig den gamla matrisen.
  // Ett nytt auditerat lässvar krävs innan användaren kan välja ett nytt kommando.
  async function refreshDraft(own: CellDraft, token: number, signal: AbortSignal) {
    setPlan(null); updateDraft({ ...own, mode:'refreshing', mfa:false });
    try {
      const proof = verified.current;
      if (!proof || !proof.currentMatrix || proof.target.id !== own.planId) throw new Error('Aktuell matris saknar kontrollerat mål.');
      const result = await readVerified(proof.target, true, signal, true), fresh = result.matrix;
      if (!current(token)) return;
      const actual = cellHours(fresh,own.rowId,own.columnIndex);
      const alreadyPresent = own.uncertain && sameTimplanColumn(fresh,own.columnIndex,own.columnId)
        && actual !== null && actual === parseTimplanHours(own.value);
      setPlan(fresh);
      updateDraft({ ...own, mode:alreadyPresent ? 'applied' : 'compare', mfa:false, error:null });
    } catch (caught) {
      if (!current(token) || aborted(caught)) return;
      if (!securityFailure(caught)) updateDraft({ ...own, mode:'refresh-failed', mfa:false,
        error:'Aktuell timplan kunde inte läsas. Din ändring finns kvar här. Läs om innan du väljer att spara igen.' });
    }
  }
  async function reloadDraft() {
    if (!draft || busy) return;
    const request=begin(); updateBusy(true);
    try { await refreshDraft(draft,request.token,request.signal); }
    finally { if(current(request.token)) updateBusy(false); }
  }

  async function saveDraft() {
    if (saving.current || busy || !currentMatrix || !draft || !plan || !['draft','compare'].includes(draft.mode)) return;
    const hours = parseTimplanHours(draft.value);
    if (hours === null) { updateDraft({...draft,error:'Ange ett heltal mellan 0 och 2 000.'}); return; }
    if (!sameTimplanColumn(plan,draft.columnIndex,draft.columnId) || !canChangeTimplanCell(plan,context.function,draft.rowId,draft.columnIndex)) {
      updateDraft({...draft,error:'Den aktuella cellen kan inte ändras. Stäng dialogen och kontrollera timplanens underlag.'}); return;
    }
    saving.current = true;
    const request=begin(), own={...draft,error:null,mfa:false}, expectedRevision=plan.revision;
    updateBusy(true); setNotice(null); updateDraft(own);
    let writeAccepted = false;
    try {
      const result = await api.post<unknown>('/api/timplaner/cell',
        {planId:plan.id,expectedRevision,rowId:own.rowId,columnIndex:own.columnIndex,hours},request.signal);
      if (!current(request.token)) return;
      parseTimplanCellReply(result, {planId:own.planId,rowId:own.rowId,expectedRevision,columnIndex:own.columnIndex,hours,columnCount:timplanColumns(plan).length});
      writeAccepted = true;
      const proof = verified.current;
      if (!proof || !proof.currentMatrix || proof.target.id !== own.planId) throw new Error('Aktuell matris saknar kontrollerat mål.');
      const readback = await readVerified(proof.target, true, request.signal, true), fresh = readback.matrix;
      if (!current(request.token)) return;
      setPlan(fresh); updateDraft(null); setNotice('Ändringen sparades. Visar senast hämtade timplan.');
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (securityFailure(caught)) return;
      if (writeAccepted) {
        await refreshDraft({...own,uncertain:true},request.token,request.signal);
      } else if (caught instanceof ApiError && caught.status===409 && caught.code==='conflict') {
        await refreshDraft({...own,uncertain:false},request.token,request.signal);
      } else if (caught instanceof ApiError && caught.hasExplicitCode && (caught.status===403 && caught.code==='mfa_required' || caught.status===400 && caught.code==='bad_request' || caught.status===500 && caught.code==='audit_unavailable')) {
        updateDraft({...own,mode:'draft',error:`Kunde inte spara. ${caught.message}`,mfa:caught.code==='mfa_required'});
      } else {
        await refreshDraft({...own,uncertain:true},request.token,request.signal);
      }
    } finally {
      saving.current=false;
      if (current(request.token)) updateBusy(false);
    }
  }

  const positional = plan?.education.kind === 'grundskola' && !currentMatrix;
  const storedWidth = plan ? Math.max(0, ...Object.values(plan.cells).map(values => values.length)) : 0;
  const columns = plan ? positional ? Array.from({ length: storedWidth }, (_, index) => ({ id: `position-${index}`, label: `Lagrad kolumn ${index + 1}` })) : timplanColumns(plan) : [];
  const displayedHours = (rowId: string, index: number) => plan ? positional ? plan.cells[rowId]?.[index] ?? null : cellHours(plan, rowId, index) : null;
  const rows = plan ? timplanRows(plan) : [];
  const unknownRows = plan ? unknownTimplanRows(plan) : [];
  const missingRows = plan ? rows.filter(row => positional ? !plan.cells[row.id] || plan.cells[row.id].length !== storedWidth : cellHours(plan,row.id,0)===null) : [];
  const visibleColumns = columns.map((column,index)=>({column,index})).filter(({index})=>shownColumn==='all'||shownColumn===String(index));
  const actual = plan && draft ? cellHours(plan,draft.rowId,draft.columnIndex) : null;
  const draftEditable = currentMatrix && plan && draft ? sameTimplanColumn(plan,draft.columnIndex,draft.columnId)
    && canChangeTimplanCell(plan,context.function,draft.rowId,draft.columnIndex) : false;
  const weekly = plan?.education.kind==='introduktionsprogram';

  return (
    <section className="protected-timplan" data-testid="protected-timplan-workspace" data-plan-id={plan?.id} data-plan-version={plan?.version} data-offering-id={plan?.offeringId} data-unit-id={plan?.unitId} aria-busy={busy}>
      <div className="pt-heading"><span className="pt-heading-icon"><Clock3 size={24}/></span><div><h1>Timplaner</h1><p>Undervisningstid för grundskola och introduktionsprogram.</p></div></div>
      {error && <div className="pt-alert" role="alert"><p>{error}</p><Button variant="outline" disabled={busy} onClick={()=>{if(chooseCurrent)void loadCurrentList(page);else if(initialTarget)void openPlan(initialTarget);else loadList();}}>Försök igen</Button></div>}
      {notice && <output className="pt-notice">{notice}</output>}
      {!plan && !draft && <>
        {busy && <output>Hämtar den valda timplanens årsrad och hela matris…</output>}
        {!chooseCurrent && <>
          {setup && selection && context.function !== 'administrator' && <Button variant="outline" disabled={busy}
            onClick={() => void loadCurrentList(1)}>Välj aktuell utkastmatris</Button>}
          <ProtectedPlanList disabled={busy} onSecurityFailure={securityFailure} onOpen={chooseAnnualRow}/>
        </>}
        {chooseCurrent && <section aria-label="Välj aktuell utkastmatris">
          <Button variant="ghost" disabled={busy} onClick={loadList}><ArrowLeft size={18}/>Alla timplaner</Button>
          <h2>Aktuella utkastmatriser</h2><p>Välj en uttrycklig version. Dagens årskurskolumner visas här; valet är inget historiskt årsbevis.</p>
          {list && selection && <><div className="pt-plan-list">{list.plans.filter(summary => summary.kind === selection?.schoolform
            && (selection.unitId === null || summary.unitId === selection.unitId)
            && setup?.units.some(unit => unit.unitId === summary.unitId && unit.canRead[summary.kind])
            && ['utkast', 'atersand'].includes(summary.status)).map(summary => <button type="button" key={summary.id} className="pt-plan-choice" disabled={busy}
              aria-label={`Öppna aktuell utkastmatris, ${summary.educationName}, ${summary.schoolName}, version ${summary.version}`}
              onClick={() => void openPlan({ kind: summary.kind, id: summary.id, unitId: summary.unitId, offeringId: summary.offeringId, version: summary.version }, true)}>
              <div><strong>{summary.educationName}</strong><span>{summary.schoolName} · {summary.cohort}</span></div><span>Version {summary.version} · {statusLabel[summary.status]}</span>
            </button>)}</div><p>Öppna versioner inom valt skolurval på denna sida av det befintliga matrisregistret. Inget val görs automatiskt.</p>
            {list.count > 50 && <nav className="pt-pagination" aria-label="Utkastmatrisernas sidor">
              <Button variant="outline" disabled={page === 1 || busy} onClick={() => void loadCurrentList(page - 1)}><ChevronLeft size={17}/>Föregående</Button>
              <span>Sida {page} av {Math.ceil(list.count / 50)}</span><Button variant="outline" disabled={page * 50 >= list.count || busy} onClick={() => void loadCurrentList(page + 1)}>Nästa<ChevronRight size={17}/></Button>
            </nav>}</>}
        </section>}
      </>}
      {plan && <>
        <div className="pt-toolbar"><Button variant="ghost" disabled={busy||navigationBlocked} onClick={()=>{if(allowNavigation()&&(!dirty||confirmDiscard()))loadList();}}><ArrowLeft size={18}/>Alla timplaner</Button>
          <Button variant="outline" disabled={busy||Boolean(draft)} onClick={()=>void openPlan({kind:plan.education.kind as OtherTimplanLocation['kind'],id:plan.id,unitId:plan.unitId,offeringId:plan.offeringId,version:plan.version,columnId:(annualRow?.application?.columnId??null) as OtherTimplanLocation['columnId']},currentMatrix)}><RefreshCw size={16}/>Läs om</Button></div>
        <div className="pt-plan-header"><div><p>{plan.schoolName} · {plan.education.cohort}</p><h2>{plan.education.name}</h2><p>Version {plan.version} <span className={`pt-status pt-status-${plan.status}`}>{statusLabel[plan.status]}</span></p></div>
          <span className="pt-read-state">{context.function==='huvudman'?'Läsvy för huvudman':!currentMatrix?'Årsunderlag i läsvy':!['utkast','atersand'].includes(plan.status)?'Versionen är låst för ändring':'Välj en timcell för att ändra'}</span></div>
        <div className="pt-basis"><strong>Underlag</strong><p>{plan.basis||'Inget underlag angivet.'}</p>{plan.decidedOn&&<span>Beslutsdatum: {plan.decidedOn}</span>}</div>
        {currentMatrix ? <output className="pt-year-context" data-testid="other-current-matrix">{['utkast','atersand'].includes(plan.status)?'Aktuell utkastmatris':'Aktuell låst matris'} · uttryckligt vald version {plan.version}. Nuvarande årskurskolumner visas. Den här matrisen visar ingen historisk årsbindning för {selection && planningYearLabel(selection.schoolYear)}.</output>
          : <div className="pt-year-context" data-testid="other-year-binding"><strong>{selection && planningYearLabel(selection.schoolYear)} · Version {plan.version}</strong>
            <p>{annualRow?.application ? `${annualRow.classes.length ? 'Klassbunden årsreferens' : 'Äldre årsreferens utan verifierad klassrelation'}${annualRow.application.columnId ? ` · Åk ${annualRow.application.columnId.slice(2)}` : ''}`
              : 'Planeringsunderlag. Ingen verifierad klassbindning för året.'}</p>
            {annualRow?.classes.length ? <p>{annualRow.classes.length} verifierade klassreferenser till samma ram.</p> : null}
            {weekly && <p>Veckoram. Kalender och individuell fördelning saknas; inga årstimmar beräknas.</p>}
          </div>}
        {positional && <output className="pt-alert" data-testid="other-column-map-unknown">Den historiska kolumnkartan är okänd. Hela timplanen visar lagrade positioner; dagens årskursordning används inte som historiskt bevis. Årets timmar och riktad årscellsändring är därför okända/spärrade.</output>}
        {!currentMatrix && setup && selection && ['utkast','atersand'].includes(plan.status) && <Button variant="outline" disabled={busy || Boolean(draft)}
          onClick={() => void openPlan({ kind:plan.education.kind as OtherTimplanLocation['kind'],id:plan.id,unitId:plan.unitId,offeringId:plan.offeringId,version:plan.version },true)}>Visa aktuell utkastmatris</Button>}
        <p className="pt-boundary">{weekly?'Timmar per vecka.':positional?'Timmar i lagrade positionskolumner.':'Timmar per årskurs i aktuell matris.'} Här visas lagrad undervisningstid.</p>
        <TimplanGuidance weekly={weekly}/>
        {(unknownRows.length>0||missingRows.length>0) && <div className="pt-alert" role="alert">
          {missingRows.length>0&&<p>Vissa ämnesrader saknas eller har fel antal kolumner. De visas som ”Saknas” och kan inte ändras här.</p>}
          {unknownRows.length>0&&<p>Underlaget innehåller okända rader: {unknownRows.join(', ')}. Redigering är stängd tills underlaget har kontrollerats.</p>}
        </div>}
        {columns.length>1&&<label className="pt-column-picker">{positional?'Visa lagrad position':'Visa årskurs'}<select value={shownColumn} disabled={busy||navigationBlocked} onChange={event=>{if(allowNavigation())setShownColumn(event.target.value);}}><option value="all">{positional?'Visa hela timplanen':'Alla årskurser'}</option>{columns.map((column,index)=><option key={column.id} value={index}>{column.label}</option>)}</select></label>}
        {columns.length>0 ? <section className="pt-matrix-scroll" aria-label="Undervisningstid per ämne"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla tabellen även i huvudmannens läsvy.
          tabIndex={0}>
          <table className="pt-matrix"><caption>{weekly?'Undervisningstid i timmar per vecka':positional?'Hela timplanen – lagrade positioner, okänd historisk årskurskarta':'Aktuell utkastmatris – undervisningstid i timmar per årskurs'}</caption>
            <thead><tr><th scope="col">Ämne</th>{visibleColumns.map(({column})=><th scope="col" key={column.id}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.label}</th>{visibleColumns.map(({column,index})=>{
              const value=displayedHours(row.id,index),editable=currentMatrix && canChangeTimplanCell(plan,context.function,row.id,index);
              return <td key={column.id}>{value===null?<span className="pt-missing">Saknas</span>:editable?<button type="button" className="pt-cell" disabled={busy} onClick={()=>edit(row.id,index)} aria-label={`Ändra ${row.label}, ${column.label}, ${value} timmar`}><span>{value}</span><Pencil size={13} aria-hidden="true"/></button>:<span className="pt-cell-read">{value}</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </section>:<p>Matrisen saknar lagrade kolumner. Inga timmar antas eller fylls i.</p>}
      </>}
      <Dialog open={draft!==null} onOpenChange={open=>{if(!open)closeDraft();}}>
        <DialogContent className="pt-dialog" aria-modal="true" showCloseButton={false}>
          <DialogTitle>Ändra undervisningstid</DialogTitle>
          <DialogDescription>{draft?.rowLabel} · {draft?.columnLabel}. Ändringen sparas först när du väljer att spara.</DialogDescription>
          {draft && <>
            <TimplanEditGuidance weekly={draft.weekly}/>
            {draft.error && !draft.mfa && <output role="alert" className="pt-alert">{draft.error}</output>}
            {draft.mfa && <MfaStepUpNotice message={draft.error||'Verifiering med engångskod krävs.'} detail="Din osparade ändring finns kvar här. Om du väljer verifiering lämnar du sidan och ändringen följer inte med."/>}
            {draft.mode==='refreshing'&&<output>Hämtar aktuell timplan. Din ändring behålls i dialogen…</output>}
            {draft.mode==='compare'&&<div className="pt-comparison" aria-live="polite"><p>{draft.uncertain?'Det gick inte att bekräfta sparandet. Timplanen har lästs om.':'Timplanen ändrades av någon annan. Timplanen har lästs om.'}</p><div><span>Aktuellt värde<strong>{plan && !sameTimplanColumn(plan,draft.columnIndex,draft.columnId)?'Ändrat underlag':actual===null?'Saknas':actual}</strong></span><span>Ditt värde<strong>{draft.value}</strong></span></div><p>Kontrollera skillnaden innan du väljer att använda din ändring.</p></div>}
            {draft.mode==='applied'&&<output className="pt-notice">Den aktuella timplanen innehåller redan ditt värde. Inget nytt sparande behövs.</output>}
            {draft.mode==='draft'&&<div className="pt-hours-field"><label htmlFor="pt-hours">{weekly?'Timmar per vecka':'Timmar'}</label><input id="pt-hours" type="text" inputMode="numeric" aria-describedby="pt-hours-help" value={draft.value} disabled={busy}
              onChange={event=>updateDraft({...draft,value:event.target.value,error:null,mfa:false})}/><span id="pt-hours-help">Sparat värde: {draft.original}. Heltal mellan 0 och 2 000.</span></div>}
            {draft.mode==='draft' && <output>{busy?'Sparar ändringen…':dirty?'Osparad ändring':'Ingen ändring ännu'}</output>}
            {draft.mode==='refresh-failed'&&<p>Ditt värde: <strong>{draft.value}</strong>. Den tidigare matrisen är dold tills aktuell timplan kan hämtas.</p>}
            {draft.mode==='compare'&&!draftEditable&&<p className="pt-alert">Den aktuella cellen är inte längre öppen för ändring.</p>}
            <div className="pt-dialog-actions"><Button variant="outline" disabled={busy||navigationBlocked} onClick={closeDraft}>{draft.mode==='applied'?'Stäng':'Avbryt'}</Button>
              {draft.mode==='refresh-failed'?<Button disabled={busy} onClick={()=>void reloadDraft()}>Läs om planen</Button>
                :['draft','compare'].includes(draft.mode)&&<Button disabled={busy||!draftEditable} onClick={()=>void saveDraft()}>{busy?'Sparar…':draft.mode==='compare'?'Använd min ändring':'Spara ändring'}</Button>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
