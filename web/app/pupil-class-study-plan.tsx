'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { isValidDate, schoolYearLabel } from '@/lib/pupil-register-model.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  parseStudyPlanClassPreview, parseStudyPlanClassRun, STUDY_PLAN_CLASS_LIMIT,
  type StudyPlanClassPreview, type StudyPlanClassRequest, type StudyPlanClassRun,
} from '@/lib/study-plan-class-contract.ts';
import MfaStepUpNotice from './mfa-step-up';
import { Warning } from './pupil-dialogs';

const endpoint = '/api/studieplaner/klass';
const previewLabels = {
  ready: 'Utkast kan skapas',
  needs_completion: 'Utkast kan skapas, behöver kompletteras',
  existing: 'Studieplan finns',
  blocked: 'Utkast kan inte skapas',
};
const reasons = {
  choice: 'Elevens val behöver kompletteras på elevkortet.',
  details: 'Övriga uppgifter behöver kompletteras på elevkortet.',
  catalog: 'Katalogunderlaget för studievägen behöver ses över.',
  unsupported: 'Klassvis beredning gäller nationella Gy25-program.',
  closed: 'Skolplaceringen är avslutad.',
};
const outcomeLabels = {
  pending: 'Väntar på att sparas',
  saved: 'Utkast skapat',
  existing: 'Studieplan finns',
  changed: 'Granska på nytt',
};

type Props = {
  unitId: string;
  classId: string;
  className: string;
  schoolName: string;
  schoolYear: number;
  today: string;
  returnTo: string;
  onClose: () => void;
  onOpenPupil: (pupilId: string) => void;
  onSessionLost: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
};
type Start = Extract<StudyPlanClassRequest, { action: 'start' }>;
type Operation = 'status' | 'preview' | 'saving';
type Failure = { text: string; checkStatus?: boolean; refreshPreview?: boolean };

const mayCreate = (row: StudyPlanClassPreview['rows'][number]) => row.status === 'ready' || row.status === 'needs_completion';
const completedText = (count: number) => count === 1 ? '1 utkast skapat' : `${count} utkast skapade`;
const dayLabel = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateText = (date: string) => dayLabel.format(new Date(`${date}T12:00:00Z`));
const actionClass = 'min-h-[var(--control-height)] max-w-full whitespace-normal';

