// Syntetiska komponentdata och Send-dubbel; ingen verklig identitets- eller SQL-anslutning.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ElectiveParticipantBindings from '../../app/elective-participant-bindings';
import { UnsavedChangesProvider, useHasUnsaved, useRequestDiscard } from '../../lib/unsaved-changes';
import { block, choice, round, schoolRead } from './elective-data';
import '../../app/globals.css';
import '../../app/elective-blocks.css';
function Preview() {
  const [data] = useState(() => { const value = schoolRead(); value.policy.guardianConfirmation = true; value.blocks = [block()]; value.rounds = [round()]; if (location.search.includes('closed')) value.rounds[0].status = 'closed'; if (location.search.includes('existing')) value.choices = [choice()]; return value; });
  const [writes] = useState<unknown[]>([]), [lost, setLost] = useState(false), [left, setLeft] = useState(false);
  const requestDiscard = useRequestDiscard(), dirty = useHasUnsaved(), navigationBlocked = useHasUnsaved('navigation-block:');
  return <main className="elective-workspace elective-self-page"><h1>Syntetiskt prov av skolans valverktyg</h1>
    <button disabled={navigationBlocked} onClick={async () => { if (!dirty || await requestDiscard()) setLeft(true); }}>Gå vidare i provet</button>
    {lost ? <output>Sessionen är låst</output> : left ? <h2>Annat arbetsområde</h2> : <>
      <ElectiveParticipantBindings unitId={data.unitId} schoolYear={data.schoolYear} scopeKey="synthetic-staff-7" pupils={data.pupils ?? []} onSessionLost={() => setLost(true)}/>
      <output aria-label="Syntetiska valkommandon" style={{overflowWrap:'anywhere'}}>{JSON.stringify(writes)}</output>
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Preview/></UnsavedChangesProvider>);
