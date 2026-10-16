import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import MandateGrantDialog from '../../app/mandate-grant-dialog';
import LoggWorkspace from '../../app/logg-workspace';
import {UnsavedChangesProvider} from '../../lib/unsaved-changes';
import {setKnownEpoch} from '../../lib/server-client';
import '../../app/globals.css';
setKnownEpoch(1);
function Harness(){const[open,setOpen]=useState(false),[notice,setNotice]=useState('');return <main style={{padding:16,maxWidth:1100,margin:'auto'}}><button onClick={()=>setOpen(true)}>Tilldela nytt uppdrag</button><output>{notice}</output><LoggWorkspace epoch={1} onSessionLost={()=>{}}/><MandateGrantDialog open={open} epoch={1} onOpenChange={setOpen} onGranted={name=>{setNotice(`Tilldelat till ${name}`);setOpen(false);}} onMfaRequired={()=>{}} onSessionLost={()=>{}}/></main>;}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