export default function PupilClassStudyPlan({
  unitId, classId, className, schoolName, schoolYear, today, returnTo, onClose, onOpenPupil, onSessionLost, returnFocus,
}: Props) {
  const min = `${schoolYear}-07-01`, max = `${schoolYear + 1}-06-30`;
  const [on, setOn] = useState(today >= min && today <= max ? today : '');
  const [preview, setPreview] = useState<StudyPlanClassPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [run, setRun] = useState<StudyPlanClassRun | null>(null);
  const [unconfirmedStart, setUnconfirmedStart] = useState<Start | null>(null);
  const [busy, setBusy] = useState<Operation | null>('status');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [mfa, setMfa] = useState(false);
  const [denied, setDenied] = useState(false);
  const request = useRef<AbortController | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const warning = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const busySaving = busy === 'saving';

  const focus = (target: { current: HTMLElement | null }) =>
    requestAnimationFrame(() => target.current?.focus());

  const clearProtected = () => {
    setPreview(null);
    setSelected([]);
    setRun(null);
    setUnconfirmedStart(null);
  };

  async function perform(operation: Operation, action: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(operation);
    setFailure(null);
    try {
      await action(controller.signal);
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      if (caught instanceof ApiError && caught.status === 401) {
        clearProtected();
        onSessionLost();
        return;
      }
      if (caught instanceof ApiError && caught.code === 'mfa_required') {
        clearProtected();
        setMfa(true);
        return;
      }
      if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404 || caught.code === 'context_changed')) {
        clearProtected();
        setDenied(true);
        setFailure({ text: 'Studieplansutkasten är inte tillgängliga i ditt aktuella uppdrag. Läs om elevlistan om uppdraget har ändrats.' });
      } else if (caught instanceof ApiError && caught.reason === 'study_plan_class_too_large') {
        setFailure({ text: `Klassurvalet har fler än ${STUDY_PLAN_CLASS_LIMIT} elever. Använd elevkorten för att skapa utkast.` });
      } else if (caught instanceof ApiError && caught.status === 409) {
        clearProtected();
        setFailure({ text: 'Underlaget har ändrats. Förhandsgranska klassen igen innan du sparar.', refreshPreview: true });
      } else if (operation === 'preview') {
        setFailure({ text: caught instanceof ApiError && caught.status === 400
          ? 'Klassurvalet kunde inte läsas. Kontrollera datumet och försök igen.'
          : 'Förhandsgranskningen kunde inte hämtas. Försök igen.' });
      } else {
        setFailure({
          text: operation === 'status'
            ? 'Sparresultatet kunde inte hämtas. Kontrollera sparandet igen.'
            : 'Sparandet kunde inte bekräftas. Kontrollera sparandet innan du fortsätter.',
          checkStatus: true,
        });
      }
      focus(warning);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(null);
      }
    }
  }

  function checkedRun(value: unknown, runId?: string, onDate?: string) {
    const valueRun = parseStudyPlanClassRun(value);
    if (valueRun.unitId !== unitId || valueRun.classId !== classId || valueRun.on < min || valueRun.on > max
      || (runId !== undefined && valueRun.runId !== runId) || (onDate !== undefined && valueRun.on !== onDate)) {
      throw new Error('Invalid class study plan run');
    }
    return valueRun;
  }

  async function loadStatus(signal: AbortSignal, runId?: string) {
    const raw = await api.post<unknown>(endpoint, { action: 'status', unitId, classId, ...(runId ? { runId } : { schoolYear }) }, signal);
    if (signal.aborted) return;
    const found = raw === null ? null : checkedRun(raw, runId);
    setRun(found);
    if (!found) return;
    setOn(found.on);
    setPreview(null);
    setSelected([]);
    setUnconfirmedStart(null);
    focus(resultHeading);
  }

  function readStatus() {
    void perform('status', signal => loadStatus(signal, unconfirmedStart?.runId ?? run?.runId));
  }
  const initialize = useEffectEvent(readStatus);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) initialize(); });
    return () => {
      active = false;
      request.current?.abort();
      request.current = null;
    };
  }, []);

  function readPreview(date: string) {
    if (!isValidDate(date) || date < min || date > max) return;
    setPreview(null);
    setSelected([]);
    void perform('preview', async signal => {
      const raw = await api.post<unknown>(endpoint, { action: 'preview', unitId, classId, on: date }, signal);
      if (signal.aborted) return;
      const next = parseStudyPlanClassPreview(raw);
      if (next.scope.unitId !== unitId || next.scope.classId !== classId || next.scope.on !== date) {
        throw new Error('Invalid class study plan preview');
      }
      setPreview(next);
      setSelected(next.rows.filter(mayCreate).map(row => row.pupilId));
      focus(reviewHeading);
    });
  }

  async function advance(initial: StudyPlanClassRun, signal: AbortSignal) {
    let current = initial;
    const outstanding = (result: StudyPlanClassRun) => result.rows.filter(row => row.outcome === 'pending').length;
    for (let step = 0; current.hasPending && !signal.aborted; step++) {
      // Varje anrop bearbetar en rad. Bryt vid ett uteblivet framsteg så
      // att sparstatus kan läsas om även om anslutningen tappas.
      if (step >= STUDY_PLAN_CLASS_LIMIT) throw new Error('Class study plan run exceeded its limit');
      const raw = await api.post<unknown>(endpoint, { action: 'advance', unitId, classId, runId: current.runId }, signal);
      if (signal.aborted) return;
      const next = checkedRun(raw, current.runId, current.on);
      if (next.hasPending && outstanding(next) >= outstanding(current)) throw new Error('Class study plan run did not progress');
      current = next;
      setRun(current);
    }
    if (!signal.aborted) focus(resultHeading);
  }

  function sendStart(command: Start) {
    setUnconfirmedStart(command);
    void perform('saving', async signal => {
      let raw: unknown;
      try {
        raw = await api.post<unknown>(endpoint, command, signal);
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.reason !== 'study_plan_class_in_progress') throw caught;
        setPreview(null);
        setSelected([]);
        setUnconfirmedStart(null);
        await loadStatus(signal);
        return;
      }
      if (signal.aborted) return;
      const created = checkedRun(raw, command.runId, command.scope.on);
      setRun(created);
      setPreview(null);
      setSelected([]);
      setUnconfirmedStart(null);
      await advance(created, signal);
    });
  }

  function start() {
    if (!preview || selected.length === 0 || request.current) return;
    sendStart({ action: 'start', scope: preview.scope, previewToken: preview.previewToken, pupilIds: selected, runId: crypto.randomUUID() });
  }

  function changeDate(date: string) {
    setOn(date);
    setPreview(null);
    setSelected([]);
    setFailure(null);
  }

  function newReview() {
    setRun(null);
    setUnconfirmedStart(null);
    readPreview(on);
  }

  const selectedCount = selected.length;
  const canCreate = preview?.rows.filter(mayCreate).length ?? 0;
  const existing = preview?.rows.filter(row => row.status === 'existing').length ?? 0;
  const blocked = preview?.rows.filter(row => row.status === 'blocked').length ?? 0;
  const saved = run?.rows.filter(row => row.outcome === 'saved').length ?? 0;
  const changed = run?.rows.filter(row => row.outcome === 'changed').length ?? 0;
  const already = run?.rows.filter(row => row.outcome === 'existing').length ?? 0;
  const needStatus = !!failure?.checkStatus;
  const showReview = !run && !mfa && !denied && !unconfirmedStart;
  const canOpenCard = !busy && !needStatus;
  const classStartsOn = preview?.classStartsOn;
  const pupilButton = (row: { pupilId: string; displayName: string }) => <Button
    type="button" variant="outline" className={actionClass} disabled={!canOpenCard}
    aria-label={`Öppna elevkort för ${row.displayName}`} onClick={() => onOpenPupil(row.pupilId)}>Öppna elevkort</Button>;

  return <Dialog open onOpenChange={open => { if (!open && !busySaving) onClose(); }}>
    <DialogContent className="mandate-dialog max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={false}
      initialFocus={title} finalFocus={returnFocus}>
      <DialogTitle ref={title} tabIndex={-1} className="section-heading">
        Studieplansutkast för {preview?.className ?? className}
      </DialogTitle>
      <DialogDescription>{preview?.schoolName ?? schoolName} · Läsåret {schoolYearLabel(schoolYear)}</DialogDescription>
      {busy === 'status' && <output>Hämtar sparresultat…</output>}
      {busy === 'preview' && <output>Hämtar förhandsgranskning…</output>}
      {failure && <Warning focusRef={warning}>{failure.text}</Warning>}
      {mfa && <MfaStepUpNotice returnTo={returnTo}
        message="Studieplaner kräver verifiering med engångskod."
        detail="Öppna klassens studieplansutkast igen efter verifieringen för att läsa sparresultatet." />}
      {needStatus && <Button type="button" className={actionClass + ' justify-self-start'} disabled={!!busy} onClick={readStatus}>Kontrollera sparandet</Button>}
      {unconfirmedStart && !needStatus && !mfa && !denied && !run && !busy && <div className="grid gap-3">
        <p>Inget sparresultat finns för den här bekräftelsen.</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" className={actionClass} onClick={() => sendStart(unconfirmedStart)}>Försök spara igen</Button>
          <Button type="button" variant="outline" className={actionClass} onClick={() => setUnconfirmedStart(null)}>Till granskningen</Button>
        </div>
      </div>}
      {showReview && <form className="grid gap-4" onSubmit={event => { event.preventDefault(); readPreview(on); }}>
        <div className="grid max-w-xs gap-2">
          <label htmlFor={inputId}>Elever i klassen den</label>
          <DatePicker id={inputId} required min={min} max={max} value={on} onValueChange={changeDate} disabled={!!busy || needStatus} />
          {classStartsOn && classStartsOn > on && classStartsOn <= max && <Button type="button" variant="outline" className={actionClass}
            onClick={() => { changeDate(classStartsOn); readPreview(classStartsOn); }}>Använd klassens startdatum</Button>}
        </div>
        <Button type="submit" variant={preview ? 'outline' : 'default'} className={actionClass + ' justify-self-start'}
          disabled={!!busy || needStatus || !isValidDate(on)}>{failure?.refreshPreview ? 'Förhandsgranska på nytt' : 'Förhandsgranska'}</Button>
      </form>}
      {showReview && preview && <section aria-labelledby={inputId + '-review'} className="grid min-w-0 gap-4">
        <h3 id={inputId + '-review'} ref={reviewHeading} tabIndex={-1} className="section-heading">Förhandsgranskning</h3>
        {preview.rows.length === 0 ? <p className="empty-state">Inga elever i urvalet den {dateText(on)}.</p> : <>
          <output className="block">{canCreate} kan skapas · {existing} har redan en studieplan · {blocked} kan inte skapas</output>
          <ul className="grid min-w-0 list-none divide-y divide-border">
            {preview.rows.map(row => <li key={row.pupilId} className="grid min-w-0 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              {mayCreate(row) ? <label className="mandate-check flex min-w-0">
                <input type="checkbox" checked={selected.includes(row.pupilId)} disabled={!!busy}
                  aria-label={`Ta med ${row.displayName}`}
                  onChange={event => {
                    const checked = event.target.checked;
                    setSelected(ids => checked ? [...ids, row.pupilId] : ids.filter(id => id !== row.pupilId));
                  }} />
                <span className="min-w-0 break-words"><strong>{row.displayName}</strong><br /><span className="text-muted-foreground">{row.educationName}</span></span>
              </label> : <div className="break-words"><strong>{row.displayName}</strong><br /><span className="text-muted-foreground">{row.educationName}</span></div>}
              <div className="grid min-w-0 gap-1">
                <span className="status-badge w-fit max-w-full whitespace-normal">{previewLabels[row.status]}</span>
                {row.reason && <span className="text-muted-foreground">{reasons[row.reason]}</span>}
              </div>
              {row.status === 'existing' && pupilButton(row)}
            </li>)}
          </ul>
        </>}
        {canCreate > 0 && <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className={actionClass} disabled={!!busy || !selectedCount} onClick={start}>Skapa {selectedCount} utkast</Button>
          <output>{selectedCount} valda elever</output>
        </div>}
      </section>}
      {busySaving && <output className="block">Skapar utkast. {completedText(saved)} hittills.</output>}
      {run && <section aria-labelledby={inputId + '-result'} className="grid min-w-0 gap-4">
        <h3 id={inputId + '-result'} ref={resultHeading} tabIndex={-1} className="section-heading">Sparresultat</h3>
        <p>Elever i klassen den {dateText(run.on)}</p>
        <output>{completedText(saved)}{already > 0 ? ` · ${already} har redan en studieplan` : ''}{changed > 0 ? ` · ${changed} behöver granskas på nytt` : ''}</output>
        <ul className="grid min-w-0 list-none divide-y divide-border">
          {run.rows.map(row => <li key={row.pupilId} className="grid min-w-0 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="min-w-0 break-words"><strong>{row.displayName}</strong><br /><span className="text-muted-foreground">{row.educationName}</span></div>
            <span className={`status-badge w-fit max-w-full whitespace-normal${row.outcome === 'saved' ? ' success' : ''}`}>{outcomeLabels[row.outcome]}</span>
            {(row.outcome === 'saved' || row.outcome === 'existing') && pupilButton(row)}
          </li>)}
        </ul>
        {!busy && !needStatus && (run.hasPending
          ? <Button type="button" className={actionClass + ' justify-self-start'} onClick={() => void perform('saving', signal => advance(run, signal))}>Fortsätt skapa utkast</Button>
          : <Button type="button" variant={changed ? 'default' : 'outline'} className={actionClass + ' justify-self-start'} onClick={newReview}>Förhandsgranska på nytt</Button>)}
      </section>}
      <DialogClose render={<Button type="button" variant="outline" className={actionClass + ' justify-self-start'} disabled={busySaving} />}>Stäng</DialogClose>
    </DialogContent>
  </Dialog>;
}
