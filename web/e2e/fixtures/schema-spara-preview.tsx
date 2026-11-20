// Ett uttryckligt simulerat skal för browserprov. Produktens arbetsyta, provider, skrivkö och API-klient är oförändrade.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SchemaWorkspace from '../../app/schema-workspace.tsx';
import { Button } from '../../components/ui/button.tsx';
import { UnsavedChangesProvider, useHasUnsaved, useRequestDiscard } from '../../lib/unsaved-changes.tsx';
import { setKnownEpoch } from '../../lib/server-client.ts';
import '../../app/globals.css';
function Shell() {
  const [year, setYear] = useState(2026), [epoch, setEpoch] = useState(1), [active, setActive] = useState(true), discard = useRequestDiscard(), dirty = useHasUnsaved();
  const changeYear = async () => { if (dirty && !await discard()) return; setYear(y => y + 1); setEpoch(e => e + 1); setActive(true); setKnownEpoch(1); };
  const leave = async () => { if (!dirty || await discard()) { setActive(false); setKnownEpoch(null); } };
  const endContext = () => { setActive(false); setEpoch(e => e + 1); setKnownEpoch(null); };
  return <main className="min-w-0 p-4"><nav aria-label="Simulerat skal" className="mb-4 flex flex-wrap gap-3">
    <Button variant="outline" onClick={() => { void changeYear(); }}>Byt läsår</Button>
    <Button variant="outline" onClick={() => { void leave(); }}>Lämna arbetsytan</Button>
    <Button variant="outline" onClick={endContext}>Simulera avslutat uppdrag</Button>
    <a href="about:blank">Öppna annan sida</a>
  </nav><p className="text-sm text-muted-foreground">Testskal · läsår {year} · {active ? 'arbetsytan är öppen' : 'arbetsytan är stängd'}.</p>
    {active && <SchemaWorkspace unitId="52a10000-0000-4000-8000-000000000001" schoolName="Provskolan" schoolYear={year} scopeKey={`${epoch}:prov:prov`} onSessionLost={endContext}/>}
  </main>;
}
setKnownEpoch(1); createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Shell/></UnsavedChangesProvider>);
