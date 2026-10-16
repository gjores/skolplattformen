import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedGymTimplanHours from '../../app/protected-gym-timplan-hours';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { annualPlan, annualLegacy, annualCopyPlan, annualScope } from './annual-time-data';
import type { GymTimplan } from '../../lib/gym-timplan';
import '../../app/globals.css';
import '../../app/protected-gym-timplan.css';
function Harness() {
 const params = new URLSearchParams(location.search), legacy = params.has('legacy');
 const [plan, setPlan] = useState<GymTimplan>(legacy ? annualLegacy : params.has('copy') ? annualCopyPlan : annualPlan), [year, setYear] = useState('0'), [blocked, setBlocked] = useState(false), [activity, setActivity] = useState(false);
 return <main className="gym-timplan" style={{ padding: '1rem', maxWidth: '1200px', margin: 'auto' }}><h1>Timplan BA26A</h1><button disabled={blocked}>Lämna arbetsytan</button><button disabled={activity}>Ändra APL-perioder</button><ProtectedGymTimplanHours plan={plan} year={year} onYear={setYear} unsavedId="annual-time" timeJournalScope={params.has('noscope') ? null : annualScope} onSaved={setPlan} onSaving={() => {}} onNavigationBlocked={setBlocked} onActivity={setActivity} onSecurityFailure={() => false}/></main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
