import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import NamedTimplanActions,{type TimplanAction} from '../../app/named-timplan-actions';
import {UnsavedChangesProvider} from '../../lib/unsaved-changes';
import {operationPlan,oid} from './operational-data';
import type {GymTimplan,GymTimplanUnderlag} from '../../lib/gym-timplan';
import '../../app/globals.css';
import '../../app/protected-gym-timplan.css';
const params=new URLSearchParams(location.search);
const plan:GymTimplan={...operationPlan,canPlan:true,series:{id:oid(50),name:'Grundfördelning',revision:0},nameAtCreation:'Grundfördelning'};
const basis:GymTimplanUnderlag={source:plan.source,rows:params.has('changed')?plan.rows.map(r=>({...r,pointTerms:[25,75,0,0,0,0]})):plan.rows,readiness:{ready:true,missing:[]},units:[{unitId:plan.unitId,schoolName:plan.schoolName,canPlan:true,plans:[{id:plan.id,version:1,revision:plan.revision,status:plan.status,sourcePlanId:plan.source.planId,sourceRevision:plan.source.revision,sourceVersion:1,series:plan.series},{id:oid(19),version:1,revision:4,status:'utkast',sourcePlanId:plan.source.planId,sourceRevision:plan.source.revision,sourceVersion:1,series:{id:oid(51),name:'Mer matematik',revision:0}}]}]};
function Harness(){const[action,setAction]=useState<TimplanAction|null>(null),[blocked,setBlocked]=useState(false),[current,setCurrent]=useState(plan),[notice,setNotice]=useState('');return <main style={{padding:'1rem',maxWidth:'1000px',margin:'auto'}}><h1>{current.series?.name}</h1><p>{current.schoolName} · version {current.version}</p><p role="status">{notice}</p><button disabled={blocked}>Lämna arbetsytan</button><button data-named-timplan-action={`new:${plan.unitId}`} disabled={blocked} onClick={()=>setAction({kind:'new',basis,unit:basis.units[0]})}>Skapa ny timplan</button><button data-named-timplan-action={`rename:${plan.unitId}`} disabled={blocked} onClick={()=>setAction({kind:'rename',plan:current})}>Byt namn</button><button data-named-timplan-action={`version:${plan.unitId}`} disabled={blocked} onClick={()=>setAction({kind:'version',basis,unit:basis.units[0],previous:basis.units[0].plans[0]})}>Skapa ny version</button><NamedTimplanActions scope={`synthetic-named:${params.get('scope')??'one'}`} action={action} returnTo={location.pathname+location.search} onClose={()=>setAction(null)} onBlocked={setBlocked} onSaved={(fresh,text)=>{setCurrent(fresh);setNotice(text);}} onSecurityFailure={()=>false}/></main>;}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
