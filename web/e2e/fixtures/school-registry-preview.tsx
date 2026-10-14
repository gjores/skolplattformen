import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedSchoolWorkspace from '../../app/protected-school-workspace';
import { UnsavedChangesProvider, useHasUnsaved } from '../../lib/unsaved-changes';
import '../../app/globals.css';
const id = (n: number) => `77101410-0000-4000-8000-${String(n).padStart(12, '0')}`;
function Harness() {
  const blocked = useHasUnsaved('navigation-block:');
  const [epoch, setEpoch] = useState(1), [mfa, setMfa] = useState(false), [lost, setLost] = useState(false);
  return <main className="workspace" style={{ padding: '1rem' }}><p role="note">Syntetiskt komponentprov – ändrar inte dina skolor. API-svaren ersätts av testet.</p><div style={{display:'flex',gap:12,flexWrap:'wrap',marginBlock:16}}><button disabled={blocked}>Lämna arbetsytan</button><button onClick={() => setEpoch(value => value + 1)}>Simulera byte av uppdrag</button></div>
    {mfa && <p>Verifiera inloggningen igen.</p>}{lost && <p>Uppdraget har avslutats.</p>}
    <ProtectedSchoolWorkspace key={epoch} context={{ assignmentId:id(epoch+10),membershipId:id(2),customerId:id(1),customerName:'Syntetisk kund',organizerId:id(3),organizerName:'Syntetisk huvudman',unitId:null,unitName:null,function:'huvudman',label:'Huvudman',blocked:false,valid:true }} epoch={epoch} onMfaRequired={() => setMfa(true)} onSessionLost={() => setLost(true)}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
