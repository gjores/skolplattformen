'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useHasUnsaved } from '@/lib/unsaved-changes.tsx';
import { parsePlanningSetup, type PlanningSelection, type PlanningSetup } from '@/lib/planning-year-contract.ts';
import { normalizePlanLocation, planningReadScopeLost, planningLocationChange, planLocationQuery, readPlanLocationResult, type PlanLocation, type VerifiedPlanningScope } from '@/lib/protected-plan-location.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import './planning-context.css';

export type PlanningContextProps = { contextKey: string; active: boolean; location: PlanLocation | null;
  onTransition: (location: PlanLocation, mode: 'push' | 'replace') => void; onSessionLost: () => void; children: ReactNode };
export type PlanningMatrixYear = 0 | 1 | 2 | 'all';
export type PlanningContextValue = { setup: PlanningSetup | null; selection: PlanningSelection | null; loading: boolean;
  error: string | null; normalizationNotice: string | null; matrixYear: PlanningMatrixYear | null; requestMatrixYear: (year: PlanningMatrixYear) => void; requestChange: (patch: Partial<PlanningSelection>) => void; retry: () => void };
const Context = createContext<PlanningContextValue | null>(null);
const WAIT = 'Invänta sparandet eller läs sparstatus innan du byter planeringsval.';
type State = { key: string; active: boolean; inputQuery: string | null; ready: boolean; setup: PlanningSetup | null;
  location: PlanLocation | null; loading: boolean; error: string | null; notice: string | null };

