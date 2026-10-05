'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Plus, Search, SplitSquareHorizontal, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges,useHasUnsaved } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import { defaultProgramplanChoiceBlocks, type ProgramplanChoiceBlock } from '@/lib/programplan-choice-blocks.ts';
import type { CatalogProgram, ProgramplanLevelRef, ProgramplanBasisReference } from '@/lib/programplan-catalog.ts';
import { programplanReference, sameProgramplanLevels, sameProgramplanPin, type ProgramplanOption } from '@/lib/protected-programplan.ts';
import { PROGRAMPLAN_TERMS, firstYear, programplanLevelRanks, programplanTermRows, programplanPreviewRows, programplanTermTarget, suggestProgramplanTerms, validateProgramplanTermDistribution,
  type ProgramplanTermDistribution, type ProgramplanTermPart, type ProgramplanTermPoints, type ProgramplanTermRow } from '@/lib/programplan-terms.ts';
import { parseProgramplanTermReply, type ProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import type { PlanIssue } from '@/lib/programplan-analysis.ts';
import { programFrame, frameStatus } from '@/lib/programplan-table.ts';
import MfaStepUpNotice from './mfa-step-up';
import {programplanPackageKey} from '@/lib/programplan-packages.ts';
import ProgramplanPackageBlock,{type SchoolPackagesProps} from './protected-programplan-packages';

type Props = {
  schoolPackages?: SchoolPackagesProps;
  focusIssue?: PlanIssue | null;
  plan: Programplan; program: CatalogProgram; options: ProgramplanOption[]; scope: string; disabled: boolean;
  /** 05-20: planen har startat eller är arkiverad; tabellen blir skrivskyddad. */ locked?: boolean; lockReason?: string | null;
  onSecurityFailure: (error: unknown) => boolean;
  /** Läs om utbildningen efter en ändring av programfördjupningen. */
  onReload: () => Promise<void>;
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
export default function ProgramplanBoard({ schoolPackages, focusIssue, plan, program, options, scope, disabled, locked: lifecycleLocked = false, lockReason = null, onSecurityFailure, onReload, onTerms }: Props) {
  const basis = plan.basisReference!;
  const packagesUnsaved=useHasUnsaved(`packages-${scope}-${plan.id}-`);
  const rows = useMemo(() => programplanTermRows(program, basis), [program, basis]);
  const ranks = useMemo(() => programplanLevelRanks(program), [program]);
  // 05-20: arbetsytan skickar locked när planen har startat eller är arkiverad (serverns lifecycle).
  const editable = plan.status === 'utkast' && !disabled && !lifecycleLocked;
  const [saved, setSaved] = useState<ProgramplanTermReply | null>(null);
  const [values, setValues] = useState<Map<string, ProgramplanTermPoints>>(new Map());
  const [state, setState] = useState<SaveState>('idle'), [message, setMessage] = useState<string | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false), [blockUncertain, setBlockUncertain] = useState(false);
  const valuesRef = useRef(values), savedRef = useRef(saved), saving = useRef(false), pending = useRef(false), mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const savedMap = useMemo(() => toMap(saved?.distribution ?? []), [saved]);
  const dirtyKeys = rows.filter(r => !sameRow(values.get(r.key), savedMap.get(r.key))).map(r => r.key);
  const invalid = (r: ProgramplanTermRow) => { const p = values.get(r.key) ?? blank(); return p.some(n => !Number.isSafeInteger(n) || n < 0) || sum(p) > r.points; };
  const anyInvalid = rows.some(invalid);
  useUnsavedChanges(`programplan-board-${scope}`, dirtyKeys.length > 0 || state === 'saving');
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

  const save = useCallback(async (): Promise<boolean> => {
    if (!savedRef.current || plan.status !== 'utkast') return false;
    if (saving.current) { pending.current = true; return false; }
    const own = fromMap(rows, valuesRef.current);
    try { validateProgramplanTermDistribution(rows, own); } catch { setState('error'); setMessage('Rätta de markerade raderna. En rad kan inte ha fler poäng än nivån.'); return false; }
    const before = savedRef.current;
    if (own.length === before.distribution.length && own.every(r => sameRow(r.points, toMap(before.distribution).get(r.rowKey)))) return true;
    saving.current = true; setState('saving'); setMessage(null);
    const c = new AbortController();
    try {
      const body = parseProgramplanTermReply(await api.post('/api/programplaner/terminer', { planId: plan.id, expectedRevision: before.revision, distribution: own }, c.signal));
      if (body.planId !== plan.id || body.revision !== before.revision + 1) throw new Error('Sparandet kunde inte bekräftas.');
      if (!mounted.current) return true;
      savedRef.current = body; setSaved(body); setState('idle'); return true;
    } catch (e) {
      if (!mounted.current || failed(e)) return false;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { setState('mfa'); setMessage('Verifiera med engångskod för att spara. Dina värden finns kvar tills du lämnar sidan.'); }
      else if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') { setState('conflict'); setMessage('Någon annan har ändrat planen. Dina osparade värden finns kvar.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && (e.code === 'bad_request' || e.code === 'audit_unavailable')) { setState('error'); setMessage(`Kunde inte spara. ${e.message}`); }
      else {
        try {
          const back = await readTerms(c.signal); if (!mounted.current) return false;
          if (back.revision === before.revision + 1 && back.distribution.length === own.length && own.every(r => sameRow(r.points, toMap(back.distribution).get(r.rowKey)))) { savedRef.current = back; setSaved(back); setState('idle'); return true; }
          setState('unknown'); setMessage('Sparandet kunde inte bekräftas. Dina värden finns kvar.');
        } catch (inner) { if (mounted.current && !failed(inner)) { setState('unknown'); setMessage('Sparstatus kunde inte läsas. Dina värden finns kvar.'); } }
      }
      return false;
    } finally {
      saving.current = false;
      if (pending.current && mounted.current) { pending.current = false; queueMicrotask(() => void save()); }
    }
  }, [plan.id, plan.status, rows, readTerms, failed]);

  const update = (key: string, points: ProgramplanTermPoints) => { setValues(v => { const next = new Map(v); next.set(key, points); return next; }); if (state === 'error') { setState('idle'); setMessage(null); } };
  const commit = () => { if (editable && ['idle', 'saving', 'error'].includes(state)) queueMicrotask(() => void save()); };
  const setCell = (row: ProgramplanTermRow, i: number, raw: string) => { const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints; const n = raw.trim() === '' ? 0 : Number(raw); p[i] = Number.isFinite(n) ? n : NaN; update(row.key, p); };
  const fillCell = (row: ProgramplanTermRow, i: number) => {
    const p = [...(values.get(row.key) ?? blank())] as ProgramplanTermPoints, rest = row.points - sum(p);
    if (p[i] === 0 && rest > 0) { p[i] = rest; update(row.key, p); }
  };
  const splitYear = (row: ProgramplanTermRow) => { const y = firstYear(values.get(row.key)) ?? 0, p = blank(); p[y * 2] = Math.floor(row.points / 2); p[y * 2 + 1] = row.points - p[y * 2]; update(row.key, p); commit(); };
  const clearRow = (row: ProgramplanTermRow) => { update(row.key, blank()); commit(); };
  const suggest = () => { const next = suggestProgramplanTerms(rows, fromMap(rows, values), ranks); setValues(toMap(next)); commit(); };
  async function keepMine() {
    const c = new AbortController(); setState('saving');
    try { const back = await readTerms(c.signal); if (!mounted.current) return; savedRef.current = back; setSaved(back); setState('idle'); setMessage(null); await save(); }
    catch (e) { if (mounted.current && !failed(e)) { setState('unknown'); setMessage('Planen kunde inte läsas. Läs om planen.'); } }
  }

  async function changeSpecialization(refs: ProgramplanLevelRef[], cleared?: string) {
    if(packagesUnsaved){setMessage('Spara eller läs om skolans paket innan du ändrar planens nivåer.');return;}
    if (!editable || working) return;
    setWorking(true); setMessage(null);
    try {
      if (cleared && values.get(cleared)?.some(n => n > 0)) { update(cleared, blank()); valuesRef.current = new Map(valuesRef.current).set(cleared, blank()); }
      if (dirtyKeys.length || cleared) { if (!await save()) return; }
      const expected = savedRef.current!.revision, c = new AbortController();
      const reply = parseProgramplan(await api.post('/api/programplaner/fordjupning', { planId: plan.id, expectedRevision: expected, specializationRefs: refs.map(programplanReference) }, c.signal));
      if (reply.id !== plan.id || reply.revision !== expected + 1 || !sameProgramplanLevels(reply.basisReference?.specializationRefs ?? [], refs)) throw new Error('Sparandet kunde inte bekräftas.');
      await onReload();
    } catch (e) {
      if (!mounted.current || failed(e)) return;
      if (e instanceof ApiError && e.status === 409) { setState('conflict'); setMessage('Någon annan har ändrat planen. Läs om planen innan du ändrar fördjupningen.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { setState('mfa'); setMessage('Verifiera med engångskod för att ändra fördjupningen.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && ['bad_request', 'audit_unavailable', 'forbidden'].includes(e.code)) setMessage(`Kunde inte ändra fördjupningen. ${e.message}`);
      else {
        // Okänt svar: läs tillbaka i stället för att skriva igen.
        try {
          const back = parseProgramplan(await api.post('/api/programplaner/lasa', { planId: plan.id }, new AbortController().signal));
          if (back.id === plan.id && back.revision === (savedRef.current?.revision ?? -1) + 1 && sameProgramplanLevels(back.basisReference?.specializationRefs ?? [], refs)) { await onReload(); return; }
          setMessage('Fördjupningen kunde inte ändras. Läs om planen och försök igen.');
        } catch (inner) { if (mounted.current && !failed(inner)) setMessage('Sparstatus kunde inte läsas. Läs om planen innan du försöker igen.'); }
      }
    } finally { if (mounted.current) setWorking(false); }
  }

  async function changeBlocks(choiceBlocks: ProgramplanChoiceBlock[]): Promise<boolean> {
    if(packagesUnsaved){setMessage('Spara eller läs om skolans paket innan du ändrar planens block.');return false;}
    if (!editable || working || saving.current || !basis.choiceBlocks) return false;
    setWorking(true); setMessage(null);
    let expected: number | null = null;
    setBlockUncertain(false);
    const submitted = { ...basis, choiceBlocks };
    const confirms = (reply: Programplan) => reply.id === plan.id && reply.revision === (expected ?? -2) + 1 && reply.status === 'utkast' && reply.decidedOn === null
      && sameProgramplanPin(reply.basisReference, submitted) && sameProgramplanLevels(reply.basisReference?.specializationRefs ?? [], basis.specializationRefs);
    try {
      if (dirtyKeys.length && !await save()) return false;
      expected = savedRef.current!.revision;
      const reply = parseProgramplan(await api.post('/api/programplaner/block', { planId: plan.id, expectedRevision: expected, choiceBlocks }, new AbortController().signal));
      if (!confirms(reply)) throw new Error('Sparandet kunde inte bekräftas.');
      await onReload(); return true;
    } catch (e) {
      if (!mounted.current || failed(e)) return false;
      if (e instanceof ApiError && e.status === 409) { setState('conflict'); setMessage('Någon annan har ändrat planen. Läs om planen innan du ändrar blocken.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { setState('mfa'); setMessage('Verifiera med engångskod för att ändra blocken.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && ['bad_request','audit_unavailable','forbidden','programplan_locked'].includes(e.code)) setMessage(`Blocken kunde inte sparas. ${e.message}`);
      else {
        try {
          const back = parseProgramplan(await api.post('/api/programplaner/lasa', {planId:plan.id}, new AbortController().signal));
          if (confirms(back)) { await onReload(); return true; }
          setBlockUncertain(true); setState('unknown'); setMessage('Blockändringen kunde inte bekräftas. Läs om planen innan du försöker igen.');
        } catch (inner) { if (mounted.current && !failed(inner)) { setBlockUncertain(true); setState('unknown'); setMessage('Sparstatus kunde inte läsas. Läs om planen innan du försöker igen.'); } }
      }
      return false;
    } finally { if (mounted.current) setWorking(false); }
  }

  const locked = !editable || working || state === 'conflict' || state === 'unknown' || state === 'mfa';

  if (loadError) return <div className="pp-alert" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button></div>;
  if (!saved) return <output className="ppb-loading">Hämtar programplanen…</output>;
  return <PlanGrid schoolPackages={schoolPackages} focusIssue={focusIssue} program={program} orientationCode={basis.orientationCode} refs={basis.specializationRefs} options={options} rows={rows} values={values}
    choiceBlocks={basis.choiceBlocks} onBlocks={changeBlocks} dirtyKeys={dirtyKeys} editable={editable} refsEditable={editable} locked={locked} busy={state === 'saving' || working}
    status={state === 'saving' ? 'Sparar…' : dirtyKeys.length && state === 'idle' ? 'Osparade ändringar' : state === 'idle' ? 'Allt sparat' : ''} statusTone={state === 'idle' && dirtyKeys.length ? 'dirty' : state}
    hint={lifecycleLocked ? lockReason : editable ? `Klicka i en tom terminsruta för att lägga nivåns återstående poäng där, eller skriv antal. Ändringar sparas när du lämnar raden.${anyInvalid ? ' Rader med för många poäng sparas inte förrän de är rättade.' : ''}` : plan.status !== 'utkast' ? `Version ${plan.version} är ${plan.status === 'faststalld' ? 'fastställd' : 'ersatt'} och kan inte ändras. Skapa en ny version för att ändra.` : null}
    onCell={setCell} onFill={fillCell} onSplit={splitYear} onClear={clearRow} onSuggest={suggest} onRowLeave={commit}
    onAdd={o => void changeSpecialization([...basis.specializationRefs, programplanReference(o)])} onRemove={(ref, key) => void changeSpecialization(basis.specializationRefs.filter(r => r !== ref), key)}>
    {message && state !== 'mfa' && <div className={state === 'idle' ? 'pp-notice' : 'pp-alert'} role="alert"><p>{message}</p>
      {state === 'conflict' && <div className="pp-actions"><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button>{dirtyKeys.length > 0 && <Button onClick={() => void keepMine()}>Spara mina värden</Button>}</div>}
      {state === 'unknown' && <div className="pp-actions"><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button>{!blockUncertain && <Button onClick={() => { setState('idle'); void save(); }}>Försök spara igen</Button>}</div>}</div>}
    {state === 'mfa' && <MfaStepUpNotice message={message ?? 'Verifiering med engångskod krävs.'} detail="Dina värden finns kvar här. Om du väljer verifiering lämnar du sidan; osparade värden följer inte med."/>}
  </PlanGrid>;
}


type GridProps = {
  schoolPackages?: SchoolPackagesProps;
  choiceBlocks?: ProgramplanChoiceBlock[]; onBlocks?: (blocks: ProgramplanChoiceBlock[]) => Promise<boolean>;
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
export function PlanGrid({ schoolPackages, choiceBlocks, onBlocks, focusIssue, program, orientationCode, refs, options, rows, values, dirtyKeys, editable, refsEditable, locked, busy, status, statusTone, hint, children,
  onCell, onFill, onSplit, onClear, onSuggest, onRowLeave, onAdd, onRemove }: GridProps) {
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [year, setYear] = useState(0), [onlyOpen, setOnlyOpen] = useState(false), [query, setQuery] = useState('');
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
    if (!focusIssue || handledFocus.current === focusIssue || !target || target.kind === 'start' || target.kind === 'orientation') return;
    if(target.kind==='package'){const entry=schoolPackages?.packages?.units.find(u=>u.unitId===target.unitId)?.selections.find(s=>s.blockId===target.blockId)?.entries.find(e=>!target.entryKey||programplanPackageKey(e.ref)===target.entryKey);const start=entry?.distribution.find(d=>!target.levelKey||d.levelKey===target.levelKey)?.points.findIndex(p=>p>0)??-1;const frame=requestAnimationFrame(()=>{setExpanded(s=>new Set([...s,target.blockId]));setOnlyOpen(false);setYear(start<0?0:Math.floor(start/2));handledFocus.current=focusIssue;});return()=>cancelAnimationFrame(frame);}
    const term = targetRow ? (values.get(targetRow)?.findIndex(n=>n>0) ?? -1) : -1;
    let focusFrame = 0;
    const frame = requestAnimationFrame(() => {
      setOnlyOpen(false); if (targetRow) setYear(term < 0 ? 0 : Math.floor(term / 2));
      focusFrame = requestAnimationFrame(() => {
        const grid = gridRef.current;
        const row = targetRow ? grid?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(targetRow)}"]`) : null;
        const control = target.kind === 'specialization' && target.mode === 'add' ? grid?.querySelector<HTMLInputElement>('input[type="search"]')
          : target.kind === 'specialization' ? row?.querySelector<HTMLButtonElement>('button[aria-label^="Ta bort"]')
          : row?.querySelector<HTMLInputElement>(`input[data-term="${term < 0 ? 0 : term}"]`) ?? grid?.querySelector<HTMLButtonElement>('.ppb-year');
        (row ?? control)?.scrollIntoView({block:'center'}); control?.focus({preventScroll:true});
        handledFocus.current = focusIssue;
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); };
  }, [focusIssue, target, targetRow, values, schoolPackages?.packages]);

  return <section ref={gridRef} className="ppb" aria-label="Programplanen" aria-busy={busy} data-year={year}>
    <div className="ppb-years">{[0, 1, 2].map(y => { const s = termTotals[y * 2] + termTotals[y * 2 + 1]; return <button type="button" key={y} className="ppb-year" aria-pressed={year === y} onClick={() => setYear(y)}>
      <span>Årskurs {y + 1}</span><strong>{fmt(s)} <small>poäng</small></strong><span className="ppb-year-terms">HT {fmt(termTotals[y * 2])} · VT {fmt(termTotals[y * 2 + 1])}</span>
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
    <fieldset className="ppb-mobile-years" aria-label="Visa årskurs">{[0, 1, 2].map(y => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>Åk {y + 1}</button>)}</fieldset>
    <div className="ppb-table-wrap"><table className="ppb-table">
      <caption className="pp-sr">Ämnen, nivåer och poäng per termin</caption>
      <thead><tr><th scope="col">Ämne och nivå</th><th scope="col" className="ppb-num">Poäng</th>
        {PROGRAMPLAN_TERMS.map((t, i) => <th scope="col" key={t} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{i % 2 ? 'VT' : `Åk ${Math.floor(i / 2) + 1} HT`}</th>)}
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
            const block=choiceBlocks?.find(b=>row.key===`block:${b.id}`);
            return <Fragment key={row.key}><tr data-row-key={row.key} data-analysis-target={targetRow === row.key || undefined} className={bad ? 'ppb-row ppb-bad' : dirty ? 'ppb-row ppb-dirty' : 'ppb-row'} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onRowLeave(); }}>
              <th scope="row"><span>{row.name}</span><small>{row.levelName}{row.key.startsWith('meta:') || row.key.startsWith('alternative:') || row.key.startsWith('block:') ? '' : ` · ${row.key.split(':')[3]}`}</small>{block&&schoolPackages&&<button type="button" className="ppk-toggle" aria-expanded={expanded.has(block.id)} aria-controls={`packages-${block.id}`} onClick={()=>setExpanded(s=>{const next=new Set(s);if(next.has(block.id))next.delete(block.id);else next.add(block.id);return next;})}>{expanded.has(block.id)?'Dölj paket':'Visa paket'} · {schoolPackages.packages?.units.filter(u=>u.selections.some(s=>s.blockId===block.id&&s.entries.length>0)).length??0}/{schoolPackages.units.length} skolor</button>}</th>
              <td className="ppb-num">{row.points}</td>
              {p.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{editable
                ? <input inputMode="numeric" value={n === 0 ? '' : Number.isFinite(n) ? String(n) : ''} placeholder="·" disabled={locked} aria-invalid={bad}
                  aria-label={`${row.name} ${row.levelName}, ${PROGRAMPLAN_TERMS[i]}`} data-row={row.key} data-term={i}
                  onClick={e => { if (n === 0 && s < row.points) { onFill(row, i); requestAnimationFrame(() => (e.target as HTMLInputElement).select()); } }}
                  onChange={e => onCell(row, i, e.target.value.replace(/[^0-9]/gu, ''))} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}/>
                : <span className={n ? 'ppb-filled' : 'ppb-empty'}>{n ? fmt(n) : '·'}</span>}</td>)}
              <td className="ppb-state"><span className={bad ? 'ppb-tag ppb-tag-bad' : s === row.points ? 'ppb-tag ppb-tag-ok' : 'ppb-tag'}>{bad ? 'För många' : s === row.points ? 'Klar' : `${fmt(row.points - s)} kvar`}</span>
                {editable && <span className="ppb-row-tools">
                  <button type="button" disabled={locked} aria-label={`Dela ${row.name} ${row.levelName} på läsåret`} title="Dela lika på höst och vår" onClick={() => onSplit(row)}><SplitSquareHorizontal size={15} aria-hidden="true"/></button>
                  {s > 0 && <button type="button" disabled={locked} aria-label={`Töm ${row.name} ${row.levelName}`} title="Töm raden" onClick={() => onClear(row)}><Eraser size={15} aria-hidden="true"/></button>}
                  {ref && refsEditable && <button type="button" disabled={locked} aria-label={`Ta bort ${ref.itemCode}`} title="Ta bort från programfördjupningen" onClick={() => onRemove(ref, row.key)}><X size={15} aria-hidden="true"/></button>}
                </span>}</td>
            </tr>{block&&schoolPackages&&<tr hidden={!expanded.has(block.id)} className="ppk-detail"><td colSpan={9}><ProgramplanPackageBlock {...schoolPackages} block={block} frame={p} options={options} fixedLevelKeys={rows.filter(r=>!r.key.startsWith('block:')&&!r.key.startsWith('meta:')&&!r.key.startsWith('alternative:')).map(r=>r.key.split(':').slice(1).join(':'))} focusIssue={expanded.has(block.id)?focusIssue:null}/></td></tr>}</Fragment>; })}
          {(extra || part === 'individualChoice') && editable && choiceBlocks && onBlocks && <tr className="ppb-add-row"><td colSpan={9}>
            <ChoiceBlockEditor key={part} part={part === 'specialization' ? 'specialization' : 'individualChoice'} blocks={choiceBlocks} values={values} locked={locked || busy} onSave={onBlocks}/>
          </td></tr>}
          {extra && refsEditable && <tr className="ppb-add-row"><td colSpan={9}>
            <label className="pps-search"><Search size={15} aria-hidden="true"/><span className="pp-sr">Lägg till ämne eller nivå</span><input type="search" value={query} disabled={locked} placeholder="Lägg till ämne eller nivå" onChange={e => setQuery(e.target.value)}/></label>
            <fieldset className="pps-suggestions" aria-label={q ? 'Sökträffar' : 'Förslag'}>{matches.map(o => <button type="button" key={o.itemCode} data-level-code={o.itemCode} disabled={locked}
              aria-label={`Lägg till ${o.subjectName} · ${o.name} · ${o.points} poäng`} onClick={() => onAdd(o)}><Plus size={14} aria-hidden="true"/>{o.subjectName} · {o.name} · {o.points}</button>)}
              {q && matches.length === 0 && <p>Ingen tillgänglig nivå matchar sökningen. Bara ämnen Skolverket anger som programfördjupning för programmet kan väljas.</p>}</fieldset>
          </td></tr>}
          {extra && !list.length && !refsEditable && <tr><td colSpan={9} className="ppb-note">Inga fördjupningsnivåer.</td></tr>}
        </tbody>; })}
      <tfoot><tr><th scope="row" colSpan={2}>Summa per termin</th>{termTotals.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{fmt(n)}</td>)}<td className="ppb-state">{fmt(assigned)}</td></tr></tfoot>
    </table></div>
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

