'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ElectiveBlock, ElectiveChoice, ElectiveCommand, ElectiveRead } from '@/lib/elective-block-contract.ts';
import { parsePlacementPreview, type PlacementPreview, type PlacementPreviewRequest } from '@/lib/elective-placement-contract.ts';

const ISSUE: Record<string, string> = {
  group_not_applied_to_staffing: 'Tillämpa gruppens aktuella organisation i tjänstefördelningen innan eleven placeras.',
  choice_changed: 'Elevens val har ändrats. Hämta aktuellt läge.', choice_not_confirmed: 'Skolan behöver först bekräfta elevens aktuella val.',
  option_not_selected: 'Gruppen hör inte till elevens bekräftade alternativ.', outside_group_period: 'Välj datum inom gruppens period.',
  outside_pupil_class_period: 'Perioden ryms inte inom elevens skol- och klassplacering för den här gruppen. Justera datumen.',
  placement_id_used: 'Placeringen har redan behandlats. Hämta aktuellt läge.', previous_cancelled: 'Den tidigare placeringen är redan ersatt.',
  historical_period_rewrite: 'Det går inte att skriva över en tidigare påbörjad placering. Välj ett senare bytesdatum.',
  previous_placement_required: 'Välj vilken tidigare placering som ska avslutas vid bytet.',
};
const period = (from: string, to: string | null) => `${from} – ${to ?? 'tills vidare'}`;
type Props = { data: ElectiveRead; block: ElectiveBlock; choice: ElectiveChoice; disabled: boolean;
  onSend: (action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current?: ElectiveRead | null) => Promise<ElectiveRead | null> };

export default function ElectivePlacementForm({ data, block, choice, disabled, onSend }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false), [groupId, setGroupId] = useState('');
  const [startsOn, setStartsOn] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }));
  const [endsOn, setEndsOn] = useState(block.endsOn), [previousId, setPreviousId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ request: PlacementPreviewRequest; result: PlacementPreview } | null>(null);
  const groups = block.groups.filter(group => choice.selectedOptionIds.includes(group.optionId));
  const previous = data.placements?.filter(item => item.pupilId === choice.pupilId && block.groups.some(group => group.id === item.groupId)) ?? [];
  useUnsavedChanges(`elective-placement:${choice.id}`, open);
  useUnsavedChanges(`navigation-block:elective-placement:${choice.id}`, busy);
  const locked = disabled || busy;
  async function preview() {
    if (locked || !groupId || !startsOn) return;
    setBusy(true); setError(null);
    const request: PlacementPreviewRequest = { unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: data.revision,
      payload: { placementId: crypto.randomUUID(), choiceId: choice.id, expectedChoiceRevision: choice.revision,
        groupId, startsOn, endsOn: endsOn || null, previousPlacementId: previousId || null } };
    try {
      const result = parsePlacementPreview(await api.post('/api/valbara-block/placering/forhandsvisa', request), request);
      if (result.pupil.id !== choice.pupilId || result.revision !== data.revision) throw new Error('changed');
      setReview({ request, result });
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? 'Underlaget har ändrats. Hämta aktuellt läge och granska igen.' : 'Granskningen kunde inte hämtas. Inget har placerats.');
    } finally { setBusy(false); }
  }
  async function save() {
    if (locked || !review?.result.allowed) return;
    await onSend('save_placement', { ...review.request.payload, expectedBasisHash: review.result.basisHash }, data);
  }
  if (!open) return <Button variant="outline" disabled={disabled || !groups.length} onClick={() => setOpen(true)}>Placera i grupp</Button>;
  return <section className="elective-placement elective-card" aria-labelledby={id} aria-busy={busy}>
    <h4 id={id}>Placera elev i undervisningsgrupp</h4>
    {error && <p role="alert">{error}</p>}
    {!review ? <>
      <div className="elective-fields"><label>Undervisningsgrupp<select value={groupId} disabled={locked} onChange={event => setGroupId(event.target.value)}><option value="">Välj grupp</option>
        {groups.map(group => <option key={group.id} value={group.id}>{group.name} · {block.options.find(option => option.id === group.optionId)?.name}</option>)}</select></label>
      <label>Från<input type="date" value={startsOn} disabled={locked} onChange={event => setStartsOn(event.target.value)}/></label>
      <label>Till<input type="date" value={endsOn} disabled={locked} onChange={event => setEndsOn(event.target.value)}/><small>Tomt betyder till gruppens slut.</small></label></div>
      {previous.length > 0 && <label>Tidigare placering att ersätta<select value={previousId} disabled={locked} onChange={event => setPreviousId(event.target.value)}><option value="">Ingen tidigare placering</option>
        {previous.map(item => <option value={item.id} key={item.id}>{block.groups.find(group => group.id === item.groupId)?.name ?? 'Tidigare grupp'} · {period(item.startsOn, item.endsOn)}</option>)}</select></label>}
      <p>Elevens administrativa klass ändras inte. Vid gruppbyte avslutas den tidigare placeringen dagen före det nya startdatumet.</p>
      <Button disabled={locked || !groupId || !startsOn} onClick={() => void preview()}>Granska placering</Button>
    </> : <>
      <p><strong>{review.result.pupil.name}</strong> → {review.result.group.name}<br/>{period(review.result.period.startsOn, review.result.period.endsOn)}</p>
      <details><summary>Skol- och klassperioder som kontrollerats</summary>
        <ul>{review.result.schoolPeriods.map((item, index) => <li key={`school-${index}`}>Skolplacering: {period(item.startsOn, item.endsOn)}</li>)}
          {review.result.classPeriods.map((item, index) => <li key={`class-${index}`}>{item.className}: {period(item.startsOn, item.endsOn)}</li>)}</ul>
      </details>
      {review.result.previous && <p>{review.result.previous.operation === 'cancel' ? 'Ersätter den kommande placeringen' : 'Avslutar den tidigare placeringen'} i {review.result.previous.groupName}.</p>}
      {review.result.issues.length > 0 && <ul role="alert">{review.result.issues.map(issue => <li key={issue}>{ISSUE[issue] ?? 'Placeringen behöver justeras. Kontrollera elevens val, grupp och perioder.'}</li>)}</ul>}
      {review.result.warnings.includes('group_not_applied_to_staffing') && <p>Gruppen är ännu inte tillämpad i tjänstefördelningen. Gör det för att bemanna undervisningen.</p>}
      <div className="elective-actions"><Button variant="outline" disabled={locked} onClick={() => setReview(null)}>Justera</Button><Button disabled={locked || !review.result.allowed} onClick={() => void save()}>Bekräfta gruppplacering</Button></div>
    </>}
    <Button variant="ghost" disabled={locked} onClick={() => { setOpen(false); setReview(null); setError(null); }}>Avbryt placering</Button>
  </section>;
}
