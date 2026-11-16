// Simulerat rolltips i skalet; produktens workspace och API-klient används utan testgrenar.
import React from 'react';
import { createRoot } from 'react-dom/client';
import SchemaWorkspace from '../../app/schema-workspace.tsx';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes.tsx';
import { setKnownEpoch } from '../../lib/server-client.ts';
import '../../app/globals.css';
setKnownEpoch(1);
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><main className="min-w-0 p-4">
  <SchemaWorkspace unitId="52a10000-0000-4000-8000-000000000001" schoolYear={2026} scopeKey="1:personal:prov"
    personalLookup={new URLSearchParams(location.search).get('personal') !== '0'} onSessionLost={() => { document.title = 'Utloggad'; }}/>
</main></UnsavedChangesProvider>);
