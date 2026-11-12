import React from 'react';
import { createRoot } from 'react-dom/client';
import SchemaWorkspace from '../../app/schema-workspace';
import { setKnownEpoch } from '../../lib/server-client';
import '../../app/globals.css';
setKnownEpoch(1);
createRoot(document.getElementById('root')!).render(<main style={{ padding: 16 }}><SchemaWorkspace unitId="52a10000-0000-4000-8000-000000000001" schoolYear={2026} scopeKey="prov" onSessionLost={() => { document.title = 'Utloggad'; }}/></main>);
