import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PlanDecisionPanel from '../../app/plan-decision-panel';
import {DecisionInbox,PlanDecisionProvider} from '../../app/plan-decision-context';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import type {PlanDecisionItem} from '../../lib/plan-decision';
import '../../app/globals.css';
const id='5a160000-0000-4000-8000-000000000001',params=new URLSearchParams(location.search);
function Harness(){
 const [opened,setOpened]=useState<PlanDecisionItem|null>(null),[disabled,setDisabled]=useState(false),[changed,setChanged]=useState(0);
 const [revision,setRevision]=useState(1);const pending=useHasUnsaved('navigation-block:');
 useEffect(()=>{const block=(event:Event)=>setDisabled((event as CustomEvent<boolean>).detail),reload=()=>setRevision(n=>n+1);
  window.addEventListener('apl-test-block',block);window.addEventListener('apl-test-revision',reload);return()=>{window.removeEventListener('apl-test-block',block);window.removeEventListener('apl-test-revision',reload);};},[]);
 const kind=params.has('program')?'programplan':'timplan';
 return <PlanDecisionProvider active scopeKey={`synthetic-apl-decision:${params.get('role')??'huvudman'}`} onSessionLost={()=>{throw Error('Unexpected synthetic session failure');}}>
  <main className="mx-auto max-w-5xl p-4"><p className="mb-3 text-sm text-muted-foreground">Syntetiskt UI-prov · {params.get('role')??'huvudman'}</p>
   <h1 className="mb-4 text-2xl font-semibold">Planering och beslut</h1>
   {params.has('inbox')&&!opened?<DecisionInbox roleLabel={params.get('role')??'Huvudman'} onOpen={setOpened}/>:<>
    <PlanDecisionPanel kind={opened?.kind??kind} planId={opened?.planId??id} revision={revision} disabled={disabled} onChanged={()=>setChanged(n=>n+1)} onSecurityFailure={()=>false}/>
    <section id="apl-planering" tabIndex={-1} className="mt-8 rounded-lg border p-4"><h2 className="font-semibold">Planera APL</h2><p>Testankare för samma timplan. APL-redigeringen provas separat i APL-05.</p></section>
   </>}
   <output data-testid="opened-scope" className="hidden">{JSON.stringify(opened)}</output><output data-testid="changed" className="hidden">{changed}</output>
   <button className="mt-4 text-sm underline" disabled={pending||disabled}>Lämna arbetsytan</button>
  </main>
 </PlanDecisionProvider>;
}
// All API calls are intercepted by apl-decision.spec.ts. No live data or OIDC is used.
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
