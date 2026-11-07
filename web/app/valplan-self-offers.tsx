'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { SelfParticipant } from '@/lib/elective-self-contract.ts';
import { parseValplanSelfCommand, parseValplanSelfRead, parseValplanSelfReceipt, valplanClosestPoints, type ValplanBlockedCourse, type ValplanChoiceState, type ValplanSelfCommand, type ValplanSelfOffer, type ValplanSelfRead } from '@/lib/valplan-choice-contract.ts';

const BASE = '/api/valplaner/egen';
const STATE: Record<ValplanChoiceState, string> = { awaiting_guardian: 'Valet väntar på bekräftelse från vårdnadshavare.', guardian_declined: 'Vårdnadshavare har avböjt valet. Gör ett nytt val eller kontakta skolan.',
  guardian_bindings_missing: 'Skolan behöver kontrollera kopplingen till vårdnadshavare.', ready_for_confirmation: 'Valet är inlämnat och väntar på skolans bekräftelse.', confirmed: 'Skolan har bekräftat valet.', course_changed: 'En kurs i valet finns inte längre. Gör ett nytt val eller kontakta skolan.',
  course_held: 'En kurs i valet finns redan i timplanen eller i ett annat val. Gör ett nytt val eller kontakta skolan.' };
const REASON: Record<ValplanBlockedCourse['reason'], string> = { timplan: 'Ingår redan i din timplan', val: 'Du har redan valt kursen' };
const sameCourses = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
type Props = { person: SelfParticipant; epoch: number; onLost: () => void; onCount: (count: number) => void };
export default function ValplanSelfOffers({ person, epoch, onLost, onCount }: Props) {
  const [data, setData] = useState<ValplanSelfRead | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState<ValplanSelfCommand | null>(null);
  useUnsavedChanges(`navigation-block:valplan-self:${person.bindingId}`, busy || pending !== null);
  const scope = useCallback(() => ({ unitId: person.unitId, pupilId: person.pupilId, participant: person.participant }), [person]);
  const load = useCallback(async (signal?: AbortSignal) => { const next = parseValplanSelfRead(await api.post(`${BASE}/lasa`, scope(), signal), epoch); setData(next); onCount(next.offers.length); }, [scope, epoch, onCount]);
  useEffect(() => {
    const controller = new AbortController();
    api.post(`${BASE}/lasa`, scope(), controller.signal).then(raw => { const next = parseValplanSelfRead(raw, epoch); setData(next); onCount(next.offers.length); })
      .catch(caught => { if (controller.signal.aborted) return; if (caught instanceof ApiError && [401, 403].includes(caught.status)) onLost(); else setError('Valen kunde inte hämtas. Försök igen.'); });
    return () => controller.abort();
  }, [scope, epoch, onCount, onLost]);
  /** A lost answer is retried with the same command id, so the school gets one choice. */
  async function run(command: ValplanSelfCommand) {
    setBusy(true); setPending(command); setError(null); setFeedback(null);
    try {
      parseValplanSelfReceipt(await api.post(`${BASE}/kommando`, command), command, person.bindingId);
      setPending(null); await load(); setFeedback(command.action === 'submit_choice' ? 'Ditt val är inlämnat.' : 'Ditt svar är sparat.');
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) { setPending(null); onLost(); return; }
      if (caught instanceof ApiError) { setPending(null); setError(caught.status === 409 ? 'Valet har ändrats eller stängts. Hämta aktuellt läge och kontrollera ditt val.' : caught.reason === 'valplan_choice_course_held' ? 'Du har redan en av kurserna, i din timplan eller i ett annat val. Hämta aktuellt läge och välj en annan kurs.' : 'Valet kunde inte sparas. Kontrollera att kurserna fyller poängen.'); }
      else setError('Ändringen kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.');
    } finally { setBusy(false); }
  }
  function send(action: ValplanSelfCommand['action'], payload: ValplanSelfCommand['payload']) {
    return run(parseValplanSelfCommand({ ...scope(), expectedBindingRevision: person.bindingRevision, commandId: crypto.randomUUID(), action, payload }));
  }
  if (!data && !error) return null;
  return <>
    {error && <div className="elective-error" role="alert">{error}{pending ? <Button disabled={busy} onClick={() => void run(pending)}>Kontrollera sparstatus</Button> : <Button variant="ghost" disabled={busy} onClick={() => void load().catch(() => setError('Valen kunde inte hämtas. Försök igen.'))}>Hämta aktuellt läge</Button>}</div>}
    {feedback && <output className="elective-feedback">{feedback}</output>}
    {data?.offers.map(offer => <Offer key={`${offer.round.id}-${offer.choice?.revision ?? 0}`} offer={offer} person={person} disabled={busy || pending !== null} onSend={send}/>)}
  </>;
}
function Offer({ offer, person, disabled, onSend }: { offer: ValplanSelfOffer; person: SelfParticipant; disabled: boolean; onSend: (action: ValplanSelfCommand['action'], payload: ValplanSelfCommand['payload']) => Promise<void> }) {
  const choice = offer.choice, pupil = person.participant === 'pupil', open = offer.round.accepting;
  const reasons = new Map(offer.blockedCourses.map(b => [b.courseId, b.reason])), free = offer.courses.filter(c => !reasons.has(c.id)), held = offer.courses.filter(c => reasons.has(c.id));
  // A course the pupil already has leaves the choice here, but nothing changes until the pupil saves.
  const [ticked, setPicked] = useState<string[]>(choice?.courseIds.filter(id => free.some(c => c.id === id)) ?? []), [start] = useState(ticked);
  const picked = ticked.filter(id => !reasons.has(id));
  const points = picked.reduce((n, id) => n + (offer.courses.find(c => c.id === id)?.points ?? 0), 0), target = offer.targetPoints, left = target === null ? 0 : target - points;
  const changed = !sameCourses(picked, choice?.courseIds ?? []), closest = target === null ? 0 : valplanClosestPoints(free.map(c => c.points), target);
  useUnsavedChanges(`valplan-choice:${person.bindingId}:${offer.round.id}`, pupil && !sameCourses(picked, start));
  return <article className="elective-card"><header><h2>{offer.valplanName}</h2><p className="elective-muted">{open ? `Sista valdag ${offer.round.closesOn}` : 'Valet är stängt'}{target !== null ? ` · ${target} p att välja` : ''}</p></header>
    {choice && <p className="elective-feedback">{STATE[choice.state]}</p>}
    {pupil ? <>
      <fieldset className="valplan-self-courses" disabled={disabled || !open}><legend>Dina kurser</legend>
        {free.map(c => <label key={c.id} className="elective-choice"><input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(list => e.target.checked ? [...list, c.id] : list.filter(id => id !== c.id))}/><span>{c.name} · {c.points} p</span></label>)}
        {held.map(c => <label key={c.id} className="elective-choice"><input type="checkbox" checked={false} disabled/><span>{c.name} · {c.points} p<small>{REASON[reasons.get(c.id)!]}</small></span></label>)}</fieldset>
      {target !== null && <output className="elective-muted">{left === 0 ? 'Du har valt rätt antal poäng.' : left > 0 ? `${left} p kvar att välja.` : `${-left} p för mycket.`}</output>}
      {open && target !== null && closest < target && <p className="validation-warning">Kurserna du kan välja räcker inte till {target} p. Närmast går {closest} p. Kontakta skolan.</p>}
      <p className="elective-muted">{offer.round.guardianConfirmation ? 'När du lämnat ditt val behöver din vårdnadshavare bekräfta det innan skolan går vidare.' : 'När du lämnat ditt val bekräftar skolan det.'}</p>
      <Button disabled={disabled || !open || !picked.length || left !== 0 || !!choice && !changed && choice.state !== 'guardian_declined'} onClick={() => void onSend('submit_choice', { roundId: offer.round.id, expectedChoiceRevision: choice?.revision ?? 0, courseIds: picked })}>{choice ? 'Ändra val' : 'Lämna val'}</Button>
    </> : !choice ? <p>Eleven har inte lämnat sitt val ännu.</p> : <>
      <h3>Elevens val</h3><ul>{choice.courseIds.map(id => <li key={id}>{offer.courses.find(c => c.id === id)?.name ?? 'Kursen finns inte kvar'}</li>)}</ul>
      {!offer.round.guardianConfirmation ? <p>Skolan begär ingen bekräftelse för det här valet.</p> : !person.confirmationRequired ? <p>Din bekräftelse krävs inte för det här valet.</p> : <>
        <p>Du bekräftar det här valet för {person.pupilName}.</p>
        {offer.decision && <p className="elective-status">{offer.decision === 'approve' ? 'Du har bekräftat detta val.' : 'Du har avböjt detta val.'}</p>}
        <div className="elective-actions">
          <Button disabled={disabled || !open || !!offer.decision} onClick={() => void onSend('confirm_guardian', { choiceId: choice.id, expectedChoiceRevision: choice.revision, decision: 'approve' })}>Bekräfta valet</Button>
          <Button variant="outline" disabled={disabled || !open || !!offer.decision} onClick={() => void onSend('confirm_guardian', { choiceId: choice.id, expectedChoiceRevision: choice.revision, decision: 'decline' })}>Avböj</Button></div></>}
    </>}
  </article>;
}
