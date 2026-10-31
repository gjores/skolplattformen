'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ElectiveBlock, ElectiveCommand, ElectiveGroup, ElectiveRead } from '@/lib/elective-block-contract.ts';

export default function ElectiveRetireGroup({ data, block, group, disabled, onSend }: { data: ElectiveRead; block: ElectiveBlock; group: ElectiveGroup; disabled: boolean;
  onSend: (action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current?: ElectiveRead | null) => Promise<ElectiveRead | null> }) {
  const id = useId(), [review, setReview] = useState(false);
  useUnsavedChanges(`elective-retire:${id}`, review);
  if (!review) return <Button variant="ghost" disabled={disabled} onClick={() => setReview(true)}>Avveckla grupp</Button>;
  return <section className="elective-card" aria-label={`Avveckla ${group.name}`}><h4>Avveckla {group.name}</h4>
    <p>Gruppen tas ur det aktuella utbudet. Tidigare placeringar och publicerad tjänst behåller sin historik.</p>
    <ul><li>Avsluta pågående elevplaceringar och återta kommande placeringar.</li><li>Ta bort gruppens aktuella lärartilldelningar i tjänstefördelningen.</li><li>Stäng berörda valomgångar.</li></ul>
    <p>Du kan sedan skapa en ny grupp med rätt underlag.</p>
    <div className="elective-actions"><Button variant="outline" disabled={disabled} onClick={() => setReview(false)}>Behåll gruppen</Button><Button disabled={disabled} onClick={() => void onSend('retire_group', { groupId: group.id, expectedBlockRevision: block.revision }, data)}>Bekräfta avveckling</Button></div>
  </section>;
}
