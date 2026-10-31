// Syntetiska komponentdata och Send-dubbel; ingen verklig identitets- eller SQL-anslutning.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ElectiveParticipantBindings from '../../app/elective-participant-bindings';
import ElectiveStaffChoice from '../../app/elective-staff-choice';
import { UnsavedChangesProvider, useHasUnsaved, confirmDiscard } from '../../lib/unsaved-changes';
import type { ElectiveCommand } from '../../lib/elective-block-contract';
import { block, choice, round, schoolRead } from './elective-data';
import '../../app/globals.css';
import '../../app/elective-blocks.css';
function Preview() {
  const [data, setData] = useState(() => { const value = schoolRead(); value.policy.guardianConfirmation = true; value.blocks = [block()]; value.rounds = [round()]; if (location.search.includes('closed')) value.rounds[0].status = 'closed'; if (location.search.includes('existing')) value.choices = [choice()]; return value; });
  const [writes, setWrites] = useState<unknown[]>([]), [lost, setLost] = useState(false), [left, setLeft] = useState(false);
  const dirty = useHasUnsaved(), navigationBlocked = useHasUnsaved('navigation-block:');
  return <main className="elective-workspace elective-self-page"><h1>Syntetiskt prov av skolans valverktyg</h1>
    <button disabled={navigationBlocked} onClick={() => { if (!dirty || confirmDiscard()) setLeft(true); }}>Gå vidare i provet</button>
    {lost ? <output>Sessionen är låst</output> : left ? <h2>Annat arbetsområde</h2> : <>
      <ElectiveParticipantBindings unitId={data.unitId} schoolYear={data.schoolYear} scopeKey="synthetic-staff-7" pupils={data.pupils ?? []} onSessionLost={() => setLost(true)}/>
      <ElectiveStaffChoice data={data} block={data.blocks[0]} disabled={false} onSend={async (action, payload) => {
        setWrites(values => [...values, { action, payload }]);
        if (action !== 'record_choice') throw Error('Unexpected synthetic action');
        const p = payload as Extract<ElectiveCommand, { action: 'record_choice' }>['payload'];
        const next = structuredClone(data); next.revision++;
        next.choices = [{ ...choice(), roundId: p.roundId, pupilId: p.pupilId, selectedOptionIds: p.selectedOptionIds, revision: (p.expectedChoiceRevision ?? 0) + 1 }];
        setData(next); return next;
      }}/>
      <button onClick={() => setData(value => ({ ...value, revision: value.revision + 1, choices: [{ ...choice(), revision: (value.choices?.[0]?.revision ?? 0) + 1 }] }))}>Simulera ändrat elevval</button>
      <button onClick={() => setData(value => ({ ...value, rounds: value.rounds.map(r => ({ ...r, closesAt: '2026-10-30T00:00:00.000Z' })) }))}>Simulera sista valdag</button>
      <output aria-label="Syntetiska valkommandon" style={{overflowWrap:'anywhere'}}>{JSON.stringify(writes)}</output>
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Preview/></UnsavedChangesProvider>);
