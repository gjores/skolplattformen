'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseStudyPlanIntakeRead, parseStudyPlanIntakeRow, type StudyPlanIntakePupil, type StudyPlanIntakeRow } from '@/lib/study-plan-intake-contract.ts';
import MfaStepUpNotice from './mfa-step-up';

export const intakeStudyEndpoint = '/api/studieplaner/mottagande';
export type IntakePupil = StudyPlanIntakePupil;
export type SwedishSubject = 'SVEN' | 'SVEA';
type Assessment = 'pending' | 'confirmed' | null;
export type IntakeStudyRow = StudyPlanIntakeRow;
export type IntakeStudyRead = { rows: IntakeStudyRow[]; canConfirmAssessment: boolean };

export function swedishSubjectLabel(row: IntakeStudyRow | undefined) {
  if (!row) return '—';
  if (!row.swedish.subject && row.currentPlanSubject) return `${row.currentPlanSubject === 'SVEN' ? 'Svenska' : 'Svenska som andraspråk'} enligt studieplanen`;
  if (!row.swedish.subject) return 'Svenskämne behöver bekräftas';
  if (row.swedish.subject === 'SVEN') return 'Svenska';
  return row.swedish.assessment === 'confirmed' ? 'Svenska som andraspråk' : 'SvA valt · målgruppsbedömning återstår';
}

export function swedishFollowUp(row: IntakeStudyRow | undefined) {
  if (!row) return false;
  return !row.swedish.subject && !row.currentPlanSubject && row.canSaveSwedish !== false || row.swedish.subject === 'SVEA' && row.swedish.assessment !== 'confirmed';
}

export function swedishGroupDisagrees(row: IntakeStudyRow | undefined) {
  const recorded = row?.swedish.subject ?? row?.currentPlanSubject;
  return !!row && !!recorded && row.groupSubjects.some(subject => subject !== recorded);
}

export type SwedishSubjectSave = IntakePupil & {
  action: 'save_swedish'; unitId: string; commandId: string; expectedRevision: number;
  subject: SwedishSubject; assessment: Assessment; effectiveOn: string;
};

export function swedishSubjectRequest(unitId: string, row: IntakeStudyRow, subject: SwedishSubject, assessment: Assessment, on: string): SwedishSubjectSave {
  return { action: 'save_swedish', unitId, pupilId: row.pupilId, placementId: row.placementId, expectedRevision: row.swedish.revision,
    subject, assessment, effectiveOn: row.swedish.effectiveOn ?? on, commandId: crypto.randomUUID() };
}

