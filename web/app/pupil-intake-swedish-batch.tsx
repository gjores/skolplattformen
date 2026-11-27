'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseStudyPlanIntakeSwedishReceipt } from '@/lib/study-plan-intake-contract.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';
import { intakeStudyEndpoint, swedishSubjectLabel, swedishSubjectRequest, type IntakeStudyRow, type SwedishSubject, type SwedishSubjectSave } from './pupil-swedish-subject';

export type SwedishBatchRow = {
  name: string;
  startsOn: string;
  endsOn: string | null;
  study?: IntakeStudyRow;
};

type Props = {
  unitId: string;
  on: string;
  today: string;
  rows: readonly SwedishBatchRow[];
  returnTo: string;
  onSessionLost: () => void;
  onClose: () => void;
  onSaved?: () => void;
};

type Entry = {
  name: string;
  request: SwedishSubjectSave;
  status: 'waiting' | 'saved' | 'conflict' | 'unknown' | 'failed';
  detail?: string;
};

const subjectLabels: Record<SwedishSubject, string> = {
  SVEN: 'Svenska',
  SVEA: 'Svenska som andraspråk',
};

const statusLabels: Record<Entry['status'], string> = {
  waiting: 'Inte skickat',
  saved: 'Sparat',
  conflict: 'Uppgiften har ändrats',
  unknown: 'Sparandet behöver kontrolleras',
  failed: 'Sparades inte',
};

function isEligible(row: SwedishBatchRow, date: string): row is SwedishBatchRow & { study: IntakeStudyRow } {
  return !!row.study && !row.study.swedish.subject && row.study.plan.status !== 'current'
    && (!row.endsOn || row.endsOn >= date);
}

function verifyReceipt(value: unknown, request: SwedishSubjectSave) {
  const receipt = parseStudyPlanIntakeSwedishReceipt(value);
  if (receipt.commandId !== request.commandId || receipt.pupilId !== request.pupilId || receipt.placementId !== request.placementId
    || receipt.swedish.revision !== request.expectedRevision + 1 || receipt.swedish.subject !== request.subject
    || receipt.swedish.assessment !== request.assessment || receipt.swedish.effectiveOn !== request.effectiveOn) {
    throw new Error('Oväntat kvitto för svenskämnet.');
  }
}

