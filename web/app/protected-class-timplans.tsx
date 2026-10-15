'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseClassPlanUnderlag, parseClassPlanCreateReply, parseClassPlanLinkReply,
  type ClassPlanUnderlag, type ClassPlanCreateRequest, type ClassPlanLinkRequest, type ClassPlanColumn } from '@/lib/class-timplan.ts';
import { parseClassLinkQueue, reconcileClassLinkQueue, queueHasUnknown, queueComplete, updateQueueEntry, type ClassLinkQueue } from '@/lib/class-timplan-queue.ts';
import type { GymTimplan } from '@/lib/gym-timplan.ts';
import MfaStepUpNotice from './mfa-step-up';
import './protected-class-timplans.css';

type Pending = {kind:'create';request:ClassPlanCreateRequest} | {kind:'link';request:ClassPlanLinkRequest};
type Props = {openRequest?:number;scopeKey:string;returnTo:string;plan:GymTimplan;schoolYear:number;canPrepare:boolean;disabled:boolean;onSecurityFailure:(error:unknown)=>boolean};
const yearLabel = (year:number) => `${year}/${String(year+1).slice(-2)}`;
function frozenStartYear(value:string|null):number|null {
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return null;
  return date.getUTCFullYear()-(date.getUTCMonth()<6?1:0);
}
export default function ProtectedClassTimplans(props:Props) { return <ClassLinks key={`${props.scopeKey}:${props.plan.id}`} {...props}/>; }
function ClassLinks({openRequest=0,scopeKey,returnTo,plan,schoolYear,canPrepare,disabled,onSecurityFailure}:Props) {
  const journalKey=`sp:class-links:v1:${scopeKey}:${plan.id}`;
  const [restored]=useState(()=>{try{const raw=sessionStorage.getItem(journalKey);return {queue:raw?parseClassLinkQueue(JSON.parse(raw),scopeKey,plan.id,plan.unitId,plan.offeringId):null,broken:false};}catch{return {queue:null,broken:true};}});
  const [queue,setQueue]=useState<ClassLinkQueue|null>(restored.queue),[broken,setBroken]=useState(restored.broken);
  const [review,setReview]=useState<ClassLinkQueue|null>(null);
  const queueLocked=!!queue&&!queueComplete(queue)||broken;
  const queueRef=useRef(queue);
  const reviewButton=useRef<HTMLButtonElement>(null);
  function storeQueue(value:ClassLinkQueue){const parsed=parseClassLinkQueue(value,scopeKey,plan.id,plan.unitId,plan.offeringId),raw=JSON.stringify(parsed);sessionStorage.setItem(journalKey,raw);if(sessionStorage.getItem(journalKey)!==raw)throw Error('storage');queueRef.current=parsed;setQueue(parsed);return parsed;}
  function clearQueueJournal(){sessionStorage.removeItem(journalKey);if(sessionStorage.getItem(journalKey)!==null)throw Error('storage');}
  const [open,setOpen]=useState(!!restored.queue||restored.broken),[year,setYear]=useState(restored.queue?.schoolYear??schoolYear),[data,setData]=useState<ClassPlanUnderlag|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [name,setName]=useState(''),[selected,setSelected]=useState<string[]>([]),[confirmation,setConfirmation]=useState<ClassPlanLinkRequest|null>(null);
  const [pending,setPending]=useState<Pending|null>(null),[mfa,setMfa]=useState(false),[uncertain,setUncertain]=useState(false);
  const active=useRef(true),running=useRef(false),generation=useRef(0);
  const yearSelect=useRef<HTMLSelectElement>(null),restoreYearFocus=useRef(false);
  useEffect(()=>{if(!busy&&restoreYearFocus.current){restoreYearFocus.current=false;yearSelect.current?.focus();}},[busy]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  // Unknown command outcomes must be resolved with the same command ID before navigating away.
  useUnsavedChanges(`navigation-block:class-plan:${plan.id}`,busy||uncertain||queueLocked);
  useUnsavedChanges(`class-plan-form:${plan.id}`,name.trim().length>0||!!confirmation||!!review||selected.length>0||queueLocked);
  const valid = data?.plan.id===plan.id && data.plan.unitId===plan.unitId && data.plan.offeringId===plan.offeringId && data.plan.revision===plan.revision && JSON.stringify(data.plan.series??null)===JSON.stringify(plan.series??null);
  const firstYear=data?.plan.startYear??null;
  const sourceYear=frozenStartYear(plan.source.startedOn);
  const consistentStart=sourceYear!==null&&firstYear!==null&&sourceYear===firstYear;
  const allowedYears=consistentStart?[firstYear,firstYear+1,firstYear+2]:[];
  const canManage=valid&&data.schoolYear===year&&data.canManage&&consistentStart&&!error&&!disabled;
  const outsidePlanningYear=consistentStart&&!allowedYears.includes(schoolYear);
  const relative=data?.plan.startYear===null||data?.plan.startYear===undefined?null:year-data.plan.startYear;
  const column:ClassPlanColumn|null=relative!==null&&relative>=0&&relative<=2?(['ar1','ar2','ar3'] as const)[relative]:null;
  async function fetchData(nextYear:number) {
    const input={planId:plan.id,schoolYear:nextYear};
    const result=parseClassPlanUnderlag(await api.post('/api/klasser/underlag',input),input);
    if(result.plan.unitId!==plan.unitId||result.plan.offeringId!==plan.offeringId)throw new Error('wrong_class_scope');
    return result;
  }
  async function load(nextYear=year) {
    if(running.current||uncertain||queueLocked)return;
    restoreYearFocus.current=document.activeElement===yearSelect.current;
    const token=++generation.current;setBusy(true);setError(null);setYear(nextYear);
    try{const result=await fetchData(nextYear);if(active.current&&token===generation.current)setData(result);}
    catch(caught){if(active.current&&token===generation.current&&!onSecurityFailure(caught))setError(caught instanceof ApiError?caught.message:'Klasskopplingarna kunde inte läsas. Försök igen.');}
    finally{if(active.current&&token===generation.current)setBusy(false);}
  }
  const loadRef=useRef(load);
  useLayoutEffect(()=>{loadRef.current=load;});
  useEffect(()=>{
    if(openRequest===0)return;
    let cancelled=false;
    queueMicrotask(()=>{if(active.current&&!cancelled){setOpen(true);void loadRef.current();}});
    return()=>{cancelled=true;};
  },[openRequest]);
  async function execute(command:Pending) {
    if(running.current||disabled||(!uncertain&&!canManage))return;
    running.current=true;setPending(command);setBusy(true);setError(null);setMfa(false);let accepted=false;
    try{
      if(command.kind==='create'){
        const reply=parseClassPlanCreateReply(await api.post('/api/klasser/skapa',command.request),command.request);accepted=true;
        if(active.current){setSelected([reply.id]);setName('');setNotice(`Klassen ${reply.name} är skapad. Välj Koppla klass för att använda timplanen.`);}
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
    if(!data||!column||!canManage||busy||uncertain||queueLocked)return;
    const entries=data.classes.filter(c=>selected.includes(c.id)&&c.startYear===firstYear&&!(c.link?.planId===plan.id&&!c.link.legacy&&c.link.columnId===column)).map(c=>({name:c.name,state:'pending' as const,receipt:null,request:{commandId:crypto.randomUUID(),classId:c.id,schoolYear:year,planId:plan.id,expectedPlanRevision:data.plan.revision,columnId:column,expectedLinkRevision:c.link?.revision??null,previousPlanId:c.link?.planId??null}}));
    if(entries.length)setReview({version:1,scope:scopeKey,planId:plan.id,unitId:plan.unitId,offeringId:plan.offeringId,schoolYear:year,planVersion:data.plan.version,series:data.plan.series??null,entries});
  }
  async function readQueue(initial:ClassLinkQueue){
    const fresh=await fetchData(initial.schoolYear);if(!active.current)return null;
    const checked=reconcileClassLinkQueue(initial,fresh);storeQueue(checked);setData(fresh);
    if(queueComplete(checked)){clearQueueJournal();setSelected([]);setNotice(`Alla ${checked.entries.length} klasskopplingar är sparade och återlästa för ${yearLabel(checked.schoolYear)}.`);}
    return checked;
  }
  async function runQueue(initial:ClassLinkQueue,send:boolean){
    if(running.current||disabled||broken)return;
    running.current=true;setBusy(true);setError(null);setNotice(null);setMfa(false);
    let current=initial;
    try{
      // Persist all reviewed commands before the first network request.
      current=storeQueue(current);setReview(null);
      const checked=await readQueue(current);if(!checked||!active.current)return;current=checked;
      if(!send||queueComplete(current))return;
      if(current.entries.some(e=>e.state==='conflict')&&!queueHasUnknown(current)){setError('En koppling har ändrats. Sparade resultat behålls. Granska återstående klasser på nytt.');return;}
      while(!queueComplete(current)){
        const recovering=current.entries.findIndex(e=>e.state==='unknown');
        const index=recovering>=0?recovering:current.entries.findIndex(e=>e.state==='pending');if(index<0)return;
        current=storeQueue(updateQueueEntry(current,index,{state:'unknown'}));
        try{
          const request=current.entries[index].request;
          const receipt=parseClassPlanLinkReply(await api.post('/api/klasser/koppla',request),request);
          if(!active.current)return;
          current=storeQueue(updateQueueEntry(current,index,{state:'receipt',receipt}));
          const checked=await readQueue(current);if(!checked||!active.current)return;current=checked;
          if(current.entries.some(e=>e.state==='conflict')){setError('En koppling har ändrats. Ingen tidigare koppling skrivs tillbaka automatiskt.');return;}
        }catch(caught){
          if(!active.current)return;
          if(onSecurityFailure(caught)){setData(null);setQueue(null);setOpen(false);return;}
          if(caught instanceof ApiError&&caught.hasExplicitCode&&caught.status===409){current=storeQueue(updateQueueEntry(current,index,{state:'conflict'}));setError(caught.message+' Läs om och granska återstående klasser på nytt.');}
          else{setMfa(caught instanceof ApiError&&caught.code==='mfa_required');setError('Sparandet kan inte avgöras ännu. Kontrollera samma begäran innan du fortsätter.');}
          return;
        }
      }
    }catch(caught){
      if(active.current){if(onSecurityFailure(caught)){setData(null);setQueue(null);setOpen(false);}else{setError('Kopplingarnas sparstatus kunde inte bevaras eller läsas. Inga fler klasser skickas.');if(!queueRef.current)setBroken(true);}}
    }finally{running.current=false;if(active.current)setBusy(false);}
  }
  const runQueueRef=useRef(runQueue);
  useLayoutEffect(()=>{runQueueRef.current=runQueue;});
  useEffect(()=>{if(restored.queue)void runQueueRef.current(restored.queue,false);},[restored.queue]);
  function finishQueue(){
    if(!queue||queueHasUnknown(queue)||busy)return;
    try{clearQueueJournal();setQueue(null);queueRef.current=null;setSelected([]);setError(null);setNotice('Sparade kopplingar behålls. Välj och granska de klasser som återstår.');}
    catch{setBroken(true);setError('Sparstatus kunde inte avslutas i den här fliken.');}
  }
  const planLabel=plan.series?.name??'Timplan';
  if(!['faststalld','ersatt'].includes(plan.status))return null;
  return <section className="class-timplans" aria-label="Klasser och läsår">
    <div className="class-plan-heading"><div><h2>Klasser och läsår</h2><p>Klassen använder den version du väljer. En ny timplansversion flyttar inte befintliga klasskopplingar.</p></div>
      <Button variant="outline" disabled={disabled||busy||uncertain||queueLocked} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?'Dölj klasskopplingar':canPrepare&&plan.status==='faststalld'?'Koppla klass':'Visa klasskopplingar'}</Button></div>
    {open&&<div aria-busy={busy}>
      <dl className="class-plan-dates">
        <div><dt>Valt planeringsår</dt><dd>{yearLabel(schoolYear)}</dd></div>
        <div><dt>Fryst utbildningsstart</dt><dd>{plan.source.startedOn??'Saknas'}</dd></div>
        <div><dt>Första läsår</dt><dd>{firstYear===null?'Okänt':yearLabel(firstYear)}</dd></div>
      </dl>
      {outsidePlanningYear&&<p className="class-plan-year-notice">Planeringsåret {yearLabel(schoolYear)} ligger utanför utbildningens tre läsår. Välj ett giltigt läsår för klasskopplingen. Ditt planeringsår ändras inte.</p>}
      <div className="class-plan-controls"><label>Läsår för klassens timplan<select ref={yearSelect} aria-label="Läsår för klasskoppling" value={allowedYears.includes(year)?year:''} disabled={busy||uncertain||queueLocked||disabled||!consistentStart} onChange={event=>{setConfirmation(null);setSelected([]);void load(Number(event.target.value));}}>
        {!allowedYears.includes(year)&&<option value="" disabled>Välj ett giltigt läsår</option>}
        {allowedYears.map((value,index)=><option key={value} value={value}>Årskurs {index+1} · {yearLabel(value)}</option>)}
      </select></label><Button variant="outline" disabled={busy||uncertain||queueLocked||disabled} onClick={()=>void load()}>Läs om klasskopplingar</Button></div>
      {broken&&<p role="alert">Den sparade kopplingsbegäran kan inte verifieras. Inget nytt skickas från den här fliken.</p>}{error&&<p role="alert">{error}</p>}{mfa&&<MfaStepUpNotice message={error??'Verifiera med engångskod för att fortsätta.'} returnTo={returnTo} detail={queue?'Den granskade begäran finns kvar. Kontrollera sparstatus efter återkomsten.':undefined}/>}
      {notice&&<output>{notice}</output>}{uncertain&&pending&&<Button disabled={busy||disabled} onClick={()=>void execute(pending)}>Hämta sparstatus</Button>}
      {busy&&!data&&<output>Hämtar klasskopplingar…</output>}
      {data&&<>
        {!consistentStart&&<p role="alert">Utbildningsstart och första läsår saknas eller stämmer inte överens. Läs om timplanen och kontrollera underlaget innan du skapar eller kopplar en klass.</p>}
        {!valid&&<p role="alert">Timplanen har ändrats. Läs om timplanen innan du ändrar en klasskoppling.</p>}
        {data.blockers.length>0&&<ul>{data.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        <h3>Kopplade till version {plan.version}</h3>
        {data.linkedClasses.length===0?<p>Inga klasser är kopplade till den här versionen.</p>:<ul className="class-plan-links">{data.linkedClasses.map(link=><li key={`${link.className}:${link.schoolYear}`}><strong>{link.className}</strong><span>{yearLabel(link.schoolYear)} · Årskurs {link.columnId.slice(2)} · Version {plan.version}</span>{link.legacy&&<span>Äldre namnkoppling – välj klassen nedan för att bekräfta kopplingen.</span>}</li>)}</ul>}
        <h3>Klasskopplingar för valt läsår</h3>
        <p>{planLabel} · version {plan.version} · {yearLabel(year)}. Markeringar sparar inga kopplingar.</p>
        <ul className="class-link-choices">{data.classes.filter(c=>c.startYear===data.plan.startYear).map(c=>{const already=!!column&&c.link?.planId===plan.id&&!c.link.legacy&&c.link.columnId===column;return <li key={c.id}>
          <label><input type="checkbox" aria-label={`Välj ${c.name}`} checked={selected.includes(c.id)} disabled={!canManage||!column||busy||uncertain||queueLocked||already} onChange={e=>setSelected(previous=>e.target.checked?[...previous,c.id]:previous.filter(id=>id!==c.id))}/><strong>{c.name}</strong></label>
          <span>{already?'Redan kopplad till denna timplan':c.link?`${c.link.series?.name??'Timplan'} · version ${c.link.version}${c.link.legacy?' · äldre namnkoppling':''}`:'Ingen timplan för valt läsår'}</span>
        </li>;})}</ul>
        {canManage&&column&&!queueLocked&&<><Button ref={reviewButton} disabled={busy||uncertain||selected.length===0} onClick={prepareLink}>Koppla valda klasser ({selected.length})</Button>
          <form className="class-plan-create" onSubmit={event=>{event.preventDefault();if(!busy&&!uncertain&&name.trim()&&data.plan.startYear!==null)void execute({kind:'create',request:{commandId:crypto.randomUUID(),planId:plan.id,expectedPlanRevision:data.plan.revision,name:name.trim().toUpperCase(),startYear:data.plan.startYear}});}}>
            <h3>Skapa klass för utbildningen</h3><p>{data.plan.educationName} · {plan.schoolName} · Första läsår {data.plan.startYear===null?'okänt':yearLabel(data.plan.startYear)}. Klassen skapas utan elever.</p><div className="class-plan-controls"><label>Klassnamn<input value={name} maxLength={60} disabled={busy||uncertain||queueLocked} onChange={event=>setName(event.target.value)} placeholder="Till exempel SA26A"/></label><Button type="submit" disabled={busy||uncertain||queueLocked||!name.trim()}>Skapa klass</Button></div>
          </form>
        </>}
      </>}
    </div>}
    {queue&&<section className="class-link-progress" aria-label="Resultat per klass"><h3>{queue.series?.name??'Timplan'} · version {queue.planVersion} · {yearLabel(queue.schoolYear)}</h3><p>Klasserna sparas en i taget. Redan sparade kopplingar behålls om något avbryts.</p><ul>{queue.entries.map(e=><li key={e.request.classId}><strong>{e.name}</strong><span>{({pending:'Kvar att koppla',unknown:'Okänd sparstatus',receipt:'Kvitto mottaget – återläsning återstår',saved:'Sparad och återläst',conflict:'Konflikt – granska på nytt'})[e.state]}</span></li>)}</ul>
      {!queueComplete(queue)&&<div className="class-plan-controls"><Button disabled={busy||disabled||broken} onClick={()=>void runQueue(queue,true)}>Kontrollera och fortsätt</Button>{!queueHasUnknown(queue)&&<Button variant="outline" disabled={busy||broken} onClick={finishQueue}>Avsluta och granska på nytt</Button>}</div>}
    </section>}
    <Dialog open={!!review} onOpenChange={value=>{if(!value&&!busy){setReview(null);requestAnimationFrame(()=>reviewButton.current?.focus());}}}><DialogContent className="class-link-dialog"><DialogTitle>Koppla {review?.entries.length} klasser</DialogTitle><DialogDescription>{planLabel} · version {plan.version} · {plan.schoolName} · {yearLabel(year)}</DialogDescription>
      {error&&<p role="alert">{error}</p>}<ul>{review?.entries.map(e=>{const old=data?.classes.find(c=>c.id===e.request.classId)?.link;return <li key={e.request.classId}><strong>{e.name}</strong><p>Nuvarande koppling: {old?`${old.series?.name??'Timplan'} · version ${old.version}`:'ingen timplan'} → {planLabel} · version {plan.version}, årskurs {e.request.columnId.slice(2)}.</p></li>;})}</ul>
      <p>Övriga klasser och läsår behåller sina kopplingar. Varje klass sparas separat; vid avbrott visas vad som sparats och vad som återstår.</p>
      <div className="class-plan-controls"><Button variant="outline" disabled={busy} onClick={()=>{setReview(null);requestAnimationFrame(()=>reviewButton.current?.focus());}}>Avbryt</Button><Button disabled={busy||disabled} onClick={()=>review&&void runQueue(review,true)}>Bekräfta koppling</Button></div>
    </DialogContent></Dialog>
  </section>;
}
