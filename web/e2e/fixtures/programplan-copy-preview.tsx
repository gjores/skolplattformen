import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProtectedProgramplanWorkspace from '../../app/protected-programplan-workspace';
import {PlanningContextProvider,usePlanningContext} from '../../app/planning-context';
import {PlanDecisionProvider} from '../../app/plan-decision-context';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import {readPlanLocation} from '../../lib/protected-plan-location';
import '../../app/globals.css';
const id=(n:number)=>`77101400-0000-4000-8000-${String(n).padStart(12,'0')}`;
const params=new URLSearchParams(location.search);
const role=params.get('role')==='administrator'?'administrator':params.get('role')==='rektor'?'rektor':'huvudman';
const sessionLost=()=>{throw Error('Unexpected mock session loss');};
const opened=()=>{};
function Ready({epoch,other}:{epoch:number;other:boolean}){const{setup,loading}=usePlanningContext();const[target,setTarget]=useState('');return setup&&!loading?<><output data-testid="timplan-target">{target}</output><ProtectedProgramplanWorkspace
 context={{assignmentId:id(epoch===1?4:6),membershipId:id(5),customerId:id(1),customerName:'Syntetisk huvudman',organizerId:null,organizerName:null,unitId:null,unitName:null,function:role,label:role,blocked:false,valid:true}}
 key={`${epoch}-${other}`} epoch={epoch} initialPlan={params.has('new')?null:{offeringId:id(other?11:10),planId:id(other?21:20),unitId:id(other||params.get('school')==='3'?3:2),version:1}} onSessionLost={sessionLost} onOpened={opened} onTimplan={source=>setTarget(typeof source==='string'?source:source.id)}/></>:<p>Hämtar syntetiskt planeringsurval…</p>;}
function Harness(){const[epoch,setEpoch]=useState(1),[other,setOther]=useState(false);const blocked=useHasUnsaved('navigation-block:');const[visits,setVisits]=useState(0);const[planLocation,setPlanLocation]=useState(()=>readPlanLocation(`?vy=programplaner&utbildning=${id(10)}&programplan=${id(20)}&programplansversion=1&planeringslasar=2027&planeringsskola=${id(params.get('school')==='3'?3:2)}&planeringsallaar=1`));return <main className="workspace" style={{padding:'1rem'}}>
 <p>Isolerat komponentprov med syntetiska API-svar.</p><button disabled={blocked} onClick={()=>setVisits(n=>n+1)}>Lämna arbetsytan</button><output data-testid="navigation-count">{visits}</output>
 {params.has('cohort')&&<><button onClick={()=>setEpoch(n=>n+1)}>Simulera annat uppdrag</button><button onClick={()=>setOther(v=>!v)}>Simulera annan utbildning och skola</button></>}
 <PlanningContextProvider contextKey={`synthetic-copy-${epoch}`} active location={planLocation} onTransition={setPlanLocation} onSessionLost={sessionLost}>
 <PlanDecisionProvider active scopeKey="synthetic-copy" onSessionLost={sessionLost}><Ready epoch={epoch} other={other}/></PlanDecisionProvider></PlanningContextProvider></main>;}
// Every API request is intercepted by programplan-copy.spec.ts. No live backend.
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
