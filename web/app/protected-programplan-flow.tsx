'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges, confirmDiscard } from '@/lib/unsaved-changes.tsx';
import { parseProgramplanOfferingList, type ProgramplanEducationSummary } from '@/lib/programplan-workspace-contract.ts';
import { parseProgramplanSelection, parseProgramplanEducationCreated, type ProgramplanSelection, type ProgramplanSelectionRequest, type ProgramplanEducationCreateRequest } from '@/lib/programplan-education-contract.ts';
import { educationStatusForCommand, newEducationCommand } from '@/lib/protected-programplan-education.ts';
import { programplanOptions, programplanLevelName } from '@/lib/protected-programplan.ts';
import type { ProgramplanLevelRef } from '@/lib/programplan-catalog.ts';
import { LocalPlanBoard, localTermsValid } from './protected-programplan-board';
import { parseProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import type { ProgramplanTermDistribution } from '@/lib/programplan-terms.ts';
import MfaStepUpNotice from './mfa-step-up';
import { nextDay } from './protected-programplan-lifecycle';
import { startsAfter, stockholmToday } from '@/lib/programplan-lifecycle.ts';

type Props = { onOpen: (id: string, catalogId: string | null, planId?: string) => Promise<void>; onSecurityFailure: (error: unknown) => boolean; disabled: boolean; scope: string; initialMode?: 'existing' | 'new' };
const empty: ProgramplanSelectionRequest = { unitId: null, catalogId: null, programRef: null };
export default function ProtectedProgramplanFlow({ onOpen, onSecurityFailure, disabled, scope, initialMode = 'existing' }: Props) {
  const [data,setData]=useState<ProgramplanSelection|null>(null), [offerings,setOfferings]=useState<ProgramplanEducationSummary[]>([]);
  const [chosenMode,setMode]=useState<'existing'|'new'>(initialMode),[orientation,setOrientation]=useState<string|null>(null),[orientationChosen,setOrientationChosen]=useState(false);
  const [programCode,setProgramCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[mfa,setMfa]=useState(false);
  const [name,setName]=useState(''),[cohort,setCohort]=useState(''),[localCode,setLocalCode]=useState(''),[startedOn,setStartedOn]=useState('');
  const [refs,setRefs]=useState<ProgramplanLevelRef[]>([]),[terms,setTerms]=useState<ProgramplanTermDistribution>([]),[reviewing,setReviewing]=useState(false),[command,setCommand]=useState<ProgramplanEducationCreateRequest|null>(null);
  const [unresolved,setUnresolved]=useState(false),[retryAllowed,setRetryAllowed]=useState(false);
  const mode=chosenMode==='new'&&data&&!data.canCreateEducation?'existing':chosenMode;
  const generation=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true),saving=useRef(false),reviewRef=useRef<HTMLElement|null>(null);
  const dirty=mode==='new'&&!!(name||cohort||localCode||startedOn||refs.length||terms.length||command);
  useUnsavedChanges(`new-program-education-${scope}`,dirty||busy&&command!==null);
  const invalidate=useCallback(()=>{generation.current++;controller.current?.abort();controller.current=null;},[]);
  const begin=useCallback(()=>{invalidate();const c=new AbortController();controller.current=c;return{signal:c.signal,token:generation.current};},[invalidate]);
  const current=useCallback((token:number)=>mounted.current&&generation.current===token,[]);
  function resetDraft(){setName('');setCohort('');setLocalCode('');setStartedOn('');setRefs([]);setTerms([]);setCommand(null);setReviewing(false);setUnresolved(false);setRetryAllowed(false);setMfa(false);}
  const load=useCallback(async (selection:ProgramplanSelectionRequest, initial=false)=>{
    const r=begin();setBusy(true);setError(null);setData(null);
    try{
      let selected=parseProgramplanSelection(await api.post('/api/programplaner/val',selection,r.signal),selection);
      if(initial){
        const first=parseProgramplanOfferingList(await api.post('/api/programplaner/lista',{page:1},r.signal),1), all=[...first.offerings];
        for(let page=2;page<=Math.ceil(first.count/50);page++){
          const extra=parseProgramplanOfferingList(await api.post('/api/programplaner/lista',{page},r.signal),page);
          if(extra.count!==first.count)throw new Error('Utbildningslistan ändrades. Läs om innan du väljer.');
          all.push(...extra.offerings);
        }
        if(new Set(all.map(o=>o.id)).size!==all.length)throw new Error('Utbildningslistan ändrades.');
        if(selected.units.length===1){const next={...empty,unitId:selected.units[0].id};selected=parseProgramplanSelection(await api.post('/api/programplaner/val',next,r.signal),next);}
        if(current(r.token))setOfferings(all);
      }
      if(selected.selection.unitId&&selected.selection.catalogId===null&&selected.catalogs.length===1){
        const next={...selected.selection,catalogId:selected.catalogs[0].catalogId};
        selected=parseProgramplanSelection(await api.post('/api/programplaner/val',next,r.signal),next);
      }
      if(current(r.token))setData(selected);
    }catch(e){if(current(r.token)&&!(e instanceof DOMException&&e.name==='AbortError')&&!onSecurityFailure(e))setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Valen kunde inte hämtas.');}
    finally{if(current(r.token))setBusy(false);}
  },[begin,current,onSecurityFailure]);
  useEffect(()=>{mounted.current=true;queueMicrotask(()=>{if(mounted.current)void load(empty,true);});return()=>{mounted.current=false;invalidate();};},[load,invalidate]);
  useEffect(()=>{if(!reviewing)return;const frame=requestAnimationFrame(()=>reviewRef.current?.focus());return()=>cancelAnimationFrame(frame);},[reviewing]);
  const locked=disabled||busy||unresolved;
  const program=data?.projection?.program??null;
  const schools=data?.units??[];
  const unitId=data?.selection.unitId??null;
  const schoolName=schools.find(s=>s.id===unitId)?.name??'';
  const selectedProgram=data?.programs.find(p=>p.programRef.code===data.selection.programRef?.code&&p.programRef.version===data.selection.programRef?.version);
  const programValue=selectedProgram?`${selectedProgram.programRef.code}:${selectedProgram.programRef.version}`:programCode;
  const knownCodes=new Set(data?.programs.map(p=>p.programRef.code)??[]);
  const schoolOfferings=offerings.filter(o=>!unitId||o.unitId===unitId);
  const legacyCodes=[...new Set(schoolOfferings.map(o=>o.programCode))].filter(code=>!knownCodes.has(code));
  const orientationRows=selectedProgram?.orientations??[];
  const olderOrientations=[...new Set(schoolOfferings.filter(o=>o.programCode===programCode).map(o=>o.orientationCode))].filter(code=>!orientationRows.some(o=>o.code===code));
  const matches=schoolOfferings.filter(o=>o.programCode===programCode&&o.orientationCode===orientation);
  const options=program&&orientationChosen?programplanOptions({education:{orientationCode:orientation},catalog:{status:'selected',program,subjects:data!.projection!.subjects}} as Parameters<typeof programplanOptions>[0]):[];
  function allowChange(){return !locked&&(!dirty||confirmDiscard());}
  function changeMode(next:'existing'|'new'){if(next===mode||!allowChange())return;resetDraft();setMode(next);}
  function changeProgram(value:string){
    if(!allowChange()||!data)return;resetDraft();setOrientation(null);setOrientationChosen(false);
    const chosen=data.programs.find(p=>`${p.programRef.code}:${p.programRef.version}`===value);
    const ref=chosen?.programRef??null;setProgramCode(ref?.code??value);
    if(ref){const p=chosen!;if(p.orientations.length===0)setOrientationChosen(true);}
    void load({...data.selection,programRef:ref});
  }
  function changeOrientation(value:string){if(!allowChange())return;resetDraft();setOrientation(value||null);setOrientationChosen(true);}
  const sourcePanel=data&&unitId?<details className={data.selection.catalogId?"pp-flow-source pps-fineprint":"pp-flow-source"} open={!data.selection.catalogId}><summary>Programunderlag{data.projection?` · Skolverket ${data.projection.source.fetched}`:''}</summary><div className="pp-field"><label htmlFor="pp-flow-catalog">Välj underlag</label><select id="pp-flow-catalog" value={data.selection.catalogId??''} disabled={locked} onChange={e=>{if(allowChange()){resetDraft();setProgramCode('');setOrientationChosen(false);void load({unitId,catalogId:e.target.value||null,programRef:null});}}}><option value="">Välj underlag från Skolverket</option>{data.catalogs.map(c=><option key={c.catalogId} value={c.catalogId}>Skolverket · hämtat {c.source.fetched}</option>)}</select></div><p>Program och nivåer hör till detta exakta underlag. En befintlig bunden plan öppnas med sitt eget sparade underlag.</p></details>:null;
  async function openCreated(commandValue:ProgramplanEducationCreateRequest, value:unknown){
    const created=parseProgramplanEducationCreated(value,commandValue);
    if(terms.length){try{const reply=parseProgramplanTermReply(await api.post('/api/programplaner/terminer',{planId:created.plan.id,expectedRevision:created.plan.revision,distribution:terms}));if(reply.planId!==created.plan.id)throw new Error('Fel plan.');}catch(e){if(onSecurityFailure(e))return;}}
    await onOpen(created.education.id,created.plan.catalogId,created.plan.id);
  }
  async function resolveCommand(own:ProgramplanEducationCreateRequest,token:number,signal:AbortSignal){
    setUnresolved(true);setRetryAllowed(false);
    try{
      const status=educationStatusForCommand(await api.post('/api/programplaner/utbildning/status',{commandId:own.commandId},signal),own);
      if(!current(token))return;
      if(status.status==='created'){await openCreated(own,{commandId:status.commandId,education:status.education,plan:status.plan,replayed:true});return;}
      setUnresolved(false);setRetryAllowed(true);setError('Ingen utbildning är sparad för försöket. Du kan uttryckligen försöka igen med samma uppgifter.');
    }catch(e){if(current(token)&&!(e instanceof DOMException&&e.name==='AbortError')&&!onSecurityFailure(e))setError('Sparandet kan inte avgöras ännu. Dina uppgifter finns kvar. Läs sparstatus innan du gör ett nytt försök.');}
  }
  async function save(){
    if(!reviewing||locked||saving.current||!data?.canCreateEducation||!program||!orientationChosen)return;
    if(!command&&program&&!localTermsValid(program,orientation,refs,terms)){setReviewing(false);setError('Rätta rader med fler poäng än nivån har innan du sparar.');return;}
    let own=command;
    try{own??=newEducationCommand({unitId:unitId!,name,cohort,localCode:localCode.trim()||null,basisReference:{catalogId:data.projection!.catalogId,programRef:{code:program.code,version:program.version},orientationCode:orientation,startedOn,specializationRefs:refs}},crypto.randomUUID());}
    catch{setReviewing(false);setError('Ange utbildningens namn, elevkull och verkliga startdatum. Kontrollera fördjupningsvalen.');return;}
    setCommand(own);setRetryAllowed(false);saving.current=true;const r=begin();setBusy(true);setError(null);setMfa(false);
    try{const reply=await api.post('/api/programplaner/utbildning/skapa',own,r.signal);if(current(r.token))await openCreated(own,reply);}
    catch(e){
      if(!current(r.token)||e instanceof DOMException&&e.name==='AbortError'||onSecurityFailure(e))return;
      if(e instanceof ApiError&&e.hasExplicitCode&&(e.code==='mfa_required'||e.code==='bad_request'||e.code==='audit_unavailable'||e.code==='programplan_start_passed')){
        setError(`Kunde inte spara. ${e.message}`);setMfa(e.code==='mfa_required');setRetryAllowed(true);
        if(e.code==='bad_request'||e.code==='programplan_start_passed'){setCommand(null);setReviewing(false);}
      }else await resolveCommand(own,r.token,r.signal);
    }finally{saving.current=false;if(current(r.token))setBusy(false);}
  }
  async function readStatus(){if(!command||busy||disabled)return;const r=begin();setBusy(true);setError(null);try{await resolveCommand(command,r.token,r.signal);}finally{if(current(r.token))setBusy(false);}}
  function editAgain(){if(locked)return;setCommand(null);setRetryAllowed(false);setReviewing(false);setError(null);}
  return <section className="pp-flow" aria-label="Program, inriktning och fördjupning" aria-busy={busy}>
    <ol className="pp-flow-steps pps-stepper">{([['Program',!programCode,!!programCode],['Inriktning',!!programCode&&!orientationChosen,!!programCode&&orientationChosen],['Programfördjupning',!!programCode&&orientationChosen,false]] as const).map(([label,active,done],i)=><li key={label} aria-current={active?'step':undefined} data-done={done}><span aria-hidden="true">{done?'✓':i+1}</span>{i+1}. {label}</li>)}</ol>
    {error&&<div className="pp-alert" role="alert"><p>{error}</p>{!data&&!busy&&<Button onClick={()=>void load(empty,true)}>Läs valen igen</Button>}</div>}
    {busy&&<output>Hämtar aktuella val…</output>}
    {data&&<>
      <div className="pp-flow-support"><div className="pp-field"><label htmlFor="pp-flow-school">Skola</label><select id="pp-flow-school" value={unitId??''} disabled={locked} onChange={e=>{if(allowChange()){resetDraft();setProgramCode('');setOrientationChosen(false);void load({...empty,unitId:e.target.value||null});}}}><option value="">Välj skola</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <fieldset className="pp-flow-mode" aria-label="Befintlig eller ny utbildning"><Button data-active={mode==='existing'} variant={mode==='existing'?'default':'outline'} disabled={locked} onClick={()=>changeMode('existing')}>Befintlig utbildning</Button>{data.canCreateEducation?<Button data-active={mode==='new'} variant={mode==='new'?'default':'outline'} disabled={locked||!unitId} onClick={()=>changeMode('new')}>Ny utbildning</Button>:<p>Huvudmannen lägger till nya utbildningar. Du kan arbeta med skolans befintliga programplaner.</p>}</fieldset></div>
      {!data.selection.catalogId&&sourcePanel}
      <div className="pp-flow-selection"><div className="pp-field"><label htmlFor="pp-flow-program">1. Program</label><select id="pp-flow-program" value={programValue} disabled={locked||!unitId||mode==='new'&&!data.selection.catalogId} onChange={e=>changeProgram(e.target.value)}><option value="">Välj program</option>{data.programs.map(p=><option key={`${p.programRef.code}:${p.programRef.version}`} value={`${p.programRef.code}:${p.programRef.version}`}>{p.name} · version {p.programRef.version}</option>)}{mode==='existing'&&legacyCodes.map(code=><option key={code} value={code}>{code} · befintlig utbildning</option>)}</select></div>
      {programCode&&<div className="pp-field"><label htmlFor="pp-flow-orientation">2. Inriktning</label>{selectedProgram&&orientationRows.length===0&&!(mode==='existing'&&olderOrientations.some(code=>code!==null))?<p>Programmet har ingen inriktning.</p>:<select id="pp-flow-orientation" value={orientationChosen?orientation??'__none__':''} disabled={locked} onChange={e=>changeOrientation(e.target.value==='__none__'?'':e.target.value)}><option value="">Välj inriktning</option>{selectedProgram&&orientationRows.length===0&&<option value="__none__">Ingen inriktning</option>}{orientationRows.map(o=><option key={o.code} value={o.code}>{o.name}</option>)}{mode==='existing'&&olderOrientations.filter(code=>code!==null||!selectedProgram||orientationRows.length>0).map(code=><option key={code??'__none__'} value={code??'__none__'}>{code??'Ingen inriktning angiven'} · äldre uppgift</option>)}</select>}</div>}</div>
      {programCode&&orientationChosen&&mode==='existing'&&<section aria-label="Välj utbildning och elevkull"><h2>Välj utbildning och elevkull</h2>{matches.length===0?<p>Skolan har ingen utbildning med det här programmet och den här inriktningen.</p>:<div className="pp-choices">{matches.map(o=><button key={o.id} className="pp-choice" disabled={locked} aria-label={`Öppna utbildning ${o.name}, ${o.cohort}, ${o.schoolName}`} onClick={()=>void onOpen(o.id,null)}><strong>{o.name}</strong><span>{o.schoolName} · {o.cohort}</span><span>{o.latestVersion?`Senaste version ${o.latestVersion}`:'Ingen programplan ännu'}</span></button>)}</div>}</section>}
      {mode==='new'&&program&&orientationChosen&&<section className="pp-new-education" aria-label="Ny utbildning och programfördjupning">
        <h2>Ny utbildning</h2><p>{program.name}{orientation&&` · ${program.orientations.find(o=>o.code===orientation)?.name}`} · {schoolName}</p>
        {mfa&&<MfaStepUpNotice message={error??'Verifiering med engångskod krävs.'} detail="Dina uppgifter finns kvar tills du lämnar sidan."/>}
        <div hidden={reviewing}><div className="pp-new-fields"><div className="pp-field"><label htmlFor="pp-new-name">Utbildningens namn</label><input id="pp-new-name" value={name} disabled={locked} maxLength={120} onChange={e=>setName(e.target.value)}/></div><div className="pp-field"><label htmlFor="pp-new-cohort">Elevkull</label><input id="pp-new-cohort" value={cohort} disabled={locked} maxLength={120} placeholder="Till exempel 2026–2029" onChange={e=>setCohort(e.target.value)}/></div><div className="pp-field"><label htmlFor="pp-new-code">Lokal kod (valfri)</label><input id="pp-new-code" value={localCode} disabled={locked} maxLength={80} onChange={e=>setLocalCode(e.target.value)}/></div><div className="pp-field"><label htmlFor="pp-new-start">Utbildningens exakta startdatum</label><input id="pp-new-start" type="date" min={nextDay(stockholmToday())} value={startedOn} disabled={locked} aria-invalid={!!startedOn&&!startsAfter(startedOn)} onChange={e=>setStartedOn(e.target.value)}/><p>{startedOn&&!startsAfter(startedOn)?'Startdatumet måste ligga efter i dag. En ny plan kan bara skapas för en kull som inte har börjat.':'Ange den verkliga dagen enligt utbildningens uppgifter. Den ska ligga efter i dag.'}</p></div></div>
        <LocalPlanBoard program={program} orientationCode={orientation} options={options} refs={refs} terms={terms} refsEditable={!locked} disabled={locked} onChange={(nextRefs,nextTerms)=>{setRefs(nextRefs);setTerms(nextTerms);}}/></div>
        {reviewing&&<section ref={reviewRef} tabIndex={-1} className="pp-save-help" aria-label="Kontrollera före sparning"><h3>Ny utbildning och första utkastet</h3><dl className="pp-review"><dt>Utbildning</dt><dd>{name}</dd><dt>Elevkull</dt><dd>{cohort}</dd><dt>Skola</dt><dd>{schoolName}</dd><dt>Program</dt><dd>{program.name}</dd><dt>Inriktning</dt><dd>{orientation?program.orientations.find(o=>o.code===orientation)?.name:'Ingen inriktning'}</dd><dt>Utbildningsstart</dt><dd>{startedOn||'Datum saknas'}</dd></dl><ol className="pp-review-levels">{refs.map(r=><li key={r.itemCode}>{programplanLevelName(r,options)} · {r.points} poäng</li>)}</ol><p>{refs.length===0?'Inga fördjupningsnivåer valda. ':''}Spara skapar utbildningen och första programplansutkastet tillsammans. Planen fastställs inte.</p></section>}
        <div className="pp-dialog-actions"><Button variant="outline" disabled={locked} onClick={()=>{if(!dirty||confirmDiscard())resetDraft();}}>Avbryt</Button>{unresolved?<Button disabled={busy||disabled} onClick={()=>void readStatus()}>Läs sparstatus</Button>:reviewing?<><Button variant="outline" disabled={busy} onClick={editAgain}>Tillbaka till uppgifterna</Button><Button disabled={busy||!!command&&!retryAllowed} onClick={()=>void save()}>{busy?'Sparar…':retryAllowed?'Försök spara samma utbildning igen':'Spara utbildning och utkast'}</Button></>:<Button disabled={locked||!!startedOn&&!startsAfter(startedOn)} onClick={()=>setReviewing(true)}>Granska utkast</Button>}</div>
      </section>}
      {data.selection.catalogId&&sourcePanel}
    </>}
  </section>;
}
