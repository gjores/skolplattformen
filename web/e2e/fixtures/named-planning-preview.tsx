// Synthetic navigation harness: production context/list/overview, no actual session or write route.
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../app/globals.css';
import {PlanningContextBar,PlanningContextProvider,usePlanningContext} from '../../app/planning-context';
import ProtectedPlanList from '../../app/protected-plan-list';
import ProtectedPlanningOverview from '../../app/protected-planning-overview';
import {UnsavedChangesProvider,useHasUnsaved,useUnsavedChanges} from '../../lib/unsaved-changes';
import {planningRowLocation,planLocationQuery,readPlanLocation,type PlanLocation} from '../../lib/protected-plan-location';
import type {PlanningRow,PlanningSchoolTimplan} from '../../lib/planning-year-contract';
function Body({location,transition}:{location:PlanLocation;transition:(location:PlanLocation,mode?:'push'|'replace')=>void}){
 const {selection}=usePlanningContext(),blocked=useHasUnsaved('navigation-block:');
 const [unknown,setUnknown]=useState(false);useUnsavedChanges('navigation-block:synthetic',unknown);
 const detail=location.view==='timplaner'?location.gym?.id??location.other?.id:location.programplan?.planId;
 if(!selection)return null;
 const open=(row:PlanningRow)=>{if(blocked)return;const next=planningRowLocation(row,selection);if(next)transition(next);};
 const timplan=(row:PlanningRow,target?:PlanningSchoolTimplan)=>{if(blocked||!target)return;transition({view:'timplaner',gym:{kind:'plan',id:target.id,offeringId:row.offeringId,unitId:row.unitId,version:target.version},planning:{...selection,schoolform:'gymnasium',unitId:row.unitId,page:1,selectionRevision:null}});};
 return <><label><input type="checkbox" checked={unknown} onChange={e=>setUnknown(e.target.checked)}/>Simulera okänd sparstatus</label>{detail?<section aria-label="Öppnad plan"><h1>Vald plan</h1><output data-testid="plan-id">{detail}</output><p>Detaljvyn simuleras här; navigationen använder exakt plan-ID.</p></section>:location.overview?<ProtectedPlanningOverview onSecurityFailure={()=>false} onOpen={open} onShowPlans={()=>transition({...location,overview:false})} onChooseCollection={(view,schoolform)=>transition(view==='programplan'?{view:'programplaner',programplan:null,overview:true,planning:{...selection,schoolform}}:{view:'timplaner',gym:null,overview:true,planning:{...selection,schoolform}})}/>:<ProtectedPlanList onSecurityFailure={()=>false} onOpen={open} {...(location.view==='programplaner'?{programRows:{canCreateTimplan:true,onTimplan:timplan}}:{})}/>}</>;
}
function App(){
 const [location,setLocation]=useState(()=>readPlanLocation(window.location.search)??{view:'timplaner',gym:null,overview:true} as PlanLocation),[scope,setScope]=useState(1);
 useEffect(()=>{const pop=()=>{const next=readPlanLocation(window.location.search);if(next)setLocation(next);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const transition=(next:PlanLocation,mode:'push'|'replace'='push')=>{history[mode==='push'?'pushState':'replaceState']({},'',planLocationQuery(next));setLocation(next);};
 return <UnsavedChangesProvider><PlanningContextProvider contextKey={`named:${scope}`} active location={location} onTransition={transition} onSessionLost={()=>{throw Error('Unexpected security failure');}}><main className="workspace"><button onClick={()=>setScope(n=>n+1)}>Simulera uppdragsbyte</button><PlanningContextBar/><Body location={location} transition={transition}/></main></PlanningContextProvider></UnsavedChangesProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
