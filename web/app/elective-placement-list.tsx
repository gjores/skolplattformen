'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ElectiveBlock, ElectiveCommand, ElectivePlacement, ElectiveRead } from '@/lib/elective-block-contract.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';

type Send = (action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current?: ElectiveRead | null) => Promise<ElectiveRead | null>;
export default function ElectivePlacementList({ data, block, disabled, onSend }: { data: ElectiveRead; block: ElectiveBlock; disabled: boolean; onSend: Send }) {
  const retired = data.retiredGroups?.filter(group => group.blockId === block.id) ?? [];
  const placements = data.placements?.filter(placement => block.groups.some(group => group.id === placement.groupId) || retired.some(group => group.id === placement.groupId)) ?? [];
  if (!placements.length) return null;
  return <section className="elective-card"><h3>Gruppplaceringar</h3><p>Elevens skolklass behålls. Här ser du aktuella, kommande och tidigare gruppperioder.</p>
    <div className="elective-list">{placements.map(placement => <article key={`${placement.id}:${placement.revision}`}>
      <strong>{data.pupils?.find(pupil => pupil.id === placement.pupilId)?.name ?? 'Elev'} · {block.groups.find(group => group.id === placement.groupId)?.name ?? retired.find(group => group.id === placement.groupId)?.name ?? 'Undervisningsgrupp'}</strong>
      <p>{placement.startsOn} – {placement.endsOn ?? 'tills vidare'}</p>
      {retired.some(group => group.id === placement.groupId) ? <p>Gruppen är avvecklad.</p> : <EndPlacement placement={placement} data={data} disabled={disabled} onSend={onSend}/>}
    </article>)}</div>
  </section>;
}
function EndPlacement({ placement, data, disabled, onSend }: { placement: ElectivePlacement; data: ElectiveRead; disabled: boolean; onSend: Send }) {
  const id = useId(), [open, setOpen] = useState(false), [review, setReview] = useState(false);
  const [date, setDate] = useState(() => { const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }); return today < placement.startsOn ? placement.startsOn : placement.endsOn && today > placement.endsOn ? placement.endsOn : today; });
  useUnsavedChanges(`elective-end-placement:${id}`, open);
  const valid = !!date && date >= placement.startsOn && (!placement.endsOn || date < placement.endsOn);
  const [today] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }));
  const future = placement.startsOn > today;
  const [cancelling, setCancelling] = useState(false);
  useUnsavedChanges(`elective-cancel-placement:${id}`, cancelling);
  if (future) return cancelling ? <div><p>Återta den planerade placeringen från {placement.startsOn}? Elevens val och klass behålls.</p><div className="elective-actions"><Button variant="outline" disabled={disabled} onClick={() => setCancelling(false)}>Behåll placeringen</Button><Button disabled={disabled} onClick={() => { const previousDay = new Date(Date.parse(`${placement.startsOn}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10); void onSend('end_placement', { placementId: placement.id, expectedPlacementRevision: placement.revision, endsOn: previousDay }, data); }}>Bekräfta återtagning</Button></div></div> : <Button variant="ghost" disabled={disabled} onClick={() => setCancelling(true)}>Återta planerad placering</Button>;
  if (!open) return <Button variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>Avsluta placering</Button>;
  return <div><label htmlFor={id}>Sista dag i gruppen<input id={id} type="date" value={date} min={placement.startsOn} max={placement.endsOn ?? undefined} disabled={disabled || review} onChange={event => setDate(event.target.value)}/></label>
    {review && <p>Placeringen avslutas efter {date}. Historiken behålls. Elevens val och skolklass ändras inte.</p>}
    <div className="elective-actions"><Button variant="ghost" disabled={disabled} onClick={() => { setOpen(false); setReview(false); }}>Avbryt avslut</Button>
      {review ? <><Button variant="outline" disabled={disabled} onClick={() => setReview(false)}>Justera sista dag</Button><Button disabled={disabled || !valid} onClick={() => void onSend('end_placement', { placementId: placement.id, expectedPlacementRevision: placement.revision, endsOn: date }, data)}>Bekräfta avslut</Button></>
        : <Button variant="outline" disabled={disabled || !valid} onClick={() => setReview(true)}>Granska avslut</Button>}</div>
  </div>;
}
