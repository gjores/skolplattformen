'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply, parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION,
  type StudyPlanCommand, type StudyPlanCurrentReply, type StudyPlanReadRequest, type StudyPlanReceipt, type StudyPlanScope,
} from '@/lib/study-plan-contract.ts';
import {
  studyAttemptStatus, studyDecisionEffective, studyPlanContentIssues,
  type PlannedStudyDate, type StudyPlanIssue, type StudyPlanLevel, type StudyPlanSnapshot,
} from '@/lib/study-plan-model.ts';
import MfaStepUpNotice from './mfa-step-up';
import { StudyPlanActualForm, StudyPlanDecisionForm, StudyPlanEditor } from './pupil-study-plan-fields';

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
  dialogue_required: 'Granska det senaste utkastet med eleven.',
  choice_unresolved: 'Valet behöver kompletteras och bekräftas.',
  choice_scope_incomplete: 'Kontrollera valets poäng och nivåer.',
  levels_incomplete: 'Studienivåerna eller gymnasiearbetet behöver kompletteras.',
  source_choice_needs_review: 'Elevvalet behöver granskas i skolans underlag.',
  additional_level_decision_needed: 'Registrera det befintliga beslutet och spara utkastet igen.',
  examination_source_needs_review: 'Examensformen för elevkullen behöver granskas.',
};

function plannedDate(value: PlannedStudyDate) {
  if (!value) return 'Uppgift saknas';
  return value.kind === 'day' ? value.date : value.term + ' ' + (value.term === 'HT' ? value.schoolYear : value.schoolYear + 1);
}

const factSources = { school_record: 'Skolans registrering', previous_school: 'Tidigare skola' } as const;

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

