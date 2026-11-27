'use client';

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, ChevronRight, ClipboardList, Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/server-client.ts';
import { isValidDate, schoolYearLabel, type PupilList } from '@/lib/pupil-register-model.ts';
import { STUDY_PLAN_CLASS_LIMIT } from '@/lib/study-plan-class-contract.ts';
import { parseStudyPlanIntakeDraftReceipt, parseStudyPlanIntakePreview, parseStudyPlanIntakeRead, type StudyPlanIntakeDraftReceipt, type StudyPlanIntakePreviewRow } from '@/lib/study-plan-intake-contract.ts';
import { ELEVMOTTAGANDE_LIMIT, type ElevmottagandeAllocation, type ElevmottagandeAllocationReason, type ElevmottagandeClass,
  type ElevmottagandePreview, type ElevmottagandeRead, type ElevmottagandeReceipt, type ElevmottagandeRosterRow } from '@/lib/elevmottagande.ts';
import { useHasUnsaved, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import type { RegisterSetup } from './school-year-picker';
import MfaStepUpNotice from './mfa-step-up';
import PupilCard from './pupil-card';
import { stockholmToday } from './pupil-dialogs';
import PupilIntakeTimetable from './pupil-intake-timetable';
import PupilIntakeSwedishBatch from './pupil-intake-swedish-batch';
import PupilSwedishSubject, { intakeStudyEndpoint, swedishFollowUp, swedishGroupDisagrees, swedishSubjectLabel,
  type IntakePupil, type IntakeStudyRead, type IntakeStudyRow } from './pupil-swedish-subject';

const endpoints = { roster: '/api/elevmottagande/lasa', classes: '/api/elevmottagande/fordela' };
const field = 'min-h-11 max-w-full rounded-md border border-input bg-background px-3 text-sm';
const tableGrid = 'grid gap-2 px-3 py-2 @min-[35rem]:grid-cols-[2rem_minmax(6rem,1.2fr)_minmax(5rem,0.8fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_auto] @min-[35rem]:items-center';
const nbsp = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeZone: 'UTC' });
const dayLabel = (value: string) => nbsp.format(new Date(`${value}T12:00:00Z`));
type IntakeFilter = 'all' | 'unplaced' | 'followup' | 'drafts';
type DraftPreviewRow = StudyPlanIntakePreviewRow;
type DraftPreview = { rows: DraftPreviewRow[]; previewToken: string };
type DraftReceipt = StudyPlanIntakeDraftReceipt;
type Action = { kind: 'class'; rows: ElevmottagandeRosterRow[] } | { kind: 'draft'; rows: ElevmottagandeRosterRow[] };
type ReceiptRequest = { kind: 'class' | 'draft'; commandId: string };
type Failure = { message: string; mfa?: boolean };

const classReasons: Record<ElevmottagandeAllocationReason, string> = {
  existing_membership: 'Eleven har redan en daterad klasstillhörighet.', placement_period: 'Datumet ligger utanför elevens skolplacering.',
  class_period: 'Klassen gäller inte från det föreslagna datumet.', class_education: 'Klass och studieväg behöver stämma överens.',
  source_owned: 'Klasstillhörigheten ändras i det ordinarie källflödet.', source_changed: 'Klasstillhörigheten har ändrats. Läs om uppgiften.', no_access: 'Det aktuella uppdraget tillåter inte ändringen.',
};
const draftLabels = { ready: 'Komplett utkast', needs_completion: 'Behöver kompletteras', existing: 'Studieplan finns redan', blocked: 'Underlaget behöver granskas' };
const planLabels = { none: 'Utkast saknas', needs_completion: 'Utkast behöver kompletteras', ready: 'Utkast sparat', current: 'Gällande' };

function dateInYear(year: number, today: string) {
  return today >= `${year}-07-01` && today <= `${year + 1}-06-30` ? today : `${year}-08-15`;
}
function classLabel(row: ElevmottagandeRosterRow) {
  if (!row.membership) return row.classification === 'historical' ? 'Tidigare klass' : 'Saknar klass';
  if (row.classification === 'booked') return `${row.membership.className} bokad från ${dayLabel(row.membership.startsOn)}`;
  return row.classification === 'historical' ? `${row.membership.className} · tidigare klass` : row.membership.className;
}
const refOf = ({ pupilId, placementId }: IntakePupil): IntakePupil => ({ pupilId, placementId });
const eligibleDraft = (row: DraftPreviewRow) => row.draftStatus === 'ready' || row.draftStatus === 'needs_completion';

