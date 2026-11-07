'use client';

import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseValplanChoiceCommand, parseValplanChoiceRead, parseValplanChoiceReply, type ValplanChoiceCommand, type ValplanChoicePupil, type ValplanChoiceRead, type ValplanChoiceState } from '@/lib/valplan-choice-contract.ts';
import ElectiveParticipantBindings from './elective-participant-bindings';
import MfaStepUpNotice from './mfa-step-up';

export const VALPLAN_STATE_LABEL: Record<ValplanChoiceState | 'not_chosen', string> = { not_chosen: 'Ej valt', awaiting_guardian: 'Väntar på vårdnadshavare', guardian_declined: 'Avböjt av vårdnadshavare',
  guardian_bindings_missing: 'Vårdnadshavare saknar koppling', ready_for_confirmation: 'Klart att bekräfta', confirmed: 'Bekräftat', course_changed: 'Kurs borttagen' };
const stateOf = (pupil: ValplanChoicePupil) => pupil.choice?.state ?? 'not_chosen';
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'valplan_choice_points') return 'Valet fyller inte elevens poäng. Välj kurser som tillsammans ger rätt poäng.';
    if (error.reason === 'valplan_choice_course') return 'En vald kurs finns inte längre i blocket.';
    if (error.reason === 'valplan_round_date') return 'Sista valdag kan inte ligga bakåt i tiden.';
    if (error.reason === 'valplan_round_empty') return 'Blocket behöver minst en kurs och en timplansrad innan valet kan öppnas.';
    if (error.reason === 'valplan_round_points') return 'Valet öppnades inte. En klass kan inte nå exakt sina poäng med kurser den får läsa. Gå tillbaka till blocket och rätta under Kontroll.';
    if (error.reason === 'valplan_round_doubled') return 'Valet öppnades inte. En klass finns i två block. Gå tillbaka till blocket och rätta under Kontroll.';
    if (error.reason === 'valplan_round_rows') return 'Valet öppnades inte. En klass finns i två rader i blocket. Gå tillbaka till blocket och rätta under Kontroll.';
    if (error.reason === 'valplan_round_no_classes') return 'Valet öppnades inte. Inga klasser ingår i blocket. Gå tillbaka till blocket och rätta under Kontroll.';
    if (error.reason === 'valplan_round_time') return 'Valet öppnades inte. En kurs saknar undervisningstid. Gå tillbaka till blocket och rätta under Kontroll.';
    if (error.reason === 'valplan_round_row') return 'Valet öppnades inte. En kopplad timplansrad finns inte längre för läsåret.';
    if (error.reason === 'elective_policy_missing') return 'Ange först om vårdnadshavare ska bekräfta valen.';
    if (error.reason === 'elective_confirmation_required') return 'Valet kan inte bekräftas ännu. Kontrollera elevens status.';
    if (error.status === 409) return 'Underlaget har ändrats. Hämta aktuellt läge och granska ändringen igen.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
    if (error.status === 400) return 'Kontrollera uppgifterna. Ändringen kunde inte sparas.';
  }
  return 'Sparandet kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.';
}

