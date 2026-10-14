import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProtectedProgramplanWorkspace from '../../app/protected-programplan-workspace';
import {PlanningContextProvider,usePlanningContext} from '../../app/planning-context';
import {PlanDecisionProvider} from '../../app/plan-decision-context';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import {readPlanLocation} from '../../lib/protected-plan-location';
import '../../app/globals.css';
const id=(n:number)=>`77101400-0000-4000-8000-${String(n).padStart(12,'0')}`;
const role=new URLSearchParams(location.search).get('role')==='rektor'?'rektor':'huvudman';
function Ready(){const{setup,loading}=usePlanningContext();return setup&&!loading?<ProtectedProgramplanWorkspace
 context={{assignmentId:id(4),membershipId:id(5),customerId:id(1),customerName:'Syntetisk huvudman',organizerId:null,organizerName:null,unitId:null,unitName:null,function:role,label:role,blocked:false,valid:true}}
 epoch={1} initialPlan={{offeringId:id(10),planId:id(20),unitId:id(2),version:1}} onSessionLost={()=>{throw Error('Unexpected mock session loss');}} onOpened={()=>{}}/>:<p>Hämtar syntetiskt planeringsurval…</p>;}
function Harness(){const blocked=useHasUnsaved('navigation-block:');const[visits,setVisits]=useState(0);const[planLocation,setPlanLocation]=useState(()=>readPlanLocation(`?vy=programplaner&utbildning=${id(10)}&programplan=${id(20)}&programplansversion=1&planeringslasar=2027&planeringsskola=${id(2)}&planeringsallaar=1`));return <main className="workspace" style={{padding:'1rem'}}>
 <p>Isolerat komponentprov med syntetiska API-svar.</p><button disabled={blocked} onClick={()=>setVisits(n=>n+1)}>Lämna arbetsytan</button><output data-testid="navigation-count">{visits}</output>
 <PlanningContextProvider contextKey="synthetic-copy" active location={planLocation} onTransition={setPlanLocation} onSessionLost={()=>{throw Error('Unexpected mock session loss');}}>
 <PlanDecisionProvider active scopeKey="synthetic-copy" onSessionLost={()=>{throw Error('Unexpected mock session loss');}}><Ready/></PlanDecisionProvider></PlanningContextProvider></main>;}
// Every API request is intercepted by programplan-copy.spec.ts. No live backend.
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
