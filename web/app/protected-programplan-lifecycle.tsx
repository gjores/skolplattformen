'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseProgramplanLifecycleReply, programplanPhaseLabel, startsAfter, stockholmToday, type ProgramplanLifecycle, type ProgramplanLifecycleCommand,
  type ProgramplanLifecycleReply } from '@/lib/programplan-lifecycle.ts';
import MfaStepUpNotice from './mfa-step-up';

/** Statusmärke. Visar bara serverns lifecycle, räknar aldrig själv. */
export function LifecycleBadge({ lifecycle }: { lifecycle: ProgramplanLifecycle }) {
  const label = programplanPhaseLabel[lifecycle.phase];
  return <span className={`ppl-status ppl-phase ppl-phase-${lifecycle.archived ? 'arkiverad' : lifecycle.phase}`} data-phase={lifecycle.phase} data-archived={lifecycle.archived}
    title={lifecycle.startsOn ? `Kullens start ${lifecycle.startsOn}` : 'Kullens start saknas'}>{lifecycle.archived ? `Arkiverad · ${label}` : label}</span>;
}

export type LifecycleTarget = {
  offeringId: string; name: string; cohort: string; localCode: string | null; versions: number; lifecycle: ProgramplanLifecycle;
  /** Startdatum får ändras bara när utbildningen har en enda version som är ett bundet utkast. */
  startEditable: boolean;
};
export type LifecycleDialogKind = 'delete' | 'archive' | 'restore' | 'update';
type Props = {
  kind: LifecycleDialogKind; target: LifecycleTarget; onClose: () => void;
  /** Lyckad ändring. Anroparen läser om innan något nytt kan skickas. */
  onChanged: (message: string, reply: ProgramplanLifecycleReply) => void;
  /** MFA, konflikt eller okänt svar: läs om listan och visa beskedet. */
  onStale: (message: string) => void;
  onSecurityFailure: (error: unknown) => boolean;
};
const TITLES: Record<LifecycleDialogKind, string> = { delete: 'Ta bort programplanen?', archive: 'Arkivera programplanen?', restore: 'Ta fram programplanen ur arkivet?', update: 'Ändra uppgifter' };
const ACTION: Record<LifecycleDialogKind, string> = { delete: 'Ta bort', archive: 'Arkivera', restore: 'Ta fram ur arkivet', update: 'Spara uppgifter' };
const BUSY: Record<LifecycleDialogKind, string> = { delete: 'Tar bort…', archive: 'Arkiverar…', restore: 'Tar fram…', update: 'Sparar…' };