export default function PupilIntakeSwedishBatch({ unitId, on, today, rows, returnTo, onSessionLost, onClose, onSaved }: Props) {
  const fieldId = useId();
  const [review] = useState(() => ({ unitId, on, today, rows }));
  const [subject, setSubject] = useState<SwedishSubject | ''>('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const writing = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const date = review.on > review.today ? review.on : review.today;
  const eligible = review.rows.filter(row => isEligible(row, date));
  const selected = eligible.filter(row => !excluded.includes(row.study.placementId));
  const rejected = review.rows.filter(row => !isEligible(row, date));
  const unknown = entries?.some(entry => entry.status === 'unknown') ?? false;
  useUnsavedChanges('navigation-block:intake-swedish:' + fieldId, busy || unknown);

  async function submit(reviewed: Entry[]) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setMfa(false);
    // Capture the payloads once. A response or a fresh roster never replaces a reviewed command.
    const progress = [...reviewed];
    setEntries([...progress]);
    let wrote = false;
    try {
      for (const [index, entry] of reviewed.entries()) {
        if (entry.status !== 'waiting' && entry.status !== 'unknown') continue;
        const { request } = entry;
        const publish = (status: Entry['status'], detail?: string) => {
          progress[index] = { ...entry, status, detail };
          setEntries([...progress]);
        };

        let checkingReceipt = entry.status === 'unknown';
        try {
          if (checkingReceipt) {
            const { unitId: unit, commandId, pupilId, placementId } = request;
            const previous = await api.post<unknown>(intakeStudyEndpoint, { action: 'swedish_status', unitId: unit, commandId, pupilId, placementId });
            if (previous !== null) {
              verifyReceipt(previous, request);
              publish('saved');
              wrote = true;
              continue;
            }
            checkingReceipt = false;
          }
          const result = await api.post<{ receipt: unknown }>(intakeStudyEndpoint, request);
          verifyReceipt(result.receipt, request);
          publish('saved');
          wrote = true;
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
          if (caught instanceof ApiError && caught.code === 'mfa_required') {
            publish(checkingReceipt ? 'unknown' : 'failed', 'Verifiera ditt uppdrag med engångskod.');
            setMfa(true);
            break;
          }
          if (!checkingReceipt && caught instanceof ApiError && caught.hasExplicitCode && caught.status < 500) {
            if (caught.status === 409) publish('conflict', 'Öppna elevkortet och läs den aktuella uppgiften.');
            else publish('failed', caught.message);
            continue;
          }
          publish('unknown', 'Kvittot behöver läsas igen innan nästa elev sparas.');
          break;
        }
      }
    } finally {
      writing.current = false;
      setBusy(false);
      if (wrote) onSaved?.();
      requestAnimationFrame(() => resultHeading.current?.focus());
    }
  }

  function save() {
    if (!subject || !acknowledged || !selected.length) return;
    void submit(selected.map(row => ({
      name: row.name,
      request: swedishSubjectRequest(review.unitId, row.study, subject, subject === 'SVEA' ? 'pending' : null, review.on < row.startsOn ? row.startsOn : review.on),
      status: 'waiting',
    })));
  }

  function toggle(placementId: string) {
    setAcknowledged(false);
    setExcluded(previous => previous.includes(placementId) ? previous.filter(id => id !== placementId) : [...previous, placementId]);
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy && !unknown) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-lg" showCloseButton={false} aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>{entries ? 'Sparbesked för svenskämne' : 'Granska svenskämne för markerade elever'}</DialogTitle>
        <DialogDescription>{entries
          ? 'Varje elev har ett eget sparbesked.'
          : 'Välj samma ämne för elever som har uppgett sitt val och där underlaget har kontrollerats.'}</DialogDescription>
      </DialogHeader>
      {entries ? <div className="min-w-0 space-y-3">
        <h3 ref={resultHeading} tabIndex={-1} className="section-heading">{entries.filter(entry => entry.status === 'saved').length} av {entries.length} sparade</h3>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla sparbeskedet. */}
        <ul aria-label="Sparbesked per elev" tabIndex={0} className="max-h-[42dvh] divide-y overflow-auto rounded-md border">
          {entries.map(entry => <li key={entry.request.commandId} className="space-y-1 px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{entry.name}</span>
              <span className={'status-badge whitespace-normal' + (entry.status === 'saved' ? ' success' : entry.status === 'waiting' ? '' : ' warning')}>{statusLabels[entry.status]}</span>
            </div>
            {entry.detail && <p className="text-muted-foreground">{entry.detail}</p>}
          </li>)}
        </ul>
        {mfa && <MfaStepUpNotice message="Verifiera med engångskod för att fortsätta." returnTo={returnTo} />}
        {busy && <output>Kontrollerar sparandet…</output>}
      </div> : <div className="min-w-0 space-y-3">
        <label className="grid gap-1" htmlFor={fieldId}>Elevens val
          <select id={fieldId} className="min-h-11 w-full rounded-md border border-input bg-background px-3"
            value={subject} onChange={event => { setSubject(event.target.value as SwedishSubject | ''); setAcknowledged(false); }}>
            <option value="">Välj svenskämne</option>
            <option value="SVEN">{subjectLabels.SVEN}</option>
            <option value="SVEA">{subjectLabels.SVEA}</option>
          </select>
        </label>
        {subject === 'SVEA' && <p className="text-muted-foreground">Valet sparas med väntande målgruppsbedömning. Rektor bekräftar bedömningen per elev på elevkortet.</p>}
        {eligible.length > 0 && <fieldset className="min-w-0 space-y-1">
          <legend className="font-medium">{selected.length} av {eligible.length} elever ingår</legend>
          <ul aria-label="Elever som kan ingå" className="max-h-[34dvh] divide-y overflow-auto rounded-md border">
            {eligible.map(row => <li key={row.study.placementId}>
              <label className="flex min-h-11 items-center gap-2 px-3 py-2">
                <input type="checkbox" checked={!excluded.includes(row.study.placementId)} onChange={() => toggle(row.study.placementId)} />
                <span>{row.name}</span>
              </label>
            </li>)}
          </ul>
        </fieldset>}
        {rejected.length > 0 && <details>
          <summary className="min-h-11 content-center">{rejected.length} elever kan inte ändras här</summary>
          <ul className="max-h-36 list-inside list-disc overflow-auto pl-2 text-muted-foreground">
            {rejected.map((row, index) => <li key={row.study?.placementId ?? index}>{row.name} · {row.endsOn && row.endsOn < date
              ? 'Placeringen har avslutats före valt datum' : row.study?.plan.status === 'current' ? 'Studieplanen är gällande'
                : row.study ? swedishSubjectLabel(row.study) : 'Svenskämnet kunde inte läsas'}</li>)}
          </ul>
        </details>}
        <label className="flex min-h-11 items-start gap-2">
          <input type="checkbox" className="mt-1" disabled={!subject || !selected.length} checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)} />
          <span>Jag har kontrollerat att det dokumenterade valet för varje elev som ingår är {subject ? subjectLabels[subject] : 'ämnet som valts ovan'}.</span>
        </label>
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-(--control-height)" disabled={busy || unknown} onClick={onClose}>{entries ? 'Stäng' : 'Avbryt'}</Button>
        {entries && unknown && <Button type="button" disabled={busy} className="min-h-(--control-height) whitespace-normal" onClick={() => void submit(entries)}>
          Kontrollera sparandet och fortsätt</Button>}
        {!entries && <Button type="button" className="min-h-(--control-height) whitespace-normal" disabled={!subject || !acknowledged || !selected.length} onClick={save}>
          Spara valet för {selected.length} {selected.length === 1 ? 'elev' : 'elever'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