function ChoiceBlockEditor({part, blocks, values, locked, onSave}: {part: 'specialization' | 'individualChoice'; blocks: ProgramplanChoiceBlock[]; values: Map<string,ProgramplanTermPoints>; locked: boolean; onSave: (blocks:ProgramplanChoiceBlock[])=>Promise<boolean>}) {
  const [editing, setEditing] = useState(false), [own, setOwn] = useState<ProgramplanChoiceBlock[]>([]), [error,setError] = useState<string|null>(null);
  const originals = blocks.filter(b=>b.kind === part);
  const dirty = editing && JSON.stringify(own) !== JSON.stringify(originals);
  useUnsavedChanges(`programplan-block-editor-${part}`,dirty);
  const allocated = (id:string) => sum(values.get(`block:${id}`) ?? blank()) > 0;
  function open() { setOwn(originals.map(b=>({...b}))); setError(null);setEditing(true); }
  function add() { setOwn([...own,{id:`b${crypto.randomUUID().replaceAll('-','').slice(0,15)}`,kind:part,points:100,name:part === 'individualChoice' ? 'Individuellt val' : 'Valbar programfördjupning'}]); }
  function update(id:string,changes:Partial<ProgramplanChoiceBlock>) {setOwn(own.map(b=>b.id===id?{...b,...changes}:b));setError(null);}
  function remove(id:string) {
    if (allocated(id)) {setError('Töm blockets terminsfördelning och spara först.');return;}
    setOwn(own.filter(b=>b.id!==id));setError(null);
  }
  async function saveBlocks() {
    if (own.some(b=>!b.name.trim() || !Number.isSafeInteger(b.points) || b.points < 1 || b.points > 10000)) {setError('Ange ett namn och ett helt antal poäng för varje block.');return;}
    if (part === 'individualChoice' && own.reduce((n,b)=>n+b.points,0)!==200) {setError('Blocken för individuellt val ska tillsammans vara 200 poäng.');return;}
    if (originals.some(b=>allocated(b.id) && (!own.some(o=>o.id===b.id) || own.find(o=>o.id===b.id)!.points!==b.points))) {setError('Töm blockets terminsfördelning och spara först.');return;}
    const next = blocks.flatMap(b=>b.kind!==part?[b]:own.filter(o=>o.id===b.id));
    next.push(...own.filter(o=>!originals.some(b=>b.id===o.id)));
    if (await onSave(next)) setEditing(false);
  }
  return <section className="ppb-choice-editor" aria-label={part === 'individualChoice' ? 'Block för individuellt val' : 'Valbara fördjupningsblock'}>
    {!editing ? <Button variant="outline" disabled={locked} onClick={open}>{part === 'individualChoice' ? 'Dela i block' : 'Lägg till valbart block'}</Button> : <>
      <p>{part === 'individualChoice' ? 'Fördela 200 poäng på ett eller flera block.' : 'Ange namn och poäng för skolans valbara programfördjupning.'} Töm och spara fördelningen innan ett block tas bort eller får andra poäng.</p>
      {own.map(b=><div className="pp-new-fields" key={b.id}>
        <label>Namn på block<input aria-label={`Namn på block ${b.id}`} value={b.name} maxLength={1000} disabled={locked} onChange={e=>update(b.id,{name:e.target.value})}/></label>
        <label>Poäng för block<input aria-label={`Poäng för block ${b.id}`} type="number" min={1} max={10000} value={b.points} disabled={locked} onChange={e=>update(b.id,{points:Number(e.target.value)})}/></label>
        <Button variant="outline" disabled={locked} onClick={()=>remove(b.id)}>Ta bort block {b.name}</Button>
      </div>)}
      {error&&<p className="pp-alert" role="alert">{error}</p>}
      <div className="pp-actions"><Button variant="outline" disabled={locked} onClick={add}>Lägg till block</Button><Button variant="outline" disabled={locked} onClick={()=>setEditing(false)}>Avbryt blockändring</Button><Button disabled={locked || !dirty} onClick={()=>void saveBlocks()}>Spara block</Button></div>
    </>}
  </section>;
}