export default function PupilSwedishSubject({ unitId, pupilId, placementId, on, initial, enabled = true, disabled = false, returnTo, onSessionLost, onSaved, onRead }: IntakePupil & {
  unitId: string; on: string; initial?: IntakeStudyRead; enabled?: boolean; disabled?: boolean; returnTo: string; onSessionLost: () => void;
  onSaved: (row: IntakeStudyRow) => void; onRead?: (row: IntakeStudyRow) => void;
}) {
  const id = useId();
  const [info, setInfo] = useState<IntakeStudyRead | undefined>(initial);
  const [chosen, setChosen] = useState<SwedishSubject | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<SwedishSubjectSave | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfa, setMfa] = useState(false);
  const [saved, setSaved] = useState(false);
  const row = (revision === 0 && initial ? initial : info)?.rows.find(item => item.placementId === placementId);
  const choice = chosen || row?.swedish.subject || '';
  const assessment = choice === 'SVEA' ? confirmed || row?.swedish.subject === choice && row.swedish.assessment === 'confirmed' ? 'confirmed' : 'pending' : null;

  useEffect(() => {
    if (!enabled || initial && revision === 0) return;
    const abort = new AbortController();
    void api.post<unknown>(intakeStudyEndpoint, { action: 'read', unitId, pupils: [{ pupilId, placementId }], on }, abort.signal)
      .then(value => { if (!abort.signal.aborted) setInfo(parseStudyPlanIntakeRead(value)); })
      .catch(caught => { if (!abort.signal.aborted && caught instanceof ApiError && caught.status === 401) onSessionLost(); });
    return () => abort.abort();
  }, [enabled, initial, on, onSessionLost, placementId, pupilId, revision, unitId]);
  useEffect(() => { if (row && onRead) onRead(row); }, [onRead, row]);

  if (!row || !enabled) return null;
  const group = row.groupSubjects.length === 1 ? row.groupSubjects[0] : null;
  const changed = choice && (choice !== row.swedish.subject || assessment !== row.swedish.assessment);
  const canSave = row.canSaveSwedish !== false && row.plan.status !== 'current';
  const editable = canSave && (editing || !row.swedish.subject || row.swedish.assessment === 'pending');

  async function save(request: SwedishSubjectSave) {
    if (busy || disabled) return;
    setBusy(true); setError(''); setMfa(false); setSaved(false);
    try {
      const value = await api.post<{ row: unknown }>(intakeStudyEndpoint, request);
      const savedRow = parseStudyPlanIntakeRow(value.row);
      if (savedRow.pupilId !== pupilId || savedRow.placementId !== placementId) throw new Error('Unexpected pupil.');
      setInfo(previous => previous && { ...previous, rows: [savedRow] });
      setChosen(''); setConfirmed(false); setEditing(false); setPending(null); setSaved(true); onSaved(savedRow);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true);
      if (caught instanceof ApiError && caught.hasExplicitCode) {
        setPending(null);
        if (caught.status === 409) { setChosen(''); setConfirmed(false); setRevision(value => value + 1); }
        setError(caught.status === 409 ? 'Svenskämnet har ändrats. Läs uppgiften och granska igen.' : caught.message);
      } else {
        setPending(request);
        setError('Sparandet kunde inte bekräftas. Kontrollera samma begäran innan du fortsätter.');
      }
    } finally { setBusy(false); }
  }

  return <section className="min-w-0 space-y-3" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <div className="space-y-1">
      <h3 id={`${id}-title`} className="section-heading">Svenskämne</h3>
      <p className="text-sm">{swedishSubjectLabel(row)}</p>
    </div>
    {swedishGroupDisagrees(row) && <p className="validation-warning">Kontrollera gruppplaceringen. Det daterade gruppmedlemskapet skiljer sig från elevens val.</p>}
    {!row.swedish.subject && !row.currentPlanSubject && group && <p className="text-sm text-muted-foreground">Förslag från undervisningsgruppen · {group === 'SVEN' ? 'Svenska' : 'Svenska som andraspråk'}</p>}
    {row.swedish.subject === 'SVEA' && row.swedish.assessment === 'confirmed' && <p className="text-sm text-muted-foreground">Målgruppsbedömningen är bekräftad.</p>}
    {canSave && row.swedish.subject && !editing && <Button type="button" variant="ghost" disabled={disabled || busy || !!pending}
      onClick={() => { setSaved(false); setEditing(true); }}>Ändra svenskämne</Button>}
    {editable && <fieldset disabled={disabled || busy || !!pending} className="grid min-w-0 gap-2">
      {(!row.swedish.subject || editing) && <label className="grid gap-1" htmlFor={`${id}-choice`}>Elevens val
        <select id={`${id}-choice`} className="h-11 max-w-full rounded-md border border-input bg-background px-3" value={choice}
          onChange={event => { setChosen(event.target.value as SwedishSubject | ''); setConfirmed(false); }}>
          <option value="">Välj svenskämne</option><option value="SVEN">Svenska</option><option value="SVEA">Svenska som andraspråk</option>
        </select>
      </label>}
      {choice === 'SVEA' && (info?.canConfirmAssessment ? <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Målgruppsbedömningen är bekräftad
      </label> : <p className="text-sm text-muted-foreground">Rektor kan bekräfta målgruppsbedömningen.</p>)}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!choice || !changed} onClick={() => { if (choice) void save(swedishSubjectRequest(unitId, row, choice, assessment, on)); }}>
        {row.swedish.subject && !editing ? 'Spara bedömning' : 'Spara elevens val'}
      </Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(false); setConfirmed(false); setChosen(''); }}>Avbryt ändring</Button>}</div>
    </fieldset>}
    {saved && <output className="text-sm">Svenskämnet har sparats.</output>}
    {mfa ? <MfaStepUpNotice message="Verifiera med engångskod för att spara svenskämnet." returnTo={returnTo} /> : error && <p role="alert" className="validation-warning">{error}</p>}
    {pending && <Button type="button" variant="outline" disabled={busy} onClick={() => void save(pending)}>Kontrollera sparandet</Button>}
  </section>;
}
