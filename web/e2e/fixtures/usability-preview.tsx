import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedHome from '../../app/protected-home';
import '../../app/globals.css';
import ProtectedPlanList from '../../app/protected-plan-list';
import ProgramplanList from '../../app/protected-programplan-list';
import { PlanningContextBar, PlanningContextProvider } from '../../app/planning-context';
import { readPlanLocation, type PlanLocation } from '../../lib/protected-plan-location';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';

function ListHarness() {
  const [location, setLocation] = useState<PlanLocation | null>(() => readPlanLocation(window.location.search));
  const [opened, setOpened] = useState('');
  return <UnsavedChangesProvider><PlanningContextProvider contextKey="synthetic-list" active location={location} onTransition={setLocation} onSessionLost={() => { throw Error('Unexpected session loss'); }}>
    <main className="workspace"><PlanningContextBar/>{new URLSearchParams(window.location.search).has('programHarness') ? <ProgramplanList disabled={false} canEditPlans canCreateEducation creationLoading={false} canCreateTimplan
      onSecurityFailure={() => false} onNew={() => {}} onOpen={row => setOpened(JSON.stringify({ action: 'program', row }))} onCopy={() => {}}
      onTimplan={row => setOpened(JSON.stringify({ action: row.schoolTimplan ? 'open-time' : 'create-time', unitId: row.unitId, offeringId: row.offeringId, plan: row.plan, timplan: row.schoolTimplan }))}/> : <ProtectedPlanList onSecurityFailure={() => false}
      onOpen={row => setOpened(JSON.stringify({ offeringId: row.offeringId, unitId: row.unitId, plan: row.plan }))}/>}
      <output style={{ overflowWrap: 'anywhere' }} data-testid="opened-row">{opened}</output></main>
  </PlanningContextProvider></UnsavedChangesProvider>;
}

// The browser suite intercepts every API call; this page has no backend connection.
createRoot(document.getElementById('root')!).render(new URLSearchParams(window.location.search).has('listHarness') ? <ListHarness/> : <ProtectedHome/>);
