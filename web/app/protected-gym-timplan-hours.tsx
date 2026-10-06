'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { PROGRAMPLAN_TERMS } from '@/lib/programplan-terms.ts';
import { gymTimplanCanEdit, gymTimplanTotals, parseGymTimplan, parseGymTimplanHourInput, parseGymTimplanRowReply,
  type GymTimplan, type GymTimplanHours, type GymTimplanRow } from '@/lib/gym-timplan.ts';
import MfaStepUpNotice from './mfa-step-up';

type Draft = { values: string[]; original: GymTimplanHours; mode: 'edit' | 'compare' | 'unread'; error: string | null; mfa: boolean };
type Props = { plan: GymTimplan; year: string; onYear: (year: string) => void; unsavedId: string;
  onSaved: (plan: GymTimplan) => void; onSaving: (saving: boolean) => void; onSecurityFailure: (error: unknown) => boolean };
const strings = (hours: GymTimplanHours) => hours.map(value => value === null ? '' : String(value));
const hours = (values: string[]): GymTimplanHours | null => {
  const parsed = values.map(parseGymTimplanHourInput);
  return parsed.some(value => value === undefined) ? null : parsed as GymTimplanHours;
};
const same = (a: GymTimplanHours, b: GymTimplanHours) => a.every((value, i) => value === b[i]);
const matches = (values: string[], saved: GymTimplanHours) => { const parsed = hours(values); return !!parsed && same(parsed, saved); };

