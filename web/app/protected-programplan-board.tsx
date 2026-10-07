'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Plus, Search, SplitSquareHorizontal, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import { defaultProgramplanChoiceBlocks, type ProgramplanChoiceBlock } from '@/lib/programplan-choice-blocks.ts';
import type { CatalogProgram, ProgramplanLevelRef, ProgramplanBasisReference } from '@/lib/programplan-catalog.ts';
import { programplanReference, sameProgramplanLevels, type ProgramplanOption } from '@/lib/protected-programplan.ts';
import { PROGRAMPLAN_TERMS, firstYear, programplanLevelRanks, programplanTermRows, programplanPreviewRows, programplanTermTarget, suggestProgramplanTerms, validateProgramplanTermDistribution,
  type ProgramplanTermDistribution, type ProgramplanTermPart, type ProgramplanTermPoints, type ProgramplanTermRow } from '@/lib/programplan-terms.ts';
import { parseProgramplanTermReply, type ProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import type { PlanIssue } from '@/lib/programplan-analysis.ts';
import { programFrame, frameStatus } from '@/lib/programplan-table.ts';
import MfaStepUpNotice from './mfa-step-up';
import { planningYearLabel, type GymYearProjection } from '@/lib/planning-year-model.ts';

export type PlanningGymYearView = { projection: GymYearProjection; year: 0 | 1 | 2 | 'all';
  onYear: (year: 0 | 1 | 2 | 'all') => void; canChangeYear?: () => boolean };

type Props = {
  yearView?: PlanningGymYearView;
  focusIssue?: PlanIssue | null;
  plan: Programplan; program: CatalogProgram; options: ProgramplanOption[]; scope: string; disabled: boolean;
  /** 05-20: planen har startat eller är arkiverad; tabellen blir skrivskyddad. */ locked?: boolean; lockReason?: string | null;
  onSecurityFailure: (error: unknown) => boolean;
  /** Läs om utbildningen efter en ändring av programfördjupningen. */
  onReload: () => Promise<void>;
  /** Parent behåller spärren om återläsning monterar av tabellen. */
  onNavigationBlocked: (blocked: boolean) => void;
  /** Aktuell fördelning, för analysen i arbetsytan. */
  onTerms: (distribution: ProgramplanTermDistribution | null) => void;
};
type SaveState = 'idle' | 'saving' | 'conflict' | 'unknown' | 'error' | 'mfa';
const fmt = (n: number) => n.toLocaleString('sv-SE');
const blank = (): ProgramplanTermPoints => [0, 0, 0, 0, 0, 0];
const sum = (p: ProgramplanTermPoints) => p.reduce((a, b) => a + b, 0);
const partTitle: Record<ProgramplanTermPart, string> = { foundation: 'Gymnasiegemensamma ämnen', programmeSpecific: 'Programgemensamma ämnen', orientation: 'Inriktning',
  specialization: 'Programfördjupning', individualChoice: 'Individuellt val', diplomaWork: 'Gymnasiearbete' };
const partColor: Record<ProgramplanTermPart, string> = { foundation: '#2d4cc1', programmeSpecific: '#6f8cf0', orientation: '#a9bcff', specialization: '#0e8f83', individualChoice: '#c8d1df', diplomaWork: '#c8d1df' };
const order: ProgramplanTermPart[] = ['foundation', 'programmeSpecific', 'orientation', 'specialization', 'individualChoice', 'diplomaWork'];
const toMap = (d: ProgramplanTermDistribution) => new Map(d.map(r => [r.rowKey, r.points]));
const fromMap = (rows: ProgramplanTermRow[], m: Map<string, ProgramplanTermPoints>): ProgramplanTermDistribution =>
  rows.flatMap(r => { const p = m.get(r.key); return p && p.some(n => n !== 0) ? [{ rowKey: r.key, points: [...p] as ProgramplanTermPoints }] : []; });
const sameRow = (a?: ProgramplanTermPoints, b?: ProgramplanTermPoints) => (a ?? blank()).every((n, i) => n === (b ?? blank())[i]);

/** Programplanen som en tabell: ämnen, programfördjupning och sex terminer. Sparas automatiskt när en rad lämnas. */
export default function ProgramplanBoard({ yearView, focusIssue, plan, program, options, scope, disabled, locked: lifecycleLocked = false, lockReason = null, onSecurityFailure, onReload, onNavigationBlocked, onTerms }: Props) {
  const basis = plan.basisReference!;
  const rows = useMemo(() => programplanTermRows(program, basis), [program, basis]);
  const ranks = useMemo(() => programplanLevelRanks(program), [program]);
  // 05-20: arbetsytan skickar locked när planen har startat eller är arkiverad (serverns lifecycle).
  const editable = plan.status === 'utkast' && !disabled && !lifecycleLocked;
  const [saved, setSaved] = useState<ProgramplanTermReply | null>(null);
  const [values, setValues] = useState<Map<string, ProgramplanTermPoints>>(new Map());
  const [state, setState] = useState<SaveState>('idle'), [message, setMessage] = useState<string | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const valuesRef = useRef(values), savedRef = useRef(saved), saving = useRef(false), pending = useRef(false), mounted = useRef(true);
  const controller = useRef<AbortController | null>(null), stateRef = useRef<SaveState>('idle'), workingRef = useRef(false);
  const pendingBlur = useRef(false);
  const reportBlocked = useCallback(() => { onNavigationBlocked(saving.current || workingRef.current || stateRef.current === 'saving' || stateRef.current === 'unknown'); }, [onNavigationBlocked]);
  const changeState = useCallback((next: SaveState) => {
    stateRef.current = next; setState(next);
    onNavigationBlocked(saving.current || workingRef.current || next === 'saving' || next === 'unknown');
  }, [onNavigationBlocked]);
  function changeWorking(next: boolean) { workingRef.current = next; setWorking(next); reportBlocked(); }
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const savedMap = useMemo(() => toMap(saved?.distribution ?? []), [saved]);
  const dirtyKeys = rows.filter(r => !sameRow(values.get(r.key), savedMap.get(r.key))).map(r => r.key);
  const invalid = (r: ProgramplanTermRow) => { const p = values.get(r.key) ?? blank(); return p.some(n => !Number.isSafeInteger(n) || n < 0) || sum(p) > r.points; };
  const anyInvalid = rows.some(invalid);
  const navigationBlocked = working || state === 'saving' || state === 'unknown';
  useUnsavedChanges(`programplan-board-${scope}`, dirtyKeys.length > 0 || navigationBlocked);
  useUnsavedChanges(`navigation-block:programplan-board-${scope}`, navigationBlocked);
  const distribution = useMemo(() => fromMap(rows, values), [rows, values]);
  useEffect(() => { onTerms(saved ? distribution : null); }, [saved, distribution, onTerms]);
  useEffect(() => () => onTerms(null), [onTerms]);

  const failed = useCallback((e: unknown) => e instanceof DOMException && e.name === 'AbortError' || onSecurityFailure(e), [onSecurityFailure]);
  const readTerms = useCallback(async (signal: AbortSignal) => {
    const body = parseProgramplanTermReply(await api.post('/api/programplaner/terminer/lasa', { planId: plan.id }, signal));
    if (body.planId !== plan.id) throw new Error('Fel plan i svaret.');
    validateProgramplanTermDistribution(rows, body.distribution);
    return body;
  }, [plan.id, rows]);
  useEffect(() => {
    const c = new AbortController(); controller.current = c;
    void (async () => {
      try {
        const body = await readTerms(c.signal); if (!mounted.current) return;
        if (body.revision !== plan.revision) { setLoadError('Planen har ändrats sedan den lästes. Läs om planen.'); return; }
        savedRef.current = body; setSaved(body); setValues(toMap(body.distribution));
      } catch (e) { if (mounted.current && !failed(e)) setLoadError('Terminsfördelningen kunde inte hämtas. Läs om planen.'); }
    })();
    return () => c.abort();
  }, [readTerms, plan.revision, failed]);

  const save = async (): Promise<boolean> => {
    if (!savedRef.current || plan.status !== 'utkast' || stateRef.current === 'unknown') return false;
    if (saving.current) { pending.current = true; return false; }
    const own = fromMap(rows, valuesRef.current);
    try { validateProgramplanTermDistribution(rows, own); } catch { changeState('error'); setMessage('Rätta de markerade raderna. En rad kan inte ha fler poäng än nivån.'); return false; }
    const before = savedRef.current;
    if (own.length === before.distribution.length && own.every(r => sameRow(r.points, toMap(before.distribution).get(r.rowKey)))) return true;
    saving.current = true; changeState('saving'); setMessage(null);
    const c = new AbortController();
    try {
      const body = parseProgramplanTermReply(await api.post('/api/programplaner/terminer', { planId: plan.id, expectedRevision: before.revision, distribution: own }, c.signal));
      if (body.planId !== plan.id || body.revision !== before.revision + 1) throw new Error('Sparandet kunde inte bekräftas.');
      if (!mounted.current) return true;
      savedRef.current = body; setSaved(body); changeState('idle'); return true;
    } catch (e) {
      if (!mounted.current || failed(e)) return false;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { changeState('mfa'); setMessage('Verifiera med engångskod för att spara. Dina värden finns kvar tills du lämnar sidan.'); }
      else if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') { changeState('conflict'); setMessage('Någon annan har ändrat planen. Dina osparade värden finns kvar.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && (e.code === 'bad_request' || e.code === 'audit_unavailable')) { changeState('error'); setMessage(`Kunde inte spara. ${e.message}`); }
      else {
        try {
          const back = await readTerms(c.signal); if (!mounted.current) return false;
          if (back.revision === before.revision + 1 && back.distribution.length === own.length && own.every(r => sameRow(r.points, toMap(back.distribution).get(r.rowKey)))) { savedRef.current = back; setSaved(back); changeState('idle'); return true; }
          savedRef.current = back; setSaved(back); changeState('conflict'); setMessage('Aktuell fördelning har lästs. Jämför dina värden innan du sparar igen.');
        } catch (inner) { if (mounted.current && !failed(inner)) { changeState('unknown'); setMessage('Sparstatus kunde inte läsas. Dina värden finns kvar.'); } }
      }
      return false;
    } finally {
      saving.current = false; reportBlocked();
      if (pending.current && mounted.current && !['unknown', 'conflict', 'mfa'].includes(stateRef.current)) { pending.current = false; queueMicrotask(() => void save()); }
    }
  };

  const update = (key: string, points: ProgramplanTermPoints) => { const next = new Map(valuesRef.current); next.set(key, points); valuesRef.current = next; setValues(next); if (state === 'error') { changeState('idle'); setMessage(null); } };
  const commit = () => {
    if (editable && ['idle', 'saving', 'error'].includes(stateRef.current)) {
      // Blur kan starta sparning före nästa navigationsklick; parent spärras direkt.
      pendingBlur.current = true; onNavigationBlocked(true);
      queueMicrotask(() => { void save().finally(() => { pendingBlur.current = false; if (mounted.current) reportBlocked(); }); });
    }
  };
  const setCell = (row: ProgramplanTermRow, i: number, raw: string) => { const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints; const n = raw.trim() === '' ? 0 : Number(raw); p[i] = Number.isFinite(n) ? n : NaN; update(row.key, p); };
  const fillCell = (row: ProgramplanTermRow, i: number) => {
    const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints, rest = row.points - sum(p);
    if (p[i] === 0 && rest > 0) { p[i] = rest; update(row.key, p); }
  };
  const splitYear = (row: ProgramplanTermRow) => { const y = firstYear(values.get(row.key)) ?? 0, p = blank(); p[y * 2] = Math.floor(row.points / 2); p[y * 2 + 1] = row.points - p[y * 2]; update(row.key, p); commit(); };
  const clearRow = (row: ProgramplanTermRow) => { update(row.key, blank()); commit(); };
  const suggest = () => { const next = suggestProgramplanTerms(rows, fromMap(rows, values), ranks); valuesRef.current = toMap(next); setValues(valuesRef.current); commit(); };
  async function keepMine() {
    if (saving.current || workingRef.current || stateRef.current === 'saving') return;
    const c = new AbortController(); changeState('saving');
    try {
      const currentPlan = parseProgramplan(await api.post('/api/programplaner/lasa', { planId: plan.id }, c.signal));
      if (!mounted.current) return;
      if (currentPlan.id !== plan.id) throw new Error('Fel plan i sparstatus.');
      if (currentPlan.status !== 'utkast' || JSON.stringify(currentPlan.basisReference) !== JSON.stringify(plan.basisReference)) {
        await onReload(); return;
      }
      const back = await readTerms(c.signal); if (!mounted.current) return;
      if (back.revision !== currentPlan.revision) throw new Error('Planen ändrades under sparstatusläsningen.');
      savedRef.current = back; setSaved(back); changeState('idle'); setMessage(null); await save();
    } catch (e) { if (mounted.current && !failed(e)) { changeState('unknown'); setMessage('Sparstatus kunde inte läsas. Dina värden finns kvar. Läs om planen.'); } }
  }

  async function changeSpecialization(refs: ProgramplanLevelRef[], cleared?: string) {
    if (!editable || workingRef.current || saving.current || ['saving', 'unknown'].includes(stateRef.current)) return;
    changeWorking(true); setMessage(null);
    try {
      if (cleared && values.get(cleared)?.some(n => n > 0)) { update(cleared, blank()); valuesRef.current = new Map(valuesRef.current).set(cleared, blank()); }
      if (dirtyKeys.length || cleared) { if (!await save()) return; }
      const expected = savedRef.current!.revision, c = new AbortController();
      const reply = parseProgramplan(await api.post('/api/programplaner/fordjupning', { planId: plan.id, expectedRevision: expected, specializationRefs: refs.map(programplanReference) }, c.signal));
      if (reply.id !== plan.id || reply.revision !== expected + 1 || !sameProgramplanLevels(reply.basisReference?.specializationRefs ?? [], refs)) throw new Error('Sparandet kunde inte bekräftas.');
      await onReload();
    } catch (e) {
      if (!mounted.current || failed(e)) return;
      if (e instanceof ApiError && e.status === 409) { changeState('conflict'); setMessage('Någon annan har ändrat planen. Läs om planen innan du ändrar fördjupningen.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { changeState('mfa'); setMessage('Verifiera med engångskod för att ändra fördjupningen.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && ['bad_request', 'audit_unavailable', 'forbidden'].includes(e.code)) setMessage(`Kunde inte ändra fördjupningen. ${e.message}`);
      else {
        // Okänt svar: läs tillbaka i stället för att skriva igen.
        try {
          const back = parseProgramplan(await api.post('/api/programplaner/lasa', { planId: plan.id }, new AbortController().signal));
          if (back.id === plan.id && back.revision === (savedRef.current?.revision ?? -1) + 1 && sameProgramplanLevels(back.basisReference?.specializationRefs ?? [], refs)) { await onReload(); return; }
          if (back.id !== plan.id) throw new Error('Fel plan i sparstatus.');
          await onReload();
        } catch (inner) { if (mounted.current && !failed(inner)) { changeState('unknown'); setMessage('Sparstatus kunde inte läsas. Läs om planen innan du försöker igen.'); } }
      }
    } finally { if (mounted.current) changeWorking(false); }
  }

  async function reloadBoard() {
    try { await onReload(); }
    catch (e) { if (mounted.current && !failed(e)) { changeState('unknown'); setMessage('Aktuell sparstatus kunde inte läsas. Läs om planen innan du lämnar den.'); } }
  }
  const locked = !editable || working || state === 'conflict' || state === 'unknown' || state === 'mfa';

  if (loadError) return <div className="pp-alert" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => void reloadBoard()}>Läs om planen</Button></div>;
  if (!saved) return <output className="ppb-loading">Hämtar programplanen…</output>;
  return <PlanGrid yearView={yearView} canChangeYear={() => !pendingBlur.current && !saving.current && !workingRef.current
      && !['saving', 'unknown'].includes(stateRef.current)}
    focusIssue={focusIssue} program={program} orientationCode={basis.orientationCode} refs={basis.specializationRefs} options={options} rows={rows} values={values}
    choiceBlocks={basis.choiceBlocks} dirtyKeys={dirtyKeys} editable={editable} refsEditable={editable} locked={locked} busy={state === 'saving' || working}
    status={state === 'saving' ? 'Sparar…' : dirtyKeys.length && state === 'idle' ? 'Osparade ändringar' : state === 'idle' ? 'Allt sparat' : ''} statusTone={state === 'idle' && dirtyKeys.length ? 'dirty' : state}
    hint={lifecycleLocked ? lockReason : editable ? `Klicka i en tom terminsruta för att lägga nivåns återstående poäng där, eller skriv antal. Ändringar sparas när du lämnar raden.${anyInvalid ? ' Rader med för många poäng sparas inte förrän de är rättade.' : ''}` : plan.status !== 'utkast' ? `Version ${plan.version} är ${plan.status === 'faststalld' ? 'fastställd' : 'ersatt'} och kan inte ändras. Skapa en ny version för att ändra.` : null}
    onCell={setCell} onFill={fillCell} onSplit={splitYear} onClear={clearRow} onSuggest={suggest} onRowLeave={commit}
    onAdd={o => void changeSpecialization([...basis.specializationRefs, programplanReference(o)])} onRemove={(ref, key) => void changeSpecialization(basis.specializationRefs.filter(r => r !== ref), key)}>
    {message && state !== 'mfa' && <div className={state === 'idle' ? 'pp-notice' : 'pp-alert'} role="alert"><p>{message}</p>
      {state === 'conflict' && <div className="pp-actions"><Button variant="outline" onClick={() => void reloadBoard()}>Läs om planen</Button>{dirtyKeys.length > 0 && <Button onClick={() => void keepMine()}>Spara mina värden</Button>}</div>}
      {state === 'unknown' && <div className="pp-actions"><Button variant="outline" onClick={() => void reloadBoard()}>Läs om planen</Button><Button onClick={() => void keepMine()}>Försök spara igen</Button></div>}</div>}
    {state === 'mfa' && <MfaStepUpNotice message={message ?? 'Verifiering med engångskod krävs.'} detail="Dina värden finns kvar här. Om du väljer verifiering lämnar du sidan; osparade värden följer inte med."/>}
  </PlanGrid>;
}