export function PlanningContextProvider(props: PlanningContextProps) {
  const navigationBlocked = useHasUnsaved('navigation-block:'), hasUnsaved = useHasUnsaved();
  const inputQuery = props.location ? planLocationQuery(props.location) : null;
  const [state, setState] = useState<State>({ key: props.contextKey, active: props.active, inputQuery, ready: false, setup: null,
    location: props.location, loading: props.active, error: null, notice: null });
  const [retryIndex, setRetryIndex] = useState(0);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);
  const generation = useRef(0), verified = useRef<(VerifiedPlanningScope & { key: string }) | null>(null);
  // Adjust only when these explicit props change. Cached values never render under a new security scope.
  if (state.key !== props.contextKey) {
    setState({ key: props.contextKey, active: props.active, inputQuery, ready: false, setup: null,
      location: props.location, loading: props.active, error: null, notice: null });
  } else if (state.active !== props.active) {
    setState({ ...state, active: props.active, inputQuery, ready: false, location: props.location ?? state.location,
      loading: props.active, error: null });
  } else if (state.inputQuery !== inputQuery) {
    setState({ ...state, inputQuery, location: props.location ?? state.location });
  }
  const scoped = state.key === props.contextKey && state.active === props.active ? state : null;
  const resolvedLocation = props.location ?? scoped?.location ?? null;
  const normalized = useMemo(() => scoped?.ready && scoped.setup && resolvedLocation ? normalizePlanLocation(resolvedLocation, scoped.setup) : null,
    [scoped, resolvedLocation]);
  useLayoutEffect(() => {
    if (verified.current?.key !== props.contextKey) verified.current = null;
    if (scoped?.ready && scoped.setup && normalized) verified.current = { key: props.contextKey, setup: scoped.setup, selection: normalized.selection };
  }, [props.contextKey, scoped, normalized]);

  useEffect(() => {
    if (!props.contextKey || !props.active) return;
    const token = ++generation.current, key = props.contextKey, c = new AbortController();
    let cancelled = false;
    const current = () => !cancelled && generation.current === token && latest.current.contextKey === key && latest.current.active && !c.signal.aborted;
    void api.get('/api/planering/urval', c.signal).then(value => {
      if (!current()) return;
      const setup = parsePlanningSetup(value);
      // A real revocation wins over unknown/busy navigation. Never render the revoked snapshot.
      if (planningReadScopeLost(verified.current?.key === key ? verified.current : null, setup)) {
        verified.current = null; c.abort();
        setState({ key: '', active: false, inputQuery: null, ready: false, setup: null, location: null, loading: false, error: null, notice: null });
        latest.current.onSessionLost(); return;
      }
      setState(previous => {
        if (!current()) return previous;
        const location = latest.current.location ?? (previous.key === key ? previous.location : null);
        const result = location ? normalizePlanLocation(location, setup) : null;
        return { ...previous, key, active: true, ready: true, setup, location: result?.location ?? location, loading: false, error: null,
          notice: result?.normalizationNotice ?? readPlanLocationResult(window.location.search).normalizationNotice };
      });
    }).catch(error => {
      if (!current()) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403 && error.code !== 'mfa_required')) {
        verified.current = null; c.abort();
        setState({ key: '', active: false, inputQuery: null, ready: false, setup: null, location: null, loading: false, error: null, notice: null });
        latest.current.onSessionLost(); return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState(previous => ({ ...previous, loading: false, error: 'Planeringsvalen kunde inte läsas. Försök igen.' }));
    });
    return () => { cancelled = true; c.abort(); };
  }, [props.contextKey, props.active, retryIndex]);

  // Only the shell writes browser history, including canonicalization after a real setup read.
  useEffect(() => {
    if (!props.active || !normalized || scoped?.loading || navigationBlocked) return;
    if (planLocationQuery(normalized.location) !== (props.location ? planLocationQuery(props.location) : null)) {
      latest.current.onTransition(normalized.location, 'replace');
    }
  }, [props.active, props.location, normalized, scoped?.loading, navigationBlocked]);

  const requestChange = (patch: Partial<PlanningSelection>) => {
    if (!props.active || !normalized || !scoped?.setup || scoped.loading) return;
    if (navigationBlocked) { setState(current => ({ ...current, notice: WAIT })); return; }
    if (hasUnsaved && !confirmDiscard()) return;
    const location = normalized.location;
    let next: ReturnType<typeof planningLocationChange>;
    try { next = planningLocationChange(location, patch, scoped.setup); }
    catch { setState(current => ({ ...current, notice: 'Planeringsvalet kunde inte användas. Kontrollera filtret.' })); return; }
    if (planLocationQuery(next.location) === planLocationQuery(location)) return;
    setState(current => ({ ...current, location: next.location, notice: next.normalizationNotice }));
    latest.current.onTransition(next.location, 'push');
  };
  const requestMatrixYear = useCallback((year: PlanningMatrixYear) => {
    if (!props.active || !normalized || !scoped?.setup || scoped.loading || latest.current.contextKey !== props.contextKey || !latest.current.active) return;
    if (navigationBlocked) { setState(current => ({ ...current, notice: WAIT })); return; }
    if (year !== 'all' && ![0, 1, 2].includes(year)) return;
    // The same mounted workspace keeps every value. This changes visible columns only.
    const { relativeYear: _relative, allYears: _all, ...base } = normalized.location;
    if (base.overview || !(base.view === 'programplaner' ? base.programplan : base.gym)) return;
    const location: PlanLocation = { ...base, allYears: year === 'all', ...(year !== 'all' ? { relativeYear: (year + 1) as 1 | 2 | 3 } : {}) };
    if (planLocationQuery(location) === planLocationQuery(normalized.location)) return;
    setState(current => ({ ...current, location, notice: normalized.normalizationNotice }));
    latest.current.onTransition(location, 'replace');
  }, [props.active, props.contextKey, normalized, scoped, navigationBlocked]);
  const value: PlanningContextValue = {
    setup: props.active && scoped?.ready ? scoped.setup : null, selection: props.active ? normalized?.selection ?? null : null,
    loading: props.active && (!scoped || scoped.loading || !scoped.ready && !scoped.error), error: scoped?.error ?? null,
    normalizationNotice: normalized?.normalizationNotice ?? scoped?.notice ?? null,
    matrixYear: props.active && normalized ? normalized.location.allYears === true ? 'all' : normalized.location.relativeYear !== undefined ? (normalized.location.relativeYear - 1) as 0 | 1 | 2 : null : null, requestMatrixYear, requestChange,
    retry: () => { setState(current => ({ ...current, loading: true, error: null })); setRetryIndex(n => n + 1); },
  };
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}
export function usePlanningContext(): PlanningContextValue {
  const context = useContext(Context);
  if (!context) throw new Error('usePlanningContext kräver PlanningContextProvider.');
  return context;
}
export function PlanningContextBar() {
  const { setup, selection, loading, error, normalizationNotice, requestChange, retry } = usePlanningContext();
  if (!setup || !selection) return <section className="planning-context" aria-label="Planeringsval" aria-busy={loading}>
    {loading && <output>Läser planeringsval…</output>}{error && <p role="alert">{error} <button type="button" onClick={retry}>Försök igen</button></p>}
  </section>;
  const units = setup.units.filter(unit => selection.view === 'programplan' ? unit.canRead.programplan : unit.canRead[selection.schoolform]);
  return <section className="planning-context" aria-label="Planeringsval" aria-busy={loading}>
    <div className="planning-context-controls"><strong>Planering</strong>
      <label>Skola<select aria-label="Planeringsskola" value={selection.unitId ?? 'all'} disabled={loading || !units.length}
        onChange={e => requestChange({ unitId: e.target.value === 'all' ? null : e.target.value })}>
        <option value="all">Alla behöriga skolor</option>{units.map(unit => <option key={unit.unitId} value={unit.unitId}>{unit.schoolName}</option>)}
      </select></label>
      <div className="planning-context-years"><button type="button" aria-label="Föregående planeringsläsår" disabled={loading || selection.schoolYear <= setup.minimumYear}
        onClick={() => requestChange({ schoolYear: selection.schoolYear - 1 })}>‹</button>
        <label>Läsår<select aria-label="Planeringsläsår" value={selection.schoolYear} disabled={loading} onChange={e => requestChange({ schoolYear: Number(e.target.value) })}>
          {Array.from({ length: setup.maximumYear - setup.minimumYear + 1 }, (_, i) => setup.minimumYear + i)
            .map(year => <option key={year} value={year}>{planningYearLabel(year)}{year === setup.currentYear ? ' · aktuellt' : ''}</option>)}
        </select></label>
        <button type="button" aria-label="Nästa planeringsläsår" disabled={loading || selection.schoolYear >= setup.maximumYear}
          onClick={() => requestChange({ schoolYear: selection.schoolYear + 1 })}>›</button>
      </div>
      {selection.schoolYear === setup.currentYear ? <span className="planning-context-current">Aktuellt läsår</span> :
        <button type="button" disabled={loading} onClick={() => requestChange({ schoolYear: setup.currentYear })}>Till aktuellt läsår</button>}
    </div>
    {!units.length && <output>Du har ingen läsbehörig skola för den här skolformen.</output>}
    {normalizationNotice && <output>{normalizationNotice}</output>}
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Försök igen</button></p>}
  </section>;
}
