'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseLasarReadReply, type LasarMode } from '@/lib/lasar-contract.ts';
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
 *
 * Huvudmannens ram (05.1.1-10, D-08): med `frameChoice` (bara när sessionens uppdrag är huvudman) läser valet arbetssättet för
 * läsåret ur ramens mål (/api/lasar/lasa). Posten `Huvudmannens ram` står då först i skollistan, men bara när arbetssättet är
 * ram och bara i den här vyn. Valet ger `frame: true`; skolans ID skickas inte vidare till andra planeringsvyer. Servern prövar
 * ändå att aktören är huvudman: rektor och skoladministratör får aldrig ramens mål, oavsett vad klienten väljer.
 */
export type LasarPlanningSelection = { unitId: string | null; schoolYear: number; frame?: boolean };
type Props = { contextKey: string; initial: Partial<LasarPlanningSelection> | null; frameChoice?: boolean;
  onChange: (selection: LasarPlanningSelection) => void; onSessionLost: () => void;
  children: (selection: LasarPlanningSelection, schoolName: string | null) => ReactNode };
const WAIT = 'Invänta sparandet eller läs sparstatus innan du byter planeringsval.';
const STORE = 'lasar-planering:';
function remembered(contextKey: string): Partial<LasarPlanningSelection> | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORE + contextKey) ?? 'null') as Partial<LasarPlanningSelection> | null;
    return value && (value.unitId === null || typeof value.unitId === 'string') && Number.isInteger(value.schoolYear)
      && (value.frame === undefined || typeof value.frame === 'boolean') ? value : null;
  } catch { return null; }
}
function remember(contextKey: string, selection: LasarPlanningSelection) {
  try { window.sessionStorage.setItem(STORE + contextKey, JSON.stringify({ unitId: selection.unitId, schoolYear: selection.schoolYear, frame: selection.frame === true })); } catch { /* Valet gäller ändå i vyn. */ }
}

export default function LasarPlanningArea(props: Props) {
  return <Area key={props.contextKey} {...props}/>;
}

function Area({ contextKey, initial, frameChoice = false, onChange, onSessionLost, children }: Props) {
  const requestDiscard = useRequestDiscard();
  const [setup, setSetup] = useState<PlanningSetup | null>(null), [selection, setSelection] = useState<LasarPlanningSelection | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const navigationBlocked = useHasUnsaved('navigation-block:'), hasUnsaved = useHasUnsaved();
  const [frameMode, setFrameMode] = useState<{ schoolYear: number; mode: LasarMode } | null>(null);
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
      const frame = unitId === null && (wanted?.frame ?? remembered(contextKey)?.frame) === true;
      setSetup(loaded); setSelection({ unitId, schoolYear: year, frame }); setError(null);
    }).catch(caught => {
      if (c.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) { latest.current.onSessionLost(); return; }
      setError('Planeringsvalen kunde inte läsas. Försök igen.');
    });
    return () => c.abort();
  }, [retry, contextKey]);
  useEffect(() => { if (selection && contextKey) remember(contextKey, selection); }, [selection, contextKey]);
  // Arbetssättet för valt läsår, bara för huvudmannen. Fel ger ingen rampost (stängt läge); planeringsvalet fungerar ändå.
  const year = selection?.schoolYear ?? null;
  useEffect(() => {
    if (!frameChoice || year === null) return;
    const c = new AbortController(), request = { target: { kind: 'frame' as const }, schoolYear: year, versionId: null };
    void api.post<unknown>('/api/lasar/lasa', request, c.signal).then(value => {
      if (!c.signal.aborted) setFrameMode({ schoolYear: year, mode: parseLasarReadReply(value, request).mode });
    }).catch(caught => {
      if (c.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { latest.current.onSessionLost(); return; }
      setFrameMode(null);
    });
    return () => c.abort();
  }, [frameChoice, year]);
  async function change(patch: Partial<LasarPlanningSelection>) {
    if (!selection) return;
    if (navigationBlocked) { setNotice(WAIT); return; }
    if (hasUnsaved && !(await requestDiscard())) return;
    const next = { ...selection, ...patch };
    setNotice(null); setSelection(next); latest.current.onChange({ unitId: next.frame ? null : next.unitId, schoolYear: next.schoolYear });
  }
  if (!setup || !selection) return <section className="planning-context" aria-label="Planeringsval" aria-busy={!error}>
    {!error && <output>Läser planeringsval…</output>}{error && <p role="alert">{error} <button type="button" onClick={() => { setError(null); setRetry(n => n + 1); }}>Försök igen</button></p>}
  </section>;
  const showFrame = frameChoice && frameMode?.schoolYear === selection.schoolYear && frameMode.mode === 'ram';
  const frame = showFrame && selection.frame === true;
  const schoolName = frame ? null : setup.units.find(u => u.unitId === selection.unitId)?.schoolName ?? null;
  return <>
    <section className="planning-context tjanst-planning-context" aria-label="Planeringsval">
      <div className="planning-context-controls"><details className="planning-context-help"><summary>Planering</summary><p>{PLANNING_SCOPE_TEXT}</p></details>
        <label><span>Skola</span><select aria-label="Planeringsskola" value={frame ? 'ram' : selection.unitId ?? 'all'}
          onChange={e => change(e.target.value === 'ram' ? { unitId: null, frame: true } : { unitId: e.target.value === 'all' ? null : e.target.value, frame: false })}>
          {showFrame && <option value="ram">Huvudmannens ram</option>}
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
    {children({ ...selection, frame }, schoolName)}
  </>;
}
