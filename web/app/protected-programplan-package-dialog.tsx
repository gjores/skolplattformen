'use client';

import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {api,ApiError} from '@/lib/server-client.ts';
import {confirmDiscard,useUnsavedChanges} from '@/lib/unsaved-changes.tsx';
import artifact from '@/lib/programplan-catalog.generated.json';
import type {ProgramplanCatalog,ProgramplanLevelRef} from '@/lib/programplan-catalog.ts';
import {parseProgramplanValpaket,parseProgramplanValpaketList,programplanPackageLevelKey,programplanPackageLevelName,programplanValpaketSubjectAllowed,
  type ProgramplanValpaket,type ProgramplanValpaketList,type ProgramplanValpaketKind,type ProgramplanValpaketWriteRequest} from '@/lib/programplan-packages.ts';
import type {ProgramplanOption} from '@/lib/protected-programplan.ts';
import MfaStepUpNotice from './mfa-step-up';

const catalog=artifact as ProgramplanCatalog;
const kinds:Record<ProgramplanValpaketKind,string>={languageSubject:'Språkämnen',naturalScience:'Naturvetenskapliga ämnen',specialization:'Programfördjupning',individualChoice:'Individuellt val'};
type Props={scope:string;unitId:string;units:{id:string;name:string;inMandate:boolean}[];role:string;kind:ProgramplanValpaketKind;points:number;startedOn:string;fixedLevelKeys:string[];options:ProgramplanOption[];
  source:ProgramplanValpaket|null;available:ProgramplanValpaket[];onClose:()=>void;onSaved:(list:ProgramplanValpaketList,value:ProgramplanValpaket)=>void;onSecurityFailure:(e:unknown)=>boolean};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export default function ProgramplanPackageDialog(props:Props){
  const [name,setName]=useState(props.source?.name??''),[unitId,setUnitId]=useState(props.source?props.source.unitId??'':props.unitId),[kind,setKind]=useState(props.source?.kind??props.kind),[levels,setLevels]=useState<ProgramplanLevelRef[]>(props.source?.levels??[]),[search,setSearch]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[uncertain,setUncertain]=useState(false),[mfa,setMfa]=useState(false);
  const pending=useRef<{request:ProgramplanValpaketWriteRequest;previous:ProgramplanValpaket[]}|null>(null),inFlight=useRef(false);
  const dirty=props.source?!same({unitId:unitId||null,kind,name,levels},{unitId:props.source.unitId,kind:props.source.kind,name:props.source.name,levels:props.source.levels}):!!name||levels.length>0||unitId!==props.unitId||kind!==props.kind;
  useUnsavedChanges(`packages-${props.scope}-dialog`,dirty||busy);
  const mounted=useRef(true),controller=useRef(new AbortController());
  useEffect(()=>{mounted.current=true;const c=new AbortController();controller.current=c;return()=>{mounted.current=false;c.abort();};},[]);
  const inactive=(e:unknown)=>!mounted.current||e instanceof DOMException&&e.name==='AbortError';
  const total=levels.reduce((n,l)=>n+l.points,0),locked=busy||uncertain||mfa;
  const candidates=catalog.subjects.filter(s=>s.schoolTypes.includes('GY')&&s.typeOfSyllabus==='GRADE_SUBJECT_SYLLABUS'&&programplanValpaketSubjectAllowed(kind,s.code)&&s.startDate&&props.startedOn>=s.startDate&&(!s.endDate||props.startedOn<=s.endDate)&&(!s.canceledDate||props.startedOn<s.canceledDate)).flatMap(s=>s.items.map(i=>({subjectCode:s.code,subjectVersion:s.version,itemCode:i.code,points:i.points}))).filter(l=>!props.fixedLevelKeys.includes(programplanPackageLevelKey(l))&&(kind!=='specialization'||props.options.some(o=>o.subjectCode===l.subjectCode&&o.subjectVersion===l.subjectVersion&&o.itemCode===l.itemCode&&o.points===l.points)));
  const choices=candidates.filter(l=>!levels.some(p=>programplanPackageLevelKey(p)===programplanPackageLevelKey(l))&&`${programplanPackageLevelName(l)} ${l.itemCode}`.toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv'))).slice(0,80);
  function close(){if(!busy&&(!dirty||confirmDiscard()))props.onClose();}
  function matches(value:ProgramplanValpaket,request:ProgramplanValpaketWriteRequest){return value.version===request.expectedVersion+1&&(request.packageId===null||value.packageId===request.packageId)&&same({unitId:value.unitId,kind:value.kind,name:value.name,levels:value.levels},request.details);}
  async function reread(){return parseProgramplanValpaketList(await api.post('/api/programplaner/valpaket/lista',{unitId:unitId||props.unitId},controller.current.signal));}
  async function reconcile(){if(!mounted.current)return false;const own=pending.current;if(!own)return false;const list=await reread();if(!mounted.current)return false;if(list.unitId!==(unitId||props.unitId))throw Error('Fel skola i svaret.');const found=list.packages.filter(p=>matches(p,own.request)&&!own.previous.some(before=>before.packageId===p.packageId&&before.version===p.version));if(found.length===1){props.onSaved(list,found[0]);return true;}return false;}
  async function check(){if(inFlight.current)return;inFlight.current=true;setBusy(true);try{if(!await reconcile())setMessage('Sparandet är fortfarande obekräftat. Dina uppgifter finns kvar. Stäng dialogen och granska skolans utbud innan du skapar ett nytt paket.');}catch(e){if(!inactive(e)&&!props.onSecurityFailure(e))setMessage('Sparstatus kunde inte läsas. Försök läsa igen.');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
  async function save(){if(inFlight.current||locked||!name.trim()||total!==props.points||levels.some(l=>!candidates.some(c=>same(c,l))))return;
    const request:ProgramplanValpaketWriteRequest={packageId:props.source?.packageId??null,expectedVersion:props.source?.version??0,details:{unitId:unitId||null,kind,name:name.trim(),levels}};
    inFlight.current=true;setBusy(true);setMessage(null);let submitted=false;
    try{const before=await reread();if(!mounted.current)return;if(before.unitId!==(unitId||props.unitId))throw Error('Fel skola i svaret.');pending.current={request,previous:before.packages};submitted=true;const value=parseProgramplanValpaket(await api.post('/api/programplaner/valpaket',request,controller.current.signal));if(!matches(value,request))throw Error('Obekräftat svar.');if(!await reconcile())throw Error('Paketet kunde inte återläsas.');}
    catch(e){if(inactive(e)||props.onSecurityFailure(e))return;if(!submitted){setMessage('Skolans utbud kunde inte läsas. Paketet har inte skickats. Försök igen.');return;}if(e instanceof ApiError&&e.hasExplicitCode){setMfa(e.code==='mfa_required');setMessage(e.status===409?'Paketet har fått en ny version. Dina uppgifter finns kvar. Stäng och öppna Ny version igen.':e.message);if(e.status===409)setUncertain(true);}
      else{try{if(!await reconcile()){setUncertain(true);setMessage('Sparandet kunde inte bekräftas. Läs sparstatus innan du försöker igen.');}}catch(inner){if(!inactive(inner)&&!props.onSecurityFailure(inner)){setUncertain(true);setMessage('Sparstatus kunde inte läsas. Dina uppgifter finns kvar.');}}}}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="pp-dialog ppk-dialog" showCloseButton={!busy}>
    <DialogTitle>{props.source?'Ny version av valpaket':'Nytt valpaket'}</DialogTitle><DialogDescription>{props.source?`Version ${props.source.version} bevaras i planer som redan använder den.`:'Skapa skolans utbud och lägg sedan till paketet i blocket.'}</DialogDescription>
    <label>Namn<input aria-label="Paketnamn" value={name} maxLength={160} disabled={locked} onChange={e=>setName(e.target.value)}/></label>
    <label>Skola<select aria-label="Paketets skola" value={unitId} disabled={locked} onChange={e=>setUnitId(e.target.value)}>{props.role==='huvudman'&&<option value="">Alla huvudmannens skolor</option>}{props.units.filter(u=>u.inMandate).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <label>Typ<select aria-label="Pakettyp" value={kind} disabled={locked} onChange={e=>{setKind(e.target.value as ProgramplanValpaketKind);setLevels([]);}}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Sök nivå<input aria-label="Sök paketnivå" value={search} disabled={locked} onChange={e=>setSearch(e.target.value)}/></label>
    <ul className="ppk-level-choices" aria-label="Tillåtna paketnivåer">{choices.map(l=><li key={programplanPackageLevelKey(l)}><button type="button" disabled={locked||total+l.points>props.points} onClick={()=>setLevels([...levels,l])}>{programplanPackageLevelName(l)} · {l.points} poäng</button></li>)}</ul>
    <ul aria-label="Valda paketnivåer">{levels.map(l=><li key={programplanPackageLevelKey(l)}>{programplanPackageLevelName(l)} · {l.points} poäng <button type="button" disabled={locked} aria-label={`Ta bort nivå ${l.itemCode}`} onClick={()=>setLevels(levels.filter(p=>programplanPackageLevelKey(p)!==programplanPackageLevelKey(l)))}>Ta bort</button></li>)}</ul>
    <output>{total} av {props.points} poäng</output>{mfa?<MfaStepUpNotice message={message??'Verifiering med engångskod krävs.'}/>:message&&<output role="alert">{message}</output>}
    <div className="ppk-toolbar"><Button variant="outline" disabled={busy} onClick={close}>Avbryt</Button>{uncertain&&<Button variant="outline" disabled={busy} onClick={()=>void check()}>Läs sparstatus</Button>}<Button disabled={locked||total!==props.points||!name.trim()||!levels.length||levels.some(l=>!candidates.some(c=>same(c,l)))} onClick={()=>void save()}>{busy?'Sparar…':props.source?'Spara ny version':'Skapa valpaket'}</Button></div>
  </DialogContent></Dialog>;
}
