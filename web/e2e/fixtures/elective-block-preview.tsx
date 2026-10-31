import React from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedElectiveBlocks from '../../app/protected-elective-blocks';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { setKnownEpoch } from '../../lib/server-client';
import { eid, YEAR } from './elective-data';
import '../../app/globals.css';
setKnownEpoch(1);
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><ProtectedElectiveBlocks unitId={eid(1)} schoolYear={YEAR} scopeKey="synthetic-elective" contextEpoch={1} onSessionLost={() => { document.body.textContent = 'Inloggningen har avslutats'; }}/></UnsavedChangesProvider>);
