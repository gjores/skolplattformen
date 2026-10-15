'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanningOverview, parsePlanningSelection, type PlanningOverview, planningAnnualMetrics, type PlanningRow, type PlanningSelection } from '@/lib/planning-year-contract.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { usePlanningContext } from './planning-context';
import { PlanningFilterControls, planningMeasureText, planningRelationLabel, planningStatusLabel, planningRowKey } from './protected-plan-list';

type Props = { onSecurityFailure: (error: unknown) => boolean;
  onChooseCollection: (view: PlanningSelection['view'], schoolform: PlanningSelection['schoolform']) => void;
  onShowPlans: () => void; onOpen: (row: PlanningRow) => void };
type State = { key: string; data: PlanningOverview | null; loading: boolean; error: string | null };
export default function ProtectedPlanningOverview({ onSecurityFailure, onChooseCollection, onShowPlans, onOpen }: Props) {
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
    { label: 'Programplaner', view: 'programplan', schoolform: 'gymnasium' },
    { label: 'Gymnasiets timplaner', view: 'timplan', schoolform: 'gymnasium' },
    { label: 'Grundskolans timplaner', view: 'timplan', schoolform: 'grundskola' },
    { label: 'Introduktionsprogrammets veckoramar', view: 'timplan', schoolform: 'introduktionsprogram' },
  ];
  const missingPlans = data?.rows.filter(row => !row.plan).length ?? 0;
  const grouped = new Map<string, PlanningRow[]>();
  for(const row of data?.rows??[]){const groupKey=JSON.stringify([row.unitId,row.offeringId,row.relativeYear,row.application?.columnId??null]);const rows=grouped.get(groupKey)??[];rows.push(row);grouped.set(groupKey,rows);}
  const unknownHours = data?.rows.filter(row => row.diagnostics.includes('missing-hours')).length ?? 0;
  return <section className="planning-overview plan-list" aria-label="Läsårsöverblick" aria-busy={busy}>
    <header className="planning-overview-heading">
      <div><h1>Läsårsöverblick {planningYearLabel(selection.schoolYear)}</h1>
        <p>Se årets kullar och deras timfördelningar. Öppna rätt plan för att arbeta med ämnen och klasser.</p></div>
      <button type="button" onClick={onShowPlans}>Visa och öppna planerna</button>
    </header>
    <div className="planning-overview-kulls" aria-label="Välj planeringsunderlag">{collections.filter(c => setup.units.some(unit => c.view === 'programplan' ? unit.canRead.programplan : unit.canRead[c.schoolform]))
      .map(c => <button key={`${c.view}-${c.schoolform}`} type="button" aria-pressed={selection.view === c.view && selection.schoolform === c.schoolform}
        onClick={() => onChooseCollection(c.view, c.schoolform)}>{c.label}</button>)}</div>
    <details className="planning-overview-filters"><summary>Sök och filtrera årsunderlaget</summary><PlanningFilterControls/></details>
    {busy && <output>Läser hela årsunderlaget…</output>}
    {visible?.error && <p role="alert">{visible.error} <button type="button" onClick={() => setRetry(n => n + 1)}>Läs om överblicken</button></p>}
    {data && <><p>{grouped.size} {grouped.size===1?'utbildningsgrupp':'utbildningsgrupper'} · {data.count} {data.count===1?'planrad':'planrader'} för valt läsår.</p>
      <div className="planning-year-groups">{[...grouped].map(([groupKey,rows])=>{const first=rows[0];const grade=first.relativeYear??first.application?.columnId?.match(/^ak([1-9])$/)?.[1];const frames=[...new Map(rows.filter(r=>r.source).map(r=>[r.source!.planId,r])).values()];return <section className="planning-year-group" key={groupKey} aria-label={`${first.educationName}, ${first.cohort}, ${grade?`årskurs ${grade}`:'årskurs okänd'}, ${first.schoolName}`}>
        <header><h2>{first.educationName}</h2><p>{first.schoolName} · {first.cohort} · {grade?`Åk ${grade}`:first.schoolform==='introduktionsprogram'?'Veckoram':'Årskurs okänd'}</p>{selection.view==='timplan'&&frames.map(frame=><p key={frame.source!.planId}>Programram v{frame.source!.version}: {planningMeasureText(planningAnnualMetrics(frame,selection.schoolYear).points)} poäng för året</p>)}</header>
        <ul className="planning-year-variants">{rows.map(row=>{const metrics=planningAnnualMetrics(row,selection.schoolYear);return <li key={planningRowKey(row)}>
          <div><h3>{row.series?.name??(selection.view==='programplan'?'Programplan':'Timplan')}</h3><p>{row.plan?`Version ${row.plan.version} · ${planningStatusLabel[row.plan.status]}`:'Plan saknas'}</p>
          {selection.view==='timplan'&&<p>{metrics.classCount.complete?`${metrics.classCount.value} kopplade klasser`:'Klasskopplingar okända'}{row.underlag==='forecast'?' · Prognos utan verifierad klasskoppling':row.underlag==='class-bound'?' · Verifierad användning för året':''}</p>}</div>
          <div className="planning-variant-measure"><strong>{planningMeasureText(selection.view==='programplan'?metrics.points:metrics.hours)}</strong><span>{selection.view==='programplan'?'poäng för året':metrics.measure==='hours-per-week'?'timmar per vecka':'timmar för året'}</span></div>
          <button type="button" onClick={()=>row.plan?onOpen(row):onShowPlans()} aria-label={`${row.plan?'Öppna':'Hitta'} ${row.series?.name??(selection.view==='programplan'?'programplan':'timplan')}, ${first.educationName}, ${row.plan?`version ${row.plan.version}`:'plan saknas'}, ${first.schoolName}`}>{row.plan?selection.view==='programplan'?'Öppna programplan':'Öppna timplan':'Hitta plan'}</button>
          <details className="planning-variant-details"><summary>Källa och underlag</summary><p>{planningRelationLabel[row.relation]}{row.start.startedOn?` · Utbildningsstart ${row.start.startedOn}`:' · Utbildningsstart okänd'}</p>
            {row.source&&<p>Bygger på programplan version {row.source.version}.</p>}{row.diagnostics.length>0&&<p>Underlaget är ofullständigt. Öppna planen för att kontrollera uppgifterna.</p>}

          </details>
        </li>;})}</ul></section>;})}</div>
      <details className="planning-overview-totals"><summary>Summor och förklaringar</summary><dl className="planning-overview-metrics">
        {data.totals.points && <div><dt>Programramens poäng för året</dt><dd>{planningMeasureText(data.totals.points)}</dd></div>}
        {selection.view === 'timplan' && selection.schoolform !== 'introduktionsprogram' && <div><dt>Summa i de visade timplanerna</dt><dd>{planningMeasureText(data.totals.annualHours)}</dd></div>}
        {selection.schoolform === 'introduktionsprogram' && <div><dt>Summa i de visade timplanerna</dt><dd>{planningMeasureText(data.totals.weeklyHours)}</dd></div>}
        {selection.view === 'timplan' && <div><dt>Relaterade klasser</dt><dd>{planningMeasureText(data.totals.classCount)}</dd></div>}
      </dl>
      <p>Poäng och planerade timmar är olika mått. Summorna visar inte bemanning.</p>
      <details className="planning-overview-explanation"><summary>Så räknas överblicken</summary>
        <p>En gemensam programram räknas en gång. Varje visad timplansversion räknas separat. Klassantalet multiplicerar inte timmarna. Saknade värden visas som okända och räknas inte som noll.</p>
      </details>
      {data.totals.hasForecast && <p>Urvalet innehåller prognosunderlag utan verifierad klasskoppling för det valda året.</p>}
      </details><div className="planning-overview-kulls" aria-label="Kullar i årsunderlaget">{(['new', 'continuing', 'unknown'] as const).map(relation => {
        const count = data.rows.filter(row => row.relation === relation).length;
        return <button key={relation} type="button" aria-pressed={selection.cohortRelation === relation}
          onClick={() => requestChange({ cohortRelation: selection.cohortRelation === relation ? 'relevant' : relation })}>{planningRelationLabel[relation]} · {count} {count === 1 ? 'träff' : 'träffar'}</button>;
      })}</div>
      {(missingPlans > 0 || unknownHours > 0) && <p>{missingPlans > 0 && `${missingPlans} rader saknar plan. `}{unknownHours > 0 && `${unknownHours} rader har ofördelade eller okända timmar.`} Saknade värden visas som okända och räknas inte som noll.</p>}
      {data.count === 0 && <p>Inget underlag matchar valen. Rensa filtren eller välj ett annat läsår.</p>}
    </>}
  </section>;
}
