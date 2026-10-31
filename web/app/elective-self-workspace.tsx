'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError, onEpochChange, setKnownEpoch } from '@/lib/server-client.ts';
import { announce, onSessionMessage, shouldLock } from '@/lib/session-channel.ts';
import { UnsavedChangesProvider, useUnsavedChanges, useHasUnsaved, confirmDiscard } from '@/lib/unsaved-changes.tsx';
import { createSelfCommandRef, parseSelfCommand, parseSelfCommandRef, parseSelfIndex, parseSelfRead, parseSelfReceipt, parseSelfStatus,
  type SelfIndex, type SelfRead, type SelfOffer, type SelfParticipant, type SelfCommand, type SelfCommandRef } from '@/lib/elective-self-contract.ts';
import { programplanLanguageName } from '@/lib/programplan-languages.ts';
import type { ElectiveChoice } from '@/lib/elective-block-contract.ts';
import ElectiveChoiceForm from './elective-choice-form';
import { formatTime } from './tjanst-service-summary';
import './elective-blocks.css';

const STATE: Record<string, string> = { stale_offer: 'Erbjudandet har ändrats. Kontakta skolan.', policy_missing: 'Skolan behöver komplettera valomgången.', guardian_bindings_missing: 'Skolan behöver kontrollera kopplingen till vårdnadshavare.', guardian_declined: 'Vårdnadshavare har avböjt valet.', awaiting_guardian: 'Väntar på vårdnadshavarens bekräftelse.', ready_for_confirmation: 'Valet är inlämnat och väntar på skolans bekräftelse.', confirmed: 'Skolan har bekräftat valet.' };
const BASE = '/api/valbara-block/egen';
// Inloggningens API måste navigeras med en vanlig GET som kan sätta sessionscookies.
const LOGIN_URL = '/api/auth/login?till=%2Fval';
const scopeOf = (person: SelfParticipant) => ({ unitId: person.unitId, pupilId: person.pupilId, participant: person.participant });
export default function ElectiveSelfWorkspace() { return <UnsavedChangesProvider><Workspace/></UnsavedChangesProvider>; }
function Workspace() {
  const [index, setIndex] = useState<SelfIndex | null>(null), [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null), [login, setLogin] = useState(false), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const epoch = useRef<number | null>(null), indexRequest = useRef<AbortController | null>(null), generation = useRef(0);
  const navigationBlocked = useHasUnsaved('navigation-block:'), dirty = useHasUnsaved();
  function lock(text: string, requireLogin = false) { generation.current++; indexRequest.current?.abort(); setIndex(null); setSelected(''); setError(text); setLogin(requireLogin); }
  useEffect(() => {
    const controller = new AbortController(), token = ++generation.current; indexRequest.current = controller;
    void api.get(`${BASE}/urval`, controller.signal).then(raw => {
      if (controller.signal.aborted || token !== generation.current) return;
      const next = parseSelfIndex(raw); epoch.current = next.epoch; setKnownEpoch(next.epoch); setIndex(next); setError(null); setLogin(false);
      if (next.participants.length === 1) setSelected(next.participants[0].bindingId);
    }).catch(caught => {
      if (controller.signal.aborted || token !== generation.current) return;
      lock(caught instanceof ApiError && caught.status === 401 ? 'Logga in för att se dina val.' : 'Dina val kunde inte hämtas. Försök igen.', caught instanceof ApiError && caught.status === 401);
    });
    return () => { controller.abort(); if (indexRequest.current === controller) indexRequest.current = null; };
  }, [retry]);
  useEffect(() => {
    const stopChannel = onSessionMessage(message => { if (shouldLock({ knownEpoch: epoch.current }, message).lock) lock('Inloggningen har ändrats. Hämta dina val igen.'); });
    const stopEpoch = onEpochChange(() => lock('Inloggningen har ändrats. Hämta dina val igen.'));
    return () => { stopChannel(); stopEpoch(); };
  }, []);
  const person = index?.participants.find(value => value.bindingId === selected) ?? null;
  const lost = useCallback(() => { setIndex(null); setSelected(''); setError('Din inloggning eller kontokoppling gäller inte längre. Logga in igen eller kontakta skolan.'); setLogin(true); }, []);
  async function logout() {
    if (navigationBlocked || dirty && !confirmDiscard()) return;
    setBusy(true); lock('Loggar ut…');
    try { const result = await api.post<{ redirect: string }>('/api/auth/logout', undefined); announce({ type: 'logged-out' }); window.location.assign(result.redirect); }
    catch { setError('Utloggningen kunde inte bekräftas. Stäng sidan eller försök igen.'); } finally { setBusy(false); }
  }
  return <main id="workspace" className="elective-self-page elective-workspace"><header className="elective-heading"><div><p className="elective-muted">Skolplattformen</p><h1>Mina val</h1></div>
    {index && <div className="elective-actions"><Button variant="outline" disabled={busy || navigationBlocked} onClick={() => { if (!dirty || confirmDiscard()) { lock('Hämtar dina val…'); setRetry(value => value + 1); } }}>Hämta aktuellt läge</Button><Button variant="outline" disabled={busy || navigationBlocked} onClick={() => void logout()}>Logga ut</Button></div>}</header>
    {error && <div className="elective-error" role="alert">{error}</div>}
    {login ? <a href={LOGIN_URL}>Logga in för att fortsätta</a> : !index ? <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Hämta mina val igen</Button> : <>
      {index.participants.length === 0 && <section className="elective-card"><h2>Inga val att visa</h2><p>Skolan behöver koppla ditt konto till rätt elev innan du kan göra eller bekräfta ett val. Kontakta skolan om du väntar på en valomgång.</p></section>}
      <details className="elective-card"><summary>Koppla konto till skolan</summary><p>Om skolan ber om din kontoreferens kan du visa den här. Skolan kontrollerar vem kontot tillhör innan det kopplas till en elev.</p><label>Din kontoreferens<input value={index.identityReference} readOnly onFocus={event => event.currentTarget.select()}/></label></details>
      {index.participants.length > 1 && <label>Välj elev och skola<select value={selected} disabled={navigationBlocked} onChange={event => { if (!dirty || confirmDiscard()) setSelected(event.target.value); }}><option value="">Välj vem valet gäller</option>{index.participants.map(value => <option value={value.bindingId} key={value.bindingId}>{value.pupilName} · {value.schoolName}{value.participant === 'guardian' ? ' · VH-bekräftelse' : ''}</option>)}</select></label>}
      {person && <Participant key={`${person.bindingId}-${person.bindingRevision}`} person={person} identityReference={index.identityReference} onLost={lost}/>}
    </>}
  </main>;
}
function Participant({ person, identityReference, onLost }: { person: SelfParticipant; identityReference: string; onLost: () => void }) {
  const [data, setData] = useState<SelfRead | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const journalKey = `elective-self-status:${person.bindingId}`;
  const [pending, setPending] = useState<SelfCommandRef | null>(() => { try { const value = window.sessionStorage.getItem(journalKey); if (!value) return null;
    const ref = parseSelfCommandRef(JSON.parse(value)); return ref.unitId === person.unitId && ref.pupilId === person.pupilId && ref.participant === person.participant ? ref : null;
  } catch { return null; } });
  useUnsavedChanges(`navigation-block:elective-self:${person.bindingId}`, busy || pending !== null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const next = parseSelfRead(await api.post(`${BASE}/lasa`, scopeOf(person), signal), { ...scopeOf(person), bindingId: person.bindingId });
    setData(next); return next;
  }, [person]);
  useEffect(() => {
    const controller = new AbortController();
    void api.post(`${BASE}/lasa`, scopeOf(person), controller.signal).then(raw => {
      if (!controller.signal.aborted) setData(parseSelfRead(raw, { ...scopeOf(person), bindingId: person.bindingId }));
    }).catch(caught => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) { setData(null); onLost(); return; }
      setError('Dina val kunde inte hämtas. Försök igen.');
    });
    return () => controller.abort();
  }, [person, retry, onLost]);
  function failed(caught: unknown) {
    if (caught instanceof ApiError && [401, 403].includes(caught.status)) { setData(null); onLost(); return; }
    setError(caught instanceof ApiError && caught.status === 409 ? 'Valet eller erbjudandet har ändrats. Hämta aktuellt läge och kontrollera ditt val.' : 'Ändringen kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.');
  }
  function forget() { try { window.sessionStorage.removeItem(journalKey); } catch { /* Ett känt kvitto kan läsas igen. */ } setPending(null); }
  async function send(action: SelfCommand['action'], payload: SelfCommand['payload']) {
    if (!data || busy || pending) return;
    let command: SelfCommand;
    try { command = parseSelfCommand({ ...scopeOf(person), expectedBindingRevision: data.participant.bindingRevision, commandId: crypto.randomUUID(), action, payload }); }
    catch { setError('Kontrollera att du har valt rätt antal alternativ.'); return; }
    const ref = await createSelfCommandRef(command);
    try { window.sessionStorage.setItem(journalKey, JSON.stringify(ref)); }
    catch { setError('Valet kunde inte förberedas säkert. Inget har skickats.'); return; }
    setBusy(true); setPending(ref); setError(null); setFeedback(null);
    let acknowledged = false;
    try {
      const receipt = parseSelfReceipt(await api.post(`${BASE}/kommando`, command), ref, { identityId: identityReference, bindingId: person.bindingId });
      if (receipt.bindingId !== person.bindingId) throw new Error('binding');
      acknowledged = true; forget(); await load(); setFeedback(action === 'submit_choice' ? 'Ditt val är inlämnat.' : 'Ditt svar är sparat.');
    } catch (caught) { if (acknowledged) { setData(null); setError('Ditt svar är sparat. Hämta aktuellt läge för att fortsätta.'); return; } if (caught instanceof ApiError && caught.hasExplicitCode && [400, 403, 409].includes(caught.status)) forget(); failed(caught); }
    finally { setBusy(false); }
  }
  async function check() {
    if (!pending || busy) return;
    setBusy(true); setError(null);
    let confirmed = false;
    try {
      const status = parseSelfStatus(await api.post(`${BASE}/status`, pending), pending, { identityId: identityReference, bindingId: person.bindingId });
      if (status.status === 'found' && status.receipt.bindingId !== person.bindingId) throw new Error('binding');
      confirmed = status.status === 'found'; forget(); await load(); setFeedback(status.status === 'found' ? 'Sparandet är bekräftat.' : 'Ändringen är inte sparad. Kontrollera ditt val och försök igen.');
    } catch (caught) { if (confirmed) { setData(null); setError('Sparandet är bekräftat. Hämta aktuellt läge för att fortsätta.'); } else failed(caught); } finally { setBusy(false); }
  }
  return <section className="elective-workspace" aria-label={`Val för ${person.pupilName}`}><header><h2>{person.pupilName}</h2><p className="elective-muted">{person.schoolName}{person.participant === 'guardian' ? ' · Vårdnadshavare' : ''}</p></header>
    {error && <div className="elective-error" role="alert">{error}{!pending && <Button variant="ghost" disabled={busy} onClick={() => setRetry(value => value + 1)}>Hämta aktuellt läge</Button>}</div>}
    {pending && <div className="elective-card"><p>Kontrollera sparstatus innan du fortsätter.</p><Button disabled={busy} onClick={() => void check()}>Kontrollera sparstatus</Button></div>}
    {feedback && <output className="elective-feedback">{feedback}</output>}
    {!data ? <p aria-busy="true">Hämtar valomgångar…</p> : data.offers.length === 0 ? <p>Det finns inga valomgångar att visa just nu.</p> : data.offers.map(offer => <Offer key={`${offer.round.id}-${data.choices.find(choice => choice.roundId === offer.round.id)?.revision ?? 0}`} offer={offer} data={data} disabled={busy || pending !== null} onSend={send}/>)}
  </section>;
}
function Offer({ offer, data, disabled, onSend }: { offer: SelfOffer; data: SelfRead; disabled: boolean; onSend: (action: SelfCommand['action'], payload: SelfCommand['payload']) => Promise<void> }) {
  const choice = data.choices.find(value => value.roundId === offer.round.id) ?? null;
  const [selected, setSelected] = useState(choice?.selectedOptionIds ?? []), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const pupil = data.participant.participant === 'pupil';
  const open = offer.round.status === 'open' && now >= Date.parse(offer.round.opensAt) && now <= Date.parse(offer.round.closesAt);
  const guardianOpen = offer.round.status === 'open' && new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }) <= offer.endsOn;
  const changed = [...selected].sort().join(',') !== [...(choice?.selectedOptionIds ?? [])].sort().join(',');
  useUnsavedChanges(`elective-choice:${data.participant.bindingId}:${offer.round.id}`, pupil && changed);
  const ownDecision = choice ? data.confirmations.find(value => value.bindingId === data.participant.bindingId && value.bindingRevision === data.participant.bindingRevision && value.choiceId === choice.id && value.choiceRevision === choice.revision && value.offeringRevision === choice.offeringRevision) : null;
  const placements = data.placements.filter(placement => offer.options.some(option => option.id === placement.optionId));
  return <article className="elective-card"><header><h2>{offer.blockName}</h2><p className="elective-muted">{offer.startsOn} – {offer.endsOn} · elevens sista valdag {new Date(offer.round.closesAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })}</p></header>
    {choice && <p className="elective-feedback">{STATE[choice.state] ?? 'Valet är inlämnat.'}</p>}
    {pupil ? <>
      <ElectiveChoiceForm title="Dina alternativ" selected={selected} minChoices={offer.round.minChoices} maxChoices={offer.round.maxChoices} disabled={disabled || !open}
        options={offer.options.map(option => ({ id: option.id, name: option.name, description: [option.language ? programplanLanguageName(option.language) : null, option.levelCode].filter(Boolean).join(' · ') }))} onChange={setSelected}/>
      <p className="elective-muted">{offer.round.guardianConfirmation ? 'När du lämnat ditt val behöver din vårdnadshavare bekräfta det innan skolan går vidare.' : 'När du lämnat ditt val bekräftar skolan valet och din gruppplacering.'}</p>
      <Button disabled={disabled || !open || selected.length < offer.round.minChoices || selected.length > offer.round.maxChoices || !!choice && !changed && choice.state !== 'guardian_declined'} onClick={() => void onSend('submit_choice', { roundId: offer.round.id, offeringRevision: offer.round.offeringRevision, expectedChoiceRevision: choice?.revision ?? null, selectedOptionIds: selected })}>{choice?.state === 'guardian_declined' && !changed ? 'Lämna valet på nytt' : choice ? 'Lämna ändrat val' : 'Lämna mitt val'}</Button>
      {!open && <p className="elective-muted">Valomgången är stängd eller har inte öppnat ännu.</p>}
    </> : !choice ? <p>Eleven har inte lämnat sitt val ännu.</p> : <>
      <h3>Elevens val</h3><ul>{choice.selectedOptionIds.map(id => <li key={id}>{offer.options.find(option => option.id === id)?.name ?? 'Alternativet har ändrats'}</li>)}</ul>
      {!offer.round.guardianConfirmation ? <p>Skolan begär ingen VH-bekräftelse för den här valomgången.</p> : !data.participant.confirmationRequired ? <p>Din bekräftelse krävs inte för det här valet.</p> : <>
        <p>Du bekräftar det här valet för {data.participant.pupilName}.</p>
        {ownDecision && <p className="elective-status">{ownDecision.decision === 'approve' ? 'Du har bekräftat detta val.' : 'Du har avböjt detta val.'}</p>}
        <div className="elective-actions"><Button disabled={disabled || !guardianOpen || !!ownDecision || choice.state === 'confirmed' || choice.state === 'stale_offer'} onClick={() => void guardianDecision('approve', choice)}>Bekräfta valet</Button>
          <Button variant="outline" disabled={disabled || !guardianOpen || !!ownDecision || choice.state === 'confirmed' || choice.state === 'stale_offer'} onClick={() => void guardianDecision('decline', choice)}>Avböj</Button></div>
      </>}
    </>}
    {placements.length > 0 && <section><h3>Gruppplacering</h3>{placements.map(placement => <p key={`${placement.groupId}-${placement.startsOn}`}>{placement.groupName} · från {placement.startsOn}{placement.endsOn ? ` till ${placement.endsOn}` : ''}</p>)}</section>}
    <details><summary>Undervisningstid enligt timplanen</summary><p>HT {offer.needHt === null ? 'Tid saknas' : formatTime(offer.needHt)} · VT {offer.needVt === null ? 'Tid saknas' : formatTime(offer.needVt)}</p></details>
  </article>;
  async function guardianDecision(decision: 'approve' | 'decline', value: ElectiveChoice) { await onSend('confirm_guardian', { choiceId: value.id, expectedChoiceRevision: value.revision, offeringRevision: value.offeringRevision, decision }); }
}
