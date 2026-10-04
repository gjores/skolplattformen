'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseProgramplanLifecycleReply, programplanPhaseLabel, type ProgramplanLifecycle, type ProgramplanLifecycleCommand,
  type ProgramplanLifecycleReply } from '@/lib/programplan-lifecycle.ts';
import MfaStepUpNotice from './mfa-step-up';

/** Statusmärke. Visar bara serverns lifecycle, räknar aldrig själv. */
export function LifecycleBadge({ lifecycle }: { lifecycle: ProgramplanLifecycle }) {
  const label = programplanPhaseLabel[lifecycle.phase];
  return <span className={`ppl-status ppl-phase ppl-phase-${lifecycle.phase}`} data-phase={lifecycle.phase} data-archived={lifecycle.archived}
    title={lifecycle.startsOn ? `Kullens start ${lifecycle.startsOn}` : 'Kullens start saknas'}>{lifecycle.archived ? `Arkiverad · ${label}` : label}</span>;
}

export type LifecycleTarget = { offeringId: string; name: string; cohort: string; versions: number; lifecycle: ProgramplanLifecycle };
type Props = {
  target: LifecycleTarget; onClose: () => void;
  /** Lyckad ändring. Anroparen läser om innan något nytt kan skickas. */
  onChanged: (message: string, reply: ProgramplanLifecycleReply) => void;
  /** MFA, konflikt eller okänt svar: läs om listan och visa beskedet. */
  onStale: (message: string) => void;
  onSecurityFailure: (error: unknown) => boolean;
};

/** Ta bort en framtida programplan med uttrycklig bekräftelse. */
export function DeleteEducationDialog({ target, onClose, onChanged, onStale, onSecurityFailure }: Props) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [mfa, setMfa] = useState(false), [error, setError] = useState<string | null>(null);
  const versions = target.versions === 1 ? '1 version' : `${target.versions} versioner`;
  // Efter MFA-avslag läses listan om innan något nytt kan skickas.
  const close = () => mfa ? onStale('Inget togs bort. Verifiera med engångskod och försök sedan igen.') : onClose();
  async function submit() {
    if (busy || !confirmed || mfa) return;
    const command: ProgramplanLifecycleCommand = { offeringId: target.offeringId, expectedRevision: target.lifecycle.revision, command: 'delete', details: {} };
    setBusy(true); setError(null);
    try {
      const reply = parseProgramplanLifecycleReply(await api.post('/api/programplaner/utbildning/livscykel', command), command);
      onChanged(`${target.name} (${target.cohort}) togs bort.`, reply);
    } catch (e) {
      if (onSecurityFailure(e)) return;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') setMfa(true);
      else if (e instanceof ApiError && e.hasExplicitCode && e.status === 400) setError(`Kunde inte ta bort. ${e.message}`);
      else if (e instanceof ApiError && e.hasExplicitCode && e.status === 409) onStale(e.message);
      else onStale('Borttagningen kunde inte bekräftas. Listan har lästs om; kontrollera om utbildningen finns kvar innan du försöker igen.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="pp-dialog ppl-lifecycle-dialog" showCloseButton={!busy}>
      <DialogTitle>Ta bort programplanen?</DialogTitle>
      <DialogDescription>Utbildningen och alla dess versioner tas bort permanent. Det går bara för en plan vars elevkull inte har börjat. Händelsen sparas i loggen.</DialogDescription>
      <dl className="pp-review"><dt>Utbildning</dt><dd>{target.name}</dd><dt>Elevkull</dt><dd>{target.cohort}</dd><dt>Versioner</dt><dd>{versions}</dd></dl>
      {error && <p role="alert" className="pp-alert">{error}</p>}
      {mfa ? <MfaStepUpNotice message="Borttagning kräver verifiering med engångskod." detail="Inget har tagits bort. Listan läses om; välj Ta bort igen efter verifieringen."/>
        : <label className="pp-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/><span>Jag förstår att {target.name} och {versions} tas bort och inte kan återställas.</span></label>}
      <div className="pp-dialog-actions"><Button variant="outline" disabled={busy} onClick={close}>Avbryt</Button>
        <Button variant="destructive" disabled={busy || !confirmed || mfa} onClick={() => void submit()}>{busy ? 'Tar bort…' : 'Ta bort'}</Button></div>
    </DialogContent>
  </Dialog>;
}
