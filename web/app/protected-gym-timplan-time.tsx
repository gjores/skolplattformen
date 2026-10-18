'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { gymTimplanCanEdit, isGymTimplanV2, parseGymTimplan, type GymTimplanV2, type GymTimplanRow } from '@/lib/gym-timplan.ts';
import { formatTimplanMinutes, parseTimplanMinuteInput, timplanTimeTotals, type TimeRowV2, type SchoolMinutes, type AnnualAplMinutes } from '@/lib/timplan-time.ts';
import { parseTimplanTimeCommandReply, parseTimplanTimeStatusReply, type TimplanTimeRowCommand, type TimplanTimeCommand } from '@/lib/timplan-time-command.ts';
import { createTimplanTimeJournal, persistTimplanTimeJournal, loadTimplanTimeJournal, removeTimplanTimeJournal, type TimplanTimeJournal } from '@/lib/timplan-time-journal.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import type { GymTimplanHoursProps } from './protected-gym-timplan-hours';
import ProtectedGymTimplanDistribution from './protected-gym-timplan-distribution';
import ProtectedTimplanTimeCopyReview from './protected-timplan-time-copy-review';
import MfaStepUpNotice from './mfa-step-up';
import ProtectedTimplanBudget from './protected-timplan-budget';

type Draft = { values: string[]; original: TimeRowV2; mode: 'edit' | 'compare' | 'unread' | 'retry'; error: string | null; mfa: boolean; pending?: TimplanTimeRowCommand };
const strings = (row: TimeRowV2) => [...row.schoolMinutes, ...row.annualAplMinutes].map(formatTimplanMinutes);
const values = (input: string[]): TimeRowV2 | null => {
  const parsed = input.map((value, index) => parseTimplanMinuteInput(value, index < 6 ? 120000 : 240000));
  return parsed.some(value => value === undefined) ? null : { schoolMinutes: parsed.slice(0, 6) as SchoolMinutes, annualAplMinutes: parsed.slice(6) as AnnualAplMinutes };
};
const same = (a: TimeRowV2, b: TimeRowV2) => a.schoolMinutes.every((n, i) => n === b.schoolMinutes[i]) && a.annualAplMinutes.every((n, i) => n === b.annualAplMinutes[i]);
const matches = (input: string[], row: TimeRowV2) => { const parsed = values(input); return parsed !== null && same(parsed, row); };
const hours = (n: number) => `${formatTimplanMinutes(n)} h`;
const percent = (n: number | null) => n === null ? '—' : `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`;

