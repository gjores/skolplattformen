'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply, parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION,
  type StudyPlanCalendarYear, type StudyPlanCommand, type StudyPlanCurrentReply, type StudyPlanDateEdit, type StudyPlanReadRequest, type StudyPlanReceipt, type StudyPlanScope,
} from '@/lib/study-plan-contract.ts';
import {
  studyAttemptStatus, studyDecisionEffective, studyPlanContentIssues,
  type PlannedStudyDate, type StudyPlanIssue, type StudyPlanLevel, type StudyPlanSnapshot,
} from '@/lib/study-plan-model.ts';
import MfaStepUpNotice from './mfa-step-up';
import PupilStudyPlanImpact from './pupil-study-plan-impact';
import {
  parseStudyPlanPeriodEdit, studyPlanPeriodValues, StudyPlanActualForm, StudyPlanDecisionForm, StudyPlanEditor,
  StudyPlanPeriodFields, type StudyPlanPeriodEdit,
} from './pupil-study-plan-fields';

type Props = {
  unitId: string;
  pupilId: string;
  placementId: string;
  placementStartsOn: string;
  placementEndsOn: string | null;
  today: string;
  initialOn: string;
  schoolName: string;
  educationName: string;
  returnTo: string;
  onSessionLost: () => void;
  onOpenClassChange?: () => void;
};

type ActionInput = StudyPlanCommand extends infer Command
  ? Command extends StudyPlanCommand ? Pick<Command, 'action' | 'payload'> : never
  : never;

const progressLabels = {
  unknown: 'Tidigare uppgift okänd', upcoming: 'Kommande', started: 'Påbörjad', completed: 'Avslutad', interrupted: 'Avbruten',
};
const decisionLabels = {
  extended: 'Utökat program', adapted: 'Individuellt anpassat program', reduced: 'Reducerat program',
  eligibility_opt_out: 'Behörighetsbortval', replaced: 'Ersatt nivå',
};
const issueLabels: Record<string, string> = {
  unsupported_path: 'Studieplansflödet gäller nationella Gy25-program.',
  catalog_missing: 'Det saknas en katalogutgåva för elevens studieväg.',
  catalog_unavailable: 'Katalogutgåvan behöver göras tillgänglig.',
  catalog_program_missing: 'Programmet saknas i katalogutgåvan.',
  orientation_not_found: 'Inriktningen behöver kontrolleras i skolans utbildning.',
  orientation_required: 'Inriktning behöver registreras på skolans utbildning.',
  apprenticeship_unknown: 'Ange om eleven går lärlingsutbildning.',
  compulsory_school_subjects_unknown: 'Ange om grundskoleämnen ingår.',
  distance_teaching_incomplete: 'Ange fjärrundervisningens omfattning där den ingår.',
  choice_unresolved: 'Valet behöver kompletteras och bekräftas.',
  choice_scope_incomplete: 'Kontrollera valets poäng och nivåer.',
  levels_incomplete: 'Studienivåerna eller gymnasiearbetet behöver kompletteras.',
  source_choice_needs_review: 'Elevvalet behöver granskas i skolans underlag.',
  additional_level_decision_needed: 'Registrera det befintliga beslutet och spara utkastet igen.',
  examination_source_needs_review: 'Examensformen för elevkullen behöver granskas.',
};

function plannedDate(value: NonNullable<PlannedStudyDate>) {
  return value.kind === 'day' ? value.date : value.term + ' ' + (value.term === 'HT' ? value.schoolYear : value.schoolYear + 1);
}

function periodLabel(start: PlannedStudyDate, end: PlannedStudyDate) {
  if (!start) return end ? 'Till ' + plannedDate(end) : 'Uppgift saknas';
  if (!end) return 'Från ' + plannedDate(start);
  const from = plannedDate(start), to = plannedDate(end);
  return from === to ? from : from + ' – ' + to;
}

const factSources = { school_record: 'Skolans registrering', previous_school: 'Tidigare skola' } as const;

// Safari needs explicit table semantics when the same native table stacks its rows in a narrow container.
const studyTableRoles = {
  table: { role: 'table' }, group: { role: 'rowgroup' }, row: { role: 'row' },
  column: { role: 'columnheader' }, header: { role: 'rowheader' }, cell: { role: 'cell' },
} as const;

