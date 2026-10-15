import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProtectedClassTimplans from '../../app/protected-class-timplans';
import ProtectedGymTimplanWorkspace from '../../app/protected-gym-timplan-workspace';
import {PlanningContextProvider,usePlanningContext} from '../../app/planning-context';
import {PlanDecisionProvider} from '../../app/plan-decision-context';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import {readPlanLocation} from '../../lib/protected-plan-location';
import {operationPlan,oid} from './operational-data';
import '../../app/globals.css';
const params=new URLSearchParams(location.search),role=params.has('hm')?'huvudman':'rektor';
function Ready({children}:{children:React.ReactNode}){const{setup,loading}=usePlanningContext();return setup&&!loading?<>{children}</>:<p>Läser planeringsval…</p>;}
function Harness(){const blocked=useHasUnsaved('navigation-block:');const[loc,setLoc]=useState(()=>readPlanLocation(`?vy=timplaner&utbildning=${oid(2)}&timplan=${oid(1)}&timplansversion=1&planeringslasar=2026&planeringsform=gymnasium`));
 return <main style={{padding:'1rem',maxWidth:'1200px',margin:'auto'}}><button disabled={blocked}>Lämna arbetsytan</button>{params.has('gym')?<PlanningContextProvider contextKey="operational" active location={loc} onTransition={setLoc} onSessionLost={()=>{throw Error('session');}}><PlanDecisionProvider active scopeKey="operational" onSessionLost={()=>{throw Error('session');}}><Ready><ProtectedGymTimplanWorkspace context={{assignmentId:oid(8),membershipId:oid(9),customerId:oid(7),customerName:'Exempel',organizerId:null,organizerName:null,unitId:oid(3),unitName:'Exempelskolan',function:role,label:role,blocked:false,valid:true}} epoch={1} initialTarget={{kind:'plan',id:oid(1),offeringId:oid(2),unitId:oid(3),version:1}} onSessionLost={()=>{throw Error('session');}} onOpened={()=>{}} onProgramplan={()=>{}}/></Ready></PlanDecisionProvider></PlanningContextProvider>:<ProtectedClassTimplans plan={{...operationPlan,source:{...operationPlan.source,startedOn:params.get('start')==='null'?null:params.get('start')??operationPlan.source.startedOn},status:params.has('old')?'ersatt':'faststalld'}} schoolYear={Number(params.get('year')??2026)} canPrepare={role==='rektor'} disabled={false} onSecurityFailure={()=>false}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