/** Each request binds all nine cells and retains its UUID until its outcome is known. */
export default function ProtectedGymTimplanTime({ timeJournalScope: scope = null, plan, year, onYear, yearProjection, disabled = false, unsavedId, onSaved, onSaving, onNavigationBlocked, onSecurityFailure, onActivity }: Omit<GymTimplanHoursProps, 'plan'> & { plan: GymTimplanV2 }) {
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map()), [savingKey, setSavingKey] = useState<string | null>(null);
  const [journalReady, setJournalReady] = useState(false), [journalError, setJournalError] = useState<string | null>(null);
  const [general, setGeneral] = useState<TimplanTimeCommand | null>(null), [generalRetry, setGeneralRetry] = useState(false), [generalMfa, setGeneralMfa] = useState(false);
  const journal = useRef<TimplanTimeJournal | null>(null);
  const [compact, setCompact] = useState(false), [onlyMissing, setOnlyMissing] = useState(false);
  const [distributionOpen, setDistributionOpen] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const saved = useRef(plan), latest = useRef(drafts), queue = useRef(new Set<string>()), running = useRef(false), active = useRef(true), disabledRef = useRef(disabled), distribution = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useLayoutEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { if (plan.revision >= saved.current.revision) saved.current = plan; }, [plan]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)'); const change = () => setCompact(media.matches); change(); media.addEventListener('change', change);
    const pending = queue.current; active.current = true;
    return () => { active.current = false; pending.clear(); controller.current?.abort(); media.removeEventListener('change', change); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!scope) { setJournalReady(true); return; }
      try {
        const pending = await loadTimplanTimeJournal(window.sessionStorage, scope); if (cancelled) return;
        journal.current = pending;
        if (pending?.request.action === 'save_row') {
          const command = pending.request, original = saved.current.timeRows[command.rowKey];
          if (!original) throw new Error('Den tidigare raden saknas. Kontrollera timplanen innan du fortsätter.');
          const next = new Map<string, Draft>([[command.rowKey, { values: strings(command.row), original, mode: 'unread', pending: command, mfa: false, error: 'Ett tidigare sparförsök finns kvar. Kontrollera sparstatus innan du fortsätter.' }]]); latest.current = next; setDrafts(next);
        } else if (pending) { setGeneral(pending.request); setJournalError('Ett tidigare sparförsök behöver kontrolleras innan du ändrar timmarna.'); }
        setJournalReady(true);
      } catch (error) { if (!cancelled) setJournalError(error instanceof Error ? error.message : 'Sparstatus kunde inte läsas.'); }
    }
    void restore(); return () => { cancelled = true; };
  }, [scope]);
  async function clearJournal() {
    if (scope && journal.current) { await removeTimplanTimeJournal(window.sessionStorage, journal.current, scope); journal.current = null; }
  }
  const blocked = !journalReady || general !== null || distributionOpen || savingKey !== null || [...drafts.values()].some(d => !!d.pending);
  useUnsavedChanges(unsavedId, drafts.size > 0 || general !== null || savingKey !== null || distributionOpen);
  useUnsavedChanges(`navigation-block:${unsavedId}`, blocked);
  useEffect(() => { onNavigationBlocked(blocked); }, [blocked, onNavigationBlocked]);
  const hasActivity = !journalReady || distributionOpen || savingKey !== null || general !== null || drafts.size > 0;
  useEffect(() => { onActivity?.(hasActivity); }, [hasActivity, onActivity]);
  function report() { onNavigationBlocked(!journalReady || journal.current !== null || distribution.current || running.current || [...latest.current.values()].some(d => !!d.pending)); onActivity?.(journal.current !== null || distribution.current || running.current || latest.current.size > 0); }
  function replace(key: string, draft: Draft | null) { const next = new Map(latest.current); if (draft) next.set(key, draft); else next.delete(key); latest.current = next; setDrafts(next); report(); }
  function adopt(fresh: GymTimplanV2) { saved.current = fresh; onSaved(fresh); }
  async function read(signal: AbortSignal) {
    const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: saved.current.id }, signal), saved.current.id);
    if (!isGymTimplanV2(fresh) || fresh.unitId !== saved.current.unitId || fresh.offeringId !== saved.current.offeringId || fresh.version !== saved.current.version || fresh.revision < saved.current.revision) throw new Error('Timplanens sparade tidsmodell kunde inte kontrolleras.');
    return fresh;
  }
  function reconcile(key: string, fresh: GymTimplanV2, sent: TimeRowV2 | null, confirmed: boolean) {
    adopt(fresh); const own = latest.current.get(key); if (!own) return;
    if (matches(own.values, fresh.timeRows[key])) replace(key, null);
    else if (confirmed && sent && same(sent, fresh.timeRows[key])) {
      replace(key, { ...own, original: fresh.timeRows[key], mode: 'edit', pending: undefined, error: null, mfa: false }); queue.current.add(key);
    } else replace(key, { ...own, mode: 'compare', pending: undefined, error: 'Timplanen har lästs igen. Jämför sparad tid med dina värden innan du sparar.', mfa: false });
  }
  async function resolve(key: string, command: TimplanTimeRowCommand, signal: AbortSignal) {
    const status = parseTimplanTimeStatusReply(await api.post('/api/timplaner/gym/tidsstatus', { command }, signal), { command });
    if (status.state === 'completed') {
      const fresh = await read(signal); if (fresh.revision < status.result.receipt.revision) throw new Error('Timplanen är äldre än sparbeskedet.'); await clearJournal(); if (active.current) reconcile(key, fresh, command.row, true);
    } else if (active.current) {
      const own = latest.current.get(key);
      if (own) replace(key, { ...own, mode: 'retry', pending: command, mfa: false, error: 'Ingen sparning har bekräftats. Du kan försöka skicka samma ändring igen; den kan inte sparas dubbelt.' });
    }
  }
  async function send(key: string, command: TimplanTimeRowCommand, signal: AbortSignal) {
    let accepted = false;
    try {
      if (!scope) throw new Error('Aktuellt skolmandat saknas.');
      journal.current = await persistTimplanTimeJournal(window.sessionStorage, journal.current ?? await createTimplanTimeJournal(scope, command), scope);
      const reply = parseTimplanTimeCommandReply(await api.post('/api/timplaner/gym/tidsrad', command, signal), command); accepted = true;
      const fresh = await read(signal); if (fresh.revision < reply.receipt.revision) throw new Error('Timplanen är äldre än sparbeskedet.'); await clearJournal(); if (active.current) reconcile(key, fresh, command.row, true);
    } catch (caught) {
      if (!active.current || onSecurityFailure(caught)) return;
      const own = latest.current.get(key); if (!own) return;
      if (!accepted && caught instanceof ApiError && caught.hasExplicitCode && [400, 422].includes(caught.status) && caught.code !== 'mfa_required') {
        await clearJournal();
        replace(key, { ...own, pending: undefined, mode: 'edit', error: caught.message, mfa: caught.code === 'mfa_required' }); return;
      }
      // A conflict or a broken response is resolved against the immutable command receipt first.
      try {
        await resolve(key, command, signal);
        if (caught instanceof ApiError && caught.hasExplicitCode && caught.status === 409 && latest.current.get(key)?.mode === 'retry') {
          const fresh = await read(signal); await clearJournal(); if (active.current) reconcile(key, fresh, null, false);
        }
      } catch (inner) {
        if (!active.current || onSecurityFailure(inner)) return;
        const now = latest.current.get(key);
        if (now) replace(key, { ...now, mode: 'unread', pending: command, error: 'Sparstatus kunde inte kontrolleras. Dina värden och samma sparbegäran finns kvar.', mfa: inner instanceof ApiError && inner.code === 'mfa_required' });
      }
    }
  }
  async function drain() {
    if (running.current || !active.current || disabledRef.current || !scope || !journalReady) return;
    running.current = true; report(); onSaving(true);
    try {
      while (queue.current.size && active.current && !disabledRef.current) {
        if ([...latest.current.values()].some(d => !!d.pending || d.mfa)) break;
        const key = queue.current.values().next().value!; queue.current.delete(key);
        const own = latest.current.get(key), before = saved.current;
        if (!own || own.mode !== 'edit' || !gymTimplanCanEdit(before)) continue;
        const row = values(own.values);
        if (!row) { replace(key, { ...own, error: 'Ange hela timmar eller timmar:minuter, till exempel 79:30. Skoltid högst 2 000 h per termin och APL högst 4 000 h per år.' }); continue; }
        if (same(row, before.timeRows[key])) { replace(key, null); continue; }
        if (!same(own.original, before.timeRows[key])) { replace(key, { ...own, mode: 'compare', error: 'Raden har ändrats. Jämför sparad tid med dina värden.' }); continue; }
        const command: TimplanTimeRowCommand = { contractVersion: 'timplan_time_v2', action: 'save_row', commandId: crypto.randomUUID(), planId: before.id, expectedRevision: before.revision, rowKey: key, row };
        setSavingKey(key); replace(key, { ...own, error: null, pending: command });
        const c = new AbortController(); controller.current = c; await send(key, command, c.signal);
      }
    } finally { running.current = false; if (active.current) { setSavingKey(null); report(); onSaving(false); } }
  }
  function commit(key: string) { const own = latest.current.get(key); if (disabledRef.current || !own || own.mode !== 'edit' || own.pending || own.mfa) return; queue.current.add(key); void drain(); }
  function setCell(row: GymTimplanRow, index: number, value: string) {
    if (disabledRef.current || distribution.current || !gymTimplanCanEdit(saved.current)) return;
    const own = latest.current.get(row.key) ?? { values: strings(saved.current.timeRows[row.key]), original: saved.current.timeRows[row.key], mode: 'edit', error: null, mfa: false } as Draft;
    if (own.mode === 'unread' || own.mode === 'retry' || own.mfa) return;
    replace(row.key, { ...own, values: own.values.map((old, i) => index === i ? value : old), error: own.mode === 'edit' ? null : own.error });
  }
  async function recover(key: string, retry = false) {
    if (running.current) return; const own = latest.current.get(key); if (!own) return;
    running.current = true; report(); onSaving(true); setSavingKey(key); const c = new AbortController(); controller.current = c;
    try {
      if (own.pending) { if (retry) await send(key, own.pending, c.signal); else await resolve(key, own.pending, c.signal); }
      else { const fresh = await read(c.signal); if (active.current) reconcile(key, fresh, null, false); }
    } catch (caught) { if (active.current && !onSecurityFailure(caught)) { const now = latest.current.get(key); if (now) replace(key, { ...now, error: 'Sparstatus kunde inte läsas. Dina värden finns kvar.', mode: 'unread', mfa: caught instanceof ApiError && caught.code === 'mfa_required' }); } }
    finally { running.current = false; if (active.current) { setSavingKey(null); onSaving(false); report(); if (queue.current.size) void drain(); } }
  }
  async function generalOperation(command: TimplanTimeCommand, write: boolean) {
    if (running.current || !scope || disabledRef.current) return;
    running.current = true; setSavingKey('general'); onSaving(true); setJournalError(null); report();
    const c = new AbortController(); controller.current = c;
    try {
      if (write) {
        journal.current = await persistTimplanTimeJournal(window.sessionStorage, journal.current ?? await createTimplanTimeJournal(scope, command), scope);
        setGeneral(command); report();
        const raw = command.action === 'transition' ? await api.put('/api/timplaner/gym/tidsmodell', command, c.signal) : await api.post('/api/timplaner/gym/tidsrad', command, c.signal);
        const reply = parseTimplanTimeCommandReply(raw, command), fresh = await read(c.signal);
        if (fresh.revision < reply.receipt.revision) throw new Error('Timplanen är äldre än sparbeskedet.');
        await clearJournal(); if (!active.current) return;
        setGeneral(null); setGeneralRetry(false); adopt(fresh); setNotice('Granskningen är sparad och timplanen har lästs igen.');
      } else {
        const status = parseTimplanTimeStatusReply(await api.post('/api/timplaner/gym/tidsstatus', { command }, c.signal), { command }), fresh = await read(c.signal);
        if (!active.current) return;
        if (status.state === 'completed') {
          if (fresh.revision < status.result.receipt.revision) throw new Error('Timplanen är äldre än sparbeskedet.');
          await clearJournal(); setGeneral(null); setGeneralRetry(false); adopt(fresh); setNotice('Det tidigare sparförsöket är bekräftat. Aktuell timplan visas.');
        } else if (fresh.revision !== command.expectedRevision || !gymTimplanCanEdit(fresh)) {
          await clearJournal(); setGeneral(null); setGeneralRetry(false); adopt(fresh); setNotice('Den tidigare ändringen är inte sparad och timplanen har ändrats. Granska den aktuella planen innan du försöker igen.');
        } else { setGeneralRetry(command.action !== 'save_rows'); setGeneralMfa(false); setJournalError('Ingen sparning har bekräftats. Samma ändring kan skickas igen utan dubbla sparningar.'); }
      }
    } catch (caught) {
      if (active.current && !onSecurityFailure(caught)) {
        setGeneral(command); setGeneralRetry(false); setGeneralMfa(caught instanceof ApiError && caught.code === 'mfa_required');
        setJournalError('Sparningen kunde inte bekräftas. Kontrollera status för samma sparförsök.');
      }
    } finally { running.current = false; if (active.current) { setSavingKey(null); onSaving(false); report(); } }
  }
  const display = { ...plan.timeRows };
  for (const [key, draft] of drafts) display[key] = values(draft.values) ?? plan.timeRows[key];
  const totals = timplanTimeTotals({ rows: plan.rows, timeRows: display });
  const requestedYear = ['0', '1', '2'].includes(year) ? year : 'all';
  const visibleYear = compact && requestedYear === 'all' ? String((yearProjection?.relativeYear ?? 1) - 1) : requestedYear;
  const years = [0, 1, 2].filter(y => visibleYear === 'all' || String(y) === visibleYear);
  const columns = years.flatMap(y => [{ index: y * 2, year: y, label: 'Skola HT' }, { index: y * 2 + 1, year: y, label: 'Skola VT' }, { index: y + 6, year: y, label: 'APL' }]);
  const editable = !!scope && journalReady && !general && !disabled && !distributionOpen && gymTimplanCanEdit(plan);
  function closeDistribution() { distribution.current = false; setDistributionOpen(false); report(); }
  return <>
    {journalError && <p role="alert" className="gt-error">{journalError}</p>}
    {general && <div className="gt-row-actions">{generalMfa && <MfaStepUpNotice message="Verifiera med engångskod och kontrollera sedan samma sparförsök."/>}<Button disabled={!!savingKey || generalMfa} onClick={() => void generalOperation(general, false)}>Kontrollera sparstatus</Button>{generalRetry && <Button disabled={!!savingKey || generalMfa} onClick={() => void generalOperation(general, true)}>Försök samma ändring igen</Button>}</div>}
    <ProtectedTimplanTimeCopyReview plan={plan} disabled={!editable || drafts.size > 0 || !!savingKey || !!general} onResolve={(reviewId, note) => { if (!editable || latest.current.size || running.current || !scope) return; const command: TimplanTimeCommand = { contractVersion: 'timplan_time_v2', action: 'resolve_copy_review', commandId: crypto.randomUUID(), planId: plan.id, expectedRevision: plan.revision, reviewId, note }; void generalOperation(command, true); }}/>

    {!journalReady && !journalError && <output>Kontrollerar tidigare sparförsök…</output>}
    <p className="gt-explanation">Planera skoltimmar för HT och VT och APL för hela årskursen. APL-perioder, veckor och datum kan du lägga in senare. Års-APL ingår redan i totalen.</p>
    <ProtectedTimplanBudget plan={plan} totalMinutes={totals.totalMinutes} aplMinutes={totals.aplMinutes} complete={totals.complete} pending={drafts.size > 0 || savingKey !== null || general !== null} invalid={[...drafts.values()].some(draft => values(draft.values) === null)}/>
    <div className="gt-year-totals">{[0, 1, 2].map(y => <div key={y}><span>Årskurs {y + 1}</span><strong>{hours(totals.yearMinutes[y])}</strong><span>Skola {hours(totals.termMinutes[y * 2] + totals.termMinutes[y * 2 + 1])} · APL {hours(totals.annualAplMinutes[y])}</span></div>)}</div>
    <div className="gt-toolbar"><p><strong>Hela planen: {hours(totals.totalMinutes)}</strong> · varav APL {percent(totals.aplPercent)}{!totals.complete && ' (preliminärt)'} <output className="gt-save-state">{savingKey ? 'Sparar…' : drafts.size ? 'Osparade ändringar' : 'Allt sparat'}</output></p>
      <Button disabled={!editable || drafts.size > 0 || savingKey !== null} onClick={() => { if (running.current || latest.current.size || disabledRef.current) return; distribution.current = true; setDistributionOpen(true); setNotice(null); report(); }}>Autofördela timmar</Button>
      <Button variant="outline" disabled={distributionOpen} onClick={() => setOnlyMissing(!onlyMissing)}>{onlyMissing ? 'Visa alla rader' : 'Visa bara ofördelade'}</Button></div>
    {notice && <output>{notice}</output>}
    {distributionOpen && <ProtectedGymTimplanDistribution plan={plan} onClose={closeDistribution} onSaved={fresh => { if (isGymTimplanV2(fresh)) adopt(fresh); }} onComplete={() => { closeDistribution(); setNotice('Fördelningen är sparad. Skoltimmar och APL visas i tabellen.'); }} onSecurityFailure={onSecurityFailure}/>}
    {yearProjection && <p className="gt-year-context">Planeringsläsår {planningYearLabel(yearProjection.schoolYear)}{yearProjection.relativeYear ? ` · årskurs ${yearProjection.relativeYear}` : ' · ligger utanför eller saknar känd årskurs i denna plan'}. {visibleYear === 'all' ? 'Visar alla årskurser.' : `Visar årskurs ${Number(visibleYear) + 1}.`} Totalen ovan avser alltid hela planen.</p>}
    <fieldset className="gt-year-buttons" aria-label="Visa årskurs"><legend>Visa årskurs</legend>{[0, 1, 2].map(y => <button key={y} type="button" disabled={blocked} aria-pressed={visibleYear === String(y)} onClick={() => onYear(String(y))}>Åk {y + 1}</button>)}{!compact && <button type="button" disabled={blocked} aria-pressed={visibleYear === 'all'} onClick={() => onYear('all')}>Visa hela planen</button>}</fieldset>
    <p className="gt-time-help">Ange timmar, till exempel 80, eller timmar:minuter, till exempel 79:30. Tomt betyder inte planerat; 0 betyder noll timmar. {compact && 'På telefon visas en årskurs i taget. Svep tabellen i sidled vid behov.'}</p>
    <section className="gt-table-scroll gt-time-scroll" aria-label="Skoltid och APL per årskurs"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard scrolling of wide year tables.
      tabIndex={0}>
      <table className="gt-matrix gt-time-matrix"><caption>{editable ? 'Ändringar sparas när du lämnar raden eller trycker Enter. ' : ''}Skola HT + Skola VT + års-APL = årets totala undervisningstid. Perioder läggs inte till en gång till.</caption>
        <thead><tr><th scope="col" rowSpan={2}>Ämne, nivå eller block</th>{years.map(y => <th key={y} scope="colgroup" colSpan={3}>Årskurs {y + 1}</th>)}<th scope="col" rowSpan={2}>Totalt, alla år</th><th scope="col" rowSpan={2}>Varav APL</th><th scope="col" rowSpan={2}>Sparstatus</th></tr><tr>{columns.map(c => <th key={c.index} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>{plan.rows.filter(row => !onlyMissing || totals.missingRows.includes(row.key) || drafts.has(row.key)).map(row => {
          const draft = drafts.get(row.key), invalid = !!draft && !values(draft.values), rowTotals = timplanTimeTotals({ rows: [row], timeRows: { [row.key]: display[row.key] } });
          return <tr key={row.key} data-row-key={row.key} className={draft ? 'gt-row-dirty' : undefined} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit(row.key); }}>
            <th scope="row"><strong>{row.name}</strong><span>{row.levelName} · {row.points} p</span>{draft?.error && <div className="gt-row-error" role="alert"><p>{draft.error}</p>{draft.mfa && <MfaStepUpNotice message={draft.error}/>}
              {draft.mode === 'compare' && <p>Sparat nu: {strings(plan.timeRows[row.key]).map((n, i) => `${i < 6 ? `Skola ${i % 2 === 0 ? 'HT' : 'VT'} åk ${Math.floor(i / 2) + 1}` : `APL åk ${i - 5}`}: ${n || 'ofördelat'}`).join(' · ')}</p>}
              <div className="gt-row-actions">{draft.pending ? <><Button size="sm" disabled={!!savingKey || draft.mfa} onClick={() => void recover(row.key)}>Kontrollera sparstatus</Button>{draft.mode === 'retry' && <Button size="sm" disabled={!!savingKey || draft.mfa || !editable} onClick={() => void recover(row.key, true)}>Försök spara samma ändring</Button>}</> : <><Button size="sm" variant="outline" disabled={!!savingKey} onClick={() => { if (running.current) return; queue.current.delete(row.key); replace(row.key, null); }}>Använd sparade värden</Button><Button size="sm" disabled={!!savingKey || invalid || !editable || draft.mfa} onClick={() => { if (draft.mode === 'compare') replace(row.key, { ...draft, original: saved.current.timeRows[row.key], mode: 'edit', error: null }); commit(row.key); }}>Spara min fördelning</Button></>}</div>
            </div>}</th>
            {columns.map(c => {
              const enabled = c.index < 6 ? row.pointTerms[c.index] > 0 : row.pointTerms[c.year * 2] > 0 || row.pointTerms[c.year * 2 + 1] > 0;
              return <td key={c.index} className={c.index >= 6 ? 'gt-apl-cell' : undefined}>{!enabled ? <span className="gt-inactive" aria-label="Ingår inte denna del av utbildningen">—</span> : editable ? <input type="text" className="gt-term-input" inputMode="text" aria-label={`${row.name} ${row.levelName}, ${c.label} årskurs ${c.year + 1}`} aria-invalid={invalid} data-row={row.key} data-time-cell={c.index} value={draft?.values[c.index] ?? strings(plan.timeRows[row.key])[c.index]} placeholder="·" disabled={draft?.mode === 'unread' || draft?.mode === 'retry' || draft?.mfa} onChange={event => setCell(row, c.index, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(row.key); } }}/>
                : <span>{strings(plan.timeRows[row.key])[c.index] || 'Ofördelat'}</span>}</td>;
            })}<td>{hours(rowTotals.totalMinutes)}{!rowTotals.complete && <small>Preliminärt</small>}</td><td>{percent(rowTotals.aplPercent)}</td><td className="gt-row-state">{savingKey === row.key ? 'Sparar…' : draft ? invalid ? 'Kontrollera' : 'Osparat' : rowTotals.complete ? 'Klar' : 'Ofördelat'}</td>
          </tr>;
        })}</tbody><tfoot><tr><th scope="row">Summa timmar</th>{columns.map(c => <td key={c.index}>{formatTimplanMinutes(c.index < 6 ? totals.termMinutes[c.index] : totals.annualAplMinutes[c.year])}</td>)}<td>{hours(totals.totalMinutes)}</td><td>{percent(totals.aplPercent)}</td><td>{totals.missingRows.length ? `${totals.missingRows.length} rader kvar` : 'Alla fält ifyllda'}</td></tr></tfoot>
      </table>
    </section>
  </>;
}