function IssueList({ issues, snapshot, onEdit }: { issues: StudyPlanIssue[]; snapshot: StudyPlanSnapshot | null; onEdit?: (field: string) => void }) {
  if (!issues.length) return null;
  const unique = [...new Map(issues.map(issue => [issue.code + '/' + issue.field, issue])).values()];
  const choices = new Map(snapshot?.content.choices.map(choice => [choice.id, choice.label]));
  return <div className="rounded-lg border border-border bg-muted/40 p-3">
    <output className="font-medium">Uppgifter att komplettera</output>
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {unique.map(issue => <li key={issue.code + '/' + issue.field}>
        {choices.has(issue.field) && <span className="font-medium">{choices.get(issue.field)}. </span>}
        {issueLabels[issue.code] ?? 'Kontrollera uppgiften i studieplanens underlag.'}
      </li>)}
    </ul>
    {onEdit && <Button variant="outline" className="mt-2" onClick={() => onEdit(unique[0].field)}>Komplettera utkastet</Button>}
  </div>;
}

function LevelTable({ snapshot, calendar, suggestions, on, today, canEdit, disabled, onPending, onSave, onActual }: {
  snapshot: StudyPlanSnapshot; calendar: readonly StudyPlanCalendarYear[]; suggestions: readonly StudyPlanDateEdit[];
  on: string; today: string; canEdit: boolean; disabled: boolean;
  onPending: (pending: boolean) => void;
  onSave: (dates: StudyPlanDateEdit[]) => void;
  onActual: (payload: Extract<StudyPlanCommand, { action: 'record_actual' }>['payload']) => void;
}) {
  const id = useId();
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(() => new Set());
  const [details, setDetails] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Record<string, StudyPlanPeriodEdit>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { levels, decisions } = snapshot.content;
  const rows = levels.flatMap(level => level.attempts.map((attempt, index) => ({
    level, attempt, key: level.id + '-' + attempt.id,
    label: level.label + (level.attempts.length > 1 ? ` · Försök ${index + 1}` : ''),
    status: studyAttemptStatus(attempt, on, decisions, level.id),
    decisions: decisions.filter(decision => decision.levelIds.includes(level.id) || decision.replacementLevelIds.includes(level.id)),
  })));
  const pending = Object.keys(periods).length;
  const followUp = rows.filter(row => row.status.needsFollowUp).length;
  const suggested = new Map(suggestions.flatMap(suggestion => {
    const key = suggestion.levelId + '-' + suggestion.attemptId;
    return periods[key] ? [] : [[key, suggestion] as const];
  }));

  function save() {
    const dates: StudyPlanDateEdit[] = [];
    setFormError(null);
    for (const { key, level, attempt, label } of rows) {
      const value = periods[key];
      if (!value) continue;
      try {
        dates.push({ levelId: level.id, attemptId: attempt.id, ...parseStudyPlanPeriodEdit(value) });
      } catch {
        setFormError(`Kontrollera perioden för ${label}. Välj ett giltigt datum eller en termin. Starten ska ligga före eller på slutdagen.`);
        setFollowUpOnly(false);
        requestAnimationFrame(() => document.getElementById(id + '-' + key)?.querySelector('select')?.focus());
        return;
      }
    }
    if (dates.length) onSave(dates);
  }

  function cancelPeriods() {
    setOpenPeriods(new Set());
    setPeriods({});
    setFormError(null);
    onPending(false);
  }

  function applySuggestions(entries: [string, StudyPlanDateEdit][]) {
    if (!entries.length) return;
    setPeriods(previous => ({
      ...previous,
      ...Object.fromEntries(entries.map(([key, value]) => [key, studyPlanPeriodValues(value)])),
    }));
    setFormError(null);
    setFollowUpOnly(false);
    onPending(true);
  }

  return <section className="study-plan-levels @container/study-plan grid min-w-0 gap-3" aria-labelledby={id + '-heading'}>
    <h3 className="font-semibold" id={id + '-heading'}>Ämnesnivåer och gymnasiearbete</h3>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={followUpOnly ? 'outline' : 'secondary'} aria-pressed={!followUpOnly} onClick={() => setFollowUpOnly(false)}>Alla nivåer</Button>
      <Button variant={followUpOnly ? 'secondary' : 'outline'} aria-pressed={followUpOnly} onClick={() => setFollowUpOnly(true)}>
        Behöver följas upp <span className="tabular-nums" aria-hidden="true">{followUp}</span>
      </Button>
      {canEdit && suggested.size > 1 && <Button variant="outline" disabled={disabled}
        onClick={() => applySuggestions([...suggested])}>Använd datumförslag</Button>}
    </div>
    <Table className="study-plan-table" {...studyTableRoles.table} aria-labelledby={id + '-heading'}>
      <TableHeader {...studyTableRoles.group}>
        <TableRow {...studyTableRoles.row}>
          {['Ämnesnivå', 'Planerad period', 'Faktisk start', 'Faktiskt slut', 'Status', 'Detaljer'].map(label =>
            <TableHead key={label} {...studyTableRoles.column} scope="col" className="whitespace-normal">{label}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody {...studyTableRoles.group}>
        {rows.filter(row => !followUpOnly || row.status.needsFollowUp).map(({ level, attempt, key, label, status, decisions: relevant }) => {
          const editId = id + '-' + key;
          const rowDetails = editId + '-details';
          const editing = canEdit && openPeriods.has(key);
          const actualStart = attempt.actual.start && attempt.actual.start.on <= on ? attempt.actual.start : null;
          const actualEnd = attempt.actual.end && attempt.actual.end.on <= on ? attempt.actual.end : null;
          const pendingPeriod = periods[key] && !openPeriods.has(key) ? parseStudyPlanPeriodEdit(periods[key]) : null;
          const period = pendingPeriod ? periodLabel(pendingPeriod.plannedStart, pendingPeriod.plannedEnd)
            : periodLabel(attempt.plannedStart, attempt.plannedEnd);
          const suggestion = suggested.get(key);
          return <Fragment key={key}>
            <TableRow {...studyTableRoles.row} className="study-plan-level align-top">
              <th scope="row" {...studyTableRoles.header} className="px-2 py-3 text-left font-medium wrap-anywhere">
                {label}
                <span className="block text-xs font-normal text-muted-foreground">{level.itemCode} · {level.points} p</span>
              </th>
              <TableCell {...studyTableRoles.cell} data-label="Planerad period" className="study-plan-period whitespace-normal align-top">
                {editing ? <div id={editId}><StudyPlanPeriodFields value={periods[key] ?? studyPlanPeriodValues(attempt)}
                  calendar={calendar} disabled={disabled} onChange={value => {
                    setPeriods(previous => ({ ...previous, [key]: value }));
                    setFormError(null);
                    onPending(true);
                  }} /></div>
                  : canEdit
                    ? <Button variant="ghost" aria-label={'Ändra planerad period för ' + label}
                      className="h-auto min-h-[var(--control-height)] max-w-full justify-start whitespace-normal px-1.5 text-left"
                      disabled={disabled} onClick={() => {
                        setOpenPeriods(previous => new Set(previous).add(key));
                        requestAnimationFrame(() => document.getElementById(editId)?.querySelector('select')?.focus());
                      }}><Pencil aria-hidden="true" />{period}</Button>
                    : period}
                {pendingPeriod && <small className="block text-muted-foreground">Osparat</small>}
                {canEdit && suggestion && <div className="grid justify-items-start">
                  <small className="text-muted-foreground">{periodLabel(suggestion.plannedStart, suggestion.plannedEnd)}</small>
                  <Button variant="ghost" className="h-auto min-h-[var(--control-height)] whitespace-normal px-1.5 text-primary" disabled={disabled}
                    onClick={() => applySuggestions([[key, suggestion]])}>Använd gruppens datum</Button>
                </div>}
              </TableCell>
              <TableCell {...studyTableRoles.cell} data-label="Faktisk start" className="whitespace-normal tabular-nums align-top">
                {actualStart?.on ?? '—'}
              </TableCell>
              <TableCell {...studyTableRoles.cell} data-label="Faktiskt slut" className="whitespace-normal tabular-nums align-top">
                {actualEnd?.on ?? '—'}
              </TableCell>
              <TableCell {...studyTableRoles.cell} data-label="Status" className="whitespace-normal align-top">
                <div className="flex flex-wrap items-start gap-1">
                  <span className={'status-badge whitespace-normal' + (!status.reduced && status.progress === 'completed' ? ' success' : '')}>
                    {status.reduced ? 'Reducerad' : progressLabels[status.progress]}
                  </span>
                  {status.needsFollowUp && <span className="status-badge warning whitespace-normal">Behöver följas upp</span>}
                  {relevant.filter(decision => decision.levelIds.includes(level.id) && studyDecisionEffective(decision, on)
                    && (decision.kind === 'eligibility_opt_out' || decision.kind === 'replaced')).map(decision =>
                    <span key={decision.id} className="status-badge whitespace-normal">{decisionLabels[decision.kind]}</span>)}
                </div>
              </TableCell>
              <TableCell {...studyTableRoles.cell} className="study-plan-details-toggle whitespace-normal align-top">
                <Button variant="ghost" className="min-h-[var(--control-height)]" aria-expanded={details === key} aria-controls={rowDetails}
                  aria-label={(details === key ? 'Dölj' : 'Visa') + ' detaljer för ' + label}
                  onClick={() => setDetails(previous => previous === key ? null : key)}>
                  <ChevronDown className={details === key ? 'rotate-180' : undefined} aria-hidden="true" />
                  <span className="study-plan-details-label">Detaljer</span>
                </Button>
              </TableCell>
            </TableRow>
            {details === key && <TableRow className="study-plan-row-details bg-muted/25" {...studyTableRoles.row} id={rowDetails}>
              <TableCell colSpan={6} {...studyTableRoles.cell} className="whitespace-normal">
                <div className="grid min-w-0 gap-2 px-1">
                  {status.reduced && <p>Studieförlopp · {progressLabels[status.progress]}</p>}
                  <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <div><dt className="font-medium">Källa för faktisk start</dt><dd>{actualStart ? factSources[actualStart.source.kind] : 'Uppgift saknas'}</dd></div>
                    <div><dt className="font-medium">Källa för faktiskt slut</dt><dd>{actualEnd ? factSources[actualEnd.source.kind] : 'Uppgift saknas'}</dd></div>
                  </dl>
                  {relevant.length > 0 && <ul className="list-disc space-y-1 pl-5">
                    {relevant.map(decision => <li key={decision.id}>{decisionLabels[decision.kind]} · Beslut {decision.decidedOn} · Gäller från {decision.effectiveOn}</li>)}
                  </ul>}
                  {canEdit && <details>
                    <summary className="flex min-h-[var(--control-height)] cursor-pointer items-center font-medium text-primary">Rätta eller registrera studiehändelse</summary>
                    <StudyPlanActualForm level={level} attempt={attempt} today={today} disabled={disabled || pending > 0} onRecord={onActual} />
                  </details>}
                </div>
              </TableCell>
            </TableRow>}
          </Fragment>;
        })}
      </TableBody>
    </Table>
    {followUpOnly && followUp === 0 && <p className="empty-state">Inga nivåer behöver följas upp.</p>}
    {formError && <p role="alert" className="validation-warning">{formError}</p>}
    {(openPeriods.size > 0 || pending > 0) && <div className="study-plan-save flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
      <Button disabled={disabled || pending === 0} onClick={save}>Spara ändringar</Button>
      <Button variant="outline" aria-label="Avbryt datumändringar" disabled={disabled} onClick={cancelPeriods}>Avbryt</Button>
      {pending > 0 && <output className="text-sm text-muted-foreground">{pending === 1 ? '1 rad har ändrats' : `${pending} rader har ändrats`}</output>}
    </div>}
  </section>;
}

function Decisions({ snapshot, on, canShowReference }: { snapshot: StudyPlanSnapshot; on: string; canShowReference: boolean }) {
  const { decisions, levels } = snapshot.content;
  const names = new Map<string, StudyPlanLevel>(levels.map(level => [level.id, level]));
  if (!decisions.length) return null;
  return <section className="grid gap-2">
    <h3 className="font-semibold">Registrerade beslut</h3>
    <ul className="grid list-none gap-2 p-0">
      {decisions.map(decision => <li key={decision.id} className="min-w-0 rounded-lg border border-border p-3 text-sm">
        <p className="font-medium">{decisionLabels[decision.kind]}</p>
        <p>Beslut den {decision.decidedOn} · Gäller från {decision.effectiveOn}{decision.endsOn && ' till ' + decision.endsOn}</p>
        {decision.scopePoints && <p>Omfattning {decision.scopePoints} poäng</p>}
        {decision.levelIds.length > 0 ? <p>Berör {decision.levelIds.map(id => names.get(id)?.label).filter(Boolean).join(', ')}</p>
          : decision.kind === 'reduced' && <p>Beslutet anger omfattningen för studieplanen.</p>}
        {decision.replacementLevelIds.length > 0 && <p>Ersättningsnivåer {decision.replacementLevelIds.map(id => names.get(id)?.label).filter(Boolean).join(', ')}</p>}
        {studyDecisionEffective(decision, on) && <span className="status-badge mt-1">Gäller på visat datum</span>}
        {canShowReference && <details className="mt-1">
          <summary className="min-h-[var(--control-height)] cursor-pointer py-2 text-primary">Visa beslutsreferens</summary>
          <p className="break-all">{decision.reference.id}</p>
        </details>}
      </li>)}
    </ul>
  </section>;
}

export default function PupilStudyPlan(props: Props) {
  const { unitId, pupilId, placementId, today, initialOn, onSessionLost } = props;
  const scope: StudyPlanScope = { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId, pupilId, placementId };
  const [read, setRead] = useState<StudyPlanCurrentReply | null>(null);
  const [selected, setSelected] = useState<'current' | 'draft'>('current');
  const [history, setHistory] = useState<{ version: StudyPlanSnapshot | null; on: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOn, setHistoryOn] = useState(initialOn);
  const [editor, setEditor] = useState(false);
  const [periodsPending, setPeriodsPending] = useState(false);
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<StudyPlanIssue[]>([]);
  const [uncertain, setUncertain] = useState<{ command: StudyPlanCommand; checked: boolean } | null>(null);
  const nextRequest = useRef<AbortController | null>(null);
  const changing = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const editTitle = useRef<HTMLHeadingElement>(null);
  const editArea = useRef<HTMLDivElement>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const historyDateId = useId();
  const publishDateId = useId();

  function reportFailure(caught: unknown, write?: StudyPlanCommand) {
    if (caught instanceof ApiError) {
      if (caught.status === 401) { onSessionLost(); return; }
      if (caught.status === 403 || caught.status === 404 || caught.code === 'context_changed') {
        setRead(null); setHistory(null); setEditor(false); setPeriodsPending(false); setUncertain(null);
        if (caught.code === 'mfa_required') setRequiresMfa(true);
        else setError('Studieplanen är inte tillgänglig i ditt aktuella uppdrag.');
        return;
      }
      if (caught.code === 'audit_unavailable') {
        if (!write) { setRead(null); setHistory(null); setEditor(false); setPeriodsPending(false); }
        setError(write ? 'Ändringen kunde inte sparas. Den tidigare versionen finns kvar.' : 'Studieplanen kunde inte läsas just nu.');
        return;
      }
      if (caught.status === 400) { setError('Kontrollera datum och val och försök igen.'); return; }
    }
    if (write) {
      setUncertain({ command: write, checked: false });
      setError('Svaret på sparandet uteblev. Kontrollera sparandet innan du fortsätter.');
    } else {
      setError('Studieplanen kunde inte hämtas. Försök igen.');
    }
  }

  const reload = useCallback(async (signal: AbortSignal) => {
    const request: StudyPlanReadRequest = { contractVersion: STUDY_PLAN_CONTRACT_VERSION, unitId, pupilId, placementId, on: initialOn, view: 'current' };
    const body = parseStudyPlanReadReply(await api.post<unknown>('/api/studieplaner/lasa', request, signal), request);
    if (signal.aborted || body.view !== 'current') return;
    setRead(body);
    setRequiresMfa(false);
  }, [initialOn, placementId, pupilId, unitId]);

  // Each mounted panel belongs to a single placement and login context.
  const report = useRef(reportFailure);
  useEffect(() => { report.current = reportFailure; });
  useEffect(() => {
    const controller = new AbortController();
    nextRequest.current = controller;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void reload(controller.signal).catch(error => {
        if (!controller.signal.aborted) report.current(error);
      }).finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          title.current?.focus();
        }
      });
    });
    return () => nextRequest.current?.abort();
  }, [reload]);

  async function run(task: (signal: AbortSignal) => Promise<void>, write?: StudyPlanCommand) {
    if (changing.current) return;
    changing.current = true;
    const controller = new AbortController();
    nextRequest.current?.abort();
    nextRequest.current = controller;
    setBusy(true);
    setError('');
    try { await task(controller.signal); }
    catch (caught) {
      if (!controller.signal.aborted) reportFailure(caught, write);
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        changing.current = false;
      }
    }
  }

  async function applyReceipt(receipt: StudyPlanReceipt, signal: AbortSignal) {
    setUncertain(null); setEditor(false); setPeriodsPending(false); setIssues([]); setHistory(null);
    setSelected(receipt.snapshot.state === 'current' ? 'current' : 'draft');
    setNotice(receipt.action === 'record_actual' ? 'Studiehändelsen är sparad.'
      : receipt.action === 'update_planned_dates' ? 'Ändringarna är sparade.'
      : receipt.snapshot.effectiveOn ? 'Version ' + receipt.snapshot.revision + ' gäller från ' + receipt.snapshot.effectiveOn + '.'
      : 'Utkastet är sparat.');
    await reload(signal);
  }

  async function send(command: StudyPlanCommand) {
    await run(async signal => {
      const result = parseStudyPlanCommandReply(await api.post<unknown>('/api/studieplaner/kommando', command, signal), command);
      if (signal.aborted) return;
      if (result.status === 'saved') {
        try { await applyReceipt(result.receipt, signal); }
        catch (caught) { if (!signal.aborted) reportFailure(caught); }
        return;
      }
      setUncertain(null);
      if (result.status === 'incomplete') {
        setNotice('Utkastet behöver kompletteras inför nästa steg.');
        setIssues(result.issues);
        return;
      }
      setNotice('Uppgifterna har ändrats. Hämta den senaste versionen innan du fortsätter.');
      setIssues([]); setHistory(null);
      setRead(null); setEditor(false); setPeriodsPending(false);
    }, command);
  }

  function submit(action: ActionInput) {
    if (!read || busy || uncertain) return;
    let command: StudyPlanCommand;
    try {
      command = parseStudyPlanCommand({ ...scope, ...action, commandId: crypto.randomUUID(),
        expectedRevision: read.latestRevision, expectedSourceToken: read.sourceToken });
    } catch { setError('Kontrollera datum och val och försök igen.'); return; }
    void send(command);
  }

  function recover() {
    if (!uncertain) return;
    const request = { ...scope, commandId: uncertain.command.commandId };
    void run(async signal => {
      const reply = parseStudyPlanStatusReply(await api.post<unknown>('/api/studieplaner/status', request, signal), request);
      if (signal.aborted) return;
      if (reply.receipt) await applyReceipt(reply.receipt, signal);
      else {
        setNotice('Inget kvitto hittades. Du kan försöka spara samma ändring igen.');
        setUncertain({ ...uncertain, checked: true });
      }
    });
  }

  function readHistory(on: string, revision?: number) {
    const request: StudyPlanReadRequest = { ...scope, view: 'history', on, ...(revision === undefined ? {} : { revision }) };
    void run(async signal => {
      const reply = parseStudyPlanReadReply(await api.post<unknown>('/api/studieplaner/lasa', request, signal), request);
      if (!signal.aborted && reply.view === 'history') {
        setEditor(false);
        setHistory({ version: reply.version, on });
      }
    });
  }

  const currentSnapshot = selected === 'draft' ? read?.draft ?? read?.current : read?.current ?? read?.draft;
  const snapshot = history ? history.version : currentSnapshot ?? null;
  const latest = !history && snapshot?.revision === read?.latestRevision;
  const writable = Boolean(read && (!props.placementEndsOn || props.placementEndsOn >= today));
  const disabled = busy || Boolean(uncertain);
  const canEdit = writable && latest && read?.basisStatus !== 'unsupported';
  const canPublish = canEdit && read?.canMakeCurrent && snapshot?.state === 'draft';
  const contextIssues = issues.length ? issues : snapshot?.state === 'draft' ? studyPlanContentIssues(snapshot.content) : read?.basisIssues ?? [];
  const on = history?.on ?? initialOn;
  const showEditor = (field?: string) => {
    setEditor(true); setNotice(''); setIssues([]);
    requestAnimationFrame(() => {
      const target = field && editArea.current?.querySelector<HTMLElement>('[data-study-plan-field="' + CSS.escape(field) + '"]');
      if (target instanceof HTMLDetailsElement) target.open = true;
      const control = target && target.querySelector<HTMLElement>('select:not([disabled]), input:not([disabled]), button:not([disabled]), summary');
      (control || editTitle.current)?.focus();
    });
  };
  const firstEffectiveDate = props.placementStartsOn > today ? props.placementStartsOn : today;

  return <section className="grid w-full min-w-0 gap-4" aria-busy={busy} aria-labelledby={titleId}>
    <div><h3 id={titleId} ref={title} tabIndex={-1} className="section-heading">Studieplan för {props.schoolName}</h3>
      <p className="text-sm text-muted-foreground">{props.educationName}</p></div>
    {requiresMfa && <MfaStepUpNotice returnTo={props.returnTo} message="Studieplanen kräver verifiering med engångskod." />}
    {error && <p role="alert" className="validation-warning">{error}</p>}
    {notice && <output className="admin-notice">{notice}</output>}
    {uncertain && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={recover}>Kontrollera sparandet</Button>
      {uncertain.checked && <Button disabled={busy} onClick={() => void send(uncertain.command)}>Försök spara igen</Button>}
    </div>}
    {busy && !read && <output>Hämtar studieplanen…</output>}
    {!read && !busy && !requiresMfa && <Button variant="outline" className="w-fit" onClick={() => void run(reload)}>Hämta aktuell version</Button>}
    {read && <>
      <IssueList issues={contextIssues} snapshot={snapshot} onEdit={canEdit && !editor && !disabled && !periodsPending ? showEditor : undefined} />
      {read.current && read.draft && !history && <div className="flex flex-wrap gap-2">
        <Button variant={selected === 'current' ? 'secondary' : 'outline'} aria-pressed={selected === 'current'} disabled={disabled || periodsPending}
          onClick={() => { setSelected('current'); setEditor(false); setNotice(''); setIssues([]); }}>Gällande version</Button>
        <Button variant={selected === 'draft' ? 'secondary' : 'outline'} aria-pressed={selected === 'draft'} disabled={disabled || periodsPending}
          onClick={() => { setSelected('draft'); setEditor(false); setNotice(''); setIssues([]); }}>Visa utkast</Button>
      </div>}
      {history && <Button variant="outline" className="w-fit" onClick={() => setHistory(null)}>Till studieplanen</Button>}
      {!snapshot && <p className="empty-state">{history ? 'Ingen gällande version fanns på det datumet.' : 'Det finns ingen gällande studieplan på visat datum.'}</p>}
      {writable && !history && !canEdit && !read.draft && read.basisStatus !== 'unsupported' && <div>
        <Button disabled={disabled} onClick={() => submit({ action: 'prepare_draft', payload: { dates: [] } })}>
          {read.latestRevision > 0 ? 'Bered utkast från senaste version' : 'Skapa utkast'}
        </Button>
      </div>}
      {snapshot && <>
        <div className="flex flex-wrap items-center gap-2">
          <span className={'status-badge' + (snapshot.state === 'current' && !history ? ' success' : '')}>{history ? 'Historik' : snapshot.state === 'current' ? 'Gällande' : 'Utkast'}</span>
          <span className="text-sm">Version {snapshot.revision}{snapshot.effectiveOn && ' · Gäller från ' + snapshot.effectiveOn}</span>
        </div>
        <dl className="mandate-facts">
          <div><dt>Studieväg</dt><dd>{snapshot.content.path.programCode}{snapshot.content.path.orientationCode && ' · ' + snapshot.content.path.orientationCode}</dd></div>
          {snapshot.content.path.apprenticeship && <div><dt>Utbildningsform</dt><dd>Lärlingsutbildning</dd></div>}
          {snapshot.content.path.specialVariantCode && <div><dt>Särskild variant</dt><dd>{snapshot.content.path.specialVariantCode}</dd></div>}
          {snapshot.content.compulsorySchoolSubjects?.length ? <div><dt>Grundskoleämnen</dt><dd>{snapshot.content.compulsorySchoolSubjects.map(s => s.label).join(', ')}</dd></div> : null}
          {snapshot.content.distanceTeaching.kind === 'applies' && <div><dt>Fjärrundervisning</dt><dd>{snapshot.content.distanceTeaching.minutes
            ? snapshot.content.distanceTeaching.minutes + ' minuter' : 'Omfattning behöver anges'}</dd></div>}
          {history && snapshot.content.dialogue && <div><dt>Elevdialog</dt><dd>{snapshot.content.dialogue.on}</dd></div>}
        </dl>
        {canEdit && !editor && <div className="flex flex-wrap gap-2">
          {canPublish && <Button ref={publishButton} disabled={disabled || periodsPending}
            onClick={() => { setEffectiveOn(firstEffectiveDate); setConfirm(true); }}>Gör gällande</Button>}
          <Button variant="outline" disabled={disabled || periodsPending} onClick={() => showEditor()}>Ändra övriga uppgifter</Button>
        </div>}
        {editor && canEdit
          ? <div className="grid min-w-0 gap-2" ref={editArea}><h4 ref={editTitle} tabIndex={-1} className="font-semibold">Ändra övriga uppgifter</h4>
            <StudyPlanEditor key={snapshot.revision} snapshot={snapshot} availableLevels={read.availableLevels}
              disabled={disabled} onSave={payload => submit({ action: 'prepare_draft', payload })} onCancel={() => setEditor(false)} /></div>
          : <>
            {snapshot.content.levels.length > 0 ? <LevelTable key={snapshot.revision + '/' + (history?.on ?? '')}
              snapshot={snapshot} calendar={read.calendar ?? []} suggestions={read.dateSuggestions ?? []}
              on={on} today={today} canEdit={Boolean(canEdit)} disabled={disabled} onPending={setPeriodsPending}
              onSave={dates => snapshot.state === 'current' && read.canMakeCurrent
                ? submit({ action: 'update_planned_dates', payload: { dates } })
                : submit({ action: 'prepare_draft', payload: { dates } })}
              onActual={payload => submit({ action: 'record_actual', payload })} />
              : <p className="empty-state">Nivåerna kan visas när källunderlaget finns.</p>}
            {snapshot.content.choices.length > 0 && <details>
              <summary className="min-h-[var(--control-height)] cursor-pointer py-2 font-medium">Val i studieplanen</summary>
              <ul className="grid list-none gap-1 p-0 text-sm">{snapshot.content.choices.map(choice => <li key={choice.id}>
                {choice.label} · {choice.state === 'confirmed' ? 'Bekräftat' : choice.state === 'unresolved' ? 'Återstår' : 'Ej aktuellt'}
              </li>)}</ul>
            </details>}
            <Decisions snapshot={snapshot} on={on} canShowReference={read.canMakeCurrent} />
            {canEdit && read.canMakeCurrent && snapshot.content.levels.length > 0 && <details>
              <summary className="min-h-[var(--control-height)] cursor-pointer py-2 font-medium text-primary">Registrera beslut</summary>
              <StudyPlanDecisionForm levels={snapshot.content.levels} today={today} disabled={disabled || periodsPending}
                onRecord={decision => submit({ action: 'record_decision', payload: { decision } })} />
            </details>}
          </>}
      </>}
      {read.history.length > 0 && <div className="grid gap-2">
        <Button variant="outline" className="w-fit" aria-expanded={historyOpen} disabled={disabled || periodsPending} onClick={() => {
          setHistoryOpen(value => !value); if (historyOpen) setHistory(null);
        }}>{historyOpen ? 'Dölj historik' : 'Visa historik'}</Button>
        {historyOpen && <section className="grid gap-3">
          <h3 className="font-semibold">Versioner av studieplanen</h3>
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!periodsPending) readHistory(historyOn); }}>
            <div><label htmlFor={historyDateId}>Visa vad som gällde den</label>
              <Input id={historyDateId} type="date" className="min-h-[var(--control-height)]" value={historyOn} onChange={event => setHistoryOn(event.target.value)} required /></div>
            <Button variant="outline" type="submit" disabled={disabled || periodsPending}>Läs på datum</Button>
          </form>
          <ul className="grid max-h-80 list-none gap-1 overflow-auto p-0">
            {read.history.map(version => <li key={version.revision} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Version {version.revision} · {version.effectiveOn ? 'Gäller från ' + version.effectiveOn : 'Utkast'}</span>
              <Button variant="outline" disabled={disabled || periodsPending} onClick={() => readHistory(version.effectiveOn ?? historyOn, version.revision)}>Läs version {version.revision}</Button>
            </li>)}
          </ul>
        </section>}
      </div>}
      <PupilStudyPlanImpact key={(read.current?.planId ?? 'ingen') + '/' + (read.current?.revision ?? 0)} scope={scope}
        initialOn={initialOn} placementStartsOn={props.placementStartsOn} placementEndsOn={props.placementEndsOn}
        onSessionLost={onSessionLost} onOpenClassChange={props.onOpenClassChange} />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="pupil-register-dialog" initialFocus={cancel} finalFocus={() => publishButton.current ?? title.current}>
          <AlertDialogHeader><AlertDialogTitle>Gör studieplanen gällande</AlertDialogTitle>
            <AlertDialogDescription>Välj från vilket datum studieplanen ska gälla.</AlertDialogDescription></AlertDialogHeader>
          <form className="grid gap-3" onSubmit={event => {
            event.preventDefault();
            if (effectiveOn) { setConfirm(false); submit({ action: 'make_current', payload: { effectiveOn } }); }
          }}>
            <div><label htmlFor={publishDateId}>Gäller från</label>
              <Input id={publishDateId} type="date" className="min-h-[var(--control-height)]" required value={effectiveOn}
                min={props.placementStartsOn} max={props.placementEndsOn ?? undefined}
                onChange={event => setEffectiveOn(event.target.value)} /></div>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancel}>Avbryt</AlertDialogCancel>
              <Button disabled={disabled} type="submit">Bekräfta gällande</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </section>;
}
