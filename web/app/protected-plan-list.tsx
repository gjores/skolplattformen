'use client';

import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, ListFilter, Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanningList, parsePlanningSelection, planningAnnualMetrics, type PlanningList, type PlanningMeasure, type PlanningRow, type PlanningSelection, type PlanningSchoolTimplan } from '@/lib/planning-year-contract.ts';
import { usePlanningContext } from './planning-context';
import './protected-plan-list.css';
import { usePlanDecisions, decisionNextActorLabel, decisionStageLabel } from './plan-decision-context';

export const planningStatusLabel = { utkast: 'Utkast', forslag: 'Inväntar beslut', atersand: 'Tillbaka för rättning', faststalld: 'Fastställd', ersatt: 'Ersatt' };
export const planningRelationLabel = { new: 'Ny kull', continuing: 'Fortsättande kull', future: 'Kommande kull', finished: 'Avslutad kull', unknown: 'Start saknas' };
export function planningMeasureText(value: PlanningMeasure | null): string {
  if (!value) return 'Ej tillämpligt';
  return value.complete ? value.value!.toLocaleString('sv-SE') : `Okänt · ${value.known.toLocaleString('sv-SE')} fördelat`;
}
export function planningRowKey(row: PlanningRow): string {
  return JSON.stringify([row.unitId, row.offeringId, row.plan?.id ?? null, row.application?.columnId ?? null]);
}
export function PlanningCollectionHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="page-heading planning-collection-heading">
    <div><h1>{title}<span className="heading-dot" aria-hidden="true">.</span></h1><p>{description}</p></div>
    {actions}
  </header>;
}

function hasPlanFilters(selection: PlanningSelection) {
  return !!selection.query || selection.grade !== null || selection.status !== 'all'
    || selection.cohortRelation !== 'relevant' || selection.archive !== 'active';
}

