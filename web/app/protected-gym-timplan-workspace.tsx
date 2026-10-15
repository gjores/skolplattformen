'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock3, FileText, RefreshCw } from 'lucide-react';
import PlanDecisionPanel from './plan-decision-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useHasUnsaved, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplanWorkspace, type ProgramplanWorkspace } from '@/lib/programplan-workspace-contract.ts';
import { PROGRAMPLAN_TERMS } from '@/lib/programplan-terms.ts';
import { statusLabel } from '@/lib/protected-timplan.ts';
import { gymTimplanCanEdit, parseGymTimplan, parseGymTimplanUnderlag, type GymTimplan,
  type GymTimplanUnderlag, type GymTimplanUnit } from '@/lib/gym-timplan.ts';
import type { GymTimplanLocation, ProgramplanLocation } from '@/lib/protected-plan-location.ts';
import type { ActiveContext } from './context-switch';
import NamedTimplanActions, {type TimplanAction} from './named-timplan-actions';
import ProtectedGymTimplanHours from './protected-gym-timplan-hours';
import ProtectedClassTimplans from './protected-class-timplans';
import './protected-gym-timplan.css';
import ProtectedPlanList from './protected-plan-list';
import { usePlanningContext, type PlanningMatrixYear } from './planning-context';
import { projectGymTimplanYear } from '@/lib/planning-year-model.ts';
import type { PlanningRow, PlanningSourceReference } from '@/lib/planning-year-contract.ts';

type Props = { context: ActiveContext; epoch: number; initialTarget: GymTimplanLocation | null;
  onSessionLost: () => void; onOpened: (target: GymTimplanLocation | null, sourcePlanId?: string) => void; onProgramplan: (target: ProgramplanLocation) => void };
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const message = (caught: unknown, fallback: string) => caught instanceof ApiError ? caught.message : fallback;

