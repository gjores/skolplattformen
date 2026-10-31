'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ElectiveBlock, ElectiveCommand, ElectiveRead } from '@/lib/elective-block-contract.ts';
import ElectiveChoiceForm from './elective-choice-form';
import './elective-staff-tools.css';

type Send = (action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current?: ElectiveRead | null) => Promise<ElectiveRead | null>;
type Props = { data: ElectiveRead; block: ElectiveBlock; disabled: boolean; onSend: Send };
type Draft = { roundId: string; pupilId: string; roundRevision: number; offeringRevision: number; choiceRevision: number | null; selected: string[]; initial: string[] };
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export default function ElectiveStaffChoice(props: Props) {
  if (!props.data.canManage || !props.data.canReadPupils) return null;
  return <StaffChoice key={`${props.data.unitId}:${props.data.schoolYear}:${props.block.id}`} {...props}/>;
}
function StaffChoice({ data, block, disabled, onSend }: Props) {
  const id = useId(), [opened, setOpened] = useState(false), [roundId, setRoundId] = useState(''), [pupilId, setPupilId] = useState(''), [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<string | null>(null), submitting = useRef(false);
  const rounds = data.rounds.filter(value => value.blockId === block.id), round = rounds.find(value => value.id === roundId);
  const choice = data.choices?.find(value => value.roundId === roundId && value.pupilId === pupilId);
  const pupils = (data.pupils ?? []).filter(value => round?.pupilIds?.includes(value.id));
  const dirty = draft !== null && !same(draft.selected, draft.initial);
  const stale = !!draft && (!round || round.revision !== draft.roundRevision || round.offeringRevision !== draft.offeringRevision || block.offeringRevision !== draft.offeringRevision || (choice?.revision ?? null) !== draft.choiceRevision);
  const open = !!round && round.status === 'open' && Date.parse(round.opensAt) <= now && now <= Date.parse(round.closesAt);
  const locked = disabled || busy || !data.canManage || !data.canReadPupils;
  useUnsavedChanges(`elective-staff-choice:${id}`, dirty);
  useUnsavedChanges(`navigation-block:elective-staff-choice:${id}`, busy);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  function select(nextRound: string, nextPupil: string) {
    if (dirty && !confirmDiscard()) return;
    setRoundId(nextRound); setPupilId(nextPupil); setFeedback(null);
    const r = rounds.find(value => value.id === nextRound), c = data.choices?.find(value => value.roundId === nextRound && value.pupilId === nextPupil);
    const valid = r?.pupilIds?.includes(nextPupil);
    setDraft(r && valid ? { roundId: nextRound, pupilId: nextPupil, roundRevision: r.revision, offeringRevision: r.offeringRevision, choiceRevision: c?.revision ?? null, selected: c?.selectedOptionIds ?? [], initial: c?.selectedOptionIds ?? [] } : null);
  }
  async function submit() {
    if (locked || submitting.current || !draft || stale || !round || !open || !pupils.some(value => value.id === pupilId) || draft.selected.length < round.minChoices || draft.selected.length > round.maxChoices) return;
    submitting.current = true; setBusy(true); setFeedback(null);
    try {
      const next = await onSend('record_choice', { roundId: draft.roundId, pupilId: draft.pupilId, offeringRevision: draft.offeringRevision, expectedChoiceRevision: draft.choiceRevision, selectedOptionIds: [...draft.selected] }, data);
      if (next) { setDraft(null); setPupilId(''); setFeedback('Valet är registrerat. Eventuell VH-bekräftelse och skolans bekräftelse görs separat.'); }
    } catch { setFeedback('Valet kunde inte bekräftas sparat. Kontrollera sparstatus i valbara block.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!data.canManage || !data.canReadPupils) return null;
  return <section aria-label="Registrera val åt elev" className="elective-staff-choice">
    {!opened ? <Button variant="outline" disabled={locked} onClick={() => setOpened(true)}>Registrera val åt elev</Button> : <>
      <h3 id={`${id}-heading`}>Registrera val åt elev</h3><p className="elective-muted">Välj valomgång och elev. Registreringen ersätter elevens val, men bekräftar det inte åt VH eller skolan.</p>
      <div className="elective-fields"><label>Valomgång<select value={roundId} disabled={locked} onChange={event => select(event.target.value, '')}><option value="">Välj valomgång</option>{rounds.map(value => <option key={value.id} value={value.id}>{new Date(value.opensAt).toLocaleDateString('sv-SE')} – {new Date(value.closesAt).toLocaleDateString('sv-SE')}{value.status === 'closed' ? ' · Stängd' : ''}</option>)}</select></label>
        <label>Sök elev<input type="search" value={search} disabled={locked || !round} onChange={event => setSearch(event.target.value)}/></label>
        <label>Elev<select value={pupilId} disabled={locked || !round} onChange={event => select(roundId, event.target.value)}><option value="">Välj elev</option>{pupils.filter(value => value.id === pupilId || value.name.toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv'))).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label></div>
      {round && !open && <output>Valomgången är inte öppen för registrering.</output>}
      {stale && <div className="elective-error" role="alert">Underlaget eller elevens val har ändrats. Granska aktuellt val innan du fortsätter. <Button variant="outline" disabled={locked} onClick={() => select(roundId, pupilId)}>Hämta aktuellt val</Button></div>}
      {draft && round && <><ElectiveChoiceForm title={`Val för ${pupils.find(value => value.id === pupilId)?.name ?? 'vald elev'}`} options={block.options.filter(value => round.optionIds.includes(value.id)).map(value => ({ id: value.id, name: value.name, description: value.levelCode }))} minChoices={round.minChoices} maxChoices={round.maxChoices} selected={draft.selected} disabled={locked || stale || !open} onChange={selected => setDraft({ ...draft, selected })}/>
        <Button disabled={locked || stale || !open || !dirty || draft.selected.length < round.minChoices || draft.selected.length > round.maxChoices} onClick={() => void submit()}>Registrera elevens val</Button></>}
      <Button variant="ghost" disabled={locked} onClick={() => { if (!dirty || confirmDiscard()) { setOpened(false); setDraft(null); setPupilId(''); setRoundId(''); } }}>Stäng registrering</Button>
    </>}
    {feedback && <output>{feedback}</output>}
  </section>;
}
