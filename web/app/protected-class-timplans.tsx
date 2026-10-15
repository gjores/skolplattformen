'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseClassPlanUnderlag, parseClassPlanCreateReply, parseClassPlanLinkReply,
  type ClassPlanUnderlag, type ClassPlanCreateRequest, type ClassPlanLinkRequest, type ClassPlanColumn } from '@/lib/class-timplan.ts';
import type { GymTimplan } from '@/lib/gym-timplan.ts';
import MfaStepUpNotice from './mfa-step-up';
import './protected-class-timplans.css';

type Pending = {kind:'create';request:ClassPlanCreateRequest} | {kind:'link';request:ClassPlanLinkRequest};
type Props = {plan:GymTimplan;schoolYear:number;canPrepare:boolean;disabled:boolean;onSecurityFailure:(error:unknown)=>boolean};
const yearLabel = (year:number) => `${year}/${String(year+1).slice(-2)}`;
function frozenStartYear(value:string|null):number|null {
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return null;
  return date.getUTCFullYear()-(date.getUTCMonth()<6?1:0);
}
export default function ProtectedClassTimplans({plan,schoolYear,canPrepare,disabled,onSecurityFailure}:Props) {
  const [open,setOpen]=useState(false),[year,setYear]=useState(schoolYear),[data,setData]=useState<ClassPlanUnderlag|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [name,setName]=useState(''),[selected,setSelected]=useState(''),[confirmation,setConfirmation]=useState<ClassPlanLinkRequest|null>(null);
  const [pending,setPending]=useState<Pending|null>(null),[mfa,setMfa]=useState(false),[uncertain,setUncertain]=useState(false);
  const active=useRef(true),running=useRef(false),generation=useRef(0);
  const yearSelect=useRef<HTMLSelectElement>(null),restoreYearFocus=useRef(false);
  useEffect(()=>{if(!busy&&restoreYearFocus.current){restoreYearFocus.current=false;yearSelect.current?.focus();}},[busy]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  // Unknown command outcomes must be resolved with the same command ID before navigating away.
  useUnsavedChanges(`navigation-block:class-plan:${plan.id}`,busy||uncertain);
  useUnsavedChanges(`class-plan-form:${plan.id}`,name.trim().length>0||!!confirmation);
  const valid = data?.plan.id===plan.id && data.plan.unitId===plan.unitId && data.plan.offeringId===plan.offeringId && data.plan.revision===plan.revision;
  const firstYear=data?.plan.startYear??null;
  const sourceYear=frozenStartYear(plan.source.startedOn);
  const consistentStart=sourceYear!==null&&firstYear!==null&&sourceYear===firstYear;
  const allowedYears=consistentStart?[firstYear,firstYear+1,firstYear+2]:[];
  const canManage=valid&&data.schoolYear===year&&data.canManage&&consistentStart&&!error&&!disabled;
  const outsidePlanningYear=consistentStart&&!allowedYears.includes(schoolYear);
  const relative=data?.plan.startYear===null||data?.plan.startYear===undefined?null:year-data.plan.startYear;
  const column:ClassPlanColumn|null=relative!==null&&relative>=0&&relative<=2?(['ar1','ar2','ar3'] as const)[relative]:null;
  const chosen=data?.classes.find(c=>c.id===selected);
  async function fetchData(nextYear:number) {
    const input={planId:plan.id,schoolYear:nextYear};
    const result=parseClassPlanUnderlag(await api.post('/api/klasser/underlag',input),input);
    if(result.plan.unitId!==plan.unitId||result.plan.offeringId!==plan.offeringId)throw new Error('wrong_class_scope');
    return result;
  }
  async function load(nextYear=year) {
    if(running.current||uncertain)return;
    restoreYearFocus.current=document.activeElement===yearSelect.current;
    const token=++generation.current;setBusy(true);setError(null);setYear(nextYear);
    try{const result=await fetchData(nextYear);if(active.current&&token===generation.current)setData(result);}
    catch(caught){if(active.current&&token===generation.current&&!onSecurityFailure(caught))setError(caught instanceof ApiError?caught.message:'Klasskopplingarna kunde inte läsas. Försök igen.');}
    finally{if(active.current&&token===generation.current)setBusy(false);}
  }
  async function execute(command:Pending) {
    if(running.current||disabled||(!uncertain&&!canManage))return;
    running.current=true;setPending(command);setBusy(true);setError(null);setMfa(false);let accepted=false;
    try{
      if(command.kind==='create'){
        const reply=parseClassPlanCreateReply(await api.post('/api/klasser/skapa',command.request),command.request);accepted=true;
        if(active.current){setSelected(reply.id);setName('');setNotice(`Klassen ${reply.name} är skapad. Välj Koppla klass för att använda timplanen.`);}
      }else{
        parseClassPlanLinkReply(await api.post('/api/klasser/koppla',command.request),command.request);accepted=true;
        if(active.current)setNotice(`Klassens koppling till timplan version ${plan.version} för ${yearLabel(command.request.schoolYear)} är sparad.`);
      }
      const result=await fetchData(year);
      if(active.current){setData(result);setPending(null);setConfirmation(null);setUncertain(false);}
    }catch(caught){
      if(!active.current||onSecurityFailure(caught))return;
      const unknown=accepted||uncertain||!(caught instanceof ApiError&&caught.hasExplicitCode);
      setUncertain(unknown);setMfa(caught instanceof ApiError&&caught.code==='mfa_required');
      setError(unknown?'Svaret kunde inte bekräftas. Hämta sparstatus med samma begäran innan du fortsätter.':caught instanceof ApiError&&caught.status===409&&!['class_name_year_conflict','class_cohort_start_locked','class_plan_not_ready'].includes(caught.code)?'Uppgiften har ändrats. Läs om klasskopplingar och granska det aktuella valet innan du försöker igen.':caught instanceof ApiError?caught.message:'Ändringen kunde inte sparas.');
      if(!unknown){setPending(null);setConfirmation(null);if(caught instanceof ApiError&&caught.status===409)setData(null);}
    }finally{running.current=false;if(active.current)setBusy(false);}
  }
  function prepareLink(){
    if(!data||!chosen||!column||!canManage||busy||uncertain)return;
    setConfirmation({commandId:crypto.randomUUID(),classId:chosen.id,schoolYear:year,planId:plan.id,expectedPlanRevision:data.plan.revision,columnId:column,
      expectedLinkRevision:chosen.link?.revision??null,previousPlanId:chosen.link?.planId??null});
  }
  if(!['faststalld','ersatt'].includes(plan.status))return null;
  return <section className="class-timplans" aria-label="Klasser och läsår">
    <div className="class-plan-heading"><div><h2>Klasser och läsår</h2><p>Klassen använder den version du väljer. En ny timplansversion flyttar inte befintliga klasskopplingar.</p></div>
      <Button variant="outline" disabled={disabled||busy||uncertain} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?'Dölj klasskopplingar':canPrepare&&plan.status==='faststalld'?'Koppla klass':'Visa klasskopplingar'}</Button></div>
    {open&&<div aria-busy={busy}>
      <dl className="class-plan-dates">
        <div><dt>Valt planeringsår</dt><dd>{yearLabel(schoolYear)}</dd></div>
        <div><dt>Fryst utbildningsstart</dt><dd>{plan.source.startedOn??'Saknas'}</dd></div>
        <div><dt>Första läsår</dt><dd>{firstYear===null?'Okänt':yearLabel(firstYear)}</dd></div>
      </dl>
      {outsidePlanningYear&&<p className="class-plan-year-notice">Planeringsåret {yearLabel(schoolYear)} ligger utanför utbildningens tre läsår. Välj ett giltigt läsår för klasskopplingen. Ditt planeringsår ändras inte.</p>}
      <div className="class-plan-controls"><label>Läsår för klassens timplan<select ref={yearSelect} aria-label="Läsår för klasskoppling" value={allowedYears.includes(year)?year:''} disabled={busy||uncertain||disabled||!consistentStart} onChange={event=>{setConfirmation(null);void load(Number(event.target.value));}}>
        {!allowedYears.includes(year)&&<option value="" disabled>Välj ett giltigt läsår</option>}
        {allowedYears.map((value,index)=><option key={value} value={value}>Årskurs {index+1} · {yearLabel(value)}</option>)}
      </select></label><Button variant="outline" disabled={busy||uncertain||disabled} onClick={()=>void load()}>Läs om klasskopplingar</Button></div>
      {error&&<p role="alert">{error}</p>}{mfa&&<MfaStepUpNotice message={error??'Verifiera med engångskod för att fortsätta.'}/>}
      {notice&&<output>{notice}</output>}{uncertain&&pending&&<Button disabled={busy||disabled} onClick={()=>void execute(pending)}>Hämta sparstatus</Button>}
      {busy&&!data&&<output>Hämtar klasskopplingar…</output>}
      {data&&<>
        {!consistentStart&&<p role="alert">Utbildningsstart och första läsår saknas eller stämmer inte överens. Läs om timplanen och kontrollera underlaget innan du skapar eller kopplar en klass.</p>}
        {!valid&&<p role="alert">Timplanen har ändrats. Läs om timplanen innan du ändrar en klasskoppling.</p>}
        {data.blockers.length>0&&<ul>{data.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        <h3>Kopplade till version {plan.version}</h3>
        {data.linkedClasses.length===0?<p>Inga klasser är kopplade till den här versionen.</p>:<ul className="class-plan-links">{data.linkedClasses.map(link=><li key={`${link.className}:${link.schoolYear}`}><strong>{link.className}</strong><span>{yearLabel(link.schoolYear)} · Årskurs {link.columnId.slice(2)} · Version {plan.version}</span>{link.legacy&&<span>Äldre namnkoppling – välj klassen nedan för att bekräfta kopplingen.</span>}</li>)}</ul>}
        {canManage&&column&&<>
          <div className="class-plan-controls"><label>Klass<select value={selected} disabled={busy||uncertain} onChange={event=>setSelected(event.target.value)}><option value="">Välj klass</option>{data.classes.filter(c=>c.startYear===data.plan.startYear).map(c=><option key={c.id} value={c.id}>{c.name}{c.link?` · Version ${c.link.version}`:' · Ingen timplan'}</option>)}</select></label>
            <Button disabled={busy||uncertain||!chosen||chosen.link?.planId===plan.id&&!chosen.link.legacy&&chosen.link.columnId===column} onClick={prepareLink}>Koppla vald klass</Button></div>
          {chosen&&<p>{chosen.link?`${chosen.name} använder version ${chosen.link.version} för ${yearLabel(year)}${chosen.link.legacy?' genom en äldre namnkoppling':''}.`:`${chosen.name} saknar timplan för ${yearLabel(year)}.`} Valet gäller årskurs {column.slice(2)} på {plan.schoolName}.</p>}
          <form className="class-plan-create" onSubmit={event=>{event.preventDefault();if(!busy&&!uncertain&&name.trim()&&data.plan.startYear!==null)void execute({kind:'create',request:{commandId:crypto.randomUUID(),planId:plan.id,expectedPlanRevision:data.plan.revision,name:name.trim().toUpperCase(),startYear:data.plan.startYear}});}}>
            <h3>Skapa klass för utbildningen</h3><p>{data.plan.educationName} · {plan.schoolName} · Första läsår {data.plan.startYear===null?'okänt':yearLabel(data.plan.startYear)}. Klassen skapas utan elever.</p><div className="class-plan-controls"><label>Klassnamn<input value={name} maxLength={60} disabled={busy||uncertain} onChange={event=>setName(event.target.value)} placeholder="Till exempel SA26A"/></label><Button type="submit" disabled={busy||uncertain||!name.trim()}>Skapa klass</Button></div>
          </form>
        </>}
      </>}
    </div>}
    <Dialog open={!!confirmation} onOpenChange={value=>{if(!value&&!busy&&!uncertain)setConfirmation(null);}}><DialogContent><DialogTitle>{chosen?.link?'Byt klassens timplan':'Koppla klass till timplan'}</DialogTitle><DialogDescription>{chosen?.name} · {plan.schoolName} · {yearLabel(year)}</DialogDescription>
      {chosen?.link&&<p>Nuvarande koppling: version {chosen.link.version}, årskurs {chosen.link.columnId.slice(2)}{chosen.link.legacy?' (äldre namnkoppling)':''}.</p>}
      <p>Ny koppling: fastställd version {plan.version}, årskurs {column?.slice(2)}. Övriga läsår behåller sina kopplingar.</p>
      {uncertain&&<p role="alert">{error}</p>}<div className="class-plan-controls"><Button variant="outline" disabled={busy||uncertain} onClick={()=>setConfirmation(null)}>Avbryt</Button><Button disabled={busy||disabled} onClick={()=>confirmation&&void execute({kind:'link',request:confirmation})}>{busy?'Sparar…':uncertain?'Hämta sparstatus':'Bekräfta koppling'}</Button></div>
    </DialogContent></Dialog>
  </section>;
}
