import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProtectedGymTimplanHours from '../../app/protected-gym-timplan-hours';
import {UnsavedChangesProvider} from '../../lib/unsaved-changes';
import {operationPlan,oid} from './operational-data';
import type {GymTimplan} from '../../lib/gym-timplan';
import '../../app/globals.css';
import '../../app/protected-gym-timplan.css';
const row=operationPlan.rows[0];
export const distributionPlan:GymTimplan={...operationPlan,status:'utkast',canPlan:true,series:{id:oid(50),name:'SA26A – grundfördelning',revision:0},nameAtCreation:'SA26A – grundfördelning',rows:[{...row,points:2500,pointTerms:[500,500,500,500,250,250]}],hours:{[row.key]:[40,null,null,null,null,null]}};
function Harness(){const[current,setCurrent]=useState(distributionPlan),[blocked,setBlocked]=useState(false),[activity,setActivity]=useState(false),[year,setYear]=useState('0');return <main style={{padding:'1rem',maxWidth:'1100px',margin:'auto'}}><h1>Timplan</h1><button disabled={blocked}>Lämna arbetsytan</button><button disabled={activity}>Ändra APL</button><ProtectedGymTimplanHours plan={current} year={year} onYear={setYear} unsavedId="distribution-fixture" onSaved={setCurrent} onSaving={()=>{}} onNavigationBlocked={setBlocked} onActivity={setActivity} onSecurityFailure={()=>false}/></main>;}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