type GridProps = {
  yearView?: PlanningGymYearView;
  canChangeYear?: () => boolean;
  choiceBlocks?: ProgramplanChoiceBlock[];
  focusIssue?: PlanIssue | null;
  program: CatalogProgram; orientationCode: string | null; refs: ProgramplanLevelRef[]; options: ProgramplanOption[];
  rows: ProgramplanTermRow[]; values: Map<string, ProgramplanTermPoints>; dirtyKeys: string[];
  /** Terminerna kan ändras. */ editable: boolean; /** Programfördjupningen kan ändras. */ refsEditable: boolean; locked: boolean; busy: boolean;
  status: string | null; statusTone: string; hint: string | null; children?: React.ReactNode;
  onCell: (row: ProgramplanTermRow, i: number, raw: string) => void; onFill: (row: ProgramplanTermRow, i: number) => void;
  onSplit: (row: ProgramplanTermRow) => void; onClear: (row: ProgramplanTermRow) => void; onSuggest: () => void; onRowLeave: () => void;
  onAdd: (option: ProgramplanOption) => void; onRemove: (ref: ProgramplanLevelRef, rowKey: string) => void;
};
/** Den gemensamma tabellen: årskurskort, verktyg och ämnen med sex terminer. Samma vy för sparade utkast och nya planer. */
export function PlanGrid({ yearView, canChangeYear, choiceBlocks, focusIssue, program, orientationCode, refs, options, rows, values, dirtyKeys, editable, refsEditable, locked, busy, status, statusTone, hint, children,
  onCell, onFill, onSplit, onClear, onSuggest, onRowLeave, onAdd, onRemove }: GridProps) {
  const [localYear, setLocalYear] = useState<0 | 1 | 2 | 'all'>('all'), [onlyOpen, setOnlyOpen] = useState(false), [query, setQuery] = useState('');
  const projection = yearView?.projection;
  const analysisContext = JSON.stringify([yearView?.year ?? null, projection?.schoolYear ?? null, projection?.startedOn ?? null, projection?.relativeYear ?? null]);
  const [analysisYear, setAnalysisYear] = useState<{ issue: PlanIssue; year: 0 | 1 | 2 | null; context: string } | null>(null);
  if (analysisYear && analysisYear.context !== analysisContext) setAnalysisYear({ ...analysisYear, year: null, context: analysisContext });
  const year = analysisYear && analysisYear.year !== null && analysisYear.issue === focusIssue && analysisYear.context === analysisContext ? analysisYear.year : yearView?.year ?? localYear;
  const termLabel = (index: number) => projection?.terms.find(term => term.index === index)?.label ?? PROGRAMPLAN_TERMS[index];
  function chooseYear(next: 0 | 1 | 2 | 'all') {
    if (busy || canChangeYear?.() === false || yearView?.canChangeYear?.() === false) return;
    setAnalysisYear(null); setLocalYear(next); yearView?.onYear(next);
  }
  const invalid = (r: ProgramplanTermRow) => { const p = values.get(r.key) ?? blank(); return p.some(n => !Number.isSafeInteger(n) || n < 0) || sum(p) > r.points; };
  const frame = programFrame(program, orientationCode);
  const status_ = frameStatus(frame, refs, choiceBlocks);
  const chosen = new Set(refs.map(r => `${r.subjectCode}:${r.itemCode}`));
  const q = query.trim().toLocaleLowerCase('sv');
  const available = options.filter(o => !chosen.has(`${o.subjectCode}:${o.itemCode}`));
  const matches = q ? available.filter(o => `${o.subjectName} ${o.name} ${o.itemCode}`.toLocaleLowerCase('sv').includes(q)).slice(0, 12) : available.slice(0, 3);
  const termTotals = PROGRAMPLAN_TERMS.map((_, i) => rows.reduce((s, r) => s + ((values.get(r.key) ?? blank())[i] || 0), 0));
  const rowTotal = rows.reduce((s, r) => s + r.points, 0), total = programplanTermTarget(program, rows), assigned = termTotals.reduce((a, b) => a + b, 0);
  const missingRowsPoints = Math.max(0, total - rowTotal);
  const openRows = rows.filter(r => sum(values.get(r.key) ?? blank()) < r.points);
  const unresolved = [...program.foundation, ...program.programmeSpecific, ...(program.orientations.find(o => o.code === orientationCode)?.subjects ?? [])].filter(s => (s.optional || !s.levels.length || s.subjectVersion === null)
    && !rows.some(r => r.key.startsWith('alternative:') && r.key.split(':').slice(2).join(':').split('+').some(ref => ref.split(':')[0] === s.code))
    && !rows.some(r => r.key === `block:${({ MOSP: 'mosp', SPRK: 'sprk', NAVE: 'nave' } as Record<string, string>)[s.code]}`));
  const shownRows = onlyOpen ? rows.filter(r => openRows.includes(r) || dirtyKeys.includes(r.key)) : rows;
  const gridRef = useRef<HTMLElement | null>(null), handledFocus = useRef<PlanIssue | null>(null);
  const target = focusIssue?.target;
  const targetRow = target?.kind === 'row' ? target.rowKey : target?.kind === 'specialization' && target.mode === 'remove' ? rows.find(r=>r.part==='specialization')?.key : null;
  useEffect(() => {
    if (!focusIssue || handledFocus.current === focusIssue || analysisYear?.issue === focusIssue && analysisYear.year === null || !target || target.kind === 'start' || target.kind === 'orientation') return;
    const term = targetRow ? (values.get(targetRow)?.findIndex(n=>n>0) ?? -1) : -1;
    const targetYear = term < 0 ? 0 : Math.floor(term / 2);
    // Återställ urvalet först. Fokus väntar på renderingen där målraden finns.
    if (onlyOpen || targetRow && year !== targetYear) {
      const frame = requestAnimationFrame(() => {
        setOnlyOpen(false); if (targetRow) setAnalysisYear({ issue: focusIssue, year: targetYear as 0 | 1 | 2, context: analysisContext });
      });
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => {
      const grid = gridRef.current;
      const row = targetRow ? grid?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(targetRow)}"]`) : null;
      const control = target.kind === 'specialization' && target.mode === 'add' ? grid?.querySelector<HTMLInputElement>('input[type="search"]')
        : target.kind === 'specialization' ? row?.querySelector<HTMLButtonElement>('button[aria-label^="Ta bort"]')
        : row?.querySelector<HTMLInputElement>(`input[data-term="${term < 0 ? 0 : term}"]`) ?? grid?.querySelector<HTMLButtonElement>('.ppb-year');
      if (!control?.getClientRects().length) return;
      (row ?? control).scrollIntoView({block:'center'}); control.focus({preventScroll:true});
      if (document.activeElement === control) handledFocus.current = focusIssue;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusIssue, target, targetRow, values, onlyOpen, year, analysisContext, analysisYear]);

  return <section ref={gridRef} className="ppb" aria-label="Programplanen" aria-busy={busy} data-year={year}>
    <div className="ppb-years">{[0, 1, 2].map(y => { const s = termTotals[y * 2] + termTotals[y * 2 + 1]; return <button type="button" key={y} className="ppb-year" aria-pressed={year === y} disabled={busy} onClick={() => chooseYear(y as 0 | 1 | 2)}>
      <span>Årskurs {y + 1}</span><strong>{fmt(s)} <small>poäng</small></strong><span className="ppb-year-terms">{projection?.terms.length ? termLabel(y * 2) : 'HT'} {fmt(termTotals[y * 2])} · {projection?.terms.length ? termLabel(y * 2 + 1) : 'VT'} {fmt(termTotals[y * 2 + 1])}</span>
      <span className="ppb-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, total ? s / (total / 3) * 100 : 0)}%` }}/></span></button>; })}</div>
    <div className="ppb-toolbar">
      <p><strong>{fmt(assigned)}</strong> av {fmt(total)} poäng fördelade{openRows.length ? ` · ${openRows.length} ${openRows.length === 1 ? 'nivå' : 'nivåer'} kvar` : missingRowsPoints ? ` · ${fmt(missingRowsPoints)} poäng återstår att lägga till` : ' · allt fördelat'}</p>
      {status !== null && <output className={`ppb-save ppb-save-${statusTone}`}>{status}</output>}
      {editable && <div className="ppb-tools">
        <Button variant="outline" disabled={locked || openRows.length === 0} onClick={onSuggest} title={openRows.length ? 'Fyller bara i nivåer som saknar terminer' : 'Alla nivåer har redan terminer'}><Wand2 size={15} aria-hidden="true"/>Föreslå fördelning</Button>
        <Button variant="outline" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)}>{onlyOpen ? 'Visa alla rader' : 'Visa bara ofördelade'}</Button>
      </div>}
    </div>
    {children}
    {projection && <p className="ppb-year-context">{projection.relativeYear === null
      ? `Årsdelen för ${planningYearLabel(projection.schoolYear)} är okänd eller ligger utanför kullens tre år.`
      : `Planeringsläsåret ${planningYearLabel(projection.schoolYear)} avser årskurs ${projection.relativeYear}.`}
      {projection.startedOn && ` Planversionens startdatum: ${projection.startedOn}.`}
      {year === 'all' ? ' Visar hela planen.' : projection.relativeYear !== year + 1 ? ` Visar årskurs ${year + 1}, en annan del av planen.` : ''}</p>}
    {projection?.diagnostics.includes('allocation-before-start') && <p className="ppb-note">Poäng är fördelade före planversionens startdatum. Kontrollera fördelningen; inga poäng flyttas automatiskt.</p>}
    <div className="ppb-year-controls"><fieldset className="ppb-mobile-years" aria-label="Visa årskurs">{[0, 1, 2].map(y => <button key={y} type="button" disabled={busy}
      aria-pressed={year === y} onClick={() => chooseYear(y as 0 | 1 | 2)}>Åk {y + 1}</button>)}</fieldset>
      <button type="button" className="ppb-whole-plan" disabled={busy} aria-pressed={year === 'all'} onClick={() => chooseYear('all')}>Visa hela planen</button>
      {projection?.relativeYear && <button type="button" className="ppb-whole-plan" disabled={busy} onClick={() => chooseYear((projection.relativeYear! - 1) as 0 | 1 | 2)}>Visa planeringsårets del</button>}</div>
    <section className="ppb-table-wrap" aria-label="Programplanens terminer, kan rullas i sidled"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla hela sexterminsplanen.
      tabIndex={0}><table className="ppb-table">
      <caption className="pp-sr">Ämnen, nivåer och poäng per termin</caption>
      <thead><tr><th scope="col">Ämne och nivå</th><th scope="col" className="ppb-num">Poäng</th>
        {PROGRAMPLAN_TERMS.map((t, i) => <th scope="col" key={t} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{projection?.terms.length ? termLabel(i) : i % 2 ? 'VT' : `Åk ${Math.floor(i / 2) + 1} HT`}</th>)}
        <th scope="col" className="ppb-state">Fördelat</th></tr></thead>
      {order.map(part => {
        const list = shownRows.filter(r => r.part === part);
        const extra = part === 'specialization';
        if (!list.length && !extra) return null;
        const partPoints = rows.filter(r => r.part === part).reduce((s, r) => s + r.points, 0);
        return <tbody key={part}>
          <tr className="ppb-group"><th colSpan={2} scope="colgroup"><i style={{ background: partColor[part] }}/>{part === 'orientation' ? `Inriktning: ${program.orientations.find(o => o.code === orientationCode)?.name ?? ''}` : partTitle[part]}
            <small>{extra && frame.specializationRoom !== null ? `${fmt(status_.chosen)} av ${fmt(frame.specializationRoom)} poäng` : `${fmt(partPoints)} poäng`}</small></th>
            {PROGRAMPLAN_TERMS.map((t, i) => <td key={t} className={`ppb-term ppb-y${Math.floor(i / 2)}`} aria-hidden="true"/>)}<td className="ppb-state" aria-hidden="true"/></tr>
          {list.map(row => { const p = values.get(row.key) ?? blank(), s = sum(p), bad = invalid(row), dirty = dirtyKeys.includes(row.key);
            const ref = refs.find(r => row.key === `specialization:${r.subjectCode}:${r.subjectVersion}:${r.itemCode}`);
            return <tr key={row.key} data-row-key={row.key} data-analysis-target={targetRow === row.key || undefined} className={bad ? 'ppb-row ppb-bad' : dirty ? 'ppb-row ppb-dirty' : 'ppb-row'} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onRowLeave(); }}>
              <th scope="row"><span>{row.name}</span><small>{row.levelName}{row.key.startsWith('meta:') || row.key.startsWith('alternative:') || row.key.startsWith('block:') ? '' : ` · ${row.key.split(':')[3]}`}</small></th>
              <td className="ppb-num">{row.points}</td>
              {p.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{editable
                ? <input inputMode="numeric" value={n === 0 ? '' : Number.isFinite(n) ? String(n) : ''} placeholder="·" disabled={locked} aria-invalid={bad}
                  aria-label={`${row.name} ${row.levelName}, ${termLabel(i)}`} data-row={row.key} data-term={i}
                  onClick={e => { if (n === 0 && s < row.points) { onFill(row, i); requestAnimationFrame(() => (e.target as HTMLInputElement).select()); } }}
                  onChange={e => onCell(row, i, e.target.value.replace(/[^0-9]/gu, ''))} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}/>
                : <span className={n ? 'ppb-filled' : 'ppb-empty'}>{n ? fmt(n) : '·'}</span>}</td>)}
              <td className="ppb-state"><span className={bad ? 'ppb-tag ppb-tag-bad' : s === row.points ? 'ppb-tag ppb-tag-ok' : 'ppb-tag'}>{bad ? 'För många' : s === row.points ? 'Klar' : `${fmt(row.points - s)} kvar`}</span>
                {editable && <span className="ppb-row-tools">
                  <button type="button" disabled={locked} aria-label={`Dela ${row.name} ${row.levelName} på läsåret`} title="Dela lika på höst och vår" onClick={() => onSplit(row)}><SplitSquareHorizontal size={15} aria-hidden="true"/></button>
                  {s > 0 && <button type="button" disabled={locked} aria-label={`Töm ${row.name} ${row.levelName}`} title="Töm raden" onClick={() => onClear(row)}><Eraser size={15} aria-hidden="true"/></button>}
                  {ref && refsEditable && <button type="button" disabled={locked} aria-label={`Ta bort ${ref.itemCode}`} title="Ta bort från programfördjupningen" onClick={() => onRemove(ref, row.key)}><X size={15} aria-hidden="true"/></button>}
                </span>}</td>
            </tr>; })}
          {extra && refsEditable && <tr className="ppb-add-row"><td colSpan={9}>
            <label className="pps-search"><Search size={15} aria-hidden="true"/><span className="pp-sr">Lägg till ämne eller nivå</span><input type="search" value={query} disabled={locked} placeholder="Lägg till ämne eller nivå" onChange={e => setQuery(e.target.value)}/></label>
            <fieldset className="pps-suggestions" aria-label={q ? 'Sökträffar' : 'Förslag'}>{matches.map(o => <button type="button" key={o.itemCode} data-level-code={o.itemCode} disabled={locked}
              aria-label={`Lägg till ${o.subjectName} · ${o.name} · ${o.points} poäng`} onClick={() => onAdd(o)}><Plus size={14} aria-hidden="true"/>{o.subjectName} · {o.name} · {o.points}</button>)}
              {q && matches.length === 0 && <p>Ingen tillgänglig nivå matchar sökningen. Bara ämnen Skolverket anger som programfördjupning för programmet kan väljas.</p>}</fieldset>
          </td></tr>}
          {extra && !list.length && !refsEditable && <tr><td colSpan={9} className="ppb-note">Inga fördjupningsnivåer.</td></tr>}
        </tbody>; })}
      <tfoot><tr><th scope="row" colSpan={2}>Summa per termin</th>{termTotals.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{fmt(n)}</td>)}<td className="ppb-state">{fmt(assigned)}</td></tr></tfoot>
    </table></section>
    {program.orientations.length === 0 && <p className="ppb-note">Programmet har ingen inriktning.</p>}
    {unresolved.length > 0 && <p className="ppb-note">Ingår men fördelas inte här: {unresolved.map(s => s.optional ? `${s.name} (alternativ)` : `${s.name} (nivåer saknas)`).join(', ')}.</p>}
    {hint && <p className="ppb-hint">{hint}</p>}
  </section>;
}

