// Synthetic navigation harness: production context/list/overview, no actual session or write route.
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../app/globals.css';
import {PlanningContextBar,PlanningContextProvider,usePlanningContext} from '../../app/planning-context';
import ProtectedPlanList from '../../app/protected-plan-list';
import ProtectedPlanningOverview from '../../app/protected-planning-overview';
import {LasarOverviewContext} from '../../app/protected-lasar-overview';
import {UnsavedChangesProvider,useHasUnsaved,useUnsavedChanges} from '../../lib/unsaved-changes';
import {planningRowLocation,planLocationQuery,readPlanLocation,type PlanLocation} from '../../lib/protected-plan-location';
import type {PlanningRow,PlanningSchoolTimplan} from '../../lib/planning-year-contract';
// Kalenderstatus per skola (05.1.1-12): /api/lasar/oversikt besvaras här i webbläsaren med en syntetisk skola, så att specens nätmock för planeringen är oförändrad.
const realFetch=window.fetch.bind(window),uid=(n:number)=>`99101500-0000-4000-8000-${String(n).padStart(12,'0')}`;
window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(url.pathname!=='/api/lasar/oversikt')return realFetch(input,init);
 const {schoolYear}=JSON.parse(typeof init?.body==='string'?init.body:'{}') as {schoolYear:number};
 return new Response(JSON.stringify({contractVersion:'lasar_sql_v1',schoolYear,mode:'eget',frame:null,schools:[{unitId:uid(2),schoolName:'Norrby gymnasium',status:'forslag',versions:[{versionId:uid(777),version:1,status:'forslag',decidedOn:null,current:false}],frameChanged:false,changeRequested:false,waitingFor:'huvudman'}]}),{status:200,headers:{'Content-Type':'application/json'}});};
const lasarLinks={actorRole:'huvudman' as const,onOpen:()=>undefined,onSecurityFailure:()=>false};
function Body({location,transition}:{location:PlanLocation;transition:(location:PlanLocation,mode?:'push'|'replace')=>void}){
 const {selection}=usePlanningContext(),blocked=useHasUnsaved('navigation-block:');
 const [unknown,setUnknown]=useState(false);useUnsavedChanges('navigation-block:synthetic',unknown);
 const detail=location.view==='timplaner'?location.gym?.id??location.other?.id:location.programplan?.planId;
 if(!selection)return null;
 const open=(row:PlanningRow)=>{if(blocked)return;const next=planningRowLocation(row,selection);if(next)transition(next);};
 const timplan=(row:PlanningRow,target?:PlanningSchoolTimplan)=>{if(blocked||!target)return;transition({view:'timplaner',gym:{kind:'plan',id:target.id,offeringId:row.offeringId,unitId:row.unitId,version:target.version},planning:{...selection,schoolform:'gymnasium',unitId:row.unitId,page:1,selectionRevision:null}});};
 return <><label><input type="checkbox" checked={unknown} onChange={e=>setUnknown(e.target.checked)}/>Simulera okänd sparstatus</label>{detail?<section aria-label="Öppnad plan"><h1>Vald plan</h1><output data-testid="plan-id">{detail}</output><p>Detaljvyn simuleras här; navigationen använder exakt plan-ID.</p></section>:location.overview?<LasarOverviewContext.Provider value={lasarLinks}><ProtectedPlanningOverview onSecurityFailure={()=>false} onOpen={open} onShowPlans={()=>transition({...location,overview:false})} onChooseCollection={(view,schoolform)=>transition(view==='programplan'?{view:'programplaner',programplan:null,overview:true,planning:{...selection,schoolform}}:{view:'timplaner',gym:null,overview:true,planning:{...selection,schoolform}})}/></LasarOverviewContext.Provider>:<ProtectedPlanList onSecurityFailure={()=>false} onOpen={open} {...(location.view==='programplaner'?{programRows:{canCreateTimplan:true,onTimplan:timplan}}:{})}/>}</>;
}
function App(){
 const [location,setLocation]=useState(()=>readPlanLocation(window.location.search)??{view:'timplaner',gym:null,overview:true} as PlanLocation),[scope,setScope]=useState(1);
 useEffect(()=>{const pop=()=>{const next=readPlanLocation(window.location.search);if(next)setLocation(next);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const transition=(next:PlanLocation,mode:'push'|'replace'='push')=>{history[mode==='push'?'pushState':'replaceState']({},'',planLocationQuery(next));setLocation(next);};
 return <UnsavedChangesProvider><PlanningContextProvider contextKey={`named:${scope}`} active location={location} onTransition={transition} onSessionLost={()=>{throw Error('Unexpected security failure');}}><main className="workspace"><button onClick={()=>setScope(n=>n+1)}>Simulera uppdragsbyte</button><PlanningContextBar/><Body location={location} transition={transition}/></main></PlanningContextProvider></UnsavedChangesProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