/** Inlineceller delar den befintliga atomiska radskrivningen. Kön håller CAS-revisioner i ordning. */
export default function ProtectedGymTimplanHours({ plan, year, onYear, unsavedId, onSaved, onSaving, onSecurityFailure }: Props) {
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map()), [savingKey, setSavingKey] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const latest = useRef(drafts), saved = useRef(plan), queue = useRef(new Set<string>()), running = useRef(false);
  const active = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => { if (plan.revision >= saved.current.revision) saved.current = plan; }, [plan]);
  useEffect(() => { const pendingRows = queue.current; active.current = true; return () => { active.current = false; controller.current?.abort(); pendingRows.clear(); }; }, []);
  useUnsavedChanges(unsavedId, drafts.size > 0 || savingKey !== null);
  const editable = gymTimplanCanEdit(plan);
  function update(next: Map<string, Draft>) { latest.current = next; setDrafts(next); }
  function replace(key: string, draft: Draft | null) {
    const next = new Map(latest.current); if (draft) next.set(key, draft); else next.delete(key); update(next);
  }
  function adopt(fresh: GymTimplan) { saved.current = fresh; onSaved(fresh); }
  async function read(signal: AbortSignal) {
    return parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: saved.current.id }, signal), saved.current.id);
  }
  function reconcile(key: string, fresh: GymTimplan, sent: GymTimplanHours, confirmed: boolean) {
    adopt(fresh);
    const now = latest.current.get(key); if (!now) return;
    if (matches(now.values, fresh.hours[key])) replace(key, null);
    else if (confirmed && same(sent, fresh.hours[key])) {
      replace(key, { ...now, original: fresh.hours[key], mode: 'edit', error: null, mfa: false });
      // Inmatning under en redan påbörjad sparning följer med nästa radskrivning.
      queue.current.add(key);
    } else replace(key, { ...now, mode: 'compare', mfa: false,
      error: 'Aktuell timplan har hämtats. Jämför sparade timmar med dina värden innan du sparar igen.' });
  }
  async function drain() {
    if (running.current || !active.current) return;
    running.current = true; onSaving(true);
    try {
      while (queue.current.size && active.current) {
        // Efter oläst sparstatus eller MFA måste underlaget först bekräftas.
        if ([...latest.current.values()].some(d => d.mode === 'unread' || d.mfa)) break;
        const key = queue.current.values().next().value!; queue.current.delete(key);
        const own = latest.current.get(key), before = saved.current;
        if (!own || own.mode !== 'edit' || !gymTimplanCanEdit(before)) continue;
        const values = hours(own.values);
        if (!values) { replace(key, { ...own, error: 'Ange hela timmar mellan 0 och 2 000, eller lämna cellen tom.' }); continue; }
        if (same(values, before.hours[key])) { replace(key, null); continue; }
        if (!same(own.original, before.hours[key])) {
          replace(key, { ...own, mode: 'compare', error: 'Raden har ändrats. Jämför sparade timmar med dina värden.' }); continue;
        }
        setSavingKey(key); replace(key, { ...own, error: null });
        const c = new AbortController(); controller.current = c;
        const request = { planId: before.id, expectedRevision: before.revision, rowKey: key, hours: values };
        let accepted = false;
        try {
          parseGymTimplanRowReply(await api.post('/api/timplaner/gym/rad', request, c.signal), request); accepted = true;
          const fresh = await read(c.signal); if (!active.current) return;
          reconcile(key, fresh, values, true);
        } catch (caught) {
          if (!active.current || onSecurityFailure(caught)) return;
          if (accepted || !(caught instanceof ApiError) || !caught.hasExplicitCode || caught.status === 409) {
            try {
              const fresh = await read(c.signal); if (!active.current) return;
              reconcile(key, fresh, values, accepted || !(caught instanceof ApiError) || !caught.hasExplicitCode);
            } catch (inner) {
              if (!active.current || onSecurityFailure(inner)) return;
              const now = latest.current.get(key);
              if (now) replace(key, { ...now, mode: 'unread', error: 'Sparstatus kunde inte läsas. Dina värden finns kvar. Läs aktuell timplan innan du sparar igen.' });
            }
          } else {
            queue.current.delete(key);
            const now = latest.current.get(key);
            if (now) replace(key, { ...now, error: caught.message, mfa: caught.code === 'mfa_required' });
          }
        }
      }
    } finally {
      running.current = false;
      if (active.current) { setSavingKey(null); onSaving(false); }
    }
  }
  function commit(key: string) {
    const draft = latest.current.get(key);
    if (!draft || draft.mode !== 'edit' || draft.mfa) return;
    queue.current.add(key); void drain();
  }
  function setCell(row: GymTimplanRow, i: number, value: string) {
    if (!gymTimplanCanEdit(saved.current) || row.pointTerms[i] === 0) return;
    const own = latest.current.get(row.key) ?? { values: strings(saved.current.hours[row.key]), original: saved.current.hours[row.key], mode: 'edit' as const, error: null, mfa: false };
    replace(row.key, { ...own, values: own.values.map((old, j) => i === j ? value : old), error: own.mode === 'edit' ? null : own.error });
  }
  async function reload(key: string) {
    if (running.current) return;
    running.current = true; onSaving(true); setSavingKey(key);
    const c = new AbortController(); controller.current = c;
    try {
      const fresh = await read(c.signal); if (!active.current) return;
      adopt(fresh); const own = latest.current.get(key);
      if (own) replace(key, matches(own.values, fresh.hours[key]) ? null : { ...own, mode: 'compare', mfa: false, error: 'Aktuell timplan har hämtats. Jämför innan du sparar igen.' });
    } catch (caught) {
      if (active.current && !onSecurityFailure(caught)) {
        const own = latest.current.get(key); if (own) replace(key, { ...own, mode: 'unread', error: 'Timplanen kunde inte läsas. Dina värden finns kvar.' });
      }
    } finally {
      running.current = false;
      if (active.current) {
        setSavingKey(null); onSaving(false);
        if (queue.current.size && ![...latest.current.values()].some(d => d.mode === 'unread' || d.mfa)) void drain();
      }
    }
  }
  function keepMine(key: string) {
    const own = latest.current.get(key); if (!own || running.current) return;
    replace(key, { ...own, original: saved.current.hours[key], mode: 'edit', error: null, mfa: false }); commit(key);
  }

  const displayHours = { ...plan.hours };
  for (const [key, draft] of drafts) displayHours[key] = draft.values.map((value, i) => parseGymTimplanHourInput(value) ?? (value.trim() === '' ? null : plan.hours[key][i])) as GymTimplanHours;
  const totals = gymTimplanTotals({ rows: plan.rows, hours: displayHours });
  const columns = PROGRAMPLAN_TERMS.map((label, i) => ({ label, i })).filter(({ i }) => year === 'all' || Math.floor(i / 2) === Number(year));
  // En nyss ifylld rad ligger kvar tills dess sparning bekräftats.
  const rows = plan.rows.filter(row => !onlyMissing || totals.missingRows.includes(row.key) || drafts.has(row.key));
  const issues = [...drafts.values()].some(d => d.error || d.mode !== 'edit' || d.mfa);
  return <>
    <div className="gt-year-totals">{[0, 1, 2].map(y => <div key={y}><span>Årskurs {y + 1}</span><strong>{totals.terms[y * 2] + totals.terms[y * 2 + 1]} <small>timmar</small></strong><span>HT {totals.terms[y * 2]} · VT {totals.terms[y * 2 + 1]}</span></div>)}</div>
    <div className="gt-toolbar"><p><strong>{totals.total} timmar</strong> planerade · {totals.missingRows.length ? `${totals.missingRows.length} rader kvar att fördela` : 'alla aktiva terminer ifyllda'} <output className={`gt-save-state${issues ? ' gt-save-warning' : ''}`}>{savingKey ? 'Sparar…' : drafts.size ? 'Osparade ändringar' : 'Allt sparat'}</output></p><Button variant="outline" onClick={() => setOnlyMissing(value => !value)}>{onlyMissing ? 'Visa alla rader' : 'Visa bara ofördelade'}</Button></div>
    <label className="gt-year-picker">Visa årskurs<select value={year} onChange={event => onYear(event.target.value)}><option value="all">Alla årskurser</option>{[0, 1, 2].map(y => <option key={y} value={y}>Årskurs {y + 1}</option>)}</select></label>
    <section className="gt-table-scroll" aria-label="Skolans undervisningstid"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla även läsvyn.
      tabIndex={0}>
      <table className="gt-matrix"><caption>{editable ? 'Fyll i timmar direkt i terminscellerna. Ändringar sparas när du lämnar raden eller trycker Enter. ' : ''}Tom cell är ofördelad; 0 är angivna noll timmar. Poängen under cellerna är programplanens underlag.</caption>
        <thead><tr><th scope="col">Ämne, nivå eller block</th><th scope="col">Poäng</th>{columns.map(({ label, i }) => <th scope="col" key={i}>{label}</th>)}<th scope="col">Fördelat</th></tr></thead>
        <tbody>{rows.map(row => {
          const own = drafts.get(row.key), invalid = !!own && !hours(own.values), missing = row.pointTerms.filter((p, i) => p > 0 && displayHours[row.key][i] === null).length;
          return <tr key={row.key} data-row-key={row.key} className={own ? 'gt-row-dirty' : undefined} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit(row.key); }}>
            <th scope="row"><strong>{row.name}</strong><span>{row.levelName}</span>{own?.error && <div className="gt-row-error" role="alert"><p>{own.error}</p>
              {own.mfa ? <MfaStepUpNotice message={own.error}/> : <>
                {own.mode === 'compare' && <p>Sparat nu: {PROGRAMPLAN_TERMS.filter((_, i) => row.pointTerms[i] > 0).map(term => { const i = PROGRAMPLAN_TERMS.indexOf(term); return `${term}: ${plan.hours[row.key][i] ?? 'ofördelat'}`; }).join(' · ')}</p>}
                <div className="gt-row-actions"><Button size="sm" variant="outline" disabled={!!savingKey} onClick={() => { queue.current.delete(row.key); replace(row.key, null); }}>Använd sparade värden</Button>
                  {own.mode === 'unread' ? <Button size="sm" disabled={!!savingKey} onClick={() => void reload(row.key)}>Läs aktuell timplan</Button>
                    : <Button size="sm" disabled={!!savingKey || invalid || !editable} onClick={() => own.mode === 'compare' ? keepMine(row.key) : commit(row.key)}>{own.mode === 'compare' ? 'Spara min fördelning' : 'Försök spara igen'}</Button>}</div>
              </>}</div>}</th>
            <td>{row.points}</td>{columns.map(({ i, label }) => <td key={i}>{row.pointTerms[i] === 0 ? <span className="gt-inactive" aria-label="Ingår inte denna termin">—</span> : <>
              {editable ? <input className="gt-term-input" type="text" inputMode="numeric" aria-label={`${row.name} ${row.levelName}, ${label}`} data-row={row.key} data-term={i}
                value={own?.values[i] ?? (plan.hours[row.key][i] === null ? '' : String(plan.hours[row.key][i]))} placeholder="·" aria-invalid={invalid}
                disabled={own?.mode === 'unread' || own?.mfa} onChange={event => setCell(row, i, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
                : <span className={plan.hours[row.key][i] === null ? 'gt-unallocated' : ''}>{plan.hours[row.key][i] ?? 'Ofördelat'}</span>}
              <small>{row.pointTerms[i]} p</small></>}</td>)}<td className="gt-row-state">{savingKey === row.key ? 'Sparar…' : own ? invalid ? 'Kontrollera' : 'Osparat' : missing ? `${missing} kvar` : 'Klar'}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr><th scope="row">Summa per termin</th><td>{plan.rows.reduce((sum, row) => sum + row.points, 0)}</td>{columns.map(({ i }) => <td key={i}>{totals.terms[i]}</td>)}<td>{totals.total}</td></tr></tfoot>
      </table>{!rows.length && <p className="gt-empty">Alla rader har angiven tid i de aktiva terminerna.</p>}
    </section>
  </>;
}
