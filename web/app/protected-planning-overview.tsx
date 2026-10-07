'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanningOverview, parsePlanningSelection, type PlanningOverview, type PlanningSelection } from '@/lib/planning-year-contract.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { usePlanningContext } from './planning-context';
import { PlanningFilterControls, planningMeasureText, planningRelationLabel } from './protected-plan-list';

type Props = { onSecurityFailure: (error: unknown) => boolean;
  onChooseCollection: (view: PlanningSelection['view'], schoolform: PlanningSelection['schoolform']) => void;
  onShowPlans: () => void };
type State = { key: string; data: PlanningOverview | null; loading: boolean; error: string | null };
export default function ProtectedPlanningOverview({ onSecurityFailure, onChooseCollection, onShowPlans }: Props) {
  const { setup, selection, requestChange } = usePlanningContext();
  // An overview is the complete filtered collection, never the selected list page.
  const queryKey = selection ? JSON.stringify({ ...selection, page: 1, selectionRevision: null }) : '';
  const scopeKey = setup ? JSON.stringify(setup) : '', key = `${scopeKey}|${queryKey}`;
  const selected = useMemo(() => queryKey ? parsePlanningSelection(JSON.parse(queryKey)) : null, [queryKey]);
  const latest = useRef({ key, onSecurityFailure });
  useLayoutEffect(() => { latest.current = { key, onSecurityFailure }; }, [key, onSecurityFailure]);
  const [state, setState] = useState<State>({ key: '', data: null, loading: true, error: null }), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!setup || !selected) return;
    const controller = new AbortController(); let cancelled = false;
    const current = () => !cancelled && !controller.signal.aborted && latest.current.key === key;
    queueMicrotask(() => { if (current()) setState({ key, data: null, loading: true, error: null }); });
    void api.post('/api/planering/oversikt', selected, controller.signal).then(raw => {
      const data = parsePlanningOverview(raw, selected, setup);
      if (current()) setState({ key, data, loading: false, error: null });
    }).catch(error => {
      if (!current() || error instanceof DOMException && error.name === 'AbortError') return;
      if (latest.current.onSecurityFailure(error)) return;
      setState({ key, data: null, loading: false, error: error instanceof ApiError && error.status === 409
        ? 'Underlagets källor har ändrats. Läs om överblicken.' : 'Läsårsöverblicken kunde inte läsas. Försök igen.' });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [key, selected, setup, retry]);
  const visible = state.key === key ? state : null, data = visible?.data, busy = !visible || visible.loading;
  if (!selection || !setup) return <output>Läser planeringsval…</output>;
  const collections: { label: string; view: PlanningSelection['view']; schoolform: PlanningSelection['schoolform'] }[] = [
    { label: 'Programramar', view: 'programplan', schoolform: 'gymnasium' },
    { label: 'Gymnasiets timplaner', view: 'timplan', schoolform: 'gymnasium' },
    { label: 'Grundskolans timplaner', view: 'timplan', schoolform: 'grundskola' },
    { label: 'Introduktionsprogrammets veckoramar', view: 'timplan', schoolform: 'introduktionsprogram' },
  ];
  const missingPlans = data?.rows.filter(row => !row.plan).length ?? 0;
  const unknownHours = data?.rows.filter(row => row.diagnostics.includes('missing-hours')).length ?? 0;
  return <section className="planning-overview plan-list" aria-label="Läsårsöverblick" aria-busy={busy}>
    <h1>Läsårsöverblick {planningYearLabel(selection.schoolYear)}</h1>
    <p>Se nya och fortsättande kullar tillsammans. Programramens poäng och skolans planerade timmar visas som olika mått.</p>
    <div className="planning-overview-kulls" aria-label="Välj planeringsunderlag">{collections.filter(c => setup.units.some(unit => c.view === 'programplan' ? unit.canRead.programplan : unit.canRead[c.schoolform]))
      .map(c => <button key={`${c.view}-${c.schoolform}`} type="button" aria-pressed={selection.view === c.view && selection.schoolform === c.schoolform}
        onClick={() => onChooseCollection(c.view, c.schoolform)}>{c.label}</button>)}</div>
    <PlanningFilterControls/>
    {busy && <output>Läser hela årsunderlaget…</output>}
    {visible?.error && <p role="alert">{visible.error} <button type="button" onClick={() => setRetry(n => n + 1)}>Läs om överblicken</button></p>}
    {data && <><p>{data.count} planeringsrader i hela urvalet. Varje rad avser en skola och en faktisk planversion.</p>
      <dl className="planning-overview-metrics">
        {data.totals.points && <div><dt>Programramens poäng för året</dt><dd>{planningMeasureText(data.totals.points)}</dd></div>}
        {selection.view === 'timplan' && selection.schoolform !== 'introduktionsprogram' && <div><dt>Planerade ramtimmar för året</dt><dd>{planningMeasureText(data.totals.annualHours)}</dd></div>}
        {selection.schoolform === 'introduktionsprogram' && <div><dt>Planerade timmar per vecka</dt><dd>{planningMeasureText(data.totals.weeklyHours)}</dd></div>}
        {selection.view === 'timplan' && <div><dt>Relaterade klasser</dt><dd>{planningMeasureText(data.totals.classCount)}</dd></div>}
      </dl>
      <p>En gemensam programram räknas en gång. Varje skolas egna timplan räknas separat. Klassantalet multiplicerar inte timmarna och måtten anger ingen bemanning.</p>
      {data.totals.hasForecast && <p>Urvalet innehåller prognosunderlag utan verifierad klasskoppling för det valda året.</p>}
      <div className="planning-overview-kulls" aria-label="Kullar i årsunderlaget">{(['new', 'continuing', 'unknown'] as const).map(relation =>
        <button key={relation} type="button" onClick={() => requestChange({ cohortRelation: relation })}>{planningRelationLabel[relation]} · {data.rows.filter(row => row.relation === relation).length} rader</button>)}</div>
      {(missingPlans > 0 || unknownHours > 0) && <p>{missingPlans > 0 && `${missingPlans} rader saknar plan. `}{unknownHours > 0 && `${unknownHours} rader har ofördelade eller okända timmar.`} Saknade värden visas som okända och räknas inte som noll.</p>}
      {data.count === 0 && <p>Inget underlag matchar valen. Rensa filtren eller välj ett annat läsår.</p>}
      <p><button type="button" onClick={onShowPlans}>Visa och öppna planerna</button></p>
    </>}
  </section>;
}
