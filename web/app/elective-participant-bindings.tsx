'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError, onEpochChange } from '@/lib/server-client.ts';
import { onSessionMessage, shouldLock } from '@/lib/session-channel.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ElectivePupil } from '@/lib/elective-block-contract.ts';
import { createBindingCommandRef, parseBindingCommand, parseBindingCommandRef, parseBindingRead, parseBindingReply, parseBindingStatusReply,
  type BindingCommand, type BindingCommandRef, type ElectiveBinding } from '@/lib/elective-self-contract.ts';
import './elective-staff-tools.css';
import MfaStepUpNotice from './mfa-step-up';

type Props = { unitId: string; schoolYear: number; scopeKey: string; pupils: ElectivePupil[]; disabled?: boolean; onSessionLost: () => void };
type Draft = { id: string; revision: number; identityId: string; participant: '' | 'pupil' | 'guardian'; confirmationRequired: boolean; startsOn: string; endsOn: string; sourceReference: string; attested: boolean };
const BASE = '/api/valbara-block/bindningar';
function errorText(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'Kopplingen eller behörigheten har ändrats. Läs om uppgifterna och granska på nytt.';
  if (error instanceof ApiError && error.status === 400) return 'Kontrollera kontoreferens, roll, giltighet och skolans underlagsreferens.';
  return 'Sparandet kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.';
}
export default function ElectiveParticipantBindings(props: Props) {
  return <Bindings key={`${props.scopeKey}:${props.unitId}:${props.schoolYear}`} {...props}/>;
}
function Bindings({ unitId, schoolYear, scopeKey, pupils, disabled = false, onSessionLost }: Props) {
  const id = useId(), journalKey = `elective-binding-status:${scopeKey}:${unitId}:${schoolYear}`;
  const [pending, setPending] = useState<BindingCommandRef | null>(() => {
    try { const raw = window.sessionStorage.getItem(journalKey); if (!raw) return null; const ref = parseBindingCommandRef(JSON.parse(raw)); return ref.unitId === unitId ? ref : null; } catch { return null; }
  });
  const [selected, setSelected] = useState(() => pending && pupils.some(pupil => pupil.id === pending.pupilId) ? pending.pupilId : '');
  const [search, setSearch] = useState(''), [bindings, setBindings] = useState<ElectiveBinding[]>([]), [loaded, setLoaded] = useState(false), [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null), [revoke, setRevoke] = useState<ElectiveBinding | null>(null);
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [review, setReview] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const alive = useRef(true), submitting = useRef(false), selectedRef = useRef(selected), lostRef = useRef(onSessionLost);
  useLayoutEffect(() => { selectedRef.current = selected; lostRef.current = onSessionLost; }, [selected, onSessionLost]);
  const blocked = disabled || busy || locked || pending !== null;
  const eligible = pupils.some(pupil => pupil.id === selected);
  useUnsavedChanges(`elective-bindings-editor:${id}`, draft !== null || revoke !== null);
  useUnsavedChanges(`navigation-block:elective-bindings:${id}`, busy || pending !== null);
  function loseSession() { alive.current = false; setLocked(true); setBusy(false); setPending(null); setBindings([]); setDraft(null); setRevoke(null); setError('Inloggningen eller uppdraget har ändrats. Öppna skolan på nytt.'); lostRef.current(); }
  useEffect(() => { alive.current = true; const stop = onEpochChange(() => loseSession()), stopChannel = onSessionMessage(message => { if(shouldLock({knownEpoch:null},message).lock)loseSession(); }); return () => { alive.current = false; stop(); stopChannel(); }; }, []);
  const load = useCallback(async (pupilId: string, signal?: AbortSignal) => {
    const scope = { unitId, pupilId }, next = parseBindingRead(await api.post(`${BASE}/lasa`, scope, signal), scope);
    if (alive.current && !signal?.aborted && selectedRef.current === pupilId) { setBindings(next.bindings); setLoaded(true); setMfa(false); }
  }, [unitId]);
  useEffect(() => {
    if (!selected || locked) return;
    const controller = new AbortController();
    void load(selected, controller.signal).catch(caught => {
      if (controller.signal.aborted || !alive.current) return;
      if (caught instanceof ApiError && caught.code === 'mfa_required') { setMfa(true); setError('Verifiera med engångskod för att fortsätta.'); }
      else if (caught instanceof ApiError && [401, 403].includes(caught.status)) loseSession();
      else setError('Kontokopplingarna kunde inte hämtas. Försök igen.');
    });
    return () => controller.abort();
  }, [selected, retry, load, locked]);
  function journal(ref: BindingCommandRef | null) {
    if (ref) window.sessionStorage.setItem(journalKey, JSON.stringify(ref)); else { try { window.sessionStorage.removeItem(journalKey); } catch { /* Ett kvarvarande ref kan bara återkontrollera samma kvitto. */ } }
    setPending(ref);
  }
  function done() { journal(null); setDraft(null); setRevoke(null); setReview(false); setFeedback('Kontokopplingen är sparad.'); }
  async function send(command: BindingCommand) {
    if (blocked || submitting.current || !eligible) return;
    submitting.current = true; setBusy(true); setError(null); setFeedback(null);
    let sent = false, acknowledged = false;
    try {
      const input = parseBindingCommand(command), ref = await createBindingCommandRef(input);
      if (!alive.current) return;
      journal(ref); sent = true;
      const raw = await api.post(`${BASE}/kommando`, input);
      if (!alive.current) return;
      parseBindingReply(raw, input); acknowledged = true; done(); await load(input.pupilId);
    } catch (caught) {
      if (!alive.current) return;
      if (acknowledged) { savedReadFailed(caught); return; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') { journal(null); setMfa(true); setError('Verifiera med engångskod för att fortsätta.'); }
      else if (caught instanceof ApiError && [401, 403].includes(caught.status)) loseSession();
      else {
        if (!sent || caught instanceof ApiError && [400, 409].includes(caught.status)) { journal(null); if (caught instanceof ApiError && caught.status === 409) { setReview(true); void load(command.pupilId).catch(() => {}); } }
        setError(errorText(caught));
      }
    } finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  function savedReadFailed(caught: unknown) {
    setLoaded(false); setBindings([]);
    if (caught instanceof ApiError && [401, 403].includes(caught.status) && caught.code !== 'mfa_required') { loseSession(); return; }
    if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true);
    setError('Kontokopplingen är sparad, men listan kunde inte läsas. Hämta kontokopplingarna igen.');
  }
  async function checkStatus() {
    if (!pending || busy || disabled || locked || submitting.current) return;
    let acknowledged = false;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await parseBindingStatusReply(await api.post(`${BASE}/status`, pending), pending);
      if (!alive.current) return;
      if (result.status === 'done') { acknowledged = true; done(); if (selectedRef.current === pending.pupilId) await load(pending.pupilId); }
      else { journal(null); setReview(true); setError('Inget sparat kvitto hittades. Läs om kopplingarna och granska underlaget innan du skickar igen.'); }
    } catch (caught) {
      if (!alive.current) return;
      if (acknowledged) { savedReadFailed(caught); return; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') { setMfa(true); setError('Verifiera med engångskod för att fortsätta.'); }
      else if (caught instanceof ApiError && [401, 403].includes(caught.status)) loseSession(); else setError(errorText(caught));
    } finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  function start(binding?: ElectiveBinding) {
    if (blocked || (draft || revoke) && !confirmDiscard()) return;
    setReview(false); setRevoke(null); setFeedback(null); setError(null);
    setDraft(binding ? { ...binding, endsOn: binding.endsOn ?? '', attested: false } : { id: crypto.randomUUID(), revision: 0, identityId: '', participant: '', confirmationRequired: false, startsOn: `${schoolYear}-07-01`, endsOn: `${schoolYear + 1}-06-30`, sourceReference: '', attested: false });
  }
  function save() {
    if (!draft || !draft.attested || review) return;
    try { const command = parseBindingCommand({ unitId, pupilId: selected, commandId: crypto.randomUUID(), expectedRevision: draft.revision, action: 'save_binding', payload: { id: draft.id, identityId: draft.identityId.trim().toLowerCase(), participant: draft.participant, confirmationRequired: draft.participant === 'guardian' && draft.confirmationRequired, startsOn: draft.startsOn, endsOn: draft.endsOn || null, sourceReference: draft.sourceReference.trim() } }); void send(command); }
    catch { setError('Kontrollera kontoreferens, kontotyp, giltiga datum och underlag för skolans kontroll.'); }
  }
  const patch = (value: Partial<Draft>) => draft && setDraft({ ...draft, ...value });
  if(locked)return <section className="elective-card"><h2>Kontokopplingar för elevval</h2><p role="alert">{error}</p></section>;
  return <section className="elective-card" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Kontokopplingar för elevval</h2>
    <p className="elective-muted">Eleven eller vårdnadshavaren hittar sin kontoreferens på sidan Mina val efter inloggning. Skolan kontrollerar identiteten och registrerar underlaget för kopplingen.</p>
    {mfa && <MfaStepUpNotice message="Verifiera inloggningen för att hantera kontokopplingar." detail="Osparade uppgifter följer inte med." returnTo="/?vy=valbara"/>}
    {error && !mfa && <div role="alert" className="elective-error">{error}</div>}{feedback && <output>{feedback}</output>}
    {pending && <div><output>Sparstatus behöver kontrolleras innan du fortsätter.</output><Button variant="outline" disabled={disabled || busy || locked} onClick={() => void checkStatus()}>Kontrollera sparstatus</Button></div>}
    <div className="elective-fields"><label>Sök elev för kontokoppling<input type="search" value={search} disabled={blocked} onChange={event => setSearch(event.target.value)}/></label>
      <label>Elev för kontokoppling<select value={selected} disabled={blocked} onChange={event => { if ((draft || revoke) && !confirmDiscard()) return; setDraft(null); setRevoke(null); setReview(false); setBindings([]); setLoaded(false); setError(null); setFeedback(null); setSelected(event.target.value); }}><option value="">Välj elev</option>{pupils.filter(pupil => pupil.id === selected || pupil.name.toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv'))).map(pupil => <option key={pupil.id} value={pupil.id}>{pupil.name}</option>)}</select></label></div>
    {selected && !loaded && !locked && <Button disabled={busy} variant="outline" onClick={() => { setError(null); setRetry(value => value + 1); }}>Hämta kontokopplingar</Button>}
    {eligible && loaded && !locked && <>
      <div className="elective-list">{bindings.length === 0 && <p>Inga kontokopplingar för eleven.</p>}{bindings.map(binding => <article key={binding.id} className="elective-binding-entry"><div><strong>{binding.participant === 'guardian' ? 'Vårdnadshavarkonto' : 'Elevkonto'}</strong><p>Kontoreferens: <code className="elective-account-reference">{binding.identityId}</code></p><p>{binding.startsOn} – {binding.endsOn ?? 'tills vidare'}{binding.revokedAt ? ' · Avslutad' : ''}</p>{binding.participant === 'guardian' && <p>{binding.confirmationRequired ? 'Ska lämna VH-bekräftelse när skolans inställning kräver det.' : 'Ingår inte bland dem som måste bekräfta.'}</p>}<small>Underlag: {binding.sourceReference}</small></div>
        {!binding.revokedAt && <div className="elective-toolbar"><Button variant="outline" disabled={blocked} onClick={() => start(binding)}>Ändra koppling</Button><Button variant="ghost" disabled={blocked} onClick={() => { if ((draft || revoke) && !confirmDiscard()) return; setDraft(null); setRevoke(binding); }}>Avsluta koppling</Button></div>}</article>)}</div>
      <Button variant="outline" disabled={blocked} onClick={() => start()}>Lägg till kontokoppling</Button>
    </>}
    {revoke && <div className="elective-card"><p>Avsluta kopplingen för {revoke.participant === 'guardian' ? 'vårdnadshavarkontot' : 'elevkontot'}? Kontot får därefter inte använda den här kopplingen för elevens val.</p><Button disabled={blocked || review} onClick={() => void send({ unitId, pupilId: selected, commandId: crypto.randomUUID(), expectedRevision: revoke.revision, action: 'revoke_binding', payload: { id: revoke.id } })}>Bekräfta avslut</Button><Button variant="ghost" disabled={blocked} onClick={() => setRevoke(null)}>Avbryt avslut</Button></div>}
    {draft && <form onSubmit={event => { event.preventDefault(); save(); }} className="elective-card"><h3>{draft.revision ? 'Ändra kontokoppling' : 'Ny kontokoppling'}</h3><fieldset disabled={blocked || review || !eligible}>
      <div className="elective-fields"><label>Kontoreferens<input required value={draft.identityId} maxLength={36} autoComplete="off" onChange={event => patch({ identityId: event.target.value })}/></label>
        <label>Kontotyp<select required value={draft.participant} onChange={event => patch({ participant: event.target.value as Draft['participant'], confirmationRequired: false })}><option value="">Välj kontotyp</option><option value="pupil">Elev</option><option value="guardian">Vårdnadshavare</option></select></label>
        <label>Gäller från<input required type="date" value={draft.startsOn} onChange={event => patch({ startsOn: event.target.value })}/></label><label>Gäller till (tomt = tills vidare)<input type="date" value={draft.endsOn} min={draft.startsOn} onChange={event => patch({ endsOn: event.target.value })}/></label>
        <label>Underlag för skolans kontroll<input required maxLength={120} value={draft.sourceReference} onChange={event => patch({ sourceReference: event.target.value })}/></label></div>
      {draft.participant === 'guardian' && <label className="elective-choice"><input type="checkbox" checked={draft.confirmationRequired} onChange={event => patch({ confirmationRequired: event.target.checked })}/>Den här vårdnadshavaren ska bekräfta när skolan kräver VH-bekräftelse</label>}
      <label className="elective-choice"><input type="checkbox" required checked={draft.attested} onChange={event => patch({ attested: event.target.checked })}/>Skolan har kontrollerat att kontot tillhör rätt person och att rollen är styrkt</label>
    </fieldset><div className="elective-toolbar"><Button type="submit" disabled={blocked || review || !eligible || !draft.attested}>Spara kontokoppling</Button><Button type="button" variant="ghost" disabled={blocked} onClick={() => { setDraft(null); setReview(false); setRetry(value => value + 1); }}>Avbryt redigering och läs om</Button></div></form>}
  </section>;
}
