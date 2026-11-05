import React from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedStudyGroups from '../../app/protected-study-groups';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { setKnownEpoch } from '../../lib/server-client';
import '../../app/globals.css';
setKnownEpoch(1);
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><main style={{ padding: 16 }}><ProtectedStudyGroups unitId="58300000-0000-4000-8000-000000000001" schoolYear={2027} scopeKey="prov" onSessionLost={() => { document.title = 'Utloggad'; }}/></main></UnsavedChangesProvider>);