type LocalProps = {
  focusIssue?: PlanIssue | null;
  program: CatalogProgram; orientationCode: string | null; options: ProgramplanOption[];
  choiceBlocks: ProgramplanBasisReference['choiceBlocks'];
  refs: ProgramplanLevelRef[]; terms: ProgramplanTermDistribution; refsEditable: boolean; disabled: boolean;
  onChange: (refs: ProgramplanLevelRef[], terms: ProgramplanTermDistribution) => void;
};
/** Samma tabell innan planen finns sparad: val och fördelning hålls lokalt och sparas med planen. */
export function LocalPlanBoard({ focusIssue, program, orientationCode, choiceBlocks, options, refs, terms, refsEditable, disabled, onChange }: LocalProps) {
  const rows = useMemo(() => { try { return programplanPreviewRows(program, orientationCode, refs, choiceBlocks); } catch { return []; } }, [program, orientationCode, refs, choiceBlocks]);
  const ranks = useMemo(() => programplanLevelRanks(program), [program]);
  const values = useMemo(() => toMap(terms), [terms]);
  const set = (next: Map<string, ProgramplanTermPoints>, nextRefs = refs) => onChange(nextRefs, fromMap(rows, next).filter(d => rows.some(r => r.key === d.rowKey)));
  const update = (key: string, points: ProgramplanTermPoints) => set(new Map(values).set(key, points));
  const anyInvalid = rows.some(r => { const p = values.get(r.key) ?? blank(); return p.some(n => !Number.isSafeInteger(n) || n < 0) || sum(p) > r.points; });
  return <PlanGrid choiceBlocks={choiceBlocks} focusIssue={focusIssue} program={program} orientationCode={orientationCode} refs={refs} options={options} rows={rows} values={values} dirtyKeys={[]}
    editable={!disabled} refsEditable={refsEditable && !disabled} locked={disabled} busy={false} status={null} statusTone="idle"
    hint={`Klicka i en tom terminsruta för att lägga nivåns återstående poäng där, eller skriv antal. Valen sparas när du sparar planen.${anyInvalid ? ' Rätta rader med för många poäng innan du sparar.' : ''}`}
    onCell={(row, i, raw) => { const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints; const n = raw.trim() === '' ? 0 : Number(raw); p[i] = Number.isFinite(n) ? n : NaN; update(row.key, p); }}
    onFill={(row, i) => { const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints, rest = row.points - sum(p); if (p[i] === 0 && rest > 0) { p[i] = rest; update(row.key, p); } }}
    onSplit={row => { const y = firstYear(values.get(row.key)) ?? 0, p = blank(); p[y * 2] = Math.floor(row.points / 2); p[y * 2 + 1] = row.points - p[y * 2]; update(row.key, p); }}
    onClear={row => update(row.key, blank())}
    onSuggest={() => onChange(refs, suggestProgramplanTerms(rows, terms, ranks))}
    onRowLeave={() => undefined}
    onAdd={o => { if (refs.length < 200) onChange([...refs, programplanReference(o)], terms); }}
    onRemove={(ref, key) => { const next = new Map(values); next.delete(key); onChange(refs.filter(r => r !== ref), fromMap(rows, next).filter(d => d.rowKey !== key)); }}/>;
}

/** Är en lokal fördelning giltig mot planens rader? */
export function localTermsValid(program: CatalogProgram, orientationCode: string | null, refs: ProgramplanLevelRef[], terms: ProgramplanTermDistribution): boolean {
  try { validateProgramplanTermDistribution(programplanTermRows(program, { catalogId: '', programRef: { code: program.code, version: program.version }, orientationCode, startedOn: '', specializationRefs: refs, choiceBlocks: defaultProgramplanChoiceBlocks(program, orientationCode) }), terms); return true; } catch { return false; }
}
