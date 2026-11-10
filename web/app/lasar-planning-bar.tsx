'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanningSetup, type PlanningSetup } from '@/lib/planning-year-contract.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { useRequestDiscard, useHasUnsaved } from '@/lib/unsaved-changes.tsx';
import { PLANNING_SCOPE_TEXT } from './planning-context';
import './planning-context.css';
import './tjanst-planning-bar.css';

/**
 * Planeringsvalet för Läsår & skoldagar (05.1.1-06, D-07). Samma läsning (/api/planering/urval), samma etiketter och
 * samma skol- och läsårsvärden som planeringsvalet för Tjänstefördelning (tjanst-planning-bar.tsx, som inte ändras här).
 * Ett val gäller en skola och ett läsår. Med Alla behöriga skolor visar vyn ”Välj skola”; listan per skola kommer i plan 12.
 * Valet sparas bara som skolans ID och läsåret i fliken, nycklat på epok, kund och uppdrag; inga personuppgifter.
 */
export type LasarPlanningSelection = { unitId: string | null; schoolYear: number };
type Props = { contextKey: string; initial: Partial<LasarPlanningSelection> | null;
  onChange: (selection: LasarPlanningSelection) => void; onSessionLost: () => void;
  children: (selection: LasarPlanningSelection, schoolName: string | null) => ReactNode };
const WAIT = 'Invänta sparandet eller läs sparstatus innan du byter planeringsval.';
const STORE = 'lasar-planering:';
function remembered(contextKey: string): Partial<LasarPlanningSelection> | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORE + contextKey) ?? 'null') as Partial<LasarPlanningSelection> | null;
    return value && (value.unitId === null || typeof value.unitId === 'string') && Number.isInteger(value.schoolYear) ? value : null;
  } catch { return null; }
}
function remember(contextKey: string, selection: LasarPlanningSelection) {
  try { window.sessionStorage.setItem(STORE + contextKey, JSON.stringify({ unitId: selection.unitId, schoolYear: selection.schoolYear })); } catch { /* Valet gäller ändå i vyn. */ }
}

export default function LasarPlanningArea(props: Props) {
  return <Area key={props.contextKey} {...props}/>;
}

function Area({ contextKey, initial, onChange, onSessionLost, children }: Props) {
  const requestDiscard = useRequestDiscard();
  const [setup, setSetup] = useState<PlanningSetup | null>(null), [selection, setSelection] = useState<LasarPlanningSelection | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const navigationBlocked = useHasUnsaved('navigation-block:'), hasUnsaved = useHasUnsaved();
  const latest = useRef({ initial, onChange, onSessionLost });
  useLayoutEffect(() => { latest.current = { initial, onChange, onSessionLost }; });
  useEffect(() => {
    const c = new AbortController();
    void api.get('/api/planering/urval', c.signal).then(value => {
      if (c.signal.aborted) return;
      const loaded = parsePlanningSetup(value), wanted = latest.current.initial ?? remembered(contextKey);
      const year = typeof wanted?.schoolYear === 'number' && wanted.schoolYear >= loaded.minimumYear && wanted.schoolYear <= loaded.maximumYear ? wanted.schoolYear : loaded.currentYear;
      const unitId = typeof wanted?.unitId === 'string' && loaded.units.some(u => u.unitId === wanted.unitId) ? wanted.unitId
        : loaded.units.length === 1 ? loaded.units[0].unitId : null;
      setSetup(loaded); setSelection({ unitId, schoolYear: year }); setError(null);
    }).catch(caught => {
      if (c.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) { latest.current.onSessionLost(); return; }
      setError('Planeringsvalen kunde inte läsas. Försök igen.');
    });
    return () => c.abort();
  }, [retry, contextKey]);
  useEffect(() => { if (selection && contextKey) remember(contextKey, selection); }, [selection, contextKey]);
  async function change(patch: Partial<LasarPlanningSelection>) {
    if (!selection) return;
    if (navigationBlocked) { setNotice(WAIT); return; }
    if (hasUnsaved && !(await requestDiscard())) return;
    const next = { ...selection, ...patch };
    setNotice(null); setSelection(next); latest.current.onChange(next);
  }
  if (!setup || !selection) return <section className="planning-context" aria-label="Planeringsval" aria-busy={!error}>
    {!error && <output>Läser planeringsval…</output>}{error && <p role="alert">{error} <button type="button" onClick={() => { setError(null); setRetry(n => n + 1); }}>Försök igen</button></p>}
  </section>;
  const schoolName = setup.units.find(u => u.unitId === selection.unitId)?.schoolName ?? null;
  return <>
    <section className="planning-context tjanst-planning-context" aria-label="Planeringsval">
      <div className="planning-context-controls"><details className="planning-context-help"><summary>Planering</summary><p>{PLANNING_SCOPE_TEXT}</p></details>
        <label><span>Skola</span><select aria-label="Planeringsskola" value={selection.unitId ?? 'all'} onChange={e => change({ unitId: e.target.value === 'all' ? null : e.target.value })}>
          <option value="all">Alla behöriga skolor</option>{setup.units.map(unit => <option key={unit.unitId} value={unit.unitId}>{unit.schoolName}</option>)}
        </select></label>
        <div className="planning-context-years"><button type="button" aria-label="Föregående planeringsläsår" disabled={selection.schoolYear <= setup.minimumYear}
          onClick={() => change({ schoolYear: selection.schoolYear - 1 })}>‹</button>
          <label><span>Läsår</span><select aria-label="Planeringsläsår" value={selection.schoolYear} onChange={e => change({ schoolYear: Number(e.target.value) })}>
            {Array.from({ length: setup.maximumYear - setup.minimumYear + 1 }, (_, i) => setup.minimumYear + i)
              .map(year => <option key={year} value={year}>{planningYearLabel(year)}{year === setup.currentYear ? ' · aktuellt' : ''}</option>)}
          </select></label>
          <button type="button" aria-label="Nästa planeringsläsår" disabled={selection.schoolYear >= setup.maximumYear} onClick={() => change({ schoolYear: selection.schoolYear + 1 })}>›</button>
        </div>
        {selection.schoolYear === setup.currentYear ? <span className="planning-context-current">Aktuellt läsår</span> :
          <button type="button" onClick={() => change({ schoolYear: setup.currentYear })}>Till aktuellt läsår</button>}
      </div>
      {notice && <output>{notice}</output>}
    </section>
    {children(selection, schoolName)}
  </>;
}
