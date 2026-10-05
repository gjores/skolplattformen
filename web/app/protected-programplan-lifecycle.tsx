'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseProgramplanLifecycleReply, programplanPhaseLabel, programplanSchoolActions, startsAfter, stockholmToday, type ProgramplanLifecycle, type ProgramplanLifecycleCommand,
  type ProgramplanLifecycleReply } from '@/lib/programplan-lifecycle.ts';
import { parseProgramplanSelection, type ProgramplanSelection } from '@/lib/programplan-education-contract.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
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
export type LifecycleDialogKind = 'delete' | 'archive' | 'restore' | 'update' | 'units';
type Props = {
  kind: LifecycleDialogKind; target: LifecycleTarget; onClose: () => void;
  /** Lyckad ändring. Anroparen läser om innan något nytt kan skickas. */
  onChanged: (message: string, reply: ProgramplanLifecycleReply) => void;
  /** MFA, konflikt eller okänt svar: läs om listan och visa beskedet. */
  onStale: (message: string) => void;
  onSecurityFailure: (error: unknown) => boolean;
};
const TITLES: Record<LifecycleDialogKind, string> = { delete: 'Ta bort programplanen?', archive: 'Arkivera programplanen?', restore: 'Ta fram programplanen ur arkivet?', update: 'Ändra uppgifter', units: 'Skolor' };
const ACTION: Record<LifecycleDialogKind, string> = { delete: 'Ta bort', archive: 'Arkivera', restore: 'Ta fram ur arkivet', update: 'Spara uppgifter', units: 'Spara skolor' };
const BUSY: Record<LifecycleDialogKind, string> = { delete: 'Tar bort…', archive: 'Arkiverar…', restore: 'Tar fram…', update: 'Sparar…', units: 'Sparar…' };

/** Skolvalet hämtas från huvudmannens mandatavgränsade val-API. */
function SchoolsDialog({ target, onClose, onChanged, onStale, onSecurityFailure }: Omit<Props, 'kind'>) {
  const [schools, setSchools] = useState<ProgramplanSelection['units'] | null>(null);
  const initial = useMemo(() => target.lifecycle.units.map(u => u.id), [target.lifecycle.units]);
  const [selected, setSelected] = useState(initial), [busy, setBusy] = useState(false), [mfa, setMfa] = useState(false), [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dirty = initial.length !== selected.length || initial.some(id => !selected.includes(id));
  useUnsavedChanges(`programplan-schools-${target.offeringId}`, dirty || busy);
  useEffect(() => {
    const controller = new AbortController();
    const input = { unitId: null, catalogId: null, programRef: null };
    void api.post('/api/programplaner/val', input, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const choices = parseProgramplanSelection(value, input);
      if (!choices.canCreateEducation || initial.some(id => !choices.units.some(u => u.id === id))) throw new Error('Skolornas mandat har ändrats. Läs om planen.');
      setSchools(choices.units);
    }).catch(e => {
      if (controller.signal.aborted || onSecurityFailure(e)) return;
      setLoadError(true); setError(e instanceof ApiError ? e.message : 'Skolorna kunde inte hämtas. Stäng rutan och läs om planen.');
    });
    return () => controller.abort();
    // Target is immutable for this mounted dialog; a fresh workspace remounts it.
  }, [target.offeringId, initial, onSecurityFailure]);
  const actions = programplanSchoolActions(target.lifecycle, 'huvudman');
  const close = () => { if (busy) return; if (mfa) onStale('Inget har ändrats. Verifiera med engångskod och försök sedan igen.'); else if (!dirty || confirmDiscard()) onClose(); };
  async function submit() {
    if (busy || !schools || loadError || mfa || !dirty || !actions.add) return;
    const own: ProgramplanLifecycleCommand = { offeringId: target.offeringId, expectedRevision: target.lifecycle.revision, command: 'units', details: { unitIds: selected } };
    setBusy(true); setError(null);
    try {
      const reply = parseProgramplanLifecycleReply(await api.post('/api/programplaner/utbildning/livscykel', own), own);
      onChanged('Skolorna sparades. Samma programplan visas på alla valda skolor.', reply);
    } catch (e) {
      if (onSecurityFailure(e)) return;
      if (e instanceof ApiError && e.hasExplicitCode && e.code === 'mfa_required') setMfa(true);
      else if (e instanceof ApiError && e.hasExplicitCode && e.status === 400) setError(`Kunde inte spara skolorna. ${e.message}`);
      else onStale(e instanceof ApiError && e.hasExplicitCode && e.status === 409 ? e.message : 'Skolvalet kunde inte bekräftas. Listan har lästs om; kontrollera skolorna innan du försöker igen.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="pp-dialog ppl-lifecycle-dialog" showCloseButton={!busy}>
    <DialogTitle>Skolor</DialogTitle><DialogDescription>Välj vilka skolor som använder {target.name}. De ser samma versioner och innehåll.</DialogDescription>
    <section aria-label="Skolor">
      {!schools && !loadError && <output>Hämtar skolor…</output>}
      {schools?.map(school => {
        const primary = target.lifecycle.units.some(u => u.id === school.id && u.primary), originallySelected = initial.includes(school.id);
        return <label className="pp-check" key={school.id}><input type="checkbox" checked={selected.includes(school.id)}
          disabled={busy || mfa || primary || !actions.add || originallySelected && !actions.remove || !selected.includes(school.id) && selected.length >= 100}
          onChange={e => setSelected(ids => e.target.checked ? [...ids, school.id] : ids.filter(id => id !== school.id))}/>
          <span>{school.name}{primary && <small> · Skapad här</small>}</span></label>;
      })}
      {!actions.remove && <p>Skolan kan inte tas bort när kullen har börjat</p>}
      <p>Klasser, elevplaceringar och timplaner hör tills vidare bara till skolan där utbildningen skapades.</p>
    </section>
    {error && <p className="pp-alert" role="alert">{error}</p>}
    {mfa && <MfaStepUpNotice message="Skolvalet kräver verifiering med engångskod." detail="Inget har ändrats. Läs om planen efter verifieringen."/>}
    <div className="pp-dialog-actions"><Button variant="outline" disabled={busy} onClick={close}>Avbryt</Button><Button disabled={busy || !schools || loadError || mfa || !dirty || !actions.add} onClick={() => void submit()}>{busy ? 'Sparar…' : 'Spara skolor'}</Button></div>
  </DialogContent></Dialog>;
}

/** Huvudmannens livscykeldialoger: ta bort, arkivera, ta fram och ändra uppgifter. */
export function LifecycleDialog(props: Props) {
  return props.kind === 'units' ? <SchoolsDialog {...props}/> : <EducationLifecycleDialog {...props} kind={props.kind}/>;
}
function EducationLifecycleDialog({ kind, target, onClose, onChanged, onStale, onSecurityFailure }: Props & { kind: Exclude<LifecycleDialogKind, 'units'> }) {
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
