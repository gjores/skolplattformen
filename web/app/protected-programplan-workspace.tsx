'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Copy, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges, useHasUnsaved } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import { parseProgramplanWorkspace,
  type ProgramplanWorkspace, type ProgramplanVersionSummary } from '@/lib/programplan-workspace-contract.ts';
import { programplanCommand, programplanCommandReply, programplanDiagnostic, programplanOptions, programplanReference,
  programplanStatus, resolveLegacyProgramplan, sameProgramplanLevels, sameProgramplanPin, programplanSelectedId, assertProgramplanSummary, programplanLevelName, type ProgramplanDraft, type ProgramplanCommandKind } from '@/lib/protected-programplan.ts';
import { defaultProgramplanChoiceBlocks, upgradeProgramplanBasis } from '@/lib/programplan-choice-blocks.ts';
import type { ActiveContext } from './context-switch';
import MfaStepUpNotice from './mfa-step-up';
import { AnalysisView, SaveDialog } from './protected-programplan-sheet';
import { analyseProgramplan, type PlanIssue } from '@/lib/programplan-analysis.ts';
import ProtectedProgramplanFlow from './protected-programplan-flow';
import ProgramplanList from './protected-programplan-list';
import { LifecycleBadge, LifecycleDialog, nextDay, type LifecycleDialogKind } from './protected-programplan-lifecycle';
import { parseProgramplanLifecycleReply, programplanLifecycleActions, programplanSchoolActions, programplanSchoolLabel, programplanLockReason, startsAfter, stockholmToday, type ProgramplanLifecycleCommand } from '@/lib/programplan-lifecycle.ts';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import ProgramplanBoard, { LocalPlanBoard, localTermsValid } from './protected-programplan-board';
import { programplanLevelRanks, programplanTermRows, type ProgramplanTermDistribution } from '@/lib/programplan-terms.ts';
import { parseProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import { newEducationCommand, educationStatusForCommand } from '@/lib/protected-programplan-education.ts';
import { parseProgramplanEducationCreated, type ProgramplanEducationCreateRequest } from '@/lib/programplan-education-contract.ts';
import {mergeProgramplanUnitPackages,parseProgramplanUnitPackages,parseProgramplanValpaketList,type ProgramplanValpaketList,type ProgramplanUnitPackages} from '@/lib/programplan-packages.ts';
import './protected-programplan.css';

type Props = { context: ActiveContext; epoch: number; onSessionLost: () => void };
const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
const titles = { create: 'Skapa programplan', bind: 'Gör utkastet redo för ändring', replace: 'Ändra fördjupning', clone: 'Skapa ny version' };

export default function ProtectedProgramplanWorkspace({ context, epoch, onSessionLost }: Props) {
  const page = 1;
  const [packages,setPackages]=useState<ProgramplanUnitPackages|null>(null),[packageError,setPackageError]=useState<string|null>(null);
  const [valpaket,setValpaket]=useState<ProgramplanValpaketList[]|null>(null);
  const [packageRead,setPackageRead]=useState(0);
  const hasUnsaved = useHasUnsaved();
  const [flowRevision,setFlowRevision] = useState(0);
  const [workspace, setWorkspace] = useState<ProgramplanWorkspace | null>(null), [plan, setPlan] = useState<Programplan | null>(null);
  const [planSummary, setPlanSummary] = useState<ProgramplanVersionSummary | null>(null);
  const [preparation, setPreparation] = useState<{kind: ProgramplanCommandKind; catalogId: string | null} | null>(null);
  const [draft, setDraft] = useState<ProgramplanDraft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [view, setView] = useState<'plan' | 'analysis'>('plan');
  const [focusIssue, setFocusIssue] = useState<PlanIssue | null>(null);
  const termsActive = false;
  const [termValues, setTermValues] = useState<ProgramplanTermDistribution | null>(null);
  const [draftTerms, setDraftTerms] = useState<ProgramplanTermDistribution>([]);
  const [showFlow, setShowFlow] = useState(false), [canCreate, setCanCreate] = useState(false);
  const [copy, setCopy] = useState<{ name: string; cohort: string; localCode: string; startedOn: string; command: ProgramplanEducationCreateRequest | null; error: string | null; uncertain: boolean } | null>(null);
  const copyAfterOpen = useRef(false);
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialogKind | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef<HTMLElement | null>(null);
  const editing = draft !== null;
  useEffect(()=>{if(!editing)return;const frame=requestAnimationFrame(()=>draftRef.current?.focus());return()=>cancelAnimationFrame(frame);},[editing]);
  useEffect(()=>{if(!reviewing)return;const frame=requestAnimationFrame(()=>reviewRef.current?.focus());return()=>cancelAnimationFrame(frame);},[reviewing]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null), saving = useRef(false);
  const dirty = !!preparation?.catalogId || !!draft && draft.mode !== 'applied' && (draft.kind !== 'replace' || draft.startedOn !== draft.originalStart
    || !sameProgramplanLevels(draft.refs, draft.originalRefs) || draft.mode !== 'edit');
  const copyDirty = !!copy && !!(copy.cohort || copy.startedOn || copy.localCode || copy.command);
  useUnsavedChanges(`programplan-${epoch}-${context.assignmentId}`, dirty || copyDirty || busy && (draft !== null || !!copy?.command));
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; }, []);
  const begin = useCallback(() => { invalidate(); const c = new AbortController(); controller.current = c; return { token: generation.current, signal: c.signal }; }, [invalidate]);
  const current = useCallback((token: number) => mounted.current && generation.current === token, []);
  const securityFailure = useCallback((e: unknown) => {
    if (!(e instanceof ApiError) || !(e.status === 401 || e.status === 403 && e.code !== 'mfa_required')) return false;
    invalidate(); setWorkspace(null); setPlan(null); setPlanSummary(null); setPreparation(null); setDraft(null); setError(null); setNotice(null); setBusy(false); onSessionLost(); return true;
  }, [invalidate, onSessionLost]);
  const loadList = useCallback(async (_next: number) => {
    invalidate(); setWorkspace(null); setPlan(null); setPlanSummary(null); setPreparation(null); setDraft(null); setFocusIssue(null); setNotice(null); setError(null); setBusy(false); setShowFlow(false); setCopy(null); setFlowRevision(value=>value+1);
  }, [invalidate]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate(); }; }, [invalidate]);
  const packagePlanId=plan?.id??null;
  const acceptPackages=useCallback((next:ProgramplanUnitPackages)=>{
    if(next.planId!==packagePlanId)return;
    setPackages(current=>mergeProgramplanUnitPackages(current?.planId===packagePlanId?current:null,next));
  },[packagePlanId]);
  const packageUnits=workspace?.lifecycle.units;
  const hasChoiceBlocks=!!plan?.basisReference?.choiceBlocks;
  useEffect(()=>{
    const c=new AbortController();void(async()=>{await Promise.resolve();if(c.signal.aborted)return;setPackages(null);setValpaket(null);setPackageError(null);if(!packagePlanId||!hasChoiceBlocks)return;try{const value=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval/lasa',{planId:packagePlanId},c.signal));
      if(value.planId!==packagePlanId||value.units.length!==packageUnits?.length||value.units.some(u=>!packageUnits?.some(x=>x.id===u.unitId)))throw Error('Fel skolor i svaret.');
      const lists=await Promise.all(value.units.map(async u=>{const list=parseProgramplanValpaketList(await api.post('/api/programplaner/valpaket/lista',{unitId:u.unitId},c.signal));if(list.unitId!==u.unitId)throw Error('Fel skola i paketutbudet.');return list;}));
      if(!c.signal.aborted){setPackages(value);setValpaket(lists);}
    }catch(e){if(!c.signal.aborted&&!securityFailure(e))setPackageError('Skolornas paket kunde inte hämtas.');}})();return()=>c.abort();
  },[packagePlanId,plan?.revision,hasChoiceBlocks,packageRead,packageUnits,securityFailure]);
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
    planId: string | null = null, keepPreparation: ProgramplanCommandKind | null = null, propagateError = false, force = false) {
    if (busy && !force || !keepPreparation && !force && hasUnsaved && !confirmDiscard()) return;
    const r = begin();
    if (!keepPreparation) { setWorkspace(null); setPlan(null); setPlanSummary(null); setDraft(null); setFocusIssue(null); }
    setNotice(null); setError(null);
    setPreparation(keepPreparation ? {kind: keepPreparation, catalogId} : null); setBusy(true);
    try {
      const {fresh, selected, summary} = await readSelection(offeringId, versionPage, catalogId, planId, r.signal);
      if (current(r.token)) { setWorkspace(fresh); setPlan(selected); setPlanSummary(summary);
        if (copyAfterOpen.current) { copyAfterOpen.current = false; if (selected?.basisReference) setCopy(newCopy(fresh.education.name)); else setNotice('Utbildningen har ingen kopplad programplan att kopiera. Öppna planen och koppla den till ett underlag först.'); } }
    } catch (e) { if (current(r.token) && !aborted(e) && !securityFailure(e)) setError(e instanceof ApiError ? e.message : 'Aktuellt programplansunderlag kunde inte läsas. Välj utbildningen igen.'); if (propagateError) throw e; }
    finally { if (current(r.token)) setBusy(false); }
  }
  function newCopy(name: string) { return { name: `${name} – kopia`.slice(0, 120), cohort: '', localCode: '', startedOn: '', command: null, error: null, uncertain: false }; }
  async function openCreatedCopy(command: ProgramplanEducationCreateRequest, value: unknown, terms: ProgramplanTermDistribution | null, sourceUnits: string[], sourcePackages:ProgramplanUnitPackages|null, signal: AbortSignal) {
    const created = parseProgramplanEducationCreated(value, command);
    let termsNote = '';
    if (terms && terms.length) {
      try {
        const reply = parseProgramplanTermReply(await api.post('/api/programplaner/terminer', { planId: created.plan.id, expectedRevision: created.plan.revision, distribution: terms }, signal));
        if (reply.planId !== created.plan.id) throw new Error('Fel plan.');
        termsNote = ' Terminsfördelningen följde med.';
      } catch (e) { if (securityFailure(e)) return; termsNote = ' Terminsfördelningen kunde inte kopieras och behöver göras om.'; }
    }
    let schoolsNote = '';
    if (sourceUnits.length > 1) {
      try {
        const fresh = await readWorkspace(created.education.id, 1, created.plan.catalogId, signal);
        if (fresh.lifecycle.units.length !== sourceUnits.length || fresh.lifecycle.units.some(u => !sourceUnits.includes(u.id))) {
          const schoolCommand: ProgramplanLifecycleCommand = { offeringId: created.education.id, expectedRevision: fresh.lifecycle.revision, command: 'units', details: { unitIds: sourceUnits } };
          parseProgramplanLifecycleReply(await api.post('/api/programplaner/utbildning/livscykel', schoolCommand, signal), schoolCommand);
        }
        schoolsNote = ' Skolvalet följde med.';
      } catch (e) { if (securityFailure(e)) return; schoolsNote = ' Skolorna kunde inte kopieras och behöver väljas igen under Skolor.'; }
    }
    let packagesNote='';
    if(sourcePackages){
      const failed:string[]=[];
      for(const school of sourcePackages.units){
        if(!school.selections.some(s=>s.entries.length))continue;
        try{
          let currentPackages=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval/lasa',{planId:created.plan.id},signal));
          for(const selection of school.selections){if(!selection.entries.length)continue;
            const revision=currentPackages.units.find(u=>u.unitId===school.unitId)?.revision;if(revision===undefined)throw Error('Skolan saknas.');
            const reply=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval',{planId:created.plan.id,unitId:school.unitId,expectedRevision:revision,blockId:selection.blockId,entries:selection.entries},signal));
            const target=reply.units.find(u=>u.unitId===school.unitId);
            if(reply.planId!==created.plan.id||target?.revision!==revision+1||JSON.stringify(target.selections.find(s=>s.blockId===selection.blockId)?.entries)!==JSON.stringify(selection.entries))throw Error('Paketkopieringen kunde inte bekräftas.');
            currentPackages=reply;
          }
        }catch(e){if(securityFailure(e))return;failed.push(workspace?.lifecycle.units.find(u=>u.id===school.unitId)?.name??'en skola');}
      }
      packagesNote=failed.length?` Paketkopieringen behöver kontrolleras för ${failed.join(', ')}. Öppna skolans paket innan du försöker igen.`:' Skolornas paket följde med.';
    }
    setCopy(null); await openEducation(created.education.id, 1, created.plan.catalogId, created.plan.id, null, false, true);
    setNotice(`Kopian sparades som en ny utbildning med ett första utkast.${termsNote}${schoolsNote}${packagesNote} Planen fastställs inte.`);
  }
  async function saveCopy() {
    if (!copy || !workspace || !plan?.basisReference || busy || saving.current) return;
    let own = copy.command;
    try {
      own ??= newEducationCommand({ unitId: workspace.education.unitId, name: copy.name.trim(), cohort: copy.cohort.trim(), localCode: copy.localCode.trim() || null,
        basisReference: { ...upgradeProgramplanBasis(workspace.catalog.program!, plan.basisReference).basisReference, startedOn: copy.startedOn } }, crypto.randomUUID());
    } catch { setCopy({ ...copy, error: 'Ange namn, elevkull och verkligt startdatum för den nya utbildningen.' }); return; }
    saving.current = true; const r = begin(); setBusy(true); setCopy({ ...copy, command: own, error: null });
    const sourceUnits = workspace.lifecycle.units.map(u => u.id);
    let sourceTerms: ProgramplanTermDistribution | null = null;
    let sourcePackages:ProgramplanUnitPackages|null=null;
    try{sourcePackages=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval/lasa',{planId:plan.id},r.signal));if(sourcePackages.planId!==plan.id||sourcePackages.units.length!==sourceUnits.length||sourcePackages.units.some(u=>!sourceUnits.includes(u.unitId)))throw Error('Källans skolval har ändrats. Läs om planen.');}catch(e){saving.current=false;if(current(r.token)&&!aborted(e)&&!securityFailure(e)){setBusy(false);setCopy(c=>c&&{...c,error:'Skolornas paket kunde inte läsas. Försök igen innan du skapar kopian.'});}return;}
    try { const read = parseProgramplanTermReply(await api.post('/api/programplaner/terminer/lasa', { planId: plan.id }, r.signal)); if (read.planId === plan.id) sourceTerms = upgradeProgramplanBasis(workspace.catalog.program!, plan.basisReference, read.distribution).distribution; } catch (e) { if (aborted(e) || securityFailure(e)) { saving.current = false; return; } }
    try { const reply = await api.post('/api/programplaner/utbildning/skapa', own, r.signal); if (current(r.token)) await openCreatedCopy(own, reply, sourceTerms, sourceUnits, sourcePackages, r.signal); }
    catch (e) {
      if (!current(r.token) || aborted(e) || securityFailure(e)) return;
      if (e instanceof ApiError && e.hasExplicitCode && ['mfa_required', 'bad_request', 'audit_unavailable', 'programplan_start_passed'].includes(e.code)) {
        setCopy(c => c && { ...c, command: e.code === 'bad_request' || e.code === 'programplan_start_passed' ? null : own, error: `Kunde inte spara kopian. ${e.message}` });
      } else {
        try {
          const status = educationStatusForCommand(await api.post('/api/programplaner/utbildning/status', { commandId: own.commandId }, r.signal), own);
          if (!current(r.token)) return;
          if (status.status === 'created') await openCreatedCopy(own, { commandId: status.commandId, education: status.education, plan: status.plan, replayed: true }, sourceTerms, sourceUnits, sourcePackages, r.signal);
          else setCopy(c => c && { ...c, error: 'Ingen kopia är sparad. Du kan försöka igen med samma uppgifter.' });
        } catch (inner) { if (current(r.token) && !aborted(inner) && !securityFailure(inner)) setCopy(c => c && { ...c, uncertain: true, error: 'Sparandet kan inte avgöras ännu. Uppgifterna finns kvar. Försök igen för att läsa sparstatus.' }); }
      }
    } finally { saving.current = false; if (current(r.token)) setBusy(false); }
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
        programRef: { code: workspace.catalog.program.code, version: workspace.catalog.program.version }, orientationCode: workspace.education.orientationCode, startedOn,
        ...((kind === 'create' || kind === 'bind' || !source || kind === 'clone' && source.choiceBlocks === undefined) ? {choiceBlocks: defaultProgramplanChoiceBlocks(workspace.catalog.program, workspace.education.orientationCode)} : source.choiceBlocks !== undefined ? {choiceBlocks: source.choiceBlocks} : {}) },
      startedOn, originalStart: startedOn, refs: refs.map(programplanReference), originalRefs: refs.map(programplanReference), sourceBound: !!source,
      legacyConfirmed: false, options, mode: 'edit', error: null, mfa: false, uncertain: false });
    setDraftTerms([]); setReviewing(false); setNotice(null); setPreparation(null);
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
    if (own.kind === 'create' && workspace?.catalog.program && !localTermsValid(workspace.catalog.program, own.pin.orientationCode, own.refs, draftTerms)) { setReviewing(false); setDraft({ ...own, error: 'Rätta rader med fler poäng än nivån har innan du sparar.', mfa: false }); return; }
    let command: ReturnType<typeof programplanCommand>;
    try { command = programplanCommand(own); }
    catch { setReviewing(false); setDraft({ ...own, error: 'Ange ett verkligt utbildningsstartdatum och bekräfta eventuella äldre val. Kontrollera underlaget.', mfa: false }); return; }
    saving.current = true;
    const r = begin(); setBusy(true); setDraft({ ...own, error: null, mfa: false }); setNotice(null);
    let accepted: Programplan | null = null;
    try {
      if (own.kind === 'replace') {
        const terms = parseProgramplanTermReply(await api.post('/api/programplaner/terminer/lasa', { planId: own.planId }, r.signal));
        if (terms.planId !== own.planId) throw new Error('Terminsunderlaget avviker.');
        const keys = new Set(own.refs.map(ref=>`specialization:${ref.subjectCode}:${ref.subjectVersion}:${ref.itemCode}`));
        const removed = terms.distribution.filter(row=>row.rowKey.startsWith('specialization:') && !keys.has(row.rowKey));
        if (terms.revision === own.expectedRevision && removed.length) {
          const names = removed.map(row=>{const ref=own.originalRefs.find(ref=>row.rowKey===`specialization:${ref.subjectCode}:${ref.subjectVersion}:${ref.itemCode}`);return `${ref?programplanLevelName(ref,own.options):row.rowKey} (${row.points.reduce((sum,n)=>sum+n,0)} fördelade poäng)`;}).join(', ');
          if (current(r.token)) { setReviewing(false); setDraft({ ...own, error: `Nivåer som du tar bort har sparad terminsfördelning: ${names}. Avbryt ändringen och rensa först nivåns fördelning under Årskurser och terminer. Dina sparade uppgifter har inte ändrats.`, mfa: false }); }
          return;
        }
      }
      accepted = programplanCommandReply(await api.post(command.route, command.body, r.signal), own);
      let termsNote = '';
      if (own.kind === 'create' && draftTerms.length) {
        try { const reply = parseProgramplanTermReply(await api.post('/api/programplaner/terminer', { planId: accepted.id, expectedRevision: accepted.revision, distribution: draftTerms }, r.signal)); if (reply.planId !== accepted.id) throw new Error('Fel plan.'); accepted = { ...accepted, revision: reply.revision }; }
        catch (e) { if (aborted(e) || securityFailure(e)) return; termsNote = ' Terminsfördelningen kunde inte sparas och behöver göras om i planen.'; }
      }
      const fresh = await readWorkspace(own.offeringId, 1, accepted.catalogId, r.signal);
      const snapshot = await readSelection(own.offeringId, 1, accepted.catalogId, accepted.id, r.signal, false, fresh);
      const read = snapshot.selected!;
      if (!current(r.token)) return;
      setWorkspace(snapshot.fresh); setPlan(read); setPlanSummary(snapshot.summary); setDraft(null); setNotice(`Utkastet sparades.${termsNote} Planen är fortfarande ett utkast.`);
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
    if(hasUnsaved)return;
    if (anotherDraft && workspace) { void openEducation(workspace.education.id, 1, null, workspace.education.draftId); return; }
    if (nextKind === 'replace' || nextKind === 'clone' && plan?.basisReference) edit(nextKind);
    else setPreparation({kind: nextKind, catalogId: null});
  }
  function changeGuideCatalog(catalogId: string) {
    if (workspace && preparation) void openEducation(workspace.education.id, workspace.versionPage, catalogId || null, plan?.id ?? null, preparation.kind);
  }
  function cancelPreparation() { if (dirty && !confirmDiscard()) return; setPreparation(null); }
  const namedChoices = (refs: ProgramplanDraft['refs'], choices = options) => refs.length ? refs.map(r => `${programplanLevelName(r,choices)} (${r.points} poäng)`).join(', ') : 'Inga val';
  const program = workspace?.catalog.status === 'selected' ? workspace.catalog.program : null;
  const orientationName = program?.orientations.find(o => o.code === workspace?.education.orientationCode)?.name ?? null;
  const shownRefs = draft ? draft.refs : plan?.basisReference?.specializationRefs ?? [];
  const shownStart = draft ? draft.startedOn || null : plan?.basisReference?.startedOn ?? null;
  const shownOptions = draft ? draft.options : options;
  const serverNotes = draft ? [] : [...(plan?.resolution.diagnostics ?? []).filter(d => d.code !== 'unknown_education_start').map(d => `${programplanDiagnostic(d.code)} ${d.subjectCode ?? ''} ${d.itemCode ?? ''}`.trim()),
    ...(plan?.resolution.unresolvedChoices ?? []).filter(c => c.kind === 'program_rules_unverified').map(c => programplanDiagnostic(c.kind))];
  const boardActive = !draft && !preparation && !copy && !!plan?.basisReference && !!program && boundSourceMatches;
  const draftTermInput = draft && program && (draft.kind === 'create') ? (() => { try { return { rows: programplanTermRows(program, { ...draft.pin, startedOn: draft.startedOn, specializationRefs: draft.refs }), distribution: draftTerms, ranks: programplanLevelRanks(program) }; } catch { return undefined; } })() : undefined;
  const termInput = draftTermInput ?? (boardActive && termValues ? (() => { try { return { rows: programplanTermRows(program!, plan!.basisReference!), distribution: termValues, ranks: programplanLevelRanks(program!) }; } catch { return undefined; } })() : undefined);
  const packagesLoaded=!!packages&&packages.planId===plan?.id&&!!valpaket&&valpaket.length===workspace?.lifecycle.units.length&&!packageError;
  const rawAnalysis = program && workspace ? analyseProgramplan({ program, orientationCode: workspace.education.orientationCode, refs: shownRefs, startedOn: shownStart,
    sourceFetched: workspace.catalog.source?.fetched ?? null, serverNotes, terms: termInput, packages:boardActive&&packages?.planId===plan?.id?packages:undefined, units:boardActive&&packagesLoaded?workspace.lifecycle.units:undefined,valpaket:boardActive&&valpaket?[...new Map(valpaket.flatMap(list=>list.packages).map(p=>[`${p.packageId}@${p.version}`,p])).values()]:undefined, basisReference: draft ? { ...draft.pin, startedOn: draft.startedOn, specializationRefs: draft.refs } : plan?.basisReference }) : null;
  const analysis=rawAnalysis&&boardActive&&!packagesLoaded?{...rawAnalysis,ready:false,missing:[...rawAnalysis.missing,'Skolornas paket behöver läsas']}:rawAnalysis;
  const problems = analysis ? analysis.counts.fel + analysis.counts.risk : 0;
  const problemLabel = analysis ? [analysis.counts.fel ? `${analysis.counts.fel} fel` : '', analysis.counts.risk ? `${analysis.counts.risk} ${analysis.counts.risk === 1 ? 'risk' : 'risker'}` : ''].filter(Boolean).join(' · ') : '';
  // Behåll navigeringsmålet bara så länge samma rad fortfarande behöver åtgärdas.
  const activeFocusIssue = focusIssue && analysis?.issues.some(issue => issue.id === focusIssue.id &&
    (issue.target?.kind !== 'row' || focusIssue.target?.kind === 'row' && issue.target.rowKey === focusIssue.target.rowKey)) ? focusIssue : null;
  const canEditInline = !!draft && editableRefs && draft.mode === 'edit';
  const ready = !!plan && plan.status === 'utkast' && boardActive && !!analysis?.ready;
  const incomplete = !!plan?.basisReference && plan.basisReference.choiceBlocks === undefined;
  const statusText = plan ? `${incomplete ? 'Ofullständig' : ready ? 'Klar för beslut' : programplanStatus[plan.status]} · Version ${plan.version}` : draft ? 'Nytt utkast' : 'Ingen programplan ännu';
  const lifecycleActions = workspace && context.function !== 'administrator' ? programplanLifecycleActions(workspace.lifecycle, context.function === 'huvudman' ? 'huvudman' : 'rektor') : null;
  const lifecycleTarget = workspace ? { offeringId: workspace.education.id, name: workspace.education.name, cohort: workspace.education.cohort, localCode: workspace.education.localCode,
    versions: workspace.versionCount, lifecycle: workspace.lifecycle,
    startEditable: workspace.versionCount === 1 && workspace.versions[0]?.status === 'utkast' && !!workspace.versions[0]?.basisReference } : null;
  // D-01: planen ändras bara när servern säger att den är framtida och inte arkiverad.
  const changePlan = context.function !== 'administrator' && (lifecycleActions?.changePlan ?? true), lockReason = context.function === 'administrator' ? 'Du kan välja skolans paket men inte ändra planen.' : workspace ? programplanLockReason(workspace.lifecycle) : null;
  function lifecycleStale(message: string) { setLifecycleDialog(null); void loadList(page).then(() => setNotice(message)); }
  function lifecycleChanged(message: string, deleted: boolean) {
    setLifecycleDialog(null);
    if (deleted || !workspace) { void loadList(page).then(() => setNotice(message)); return; }
    void openEducation(workspace.education.id, workspace.versionPage, workspace.catalog.catalogId, plan?.id ?? null, null, false, true).then(() => setNotice(message));
  }
  function actionUnavailable(issue: PlanIssue): string | null {
    if (!issue.action) return null;
    if(issue.target?.kind==='package'){const targetUnit=issue.target.unitId;if(workspace?.lifecycle.archived)return 'Utbildningen är arkiverad.';if(!workspace?.lifecycle.units.some(u=>u.id===targetUnit&&u.inMandate))return 'Skolan ingår inte i ditt mandat.';return busy?'Avsluta den pågående ändringen först.':boardActive?null:'Öppna den sparade planen först.';}
    if (!changePlan) return lockReason ?? 'Planen kan bara läsas.';
    if (!issue.target) return 'Åtgärden behöver kontrolleras manuellt.';
    if (issue.target.kind === 'orientation') return 'Inriktningen väljs när utbildningen skapas och kan inte ändras här.';
    if (busy || copy || draft && draft.mode !== 'edit') return 'Avsluta den pågående ändringen först.';
    if (boardActive) return plan?.status === 'utkast' ? null : 'Öppna utkastet eller skapa en ny version för att ändra.';
    if (issue.target.kind === 'start') return null;
    if (draft?.kind === 'create') return null;
    return 'Spara eller koppla utkastet till underlaget först. Åtgärda sedan i planen.';
  }
  function fixIssue(issue: PlanIssue) {
    if (actionUnavailable(issue)) return;
    setFocusIssue({...issue}); setView('plan'); setReviewing(false);
    // Den sparade tabellen behåller fördelning och sparstatus. Öppna inte replace-formuläret.
    if (!boardActive && !draft && !preparation) nextAction();
  }
  useEffect(() => {
    if (view !== 'plan' || focusIssue?.target?.kind !== 'start') return;
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById('pp-start') ?? document.getElementById('pp-guide-catalog');
      input?.scrollIntoView({block:'center'}); input?.focus({preventScroll:true});
    });
    return () => cancelAnimationFrame(frame);
  }, [view, focusIssue, draft?.kind, preparation?.kind]);
  const planBody = boardActive && plan && program ? <>
    <ProgramplanBoard key={`${epoch}-${context.assignmentId}-${plan.id}-${plan.revision}-${changePlan}`} plan={plan} locked={!changePlan} lockReason={lockReason} program={program} options={options} scope={`${epoch}-${context.assignmentId}`} disabled={busy}
      schoolPackages={{planId:plan.id,scope:`${epoch}-${context.assignmentId}`,units:workspace!.lifecycle.units,packages:packages?.planId===plan.id?packages:null,role:context.function,startedOn:plan.basisReference!.startedOn,valpaket,onValpaket:(list)=>setValpaket(current=>current?.map(old=>old.unitId===list.unitId?list:{...old,packages:[...new Map([...old.packages,...list.packages.filter(p=>p.unitId===null)].map(p=>[`${p.packageId}@${p.version}`,p])).values()]})??[list]),packageError,archived:workspace!.lifecycle.archived,disabled:busy,onPackages:acceptPackages,onSecurityFailure:securityFailure,onReadPackages:async()=>{setPackageRead(n=>n+1);}}}
      focusIssue={view==='plan'?activeFocusIssue:null} onSecurityFailure={securityFailure} onTerms={setTermValues} onReload={()=>openEducation(workspace!.education.id,workspace!.versionPage,workspace!.catalog.catalogId,plan.id,null,false,true)}/>
  </> : <>
    {draft&&draft.kind==='clone'&&draft.sourceBound&&<p className="ppb-note">Den nya versionen får samma programfördjupning och terminsfördelning som källversionen. Ändra dem i utkastet efter att det skapats.</p>}
    {program&&workspace&&<LocalPlanBoard program={program} orientationCode={workspace.education.orientationCode} choiceBlocks={draft ? draft.pin.choiceBlocks : plan?.basisReference?.choiceBlocks} options={shownOptions} refs={shownRefs}
      focusIssue={view==='plan'?activeFocusIssue:null} terms={draft?.kind==='create'?draftTerms:[]} refsEditable={canEditInline} disabled={!draft||draft.kind!=='create'||formLocked}
      onChange={(refs,terms)=>{if(draft){setDraft({...draft,refs,error:null});setDraftTerms(terms);}}}/>}
  </>;
  return <section className="protected-programplan" data-testid="protected-programplan-workspace" aria-busy={busy}>

    {error && <div className="pp-alert" role="alert"><p>{error}</p><Button disabled={busy} variant="outline" onClick={()=>{if(!hasUnsaved||confirmDiscard())void loadList(page);}}>Hämta utbildningarna igen</Button></div>}
    {notice && <output className="pp-notice">{notice}</output>}
    {!workspace&&!draft&&!showFlow&&<ProgramplanList key={flowRevision} disabled={busy} canEditPlans={context.function !== 'administrator'} onSecurityFailure={securityFailure} onLoaded={setCanCreate}
      onOpen={id=>void openEducation(id)} onCopy={id=>{copyAfterOpen.current=true;void openEducation(id);}} onNew={()=>setShowFlow(true)}/>}
    {!workspace&&!draft&&showFlow&&<div className="pps-page"><div className="pps-head-text"><button type="button" className="pps-back" disabled={busy} onClick={()=>{if(!hasUnsaved||confirmDiscard())void loadList(page);}}><ArrowLeft size={14} aria-hidden="true"/>Alla programplaner</button><h1 className="ppl-title">Ny programplan</h1><p className="ppl-sub">Välj program och inriktning. Skapa en ny utbildning eller lägg en plan på en befintlig utbildning som saknar plan.</p></div>
      <ProtectedProgramplanFlow key={flowRevision} initialMode={canCreate?'new':'existing'} scope={`${epoch}-${context.assignmentId}`} disabled={busy} onSecurityFailure={securityFailure} onOpen={(id,catalogId,planId)=>openEducation(id,1,catalogId,planId??null,null,!!planId,!!planId)}/></div>}
    {(workspace||draft)&&<div className="pps-page">
      {workspace&&<div className="pps-head">
        <div className="pps-head-text">
          <button type="button" className="pps-back" disabled={busy||termsActive} onClick={()=>{if(view==='analysis'){setView('plan');return;}if(!hasUnsaved||confirmDiscard())void loadList(page);}}><ArrowLeft size={14} aria-hidden="true"/>{view==='analysis'?'Tillbaka till planen':'Alla programplaner'}</button>
          <h2>{view==='analysis'?'Analys av programplanen':workspace.education.name}</h2>
          <p>{[program?.name??workspace.education.programCode, orientationName ?? (workspace.education.orientationCode ? workspace.education.orientationCode : null), programplanSchoolLabel(workspace.lifecycle), workspace.education.cohort??'Elevkull saknas'].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="pps-actions">
          <LifecycleBadge lifecycle={workspace.lifecycle}/>
          <span className={ready?'pps-state pp-status pps-ready':'pps-state pp-status'}>{statusText}</span>
          {analysis&&view==='plan'&&<Button variant="outline" disabled={termsActive} onClick={()=>setView('analysis')}>Analys{problems>0&&<span className="pps-badge" data-fel={analysis.counts.fel>0}>{problemLabel}</span>}</Button>}
          {!draft&&!preparation&&!copy&&canCreate&&!!plan?.basisReference&&view==='plan'&&<Button variant="outline" disabled={busy||termsActive||hasUnsaved} onClick={()=>setCopy(newCopy(workspace.education.name))}><Copy size={16} aria-hidden="true"/>Kopiera</Button>}
          {!draft&&!preparation&&<Button variant="outline" disabled={busy||termsActive} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage,workspace.catalog.catalogId,plan?.id??null)}><RefreshCw size={16}/>Läs om</Button>}
          {!draft&&!preparation&&changePlan&&!(boardActive&&plan?.status==='utkast'&&!anotherDraft)&&<Button disabled={busy||termsActive||hasUnsaved||!anotherDraft&&(nextKind==='replace'||nextKind==='clone'&&!!plan?.basisReference)&&!boundSourceMatches} onClick={nextAction}>{anotherDraft?'Öppna utkastet':<><Pencil size={16} aria-hidden="true"/>{titles[nextKind]}</>}</Button>}
          {draft&&draft.mode==='edit'&&!reviewing&&<Button disabled={busy} onClick={()=>{setView('plan');setReviewing(true);}}>Spara utkast</Button>}
          {!draft&&!preparation&&!copy&&view==='plan'&&lifecycleActions?.editDetails&&<Button variant="outline" disabled={busy||hasUnsaved} onClick={()=>setLifecycleDialog('update')}><Pencil size={16} aria-hidden="true"/>Ändra uppgifter</Button>}
          {!draft&&!preparation&&!copy&&view==='plan'&&context.function !== 'administrator' && programplanSchoolActions(workspace.lifecycle, context.function === 'huvudman' ? 'huvudman' : 'rektor').add&&<Button variant="outline" disabled={busy||hasUnsaved} onClick={()=>setLifecycleDialog('units')}>Skolor</Button>}
          {!draft&&!preparation&&!copy&&view==='plan'&&lifecycleActions?.archive&&<Button variant="outline" disabled={busy||hasUnsaved} onClick={()=>setLifecycleDialog('archive')}><Archive size={16} aria-hidden="true"/>Arkivera</Button>}
          {!draft&&!preparation&&!copy&&view==='plan'&&lifecycleActions?.restore&&<Button variant="outline" disabled={busy||hasUnsaved} onClick={()=>setLifecycleDialog('restore')}><ArchiveRestore size={16} aria-hidden="true"/>Ta fram ur arkivet</Button>}
          {!draft&&!preparation&&!copy&&view==='plan'&&lifecycleActions?.delete&&<Button variant="outline" disabled={busy||hasUnsaved} onClick={()=>setLifecycleDialog('delete')}><Trash2 size={16} aria-hidden="true"/>Ta bort</Button>}
        </div>
      </div>}
      {workspace&&!draft&&(nextKind==='replace'||nextKind==='clone'&&!!plan?.basisReference)&&!boundSourceMatches&&<p className="pp-alert" role="alert">Den här versionens sparade underlag kunde inte återfinnas. Läs om innan du ändrar eller skapar en ny version.</p>}
      {lifecycleDialog&&lifecycleTarget&&<LifecycleDialog key={lifecycleDialog} kind={lifecycleDialog} target={lifecycleTarget} onClose={()=>setLifecycleDialog(null)} onSecurityFailure={securityFailure}
        onChanged={(message,reply)=>lifecycleChanged(message,reply.command==='delete')} onStale={lifecycleStale}/>}
      {workspace&&!draft&&!preparation&&lockReason&&view==='plan'&&<output className="pp-notice ppl-lock">{lockReason}</output>}
      {view==='analysis'&&analysis&&<AnalysisView analysis={analysis} onBack={()=>setView('plan')} onFix={fixIssue} actionUnavailable={actionUnavailable}/>}
      {view==='plan'&&<>
        {workspace&&copy&&plan?.basisReference&&<section className="pps-card ppl-copy" aria-label="Kopiera till ny utbildning">
          <h3>Kopiera till ny utbildning</h3>
          <p>Den nya utbildningen får samma program, inriktning, underlag och {plan.basisReference.specializationRefs.length===1?'1 fördjupningsnivå':`${plan.basisReference.specializationRefs.length} fördjupningsnivåer`} som {workspace.education.name}. Terminsfördelningen följer med. Den sparas som ett nytt utkast; originalet ändras inte.</p>
          {copy.error&&<output role="alert" className="pp-alert">{copy.error}</output>}
          <div className="pp-new-fields">
            <div className="pp-field"><label htmlFor="ppl-copy-name">Utbildningens namn</label><input id="ppl-copy-name" value={copy.name} maxLength={120} disabled={busy||!!copy.command} onChange={e=>setCopy({...copy,name:e.target.value,error:null})}/></div>
            <div className="pp-field"><label htmlFor="ppl-copy-cohort">Elevkull</label><input id="ppl-copy-cohort" value={copy.cohort} maxLength={120} placeholder="Till exempel 2027–2030" disabled={busy||!!copy.command} onChange={e=>setCopy({...copy,cohort:e.target.value,error:null})}/></div>
            <div className="pp-field"><label htmlFor="ppl-copy-code">Lokal kod (valfri)</label><input id="ppl-copy-code" value={copy.localCode} maxLength={80} disabled={busy||!!copy.command} onChange={e=>setCopy({...copy,localCode:e.target.value,error:null})}/></div>
            <div className="pp-field"><label htmlFor="ppl-copy-start">Utbildningens exakta startdatum</label><input id="ppl-copy-start" type="date" min={nextDay(stockholmToday())} aria-invalid={!!copy.startedOn&&!startsAfter(copy.startedOn)} value={copy.startedOn} disabled={busy||!!copy.command} onChange={e=>setCopy({...copy,startedOn:e.target.value,error:null})}/></div>
          </div>
          <div className="pp-dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>{if(!copyDirty||confirmDiscard())setCopy(null);}}>Avbryt</Button>{copy.startedOn&&!startsAfter(copy.startedOn)&&<p role="alert" className="pp-alert">Startdatumet måste ligga efter i dag. En kopia kan bara skapas för en kull som inte har börjat.</p>}
          <Button disabled={busy||!copy.name.trim()||!copy.cohort.trim()||!copy.startedOn||!startsAfter(copy.startedOn)} onClick={()=>void saveCopy()}>{busy?'Sparar…':copy.command?'Försök igen':'Spara kopia'}</Button></div>
        </section>}
        {workspace&&preparation&&<section className="pp-next pps-card" aria-label="Programfördjupning"><h3>Välj underlag för {workspace.education.name}</h3>
          <p>Välj Skolverkets underlag som utkastet ska kopplas till och kontrollera hämtdatumet. Inget sparas förrän du sparar utkastet.</p>
          <div className="pp-field"><label htmlFor="pp-guide-catalog">Välj underlag</label><select id="pp-guide-catalog" value={preparation.catalogId??''} disabled={busy} onChange={e=>changeGuideCatalog(e.target.value)}><option value="">Välj underlag</option>{workspace.catalogs.map(c=><option key={c.catalogId} value={c.catalogId}>Skolverket · hämtat {c.source.fetched}</option>)}</select></div>
          {!busy&&!error&&preparation.catalogId===workspace.catalog.catalogId&&workspace.catalog.status==='selected'&&workspace.catalog.program&&workspace.catalog.source&&<p>Valt underlag: {workspace.catalog.program.name} · Skolverket · hämtat {workspace.catalog.source.fetched}.</p>}
          {workspace.catalog.status==='blocked'&&<p role="alert">{programplanDiagnostic(workspace.catalog.diagnostic??'catalog_unavailable')}</p>}
          {preparationBlocked&&<p role="alert">{preparationBlocked}</p>}
          {error&&preparation.catalogId&&<Button variant="outline" disabled={busy} onClick={()=>changeGuideCatalog(preparation.catalogId!)}>Läs underlaget igen</Button>}
          {preparation.catalogId&&legacyResolution?.problems.length ? <p role="alert">Vissa äldre val kan inte återfinnas entydigt: {legacyResolution.problems.join(', ')}. De har bevarats. Du kan inte gå vidare med detta underlag.</p>:null}
          <div className="pp-actions"><Button variant="outline" disabled={busy} onClick={cancelPreparation}>Avbryt förberedelse</Button><Button disabled={busy||!!error||!!preparationBlocked||!preparation.catalogId||preparation.catalogId!==workspace.catalog.catalogId||!sourceReady||(preparation.kind==='bind'||preparation.kind==='clone')&&(!legacyResolution||legacyResolution.problems.length>0)} onClick={()=>edit(preparation.kind)}>Fortsätt till startdatum och val</Button></div>
        </section>}
        {draft&&<section ref={draftRef} tabIndex={-1} className="pp-draft-sheet pps-draft" aria-label={titles[draft.kind]}>
          <h3 className="pp-sr">{titles[draft.kind]}</h3>
          {draft.error&&!draft.mfa&&<output role="alert" className="pp-alert">{draft.error}</output>}
          {draft.mfa&&<MfaStepUpNotice message={draft.error??'Verifiering med engångskod krävs.'} detail="Dina uppgifter finns kvar här. Om du väljer verifiering lämnar du sidan; det osparade formuläret följer inte med."/>}
          {(draft.kind==='create'||draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<div className="pp-field pps-start"><label htmlFor="pp-start">Utbildningens exakta startdatum</label><input id="pp-start" type="date" value={draft.startedOn} disabled={formLocked} aria-describedby="pp-start-help" onChange={e=>setDraft({...draft,startedOn:e.target.value,error:null,mfa:false})}/><p id="pp-start-help">Den dag utbildningen började eller börjar enligt utbildningens uppgifter, inte dagens datum.</p></div>}
          {!editableRefs&&<><p>Alla tidigare val följer med i samma ordning. Ändra själva valen efteråt.</p>{(draft.kind==='bind'||draft.kind==='clone'&&!draft.sourceBound)&&<label className="pp-check"><input type="checkbox" disabled={formLocked} checked={draft.legacyConfirmed} onChange={e=>setDraft({...draft,legacyConfirmed:e.target.checked,error:null})}/><span>Jag har kontrollerat att alla äldre val bevaras i samma ordning och att startdatum samt underlag gäller för utbildningen.</span></label>}</>}
          <div hidden={draft.mode==='edit'&&reviewing}>{planBody}</div>
          {!analysis&&draft.refs.length>0&&<ol className="pp-edit-levels" aria-label="Dina fördjupningsval">{draft.refs.map((r,i)=><li key={`${i}-${r.itemCode}`}><strong>{programplanLevelName(r,draft.options)}</strong><span>{r.itemCode} · {r.points} poäng</span></li>)}</ol>}
          {draft.mode==='edit'&&reviewing&&analysis&&<SaveDialog analysis={analysis} busy={busy} onCancel={()=>setReviewing(false)} onAnalysis={()=>{setReviewing(false);setView('analysis');}} onConfirm={()=>void saveDraft()}>
            <p className="pps-note">{draft.educationName} · start {draft.startedOn||'saknas'} · {draft.refs.length===1?'1 vald nivå':`${draft.refs.length} valda nivåer`}. Planen förblir ett utkast och fastställs inte.</p></SaveDialog>}
          {draft.mode==='edit'&&reviewing&&!analysis&&<section className="pps-dialog" aria-label="Kontrollera före sparning"><p>Underlaget kunde inte analyseras. {draft.refs.length===1?'1 vald nivå':`${draft.refs.length} valda nivåer`} sparas som utkast.</p><div className="pps-dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setReviewing(false)}>Tillbaka till uppgifterna</Button><Button disabled={busy} onClick={()=>void saveDraft()}>{busy?'Sparar…':'Spara utkast'}</Button></div></section>}
          {draft.mode==='refreshing'&&<output>Hämtar aktuellt underlag. Dina uppgifter behålls…</output>}
          {draft.mode==='compare'&&<div className="pp-comparison" aria-live="polite"><p>{draft.uncertain?'Sparandet kunde inte bekräftas. Aktuellt underlag har lästs om.':'Planen eller utbildningen ändrades av någon annan. Aktuellt underlag har lästs om.'}</p><p>Aktuella fördjupningsval: {namedChoices(plan?.basisReference?.specializationRefs??[])}</p><p>Dina fördjupningsval: {namedChoices(draft.refs,draft.options)}</p><details><summary>Jämför referenser och revisioner</summary><p>Aktuell revision: {plan?.revision??'Ingen plan'} · ditt tidigare underlag: revision {draft.expectedRevision}.</p><p>Aktuella referenser: {plan?.basisReference?.specializationRefs.map(r=>r.itemCode).join(', ')||'Inga bundna val'}</p><p>Dina referenser: {draft.refs.map(r=>r.itemCode).join(', ')||'Inga val'}</p></details>{!retryCompatible(draft)&&<p>Detta kommando kan inte skickas igen automatiskt. Stäng formuläret och granska den aktuella versionen innan du väljer nästa åtgärd.</p>}</div>}
          {draft.mode==='applied'&&<output className="pp-notice">Ett aktuellt utkast innehåller redan samma bundna underlag och val. Inget nytt sparande behövs.</output>}
          {<div className="pp-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeDraft}>{draft.mode==='applied'?'Stäng':'Avbryt'}</Button>{draft.mode==='refresh-failed'&&<Button disabled={busy} onClick={()=>void reloadDraft()}>Läs om underlaget</Button>}{draft.mode==='compare'&&<Button disabled={busy||!retryCompatible(draft)} onClick={()=>void saveDraft()}>{busy?'Sparar…':'Använd mina val'}</Button>}</div>}
        </section>}

        {workspace&&!program&&!preparation&&<output className="pp-alert">Skolverkets underlag för planen är inte valt eller inte tillgängligt. Välj underlag via {titles[nextKind]} för att se tabellen.</output>}
        {!draft&&plan&&!plan.basisReference&&<section className="pp-saved pps-card" aria-label="Dina sparade fördjupningsval"><h3>Äldre sparade val</h3><p>Valen visas precis som de lagrats. De behöver kopplas till ett underlag innan de kan ändras.</p><ol className="pp-levels">{(legacy??[]).map((code,i)=><li key={`${i}-${code}`}><strong>{code||'(Tomt äldre värde)'}</strong></li>)}</ol>{legacy?.length===0&&<p>Inga äldre fördjupningsval sparade.</p>}</section>}
      </>}
      {!draft&&<div hidden={view==='analysis'}>{planBody}</div>}
      {workspace&&<details className="pp-underlying pps-details"><summary>Underlag och tidigare versioner</summary>
        <section className="pp-source" aria-label="Versionsbundet katalogunderlag"><h3>Underlag</h3><p>Fastställande är stängt här. Gymnasiepoäng omvandlas inte till undervisningstimmar.</p>
          {plan&&<p>Version {plan.version} · Revision {plan.revision}{plan.decidedOn&&` · Beslut ${plan.decidedOn}`}</p>}
          {plan?.basisReference&&<p>Utbildningsstart: {plan.basisReference.startedOn}. Katalog, programgrund och start hör till denna version.</p>}
          {workspace.catalog.status==='unselected'&&<p>Inget underlag är valt.</p>}
          {workspace.catalog.status==='blocked'&&<p role="alert">{programplanDiagnostic(workspace.catalog.diagnostic??'catalog_unavailable')}</p>}
          {workspace.catalog.status==='selected'&&workspace.catalog.program&&<><p>{workspace.catalog.program.name} ({workspace.catalog.program.code}), programversion {workspace.catalog.program.version}</p><p>Gäller från {workspace.catalog.program.startDate??'Datum saknas'}{workspace.catalog.program.endDate&&` till ${workspace.catalog.program.endDate}`}{workspace.catalog.program.canceledDate&&` · Upphävt ${workspace.catalog.program.canceledDate}`}</p><p>Källa: <a href={workspace.catalog.source!.url} target="_blank" rel="noreferrer">Skolverkets källunderlag</a> · hämtat {workspace.catalog.source!.fetched}, API {workspace.catalog.source!.apiVersion}</p><p className="pp-code">Exakt katalogreferens: {workspace.catalog.catalogId}</p></>}
        </section>
        <section aria-label="Tidigare versioner"><h3>Versioner</h3><div className="pp-versions">{workspace.versions.map(v=><button type="button" className={`pp-version ${v.id===plan?.id?'pp-selected':''}`} key={v.id} disabled={busy||termsActive} onClick={()=>openVersion(v)} aria-label={`Version ${v.version} · ${programplanStatus[v.status]}`}><strong>Version {v.version} · {programplanStatus[v.status]}</strong><span>Revision {v.revision}{v.decidedOn&&` · Beslut ${v.decidedOn}`}</span><span>{v.catalogId?'Versionsbundet underlag':'Äldre, obundet underlag'}</span></button>)}</div>
          {workspace.versionCount>50&&<nav className="pp-pagination" aria-label="Versionernas sidor"><Button variant="outline" disabled={workspace.versionPage===1||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage-1,workspace.catalog.catalogId,plan?.id??null)}>Föregående versioner</Button><span>Sida {workspace.versionPage} av {Math.ceil(workspace.versionCount/50)}</span><Button variant="outline" disabled={workspace.versionPage*50>=workspace.versionCount||busy} onClick={()=>void openEducation(workspace.education.id,workspace.versionPage+1,workspace.catalog.catalogId,plan?.id??null)}>Nästa versioner</Button></nav>}
        </section>
      </details>}
    </div>}
  </section>;
}