/** remaining: what Kontroll says is left. The database refuses the same opening. */
type Props = { unitId: string; schoolYear: number; valplanId: string; scopeKey: string; remaining?: readonly string[]; onBack: () => void; onOpenGroups?: () => void; onSessionLost: () => void };
export default function ProtectedValplanChoices({ unitId, schoolYear, valplanId, scopeKey, remaining = [], onBack, onOpenGroups, onSessionLost }: Props) {
  const heading = useId();
  const [data, setData] = useState<ValplanChoiceRead | null>(null), [loadError, setLoadError] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [pending, setPending] = useState<ValplanChoiceCommand | null>(null), [closesOn, setClosesOn] = useState('');
  const [stateFilter, setStateFilter] = useState(''), [classFilter, setClassFilter] = useState(''), [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [picked, setPicked] = useState<string[]>([]);
  useUnsavedChanges(`valplan-choices-${valplanId}`, busy || pending !== null);

  const scope = useMemo(() => ({ unitId, schoolYear, valplanId }), [unitId, schoolYear, valplanId]);
  const failedRead = useEffectEvent((caught: unknown) => { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); });
  useEffect(() => {
    const controller = new AbortController();
    api.post('/api/valplaner/val/lasa', scope, controller.signal).then(value => { setData(parseValplanChoiceRead(value, scope)); setLoadError(false); }).catch(caught => { if (!controller.signal.aborted) failedRead(caught); });
    return () => controller.abort();
  }, [scope]);
  async function refresh() { setError(null); setPending(null); try { setData(parseValplanChoiceRead(await api.post('/api/valplaner/val/lasa', scope), scope)); setLoadError(false); } catch (caught) { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); } }

  /** The same command id is resent after a lost answer, so the database replays instead of acting twice. */
  async function send(command: ValplanChoiceCommand, done: string | ((groups: NonNullable<ReturnType<typeof parseValplanChoiceReply>['receipt']['groups']>) => string)): Promise<boolean> {
    setBusy(true); setError(null); setNotice(null); setMfa(false); setPending(command);
    try {
      const reply = parseValplanChoiceReply(await api.post('/api/valplaner/val/kommando', command), command);
      setData(reply.read); setPending(null); setNotice(typeof done === 'string' ? done : done(reply.receipt.groups!)); return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return false; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') { setPending(null); setMfa(true); setError('Verifiera inloggningen för att fortsätta.'); return false; }
      if (caught instanceof ApiError) setPending(null);
      setError(message(caught)); return false;
    } finally { setBusy(false); }
  }
  const command = (action: ValplanChoiceCommand['action'], payload: unknown) => parseValplanChoiceCommand({ contractVersion: 'valplan_choice_v1', commandId: crypto.randomUUID(), action, ...scope, payload });

  const pupils = useMemo(() => data?.pupils.filter(p => showAll || p.targetPoints !== null || p.choice !== null) ?? [], [data, showAll]);
  const shown = pupils.filter(p => (!stateFilter || stateOf(p) === stateFilter) && (!classFilter || p.classIds.includes(classFilter)));
  const className = (pupil: ValplanChoicePupil) => pupil.classIds.map(id => data?.classes.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'Ingen klass';
  const courseName = (id: string) => data?.courses.find(c => c.id === id)?.name ?? 'Kursen finns inte kvar';
  const count = (state: string) => pupils.filter(p => stateOf(p) === state).length;
  const ready = pupils.filter(p => stateOf(p) === 'ready_for_confirmation');
  const round = data?.round ?? null;
  const pickedPoints = picked.reduce((n, id) => n + (data?.courses.find(c => c.id === id)?.points ?? 0), 0);

  async function confirmAll() {
    for (const pupil of ready) if (!await send(command('confirm_choice', { pupilId: pupil.id, expectedChoiceRevision: pupil.choice!.revision }), `${ready.length} val är bekräftade.`)) return;
  }
  function edit(pupil: ValplanChoicePupil) { setEditing(pupil.id); setPicked(pupil.choice?.courseIds.filter(id => data?.courses.some(c => c.id === id)) ?? []); setError(null); setNotice(null); }

  return <section className="valplan-card valplan-editor" aria-labelledby={heading}>
    <div className="section-heading"><h2 id={heading}>Elevval{data ? ` – ${data.valplanName}` : ''}</h2>
      <span className={round?.accepting ? 'status-badge success' : 'status-badge'}>{!round ? 'Inte öppnat' : round.accepting ? `Öppet till ${round.closesOn}` : 'Stängt'}</span></div>
    <div className="valplan-actions"><Button variant="outline" disabled={busy} onClick={onBack}>Tillbaka till blocket</Button></div>
    {loadError && <div className="valplan-alert" role="alert"><p>Elevvalet kunde inte hämtas.</p><Button variant="outline" onClick={() => void refresh()}>Försök igen</Button></div>}
    {!data && !loadError && <p className="valplan-muted">Hämtar elevval…</p>}
    {data && <>
      <section className="valplan-section" aria-label="Valomgång">
        <h3>Valomgång</h3>
        <fieldset className="valplan-new"><legend>Bekräftelse av vårdnadshavare</legend>
          <p className="valplan-muted">{data.guardianConfirmation === null ? 'Ange om vårdnadshavare ska bekräfta valen. Inställningen gäller hela skolan och öppna val.' : data.guardianConfirmation ? 'Vårdnadshavare bekräftar elevens val innan skolan bekräftar.' : 'Vårdnadshavare bekräftar inte valen. Skolan bekräftar direkt.'}</p>
          <div className="valplan-actions">
            <Button variant={data.guardianConfirmation === true ? 'default' : 'outline'} aria-pressed={data.guardianConfirmation === true} disabled={busy} onClick={() => void send(command('set_policy', { guardianConfirmation: true }), 'Vårdnadshavare bekräftar valen.')}>Vårdnadshavare bekräftar</Button>
            <Button variant={data.guardianConfirmation === false ? 'default' : 'outline'} aria-pressed={data.guardianConfirmation === false} disabled={busy} onClick={() => void send(command('set_policy', { guardianConfirmation: false }), 'Vårdnadshavare behöver inte bekräfta.')}>Ingen bekräftelse</Button>
          </div></fieldset>
        {remaining.length > 0 && <div className="validation-warning"><p>{round?.status === 'open' ? 'Valet är öppet, men Kontroll i blocket visar att något behöver rättas:' : 'Valet går inte att öppna förrän det som återstår under Kontroll i blocket är löst:'}</p>
          <ul className="valplan-rows">{remaining.map(text => <li key={text}><small>{text}</small></li>)}</ul></div>}
        {round?.status === 'open' ? <div className="valplan-actions"><Button variant="outline" disabled={busy} onClick={() => void send(command('close_round', { expectedRevision: round.revision }), 'Valet är stängt.')}>Stäng val</Button></div>
          : <><div className="valplan-open"><div className="protected-date-field"><label htmlFor={`${heading}-closes`}>Sista valdag</label><DatePicker id={`${heading}-closes`} value={closesOn} disabled={busy} onValueChange={setClosesOn}/></div>
            <div className="valplan-actions"><Button disabled={busy || !closesOn || data.guardianConfirmation === null || remaining.length > 0} onClick={() => void send(command('open_round', { expectedRevision: round?.revision ?? 0, closesOn }), 'Valet är öppet för eleverna.')}>{round ? 'Öppna val igen' : 'Öppna val'}</Button></div></div>
            {data.guardianConfirmation === null ? <p className="valplan-muted">Ange först om vårdnadshavare ska bekräfta valen.</p> : !closesOn && <p className="valplan-muted">Välj sista valdag för att öppna valet.</p>}</>}
      </section>

      <section className="valplan-section" aria-label="Elever">
        <h3>Elever</h3>
        <p className="valplan-muted">{pupils.length} elever · {count('not_chosen')} har inte valt · {count('awaiting_guardian')} väntar på vårdnadshavare · {count('ready_for_confirmation')} klara att bekräfta · {count('confirmed')} bekräftade</p>
        <div className="valplan-fields">
          <label>Status<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="">Alla</option>{Object.entries(VALPLAN_STATE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Klass<select value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">Alla</option>{data.classes.filter(c => data.pupils.some(p => p.classIds.includes(c.id))).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <label className="valplan-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}/><span>Visa även elever utanför blockets klasser<small>Skolan kan registrera val åt dem som undantag.</small></span></label>
        {shown.length ? <div className="valplan-table-wrap"><table className="valplan-table">
          <thead><tr><th scope="col">Elev</th><th scope="col">Klass</th><th scope="col">Status</th><th scope="col">Val</th><th scope="col"><span className="sr-only">Åtgärd</span></th></tr></thead>
          <tbody>{shown.map(p => <tr key={p.id}>
            <td data-label="Elev"><strong>{p.name}</strong>{p.targetPoints === null && <small>Utanför blockets klasser</small>}</td>
            <td data-label="Klass">{className(p)}</td>
            <td data-label="Status"><span className={stateOf(p) === 'confirmed' ? 'status-badge success' : 'status-badge'}>{VALPLAN_STATE_LABEL[stateOf(p)]}</span></td>
            <td data-label="Val">{p.choice ? p.choice.courseIds.map(courseName).join(', ') : '–'}{p.choice?.submittedBy === 'school' && <small>Registrerat av skolan</small>}</td>
            <td className="valplan-remove"><div className="valplan-actions">
              <Button size="sm" variant="outline" disabled={busy} aria-label={`Registrera val åt ${p.name}`} onClick={() => edit(p)}>Registrera val</Button>
              {stateOf(p) === 'ready_for_confirmation' && <Button size="sm" disabled={busy} aria-label={`Bekräfta valet för ${p.name}`} onClick={() => void send(command('confirm_choice', { pupilId: p.id, expectedChoiceRevision: p.choice!.revision }), `Valet för ${p.name} är bekräftat.`)}>Bekräfta</Button>}
            </div></td></tr>)}</tbody></table></div> : <p className="valplan-muted">{pupils.length ? 'Inga elever matchar filtret.' : 'Inga elever att visa. Koppla klasser till timplanerna för läsåret.'}</p>}
        {editing && (() => { const pupil = data.pupils.find(p => p.id === editing)!, target = pupil.targetPoints; return <fieldset className="valplan-add">
          <legend>Val för {pupil.name}</legend>
          {data.courses.map(c => <label key={c.id} className="valplan-check"><input type="checkbox" disabled={busy} checked={picked.includes(c.id)} onChange={e => setPicked(list => e.target.checked ? [...list, c.id] : list.filter(id => id !== c.id))}/>
            <span>{c.name}<small>{c.points} p{target !== null && !pupil.offeredCourseIds.includes(c.id) ? ' · Utanför elevens klass' : ''}</small></span></label>)}
          <p className={target !== null && pickedPoints !== target ? 'validation-warning' : 'valplan-muted'}>{target === null ? `${pickedPoints} p valda. Eleven ligger utanför blockets klasser.` : `${pickedPoints} av ${target} p valda.`}</p>
          <div className="valplan-actions">
            <Button disabled={busy || !picked.length || target !== null && pickedPoints !== target} onClick={async () => { if (await send(command('record_choice', { pupilId: pupil.id, expectedChoiceRevision: pupil.choice?.revision ?? 0, courseIds: picked }), `Valet för ${pupil.name} är sparat.`)) setEditing(null); }}>Spara val</Button>
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Avbryt</Button></div></fieldset>; })()}
      </section>

      <section className="valplan-section" aria-label="Grupper">
        <h3>Grupper från valet</h3>
        <p className="valplan-muted">Bekräftade elever läggs i en grupp per kurs. Grupperna delas och justeras under Undervisningsgrupper. Ett ändrat val flyttar aldrig en elev från en befintlig grupp.</p>
        <div className="valplan-actions">
          {ready.length > 0 && <Button variant="outline" disabled={busy} onClick={() => void confirmAll()}>Bekräfta alla klara ({ready.length})</Button>}
          <Button disabled={busy || !count('confirmed')} onClick={() => void send(command('create_groups', {}), g => `${g.created} nya grupper och ${g.added} elever tillagda.${g.notConfirmed ? ` ${g.notConfirmed} val är inte bekräftade och ingår inte.` : ''}`)}>Skapa grupper från valet</Button>
          {onOpenGroups && <Button variant="outline" disabled={busy} onClick={onOpenGroups}>Öppna Undervisningsgrupper</Button>}
        </div>
      </section>

      {mfa ? <MfaStepUpNotice message={error ?? 'Verifiering med engångskod krävs.'}/> : error && <div className="valplan-alert" role="alert"><p>{error}</p>
        {pending ? <Button disabled={busy} onClick={() => void send(pending, 'Sparandet är bekräftat.')}>Kontrollera sparstatus</Button> : <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Hämta aktuellt läge</Button>}</div>}
      {notice && <output className="valplan-notice">{notice}</output>}

      <details className="valplan-section"><summary>Kontokopplingar för elever och vårdnadshavare</summary>
        <ElectiveParticipantBindings unitId={unitId} schoolYear={schoolYear} scopeKey={scopeKey} pupils={data.pupils.map(p => ({ id: p.id, name: p.name, classIds: p.classIds }))} disabled={busy} onSessionLost={onSessionLost}/></details>
    </>}
  </section>;
}
