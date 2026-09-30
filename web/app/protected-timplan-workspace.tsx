'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { canChangeTimplanCell, cellHours, parseProtectedTimplan, parseTimplanCellReply, parseTimplanHours, parseTimplanList, sameTimplanColumn,
  statusLabel, timplanColumns, timplanRows, unknownTimplanRows,
  type ProtectedTimplan, type TimplanList } from '@/lib/protected-timplan.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import './protected-timplan.css';

type CellDraft = {
  planId: string; rowId: string; rowLabel: string; columnIndex: number; columnId: string; columnLabel: string;
  value: string; original: number; mode: 'draft' | 'refreshing' | 'refresh-failed' | 'compare' | 'applied';
  error: string | null; mfa: boolean; uncertain: boolean;
};
type Props = { context: ActiveContext; epoch: number; onSessionLost: () => void };
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export default function ProtectedTimplanWorkspace({ context, epoch, onSessionLost }: Props) {
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
  useUnsavedChanges(`timplan-${epoch}-${context.assignmentId}`, dirty || busy && draft !== null);

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
    invalidate(); setList(null); setPlan(null); setDraft(null); setNotice(null); setError(null); setBusy(false);
    onSessionLost();
    return true;
  }, [invalidate, onSessionLost]);

  const loadList = useCallback(async (nextPage: number) => {
    const request = begin();
    setPage(nextPage); setList(null); setPlan(null); setDraft(null); setError(null); setNotice(null); setBusy(true);
    try {
      const result = parseTimplanList(await api.post<unknown>('/api/timplaner/lista', { page: nextPage }, request.signal), nextPage);
      if (current(request.token)) setList(result);
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (!securityFailure(caught)) setError(caught instanceof ApiError ? caught.message : 'Timplanerna kunde inte hämtas. Försök igen.');
    } finally { if (current(request.token)) setBusy(false); }
  }, [begin, current, securityFailure]);

  useEffect(() => {
    active.current = true;
    queueMicrotask(() => { if (active.current) void loadList(1); });
    return () => { active.current = false; invalidate(); };
  }, [loadList, invalidate]);

  async function openPlan(planId: string) {
    if (busy || dirty && !confirmDiscard()) return;
    const request = begin();
    setPlan(null); setDraft(null); setNotice(null); setError(null); setBusy(true); setShownColumn('all');
    try {
      const result = parseProtectedTimplan(await api.post<unknown>('/api/timplaner/lasa', { planId }, request.signal), planId);
      if (current(request.token)) setPlan(result);
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (!securityFailure(caught)) setError(caught instanceof ApiError ? caught.message : 'Timplanen kunde inte hämtas. Välj den igen.');
    } finally { if (current(request.token)) setBusy(false); }
  }

  function closeDraft() {
    if (busy || dirty && !confirmDiscard()) return;
    setDraft(null);
  }
  function edit(rowId: string, columnIndex: number) {
    if (!plan || busy || !canChangeTimplanCell(plan,context.function,rowId,columnIndex)) return;
    const value = cellHours(plan,rowId,columnIndex)!;
    setNotice(null);
    setDraft({ planId:plan.id, rowId, rowLabel:timplanRows(plan).find(row=>row.id===rowId)!.label,
      columnIndex, columnId:timplanColumns(plan)[columnIndex].id, columnLabel:timplanColumns(plan)[columnIndex].label, value:String(value), original:value,
      mode:'draft', error:null, mfa:false, uncertain:false });
  }

  // Efter konflikt eller oklart transportsvar visas aldrig den gamla matrisen.
  // Ett nytt auditerat lässvar krävs innan användaren kan välja ett nytt kommando.
  async function refreshDraft(own: CellDraft, token: number, signal: AbortSignal) {
    setPlan(null); setDraft({ ...own, mode:'refreshing', mfa:false });
    try {
      const fresh = parseProtectedTimplan(await api.post<unknown>('/api/timplaner/lasa', {planId:own.planId},signal),own.planId);
      if (!current(token)) return;
      const actual = cellHours(fresh,own.rowId,own.columnIndex);
      const alreadyPresent = own.uncertain && sameTimplanColumn(fresh,own.columnIndex,own.columnId)
        && actual !== null && actual === parseTimplanHours(own.value);
      setPlan(fresh);
      setDraft({ ...own, mode:alreadyPresent ? 'applied' : 'compare', mfa:false, error:null });
    } catch (caught) {
      if (!current(token) || aborted(caught)) return;
      if (!securityFailure(caught)) setDraft({ ...own, mode:'refresh-failed', mfa:false,
        error:'Aktuell timplan kunde inte läsas. Din ändring finns kvar här. Läs om innan du väljer att spara igen.' });
    }
  }
  async function reloadDraft() {
    if (!draft || busy) return;
    const request=begin(); setBusy(true);
    try { await refreshDraft(draft,request.token,request.signal); }
    finally { if(current(request.token)) setBusy(false); }
  }

  async function saveDraft() {
    if (saving.current || busy || !draft || !plan || !['draft','compare'].includes(draft.mode)) return;
    const hours = parseTimplanHours(draft.value);
    if (hours === null) { setDraft({...draft,error:'Ange ett heltal mellan 0 och 2 000.'}); return; }
    if (!sameTimplanColumn(plan,draft.columnIndex,draft.columnId) || !canChangeTimplanCell(plan,context.function,draft.rowId,draft.columnIndex)) {
      setDraft({...draft,error:'Den aktuella cellen kan inte ändras. Stäng dialogen och kontrollera timplanens underlag.'}); return;
    }
    saving.current = true;
    const request=begin(), own={...draft,error:null,mfa:false}, expectedRevision=plan.revision;
    setBusy(true); setNotice(null); setDraft(own);
    let writeAccepted = false;
    try {
      const result = await api.post<unknown>('/api/timplaner/cell',
        {planId:plan.id,expectedRevision,rowId:own.rowId,columnIndex:own.columnIndex,hours},request.signal);
      if (!current(request.token)) return;
      parseTimplanCellReply(result, {planId:own.planId,rowId:own.rowId,expectedRevision,columnIndex:own.columnIndex,hours,columnCount:timplanColumns(plan).length});
      writeAccepted = true;
      const fresh = parseProtectedTimplan(await api.post<unknown>('/api/timplaner/lasa',{planId:own.planId},request.signal),own.planId);
      if (!current(request.token)) return;
      setPlan(fresh); setDraft(null); setNotice('Ändringen sparades. Visar senast hämtade timplan.');
    } catch (caught) {
      if (!current(request.token) || aborted(caught)) return;
      if (securityFailure(caught)) return;
      if (writeAccepted) {
        await refreshDraft({...own,uncertain:true},request.token,request.signal);
      } else if (caught instanceof ApiError && caught.status===409 && caught.code==='conflict') {
        await refreshDraft({...own,uncertain:false},request.token,request.signal);
      } else if (caught instanceof ApiError && ['mfa_required','bad_request','audit_unavailable'].includes(caught.code)) {
        setDraft({...own,mode:'draft',error:`Kunde inte spara. ${caught.message}`,mfa:caught.code==='mfa_required'});
      } else {
        await refreshDraft({...own,uncertain:true},request.token,request.signal);
      }
    } finally {
      saving.current=false;
      if (current(request.token)) setBusy(false);
    }
  }

  const columns = plan ? timplanColumns(plan) : [];
  const rows = plan ? timplanRows(plan) : [];
  const unknownRows = plan ? unknownTimplanRows(plan) : [];
  const missingRows = plan ? rows.filter(row => cellHours(plan,row.id,0)===null) : [];
  const visibleColumns = columns.map((column,index)=>({column,index})).filter(({index})=>shownColumn==='all'||shownColumn===String(index));
  const actual = plan && draft ? cellHours(plan,draft.rowId,draft.columnIndex) : null;
  const draftEditable = plan && draft ? sameTimplanColumn(plan,draft.columnIndex,draft.columnId)
    && canChangeTimplanCell(plan,context.function,draft.rowId,draft.columnIndex) : false;
  const weekly = plan?.education.kind==='introduktionsprogram';

  return (
    <section className="protected-timplan" data-testid="protected-timplan-workspace" aria-busy={busy}>
      <div className="pt-heading"><span className="pt-heading-icon"><Clock3 size={24}/></span><div><h1>Timplaner</h1><p>Undervisningstid för grundskola och introduktionsprogram.</p></div></div>
      {error && <div className="pt-alert" role="alert"><p>{error}</p><Button variant="outline" disabled={busy} onClick={()=>void loadList(page)}>Försök igen</Button></div>}
      {notice && <output className="pt-notice">{notice}</output>}
      {!plan && !draft && <>
        {busy ? <output>Hämtar timplaner…</output> : list && <>
          <div className="pt-list-heading"><h2>Välj timplan</h2><span>{list.count} {list.count===1?'timplan':'timplaner'}</span></div>
          {list.plans.length===0 ? <div className="pt-empty"><h3>Inga timplaner på den här sidan</h3><p>{list.count===0?'Ditt aktuella uppdrag omfattar inga befintliga timplaner för grundskola eller introduktionsprogram.':'Välj föregående sida.'}</p></div>
            : <div className="pt-plan-list">{list.plans.map(summary=><button type="button" key={summary.id} className="pt-plan-choice" onClick={()=>void openPlan(summary.id)}
              aria-label={`Öppna ${summary.educationName}, ${summary.cohort}, version ${summary.version}`}>
              <div><strong>{summary.educationName}</strong><span>{summary.schoolName} · {summary.cohort}</span></div>
              <div className="pt-plan-state"><span className={`pt-status pt-status-${summary.status}`}>{statusLabel[summary.status]}</span><span>Version {summary.version}</span></div>
            </button>)}</div>}
          {list.count>50 && <nav className="pt-pagination" aria-label="Timplanernas sidor">
            <Button variant="outline" disabled={page===1||busy} onClick={()=>void loadList(page-1)}><ChevronLeft size={17}/>Föregående</Button>
            <span>Sida {page} av {Math.ceil(list.count/50)}</span>
            <Button variant="outline" disabled={page*50>=list.count||busy} onClick={()=>void loadList(page+1)}>Nästa<ChevronRight size={17}/></Button>
          </nav>}
        </>}
      </>}
      {plan && <>
        <div className="pt-toolbar"><Button variant="ghost" disabled={busy} onClick={()=>{if(!dirty||confirmDiscard())void loadList(page);}}><ArrowLeft size={18}/>Alla timplaner</Button>
          <Button variant="outline" disabled={busy||Boolean(draft)} onClick={()=>void openPlan(plan.id)}><RefreshCw size={16}/>Läs om</Button></div>
        <div className="pt-plan-header"><div><p>{plan.schoolName} · {plan.education.cohort}</p><h2>{plan.education.name}</h2><p>Version {plan.version} <span className={`pt-status pt-status-${plan.status}`}>{statusLabel[plan.status]}</span></p></div>
          <span className="pt-read-state">{context.function==='huvudman'?'Läsvy för huvudman':!['utkast','atersand'].includes(plan.status)?'Versionen är låst för ändring':'Välj en timcell för att ändra'}</span></div>
        <div className="pt-basis"><strong>Underlag</strong><p>{plan.basis||'Inget underlag angivet.'}</p>{plan.decidedOn&&<span>Beslutsdatum: {plan.decidedOn}</span>}</div>
        <p className="pt-boundary">{weekly?'Timmar per vecka.':'Timmar per årskurs.'} Här visas lagrad undervisningstid. Totalram och villkor för beslut prövas inte i den här vyn.</p>
        {(unknownRows.length>0||missingRows.length>0) && <div className="pt-alert" role="alert">
          {missingRows.length>0&&<p>Vissa ämnesrader saknas eller har fel antal kolumner. De visas som ”Saknas” och kan inte ändras här.</p>}
          {unknownRows.length>0&&<p>Underlaget innehåller okända rader: {unknownRows.join(', ')}. Redigering är stängd tills underlaget har kontrollerats.</p>}
        </div>}
        {columns.length>1&&<label className="pt-column-picker">Visa årskurs<select value={shownColumn} onChange={event=>setShownColumn(event.target.value)}><option value="all">Alla årskurser</option>{columns.map((column,index)=><option key={column.id} value={index}>{column.label}</option>)}</select></label>}
        {columns.length>0 ? <section className="pt-matrix-scroll" aria-label="Undervisningstid per ämne"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla tabellen även i huvudmannens läsvy.
          tabIndex={0}>
          <table className="pt-matrix"><caption>{weekly?'Undervisningstid i timmar per vecka':'Undervisningstid i timmar per årskurs'}</caption>
            <thead><tr><th scope="col">Ämne</th>{visibleColumns.map(({column})=><th scope="col" key={column.id}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.label}</th>{visibleColumns.map(({column,index})=>{
              const value=cellHours(plan,row.id,index),editable=canChangeTimplanCell(plan,context.function,row.id,index);
              return <td key={column.id}>{value===null?<span className="pt-missing">Saknas</span>:editable?<button type="button" className="pt-cell" disabled={busy} onClick={()=>edit(row.id,index)} aria-label={`Ändra ${row.label}, ${column.label}, ${value} timmar`}><span>{value}</span><Pencil size={13} aria-hidden="true"/></button>:<span className="pt-cell-read">{value}</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </section>:<p>Den här skolformens timplansunderlag öppnas i ett senare steg.</p>}
      </>}
      <Dialog open={draft!==null} onOpenChange={open=>{if(!open)closeDraft();}}>
        <DialogContent className="pt-dialog" showCloseButton={false}>
          <DialogTitle>Ändra undervisningstid</DialogTitle>
          <DialogDescription>{draft?.rowLabel} · {draft?.columnLabel}. Ändringen sparas först när du väljer att spara.</DialogDescription>
          {draft && <>
            {draft.error && !draft.mfa && <output role="alert" className="pt-alert">{draft.error}</output>}
            {draft.mfa && <MfaStepUpNotice message={draft.error||'Verifiering med engångskod krävs.'} detail="Din osparade ändring finns kvar här. Om du väljer verifiering lämnar du sidan och ändringen följer inte med."/>}
            {draft.mode==='refreshing'&&<output>Hämtar aktuell timplan. Din ändring behålls i dialogen…</output>}
            {draft.mode==='compare'&&<div className="pt-comparison" aria-live="polite"><p>{draft.uncertain?'Det gick inte att bekräfta sparandet. Timplanen har lästs om.':'Timplanen ändrades av någon annan. Timplanen har lästs om.'}</p><div><span>Aktuellt värde<strong>{plan && !sameTimplanColumn(plan,draft.columnIndex,draft.columnId)?'Ändrat underlag':actual===null?'Saknas':actual}</strong></span><span>Ditt värde<strong>{draft.value}</strong></span></div><p>Kontrollera skillnaden innan du väljer att använda din ändring.</p></div>}
            {draft.mode==='applied'&&<output className="pt-notice">Den aktuella timplanen innehåller redan ditt värde. Inget nytt sparande behövs.</output>}
            {draft.mode==='draft'&&<label className="pt-hours-field">{weekly?'Timmar per vecka':'Timmar'}<input type="text" inputMode="numeric" value={draft.value} disabled={busy}
              onChange={event=>setDraft({...draft,value:event.target.value,error:null,mfa:false})}/><span>Sparat värde: {draft.original}. Heltal mellan 0 och 2 000.</span></label>}
            {draft.mode==='draft' && <output>{busy?'Sparar ändringen…':dirty?'Osparad ändring':'Ingen ändring ännu'}</output>}
            {draft.mode==='refresh-failed'&&<p>Ditt värde: <strong>{draft.value}</strong>. Den tidigare matrisen är dold tills aktuell timplan kan hämtas.</p>}
            {draft.mode==='compare'&&!draftEditable&&<p className="pt-alert">Den aktuella cellen är inte längre öppen för ändring.</p>}
            <div className="pt-dialog-actions"><Button variant="outline" disabled={busy} onClick={closeDraft}>{draft.mode==='applied'?'Stäng':'Avbryt'}</Button>
              {draft.mode==='refresh-failed'?<Button disabled={busy} onClick={()=>void reloadDraft()}>Läs om planen</Button>
                :['draft','compare'].includes(draft.mode)&&<Button disabled={busy||!draftEditable} onClick={()=>void saveDraft()}>{busy?'Sparar…':draft.mode==='compare'?'Använd min ändring':'Spara ändring'}</Button>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
