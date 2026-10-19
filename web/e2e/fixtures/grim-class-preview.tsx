// Synthetic component preview for GR/IM class links. No database, server or live authentication.
import React from 'react';
import {createRoot} from 'react-dom/client';
import ProtectedGrimClassTimplans from '../../app/protected-grim-class-timplans';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import type {ProtectedTimplan} from '../../lib/protected-timplan';
import '../../app/globals.css';
export const gid=(n:number)=>`51a40000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const params=new URLSearchParams(location.search),im=params.has('im');
const plan:ProtectedTimplan={id:gid(1),offeringId:gid(2),unitId:gid(3),version:1,revision:2,status:'faststalld',basis:'Syntetiskt underlag',catalogFetched:null,decidedOn:'2026-06-01',cells:{},schoolName:'Syntetiska skolan',
 education:im?{name:'Syntetiskt IM',cohort:'Läsåret 2026/27',kind:'introduktionsprogram',grades:[]}:{name:'Syntetisk GR 7–9',cohort:'Läsåret 2026/27',kind:'grundskola',grades:[7,8,9]}};
function Harness(){const blocked=useHasUnsaved('navigation-block:');
 return <main style={{padding:'1rem',maxWidth:'1100px',margin:'auto'}}><button disabled={blocked}>Lämna arbetsytan</button>
  <ProtectedGrimClassTimplans plan={plan} scopeKey={JSON.stringify(['synthetic',params.get('scope')??'a'])} returnTo="/e2e/fixtures/grim-class-preview.html" canPrepare={!params.has('hm')} disabled={false} onSecurityFailure={()=>false}/></main>;}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
