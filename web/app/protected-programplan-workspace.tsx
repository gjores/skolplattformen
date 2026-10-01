'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, RefreshCw, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import { parseProgramplanOfferingList, parseProgramplanWorkspace, type ProgramplanOfferingList,
  type ProgramplanWorkspace, type ProgramplanVersionSummary } from '@/lib/programplan-workspace-contract.ts';
import { programplanCommand, programplanCommandReply, programplanDiagnostic, programplanOptions, programplanReference,
  programplanStatus, resolveLegacyProgramplan, sameProgramplanLevels, sameProgramplanPin, type ProgramplanDraft, type ProgramplanCommandKind } from '@/lib/protected-programplan.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import './protected-programplan.css';

type Props = { context: ActiveContext; epoch: number; onSessionLost: () => void };
const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
const titles = { create: 'Skapa programplansutkast', bind: 'Bind äldre utkast till underlag', replace: 'Ändra programfördjupning', clone: 'Kopiera till nytt programplansutkast' };

export default function ProtectedProgramplanWorkspace({ context, epoch, onSessionLost }: Props) {
  const [list, setList] = useState<ProgramplanOfferingList | null>(null), [page, setPage] = useState(1);
  const [workspace, setWorkspace] = useState<ProgramplanWorkspace | null>(null), [plan, setPlan] = useState<Programplan | null>(null);
  const [draft, setDraft] = useState<ProgramplanDraft | null>(null), [option, setOption] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null), saving = useRef(false);
  const dirty = !!draft && draft.mode !== 'applied' && (draft.kind !== 'replace' || draft.startedOn !== draft.originalStart
    || !sameProgramplanLevels(draft.refs, draft.originalRefs) || draft.mode !== 'edit');
  useUnsavedChanges(`programplan-${epoch}-${context.assignmentId}`, dirty || busy && draft !== null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; }, []);
  const begin = useCallback(() => { invalidate(); const c = new AbortController(); controller.current = c; return { token: generation.current, signal: c.signal }; }, [invalidate]);
  const current = useCallback((token: number) => mounted.current && generation.current === token, []);
  const securityFailure = useCallback((e: unknown) => {
    if (!(e instanceof ApiError) || !(e.status === 401 || e.status === 403 && e.code !== 'mfa_required')) return false;
    invalidate(); setList(null); setWorkspace(null); setPlan(null); setDraft(null); setError(null); setNotice(null); setBusy(false); onSessionLost(); return true;
  }, [invalidate, onSessionLost]);
  const loadList = useCallback(async (next: number) => {
    const r = begin(); setPage(next); setList(null); setWorkspace(null); setPlan(null); setDraft(null); setNotice(null); setError(null); setBusy(true);
    try { const value = parseProgramplanOfferingList(await api.post('/api/programplaner/lista', { page: next }, r.signal), next); if (current(r.token)) setList(value); }
    catch (e) { if (current(r.token) && !aborted(e) && !securityFailure(e)) setError(e instanceof ApiError ? e.message : 'Utbildningarna kunde inte hämtas. Försök igen.'); }
    finally { if (current(r.token)) setBusy(false); }
  }, [begin, current, securityFailure]);
  useEffect(() => { mounted.current = true; queueMicrotask(() => { if (mounted.current) void loadList(1); }); return () => { mounted.current = false; invalidate(); }; }, [loadList, invalidate]);
  async function readWorkspace(offeringId: string, versionPage: number, catalogId: string | null, signal: AbortSignal) {
    const input = { offeringId, versionPage, catalogId };
    return parseProgramplanWorkspace(await api.post('/api/programplaner/underlag', input, signal), input);
  }
  async function readPlan(id: string, offeringId: string, signal: AbortSignal) {
    const value = parseProgramplan(await api.post('/api/programplaner/lasa', { planId: id }, signal));
    if (value.id !== id || value.offeringId !== offeringId) throw new Error('Planens identitet avviker.');
    return value;
  }
  function assertMatchingSummary(fresh: ProgramplanWorkspace, selected: Programplan) {
    const summary = fresh.versions.find(p => p.id === selected.id);
    if (summary && (summary.revision !== selected.revision || summary.version !== selected.version || summary.status !== selected.status)) throw new Error('Versionsunderlaget ändrades under läsningen.');
  }
  async function openEducation(offeringId: string, versionPage = 1, catalogId: string | null = null, planId: string | null = null) {
    if (busy || dirty && !confirmDiscard()) return;
    const r = begin(); setWorkspace(null); setPlan(null); setDraft(null); setNotice(null); setError(null); setBusy(true);
    try {
      const fresh = await readWorkspace(offeringId, versionPage, catalogId, r.signal);
      const selected = planId ? await readPlan(planId, offeringId, r.signal) : null;
      if (selected) assertMatchingSummary(fresh, selected);
      if (current(r.token)) { setWorkspace(fresh); setPlan(selected); }
    } catch (e) { if (current(r.token) && !aborted(e) && !securityFailure(e)) setError(e instanceof ApiError ? e.message : 'Aktuellt programplansunderlag kunde inte läsas. Välj utbildningen igen.'); }
    finally { if (current(r.token)) setBusy(false); }
  }
  function openVersion(version: ProgramplanVersionSummary) {
    if (workspace) void openEducation(workspace.education.id, workspace.versionPage, version.catalogId, version.id);
  }
  const selectedVersion = workspace?.versions.find(v => v.id === plan?.id);
  const legacy = selectedVersion?.legacySpecialization ?? null;
  const options = workspace ? programplanOptions(workspace) : [];
  const legacyResolution = legacy ? resolveLegacyProgramplan(legacy, options) : null;
  const sourceReady = workspace?.catalog.status === 'selected' && !!workspace.catalog.program;
  const boundSourceMatches = !!plan?.basisReference && !!workspace?.catalog.program && workspace.catalog.catalogId === plan.catalogId
    && workspace.catalog.program.version === plan.basisReference.programRef.version;
  function edit(kind: ProgramplanCommandKind) {
    if (busy || !workspace || !sourceReady || !workspace.catalog.program || !workspace.catalog.catalogId) return;
    const source = kind === 'create' ? null : plan?.basisReference;
    if ((kind === 'replace' || kind === 'clone' && source) && !boundSourceMatches) return;
    if (kind !== 'create' && !plan || (kind === 'bind' || kind === 'clone' && !source) && (!legacyResolution || legacyResolution.problems.length)) return;
    const refs = source?.specializationRefs ?? (kind === 'create' ? [] : legacyResolution!.refs);
    const startedOn = source?.startedOn ?? '';
    setDraft({ kind, offeringId: workspace.education.id, educationName: workspace.education.name, schoolName: workspace.education.schoolName, planId: kind === 'create' ? null : plan!.id, expectedRevision: plan?.revision ?? 0,
      expectedLatestVersion: workspace.education.latestVersion, pin: { catalogId: workspace.catalog.catalogId,
        programRef: { code: workspace.catalog.program.code, version: workspace.catalog.program.version }, orientationCode: workspace.education.orientationCode, startedOn },
      startedOn, originalStart: startedOn, refs: refs.map(programplanReference), originalRefs: refs.map(programplanReference), sourceBound: !!source,
      legacyConfirmed: false, options, mode: 'edit', error: null, mfa: false, uncertain: false });
    setOption(''); setNotice(null);
  }
  function closeDraft() { if (busy || dirty && !confirmDiscard()) return; setDraft(null); }
  async function refreshDraft(own: ProgramplanDraft, token: number, signal: AbortSignal) {
    setWorkspace(null); setPlan(null); setDraft({ ...own, mode: 'refreshing', mfa: false });
    try {
      const fresh = await readWorkspace(own.offeringId, 1, own.pin.catalogId, signal);
      const candidateId = own.kind === 'bind' || own.kind === 'replace' ? own.planId : fresh.education.draftId;
      const candidate = candidateId ? await readPlan(candidateId, own.offeringId, signal) : null;
      if (candidate) assertMatchingSummary(fresh, candidate);
      if (!current(token)) return;
      const alreadyPresent = own.uncertain && candidate?.status === 'utkast' && sameProgramplanPin(candidate.basisReference,
        { ...own.pin, startedOn: own.startedOn, specializationRefs: own.refs }) && sameProgramplanLevels(candidate.basisReference!.specializationRefs, own.refs);
      setWorkspace(fresh); setPlan(candidate);
      setDraft({ ...own, mode: alreadyPresent ? 'applied' : 'compare', error: null, mfa: false });
    } catch (e) {
      if (current(token) && !aborted(e) && !securityFailure(e)) setDraft({ ...own, mode: 'refresh-failed', mfa: false,
        error: 'Aktuellt underlag kunde inte läsas. Dina uppgifter finns kvar. Läs om innan du väljer nästa åtgärd.' });
    }
  }
  async function reloadDraft() { if (!draft || busy) return; const r = begin(); setBusy(true); try { await refreshDraft(draft, r.token, r.signal); } finally { if (current(r.token)) setBusy(false); } }
  function retryCompatible(own: ProgramplanDraft) {
    if (!workspace || !plan || !['bind','replace'].includes(own.kind) || plan.id !== own.planId || plan.status !== 'utkast') return false;
    return own.kind === 'bind' ? !plan.basisReference : sameProgramplanPin(plan.basisReference, { ...own.pin, startedOn: own.startedOn, specializationRefs: own.refs });
  }
  async function saveDraft() {
    if (!draft || busy || saving.current || !['edit','compare'].includes(draft.mode)) return;
    let own = draft;
    if (own.mode === 'compare') {
      if (!retryCompatible(own)) return;
      own = { ...own, expectedRevision: plan!.revision, mode: 'edit' };
    }
    let command: ReturnType<typeof programplanCommand>;
    try { command = programplanCommand(own); }
    catch { setDraft({ ...own, error: 'Ange ett verkligt utbildningsstartdatum och bekräfta eventuella äldre val. Kontrollera underlaget.', mfa: false }); return; }
    saving.current = true;
    const r = begin(); setBusy(true); setDraft({ ...own, error: null, mfa: false }); setNotice(null);
    let accepted: Programplan | null = null;
    try {
      accepted = programplanCommandReply(await api.post(command.route, command.body, r.signal), own);
      const fresh = await readWorkspace(own.offeringId, 1, accepted.catalogId, r.signal);
      const read = await readPlan(accepted.id, own.offeringId, r.signal);
      assertMatchingSummary(fresh, read);
      if (!current(r.token)) return;
      setWorkspace(fresh); setPlan(read); setDraft(null); setNotice('Utkastet sparades. Visar senast hämtade programplan.');
    } catch (e) {
      if (!current(r.token) || aborted(e) || securityFailure(e)) return;
      if (accepted) await refreshDraft({ ...own, uncertain: true }, r.token, r.signal);
      else if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') await refreshDraft({ ...own, uncertain: false }, r.token, r.signal);
      else if (e instanceof ApiError && ['mfa_required','bad_request','audit_unavailable'].includes(e.code)) setDraft({ ...own, mode: 'edit', error: `Kunde inte spara. ${e.message}`, mfa: e.code === 'mfa_required' });
      else await refreshDraft({ ...own, uncertain: true }, r.token, r.signal);
    } finally { saving.current = false; if (current(r.token)) setBusy(false); }
  }
  function move(index: number, step: number) { if (!draft) return; const refs = [...draft.refs]; [refs[index],refs[index+step]] = [refs[index+step],refs[index]]; setDraft({ ...draft, refs, error: null }); }
  const editableRefs = draft?.kind === 'replace' || draft?.kind === 'create';
  const formLocked = busy || draft?.mode !== 'edit';
  return <section className="protected-programplan" data-testid="protected-programplan-workspace" aria-busy={busy}>
    <div className="pp-heading"><ListChecks aria-hidden="true"/><div><h1>Programplaner</h1><p>Gymnasieutbildning, versionsbundet underlag och utkast.</p></div></div>
    <p className="pp-boundary"><strong>Sparat utkast betyder inte fastställd utbildning.</strong> Källreferenser kan kontrolleras och utkast sparas. Fullständiga nationella ramar, alternativ och nivåföljd är ännu inte verifierade. Fastställande är stängt här. Poäng är gymnasiepoäng och omvandlas inte till undervisningstid.</p>
    {error && <div className="pp-alert" role="alert"><p>{error}</p><Button disabled={busy} variant="outline" onClick={()=>void loadList(page)}>Hämta utbildningarna igen</Button></div>}
    {notice && <output className="pp-notice">{notice}</output>}
    {!workspace && !draft && (busy ? <output>Hämtar programplansunderlag…</output> : list && <>
      <div className="pp-list-heading"><h2>Välj utbildning</h2><span>{list.count} utbildningar</span></div>
      {list.offerings.length === 0 ? <div className="pp-empty"><h3>Inga utbildningar på den här sidan</h3><p>{list.count ? 'Välj föregående sida.' : 'Ditt aktuella uppdrag omfattar inga gymnasieutbildningar.'}</p></div>
        : <div className="pp-choices">{list.offerings.map(o=><button type="button" key={o.id} onClick={()=>void openEducation(o.id)} className="pp-choice" aria-label={`Öppna utbildning ${o.name}, ${o.cohort}, ${o.schoolName}`}>
          <strong>{o.name}</strong><span>{o.schoolName} · {o.cohort}</span><span>{o.programCode} · {o.status === 'aktiv' ? 'Aktiv' : o.status === 'planerad' ? 'Planerad' : 'Avvecklas'} · {o.latestVersion ? `Senaste version ${o.latestVersion}` : 'Ingen programplan ännu'}{o.draftId ? ' · Utkast finns' : ''}</span>
        </button>)}</div>}
      {list.count > 50 && <nav className="pp-pagination" aria-label="Utbildningarnas sidor"><Button variant="outline" disabled={page===1||busy} onClick={()=>void loadList(page-1)}>Föregående utbildningar</Button><span>Sida {page} av {Math.ceil(list.count/50)}</span><Button variant="outline" disabled={page*50>=list.count||busy} onClick={()=>void loadList(page+1)}>Nästa utbildningar</Button></nav>}
    </>)}
    {workspace && <>
      <div className="pp-toolbar"><Button variant="ghost" disabled={busy} onClick={()=>{if(!dirty||confirmDiscard())void loadList(page);}}><ArrowLeft size={16}/>Alla utbildningar</Button><Button variant="outline" disabled={busy||!!draft} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage,workspace.catalog.catalogId,plan?.id??null)}><RefreshCw size={16}/>Läs om</Button></div>
      <div className="pp-education"><p>{workspace.education.schoolName} · {workspace.education.cohort}</p><h2>{workspace.education.name}</h2><p>{workspace.education.programCode} · Inriktning: {workspace.education.orientationCode??'Ingen'}{workspace.education.localCode&&` · Lokal kod: ${workspace.education.localCode}`}</p></div>
      <div className="pp-columns"><section aria-label="Programplanens versioner"><h3>Versioner</h3>{workspace.versionCount===0&&<p>Ingen programplan har skapats för utbildningen.</p>}
        <div className="pp-versions">{workspace.versions.map(v=><button type="button" key={v.id} className={`pp-version${plan?.id===v.id?' pp-selected':''}`} aria-pressed={plan?.id===v.id} disabled={busy} onClick={()=>openVersion(v)}><strong>Version {v.version} · {programplanStatus[v.status]}</strong><span>Revision {v.revision}{v.decidedOn&&` · Beslut ${v.decidedOn}`}</span><span>{v.catalogId?'Versionsbundet underlag':'Äldre, obundet underlag'}</span></button>)}</div>
        {workspace.versionCount>50&&<nav className="pp-pagination" aria-label="Versionernas sidor"><Button variant="outline" disabled={workspace.versionPage===1||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage-1,workspace.catalog.catalogId)}>Föregående versioner</Button><span>Sida {workspace.versionPage} av {Math.ceil(workspace.versionCount/50)}</span><Button variant="outline" disabled={workspace.versionPage*50>=workspace.versionCount||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage+1,workspace.catalog.catalogId)}>Nästa versioner</Button></nav>}
      </section><section className="pp-source" aria-label="Versionsbundet katalogunderlag"><h3>Katalogunderlag</h3>
        <label htmlFor="pp-catalog">Välj exakt katalog</label><select id="pp-catalog" value={workspace.catalog.catalogId??''} disabled={busy||!!plan?.basisReference} onChange={e=>void openEducation(workspace.education.id,workspace.versionPage,e.target.value||null,plan?.id??null)}><option value="">Välj katalogunderlag</option>{workspace.catalogs.map(c=><option value={c.catalogId} key={c.catalogId}>{c.source.fetched} · API {c.source.apiVersion} · katalog {c.catalogId.slice(-12)}</option>)}</select>
        {workspace.catalog.status==='unselected'&&<p>Välj själv vilket återfinnbart underlag utbildningen ska använda. Utbildningsstart anges separat när utkastet skapas eller binds.</p>}
        {workspace.catalog.status==='blocked'&&<p role="alert" className="pp-alert">{programplanDiagnostic(workspace.catalog.diagnostic??'catalog_unavailable')}</p>}
        {workspace.catalog.status==='selected'&&workspace.catalog.program&&<><p>{workspace.catalog.program.name} ({workspace.catalog.program.code}), programversion {workspace.catalog.program.version}</p><p>Gäller från {workspace.catalog.program.startDate??'Datum saknas'}{workspace.catalog.program.endDate&&` till ${workspace.catalog.program.endDate}`}{workspace.catalog.program.canceledDate&&` · Upphävt ${workspace.catalog.program.canceledDate}`}</p><p>Källa: <a href={workspace.catalog.source!.url} target="_blank" rel="noreferrer">Skolverkets källunderlag</a> · hämtat {workspace.catalog.source!.fetched}, API {workspace.catalog.source!.apiVersion} (öppnas i ny flik)</p><details><summary>Exakt katalogreferens</summary><p className="pp-code">{workspace.catalog.catalogId}</p></details></>}
      </section></div>
      {plan&&<section className="pp-plan" aria-label="Läst programplan"><h3>Version {plan.version} · {programplanStatus[plan.status]}</h3><p>Revision {plan.revision}{plan.decidedOn&&` · Beslut ${plan.decidedOn}`}</p>
        {plan.basisReference&&<p>Utbildningsstart: {plan.basisReference.startedOn} · programversion {plan.basisReference.programRef.version}. Grund, start och katalog är bundna till denna version.</p>}
        {plan.resolution.diagnostics.map((d,i)=><p key={i} className="pp-alert">{programplanDiagnostic(d.code)} {d.subjectCode??''} {d.itemCode??''}</p>)}
        <h4>{plan.basisReference?'Sparad programfördjupning':'Äldre sparade fördjupningsval'}</h4><ol className="pp-levels">{(plan.basisReference?.specializationRefs.map(r=>r.itemCode)??legacy??[]).map((code,i)=><li key={`${i}-${code}`}>{plan.basisReference&&(()=>{const r=plan.basisReference!.specializationRefs[i];const found=options.find(o=>o.itemCode===r.itemCode&&o.subjectCode===r.subjectCode&&o.subjectVersion===r.subjectVersion&&o.points===r.points);return found?<strong>{found.subjectName} · {found.name} · </strong>:null;})()}<span className="pp-code">{code||'(Tomt äldre värde)'}</span>{plan.basisReference&&<span> · ämnesversion {plan.basisReference.specializationRefs[i].subjectVersion} · {plan.basisReference.specializationRefs[i].points} poäng</span>}</li>)}</ol>
        {!plan.basisReference&&legacyResolution?.problems.length? <p className="pp-alert">Äldre val kan inte återfinnas entydigt i denna grund: {legacyResolution.problems.join(', ')}. Bindning eller kloning är stängd tills underlaget är löst.</p>:null}
        {plan.resolution.unresolvedChoices.length>0&&<div className="pp-unresolved"><h4>Underlag som återstår</h4>{plan.resolution.unresolvedChoices.map((c,i)=><p key={i}>{programplanDiagnostic(c.kind)} {c.subjectCode??''}{c.points!==undefined&&` · källblockets ${c.points} poäng`}</p>)}</div>}
      </section>}
      {workspace.catalog.status==='selected'&&workspace.catalog.program&&<details className="pp-blocks"><summary>Källans ämnesblock och alternativ</summary>{[
        {name:'Gymnasiegemensamma ämnen',subjects:workspace.catalog.program.foundation},{name:'Programgemensamma ämnen',subjects:workspace.catalog.program.programmeSpecific},
        ...workspace.catalog.program.orientations.filter(o=>o.code===workspace.education.orientationCode).map(o=>({name:`Inriktning ${o.name}`,subjects:o.subjects})),
      ].map(block=><section key={block.name}><h4>{block.name}</h4>{block.subjects.map(s=><div key={s.code} className="pp-block"><strong>{s.name} · {s.points} poäng{s.optional?' · Alternativ, inget automatiskt val':''}</strong><p>Ämne {s.code} · version {s.subjectVersion??'saknas'}</p>{s.levels.length?<ul>{s.levels.map(l=><li key={l.code}>{l.name} · {l.code} · {l.points} poäng</li>)}</ul>:<p>Nivåreferenser saknas i källan.</p>}</div>)}</section>)}<p>Blockpoäng är källuppgifter. Vyn räknar inte ut en generell poängram eller garanterad undervisningstid.</p></details>}
      <div className="pp-actions">
        {!workspace.education.draftId&&<Button disabled={busy||!sourceReady} onClick={()=>edit('create')}>Skapa utkast</Button>}
        {plan?.status==='utkast'&&!plan.basisReference&&<Button disabled={busy||!sourceReady||!legacyResolution||legacyResolution.problems.length>0} onClick={()=>edit('bind')}>Bind äldre utkast</Button>}
        {plan?.status==='utkast'&&plan.basisReference&&<Button disabled={busy||!boundSourceMatches} onClick={()=>edit('replace')}>Ändra programfördjupning</Button>}
        {plan&&['faststalld','ersatt'].includes(plan.status)&&!workspace.education.draftId&&<Button disabled={busy||!sourceReady||!!plan.basisReference&&!boundSourceMatches||!plan.basisReference&&(!legacyResolution||legacyResolution.problems.length>0)} onClick={()=>edit('clone')}>Kopiera till nytt utkast</Button>}
        {workspace.education.draftId&&!plan&&<p>Utbildningen har redan ett utkast. Välj dess version för att fortsätta.</p>}
        {!sourceReady&&<p>Välj tillgängligt katalogunderlag för att arbeta med utkast.</p>}
      </div>
    </>}
    <Dialog open={draft!==null} onOpenChange={open=>{if(!open)closeDraft();}}><DialogContent className="pp-dialog" showCloseButton={false} aria-modal="true">
      <DialogTitle>{draft?titles[draft.kind]:'Programplansutkast'}</DialogTitle><DialogDescription>Uppgifterna sparas först när du väljer att spara. Sparningen fastställer inte planen.</DialogDescription>
      {draft&&<>
        <p><strong>{draft.educationName}</strong> · {draft.schoolName}</p><p>{draft.pin.programRef.code} · programversion {draft.pin.programRef.version} · inriktning {draft.pin.orientationCode??'ingen'}</p><p className="pp-code">Katalog: {draft.pin.catalogId}</p>
        {draft.error&&!draft.mfa&&<output role="alert" className="pp-alert">{draft.error}</output>}
        {draft.mfa&&<MfaStepUpNotice message={draft.error??'Verifiering med engångskod krävs.'} detail="Dina uppgifter finns kvar här. Om du väljer verifiering lämnar du sidan; det osparade formuläret följer inte med."/>}
        {(draft.kind==='create'||draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<div className="pp-field"><label htmlFor="pp-start">Utbildningens exakta startdatum</label><input id="pp-start" type="date" value={draft.startedOn} disabled={formLocked} aria-describedby="pp-start-help" onChange={e=>setDraft({...draft,startedOn:e.target.value,error:null,mfa:false})}/><p id="pp-start-help">Ange det kända datumet från utbildningens underlag. Kulltext och startår väljer inte datum åt dig.</p></div>}
        {draft.sourceBound&&<p>Bundet utbildningsstartdatum: {draft.startedOn}. Katalog, start och programgrund ändras inte.</p>}
        <h4>{editableRefs?'Vald programfördjupning':'Förändringsfria val från källan'}</h4>
        {draft.refs.length===0&&<p>Inga fördjupningsnivåer valda.</p>}
        <ol className="pp-edit-levels">{draft.refs.map((r,i)=><li key={`${i}-${r.itemCode}`}><div><strong>{(()=>{const found=draft.options.find(o=>o.itemCode===r.itemCode&&o.subjectCode===r.subjectCode&&o.subjectVersion===r.subjectVersion&&o.points===r.points);return found?`${found.subjectName} · ${found.name}`:r.itemCode;})()}</strong><span>{r.itemCode} · ämnesversion {r.subjectVersion} · {r.points} poäng</span></div>{editableRefs&&<div className="pp-level-actions"><Button type="button" variant="outline" disabled={formLocked||i===0} aria-label={`Flytta upp ${r.itemCode}`} onClick={()=>move(i,-1)}><ArrowUp size={16}/></Button><Button type="button" variant="outline" disabled={formLocked||i===draft.refs.length-1} aria-label={`Flytta ned ${r.itemCode}`} onClick={()=>move(i,1)}><ArrowDown size={16}/></Button><Button type="button" variant="outline" disabled={formLocked} aria-label={`Ta bort ${r.itemCode}`} onClick={()=>setDraft({...draft,refs:draft.refs.filter((_,index)=>index!==i),error:null})}>Ta bort</Button></div>}</li>)}</ol>
        {editableRefs&&<div className="pp-field"><label htmlFor="pp-option">Lägg till fördjupningsnivå</label><select id="pp-option" value={option} disabled={formLocked} onChange={e=>setOption(e.target.value)}><option value="">Välj nivå</option>{draft.options.filter(o=>!draft.refs.some(r=>r.itemCode===o.itemCode)).map(o=><option key={o.itemCode} value={o.itemCode}>{o.subjectName} · {o.name} · {o.itemCode} · {o.points} poäng</option>)}</select><Button type="button" variant="outline" disabled={formLocked||!option||draft.refs.length>=200} onClick={()=>{const found=draft.options.find(o=>o.itemCode===option);if(found){setDraft({...draft,refs:[...draft.refs,programplanReference(found)],error:null});setOption('');}}}>Lägg till nivå</Button></div>}
        {(draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<label className="pp-check"><input type="checkbox" disabled={formLocked} checked={draft.legacyConfirmed} onChange={e=>setDraft({...draft,legacyConfirmed:e.target.checked,error:null})}/><span>Jag har kontrollerat att alla äldre val bevaras i samma ordning och att startdatum samt underlag gäller för utbildningen.</span></label>}
        {draft.mode==='refreshing'&&<output>Hämtar aktuellt underlag. Dina uppgifter behålls…</output>}
        {draft.mode==='compare'&&<div className="pp-comparison" aria-live="polite"><p>{draft.uncertain?'Sparandet kunde inte bekräftas. Aktuellt underlag har lästs om.':'Planen eller utbildningen ändrades av någon annan. Aktuellt underlag har lästs om.'}</p><p>Aktuell revision: {plan?.revision??'Ingen plan'} · ditt tidigare underlag: revision {draft.expectedRevision}.</p><p>Aktuella fördjupningsval: {plan?.basisReference?.specializationRefs.map(r=>r.itemCode).join(', ')||'Inga bundna val'}</p><p>Dina fördjupningsval: {draft.refs.map(r=>r.itemCode).join(', ')||'Inga val'}</p>{!retryCompatible(draft)&&<p>Detta kommando kan inte skickas igen automatiskt. Stäng dialogen och granska den aktuella versionen innan du väljer nästa åtgärd.</p>}</div>}
        {draft.mode==='applied'&&<output className="pp-notice">Ett aktuellt utkast innehåller redan samma bundna underlag och val. Inget nytt sparande behövs.</output>}
        <div className="pp-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeDraft}>{draft.mode==='applied'?'Stäng':'Avbryt'}</Button>{draft.mode==='refresh-failed'?<Button disabled={busy} onClick={()=>void reloadDraft()}>Läs om underlaget</Button>:['edit','compare'].includes(draft.mode)&&<Button disabled={busy||draft.mode==='compare'&&!retryCompatible(draft)} onClick={()=>void saveDraft()}>{busy?'Sparar…':draft.mode==='compare'?'Använd mina val':'Spara utkast'}</Button>}</div>
      </>}
    </DialogContent></Dialog>
  </section>;
}