function LevelRows({ snapshot, on, today, canRecord, disabled, onActual }: {
  snapshot: StudyPlanSnapshot; on: string; today: string; canRecord: boolean; disabled: boolean;
  onActual: (payload: Extract<StudyPlanCommand, { action: 'record_actual' }>['payload']) => void;
}) {
  const { levels, decisions } = snapshot.content;
  return <ul className="grid list-none gap-3 p-0 lg:grid-cols-2">
    {levels.map(level => <li key={level.id} className="min-w-0 rounded-lg border border-border p-3">
      <h4 className="break-words text-sm font-semibold">{level.label}</h4>
      <p className="break-words text-sm text-muted-foreground">{level.itemCode} · {level.points} p</p>
      {level.attempts.map((attempt, index) => {
        const status = studyAttemptStatus(attempt, on, decisions, level.id);
        const deviations = decisions.filter(decision => decision.levelIds.includes(level.id) && studyDecisionEffective(decision, on)
          && (decision.kind === 'eligibility_opt_out' || decision.kind === 'replaced'));
        return <div key={attempt.id} className="mt-2 grid gap-2">
          {level.attempts.length > 1 && <p className="text-sm font-medium">Studieförsök {index + 1}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className={'status-badge' + (status.progress === 'completed' ? ' success' : '')}>{progressLabels[status.progress]}</span>
            {status.reduced && <span className="status-badge">Reducerad</span>}
            {status.needsFollowUp && <span className="status-badge">Behöver följas upp</span>}
            {deviations.map(decision => <span key={decision.id} className="status-badge">{decisionLabels[decision.kind]}</span>)}
          </div>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
            <div className="min-w-0"><dt className="text-muted-foreground">Planerad start</dt><dd>{plannedDate(attempt.plannedStart)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Planerat slut</dt><dd>{plannedDate(attempt.plannedEnd)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Faktisk start</dt><dd>{attempt.actual.start?.on ?? 'Uppgift saknas'}
              {attempt.actual.start && <small className="block text-muted-foreground">{factSources[attempt.actual.start.source.kind]}</small>}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Faktiskt avslut</dt><dd>{attempt.actual.end?.on ?? 'Uppgift saknas'}
              {attempt.actual.end && <small className="block text-muted-foreground">{factSources[attempt.actual.end.source.kind]}</small>}</dd></div>
          </dl>
          {canRecord && <details>
            <summary className="flex min-h-[var(--control-height)] cursor-pointer items-center font-medium text-primary">Registrera studiehändelse</summary>
            <StudyPlanActualForm level={level} attempt={attempt} today={today} disabled={disabled} onRecord={onActual} />
          </details>}
        </div>;
      })}
    </li>)}
  </ul>;
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
  const [review, setReview] = useState(false);
  const [dialogueOn, setDialogueOn] = useState(today);
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
  const dialogueDateId = useId();
  const publishDateId = useId();

  function reportFailure(caught: unknown, write?: StudyPlanCommand) {
    if (caught instanceof ApiError) {
      if (caught.status === 401) { onSessionLost(); return; }
      if (caught.status === 403 || caught.status === 404 || caught.code === 'context_changed') {
        setRead(null); setHistory(null); setEditor(false); setUncertain(null);
        if (caught.code === 'mfa_required') setRequiresMfa(true);
        else setError('Studieplanen är inte tillgänglig i ditt aktuella uppdrag.');
        return;
      }
      if (caught.code === 'audit_unavailable') {
        if (!write) { setRead(null); setHistory(null); setEditor(false); }
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
    setUncertain(null); setEditor(false); setReview(false); setIssues([]); setHistory(null);
    setSelected(receipt.snapshot.state === 'current' ? 'current' : 'draft');
    setNotice(receipt.snapshot.effectiveOn
      ? 'Version ' + receipt.snapshot.revision + ' gäller från ' + receipt.snapshot.effectiveOn + '.'
      : receipt.action === 'record_dialogue' ? 'Elevdialogen är registrerad.' : 'Utkastet är sparat.');
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
      setRead(null); setEditor(false); setReview(false);
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
        setEditor(false); setReview(false);
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
  const reviewed = Boolean(snapshot?.content.dialogue && snapshot.content.dialogue.reviewedRevision === snapshot.revision - 1);
  const contextIssues = issues.length ? issues : snapshot?.state === 'draft' ? studyPlanContentIssues(snapshot.content) : read?.basisIssues ?? [];
  const on = history?.on ?? initialOn;
  const showEditor = (field?: string) => {
    setEditor(true); setReview(false); setNotice(''); setIssues([]);
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
      <IssueList issues={contextIssues} snapshot={snapshot} onEdit={canEdit && !editor && !disabled ? showEditor : undefined} />
      {read.current && read.draft && !history && <div className="flex flex-wrap gap-2">
        <Button variant={selected === 'current' ? 'secondary' : 'outline'} aria-pressed={selected === 'current'} disabled={disabled}
          onClick={() => { setSelected('current'); setReview(false); setEditor(false); setNotice(''); setIssues([]); }}>Gällande version</Button>
        <Button variant={selected === 'draft' ? 'secondary' : 'outline'} aria-pressed={selected === 'draft'} disabled={disabled}
          onClick={() => { setSelected('draft'); setReview(false); setEditor(false); setNotice(''); setIssues([]); }}>Visa utkast</Button>
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
          {snapshot.content.dialogue && <div><dt>Granskad med eleven</dt><dd>{snapshot.content.dialogue.on}</dd></div>}
        </dl>
        {canEdit && !editor && <div className="flex flex-wrap gap-2">
          {canPublish && reviewed ? <Button ref={publishButton} disabled={disabled} onClick={() => { setEffectiveOn(firstEffectiveDate); setConfirm(true); }}>Gör gällande</Button>
            : snapshot.state === 'draft' && <Button disabled={disabled} onClick={() => { setReview(true); setNotice(''); }}>Granska med eleven</Button>}
          <Button variant={snapshot.state === 'draft' ? 'outline' : 'default'} disabled={disabled} onClick={() => showEditor()}>Ändra studieplan</Button>
        </div>}
        {review && canEdit && <form className="grid w-fit max-w-full gap-2" onSubmit={event => {
          event.preventDefault(); submit({ action: 'record_dialogue', payload: { on: dialogueOn } });
        }}>
          <label htmlFor={dialogueDateId}>Datum för elevdialog</label>
          <Input id={dialogueDateId} type="date" max={today} className="min-h-[var(--control-height)]" value={dialogueOn}
            onChange={event => setDialogueOn(event.target.value)} required />
          <Button disabled={disabled} type="submit">Registrera elevdialog</Button>
        </form>}
        {editor && canEdit
          ? <div className="grid min-w-0 gap-2" ref={editArea}><h4 ref={editTitle} tabIndex={-1} className="font-semibold">Ändra studieplan</h4>
            <StudyPlanEditor key={snapshot.revision} snapshot={snapshot} availableLevels={read.availableLevels} calendar={read.calendar ?? []}
              disabled={disabled} onSave={payload => submit({ action: 'prepare_draft', payload })} onCancel={() => setEditor(false)} /></div>
          : <>
            <h3 className="font-semibold">Ämnesnivåer och gymnasiearbete</h3>
            {snapshot.content.levels.length > 0 ? <LevelRows snapshot={snapshot} on={on} today={today} canRecord={Boolean(canEdit)}
              disabled={disabled} onActual={payload => submit({ action: 'record_actual', payload })} />
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
              <StudyPlanDecisionForm levels={snapshot.content.levels} today={today} disabled={disabled}
                onRecord={decision => submit({ action: 'record_decision', payload: { decision } })} />
            </details>}
          </>}
      </>}
      {read.history.length > 0 && <div className="grid gap-2">
        <Button variant="outline" className="w-fit" aria-expanded={historyOpen} disabled={disabled} onClick={() => {
          setHistoryOpen(value => !value); if (historyOpen) setHistory(null);
        }}>{historyOpen ? 'Dölj historik' : 'Visa historik'}</Button>
        {historyOpen && <section className="grid gap-3">
          <h3 className="font-semibold">Versioner av studieplanen</h3>
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); readHistory(historyOn); }}>
            <div><label htmlFor={historyDateId}>Visa vad som gällde den</label>
              <Input id={historyDateId} type="date" className="min-h-[var(--control-height)]" value={historyOn} onChange={event => setHistoryOn(event.target.value)} required /></div>
            <Button variant="outline" type="submit" disabled={disabled}>Läs på datum</Button>
          </form>
          <ul className="grid max-h-80 list-none gap-1 overflow-auto p-0">
            {read.history.map(version => <li key={version.revision} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Version {version.revision} · {version.effectiveOn ? 'Gäller från ' + version.effectiveOn : 'Utkast'}</span>
              <Button variant="outline" disabled={disabled} onClick={() => readHistory(version.effectiveOn ?? historyOn, version.revision)}>Läs version {version.revision}</Button>
            </li>)}
          </ul>
        </section>}
      </div>}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="pupil-register-dialog" initialFocus={cancel} finalFocus={() => publishButton.current ?? title.current}>
          <AlertDialogHeader><AlertDialogTitle>Gör studieplanen gällande</AlertDialogTitle>
            <AlertDialogDescription>Välj från vilket datum den granskade versionen ska gälla.</AlertDialogDescription></AlertDialogHeader>
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