export default function PupilIntakeWorkspace({ context, epoch, schoolYear, setup, onSessionLost, onRegister, onGroups, onLocationChanged }: {
  context: ActiveContext; epoch: number; schoolYear: number; setup: RegisterSetup; onSessionLost: () => void;
  onRegister: () => void; onGroups: (unitId: string, schoolYear: number) => void; onLocationChanged: () => void;
}) {
  const init = new URLSearchParams(window.location.search);
  const today = stockholmToday(setup.serverNow);
  const initialOn = init.get('datum');
  const [on, setOn] = useState(initialOn && isValidDate(initialOn) && initialOn >= `${schoolYear}-07-01` && initialOn <= `${schoolYear + 1}-06-30`
    ? initialOn : dateInYear(schoolYear, today));
  const [unitId, setUnitId] = useState(setup.scope.schools.find(school => school.id === init.get('skola'))?.id ?? setup.scope.schools[0]?.id ?? '');
  const [offeringId, setOfferingId] = useState<string | null>(init.get('kull'));
  const [roster, setRoster] = useState<ElevmottagandeRead | null>(null);
  const [study, setStudy] = useState<IntakeStudyRead | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<IntakeFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [showSelection, setShowSelection] = useState(false);
  const [panel, setPanel] = useState<ElevmottagandeRosterRow | null>(null);
  const [card, setCard] = useState<{ row: ElevmottagandeRosterRow; mode: 'class' | 'study' } | null>(null);
  const [timetable, setTimetable] = useState<ElevmottagandeClass | null>(null);
  const [swedishBatch, setSwedishBatch] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [classPreview, setClassPreview] = useState<ElevmottagandePreview | null>(null);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [classReceipt, setClassReceipt] = useState<ElevmottagandeReceipt | null>(null);
  const [draftReceipt, setDraftReceipt] = useState<DraftReceipt | null>(null);
  const [request, setRequest] = useState<ReceiptRequest | null>(null);
  const [retryReady, setRetryReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const dateId = useId();
  const searchId = useId();
  const blockedNavigation = useHasUnsaved('navigation-block:');
  const scopeKey = JSON.stringify([context.customerId, context.membershipId, context.assignmentId, epoch]);
  useUnsavedChanges(`navigation-block:intake:${scopeKey}`, !!request);
  const scope = { unitId, schoolYear, offeringId: roster?.offeringId ?? offeringId };
  const url = (nextOffering = scope.offeringId) => '/?' + new URLSearchParams({ vy: 'elevmottagande', lasar: String(schoolYear), skola: unitId, datum: on,
    ...(nextOffering ? { kull: nextOffering } : {}) }).toString();
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    if (!unitId || !isValidDate(on)) return;
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setLoadError(''); } });
    void api.post<ElevmottagandeRead>(endpoints.roster, { unitId, schoolYear, on, offeringId }, abort.signal).then(async value => {
      if (abort.signal.aborted) return;
      setRoster(value);
      const batches = Array.from({ length: Math.max(1, Math.ceil(value.rows.length / STUDY_PLAN_CLASS_LIMIT)) }, (_, index) =>
        value.rows.slice(index * STUDY_PLAN_CLASS_LIMIT, (index + 1) * STUDY_PLAN_CLASS_LIMIT).map(refOf));
      const data = await Promise.all(batches.map(async pupils => parseStudyPlanIntakeRead(await api.post<unknown>(
        intakeStudyEndpoint, { action: 'read', unitId, on, pupils }, abort.signal))));
      if (!abort.signal.aborted) setStudy({ canConfirmAssessment: data.every(part => part.canConfirmAssessment), rows: data.flatMap(part => part.rows) });
    }).catch(caught => {
      if (abort.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setRoster(null); setStudy(null); setSelected([]); setPanel(null); setCard(null); setAction(null); setLoadError('Kullens uppgifter kunde inte hämtas. Kontrollera skola, läsår och uppdrag.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [offeringId, on, onSessionLost, revision, schoolYear, unitId]);

  const location = url();
  useEffect(() => {
    if (!isValidDate(on)) return;
    window.history.replaceState(window.history.state, '', location);
    onLocationChanged();
  }, [location, on, onLocationChanged]);

  const studyRows = new Map(study?.rows.map(item => [item.placementId, item]));
  const rows = roster?.rows ?? [];
  const followUp = (row: ElevmottagandeRosterRow) => row.classification === 'historical' || swedishFollowUp(studyRows.get(row.placementId))
    || swedishGroupDisagrees(studyRows.get(row.placementId)) || studyRows.get(row.placementId)?.plan.status === 'needs_completion';
  const filters: { id: IntakeFilter; label: string; match: (row: ElevmottagandeRosterRow) => boolean }[] = [
    { id: 'all', label: 'Alla elever', match: () => true },
    { id: 'unplaced', label: 'Att fördela', match: row => row.classification === 'unplaced' },
    { id: 'followup', label: 'Att följa upp', match: followUp },
    { id: 'drafts', label: 'Utkast', match: row => ['ready', 'needs_completion'].includes(studyRows.get(row.placementId)?.plan.status ?? '') },
  ];
  const visible = rows.filter(row => filters.find(item => item.id === filter)?.match(row) && row.name.toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv')));
  const marked = rows.filter(row => selected.includes(row.placementId));
  const hiddenMarked = marked.filter(row => !visible.includes(row)).length;
  const selectedClasses = marked.filter(row => row.canAllocate);
  const visibleAllocatable = visible.filter(row => row.canAllocate);
  const activePanel = rows.find(row => row.placementId === panel?.placementId);
  const unitOptions = roster && { schools: setup.scope.schools, grades: [], statuses: [],
    classes: roster.classes.map(klass => ({ id: klass.id, name: klass.name, unitId, educationId: klass.offeringId })),
    educations: roster.offerings.map(offering => ({ ...offering, unitId, startYear: null })) };
  const switchScope = () => {
    setRoster(null); setStudy(null); setSelected([]); setPanel(null); setCard(null); setFilter('all'); setSearch('');
    setAction(null); setClassReceipt(null); setDraftReceipt(null); setRequest(null); setRetryReady(false); setFailure(null); setSwedishBatch(false);
  };
  const rememberFocus = (event: MouseEvent<HTMLElement>) => { returnFocus.current = event.currentTarget; };
  const restoreFocus = () => requestAnimationFrame(() => {
    if (returnFocus.current?.isConnected && !returnFocus.current.closest('[hidden]')) returnFocus.current.focus();
    else selectionHeading.current?.focus();
  });
  const backFromCard = () => { setCard(null); refresh(); restoreFocus(); };
  const openCard = (row: ElevmottagandeRosterRow, mode: 'class' | 'study') => {
    setAction(null); setClassReceipt(null); setDraftReceipt(null); setPanel(row); setCard({ row, mode });
  };
  const openAction = (next: Action) => {
    setClassPreview(null); setDraftPreview(null); setClassReceipt(null); setDraftReceipt(null); setFailure(null); setRequest(null); setRetryReady(false); setAction(next);
    if (next.kind === 'draft') void previewDrafts(next.rows);
  };
  function closeAction() {
    if (busy || request) return;
    setAction(null); setClassPreview(null); setDraftPreview(null); setClassReceipt(null); setDraftReceipt(null); setFailure(null); restoreFocus();
  }

  async function run(task: () => Promise<void>, onFailure = 'Begäran kunde inte slutföras. Läs om uppgifterna och försök igen.') {
    if (writing.current) return;
    writing.current = true; setBusy(true); setFailure(null);
    try { await task(); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (caught instanceof ApiError && caught.hasExplicitCode && caught.status < 500) {
        setRequest(null);
        setFailure({ message: caught.status === 409 ? 'Underlaget har ändrats. Läs om och granska på nytt.' : caught.message, mfa: caught.code === 'mfa_required' });
      } else setFailure({ message: onFailure });
    } finally { writing.current = false; setBusy(false); }
  }
  function previewClasses(input: ElevmottagandeAllocation[]) {
    return run(async () => setClassPreview(await api.post<ElevmottagandePreview>(endpoints.classes, { ...scope, on, action: 'preview', rows: input })));
  }
  function previewDrafts(input: ElevmottagandeRosterRow[]) {
    return run(async () => setDraftPreview(parseStudyPlanIntakePreview(await api.post<unknown>(intakeStudyEndpoint,
      { unitId, on, action: 'preview_drafts', pupils: input.map(refOf) }))));
  }
  function applyClassReceipt(value: ElevmottagandeReceipt) {
    setClassReceipt(value); setClassPreview(null); setRequest(null);
    setSelected(old => old.filter(id => !value.rows.some(row => row.placementId === id && row.status === 'saved')));
    refresh();
  }
  function applyDraftReceipt(value: DraftReceipt) { setDraftReceipt(value); setDraftPreview(null); setRequest(null); refresh(); }

  function saveClasses(again?: string) {
    if (!classPreview) return;
    const commandId = again ?? crypto.randomUUID();
    void run(async () => {
      setRequest({ kind: 'class', commandId }); setRetryReady(false);
      applyClassReceipt(await api.post<ElevmottagandeReceipt>(endpoints.classes, { ...scope, on, action: 'save', commandId, previewToken: classPreview.previewToken }));
    }, 'Sparandet kunde inte bekräftas. Kontrollera kvittot innan du fortsätter.');
  }
  function saveDrafts(again?: string) {
    if (!draftPreview || action?.kind !== 'draft') return;
    const commandId = again ?? crypto.randomUUID();
    void run(async () => {
      setRequest({ kind: 'draft', commandId }); setRetryReady(false);
      applyDraftReceipt(parseStudyPlanIntakeDraftReceipt(await api.post<unknown>(intakeStudyEndpoint, { unitId, on, action: 'save_drafts', pupils: action.rows.map(refOf),
        commandId, previewToken: draftPreview.previewToken })));
    }, 'Sparandet kunde inte bekräftas. Kontrollera kvittot innan du fortsätter.');
  }
  function recover(kind: ReceiptRequest['kind'], commandId?: string) {
    void run(async () => {
      if (kind === 'class') {
        const found = await api.post<ElevmottagandeReceipt | null>(endpoints.classes, { ...scope, action: 'status', ...(commandId ? { commandId } : {}) });
        if (found) { setAction({ kind: 'class', rows: [] }); applyClassReceipt(found); return; }
      } else {
        const found = await api.post<unknown>(intakeStudyEndpoint, { unitId, action: 'drafts_status', commandId });
        if (found) { applyDraftReceipt(parseStudyPlanIntakeDraftReceipt(found)); return; }
      }
      if (commandId) {
        setRetryReady(true); setFailure({ message: 'Inget kvitto hittades ännu. Du kan skicka samma begäran igen.' });
      } else setFailure({ message: 'Det finns inget sparat klasskvitto för urvalet.' });
    }, 'Sparbeskedet kunde inte hämtas. Försök igen.');
  }

  const openTimetable = (klass: ElevmottagandeClass) => { setTimetable(klass); };
  const realSchool = setup.scope.schools.find(school => school.id === unitId);
  const allocationRows = classReceipt?.rows.filter(row => row.status === 'saved') ?? [];
  const unsavedAllocations = classReceipt?.rows.filter(row => row.status !== 'saved') ?? [];
  const nextDraftRows = rows.filter(row => allocationRows.some(item => item.placementId === row.placementId));
  const receiptNames = new Map([...(action?.rows ?? []), ...rows].map(row => [row.placementId, row.name]));

  return <div className="admin-workspace protected-admin pupil-register">
    {card && <PupilCard key={card.row.placementId + card.mode} pupilId={card.row.pupilId} schoolYear={schoolYear} caseId={null}
      today={today} options={unitOptions} schools={setup.scope.schools} returnTo={location} epoch={epoch} accessFunction={context.function} scopeKind={context.scopeKind}
      initialStudyPlacementId={card.mode === 'study' ? card.row.placementId : undefined} initialClassPlacementId={card.mode === 'class' ? card.row.placementId : undefined}
      loadUnitOptions={async target => (await api.post<PupilList>('/api/elever/lista', { selection: { schoolYear, unitId: target,
        classId: null, educationId: null, grade: null, status: null, page: 1 }, search: '', caseId: null })).options}
      onBack={backFromCard} onChanged={refresh} onSessionLost={onSessionLost} />}
    <div hidden={!!card} className="min-w-0 space-y-5">
      <div className="grid gap-3 md:flex md:items-start md:justify-between">
        <div className="min-w-0"><p className="admin-kicker">ELEVER</p><h1 className="page-heading">Elevmottagande</h1>
          <p className="text-muted-foreground">Fördela elever i klasser och förbered deras första studieplaner.</p></div>
        <Button type="button" variant="ghost" onClick={onRegister}><ArrowLeft aria-hidden="true" />Till elevregistret</Button>
      </div>
      <section className="protected-card grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end" aria-label="Kull och datum">
        <label className="grid min-w-0 gap-1">Skola<select aria-label="Skola för elevmottagande" className={field} value={unitId} disabled={loading || busy}
          onChange={event => { switchScope(); setOfferingId(null); setUnitId(event.target.value); }}>
          {setup.scope.schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select></label>
        <label className="grid min-w-0 gap-1">Kull<select className={field} value={scope.offeringId ?? ''} disabled={loading || busy || !roster?.offerings.length}
          onChange={event => { switchScope(); setOfferingId(event.target.value || null); }}>
          {!roster?.offerings.length && <option value="">Ingen Gy25-kull</option>}
          {roster?.offerings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <div className="grid min-w-0 gap-1"><label htmlFor={dateId}>Visa klass för</label>
          <DatePicker id={dateId} min={`${schoolYear}-07-01`} max={`${schoolYear + 1}-06-30`} value={on} disabled={busy} onValueChange={value => {
            if (!isValidDate(value) || value < `${schoolYear}-07-01` || value > `${schoolYear + 1}-06-30`) return;
            switchScope(); setOn(value);
          }} />
        </div>
        <Button type="button" variant="outline" disabled={loading || busy} onClick={refresh}><RefreshCw aria-hidden="true" />Hämta aktuellt läge</Button>
      </section>
      {loadError && <p role="alert" className="validation-warning">{loadError}</p>}
      {loading && <output>Hämtar kullen…</output>}
      {roster && !roster.offeringId && !loading && <p className="empty-state">Det finns ingen Gy25-kull med skolplacerade elever för valt urval.</p>}
      {roster?.offeringId && <>
        <section className="protected-card space-y-2" aria-label="Klassöversikt">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-heading">Klasser och timplan</h2><span className="text-sm text-muted-foreground">{schoolYearLabel(schoolYear)}</span></div>
          {!roster.classes.length && <p className="text-sm">Kullen behöver klasser. Skapa dem under Programplaner.</p>}
          <ul className="divide-y divide-border">{roster.classes.map(klass => <li key={klass.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1"><strong>{klass.name}</strong><span className="ml-2 text-sm text-muted-foreground">{klass.count} elever</span>
              <div className="text-sm">{klass.timetable ? `${klass.timetable.name} · version ${klass.timetable.version} · Åk ${klass.timetable.columnId.slice(-1)}` : 'Timplan behöver kopplas'}</div></div>
            <Button variant="outline" type="button" onClick={event => { rememberFocus(event); openTimetable(klass); }}><Layers aria-hidden="true" />
              {klass.timetable ? `Visa timplan för ${klass.name}` : `Koppla timplan för ${klass.name}`}</Button>
          </li>)}</ul>
        </section>
        <div className={`grid min-w-0 items-start gap-4 ${activePanel ? 'xl:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)]' : ''}`}>
          <section className={`protected-card @container min-w-0 space-y-3 ${activePanel ? 'hidden xl:block' : ''}`} aria-labelledby="intake-list-title" aria-busy={loading}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="section-heading" id="intake-list-title" tabIndex={-1} ref={selectionHeading}>Elever i kullen</h2>
              <label htmlFor={searchId} className="w-full max-w-72"><span className="sr-only">Sök elev</span><Input id={searchId} type="search" placeholder="Sök elev" value={search} onChange={event => setSearch(event.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filtrera elevlistan">{filters.map(item => <Button key={item.id} type="button"
              variant={filter === item.id ? 'secondary' : 'ghost'} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} · {rows.filter(item.match).length}</Button>)}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {visible.length > 0 && <Button variant="outline" type="button" disabled={loading} onClick={() => {
                const visibleIds = visible.map(row => row.placementId);
                setSelected(previous => visibleIds.every(id => previous.includes(id)) ? previous.filter(id => !visibleIds.includes(id)) : [...new Set([...previous, ...visibleIds])]);
              }}>{visible.every(row => selected.includes(row.placementId)) ? 'Avmarkera synliga' : 'Markera synliga'}</Button>}
              <output>{visible.length} av {rows.length} elever{marked.length > 0 && ` · ${marked.length} markerade`}{hiddenMarked > 0 && ` · ${hiddenMarked} utanför filtret`}</output>
            </div>
            {marked.length > 0 ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary p-2">
              <Button type="button" variant="outline" aria-expanded={showSelection} onClick={() => setShowSelection(open => !open)}>{showSelection ? 'Dölj urval' : 'Visa urval'}</Button>
              {selectedClasses.length > 0 && <Button type="button" disabled={loading} onClick={event => { rememberFocus(event); openAction({ kind: 'class', rows: selectedClasses.slice(0, ELEVMOTTAGANDE_LIMIT) }); }}>
                Fördela {selectedClasses.length} elever</Button>}
              {marked.some(row => {
                const info = studyRows.get(row.placementId);
                return info && info.canSaveSwedish !== false && !info.swedish.subject && !info.currentPlanSubject;
              }) && <Button type="button" variant="outline" disabled={loading} onClick={event => { rememberFocus(event); setSwedishBatch(true); }}>Bekräfta svenskämne för flera</Button>}
              <Button type="button" variant="outline" disabled={loading || marked.length > STUDY_PLAN_CLASS_LIMIT} onClick={event => { rememberFocus(event); openAction({ kind: 'draft', rows: marked }); }}>Granska studieplansutkast ({marked.length})</Button>
              {marked.length > STUDY_PLAN_CLASS_LIMIT && <span>Välj högst {STUDY_PLAN_CLASS_LIMIT} elever för att granska utkast.</span>}
              <Button type="button" variant="ghost" onClick={() => setSelected([])}>Avmarkera</Button>
            </div> : visibleAllocatable.length > 0 && <Button type="button" disabled={loading} onClick={event => { rememberFocus(event);
              openAction({ kind: 'class', rows: visibleAllocatable.slice(0, ELEVMOTTAGANDE_LIMIT) }); }}>Fördela {visibleAllocatable.length} elever</Button>}
            {showSelection && marked.length > 0 && <ul aria-label="Markerade elever" className="flex flex-wrap gap-2">{marked.map(row => <li key={row.placementId}>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelected(list => list.filter(id => id !== row.placementId))}>{row.name} · ta bort</Button>
            </li>)}</ul>}
            <div className="rounded-lg border border-border" aria-label="Elevlista">
              <div aria-hidden="true" className={`${tableGrid} hidden bg-muted text-xs font-medium @min-[35rem]:grid`}><span></span><span>Elev</span><span>Klass</span><span>Svenskämne</span><span>Studieplan</span><span></span></div>
              <ul className="divide-y divide-border">{visible.map(row => {
                const info = studyRows.get(row.placementId);
                return <li className={tableGrid} key={row.placementId}>
                  <label className="flex min-h-8 min-w-8 items-center gap-2"><input type="checkbox" checked={selected.includes(row.placementId)} aria-label={`Markera ${row.name}`}
                    onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, row.placementId])] : previous.filter(id => id !== row.placementId))} />
                    <span className="text-sm @min-[35rem]:hidden">Markera elev</span></label>
                  <button type="button" className="flex min-h-11 min-w-0 flex-col justify-center text-left font-medium text-primary hover:underline" onClick={event => {
                    rememberFocus(event); setPanel(row);
                  }}>{row.name}<small className="text-xs font-normal text-muted-foreground">{row.educationName}</small></button>
                  <span className="text-sm">{classLabel(row)}</span><span className="text-sm">{swedishSubjectLabel(info)}</span>
                  <span className="text-sm">{info ? planLabels[info.plan.status] : '—'}{swedishGroupDisagrees(info) && <small className="block text-muted-foreground">Kontrollera gruppplaceringen</small>}</span>
                  <Button type="button" variant="ghost" size="icon" className="hidden @min-[35rem]:inline-flex" aria-label={`Öppna ${row.name}`} onClick={event => { rememberFocus(event); setPanel(row); }}><ChevronRight aria-hidden="true" /></Button>
                </li>;
              })}</ul>
              {!visible.length && !loading && <p className="p-4 text-sm text-muted-foreground">Inga elever matchar urvalet.</p>}
            </div>
            {roster.latestCommandId && <Button type="button" variant="ghost" disabled={loading || busy} onClick={event => { rememberFocus(event); recover('class'); }}>Visa senaste klasskvitto</Button>}
          </section>
          {activePanel && <IntakePupilPanel key={activePanel.placementId} row={activePanel} info={studyRows.get(activePanel.placementId)} study={study}
            unitId={unitId} on={on} returnTo={location} onSessionLost={onSessionLost}
            onClose={() => { setPanel(null); restoreFocus(); }}
            onSaved={item => setStudy(value => value && { ...value, rows: value.rows.map(row => row.placementId === item.placementId ? item : row) })}
            onAllocate={() => openAction({ kind: 'class', rows: [activePanel] })} onPreview={() => openAction({ kind: 'draft', rows: [activePanel] })}
            onOpenCard={mode => openCard(activePanel, mode)} onGroups={() => onGroups(unitId, schoolYear)} />}
        </div>
      </>}
      {!action && failure && <p role="alert" className="validation-warning">{failure.message}</p>}
    </div>

    {timetable && <PupilIntakeTimetable key={timetable.id} klass={timetable} choices={roster?.timetableChoices ?? []} scopeKey={scopeKey} returnTo={location}
      schoolYear={schoolYear} onSessionLost={onSessionLost} onClose={() => { if (blockedNavigation) return; setTimetable(null); refresh(); restoreFocus(); }} />}
    {swedishBatch && <PupilIntakeSwedishBatch unitId={unitId} on={on} today={today}
      rows={marked.map(row => ({ name: row.name, startsOn: row.startsOn, endsOn: row.endsOn, study: studyRows.get(row.placementId) }))}
      returnTo={location} onSessionLost={onSessionLost} onSaved={refresh} onClose={() => { setSwedishBatch(false); restoreFocus(); }} />}

    {action && <Dialog open onOpenChange={open => { if (!open) closeAction(); }}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-3xl" showCloseButton={false}>
        <DialogTitle>{classReceipt || draftReceipt ? 'Sparbesked' : action.kind === 'class' ? 'Fördela i klasser' : 'Granska studieplansutkast'}</DialogTitle>
        <DialogDescription>{realSchool?.name} · {schoolYearLabel(schoolYear)}</DialogDescription>
        {failure?.mfa ? <MfaStepUpNotice message="Verifiera med engångskod för att spara." returnTo={location} /> : failure && <p role="alert" className="validation-warning">{failure.message}</p>}
        {busy && <output>{request ? 'Kontrollerar sparandet…' : 'Hämtar underlaget…'}</output>}
        {request && !busy && <Button variant="outline" type="button" onClick={() => recover(request.kind, request.commandId)}>Kontrollera sparandet</Button>}
        {request && retryReady && !busy && <Button type="button" onClick={() => request.kind === 'class' ? saveClasses(request.commandId) : saveDrafts(request.commandId)}>Skicka samma begäran igen</Button>}
        {action.kind === 'class' && action.rows.length > 0 && <div hidden={!!classPreview || !!classReceipt}><AllocationEditor rows={action.rows} classes={roster?.classes ?? []}
          busy={busy || !!request} on={on} schoolYear={schoolYear} onPreview={previewClasses} /></div>}
        {classPreview && <>
          <ul className="rounded-md border border-border p-3 text-sm">{classPreview.classes.map(item => <li key={`${item.id}:${item.on}`}>
            {item.name} · {dayLabel(item.on)} · {item.before} → {item.after} elever</li>)}</ul>
          <AllocationResults items={classPreview.rows} onOpen={id => { const row = rows.find(item => item.placementId === id); if (row) openCard(row, 'class'); }} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" type="button" disabled={busy || !!request} onClick={() => setClassPreview(null)}>Ändra fördelning</Button>
            <Button type="button" disabled={busy || !!request || !classPreview.rows.some(row => row.status === 'ready')} onClick={() => saveClasses()}>
              Spara {classPreview.rows.filter(row => row.status === 'ready').length} klasstillhörigheter</Button>
          </div>
        </>}
        {classReceipt && <>
          <output>{allocationRows.length} sparade · {unsavedAllocations.length} att följa upp</output>
          <AllocationResults items={classReceipt.rows} onOpen={id => { const row = rows.find(item => item.placementId === id); if (row) openCard(row, 'class'); }} />
          <div className="flex flex-wrap gap-2">
            {nextDraftRows.length > 0 && nextDraftRows.length <= STUDY_PLAN_CLASS_LIMIT && <Button type="button" disabled={loading} onClick={() => openAction({ kind: 'draft', rows: nextDraftRows })}>
              Granska {nextDraftRows.length} utkast för sparade elever</Button>}
            {unsavedAllocations.length > 0 && <Button type="button" variant="outline" onClick={() => {
              const row = rows.find(item => item.placementId === unsavedAllocations[0].placementId); if (row) openCard(row, 'class');
            }}>Fortsätt med {unsavedAllocations.length} kvar</Button>}
          </div>
        </>}
        {draftPreview && <>
          <p className="text-sm">{draftPreview.rows.filter(row => row.draftStatus === 'ready').length} kompletta · {draftPreview.rows.filter(row => row.draftStatus === 'needs_completion').length} behöver kompletteras · {draftPreview.rows.filter(row => row.draftStatus === 'existing').length} befintliga</p>
          <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">{draftPreview.rows.map(row => <li key={row.placementId} className="flex flex-wrap justify-between gap-2 p-2">
            <strong className="font-medium">{row.displayName || receiptNames.get(row.placementId)}</strong><span>{draftLabels[row.draftStatus]}</span></li>)}</ul>
          <p className="text-sm text-muted-foreground">Ofullständiga utkast kan kompletteras på elevkortet. Befintliga planer öppnas från elevlistan.</p>
          <div><Button type="button" disabled={busy || !!request || !draftPreview.rows.some(eligibleDraft)} onClick={() => saveDrafts()}>Spara {draftPreview.rows.filter(eligibleDraft).length} utkast</Button></div>
        </>}
        {draftReceipt && <>
          <output>{draftReceipt.rows.filter(row => row.outcome === 'saved').length} utkast sparade</output>
          <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">{draftReceipt.rows.map(row => <li key={row.placementId} className="flex flex-wrap items-center justify-between gap-2 p-2">
            <div>{receiptNames.get(row.placementId)}<small className="block text-muted-foreground">{row.outcome === 'saved' ? 'Utkast sparat' : row.outcome === 'existing' ? 'Befintlig plan' : 'Underlaget behöver granskas'}</small></div>
            {(row.outcome === 'saved' || row.outcome === 'existing') && <Button type="button" variant="outline" onClick={() => {
              const pupil = rows.find(item => item.placementId === row.placementId); if (pupil) openCard(pupil, 'study');
            }}>Öppna studieplanen</Button>}
          </li>)}</ul>
        </>}
        <div><Button type="button" variant="ghost" disabled={busy || !!request} onClick={closeAction}>Tillbaka till elevlistan</Button></div>
      </DialogContent>
    </Dialog>}
  </div>;
}

