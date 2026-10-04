'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Plus, Search, SplitSquareHorizontal, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import type { CatalogProgram, ProgramplanLevelRef } from '@/lib/programplan-catalog.ts';
import { programplanReference, sameProgramplanLevels, type ProgramplanOption } from '@/lib/protected-programplan.ts';
import { PROGRAMPLAN_TERMS, firstYear, programplanLevelRanks, programplanTermRows, suggestProgramplanTerms, validateProgramplanTermDistribution,
  type ProgramplanTermDistribution, type ProgramplanTermPart, type ProgramplanTermPoints, type ProgramplanTermRow } from '@/lib/programplan-terms.ts';
import { parseProgramplanTermReply, type ProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import { programFrame, frameStatus } from '@/lib/programplan-table.ts';
import MfaStepUpNotice from './mfa-step-up';

type Props = {
  plan: Programplan; program: CatalogProgram; options: ProgramplanOption[]; scope: string; disabled: boolean;
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
export default function ProgramplanBoard({ plan, program, options, scope, disabled, onSecurityFailure, onReload, onTerms }: Props) {
  const basis = plan.basisReference!;
  const rows = useMemo(() => programplanTermRows(program, basis), [program, basis]);
  const ranks = useMemo(() => programplanLevelRanks(program), [program]);
  const editable = plan.status === 'utkast' && !disabled;
  const [saved, setSaved] = useState<ProgramplanTermReply | null>(null);
  const [values, setValues] = useState<Map<string, ProgramplanTermPoints>>(new Map());
  const [state, setState] = useState<SaveState>('idle'), [message, setMessage] = useState<string | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [year, setYear] = useState(0), [onlyOpen, setOnlyOpen] = useState(false), [query, setQuery] = useState(''), [working, setWorking] = useState(false);
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
        setSaved(body); setValues(toMap(body.distribution));
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
      setSaved(body); setState('idle'); return true;
    } catch (e) {
      if (!mounted.current || failed(e)) return false;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') { setState('mfa'); setMessage('Verifiera med engångskod för att spara. Dina värden finns kvar tills du lämnar sidan.'); }
      else if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') { setState('conflict'); setMessage('Någon annan har ändrat planen. Dina osparade värden finns kvar.'); }
      else if (e instanceof ApiError && e.hasExplicitCode && (e.code === 'bad_request' || e.code === 'audit_unavailable')) { setState('error'); setMessage(`Kunde inte spara. ${e.message}`); }
      else {
        try {
          const back = await readTerms(c.signal); if (!mounted.current) return false;
          if (back.revision === before.revision + 1 && back.distribution.length === own.length && own.every(r => sameRow(r.points, toMap(back.distribution).get(r.rowKey)))) { setSaved(back); setState('idle'); return true; }
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
  const commit = () => { if (editable && ['idle', 'error'].includes(state)) queueMicrotask(() => void save()); };
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
    try { const back = await readTerms(c.signal); if (!mounted.current) return; setSaved(back); setState('idle'); setMessage(null); await save(); }
    catch (e) { if (mounted.current && !failed(e)) { setState('unknown'); setMessage('Planen kunde inte läsas. Läs om planen.'); } }
  }

  const frame = programFrame(program, basis.orientationCode);
  const status = frameStatus(frame, basis.specializationRefs);
  const chosen = new Set(basis.specializationRefs.map(r => `${r.subjectCode}:${r.itemCode}`));
  const q = query.trim().toLocaleLowerCase('sv');
  const available = options.filter(o => !chosen.has(`${o.subjectCode}:${o.itemCode}`));
  const matches = q ? available.filter(o => `${o.subjectName} ${o.name} ${o.itemCode}`.toLocaleLowerCase('sv').includes(q)).slice(0, 12) : available.slice(0, 3);
  async function changeSpecialization(refs: ProgramplanLevelRef[], cleared?: string) {
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

  const termTotals = PROGRAMPLAN_TERMS.map((_, i) => rows.reduce((s, r) => s + ((values.get(r.key) ?? blank())[i] || 0), 0));
  const total = rows.reduce((s, r) => s + r.points, 0), assigned = termTotals.reduce((a, b) => a + b, 0);
  const openRows = rows.filter(r => sum(values.get(r.key) ?? blank()) < r.points);
  const unresolved = [...program.foundation, ...program.programmeSpecific, ...(program.orientations.find(o => o.code === basis.orientationCode)?.subjects ?? [])].filter(s => s.optional || !s.levels.length || s.subjectVersion === null);
  const locked = !editable || working || state === 'conflict' || state === 'unknown' || state === 'mfa';
  const shownRows = onlyOpen ? rows.filter(r => openRows.includes(r) || dirtyKeys.includes(r.key)) : rows;

  if (loadError) return <div className="pp-alert" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button></div>;
  if (!saved) return <output className="ppb-loading">Hämtar programplanen…</output>;
  return <section className="ppb" aria-label="Programplanen" aria-busy={state === 'saving' || working} data-year={year}>
    <div className="ppb-years">{[0, 1, 2].map(y => { const s = termTotals[y * 2] + termTotals[y * 2 + 1]; return <button type="button" key={y} className="ppb-year" aria-pressed={year === y} onClick={() => setYear(y)}>
      <span>Årskurs {y + 1}</span><strong>{fmt(s)} <small>poäng</small></strong><span className="ppb-year-terms">HT {fmt(termTotals[y * 2])} · VT {fmt(termTotals[y * 2 + 1])}</span>
      <span className="ppb-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, total ? s / (total / 3) * 100 : 0)}%` }}/></span></button>; })}</div>
    <div className="ppb-toolbar">
      <p><strong>{fmt(assigned)}</strong> av {fmt(total)} poäng fördelade{openRows.length ? ` · ${openRows.length} ${openRows.length === 1 ? 'nivå' : 'nivåer'} kvar` : ' · allt fördelat'}</p>
      <output className={`ppb-save ppb-save-${state === 'idle' && dirtyKeys.length ? 'dirty' : state}`}>{state === 'saving' ? 'Sparar…' : dirtyKeys.length && state === 'idle' ? 'Osparade ändringar' : state === 'idle' ? 'Allt sparat' : ''}</output>
      {editable && <div className="ppb-tools">
        <Button variant="outline" disabled={locked || openRows.length === 0} onClick={suggest} title={openRows.length ? 'Fyller bara i nivåer som saknar terminer' : 'Alla nivåer har redan terminer'}><Wand2 size={15} aria-hidden="true"/>Föreslå fördelning</Button>
        <Button variant="outline" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)}>{onlyOpen ? 'Visa alla rader' : 'Visa bara ofördelade'}</Button>
      </div>}
    </div>
    {message && state !== 'mfa' && <div className={state === 'idle' ? 'pp-notice' : 'pp-alert'} role="alert"><p>{message}</p>
      {state === 'conflict' && <div className="pp-actions"><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button>{dirtyKeys.length > 0 && <Button onClick={() => void keepMine()}>Spara mina värden</Button>}</div>}
      {state === 'unknown' && <div className="pp-actions"><Button variant="outline" onClick={() => void onReload()}>Läs om planen</Button><Button onClick={() => { setState('idle'); void save(); }}>Försök spara igen</Button></div>}</div>}
    {state === 'mfa' && <MfaStepUpNotice message={message ?? 'Verifiering med engångskod krävs.'} detail="Dina värden finns kvar här. Om du väljer verifiering lämnar du sidan; osparade värden följer inte med."/>}
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
          <tr className="ppb-group"><th colSpan={2} scope="colgroup"><i style={{ background: partColor[part] }}/>{part === 'orientation' ? `Inriktning: ${program.orientations.find(o => o.code === basis.orientationCode)?.name ?? ''}` : partTitle[part]}
            <small>{extra && frame.specializationRoom !== null ? `${fmt(status.chosen)} av ${fmt(frame.specializationRoom)} poäng` : `${fmt(partPoints)} poäng`}</small></th>
            {PROGRAMPLAN_TERMS.map((t, i) => <td key={t} className={`ppb-term ppb-y${Math.floor(i / 2)}`} aria-hidden="true"/>)}<td className="ppb-state" aria-hidden="true"/></tr>
          {list.map(row => { const p = values.get(row.key) ?? blank(), s = sum(p), bad = invalid(row), dirty = dirtyKeys.includes(row.key);
            const ref = basis.specializationRefs.find(r => row.key === `specialization:${r.subjectCode}:${r.subjectVersion}:${r.itemCode}`);
            return <tr key={row.key} className={bad ? 'ppb-row ppb-bad' : dirty ? 'ppb-row ppb-dirty' : 'ppb-row'} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}>
              <th scope="row"><span>{row.name}</span><small>{row.levelName}{row.key.startsWith('meta:') ? '' : ` · ${row.key.split(':')[3]}`}</small></th>
              <td className="ppb-num">{row.points}</td>
              {p.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{editable
                ? <input inputMode="numeric" value={n === 0 ? '' : Number.isFinite(n) ? String(n) : ''} placeholder="·" disabled={locked} aria-invalid={bad}
                  aria-label={`${row.name} ${row.levelName}, ${PROGRAMPLAN_TERMS[i]}`} data-row={row.key} data-term={i}
                  onClick={e => { if (n === 0 && s < row.points) { fillCell(row, i); requestAnimationFrame(() => (e.target as HTMLInputElement).select()); } }}
                  onChange={e => setCell(row, i, e.target.value.replace(/[^0-9]/gu, ''))} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}/>
                : <span className={n ? 'ppb-filled' : 'ppb-empty'}>{n ? fmt(n) : '·'}</span>}</td>)}
              <td className="ppb-state"><span className={bad ? 'ppb-tag ppb-tag-bad' : s === row.points ? 'ppb-tag ppb-tag-ok' : 'ppb-tag'}>{bad ? 'För många' : s === row.points ? 'Klar' : `${fmt(row.points - s)} kvar`}</span>
                {editable && <span className="ppb-row-tools">
                  <button type="button" disabled={locked} aria-label={`Dela ${row.name} ${row.levelName} på läsåret`} title="Dela lika på höst och vår" onClick={() => splitYear(row)}><SplitSquareHorizontal size={15} aria-hidden="true"/></button>
                  {s > 0 && <button type="button" disabled={locked} aria-label={`Töm ${row.name} ${row.levelName}`} title="Töm raden" onClick={() => clearRow(row)}><Eraser size={15} aria-hidden="true"/></button>}
                  {ref && <button type="button" disabled={locked} aria-label={`Ta bort ${ref.itemCode}`} title="Ta bort från programfördjupningen" onClick={() => void changeSpecialization(basis.specializationRefs.filter(r => r !== ref), row.key)}><X size={15} aria-hidden="true"/></button>}
                </span>}</td>
            </tr>; })}
          {extra && editable && <tr className="ppb-add-row"><td colSpan={9}>
            <label className="pps-search"><Search size={15} aria-hidden="true"/><span className="pp-sr">Lägg till ämne eller nivå</span><input type="search" value={query} disabled={locked} placeholder="Lägg till ämne eller nivå" onChange={e => setQuery(e.target.value)}/></label>
            <fieldset className="pps-suggestions" aria-label={q ? 'Sökträffar' : 'Förslag'}>{matches.map(o => <button type="button" key={o.itemCode} data-level-code={o.itemCode} disabled={locked}
              aria-label={`Lägg till ${o.subjectName} · ${o.name} · ${o.points} poäng`} onClick={() => void changeSpecialization([...basis.specializationRefs, programplanReference(o)])}><Plus size={14} aria-hidden="true"/>{o.subjectName} · {o.name} · {o.points}</button>)}
              {q && matches.length === 0 && <p>Ingen tillgänglig nivå matchar sökningen. Bara ämnen Skolverket anger som programfördjupning för programmet kan väljas.</p>}</fieldset>
          </td></tr>}
          {extra && !list.length && !editable && <tr><td colSpan={9} className="ppb-note">Inga fördjupningsnivåer.</td></tr>}
        </tbody>; })}
      <tfoot><tr><th scope="row" colSpan={2}>Summa per termin</th>{termTotals.map((n, i) => <td key={i} className={`ppb-term ppb-y${Math.floor(i / 2)}`}>{fmt(n)}</td>)}<td className="ppb-state">{fmt(assigned)}</td></tr></tfoot>
    </table></div>
    {unresolved.length > 0 && <p className="ppb-note">Ingår men fördelas inte här: {unresolved.map(s => s.optional ? `${s.name} (alternativ)` : `${s.name} (nivåer saknas)`).join(', ')}.</p>}
    {editable && <p className="ppb-hint">Klicka i en tom terminsruta för att lägga nivåns återstående poäng där, eller skriv antal. Ändringar sparas när du lämnar raden. {anyInvalid ? 'Rader med för många poäng sparas inte förrän de är rättade.' : ''}</p>}
    {!editable && plan.status !== 'utkast' && <p className="ppb-hint">Version {plan.version} är {plan.status === 'faststalld' ? 'fastställd' : 'ersatt'} och kan inte ändras. Skapa en ny version för att ändra.</p>}
  </section>;
}