/** Huvudmannens livscykeldialoger: ta bort, arkivera, ta fram och ändra uppgifter. */
export function LifecycleDialog({ kind, target, onClose, onChanged, onStale, onSecurityFailure }: Props) {
  const [confirmed, setConfirmed] = useState(kind === 'update'), [busy, setBusy] = useState(false), [mfa, setMfa] = useState(false), [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(target.name), [cohort, setCohort] = useState(target.cohort), [localCode, setLocalCode] = useState(target.localCode ?? '');
  const [startedOn, setStartedOn] = useState(target.lifecycle.startsOn ?? '');
  const versions = target.versions === 1 ? '1 version' : `${target.versions} versioner`;
  const today = stockholmToday(), startChanged = target.startEditable && startedOn !== (target.lifecycle.startsOn ?? '');
  const detailsValid = !!name.trim() && !!cohort.trim() && (!startChanged || startsAfter(startedOn, today));
  // Efter MFA-avslag läses listan om innan något nytt kan skickas.
  const close = () => mfa ? onStale('Inget har ändrats. Verifiera med engångskod och försök sedan igen.') : onClose();
  function command(): ProgramplanLifecycleCommand {
    const base = { offeringId: target.offeringId, expectedRevision: target.lifecycle.revision };
    return kind === 'update'
      ? { ...base, command: 'update', details: { name: name.trim(), localCode: localCode.trim() || null, cohort: cohort.trim(), startedOn: startChanged ? startedOn : null } }
      : { ...base, command: kind, details: {} };
  }
  async function submit() {
    if (busy || !confirmed || mfa || kind === 'update' && !detailsValid) return;
    const own = command();
    setBusy(true); setError(null);
    try {
      const reply = parseProgramplanLifecycleReply(await api.post('/api/programplaner/utbildning/livscykel', own), own);
      const label = `${target.name} (${target.cohort})`;
      onChanged(kind === 'delete' ? `${label} togs bort.` : kind === 'archive' ? `${label} arkiverades. Den visas under Visa arkiverade.`
        : kind === 'restore' ? `${label} togs fram ur arkivet.` : 'Uppgifterna sparades.', reply);
    } catch (e) {
      if (onSecurityFailure(e)) return;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') setMfa(true);
      else if (e instanceof ApiError && e.hasExplicitCode && e.status === 400) setError(`Kunde inte spara. ${e.message}`);
      else if (e instanceof ApiError && e.hasExplicitCode && e.status === 409) onStale(e.message);
      else onStale('Ändringen kunde inte bekräftas. Listan har lästs om; kontrollera resultatet innan du försöker igen.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="pp-dialog ppl-lifecycle-dialog" showCloseButton={!busy}>
      <DialogTitle>{TITLES[kind]}</DialogTitle>
      <DialogDescription>{kind === 'delete' ? 'Utbildningen och alla dess versioner tas bort permanent. Det går bara för en plan vars elevkull inte har börjat. Händelsen sparas i loggen.'
        : kind === 'archive' ? 'Planen döljs i listan men versioner, beslut och historik bevaras. Den kan inte ändras medan den är arkiverad.'
        : kind === 'restore' ? 'Planen visas åter bland övriga planer. Vad som får ändras avgörs av kullens start.'
        : 'Namn, lokal kod och elevkull kan ändras så länge elevkullen inte har börjat.'}</DialogDescription>
      {kind !== 'update' && <dl className="pp-review"><dt>Utbildning</dt><dd>{target.name}</dd><dt>Elevkull</dt><dd>{target.cohort}</dd><dt>Versioner</dt><dd>{versions}</dd></dl>}
      {kind === 'update' && <div className="pp-new-fields">
        <div className="pp-field"><label htmlFor="ppl-edit-name">Utbildningens namn</label><input id="ppl-edit-name" value={name} maxLength={120} disabled={busy || mfa} onChange={e => setName(e.target.value)}/></div>
        <div className="pp-field"><label htmlFor="ppl-edit-cohort">Elevkull</label><input id="ppl-edit-cohort" value={cohort} maxLength={120} disabled={busy || mfa} onChange={e => setCohort(e.target.value)}/></div>
        <div className="pp-field"><label htmlFor="ppl-edit-code">Lokal kod (valfri)</label><input id="ppl-edit-code" value={localCode} maxLength={80} disabled={busy || mfa} onChange={e => setLocalCode(e.target.value)}/></div>
        {target.startEditable ? <div className="pp-field"><label htmlFor="ppl-edit-start">Utbildningens exakta startdatum</label><input id="ppl-edit-start" type="date" min={nextDay(today)} value={startedOn} disabled={busy || mfa} aria-invalid={startChanged && !startsAfter(startedOn, today)} onChange={e => setStartedOn(e.target.value)}/>
          <p>{startChanged && !startsAfter(startedOn, today) ? 'Startdatumet måste ligga efter i dag.' : 'Kan ändras så länge planen bara har ett utkast.'}</p></div>
          : <p className="pp-field">Startdatum: {target.lifecycle.startsOn ?? 'saknas'}. Det kan bara ändras när utbildningen har en enda version som är ett utkast.</p>}
      </div>}
      {error && <p role="alert" className="pp-alert">{error}</p>}
      {mfa ? <MfaStepUpNotice message="Åtgärden kräver verifiering med engångskod." detail="Inget har ändrats. Listan läses om när du stänger rutan; välj åtgärden igen efter verifieringen."/>
        : kind !== 'update' && <label className="pp-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/><span>{kind === 'delete'
          ? `Jag förstår att ${target.name} och ${versions} tas bort och inte kan återställas.` : kind === 'archive' ? `Arkivera ${target.name}.` : `Ta fram ${target.name} ur arkivet.`}</span></label>}
      <div className="pp-dialog-actions"><Button variant="outline" disabled={busy} onClick={close}>Avbryt</Button>
        <Button variant={kind === 'delete' ? 'destructive' : 'default'} disabled={busy || !confirmed || mfa || kind === 'update' && !detailsValid} onClick={() => void submit()}>{busy ? BUSY[kind] : ACTION[kind]}</Button></div>
    </DialogContent>
  </Dialog>;
}
/** Första tillåtna startdag (i morgon), för datumfältens min-värde. */
export function nextDay(date: string): string { return new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10); }