function IntakePupilPanel({ row, info, study, unitId, on, returnTo, onSessionLost, onClose, onSaved, onAllocate, onPreview, onOpenCard, onGroups }: {
  row: ElevmottagandeRosterRow; info: IntakeStudyRow | undefined; study: IntakeStudyRead | null; unitId: string; on: string; returnTo: string;
  onSessionLost: () => void; onClose: () => void; onSaved: (row: IntakeStudyRow) => void; onAllocate: () => void; onPreview: () => void;
  onOpenCard: (mode: 'class' | 'study') => void; onGroups: () => void;
}) {
  const details = useRef<HTMLHeadingElement>(null);
  useEffect(() => { details.current?.focus({ preventScroll: true }); if (window.matchMedia('(max-width: 1023px)').matches) details.current?.scrollIntoView({ block: 'nearest' }); }, []);
  const existing = info?.plan.status && info.plan.status !== 'none';
  return <aside className="protected-card min-w-0 space-y-4" aria-label={`Uppgifter för ${row.name}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="section-heading" tabIndex={-1} ref={details}>{row.name}</h2><Button variant="ghost" type="button" onClick={onClose}>Stäng</Button>
    </div>
    <dl className="space-y-2 text-sm">
      <div><dt className="text-muted-foreground">Studieväg</dt><dd>{row.educationName}</dd></div>
      <div><dt className="text-muted-foreground">Skolplacering från</dt><dd>{dayLabel(row.startsOn)}</dd></div>
      <div><dt className="text-muted-foreground">Klass</dt><dd>{classLabel(row)}</dd></div>
    </dl>
    <Button type="button" variant="outline" onClick={row.canAllocate ? onAllocate : () => onOpenCard('class')}>
      {row.canAllocate ? 'Placera i klass' : 'Öppna klassuppgiften på elevkortet'}</Button>
    {!!info && study && <PupilSwedishSubject {...refOf(row)} unitId={unitId} on={on > row.startsOn ? on : row.startsOn}
      initial={{ rows: [info], canConfirmAssessment: study.canConfirmAssessment }} returnTo={returnTo} onSessionLost={onSessionLost} onSaved={onSaved} />}
    {swedishGroupDisagrees(info) && <Button variant="outline" type="button" onClick={onGroups}>Öppna undervisningsgrupper</Button>}
    <div className="space-y-2"><h3 className="section-heading">Studieplan</h3>
      <p className="text-sm">{info ? planLabels[info.plan.status] : '—'}</p>
      <Button type="button" variant="outline" onClick={existing ? () => onOpenCard('study') : onPreview}><ClipboardList aria-hidden="true" />
        {existing ? 'Öppna studieplanen' : 'Granska studieplansutkast'}</Button>
    </div>
  </aside>;
}

function AllocationEditor({ rows, classes, busy, on, schoolYear, onPreview }: {
  rows: ElevmottagandeRosterRow[]; classes: ElevmottagandeClass[]; busy: boolean; on: string; schoolYear: number;
  onPreview: (rows: ElevmottagandeAllocation[]) => void;
}) {
  const [commonClass, setCommonClass] = useState(classes.length === 1 ? classes[0].id : '');
  const dateField = useId();
  const [commonDate, setCommonDate] = useState(rows.length === 1 && rows[0].startsOn >= `${schoolYear}-07-01` ? rows[0].startsOn : on);
  const [proposed, setProposed] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, { classId?: string; startsOn?: string }>>({});
  const preferred = rows.map(row => ({ placementId: row.placementId, classId: overrides[row.placementId]?.classId ?? proposed[row.placementId] ?? commonClass,
    startsOn: overrides[row.placementId]?.startsOn ?? (commonDate >= row.startsOn ? commonDate : row.startsOn) }));
  const update = (id: string, patch: { classId?: string; startsOn?: string }) => setOverrides(old => ({ ...old, [id]: { ...old[id], ...patch } }));
  const options = <><option value="">Välj klass</option>{classes.map(klass => <option value={klass.id} key={klass.id}>{klass.name}</option>)}</>;

  return <form className="min-w-0 space-y-3" onSubmit={event => { event.preventDefault(); onPreview(preferred); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1">Gemensam klass<select className={field} value={commonClass} disabled={busy} onChange={event => { setProposed({}); setCommonClass(event.target.value); }}>{options}</select></label>
      <div className="grid gap-1"><label htmlFor={dateField}>Klasstillhörighet från</label><DatePicker id={dateField} value={commonDate} onValueChange={setCommonDate} disabled={busy} required /></div>
    </div>
    {classes.length > 1 && <Button variant="outline" type="button" disabled={busy} onClick={() => {
      const counts = new Map(classes.map(klass => [klass.id, klass.count]));
      const next: typeof proposed = {};
      for (const row of rows) {
        const explicit = overrides[row.placementId]?.classId;
        if (explicit && counts.has(explicit)) counts.set(explicit, counts.get(explicit)! + 1);
      }
      for (const row of rows) {
        if (overrides[row.placementId]?.classId) continue;
        const klass = classes.reduce((left, right) => counts.get(left.id)! <= counts.get(right.id)! ? left : right);
        counts.set(klass.id, counts.get(klass.id)! + 1);
        next[row.placementId] = klass.id;
      }
      setCommonClass(''); setProposed(next);
    }}>Föreslå jämn fördelning</Button>}
    <details open={rows.length < 5 || undefined} className="rounded-md border border-border p-2">
      <summary>Elever och undantag ({rows.length})</summary>
      <ul className="mt-2 max-h-64 divide-y divide-border overflow-auto">{rows.map((row, index) => <li className="grid gap-2 py-2 sm:grid-cols-3 sm:items-center" key={row.placementId}>
        <span className="font-medium">{row.name}</span>
        <select className={field} aria-label={`Klass för ${row.name}`} disabled={busy} value={preferred[index].classId} onChange={event => update(row.placementId, { classId: event.target.value })}>{options}</select>
        <DatePicker aria-label={`Klasstillhörighet från för ${row.name}`} value={preferred[index].startsOn} min={row.startsOn} disabled={busy}
          onValueChange={value => update(row.placementId, { startsOn: value })} />
      </li>)}</ul>
    </details>
    <Button type="submit" disabled={busy || !classes.length || preferred.some(row => !row.classId || !isValidDate(row.startsOn))}>Granska placeringar</Button>
  </form>;
}

function AllocationResults({ items, onOpen }: { items: Array<ElevmottagandePreview['rows'][number] | ElevmottagandeReceipt['rows'][number]>; onOpen: (id: string) => void }) {
  return <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">{items.map(row => <li key={row.placementId} className="flex flex-wrap items-center justify-between gap-2 p-2">
    <div className="min-w-0"><strong>{row.name ?? 'Elevuppgiften är inte tillgänglig'}</strong>
      <p className="text-sm">{row.className} · {dayLabel(row.startsOn)} · {row.status === 'saved' ? 'Sparad' : row.status === 'ready' ? 'Kan sparas' : 'Behöver granskas'}</p>
      {row.reason && <p className="text-sm text-muted-foreground">{classReasons[row.reason]}</p>}
      {row.membership && row.status !== 'saved' && <p className="text-sm text-muted-foreground">Aktuell uppgift · {row.membership.className} från {dayLabel(row.membership.startsOn)}</p>}
    </div>
    {!!row.membership && row.status !== 'saved' && <Button variant="outline" type="button" onClick={() => onOpen(row.placementId)}>Öppna ordinarie klassflöde</Button>}
  </li>)}</ul>;
}
