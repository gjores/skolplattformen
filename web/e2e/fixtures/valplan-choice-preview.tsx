import React from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedValplanChoices from '../../app/protected-valplan-choices';
import ElectiveSelfWorkspace from '../../app/elective-self-workspace';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { setKnownEpoch } from '../../lib/server-client';
import '../../app/globals.css';
import '../../app/valplaner.css';
import { scope } from './valplan-choice-data';
setKnownEpoch(1);
const self = new URLSearchParams(location.search).has('self');
createRoot(document.getElementById('root')!).render(self ? <ElectiveSelfWorkspace/>
  : <UnsavedChangesProvider><main style={{ padding: 16 }} className="valplan-workspace"><ProtectedValplanChoices {...scope} scopeKey="prov" onBack={() => { document.title = 'Tillbaka'; }} onOpenGroups={() => { document.title = 'Grupper'; }} onSessionLost={() => { document.title = 'Utloggad'; }}/></main></UnsavedChangesProvider>);