export function PlanningFilterControls({ disabled = false }: { disabled?: boolean }) {
  const { selection, requestChange, filtersOpen, setFiltersOpen } = usePlanningContext(), id = useId();
  const context = selection ? JSON.stringify([selection.schoolYear, selection.unitId, selection.view, selection.schoolform]) : '';
  const [draft, setDraft] = useState({ context, accepted: selection?.query ?? '', text: selection?.query ?? '' });
  const change = useRef(requestChange);
  useLayoutEffect(() => { change.current = requestChange; }, [requestChange]);
  if (selection && (draft.context !== context || draft.accepted !== selection.query)) setDraft({ context, accepted: selection.query, text: selection.query });
  useEffect(() => {
    if (!selection || disabled || draft.text.trim() === selection.query) return;
    const timer = setTimeout(() => change.current({ query: draft.text.trim() }), 250);
    return () => clearTimeout(timer);
  }, [draft.text, selection, disabled, context]);
  if (!selection) return null;
  const patch = (value: Partial<PlanningSelection>) => requestChange(value);
  const activeFilters = [selection.grade !== null && `Åk ${selection.grade}`, selection.status !== 'all' && (selection.view === 'programplan' && selection.status === 'utkast' ? 'Ej fastställda' : planningStatusLabel[selection.status]),
    selection.cohortRelation !== 'relevant' && (selection.cohortRelation === 'all' ? 'Alla kullar' : planningRelationLabel[selection.cohortRelation]),
    selection.archive !== 'active' && (selection.archive === 'archived' ? 'Arkiverade utbildningar' : 'Även arkiverade utbildningar')].filter(Boolean);
  const resetFilters = () => { setDraft({ context, accepted: '', text: '' }); patch({ query: '', status: 'all', cohortRelation: 'relevant', archive: 'active', grade: null }); };
  return <div className="plan-list-filters" aria-label="Filtrera planeringsunderlaget">
    <label className="plan-list-search" htmlFor={`${id}-query`}>Sök utbildning<span className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input className="h-11 bg-background pl-9" id={`${id}-query`} type="search" maxLength={200} value={draft.text} disabled={disabled}
        placeholder="Namn, kod eller program" onChange={e => setDraft({ context, accepted: selection.query, text: e.target.value })}/>
    </span></label>
    {selection.view === 'timplan' && selection.schoolform !== 'gymnasium' && <label htmlFor={`${id}-form`}>Skolform<NativeSelect className="w-full [&_select]:min-h-11" id={`${id}-form`} value={selection.schoolform} disabled={disabled}
      onChange={e => patch({ schoolform: e.target.value as PlanningSelection['schoolform'] })}>
      <option value="grundskola">Grundskola</option><option value="introduktionsprogram">Introduktionsprogram</option>
    </NativeSelect></label>}
    <div className="plan-list-filter-actions">
      <Button type="button" variant="outline" className="min-h-11" aria-expanded={filtersOpen} aria-controls={`${id}-extra`} onClick={() => setFiltersOpen(!filtersOpen)}>
        <ListFilter size={16} aria-hidden="true" /> {filtersOpen ? 'Dölj filter' : 'Fler filter'}{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
      </Button>
      {(activeFilters.length > 0 || draft.text) && <Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={resetFilters}>Rensa filter</Button>}
    </div>
    <div id={`${id}-extra`} className="plan-list-extra-filters" hidden={!filtersOpen}>
    {selection.schoolform !== 'introduktionsprogram' && <label htmlFor={`${id}-grade`}>Årskurs<NativeSelect className="w-full [&_select]:min-h-11" id={`${id}-grade`} value={selection.grade ?? ''} disabled={disabled}
      onChange={e => patch({ grade: e.target.value ? Number(e.target.value) : null })}>
      <option value="">Alla årskurser</option>{Array.from({ length: selection.schoolform === 'gymnasium' ? 3 : 9 }, (_, i) => i + 1)
        .map(grade => <option key={grade} value={grade}>Åk {grade}</option>)}
    </NativeSelect></label>}
    <label htmlFor={`${id}-status`}>Planstatus<NativeSelect className="w-full [&_select]:min-h-11" id={`${id}-status`} value={selection.status} disabled={disabled}
      onChange={e => patch({ status: e.target.value as PlanningSelection['status'] })}>
      <option value="all">Alla planstatusar</option>{Object.entries(planningStatusLabel)
        .map(([key, label]) => <option key={key} value={key}>{selection.view === 'programplan' && key === 'utkast' ? 'Ej fastställda' : label}</option>)}
    </NativeSelect></label>
    <label htmlFor={`${id}-relation`}>Elevkullar<NativeSelect className="w-full [&_select]:min-h-11" id={`${id}-relation`} value={selection.cohortRelation} disabled={disabled}
      onChange={e => patch({ cohortRelation: e.target.value as PlanningSelection['cohortRelation'] })}>
      <option value="relevant">Nya, fortsättande och okänd start</option><option value="all">Alla kullar</option>
      {Object.entries(planningRelationLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </NativeSelect></label>
    <label htmlFor={`${id}-archive`}>Utbildning<NativeSelect className="w-full [&_select]:min-h-11" id={`${id}-archive`} value={selection.archive} disabled={disabled}
      onChange={e => patch({ archive: e.target.value as PlanningSelection['archive'] })}>
      <option value="active">Aktiva utbildningar</option><option value="archived">Arkiverade utbildningar</option><option value="all">Aktiva och arkiverade</option>
    </NativeSelect></label>
    </div>
    <p className="plan-filter-summary" aria-live="polite">{selection.archive === 'active' ? 'Aktiva utbildningar' : selection.archive === 'archived' ? 'Arkiverade utbildningar' : 'Aktiva och arkiverade utbildningar'} · {selection.cohortRelation === 'relevant' ? 'nya och fortsättande kullar samt okänd start' : selection.cohortRelation === 'all' ? 'alla kullar' : planningRelationLabel[selection.cohortRelation].toLocaleLowerCase('sv')}
      {selection.grade !== null && ` · åk ${selection.grade}`}{selection.status !== 'all' && ` · ${(selection.view === 'programplan' && selection.status === 'utkast' ? 'Ej fastställda' : planningStatusLabel[selection.status]).toLocaleLowerCase('sv')}`}</p>
  </div>;
}

type Props = { disabled?: boolean; onSecurityFailure: (error: unknown) => boolean; onOpen: (row: PlanningRow) => void;
  unavailableReason?: (row: PlanningRow) => string | null;
  actions?: (row: PlanningRow) => ReactNode; showFilters?: boolean;
  collection?: boolean; onShowProgramplans?: () => void;
  programRows?: { canCreateTimplan: boolean; onTimplan: (row: PlanningRow, target?: PlanningSchoolTimplan) => void } };
type Result = { key: string; data: PlanningList | null; error: string | null; notice: string | null; loading: boolean };
export default function ProtectedPlanList({ disabled = false, onSecurityFailure, onOpen, actions, unavailableReason, showFilters = true, collection = false, onShowProgramplans, programRows }: Props) {
  const { setup, selection, requestChange } = usePlanningContext();
  const { inbox } = usePlanDecisions();
  const decisionFor = (kind: 'programplan' | 'timplan', id: string) => inbox?.items.find(item => item.kind === kind && item.planId === id);
  const decisionText = (kind: 'programplan' | 'timplan', plan: NonNullable<PlanningRow['plan']>) => {
    if (plan.decisionStage) {
      const actor = plan.decisionStage === 'submitted' ? 'huvudman' : plan.decisionStage === 'returned' ? 'rektor' : null;
      return `${decisionStageLabel[plan.decisionStage]}${actor ? ` · Nästa steg hos ${decisionNextActorLabel(kind, actor)}` : ''}`;
    }
    const decision = decisionFor(kind, plan.id);
    if (decision) return `${decisionStageLabel[decision.stage]}${decision.nextActor ? ` · Nästa steg hos ${decisionNextActorLabel(kind, decision.nextActor)}` : ''}`;
    return kind === 'programplan' && plan.status === 'utkast' ? 'Ej fastställd · Öppna för beslutsstatus' : planningStatusLabel[plan.status];
  };
  const selectionKey = selection ? JSON.stringify(selection) : '', scopeKey = setup ? JSON.stringify(setup) : '';
  const selected = useMemo(() => selectionKey ? parsePlanningSelection(JSON.parse(selectionKey)) : null, [selectionKey]);
  const key = `${scopeKey}|${selectionKey}`, latest = useRef({ key, onSecurityFailure, requestChange });
  useLayoutEffect(() => { latest.current = { key, onSecurityFailure, requestChange }; }, [key, onSecurityFailure, requestChange]);
  const [expanded, setExpanded] = useState<{ key: string; rows: string[] }>({ key: '', rows: [] });
  const [result, setResult] = useState<Result>({ key: '', data: null, error: null, notice: null, loading: true }), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!setup || !selected) return;
    const controller = new AbortController(); let cancelled = false;
    const current = () => !cancelled && !controller.signal.aborted && latest.current.key === key;
    queueMicrotask(() => { if (current()) setResult({ key, data: null, error: null, notice: null, loading: true }); });
    void api.post('/api/planering/lista', selected, controller.signal).then(raw => {
      const data = parsePlanningList(raw, selected, setup);
      if (current()) setResult({ key, data, error: null, notice: null, loading: false });
    }).catch(error => {
      if (!current() || error instanceof DOMException && error.name === 'AbortError') return;
      if (latest.current.onSecurityFailure(error)) return;
      if (error instanceof ApiError && error.status === 409 && selected.selectionRevision !== null) {
        setResult({ key, data: null, error: 'Underlaget ändrades. Läs om första sidan med samma filter.', notice: null, loading: false });
        latest.current.requestChange({ page: 1, selectionRevision: null }); return;
      }
      setResult({ key, data: null, error: 'Planerna kunde inte läsas. Försök läsa om listan.', notice: null, loading: false });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [key, selected, setup, retry]);
  const visible = result.key === key ? result : null, data = visible?.data ?? null, busy = !visible || visible.loading;
  if (!selected || !setup) return <output>Läser planeringsval…</output>;
  const locked = disabled || busy;
  const sort = (column: PlanningSelection['sort'], label: string) => {
    const active = selected.sort === column;
    const Icon = active ? selected.direction === 'asc' ? ArrowUp : ArrowDown : ArrowDownUp;
    return <th scope="col" aria-sort={active ? selected.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <Button type="button" variant="ghost" className="h-auto min-h-11 justify-start whitespace-normal px-0 font-semibold" disabled={disabled}
        onClick={() => requestChange({ sort: column, direction: active && selected.direction === 'asc' ? 'desc' : 'asc' })}>
        {label}<Icon size={14} aria-hidden="true" />
      </Button>
    </th>;
  };
  const filtered = hasPlanFilters(selected);
  const gymTimplan = selected.view === 'timplan' && selected.schoolform === 'gymnasium';
  return <section className={`plan-list${programRows ? ' plan-list-program' : ''}${collection ? ' plan-list-collection' : ''}`} aria-label={selected.view === 'programplan' ? 'Alla programplaner' : 'Alla timplaner'} aria-busy={busy}>
    {showFilters && <PlanningFilterControls disabled={disabled}/>}
    {visible?.notice && <output>{visible.notice}</output>}
    {visible?.error && <div className="plan-list-feedback" role="alert"><p>{visible.error}</p><Button className="min-h-11" variant="outline" type="button" onClick={() => { if (selected.selectionRevision !== null) requestChange({ page: 1, selectionRevision: null }); setRetry(n => n + 1); }}>Läs om listan</Button></div>}
    {busy && <output className="plan-list-feedback">Läser planeringsunderlaget…</output>}
    {data && <><div className="plan-list-results">
      <output className="plan-list-count">{data.count} {data.count === 1 ? 'träff' : 'träffar'}{data.count > data.rows.length ? ` · visar ${(selected.page - 1) * data.pageSize + 1}–${(selected.page - 1) * data.pageSize + data.rows.length}` : ''}</output>
      {data.count > 0 && <div className="plan-list-mobile-sort">
      <label>Sortera efter<NativeSelect className="w-full [&_select]:min-h-11" value={selected.sort} disabled={disabled} onChange={event => requestChange({ sort: event.target.value as PlanningSelection['sort'] })}>
        <option value="name">Utbildning</option><option value="school">Skola</option><option value="cohort">Elevkull</option><option value="grade">Årskurs</option><option value="version">Planversion</option><option value="status">Planstatus</option>
        {selected.schoolform === 'gymnasium' && <option value="points">Årets poäng</option>}
        {selected.view === 'timplan' && <option value="hours">{selected.schoolform === 'introduktionsprogram' ? 'Timmar per vecka' : 'Årets timmar'}</option>}
      </NativeSelect></label>
      <Button type="button" variant="outline" className="min-h-11 min-w-11" disabled={disabled} onClick={() => requestChange({ direction: selected.direction === 'asc' ? 'desc' : 'asc' })} aria-label={selected.direction === 'asc' ? 'Byt till fallande sortering' : 'Byt till stigande sortering'}>
        {selected.direction === 'asc' ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
      </Button>
    </div>}</div>
      {data.count === 0 ? <div className="empty-state plan-list-empty">
        <h2>{selected.view === 'timplan' ? 'Inga timplaner i urvalet' : 'Inga utbildningar i urvalet'}</h2>
        <p>{filtered ? selected.view === 'timplan' ? 'Inga skapade timplaner matchar valen. Rensa filtren eller välj ett annat läsår.' : 'Inget underlag matchar valen. Rensa filtren eller välj ett annat läsår.'
          : gymTimplan ? 'Öppna Programplaner och välj Skapa timplan på utbildningens rad.' : 'Välj en annan skola eller ett annat läsår.'}</p>
        {!filtered && gymTimplan && onShowProgramplans && <Button type="button" variant="outline" className="min-h-11" onClick={onShowProgramplans}>Öppna Programplaner<ChevronRight size={16} aria-hidden="true" /></Button>}
      </div> :
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Rullytan hanterar sidledspilar när den själv har fokus.
        <section className="plan-list-scroll" aria-label="Planeringstabell, kan rullas i sidled"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla hela lästabellen, samma mönster som timmatrisen.
        tabIndex={0} onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 80 : -80 });
        }}>
        <table><caption className="sr-only">{selected.view === 'programplan' ? 'Programplaner' : 'Timplaner'} för valt läsår</caption>
          <thead>{programRows ? <tr>{sort('name', 'Utbildning')}{sort('school', 'Skola och elevkull')}{sort('version', 'Programplan')}<th scope="col">Skolans timplan</th><th scope="col">Nästa steg</th></tr> : <tr>{sort('name', 'Utbildning')}{sort('school', 'Skola')}{selected.schoolform === 'gymnasium' && <th scope="col">Program och inriktning</th>}{sort('cohort', 'Elevkull')}{sort('grade', 'Årets årskurs')}{sort('version', 'Planversion')}{sort('status', 'Planstatus')}
            {selected.schoolform === 'gymnasium' && sort('points', 'Årets poäng')}{selected.view === 'timplan' ? sort('hours', selected.schoolform === 'introduktionsprogram' ? 'Timmar per vecka' : 'Årets timmar') : <th scope="col">Underlag</th>}
            <th scope="col">Åtgärder</th></tr>}</thead>
          <tbody>{data.rows.map(row => {
            const metrics = planningAnnualMetrics(row, selected.schoolYear), details = row.searchDetails;
            const grade = row.relativeYear ?? (row.application?.columnId?.match(/^ak([1-9])$/)?.[1] ?? null);
            const rowKey = planningRowKey(row), isExpanded = expanded.key === key && expanded.rows.includes(rowKey);
            if (programRows) {
              const timplans = row.schoolTimplans ?? (row.schoolTimplan ? [row.schoolTimplan] : []);
              const known = row.schoolTimplans !== undefined || row.schoolTimplan !== undefined;
              const canStart = known && timplans.length === 0 && row.plan !== null && !row.archived && programRows.canCreateTimplan;
              const timplanFirst = canStart && row.plan?.status === 'faststalld';
              const startTimplan = canStart && <Button type="button" variant="outline" className="min-h-11" disabled={locked}
                aria-label={`Skapa timplan för ${row.educationName}, ${row.schoolName}, programplan version ${row.plan?.version ?? 'saknas'}`}
                onClick={() => programRows.onTimplan(row)}>Skapa timplan</Button>;
              return <tr key={rowKey}>
                <th scope="row"><strong>{row.educationName}</strong>
                  {details?.programName && <small>{details.programName}</small>}
                  {details?.orientationName && <small>{details.orientationName}</small>}
                  {details?.localCode && <small>{details.localCode}</small>}
                  {row.archived && <small>Arkiverad utbildning</small>}
                  <details className="program-row-details"><summary>Visa detaljer</summary>
                    <p>{grade === null ? planningRelationLabel[row.relation] : `Åk ${grade} · ${planningRelationLabel[row.relation]}`}</p>
                    {row.start.startedOn && <p>Start {row.start.startedOn}</p>}
                    <p>Årets poäng: {planningMeasureText(metrics.points)}</p>
                    {actions?.(row)}
                  </details>
                </th>
                <td data-label="Skola och elevkull"><strong>{row.schoolName}</strong><small>{row.cohort}</small></td>
                <td data-label="Programplan">{row.plan ? <><span className={`status-badge${row.plan.status === 'faststalld' ? ' success' : ''}`}>{decisionText('programplan', row.plan)}</span><small>Version {row.plan.version}</small></> : <span className="status-badge">Inte skapad</span>}</td>
                <td data-label="Skolans timplan">{timplans.length ? <ul className="program-row-timplans">{timplans.map(timplan=><li key={timplan.id}>
                  <strong>{timplan.series?.name??'Timplan'}</strong><small>{planningStatusLabel[timplan.status]} · Version {timplan.version}</small>
                  <small>Bygger på programplan v{timplan.sourceVersion}{row.plan && timplan.sourcePlanId!==row.plan.id?' (annan version)':''}</small>
                  <Button type="button" variant="ghost" className="min-h-11 justify-start px-0" disabled={locked} aria-label={timplan.series?`Öppna ${timplan.series.name}, version ${timplan.version}, ${row.educationName}, ${row.schoolName}`:`Öppna timplan för ${row.educationName}, ${row.schoolName}, programplan version ${row.plan?.version??'saknas'}`} onClick={()=>programRows.onTimplan(row,timplan)}>Öppna timplan<ChevronRight size={16} aria-hidden="true" /></Button>
                </li>)}</ul>:<><span className="status-badge">{known?'Ingen timplan':'Status ej tillgänglig'}</span>
                  {known&&!row.plan&&<small>Skapa programplanen först.</small>}{known&&row.plan&&!programRows.canCreateTimplan&&<small>Rektor eller skoladministratör skapar timplanen.</small>}</>}</td>
                <td className="plan-list-actions program-row-actions">
                  {timplanFirst && startTimplan}
                  <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => onOpen(row)}
                    aria-label={`${row.plan && decisionFor('programplan', row.plan.id)?.task === 'review' ? 'Granska och besluta om' : 'Öppna'} ${row.educationName}, ${row.schoolName}, ${row.plan ? `version ${row.plan.version}` : 'saknad plan'}`}>
                    {row.plan ? decisionFor('programplan', row.plan.id)?.task === 'review' ? 'Granska och besluta' : 'Öppna programplan' : 'Öppna utbildning'}</Button>
                  {!timplanFirst && startTimplan}
                </td>
              </tr>;
            }
            return <tr key={rowKey} data-expanded={isExpanded}><th scope="row">{row.series?<><strong>{row.series.name}</strong><small>{row.educationName}</small></>:row.educationName}<small>{details?.localCode ?? 'Lokal kod saknas'}{row.archived ? ' · Arkiverad' : ''}</small></th>
              <td data-label="Skola" className="plan-list-school">{row.schoolName}</td>{row.schoolform === 'gymnasium' && <td data-label="Program och inriktning" className="plan-list-secondary">{details?.programName ?? details?.programCode ?? 'Programuppgift saknas'}<small>{details?.orientationName ?? details?.orientationCode ?? 'Inriktning saknas'}</small></td>}
              <td data-label="Elevkull">{row.cohort}<small>{planningRelationLabel[row.relation]}{row.start.startedOn ? ` · Start ${row.start.startedOn}` : ''}</small></td>
              <td data-label="Årskurs">{grade === null ? row.schoolform === 'introduktionsprogram' ? 'Veckoram' : 'Okänd årskurs' : `Åk ${grade}`}</td>
              <td data-label="Planversion" className="plan-list-secondary">{row.plan ? `Version ${row.plan.version}` : 'Saknas'}{selected.view === 'timplan' && row.schoolform === 'gymnasium' && <small>{row.source ? `Bygger på programplan · version ${row.source.version}` : 'Programplan som underlag saknas'}</small>}</td>
              <td data-label="Status"><span className={`status-badge${row.plan?.status === 'faststalld' ? ' success' : ''}`}>{row.plan ? decisionText(selected.view === 'programplan' ? 'programplan' : 'timplan', row.plan) : 'Plan saknas'}</span>{selected.view==='timplan'&&<small>{metrics.classCount.complete?`${metrics.classCount.value} kopplade klasser`:'Klasskopplingar okända'}{row.underlag==='forecast'?' · Prognos':''}</small>}</td>
              {selected.schoolform === 'gymnasium' && <td data-label="Årets poäng" className="plan-list-secondary">{planningMeasureText(metrics.points)}</td>}
              <td data-label={selected.view === 'timplan' ? selected.schoolform === 'introduktionsprogram' ? 'Timmar per vecka' : 'Årets timmar' : 'Underlag'} className={selected.view === 'timplan' ? 'plan-list-secondary plan-list-hours' : 'plan-list-secondary'}>{selected.view === 'timplan' ? planningMeasureText(metrics.hours) : row.underlag === 'missing' ? 'Programplan saknas' : row.underlag === 'forecast' ? 'Prognos' : 'Programram'}</td>
              <td className="plan-list-actions"><Button type="button" variant="outline" className="min-h-11" disabled={locked || !!unavailableReason?.(row)} onClick={() => onOpen(row)} aria-label={`Öppna ${row.series?`${row.series.name}, `:''}${row.educationName}, ${row.schoolName}, ${row.plan ? `version ${row.plan.version}` : 'saknad plan'}`}>
                {row.plan ? selected.view === 'timplan' ? 'Öppna timplan' : 'Öppna' : 'Visa underlag'}</Button>{unavailableReason?.(row) && <small>{unavailableReason(row)}</small>}{actions?.(row)}
                <Button type="button" variant="ghost" className="plan-list-details-toggle min-h-11" aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Dölj' : 'Visa'} detaljer för ${row.educationName}, ${row.schoolName}`}
                  onClick={() => setExpanded(previous => { const rows = previous.key === key ? previous.rows : []; return { key, rows: rows.includes(rowKey) ? rows.filter(value => value !== rowKey) : [...rows, rowKey] }; })}>
                  {isExpanded ? 'Dölj detaljer' : 'Detaljer'}</Button></td></tr>;
          })}</tbody></table></section>}
      {(data.count > data.pageSize || selected.page > 1) && <nav className="plan-list-pages" aria-label="Planeringstabellens sidor">
        <Button type="button" variant="outline" className="min-h-11" disabled={locked || selected.page <= 1}
          onClick={() => requestChange({ page: selected.page - 1, selectionRevision: data.selectionRevision })}><ChevronLeft size={16} aria-hidden="true" />Föregående sida</Button>
        <span>Sida {selected.page} av {Math.max(1, Math.ceil(data.count / data.pageSize))}</span>
        <Button type="button" variant="outline" className="min-h-11" disabled={locked || selected.page * data.pageSize >= data.count}
          onClick={() => requestChange({ page: selected.page + 1, selectionRevision: data.selectionRevision })}>Nästa sida<ChevronRight size={16} aria-hidden="true" /></Button>
      </nav>}
    </>}
  </section>;
}