export default function ProtectedGymTimplanWorkspace({ context, epoch, initialTarget, onSessionLost, onOpened, onProgramplan }: Props) {
  const { setup: planningSetup, selection: planningSelection, matrixYear, requestMatrixYear } = usePlanningContext();
  const planningUnit = planningSelection?.unitId ?? null;
  const [missing, setMissing] = useState<{ workspace: ProgramplanWorkspace; unitId: string } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(initialTarget?.unitId ?? planningUnit ?? null);
  const selectedUnitRef = useRef<string | null>(selectedUnit), initialOpened = useRef(false);
  const [underlag, setUnderlag] = useState<GymTimplanUnderlag | null>(null), [plan, setPlan] = useState<GymTimplan | null>(null);
  const [action, setAction] = useState<TimplanAction | null>(null);
  const [commandBlocked, setCommandBlocked] = useState(false);
  const commandScope = JSON.stringify([context.customerId, context.membershipId, context.assignmentId]);
  const [showSource, setShowSource] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const active = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), saving = useRef(false);
  const verifiedPlan = useRef<{ token: number; planId: string } | null>(null);
  const opened = useRef(onOpened); useLayoutEffect(() => { opened.current = onOpened; }, [onOpened]);
  const unsavedId = `gym-timplan-${epoch}-${context.assignmentId}`;
  const hoursDirty = useHasUnsaved(`${unsavedId}-hours`);
  const decisionPending = useHasUnsaved('navigation-block:plan-decision:');
  const classDirty = useHasUnsaved('class-plan-form:');
  const dirty = hoursDirty || classDirty || commandBlocked;
  const navigationBlocked = useHasUnsaved('navigation-block:');
  const navigationBlockedRef = useRef(navigationBlocked), hoursBlockedRef = useRef(false);
  useEffect(() => { navigationBlockedRef.current = navigationBlocked; }, [navigationBlocked]);
  const onHoursBlocked = useCallback((blocked: boolean) => { hoursBlockedRef.current = blocked; }, []);
  const allowNavigation = useCallback(() => {
    if (!saving.current && !hoursBlockedRef.current && !navigationBlockedRef.current) return true;
    setNotice('Invänta sparandet eller läs aktuell sparstatus innan du lämnar timplanen.'); return false;
  }, []);
  useUnsavedChanges(unsavedId, commandBlocked || busy && !!action);
  useUnsavedChanges(`navigation-block:${unsavedId}`, commandBlocked || busy && !!action);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; }, []);
  const begin = useCallback(() => { invalidate(); const c = new AbortController(); controller.current = c; return { token: generation.current, signal: c.signal }; }, [invalidate]);
  const current = useCallback((token: number) => active.current && generation.current === token, []);
  const securityFailure = useCallback((caught: unknown) => {
    if (!(caught instanceof ApiError) || !(caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) return false;
    invalidate(); setMissing(null); setUnderlag(null); setPlan(null); setAction(null); setShowSource(false); setError(null); setNotice(null); setBusy(false); onSessionLost(); return true;
  }, [invalidate, onSessionLost]);

  const loadList = useCallback(() => {
    if (!allowNavigation()) return;
    invalidate(); setUnderlag(null); setPlan(null); setMissing(null); setError(null); setNotice(null); setBusy(false); opened.current(null);
  }, [allowNavigation, invalidate]);
  const openPlan = useCallback(async (planId: string, expected?: GymTimplanLocation, source?: PlanningSourceReference, afterDecision = false) => {
    if (!afterDecision && !allowNavigation()) return;
    initialOpened.current = true;
    const r = begin(); setMissing(null); setUnderlag(null); setPlan(null); setError(null); setNotice(null); setBusy(true);
    try {
      const result = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId }, r.signal), planId);
      const unitId = expected?.unitId ?? selectedUnitRef.current ?? planningUnit;
      if (!planningSetup || planningSetup.customerId !== context.customerId || !planningSetup.units.some(u => u.unitId === result.unitId && u.canRead.gymnasium)
        || unitId != null && result.unitId !== unitId || expected?.offeringId && result.offeringId !== expected.offeringId
        || expected?.version !== undefined && result.version !== expected.version
        || source && (result.source.planId !== source.planId || result.source.offeringId !== source.offeringId || result.source.version !== source.version || result.source.revision !== source.revision))
        throw new Error('Timplanens skola, version eller frysta programunderlag avviker från årslistan. Läs om listan.');
      if (current(r.token)) { selectedUnitRef.current = result.unitId; setSelectedUnit(result.unitId); setPlan(result); verifiedPlan.current = { token: r.token, planId: result.id }; opened.current({ kind: 'plan', id: planId, unitId: result.unitId, offeringId: result.offeringId, version: result.version }, result.source.planId); }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Timplanen kunde inte hämtas. Försök igen.')); }
    finally { if (current(r.token)) setBusy(false); }
  }, [allowNavigation, begin, context.customerId, current, planningUnit, planningSetup, securityFailure]);
  const loadUnderlag = useCallback(async (sourcePlanId: string, expected?: GymTimplanLocation, source?: PlanningSourceReference) => {
    if (!allowNavigation()) return;
    initialOpened.current = true;
    const r = begin(); setUnderlag(null); setPlan(null); setMissing(null); setError(null); setNotice(null); setBusy(true);
    try {
      const result = parseGymTimplanUnderlag(await api.post('/api/timplaner/gym/underlag', { sourcePlanId }, r.signal), sourcePlanId);
      const unitId = expected?.unitId ?? selectedUnitRef.current ?? planningUnit ?? null;
      if (!planningSetup || planningSetup.customerId !== context.customerId || expected?.offeringId && result.source.offeringId !== expected.offeringId
        || expected?.version !== undefined && result.source.version !== expected.version
        || source && (result.source.planId !== source.planId || result.source.offeringId !== source.offeringId || result.source.version !== source.version || result.source.revision !== source.revision)
        || unitId !== null && (!result.units.some(u => u.unitId === unitId) || !planningSetup.units.some(u => u.unitId === unitId && u.canRead.gymnasium)))
        throw new Error('Programunderlaget hör inte längre till årsradens skola och version. Läs om listan.');
      if (current(r.token)) { selectedUnitRef.current = unitId; setSelectedUnit(unitId); setUnderlag(result);
        opened.current({ kind: 'source', id: sourcePlanId, offeringId: result.source.offeringId, version: result.source.version, ...(unitId ? { unitId } : {}) }); }

    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Programplanens underlag kunde inte hämtas. Försök igen.')); }
    finally { if (current(r.token)) setBusy(false); }
  }, [allowNavigation, begin, context.customerId, current, planningUnit, planningSetup, securityFailure]);
  useEffect(() => { active.current = true; return () => { active.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    if (initialOpened.current) return;
    initialOpened.current = true;
    queueMicrotask(() => {
      if (!active.current) return;
      if (initialTarget?.kind === 'source') void loadUnderlag(initialTarget.id, initialTarget);
      else if (initialTarget?.kind === 'plan') void openPlan(initialTarget.id, initialTarget);
      else loadList();
    });
  }, [initialTarget, loadList, loadUnderlag, openPlan]);

  async function loadMissingEducation(offeringId: string, unitId: string, versionPage = 1) {
    if (!allowNavigation()) return;
    const r = begin(); setBusy(true); setError(null); setUnderlag(null); setPlan(null); setMissing(null);
    try {
      const request = { offeringId, versionPage, catalogId: null };
      const workspace = parseProgramplanWorkspace(await api.post('/api/programplaner/underlag', request, r.signal), request);
      if (!planningSetup || planningSetup.customerId !== context.customerId || !planningSetup.units.some(u => u.unitId === unitId && u.canRead.gymnasium) || !workspace.lifecycle.units.some(u => u.id === unitId && u.inMandate))
        throw new Error('Utbildningen hör inte längre till vald skola.');
      if (current(r.token)) { selectedUnitRef.current = unitId; setSelectedUnit(unitId); setMissing({ workspace, unitId }); }
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Programplanens versioner kunde inte läsas. Läs om årslistan.')); }
    finally { if (current(r.token)) setBusy(false); }
  }
  function chooseAnnualRow(row: PlanningRow) {
    if (!allowNavigation() || busy || hoursDirty && !confirmDiscard()) return;
    if (!planningSetup || row.customerId !== context.customerId || row.schoolform !== 'gymnasium'
      || !planningSetup.units.some(u => u.unitId === row.unitId && u.canRead.gymnasium)
      || planningUnit !== null && planningUnit !== row.unitId) { setError('Årsraden hör inte till det aktuella planeringsurvalet. Läs om listan.'); return; }
    if (row.plan) void openPlan(row.plan.id, { kind: 'plan', id: row.plan.id, unitId: row.unitId, offeringId: row.offeringId, version: row.plan.version }, row.source ?? undefined);
    else if (row.source) void loadUnderlag(row.source.planId, { kind: 'source', id: row.source.planId, unitId: row.unitId, offeringId: row.source.offeringId, version: row.source.version }, row.source);
    else void loadMissingEducation(row.offeringId, row.unitId);
  }
  function prepareCreate(unit: GymTimplanUnit) {
    if (!underlag || busy || !unit.canPlan || !underlag.readiness.ready || !allowNavigation()) return;
    setAction({kind:'new',basis:underlag,unit});
  }
  async function prepareNewVersion() {
    if (!plan || busy || !allowNavigation() || classDirty && !confirmDiscard() || plan.archived || !(['faststalld', 'ersatt'].includes(plan.status) || plan.sourceChanged && ['utkast','atersand'].includes(plan.status))) return;
    const own = plan, r = begin(); setBusy(true); setError(null);
    try {
      const sourcePlanId = own.currentSource?.planId ?? own.source.planId;
      const basis = parseGymTimplanUnderlag(await api.post('/api/timplaner/gym/underlag', { sourcePlanId }, r.signal), sourcePlanId);
      if (!current(r.token)) return;
      const unit = basis.units.find(u => u.unitId === own.unitId);
      if (basis.source.offeringId !== own.offeringId || !unit || !unit.canPlan || !planningSetup?.units.some(u => u.unitId === own.unitId && u.canRead.gymnasium))
        throw new Error('wrong_version_scope');
      if (!own.series) throw new Error('missing_series');
      const ownPlans = unit.plans.filter(p => p.series?.id === own.series?.id);
      const draft = ownPlans.find(p => ['utkast', 'atersand', 'forslag'].includes(p.status));
      if (draft && (draft.status === 'forslag' || draft.sourcePlanId === basis.source.planId && draft.sourceRevision === basis.source.revision)) { setBusy(false); await openPlan(draft.id, {kind:'plan',id:draft.id,unitId:unit.unitId,offeringId:own.offeringId,version:draft.version}); setNotice('Den här timplanen har redan en pågående version. Fortsätt här.'); return; }
      if (!basis.readiness.ready) { setBusy(false); setNotice(`Komplettera programplanen före nästa timplansversion: ${basis.readiness.missing.join(' ')}`); return; }
      const previous = ownPlans.filter(p => ['faststalld','utkast','atersand'].includes(p.status)).sort((a,b) => b.version-a.version)[0];
      if (!previous) throw new Error('missing_predecessor');
      setBusy(false); setAction({kind:'version',basis,unit,previous});
    } catch (caught) { if (current(r.token) && !aborted(caught) && !securityFailure(caught)) setError(message(caught, 'Aktuellt underlag kunde inte hämtas. Försök igen innan du skapar en version.')); }
    finally { if (current(r.token)) { setBusy(false); verifiedPlan.current = {token:r.token,planId:own.id}; } }
  }
  function leave(action: () => void) { if (allowNavigation() && !busy && (!dirty || confirmDiscard())) { setAction(null); action(); } }
  const editable = plan ? gymTimplanCanEdit(plan) : false;
  // Timetables use the frozen source even when a newer live program version exists.
  const yearProjection = useMemo(() => plan && planningSelection ? projectGymTimplanYear(planningSelection.schoolYear, plan,
    [0, 1, 2, 3, 4, 5].map(index => plan.rows.reduce((total, row) => total + row.pointTerms[index], 0))) : null, [plan, planningSelection]);
  const shownYear: PlanningMatrixYear = yearProjection?.terms.length === 6
    ? matrixYear ?? (yearProjection.relativeYear === null ? 'all' : (yearProjection.relativeYear - 1) as 0 | 1 | 2) : 'all';
  function changeMatrixYear(year: string) {
    if (!plan || verifiedPlan.current?.planId !== plan.id || !current(verifiedPlan.current.token) || busy || !allowNavigation()) return;
    if (year !== 'all' && !['0', '1', '2'].includes(year)) return;
    if (year !== 'all' && yearProjection?.terms.length !== 6) { setNotice('Årsdelen saknar verifierat startdatum. Hela planen visas.'); return; }
    requestMatrixYear(year === 'all' ? 'all' : Number(year) as 0 | 1 | 2);
  }
  useEffect(() => {
    if (!plan || !yearProjection || busy || navigationBlocked || commandBlocked || hoursBlockedRef.current
      || verifiedPlan.current?.planId !== plan.id || !current(verifiedPlan.current.token)) return;
    if (matrixYear === null || yearProjection.terms.length !== 6 && matrixYear !== 'all') requestMatrixYear(shownYear);
  }, [plan, yearProjection, busy, navigationBlocked, commandBlocked, current, matrixYear, shownYear, requestMatrixYear]);


  return <section className="gym-timplan" data-testid="protected-gym-timplan-workspace" aria-busy={busy}>
    {error && <div role="alert" className="gt-error"><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => leave(() => loadList())}>Välj utbildning igen</Button></div>}
    {notice && <output className="gt-notice">{notice}</output>}
    {(plan || underlag) && <ol className="gt-flow" aria-label="Utbildningens arbetsmoment"><li>Programplan · {statusLabel[(plan?.source ?? underlag!.source).status]}</li><li>Klasser · kan göras senare</li><li aria-current="step">Timplaner{plan ? ` · ${statusLabel[plan.status]}` : ' · välj eller skapa'}</li><li>Klasskopplingar · efter fastställande</li></ol>}
    {!plan && !underlag && !missing && <><div className="gt-title"><Clock3 size={24}/><div><h1>Timplaner för gymnasiet</h1><p>Här visas skapade timplaner. För att skapa en ny timplan, öppna utbildningen under Programplaner och välj Timplan.</p></div></div>
      <ProtectedPlanList disabled={busy} onSecurityFailure={securityFailure} onOpen={chooseAnnualRow}/>
    </>}
    {missing && <section aria-label="Välj programplanens underlag">
      <Button variant="ghost" disabled={busy} onClick={() => leave(loadList)}><ArrowLeft size={16}/>Alla gymnasietimplaner</Button>
      <h2>{missing.workspace.education.name}</h2><p>Här finns ingen timplan ännu. Välj den sparade programplan som skolans timplan ska bygga på.</p>
      {missing.workspace.versionCount === 0 && <p>Utbildningen saknar programplan. Gå till Programplaner och skapa och spara en programram för denna utbildning först.</p>}
      <div className="gt-toolbar">{missing.workspace.versions.map(v => <Button key={v.id} variant="outline" disabled={busy} aria-label={`Välj programunderlag, version ${v.version}, ${missing.workspace.education.name}`}
        onClick={() => void loadUnderlag(v.id, { kind: 'source', id: v.id, offeringId: missing.workspace.education.id, version: v.version, unitId: missing.unitId })}>Programplan version {v.version} · {statusLabel[v.status]}</Button>)}</div>
      {missing.workspace.versionCount > 50 && <div className="gt-toolbar"><Button variant="outline" disabled={busy || missing.workspace.versionPage === 1} onClick={() => void loadMissingEducation(missing.workspace.education.id, missing.unitId, missing.workspace.versionPage - 1)}>Föregående versioner</Button>
        <span>Sida {missing.workspace.versionPage} av {Math.ceil(missing.workspace.versionCount / 50)}</span><Button variant="outline" disabled={busy || missing.workspace.versionPage * 50 >= missing.workspace.versionCount} onClick={() => void loadMissingEducation(missing.workspace.education.id, missing.unitId, missing.workspace.versionPage + 1)}>Nästa versioner</Button></div>}
    </section>}
    {underlag && <>
      <Button variant="ghost" disabled={busy} onClick={() => leave(() => loadList())}><ArrowLeft size={16}/>Alla gymnasietimplaner</Button>
      <header className="gt-head"><div><h1>{underlag.source.education.name}</h1><p>{underlag.source.education.cohort} · Programplan version {underlag.source.version}, revision {underlag.source.revision} ({statusLabel[underlag.source.status].toLocaleLowerCase('sv')})</p></div>
        <Button variant="outline" disabled={busy} onClick={() => leave(() => onProgramplan({ offeringId: underlag.source.offeringId, planId: underlag.source.planId, version: underlag.source.version, ...(selectedUnit ? { unitId: selectedUnit } : {}) }))}><FileText size={16}/>Öppna programplan</Button></header>
      <p className="gt-explanation">Programplanens poäng och terminer är underlag. Skolan kan ha flera namngivna timplaner med olika undervisningstid. Ett programutkast blir inte fastställt av detta.</p>
      {!underlag.readiness.ready && <output className="gt-source-missing"><strong>Programramen behöver kompletteras före timplaneringen.</strong><ul>{underlag.readiness.missing.map((reason, i) => <li key={i}>{reason}</li>)}</ul></output>}
      <section className="gt-schools" aria-label="Välj skola"><h2>Skolans timplaner</h2><div className="gt-school-grid">{underlag.units.filter(unit => selectedUnit === null || unit.unitId === selectedUnit).map(unit => {
        const series = [...new Set(unit.plans.map(p => p.series?.id ?? 'legacy'))];
        return <article className="gt-school" key={unit.unitId}><h3>{unit.schoolName}</h3>
          {!unit.plans.length && <p>Ingen timplan skapad.</p>}
          {series.map(seriesId => {
            const versions = unit.plans.filter(p => (p.series?.id ?? 'legacy') === seriesId).sort((a,b) => b.version-a.version);
            const latest = versions[0];
            const open = (p: typeof latest) => void openPlan(p.id, {kind:'plan',id:p.id,unitId:unit.unitId,offeringId:underlag.source.offeringId,version:p.version});
            return <section className="gt-series-card" key={seriesId}><h4>{latest.series?.name ?? 'Äldre timplan'}</h4><p>{statusLabel[latest.status]} · version {latest.version}</p>
              {latest.sourcePlanId ? <Button variant="outline" disabled={busy || commandBlocked} aria-label={`Öppna ${latest.series?.name ?? 'äldre timplan'}, version ${latest.version}, ${unit.schoolName}`} onClick={()=>open(latest)}>Öppna timplan</Button> : <p>Äldre underlag. Timmarna bevaras.</p>}
              {versions.length>1 && <details><summary>Tidigare versioner ({versions.length-1})</summary>{versions.slice(1).map(p=><button key={p.id} disabled={busy || !p.sourcePlanId || commandBlocked} onClick={()=>open(p)}>{p.series?.name ?? 'Äldre timplan'} · version {p.version} · {statusLabel[p.status]}</button>)}</details>}
            </section>;
          })}
          {unit.canPlan && underlag.readiness.ready && <Button disabled={busy || commandBlocked} data-named-timplan-action={`new:${unit.unitId}`} aria-label={`Skapa ny timplan för ${unit.schoolName}`} onClick={() => prepareCreate(unit)}>Skapa ny timplan</Button>}
          <p className="gt-muted">Flera klasser kan dela samma timplan. Skapa en separat plan när de behöver olika undervisningstid.</p>
        </article>;
      })}</div></section>
    </>}
    {plan && <>
      <div className="gt-toolbar"><Button variant="ghost" disabled={busy} onClick={() => leave(() => void loadUnderlag(plan.source.planId, { kind: 'source', id: plan.source.planId, offeringId: plan.offeringId, unitId: plan.unitId, version: plan.source.version }))}><ArrowLeft size={16}/>Skolans timplaner</Button><Button variant="outline" disabled={busy || hoursDirty || classDirty} onClick={() => void openPlan(plan.id)}><RefreshCw size={16}/>Läs om</Button>{plan.canPlan && !plan.archived && (['faststalld', 'ersatt'].includes(plan.status) || plan.sourceChanged && ['utkast','atersand'].includes(plan.status)) && ['rektor', 'administrator'].includes(context.function) && <Button data-named-timplan-action={`version:${plan.unitId}`} disabled={busy || navigationBlocked} onClick={() => void prepareNewVersion()}>Skapa ny version</Button>}</div>
      <header className="gt-head"><div><h1>{plan.series?.name ?? plan.source.education.name}</h1><p>{plan.source.education.name} · {plan.schoolName} · {plan.source.education.cohort}</p><span className="gt-state">{statusLabel[plan.status]} · Timplan version {plan.version}</span></div>
        <Button variant="outline" disabled={busy} onClick={() => leave(() => onProgramplan({ offeringId: plan.offeringId, planId: plan.source.planId, version: plan.source.version, unitId: plan.unitId }))}><FileText size={16}/>Öppna programplan</Button></header>
      {plan.series && plan.canPlan && !plan.archived && <Button variant="outline" disabled={busy || navigationBlocked || hoursDirty || classDirty} data-named-timplan-action={`rename:${plan.unitId}`} onClick={()=>setAction({kind:'rename',plan})}>Byt namn</Button>}
      <div className="gt-source-line"><button type="button" onClick={() => setShowSource(true)}><FileText size={15}/>Underlag: Programplan v{plan.source.version}, revision {plan.source.revision} ({statusLabel[plan.source.status].toLocaleLowerCase('sv')})</button><span>{editable ? 'Fyll i timmar direkt i terminscellerna' : plan.archived ? 'Utbildningen är arkiverad' : 'Läsvy'}</span></div>
      {plan.sourceChanged && <p className="gt-changed">Programplanens innehåll har ändrats. Timplanen använder fortfarande det sparade underlaget ovan. Välj Skapa ny version för att använda det aktuella innehållet i samma timplan. {plan.currentSource && <Button variant="link" disabled={busy} onClick={() => leave(() => void loadUnderlag(plan.currentSource!.planId))}>Välj nytt underlag</Button>}</p>}
      <PlanDecisionPanel key={`decision-${plan.id}`} kind="timplan" planId={plan.id} revision={plan.revision} disabled={busy||hoursDirty||commandBlocked} onSecurityFailure={securityFailure} onChanged={()=>openPlan(plan.id, undefined, undefined, true)}/>
      <ProtectedClassTimplans scopeKey={JSON.stringify([context.customerId, context.membershipId, context.assignmentId, epoch])} returnTo={'/?' + new URLSearchParams({vy:'timplaner',timplan:plan.id,timplansskola:plan.unitId,timplansutbildning:plan.offeringId,timplansversion:String(plan.version),planeringslasar:String(planningSelection?.schoolYear ?? planningSetup?.currentYear ?? new Date().getFullYear()),planeringsskola:plan.unitId,planeringsform:'gymnasium'}).toString()} key={`classes-${plan.id}-${planningSelection?.schoolYear}`} plan={plan} schoolYear={planningSelection?.schoolYear ?? planningSetup?.currentYear ?? new Date().getFullYear()} canPrepare={['rektor','administrator'].includes(context.function)} disabled={busy || decisionPending || commandBlocked} onSecurityFailure={securityFailure}/>
      <ProtectedGymTimplanHours disabled={decisionPending || commandBlocked} key={plan.id} plan={plan} yearProjection={yearProjection ?? undefined} year={String(shownYear)} onYear={changeMatrixYear} unsavedId={`${unsavedId}-hours`}
        onSaved={setPlan} onSaving={setBusy} onNavigationBlocked={onHoursBlocked} onSecurityFailure={securityFailure}/>

    </>}
    <Dialog open={showSource && !!plan} onOpenChange={setShowSource}><DialogContent className="gt-source-dialog"><DialogTitle>Sparat programunderlag</DialogTitle><DialogDescription>Programplan version {plan?.source.version}, revision {plan?.source.revision}. Detta är den frysta poängram som timplanen använder.</DialogDescription>
      {plan && <div className="gt-table-scroll"><table className="gt-matrix"><caption>{plan.source.education.name} · {plan.source.education.cohort} · {plan.rows.reduce((n, r) => n + r.points, 0)} poäng</caption><thead><tr><th>Ämne, nivå eller block</th>{PROGRAMPLAN_TERMS.map((term, index) => <th key={term}>{yearProjection?.terms.find(value => value.index === index)?.label ?? term}</th>)}</tr></thead><tbody>{plan.rows.map(row => <tr key={row.key}><th>{`${row.name} ${row.levelName}`}</th>{row.pointTerms.map((points, i) => <td key={i}>{points}</td>)}</tr>)}</tbody></table></div>}
      <Button variant="outline" onClick={() => setShowSource(false)}>Stäng underlaget</Button></DialogContent></Dialog>
    <NamedTimplanActions key={commandScope} scope={commandScope} action={action} onClose={()=>setAction(null)} onBlocked={setCommandBlocked} onSecurityFailure={securityFailure}
      returnTo={'/?'+new URLSearchParams({vy:'timplaner',...(plan?{timplan:plan.id,timplansskola:plan.unitId,timplansutbildning:plan.offeringId,timplansversion:String(plan.version)}:underlag?{programunderlag:underlag.source.planId,timplansutbildning:underlag.source.offeringId,timplansversion:String(underlag.source.version),...(selectedUnit?{timplansskola:selectedUnit}:{})}:{}),planeringslasar:String(planningSelection?.schoolYear??planningSetup?.currentYear??new Date().getFullYear()),planeringsform:'gymnasium'}).toString()}
      onSaved={(fresh,text)=>{invalidate();setPlan(fresh);setUnderlag(null);selectedUnitRef.current=fresh.unitId;setSelectedUnit(fresh.unitId);verifiedPlan.current={token:generation.current,planId:fresh.id};opened.current({kind:'plan',id:fresh.id,unitId:fresh.unitId,offeringId:fresh.offeringId,version:fresh.version},fresh.source.planId);setNotice(text);}}/>


  </section>;
}
