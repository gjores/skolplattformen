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
  programplanStatus, resolveLegacyProgramplan, sameProgramplanLevels, sameProgramplanPin, programplanSelectedId, assertProgramplanSummary, programplanLevelName, type ProgramplanDraft, type ProgramplanCommandKind } from '@/lib/protected-programplan.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import './protected-programplan.css';

type Props = { context: ActiveContext; epoch: number; onSessionLost: () => void };
const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
const titles = { create: 'Skapa programplan', bind: 'Gör utkastet redo för ändring', replace: 'Ändra fördjupning', clone: 'Skapa ny version' };

export default function ProtectedProgramplanWorkspace({ context, epoch, onSessionLost }: Props) {
  const [list, setList] = useState<ProgramplanOfferingList | null>(null), [page, setPage] = useState(1);
  const [workspace, setWorkspace] = useState<ProgramplanWorkspace | null>(null), [plan, setPlan] = useState<Programplan | null>(null);
  const [planSummary, setPlanSummary] = useState<ProgramplanVersionSummary | null>(null);
  const [preparation, setPreparation] = useState<{kind: ProgramplanCommandKind; catalogId: string | null} | null>(null);
  const [draft, setDraft] = useState<ProgramplanDraft | null>(null), [option, setOption] = useState('');
  const [reviewing, setReviewing] = useState(false), [levelSearch, setLevelSearch] = useState('');
  const reviewRef = useRef<HTMLElement | null>(null);
  useEffect(()=>{if(!reviewing)return;const frame=requestAnimationFrame(()=>reviewRef.current?.focus());return()=>cancelAnimationFrame(frame);},[reviewing]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null), saving = useRef(false);
  const dirty = !!preparation?.catalogId || !!draft && draft.mode !== 'applied' && (draft.kind !== 'replace' || draft.startedOn !== draft.originalStart
    || !sameProgramplanLevels(draft.refs, draft.originalRefs) || draft.mode !== 'edit');
  useUnsavedChanges(`programplan-${epoch}-${context.assignmentId}`, dirty || busy && draft !== null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; }, []);
  const begin = useCallback(() => { invalidate(); const c = new AbortController(); controller.current = c; return { token: generation.current, signal: c.signal }; }, [invalidate]);
  const current = useCallback((token: number) => mounted.current && generation.current === token, []);
  const securityFailure = useCallback((e: unknown) => {
    if (!(e instanceof ApiError) || !(e.status === 401 || e.status === 403 && e.code !== 'mfa_required')) return false;
    invalidate(); setList(null); setWorkspace(null); setPlan(null); setPlanSummary(null); setPreparation(null); setDraft(null); setError(null); setNotice(null); setBusy(false); onSessionLost(); return true;
  }, [invalidate, onSessionLost]);
  const loadList = useCallback(async (next: number) => {
    const r = begin(); setPage(next); setList(null); setWorkspace(null); setPlan(null); setPlanSummary(null); setPreparation(null); setDraft(null); setNotice(null); setError(null); setBusy(true);
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
  async function readSelection(offeringId: string, versionPage: number, catalogId: string | null, explicitId: string | null,
    signal: AbortSignal, automatic = true, initial?: ProgramplanWorkspace) {
    let fresh = initial ?? await readWorkspace(offeringId, versionPage, catalogId, signal);
    const initialEducation = fresh.education, count = fresh.versionCount;
    const matchingWorkspace = (next: ProgramplanWorkspace) => {
      if (JSON.stringify(next.education) !== JSON.stringify(initialEducation) || next.versionCount !== count) {
        throw new Error('Utbildningens planer ändrades under läsningen.');
      }
    };
    const summaries = [...fresh.versions], pages = new Set([fresh.versionPage]);
    async function findSummary(matches: (v: ProgramplanVersionSummary) => boolean): Promise<ProgramplanVersionSummary | null> {
      for (let next = 1; next <= Math.ceil(count / 50); next++) {
        const found = summaries.filter(matches);
        if (found.length > 1) throw new Error('Planens identitet är tvetydig.');
        if (found.length === 1) return found[0];
        if (pages.has(next)) continue;
        const extra = await readWorkspace(offeringId, next, fresh.catalog.catalogId, signal);
        matchingWorkspace(extra); pages.add(next); summaries.push(...extra.versions);
      }
      const found = summaries.filter(matches);
      if (found.length > 1) throw new Error('Planens identitet är tvetydig.');
      return found[0] ?? null;
    }
    if (!explicitId && automatic && !fresh.education.draftId && fresh.education.latestVersion > 0) {
      await findSummary(v => v.version === fresh.education.latestVersion);
    }
    const id = automatic ? programplanSelectedId(fresh, explicitId, summaries) : explicitId;
    if (!id) return { fresh, selected: null, summary: null };
    const selected = await readPlan(id, offeringId, signal);
    if (selected.basisReference && fresh.catalog.catalogId !== selected.catalogId) {
      const pinned = await readWorkspace(offeringId, versionPage, selected.catalogId, signal);
      matchingWorkspace(pinned); fresh = pinned; summaries.splice(0, summaries.length, ...pinned.versions); pages.clear(); pages.add(pinned.versionPage);
    }
    const summary = await findSummary(v => v.id === selected.id);
    assertProgramplanSummary(summary, selected);
    if (selected.unitId !== fresh.education.unitId || selected.version > fresh.education.latestVersion
      || selected.education.programCode !== fresh.education.programCode || selected.education.orientationCode !== fresh.education.orientationCode) {
      throw new Error('Utbildningens aktuella uppgifter avviker från planen.');
    }
    if (fresh.education.draftId === selected.id && selected.status !== 'utkast') throw new Error('Utkastets status ändrades.');
    return { fresh, selected, summary };
  }
  async function openEducation(offeringId: string, versionPage = 1, catalogId: string | null = null,
    planId: string | null = null, keepPreparation: ProgramplanCommandKind | null = null) {
    if (busy || !keepPreparation && dirty && !confirmDiscard()) return;
    const r = begin();
    if (!keepPreparation) { setWorkspace(null); setPlan(null); setPlanSummary(null); setDraft(null); }
    setNotice(null); setError(null);
    setPreparation(keepPreparation ? {kind: keepPreparation, catalogId} : null); setBusy(true);
    try {
      const {fresh, selected, summary} = await readSelection(offeringId, versionPage, catalogId, planId, r.signal);
      if (current(r.token)) { setWorkspace(fresh); setPlan(selected); setPlanSummary(summary); }
    } catch (e) { if (current(r.token) && !aborted(e) && !securityFailure(e)) setError(e instanceof ApiError ? e.message : 'Aktuellt programplansunderlag kunde inte läsas. Välj utbildningen igen.'); }
    finally { if (current(r.token)) setBusy(false); }
  }
  function openVersion(version: ProgramplanVersionSummary) {
    if (workspace) void openEducation(workspace.education.id, workspace.versionPage, version.catalogId, version.id);
  }
  const legacy = planSummary?.legacySpecialization ?? null;
  const options = workspace ? programplanOptions(workspace) : [];
  const legacyResolution = legacy ? resolveLegacyProgramplan(legacy, options) : null;
  const sourceReady = workspace?.catalog.status === 'selected' && !!workspace.catalog.program;
  const boundSourceMatches = !!plan?.basisReference && !!workspace?.catalog.program && workspace.catalog.catalogId === plan.catalogId
    && workspace.catalog.program.version === plan.basisReference.programRef.version;
  function edit(kind: ProgramplanCommandKind) {
    if (busy || preparation && error || !workspace || !sourceReady || !workspace.catalog.program || !workspace.catalog.catalogId) return;
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
    setOption(''); setLevelSearch(''); setReviewing(false); setNotice(null); setPreparation(null);
  }
  function closeDraft() { if (busy || dirty && !confirmDiscard()) return; setDraft(null); }
  async function refreshDraft(own: ProgramplanDraft, token: number, signal: AbortSignal) {
    setWorkspace(null); setPlan(null); setPlanSummary(null); setDraft({ ...own, mode: 'refreshing', mfa: false });
    try {
      const fresh = await readWorkspace(own.offeringId, 1, own.pin.catalogId, signal);
      const candidateId = own.kind === 'bind' || own.kind === 'replace' ? own.planId : fresh.education.draftId;
      const snapshot = await readSelection(own.offeringId, 1, own.pin.catalogId, candidateId, signal, false, fresh);
      const candidate = snapshot.selected;
      if (!current(token)) return;
      const alreadyPresent = own.uncertain && candidate?.status === 'utkast' && sameProgramplanPin(candidate.basisReference,
        { ...own.pin, startedOn: own.startedOn, specializationRefs: own.refs }) && sameProgramplanLevels(candidate.basisReference!.specializationRefs, own.refs);
      setWorkspace(snapshot.fresh); setPlan(candidate); setPlanSummary(snapshot.summary);
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
    if (draft.mode === 'edit' && !reviewing) return;
    let own = draft;
    if (own.mode === 'compare') {
      if (!retryCompatible(own)) return;
      own = { ...own, expectedRevision: plan!.revision, mode: 'edit' };
    }
    let command: ReturnType<typeof programplanCommand>;
    try { command = programplanCommand(own); }
    catch { setReviewing(false); setDraft({ ...own, error: 'Ange ett verkligt utbildningsstartdatum och bekräfta eventuella äldre val. Kontrollera underlaget.', mfa: false }); return; }
    saving.current = true;
    const r = begin(); setBusy(true); setDraft({ ...own, error: null, mfa: false }); setNotice(null);
    let accepted: Programplan | null = null;
    try {
      accepted = programplanCommandReply(await api.post(command.route, command.body, r.signal), own);
      const fresh = await readWorkspace(own.offeringId, 1, accepted.catalogId, r.signal);
      const snapshot = await readSelection(own.offeringId, 1, accepted.catalogId, accepted.id, r.signal, false, fresh);
      const read = snapshot.selected!;
      if (!current(r.token)) return;
      setWorkspace(snapshot.fresh); setPlan(read); setPlanSummary(snapshot.summary); setDraft(null); setNotice('Utkastet sparades. Du kan nu läsa de sparade valen nedan eller fortsätta med Ändra fördjupning. Planen är fortfarande ett utkast.');
    } catch (e) {
      if (!current(r.token) || aborted(e) || securityFailure(e)) return;
      if (accepted) await refreshDraft({ ...own, uncertain: true }, r.token, r.signal);
      else if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') await refreshDraft({ ...own, uncertain: false }, r.token, r.signal);
      else if (e instanceof ApiError && e.hasExplicitCode && (e.status === 403 && e.code === 'mfa_required' || e.status === 400 && e.code === 'bad_request' || e.status === 500 && e.code === 'audit_unavailable')) {
        if(e.code==='bad_request')setReviewing(false);
        setDraft({ ...own, mode: 'edit', error: `Kunde inte spara. ${e.message}`, mfa: e.code === 'mfa_required' });
      }
      else await refreshDraft({ ...own, uncertain: true }, r.token, r.signal);
    } finally { saving.current = false; if (current(r.token)) setBusy(false); }
  }
  function move(index: number, step: number) { if (!draft) return; const refs = [...draft.refs]; [refs[index],refs[index+step]] = [refs[index+step],refs[index]]; setDraft({ ...draft, refs, error: null }); }
  const editableRefs = draft?.kind === 'replace' || draft?.kind === 'create';
  const formLocked = busy || draft?.mode !== 'edit';
  const nextKind: ProgramplanCommandKind = !plan ? 'create' : plan.status === 'utkast' ? plan.basisReference ? 'replace' : 'bind' : 'clone';
  const anotherDraft = !!workspace?.education.draftId && workspace.education.draftId !== plan?.id;
  const preparationBlocked = !preparation ? null : preparation.kind === 'create' && workspace?.education.draftId
    ? 'Utbildningen har nu ett utkast. Avbryt förberedelsen och öppna utkastet.'
    : preparation.kind === 'bind' && (plan?.status !== 'utkast' || !!plan.basisReference)
      ? 'Utkastets grund eller status har ändrats. Avbryt förberedelsen och granska den aktuella planen.'
      : preparation.kind === 'clone' && workspace?.education.draftId
        ? 'Utbildningen har nu ett utkast. Avbryt förberedelsen och öppna utkastet innan du skapar en ny version.' : null;
  function nextAction() {
    if (anotherDraft && workspace) { void openEducation(workspace.education.id, 1, null, workspace.education.draftId); return; }
    if (nextKind === 'replace' || nextKind === 'clone' && plan?.basisReference) edit(nextKind);
    else setPreparation({kind: nextKind, catalogId: null});
  }
  function changeGuideCatalog(catalogId: string) {
    if (workspace && preparation) void openEducation(workspace.education.id, workspace.versionPage, catalogId || null, plan?.id ?? null, preparation.kind);
  }
  function cancelPreparation() { if (dirty && !confirmDiscard()) return; setPreparation(null); }
  const referenceBlocks = workspace?.catalog.status === 'selected' && workspace.catalog.program ? [
    {name:'Gymnasiegemensamma ämnen', subjects:workspace.catalog.program.foundation},
    {name:'Programgemensamma ämnen', subjects:workspace.catalog.program.programmeSpecific},
    ...workspace.catalog.program.orientations.filter(o=>o.code===workspace.education.orientationCode).map(o=>({name:`Inriktning: ${o.name}`,subjects:o.subjects})),
  ] : [];
  const namedChoices = (refs: ProgramplanDraft['refs'], choices = options) => refs.length ? refs.map(r => `${programplanLevelName(r,choices)} (${r.points} poäng)`).join(', ') : 'Inga val';
  const availableOptions = draft?.options.filter(o=>!draft.refs.some(r=>r.itemCode===o.itemCode)) ?? [];
  const filteredOptions = availableOptions.filter(o=>`${o.subjectName} ${o.name} ${o.itemCode}`.toLocaleLowerCase('sv').includes(levelSearch.trim().toLocaleLowerCase('sv')));
  const chosenOption = availableOptions.find(o=>o.itemCode===option);
  return <section className="protected-programplan" data-testid="protected-programplan-workspace" aria-busy={busy}>
    <div className="pp-heading"><ListChecks aria-hidden="true"/><div><h1>Programplaner</h1><p>Se utbildningens ämnen och välj vilka fördjupningsnivåer som ska finnas i utkastet.</p></div></div>
    {error && <div className="pp-alert" role="alert"><p>{error}</p><Button disabled={busy} variant="outline" onClick={()=>{if(!dirty||confirmDiscard())void loadList(page);}}>Hämta utbildningarna igen</Button></div>}
    {notice && <output className="pp-notice">{notice}</output>}
    {!workspace && !draft && (busy ? <output>Hämtar programplansunderlag…</output> : list && <>
      <section className="pp-explainer" aria-label="Så börjar du"><h2>Vad ska eleverna läsa?</h2><p>Här planerar du för en hel utbildning och elevkull. Programunderlaget visar de gemensamma ämnena. Du väljer utbildningens programfördjupning.</p><ol className="pp-journey"><li><strong>Välj utbildning</strong><span>Vilken skola, vilket program och vilken elevkull?</span></li><li><strong>Förbered utkastet</strong><span>Kontrollera underlag och startdatum. Välj fördjupningsnivåer.</span></li><li><strong>Granska och spara</strong><span>Se precis vad som sparas innan du bekräftar.</span></li></ol></section>
      <div className="pp-list-heading"><h2>Välj utbildning</h2><span>{list.count} utbildningar</span></div>
      {list.offerings.length === 0 ? <div className="pp-empty"><h3>Inga utbildningar på den här sidan</h3><p>{list.count ? 'Välj föregående sida.' : 'Ditt aktuella uppdrag omfattar inga gymnasieutbildningar.'}</p></div>
        : <div className="pp-choices">{list.offerings.map(o=><button type="button" key={o.id} onClick={()=>void openEducation(o.id)} className="pp-choice" aria-label={`Öppna utbildning ${o.name}, ${o.cohort}, ${o.schoolName}`}>
          <strong>{o.name}</strong><span>{o.schoolName} · {o.cohort}</span><span>{o.programCode} · {o.status === 'aktiv' ? 'Aktiv' : o.status === 'planerad' ? 'Planerad' : 'Avvecklas'} · {o.latestVersion ? `Senaste version ${o.latestVersion}` : 'Ingen programplan ännu'}{o.draftId ? ' · Utkast finns' : ''}</span>
        </button>)}</div>}
      {list.count > 50 && <nav className="pp-pagination" aria-label="Utbildningarnas sidor"><Button variant="outline" disabled={page===1||busy} onClick={()=>void loadList(page-1)}>Föregående utbildningar</Button><span>Sida {page} av {Math.ceil(list.count/50)}</span><Button variant="outline" disabled={page*50>=list.count||busy} onClick={()=>void loadList(page+1)}>Nästa utbildningar</Button></nav>}
    </>)}
    {workspace&&<>
      <div className="pp-toolbar"><Button variant="ghost" disabled={busy} onClick={()=>{if(!dirty||confirmDiscard())void loadList(page);}}><ArrowLeft size={16}/>Alla utbildningar</Button><Button variant="outline" disabled={busy||!!draft||!!preparation} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage,workspace.catalog.catalogId,plan?.id??null)}><RefreshCw size={16}/>Läs om</Button></div>
      <header className="pp-education"><p>{workspace.education.schoolName} · {workspace.education.cohort??'Elevkull saknas'}</p><h2>{workspace.education.name}</h2>
        <p>{workspace.catalog.program?.name??workspace.education.programCode}{workspace.catalog.program?.orientations.find(o=>o.code===workspace.education.orientationCode)&&` · ${workspace.catalog.program.orientations.find(o=>o.code===workspace.education.orientationCode)!.name}`}</p>
        <p className="pp-status">{plan ? plan.status==='utkast' ? 'Utkast — kan inte fastställas här ännu' : `${programplanStatus[plan.status]} · läses utan ändring` : 'Ingen programplan ännu'}{plan&&` · Version ${plan.version}`}</p>
      </header>
      <section className="pp-next" aria-label="Nästa steg">
        <h3>{preparation ? `1. Välj underlag för ${workspace.education.name}` : 'Nästa steg'}</h3>
        {!preparation&&<>
          <p>{anotherDraft?'Utbildningen har ett utkast som du kan fortsätta med.':nextKind==='create'?'Börja med ett utkast för den här utbildningen.':nextKind==='bind'?'Det äldre utkastets val finns kvar. Välj underlag och startdatum innan du ändrar fördjupningen.':nextKind==='replace'?'Lägg till, ta bort eller flytta dina fördjupningsnivåer. Utbildningens grundämnen ändras inte här.':'Skapa ett nytt utkast. Den här versionen och dess tidigare beslut behålls.'}</p>
          <Button disabled={busy||!anotherDraft&&(nextKind==='replace'||nextKind==='clone'&&!!plan?.basisReference)&&!boundSourceMatches} onClick={nextAction}>{anotherDraft?'Öppna utkastet':titles[nextKind]}</Button>
          {(nextKind==='replace'||nextKind==='clone'&&!!plan?.basisReference)&&!boundSourceMatches&&<p role="alert">Den här versionens sparade underlag kunde inte återfinnas. Läs om innan du ändrar eller skapar en ny version.</p>}
        </>}
        {preparation&&<>
          <p>Underlaget är de ämnesuppgifter från Skolverket som utkastet ska kopplas till. Välj rätt underlag i listan och kontrollera hämtdatumet. Det fyller inte i några egna fördjupningsval.</p><p>Tryck sedan på <strong>Fortsätt till startdatum och val</strong>. Där får du ange utbildningens startdatum och granska nivåerna. Inget sparas förrän du väljer Spara utkast.</p>
          <div className="pp-field"><label htmlFor="pp-guide-catalog">Välj underlag</label><select id="pp-guide-catalog" value={preparation.catalogId??''} disabled={busy} onChange={e=>changeGuideCatalog(e.target.value)}><option value="">Välj underlag</option>{workspace.catalogs.map(c=><option key={c.catalogId} value={c.catalogId}>Skolverket · hämtat {c.source.fetched}</option>)}</select></div>
          {!busy&&!error&&preparation.catalogId===workspace.catalog.catalogId&&workspace.catalog.status==='selected'&&workspace.catalog.program&&workspace.catalog.source&&<p>Valt underlag: {workspace.catalog.program.name} · Skolverket · hämtat {workspace.catalog.source.fetched}.</p>}
          {workspace.catalog.status==='blocked'&&<p role="alert">{programplanDiagnostic(workspace.catalog.diagnostic??'catalog_unavailable')}</p>}
          {preparationBlocked&&<p role="alert">{preparationBlocked}</p>}
          {error&&preparation.catalogId&&<Button variant="outline" disabled={busy} onClick={()=>changeGuideCatalog(preparation.catalogId!)}>Läs underlaget igen</Button>}
          {preparation.catalogId&&legacyResolution?.problems.length ? <p role="alert">Vissa äldre val kan inte återfinnas entydigt: {legacyResolution.problems.join(', ')}. De har bevarats. Du kan inte gå vidare med detta underlag.</p>:null}
          <div className="pp-actions"><Button variant="outline" disabled={busy} onClick={cancelPreparation}>Avbryt förberedelse</Button><Button disabled={busy||!!error||!!preparationBlocked||!preparation.catalogId||preparation.catalogId!==workspace.catalog.catalogId||!sourceReady||(preparation.kind==='bind'||preparation.kind==='clone')&&(!legacyResolution||legacyResolution.problems.length>0)} onClick={()=>edit(preparation.kind)}>Fortsätt till startdatum och val</Button></div>
        </>}
      </section>
      <details className="pp-explainer"><summary>Hjälp: hur hänger delarna ihop?</summary><section aria-label="Så läser du planen"><p>Planen gäller utbildningen och elevkullen ovan. Ett ämne kan ha flera nivåer. Gymnasiepoäng beskriver omfattningen, inte lektionstimmar.</p><div className="pp-explainer-parts"><div><h4>1. Programunderlaget</h4><p>De gemensamma ämnena och inriktningens ämnen kommer från underlaget. Du läser dem nedan. Alternativ, exempelvis svenska eller svenska som andraspråk, är ännu inte valda här.</p></div><div><h4>2. Din programfördjupning</h4><p>Du väljer vilka tillåtna fördjupningsnivåer utbildningen ska erbjuda. Listan under <strong>Dina sparade fördjupningsval</strong> ändras först när du sparar utkastet.</p></div></div><p>Elevers individuella val, undervisningstimmar och beslut om att fastställa hela planen görs inte i den här vyn.</p></section></details>
      <section className="pp-subjects" aria-label="Ämnen och nivåer"><h2>Ämnen och nivåer</h2><p>Poängen nedan är gymnasiepoäng.</p>
        <section className="pp-saved" aria-label="Dina sparade fördjupningsval"><h3>Dina sparade fördjupningsval</h3>
          {plan?.basisReference ? <><p>Det här är de ordnade val som har sparats i version {plan.version}. När du ändrar i dialogen uppdateras listan här först efter att du har sparat.</p>{plan.basisReference.specializationRefs.length===0&&<p>Inga fördjupningsnivåer sparade.</p>}<ol className="pp-levels">{plan.basisReference.specializationRefs.map((r,i)=><li key={`${i}-${r.itemCode}`}><strong>{programplanLevelName(r,options)}</strong><span>{r.points} poäng</span><small>{r.itemCode} · ämnesversion {r.subjectVersion}</small></li>)}</ol></>
          : plan ? <><p>Äldre sparade val visas precis som de lagrats. Namn och nivåer behöver kopplas till ett aktivt valt underlag innan ändring.</p><ol className="pp-levels">{(legacy??[]).map((code,i)=><li key={`${i}-${code}`}><strong>{code||'(Tomt äldre värde)'}</strong></li>)}</ol>{legacy?.length===0&&<p>Inga äldre fördjupningsval sparade.</p>}</>
          : <p>Inga val är sparade ännu. Börja med Skapa programplan.</p>}
        </section>
        <section className="pp-reference" aria-label="Ingår enligt underlaget"><h3>Ingår enligt underlaget</h3><p>Detta är programgrundens referensuppgifter. De är skilda från dina sparade fördjupningsval och kan inte ändras i den här vyn.</p>
          {referenceBlocks.length===0&&<p>Ämnena kan visas när ett underlag har valts. Följ nästa steg ovan.</p>}
          {referenceBlocks.map(block=><section className="pp-subject-block" key={block.name}><h4>{block.name}</h4><div className="pp-subject-table">{block.subjects.map(subject=><article className="pp-subject-row" key={subject.code}><div><strong>{subject.name}</strong>{subject.optional&&<p className="pp-reference-gap">Alternativ i underlaget — inget ämnesval är gjort här.</p>}</div><div>{subject.levels.length ? <ul>{subject.levels.map(level=><li key={level.code}>{level.name}<span>{level.points} poäng</span></li>)}</ul>:<p className="pp-reference-gap">Nivåuppgifter saknas i underlaget.</p>}<small>{subject.code} · ämnesversion {subject.subjectVersion??'saknas'} · källblock {subject.points} poäng</small></div></article>)}</div></section>)}
        </section>
      </section>
      <details className="pp-underlying"><summary>Underlag och tidigare versioner</summary>
        <section className="pp-source" aria-label="Versionsbundet katalogunderlag"><h3>Underlag</h3><p>Fastställande är stängt här. Fullständiga nationella ramar, alternativ och nivåföljd är ännu inte verifierade. Gymnasiepoäng omvandlas inte till undervisningstimmar.</p>
          {plan&&<p>Version {plan.version} · Revision {plan.revision}{plan.decidedOn&&` · Beslut ${plan.decidedOn}`}</p>}
          {plan?.basisReference&&<p>Utbildningsstart: {plan.basisReference.startedOn}. Katalog, programgrund och start hör till denna version.</p>}
          {plan?.resolution.diagnostics.map((d,i)=><p key={i}>{programplanDiagnostic(d.code)} {d.subjectCode??''} {d.itemCode??''}</p>)}
          {workspace.catalog.status==='unselected'&&<p>Inget underlag är valt. Använd nästa steg ovan för att välja underlag och förbereda utkastet.</p>}
          {workspace.catalog.status==='blocked'&&<p role="alert">{programplanDiagnostic(workspace.catalog.diagnostic??'catalog_unavailable')}</p>}
          {workspace.catalog.status==='selected'&&workspace.catalog.program&&<><p>{workspace.catalog.program.name} ({workspace.catalog.program.code}), programversion {workspace.catalog.program.version}</p><p>Gäller från {workspace.catalog.program.startDate??'Datum saknas'}{workspace.catalog.program.endDate&&` till ${workspace.catalog.program.endDate}`}{workspace.catalog.program.canceledDate&&` · Upphävt ${workspace.catalog.program.canceledDate}`}</p><p>Källa: <a href={workspace.catalog.source!.url} target="_blank" rel="noreferrer">Skolverkets källunderlag</a> · hämtat {workspace.catalog.source!.fetched}, API {workspace.catalog.source!.apiVersion}</p><p className="pp-code">Exakt katalogreferens: {workspace.catalog.catalogId}</p></>}
          {plan?.resolution.unresolvedChoices.map((c,i)=><p key={i}>{programplanDiagnostic(c.kind)} {c.subjectCode??''}{c.points!==undefined&&` · källblockets ${c.points} poäng`}</p>)}
        </section>
        <section aria-label="Tidigare versioner"><h3>Versioner</h3><div className="pp-versions">{workspace.versions.map(v=><button type="button" className={`pp-version ${v.id===plan?.id?'pp-selected':''}`} key={v.id} disabled={busy} onClick={()=>openVersion(v)} aria-label={`Version ${v.version} · ${programplanStatus[v.status]}`}><strong>Version {v.version} · {programplanStatus[v.status]}</strong><span>Revision {v.revision}{v.decidedOn&&` · Beslut ${v.decidedOn}`}</span><span>{v.catalogId?'Versionsbundet underlag':'Äldre, obundet underlag'}</span></button>)}</div>
          {workspace.versionCount>50&&<nav className="pp-pagination" aria-label="Versionernas sidor"><Button variant="outline" disabled={workspace.versionPage===1||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage-1,workspace.catalog.catalogId,plan?.id??null)}>Föregående versioner</Button><span>Sida {workspace.versionPage} av {Math.ceil(workspace.versionCount/50)}</span><Button variant="outline" disabled={workspace.versionPage*50>=workspace.versionCount||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage+1,workspace.catalog.catalogId,plan?.id??null)}>Nästa versioner</Button></nav>}
        </section>
      </details>
    </>}
    <Dialog open={draft!==null} onOpenChange={open=>{if(!open)closeDraft();}}><DialogContent className="pp-dialog" showCloseButton={false} aria-modal="true">
      <DialogTitle>{draft?titles[draft.kind]:'Programplansutkast'}</DialogTitle><DialogDescription>Förbered uppgifterna och granska sedan sammanfattningen. Inget sparas förrän du trycker på Spara utkast.</DialogDescription>
      {draft&&<>
        {draft.mode==='edit'&&<ol className="pp-progress" aria-label="Utkastets steg"><li aria-current={!reviewing?'step':undefined}>1. Förbered uppgifterna</li><li aria-current={reviewing?'step':undefined}>2. Granska och spara</li></ol>}
        <p><strong>{draft.educationName}</strong> · {draft.schoolName}</p><details className="pp-dialog-source"><summary>Utkastets underlag</summary><p>{draft.pin.programRef.code} · programversion {draft.pin.programRef.version} · inriktning {draft.pin.orientationCode??'ingen'}</p><p className="pp-code">Katalog: {draft.pin.catalogId}</p></details>
        {draft.error&&!draft.mfa&&<output role="alert" className="pp-alert">{draft.error}</output>}
        {draft.mfa&&<MfaStepUpNotice message={draft.error??'Verifiering med engångskod krävs.'} detail="Dina uppgifter finns kvar här. Om du väljer verifiering lämnar du sidan; det osparade formuläret följer inte med."/>}
        <div hidden={reviewing&&draft.mode==='edit'}>
        <h3 className="pp-form-step">{draft.sourceBound?'Utbildningens start':'När börjar utbildningen?'}</h3>
        {(draft.kind==='create'||draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<div className="pp-field"><label htmlFor="pp-start">Utbildningens exakta startdatum</label><input id="pp-start" type="date" value={draft.startedOn} disabled={formLocked} aria-describedby="pp-start-help" onChange={e=>setDraft({...draft,startedOn:e.target.value,error:null,mfa:false})}/><p id="pp-start-help">Ange dagen då just den här utbildningen började eller ska börja, enligt utbildningens uppgifter. Använd inte dagens datum om utbildningen börjar en annan dag. Elevkullens namn eller startår räcker inte för att avgöra dagen.</p></div>}
        {draft.sourceBound&&<p>Bundet utbildningsstartdatum: {draft.startedOn}. Det sparades när planen kopplades till underlaget. Katalog, start och programgrund ändras inte i den här dialogen.</p>}
        <h3 className="pp-form-step">{editableRefs?'Vilka fördjupningsnivåer ska utbildningen erbjuda?':'Kontrollera de tidigare valen'}</h3>
        <p>{editableRefs?'Programfördjupningen är utbildningens valda fördjupningsnivåer. Listan nedan är det du kommer att spara. Du kan lägga till en nivå, ta bort ett val eller ändra ordningen.':'Alla tidigare val följer med i samma ordning. Här kopplar du dem till underlaget eller kopierar dem till ett nytt utkast. Du ändrar själva valen efteråt med Ändra fördjupning.'}</p>
        <h4>{editableRefs?'Vald programfördjupning':'Förändringsfria val från källan'}</h4>
        {draft.refs.length===0&&<p>Inga fördjupningsnivåer valda.</p>}
        <ol className="pp-edit-levels">{draft.refs.map((r,i)=><li key={`${i}-${r.itemCode}`}><div><strong>{programplanLevelName(r,draft.options)}</strong><span>{r.itemCode} · ämnesversion {r.subjectVersion} · {r.points} poäng</span></div>{editableRefs&&<div className="pp-level-actions"><Button type="button" variant="outline" disabled={formLocked||i===0} aria-label={`Flytta upp ${r.itemCode}`} onClick={()=>move(i,-1)}><ArrowUp size={16}/></Button><Button type="button" variant="outline" disabled={formLocked||i===draft.refs.length-1} aria-label={`Flytta ned ${r.itemCode}`} onClick={()=>move(i,1)}><ArrowDown size={16}/></Button><Button type="button" variant="outline" disabled={formLocked} aria-label={`Ta bort ${r.itemCode}`} onClick={()=>setDraft({...draft,refs:draft.refs.filter((_,index)=>index!==i),error:null})}>Ta bort</Button></div>}</li>)}</ol>
        {editableRefs&&<div className="pp-field"><label htmlFor="pp-search">Sök ämne eller nivå</label><input id="pp-search" type="search" value={levelSearch} disabled={formLocked} placeholder="Till exempel engelska" onChange={e=>{setLevelSearch(e.target.value);setOption('');}}/><label htmlFor="pp-option">Lägg till fördjupningsnivå</label><select id="pp-option" value={option} disabled={formLocked} aria-describedby="pp-option-help" onChange={e=>setOption(e.target.value)}><option value="">Välj nivå ({filteredOptions.length} tillgängliga)</option>{filteredOptions.map(o=><option key={o.itemCode} value={o.itemCode}>{o.subjectName} · {o.name} · {o.points} poäng</option>)}</select><p id="pp-option-help">Listan visar fördjupningsnivåer i det valda underlaget. Gemensamma ämnesnivåer finns redan i programgrunden och väljs inte här. Välj en nivå och tryck Lägg till nivå.</p>{filteredOptions.length===0&&<output>Ingen tillgänglig nivå matchar sökningen. Prova ett annat ämnesnamn eller töm sökfältet.</output>}{chosenOption&&<p className="pp-choice-preview">Du lägger till: <strong>{chosenOption.subjectName} · {chosenOption.name}</strong>, {chosenOption.points} gymnasiepoäng. Den är inte tillagd ännu.</p>}<Button type="button" variant="outline" disabled={formLocked||!chosenOption||draft.refs.length>=200} onClick={()=>{if(chosenOption){setDraft({...draft,refs:[...draft.refs,programplanReference(chosenOption)],error:null});setOption('');}}}>Lägg till nivå</Button><output>{draft.refs.length===1?'1 nivå':`${draft.refs.length} nivåer`} i ditt utkast. De sparas i nästa steg.</output></div>}
        {(draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<label className="pp-check"><input type="checkbox" disabled={formLocked} checked={draft.legacyConfirmed} onChange={e=>setDraft({...draft,legacyConfirmed:e.target.checked,error:null})}/><span>Jag har kontrollerat att alla äldre val bevaras i samma ordning och att startdatum samt underlag gäller för utbildningen.</span></label>}
        </div>
        {draft.mode==='edit'&&reviewing&&<section ref={reviewRef} tabIndex={-1} className="pp-save-help" aria-label="Kontrollera före sparning"><h3 className="pp-form-step">Det här sparas i utkastet</h3><dl className="pp-review"><dt>Utbildning</dt><dd>{draft.educationName}</dd><dt>Skola</dt><dd>{draft.schoolName}</dd><dt>Utbildningsstart</dt><dd>{draft.startedOn||'Datum saknas — gå tillbaka och ange det'}</dd><dt>Programfördjupning</dt><dd>{draft.refs.length===1?'1 vald nivå':`${draft.refs.length} valda nivåer`}</dd></dl>{draft.refs.length>0?<ol className="pp-review-levels">{draft.refs.map((r,i)=><li key={r.itemCode}><strong>{i+1}. {programplanLevelName(r,draft.options)}</strong><span>{r.points} gymnasiepoäng</span></li>)}</ol>:<p>Inga fördjupningsnivåer valda. Du kan spara ett tomt utkast och fortsätta senare.</p>}{option&&<p role="alert">Nivån i väljaren har inte lagts till. Gå tillbaka om du vill ta med den.</p>}<p>Programunderlagets gemensamma ämnen behålls. <strong>Spara utkast</strong> sparar uppgifterna ovan. Planen blir fortfarande ett utkast; den fastställs inte.</p><p>Vill du ändra något? Välj <strong>Tillbaka till uppgifterna</strong>.</p></section>}
        {draft.mode==='refreshing'&&<output>Hämtar aktuellt underlag. Dina uppgifter behålls…</output>}
        {draft.mode==='compare'&&<div className="pp-comparison" aria-live="polite"><p>{draft.uncertain?'Sparandet kunde inte bekräftas. Aktuellt underlag har lästs om.':'Planen eller utbildningen ändrades av någon annan. Aktuellt underlag har lästs om.'}</p><p>Aktuella fördjupningsval: {namedChoices(plan?.basisReference?.specializationRefs??[])}</p><p>Dina fördjupningsval: {namedChoices(draft.refs,draft.options)}</p><details><summary>Jämför referenser och revisioner</summary><p>Aktuell revision: {plan?.revision??'Ingen plan'} · ditt tidigare underlag: revision {draft.expectedRevision}.</p><p>Aktuella referenser: {plan?.basisReference?.specializationRefs.map(r=>r.itemCode).join(', ')||'Inga bundna val'}</p><p>Dina referenser: {draft.refs.map(r=>r.itemCode).join(', ')||'Inga val'}</p></details>{!retryCompatible(draft)&&<p>Detta kommando kan inte skickas igen automatiskt. Stäng dialogen och granska den aktuella versionen innan du väljer nästa åtgärd.</p>}</div>}
        {draft.mode==='applied'&&<output className="pp-notice">Ett aktuellt utkast innehåller redan samma bundna underlag och val. Inget nytt sparande behövs.</output>}
        <div className="pp-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeDraft}>{draft.mode==='applied'?'Stäng':'Avbryt'}</Button>{draft.mode==='edit'&&reviewing&&<Button variant="outline" disabled={busy} onClick={()=>setReviewing(false)}>Tillbaka till uppgifterna</Button>}{draft.mode==='refresh-failed'?<Button disabled={busy} onClick={()=>void reloadDraft()}>Läs om underlaget</Button>:draft.mode==='edit'&&!reviewing?<Button disabled={busy} onClick={()=>setReviewing(true)}>Granska utkast</Button>:['edit','compare'].includes(draft.mode)&&<Button disabled={busy||draft.mode==='compare'&&!retryCompatible(draft)} onClick={()=>void saveDraft()}>{busy?'Sparar…':draft.mode==='compare'?'Använd mina val':'Spara utkast'}</Button>}</div>
      </>}
    </DialogContent></Dialog>
  </section>;
}
