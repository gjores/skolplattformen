import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DatePicker} from '../../components/ui/date-picker';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '../../components/ui/dialog';
import '../../app/globals.css';
function Harness(){const[value,setValue]=useState('2026-12-31'),[locked,setLocked]=useState(false),[saved,setSaved]=useState(''),[dialog,setDialog]=useState(false),[changes,setChanges]=useState(0);
 const change=(v:string)=>{setValue(v);setChanges(n=>n+1);};
 return <main style={{padding:24,maxWidth:700,margin:'auto'}}><h1>Datum med veckonummer</h1><p>Datum väljs utan automatisk sparning.</p>
 <form onSubmit={e=>{e.preventDefault();const v=new FormData(e.currentTarget).get('date');setSaved(typeof v==='string'?v:'');}}>
 <label htmlFor="fixture-date">Datum</label><DatePicker id="fixture-date" name="date" value={value} onValueChange={change}/><button type="submit">Spara formulär</button></form>
 <output data-testid="value">{value}</output><output data-testid="saved">{saved}</output><output data-testid="changes">{changes}</output>
 <button type="button" onClick={()=>setValue('2028-02-29')}>Nytt värde utifrån</button>
 <label htmlFor="bounded-date">Avgränsat datum</label><DatePicker id="bounded-date" name="bounded" value={value} min="2026-12-30" max="2027-01-04" required onValueChange={change}/>
 <label htmlFor="readonly-date">Läsdatum</label><DatePicker id="readonly-date" value={value} readOnly onValueChange={change}/>
 <label htmlFor="disabled-date">Låst datum</label><DatePicker id="disabled-date" value={value} disabled onValueChange={change}/>
 <button onClick={()=>setLocked(!locked)}>Lås fältgruppen</button><fieldset disabled={locked}><legend>Fältgrupp</legend><label htmlFor="fieldset-date">Gruppdatum</label><DatePicker id="fieldset-date" value={value} onValueChange={change}/></fieldset>
 <Dialog open={dialog} onOpenChange={setDialog}><DialogTrigger>Öppna dialog</DialogTrigger><DialogContent><DialogTitle>Ändra placering</DialogTitle><DialogDescription>Prova datum i en dialog.</DialogDescription><label htmlFor="dialog-date">Placeringsdatum</label><DatePicker id="dialog-date" value={value} onValueChange={change}/><button onClick={()=>setDialog(false)}>Klar</button></DialogContent></Dialog></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
